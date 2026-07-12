import { S3Client } from '@aws-sdk/client-s3'

function envTruthy(name) {
  const v = String(process.env[name] ?? '').trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes' || v === 'on'
}

function normalizePrefix(prefix) {
  const raw = String(prefix || 'backups/').trim()
  if (!raw) return 'backups/'
  return raw.endsWith('/') ? raw : `${raw}/`
}

/** @returns {boolean} */
export function isSpacesEnabled() {
  return envTruthy('DO_SPACES_ENABLED')
}

/** @returns {boolean} */
export function isSpacesConfigured() {
  if (!isSpacesEnabled()) return false
  const bucket = String(process.env.DO_SPACES_BUCKET || '').trim()
  const key = String(process.env.DO_SPACES_KEY || '').trim()
  const secret = String(process.env.DO_SPACES_SECRET || process.env.DO_SPACES_SECRET_KEY || '').trim()
  const endpoint = String(process.env.DO_SPACES_ENDPOINT || '').trim()
  return Boolean(bucket && key && secret && endpoint)
}

/** @returns {{ enabled: boolean, bucket: string, endpoint: string, region: string, backupsPrefix: string, uploadsPrefix: string, key: string, secret: string } | null} */
export function getSpacesConfig() {
  if (!isSpacesConfigured()) return null
  return {
    enabled: true,
    bucket: String(process.env.DO_SPACES_BUCKET || '').trim(),
    endpoint: String(process.env.DO_SPACES_ENDPOINT || '').trim(),
    region: String(process.env.DO_SPACES_REGION || 'sgp1').trim() || 'sgp1',
    backupsPrefix: normalizePrefix(process.env.DO_SPACES_BACKUPS_PREFIX || 'backups/'),
    uploadsPrefix: normalizePrefix(process.env.DO_SPACES_UPLOADS_PREFIX || 'uploads/'),
    key: String(process.env.DO_SPACES_KEY || '').trim(),
    secret: String(process.env.DO_SPACES_SECRET || process.env.DO_SPACES_SECRET_KEY || '').trim(),
  }
}

let cachedClient = null
let cachedClientKey = ''

/** @returns {S3Client | null} */
export function createSpacesS3Client() {
  const cfg = getSpacesConfig()
  if (!cfg) return null
  const cacheKey = `${cfg.endpoint}|${cfg.key}|${cfg.bucket}`
  if (cachedClient && cachedClientKey === cacheKey) return cachedClient
  cachedClient = new S3Client({
    endpoint: cfg.endpoint,
    region: 'us-east-1',
    forcePathStyle: false,
    credentials: {
      accessKeyId: cfg.key,
      secretAccessKey: cfg.secret,
    },
  })
  cachedClientKey = cacheKey
  return cachedClient
}

/** @param {string} filename */
export function buildBackupObjectKey(filename) {
  const cfg = getSpacesConfig()
  const prefix = cfg?.backupsPrefix || 'backups/'
  const base = pathBasename(filename)
  return `${prefix}${base}`
}

function pathBasename(filename) {
  const t = String(filename || '').trim().replace(/\\/g, '/')
  const i = t.lastIndexOf('/')
  return i >= 0 ? t.slice(i + 1) : t
}
