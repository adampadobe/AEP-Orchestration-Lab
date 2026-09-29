#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
voice_lint.py — deterministic "de-Claude" lint for customer-facing copy (Adobe voice).

Prose style rules get narrated past; this script cannot be. It scans the VISIBLE text of a
deck (HTML) or a copy doc (md/txt/json) for the AI-tell patterns catalogued in
references/adobe-voice.md and exits 1 with line-numbered findings until the copy is clean.

An intentional keeper (one earned contrast per deck) is marked on the same line with
`voice-keep` (e.g. `<!-- voice-keep -->` in HTML) and is skipped.

Usage:
  python voice_lint.py <file> [--slug <slug> --project-root <root>] [--max-dash-per-100w N]

Exit 0 = clean. Records pipeline gate voice_lint=passed when --slug is given.
Exit 1 = findings listed; rewrite and re-run.
"""
from __future__ import annotations
import argparse, html as html_lib, os, re, sys
from html.parser import HTMLParser

try: sys.stdout.reconfigure(encoding="utf-8")
except Exception: pass

# Promotional-warmth / marketing-slop words (the original Adobe-voice watchlist).
WATCH_WARMTH = ("seamless(?:ly)?", "effortless(?:ly)?", "magical", "delightful", "supercharged?",
                "game.?chang\\w+", "unlock(?:s|ed|ing)?", "elevate(?:s|d)?", "empower(?:s|ed|ing)?",
                "transformative", "revolutioni[sz]\\w+", "quietly", "beautifully", "frictionless",
                "just works", "peace of mind", "robust", "leverag(?:e|es|ed|ing)")

# "Cursed vocabulary" — the words LLMs reach for that a human writer rarely would (the
# single most-complained-about AI tell). High-precision: every entry is a strong tell on
# its own AND is unlikely to be legitimate Adobe deck copy. Deliberately EXCLUDES words that
# double as real product names or plain deck language (journey, orchestrate, navigate,
# showcase, landscape, foster) so correct usage never trips.
WATCH_CURSED = ("delv(?:e|es|ed|ing)", "tapestry", "pivotal", "underscor(?:e|es|ed|ing)",
                "testament", "paradigm", "myriad", "plethora", "realm", "beacon", "bustling",
                "treasure trove", "symphony", "cutting.?edge", "state.?of.?the.?art",
                "ever.?(?:evolving|changing|growing)", "meticulous(?:ly)?", "intricate(?:ly)?",
                "embark", "nestled", "whimsical", "watershed", "harness(?:es|ed|ing)? the",
                "when it comes to")

WATCHLIST = WATCH_WARMTH + WATCH_CURSED

PATTERNS = [
    ("ANTITHESIS", re.compile(r"\b[\w£$€%']+[^.!?\n—]{0,40},\s+not\s+[a-z]", re.I)),
    ("ANTITHESIS", re.compile(r"—\s*not\s+[a-z]", re.I)),
    ("ANTITHESIS", re.compile(r"\bless\s+\w+[^.!?\n]{0,24},\s*more\s+\w", re.I)),
    ("NOT-JUST",   re.compile(r"\b(?:isn't|aren't|doesn't|don't|wasn't|not)\s+just\b|\bmore than just\b|\bnot only\b", re.I)),
    ("TRIPLET",    re.compile(r"\bno\s+\w+[^.!?\n]{0,25},\s*no\s+\w+", re.I)),
    ("OPENER",     re.compile(r"\b(?:here's the thing|the best part\??|put simply|in short,|think of it as|the kicker|the result\?|in today's\s+\w+|in a world where|in an era of)", re.I)),
    ("SLOP",       re.compile(r"\b(?:" + "|".join(WATCHLIST) + r")\b", re.I)),
    ("EMOJI",      re.compile(r"[\U0001F300-\U0001FAFF✅❌✨⚡⭐]")),
]

TITLE_LINE_HINT = re.compile(r"<h[1-6]\b|class\s*=\s*[\"'][^\"']*(?:title|headline|htitle)", re.I)
TAG_RE = re.compile(r"<[^>]+>")
SMALLWORDS = {"a", "an", "and", "as", "at", "but", "by", "for", "in", "of", "on", "or",
              "the", "to", "vs", "with", "when", "that", "it", "its"}
# exact product names are legitimately capitalised — remove before Title Case analysis
PRODUCT_RE = re.compile(
    r"\b(?:Adobe\s+)?(?:Real-?Time\s+CDP|Journey\s+Optimizer|Customer\s+Journey\s+Analytics|"
    r"Experience\s+(?:Platform|Cloud|Manager)|Brand\s+Concierge|Firefly|Express|Photoshop|"
    r"Acrobat|Workfront|Marketo|Analytics|Target|GenStudio)\b|\bAdobe\b")


_HTAGS = {f"h{i}" for i in range(1, 7)}
# Never linted — none of this is visible slide copy. 'head' keeps <title>/<meta> (the browser-tab
# title) out of both the scanned copy and the dash-density denominator.
IGNORE_TAGS = {"script", "style", "template", "head"}
# 'body' included so copy placed directly under <body> (no block wrapper) is still linted rather
# than silently discarded when the stack empties. 'html' deliberately NOT a block: text directly
# under <html> is invalid HTML, and making it one only bubbles <head> metadata into the copy.
BLOCK_TAGS = {"address", "article", "aside", "blockquote", "body", "button", "caption", "dd",
              "div", "dt", "figcaption", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6",
              "header", "label", "legend", "li", "main", "nav", "p", "section", "td", "th"}

# A class marks a HEADLINE only on a whole-token boundary. Bare-substring 'title' also occurs in
# subtitle / entitlement / window-titlebar / untitled / title-slide — body copy, UI chrome and slide
# containers, which legitimately carry Title Case and must NOT face the sentence-case rule.
_HEADLINE_RE = re.compile(r"(?:^|[-_])(?:title|headline)(?:[-_]|$)")
_HEADLINE_EXACT = {"htitle"}          # the library's letter-glued headline class
_HEADLINE_DENY = {"subtitle", "subtitle-caption", "title-slide", "title-bar", "titlebar",
                  "untitled", "entitlement"}


def _is_headline_class(cls) -> bool:
    for c in cls:
        c = c.lower()
        if c in _HEADLINE_DENY:
            continue
        if c in _HEADLINE_EXACT or _HEADLINE_RE.search(c):
            return True
    return False


def _read_utf8(path: str) -> str:
    raw = open(path, "rb").read()
    return raw.decode("utf-8-sig", "strict")


class _VisibleHTML(HTMLParser):
    """Collect visible block text and scope voice-keep to one HTML element, not a source line."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.out = []
        self.waivers = 0
        self.ignore_depth = 0
        self._last_closed = None   # (endtag line, index in self.out) of the last emitted element
        self._waived_out = set()   # indices in self.out waived by a trailing voice-keep marker

    def handle_starttag(self, tag, attrs):
        tag = tag.lower(); attrs_d = dict(attrs)
        if tag in IGNORE_TAGS:
            self.ignore_depth += 1
        cls = (attrs_d.get("class") or "").split()
        # UI CHROME is not prose and must not be linted as prose. A deck that reproduces a real
        # artifact carries terminal output, script names, filenames, URLs, product names and
        # window titles; `render_qa.py + voice_lint.py + layout_qa.py` is not "three clipped
        # sentences" and "Experience Story Builder" is not Title Case, it is a product. Before
        # this existed the only escape was `voice-keep`, which is capped at ONE earned contrast,
        # so an honest deck had to either fail the gate or blow the cap (a Premier League build
        # needed 28). Chrome is skipped outright and never counts against that cap, keeping the
        # cap meaningful for what it is actually for.
        if "ui-chrome" in cls or "data-ui-chrome" in attrs_d:
            self.ignore_depth += 1
            attrs_d["__chrome__"] = True
        # `<div data-voice-keep>` is a BOOLEAN attribute: HTMLParser gives it the value None, so
        # `.get(...) is not None` was False and the documented waiver silently did nothing — you
        # had to write data-voice-keep="" to make it work. Test for PRESENCE, not value.
        waived = "voice-keep" in cls or "data-voice-keep" in attrs_d
        # headlines are authored on real h1-h6 AND on styled div/p carrying a title/headline class
        # (the house component library does the latter) — both must face the sentence-case check.
        heading = tag in _HTAGS or _is_headline_class(cls)
        self.stack.append({"tag": tag, "line": self.getpos()[0], "chunks": [],
                           "waived": waived, "block": tag in BLOCK_TAGS, "heading": heading,
                           "chrome": bool(attrs_d.get("__chrome__"))})

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        self.handle_endtag(tag)

    def handle_data(self, data):
        if not self.ignore_depth and self.stack:
            self.stack[-1]["chunks"].append(data)

    def handle_comment(self, data):
        if "voice-keep" not in data.lower():
            return
        # Case 1 — the documented convention: the marker sits straight AFTER an element on the same
        # source line. That element is already popped, so waive exactly ITS record. Waiving the
        # innermost still-OPEN ancestor here would blanket the whole section, and suppressing the raw
        # source LINE would silently drop unrelated co-located copy (real decks pack many blocks onto
        # one line) and inflate the waiver count past the one-earned-contrast rule.
        if self._last_closed and self._last_closed[0] == self.getpos()[0]:
            idx = self._last_closed[1]
            if idx not in self._waived_out:
                self._waived_out.add(idx)
                self.waivers += 1
            self._last_closed = None
            return
        # Case 2 — the marker is INSIDE an element, before it closes: waive that element.
        for node in reversed(self.stack):
            if node["block"]:
                node["waived"] = True
                return

    def handle_endtag(self, tag):
        tag = tag.lower()
        if not self.stack:
            return
        # Tolerate imperfect HTML by closing through the matching open tag.
        idx = next((i for i in range(len(self.stack) - 1, -1, -1)
                    if self.stack[i]["tag"] == tag), len(self.stack) - 1)
        closing = self.stack[idx:]
        self.stack = self.stack[:idx]
        for node in reversed(closing):
            text = re.sub(r"\s+", " ", " ".join(node["chunks"])).strip()
            if node.get("chrome") and self.ignore_depth:
                self.ignore_depth -= 1
            if node["tag"] in IGNORE_TAGS and self.ignore_depth:
                self.ignore_depth -= 1
            if node["waived"]:
                if text:
                    self.waivers += 1
                continue
            if node["block"]:
                if text:
                    self.out.append((node["line"], text, node["heading"]))
                    # remember what just closed so a voice-keep marker straight after it (same
                    # source line) waives exactly THAT element — see handle_comment case 1
                    self._last_closed = (self.getpos()[0], len(self.out) - 1)
            elif self.stack and text:
                self.stack[-1]["chunks"].append(text)


def visible_lines(path: str) -> tuple[list[tuple[int, str, bool]], int]:
    """Return (line, visible text, is-heading) records and the number of scoped waivers."""
    raw = _read_utf8(path)
    if path.lower().endswith((".html", ".htm")):
        p = _VisibleHTML()
        p.feed(raw)
        p.close()
        # element-scoped waivers were already counted in the parser; drop just those records
        records = [rec for i, rec in enumerate(p.out) if i not in p._waived_out]
        return records, p.waivers
    out = []
    waived = 0
    for i, line in enumerate(raw.splitlines(), 1):
        if "voice-keep" in line:
            waived += 1
            continue
        txt = re.sub(r"\s+", " ", html_lib.unescape(line)).strip()
        out.append((i, txt, False))
    return out, waived


def is_title_case(text: str) -> bool:
    """Per-sentence: >=2 capitalised significant words BEYOND the first word of a sentence
    (proper nouns can't be told apart, so a single one never triggers)."""
    if len(text) > 70:
        return False
    text = PRODUCT_RE.sub("", text)
    for sentence in re.split(r"[.!?·:]+", text):
        words = re.findall(r"[A-Za-z][\w'’-]*", sentence)
        if len(words) < 3:
            continue
        # a small word capitalised mid-sentence is a dead giveaway on its own
        if any(w.lower() in SMALLWORDS and w[0].isupper() for w in words[1:]):
            return True
        sig_caps = [w for w in words[1:] if w.lower() not in SMALLWORDS and w[0].isupper()]
        if len(sig_caps) >= 2:
            return True
    return False


def main() -> int:
    ap = argparse.ArgumentParser(description="Adobe-voice / de-Claude copy lint")
    ap.add_argument("file")
    ap.add_argument("--slug")
    ap.add_argument("--project-root", default=None)
    ap.add_argument("--max-dash-per-100w", type=float, default=3.0)
    a = ap.parse_args()

    if not os.path.isfile(a.file):
        print(f"[FAIL] file not found: {a.file}"); return 1

    gate_root = None
    gate_sha_before = None
    if a.slug:
        if not a.file.lower().endswith((".html", ".htm")):
            print("[GATE FAIL] --slug may record voice_lint only when the linted file is the built HTML deck")
            return 1
        here = os.path.dirname(os.path.abspath(__file__))
        sys.path.insert(0, os.path.join(here, "..", "..", "experience-story-builder", "scripts"))
        from pipeline_state import resolve_root, deck_sha
        gate_root = resolve_root(a.project_root)
        gate_sha_before = deck_sha(a.file, gate_root, a.slug)
        if not gate_sha_before:
            print("[GATE FAIL] artifact could not be fingerprinted")
            return 1

    findings: list[str] = []
    total_words = 0
    total_dashes = 0

    try:
        records, waiver_count = visible_lines(a.file)
    except UnicodeDecodeError as e:
        print(f"[VOICE LINT] invalid encoding in {a.file}: expected UTF-8 ({e}). Gate NOT passed.")
        return 1
    if waiver_count > 1:
        findings.append(f"GLOBAL VOICE-KEEP {waiver_count} waivers found — at most one earned contrast is allowed")

    for lineno, txt, is_heading in records:
        if not txt:
            continue
        total_words += len(txt.split())
        total_dashes += txt.count("—") + txt.count("–")
        for label, rx in PATTERNS:
            for m in rx.finditer(txt):
                findings.append(f"L{lineno:<5} {label:<10} …{txt[max(0, m.start()-24):m.end()+24].strip()}…")
        # STACCATO: three+ consecutive sentences of <=3 words ("Three taps. One trip. Zero
        # surprises.") — listed in references/adobe-voice.md as one-word-sentence emphasis
        # but previously unenforced; it shipped on the Northwind conclusion headline.
        sentences = [s.strip() for s in re.split(r"[.!?]+", txt) if s.strip()]
        if len(sentences) >= 3:
            run = 0
            for s in sentences:
                run = run + 1 if len(s.split()) <= 3 else 0
                if run >= 3:
                    findings.append(f"L{lineno:<5} {'STACCATO':<10} …{txt.strip()[:64]}… "
                                    f"(3+ clipped sentences in a row — write one real sentence)")
                    break
        if is_heading and is_title_case(txt):
            findings.append(f"L{lineno:<5} TITLE-CASE \"{txt}\" — Adobe headlines are sentence case")

    dash_rate = (total_dashes * 100.0 / total_words) if total_words else 0.0
    if dash_rate > a.max_dash_per_100w:
        findings.append(f"GLOBAL DASH-DENSITY {total_dashes} em/en dashes in {total_words} words "
                        f"({dash_rate:.1f}/100w > {a.max_dash_per_100w}) — replace most with periods")

    if findings:
        print(f"[VOICE LINT] {len(findings)} finding(s) in {a.file}:\n")
        for f in findings:
            print(f"  {f}")
        print("\nRewrite each (references/adobe-voice.md has the fix per pattern), mark at most")
        print("ONE earned contrast with voice-keep, then re-run. Exit 1 — gate NOT passed.")
        return 1

    if a.slug:
        try:
            here = os.path.dirname(os.path.abspath(__file__))
            sys.path.insert(0, os.path.join(here, "..", "..", "experience-story-builder", "scripts"))
            from pipeline_state import resolve_root, set_gate, deck_sha
            root = gate_root or resolve_root(a.project_root)
            dsha = deck_sha(a.file, root, a.slug)
            # Catch an edit/autosave between parsing and attestation.
            if not dsha or dsha != gate_sha_before:
                print("[GATE FAIL] artifact changed while voice_lint was running; rerun on stable output")
                return 1
            set_gate(root, a.slug, "voice_lint", "passed",
                     note=f"voice_lint.py clean on {a.file}", deck_sha_hex=dsha,
                     attested_by="voice_lint.py")
            print(f"[GATE OK] voice_lint passed for '{a.slug}' ({total_words} words, "
                  f"{dash_rate:.1f} dashes/100w). Gate recorded.")
        except Exception as e:
            print(f"[GATE OK] copy clean, but gate not recorded ({e})")
    else:
        print(f"[OK] copy is clean ({total_words} words, {dash_rate:.1f} dashes/100w)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
