# Experience Decisioning Interactive Tutorial — PRD

**Version:** 2.0  
**Author:** Alexander Mittermaier, Senior Solution Consultant, Adobe  
**Target Stack:** Vite + React, CSS Modules, Lucide React icons  
**Audience:** Marketing/business users seeing Experience Decisioning for the first time  
**Industry:** Retail (v1), with dropdown scaffold for Automotive, Travel, B2B Manufacturing, Insurance

---

## 1. Purpose

Adobe Journey Optimizer's Experience Decisioning is powerful but abstract. This interactive tutorial makes the full pipeline tangible — 9 steps, all clickable, from schema to ranked results. No backend required (static hosting).

**Goal:** A customer who completes all steps can explain the decisioning pipeline back to their own team.

---

## 2. Step Flow (9 screens)

| # | ID | Title | Core Interaction |
|---|-----|-------|-----------------|
| 0 | intro | Welcome | 3 story widgets (10 offers → engine → 1 winner), AJO module label |
| 1 | schema | Offer Schema | Toggle XDM field checkboxes → live offer preview builds up (visual card + metadata + navigation widgets) |
| 2 | items | Decision Items | 10 offer cards, 6 channel toggles (Email/Web/App/Push/SMS/Code) with device-specific previews |
| 3 | collections | Collections | 5 collection pills with attribute filter rules, 10 offers show match/no-match |
| 4 | rules | Decision Rules | 4 toggleable rules, people grid (30 icons) shrinks with percentage math, 3 profile cards with pass/fail |
| 5 | ranking | Ranking Methods | 3 methods (Priority/Formula/AI), sliders, animated swap ranking list, priority vs schema explainer |
| 6 | strategy | Selection Strategy | 3-column picker (Collection + Eligibility + Ranking), Rules vs Audiences toggle |
| 7 | policy | Decision Policy | Strategy sequence builder, items-to-return selector (1-5), fallback, channel list |
| 8 | result | The Engine Decides | 3 profiles, top 5 ranked offers per profile with reasoning, light card design |

---

## 3. Design System

### Colors
| Token | Hex | Usage |
|-------|-----|-------|
| bg | #FAF9F7 | Page background |
| sf (surface) | #FFFFFF | Card backgrounds |
| sa (surface alt) | #F5F3EF | Secondary backgrounds, tips |
| sw (surface warm) | #FBF8F4 | Metadata preview card |
| tx (text) | #1B1B1B | Primary text |
| tm (text muted) | #807872 | Secondary text |
| ac (accent) | #EB1000 | Adobe red — progress bar, active states |
| as (accent soft) | #FFF0EE | Light red backgrounds |
| bd (border) | #E8E4DF | Borders, dividers |
| gn (green) | #2D9D78 | Success, match, eligible, winner |
| bl (blue) | #2680EB | Profiles, standard schema fields |
| gl (gold) | #E68619 | Eligibility column, formula values |
| pu (purple) | #7C5CFC | Specific offer accent |
| pv (preview) | #F9F6F1 | Offer preview card bg |
| pb (preview border) | #EDE8E0 | Preview card border |

Each of the 10 offers has a unique color.

### Typography
| Role | Font | Size |
|------|------|------|
| Display / titles | Source Serif 4, 700 | clamp(24px, 3.5vw, 36px) |
| Body / UI | DM Sans, 400-600 | 10-16px |
| Code / labels | DM Mono, 400-500 | 8-13px |
| Step labels | DM Mono, uppercase | 10px, 0.1em spacing |

Loaded via Google Fonts `@import`.

### Shared Components
- **Badge** — pill label, 8px border-radius, color-tinted bg, uppercase
- **Card** — 12px radius, 20px padding, hover lift variant
- **Pill** — toggle button, 8px radius, active = color tint + border
- **Tip** — gray bg callout box with optional bold title
- **Label** — monospace uppercase section header
- **Title** — serif h1
- **Desc** — sans-serif intro paragraph

### Icons
All from `lucide-react@0.383.0`. No emoji anywhere. Key icons: Truck, Award, CreditCard, BadgePercent, Gift, Headphones, Shirt, Watch, Sofa, Utensils, Crown, ShoppingCart, Monitor, RefreshCw, Brain, SlidersHorizontal, BarChart3, User, Mail, Laptop, Smartphone, Bell, MessageSquare, Code.

---

## 4. Data (Retail)

### 10 Offers
| # | Name | Type | Priority | Margin | Category | Channels |
|---|------|------|----------|--------|----------|----------|
| 1 | Free Express Delivery | Loyalty | 100 | High | All | web, app, code |
| 2 | 3× Loyalty Points Weekend | Loyalty | 85 | Medium | All | web, app, email, sms |
| 3 | 0% BNPL on Electronics | BNPL | 55 | Low | Electronics | web |
| 4 | 20% Off Running Shoes | Discount | 70 | Medium | Footwear | email, web, app, push, code |
| 5 | Back-to-School Bundle | Bundle | 40 | Low | Stationery | web, email, sms |
| 6 | Premium Headphones €30 Off | Discount | 65 | High | Electronics | web, app, code |
| 7 | New Collection Preview | Exclusive | 50 | Medium | Fashion | app, push |
| 8 | Smart Watch Trade-In | Trade-In | 45 | High | Electronics | web, app, code |
| 9 | Home — Free Assembly | Service | 35 | Low | Home | web, email, sms |
| 10 | Grocery Flash Sale — 15% Off | Discount | 75 | Medium | Grocery | email, app, push, sms |

Each has: unique color, Lucide icon, Unsplash image URL, description.

### 5 Collections
| Name | Rule | Matching Item IDs |
|------|------|--------------------|
| High-Margin Offers | margin = "High" | 1, 6, 8 |
| Loyalty Rewards | type IN ("Loyalty","Exclusive") | 1, 2, 7 |
| Electronics Deals | category = "Electronics" | 3, 6, 8 |
| Discount & Bundles | type IN ("Discount","Bundle") | 4, 5, 6, 10 |
| All Active Offers | endDate > now() | 1-10 |

### 3 Profiles
| Name | Tier | Cart | Purchases | Browses |
|------|------|------|-----------|---------|
| Jordan, 34 | Platinum | €120 | 8 | Electronics |
| Riley, 27 | None | €35 | 1 | Fashion |
| The Parkers | Silver | €95 | 12 | Stationery, Grocery |

### 4 Decision Rules
| Rule | Source | Pass-through |
|------|--------|-------------|
| VIP Customers Only | Profile | ~20% |
| Cart Value > €80 | Context | ~50% |
| Category Browsers | Event | ~70% |
| Repeat Purchasers | Computed | ~40% |

### 3 Audiences (Strategy step)
High-Value Shoppers (LTV > €500), Newsletter Subscribers (opted-in), Mobile App Users (active 30d).

### Results (5 per profile)
Pre-computed score + reason for each of 3 profiles × 5 ranked offers.

---

## 5. Schema Tree Structure

Three top-level groups (Standard Fields first, then custom):

**Standard Fields** (locked): itemName, priority, startDate, endDate

**Offer Content** (custom):
- Media Assets: heroImage, thumbnail (visual)
- Text Content: title, description, callToAction (visual)
- Navigation: webUrl, deepLink, channelType (nav)
- Promo Elements: promoCode (nav)

**Offer Metadata** (custom):
- contentType, salesStage, journeyStage, targetSegment, category, margin (meta)

Fields tagged `visual` render in the offer preview card. Fields tagged `meta` render in the Metadata widget. Fields tagged `nav` render in the Navigation & Delivery widget. Standard fields render in the Standard Attributes widget.

---

## 6. Channel Previews (Items Step)

6 channel toggles: Email, Web, App, Push, SMS, Code.

| Channel | Preview Style |
|---------|--------------|
| Email | Colored header bar + subject line + serif title + body + CTA button + unsubscribe footer |
| Web | Full-width image + white content card + CTA |
| App | Rounded-corner mobile frame (4px radius) + image + content |
| Push | Dark notification card (#2a2a2a) with app icon, "now" timestamp, title, desc |
| SMS | Dark chat bubble with message text + "Reply STOP" + footer |
| Code | Dark IDE panel (#1e1e1e) with JSON payload showing name, desc, type, priority, cta, imageUrl, surface |

Offers not supporting the selected channel fade to 30% opacity.

---

## 7. Interactive Behaviors

### Schema: field toggle → preview build-up
Checkboxes on each leaf field. Progress bar shows % enabled. Three quick-action pills: Reset, Enable Custom, Enable All.

### Rules: people grid with percentage math
30 User icons in 10×3 grid. Rule pass-through rates multiply: VIP(20%) × Cart(50%) × Browsers(70%) × Repeat(40%). First N icons are green (eligible), rest are gray. Staggered transition delay (i × 15ms) creates wave effect. Profile cards below show pass/fail per active rule.

### Ranking: animated swap list
Items absolutely positioned with `transform: translateY(index × 40px)`. `transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)` creates springy swap. Each item has colored left border for visual identity during swap. Winner gets colored background + shadow + higher z-index.

### Strategy: Rules vs Audiences toggle
Eligibility column has two pills (Rules / Audiences). Switches between 4 decision rules and 3 AEP audience segments.

---

## 8. App Shell

- **Header** (sticky): Adobe SVG logo + "Experience Decisioning" + industry dropdown (top-right) + progress bar (2px red) + step tabs (12.5px font, 10px/16px padding)
- **Content**: max-width 1060px, centered, fade-in animation on step change
- **Footer** (sticky): Back/Next buttons + step counter
- **No red top bar** (removed by design choice)

---

## 9. Technical Constraints

- All state is client-side React (useState). No localStorage.
- Images: Unsplash CDN URLs (won't load in Claude artifacts due to CSP — works in deployed project)
- Fonts: Google Fonts via @import
- Icons: lucide-react only, no emoji
- Industry dropdown: only Retail has data in v1

---

## 10. Future Enhancements

- Full data for all 5 industries
- Local/CDN images replacing Unsplash URLs
- Guided walkthrough mode with tooltip explanations per step
- Formula builder: drag-and-drop composition
- Mobile responsive layout
- Dark mode toggle
- Exportable "your configuration" summary at the end
