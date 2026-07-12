const LATE_SUBMISSION_COLS = [
  ['late_submission_until', 'TIMESTAMPTZ'],
  ['late_submission_reason', 'TEXT'],
  ['late_submission_granted_by', 'TEXT'],
  ['late_submission_granted_at', 'TIMESTAMPTZ'],
]

export async function ensureLateSubmissionColumns(pool, tableName) {
  for (const [name, type] of LATE_SUBMISSION_COLS) {
    await pool.query(`ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS ${name} ${type}`)
  }
}
