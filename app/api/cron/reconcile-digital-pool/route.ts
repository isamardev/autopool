import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { reconcileDigitalPoolSystem } from "@/lib/digital-pool-credential-db";

/**
 * Backfill Digital Pool for members who already reached min binary level without opening the dashboard:
 * credentials + placement timestamps + completed L1 rewards.
 * Set CRON_SECRET in .env and call: GET /api/cron/reconcile-digital-pool with Authorization: Bearer <CRON_SECRET>
 * Optional: ?take=200 (max 500 per run).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const url = new URL(req.url);
    const takeRaw = url.searchParams.get("take");
    const take = takeRaw ? Number(takeRaw) : undefined;
    const db = getDb();
    const result = await reconcileDigitalPoolSystem(db, { take: Number.isFinite(take) ? take : undefined });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Cron failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
