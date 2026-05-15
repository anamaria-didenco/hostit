ALTER TABLE "proposal_drinks" ADD COLUMN IF NOT EXISTS "selectedSampleItems" jsonb DEFAULT '[]'::jsonb;
