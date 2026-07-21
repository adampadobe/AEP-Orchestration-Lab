/**
 * Server-side Brand Scraper offline fallback brief — mirrors web/profile-viewer/brand-scraper-brief.js
 */

const INDUSTRY_TAXONOMY = [
  'Retail & E-commerce', 'Travel & Hospitality', 'Financial services', 'Telecom & Media',
  'Healthcare & Pharma', 'Technology & Software', 'Automotive', 'Education',
  'Government & Non-profit', 'Professional services', 'Real estate', 'Food & beverage',
  'Manufacturing & Industrial', 'Other',
];

export function slugifyBrandBrief(raw) {
  return String(raw || 'brand')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'brand';
}

function normaliseUrl(raw) {
  const v = String(raw || '').trim();
  if (!v) return '';
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

function listRunOptions(opts) {
  const lines = [];
  if (opts.includeAnalysis) lines.push('- Brand guidelines (about, tone, editorial, channel samples)');
  if (opts.includePersonas) lines.push(`- Customer personas (6 × ${opts.country || 'United Kingdom'})`);
  if (opts.includeCampaigns) lines.push('- Campaign detection + recommendations');
  if (opts.includeSegments) lines.push('- Real-Time CDP audience segments');
  if (opts.includeStakeholders) lines.push('- Business stakeholders / leadership');
  if (opts.includeTagAudit) lines.push('- Tag & analytics audit');
  if (opts.includeLlmDemoConfig) lines.push('- Competitor analysis');
  if (opts.includeDemoWebsite) lines.push('- Demo website (site clone from upload)');
  return lines.length ? lines.join('\n') : '- Brand guidelines only (default light pass)';
}

/**
 * @param {object} [opts]
 */
export function generateScrapeBrief(opts = {}) {
  const url = normaliseUrl(opts.url);
  const brand = String(opts.customerName || opts.customer_name || '').trim()
    || slugifyBrandBrief(url).replace(/-/g, ' ');
  const businessType = String(opts.businessType || opts.business_type || 'b2c').toUpperCase();
  const country = String(opts.country || 'United Kingdom');
  const pages = Math.max(1, Math.min(25, Number(opts.pages || opts.max_pages) || 3));
  const generated = new Date().toISOString().slice(0, 10);

  return [
    '# Brand Scraper — offline scrape brief',
    '',
    'Use this brief when the lab **cannot crawl the brand site** (403, bot protection, login wall) or when **LLM analysis keeps failing**. Complete the steps below in an external tool, then **upload the ZIP** via MCP `lab_brand_scrape_upload` (or Portal Brand Scraper → Options → HTML upload).',
    '',
    '---',
    '',
    '## Brand context',
    '',
    '| Field | Value |',
    '| --- | --- |',
    '| **Brand URL** | ' + (url || '_(enter in form)_') + ' |',
    '| **Customer / display name** | ' + brand + ' |',
    '| **Business type** | ' + businessType + ' |',
    '| **Persona country** | ' + country + ' |',
    '| **Target pages** | ' + pages + ' key pages |',
    '| **Brief generated** | ' + generated + ' |',
    '',
    '### AI steps selected in the lab',
    '',
    listRunOptions({
      includeAnalysis: opts.includeAnalysis ?? opts.include_analysis ?? true,
      includePersonas: opts.includePersonas ?? opts.include_personas ?? false,
      includeCampaigns: opts.includeCampaigns ?? opts.include_campaigns ?? true,
      includeSegments: opts.includeSegments ?? opts.include_segments ?? false,
      includeStakeholders: opts.includeStakeholders ?? opts.include_stakeholders ?? false,
      includeTagAudit: opts.includeTagAudit ?? opts.include_tag_audit ?? true,
      includeLlmDemoConfig: opts.includeLlmDemoConfig ?? opts.include_llm_demo_config ?? true,
      includeDemoWebsite: opts.includeDemoWebsite ?? opts.include_demo_website ?? false,
      country,
    }),
    '',
    '---',
    '',
    '## What Brand Scraper ingests',
    '',
    'The upload handler accepts **`.html` / `.htm` files** or a **`.zip` up to 30 MB** (max ~40 files) containing:',
    '',
    '1. **HTML pages** — saved from the live site (homepage, about, products/services, campaigns). At least one valid `.html` file is required.',
    '2. **Asset folders** — relative paths referenced by those HTML files (`css/`, `js/`, `images/`, `_files/`, etc.). Save-page exports from Chrome preserve these automatically.',
    '3. **Optional** — no separate JSON is required for upload; the lab parses HTML and runs the same LLM pipelines as a live crawl.',
    '',
    'From HTML the scraper extracts: page text, titles, meta/OG tags, image URLs, favicon, colour hints, font families, and (when enabled) tag/analytics vendors.',
    '',
    '---',
    '',
    '## Recommended pages to capture',
    '',
    'Save these paths from **' + (url || 'the brand site') + '** (adjust to what exists):',
    '',
    '1. `/` — homepage (hero, nav, primary messaging)',
    '2. `/about` or `/about-us` — brand story, values, leadership',
    '3. `/products`, `/services`, or `/solutions` — offer detail',
    '4. A campaign or promo landing page if visible in nav',
    '5. `/brand` or press/news page if available',
    '',
    'Aim for **' + pages + '–' + Math.min(pages + 2, 8) + ' pages** with real copy — not empty shells.',
    '',
    '---',
    '',
    '## Workflow A — External LLM (recommended)',
    '',
    '1. **Download this brief** from Brand Scraper or call MCP **`lab_brand_scrape_brief`**.',
    '2. Open **ChatGPT, Claude, Gemini, or similar** with browsing / file tools if available.',
    '3. Paste the **LLM task prompt** (next section) and attach any HTML/screenshots you already have.',
    '4. Ask the model to produce a **save-page style folder**, then zip it:',
    '   - Root contains `index.html` (or `Home.html`) plus sibling asset folders.',
    '   - Keep relative `href` / `src` paths intact — do not rewrite to absolute CDN URLs only.',
    '5. Return to MCP **`lab_brand_scrape_upload`** with `zip_base64` or `upload.files[]` (base64).',
    '6. Set **`upload_only:true`** if the site cannot be crawled at all; otherwise **`use_as_fallback:true`** (live crawl tries first).',
    '7. For a **demo site clone**, also set **`include.demoWebsite:true`** — the upload ZIP becomes the clone source.',
    '',
    '---',
    '',
    '## LLM task prompt (copy below)',
    '',
    '```markdown',
    'You are preparing an offline brand scrape bundle for Adobe Experience Platform Brand Scraper.',
    '',
    'Brand: ' + brand,
    'Website: ' + (url || 'UNKNOWN'),
    'Business type: ' + businessType,
    'Persona country: ' + country,
    '',
    '## Your deliverable',
    '',
    'Produce a ZIP-ready folder (or instructions to build one) with:',
    '',
    '1. **HTML files** — save or reconstruct ' + pages + '+ public pages with full text content (homepage, about, products/services).',
    '2. **Assets** — css/, js/, images/ (or browser save-page `_files` folder) with working relative links.',
    '3. **manifest.json** (optional helper for humans) listing:',
    '   - `pages[]`: `{ "file": "index.html", "sourceUrl": "..." }`',
    '   - `assets[]`: relative paths included',
    '   - `brandName`, `baseUrl`',
    '',
    '## Also extract (for human review — lab LLM will regenerate)',
    '',
    '### Brand guidelines JSON shape',
    '```json',
    '{',
    '  "about": "2-3 sentence brand description",',
    '  "tone_of_voice": [{"rule": "...", "example": "..."}],',
    '  "brand_values": [{"value": "...", "description": "..."}],',
    '  "editorial_guidelines": [{"rule": "...", "example": "..."}],',
    '  "image_guidelines": [{"rule": "...", "example": "..."}],',
    '  "channel_guidelines": [{"channel": "Email|SMS|Push|In-App", "subject_line": "...", "preheader": "...", "headline": "...", "body": "...", "cta": "..."}]',
    '}',
    '```',
    '',
    '### Personas (if requested)',
    '6 personas living in ' + country + ', B2C/B2B appropriate, each with name, age, occupation, goals, pain_points, behaviours, preferred_channels.',
    '',
    '### Campaigns',
    '2-5 detected on-site campaigns with evidence URLs + 3-4 recommended demo campaigns.',
    '',
    '### Segments',
    '8-10 RT-CDP segments (edge / streaming / batch) with criteria and estimated_size.',
    '',
    'Industry taxonomy (pick one): ' + INDUSTRY_TAXONOMY.join('; ') + '.',
    '',
    'Do NOT fabricate page content — use only what is visible on the public site or in provided files.',
    '```',
    '',
    '---',
    '',
    '## Workflow B — Manual save (no LLM)',
    '',
    'When LLM tools also fail, collect assets manually:',
    '',
    '### 1. Save HTML pages (Chrome / Edge)',
    '',
    '- Open each target URL in Chrome.',
    '- **File → Save As → Webpage, Complete** (macOS: *Web Archive* or *Page Source* + assets).',
    '- Prefer **Complete** so `BrandName_files/` (or similar) includes CSS, images, fonts.',
    '- Rename clearly: `index.html`, `about.html`, `products.html`.',
    '',
    '### 2. Image & logo collection (Image Eye or similar)',
    '',
    '- Install a **bulk image downloader** extension (e.g. Image Eye — search "image downloader" in Chrome Web Store).',
    '- On homepage and about page, export: **logo** (header SVG/PNG), **hero**, **product shots**, **team headshots**.',
    '- Save into `images/` inside your folder; update HTML `src` if you replace hotlinked URLs.',
    '',
    '### 3. Colours & fonts',
    '',
    '- Use browser DevTools → **Computed** on headings/body to note hex colours and `font-family`.',
    '- Optional: add a `brand-notes.txt` in the ZIP — the lab extracts colours/fonts from CSS when present.',
    '',
    '### 4. Zip and upload',
    '',
    '```',
    'brand-upload.zip',
    '├── index.html',
    '├── about.html',
    '├── index_files/          ← or css/, js/, images/ from save-page',
    '│   ├── style.css',
    '│   └── logo.svg',
    '└── about_files/',
    '```',
    '',
    'Upload via MCP **`lab_brand_scrape_upload`** or Portal **Options → HTML upload**. Max **30 MB**. Then run with **`upload_only:true`** checked.',
    '',
    '---',
    '',
    '## Upload settings in the lab',
    '',
    '| Scenario | Settings |',
    '| --- | --- |',
    '| Site blocks crawler but you have a ZIP | **`use_as_fallback:true`** — live crawl tries first; upload used for blocked pages |',
    '| Site cannot be crawled at all | **`upload_only:true`** — skips live crawl |',
    '| Need Profile Viewer demo clone | **`include.demoWebsite:true`** — uses the same ZIP for `/demos/<customer>/web` |',
    '| Rebuild demo without re-crawl | Open history card → **Regenerate demo** or **`lab_build_demo_website`** |',
    '',
    '---',
    '',
    '## Troubleshooting',
    '',
    '- **"No valid HTML files in upload"** — ZIP must contain at least one non-empty `.html` with readable text.',
    '- **"ZIP exceeds maximum upload size"** — trim video/large PDFs; keep ≤30 MB.',
    '- **Partial analysis / low confidence** — add more pages (about, products) with substantive copy.',
    '- **Demo build slow** — save-page ZIPs with many assets can take 5–10 minutes; progress should update every ~20s.',
    '',
    '---',
    '',
    '_Generated by AEP Orchestration Lab Brand Scraper — offline fallback brief (MCP lab_brand_scrape_brief)._',
  ].join('\n');
}

/**
 * @param {object} [opts]
 */
export function generateAssetChecklist(opts = {}) {
  const url = normaliseUrl(opts.url);
  const brand = String(opts.customerName || opts.customer_name || '').trim()
    || slugifyBrandBrief(url).replace(/-/g, ' ');
  const pages = Math.max(1, Math.min(25, Number(opts.pages || opts.max_pages) || 3));

  return [
    '# Brand Scraper — asset checklist',
    '',
    '**Brand:** ' + brand + '  ',
    '**URL:** ' + (url || '_(enter in form)_') + '  ',
    '**Date:** ' + new Date().toISOString().slice(0, 10),
    '',
    '## HTML pages (' + pages + '+ recommended)',
    '',
    '- [ ] Homepage `/`',
    '- [ ] About / company story',
    '- [ ] Products or services',
    '- [ ] Campaign / promo landing (if visible)',
    '- [ ] Leadership / team (for stakeholders step)',
    '',
    '## Visual assets',
    '',
    '- [ ] Primary logo (SVG or PNG, transparent if possible)',
    '- [ ] Favicon / app icon',
    '- [ ] Hero / banner image',
    '- [ ] 3–5 product or lifestyle images',
    '- [ ] Open Graph / social preview if distinct',
    '',
    '## Brand tokens (DevTools or style guide)',
    '',
    '- [ ] Primary brand colour (hex)',
    '- [ ] Secondary / accent colours',
    '- [ ] Heading font family',
    '- [ ] Body font family',
    '',
    '## Packaging',
    '',
    '- [ ] All HTML uses **relative** asset paths (save-page complete export)',
    '- [ ] Folder zipped as `.zip` ≤ **30 MB**',
    '- [ ] Uploaded via MCP **`lab_brand_scrape_upload`** or Portal **Options → HTML upload**',
    '- [ ] **`upload_only:true`** when live crawl is impossible',
    '- [ ] **`include.demoWebsite:true`** if you need the site clone',
    '',
    '## Manual tools',
    '',
    '- Chrome **Save As → Webpage, Complete**',
    '- **Image Eye** (or similar) for bulk image export',
    '- Optional external LLM with the full **scrape brief** for structured JSON + folder layout',
    '',
    '---',
    '',
    '_Checklist for offline Brand Scraper ingest — AEP Orchestration Lab._',
  ].join('\n');
}

export function briefFilename(opts = {}) {
  return `${slugifyBrandBrief(opts.customerName || opts.customer_name || opts.url)}-brand-scrape-brief.md`;
}

export function checklistFilename(opts = {}) {
  return `${slugifyBrandBrief(opts.customerName || opts.customer_name || opts.url)}-asset-checklist.md`;
}

export const BRAND_SCRAPER_UPLOAD_LIMITS = {
  maxUploadBytes: 30 * 1024 * 1024,
  maxFiles: 40,
  maxUploadMb: 30,
};
