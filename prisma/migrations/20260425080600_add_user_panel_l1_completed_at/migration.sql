ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "userPanelLevel1CompletedAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "User_userPanelLevel1CompletedAt_idx"
ON "User"("userPanelLevel1CompletedAt");
