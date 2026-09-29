#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Verify screens/cx-enterprise-home against its Figma source.  Run:  python verify.py

Self-contained: builds its own preview from sample.html + sample.css, renders it headless, and
checks two things the eye cannot:

  GEOMETRY — rendered boxes vs the numbers published by get_design_context for node 538:36576.
             Every EXPECT below was read out of the design, not measured off a picture.
  COLOUR   — per-pixel compare against figma-reference.png, the cropped get_screenshot render
             banked beside this file. Frame-level gradient fills (the banner sweep, the two card
             headers, the four skill tints) are NOT published variables, so pixels are the only
             ground truth available for them.

Why this exists: the build was wrong in four ways that all looked fine on screen — the content
column was 56px high (the column's y is measured inside V1_home, not the frame), the hero was
26px too tall (the terms line is not in the hero frame), the page was neutral grey instead of the
indigo "new EC colors" wash, and the skill tints included a purple that is actually green.

Needs Playwright + Pillow; skips cleanly without them.
"""
import asyncio, sys, tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
TOL_PX, TOL_RGB = 2, 10

try:
    from playwright.async_api import async_playwright
    from PIL import Image
    HAVE = True
except Exception:
    HAVE = False

# selector -> (x, y, w, h) in FRAME coords (origin = top-left of .cx-home). None = don't check.
EXPECT = {
    ".cx-home":   (0,   0,    1440, 2560),   # frame "Home with new EC colors"
    ".cx-hdr":    (0,   0,    1440, 56),     # "Shell header"
    ".cx-stage":  (56,  56,   1372, 2504),   # "V1_home" (Content area x=44 + V1_home x=12)
    ".cx-col":    (238, 227,  1008, None),   # "Frame 2085665462": x=182,y=171 INSIDE V1_home
    ".cx-hero":   (342, 227,  800,  350),    # hero 800x350, x=104 inside the column
    ".cx-prompt": (342, 401,  800,  176),    # "Prompt Bar": y=174 inside the hero
    ".cx-sec:nth-of-type(1)": (238, 641,  1008, 808),   # Continue where you left off @ y=414
    ".cx-sec:nth-of-type(2)": (238, 1513, 1008, 296),   # Recommended skills          @ y=1286
    ".cx-sec:nth-of-type(3)": (238, 1873, 1008, 557),   # Suggested prompts           @ y=1646
    # .cx-rail is deliberately NOT asserted: the nav instance is 56x844 but carries no fill, so
    # layer-1 shows through and the strip reads full-height. The colour points below hold it.
}

# name -> (x, y) sampled on flat background only, never on text or a card edge.
POINTS = [
    ("rail",          28, 400),  ("rail low",      28, 2400),
    ("banner cyan",  300, 70),   ("banner violet", 740, 70),
    ("banner peach",1180, 70),   ("banner fade",   300, 250),
    ("stage @400",    70, 400),  ("stage @900",     70, 900),
    ("stage @1400",   70, 1400), ("stage @2400",    70, 2400),
    ("gutter @1700", 150, 1700), ("gutter @2500",  150, 2500),
    ("right @1300", 1350, 1300), ("right @2550",  1350, 2550),
    ("card1 grad L", 245, 1200), ("card1 grad R",  558, 1200),
    ("card2 grad L", 585, 1200), ("card2 grad R",  898, 1200),
    ("card3 grad L", 926, 1200), ("card3 grad R", 1240, 1200),
    ("skill1 tint",  243, 1585), ("skill2 tint",   499, 1585),
    ("skill3 tint",  755, 1585), ("skill4 tint",  1011, 1585),
]

PREVIEW = """<!doctype html><html><head><meta charset="utf-8"><title>cx-enterprise-home</title><style>
@import url('https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;500;600;700;800&display=swap');
body{{margin:0;background:#5b5f66;display:flex;justify-content:center;padding:24px 0;}}
{css}</style></head><body>{html}</body></html>"""


async def render(png: Path):
    html = PREVIEW.format(css=(HERE / "sample.css").read_text(encoding="utf-8"),
                          html=(HERE / "sample.html").read_text(encoding="utf-8"))
    with tempfile.TemporaryDirectory() as td:
        f = Path(td) / "preview.html"
        f.write_text(html, encoding="utf-8")
        async with async_playwright() as p:
            b = await p.chromium.launch()
            pg = await b.new_page(viewport={"width": 1500, "height": 1000})
            await pg.goto(f.as_uri(), wait_until="networkidle")
            await pg.wait_for_timeout(1200)
            el = await pg.query_selector(".cx-home")
            origin = await pg.evaluate(
                "()=>{const b=document.querySelector('.cx-home').getBoundingClientRect();return{x:b.x,y:b.y}}")
            boxes = {}
            for sel in EXPECT:
                boxes[sel] = await pg.evaluate(
                    "s=>{const e=document.querySelector(s); if(!e) return null;"
                    "const b=e.getBoundingClientRect(); return {x:b.x,y:b.y,w:b.width,h:b.height}}", sel)
            extra = await pg.evaluate("""() => ({
                welcome: document.querySelector('.cx-welcome').innerText,
                brokenSvgs: [...document.querySelectorAll('.cx-home svg')]
                              .filter(s => !s.querySelector('path,circle,rect')).length,
                svgs: document.querySelectorAll('.cx-home svg').length,
                font: getComputedStyle(document.querySelector('.cx-welcome')).fontFamily.split(',')[0],
                grid: (() => { const c=[...document.querySelectorAll('.cx-grid .cx-card')].map(e=>e.getBoundingClientRect());
                    return c.length<4?null:{n:c.length,w:Math.round(c[0].width),h:Math.round(c[0].height),
                      gutter:Math.round(c[1].x-c[0].right), rowGap:Math.round(c[3].y-c[0].bottom)}; })(),
            })""")
            await el.screenshot(path=str(png))
            await b.close()
    return origin, boxes, extra


def main():
    if not HAVE:
        print("SKIP: needs playwright + pillow (pip install playwright pillow && playwright install chromium)")
        return 0
    with tempfile.TemporaryDirectory() as td:
        png = Path(td) / "render.png"
        origin, boxes, extra = asyncio.run(render(png))
        fails = 0

        print("GEOMETRY  (rendered box vs the published Figma numbers)")
        print(f"  {'selector':<24} {'expected':<24} {'actual':<24} verdict")
        for sel, exp in EXPECT.items():
            r = boxes[sel]
            if not r:
                print(f"  {sel:<24} MISSING"); fails += 1; continue
            a = (round(r["x"] - origin["x"]), round(r["y"] - origin["y"]), round(r["w"]), round(r["h"]))
            bad = [n for n, i in (("x", 0), ("y", 1), ("w", 2), ("h", 3))
                   if exp[i] is not None and abs(a[i] - exp[i]) > TOL_PX]
            fails += bool(bad)
            print(f"  {sel:<24} {str(exp):<24} {str(a):<24} {'OK' if not bad else 'FAIL ' + ','.join(bad)}")

        exp_grid = {"n": 6, "w": 325, "h": 260, "gutter": 16, "rowGap": 16}
        ok = extra["grid"] == exp_grid
        fails += not ok
        print(f"  {'card grid':<24} {str(exp_grid)}")
        print(f"  {'':<24} {str(extra['grid'])}  {'OK' if ok else 'FAIL'}")

        for label, got, want in (("welcome copy", extra["welcome"], "Welcome, Patricia"),
                                 ("heading font", extra["font"], '"Source Sans 3"')):
            ok = got == want
            fails += not ok
            print(f"  {label:<24} {got!r} {'OK' if ok else 'FAIL expected ' + want!r}")
        ok = extra["brokenSvgs"] == 0
        fails += not ok
        print(f"  {'icons':<24} {extra['svgs']} svg, {extra['brokenSvgs']} broken  {'OK' if ok else 'FAIL'}")

        ref = HERE / "figma-reference.png"
        if not ref.exists():
            print("\nCOLOUR    SKIP: figma-reference.png missing")
        else:
            fig, mine = Image.open(ref).convert("RGB"), Image.open(png).convert("RGB")
            def s(im, x, y):
                return im.getpixel((min(int(x * im.width / 1440), im.width - 1),
                                    min(int(y * im.height / 2560), im.height - 1)))
            hx = lambda p: "#%02X%02X%02X" % p
            print(f"\nCOLOUR    (vs figma-reference.png, tol {TOL_RGB})")
            print(f"  {'point':<15} {'figma':<9} {'mine':<9} {'d':>3}  verdict")
            for name, x, y in POINTS:
                a, b = s(fig, x, y), s(mine, x, y)
                d = max(abs(a[i] - b[i]) for i in range(3))
                fails += d > TOL_RGB
                print(f"  {name:<15} {hx(a):<9} {hx(b):<9} {d:>3}  {'OK' if d <= TOL_RGB else 'OFF'}")

        print("\n" + ("VERIFIED: matches the Figma source" if not fails else f"{fails} check(s) FAILED"))
        return 0 if not fails else 1


if __name__ == "__main__":
    sys.exit(main())
