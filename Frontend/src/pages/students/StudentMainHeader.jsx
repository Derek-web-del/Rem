import { ACTION_BLUE } from '../teachers/instituteChrome.js'

export default function StudentMainHeader({ onLogout, pageTitle = 'Student Dashboard' }) {
  return (
    <header className="flex shrink-0 flex-wrap items-start justify-between gap-4 border-b border-neutral-200/80 bg-neutral-50/80 px-4 py-4 backdrop-blur-sm md:px-8 md:py-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">STUDENT</p>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-neutral-900 md:text-3xl">
          {pageTitle}
        </h1>
      </div>
      <button
        type="button"
        onClick={onLogout}
        className="rounded-lg px-5 py-2 text-sm font-semibold text-white shadow-md transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        style={{ backgroundColor: ACTION_BLUE }}
      >
        Logout
      </button>
    </header>
  )
}
