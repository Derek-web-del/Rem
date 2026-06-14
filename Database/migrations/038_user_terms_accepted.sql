-- Admin (Better Auth user) Terms & Conditions acceptance (idempotent).
ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS terms_accepted BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ NULL;
