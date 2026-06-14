import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import {
  fetchPlagiarismReport,
  formatAiProviderLabel,
  formatProcessingTime,
  formatReportTimeDetail,
  getRiskLevel,
  inputTypeLabel,
  riskBadgeStyle,
  sentenceText,
  webSourceScoreClass,
} from '../../lib/originalityChecker.js'
import { FACULTY_MSG, FACULTY_TOAST_ID, FACULTY_ANNOUNCEMENT_TOAST_MS, useFacultyNotify } from '../../lib/facultyNotify.js'
import TeacherMainHeader from './TeacherMainHeader.jsx'
import TeacherBackButton from './TeacherBackButton.jsx'
import { ACTION_BLUE } from './instituteChrome.js'
import { escapeHtml, sanitizeHtml } from '../../lib/sanitizeHtml.js'

function MetricCard({ value, label, valueClass = 'text-neutral-900', valueStyle, icon }) {
  return (
    <div className="flex h-full flex-col justify-center rounded-xl border border-neutral-200 bg-white p-4 text-center shadow-sm md:p-5">
      {icon ? (
        <div className="flex justify-center" style={{ color: ACTION_BLUE }}>
          {icon}
        </div>
      ) : (
        <p className={`text-2xl font-bold tabular-nums md:text-3xl ${valueClass}`} style={valueStyle}>
          {value}
        </p>
      )}
      <p className="mt-1 text-sm font-medium text-neutral-600">{label}</p>
    </div>
  )
}

function InterpretationRow({ range, tone, title, body }) {
  const style = riskBadgeStyle(tone)
  return (
    <div className="border-b border-neutral-100 py-2.5 last:border-0 md:py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
          style={{ background: style.bg, color: style.color }}
        >
          {range}
        </span>
        <span className="text-sm font-semibold text-neutral-800">{title}</span>
      </div>
      <p className="mt-1 text-sm text-neutral-500">{body}</p>
    </div>
  )
}

function ReportPageHeading({ dateLine, onNewAnalysis }) {
  return (
    <div className="mb-3 w-full shrink-0 text-left">
      <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">VIEW</p>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-neutral-900 md:text-2xl">AI Plagiarism Report</h2>
          {dateLine ? (
            <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-neutral-500">
              <i className="ti ti-calendar" aria-hidden="true" />
              {dateLine}
            </p>
          ) : null}
        </div>
        {onNewAnalysis ? (
          <button
            type="button"
            onClick={onNewAnalysis}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:brightness-110"
            style={{ backgroundColor: ACTION_BLUE }}
          >
            <i className="ti ti-plus" aria-hidden="true" />
            New Analysis
          </button>
        ) : null}
      </div>
    </div>
  )
}

export default function TeacherOriginalityReportView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { logoutToPortal, setSidebarNavLocked } = useOutletContext() || {}
  const toast = useFacultyNotify()
  const toastRef = useRef(toast)
  toastRef.current = toast

  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setSidebarNavLocked?.(false)
  }, [setSidebarNavLocked])

  const loadReport = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const row = await fetchPlagiarismReport(id)
      setReport(row)
    } catch (e) {
      setReport(null)
      console.error('[TeacherOriginalityReportView]', e)
      toastRef.current.error(FACULTY_MSG.originality.loadFailed, {
        toastId: FACULTY_TOAST_ID.originalityFetchError,
        durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,
      })
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void loadReport()
  }, [loadReport])

  if (loading) {
    return (
      <>
        <TeacherMainHeader pageTitle="AI-Checker" onLogout={logoutToPortal} />
        <main className="flex min-h-0 flex-1 flex-col overflow-auto p-4 md:p-6">
          <TeacherBackButton to="/teacher/originality-checker" className="mb-2 block w-fit text-left" />
          <ReportPageHeading />
          <p className="text-sm text-neutral-500">Loading report…</p>
        </main>
      </>
    )
  }

  if (!report) {
    return (
      <>
        <TeacherMainHeader pageTitle="AI-Checker" onLogout={logoutToPortal} />
        <main className="flex min-h-0 flex-1 flex-col overflow-auto p-4 md:p-6">
          <TeacherBackButton to="/teacher/originality-checker" className="mb-2 block w-fit text-left" />
          <ReportPageHeading />
          <p className="text-sm text-neutral-600">Report not found.</p>
        </main>
      </>
    )
  }

  const risk = getRiskLevel(report.similarityScore)
  const flaggedCount = report.flaggedSentences?.length || 0
  const hasPlagiarism = report.similarityScore > 30 && flaggedCount > 0
  const sortedWebSources = [...(report.webSources || [])].sort(
    (a, b) => (b.similarity_score ?? b.similarityScore ?? 0) - (a.similarity_score ?? a.similarityScore ?? 0),
  )
  const scoreColor =
    risk.tone === 'green' ? 'text-emerald-600' : risk.tone === 'yellow' ? 'text-amber-600' : 'text-red-600'
  const riskColor =
    risk.tone === 'green' ? 'text-sky-600' : risk.tone === 'yellow' ? 'text-amber-600' : 'text-red-600'

  function highlightContent(content, flagged) {
    const sentences = (flagged || []).map(sentenceText).filter(Boolean)
    if (!sentences.length) return escapeHtml(content)
    let html = escapeHtml(String(content || ''))
    sentences.forEach((sentence) => {
      const escaped = escapeHtml(sentence)
      if (!escaped) return
      html = html.split(escaped).join(
        `<mark class="rounded bg-red-100 px-0.5 text-red-900">${escaped}</mark>`,
      )
    })
    return sanitizeHtml(html)
  }

  return (
    <>
      <TeacherMainHeader pageTitle="AI-Checker" onLogout={logoutToPortal} />
      <main className="flex min-h-0 flex-1 flex-col overflow-auto p-4 md:p-6 print:bg-white">
        <TeacherBackButton to="/teacher/originality-checker" className="mb-2 block w-fit text-left" />
        <ReportPageHeading
          dateLine={formatReportTimeDetail(report.createdAt)}
          onNewAnalysis={() => navigate('/teacher/originality-checker')}
        />

        <div className="flex min-h-0 flex-1 flex-col gap-3 md:gap-4">
          <div className="grid w-full grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
            <MetricCard
              value={`${Number(report.similarityScore).toFixed(1)}%`}
              label="Similarity Score"
              valueClass={scoreColor}
            />
            <MetricCard value={risk.short} label="Risk Level" valueClass={riskColor} />
            <MetricCard
              value={String(flaggedCount)}
              label="Flagged Sentences"
              valueStyle={{ color: ACTION_BLUE }}
            />
            <MetricCard
              label={inputTypeLabel(report.inputType)}
              icon={
                <i
                  className={`ti ${report.inputType === 'file' ? 'ti-file-upload' : 'ti-forms'} text-3xl`}
                  aria-hidden="true"
                />
              }
            />
          </div>

          <section className="w-full rounded-xl border border-neutral-200 bg-white p-4 shadow-sm md:p-5">
            <h3 className="inline-flex items-center gap-2 text-base font-bold text-neutral-900">
              <i className="ti ti-file-text" style={{ color: ACTION_BLUE }} aria-hidden="true" />
              Original Content
            </h3>
            <div
              className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm leading-relaxed text-neutral-800"
              dangerouslySetInnerHTML={
                hasPlagiarism
                  ? { __html: sanitizeHtml(highlightContent(report.content, report.flaggedSentences)) }
                  : undefined
              }
            >
              {!hasPlagiarism ? report.content : null}
            </div>
            <p className="mt-2 inline-flex items-center gap-1 text-xs text-neutral-500">
              <i className="ti ti-text-size" aria-hidden="true" />
              {String(report.content || '').length} characters
            </p>
          </section>

          <section
            className={`w-full rounded-xl border p-6 text-center shadow-sm md:p-8 ${
              hasPlagiarism ? 'border-red-200 bg-red-50' : 'border-emerald-200 bg-emerald-50'
            }`}
          >
            {hasPlagiarism ? (
              <>
                <i className="ti ti-alert-triangle text-5xl text-red-500" aria-hidden="true" />
                <h3 className="mt-3 text-xl font-bold text-red-700">Plagiarism Detected</h3>
                <p className="mt-2 text-sm text-red-600">
                  {flaggedCount} sentence{flaggedCount === 1 ? '' : 's'} flagged as potentially plagiarized content.
                </p>
                {report.flaggedSentences?.length ? (
                  <ul className="mx-auto mt-4 w-full space-y-2 text-left text-sm text-red-800">
                    {report.flaggedSentences.map((item) => {
                      const text = sentenceText(item)
                      const key = `${text}-${item?.source_url || ''}`
                      return (
                        <li key={key} className="rounded-lg bg-white/70 px-3 py-2">
                          <p>{text}</p>
                          {item?.source_url ? (
                            <a
                              href={item.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-1 inline-flex items-center gap-1 text-xs text-red-700 underline"
                            >
                              {item.source_title || item.source_url}
                            </a>
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                ) : null}
              </>
            ) : (
              <>
                <i className="ti ti-circle-check text-5xl text-emerald-500" aria-hidden="true" />
                <h3 className="mt-3 text-xl font-bold text-emerald-700">No Plagiarism Detected</h3>
                <p className="mt-2 text-sm text-emerald-600">
                  Great! No sentences were flagged as potentially plagiarized content.
                </p>
              </>
            )}
          </section>

          {sortedWebSources.length > 0 ? (
            <section className="w-full rounded-xl border border-neutral-200 bg-white p-4 shadow-sm md:p-5">
              <h3 className="inline-flex items-center gap-2 text-base font-bold text-neutral-900">
                <i className="ti ti-world" style={{ color: ACTION_BLUE }} aria-hidden="true" />
                Web Sources Detected
              </h3>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead className="border-b border-neutral-200 bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-neutral-600">
                    <tr>
                      <th className="w-12 px-3 py-2.5">#</th>
                      <th className="px-3 py-2.5">Source</th>
                      <th className="w-28 px-3 py-2.5 text-right">Similarity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedWebSources.map((source, index) => {
                      const score = Number(source.similarity_score ?? source.similarityScore ?? 0)
                      return (
                        <tr key={source.url || index} className="border-b border-neutral-100 last:border-0">
                          <td className="px-3 py-2.5 tabular-nums text-neutral-600">{index + 1}</td>
                          <td className="px-3 py-2.5">
                            <a
                              href={source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium text-sky-700 hover:underline"
                            >
                              {source.title || source.url}
                            </a>
                          </td>
                          <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${webSourceScoreClass(score)}`}>
                            {score.toFixed(1)}%
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          <div className="grid w-full grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
            <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm md:p-5">
              <h3 className="inline-flex items-center gap-2 text-base font-bold text-neutral-900">
                <i className="ti ti-list-details" style={{ color: ACTION_BLUE }} aria-hidden="true" />
                Analysis Details
              </h3>
              <dl className="mt-3 divide-y divide-neutral-100 text-sm md:mt-4">
                {[
                  ['Analysis Method', report.analysisMethod || 'TF-IDF + Cosine Similarity'],
                  ['AI Provider', formatAiProviderLabel(report.aiProvider)],
                  ...(report.lexicalScore != null
                    ? [['Lexical Score', `${Number(report.lexicalScore).toFixed(1)}%`]]
                    : []),
                  ...(report.semanticScore != null
                    ? [['Semantic Score', `${Number(report.semanticScore).toFixed(1)}%`]]
                    : []),
                  ['Sources Checked', `${report.sourcesChecked ?? 0} web sources`],
                  ['Processing Time', formatProcessingTime(report.processingTimeMs)],
                  ['Report ID', `#${report.id}`],
                ].map(([key, val]) => (
                  <div key={key} className="flex justify-between gap-4 py-2.5 md:py-3">
                    <dt className="font-medium text-neutral-500">{key}</dt>
                    <dd className="text-right font-semibold text-neutral-900">{val}</dd>
                  </div>
                ))}
              </dl>
              {report.semanticScore != null ? (
                <p className="mt-3 text-xs leading-relaxed text-neutral-500">
                  Semantic score uses transformer embeddings on the server. Web search only supplies reference pages
                  to compare against.
                </p>
              ) : null}
            </section>

            <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm md:p-5">
              <h3 className="inline-flex items-center gap-2 text-base font-bold text-neutral-900">
                <i className="ti ti-book" style={{ color: ACTION_BLUE }} aria-hidden="true" />
                Interpretation Guide
              </h3>
              <div className="mt-2">
                <InterpretationRow
                  range="0–30%"
                  tone="green"
                  title="Low Risk"
                  body="Minimal similarity detected. Content appears original."
                />
                <InterpretationRow
                  range="31–70%"
                  tone="yellow"
                  title="Medium Risk"
                  body="Moderate similarity. Review flagged sections."
                />
                <InterpretationRow
                  range="71–100%"
                  tone="red"
                  title="High Risk"
                  body="High similarity detected. Requires immediate attention."
                />
              </div>
            </section>
          </div>
        </div>
      </main>
    </>
  )
}
