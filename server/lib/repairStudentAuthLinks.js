/**
 * Link public.students.auth_user_id to Better Auth "user" rows by email.
 */
import { ensureStudentsCatalogColumns } from '../api/state/shared.js'

export async function repairStudentAuthLinks(pool) {
  const stats = {
    linked: 0,
    missing_auth: 0,
    skipped_no_email: 0,
    role_set_student: 0,
  }

  await ensureStudentsCatalogColumns(pool)

  const { rows } = await pool.query(`
    SELECT id, email,
      trim(concat_ws(' ', first_name, middle_name, last_name)) AS full_name
    FROM public.students
    WHERE auth_user_id IS NULL OR trim(coalesce(auth_user_id, '')) = ''
    ORDER BY id
  `)

  for (const student of rows) {
    const email = String(student.email || '').trim().toLowerCase()
    const name = String(student.full_name || student.email || student.id).trim()
    if (!email) {
      stats.skipped_no_email += 1
      continue
    }

    const auth = await pool.query(
      `SELECT id, role FROM "user" WHERE lower(trim(email)) = $1 LIMIT 1`,
      [email],
    )
    const authUser = auth.rows?.[0]
    if (!authUser?.id) {
      stats.missing_auth += 1
      continue
    }

    await pool.query(`UPDATE public.students SET auth_user_id = $1 WHERE id = $2`, [
      String(authUser.id),
      student.id,
    ])
    stats.linked += 1

    if (String(authUser.role || '').trim().toLowerCase() !== 'student') {
      const now = new Date().toISOString()
      await pool.query(`UPDATE "user" SET role = 'student', "updatedAt" = $1 WHERE id = $2`, [
        now,
        authUser.id,
      ])
      stats.role_set_student += 1
    }
  }

  return stats
}
