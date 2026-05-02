ALTER TABLE "venue_settings" ADD COLUMN IF NOT EXISTS "nbiAccountId" varchar(100);
ALTER TABLE "venue_settings" ADD COLUMN IF NOT EXISTS "nbiServiceId" varchar(100);
