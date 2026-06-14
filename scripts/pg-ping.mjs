import { getPgPool } from '../server/pgPool.js'
import * as dotenv from 'dotenv'

dotenv.config()

async function pingDatabase() {
  console.log('Testing PostgreSQL connection...')
  console.log(
    'DATABASE_URL:',
    process.env.DATABASE_URL?.replace(/:\/\/.*@/, '://***@'),
  )

  try {
    const pool = getPgPool()
    if (!pool) {
      throw new Error('DATABASE_URL is not set')
    }
    const result = await pool.query(
      'SELECT NOW() as time, current_database() as db',
    )

    console.log('✅ Connected!')
    console.log('Database:', result.rows[0].db)
    console.log('Server time:', result.rows[0].time)

    const tables = await pool.query(`
      SELECT COUNT(*) as count
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `)
    console.log('Tables found:', tables.rows[0].count)

    await pool.end()
    process.exit(0)
  } catch (err) {
    console.error('❌ Connection failed:', err.message)
    console.log('\nCheck:')
    console.log('1. DATABASE_URL in .env')
    console.log('2. PostgreSQL is running')
    console.log('3. lenlearn_db exists')
    process.exit(1)
  }
}

pingDatabase()
