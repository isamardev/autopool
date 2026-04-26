-- AlterTable
ALTER TABLE "Withdrawal" ADD COLUMN IF NOT EXISTS "rejectedByUserId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Withdrawal_rejectedByUserId_idx" ON "Withdrawal"("rejectedByUserId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Withdrawal_rejectedByUserId_fkey'
  ) THEN
    ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_rejectedByUserId_fkey"
      FOREIGN KEY ("rejectedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
