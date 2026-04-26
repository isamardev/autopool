"use client";
import { useState } from "react";
import { toast } from "react-toastify";

export default function DepositButton({ amount = 10, userId = "", fullWidth = false, label = "Pay", onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const onClick = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/deposit/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceUserId: userId, amount: Number(amount), note: "Deposit" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data?.error === "string" ? data.error : "Deposit failed");
        toast.error(typeof data?.error === "string" ? data.error : "Deposit failed");
        setLoading(false);
        return;
      }
      toast.success("Deposit credited");
      if (typeof window !== "undefined") {
        try {
          window.dispatchEvent(new Event("deposit:updated"));
        } catch {}
      }
      if (onSuccess) onSuccess();
    } catch {
      setError("Deposit failed");
      toast.error("Deposit failed");
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="grid gap-2 w-full">
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className={`inline-flex h-11 items-center justify-center rounded-2xl bg-primary px-5 text-sm font-medium text-white shadow-sm ring-1 ring-primary/20 transition hover:bg-primary/90 disabled:opacity-60 ${fullWidth ? "w-full" : ""}`}
      >
        {loading ? "Processing..." : label}
      </button>
      {error ? (
        <div className="rounded-2xl bg-muted p-3 text-xs text-subtext ring-1 ring-ring">
          {error}
        </div>
      ) : null}
    </div>
  );
}
