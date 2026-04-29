/**
 * Demo Use Case Assets — sister service to clientJourneyAssetService.js.
 *
 * Produces a 3-slide presentation deck from a brand scrape:
 *   1. Framing   — what we're going to demonstrate (use case, tech, benefits)
 *   2. Experience — a 5/6/7-step persona walkthrough with channels per step
 *   3. Value     — a 3-prop takeaway after the live demo
 *
 * Sibling of clientJourneyAssetService.js — same orchestration shape
 * (Vertex AI Gemini structured-output → normalise → render → cache),
 * different output (a 3-slide deck rather than a 12-step journey + one
 * pager). Stock fallbacks for the persona / device / lifestyle imagery
 * are inline SVGs so the page works offline and without API keys.
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

/**
 * Build a deterministic seed string from a name for the pravatar URL
 * fallback. Keeping the same persona name produces the same face on
 * every regeneration so the deck doesn't shuffle visually.
 */
function personaSeed(personaName, brandName) {
  const base = (safeString(personaName) + '|' + safeString(brandName)).toLowerCase().trim();
  let h = 0;
  for (let i = 0; i < base.length; i++) h = ((h << 5) - h + base.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
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
 * Choose a real persona image (uploaded data URL, pravatar URL, or
 * inline initials avatar). HTML mode prefers the pravatar URL when no
 * upload, since browsers fetch it directly. PPTX mode prefers the
 * inline initials avatar (no runtime network fetch in the function).
 */
function resolvePersonaImage(images, personaName, brandName, brandColour, mode = 'html') {
  if (images && typeof images.persona === 'string' && images.persona.startsWith('data:')) {
    return { kind: 'data', src: images.persona };
  }
  if (mode === 'html') {
    return { kind: 'url', src: 'https://i.pravatar.cc/300?u=' + encodeURIComponent(personaSeed(personaName, brandName)) };
  }
  const svg = initialsAvatarSvg(personaName, brandColour);
  return { kind: 'svg', src: 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64') };
}

function resolveDeviceImage(images, brandColour, products) {
  if (images && typeof images.device === 'string' && images.device.startsWith('data:')) {
    return { kind: 'data', src: images.device };
  }
  const svg = laptopMockupSvg(brandColour, products);
  return { kind: 'svg', src: 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'), inlineSvg: svg };
}

function resolveLifestyleImage(images, industry, brandColour, mode = 'html') {
  if (images && typeof images.lifestyle === 'string' && images.lifestyle.startsWith('data:')) {
    return { kind: 'data', src: images.lifestyle };
  }
  if (mode === 'html') {
    const tag = encodeURIComponent(safeString(industry, 'lifestyle').replace(/\s+/g, ',') || 'lifestyle');
    return { kind: 'url', src: 'https://source.unsplash.com/featured/?' + tag + ',customer' };
  }
  const svg = lifestyleMockupSvg(brandColour);
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
- "value.headline": 4-8 word statement, e.g. "Stand out with customer-centric engagement.". MUST end with a period.
- "value.boldWord": one word from the headline that should be visually emphasised in the brand colour (e.g. "Stand out", "customer-centric").
- "value.subheading": short bridge phrase, 4-8 words, e.g. "Don't push more volume. Instead, be...".
- "value.valueProps": EXACTLY 3 items. Each has: icon (short keyword like "file-search", "clock", "user"), boldWord (the bolded word, e.g. "relevant"), text (the full label, "More relevant"). The pattern "More <word>" or "Better <word>" works well.
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
  const valueProps = ensureLength(valIn.valueProps, 3, (i) => ({ icon: 'check', boldWord: ['relevant', 'timely', 'personalised'][i] || 'better', text: 'More ' + (['relevant', 'timely', 'personalised'][i] || 'aligned') })).map((v) => ({
    icon: safeString(v && v.icon, 'check'),
    boldWord: safeString(v && v.boldWord, 'better'),
    text: safeString(v && v.text, 'More aligned'),
  }));
  const value = {
    headline: safeString(valIn.headline, 'Stand out with customer-centric engagement.'),
    boldWord: safeString(valIn.boldWord, ''),
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
  `;
}

function renderFramingHtml(data, images) {
  const c = data.client || {};
  const brand = normaliseHex(c.brandColour);
  const dark = c.darkColour || darken(brand, 0.25);
  const f = data.framing || {};
  const device = resolveDeviceImage(images, brand, f.technology);
  const techList = (f.technology || []).join(', ');
  const benefits = (f.benefits || []).slice(0, 4);

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=1280, initial-scale=1">
<title>${escapeHtml(c.name)} — Use case framing</title>
<style>${commonStyles(brand, dark)}
  .framing { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; flex: 1 1 auto; min-height: 0; }
  .framing .col-left { display: flex; flex-direction: column; gap: 18px; min-width: 0; }
  .framing .col-right { position: relative; min-width: 0; }
  .top-row { display: flex; align-items: center; gap: 14px; margin-bottom: 12px; }
  .pill {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 8px 14px; border-radius: 999px; background: #fff; border: 1.5px solid var(--border);
    font-size: 11px; color: var(--ink); font-weight: 600;
  }
  .pill .pill-icon { font-weight: 700; color: var(--adobe-red); }
  .pill.tech { padding: 6px 14px 6px 8px; }
  .pill.tech .adobe-mark { display: inline-flex; align-items: center; }
  .use-case-card {
    background: var(--brand-light);
    border: 2px solid var(--brand);
    color: var(--ink);
    padding: 18px 22px;
    border-radius: 4px;
    font-size: 18px;
    line-height: 1.35;
    font-weight: 600;
  }
  .use-case-card .label { color: var(--brand); font-weight: 800; letter-spacing: 0.4px; }
  .benefits-card {
    background: var(--brand-light);
    border: 2px solid var(--brand);
    border-radius: 4px;
    padding: 18px 22px;
    display: flex; flex-direction: column; gap: 12px;
  }
  .benefit { display: grid; grid-template-columns: 36px 1fr; align-items: center; gap: 12px; font-size: 14px; color: var(--ink); font-weight: 500; }
  .benefit .ic {
    width: 36px; height: 36px; border-radius: 8px; background: var(--brand);
    color: #fff; display: inline-flex; align-items: center; justify-content: center;
  }
  .device-stage { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
  .device-stage img { max-width: 100%; max-height: 380px; object-fit: contain; }
  .stat-card {
    position: absolute; left: 14%; bottom: 26%;
    background: #fff; border: 1px solid var(--border); border-radius: 12px;
    padding: 12px 16px; box-shadow: 0 8px 24px rgba(0,0,0,0.08);
    text-align: center; min-width: 110px;
  }
  .stat-card .delta { color: #1aa55b; font-weight: 700; font-size: 14px; }
  .stat-card .value { font-size: 24px; font-weight: 700; color: var(--ink); margin: 4px 0; }
  .stat-card .label { font-size: 9px; color: var(--ink-mute); text-transform: uppercase; letter-spacing: 0.4px; }
  .notification {
    position: absolute; right: 4%; top: 8%;
    background: #fff; border: 1px solid var(--border); border-radius: 16px;
    padding: 12px 14px; box-shadow: 0 12px 32px rgba(0,0,0,0.10);
    width: 280px; display: grid; grid-template-columns: 32px 1fr; gap: 10px;
  }
  .notification .badge { width: 32px; height: 32px; border-radius: 8px; background: var(--brand); color: #fff; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; }
  .notification .meta { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .notification .sender { font-weight: 700; font-size: 11px; color: var(--ink); }
  .notification .time { font-size: 9.5px; color: var(--ink-mute); }
  .notification .body { font-size: 11px; color: var(--ink-soft); margin-top: 2px; line-height: 1.35; }
  .priority-q { display: inline-flex; width: 18px; height: 18px; border-radius: 50%; background: var(--brand); color: #fff; align-items: center; justify-content: center; font-size: 10px; font-weight: 700; }
</style></head>
<body>
  <section class="deck-slide framing">
    <div class="top-row">
      <span class="pill"><span>Priority:</span> <span class="priority-q" title="Priority">${escapeHtml(f.priority || 'High').slice(0, 1)}</span></span>
      <span class="pill tech">
        <span class="adobe-mark">${ADOBE_LOGO_SVG.replace('width="48"', 'width="20"').replace('height="42"', 'height="18"')}</span>
        <span><strong>Technology:</strong> ${escapeHtml(techList)}</span>
      </span>
    </div>
    <div class="framing">
      <div class="col-left">
        <div class="use-case-card">
          <span class="label">USE CASE:</span> ${escapeHtml(f.useCase)}
        </div>
        <div class="benefits-card">
          ${benefits.map((b) => `
            <div class="benefit">
              <span class="ic">${iconSvg(b.icon, 18)}</span>
              <span>${escapeHtml(b.text)}</span>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="col-right">
        <div class="device-stage"><img src="${escapeAttr(device.src)}" alt=""></div>
        <div class="notification">
          <span class="badge">${escapeHtml((f.sampleNotification.sender || c.name || 'B').slice(0, 1).toUpperCase())}</span>
          <div>
            <div class="meta">
              <span class="sender">${escapeHtml(f.sampleNotification.sender)}</span>
              <span class="time">${escapeHtml(f.sampleNotification.timeLabel || 'now')}</span>
            </div>
            <div class="body">${escapeHtml(f.sampleNotification.body)}</div>
          </div>
        </div>
        <div class="stat-card">
          <div class="delta">${escapeHtml(f.statHighlight.delta)}</div>
          <div class="value">${escapeHtml(f.statHighlight.value)}</div>
          <div class="label">${escapeHtml(f.statHighlight.label)}</div>
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
  const steps = e.steps || [];

  // Lay steps out in a grid; alternate above/below the centre line for
  // visual rhythm, matching the sample slide.
  const stepBlocks = steps.map((s, i) => {
    const above = i % 2 === 0;
    const mockupSvg = stepMockupSvg(s, brand, persona.name, c.name);
    return `<div class="step ${above ? 'above' : 'below'}" data-i="${i}">
      <div class="mockup">${mockupSvg}</div>
      <div class="step-text">
        <div class="step-title">${escapeHtml(s.title)}</div>
        <div class="step-desc">${escapeHtml(s.description)}</div>
        <div class="step-channel"><span class="channel-dot"></span>${escapeHtml(s.channel)}</div>
      </div>
    </div>`;
  }).join('');

  // Layout count drives column sizes.
  const cols = steps.length;

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=1280, initial-scale=1">
<title>${escapeHtml(c.name)} — Experience walkthrough</title>
<style>${commonStyles(brand, dark)}
  .experience { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; }
  .experience-header { margin-bottom: 14px; }
  .experience-title { font-size: 28px; font-weight: 800; color: var(--ink); letter-spacing: -0.4px; }
  .experience-subtitle { font-size: 14px; color: var(--ink-soft); font-weight: 500; margin-top: 2px; }
  .persona-block { display: grid; grid-template-columns: 64px 1fr; gap: 14px; align-items: center; margin: 4px 0 18px; }
  .persona-block .photo { width: 64px; height: 64px; border-radius: 50%; overflow: hidden; background: var(--panel); border: 2px solid var(--brand); }
  .persona-block .photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .persona-block .photo .svg-wrap { width: 100%; height: 100%; display: block; }
  .persona-name { font-size: 16px; font-weight: 700; color: var(--ink); }
  .persona-traits { font-size: 11.5px; color: var(--ink-soft); margin-top: 2px; }
  .persona-summary { font-size: 11.5px; color: var(--ink-soft); margin-top: 1px; font-style: italic; }
  .persona-traits .trait { display: inline-flex; align-items: center; gap: 4px; }
  .persona-traits .trait::before { content: "•"; color: var(--brand); font-weight: 800; margin-right: 2px; }
  .persona-traits .trait:first-child::before { content: ""; margin-right: 0; }
  .step-flow {
    flex: 1 1 auto; min-height: 0; position: relative;
    display: grid; grid-template-columns: repeat(${cols}, 1fr); gap: 12px;
    padding: 32px 0;
  }
  .step-flow::before {
    content: ''; position: absolute; left: 4%; right: 4%; top: 50%;
    height: 2px; background: linear-gradient(to right, transparent, var(--ink-mute) 6%, var(--ink-mute) 94%, transparent);
    opacity: 0.45;
  }
  .step { position: relative; display: flex; flex-direction: column; align-items: center; gap: 8px; }
  .step.above { justify-content: flex-start; }
  .step.below { flex-direction: column-reverse; justify-content: flex-end; }
  .step .mockup { width: 100%; max-width: 180px; max-height: 160px; height: 160px; display: flex; align-items: center; justify-content: center; }
  .step .mockup svg { max-width: 100%; max-height: 100%; }
  .step .step-text { text-align: center; max-width: 200px; padding: 0 4px; }
  .step .step-title { font-size: 12px; font-weight: 700; color: var(--ink); margin-bottom: 4px; }
  .step .step-desc { font-size: 10.5px; color: var(--ink-soft); line-height: 1.4; }
  .step .step-channel { display: inline-flex; align-items: center; gap: 6px; margin-top: 6px; font-size: 9.5px; color: var(--brand); font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; }
  .step .step-channel .channel-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--brand); }
  .step::after {
    content: ''; position: absolute; left: 50%; top: 50%;
    width: 12px; height: 12px; border-radius: 50%; transform: translate(-50%, -50%);
    background: var(--brand); border: 3px solid #fff; box-shadow: 0 0 0 1px var(--brand);
  }
</style></head>
<body>
  <section class="deck-slide experience">
    <div class="experience-header">
      <div class="experience-title">${escapeHtml(e.title)}</div>
      <div class="experience-subtitle">${escapeHtml(e.subtitle)}</div>
    </div>
    <div class="persona-block">
      <span class="photo">${personaImg.kind === 'svg' ? `<span class="svg-wrap">${personaImg.inlineSvg || ''}</span>` : `<img src="${escapeAttr(personaImg.src)}" alt="">`}</span>
      <div>
        <div class="persona-name">${escapeHtml(persona.name)}</div>
        <div class="persona-traits">${(persona.traits || []).map((t) => `<span class="trait">${escapeHtml(t)}</span>`).join(' ')}</div>
        <div class="persona-summary">${escapeHtml(persona.summary)}</div>
      </div>
    </div>
    <div class="step-flow">${stepBlocks}</div>
    <div class="deck-footer">
      <span class="adobe-logo"><span class="wordmark">Adobe</span></span>
      <span class="copyright">© ${new Date().getFullYear()} Adobe. All Rights Reserved. Adobe Confidential.</span>
    </div>
  </section>
</body></html>`;
}

function renderValueHtml(data, images) {
  const c = data.client || {};
  const brand = normaliseHex(c.brandColour);
  const dark = c.darkColour || darken(brand, 0.25);
  const v = data.value || {};
  const lifestyle = resolveLifestyleImage(images, c.industry, brand, 'html');

  // Render the headline with the boldWord highlighted in brand colour.
  let headlineHtml;
  if (v.boldWord && v.headline.toLowerCase().includes(v.boldWord.toLowerCase())) {
    const idx = v.headline.toLowerCase().indexOf(v.boldWord.toLowerCase());
    headlineHtml = escapeHtml(v.headline.slice(0, idx)) +
      '<span class="brand-emph">' + escapeHtml(v.headline.substr(idx, v.boldWord.length)) + '</span>' +
      escapeHtml(v.headline.slice(idx + v.boldWord.length));
  } else {
    headlineHtml = escapeHtml(v.headline);
  }

  // Render the takeaway with a brand-coloured emphasis on phrases like
  // "customer at the center" if that phrase appears (matches sample 3).
  let takeawayHtml = escapeHtml(v.takeaway);
  const emphPatterns = ['customer at the center', 'customer at the centre', 'customer-centric', 'real-time', 'personalised', 'personalized'];
  for (const phrase of emphPatterns) {
    const re = new RegExp('(' + phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'i');
    if (re.test(v.takeaway)) {
      takeawayHtml = escapeHtml(v.takeaway).replace(new RegExp('(' + phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'i'), '<span class="brand-emph">$1</span>');
      break;
    }
  }

  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=1280, initial-scale=1">
<title>${escapeHtml(c.name)} — Value</title>
<style>${commonStyles(brand, dark)}
  .value-slide { display: grid; grid-template-columns: 1fr 1fr; gap: 36px; flex: 1 1 auto; min-height: 0; }
  .value-left { display: flex; flex-direction: column; justify-content: center; gap: 18px; padding: 12px 0 0; }
  .value-headline { font-size: 56px; font-weight: 800; line-height: 1.05; color: var(--ink); letter-spacing: -1px; }
  .brand-emph { color: var(--brand); }
  .value-subhead { font-size: 18px; color: var(--ink-soft); margin-top: 6px; font-weight: 400; }
  .value-props { display: flex; flex-direction: column; gap: 14px; margin-top: 10px; }
  .value-prop { display: grid; grid-template-columns: 44px 1fr; align-items: center; gap: 14px; font-size: 18px; color: var(--ink); }
  .value-prop .ic {
    width: 44px; height: 44px; border-radius: 10px; background: var(--brand);
    color: #fff; display: inline-flex; align-items: center; justify-content: center;
  }
  .value-prop b { font-weight: 800; }
  .value-right { position: relative; border-radius: 12px; overflow: hidden; min-height: 460px; background: var(--panel); }
  .value-right .lifestyle { position: absolute; inset: 0; }
  .value-right .lifestyle img, .value-right .lifestyle svg { width: 100%; height: 100%; object-fit: cover; display: block; }
  .value-right .takeaway {
    position: absolute; left: 22px; right: 22px; bottom: 22px;
    background: rgba(20, 20, 20, 0.92); color: #fff;
    padding: 16px 20px; border-radius: 8px; font-size: 16px; font-weight: 600; line-height: 1.35;
  }
  .value-right .floating-card {
    position: absolute; right: 22px; top: 22px;
    background: #fff; border-radius: 12px; padding: 12px 14px;
    box-shadow: 0 12px 28px rgba(0,0,0,0.18);
    width: 220px; display: flex; flex-direction: column; gap: 10px;
  }
  .value-right .floating-card .row { display: grid; grid-template-columns: 18px 1fr; align-items: center; gap: 10px; font-size: 11px; color: var(--ink); }
  .value-right .floating-card .row .ic { width: 18px; height: 18px; color: var(--ink-soft); display: inline-flex; align-items: center; justify-content: center; }
  .value-right .floating-card .row .label { font-weight: 700; color: var(--ink-soft); margin-right: 4px; }
  .value-right .floating-card .header { font-size: 11px; color: var(--ink); font-weight: 700; padding-bottom: 6px; border-bottom: 1px solid var(--border); }
</style></head>
<body>
  <section class="deck-slide value-wrap">
    <div class="value-slide">
      <div class="value-left">
        <div class="value-headline">${headlineHtml}</div>
        <div class="value-subhead">${escapeHtml(v.subheading)}</div>
        <div class="value-props">
          ${v.valueProps.map((p) => `
            <div class="value-prop">
              <span class="ic">${iconSvg(p.icon, 22)}</span>
              <span>${escapeHtml(p.text.split(p.boldWord).join('')).replace(/\s+$/, '')} <b>${escapeHtml(p.boldWord)}</b></span>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="value-right">
        <div class="lifestyle">${lifestyle.kind === 'svg' ? lifestyle.inlineSvg : `<img src="${escapeAttr(lifestyle.src)}" alt="">`}</div>
        <div class="floating-card">
          <div class="header">Create segment</div>
          <div class="row"><span class="ic">${iconSvg('file-search', 14)}</span><span><span class="label">Search:</span>${escapeHtml((data.framing && data.framing.useCase || '').split(' ').slice(0, 4).join(' ') || 'Best customers')}</span></div>
          <div class="row"><span class="ic">${iconSvg('users', 14)}</span><span><span class="label">Audience:</span>${escapeHtml(((data.experience && data.experience.persona && data.experience.persona.name) || 'High-intent visitors').split('|')[0].trim())}</span></div>
        </div>
        <div class="takeaway">${takeawayHtml}</div>
      </div>
    </div>
    <div class="deck-footer">
      <span class="adobe-logo"><span class="wordmark">Adobe</span></span>
      <span class="copyright">© ${new Date().getFullYear()} Adobe. All Rights Reserved. Adobe Confidential.</span>
    </div>
  </section>
</body></html>`;
}

// ─── PPTX RENDERER (PptxGenJS) ───────────────────────────────────────────────

function renderDemoPptx(data, images) {
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
  const s1 = pres.addSlide();
  s1.background = { color: 'FFFFFF' };

  // Top pills
  s1.addText(`Priority: ${data.framing.priority}`, {
    x: 0.4, y: 0.3, w: 1.4, h: 0.36,
    fontSize: 9, bold: true, color: ink,
    fill: { color: 'FFFFFF' },
    line: { color: 'E3E6EB', width: 1 },
    align: 'center', valign: 'middle',
  });
  s1.addText(`Technology: ${data.framing.technology.join(', ')}`, {
    x: 1.85, y: 0.3, w: 6.5, h: 0.36,
    fontSize: 9, bold: true, color: ink,
    fill: { color: 'FFFFFF' },
    line: { color: 'E3E6EB', width: 1 },
    align: 'left', valign: 'middle', margin: [0, 8, 0, 8],
  });

  // Use case card
  s1.addShape(pres.ShapeType.rect, {
    x: 0.4, y: 1.0, w: 6.0, h: 1.4,
    fill: { color: brandHex, transparency: 85 },
    line: { color: brandHex, width: 2 },
  });
  s1.addText([
    { text: 'USE CASE: ', options: { color: brandHex, bold: true } },
    { text: data.framing.useCase, options: { color: ink } },
  ], {
    x: 0.6, y: 1.1, w: 5.6, h: 1.2,
    fontSize: 14, bold: true, valign: 'middle',
  });

  // Benefits card
  const benefitsTop = 2.6;
  s1.addShape(pres.ShapeType.rect, {
    x: 0.4, y: benefitsTop, w: 6.0, h: 3.4,
    fill: { color: brandHex, transparency: 85 },
    line: { color: brandHex, width: 2 },
  });
  data.framing.benefits.slice(0, 4).forEach((b, i) => {
    const y = benefitsTop + 0.25 + (i * 0.78);
    s1.addShape(pres.ShapeType.roundRect, {
      x: 0.6, y, w: 0.55, h: 0.55,
      fill: { color: brandHex }, line: { color: brandHex }, rectRadius: 0.08,
    });
    // Use a simple text glyph since PptxGenJS doesn't paint our SVG icons.
    s1.addText('●', { x: 0.6, y, w: 0.55, h: 0.55, fontSize: 16, color: 'FFFFFF', align: 'center', valign: 'middle' });
    s1.addText(b.text, {
      x: 1.3, y: y + 0.04, w: 5.0, h: 0.5,
      fontSize: 13, color: ink, valign: 'middle',
    });
  });

  // Right-side device image (uploaded data URL OR our SVG fallback)
  const device = resolveDeviceImage(images, brand, data.framing.technology);
  s1.addImage({
    data: device.src,
    x: 6.7, y: 1.0, w: 6.4, h: 4.2,
    sizing: { type: 'contain', w: 6.4, h: 4.2 },
  });

  // Sample notification card
  s1.addShape(pres.ShapeType.roundRect, {
    x: 8.4, y: 1.1, w: 4.6, h: 1.0,
    fill: { color: 'FFFFFF' }, line: { color: 'E3E6EB', width: 1 }, rectRadius: 0.1,
  });
  s1.addShape(pres.ShapeType.roundRect, {
    x: 8.55, y: 1.25, w: 0.5, h: 0.5,
    fill: { color: brandHex }, line: { color: brandHex }, rectRadius: 0.06,
  });
  s1.addText((data.framing.sampleNotification.sender || 'B').slice(0, 1).toUpperCase(), {
    x: 8.55, y: 1.25, w: 0.5, h: 0.5,
    fontSize: 18, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle',
  });
  s1.addText(data.framing.sampleNotification.sender, {
    x: 9.2, y: 1.2, w: 2.8, h: 0.3,
    fontSize: 10, bold: true, color: ink,
  });
  s1.addText(data.framing.sampleNotification.timeLabel || 'now', {
    x: 12.0, y: 1.2, w: 0.85, h: 0.3,
    fontSize: 9, color: inkMute, align: 'right',
  });
  s1.addText(data.framing.sampleNotification.body, {
    x: 9.2, y: 1.45, w: 3.65, h: 0.65,
    fontSize: 9.5, color: inkSoft,
  });

  // Stat highlight card
  s1.addShape(pres.ShapeType.roundRect, {
    x: 7.0, y: 4.3, w: 1.6, h: 1.2,
    fill: { color: 'FFFFFF' }, line: { color: 'E3E6EB', width: 1 }, rectRadius: 0.1,
  });
  s1.addText(data.framing.statHighlight.delta, {
    x: 7.0, y: 4.35, w: 1.6, h: 0.3, fontSize: 12, bold: true, color: '1AA55B', align: 'center',
  });
  s1.addText(data.framing.statHighlight.value, {
    x: 7.0, y: 4.65, w: 1.6, h: 0.55, fontSize: 22, bold: true, color: ink, align: 'center', valign: 'middle',
  });
  s1.addText(data.framing.statHighlight.label, {
    x: 7.0, y: 5.2, w: 1.6, h: 0.25, fontSize: 8, color: inkMute, align: 'center',
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
  const personaImg = resolvePersonaImage(images, persona.name, data.client.name, brand, 'pptx');
  s2.addImage({
    data: personaImg.src,
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

  // Steps in a horizontal row
  const steps = data.experience.steps;
  const flowTop = 2.4;
  const flowH = 4.4;
  const flowLeft = 0.6;
  const flowRight = 12.7;
  const colW = (flowRight - flowLeft) / steps.length;

  // Connecting line
  s2.addShape(pres.ShapeType.line, {
    x: flowLeft + 0.3, y: flowTop + flowH / 2, w: flowRight - flowLeft - 0.6, h: 0,
    line: { color: inkMute, width: 1.5 },
  });

  steps.forEach((step, i) => {
    const x = flowLeft + i * colW;
    const cx = x + colW / 2;
    const above = i % 2 === 0;
    const mockupY = above ? flowTop : flowTop + flowH / 2 + 0.3;
    const textY = above ? flowTop + flowH / 2 + 0.3 : flowTop + 0.1;

    // Mockup image
    const mockupSvg = stepMockupSvg(step, brand, persona.name, data.client.name);
    const mockupData = 'data:image/svg+xml;base64,' + Buffer.from(mockupSvg).toString('base64');
    s2.addImage({
      data: mockupData,
      x: cx - 0.85, y: mockupY, w: 1.7, h: 1.7,
      sizing: { type: 'contain', w: 1.7, h: 1.7 },
    });

    // Dot on the line
    s2.addShape(pres.ShapeType.ellipse, {
      x: cx - 0.08, y: flowTop + flowH / 2 - 0.08, w: 0.16, h: 0.16,
      fill: { color: brandHex }, line: { color: 'FFFFFF', width: 2 },
    });

    // Step text
    s2.addText(step.title, {
      x: x + 0.05, y: textY, w: colW - 0.1, h: 0.3,
      fontSize: 11, bold: true, color: ink, align: 'center',
    });
    s2.addText(step.description, {
      x: x + 0.05, y: textY + 0.3, w: colW - 0.1, h: 1.3,
      fontSize: 9, color: inkSoft, align: 'center', valign: 'top',
    });
    s2.addText(step.channel.toUpperCase(), {
      x: x + 0.05, y: textY + 1.6, w: colW - 0.1, h: 0.2,
      fontSize: 8, bold: true, color: brandHex, align: 'center',
    });
  });

  addFooter(s2);

  // ─── SLIDE 3 — VALUE ────────────────────────────────────────────────────
  const s3 = pres.addSlide();
  s3.background = { color: 'FFFFFF' };

  // Headline (left)
  if (data.value.boldWord && data.value.headline.toLowerCase().includes(data.value.boldWord.toLowerCase())) {
    const idx = data.value.headline.toLowerCase().indexOf(data.value.boldWord.toLowerCase());
    s3.addText([
      { text: data.value.headline.slice(0, idx), options: { color: ink } },
      { text: data.value.headline.substr(idx, data.value.boldWord.length), options: { color: brandHex } },
      { text: data.value.headline.slice(idx + data.value.boldWord.length), options: { color: ink } },
    ], {
      x: 0.4, y: 0.8, w: 6.4, h: 2.8,
      fontSize: 44, bold: true, valign: 'top',
    });
  } else {
    s3.addText(data.value.headline, {
      x: 0.4, y: 0.8, w: 6.4, h: 2.8,
      fontSize: 44, bold: true, color: ink, valign: 'top',
    });
  }

  s3.addText(data.value.subheading, {
    x: 0.4, y: 3.6, w: 6.4, h: 0.5,
    fontSize: 14, color: inkSoft,
  });

  // Value props (3 stacked)
  data.value.valueProps.slice(0, 3).forEach((vp, i) => {
    const y = 4.4 + i * 0.7;
    s3.addShape(pres.ShapeType.roundRect, {
      x: 0.4, y, w: 0.5, h: 0.5,
      fill: { color: brandHex }, line: { color: brandHex }, rectRadius: 0.08,
    });
    s3.addText('★', { x: 0.4, y, w: 0.5, h: 0.5, fontSize: 16, color: 'FFFFFF', align: 'center', valign: 'middle' });
    s3.addText([
      { text: (vp.text || '').replace(new RegExp(vp.boldWord || '', 'i'), '').trim() + ' ', options: { color: ink, bold: false } },
      { text: vp.boldWord || '', options: { color: ink, bold: true } },
    ], {
      x: 1.0, y: y + 0.05, w: 5.4, h: 0.4,
      fontSize: 16, valign: 'middle',
    });
  });

  // Right-side lifestyle image
  const lifestyle = resolveLifestyleImage(images, data.client.industry, brand, 'pptx');
  s3.addImage({
    data: lifestyle.src,
    x: 7.0, y: 0.8, w: 6.0, h: 5.4,
    sizing: { type: 'cover', w: 6.0, h: 5.4 },
  });

  // Takeaway banner overlay
  s3.addShape(pres.ShapeType.roundRect, {
    x: 7.2, y: 5.4, w: 5.6, h: 1.0,
    fill: { color: '141414', transparency: 8 }, line: { type: 'none' }, rectRadius: 0.08,
  });
  s3.addText(data.value.takeaway, {
    x: 7.4, y: 5.4, w: 5.2, h: 1.0,
    fontSize: 11, bold: true, color: 'FFFFFF', valign: 'middle',
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
