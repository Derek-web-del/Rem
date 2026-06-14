-- Student PII field encryption (application-layer AES-256-GCM).
-- Values stored as enc:v1:<iv>:<tag>:<cipher> by server/lib/studentPiiCrypto.js.
-- dob must be TEXT to hold ciphertext (was DATE).
ALTER TABLE public.students
  ALTER COLUMN dob TYPE TEXT USING CASE WHEN dob IS NULL THEN NULL ELSE dob::text END;
-- Run: node --env-file=.env scripts/encrypt-existing-student-pii.mjs
