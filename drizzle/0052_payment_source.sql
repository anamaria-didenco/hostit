-- Track where a payment record came from, so payments reconciled in Xero can
-- be imported without ever duplicating on repeat syncs.
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "source" varchar(20) DEFAULT 'manual' NOT NULL;
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "xeroPaymentId" varchar(64);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payments_xeroPaymentId_key" ON "payments" ("xeroPaymentId") WHERE "xeroPaymentId" IS NOT NULL;
