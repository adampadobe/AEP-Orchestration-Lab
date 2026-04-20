# BrandScrape Studio v2 -- Product Requirements Document

**Version:** 2.0
**Date:** March 27, 2026
**Status:** In Development

---

## 1. Executive Summary

BrandScrape Studio v2 is a local-first, browser-based brand intelligence tool that extracts brand assets, generates brand guidelines, detects active marketing campaigns, creates customer personas, and recommends Adobe Real-Time CDP audience segments -- all from a single URL input.

It is rebuilt from scratch as a Python/Flask application with open-source scraping, configurable AI providers, and a clean HTML/CSS/JS frontend -- replacing the original Lovable/Supabase/React stack.

Designed for Adobe solution consultants and pre-sales teams who need to rapidly prepare brand-specific demo environments for customer presentations.

---

## 2. Problem Statement

Preparing a branded demo for an Adobe Experience Platform (AEP) or Real-Time CDP presentation is time-consuming:

- Manually downloading logos, images, and favicons from client websites
- Reverse-engineering brand tone of voice and editorial guidelines
- Identifying current marketing campaigns and promotions
- Designing relevant audience segments that match the client's vertical and campaigns
- Creating realistic customer personas for demo scenarios
- Formatting all of this into reusable documents

BrandScrape Studio automates all of the above in minutes, providing consultants with ready-to-use brand packages, demo-ready audience segment recommendations, and AI-generated customer personas.

---

## 3. Product Vision & Goals

| Goal | Description |
|------|-------------|
| **Speed** | Reduce brand research time from hours to under 5 minutes |
| **Completeness** | Extract assets, guidelines, campaigns, personas, and audiences in one pass |
| **Demo-Ready** | Output is immediately usable in Adobe Real-Time CDP demos |
| **Downloadable** | All outputs exportable as ZIP, DOC, CSV, JSON |
| **Reusable** | Projects are saved locally and can be revisited or re-exported |
| **Self-Contained** | Runs locally with no cloud dependencies (except AI API) |
| **Configurable** | Supports multiple AI providers; image limits per category |

---

## 4. Target Users

### Persona 1: Adobe Solution Consultant
- **Role:** Pre-sales / demo engineer at Adobe or partner
- **Need:** Quickly build branded demo environments for customer meetings
- **Pain Point:** Spends 2-4 hours per customer gathering brand materials manually

### Persona 2: Digital Marketing Strategist
- **Role:** Agency or in-house marketer
- **Need:** Competitive brand intelligence and campaign analysis
- **Pain Point:** No automated tool to extract comprehensive brand data from a URL

### Persona 3: Demo Engineer
- **Role:** Builds AEP/Real-Time CDP demo scenarios
- **Need:** Realistic audience segments labeled with correct evaluation types (edge, streaming, batch)
- **Pain Point:** Creating believable demo segments requires deep CDP knowledge

---

## 5. Architecture Overview

```
+--------------------------------------------------+
|             Browser (HTML/CSS/JS)                 |
|       Jinja2 templates + vanilla JavaScript       |
+---------------------------+----------------------+
                            | HTTP / SSE
                            v
+--------------------------------------------------+
|              Flask Server (Python)                |
|                                                   |
|  +----------------+  +-------------------------+  |
|  | SQLite DB      |  | Background Workers      |  |
|  | (projects,     |  |  - Crawler Engine       |  |
|  |  assets)       |  |  - Asset Extractor      |  |
|  +----------------+  |  - AI Analysis Pipeline |  |
|                       +------------+------------+  |
+----------------------------+-------+--------------+
                             |       |
              +--------------+       +----------------+
              v                                       v
+---------------------------+     +---------------------------+
| Target Brand Websites     |     | AI Provider               |
| (requests + Playwright)   |     | (OpenAI / Anthropic /     |
|                           |     |  Gemini / Ollama)         |
+---------------------------+     +---------------------------+
```

### Key Architecture Decisions

1. **Flask + Jinja2** -- server-rendered HTML templates, minimal JS for interactivity
2. **SQLite** -- zero-config database, stored locally in `data/brandscrape.db`
3. **Local file system** -- assets stored under `data/projects/{project_id}/`
4. **SSE (Server-Sent Events)** -- real-time progress updates during analysis
5. **Threading** -- analysis pipeline runs in background thread to keep UI responsive
6. **Configurable AI** -- factory pattern supporting OpenAI, Anthropic, Gemini, Ollama

---

## 6. Feature Specifications

### 6.1 Landing Page & URL Input

| Field | Detail |
|-------|--------|
| **Route** | `GET /` |
| **Template** | `index.html` |
| **Behavior** | User enters a brand URL, submits form, redirected to analysis page |
| **Validation** | Accepts URLs with or without `https://` prefix |

Feature cards highlight six capabilities:
1. Asset Extraction (logos, images, colors, fonts)
2. Brand Guidelines (AI-generated tone, values, editorial rules)
3. Campaign Detection (promotions, seasonal, product launches)
4. Customer Personas (AI-generated target customer profiles)
5. Audience Segments (Adobe Real-Time CDP segments)
6. Export Package (ZIP with everything organized)

### 6.2 Website Crawling & Discovery

| Field | Detail |
|-------|--------|
| **Module** | `scraper/crawler.py` |
| **Dependencies** | `requests`, `beautifulsoup4`, `playwright` |
| **No API Key Required** | Open-source scraping |

**Crawl Process:**

1. **Sitemap Discovery** -- check `robots.txt` and `sitemap.xml` for URL lists
2. **Subdomain Detection** -- parse discovered links for subdomains; probe common subdomains (www, shop, blog, media, cdn, store)
3. **BFS Crawl** -- breadth-first crawl from homepage, following internal links up to configurable depth (default: 3 levels, max 30 pages)
4. **Priority Filtering** -- prioritize key pages: homepage, about, products, services, campaigns, press, news, blog, media, gallery, contact
5. **Smart Scraping** -- try `requests` first (fast); fall back to `playwright` for JS-heavy pages (detects if content is thin)
6. **Respectful Crawling** -- honor `robots.txt`, 1-second delay between requests, proper User-Agent header

**Output:** Brand name, page content (text), all discovered asset URLs, colors, fonts, internal links, pages scanned count.

### 6.3 Asset Extraction & Categorization

| Field | Detail |
|-------|--------|
| **Module** | `scraper/extractor.py`, `scraper/classifier.py` |
| **Asset Categories** | `logo`, `favicon`, `icon`, `banner`, `product_image`, `hero_image`, `other` |

**Extraction from HTML:**
- `<img>` tags (src, srcset, data-src for lazy-loaded)
- CSS `background-image: url()` patterns
- `<link rel="icon">` and `<link rel="apple-touch-icon">` for favicons
- Open Graph images (`<meta property="og:image">`)
- `@font-face` declarations for fonts
- Inline styles and `<style>` blocks for colors
- `<meta name="theme-color">` for brand colors

**AI-Assisted Classification:**
- Images are classified by the AI provider into categories based on URL patterns, dimensions, and page context
- User can override classifications in the UI

**Image Limit Controls:**
- Per-category limits configurable before or after scraping
- Default limits: logos (10), favicons (5), icons (20), banners (10), product images (20), hero images (10), other (30)
- User can adjust limits via the UI

### 6.4 Brand Voice Analysis

| Field | Detail |
|-------|--------|
| **Module** | `ai/brand_analysis.py` |
| **Input** | Brand name + page content (truncated to 15,000 chars) + URL |

**Generated Guidelines Structure:**

| Section | Count | Fields |
|---------|-------|--------|
| About | 1 | 2-3 sentence brand description |
| Tone of Voice | 5-8 | `rule` + optional `example` |
| Brand Values | 3-5 | `value` name + `description` |
| Editorial Guidelines | 5-8 | `rule` + optional `example` |
| Image Guidelines | 4-6 | `rule` + optional `example` |
| Channel Guidelines | 3-4 | `channel` (Email/SMS/Push/In-App) + `subjectLine`, `preheader`, `headline`, `body`, `cta` |

### 6.5 Campaign Detection & Recommendations

| Field | Detail |
|-------|--------|
| **Module** | `ai/campaign_analysis.py` |
| **Input** | Brand name + page content (12,000 chars) + URL + discovered links |

**Detected Campaign Types:**
- Seasonal Campaign (Christmas, Easter, Summer)
- Product Launch
- Promotion / Weekly Deals
- Service Promotion
- Core Brand Platform

**Campaign Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Auto-generated UUID |
| `name` | string | Campaign name |
| `type` | string | Campaign type classification |
| `summary` | string | 2-3 sentence description |
| `headlines` | list[str] | Detected or suggested headlines |
| `cta` | string | Call-to-action text |
| `time_context` | string | e.g., "Christmas 2026", "Limited Time" |
| `season` | string | Seasonal label |
| `channel` | string | Distribution channel |
| `images` | list[str] | Associated image URLs |
| `source_urls` | list[str] | Where campaign was detected |
| `is_recommendation` | bool | True if AI-suggested, False if detected on site |

**New in v2:** The AI also suggests 3-5 demo campaigns that would be relevant for the brand, marked with `is_recommendation=True`.

### 6.6 Customer Persona Generation (NEW)

| Field | Detail |
|-------|--------|
| **Module** | `ai/persona_generation.py` |
| **Input** | Brand name + page content + detected campaigns + URL |
| **Output** | 5 customer personas |

**Persona Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Auto-generated UUID |
| `name` | string | Fictional customer name |
| `age` | int | Age |
| `location` | string | City / region |
| `occupation` | string | Job title |
| `income_range` | string | e.g., "$60K-$80K" |
| `bio` | string | 2-3 sentence background |
| `goals` | list[str] | What they want to achieve |
| `pain_points` | list[str] | Challenges they face |
| `behaviors` | list[str] | Online/shopping behaviors |
| `preferred_channels` | list[str] | Email, SMS, Push, Social, etc. |
| `brand_affinity` | string | Why they connect with this brand |
| `suggested_segments` | list[str] | Which audience segments they belong to |

### 6.7 Adobe Real-Time CDP Audience Segments

| Field | Detail |
|-------|--------|
| **Module** | `ai/segment_generation.py` |
| **Input** | Brand name + page content + campaign summaries + personas |
| **Output** | 8-12 audience segments |

**Segment Evaluation Types (Adobe Real-Time CDP):**

| Type | Description | Use Case |
|------|-------------|----------|
| `edge` | Instantaneous, on the Edge Network | Same-page personalization, next-best-action |
| `streaming` | Near real-time, within minutes | Event-driven triggers, recent behaviors |
| `batch` | Evaluated every 24 hours | Historical patterns, complex calculations, LTV |

**Segment Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique segment identifier |
| `name` | string | Human-readable segment name |
| `description` | string | Detailed audience description |
| `evaluation_type` | `edge` / `streaming` / `batch` | Adobe CDP evaluation type |
| `criteria` | list[str] | Segment qualification rules |
| `estimated_size` | string | Estimated audience percentage |
| `suggested_campaigns` | list[str] | Linked campaign names |
| `use_cases` | list[str] | Demo scenario suggestions |

### 6.8 Export & Downloads

| Export | Format | Description |
|--------|--------|-------------|
| Brand Assets | ZIP | Organized by category folders |
| Brand Guidelines | DOC (HTML-based) | Formatted brand guidelines document |
| Campaigns | CSV | Tabular campaign data |
| Campaigns | JSON | Structured campaign data |
| Personas | DOC (HTML-based) | Formatted persona cards |
| Audience Segments | CSV | Segment data with evaluation types |
| Full Analysis | ZIP | Everything bundled |

**Asset ZIP Structure:**
```
{brand_name}-assets/
  logos/
  favicons/
  icons/
  banners/
  product_images/
  hero_images/
  other_images/
  failed-downloads.txt (if any)
```

**Full Analysis ZIP Structure:**
```
{brand_name}-brand-package/
  brand-guidelines.html
  campaigns.json
  campaigns.html
  personas.json
  personas.html
  segments.json
  segments.html
  brand-info.json (colors, fonts, metadata)
  assets/
    (organized by category)
```

### 6.9 Project Management

| Field | Detail |
|-------|--------|
| **Route** | `GET /projects` |
| **Storage** | SQLite `projects` + `assets` tables |

**Features:**
- List all saved analyses with brand name, URL, status, timestamp
- Click to re-open analysis results
- Delete projects (removes DB records + asset files)
- Favicon display from extracted assets

---

## 7. Tech Stack

### Backend
| Technology | Purpose |
|-----------|---------|
| Python 3.11+ | Runtime |
| Flask | Web framework + Jinja2 templates |
| SQLite | Local database |
| requests | HTTP client for scraping |
| BeautifulSoup4 + lxml | HTML parsing |
| Playwright | JS-rendered page scraping |
| Pillow | Image processing |
| cssutils | CSS parsing |

### Frontend
| Technology | Purpose |
|-----------|---------|
| HTML5 | Structure (Jinja2 templates) |
| CSS3 | Custom design system (no framework) |
| Vanilla JavaScript | Interactivity (fetch, SSE, DOM manipulation) |

### AI Providers (Configurable)
| Provider | Library | Notes |
|---------|---------|-------|
| OpenAI | `openai` | GPT-4o, GPT-4o-mini |
| Anthropic | `anthropic` | Claude 3.5 Sonnet, Claude 3 Haiku |
| Google Gemini | `openai` (compatible endpoint) | Gemini Pro, Gemini Flash |
| Ollama | `openai` (compatible endpoint) | Local models, no API key |

---

## 8. Data Model

### SQLite Schema

```sql
CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    brand_name TEXT NOT NULL,
    url TEXT NOT NULL,
    status TEXT DEFAULT 'analyzing',
    favicon_path TEXT,
    pages_scanned INTEGER DEFAULT 0,
    total_urls INTEGER DEFAULT 0,
    analysis_data TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE assets (
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    category TEXT NOT NULL,
    original_url TEXT,
    local_path TEXT,
    format TEXT,
    width INTEGER,
    height INTEGER,
    file_size INTEGER,
    source_page TEXT,
    selected BOOLEAN DEFAULT 1
);
```

---

## 9. Analysis Pipeline (6 Steps)

```
Step 1: Crawl & Discover
  -- Sitemap + BFS crawl, subdomain detection
       |
Step 2: Extract Assets
  -- Images, fonts, colors from all scraped pages
       |
Step 3: Analyze Brand Voice
  -- AI generates brand guidelines JSON
       |
Step 4: Detect & Recommend Campaigns
  -- AI identifies current campaigns + suggests demo campaigns
       |
Step 5: Generate Customer Personas
  -- AI creates 5 customer personas
       |
Step 6: Suggest Audience Segments
  -- AI generates 8-12 CDP segments with evaluation types
       |
  Analysis Complete -> Save to database
```

Each step reports progress via Server-Sent Events (SSE).

---

## 10. UI/UX Design

### Design Principles
- Light, clean, professional theme
- Desktop-first, functional on tablet
- Minimal JavaScript, maximum server rendering
- Progressive disclosure (tabs for result categories)

### Route Structure
| Route | Page | Description |
|-------|------|-------------|
| `GET /` | Landing | URL input + feature cards |
| `POST /analyze` | Analyze | Start analysis, redirect to progress |
| `GET /analyze/<id>/progress` | Progress | SSE-driven step progress |
| `GET /project/<id>` | Dashboard | Tabbed results view |
| `GET /projects` | History | Saved projects list |

### Results Dashboard Tabs
| Tab | Content |
|-----|---------|
| Assets | Categorized image grid, color swatches, font list |
| Guidelines | AI-generated brand voice & editorial guidelines |
| Campaigns | Detected + recommended campaigns |
| Personas | 5 customer persona cards |
| Audiences | CDP segments with evaluation type badges |
| Export | Download buttons for all formats |

---

## 11. Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| **Analysis Time** | < 3 minutes for most websites |
| **Max Pages Crawled** | 30 pages per analysis (configurable) |
| **Crawl Delay** | 1 second between requests |
| **AI Context Window** | 10,000-15,000 chars per call |
| **Asset Deduplication** | By URL |
| **Image Download Timeout** | 30 seconds per image |
| **Browser Support** | Modern browsers (Chrome, Firefox, Safari, Edge) |
| **Responsive** | Desktop-first, functional on tablet |

---

## 12. Configuration

All configuration via `.env` file:

```
# AI Provider (openai | anthropic | gemini | ollama)
AI_PROVIDER=openai
AI_API_KEY=sk-...
AI_MODEL=gpt-4o

# Ollama-specific (only if AI_PROVIDER=ollama)
OLLAMA_HOST=http://localhost:11434

# Crawl Settings
MAX_PAGES=30
CRAWL_DELAY=1.0
REQUEST_TIMEOUT=30

# Image Limits (defaults, user can override in UI)
LIMIT_LOGOS=10
LIMIT_FAVICONS=5
LIMIT_ICONS=20
LIMIT_BANNERS=10
LIMIT_PRODUCT_IMAGES=20
LIMIT_HERO_IMAGES=10
LIMIT_OTHER_IMAGES=30

# Flask
FLASK_SECRET_KEY=change-me-in-production
FLASK_DEBUG=true
```

---

## 13. Known Limitations & Risks

| # | Limitation | Impact | Mitigation |
|---|-----------|--------|------------|
| 1 | Some JS-heavy sites need Playwright | Slower crawling | Auto-detect thin content, fallback to Playwright |
| 2 | AI may hallucinate campaigns | Inaccurate data | Low temperature (0.3), content-based prompts |
| 3 | robots.txt may block crawling | Incomplete data | Respect robots.txt, inform user |
| 4 | 30-page crawl limit | May miss deeply nested content | Priority-based URL filtering |
| 5 | No authentication | Anyone on local network can access | Local-only by default (127.0.0.1) |
| 6 | Large content truncation for AI | May miss important content | Prioritize homepage + key pages |
| 7 | Image classification accuracy | Miscategorized images | User can override in UI |

---

## 14. Future Roadmap

| Priority | Feature | Description |
|----------|---------|-------------|
| High | User Authentication | Login/signup for multi-user deployments |
| High | Improved Image Classification | Train a local model for better accuracy |
| Medium | Real DOCX Export | Use python-docx for proper Word documents |
| Medium | Audience Segment Editor | Manual editing of AI-generated segments |
| Medium | AEP Schema Export | Export segments in Adobe XDM-compatible schema |
| Low | Multi-language Support | Analyze and generate guidelines in multiple languages |
| Low | Comparison Mode | Side-by-side brand comparison |
| Low | PDF Export | Full brand book as styled PDF |
| Low | Team Sharing | Share projects across team members |

---

## Appendix: File Structure

```
brandscrape-studio/
  app.py                            # Flask entry point
  config.py                         # Configuration loader
  requirements.txt                  # Python dependencies
  .env.example                      # Environment template
  README.md                         # Setup & usage
  data/
    brandscrape.db                  # SQLite database (auto-created)
    projects/                       # Per-project asset folders
      {project_id}/
        logos/
        favicons/
        icons/
        banners/
        product_images/
        hero_images/
        other_images/
  scraper/
    __init__.py
    crawler.py                      # URL discovery + subdomain detection
    extractor.py                    # Asset, font, color extraction
    classifier.py                   # AI-assisted image categorization
    downloader.py                   # Asset download with limits
  ai/
    __init__.py
    provider.py                     # Unified AI interface
    prompts.py                      # All AI prompt templates
    brand_analysis.py               # Brand voice + guidelines
    campaign_analysis.py            # Campaign detection + recommendations
    persona_generation.py           # Customer persona creation
    segment_generation.py           # Audience segment suggestions
  templates/
    base.html                       # Base layout with nav
    index.html                      # Landing page
    analysis.html                   # Analysis progress (SSE)
    project.html                    # Results dashboard (tabbed)
    projects.html                   # Saved projects list
    partials/
      assets_tab.html
      guidelines_tab.html
      campaigns_tab.html
      personas_tab.html
      audiences_tab.html
      export_tab.html
  static/
    css/
      style.css                     # Custom design system
    js/
      analysis.js                   # SSE progress listener
      project.js                    # Tab switching, image controls
      export.js                     # Download triggers
  utils/
    __init__.py
    db.py                           # SQLite helpers
    export.py                       # ZIP, CSV, JSON, DOC generation
    helpers.py                      # URL normalization, dedup, etc.
```
