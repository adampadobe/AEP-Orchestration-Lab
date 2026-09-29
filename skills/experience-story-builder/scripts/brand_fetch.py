#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
experience-story-builder — keyless brand fetch (no API key, no Brandfetch)

Best-effort: pulls a logo + a colour palette straight from the customer's
website so the deck can wear the CUSTOMER's colours. Tier 2 of the Stage 3
degrade order (supplied assets > THIS > Brandfetch > ask).

    python brand_fetch.py <url> --slug <slug> [--project-root <root>]

Writes into <root>/assets/<slug>/ :
    logo.<ext>     best logo it can find
    brand.json     {"brand","brand_deep","accent","accent_lt","logo","source"}

Then prints a ready-to-paste :root override block. ALWAYS eyeball the result —
scraped palettes are approximate; if it looks wrong, ask the SC for the hex.
"""
import argparse, ipaddress, json, os, re, socket, sys, urllib.request, urllib.parse
import xml.etree.ElementTree as ET

try: sys.stdout.reconfigure(encoding="utf-8")
except Exception: pass

UA = {"User-Agent": "Mozilla/5.0 (experience-story-builder brand_fetch)"}
MAX_HTML_BYTES = 5 * 1024 * 1024
MAX_ASSET_BYTES = 15 * 1024 * 1024
SLUG_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$")


def validate_slug(slug: str) -> str:
    if not SLUG_RE.fullmatch(slug or ""):
        raise ValueError("slug must contain only lowercase letters, digits and internal hyphens")
    return slug


def _validate_url(url: str, allow_private: bool = False) -> str:
    p = urllib.parse.urlparse(url)
    if p.scheme.lower() not in {"http", "https"} or not p.hostname:
        raise ValueError(f"only absolute http(s) URLs are allowed: {url!r}")
    if p.username or p.password:
        raise ValueError("credentials in brand URLs are not allowed")
    if not allow_private:
        try:
            infos = socket.getaddrinfo(p.hostname, p.port or (443 if p.scheme == "https" else 80),
                                       type=socket.SOCK_STREAM)
        except socket.gaierror as e:
            raise ValueError(f"cannot resolve {p.hostname}: {e}") from e
        for info in infos:
            ip = ipaddress.ip_address(info[4][0].split("%", 1)[0])
            if (ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or
                    ip.is_reserved or ip.is_unspecified):
                raise ValueError(f"refusing private/non-public address for {p.hostname}: {ip}")
    return url


class _SafeRedirect(urllib.request.HTTPRedirectHandler):
    def __init__(self, allow_private=False):
        super().__init__(); self.allow_private = allow_private

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        _validate_url(newurl, self.allow_private)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def fetch(url, binary=False, timeout=15, max_bytes=None, allow_private=False):
    _validate_url(url, allow_private)
    req = urllib.request.Request(url, headers=UA)
    opener = urllib.request.build_opener(_SafeRedirect(allow_private))
    limit = max_bytes or (MAX_ASSET_BYTES if binary else MAX_HTML_BYTES)
    with opener.open(req, timeout=timeout) as r:
        data = r.read(limit + 1)
        if len(data) > limit:
            raise ValueError(f"response exceeds {limit // (1024*1024)} MB limit")
    # HTML is only scraped for colours/logo URLs (ASCII), so tolerate non-UTF-8 brand sites
    # (many marketing pages are Latin-1) rather than aborting the fetch. Downloaded ASSET bytes
    # are never decoded here — they go through validate_asset() with strict signature checks.
    return data if binary else data.decode("utf-8", "replace")


def validate_asset(raw: bytes, ext: str) -> bytes:
    """Reject disguised files and active SVG content before it reaches a deck."""
    if ext == ".svg":
        if b"<!DOCTYPE" in raw.upper() or b"<!ENTITY" in raw.upper():
            raise ValueError("SVG contains a doctype/entity declaration")
        # CSS url() — in a <style> element or a style="" attribute — fetches subresources at render
        # time, so an inlined logo could beacon the viewer's IP/Referer to an external host. Reject
        # url() pointing at ANY scheme except data:, plus protocol-relative //host. Scheme-aware
        # rather than slash-anchored, so url(http:host/x) (no slashes) is caught too. url(#gradient)
        # and url(data:...) — what real logos actually use — stay allowed.
        _EXT_URL = rb"url\(\s*['\"]?\s*(?!data:)(?:[a-zA-Z][a-zA-Z0-9+.-]*:|//)"
        if re.search(_EXT_URL, raw, re.I):
            raise ValueError("SVG references an external URL via CSS url()")
        # @import is the one external-CSS route url() misses; a logo never needs one.
        if re.search(rb"@import", raw, re.I):
            raise ValueError("SVG contains an @import (external stylesheet reference)")
        try:
            root = ET.fromstring(raw)
        except ET.ParseError as e:
            raise ValueError(f"invalid SVG: {e}") from e
        if root.tag.rsplit("}", 1)[-1].lower() != "svg":
            raise ValueError("file is not an SVG document")
        for el in root.iter():
            tag = el.tag.rsplit("}", 1)[-1].lower()
            # NB: <style> is allowed. Illustrator/Inkscape exports routinely carry a local-only
            # <style>.st0{fill:#...}</style>, and rejecting those left an SVG-only brand with NO
            # logo at all — a silent stand-in, the very thing this gate exists to prevent. Its CSS
            # is still covered: the external-url() and @import checks above scan the whole file.
            if tag in {"script", "foreignobject", "iframe", "object", "embed"}:
                raise ValueError(f"unsafe SVG element <{tag}>")
            for key, value in el.attrib.items():
                name = key.rsplit("}", 1)[-1].lower()
                val = value.strip().lower()
                if name.startswith("on") or val.startswith("javascript:"):
                    raise ValueError(f"unsafe SVG attribute {name}")
                if name in {"href", "src"} and val.startswith(("http:", "https:", "//")):
                    raise ValueError("SVG contains an external network reference")
                # any attribute value (incl. style="", fill="url(...)") pointing at an external url()
                if "url(" in val and re.search(
                        r"url\(\s*['\"]?\s*(?!data:)(?:[a-zA-Z][a-zA-Z0-9+.-]*:|//)", val, re.I):
                    raise ValueError(f"SVG attribute {name} references an external URL via url()")
        return raw
    signatures = {
        ".png": (b"\x89PNG\r\n\x1a\n",),
        ".jpg": (b"\xff\xd8\xff",), ".jpeg": (b"\xff\xd8\xff",),
        ".webp": (b"RIFF",), ".ico": (b"\x00\x00\x01\x00",),
    }
    if ext in signatures and not any(raw.startswith(sig) for sig in signatures[ext]):
        raise ValueError(f"downloaded bytes do not match {ext} image signature")
    if ext == ".webp" and raw[8:12] != b"WEBP":
        raise ValueError("downloaded RIFF file is not WebP")
    return raw

# ---- colour helpers ----
def hx(rgb): return "#%02X%02X%02X" % rgb
def mix(rgb, other, t):  # t toward other (0..1)
    return tuple(round(rgb[i] + (other[i]-rgb[i])*t) for i in range(3))
def darken(rgb, t=.35): return mix(rgb, (0,0,0), t)
def lighten(rgb, t=.30): return mix(rgb, (255,255,255), t)
def to_rgb(h):
    h=h.lstrip("#")
    if len(h)==3: h="".join(c*2 for c in h)
    return tuple(int(h[i:i+2],16) for i in (0,2,4))
def is_neutral(rgb):
    mx,mn=max(rgb),min(rgb)
    # near-white = ALL channels high; near-black = ALL low; grey = low spread.
    # (Must use mn>238, not mx>238 — else vivid reds/yellows/greens with a 255
    #  channel get wrongly dropped, e.g. McDonald's yellow #FFC72C.)
    return mn>238 or mx<22 or (mx-mn)<22

_PIL_WARNED = False
def palette_from_image(raw):
    global _PIL_WARNED
    try:
        import io
        try:
            from PIL import Image
        except ImportError:
            if not _PIL_WARNED:
                print("[warn] Pillow (PIL) not installed — can't extract colours from the logo image; "
                      "palette will fall back to theme-color/CSS only (less accurate). "
                      "Install with `pip install Pillow` for better brand colours.", file=sys.stderr)
                _PIL_WARNED = True
            return None, None
        im = Image.open(io.BytesIO(raw)).convert("RGBA")
        bg = Image.new("RGBA", im.size, (255,255,255,255)); bg.alpha_composite(im)
        im = bg.convert("RGB").resize((80,80))
        q = im.quantize(colors=16).convert("RGB")
        counts = sorted(q.getcolors(80*80), reverse=True)  # (count,(r,g,b))
        ordered = [c for _,c in counts]
        brand = next((c for c in ordered if not is_neutral(c)), None)
        accent = next((c for c in ordered if not is_neutral(c) and c!=brand), None)
        return brand, accent
    except Exception:
        return None, None

def palette_from_css(html):
    hits = re.findall(r"#[0-9a-fA-F]{6}", html)
    freq={}
    for h in hits:
        rgb=to_rgb(h)
        if not is_neutral(rgb): freq[rgb]=freq.get(rgb,0)+1
    ordered=[c for c,_ in sorted(freq.items(), key=lambda kv:-kv[1])]
    return (ordered[0] if ordered else None,
            ordered[1] if len(ordered)>1 else None)


# ---- design tokens: the brand declaring ITSELF, not a campaign skin ----
# Highest-confidence signal available. A brand that ships `--color-brand-primary:#XXXXXX` has told
# us the answer outright; frequency-counting hex is guesswork by comparison.
_TOKEN_RE = re.compile(
    r'(--[a-z0-9-]*(?:brand|primary|accent|theme|core)[a-z0-9-]*)\s*:\s*(#[0-9a-fA-F]{3,8})\b', re.I)

def palette_from_tokens(css_text):
    """(brand, accent) from CSS custom properties, or (None, None)."""
    found = []
    for m in _TOKEN_RE.finditer(css_text):
        name, hexv = m.group(1), m.group(2)
        try:
            rgb = to_rgb(hexv[:7])
        except Exception:
            continue
        if is_neutral(rgb):
            continue
        # a token literally named *primary* / *brand* outranks one merely named *accent*
        rank = 0 if re.search(r"brand|primary", name, re.I) else 1
        found.append((rank, rgb))
    if not found:
        return None, None
    found.sort(key=lambda t: t[0])
    brand = found[0][1]
    accent = next((rgb for _, rgb in found if rgb != brand), None)
    return brand, accent


def fetch_css_bundle(html, base_url, fetch_fn, limit=4, cap=2_000_000):
    """The page's INLINE css is a campaign skin. The brand lives in the linked stylesheets.

    dyson.co.uk carries 347KB of inline HTML with zero design tokens and a seasonal promo palette
    (#B96259/#65A01B), while the real 631KB clientlib sits one <link> away. Scraping only what
    arrives in the first response is why the scraper confidently returned the wrong brand.
    Returns the inline html plus each linked stylesheet, concatenated. Best-effort: a stylesheet
    that fails to fetch is skipped, never fatal.
    """
    out = [html]
    hrefs = re.findall(r'<link[^>]+rel=["\']stylesheet["\'][^>]*href=["\']([^"\']+)', html, re.I)
    hrefs += re.findall(r'<link[^>]+href=["\']([^"\']+)["\'][^>]*rel=["\']stylesheet["\']', html, re.I)
    seen, total = set(), 0
    for href in hrefs:
        if len(seen) >= limit or total >= cap:
            break
        try:
            u = urllib.parse.urljoin(base_url, href)
        except Exception:
            continue
        if u in seen:
            continue
        seen.add(u)
        try:
            css = fetch_fn(u)               # same SSRF validation + size caps as every other fetch
            if isinstance(css, bytes):
                css = css.decode("utf-8", "replace")
            out.append(css); total += len(css)
        except Exception:
            continue                        # a missing stylesheet must never fail the whole fetch
    return "\n".join(out)

def svg_colour_profile(raw: bytes) -> dict:
    """What colours does this SVG actually paint with, and is it usable on a light deck?

    Brands ship a light-background and a dark-background logo. A fetch that grabs one and records
    NOTHING about which it got is how a white-on-white wordmark ships invisible with every gate
    green — render_qa only checks the logo is REFERENCED, not that anyone can see it. (Real case:
    dyson.co.uk serves the white variant; on a light deck it is a blank rectangle.)
    """
    try:
        text = raw.decode("utf-8", "replace")
    except Exception:
        return {"monochrome": None, "fills": [], "needs_dark_background": None}
    fills = set()
    for m in re.finditer(r'(?:fill|stroke)\s*[:=]\s*["\']?\s*(#[0-9a-fA-F]{3,8})', text):
        fills.add(m.group(1).lower())
    for m in re.finditer(r'(?:fill|stroke)\s*[:=]\s*["\']?\s*(none|currentColor)\b', text, re.I):
        fills.add(m.group(1).lower())
    paints = {f for f in fills if f not in ("none", "currentcolor")}
    def _lum(h):
        r, g, b = to_rgb(h)
        return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
    light = [p for p in paints if _lum(p) > 0.85]
    mono = len(paints) == 1
    # every painted colour is near-white -> this is the dark-background variant
    needs_dark = bool(paints) and len(light) == len(paints)
    return {"monochrome": mono, "fills": sorted(paints), "needs_dark_background": needs_dark,
            "uses_currentcolor": "currentcolor" in fills}


# ---- logo discovery ----
def find_logo(html, base):
    cands=[]
    # Prefer explicit in-page logo images over generic favicons/social preview banners.
    for m in re.finditer(r'<img[^>]+(?:class|alt|src)=["\'][^"\']*logo[^"\']*["\'][^>]*>', html, re.I):
        href=re.search(r'src=["\']([^"\']+)', m.group(0));  cands.append(href.group(1)) if href else None
    for m in re.finditer(r'<link[^>]+rel=["\'][^"\']*icon[^"\']*["\'][^>]*>', html, re.I):
        href=re.search(r'href=["\']([^"\']+)', m.group(0));  cands.append(href.group(1)) if href else None
    for prop in ("og:image","twitter:image"):
        m=re.search(r'<meta[^>]+(?:property|name)=["\']'+re.escape(prop)+r'["\'][^>]*content=["\']([^"\']+)', html, re.I)
        if m: cands.append(m.group(1))
    seen=[];
    for c in cands:
        u=urllib.parse.urljoin(base, c)
        if u not in seen: seen.append(u)
    return seen

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("url")
    ap.add_argument("--slug", required=True)
    ap.add_argument("--project-root", default=os.getcwd())
    ap.add_argument("--allow-private-network", action="store_true",
                    help="allow intranet/localhost brand sites (explicit opt-in; unsafe for untrusted URLs)")
    a=ap.parse_args()
    try:
        slug = validate_slug(a.slug)
    except ValueError as e:
        print(f"[fail] invalid --slug: {e}"); return 1
    url=a.url if urllib.parse.urlparse(a.url).scheme else "https://"+a.url
    outdir=os.path.abspath(os.path.join(a.project_root,"assets",slug))
    assets_root=os.path.abspath(os.path.join(a.project_root,"assets"))
    if os.path.commonpath([assets_root, outdir]) != assets_root:
        print("[fail] resolved brand output escapes project assets directory"); return 1
    os.makedirs(outdir, exist_ok=True)

    try:
        html=fetch(url, allow_private=a.allow_private_network)
    except Exception as e:
        print(f"[fail] could not fetch {url}: {e}\n-> ask the SC for the logo + 2 brand hex values."); sys.exit(1)

    # logo: try candidates, keep the first that downloads and is non-trivial
    logo_path=None
    for u in find_logo(html, url):
        try:
            raw=fetch(u, binary=True, allow_private=a.allow_private_network)
            if len(raw)<300: continue
            ext=os.path.splitext(urllib.parse.urlparse(u).path)[1].lower() or ".png"
            if ext not in (".svg",".png",".jpg",".jpeg",".webp",".ico"): ext=".png"
            raw=validate_asset(raw, ext)
            logo_path=os.path.join(outdir,"logo"+ext)
            open(logo_path,"wb").write(raw)
            break
        except Exception:
            continue

    # palette: theme-color > logo image > css hex
    brand=accent=None; source=[]
    m=re.search(r'<meta[^>]+name=["\']theme-color["\'][^>]*content=["\'](#[0-9a-fA-F]{3,6})', html, re.I)
    if m and not is_neutral(to_rgb(m.group(1))): brand=to_rgb(m.group(1)); source.append("theme-color")
    if logo_path and logo_path.endswith((".png",".jpg",".jpeg",".webp")):
        b2,a2=palette_from_image(open(logo_path,"rb").read())
        brand=brand or b2; accent=accent or a2
        if b2: source.append("logo")
    # The brand lives in the linked stylesheets, not the inline campaign markup — pull them in
    # before deciding anything from CSS.
    css_bundle = fetch_css_bundle(html, url, fetch)
    if len(css_bundle) > len(html):
        source.append("linked-css")

    # Design tokens first: a brand shipping `--color-brand-primary` has told us outright.
    if not brand or not accent:
        b0, a0 = palette_from_tokens(css_bundle)
        if b0:
            brand = brand or b0; accent = accent or a0
            source.append("design-tokens")

    if not brand or not accent:
        b3,a3=palette_from_css(css_bundle)
        brand=brand or b3; accent=accent or a3
        if b3: source.append("css")

    pal={"brand":None,"brand_deep":None,"accent":None,"accent_lt":None,
         "logo": os.path.basename(logo_path) if logo_path else None,
         "source": "+".join(source) or "none", "source_url": url}
    if brand:
        pal["brand"]=hx(brand); pal["brand_deep"]=hx(darken(brand))
        acc = accent or lighten(brand, .0) if accent else mix(brand,(255,255,255),.0)
        accent = accent or brand
        pal["accent"]=hx(accent); pal["accent_lt"]=hx(lighten(accent))

    # ---- what did we actually get? record it, don't just hope someone reads the warning ----
    # A scraped palette is a GUESS. Saying "verify it matches the brand!" in stdout and writing the
    # file anyway means the guess ships: it passes every gate, and the customer sees their own brand
    # in the wrong colours. Record the guess as UNVERIFIED so a downstream gate can refuse it, and
    # a human has to confirm (or replace) the values. Same shape as the 'reviewed' sign-off.
    pal["palette_verified"] = False
    pal["palette_confidence"] = (
        "none" if not brand
        else "high" if "design-tokens" in source          # the brand declaring itself outright
        else "medium" if "theme-color" in source or "logo" in source
        else "low")   # frequency-counting hex across a stylesheet is the weakest signal we have
    if logo_path and logo_path.lower().endswith(".svg"):
        prof = svg_colour_profile(open(logo_path, "rb").read())
        pal["logo_profile"] = prof
        pal["logo_needs_dark_background"] = prof.get("needs_dark_background")
    json.dump(pal, open(os.path.join(outdir,"brand.json"),"w",encoding="utf-8"), indent=2)

    print(f"\n=== brand_fetch · {a.slug} ===")
    print(f"logo : {pal['logo'] or 'NOT FOUND — ask the SC'}")
    print(f"palette source: {pal['source']}  (confidence: {pal['palette_confidence']})")

    if pal.get("logo_needs_dark_background"):
        print(f"\n[BLOCK] logo variant: every painted colour in {pal['logo']} is near-white "
              f"({', '.join(pal['logo_profile']['fills'])}).")
        print("        This is the DARK-BACKGROUND variant. On a light deck it renders as an "
              "invisible rectangle —")
        print("        and render_qa will NOT catch it: it checks the logo is referenced, not that "
              "it can be seen.")
        print("        -> fetch the light-background (dark-ink) variant, or place it only on a "
              "dark surface.")

    if pal["brand"]:
        print("\nCandidate palette — NOT VERIFIED, do not ship until a human confirms:\n")
        print(f"  --brand:{pal['brand']}; --brand-deep:{pal['brand_deep']};")
        print(f"  --accent:{pal['accent']}; --accent-lt:{pal['accent_lt']};")
        print(f"\n[BLOCK] palette_verified=false. These are scraped from {pal['source']} and are a "
              f"GUESS — a live campaign skin will")
        print("        poison them. Confirm against the brand's own guidelines, then set "
              "\"palette_verified\": true in brand.json.")
    else:
        print("\n[warn] no confident colours — ask the SC for the brand's two main hex values.")
    print(f"\nwritten: {os.path.join(outdir,'brand.json')}")

if __name__=="__main__":
    sys.exit(main() or 0)
