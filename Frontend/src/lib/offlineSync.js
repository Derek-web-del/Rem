import { apiUrl } from './lmsStateStorage.js'
import { getPendingSyncItems, markAsSynced } from './indexedDB.js'

export function isOnline() {
  return typeof navigator !== 'undefined' ? navigator.onLine : true
}

async function postQuizViolations(quizId, violations) {
  if (!Array.isArray(violations) || violations.length === 0) return true
  try {
    const res = await fetch(
      apiUrl(`/api/v1/student/quizzes/${encodeURIComponent(String(quizId))}/violations`),
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ violations }),
      },
    )
    return res.ok
  } catch (e) {
    console.warn('[offlineSync] quiz violations failed:', e?.message || e)
    return false
  }
}

export async function syncPendingQuizSubmissions() {
  const pending = await getPendingSyncItems()
  const quizItems = pending.filter((p) => p.type === 'quiz_submit')
  let synced = 0

  for (const item of quizItems) {
    try {
      const res = await fetch(
        apiUrl(`/api/v1/student/quizzes/${encodeURIComponent(String(item.quizId))}/submit`),
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            answers: item.answers,
            time_spent_seconds: item.time_spent_seconds,
          }),
        },
      )
      if (res.ok) {
        await postQuizViolations(item.quizId, item.violations)
        await markAsSynced(item.id)
        synced += 1
      }
    } catch (e) {
      console.warn('[offlineSync] quiz submit failed:', e?.message || e)
    }
  }

  return synced
}

export async function registerBackgroundSync() {
  if (!('serviceWorker' in navigator)) return false
  try {
    const reg = await navigator.serviceWorker.ready
    if ('sync' in reg) {
      await reg.sync.register('sync-quiz-data')
      return true
    }
  } catch {
    /* Background Sync unsupported */
  }
  return false
}

export function setupOnlineSyncHandler(onSynced) {
  if (typeof window === 'undefined') return () => {}

  const handler = async () => {
    const usedBg = await registerBackgroundSync()
    if (!usedBg) {
      const n = await syncPendingQuizSubmissions()
      if (n > 0 && onSynced) onSynced(n)
    }
  }

  window.addEventListener('online', handler)

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', async (ev) => {
      if (ev.data?.type === 'SYNC_QUIZ_DATA') {
        const n = await syncPendingQuizSubmissions()
        if (n > 0 && onSynced) onSynced(n)
      }
    })
  }

  return () => window.removeEventListener('online', handler)
}
