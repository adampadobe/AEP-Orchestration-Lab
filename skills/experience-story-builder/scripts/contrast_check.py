#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
experience-story-builder — WCAG contrast gate for the resolved brand palette.

Research (WebAIM Million 2026): low-contrast text is the #1 accessibility failure — brand palettes
routinely fail WCAG AA. This deterministic gate runs at Stage 3 (Branding), AFTER the palette is
resolved. It (a) DERIVES an accessible body-text colour for every brand surface the deck renders on,
and (b) FAILS the build if any primary surface has no accessible body-text option.

    python contrast_check.py assets/<slug>/brand.json [--write] [--strict]

WCAG AA thresholds: body text >= 4.5:1 ; large text / UI (>=24px or >=18.66px bold) >= 3.0:1.
--write  : add an `accessible` block to brand.json (text_on_<surface> + notes) for the builder to use.
--strict : promote WARN (e.g. brand-as-body-text-on-white fails) to a hard error.

Zero dependencies (stdlib only). Exit 0 = clear to build ; exit 1 = a surface has no accessible body text.
"""
import argparse, json, os, sys

try: sys.stdout.reconfigure(encoding="utf-8")
except Exception: pass

WHITE, INK = "#FFFFFF", "#111111"
AA_BODY, AA_LARGE = 4.5, 3.0


def to_rgb(h):
    h = h.strip().lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    if len(h) != 6:
        raise ValueError(f"bad hex: #{h}")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def _lin(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4


def luminance(hex_):
    r, g, b = to_rgb(hex_)
    return 0.2126 * _lin(r) + 0.7152 * _lin(g) + 0.0722 * _lin(b)


def ratio(fg, bg):
    l1, l2 = luminance(fg), luminance(bg)
    hi, lo = max(l1, l2), min(l1, l2)
    return (hi + 0.05) / (lo + 0.05)


def level(r):
    return "body" if r >= AA_BODY else ("large" if r >= AA_LARGE else "fail")


def best_text_on(bg):
    """Pick white or ink for body text on a surface; return (colour, ratio)."""
    rw, ri = ratio(WHITE, bg), ratio(INK, bg)
    return (WHITE, rw) if rw >= ri else (INK, ri)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("brand_json")
    ap.add_argument("--write", action="store_true")
    ap.add_argument("--strict", action="store_true")
    a = ap.parse_args()

    try:
        brand = json.load(open(a.brand_json, encoding="utf-8"))
    except FileNotFoundError:
        print(f"[FAIL] not found: {a.brand_json}"); sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"[FAIL] invalid JSON: {e}"); sys.exit(1)

    surfaces = {k: brand[k] for k in ("brand", "brand_deep", "accent", "accent_lt")
                if isinstance(brand.get(k), str) and brand.get(k).startswith("#")}
    if not surfaces:
        print("[FAIL] brand.json has no hex surfaces (brand/brand_deep/accent/accent_lt)"); sys.exit(1)

    errors, warnings, derived = [], [], {}
    print(f"\n=== contrast_check · {os.path.basename(os.path.dirname(a.brand_json)) or '?'} ===")

    # (a) derive accessible body text for each surface the deck paints panels/heroes in
    for name, hexv in surfaces.items():
        try:
            txt, r = best_text_on(hexv)
        except ValueError as e:
            errors.append(str(e)); continue
        lv = level(r)
        derived[f"text_on_{name}"] = txt
        tag = "OK body" if lv == "body" else ("large-only" if lv == "large" else "FAIL")
        line = f"  {name:10} {hexv} → text {txt} = {r:4.1f}:1  [{tag}]"
        # brand & brand_deep are primary body surfaces — must reach 4.5 with white OR ink
        if name in ("brand", "brand_deep") and lv != "body":
            errors.append(f"surface '{name}' ({hexv}) has no accessible body-text colour (best {txt} = {r:.1f}:1 < 4.5) — darken/lighten the surface")
        elif lv != "body":
            warnings.append(f"surface '{name}' body text only reaches {r:.1f}:1 with {txt} — use it for large text/UI, not body")
        print(line)

    # (b) coloured brand/accent used AS text on a light (white) background — common body-text failure
    for name in ("brand", "accent"):
        if name in surfaces:
            r = ratio(surfaces[name], WHITE)
            lv = level(r)
            derived[f"{name}_as_text_on_white"] = lv  # body|large|fail
            if lv != "body":
                warnings.append(f"'{name}' as text on white = {r:.1f}:1 ({lv}) — do NOT use for body copy on light backgrounds; large text / accents only")
            print(f"  {name}-on-white text = {r:4.1f}:1  [{lv}]")

    for w in warnings: print(f"[WARN] {w}")
    for e in errors:   print(f"[FAIL] {e}")

    if a.write and not errors:
        brand["accessible"] = derived
        json.dump(brand, open(a.brand_json, "w", encoding="utf-8"), indent=2)
        print(f"[write] added `accessible` block to {a.brand_json}")

    fail = errors or (a.strict and warnings)
    if not fail:
        print(f"\nRESULT: OK — accessible body-text colours derived for every surface"
              f"{' ('+str(len(warnings))+' warning(s))' if warnings else ''}. Clear to build.")
        sys.exit(0)
    print(f"\nRESULT: {len(errors)} error(s), {len(warnings)} warning(s) — FAIL. "
          f"No deck ships with sub-4.5:1 body text; fix the palette or surface before build.")
    sys.exit(1)


if __name__ == "__main__":
    main()
