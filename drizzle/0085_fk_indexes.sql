-- Indexes for the foreign keys every event page looks up by: a venue's
-- bookings, an enquiry's booking, a booking's payments, a runsheet's timeline
-- and F&B rows, an enquiry's activity. Plain CREATE INDEX (not CONCURRENTLY):
-- migrations run in one transaction on boot and these tables are small.
CREATE INDEX IF NOT EXISTS "bookings_owner_idx" ON "bookings" ("ownerId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bookings_lead_idx" ON "bookings" ("leadId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_booking_idx" ON "payments" ("bookingId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "runsheet_items_runsheet_idx" ON "runsheet_items" ("runsheetId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fnb_items_runsheet_idx" ON "fnb_items" ("runsheetId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lead_activity_lead_idx" ON "lead_activity" ("leadId");
