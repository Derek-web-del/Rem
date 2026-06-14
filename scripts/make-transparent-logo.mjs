#!/usr/bin/env node
/**
 * Remove near-white background from LenLearn worm logo PNG.
 *   node scripts/make-transparent-logo.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const input = path.join(root, 'public', 'lenlearn-logo.png')
const outDir = path.join(root, 'public', 'images')
const output = path.join(outDir, 'lenlearn-worm-logo.png')

const WHITE_THRESHOLD = 248

async function main() {
  const sharp = (await import('sharp')).default
  fs.mkdirSync(outDir, { recursive: true })

  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    if (r >= WHITE_THRESHOLD && g >= WHITE_THRESHOLD && b >= WHITE_THRESHOLD) {
      data[i + 3] = 0
    }
  }

  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toFile(output)

  console.log('[logo] wrote', output)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
