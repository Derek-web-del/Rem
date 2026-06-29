/**
 * Generates docs/LenLearn_System_Security_Controls.pdf from the HTML source.
 *
 * Run: npm run docs:security-controls-pdf
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const HTML_PATH = path.join(ROOT, 'docs', 'LenLearn_System_Security_Controls.html')
const PDF_PATH = path.join(ROOT, 'docs', 'LenLearn_System_Security_Controls.pdf')

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean)

function findBrowser() {
  for (const candidate of CHROME_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate
  }
  return null
}

function printToPdf(browserPath) {
  const htmlUrl = pathToFileURL(HTML_PATH).href
  execFileSync(
    browserPath,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--run-all-compositor-stages-before-draw',
      '--virtual-time-budget=10000',
      `--print-to-pdf=${PDF_PATH}`,
      htmlUrl,
    ],
    { stdio: 'pipe', windowsHide: true },
  )
}

async function main() {
  if (!fs.existsSync(HTML_PATH)) {
    throw new Error(`Missing ${path.relative(ROOT, HTML_PATH)}`)
  }

  const browser = findBrowser()
  if (!browser) {
    console.error('[docs:security-controls-pdf] Chrome/Edge not found.')
    console.error('Open docs/LenLearn_System_Security_Controls.html in a browser and use Print → Save as PDF.')
    process.exit(1)
  }

  printToPdf(browser)

  if (!fs.existsSync(PDF_PATH)) {
    throw new Error(`PDF was not created at ${path.relative(ROOT, PDF_PATH)}`)
  }

  const sizeKb = Math.round(fs.statSync(PDF_PATH).size / 1024)
  console.log(`[docs:security-controls-pdf] wrote ${path.relative(ROOT, PDF_PATH)} (${sizeKb} KB)`)
  console.log(`[docs:security-controls-pdf] source ${path.relative(ROOT, HTML_PATH)}`)
}

main().catch((e) => {
  console.error(e?.message || e)
  process.exit(1)
})
