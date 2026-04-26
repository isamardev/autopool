/**
 * `0.0.0.0` is a listen/bind address (e.g. `next dev -H 0.0.0.0`), not a valid redirect host in browsers.
 * Normalize to `localhost` and keep port/protocol when possible.
 */
export function sanitizeAuthOriginUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  try {
    const u = new URL(trimmed);
    if (u.hostname === "0.0.0.0") {
      u.hostname = "localhost";
      return u.href;
    }
    return trimmed;
  } catch {
    return trimmed;
  }
}
