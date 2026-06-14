import { useOutletContext } from 'react-router-dom'
import { fetchStudentActivities } from '../../lib/studentPortal.js'
import { ACTIVITY_WORK_CONFIG } from '../../lib/studentWork.js'
import StudentWorkList from './StudentWorkList.jsx'

export default function StudentActivitiesPage() {
  const { logoutToPortal } = useOutletContext() || {}
  return (
    <StudentWorkList
      config={ACTIVITY_WORK_CONFIG}
      fetchList={fetchStudentActivities}
      logoutToPortal={logoutToPortal}
      backTo="/student/dashboard"
    />
  )
}
