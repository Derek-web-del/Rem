import { assertValidJwksJson } from '../server/jwks-validate.mjs'

const port = String(process.env.AUTH_SERVER_PORT || 3001).trim()
const url = `http://127.0.0.1:${port}/api/auth/jwks`

let res
try {
  res = await fetch(url, { headers: { Accept: 'application/json' } })
} catch (err) {
  const cause = err?.cause
  if (cause?.code === 'ECONNREFUSED') {
    console.error(`Cannot reach auth server at ${url} (connection refused).`)
    console.error('')
    console.error('Start it first, then retry:')
    console.error('  npm run dev:auth')
    console.error('  or  npm run dev   (frontend + auth; use the "Auth API will use port …" value as AUTH_SERVER_PORT)')
    console.error('')
    console.error(`Current AUTH_SERVER_PORT: ${process.env.AUTH_SERVER_PORT || '(unset, default 3001)'}`)
  } else {
    console.error('Request failed:', err)
  }
  process.exit(1)
}
if (!res.ok) {
  console.error(`JWKS request failed: ${res.status} ${res.statusText}`)
  process.exit(1)
}
let json
try {
  json = await res.json()
} catch (e) {
  console.error('JWKS response is not JSON:', e)
  process.exit(1)
}
try {
  assertValidJwksJson(json)
} catch (e) {
  console.error('JWKS validation failed:', e?.message || e)
  process.exit(1)
}
console.log(`JWKS OK at ${url} (${json.keys?.length ?? 0} key(s))`)
