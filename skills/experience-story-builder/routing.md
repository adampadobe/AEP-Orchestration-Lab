# Routing reference — customer-vs-marketer, per scene

Read this during Stage 4 (build) to route each storyboard step to the right render track and
scene template. Applies to the **normalized** `demos/<slug>-storyboard.md` regardless of where
the storyboard came from (experience-story-writer, a user-written doc, a Figma rebrand, or a rough
brief). The orchestrator preserves each step's `UI / Product Visibility` field verbatim through
normalization; `vision-experience-builder` enforces these rules scene-by-scene.

## Two decisions

**1. Story-level (set once, from the story type):**
- **Customer Journey** — customer is the hero; Adobe is invisible in the narrative. No Adobe
  product names on any customer-facing screen. Every journey story still includes an
  **Orchestration Layer / Profile Panel** shown to the *consultant* audience: it visualises the
  data layer building (Profile Events accumulating, Segments updating) over time. That panel is
  a data/orchestration aesthetic — **not** Adobe product UI, **no** product names.
- **Marketer** — practitioner uses Adobe explicitly; Adobe product UI is shown, named, inside
  the **Adobe CX Enterprise** surface with app navigation visible.

**2. Scene-level (per step) — read `UI / Product Visibility`, corroborate with data rows:**

| Field signal | Track | Render |
|---|---|---|
| "Brand app UI visible. No Adobe product shown." | **CUSTOMER-APP** | Mock the customer's app/site. Use `assets/<slug>/` brand kit (Brandfetch palette/logo, customer font). No Adobe red/Spectrum chrome, no product names. |
| "Adobe [Product] within Adobe CX Enterprise — … navigation visible." | **ADOBE-UI** | Adobe Spectrum design language (Adobe red `#EB1000`/Spectrum neutrals, Adobe Clean font, left-nav app shell, CX Enterprise top bar). Name products exactly; numbers must match the story. |
| Journey step with **Profile Events / Segments Added** populated | **ORCHESTRATION** (journey sub-track) | Data-layer device: `journey-canvas` / `journey-canvas-editorial` with a real-time profile panel (event + segment slots). Consultant-facing; no product names in a journey story. |

## Hard guardrails
- **Customer Journey deck:** ADOBE-UI track is **forbidden** in narrative scenes. The only
  Adobe-side surface allowed is the ORCHESTRATION profile panel, and it carries **no product
  names**.
- **Marketer deck:** ADOBE-UI scenes name products exactly; never invent numbers — they must
  equal the story's numbers.
- The cover (`cobrand-cover`, `Customer × Adobe`) is the one place both brands co-appear
  regardless of story type — it's the title card, not a narrative scene.

## Storyboard (07 format) → vision-experience-builder field mapping

| Storyboard step field | → builder use |
|---|---|
| STEP TITLE | scene title / `title_line*` / `chapter_title` |
| INTENT (MESSAGE) | sub-head / tagline / persona internal-voice caption |
| ACTION (WHAT) | selects scene behaviour + on-screen content to mock |
| CHANNEL / TOUCHPOINT | **primary template selector** (table below) |
| What Is Shown On Screen | literal content of the mocked UI (chat bubbles, cards, notifications, chart) |
| Primary Focus | visual hierarchy / largest element / `Key Highlight` placement |
| Action On Screen | animation choice from frontend-slides `animation-patterns.md` |
| **UI / Product Visibility** | **track router** (above) |
| Mood / Tone | palette intensity + animation easing/energy |
| Key Highlight | the scene's hero element → KPI badge / callout / focal mock |
| Image Generation Prompt | persona/asset sourcing (VEB Persona Resolution: repo→Stock→Firefly) |
| Profile Events / Segments Added (journey) | `journey-canvas` profile-panel slots |
| Adobe Product / Agent / Business Value (marketer) | product label, agent moment, KPI/value slot |

### Channel / role → scene template (default; `UI / Product Visibility` can override the track)
- Opening / title → `cover-cobrand-lockup` (or `cobrand-hero-persona` if a person belongs on the cover)
- Chapter / section beat → `persona-hero-splash` or `section-title-gradient`
- In-app chat / assistant / push / email → `chat-notification`
- Journey / profile-building / integration map → `journey-canvas-4-stage` / `journey-canvas-editorial`
- AI insight / data reveal (marketer) → `scene-ai-response-with-chart`
- Feature / product overview → `capability-overview`
- "Before" / fragmented-tools beat → `chaos-scattered-ui`

No transform skill is needed — once normalized to the Internal Storyboard Contract, the
storyboard feeds the builder directly via this mapping. The orchestrator's job at Stage 2 is to
**normalize any incoming storyboard into this shape** and persist it to
`demos/<slug>-storyboard.md`, capturing exact on-screen copy verbatim and flagging/filling any
missing required field (never proceeding with a degraded spec).
