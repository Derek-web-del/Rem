import pg from 'pg'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 })
await pool.query(`UPDATE "user" SET "twoFactorEnabled" = true WHERE LOWER(username) = 'admin'`)
console.log('[restore] admin twoFactorEnabled=true')
await pool.end()
