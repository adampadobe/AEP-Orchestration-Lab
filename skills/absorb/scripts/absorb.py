#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
experience-story-builder — ABSORB  (harvest reusable patterns from a finished deck)

Reads a built deck's HTML and banks its reusable pieces into the shared library,
so every demo makes the next one faster. Idempotent (re-running merges, never
duplicates) and conservative (only takes what's NEW and not already curated).

Harvests, each into its canonical format/location:
  • animations  — @keyframes + triggers          -> components/animations/<name>.css
  • screens     — one sample per screen TYPE       -> components/screens/<type>/
  • components  — NEW sub-slide widgets only        -> components/harvested/<name>.html
  • templates   — standalone drop-in slide files    -> templates/harvested/<type>.html
  • personas    — portrait images used by the deck  -> assets/personas/harvested-<name>/ (+ personas.json)
  • structure   — ordered screen-type sequence       -> components/structures/<source>.json
  • catalog     — index of everything                -> components/catalog.json

Handles BOTH authoring styles:
  • static decks       — slides written as <section class="slide …"> in the HTML.
  • JS-rendered decks  — slides built at runtime (e.g. document.createElement +
                         className='slide …'). These are rendered headlessly with
                         Chrome (--dump-dom) before harvesting; see --render.

Usage:
    python absorb.py <deck.html> --source <label> [--skills-root $CLAUDE_PLUGIN_DATA]
                     [--render auto|always|never] [--chrome /path/to/chrome]
"""
import argparse, base64, json, os, pathlib, re, shutil, subprocess, sys

try: sys.stdout.reconfigure(encoding="utf-8")
except Exception: pass

ap = argparse.ArgumentParser()
ap.add_argument("deck")
ap.add_argument("--source", required=True, help="label for where this came from, e.g. 'po-cruises'")
ap.add_argument("--skills-root",
                default=os.environ.get("CLAUDE_PLUGIN_DATA") or os.path.expanduser("~/.claude/skills"))
ap.add_argument("--render", choices=["auto", "always", "never"], default="auto",
                help="render JS-built decks with headless Chrome before harvesting (default: auto)")
ap.add_argument("--chrome", default=os.environ.get("CHROME_PATH"),
                help="path to Chrome/Chromium binary (auto-detected if omitted)")
ap.add_argument("--render-timeout", type=int, default=8000,
                help="virtual-time budget in ms for the headless render (default: 8000)")
ap.add_argument("--qa-passed", action="store_true",
                help="assert the source deck passed final QA — marks harvested entries verified:true. "
                     "Self-growing libraries degrade without this gate; run it only on signed-off decks.")
ap.add_argument("--allow-placeholders", action="store_true",
                help="(debug) bank even candidates whose markup still contains placeholder/lorem/TODO — off by default")
a = ap.parse_args()

VEB     = os.path.join(a.skills_root, "vision-experience-builder")
COMP    = os.path.join(VEB, "components")
TPL     = os.path.join(VEB, "templates", "harvested")
PERS    = os.path.join(VEB, "assets", "personas")
DECKDIR = os.path.dirname(os.path.abspath(a.deck))
raw     = open(a.deck, encoding="utf-8").read()

# ---------- rendering (JS-built decks) ----------
def find_chrome():
    cands = [a.chrome,
             "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
             "/Applications/Chromium.app/Contents/MacOS/Chromium",
             "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
             shutil.which("google-chrome"), shutil.which("google-chrome-stable"),
             shutil.which("chromium"), shutil.which("chromium-browser"), shutil.which("chrome")]
    for c in cands:
        if c and os.path.isfile(c): return c
    return None

def has_static_slides(s):
    return re.search(r'<section[^>]*class=["\'][^"\']*\bslide\b', s, re.I) is not None

def looks_js_built(s):
    return bool(re.search(r"""querySelectorAll\(\s*['"]\.slide""", s)) \
        or bool(re.search(r"""className\s*=\s*['"]slide\b""", s)) \
        or bool(re.search(r"""classList\.add\(\s*['"]slide['"]""", s))

def render(deck, raw_html):
    """Return (html_to_harvest, rendered_bool)."""
    if a.render == "never":
        return raw_html, False
    if a.render == "auto":
        if has_static_slides(raw_html):           # already authored as static <section class="slide">
            return raw_html, False
        if not looks_js_built(raw_html):          # nothing suggests JS-built slides
            return raw_html, False
    ch = find_chrome()
    if not ch:
        print("! render requested but no Chrome/Chromium found — harvesting static HTML only.")
        return raw_html, False
    out = os.path.abspath(deck) + ".rendered.html"
    uri = pathlib.Path(os.path.abspath(deck)).as_uri()
    cmd = [ch, "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
           "--allow-file-access-from-files", f"--virtual-time-budget={a.render_timeout}",
           "--dump-dom", uri]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=a.render_timeout/1000 + 45)
    except Exception as e:
        print(f"! render failed ({e}); harvesting static HTML only."); return raw_html, False
    dom = res.stdout or ""
    if not has_static_slides(dom):
        print("! render produced no <section class=\"slide\"> — harvesting static HTML only.")
        return raw_html, False
    open(out, "w", encoding="utf-8").write(dom)
    print(f"rendered via {os.path.basename(ch)} -> {out}  ({len(dom):,} bytes)")
    return dom, True

html, was_rendered = render(a.deck, raw)
style = "\n".join(re.findall(r"<style[^>]*>(.*?)</style>", html, re.S))

# ---------- helpers ----------
def block_after(s, i):           # balanced {...} starting at first { from i
    start = s.index("{", i); depth = 0
    for j in range(start, len(s)):
        if s[j] == "{": depth += 1
        elif s[j] == "}":
            depth -= 1
            if depth == 0: return start, j
    return start, len(s)-1

def top_rules(css):              # (selector, body) for top-level rules, skip @-rules
    i = 0; n = len(css)
    while i < n:
        br = css.find("{", i)
        if br < 0: break
        sel = css[i:br].strip()
        s0, e0 = block_after(css, i)
        if sel and not sel.startswith("@"): yield sel, css[s0+1:e0]
        i = e0 + 1

def extract_element(s, start):   # full balanced HTML element beginning at index `start` ('<')
    m = re.match(r"<([a-zA-Z][\w-]*)", s[start:])
    if not m: return s[start:start+1]
    tag = m.group(1)
    op = re.compile(r"<"+tag+r"\b", re.I); cl = re.compile(r"</"+tag+r"\s*>", re.I)
    depth = 0; i = start
    while i < len(s):
        mo = op.search(s, i); mc = cl.search(s, i)
        if mc is None: break
        if mo and mo.start() < mc.start(): depth += 1; i = mo.end()
        else:
            depth -= 1; i = mc.end()
            if depth == 0: return s[start:i]
    return s[start:i]

def classes_in(frag):
    out=set()
    for cm in re.findall(r'class="([^"]+)"', frag):
        out.update(cm.split())
    return out

def css_for(classes):
    return "\n".join(sel.strip()+"{"+body.strip()+"}"
                     for sel,body in top_rules(style)
                     if any(("."+c) in sel for c in classes))

def slug(s):
    return re.sub(r'[^a-z0-9]+', '-', (s or "").lower()).strip('-') or "persona"

# ---------- harvest guardrails (research §3: verify + dedup + version + no brand-bound instances) ----------
import hashlib
PLACEHOLDER_RE = re.compile(r"\blorem ipsum\b|\b(TODO|TBD|FIXME|XXX|PLACEHOLDER)\b|scenic image|hero image|\bimage<", re.I)
def looks_placeholder(frag):
    """A candidate that still carries placeholder markup must NOT enter the library (verification gate)."""
    return bool(PLACEHOLDER_RE.search(frag or ""))
def norm_hash(css):
    """Content hash (comments + whitespace stripped) so identical-but-renamed pieces dedupe."""
    t = re.sub(r"/\*.*?\*/", "", css or "", flags=re.S)
    t = re.sub(r"\s+", "", t)
    return hashlib.sha1(t.encode("utf-8")).hexdigest()[:12]
def looks_brand_bound(frag):
    """Several literal hex colours ⇒ the sample likely encodes ONE customer's brand and won't
    generalize — bank it flagged for tokenizing, never as a ready drop-in."""
    return len(set(re.findall(r"#[0-9a-fA-F]{6}", frag or ""))) >= 4
VERIFIED = a.qa_passed

# ---------- 1. animations ----------
anims = {}
for m in re.finditer(r"@keyframes\s+([A-Za-z0-9_-]+)\s*\{", style):
    name = m.group(1); s0, e0 = block_after(style, m.end()-1)
    anims[name] = {"keyframes": style[m.start():e0+1], "selectors": []}
for sel, body in top_rules(style):
    am = re.search(r"animation\s*:\s*([^;]+)", body)
    if am:
        for nm in anims:
            if re.search(r"\b"+re.escape(nm)+r"\b", am.group(1)):
                # strip any inline CSS comment riding on the selector — a comment here
                # corrupted wavebob.css (nested /* */ in the header) and polluted
                # catalog triggers with "/* ... */\n.selector" strings
                clean = re.sub(r"/\*.*?\*/\s*", "", sel, flags=re.S).strip()
                if clean:
                    anims[nm]["selectors"].append(clean)

# ---------- 2. screens (by feature fingerprint) ----------
# A section's OWN class is checked first (its authoring intent), then an inner feature class.
SECTION_TYPE = {"cover":"cover","journey":"journey-wave","divider":"divider",
                "tslide":"passage-of-time","closing":"closing",
                "intro":"persona-intro","recap":"journey-recap"}
# Deck-vocabulary fingerprints. Each (pattern, type); first match wins, so order
# specific -> generic. Patterns match class tokens inside the section markup.
# Coventry-BS / Adobe-journey vocabulary is listed first (most specific), then the
# original experience-story features as a generic fallback.
FEATURES = [
    # --- Coventry-BS deck vocabulary ---
    (r'class="[^"]*\bai-(overlay|typed|text)\b',              "ai-chat-discovery"),
    (r'class="[^"]*\btablet-(frame|mock|screen|shot)\b',      "tablet-web-mock"),
    (r'class="[^"]*\bphone-(frame|mock|heart)\b',             "phone-app-mock"),
    (r'class="[^"]*\bapp-(screen|phone|body)\b',              "mobile-onboarding"),
    (r'class="[^"]*\b(xfer-|tl-transfer)',                    "money-transfer"),
    (r'class="[^"]*\b(cv-res-|six-(save|calc|done))',         "savings-results"),
    (r'class="[^"]*\bseg-(wrap|pod|arrow|dots|high)\b',       "audience-segmentation"),
    (r'class="[^"]*\beml-(body|subj|from|top|logo)\b',        "email-mock"),
    (r'class="[^"]*\bcc-(phone|input|head|body)\b',           "concierge-chat"),
    (r'class="[^"]*\badv-q-',                                 "adviser-qa"),
    (r'class="[^"]*\b(dd-(gauge|readout|eyebrow)|dash-dial)\b',"optimizer-dashboard"),
    (r'class="[^"]*\bps-(wrap|prod-col|label|stub|bell)\b',   "profile-stitching"),
    (r'class="[^"]*\bgen-(dialog|box|fld|finished|toggle)\b', "genstudio-generate"),
    (r'class="[^"]*\b(consent-(box|card|foot|chk)|conv-(people|dotlive))\b', "consent-conversions"),
    (r'class="[^"]*\bpt-(progress|acct|badge|bellwrap)\b',    "lifecycle-trigger"),
    (r'class="[^"]*\b(hub-(brands|pchip|plabel)|p-experian)\b',"identity-hub"),
    (r'class="[^"]*\bjr-(status|jamie|arrow|pulse|badge)\b',  "realtime-rule"),
    (r'class="[^"]*\bao-(wrap|panel|ask|dim|img)\b',          "agent-orchestration"),
    (r'class="[^"]*\bbc-(preview|train|welcome|metrics|tile|screen)\b', "brand-concierge"),
    (r'class="[^"]*\bcp-(panel|member|chips|logo|live)\b',    "adviser-portal"),
    (r'class="[^"]*\bac-(funnel|compare|flow|stage|badge)\b', "ab-performance"),
    # --- original experience-story vocabulary (generic fallback) ---
    (r"ph-email","mobile-email"), (r"call-card|phone-photo","phone-call"),
    (r"phoneframe","mobile-device"), (r"datacard","data-reveal"),
    (r"kpigrid","kpi-dashboard"), (r'class="scores|class="gauge',"propensity-gauges"),
    (r'class="offers',"offer-ranking"), (r'class="agents',"agent-list"),
    (r'mockframe|class="browser',"browser-mock"), (r"pintro|portrait","persona-intro"),
    (r'class="tp|pcard',"cards-row"), (r'class="chain',"touchpoint-chain"),
    (r'class="story.*?class="screen',"dual-pane-narrative"),
    # last-resort generic dashboard
    (r'class="[^"]*\b(dash|col-main|kpi)\b',                  "analytics-dashboard"),
]
sections = re.findall(r"<section class=\"slide.*?</section>", html, re.S)
def classify(sec):
    m = re.match(r'<section class="([^"]+)"', sec)
    for c in (m.group(1).split() if m else []):
        if c in SECTION_TYPE: return SECTION_TYPE[c]
    for pat, name in FEATURES:
        if re.search(pat, sec, re.S): return name
    return "custom"

seq=[]; screens={}
for sec in sections:
    t = classify(sec); seq.append(t)
    if t not in screens:
        cls = classes_in(sec)
        screens[t] = {"classes": sorted(cls), "html": sec, "css": css_for(cls), "count": 0}
    screens[t]["count"] += 1

# ---------- catalog ----------
os.makedirs(os.path.join(COMP,"animations"), exist_ok=True)
os.makedirs(os.path.join(COMP,"structures"), exist_ok=True)
os.makedirs(os.path.join(COMP,"harvested"),  exist_ok=True)
os.makedirs(TPL, exist_ok=True)
catalog_path = os.path.join(COMP,"catalog.json")

def _detect_indent(path, default=2):
    """Indent the catalog is already written with, so re-writing it doesn't reformat every line."""
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                stripped = line.lstrip(" ")
                if stripped and stripped != line and not stripped.startswith("\n"):
                    return len(line) - len(stripped)
    except OSError:
        pass
    return default

catalog_indent = _detect_indent(catalog_path)
cat = {}
if os.path.isfile(catalog_path):
    try: cat = json.load(open(catalog_path,encoding="utf-8"))
    except Exception: pass
for k in ("animations","screens","structures","components","templates","personas"): cat.setdefault(k,[])
def upsert(lst, key, rec):
    for i,e in enumerate(lst):
        if e.get(key)==rec[key]:
            rec["sources"]=sorted(set(e.get("sources",[]))|set(rec.get("sources",[])))
            rec["first_source"]=e.get("first_source") or (e.get("sources") or [a.source])[0]
            if e.get("deprecated"): rec["deprecated"]=e["deprecated"]  # keep deprecations, never resurrect silently
            rec["verified"]=bool(e.get("verified")) or bool(rec.get("verified"))  # sticky once verified
            # Bump rev ONLY when something material changed. It used to bump on every re-harvest,
            # so re-absorbing an unchanged deck rewrote every entry it touched — churning the
            # shared catalog for no reason and making 'rev' count absorb RUNS, not revisions.
            prev = int(e.get("rev", 1))
            if {k: v for k, v in e.items() if k != "rev"} == {k: v for k, v in rec.items() if k != "rev"}:
                return          # identical: leave the STORED entry untouched. (Replacing it with an
                                # equal-but-differently-ordered dict still rewrites the JSON bytes.)
            rec["rev"] = prev + 1
            lst[i]=rec; return
    # Normalise the SAME bookkeeping fields the update branch sets, so a freshly-appended entry
    # already looks like an updated one. Otherwise the next absorb "changes" it just by adding
    # sources/verified, bumping rev and churning the catalog on an otherwise no-op run.
    rec["sources"]=sorted(set(rec.get("sources",[])))
    rec["verified"]=bool(rec.get("verified"))
    rec["first_source"]=rec.get("first_source") or a.source
    rec["rev"]=1
    lst.append(rec)

new_a=new_s=new_c=new_t=new_p=0
dedup_a=skipped_ph=0
skipped_custom=skipped_thin=0

# ---- bloat guards: what must NOT enter the shared library -------------------------------
# The library is only worth pulling from if every entry earns its place. Two things it kept
# banking that nothing could ever reuse:
UNCLASSIFIED = "custom"   # classify()'s fallback. It's ONE bucket, so every slide the matcher
                          # didn't recognise collapses into a single "custom" screen whose sample
                          # is just whichever came first and whose key_classes are a grab-bag of
                          # unrelated slides. That's not a screen TYPE — it's "everything else".
MIN_KEY_CLASSES = 3       # a "type" carrying almost no structure isn't a reusable pattern.
anim_by_hash={e.get("hash"):e for e in cat["animations"] if e.get("hash")}

# Windows/macOS filesystems are case-INsensitive: a 'flagPop' harvest would silently
# match an existing 'flagpop.css' (write skipped, phantom catalog entry — this happened:
# the coventry flagPop keyframes were lost). Track names case-insensitively and rename
# genuinely-different same-letters animations instead of colliding.
_anim_dir=os.path.join(COMP,"animations")
_ci={fn.lower():fn for fn in os.listdir(_anim_dir)} if os.path.isdir(_anim_dir) else {}
for name,info in anims.items():
    # id/filename canon is kebab-case (the flagPop/flagpop case-collision came from
    # mixed canons); the @keyframes name inside the file keeps its original casing
    name=re.sub(r'(?<=[a-z0-9])(?=[A-Z])','-',name).lower()
    body=re.sub(r'^\s*@keyframes\s+[A-Za-z0-9_-]+\s*', '', info["keyframes"], flags=re.S)  # drop the name
    h=norm_hash(body)                       # hash BODY only → identical frames dedupe regardless of name
    dup=anim_by_hash.get(h)
    if dup and dup.get("id")!=name:               # identical keyframe already banked under another name
        dup["sources"]=sorted(set(dup.get("sources",[]))|{a.source}); dedup_a+=1; continue
    fname=name+".css"
    clash=_ci.get(fname.lower())
    if clash and clash!=fname:                    # same letters, different case, different frames
        name=f"{name}-{re.sub(r'[^a-z0-9]+','-',a.source.lower()).strip('-')[:12]}"
        fname=name+".css"
    f=os.path.join(_anim_dir,fname)
    if not os.path.isfile(f):
        ex="/* triggered by: "+", ".join(sorted(set(info['selectors']))[:6])+" */\n" if info['selectors'] else ""
        open(f,"w",encoding="utf-8").write(f"/* animation: {name}  (harvested from {a.source}) */\n"+ex+info["keyframes"]+"\n"); new_a+=1
        _ci[fname.lower()]=fname
    rec={"id":name,"file":f"animations/{fname}","triggers":sorted(set(info["selectors"]))[:8],"hash":h,"verified":VERIFIED,"sources":[a.source]}
    upsert(cat["animations"],"id",rec); anim_by_hash[h]=rec

for t,info in screens.items():
    if t == UNCLASSIFIED:
        skipped_custom+=1; continue                # unclassifiable != reusable (see bloat guards)
    if len(info["classes"]) < MIN_KEY_CLASSES:
        skipped_thin+=1; continue                  # too little structure to be a pattern
    if not a.allow_placeholders and looks_placeholder(info["html"]):
        skipped_ph+=1; continue                    # verification gate: don't bank a placeholder-laden sample
    bb=looks_brand_bound(info["html"]+info["css"])  # brand-bound? flag for tokenizing, don't reuse as-is
    d=os.path.join(COMP,"screens",t); os.makedirs(d,exist_ok=True)
    if not os.path.isfile(os.path.join(d,"sample.html")):
        open(os.path.join(d,"sample.html"),"w",encoding="utf-8").write(info["html"]); new_s+=1
        open(os.path.join(d,"sample.css"),"w",encoding="utf-8").write(info["css"])
        json.dump({"type":t,"key_classes":info["classes"][:24],"source":a.source,
                   "brand_bound":bb,"generalize":("review — tokenize brand values first" if bb else "ok"),
                   "verified":VERIFIED,"description":"TODO: one line on when to use "+t},
                  open(os.path.join(d,"meta.json"),"w",encoding="utf-8"),indent=2)
    srec={"type":t,"dir":f"screens/{t}/","count_in_source":info["count"],
          "brand_bound":bb,"verified":VERIFIED,"sources":[a.source]}
    # surface the meta.json description in the catalog — catalog_pick scores catalog
    # text only, so a description left solely in meta.json is invisible to retrieval
    try:
        _m=json.load(open(os.path.join(d,"meta.json"),encoding="utf-8"))
        if _m.get("description") and not str(_m["description"]).startswith("TODO"):
            srec["description"]=_m["description"]
    except Exception: pass
    upsert(cat["screens"],"type",srec)

# ---------- 3. components — NEW sub-slide widgets only (skip anything already curated) ----------
CURATED = {"phoneframe","ph-email","ph-notif","call-card","phone-photo","browser","bbar",
           "mockframe","datacard","chain","cja-inset","gauge","scores","stitch","profilebar",
           "mvp-pill","closing-win","jwave","jnode"}
WIDGETS = {  # root class -> harvested component name
    "confirmed-card":"confirmed-receipt-card", "email-toast":"email-toast",
    "abandon-card":"abandon-overlay", "stagebar":"journey-stage-bar",
    "numdisc":"numbered-step-disc", "livebadge":"live-interactive-badge",
}
for root,cname in WIDGETS.items():
    if root in CURATED: continue
    f=os.path.join(COMP,"harvested",cname+".html")
    if not os.path.isfile(f):
        mm=re.search(r'<[a-zA-Z][^>]*class="[^"]*\b'+re.escape(root)+r'\b', html)
        if not mm: continue
        el=extract_element(html, mm.start())
        if not a.allow_placeholders and looks_placeholder(el):
            skipped_ph+=1; continue                # verification gate
        ccss=css_for(classes_in(el))
        open(f,"w",encoding="utf-8").write(
            f"<!-- component: {cname}  (harvested from {a.source}; root .{root}) -->\n<style>\n{ccss}\n</style>\n{el}\n"); new_c+=1
    upsert(cat["components"],"id",{"id":cname,"file":f"harvested/{cname}.html","root":root,"verified":VERIFIED,"sources":[a.source]})

# ---------- 4. templates — standalone drop-in slide files for NEW screen types ----------
TEMPLATE_COVERED = {"cover","persona-intro","journey-wave"}   # already curated in templates/
for t,info in screens.items():
    if t in TEMPLATE_COVERED or t=="custom": continue
    if not a.allow_placeholders and looks_placeholder(info["html"]): continue   # verification gate
    bb=looks_brand_bound(info["html"]+info["css"])
    f=os.path.join(TPL,t+".html")
    if not os.path.isfile(f):
        open(f,"w",encoding="utf-8").write(
            f"<!-- template: {t}  (standalone drop-in slide, harvested from {a.source}; rebrand via :root tokens) -->\n"
            f"<style>\n{info['css']}\n</style>\n{info['html']}\n"); new_t+=1
    upsert(cat["templates"],"type",{"type":t,"file":f"templates/harvested/{t}.html","brand_bound":bb,"verified":VERIFIED,"sources":[a.source]})

# ---------- 5. personas — copy portrait images used by the deck into the repo ----------
pj=os.path.join(PERS,"personas.json"); idx={"personas":[]}
if os.path.isfile(pj):
    try: idx=json.load(open(pj,encoding="utf-8"))
    except Exception: pass
have={p.get("folder") for p in idx.get("personas",[])}

def add_persona(pid, default_name, default_role, images, source):
    """images: list of (filename, role, raw_bytes_or_None_for_already_on_disk_path)."""
    global new_p
    folder=f"harvested-{pid}"
    if folder in have or os.path.isdir(os.path.join(PERS,folder)): return
    dest=os.path.join(PERS,folder); os.makedirs(dest,exist_ok=True)
    imgs=[]; portrait=None; avatar=None
    for fn,role,data in images:
        if data is not None:
            open(os.path.join(dest,fn),"wb").write(data)
        else:
            shutil.copy2(os.path.join(DECKDIR,fn), os.path.join(dest,fn))
        imgs.append({"file":fn,"role":role})
        if role=="portrait" and not portrait: portrait=fn
        if role=="avatar": avatar=fn
    portrait=portrait or imgs[0]["file"]; fmt=os.path.splitext(portrait)[1].lstrip(".")
    meta={"archetype":pid,"folder":folder,"tags":[],"default_name":default_name or pid.capitalize(),
          "default_role":default_role or "TODO — fill before reuse","images":imgs,
          "default_pose":portrait,"avatar":avatar,"format":fmt,"source":source}
    json.dump(meta, open(os.path.join(dest,"meta.json"),"w",encoding="utf-8"), indent=2)
    idx["personas"].append({"archetype":pid,"folder":folder,"tags":[],
        "default_name":default_name or pid.capitalize(),"default_role":default_role or "TODO",
        "pose_count":len(imgs),"default_pose":portrait,"avatar":avatar,"format":fmt,"source":source})
    have.add(folder); new_p+=1
    upsert(cat["personas"],"folder",{"folder":folder,"name":default_name or pid.capitalize(),"sources":[source]})

# 5a. sibling persona-*.jpg image files next to the deck (static decks)
def base_of(fn):
    stem=re.sub(r'^persona-','',os.path.splitext(fn)[0],flags=re.I)
    return re.split(r'-(av|avatar|phone|portrait|sm|lg|hero)$',stem,flags=re.I)[0]
groups={}
for fn in set(re.findall(r'persona-[\w-]+\.(?:jpg|jpeg|png|webp)', html, re.I)):
    if os.path.isfile(os.path.join(DECKDIR,fn)): groups.setdefault(base_of(fn),[]).append(fn)
for pid,files in groups.items():
    images=[]
    for fn in sorted(files):
        role="avatar" if re.search(r'-(av|avatar)\.',fn,re.I) else ("phone" if "phone" in fn.lower() else "portrait")
        images.append((fn,role,None))
    add_persona(pid,None,None,images,a.source)

# 5b. personas declared in JS (name/role) with a base64 portrait inside their intro slide
EXT={"jpeg":"jpg","jpg":"jpg","png":"png","webp":"webp","gif":"gif","svg+xml":"svg"}
names=[]
pm=re.search(r'(?:const|let|var)\s+personas\s*=\s*\[(.*?)\]\s*;', html, re.S)
if pm:
    for obj in re.findall(r'\{[^{}]*\}', pm.group(1)):
        nm=re.search(r'name\s*:\s*[\'"]([^\'"]+)', obj)
        rl=re.search(r'role\s*:\s*[\'"]([^\'"]+)', obj)
        names.append((nm.group(1) if nm else None, rl.group(1) if rl else None))
for sec in sections:
    if "persona-intro" != classify(sec): continue
    pidx=re.search(r'data-persona="(\d+)"', sec)
    pi=int(pidx.group(1)) if pidx else None
    nm, rl = (names[pi] if (pi is not None and pi < len(names)) else (None, None))
    if not nm: continue
    bm=re.search(r'data:image/([\w+.-]+);base64,([A-Za-z0-9+/=\s]+?)["\')]', sec)
    if not bm: continue
    ext=EXT.get(bm.group(1).lower(), re.sub(r'[^a-z0-9]','',bm.group(1).lower()) or "img")
    try: data=base64.b64decode(re.sub(r'\s+','',bm.group(2)))
    except Exception: continue
    pid=slug(nm)
    add_persona(pid, nm, rl, [(f"persona-{pid}.{ext}","portrait",data)], a.source)

# fresh skills-root may have no personas dir yet — without this, the crash here
# loses the ENTIRE catalog write below (found by tests/test_absorb.py)
os.makedirs(os.path.dirname(pj), exist_ok=True)
json.dump(idx, open(pj,"w",encoding="utf-8"), indent=2)

# ---------- 6. structure + catalog ----------
struct={"id":a.source,"sequence":seq,"slides":len(seq),"rendered":was_rendered}
json.dump(struct, open(os.path.join(COMP,"structures",a.source+".json"),"w",encoding="utf-8"), indent=2)
upsert(cat["structures"],"id",struct)
# Write the shared catalog back with the indent it ALREADY uses. Hard-coding indent=2 against a
# catalog written at indent=1 rewrote all ~6k lines on every absorb: unreviewable diffs and a
# guaranteed merge conflict whenever two people absorb. Preserve the file's own convention.
json.dump(cat, open(catalog_path,"w",encoding="utf-8"), indent=catalog_indent)

# ---------- report ----------
print(f"\n=== absorbed '{a.source}' ==={'  (rendered headlessly)' if was_rendered else ''}")
print(f"animations : {len(anims)} found ({new_a} new) -> components/animations/")
print(f"screens    : {len(screens)} types ({new_s} new) -> components/screens/")
print(f"components : {new_c} new widgets -> components/harvested/")
print(f"templates  : {new_t} new drop-in slides -> templates/harvested/")
print(f"personas   : {new_p} new -> assets/personas/harvested-*/")
print(f"structure  : {len(seq)} slides -> "+ " → ".join(seq[:12]) + (" …" if len(seq)>12 else ""))
if dedup_a:    print(f"deduped    : {dedup_a} identical animation(s) merged by content-hash (not re-added)")
if skipped_ph: print(f"skipped    : {skipped_ph} placeholder-laden candidate(s) — NOT banked (verification gate)")
# Say what was withheld and why — a silent filter reads as "nothing to bank" when it isn't.
if skipped_custom: print(f"skipped    : {skipped_custom} unclassified slide-group(s) — NOT banked "
                         f"('{UNCLASSIFIED}' is the matcher's fallback bucket, not a reusable type). "
                         f"If one IS a real pattern, add a rule to FEATURES/SECTION_TYPE and re-run.")
if skipped_thin:   print(f"skipped    : {skipped_thin} screen(s) with <{MIN_KEY_CLASSES} key classes — "
                         f"NOT banked (too little structure to reuse)")
bb_screens=[e['type'] for e in cat['screens'] if e.get('brand_bound')]
if bb_screens: print(f"brand-bound: {len(bb_screens)} screen sample(s) flagged generalize=review (tokenize before reuse): {', '.join(bb_screens[:8])}")
print(f"verified   : harvested entries marked verified={VERIFIED}" + ("" if VERIFIED else "  ← pass --qa-passed on a signed-off deck"))
print(f"catalog    : {catalog_path}")
print("\nNext: fill TODO descriptions/tags in any NEW screens/<type>/meta.json and personas meta.")
