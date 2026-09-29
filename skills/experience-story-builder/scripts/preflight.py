#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
experience-story-builder — PREFLIGHT
Checks the file/config-verifiable dependencies before a build so a fresh
machine/account fails LOUDLY up front, not mid-build (where the no-placeholder
rule forces a wasted stop).

It cannot see live MCP connectors (Claude_Preview / Firefly / Adobe for Creativity)
— those run in the Claude session, not on disk — so it reminds you to verify them.

Usage:
    python preflight.py --project-root <path>     (project-root optional)
"""
import argparse, json, os, sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

HOME = os.path.expanduser("~")
LEGACY_SKILLS = os.path.join(HOME, ".claude", "skills")


def _skills_root():
    """Where the sibling skills live.

    $CLAUDE_PLUGIN_ROOT is only set inside the plugin runtime. This script is normally run
    through Bash, which does not have it, so relying on it alone sent preflight to
    ~/.claude/skills and reported [FAIL] for four skills sitting in the same tree as the
    running script — the agent then burned a turn proving the failures were fake.

    So: honour the env var when it IS set (explicit override, used by the tests), otherwise
    work it out from this file's own location. preflight.py always lives at
    <root>/skills/experience-story-builder/scripts/preflight.py, which makes <root>/skills
    authoritative and needs no environment at all. Legacy ~/.claude/skills is the last resort.
    """
    env = os.environ.get("CLAUDE_PLUGIN_ROOT")
    if env:
        return os.path.join(env, "skills"), "plugin-root"
    here = os.path.dirname(os.path.abspath(__file__))
    own = os.path.abspath(os.path.join(here, os.pardir, os.pardir))
    if os.path.isfile(os.path.join(own, "experience-story-builder", "SKILL.md")):
        return own, "self"
    return LEGACY_SKILLS, "legacy"


SKILLS, SKILLS_FROM = _skills_root()
# A plugin install is not fixed by copying folders into ~/.claude/skills, so the remedy text
# has to match the layout actually in use.
INSTALLED_AS_PLUGIN = SKILLS_FROM in ("plugin-root", "self")
CLAUDE_JSON = os.path.join(HOME, ".claude.json")

PASS, WARN, FAIL = "PASS", "WARN", "FAIL"
ICON = {PASS: "[PASS]", WARN: "[WARN]", FAIL: "[FAIL]"}
rows = []
def check(status, label, hint=""):
    rows.append((status, label, hint))

# 0. Say where we looked, so a wrong root is obvious instead of looking like four missing skills.
check(PASS, f"skills root ({SKILLS_FROM}): {SKILLS}")


def _missing_hint(name):
    if INSTALLED_AS_PLUGIN:
        return (f"'{name}' is absent from this plugin install — reinstall/update the "
                f"experience-story-builder plugin (do NOT copy folders into {LEGACY_SKILLS})")
    return f"copy the '{name}' folder into {SKILLS}"


# 1. The four required skills
for s in ("experience-story-builder", "vision-experience-builder",
          "adobe-brand-fetcher", "frontend-slides"):
    d = os.path.join(SKILLS, s)
    ok = os.path.isfile(os.path.join(d, "SKILL.md"))
    check(PASS if ok else FAIL, f"skill installed: {s}", "" if ok else _missing_hint(s))
# 1b. absorb — the pattern-harvest skill (optional; build works without it)
_ab = os.path.isfile(os.path.join(SKILLS, "absorb", "SKILL.md"))
check(PASS if _ab else WARN, "skill installed: absorb (pattern library / learning loop)",
      "" if _ab else ("optional — grows components/ after each build; "
                      + ("reinstall the plugin to include it" if INSTALLED_AS_PLUGIN
                         else "copy the 'absorb' folder to enable it")))

# 2. frontend-slides base assets
fs = os.path.join(SKILLS, "frontend-slides")
for rel, label in (("viewport-base.css", "frontend-slides/viewport-base.css"),
                   (os.path.join("scripts", "deploy.sh"), "frontend-slides/scripts/deploy.sh"),
                   (os.path.join("scripts", "export-pdf.sh"), "frontend-slides/scripts/export-pdf.sh")):
    ok = os.path.isfile(os.path.join(fs, rel))
    check(PASS if ok else FAIL, label, "" if ok else "frontend-slides is incomplete — re-copy it")

# 3. Persona repo
personas_json = os.path.join(SKILLS, "vision-experience-builder", "assets", "personas", "personas.json")
if os.path.isfile(personas_json):
    try:
        n = len([d for d in os.listdir(os.path.dirname(personas_json))
                 if os.path.isdir(os.path.join(os.path.dirname(personas_json), d))])
    except Exception:
        n = 0
    check(PASS if n >= 3 else WARN, f"persona repo present ({n} archetype folder(s))",
          "" if n >= 3 else "thin repo — non-matching personas will be generated via Firefly (needs Firefly MCP)")
else:
    check(WARN, "persona repo present", "no personas.json — every persona will be generated via Firefly")

# 4. Brandfetch in config (the only file-verifiable MCP)
bf = False
if os.path.isfile(CLAUDE_JSON):
    try:
        cfg = json.load(open(CLAUDE_JSON, encoding="utf-8"))
        bf = "brandfetch" in (cfg.get("mcpServers") or {})
    except Exception:
        pass
check(PASS if bf else WARN, "Brandfetch MCP in ~/.claude.json (optional)",
      "" if bf else "not configured — fine to skip; Stage 3 resolves brand via keyless scrape + WebSearch")

# 4b. Permission mode (hands-free vs prompt-per-step)
SETTINGS = os.path.join(HOME, ".claude", "settings.json")
mode = None
if os.path.isfile(SETTINGS):
    try:
        mode = ((json.load(open(SETTINGS, encoding="utf-8")).get("permissions") or {}).get("defaultMode"))
    except Exception:
        pass
handsfree = mode in ("auto", "acceptEdits", "bypassPermissions", "dontAsk")
check(PASS if handsfree else WARN, f"permission mode: {mode or 'default (prompts every step)'}",
      "" if handsfree else "a batched build will prompt dozens of times — run  "
      "python ${CLAUDE_PLUGIN_ROOT}/skills/experience-story-builder/scripts/set_auto_mode.py  to enable hands-free 'auto' mode")

# 5. Project scaffold (optional)
ap = argparse.ArgumentParser()
ap.add_argument("--project-root", default=os.getcwd())
root = ap.parse_args().project_root
present = [d for d in ("briefs", "stories", "demos", "assets") if os.path.isdir(os.path.join(root, d))]
check(PASS if present else WARN, f"project scaffold in {root} ({', '.join(present) or 'none'})",
      "" if present else "created on demand — not a blocker")

# ---- report ----
print("\n=== experience-story-builder · PREFLIGHT (file/config checks) ===\n")
for status, label, hint in rows:
    line = f"{ICON[status]:7} {label}"
    if hint and status != PASS:
        line += f"\n           -> {hint}"
    print(line)

fails = [r for r in rows if r[0] == FAIL]
print("\n=== LIVE MCP connectors — verify in the Claude session (not checkable on disk), then PROMPT the user ===")
print("  REQUIRED : Claude_Preview preview_* (render/QA) — built in, just switch it on.")
print("  REQUIRED : Firefly image-gen (firefly_generate_image).")
print("  REQUIRED : Adobe for Creativity — image_remove_background / crop / adjust")
print("             (call adobe_mandatory_init first).")
print("             ⚠ Firefly BOARDS being connected does NOT")
print("             mean image-gen is — probe firefly_generate_image by name. With no imagery source,")
print("             every unmatched persona/hero halts on the no-placeholder rule.")
print("  OPTIONAL : Spectrum icons MCP — full icon coverage. Offline fallback: the bundled 34-label")
print("             pack (vision-experience-builder/components/icons/pack.json). Icons beyond the pack")
print("             come from the MCP, NEVER hand-drawn; embed inline in the deck either way.")
print("  OPTIONAL : Adobe Stock, Adobe Express.")
print("  OPTIONAL : Brandfetch (cleanest brand data — NOT required; keyless scrape + WebSearch cover it)")
print("             · Google Stitch (app/website UI designer).")
print("  If a REQUIRED connector is missing, STOP and ask the user to connect it before building.\n")

if fails:
    print(f"RESULT: {len(fails)} FAIL — resolve the [FAIL] item(s) above before building.")
    sys.exit(1)
print("RESULT: file/config checks OK — now confirm the live MCP connectors above, then proceed to intake.")
