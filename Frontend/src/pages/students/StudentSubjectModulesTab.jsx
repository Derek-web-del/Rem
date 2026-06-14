import { useCallback, useEffect, useState } from 'react'
import OfflineCacheIndicator from '../../components/OfflineCacheIndicator.jsx'
import { fetchStudentSubjectStream } from '../../lib/studentSubjectStream.js'
import TopicGroup from '../teachers/subject-detail/shared/TopicGroup.jsx'
import LessonClassroomView from '../teachers/subject-detail/shared/LessonClassroomView.jsx'

export default function StudentSubjectModulesTab({ subjectId, subject }) {
  const [topics, setTopics] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [fromCache, setFromCache] = useState(false)
  const [collapsed, setCollapsed] = useState({})
  const [selectedLesson, setSelectedLesson] = useState(null)

  const authorName = String(subject?.faculty_name || subject?.assignedFacultyName || '').trim()

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setFromCache(false)
    try {
      const { data, fromCache: cached } = await fetchStudentSubjectStream(subjectId)
      setTopics(data)
      setFromCache(cached)
      setCollapsed((prev) => {
        const next = { ...prev }
        for (const t of data) {
          if (next[t.id] === undefined) next[t.id] = false
        }
        return next
      })
    } catch (e) {
      setError(String(e?.message || 'Could not load modules.'))
      setTopics([])
    } finally {
      setLoading(false)
    }
  }, [subjectId])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return <p className="px-4 py-8 text-sm text-neutral-500">Loading modules…</p>
  }

  if (error) {
    return <p className="px-4 py-8 text-sm text-red-600">{error}</p>
  }

  if (selectedLesson) {
    return (
      <LessonClassroomView
        lesson={selectedLesson}
        authorName={authorName}
        role="student"
        onBack={() => setSelectedLesson(null)}
      />
    )
  }

  if (topics.length === 0) {
    return <p className="px-4 py-8 text-sm text-neutral-500">No modules available yet.</p>
  }

  return (
    <div>
      <OfflineCacheIndicator fromCache={fromCache} className="px-4 pt-4" />
      {topics.map((topic) => (
        <TopicGroup
          key={topic.id}
          topic={topic}
          role="student"
          collapsed={Boolean(collapsed[topic.id])}
          onToggle={() => setCollapsed((p) => ({ ...p, [topic.id]: !p[topic.id] }))}
          onViewLesson={(lesson) => setSelectedLesson(lesson)}
        />
      ))}
    </div>
  )
}
