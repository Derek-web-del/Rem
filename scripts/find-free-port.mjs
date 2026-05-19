import { createServer } from 'node:net'
export function findFreePort(start = 3001, maxTries = 25) {
  return new Promise((resolve, reject) => {
    let tries = 0

    const attempt = (port) => {
      if (tries >= maxTries) {
        reject(new Error(`No free port found between ${start} and ${start + maxTries - 1}`))
        return
      }
      tries += 1
      const server = createServer()
      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          server.close()
          attempt(port + 1)
        } else {
          reject(err)
        }
      })
      server.listen(port, () => {
        const addr = server.address()
        const chosen = typeof addr === 'object' && addr ? addr.port : port
        server.close(() => resolve(chosen))
      })
    }

    attempt(start)
  })
}
