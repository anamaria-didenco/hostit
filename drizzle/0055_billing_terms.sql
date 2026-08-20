-- Billing TERMS per event, separate from the payment PROGRESS already tracked
-- by foodStatus / drinksStatus.
--
-- The BEO's "How this event is billed" block was hardcoded prose. The Food line
-- always read "Invoiced and paid before the event. Do not charge food on the
-- night" regardless of the actual arrangement, and the Deposit line always
-- claimed the deposit came off the drinks bill. Staff read that block to decide
-- what to charge on the night, so wrong wording there is a money error.
--
-- All nullable: null falls back to the previous wording, so existing events
-- are unchanged until someone picks something.
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "billingFood" varchar(24);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "billingDrinks" varchar(24);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "billingDepositApplied" varchar(16);
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "billingNote" text;
