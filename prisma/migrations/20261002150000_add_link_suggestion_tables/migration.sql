-- CreateTable
CREATE TABLE "ArticleLinkIndex" (
    "articleId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "keywords" TEXT[],
    "summarizedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleLinkIndex_pkey" PRIMARY KEY ("articleId")
);

-- CreateTable
CREATE TABLE "ArticleLinkSuggestion" (
    "articleId" TEXT NOT NULL,
    "suggestions" JSONB NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArticleLinkSuggestion_pkey" PRIMARY KEY ("articleId")
);

-- AddForeignKey
ALTER TABLE "ArticleLinkIndex" ADD CONSTRAINT "ArticleLinkIndex_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticleLinkSuggestion" ADD CONSTRAINT "ArticleLinkSuggestion_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

