
-- CreateTable
CREATE TABLE "LoginFailure" (
    "id" SERIAL NOT NULL,
    "ipHash" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginFailure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoginFailure_ipHash_createdAt_idx" ON "LoginFailure"("ipHash", "createdAt");

-- CreateIndex
CREATE INDEX "LoginFailure_email_createdAt_idx" ON "LoginFailure"("email", "createdAt");

