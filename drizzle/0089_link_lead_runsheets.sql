-- One-off backfill. A run sheet started from an enquiry was saved with the
-- enquiry's id only, and stayed that way after the enquiry got its event —
-- so the event page, the BEO's guest count and guest edits couldn't find it,
-- and opening the run sheet from the event made a second, empty one. New
-- sheets are now linked when the event exists or is made; this links the
-- ones already left over, only where the enquiry has exactly one event that
-- isn't cancelled (same account), so nothing is guessed.
UPDATE "runsheets" r
SET "bookingId" = b."id"
FROM "bookings" b
WHERE r."bookingId" IS NULL
  AND r."leadId" IS NOT NULL
  AND b."leadId" = r."leadId"
  AND b."ownerId" = r."ownerId"
  AND b."status" <> 'cancelled'
  AND (SELECT count(*) FROM "bookings" b2
       WHERE b2."leadId" = r."leadId" AND b2."ownerId" = r."ownerId" AND b2."status" <> 'cancelled') = 1;
