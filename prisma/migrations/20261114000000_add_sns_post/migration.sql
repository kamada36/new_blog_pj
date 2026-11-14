-- CreateTable
CREATE TABLE "SnsPost" (
    "id" TEXT NOT NULL,
    "variant" INTEGER NOT NULL,
    "mainText" TEXT NOT NULL,
    "replyBody" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "scheduledDate" TEXT,
    "slot" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "articleId" TEXT NOT NULL,

    CONSTRAINT "SnsPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SnsPost_status_scheduledDate_idx" ON "SnsPost"("status", "scheduledDate");

-- CreateIndex
CREATE UNIQUE INDEX "SnsPost_articleId_variant_key" ON "SnsPost"("articleId", "variant");

-- AddForeignKey
ALTER TABLE "SnsPost" ADD CONSTRAINT "SnsPost_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
