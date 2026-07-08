import { useEffect, useState } from 'react'
import { apiUrl } from '../../lib/lmsStateStorage.js'
import { FacultyAccessBadge } from '../../components/PortalAccessBadge.jsx'

export default function TeacherPortalAccessBar() {
  const [advisoryLabel, setAdvisoryLabel] = useState('')
  const [facultyCode, setFacultyCode] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [profRes, advRes] = await Promise.all([
          fetch(apiUrl('/api/teacher/profile'), { credentials: 'include' }),
          fetch(apiUrl('/api/teacher/advisory-sections'), { credentials: 'include' }),
        ])
        const prof = profRes.ok ? await profRes.json().catch(() => ({})) : {}
        const adv = advRes.ok ? await advRes.json().catch(() => []) : []
        if (cancelled) return
        const code =
          String(prof?.faculty_code || prof?.facultyCode || prof?.employee_id || '').trim() ||
          String(prof?.faculty_username || '').trim()
        setFacultyCode(code)
        const sections = Array.isArray(adv) ? adv : Array.isArray(adv?.sections) ? adv.sections : []
        const labels = sections
          .slice(0, 2)
          .map((s) => {
            const grade = String(s?.grade_level || '').trim()
            const name = String(s?.name || '').trim()
            return [grade, name].filter(Boolean).join(' — ')
          })
          .filter(Boolean)
        if (labels.length) {
          setAdvisoryLabel(labels.join('; ') + (sections.length > 2 ? ` (+${sections.length - 2} more)` : ''))
        }
      } catch {
        /* optional banner */
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  return <FacultyAccessBadge advisoryLabel={advisoryLabel} facultyCode={facultyCode} />
}
