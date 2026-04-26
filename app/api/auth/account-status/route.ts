import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";

const schema = z.object({
  email: z.string().email(),
});

const BLOCKED_MESSAGE = "You are blocked by admin. Contact customer support for help.";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }

    const db = getDb();
    const user = await db.user.findUnique({
      where: { email: parsed.data.email.toLowerCase() },
      select: { status: true },
    });

    if (user?.status === "blocked") {
      return NextResponse.json({ status: "blocked", message: BLOCKED_MESSAGE });
    }

    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ status: "ok" });
  }
}
