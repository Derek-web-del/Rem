import { sendSafeServerError } from '../lib/safeApiError.js'
import { logUnauthorizedAccessFromRequest } from '../lib/security.js'

export async function requireFacultyOrTeacherSession(req, res, auth) {
  if (!auth?.api?.getSession) {
    res.status(503).json({ error: 'AUTH_UNAVAILABLE', message: 'Authentication is unavailable.' })
    return null
  }
  try {
    const session = await auth.api.getSession({ headers: req.headers })
    const u =
      session?.user ?? session?.data?.user ?? session?.session?.user ?? session?.data?.session?.user
    if (!u?.id) {
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'Sign-in required.' })
      return null
    }
    const role = String(u.role || '').trim().toLowerCase()
    if (role !== 'teacher' && role !== 'faculty') {
      logUnauthorizedAccessFromRequest(req, {
        reason: 'Faculty grades access requires teacher/faculty role',
        requiredRole: 'faculty',
      })
      res.status(403).json({ error: 'FORBIDDEN', message: 'Access denied. Faculty only.' })
      return null
    }
    return session
  } catch (e) {
    sendSafeServerError(res, e, 'grades faculty session gate')
    return null
  }
}

export async function fetchFacultyRowForSession(pool, user) {
  const uid = String(user?.id || '').trim()
  const email = String(user?.email || '').trim().toLowerCase()
  const username = String(user?.username || '').trim()

  const { rows } = await pool.query(
    `
    SELECT f.*
    FROM public.faculties f
    WHERE f.archived_at IS NULL
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
      CASE WHEN f.auth_user_id = $1 THEN 0
           WHEN lower(trim(coalesce(f.email, ''))) = lower(trim(coalesce($2::text, ''))) THEN 1
           ELSE 2 END
    LIMIT 1
    `,
    [uid, email, username],
  )
  return rows?.[0] || null
}
