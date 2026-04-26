-- Team activity for auto withdraw suspend (10 days / 10 upline levels)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastDownlineActivityAt" TIMESTAMP(3);
UPDATE "User" SET "lastDownlineActivityAt" = "createdAt" WHERE "lastDownlineActivityAt" IS NULL;
ALTER TABLE "User" ALTER COLUMN "lastDownlineActivityAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "User" ALTER COLUMN "lastDownlineActivityAt" SET NOT NULL;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "withdrawSuspendSource" TEXT;
