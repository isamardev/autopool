import type { PrismaClient, UserStatus } from "@prisma/client";

/** Platform root referral code — stable identifier (not tied to admin email). */
export const COMPANY_REF_CODE = "ADMIN111";

type DbWithUser = {
  user: PrismaClient["user"];
};

/**
 * Email used for first bootstrap admin signup — aligns with `auth.ts` / `ADMIN_EMAIL`.
 */
export function getConfiguredAdminEmail(): string {
  return (process.env.ADMIN_EMAIL ?? "admin@example.com").trim().toLowerCase();
}

/**
 * Resolves the company root user after admin email changes (lookup by ref code, then role, then configured email).
 */
export async function findCompanyRootUser(
  db: DbWithUser,
): Promise<{ id: string; status: UserStatus } | null> {
  const byRef = await db.user.findUnique({
    where: { referrerCode: COMPANY_REF_CODE },
    select: { id: true, status: true },
  });
  if (byRef) return byRef;

  const byRole = await db.user.findFirst({
    where: { status: "admin" },
    orderBy: { createdAt: "asc" },
    select: { id: true, status: true },
  });
  if (byRole) return byRole;

  const cfg = getConfiguredAdminEmail();
  if (cfg.length > 0) {
    const byEmail = await db.user.findUnique({
      where: { email: cfg },
      select: { id: true, status: true },
    });
    if (byEmail) return byEmail;
  }

  return null;
}
