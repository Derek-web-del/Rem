import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import DeleteConfirmModal from '../DeleteConfirmModal.jsx'
import TopicFormModal from '../../pages/teachers/subject-detail/shared/TopicFormModal.jsx'
import TopicGroup from '../../pages/teachers/subject-detail/shared/TopicGroup.jsx'
import {
  createAdminSubjectTopic,
  deleteAdminSubjectLesson,
  deleteAdminSubjectTopic,
  fetchAdminSubjectTopics,
  updateAdminSubjectTopic,
} from '../../lib/adminSubjectCurriculum.js'

export default function AdminSubjectCurriculumPanel({ postgresSubjectId }) {
  const subjectId = String(postgresSubjectId || '').trim()
  const [topics, setTopics] = useState([])
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState({})
  const [topicModal, setTopicModal] = useState({ open: false, topic: null })
  const [savingTopic, setSavingTopic] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    if (!subjectId) return
    setLoading(true)
    setError('')
    try {
      const data = await fetchAdminSubjectTopics(subjectId)
      setTopics(data)
    } catch (e) {
      setError(String(e?.message || 'Could not load modules and lessons.'))
      setTopics([])
    } finally {
      setLoading(false)
    }
  }, [subjectId])

  useEffect(() => {
    void load()
  }, [load])

  if (!subjectId) return null

  const realTopics = topics.filter((t) => t.id !== 'uncategorized')

  async function handleSaveTopic(title) {
    setSavingTopic(true)
    try {
      if (topicModal.topic?.id) {
        await updateAdminSubjectTopic(subjectId, topicModal.topic.id, { title })
      } else {
        await createAdminSubjectTopic(subjectId, { title, topic_order: realTopics.length })
      }
      setTopicModal({ open: false, topic: null })
      await load()
    } catch (e) {
      setError(String(e?.message || 'Could not save topic.'))
    } finally {
      setSavingTopic(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      if (deleteTarget.kind === 'topic') {
        await deleteAdminSubjectTopic(subjectId, deleteTarget.data.id)
      } else if (deleteTarget.kind === 'lesson') {
        await deleteAdminSubjectLesson(subjectId, deleteTarget.data.id)
      }
      setDeleteTarget(null)
      await load()
    } catch (e) {
      setError(String(e?.message || 'Could not delete.'))
    } finally {
      setDeleting(false)
    }
  }

  const lessonNewPath = (topicId) => {
    const base = `/admin/subjects/${encodeURIComponent(subjectId)}/lessons/new`
    if (topicId && topicId !== 'uncategorized') {
      return `${base}?topic_id=${encodeURIComponent(topicId)}`
    }
    return base
  }

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-md md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-neutral-900">Modules &amp; lessons</h3>
          <p className="mt-1 text-sm text-neutral-600">
            Institute admin uploads curriculum-aligned topics and lessons. Teachers manage classwork only.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:brightness-110"
            onClick={() => setTopicModal({ open: true, topic: null })}
          >
            + Add topic
          </button>
          <Link
            to={lessonNewPath('')}
            className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-800 hover:bg-blue-100"
          >
            + Add lesson
          </Link>
        </div>
      </div>

      {error ? <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <div className="mt-4 overflow-hidden rounded-xl border border-neutral-200">
        {loading ? (
          <p className="px-4 py-8 text-sm text-neutral-500">Loading curriculum structure…</p>
        ) : topics.length === 0 ? (
          <p className="px-4 py-8 text-sm text-neutral-500">No topics yet. Add a topic, then upload lessons.</p>
        ) : (
          topics.map((topic) => (
            <TopicGroup
              key={topic.id}
              topic={topic}
              subjectId={subjectId}
              role="teacher"
              editable
              lessonsEditable
              collapsed={Boolean(collapsed[topic.id])}
              onToggle={() => setCollapsed((p) => ({ ...p, [topic.id]: !p[topic.id] }))}
              onEditTopic={(t) => setTopicModal({ open: true, topic: t })}
              onDeleteTopic={(t) => setDeleteTarget({ kind: 'topic', data: t })}
              onEditLesson={(lesson) => {
                window.location.assign(
                  `/admin/subjects/${encodeURIComponent(subjectId)}/lessons/${encodeURIComponent(lesson.id)}/edit`,
                )
              }}
              onDeleteLesson={(lesson) => setDeleteTarget({ kind: 'lesson', data: lesson })}
            />
          ))
        )}
      </div>

      {topicModal.open ? (
        <TopicFormModal
          initial={topicModal.topic}
          saving={savingTopic}
          onClose={() => setTopicModal({ open: false, topic: null })}
          onSave={handleSaveTopic}
        />
      ) : null}

      {deleteTarget ? (
        <DeleteConfirmModal
          title={deleteTarget.kind === 'topic' ? 'Delete topic' : 'Delete lesson'}
          message={
            deleteTarget.kind === 'topic'
              ? 'Delete this topic? Items move to Unassigned.'
              : 'Delete this lesson permanently?'
          }
          confirming={deleting}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={confirmDelete}
        />
      ) : null}
    </section>
  )
}
