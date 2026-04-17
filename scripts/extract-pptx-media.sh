#!/usr/bin/env bash
# Extract embedded images from an Adobe Express (or any) .pptx export.
# Usage: ./scripts/extract-pptx-media.sh path/to/export.pptx [output-dir]
# Output defaults to ./express-pptx-media next to the pptx (or cwd).
set -euo pipefail
PPTX="${1:?Usage: $0 <file.pptx> [output-directory]}"
if [[ ! -f "$PPTX" ]]; then
  echo "Not a file: $PPTX" >&2
  exit 1
fi
BASE="$(cd "$(dirname "$PPTX")" && pwd)"
NAME="$(basename "$PPTX" .pptx)"
OUT="${2:-$BASE/${NAME}-pptx-media}"
rm -rf "$OUT"
mkdir -p "$OUT"
unzip -q "$PPTX" "ppt/media/*" -d "$OUT" 2>/dev/null || {
  echo "No ppt/media/ in this file (wrong format or empty). Try exporting from Express as pptx." >&2
  exit 1
}
echo "Extracted embedded media to:"
echo "  $OUT/ppt/media/"
echo "Copy the logos you need into web/profile-viewer/images/ and add entries to web/profile-viewer/data/architecture-logos.json"
