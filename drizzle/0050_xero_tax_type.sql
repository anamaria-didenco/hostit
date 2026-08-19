-- Store the Xero org's verified GST-on-income tax type (never hardcode it).
ALTER TABLE "xero_connections" ADD COLUMN IF NOT EXISTS "salesTaxType" varchar(20);
