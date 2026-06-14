import { useMemo, useState } from 'react'
import BackButton from './components/BackButton.jsx'
import { useNotify } from './components/notifications.jsx'
import StudentDetailCard from './components/StudentDetailCard.jsx'
import StudentGradesCard from './components/StudentGradesCard.jsx'
import { authClient } from './lib/auth-client.js'

export default function StudentProfile({ student, onBack, onEdit, onSendPasswordResetEmail }) {
  const toast = useNotify()
  const [resetBusy, setResetBusy] = useState(false)
  const [activeTab, setActiveTab] = useState('basic')
  const { data: session } = authClient.useSession()
  const isAdmin = useMemo(() => {
    const role = String(session?.user?.role || '').trim().toLowerCase()
    return role === 'admin'
  }, [session?.user?.role])

  if (!student) {
    return (
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Student</p>
            <h2 className="mt-1 text-3xl font-bold text-neutral-900">Profile</h2>
          </div>
          <BackButton onClick={onBack} />
        </div>
        <StudentDetailCard student={null} />
      </div>
    )
  }

  const isArchived =
    Boolean(student.archivedAt || student.archived_at || student.isArchived || student.is_archived) ||
    student.status === 'archived' ||
    student.status === 'Archived'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">VIEW</p>
          <h2 className="text-xl font-bold text-neutral-900 md:text-2xl">Profile</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onSendPasswordResetEmail ? (
            <button
              type="button"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
              disabled={resetBusy}
              onClick={async () => {
                const email = String(student?.email || '').trim()
                if (!email) {
                  toast.error('No email on record for this student.', { title: 'Reset email' })
                  return
                }
                setResetBusy(true)
                try {
                  const result = await onSendPasswordResetEmail(email)
                  if (result?.error) {
                    toast.error(result.error, { title: 'Reset email' })
                    return
                  }
                  toast.success(`Reset link sent to ${result?.maskedEmail || email}`, { title: 'Reset email' })
                } finally {
                  setResetBusy(false)
                }
              }}
            >
              {resetBusy ? 'Sending…' : 'Send Password Reset Email'}
            </button>
          ) : null}
          <button
            type="button"
            className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 shadow-sm hover:bg-neutral-50"
            onClick={onBack}
          >
            Back
          </button>
        </div>
      </div>

      {isArchived ? (
        <div
          style={{
            background: '#FCEBEB',
            border: '0.5px solid #F09595',
            borderRadius: '8px',
            padding: '10px 16px',
            marginBottom: '16px',
            fontSize: '13px',
            color: '#791F1F',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <i className="ti ti-archive" aria-hidden />
          <span>Archived account — viewing historical record only.</span>
        </div>
      ) : null}

      <StudentDetailCard student={student} showHero showTable={false} showEditButton={!!onEdit} onEdit={onEdit} />

      <div className="flex gap-2 border-b border-neutral-200">
        <button
          type="button"
          onClick={() => setActiveTab('basic')}
          className={`border-b-2 px-4 py-2 text-sm font-semibold ${
            activeTab === 'basic'
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-neutral-500 hover:text-neutral-800'
          }`}
        >
          Basic Details
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('grades')}
          className={`border-b-2 px-4 py-2 text-sm font-semibold ${
            activeTab === 'grades'
              ? 'border-blue-600 text-blue-700'
              : 'border-transparent text-neutral-500 hover:text-neutral-800'
          }`}
        >
          Grades
        </button>
      </div>

      {activeTab === 'basic' ? (
        <StudentDetailCard student={student} showHero={false} showEditButton={!!onEdit} onEdit={onEdit} />
      ) : activeTab === 'grades' ? (
        <StudentGradesCard student={student} readonly isAdmin={isAdmin} />
      ) : null}
    </div>
  )
}
