/**
 * Test-only OTP capture for integration tests.
 *
 * Enabled by setting:
 *   NODE_ENV=test
 *   AUTH_TEST_CAPTURE_OTP=1
 *
 * This avoids requiring SMTP in CI/local test runs.
 */

const store = new Map()

export function captureOtp(to, otp) {
  store.set(String(to || '').toLowerCase(), String(otp || ''))
}

export function getLastOtp(to) {
  return store.get(String(to || '').toLowerCase()) || null
}

export function resetOtps() {
  store.clear()
}

