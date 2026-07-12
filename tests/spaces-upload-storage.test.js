import test, { describe, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import {
  isUploadsOnSpaces,
  normalizeStoredUploadPath,
  storedPathToObjectKey,
  storedPathToRelative,
  relativeToStoredPath,
  persistUploadBuffer,
  syncUploadsDirToSpaces,
  hydrateUploadsDirFromSpaces,
} from '../server/lib/uploadFileStorage.js'

const ENV_KEYS = [
  'DO_SPACES_ENABLED',
  'DO_SPACES_BUCKET',
  'DO_SPACES_KEY',
  'DO_SPACES_SECRET',
  'DO_SPACES_ENDPOINT',
  'DO_SPACES_REGION',
  'DO_SPACES_BACKUPS_PREFIX',
  'DO_SPACES_UPLOADS_PREFIX',
  'DO_SPACES_UPLOADS_ENABLED',
  'UPLOAD_DIR',
]

describe('DigitalOcean Spaces upload storage', () => {
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

  test('path normalization and object keys', () => {
    assert.equal(normalizeStoredUploadPath('/uploads/curriculum/guide.pdf'), '/uploads/curriculum/guide.pdf')
    assert.equal(storedPathToRelative('/uploads/assignments/a.pdf'), 'assignments/a.pdf')
    assert.equal(relativeToStoredPath('submissions/assignments/s.pdf'), '/uploads/submissions/assignments/s.pdf')

    process.env.DO_SPACES_ENABLED = '1'
    process.env.DO_SPACES_BUCKET = 'lenlearn'
    process.env.DO_SPACES_KEY = 'key'
    process.env.DO_SPACES_SECRET = 'secret'
    process.env.DO_SPACES_ENDPOINT = 'https://sgp1.digitaloceanspaces.com'
    process.env.DO_SPACES_UPLOADS_PREFIX = 'uploads/'

    assert.equal(
      storedPathToObjectKey('/uploads/curriculum/foo.pdf'),
      'uploads/curriculum/foo.pdf',
    )
  })

  test('isUploadsOnSpaces false when Spaces disabled or uploads flag off', () => {
    assert.equal(isUploadsOnSpaces(), false)
    process.env.DO_SPACES_ENABLED = '1'
    process.env.DO_SPACES_BUCKET = 'lenlearn'
    process.env.DO_SPACES_KEY = 'key'
    process.env.DO_SPACES_SECRET = 'secret'
    process.env.DO_SPACES_ENDPOINT = 'https://sgp1.digitaloceanspaces.com'
    assert.equal(isUploadsOnSpaces(), true)
    process.env.DO_SPACES_UPLOADS_ENABLED = '0'
    assert.equal(isUploadsOnSpaces(), false)
  })

  test('persistUploadBuffer writes locally when Spaces not configured', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ln-uploads-'))
    process.env.UPLOAD_DIR = tmp
    const stored = '/uploads/curriculum/test-guide.pdf'
    await persistUploadBuffer(stored, Buffer.from('%PDF-1.4 test'))
    const abs = path.join(tmp, 'curriculum', 'test-guide.pdf')
    const stat = await fs.stat(abs)
    assert.ok(stat.isFile())
    assert.ok(stat.size > 0)
    await fs.rm(tmp, { recursive: true, force: true })
  })

  test('sync and hydrate skip when Spaces uploads disabled', async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ln-uploads-'))
    process.env.UPLOAD_DIR = tmp
    await fs.writeFile(path.join(tmp, 'local.txt'), 'hello')
    const sync = await syncUploadsDirToSpaces(tmp)
    const hydrate = await hydrateUploadsDirFromSpaces(tmp)
    assert.equal(sync.skipped, true)
    assert.equal(hydrate.skipped, true)
    await fs.rm(tmp, { recursive: true, force: true })
  })
})
