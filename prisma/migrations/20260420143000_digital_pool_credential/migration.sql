-- CreateTable
CREATE TABLE "DigitalPoolCredential" (
    "userId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "passwordPlain" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DigitalPoolCredential_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "DigitalPoolCredential_email_idx" ON "DigitalPoolCredential"("email");

-- AddForeignKey
ALTER TABLE "DigitalPoolCredential" ADD CONSTRAINT "DigitalPoolCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
