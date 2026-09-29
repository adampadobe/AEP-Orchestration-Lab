#!/usr/bin/env python3
"""
Build the labelled icon pack: semantic-name -> inline SVG lookup (pack.json).

The builder looks up an icon by SEMANTIC LABEL (e.g. "notification", "boarding") rather than
a raw file name, so scenes stay readable and the underlying set can change. Sources are
permissively licensed (Lucide ISC today; add Adobe Spectrum Apache-2.0 similarly). Icons are
inline SVG only — never emoji. See ../../asset-licensing.md.

Run after adding/removing SVGs:  python build_pack.py
"""
import json, os, re

HERE = os.path.dirname(os.path.abspath(__file__))

# semantic label -> (set_dir, file_name).  Many labels may point at one glyph.
# Adobe Spectrum (Apache-2.0) is the ON-BRAND DEFAULT; Lucide (ISC) fills glyphs the
# Spectrum workflow set lacks (payment, flight, shield, qr, wifi).
LABELS = {
    "notification": ("spectrum", "bell"),          "alert": ("spectrum", "bell"),
    "email": ("spectrum", "email"),                "inbox": ("spectrum", "email"),
    "call": ("spectrum", "phone"),
    "chat": ("spectrum", "chat"),                  "concierge": ("spectrum", "chat"),
    "search": ("spectrum", "search"),
    "location": ("spectrum", "location"),          "map": ("spectrum", "location"),
    "calendar": ("spectrum", "calendar"),
    "time": ("spectrum", "clock"),
    "check": ("spectrum", "checkmark"),
    "confirmed": ("spectrum", "checkmark-circle"), "success": ("spectrum", "checkmark-circle"),
    "profile": ("spectrum", "user"),
    "favorite": ("spectrum", "star"),              "loyalty": ("spectrum", "star"),
    "next": ("spectrum", "chevron-right"),
    "ai": ("spectrum", "magic-wand"),              "magic": ("spectrum", "magic-wand"),
    "lock": ("spectrum", "lock"),
    "home": ("spectrum", "home"),
    "analytics": ("spectrum", "data"),             "data": ("spectrum", "data"),
    # Experience Cloud shell + AI home surface (Figma "Summit-2026" node 538:36576).
    # These labels carry the glyphs that screen instantiates by name (S2_Icon_Community_20_N,
    # S2_lin_rocket, S2_lin_megaphonePromote, S2_lin_userGroup).
    "quick-action": ("spectrum", "rocket"),        "resume": ("spectrum", "rocket"),
    "campaign": ("spectrum", "promote"),           "promote": ("spectrum", "promote"),
    "community": ("spectrum", "community"),
    "audience": ("spectrum", "user-group"),        "segment": ("spectrum", "user-group"),
    "more": ("spectrum", "more"),                  "overflow": ("spectrum", "more"),
    "help": ("spectrum", "help-circle"),
    "apps": ("spectrum", "apps"),                  "app-switcher": ("spectrum", "apps"),
    "share": ("spectrum", "share"),
    "like": ("spectrum", "heart"),                 "save": ("spectrum", "heart"),
    "send": ("spectrum", "send"),                  "submit": ("spectrum", "send"),
    "add": ("spectrum", "add"),                    "attach": ("spectrum", "add"),
    "edit": ("spectrum", "edit"),
    "view": ("spectrum", "preview"),               "preview": ("spectrum", "preview"),
    "close": ("spectrum", "close"),                "dismiss": ("spectrum", "close"),
    "refresh": ("spectrum", "refresh"),
    "thumb-up": ("spectrum", "thumb-up"),          "helpful": ("spectrum", "thumb-up"),
    "thumb-down": ("spectrum", "thumb-down"),      "not-helpful": ("spectrum", "thumb-down"),
    # Lucide fills what the Spectrum workflow set lacks:
    "payment": ("lucide", "credit-card"),          "checkout": ("lucide", "credit-card"),
    "flight": ("lucide", "plane"),                 "boarding": ("lucide", "plane"),
    "secure": ("lucide", "shield-check"),          "trust": ("lucide", "shield-check"),
    "connectivity": ("lucide", "wifi"),
    "boarding-pass": ("lucide", "qr-code"),        "ticket": ("lucide", "qr-code"),
}

LICENSES = {"lucide": "ISC (lucide.dev)", "spectrum": "Apache-2.0 (github.com/adobe/spectrum-css-workflow-icons)"}


def load_svg(set_dir, name):
    p = os.path.join(HERE, set_dir, name + ".svg")
    if not os.path.isfile(p):
        return None
    svg = open(p, encoding="utf-8").read()
    svg = re.sub(r"<!--.*?-->", "", svg, flags=re.S).strip()  # drop license comment (kept in meta)
    return re.sub(r"\s+", " ", svg)


def main():
    icons, missing = {}, []
    for label, (set_dir, name) in LABELS.items():
        svg = load_svg(set_dir, name)
        if svg is None:
            missing.append(f"{set_dir}/{name}")
            continue
        icons[label] = {"set": set_dir, "file": name, "license": LICENSES.get(set_dir, "?"), "svg": svg}
    pack = {
        "_meta": {
            "description": "Labelled icon pack — look up by semantic label; inline the svg. Never emoji.",
            "sources": LICENSES,
            "count": len(icons),
        },
        "icons": icons,
    }
    out = os.path.join(HERE, "pack.json")
    json.dump(pack, open(out, "w", encoding="utf-8"), indent=2)
    print(f"wrote {out}: {len(icons)} labels" + (f"  (MISSING: {missing})" if missing else ""))


if __name__ == "__main__":
    main()
