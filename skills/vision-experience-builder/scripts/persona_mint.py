#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
vision-experience-builder — mint & bank a persona into the shared library.

Closes the loop the old fallback left open: when a build GENERATES a persona
(Firefly) and CUTS IT OUT (Adobe Express `image_remove_background`), this script
banks the result so the NEXT build can find it — folder + meta.json AND a
registered entry in personas.json (Persona Resolution matches on personas.json
`tags`, so an unregistered persona is invisible no matter how good the files).

    python persona_mint.py --name "Priya" --role "Progressive-lens shopper" \
        --tags female,30s,south-asian,eyewear,retail,customer,b2c,journey \
        --pose /path/cutout-1.png --pose /path/cutout-2.png \
        --avatar /path/avatar.png --source firefly-warby-parker

The images passed to --pose / --avatar are ALREADY the finished cutouts the
agent downloaded (Firefly S3 -> curl -> Express remove-bg -> local file). This
script only files + indexes them; it does not call any MCP tool itself.

Idempotent: re-running with the same archetype/folder replaces that entry
(files re-copied, personas.json entry rewritten), never duplicates.
"""
import argparse, json, os, re, shutil, sys

try: sys.stdout.reconfigure(encoding="utf-8")
except Exception: pass

# Scene templates the builder maps to (see SKILL.md Persona Resolution Step 2).
# Poses that read as "looking down at a device" suit these:
DEVICE_SCENES = ["chat-notification", "journey-canvas"]
# Everything else defaults to the primary (calm, camera-facing) pose.
HERO_SCENES = ["persona-hero-splash", "cobrand-hero-persona", "section-title",
               "section-title-gradient", "ai-response-with-chart", "brand-sting"]


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.strip().lower()).strip("-")


def default_personas_dir():
    # Persist minted personas in the plugin DATA dir (survives updates); else the bundled seed.
    data = os.environ.get("CLAUDE_PLUGIN_DATA")
    if data:
        return os.path.join(data, "vision-experience-builder", "assets", "personas")
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.normpath(os.path.join(here, "..", "assets", "personas"))


def main():
    ap = argparse.ArgumentParser(description="Bank a generated/cutout persona into the library.")
    ap.add_argument("--name", required=True, help="Persona display name, e.g. 'Priya'")
    ap.add_argument("--role", required=True, help="Persona role, e.g. 'Progressive-lens shopper'")
    ap.add_argument("--tags", required=True,
                    help="Comma-separated match tags (role/gender/age/industry/story-type). "
                         "These are what Persona Resolution matches on — be generous.")
    ap.add_argument("--pose", action="append", default=[], required=True,
                    help="Path to a finished cutout image. Repeat for multiple poses "
                         "(first = primary/default).")
    ap.add_argument("--avatar", default=None, help="Path to a head-and-shoulders avatar crop (optional).")
    ap.add_argument("--source", required=True, help="Provenance tag, e.g. 'firefly-warby-parker'.")
    ap.add_argument("--archetype", default=None, help="Archetype key (default: slug of --name).")
    ap.add_argument("--bg", default="transparent",
                    choices=["transparent", "studio", "outdoor", "solid"],
                    help="Background state of the supplied images (default transparent = a clean cutout).")
    ap.add_argument("--personas-dir", default=None,
                    help="Persona library dir (default: the skill's assets/personas).")
    a = ap.parse_args()

    personas_dir = a.personas_dir or default_personas_dir()
    archetype = a.archetype or slug(a.name)
    folder = a.source if a.source.startswith(("firefly-", "harvested-", "stock-")) else f"firefly-{slug(a.source)}"
    outdir = os.path.join(personas_dir, folder)
    os.makedirs(outdir, exist_ok=True)

    tags = [t.strip().lower() for t in a.tags.split(",") if t.strip()]

    # --- copy poses -> pose-1.ext, pose-2.ext ... (primary first) ---
    for p in a.pose:
        if not os.path.isfile(p):
            print(f"[fail] pose file not found: {p}"); sys.exit(1)
    if a.avatar and not os.path.isfile(a.avatar):
        print(f"[fail] avatar file not found: {a.avatar}"); sys.exit(1)

    ext = os.path.splitext(a.pose[0])[1].lower() or ".png"
    fmt = ext.lstrip(".")
    poses = []
    for i, p in enumerate(a.pose, start=1):
        e = os.path.splitext(p)[1].lower() or ".png"
        fn = f"pose-{i}{e}"
        shutil.copyfile(p, os.path.join(outdir, fn))
        poses.append({"file": fn, "role": "portrait", "primary": (i == 1)})
    default_pose = poses[0]["file"]

    avatar = None
    if a.avatar:
        ae = os.path.splitext(a.avatar)[1].lower() or ".png"
        avatar = f"avatar{ae}"
        shutil.copyfile(a.avatar, os.path.join(outdir, avatar))

    # --- scene_defaults: map templates to whatever poses exist ---
    scene_defaults = {s: default_pose for s in HERO_SCENES}
    device_pose = poses[1]["file"] if len(poses) > 1 else default_pose
    for s in DEVICE_SCENES:
        scene_defaults[s] = device_pose

    meta = {
        "archetype": archetype,
        "folder": folder,
        "tags": tags,
        "default_name": a.name,
        "default_role": a.role,
        "images": poses,
        "default_pose": default_pose,
        "avatar": avatar,
        "format": fmt,
        "bg": a.bg,
        "needs_cutout": a.bg != "transparent",
        "source": a.source,
        "pose_count": len(poses),
        "scene_defaults": scene_defaults,
    }
    with open(os.path.join(outdir, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)

    # --- register in personas.json (replace-by-folder, idempotent) ---
    index_path = os.path.join(personas_dir, "personas.json")
    index = {"personas": []}
    if os.path.isfile(index_path):
        try:
            index = json.load(open(index_path, encoding="utf-8"))
        except Exception:
            pass
    index.setdefault("personas", [])
    index["personas"] = [p for p in index["personas"] if p.get("folder") != folder]
    index["personas"].append({
        "archetype": archetype,
        "folder": folder,
        "tags": tags,
        "default_name": a.name,
        "default_role": a.role,
        "pose_count": len(poses),
        "default_pose": default_pose,
        "avatar": avatar,
        "format": fmt,
        "bg": a.bg,
        "source": a.source,
    })
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(index, f, indent=2)

    print(f"\n=== persona banked · {a.name} ({archetype}) ===")
    print(f"folder      : assets/personas/{folder}/")
    print(f"poses       : {', '.join(p['file'] for p in poses)}"
          + (f"  · avatar: {avatar}" if avatar else ""))
    print(f"tags        : {', '.join(tags)}")
    print(f"bg          : {a.bg}" + ("  ⚠ not a cutout — run image_remove_background before shipping" if meta["needs_cutout"] else ""))
    print(f"registered  : personas.json ({len(index['personas'])} personas total)")
    print(f"\nUse in deck (adjust relative path to the output HTML):")
    print(f'  <img src="../assets/personas/{folder}/{default_pose}" alt="{a.name}" class="persona-img">')


if __name__ == "__main__":
    main()
