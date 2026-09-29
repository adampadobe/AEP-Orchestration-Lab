#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
lib_root.py — resolve the ACTIVE component-library root (learned-library persistence).

Problem this solves: plugin updates wipe the installed skill folder, so everything absorb
banked into the bundled components/ dies on every update. The durable home is
$CLAUDE_PLUGIN_DATA (survives updates) — ideally a clone of OneAdobe/experience-story-library,
whose layout mirrors the skill paths exactly.

Resolution order (first hit wins):
  1. $EXPERIENCE_STORY_LIBRARY        — explicit override: a components/ dir (dev checkouts)
  2. $CLAUDE_PLUGIN_DATA/vision-experience-builder/components
       lazy-seeded on first touch: if no catalog.json there, the bundled components tree
       (+ ../templates/harvested + ../assets/personas) is copied in once, so learning has
       a durable home even before the shared repo is cloned. A clone of
       experience-story-library into $CLAUDE_PLUGIN_DATA takes precedence naturally
       (same path, catalog already present -> no seed).
  3. the bundled components/ dir (dev checkout / no env)

Freshness: sync_shared_library() (called once per build from catalog_pick.py) keeps the
durable mirror current with OneAdobe/experience-story-library — the bundled tree is only
the offline seed, not what anyone should keep building from. It is throttled, offline-safe
and never blocks a build; see its docstring.

Usage:  python lib_root.py [--status]        (prints the active root + entry counts)
        python lib_root.py --sync            (force a shared-library sync now)
Import: from lib_root import resolve_components, sync_shared_library
"""
from __future__ import annotations
import json, os, shutil, subprocess, sys, tempfile, time

try: sys.stdout.reconfigure(encoding="utf-8")
except Exception: pass

_LIB_REPO = os.environ.get("EXPERIENCE_STORY_LIBRARY_REPO",
                           "https://github.com/OneAdobe/experience-story-library.git")
_SYNC_MARKER = ".library-sync"          # in $CLAUDE_PLUGIN_DATA: last synced commit sha
_SYNC_TTL_S = 6 * 3600                  # don't even ls-remote more than every 6h

# bundled components dir, relative to this script: ../../vision-experience-builder/components
_BUNDLED = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                         "..", "..", "vision-experience-builder", "components"))


def _data_home() -> str:
    """The durable library home. $CLAUDE_PLUGIN_DATA when the host sets it, else a default under
    ~/.claude. Claude Code does NOT currently export CLAUDE_PLUGIN_DATA, so keying off it alone
    meant every install silently ran on the bundled tree: absorb's work died on each plugin update
    and sync_shared_library() no-opped forever. Defaulting makes the durable path the normal case
    instead of something each user has to discover and configure."""
    return (os.environ.get("CLAUDE_PLUGIN_DATA")
            or os.path.expanduser(os.path.join("~", ".claude", "plugin-data",
                                               "experience-story-builder")))


def _has_catalog(comp: str) -> bool:
    return os.path.isfile(os.path.join(comp, "catalog.json"))


def _validate_catalog(comp: str) -> dict:
    path = os.path.join(comp, "catalog.json")
    try:
        cat = json.load(open(path, encoding="utf-8"))
    except Exception as e:
        raise RuntimeError(f"malformed component catalog {path}: {e}") from e
    if not isinstance(cat, dict):
        raise RuntimeError(f"malformed component catalog {path}: root must be an object")
    bad = [k for k, v in cat.items() if not isinstance(v, list)]
    if bad:
        raise RuntimeError(f"malformed component catalog {path}: sections must be lists: {', '.join(bad)}")
    return cat


def _seed(bundled_comp: str, target_comp: str) -> None:
    """One-time copy of the bundled library (components + templates + personas) into the
    durable mirror. Never overwrites an existing catalog."""
    skill_src = os.path.dirname(bundled_comp)                      # .../vision-experience-builder
    skill_dst = os.path.dirname(target_comp)
    shutil.copytree(bundled_comp, target_comp, dirs_exist_ok=True)
    for rel in (("templates", "harvested"), ("assets", "personas")):
        src = os.path.join(skill_src, *rel)
        if os.path.isdir(src):
            shutil.copytree(src, os.path.join(skill_dst, *rel), dirs_exist_ok=True)


def _usable_catalog(comp: str, label: str) -> bool:
    """True if comp has a well-formed catalog.json. If it is present but MALFORMED, warn and
    return False so resolution falls back to the next library source rather than crashing the
    build — the bundled fallback is an intentional robustness feature, not to be defeated by a
    corrupt shared clone. (A missing catalog just returns False with no warning.)"""
    if not _has_catalog(comp):
        return False
    try:
        _validate_catalog(comp)
        return True
    except RuntimeError as e:
        print(f"[lib_root] {label} catalog unusable: {e} — falling back", file=sys.stderr)
        return False


def _catalog_union(incoming: str, existing: str) -> None:
    """Overlay-merge catalogs: incoming (shared repo) wins per entry, but LOCAL-ONLY entries
    (things absorb banked here that aren't shared yet) are kept, appended after the shared
    ones. Written back to `existing`. Key per section matches absorb's identity rules."""
    key = {"screens": "type", "templates": "type", "personas": "name"}
    inc = json.load(open(incoming, encoding="utf-8"))
    old = json.load(open(existing, encoding="utf-8"))
    for sec, arr in old.items():
        if not isinstance(arr, list):
            continue
        k = key.get(sec, "id")
        have = {e.get(k) for e in inc.get(sec, []) if isinstance(e, dict)}
        extras = [e for e in arr if isinstance(e, dict) and e.get(k) not in have]
        inc.setdefault(sec, []).extend(extras)
    json.dump(inc, open(existing, "w", encoding="utf-8"), indent=2)


def sync_shared_library(force: bool = False) -> bool:
    """Refresh the durable mirror ($CLAUDE_PLUGIN_DATA) from the shared library repo.

    Cheap and unobtrusive by design:
      - no-op unless $CLAUDE_PLUGIN_DATA is set and no dev override is active
      - throttled: skips even the remote check if the last sync was < 6h ago (force=True
        or `--sync` bypasses)
      - `git ls-remote` first (one round-trip); clone only when the tip actually moved
      - shallow-clones to a temp dir and copies the tree over the mirror, so the mirror
        never becomes a git checkout and half-finished network failures can't corrupt it
      - catalogs are union-merged: shared entries win, local absorb-only entries survive
      - any failure (offline, no git, no VPN, no auth) warns on stderr and returns False —
        the build carries on with whatever the mirror already has
    Returns True only when the mirror was actually updated."""
    if os.environ.get("EXPERIENCE_STORY_LIBRARY_SYNC", "").lower() in ("0", "off", "no"):
        return False
    if os.environ.get("EXPERIENCE_STORY_LIBRARY"):
        return False                     # dev checkout: the human manages freshness
    data = _data_home()
    os.makedirs(data, exist_ok=True)
    marker = os.path.join(data, _SYNC_MARKER)
    if not force and os.path.isfile(marker) and time.time() - os.path.getmtime(marker) < _SYNC_TTL_S:
        return False
    try:
        out = subprocess.run(["git", "ls-remote", _LIB_REPO, "HEAD"],
                             capture_output=True, text=True, timeout=15)
        if out.returncode != 0:
            raise RuntimeError((out.stderr or "").strip().splitlines()[-1] if out.stderr else "ls-remote failed")
        tip = out.stdout.split()[0]
    except Exception as e:
        print(f"[lib_root] library sync skipped (offline / no access): {e}", file=sys.stderr)
        return False
    last = open(marker, encoding="utf-8").read().strip() if os.path.isfile(marker) else ""
    if tip == last:
        os.utime(marker, None)           # refresh the throttle window
        return False
    tmp = tempfile.mkdtemp(prefix="esl-sync-")
    try:
        got = subprocess.run(["git", "clone", "--depth", "1", "--quiet", _LIB_REPO, tmp],
                             capture_output=True, text=True, timeout=120)
        if got.returncode != 0:
            raise RuntimeError((got.stderr or "clone failed").strip().splitlines()[-1])
        src = os.path.join(tmp, "vision-experience-builder")
        dst = os.path.join(data, "vision-experience-builder")
        if not os.path.isdir(src):
            raise RuntimeError("clone has no vision-experience-builder/ tree")
        old_cat = os.path.join(dst, "components", "catalog.json")
        keep = old_cat if os.path.isfile(old_cat) else None
        kept = None
        if keep:
            kept = keep + ".pre-sync"
            shutil.copy2(keep, kept)
        shutil.copytree(src, dst, dirs_exist_ok=True)
        if kept:
            # the overlay put the incoming shared catalog at old_cat; merge the saved local
            # one into it (shared wins, absorb-only extras survive), result lands in `kept`,
            # then promote that merged file back to catalog.json
            _catalog_union(old_cat, kept)
            shutil.move(kept, old_cat)
        open(marker, "w", encoding="utf-8").write(tip)
        print(f"[lib_root] shared library synced to {tip[:12]}", file=sys.stderr)
        return True
    except Exception as e:
        print(f"[lib_root] library sync failed ({e}) — building with the current mirror", file=sys.stderr)
        return False
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def resolve_components(bundled: str | None = None) -> str:
    bundled = bundled or _BUNDLED
    override = os.environ.get("EXPERIENCE_STORY_LIBRARY")
    if override:
        if _usable_catalog(override, "override"):
            return os.path.abspath(override)
        if _has_catalog(override):
            # An explicit user-configured override that is present-but-corrupt is a real config
            # error — don't ignore it silently on stderr. Still fall back (a corrupt shared clone
            # shouldn't hard-crash every build), but say so loudly on stdout.
            print(f"[lib_root] WARNING: EXPERIENCE_STORY_LIBRARY override ({override}) has a "
                  f"malformed catalog.json and is being IGNORED — falling back to the bundled "
                  f"library. Fix or unset it, or your team's banked components won't be used.")
        else:
            print(f"[lib_root] override has no catalog.json: {override} — falling back", file=sys.stderr)
    data = _data_home()
    if data:
        comp = os.path.join(data, "vision-experience-builder", "components")
        if not _has_catalog(comp) and _has_catalog(bundled):
            try:
                _seed(bundled, comp)
                print(f"[lib_root] seeded learned library into {comp} (survives plugin updates)",
                      file=sys.stderr)
            except OSError as e:
                print(f"[lib_root] seed failed ({e}) — using bundled library", file=sys.stderr)
                # a corrupt bundled catalog must still surface via the shared last-resort check
                if _has_catalog(bundled):
                    _validate_catalog(bundled)
                return bundled
        if _usable_catalog(comp, "plugin-data"):
            return comp
    # Last resort: nothing left to fall back to, so a malformed bundled catalog is a real,
    # surfaced breakage rather than something to silently paper over.
    if _has_catalog(bundled):
        _validate_catalog(bundled)
    return bundled


def main() -> int:
    if "--sync" in sys.argv:
        sync_shared_library(force=True)
    comp = os.path.abspath(resolve_components())
    which = ("override ($EXPERIENCE_STORY_LIBRARY)" if os.environ.get("EXPERIENCE_STORY_LIBRARY")
             and comp == os.path.abspath(os.environ["EXPERIENCE_STORY_LIBRARY"])
             else "plugin-data (durable)" if comp.startswith(os.path.abspath(_data_home()))
             else "bundled (dies on plugin update — the durable home could not be written)")
    print(f"active library : {comp}")
    print(f"resolved via   : {which}")
    if _has_catalog(comp):
        cat = _validate_catalog(comp)
        counts = {k: len(v) for k, v in cat.items() if isinstance(v, list)}
        print(f"catalog        : {counts}")
    else:
        print("catalog        : MISSING")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
