function initials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  const first = parts[0]?.[0] ?? '?'
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return String(first + last).toUpperCase()
}

const BANNER_BLUE = '#2a52a8'

function ProfileRow({ label, children }) {
  return (
    <div className="flex items-start justify-between gap-3 py-3">
      <span className="shrink-0 pt-0.5 text-sm font-bold text-neutral-900">{label}</span>
      <span className="min-w-0 max-w-[58%] flex-1 text-right text-sm font-medium leading-snug text-neutral-800 sm:max-w-[62%]">
        {children}
      </span>
    </div>
  )
}

export default function TeacherProfileCard({
  displayName,
  gradeLabel,
  roleLabel,
  photoDataUrl,
  facultyCode,
  qualification,
  contactNumber,
  email,
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm">
      <div
        className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:gap-6"
        style={{ backgroundColor: BANNER_BLUE }}
      >
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-lg border-2 border-white/40 bg-white/10 shadow-md">
          {photoDataUrl ? (
            <img src={photoDataUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-white">
              {initials(displayName)}
            </div>
          )}
        </div>
        <div className="min-w-0 text-white">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{displayName || '—'}</h2>
          {roleLabel ? <p className="sr-only">{roleLabel}</p> : null}
          <p className="mt-1 text-sm font-medium text-white/90">{gradeLabel || '—'}</p>
        </div>
      </div>

      <div className="grid border-t border-neutral-100 bg-white sm:grid-cols-2 sm:divide-x sm:divide-neutral-100">
        <div className="divide-y divide-neutral-100 px-5 sm:px-6">
          <ProfileRow label="Faculty Code">{facultyCode || '—'}</ProfileRow>
          <ProfileRow label="Faculty Qualification">{qualification || '—'}</ProfileRow>
        </div>
        <div className="divide-y divide-neutral-100 px-5 sm:px-6">
          <ProfileRow label="Faculty Contact No">{contactNumber || '—'}</ProfileRow>
          <ProfileRow label="Faculty Email Id">
            <span className="break-all">{email || '—'}</span>
          </ProfileRow>
        </div>
      </div>
    </div>
  )
}
