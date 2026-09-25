-- Persist the runsheet's client contact fields.
--
-- The Runsheet Builder's CLIENT NAME / PHONE / EMAIL inputs were editable and
-- sat under an "All changes saved" header, but they were never written to the
-- database — every reload emptied them again. Null falls back to the linked
-- lead / booking's contact details, so existing runsheets are unaffected.
ALTER TABLE "runsheets" ADD COLUMN IF NOT EXISTS "contactName" varchar(255);--> statement-breakpoint
ALTER TABLE "runsheets" ADD COLUMN IF NOT EXISTS "contactEmail" varchar(320);--> statement-breakpoint
ALTER TABLE "runsheets" ADD COLUMN IF NOT EXISTS "contactPhone" varchar(50);
