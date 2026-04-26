import bcrypt from "bcryptjs";
import { getDb } from "@/lib/db";
import { isEmailConfigured, sendOtpEmail } from "@/lib/email";

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/** Creates a registration OTP row and emails the code (same rules as POST /api/user/request-otp). */
export async function sendRegistrationOtp(email: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const normalized = email.toLowerCase().trim();
  if (!normalized) {
    return { ok: false, error: "Email required" };
  }
  if (!isEmailConfigured()) {
    return { ok: false, error: "Email service is not configured" };
  }

  const db = getDb();
  const user = await db.user.findUnique({ where: { email: normalized }, select: { id: true } });
  if (user) {
    return { ok: false, error: "Account already exists. Please login." };
  }
  const pendingUser = await db.pendingUser.findUnique({ where: { email: normalized }, select: { id: true } });
  if (!pendingUser) {
    return { ok: false, error: "Please sign up first" };
  }

  const otp = generateOtp();
  const codeHash = await bcrypt.hash(otp, 8);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  const otpRow = await db.otp.create({
    data: {
      userId: null,
      email: normalized,
      purpose: "registration",
      codeHash,
      expiresAt,
    },
  });

  try {
    await sendOtpEmail({
      to: normalized,
      otp,
      purpose: "registration",
    });
  } catch (err) {
    console.error("sendRegistrationOtp: email failed", err);
    await db.otp.delete({ where: { id: otpRow.id } }).catch(() => {});
    return { ok: false, error: "Failed to send OTP email. Please try again." };
  }

  return { ok: true };
}
