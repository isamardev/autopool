import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { requireAdminSection } from "@/lib/admin-api-guard";
import { runActivationPayoutEngine } from "@/lib/mlm-logic";
import {
  reconcileDigitalPoolAfterTeamChange,
} from "@/lib/digital-pool-credential-db";
import { MANUAL_SUSPEND_SOURCE } from "@/lib/team-withdraw-activity";

function countsTowardBinaryTree(status: string): boolean {
  return status !== "inactive";
}

const schema = z.object({
  id: z.string().min(6),
  status: z.enum(["active", "inactive", "blocked", "withdraw_suspend"]),
});

export async function PATCH(req: Request) {
  try {
    const gate = await requireAdminSection("users");
    if (!gate.ok) return gate.response;
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const db = getDb();
    const target = await db.user.findUnique({ where: { id: parsed.data.id }, select: { id: true, status: true } });
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (target.status === "admin") {
      return NextResponse.json({ error: "Cannot change admin status" }, { status: 400 });
    }

    if (parsed.data.status === "active" && target.status === "active") {
      try {
        await reconcileDigitalPoolAfterTeamChange(db, parsed.data.id);
      } catch (e) {
        console.error("admin users/status: digital pool sync (already active)", e);
      }
      return NextResponse.json({ success: true, user: target });
    }

    if (parsed.data.status === "active" && target.status !== "active") {
      if (target.status === "inactive") {
        await runActivationPayoutEngine({
          sourceUserId: parsed.data.id,
          activationAmount: 10,
          note: "Admin activation",
          skipUserDeduction: true,
        });
        await db.user.update({
          where: { id: parsed.data.id },
          data: { lastDownlineActivityAt: new Date(), withdrawSuspendSource: null },
        });
      } else {
        await db.user.update({
          where: { id: parsed.data.id },
          data: {
            status: "active",
            withdrawSuspendSource: null,
            lastDownlineActivityAt: new Date(),
          },
        });
      }
      const updated = await db.user.findUnique({
        where: { id: parsed.data.id },
        select: { id: true, status: true },
      });
      if (updated && countsTowardBinaryTree(target.status) !== countsTowardBinaryTree(updated.status)) {
        try {
          await reconcileDigitalPoolAfterTeamChange(db, parsed.data.id);
        } catch (e) {
          console.error("admin users/status: digital pool sync", e);
        }
      }
      return NextResponse.json({ success: true, user: updated });
    }

    const st = parsed.data.status;
    const updated = await db.user.update({
      where: { id: parsed.data.id },
      data: {
        status: st,
        withdrawSuspendSource:
          st === "withdraw_suspend" ? MANUAL_SUSPEND_SOURCE : null,
      },
      select: { id: true, status: true },
    });
    if (countsTowardBinaryTree(target.status) !== countsTowardBinaryTree(updated.status)) {
      try {
        await reconcileDigitalPoolAfterTeamChange(db, parsed.data.id);
      } catch (e) {
        console.error("admin users/status: digital pool sync", e);
      }
    }
    return NextResponse.json({ success: true, user: updated });
  } catch {
    return NextResponse.json({ error: "Failed to update user status" }, { status: 500 });
  }
}

