import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { canAccessAdminSection, type AdminSectionKey } from "@/lib/admin-permissions";

export async function getAdminAccessOr403(): Promise<
  | { ok: true; fullAccess: boolean; sections: string[] }
  | { ok: false; response: NextResponse }
> {
  const session = await auth();
  if (!session?.user?.id || session.user.status !== "admin") {
    return {
      ok: false,
      response: NextResponse.json({ error: "Admin only" }, { status: 403 }),
    };
  }
  const fullAccess = session.user.adminFullAccess === true;
  const sections = Array.isArray(session.user.adminAllowedSections)
    ? session.user.adminAllowedSections
    : [];
  return { ok: true, fullAccess, sections };
}

export async function requireAdminSection(section: AdminSectionKey): Promise<
  | { ok: true; fullAccess: boolean; sections: string[] }
  | { ok: false; response: NextResponse }
> {
  const a = await getAdminAccessOr403();
  if (!a.ok) return a;
  if (!canAccessAdminSection(a.fullAccess, a.sections, section)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true, fullAccess: a.fullAccess, sections: a.sections };
}

export async function requireSuperAdmin(): Promise<
  | { ok: true; fullAccess: boolean }
  | { ok: false; response: NextResponse }
> {
  const a = await getAdminAccessOr403();
  if (!a.ok) return a;
  if (!a.fullAccess) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true, fullAccess: true };
}
