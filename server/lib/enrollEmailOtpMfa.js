/**
 * Enroll portal users for Better Auth email OTP at sign-in.
 *
 * Setting `"user"."twoFactorEnabled" = true` alone is not enough: verify-otp during
 * sign-in requires a row in `"twoFactor"` (verified=true). Without it, OTP email
 * sends but verify returns "Two factor isn't enabled".
 */
import { generateRandomString, symmetricEncrypt } from 'better-auth/crypto'
import { auth } from '../auth.js'

const PORTAL_ROLES = ['admin', 'teacher', 'student', 'faculty']

export function isPortalAuthRole(role) {
  return PORTAL_ROLES.includes(String(role || '').trim().toLowerCase())
}

async function encryptedBackupCodes(secretConfig) {
  const codes = Array.from({ length: 10 }, () =>
    generateRandomString(10, 'a-z', '0-9', 'A-Z'),
  )
  return symmetricEncrypt({ key: secretConfig, data: JSON.stringify(codes) })
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ userIds?: string[], dryRun?: boolean }} [opts]
 */
export async function enrollPortalEmailOtpMfa(pool, opts = {}) {
  if (!pool) throw new Error('DATABASE_URL is not set')

  const dryRun = opts.dryRun === true
  const userIds = Array.isArray(opts.userIds)
    ? opts.userIds.map((id) => String(id || '').trim()).filter(Boolean)
    : null

  const ctx = await auth.$context

  const { rows: users } = userIds?.length
    ? await pool.query(
        `
          SELECT id, username, email, role, "twoFactorEnabled", "emailVerified"
          FROM "user"
          WHERE id = ANY($1::text[])
          ORDER BY role, username NULLS LAST, email
        `,
        [userIds],
      )
    : await pool.query(
        `
          SELECT id, username, email, role, "twoFactorEnabled", "emailVerified"
          FROM "user"
          WHERE LOWER(role) = ANY($1::text[])
          ORDER BY role, username NULLS LAST, email
        `,
        [PORTAL_ROLES],
      )

  const { rows: existing } = await pool.query(`
    SELECT "userId" FROM "twoFactor"
    WHERE "userId" = ANY($1::text[])
  `, [users.map((u) => u.id)])

  const enrolledIds = new Set(existing.map((r) => r.userId))
  const now = new Date().toISOString()

  let flagsUpdated = 0
  let rowsCreated = 0

  for (const user of users) {
    if (user.twoFactorEnabled !== true || user.emailVerified !== true) {
      if (!dryRun) {
        await pool.query(
          `
            UPDATE "user"
            SET "twoFactorEnabled" = true,
                "emailVerified" = true,
                "updatedAt" = $1
            WHERE id = $2
          `,
          [now, user.id],
        )
      }
      flagsUpdated++
    }

    if (enrolledIds.has(user.id)) continue

    if (dryRun) {
      rowsCreated++
      continue
    }

    const secret = generateRandomString(32)
    const encryptedSecret = await symmetricEncrypt({
      key: ctx.secretConfig,
      data: secret,
    })
    const backupCodes = await encryptedBackupCodes(ctx.secretConfig)

    await ctx.adapter.create({
      model: 'twoFactor',
      data: {
        secret: encryptedSecret,
        backupCodes,
        userId: user.id,
        verified: true,
      },
    })
    rowsCreated++
  }

  return {
    users: users.length,
    flagsUpdated,
    rowsCreated,
    alreadyEnrolled: enrolledIds.size,
  }
}

/**
 * Enroll a single auth user after roster provisioning.
 * @param {import('pg').Pool} pool
 * @param {string} userId
 */
export async function enrollSinglePortalEmailOtpMfa(pool, userId) {
  const id = String(userId || '').trim()
  if (!id) return { rowsCreated: 0, flagsUpdated: 0 }
  return enrollPortalEmailOtpMfa(pool, { userIds: [id] })
}

/**
 * Idempotent MFA enrollment for one portal user (flags + twoFactor row).
 * @param {import('pg').Pool} pool
 * @param {string} userId
 * @param {{ role?: string }} [opts]
 */
export async function ensurePortalUserEmailOtpMfa(pool, userId, opts = {}) {
  const id = String(userId || '').trim()
  if (!id || !pool) return { skipped: true, reason: 'missing pool or user id' }

  let role = String(opts.role || '').trim().toLowerCase()
  if (!role) {
    const { rows } = await pool.query(`SELECT role FROM "user" WHERE id = $1 LIMIT 1`, [id])
    role = String(rows[0]?.role || '').trim().toLowerCase()
  }
  if (!isPortalAuthRole(role)) {
    return { skipped: true, reason: 'not a portal role' }
  }

  return enrollPortalEmailOtpMfa(pool, { userIds: [id] })
}
