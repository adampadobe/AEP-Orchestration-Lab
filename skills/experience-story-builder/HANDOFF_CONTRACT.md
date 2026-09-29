# Handoff Contract — `experience-story-writer` (Natalia) → `experience-story-builder` (this bundle)

The two-agent chain is `brief → Story Writer → storyboard → Experience Story Builder → demo`.
This doc defines exactly what crosses the seam so the handoff is verifiable, not "best effort".

## ✅ Status — VERIFIED against the shipped spec (8 Jul 2026 build)
Earlier packages of `experience-story-writer` shipped only `SKILL.md` (no `references/`), so the format
was unverifiable. **`experience-story-writer8.07.26.skill` ships the full `references/` folder**,
including `07_storyboard.md` + `10_export.md`. Diffed against our Internal Storyboard Contract, the
storyboard format is a **near field-for-field match** — including the three fields we previously
expected to fill ourselves. This closes roadmap items **A5** (files received) and **A1** (handoff verified).

## What crosses the seam
The **markdown storyboard** — Natalia's storyboard is one of three derivative outputs (storyboard /
interactive HTML journey / 1-pager). Ask for the **storyboard** option. Not the CSV/TSV/Miro export
(`10_export.md`); our normalizer can parse tabular exports too, but markdown is the clean path.

## Field map — Natalia's `07_storyboard.md` → our Internal Storyboard Contract

| Our contract (required) | In Natalia's `07_storyboard.md` | Match |
|---|---|---|
| 4 sections: `PERSONA · BACKGROUND · STORY STEPS · CONCLUSION` | "four mandatory sections", same names | ✅ exact |
| PERSONA: Who · Description · Needs & Constraints · Visual Guidance (Environment · Appearance & Styling · Tone & Atmosphere) | same fields | ✅ exact |
| BACKGROUND: Who · Scenario · Motivation · Channel · Key Message · Visual Direction (Environment · Time of Day · Device/Platform · Mood) | same fields | ✅ exact |
| STORY STEP: Step Title · Who · Intent (Message) · Action (What) · Channel/Touchpoint | same fields | ✅ exact |
| Visual Direction: What Is Shown On Screen · Primary Focus · Action On Screen · Mood/Tone · Key Highlight | same fields | ✅ exact |
| **Exact on-screen copy (verbatim)** | STRICT rule: "Copy on screen must be exact text — never use placeholders" | ✅ enforced |
| **Image Generation Prompt** (subject/setting/mood/lighting/composition/AR/negatives) | dedicated "IMAGE GENERATION PROMPT FORMAT" — same seven parts, required per step | ✅ present |
| **UI / Product Visibility** (routing track) | explicit field with customer-vs-marketer rules | ✅ present |
| CONCLUSION: Outcome · Emotional Payoff · Brand Role · Visual Direction | same fields | ✅ exact |
| Type-specific data (journey: Profile Events/Segments · marketer: Product/Agent/Value) | not named in `07_storyboard.md`; lives in `08_marketer.md` / `09_journey.md` | ⚠ minor delta |

**Bonus fields Natalia's closing block gives us** (map straight onto our Stage 2 Asset & Image
Inventory + component reuse): *Recurring visual elements* → reusable components · *Steps requiring
custom asset generation* → Firefly slots · *Steps requiring real product screenshots* → real-asset
slots · *Image generation prompt style guide* → deck-wide image consistency.

## The practical rule (updated)
The storyboard is now close to a **1:1 drop-in**. Stage 2 (Script Lock) mostly **validates** rather
than **fills** — the three fields we used to backfill (Image Generation Prompt, UI/Product Visibility,
exact copy) already arrive in the storyboard. Only the per-step *type-specific data* may need
deriving from `08_marketer.md` / `09_journey.md`. The normalize/validate STOP still guards quality.

## Remaining nicety (optional, Natalia's side)
Add the per-step **type-specific data** (journey: Profile Events / Segments Added · marketer: Adobe
Product / Agent moment / Business Value) as named fields in `07_storyboard.md` and the seam is
100% field-for-field. Not blocking.
