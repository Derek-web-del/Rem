/** Per-login-session terms acceptance (cleared on logout). */
const TERMS_KEY = 'terms_accepted'
const TERMS_EVENT = 'lenlearn:terms-accepted-changed'

function notifyTermsChanged() {
  try {
    window.dispatchEvent(new Event(TERMS_EVENT))
  } catch {
    /* ignore */
  }
}

export const isTermsAccepted = () => {
  try {
    return sessionStorage.getItem(TERMS_KEY) === 'true'
  } catch {
    return false
  }
}

export const setTermsAccepted = () => {
  try {
    sessionStorage.setItem(TERMS_KEY, 'true')
    notifyTermsChanged()
  } catch {
    /* ignore */
  }
}

export const clearTermsAcceptance = () => {
  try {
    sessionStorage.removeItem(TERMS_KEY)
    notifyTermsChanged()
  } catch {
    /* ignore */
  }
}

export function subscribeTermsAccepted(onStoreChange) {
  window.addEventListener(TERMS_EVENT, onStoreChange)
  window.addEventListener('storage', onStoreChange)
  return () => {
    window.removeEventListener(TERMS_EVENT, onStoreChange)
    window.removeEventListener('storage', onStoreChange)
  }
}
