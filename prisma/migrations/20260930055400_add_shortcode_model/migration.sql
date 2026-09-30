-- CreateTable
CREATE TABLE "Shortcode" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "iconUrl" TEXT NOT NULL,
    "position" TEXT NOT NULL DEFAULT 'l',
    "defaultTalk" TEXT NOT NULL DEFAULT 'コメント',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shortcode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shortcode_name_key" ON "Shortcode"("name");
