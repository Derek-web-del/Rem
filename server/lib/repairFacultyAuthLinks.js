/**
 * Link public.faculties.auth_user_id to Better Auth "user" rows by email.
 */
export async function repairFacultyAuthLinks(pool) {
  const stats = {
    linked: 0,
    missing_auth: 0,
    skipped_no_email: 0,
    role_set_teacher: 0,
  }

  const { rows } = await pool.query(`
    SELECT id, email, name
    FROM public.faculties
    WHERE auth_user_id IS NULL OR trim(coalesce(auth_user_id, '')) = ''
    ORDER BY id
  `)

  for (const faculty of rows) {
    const email = String(faculty.email || '').trim().toLowerCase()
    const name = String(faculty.name || faculty.email || faculty.id).trim()
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

    await pool.query(`UPDATE public.faculties SET auth_user_id = $1 WHERE id = $2`, [
      String(authUser.id),
      faculty.id,
    ])
    stats.linked += 1

    if (String(authUser.role || '').trim().toLowerCase() !== 'teacher') {
      const now = new Date().toISOString()
      await pool.query(`UPDATE "user" SET role = 'teacher', "updatedAt" = $1 WHERE id = $2`, [
        now,
        authUser.id,
      ])
      stats.role_set_teacher += 1
    }
  }

  return stats
}

export async function buildFacultyRestoreReport(pool) {
  const [fac, teachers, unlinked] = await Promise.all([
    pool.query(
      `SELECT COUNT(*)::int AS total FROM public.faculties WHERE archived_at IS NULL`,
    ),
    pool.query(
      `SELECT COUNT(*)::int AS total FROM "user" WHERE lower(trim(coalesce(role, ''))) = 'teacher'`,
    ),
    pool.query(
      `SELECT COUNT(*)::int AS total FROM public.faculties
       WHERE archived_at IS NULL
         AND (auth_user_id IS NULL OR trim(coalesce(auth_user_id, '')) = '')`,
    ),
  ])

  return {
    faculties_active: Number(fac.rows[0]?.total || 0),
    teacher_users_restored: Number(teachers.rows[0]?.total || 0),
    faculty_missing_auth_link: Number(unlinked.rows[0]?.total || 0),
  }
}
