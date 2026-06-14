import { SIDEBAR_GOLD, SIDEBAR_GOLD_DARK } from '../pages/teachers/instituteChrome.js'

/**
 * Shared aside wrapper: width transition + minimize/expand toggle.
 */
export default function PortalSidebarShell({
  collapsed = false,
  onToggle,
  sidebarGold = SIDEBAR_GOLD,
  sidebarGoldDark = SIDEBAR_GOLD_DARK,
  header,
  children,
  footer,
}) {
  return (
    <aside
      className={`flex h-full min-h-0 shrink-0 flex-col overflow-hidden text-white transition-[width] duration-200 ease-in-out ${
        collapsed ? 'w-14' : 'w-56 md:w-60'
      }`}
      style={{
        background: `linear-gradient(180deg, ${sidebarGold} 0%, ${sidebarGoldDark} 100%)`,
      }}
      aria-expanded={!collapsed}
    >
      {header}

      <div
        className={`flex shrink-0 items-center border-b border-white/15 ${
          collapsed ? 'justify-center px-1 py-2' : 'justify-end px-2 py-1.5'
        }`}
      >
        <button
          type="button"
          onClick={onToggle}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-white/90 transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          aria-label={collapsed ? 'Expand sidebar' : 'Minimize sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Minimize sidebar'}
        >
          <i
            className={`ti ${collapsed ? 'ti-chevrons-right' : 'ti-chevrons-left'}`}
            style={{ fontSize: '18px' }}
            aria-hidden="true"
          />
        </button>
      </div>

      {children}

      {footer}
    </aside>
  )
}
