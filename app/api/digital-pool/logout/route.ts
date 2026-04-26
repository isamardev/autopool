import { DigitalPoolAuditAction } from "@prisma/client";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { tryRecordDigitalPoolAudit } from "@/lib/digital-pool-audit";
import { DIGITAL_POOL_COOKIE, verifyDigitalPoolSession } from "@/lib/digital-pool-session";

export async function POST() {
  try {
    const jar = await cookies();
    const session = verifyDigitalPoolSession(jar.get(DIGITAL_POOL_COOKIE)?.value);
    if (session?.userId) {
      await tryRecordDigitalPoolAudit(session.userId, DigitalPoolAuditAction.LOGOUT);
    }
    jar.set(DIGITAL_POOL_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Logout failed" }, { status: 500 });
  }
}
