#!/usr/bin/env bash
# Stage all changes, commit if needed, push to origin.
# Usage:
#   ./scripts/git-sync.sh
#   ./scripts/git-sync.sh "Your commit message"
# Optional: run ./scripts/validate.sh first (or use Cursor task "Validate + push").
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MSG="${1:-Project sync $(date -u +'%Y-%m-%d %H:%MZ')}"

if [[ "${SKIP_VALIDATE:-}" != "1" ]]; then
  if [[ -x "$ROOT/scripts/validate.sh" ]]; then
    echo "→ Running validate.sh (set SKIP_VALIDATE=1 to skip)"
    "$ROOT/scripts/validate.sh"
  fi
fi

git add -A
if git diff --cached --quiet; then
  echo "Nothing to commit."
else
  git commit -m "$MSG"
fi

current_branch="$(git rev-parse --abbrev-ref HEAD)"
git push -u origin "$current_branch"
echo "Pushed branch: $current_branch"
