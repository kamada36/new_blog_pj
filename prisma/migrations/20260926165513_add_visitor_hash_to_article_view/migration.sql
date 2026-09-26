-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ArticleView" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "visitorHash" TEXT NOT NULL DEFAULT '',
    "articleId" TEXT NOT NULL,
    CONSTRAINT "ArticleView_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ArticleView" ("articleId", "createdAt", "id") SELECT "articleId", "createdAt", "id" FROM "ArticleView";
DROP TABLE "ArticleView";
ALTER TABLE "new_ArticleView" RENAME TO "ArticleView";
CREATE INDEX "ArticleView_articleId_createdAt_idx" ON "ArticleView"("articleId", "createdAt");
CREATE INDEX "ArticleView_articleId_visitorHash_createdAt_idx" ON "ArticleView"("articleId", "visitorHash", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
