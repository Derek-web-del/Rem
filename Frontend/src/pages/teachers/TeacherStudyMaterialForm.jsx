import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useLocation, useSearchParams } from 'react-router-dom'
import { apiUrl } from '../../lib/lmsStateStorage.js'
import { FACULTY_MSG, useFacultyNotify } from '../../lib/facultyNotify.js'
import {
  SUBJECT_MATERIAL_MAX_BYTES,
  SUBJECT_MATERIAL_MAX_MSG,
  DEFAULT_UPLOAD_LABEL,
} from '../../lib/uploadLimits.js'
import TeacherBackButton from './TeacherBackButton.jsx'
import TeacherMainHeader from './TeacherMainHeader.jsx'
import { ACTION_BLUE } from './instituteChrome.js'
import { linkCreatedItemToCurriculum, readCurriculumQuery } from '../../lib/curriculumFormPrefill.js'

const ACCEPT_EDIT = '.pdf,.doc,.docx'
const ACCEPT_ADD = '.pdf'
const DOC_EXT = new Set(['pdf', 'doc', 'docx'])
const PDF_EXT = new Set(['pdf'])

function isAdminSyllabusMaterialId(id) {
  return String(id || '').startsWith('admin-syllabus')
}
const FILE_TYPE_MSG = FACULTY_MSG.studyMaterial.fileType
const FILE_SIZE_MAX_MSG = SUBJECT_MATERIAL_MAX_MSG
const ADD_FILE_TYPE_MSG = 'Only PDF files are allowed.'

function isAllowedDocument(file) {
  if (!file) return false
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  if (DOC_EXT.has(ext)) return true
  const mime = String(file.type || '').toLowerCase()
  return (
    mime === 'application/pdf' ||
    mime === 'application/msword' ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  )
}

function isAllowedAddDocument(file) {
  if (!file) return false
  const ext = file.name.split('.').pop()?.toLowerCase() || ''
  if (PDF_EXT.has(ext)) return true
  return String(file.type || '').toLowerCase() === 'application/pdf'
}

function validateAddFile(file) {
  if (!file) return ''
  if (!isAllowedAddDocument(file)) return ADD_FILE_TYPE_MSG
  if (file.size > SUBJECT_MATERIAL_MAX_BYTES) return FILE_SIZE_MAX_MSG
  return ''
}

function validateEditFile(file) {
  if (!file) return ''
  if (!isAllowedDocument(file)) return FILE_TYPE_MSG
  if (file.size > SUBJECT_MATERIAL_MAX_BYTES) return FILE_SIZE_MAX_MSG
  return ''
}

function TextField({ label, required, value, onChange, disabled, type = 'text', error, className = '' }) {
  return (
    <label className={`block text-sm font-medium text-neutral-700 ${className}`}>
      {label}
      {required ? <span className="text-red-600"> *</span> : null}
      <input
        type={type}
        className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 disabled:bg-neutral-100 ${
          error ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : 'border-neutral-200 focus:border-blue-300 focus:ring-blue-100'
        }`}
        value={value}
        onChange={onChange}
        disabled={disabled}
        required={required}
      />
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </label>
  )
}

function EditStudyMaterialForm({
  subject,
  form,
  setForm,
  fieldErrors,
  setFieldErrors,
  file,
  existingFileName,
  onFilePick,
  fileRef,
  error,
  submitting,
  onSubmit,
}) {
  const subjectLabel = form.subject_name || subject?.subject_name || 'Subject'

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 sm:col-span-2">
          <TextField
            label="Subject Semester"
            required
            value={form.semester}
            error={fieldErrors.semester}
            onChange={(e) => {
              setForm((p) => ({ ...p, semester: e.target.value }))
              setFieldErrors((p) => ({ ...p, semester: '' }))
            }}
          />
        </div>
        <div className="col-span-12 sm:col-span-2">
          <TextField
            label="Unit No."
            required
            value={form.unit_no}
            error={fieldErrors.unit_no}
            onChange={(e) => {
              setForm((p) => ({ ...p, unit_no: e.target.value }))
              setFieldErrors((p) => ({ ...p, unit_no: '' }))
            }}
          />
        </div>
        <div className="col-span-12 sm:col-span-8">
          <TextField
            label="Unit Name"
            required
            value={form.unit_name}
            error={fieldErrors.unit_name}
            onChange={(e) => {
              setForm((p) => ({ ...p, unit_name: e.target.value }))
              setFieldErrors((p) => ({ ...p, unit_name: '' }))
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          label="Subject Name"
          value={form.subject_name}
          onChange={(e) => {
            setForm((p) => ({ ...p, subject_name: e.target.value }))
          }}
        />
        <TextField
          label="Grade Level"
          value={form.grade_level}
          onChange={(e) => {
            setForm((p) => ({ ...p, grade_level: e.target.value }))
          }}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        <div>
          <p className="text-sm font-semibold text-neutral-900">
            Study Material File ({subjectLabel})
          </p>
          <p className="mt-2 text-sm text-neutral-600">{DEFAULT_UPLOAD_LABEL}</p>
        </div>
        <div>
          <div
            className={`flex min-h-[140px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 text-center ${
              fieldErrors.file ? 'border-red-300 bg-red-50' : 'border-neutral-300 bg-neutral-50'
            }`}
            onClick={() => fileRef.current?.click()}
            onDragOver={(ev) => ev.preventDefault()}
            onDrop={(ev) => {
              ev.preventDefault()
              onFilePick(ev.dataTransfer.files?.[0])
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter' || ev.key === ' ') fileRef.current?.click()
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT_EDIT}
              className="hidden"
              onChange={(ev) => {
                onFilePick(ev.target.files?.[0])
                ev.target.value = ''
              }}
            />
            <p className="text-sm text-neutral-600">Drag and drop files here or click to select</p>
            <p className="mt-2 text-xs text-neutral-500">
              {file ? file.name : existingFileName || 'No file chosen'}
            </p>
          </div>
          {fieldErrors.file ? <p className="mt-1 text-xs text-red-600">{fieldErrors.file}</p> : null}
        </div>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
        style={{ backgroundColor: ACTION_BLUE }}
      >
        {submitting ? 'Saving…' : 'Save Changes'}
      </button>
    </form>
  )
}

function AddStudyMaterialForm({
  subject,
  form,
  setForm,
  fieldErrors,
  setFieldErrors,
  file,
  onFilePick,
  fileRef,
  error,
  submitting,
  onSubmit,
}) {
  const subjectLabel = form.subject_name || subject?.subject_name || 'Subject'

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 sm:col-span-2">
          <TextField
            label="Subject Semester"
            required
            value={form.semester}
            error={fieldErrors.semester}
            onChange={(e) => {
              setForm((p) => ({ ...p, semester: e.target.value }))
              setFieldErrors((p) => ({ ...p, semester: '' }))
            }}
          />
        </div>
        <div className="col-span-12 sm:col-span-2">
          <TextField
            label="Unit No."
            required
            value={form.unit_no}
            error={fieldErrors.unit_no}
            onChange={(e) => {
              setForm((p) => ({ ...p, unit_no: e.target.value }))
              setFieldErrors((p) => ({ ...p, unit_no: '' }))
            }}
          />
        </div>
        <div className="col-span-12 sm:col-span-8">
          <TextField
            label="Material Name"
            required
            value={form.material_name}
            error={fieldErrors.material_name}
            onChange={(e) => {
              setForm((p) => ({ ...p, material_name: e.target.value }))
              setFieldErrors((p) => ({ ...p, material_name: '' }))
            }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          label="Subject Name"
          value={form.subject_name}
          onChange={(e) => {
            setForm((p) => ({ ...p, subject_name: e.target.value }))
          }}
        />
        <TextField
          label="Grade Level"
          value={form.grade_level}
          onChange={(e) => {
            setForm((p) => ({ ...p, grade_level: e.target.value }))
          }}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        <div>
          <p className="text-sm font-semibold text-neutral-900">
            Study Material File ({subjectLabel})
          </p>
          <p className="mt-2 text-sm text-neutral-600">PDF only • Max 15MB</p>
        </div>
        <div>
          <div
            className={`flex min-h-[140px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 text-center ${
              fieldErrors.file ? 'border-red-300 bg-red-50' : 'border-neutral-300 bg-neutral-50'
            }`}
            onClick={() => fileRef.current?.click()}
            onDragOver={(ev) => ev.preventDefault()}
            onDrop={(ev) => {
              ev.preventDefault()
              onFilePick(ev.dataTransfer.files?.[0])
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter' || ev.key === ' ') fileRef.current?.click()
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT_ADD}
              className="hidden"
              onChange={(ev) => {
                onFilePick(ev.target.files?.[0])
                ev.target.value = ''
              }}
            />
            <p className="text-sm text-neutral-600">Drag and drop files here or click to select</p>
            <p className="mt-2 text-xs text-neutral-500">{file ? file.name : 'No file chosen'}</p>
          </div>
          {fieldErrors.file ? <p className="mt-1 text-xs text-red-600">{fieldErrors.file}</p> : null}
        </div>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
        style={{ backgroundColor: ACTION_BLUE }}
      >
        {submitting ? 'Saving…' : 'Add Material'}
      </button>
    </form>
  )
}

export default function TeacherStudyMaterialForm({
  mode,
  logoutToPortal,
  setSidebarNavLocked,
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const curriculumQuery = readCurriculumQuery(searchParams)
  const { subjectId, materialId } = useParams()
  const fileRef = useRef(null)
  const toast = useFacultyNotify()
  const isAdminSyllabusEdit = mode === 'edit' && isAdminSyllabusMaterialId(materialId)

  const [subject, setSubject] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [file, setFile] = useState(null)
  const [existingFileName, setExistingFileName] = useState('')
  const [form, setForm] = useState({
    semester: '1',
    unit_no: '1',
    unit_name: '',
    material_name: '',
    subject_name: '',
    grade_level: '',
  })

  useEffect(() => {
    setSidebarNavLocked?.(false)
  }, [setSidebarNavLocked])

  const load = useCallback(async () => {
    if (!subjectId) return
    setLoading(true)
    setError('')
    try {
      const subRes = await fetch(apiUrl(`/api/teacher/subjects/${encodeURIComponent(subjectId)}`), {
        credentials: 'include',
      })
      const subData = await subRes.json().catch(() => ({}))
      if (!subRes.ok) throw new Error(subData?.message || subData?.error || 'Failed to load subject.')
      setSubject(subData)
      if (mode === 'add') {
        let nextUnit = '1'
        try {
          const matsRes = await fetch(
            apiUrl(`/api/teacher/subjects/${encodeURIComponent(subjectId)}/materials`),
            { credentials: 'include' },
          )
          const matsData = await matsRes.json().catch(() => [])
          const list = Array.isArray(matsData) ? matsData : []
          const maxUnit = list.reduce((max, m) => {
            const n = Number(String(m.unit_no ?? '').trim())
            return Number.isFinite(n) && n > max ? n : max
          }, 0)
          nextUnit = String(maxUnit + 1)
        } catch {
          nextUnit = '1'
        }
        setForm({
          semester: String(subData.semester ?? '1'),
          unit_no: nextUnit,
          unit_name: '',
          material_name: '',
          subject_name: String(subData.subject_name ?? ''),
          grade_level: String(subData.grade_level ?? ''),
        })
      }
      if (mode === 'edit' && materialId) {
        if (isAdminSyllabusMaterialId(materialId)) {
          const adminMat = location.state?.adminMaterial
          if (!adminMat) {
            throw new Error('Material not found.')
          }
          setForm({
            semester: String(adminMat.semester ?? subData.semester ?? '1'),
            unit_no: String(adminMat.unit_no ?? '1'),
            unit_name: String(adminMat.unit_name ?? adminMat.material_name ?? ''),
            material_name: String(adminMat.material_name ?? adminMat.unit_name ?? ''),
            subject_name: String(subData.subject_name ?? ''),
            grade_level: String(subData.grade_level ?? ''),
          })
          setExistingFileName(String(adminMat.file_name || adminMat.material_name || subData.syllabus_file_name || '').trim())
        } else {
          const matRes = await fetch(apiUrl(`/api/teacher/materials/${encodeURIComponent(materialId)}`), {
            credentials: 'include',
          })
          const matData = await matRes.json().catch(() => ({}))
          if (!matRes.ok) throw new Error(matData?.message || matData?.error || 'Failed to load material.')
          setForm({
            semester: String(matData.semester ?? subData.semester ?? '1'),
            unit_no: String(matData.unit_no ?? '1'),
            unit_name: String(matData.unit_name ?? ''),
            material_name: String(matData.material_name ?? matData.unit_name ?? ''),
            subject_name: String(matData.subject_name ?? subData.subject_name ?? ''),
            grade_level: String(matData.grade_level ?? subData.grade_level ?? ''),
          })
          setExistingFileName(String(matData.file_name || matData.material_name || '').trim())
        }
      }
    } catch (e) {
      setError(String(e?.message || e))
    } finally {
      setLoading(false)
    }
  }, [subjectId, materialId, mode, location.state])

  useEffect(() => {
    void load()
  }, [load])

  const validateFile = mode === 'add' ? validateAddFile : validateEditFile

  const onFilePick = (picked) => {
    if (!picked) return
    const fileErr = validateFile(picked)
    if (fileErr) {
      setError(fileErr)
      setFieldErrors((p) => ({ ...p, file: fileErr }))
      setFile(null)
      if (fileErr === ADD_FILE_TYPE_MSG || fileErr === FILE_TYPE_MSG) {
        toast.error(mode === 'add' ? ADD_FILE_TYPE_MSG : FACULTY_MSG.studyMaterial.fileType)
      } else if (fileErr === FILE_SIZE_MAX_MSG) {
        toast.error(SUBJECT_MATERIAL_MAX_MSG)
      }
      return
    }
    setFile(picked)
    setError('')
    setFieldErrors((p) => ({ ...p, file: '' }))
  }

  function collectValidationErrors() {
    const errs = {}
    if (!String(form.semester || '').trim()) errs.semester = 'Subject semester is required.'
    if (!String(form.unit_no || '').trim()) errs.unit_no = 'Unit no. is required.'
    if (mode === 'edit' && !String(form.unit_name || '').trim()) {
      errs.unit_name = 'Unit name is required.'
    }
    if (mode === 'add' && !String(form.material_name || '').trim()) {
      errs.material_name = 'Material name is required.'
    }
    if (mode === 'add' && !file) {
      errs.file = 'Please upload a study material file.'
    }
    if (file) {
      const fileErr = validateFile(file)
      if (fileErr) errs.file = fileErr
    }
    return errs
  }

  function notifyFileValidationError(fileErr) {
    if (fileErr === ADD_FILE_TYPE_MSG || fileErr === FILE_TYPE_MSG) {
      toast.error(mode === 'add' ? ADD_FILE_TYPE_MSG : FACULTY_MSG.studyMaterial.fileType)
    } else if (fileErr === FILE_SIZE_MAX_MSG) {
      toast.error(SUBJECT_MATERIAL_MAX_MSG)
    }
  }

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    const errs = collectValidationErrors()
    setFieldErrors(errs)
    if (Object.keys(errs).length > 0) {
      if (errs.file) notifyFileValidationError(errs.file)
      return
    }

    const materialName = String(form.material_name || form.unit_name || '').trim()
    const isEdit = mode === 'edit' || isAdminSyllabusEdit

    setSubmitting(true)
    try {
      if (isAdminSyllabusEdit) {
        const fd = new FormData()
        fd.append('semester', String(form.semester || '').trim())
        fd.append('subject_name', String(form.subject_name || '').trim())
        fd.append('grade_level', String(form.grade_level || '').trim())
        if (file) fd.append('file', file)
        const res = await fetch(apiUrl(`/api/teacher/subjects/${encodeURIComponent(subjectId)}/syllabus`), {
          method: 'PATCH',
          credentials: 'include',
          body: fd,
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.message || data?.error || 'Save failed.')
        toast.success(FACULTY_MSG.studyMaterial.updated)
        navigate(`/teacher/subjects/${encodeURIComponent(subjectId)}`)
        return
      }

      const fd = new FormData()
      fd.append('subject_id', String(subjectId))
      fd.append('semester', String(form.semester || '').trim())
      fd.append('unit_no', String(form.unit_no || '1').trim())
      fd.append('unit_name', materialName)
      fd.append('material_name', materialName)
      fd.append('subject_name', String(form.subject_name || '').trim())
      fd.append('grade_level', String(form.grade_level || '').trim())
      if (curriculumQuery.moduleId) fd.append('module_id', curriculumQuery.moduleId)
      if (curriculumQuery.topicId) fd.append('topic_id', curriculumQuery.topicId)
      if (file) fd.append('file', file)

      const url =
        mode === 'edit'
          ? apiUrl(`/api/teacher/materials/${encodeURIComponent(materialId)}`)
          : apiUrl('/api/teacher/materials')
      const res = await fetch(url, {
        method: mode === 'edit' ? 'PATCH' : 'POST',
        credentials: 'include',
        body: fd,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.message || data?.error || 'Save failed.')
      }
      toast.success(isEdit ? FACULTY_MSG.studyMaterial.updated : FACULTY_MSG.studyMaterial.added)
      if (!isEdit && data?.material?.id) {
        await linkCreatedItemToCurriculum({
          itemType: 'material',
          itemId: data.material.id,
          moduleId: curriculumQuery.moduleId,
          topicId: curriculumQuery.topicId,
        })
      }
      navigate(`/teacher/subjects/${encodeURIComponent(subjectId)}`)
    } catch (err) {
      const msg = String(err?.message || err)
      setError(msg)
      if (msg === FILE_TYPE_MSG) toast.error(FACULTY_MSG.studyMaterial.fileType)
      else if (msg === FILE_SIZE_MAX_MSG) toast.error(FACULTY_MSG.studyMaterial.fileSize)
      else toast.error(isEdit ? FACULTY_MSG.studyMaterial.updateFailed : FACULTY_MSG.studyMaterial.addFailed)
    } finally {
      setSubmitting(false)
    }
  }

  if (mode === 'add') {
    return (
      <>
        <TeacherMainHeader pageTitle="Subjects" />
        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-8">
          <div className="mb-6 space-y-0.5 border-b border-neutral-200 pb-4">
            <TeacherBackButton
              className="mb-0"
              to={`/teacher/subjects/${encodeURIComponent(subjectId)}`}
            />
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">VIEW</p>
            <h2 className="text-xl font-bold text-neutral-900 md:text-2xl">Add Study Material</h2>
          </div>

          {loading ? (
            <p className="text-sm text-neutral-500">Loading…</p>
          ) : (
            <AddStudyMaterialForm
              subject={subject}
              form={form}
              setForm={setForm}
              fieldErrors={fieldErrors}
              setFieldErrors={setFieldErrors}
              file={file}
              onFilePick={onFilePick}
              fileRef={fileRef}
              error={error}
              submitting={submitting}
              onSubmit={onSubmit}
            />
          )}
        </main>
      </>
    )
  }

  if (mode === 'edit') {
    return (
      <>
        <TeacherMainHeader pageTitle="Subjects" />
        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-8">
          <div className="mb-6 space-y-0.5 border-b border-neutral-200 pb-4">
            <TeacherBackButton
              className="mb-0"
              to={`/teacher/subjects/${encodeURIComponent(subjectId)}`}
            />
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">VIEW</p>
            <h2 className="text-xl font-bold text-neutral-900 md:text-2xl">Edit Study Material</h2>
          </div>

          {loading ? (
            <p className="text-sm text-neutral-500">Loading…</p>
          ) : (
            <EditStudyMaterialForm
              subject={subject}
              form={form}
              setForm={setForm}
              fieldErrors={fieldErrors}
              setFieldErrors={setFieldErrors}
              file={file}
              existingFileName={existingFileName}
              onFilePick={onFilePick}
              fileRef={fileRef}
              error={error}
              submitting={submitting}
              onSubmit={onSubmit}
            />
          )}
        </main>
      </>
    )
  }

  return null
}
