# experience-story-builder — install & invocation guide

> **Requires Claude Code** (the CLI or desktop app — not claude.ai chat).
> Install at [claude.ai/code](https://claude.ai/code) if you don't have it yet.
> Skills, MCPs, and the file-system pipeline only work inside Claude Code.

How to install, what must be connected, and how to run the orchestrator. Routing rules and the
storyboard→builder mapping live in `routing.md`; the internal storyboard contract is in
`SKILL.md`.

The orchestrator's contract is a **storyboard artifact**, not a story skill. It runs with or
without `experience-story-writer` installed.

---

## 1. Prerequisites

### Skills
| Skill | Required | Where it lives |
|---|---|---|
| `vision-experience-builder` | ✅ | `${CLAUDE_PLUGIN_ROOT}/skills/vision-experience-builder/` |
| `adobe-brand-fetcher` | ✅ | `${CLAUDE_PLUGIN_ROOT}/skills/adobe-brand-fetcher/` |
| `frontend-slides` | ✅ (base) | `${CLAUDE_PLUGIN_ROOT}/skills/frontend-slides/` — deploy/export + viewport-base.css |
| `experience-story-writer` | **optional** | anthropic-skills **plugin** — one way to *generate* a storyboard if the user has none; never invoked otherwise |
| `story-hub-helper` | optional | plugin — Story Hub handoff |
| `remotion-sizzle` | optional | plugin — sizzle-reel handoff |

The chain needs only the **builder + brand-fetcher + frontend-slides** plus a storyboard from
any source. `experience-story-writer` is invoked **by name only if** the user wants help authoring
a storyboard.

### MCPs — see **`CONNECTORS.md`** (the single source of truth)
Short version: **REQUIRED** = Claude_Preview (built in, just switch it on) **+** Firefly **+**
Adobe for Creativity. **OPTIONAL** = everything else, including Spectrum icons, Adobe Stock,
Express, Brandfetch, Google Stitch and Figma. Full matrix, setup steps, and the ⚠️ "Express/Boards ≠ image-gen"
note live in `CONNECTORS.md`; the preflight verifies what's file-checkable.

### Project layout
Run inside a project root with `briefs/`, `stories/`, `demos/`, `assets/` (created on demand).
A `.claude/launch.json` static-server entry per demo enables Claude_Preview QA.

---

## 2. Install steps — self-installing zip
The whole bundle ships as **one zip**. The easiest path needs no commands:

**Option A — tell Claude Code to do it (recommended).** Unzip anywhere, then in Claude Code say
**"install this"** (with the unzipped folder open) — it runs `install.py`, which copies all five
skills (`experience-story-builder`, `vision-experience-builder`, `adobe-brand-fetcher`,
`frontend-slides`, `absorb`) into `${CLAUDE_PLUGIN_ROOT}/skills/`.

**Option B — run it yourself.** From the unzipped bundle root: `python install.py`.

Then:
1. Confirm `${CLAUDE_PLUGIN_ROOT}/skills/experience-story-builder/` contains `SKILL.md`, `routing.md`, `INSTALL_GUIDE.md`, `scripts/`.
2. **Restart Claude Code** so the skills are indexed; confirm `experience-story-builder` appears in the skills list.
3. Say **"set up the experience story builder"** → it greets, runs the preflight, and walks you
   through hands-free mode + connectors (see `CONNECTORS.md`).
4. Smoke test (fast path): *"rebrand this storyboard into a demo for [brand], [url]"* with a
   storyboard attached → it should announce **FAST PATH** and run to one final review.

---

## 3. Tiers

| | FAST PATH (self-serve) | FULL PATH (net-new creative) |
|---|---|---|
| When | usable storyboard present + brand resolvable + rebrand/standard build | missing/thin storyboard, net-new narrative, or user wants control |
| Gates | **one review at the end** | storyboard approval + per-batch approval |
| Feel | near-one-button | guided, reviewed |
| Always on (both) | normalize+validate stop on missing required fields; all Quality Rules | same |

The orchestrator announces the tier and why; override with "fast" / "just build it" or
"full" / "review each step".

---

## 4. How to invoke

### Canonical trigger (the entry point)
```
Build an experience story for [Customer] ([url]) — customer journey — just go
```
Replace `just go` with `review each step` for the guided path. Replace `customer journey` with
`marketer` or `re-skin` for other story types.

After the trigger, Claude prompts you in a single message for:
1. **Your script / brief in markdown** — paste it, or say "draft from scratch"
2. **Extra context** (optional) — team call transcripts, discovery notes, customer emails
3. **Path confirmation** — `just go` or `review each step`

Reply with all of that in one message and the build starts.

### Examples
- **Fast path (script in hand):**
  *"Build an experience story for Aurora Bank (aurorabank.com) — customer journey — just go"*
  → Claude asks for script + any extra context → you paste both → build runs to one final review.

- **Full path (net-new, no script yet):**
  *"Build an experience story for Aurora Bank (aurorabank.com) — customer journey — review each step"*
  → Claude asks for script or "draft from scratch" → storyboard gate → per-batch gates → final review.

- **Just the trigger, no modifiers:**
  *"Build an experience story for Aurora Bank (aurorabank.com) — customer journey"*
  → Claude prompts for script + context + path choice together.

### Phase 2 (documented, NOT built) — variable-form fast path
```
experience-story-builder customer="Aurora Bank" url="aurorabank.com" storyboard=path/to/sb.md tier=fast
```
Still honours the normalize/validate stop and all Quality Rules. Roadmap item only.

---

## 5. Worked examples

### A. FAST PATH — clean rebrand (SC self-serve, near-one-button)
1. **Stage 0.** "Rebrand this storyboard for Aurora Bank, aurorabank.com." Storyboard attached
   → slug `aurora-bank`; tier = **FAST** (announced).
2. **Stage 1.** Storyboard present → no story skill involved.
3. **Stage 2 (normalize+validate).** Mapped to the contract; exact on-screen copy captured
   verbatim; all required fields present → `demos/aurora-bank-storyboard.md` + validation report
   ("8/8 scenes complete, 0 flagged"). (Had a scene lacked exact copy or an image source, it
   would STOP and ask — even on fast path.)
4. **Stage 3 (brand).** `install.py` → `assets/adobe/`; `get_brand("aurorabank.com")` →
   `assets/aurora-bank/`; logo + palette verified.
5. **Stage 4 (build).** Batched ~5 scenes, **no mid-gates**, assembled with nav →
   `demos/aurora-bank/index.html`. Quality Rules enforced throughout.
6. **Stage 5.** 🚦 **single final review** → offer deploy / PDF / Story Hub / sizzle.

### B. FULL PATH — net-new creative (no storyboard yet)
1. **Stage 0.** "Net-new vision deck for Aurora Bank, journey, review each step." → tier =
   **FULL**.
2. **Stage 1.** No storyboard → offer: generate one with `experience-story-writer` (optional) or
   scaffold from a brief. Say "use story writer" → it authors narrative + storyboard; narrative
   saved to `stories/aurora-bank-story.md`.
3. **Stage 2.** Normalize the produced storyboard → `demos/aurora-bank-storyboard.md`; validate.
   🚦 **storyboard approval**.
4. **Stage 3.** Brand as above.
5. **Stage 4.** Batched build, 🚦 **per-batch approval** between batches.
6. **Stage 5.** Final deck + handoffs.

Because Aurora Bank is a **customer journey** story, narrative scenes show **no Adobe product
UI** — Adobe appears only via the consultant-facing profile/orchestration panel (no product
names). A **marketer** story routes those steps to the ADOBE-UI track (CX Enterprise app shell,
products named, story numbers matched). See `routing.md`.

---

## 6. Troubleshooting
- **It paused on the fast path** → a required field was missing (likely exact on-screen copy or
  an image source). That validation stop is intentional and not skippable. Provide the field.
- **Long-context crash mid-build** → batches too big; keep ≤5 scenes.
- **Broken images on deploy** → deploy the folder `./demos/<slug>/`, not the single file;
  ensure assets were copied into the demo folder.
- **Letterboxed/black screenshots** → capture at 768×432 (1920÷2.5 dpr trick).
- **Adobe UI in a journey deck** → routing violation; the scene's `UI / Product Visibility` was
  misread — must be customer-app or the name-free orchestration panel.
- **No `experience-story-writer` installed** → fine; bring any storyboard, Figma rebrand, or brief.
