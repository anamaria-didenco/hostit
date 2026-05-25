-- Track whether a booking requires a deposit at all. Some events
-- (mates rates, internal staff functions, last-minute walk-ups) don't
-- take a deposit, and the "DEPOSIT PENDING" warning on those events is
-- noise. Default true to preserve existing behaviour.
ALTER TABLE "bookings" ADD COLUMN "depositRequired" boolean DEFAULT true NOT NULL;
