import { useOutletContext, useParams } from 'react-router-dom'
import { ASSIGNMENT_WORK_CONFIG } from '../../lib/studentWork.js'
import StudentWorkView from './StudentWorkView.jsx'

export default function StudentAssignmentView() {
  const { id } = useParams()
  const { logoutToPortal } = useOutletContext() || {}
  return (
    <StudentWorkView
      config={{ ...ASSIGNMENT_WORK_CONFIG, itemId: id }}
      logoutToPortal={logoutToPortal}
    />
  )
}
