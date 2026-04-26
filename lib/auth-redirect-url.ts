import { sanitizeAuthOriginUrl } from "@/lib/auth-origin";

/**
 * Use with `signOut({ callbackUrl })` from the **browser** only.
 * A relative path like `/` can be resolved against `AUTH_URL` / `NEXTAUTH_URL`
 * (often `http://localhost:3000` in `.env`), so users land on localhost after logout on production.
 *
 * When dev binds `0.0.0.0`, `window.location.origin` may be `http://0.0.0.0:3000` — that URL is not
 * a usable redirect target; we normalize to `http://localhost:PORT`.
 */
export function getAuthRedirectUrl(path: string = "/"): string {
  if (typeof window === "undefined") return path;
  const p = path.startsWith("/") ? path : `/${path}`;
  let origin = window.location.origin;
  try {
    if (new URL(window.location.href).hostname === "0.0.0.0") {
      const port = window.location.port;
      origin = port ? `http://localhost:${port}` : "http://localhost";
    } else {
      origin = sanitizeAuthOriginUrl(origin);
    }
  } catch {
    origin = sanitizeAuthOriginUrl(origin);
  }
  return `${origin.replace(/\/$/, "")}${p}`;
}
