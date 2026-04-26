import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { auth } from "@/auth";
import { getDb } from "@/lib/db";
import { verifyImpersonationToken } from "@/lib/impersonation-token";
import { findCompanyRootUser, getConfiguredAdminEmail } from "@/lib/company-admin";

const schema = z.object({
  email: z.string().email().optional(),
  purpose: z.enum(["registration", "withdrawal", "password_reset"]),
  code: z.string().min(4).max(12),
});

export async function POST(req: Request) {
  try {
    const session = await auth();
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    let email = (parsed.data.email ?? "").toLowerCase();
    if (!email) {
      const authz = req.headers.get("authorization");
      if (authz?.startsWith("Bearer ")) {
        const uid = verifyImpersonationToken(authz.slice(7).trim());
        if (uid) {
          const dbLookup = getDb();
          const u = await dbLookup.user.findUnique({ where: { id: uid }, select: { email: true } });
          email = (u?.email ?? "").toLowerCase();
        }
      }
    }
    if (!email) {
      email = (session?.user?.email ?? "").toLowerCase();
    }
    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }
    const storedPurpose = parsed.data.purpose === "password_reset" ? "withdrawal" : parsed.data.purpose;

    const db = getDb();
    const otp = await db.otp.findFirst({
      where: {
        email,
        purpose: storedPurpose,
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

    if (parsed.data.purpose !== "password_reset" && parsed.data.purpose !== "registration") {
      await db.otp.update({
        where: { id: otp.id },
        data: { consumedAt: new Date() },
      });
    }

    if (parsed.data.purpose === "registration") {
      const pendingUser = await db.pendingUser.findUnique({
        where: { email },
      });

      if (!pendingUser) {
        return NextResponse.json({ error: "Registration data not found" }, { status: 400 });
      }

      const reg = pendingUser;

      const userCount = await db.user.count();
      const configuredAdminEmail = getConfiguredAdminEmail();
      const isFirstAdmin = userCount === 0 && email === configuredAdminEmail;

      const walletPlaceholder = `placeholder_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      async function allocateRefCode(): Promise<string> {
        if (reg.referrerCode) {
          const exists = await db.user.findUnique({ where: { referrerCode: reg.referrerCode }, select: { id: true } });
          if (!exists) return reg.referrerCode;
        }
        let code = `USER${Math.floor(100000 + Math.random() * 900000)}`;
        for (let i = 0; i < 5; i += 1) {
          const exists = await db.user.findUnique({ where: { referrerCode: code }, select: { id: true } });
          if (!exists) break;
          code = `USER${Math.floor(100000 + Math.random() * 900000)}`;
        }
        return code;
      }
      const finalRefCode = await allocateRefCode();

      await db.$transaction(async (tx) => {
        await tx.user.create({
          data: {
            username: reg.username,
            country: reg.country,
            email: reg.email,
            passwordHash: reg.passwordHash,
            phone: reg.phone,
            walletAddress: walletPlaceholder,
            referrerCode: finalRefCode,
            referredById: reg.referredById
              ? reg.referredById
              : isFirstAdmin
                ? null
                : (await findCompanyRootUser(tx))?.id ?? null,
            balance: 0,
            status: isFirstAdmin ? "admin" : "inactive",
            emailVerifiedAt: new Date(),
          },
        });

        await tx.pendingUser.delete({
          where: { id: reg.id },
        });

        await tx.otp.update({
          where: { id: otp.id },
          data: { consumedAt: new Date() },
        });
      });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "OTP verification failed" }, { status: 500 });
  }
}
