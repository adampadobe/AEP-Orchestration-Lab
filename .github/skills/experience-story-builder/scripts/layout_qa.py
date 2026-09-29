#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
layout_qa.py — deterministic LAYOUT gate: no overlaps, no overflow, no dead space.

The one class render_qa / voice_lint can't see: geometry. "Eyeball every slide for overlaps
and empty space" is a rule that gets skipped, and it shipped — a laptop mock overlapping the
headline, text huddled in one corner. Layout needs REAL rendered boxes, so this gate runs
`components/layout-audit.js` against the built deck and fails on any slide that overlaps,
overflows the 1920×1080 stage, or leaves a half-stage empty.

Two ways to feed it geometry (it FAILS CLOSED if it gets none — never silently passes):

  A. AUTO (preferred): Playwright renders the deck headless and runs the audit.
       python layout_qa.py demos/<slug>/index.html --slug <slug>
     Needs a one-time:  pip install playwright && playwright install chromium

  B. PASTE-BACK (no Playwright): the visual-smoke step opens the deck in the preview, runs
     `auditDeck()` in the console, saves the JSON, and passes it here:
       python layout_qa.py demos/<slug>/index.html --slug <slug> --verdict-json audit.json
     (or --verdict-json - to read the pasted JSON from stdin.)

Exit 0 + records the `layout_qa` gate only when every slide PASSES. Exit 1 lists the failures.
"""
from __future__ import annotations
import argparse, json, os, sys
from html.parser import HTMLParser

try: sys.stdout.reconfigure(encoding="utf-8")
except Exception: pass

HERE = os.path.dirname(os.path.abspath(__file__))
AUDIT_JS = os.path.normpath(os.path.join(
    HERE, "..", "..", "vision-experience-builder", "components", "layout-audit.js"))


AUDIT_VERSION = 2


class _DeckFacts(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.slides = 0
        self.title_parts = []
        self._in_title = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag.lower() == "section" and "slide" in (attrs.get("class") or "").split():
            self.slides += 1
        if tag.lower() == "title":
            self._in_title = True

    def handle_endtag(self, tag):
        if tag.lower() == "title":
            self._in_title = False

    def handle_data(self, data):
        if self._in_title:
            self.title_parts.append(data)


def deck_facts(deck_path: str) -> tuple[int, str]:
    p = _DeckFacts()
    # utf-8-sig so a Windows-authored deck carrying a BOM doesn't crash the parse
    p.feed(open(deck_path, encoding="utf-8-sig").read())
    return p.slides, "".join(p.title_parts).strip()


def run_headless(deck_path: str, artifact_sha: str) -> dict | None:
    """Render with Playwright and run the audit. Returns the summary dict, or None if
    Playwright isn't available (caller falls back to paste-back)."""
    try:
        from playwright.sync_api import sync_playwright
    except Exception:
        return None
    audit_src = open(AUDIT_JS, encoding="utf-8").read()
    url = "file:///" + os.path.abspath(deck_path).replace("\\", "/")
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={"width": 1920, "height": 1080})
        pg.goto(url, wait_until="networkidle")
        pg.wait_for_timeout(900)          # let entrance animations settle
        pg.add_script_tag(content=audit_src)
        summary = pg.evaluate(
            "sha => auditDeck({log:false, artifactSha:sha})", artifact_sha)
        b.close()
        return summary


def load_verdict(spec: str, deck_path: str, artifact_sha: str) -> dict:
    """Load a paste-back verdict and cross-check it against the ACTUAL deck artifact, so a
    fabricated {failing:0} can't pass: slide count must match the deck's <section class=slide>
    count, the deck title must match, and every result must carry real measurement fields."""
    # Read and parse together: a verdict saved in a non-UTF-8 encoding raises UnicodeDecodeError at
    # READ time, which would escape a parse-only handler and dump a raw traceback at the one path
    # non-developers on Windows actually use.
    try:
        raw = sys.stdin.read() if spec == "-" else open(spec, encoding="utf-8-sig").read()
        if raw[:1] == "\ufeff":
            raw = raw[1:]                  # stdin path can still carry a BOM utf-8-sig didn't strip
        v = json.loads(raw)
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        print(f"[GATE FAIL] layout_qa: verdict is not readable JSON ({e}). "
              f"Re-export the auditDeck() output and save it as UTF-8.")
        sys.exit(1)
    if not isinstance(v, dict):
        print("[GATE FAIL] layout_qa: verdict root must be a JSON object")
        sys.exit(1)
    sections, title = deck_facts(deck_path)
    results = v.get("results")
    problems = []
    if sections <= 0:
        problems.append("deck contains zero <section class='slide'> elements")
    if not isinstance(results, list) or not results:
        problems.append("verdict results must be a non-empty list")
        results = []
    if len(results) != sections:
        problems.append(f"verdict has {len(results)} slides but the deck has {sections} "
                        f"<section class='slide'> — stale or fabricated verdict")
    if v.get("slides") != len(results):
        problems.append(f"summary slides={v.get('slides')!r} != len(results)={len(results)}")
    if v.get("auditVersion") != AUDIT_VERSION:
        problems.append(f"auditVersion must be {AUDIT_VERSION}; got {v.get('auditVersion')!r} — rerun the current audit")
    if v.get("artifactSha") != artifact_sha:
        problems.append("verdict is not bound to the current artifact hash — rerun the printed auditDeck command")
    if title and " ".join(str(v.get("deck") or "").split()) != " ".join(title.split()):
        # compare whitespace-collapsed, matching how the browser normalizes document.title —
        # otherwise a title with internal double/newline spaces false-fails a clean deck
        problems.append(f"verdict deck title {v.get('deck')!r} != artifact title {title!r}")
    need = {"slide", "verdict", "coverage", "overlaps", "overflow", "emptyBands",
            "typeViolations", "contrast", "contrastAdvisory", "contentUnits", "layers"}
    computed_failing = 0
    for i, r_ in enumerate(results):
        if not isinstance(r_, dict) or not need.issubset(r_):
            problems.append(f"results[{i}] missing measurement fields {sorted(need - set(r_ or {}))} "
                            f"— run the real auditDeck(), don't hand-write the JSON")
            continue
        if r_["verdict"] not in {"PASS", "FAIL"}:
            problems.append(f"results[{i}].verdict must be PASS or FAIL; got {r_['verdict']!r}")
        computed_failing += int(r_["verdict"] == "FAIL")
        if not isinstance(r_["slide"], str) or not r_["slide"].strip():
            problems.append(f"results[{i}].slide must be a non-empty string")
        if not isinstance(r_["coverage"], (int, float)) or not 0 <= r_["coverage"] <= 1:
            problems.append(f"results[{i}].coverage must be between 0 and 1")
        for key in ("overlaps", "overflow", "emptyBands", "typeViolations", "contrast", "contrastAdvisory"):
            if not isinstance(r_[key], list):
                problems.append(f"results[{i}].{key} must be a list")
        # A self-reported PASS must not contradict the measurements it carries. Flipping 'verdict'
        # to PASS while leaving the overlap/overflow/empty/type/contrast arrays populated is the
        # single most obvious way to sneak a broken slide past a red gate — reject it.
        if r_["verdict"] == "PASS" and (r_["overlaps"] or r_["overflow"] or r_["emptyBands"]
                                        or r_["typeViolations"] or r_["contrast"]):
            problems.append(f"results[{i}] claims PASS but reports overlaps/overflow/empty-bands/"
                            f"type/contrast — verdict contradicts its own measurements")
        # NB: no contentUnits==0 floor here. A real-deck run showed auditDeck under-detects content
        # when it force-activates slides outside the deck's own scroll/JS reveal flow, so a genuinely
        # blank slide and a correctly-rendered hero emit IDENTICAL output (contentUnits:0 + PASS) —
        # nothing at this layer can separate them, and a floor here just relocates the false-block
        # that the layout-audit.js revert removed. The blank-lockup case is caught by render_qa
        # instead (BROKEN-REF / LOGO-UNUSED / ADOBE-UNUSED). Reinstate only once auditDeck reliably
        # triggers each deck's content reveal.
    if v.get("failing") != computed_failing:
        problems.append(f"summary failing={v.get('failing')!r} != computed FAIL results={computed_failing}")
    if problems:
        print("[GATE FAIL] layout_qa: pasted verdict rejected —")
        for p in problems:
            print("  •", p)
        sys.exit(1)
    return v


def report(summary: dict, root: str, slug: str, deck_path: str, artifact_sha: str) -> int:
    results = summary.get("results", [])
    if not results:
        print("[GATE FAIL] layout_qa: the audit returned zero slides; an empty deck cannot pass.")
        return 1
    fails = [r for r in results if r.get("verdict") == "FAIL"]
    for r in results:
        mark = "FAIL" if r.get("verdict") == "FAIL" else "OK  "
        line = f"[{mark}] {r.get('slide','?'):22} coverage={r.get('coverage')}"
        if r.get("overlaps"):
            line += "  OVERLAP: " + "; ".join(f"{o['a']} × {o['b']} ({o['pctOfSmaller']}%)" for o in r["overlaps"])
        if r.get("overflow"):
            line += "  OVERFLOW: " + ", ".join(o["el"] for o in r["overflow"])
        if r.get("emptyBands"):
            line += "  EMPTY: " + ",".join(r["emptyBands"])
        if r.get("typeViolations"):
            line += "  TYPE: " + "; ".join(f"{t['el']} {t['px']}px<{t['min']} ({t['what']})"
                                           for t in r["typeViolations"])
        if r.get("contrast"):
            line += "  CONTRAST: " + "; ".join(f"{c['el']} {c['ratio']}:1<{c['floor']} ({c['kind']})"
                                               for c in r["contrast"])
        print(line)
        if r.get("contrastAdvisory"):   # non-failing; surfaced for the human pass
            print("       contrast? (gradient bg — verify by eye): " +
                  "; ".join(f"{c['el']} {c['ratio']}:1" for c in r["contrastAdvisory"]))
    if fails:
        print(f"\n[GATE FAIL] layout_qa: {len(fails)}/{len(results)} slide(s) have overlaps, "
              f"overflow, or dead space. Fix the layout (compose from the banked safe-zone "
              f"layouts — dual-pane / photo-composite — don't hand-position), then re-run.")
        return 1
    sys.path.insert(0, HERE)
    from pipeline_state import set_gate, deck_sha
    final_sha = deck_sha(deck_path, root, slug)
    if not final_sha or final_sha != artifact_sha:
        print("\n[GATE FAIL] layout_qa: artifact changed while geometry was being checked. "
              "Re-run on the stable final output.")
        return 1
    set_gate(root, slug, "layout_qa", "passed",
             note=f"layout_qa: {len(results)} slides clean",
             deck_sha_hex=final_sha, attested_by="layout_qa.py")
    print(f"\n[GATE OK] layout_qa passed for '{slug}' — {len(results)} slides, "
          f"no overlaps/overflow/dead-space. Gate recorded.")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Deterministic slide-layout gate")
    ap.add_argument("deck")
    ap.add_argument("--slug", required=True)
    ap.add_argument("--project-root", default=None)
    ap.add_argument("--verdict-json", help="path to a saved auditDeck() JSON, or - for stdin "
                                           "(use when Playwright isn't installed)")
    a = ap.parse_args()
    if not os.path.isfile(a.deck):
        print(f"[FAIL] deck not found: {a.deck}"); return 1

    sys.path.insert(0, HERE)
    from pipeline_state import resolve_root, deck_sha
    root = resolve_root(a.project_root)
    artifact_sha = deck_sha(a.deck, root, a.slug)
    if not artifact_sha:
        print("[GATE FAIL] layout_qa: could not fingerprint the deck artifact")
        return 1

    if a.verdict_json:
        summary = load_verdict(a.verdict_json, a.deck, artifact_sha)
    else:
        summary = run_headless(a.deck, artifact_sha)
        if summary is None:
            print("[GATE FAIL] layout_qa: no renderer. Playwright isn't installed, and no "
                  "--verdict-json was given — cannot measure geometry, so this gate will NOT "
                  "pass silently.")
            print("Fix by EITHER:")
            print("  • pip install playwright && playwright install chromium   (then re-run), OR")
            print("  • open the deck in the preview, run this exact command in the console:")
            print(f"    auditDeck({{artifactSha:'{artifact_sha}'}})")
            print("    save the returned JSON, and re-run with --verdict-json <file>.")
            return 1
    # Headless results come from the same current audit script, but still validate their schema.
    if not a.verdict_json:
        tmp = json.dumps(summary)
        # Reuse the strict validator without a temporary file.
        import tempfile as _tempfile
        tf = _tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".json", delete=False)
        try:
            tf.write(tmp); tf.close()
            summary = load_verdict(tf.name, a.deck, artifact_sha)
        finally:
            try: os.unlink(tf.name)
            except OSError: pass
    return report(summary, root, a.slug, a.deck, artifact_sha)


if __name__ == "__main__":
    sys.exit(main())
