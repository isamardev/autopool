import { NextResponse } from "next/server";
import { getUserDashboardPayload } from "@/lib/user-dashboard-data";
import { getUserApiContext } from "@/lib/user-api-auth";
import { DIGITAL_POOL_API_HEADER } from "@/lib/digital-pool-api-constants";

export async function GET(req: Request) {
  try {
    const ctx = await getUserApiContext(req);
    if (!ctx.ok) {
      return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    }

    const tryDigitalPoolL1Reward = req.headers.get(DIGITAL_POOL_API_HEADER) === "1";

    const result = await getUserDashboardPayload(ctx.userId, {
      adminPreview: ctx.impersonation,
      tryDigitalPoolL1Reward,
    });
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json(result.data);
  } catch (e) {
    console.error("GET /api/user/dashboard:", e);
    return NextResponse.json({ error: "Failed to load dashboard" }, { status: 500 });
  }
}
