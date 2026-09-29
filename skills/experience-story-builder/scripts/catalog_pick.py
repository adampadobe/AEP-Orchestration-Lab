#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
catalog_pick.py — retrieve top-k component-library entries for a build and RECORD the gate.

The Monzo rebuild hand-rolled a lockscreen notification while
vision-experience-builder/components/ held a banked mobile-lockscreen-notification.html,
50 animations and 37 screen types. "Retrieve from the catalog first" was prose, so it was
skipped. This script makes retrieval a deterministic step: it searches catalog.json by
query/tags, prints the top-k entries (with dirs to load), and records the
`library_retrieved` pipeline gate — which the build gate now requires.

Usage:
  python catalog_pick.py <slug> --query "journey phone lockscreen cover orchestration" \
         [--k 10] [--project-root <root>]

Exit 0 always prints matches (or says the library is empty) and records the gate — the
point is forcing the lookup to happen and its results into context, not blocking on taste.
"""
from __future__ import annotations
import argparse, json, os, sys

try: sys.stdout.reconfigure(encoding="utf-8")
except Exception: pass

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from lib_root import resolve_components, sync_shared_library   # learned-library persistence
sync_shared_library()   # throttled + offline-safe: freshen the mirror from the shared repo
CATALOG = os.path.join(resolve_components(), "catalog.json")


def entry_text(e: dict) -> str:
    parts = []
    for k in ("type", "name", "id", "dir", "note", "description"):
        v = e.get(k)
        if isinstance(v, str):
            parts.append(v)
    for k in ("tags", "sources", "key_classes", "slots"):
        v = e.get(k)
        if isinstance(v, list):
            parts.extend(str(x) for x in v)
    return " ".join(parts).lower()


def main() -> int:
    ap = argparse.ArgumentParser(description="Component-library retrieval gate")
    ap.add_argument("slug")
    ap.add_argument("--query", required=True,
                    help="space-separated terms: scene types, layouts, moods, brand feel")
    ap.add_argument("--k", type=int, default=10)
    ap.add_argument("--project-root", default=None)
    a = ap.parse_args()

    if not os.path.isfile(CATALOG):
        print(f"[warn] no catalog at {CATALOG} — library empty; building bespoke is justified.")
    else:
        cat = json.load(open(CATALOG, encoding="utf-8"))
        terms = [t.strip().lower() for t in a.query.split() if t.strip()]
        scored = []
        for section, entries in cat.items():
            if not isinstance(entries, list):
                continue
            for e in entries:
                if not isinstance(e, dict):
                    continue
                txt = entry_text(e)
                score = sum(txt.count(t) for t in terms)
                if score:
                    scored.append((score, section, e))
        scored.sort(key=lambda x: -x[0])
        if not scored:
            print(f"[warn] 0 catalog hits for '{a.query}' — check your terms before going bespoke "
                  f"(sections: {', '.join(k for k, v in cat.items() if isinstance(v, list))}).")
        print(f"=== catalog top-{a.k} for '{a.query}' ===")
        for score, section, e in scored[:a.k]:
            ident = e.get("type") or e.get("name") or e.get("id") or "?"
            loc = e.get("dir") or e.get("file") or ""
            print(f"  [{section:10}] {ident:32} {loc}   (score {score})")
        print("Load ONLY the entries you will actually use; adapt, don't re-invent. "
              "If none fit, say so explicitly in the build notes — that is an allowed outcome.")

    sys.path.insert(0, HERE)
    from pipeline_state import resolve_root, set_gate
    set_gate(resolve_root(a.project_root), a.slug, "library_retrieved", "passed",
             note=f"catalog_pick: '{a.query}'")
    print(f"[GATE OK] library_retrieved recorded for '{a.slug}'.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
