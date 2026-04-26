-- CreateEnum
CREATE TYPE "DigitalPoolAuditAction" AS ENUM ('LOGIN_SUCCESS', 'LOGOUT');

-- CreateTable
CREATE TABLE "DigitalPoolAuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" "DigitalPoolAuditAction" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DigitalPoolAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DigitalPoolAuditLog_userId_idx" ON "DigitalPoolAuditLog"("userId");

-- CreateIndex
CREATE INDEX "DigitalPoolAuditLog_createdAt_idx" ON "DigitalPoolAuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "DigitalPoolAuditLog" ADD CONSTRAINT "DigitalPoolAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
