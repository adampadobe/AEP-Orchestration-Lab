#!/usr/bin/env python3
"""
List or update AJO content email templates: fluid width and/or taller layout in HTML.

Fixed **width** (e.g. Body 800px) and fixed **height** / **min-height** in the designer show up
in generated HTML. This script uses the Content Templates API (GET + If-Match PUT) to rewrite
common px patterns. JSON Patch on templates only supports /name and /description — not HTML.

Many mobile-first exports also set **`.outer{max-width:360px}`** in embedded CSS. On a wide
AJO canvas that reads as a short/narrow “strip” with lots of empty background; **`fill-preview`**
raises `.outer` to `max-width:100%` and adds **`body{min-height:100vh`** inside the first
`<style>` so the background fills viewport height in web preview (some email clients ignore `vh`).

If the problem is the **AJO editor chrome** (gray area around the canvas), that is UI-only;
this script only changes stored **HTML** on the template.

API: https://github.com/AdobeDocs/journey-optimizer-apis/blob/main/static/content.yaml

Examples:

  python scripts/ajo_email_template_width.py list --name-contains "Premier League"
  python scripts/ajo_email_template_width.py tall --template-id <uuid> --dry-run
  python scripts/ajo_email_template_width.py tall --template-id <uuid> --from-height-px 720
  python scripts/ajo_email_template_width.py tall --template-id <uuid> --min-height-as pct
  python scripts/ajo_email_template_width.py fill-preview --template-id <uuid> --dry-run
  python scripts/ajo_email_template_width.py center --template-id <uuid>
  python scripts/ajo_email_template_width.py clone-enhanced --source-template-id <uuid> \\
    --new-name "Premier League Match Day Personalisation Email Template"
  python scripts/ajo_email_template_width.py clone-hyper --source-template-id <uuid> \\
    --new-name "Premier League Hyper Personalised Email Template"
  python scripts/ajo_email_template_width.py clone-studio --source-template-id <uuid> \\
    --new-name "Premier League Saturday Studio Email Template"
  python scripts/ajo_email_template_width.py hero-placeholder --template-id <uuid> [--hero-size 400]

Requires: requests, adobe-ims-auth (see scripts/fetch_schema.py).
"""
from __future__ import annotations

import argparse
import base64
import copy
import functools
import json
import re
import struct
import sys
import zlib
from typing import Any, Callable

import requests

from adobe_ims_auth import AdobeAuth, aep_request_headers

DEFAULT_CONTENT_BASE = "https://platform.adobe.io/ajo/content"
ACCEPT_TEMPLATE = "application/vnd.adobe.ajo.template.v1+json"
ACCEPT_LIST = "application/vnd.adobe.ajo.template-list.v1+json"
CONTENT_TYPE = "application/vnd.adobe.ajo.template.v1+json"

AUDIT_KEYS = frozenset({"createdAt", "createdBy", "modifiedAt", "modifiedBy"})

# GET responses include read-only / response-only fields; PUT (TemplateReqV1) rejects unknown keys.
# See JOMAL-1100-400 "not marked as ignorable" on fields like referencedFragments.
TEMPLATE_PUT_ROOT_KEYS = frozenset(
    {
        "channels",
        "decisionPolicyIds",
        "description",
        "entityType",
        "labels",
        "name",
        "parentFolderId",
        "source",
        "sourceDecisionPolicyIds",
        "subType",
        "tagIds",
        "template",
        "templateType",
        "type",
    }
)


def content_headers(auth: AdobeAuth, *, accept: str) -> dict[str, str]:
    h = aep_request_headers(auth)
    h["Accept"] = accept
    return h


def strip_for_put(obj: Any) -> Any:
    """Remove read-only / response-only keys so PUT matches content-template schema."""
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            if k in AUDIT_KEYS or k.startswith("_"):
                continue
            if k == "id":
                continue
            out[k] = strip_for_put(v)
        return out
    if isinstance(obj, list):
        return [strip_for_put(x) for x in obj]
    return obj


def filter_content_template_put_root(body: dict[str, Any]) -> dict[str, Any]:
    """Keep only keys accepted by PUT /templates (TemplateReqV1)."""
    inner = strip_for_put(body)
    if not isinstance(inner, dict):
        return inner
    if "template" not in inner or "templateType" not in inner:
        return inner
    return {k: inner[k] for k in TEMPLATE_PUT_ROOT_KEYS if k in inner}


def iter_email_html_bodies(template_block: dict[str, Any]) -> list[tuple[list[str], str]]:
    found: list[tuple[list[str], str]] = []
    tt = template_block.get("templateType")

    if tt == "html":
        inner = template_block.get("template") or {}
        html = inner.get("html")
        if isinstance(html, str):
            found.append((["template", "html"], html))
        return found

    tpl = template_block.get("template")
    if isinstance(tpl, dict):
        html_obj = tpl.get("html")
        if isinstance(html_obj, dict):
            body = html_obj.get("body")
            if isinstance(body, str):
                found.append((["template", "html", "body"], body))
        amp = tpl.get("x-amp-html")
        if isinstance(amp, dict):
            body = amp.get("body")
            if isinstance(body, str):
                found.append((["template", "x-amp-html", "body"], body))
    return found


def set_by_path(root: dict[str, Any], path: list[str], value: str) -> None:
    cur: Any = root
    for key in path[:-1]:
        cur = cur[key]
    cur[path[-1]] = value


def _apply_regex_replacements(
    html: str,
    rules: list[tuple[str, str, str]],
    *,
    dry_run: bool,
    no_match_hint: str,
) -> tuple[str, list[str]]:
    logs: list[str] = []
    s = html

    def run(pat: str, repl: str, desc: str) -> None:
        nonlocal s
        n = len(re.findall(pat, s, flags=re.IGNORECASE))
        if n:
            logs.append(f"  {desc}: {n} match(es)")
        s = re.sub(pat, repl, s, flags=re.IGNORECASE)

    for pat, repl, desc in rules:
        run(pat, repl, desc)

    if s == html and not dry_run:
        logs.append(f"  (no changes: {no_match_hint})")
    return s, logs


def widen_html(html: str, *, from_px: int, dry_run: bool) -> tuple[str, list[str]]:
    px = from_px
    rules: list[tuple[str, str, str]] = [
        (rf"width\s*:\s*{px}px", "width:100%", f"width:{px}px → width:100%"),
        (rf"max-width\s*:\s*{px}px", "max-width:100%", f"max-width:{px}px → max-width:100%"),
        (rf'\bwidth="{px}"', 'width="100%"', f'width="{px}" → width="100%"'),
        (rf"\bwidth='{px}'", "width='100%'", f"width='{px}' → width='100%'"),
    ]
    return _apply_regex_replacements(
        html,
        rules,
        dry_run=dry_run,
        no_match_hint=(
            f'no width:{px}px / max-width:{px}px / width="{px}" patterns found'
        ),
    )


@functools.lru_cache(maxsize=16)
def grey_square_png_data_uri(size: int) -> str:
    """Solid #889090 RGB PNG size×size — compact zlib; works in email clients that block SVG."""
    if size < 1 or size > 4096:
        raise ValueError("size must be 1–4096")

    def chunk(tag: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)

    w = h = size
    r, g, b = 136, 144, 144
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    row = b"\x00" + bytes([r, g, b]) * w
    raw = row * h
    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    return "data:image/png;base64," + base64.b64encode(png).decode("ascii")


def apply_hero_grey_placeholder(html: str, *, size: int = 400) -> tuple[str, list[str]]:
    """
    Replace hero .banner-image <img> ({{image}} or existing grey data URI) with a size×size grey PNG
    data URI and update .banner-image CSS so preview is not a broken icon. Preserves alt and data-source-uuid.
    """
    logs: list[str] = []
    s = html
    uri = grey_square_png_data_uri(size)
    px = f"{size}px"

    css_new = f""".banner-image {{
      display: block;
      width: {px};
      max-width: {px};
      height: {px};
      border-radius: 4px;
      border: 1px solid rgba(232, 168, 0, 0.25);
      object-fit: cover;
      margin: 0 auto;
    }}"""

    s2, n_css = re.subn(
        r"\.banner-image\s*\{[^}]+\}",
        css_new.strip(),
        s,
        count=1,
        flags=re.DOTALL,
    )
    if n_css:
        s = s2
        logs.append(f"  .banner-image: {size}×{size} grey placeholder CSS")
    else:
        logs.append("  (no .banner-image { } rule found)")

    # Hero banner: class banner-image; src may be {{image}} or a prior data URI placeholder.
    img_rx = re.compile(
        r"<img\s+(?=[^>]*\bclass=\"banner-image\")(?=[^>]*\bsrc=\")[^>]*>",
        re.I,
    )

    def repl_img(m: re.Match[str]) -> str:
        tag = m.group(0)
        du_m = re.search(r'data-source-uuid="([^"]+)"', tag, re.I)
        du = f' data-source-uuid="{du_m.group(1)}"' if du_m else ""
        alt_m = re.search(r'alt="([^"]*)"', tag, re.I)
        alt = alt_m.group(1) if alt_m else "Premier League"
        return (
            f'<img src="{uri}" width="{size}" height="{size}" alt="{alt}" class="banner-image"{du} '
            f'style="display:block;width:{px};height:{px};max-width:{px};'
            f'margin:0 auto;object-fit:cover;border-radius:4px;'
            f'border:1px solid rgba(232,168,0,0.25);" />'
        )

    s3, n_img = img_rx.subn(repl_img, s, count=10)
    if n_img:
        s = s3
        logs.append(
            f"  banner hero img: grey {size}×{size} data URI ({n_img} tag(s))"
        )
    else:
        logs.append('  (no <img class="banner-image" …> found)')

    return s, logs


def center_email_html(html: str) -> tuple[str, list[str]]:
    """
    Center main copy: text-align:left→center in CSS, add text-align:center on .outer /
    .banner-wrap / .footer when missing, and margin:0 auto on .banner-image (block).
    """
    logs: list[str] = []
    s = html

    n_left = len(re.findall(r"text-align\s*:\s*left", s, flags=re.I))
    if n_left:
        s = re.sub(r"text-align\s*:\s*left", "text-align:center", s, flags=re.I)
        logs.append(f"  text-align:left → center ({n_left} in CSS)")

    def add_text_align_center(selector: str, label: str) -> None:
        nonlocal s
        # Multiline rules; allow space before `{` (e.g. `.banner-wrap {`).
        pat = rf"({re.escape(selector)}\s*\{{)([\s\S]*?)(\}})"

        def repl(m: re.Match[str]) -> str:
            inner = m.group(2)
            if re.search(r"text-align\s*:\s*center", inner, re.I):
                return m.group(0)
            sep = "" if inner.rstrip().endswith(";") else ";"
            return f"{m.group(1)}{inner}{sep}text-align:center{m.group(3)}"

        old = s
        s = re.sub(pat, repl, s, count=1, flags=re.I)
        if s != old:
            logs.append(f"  {label}: added text-align:center")

    add_text_align_center(".outer", ".outer")
    add_text_align_center(".banner-wrap", ".banner-wrap")

    s2, n_img = re.subn(
        r"(\.banner-image\s*\{\s*display:\s*block)(\s*;\s*width:\s*100%;\s*max-width:\s*330px;)",
        r"\1;margin:0 auto\2",
        s,
        count=1,
        flags=re.I,
    )
    if n_img:
        s = s2
        logs.append("  .banner-image: added margin:0 auto")

    add_text_align_center(".footer", ".footer")

    if s == html:
        logs.append("  (no edits — template may already be centered)")
    return s, logs


def fill_preview_html(
    html: str,
    *,
    outer_max_from_px: int,
    add_body_min_height_vh: bool,
    dry_run: bool,
) -> tuple[str, list[str]]:
    """
    Ease AJO / browser preview: widen .outer max-width in <style> and optionally min-height:100vh on body{}.
    """
    logs: list[str] = []
    s = html

    if add_body_min_height_vh:
        m = re.search(r"<style\s*>", s, re.I)
        if not m:
            logs.append("  (no <style> block; skip body min-height)")
        else:
            start = m.end()
            end_close = s.lower().find("</style>", start)
            if end_close == -1:
                logs.append("  (unclosed <style>; skip body min-height)")
            else:
                chunk = s[start:end_close]
                if re.search(r"body\s*\{[^}]*min-height", chunk, re.I | re.DOTALL):
                    logs.append("  body rule already has min-height in <style>")
                else:
                    new_chunk, n = re.subn(
                        r"body\s*\{",
                        "body{min-height:100vh;",
                        chunk,
                        count=1,
                        flags=re.I,
                    )
                    if n:
                        logs.append("  <style> body{ → body{min-height:100vh;")
                        s = s[:start] + new_chunk + s[end_close:]
                    else:
                        logs.append("  (no body{ in first <style>; skip min-height)")

    pat = rf"\.outer\s*\{{\s*max-width:\s*{outer_max_from_px}px"
    repl = ".outer{max-width:100%"
    n_outer = len(re.findall(pat, s, flags=re.I))
    if n_outer:
        logs.append(
            f"  .outer max-width:{outer_max_from_px}px → max-width:100%: {n_outer} match(es)"
        )
        s = re.sub(pat, repl, s, flags=re.I)
    else:
        logs.append(
            f"  (no .outer{{max-width:{outer_max_from_px}px}} in <style>; skip outer widen)"
        )

    if s == html:
        logs.append("  (result: no edits — try another --outer-max-from-px or inspect HTML)")
    return s, logs


def expand_height_html(
    html: str,
    *,
    from_px: int,
    dry_run: bool,
    min_height_mode: str,
) -> tuple[str, list[str]]:
    """
    Replace fixed pixel heights. min_height_mode: 'vh' (100vh), 'pct' (100%), or 'none' (remove min-height value).
    Many email clients ignore vh; AJO web preview often honors it.
    """
    px = from_px
    if min_height_mode == "vh":
        min_h_repl = "min-height:100vh"
    elif min_height_mode == "pct":
        min_h_repl = "min-height:100%"
    elif min_height_mode == "none":
        min_h_repl = "min-height:0"
    else:
        raise ValueError(f"unknown min_height_mode: {min_height_mode}")

    rules: list[tuple[str, str, str]] = [
        (rf"min-height\s*:\s*{px}px", min_h_repl, f"min-height:{px}px → {min_h_repl}"),
        (rf"height\s*:\s*{px}px", "height:auto", f"height:{px}px → height:auto"),
        (rf"max-height\s*:\s*{px}px", "max-height:none", f"max-height:{px}px → max-height:none"),
        (rf'\bheight="{px}"', 'height="100%"', f'height="{px}" → height="100%"'),
        (rf"\bheight='{px}'", "height='100%'", f"height='{px}' → height='100%'"),
    ]
    return _apply_regex_replacements(
        html,
        rules,
        dry_run=dry_run,
        no_match_hint=(
            f"no min-height/height/max-height:{px}px or height=\"{px}\" patterns found"
        ),
    )


def fetch_template(
    auth: AdobeAuth, base: str, template_id: str
) -> dict[str, Any] | None:
    """GET template JSON (no ETag required)."""
    url = f"{base.rstrip('/')}/templates/{template_id}"
    r = requests.get(
        url,
        headers=content_headers(auth, accept=ACCEPT_TEMPLATE),
        timeout=60,
    )
    if r.status_code != 200:
        print("GET HTTP", r.status_code, file=sys.stderr)
        print(r.text[:4000], file=sys.stderr)
        return None
    return r.json()


def get_template_etag(
    auth: AdobeAuth, base: str, template_id: str
) -> tuple[dict[str, Any], str] | tuple[None, None]:
    url = f"{base.rstrip('/')}/templates/{template_id}"
    r = requests.get(
        url,
        headers=content_headers(auth, accept=ACCEPT_TEMPLATE),
        timeout=60,
    )
    if r.status_code != 200:
        print("GET HTTP", r.status_code, file=sys.stderr)
        print(r.text[:4000], file=sys.stderr)
        return None, None
    etag = r.headers.get("ETag") or r.headers.get("etag")
    if not etag:
        print("Missing ETag; cannot PUT.", file=sys.stderr)
        return None, None
    return r.json(), etag


def apply_match_day_enhancements(
    html: str,
    *,
    from_px: int = 800,
    outer_max_from_px: int = 360,
    add_body_vh: bool = True,
) -> tuple[str, list[str]]:
    """widen → fill-preview → center (same pipeline used for Premier League templates)."""
    logs: list[str] = []
    s = html
    s, lw = widen_html(s, from_px=from_px, dry_run=False)
    logs.extend(lw)
    s, lf = fill_preview_html(
        s,
        outer_max_from_px=outer_max_from_px,
        add_body_min_height_vh=add_body_vh,
        dry_run=False,
    )
    logs.extend(lf)
    s, lc = center_email_html(s)
    logs.extend(lc)
    return s, logs


# Handlebars-style tokens map to journey / profile context in AJO (bind in campaign or use profile paths).
HYPER_STYLE_SNIPPET = """
    .hyper-pill{display:inline-block;font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#e8a800;border:1px solid rgba(232,168,0,0.4);padding:6px 14px;border-radius:999px;margin:0 auto 16px auto;}
    .fan-strip{font-size:13px;color:rgba(255,255,255,0.88);margin:0 0 18px 0;line-height:1.55;max-width:520px;margin-left:auto;margin-right:auto;}
    .fan-strip strong{color:#e8a800;font-weight:700;}
    .fan-meta{font-size:12px;color:rgba(255,255,255,0.55);margin:8px 0 0 0;}
    .mono{font-family:ui-monospace,Menlo,Consolas,monospace;letter-spacing:0.04em;}
    .match-card{background:#1a0f24;border:1px solid rgba(232,168,0,0.35);border-radius:10px;padding:20px 16px 18px;margin:0 auto 22px;max-width:520px;text-align:center;}
    .match-meta{font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:rgba(232,168,0,0.9);margin:0 0 10px 0;}
    .match-teams{font-family:'Barlow Condensed',Arial Narrow,Arial,sans-serif;font-size:28px;font-weight:900;line-height:1.15;color:#fff;text-transform:uppercase;}
    .match-teams .vs{display:inline-block;margin:0 10px;color:rgba(255,255,255,0.35);font-weight:700;font-size:18px;vertical-align:middle;}
    .match-teams .team{display:inline-block;max-width:42%;vertical-align:middle;}
    .match-ko{font-size:14px;color:rgba(255,255,255,0.85);margin:14px 0 6px 0;}
    .match-venue{font-size:13px;color:rgba(255,255,255,0.65);margin:0 0 8px 0;}
    .match-broadcast{font-size:12px;color:rgba(255,255,255,0.5);margin:0;border-top:1px solid rgba(255,255,255,0.08);padding-top:10px;}
    .detail-grid{width:100%;max-width:520px;margin:0 auto 18px;border-collapse:separate;border-spacing:8px 0;}
    .detail-cell{width:50%;vertical-align:top;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:12px 10px;text-align:center;}
    .detail-label{font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:rgba(255,255,255,0.45);margin:0 0 6px 0;}
    .detail-value{font-size:13px;color:rgba(255,255,255,0.9);margin:0;line-height:1.4;}
"""


def apply_hyper_personalisation(html: str) -> tuple[str, list[str]]:
    """
    Insert hyper-personalisation CSS and replace .content-wrap inner HTML with fan + match blocks.
    Tokens use dot notation (e.g. {{fan.firstName}}) — map to profile or journey context in AJO.
    """
    logs: list[str] = []
    s = html
    if "hyper-pill" in s:
        logs.append("  (hyper block already present; skip)")
        return s, logs

    # First </style> in document = main embedded stylesheet
    if "</style>" not in s:
        logs.append("  (no </style>; skip hyper)")
        return s, logs
    s = s.replace("</style>", HYPER_STYLE_SNIPPET + "\n  </style>", 1)
    logs.append("  inserted hyper-personalisation CSS")

    # Headline + sub-headline immediately under hero image; fan/match blocks then body; CTA stays in cta-wrap row.
    inner = """
<h1 class="headline">{{headline}}</h1>
<p class="sub-headline">{{sub_headline}}</p>
<div class="hyper-pill">{{match.competition}} · {{match.matchweek}}</div>
<p class="fan-strip">Hi <strong>{{fan.firstName}}</strong> — you're logged in as a <strong>{{fan.loyaltyTier}}</strong> supporter of <strong>{{fan.favouriteClub}}</strong>.</p>
<p class="fan-meta">Supporter ID <span class="mono">{{fan.supporterId}}</span> · Member since <strong>{{fan.memberSince}}</strong> · Seat <strong>{{fan.seatZone}}</strong></p>
<div class="match-card">
  <div class="match-meta">{{match.fixtureLabel}}</div>
  <div class="match-teams"><span class="team home">{{match.homeTeam}}</span><span class="vs">v</span><span class="team away">{{match.awayTeam}}</span></div>
  <p class="match-ko">{{match.kickoffFormatted}}</p>
  <p class="match-venue">{{match.venue}} · {{match.city}}</p>
  <p class="match-broadcast">{{match.broadcast}}</p>
</div>
<table class="detail-grid" role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
  <tr>
    <td class="detail-cell"><p class="detail-label">Your form (L5)</p><p class="detail-value">{{fan.lastFiveResults}}</p></td>
    <td class="detail-cell"><p class="detail-label">Head-to-head</p><p class="detail-value">{{match.headToHead}}</p></td>
  </tr>
</table>
<p class="body-text">{{body}}</p>
""".strip()

    pat = (
        r'(<tr[^>]*>\s*<td\s+class="content-wrap"[^>]*>)'
        r"([\s\S]*?)"
        r'(</td>\s*</tr>\s*<tr[^>]*>\s*<td\s+class="cta-wrap"[^>]*>)'
    )
    if not re.search(pat, s, re.I):
        logs.append("  (could not find content-wrap/cta-wrap row; skip body replace)")
        return s, logs

    s2, n = re.subn(pat, r"\1\n" + inner + r"\n\3", s, count=1, flags=re.I)
    if n:
        s = s2
        logs.append("  replaced content-wrap with fan + match hyper blocks")
    else:
        logs.append("  (content-wrap replace failed)")
    return s, logs


# Editorial / “second screen” layout: studio picks, pull quote, fantasy hook — distinct from hyper match card.
STUDIO_STYLE_SNIPPET = """
    .stu-root{max-width:540px;margin:0 auto;text-align:center;}
    .stu-greeting{font-size:13px;color:rgba(255,255,255,0.88);margin:0 0 14px 0;line-height:1.55;max-width:520px;margin-left:auto;margin-right:auto;}
    .stu-greeting strong{color:#00f5a0;font-weight:700;}
    .stu-live-pill{display:inline-block;font-size:10px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;color:#00f5a0;background:rgba(0,245,160,0.12);border:1px solid rgba(0,245,160,0.45);padding:5px 12px;border-radius:4px;margin:0 auto 12px;}
    .stu-studio-line{font-size:12px;color:rgba(255,255,255,0.55);margin:0 0 6px 0;}
    .stu-studio-line strong{color:#00f5a0;font-weight:700;}
    .stu-hero-kicker{font-family:Georgia,'Times New Roman',serif;font-size:15px;font-style:italic;color:rgba(255,255,255,0.75);margin:0 0 8px 0;}
    .stu-pull{margin:18px 0 20px 0;padding:14px 16px 16px 14px;border-left:3px solid #ff3366;background:rgba(255,51,102,0.08);text-align:left;max-width:500px;margin-left:auto;margin-right:auto;}
    .stu-pull q{font-family:Georgia,serif;font-size:16px;line-height:1.45;color:#fff;display:block;font-style:italic;}
    .stu-pull cite{font-size:12px;color:rgba(255,255,255,0.5);font-style:normal;display:block;margin-top:10px;}
    .stu-tiles{width:100%;max-width:520px;margin:0 auto 18px;border-collapse:separate;border-spacing:6px;}
    .stu-tile{width:33%;vertical-align:top;background:rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.12);border-radius:6px;padding:10px 6px 12px;}
    .stu-tile-label{font-size:9px;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.4);margin:0 0 6px 0;}
    .stu-tile-val{font-size:12px;font-weight:700;color:#fff;line-height:1.3;margin:0;}
    .stu-momentum{width:100%;max-width:520px;margin:0 auto 20px;border-collapse:collapse;}
    .stu-mo-cell{width:50%;vertical-align:middle;padding:12px 10px;background:rgba(55,0,60,0.35);border:1px solid rgba(255,255,255,0.1);}
    .stu-mo-label{font-size:10px;color:rgba(255,255,255,0.45);margin:0 0 4px 0;text-transform:uppercase;letter-spacing:0.08em;}
    .stu-mo-val{font-size:15px;font-weight:800;color:#e8a800;margin:0;}
    .stu-fantasy{font-size:12px;color:rgba(255,255,255,0.7);margin:0 0 16px 0;padding:10px 12px;border-radius:6px;border:1px dashed rgba(232,168,0,0.35);background:rgba(232,168,0,0.06);}
    .stu-fantasy strong{color:#e8a800;}
"""


def apply_studio_personalisation(html: str) -> tuple[str, list[str]]:
    """
    Replace content-wrap with a broadcast/editorial “Saturday Studio” block.
    Tokens: studio.*, story.*, picks.*, stats.*, fantasy.*, fan.firstName, headline/sub_headline/body.
    """
    logs: list[str] = []
    s = html
    if "stu-root" in s:
        logs.append("  (studio block already present; skip)")
        return s, logs

    if "</style>" not in s:
        logs.append("  (no </style>; skip studio)")
        return s, logs
    s = s.replace("</style>", STUDIO_STYLE_SNIPPET + "\n  </style>", 1)
    logs.append("  inserted Saturday Studio CSS")

    # Headline + sub-headline directly under hero; studio blocks follow; body before CTA row.
    inner = """
<div class="stu-root">
  <h1 class="headline">{{headline}}</h1>
  <p class="sub-headline">{{sub_headline}}</p>
  <div class="stu-live-pill">{{studio.badge}}</div>
  <p class="stu-studio-line">Live from <strong>{{studio.city}}</strong> · {{studio.showTitle}} · {{studio.runTime}}</p>
  <p class="stu-hero-kicker">{{story.kicker}}</p>
  <p class="stu-greeting">Hey <strong>{{fan.firstName}}</strong> — {{studio.personalHook}}</p>
  <blockquote class="stu-pull"><q>{{story.quote}}</q><cite>{{story.quoteAttribution}}</cite></blockquote>
  <table class="stu-tiles" role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
    <tr>
      <td class="stu-tile"><p class="stu-tile-label">Game to watch</p><p class="stu-tile-val">{{picks.gameToWatch}}</p></td>
      <td class="stu-tile"><p class="stu-tile-label">Upset alert</p><p class="stu-tile-val">{{picks.upsetAlert}}</p></td>
      <td class="stu-tile"><p class="stu-tile-label">Goal rush</p><p class="stu-tile-val">{{picks.goalRush}}</p></td>
    </tr>
  </table>
  <table class="stu-momentum" role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
    <tr>
      <td class="stu-mo-cell"><p class="stu-mo-label">Momentum</p><p class="stu-mo-val">{{stats.momentumStat}}</p></td>
      <td class="stu-mo-cell"><p class="stu-mo-label">Watch the line</p><p class="stu-mo-val">{{stats.lineStat}}</p></td>
    </tr>
  </table>
  <p class="stu-fantasy"><strong>Fantasy:</strong> {{fantasy.captainBrief}} · Differential: <strong>{{fantasy.differential}}</strong> · Deadline {{fantasy.deadline}}</p>
  <p class="body-text">{{body}}</p>
</div>
""".strip()

    pat = (
        r'(<tr[^>]*>\s*<td\s+class="content-wrap"[^>]*>)'
        r"([\s\S]*?)"
        r'(</td>\s*</tr>\s*<tr[^>]*>\s*<td\s+class="cta-wrap"[^>]*>)'
    )
    if not re.search(pat, s, re.I):
        logs.append("  (could not find content-wrap/cta-wrap row; skip body replace)")
        return s, logs

    s2, n = re.subn(pat, r"\1\n" + inner + r"\n\3", s, count=1, flags=re.I)
    if n:
        s = s2
        logs.append("  replaced content-wrap with Saturday Studio blocks")
    else:
        logs.append("  (content-wrap replace failed)")
    return s, logs


def apply_studio_pipeline(
    html: str,
    *,
    from_px: int = 800,
    outer_max_from_px: int = 360,
    add_body_vh: bool = True,
) -> tuple[str, list[str]]:
    """match_day_enhancements + studio_personalisation."""
    logs: list[str] = []
    s, l1 = apply_match_day_enhancements(
        html,
        from_px=from_px,
        outer_max_from_px=outer_max_from_px,
        add_body_vh=add_body_vh,
    )
    logs.extend(l1)
    s, l2 = apply_studio_personalisation(s)
    logs.extend(l2)
    return s, logs


def apply_hyper_pipeline(
    html: str,
    *,
    from_px: int = 800,
    outer_max_from_px: int = 360,
    add_body_vh: bool = True,
) -> tuple[str, list[str]]:
    """match_day_enhancements + hyper_personalisation."""
    logs: list[str] = []
    s, l1 = apply_match_day_enhancements(
        html,
        from_px=from_px,
        outer_max_from_px=outer_max_from_px,
        add_body_vh=add_body_vh,
    )
    logs.extend(l1)
    s, l2 = apply_hyper_personalisation(s)
    logs.extend(l2)
    return s, logs


def create_content_template(
    auth: AdobeAuth,
    base: str,
    body: dict[str, Any],
) -> tuple[dict[str, Any] | None, int, str | None]:
    """POST /templates. Returns (response_json_or_none, http_status, new_id_from_location)."""
    url = f"{base.rstrip('/')}/templates"
    hdrs = content_headers(auth, accept=ACCEPT_TEMPLATE)
    hdrs["Content-Type"] = CONTENT_TYPE
    pr = requests.post(
        url,
        headers=hdrs,
        data=json.dumps(filter_content_template_put_root(body)),
        timeout=120,
    )
    loc = pr.headers.get("Location") or pr.headers.get("location")
    new_id: str | None = None
    if loc:
        new_id = loc.rstrip("/").split("/")[-1]
    if pr.status_code not in (200, 201):
        print("POST HTTP", pr.status_code, file=sys.stderr)
        try:
            print(json.dumps(pr.json(), indent=2), file=sys.stderr)
        except Exception:
            print(pr.text[:4000], file=sys.stderr)
        return None, pr.status_code, new_id
    try:
        data = pr.json()
    except Exception:
        data = {}
    if isinstance(data, dict) and not data.get("id") and new_id:
        data = {**data, "id": new_id}
    return data, pr.status_code, new_id


def put_template(
    auth: AdobeAuth,
    base: str,
    template_id: str,
    body: dict[str, Any],
    etag: str,
) -> bool:
    url = f"{base.rstrip('/')}/templates/{template_id}"
    put_headers = content_headers(auth, accept=ACCEPT_TEMPLATE)
    put_headers["Content-Type"] = CONTENT_TYPE
    put_headers["If-Match"] = etag
    pr = requests.put(
        url,
        headers=put_headers,
        data=json.dumps(filter_content_template_put_root(body)),
        timeout=120,
    )
    if pr.status_code not in (200, 204):
        print("PUT HTTP", pr.status_code, file=sys.stderr)
        try:
            print(json.dumps(pr.json(), indent=2), file=sys.stderr)
        except Exception:
            print(pr.text[:4000], file=sys.stderr)
        return False
    return True


def path_to_str(path: list[str]) -> str:
    return "$." + ".".join(path)


def _run_html_mutations(
    auth: AdobeAuth,
    args: argparse.Namespace,
    mutator: Callable[[str], tuple[str, list[str]]],
) -> int:
    base = args.content_base.rstrip("/")
    body, etag = get_template_etag(auth, base, args.template_id)
    if body is None:
        return 1
    paths = iter_email_html_bodies(body)
    if not paths:
        print(
            "No mutable HTML found (templateType html or content email with template.html.body).",
            file=sys.stderr,
        )
        return 1

    work = copy.deepcopy(body)
    any_change = False
    for path, html in paths:
        new_html, logs = mutator(html)
        print(path_to_str(path) + ":")
        for line in logs:
            print(line)
        if new_html != html:
            any_change = True
            if not args.dry_run:
                set_by_path(work, path, new_html)

    if args.dry_run:
        print("Dry run: no PUT.", file=sys.stderr)
        return 0
    if not any_change:
        print("Nothing to update.", file=sys.stderr)
        return 0
    if not put_template(auth, base, args.template_id, work, etag):
        return 1
    print("Template updated.", file=sys.stderr)
    return 0


def cmd_list(auth: AdobeAuth, args: argparse.Namespace) -> int:
    params: dict[str, Any] = {"limit": min(args.limit, 1000)}
    if args.name_contains:
        params["property"] = [f"name~^{args.name_contains}"]
    base = args.content_base.rstrip("/")
    url = f"{base}/templates"
    r = requests.get(
        url,
        headers=content_headers(auth, accept=ACCEPT_LIST),
        params=params,
        timeout=60,
    )
    if r.status_code != 200:
        print("HTTP", r.status_code, file=sys.stderr)
        print(r.text[:4000], file=sys.stderr)
        return 1
    data = r.json()
    items = data.get("items") or []
    for it in items:
        tid = it.get("id", "")
        name = it.get("name", "")
        ch = it.get("channels")
        tt = it.get("templateType", "")
        print(f"{tid}\t{tt}\t{ch}\t{name}")
    print(f"Total listed: {len(items)}", file=sys.stderr)
    return 0


def cmd_show(auth: AdobeAuth, args: argparse.Namespace) -> int:
    base = args.content_base.rstrip("/")
    url = f"{base}/templates/{args.template_id}"
    r = requests.get(
        url,
        headers=content_headers(auth, accept=ACCEPT_TEMPLATE),
        timeout=60,
    )
    if r.status_code != 200:
        print("HTTP", r.status_code, file=sys.stderr)
        print(r.text[:4000], file=sys.stderr)
        return 1
    print(json.dumps(r.json(), indent=2))
    return 0


def cmd_widen(auth: AdobeAuth, args: argparse.Namespace) -> int:

    def mutator(html: str) -> tuple[str, list[str]]:
        return widen_html(html, from_px=args.from_px, dry_run=args.dry_run)

    return _run_html_mutations(auth, args, mutator)


def cmd_tall(auth: AdobeAuth, args: argparse.Namespace) -> int:
    mode = args.min_height_as

    def mutator(html: str) -> tuple[str, list[str]]:
        return expand_height_html(
            html,
            from_px=args.from_height_px,
            dry_run=args.dry_run,
            min_height_mode=mode,
        )

    return _run_html_mutations(auth, args, mutator)


def cmd_fill_preview(auth: AdobeAuth, args: argparse.Namespace) -> int:

    def mutator(html: str) -> tuple[str, list[str]]:
        return fill_preview_html(
            html,
            outer_max_from_px=args.outer_max_from_px,
            add_body_min_height_vh=not args.no_body_vh,
            dry_run=args.dry_run,
        )

    return _run_html_mutations(auth, args, mutator)


def cmd_center(auth: AdobeAuth, args: argparse.Namespace) -> int:

    def mutator(html: str) -> tuple[str, list[str]]:
        return center_email_html(html)

    return _run_html_mutations(auth, args, mutator)


def cmd_hero_placeholder(auth: AdobeAuth, args: argparse.Namespace) -> int:

    def mutator(html: str) -> tuple[str, list[str]]:
        return apply_hero_grey_placeholder(html, size=args.hero_size)

    return _run_html_mutations(auth, args, mutator)


def cmd_clone_enhanced(auth: AdobeAuth, args: argparse.Namespace) -> int:
    """
    GET source template, apply widen + fill-preview + center to HTML, POST as new template.
    """
    base = args.content_base.rstrip("/")
    src = fetch_template(auth, base, args.source_template_id)
    if src is None:
        return 1
    paths = iter_email_html_bodies(src)
    if not paths:
        print(
            "No mutable HTML on source (expected content email or html template).",
            file=sys.stderr,
        )
        return 1

    work = copy.deepcopy(src)
    work["name"] = args.new_name.strip()
    if args.description is not None:
        work["description"] = args.description.strip()

    print("Enhancements:", file=sys.stderr)
    for path, html in paths:
        new_html, logs = apply_match_day_enhancements(
            html,
            from_px=args.from_px,
            outer_max_from_px=args.outer_max_from_px,
            add_body_vh=not args.no_body_vh,
        )
        print(path_to_str(path) + ":", file=sys.stderr)
        for line in logs:
            print(line, file=sys.stderr)
        set_by_path(work, path, new_html)

    if args.dry_run:
        print("Dry run: no POST.", file=sys.stderr)
        print(json.dumps(filter_content_template_put_root(work), indent=2))
        return 0

    created, status, new_id = create_content_template(auth, base, work)
    if created is None:
        return 1
    tid = (created.get("id") if isinstance(created, dict) else None) or new_id
    print("Created template:", file=sys.stderr)
    if tid:
        print("id:", tid, file=sys.stderr)
    if new_id and isinstance(created, dict) and not created.get("id"):
        created["id"] = new_id
    print(json.dumps(created, indent=2))
    return 0


def cmd_clone_hyper(auth: AdobeAuth, args: argparse.Namespace) -> int:
    """
    GET source template, apply widen + fill-preview + center + hyper fan/match HTML, POST new.
    """
    base = args.content_base.rstrip("/")
    src = fetch_template(auth, base, args.source_template_id)
    if src is None:
        return 1
    paths = iter_email_html_bodies(src)
    if not paths:
        print(
            "No mutable HTML on source (expected content email or html template).",
            file=sys.stderr,
        )
        return 1

    work = copy.deepcopy(src)
    work["name"] = args.new_name.strip()
    if args.description is not None:
        work["description"] = args.description.strip()

    print("Hyper pipeline:", file=sys.stderr)
    for path, html in paths:
        new_html, logs = apply_hyper_pipeline(
            html,
            from_px=args.from_px,
            outer_max_from_px=args.outer_max_from_px,
            add_body_vh=not args.no_body_vh,
        )
        print(path_to_str(path) + ":", file=sys.stderr)
        for line in logs:
            print(line, file=sys.stderr)
        set_by_path(work, path, new_html)

    if args.dry_run:
        print("Dry run: no POST.", file=sys.stderr)
        print(json.dumps(filter_content_template_put_root(work), indent=2))
        return 0

    created, status, new_id = create_content_template(auth, base, work)
    if created is None:
        return 1
    tid = (created.get("id") if isinstance(created, dict) else None) or new_id
    print("Created template:", file=sys.stderr)
    if tid:
        print("id:", tid, file=sys.stderr)
    if new_id and isinstance(created, dict) and not created.get("id"):
        created["id"] = new_id
    print(json.dumps(created, indent=2))
    return 0


def cmd_clone_studio(auth: AdobeAuth, args: argparse.Namespace) -> int:
    """
    GET source template, apply match-day enhancements + Saturday Studio editorial HTML, POST new.
    """
    base = args.content_base.rstrip("/")
    src = fetch_template(auth, base, args.source_template_id)
    if src is None:
        return 1
    paths = iter_email_html_bodies(src)
    if not paths:
        print(
            "No mutable HTML on source (expected content email or html template).",
            file=sys.stderr,
        )
        return 1

    work = copy.deepcopy(src)
    work["name"] = args.new_name.strip()
    if args.description is not None:
        work["description"] = args.description.strip()

    print("Studio pipeline:", file=sys.stderr)
    for path, html in paths:
        new_html, logs = apply_studio_pipeline(
            html,
            from_px=args.from_px,
            outer_max_from_px=args.outer_max_from_px,
            add_body_vh=not args.no_body_vh,
        )
        print(path_to_str(path) + ":", file=sys.stderr)
        for line in logs:
            print(line, file=sys.stderr)
        set_by_path(work, path, new_html)

    if args.dry_run:
        print("Dry run: no POST.", file=sys.stderr)
        print(json.dumps(filter_content_template_put_root(work), indent=2))
        return 0

    created, status, new_id = create_content_template(auth, base, work)
    if created is None:
        return 1
    tid = (created.get("id") if isinstance(created, dict) else None) or new_id
    print("Created template:", file=sys.stderr)
    if tid:
        print("id:", tid, file=sys.stderr)
    if new_id and isinstance(created, dict) and not created.get("id"):
        created["id"] = new_id
    print(json.dumps(created, indent=2))
    return 0


def cmd_layout(auth: AdobeAuth, args: argparse.Namespace) -> int:
    """Apply width then height mutations in one PUT."""

    def mutator(html: str) -> tuple[str, list[str]]:
        logs_all: list[str] = []
        s, logs_w = widen_html(html, from_px=args.from_px, dry_run=args.dry_run)
        logs_all.extend(logs_w)
        s2, logs_h = expand_height_html(
            s,
            from_px=args.from_height_px,
            dry_run=args.dry_run,
            min_height_mode=args.min_height_as,
        )
        logs_all.extend(logs_h)
        return s2, logs_all

    return _run_html_mutations(auth, args, mutator)


def main() -> int:
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument(
        "--content-base",
        default=DEFAULT_CONTENT_BASE,
        dest="content_base",
        help=f"Content API base (default {DEFAULT_CONTENT_BASE})",
    )
    p = argparse.ArgumentParser(
        description="AJO content templates: list, show, widen/tall HTML",
        epilog="Use `<command> --help` for --content-base and other flags.",
    )
    sub = p.add_subparsers(dest="cmd", required=True)

    pl = sub.add_parser(
        "list",
        parents=[common],
        help="List templates (id, templateType, channels, name)",
    )
    pl.add_argument("--name-contains", help="Filter: property name~^value")
    pl.add_argument("--limit", type=int, default=50)
    pl.set_defaults(func=cmd_list)

    ps = sub.add_parser("show", parents=[common], help="GET one template JSON")
    ps.add_argument("--template-id", required=True)
    ps.set_defaults(func=cmd_show)

    pw = sub.add_parser(
        "widen",
        parents=[common],
        help="Replace fixed px width in HTML and PUT",
    )
    pw.add_argument("--template-id", required=True)
    pw.add_argument("--from-px", type=int, default=800, help="Pixel width to replace (default 800)")
    pw.add_argument("--dry-run", action="store_true")
    pw.set_defaults(func=cmd_widen)

    pt = sub.add_parser(
        "tall",
        parents=[common],
        help="Replace fixed px height/min-height in HTML and PUT",
    )
    pt.add_argument("--template-id", required=True)
    pt.add_argument(
        "--from-height-px",
        type=int,
        default=800,
        help="Pixel height/min-height/max-height to replace (default 800; try 600, 720, etc.)",
    )
    pt.add_argument(
        "--min-height-as",
        choices=("vh", "pct", "none"),
        default="vh",
        help="Replacement for min-height:Npx: 100vh (viewport), 100%%, or 0 (default vh for 'full screen' feel in preview)",
    )
    pt.add_argument("--dry-run", action="store_true")
    pt.set_defaults(func=cmd_tall)

    pl2 = sub.add_parser(
        "layout",
        parents=[common],
        help="Apply widen + tall in one PUT",
    )
    pl2.add_argument("--template-id", required=True)
    pl2.add_argument("--from-px", type=int, default=800)
    pl2.add_argument("--from-height-px", type=int, default=800)
    pl2.add_argument("--min-height-as", choices=("vh", "pct", "none"), default="vh")
    pl2.add_argument("--dry-run", action="store_true")
    pl2.set_defaults(func=cmd_layout)

    pf = sub.add_parser(
        "fill-preview",
        parents=[common],
        help="CSS: .outer max-width Npx→100%%, body min-height 100vh in first <style> (AJO preview)",
    )
    pf.add_argument("--template-id", required=True)
    pf.add_argument(
        "--outer-max-from-px",
        type=int,
        default=360,
        help="Replace .outer{{max-width:Npx}} in <style> (default 360, common mobile shell)",
    )
    pf.add_argument(
        "--no-body-vh",
        action="store_true",
        help="Do not inject min-height:100vh on body{} (only widen .outer)",
    )
    pf.add_argument("--dry-run", action="store_true")
    pf.set_defaults(func=cmd_fill_preview)

    pc = sub.add_parser(
        "center",
        parents=[common],
        help="CSS: center text (text-align:left→center, .outer/.footer/.banner, image margin)",
    )
    pc.add_argument("--template-id", required=True)
    pc.add_argument("--dry-run", action="store_true")
    pc.set_defaults(func=cmd_center)

    ph = sub.add_parser(
        "hero-placeholder",
        parents=[common],
        help="Replace banner hero .banner-image with N×N grey PNG data URI + CSS (fixes broken icon in preview)",
    )
    ph.add_argument("--template-id", required=True)
    ph.add_argument(
        "--hero-size",
        type=int,
        default=400,
        dest="hero_size",
        metavar="PX",
        help="Square edge length in px for grey PNG and CSS (default 400)",
    )
    ph.add_argument("--dry-run", action="store_true")
    ph.set_defaults(func=cmd_hero_placeholder)

    pce = sub.add_parser(
        "clone-enhanced",
        parents=[common],
        help="GET source template, apply widen+fill-preview+center, POST new template",
    )
    pce.add_argument(
        "--source-template-id",
        required=True,
        help="Template UUID to copy from (e.g. Premier League Standard)",
    )
    pce.add_argument(
        "--new-name",
        required=True,
        help='Display name for the new template (e.g. "Premier League Match Day…")',
    )
    pce.add_argument(
        "--description",
        default=None,
        help="Optional description on the new template",
    )
    pce.add_argument("--from-px", type=int, default=800)
    pce.add_argument("--outer-max-from-px", type=int, default=360)
    pce.add_argument(
        "--no-body-vh",
        action="store_true",
        help="Skip body min-height:100vh in fill-preview",
    )
    pce.add_argument(
        "--dry-run",
        action="store_true",
        help="Print payload JSON only; do not POST",
    )
    pce.set_defaults(func=cmd_clone_enhanced)

    pch = sub.add_parser(
        "clone-hyper",
        parents=[common],
        help="GET source, apply widen+fill-preview+center+fan/match Handlebars blocks, POST new",
    )
    pch.add_argument("--source-template-id", required=True)
    pch.add_argument("--new-name", required=True)
    pch.add_argument("--description", default=None)
    pch.add_argument("--from-px", type=int, default=800)
    pch.add_argument("--outer-max-from-px", type=int, default=360)
    pch.add_argument("--no-body-vh", action="store_true")
    pch.add_argument("--dry-run", action="store_true")
    pch.set_defaults(func=cmd_clone_hyper)

    pcs = sub.add_parser(
        "clone-studio",
        parents=[common],
        help="GET source, apply widen+fill-preview+center+Saturday Studio editorial blocks, POST new",
    )
    pcs.add_argument("--source-template-id", required=True)
    pcs.add_argument("--new-name", required=True)
    pcs.add_argument("--description", default=None)
    pcs.add_argument("--from-px", type=int, default=800)
    pcs.add_argument("--outer-max-from-px", type=int, default=360)
    pcs.add_argument("--no-body-vh", action="store_true")
    pcs.add_argument("--dry-run", action="store_true")
    pcs.set_defaults(func=cmd_clone_studio)

    args = p.parse_args()
    auth = AdobeAuth()
    return int(args.func(auth, args))


if __name__ == "__main__":
    raise SystemExit(main())
