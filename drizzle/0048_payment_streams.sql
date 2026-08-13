-- Payment-workflow tracking for the Payments board.
-- Food and drinks settle on different terms, so each event tracks the two
-- streams separately (on top of the existing deposit flags).
ALTER TABLE "bookings" ADD COLUMN "foodStatus" varchar(20) DEFAULT 'to_invoice' NOT NULL;
--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "drinksStatus" varchar(20);
