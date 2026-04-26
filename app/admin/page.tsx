"use client";

import dynamic from "next/dynamic";
import { signOut, useSession } from "next-auth/react";
import AdminLoginForm from "./AdminLoginForm";
import { getAuthRedirectUrl } from "@/lib/auth-redirect-url";

const AdminPanelClient = dynamic(
  () => import("./AdminPanelClient").then((m) => ({ default: m.AdminPanelClient })),
  {
    loading: () => (
      <div className="flex min-h-screen items-center justify-center bg-transparent text-foreground">
        <div className="text-sm text-subtext">Loading admin…</div>
      </div>
    ),
    ssr: false,
  },
);

export default function AdminPage() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-transparent text-foreground">
        <div className="text-sm text-subtext">Loading…</div>
      </div>
    );
  }

  if (status !== "authenticated" || !session?.user?.id || session.user.status !== "admin") {
    return <AdminLoginForm />;
  }

  if (!session.user.adminFullAccess && (session.user.adminAllowedSections?.length ?? 0) === 0) {
  return (
      <div className="min-h-screen flex items-center justify-center bg-transparent p-6">
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
