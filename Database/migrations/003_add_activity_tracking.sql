-- Better Auth Infra dash() activity tracking: lastActiveAt on "user".
-- Safe to re-run (PostgreSQL).

ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS "lastActiveAt" TIMESTAMPTZ NULL;
