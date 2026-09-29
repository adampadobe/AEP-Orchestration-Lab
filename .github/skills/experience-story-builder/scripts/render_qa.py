#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
render_qa.py — deterministic POST-BUILD gate for a rendered experience-story deck.

The pre-build gates (preflight/validate/brand/assets) stop a bad spec reaching the builder,
but nothing checked the OUTPUT — the Monzo regression shipped a deck where every pre-build
gate was green while the Adobe logo 404'd, the fetched Monzo logo sat unused, and a
hand-drawn "Adobe" wordmark was inlined as an SVG path. Prose QA rules were narrated past.
This script is the code backstop: it inspects the built HTML and exits 1 on the failure
classes that actually shipped.

Checks
  1. BROKEN-REF   every src/href/url(...) asset reference resolves to a real file
  2. LOGO-UNUSED  the fetched customer logo (assets/<slug>/brand.json -> logo) is referenced
  3. ADOBE-UNUSED at least one real Adobe mark file (wordmark*/symbol*) is referenced
  4. DRAWN-MARK   inline <svg> with a wide (wordmark-shaped) viewBox and a long single-fill
                  path near a brand keyword -> a redrawn logo (licensing violation)
  5. TEXT-LOGO    an element whose class says it IS a logo/wordmark/lockup (or names the
                  customer) but contains only styled text, no <img>/<svg> asset

Usage:
  python render_qa.py demos/<slug>/index.html --slug <slug> [--project-root <root>] [--strict]

Exit 0 = PASS (auto-records pipeline gate render_qa=passed for the slug).
Exit 1 = FAIL (gate NOT recorded; fix and re-run). --strict promotes WARN to FAIL.
"""
from __future__ import annotations
import argparse, html as html_lib, json, os, re, sys, urllib.parse
from html.parser import HTMLParser

try: sys.stdout.reconfigure(encoding="utf-8")
except Exception: pass

BRAND_WORDS_BASE = ("adobe", "wordmark", "logo", "lockup", "brandmark")
CSS_REF_RE = re.compile(r"""url\(\s*['"]?([^'")]+)['"]?\s*\)|@import\s+(?:url\()?\s*['"]([^'"]+)['"]""", re.I)
SVG_RE = re.compile(r"<svg\b[^>]*>.*?</svg>", re.I | re.S)
VIEWBOX_RE = re.compile(r"""viewBox\s*=\s*["']\s*[\d.+-]+[\s,]+[\d.+-]+[\s,]+([\d.+-]+)[\s,]+([\d.+-]+)""", re.I)
PATH_D_RE = re.compile(r"""<path\b[^>]*\bd\s*=\s*["']([^"']+)["']""", re.I)
CLASS_RE = re.compile(r"""class\s*=\s*["']([^"']+)["']""", re.I)


def is_local_ref(ref: str) -> bool:
    r = ref.strip()
    return bool(r) and not r.startswith(("data:", "http://", "https://", "//", "#",
                                         "mailto:", "javascript:", "blob:"))


def is_remote_ref(ref: str) -> bool:
    return ref.strip().lower().startswith(("http://", "https://", "//"))


def _css_refs(css: str) -> list[str]:
    css = re.sub(r"/\*.*?\*/", " ", css, flags=re.S)
    return [(m.group(1) or m.group(2) or "").strip() for m in CSS_REF_RE.finditer(css)]


class _ResourceParser(HTMLParser):
    """Extract resources that must load for an offline deck; ordinary <a href> links are not assets."""
    RESOURCE_ATTRS = {
        "img": ("src", "srcset"), "script": ("src",), "link": ("href",),
        "source": ("src", "srcset"), "video": ("src", "poster"), "audio": ("src",),
        "iframe": ("src",), "embed": ("src",), "object": ("data",), "input": ("src",),
        "image": ("href", "xlink:href"), "use": ("href", "xlink:href"),
    }

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.refs: list[str] = []
        self.slides = 0
        self._in_style = False

    def handle_starttag(self, tag, attrs):
        tag = tag.lower(); attrs = dict(attrs)
        if tag == "section" and "slide" in (attrs.get("class") or "").split():
            self.slides += 1
        if tag == "style":
            self._in_style = True
        for attr in self.RESOURCE_ATTRS.get(tag, ()):
            value = attrs.get(attr)
            if not value:
                continue
            if attr == "srcset":
                self.refs.extend(part.strip().split()[0] for part in value.split(",") if part.strip())
            else:
                self.refs.append(value)
        if attrs.get("style"):
            self.refs.extend(_css_refs(attrs["style"]))

    def handle_endtag(self, tag):
        if tag.lower() == "style":
            self._in_style = False

    def handle_data(self, data):
        if self._in_style:
            self.refs.extend(_css_refs(data))


def resource_refs(raw: str) -> tuple[list[str], int]:
    p = _ResourceParser()
    p.feed(raw)
    return p.refs, p.slides


def strip_font_data(html: str) -> str:
    """Drop base64 font/data payloads so regexes stay fast and don't false-positive."""
    return re.sub(r"data:[^\"')]+", "data:STRIPPED", html)


def strip_scripts_styles(html: str) -> str:
    """Blank out <script>/<style>/<title> bodies. Asset refs (src/href/url), inline SVG marks and
    text-logo spans live in MARKUP — a runtime bundle inlined into a <script> (e.g. Chart.js,
    which contains url()/href strings) must not be scanned for them, or it false-positives.

    <title> is blanked for the same reason: it lives in <head> and is NEVER rendered on a slide, so
    it cannot be a drawn-in-text logo. Naming a deck after its customer (<title>Dyson</title>) used
    to trip TEXT-LOGO and send the builder hunting for a text logo that does not exist. Monzo only
    escaped because its title is a long sentence.
    """
    return re.sub(r"<(script|style|title)\b[^>]*>.*?</\1>", " ", html, flags=re.I | re.S)


_ENTITY = {"&amp;": "&", "&lt;": "<", "&gt;": ">", "&pound;": "£", "&mdash;": "-",
           "&ndash;": "-", "&middot;": "·", "&rsquo;": "'", "&lsquo;": "'",
           "&ldquo;": '"', "&rdquo;": '"', "&times;": "x", "&nbsp;": " ", "&hellip;": "..."}


def _visible_text(html: str) -> str:
    """Human-visible text: drop scripts/styles/comments/tags, decode common entities."""
    s = re.sub(r"<!--.*?-->|<(script|style)\b[^>]*>.*?</\1>", " ", html, flags=re.I | re.S)
    s = re.sub(r"<[^>]+>", " ", s)
    for k, v in _ENTITY.items():
        s = s.replace(k, v)
    s = re.sub(r"&#?\w+;", " ", s)
    return s


def _norm_words(s: str) -> str:
    """Lowercase word-sequence, punctuation/case/spacing removed — the fidelity key.
    'Eight minutes' and 'eight minutes' match; 'Eight' vs '8' do NOT (a real content change).
    Money/percent REPRESENTATION is normalised so '£650' == '650 pounds' and '5%' == '5 percent'
    (a rendering choice, not a content change) — but the digits still must match, so £650 vs
    £700 is still caught."""
    s = s.lower()
    for k, v in _ENTITY.items():
        s = s.replace(k, v.lower())
    s = s.replace("£", "").replace("$", "").replace("€", "")
    s = s.replace("%", " percent")
    s = re.sub(r"\b(pounds?|gbp|dollars?|usd|euros?|eur|pence|cents?)\b", " ", s)
    return " ".join(re.findall(r"[a-z0-9]+", s))


def main() -> int:
    ap = argparse.ArgumentParser(description="Deterministic render QA for a built deck")
    ap.add_argument("deck")
    ap.add_argument("--slug", required=True)
    ap.add_argument("--project-root", default=None)
    ap.add_argument("--strict", action="store_true", help="promote WARN to FAIL")
    a = ap.parse_args()

    deck_path = os.path.abspath(a.deck)
    if not os.path.isfile(deck_path):
        print(f"[FAIL] deck not found: {deck_path}"); return 1
    deck_dir = os.path.dirname(deck_path)

    # resolve project root the same way pipeline_state does
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from pipeline_state import resolve_root, set_gate, deck_sha
    root = resolve_root(a.project_root)
    artifact_sha = deck_sha(deck_path, root, a.slug)
    if not artifact_sha:
        print("[FAIL] could not fingerprint the deck artifact"); return 1

    raw = open(deck_path, encoding="utf-8", errors="replace").read()
    # MARKUP-only view for ref / mark / text-logo scans (scripts+styles blanked so an inlined
    # runtime like Chart.js can't false-positive); font/data URIs stripped too.
    html = strip_scripts_styles(strip_font_data(raw))
    # STYLES-preserving view (payloads stripped) for the font checks — font-family + @font-face
    # live in <style> blocks, which `html` blanks. Base64 payloads become data:STRIPPED (fast,
    # and \bdata: still matches so embedded @font-face src is detected).
    styled = strip_font_data(raw)
    errors: list[str] = []
    warns: list[str] = []

    # ---- 0. structural floor -----------------------------------------------------
    extracted_refs, slide_count = resource_refs(raw)
    if slide_count <= 0:
        errors.append("DECK-EMPTY   no <section class='slide'> elements found")

    # ---- 1. every required asset reference resolves -----------------------------
    refs = set()
    for raw_ref in extracted_refs:
        ref = html_lib.unescape(raw_ref).strip()
        if is_remote_ref(ref):
            errors.append(f"REMOTE-REF   {ref} — customer-facing decks must render offline")
            continue
        ref = urllib.parse.unquote(ref.split("?")[0].split("#")[0])
        if is_local_ref(ref):
            refs.add(ref)
    for ref in sorted(refs):
        target = os.path.normpath(os.path.join(deck_dir, ref))
        try:
            if os.path.commonpath([root, os.path.abspath(target)]) != os.path.abspath(root):
                errors.append(f"OUTSIDE-REF  {ref} -> {target} escapes the project root")
                continue
        except ValueError:
            errors.append(f"OUTSIDE-REF  {ref} -> {target} is on another drive")
            continue
        if not os.path.isfile(target):
            errors.append(f"BROKEN-REF   {ref}  ->  {target} (file does not exist)")

    resolved_basenames = {os.path.basename(r).lower() for r in refs}

    # ---- 2. fetched customer logo must actually be used -------------------------
    # match by basename OR by file content (deck-local copies may be renamed)
    import hashlib
    def _hash(p):
        try: return hashlib.sha256(open(p, "rb").read()).hexdigest()
        except OSError: return None
    resolved_hashes = {_hash(os.path.normpath(os.path.join(deck_dir, r))) for r in refs} - {None}

    brand_json = os.path.join(root, "assets", a.slug, "brand.json")
    customer_words: list[str] = [a.slug.split("-")[0].lower()]
    if os.path.isfile(brand_json):
        try:
            brand = json.load(open(brand_json, encoding="utf-8"))
            logo = str(brand.get("logo") or "").strip()
            logo_path = os.path.join(root, "assets", a.slug, logo) if logo else ""
            used = (os.path.basename(logo).lower() in resolved_basenames or
                    (_hash(logo_path) in resolved_hashes if logo_path else False))
            if not logo:
                errors.append(f"BRAND-LOGO   {brand_json} contains no resolved logo")
            elif not used:
                errors.append(
                    f"LOGO-UNUSED  fetched customer logo assets/{a.slug}/{logo} is never "
                    f"referenced by the deck (by name or content) — a text/hand-drawn "
                    f"stand-in is suspected")
            # A scraped palette is a guess. brand_fetch prints "verify this!" and writes the file
            # anyway — so without this gate the guess ships and the customer sees their own brand
            # in the wrong colours, with every check green. A human must confirm the values.
            if brand.get("palette_verified") is False:
                errors.append(
                    f"BRAND-UNVERIFIED  assets/{a.slug}/brand.json has palette_verified=false "
                    f"(scraped from {brand.get('source') or 'unknown'}, confidence "
                    f"{brand.get('palette_confidence') or 'unknown'}). A scraped palette is a GUESS "
                    f"and a live campaign skin poisons it. Confirm the hex values against the "
                    f"brand's own guidelines, then set \"palette_verified\": true.")
            # The dark-background logo variant on a light deck is an invisible rectangle. Every
            # other check passes: it IS referenced, it IS the real file. Only this catches it.
            if brand.get("logo_needs_dark_background") is True:
                errors.append(
                    f"LOGO-INVISIBLE  assets/{a.slug}/{logo} paints only near-white "
                    f"({', '.join((brand.get('logo_profile') or {}).get('fills') or []) or 'white'}) "
                    f"— it is the dark-background variant. Confirm every placement sits on a dark "
                    f"surface, or fetch the light-background variant. If the placements ARE dark, "
                    f"set \"logo_needs_dark_background\": false to record that you checked.")
        except Exception as e:
            warns.append(f"BRAND-JSON   unreadable {brand_json}: {e}")
    else:
        errors.append(f"BRAND-JSON   missing {brand_json} — cannot verify the customer logo is used")

    # ---- 3. a real Adobe mark file must be used ----------------------------------
    adobe_dir = os.path.join(root, "assets", "adobe")
    if os.path.isdir(adobe_dir):
        adobe_marks = {f.lower() for f in os.listdir(adobe_dir)
                       if re.match(r"(wordmark|symbol).*\.(svg|png)$", f, re.I)}
        if not adobe_marks:
            errors.append("ADOBE-MISSING assets/adobe contains no approved wordmark*/symbol* file")
        elif not (adobe_marks & resolved_basenames):
            errors.append(
                "ADOBE-UNUSED no Adobe mark file (assets/adobe/wordmark-*/symbol-*) is "
                "referenced — the Adobe logo is missing or redrawn by hand")
    else:
        errors.append(f"ADOBE-MISSING {adobe_dir} does not exist")

    # ---- 4. hand-drawn wordmark heuristic ----------------------------------------
    brand_words = list(BRAND_WORDS_BASE) + customer_words
    for m in SVG_RE.finditer(html):
        svg = m.group(0)
        vb = VIEWBOX_RE.search(svg)
        if not vb:
            continue
        try:
            w, h = float(vb.group(1)), float(vb.group(2))
        except ValueError:
            continue
        if h <= 0 or (w / h) < 2.5:          # icons are square-ish; wordmarks are wide
            continue
        d_total = sum(len(d.group(1)) for d in PATH_D_RE.finditer(svg))
        if d_total < 400:                     # too little geometry to be a wordmark
            continue
        ctx = html[max(0, m.start() - 200):min(len(html), m.end() + 200)].lower()
        hit = next((wd for wd in brand_words if wd in ctx or wd in svg.lower()), None)
        msg = (f"DRAWN-MARK   inline <svg viewBox {w:g}x{h:g}> with {d_total} chars of path "
               f"data looks like a hand-drawn wordmark"
               + (f" (near '{hit}')" if hit else "")
               + " — use the real asset file, never redraw a brand mark")
        (errors if hit else warns).append(msg)

    # ---- 5. text-span logo stand-ins — CONTENT-based, not just class-based ----------
    # A classless <span style="font-family:Georgia">northwind</span> in the cover nav shipped
    # because the old check only fired on logo/wordmark/lockup CLASSES. Now: any element whose
    # visible text IS the brand name (or "adobe") is a suspected fake mark UNLESS it's inside a
    # device mock (a phone-UI wordmark is legitimate app chrome). Extra weight if it sits in a
    # chrome slot (.nav/.foot/.lockup/.cover) or carries a font-family override.
    brand_names = {w for w in customer_words} | {"adobe"}
    mock_spans = [(mm.start(), mm.end()) for mm in
                  re.finditer(r"<(?:div|section)\b[^>]*class\s*=\s*[\"'][^\"']*"
                              r"\b(?:phone|pscreen|esb-laptop|screen|ptop|mzhead)\b.*?</(?:div|section)>",
                              html, re.I | re.S)]
    def in_mock(pos):
        return any(s <= pos < e for s, e in mock_spans)
    for m in re.finditer(r"<(\w+)\b([^>]*)>\s*([^<]{1,40})\s*</\1>", html):
        attrs, text = m.group(2), m.group(3).strip()
        if text.lower() not in brand_names or in_mock(m.start()):
            continue
        cm = CLASS_RE.search(attrs)
        cls = (cm.group(1).lower() if cm else "")
        # logo-family terms match as SUBSTRINGS (catch mzlogo, wordmonzo, brandmark); layout-slot
        # terms match word-bounded (avoid 'discover'→cover, 'navy'→nav)
        logo_cls = any(w in cls for w in ("logo", "wordmark", "lockup", "brandmark"))
        slot_cls = bool(re.search(r"\b(nav|foot|cover|brand)\b", cls))
        chrome = logo_cls or slot_cls
        has_font = "font-family" in attrs.lower()
        # a bare brand-name text node in deck chrome (or with a font override) is a fake mark
        if chrome or has_font or not cls:
            errors.append(
                f"TEXT-LOGO    <{m.group(1)}{' class=' + repr(cm.group(1)) if cm else ''}>{text}"
                f"</{m.group(1)}> renders the brand as styled TEXT (font-override={has_font}, "
                f"chrome-slot={chrome}) — use the fetched logo <img>, never hand-type the mark")

    # ---- 5b. every genuinely-custom named face must be EMBEDDED (by family), else it silently
    #          falls back off this machine. Web-safe faces (ship on all OSes) are exempt; so is
    #          'Adobe Clean' (the aspirational licensed-upgrade sentinel — SS3 is its shippable
    #          floor and IS required to embed). Northwind embedded nothing and named SS3.
    SYSTEM = {"sans-serif", "serif", "monospace", "system-ui", "-apple-system", "blinkmacsystemfont",
              "inherit", "initial", "ui-sans-serif", "ui-serif", "cursive", "fantasy", "segoe ui",
              "arial", "helvetica", "inter", "roboto",
              # web-safe (bundled on Win+mac) — no embed needed:
              "georgia", "times new roman", "times", "courier new", "courier", "verdana", "tahoma",
              "trebuchet ms", "palatino", "palatino linotype", "book antiqua", "garamond", "impact"}
    EXEMPT = {"adobe clean"}   # aspirational-first; its shippable floor (SS3) is checked normally
    named_custom = set()
    for fm in re.finditer(r"font-family\s*:\s*([^;}{]+)", styled, re.I):
        for token in fm.group(1).split(","):
            t = token.strip().strip("'\"")
            if t and t.lower() not in SYSTEM and t.lower() not in EXEMPT and not t.startswith("var("):
                named_custom.add(t)
    # a family counts as embedded only if ITS @font-face block ALSO carries a data: src
    # (match the whole block — font-family and src can appear in either order)
    face_families = set()
    for block in re.findall(r"@font-face\s*\{[^}]*\}", styled, re.I | re.S):
        fam = re.search(r"font-family\s*:\s*([^;}]+)", block, re.I)
        if fam and re.search(r"src\s*:[^;}]*\bdata:", block, re.I):
            face_families.add(fam.group(1).strip().strip("'\"").lower())
    for f in sorted(named_custom):
        if f.lower() not in face_families:
            errors.append(
                f"FONT-UNEMBEDDED  '{f}' is named in font-family but no @font-face embeds it with a "
                f"data: src — off a machine without it the deck renders in a fallback (silent "
                f"stand-in). Inline assets/adobe/fonts.css (embedded Source Sans 3).")
    # ---- 5c. banned slop defaults as the PRIMARY face ------------------------------------
    for fm in re.finditer(r"font-family\s*:\s*(['\"]?)(inter|roboto)\b", html, re.I):
        warns.append(f"SLOP-FONT    '{fm.group(2)}' used as a primary face — the frontend-slides "
                     f"aesthetic bans Inter/Roboto defaults; lead with Adobe Clean/Source Sans 3.")

    # ---- 5d. showy-animation density: >1 distinct SHOWY family per slide (each says "use
    #          sparingly — one per slide"). Warn, not fail — density is a taste call. Source of
    #          truth for the list is the `showy` tag in components/catalog.json. --------------
    SHOWY = {"back-in-up", "light-speed-in-right", "flip-in-x", "back-out-down", "swing",
             "puff-in", "vanish-in", "vanish-out", "space-in-up", "space-in-down",
             "space-out-up", "boing-in-up", "perspective-down-return"}
    for si, sec in enumerate(re.split(r"(?=<section\b)", html)):
        if not re.match(r"<section\b[^>]*class\s*=\s*[\"'][^\"']*\bslide\b", sec):
            continue
        used = set()
        for cm in re.finditer(r'class\s*=\s*"([^"]+)"', sec):
            used |= set(cm.group(1).split()) & SHOWY
        if len(used) > 1:
            t = re.search(r"<h[12][^>]*>\s*([^<]{1,40})", sec)
            label = (t.group(1).strip() if t else f"section {si}")
            warns.append(f"SHOWY-DENSITY slide '{label}' uses {len(used)} showy animations "
                         f"({', '.join(sorted(used))}) — each is 'one per slide, on the hero'. "
                         f"Keep one showy family per slide; use subtle entrances for the rest.")

    # ---- 6. device slides carry a persona photo (photo-led house style, §12) --------
    for si, sec in enumerate(re.split(r"(?=<section\b)", html)):
        if not re.match(r"<section\b[^>]*class\s*=\s*[\"'][^\"']*\bslide\b", sec):
            continue
        if not re.search(r"class\s*=\s*[\"'][^\"']*\b(?:phone|laptop)\b", sec):
            continue
        has_persona = re.search(r"class\s*=\s*[\"'][^\"']*(?:persona-bg|photo-r|persona-photo)", sec)
        waiver = re.search(r"data-no-persona\s*=\s*[\"']([^\"']{5,})[\"']", sec)
        t = re.search(r"<h[12][^>]*>\s*([^<]{1,50})", sec)
        label = (t.group(1).strip() if t else f"section {si}")
        if has_persona:
            continue
        if waiver:
            warns.append(f"NO-PERSONA   device slide '{label}' waived: {waiver.group(1)}")
        else:
            errors.append(
                f"NO-PERSONA   device slide '{label}' shows a phone/laptop mock with no persona "
                f"photo layer (.persona-bg/.photo-r/.persona-photo) and no data-no-persona waiver "
                f"— photo-led rule, imagery-and-assets.md §12")

    # ---- 7. copy fidelity — storyboard on_screen_copy must reach the deck --------------
    # (Northwind reworded step copy: "Eight minutes"→"8 min", "Boarding"→lowercase, sentences
    #  split across UI rows. Numbers/names surviving isn't enough — the words are the contract.)
    sb_path = os.path.join(root, "demos", f"{a.slug}-storyboard.json")
    if os.path.isfile(sb_path):
        try:
            sb = json.load(open(sb_path, encoding="utf-8"))
        except Exception as e:
            warns.append(f"STORYBOARD   unreadable {sb_path}: {e}")
            sb = None
        if sb:
            visible = _visible_text(html)
            vnorm = _norm_words(visible)
            for i, step in enumerate(sb.get("story_steps", [])):
                vd = step.get("visual_direction", {}) if isinstance(step, dict) else {}
                copy = (vd.get("on_screen_copy") or "").strip()
                if copy:
                    # require the copy's word sequence to appear; punctuation/case/entity drift ok
                    if _norm_words(copy) not in vnorm:
                        # is it at least all-present out of order (decomposed across UI)?
                        words = set(_norm_words(copy).split())
                        present = sum(1 for w in words if w in set(vnorm.split()))
                        # "decomposed" describes broken word ORDER, not permission to drop or alter
                        # content. Require EVERY word present (a relaxed floor let a changed number —
                        # £650 -> £700 — slip through on exactly the financial slides that matter);
                        # 'decomposed' still suppresses the out-of-order WARN below.
                        if not words or present < len(words):
                            errors.append(
                                f"COPY-MISSING step {i+1}: on_screen_copy not in the deck — "
                                f"{len(words)-present}/{len(words)} words absent: “{copy[:60]}…”")
                        elif not vd.get("decomposed"):
                            warns.append(
                                f"COPY-DECOMPOSED step {i+1}: on_screen_copy is split/reworded across "
                                f"the UI (all words present, sequence broken). If intentional, mark the "
                                f"step \"decomposed\": true in the storyboard; else restore verbatim.")

    # ---- 8. used-but-undefined stagger classes (dead markup — no animation fires) --------
    style_blocks = "\n".join(re.findall(r"<style\b[^>]*>(.*?)</style>", html, re.I | re.S))
    defined = set(re.findall(r"\.([A-Za-z][\w-]*)", style_blocks))
    JS_TOGGLED = {"active", "on", "g"}   # 'g' was Monzo's stagger hook; allow known JS-set classes...
    # ...but if 'g' (or any stagger class) is USED yet has no rule AND no JS assigns it, it's dead.
    used = set()
    for cm in re.finditer(r'class\s*=\s*"([^"]+)"', html):
        used |= set(cm.group(1).split())
    scripts = "\n".join(re.findall(r"<script\b[^>]*>(.*?)</script>", html, re.I | re.S))
    for cls in ("g",):   # the known stagger-hook class; extend if others adopted
        if cls in used and cls not in defined and f"'{cls}'" not in scripts and f'"{cls}"' not in scripts \
           and f".{cls}" not in scripts:
            warns.append(f"DEAD-CLASS   '.{cls}' is used on elements but defined in neither CSS nor "
                         f"JS — those elements get no entrance animation (dropped-CSS assembly bug).")

    # ---- report --------------------------------------------------------------------
    if a.strict:
        errors, warns = errors + warns, []
    for e in errors: print(f"[FAIL] {e}")
    for w in warns:  print(f"[warn] {w}")
    if errors:
        print(f"\n[GATE FAIL] render_qa: {len(errors)} error(s) in {os.path.relpath(deck_path, root)}.")
        print("Fix the deck (real assets, working paths), then re-run. Do NOT mark reviewed.")
        return 1
    final_sha = deck_sha(deck_path, root, a.slug)
    if not final_sha or final_sha != artifact_sha:
        print("\n[GATE FAIL] render_qa: artifact changed while it was being inspected. Re-run on "
              "the stable final output.")
        return 1
    set_gate(root, a.slug, "render_qa", "passed",
             note=f"render_qa.py clean on {os.path.relpath(deck_path, root)}",
             deck_sha_hex=final_sha, attested_by="render_qa.py")
    print(f"[GATE OK] render_qa passed for '{a.slug}' — {len(refs)} asset refs verified, "
          f"logos confirmed real. Gate recorded.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
