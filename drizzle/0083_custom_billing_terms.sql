-- "Custom" billing for food / drinks: the sentence written for this event.
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "billingFoodCustom" text;
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "billingDrinksCustom" text;
