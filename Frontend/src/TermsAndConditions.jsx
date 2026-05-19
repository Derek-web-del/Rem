import { useCallback, useEffect, useState } from 'react'
import BackButton from './components/BackButton.jsx'

const TERMS_ACCEPTED_KEY = 'lenlearn.termsAccepted'
/** Faculty / teacher portal — separate from institute admin acceptance. */
export const TEACHER_TERMS_ACCEPTED_KEY = 'lenlearn.teacherTermsAccepted'

function readAcceptedAtForKey(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.at === 'number') return parsed.at
  } catch {}
  return null
}

/** Clears saved acceptance (e.g. on institute logout). Next sign-in shows the terms gate again. */
export function clearInstituteTermsAcceptance() {
  try {
    localStorage.removeItem(TERMS_ACCEPTED_KEY)
  } catch {}
}

export function clearTeacherTermsAcceptance() {
  try {
    localStorage.removeItem(TEACHER_TERMS_ACCEPTED_KEY)
  } catch {}
}

export function isInstituteTermsAccepted() {
  return readAcceptedAtForKey(TERMS_ACCEPTED_KEY) !== null
}

export function isTeacherTermsAccepted() {
  return readAcceptedAtForKey(TEACHER_TERMS_ACCEPTED_KEY) !== null
}

function FileDocIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
    </svg>
  )
}

function AgreementIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  )
}

function scrollToId(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export default function TermsAndConditions({
  schoolName = 'LENLEARN',
  onBack,
  gateMode = false,
  onAccepted,
  /** localStorage key for `{ at: number }` acceptance record */
  acceptanceStorageKey = TERMS_ACCEPTED_KEY,
}) {
  const [agreed, setAgreed] = useState(false)
  const [acceptedAt, setAcceptedAt] = useState(null)
  const [justAgreed, setJustAgreed] = useState(false)

  useEffect(() => {
    const at = readAcceptedAtForKey(acceptanceStorageKey)
    if (at) {
      setAcceptedAt(at)
      setAgreed(true)
    }
  }, [acceptanceStorageKey])

  const handleAgree = useCallback(() => {
    const at = Date.now()
    try {
      localStorage.setItem(acceptanceStorageKey, JSON.stringify({ at }))
    } catch {}
    setAcceptedAt(at)
    setAgreed(true)
    setJustAgreed(true)
    onAccepted?.()
  }, [acceptanceStorageKey, onAccepted])

  const showThanks = justAgreed || acceptedAt

  const sections = [
    {
      id: 'section-acceptance',
      title: '1. Acceptance of Terms',
      body: (
        <p className="leading-relaxed text-neutral-700">
          By accessing and using the {schoolName} Learning Management System (LMS), you accept and agree to be bound by the
          terms and provision of this agreement.
        </p>
      ),
    },
    {
      id: 'section-license',
      title: '2. Use License',
      body: (
        <>
          <p className="leading-relaxed text-neutral-700">
            Permission is granted to temporarily use the LMS for personal, non-commercial transitory viewing only. This is
            the grant of a license, not a transfer of title, and under this license you may not:
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-neutral-700">
            <li>modify or copy the materials;</li>
            <li>use the materials for any commercial purpose or for any public display;</li>
            <li>attempt to decompile or reverse engineer any software contained on the LMS;</li>
            <li>remove any copyright or other proprietary notations from the materials.</li>
          </ul>
        </>
      ),
    },
    {
      id: 'section-responsibilities',
      title: '3. User Responsibilities',
      body: (
        <>
          <p className="leading-relaxed text-neutral-700">As a user of this LMS, you agree to:</p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-neutral-700">
            <li>Provide accurate and complete information when registering;</li>
            <li>Maintain the confidentiality of your account credentials;</li>
            <li>Use the system in accordance with applicable laws and regulations;</li>
            <li>Respect the intellectual property rights of others;</li>
            <li>Not engage in any activity that disrupts or interferes with the system.</li>
          </ul>
        </>
      ),
    },
    {
      id: 'section-privacy',
      title: '4. Privacy Policy',
      body: (
        <p className="leading-relaxed text-neutral-700">
          Your privacy is important to us. We collect and use personal information only as outlined in our Privacy Policy. We
          are committed to protecting your personal data and ensuring compliance with data protection laws.
        </p>
      ),
    },
    {
      id: 'section-content',
      title: '5. Content and Materials',
      body: (
        <p className="leading-relaxed text-neutral-700">
          The LMS contains materials which are owned by or licensed to <strong className="font-semibold text-neutral-800">{schoolName}</strong>. These materials include, but are not limited to, text, graphics, logos, and software. You may not
          reproduce, distribute, or create derivative works from these materials without prior written consent.
        </p>
      ),
    },
    {
      id: 'section-termination',
      title: '6. Termination',
      body: (
        <p className="leading-relaxed text-neutral-700">
          We may terminate or suspend your access to the LMS immediately, without prior notice or liability, for any reason
          whatsoever, including without limitation if you breach the Terms.
        </p>
      ),
    },
    {
      id: 'section-disclaimer',
      title: '7. Disclaimer',
      body: (
        <p className="leading-relaxed text-neutral-700">
          The materials on the LMS are provided on an &apos;as is&apos; basis. {schoolName} makes no warranties, expressed or
          implied, and hereby disclaims and negates all other warranties including without limitation, implied warranties or
          conditions of merchantability, fitness for a particular purpose, or non-infringement of intellectual property or
          other violation of rights.
        </p>
      ),
    },
    {
      id: 'section-limitations',
      title: '8. Limitations',
      body: (
        <p className="leading-relaxed text-neutral-700">
          In no event shall {schoolName} or its suppliers be liable for any damages (including, without limitation, damages for
          loss of data or profit, or due to business interruption) arising out of the use or inability to use the LMS, even if{' '}
          {schoolName} or a {schoolName} authorized representative has been notified orally or in writing of the possibility
          of such damage.
        </p>
      ),
    },
    {
      id: 'section-revisions',
      title: '9. Revisions',
      body: (
        <p className="leading-relaxed text-neutral-700">
          The materials appearing on the LMS could include technical, typographical, or photographic errors. {schoolName}{' '}
          does not warrant that any of the materials on its LMS are accurate, complete, or current. {schoolName} may make
          changes to the materials contained on its LMS at any time without notice.
        </p>
      ),
    },
    {
      id: 'section-law',
      title: '10. Governing Law',
      body: (
        <p className="leading-relaxed text-neutral-700">
          These terms and conditions are governed by and construed in accordance with the laws of the Philippines, and you
          irrevocably submit to the exclusive jurisdiction of the courts in that state or location.
        </p>
      ),
    },
  ]

  return (
    <div className="w-full space-y-6">
      {!gateMode ? (
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold text-[#15397a]">Terms and Conditions</h2>
          </div>
          {onBack ? (
            <BackButton onClick={onBack} />
          ) : null}
        </div>
      ) : null}

      {showThanks ? (
        <div
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-900"
          role="status"
        >
          Thank you for agreeing to the Terms and Conditions!
        </div>
      ) : null}

      <div id="terms-document" className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-md">
        <div className="flex items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-5 py-3 md:px-6">
          <FileDocIcon className="h-5 w-5 text-neutral-600" />
          <span className="text-sm font-bold text-neutral-800">Terms and Conditions</span>
        </div>
        <div className="space-y-8 p-5 md:p-8">
          {sections.map(({ id, title, body }) => (
            <section key={id} id={id}>
              <h3 className="text-lg font-bold text-blue-800">{title}</h3>
              <div className="mt-2 text-sm md:text-base">{body}</div>
            </section>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-md">
        <div className="flex items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-5 py-3 md:px-6">
          <AgreementIcon className="h-5 w-5 text-neutral-600" />
          <span className="text-sm font-bold text-neutral-800">Agreement</span>
        </div>
        <div className="p-5 md:p-6">
          <label className="flex cursor-pointer items-start gap-3 text-sm text-neutral-700">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 shrink-0 rounded border-neutral-300 text-green-600 focus:ring-green-500"
              checked={agreed}
              disabled={!!acceptedAt}
              onChange={(e) => {
                if (acceptedAt) return
                setAgreed(e.target.checked)
              }}
            />
            <span className="leading-relaxed">
              I have read and agree to the{' '}
              <button
                type="button"
                className="font-semibold text-blue-600 underline-offset-2 hover:underline"
                onClick={() => scrollToId('terms-document')}
              >
                Terms and Conditions
              </button>{' '}
              and{' '}
              <button
                type="button"
                className="font-semibold text-blue-600 underline-offset-2 hover:underline"
                onClick={() => scrollToId('section-privacy')}
              >
                Privacy Policy
              </button>
              .
            </span>
          </label>
          <div className="mt-5 flex justify-end">
            {acceptedAt ? (
              <p className="text-sm font-medium text-neutral-600">
                Accepted on{' '}
                {new Date(acceptedAt).toLocaleString(undefined, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </p>
            ) : (
              <button
                type="button"
                disabled={!agreed}
                onClick={handleAgree}
                className="rounded-lg bg-green-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                I Agree
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
