-- PostgreSQL `lenlearn_db`: catalog table `announcements` (Announcements module API).

-- Idempotent (IF NOT EXISTS). Same definition as `scripts/sql/lenlearn_postgres_announcements_table.sql`

-- and `server/api/state.js` ensureAnnouncementsTable.



CREATE TABLE IF NOT EXISTS announcements (

  id SERIAL PRIMARY KEY,

  announcement_image TEXT,

  title VARCHAR(255) NOT NULL,

  type VARCHAR(50) NOT NULL,

  message TEXT NOT NULL,

  created_at TIMESTAMPTZ DEFAULT NOW()

);



CREATE INDEX IF NOT EXISTS idx_announcements_created_at ON announcements (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_announcements_type ON announcements (type);

