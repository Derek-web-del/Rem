export default function LessonComposerSidebar({ subject, topics, topicId, onTopicChange }) {
  const subjectLabel = subject
    ? [subject.subject_code, subject.subject_name].filter(Boolean).join(' — ')
    : '—'

  const realTopics = (topics || []).filter((t) => t.id !== 'uncategorized')

  return (
    <aside className="space-y-5">
      <label className="block text-sm">
        <span className="mb-1 block text-xs font-medium text-neutral-500">For</span>
        <select
          className="w-full cursor-default rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-800"
          value="subject"
          disabled
        >
          <option value="subject">{subjectLabel}</option>
        </select>
      </label>

      <div className="block text-sm">
        <span className="mb-1 block text-xs font-medium text-neutral-500">Assign to</span>
        <div className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-sm text-neutral-700">
          <i className="ti ti-users text-base text-neutral-500" aria-hidden="true" />
          All students
        </div>
      </div>

      <label className="block text-sm">
        <span className="mb-1 block text-xs font-medium text-neutral-500">Topic</span>
        <select
          className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800"
          value={topicId}
          onChange={(e) => onTopicChange(e.target.value)}
        >
          <option value="">No topic</option>
          {realTopics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
      </label>
    </aside>
  )
}
