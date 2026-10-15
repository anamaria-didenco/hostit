-- "Since your last visit": remember when each user last loaded their
-- dashboard so the Overview can show what changed since then. Null until the
-- first visit is recorded (dashboard.markSeen), which the feed treats as
-- "show nothing yet" rather than "show everything ever".
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lastSeenAt" bigint;
