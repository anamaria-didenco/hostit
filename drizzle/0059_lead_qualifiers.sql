ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "eventFormat" varchar(20);
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "budgetRange" varchar(20);
