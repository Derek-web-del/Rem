export default function AdminMainHeader({ pageTitle = 'Dashboard', portalLabel = 'ADMIN' }) {
  return (
    <header className="flex shrink-0 flex-wrap items-start justify-between gap-4 border-b border-neutral-200/80 bg-neutral-50/80 px-4 py-4 backdrop-blur-sm md:px-8 md:py-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{portalLabel}</p>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-neutral-900 md:text-3xl">
          {pageTitle}
        </h1>
      </div>
    </header>
  )
}
