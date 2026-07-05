/**
 * Inspect table key order and topic_id stats inside a .lnbak archive.
 *
 *   node scripts/inspect-lnbak-order.mjs path/to/backup.lnbak
 */
import fs from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const unzipper = require('unzipper')

const filePath = process.argv[2]
if (!filePath) {
  console.error('Usage: node scripts/inspect-lnbak-order.mjs <path-to-backup.lnbak>')
  process.exit(1)
}
if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`)
  process.exit(1)
}

async function main() {
  const zip = await unzipper.Open.file(filePath)
  const entry = zip.files.find((f) => f.path === 'database_dump.json')
  if (!entry) {
    console.error('database_dump.json not found inside archive')
    process.exit(1)
  }
  const buf = await entry.buffer()
  const parsed = JSON.parse(buf.toString('utf8'))
  const data = parsed.data || {}
  const keys = Object.keys(data)

  console.log(`[inspect] file=${filePath}`)
  console.log(`[inspect] schema_version=${parsed.meta?.schema_version ?? 'unknown'}`)
  console.log(`[inspect] meta.table_order=${Array.isArray(parsed.meta?.table_order) ? 'yes' : 'no'}`)
  console.log('[inspect] data keys top-to-bottom:')
  keys.forEach((key, i) => {
    const count = Array.isArray(data[key]) ? data[key].length : 0
    console.log(`  ${i + 1}. ${key} (${count} rows)`)
  })

  const topicsIdx = keys.indexOf('subject_topics')
  const modulesIdx = keys.indexOf('subject_modules')
  console.log(`[inspect] subject_topics index=${topicsIdx}, subject_modules index=${modulesIdx}`)
  console.log(
    `[inspect] topics before modules=${topicsIdx >= 0 && modulesIdx >= 0 && topicsIdx < modulesIdx}`,
  )

  const modules = Array.isArray(data.subject_modules) ? data.subject_modules : []
  const withTopic = modules.filter((r) => r?.topic_id != null && r.topic_id !== '').length
  const topics = Array.isArray(data.subject_topics) ? data.subject_topics : []
  console.log(`[inspect] subject_topics rows=${topics.length}, subject_modules rows=${modules.length}`)
  console.log(`[inspect] subject_modules with topic_id=${withTopic}`)

  if (withTopic > 0) {
    const sample = modules.find((r) => r?.topic_id != null && r.topic_id !== '')
    console.log(`[inspect] sample module topic_id=${sample?.topic_id} id=${sample?.id}`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
