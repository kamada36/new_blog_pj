-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SiteSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "siteName" TEXT NOT NULL DEFAULT 'レジリエンサーCafe',
    "tagline" TEXT NOT NULL DEFAULT 'YOUR RESILIENCE MATTERS!',
    "footerCopyright" TEXT NOT NULL DEFAULT 'レジリエンサーCafe',
    "sponsorSidebarEmbed" TEXT NOT NULL DEFAULT '',
    "sponsorFooterEmbed" TEXT NOT NULL DEFAULT ''
);
INSERT INTO "new_SiteSetting" ("footerCopyright", "id", "siteName", "tagline") SELECT "footerCopyright", "id", "siteName", "tagline" FROM "SiteSetting";
DROP TABLE "SiteSetting";
ALTER TABLE "new_SiteSetting" RENAME TO "SiteSetting";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
