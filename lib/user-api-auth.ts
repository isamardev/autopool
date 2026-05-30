import { cookies } from "next/headers";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { verifyImpersonationToken } from "@/lib/impersonation-token";
import { DIGITAL_POOL_COOKIE, verifyDigitalPoolSession } from "@/lib/digital-pool-session";
import { DIGITAL_POOL_API_HEADER } from "@/lib/digital-pool-api-constants";

/**
 * Resolves which user a /api/user/* call is for: normal session, or Bearer impersonation token (admin opened user in new tab).
 * Impersonation does not change cookies, so the admin tab stays logged in.
 */
export async function getUserApiContext(req: Request): Promise<
  | { ok: true; userId: string; effectiveStatus: string; impersonation: boolean; isDigitalPool: boolean }
  | { ok: false; status: number; error: string }
> {
  const authz = req.headers.get("authorization");
  if (authz?.startsWith("Bearer ")) {
    const raw = authz.slice(7).trim();
    const uid = verifyImpersonationToken(raw);
    if (uid) {
      const db = getDb();
      const u = await db.user.findUnique({ where: { id: uid }, select: { status: true } });
      if (!u) return { ok: false, status: 401, error: "Invalid impersonation" };
      // Note: We might want to know if this impersonation is from the Digital Pool tab or main dashboard.
      // For now, we assume if they hit /api/user/* with a Bearer token, they might be in either.
      // But we can check the referer or another header if we really need to distinguish.
      const isPool = req.headers.get(DIGITAL_POOL_API_HEADER) === "1";
      return { ok: true, userId: uid, effectiveStatus: u.status, impersonation: true, isDigitalPool: isPool };
    }
  }

  const usePoolOnly = req.headers.get(DIGITAL_POOL_API_HEADER) === "1";
  if (usePoolOnly) {
    const jar = await cookies();
    const dp = verifyDigitalPoolSession(jar.get(DIGITAL_POOL_COOKIE)?.value);
    if (!dp) return { ok: false, status: 401, error: "Unauthorized" };
    const db = getDb();
    const u = await db.user.findUnique({
      where: { id: dp.userId },
      select: { status: true },
    });
    if (!u) return { ok: false, status: 401, error: "Unauthorized" };
    if (u.status === "inactive") {
      return { ok: false, status: 403, error: "Account deactivated" };
    }
    if (u.status === "blocked") {
      return { ok: false, status: 403, error: "Account blocked" };
    }
    return { ok: true, userId: dp.userId, effectiveStatus: u.status, impersonation: false, isDigitalPool: true };
  }

  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  return {
    ok: true,
    userId: session.user.id,
    effectiveStatus: session.user.status ?? "active",
    impersonation: false,
    isDigitalPool: false,
  };
}

/**
 * Specifically for /api/digital-pool/* routes.
 * Supports Bearer impersonation OR DIGITAL_POOL_COOKIE.
 */
export async function getDigitalPoolApiContext(req: Request): Promise<
  | { ok: true; userId: string; effectiveStatus: string; impersonation: boolean }
  | { ok: false; status: number; error: string }
> {
  const authz = req.headers.get("authorization");
  if (authz?.startsWith("Bearer ")) {
    const raw = authz.slice(7).trim();
    const uid = verifyImpersonationToken(raw);
    if (uid) {
      const db = getDb();
      const u = await db.user.findUnique({ where: { id: uid }, select: { status: true } });
      if (!u) return { ok: false, status: 401, error: "Invalid impersonation" };
      return { ok: true, userId: uid, effectiveStatus: u.status, impersonation: true };
    }
  }

  const jar = await cookies();
  const dp = verifyDigitalPoolSession(jar.get(DIGITAL_POOL_COOKIE)?.value);
  if (!dp) return { ok: false, status: 401, error: "Unauthorized" };

  const db = getDb();
  const u = await db.user.findUnique({
    where: { id: dp.userId },
    select: { status: true },
  });
  if (!u) return { ok: false, status: 401, error: "Unauthorized" };
  if (u.status === "inactive") {
    return { ok: false, status: 403, error: "Account deactivated" };
  }
  if (u.status === "blocked") {
    return { ok: false, status: 403, error: "Account blocked" };
  }
  return { ok: true, userId: dp.userId, effectiveStatus: u.status, impersonation: false };
}
