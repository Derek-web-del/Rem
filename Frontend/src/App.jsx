import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { authClient, passwordPolicyHint } from './lib/auth-client.js'
import { INSTITUTE_ADMIN_EMAIL } from '../../shared/constants.js'
import { isLoginPath, loginViewFromPath, roleFromLoginPath, ROLE_TO_LOGIN_PATH } from './lib/loginRoutes.js'

const PRIMARY_BLUE = '#3182ce'
const LABEL_BLUE = '#4A90E2'
const ICON_GREY = '#757575'

function PersonIcon() {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="none"
      stroke={ICON_GREY}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

function BookIcon() {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="none"
      stroke={ICON_GREY}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      <path d="M8 7h8M8 11h6" />
    </svg>
  )
}

function MortarboardIcon() {
  return (
    <svg
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="none"
      stroke={ICON_GREY}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
      <path d="M6 12v5c0 2 2 3 6 3s6-1 6-3v-5" />
    </svg>
  )
}

function EyeIcon({ off }) {
  if (off) {
    return (
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </svg>
    )
  }
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

const ROLES = [
  { id: 'INSTITUTE', label: 'INSTITUTE', Icon: PersonIcon },
  { id: 'FACULTY', label: 'FACULTY', Icon: BookIcon },
  { id: 'STUDENT', label: 'STUDENT', Icon: MortarboardIcon },
]

/** Cap wait on POST `/two-factor/verify-otp` so a hung proxy/network does not spin forever. */
const VERIFY_OTP_TIMEOUT_MS = 30_000

function formatAuthError(error) {
  if (!error) return 'Something went wrong.'

  const raw = (() => {
    if (typeof error === 'string') return error
    if (error instanceof Error && typeof error.message === 'string' && error.message.trim()) {
      return error.message
    }
    if (typeof error?.message === 'string' && error.message.trim()) return error.message
    if (typeof error?.body?.message === 'string' && error.body.message.trim()) return error.body.message
    if (typeof error?.error?.message === 'string' && error.error.message.trim()) return error.error.message
    if (typeof error?.code === 'string' && error.code.trim()) return error.code
    try {
      const json = JSON.stringify(error)
      if (json && json !== '{}' && json !== 'null') return json
    } catch {}
    return String(error)
  })()

  if (raw.includes('ACCOUNT_LOCKED') || error.code === 'ACCOUNT_LOCKED' || error.body?.code === 'ACCOUNT_LOCKED') {
    return 'Sign-in temporarily unavailable. Please try again later.'
  }
  if (raw.includes('WEAK_PASSWORD') || error.code === 'WEAK_PASSWORD' || error.body?.code === 'WEAK_PASSWORD') {
    return passwordPolicyHint()
  }
  return raw
}

export default function App() {
  const navigate = useNavigate()
  const location = useLocation()
  const sessionState = authClient.useSession()
  const sessionPending = sessionState.isPending
  const sessionData = sessionState.data

  const view = loginViewFromPath(location.pathname) ?? 'select'
  const roleId = roleFromLoginPath(location.pathname)

  const [showPassword, setShowPassword] = useState(false)
  const [loginHint, setLoginHint] = useState('')
  const [loginStep, setLoginStep] = useState('credentials')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [otpFailedAttempts, setOtpFailedAttempts] = useState(0)
  const [authError, setAuthError] = useState('')
  const [authBusy, setAuthBusy] = useState(false)

  const selected = ROLES.find((r) => r.id === roleId)
  const session = sessionData?.session
  const sessionUser = sessionData?.user

  useEffect(() => {
    if (loginViewFromPath(location.pathname) === null) {
      navigate('/login', { replace: true })
    }
  }, [location.pathname, navigate])

  useEffect(() => {
    setShowPassword(false)
    setAuthError('')
    setLoginHint('')
    setLoginStep('credentials')
    setPassword('')
    setOtpCode('')
    setOtpFailedAttempts(0)
    setIdentifier('')
  }, [roleId, view])

  const handleAuthSuccess = useCallback(async (prefetchedSessionData) => {
    setLoginStep('credentials')
    setPassword('')
    setOtpCode('')
    setOtpFailedAttempts(0)
    setAuthError('')
    const hasPrefetch =
      prefetchedSessionData != null &&
      typeof prefetchedSessionData === 'object' &&
      prefetchedSessionData.user != null
    const { data } = hasPrefetch
      ? { data: prefetchedSessionData }
      : await authClient.getSession()
    const user = data?.user
    const isInstituteAdmin =
      roleId === 'INSTITUTE' ||
      user?.role === 'admin' ||
      String(user?.email || '').toLowerCase() === INSTITUTE_ADMIN_EMAIL.toLowerCase()
    if (isInstituteAdmin) {
      navigate('/admin/institute_dashboard', { replace: true })
      return
    }
    if (roleId === 'FACULTY') {
      const r = String(user?.role || '').trim().toLowerCase()
      if (r === 'teacher' || r === 'user' || r === 'admin') {
        const fromEmailOtp =
          hasPrefetch && typeof data.token === 'string' && data.token.length > 0
        if (fromEmailOtp) {
          void authClient.getSession()
          window.location.assign('/teacher/dashboard')
          return
        }
        navigate('/teacher/dashboard')
        return
      }
    }
    if (roleId === 'STUDENT') {
      const r = String(user?.role || '').trim().toLowerCase()
      if (r === 'student') {
        navigate('/student/quizzes', { replace: true })
        return
      }
    }
    setLoginHint('You are signed in. Open the Institute role to reach the admin dashboard.')
  }, [roleId, navigate])

  useEffect(() => {
    if (sessionPending) return
    if (!session || !isLoginPath(location.pathname)) return
    const isInstituteAdmin =
      sessionUser?.role === 'admin' ||
      String(sessionUser?.email || '').toLowerCase() ===
        INSTITUTE_ADMIN_EMAIL.toLowerCase()
    if (isInstituteAdmin) {
      navigate('/admin/institute_dashboard', { replace: true })
      return
    }
    const role = String(sessionUser?.role || '').trim().toLowerCase()
    if (role === 'student') {
      navigate('/student/quizzes', { replace: true })
    }
  }, [session, sessionUser, sessionPending, location.pathname, navigate])

  async function handleCredentialSubmit(e) {
    e.preventDefault()
    setAuthError('')
    setLoginHint('')
    const id = identifier.trim()
    if (!id || !password) {
      setAuthError(
        roleId === 'FACULTY'
          ? 'Enter your Faculty Code ID and password.'
          : roleId === 'STUDENT'
            ? 'Enter your login ID and password.'
            : roleId === 'INSTITUTE'
              ? 'Enter your Institute Login ID and password.'
              : 'Enter your username and password.',
      )
      return
    }

    setAuthBusy(true)
    try {
      const signIn = authClient.signIn.username({ username: id, password })

      const { data, error } = await signIn

      if (error) {
        setAuthError(formatAuthError(error))
        return
      }

      if (data?.twoFactorRedirect) {
        setLoginStep('otp')
        setOtpFailedAttempts(0)
        try {
          const send = await authClient.twoFactor.sendOtp({})
          if (send?.error) {
            setAuthError(formatAuthError(send.error) || 'Could not send email code.')
            setLoginStep('credentials')
          }
        } catch (e) {
          setAuthError(formatAuthError(e) || 'Could not send email code.')
          setLoginStep('credentials')
        }
        return
      }

      await handleAuthSuccess()
    } finally {
      setAuthBusy(false)
    }
  }

  async function handleOtpSubmit(e) {
    e.preventDefault()
    setAuthError('')
    const digitsOnly = String(otpCode || '').replace(/\D/g, '')
    if (digitsOnly.length < 6) {
      setAuthError('Enter the 6-digit code from your email.')
      return
    }
    setAuthBusy(true)
    try {
      let verifyTimer
      const result = await Promise.race([
        authClient.twoFactor.verifyOtp({ code: digitsOnly }).finally(() => clearTimeout(verifyTimer)),
        new Promise((_, reject) => {
          verifyTimer = setTimeout(() => {
            reject(
              new Error(
                'Verification timed out. Confirm `npm run dev:auth` is running and Vite can reach `/api/auth` (see VITE_AUTH_BASE_URL).',
              ),
            )
          }, VERIFY_OTP_TIMEOUT_MS)
        }),
      ])
      if (result.error) {
        const nextAttempts = otpFailedAttempts + 1
        setOtpFailedAttempts(nextAttempts)
        if (nextAttempts >= 3) {
          await authClient.signOut()
          setLoginStep('credentials')
          setOtpCode('')
          setOtpFailedAttempts(0)
          setAuthError('Too many invalid codes. Please sign in again.')
          return
        }
        setAuthError(`${formatAuthError(result.error)} (${3 - nextAttempts} attempt(s) left)`)
        return
      }
      await handleAuthSuccess(result.data)
    } catch (err) {
      setAuthError(formatAuthError(err) || 'Verification failed. Check your connection and try again.')
    } finally {
      setAuthBusy(false)
    }
  }

  async function cancelOtpStep() {
    await authClient.signOut()
    setLoginStep('credentials')
    setOtpCode('')
    setOtpFailedAttempts(0)
    setAuthError('')
  }

  function selectRole(id) {
    navigate(ROLE_TO_LOGIN_PATH[id] || '/login')
  }

  function backToSelection() {
    navigate('/login')
  }

  return (
    <div
      className="relative min-h-svh w-full overflow-hidden font-[Inter,system-ui,sans-serif]"
      style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: 'url(/school-bg.png)' }}
        role="presentation"
      />
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
        aria-hidden
      />

      {view === 'login' && (
        <button
          type="button"
          onClick={backToSelection}
          className="absolute left-4 top-4 z-20 flex items-center gap-2 rounded-full border border-white/10 bg-black/45 px-4 py-2.5 text-sm font-medium text-white shadow-lg backdrop-blur-md transition hover:bg-black/55 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 md:left-6 md:top-6"
        >
          <span className="text-base leading-none" aria-hidden>
            ‹
          </span>
          Back to Selection
        </button>
      )}

      <div className="relative z-10 flex min-h-svh items-center justify-center px-4 pb-10 pt-24 md:px-6 md:pb-12 md:pt-28">
        <div
          className="w-full max-w-110 rounded-3xl border border-white/30 bg-white/20 p-8 shadow-2xl backdrop-blur-[14px] md:p-10"
          style={{ WebkitBackdropFilter: 'blur(14px)' }}
        >
          <h1 className="text-center text-3xl font-bold tracking-tight text-white md:text-4xl">
            Sign in
          </h1>

          {view === 'select' && (
            <p
              className="mt-2 text-center text-base font-medium md:text-lg"
              style={{ color: LABEL_BLUE }}
            >
              access to your dashboard.
            </p>
          )}

          {view === 'login' && selected && loginStep === 'credentials' && (
            <p
              className="mt-2 text-center text-base font-medium md:text-lg"
              style={{ color: LABEL_BLUE }}
            >
              access to <span className="font-bold">{selected.id}</span> dashboard.
            </p>
          )}

          {view === 'login' && selected && loginStep === 'otp' && (
            <p
              className="mt-2 text-center text-base font-medium md:text-lg"
              style={{ color: LABEL_BLUE }}
            >
              Enter the code sent to <span className="font-bold break-all text-white">your inbox</span>.
            </p>
          )}

          {view === 'select' && (
            <div className="mt-8 grid grid-cols-3 gap-3 sm:gap-4">
              {ROLES.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => selectRole(id)}
                  className="flex aspect-square flex-col items-center justify-center gap-3 rounded-xl bg-white p-3 shadow-md transition duration-200 hover:scale-[1.04] hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 active:scale-[0.98] sm:p-4"
                >
                  <Icon />
                  <span
                    className="text-[10px] font-semibold tracking-wider sm:text-xs"
                    style={{ color: LABEL_BLUE }}
                  >
                    {label}
                  </span>
                </button>
              ))}
            </div>
          )}

          {view === 'login' && loginStep === 'credentials' && (
            <form className="mt-8 flex flex-col gap-5" onSubmit={handleCredentialSubmit}>
              <div>
                <label
                  htmlFor="portal-identifier"
                  className="mb-1.5 block text-sm font-medium text-white"
                >
                  {roleId === 'FACULTY'
                    ? 'Faculty Code ID'
                    : roleId === 'STUDENT'
                      ? 'Login ID'
                      : roleId === 'INSTITUTE'
                        ? 'Institute Login ID'
                        : 'Username'}
                </label>
                <input
                  id="portal-identifier"
                  name="identifier"
                  type="text"
                  autoComplete="username"
                  placeholder={
                    roleId === 'FACULTY'
                      ? 'Enter Faculty Code ID'
                      : roleId === 'STUDENT'
                        ? 'Enter login ID'
                        : roleId === 'INSTITUTE'
                          ? 'Enter Institute Login ID'
                          : 'Enter username'
                  }
                  value={identifier}
                  onChange={(ev) => setIdentifier(ev.target.value)}
                  className="w-full rounded-lg border-2 border-neutral-300 bg-white px-3 py-2.5 text-neutral-800 shadow-sm outline-none transition placeholder:text-neutral-400 focus:border-red-500 focus:ring-2 focus:ring-red-500/25"
                />
              </div>
              <div>
                <label
                  htmlFor="portal-password"
                  className="mb-1.5 block text-sm font-medium text-white"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="portal-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Password"
                    value={password}
                    onChange={(ev) => setPassword(ev.target.value)}
                    className="w-full rounded-lg border-2 border-neutral-300 bg-white py-2.5 pl-3 pr-12 text-neutral-800 shadow-sm outline-none transition placeholder:text-neutral-400 focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/30"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#3182ce]"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <EyeIcon off={!showPassword} />
                  </button>
                </div>
              </div>
              {authError ? (
                <p className="text-center text-sm text-red-200">{authError}</p>
              ) : null}
              {loginHint ? (
                <p className="text-center text-sm text-amber-100/95">{loginHint}</p>
              ) : null}
              <button
                type="submit"
                disabled={authBusy}
                className="mt-1 w-full rounded-lg py-3 text-base font-bold text-white shadow-lg transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:opacity-60"
                style={{ backgroundColor: PRIMARY_BLUE }}
              >
                {authBusy ? 'Signing in…' : 'Login'}
              </button>
            </form>
          )}

          {view === 'login' && loginStep === 'otp' && (
            <form className="mt-8 flex flex-col gap-5" onSubmit={handleOtpSubmit}>
              <div>
                <label htmlFor="portal-otp" className="mb-1.5 block text-sm font-medium text-white">
                  Verification code
                </label>
                <input
                  id="portal-otp"
                  name="otp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="6-digit code"
                  value={otpCode}
                  onChange={(ev) => setOtpCode(ev.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="w-full rounded-lg border-2 border-neutral-300 bg-white px-3 py-2.5 text-center font-mono text-lg tracking-[0.3em] text-neutral-800 shadow-sm outline-none transition focus:border-[#3182ce] focus:ring-2 focus:ring-[#3182ce]/30"
                />
              </div>
              {authError ? (
                <p className="text-center text-sm text-red-200">{authError}</p>
              ) : null}
              <button
                type="submit"
                disabled={authBusy}
                className="w-full rounded-lg py-3 text-base font-bold text-white shadow-lg transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-60"
                style={{ backgroundColor: PRIMARY_BLUE }}
              >
                {authBusy ? 'Verifying…' : 'Verify & continue'}
              </button>
              <button
                type="button"
                onClick={() => cancelOtpStep()}
                className="text-sm font-medium text-white/90 underline-offset-2 hover:underline"
              >
                Back to password
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
