import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getUserApiContext } from "@/lib/user-api-auth";

/** Distinguishes deposit ladder / % MLM / activation lines — same L-level + amount can otherwise look like duplicates. */
function commissionDisplayKind(note: string | null | undefined): { key: string; label: string } {
  const n = String(note ?? "");
  if (/activation commission from/i.test(n)) return { key: "activation", label: "Account activation" };
  if (/fixed payout from/i.test(n)) return { key: "deposit_fixed", label: "Deposit (fixed $0.50 ladder)" };
  if (/^L\d+\s+commission from/i.test(n)) return { key: "deposit_percent", label: "Deposit (level %)" };
  if (/Admin activation share from|Activation fee to platform from/i.test(n)) {
    return { key: "platform_activation", label: "Platform (activation remainder)" };
  }
  if (/Admin share from/i.test(n)) return { key: "admin_deposit", label: "Platform (deposit share)" };
  return { key: "other", label: "Commission" };
}

/** Credits to `digitalPoolWithdrawBalance` (see `lib/digital-pool-l1-reward.ts`). */
function digitalPoolIncomeDisplayKind(note: string | null | undefined): { key: string; label: string } {
  const n = String(note ?? "");
  if (/^Digital Pool L1 complete/i.test(n)) return { key: "dp_l1", label: "Digital Pool — L1 complete" };
  if (/^Digital Pool \d+ position\(s\) complete/i.test(n)) {
    return { key: "dp_positions", label: "Digital Pool — position reward(s)" };
  }
  return { key: "dp_credit", label: "Digital Pool — pool wallet credit" };
}

// GET /api/user/commissions
// ?digitalPool=1 — only Digital Pool panel income (credits to pool withdraw wallet), not main MLM commissions
export async function GET(req: Request) {
  try {
    const ctx = await getUserApiContext(req);
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

    const digitalPool = new URL(req.url).searchParams.get("digitalPool");
    const poolOnly = digitalPool === "1" || digitalPool === "true";

    const db = getDb();
    const commissions = await db.transaction.findMany({
      where: poolOnly
        ? {
            userId: ctx.userId,
            type: "adjustment",
            amount: { gt: 0 },
            AND: [
              { note: { startsWith: "Digital Pool " } },
              { NOT: { note: { startsWith: "Digital Pool withdrawal" } } },
            ],
          }
        : {
            userId: ctx.userId,
            type: "commission",
          },
      include: {
        sourceUser: {
          select: {
            username: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 100,
    });

    const items = commissions.map((c) => {
      const kind = poolOnly ? digitalPoolIncomeDisplayKind(c.note) : commissionDisplayKind(c.note);
      const selfCredit = c.sourceUserId === c.userId;
      return {
        id: c.id,
        fromUser: poolOnly && selfCredit ? "" : c.sourceUser?.username || "Unknown",
        fromEmail: c.sourceUser?.email || "Unknown",
        level: c.level,
        amount: c.amount,
        date: c.createdAt,
        note: c.note,
        kind: kind.key,
        kindLabel: kind.label,
      };
    });

    return NextResponse.json({ success: true, items, scope: poolOnly ? "digitalPool" : "commissions" });
  } catch (error) {
    console.error("Commission fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch commissions" }, { status: 500 });
  }
}
