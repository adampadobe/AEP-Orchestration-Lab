# SCAFFOLD.md — Migration Blueprint

## Overview

Split `current-artifact.jsx` (single 1100+ line React file) into a Vite + React project with CSS Modules. Every component, data file, and style gets its own file. The source of truth for what works is `current-artifact.jsx` — don't reinvent, extract.

---

## 1. Project Init

```bash
npm create vite@latest . -- --template react
npm install lucide-react
```

Delete the default `src/App.css`, `src/index.css`, `src/assets/` boilerplate.

---

## 2. Target File Structure

```
src/
  App.jsx                    # Root: state for step, industry, fadeKey. Renders Shell + current Step
  App.module.css             # Minimal root styles (font import, global resets)
  
  theme.js                   # Color tokens (T object), font constants (FONT_SERIF, FONT_SANS, FONT_MONO)
  
  components/
    Shell/
      Shell.jsx              # Header (logo, nav tabs, industry dropdown, progress bar) + Footer (back/next)
      Shell.module.css
    
    ui/
      Badge.jsx + Badge.module.css
      Card.jsx + Card.module.css
      Pill.jsx + Pill.module.css
      Tip.jsx + Tip.module.css
      Label.jsx              # No CSS needed — inline mono style
      Title.jsx              # No CSS needed — inline serif style
      Desc.jsx               # No CSS needed — inline sans style
      index.js               # Barrel export: export { Badge } from './Badge' etc.
    
    steps/
      IntroStep.jsx + IntroStep.module.css
      SchemaStep.jsx + SchemaStep.module.css
      ItemsStep.jsx + ItemsStep.module.css
      CollectionsStep.jsx + CollectionsStep.module.css
      RulesStep.jsx + RulesStep.module.css
      RankingStep.jsx + RankingStep.module.css
      StrategyStep.jsx + StrategyStep.module.css
      PolicyStep.jsx + PolicyStep.module.css
      ResultStep.jsx + ResultStep.module.css
  
  data/
    offers.js                # OFFERS array (10 items)
    collections.js           # COLLECTIONS array (5 items)
    profiles.js              # PROFILES array (3 items) + RESULTS object
    schema.js                # SCHEMA_TREE array
    rules.js                 # DECISION_RULES array + RULE_RATES array + AUDIENCES array
    rankings.js              # RANKING_METHODS array
    industries.js            # INDUSTRIES array (for dropdown)
    steps.js                 # STEPS array [{id, short}]

public/
  logo.svg                   # Adobe logo SVG (from current inline Logo component)
  images/
    offers/                  # Future: local offer images to replace Unsplash CDN
```

---

## 3. Extraction Map

### theme.js
Extract from current file:
- `FONT_SERIF`, `FONT_SANS`, `FONT_MONO` constants
- `T` object (all color tokens)
- Export both as named exports

Also export CSS custom properties string for use in App.module.css:
```js
export const cssVars = `
  :root {
    --bg: #FAF9F7;
    --surface: #FFFFFF;
    --surface-alt: #F5F3EF;
    --text: #1B1B1B;
    --text-muted: #807872;
    --accent: #EB1000;
    --border: #E8E4DF;
    --green: #2D9D78;
    --blue: #2680EB;
    --gold: #E68619;
    --font-serif: 'Source Serif 4', Georgia, serif;
    --font-sans: 'DM Sans', 'Helvetica Neue', sans-serif;
    --font-mono: 'DM Mono', Consolas, monospace;
  }
`;
```

### data/*.js
Each data file exports a single array or object. Copy directly from the current `const` declarations:
- `offers.js` → `export const OFFERS = [...]` (lines 32-42)
- `collections.js` → `export const COLLECTIONS = [...]` (lines 44-50)
- `profiles.js` → `export const PROFILES = [...]` and `export const RESULTS = {...}` (lines 52-80)
- `schema.js` → `export const SCHEMA_TREE = [...]` (lines 82-115)
- `rules.js` → `export const DECISION_RULES = [...]`, `export const RULE_RATES = [...]`, `export const AUDIENCES = [...]`
- `rankings.js` → `export const RANKING_METHODS = [...]`
- `industries.js` → `export const INDUSTRIES = [...]`
- `steps.js` → `export const STEPS = [...]`

**Important:** Lucide icon imports must stay in the data files since icons are React components. Each data file imports only the icons it needs.

### components/ui/*.jsx
Each shared component becomes its own file. Extract from current code:
- `Badge` (lines ~145-149)
- `Card` (lines ~151-162) — uses useState for hover
- `Pill` (lines ~173-177)
- `Tip` (lines ~178-184)
- `Label`, `Title`, `Desc` — simple span/h1/p wrappers

CSS Module pattern for each:
```jsx
// Badge.jsx
import styles from './Badge.module.css';
export const Badge = ({ children, color = 'var(--accent)' }) => (
  <span className={styles.badge} style={{ background: color + '12', color, borderColor: color + '22' }}>
    {children}
  </span>
);
```
```css
/* Badge.module.css */
.badge {
  display: inline-block;
  padding: 2px 9px;
  border-radius: 20px;
  font-size: 10px;
  font-family: var(--font-sans);
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  border: 1px solid;
  white-space: nowrap;
}
```

Dynamic colors stay as inline `style` props. Static layout/typography goes in the CSS module. This is the pattern for all components.

### components/steps/*.jsx
Each step is a self-contained component. Extract the corresponding function from current code:
- `IntroStep` → lines ~186-213
- `SchemaStep` → lines ~215-357 (largest — includes TreeNode sub-component)
- `ItemsStep` → lines ~359-490
- `CollectionsStep` → lines ~492-522
- `RulesStep` → lines ~524-658
- `RankingStep` → lines ~660-810
- `StrategyStep` → lines ~812-900
- `PolicyStep` → lines ~902-950
- `ResultStep` → lines ~952-1000

Each step imports from `../../data/`, `../../theme`, and `../ui/`.

### components/Shell/Shell.jsx
Extract the header, footer, progress bar, industry dropdown from the App shell (bottom ~100 lines of current file). Shell receives props: `step`, `goToStep`, `industry`, `setIndustry`, `showIndustry`, `setShowIndustry`.

### App.jsx
Minimal — holds global state (`step`, `fadeKey`, `industry`, `showIndustry`), renders `<Shell>` + `<CurrentStep />`. The step component map stays here.

---

## 4. CSS Module Conventions

### What goes in CSS modules (static):
- Layout (display, grid, flex, gap, padding, margin)
- Typography (font-family using CSS vars, font-size, font-weight, letter-spacing)
- Border-radius, borders using CSS vars
- Transitions and animations
- Hover states via `:hover` pseudo-class (replaces onMouseEnter/onMouseLeave where possible)

### What stays as inline styles (dynamic):
- Colors that depend on props (offer.color, active state colors)
- Conditional transforms (ranking item position)
- Dynamic widths (progress bars, people grid eligibility)

### CSS variable usage:
```css
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px;
  transition: all 0.25s ease;
}
.card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.07);
}
```

---

## 5. Key Behaviors to Preserve

1. **Schema toggle → preview build-up**: Three quick-action pills (Reset, Enable Custom, Enable All). Four preview widgets (Offer, Standard Attributes, Navigation & Delivery, Metadata).

2. **Channel previews**: 6 channels with distinct preview renderings (Email/Web/App/Push/SMS/Code). Offers fade when channel unsupported.

3. **People grid**: 30 User icons, percentage multiplication of rule rates, staggered transition delay (i × 15ms), green = eligible from left.

4. **Ranking animation**: Absolute positioning with `transform: translateY(index * 40px)`, springy cubic-bezier, colored left borders, z-index on winner.

5. **Strategy: Rules vs Audiences**: Two-pill toggle in eligibility column switches between DECISION_RULES and AUDIENCES arrays.

6. **Step navigation**: Header tabs (clickable), footer Back/Next, progress bar, fade-in animation on step change, scroll-to-top.

7. **Industry dropdown**: Top-right, currently only Retail has data.

---

## 6. Migration Checklist

- [ ] `npm create vite@latest . -- --template react`
- [ ] `npm install lucide-react`
- [ ] Create `theme.js` with tokens + CSS vars
- [ ] Create all `data/*.js` files
- [ ] Create `components/ui/` components with CSS modules
- [ ] Create each `components/steps/` component with CSS modules
- [ ] Create `Shell.jsx` with header/footer
- [ ] Create `App.jsx` wiring everything together
- [ ] Add Google Fonts `@import` to `App.module.css`
- [ ] Add `logo.svg` to `public/`
- [ ] Run `npm run dev` and fix any import issues
- [ ] Test all 9 steps for interactivity
- [ ] Replace Unsplash URLs with local images in `public/images/offers/`
