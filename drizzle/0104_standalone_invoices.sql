-- Standalone invoices raised straight from the Payments board (not tied to a
-- booking). bookingId becomes nullable, and an optional leadId records the
-- enquiry whose contact details were billed.
ALTER TABLE "xero_invoices" ALTER COLUMN "bookingId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "xero_invoices" ADD COLUMN IF NOT EXISTS "leadId" integer;
