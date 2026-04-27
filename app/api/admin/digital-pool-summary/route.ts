import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAdminSection } from "@/lib/admin-api-guard";

/** Members with a Digital Pool login card row (`DigitalPoolCredential`). */
export async function GET() {
  try {
    const gateWd = await requireAdminSection("withdrawals");
    const gatePay = await requireAdminSection("payments");
    if (!gateWd.ok && !gatePay.ok) return gateWd.response;

    const db = getDb();
    let totalPoolUsers = 0;
    try {
      totalPoolUsers = await db.digitalPoolCredential.count();
    } catch {
      totalPoolUsers = 0;
    }

    return NextResponse.json({ totalPoolUsers });
  } catch (e) {
    console.error("GET /api/admin/digital-pool-summary:", e);
    return NextResponse.json({ error: "Failed to load Digital Pool summary" }, { status: 500 });
  }
}
