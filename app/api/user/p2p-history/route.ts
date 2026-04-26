import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getUserApiContext } from "@/lib/user-api-auth";

/** Matches notes written by `p2p-transfer` and any legacy formats. */
function counterpartyNameFromP2pNote(note: string | null): string {
  if (!note) return "";
  const n = note.trim();
  const mNewTo = /^P2P to (.+) \(to (?:USDT|Withdraw) wallet\)$/i.exec(n);
  if (mNewTo) return mNewTo[1].trim();
  const mNewFrom = /^P2P from (.+) \(to (?:USDT|Withdraw) wallet\)$/i.exec(n);
  if (mNewFrom) return mNewFrom[1].trim();
  const mOldTo = /^P2P to (.+) \(([a-z0-9]+)\)/i.exec(n);
  if (mOldTo) return `${mOldTo[1].trim()} (${mOldTo[2]})`;
  const mOldFrom = /^P2P from (.+) \(([a-z0-9]+)\)/i.exec(n);
  if (mOldFrom) return `${mOldFrom[1].trim()} (${mOldFrom[2]})`;
  return "";
}

export async function GET(req: Request) {
  try {
    const ctx = await getUserApiContext(req);
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    if (ctx.effectiveStatus === "blocked") {
      return NextResponse.json({ error: "Account blocked" }, { status: 403 });
    }

    const db = getDb();
    const userId = ctx.userId;

    const items = await db.transaction.findMany({
      where: {
        userId,
        type: "adjustment",
        note: { startsWith: "P2P " },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    const needSourceLookup = new Set<string>();
    for (const t of items) {
      const amt = Number(t.amount);
      const fromNote = counterpartyNameFromP2pNote(t.note);
      if (fromNote) continue;
      if (amt > 0 && t.sourceUserId && t.sourceUserId !== t.userId) {
        needSourceLookup.add(t.sourceUserId);
      }
    }

    const counterpartUsers =
      needSourceLookup.size > 0
        ? await db.user.findMany({
            where: { id: { in: [...needSourceLookup] } },
            select: { id: true, username: true },
          })
        : [];
    const usernameById = new Map(counterpartUsers.map((u) => [u.id, u.username]));

    const mapped = items.map((t) => {
      const amt = Number(t.amount);
      const dir = amt < 0 ? "sent" : "received";
      let counterparty = counterpartyNameFromP2pNote(t.note);
      if (!counterparty && dir === "received" && t.sourceUserId && t.sourceUserId !== t.userId) {
        counterparty = usernameById.get(t.sourceUserId) || "";
      }
      return {
        id: t.id,
        direction: dir,
        amount: Math.abs(amt),
        counterparty: counterparty || "-",
        createdAt: t.createdAt,
        note: t.note,
      };
    });

    return NextResponse.json({ items: mapped });
  } catch {
    return NextResponse.json({ error: "Failed to fetch P2P history" }, { status: 500 });
  }
}
