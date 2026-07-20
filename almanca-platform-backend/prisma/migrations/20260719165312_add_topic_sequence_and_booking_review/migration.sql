-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "isReview" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "ChildProfile" ADD COLUMN     "startSequenceOrder" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Topic" ADD COLUMN     "orderInUnit" INTEGER,
ADD COLUMN     "sequenceOrder" INTEGER,
ADD COLUMN     "unitNumber" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Topic_sequenceOrder_key" ON "Topic"("sequenceOrder");

