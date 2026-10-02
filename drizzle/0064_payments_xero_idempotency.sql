-- Make Xero payment imports idempotent at the DB level and enable void reversal.
-- First remove any duplicate Xero-sourced rows that slipped in before the
-- constraint existed (keep the earliest row per owner + Xero payment id).
DELETE FROM "payments" p
USING "payments" q
WHERE p."xeroPaymentId" IS NOT NULL
  AND p."xeroPaymentId" = q."xeroPaymentId"
  AND p."ownerId" = q."ownerId"
  AND p.id > q.id;
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "xeroInvoiceId" varchar(64);
--> statement-breakpoint
CREATE UNIQUE INDEX "payments_owner_xeropayment_uq" ON "payments" ("ownerId","xeroPaymentId") WHERE "xeroPaymentId" IS NOT NULL;
