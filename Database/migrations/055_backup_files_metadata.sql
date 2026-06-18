-- Track file counts in backup history for complete backup/restore visibility.
ALTER TABLE public.backups
  ADD COLUMN IF NOT EXISTS files_backed_up INT,
  ADD COLUMN IF NOT EXISTS uploads_size_bytes BIGINT;
