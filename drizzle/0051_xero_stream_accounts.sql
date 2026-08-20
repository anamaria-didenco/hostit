-- Optional per-stream revenue account codes (food vs beverage).
ALTER TABLE "xero_connections" ADD COLUMN IF NOT EXISTS "salesAccountCodeFood" varchar(20);
--> statement-breakpoint
ALTER TABLE "xero_connections" ADD COLUMN IF NOT EXISTS "salesAccountCodeDrinks" varchar(20);
