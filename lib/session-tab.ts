/**
 * NextAuth cookie is shared across tabs; sessionStorage is per-tab.
 * Each tab sets a marker on first load while authenticated so dashboard, /role, and /admin
 * can all be open at once without being signed out.
 */
export const SESSION_TAB_STORAGE_KEY = "__mlm_auth_tab_ok";

/** Must match dashboard — admin "view as user" opens new tab with ?imp= */
export const IMPERSONATION_STORAGE_KEY = "user_impersonation_token";

export function markSessionTabActive(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SESSION_TAB_STORAGE_KEY, "1");
  } catch {
    /* quota / private mode */
  }
}

export function clearSessionTabMarker(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(SESSION_TAB_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
