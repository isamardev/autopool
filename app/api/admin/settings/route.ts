import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { readWhatsAppAndReceiverFromDb, writeWhatsAppAndReceiverToDb } from "@/lib/receiver-wallet";
import { requireAdminSection } from "@/lib/admin-api-guard";
import { DEFAULT_LEVEL_PERCENTAGES, MLM_SETTINGS_KEY } from "@/lib/mlm-logic";

const patchSchema = z.object({
  levelPercentages: z.array(z.number().min(0)).length(20).optional(),
  whatsappNumber: z.string().optional(),
});

async function ensureSettingsColumns(db: ReturnType<typeof getDb>) {
  try {
    await db.$executeRawUnsafe(
      `ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "whatsapp" TEXT DEFAULT ''`,
    );
  } catch {
    /* older PG without IF NOT EXISTS — ignore */
  }
}

async function ensureSettingsRow(db: ReturnType<typeof getDb>) {
  let setting = await db.setting.findUnique({ where: { key: MLM_SETTINGS_KEY } });
  if (!setting) {
    setting = await db.setting.create({
      data: {
        key: MLM_SETTINGS_KEY,
        levelPercentages: DEFAULT_LEVEL_PERCENTAGES,
      },
    });
  }
  return setting;
}

async function readSettingsExtras(db: ReturnType<typeof getDb>) {
  return readWhatsAppAndReceiverFromDb(db);
}

export async function PATCH(req: Request) {
  try {
    const gate = await requireAdminSection("settings");
    if (!gate.ok) return gate.response;

    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const db = getDb();
    const { whatsappNumber } = parsed.data;

    await ensureSettingsColumns(db);
    await ensureSettingsRow(db);

    const data: { whatsapp?: string } = {};
    if (whatsappNumber !== undefined) data.whatsapp = whatsappNumber;
    if (Object.keys(data).length > 0) {
      await writeWhatsAppAndReceiverToDb(db, data);
    }

    const fresh = await readSettingsExtras(db);

    return NextResponse.json({
      success: true,
      whatsappNumber: fresh.whatsapp,
    });
  } catch (e) {
    console.error("PATCH /api/admin/settings:", e);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const gate = await requireAdminSection("settings");
    if (!gate.ok) return gate.response;

    const db = getDb();
    await ensureSettingsColumns(db);

    const setting = await ensureSettingsRow(db);
    const extras = await readSettingsExtras(db);

    return NextResponse.json({
      key: setting.key,
      levelPercentages: setting.levelPercentages,
      whatsappNumber: extras.whatsapp,
    });
  } catch {
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}
