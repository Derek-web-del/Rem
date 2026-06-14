import { useOutletContext, useParams } from 'react-router-dom'
import { ACTIVITY_WORK_CONFIG } from '../../lib/studentWork.js'
import StudentWorkView from './StudentWorkView.jsx'

export default function StudentActivityView() {
  const { id } = useParams()
  const { logoutToPortal } = useOutletContext() || {}
  return (
    <StudentWorkView
      config={{ ...ACTIVITY_WORK_CONFIG, itemId: id }}
      logoutToPortal={logoutToPortal}
    />
  )
}
