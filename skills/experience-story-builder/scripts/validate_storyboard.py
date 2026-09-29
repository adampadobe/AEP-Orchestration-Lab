#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
experience-story-builder — normalized-storyboard SEAM VALIDATOR.

The typed contract between the Story Agent (Solution 1) and the Builder (Solution 2). Run this at
the Stage 2 (Script Lock) seam, AFTER normalize and BEFORE build. It is a deterministic gate — it
holds regardless of what any prose instruction says.

    python validate_storyboard.py demos/<slug>-storyboard.json [--strict]

Checks (matches schema/storyboard.schema.json + the no-placeholder Quality Rules):
  • all four sections + every required field present and non-empty
  • story_type is one of customer-journey | marketer | re-skin; slug is kebab-case
  • per step: exact on_screen_copy + ui_product_visibility present; image_generation_prompt present
    UNLESS visual_direction.asset_supplied is true
  • NO placeholders anywhere: {{handlebars}}, [brackets], lorem ipsum, TODO/TBD/FIXME/XXX/PLACEHOLDER
  • asset_inventory (if present): every slot status=resolved  (unresolved = a quality stop)

Exit 0 = clean (warnings allowed). Exit 1 = errors (do NOT build). --strict promotes warnings to errors.
If the `jsonschema` package is installed it ALSO runs full JSON-Schema validation as a bonus; if not,
the built-in structural checks below still run (no dependency required).
"""
import argparse, json, os, re, sys

try: sys.stdout.reconfigure(encoding="utf-8")
except Exception: pass

# A placeholder is unwritten content. A button label is written content that happens to use
# brackets — and `[Order filter — £20]` is the single most natural way a designer writes UI copy.
# Flagging every [...] made the most common correct thing a hard error, so match the shape of an
# UNFILLED slot (generic filler vocabulary) rather than the bracket character itself.
_FILLER = (r"text|copy|name|here|insert|goes\s+here|todo|tbd|fixme|placeholder|xxx|lorem|"
           r"tk|your\s+\w+|brand\s+name|message|notification|headline|subject|label|caption|"
           r"description|value|number|date|time|price|image|photo|asset|url|link")

PLACEHOLDER_PATTERNS = [
    (re.compile(r"\{\{.*?\}\}"), "handlebars {{...}}"),
    (re.compile(rf"\[[^\]]*\b(?:{_FILLER})\b[^\]]*\]", re.I), "bracket placeholder [...]"),
    (re.compile(r"\blorem ipsum\b", re.I), "lorem ipsum"),
    (re.compile(r"\b(TODO|TBD|FIXME|XXX|PLACEHOLDER)\b"), "TODO/TBD/etc."),
]
# 'combined' = one deck, two acts: the journey told with Adobe invisible, then the same moments
# rewound from the marketer's side with Adobe named. It is the strongest EBC format and it had no
# representation here — the enum forced it to be split into two storyboards that the builder then
# had no way to render as a single deck. Steps carry an optional `act` to say which half they're in.
STORY_TYPES = {"customer-journey", "marketer", "re-skin", "combined"}
ACTS = {"journey", "marketer"}

errors, warnings = [], []
def err(path, msg): errors.append(f"{path}: {msg}")
def warn(path, msg): warnings.append(f"{path}: {msg}")


def check_str(obj, key, path):
    """Field must exist, be a non-empty string, and contain no placeholder."""
    if not isinstance(obj, dict) or key not in obj:
        err(f"{path}.{key}", "missing required field"); return
    v = obj[key]
    if not isinstance(v, str) or not v.strip():
        err(f"{path}.{key}", "empty or not a string"); return
    for patt, label in PLACEHOLDER_PATTERNS:
        if patt.search(v):
            err(f"{path}.{key}", f"placeholder detected ({label}): {v[:60]!r}"); return


def check_obj(parent, key, path):
    if not isinstance(parent, dict) or key not in parent or not isinstance(parent[key], dict):
        err(f"{path}.{key}", "missing required object"); return None
    return parent[key]


def validate(sb):
    # ---- meta ----
    meta = check_obj(sb, "meta", "$")
    if meta is not None:
        check_str(meta, "slug", "meta"); check_str(meta, "customer", "meta")
        check_str(meta, "story_type", "meta")
        if isinstance(meta.get("slug"), str) and not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", meta.get("slug", "")):
            err("meta.slug", f"not kebab-case: {meta.get('slug')!r}")
        if meta.get("story_type") not in STORY_TYPES:
            err("meta.story_type", f"must be one of {sorted(STORY_TYPES)}")

    # ---- persona ----
    p = check_obj(sb, "persona", "$")
    if p is not None:
        for k in ("who", "description", "needs_and_constraints"): check_str(p, k, "persona")
        vg = check_obj(p, "visual_guidance", "persona")
        if vg is not None:
            for k in ("environment", "appearance_and_styling", "tone_and_atmosphere"):
                check_str(vg, k, "persona.visual_guidance")

    # ---- background ----
    b = check_obj(sb, "background", "$")
    if b is not None:
        for k in ("who", "scenario", "motivation", "channel", "key_message"): check_str(b, k, "background")
        vd = check_obj(b, "visual_direction", "background")
        if vd is not None:
            for k in ("environment", "time_of_day", "device_platform_visible", "mood"):
                check_str(vd, k, "background.visual_direction")

    # ---- story_steps ----
    steps = sb.get("story_steps")
    if not isinstance(steps, list) or not steps:
        err("story_steps", "must be a non-empty array")
    else:
        seen = []
        for i, s in enumerate(steps):
            sp = f"story_steps[{i}]"
            if not isinstance(s, dict):
                err(sp, "not an object"); continue
            for k in ("title", "who", "intent", "action", "channel_touchpoint"): check_str(s, k, sp)
            if not isinstance(s.get("step"), int):
                err(f"{sp}.step", "missing/!int step number")
            else:
                seen.append(s["step"])
            # In a combined (two-act) storyboard every step must declare which act it belongs to —
            # otherwise the builder cannot tell an Adobe-invisible journey scene from a marketer
            # scene, and the guardrail that keeps Adobe out of the journey narrative has nothing
            # to key on.
            if (sb.get("meta") or {}).get("story_type") == "combined":
                act = s.get("act")
                if act not in ACTS:
                    err(f"{sp}.act", f"combined storyboard: every step needs act={sorted(ACTS)}; got {act!r}")
            vd = check_obj(s, "visual_direction", sp)
            if vd is not None:
                for k in ("on_screen_copy", "primary_focus", "action_on_screen", "ui_product_visibility", "mood_tone", "key_highlight"):
                    check_str(vd, k, f"{sp}.visual_direction")
                # image prompt required unless an asset is already supplied
                if vd.get("asset_supplied") is True:
                    pass
                else:
                    check_str(vd, "image_generation_prompt", f"{sp}.visual_direction")
        if seen and sorted(seen) != list(range(1, len(seen) + 1)):
            warn("story_steps", f"step numbers not contiguous 1..n: {seen}")

    # ---- conclusion ----
    c = check_obj(sb, "conclusion", "$")
    if c is not None:
        for k in ("outcome", "emotional_payoff", "brand_role"): check_str(c, k, "conclusion")
        vd = check_obj(c, "visual_direction", "conclusion")
        if vd is not None:
            for k in ("what_is_shown", "primary_focus", "action", "mood", "key_highlight"):
                check_str(vd, k, "conclusion.visual_direction")

    # ---- asset_inventory (optional at author time; must be all-resolved before build) ----
    inv = sb.get("asset_inventory")
    if inv is None:
        warn("asset_inventory", "absent — build must still ship zero placeholder images")
    elif isinstance(inv, list):
        for i, slot in enumerate(inv):
            if not isinstance(slot, dict):
                continue
            status = slot.get("status")
            if status == "resolved":
                continue
            # A SILENT stand-in and a DECLARED one are different things. The rule exists to stop a
            # generic stock image quietly passing as the customer's asset — not to stop a team
            # deliberately shipping a labelled, reasoned gap while a connector is unavailable.
            # render_qa already accepts exactly this via data-no-persona="<reason>"; the two gates
            # disagreed, so a legitimate waiver was unexpressible here.
            # A waiver must: name a reason, and record what WOULD have been generated.
            if status == "waived":
                if not str(slot.get("reason") or "").strip():
                    err(f"asset_inventory[{i}]",
                        f"waived slot {slot.get('slot_id')!r} has no reason — a waiver without a "
                        f"reason is a silent stand-in")
                elif not str(slot.get("would_generate") or "").strip():
                    err(f"asset_inventory[{i}]",
                        f"waived slot {slot.get('slot_id')!r} does not record what would have been "
                        f"generated — state the prompt so the gap is auditable and reproducible")
                else:
                    warn(f"asset_inventory[{i}]",
                         f"WAIVED slot {slot.get('slot_id')!r} ({slot.get('reason')}) — the deck "
                         f"MUST render a visibly labelled placeholder, never a silent stand-in")
                continue
            err(f"asset_inventory[{i}]",
                f"unresolved slot {slot.get('slot_id')!r} — no placeholder may ship "
                f"(use status='waived' with a reason + would_generate to ship a labelled gap)")


def maybe_jsonschema(sb, schema_path):
    try:
        import jsonschema  # optional bonus
    except Exception:
        return
    try:
        schema = json.load(open(schema_path, encoding="utf-8"))
        jsonschema.validate(sb, schema)
        print("[OK]   jsonschema: full schema validation passed")
    except FileNotFoundError:
        pass
    except Exception as e:
        # surface as an error but keep our own report too
        errors.append(f"jsonschema: {getattr(e, 'message', str(e))[:120]}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("storyboard", help="path to demos/<slug>-storyboard.json")
    ap.add_argument("--schema", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "schema", "storyboard.schema.json"))
    ap.add_argument("--strict", action="store_true", help="treat warnings as errors")
    a = ap.parse_args()

    try:
        sb = json.load(open(a.storyboard, encoding="utf-8"))
    except FileNotFoundError:
        print(f"[FAIL] not found: {a.storyboard}"); sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"[FAIL] invalid JSON: {e}"); sys.exit(1)

    validate(sb)
    maybe_jsonschema(sb, a.schema)

    slug = (sb.get("meta") or {}).get("slug", "?")
    print(f"\n=== validate_storyboard · {slug} ===")
    for w in warnings: print(f"[WARN] {w}")
    for e in errors:   print(f"[FAIL] {e}")

    fail = errors or (a.strict and warnings)
    n_steps = len(sb.get("story_steps") or [])
    if not fail:
        print(f"\nRESULT: OK — {n_steps} steps, {len(warnings)} warning(s). Cleared to build.")
        # Record the gate deterministically so the build stage's --require check sees it.
        # Best-effort: never let state-writing break the validator.
        try:
            here = os.path.dirname(os.path.abspath(__file__))
            if here not in sys.path:
                sys.path.insert(0, here)
            import pipeline_state
            root = os.path.dirname(os.path.dirname(os.path.abspath(a.storyboard)))  # <root>/demos/x.json
            if slug and slug != "?":
                pipeline_state.set_gate(root, slug, "storyboard_validated", "passed",
                                        "validate_storyboard exit 0")
        except Exception:
            pass
        sys.exit(0)
    print(f"\nRESULT: {len(errors)} error(s), {len(warnings)} warning(s) — FAIL. Fix before build (this gate is not skippable, even on the fast path).")
    sys.exit(1)


if __name__ == "__main__":
    main()
