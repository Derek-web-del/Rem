import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom'
import { useFacultyNotify } from '../../lib/facultyNotify.js'
import {
  createSubjectLessonMultipart,
  fetchSubjectLesson,
  fetchSubjectTopics,
  fetchTeacherSubject,
  updateSubjectLessonMultipart,
} from '../../lib/teacherSubjectCurriculum.js'
import LessonAttachPanel from './subject-detail/shared/LessonAttachPanel.jsx'
import LessonComposerSidebar from './subject-detail/shared/LessonComposerSidebar.jsx'
import LessonRichTextField from './subject-detail/shared/LessonRichTextField.jsx'
import { ACTION_BLUE } from './instituteChrome.js'

function fileNameFromPath(path) {
  if (!path) return ''
  const parts = String(path).split('/')
  const name = parts[parts.length - 1] || ''
  return name.replace(/-[a-f0-9]{8}\./i, '.')
}

export default function TeacherLessonFormPage({ mode = 'add' }) {
  const isEdit = mode === 'edit'
  const { subjectId, lessonId } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { setSidebarNavLocked } = useOutletContext() || {}
  const toast = useFacultyNotify()

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

  const returnPath = `/teacher/subjects/${encodeURIComponent(subjectId)}?tab=classwork`
  const titleEmpty = !title.trim()
  const showTitleError = titleTouched && titleEmpty
  const canPost = !titleEmpty && !submitting

  useEffect(() => {
    setSidebarNavLocked?.(false)
  }, [setSidebarNavLocked])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [sub, topicList] = await Promise.all([
        fetchTeacherSubject(subjectId),
        fetchSubjectTopics(subjectId),
      ])
      setSubject(sub)
      setTopics(topicList)
      if (isEdit && lessonId) {
        const { lesson } = await fetchSubjectLesson(subjectId, lessonId)
        setTitle(lesson.title || '')
        setDescription(lesson.description || '')
        setTopicId(lesson.topic_id || '')
        setLinkUrl(lesson.link_url || '')
        if (lesson.file_path) {
          setExistingFileName(fileNameFromPath(lesson.file_path))
        }
      } else if (!isEdit && searchParams.get('topic_id')) {
        setTopicId(searchParams.get('topic_id'))
      }
    } catch (e) {
      toast.error(String(e?.message || 'Could not load lesson form.'))
      navigate(returnPath, { replace: true })
    } finally {
      setLoading(false)
    }
  }, [subjectId, lessonId, isEdit, searchParams, toast, navigate, returnPath])

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
        await updateSubjectLessonMultipart(subjectId, lessonId, fd)
        toast.success('Lesson updated.')
      } else {
        await createSubjectLessonMultipart(subjectId, fd)
        toast.success('Lesson posted.')
      }
      navigate(returnPath)
    } catch (e) {
      toast.error(String(e?.message || 'Could not save lesson.'))
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-neutral-100 text-sm text-neutral-500">
        Loading…
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-neutral-100">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3 md:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="rounded-full p-2 text-neutral-600 hover:bg-neutral-100"
            onClick={() => navigate(returnPath)}
            aria-label="Close"
          >
            <i className="ti ti-x text-xl" aria-hidden="true" />
          </button>
          <i className="ti ti-book-2 text-xl text-neutral-700" aria-hidden="true" />
          <h1 className="text-lg font-normal text-neutral-900">Lesson</h1>
        </div>
        <button
          type="button"
          disabled={!canPost}
          className="rounded-md px-5 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
          style={{ backgroundColor: canPost ? ACTION_BLUE : '#9ca3af' }}
          onClick={handlePost}
        >
          {submitting ? 'Posting…' : 'Post'}
        </button>
      </header>

      <div className="flex-1 overflow-auto p-4 md:p-6">
        <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-[1fr_260px]">
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
                className={`mt-1 w-full border-0 border-b-2 bg-transparent py-2 text-base outline-none focus:ring-0 ${
                  showTitleError ? 'border-red-600' : 'border-neutral-300 focus:border-[#185FA5]'
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

          <LessonComposerSidebar
            subject={subject}
            topics={topics}
            topicId={topicId}
            onTopicChange={setTopicId}
          />
        </div>
      </div>
    </div>
  )
}
