/**
 * Demo Use Case Assets — sister service to clientJourneyAssetService.js.
 *
 * Produces HTML + PPTX for a demo deck aligned to the 4-slide reference
 * (use case → persona journey → demo placeholder → value). We emit
 * three HTML views (slides 1, 2, 4); the middle “demo” slide is live
 * product, not generated here.
 *
 * Sibling of clientJourneyAssetService.js — same orchestration shape
 * (Vertex AI Gemini structured-output → normalise → render → cache),
 * different output (a 3-slide deck rather than a 12-step journey + one
 * pager). Image slots use neutral inline-SVG fallbacks plus
 * data-demo-slot attributes so assets are easy to swap at scale.
 *
 * The AJO channel enum is duplicated from clientJourneyAssetService.js
 * on purpose — Adobe's channel surface is small and slow-moving, and
 * the alternative (a shared module) would require a refactor that the
 * "purely additive" plan rules out for v1. Keep the two lists in sync.
 */

const { callGemini, stripJsonFences } = require('./vertexClient');
const { summariseScrapeForPrompt } = require('./clientJourneyAssetService');
const brandScrapeStore = require('./brandScrapeStore');

// ─── CLOSED ENUMS ────────────────────────────────────────────────────────────

/**
 * Adobe products that may appear in framing.technology[]. The Vertex
 * structured-output schema rejects anything outside this list (plus
 * the user's optional customProduct passed through `extraProducts`).
 * Names match the most recent public Adobe naming as of writing —
 * keep in sync with the canonical product catalog used in customer
 * conversations.
 */
const ADOBE_PRODUCTS = [
  'Real-Time CDP',
  'Customer Journey Analytics',
  'Journey Optimizer',
  'Journey Optimizer Decisioning',
  'AEM Sites',
  'AEM Assets',
  'AEM Assets Dynamic Media',
  'Adobe Target',
  'Brand Concierge',
  'Mix Modeller',
  'Workfront',
  'Marketo Engage',
  'Commerce',
  'Product Analytics',
];
const ADOBE_PRODUCTS_SET = new Set(ADOBE_PRODUCTS);

/**
 * Adobe Journey Optimizer delivery channels. Mirrors the locked list
 * in clientJourneyAssetService.js (AJO_CHANNELS). Duplicated rather
 * than imported to keep the two services independently iterable per
 * the v1 plan.
 */
const AJO_CHANNELS = [
  'Email',
  'Push notifications (mobile app)',
  'SMS / Text messages',
  'In-app messages',
  'Web in-app / Web overlays',
  'WhatsApp',
  'LINE',
  'Push notifications on web',
  'Direct mail',
];
const AJO_CHANNEL_SET = new Set(AJO_CHANNELS);

const PRIORITY_VALUES = ['High', 'Medium', 'Low'];
const MOCKUP_KINDS = ['web', 'mobile', 'push', 'email'];

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(str) {
  return escapeHtml(str);
}

function safeString(v, fallback = '') {
  if (v == null) return fallback;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return fallback;
}

function slugify(s) {
  return safeString(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60) || 'demo';
}

function normaliseHex(hex, fallback = '#E60000') {
  const s = safeString(hex).trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toUpperCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    return ('#' + s.slice(1).split('').map((c) => c + c).join('')).toUpperCase();
  }
  return fallback.toUpperCase();
}

function darken(hex, amount = 0.25) {
  const h = normaliseHex(hex);
  const n = parseInt(h.slice(1), 16);
  const r = Math.max(0, Math.floor(((n >> 16) & 255) * (1 - amount)));
  const g = Math.max(0, Math.floor(((n >> 8) & 255) * (1 - amount)));
  const b = Math.max(0, Math.floor((n & 255) * (1 - amount)));
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1).toUpperCase();
}

function pickPrimaryColour(colours, fallback = '#E60000') {
  if (!Array.isArray(colours)) return fallback;
  for (const c of colours) {
    const hex = typeof c === 'string' ? c : (c && (c.hex || c.color));
    if (hex && /^#[0-9a-fA-F]{6}$/.test(hex)) return hex.toUpperCase();
  }
  return fallback.toUpperCase();
}

// ─── STOCK FALLBACK SVGs ─────────────────────────────────────────────────────
//
// All three image slots have an inline SVG fallback so the deck looks
// cohesive even when the user hasn't uploaded real photos. The fallbacks
// pick up the brand colour so they read as "Adobe-styled mockups" rather
// than generic placeholders.

/**
 * Initials avatar — deterministic by name, brand-coloured circle with
 * white initials. Used in slide 2's persona block when no upload.
 */
function initialsAvatarSvg(name, brandColour) {
  const colour = normaliseHex(brandColour);
  const dark = darken(colour, 0.2);
  const initials = (safeString(name).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('') || 'P').toUpperCase();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${dark}"/><stop offset="100%" stop-color="${colour}"/>
    </linearGradient></defs>
    <circle cx="60" cy="60" r="58" fill="url(#g)"/>
    <text x="60" y="74" text-anchor="middle" fill="#fff" font-family="-apple-system,Segoe UI,Adobe Clean,sans-serif" font-size="44" font-weight="700">${escapeHtml(initials)}</text>
  </svg>`;
}

/** Neutral headshot placeholder (PPTX + HTML when no upload). Recolour CSS does not reach inside data-URL SVGs — keep grays so swaps are obvious. */
function neutralPersonaAvatarSvg(name) {
  const initials = (safeString(name).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('') || 'P').toUpperCase();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
    <defs><linearGradient id="np" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#64748b"/><stop offset="100%" stop-color="#475569"/>
    </linearGradient></defs>
    <circle cx="60" cy="60" r="58" fill="url(#np)"/>
    <text x="60" y="74" text-anchor="middle" fill="#fff" font-family="-apple-system,Segoe UI,Adobe Clean,sans-serif" font-size="44" font-weight="700">${escapeHtml(initials)}</text>
  </svg>`;
}

/**
 * Laptop frame with a synthetic AJO-canvas-style content area. Used as
 * the slide 1 device fallback. The screen contents are a plausible
 * journey-canvas mockup (boxes + connecting paths) painted in the
 * brand colour family so the slide reads as on-brand.
 */
function laptopMockupSvg(brandColour, products) {
  const colour = normaliseHex(brandColour);
  const dark = darken(colour, 0.3);
  const productLine = (Array.isArray(products) && products.length)
    ? products.slice(0, 3).join(' · ')
    : 'Real-Time CDP · Journey Optimizer · CJA';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 380" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
    <!-- Laptop base -->
    <path d="M30,330 L570,330 L600,360 L0,360 Z" fill="#3a3f48"/>
    <rect x="285" y="330" width="30" height="6" fill="#22262d"/>
    <!-- Laptop lid -->
    <rect x="40" y="20" width="520" height="310" rx="8" fill="#1a1d22"/>
    <rect x="50" y="30" width="500" height="290" fill="#f5f6f8"/>
    <!-- App chrome -->
    <rect x="50" y="30" width="500" height="36" fill="#fff" stroke="#e3e6eb" stroke-width="1"/>
    <circle cx="64" cy="48" r="4" fill="#ff5f57"/>
    <circle cx="76" cy="48" r="4" fill="#ffbd2e"/>
    <circle cx="88" cy="48" r="4" fill="#28c940"/>
    <text x="115" y="52" font-family="-apple-system,Segoe UI,Adobe Clean,sans-serif" font-size="10" fill="#4a5060" font-weight="600">Adobe Journey Optimizer</text>
    <text x="115" y="62" font-family="-apple-system,Segoe UI,Adobe Clean,sans-serif" font-size="8" fill="#7d8492">${escapeHtml(productLine)}</text>
    <!-- Sidebar -->
    <rect x="50" y="66" width="60" height="254" fill="#fafbfc" stroke="#e3e6eb" stroke-width="1"/>
    <rect x="58" y="80" width="44" height="6" rx="2" fill="${colour}"/>
    <rect x="58" y="96" width="36" height="4" rx="1" fill="#c9ced8"/>
    <rect x="58" y="106" width="40" height="4" rx="1" fill="#c9ced8"/>
    <rect x="58" y="116" width="32" height="4" rx="1" fill="#c9ced8"/>
    <rect x="58" y="126" width="38" height="4" rx="1" fill="#c9ced8"/>
    <!-- Canvas with synthetic journey nodes -->
    <g transform="translate(125,90)">
      <rect x="0" y="0" width="80" height="36" rx="6" fill="#fff" stroke="${colour}" stroke-width="1.5"/>
      <text x="40" y="22" text-anchor="middle" font-family="-apple-system,Segoe UI,sans-serif" font-size="9" fill="#1a1a1a" font-weight="600">Entry</text>
      <line x1="80" y1="18" x2="120" y2="18" stroke="#9aa0aa" stroke-width="1.2" stroke-dasharray="2,2"/>
      <rect x="120" y="0" width="80" height="36" rx="6" fill="#fff" stroke="#c9ced8" stroke-width="1.2"/>
      <text x="160" y="22" text-anchor="middle" font-family="-apple-system,Segoe UI,sans-serif" font-size="9" fill="#1a1a1a">Condition</text>
      <line x1="200" y1="18" x2="240" y2="18" stroke="#9aa0aa" stroke-width="1.2" stroke-dasharray="2,2"/>
      <rect x="240" y="0" width="80" height="36" rx="6" fill="#fff" stroke="#c9ced8" stroke-width="1.2"/>
      <text x="280" y="22" text-anchor="middle" font-family="-apple-system,Segoe UI,sans-serif" font-size="9" fill="#1a1a1a">Wait</text>
      <line x1="320" y1="18" x2="360" y2="18" stroke="#9aa0aa" stroke-width="1.2" stroke-dasharray="2,2"/>
      <rect x="360" y="0" width="80" height="36" rx="6" fill="${colour}" stroke="${dark}" stroke-width="1.5"/>
      <text x="400" y="22" text-anchor="middle" font-family="-apple-system,Segoe UI,sans-serif" font-size="9" fill="#fff" font-weight="700">Email</text>
      <!-- Lower row -->
      <line x1="160" y1="36" x2="160" y2="80" stroke="#9aa0aa" stroke-width="1.2" stroke-dasharray="2,2"/>
      <rect x="120" y="80" width="80" height="36" rx="6" fill="#fff" stroke="#c9ced8" stroke-width="1.2"/>
      <text x="160" y="102" text-anchor="middle" font-family="-apple-system,Segoe UI,sans-serif" font-size="9" fill="#1a1a1a">Personalise</text>
      <line x1="200" y1="98" x2="240" y2="98" stroke="#9aa0aa" stroke-width="1.2" stroke-dasharray="2,2"/>
      <rect x="240" y="80" width="80" height="36" rx="6" fill="#fff" stroke="#c9ced8" stroke-width="1.2"/>
      <text x="280" y="102" text-anchor="middle" font-family="-apple-system,Segoe UI,sans-serif" font-size="9" fill="#1a1a1a">SMS</text>
      <line x1="320" y1="98" x2="360" y2="98" stroke="#9aa0aa" stroke-width="1.2" stroke-dasharray="2,2"/>
      <rect x="360" y="80" width="80" height="36" rx="6" fill="#fff" stroke="#c9ced8" stroke-width="1.2"/>
      <text x="400" y="102" text-anchor="middle" font-family="-apple-system,Segoe UI,sans-serif" font-size="9" fill="#1a1a1a">Push</text>
      <!-- Profiles tile -->
      <rect x="0" y="160" width="200" height="60" rx="6" fill="#fff" stroke="#e3e6eb" stroke-width="1"/>
      <text x="12" y="180" font-family="-apple-system,Segoe UI,sans-serif" font-size="8" fill="#7d8492">Live profiles</text>
      <text x="12" y="206" font-family="-apple-system,Segoe UI,sans-serif" font-size="22" fill="#1a1a1a" font-weight="700">2.4M</text>
    </g>
  </svg>`;
}

/**
 * Phone push-notification mockup. Used inside step cards on slide 2
 * when the user hasn't uploaded a real screenshot for that step.
 */
function phoneMockupSvg(brandColour, channel, sender, body) {
  const colour = normaliseHex(brandColour);
  const senderText = escapeHtml(safeString(sender, 'Brand').slice(0, 24));
  const bodyText = escapeHtml(safeString(body, 'Your update is ready.').slice(0, 110));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 380" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
    <rect x="14" y="6" width="192" height="368" rx="34" fill="#1a1d22"/>
    <rect x="22" y="14" width="176" height="352" rx="28" fill="#10141a"/>
    <rect x="86" y="22" width="48" height="6" rx="3" fill="#1a1d22"/>
    <text x="110" y="64" text-anchor="middle" font-family="-apple-system,Segoe UI,sans-serif" font-size="32" fill="#fff" font-weight="300">9:41</text>
    <text x="110" y="84" text-anchor="middle" font-family="-apple-system,Segoe UI,sans-serif" font-size="11" fill="#9aa0aa">Wednesday, 29 April</text>
    <!-- Notification card -->
    <rect x="36" y="118" width="148" height="76" rx="14" fill="#2c313a" opacity="0.95"/>
    <rect x="48" y="130" width="20" height="20" rx="5" fill="${colour}"/>
    <text x="74" y="145" font-family="-apple-system,Segoe UI,sans-serif" font-size="8" fill="#fff" font-weight="700">${senderText}</text>
    <text x="158" y="145" text-anchor="end" font-family="-apple-system,Segoe UI,sans-serif" font-size="7" fill="#9aa0aa">now</text>
    <foreignObject x="48" y="152" width="124" height="36">
      <div xmlns="http://www.w3.org/1999/xhtml" style="font-family:-apple-system,Segoe UI,sans-serif;font-size:7.5px;color:#e3e6eb;line-height:1.35;">${bodyText}</div>
    </foreignObject>
    <text x="110" y="356" text-anchor="middle" font-family="-apple-system,Segoe UI,sans-serif" font-size="7" fill="#7d8492">${escapeHtml(channel || 'Push')}</text>
  </svg>`;
}

/**
 * Web hero / browser mockup for the first step of slide 2 when it's
 * the discovery / website-landing moment.
 */
function webMockupSvg(brandColour, label) {
  const colour = normaliseHex(brandColour);
  const dark = darken(colour, 0.25);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
    <rect x="0" y="0" width="300" height="200" rx="6" fill="#fff" stroke="#e3e6eb"/>
    <rect x="0" y="0" width="300" height="22" fill="#f5f6f8" stroke="#e3e6eb"/>
    <circle cx="12" cy="11" r="3" fill="#ff5f57"/>
    <circle cx="22" cy="11" r="3" fill="#ffbd2e"/>
    <circle cx="32" cy="11" r="3" fill="#28c940"/>
    <rect x="50" y="6" width="200" height="10" rx="3" fill="#e3e6eb"/>
    <rect x="0" y="22" width="300" height="100" fill="${colour}" opacity="0.16"/>
    <text x="20" y="58" font-family="-apple-system,Segoe UI,sans-serif" font-size="12" fill="${dark}" font-weight="700">${escapeHtml(safeString(label, 'Discover'))}</text>
    <text x="20" y="78" font-family="-apple-system,Segoe UI,sans-serif" font-size="9" fill="#4a5060">Personalised landing for this visitor</text>
    <rect x="20" y="92" width="80" height="20" rx="10" fill="${colour}"/>
    <text x="60" y="106" text-anchor="middle" font-family="-apple-system,Segoe UI,sans-serif" font-size="9" fill="#fff" font-weight="700">Get started</text>
    <rect x="20" y="138" width="60" height="40" rx="4" fill="#f5f6f8" stroke="#e3e6eb"/>
    <rect x="92" y="138" width="60" height="40" rx="4" fill="#f5f6f8" stroke="#e3e6eb"/>
    <rect x="164" y="138" width="60" height="40" rx="4" fill="#f5f6f8" stroke="#e3e6eb"/>
  </svg>`;
}

/**
 * Email preview card mockup.
 */
function emailMockupSvg(brandColour, sender, subject) {
  const colour = normaliseHex(brandColour);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
    <rect x="0" y="0" width="300" height="200" rx="6" fill="#fff" stroke="#e3e6eb"/>
    <rect x="0" y="0" width="300" height="44" fill="${colour}"/>
    <text x="20" y="28" font-family="-apple-system,Segoe UI,sans-serif" font-size="13" fill="#fff" font-weight="700">${escapeHtml(safeString(sender, 'Brand'))}</text>
    <rect x="20" y="60" width="200" height="10" rx="2" fill="#e3e6eb"/>
    <text x="20" y="92" font-family="-apple-system,Segoe UI,sans-serif" font-size="11" fill="#1a1a1a" font-weight="700">${escapeHtml(safeString(subject, 'Your update is ready.'))}</text>
    <rect x="20" y="106" width="260" height="6" rx="2" fill="#f5f6f8"/>
    <rect x="20" y="118" width="260" height="6" rx="2" fill="#f5f6f8"/>
    <rect x="20" y="130" width="200" height="6" rx="2" fill="#f5f6f8"/>
    <rect x="20" y="156" width="80" height="22" rx="11" fill="${colour}"/>
    <text x="60" y="171" text-anchor="middle" font-family="-apple-system,Segoe UI,sans-serif" font-size="9" fill="#fff" font-weight="700">Read more</text>
  </svg>`;
}

/**
 * Lifestyle background placeholder — abstract gradient + soft shapes
 * tinted with the brand colour. Used when no lifestyle photo is
 * uploaded for slide 3.
 */
function lifestyleMockupSvg(brandColour) {
  const colour = normaliseHex(brandColour);
  const dark = darken(colour, 0.3);
  const light = darken(colour, -0.4); // brighter
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
    <defs>
      <linearGradient id="lf" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${light}" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="${dark}" stop-opacity="0.85"/>
      </linearGradient>
    </defs>
    <rect width="800" height="600" fill="${colour}"/>
    <rect width="800" height="600" fill="url(#lf)"/>
    <circle cx="200" cy="180" r="220" fill="#fff" opacity="0.08"/>
    <circle cx="640" cy="420" r="160" fill="#fff" opacity="0.06"/>
    <circle cx="520" cy="120" r="80" fill="#fff" opacity="0.1"/>
  </svg>`;
}

/**
 * Pick the right per-step mockup based on the model-supplied kind.
 */
function stepMockupSvg(step, brandColour, personaName, brandName) {
  const kind = MOCKUP_KINDS.includes(step.mockupKind) ? step.mockupKind : 'push';
  const sender = brandName || 'Brand';
  const body = safeString(step.description).slice(0, 100);
  if (kind === 'web') return webMockupSvg(brandColour, step.title);
  if (kind === 'email') return emailMockupSvg(brandColour, sender, step.title);
  // push + mobile both render as a phone with a notification (mobile gets
  // a slightly more app-shell feel via the channel label at the bottom).
  return phoneMockupSvg(brandColour, step.channel, sender, body);
}

/**
 * Persona image: uploaded data URL wins; otherwise a neutral inline
 * initials SVG (no external fetch — easy to replace by swapping the
 * slot contents or uploading a photo in the lab UI).
 */
function isHttpImageUrl(s) {
  return typeof s === 'string' && (s.startsWith('https://') || s.startsWith('http://'));
}

function resolvePersonaImage(images, personaName, _brandName, _brandColour, _mode = 'html') {
  if (images && typeof images.persona === 'string') {
    if (images.persona.startsWith('data:')) return { kind: 'data', src: images.persona };
    if (isHttpImageUrl(images.persona)) return { kind: 'url', src: images.persona };
  }
  const svg = neutralPersonaAvatarSvg(personaName);
  return { kind: 'svg', src: 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'), inlineSvg: svg };
}

function resolveDeviceImage(images, brandColour, products) {
  if (images && typeof images.device === 'string') {
    if (images.device.startsWith('data:')) return { kind: 'data', src: images.device };
    if (isHttpImageUrl(images.device)) return { kind: 'url', src: images.device };
  }
  const svg = laptopMockupSvg(brandColour, products);
  return { kind: 'svg', src: 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'), inlineSvg: svg };
}

function resolveLifestyleImage(images, industry, brandColour, mode = 'html') {
  // Uploaded image always wins.
  if (images && typeof images.lifestyle === 'string') {
    if (images.lifestyle.startsWith('data:')) return { kind: 'data', src: images.lifestyle };
    if (isHttpImageUrl(images.lifestyle)) return { kind: 'url', src: images.lifestyle };
  }
  // Deterministic, brand-coloured SVG fallback (no network fetch — keeps
  // the renderer pure and predictable in CI / offline / first-render).
  const svg = lifestyleHeroFallbackSvg(brandColour, industry);
  return { kind: 'svg', src: 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'), inlineSvg: svg };
}

// ─── PLACEHOLDER FALLBACKS ──────────────────────────────────────────────────
//
// Photo / screenshot zones are wrapped with data-demo-slot="…" so you
// can find-replace in HTML, post-process in a CMS, or extend the lab UI
// with extra dropzones later. Fallbacks are intentionally neutral greys
// (not customer-brand-tinted SVG) so the hosted recolour bar reads
// predictably; swap in real images via uploads or by replacing the slot
// inner HTML.
//
// Optional uploads on the images payload — each value may be a data:
// URL or an https image URL (e.g. signed crawl assets from the lab UI):
//   brandSurface, aepComposite — plus persona, device, lifestyle (ajoCanvas
//   is accepted on the payload but not shown on the experience walkthrough)
// Industry line-art (industryAccent) stays SVG, tinted via CSS currentColor.

function industryIllustrationSvg(industry, opts = {}) {
  const w = opts.width || 380;
  const h = opts.height || 140;
  const stroke = opts.stroke || 1.6;
  const ind = String(industry || '').toLowerCase();
  const match = (kw) => kw.some((k) => ind.includes(k));
  let body;
  if (match(['airline', 'travel', 'aviation', 'flight', 'tourism'])) {
    body = '<path d="M5 100 Q 80 60 150 100 T 300 70" stroke-dasharray="4 6"/>' +
      '<path d="M310 65 l34 -10 l-3 14 l-13 4 l5 -8z M345 56 l9 -2 l-2 6 z" fill="currentColor" stroke="none"/>';
  } else if (match(['retail', 'fashion', 'apparel', 'shop', 'store', 'ecommerce', 'commerce', 'cpg'])) {
    body = '<path d="M150 70 h120 v60 a8 8 0 0 1 -8 8 h-104 a8 8 0 0 1 -8 -8 z M178 70 a32 22 0 0 1 64 0"/>' +
      '<line x1="180" y1="98" x2="240" y2="98" stroke-dasharray="3 4"/>';
  } else if (match(['bank', 'finance', 'insurance', 'fintech', 'invest', 'wealth', 'payment'])) {
    body = '<rect x="120" y="60" width="180" height="70" rx="8"/>' +
      '<rect x="135" y="78" width="22" height="16" rx="3"/>' +
      '<line x1="135" y1="110" x2="240" y2="110" stroke-dasharray="4 4"/>' +
      '<text x="270" y="118" font-family="-apple-system, sans-serif" font-size="14" font-weight="700" fill="currentColor" stroke="none">$</text>';
  } else if (match(['telco', 'telecom', 'mobile', 'wireless', 'communication'])) {
    body = '<rect x="180" y="50" width="46" height="86" rx="8"/>' +
      '<line x1="195" y1="124" x2="211" y2="124"/>' +
      '<path d="M150 90 a40 40 0 0 1 100 0"/><path d="M170 90 a20 20 0 0 1 60 0"/>';
  } else if (match(['health', 'pharma', 'medical', 'wellness', 'hospital'])) {
    body = '<path d="M170 70 v50 M195 70 v50 M170 95 q-30 0 -30 -25 v-25"/>' +
      '<circle cx="225" cy="100" r="14"/>';
  } else if (match(['auto', 'car', 'vehicle', 'motor'])) {
    body = '<path d="M120 110 q15 -30 50 -30 h60 q35 0 50 30 h20 v15 h-180 v-15 z"/>' +
      '<circle cx="155" cy="125" r="10"/><circle cx="245" cy="125" r="10"/>';
  } else if (match(['food', 'restaurant', 'beverage', 'coffee', 'qsr', 'grocery'])) {
    body = '<path d="M180 80 v50 q0 8 8 8 h44 q8 0 8 -8 v-50 z M240 90 h12 q8 0 8 8 v14 q0 8 -8 8 h-12"/>' +
      '<path d="M195 70 q-3 -8 0 -16 M210 72 q3 -10 0 -18 M225 70 q-3 -8 0 -16"/>';
  } else if (match(['hospitality', 'hotel', 'lodging'])) {
    body = '<path d="M150 130 v-40 l50 -34 l50 34 v40 z"/>' +
      '<rect x="190" y="106" width="20" height="24"/>' +
      '<rect x="160" y="100" width="14" height="14"/><rect x="226" y="100" width="14" height="14"/>';
  } else if (match(['energy', 'utilit', 'power', 'oil', 'gas'])) {
    body = '<polyline points="150 60 200 60 175 100 215 100 165 130"/>';
  } else if (match(['media', 'publish', 'entertain', 'stream', 'broadcast', 'gaming'])) {
    body = '<rect x="140" y="60" width="180" height="80" rx="8"/>' +
      '<polygon points="210 80 210 120 240 100" fill="currentColor" stroke="none"/>';
  } else if (match(['educ', 'learn', 'school', 'university', 'edtech'])) {
    body = '<polygon points="190 70 290 100 190 130 90 100"/>' +
      '<line x1="190" y1="130" x2="190" y2="160"/><polyline points="170 145 190 160 210 145"/>';
  } else if (match(['saas', 'software', 'tech', 'platform', 'cloud'])) {
    body = '<path d="M140 110 a30 30 0 0 1 50 -22 a25 25 0 0 1 48 8 a22 22 0 0 1 14 42 h-100 a22 22 0 0 1 -12 -28 z"/>';
  } else {
    body = '<circle cx="160" cy="100" r="10"/><circle cx="220" cy="70" r="10"/>' +
      '<circle cx="220" cy="130" r="10"/><circle cx="280" cy="100" r="10"/>' +
      '<line x1="170" y1="100" x2="210" y2="80"/><line x1="170" y1="100" x2="210" y2="120"/>' +
      '<line x1="230" y1="80" x2="270" y2="100"/><line x1="230" y1="120" x2="270" y2="100"/>';
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 380 140" width="${w}" height="${h}" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

function brandSurfaceFallbackSvg(_brandColour, brandName) {
  const safeBrand = escapeHtml(safeString(brandName, 'Brand').slice(0, 22));
  // Neutral wireframe — replace with a real site/product screenshot
  // via images.brandSurface (data URL) or by editing the slot in HTML.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 420" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    <rect x="14" y="20" width="572" height="392" rx="14" fill="#ffffff" stroke="#cbd5e1" stroke-width="2"/>
    <rect x="14" y="20" width="572" height="34" fill="#f8fafc" stroke="#e2e8f0"/>
    <circle cx="34" cy="37" r="5" fill="#fecaca"/><circle cx="50" cy="37" r="5" fill="#fde68a"/><circle cx="66" cy="37" r="5" fill="#bbf7d0"/>
    <rect x="120" y="30" width="360" height="14" rx="7" fill="#ffffff" stroke="#e2e8f0"/>
    <rect x="14" y="54" width="572" height="30" fill="#ffffff"/>
    <rect x="28" y="64" width="72" height="10" rx="2" fill="#e2e8f0"/>
    <rect x="110" y="64" width="72" height="10" rx="2" fill="#e2e8f0"/>
    <rect x="192" y="64" width="72" height="10" rx="2" fill="#e2e8f0"/>
    <rect x="14" y="84" width="572" height="286" fill="#f1f5f9"/>
    <rect x="44" y="120" width="512" height="200" rx="10" fill="#ffffff" stroke="#94a3b8" stroke-width="2" stroke-dasharray="10 8"/>
    <text x="300" y="210" text-anchor="middle" font-family="-apple-system, sans-serif" font-size="15" font-weight="600" fill="#64748b">Brand / product screenshot</text>
    <text x="300" y="236" text-anchor="middle" font-family="-apple-system, sans-serif" font-size="12" fill="#94a3b8">${safeBrand}</text>
    <text x="300" y="258" text-anchor="middle" font-family="-apple-system, sans-serif" font-size="10" fill="#cbd5e1">data-demo-slot="framing.brandSurface"</text>
  </svg>`;
}

function ajoCanvasFallbackSvg(_brandColour) {
  const accent = '#64748b';
  // Stylised AJO journey-canvas wireframe (neutral greys — drop a real
  // screenshot via images.ajoCanvas).
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 220" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    <rect width="720" height="220" rx="12" fill="#fafbfc" stroke="#e3e6eb"/>
    <rect x="14" y="14" width="200" height="22" rx="3" fill="#ffffff" stroke="#e3e6eb"/>
    <text x="22" y="29" font-family="-apple-system, sans-serif" font-size="11" font-weight="700" fill="#4a5060">Adobe Journey Optimizer</text>
    <text x="640" y="29" font-family="-apple-system, sans-serif" font-size="10" fill="#7d8492">Live · v6</text>
    <line x1="80" y1="120" x2="160" y2="120" stroke="#bcc3cf" stroke-width="2"/>
    <circle cx="60" cy="120" r="20" fill="${accent}"/>
    <text x="60" y="124" font-family="-apple-system, sans-serif" font-size="10" font-weight="700" fill="#fff" text-anchor="middle">START</text>
    <rect x="160" y="88" width="120" height="64" rx="6" fill="#ffffff" stroke="${accent}" stroke-width="2"/>
    <rect x="172" y="100" width="14" height="14" rx="3" fill="${accent}" opacity="0.25"/>
    <text x="194" y="112" font-family="-apple-system, sans-serif" font-size="11" font-weight="700" fill="#1a1a1a">Email</text>
    <text x="172" y="134" font-family="-apple-system, sans-serif" font-size="9" fill="#7d8492">Entered: 312</text>
    <line x1="280" y1="120" x2="320" y2="65" stroke="#bcc3cf" stroke-width="2"/>
    <line x1="280" y1="120" x2="320" y2="175" stroke="#bcc3cf" stroke-width="2"/>
    <rect x="320" y="35" width="120" height="60" rx="6" fill="#ffffff" stroke="${accent}" stroke-width="2"/>
    <rect x="332" y="48" width="14" height="14" rx="3" fill="${accent}" opacity="0.25"/>
    <text x="354" y="60" font-family="-apple-system, sans-serif" font-size="11" font-weight="700" fill="#1a1a1a">Push</text>
    <text x="332" y="80" font-family="-apple-system, sans-serif" font-size="9" fill="#7d8492">Entered: 218</text>
    <rect x="320" y="145" width="120" height="60" rx="6" fill="#ffffff" stroke="${accent}" stroke-width="2"/>
    <rect x="332" y="158" width="14" height="14" rx="3" fill="${accent}" opacity="0.25"/>
    <text x="354" y="170" font-family="-apple-system, sans-serif" font-size="11" font-weight="700" fill="#1a1a1a">SMS</text>
    <text x="332" y="190" font-family="-apple-system, sans-serif" font-size="9" fill="#7d8492">Entered: 94</text>
    <line x1="440" y1="65" x2="500" y2="110" stroke="#bcc3cf" stroke-width="2"/>
    <line x1="440" y1="175" x2="500" y2="130" stroke="#bcc3cf" stroke-width="2"/>
    <rect x="500" y="88" width="120" height="64" rx="6" fill="#ffffff" stroke="${accent}" stroke-width="2"/>
    <rect x="512" y="100" width="14" height="14" rx="3" fill="${accent}" opacity="0.25"/>
    <text x="534" y="112" font-family="-apple-system, sans-serif" font-size="11" font-weight="700" fill="#1a1a1a">Wait + Decision</text>
    <text x="512" y="134" font-family="-apple-system, sans-serif" font-size="9" fill="#7d8492">Branches: 3</text>
    <line x1="620" y1="120" x2="660" y2="120" stroke="#bcc3cf" stroke-width="2"/>
    <circle cx="680" cy="120" r="20" fill="#1a1a1a"/>
    <text x="680" y="124" font-family="-apple-system, sans-serif" font-size="10" font-weight="700" fill="#fff" text-anchor="middle">END</text>
  </svg>`;
}

function aepCompositeFallbackSvg(_brandColour, personaName, sampleNotification) {
  const accent = '#64748b';
  const sn = sampleNotification || {};
  const sender = safeString(sn.sender, 'Brand').slice(0, 18);
  const body = safeString(sn.body, 'Your tailored experience is ready.').slice(0, 110);
  const initial = String(sender).charAt(0).toUpperCase();
  const trait = safeString((personaName || 'High-intent visitors').split('|')[0], 'High-intent').trim().slice(0, 22);
  // Hour:minute clock face on the phone uses a fixed time so re-renders
  // are deterministic (the real reference deck uses 1:47).
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 540" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    <defs>
      <linearGradient id="aepPhoneScreen" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#382441"/>
        <stop offset="100%" stop-color="#1a1024"/>
      </linearGradient>
    </defs>
    <rect width="720" height="540" fill="#ffffff"/>
    <g transform="translate(20 90)">
      <rect width="240" height="58" rx="10" fill="#ffffff" stroke="#e3e6eb" stroke-width="1.5"/>
      <text x="22" y="36" font-family="-apple-system, sans-serif" font-size="15" font-weight="600" fill="#1a1a1a">Create segment</text>
    </g>
    <g transform="translate(20 168)">
      <rect width="290" height="220" rx="10" fill="#ffffff" stroke="#e3e6eb" stroke-width="1.5"/>
      <g transform="translate(20 30)">
        <circle cx="14" cy="14" r="9" fill="none" stroke="#1a1a1a" stroke-width="2"/>
        <line x1="20" y1="20" x2="28" y2="28" stroke="#1a1a1a" stroke-width="2" stroke-linecap="round"/>
        <text x="48" y="14" font-family="-apple-system, sans-serif" font-size="13" fill="#7d8492">Search:</text>
        <text x="48" y="32" font-family="-apple-system, sans-serif" font-size="14" font-weight="700" fill="#1a1a1a">Best customers</text>
      </g>
      <line x1="20" y1="100" x2="270" y2="100" stroke="#e3e6eb"/>
      <g transform="translate(20 116)">
        <circle cx="14" cy="14" r="10" fill="none" stroke="#1a1a1a" stroke-width="2"/>
        <circle cx="14" cy="14" r="4" fill="#1a1a1a"/>
        <text x="48" y="14" font-family="-apple-system, sans-serif" font-size="13" fill="#7d8492">Trait:</text>
        <text x="48" y="32" font-family="-apple-system, sans-serif" font-size="14" font-weight="700" fill="#1a1a1a">${escapeHtml(trait)}</text>
      </g>
      <line x1="20" y1="174" x2="270" y2="174" stroke="#e3e6eb"/>
      <g transform="translate(20 184)">
        <rect x="0" y="0" width="44" height="20" rx="4" fill="${accent}" opacity="0.12"/>
        <text x="22" y="14" font-family="-apple-system, sans-serif" font-size="11" font-weight="700" fill="${accent}" text-anchor="middle">Save</text>
      </g>
    </g>
    <g transform="translate(370 50)">
      <rect width="290" height="460" rx="38" fill="#1f1f1f"/>
      <rect x="14" y="16" width="262" height="428" rx="28" fill="url(#aepPhoneScreen)"/>
      <rect x="120" y="22" width="50" height="14" rx="7" fill="#000000"/>
      <text x="40" y="58" font-family="-apple-system, sans-serif" font-size="12" font-weight="700" fill="#ffffff">9:41</text>
      <rect x="234" y="46" width="32" height="14" rx="3" fill="#ffffff" opacity="0.85"/>
      <text x="145" y="125" font-family="-apple-system, sans-serif" font-size="14" font-weight="500" fill="#ffffff" text-anchor="middle" opacity="0.85">Sunday, March 10</text>
      <text x="145" y="195" font-family="-apple-system, sans-serif" font-size="64" font-weight="700" fill="#ffffff" text-anchor="middle">1:47</text>
      <g transform="translate(28 240)">
        <rect width="234" height="120" rx="14" fill="#ffffff" opacity="0.95"/>
        <circle cx="32" cy="32" r="14" fill="${accent}"/>
        <text x="32" y="37" font-family="-apple-system, sans-serif" font-size="14" font-weight="700" fill="#fff" text-anchor="middle">${escapeHtml(initial)}</text>
        <text x="58" y="30" font-family="-apple-system, sans-serif" font-size="13" font-weight="700" fill="#1a1a1a">${escapeHtml(sender)}</text>
        <text x="208" y="30" font-family="-apple-system, sans-serif" font-size="10" fill="#7d8492" text-anchor="end">now</text>
        <foreignObject x="20" y="48" width="200" height="64">
          <div xmlns="http://www.w3.org/1999/xhtml" style="font: 500 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #4a5060; line-height: 1.35;">${escapeHtml(body)}</div>
        </foreignObject>
      </g>
    </g>
  </svg>`;
}

function lifestyleHeroFallbackSvg(_brandColour, industry) {
  const win = '#94a3b8';
  // Neutral skyline + person silhouette (industry still biases the
  // foreground figure). Replace with images.lifestyle when you have a
  // real lifestyle shot.
  const ind = String(industry || '').toLowerCase();
  const figure = ind.includes('travel') || ind.includes('airline') || ind.includes('hotel')
    ? '<g fill="#1a1a2a" opacity="0.78" transform="translate(280 408)"><ellipse cx="20" cy="20" rx="14" ry="16"/><path d="M0 50 q20 -20 40 0 v100 h-40 z"/><rect x="44" y="70" width="22" height="34" rx="3"/><line x1="55" y1="68" x2="55" y2="50" stroke="#1a1a2a" stroke-width="3"/></g>'
    : ind.includes('retail') || ind.includes('shop') || ind.includes('fashion')
    ? '<g fill="#1a1a2a" opacity="0.78" transform="translate(280 408)"><ellipse cx="20" cy="20" rx="14" ry="16"/><path d="M0 50 q20 -20 40 0 v100 h-40 z"/><path d="M44 80 h22 v32 h-22z M50 80 v-6 q5 -6 10 0 v6"/></g>'
    : '<g fill="#1a1a2a" opacity="0.7" transform="translate(280 408)"><ellipse cx="20" cy="20" rx="14" ry="16"/><path d="M0 50 q20 -20 40 0 v100 h-40 z"/></g>';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <linearGradient id="lifeSky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#e2e8f0"/>
        <stop offset="55%" stop-color="#f1f5f9"/>
        <stop offset="100%" stop-color="#f8fafc"/>
      </linearGradient>
      <linearGradient id="lifeGround" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#cbd5e1"/>
        <stop offset="100%" stop-color="#94a3b8"/>
      </linearGradient>
    </defs>
    <rect width="600" height="600" fill="url(#lifeSky)"/>
    <g fill="#1a1a2a" opacity="0.55">
      <rect x="30" y="380" width="60" height="180"/>
      <rect x="100" y="320" width="80" height="240"/>
      <rect x="190" y="350" width="40" height="210"/>
      <rect x="240" y="280" width="70" height="280"/>
      <rect x="320" y="340" width="60" height="220"/>
      <rect x="390" y="300" width="80" height="260"/>
      <rect x="480" y="360" width="40" height="200"/>
      <rect x="530" y="320" width="50" height="240"/>
    </g>
    <g fill="${win}" opacity="0.45">
      <rect x="115" y="340" width="6" height="6"/><rect x="130" y="340" width="6" height="6"/><rect x="145" y="340" width="6" height="6"/>
      <rect x="115" y="360" width="6" height="6"/><rect x="130" y="360" width="6" height="6"/>
      <rect x="255" y="300" width="6" height="6"/><rect x="270" y="300" width="6" height="6"/><rect x="285" y="300" width="6" height="6"/>
      <rect x="405" y="320" width="6" height="6"/><rect x="420" y="320" width="6" height="6"/><rect x="435" y="320" width="6" height="6"/>
    </g>
    <rect y="540" width="600" height="60" fill="url(#lifeGround)" opacity="0.5"/>
    ${figure}
  </svg>`;
}

function resolveBrandSurface(images, brandColour, brandName) {
  if (images && typeof images.brandSurface === 'string') {
    if (images.brandSurface.startsWith('data:')) return { kind: 'data', src: images.brandSurface };
    if (isHttpImageUrl(images.brandSurface)) return { kind: 'url', src: images.brandSurface };
  }
  const svg = brandSurfaceFallbackSvg(brandColour, brandName);
  return { kind: 'svg', src: 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'), inlineSvg: svg };
}

function resolveAjoCanvas(images, brandColour) {
  if (images && typeof images.ajoCanvas === 'string') {
    if (images.ajoCanvas.startsWith('data:')) return { kind: 'data', src: images.ajoCanvas };
    if (isHttpImageUrl(images.ajoCanvas)) return { kind: 'url', src: images.ajoCanvas };
  }
  const svg = ajoCanvasFallbackSvg(brandColour);
  return { kind: 'svg', src: 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'), inlineSvg: svg };
}

function resolveAepComposite(images, brandColour, personaName, sampleNotification) {
  if (images && typeof images.aepComposite === 'string') {
    if (images.aepComposite.startsWith('data:')) return { kind: 'data', src: images.aepComposite };
    if (isHttpImageUrl(images.aepComposite)) return { kind: 'url', src: images.aepComposite };
  }
  const svg = aepCompositeFallbackSvg(brandColour, personaName, sampleNotification);
  return { kind: 'svg', src: 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'), inlineSvg: svg };
}

// ─── JSON SCHEMA ─────────────────────────────────────────────────────────────

/**
 * Vertex Gemini structured-output schema. Closed enums on:
 *   - framing.priority   → High|Medium|Low
 *   - framing.technology → ADOBE_PRODUCTS (extended at runtime to add
 *                          the user's customProduct if supplied)
 *   - experience.steps[].channel → AJO_CHANNELS
 *   - experience.steps[].mockupKind → MOCKUP_KINDS
 *
 * Counts (4 benefits, 3 value props, stepCount steps) are enforced in
 * the system prompt and re-clamped post-parse in normaliseDemoData()
 * because Gemini doesn't always honour minItems/maxItems consistently.
 */
function buildResponseSchema({ extraProducts = [] } = {}) {
  const productEnum = Array.from(new Set(ADOBE_PRODUCTS.concat((extraProducts || []).filter(Boolean))));
  return {
    type: 'object',
    properties: {
      framing: {
        type: 'object',
        properties: {
          useCase: { type: 'string' },
          priority: { type: 'string', enum: PRIORITY_VALUES },
          technology: { type: 'array', items: { type: 'string', enum: productEnum } },
          benefits: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                icon: { type: 'string' },
                text: { type: 'string' },
              },
              required: ['text'],
            },
          },
          sampleNotification: {
            type: 'object',
            properties: {
              sender: { type: 'string' },
              body: { type: 'string' },
              timeLabel: { type: 'string' },
            },
            required: ['sender', 'body'],
          },
          statHighlight: {
            type: 'object',
            properties: {
              delta: { type: 'string' },
              value: { type: 'string' },
              label: { type: 'string' },
            },
          },
        },
        required: ['useCase', 'technology', 'benefits'],
      },
      experience: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          subtitle: { type: 'string' },
          persona: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              traits: { type: 'array', items: { type: 'string' } },
              summary: { type: 'string' },
            },
            required: ['name'],
          },
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                description: { type: 'string' },
                channel: { type: 'string', enum: AJO_CHANNELS },
                mockupKind: { type: 'string', enum: MOCKUP_KINDS },
              },
              required: ['title', 'description', 'channel'],
            },
          },
        },
        required: ['persona', 'steps'],
      },
      value: {
        type: 'object',
        properties: {
          headline: { type: 'string' },
          boldWord: { type: 'string' },
          subheading: { type: 'string' },
          valueProps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                icon: { type: 'string' },
                boldWord: { type: 'string' },
                text: { type: 'string' },
              },
              required: ['text'],
            },
          },
          takeaway: { type: 'string' },
        },
        required: ['headline', 'valueProps', 'takeaway'],
      },
    },
    required: ['framing', 'experience', 'value'],
  };
}

// ─── SYSTEM PROMPT ───────────────────────────────────────────────────────────

const DEMO_SYSTEM_PROMPT = `You are an Adobe principal solutions consultant designing a 3-slide demo presentation deck for a customer sales conversation. The deck wraps a LIVE product walkthrough — slide 1 frames what we're about to show, slide 2 narrates a persona moving through the product, slide 3 lands the value after the demo finishes.

Output ONE JSON object that EXACTLY matches the requested schema. Do not include prose, markdown fences, comments, or any extra keys. All array lengths MUST match the count rules below — Gemini's responseSchema doesn't always enforce them so YOU must be precise.

Hard rules:

FRAMING (slide 1 — pre-demo setup):
- "framing.useCase": first-person customer voice ("I want to ..."), 1-2 sentences max, written from the buyer's POV. Reference the brand's actual business by name.
- "framing.priority": exactly one of "High" | "Medium" | "Low".
- "framing.technology": array of 1-4 Adobe product names. ONLY use names from the closed list provided in inputs.allowedProducts. Output them character-for-character. NEVER invent new product names or rephrase them.
- "framing.benefits": EXACTLY 4 short OUTCOME statements (5-9 words each, must read as business outcomes not feature descriptions). Each has icon (one short keyword like "shuffle", "users", "shield", "trending-up", "heart", "gift", "zap", "target") + text. Examples of outcome phrasing: "Builds trust with passenger", "Boosts ancillary revenue", "Cuts time-to-personalisation in half".
- "framing.sampleNotification": one believable example message the customer would receive during this journey. sender = brand name (or product name within the brand), body = 1-2 sentence message reflecting the use case (concrete and on-brand), timeLabel = "now" | "5m ago" | "Just now" | "1h ago".
- "framing.statHighlight": one believable headline metric. delta like "▲28.4%" or "▲2.3x", value like "172" or "2.4M", label like "Profile uplift" or "Conversions / month". MUST be plausible for the brand's industry — never invent absurd numbers.

EXPERIENCE (slide 2 — live walkthrough):
- "experience.title": short headline like "Experience Elevation" | "Personalised Engagement" | "From Anonymous to Loyal".
- "experience.subtitle": short bridge phrase like "Driving engagement & loyalty" | "End-to-end real-time orchestration".
- "experience.persona": pull from the brand scrape's personas[] when one is supplied in inputs. name = "FirstName | Persona-tagline" (e.g. "Adam | First Time With Flynas"). traits = exactly 3-4 short tags (1-3 words each, e.g. "New traveler", "Family of 4", "Mobile-first"). summary = 1 sentence, "Anonymous to Known, initial engagement, real-time & AI driven" style.
- "experience.steps": EXACTLY inputs.stepCount items (5, 6, or 7 — whatever the user specified). Each step has:
  - title (3-6 words, e.g. "Lands on website", "Cart abandonment recovery", "Boards the flight")
  - description (1-2 sentences naming the persona explicitly, calling out the channel naturally — e.g. "Adam receives an SMS reminding him his flight is delayed and offering a complimentary lounge pass.")
  - channel — exactly one of the 9 AJO channels (closed list in inputs.allowedChannels)
  - mockupKind — exactly one of "web" | "mobile" | "push" | "email" — pick the visual that best represents this step. First step usually "web" (landing on the site), middle steps usually "push" or "email", boarding/check-in steps "mobile", offline post-purchase "email".

VALUE (slide 3 — post-demo takeaway):
- "value.headline": 4-8 word statement that ends with a period, e.g. "Stand out with customer-centric engagement." or "Be relevant when it matters." The emphasis word goes in "boldWord" and MUST also appear verbatim inside "headline" (case-insensitive) so the renderer can highlight it.
- "value.boldWord": REQUIRED. A short emphasis phrase (1-3 words) lifted from "headline" that the renderer will paint in the brand colour. Examples: "Stand out", "customer-centric", "relevant".
- "value.subheading": short bridge phrase, 4-8 words, e.g. "Don't push more volume. Instead, be...".
- "value.valueProps": EXACTLY 3 items. Each is one SINGLE WORD describing a virtue Adobe enables, paired with a short Feather icon keyword. Use "boldWord" for the SINGLE WORD (e.g. "relevant") — the renderer will automatically prepend "More" so the slide reads "More relevant / More personalized / More timely". "text" must be the rendered phrase ("More relevant"); the renderer reads "boldWord" first but falls back to "text" if missing. Icons: "file-search" or "target" for relevance, "user" or "smile" for personalisation, "clock" or "zap" for timeliness, "heart" for loyalty, "shield" for trust, "trending-up" for growth.
- "value.takeaway": 1-2 sentence synopsis of what the demo proved. Names a concrete outcome — e.g. "Go beyond siloed channel-centric interactions by putting the customer at the center of your engagement efforts."

Soft rules:
- Use the persona's name explicitly in step descriptions and any narrative copy.
- Match the brand's industry — use specific examples not generic placeholder text.
- The Adobe products in framing.technology should be the same products that genuinely deliver the experience steps (e.g. if step descriptions mention real-time decisioning, include "Journey Optimizer Decisioning" in framing.technology).
- If the user supplied "additionalContext" in the inputs, treat it as the highest-priority steering signal — adjust narrative, persona behaviour, channels, and step focus to match it.
- If the user supplied "previousData" + "refinementRequest", treat this as REFINEMENT MODE: apply the user's request to the previous JSON and return ONE new JSON object matching the same schema. Preserve sections the user did NOT mention; only modify what they asked you to change.

Return JSON only.`;

// ─── PROMPT BUILDER ──────────────────────────────────────────────────────────

function summariseScrape(scrape) {
  // Reuse the journey service's summary so both pages feed Gemini the
  // same brand snapshot — avoids two divergent shapes for the same data.
  return summariseScrapeForPrompt(scrape);
}

function buildUserPayload({
  scrape,
  brandColour,
  useCase,
  personaName,
  products,
  customProduct,
  stepCount,
  additionalContext,
  previousData,
  refinementPrompt,
  clientName,
}) {
  const summary = summariseScrape(scrape);
  const inferredColour = pickPrimaryColour(summary.colours, '#E60000');
  const finalBrandColour = normaliseHex(brandColour || inferredColour, '#E60000');
  const resolvedClientName = clientName || scrape.brandName || summary.brandName || 'Client';
  const allowedProducts = ADOBE_PRODUCTS.slice();
  if (customProduct && typeof customProduct === 'string' && customProduct.trim()) {
    allowedProducts.push(customProduct.trim());
  }
  const cleanProducts = (Array.isArray(products) ? products : [])
    .map((p) => safeString(p).trim())
    .filter(Boolean)
    .filter((p) => allowedProducts.includes(p) || p === customProduct);

  const isRefinement = !!(refinementPrompt && previousData && typeof previousData === 'object');
  const trimmedContext = (typeof additionalContext === 'string' ? additionalContext : '').trim();
  const trimmedRefine = (typeof refinementPrompt === 'string' ? refinementPrompt : '').trim();
  const sc = Math.min(7, Math.max(5, parseInt(stepCount, 10) || 6));

  const clientInputs = {
    name: resolvedClientName,
    domain: summary.url,
    brandColour: finalBrandColour,
    useCase: safeString(useCase).trim() || `I want to deliver a personalised customer experience for ${resolvedClientName} customers.`,
    personaName: personaName || (summary.personas[0] && summary.personas[0].name) || '',
    requestedProducts: cleanProducts,
    customProduct: customProduct || '',
  };

  let userPayload;
  if (isRefinement) {
    userPayload = {
      instruction:
        'You previously generated the JSON in "previousData" for this brand demo deck. Apply the user\'s "refinementRequest" to update it and return ONE new JSON object matching the same schema. ' +
        'Preserve sections the user did not touch — only modify what they asked you to change. ' +
        'All schema invariants still apply: 4 benefits, exactly ' + sc + ' steps, 3 value props, channels from the AJO list, products from the allowed list. Return JSON only.',
      inputs: {
        client: clientInputs,
        brandSummary: summary,
        stepCount: sc,
        allowedProducts,
        allowedChannels: AJO_CHANNELS,
        refinementRequest: trimmedRefine,
        previousData,
      },
    };
  } else {
    const inputs = {
      client: clientInputs,
      brandSummary: summary,
      stepCount: sc,
      allowedProducts,
      allowedChannels: AJO_CHANNELS,
    };
    if (trimmedContext) inputs.additionalContext = trimmedContext;
    userPayload = {
      instruction:
        'Design a 3-slide demo presentation deck for the brand below. Use the user\'s preferred Adobe products (inputs.client.requestedProducts) as the framing.technology and weave them through the experience steps. Return ONE JSON object matching the schema described in the system prompt.' +
        (trimmedContext ? ' Pay close attention to "additionalContext" — it is the highest-priority steering signal from the human user.' : ''),
      inputs,
    };
  }
  return { userPayload, finalBrandColour, resolvedClientName, summary, stepCount: sc, allowedProducts };
}

// ─── PUBLIC: GENERATE ────────────────────────────────────────────────────────

async function generateDemoUseCase(opts) {
  const {
    sandbox,
    scrapeId,
  } = opts || {};
  if (!sandbox) throw new Error('sandbox is required');
  if (!scrapeId) throw new Error('scrapeId is required');

  const scrape = await brandScrapeStore.getScrape(sandbox, scrapeId);
  if (!scrape) throw new Error(`Brand scrape not found for sandbox=${sandbox} id=${scrapeId}`);
  if (scrape.payloadExpired) {
    throw new Error('Brand scrape payload has expired (>3 days). Re-run the scrape in Brand scraper.');
  }

  const built = buildUserPayload({ ...opts, scrape });
  const { userPayload, finalBrandColour, resolvedClientName, summary, stepCount, allowedProducts } = built;

  // Demo deck JSON is much smaller than a full 12-step journey (~5-15KB
  // vs 30-50KB), so 16k output tokens is plenty. Keep the rate-limit
  // retry the same as the journey service so a transient 429 clears
  // automatically.
  const baseGeminiOpts = {
    maxOutputTokens: 16384,
    temperature: 0.4,
    jsonMode: true,
    retryOn429: true,
    retryOn429DelayMs: 30000,
    retryOn429Attempts: 1,
  };

  const responseSchema = buildResponseSchema({ extraProducts: opts.customProduct ? [opts.customProduct] : [] });

  let raw;
  try {
    raw = await callGemini(DEMO_SYSTEM_PROMPT, JSON.stringify(userPayload, null, 2), {
      ...baseGeminiOpts,
      responseSchema,
    });
  } catch (e) {
    if (e && e.code === 'RATE_LIMITED') throw e;
    if (/responseSchema|schema/i.test(String(e && e.message || e))) {
      raw = await callGemini(DEMO_SYSTEM_PROMPT, JSON.stringify(userPayload, null, 2), { ...baseGeminiOpts });
    } else {
      throw e;
    }
  }

  let parsed;
  try {
    parsed = JSON.parse(stripJsonFences(raw));
  } catch (e) {
    throw new Error(`Gemini returned non-JSON for demo deck: ${String(e && e.message || e)}`);
  }

  const demoData = normaliseDemoData(parsed, {
    brandColour: finalBrandColour,
    clientName: resolvedClientName,
    domain: summary.url,
    industry: summary.industry,
    stepCount,
    allowedProducts,
  });

  return { demoData };
}

// ─── NORMALISE ───────────────────────────────────────────────────────────────

function ensureLength(arr, n, factory) {
  const out = Array.isArray(arr) ? arr.slice(0, n) : [];
  while (out.length < n) out.push(factory(out.length));
  return out;
}

function normaliseDemoData(parsed, overrides = {}) {
  const j = (parsed && typeof parsed === 'object') ? parsed : {};
  const brandColour = normaliseHex(overrides.brandColour, '#E60000');
  const dark = darken(brandColour, 0.25);
  const clientName = safeString(overrides.clientName, 'Client');
  const stepCount = Math.min(7, Math.max(5, parseInt(overrides.stepCount, 10) || 6));
  const allowedProducts = Array.isArray(overrides.allowedProducts) ? overrides.allowedProducts : ADOBE_PRODUCTS.slice();
  const allowedProductsSet = new Set(allowedProducts);

  // Framing
  const framingIn = (j.framing && typeof j.framing === 'object') ? j.framing : {};
  const techRaw = Array.isArray(framingIn.technology) ? framingIn.technology : [];
  const cleanTech = [];
  const seenTech = Object.create(null);
  for (const t of techRaw) {
    const v = safeString(t).trim();
    if (!v || seenTech[v.toLowerCase()] || !allowedProductsSet.has(v)) continue;
    seenTech[v.toLowerCase()] = true;
    cleanTech.push(v);
    if (cleanTech.length >= 4) break;
  }
  if (!cleanTech.length) cleanTech.push('Real-Time CDP');

  const benefits = ensureLength(framingIn.benefits, 4, () => ({ icon: 'zap', text: 'Streamlines customer engagement' })).map((b) => ({
    icon: safeString(b && b.icon, 'zap'),
    text: safeString(b && b.text, 'Streamlines customer engagement'),
  }));

  const priority = PRIORITY_VALUES.includes(framingIn.priority) ? framingIn.priority : 'High';
  const sn = (framingIn.sampleNotification && typeof framingIn.sampleNotification === 'object') ? framingIn.sampleNotification : {};
  const sampleNotification = {
    sender: safeString(sn.sender, clientName),
    body: safeString(sn.body, `A personalised update for you from ${clientName}.`),
    timeLabel: safeString(sn.timeLabel, 'now'),
  };
  const sh = (framingIn.statHighlight && typeof framingIn.statHighlight === 'object') ? framingIn.statHighlight : {};
  const statHighlight = {
    delta: safeString(sh.delta, '▲28.4%'),
    value: safeString(sh.value, '172'),
    label: safeString(sh.label, 'Profile uplift'),
  };

  const framing = {
    useCase: safeString(framingIn.useCase, `I want to deliver a personalised experience for ${clientName} customers.`),
    priority,
    technology: cleanTech,
    benefits,
    sampleNotification,
    statHighlight,
  };

  // Experience
  const expIn = (j.experience && typeof j.experience === 'object') ? j.experience : {};
  const personaIn = (expIn.persona && typeof expIn.persona === 'object') ? expIn.persona : {};
  const persona = {
    name: safeString(personaIn.name, 'Customer'),
    traits: (Array.isArray(personaIn.traits) ? personaIn.traits : []).map((t) => safeString(t)).filter(Boolean).slice(0, 4),
    summary: safeString(personaIn.summary, 'Anonymous to Known, real-time AI-driven engagement.'),
  };
  if (!persona.traits.length) persona.traits = ['New customer', 'Mobile-first'];

  const stepsRaw = Array.isArray(expIn.steps) ? expIn.steps.slice(0, stepCount) : [];
  while (stepsRaw.length < stepCount) {
    stepsRaw.push({ title: `Step ${stepsRaw.length + 1}`, description: `${persona.name} continues the journey.`, channel: 'Email', mockupKind: 'push' });
  }
  const steps = stepsRaw.map((s, i) => {
    const channel = (s && AJO_CHANNEL_SET.has(s.channel)) ? s.channel : 'Email';
    const mockupKind = (s && MOCKUP_KINDS.includes(s.mockupKind)) ? s.mockupKind : (i === 0 ? 'web' : 'push');
    return {
      title: safeString(s && s.title, `Step ${i + 1}`),
      description: safeString(s && s.description, `${persona.name} continues the journey.`),
      channel,
      mockupKind,
    };
  });

  const experience = {
    title: safeString(expIn.title, 'Experience Elevation'),
    subtitle: safeString(expIn.subtitle, 'Driving engagement & loyalty'),
    persona,
    steps,
  };

  // Value
  const valIn = (j.value && typeof j.value === 'object') ? j.value : {};
  const defaultProps = ['relevant', 'personalized', 'timely'];
  const defaultIcons = ['file-search', 'user', 'clock'];
  const valueProps = ensureLength(valIn.valueProps, 3, (i) => ({ icon: defaultIcons[i] || 'check', boldWord: defaultProps[i] || 'better', text: 'More ' + (defaultProps[i] || 'aligned') })).map((v, i) => {
    // Prefer the explicit boldWord, otherwise lift the last word from
    // "text" (covers "More relevant" → "relevant").
    const rawBold = safeString(v && v.boldWord, '').trim();
    const rawText = safeString(v && v.text, '').trim();
    let boldWord = rawBold;
    if (!boldWord && rawText) {
      const parts = rawText.split(/\s+/);
      boldWord = parts[parts.length - 1] || (defaultProps[i] || 'better');
    }
    if (!boldWord) boldWord = defaultProps[i] || 'better';
    // Normalise "text" so it always reads "More <boldWord>" — the
    // renderer renders this consistently regardless of what Vertex sent.
    let text = rawText;
    if (!text || !new RegExp('\\b' + boldWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(text)) {
      text = 'More ' + boldWord;
    }
    return {
      icon: safeString(v && v.icon, defaultIcons[i] || 'check'),
      boldWord,
      text,
    };
  });

  // Headline + boldWord: ensure boldWord appears in headline (else
  // renderer skips emphasis). If missing, try the first valueProp word.
  let headline = safeString(valIn.headline, 'Stand out with customer-centric engagement.');
  let valueBold = safeString(valIn.boldWord, '').trim();
  if (!valueBold || !headline.toLowerCase().includes(valueBold.toLowerCase())) {
    // Fall back to the first significant word in the headline (skip "be"/"is"/etc.).
    const hWords = headline.replace(/[.,;:!?]/g, '').split(/\s+/).filter((w) => w.length > 3);
    valueBold = hWords[0] || (valueProps[0] && valueProps[0].boldWord) || '';
  }

  const value = {
    headline,
    boldWord: valueBold,
    subheading: safeString(valIn.subheading, "Don't push more volume. Instead, be..."),
    valueProps,
    takeaway: safeString(valIn.takeaway, `Go beyond siloed channel-centric interactions by putting the customer at the centre of ${clientName}'s engagement.`),
  };

  return {
    client: {
      name: clientName,
      slug: slugify(clientName),
      domain: safeString(overrides.domain, ''),
      brandColour,
      darkColour: dark,
      industry: safeString(overrides.industry, ''),
    },
    framing,
    experience,
    value,
  };
}

// ─── ICONS (Feather-style, used in benefit pills + value props) ──────────────
//
// Map the icon keyword Gemini emits to a small inline SVG so the HTML
// renders consistent line-art glyphs. Anything unknown falls back to
// "zap" (a generic spark) so we never render a missing-icon hole.

const ICON_PATHS = {
  zap: '<polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  shuffle: '<polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  'trending-up': '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
  heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
  gift: '<polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  'check-circle': '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  'file-search': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><circle cx="11.5" cy="14.5" r="2.5"/><line x1="13.27" y1="16.27" x2="15" y2="18"/>',
  database: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  smile: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>',
  globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
};

function iconSvg(name, size = 20) {
  const key = String(name || '').toLowerCase().replace(/\s+/g, '-');
  const body = ICON_PATHS[key] || ICON_PATHS.zap;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}

// ─── HTML RENDERERS ──────────────────────────────────────────────────────────

const ADOBE_RED = '#FA0F00';
const ADOBE_LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 210" width="48" height="42" aria-hidden="true">
  <path d="M150 0H240V210L150 0Z" fill="${ADOBE_RED}"/>
  <path d="M90 0H0V210L90 0Z" fill="${ADOBE_RED}"/>
  <path d="M120 78L177 210H139L122 167H80L120 78Z" fill="${ADOBE_RED}"/>
</svg>`;

function commonStyles(brand, dark) {
  return `
    :root {
      --brand: ${brand};
      --brand-dark: ${dark};
      --brand-light: ${brand}26; /* ~15% alpha */
      --ink: #1a1a1a;
      --ink-soft: #4a5060;
      --ink-mute: #7d8492;
      --bg: #ffffff;
      --panel: #f5f6f8;
      --border: #e3e6eb;
      --adobe-red: ${ADOBE_RED};
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; height: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Adobe Clean', Roboto, sans-serif; color: var(--ink); background: var(--bg); }
    .deck-slide { width: 100%; height: 100vh; min-height: 600px; display: flex; flex-direction: column; padding: 38px 56px 22px; position: relative; overflow: hidden; }
    .deck-footer { position: absolute; left: 56px; right: 56px; bottom: 14px; display: flex; align-items: center; justify-content: space-between; font-size: 9.5px; color: var(--ink-mute); }
    .deck-footer .copyright { letter-spacing: 0.2px; }
    .adobe-logo { display: inline-flex; align-items: center; gap: 6px; }
    .adobe-logo .wordmark { font-weight: 700; color: var(--adobe-red); font-size: 18px; letter-spacing: -0.2px; }
    /* Replaceable image slots — find by [data-demo-slot] in devtools or HTML export */
    .demo-slot { position: relative; }
    .demo-slot--fill { width: 100%; height: 100%; min-height: 0; }
    .demo-slot[data-demo-slot-state="placeholder"] .demo-slot-inner {
      outline: 2px dashed var(--border); outline-offset: -2px;
    }
    .demo-slot-cap {
      position: absolute; right: 10px; bottom: 10px; z-index: 3;
      max-width: 55%; text-align: right;
      font-size: 9.5px; font-weight: 700; letter-spacing: 0.03em; text-transform: uppercase;
      color: var(--ink-mute);
      background: rgba(255,255,255,0.94); padding: 4px 8px; border-radius: 4px;
      pointer-events: none; line-height: 1.25;
      border: 1px solid var(--border);
    }
  `;
}

function imageSlotUploaded(images, key) {
  const v = images && images[key];
  return typeof v === 'string' && (v.startsWith('data:') || isHttpImageUrl(v));
}

/** Wrap a replaceable bitmap/SVG zone. `state` is "upload" | "placeholder". */
function wrapDemoSlot(slotId, humanLabel, state, innerHtml, opts = {}) {
  const showLabel = opts.showLabel !== false;
  const cap = (showLabel && state === 'placeholder')
    ? `<span class="demo-slot-cap">${escapeHtml(humanLabel)}</span>`
    : '';
  return `<div class="demo-slot demo-slot--fill" data-demo-slot="${escapeAttr(slotId)}" data-demo-slot-state="${escapeAttr(state)}"><div class="demo-slot-inner">${innerHtml}</div>${cap}</div>`;
}

function renderFramingHtml(data, images) {
  const c = data.client || {};
  const brand = normaliseHex(c.brandColour);
  const dark = c.darkColour || darken(brand, 0.25);
  const f = data.framing || {};
  // Brand surface = customer's site / product UI (slide-1 hero zone).
  // Falls back to a stylised browser screenshot in the brand colour.
  const brandSurface = resolveBrandSurface(images, brand, c.name);
  const techList = (f.technology || []).join(' · ');
  const benefits = (f.benefits || []).slice(0, 4);
  const sn = f.sampleNotification || {};
  const sh = f.statHighlight || {};
  const surfaceState = imageSlotUploaded(images, 'brandSurface') ? 'upload' : 'placeholder';
  const surfaceInner = brandSurface.kind === 'svg' ? brandSurface.inlineSvg : `<img src="${escapeAttr(brandSurface.src)}" alt="${escapeAttr(c.name)} surface">`;

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=1280, initial-scale=1">
<title>${escapeHtml(c.name)} — Use case framing</title>
<style>${commonStyles(brand, dark)}
  /* ── Top metadata row ──────────────────────────────────────────── */
  .meta-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; }
  .chip {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 7px 14px; border-radius: 999px;
    background: #ffffff; border: 1.5px solid var(--border);
    font-size: 11.5px; color: var(--ink); font-weight: 600;
  }
  .chip .chip-label { color: var(--ink-mute); font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; font-size: 10px; }
  .chip.priority .priority-dot {
    width: 18px; height: 18px; border-radius: 50%;
    background: var(--brand); color: #fff;
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 10px; font-weight: 800;
  }
  .chip.tech { padding: 6px 14px 6px 8px; }
  .chip.tech .adobe-mark { display: inline-flex; align-items: center; }
  /* ── Body grid ─────────────────────────────────────────────────── */
  .framing-body {
    display: grid; grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.05fr);
    gap: 28px; flex: 1 1 auto; min-height: 0;
  }
  .col-left { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
  .col-right { position: relative; min-width: 0; display: flex; flex-direction: column; }
  /* Use-case quote card (top of left column) */
  .use-case-card {
    background: var(--brand-light);
    border: 1.5px solid var(--brand);
    color: var(--ink);
    padding: 18px 22px;
    border-radius: 12px;
    font-size: 17px;
    line-height: 1.4;
    font-weight: 600;
    position: relative;
  }
  .use-case-card .label {
    display: inline-block;
    background: var(--brand);
    color: #ffffff;
    padding: 3px 9px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.5px;
    margin-right: 8px;
    vertical-align: middle;
    text-transform: uppercase;
  }
  /* Benefits grid (4 outcome cards) */
  .benefits-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
  }
  .benefit-card {
    background: #ffffff; border: 1px solid var(--border);
    border-radius: 12px; padding: 14px 16px;
    display: flex; flex-direction: column; gap: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  }
  .benefit-card .ic {
    width: 32px; height: 32px; border-radius: 8px;
    background: var(--panel); color: var(--ink-mute);
    border: 1px solid var(--border);
    display: inline-flex; align-items: center; justify-content: center;
  }
  .benefit-card .text { font-size: 12.5px; line-height: 1.35; color: var(--ink); font-weight: 600; }
  /* Industry illustration accent (slide-1 footer, watermark style) */
  .industry-accent {
    margin-top: auto;
    color: var(--ink-mute);
    opacity: 0.85;
    align-self: flex-start;
    line-height: 0;
  }
  .industry-accent svg { width: 320px; height: 90px; }
  /* Right column — brand surface placeholder + overlap notification */
  .surface-stage {
    position: relative;
    flex: 1 1 auto; min-height: 0;
    border-radius: 14px; overflow: visible;
  }
  .surface-stage .demo-slot--fill { position: absolute; inset: 0; z-index: 1; }
  .surface-stage .demo-slot-inner { position: relative; width: 100%; height: 100%; min-height: 0; }
  .surface-frame {
    position: absolute; inset: 0;
    border-radius: 14px; overflow: hidden;
    box-shadow: 0 14px 36px rgba(0, 0, 0, 0.12);
    background: var(--panel);
  }
  .surface-frame img, .surface-frame svg { width: 100%; height: 100%; object-fit: cover; display: block; }
  /* Floating iOS-style notification card overlapping the surface */
  .notification {
    position: absolute;
    z-index: 5;
    right: -14px; top: -14px;
    width: 300px;
    background: #ffffff; border-radius: 18px;
    padding: 12px 14px;
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.18);
    display: grid; grid-template-columns: 36px 1fr; gap: 12px;
  }
  .notification .badge {
    width: 36px; height: 36px; border-radius: 50%;
    background: var(--brand); color: #fff;
    display: inline-flex; align-items: center; justify-content: center;
    font-weight: 800; font-size: 14px;
  }
  .notification .meta {
    display: flex; align-items: baseline; justify-content: space-between; gap: 8px;
  }
  .notification .sender { font-weight: 700; font-size: 12.5px; color: var(--ink); }
  .notification .time { font-size: 10.5px; color: var(--ink-mute); }
  .notification .body { font-size: 11.5px; color: var(--ink-soft); margin-top: 2px; line-height: 1.4; }
  /* Stat callout (bottom-left of stage) */
  .stat-card {
    position: absolute; z-index: 4;
    left: -16px; bottom: 24px;
    background: #ffffff; border-radius: 12px;
    padding: 12px 16px; min-width: 116px;
    box-shadow: 0 12px 28px rgba(0, 0, 0, 0.14);
    text-align: center;
  }
  .stat-card .delta { color: #1aa55b; font-weight: 700; font-size: 13px; }
  .stat-card .value { font-size: 26px; font-weight: 800; color: var(--ink); margin: 2px 0; line-height: 1; }
  .stat-card .label { font-size: 9px; color: var(--ink-mute); text-transform: uppercase; letter-spacing: 0.4px; }
</style></head>
<body>
  <section class="deck-slide">
    <div class="meta-row">
      <span class="chip priority">
        <span class="chip-label">Priority</span>
        <span class="priority-dot" title="${escapeAttr(f.priority || 'High')}">${escapeHtml((f.priority || 'High').slice(0, 1))}</span>
      </span>
      <span class="chip tech">
        <span class="adobe-mark">${ADOBE_LOGO_SVG.replace('width="48"', 'width="20"').replace('height="42"', 'height="18"')}</span>
        <span class="chip-label" style="margin-right:6px;">Technology</span>
        <span>${escapeHtml(techList)}</span>
      </span>
    </div>

    <div class="framing-body">
      <div class="col-left">
        <div class="use-case-card">
          <span class="label">Use case</span>${escapeHtml(f.useCase)}
        </div>
        <div class="benefits-grid">
          ${benefits.map((b) => `
            <div class="benefit-card">
              <span class="ic">${iconSvg(b.icon, 16)}</span>
              <span class="text">${escapeHtml(b.text)}</span>
            </div>
          `).join('')}
        </div>
        <div class="industry-accent" aria-hidden="true">${industryIllustrationSvg(c.industry, { width: 320, height: 90 })}</div>
      </div>
      <div class="col-right">
        <div class="surface-stage">
          ${wrapDemoSlot('framing.brandSurface', 'Brand hero screenshot', surfaceState, `<div class="surface-frame">${surfaceInner}</div>`)}
          <div class="notification">
            <span class="badge">${escapeHtml((sn.sender || c.name || 'B').slice(0, 1).toUpperCase())}</span>
            <div>
              <div class="meta">
                <span class="sender">${escapeHtml(sn.sender || c.name)}</span>
                <span class="time">${escapeHtml(sn.timeLabel || 'now')}</span>
              </div>
              <div class="body">${escapeHtml(sn.body || 'A personalised update for you.')}</div>
            </div>
          </div>
          <div class="stat-card">
            <div class="delta">${escapeHtml(sh.delta || '▲28.4%')}</div>
            <div class="value">${escapeHtml(sh.value || '172')}</div>
            <div class="label">${escapeHtml(sh.label || 'Profile uplift')}</div>
          </div>
        </div>
      </div>
    </div>
    <div class="deck-footer">
      <span class="adobe-logo"><span class="wordmark">Adobe</span></span>
      <span class="copyright">© ${new Date().getFullYear()} Adobe. All Rights Reserved. Adobe Confidential.</span>
    </div>
  </section>
</body></html>`;
}

function renderExperienceHtml(data, images) {
  const c = data.client || {};
  const brand = normaliseHex(c.brandColour);
  const dark = c.darkColour || darken(brand, 0.25);
  const e = data.experience || {};
  const persona = e.persona || { name: 'Customer', traits: [], summary: '' };
  const personaImg = resolvePersonaImage(images, persona.name, c.name, brand, 'html');
  const personaState = imageSlotUploaded(images, 'persona') ? 'upload' : 'placeholder';
  const personaInner = personaImg.kind === 'svg'
    ? `<span class="svg-wrap">${personaImg.inlineSvg || ''}</span>`
    : `<img src="${escapeAttr(personaImg.src)}" alt="">`;
  const steps = e.steps || [];
  const n = steps.length;

  // Pre-render every step's mockup + info into a hidden panel so the
  // presenter can click between them without the iframe having to re-
  // mount or fetch anything. Each click swaps which panel is visible
  // (and which timeline node is active) — essentially the journey map's
  // click-through pattern, applied to a 5/6/7-step demo story.
  const stagePanels = steps.map((step, i) => {
    const mockupSvg = stepMockupSvg(step, brand, persona.name, c.name);
    return `<div class="stage-panel" data-stage="${i}"${i === 0 ? '' : ' hidden'}>
      <div class="stage-mockup">${mockupSvg}</div>
      <div class="stage-info">
        <div class="stage-eyebrow">Step <span class="stage-num">${i + 1}</span> of ${n}</div>
        <div class="stage-title">${escapeHtml(step.title)}</div>
        <div class="stage-desc">${escapeHtml(step.description)}</div>
        <div class="stage-channel"><span class="ch-dot"></span><span>${escapeHtml(step.channel)}</span></div>
      </div>
    </div>`;
  }).join('');

  // Timeline strip across the top: numbered buttons + connector lines.
  // Each button has a label (the step title) below it that wraps so 7
  // steps still fit comfortably on a 16:9 stage. Connectors are full-
  // width <span>s sized by flex; CSS toggles their colour as the active
  // index moves.
  const timelineItems = steps.map((step, i) => {
    return `<button type="button" class="step-btn" data-step="${i}" aria-label="Jump to step ${i + 1}: ${escapeAttr(step.title)}">
      <span class="step-num">${i + 1}</span>
      <span class="step-title-pill">${escapeHtml(step.title)}</span>
    </button>` + (i < n - 1 ? '<span class="step-connector" aria-hidden="true"></span>' : '');
  }).join('');

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=1280, initial-scale=1">
<title>${escapeHtml(c.name)} — Experience walkthrough</title>
<style>${commonStyles(brand, dark)}
  .experience { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; }
  .experience-header { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 12px; gap: 16px; }
  .experience-title { font-size: 28px; font-weight: 800; color: var(--ink); letter-spacing: -0.4px; }
  .experience-subtitle { font-size: 14px; color: var(--ink-soft); font-weight: 500; margin-top: 2px; }
  .step-progress { font-size: 12px; color: var(--ink-mute); font-weight: 700; letter-spacing: 0.3px; text-transform: uppercase; }
  .step-progress .step-progress-current { color: var(--brand); font-size: 16px; }
  /* Persona block — bigger photo, name + traits stacked beside it */
  .persona-block { display: grid; grid-template-columns: 88px 1fr; gap: 16px; align-items: center; margin: 0 0 16px; }
  .persona-block .photo {
    width: 88px; height: 88px; border-radius: 50%;
    background: var(--panel); border: 3px solid var(--border);
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08);
    position: relative;
  }
  .persona-block .photo .demo-slot { border-radius: 50%; overflow: hidden; height: 100%; }
  .persona-block .photo .demo-slot-inner { width: 100%; height: 100%; }
  .persona-block .photo img, .persona-block .photo svg { width: 100%; height: 100%; object-fit: cover; display: block; }
  .persona-block .photo .svg-wrap { width: 100%; height: 100%; display: block; }
  .persona-name { font-size: 17px; font-weight: 800; color: var(--ink); letter-spacing: -0.2px; }
  .persona-traits { font-size: 11.5px; color: var(--ink-soft); margin-top: 4px; }
  .persona-traits .trait { display: inline-flex; align-items: center; gap: 4px; margin-right: 8px; }
  .persona-traits .trait::before { content: "•"; color: var(--brand); font-weight: 800; margin-right: 2px; }
  .persona-traits .trait:first-child::before { content: ""; margin-right: 0; }
  .persona-summary { font-size: 12px; color: var(--ink-soft); margin-top: 3px; font-style: italic; line-height: 1.4; }

  /* ── Timeline strip ─────────────────────────────────────────────── */
  .step-timeline {
    display: flex; align-items: stretch; justify-content: stretch;
    gap: 0; margin: 6px 0 18px;
  }
  .step-btn {
    flex: 0 0 auto;
    display: inline-flex; flex-direction: column; align-items: center; gap: 6px;
    padding: 6px 4px 0; background: transparent; border: 0; cursor: pointer;
    color: var(--ink-mute); font-family: inherit; min-width: 0;
    transition: color var(--node-fade, 0.4s ease-in-out);
    --node-fade: 0.45s;
  }
  .step-btn .step-num {
    width: 36px; height: 36px; border-radius: 50%;
    background: #fff; border: 2px solid #c9ced8; color: #6b7180;
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 14px; font-weight: 700;
    transition: background-color var(--node-fade), border-color var(--node-fade), color var(--node-fade), transform var(--node-fade), box-shadow var(--node-fade);
  }
  .step-btn .step-title-pill {
    font-size: 10px; font-weight: 600; color: var(--ink-mute);
    text-align: center; max-width: 90px; line-height: 1.2;
    transition: color var(--node-fade), font-weight var(--node-fade);
    word-break: break-word;
  }
  .step-btn:hover .step-num { border-color: var(--brand); color: var(--brand); }
  .step-btn:hover .step-title-pill { color: var(--brand); }
  .step-btn.is-done .step-num { background: var(--brand-light); border-color: var(--brand); color: var(--brand); }
  .step-btn.is-done .step-title-pill { color: var(--ink-soft); }
  .step-btn.is-active .step-num {
    background: var(--brand); border-color: var(--brand); color: #fff;
    transform: scale(1.08);
    box-shadow: 0 0 0 4px var(--brand-light);
  }
  .step-btn.is-active .step-title-pill { color: var(--ink); font-weight: 700; }
  .step-connector {
    flex: 1 1 auto; align-self: center; height: 2px;
    background: #c9ced8; margin: 0 4px; min-width: 8px;
    border-radius: 1px;
    transition: background-color var(--node-fade, 0.4s ease-in-out);
  }
  .step-connector.is-done { background: var(--brand); }

  /* ── Stage (active step's full mockup + info) ───────────────────── */
  .stage-wrap {
    flex: 1 1 auto; min-height: 0;
    background: #fafbfc;
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 22px;
    display: flex; flex-direction: column;
    gap: 16px;
  }
  .stage-panels { flex: 1 1 auto; min-height: 0; position: relative; }
  .stage-panel {
    display: grid; grid-template-columns: minmax(280px, 1.1fr) minmax(0, 1.1fr); gap: 28px;
    align-items: start; height: 100%;
    animation: stageIn 0.45s ease-in-out both;
  }
  .stage-panel[hidden] { display: none; }
  @keyframes stageIn {
    0% { opacity: 0; transform: translateY(6px); }
    100% { opacity: 1; transform: translateY(0); }
  }
  .stage-mockup {
    display: flex; align-items: center; justify-content: center;
    min-height: 200px; padding: 6px;
    align-self: center;
  }
  .stage-mockup svg {
    max-width: 100%; max-height: min(52vh, 380px);
    filter: drop-shadow(0 8px 22px rgba(0, 0, 0, 0.12));
  }
  .stage-info { display: flex; flex-direction: column; gap: 12px; }
  .stage-eyebrow {
    font-size: 11px; font-weight: 800; color: var(--brand);
    text-transform: uppercase; letter-spacing: 0.5px;
  }
  .stage-eyebrow .stage-num { font-size: 14px; }
  .stage-title { font-size: 28px; font-weight: 800; color: var(--ink); letter-spacing: -0.4px; line-height: 1.1; }
  .stage-desc { font-size: 15px; color: var(--ink-soft); line-height: 1.55; max-width: 560px; }
  .stage-channel {
    display: inline-flex; align-items: center; gap: 8px;
    margin-top: 6px; padding: 6px 12px;
    font-size: 11px; font-weight: 800; color: var(--brand); background: var(--brand-light);
    text-transform: uppercase; letter-spacing: 0.4px;
    border-radius: 999px; align-self: flex-start;
  }
  .stage-channel .ch-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--brand); }

  /* ── Stage footer (Prev / Next) ─────────────────────────────────── */
  .stage-controls {
    display: flex; align-items: center; justify-content: space-between;
    gap: 10px; margin-top: 8px; flex-shrink: 0;
  }
  .stage-controls .control-hint {
    font-size: 10.5px; color: var(--ink-mute);
    margin: 0 auto; opacity: 0.85;
  }
  .stage-btn {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 8px 14px; min-width: 100px;
    background: #fff; color: var(--ink);
    border: 1.5px solid var(--border); border-radius: 999px;
    font-family: inherit; font-size: 12px; font-weight: 700;
    cursor: pointer; transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
  }
  .stage-btn:hover:not(:disabled) { background: var(--brand-light); border-color: var(--brand); color: var(--brand); }
  .stage-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .stage-btn.is-primary { background: var(--brand); border-color: var(--brand); color: #fff; }
  .stage-btn.is-primary:hover:not(:disabled) { background: var(--brand-dark); border-color: var(--brand-dark); color: #fff; }
  .stage-btn .arrow { font-size: 14px; line-height: 1; }

  @media (prefers-reduced-motion: reduce) {
    .step-btn .step-num, .step-btn .step-title-pill, .step-connector,
    .stage-panel { transition: none !important; animation: none !important; }
  }
</style></head>
<body>
  <section class="deck-slide experience">
    <div class="experience-header">
      <div>
        <div class="experience-title">${escapeHtml(e.title)}</div>
        <div class="experience-subtitle">${escapeHtml(e.subtitle)}</div>
      </div>
      <div class="step-progress" aria-live="polite">
        Step <span class="step-progress-current" id="stepProgressCurrent">1</span> of ${n}
      </div>
    </div>
    <div class="persona-block">
      <span class="photo">${wrapDemoSlot('experience.persona', 'Persona headshot', personaState, personaInner, { showLabel: false })}</span>
      <div>
        <div class="persona-name">${escapeHtml(persona.name)}</div>
        <div class="persona-traits">${(persona.traits || []).map((t) => `<span class="trait">${escapeHtml(t)}</span>`).join(' ')}</div>
        <div class="persona-summary">${escapeHtml(persona.summary)}</div>
      </div>
    </div>

    <div class="step-timeline" role="tablist" aria-label="Demo steps">${timelineItems}</div>

    <div class="stage-wrap">
      <div class="stage-panels" id="stagePanels">${stagePanels}</div>
      <div class="stage-controls">
        <button type="button" class="stage-btn" id="navPrev" aria-label="Previous step">
          <span class="arrow">◀</span><span>Previous</span>
        </button>
        <span class="control-hint">Click a step or use ← → arrow keys to advance</span>
        <button type="button" class="stage-btn is-primary" id="navNext" aria-label="Next step">
          <span>Next</span><span class="arrow">▶</span>
        </button>
      </div>
    </div>

    <div class="deck-footer">
      <span class="adobe-logo"><span class="wordmark">Adobe</span></span>
      <span class="copyright">© ${new Date().getFullYear()} Adobe. All Rights Reserved. Adobe Confidential.</span>
    </div>
  </section>

  <script>
  (function () {
    var n = ${n};
    var current = 0;
    var btns = Array.prototype.slice.call(document.querySelectorAll('.step-btn'));
    var connectors = Array.prototype.slice.call(document.querySelectorAll('.step-connector'));
    var panels = Array.prototype.slice.call(document.querySelectorAll('.stage-panel'));
    var prevBtn = document.getElementById('navPrev');
    var nextBtn = document.getElementById('navNext');
    var progressEl = document.getElementById('stepProgressCurrent');

    function activate(i) {
      if (i < 0) i = 0;
      if (i > n - 1) i = n - 1;
      current = i;
      // Step buttons + connectors: done = brand-coloured, active =
      // brand-filled, future = grey.
      btns.forEach(function (b, j) {
        b.classList.toggle('is-active', j === i);
        b.classList.toggle('is-done', j < i);
        b.setAttribute('aria-current', j === i ? 'step' : 'false');
      });
      connectors.forEach(function (c, j) {
        // Connector j sits between btns[j] and btns[j+1].
        c.classList.toggle('is-done', j < i);
      });
      // Stage panel: only show the active one. Re-set hidden then remove
      // from the active so the CSS animation re-runs on every advance.
      panels.forEach(function (p, j) {
        if (j === i) {
          p.hidden = false;
          // Force re-trigger the entry animation by toggling a no-op class.
          p.style.animation = 'none';
          // eslint-disable-next-line no-unused-expressions
          p.offsetHeight;
          p.style.animation = '';
        } else {
          p.hidden = true;
        }
      });
      prevBtn.disabled = i === 0;
      nextBtn.disabled = i === n - 1;
      if (progressEl) progressEl.textContent = String(i + 1);
    }

    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        var idx = parseInt(b.getAttribute('data-step'), 10);
        if (!isNaN(idx)) activate(idx);
      });
    });
    prevBtn.addEventListener('click', function () { activate(current - 1); });
    nextBtn.addEventListener('click', function () { activate(current + 1); });

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'ArrowRight' || ev.key === 'PageDown' || ev.key === ' ') {
        ev.preventDefault();
        activate(current + 1);
      } else if (ev.key === 'ArrowLeft' || ev.key === 'PageUp') {
        ev.preventDefault();
        activate(current - 1);
      } else if (ev.key === 'Home') {
        ev.preventDefault();
        activate(0);
      } else if (ev.key === 'End') {
        ev.preventDefault();
        activate(n - 1);
      } else if (/^[1-9]$/.test(ev.key)) {
        var num = parseInt(ev.key, 10) - 1;
        if (num < n) activate(num);
      }
    });

    activate(0);
  })();
  </script>
</body></html>`;
}

function renderValueHtml(data, images) {
  const c = data.client || {};
  const brand = normaliseHex(c.brandColour);
  const dark = c.darkColour || darken(brand, 0.25);
  const v = data.value || {};
  // Slide-4 image zones: lifestyle hero + AEP-in-action composite. Both
  // use neutral SVG fallbacks and data-demo-slot wrappers for easy swaps.
  const lifestyle = resolveLifestyleImage(images, c.industry, brand, 'html');
  const composite = resolveAepComposite(
    images,
    brand,
    (data.experience && data.experience.persona && data.experience.persona.name) || '',
    data.framing && data.framing.sampleNotification
  );
  const lifestyleState = imageSlotUploaded(images, 'lifestyle') ? 'upload' : 'placeholder';
  const lifestyleInner = lifestyle.kind === 'svg' ? lifestyle.inlineSvg : `<img src="${escapeAttr(lifestyle.src)}" alt="">`;
  const compositeState = imageSlotUploaded(images, 'aepComposite') ? 'upload' : 'placeholder';
  const compositeInner = composite.kind === 'svg' ? composite.inlineSvg : `<img src="${escapeAttr(composite.src)}" alt="AEP composite">`;

  // Render the headline with the boldWord emphasised in brand colour.
  // Reference deck does the same with "Stand out" in red — we adopt the
  // pattern but use the dynamic brand colour so recolour still works.
  function emphasise(text, word) {
    const escaped = escapeHtml(text);
    if (!word) return escaped;
    const wordEsc = escapeHtml(word);
    if (!escaped.toLowerCase().includes(wordEsc.toLowerCase())) return escaped;
    const idx = escaped.toLowerCase().indexOf(wordEsc.toLowerCase());
    return escaped.slice(0, idx) +
      '<span class="brand-emph">' + escaped.substr(idx, wordEsc.length) + '</span>' +
      escaped.slice(idx + wordEsc.length);
  }
  const headlineHtml = emphasise(v.headline, v.boldWord);

  // Highlight the strongest phrase in the takeaway. We try the boldWord
  // and a few common AEP value phrases; first hit wins.
  let takeawayHtml = escapeHtml(v.takeaway);
  const emphCandidates = [
    v.boldWord,
    'customer at the center',
    'customer at the centre',
    'customer-centric',
    'real-time',
    'personalised',
    'personalized',
  ].filter(Boolean);
  for (const phrase of emphCandidates) {
    const safe = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('(' + safe + ')', 'i');
    if (re.test(v.takeaway)) {
      takeawayHtml = escapeHtml(v.takeaway).replace(re, '<span class="brand-emph">$1</span>');
      break;
    }
  }

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=1280, initial-scale=1">
<title>${escapeHtml(c.name)} — Value return</title>
<style>${commonStyles(brand, dark)}
  /* Top headline + value-prop band, full-width */
  .value-top {
    display: flex; flex-direction: column; gap: 18px;
    margin-bottom: 22px;
  }
  .value-headline {
    font-size: 56px; font-weight: 800; line-height: 1.05;
    color: var(--ink); letter-spacing: -1.2px;
    max-width: 1000px;
  }
  .brand-emph { color: var(--brand); }
  .value-subhead {
    font-size: 18px; color: var(--ink-soft); font-weight: 500;
    max-width: 760px;
  }
  .value-props {
    display: flex; gap: 28px; align-items: center; margin-top: 6px;
    flex-wrap: wrap;
  }
  .value-prop {
    display: inline-flex; align-items: center; gap: 12px;
    font-size: 24px; color: var(--ink); font-weight: 500;
  }
  .value-prop .ic {
    width: 44px; height: 44px; border-radius: 10px;
    background: var(--panel); color: var(--ink-mute);
    border: 1px solid var(--border);
    display: inline-flex; align-items: center; justify-content: center;
  }
  .value-prop b { font-weight: 800; color: var(--ink); }
  .value-prop .more { color: var(--ink-soft); font-weight: 500; margin-right: 4px; }

  /* Body grid: lifestyle hero (left, smaller) + AEP composite (right, larger) */
  .value-body {
    flex: 1 1 auto; min-height: 0;
    display: grid; grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.3fr); gap: 28px;
  }
  .lifestyle-zone {
    position: relative; border-radius: 14px; overflow: hidden;
    min-height: 320px; background: var(--panel);
    box-shadow: 0 12px 28px rgba(0, 0, 0, 0.10);
  }
  .lifestyle-zone .lifestyle-img {
    position: absolute; inset: 0; line-height: 0;
  }
  .lifestyle-zone .lifestyle-img .demo-slot { position: absolute; inset: 0; }
  .lifestyle-zone .lifestyle-img .demo-slot-inner { width: 100%; height: 100%; }
  .lifestyle-zone .lifestyle-img img,
  .lifestyle-zone .lifestyle-img svg { width: 100%; height: 100%; object-fit: cover; display: block; }
  .composite-zone {
    position: relative;
    border-radius: 14px; padding: 18px;
    background: #ffffff; border: 1px solid var(--border);
    display: flex; flex-direction: column; gap: 12px;
    min-height: 320px;
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.04);
  }
  .composite-eyebrow {
    font-size: 10.5px; font-weight: 800; color: var(--ink-mute);
    text-transform: uppercase; letter-spacing: 0.5px;
  }
  .composite-eyebrow .composite-tag {
    display: inline-block; margin-left: 8px; padding: 2px 8px;
    background: var(--brand-light); color: var(--brand);
    border-radius: 999px; font-size: 10px; font-weight: 700;
    text-transform: none; letter-spacing: 0;
  }
  .composite-canvas {
    flex: 1 1 auto; min-height: 0;
    display: flex; align-items: center; justify-content: center;
    line-height: 0;
    position: relative;
  }
  .composite-canvas .demo-slot { width: 100%; flex: 1 1 auto; min-height: 220px; display: flex; align-items: center; justify-content: center; }
  .composite-canvas .demo-slot-inner { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
  .composite-canvas svg, .composite-canvas img {
    max-width: 100%; max-height: 100%; display: block;
  }

  /* Takeaway band sits beneath the body grid */
  .takeaway-band {
    margin-top: 16px; padding: 16px 22px;
    background: #1a1a2a; color: #ffffff;
    border-radius: 12px;
    font-size: 17px; font-weight: 600; line-height: 1.35;
  }
  .takeaway-band .brand-emph { color: var(--brand); }
</style></head>
<body>
  <section class="deck-slide">
    <div class="value-top">
      <div class="value-headline">${headlineHtml}</div>
      ${v.subheading ? `<div class="value-subhead">${escapeHtml(v.subheading)}</div>` : ''}
      <div class="value-props">
        ${(v.valueProps || []).slice(0, 3).map((p) => `
          <div class="value-prop">
            <span class="ic">${iconSvg(p.icon, 22)}</span>
            <span><span class="more">More</span><b>${escapeHtml(p.boldWord || p.text || '')}</b></span>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="value-body">
      <div class="lifestyle-zone">
        <div class="lifestyle-img">${wrapDemoSlot('value.lifestyle', 'Lifestyle / hero photo', lifestyleState, lifestyleInner)}</div>
      </div>
      <div class="composite-zone">
        <div class="composite-eyebrow">
          <span>Adobe Experience Platform · in action</span>
          <span class="composite-tag">live</span>
        </div>
        <div class="composite-canvas">${wrapDemoSlot('value.aepComposite', 'AEP + message composite', compositeState, compositeInner)}</div>
      </div>
    </div>

    <div class="takeaway-band">${takeawayHtml}</div>

    <div class="deck-footer">
      <span class="adobe-logo"><span class="wordmark">Adobe</span></span>
      <span class="copyright">© ${new Date().getFullYear()} Adobe. All Rights Reserved. Adobe Confidential.</span>
    </div>
  </section>
</body></html>`;
}

// ─── PPTX RENDERER (PptxGenJS) ───────────────────────────────────────────────

const PPTX_REMOTE_IMAGE_TIMEOUT_MS = 25000;

async function fetchUrlAsPptxImageData(url) {
  const resp = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(PPTX_REMOTE_IMAGE_TIMEOUT_MS),
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; AEP-Orchestration-Lab-demo-pptx/1.0)',
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const buf = Buffer.from(await resp.arrayBuffer());
  const ct = (resp.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  let mime = ct.startsWith('image/') ? ct : '';
  if (!mime && buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xd8) mime = 'image/jpeg';
  if (!mime && buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50) mime = 'image/png';
  if (!mime && buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') mime = 'image/webp';
  if (!mime) mime = 'image/jpeg';
  return `${mime};base64,${buf.toString('base64')}`;
}

async function materialisePptxSlot(resolved, fallbackResolved) {
  if (resolved.kind !== 'url') return resolved.src;
  try {
    return await fetchUrlAsPptxImageData(resolved.src);
  } catch (e) {
    console.warn('[demoPptx] remote image fetch failed, using placeholder', e && e.message);
    return fallbackResolved.src;
  }
}

async function renderDemoPptx(data, images) {
  const PptxGenJS = require('pptxgenjs');
  const pres = new PptxGenJS();
  pres.layout = 'LAYOUT_WIDE'; // 13.333 x 7.5 inches (16:9)
  pres.title = `${data.client.name} — Demo deck`;
  pres.author = 'Adobe AEP Orchestration Lab';

  const brand = normaliseHex(data.client.brandColour);
  const brandHex = brand.replace('#', '');
  const dark = darken(brand, 0.25).replace('#', '');
  const ink = '1A1A1A';
  const inkSoft = '4A5060';
  const inkMute = '7D8492';
  const adobeRed = ADOBE_RED.replace('#', '');

  const personaNameEarly = (data.experience && data.experience.persona && data.experience.persona.name) || 'Customer';
  const snEarly = data.framing && data.framing.sampleNotification;
  const empty = {};
  const brandSurfaceR = resolveBrandSurface(images, brand, data.client.name);
  const personaR = resolvePersonaImage(images, personaNameEarly, data.client.name, brand, 'pptx');
  const lifestyleR = resolveLifestyleImage(images, data.client.industry, brand, 'pptx');
  const aepR = resolveAepComposite(images, brand, personaNameEarly, snEarly);
  const [
    brandSurfacePptxData,
    personaPptxData,
    lifestylePptxData,
    aepPptxData,
  ] = await Promise.all([
    materialisePptxSlot(brandSurfaceR, resolveBrandSurface(empty, brand, data.client.name)),
    materialisePptxSlot(personaR, resolvePersonaImage(empty, personaNameEarly, data.client.name, brand, 'pptx')),
    materialisePptxSlot(lifestyleR, resolveLifestyleImage(empty, data.client.industry, brand, 'pptx')),
    materialisePptxSlot(aepR, resolveAepComposite(empty, brand, personaNameEarly, snEarly)),
  ]);

  function addFooter(slide) {
    slide.addText('Adobe', {
      x: 0.4, y: 7.05, w: 1.2, h: 0.3,
      color: adobeRed, fontSize: 14, bold: true,
    });
    slide.addText(`© ${new Date().getFullYear()} Adobe. All Rights Reserved. Adobe Confidential.`, {
      x: 4.0, y: 7.1, w: 9.0, h: 0.2,
      color: inkMute, fontSize: 8, align: 'right',
    });
  }

  // ─── SLIDE 1 — FRAMING ──────────────────────────────────────────────────
  // Layout mirrors the HTML output:
  //   • Top: Priority + Technology chips (full-width row)
  //   • Left col (≈ 6.0" wide): use-case quote card → 4 benefit cards
  //     in a 2×2 grid → industry illustration accent
  //   • Right col (≈ 6.5" wide): brand-surface placeholder / upload as
  //     the hero, with an iOS-style notification card overlapping the
  //     top edge and a stat callout pinned to the bottom-left.
  const s1 = pres.addSlide();
  s1.background = { color: 'FFFFFF' };

  // Top metadata row (chips)
  s1.addText(`Priority: ${data.framing.priority}`, {
    x: 0.4, y: 0.3, w: 1.6, h: 0.36,
    fontSize: 9, bold: true, color: ink,
    fill: { color: 'FFFFFF' }, line: { color: 'E3E6EB', width: 1 },
    align: 'center', valign: 'middle',
  });
  s1.addText(`Technology: ${data.framing.technology.join(' · ')}`, {
    x: 2.05, y: 0.3, w: 7.0, h: 0.36,
    fontSize: 9, bold: true, color: ink,
    fill: { color: 'FFFFFF' }, line: { color: 'E3E6EB', width: 1 },
    align: 'left', valign: 'middle', margin: [0, 8, 0, 8],
  });

  // Use-case quote card
  s1.addShape(pres.ShapeType.roundRect, {
    x: 0.4, y: 0.85, w: 6.0, h: 1.5,
    fill: { color: brandHex, transparency: 85 },
    line: { color: brandHex, width: 1.5 }, rectRadius: 0.12,
  });
  s1.addText('USE CASE', {
    x: 0.6, y: 1.0, w: 1.0, h: 0.32,
    fontSize: 9, bold: true, color: 'FFFFFF',
    fill: { color: brandHex }, align: 'center', valign: 'middle',
  });
  s1.addText(data.framing.useCase, {
    x: 0.6, y: 1.36, w: 5.6, h: 0.95,
    fontSize: 13, bold: true, color: ink, valign: 'top',
  });

  // 4 benefit cards in a 2x2 grid beneath the use case
  const benefitTop = 2.55;
  data.framing.benefits.slice(0, 4).forEach((b, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 0.4 + col * 3.05;
    const y = benefitTop + row * 1.3;
    s1.addShape(pres.ShapeType.roundRect, {
      x, y, w: 2.9, h: 1.2,
      fill: { color: 'FFFFFF' }, line: { color: 'E3E6EB', width: 1 }, rectRadius: 0.1,
    });
    s1.addShape(pres.ShapeType.roundRect, {
      x: x + 0.18, y: y + 0.18, w: 0.42, h: 0.42,
      fill: { color: brandHex }, line: { color: brandHex }, rectRadius: 0.08,
    });
    s1.addText('●', { x: x + 0.18, y: y + 0.18, w: 0.42, h: 0.42, fontSize: 14, color: 'FFFFFF', align: 'center', valign: 'middle' });
    s1.addText(b.text, {
      x: x + 0.18, y: y + 0.65, w: 2.55, h: 0.5,
      fontSize: 10.5, bold: true, color: ink, valign: 'top',
    });
  });

  // Industry illustration accent at the bottom of the left column
  const accentSvg = industryIllustrationSvg(data.client.industry, { width: 320, height: 90 });
  s1.addImage({
    data: 'data:image/svg+xml;base64,' + Buffer.from(accentSvg.replace(/currentColor/g, brand)).toString('base64'),
    x: 0.4, y: 5.4, w: 3.2, h: 0.8,
  });

  // Right column — brand surface hero (placeholder OR uploaded screenshot)
  s1.addImage({
    data: brandSurfacePptxData,
    x: 6.7, y: 0.85, w: 6.4, h: 4.5,
    sizing: { type: 'cover', w: 6.4, h: 4.5 },
  });

  // iOS-style notification card overlapping the top of the brand surface
  s1.addShape(pres.ShapeType.roundRect, {
    x: 8.0, y: 0.6, w: 4.9, h: 1.05,
    fill: { color: 'FFFFFF' }, line: { type: 'none' }, rectRadius: 0.18,
    shadow: { type: 'outer', blur: 20, offset: 6, angle: 90, color: '000000', opacity: 0.18 },
  });
  s1.addShape(pres.ShapeType.ellipse, {
    x: 8.18, y: 0.78, w: 0.55, h: 0.55,
    fill: { color: brandHex }, line: { color: brandHex },
  });
  s1.addText((data.framing.sampleNotification.sender || 'B').slice(0, 1).toUpperCase(), {
    x: 8.18, y: 0.78, w: 0.55, h: 0.55,
    fontSize: 18, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle',
  });
  s1.addText(data.framing.sampleNotification.sender, {
    x: 8.85, y: 0.7, w: 3.0, h: 0.3,
    fontSize: 11, bold: true, color: ink,
  });
  s1.addText(data.framing.sampleNotification.timeLabel || 'now', {
    x: 12.05, y: 0.7, w: 0.8, h: 0.3,
    fontSize: 9, color: inkMute, align: 'right',
  });
  s1.addText(data.framing.sampleNotification.body, {
    x: 8.85, y: 0.97, w: 3.95, h: 0.55,
    fontSize: 9.5, color: inkSoft, valign: 'top',
  });

  // Stat highlight card pinned to the bottom-left of the hero
  s1.addShape(pres.ShapeType.roundRect, {
    x: 6.55, y: 4.2, w: 1.85, h: 1.25,
    fill: { color: 'FFFFFF' }, line: { type: 'none' }, rectRadius: 0.12,
    shadow: { type: 'outer', blur: 18, offset: 4, angle: 90, color: '000000', opacity: 0.14 },
  });
  s1.addText(data.framing.statHighlight.delta, {
    x: 6.55, y: 4.28, w: 1.85, h: 0.3, fontSize: 12, bold: true, color: '1AA55B', align: 'center',
  });
  s1.addText(data.framing.statHighlight.value, {
    x: 6.55, y: 4.58, w: 1.85, h: 0.55, fontSize: 24, bold: true, color: ink, align: 'center', valign: 'middle',
  });
  s1.addText(data.framing.statHighlight.label, {
    x: 6.55, y: 5.13, w: 1.85, h: 0.25, fontSize: 8, color: inkMute, align: 'center',
  });

  addFooter(s1);

  // ─── SLIDE 2 — EXPERIENCE ───────────────────────────────────────────────
  const s2 = pres.addSlide();
  s2.background = { color: 'FFFFFF' };

  s2.addText(data.experience.title, {
    x: 0.4, y: 0.25, w: 12.6, h: 0.5,
    fontSize: 26, bold: true, color: ink,
  });
  s2.addText(data.experience.subtitle, {
    x: 0.4, y: 0.7, w: 12.6, h: 0.35,
    fontSize: 13, color: inkSoft,
  });

  // Persona block (top-left under header)
  const persona = data.experience.persona;
  s2.addImage({
    data: personaPptxData,
    x: 0.4, y: 1.2, w: 0.7, h: 0.7,
    sizing: { type: 'cover', w: 0.7, h: 0.7 },
  });
  s2.addText(persona.name, {
    x: 1.2, y: 1.2, w: 11.0, h: 0.3,
    fontSize: 13, bold: true, color: ink,
  });
  s2.addText((persona.traits || []).join(' • '), {
    x: 1.2, y: 1.45, w: 11.0, h: 0.25,
    fontSize: 10, color: inkSoft,
  });
  s2.addText(persona.summary, {
    x: 1.2, y: 1.7, w: 11.0, h: 0.25,
    fontSize: 10, italic: true, color: inkSoft,
  });

  // Steps in a horizontal row — full width below persona (no AJO strip).
  const steps = data.experience.steps;
  const flowTop = 2.35;
  const flowH = 3.55;
  const flowLeft = 0.6;
  const flowRight = 12.7;
  const colW = (flowRight - flowLeft) / steps.length;

  s2.addShape(pres.ShapeType.line, {
    x: flowLeft + 0.3, y: flowTop + flowH / 2, w: flowRight - flowLeft - 0.6, h: 0,
    line: { color: inkMute, width: 1.5 },
  });

  steps.forEach((step, i) => {
    const x = flowLeft + i * colW;
    const cx = x + colW / 2;
    const above = i % 2 === 0;
    const mockupY = above ? flowTop : flowTop + flowH / 2 + 0.2;
    const textY = above ? flowTop + flowH / 2 + 0.2 : flowTop + 0.05;

    const mockupSvg = stepMockupSvg(step, brand, persona.name, data.client.name);
    const mockupData = 'data:image/svg+xml;base64,' + Buffer.from(mockupSvg).toString('base64');
    s2.addImage({
      data: mockupData,
      x: cx - 0.75, y: mockupY, w: 1.5, h: 1.3,
      sizing: { type: 'contain', w: 1.5, h: 1.3 },
    });

    s2.addShape(pres.ShapeType.ellipse, {
      x: cx - 0.1, y: flowTop + flowH / 2 - 0.1, w: 0.2, h: 0.2,
      fill: { color: brandHex }, line: { color: 'FFFFFF', width: 2 },
    });

    s2.addText(step.title, {
      x: x + 0.05, y: textY, w: colW - 0.1, h: 0.3,
      fontSize: 11, bold: true, color: ink, align: 'center',
    });
    s2.addText(step.description, {
      x: x + 0.05, y: textY + 0.3, w: colW - 0.1, h: 1.0,
      fontSize: 9, color: inkSoft, align: 'center', valign: 'top',
    });
    s2.addText(step.channel.toUpperCase(), {
      x: x + 0.05, y: textY + 1.3, w: colW - 0.1, h: 0.2,
      fontSize: 8, bold: true, color: brandHex, align: 'center',
    });
  });

  addFooter(s2);

  // ─── SLIDE 3 — VALUE ────────────────────────────────────────────────────
  // Layout mirrors the HTML: full-width headline + value-prop band at
  // the top, then a 2-column body with the lifestyle photo (smaller,
  // left) and the AEP-in-action composite (larger, right), and finally
  // a dark takeaway band across the bottom.
  const s3 = pres.addSlide();
  s3.background = { color: 'FFFFFF' };

  // Headline (full width) with boldWord emphasised in the brand colour
  if (data.value.boldWord && data.value.headline.toLowerCase().includes(data.value.boldWord.toLowerCase())) {
    const idx = data.value.headline.toLowerCase().indexOf(data.value.boldWord.toLowerCase());
    s3.addText([
      { text: data.value.headline.slice(0, idx), options: { color: ink } },
      { text: data.value.headline.substr(idx, data.value.boldWord.length), options: { color: brandHex } },
      { text: data.value.headline.slice(idx + data.value.boldWord.length), options: { color: ink } },
    ], {
      x: 0.4, y: 0.4, w: 12.6, h: 1.1,
      fontSize: 40, bold: true, valign: 'top',
    });
  } else {
    s3.addText(data.value.headline, {
      x: 0.4, y: 0.4, w: 12.6, h: 1.1,
      fontSize: 40, bold: true, color: ink, valign: 'top',
    });
  }

  if (data.value.subheading) {
    s3.addText(data.value.subheading, {
      x: 0.4, y: 1.5, w: 12.6, h: 0.4,
      fontSize: 14, color: inkSoft,
    });
  }

  // Three value props in a horizontal band beneath the headline:
  // "More <bold>" with a brand-tinted icon tile.
  const vpCount = Math.min(3, data.value.valueProps.length);
  const vpRowY = 1.95;
  const vpWidth = 4.2;
  const vpGap = 0.1;
  data.value.valueProps.slice(0, vpCount).forEach((vp, i) => {
    const x = 0.4 + i * (vpWidth + vpGap);
    s3.addShape(pres.ShapeType.roundRect, {
      x, y: vpRowY, w: 0.6, h: 0.6,
      fill: { color: brandHex, transparency: 80 },
      line: { type: 'none' }, rectRadius: 0.08,
    });
    s3.addText('●', { x, y: vpRowY, w: 0.6, h: 0.6, fontSize: 18, color: brandHex, align: 'center', valign: 'middle' });
    s3.addText([
      { text: 'More ', options: { color: inkSoft, bold: false } },
      { text: vp.boldWord || vp.text || '', options: { color: ink, bold: true } },
    ], {
      x: x + 0.7, y: vpRowY + 0.05, w: vpWidth - 0.7, h: 0.5,
      fontSize: 20, valign: 'middle',
    });
  });

  // Body row — lifestyle (left, smaller) + AEP composite (right, larger)
  const bodyTop = 2.9;
  const bodyH = 3.1;
  s3.addImage({
    data: lifestylePptxData,
    x: 0.4, y: bodyTop, w: 5.0, h: bodyH,
    sizing: { type: 'cover', w: 5.0, h: bodyH },
  });
  s3.addShape(pres.ShapeType.roundRect, {
    x: 0.4, y: bodyTop, w: 5.0, h: bodyH,
    fill: { type: 'none' }, line: { color: 'E3E6EB', width: 1 }, rectRadius: 0.14,
  });

  // AEP composite (uploaded PNG OR our brand-coloured SVG fallback)
  s3.addShape(pres.ShapeType.roundRect, {
    x: 5.6, y: bodyTop, w: 7.4, h: bodyH,
    fill: { color: 'FFFFFF' }, line: { color: 'E3E6EB', width: 1 }, rectRadius: 0.14,
  });
  s3.addText('Adobe Experience Platform · in action', {
    x: 5.8, y: bodyTop + 0.1, w: 5.0, h: 0.25,
    fontSize: 9, bold: true, color: inkMute,
  });
  s3.addText('● live', {
    x: 11.4, y: bodyTop + 0.1, w: 1.4, h: 0.25,
    fontSize: 9, bold: true, color: brandHex, align: 'right',
  });
  s3.addImage({
    data: aepPptxData,
    x: 5.8, y: bodyTop + 0.4, w: 7.0, h: bodyH - 0.55,
    sizing: { type: 'contain', w: 7.0, h: bodyH - 0.55 },
  });

  // Takeaway band at the bottom
  s3.addShape(pres.ShapeType.roundRect, {
    x: 0.4, y: 6.2, w: 12.6, h: 0.8,
    fill: { color: '1A1A2A' }, line: { type: 'none' }, rectRadius: 0.1,
  });
  s3.addText(data.value.takeaway, {
    x: 0.65, y: 6.22, w: 12.1, h: 0.76,
    fontSize: 13, bold: true, color: 'FFFFFF', valign: 'middle',
  });

  addFooter(s3);

  return pres.write({ outputType: 'nodebuffer' });
}

// ─── HTTP HANDLERS ───────────────────────────────────────────────────────────

async function handleGenerate(req, res) {
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  const sandbox = String(body.sandbox || '').trim();
  const scrapeId = String(body.scrapeId || '').trim();
  if (!sandbox || !scrapeId) { res.status(400).json({ error: 'sandbox and scrapeId are required' }); return; }
  const previousData = (body.previousData && typeof body.previousData === 'object') ? body.previousData : null;
  const refinementPrompt = typeof body.refinementPrompt === 'string' ? body.refinementPrompt : '';
  const images = (body.images && typeof body.images === 'object') ? body.images : {};

  try {
    const { demoData } = await generateDemoUseCase({
      sandbox,
      scrapeId,
      brandColour: body.brandColour,
      useCase: body.useCase,
      personaName: body.personaName,
      products: body.products,
      customProduct: body.customProduct,
      stepCount: body.stepCount,
      additionalContext: body.additionalContext,
      previousData,
      refinementPrompt,
      clientName: body.clientName,
    });
    const framingHtml = renderFramingHtml(demoData, images);
    const experienceHtml = renderExperienceHtml(demoData, images);
    const valueHtml = renderValueHtml(demoData, images);
    res.status(200).json({
      ok: true,
      mode: (previousData && refinementPrompt.trim()) ? 'refinement' : 'initial',
      demoData,
      framingHtml,
      experienceHtml,
      valueHtml,
    });
  } catch (e) {
    console.error('[demoUseCase] generate failed', e);
    res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
}

async function handlePptx(req, res) {
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  const demoData = body.demoData;
  const images = (body.images && typeof body.images === 'object') ? body.images : {};
  if (!demoData || typeof demoData !== 'object') {
    res.status(400).json({ error: 'demoData (object) is required' });
    return;
  }
  try {
    const buf = await renderDemoPptx(demoData, images);
    const slug = slugify((demoData.client && (demoData.client.slug || demoData.client.name)) || 'demo');
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.set('Content-Disposition', `attachment; filename="${slug}-demo-deck.pptx"`);
    res.set('Content-Length', String(buf.length));
    res.status(200).end(buf);
  } catch (e) {
    console.error('[demoUseCase] pptx failed', e);
    res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
}

module.exports = {
  ADOBE_PRODUCTS,
  AJO_CHANNELS,
  generateDemoUseCase,
  normaliseDemoData,
  renderFramingHtml,
  renderExperienceHtml,
  renderValueHtml,
  renderDemoPptx,
  handleGenerate,
  handlePptx,
};
