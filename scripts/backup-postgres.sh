#!/usr/bin/env bash
set -euo pipefail
umask 077

: "${DATABASE_URL:?DATABASE_URL must be set}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
if ! [[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] || (( RETENTION_DAYS < 1 )); then
  echo "BACKUP_RETENTION_DAYS must be a positive integer." >&2
  exit 2
fi

mkdir -p "$BACKUP_DIR"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_file="$BACKUP_DIR/veritygrid-$timestamp.dump"
checksum_file="$backup_file.sha256"

pg_dump --format=custom --no-owner --no-acl --file="$backup_file" "$DATABASE_URL"
(cd "$BACKUP_DIR" && sha256sum "$(basename "$backup_file")" > "$(basename "$checksum_file")")
chmod 600 "$backup_file" "$checksum_file"
find "$BACKUP_DIR" -type f -name 'veritygrid-*.dump' -mtime "+$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -type f -name 'veritygrid-*.dump.sha256' -mtime "+$RETENTION_DAYS" -delete

echo "Backup created: $backup_file"
echo "Checksum: $checksum_file"
echo "Retention: $RETENTION_DAYS days"
