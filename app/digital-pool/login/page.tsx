"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "react-toastify";
import { FaEye, FaEyeSlash } from "react-icons/fa";

export default function DigitalPoolLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/digital-pool/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(typeof data?.error === "string" ? data.error : "Login failed");
        return;
      }
      toast.success("Welcome");
      router.push("/digital-pool");
      router.refresh();
    } catch {
      toast.error("Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen max-w-[100vw] overflow-x-hidden bg-transparent text-foreground">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-md rounded-3xl bg-card p-6 shadow-[0_0_20px_rgba(1,163,151,0.12)] ring-1 ring-ring sm:p-8">
          <div className="text-center">
            <img src="/logo.jpeg" alt="" className="mx-auto h-8 w-auto rounded-md ring-1 ring-ring sm:h-9" />
            <h1 className="mt-4 text-xl font-bold text-primary sm:text-2xl">Digital Pool login</h1>
          </div>

          <form onSubmit={onSubmit} className="mt-6 grid gap-4">
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-subtext">Email</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11 w-full rounded-2xl bg-background px-4 text-sm ring-1 ring-ring outline-none focus:ring-2 focus:ring-primary/30"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="text-xs font-medium text-subtext">Password</span>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-11 w-full rounded-2xl bg-background py-2 pl-4 pr-12 text-sm ring-1 ring-ring outline-none focus:ring-2 focus:ring-primary/30"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl text-subtext transition hover:bg-muted hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <FaEyeSlash size={18} /> : <FaEye size={18} />}
                </button>
              </div>
            </label>
            <button
              type="submit"
              disabled={busy}
              className="mt-1 inline-flex h-11 w-full items-center justify-center rounded-2xl bg-primary px-5 text-sm font-medium text-white shadow-sm ring-1 ring-primary/20 transition hover:bg-primary/90 disabled:opacity-60"
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="mt-5 text-center text-xs text-subtext">
            <Link href="/" className="font-medium text-primary underline-offset-2 hover:underline">
              Main site
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
