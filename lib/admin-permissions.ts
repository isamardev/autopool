import { getDb } from "@/lib/db";

export const ADMIN_SECTION_KEYS = [
  "overview",
  "users",
  "deposits",
  "settings",
  "withdrawals",
  "payments",
  "roles",
] as const;

export type AdminSectionKey = (typeof ADMIN_SECTION_KEYS)[number];

const KEY_SET = new Set<string>(ADMIN_SECTION_KEYS);

export function isSuperAdminIdentity(userId: string, email: string | null | undefined): boolean {
  if (userId === "admin-fixed") return true;
  const e = (email ?? "").toLowerCase();
  const configured = (process.env.ADMIN_EMAIL ?? "admin@example.com").trim().toLowerCase();
  if (configured && e === configured) return true;
  return false;
}

export function normalizeAdminPermissionList(raw: unknown): AdminSectionKey[] {
  if (!Array.isArray(raw)) return [];
  const out: AdminSectionKey[] = [];
  for (const x of raw) {
    if (typeof x === "string" && KEY_SET.has(x)) {
      if (x === "roles") continue;
      out.push(x as AdminSectionKey);
    }
  }
  return out;
}

export async function resolveAdminPermissionsForUser(
  userId: string,
  email: string | null | undefined,
): Promise<{ fullAccess: boolean; sections: string[] }> {
  if (userId === "admin-fixed") {
    return { fullAccess: true, sections: [...ADMIN_SECTION_KEYS] };
  }

  const db = getDb();
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      status: true,
      adminRoleId: true,
      adminRole: { select: { permissions: true } },
    },
  });

  const emailResolved = (email ?? user?.email ?? "").trim();
  if (isSuperAdminIdentity(userId, emailResolved)) {
    return { fullAccess: true, sections: [...ADMIN_SECTION_KEYS] };
  }

  if (!user || user.status !== "admin") {
    return { fullAccess: false, sections: [] };
  }

  if (!user.adminRoleId) {
    return { fullAccess: true, sections: [...ADMIN_SECTION_KEYS] };
  }

  const sections = normalizeAdminPermissionList(user.adminRole?.permissions);
  return { fullAccess: false, sections };
}

export function canAccessAdminSection(
  fullAccess: boolean,
  sections: string[] | undefined,
  section: AdminSectionKey | string,
): boolean {
  if (fullAccess) return true;
  return Array.isArray(sections) && sections.includes(section);
}
