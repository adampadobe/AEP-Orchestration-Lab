#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
sanitize_screen.py — flatten & lint a generated screen into a ship-safe, offline, banked entry.

DRAFT for the "generate-once, bank-it" workflow (research Area 7): a maintainer generates a screen
with any UI tool (Stitch / v0 / Claude-HTML), then runs this to enforce the asset rules before it
enters the shared library — so no per-user tokens and no license/offline landmines ship downstream.

Checks (and auto-fixes the safe ones):
  * external network refs   — <link>/<script>/@import to fonts.googleapis / use.typekit / cdnjs /
                              unpkg / jsdelivr / any http(s) host        -> FLAG (offline breaker)
  * Adobe Clean / Typekit   — font files or kit links                    -> FLAG (license)
  * font-family              — ensure the Source Sans 3 ship stack        -> AUTOFIX (append fallback)
  * emoji in markup          — pictographic chars                         -> FLAG (use inline SVG)
  * external <img src=http>  — remote images                             -> FLAG (embed/localise)
  * raw device/brand imagery — <img> whose alt/src hints a logo/device    -> WARN (trademark check)

Usage:
  python sanitize_screen.py screen.html [--fix] [--json]
Exit 0 = clean (warnings allowed).  Exit 1 = blocking issue found (network ref / Adobe Clean file).
Not a full sanitizer yet — it lints + does the safe font fix; the maintainer resolves flags.
"""
from __future__ import annotations
import argparse, json, re, sys
from html.parser import HTMLParser

try: sys.stdout.reconfigure(encoding="utf-8")
except Exception: pass

SHIP_STACK = "'Adobe Clean','Source Sans 3','Inter',system-ui,sans-serif"
NET_HOST = re.compile(r"""(href|src)\s*=\s*['"]https?://[^'"]+""", re.I)
CDN_HINT = re.compile(r"(fonts\.googleapis|use\.typekit|cdnjs\.cloudflare|unpkg\.com|cdn\.jsdelivr|kit\.fontawesome)", re.I)
IMPORT_NET = re.compile(r"@import\s+(url\()?['\"]?https?://", re.I)
# Only a Typekit kit or an Adobe Clean @font-face is a block — 'Adobe Clean' first in a
# font-family STACK is correct (it resolves internally; Source Sans 3 ships).
TYPEKIT = re.compile(r"use\.typekit\.net", re.I)
ADOBE_CLEAN_FACE = re.compile(r"@font-face[^}]*adobe[-_ ]?clean", re.I | re.S)
# Emoji are forbidden in client-facing markup. The astral planes are unambiguous; the BMP symbol
# blocks (U+2600-27BF, U+2B00-2BFF) MIX genuine emoji the house style bans (✅ ❌ ✨
# ⚡ ⭐ ⚠ ❤) with typographic glyphs decks legitimately use (✓ ✗
# ★ ✏), so those blocks are matched and then filtered through _TYPOGRAPHIC_OK. The arrows
# block (U+2190-21FF) is wholly typographic and is deliberately NOT matched. Keep this in step with
# voice_lint.py's EMOJI rule — the two gates must not disagree about the same character.
_EMOJI_CANDIDATE = re.compile("[🀀-🫿🇦-🇿☀-➿⬀-⯿]")
_TYPOGRAPHIC_OK = {"✓", "✔", "✕", "✖", "✗", "✘",   # check / cross marks
                   "★", "☆",                                             # black / white star
                   "✏", "✒"}                                             # pencil, nib


def emoji_hits(html: str) -> list:
    """Genuine emoji in the markup (typographic glyphs allowed through)."""
    return [m.group(0) for m in _EMOJI_CANDIDATE.finditer(html) if m.group(0) not in _TYPOGRAPHIC_OK]
FONT_FAMILY = re.compile(r"font-family\s*:\s*([^;}\n]+)", re.I)
IMG_NET = re.compile(r"<img[^>]+src\s*=\s*['\"]https?://[^'\"]+['\"][^>]*>", re.I)
LOGO_HINT = re.compile(r"(logo|brandmark|wordmark|iphone|android|pixel|galaxy|macbook)", re.I)


class _RefScan(HTMLParser):
    """Find external refs together with the TAG that owns them, so a nav <a href> (which loads
    nothing at render) can be told apart from a resource ref (<link>/<script>/<source>… — a real
    offline breaker). Sniffing the tag by scanning back to the nearest '<' was fooled in BOTH
    directions by a literal '<' inside an earlier attribute value: it false-blocked
    <a aria-label="in <5 min" href=…> and silently downgraded <link data-note="<a x" href=cdn…>
    to a mere warning."""
    RESOURCE_ATTRS = {"href", "src", "poster", "data", "srcset"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.anchors, self.resources = [], []

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        for name, value in attrs:
            if not value:
                continue
            name, v = name.lower(), value.strip()
            if not re.match(r"(https?:)?//", v, re.I):
                continue
            if tag == "a" and name == "href":
                self.anchors.append(f'<a href="{v[:60]}">')
            elif name in self.RESOURCE_ATTRS:
                self.resources.append(f'<{tag} {name}="{v[:60]}">')

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)


def scan(html: str):
    errors, warns, fixes = [], [], []
    rs = _RefScan()
    try:
        rs.feed(html)
    except Exception:
        pass    # malformed markup: the regex checks below still run
    for r in rs.resources:
        errors.append(f"external ref: {r} — offline breaker")
    for a_ in rs.anchors:
        # a nav link loads nothing at render, so it does not break offline rendering
        warns.append(f"external <a href> (nav link, not loaded at render): {a_}")
    if IMPORT_NET.search(html): errors.append("@import over http(s) — offline breaker")
    if TYPEKIT.search(html): errors.append("Typekit kit link — not ship-safe (embed Source Sans 3)")
    if ADOBE_CLEAN_FACE.search(html): errors.append("@font-face embeds Adobe Clean — forbidden; embed Source Sans 3")
    for m in IMG_NET.finditer(html): errors.append(f"remote <img>: {m.group(0)[:70]}… (embed or localise)")
    for m in FONT_FAMILY.finditer(html):
        fam = m.group(1).strip()
        if "source sans 3" not in fam.lower():
            fixes.append((m.group(0), f"font-family:{SHIP_STACK}"))
    hits = emoji_hits(html)
    if hits: errors.append("emoji found in markup (%s) — replace with inline SVG from "
                           "components/icons/pack.json" % "".join(sorted(set(hits))[:6]))
    for m in LOGO_HINT.finditer(html):
        warns.append(f"possible logo/device art near '{m.group(0)}' — confirm trademark clearance"); break
    return errors, warns, fixes


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("html"); ap.add_argument("--fix", action="store_true"); ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    html = open(a.html, encoding="utf-8").read()
    errors, warns, fixes = scan(html)

    if a.fix and fixes:
        for old, new in fixes: html = html.replace(old, new)
        open(a.html, "w", encoding="utf-8").write(html)

    if a.json:
        print(json.dumps({"errors": errors, "warnings": warns,
                          "font_fixes": len(fixes), "fixed": bool(a.fix)}, indent=2));
    else:
        print(f"=== sanitize_screen · {a.html} ===")
        for e in errors: print(f"[BLOCK] {e}")
        for w in warns:  print(f"[warn]  {w}")
        print(f"font-family fixes {'APPLIED' if a.fix else 'available'}: {len(fixes)} "
              f"(run with --fix to append the Source Sans 3 stack)")
        print("RESULT:", "BLOCKED — resolve [BLOCK] items before banking." if errors
              else "ship-safe (warnings are maintainer judgement).")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
