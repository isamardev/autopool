import { NextResponse } from "next/server";
import crypto from "crypto";
import { getDb } from "@/lib/db";
import { runFixedPayoutEngine } from "@/lib/mlm-logic";

function isActivatedMemberStatus(s) {
  return s === "active" || s === "admin" || s === "withdraw_suspend";
}

export async function POST(req) {
  try {
    const body = await req.json();
    const status = String(body?.status ?? "").toLowerCase();
    const amount = Number(body?.amount ?? 0);
    const userId = String(body?.userId ?? "");
    const orderId = String(body?.orderId ?? "");
    const signature = String(body?.signature ?? "");

    if (!userId || !orderId || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const apiKey = process.env.CRYPTOMUS_API_KEY || "";
    if (apiKey && apiKey !== "test") {
      const expected = crypto.createHmac("sha256", apiKey).update(JSON.stringify({ status, amount, userId, orderId })).digest("hex");
      if (expected !== signature) {
        return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
      }
    }

    const db = getDb();

    if (status === "paid") {
      const u = await db.user.findUnique({ where: { id: userId }, select: { status: true } });
      const distributeMlm = isActivatedMemberStatus(u?.status);
      const payout = await runFixedPayoutEngine({
        sourceUserId: userId,
        depositAmount: amount,
        note: `Webhook ${orderId}`,
        distributeMlm,
      });
      return NextResponse.json({ ok: true, payout });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
  }
}
