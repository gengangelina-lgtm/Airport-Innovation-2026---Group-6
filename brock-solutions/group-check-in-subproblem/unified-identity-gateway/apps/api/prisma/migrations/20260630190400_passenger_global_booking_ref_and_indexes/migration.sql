-- DropIndex
DROP INDEX "Passenger_flightId_bookingRef_key";

-- CreateIndex
CREATE INDEX "AuditLog_passengerId_idx" ON "AuditLog"("passengerId");

-- CreateIndex
CREATE INDEX "Bag_passengerId_idx" ON "Bag"("passengerId");

-- CreateIndex
CREATE UNIQUE INDEX "Passenger_bookingRef_key" ON "Passenger"("bookingRef");

