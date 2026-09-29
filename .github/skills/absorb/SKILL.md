---
name: absorb
description: Harvest the reusable building blocks from a finished experience-story / vision demo HTML — animations (keyframes), screen types, layouts, and the deck's structure — into the shared component library so future builds reuse them instead of reinventing. Use when the user says "absorb this deck", "harvest patterns / animations / screens from this demo", "learn from this deck", "add this to the library", "save these animations", or after a deck is signed off. Part of the experience-story-builder ecosystem; it WRITES INTO vision-experience-builder/components/. Do NOT use to build or edit a deck (that's experience-story-builder / vision-experience-builder) — absorb only reads a deck and banks its patterns.
---

# Absorb — harvest reusable patterns from a finished deck

The learning loop for the experience-story chain. Point it at a built deck and it
banks that deck's reusable pieces into the shared component library, so every demo
makes the next one faster — the same way the persona repository grows.

## When to run
- **After a deck is signed off** (the orchestrator's final step), or
- **On demand** — *"absorb this deck"*, *"harvest the animations/screens from this file"* —
  no full build required; it only reads the HTML.

## Run it
```
python ${CLAUDE_PLUGIN_ROOT}/skills/absorb/scripts/absorb.py <deck.html> --source <label> --qa-passed
```
- `<deck.html>` — the finished deck (e.g. `demos/po-cruises/index.html`).
- `--source <label>` — where it came from (e.g. `po-cruises`); used in the catalog + filenames.
- `--qa-passed` — **assert the deck passed final QA.** Only harvest signed-off decks; this marks
  entries `verified:true`. (Self-growing libraries *degrade* quality without a verification gate.)
- `--skills-root` — defaults to `$CLAUDE_PLUGIN_DATA`; it always writes into
  `vision-experience-builder/components/`.

**Idempotent** — re-running merges, never duplicates.

## Guardrails (why the library doesn't rot)
Self-generated libraries accrue "skill debt" without discipline, so absorb enforces:
- **Verification gate** — a candidate whose markup still carries placeholder/lorem/`TODO`/"scenic
  image" is **not banked**; and `--qa-passed` records `verified` on every entry so the builder can
  prefer verified pieces. Harvest only signed-off decks.
- **Content-hash dedup** — animations are deduped by their *keyframe body* (comments/whitespace
  stripped), so an identical animation under a different name merges instead of bloating the library.
- **Versioning** — each catalog entry carries `rev`, `first_source`, and `sources[]`; a `deprecated`
  flag is preserved on re-harvest (mark superseded pieces, never silently resurrect or delete them).
- **No brand-bound instances** — screen/template samples with several literal hex colours are flagged
  `brand_bound:true` / `generalize:"review"`: **harvest structures + animations (generalizable);
  tokenize a brand-bound sample to `var(--brand)` etc. before reusing it as-is.** Personas stay muted
  (empty `tags`) until curated, so they never auto-match a wrong story.

## What it harvests → where
```
components/catalog.json              the index of everything (read this first)
components/animations/<name>.css     every @keyframes + the selectors that trigger it
components/screens/<type>/           a sample of each screen TYPE (meta.json + sample.html/.css)
components/harvested/<name>.html     NEW sub-slide widgets only (skips anything already curated)
templates/harvested/<type>.html      standalone drop-in slide files for NEW screen types
assets/personas/harvested-<name>/    portrait image(s) the deck used + meta.json (+ personas.json entry)
components/structures/<source>.json  the ordered screen-type sequence = a reusable deck skeleton
```

**Only new / not-already-curated** is taken — re-running on the same deck adds nothing, and it
never duplicates a curated component (`mobile-phone-frame`, `touchpoint-chain`, …) or template
(`cover-cobrand-lockup`, `persona-hero-splash`, `journey-canvas`). Harvested personas land with
empty `tags` + `TODO` role so they don't auto-match Persona Resolution until you fill them in.

Screen types are fingerprinted from each `<section class="slide …">` (its own class first —
cover / journey-wave / divider / passage-of-time / closing — then an inner feature class —
mobile-email, phone-call, data-reveal, browser-mock, kpi-dashboard, propensity-gauges,
offer-ranking, agent-list, cards-row, persona-intro, touchpoint-chain, dual-pane-narrative).

## After absorbing
- Skim `components/catalog.json`.
- Fill the `description` in any **new** `screens/<type>/meta.json` (one line on when to use it) —
  the script leaves a `TODO` for genuinely new types.

## How the library gets used (the payoff)
On the next build, `vision-experience-builder` reads `catalog.json` and reuses banked
**animations** (no re-inventing keyframes), starts scenes from the closest **screen** sample,
and starts the deck from a matching **structure** skeleton. Seeded from `po-cruises`
(17 animations, 14 screen types). See `vision-experience-builder/components/README.md`.

## Not this skill
- Building or editing a deck → `experience-story-builder` (orchestrator) / `vision-experience-builder`.
- Absorb never modifies the source deck; it only reads it and writes into the library.
