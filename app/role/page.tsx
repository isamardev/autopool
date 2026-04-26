"use client";

import { useState, useEffect, useMemo, useRef, type FormEvent } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { markSessionTabActive } from "@/lib/session-tab";
import { getAuthRedirectUrl } from "@/lib/auth-redirect-url";
import { useRouter } from "next/navigation";
import { FaEye, FaEyeSlash, FaSignOutAlt } from "react-icons/fa";
import { AdminPanelClient } from "../admin/AdminPanelClient";

export default function RoleLoginPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const roleMenuRef = useRef<HTMLDivElement>(null);

  const initials = useMemo(() => {
    const e = session?.user?.email ?? session?.user?.name ?? "?";
    return String(e).slice(0, 2).toUpperCase();
  }, [session?.user?.email, session?.user?.name]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (roleMenuRef.current && !roleMenuRef.current.contains(event.target as Node)) {
        setRoleMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password) {
      setError("Email and password are required");
      return;
    }
    setLoading(true);
    try {
      if (session?.user?.status && session.user.status !== "admin") {
        await signOut({ redirect: false });
      }
      const result = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        staffRoleLogin: "true",
        redirect: false,
      });
      if (result?.error) {
        setError("Invalid credentials");
        return;
      }
      markSessionTabActive();
      router.refresh();
    } catch {
      setError("Login failed");
    } finally {
      setLoading(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-transparent text-foreground">
        <div className="text-sm text-subtext">Loading…</div>
      </div>
    );
  }

  if (status === "authenticated" && session?.user?.status === "admin") {
    if (!session.user.adminFullAccess && (session.user.adminAllowedSections?.length ?? 0) === 0) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-transparent p-6 text-foreground">
          <div className="w-full max-w-md rounded-3xl bg-card p-8 text-center shadow-xl ring-1 ring-ring">
            <div className="text-lg font-semibold text-foreground">No admin panel access</div>
            <p className="mt-2 text-sm text-subtext">
              This account has no sections assigned. Ask a super admin to set a role for you.
            </p>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: getAuthRedirectUrl("/") })}
              className="mt-6 w-full rounded-full bg-primary py-3 text-sm font-medium text-white ring-1 ring-primary/20 transition hover:bg-primary/90"
            >
              Logout
            </button>
          </div>
        </div>
      );
    }
    return <AdminPanelClient />;
  }

  const showMemberMenu = status === "authenticated" && session?.user?.status !== "admin";

  return (
    <div className="flex min-h-screen flex-col bg-transparent text-foreground">
      {showMemberMenu ? (
        <header className="flex justify-end px-4 pt-4 sm:px-6">
          <div className="relative flex min-w-0 items-center gap-2" ref={roleMenuRef}>
            <button
              type="button"
              onClick={() => setRoleMenuOpen((v) => !v)}
              className="flex max-w-full items-center gap-2 rounded-2xl p-1.5 transition hover:bg-muted"
              aria-expanded={roleMenuOpen}
              aria-haspopup="menu"
            >
              <div className="min-w-0 text-right">
                <div className="truncate text-sm font-medium">{session?.user?.name ?? "User"}</div>
                <div className="truncate text-[10px] sm:text-xs text-subtext">{session?.user?.email ?? "-"}</div>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white shadow-sm ring-1 ring-primary/20">
                {initials}
              </div>
            </button>
            {roleMenuOpen ? (
              <div
                className="absolute right-0 top-full z-50 mt-2 w-48 rounded-2xl bg-card p-1 shadow-xl ring-1 ring-ring animate-in fade-in slide-in-from-top-2 duration-200"
                role="menu"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setRoleMenuOpen(false);
                    signOut({ callbackUrl: getAuthRedirectUrl("/") });
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-left text-sm font-medium text-red-500 transition hover:bg-red-500/10"
                >
                  <FaSignOutAlt className="text-red-500" size={18} aria-hidden />
                  Logout
                </button>
              </div>
            ) : null}
          </div>
        </header>
      ) : null}

      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="rounded-3xl bg-card p-8 shadow-xl ring-1 ring-ring">
            <h1 className="text-center text-xl font-semibold">Login</h1>
            {showMemberMenu ? (
              <p className="mt-3 text-center text-xs text-subtext">
                You are signed in as a member. Enter staff admin email and password below — your session will switch to
                admin.
              </p>
            ) : null}
            <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
              <label className="block">
                <span className="text-sm text-foreground">Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  className="mt-1.5 w-full rounded-2xl bg-background px-4 py-3 text-sm text-foreground ring-1 ring-ring outline-none focus:ring-2 focus:ring-primary/30"
                  required
                />
              </label>
              <label className="block">
                <span className="text-sm text-foreground">Password</span>
                <div className="relative mt-1.5">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    className="w-full rounded-2xl bg-background py-3 pl-4 pr-12 text-sm text-foreground ring-1 ring-ring outline-none focus:ring-2 focus:ring-primary/30"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-0 flex items-center px-4 text-subtext hover:text-foreground"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <FaEyeSlash className="h-4 w-4" /> : <FaEye className="h-4 w-4" />}
                  </button>
                </div>
              </label>
              {error ? <p className="text-center text-sm text-red-500">{error}</p> : null}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-full bg-primary py-3 text-sm font-medium text-white ring-1 ring-primary/20 transition hover:bg-primary/90 disabled:opacity-50"
              >
                {loading ? "…" : "Login"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
