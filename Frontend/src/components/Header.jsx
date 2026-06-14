import GlendaleLogo from '../assets/GlendaleLogo.png'

export default function Header({ collapsed = false }) {
  return (
    <header
      className={`flex w-full shrink-0 items-center justify-center border-b border-white/20 ${
        collapsed ? 'px-2 py-3' : 'px-4 py-5 md:px-5'
      }`}
    >
      <div
        className={`flex w-full flex-col items-center justify-center ${
          collapsed ? 'gap-0' : 'gap-1.5'
        }`}
      >
        <img
          src={GlendaleLogo}
          alt="Glendale School logo"
          className={`shrink-0 object-contain ${collapsed ? 'h-9 w-9' : 'h-12 w-12'}`}
        />
        {!collapsed ? (
          <h1 className="text-sm font-medium tracking-wide text-white">Glendale School</h1>
        ) : null}
      </div>
    </header>
  )
}
