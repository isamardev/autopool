"use client";

import { useEffect, useRef } from "react";
import { SessionProvider, signOut, useSession } from "next-auth/react";
import { ToastContainer } from "react-toastify";
import { usePathname } from "next/navigation";
import "react-toastify/dist/ReactToastify.css";
import { toast } from "react-toastify";
import {
  SESSION_TAB_STORAGE_KEY,
  IMPERSONATION_STORAGE_KEY,
  markSessionTabActive,
  clearSessionTabMarker,
} from "@/lib/session-tab";
import { getAuthRedirectUrl } from "@/lib/auth-redirect-url";

const BLOCKED_MESSAGE = "You are blocked by admin. Contact customer support for help.";

/**
 * Cookie is shared across tabs; sessionStorage is per-tab.
 * Previously missing marker triggered sign-out so only one tab could stay logged in.
 * We now mark each tab on first authenticated paint so user dashboard, /role, and /admin
 * can stay open in multiple tabs at once with the same session.
 */
function SessionTabEnforcer() {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === "unauthenticated") {
      clearSessionTabMarker();
    }
  }, [status]);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user) return;
    if (typeof window === "undefined") return;
    try {
      if (sessionStorage.getItem(SESSION_TAB_STORAGE_KEY)) return;
      if (sessionStorage.getItem(IMPERSONATION_STORAGE_KEY)) {
        markSessionTabActive();
        return;
      }
      markSessionTabActive();
    } catch {
      void signOut({ callbackUrl: getAuthRedirectUrl("/") });
    }
  }, [status, session]);

  return null;
}

function SessionGuard() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const handledRef = useRef(false);

  useEffect(() => {
    if (status !== "authenticated") {
      handledRef.current = false;
      return;
    }
    if (session?.user?.status !== "blocked") {
      handledRef.current = false;
      return;
    }
    if (handledRef.current) return;
    handledRef.current = true;
    toast.error(BLOCKED_MESSAGE);
    signOut({ callbackUrl: getAuthRedirectUrl("/?blocked=1") });
  }, [pathname, session?.user?.status, status]);

  return null;
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider refetchInterval={0} refetchOnWindowFocus>
      <SessionTabEnforcer />
      <SessionGuard />
      {children}
      <ToastContainer
        position="top-right"
        autoClose={2000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="dark"
      />
    </SessionProvider>
  );
}
