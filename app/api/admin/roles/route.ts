import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/admin-api-guard";
import { normalizeAdminPermissionList } from "@/lib/admin-permissions";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";

/** Plain column may exist in DB before `prisma generate` refreshes the client — use raw SQL for this field. */
async function setUserStaffPasswordPlain(db: ReturnType<typeof getDb>, userId: string, plain: string) {
  await db.$executeRaw`UPDATE "User" SET "staffPasswordPlain" = ${plain} WHERE id = ${userId}`;
}

async function getStaffPlainsByUserIds(
  db: ReturnType<typeof getDb>,
  userIds: string[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (userIds.length === 0) return out;
  const rows = await db.$queryRaw<Array<{ id: string; staffPasswordPlain: string | null }>>`
    SELECT id, "staffPasswordPlain" FROM "User" WHERE id IN (${Prisma.join(userIds)})
  `;
  for (const r of rows) out.set(r.id, r.staffPasswordPlain);
  return out;
}

const createSchema = z.object({
  name: z.string().min(1).max(80),
  permissions: z.array(z.string()).optional(),
  staffEmail: z.string().email(),
  staffPassword: z.string().min(6).max(200),
  staffName: z.string().min(1).max(80),
});

/** Use main `db` — interactive `$transaction(tx => ...)` omits `adminRole` on the WASM client. */
async function uniqueWalletForRole(db: Pick<PrismaClient, "user">, roleId: string): Promise<string> {
  for (let i = 0; i < 24; i++) {
    const w = `role_${roleId}_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 14)}`;
    const exists = await db.user.findUnique({ where: { walletAddress: w }, select: { id: true } });
    if (!exists) return w;
  }
  throw new Error("Could not allocate wallet");
}

async function uniqueReferrerCode(db: Pick<PrismaClient, "user">): Promise<string> {
  for (let i = 0; i < 24; i++) {
    const code = `S${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.toUpperCase().replace(/[^A-Z0-9]/g, "X").slice(0, 14);
    const exists = await db.user.findUnique({ where: { referrerCode: code }, select: { id: true } });
    if (!exists) return code;
  }
  throw new Error("Could not allocate referral code");
}

const patchSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80).optional(),
  permissions: z.array(z.string()).optional(),
  /** Staff login linked to this role (same user row as create flow). */
  staffUsername: z.string().min(1).max(80).optional(),
  staffEmail: z.string().email().optional(),
  /** Set only when changing password; omit or "" = leave unchanged */
  staffPassword: z.union([z.literal(""), z.string().min(6).max(200)]).optional(),
});

const deleteSchema = z.object({
  id: z.string().min(1),
});

export async function GET() {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate.response;

  try {
    const db = getDb();
    const roles = await db.adminRole.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        permissions: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { users: true } },
      },
    });

    const roleIds = roles.map((r) => r.id);
    const staffRows =
      roleIds.length === 0
        ? []
        : await db.user.findMany({
            where: { adminRoleId: { in: roleIds } },
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              adminRoleId: true,
              email: true,
              username: true,
            },
          });

    const firstStaffByRole = new Map<
      string,
      { id: string; email: string; username: string; staffPasswordPlain: string | null }
    >();
    for (const u of staffRows) {
      const rid = u.adminRoleId;
      if (!rid || firstStaffByRole.has(rid)) continue;
      firstStaffByRole.set(rid, {
        id: u.id,
        email: u.email,
        username: u.username,
        staffPasswordPlain: null,
      });
    }
    const staffIds = [...firstStaffByRole.values()].map((s) => s.id);
    const plainById = await getStaffPlainsByUserIds(db, staffIds);
    for (const [rid, s] of firstStaffByRole) {
      firstStaffByRole.set(rid, { ...s, staffPasswordPlain: plainById.get(s.id) ?? null });
    }

    const rolesOut = roles.map((r) => {
      const s = firstStaffByRole.get(r.id);
      return {
        ...r,
        users: s ? [s] : [],
      };
    });

    return NextResponse.json({ roles: rolesOut });
  } catch (e) {
    console.error("admin roles GET", e);
    return NextResponse.json({ error: "Failed to list roles" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate.response;

  try {
    const json = await req.json().catch(() => ({}));
    const parsed = createSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const permissions = normalizeAdminPermissionList(parsed.data.permissions ?? []);
    const email = parsed.data.staffEmail.toLowerCase().trim();
    const db = getDb();

    const existingEmail = await db.user.findUnique({ where: { email }, select: { id: true } });
    if (existingEmail) {
      return NextResponse.json({ error: "This email is already registered" }, { status: 400 });
    }

    const created = await db.adminRole.create({
      data: {
        name: parsed.data.name.trim(),
        permissions,
      },
      select: { id: true },
    });

    try {
      const passwordHash = await bcrypt.hash(parsed.data.staffPassword, 12);
      const walletAddress = await uniqueWalletForRole(db, created.id);
      const referrerCode = await uniqueReferrerCode(db);
      const newUser = await db.user.create({
        data: {
          username: parsed.data.staffName.trim(),
          email,
          passwordHash,
          walletAddress,
          referrerCode,
          country: "",
          status: "admin",
          adminRoleId: created.id,
          referredById: null,
        },
      });
      await setUserStaffPasswordPlain(db, newUser.id, parsed.data.staffPassword);
    } catch (inner) {
      await db.adminRole.delete({ where: { id: created.id } }).catch(() => undefined);
      throw inner;
    }

    const role = await db.adminRole.findUniqueOrThrow({
      where: { id: created.id },
      select: { id: true, name: true, permissions: true },
    });

    return NextResponse.json({ role });
  } catch (e) {
    console.error("admin roles POST", e);
    const msg = e instanceof Error ? e.message : "Failed to create role";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate.response;

  try {
    const json = await req.json().catch(() => ({}));
    const parsed = patchSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }
    const db = getDb();
    const existing = await db.adminRole.findUnique({ where: { id: parsed.data.id } });
    if (!existing) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }
    const data: { name?: string; permissions?: object } = {};
    if (parsed.data.name !== undefined) data.name = parsed.data.name.trim();
    if (parsed.data.permissions !== undefined) {
      data.permissions = normalizeAdminPermissionList(parsed.data.permissions);
    }
    const role = await db.adminRole.update({
      where: { id: parsed.data.id },
      data,
      select: { id: true, name: true, permissions: true },
    });

    const wantsStaffUpdate =
      parsed.data.staffUsername !== undefined ||
      parsed.data.staffEmail !== undefined ||
      (parsed.data.staffPassword !== undefined && String(parsed.data.staffPassword).length > 0);

    let staffUser: {
      id: string;
      email: string;
      username: string;
      staffPasswordPlain: string | null;
    } | null = null;
    if (wantsStaffUpdate) {
      const staff = await db.user.findFirst({
        where: { adminRoleId: parsed.data.id },
        orderBy: { createdAt: "asc" },
        select: { id: true, email: true, username: true },
      });
      if (!staff) {
        return NextResponse.json(
          { error: "No staff login is linked to this role. Create the role with staff credentials first." },
          { status: 400 },
        );
      }
      const userUpdate: {
        username?: string;
        email?: string;
        passwordHash?: string;
      } = {};
      if (parsed.data.staffUsername !== undefined) {
        userUpdate.username = parsed.data.staffUsername.trim();
      }
      if (parsed.data.staffEmail !== undefined) {
        const nextEmail = parsed.data.staffEmail.toLowerCase().trim();
        if (nextEmail !== staff.email) {
          const taken = await db.user.findUnique({ where: { email: nextEmail }, select: { id: true } });
          if (taken && taken.id !== staff.id) {
            return NextResponse.json({ error: "This email is already used by another account" }, { status: 400 });
          }
        }
        userUpdate.email = nextEmail;
      }
      const pwd = parsed.data.staffPassword;
      if (pwd !== undefined && String(pwd).length > 0) {
        const plain = String(pwd);
        userUpdate.passwordHash = await bcrypt.hash(plain, 12);
      }
      if (Object.keys(userUpdate).length > 0) {
        await db.user.update({
          where: { id: staff.id },
          data: userUpdate,
        });
      }
      if (pwd !== undefined && String(pwd).length > 0) {
        await setUserStaffPasswordPlain(db, staff.id, String(pwd));
      }
      const plainMap = await getStaffPlainsByUserIds(db, [staff.id]);
      const updatedRow = await db.user.findUnique({
        where: { id: staff.id },
        select: { id: true, email: true, username: true },
      });
      if (updatedRow) {
        staffUser = {
          ...updatedRow,
          staffPasswordPlain: plainMap.get(staff.id) ?? null,
        };
      } else {
        staffUser = null;
      }
    }

    if (wantsStaffUpdate && staffUser) {
      return NextResponse.json({ role, staffUser });
    }
    return NextResponse.json({ role });
  } catch (e) {
    console.error("admin roles PATCH", e);
    return NextResponse.json({ error: "Failed to update role" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return gate.response;

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const parsed = deleteSchema.safeParse({ id });
    if (!parsed.success) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const db = getDb();
    await db.user.deleteMany({ where: { adminRoleId: parsed.data.id } });
    await db.adminRole.delete({ where: { id: parsed.data.id } });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("admin roles DELETE", e);
    return NextResponse.json({ error: "Failed to delete role" }, { status: 500 });
  }
}
