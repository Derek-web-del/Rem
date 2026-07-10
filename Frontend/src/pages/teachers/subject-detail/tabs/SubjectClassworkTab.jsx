import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  createSubjectTopic,
  deleteSubjectTopic,
  deleteSubjectLesson,
  deleteSubjectSyllabus,
  deleteTeacherMaterial,
  fetchSubjectTopics,
  moveClassworkEntry,
  reorderSubjectTopics,
  updateSubjectTopic,
  uploadSubjectSyllabus,
} from '../../../../lib/teacherSubjectCurriculum.js'
import { deleteTeacherAssignment } from '../../../../lib/teacherAssignments.js'
import { deleteTeacherActivity } from '../../../../lib/teacherActivities.js'
import { deleteTeacherQuiz } from '../../../../lib/teacherQuizzes.js'
import { useFacultyNotify } from '../../../../lib/facultyNotify.js'
import DeleteConfirmModal from '../../../../components/DeleteConfirmModal.jsx'
import TopicGroup from '../shared/TopicGroup.jsx'
import TopicFormModal from '../shared/TopicFormModal.jsx'
import {
  applyEntryOrderToTopic,
  buildTopicEntries,
  encodeItemDragPlain,
  encodeTopicDragPlain,
  entryDragPayload,
  insertEntryIntoTopic,
  moveEntryInTopic,
  readDragDataFromEvent,
  removeEntryFromTopic,
  reorderTopicList,
  topicDragPayload,
} from '../shared/classworkDragDrop.js'

function findEntryInTopics(topics, payload) {
  for (const topic of topics) {
    for (const entry of buildTopicEntries(topic)) {
      const match =
        (entry.kind === 'lesson' && payload.itemType === 'lesson' && String(entry.data.id) === String(payload.itemId)) ||
        (entry.kind === 'work' &&
          payload.itemType === entry.data.item_type &&
          String(entry.data.id) === String(payload.itemId))
      if (match) return { topic, entry }
    }
  }
  return null
}

async function persistTopicEntryOrders(subjectId, topic) {
  const entries = buildTopicEntries(topic)
  await Promise.all(
    entries.map((entry, index) => {
      const { itemType, itemId } = entryDragPayload(entry)
      return moveClassworkEntry(subjectId, {
        itemType,
        itemId,
        topicId: topic.id,
        moduleOrder: index,
      })
    }),
  )
}

export default function SubjectClassworkTab({ subjectId, subject, onSyllabusUpdated }) {
  const navigate = useNavigate()
  const toast = useFacultyNotify()
  const syllabusInputRef = useRef(null)
  const [topics, setTopics] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploadingSyllabus, setUploadingSyllabus] = useState(false)
  const [collapsed, setCollapsed] = useState({})
  const [topicModal, setTopicModal] = useState({ open: false, topic: null })
  const [savingTopic, setSavingTopic] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [dragOverTopicId, setDragOverTopicId] = useState(null)
  const [dragOverItemKey, setDragOverItemKey] = useState(null)
  const draggedItemRef = useRef(null)
  const draggedTopicRef = useRef(null)
  const dragKindRef = useRef(null)
  const topicsSnapshotRef = useRef([])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchSubjectTopics(subjectId)
      setTopics(data)
    } catch (e) {
      toast.error(String(e?.message || 'Could not load classwork.'))
      setTopics([])
    } finally {
      setLoading(false)
    }
  }, [subjectId, toast])

  useEffect(() => {
    void load()
  }, [load])

  const realTopics = topics.filter((t) => t.id !== 'uncategorized')

  const lessonNewPath = (topicId) => {
    const base = `/teacher/subjects/${encodeURIComponent(subjectId)}/lessons/new`
    if (topicId && topicId !== 'uncategorized') {
      return `${base}?topic_id=${encodeURIComponent(topicId)}`
    }
    return base
  }

  const buildQuery = (topicId) => {
    const params = new URLSearchParams({ subject_id: subjectId })
    if (topicId && topicId !== 'uncategorized') params.set('topic_id', topicId)
    return params.toString()
  }

  const q = (topicId) => buildQuery(topicId)

  const handleSaveTopic = async (title) => {
    setSavingTopic(true)
    try {
      if (topicModal.topic?.id) {
        await updateSubjectTopic(subjectId, topicModal.topic.id, { title })
      } else {
        await createSubjectTopic(subjectId, { title, topic_order: realTopics.length })
      }
      setTopicModal({ open: false, topic: null })
      await load()
    } catch (e) {
      toast.error(String(e?.message || 'Could not save topic.'))
    } finally {
      setSavingTopic(false)
    }
  }

  const handleDeleteTopic = (topic) => {
    setDeleteTarget({ kind: 'topic', data: topic })
  }

  const handleDeleteLesson = (lesson) => {
    setDeleteTarget({ kind: 'lesson', data: lesson })
  }

  const handleEditWork = (item) => {
    if (item?.item_type === 'syllabus' || item?.is_syllabus) return
    const subjectQ = `subject_id=${encodeURIComponent(subjectId)}`
    const paths = {
      assignment: `/teacher/assignments/${item.id}/edit?${subjectQ}`,
      activity: `/teacher/activities/${item.id}/edit?${subjectQ}`,
      quiz: `/teacher/quizzes/${item.id}/edit?${subjectQ}`,
      material: `/teacher/subjects/${subjectId}/materials/${item.id}/edit`,
    }
    const p = paths[item.item_type]
    if (p) navigate(p)
  }

  const handleDeleteWork = (item) => {
    setDeleteTarget({ kind: 'work', data: item })
  }

  const deleteModalCopy = (() => {
    if (!deleteTarget) return { title: '', message: '' }
    if (deleteTarget.kind === 'topic') {
      return {
        title: 'Delete Topic',
        message:
          'Are you sure you want to delete this topic? Items will move to Unassigned. This action cannot be undone.',
      }
    }
    if (deleteTarget.kind === 'lesson') {
      return {
        title: 'Delete Lesson',
        message: 'Are you sure you want to delete this lesson? This action cannot be undone.',
      }
    }
    const labels = {
      assignment: 'Assignment',
      activity: 'Activity',
      quiz: 'Quiz',
      material: 'Material',
      syllabus: 'Syllabus',
    }
    const label = labels[deleteTarget.data?.item_type] || 'Item'
    return {
      title: `Delete ${label}`,
      message: `Are you sure you want to delete this ${label.toLowerCase()}? This action cannot be undone.`,
    }
  })()

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      if (deleteTarget.kind === 'topic') {
        await deleteSubjectTopic(subjectId, deleteTarget.data.id)
        toast.success('Topic deleted.')
      } else if (deleteTarget.kind === 'lesson') {
        await deleteSubjectLesson(subjectId, deleteTarget.data.id)
        toast.success('Lesson deleted.')
      } else if (deleteTarget.kind === 'work') {
        const item = deleteTarget.data
        if (item.item_type === 'syllabus' || item.is_syllabus) {
          await deleteSubjectSyllabus(subjectId)
          toast.success('Syllabus removed.')
        } else if (item.item_type === 'assignment') await deleteTeacherAssignment(item.id)
        else if (item.item_type === 'activity') await deleteTeacherActivity(item.id)
        else if (item.item_type === 'quiz') await deleteTeacherQuiz(item.id)
        else if (item.item_type === 'material') await deleteTeacherMaterial(item.id)
        else {
          toast.error('Unsupported item type.')
          return
        }
        toast.success('Item deleted.')
      }
      setDeleteTarget(null)
      await load()
    } catch (e) {
      toast.error(String(e?.message || 'Could not delete item.'))
    } finally {
      setDeleting(false)
    }
  }

  const clearDragState = () => {
    draggedItemRef.current = null
    draggedTopicRef.current = null
    dragKindRef.current = null
    setDragOverTopicId(null)
    setDragOverItemKey(null)
  }

  const handleTopicDragStart = (e, topic) => {
    if (topic.id === 'uncategorized') return
    draggedTopicRef.current = topic.id
    dragKindRef.current = 'topic'
    const payload = topicDragPayload(topic)
    e.dataTransfer.setData('text/plain', encodeTopicDragPlain(topic))
    e.dataTransfer.setData('application/x-classwork-topic', payload)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleTopicDragOver = (e, topic) => {
    if (!dragKindRef.current) return
    e.preventDefault()
    setDragOverTopicId(topic.id)
    if (dragKindRef.current === 'item') {
      setDragOverItemKey(`${topic.id}:0`)
    }
  }

  const handleTopicDrop = async (e, targetTopic) => {
    e.preventDefault()
    const dragData = readDragDataFromEvent(e)
    const draggedId =
      dragData?.kind === 'topic' ? dragData.payload.topicId : draggedTopicRef.current
    if (!draggedId || targetTopic.id === 'uncategorized' || draggedId === targetTopic.id) {
      clearDragState()
      return
    }
    topicsSnapshotRef.current = topics
    const next = reorderTopicList(topics, draggedId, targetTopic.id)
    setTopics(next)
    clearDragState()
    try {
      const ids = next.filter((t) => t.id !== 'uncategorized').map((t) => t.id)
      await reorderSubjectTopics(subjectId, ids)
    } catch (err) {
      setTopics(topicsSnapshotRef.current)
      toast.error(String(err?.message || 'Could not reorder topics.'))
    }
  }

  const handleItemDragStart = (e, entry, sourceTopicId) => {
    if (entry.kind === 'work' && (entry.data?.is_syllabus || entry.data?.is_locked)) return
    const payload = entryDragPayload(entry)
    draggedItemRef.current = { ...payload, sourceTopicId, entry }
    dragKindRef.current = 'item'
    const json = JSON.stringify(payload)
    e.dataTransfer.setData('text/plain', encodeItemDragPlain(payload))
    e.dataTransfer.setData('application/x-classwork-item', json)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleItemDragOver = (e, topicId, index) => {
    e.preventDefault()
    setDragOverTopicId(topicId)
    setDragOverItemKey(`${topicId}:${index}`)
  }

  const handleItemDrop = async (e, targetTopicId, targetIndex) => {
    e.preventDefault()
    e.stopPropagation()
    const dragData = readDragDataFromEvent(e)
    const payload = dragData?.kind === 'item' ? dragData.payload : draggedItemRef.current
    if (!payload) {
      clearDragState()
      return
    }
    const found = findEntryInTopics(topics, payload)
    if (!found) {
      clearDragState()
      return
    }
    const { topic: sourceTopic, entry } = found
    topicsSnapshotRef.current = topics

    let nextTopics = topics.map((t) => ({ ...t }))
    if (sourceTopic.id === targetTopicId) {
      const reordered = moveEntryInTopic(sourceTopic, payload, targetIndex)
      const updated = applyEntryOrderToTopic(sourceTopic, reordered)
      nextTopics = nextTopics.map((t) => (t.id === sourceTopic.id ? updated : t))
      setTopics(nextTopics)
      clearDragState()
      try {
        await persistTopicEntryOrders(subjectId, updated)
      } catch (err) {
        setTopics(topicsSnapshotRef.current)
        toast.error(String(err?.message || 'Could not reorder item.'))
      }
      return
    }

    const sourceWithout = removeEntryFromTopic(sourceTopic, payload)
    nextTopics = nextTopics.map((t) => (t.id === sourceTopic.id ? sourceWithout : t))
    const targetTopic = nextTopics.find((t) => t.id === targetTopicId)
    if (!targetTopic) {
      clearDragState()
      return
    }
    const targetWith = insertEntryIntoTopic(targetTopic, payload, entry.data, targetIndex)
    nextTopics = nextTopics.map((t) => (t.id === targetTopicId ? targetWith : t))
    setTopics(nextTopics)
    clearDragState()
    try {
      await moveClassworkEntry(subjectId, {
        itemType: payload.itemType,
        itemId: payload.itemId,
        topicId: targetTopicId,
        moduleOrder: targetIndex,
      })
      await persistTopicEntryOrders(subjectId, sourceWithout)
      await persistTopicEntryOrders(subjectId, targetWith)
    } catch (err) {
      setTopics(topicsSnapshotRef.current)
      toast.error(String(err?.message || 'Could not move item.'))
    }
  }

  const handleSyllabusUpload = async (file) => {
    if (!file) return
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Syllabus must be a PDF file.')
      return
    }
    setUploadingSyllabus(true)
    try {
      await uploadSubjectSyllabus(subjectId, file, subject)
      toast.success('Syllabus uploaded to Unassigned.')
      await onSyllabusUpdated?.()
      await load()
    } catch (e) {
      toast.error(String(e?.message || 'Could not upload syllabus.'))
    } finally {
      setUploadingSyllabus(false)
    }
  }

  if (loading) {
    return <p className="px-4 py-8 text-sm text-neutral-500">Loading classwork…</p>
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium"
            disabled={uploadingSyllabus}
            onClick={() => syllabusInputRef.current?.click()}
          >
            {uploadingSyllabus ? 'Uploading…' : '+ Add Syllabus'}
          </button>
          <input
            ref={syllabusInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="hidden"
            disabled={uploadingSyllabus}
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              void handleSyllabusUpload(file)
            }}
          />
          <button
            type="button"
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium"
            onClick={() => setTopicModal({ open: true, topic: null })}
          >
            + Add topic
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs"
            onClick={() => navigate(lessonNewPath(realTopics[0]?.id))}
          >
            + Add lesson
          </button>
          <Link to={`/teacher/assignments/new?${q()}`} className="rounded-md bg-[#185FA5] px-3 py-1.5 text-xs font-medium text-white">
            + Assignment
          </Link>
          <Link to={`/teacher/activities/new?${q()}`} className="rounded-md bg-[#185FA5] px-3 py-1.5 text-xs font-medium text-white">
            + Activity
          </Link>
          <Link to={`/teacher/quizzes/new?${q()}`} className="rounded-md bg-[#185FA5] px-3 py-1.5 text-xs font-medium text-white">
            + Quiz
          </Link>
        </div>
      </div>

      {topics.length === 0 ? (
        <p className="px-4 py-8 text-sm text-neutral-500">No topics yet. Add a topic to organize lessons and work.</p>
      ) : null}

      {topics.map((topic) => (
        <TopicGroup
          key={topic.id}
          topic={topic}
          subjectId={subjectId}
          editable
          collapsed={Boolean(collapsed[topic.id])}
          buildQuery={buildQuery}
          onToggle={() => setCollapsed((p) => ({ ...p, [topic.id]: !p[topic.id] }))}
          onEditTopic={(t) => setTopicModal({ open: true, topic: t })}
          onDeleteTopic={handleDeleteTopic}
          onEditLesson={(lesson) =>
            navigate(`/teacher/subjects/${encodeURIComponent(subjectId)}/lessons/${encodeURIComponent(lesson.id)}/edit`)
          }
          onDeleteLesson={handleDeleteLesson}
          onEditWork={handleEditWork}
          onDeleteWork={handleDeleteWork}
          onTopicDragStart={handleTopicDragStart}
          onTopicDragEnd={clearDragState}
          onTopicDragOver={handleTopicDragOver}
          onTopicDrop={handleTopicDrop}
          onItemDragStart={handleItemDragStart}
          onItemDragEnd={clearDragState}
          onItemDragOver={handleItemDragOver}
          onItemDrop={handleItemDrop}
          dragOverTopicId={dragOverTopicId}
          dragOverItemKey={dragOverItemKey}
          topicDraggable
        />
      ))}

      <TopicFormModal
        open={topicModal.open}
        initial={topicModal.topic}
        saving={savingTopic}
        onClose={() => setTopicModal({ open: false, topic: null })}
        onSave={handleSaveTopic}
      />

      <DeleteConfirmModal
        open={Boolean(deleteTarget)}
        title={deleteModalCopy.title}
        message={deleteModalCopy.message}
        deleting={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
      />
    </div>
  )
}
