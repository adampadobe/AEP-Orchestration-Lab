#!/usr/bin/env bash
# Local mirror of CI checks (no pip install — works without venv deps).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "→ Python syntax (compileall)"
python3 -m compileall -q proxy_server.py scripts/*.py

echo "→ JSON parse (samples/, schemas/)"
python3 <<'PY'
import json
import pathlib
import sys

root = pathlib.Path(".")
paths = sorted(root.glob("samples/*.json")) + sorted(root.glob("schemas/*.json"))
errs = []
for p in paths:
    try:
        json.loads(p.read_text(encoding="utf-8"))
    except Exception as e:
        errs.append(f"{p}: {e}")
if errs:
    print("\n".join(errs), file=sys.stderr)
    sys.exit(1)
print(f"  {len(paths)} files OK")
PY

echo "Validate OK."
