import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { tryRecordDigitalPoolAudit } from "@/lib/digital-pool-audit";
import { verifyDigitalPoolLogin } from "@/lib/digital-pool-login-verify";
import { DIGITAL_POOL_COOKIE, signDigitalPoolSession } from "@/lib/digital-pool-session";
import { DigitalPoolAuditAction } from "@prisma/client";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 400 });
    }

    const user = await verifyDigitalPoolLogin(parsed.data.email, parsed.data.password);
    if (!user) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const token = signDigitalPoolSession(user);
    if (!token) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const jar = await cookies();
    jar.set(DIGITAL_POOL_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });

    await tryRecordDigitalPoolAudit(user.userId, DigitalPoolAuditAction.LOGIN_SUCCESS);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
