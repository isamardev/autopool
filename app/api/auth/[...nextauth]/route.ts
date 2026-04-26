import { handlers } from "@/auth";

/** Prisma + bcrypt need the Node.js runtime (not Edge). */
export const runtime = "nodejs";

/** Cold start + DB (Vercel caps by plan; value is clamped automatically). */
export const maxDuration = 60;

export const { GET, POST } = handlers;

