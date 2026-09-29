ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "eventDetail" varchar(255);
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "invoicingNote" varchar(255);
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "walkthroughSlot" varchar(60);
