const DEDUP_MS = 500
const VIOLATION_TYPES = new Set(['fullscreen_exit', 'tab_switch'])

function lockNameForQuiz(quizId) {
  return `lenlearn-quiz-${String(quizId)}`
}

function getFullscreenElement() {
  return (
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement ||
    null
  )
}

function isContainerFullscreen(containerEl) {
  const fs = getFullscreenElement()
  return fs === containerEl || (fs && containerEl?.contains(fs))
}

function requestContainerFullscreen(containerEl) {
  if (!containerEl) return Promise.reject(new Error('No container'))
  const req =
    containerEl.requestFullscreen ||
    containerEl.webkitRequestFullscreen ||
    containerEl.mozRequestFullScreen ||
    containerEl.msRequestFullscreen
  if (!req) return Promise.reject(new Error('Fullscreen not supported'))
  return Promise.resolve(req.call(containerEl))
}

/** Call synchronously from a user-gesture handler (before any await). */
export function requestQuizFullscreenSync(el) {
  const target = el || document.documentElement
  const req =
    target.requestFullscreen ||
    target.webkitRequestFullscreen ||
    target.mozRequestFullScreen ||
    target.msRequestFullscreen
  if (req) void Promise.resolve(req.call(target)).catch(() => {})
}

async function enterContainerFullscreen(containerEl) {
  if (!containerEl) return false

  const fs = getFullscreenElement()
  if (fs === containerEl || (fs && containerEl.contains(fs))) {
    return true
  }

  if (fs) {
    return true
  }

  try {
    await requestContainerFullscreen(containerEl)
    return true
  } catch {
    return false
  }
}

function buildGuard({
  containerEl,
  getQuestionNumber,
  onViolation,
  onVisibilityHidden,
  onLockChange,
  releaseLock,
}) {
  const violations = []
  let destroyed = false
  let hasEnteredFullscreen = false
  let monitoringActive = true
  let sessionLocked = false
  let lastViolationAt = 0
  let fsSuppressUntil = 0
  let intersectionObserver = null
  let visibleQuestionNum = 1

  function resolveQuestionNumber() {
    if (typeof getQuestionNumber === 'function') {
      const n = getQuestionNumber()
      if (Number.isFinite(n) && n > 0) return Math.floor(n)
    }
    return visibleQuestionNum > 0 ? visibleQuestionNum : 1
  }

  function getViolationCounts() {
    let tab_switch = 0
    let fullscreen_exit = 0
    for (const v of violations) {
      if (v.type === 'tab_switch') tab_switch += 1
      else if (v.type === 'fullscreen_exit') fullscreen_exit += 1
    }
    return { tab_switch, fullscreen_exit, total: violations.length }
  }

  function setSessionLocked(locked) {
    if (sessionLocked === locked) return
    sessionLocked = locked
    if (typeof onLockChange === 'function') {
      onLockChange({ locked, violations: [...violations], counts: getViolationCounts() })
    }
  }

  function tryReleaseLockAfterFullscreen() {
    if (isContainerFullscreen(containerEl) || getFullscreenElement()) {
      setSessionLocked(false)
    }
  }

  function recordViolation(type) {
    if (destroyed || !monitoringActive) return
    if (!VIOLATION_TYPES.has(type)) return

    const now = Date.now()
    if (now - lastViolationAt < DEDUP_MS) return
    lastViolationAt = now

    const entry = {
      type,
      timestamp: new Date(now).toISOString(),
      question_number: resolveQuestionNumber(),
    }
    violations.push(entry)
    if (typeof onViolation === 'function') onViolation(entry)
  }

  function onFullscreenChange() {
    if (destroyed || !monitoringActive) return
    if (Date.now() < fsSuppressUntil) return
    if (document.visibilityState === 'hidden') return

    const fs = getFullscreenElement()
    if (fs) {
      hasEnteredFullscreen = true
      tryReleaseLockAfterFullscreen()
      return
    }

    if (!hasEnteredFullscreen) return
    if (!isContainerFullscreen(containerEl) && !fs) {
      recordViolation('fullscreen_exit')
      setSessionLocked(true)
    }
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      if (typeof onVisibilityHidden === 'function') onVisibilityHidden()
      if (monitoringActive) {
        recordViolation('tab_switch')
        setSessionLocked(true)
      }
      return
    }

    if (sessionLocked) {
      void tryEnterFullscreen().then((ok) => {
        if (ok) tryReleaseLockAfterFullscreen()
      })
    }
  }

  function onWindowBlur() {
    if (destroyed || !monitoringActive) return
    if (document.visibilityState !== 'visible') return
    recordViolation('tab_switch')
    setSessionLocked(true)
  }

  function onKeyDown(e) {
    if (destroyed || !monitoringActive) return

    const key = e.key
    if (key === 'F11') {
      e.preventDefault()
      return
    }
    if (key === 'Escape' && hasEnteredFullscreen) {
      e.preventDefault()
      return
    }
    if (key === 'Tab' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
    }
  }

  function setupQuestionObserver() {
    if (!containerEl || typeof IntersectionObserver === 'undefined') return

    const articles = containerEl.querySelectorAll('[data-question-num]')
    if (!articles.length) return

    const ratios = new Map()

    intersectionObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const num = Number(entry.target.getAttribute('data-question-num'))
          if (Number.isFinite(num) && num > 0) {
            ratios.set(num, entry.intersectionRatio)
          }
        }
        let bestNum = visibleQuestionNum
        let bestRatio = 0
        for (const [num, ratio] of ratios) {
          if (ratio > bestRatio) {
            bestRatio = ratio
            bestNum = num
          }
        }
        if (bestRatio > 0) visibleQuestionNum = bestNum
      },
      { root: null, threshold: [0, 0.25, 0.5, 0.75, 1] },
    )

    for (const article of articles) {
      intersectionObserver.observe(article)
    }
  }

  function attachListeners() {
    document.addEventListener('fullscreenchange', onFullscreenChange)
    document.addEventListener('webkitfullscreenchange', onFullscreenChange)
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('blur', onWindowBlur)
    window.addEventListener('keydown', onKeyDown, true)
    requestAnimationFrame(() => {
      if (!destroyed) setupQuestionObserver()
    })
  }

  function detachListeners() {
    document.removeEventListener('fullscreenchange', onFullscreenChange)
    document.removeEventListener('webkitfullscreenchange', onFullscreenChange)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('blur', onWindowBlur)
    window.removeEventListener('keydown', onKeyDown, true)
    if (intersectionObserver) {
      intersectionObserver.disconnect()
      intersectionObserver = null
    }
  }

  async function tryEnterFullscreen() {
    if (destroyed || !containerEl) return false
    const ok = await enterContainerFullscreen(containerEl)
    if (ok) {
      hasEnteredFullscreen = true
      fsSuppressUntil = Date.now() + 300
      tryReleaseLockAfterFullscreen()
    }
    return ok
  }

  attachListeners()

  void tryEnterFullscreen()

  function destroy() {
    if (destroyed) return
    destroyed = true
    monitoringActive = false
    detachListeners()
    if (typeof releaseLock === 'function') releaseLock()
    if (isContainerFullscreen(containerEl)) {
      const exit =
        document.exitFullscreen ||
        document.webkitExitFullscreen ||
        document.mozCancelFullScreen ||
        document.msExitFullscreen
      if (exit) {
        void Promise.resolve(exit.call(document)).catch(() => {})
      }
    }
  }

  return {
    destroy,
    getViolations: () => [...violations],
    getViolationCounts,
    isLocked: () => sessionLocked,
    resumeFullscreen: () => tryEnterFullscreen(),
    requestFullscreenEntry: async () => tryEnterFullscreen(),
    needsFullscreenEntry: () => !hasEnteredFullscreen && !destroyed,
  }
}

function buildGuardWithoutLock(options) {
  const guard = buildGuard({ ...options, releaseLock: () => {} })
  return {
    blocked: false,
    releaseLock: () => guard.destroy(),
    ...guard,
  }
}

/**
 * Acquire an exclusive Web Lock and start quiz session monitoring.
 * Resolves with { blocked: true } if another tab holds the lock,
 * or { blocked: false, releaseLock, destroy, getViolations, ... }.
 */
export function createQuizSessionGuard({
  quizId,
  containerEl,
  getQuestionNumber,
  onViolation,
  onVisibilityHidden,
  onLockChange,
  onLockAcquired,
}) {
  if (!containerEl) {
    return Promise.resolve(
      buildGuardWithoutLock({ containerEl, getQuestionNumber, onViolation, onVisibilityHidden, onLockChange }),
    )
  }

  const name = lockNameForQuiz(quizId)

  if (!navigator.locks?.request) {
    console.warn('[quizSessionGuard] Web Locks API unavailable — multi-tab protection disabled.')
    return Promise.resolve(
      buildGuardWithoutLock({ containerEl, getQuestionNumber, onViolation, onVisibilityHidden, onLockChange }),
    )
  }

  return new Promise((resolve) => {
    navigator.locks.request(name, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
      if (!lock) {
        resolve({ blocked: true })
        return
      }

      let releaseLock = null
      const holdPromise = new Promise((resolveHold) => {
        releaseLock = () => {
          resolveHold()
        }
      })

      if (typeof onLockAcquired === 'function') {
        onLockAcquired(releaseLock)
      }

      const guard = buildGuard({
        containerEl,
        getQuestionNumber,
        onViolation,
        onVisibilityHidden,
        onLockChange,
        releaseLock,
      })

      resolve({ blocked: false, releaseLock, ...guard })
      await holdPromise
    })
  })
}
