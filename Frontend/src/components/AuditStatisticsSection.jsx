import { useCallback, useEffect, useState } from 'react'
import { loadAuditStatisticsFromApi } from '../lib/auditStatisticsCore.js'
import { AUDIT_LOGS_REFRESH_EVENT } from '../lib/auditLogRefresh.js'
import SignInsHourlyChart from './SignInsHourlyChart.jsx'

function Card({ title, value, sub }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{title}</div>
      <div className="mt-2 text-2xl font-extrabold text-neutral-900">{value}</div>
      {sub ? <div className="mt-1 text-xs font-medium text-neutral-500">{sub}</div> : null}
    </div>
  )
}

function SimplePieLegend({ title, items }) {
  return (
    <div className="flex h-full min-h-[280px] flex-col rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="shrink-0 text-sm font-bold text-neutral-900">{title}</div>
      <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto">
        {items.length === 0 ? (
          <div className="text-sm font-medium text-neutral-500">No data.</div>
        ) : (
          items.map((it) => (
            <div key={it.key} className="flex items-center justify-between gap-3 text-sm">
              <div className="min-w-0">
                <div className="truncate font-semibold text-neutral-900">{it.label}</div>
                <div className="truncate text-xs font-medium text-neutral-500">{it.key}</div>
              </div>
              <div className="shrink-0 rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-xs font-bold text-neutral-800">
                {it.value}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

const EMPTY_HOUR_DATA = Array.from({ length: 24 }, (_, i) => ({
  label: String(i).padStart(2, '0'),
  value: 0,
}))

const STATS_REFRESH_MS = 30_000

/**
 * @param {{ variant?: 'dashboard' | 'audit-page', enabled?: boolean }} props
 */
export default function AuditStatisticsSection({
  variant = 'dashboard',
  enabled = true,
}) {
  const [statsErr, setStatsErr] = useState('')
  const [statsData, setStatsData] = useState(null)

  const loadStats = useCallback(async (silent = false) => {
    try {
      const data = await loadAuditStatisticsFromApi()
      setStatsData(data)
      setStatsErr('')
    } catch (e) {
      if (!silent) {
        console.error('[AuditStatisticsSection] load failed:', e)
      }
      setStatsErr(String(e?.message || e || 'Could not load statistics.'))
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    loadStats()
    const id = setInterval(() => loadStats(true), STATS_REFRESH_MS)
    const onAuditRefresh = () => loadStats(true)
    window.addEventListener(AUDIT_LOGS_REFRESH_EVENT, onAuditRefresh)
    return () => {
      clearInterval(id)
      window.removeEventListener(AUDIT_LOGS_REFRESH_EVENT, onAuditRefresh)
    }
  }, [enabled, loadStats])

  const showDashboardHeading = variant === 'dashboard'

  const statsHeadingId = showDashboardHeading ? 'dashboard-audit-stats-heading' : 'audit-stats-heading'

  return (
    <section className="space-y-4" aria-labelledby={statsHeadingId}>
      <div className={`border-b border-neutral-200 pb-3 ${showDashboardHeading ? 'border-t border-neutral-200 pt-6' : ''}`}>
        <h3
          id={statsHeadingId}
          className={`font-bold text-neutral-900 ${showDashboardHeading ? 'text-base text-neutral-600' : 'text-lg'}`}
        >
          {showDashboardHeading ? 'Statistics overview' : 'Statistics'}
        </h3>
      </div>

      {statsErr ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{statsErr}</div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card title="Total events today" value={statsData?.totalEventsToday ?? '—'} />
        <Card title="Sign-ins today" value={statsData?.signInsToday ?? '—'} />
        <Card title="Failed sign-ins" value={statsData?.failedSignIns ?? '—'} />
        <Card title="Accounts created (7d)" value={statsData?.accountsCreatedThisWeek ?? '—'} />
        <Card title="Password resets today" value={statsData?.passwordResetsToday ?? '—'} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="h-full lg:col-span-2">
          <SignInsHourlyChart
            title="Sign-ins by hour (today)"
            data={statsData?.signInsByHour || EMPTY_HOUR_DATA}
          />
        </div>
        <div className="h-full lg:col-span-1">
          <SimplePieLegend title="Top event types" items={statsData?.topTypes || []} />
        </div>
      </div>
    </section>
  )
}
