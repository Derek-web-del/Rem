/**
 * Production startup: run migrations, then start the HTTP server.
 *
 *   npm start
 */
console.log('[start] LenLearn startup', {
  pid: process.pid,
  time: new Date().toISOString(),
})

const { spawn } = await import('node:child_process')
const { runMigrations } = await import('./run-migrations.mjs')

try {
  console.log('[start] running migrations…')
  await runMigrations()
  console.log('[start] migrations succeeded')
} catch (err) {
  console.error('[start] migrations FAILED:', err?.message || err)
  if (err?.stack) console.error(err.stack)
  process.exit(1)
}

console.log('[start] starting server…')

const server = spawn('node', ['server/index.js'], {
  stdio: 'inherit',
  env: process.env,
})

server.on('error', (err) => {
  console.error('[start] server process error:', err?.message || err)
  process.exit(1)
})

server.on('exit', (code, signal) => {
  if (signal) {
    console.error(`[start] server exited due to signal ${signal}`)
    process.exit(1)
  }
  process.exit(code ?? 0)
})
