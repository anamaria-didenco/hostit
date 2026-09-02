-- Drink prices on runsheets are DOLLARS, but a bug stored catalogue prices in
-- CENTS (an $85.00 wine saved as 8500 and printed as $8,500.00 on the BEO).
-- Repair: any per-drink price of $500 or more is cents — no single drink at
-- this venue costs $500 (the dearest bottle is $165; bar TABS live elsewhere)
-- while every poisoned value is at least 800 (the $8 sodas).
UPDATE "runsheets" r SET "drinksData" = (
  SELECT jsonb_set(r."drinksData"::jsonb, '{drinkPrices}',
    COALESCE((SELECT jsonb_object_agg(e.key,
        CASE WHEN (e.value #>> '{}') ~ '^[0-9]+(\.[0-9]+)?$' AND (e.value #>> '{}')::numeric >= 500
             THEN to_jsonb(round((e.value #>> '{}')::numeric / 100, 2))
             ELSE e.value END)
      FROM jsonb_each(r."drinksData"::jsonb -> 'drinkPrices') e), '{}'::jsonb))
)::json
WHERE r."drinksData" IS NOT NULL
  AND jsonb_typeof(r."drinksData"::jsonb -> 'drinkPrices') = 'object'
  AND EXISTS (
    SELECT 1 FROM jsonb_each(r."drinksData"::jsonb -> 'drinkPrices') e
    WHERE (e.value #>> '{}') ~ '^[0-9]+(\.[0-9]+)?$' AND (e.value #>> '{}')::numeric >= 500);
