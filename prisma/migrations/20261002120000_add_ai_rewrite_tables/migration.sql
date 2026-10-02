-- CreateTable
CREATE TABLE "ArticleRewriteBackup" (
    "articleId" TEXT NOT NULL,
    "originalContent" TEXT NOT NULL,
    "originalStatus" TEXT NOT NULL,
    "originalPublishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleRewriteBackup_pkey" PRIMARY KEY ("articleId")
);

-- CreateTable
CREATE TABLE "ArticleRewriteLog" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "articleTitle" TEXT NOT NULL,
    "articleSlug" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT '',
    "instruction" TEXT NOT NULL DEFAULT '',
    "summary" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleRewriteLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ArticleRewriteLog_createdAt_idx" ON "ArticleRewriteLog"("createdAt");

-- CreateIndex
CREATE INDEX "ArticleRewriteLog_articleId_idx" ON "ArticleRewriteLog"("articleId");

-- AddForeignKey
ALTER TABLE "ArticleRewriteBackup" ADD CONSTRAINT "ArticleRewriteBackup_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;
