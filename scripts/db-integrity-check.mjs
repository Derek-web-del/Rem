import pg from 'pg'

const connectionString = process.env.DATABASE_URL || 'postgres://postgres:Derekent45@localhost:5432/lenlearn_db'
const pool = new pg.Pool({ connectionString })

try {
  const q = await pool.query(`
    SELECT id, name, first_name, last_name, email, archived_at
    FROM public.faculties
    WHERE lower(coalesce(name,'') || ' ' || coalesce(first_name,'') || ' ' || coalesce(last_name,'')) LIKE '%unias%'
       OR lower(coalesce(email,'')) LIKE '%unias%'
    ORDER BY id
  `)
  console.log('Faculties matching Unias:', q.rows.length)
  for (const r of q.rows) console.log(r)

  const dup = await pool.query(`
    SELECT lower(trim(name)) AS n, count(*)::int AS c
    FROM public.faculties
    GROUP BY lower(trim(name))
    HAVING count(*) > 1
    ORDER BY c DESC
    LIMIT 10
  `)
  console.log('Duplicate faculty names:', dup.rows)

  const app = await pool.query(`SELECT json FROM app_state WHERE id = 'default' LIMIT 1`)
  if (app.rows[0]?.json) {
    const state = typeof app.rows[0].json === 'string' ? JSON.parse(app.rows[0].json) : app.rows[0].json
    const facs = Array.isArray(state?.faculties) ? state.faculties : []
    const ghosts = facs.filter((f) => /unias/i.test(JSON.stringify(f)))
    console.log('app_state.faculties with Unias:', ghosts.length)
    for (const g of ghosts) console.log({ id: g.id, name: g.name, email: g.email })

    if (ghosts.length > 0) {
      const ghostIds = new Set(ghosts.map((g) => String(g.id || '').trim()).filter(Boolean))
      const next = facs.filter((f) => !ghostIds.has(String(f.id || '').trim()))
      state.faculties = next
      await pool.query(`UPDATE app_state SET json = $1, updated_at = NOW() WHERE id = 'default'`, [
        JSON.stringify(state),
      ])
      console.log('Removed Unias entries from app_state.faculties JSON')
    }
  }

  const archivedActive = await pool.query(`
    SELECT id, name, archived_at FROM public.faculties
    WHERE archived_at IS NOT NULL
    ORDER BY archived_at DESC
    LIMIT 20
  `)
  console.log('Recently archived faculty:', archivedActive.rows.length)
  for (const r of archivedActive.rows) console.log(r)
  const authUsers = await pool.query(`
    SELECT id, name, email FROM "user"
    WHERE lower(coalesce(name,'')) LIKE '%unias%'
       OR lower(coalesce(email,'')) LIKE '%unias%'
  `)
  console.log('Auth users matching Unias:', authUsers.rows.length)
  for (const r of authUsers.rows) console.log(r)
} finally {
  await pool.end()
}
