-- The rest of the hot lookups: a booking's or enquiry's runsheets (opened from
-- every event, and by the date/time cascades) and an enquiry's proposals.
CREATE INDEX IF NOT EXISTS "runsheets_booking_idx" ON "runsheets" ("bookingId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "runsheets_lead_idx" ON "runsheets" ("leadId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proposals_lead_idx" ON "proposals" ("leadId");
