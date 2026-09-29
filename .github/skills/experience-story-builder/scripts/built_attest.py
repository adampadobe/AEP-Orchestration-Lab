#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
built_attest.py — attest the `built` gate by MEASURING the deck, not by claiming it.

`built` used to be hand-set: the agent typed `--set built=passed`. Nothing checked that a
deck file existed, that it had slides in it, or that writing it had finished. A build that
half-failed could therefore be marked done and walk straight into the QA stage, where every
later gate assumes the artifact is real.

This script opens the file and checks the things that distinguish "a deck exists" from
"a deck was claimed":
  1. the file exists and is not a stub (>= 2 KB)
  2. it is not truncated — a closing </html> is present (an interrupted write loses it)
  3. it contains at least one `<section class="slide">` (--min-slides to demand more)
  4. it carries a controller `<script>` — a deck with no script cannot advance
  5. it has real body text, not just chrome (>= 200 visible chars)

Exit 0 records `built` bound to the artifact's sha. Exit 1 records nothing.

Usage:
  python built_attest.py <deck.html> --slug <slug> [--project-root <root>] [--min-slides N]
"""
from __future__ import annotations
import argparse, os, re, sys

try: sys.stdout.reconfigure(encoding="utf-8")
except Exception: pass

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

MIN_BYTES = 2048
MIN_TEXT_CHARS = 200


def visible_text(raw: str) -> str:
    """Body text with script/style/markup removed — what a reader would actually see."""
    body = re.sub(r"(?is)<(script|style)\b.*?</\1>", " ", raw)
    body = re.sub(r"(?s)<[^>]+>", " ", body)
    return re.sub(r"\s+", " ", body).strip()


def main() -> int:
    ap = argparse.ArgumentParser(description="Attest the `built` gate from the deck itself")
    ap.add_argument("deck")
    ap.add_argument("--slug", required=True)
    ap.add_argument("--project-root", default=None)
    ap.add_argument("--min-slides", type=int, default=1)
    a = ap.parse_args()

    deck_path = os.path.abspath(a.deck)
    if not os.path.isfile(deck_path):
        print(f"[GATE FAIL] built: deck not found: {deck_path}")
        return 1

    from pipeline_state import resolve_root, set_gate, deck_sha
    root = resolve_root(a.project_root)

    raw = open(deck_path, encoding="utf-8", errors="replace").read()
    size = os.path.getsize(deck_path)
    errors: list[str] = []

    if size < MIN_BYTES:
        errors.append(f"STUB         {size} bytes — under {MIN_BYTES}, this is not a built deck")

    if "</html>" not in raw.lower():
        errors.append("TRUNCATED    no closing </html> — the file was not finished being written")

    # count slides the same way render_qa does, so the two gates can never disagree
    try:
        from render_qa import resource_refs
        _, slides = resource_refs(raw)
    except Exception:
        slides = len(re.findall(r"""<section\b[^>]*\bclass\s*=\s*["'][^"']*\bslide\b""", raw, re.I))
    if slides < a.min_slides:
        errors.append(f"NO-SLIDES    found {slides} slide sections, need at least {a.min_slides}")

    if not re.search(r"(?is)<script\b", raw):
        errors.append("NO-CONTROLLER no <script> — the deck cannot advance between slides")

    text = visible_text(raw)
    if len(text) < MIN_TEXT_CHARS:
        errors.append(f"EMPTY        only {len(text)} chars of visible text — the deck has no content")

    if errors:
        print(f"[GATE FAIL] built: {a.slug}")
        for e in errors:
            print("   " + e)
        print("\n   Nothing recorded. Fix the build and re-run; `built` cannot be set by hand.")
        return 1

    sha = deck_sha(deck_path, root, a.slug)
    if not sha:
        print("[GATE FAIL] built: could not fingerprint the deck artifact")
        return 1

    note = f"{slides} slides, {size} bytes, {len(text)} chars of copy"
    set_gate(root, a.slug, "built", "passed", note=note,
             deck_sha_hex=sha, attested_by="built_attest.py")
    print(f"[GATE OK] built: {a.slug} — {note}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
