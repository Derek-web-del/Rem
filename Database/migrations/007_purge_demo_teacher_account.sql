-- Purge default Glendale demo faculty (teacher@glendale.edu / username teacher).
-- Better Auth uses quoted table "user", not public.users.
-- Run: psql "$DATABASE_URL" -f Database/migrations/007_purge_demo_teacher_account.sql
-- Or: npm run purge:demo-teacher

BEGIN;

-- 1) Capture auth user id(s) before deleting faculty rows
CREATE TEMP TABLE IF NOT EXISTS _purge_demo_teacher_users (id TEXT PRIMARY KEY);
TRUNCATE _purge_demo_teacher_users;

INSERT INTO _purge_demo_teacher_users (id)
SELECT id::text FROM "user"
WHERE LOWER(email) = LOWER('teacher@glendale.edu')
   OR LOWER(username) = LOWER('teacher');

-- 2) Faculty roster + section links (public.faculties; faculty_sections.faculty_id may be integer)
DELETE FROM public.faculty_sections fs
WHERE EXISTS (
  SELECT 1 FROM public.faculties f
  WHERE fs.faculty_id::text = f.id
    AND (
      LOWER(f.email) = LOWER('teacher@glendale.edu')
      OR LOWER(COALESCE(f.faculty_username, '')) = LOWER('teacher')
      OR COALESCE(f.auth_user_id::text, '') IN (SELECT id FROM _purge_demo_teacher_users)
    )
);

DELETE FROM public.faculties
WHERE LOWER(email) = LOWER('teacher@glendale.edu')
   OR LOWER(COALESCE(faculty_username, '')) = LOWER('teacher')
   OR COALESCE(auth_user_id::text, '') IN (SELECT id FROM _purge_demo_teacher_users);

-- 3) Better Auth graph (sessions, accounts, 2FA, verification)
DELETE FROM "session" WHERE "userId"::text IN (SELECT id FROM _purge_demo_teacher_users);
DELETE FROM "account" WHERE "userId"::text IN (SELECT id FROM _purge_demo_teacher_users);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'twoFactor'
  ) THEN
    EXECUTE 'DELETE FROM "twoFactor" WHERE "userId"::text IN (SELECT id FROM _purge_demo_teacher_users)';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'verification' AND column_name = 'userId'
  ) THEN
    EXECUTE 'DELETE FROM verification WHERE "userId"::text IN (SELECT id FROM _purge_demo_teacher_users)';
  END IF;
END $$;

DELETE FROM "user"
WHERE id::text IN (SELECT id FROM _purge_demo_teacher_users);

-- Legacy alias (if a public.users mirror exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'users'
  ) THEN
    EXECUTE $q$
      DELETE FROM public.users
      WHERE LOWER(email) = LOWER('teacher@glendale.edu')
         OR LOWER(username) = LOWER('teacher')
    $q$;
  END IF;
END $$;

DROP TABLE IF EXISTS _purge_demo_teacher_users;

COMMIT;
