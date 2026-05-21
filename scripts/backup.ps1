# ============================================================
# Automated Database Backup (PowerShell)
# ============================================================
# Usage: .\scripts\backup.ps1 [-RestoreTest]
# ============================================================
param([switch]$RestoreTest)

$ProjectDir = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
$BackupDir = Join-Path $ProjectDir "backups"
$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$BackupFile = Join-Path $BackupDir "highlands_$Timestamp.dump"
$LogFile = Join-Path $BackupDir "backup_$Timestamp.log"

$DbHost = $env:DB_HOST ?? "localhost"
$DbPort = $env:DB_PORT ?? "5432"
$DbName = $env:DB_NAME ?? "highlands"
$DbUser = $env:DB_USER ?? "postgres"

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

function Write-Log {
  param([string]$Message)
  $line = "[$(Get-Date -Format HH:mm:ss)] $Message"
  Write-Host $line
  Add-Content -Path $LogFile -Value $line
}

Write-Log "Starting backup: $BackupFile"

# Run pg_dump
& pg_dump --host $DbHost --port $DbPort --dbname $DbName --username $DbUser `
  --format custom --compress 9 --no-owner --no-privileges --verbose `
  --file $BackupFile 2>> $LogFile

if ($LASTEXITCODE -ne 0) {
  Write-Log "BACKUP FAILED (exit code: $LASTEXITCODE)"
  exit 1
}

Write-Log "Backup complete: $BackupFile"

# Verify
$verify = & pg_restore --list $BackupFile 2>> $LogFile
if ($LASTEXITCODE -eq 0) {
  Write-Log "Backup integrity: VALID"
} else {
  Write-Log "Backup integrity: CORRUPT"
  exit 1
}

# Restore test
if ($RestoreTest) {
  $TestDb = "${DbName}_restore_test"
  Write-Log "Running restore test on: $TestDb"

  & dropdb --if-exists --host $DbHost --port $DbPort --username $DbUser $TestDb 2>$null
  & createdb --host $DbHost --port $DbPort --username $DbUser $TestDb
  & pg_restore --dbname $TestDb --host $DbHost --port $DbPort --username $DbUser `
    --jobs 4 --no-owner --no-privileges $BackupFile >> $LogFile 2>&1

  if ($LASTEXITCODE -eq 0) {
    Write-Log "Restore test: PASSED"
    & dropdb --host $DbHost --port $DbPort --username $DbUser $TestDb
  } else {
    Write-Log "Restore test: FAILED"
  }
}

# Cleanup old backups
Get-ChildItem "$BackupDir\highlands_*.dump" | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } | Remove-Item
Write-Log "Backup finished"
