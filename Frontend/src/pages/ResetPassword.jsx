import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { authClient, passwordPolicyHint, STRONG_PASSWORD_REGEX } from '../lib/auth-client.js'
import { getPasswordStrength, passwordRequirementChecks } from '../lib/passwordStrength.js'

const PRIMARY_BLUE = '#3182ce'

function EyeIcon({ off }) {
  if (off) {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </svg>
    )
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function Requirement({ ok, label }) {
  return (
    <li className={ok ? 'text-emerald-100' : 'text-white/70'}>
      <span aria-hidden>{ok ? '✓' : '○'}</span> {label}
    </li>
  )
}

export default function ResetPassword() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const token = String(params.get('token') || '').trim()
  const invalidFromQuery = params.get('error') === 'INVALID_TOKEN'

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [busy, setBusy] = useState(false)
  const [countdown, setCountdown] = useState(5)

  const invalid = invalidFromQuery || !token
  const checks = useMemo(() => passwordRequirementChecks(password), [password])
  const strength = useMemo(() => getPasswordStrength(password), [password])
  const canSubmit =
    !invalid &&
    STRONG_PASSWORD_REGEX.test(password) &&
    password === confirm &&
    !busy

  useEffect(() => {
    if (!success) return undefined
    if (countdown <= 0) {
      navigate('/login?reset=success', { replace: true })
      return undefined
    }
    const timer = setTimeout(() => setCountdown((v) => v - 1), 1000)
    return () => clearTimeout(timer)
  }, [success, countdown, navigate])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!STRONG_PASSWORD_REGEX.test(password)) {
      setError(passwordPolicyHint())
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setBusy(true)
    try {
      const result = await authClient.resetPassword({ newPassword: password, token })
      if (result?.error) {
        setError(String(result.error.message || 'Could not reset password. Request a new link.'))
        return
      }
      await authClient.signOut()
      setSuccess(true)
    } catch (err) {
      const message = String(
        err?.message || err?.body?.message || err?.error?.message || '',
      ).trim()
      if (message.toLowerCase().includes('weak_password') || err?.body?.code === 'WEAK_PASSWORD') {
        setError(passwordPolicyHint())
      } else {
        setError(message || 'This reset link is invalid or expired. Request a new one.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="relative min-h-svh w-full overflow-hidden font-[Inter,system-ui,sans-serif]"
      style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      <div className="absolute inset-0 flex" aria-hidden>
        <div className="w-1/2 bg-[#3182ce]" />
        <div className="w-1/2 bg-[#e53935]" />
      </div>

      <div className="relative z-10 flex min-h-svh items-center justify-center px-4 py-12">
        <div
          className="w-full max-w-110 rounded-2xl border border-white/40 bg-white/20 p-8 shadow-xl backdrop-blur-md md:p-10"
          style={{ WebkitBackdropFilter: 'blur(12px)' }}
        >
          <div className="flex flex-col items-center text-center">
            <div className="login-logo-badge flex h-24 w-24 items-center justify-center rounded-full border-2 border-white/80 bg-white p-3 shadow-lg">
              <img src="/images/lenlearn-worm-logo.png" alt="LenLearn" className="h-full w-full object-contain" />
            </div>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-white">LenLearn</h2>
            <p className="mt-1 text-sm text-white/80">Glendale High School LMS</p>
          </div>

          <hr className="my-6 border-white/30" />

          <h1 className="text-center text-2xl font-bold tracking-tight text-white">Reset password</h1>

          {invalid ? (
            <div className="mt-6 space-y-4 text-center text-sm text-white/90">
              <p>This reset link is invalid or has expired.</p>
              <Link
                to="/login/forgot-password"
                className="inline-block rounded-lg bg-[#3182ce] px-5 py-2.5 font-semibold text-white hover:brightness-110"
              >
                Request new link
              </Link>
              <p>
                <Link to="/login" className="font-medium text-white/90 underline-offset-2 hover:underline">
                  Back to sign in
                </Link>
              </p>
            </div>
          ) : success ? (
            <div className="mt-6 space-y-3 text-center text-sm text-white/90">
              <p className="font-semibold text-emerald-100">Password updated successfully.</p>
              <p>Redirecting to sign in in {countdown}s…</p>
              <p className="text-xs text-white/70">You will still need your email OTP after signing in.</p>
            </div>
          ) : (
            <form className="mt-6 flex flex-col gap-5" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="reset-password" className="mb-1.5 block text-sm font-medium text-white">
                  New password
                </label>
                <div className="relative">
                  <input
                    id="reset-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={password}
                    onChange={(ev) => setPassword(ev.target.value)}
                    className="w-full rounded-lg border-2 border-neutral-300 bg-white py-2.5 pl-3 pr-12 text-neutral-800 shadow-sm outline-none focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/30"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <EyeIcon off={!showPassword} />
                  </button>
                </div>
                <p className="mt-1 text-xs text-white/75">Strength: {strength}</p>
              </div>

              <div>
                <label htmlFor="reset-confirm" className="mb-1.5 block text-sm font-medium text-white">
                  Confirm password
                </label>
                <div className="relative">
                  <input
                    id="reset-confirm"
                    type={showConfirm ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(ev) => setConfirm(ev.target.value)}
                    className="w-full rounded-lg border-2 border-neutral-300 bg-white py-2.5 pl-3 pr-12 text-neutral-800 shadow-sm outline-none focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/30"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100"
                    aria-label={showConfirm ? 'Hide password' : 'Show password'}
                  >
                    <EyeIcon off={!showConfirm} />
                  </button>
                </div>
              </div>

              <ul className="space-y-1 text-xs">
                <Requirement ok={checks.len} label="At least 8 characters" />
                <Requirement ok={checks.upper} label="One uppercase letter" />
                <Requirement ok={checks.lower} label="One lowercase letter" />
                <Requirement ok={checks.num} label="One number" />
                <Requirement ok={checks.special} label="One symbol" />
              </ul>

              {error ? <p className="text-center text-sm text-red-200">{error}</p> : null}

              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full rounded-lg py-3 text-base font-bold text-white shadow-lg transition hover:brightness-110 disabled:opacity-60"
                style={{ backgroundColor: PRIMARY_BLUE }}
              >
                {busy ? 'Updating…' : 'Update password'}
              </button>

              <p className="text-center text-sm">
                <Link to="/login/forgot-password" className="font-medium text-white/90 underline-offset-2 hover:underline">
                  Request new link
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
