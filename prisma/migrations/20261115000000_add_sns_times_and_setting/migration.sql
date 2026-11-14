-- AlterTable
ALTER TABLE "SnsPost" ADD COLUMN     "replyTime" TEXT,
ADD COLUMN     "scheduledTime" TEXT;

-- CreateTable
CREATE TABLE "SnsSetting" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "timeFrames" TEXT NOT NULL DEFAULT '07:30-08:30,12:00-13:00,20:00-22:00',
    "replyDelayMin" INTEGER NOT NULL DEFAULT 3,
    "replyDelayMax" INTEGER NOT NULL DEFAULT 7,

    CONSTRAINT "SnsSetting_pkey" PRIMARY KEY ("id")
);
