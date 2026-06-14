/** Main content shell matching InstituteDashboard.jsx terms panel layout. */
export default function PortalTermsMain({ children }) {
  return (
    <main className="min-h-0 flex-1 space-y-6 overflow-y-auto overflow-x-hidden p-4 md:space-y-8 md:p-8">
      <div className="mx-auto w-full max-w-4xl pb-8">{children}</div>
    </main>
  )
}
