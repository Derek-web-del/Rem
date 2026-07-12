import test, { describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {
  buildBackupObjectKey,
  isSpacesConfigured,
  isSpacesEnabled,
} from '../server/lib/doSpacesClient.js'
import { enqueueSpacesBackupUpload } from '../server/lib/backupService.js'

const ENV_KEYS = [
  'DO_SPACES_ENABLED',
  'DO_SPACES_BUCKET',
  'DO_SPACES_KEY',
  'DO_SPACES_SECRET',
  'DO_SPACES_ENDPOINT',
  'DO_SPACES_REGION',
  'DO_SPACES_BACKUPS_PREFIX',
]

describe('DigitalOcean Spaces backup', () => {
  /** @type {Record<string, string | undefined>} */
  let saved = {}

  beforeEach(() => {
    saved = {}
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k]
      delete process.env[k]
    }
  })

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  })

  test('isSpacesEnabled respects DO_SPACES_ENABLED', () => {
    assert.equal(isSpacesEnabled(), false)
    process.env.DO_SPACES_ENABLED = '1'
    assert.equal(isSpacesEnabled(), true)
    process.env.DO_SPACES_ENABLED = 'true'
    assert.equal(isSpacesEnabled(), true)
  })

  test('isSpacesConfigured false when env incomplete', () => {
    process.env.DO_SPACES_ENABLED = '1'
    assert.equal(isSpacesConfigured(), false)
    process.env.DO_SPACES_BUCKET = 'lenlearn-prod'
    process.env.DO_SPACES_KEY = 'key'
    process.env.DO_SPACES_SECRET = 'secret'
    process.env.DO_SPACES_ENDPOINT = 'https://sgp1.digitaloceanspaces.com'
    assert.equal(isSpacesConfigured(), true)
  })

  test('buildBackupObjectKey uses prefix and basename', () => {
    process.env.DO_SPACES_ENABLED = '1'
    process.env.DO_SPACES_BUCKET = 'lenlearn-prod'
    process.env.DO_SPACES_KEY = 'key'
    process.env.DO_SPACES_SECRET = 'secret'
    process.env.DO_SPACES_ENDPOINT = 'https://sgp1.digitaloceanspaces.com'
    process.env.DO_SPACES_BACKUPS_PREFIX = 'backups/'
    assert.equal(
      buildBackupObjectKey('/tmp/manual_2026-07-12_abc.lnbak'),
      'backups/manual_2026-07-12_abc.lnbak',
    )
    process.env.DO_SPACES_BACKUPS_PREFIX = 'archives'
    assert.equal(buildBackupObjectKey('backup.lnbak'), 'archives/backup.lnbak')
  })

  test('enqueueSpacesBackupUpload skips when not configured', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'lnbak-spaces-'))
    const filePath = path.join(tmp, 'test.lnbak')
    await fs.writeFile(filePath, 'test')
    const result = await enqueueSpacesBackupUpload({
      backupId: '00000000-0000-4000-8000-000000000001',
      filePath,
      filename: 'test.lnbak',
      actor: { id: 'admin', name: 'Admin', email: '' },
    })
    assert.equal(result.skipped, true)
    assert.equal(result.uploaded, false)
    await fs.rm(tmp, { recursive: true, force: true })
  })
})
