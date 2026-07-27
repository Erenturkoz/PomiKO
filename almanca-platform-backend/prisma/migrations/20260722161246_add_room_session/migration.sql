-- CreateTable
CREATE TABLE "RoomSession" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RoomSession_bookingId_role_key" ON "RoomSession"("bookingId", "role");

-- AddForeignKey
ALTER TABLE "RoomSession" ADD CONSTRAINT "RoomSession_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

