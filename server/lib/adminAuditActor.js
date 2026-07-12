import { fetchAuthUsersByIds } from '../api/logs.js'

export async function resolveAdminAuditActor(adminSession) {
  const user = adminSession?.user ?? adminSession?.data?.user ?? {}
  const actorId = String(user.id || '').trim()
  let actorName = String(user.name || '').trim()
  let actorEmail = String(user.email || '').trim()

  if (actorId && (!actorName || !actorEmail)) {
    try {
      const usersById = await fetchAuthUsersByIds([actorId])
      const profile = usersById.get(actorId)
      if (profile) {
        if (!actorName) actorName = String(profile.name || '').trim()
        if (!actorEmail) actorEmail = String(profile.email || '').trim()
      }
    } catch {
      /* non-fatal */
    }
  }

  return {
    actorId,
    actorName: actorName || 'Administrator',
    actorEmail,
  }
}
