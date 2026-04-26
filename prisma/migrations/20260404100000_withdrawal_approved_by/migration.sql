-- AlterTable
ALTER TABLE "Withdrawal" ADD COLUMN IF NOT EXISTS "approvedByUserId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Withdrawal_approvedByUserId_idx" ON "Withdrawal"("approvedByUserId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Withdrawal_approvedByUserId_fkey'
  ) THEN
    ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_approvedByUserId_fkey"
      FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
