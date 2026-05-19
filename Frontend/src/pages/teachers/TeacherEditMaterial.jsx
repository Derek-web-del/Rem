import { useOutletContext } from 'react-router-dom'
import TeacherStudyMaterialForm from './TeacherStudyMaterialForm.jsx'

export default function TeacherEditMaterial() {
  const { logoutToPortal, setSidebarNavLocked } = useOutletContext() || {}
  return (
    <TeacherStudyMaterialForm mode="edit" logoutToPortal={logoutToPortal} setSidebarNavLocked={setSidebarNavLocked} />
  )
}
