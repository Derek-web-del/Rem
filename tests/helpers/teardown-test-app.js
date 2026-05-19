/**
 * Start/stop Express test servers without leaving cron timers or pg pools open.
 */

export function listenTestServer(app) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, (err) => {
      if (err) reject(err)
      else resolve(server)
    })
  })
}

export async function teardownTestApp(server, app) {
  const { stopBackupScheduler } = await import('../../server/jobs/backupScheduler.js')
  stopBackupScheduler()

  if (server) {
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections()
    }
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()))
    })
  }

  if (typeof app?.locals?.disposeAuthBackend === 'function') {
    await app.locals.disposeAuthBackend()
  }
}
