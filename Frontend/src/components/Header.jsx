import GlendaleLogo from '../assets/GlendaleLogo.png'

export default function Header() {
  return (
    <header className="flex w-full shrink-0 items-center justify-center border-b border-white/20 px-4 py-5 md:px-5">
      <div className="flex w-full flex-col items-center justify-center gap-1.5">
        <img
          src={GlendaleLogo}
          alt="Glendale School logo"
          className="h-12 w-12 shrink-0 object-contain"
        />
        <h1 className="text-sm font-medium tracking-wide text-white">Glendale School</h1>
      </div>
    </header>
  )
}
