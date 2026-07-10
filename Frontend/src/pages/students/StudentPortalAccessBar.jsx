import { useEffect, useState } from 'react'
import { authClient } from '../../lib/auth-client.js'
import { apiUrl } from '../../lib/lmsStateStorage.js'
import { StudentAccessBadge } from '../../components/PortalAccessBadge.jsx'

export default function StudentPortalAccessBar() {
  const { data: sessionData } = authClient.useSession()
  const [gradeLabel, setGradeLabel] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(apiUrl('/api/v1/student/profile'), { credentials: 'include' })
        if (!res.ok) return
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        const grade = String(data?.grade_level ?? data?.grade ?? '').trim()
        const section = String(data?.section_name ?? data?.section ?? '').trim()
        const label = [grade, section].filter(Boolean).join(' — ')
        if (label) setGradeLabel(label)
      } catch {
        /* optional banner */
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [sessionData?.user?.id])

  return <StudentAccessBadge gradeLabel={gradeLabel} />
}
