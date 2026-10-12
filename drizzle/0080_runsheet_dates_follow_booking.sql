-- One date per event: a runsheet linked to a booking takes the booking's date
-- (the calendar, Payments and the BEO already use the booking's). From now on
-- the two are kept in step in both directions.
UPDATE "runsheets" r SET "eventDate" = b."eventDate"
FROM "bookings" b
WHERE r."bookingId" = b."id" AND r."ownerId" = b."ownerId"
  AND b."eventDate" IS NOT NULL AND r."eventDate" IS DISTINCT FROM b."eventDate";
