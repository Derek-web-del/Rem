/** Shared teacher ↔ subject ownership checks and ID resolution after admin recreate. */

export function stripArchivedSubjectCode(subjectCode) {
  return String(subjectCode ?? '')
    .trim()
    .replace(/__a\d+$/i, '')
    .trim()
}

/** SQL fragment: subject row is assigned to the faculty id at $facultyParamIndex. */
export function facultyOwnsSubjectSql(subjectAlias = 'sub', facultyParamIndex = 2) {
  const facultyRef = `$${facultyParamIndex}::text`
  return `
    EXISTS (
      SELECT 1
      FROM public.faculties f
      WHERE f.id::text = ${facultyRef}
        AND f.archived_at IS NULL
        AND (
          ${subjectAlias}.faculty_id::text = f.id::text
          OR NULLIF(trim(${subjectAlias}.faculty_id::text), '') = NULLIF(trim(f.faculty_code), '')
          OR NULLIF(trim(${subjectAlias}.faculty_id::text), '') = NULLIF(trim(f.employee_id), '')
          OR NULLIF(trim(${subjectAlias}.faculty_id::text), '') = NULLIF(trim(f.faculty_username), '')
        )
    )
  `
}

export async function resolveCanonicalFacultyId(pool, facultyIdOrCode) {
  const raw = String(facultyIdOrCode ?? '').trim()
  if (!raw) return null
  try {
    const { rows } = await pool.query(
      `
      SELECT id
      FROM public.faculties
      WHERE archived_at IS NULL
        AND (
          id::text = $1
          OR lower(trim(coalesce(faculty_code, ''))) = lower($1)
          OR lower(trim(coalesce(employee_id, ''))) = lower($1)
          OR lower(trim(coalesce(faculty_username, ''))) = lower($1)
        )
      ORDER BY CASE WHEN id::text = $1 THEN 0 ELSE 1 END
      LIMIT 1
      `,
      [raw],
    )
    const id = rows?.[0]?.id
    return id != null ? String(id).trim() : raw
  } catch {
    return raw
  }
}

export async function teacherOwnsSubject(pool, facultyId, subjectId, subjectArchivePredicate = '') {
  const sid = Number(subjectId)
  const fid = String(facultyId ?? '').trim()
  if (!Number.isFinite(sid) || sid <= 0 || !fid) return false
  try {
    const ownSql = facultyOwnsSubjectSql('sub', 2)
    const { rows } = await pool.query(
      `
      SELECT 1
      FROM subjects sub
      WHERE sub.id = $1
        AND (${ownSql})
        ${subjectArchivePredicate}
      LIMIT 1
      `,
      [sid, fid],
    )
    return rows?.length > 0
  } catch {
    return false
  }
}

/**
 * Resolve an active subject id for a teacher, including after admin delete + recreate.
 * @returns {{ subjectId: number, resolvedFromSubjectId: number | null } | null}
 */
export async function resolveTeacherSubjectForFaculty(
  pool,
  facultyId,
  subjectId,
  { subjectArchivePredicate = '' } = {},
) {
  const requestedId = Number(subjectId)
  const fid = String(facultyId ?? '').trim()
  if (!Number.isFinite(requestedId) || requestedId <= 0 || !fid) return null

  const ownSql = facultyOwnsSubjectSql('sub', 2)

  const { rows: activeRows } = await pool.query(
    `
    SELECT sub.id
    FROM subjects sub
    WHERE sub.id = $1
      AND (${ownSql})
      ${subjectArchivePredicate}
    LIMIT 1
    `,
    [requestedId, fid],
  )
  if (activeRows?.[0]?.id != null) {
    return { subjectId: Number(activeRows[0].id), resolvedFromSubjectId: null }
  }

  const { rows: archivedRows } = await pool.query(
    `
    SELECT sub.subject_code
    FROM subjects sub
    WHERE sub.id = $1
      AND sub.archived_at IS NOT NULL
      AND (${ownSql})
    LIMIT 1
    `,
    [requestedId, fid],
  )
  const archivedCode = archivedRows?.[0]?.subject_code
  if (!archivedCode) return null

  const baseCode = stripArchivedSubjectCode(archivedCode)
  if (!baseCode) return null

  const { rows: replacementRows } = await pool.query(
    `
    SELECT sub.id
    FROM subjects sub
    WHERE lower(trim(sub.subject_code)) = lower(trim($2::text))
      AND (${facultyOwnsSubjectSql('sub', 1)})
      ${subjectArchivePredicate}
    ORDER BY sub.id DESC
    LIMIT 1
    `,
    [fid, baseCode],
  )
  const replacementId = replacementRows?.[0]?.id
  if (replacementId == null) return null

  return {
    subjectId: Number(replacementId),
    resolvedFromSubjectId: requestedId,
  }
}
