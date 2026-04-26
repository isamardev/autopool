import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { getDb } from "@/lib/db";
import { isEmailConfigured, sendOtpEmail } from "@/lib/email";
import { sendRegistrationOtp } from "@/lib/registration-otp";

const schema = z.object({
  email: z.string().email().optional(),
  purpose: z.enum(["registration", "withdrawal", "password_reset"]),
});

function generateOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const email = (parsed.data.email ?? "").toLowerCase();
    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }
    const storedPurpose = parsed.data.purpose === "password_reset" ? "withdrawal" : parsed.data.purpose;

    if (parsed.data.purpose === "registration") {
      const regResult = await sendRegistrationOtp(email);
      if (!regResult.ok) {
        const status =
          regResult.error === "Please sign up first"
            ? 404
            : regResult.error === "Account already exists. Please login."
              ? 400
              : regResult.error === "Email service is not configured"
                ? 500
                : regResult.error === "Failed to send OTP email. Please try again."
                  ? 503
                  : 400;
        return NextResponse.json({ error: regResult.error }, { status });
      }
      return NextResponse.json({
        success: true,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });
    }

    const db = getDb();
    const user = await db.user.findUnique({ where: { email }, select: { id: true } });

    if (!user && parsed.data.purpose === "password_reset") {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (!isEmailConfigured()) {
      return NextResponse.json({ error: "Email service is not configured" }, { status: 500 });
    }

    const otp = generateOtp();
    const codeHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const otpRow = await db.otp.create({
      data: {
        userId: user?.id ?? null,
        email,
        purpose: storedPurpose,
        codeHash,
        expiresAt,
      },
    });

    try {
      await sendOtpEmail({
        to: email,
        otp,
        purpose: parsed.data.purpose,
      });
    } catch (sendErr) {
      await db.otp.delete({ where: { id: otpRow.id } }).catch(() => undefined);
      console.error("[request-otp] sendOtpEmail failed:", sendErr);
      throw sendErr;
    }

    return NextResponse.json({
      success: true,
      expiresAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to request OTP";
    console.error("[request-otp]", error);
    return NextResponse.json({ error: process.env.NODE_ENV === "production" ? "Failed to request OTP" : message }, { status: 500 });
  }
}
