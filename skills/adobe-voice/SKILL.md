---
name: adobe-voice
description: Adobe voice + "de-Claude" pass for customer-facing copy — deck slides, experience stories, POV decks, emails, one-pagers. Use when the user says "declaude this", "de-Claude", "make it sound like Adobe", "adobe voice/tone/style", "this sounds like AI/Claude", or before any deck ships. Rewrites copy into Adobe's editorial voice and strips AI-tell patterns (antithesis pairs, em-dash chains, "isn't just" constructions, Title Case headlines, marketing slop). Ships a deterministic lint (scripts/voice_lint.py) that the experience-story-builder pipeline runs as a required gate before a deck can be marked reviewed.
---

# Adobe Voice — write like Adobe, not like an AI

Two jobs, in order:
1. **Lint** — run the deterministic check. It finds the AI-tells so you don't rely on taste.
2. **Rewrite** — fix every hit using the rules below, then re-run until clean.

## The lint (deterministic — this is the gate)

```
python ${CLAUDE_PLUGIN_ROOT}/skills/adobe-voice/scripts/voice_lint.py <file.html|md|txt> \
       [--slug <slug> --project-root <root>]
```

Exit 0 = clean (records pipeline gate `voice_lint=passed` when `--slug` is given).
Exit 1 = violations listed with line numbers. Rewrite and re-run — never hand-wave past it.
It checks visible text only (HTML tags/scripts/styles stripped).

## Adobe voice in one paragraph

Adobe speaks like a confident practitioner, not a hype machine and not a novelist. Plain
words, active voice, second person where natural. Lead with what the customer gets, prove
it with a specific (a number, a moment, a name), and stop. Headlines are **sentence case**.
One idea per sentence. Verbs carry the sentence; adjectives are on a budget.

## De-Claude rules (what the lint catches, and how to fix each)

| AI-tell | Example (bad) | Fix (Adobe voice) |
|---|---|---|
| Antithesis pair "X, not Y" | "relief, not a fee" · "a heads-up, not a nasty surprise" | Say the one thing that's true: "the fee never lands" |
| "isn't just / more than just" | "it isn't just banking" | State what it is: "it's banking that plans ahead" |
| "no X, no Y, just Z" triplet | "no forms, no waiting, just answers" | Pick the strongest fact and give it a number |
| Em-dash chains | "early — plain-spoken — on your side" | Break into sentences; keep at most one dash per ~50 words |
| Drama opener | "Here's the thing." · "The best part?" | Delete it; start with the substance |
| Marketing slop | seamless, effortless, magical, supercharge, elevate, game-changing, unlock | Name the actual capability or outcome |
| Title Case Headlines | "A Cushion, When It Finally Fits" | Sentence case: "The right moment to start saving" |
| Personified product being coy | "the app quietly did the maths" | Attribute plainly: "the app calculated the shortfall" |

## Rewrite method

1. Run the lint; collect every hit.
2. For each hit, ask: *what is the concrete fact underneath this flourish?* Write that.
3. Keep the storyboard's verbatim in-app copy untouched — the lint skips nothing, so if
   in-app copy trips it, fix it **in the storyboard** (it's the source of truth), then re-render.
4. Re-run the lint until exit 0.

Full rule detail and more before/after pairs: `references/adobe-voice.md`.
