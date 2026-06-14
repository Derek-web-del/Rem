import { useCallback, useEffect, useState } from 'react'

function readStoredCollapsed(storageKey) {
  if (!storageKey) return false
  try {
    const raw = localStorage.getItem(storageKey)
    return raw === '1' || raw === 'true'
  } catch {
    return false
  }
}

function writeStoredCollapsed(storageKey, collapsed) {
  if (!storageKey) return
  try {
    localStorage.setItem(storageKey, collapsed ? '1' : '0')
  } catch {
    /* private browsing */
  }
}

/**
 * Persisted sidebar minimize state per portal (student / teacher / admin).
 * @param {string} storageKey
 */
export function useSidebarCollapsed(storageKey) {
  const [collapsed, setCollapsedState] = useState(() => readStoredCollapsed(storageKey))

  useEffect(() => {
    writeStoredCollapsed(storageKey, collapsed)
  }, [storageKey, collapsed])

  const setCollapsed = useCallback((value) => {
    setCollapsedState(Boolean(value))
  }, [])

  const toggleCollapsed = useCallback(() => {
    setCollapsedState((prev) => !prev)
  }, [])

  return { collapsed, toggleCollapsed, setCollapsed }
}

export const SIDEBAR_COLLAPSED_KEYS = {
  student: 'lenlearn.sidebar.collapsed.student',
  teacher: 'lenlearn.sidebar.collapsed.teacher',
  admin: 'lenlearn.sidebar.collapsed.admin',
}
