ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "minimumSpend" numeric(10, 2);
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "minimumSpend" numeric(10, 2);
