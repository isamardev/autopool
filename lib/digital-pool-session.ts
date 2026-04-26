import { createHmac, timingSafeEqual } from "crypto";

export const DIGITAL_POOL_COOKIE = "dcm_digital_pool_v1";

const MAX_AGE_SEC = 60 * 60 * 24 * 7;

function sessionSecret(): string {
  return (process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "").trim();
}

export type DigitalPoolSessionPayload = {
  userId: string;
  email: string;
  username: string;
};

export function signDigitalPoolSession(p: DigitalPoolSessionPayload): string | null {
  const s = sessionSecret();
  if (!s) return null;
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_SEC;
  const body = Buffer.from(
    JSON.stringify({ u: p.userId, e: p.email, n: p.username, exp }),
    "utf8",
  ).toString("base64url");
  const sig = createHmac("sha256", s).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyDigitalPoolSession(token: string | undefined): DigitalPoolSessionPayload | null {
  const s = sessionSecret();
  if (!token || !s) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", s).update(body).digest("base64url");
  try {
    const a = Buffer.from(sig, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const json = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
      u?: string;
      e?: string;
      n?: string;
      exp?: number;
    };
    if (!json.u || !json.e || typeof json.exp !== "number") return null;
    if (json.exp < Math.floor(Date.now() / 1000)) return null;
    return { userId: json.u, email: json.e, username: String(json.n ?? "") };
  } catch {
    return null;
  }
}
