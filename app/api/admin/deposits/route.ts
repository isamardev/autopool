import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAdminSection } from "@/lib/admin-api-guard";

export async function GET(req: Request) {
  try {
    const gate = await requireAdminSection("deposits");
    if (!gate.ok) return gate.response;
    const url = new URL(req.url);
    const status = url.searchParams.get("status") || "";
    const valid = ["pending", "confirmed", "rejected"];
    const filter = valid.includes(status) ? status : undefined;
    const db = getDb();
    const items = await db.deposit.findMany({
      where: filter ? { status: filter as any } : {},
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { user: { select: { id: true, username: true, email: true, walletAddress: true } } },
    });
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ error: "Failed to fetch deposits" }, { status: 500 });
  }
}

