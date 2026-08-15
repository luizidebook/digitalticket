-- AlterTable
ALTER TABLE "Lot" ADD COLUMN     "eventDateId" TEXT;

-- CreateTable
CREATE TABLE "EventDate" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "label" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventDate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventDate_eventId_active_sortOrder_idx" ON "EventDate"("eventId", "active", "sortOrder");

-- CreateIndex
CREATE INDEX "Lot_eventDateId_idx" ON "Lot"("eventDateId");

-- AddForeignKey
ALTER TABLE "EventDate" ADD CONSTRAINT "EventDate_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_eventDateId_fkey" FOREIGN KEY ("eventDateId") REFERENCES "EventDate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
