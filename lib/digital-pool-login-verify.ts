import bcrypt from "bcryptjs";
import { timingSafeEqual } from "crypto";
import { getDb } from "@/lib/db";
import { deriveDigitalPoolPassword } from "@/lib/digital-pool-credentials";
import { MIN_DIGITAL_POOL_NETWORK_BINARY_LEVEL } from "@/lib/digital-pool-network-config";
import { getBinaryLevelsCompletedForUser } from "@/lib/user-binary-level";
import type { DigitalPoolSessionPayload } from "@/lib/digital-pool-session";

function safeEqualString(a: string, b: string): boolean {
  try {
    const x = Buffer.from(a, "utf8");
    const y = Buffer.from(b, "utf8");
    if (x.length !== y.length) return false;
    return timingSafeEqual(x, y);
  } catch {
    return false;
  }
}

/** Email + Digital Pool password (dashboard card) — same L1+ rule as main dashboard card. */
export async function verifyDigitalPoolLogin(
  emailRaw: string,
  passwordRaw: string,
): Promise<DigitalPoolSessionPayload | null> {
  const email = String(emailRaw ?? "")
    .trim()
    .toLowerCase();
  const password = String(passwordRaw ?? "");
  if (!email || !password) return null;

  const db = getDb();
  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, email: true, username: true, status: true },
  });
  if (!user) return null;
  if (user.status === "blocked" || user.status === "inactive") return null;

  const level = await getBinaryLevelsCompletedForUser(db, user.id);
  if (level < MIN_DIGITAL_POOL_NETWORK_BINARY_LEVEL) return null;

  if (typeof db.digitalPoolCredential?.findUnique !== "function") {
    const expected = deriveDigitalPoolPassword(user.id);
    if (!expected || !safeEqualString(password, expected)) return null;
    return { userId: user.id, email: user.email, username: user.username };
  }

  const cred = await db.digitalPoolCredential.findUnique({
    where: { userId: user.id },
    select: { passwordHash: true },
  });
  if (cred) {
    const ok = bcrypt.compareSync(password, cred.passwordHash);
    if (!ok) return null;
  } else {
    const expected = deriveDigitalPoolPassword(user.id);
    if (!expected || !safeEqualString(password, expected)) return null;
  }

  return { userId: user.id, email: user.email, username: user.username };
}
