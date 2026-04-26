/**
 * Neon + Prisma on Vercel: pooler host needs `sslmode=require` and `pgbouncer=true` (Neon docs).
 * Longer `connect_timeout` helps when the Neon compute was auto-suspended (free tier).
 *
 * Set `DATABASE_URL_RAW=1` in Vercel to skip any mutation (debug only).
 */
export function resolveDatabaseUrlForPrisma(raw?: string | null): string {
  const urlStr = (raw ?? process.env.DATABASE_URL ?? "").trim();
  if (!urlStr) {
    throw new Error("Missing DATABASE_URL");
  }
  if (process.env.DATABASE_URL_RAW === "1" || process.env.VERCEL !== "1") {
    return urlStr;
  }
  if (!/neon\.tech/i.test(urlStr)) {
    return urlStr;
  }

  let out = urlStr;
  const has = (key: string) => new RegExp(`[?&]${key}=`, "i").test(out);
  const add = (key: string, value: string) => {
    if (has(key)) return;
    out += (out.includes("?") ? "&" : "?") + `${key}=${encodeURIComponent(value)}`;
  };

  if (!has("sslmode")) {
    add("sslmode", "require");
  }
  if (/pooler/i.test(out) && !has("pgbouncer")) {
    add("pgbouncer", "true");
  }
  if (!has("connect_timeout")) {
    add("connect_timeout", "60");
  }

  return out;
}
