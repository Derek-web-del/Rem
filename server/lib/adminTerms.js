/** Admin terms acceptance on Better Auth "user" table */

export async function ensureUserTermsColumns(pool) {
  try {
    await pool.query(`
      ALTER TABLE "user"
        ADD COLUMN IF NOT EXISTS terms_accepted BOOLEAN NOT NULL DEFAULT false
    `)
    await pool.query(`
      ALTER TABLE "user"
        ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ NULL
    `)
  } catch {
    /* non-fatal */
  }
}

export function adminTermsAccepted(userRow) {
  return userRow?.terms_accepted === true
}

export async function fetchAdminTermsRow(pool, userId) {
  await ensureUserTermsColumns(pool)
  const { rows } = await pool.query(
    `SELECT id, terms_accepted, terms_accepted_at FROM "user" WHERE id = $1 LIMIT 1`,
    [String(userId)],
  )
  return rows?.[0] || null
}

export async function markAdminTermsAccepted(pool, userId) {
  await ensureUserTermsColumns(pool)
  const { rows } = await pool.query(
    `
      UPDATE "user"
      SET terms_accepted = true,
          terms_accepted_at = COALESCE(terms_accepted_at, NOW())
      WHERE id = $1
      RETURNING terms_accepted, terms_accepted_at
    `,
    [String(userId)],
  )
  return rows?.[0] || null
}

export async function clearAdminTermsAccepted(pool, userId) {
  await ensureUserTermsColumns(pool)
  const { rows } = await pool.query(
    `
      UPDATE "user"
      SET terms_accepted = false
      WHERE id = $1
      RETURNING terms_accepted, terms_accepted_at
    `,
    [String(userId)],
  )
  return rows?.[0] || null
}
