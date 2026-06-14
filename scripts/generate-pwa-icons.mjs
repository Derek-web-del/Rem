#!/usr/bin/env node
/**
 * Generate PWA icons from public/icons.svg (requires sharp).
 *   node scripts/generate-pwa-icons.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const svgPath = path.join(root, 'public', 'icons.svg')
const outDir = path.join(root, 'public', 'icons')

async function main() {
  let sharp
  try {
    sharp = (await import('sharp')).default
  } catch {
    console.warn('[pwa-icons] sharp not installed — run: npm install -D sharp')
    console.warn('[pwa-icons] Skipping PNG generation; add icons manually to public/icons/')
    process.exit(0)
  }

  fs.mkdirSync(outDir, { recursive: true })

  // public/icons.svg is a social sprite sheet (no root viewBox) — render a branded app icon.
  const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#185FA5"/>
  <text x="256" y="300" font-family="Arial,Helvetica,sans-serif" font-size="220" font-weight="700" fill="#ffffff" text-anchor="middle">L</text>
</svg>`)

  for (const size of [192, 512]) {
    const out = path.join(outDir, `icon-${size}.png`)
    await sharp(svg).resize(size, size).png().toFile(out)
    console.log('[pwa-icons] wrote', out)
  }
}

main().catch((e) => {
  console.error('[pwa-icons]', e?.message || e)
  process.exit(1)
})
