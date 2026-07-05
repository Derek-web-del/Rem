/**
 * One-shot verification: export → restore round-trip for subject_topics/subject_modules FK path.
 * Uses a SAVEPOINT-isolated fixture inside a rolled-back transaction when possible;
 * falls back to export-only checks if subject tables are unavailable.
 */
import 'dotenv/config'
import pg from 'pg'
import {
  exportBackupData,
  RESTORE_ENGINE_VERSION,
  testRestoreFkBypassCapability,
  resolveBackupTableOrder,
  LNBAK_TABLE_ORDER,
  validateLnbakParsed,
  beginRestoreSession,
  endRestoreSession,
  scrubAllInvalidTopicIds,
  prepareRestoreRowsForInsert,
} from '../server/lib/lnbakEngine.js'

const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
if (!url) {
  console.error('FAIL: DATABASE_URL not set')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: url })

async function checkDiagnostics() {
  const topicsIdx = LNBAK_TABLE_ORDER.indexOf('subject_topics')
  const modulesIdx = LNBAK_TABLE_ORDER.indexOf('subject_modules')
  if (topicsIdx < 0 || modulesIdx < 0 || topicsIdx >= modulesIdx) {
    throw new Error('subject_topics must come before subject_modules in LNBAK_TABLE_ORDER')
  }
  const fk = await testRestoreFkBypassCapability(pool)
  const order = await resolveBackupTableOrder(pool)
  console.log(`[verify] restore_engine=${RESTORE_ENGINE_VERSION}`)
  console.log(`[verify] subject_topics index=${topicsIdx}, subject_modules index=${modulesIdx}`)
  console.log(`[verify] fk_bypass=${JSON.stringify(fk)}`)
  if (fk.mode !== 'drop_all_public_fk') {
    throw new Error(`expected fk_bypass mode drop_all_public_fk, got ${fk.mode}`)
  }
  console.log(`[verify] table_order count=${order.length}, topics before modules=${order.indexOf('subject_topics') < order.indexOf('subject_modules')}`)
  return { fk, order }
}

async function checkExport() {
  const { meta, data, manifest } = await exportBackupData(pool)
  validateLnbakParsed({ meta, data, manifest })
  const topicRows = data.subject_topics?.length ?? 0
  const moduleRows = data.subject_modules?.length ?? 0
  const keys = Object.keys(data)
  const topicsIdx = keys.indexOf('subject_topics')
  const modulesIdx = keys.indexOf('subject_modules')
  if (topicsIdx < 0 || modulesIdx < 0 || topicsIdx >= modulesIdx) {
    throw new Error('export data keys must list subject_topics before subject_modules')
  }
  if (!Array.isArray(meta?.table_order) || meta.table_order.length === 0) {
    throw new Error('export meta.table_order missing')
  }
  console.log(`[verify] export ok — subject_topics=${topicRows}, subject_modules=${moduleRows}, tables=${keys.length}`)
  return { meta, data, manifest }
}

/** Minimal fixture that previously triggered subject_modules_topic_id_fkey on restore. */
async function checkFkFixtureRestore() {
  const client = await pool.connect()
  const subjectId = 999801
  const topicId = 999811
  const moduleId = 999821
  try {
    const { rows: hasSubjects } = await client.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = 'subjects' LIMIT 1`,
    )
    if (!hasSubjects.length) {
      console.log('[verify] skip FK fixture — subjects table missing')
      return
    }

    await client.query('BEGIN')
    await client.query(
      `INSERT INTO public.subjects (id, subject_code, subject_name, grade_level, semester)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [subjectId, 'VRF-TST', 'Restore Verify', '10', '1'],
    )
    await client.query(
      `INSERT INTO public.subject_topics (id, subject_id, title, topic_order)
       VALUES ($1, $2, $3, 0) ON CONFLICT (id) DO NOTHING`,
      [topicId, subjectId, 'Verify Topic'],
    )

    const parsed = {
      meta: { schema_version: 'verify', created_at: new Date().toISOString() },
      data: {
        subjects: [{ id: subjectId, subject_code: 'VRF-TST', subject_name: 'Restore Verify', grade_level: '10', semester: '1' }],
        subject_topics: [{ id: topicId, subject_id: subjectId, title: 'Verify Topic', topic_order: 0 }],
        subject_modules: [
          {
            id: moduleId,
            subject_id: subjectId,
            title: 'Verify Lesson',
            module_order: 0,
            topic_id: topicId,
            lesson_number: 1,
          },
        ],
      },
    }

    // Nuclear restore path: drop all FKs, insert with topic_id, scrub, re-add FKs
    const savedFks = await beginRestoreSession(client)
    const prepared = prepareRestoreRowsForInsert(parsed, 'subject_modules', parsed.data.subject_modules)
    if (!prepared[0]?.topic_id) {
      throw new Error('nuclear restore should insert topic_id on subject_modules rows')
    }
    await client.query(
      `INSERT INTO public.subject_modules (id, subject_id, title, module_order, lesson_number, topic_id)
       VALUES ($1, $2, $3, 0, 1, $4) ON CONFLICT (id) DO UPDATE SET topic_id = EXCLUDED.topic_id`,
      [moduleId, subjectId, 'Verify Lesson', topicId],
    )
    await scrubAllInvalidTopicIds(client)
    await endRestoreSession(client, savedFks)
    const { rows } = await client.query(
      `SELECT topic_id::bigint AS topic_id FROM public.subject_modules WHERE id = $1`,
      [moduleId],
    )
    if (Number(rows[0]?.topic_id) !== topicId) {
      throw new Error(`topic_id not preserved: expected ${topicId}, got ${rows[0]?.topic_id}`)
    }
    await client.query('ROLLBACK')
    console.log('[verify] FK fixture restore path ok (nuclear drop/insert/re-add FK, transaction rolled back)')
  } finally {
    await client.query('ROLLBACK').catch(() => {})
    client.release()
  }
}

async function checkRoundTripExportRestore() {
  const { meta, data } = await exportBackupData(pool)
  const modulesWithTopic = (data.subject_modules || []).filter((r) => r.topic_id != null && r.topic_id !== '').length
  const topicsBeforeModules =
    LNBAK_TABLE_ORDER.indexOf('subject_topics') < LNBAK_TABLE_ORDER.indexOf('subject_modules')
  if (!topicsBeforeModules) throw new Error('table order invalid for round-trip')
  if (!meta?.created_at) throw new Error('export meta missing created_at')
  console.log(
    `[verify] round-trip export valid — subject_modules with topic_id=${modulesWithTopic}, meta.schema=${meta.schema_version || meta.migration || 'ok'}`,
  )
}

async function main() {
  try {
    await checkDiagnostics()
    await checkExport()
    await checkFkFixtureRestore()
    await checkRoundTripExportRestore()
    console.log('[verify] ALL CHECKS PASSED')
    process.exit(0)
  } catch (e) {
    console.error('[verify] FAILED:', e?.message || e)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

main()
