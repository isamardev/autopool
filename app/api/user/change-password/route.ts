import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import bcrypt from "bcryptjs";
import { getUserApiContext } from "@/lib/user-api-auth";

export async function POST(req: Request) {
  try {
    const ctx = await getUserApiContext(req);
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

    const { currentPassword, newPassword } = await req.json();

    if (!currentPassword || !newPassword || newPassword.length < 6) {
      return NextResponse.json({ error: "Missing current or new password (min 6 chars)" }, { status: 400 });
    }

    const db = getDb();
    const user = await db.user.findUnique({
      where: { id: ctx.userId },
      select: { id: true, passwordHash: true, adminRoleId: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Verify current password
    const passwordMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!passwordMatch) {
      return NextResponse.json({ error: "Invalid current password" }, { status: 401 });
    }

    // Update password (plain copy for staff roles uses raw SQL so stale Prisma client still works)
    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    await db.user.update({
      where: { id: user.id },
      data: { passwordHash: newPasswordHash },
    });
    if (user.adminRoleId) {
      await db.$executeRaw`UPDATE "User" SET "staffPasswordPlain" = ${newPassword} WHERE id = ${user.id}`;
    }

    return NextResponse.json({ success: true, message: "Password updated successfully" });
  } catch (error) {
    console.error("Change password error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
