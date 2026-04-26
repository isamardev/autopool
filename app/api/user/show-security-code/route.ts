import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import bcrypt from "bcryptjs";
import { getUserApiContext } from "@/lib/user-api-auth";

export async function POST(req: Request) {
  try {
    const ctx = await getUserApiContext(req);
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

    const { password } = await req.json();

    if (!password) {
      return NextResponse.json({ error: "Password is required" }, { status: 400 });
    }

    const db = getDb();
    const user = await db.user.findUnique({
      where: { id: ctx.userId },
      select: { id: true, passwordHash: true }
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    // Get security code using raw query if prisma client is not generated with securityCode field
    let securityCode = "Not set";
    try {
      const u: any = await db.user.findUnique({
        where: { id: user.id },
        select: { securityCode: true }
      });
      securityCode = u?.securityCode || "Not set";
    } catch (e: any) {
      console.error("Prisma select failed, trying raw query:", e.message);
      const rows: any[] = await db.$queryRawUnsafe(
        `SELECT "securityCode" FROM "User" WHERE id = $1`,
        user.id
      );
      securityCode = rows[0]?.securityCode || "Not set";
    }

    return NextResponse.json({ success: true, securityCode });
  } catch (error) {
    console.error("Show security code error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
