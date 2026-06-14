import { useCallback, useEffect, useState } from 'react'
import { fetchSubjectTopics } from '../../../../lib/teacherSubjectCurriculum.js'
import { useFacultyNotify } from '../../../../lib/facultyNotify.js'
import TopicGroup from '../shared/TopicGroup.jsx'
import LessonClassroomView from '../shared/LessonClassroomView.jsx'

export default function SubjectModulesTab({ subjectId, subject }) {
  const toast = useFacultyNotify()
  const [topics, setTopics] = useState([])
  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState({})
  const [selectedLesson, setSelectedLesson] = useState(null)

  const authorName = String(subject?.faculty_name || subject?.assignedFacultyName || '').trim()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchSubjectTopics(subjectId)
      setTopics(data)
      setCollapsed((prev) => {
        const next = { ...prev }
        for (const t of data) {
          if (next[t.id] === undefined) next[t.id] = false
        }
        return next
      })
    } catch (e) {
      toast.error(String(e?.message || 'Could not load modules.'))
      setTopics([])
    } finally {
      setLoading(false)
    }
  }, [subjectId, toast])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) {
    return <p className="px-4 py-8 text-sm text-neutral-500">Loading modules…</p>
  }

  if (selectedLesson) {
    return (
      <LessonClassroomView
        lesson={selectedLesson}
        authorName={authorName}
        subjectId={subjectId}
        role="teacher"
        onBack={() => setSelectedLesson(null)}
      />
    )
  }

  if (topics.length === 0) {
    return <p className="px-4 py-8 text-sm text-neutral-500">No topics posted yet.</p>
  }

  return (
    <div>
      {topics.map((topic) => (
        <TopicGroup
          key={topic.id}
          topic={topic}
          subjectId={subjectId}
          role="teacher"
          collapsed={Boolean(collapsed[topic.id])}
          onToggle={() => setCollapsed((p) => ({ ...p, [topic.id]: !p[topic.id] }))}
          onViewLesson={(lesson) => setSelectedLesson(lesson)}
        />
      ))}
    </div>
  )
}
