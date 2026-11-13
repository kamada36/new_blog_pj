-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "affiliateStatus" TEXT NOT NULL DEFAULT 'none';

-- CreateTable
CREATE TABLE "AffiliateProgram" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "asp" TEXT NOT NULL,
    "keys" TEXT[],
    "memo" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AffiliateProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticleAffiliateLink" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "anchorText" TEXT NOT NULL DEFAULT '',
    "imageUrl" TEXT,
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "articleId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,

    CONSTRAINT "ArticleAffiliateLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ArticleAffiliateLink_programId_idx" ON "ArticleAffiliateLink"("programId");

-- CreateIndex
CREATE UNIQUE INDEX "ArticleAffiliateLink_articleId_kind_url_key" ON "ArticleAffiliateLink"("articleId", "kind", "url");

-- CreateIndex
CREATE INDEX "Article_affiliateStatus_idx" ON "Article"("affiliateStatus");

-- AddForeignKey
ALTER TABLE "ArticleAffiliateLink" ADD CONSTRAINT "ArticleAffiliateLink_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleAffiliateLink" ADD CONSTRAINT "ArticleAffiliateLink_programId_fkey" FOREIGN KEY ("programId") REFERENCES "AffiliateProgram"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
