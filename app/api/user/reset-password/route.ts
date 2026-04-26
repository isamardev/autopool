import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { getDb } from "@/lib/db";

const schema = z.object({
  email: z.string().email(),
  newPassword: z.string().min(6).max(128),
  code: z.string().min(4).max(12),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const email = parsed.data.email.toLowerCase();
    const db = getDb();
    const user = await db.user.findUnique({ where: { email }, select: { id: true, adminRoleId: true } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const otp = await db.otp.findFirst({
      where: {
        email,
        purpose: "withdrawal",
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!otp) {
      return NextResponse.json({ error: "OTP not found or expired" }, { status: 400 });
    }

    if (otp.attempts >= 5) {
      return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
    }

    const ok = await bcrypt.compare(parsed.data.code, otp.codeHash);
    await db.otp.update({
      where: { id: otp.id },
      data: { attempts: { increment: 1 } },
    });

    if (!ok) {
      return NextResponse.json({ error: "Invalid OTP" }, { status: 400 });
    }

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });
    if (user.adminRoleId) {
      await db.$executeRaw`UPDATE "User" SET "staffPasswordPlain" = ${parsed.data.newPassword} WHERE id = ${user.id}`;
    }

    await db.otp.update({
      where: { id: otp.id },
      data: { consumedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Password reset failed" }, { status: 500 });
  }
}
