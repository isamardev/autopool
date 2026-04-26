"use client";

import { useState, type FormEvent } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import { markSessionTabActive } from "@/lib/session-tab";

export default function AdminLoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleAdminLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      email: email.trim().toLowerCase(),
      password,
      redirect: false,
    });

    if (result?.error) {
      setError("Invalid admin credentials");
    } else {
      markSessionTabActive();
      router.push("/admin");
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-transparent">
      <div className="w-full max-w-md p-6">
        <div className="rounded-3xl bg-card p-8 shadow-xl ring-1 ring-ring">
          <h1 className="text-2xl font-semibold text-center">Digital Community Magnet</h1>
          <p className="mt-1 text-center text-sm font-medium text-subtext">Admin login</p>
          <p className="mt-2 mb-6 text-center text-sm text-subtext">
            Sign in with a staff account to manage members, deposits, and withdrawals.
          </p>

          <form onSubmit={handleAdminLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Admin email</label>
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-2xl bg-background px-4 py-3 text-foreground ring-1 ring-ring outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="admin@yourdomain.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-2xl bg-background py-3 pl-4 pr-12 text-foreground ring-1 ring-ring outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="Enter admin password"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-4 text-subtext transition hover:text-foreground"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <FaEyeSlash className="h-4 w-4" /> : <FaEye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && <div className="text-red-500 text-sm text-center">{error}</div>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-full bg-primary py-3 text-white font-medium ring-1 ring-primary/20 transition hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? "Logging in..." : "Admin Login"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
