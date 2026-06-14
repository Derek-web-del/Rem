import { useCallback, useEffect, useState } from 'react'

import { fetchStudentSubjectStream } from '../../../../lib/studentSubjectStream.js'

import { fetchFacultySubjectStream } from '../../../../lib/teacherPortalOffline.js'

import { useFacultyNotify } from '../../../../lib/facultyNotify.js'

import TopicGroup from '../shared/TopicGroup.jsx'

import LessonViewerModal from '../shared/LessonViewerModal.jsx'

import OfflineCacheIndicator from '../../../../components/OfflineCacheIndicator.jsx'

import { resolveTeacherFileUrl } from '../../../../lib/teacherMedia.js'



export default function SubjectStreamTab({ subjectId, role = 'teacher' }) {

  const toast = useFacultyNotify()

  const [topics, setTopics] = useState([])

  const [loading, setLoading] = useState(true)

  const [fromCache, setFromCache] = useState(false)

  const [collapsed, setCollapsed] = useState({})

  const [lessonViewer, setLessonViewer] = useState(null)



  const load = useCallback(async () => {

    setLoading(true)

    try {

      const result =

        role === 'student'

          ? await fetchStudentSubjectStream(subjectId)

          : await fetchFacultySubjectStream(subjectId)

      const data = result.data

      setTopics(data)

      setFromCache(Boolean(result.fromCache))

      setCollapsed((prev) => {

        const next = { ...prev }

        for (const t of data) {

          if (next[t.id] === undefined) next[t.id] = false

        }

        return next

      })

    } catch (e) {

      toast.error(String(e?.message || 'Could not load stream.'))

      setTopics([])

    } finally {

      setLoading(false)

    }

  }, [subjectId, role, toast])



  useEffect(() => {

    void load()

  }, [load])



  const handleViewLesson = (lesson) => {

    if (lesson.link_url) {

      window.open(lesson.link_url, '_blank', 'noopener,noreferrer')

      if (lesson.description) {

        setLessonViewer({ lesson, fileUrl: null })

      }

      return

    }

    if (lesson.file_path) {

      setLessonViewer({

        lesson,

        fileUrl: resolveTeacherFileUrl(lesson.file_path),

      })

      return

    }

    if (lesson.description) {

      setLessonViewer({ lesson, fileUrl: null })

    }

  }



  if (loading) {

    return <p className="px-4 py-8 text-sm text-neutral-500">Loading stream…</p>

  }



  if (!topics.length) {

    return <p className="px-4 py-8 text-sm text-neutral-500">No classwork posted yet.</p>

  }



  return (

    <>

      <OfflineCacheIndicator fromCache={fromCache} className="px-4 pt-4" />

      <div>

        {topics.map((topic) => (

          <TopicGroup

            key={topic.id}

            topic={topic}

            role={role}

            collapsed={Boolean(collapsed[topic.id])}

            onToggle={() => setCollapsed((p) => ({ ...p, [topic.id]: !p[topic.id] }))}

            onViewLesson={handleViewLesson}

          />

        ))}

      </div>

      {lessonViewer ? (

        <LessonViewerModal

          lesson={lessonViewer.lesson}

          fileUrl={lessonViewer.fileUrl}

          onClose={() => setLessonViewer(null)}

        />

      ) : null}

    </>

  )

}


