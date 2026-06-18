import { getPgPool } from '../pgPool.js'

let schemaReady = false

export async function ensureScoreOverwriteRequestsSchema(pool = getPgPool()) {
  if (!pool) return false
  if (schemaReady) return true
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.score_overwrite_requests (
      id BIGSERIAL PRIMARY KEY,
      teacher_id TEXT NOT NULL,
      student_id BIGINT NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
      entity_type VARCHAR(20) NOT NULL,
      entity_id BIGINT NOT NULL,
      submission_id BIGINT NOT NULL,
      current_score NUMERIC(10,2),
      requested_score NUMERIC(10,2) NOT NULL,
      reason TEXT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      admin_id TEXT,
      admin_notes TEXT,
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT score_overwrite_requests_status_check
        CHECK (status IN ('pending', 'approved', 'rejected'))
    )
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_score_overwrite_status
      ON public.score_overwrite_requests (status, created_at DESC)
  `)
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_score_overwrite_pending_submission
      ON public.score_overwrite_requests (submission_id)
      WHERE status = 'pending'
  `)
  schemaReady = true
  return true
}

function mapRow(row) {
  if (!row) return null
  return {
    id: Number(row.id),
    teacher_id: row.teacher_id,
    student_id: Number(row.student_id),
    entity_type: row.entity_type,
    entity_id: Number(row.entity_id),
    submission_id: Number(row.submission_id),
    current_score: row.current_score != null ? Number(row.current_score) : null,
    requested_score: Number(row.requested_score),
    reason: row.reason,
    status: row.status,
    admin_id: row.admin_id || null,
    admin_notes: row.admin_notes || null,
    reviewed_at: row.reviewed_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export async function createScoreOverwriteRequest(pool, payload) {
  await ensureScoreOverwriteRequestsSchema(pool)
  const { rows } = await pool.query(
    `
    INSERT INTO score_overwrite_requests (
      teacher_id, student_id, entity_type, entity_id, submission_id,
      current_score, requested_score, reason
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *
    `,
    [
      payload.teacher_id,
      payload.student_id,
      payload.entity_type,
      payload.entity_id,
      payload.submission_id,
      payload.current_score,
      payload.requested_score,
      payload.reason,
    ],
  )
  return mapRow(rows[0])
}

export async function findPendingBySubmission(pool, submissionId) {
  await ensureScoreOverwriteRequestsSchema(pool)
  const { rows } = await pool.query(
    `SELECT * FROM score_overwrite_requests
     WHERE submission_id = $1 AND status = 'pending' LIMIT 1`,
    [submissionId],
  )
  return mapRow(rows[0])
}

export async function listScoreOverwriteRequests(pool, { status, teacherId, limit = 100 } = {}) {
  await ensureScoreOverwriteRequestsSchema(pool)
  const clauses = []
  const params = []
  if (status) {
    params.push(status)
    clauses.push(`r.status = $${params.length}`)
  }
  if (teacherId) {
    params.push(teacherId)
    clauses.push(`r.teacher_id = $${params.length}`)
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  params.push(Math.min(Math.max(Number(limit) || 100, 1), 500))
  const { rows } = await pool.query(
    `
    SELECT r.*, s.first_name_enc, s.last_name_enc, s.middle_name_enc
    FROM score_overwrite_requests r
    LEFT JOIN students s ON s.id = r.student_id
    ${where}
    ORDER BY r.created_at DESC
    LIMIT $${params.length}
    `,
    params,
  )
  return rows.map((row) => ({ ...mapRow(row), student_row: row }))
}

export async function getScoreOverwriteRequestById(pool, id) {
  await ensureScoreOverwriteRequestsSchema(pool)
  const { rows } = await pool.query(`SELECT * FROM score_overwrite_requests WHERE id = $1 LIMIT 1`, [id])
  return mapRow(rows[0])
}

export async function updateScoreOverwriteRequestStatus(pool, id, { status, adminId, adminNotes }) {
  await ensureScoreOverwriteRequestsSchema(pool)
  const { rows } = await pool.query(
    `
    UPDATE score_overwrite_requests
    SET status = $2, admin_id = $3, admin_notes = $4, reviewed_at = NOW(), updated_at = NOW()
    WHERE id = $1 AND status = 'pending'
    RETURNING *
    `,
    [id, status, adminId || null, adminNotes || null],
  )
  return mapRow(rows[0])
}
