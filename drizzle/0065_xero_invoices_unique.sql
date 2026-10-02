-- Prevent duplicate tracking rows for the same Xero invoice. Remove any
-- pre-existing duplicates first (keep the earliest row per owner + invoice id).
DELETE FROM "xero_invoices" a
USING "xero_invoices" b
WHERE a."xeroInvoiceId" IS NOT NULL
  AND a."xeroInvoiceId" = b."xeroInvoiceId"
  AND a."ownerId" = b."ownerId"
  AND a.id > b.id;
--> statement-breakpoint
CREATE UNIQUE INDEX "xero_invoices_owner_invoice_uq" ON "xero_invoices" ("ownerId","xeroInvoiceId") WHERE "xeroInvoiceId" IS NOT NULL;
