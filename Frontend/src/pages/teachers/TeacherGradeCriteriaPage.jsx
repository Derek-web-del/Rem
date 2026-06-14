import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

/** Redirect legacy grade-criteria route to subject Grades tab. */
export default function TeacherGradeCriteriaPage() {
  const { subjectId } = useParams()
  const navigate = useNavigate()

  useEffect(() => {
    navigate(`/teacher/subjects/${encodeURIComponent(subjectId)}?tab=grades`, { replace: true })
  }, [navigate, subjectId])

  return null
}
