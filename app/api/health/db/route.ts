import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Quick check that Prisma can reach Postgres (Neon) on Vercel — use after deploy if login/API fails. */
export async function GET() {
  try {
    await getDb().$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[health/db]", e);
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
