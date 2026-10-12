ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "confirmedAt" timestamp;
--> statement-breakpoint
-- Every booking that's already confirmed: best known time is when it was made.
UPDATE "bookings" SET "confirmedAt" = "createdAt" WHERE "confirmedAt" IS NULL AND "status" IN ('confirmed', 'finished');
--> statement-breakpoint
-- Stamp the first confirmation however it happens (form, board, MCP, Now
-- Book It webhook…). Kept once set, so the Google Ads conversion time never
-- moves and re-uploads of the same booking are de-duplicated by Google.
CREATE OR REPLACE FUNCTION vf_stamp_booking_confirmed_at() RETURNS trigger AS $$
BEGIN
  IF NEW."status" IN ('confirmed', 'finished') AND NEW."confirmedAt" IS NULL THEN
    NEW."confirmedAt" := (now() AT TIME ZONE 'UTC');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "bookings_confirmed_at" ON "bookings";
--> statement-breakpoint
CREATE TRIGGER "bookings_confirmed_at" BEFORE INSERT OR UPDATE OF "status" ON "bookings"
  FOR EACH ROW EXECUTE FUNCTION vf_stamp_booking_confirmed_at();
