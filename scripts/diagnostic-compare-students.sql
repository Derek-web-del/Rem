-- Compare two student accounts (e.g. SUHOOK vs SUGAB).
-- Run manually in psql or pgAdmin against lenlearn_db.
-- Note: students table uses first_name/middle_name/last_name (not full_name);
--       login_id serves as student login code; status is derived from archived_at.

SELECT
  s.id,
  trim(concat_ws(' ', s.first_name, s.middle_name, s.last_name)) AS full_name,
  s.auth_user_id,
  s.grade_level,
  s.section_id,
  s.terms_accepted,
  s.login_id AS student_code,
  CASE WHEN s.archived_at IS NULL THEN 'active' ELSE 'archived' END AS status,
  u.id AS auth_id,
  u.role,
  u.email,
  u.username AS auth_username
FROM students s
LEFT JOIN "user" u ON u.id = s.auth_user_id
WHERE trim(concat_ws(' ', s.first_name, s.middle_name, s.last_name)) ILIKE '%SUHOOK%'
   OR trim(concat_ws(' ', s.first_name, s.middle_name, s.last_name)) ILIKE '%SUGAB%'
   OR s.login_id ILIKE '%SUHOOK%'
   OR s.login_id ILIKE '%SUGAB%'
ORDER BY s.id;
