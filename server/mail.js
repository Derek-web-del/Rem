import dns from 'node:dns'
import nodemailer from 'nodemailer'
import { captureOtp } from './test-otp.mjs'
import { captureResetUrl } from './test-reset.mjs'

let transporter

function smtpHost() {
  return (process.env.SMTP_HOST || 'smtp.gmail.com').trim()
}

function isLikelyGmail() {
  const h = smtpHost().toLowerCase()
  return h === 'smtp.gmail.com' || h.endsWith('.gmail.com')
}

/** Use host/port transport instead of Nodemailer `service: 'gmail'` (advanced). */
function useHostTransportForGmail() {
  const v = String(process.env.SMTP_USE_HOST_TRANSPORT || '').trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
}

/**
 * Build Nodemailer transport for Gmail (`service: 'gmail'`) or generic SMTP (host/port).
 * Auth always uses `process.env.SMTP_USER` and `process.env.SMTP_PASS` (Gmail: 16‑character App Password).
 */
export function getMailer() {
  if (transporter) return transporter
  const user = (process.env.SMTP_USER || '').trim()
  const pass = (process.env.SMTP_PASS || '').replace(/\s/g, '')
  if (!user || !pass) {
    return null
  }

  const debug = process.env.SMTP_DEBUG === '1'
  const ipFamily = Number(process.env.SMTP_IP_FAMILY || 4)
  const family = Number.isFinite(ipFamily) ? ipFamily : 4
  const lookup = (hostname, _options, callback) => {
    dns.lookup(hostname, { family }, callback)
  }
  const common = {
    auth: { user, pass },
    connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 30_000),
    greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS || 30_000),
    socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 45_000),
    family,
    lookup,
    debug,
    logger: debug,
  }

  // Gmail `service: 'gmail'` ignores IPv4 family on Railway; use host/port in production.
  const preferHostTransport =
    useHostTransportForGmail() ||
    (process.env.NODE_ENV === 'production' && isLikelyGmail())

  if (isLikelyGmail() && !preferHostTransport) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      ...common,
    })
    return transporter
  }

  const host = smtpHost()
  const port = Number(process.env.SMTP_PORT || 587)
  const secure = port === 465
  transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    ...common,
    requireTLS: port === 587 && !secure,
    tls: {
      minVersion: 'TLSv1.2',
    },
  })
  return transporter
}

/** Human-readable SMTP / Gmail error for logs. */
function formatSmtpError(err) {
  if (!err) return 'Unknown error'
  const parts = [err.message || String(err)]
  const code = err.code || err.errno
  const resp = err.response || err.responseCode
  if (code) parts.push(`code=${code}`)
  if (resp) parts.push(`smtp=${resp}`)
  if (err.command) parts.push(`command=${err.command}`)
  const m = String(err.message || '').toLowerCase()
  if (m.includes('invalid login') || m.includes('authentication failed') || resp === 535) {
    parts.push('(likely bad SMTP_USER/SMTP_PASS — use a Google App Password, not your normal Gmail password)')
  }
  if (code === 'ETIMEDOUT' || code === 'ECONNRESET') {
    parts.push('(network / firewall / wrong host or port)')
  }
  return parts.join(' ')
}

/**
 * Verify SMTP on startup (connection + credentials). Logs a clear error on failure.
 * Set `SMTP_VERIFY_STRICT=1` to throw and stop the server if verify fails.
 */
export async function verifySmtpTransporter() {
  const user = (process.env.SMTP_USER || '').trim()
  const pass = (process.env.SMTP_PASS || '').replace(/\s/g, '')
  if (!user || !pass) {
    console.warn(
      '[smtp] SMTP_USER or SMTP_PASS missing — skipping transporter.verify() (configure both to send real 2FA email).',
    )
    return
  }

  try {
    const mailer = getMailer()
    if (!mailer) return
    await mailer.verify()
  } catch (err) {
    console.error('[smtp] transporter.verify() FAILED:', formatSmtpError(err))
    const strict =
      String(process.env.SMTP_VERIFY_STRICT || '').toLowerCase() === 'true' ||
      String(process.env.SMTP_VERIFY_STRICT || '').trim() === '1'
    if (strict) {
      throw err
    }
  }
}

/**
 * Send 2FA OTP. Requires SMTP_USER + SMTP_PASS in .env.
 * Called from Better Auth `twoFactor` `sendOTP` in `server/auth.js` (not skipped in development when credentials are set).
 *
 * Gmail: use a **Google App Password** (16 characters, often shown in 4×4 groups — spaces are stripped).
 * Create at https://myaccount.google.com/apppasswords — not your normal Gmail password.
 * SMTP_FROM should match SMTP_USER unless “Send mail as” allows another address.
 */
export async function sendTwoFactorOtpEmail(to, otp) {
  if (process.env.NODE_ENV === 'test' && process.env.AUTH_TEST_CAPTURE_OTP === '1') {
    captureOtp(to, otp)
    return
  }
  const mailer = getMailer()
  if (!mailer) {
    console.warn('[auth] SMTP_USER/SMTP_PASS missing — configure .env to send 2FA email.')
    console.info(`[auth] 2FA OTP for ${to} (console only): ${otp}`)
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'Email is not configured. Set SMTP_USER and SMTP_PASS in your .env file (use a Gmail App Password for Gmail), then restart the auth server.',
      )
    }
    return
  }

  const user = (process.env.SMTP_USER || '').trim()
  let from = (process.env.SMTP_FROM || user).trim()
  if (!from.includes('@')) from = user

  try {
    const info = await mailer.sendMail({
      from,
      to,
      replyTo: user,
      subject: 'Your sign-in verification code',
      text: `Your verification code is: ${otp}\n\nIt expires in a few minutes. If you did not try to sign in, ignore this email.`,
      html: `<p>Your verification code is:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px">${otp}</p><p>This code expires shortly. If you did not try to sign in, you can ignore this message.</p>`,
    })
    console.info(
      `[auth] 2FA email sent to ${to} (messageId: ${info.messageId || 'n/a'})`,
    )
  } catch (err) {
    const gmailHint = isLikelyGmail()
      ? ' Gmail: enable 2-Step Verification, create an App Password at https://myaccount.google.com/apppasswords , and put it in SMTP_PASS. SMTP_USER must be that Gmail address.'
      : ''
    console.error(`[auth] SMTP send failed.${gmailHint}`, formatSmtpError(err))

    const allowConsoleFallback =
      process.env.NODE_ENV !== 'production' &&
      (String(process.env.AUTH_SMTP_DEV_FALLBACK || '').toLowerCase() === 'true' ||
        String(process.env.AUTH_SMTP_DEV_FALLBACK || '').trim() === '1')

    if (allowConsoleFallback) {
      console.warn(
        '[auth] AUTH_SMTP_DEV_FALLBACK enabled: printing OTP to console after send failure.',
      )
      console.info(`[auth] 2FA OTP for ${to} (console only): ${otp}`)
      return
    }

    throw err
  }
}

/**
 * Send password reset link. Requires SMTP_USER + SMTP_PASS in .env (same transport as OTP).
 */
export async function sendPasswordResetEmail({ to, name, resetUrl }) {
  if (process.env.NODE_ENV === 'test' && process.env.AUTH_TEST_CAPTURE_RESET === '1') {
    captureResetUrl(to, resetUrl)
    return
  }

  const mailer = getMailer()
  const displayName = String(name || to || 'User').trim() || 'User'
  const subject = 'LenLearn LMS — Password Reset'
  const text = [
    `Hello ${displayName},`,
    '',
    'We received a request to reset your LenLearn LMS password.',
    '',
    `Reset your password: ${resetUrl}`,
    '',
    'This link expires in 30 minutes and can only be used once.',
    'If you did not request a password reset, you can ignore this email.',
    '',
    '— LenLearn LMS (Glendale School)',
  ].join('\n')

  const html = `
    <div style="font-family:Inter,system-ui,sans-serif;max-width:520px;margin:0 auto;color:#1f2937">
      <p style="font-size:16px;margin:0 0 12px">Hello <strong>${displayName}</strong>,</p>
      <p style="font-size:14px;line-height:1.6;margin:0 0 16px">
        We received a request to reset your <strong>LenLearn LMS</strong> password.
      </p>
      <p style="margin:0 0 20px">
        <a href="${resetUrl}" style="display:inline-block;background:#3182ce;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">
          Reset password
        </a>
      </p>
      <p style="font-size:13px;line-height:1.6;color:#4b5563;margin:0 0 8px">
        This link expires in <strong>30 minutes</strong> and can only be used <strong>once</strong>.
      </p>
      <p style="font-size:13px;line-height:1.6;color:#6b7280;margin:0">
        If you did not request a password reset, you can ignore this email.
      </p>
      <p style="font-size:12px;color:#9ca3af;margin:24px 0 0">LenLearn LMS · Glendale School</p>
    </div>
  `.trim()

  if (!mailer) {
    console.warn('[auth] SMTP_USER/SMTP_PASS missing — configure .env to send password reset email.')
    console.info(`[auth] Password reset link for ${to} (console only): ${resetUrl}`)
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'Email is not configured. Set SMTP_USER and SMTP_PASS in your .env file, then restart the auth server.',
      )
    }
    return
  }

  const user = (process.env.SMTP_USER || '').trim()
  let from = (process.env.SMTP_FROM || user).trim()
  if (!from.includes('@')) from = user

  try {
    const info = await mailer.sendMail({ from, to, replyTo: user, subject, text, html })
    console.info(`[auth] Password reset email sent to ${to} (messageId: ${info.messageId || 'n/a'})`)
  } catch (err) {
    console.error('[auth] Password reset SMTP send failed:', formatSmtpError(err))
    const allowConsoleFallback =
      process.env.NODE_ENV !== 'production' &&
      (String(process.env.AUTH_SMTP_DEV_FALLBACK || '').toLowerCase() === 'true' ||
        String(process.env.AUTH_SMTP_DEV_FALLBACK || '').trim() === '1')
    if (allowConsoleFallback) {
      console.warn('[auth] AUTH_SMTP_DEV_FALLBACK enabled: printing reset URL to console after send failure.')
      console.info(`[auth] Password reset link for ${to} (console only): ${resetUrl}`)
      return
    }
    throw err
  }
}
