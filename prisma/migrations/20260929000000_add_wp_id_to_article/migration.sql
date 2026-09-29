-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "wpId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Article_wpId_key" ON "Article"("wpId");
