import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import bcrypt from "bcryptjs";
import { getUserApiContext } from "@/lib/user-api-auth";

export async function POST(req: Request) {
  try {
    const ctx = await getUserApiContext(req);
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

    const { currentPassword, newSecurityCode } = await req.json();

    if (!currentPassword || !newSecurityCode) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const db = getDb();
    
    if (ctx.isDigitalPool) {
      const cred = await db.digitalPoolCredential.findUnique({ where: { userId: ctx.userId } });
      if (!cred) return NextResponse.json({ error: "Pool credentials not found" }, { status: 404 });
      const match = await bcrypt.compare(currentPassword, cred.passwordHash);
      if (!match) return NextResponse.json({ error: "Invalid current pool password" }, { status: 401 });
      
      await db.digitalPoolCredential.update({
        where: { userId: ctx.userId },
        data: { securityCode: newSecurityCode.trim() }
      });
      return NextResponse.json({ success: true, message: "Pool security code updated successfully" });
    }

    const user = await db.user.findUnique({
      where: { id: ctx.userId },
      select: { id: true, passwordHash: true }
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!passwordMatch) {
      return NextResponse.json({ error: "Invalid current password" }, { status: 401 });
    }

    // Update security code
    // Use raw query if prisma client is not generated with securityCode field
    try {
      await db.user.update({
        where: { id: user.id },
        data: { securityCode: newSecurityCode.trim() }
      });
    } catch (e: any) {
      console.error("Prisma update failed, trying raw query:", e.message);
      await db.$executeRawUnsafe(
        `UPDATE "User" SET "securityCode" = $1 WHERE id = $2`,
        newSecurityCode.trim(),
        user.id
      );
    }

    return NextResponse.json({ success: true, message: "Security code updated successfully" });
  } catch (error) {
    console.error("Update security code error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
