#!/usr/bin/env python3
"""Ensure vendorIndex ids in martech-taxonomy-reference.json match SVG files on disk.

Run from repo root: python3 scripts/validate-ecosystem-vendor-index.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
TAX = REPO / "web/profile-viewer/data/martech-taxonomy-reference.json"
SVG_DIR = REPO / "web/profile-viewer/images/ecosystem-vendor-logos"


def main() -> int:
    data = json.loads(TAX.read_text(encoding="utf-8"))
    idx = data.get("vendorIndex")
    if not isinstance(idx, list):
        print("vendorIndex missing or not a list", file=sys.stderr)
        return 1
    on_disk = {p.stem for p in SVG_DIR.glob("*.svg")} if SVG_DIR.is_dir() else set()
    missing_files: list[str] = []
    orphan_files = set(on_disk)
    for row in idx:
        if not isinstance(row, dict):
            continue
        vid = row.get("id")
        if not vid:
            continue
        p = SVG_DIR / f"{vid}.svg"
        if not p.is_file():
            missing_files.append(vid)
        else:
            orphan_files.discard(vid)
    err = False
    if missing_files:
        err = True
        print("vendorIndex id(s) without matching SVG:", file=sys.stderr)
        for m in sorted(missing_files):
            print(f"  - {m}.svg", file=sys.stderr)
    if orphan_files:
        err = True
        print("SVG file(s) not listed in vendorIndex:", file=sys.stderr)
        for o in sorted(orphan_files):
            print(f"  - {o}.svg", file=sys.stderr)
    if err:
        return 1
    print(f"OK: vendorIndex ({len(idx)} rows) matches ecosystem-vendor-logos ({len(on_disk)} SVGs).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
