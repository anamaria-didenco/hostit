ALTER TABLE "fnb_items" ADD COLUMN IF NOT EXISTS "previousDishName" varchar(255);
--> statement-breakpoint
ALTER TABLE "runsheets" ADD COLUMN IF NOT EXISTS "setupSummary" varchar(255);
