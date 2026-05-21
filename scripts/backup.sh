#!/usr/bin/env bash
# ============================================================
# Automated Database Backup
# ============================================================
# Usage: ./scripts/backup.sh [--dump-only] [--restore-test]
#
# Requires:
#   - pg_dump / pg_restore (PostgreSQL client tools)
#   - PSQL_* environment variables or .env file
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${PROJECT_DIR}/backups"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="${BACKUP_DIR}/highlands_${TIMESTAMP}.dump"
LOG_FILE="${BACKUP_DIR}/backup_${TIMESTAMP}.log"

# Load environment (DB_HOST, DB_PORT, DB_NAME, DB_USER)
if [ -f "${PROJECT_DIR}/.env" ]; then
  set -a; source "${PROJECT_DIR}/.env"; set +a
fi

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-highlands}"
DB_USER="${DB_USER:-postgres}"

mkdir -p "${BACKUP_DIR}"

log() { echo "[$(date +%H:%M:%S)] $*" | tee -a "$LOG_FILE"; }

run_backup() {
  log "Starting backup: ${BACKUP_FILE}"

  pg_dump \
    --host="${DB_HOST}" \
    --port="${DB_PORT}" \
    --dbname="${DB_NAME}" \
    --username="${DB_USER}" \
    --format=custom \
    --compress=9 \
    --no-owner \
    --no-privileges \
    --verbose \
    --file="${BACKUP_FILE}" 2>>"$LOG_FILE"

  log "Backup size: $(du -h "${BACKUP_FILE}" | cut -f1)"
  log "Backup complete: ${BACKUP_FILE}"
}

verify_backup() {
  log "Verifying backup integrity..."
  if pg_restore --list "${BACKUP_FILE}" > /dev/null 2>>"$LOG_FILE"; then
    log "Backup integrity: VALID"
    return 0
  else
    log "Backup integrity: CORRUPT"
    return 1
  fi
}

run_restore_test() {
  local TEST_DB="${DB_NAME}_restore_test"
  log "Running restore test on database: ${TEST_DB}"

  dropdb --if-exists --host="${DB_HOST}" --port="${DB_PORT}" --username="${DB_USER}" "${TEST_DB}" 2>/dev/null
  createdb --host="${DB_HOST}" --port="${DB_PORT}" --username="${DB_USER}" "${TEST_DB}"

  pg_restore \
    --dbname="${TEST_DB}" \
    --host="${DB_HOST}" \
    --port="${DB_PORT}" \
    --username="${DB_USER}" \
    --jobs="$(nproc 2>/dev/null || echo 4)" \
    --no-owner \
    --no-privileges \
    "${BACKUP_FILE}" >>"$LOG_FILE" 2>&1

  log "Restore test: verifying row counts..."
  psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${TEST_DB}" -c "
    SELECT 'orders' AS tbl, count(*) FROM orders
    UNION ALL SELECT 'invoices', count(*) FROM invoices
    UNION ALL SELECT 'payment_logs', count(*) FROM payment_logs
    UNION ALL SELECT 'bookings', count(*) FROM bookings
    UNION ALL SELECT 'rooms', count(*) FROM rooms
    UNION ALL SELECT 'idempotency_keys', count(*) FROM idempotency_keys
    ORDER BY tbl;" | tee -a "$LOG_FILE"

  dropdb --host="${DB_HOST}" --port="${DB_PORT}" --username="${DB_USER}" "${TEST_DB}"
  log "Restore test: PASSED"
}

cleanup_old_backups() {
  log "Cleaning backups older than 30 days..."
  find "${BACKUP_DIR}" -name "highlands_*.dump" -type f -mtime +30 -delete
  log "Cleanup complete"
}

# ── Main ──
log "=== Backup started ==="
run_backup
verify_backup

if [ "${1:-}" = "--restore-test" ] || [ "${1:-}" = "-r" ]; then
  run_restore_test
fi

cleanup_old_backups
log "=== Backup finished ==="
