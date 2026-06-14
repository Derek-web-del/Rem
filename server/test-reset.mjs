/**
 * Test-only password reset link capture for integration tests.
 *
 * Enabled by setting:
 *   NODE_ENV=test
 *   AUTH_TEST_CAPTURE_RESET=1
 */

const store = new Map()

export function captureResetUrl(to, url) {
  store.set(String(to || '').toLowerCase(), String(url || ''))
}

export function getLastResetUrl(to) {
  return store.get(String(to || '').toLowerCase()) || null
}

export function resetResetUrls() {
  store.clear()
}
