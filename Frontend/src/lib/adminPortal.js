import apiFetch from './apiClient.js'
import { apiUrl } from './lmsStateStorage.js'

export async function fetchAdminTermsStatus() {
  const res = await apiFetch(apiUrl('/api/v1/admin/terms-status'), { softAuth: true })
  const data = await res.json().catch(() => ({}))
  return {
    accepted: data.accepted === true,
    acceptedAt: data.accepted_at ?? null,
  }
}

export async function acceptAdminTerms() {
  const res = await apiFetch(apiUrl('/api/v1/admin/accept-terms'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  return res.json().catch(() => ({}))
}
