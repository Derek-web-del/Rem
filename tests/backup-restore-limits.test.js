import test from 'node:test'
import assert from 'node:assert/strict'

test('BACKUP_RESTORE_MAX_BYTES defaults to unlimited (0)', async () => {
  const prev = process.env.BACKUP_RESTORE_MAX_BYTES
  delete process.env.BACKUP_RESTORE_MAX_BYTES
  const mod = await import('../server/lib/uploadLimitsConfig.js?' + Date.now())
  assert.equal(mod.BACKUP_RESTORE_MAX_BYTES, 0)
  if (prev !== undefined) process.env.BACKUP_RESTORE_MAX_BYTES = prev
})

test('BACKUP_RESTORE_MAX_BYTES parses byte cap from env', async () => {
  const prev = process.env.BACKUP_RESTORE_MAX_BYTES
  process.env.BACKUP_RESTORE_MAX_BYTES = '100mb'
  const mod = await import('../server/lib/uploadLimitsConfig.js?' + Date.now())
  assert.equal(mod.BACKUP_RESTORE_MAX_BYTES, 100 * 1024 * 1024)
  if (prev !== undefined) process.env.BACKUP_RESTORE_MAX_BYTES = prev
  else delete process.env.BACKUP_RESTORE_MAX_BYTES
})
