import { createHmac, randomBytes } from "crypto";

const POOL_KEY_MATERIAL_VERSION = "digital-pool:v1";

/** In-app login + panel (new tab) — same path for everyone who unlocked the card. */
export const DIGITAL_POOL_LOGIN_PATH = "/digital-pool/login";

function resolveCredentialSecret(): string | null {
  const s = (
    process.env.DIGITAL_POOL_CREDENTIAL_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.AUTH_SECRET ||
    ""
  ).trim();
  return s ? s : null;
}

/** Deterministic Digital Pool password for this user (matches dashboard card). */
export function deriveDigitalPoolPassword(userId: string): string | null {
  const secret = resolveCredentialSecret();
  if (!secret) return null;
  const raw = createHmac("sha256", secret)
    .update(`${POOL_KEY_MATERIAL_VERSION}:${userId}`)
    .digest();
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghijkmnpqrstuvwxyz";
  let password = "";
  for (let i = 0; i < 18; i += 1) {
    password += alphabet[raw[i % raw.length] % alphabet.length];
  }
  return password;
}

const POOL_PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghijkmnpqrstuvwxyz";

/** Random pool password when no HMAC secret is configured (still stored in DB on first L1+). */
export function generateRandomPoolPassword(length = 18): string {
  const buf = randomBytes(length);
  let s = "";
  for (let i = 0; i < length; i += 1) {
    s += POOL_PASSWORD_ALPHABET[buf[i] % POOL_PASSWORD_ALPHABET.length];
  }
  return s;
}

export type DigitalPoolSystemPayload = {
  title: string;
  /** Opens in-app Digital Pool login in a new tab (`DIGITAL_POOL_LOGIN_PATH`). */
  url: string;
  username: string;
  email: string;
  password: string;
};

/** Before `DigitalPoolCredential` migration is applied — same behavior as the old dashboard card. */
export function buildDigitalPoolCardDeriveOnly(input: {
  userId: string;
  username: string;
  email: string;
  currentLevel: number;
  minCompletedLevel: number;
}): DigitalPoolSystemPayload | null {
  if (input.currentLevel < input.minCompletedLevel) return null;
  const password = deriveDigitalPoolPassword(input.userId);
  if (!password) return null;
  return {
    title: "Digital Pool system",
    url: DIGITAL_POOL_LOGIN_PATH,
    username: input.username,
    email: input.email,
    password,
  };
}
