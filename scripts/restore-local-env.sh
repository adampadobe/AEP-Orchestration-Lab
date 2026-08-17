#!/usr/bin/env bash
set -euo pipefail

# restore-local-env.sh
# Interactive helper to restore env files from the backup directory
# Usage: scripts/restore-local-env.sh [backup-base-dir]

BACKUP_BASE_DIR="${1:-$HOME/aep-orchestration-lab-env-backup}"

if [ ! -d "$BACKUP_BASE_DIR" ]; then
  echo "No backup base dir found at: $BACKUP_BASE_DIR"
  echo "Place your backups under $BACKUP_BASE_DIR or pass a different path as the first argument."
  exit 1
fi

# Find the most recent timestamped backup directory (ending with a slash)
LATEST_DIR=$(ls -1dt "$BACKUP_BASE_DIR"/*/ 2>/dev/null | head -n 1 || true)

if [ -z "$LATEST_DIR" ]; then
  echo "No timestamped backup directories were found under $BACKUP_BASE_DIR"
  exit 1
fi

echo "Found latest backup: $LATEST_DIR"

echo "Files in the backup:"
ls -la "$LATEST_DIR"

echo
read -p "Copy these files into functions/ (will overwrite existing files with same name)? [y/N] " confirm
confirm=${confirm,,} # tolower
if [[ "$confirm" != "y" && "$confirm" != "yes" ]]; then
  echo "Aborted by user. No files were copied."
  exit 0
fi

# Ensure functions dir exists
if [ ! -d "functions" ]; then
  echo "No functions/ directory found in the current repository path: $(pwd)"
  echo "Run this script from the repository root where the functions/ directory exists."
  exit 1
fi

# Copy files (preserve mode, verbose)
cp -av "$LATEST_DIR".* "functions/" || cp -av "$LATEST_DIR".env.* "functions/" || true

echo
echo "Restored files to functions/. Please avoid committing these files."
echo "When finished with local work, remove them with: rm functions/.env.*"

echo "Reminder: do not push these files to GitHub. Use Firebase Functions secrets for production configuration."