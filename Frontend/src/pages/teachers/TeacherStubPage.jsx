import { useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'
import TeacherBackButton from './TeacherBackButton.jsx'
import TeacherMainHeader from './TeacherMainHeader.jsx'

export default function TeacherStubPage({ pageTitle }) {
  const { logoutToPortal, setSidebarNavLocked } = useOutletContext()

  useEffect(() => {
    setSidebarNavLocked?.(false)
  }, [setSidebarNavLocked])

  return (
    <>
      <TeacherMainHeader pageTitle={pageTitle || 'Teacher'} onLogout={logoutToPortal} />
      <main className="min-h-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden p-4 md:p-8">
        <TeacherBackButton to="/teacher/dashboard" />
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">VIEW</p>
          <h2 className="text-xl font-bold text-neutral-900 md:text-2xl">{pageTitle || 'Teacher'}</h2>
        </div>
        <p className="text-sm font-medium text-neutral-600">
          This section is coming soon. Use the sidebar to return to the dashboard.
        </p>
      </main>
    </>
  )
}
