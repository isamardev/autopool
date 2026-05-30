"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import { FaSignOutAlt, FaUserCircle } from "react-icons/fa";
import type { DigitalPoolSessionPayload } from "@/lib/digital-pool-session";
import { IMPERSONATION_STORAGE_KEY } from "@/lib/session-tab";

const PROFILE_LINKS = [
  { href: "/digital-pool/profile/update", label: "Update Profile" },
  { href: "/digital-pool/profile/security", label: "Security Code" },
  { href: "/digital-pool/profile/withdraw-address", label: "Withdrawal Address" },
] as const;

export function DigitalPoolShell({
  session: initialSession,
  children,
}: {
  session: DigitalPoolSessionPayload | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<DigitalPoolSessionPayload | null>(initialSession);
  const [impersonating, setImpersonating] = useState(false);
  const [checkingToken, setCheckingToken] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(pathname.startsWith("/digital-pool/profile"));
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (pathname.startsWith("/digital-pool/profile")) setProfileOpen(true);
  }, [pathname]);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    
    const url = new URL(window.location.href);
    const imp = url.searchParams.get("imp");
    if (imp) {
      sessionStorage.setItem(IMPERSONATION_STORAGE_KEY, imp);
      const cleanUrl = window.location.pathname + window.location.hash;
      window.history.replaceState({}, "", cleanUrl);
    }
    
    const token = imp || sessionStorage.getItem(IMPERSONATION_STORAGE_KEY);
    
    if (token) {
      setImpersonating(true);
      setCheckingToken(false); // Render children immediately if we have a token

      const orig = window.fetch.bind(window);
      window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
        let u = "";
        if (typeof input === "string") u = input;
        else if (input instanceof URL) u = input.href;
        else u = (input as Request).url;
        if (u.startsWith("/api/")) {
          const h = new Headers(init?.headers);
          if (!h.has("Authorization")) h.set("Authorization", `Bearer ${token}`);
          return orig(input, { ...init, headers: h });
        }
        return orig(input, init);
      };

      // Background fetch to populate session info (username/email) for the header
      if (!session) {
        fetch("/api/user/dashboard")
          .then((res) => res.json())
          .then((data) => {
            if (data?.id) {
              setSession({
                userId: data.id,
                username: data.username,
                email: data.email,
              });
            }
            // If failed, we don't redirect. We stay in impersonation mode.
          })
          .catch(() => {
            /* ignore background fetch failure */
          });
      }
      
      return () => {
        window.fetch = orig;
      };
    } else {
      setCheckingToken(false);
      if (!session && !pathname.includes("/digital-pool/login")) {
        router.push("/digital-pool/login");
      }
    }
  }, [session, pathname, router]);

  useEffect(() => {
    try {
      if (sessionStorage.getItem("digital_pool_welcome_toast") === "1") {
        sessionStorage.removeItem("digital_pool_welcome_toast");
        toast.success("Welcome");
      }
    } catch {
      /* ignore */
    }
  }, []);

  const initials = useMemo(() => {
    const name = session?.username ?? "";
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    const a = parts[0]?.[0] ?? "U";
    const b = parts[1]?.[0] ?? parts[0]?.[1] ?? "P";
    return `${a}${b}`.toUpperCase();
  }, [session?.username]);

  const isHome = pathname === "/digital-pool" || pathname === "/digital-pool/";
  const isNetwork = pathname.startsWith("/digital-pool/network");
  const isIncome = pathname.startsWith("/digital-pool/income");
  const isProfile = pathname.startsWith("/digital-pool/profile");
  const isWithdraw = pathname.startsWith("/digital-pool/withdraw");

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileNavOpen]);

  const logout = async () => {
    if (logoutBusy) return;
    setLogoutBusy(true);
    try {
      if (impersonating) {
        sessionStorage.removeItem(IMPERSONATION_STORAGE_KEY);
        window.location.href = "/admin";
        return;
      }
      await fetch("/api/digital-pool/logout", { method: "POST" });
      router.push("/digital-pool/login");
      router.refresh();
    } finally {
      setLogoutBusy(false);
    }
  };

  const handleMenuToggle = () => {
    const lg = typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
    if (lg) setSidebarCollapsed((v) => !v);
    else setMobileNavOpen(true);
  };

  const navButtonClass = (active: boolean) =>
    `flex items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-medium transition ${
      active ? "bg-muted text-foreground" : "text-subtext hover:bg-muted hover:text-foreground"
    }`;

  const closeMobile = () => setMobileNavOpen(false);

  const renderNav = (mobile: boolean) => (
    <div className="grid gap-1">
      <Link href="/digital-pool" className={navButtonClass(isHome)} onClick={closeMobile}>
        <span>Home</span>
        {isHome ? <span className="text-primary">●</span> : null}
      </Link>
      <Link href="/digital-pool/network" className={navButtonClass(isNetwork)} onClick={closeMobile}>
        <span>Network</span>
        {isNetwork ? <span className="text-primary">●</span> : null}
      </Link>
      <Link href="/digital-pool/income" className={navButtonClass(isIncome)} onClick={closeMobile}>
        <span>Income History</span>
        {isIncome ? <span className="text-primary">●</span> : null}
      </Link>

      <div className="grid gap-1">
        <button
          type="button"
          onClick={() => {
            setProfileOpen((v) => !v);
            if (mobile) {
              /* keep drawer open */
            }
          }}
          className={navButtonClass(isProfile)}
        >
          <span>Profile</span>
          <span className={`transition-transform ${profileOpen ? "rotate-90" : ""}`}>›</span>
        </button>
        <div
          className={`ml-2 grid overflow-hidden transition-[grid-template-rows,opacity] duration-200 ${
            profileOpen ? "grid-rows-[1fr] opacity-100" : "pointer-events-none grid-rows-[0fr] opacity-0"
          }`}
        >
          <div className="min-h-0 overflow-hidden rounded-2xl bg-background ring-1 ring-ring">
            {PROFILE_LINKS.map((item) => {
              const subActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={closeMobile}
                  className={`flex w-full items-center justify-between px-4 py-2 text-left text-sm transition ${
                    subActive ? "bg-muted text-foreground" : "text-subtext hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <span>{item.label}</span>
                  {subActive ? <span className="text-primary">●</span> : null}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      <Link href="/digital-pool/withdraw" className={navButtonClass(isWithdraw)} onClick={closeMobile}>
        <span>Withdraw</span>
        {isWithdraw ? <span className="text-primary">●</span> : null}
      </Link>
    </div>
  );

  if (checkingToken && !pathname.includes("/digital-pool/login")) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-sm text-subtext">Loading…</div>
      </div>
    );
  }

  if (!session && !impersonating && !pathname.includes("/digital-pool/login")) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-sm text-subtext">Redirecting to login…</div>
      </div>
    );
  }

  if (pathname.includes("/digital-pool/login")) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen max-w-[100vw] overflow-x-hidden bg-transparent text-foreground">
      <div className="mx-auto max-w-7xl overflow-x-hidden px-4 py-4 sm:px-6 sm:py-6">
        <div className="flex w-full min-w-0 items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={handleMenuToggle}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-card shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)] hover:bg-muted lg:hidden"
              aria-label="Open menu"
            >
              {"\u2630"}
            </button>
            <button
              type="button"
              onClick={handleMenuToggle}
              className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-card shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)] hover:bg-muted lg:inline-flex"
              aria-label="Toggle sidebar"
              title="Toggle sidebar"
            >
              {sidebarCollapsed ? "\u203A" : "\u2039"}
            </button>
            <div className="flex min-w-0 items-center">
              <img src="/logo.jpeg" alt="Digital Community Magnet" className="h-6 w-auto rounded-md ring-1 ring-ring sm:h-7" />
            </div>
          </div>
          <div className="flex min-w-0 shrink-0 items-center gap-2 sm:gap-3">
            <div className="min-w-0 flex flex-col items-end gap-0.5 text-right">
              <span className="max-w-[min(72vw,20rem)] truncate text-xs font-semibold text-foreground sm:text-sm">
                {session?.username}
              </span>
              <span className="max-w-[min(72vw,20rem)] truncate font-mono text-[9px] text-subtext sm:text-[10px]">
                {session?.email}
              </span>
            </div>
            <div className="relative shrink-0" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white shadow-sm ring-1 ring-primary/20 transition hover:bg-primary/90"
                aria-expanded={userMenuOpen}
                aria-haspopup="menu"
                aria-label="Account menu"
              >
                {initials}
              </button>
              {userMenuOpen ? (
                <div
                  className="absolute right-0 top-full z-50 mt-2 w-[min(calc(100vw-2rem),16rem)] min-w-[14rem] rounded-2xl bg-card p-2 shadow-xl ring-1 ring-ring animate-in fade-in slide-in-from-top-2 duration-200"
                  role="menu"
                >
                  <div className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-subtext">
                    <FaUserCircle className="text-primary" size={18} />
                    Digital Pool {impersonating ? "(View Only)" : ""}
                  </div>
                  <div className="my-1.5 border-t border-ring/50" />
                  <button
                    type="button"
                    role="menuitem"
                    disabled={logoutBusy}
                    onClick={() => void logout()}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-red-500 transition hover:bg-red-500/10 disabled:opacity-50"
                  >
                    <FaSignOutAlt className="text-red-500" size={18} />
                    {impersonating ? "Close Preview" : "Logout"}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div
          className={`mt-6 grid w-full max-w-full gap-6 overflow-hidden ${sidebarCollapsed ? "lg:grid-cols-[1fr]" : "lg:grid-cols-[260px_1fr]"}`}
        >
          {!sidebarCollapsed && (
            <aside className="hidden min-w-0 lg:block">
              <div className="rounded-3xl bg-card p-3 shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)]">
                <div className="px-3 py-2 text-xs font-medium text-subtext">Menu</div>
                <div className="mt-1">{renderNav(false)}</div>
              </div>

              <div className="mt-6 rounded-3xl bg-card p-5 shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)]">
                <div className="text-xs text-subtext">Digital Pool System</div>
                <p className="mt-2 text-sm text-foreground">
                  {impersonating ? "Admin View Mode — No changes saved." : "Same tools as your main panel — session is separate."}
                </p>
              </div>

              <button
                type="button"
                disabled={logoutBusy}
                onClick={() => void logout()}
                className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-2xl bg-muted px-5 text-sm font-medium text-foreground ring-1 ring-ring transition hover:bg-secondary disabled:opacity-50"
              >
                {impersonating ? "Close Preview" : "Logout"}
              </button>
            </aside>
          )}

          <div className="lg:hidden">
            <div className="min-w-0 rounded-3xl bg-card p-5 shadow-[0_0_15px_rgba(1,163,151,0.15)] ring-1 ring-ring transition-all duration-300 hover:shadow-[0_0_20px_rgba(1,163,151,0.25)]">
              <div className="text-xs text-subtext">Digital Pool System</div>
              <p className="mt-2 text-sm text-foreground">
                {impersonating ? "Admin View Mode." : "Menu open karne ke liye upar wala button use karein."}
              </p>
            </div>
          </div>

          <main className="min-w-0 flex-1 space-y-6 overflow-hidden">{children}</main>
        </div>
      </div>

      {mobileNavOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button
            type="button"
            onClick={() => setMobileNavOpen(false)}
            className="absolute inset-0 bg-black/30"
            aria-label="Close menu"
          />
          <div className="absolute left-0 top-0 flex h-[100dvh] max-h-[100dvh] w-[min(100%,20rem)] max-w-[min(100vw-1rem,20rem)] flex-col overflow-hidden bg-card shadow-xl ring-1 ring-ring sm:w-[84%] sm:max-w-xs">
            <div className="flex shrink-0 items-center justify-between px-4 py-4">
              <div className="text-sm font-semibold">Menu</div>
              <button
                type="button"
                onClick={() => setMobileNavOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-foreground ring-1 ring-ring hover:bg-secondary"
                aria-label="Close"
              >
                {"\u2715"}
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4">
              {renderNav(true)}
              <button
                type="button"
                disabled={logoutBusy}
                onClick={() => void logout()}
                className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-2xl bg-red-600/10 text-sm font-semibold text-red-600 shadow-sm ring-1 ring-red-600/20 transition hover:bg-red-600/20 disabled:opacity-50"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
