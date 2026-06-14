import { useOfflineStatus } from '../hooks/useOfflineStatus.js'

export default function OfflineGuardButton({
  children,
  disabled,
  title,
  offlineTitle = 'Not available offline',
  ...props
}) {
  const { isOffline } = useOfflineStatus()
  const blocked = isOffline || disabled

  return (
    <button
      type="button"
      {...props}
      disabled={blocked}
      title={blocked && isOffline ? offlineTitle : title}
    >
      {children}
    </button>
  )
}
