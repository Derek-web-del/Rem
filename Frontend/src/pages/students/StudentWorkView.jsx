import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AuthenticatedPdfFrame from '../../components/AuthenticatedPdfFrame.jsx'
import OfflineCacheIndicator from '../../components/OfflineCacheIndicator.jsx'
import {
  downloadStudentWorkPrompt,
  fetchStudentWorkDetail,
  formatWorkDate,
  formatWorkDateTime,
  resolveStudentWorkPromptApiUrl,
  STUDENT_SUBMISSION_TYPE_MSG,
  submitStudentWorkFile,
  validateStudentSubmissionFileType,
  workBadgeClasses,
} from '../../lib/studentWork.js'
import { isGradedStatusTone } from '../../lib/gradeStatus.js'
import { useOfflineStatus } from '../../hooks/useOfflineStatus.js'
import StudentMainHeader from './StudentMainHeader.jsx'
import StudentViewHeader from './StudentViewHeader.jsx'

function InfoRow({ label, children, last = false }) {
  return (
    <div
      className={`flex items-start gap-4 py-1.5 ${last ? '' : 'border-b border-neutral-100'}`}
    >
      <span className="w-32 shrink-0 text-xs text-neutral-500 sm:w-36 sm:text-[13px]">{label}</span>
      <div className="min-w-0 flex-1 text-[13px] leading-snug text-neutral-900 sm:text-sm">{children}</div>
    </div>
  )
}

export default function StudentWorkView({ config }) {
  const id = config.itemId
  const { isOffline } = useOfflineStatus()
  const fileInputRef = useRef(null)

  const [item, setItem] = useState(null)
  const [submission, setSubmission] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [fileError, setFileError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitSuccess, setSubmitSuccess] = useState('')
  const [previewOpen, setPreviewOpen] = useState(true)
  const [fromCache, setFromCache] = useState(false)

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!id) {
      setLoadError('Invalid item id.')
      if (!silent) setLoading(false)
      return
    }
    if (!silent) {
      setLoading(true)
      setLoadError('')
    }
    try {
      const data = await fetchStudentWorkDetail(config.kind, id)
      if (!data?.item) {
        if (!silent) {
          setItem(null)
          setSubmission(null)
        }
        setLoadError('Failed to load. Please go back.')
        return
      }
      setItem(data.item)
      setSubmission(data.submission)
      setFromCache(Boolean(data.fromCache))
      if (silent) setLoadError('')
    } catch (e) {
      console.error(`[StudentWorkView:${config.kind}]`, e)
      if (!silent) {
        setItem(null)
        setSubmission(null)
      }
      setLoadError(String(e?.message || 'Failed to load. Please go back.'))
    } finally {
      if (!silent) setLoading(false)
    }
  }, [id, config.kind])

  useEffect(() => {
    void load()
  }, [load])

  const previewUrl = useMemo(() => {
    if (!item?.file_path || !id) return ''
    return resolveStudentWorkPromptApiUrl(config.kind, id)
  }, [item, id, config.kind])

  const hasSubmission = Boolean(submission?.submitted_at || submission?.file_path || item?.has_submission_file)
  const submissionOpen = item?.submission_open !== false
  const expectsSubmission = Boolean(item?.submission_deadline)
  const totalScore = item?.total_score ?? 100
  const scoreDisplay =
    item?.score != null && isGradedStatusTone(item?.status_tone)
      ? `${item.score}/${totalScore}`
      : item?.status_tone === 'pending'
        ? 'Pending'
        : item?.status ?? '—'

  function handleFileChange(e) {
    const file = e.target.files?.[0] ?? null
    setFileError('')
    setSubmitError('')
    setSubmitSuccess('')
    if (!file) {
      setSelectedFile(null)
      return
    }
    const typeErr = validateStudentSubmissionFileType(file)
    if (typeErr) {
      setSelectedFile(null)
      setFileError(STUDENT_SUBMISSION_TYPE_MSG)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    setSelectedFile(file)
  }

  async function handleSubmit() {
    if (!selectedFile || !submissionOpen) return
    const typeErr = validateStudentSubmissionFileType(selectedFile)
    if (typeErr) {
      setFileError(STUDENT_SUBMISSION_TYPE_MSG)
      return
    }
    const wasResubmission = hasSubmission
    setSubmitting(true)
    setSubmitError('')
    setSubmitSuccess('')
    try {
      const saved = await submitStudentWorkFile(config.kind, id, selectedFile)
      setSubmission(saved)
      setSubmitSuccess(wasResubmission ? 'File resubmitted successfully.' : 'File submitted successfully.')
      setSelectedFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      await load({ silent: true })
    } catch (e) {
      setSubmitError(String(e?.message || 'Failed to submit file.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <StudentMainHeader pageTitle={config.navTitle} />
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-8">
        <div className="space-y-6">
          {loading ? (
            <>
              <StudentViewHeader title={config.viewHeader} backTo={config.listPath} />
              <p className="text-sm text-neutral-500">Loading…</p>
            </>
          ) : loadError ? (
            <>
              <StudentViewHeader title={config.viewHeader} backTo={config.listPath} />
              <p className="text-sm text-red-600">{loadError}</p>
            </>
          ) : !item ? (
            <>
              <StudentViewHeader title={config.viewHeader} backTo={config.listPath} />
              <p className="text-sm text-neutral-600">{config.navTitle.slice(0, -1)} not found.</p>
            </>
          ) : (
            <>
              <StudentViewHeader title={config.viewHeader} backTo={config.listPath} />
              <OfflineCacheIndicator fromCache={fromCache} className="mb-2" />

              <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3 shadow-sm sm:px-5">
                <InfoRow label="Subject">{item.subject || item.subject_name || '—'}</InfoRow>
                <InfoRow label="Upload Date">{formatWorkDate(item.upload_date)}</InfoRow>
                <InfoRow label="Submission Date">
                  <span className="inline-flex flex-wrap items-center gap-2">
                    {formatWorkDate(item.submission_deadline)}
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none ${workBadgeClasses(item.submission_badge_tone)}`}
                    >
                      {item.submission_badge}
                    </span>
                  </span>
                </InfoRow>
                <InfoRow label="Total">{totalScore}</InfoRow>
                <InfoRow label="Score">{scoreDisplay}</InfoRow>
                <InfoRow label="Description" last>
                  <span className="whitespace-pre-wrap">{item.description || '—'}</span>
                </InfoRow>
              </div>

              <section className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold uppercase tracking-wide text-neutral-700">{config.previewLabel}</h3>
                  {previewUrl ? (
                    <button
                      type="button"
                      onClick={() => setPreviewOpen((open) => !open)}
                      className="text-xs font-semibold text-neutral-600 hover:text-neutral-900"
                    >
                      {previewOpen ? '▲ Hide Preview' : '▼ Show Preview'}
                    </button>
                  ) : null}
                </div>
                {previewUrl ? (
                  <div className="overflow-hidden rounded-md border border-[#e0e0e0] bg-white">
                    <div className="flex items-center justify-between border-b border-neutral-100 bg-neutral-50 px-3 py-2 text-sm font-medium text-neutral-700">
                      <span className="truncate">{item.file_name || 'Document'}</span>
                      <button
                        type="button"
                        onClick={() =>
                          void downloadStudentWorkPrompt(config.kind, id, item.file_name).catch(console.error)
                        }
                        className="ml-2 shrink-0 text-xs font-semibold text-emerald-700 hover:underline"
                      >
                        Download
                      </button>
                    </div>
                    <div
                      className="overflow-hidden transition-[height] duration-200"
                      style={{ height: previewOpen ? '400px' : '0px', maxHeight: previewOpen ? '400px' : '0px' }}
                    >
                      <div className="relative h-[400px] w-full overflow-hidden bg-neutral-100">
                        {previewOpen ? (
                          <AuthenticatedPdfFrame
                            fileUrl={previewUrl}
                            title={config.previewLabel}
                            className="absolute inset-0 h-full w-full border-0"
                            emptyClassName="absolute inset-0 flex h-full w-full items-center justify-center bg-neutral-100 text-sm text-neutral-500"
                            emptyMessage="Preview unavailable"
                          />
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-neutral-500">No file attached.</p>
                )}
              </section>

              {expectsSubmission ? (
                <section
                  className={`rounded-xl border border-neutral-200 bg-white p-6 shadow-md ${
                    !submissionOpen ? 'opacity-60' : ''
                  }`}
                >
                  <h3 className="text-sm font-bold uppercase tracking-wide text-neutral-700">Submit Your Work</h3>

                  {hasSubmission && submission?.submitted_at ? (
                    <p className="mt-2 text-sm text-neutral-600">
                      You submitted a file on {formatWorkDateTime(submission.submitted_at)}
                    </p>
                  ) : null}

                  {!submissionOpen ? (
                    <p className="mt-3 text-sm font-medium text-neutral-500">Submission period has ended.</p>
                  ) : (
                    <>
                      <div className="mt-4 flex flex-wrap items-center gap-3">
                        <input
                          ref={fileInputRef}
                          id={`work-file-${config.kind}-${id}`}
                          type="file"
                          accept=".pdf"
                          disabled={!submissionOpen || isOffline}
                          onChange={handleFileChange}
                          className="hidden"
                        />
                        <label
                          htmlFor={`work-file-${config.kind}-${id}`}
                          className="cursor-pointer rounded-md border border-neutral-300 bg-neutral-50 px-4 py-2 text-sm font-semibold text-neutral-800 hover:bg-neutral-100"
                        >
                          Choose File
                        </label>
                        <span className="text-sm text-neutral-500">
                          {selectedFile ? selectedFile.name : 'No file chosen'}
                        </span>
                      </div>
                      <p className="text-xs text-neutral-500">Accepted format: PDF only</p>
                      {fileError ? <p className="mt-2 text-sm text-red-600">{fileError}</p> : null}
                      {submitError ? <p className="mt-2 text-sm text-red-600">{submitError}</p> : null}
                      {submitSuccess ? <p className="mt-2 text-sm text-emerald-700">{submitSuccess}</p> : null}
                      <button
                        type="button"
                        disabled={!selectedFile || submitting || !submissionOpen || isOffline}
                        title={isOffline ? 'Not available offline' : undefined}
                        onClick={() => void handleSubmit()}
                        className="mt-4 rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {submitting ? 'Submitting…' : hasSubmission ? 'Resubmit File' : 'Submit File'}
                      </button>
                    </>
                  )}
                </section>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
