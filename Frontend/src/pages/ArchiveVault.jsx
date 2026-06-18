import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BackButton from '../components/BackButton.jsx'
import ArchivedStudentDetail from '../components/ArchivedStudentDetail.jsx'
import ArchivedFacultyDetail from '../components/ArchivedFacultyDetail.jsx'
import { useNotify } from '../components/notifications.jsx'
import { apiUrl } from '../lib/lmsStateStorage.js'

const ACTION_BLUE = '#1e4fa3'
const RETENTION_DAYS = 365
const PURGE_VERIFICATION_PHRASE = 'PERMANENTLY PURGE DATA'
const MASKED_LABEL = 'HIDDEN/ARCHIVED'

function daysSinceArchived(archivedAt) {
  const archived = new Date(archivedAt)
  if (Number.isNaN(archived.getTime())) return 0
  return Math.floor((Date.now() - archived.getTime()) / (1000 * 60 * 60 * 24))
}

function daysUntilDeletion(row) {
  if (row?.days_until_deletion != null) return Number(row.days_until_deletion)
  const archivedAt = row?.archived_at ?? row?.archivedAt
  return Math.max(0, RETENTION_DAYS - daysSinceArchived(archivedAt))
}

function retentionBadgeClass(warningLevel, daysLeft) {
  if (daysLeft <= 0) return 'bg-red-100 text-red-800 ring-1 ring-red-300'
  if (warningLevel === 'red' || daysLeft === 1) return 'bg-red-50 text-red-700 ring-1 ring-red-200'
  if (warningLevel === 'amber' || daysLeft <= 7) return 'bg-amber-50 text-amber-800 ring-1 ring-amber-200'
  return 'bg-neutral-50 text-neutral-700 ring-1 ring-neutral-200'
}

function RetentionBadge({ row }) {
  const daysLeft = daysUntilDeletion(row)
  const warningLevel = row?.warning_level || 'normal'
  if (daysLeft <= 0) {
    return (
      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${retentionBadgeClass(warningLevel, daysLeft)}`}>
        Eligible for permanent delete
      </span>
    )
  }
  const label =
    daysLeft === 1
      ? 'Auto-deletes in 1 day'
      : `Auto-deletes in ${daysLeft} days`
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${retentionBadgeClass(warningLevel, daysLeft)}`}>
      {label}
    </span>
  )
}

function formatArchivedAt(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function initials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  const first = parts[0]?.[0] ?? '?'
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return String(first + last).toUpperCase()
}

function vaultDisplayName(row) {
  if (row.name) return String(row.name).trim()
  const first = String(row.first_name || '').trim()
  const middle = String(row.middle_name || '').trim()
  const last = String(row.last_name || '').trim()
  return [first, middle, last].filter(Boolean).join(' ').trim() || '—'
}

/** Client-side mask: only the name column may show real values in the vault. */
function maskVaultField() {
  return MASKED_LABEL
}

function VaultAvatar({ name }) {
  return (
    <div
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-300 text-xs font-bold text-neutral-600 ring-1 ring-neutral-400"
      aria-hidden
      title="Photo hidden in archive vault"
    >
      {initials(name)}
    </div>
  )
}

function MaskedCell({ children }) {
  return (
    <span className="select-none font-mono text-xs tracking-wide text-neutral-400" aria-label="Field hidden">
      {children}
    </span>
  )
}

export default function ArchiveVault() {
  const navigate = useNavigate()
  const toast = useNotify()
  const [activeTab, setActiveTab] = useState('students')
  const [archivedStudents, setArchivedStudents] = useState([])
  const [archivedFaculties, setArchivedFaculties] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [restoreTarget, setRestoreTarget] = useState(null)
  const [restoreSubmitting, setRestoreSubmitting] = useState(false)
  const [purgeTarget, setPurgeTarget] = useState(null)
  const [purgePhrase, setPurgePhrase] = useState('')
  const [purgeSubmitting, setPurgeSubmitting] = useState(false)
  const [actionId, setActionId] = useState('')
  const [selectedRecord, setSelectedRecord] = useState(null)
  const [recordType, setRecordType] = useState('')
  const [showArchivedDetail, setShowArchivedDetail] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState('')

  const loadVault = useCallback(async (type) => {
    const res = await fetch(apiUrl(`/api/v1/admin/archive-vault/${encodeURIComponent(type)}`), {
      credentials: 'include',
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(String(data?.message || data?.error || `Archive vault failed (${res.status}).`))
    }
    return Array.isArray(data.records) ? data.records : []
  }, [])

  const loadAll = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const [students, faculties] = await Promise.all([loadVault('students'), loadVault('faculties')])
      setArchivedStudents(students)
      setArchivedFaculties(faculties)
    } catch (e) {
      setLoadError(String(e?.message || e || 'Could not load archived records.'))
      setArchivedStudents([])
      setArchivedFaculties([])
    } finally {
      setLoading(false)
    }
  }, [loadVault])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const handleViewArchived = useCallback(async (record, type) => {
    const id = String(record?.id ?? '').trim()
    if (!id) return
    const vaultType = type === 'students' ? 'students' : 'faculties'
    setDetailLoading(true)
    setDetailError('')
    setSelectedRecord(null)
    setRecordType(vaultType)
    setShowArchivedDetail(true)
    try {
      const path =
        vaultType === 'students'
          ? `/api/v1/admin/archived-student/${encodeURIComponent(id)}/work`
          : `/api/v1/admin/archived-faculty/${encodeURIComponent(id)}/work`
      const res = await fetch(apiUrl(path), { credentials: 'include' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(String(data?.message || data?.error || `Could not load record (${res.status}).`))
      }
      setSelectedRecord(data)
    } catch (e) {
      setDetailError(String(e?.message || e || 'Could not load archived record.'))
    } finally {
      setDetailLoading(false)
    }
  }, [])

  const closeArchivedDetail = useCallback(() => {
    setShowArchivedDetail(false)
    setSelectedRecord(null)
    setRecordType('')
    setDetailError('')
  }, [])

  const purgeUnlocked = useMemo(
    () => purgePhrase.trim() === PURGE_VERIFICATION_PHRASE,
    [purgePhrase],
  )

  async function executeRestore(type, id) {
    const key = `${type}:${id}`
    setActionId(key)
    try {
      const res = await fetch(
        apiUrl(`/api/v1/admin/restore/${encodeURIComponent(type)}/${encodeURIComponent(String(id))}`),
        { method: 'POST', credentials: 'include' },
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(String(data?.message || data?.error || `Restore failed (${res.status}).`), {
          title: 'Restore failed',
        })
        return false
      }
      if (type === 'students') {
        setArchivedStudents((prev) => prev.filter((r) => String(r.id) !== String(id)))
      } else {
        setArchivedFaculties((prev) => prev.filter((r) => String(r.id) !== String(id)))
      }
      toast.updated('Account restored. Full details are visible again in active rosters.', {
        title: 'Restored',
        durationMs: 5000,
      })
      return true
    } catch (e) {
      toast.error(String(e?.message || e || 'Network error during restore.'), { title: 'Restore failed' })
      return false
    } finally {
      setActionId('')
    }
  }

  async function confirmRestore() {
    if (!restoreTarget) return
    setRestoreSubmitting(true)
    const ok = await executeRestore(restoreTarget.type, restoreTarget.id)
    setRestoreSubmitting(false)
    if (ok) setRestoreTarget(null)
  }

  async function handlePermanentPurge() {
    if (!purgeTarget || !purgeUnlocked) return
    setPurgeSubmitting(true)
    const { type, id } = purgeTarget
    try {
      const res = await fetch(
        apiUrl(
          `/api/v1/admin/permanent-purge/${encodeURIComponent(type)}/${encodeURIComponent(String(id))}`,
        ),
        { method: 'DELETE', credentials: 'include' },
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(String(data?.message || data?.error || `Purge failed (${res.status}).`), {
          title: res.status === 403 ? 'Retention gate' : 'Purge failed',
        })
        return
      }
      if (type === 'students') {
        setArchivedStudents((prev) => prev.filter((r) => String(r.id) !== String(id)))
      } else {
        setArchivedFaculties((prev) => prev.filter((r) => String(r.id) !== String(id)))
      }
      setPurgeTarget(null)
      setPurgePhrase('')
      const name = String(purgeTarget.name || 'Account').trim()
      const label = purgeTarget.type === 'faculties' ? 'Faculty' : 'Student'
      toast.deleted(`${label} ${name} account deleted.`, { durationMs: 6000 })
    } catch (e) {
      toast.error(String(e?.message || e || 'Network error during purge.'), { title: 'Purge failed' })
    } finally {
      setPurgeSubmitting(false)
    }
  }

  function renderActionButtons(type, row) {
    const id = row.id
    const archivedAt = row.archived_at ?? row.archivedAt
    const daysLeft = daysUntilDeletion(row)
    const purgeEligible = row?.purge_eligible === true || daysLeft <= 0
    const key = `${type}:${id}`
    const busy = actionId === key
    const displayName = vaultDisplayName(row)

    return (
      <div className="inline-flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          disabled={busy}
          className="rounded border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
          onClick={() => handleViewArchived(row, type)}
        >
          View
        </button>
        <button
          type="button"
          disabled={busy}
          className="rounded px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-60"
          style={{ backgroundColor: ACTION_BLUE }}
          onClick={() => setRestoreTarget({ type, id, name: displayName, daysLeft })}
        >
          Restore
        </button>
        {purgeEligible ? (
          <button
            type="button"
            disabled={busy}
            className="rounded bg-red-600 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white shadow-sm ring-2 ring-red-300 hover:bg-red-700 disabled:opacity-60"
            onClick={() => {
              setPurgePhrase('')
              setPurgeTarget({ type, id, name: displayName })
            }}
          >
            Delete Permanently
          </button>
        ) : null}
      </div>
    )
  }

  const tabClass = (tab) =>
    `rounded-t-lg px-4 py-2.5 text-sm font-semibold transition ${
      activeTab === tab
        ? 'border border-b-0 border-neutral-200 bg-white text-neutral-900 shadow-sm'
        : 'text-neutral-600 hover:bg-white/60'
    }`

  return (
    <div className="space-y-6">
      <div>
        <BackButton onClick={() => navigate(-1)} />
        <h2 className="text-2xl font-bold text-neutral-900 md:text-3xl">Archive Vault</h2>
      </div>

      {loadError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          {loadError}
        </p>
      ) : null}

      <div className="border-b border-neutral-200">
        <div className="flex gap-1">
          <button type="button" className={tabClass('students')} onClick={() => setActiveTab('students')}>
            Archived Students
            {!loading ? (
              <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-bold text-neutral-700">
                {archivedStudents.length}
              </span>
            ) : null}
          </button>
          <button type="button" className={tabClass('faculties')} onClick={() => setActiveTab('faculties')}>
            Archived Faculties
            {!loading ? (
              <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-bold text-neutral-700">
                {archivedFaculties.length}
              </span>
            ) : null}
          </button>
        </div>
      </div>

      <section className="overflow-hidden rounded-xl rounded-tl-none border border-neutral-200 bg-white shadow-md">
        <div className="overflow-x-auto">
          {activeTab === 'students' ? (
            <table className="min-w-full border-collapse text-left">
              <thead className="sticky top-0 bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Enrollment No.</th>
                  <th className="px-4 py-3">Roll No.</th>
                  <th className="px-4 py-3">Section</th>
                  <th className="px-4 py-3">Grade Level</th>
                  <th className="px-4 py-3">Archived Date</th>
                  <th className="px-4 py-3">Retention</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {loading ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-sm text-neutral-500">
                      Loading archived students…
                    </td>
                  </tr>
                ) : archivedStudents.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-4 py-10 text-center text-sm font-medium text-neutral-500">
                      No archived students.
                    </td>
                  </tr>
                ) : (
                  archivedStudents.map((row) => {
                    const archivedAt = row.archived_at ?? row.archivedAt
                    const name = vaultDisplayName(row)
                    return (
                      <tr key={row.id} className="text-sm text-neutral-800">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <VaultAvatar name={name} />
                            <span className="font-semibold text-neutral-900">{name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <MaskedCell>{maskVaultField(row.email)}</MaskedCell>
                        </td>
                        <td className="px-4 py-3">
                          <MaskedCell>{maskVaultField(row.contact_no ?? row.contact_number)}</MaskedCell>
                        </td>
                        <td className="px-4 py-3">
                          <MaskedCell>{maskVaultField(row.enrollment_no)}</MaskedCell>
                        </td>
                        <td className="px-4 py-3">
                          <MaskedCell>{maskVaultField(row.roll_no)}</MaskedCell>
                        </td>
                        <td className="px-4 py-3">
                          <MaskedCell>{maskVaultField(row.section_name)}</MaskedCell>
                        </td>
                        <td className="px-4 py-3">
                          <MaskedCell>{maskVaultField(row.grade_level)}</MaskedCell>
                        </td>
                        <td className="px-4 py-3 font-medium text-neutral-700">{formatArchivedAt(archivedAt)}</td>
                        <td className="px-4 py-3">
                          <RetentionBadge row={row} />
                        </td>
                        <td className="px-4 py-3 text-right">{renderActionButtons('students', row)}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          ) : (
            <table className="min-w-full border-collapse text-left">
              <thead className="sticky top-0 bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Grade Level</th>
                  <th className="px-4 py-3">Sections</th>
                  <th className="px-4 py-3">Archived Date</th>
                  <th className="px-4 py-3">Retention</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-neutral-500">
                      Loading archived faculty…
                    </td>
                  </tr>
                ) : archivedFaculties.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm font-medium text-neutral-500">
                      No archived faculty.
                    </td>
                  </tr>
                ) : (
                  archivedFaculties.map((row) => {
                    const archivedAt = row.archived_at ?? row.archivedAt
                    const name = vaultDisplayName(row)
                    return (
                      <tr key={row.id} className="text-sm text-neutral-800">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <VaultAvatar name={name} />
                            <span className="font-semibold text-neutral-900">{name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <MaskedCell>{maskVaultField(row.email)}</MaskedCell>
                        </td>
                        <td className="px-4 py-3">
                          <MaskedCell>{maskVaultField(row.contact_number ?? row.contactNumber)}</MaskedCell>
                        </td>
                        <td className="px-4 py-3">
                          <MaskedCell>{maskVaultField(row.grade_level ?? row.grade)}</MaskedCell>
                        </td>
                        <td className="px-4 py-3">
                          <MaskedCell>{maskVaultField(row.sectionsLabel)}</MaskedCell>
                        </td>
                        <td className="px-4 py-3 font-medium text-neutral-700">{formatArchivedAt(archivedAt)}</td>
                        <td className="px-4 py-3">
                          <RetentionBadge row={row} />
                        </td>
                        <td className="px-4 py-3 text-right">{renderActionButtons('faculties', row)}</td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {restoreTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-bold text-neutral-900">Restore account</h3>
            <p className="mt-2 text-sm text-neutral-700">
              Restore <span className="font-semibold">{restoreTarget.name}</span> to the active roster? All unmasked
              profile fields (email, phone, enrollment, sections, and related data) will be visible again in Students
              or Faculties.
            </p>
            {restoreTarget.daysLeft != null && restoreTarget.daysLeft <= 7 && restoreTarget.daysLeft > 0 ? (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <span className="font-semibold">Warning:</span> This account will be permanently auto-deleted in{' '}
                {restoreTarget.daysLeft} day{restoreTarget.daysLeft === 1 ? '' : 's'}. Restoring removes it from the
                Archive Vault and cancels pending auto-deletion. If re-archived later, the 365-day timer starts fresh.
              </p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded bg-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700"
                onClick={() => setRestoreTarget(null)}
                disabled={restoreSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={restoreSubmitting}
                className="rounded px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                style={{ backgroundColor: ACTION_BLUE }}
                onClick={confirmRestore}
              >
                {restoreSubmitting ? 'Restoring…' : 'Yes, Restore'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {purgeTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div
            className="w-full max-w-lg rounded-xl border-2 border-red-500 bg-white p-6 shadow-2xl"
            role="alertdialog"
            aria-labelledby="purge-modal-title"
            aria-describedby="purge-modal-desc"
          >
            <h3 id="purge-modal-title" className="text-lg font-bold text-red-700">
              Permanent data purge
            </h3>
            <p id="purge-modal-desc" className="mt-2 text-sm text-neutral-700">
              This action cannot be undone. You are about to permanently delete{' '}
              <span className="font-semibold text-neutral-900">{purgeTarget.name}</span> from the database.
            </p>
            <p className="mt-3 text-sm font-medium text-neutral-800">
              Type <span className="font-mono text-red-700">{PURGE_VERIFICATION_PHRASE}</span> to confirm:
            </p>
            <input
              type="text"
              className="mt-2 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm font-mono uppercase focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-200"
              value={purgePhrase}
              onChange={(e) => setPurgePhrase(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              aria-label="Verification phrase"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="rounded bg-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-800"
                onClick={() => {
                  setPurgeTarget(null)
                  setPurgePhrase('')
                }}
                disabled={purgeSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!purgeUnlocked || purgeSubmitting}
                className="rounded bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                onClick={handlePermanentPurge}
              >
                {purgeSubmitting ? 'Purging…' : 'Permanently purge'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showArchivedDetail ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-8">
          <div className="mb-8 w-full max-w-5xl rounded-xl bg-neutral-50 p-5 shadow-2xl md:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-lg font-bold text-neutral-900">
                Archived {recordType === 'students' ? 'Student' : 'Faculty'} — Work History
              </h3>
              <button
                type="button"
                className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
                onClick={closeArchivedDetail}
              >
                Close
              </button>
            </div>
            {detailLoading ? (
              <p className="py-10 text-center text-sm text-neutral-500">Loading work history…</p>
            ) : detailError ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
                {detailError}
              </p>
            ) : recordType === 'students' && selectedRecord ? (
              <ArchivedStudentDetail data={selectedRecord} />
            ) : recordType === 'faculties' && selectedRecord ? (
              <ArchivedFacultyDetail data={selectedRecord} />
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}


