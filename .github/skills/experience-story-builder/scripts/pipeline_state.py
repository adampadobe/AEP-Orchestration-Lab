#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
pipeline_state.py — machine-readable GATE MANIFEST for the experience-story-builder pipeline.

Turns the prose "run preflight / brand / asset-inventory before building" into a CODE gate the
build stage cannot narrate past. Each stage records its result here; the build stage calls
`--require ...` and HARD-STOPS (exit 1) if any prerequisite gate hasn't passed. This is the
deterministic backstop behind the prose STOP guard — the Premier-League regression (build ran
before preflight/brand/assets) is what it prevents.

State file:  <project-root>/.experience-pipeline-state.json
Shape:       { "slugs": { "<slug>": { "<gate>": {"status": "...", "at": "...", "note": "..."} } } }

Canonical gates (build requires the first SIX; review requires built+render_qa+voice_lint+layout_qa):
  preflight · connectors_confirmed · storyboard_validated · brand_resolved · assets_inventoried ·
  library_retrieved · built · render_qa · voice_lint · layout_qa · reviewed · absorbed

CLI:
  set:      python pipeline_state.py <slug> --set storyboard_validated=passed [--note "..."]
  require:  python pipeline_state.py <slug> --require preflight,connectors_confirmed,storyboard_validated,brand_resolved,assets_inventoried,library_retrieved
  show:     python pipeline_state.py <slug> --show
  reset:    python pipeline_state.py <slug> --reset
  (--project-root optional; auto-detects the .claude root upward, else CWD.)

Exit 0 = ok / all required gates satisfied.  Exit 1 = a required gate is unmet (STOP) or bad args.
Importable too: `from pipeline_state import set_gate, require, load`.
"""
from __future__ import annotations
import argparse, contextlib, datetime, hashlib, json, os, re, sys, tempfile, time
from html.parser import HTMLParser

try: sys.stdout.reconfigure(encoding="utf-8")
except Exception: pass

STATE_FILENAME = ".experience-pipeline-state.json"
CANONICAL_GATES = ("preflight", "connectors_confirmed", "storyboard_validated", "brand_resolved",
                   "assets_inventoried", "library_retrieved", "built", "render_qa", "voice_lint",
                   "layout_qa", "reviewed", "absorbed")
BUILD_REQUIRES = ("preflight", "connectors_confirmed", "storyboard_validated",
                  "brand_resolved", "assets_inventoried", "library_retrieved")
# gates that must be green before a deck may be marked reviewed (post-build QA —
# the Monzo regression shipped because nothing checked the OUTPUT deterministically;
# layout_qa added after a laptop mock overlapped the headline with dead space beside it)
REVIEW_REQUIRES = ("built", "render_qa", "voice_lint", "layout_qa")
SHIP_REQUIRES = REVIEW_REQUIRES + ("reviewed",)
SCRIPT_ATTESTATIONS = {
    "render_qa": "render_qa.py",
    "voice_lint": "voice_lint.py",
    "layout_qa": "layout_qa.py",
    # promoted from hand-set: both were self-declared, so "built" could be claimed for a deck
    # that half-failed and "assets_inventoried" for an inventory nobody opened.
    "built": "built_attest.py",
    "assets_inventoried": "assets_attest.py",
}
# Gates whose recorded deck_sha must still match the deck as it is NOW. Only the post-build QA
# gates qualify: `built` is a milestone recorded BEFORE QA, so its snapshot legitimately differs
# from the final artifact and must not be read as "edited after QA passed".
SHA_BOUND_GATES = ("render_qa", "voice_lint", "layout_qa")
# any of these statuses means the gate is satisfied
_SATISFIED = {"passed", "pass", "true", "yes", "ok", "resolved", "done", "1"}


def resolve_root(cli_root: str | None) -> str:
    if cli_root:
        return os.path.abspath(cli_root)
    cwd = os.path.abspath(os.getcwd())
    cur = cwd
    while True:
        if os.path.isdir(os.path.join(cur, ".claude")):
            return cur
        parent = os.path.dirname(cur)
        if parent == cur:
            return cwd
        cur = parent


def state_path(root: str) -> str:
    return os.path.join(root, STATE_FILENAME)


def load(root: str) -> dict:
    p = state_path(root)
    if os.path.isfile(p):
        try:
            d = json.load(open(p, encoding="utf-8"))
            if isinstance(d, dict):
                d.setdefault("slugs", {})
                return d
        except Exception as e:
            raise RuntimeError(f"pipeline state is unreadable/corrupt: {p}: {e}") from e
    return {"slugs": {}}


def save(root: str, data: dict) -> None:
    """Atomically replace the state file so an interrupted writer cannot truncate it."""
    os.makedirs(root, exist_ok=True)
    target = state_path(root)
    fd, tmp = tempfile.mkstemp(prefix=STATE_FILENAME + ".", suffix=".tmp", dir=root)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
            json.dump(data, f, indent=2)
            f.write("\n")
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, target)
    finally:
        try:
            if os.path.exists(tmp):
                os.unlink(tmp)
        except OSError:
            pass


@contextlib.contextmanager
def state_lock(root: str, timeout: float = 10.0):
    """Small cross-platform lock for read-modify-write state operations."""
    os.makedirs(root, exist_ok=True)
    lock = state_path(root) + ".lock"
    deadline = time.monotonic() + timeout
    fd = None
    while fd is None:
        try:
            fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.write(fd, f"pid={os.getpid()} at={time.time()}\n".encode("ascii"))
        except FileExistsError:
            try:
                # Recover a lock abandoned by a killed process, but never steal a live/young lock.
                if time.time() - os.path.getmtime(lock) > 120:
                    os.unlink(lock)
                    continue
            except OSError:
                continue
            if time.monotonic() >= deadline:
                raise RuntimeError(f"timed out waiting for pipeline state lock: {lock}")
            time.sleep(0.05)
    try:
        yield
    finally:
        try:
            if fd is not None:
                os.close(fd)
            os.unlink(lock)
        except OSError:
            pass


_HASH_EXCLUDE = {".DS_Store", "Thumbs.db"}


def _hash_file(h, path: str, label: str) -> None:
    h.update(label.replace("\\", "/").encode("utf-8", "surrogatepass"))
    h.update(b"\0")
    with open(path, "rb") as f:
        while True:
            chunk = f.read(1024 * 1024)
            if not chunk:
                break
            h.update(chunk)
    h.update(b"\0")


def _iter_tree(path: str):
    if not os.path.isdir(path):
        return
    for cur, dirs, files in os.walk(path):
        dirs[:] = sorted(d for d in dirs if d != "__pycache__")
        for name in sorted(files):
            # *.rendered.html / *.tmp are absorb's derived dumps — excluded from the DIRECTORY
            # walk so they don't trip staleness. A deck that actually REFERENCES such a file is
            # still covered via _referenced_files() below, so this is not a hole.
            if name in _HASH_EXCLUDE or name.endswith((".rendered.html", ".tmp")):
                continue
            p = os.path.join(cur, name)
            if os.path.isfile(p):
                yield p


_CSS_URL_RE = re.compile(r"url\(\s*['\"]?([^'\")]+)['\"]?\s*\)", re.I)


def _css_urls(css: str) -> list[str]:
    return [m.group(1).strip() for m in _CSS_URL_RE.finditer(re.sub(r"/\*.*?\*/", " ", css, flags=re.S))]


class _RefParser(HTMLParser):
    """Extract the resources a deck actually LOADS.

    Attribute-accurate on purpose, mirroring render_qa's own resource scan so the bytes this hash
    binds are exactly the bytes render_qa verified. A regex over the raw text got this wrong in both
    directions: it MISSED srcset (a swapped responsive persona photo went undetected — a silent
    hole) and it MATCHED look-alike text such as metadata="x.png", a JS literal, or markup shown in
    a <code> block (folding unrelated files into the hash — false staleness).
    """
    RESOURCE_ATTRS = {
        "img": ("src", "srcset"), "script": ("src",), "link": ("href",),
        "source": ("src", "srcset"), "video": ("src", "poster"), "audio": ("src",),
        "iframe": ("src",), "embed": ("src",), "object": ("data",), "input": ("src",),
        "image": ("href", "xlink:href"), "use": ("href", "xlink:href"),
    }

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.refs: list[str] = []
        self._in_style = False

    def handle_starttag(self, tag, attrs):
        tag = tag.lower(); d = dict(attrs)
        if tag == "style":
            self._in_style = True
        for attr in self.RESOURCE_ATTRS.get(tag, ()):
            v = d.get(attr)
            if not v:
                continue
            if attr == "srcset":          # "a.png 1x, b.png 2x" -> every candidate
                self.refs.extend(p.strip().split()[0] for p in v.split(",") if p.strip())
            else:
                self.refs.append(v)
        if d.get("style"):
            self.refs.extend(_css_urls(d["style"]))

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag):
        if tag.lower() == "style":
            self._in_style = False

    def handle_data(self, data):
        if self._in_style:               # <style> bodies load subresources; <script> bodies do not
            self.refs.extend(_css_urls(data))


def _referenced_files(deck_path: str, root: str) -> list[str]:
    """Absolute paths of the LOCAL files a deck references, resolved under the project root.

    Makes the artifact hash cover exactly what the deck depends on — persona/shared imagery, fonts,
    fragments — wherever under root they live. Closes the hole where a swap or delete of an asset
    OUTSIDE assets/adobe + assets/<slug> (e.g. the house-style assets/personas/...) went undetected
    because the tree walk never visited it.
    """
    try:
        raw = open(deck_path, encoding="utf-8", errors="replace").read()
    except OSError:
        return []
    p = _RefParser()
    try:
        p.feed(raw)
    except Exception:
        return []
    deck_dir = os.path.dirname(os.path.abspath(deck_path))
    root_abs = os.path.abspath(root)
    out = set()
    for ref in p.refs:
        ref = (ref or "").strip()
        low = ref.lower()
        if not ref or low.startswith(("http:", "https:", "//", "data:", "#", "mailto:",
                                      "tel:", "javascript:", "blob:")):
            continue
        ref = ref.split("?")[0].split("#")[0]
        if not ref:
            continue
        target = os.path.abspath(os.path.join(deck_dir, ref))
        try:
            if os.path.commonpath([root_abs, target]) != root_abs:
                continue          # escapes the project root — render_qa rejects it separately
        except ValueError:
            continue              # different drive (Windows)
        if os.path.isfile(target):
            out.add(target)
    return sorted(out)


def deck_sha(path: str, project_root: str | None = None, slug: str | None = None) -> str | None:
    """Hash the shippable artifact, not just index.html.

    Covers: the deck directory, the Adobe + customer asset trees, the storyboard, AND every local
    file the deck actually references (so a swap/delete of any dependency — even one outside the
    known asset trees — flips the hash and trips staleness). Deterministic: files are de-duplicated
    by absolute path and hashed in sorted order with a stable label.
    """
    deck = os.path.abspath(path)
    if not os.path.isfile(deck):
        return None
    files: dict[str, str] = {}   # abspath -> stable label (first label wins on dupes)
    deck_dir = os.path.dirname(deck)
    try:
        for p in _iter_tree(deck_dir):
            files.setdefault(os.path.abspath(p), "deck/" + os.path.relpath(p, deck_dir).replace("\\", "/"))
        if project_root:
            root = os.path.abspath(project_root)
            trees = [os.path.join(root, "assets", "adobe")]
            if slug:
                trees.append(os.path.join(root, "assets", slug))
                sb = os.path.join(root, "demos", f"{slug}-storyboard.json")
                if os.path.isfile(sb):
                    files.setdefault(os.path.abspath(sb), "storyboard/" + os.path.basename(sb))
            for tree in trees:
                for p in _iter_tree(tree):
                    files.setdefault(os.path.abspath(p), "project/" + os.path.relpath(p, root).replace("\\", "/"))
            for p in _referenced_files(deck, root):
                files.setdefault(os.path.abspath(p), "ref/" + os.path.relpath(p, root).replace("\\", "/"))
        h = hashlib.sha256()
        for ap in sorted(files):
            _hash_file(h, ap, files[ap])
        return h.hexdigest()
    except OSError:
        return None


def set_gate(root: str, slug: str, gate: str, status: str = "passed", note: str = "",
             deck_sha_hex: str | None = None, attested_by: str | None = None) -> None:
    with state_lock(root):
        data = load(root)
        slot = data["slugs"].setdefault(slug, {})
        entry = {"status": status,
                 "at": datetime.datetime.now().isoformat(timespec="seconds"),
                 "note": note}
        if deck_sha_hex:
            entry["deck_sha"] = deck_sha_hex   # the complete artifact this gate inspected
        if attested_by:
            entry["attested_by"] = attested_by
        slot[gate] = entry
        save(root, data)


def stale_review_gates(root: str, slug: str, current_sha: str) -> list[str]:
    """Review gates whose recorded deck_sha != the deck as it is NOW (edited after QA passed).
    Gates with no recorded sha are legacy — reported separately by the caller, not failed."""
    slot = load(root)["slugs"].get(slug, {})
    stale = []
    # Only the script-attested QA gates bind to the FINAL artifact. `built` is a status
    # milestone (recorded before QA, legitimately a different snapshot) and `reviewed` is
    # checked separately by the ship path, so neither is treated as "stale" here.
    for g in SHA_BOUND_GATES:
        rec = slot.get(g)
        if isinstance(rec, dict) and rec.get("deck_sha") and rec["deck_sha"] != current_sha:
            stale.append(g)
    return stale


def unattested_review_gates(root: str, slug: str, gates=REVIEW_REQUIRES) -> list[str]:
    slot = load(root)["slugs"].get(slug, {})
    bad = []
    for gate, expected in SCRIPT_ATTESTATIONS.items():
        if gate in gates and (slot.get(gate) or {}).get("attested_by") != expected:
            bad.append(gate)
    return bad


def require(root: str, slug: str, gates: list[str]) -> list[str]:
    """Return the list of required gates that are NOT satisfied (empty = all good)."""
    slot = load(root)["slugs"].get(slug, {})
    missing = []
    for g in gates:
        entry = slot.get(g)
        status = (entry or {}).get("status", "").lower() if isinstance(entry, dict) else ""
        if status not in _SATISFIED:
            missing.append(g)
    return missing


def main() -> int:
    ap = argparse.ArgumentParser(description="Experience-story pipeline gate manifest")
    ap.add_argument("slug")
    ap.add_argument("--project-root")
    ap.add_argument("--set", dest="set_kv", help="gate=status, e.g. brand_resolved=passed")
    ap.add_argument("--note", default="")
    ap.add_argument("--require", dest="require_csv", nargs="?", const="",
                    help="comma list; bare --require (or 'review') uses the stage defaults")
    ap.add_argument("--deck", help="deck path; with --set records the artifact's sha256, with "
                                   "--require review re-checks it against what the QA gates inspected")
    ap.add_argument("--show", action="store_true")
    ap.add_argument("--reset", action="store_true")
    a = ap.parse_args()
    root = resolve_root(a.project_root)
    dsha = deck_sha(a.deck, root, a.slug) if a.deck else None

    if a.reset:
        with state_lock(root):
            try:
                data = load(root)
            except RuntimeError:
                # --reset is the documented recovery path: it must repair a corrupt state file,
                # not crash on it. Start from a clean slate rather than reading the bad bytes.
                data = {"slugs": {}}
            data.setdefault("slugs", {}).pop(a.slug, None)
            save(root, data)
        print(f"[reset] {a.slug}"); return 0

    if a.set_kv:
        if "=" not in a.set_kv:
            print("[FAIL] --set needs gate=status"); return 1
        gate, status = a.set_kv.split("=", 1)
        gate, status_v = gate.strip(), status.strip()
        # fail closed on a non-canonical gate name — a typo (e.g. 'reviewd', 'render-qa') would
        # otherwise record a phantom gate that nothing requires, reading as satisfied in --show
        if gate not in CANONICAL_GATES:
            print(f"[FAIL] '{gate}' is not a canonical gate. Must be one of: {', '.join(CANONICAL_GATES)}")
            return 1
        if gate in SCRIPT_ATTESTATIONS and status_v.lower() in _SATISFIED:
            print(f"[GATE FAIL] '{gate}' is script-attested and cannot be marked passed with "
                  f"pipeline_state.py. Run {SCRIPT_ATTESTATIONS[gate]} on the deck instead.")
            return 1
        # fail-closed: connectors_confirmed needs EVIDENCE — the note must record what was
        # actually probed/posted (e.g. "checklist posted; preview=yes, firefly=no, user waived")
        if gate == "connectors_confirmed" and status_v.lower() in _SATISFIED and len(a.note.strip()) < 15:
            print("[GATE FAIL] connectors_confirmed needs a --note recording the probe result "
                  "and the user's reply (which connectors are live / what was waived).")
            print('Example: --note "checklist posted; preview=yes, firefly=NO, stock=NO; user waived imagery"')
            return 1
        # fail-closed: 'reviewed' cannot be set until the post-build QA gates are green
        if gate == "reviewed" and status_v.lower() in _SATISFIED:
            if not a.deck or not dsha:
                print("[GATE FAIL] reviewed must be bound to the approved artifact: pass --deck "
                      "demos/<slug>/index.html.")
                return 1
            missing = require(root, a.slug, list(REVIEW_REQUIRES))
            if missing:
                print(f"[GATE FAIL] cannot mark '{a.slug}' reviewed — unmet: {', '.join(missing)}.")
                print("Run render_qa.py and voice_lint.py on the built deck first (they record "
                      "their gates on exit 0).")
                return 1
            stale = stale_review_gates(root, a.slug, dsha)
            unbound = [g for g in SCRIPT_ATTESTATIONS if g in REVIEW_REQUIRES
                       and "deck_sha" not in (load(root)["slugs"].get(a.slug, {}).get(g) or {})]
            unattested = unattested_review_gates(root, a.slug)
            if stale or unbound or unattested:
                details = []
                if stale: details.append("stale=" + ",".join(stale))
                if unbound: details.append("unbound=" + ",".join(unbound))
                if unattested: details.append("not-script-attested=" + ",".join(unattested))
                print(f"[GATE FAIL] cannot mark '{a.slug}' reviewed — " + "; ".join(details))
                print("Run the actual QA scripts on the current artifact, then approve that output.")
                return 1
            # 'reviewed' is a HUMAN sign-off, not a gate summary. The Northwind full-run test
            # self-recorded it with note "all Stage 4.5 gates green" — that must be impossible
            # to do silently: the note has to name who approved. (A false claim is still a
            # visible lie in --show, same enforcement tier as the connectors evidence guard.)
            if not re.search(r"approved by\s+\S+", a.note, re.I):
                print(f"[GATE FAIL] 'reviewed' means a PERSON signed off — not that the QA "
                      f"gates passed (they are checked separately).")
                print('Set it only after real approval, with evidence: '
                      '--note "approved by <name>, <where/when>"')
                return 1
        set_gate(root, a.slug, gate, status_v, a.note, deck_sha_hex=dsha,
                 attested_by="human" if gate == "reviewed" else None)
        print(f"[set] {a.slug}: {gate} = {status.strip()}"
              + (f"  (deck sha {dsha[:12]}…)" if dsha else "")); return 0

    if a.show:
        slot = load(root)["slugs"].get(a.slug, {})
        print(f"=== pipeline state · {a.slug} ({state_path(root)}) ===")
        if not slot:
            print("  (no gates recorded yet)")
        for g in CANONICAL_GATES:
            e = slot.get(g)
            mark = "OK " if (isinstance(e, dict) and e.get("status", "").lower() in _SATISFIED) else "-- "
            print(f"  [{mark}] {g:20} {e.get('status','') if isinstance(e,dict) else ''}")
        return 0

    # default action: require ('review' = the post-build QA set)
    preset = (a.require_csv or "").strip().lower()
    if preset == "review":
        gates = list(REVIEW_REQUIRES)
    elif preset == "ship":
        gates = list(SHIP_REQUIRES)
    else:
        gates = [g.strip() for g in a.require_csv.split(",")] if a.require_csv else list(BUILD_REQUIRES)
    if preset in {"review", "ship"} and (not a.deck or not dsha):
        print(f"\n[GATE FAIL] {a.slug}: {preset} requires --deck so staleness can be checked "
              "against the exact artifact.")
        return 1
    missing = require(root, a.slug, gates)
    stage = "review" if preset == "review" else ("ship" if preset == "ship" else "build")
    if missing:
        print(f"\n[GATE FAIL] {a.slug}: {stage} blocked — these gates have not passed: {', '.join(missing)}")
        print(f"Do NOT {stage}. Run the missing stage(s) first (preflight+connector confirm / "
              "normalize+validate / brand fetch / asset inventory / render_qa.py / voice_lint.py),")
        print("then re-check. This gate is deterministic and not skippable.")
        return 1
    # staleness: for a review/ship check with a --deck, verify the QA gates inspected THIS deck
    # (not an earlier version edited since). Closes the "edit deck after all QA green" hole.
    if preset in {"review", "ship"} and dsha:
        stale = stale_review_gates(root, a.slug, dsha)
        if preset == "ship":
            reviewed = (load(root)["slugs"].get(a.slug, {}).get("reviewed") or {})
            if reviewed.get("deck_sha") and reviewed.get("deck_sha") != dsha:
                stale.append("reviewed")
        if stale:
            print(f"\n[GATE FAIL] {a.slug}: deck CHANGED since QA — these gates inspected an older "
                  f"version: {', '.join(stale)}. The deck was edited after they passed; re-run them "
                  f"on the current file before review/ship.")
            return 1
        # provenance: a review gate with no deck_sha was NOT recorded by its QA script (those
        # always hash now) — it was hand-set via bare --set, faking the check. Fail closed.
        bound_gates = SHIP_REQUIRES if preset == "ship" else REVIEW_REQUIRES
        unbound = [g for g in SCRIPT_ATTESTATIONS if g in bound_gates
                   and "deck_sha" not in (load(root)["slugs"].get(a.slug, {}).get(g) or {})]
        if unbound:
            print(f"\n[GATE FAIL] {a.slug}: {', '.join(unbound)} recorded NO deck hash — they were "
                  f"hand-set, not recorded by their QA script (render_qa/voice_lint/layout_qa hash "
                  f"the deck they inspect; a bare '--set {unbound[0]}=passed' does not). Run the "
                  f"actual script(s) on the current deck before review/ship.")
            return 1
        unattested = unattested_review_gates(root, a.slug, bound_gates)
        if unattested:
            print(f"\n[GATE FAIL] {a.slug}: {', '.join(unattested)} were not recorded by their "
                  "own QA scripts. Run the actual scripts on the current artifact.")
            return 1
    print(f"[GATE OK] {a.slug}: all required gates passed ({', '.join(gates)}). Cleared to {stage}."
          + ("  Artifact hash matches QA." if (preset in {"review", "ship"} and dsha) else ""))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except RuntimeError as e:
        # corrupt/locked state etc. — a clean fail-closed message, never a raw traceback
        print(f"[FAIL] {e}")
        print("If the state file is corrupt, run this slug with --reset to clear it.")
        sys.exit(1)
