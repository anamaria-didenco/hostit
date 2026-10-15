-- One-off cleanup. Before the cascade delete (#229), deleting an enquiry or an
-- event left its tasks and alerts behind, pointing at a record that no longer
-- exists — they still showed in Tasks and the alerts bell and led nowhere.
-- Deletes now take them too; this removes the ones already left over.
DELETE FROM "tasks" t
WHERE (t."linked_lead_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "leads" l WHERE l."id" = t."linked_lead_id"))
   OR (t."linked_booking_id" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "bookings" b WHERE b."id" = t."linked_booking_id"));
--> statement-breakpoint
DELETE FROM "venue_notifications" n
WHERE (n."leadId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "leads" l WHERE l."id" = n."leadId"))
   OR (n."bookingId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "bookings" b WHERE b."id" = n."bookingId"));
