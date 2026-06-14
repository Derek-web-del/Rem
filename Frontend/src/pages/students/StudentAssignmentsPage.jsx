import { useOutletContext } from 'react-router-dom'
import { fetchStudentAssignments } from '../../lib/studentPortal.js'
import { ASSIGNMENT_WORK_CONFIG } from '../../lib/studentWork.js'
import StudentWorkList from './StudentWorkList.jsx'

export default function StudentAssignmentsPage() {
  const { logoutToPortal } = useOutletContext() || {}
  return (
    <StudentWorkList
      config={ASSIGNMENT_WORK_CONFIG}
      fetchList={fetchStudentAssignments}
      logoutToPortal={logoutToPortal}
      backTo="/student/dashboard"
    />
  )
}
