function normStr(v) {
  if (v == null) return ''
  return String(v).trim()
}

function valuesDiffer(beforeVal, afterVal) {
  return normStr(beforeVal) !== normStr(afterVal)
}

function pushDiff(changedFields, label, oldVal, newVal) {
  const o = typeof oldVal === 'string' && oldVal.length > 120 ? `${oldVal.slice(0, 80)}…` : oldVal
  const n = typeof newVal === 'string' && newVal.length > 120 ? `${newVal.slice(0, 80)}…` : newVal
  changedFields[label] = { old: o ?? null, new: n ?? null }
}

function truncateMessage(msg, max = 120) {
  const s = normStr(msg)
  if (!s) return ''
  if (s.length <= max) return s
  return `${s.slice(0, max)}…`
}

function imageLabel(row) {
  const name = normStr(row?.image_name ?? row?.imageName)
  if (name) return name
  const path = normStr(row?.image_path ?? row?.imagePath)
  if (path) return path.split('/').pop() || path
  const data = normStr(row?.announcement_image ?? row?.imageDataUrl)
  if (data.startsWith('data:')) return '(announcement image)'
  return data ? '(image attached)' : ''
}

export function announcementPgRowSnapshot(row) {
  if (!row || typeof row !== 'object') return null
  const id = row.id != null ? String(row.id) : ''
  const title = normStr(row.title)
  if (!id && !title) return null
  return {
    id,
    title,
    type: normStr(row.type ?? row.updateType),
    message: truncateMessage(row.message ?? row.description),
    imageName: imageLabel(row),
  }
}

export function computeAnnouncementDetailedDiffs(oldRow, newRow) {
  const oldSnap = announcementPgRowSnapshot(oldRow)
  const newSnap = announcementPgRowSnapshot(newRow)
  if (!oldSnap || !newSnap) return {}

  const changedFields = {}

  if (valuesDiffer(oldSnap.title, newSnap.title)) {
    pushDiff(changedFields, 'Title', oldSnap.title, newSnap.title)
  }
  if (valuesDiffer(oldSnap.type, newSnap.type)) {
    pushDiff(changedFields, 'Announcement type', oldSnap.type, newSnap.type)
  }

  const oldMsg = normStr(oldRow?.message ?? oldRow?.description)
  const newMsg = normStr(newRow?.message ?? newRow?.description)
  if (valuesDiffer(oldMsg, newMsg)) {
    pushDiff(changedFields, 'Message', truncateMessage(oldMsg), truncateMessage(newMsg))
  }

  const oldImage = normStr(oldRow?.announcement_image ?? oldRow?.imageDataUrl)
  const newImage = normStr(newRow?.announcement_image ?? newRow?.imageDataUrl)
  const oldPath = normStr(oldRow?.image_path ?? oldRow?.imagePath)
  const newPath = normStr(newRow?.image_path ?? newRow?.imagePath)
  const oldImageName = normStr(oldRow?.image_name ?? oldRow?.imageName)
  const newImageName = normStr(newRow?.image_name ?? newRow?.imageName)

  const imageChanged =
    oldImage !== newImage ||
    oldPath !== newPath ||
    oldImageName !== newImageName

  if (imageChanged && (oldImage || newImage || oldPath || newPath || oldImageName || newImageName)) {
    pushDiff(
      changedFields,
      'Announcement image',
      oldSnap.imageName || '(previous image)',
      newSnap.imageName || '(replaced image)',
    )
  }

  return changedFields
}

export function announcementAuditDescription(action, snapshot) {
  const title = normStr(snapshot?.title) || 'Untitled'
  if (action === 'created') return `Announcement created: ${title}`
  if (action === 'updated') return `Announcement updated: ${title}`
  if (action === 'deleted') return `Announcement deleted: ${title}`
  return `Announcement ${action}: ${title}`
}

export function announcementAuditDetails(snapshot, extra = {}) {
  return {
    recordId: normStr(snapshot?.id),
    title: normStr(snapshot?.title),
    announcementType: normStr(snapshot?.type),
    ...extra,
  }
}
