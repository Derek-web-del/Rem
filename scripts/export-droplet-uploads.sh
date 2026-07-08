#!/usr/bin/env bash
# Export LenLearn uploads from the OLD Droplet (run via SSH on 157.245.204.153).
# Then restore into App Platform using Admin → Data Backup → Restore (.lnbak),
# or re-upload curriculum/faculty photos manually after deploy.
#
# Usage on Droplet:
#   bash scripts/export-droplet-uploads.sh /var/www/LenLearn
#   # or adjust path until you find public/uploads with curriculum/ and faculties/ folders
#
# Output: /tmp/lenlearn-uploads.tar.gz — download with scp, then use backup restore flow.

set -euo pipefail

APP_ROOT="${1:-}"
if [ -z "$APP_ROOT" ]; then
  echo "Usage: $0 /path/to/LenLearn-on-droplet"
  echo "Example: $0 /var/www/LenLearn"
  exit 1
fi

UPLOADS_DIR="$APP_ROOT/public/uploads"
if [ ! -d "$UPLOADS_DIR" ]; then
  echo "Uploads folder not found: $UPLOADS_DIR"
  echo "Search with: find /var/www -type d -name uploads 2>/dev/null"
  exit 1
fi

OUT="/tmp/lenlearn-uploads-$(date +%Y%m%d).tar.gz"
tar -czf "$OUT" -C "$APP_ROOT/public" uploads
echo "Created $OUT"
echo "Download: scp root@YOUR_DROPLET_IP:$OUT ."
echo "Then restore via LenLearn Admin → Data Backup, or extract into a fresh backup package."
