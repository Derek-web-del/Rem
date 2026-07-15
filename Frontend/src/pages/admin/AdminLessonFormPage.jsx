import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useNotify } from '../../components/notifications.jsx'
import {
  createAdminSubjectLessonMultipart,
  fetchAdminSubjectLesson,
  fetchAdminSubjectTopics,
  updateAdminSubjectLessonMultipart,
} from '../../lib/adminSubjectCurriculum.js'
import { apiUrl } from '../../lib/lmsStateStorage.js'
import LessonAttachPanel from '../teachers/subject-detail/shared/LessonAttachPanel.jsx'
import LessonComposerSidebar from '../teachers/subject-detail/shared/LessonComposerSidebar.jsx'
import LessonRichTextField from '../teachers/subject-detail/shared/LessonRichTextField.jsx'

function fileNameFromPath(path) {
  if (!path) return ''
  const parts = String(path).split('/')
  const name = parts[parts.length - 1] || ''
  return name.replace(/-[a-f0-9]{8}\./i, '.')
}

export default function AdminLessonFormPage({ mode = 'add' }) {
  const isEdit = mode === 'edit'
  const { subjectId, lessonId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const toast = useNotify()

  const [subject, setSubject] = useState(null)
  const [topics, setTopics] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [title, setTitle] = useState('')
  const [titleTouched, setTitleTouched] = useState(false)
  const [description, setDescription] = useState('')
  const [topicId, setTopicId] = useState(searchParams.get('topic_id') || '')
  const [file, setFile] = useState(null)
  const [existingFileName, setExistingFileName] = useState('')
  const [clearFile, setClearFile] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [clearLink, setClearLink] = useState(false)

  const returnPath = `/admin/subjects`
  const titleEmpty = !title.trim()
  const showTitleError = titleTouched && titleEmpty
  const canPost = !titleEmpty && !submitting

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [subRes, topicList] = await Promise.all([
        fetch(apiUrl('/api/v1/subjects'), { credentials: 'include' }).then((r) => r.json()),
        fetchAdminSubjectTopics(subjectId),
      ])
      const subjects = Array.isArray(subRes?.subjects) ? subRes.subjects : []
      const sub = subjects.find((s) => String(s.id) === String(subjectId)) || null
      setSubject(sub)
      setTopics(topicList)
      if (isEdit && lessonId) {
        const { lesson } = await fetchAdminSubjectLesson(subjectId, lessonId)
        setTitle(lesson.title || '')
        setDescription(lesson.description || '')
        setTopicId(lesson.topic_id || '')
        setLinkUrl(lesson.link_url || '')
        if (lesson.file_path) setExistingFileName(fileNameFromPath(lesson.file_path))
      } else if (!isEdit && searchParams.get('topic_id')) {
        setTopicId(searchParams.get('topic_id'))
      }
    } catch (e) {
      toast.error(String(e?.message || 'Could not load lesson form.'))
      navigate('/admin/subjects', { replace: true })
    } finally {
      setLoading(false)
    }
  }, [subjectId, lessonId, isEdit, searchParams, toast, navigate])

  useEffect(() => {
    void load()
  }, [load])

  async function handlePost() {
    setTitleTouched(true)
    if (titleEmpty) return
    setSubmitting(true)
    try {
      const fd = new FormData()
      fd.append('title', title.trim())
      fd.append('description', description)
      fd.append('topic_id', topicId || '')
      if (file) fd.append('file', file)
      if (clearFile) fd.append('clear_file', 'true')
      if (linkUrl) fd.append('link_url', linkUrl)
      if (clearLink) fd.append('clear_link', 'true')

      if (isEdit) {
        await updateAdminSubjectLessonMultipart(subjectId, lessonId, fd)
        toast.updated('Lesson updated.')
      } else {
        await createAdminSubjectLessonMultipart(subjectId, fd)
        toast.created('Lesson posted.')
      }
      navigate('/admin/subjects')
    } catch (e) {
      toast.error(String(e?.message || 'Could not save lesson.'))
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-neutral-500">Loading lesson form…</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-neutral-900">{isEdit ? 'Edit lesson' : 'Add lesson'}</h2>
          <p className="mt-1 text-sm text-neutral-600">
            {subject?.subject_name || subject?.subjectName || 'Subject'} — curriculum-aligned lesson upload
          </p>
        </div>
        <button
          type="button"
          className="rounded-lg border border-neutral-200 px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
          onClick={() => navigate('/admin/subjects')}
        >
          Back to subjects
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
        <div className="space-y-4">
          <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
            <label className={`block text-sm ${showTitleError ? 'text-red-600' : 'text-neutral-700'}`}>
              Title<span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => setTitleTouched(true)}
              className={`mt-1 w-full border-0 border-b-2 bg-transparent py-2 text-base outline-none ${
                showTitleError ? 'border-red-600' : 'border-neutral-300 focus:border-blue-600'
              }`}
            />
            {showTitleError ? <p className="mt-1 text-xs text-red-600">*Required</p> : null}
            <LessonRichTextField value={description} onChange={setDescription} />
          </div>
          <LessonAttachPanel
            file={file}
            existingFileName={clearFile ? '' : existingFileName}
            linkUrl={clearLink ? '' : linkUrl}
            onFileChange={(f) => {
              setFile(f)
              setClearFile(false)
            }}
            onLinkChange={(url) => {
              setLinkUrl(url)
              setClearLink(false)
            }}
            onClearFile={() => {
              setFile(null)
              setExistingFileName('')
              setClearFile(true)
            }}
            onClearLink={() => {
              setLinkUrl('')
              setClearLink(true)
            }}
          />
        </div>
        <LessonComposerSidebar subject={subject} topics={topics} topicId={topicId} onTopicChange={setTopicId} />
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          disabled={!canPost}
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          onClick={handlePost}
        >
          {submitting ? 'Saving…' : isEdit ? 'Save lesson' : 'Post lesson'}
        </button>
      </div>
    </div>
  )
}
