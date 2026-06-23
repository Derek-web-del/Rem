import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate, Link } from 'react-router-dom'
import { authClient, passwordPolicyHint } from './lib/auth-client.js'
import { INSTITUTE_ADMIN_EMAIL } from '../../shared/constants.js'
import { isLoginPath, loginViewFromPath, loginPathWithPortalId, roleFromLoginPath, syncLoginPortalSearch } from './lib/loginRoutes.js'
import {
  homePathForRole,
  loginPathForPortal,
  portalMatchesUserRole,
  portalMismatchMessage,
  resolveAuthRoleForPortal,
} from './lib/roleAccess.js'
import { clearTermsAcceptance } from './lib/termsSession.js'
import { resolveStudentPostLoginPath } from './lib/studentPortal.js'
import { maskEmail } from './lib/maskEmail.js'
import ForgotPassword from './pages/ForgotPassword.jsx'
import GlendaleLogo from './assets/GlendaleLogo.png'
import LoginSceneBackground from './components/LoginSceneBackground.jsx'
import {
  SCHOOL_DOCUMENT_TITLE,
  SCHOOL_SIGN_IN_TITLE,
  setDocumentTitle,
} from './lib/documentTitle.js'

const PRIMARY_BLUE = '#3182ce'
const OTP_SENDER_EMAIL =
  import.meta.env.VITE_OTP_SENDER_EMAIL || 'noreply.lenlearnotp@gmail.com'
const TAGLINE_GREEN = 'rgba(80, 220, 130, 1)'

function loginPortalHeader(roleId) {
  if (roleId === 'INSTITUTE') return 'admin'
  if (roleId === 'FACULTY') return 'faculty'
  if (roleId === 'STUDENT') return 'student'
  return ''
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
  { id: 'INSTITUTE', label: 'INSTITUTE', icon: 'ti-building' },
  { id: 'FACULTY', label: 'FACULTY', icon: 'ti-notebook' },
  { id: 'STUDENT', label: 'STUDENT', icon: 'ti-school' },
]

/** Cap wait on POST `/two-factor/verify-otp` so a hung proxy/network does not spin forever. */
const VERIFY_OTP_TIMEOUT_MS = 30_000

const SESSION_WAIT_MAX_RETRIES = 8
const SESSION_WAIT_DELAY_MS = 400

async function waitForEstablishedSession() {
  for (let i = 0; i < SESSION_WAIT_MAX_RETRIES; i++) {
    const { data } = await authClient.getSession()
    if (data?.session && data?.user?.id) return data
    await new Promise((r) => setTimeout(r, SESSION_WAIT_DELAY_MS))
  }
  return null
}

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
  const [otpDestinationEmail, setOtpDestinationEmail] = useState('')
  const [otpFailedAttempts, setOtpFailedAttempts] = useState(0)
  const [otpResendCooldown, setOtpResendCooldown] = useState(0)
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
    const params = new URLSearchParams(location.search)
    if (params.get('reset') === 'success') {
      setLoginHint('Password reset successfully. Sign in with your new password.')
      void authClient.signOut()
    }
  }, [location.search])

  useEffect(() => {
    if (loginViewFromPath(location.pathname) !== 'login') return
    const synced = syncLoginPortalSearch(location.pathname, location.search)
    if (!synced || synced === location.search) return
    navigate({ pathname: location.pathname, search: synced }, { replace: true })
  }, [location.pathname, location.search, navigate])

  useEffect(() => {
    const onSignInScreen =
      view === 'select' || view === 'forgot' || (view === 'login' && loginStep === 'credentials')
    setDocumentTitle(onSignInScreen ? SCHOOL_SIGN_IN_TITLE : SCHOOL_DOCUMENT_TITLE)
  }, [view, loginStep])

  useEffect(() => {
    if (otpResendCooldown <= 0) return undefined
    const timer = setInterval(() => setOtpResendCooldown((v) => Math.max(0, v - 1)), 1000)
    return () => clearInterval(timer)
  }, [otpResendCooldown])

  useEffect(() => {
    setShowPassword(false)
    setAuthError('')
    setLoginHint('')
    setLoginStep('credentials')
    setPassword('')
    setOtpCode('')
    setOtpDestinationEmail('')
    setOtpFailedAttempts(0)
    setOtpResendCooldown(0)
    setIdentifier('')
  }, [roleId, view])

  const handleAuthSuccess = useCallback(async (prefetchedSessionData, { fromOtp = false } = {}) => {
    setLoginStep('credentials')
    setPassword('')
    setOtpCode('')
    setOtpDestinationEmail('')
    setOtpFailedAttempts(0)
    setOtpResendCooldown(0)
    setAuthError('')

    const sessionData = await waitForEstablishedSession()
    if (import.meta.env.DEV) {
      console.log('[OTP] Session after verify:', sessionData)
    }
    if (!sessionData?.user?.id) {
      setAuthError('Session could not be established. Please sign in again.')
      return
    }

    const user = sessionData.user
    const resolvedRole = resolveAuthRoleForPortal(user, roleId, INSTITUTE_ADMIN_EMAIL)

    const go = (path) => {
      if (import.meta.env.DEV) {
        console.log('[OTP] Navigating to:', path, 'fromOtp:', fromOtp)
      }
      if (fromOtp) {
        window.location.assign(path)
      } else {
        navigate(path, { replace: true })
      }
    }

    if (!roleId || !portalMatchesUserRole(roleId, resolvedRole)) {
      await authClient.signOut()
      setAuthError(portalMismatchMessage(roleId, resolvedRole))
      const correctPortal =
        resolvedRole === 'student'
          ? 'STUDENT'
          : resolvedRole === 'teacher' || resolvedRole === 'faculty'
            ? 'FACULTY'
            : resolvedRole === 'admin'
              ? 'INSTITUTE'
              : null
      if (correctPortal) navigate(loginPathForPortal(correctPortal), { replace: true })
      return
    }

    if (resolvedRole === 'student') {
      clearTermsAcceptance()
      go(await resolveStudentPostLoginPath())
      return
    }
    go(homePathForRole(resolvedRole))
  }, [roleId, navigate])

  useEffect(() => {
    if (sessionPending) return
    const params = new URLSearchParams(location.search)
    if (params.get('reset') === 'success') return
    if (!session || !isLoginPath(location.pathname)) return

    const portal = roleFromLoginPath(location.pathname)
    if (!portal) return

    const resolvedRole = resolveAuthRoleForPortal(sessionUser, portal, INSTITUTE_ADMIN_EMAIL)
    if (!portalMatchesUserRole(portal, resolvedRole)) {
      void authClient.signOut()
      return
    }

    if (resolvedRole === 'student') {
      let cancelled = false
      clearTermsAcceptance()
      void (async () => {
        const dest = await resolveStudentPostLoginPath()
        if (!cancelled) navigate(dest, { replace: true })
      })()
      return () => {
        cancelled = true
      }
    }
    navigate(homePathForRole(resolvedRole), { replace: true })
  }, [session, sessionUser, sessionPending, location.pathname, location.search, navigate])

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
            ? 'Enter your Student Login ID and password.'
            : roleId === 'INSTITUTE'
              ? 'Enter your Institute Login ID and password.'
              : 'Enter your username and password.',
      )
      return
    }

    setAuthBusy(true)
    try {
      const portalHeader = loginPortalHeader(roleId)
      const signIn = authClient.signIn.username(
        { username: id, password },
        portalHeader
          ? { fetchOptions: { headers: { 'X-LMS-Login-Portal': portalHeader } } }
          : undefined,
      )

      const { data, error } = await signIn

      if (error) {
        setAuthError(formatAuthError(error))
        return
      }

      if (data?.twoFactorRedirect) {
        setLoginStep('otp')
        setOtpFailedAttempts(0)
        try {
          const sessionPeek = await authClient.getSession()
          const peekEmail = String(sessionPeek?.data?.user?.email || '').trim()
          if (peekEmail) setOtpDestinationEmail(peekEmail)
          const send = await authClient.twoFactor.sendOtp({})
          if (send?.error) {
            setAuthError(formatAuthError(send.error) || 'Could not send email code.')
            setLoginStep('credentials')
          } else {
            setOtpResendCooldown(30)
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

  async function handleOtpResend() {
    if (authBusy || otpResendCooldown > 0) return
    setAuthError('')
    setAuthBusy(true)
    try {
      const send = await authClient.twoFactor.sendOtp({})
      if (send?.error) {
        setAuthError(formatAuthError(send.error) || 'Could not resend verification code.')
        return
      }
      setOtpResendCooldown(30)
    } catch (e) {
      setAuthError(formatAuthError(e) || 'Could not resend verification code.')
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
      if (import.meta.env.DEV) {
        console.log('[OTP] Verification result:', result)
      }
      await handleAuthSuccess(result.data, { fromOtp: true })
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
    setOtpDestinationEmail('')
    setOtpFailedAttempts(0)
    setOtpResendCooldown(0)
    setAuthError('')
  }

  function selectRole(id) {
    navigate(loginPathWithPortalId(id) || '/login')
  }

  function backToSelection() {
    navigate('/login')
  }

  return (
    <div
      className="relative min-h-svh w-full overflow-hidden font-[Inter,system-ui,sans-serif]"
      style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      <LoginSceneBackground />

      {(view === 'login' || view === 'forgot') && (
        <button
          type="button"
          onClick={backToSelection}
          className="login-back-btn absolute left-4 top-[4.5rem] z-20 flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium text-white shadow-lg transition hover:border-[rgba(80,200,130,0.4)] hover:bg-[rgba(80,200,130,0.1)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(80,220,130,0.5)] md:left-6 md:top-[4.5rem]"
        >
          <span className="text-base leading-none" aria-hidden>
            ‹
          </span>
          Back to Selection
        </button>
      )}

      <div className="relative z-10 flex min-h-svh items-center justify-center px-4 py-10 md:px-6">
        <div className="login-card flex flex-col items-center">
          <div className="relative z-[1] flex w-full flex-col items-center text-center">
            <div className="login-card__seal-wrap">
              <img src={GlendaleLogo} alt="Glendale School seal" />
            </div>
            <h2 className="login-card__name">LenLearn</h2>
            <p className="login-card__school">Glendale High School LMS</p>
          </div>

          <div className="login-card__line" />

          <div className="relative z-[1] w-full">
            <h1 className="login-card__signin text-center">
              {view === 'forgot' ? 'Forgot password' : 'Sign in'}
            </h1>

          {view === 'select' && (
            <p
              className="login-card__access text-center"
              style={{ color: TAGLINE_GREEN }}
            >
              access to your dashboard.
            </p>
          )}

          {view === 'login' && selected && loginStep === 'credentials' && (
            <p
              className="login-card__access text-center"
              style={{ color: TAGLINE_GREEN }}
            >
              access to <span className="font-bold">{selected.id}</span> dashboard.
            </p>
          )}

          {view === 'forgot' && (
            <p className="mt-2 text-center text-sm text-white/85">
              Reset link is sent to your registered email — not your Login ID.
            </p>
          )}

          {view === 'login' && selected && loginStep === 'otp' && (
            <p
              className="login-card__access text-center"
              style={{ color: TAGLINE_GREEN }}
            >
              Enter the code sent to <span className="font-bold break-all text-white">your inbox</span>.
            </p>
          )}

          {view === 'select' && (
            <div className="grid w-full grid-cols-3 gap-[9px]">
              {ROLES.map(({ id, label, icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => selectRole(id)}
                  className="login-role-btn focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(80,220,130,0.5)]"
                  aria-label={label}
                >
                  <i className={`ti ${icon}`} aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
          )}

          {view === 'login' && loginStep === 'credentials' && (
            <form className="mt-6 flex flex-col gap-5" onSubmit={handleCredentialSubmit}>
              <div>
                <label
                  htmlFor="portal-identifier"
                  className="mb-1.5 block text-sm font-medium text-white"
                >
                  {roleId === 'FACULTY'
                    ? 'Faculty Code ID'
                    : roleId === 'STUDENT'
                      ? 'Student Login ID'
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
                        ? 'Enter Student Login ID'
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
              <div className="flex justify-end">
                <Link
                  to="/login/forgot-password"
                  className="text-sm font-medium text-white/90 underline-offset-2 hover:underline"
                >
                  Forgot Password?
                </Link>
              </div>
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

          {view === 'forgot' && <ForgotPassword />}

          {view === 'login' && loginStep === 'otp' && (
            <form className="mt-6 flex flex-col gap-5" onSubmit={handleOtpSubmit}>
              {otpDestinationEmail ? (
                <p className="text-center text-sm text-white/90">
                  Code sent to: <span className="font-medium">{maskEmail(otpDestinationEmail)}</span>
                </p>
              ) : null}
              <p className="text-center text-xs text-white/80">
                Check your school email inbox. The code was sent from {OTP_SENDER_EMAIL}.
              </p>
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
              <div className="flex flex-col items-center gap-2">
                <p className="text-center text-xs text-white/70">
                  Didn&apos;t receive a code? Check your spam or junk folder.
                </p>
                <button
                  type="button"
                  disabled={authBusy || otpResendCooldown > 0}
                  onClick={() => handleOtpResend()}
                  className="text-sm font-medium text-white/90 underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:text-white/50 disabled:no-underline"
                >
                  {otpResendCooldown > 0 ? `Resend in ${otpResendCooldown}s` : 'Resend Code'}
                </button>
              </div>
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

          <p className="login-card__footer relative z-[1] mt-8 w-full">
            © 2026 LenLearn LMS. All rights reserved.
          </p>
          </div>
        </div>
      </div>
    </div>
  )
}
