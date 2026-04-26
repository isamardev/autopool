import { DigitalPoolAuditAction } from "@prisma/client";
import { getDb } from "@/lib/db";

/** Best-effort: never fails the login/logout HTTP flow if logging fails. */
export async function tryRecordDigitalPoolAudit(userId: string, action: DigitalPoolAuditAction): Promise<void> {
  try {
    const db = getDb();
    await db.digitalPoolAuditLog.create({
      data: { userId, action },
    });
  } catch (e) {
    console.error("[digital-pool-audit]", e);
  }
}
