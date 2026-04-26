import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { getDb } from "@/lib/db";
import { sendRegistrationOtp } from "@/lib/registration-otp";
import {
  COMPANY_REF_CODE,
  findCompanyRootUser,
  getConfiguredAdminEmail,
} from "@/lib/company-admin";
import {
  childMetReferralWindowVerification,
  isUserVerifiedAsReferrer,
} from "@/lib/referral-signup-eligibility";

const registerSchema = z.object({
  fullName: z.string().min(2).max(60),
  phone: z.string().min(7).max(20),
  country: z.string().min(2).max(60),
  email: z.string().email(),
  password: z.string().min(6).max(100),
  referrerCode: z.string().min(4).max(30).optional(),
  acceptedTerms: z.literal(true),
});

function generateRefCode(name: string) {
  const clean = name.replace(/\s+/g, "").toUpperCase().slice(0, 4) || "USER";
  return `${clean}${Math.floor(100000 + Math.random() * 900000)}`;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const referrerCode = (url.searchParams.get("referrerCode") || "").trim().toUpperCase();
    if (!referrerCode) {
      return NextResponse.json({ error: "Referrer code is required" }, { status: 400 });
    }

    const db = getDb();
    const referrer = await db.user.findUnique({
      where: { referrerCode },
      select: { username: true, status: true },
    });

    if (!referrer || referrer.status === "inactive") {
      return NextResponse.json({ error: "Referrer not found" }, { status: 404 });
    }

    return NextResponse.json({ fullName: referrer.username });
  } catch {
    return NextResponse.json({ error: "Failed to fetch referrer" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const db = getDb();
    const payload = parsed.data;
    const normalizedEmail = payload.email.toLowerCase();

    const already = await db.user.findFirst({
      where: { OR: [{ email: normalizedEmail }, { phone: payload.phone.trim() }] },
      select: { id: true, email: true },
    });
    if (already) {
      const field = already.email === normalizedEmail ? "Email" : "Phone number";
      return NextResponse.json({ error: `${field} already exists` }, { status: 409 });
    }

    const phoneTrim = payload.phone.trim();
    const pendingPhoneOther = await db.pendingUser.findFirst({
      where: { phone: phoneTrim, NOT: { email: normalizedEmail } },
      select: { id: true },
    });
    if (pendingPhoneOther) {
      return NextResponse.json({ error: "Phone number already used in another pending registration" }, { status: 409 });
    }

    const configuredAdminEmail = getConfiguredAdminEmail();
    const userCount = await db.user.count();
    let allowBootstrap = userCount === 0 && normalizedEmail === configuredAdminEmail;
    if (userCount === 0 && normalizedEmail !== configuredAdminEmail) {
      const existingRoot = await findCompanyRootUser(db);
      if (!existingRoot) {
        const adminPasswordHash = await bcrypt.hash("admin123", 12);
        const adminWalletPlaceholder = `placeholder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await db.user.create({
          data: {
            username: "Admin",
            country: "Pakistan",
            email: configuredAdminEmail,
            passwordHash: adminPasswordHash,
            walletAddress: adminWalletPlaceholder,
            referrerCode: COMPANY_REF_CODE,
            referredById: null,
            balance: 0,
            status: "admin",
          },
          select: { id: true },
        });
      }
      allowBootstrap = false;
    }
    const ref = payload.referrerCode?.trim().toUpperCase() ?? "";
    const parentByRef = ref
      ? await db.user.findUnique({ where: { referrerCode: ref }, select: { id: true, status: true } })
      : null;
    if (!allowBootstrap && ref && !parentByRef) {
      return NextResponse.json({ error: "Invalid referrerCode" }, { status: 400 });
    }

    const company = !allowBootstrap ? await findCompanyRootUser(db) : null;
    const parent = allowBootstrap ? null : parentByRef ?? company;
    if (!allowBootstrap && !parent) {
      return NextResponse.json({ error: "Company referrer not found" }, { status: 500 });
    }

    const REFERRAL_WINDOW_MS = 24 * 60 * 60 * 1000;
    if (!allowBootstrap && parentByRef && parentByRef.status !== "admin") {
      const parentVerified = await isUserVerifiedAsReferrer(db, parentByRef.id, parentByRef.status);
      if (!parentVerified) {
        return NextResponse.json({ error: "Referrer not verified yet" }, { status: 400 });
      }
      const nowMs = Date.now();
      const direct = await db.user.findMany({
        where: { referredById: parentByRef.id, status: { not: "inactive" } },
        select: { id: true, createdAt: true, status: true },
      });

      let inUse = 0;
      const deactivateIds: string[] = [];
      for (const child of direct) {
        if (child.status === "inactive") continue;
        const expiresAt = new Date(child.createdAt.getTime() + REFERRAL_WINDOW_MS);
        const verified = await childMetReferralWindowVerification(db, child.id, expiresAt);
        if (verified) {
          inUse += 1;
          continue;
        }
        if (nowMs > expiresAt.getTime()) {
          deactivateIds.push(child.id);
          continue;
        }
        inUse += 1;
      }
      if (deactivateIds.length > 0) {
        await db.user.updateMany({ where: { id: { in: deactivateIds } }, data: { status: "inactive" } });
      }
      if (inUse >= 2) {
        return NextResponse.json({ error: "Referrer quota reached (2/2)" }, { status: 400 });
      }
    }

    let refCode = generateRefCode(payload.fullName);
    for (let i = 0; i < 5; i += 1) {
      const exists = await db.user.findUnique({ where: { referrerCode: refCode }, select: { id: true } });
      if (!exists) break;
      refCode = generateRefCode(payload.fullName);
    }
    if (allowBootstrap) {
      const exists = await db.user.findUnique({ where: { referrerCode: COMPANY_REF_CODE }, select: { id: true } });
      if (exists) {
        return NextResponse.json({ error: "Company referrerCode already exists" }, { status: 409 });
      }
      refCode = COMPANY_REF_CODE;
    }

    const passwordHash = await bcrypt.hash(payload.password, 12);
    
    // Store in PendingUser instead of User
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    const pendingUser = await db.pendingUser.upsert({
      where: { email: normalizedEmail },
      update: {
        username: payload.fullName.trim(),
        country: payload.country.trim(),
        passwordHash,
        phone: payload.phone.trim(),
        referrerCode: refCode,
        referredById: parent?.id ?? null,
        expiresAt,
      },
      create: {
        username: payload.fullName.trim(),
        country: payload.country.trim(),
        email: normalizedEmail,
        passwordHash,
        phone: payload.phone.trim(),
        referrerCode: refCode,
        referredById: parent?.id ?? null,
        expiresAt,
      },
    });

    const otpResult = await sendRegistrationOtp(normalizedEmail);
    if (!otpResult.ok) {
      return NextResponse.json({ error: otpResult.error }, { status: 500 });
    }

    return NextResponse.json(
      {
        success: true,
        otpSent: true,
        user: {
          id: pendingUser.id,
          username: pendingUser.username,
          email: pendingUser.email,
          referrerCode: pendingUser.referrerCode,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Registration failed";
    return NextResponse.json(
      { error: process.env.NODE_ENV === "production" ? "Registration failed" : message },
      { status: 500 },
    );
  }
}
