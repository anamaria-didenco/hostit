-- Backfill: the "__DeployCheck__" lead was a one-off manual POST to
-- leads.submit made to verify the 0060 migration had applied in production
-- (see PR #122). It landed as an ordinary source='lead_form' row and showed
-- up in the dashboard as an unread "New Enquiry", indistinguishable from a
-- real one. Reclassify it under the 'healthcheck' source convention (now
-- excluded from leads.list and friends by default — see server/db.ts and
-- server/routers.ts) instead of deleting it, so the same convention covers
-- any future manual verification ping.
UPDATE "leads" SET "source" = 'healthcheck'
WHERE "firstName" = '__DeployCheck__' AND "email" LIKE '%@example.co.nz';
