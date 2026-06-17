import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatStudentDate } from '../../lib/studentPortal.js'
import { isOnline } from '../../lib/offlineSync.js'
import { formatDeadlineDisplay } from '../../lib/studentQuizzes.js'
import {
  downloadStudentWorkPrompt,
  formatWorkDate,
  STUDENT_WORK_PRIMARY,
  workBadgeClasses,
} from '../../lib/studentWork.js'
import OfflineCacheIndicator from '../../components/OfflineCacheIndicator.jsx'
import StudentMainHeader from './StudentMainHeader.jsx'
import StudentViewHeader from './StudentViewHeader.jsx'

const PAGE_SIZE = 10

function SortHeader({ label, active, direction, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-neutral-500 hover:text-neutral-800"
    >
      {label}
      <span className="inline-flex flex-col leading-none text-[9px] text-neutral-400">
        <i className={`ti ti-chevron-up ${active && direction === 'asc' ? 'text-neutral-800' : ''}`} aria-hidden="true" />
        <i className={`ti ti-chevron-down -mt-0.5 ${active && direction === 'desc' ? 'text-neutral-800' : ''}`} aria-hidden="true" />
      </span>
    </button>
  )
}

function StatusBadge({ label, tone }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${workBadgeClasses(tone)}`}>
      {label}
    </span>
  )
}

export default function StudentWorkList({
  config,
  fetchList,
  logoutToPortal,
  backTo = '/student/dashboard',
}) {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [fromCache, setFromCache] = useState(false)
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState('title')
  const [sortDir, setSortDir] = useState('asc')
  const [page, setPage] = useState(1)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const offline = !isOnline()
        const list = await fetchList()
        if (!cancelled) {
          setRows(list)
          setFromCache(offline)
        }
      } catch (e) {
        if (!cancelled) setRows([])
        console.error(`[StudentWorkList:${config.kind}]`, e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [fetchList, config.kind])

  useEffect(() => {
    setPage(1)
  }, [query, sortKey, sortDir])

  const filteredSorted = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = rows.filter((item) => {
      if (!q) return true
      return (
        String(item.title || '').toLowerCase().includes(q) ||
        String(item.subject || '').toLowerCase().includes(q)
      )
    })
    list = [...list].sort((a, b) => {
      let av = ''
      let bv = ''
      switch (sortKey) {
        case 'subject':
          av = String(a.subject || '')
          bv = String(b.subject || '')
          break
        case 'status':
          av = String(a.status || '')
          bv = String(b.status || '')
          break
        case 'upload_date':
          av = new Date(a.upload_date || 0).getTime()
          bv = new Date(b.upload_date || 0).getTime()
          break
        case 'submission_deadline':
          av = new Date(a.submission_deadline || 0).getTime()
          bv = new Date(b.submission_deadline || 0).getTime()
          break
        default:
          av = String(a.title || '')
          bv = String(b.title || '')
      }
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av
      }
      const cmp = String(av).localeCompare(String(bv), undefined, { sensitivity: 'base' })
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [rows, query, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(filteredSorted.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageRows = filteredSorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  function toggleSort(key) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  return (
    <>
      <StudentMainHeader pageTitle={config.navTitle} />
      <main className="min-h-0 flex-1 space-y-6 overflow-y-auto overflow-x-hidden p-4 md:p-8">
        <StudentViewHeader title={config.pageHeader} backTo={backTo} />
        <OfflineCacheIndicator fromCache={fromCache} className="mb-2" />

        <div className="inline-flex rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 shadow-sm">
          {config.tabLabel} [{filteredSorted.length}]
        </div>

        <div className="relative max-w-md">
          <i className="ti ti-search pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" aria-hidden="true" />
          <input
            type="search"
            placeholder={`Search ${config.navTitle.toLowerCase()}…`}
            className="w-full rounded-lg border border-neutral-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50">
                <tr>
                  <th className="px-4 py-3">
                    <SortHeader label="Name" active={sortKey === 'title'} direction={sortDir} onClick={() => toggleSort('title')} />
                  </th>
                  <th className="px-4 py-3">
                    <SortHeader label="Subject" active={sortKey === 'subject'} direction={sortDir} onClick={() => toggleSort('subject')} />
                  </th>
                  <th className="px-4 py-3">
                    <SortHeader label="Status" active={sortKey === 'status'} direction={sortDir} onClick={() => toggleSort('status')} />
                  </th>
                  <th className="px-4 py-3">
                    <SortHeader label="Upload Date" active={sortKey === 'upload_date'} direction={sortDir} onClick={() => toggleSort('upload_date')} />
                  </th>
                  <th className="px-4 py-3">
                    <SortHeader label="Submission Date" active={sortKey === 'submission_deadline'} direction={sortDir} onClick={() => toggleSort('submission_deadline')} />
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-neutral-500">
                      Loading…
                    </td>
                  </tr>
                ) : pageRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-neutral-500">
                      {!isOnline() && rows.length === 0
                        ? 'No offline data yet. Connect to the internet and open the dashboard once to sync.'
                        : `No ${config.navTitle.toLowerCase()} available.`}
                    </td>
                  </tr>
                ) : (
                  pageRows.map((item, idx) => (
                    <tr
                      key={item.id}
                      className={`border-b border-neutral-100 last:border-0 ${idx % 2 === 1 ? 'bg-neutral-50/70' : 'bg-white'}`}
                    >
                      <td className="px-4 py-3 font-semibold uppercase text-neutral-900">{item.title || '—'}</td>
                      <td className="px-4 py-3 text-neutral-700">{item.subject || '—'}</td>
                      <td className="px-4 py-3">
                        <StatusBadge label={item.status} tone={item.status_tone} />
                      </td>
                      <td className="px-4 py-3 text-neutral-700">{formatWorkDate(item.upload_date) || formatStudentDate(item.upload_date)}</td>
                      <td className="px-4 py-3 text-neutral-700">
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{formatDeadlineDisplay(item.submission_deadline) || formatWorkDate(item.submission_deadline)}</span>
                          <StatusBadge label={item.submission_badge} tone={item.submission_badge_tone} />
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => navigate(config.viewPath(item.id))}
                            className="rounded-md px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
                            style={{ background: STUDENT_WORK_PRIMARY }}
                          >
                            View
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void downloadStudentWorkPrompt(config.kind, item.id, item.file_name).catch(console.error)
                            }
                            className="rounded-md border border-emerald-600 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                          >
                            {config.promptDownloadLabel}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-neutral-100 px-4 py-3 text-sm font-medium text-neutral-600">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="disabled:opacity-40 hover:text-neutral-900"
            >
              ← Prev
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setPage(n)}
                  className={`min-w-[2rem] rounded px-2 py-0.5 tabular-nums ${
                    n === safePage ? 'bg-neutral-200 font-bold text-neutral-900' : 'hover:bg-neutral-100'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="disabled:opacity-40 hover:text-neutral-900"
            >
              Next →
            </button>
          </div>
        </div>
      </main>
    </>
  )
}
