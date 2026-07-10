import { useRef, useState } from 'react'
import AuthenticatedPdfFrame from '../../../components/AuthenticatedPdfFrame.jsx'
import { apiUrl } from '../../../lib/lmsStateStorage.js'
import { FACULTY_MSG, useFacultyNotify } from '../../../lib/facultyNotify.js'

const SYLLABUS_TEMPLATE_URL = '/templates/glendale-subject-syllabus-template.pdf'

export default function SubjectSyllabusCard({ subject, subjectId, onUpdated }) {
  const fileRef = useRef(null)
  const toast = useFacultyNotify()
  const [uploading, setUploading] = useState(false)
  const [localFileName, setLocalFileName] = useState('')

  const sid = String(subjectId || subject?.id || '').trim()
  const syllabusPath = String(subject?.syllabus_url || subject?.syllabus_pdf || '').trim()
  const syllabusFileName = String(subject?.syllabus_file_name || localFileName || 'syllabus.pdf').trim()
  const hasSyllabus = Boolean(syllabusPath)
  const previewPath = hasSyllabus && sid ? `/api/teacher/subjects/${sid}/syllabus-file` : ''

  async function uploadSyllabus(file) {
    if (!file || !sid) return
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Syllabus must be a PDF file.')
      return
    }

    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('subject_name', String(subject?.subject_name || '').trim())
      fd.append('grade_level', String(subject?.grade_level || '').trim())
      fd.append('semester', String(subject?.semester || '').trim())

      const res = await fetch(apiUrl(`/api/teacher/subjects/${encodeURIComponent(sid)}/syllabus`), {
        method: 'PATCH',
        credentials: 'include',
        body: fd,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.message || data?.error || 'Could not upload syllabus.')
      }

      setLocalFileName(file.name)
      toast.success(FACULTY_MSG.studyMaterial?.updated || 'Syllabus uploaded.')
      await onUpdated?.()
    } catch (err) {
      toast.error(String(err?.message || err || 'Could not upload syllabus.'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <aside className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Syllabus (PDF)</p>
          <p className="mt-1 text-xs text-neutral-500">
            {hasSyllabus ? syllabusFileName : 'No syllabus uploaded yet'}
          </p>
        </div>
        <a
          href={SYLLABUS_TEMPLATE_URL}
          download="glendale-subject-syllabus-template.pdf"
          className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-800 hover:bg-blue-100"
        >
          Download Template
        </a>
      </div>

      <div
        className={`mt-3 flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-4 text-center ${
          uploading ? 'border-neutral-200 bg-neutral-100 opacity-70' : 'border-neutral-200 bg-neutral-50 hover:border-sky-300 hover:bg-sky-50/40'
        }`}
        onClick={() => !uploading && fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          if (uploading) return
          void uploadSyllabus(e.dataTransfer.files?.[0])
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click()
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          disabled={uploading}
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            void uploadSyllabus(file)
          }}
        />
        <p className="text-sm font-medium text-neutral-600">
          {uploading ? 'Uploading…' : 'Drag & drop your PDF here or browse'}
        </p>
        {!uploading && hasSyllabus ? (
          <p className="mt-1 text-xs text-neutral-500">Upload a new file to replace the current syllabus</p>
        ) : null}
      </div>

      {previewPath ? (
        <div className="mt-3 h-52 overflow-hidden rounded-lg border border-neutral-200 bg-neutral-100">
          <AuthenticatedPdfFrame
            filePath={previewPath}
            title={syllabusFileName}
            className="h-full w-full"
            emptyClassName="flex h-full items-center justify-center text-xs text-neutral-500"
            emptyMessage="Preview unavailable"
          />
        </div>
      ) : null}
    </aside>
  )
}
