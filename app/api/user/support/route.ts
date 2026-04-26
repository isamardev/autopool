import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { getUserApiContext } from "@/lib/user-api-auth";

const schema = z.object({
  subject: z.string().min(3).max(120),
  message: z.string().min(10).max(2000),
});

export async function POST(req: Request) {
  try {
    const ctx = await getUserApiContext(req);
    if (!ctx.ok) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    if (ctx.effectiveStatus === "inactive") {
      return NextResponse.json({ error: "Account deactivated" }, { status: 403 });
    }
    if (ctx.effectiveStatus === "blocked") {
      return NextResponse.json({ error: "Account blocked" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const db = getDb();
    const ticket = await db.supportTicket.create({
      data: {
        userId: ctx.userId,
        subject: parsed.data.subject,
        message: parsed.data.message,
        status: "open",
      },
    });

    await db.notification.create({
      data: {
        userId: ctx.userId,
        type: "support",
        title: "Support ticket created",
        message: `Ticket ${ticket.id} submitted`,
      },
    });

    return NextResponse.json({ success: true, ticket });
  } catch {
    return NextResponse.json({ error: "Failed to create ticket" }, { status: 500 });
  }
}
