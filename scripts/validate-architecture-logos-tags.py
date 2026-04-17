#!/usr/bin/env python3
"""Ensure every `tags` value in architecture-logos.json is declared in martech-taxonomy-reference.json.

Run from repo root: python3 scripts/validate-architecture-logos-tags.py
Exit code 1 if any tag is unknown.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
LOGOS_PATH = REPO / "web/profile-viewer/data/architecture-logos.json"
TAXONOMY_PATH = REPO / "web/profile-viewer/data/martech-taxonomy-reference.json"


def main() -> int:
    logos = json.loads(LOGOS_PATH.read_text(encoding="utf-8"))
    tax = json.loads(TAXONOMY_PATH.read_text(encoding="utf-8"))

    allowed = {t["id"] for t in tax.get("diagramLogoTags", []) if isinstance(t, dict) and "id" in t}
    if not allowed:
        print("No diagramLogoTags in taxonomy reference.", file=sys.stderr)
        return 1

    unknown: set[str] = set()
    for entry in logos.get("logos") or []:
        if not isinstance(entry, dict):
            continue
        for tag in entry.get("tags") or []:
            if tag and tag not in allowed:
                unknown.add(tag)

    if unknown:
        print("Unknown tags in architecture-logos.json (add to martech-taxonomy-reference.json):", file=sys.stderr)
        for t in sorted(unknown):
            print(f"  - {t}", file=sys.stderr)
        return 1

    print(f"OK: all tags ⊆ {len(allowed)} taxonomy ids.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
