-- Recycle Bin for deleted uploaded files. The app permanently deleted files
-- immediately whenever one was replaced or removed (curriculum guide re-upload,
-- resubmission, image swap, etc) — completely independent of scheduled backups,
-- so a file lost between backup runs could never be recovered. This table lets
-- deletions land here first instead of disappearing outright.

CREATE TABLE IF NOT EXISTS public.recycled_files (
  id BIGSERIAL PRIMARY KEY,
  original_path VARCHAR(512) NOT NULL,
  recycle_path VARCHAR(512) NOT NULL,
  file_name VARCHAR(512),
  context VARCHAR(255),
  size_bytes BIGINT,
  on_spaces BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_by VARCHAR(64),
  deleted_by_name VARCHAR(255),
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recycled_files_deleted_at ON public.recycled_files (deleted_at DESC);
