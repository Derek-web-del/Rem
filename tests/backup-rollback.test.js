import test, { describe } from 'node:test'
import assert from 'node:assert/strict'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import '../server/env-bootstrap.js'
import {
  buildLnbakFilename,
  clearDirectoryContents,
  extractUploadsArchive,
} from '../server/lib/lnbakEngine.js'
import { assertBackupFileReadable } from '../server/lib/backupService.js'

const require = createRequire(import.meta.url)
const tar = require('tar')

describe('backup filename uniqueness', () => {
  test('buildLnbakFilename embeds backup id so same-day jobs do not overwrite', () => {
    const a = buildLnbakFilename('daily', '11111111-2222-3333-4444-555555555555')
    const b = buildLnbakFilename('daily', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
    assert.notEqual(a, b)
    assert.match(a, /^backup_daily_\d{4}-\d{2}-\d{2}_[a-f0-9]+\.lnbak$/)
    assert.ok(a.includes('111111112222'))
  })
})

describe('backup file readability', () => {
  test('assertBackupFileReadable rejects missing archives', async () => {
    const missing = path.join(os.tmpdir(), `missing-backup-${randomUUID()}.lnbak`)
    await assert.rejects(() => assertBackupFileReadable(missing), /missing on disk/i)
  })

  test('assertBackupFileReadable accepts existing archives', async () => {
    const file = path.join(os.tmpdir(), `readable-backup-${randomUUID()}.lnbak`)
    await fsp.writeFile(file, 'test')
    try {
      const resolved = await assertBackupFileReadable(file)
      assert.equal(resolved, path.resolve(file))
    } finally {
      await fsp.unlink(file).catch(() => {})
    }
  })
})

describe('upload restore replaces disk snapshot', () => {
  test('extractUploadsArchive restores deleted files and removes post-backup orphans', async () => {
    const uploadsDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'lnbak-uploads-test-'))
    const tarPath = path.join(os.tmpdir(), `lnbak-uploads-${randomUUID()}.tar.gz`)
    try {
      await fsp.writeFile(path.join(uploadsDir, 'snapshot.txt'), 'original-content')
      await tar.c({ gzip: true, file: tarPath, cwd: uploadsDir }, ['snapshot.txt'])

      await fsp.unlink(path.join(uploadsDir, 'snapshot.txt'))
      await fsp.writeFile(path.join(uploadsDir, 'orphan-after-backup.txt'), 'should-be-removed')

      const result = await extractUploadsArchive(tarPath, { uploadsDir })
      assert.equal(result.ok, true)
      assert.ok(result.files_on_disk >= 1)

      const restored = await fsp.readFile(path.join(uploadsDir, 'snapshot.txt'), 'utf8')
      assert.equal(restored, 'original-content')
      await assert.rejects(() => fsp.access(path.join(uploadsDir, 'orphan-after-backup.txt')))
    } finally {
      await fsp.rm(uploadsDir, { recursive: true, force: true }).catch(() => {})
      await fsp.unlink(tarPath).catch(() => {})
    }
  })

  test('node-tar pack and extract roundtrip preserves nested upload paths', async () => {
    const uploadsDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'lnbak-tar-pack-'))
    const tarPath = path.join(os.tmpdir(), `lnbak-pack-${randomUUID()}.tar.gz`)
    try {
      const nested = path.join(uploadsDir, 'curriculum')
      await fsp.mkdir(path.join(uploadsDir, 'assignments'), { recursive: true })
      await fsp.mkdir(nested, { recursive: true })
      await fsp.writeFile(path.join(nested, 'English-guide.pdf'), '%PDF-test')
      await fsp.writeFile(path.join(uploadsDir, 'assignments', 'a.txt'), 'a')

      const entries = await fsp.readdir(uploadsDir)
      await tar.c({ gzip: true, file: tarPath, cwd: uploadsDir }, entries)

      await clearDirectoryContents(uploadsDir)
      const result = await extractUploadsArchive(tarPath, { uploadsDir })
      assert.equal(result.ok, true)
      await fsp.access(path.join(uploadsDir, 'curriculum', 'English-guide.pdf'))
      await fsp.access(path.join(uploadsDir, 'assignments', 'a.txt'))
    } finally {
      await fsp.rm(uploadsDir, { recursive: true, force: true }).catch(() => {})
      await fsp.unlink(tarPath).catch(() => {})
    }
  })

  test('clearDirectoryContents empties a directory without removing the root', async () => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'lnbak-clear-test-'))
    try {
      await fsp.writeFile(path.join(dir, 'a.txt'), 'a')
      await fsp.mkdir(path.join(dir, 'nested'), { recursive: true })
      await fsp.writeFile(path.join(dir, 'nested', 'b.txt'), 'b')
      await clearDirectoryContents(dir)
      const entries = await fsp.readdir(dir)
      assert.deepEqual(entries, [])
      const st = await fsp.stat(dir)
      assert.ok(st.isDirectory())
    } finally {
      await fsp.rm(dir, { recursive: true, force: true }).catch(() => {})
    }
  })
})
