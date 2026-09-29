#!/usr/bin/env python3
"""
adobe-brand-fetcher / scripts / install.py

Install bundled official Adobe brand assets into a project's
assets/adobe/ folder. Replaces the older download-from-URL approach
with a deterministic copy-from-bundle approach.

USAGE
    python install.py
    python install.py --refresh
    python install.py --only wordmark-white
    python install.py --list
    python install.py --project-root /path/to/project

OUTPUT
    <project>/assets/adobe/
        wordmark-red.svg     wordmark-red.png
        wordmark-white.svg
        wordmark-black.svg
        symbol-red.svg       symbol-red.png
        symbol-white.svg     symbol-white.png
        symbol-black.svg
        _README.md
        _manifest-snapshot.json
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
import time
from pathlib import Path

SKILL_DIR = Path(__file__).resolve().parent.parent
BUNDLED_ASSETS_DIR = SKILL_DIR / "assets"
FONTS_DIR = BUNDLED_ASSETS_DIR / "fonts"
MANIFEST_PATH = SKILL_DIR / "manifest.json"

# Source Sans 3 (SIL OFL 1.1) — the ship-safe, embeddable Adobe Clean stand-in.
FONT_WEIGHTS = (300, 400, 600, 700)


def load_manifest() -> dict:
    if not MANIFEST_PATH.exists():
        sys.exit(f"manifest.json not found at {MANIFEST_PATH}")
    return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))


def resolve_project_root(cli_arg: str | None) -> Path:
    if cli_arg:
        root = Path(cli_arg).resolve()
        if not root.exists():
            sys.exit(f"--project-root path does not exist: {root}")
        return root

    cwd = Path.cwd().resolve()
    for candidate in [cwd, *cwd.parents]:
        if (candidate / ".claude").is_dir():
            return candidate

    print(
        f"[warn] No .claude folder found walking up from {cwd}. Using CWD.",
        file=sys.stderr,
    )
    return cwd


def collect_files_to_install(manifest: dict, only: list[str] | None) -> list[tuple[str, str]]:
    """Returns list of (asset_key, filename) tuples to install."""
    results: list[tuple[str, str]] = []
    logos = manifest.get("logos", {})

    for key, spec in logos.items():
        if only and key not in only:
            continue
        # Primary file
        results.append((key, spec["filename"]))
        # Alternate format (PNG fallbacks)
        if "alternate_format" in spec:
            alt_filename = spec["alternate_format"]
            results.append((f"{key}-alt", alt_filename))

    # Also surface any PNGs that exist alongside but aren't first-class entries
    # (wordmark-red.png is paired with wordmark-red.svg)
    bundled_files = {p.name for p in BUNDLED_ASSETS_DIR.iterdir() if p.is_file()}
    already_planned = {filename for _, filename in results}
    for filename in bundled_files:
        if filename not in already_planned:
            if not only:  # only install extras when no filter is set
                results.append((f"extra-{filename}", filename))

    return results


def install_file(src: Path, dest: Path, refresh: bool) -> str:
    """Returns one of: 'installed', 'skipped-exists', 'failed-missing-source'."""
    if not src.exists():
        return "failed-missing-source"
    if dest.exists() and not refresh:
        return "skipped-exists"
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dest)
    return "installed"


def write_readme(adobe_dir: Path, installed: list[str], skipped: list[str], failed: list[str]) -> None:
    lines = [
        "# Adobe brand assets (auto-managed by adobe-brand-fetcher)",
        "",
        f"Installed: {time.strftime('%Y-%m-%d %H:%M:%S')}",
        "Source: bundled with the `adobe-brand-fetcher` skill (Marketing Hub originals supplied by Adobe employee)",
        "",
        "## Files",
        "",
    ]
    for name in sorted(installed):
        lines.append(f"- `{name}` (newly installed)")
    for name in sorted(skipped):
        lines.append(f"- `{name}` (already present, kept)")
    if failed:
        lines += ["", "## Failed (missing source)", ""]
        for name in sorted(failed):
            lines.append(f"- `{name}`")

    lines += [
        "",
        "## Adobe trademark rules (non-negotiable)",
        "",
        "- Never modify, recolour outside approved variants, distort, or animate the corporate mark",
        "- Maintain clear space equal to the mark's height on all four sides",
        "- For co-brand lockups (Adobe × Customer): equal visual weight, joined by a thin × symbol",
        "- WORDMARK only: use white on color/dark backgrounds; red on white; black on light photography",
        "- ICON (adobe-icon.svg / symbol-red|white|black.svg — all identical): the modern mark is a",
        "  self-contained red-tile app icon. Use it as-is on ANY background; never recolour the tile.",
        "  symbol-red/white/black are same-content aliases kept for legacy {{adobe_symbol_path}} refs,",
        "  not three different colourways. Never fall back to a bare/untiled glyph with no red square.",
        "- Reference: https://www.adobe.com/legal/permissions/trademarks.html",
        "",
        "## Fonts (ship-safe, offline)",
        "",
        "Distributed/offline decks EMBED Source Sans 3 (SIL OFL) — installed here as",
        "`fonts/*.woff2` + a base64 `fonts.css`. The builder inlines `fonts.css` into the deck",
        "<style> so it's a true self-contained offline file.",
        "",
        "- Stack: `font-family:'Adobe Clean','Source Sans 3','Inter',system-ui,sans-serif;`",
        "  Adobe Clean resolves for internal viewers who have it installed; Source Sans 3 is",
        "  what actually ships to everyone else.",
        "- NEVER ship Adobe Clean font files or a Typekit CDN kit in a distributed deck (Adobe's",
        "  license forbids it; a CDN link also breaks offline). Adobe Clean is fine internally and",
        "  in the rasterized PDF export. A Typekit <link> is for online-guaranteed internal preview",
        "  only. Full rules: vision-experience-builder/asset-licensing.md.",
        "",
        "## Refreshing",
        "",
        "```bash",
        "python ${CLAUDE_PLUGIN_ROOT}/skills/adobe-brand-fetcher/scripts/install.py --refresh",
        "```",
    ]
    (adobe_dir / "_README.md").write_text("\n".join(lines), encoding="utf-8")


def install_fonts(adobe_dir: Path, refresh: bool) -> list[str]:
    """Install Source Sans 3 (SIL OFL 1.1) and generate a base64-embedded `fonts.css`.

    Source Sans 3 is the ship-safe Adobe Clean stand-in: Adobe Clean font files CANNOT be
    redistributed/self-hosted, and a Typekit CDN link breaks the offline guarantee. The builder
    inlines `fonts.css` into the deck <style> so the deck is a true self-contained offline file.
    See vision-experience-builder/asset-licensing.md.
    """
    import base64
    out: list[str] = []
    if not FONTS_DIR.is_dir():
        print("[warn] no bundled fonts dir — skipping Source Sans 3 install", file=sys.stderr)
        return out
    fonts_dest = adobe_dir / "fonts"
    fonts_dest.mkdir(parents=True, exist_ok=True)
    faces: list[str] = []
    for w in FONT_WEIGHTS:
        src = FONTS_DIR / f"source-sans-3-{w}.woff2"
        if not src.exists():
            continue
        shutil.copy2(src, fonts_dest / src.name)
        out.append(f"fonts/{src.name}")
        b64 = base64.b64encode(src.read_bytes()).decode("ascii")
        faces.append(
            "@font-face{font-family:'Source Sans 3';font-style:normal;"
            f"font-weight:{w};font-display:swap;"
            f"src:url(data:font/woff2;base64,{b64}) format('woff2');}}"
        )
    lic = FONTS_DIR / "LICENSE-source-sans-OFL.md"
    if lic.exists():
        shutil.copy2(lic, fonts_dest / lic.name)
        out.append(f"fonts/{lic.name}")
    css_path = adobe_dir / "fonts.css"
    if faces and (refresh or not css_path.exists()):
        header = (
            "/* Source Sans 3 (SIL OFL 1.1) — embedded, ship-safe Adobe Clean stand-in for\n"
            "   offline / externally-distributed decks. INLINE this file's contents into the deck\n"
            "   <style>. NEVER ship Adobe Clean font files or a Typekit kit (asset-licensing.md).\n"
            "   Stack: font-family:'Adobe Clean','Source Sans 3','Inter',system-ui,sans-serif; */\n"
        )
        css_path.write_text(header + "\n".join(faces) + "\n", encoding="utf-8")
        out.append("fonts.css")
    elif faces:
        print("[skipped]   fonts.css (exists; use --refresh to regenerate)")
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description="Install Adobe brand assets into a project")
    ap.add_argument("--project-root", help="Path to project root (auto-detected if omitted)")
    ap.add_argument("--refresh", action="store_true", help="Overwrite existing files")
    ap.add_argument("--only", action="append", help="Install only the named asset(s); can repeat")
    ap.add_argument("--list", action="store_true", help="List manifest contents and exit")
    args = ap.parse_args()

    manifest = load_manifest()

    if args.list:
        print(f"Manifest at {MANIFEST_PATH}")
        print(f"Last reviewed: {manifest['_meta']['last_reviewed']}")
        print(f"Version: {manifest['_meta']['version']}")
        print("\nBundled assets:")
        for name, spec in manifest["logos"].items():
            print(f"  {name:20} ← {spec['filename']}")
            print(f"  {'':20}   {spec.get('use_when', spec.get('description', '—'))}")
        return 0

    project_root = resolve_project_root(args.project_root)
    adobe_dir = project_root / "assets" / "adobe"
    adobe_dir.mkdir(parents=True, exist_ok=True)

    print(f"Project root: {project_root}")
    print(f"Source:       {BUNDLED_ASSETS_DIR}")
    print(f"Destination:  {adobe_dir}\n")

    plan = collect_files_to_install(manifest, args.only)

    fonts_requested = (not args.only) or ("fonts" in args.only)
    if not plan and not fonts_requested:
        print("[warn] Nothing to install (check --only spelling)")
        return 1

    installed: list[str] = []
    skipped: list[str] = []
    failed: list[str] = []

    for key, filename in plan:
        src = BUNDLED_ASSETS_DIR / filename
        dest = adobe_dir / filename
        status = install_file(src, dest, args.refresh)
        if status == "installed":
            installed.append(filename)
            print(f"[installed] {filename}")
        elif status == "skipped-exists":
            skipped.append(filename)
            print(f"[skipped]   {filename} (already exists; use --refresh to overwrite)")
        elif status == "failed-missing-source":
            failed.append(filename)
            print(f"[FAILED]    {filename} (source not in skill bundle)", file=sys.stderr)

    # Fonts: install Source Sans 3 + embedded fonts.css unless a --only filter excludes them.
    if not args.only or "fonts" in args.only:
        for f in install_fonts(adobe_dir, args.refresh):
            print(f"[installed] {f}")
            installed.append(f)

    write_readme(adobe_dir, installed, skipped, failed)

    snapshot = {
        "installed_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "manifest_version": manifest["_meta"]["version"],
        "manifest_reviewed": manifest["_meta"]["last_reviewed"],
        "files_installed": installed,
        "files_skipped": skipped,
        "files_failed": failed,
    }
    (adobe_dir / "_manifest-snapshot.json").write_text(
        json.dumps(snapshot, indent=2), encoding="utf-8"
    )

    print(f"\nDone. {len(installed)} installed, {len(skipped)} skipped, {len(failed)} failed.")
    if failed:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
