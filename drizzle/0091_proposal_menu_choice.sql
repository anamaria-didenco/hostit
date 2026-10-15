-- A proposal can offer its menu packages as a choice ("Shared Franco or Tutto
-- Franco") instead of adding them together: each is priced on its own and the
-- client picks one when accepting.
ALTER TABLE "proposals" ADD COLUMN IF NOT EXISTS "menuChoice" boolean DEFAULT false NOT NULL;
