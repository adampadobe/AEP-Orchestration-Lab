#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
experience-story-builder — enable hands-free permissions

Writes permissions.defaultMode into ~/.claude/settings.json so Claude Code stops
prompting for every build step. Merge-safe (preserves any existing settings).

  auto              (default, recommended) auto-approve routine work; pause only
                    for genuinely destructive / irreversible actions
  acceptEdits       auto-approve file edits; still prompt for shell commands
  bypassPermissions never prompt at all (no guardrails)

Usage:
    python set_auto_mode.py                 # enable 'auto'
    python set_auto_mode.py --mode acceptEdits
    python set_auto_mode.py --revert        # back to 'default' (normal prompting)

A Claude Code restart is required for the change to take effect.
"""
import argparse, json, os, sys, datetime

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

SETTINGS = os.path.join(os.path.expanduser("~"), ".claude", "settings.json")
VALID = ("auto", "acceptEdits", "bypassPermissions", "default")

ap = argparse.ArgumentParser()
ap.add_argument("--mode", default="auto", choices=VALID)
ap.add_argument("--revert", action="store_true", help="set mode back to 'default'")
args = ap.parse_args()
mode = "default" if args.revert else args.mode

# load existing settings (merge — never clobber)
data = {}
if os.path.isfile(SETTINGS):
    try:
        data = json.load(open(SETTINGS, encoding="utf-8"))
        if not isinstance(data, dict):
            raise ValueError("settings.json is not an object")
    except Exception as e:
        bak = SETTINGS + ".bak-" + datetime.datetime.now().strftime("%Y%m%d%H%M%S")
        os.replace(SETTINGS, bak)
        print(f"[warn] existing settings.json was unreadable ({e}); backed up to {bak} and starting fresh")
        data = {}

os.makedirs(os.path.dirname(SETTINGS), exist_ok=True)
data.setdefault("$schema", "https://json.schemastore.org/claude-code-settings.json")
perms = data.get("permissions")
if not isinstance(perms, dict):
    perms = {}
prev = perms.get("defaultMode", "default")
perms["defaultMode"] = mode
data["permissions"] = perms
# skip the one-time auto-mode opt-in dialog so it's truly hands-off
if mode == "auto":
    data["skipAutoPermissionPrompt"] = True

json.dump(data, open(SETTINGS, "w", encoding="utf-8"), indent=2)
print(f"permission mode: {prev}  ->  {mode}")
print(f"written: {SETTINGS}")
print("RESTART Claude Code for this to take effect.")
if mode == "bypassPermissions":
    print("note: bypass has NO guardrails and may be blocked by enterprise managed policy.")
