import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireAdminSection } from "@/lib/admin-api-guard";
import { createImpersonationToken } from "@/lib/impersonation-token";
import { z } from "zod";

const bodySchema = z.object({
  email: z.string().email(),
});

export async function POST(req: Request) {
  try {
    const gate = await requireAdminSection("users");
    if (!gate.ok) return gate.response;

    const json = await req.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    const db = getDb();
    const user = await db.user.findUnique({
      where: { email: parsed.data.email.toLowerCase() },
      select: { id: true },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const token = createImpersonationToken(user.id);
    return NextResponse.json({ token });
  } catch {
    return NextResponse.json({ error: "Failed to create token" }, { status: 500 });
  }
}
