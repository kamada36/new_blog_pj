-- AlterTable
ALTER TABLE "SiteSetting" ADD COLUMN     "residentAvatarUrl" TEXT,
ADD COLUMN     "residentBio" TEXT NOT NULL DEFAULT 'プログラミングを勉強中でエンジニアへの転職に憧れている。日々このサイト内でレジサンからITに関する様々な事を学んでいる。',
ADD COLUMN     "residentName" TEXT NOT NULL DEFAULT 'アイコ';
