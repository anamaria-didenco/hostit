-- Custom calendar colour per event space, as #RRGGBB. Null = pick one
-- automatically from the space name (the previous behaviour).
ALTER TABLE "event_spaces" ADD COLUMN IF NOT EXISTS "color" varchar(9);
