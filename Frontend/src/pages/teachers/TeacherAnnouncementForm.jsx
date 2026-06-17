import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import {
  ANNOUNCEMENT_TYPES,
  createTeacherAnnouncement,
  fetchTeacherAnnouncement,
  resolveAnnouncementImageSrc,
  updateTeacherAnnouncement,
} from '../../lib/teacherAnnouncements.js'
import { FACULTY_MSG, FACULTY_TOAST_ID, FACULTY_ANNOUNCEMENT_TOAST_MS, useFacultyNotify } from '../../lib/facultyNotify.js'
import { PROFILE_PHOTO_MAX_BYTES, PROFILE_PHOTO_MAX_MSG, PHOTO_UPLOAD_LABEL } from '../../lib/uploadLimits.js'
import TeacherMainHeader from './TeacherMainHeader.jsx'
import BackButton from '../../components/BackButton.jsx'
import { ACTION_BLUE } from './instituteChrome.js'

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(new Error('Could not read file.'))
    reader.readAsDataURL(file)
  })
}

function FolderIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M10 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2h-8l-2-2z" />
    </svg>
  )
}

function AvatarPlaceholder() {
  return (
    <div className="flex h-24 w-24 items-center justify-center rounded-lg border border-neutral-200 bg-neutral-100 text-neutral-400">
      <svg viewBox="0 0 24 24" className="h-14 w-14 fill-current" aria-hidden>
        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
      </svg>
    </div>
  )
}

export default function TeacherAnnouncementForm({ mode = 'add' }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const { logoutToPortal, setSidebarNavLocked } = useOutletContext() || {}
  const toast = useFacultyNotify()
  const fileInputRef = useRef(null)
  const dropRef = useRef(null)

  const isEdit = mode === 'edit'
  const subheading = isEdit ? 'EDIT' : 'ADD NEW'

  const [loading, setLoading] = useState(isEdit)
  const [submitting, setSubmitting] = useState(false)
  const [pickedFileName, setPickedFileName] = useState('')
  const [form, setForm] = useState({
    title: '',
    updateType: '',
    description: '',
    imageDataUrl: '',
  })

  useEffect(() => {
    setSidebarNavLocked?.(false)
  }, [setSidebarNavLocked])

  useEffect(() => {
    if (!isEdit || !id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const row = await fetchTeacherAnnouncement(id)
        if (cancelled || !row) return
        setForm({
          title: row.title || '',
          updateType: row.updateType || '',
          description: row.description || '',
          imageDataUrl: resolveAnnouncementImageSrc(row) || row.imageDataUrl || '',
        })
        setPickedFileName(row.imageName || '')
      } catch (e) {
        console.error('[TeacherAnnouncementForm]', e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isEdit, id])

  const handleImageFile = useCallback(
    async (file) => {
      if (!file) return
      if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
        toast.error(FACULTY_MSG.announcements.imageType, {
          toastId: FACULTY_TOAST_ID.announcementImageType,
          durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,
        })
        return
      }
      if (file.size > PROFILE_PHOTO_MAX_BYTES) {
        toast.error(FACULTY_MSG.announcements.imageSize, {
          toastId: FACULTY_TOAST_ID.announcementImageSize,
          durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,
        })
        return
      }
      const dataUrl = await readFileAsDataUrl(file)
      setPickedFileName(file.name)
      setForm((prev) => ({ ...prev, imageDataUrl: dataUrl }))
    },
    [toast],
  )

  useEffect(() => {
    const el = dropRef.current
    if (!el) return
    function prevent(e) {
      e.preventDefault()
      e.stopPropagation()
    }
    function onDrop(e) {
      prevent(e)
      const file = e.dataTransfer?.files?.[0]
      void handleImageFile(file)
    }
    el.addEventListener('dragenter', prevent)
    el.addEventListener('dragover', prevent)
    el.addEventListener('dragleave', prevent)
    el.addEventListener('drop', onDrop)
    return () => {
      el.removeEventListener('dragenter', prevent)
      el.removeEventListener('dragover', prevent)
      el.removeEventListener('dragleave', prevent)
      el.removeEventListener('drop', onDrop)
    }
  }, [handleImageFile])

  function validate() {
    if (!String(form.title || '').trim()) {
      toast.error('Announcement title is required.', {
        toastId: FACULTY_TOAST_ID.announcementAddError,
        durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,
      })
      return false
    }
    if (!String(form.updateType || '').trim()) {
      toast.error('Please select announcement type.', {
        toastId: FACULTY_TOAST_ID.announcementAddError,
        durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,
      })
      return false
    }
    if (!String(form.description || '').trim()) {
      toast.error('Announcement message is required.', {
        toastId: FACULTY_TOAST_ID.announcementAddError,
        durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,
      })
      return false
    }
    return true
  }

  async function submit(e) {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    try {
      const payload = {
        title: String(form.title).trim(),
        updateType: String(form.updateType).trim(),
        description: String(form.description).trim(),
        imageDataUrl: form.imageDataUrl || '',
        imageName: pickedFileName || '',
      }
      if (isEdit) {
        await updateTeacherAnnouncement(id, payload)
        toast.success(FACULTY_MSG.announcements.updated, {
          toastId: FACULTY_TOAST_ID.announcementUpdateSuccess,
          durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,
        })
      } else {
        await createTeacherAnnouncement(payload)
        toast.success(FACULTY_MSG.announcements.added, {
          toastId: FACULTY_TOAST_ID.announcementAddSuccess,
          durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,
        })
      }
      navigate('/teacher/announcements')
    } catch (err) {
      const msg = String(err?.message || err || '')
      if (isEdit) {
        toast.error(FACULTY_MSG.announcements.updateFailed, {
          toastId: FACULTY_TOAST_ID.announcementUpdateError,
          durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,
        })
      } else {
        toast.error(msg || FACULTY_MSG.announcements.addFailed, {
          toastId: FACULTY_TOAST_ID.announcementAddError,
          durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,
        })
      }
    } finally {
      setSubmitting(false)
    }
  }

  const previewSrc = form.imageDataUrl || ''
  const submitLabel = isEdit ? 'Save Changes' : 'Add Announcement'

  return (
    <>
      <TeacherMainHeader pageTitle="Announcements" />
      <main className="min-h-0 flex-1 space-y-6 overflow-y-auto overflow-x-hidden p-4 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-sky-600">{subheading}</p>
            <h2 className="mt-0.5 text-xl font-bold text-[#15397a] md:text-2xl">Announcement</h2>
          </div>
            <BackButton to="/teacher/announcements" className="" />
        </div>

        <hr className="border-neutral-200" />

        {loading ? (
          <p className="text-sm text-neutral-500">Loading…</p>
        ) : (
          <>
            <div className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-5 shadow-md md:flex-row md:items-center md:p-6">
              <div className="flex shrink-0 items-center gap-4">
                {previewSrc ? (
                  <img
                    src={previewSrc}
                    alt=""
                    className="h-24 w-24 rounded-lg border border-neutral-200 object-cover"
                  />
                ) : (
                  <AvatarPlaceholder />
                )}
                <div>
                  <p className="font-semibold text-neutral-900">Update Image</p>
                  <p className="mt-1 text-sm text-neutral-500">{PHOTO_UPLOAD_LABEL}</p>
                </div>
              </div>
              <div
                ref={dropRef}
                className="flex min-h-[120px] flex-1 flex-col items-center justify-center rounded-xl border-2 border-dashed border-neutral-300 bg-neutral-50/80 px-4 py-6 text-center"
              >
                <FolderIcon className="h-10 w-10 text-amber-400" />
                <p className="mt-2 text-sm text-neutral-600">
                  Drag &amp; drop your photo here or{' '}
                  <button
                    type="button"
                    className="font-semibold text-blue-600 underline-offset-2 hover:underline"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    browse
                  </button>
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0]
                    e.target.value = ''
                    void handleImageFile(f)
                  }}
                />
              </div>
            </div>

            <form
              onSubmit={submit}
              className="space-y-5 rounded-xl border border-neutral-200 bg-white p-5 shadow-md md:p-6"
            >
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-sm font-medium text-neutral-700">
                  <span className="text-red-600">*</span> Announcement Title
                  <input
                    type="text"
                    className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                    value={form.title}
                    onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                    placeholder="e.g. Computer Programming"
                  />
                </label>
                <label className="block text-sm font-medium text-neutral-700">
                  <span className="text-red-600">*</span> Announcement Type
                  <select
                    className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                    value={form.updateType}
                    onChange={(e) => setForm((p) => ({ ...p, updateType: e.target.value }))}
                  >
                    <option value="">Select Type</option>
                    {ANNOUNCEMENT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                    {isEdit && form.updateType && !ANNOUNCEMENT_TYPES.includes(form.updateType) ? (
                      <option value={form.updateType}>{form.updateType}</option>
                    ) : null}
                  </select>
                </label>
              </div>
              <label className="block text-sm font-medium text-neutral-700">
                <span className="text-red-600">*</span> Message / Description
                <textarea
                  rows={6}
                  className="mt-1 w-full resize-y rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Message"
                />
              </label>

              <div className="flex justify-start pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:brightness-110 disabled:opacity-60"
                  style={{ backgroundColor: ACTION_BLUE }}
                >
                  {submitting ? 'Saving…' : submitLabel}
                </button>
              </div>
            </form>
          </>
        )}
      </main>
    </>
  )
}
