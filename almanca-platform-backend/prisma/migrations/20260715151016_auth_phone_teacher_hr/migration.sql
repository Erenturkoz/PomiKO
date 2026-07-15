/*
  Warnings:

  - You are about to drop the column `pinHash` on the `User` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "TeacherProfile" ADD COLUMN     "adminNote" TEXT,
ADD COLUMN     "birthDate" TIMESTAMP(3),
ADD COLUMN     "education" TEXT,
ADD COLUMN     "experienceYears" INTEGER,
ADD COLUMN     "iban" TEXT,
ADD COLUMN     "initialPassword" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "specialties" TEXT,
ADD COLUMN     "startDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" DROP COLUMN "pinHash",
ADD COLUMN     "phone" TEXT;
