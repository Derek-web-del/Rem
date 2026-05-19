import { useOutletContext } from 'react-router-dom'
import TeacherStudyMaterialForm from './TeacherStudyMaterialForm.jsx'

export default function TeacherAddMaterial() {
  const { logoutToPortal, setSidebarNavLocked } = useOutletContext() || {}
  return (
    <TeacherStudyMaterialForm mode="add" logoutToPortal={logoutToPortal} setSidebarNavLocked={setSidebarNavLocked} />
  )
}
