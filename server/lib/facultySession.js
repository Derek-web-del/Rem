/** Shared faculty row lookup for authenticated teacher/faculty sessions. */

let facultyArchivedColumnMemo = null

async function facultiesHasArchivedAt(pool) {
  if (facultyArchivedColumnMemo != null) return facultyArchivedColumnMemo
  try {
    const { rows } = await pool.query(
      `
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'faculties'
          AND column_name = 'archived_at'
        LIMIT 1
      `,
    )
    facultyArchivedColumnMemo = rows?.length > 0
    return facultyArchivedColumnMemo
  } catch {
    facultyArchivedColumnMemo = false
    return false
  }
}

async function facultyActivePredicate(pool, alias = 'f') {
  const ok = await facultiesHasArchivedAt(pool)
  return ok ? ` AND ${alias}.archived_at IS NULL ` : ''
}

export async function fetchFacultyRowForSession(pool, user) {
  const uid = String(user?.id || '').trim()
  const email = String(user?.email || '').trim().toLowerCase()
  const username = String(user?.username || '').trim()

  const active = await facultyActivePredicate(pool)

  const { rows } = await pool.query(
    `
    SELECT f.*
    FROM public.faculties f
    WHERE 1=1 ${active}
    AND (
      f.auth_user_id = $1
      OR lower(trim(coalesce(f.email, ''))) = lower(trim(coalesce($2::text, '')))
      OR ($3 <> ''
        AND (
          lower(trim(coalesce(f.faculty_username, ''))) = lower(trim($3::text))
          OR lower(trim(coalesce(f.faculty_code, ''))) = lower(trim($3::text))
          OR lower(trim(coalesce(f.employee_id, ''))) = lower(trim($3::text))
        )
      )
    )
    ORDER BY
      CASE
        WHEN f.auth_user_id = $1 THEN 0
        WHEN lower(trim(coalesce(f.email, ''))) = lower(trim(coalesce($2::text, ''))) THEN 1
        ELSE 2
      END
    LIMIT 1
    `,
    [uid, email, username],
  )
  return rows?.[0] || null
}

function buildFacultyDisplayName(firstName, middleName, lastName, fallback = '') {
  const composed = [firstName, middleName, lastName].filter(Boolean).join(' ').trim()
  return composed || String(fallback || '').trim()
}

export function facultyDisplayName(row) {
  if (!row || typeof row !== 'object') return 'Faculty'
  return (
    buildFacultyDisplayName(row.first_name, row.middle_name, row.last_name, row.name) || 'Faculty'
  )
}
