const TEACHER_TABS = [
  { id: 'modules', label: 'Modules' },
  { id: 'classwork', label: 'Classwork' },
  { id: 'grades', label: 'Grades' },
]

export default function SubjectDetailTabs({ activeTab, onChange, showClasswork = true, showGrades = true }) {
  const tabs = TEACHER_TABS.filter((t) => {
    if (t.id === 'classwork') return showClasswork
    if (t.id === 'grades') return showGrades
    return true
  })

  return (
    <div className="flex border-b border-neutral-200 bg-white">
      {tabs.map((tab) => {
        const active = activeTab === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`border-b-2 px-5 py-2.5 text-sm transition-colors ${
              active
                ? 'border-[#185FA5] font-medium text-[#185FA5]'
                : 'border-transparent text-neutral-500 hover:text-neutral-800'
            }`}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
