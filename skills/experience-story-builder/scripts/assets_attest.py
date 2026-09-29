#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
assets_attest.py — attest the `assets_inventoried` gate by OPENING the assets, not by claiming
they were checked.

`assets_inventoried` used to be hand-set. The promise it makes is a PRE-build one: "every asset
this deck needs already exists". Nothing verified it, which is how a missing customer logo
becomes a silent stand-in that nobody notices until it is on screen in front of the client.

(Post-build is already covered: render_qa fails on BROKEN-REF / REMOTE-REF in the finished
deck. This gate is the earlier promise — that you had the assets BEFORE you started building.)

Checks:
  1. the storyboard parses
  2. `asset_inventory` is PRESENT. Absent is now a fail: an empty list `[]` is a fine answer
     ("this deck supplies no assets"), but it has to be said out loud rather than left silent
  3. every slot is status=resolved, or carries an explicit waiver reason (>= 10 chars) — the
     same declared-stand-in escape hatch render_qa allows via data-no-persona
  4. every slot naming a file: the file exists, is non-empty, and is a real image/svg
  5. assets/<slug>/brand.json exists, names a logo, and that logo file is on disk and non-empty

Exit 0 records `assets_inventoried`. Exit 1 records nothing.

Usage:
  python assets_attest.py <storyboard.json> --slug <slug> [--project-root <root>]
"""
from __future__ import annotations
import argparse, json, os, sys

try: sys.stdout.reconfigure(encoding="utf-8")
except Exception: pass

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

FILE_KEYS = ("file", "path", "asset", "src", "image", "filename")
IMAGE_EXT = (".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif", ".avif")
# first bytes that prove the file is what its extension claims
MAGIC = {b"\x89PNG": "png", b"\xff\xd8\xff": "jpg", b"RIFF": "webp", b"GIF8": "gif"}


def looks_like_image(path: str) -> bool:
    try:
        head = open(path, "rb").read(12)
    except OSError:
        return False
    if path.lower().endswith(".svg"):
        return b"<svg" in head or b"<?xml" in head
    if any(head.startswith(m) for m in MAGIC):
        return True
    return path.lower().endswith(".avif") and b"ftyp" in head


def slot_file(slot: dict) -> str | None:
    for k in FILE_KEYS:
        v = slot.get(k)
        if isinstance(v, str) and v.strip() and v.lower().endswith(IMAGE_EXT):
            return v.strip()
    return None


def check_file(rel: str, root: str, label: str, errors: list[str]) -> None:
    target = os.path.normpath(os.path.join(root, rel))
    if not os.path.isfile(target):
        errors.append(f"MISSING      {label}: {rel} does not exist")
    elif os.path.getsize(target) == 0:
        errors.append(f"EMPTY        {label}: {rel} is 0 bytes")
    elif not looks_like_image(target):
        errors.append(f"NOT-AN-IMAGE {label}: {rel} is not a readable image/svg")


def main() -> int:
    ap = argparse.ArgumentParser(description="Attest `assets_inventoried` from the real files")
    ap.add_argument("storyboard")
    ap.add_argument("--slug", required=True)
    ap.add_argument("--project-root", default=None)
    a = ap.parse_args()

    sb_path = os.path.abspath(a.storyboard)
    if not os.path.isfile(sb_path):
        print(f"[GATE FAIL] assets_inventoried: storyboard not found: {sb_path}")
        return 1

    from pipeline_state import resolve_root, set_gate
    root = resolve_root(a.project_root)

    try:
        sb = json.load(open(sb_path, encoding="utf-8"))
    except Exception as e:
        print(f"[GATE FAIL] assets_inventoried: storyboard will not parse: {e}")
        return 1

    errors: list[str] = []
    inv = sb.get("asset_inventory")
    if inv is None:
        errors.append("NO-INVENTORY storyboard has no asset_inventory. Use [] to state plainly "
                      "that this deck supplies no assets")
        inv = []
    elif not isinstance(inv, list):
        errors.append("BAD-INVENTORY asset_inventory must be a list")
        inv = []

    resolved = waived = checked = in_deck = 0
    for i, slot in enumerate(inv):
        if not isinstance(slot, dict):
            errors.append(f"BAD-SLOT     asset_inventory[{i}] is not an object")
            continue
        label = slot.get("id") or slot.get("name") or f"asset_inventory[{i}]"
        status = (slot.get("status") or "").lower()
        if status == "resolved":
            resolved += 1
        else:
            reason = (slot.get("waiver") or slot.get("reason") or slot.get("note") or "").strip()
            if len(reason) >= 10:
                waived += 1
            else:
                errors.append(f"UNRESOLVED   {label}: status={status or 'missing'} with no "
                              f"waiver reason (>=10 chars) explaining the declared gap")
                continue
        rel = slot_file(slot)
        if status == "resolved":
            if rel:
                checked += 1
                check_file(rel, root, label, errors)
            elif slot.get("rendered_in_deck") is True:
                # artifact-led slots (CSS/SVG/HTML mock drawn in the deck itself) have no file to
                # open. They stay legal, but they must SAY so.
                in_deck += 1
            else:
                # Before this check a slot could claim resolved, name no file, and sail through:
                # the gate printed "0 files verified on disk" and still recorded a pass. That is
                # indistinguishable from a stand-in, which is the exact failure this gate exists
                # to stop.
                errors.append(f"NO-FILE      {label}: status=resolved but names no file. Point it "
                              f"at the asset with \"file\", or set \"rendered_in_deck\": true if "
                              f"the slot is drawn in the deck itself (CSS/SVG/mock).")

    # the customer logo: the specific failure this gate exists to stop
    brand_json = os.path.join(root, "assets", a.slug, "brand.json")
    if not os.path.isfile(brand_json):
        errors.append(f"NO-BRAND     assets/{a.slug}/brand.json missing — run brand_fetch.py "
                      f"before building, or the customer logo cannot be verified")
    else:
        try:
            brand = json.load(open(brand_json, encoding="utf-8"))
        except Exception as e:
            errors.append(f"BAD-BRAND    brand.json will not parse: {e}")
            brand = {}
        logo = brand.get("logo")
        if not logo:
            errors.append(f"NO-LOGO      assets/{a.slug}/brand.json has no resolved logo — a "
                          f"stand-in would ship as the customer's mark")
        else:
            check_file(os.path.join("assets", a.slug, logo), root, "customer logo", errors)

    if errors:
        print(f"[GATE FAIL] assets_inventoried: {a.slug}")
        for e in errors:
            print("   " + e)
        print("\n   Nothing recorded. Supply the assets and re-run; this gate cannot be set by hand.")
        return 1

    note = (f"{resolved} resolved, {waived} declared-waived, {checked} files verified on disk"
            + (f", {in_deck} rendered in-deck" if in_deck else ""))
    set_gate(root, a.slug, "assets_inventoried", "passed", note=note,
             attested_by="assets_attest.py")
    print(f"[GATE OK] assets_inventoried: {a.slug} — {note}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
