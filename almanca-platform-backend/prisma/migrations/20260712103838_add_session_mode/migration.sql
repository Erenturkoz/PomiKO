-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN     "childProfileId" TEXT,
ADD COLUMN     "mode" TEXT NOT NULL DEFAULT 'account';
