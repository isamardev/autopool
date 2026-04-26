import { createHmac, timingSafeEqual } from "crypto";

function secret(): string {
  return process.env.IMPERSONATION_SECRET || process.env.NEXTAUTH_SECRET || "dev-impersonation-change-in-production";
}

/** Short-lived token so admin can open user dashboard in a new tab without replacing the session cookie. */
export function createImpersonationToken(userId: string, maxAgeSec = 7200): string {
  const exp = Date.now() + maxAgeSec * 1000;
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp })).toString("base64url");
  const sig = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyImpersonationToken(token: string): string | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [payload, sig] = parts;
    const expected = createHmac("sha256", secret()).update(payload).digest("base64url");
    const a = Buffer.from(sig, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { uid?: string; exp?: number };
    if (typeof data.uid !== "string" || typeof data.exp !== "number") return null;
    if (Date.now() > data.exp) return null;
    return data.uid;
  } catch {
    return null;
  }
}
