-- Client portal links have always shown the client's payments and balance:
-- the "View Budget" permission was stored (unticked by default) but never
-- checked. It is now enforced as "View Payments", so switch it on for every
-- existing link to keep each one showing what it shows today. A link whose
-- permissions text isn't a JSON object is left alone (it parses as {} and
-- keeps showing payments).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT "id", "permissions" FROM "client_portal_tokens" LOOP
    BEGIN
      UPDATE "client_portal_tokens"
        SET "permissions" = (COALESCE(NULLIF(r."permissions", ''), '{}')::jsonb || '{"viewBudget": true}'::jsonb)::text
        WHERE "id" = r."id" AND jsonb_typeof(COALESCE(NULLIF(r."permissions", ''), '{}')::jsonb) = 'object';
    EXCEPTION WHEN others THEN
      NULL;
    END;
  END LOOP;
END $$;
