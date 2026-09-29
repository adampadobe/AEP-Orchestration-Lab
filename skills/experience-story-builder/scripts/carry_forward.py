#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Experience Design Chain — carry personalization forward across a version reinstall.

A reinstall overwrites ~/.claude/skills/… and would wipe the LEARNED library the agent built up:
banked personas (persona_mint / absorb) and the harvested component library (absorb). This script
re-layers that learned data on top of a fresh install.

RULE (from the 8 Jul 2026 call): the official update wins for skill LOGIC (SKILL.md, scripts,
templates — left untouched here); the user's learned DATA (personas + components) is preserved.

Usage (run AFTER installing the new version, pointing --old at a backup of the previous install):
    python carry_forward.py --old <prev-skills-or-VEB-dir> --new ~/.claude/skills [--dry-run]

What it carries (old → new), never overwriting an official base file:
  • vision-experience-builder/assets/personas/<folder>/   (persona folders absent from the new base)
  • vision-experience-builder/assets/personas/personas.json  (merged, union by "folder")
  • vision-experience-builder/components/**                (files absent from the new base)
  • vision-experience-builder/components/catalog.json      (merged, union by id/type/folder)
Customer work (project assets/<slug>, demos/<slug>) is NOT skill-resident and is unaffected by reinstalls.
"""
import argparse, json, os, shutil, sys

try: sys.stdout.reconfigure(encoding="utf-8")
except Exception: pass

VEB = "vision-experience-builder"
# top-level catalog lists → the field that identifies a unique entry
CATALOG_KEYS = {"animations": "id", "screens": "type", "structures": "id",
                "components": "id", "templates": "type", "personas": "folder"}


def resolve_veb(root):
    """Accept either a skills root, a bundle root, or the VEB dir itself."""
    root = os.path.abspath(root)
    if os.path.basename(root) == VEB:
        return root
    cand = os.path.join(root, VEB)
    return cand if os.path.isdir(cand) else root


def copy_missing(old_dir, new_dir, dry):
    """Copy files/dirs present in old_dir but absent in new_dir. Returns count copied."""
    n = 0
    if not os.path.isdir(old_dir):
        return 0
    os.makedirs(new_dir, exist_ok=True)
    for name in sorted(os.listdir(old_dir)):
        o, w = os.path.join(old_dir, name), os.path.join(new_dir, name)
        if os.path.isdir(o):
            if not os.path.exists(w):
                if not dry: shutil.copytree(o, w)
                print(f"  + dir  {os.path.relpath(w)}"); n += 1
            else:
                n += copy_missing(o, w, dry)   # recurse
        else:
            if not os.path.exists(w):
                if not dry: shutil.copyfile(o, w)
                print(f"  + file {os.path.relpath(w)}"); n += 1
    return n


def merge_list_index(old_path, new_path, key_field_map, dry, label):
    """Union JSON-of-lists indexes by a key field. New (official) entries win on conflict;
    old-only entries are appended (carried forward)."""
    if not os.path.isfile(old_path):
        return 0
    old = json.load(open(old_path, encoding="utf-8"))
    new = json.load(open(new_path, encoding="utf-8")) if os.path.isfile(new_path) else {}
    added = 0
    if isinstance(key_field_map, str):                       # single list under top-level "personas"
        key = key_field_map
        new_list = new.get("personas", []) if isinstance(new, dict) else []
        old_list = old.get("personas", []) if isinstance(old, dict) else []
        have = {e.get(key) for e in new_list}
        for e in old_list:
            if e.get(key) not in have:
                new_list.append(e); added += 1
        new = {"personas": new_list}
    else:                                                    # catalog: dict of lists
        for section, key in key_field_map.items():
            nl = new.get(section, []) if isinstance(new, dict) else []
            ol = old.get(section, []) if isinstance(old, dict) else []
            have = {e.get(key) for e in nl if isinstance(e, dict)}
            for e in ol:
                if isinstance(e, dict) and e.get(key) not in have:
                    nl.append(e); added += 1
            new.setdefault(section, nl) if isinstance(new, dict) else None
            if isinstance(new, dict): new[section] = nl
    if added and not dry:
        json.dump(new, open(new_path, "w", encoding="utf-8"), indent=2)
    print(f"  ~ {label}: +{added} carried-forward entr{'y' if added==1 else 'ies'}")
    return added


def main():
    ap = argparse.ArgumentParser(description="Carry learned personas + components across a reinstall.")
    ap.add_argument("--old", required=True, help="Previous install (skills root, bundle root, or VEB dir) / backup.")
    ap.add_argument("--new", default=os.path.join(os.path.expanduser("~"), ".claude", "skills"),
                    help="Fresh install root (default ~/.claude/skills).")
    ap.add_argument("--dry-run", action="store_true", help="Show what would change without writing.")
    a = ap.parse_args()

    old_veb, new_veb = resolve_veb(a.old), resolve_veb(a.new)
    if not os.path.isdir(old_veb):
        print(f"[fail] can't find {VEB} under --old ({a.old})"); sys.exit(1)
    if not os.path.isdir(new_veb):
        print(f"[fail] can't find {VEB} under --new ({a.new}) — install the new version first"); sys.exit(1)

    dry = a.dry_run
    print(f"\n=== carry_forward{' (dry run)' if dry else ''} ===\nold: {old_veb}\nnew: {new_veb}\n")

    print("Personas:")
    p_files = copy_missing(os.path.join(old_veb, "assets", "personas"),
                           os.path.join(new_veb, "assets", "personas"), dry)
    p_idx = merge_list_index(os.path.join(old_veb, "assets", "personas", "personas.json"),
                             os.path.join(new_veb, "assets", "personas", "personas.json"),
                             "folder", dry, "personas.json")

    print("\nComponents:")
    c_files = copy_missing(os.path.join(old_veb, "components"),
                           os.path.join(new_veb, "components"), dry)
    c_idx = merge_list_index(os.path.join(old_veb, "components", "catalog.json"),
                             os.path.join(new_veb, "components", "catalog.json"),
                             CATALOG_KEYS, dry, "catalog.json")

    print(f"\nCarried forward: {p_files} persona file(s)/folder(s) (+{p_idx} index), "
          f"{c_files} component file(s)/folder(s) (+{c_idx} catalog). "
          f"Official skill logic (SKILL.md / scripts / templates) left untouched — the update wins there.")
    if dry:
        print("Dry run — nothing written. Re-run without --dry-run to apply.")


if __name__ == "__main__":
    main()
