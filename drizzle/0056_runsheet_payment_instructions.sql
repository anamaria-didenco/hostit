-- Per-event override for the BEO's "Billing Instructions" paragraph.
--
-- That block rendered venue_settings.paymentInstructions, which is venue-wide.
-- An event with different payment arrangements printed the house default and
-- there was no per-event field to correct it. Null falls back to the venue
-- default, so nothing changes until someone overrides it.
ALTER TABLE "runsheets" ADD COLUMN IF NOT EXISTS "paymentInstructions" text;
