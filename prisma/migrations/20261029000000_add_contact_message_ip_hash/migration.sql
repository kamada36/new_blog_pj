-- AlterTable
ALTER TABLE "ContactMessage" ADD COLUMN "ipHash" TEXT;

-- CreateIndex
CREATE INDEX "ContactMessage_ipHash_createdAt_idx" ON "ContactMessage"("ipHash", "createdAt");
