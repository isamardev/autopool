import { NextResponse } from "next/server";
import { auth } from "@/auth";
import crypto from "crypto";
import { getDb } from "@/lib/db";
import { MIN_DEPOSIT_USDT } from "@/lib/wallet-limits";

export async function POST(req) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const amount = Number(body?.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }
    if (amount < MIN_DEPOSIT_USDT) {
      return NextResponse.json({ error: `Minimum deposit is ${MIN_DEPOSIT_USDT}` }, { status: 400 });
    }

    const apiKey = process.env.CRYPTOMUS_API_KEY || "";
    const merchantId = process.env.CRYPTOMUS_MERCHANT_ID || "";

    const orderId = crypto.randomUUID();
    const payload = {
      amount: String(amount),
      currency: "USDT",
      network: "BNB",
      order_id: orderId,
      merchant: merchantId,
    };

    const db = getDb();

    if (!apiKey || apiKey === "test") {
      const url = new URL("/payment-mock", req.url);
      url.searchParams.set("order_id", orderId);
      url.searchParams.set("amount", String(amount));
      url.searchParams.set("userId", session.user.id);
      return NextResponse.json({ redirectUrl: url.toString() });
    }

    const sign = crypto.createHmac("sha256", apiKey).update(JSON.stringify(payload)).digest("hex");
    const res = await fetch("https://api.cryptomus.com/v1/payment", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        sign,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({ error: "Payment init failed", detail: data }, { status: 400 });
    }

    const redirectUrl =
      data?.payment_url ||
      data?.result?.url ||
      data?.url ||
      "/payment-mock";

    return NextResponse.json({ redirectUrl });
  } catch {
    return NextResponse.json({ error: "Checkout failed" }, { status: 500 });
  }
}
