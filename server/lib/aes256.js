import crypto from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 16
const PREFIX = 'enc:v1:'

function secretKeyBuffer() {
  const raw = String(process.env.AES_256_SECRET_KEY || '').trim()
  if (!raw) {
    throw new Error(
      '[aes256] AES_256_SECRET_KEY is not set. Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    )
  }
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error('[aes256] AES_256_SECRET_KEY must be 64 hex characters (32 bytes).')
  }
  return Buffer.from(raw, 'hex')
}

export function isAesConfigured() {
  const raw = String(process.env.AES_256_SECRET_KEY || '').trim()
  return /^[0-9a-fA-F]{64}$/.test(raw)
}

export function assertAesConfiguredForProduction() {
  const env = process.env.NODE_ENV || 'development'
  if (env === 'production' && !isAesConfigured()) {
    throw new Error('[aes256] AES_256_SECRET_KEY is required in production.')
  }
  if (!isAesConfigured() && env !== 'test') {
    console.warn('[aes256] AES_256_SECRET_KEY not set — student PII encryption disabled until configured.')
  }
}

/** @param {string | null | undefined} text */
export function encrypt(text) {
  if (text == null || String(text).trim() === '') return null
  const plain = String(text)
  if (plain.startsWith(PREFIX)) return plain

  const key = secretKeyBuffer()
  const iv = crypto.randomBytes(IV_BYTES)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  let encrypted = cipher.update(plain, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag().toString('hex')
  return `${PREFIX}${iv.toString('hex')}:${authTag}:${encrypted}`
}

/** @param {string | null | undefined} encryptedText */
export function decrypt(encryptedText) {
  if (encryptedText == null || String(encryptedText).trim() === '') return null
  const raw = String(encryptedText)
  if (!raw.startsWith(PREFIX)) return raw

  const payload = raw.slice(PREFIX.length)
  const parts = payload.split(':')
  if (parts.length !== 3) {
    throw new Error('[aes256] Invalid encrypted payload format.')
  }
  const [ivHex, authTagHex, encrypted] = parts
  const key = secretKeyBuffer()
  const iv = Buffer.from(ivHex, 'hex')
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

export function isEncryptedValue(value) {
  return typeof value === 'string' && value.startsWith(PREFIX)
}
