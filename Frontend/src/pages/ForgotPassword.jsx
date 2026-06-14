import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { authClient } from '../lib/auth-client.js'
import { maskEmail } from '../lib/maskEmail.js'

const PRIMARY_BLUE = '#3182ce'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [submittedEmail, setSubmittedEmail] = useState('')
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return undefined
    const timer = setInterval(() => setCooldown((v) => Math.max(0, v - 1)), 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const trimmed = email.trim().toLowerCase()
    if (!trimmed || !trimmed.includes('@')) {
      setError('Enter the email address registered on your account.')
      return
    }
    setBusy(true)
    let blocked = false
    try {
      await authClient.requestPasswordReset({
        email: trimmed,
        redirectTo: '/reset-password',
      })
    } catch (err) {
      const status = err?.status ?? err?.response?.status
      const message = String(
        err?.message || err?.body?.message || err?.error?.message || '',
      ).trim()
      if (status === 429 || message.toLowerCase().includes('too many password reset')) {
        setError('Too many password reset requests. Please wait before trying again.')
        blocked = true
        return
      }
      /* Always show success — do not reveal whether the email exists */
    } finally {
      setBusy(false)
      if (!blocked) {
        setSubmittedEmail(trimmed)
        setSuccess(true)
        setCooldown(60)
      }
    }
  }

  return (
    <div className="mt-6 flex flex-col gap-5">
      <p className="text-center text-sm text-white/90">
        Enter the <strong className="text-white">registered email</strong> on your account.
        You sign in with your Login ID, but password reset uses your email address.
      </p>

      {success ? (
        <div className="rounded-lg border border-emerald-300/40 bg-emerald-950/30 px-4 py-4 text-center text-sm text-emerald-50">
          <p className="font-semibold">Check your inbox</p>
          <p className="mt-2 text-white/90">
            If an account exists for{' '}
            <span className="font-medium text-white">{maskEmail(submittedEmail)}</span>, we sent a
            reset link. The link expires in 30 minutes.
          </p>
          <p className="mt-2 text-xs text-white/70">Check spam or junk if you do not see it.</p>
        </div>
      ) : (
        <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="forgot-email" className="mb-1.5 block text-sm font-medium text-white">
              Registered email
            </label>
            <input
              id="forgot-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@school.edu"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              className="w-full rounded-lg border-2 border-neutral-300 bg-white px-3 py-2.5 text-neutral-800 shadow-sm outline-none transition placeholder:text-neutral-400 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/30"
            />
          </div>
          {error ? <p className="text-center text-sm text-red-200">{error}</p> : null}
          <button
            type="submit"
            disabled={busy || cooldown > 0}
            className="w-full rounded-lg py-3 text-base font-bold text-white shadow-lg transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-60"
            style={{ backgroundColor: PRIMARY_BLUE }}
          >
            {busy ? 'Sending…' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Send reset link'}
          </button>
        </form>
      )}

      <p className="text-center text-sm">
        <Link to="/login" className="font-medium text-white/90 underline-offset-2 hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  )
}
