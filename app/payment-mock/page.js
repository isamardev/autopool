"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "react-toastify";

function PaymentMockPageContent() {
  const sp = useSearchParams();
  const [loading, setLoading] = useState(false);
  const orderId = sp.get("order_id") || "mock-order";
  const amount = Number(sp.get("amount") || "10");
  const userId = sp.get("userId") || "mock-user";
  const [msg, setMsg] = useState("");

  const triggerPaid = async () => {
    setLoading(true);
    setMsg("");
    try {
      const res = await fetch("/api/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "paid",
          amount,
          userId,
          orderId,
          signature: "mock",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(typeof data?.error === "string" ? data.error : "Failed");
        toast.error(typeof data?.error === "string" ? data.error : "Payment failed");
        return;
      }
      setMsg("Payment simulated");
      toast.success("Deposit confirmed");
    } catch {
      setMsg("Failed");
      toast.error("Payment failed");
    }
    setLoading(false);
  };

  return (
    <div className="mx-auto max-w-md px-6 py-10">
      <div className="rounded-3xl bg-card p-6 shadow-sm ring-1 ring-ring">
        <div className="text-lg font-semibold">Mock Payment</div>
        <div className="mt-2 text-sm text-subtext">Order {orderId}</div>
        <div className="mt-2 text-sm text-subtext">Amount {amount}</div>
        <div className="mt-2 text-sm text-subtext">User {userId}</div>
        <button
          type="button"
          onClick={triggerPaid}
          disabled={loading}
          className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-2xl bg-primary px-5 text-sm font-medium text-white shadow-sm ring-1 ring-primary/20 transition hover:bg-primary/90"
        >
          {loading ? "Processing..." : "Simulate Paid"}
        </button>
        {msg ? <div className="mt-4 rounded-2xl bg-muted p-4 text-sm text-subtext ring-1 ring-ring">{msg}</div> : null}
      </div>
    </div>
  );
}

export default function PaymentMockPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-md px-6 py-10" />}>
      <PaymentMockPageContent />
    </Suspense>
  );
}
