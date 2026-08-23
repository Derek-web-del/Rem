import { archiveStudentRecord } from '../api/state/shared.js'
import { setSchoolYear } from './institutionSettingsDb.js'

/** Glendale JHS scope — Grade 10 is terminal (graduates, doesn't promote further). */
export const GRADE_SEQUENCE = ['Grade 7', 'Grade 8', 'Grade 9', 'Grade 10']

function normalizeGrade(g) {
  return String(g || '').trim()
}

function sectionKey(name, grade) {
  return `${String(name || '').trim().toLowerCase()}|${normalizeGrade(grade)}`
}

async function fetchActiveStudentsWithEffectiveGrade(pool) {
  const { rows } = await pool.query(`
    SELECT s.id, s.grade_level AS student_grade_level, s.section_id,
           sec.section_name, sec.grade_level AS section_grade_level
    FROM students s
    LEFT JOIN sections sec ON sec.id = s.section_id
    WHERE s.archived_at IS NULL
  `)
  return rows.map((r) => ({
    id: r.id,
    section_id: r.section_id,
    section_name: r.section_name,
    effective_grade: normalizeGrade(r.student_grade_level) || normalizeGrade(r.section_grade_level),
  }))
}

async function buildActiveSectionLookup(pool) {
  // Not every environment has migration 042 (sections.deleted_at/status)
  // applied, and this can run inside a transaction where a failed query
  // would poison the rest of it — so don't depend on those columns at all.
  const { rows } = await pool.query(`SELECT id, section_name, grade_level FROM sections`)
  const map = new Map()
  for (const r of rows) {
    map.set(sectionKey(r.section_name, r.grade_level), r.id)
  }
  return map
}

/**
 * Dry-run: what promotion WOULD do, with no writes. Shared by the preview
 * endpoint and the real run (run re-derives the same plan inside its
 * transaction so nothing can drift between preview and execution).
 */
export async function computePromotionPlan(pool) {
  const [students, sectionLookup] = await Promise.all([
    fetchActiveStudentsWithEffectiveGrade(pool),
    buildActiveSectionLookup(pool),
  ])

  const byCurrentGrade = Object.fromEntries(GRADE_SEQUENCE.map((g) => [g, 0]))
  let unresolvedGrade = 0
  let graduating = 0
  let promoting = 0
  let sectionMatched = 0
  let needsManualSection = []

  for (const student of students) {
    const idx = GRADE_SEQUENCE.indexOf(student.effective_grade)
    if (idx === -1) {
      unresolvedGrade += 1
      continue
    }
    byCurrentGrade[student.effective_grade] += 1

    if (idx === GRADE_SEQUENCE.length - 1) {
      graduating += 1
      continue
    }

    promoting += 1
    const targetGrade = GRADE_SEQUENCE[idx + 1]
    if (student.section_id) {
      const matchedSectionId = sectionLookup.get(sectionKey(student.section_name, targetGrade))
      if (matchedSectionId) {
        sectionMatched += 1
      } else {
        needsManualSection.push({
          student_id: student.id,
          current_grade: student.effective_grade,
          target_grade: targetGrade,
          current_section_name: student.section_name || null,
        })
      }
    }
  }

  return {
    counts_by_current_grade: byCurrentGrade,
    promoting,
    graduating,
    section_auto_matched: sectionMatched,
    needs_manual_section: needsManualSection,
    unresolved_grade: unresolvedGrade,
    total_active_students: students.length,
  }
}

/**
 * Executes promotion: bulk-advance every active student one grade level
 * (name-matched section reassignment where possible), archive/graduate
 * Grade 10 students via the existing archive path, and update the active
 * school year — all in one transaction.
 */
export async function runGradePromotion(pool, { newSchoolYear, actorId }) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const [students, sectionLookup] = await Promise.all([
      fetchActiveStudentsWithEffectiveGrade(client),
      buildActiveSectionLookup(client),
    ])

    let promoted = 0
    let graduated = 0
    let sectionMatched = 0
    const needsManualSection = []
    const unresolvedGradeIds = []

    for (const student of students) {
      const idx = GRADE_SEQUENCE.indexOf(student.effective_grade)
      if (idx === -1) {
        unresolvedGradeIds.push(student.id)
        continue
      }

      if (idx === GRADE_SEQUENCE.length - 1) {
        const reason = `Promoted beyond Grade 10 (graduated) at year-end rollover to SY ${newSchoolYear}.`
        const archived = await archiveStudentRecord(client, student.id, reason)
        if (archived) graduated += 1
        continue
      }

      const targetGrade = GRADE_SEQUENCE[idx + 1]
      const matchedSectionId = student.section_id
        ? sectionLookup.get(sectionKey(student.section_name, targetGrade))
        : null

      if (matchedSectionId) {
        await client.query(
          `UPDATE students SET grade_level = $1, section_id = $2, updated_at = NOW() WHERE id = $3`,
          [targetGrade, matchedSectionId, student.id],
        )
        sectionMatched += 1
      } else {
        await client.query(
          `UPDATE students SET grade_level = $1, section_id = NULL, updated_at = NOW() WHERE id = $2`,
          [targetGrade, student.id],
        )
        if (student.section_id) {
          needsManualSection.push({
            student_id: student.id,
            current_grade: student.effective_grade,
            target_grade: targetGrade,
            current_section_name: student.section_name || null,
          })
        }
      }
      promoted += 1
    }

    const schoolYear = await setSchoolYear(client, newSchoolYear, actorId)

    await client.query('COMMIT')

    return {
      promoted,
      graduated,
      section_auto_matched: sectionMatched,
      needs_manual_section: needsManualSection,
      unresolved_grade_student_ids: unresolvedGradeIds,
      school_year: schoolYear,
    }
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    client.release()
  }
}
