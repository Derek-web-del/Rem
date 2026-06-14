import { auditInstituteRecord } from '../api/state/shared.js'

/**
 * Remove faculty advisory links for a section and log per-faculty audit events.
 * @param {import('pg').Pool} pool
 * @param {number} sectionId
 * @param {object} adminSession
 * @param {string} reason - e.g. 'archived' | 'deleted'
 */
export async function removeFacultyAdvisoryLinksForSection(pool, sectionId, adminSession, reason = 'removed') {
  const sid = Number(sectionId)
  if (!Number.isFinite(sid) || sid <= 0) return []

  const { rows: linked } = await pool.query(
    `SELECT faculty_id FROM public.faculty_sections WHERE section_id = $1`,
    [sid],
  )
  const facultyIds = (linked || []).map((r) => String(r.faculty_id || '').trim()).filter(Boolean)

  if (facultyIds.length > 0) {
    await pool.query(`DELETE FROM public.faculty_sections WHERE section_id = $1`, [sid])
  }

  for (const facultyId of facultyIds) {
    await scrubAdvisoryJsonForSection(pool, facultyId, sid)
    await auditInstituteRecord(adminSession, 'faculty_advisory_section_removed', {
      recordType: 'faculty',
      recordId: facultyId,
      description: `Advisory section ${sid} removed from faculty ${facultyId} (${reason})`,
      details: {
        faculty_id: facultyId,
        section_id: sid,
        reason,
      },
    })
  }

  return facultyIds
}

async function scrubAdvisoryJsonForSection(pool, facultyId, sectionId) {
  try {
    const { rows } = await pool.query(
      `SELECT advisory_sections_json FROM public.faculties WHERE id = $1 LIMIT 1`,
      [facultyId],
    )
    const raw = rows?.[0]?.advisory_sections_json
    if (!raw) return

    let parsed = []
    if (typeof raw === 'string') {
      try {
        parsed = JSON.parse(raw)
      } catch {
        return
      }
    } else if (Array.isArray(raw)) {
      parsed = raw
    } else {
      return
    }

    const sidStr = String(sectionId)
    const filtered = parsed.filter((item) => {
      const id =
        item?.postgresSectionId ??
        item?.postgres_section_id ??
        item?.section_id ??
        item?.id ??
        null
      if (id == null) return true
      return String(id) !== sidStr
    })

    if (filtered.length === parsed.length) return

    await pool.query(`UPDATE public.faculties SET advisory_sections_json = $2 WHERE id = $1`, [
      facultyId,
      JSON.stringify(filtered),
    ])
  } catch (e) {
    console.warn('[section-advisory] JSON scrub failed:', e?.message || e)
  }
}
