/**
 * Client journey asset generator.
 *
 * Rebuilds Dennison's `aep-client-journey` Claude skill as a Cloud Function:
 * given a brand scrape (already in the lab) plus a few overrides, asks
 * Vertex AI Gemini for a 12-step AEP journey, then renders three outputs:
 *   1. Interactive HTML journey map (full-screen-able iframe)
 *   2. HTML one-pager (full-screen-able iframe, themed with --dash-* tokens)
 *   3. Downloadable PPTX cloned from the bundled Admiral template
 *
 * Source skill: /tmp/aep-client-journey-skill/aep-client-journey/
 *  - SKILL.md
 *  - references/html-rules.md      (HTML journey spec)
 *  - references/content-rules.md   (12-step content shape)
 *  - references/script-boilerplate.md (Python PPTX writer — ported below)
 *
 * Public surface:
 *   handleGenerate(req, res)   POST /api/client-journey/generate
 *   handlePptx(req, res)       POST /api/client-journey/pptx
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { callGemini, stripJsonFences } = require('./vertexClient');
const brandScrapeStore = require('./brandScrapeStore');

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

const PPTX_TEMPLATE_PATH = path.join(__dirname, 'assets', 'Admiral_Insurance_One_Pager.pptx');

/** SVG journey map — 12 node positions (verbatim from html-rules.md). */
const NODES = [
  { cx: 25,  cy: 168 }, // 1  bottom
  { cx: 113, cy: 65  }, // 2  top
  { cx: 200, cy: 158 }, // 3  bottom
  { cx: 288, cy: 58  }, // 4  top
  { cx: 376, cy: 168 }, // 5  bottom
  { cx: 464, cy: 62  }, // 6  top
  { cx: 552, cy: 158 }, // 7  bottom
  { cx: 640, cy: 55  }, // 8  top
  { cx: 726, cy: 165 }, // 9  bottom
  { cx: 814, cy: 52  }, // 10 top
  { cx: 900, cy: 168 }, // 11 bottom
  { cx: 982, cy: 70  }, // 12 top
];

/** Verbatim base path from html-rules.md (single line). */
const BASE_PATH = 'M 25,168 C 55,168 85,65 113,65 C 141,65 172,158 200,158 ' +
  'C 228,158 260,58 288,58 C 316,58 348,168 376,168 ' +
  'C 404,168 436,62 464,62 C 492,62 524,158 552,158 ' +
  'C 580,158 612,55 640,55 C 668,55 698,165 726,165 ' +
  'C 754,165 786,52 814,52 C 842,52 872,168 900,168 ' +
  'C 922,168 958,70 982,70';

/**
 * Cumulative path segments for the active trail.
 * pathSegs[0] = '' (overview, no trail)
 * pathSegs[N] = path from start to node N (1-indexed) — the same C-segments,
 * peeled from the base path.
 */
const PATH_SEGS = [
  '',
  'M 25,168 C 55,168 85,65 113,65',
  'M 25,168 C 55,168 85,65 113,65 C 141,65 172,158 200,158',
  'M 25,168 C 55,168 85,65 113,65 C 141,65 172,158 200,158 C 228,158 260,58 288,58',
  'M 25,168 C 55,168 85,65 113,65 C 141,65 172,158 200,158 C 228,158 260,58 288,58 C 316,58 348,168 376,168',
  'M 25,168 C 55,168 85,65 113,65 C 141,65 172,158 200,158 C 228,158 260,58 288,58 C 316,58 348,168 376,168 C 404,168 436,62 464,62',
  'M 25,168 C 55,168 85,65 113,65 C 141,65 172,158 200,158 C 228,158 260,58 288,58 C 316,58 348,168 376,168 C 404,168 436,62 464,62 C 492,62 524,158 552,158',
  'M 25,168 C 55,168 85,65 113,65 C 141,65 172,158 200,158 C 228,158 260,58 288,58 C 316,58 348,168 376,168 C 404,168 436,62 464,62 C 492,62 524,158 552,158 C 580,158 612,55 640,55',
  'M 25,168 C 55,168 85,65 113,65 C 141,65 172,158 200,158 C 228,158 260,58 288,58 C 316,58 348,168 376,168 C 404,168 436,62 464,62 C 492,62 524,158 552,158 C 580,158 612,55 640,55 C 668,55 698,165 726,165',
  'M 25,168 C 55,168 85,65 113,65 C 141,65 172,158 200,158 C 228,158 260,58 288,58 C 316,58 348,168 376,168 C 404,168 436,62 464,62 C 492,62 524,158 552,158 C 580,158 612,55 640,55 C 668,55 698,165 726,165 C 754,165 786,52 814,52',
  'M 25,168 C 55,168 85,65 113,65 C 141,65 172,158 200,158 C 228,158 260,58 288,58 C 316,58 348,168 376,168 C 404,168 436,62 464,62 C 492,62 524,158 552,158 C 580,158 612,55 640,55 C 668,55 698,165 726,165 C 754,165 786,52 814,52 C 842,52 872,168 900,168',
  'M 25,168 C 55,168 85,65 113,65 C 141,65 172,158 200,158 C 228,158 260,58 288,58 C 316,58 348,168 376,168 C 404,168 436,62 464,62 C 492,62 524,158 552,158 C 580,158 612,55 640,55 C 668,55 698,165 726,165 C 754,165 786,52 814,52 C 842,52 872,168 900,168 C 922,168 958,70 982,70',
];

/**
 * STEP_LABELS x/y/w/h coordinates (verbatim from content-rules.md).
 * The PPTX renderer creates 12 shapes at these positions; only the label text
 * comes from the journey data, never the geometry.
 */
const STEP_LABEL_GEOMETRY = [
  [ 8.06, 18.20, 3.51, 2.00],
  [14.41,  8.97, 3.80, 2.00],
  [20.58, 10.42, 3.80, 2.00],
  [27.07, 19.19, 3.80, 2.00],
  [33.45, 14.50, 3.80, 2.00],
  [40.17, 16.03, 3.80, 2.00],
  [46.80, 15.60, 3.80, 2.00],
  [52.87,  7.45, 3.80, 2.00],
  [59.91, 10.61, 3.80, 2.00],
  [66.07,  4.53, 3.80, 2.00],
  [72.59, 18.44, 3.80, 2.00],
  [79.42, 12.67, 4.50, 2.40],
];

/** Default per-step icons used when Gemini doesn't supply a segment icon. */
const DEFAULT_STEP_ICONS = ['🚗', '🔍', '🌐', '📋', '🛒', '☕', '🎯', '🔐', '🎁', '📝', '💬', '✅'];

/**
 * Inline SVG icon catalog used to render meaningful pictograms inside each
 * journey-map node. Every entry is the inner SVG of a 24x24 outline icon
 * (Feather-style — MIT-licensed look-and-feel) so we can splat them into
 * <g class="node-icon"> without bringing in a font dependency.
 *
 * Gemini chooses one key per step from this catalog (see JOURNEY_SYSTEM_PROMPT
 * + JOURNEY_RESPONSE_SCHEMA). The heuristicIconForLabel() fallback handles
 * any step where the model omits a key or returns one not in the catalog.
 */
const STEP_ICON_CATALOG = {
  // ── Discovery / Awareness ──────────────────────────────────────────────
  search:        '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  globe:         '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  eye:           '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  target:        '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  cursor:        '<path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/>',
  ad:            '<rect x="3" y="3" width="18" height="14" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="7" y1="14" x2="17" y2="14"/>',
  bell:          '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  social:        '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>',
  // ── Engagement / Consideration ─────────────────────────────────────────
  mail:          '<path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><polyline points="22,6 12,13 2,6"/>',
  chat:          '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
  phone:         '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>',
  headset:       '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1v-7h3zM3 19a2 2 0 0 0 2 2h1v-7H3z"/>',
  play:          '<polygon points="5,3 19,12 5,21 5,3"/>',
  book:          '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  calendar:      '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  // ── Identity / Profile ─────────────────────────────────────────────────
  user:          '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  'user-plus':   '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>',
  users:         '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  heart:         '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
  star:          '<polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26 12,2"/>',
  // ── Conversion ─────────────────────────────────────────────────────────
  tag:           '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
  cart:          '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>',
  card:          '<rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
  bag:           '<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  check:         '<polyline points="20,6 9,17 4,12"/>',
  'check-circle':'<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/>',
  // ── Post-purchase / Loyalty ────────────────────────────────────────────
  gift:          '<polyline points="20,12 20,22 4,22 4,12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>',
  truck:         '<rect x="1" y="3" width="15" height="13"/><polygon points="16,8 20,8 23,11 23,16 16,16 16,8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
  package:       '<line x1="16.5" y1="9.4" x2="7.5" y2="4.21"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27,6.96 12,12.01 20.73,6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>',
  refresh:       '<polyline points="23,4 23,10 17,10"/><polyline points="1,20 1,14 7,14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  crown:         '<path d="M2 18l3-13 5 5 4-7 4 7 5-5 3 13H2z"/>',
  // ── Generic fallback ───────────────────────────────────────────────────
  zap:           '<polygon points="13,2 3,14 12,14 11,22 21,10 12,10 13,2"/>',
};

/**
 * Heuristic fallback: pick a sensible icon key from the catalog by
 * keyword-matching the step label. Used when Gemini omits stepIcons or
 * returns a key that's not in STEP_ICON_CATALOG. Order matters — earlier
 * matches win, so put the more specific phrases first.
 */
const ICON_KEYWORD_RULES = [
  [/(retarget|impression|view\s*ad|display\s*ad|programmatic)/i, 'eye'],
  [/(paid\s*search|ppc|sem|google\s*ads|ad\s*click)/i, 'cursor'],
  [/(banner|ad\b|advert|sponsor)/i, 'ad'],
  [/(search|discover|research|find|explore)/i, 'search'],
  [/(visit|website|site|landing|home\s*page|browse)/i, 'globe'],
  [/(notif|push|alert|reminder)/i, 'bell'],
  [/(social|share|tweet|facebook|instagram|tiktok|linkedin)/i, 'social'],
  [/(target|audience|segment|persona)/i, 'target'],
  [/(welcome|onboard|signup|sign\s*up|register|create\s*account|loyalty\s*onboard)/i, 'user-plus'],
  [/(login|account|profile|identity|authent)/i, 'user'],
  [/(community|referr|invite|advocate|friends?)/i, 'users'],
  [/(email|newsletter|inbox)/i, 'mail'],
  [/(chat|message|sms|messenger|whatsapp|conversation)/i, 'chat'],
  [/(call|phone|dial)/i, 'phone'],
  [/(support|help|service|agent|assist)/i, 'headset'],
  [/(video|stream|watch|play)/i, 'play'],
  [/(content|article|read|blog|guide|story)/i, 'book'],
  [/(book|appointment|schedule|reserve|calendar|date)/i, 'calendar'],
  [/(wishlist|favou?rite|save|like)/i, 'heart'],
  [/(review|rate|rating|stars?|feedback)/i, 'star'],
  [/(coupon|promo|discount|offer|deal|voucher)/i, 'tag'],
  [/(reward|loyalty|points|tier|gift)/i, 'gift'],
  [/(vip|premium|elite|top.?tier|priority)/i, 'crown'],
  [/(abandon|recover|cart\s*recovery|drop\s*off)/i, 'refresh'],
  [/(add\s*to\s*cart|added|basket|cart\s*update)/i, 'cart'],
  [/(cart|basket|trolley)/i, 'cart'],
  [/(checkout|payment|pay\b|billing)/i, 'card'],
  [/(complete|purchase|order\s*placed|buy|conversion|transaction)/i, 'bag'],
  [/(confirm|confirmation|thank\s*you|receipt)/i, 'check-circle'],
  [/(deliver|ship|shipping|in\s*transit|out\s*for\s*delivery)/i, 'truck'],
  [/(package|parcel|tracking|fulfil)/i, 'package'],
  [/(return|refund|replace|exchange)/i, 'refresh'],
];

function heuristicIconForLabel(label) {
  const text = String(label || '').trim();
  if (!text) return 'zap';
  for (const [re, key] of ICON_KEYWORD_RULES) {
    if (re.test(text)) return key;
  }
  return 'zap';
}

function resolveStepIcons(rawIcons, stepLabels) {
  const out = [];
  for (let i = 0; i < 12; i++) {
    const requested = Array.isArray(rawIcons) ? String(rawIcons[i] || '').trim().toLowerCase() : '';
    if (requested && STEP_ICON_CATALOG[requested]) {
      out.push(requested);
    } else {
      out.push(heuristicIconForLabel(stepLabels[i] || ''));
    }
  }
  return out;
}

// ─── SMALL HELPERS ───────────────────────────────────────────────────────────

function safeString(v, fallback = '') {
  if (v == null) return fallback;
  if (typeof v === 'string') return v;
  try { return String(v); } catch { return fallback; }
}

function slugify(s) {
  return safeString(s).toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'client';
}

function escapeHtml(s) {
  return safeString(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(s) { return escapeHtml(s); }

/** Try to extract a clean #RRGGBB hex from a string (allows #RGB shorthand). */
function normaliseHex(input, fallback = '#333333') {
  const raw = safeString(input).trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return '#' + raw.toUpperCase();
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    return '#' + raw.split('').map(c => c + c).join('').toUpperCase();
  }
  return fallback;
}

/** Darken a hex by mixing with black (0..1). */
function darken(hex, amount = 0.5) {
  const h = normaliseHex(hex).slice(1);
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const m = Math.max(0, Math.min(1, amount));
  const dr = Math.round(r * (1 - m));
  const dg = Math.round(g * (1 - m));
  const db = Math.round(b * (1 - m));
  return '#' + [dr, dg, db].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** Pick the first colour from a colours array that isn't near-white / near-black. */
function pickPrimaryColour(colours, fallback = '#E60000') {
  if (!Array.isArray(colours)) return fallback;
  for (const entry of colours) {
    const hex = typeof entry === 'string' ? entry : (entry && (entry.hex || entry.color));
    const norm = normaliseHex(hex, '');
    if (!norm) continue;
    const h = norm.slice(1);
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (lum > 18 && lum < 235) return norm; // skip pure white / black
  }
  return fallback;
}

/** Hex → 'RRGGBB' (no leading hash) for PPTX srgbClr/val. */
function hexToPptxRgb(hex) {
  return normaliseHex(hex).slice(1);
}

// ─── SCRAPE SUMMARISATION (LLM PROMPT INPUT) ─────────────────────────────────

/**
 * Slim a brand-scrape record down to the bits Gemini actually needs to
 * design the 12-step journey. Returns a compact JS object suitable for
 * JSON.stringify into the user prompt.
 */
function summariseScrapeForPrompt(scrape) {
  if (!scrape || typeof scrape !== 'object') return {};
  const cs = (scrape.crawlSummary && typeof scrape.crawlSummary === 'object') ? scrape.crawlSummary : {};
  const tagAudit = cs.tagAuditSummary || {};
  const assets = cs.assets || {};

  const colours = Array.isArray(assets.colours)
    ? assets.colours.slice(0, 8).map((c) => (typeof c === 'string' ? c : (c && (c.hex || c.color)))).filter(Boolean)
    : [];

  const pages = Array.isArray(cs.pages)
    ? cs.pages.slice(0, 12).map((p) => ({
        title: safeString(p && p.title).slice(0, 140),
        url: safeString(p && p.url).slice(0, 200),
        description: safeString(p && p.description).slice(0, 220),
      }))
    : [];

  // Tag audit may be a flat map or nested. Normalise to "Category: name" lines.
  const techLines = [];
  function pushTech(category, items) {
    if (!Array.isArray(items)) return;
    for (const item of items) {
      const name = safeString(typeof item === 'string' ? item : (item && (item.name || item.label || item.product))).trim();
      if (name) techLines.push(`${category}: ${name}`);
    }
  }
  if (tagAudit && typeof tagAudit === 'object') {
    for (const k of Object.keys(tagAudit)) {
      const v = tagAudit[k];
      if (Array.isArray(v)) pushTech(k, v);
      else if (v && typeof v === 'object' && Array.isArray(v.items)) pushTech(k, v.items);
    }
  }

  const analysis = scrape.analysis && typeof scrape.analysis === 'object' ? scrape.analysis : null;
  const personas = Array.isArray(scrape.personas && scrape.personas.personas)
    ? scrape.personas.personas.slice(0, 3)
    : (Array.isArray(scrape.personas) ? scrape.personas.slice(0, 3) : []);
  const segments = Array.isArray(scrape.segments && scrape.segments.segments)
    ? scrape.segments.segments.slice(0, 8)
    : (Array.isArray(scrape.segments) ? scrape.segments.slice(0, 8) : []);

  return {
    brandName: scrape.brandName || '',
    url: scrape.url || '',
    industry: scrape.industry || '',
    country: scrape.country || '',
    businessType: scrape.businessType || '',
    colours,
    pages,
    detectedTech: techLines.slice(0, 40),
    about: analysis && analysis.about ? safeString(analysis.about).slice(0, 1200) : '',
    toneOfVoice: analysis && analysis.tone_of_voice ? safeString(analysis.tone_of_voice).slice(0, 600) : '',
    brandValues: analysis && analysis.brand_values ? safeString(analysis.brand_values).slice(0, 600) : '',
    personas: personas.map((p) => ({
      name: safeString(p && p.name).slice(0, 80),
      role: safeString(p && (p.role || p.title)).slice(0, 120),
      description: safeString(p && (p.description || p.summary || p.bio)).slice(0, 400),
    })),
    segments: segments.map((s) => ({
      name: safeString(s && s.name).slice(0, 80),
      description: safeString(s && (s.description || s.summary)).slice(0, 300),
    })),
  };
}

// ─── GEMINI: SYSTEM PROMPT + JSON SCHEMA ─────────────────────────────────────

const JOURNEY_SYSTEM_PROMPT = `You are an Adobe Experience Platform (AEP) solution architect designing a customer journey for a sales presentation. You will receive a JSON object describing a brand (the "client") that has already been crawled by the Adobe Brand Scraper. Your job is to design a 12-step end-to-end customer journey that demonstrates how AEP would orchestrate this client's customer experience.

Output ONE JSON object that exactly matches the requested schema. Do not include prose, markdown fences, comments, or any extra keys. All array lengths MUST match the schema. Where the schema says "12 items" you MUST return exactly 12, where it says "13 items" you MUST return exactly 13.

Hard rules:
- "stepLabels": 12 short labels, 2-4 words each, prefixed with "01  " "02  " ... "12  " (number, two spaces, label).
- "stepIcons": 12 icon keys, one per step, chosen from this catalog (and ONLY from this catalog) so the journey map can render a meaningful pictogram inside each node circle:
    Discovery / awareness: search, globe, eye, target, cursor, ad, bell, social
    Engagement: mail, chat, phone, headset, play, book, calendar
    Identity / profile: user, user-plus, users, heart, star
    Conversion: tag, cart, card, bag, check, check-circle
    Post-purchase / loyalty: gift, truck, package, refresh, crown
    Generic fallback: zap
  Pick the icon that best represents the customer's action or experience at that step (NOT the AEP capability behind it). Examples: a "Paid Search Click" step → "cursor"; "Audience Retargeting" → "eye" or "target"; "Adds to Cart" → "cart"; "Cart Abandonment" → "refresh"; "Order Confirmation" → "check-circle"; "Loyalty Onboarding" → "gift" or "crown"; "Personalised Welcome" → "user-plus" or "mail". Do not invent new keys. If nothing fits, use "zap".
- "descriptions": 13 strings, one or two sentences each, in present tense. INDEX 2 (the third item) MUST be an empty string "" — it is the merged-cell hMerge spacer. Indices 0,1,3,4,5,6,7,8,9,10,11,12 carry steps 1..12 respectively.
- "data": 12 items. Each item describes the customer-data state at that step.
  status options: "Unknown Customer", "Known Customer", "Active Customer", "Known Donor", "Known Supporter", "New Customer", or similar 2-3 word phrase.
  identity examples: "ECID (anonymous)", "ECID | Email ID", "ECID | Email ID | Account ID | Phone ID", "All resolved identities".
- "adobe": 12 items. Each item is an array of blocks. block.type ∈ "product" | "heading" | "bullet" | "blank". Use product for Adobe product names ("Real-Time CDP", "Journey Optimizer", "Customer Journey Analytics", "AEM Assets"). Use heading for sub-headings ("Data ingestion:", "Identities:", "Segmentation:", "Activation:"). Use bullet for the actual content. Use blank sparingly for spacing.
- "tech": 12 items. Each item has heading (a 2-4 word category like "Web & CMS", "CRM & Billing", "Paid Media", "Engagement Channels") and bullets (each with text + confirmed:boolean). Use confirmed:true for technologies present in the input "detectedTech" list, confirmed:false for plausible inferences.
- "slides": 13 items. slides[0] is the overview (activeNode -1, label "Overview", desc = one sentence summary of the whole journey). slides[1..12] correspond to journey steps 1..12 (activeNode = stepIndex - 1). Each slide carries: label (matches the stepLabel without the "NN  " prefix), activeNode, desc (1-2 sentence persona narrative), data[] (Data Collected bullets — strings), dataActive[] (subset newly captured this step), ingestion[] (Data Ingestion bullets), ingestionActive[], segs[] (segments — each {i: emoji, l: label-with-newlines}), segActive[] (subset of segment labels active this step), ids[] (each [label, isActive] tuple e.g. ["ECID", true]), orch[] (Journey Orchestration bullets — Adobe Journey Optimizer activity: triggers fired, journey paths chosen, frequency rules applied), orchActive[], decisioning[] (Decision Management bullets — see critical rule 5 for format; one line per decision, outcome + signal that drove it. Use decisioning at retargeting, personalised offer, web personalisation, re-engagement, post-conversion next-best-action steps. Leave empty when no decision is being made at this step), decisioningActive[] (subset of decisioning[] newly active this step), activ[] (Activation/Destinations bullets — see CLOSED CHANNEL LIST below), activActive[] (subset of activ[] active this step — entries MUST exactly match strings in this slide's activ[]), tech[] (each {t: text, a: isActive}).

Critical content rules (these govern WHAT goes in each cell — violations weaken the AEP narrative):

1. ACQUISITION vs EXISTING-CUSTOMER journey type governs the starting state:
   - Acquisition / cold start (no prior relationship — journeyType keywords like "acquisition", "new customer", "first-time visitor", "trial", "lead gen"): customer begins as "Unknown Customer" or "Anonymous Customer" at step 1. Identity, profile data, and segments build progressively as the journey unfolds.
   - Existing-customer journey (loyalty member, account holder, CRM record, renewal, win-back, cross-sell, upgrade — journeyType keywords like "renewal", "loyalty", "upgrade", "cross-sell", "winback", "existing customer", "retention", "service"): customer begins as "Known Customer" (or "Active Customer", "Loyalty Member" etc.) from step 1. The brand already holds their email, account ID, purchase history, loyalty status, etc. Populate data, ids, and segments from step 1 accordingly — do NOT pretend they are anonymous.
   - When in doubt, infer from input.client.journeyType plus the persona description.

2. DATA must be blank when the customer is truly Unknown (no identifier, no prior relationship). For an acquisition journey at the first awareness/research moments, AEP literally has nothing on this person — return data: { status: "Unknown Customer", bullets: [] } with an empty bullets array. Do NOT invent behavioural data we could not have collected.

3. ADOBE must be blank when there is no client-side touchpoint at that step. AEP can only ingest, segment, decide, or activate based on data flowing through a client-owned channel (their own website, app, email, login, etc.). Off-platform moments (browsing competitor sites, watching TV, googling, asking a friend, in-store window-shopping) are invisible to Adobe — return adobe: [] for those steps. Do NOT credit AEP with seeing data it could not have received.

4. IDENTITY belongs ONLY in the slides[i].ids array (the dedicated Identities column) and in the adobe[] blocks under an "Identities:" heading. NEVER list identifiers (ECID, Email ID, Account ID, Phone ID, etc.) inside slides[i].data[] or the data[i].bullets — Data Collected is for behavioural and profile attributes only. The Identities column carries the identity story.

5. DECISIONING bullets are one-line, outcome-plus-signal: state WHAT was selected and the SIGNAL THAT DROVE IT — never describe the mechanism (eligibility rules, ranking algorithms, fallback logic). Examples of correct format: "Best mortgage rate matched to her deposit band", "Deposit-match creative selected over rate-focus for first-time buyers", "Returning-visitor banner personalised to her saved product". Wrong: "The decision engine evaluated eligibility rules across the offer library and ranked candidates by propensity score". Pair Decision Management with the Journey Optimizer cell that delivers the outcome — Decisioning answers "what was chosen and why?", Journey Optimizer answers "how was it delivered?".

6. TECH must contain ONLY digital platforms and software systems the client owns or operates (CRM, CMS, commerce, billing, paid-media DSPs, ESPs, analytics, tag managers, contact-centre software, mobile app frameworks, etc.). NEVER include offline channels, media, or non-software items: no print magazines, TV ads, radio, billboards, word-of-mouth, in-store signage, sponsorship, events. If awareness or inspiration comes from an offline source, that context belongs in the slide's "desc" narrative — never in TECH. The TECH row is an inventory of digital tooling, not a list of marketing channels.

7. TECH applies a TWO-LEVEL FILTER:
   - Journey level: only include technologies that are actually relevant to THIS journey. A B2B CRM in a retail consumer journey, or a loyalty app in a cold-acquisition journey, should NOT appear at any step — exclude entirely.
   - Step level: of the journey-relevant tech, only include it in slides[i].tech where it is actively touched at that moment. If a platform plays no role at a step, omit it from that step's tech array.
   Past entries accumulate in the renderer (they remain visible as dimmed past items as the user navigates forward), so do NOT repeat a technology once it has appeared — list it only on the step where it first becomes active.

8. Every TECH bullet must have confirmed:true (vendor named in input.detectedTech) or confirmed:false (plausible inference from industry). The renderer surfaces this badge — never omit or fudge it.

9. CUSTOMER STATE ENUM. Every slide's persona narrative MUST resolve to exactly one of three formal customer states: "Acquisition" (no prior relationship — anonymous, first-time, lead), "Existing" (the brand already holds an identifier and historical behaviour — loyalty members, account holders, paying customers, registered users), or "Win-back" (the brand previously had a relationship that has lapsed — churned, dormant, post-cancellation). Pick the state from the input.client.journeyType + persona description and stay consistent across all 12 steps; do NOT slide between states mid-journey unless the journey is explicitly designed as a conversion ("Acquisition" first half → "Existing" second half is fine after step ~6 once the customer has bought; otherwise stay in one state).

10. IDENTITY TIMING. When an identity becomes known to the brand (ECID at first page-view, Email ID at form submit, Account ID at login, Phone ID at SMS opt-in, Loyalty ID at programme join), update slides[i].ids[] AT THE SAME STEP that captures the identifier — not the next step. The Identities column should mark the new identifier with a:true on the step it's captured, and roll forward as a:true on every subsequent step where the customer is still recognised. Do NOT lazily push the identity to the slide AFTER the capture step — the audience needs to see the cause and effect on the same slide.

11. AEM ASSETS PLACEMENT. Adobe Experience Manager Assets is NEVER its own product entry in adobe[]. Mention it (when relevant) inside an existing AJO bullet, e.g. "AJO email send (assets pulled from AEM Assets)". The audience should read AEM Assets as the asset library that AJO draws on, not as a standalone product line in the AEP narrative.

12. DECISION MANAGEMENT SCOPE. Reserve decisioning[] for PRIMARY decisions that materially shape what the customer sees or receives — offer selected, hero content selected, channel selected, upsell selected, ranking of multiple eligible products against profile signals. NEVER use decisioning[] for: minor display rules ("badge shown", "tag added", "label applied"), pure signal-flagging without delivery ("high-intent profile flagged", "affinity noted"), Brand Concierge conversational recommendations (those are conversation, not catalogue decisioning), OR paid-media creative selection (Meta / Google / TikTok control their own creative selection — Adobe is not deciding what ad to show).

13. PAID-MEDIA TECH EXCEPTION. Paid-media platforms (Meta Ads, Google Ads, TikTok, programmatic DSPs) MAY appear in TECH with a:false on every slide. Their role is to receive AEP-segment audiences for activation, not to be live "active" at any step (the moment they're active is the moment AEP pushes the audience — captured by activ[] / activActive[] for AJO channels and by the activation column more broadly). For paid-media TECH entries, set a:false on every slide and let the renderer dim them; the audience reads "this is the customer's existing paid-media stack that AEP will feed".

14. NO NEVER-ACTIVE TECH. Excepting the paid-media platforms above, every other TECH entry MUST be a:true on at least one slide. If a vendor never plays an active role in the journey, omit it from j.tech entirely — a permanently dimmed entry is noise.

15. B2B JOURNEY ARC. If input.client.journeyType signals B2B (keywords: "B2B", "account", "lead", "MQL", "SQL", "opportunity", "ABM", "demand gen", "enterprise sale"), the arc is account → contact → opportunity → close, NOT a consumer purchase funnel. Persona narratives reference job titles + buying committee members, decisioning bullets reference offer/content selection by industry/company-size/role, ids[] should include "Account ID" alongside "Email ID" early, and orchestration emphasises lead routing + sales handoff alongside marketing automation. Do NOT shoehorn a B2C cart/checkout arc onto a B2B journey.

16. desc REFLECTS orchActive. The slide's "desc" persona narrative MUST describe what is ACTIVELY happening at THIS step, derived from orchActive[] / decisioningActive[] / activActive[] / dataActive[] — not what was queued earlier, what was done two steps ago, or what might happen in the future. The audience reads desc and looks down at the live (active) bullets to see them play out. If desc says "she opens the email" but no email-related bullet is in any *Active[] array on this slide, the narrative is broken.

CLOSED CHANNEL LIST for activ[] / activActive[] (Adobe Journey Optimizer delivery channels):
- Every entry in "activ" and "activActive" MUST be exactly one of these 9 strings, character-for-character. NEVER invent new channels, paraphrase them, or substitute non-Adobe channels (e.g. "Salesforce email", "Marketo SMS", "Mailchimp", "Facebook Ads", "Google Ads" are FORBIDDEN — those are not AJO channels):
    1. "Email"
    2. "Push notifications (mobile app)"
    3. "SMS / Text messages"
    4. "In-app messages"
    5. "Web in-app / Web overlays"
    6. "WhatsApp"
    7. "LINE"
    8. "Push notifications on web"
    9. "Direct mail"
- Pick channels that genuinely improve the customer experience or marketing uplift at THAT step for THAT persona. Examples: discovery → "Email" + "Push notifications on web"; cart abandonment → "Email" + "Push notifications (mobile app)" + "SMS / Text messages"; in-store visit → "Push notifications (mobile app)" + "WhatsApp"; loyalty milestone → "Email" + "Direct mail"; APAC market → include "LINE" where appropriate; high-engagement messaging → "WhatsApp" where the country/persona supports it.
- Each slide's activ[] should list 1-4 channels, ordered by relevance to that step. activActive[] is the subset that lights up on this slide (typically 1-2 — the channel(s) most active at this exact moment in the journey). activActive[] strings MUST match activ[] strings exactly.
- "Adobe Journey Optimizer" itself is a product (use it in adobe[] blocks), NOT a channel — never put "Journey Optimizer" or "AJO" in activ[].

Soft rules:
- Use the persona's name throughout the slide narratives. If no persona was provided, invent a plausible first-name persona for this client and journey.
- Honour the input client.brandColour for any brand-coloured highlights in your descriptions.
- For tech bullets: if the input "detectedTech" list mentions a vendor, use it (and set confirmed:true). Otherwise infer a plausible vendor from the industry and set confirmed:false.
- The pivotal moment of the journey is step 2 — give it the richest description (it gets the wide merged cell on the one-pager).
- Be specific to this client's industry; never use placeholder text.

Do not return anything except the single JSON object.`;

/**
 * Tier-specific overlay prepended to the system prompt at call time.
 *
 * Foundation = core AEP only (RT-CDP + Journey Optimizer + CJA). The
 * model MUST emit empty decisioning/decisioningActive arrays on every
 * slide and MUST NOT mention Decision Management or Brand Concierge in
 * the adobe[] product blocks.
 *
 * Advanced = Foundation + Decision Management + Brand Concierge.
 * Decisioning bullets follow critical rule 5 (outcome + signal). Brand
 * Concierge bullets sit inside orch[] / orchActive[] alongside AJO
 * bullets, prefixed with "Brand Concierge:" so the renderer can style
 * them. BC must be customer-initiated, owned-channel only, and have a
 * clear narrative reason.
 */
function buildSystemPrompt(tier) {
  const t = tier === 'foundation' ? 'foundation' : 'advanced';
  const overlay = t === 'foundation'
    ? `AEP CAPABILITY TIER: FOUNDATION
This journey demonstrates ONLY the core AEP foundation — Real-Time CDP, Journey Optimizer, and Customer Journey Analytics. You MUST observe these tier-specific rules in addition to everything below:
- decisioning[] and decisioningActive[] MUST be empty arrays [] on every slide. Do NOT generate any decisioning bullets at all.
- adobe[] product blocks MUST NOT mention "Decision Management" or "Brand Concierge". The only Adobe products available are: "Real-Time CDP" (or "CDP"), "Journey Optimizer", "Customer Journey Analytics", and (rarely, only if explicitly relevant) "AEM Assets" referenced inside an AJO bullet.
- The personalisation narrative still happens — but attribute it to Journey Optimizer's segment-driven content selection rather than a separate Decision Management product.
- orch[] bullets MUST NOT contain "Brand Concierge:" entries.

`
    : `AEP CAPABILITY TIER: ADVANCED
This journey may use the full AEP suite — RT-CDP, Journey Optimizer, Customer Journey Analytics, Decision Management, and Brand Concierge. In addition to everything below, you MUST observe these tier-specific rules:
- Use Decision Management at every personalisation step where a specific offer / hero content / channel / upsell is chosen. Bullets follow critical rule 5 below (outcome + signal). DM is for PRIMARY decisions only — not for minor display rules (badges, labels, tags) and never for paid media creative selection (Meta/Google control their own creative).
- Brand Concierge is a customer-initiated conversational AI on the brand's owned web/app surfaces. When you include it, write the bullet inside orch[] / orchActive[] (NOT a separate column) prefixed with "Brand Concierge:" so the renderer can style it distinctly. Format: "Brand Concierge: customer asked X — guided to Y". One or two BC bullets per relevant step, max.
- Brand Concierge is FORBIDDEN at any step where the customer is not actively on a brand-owned channel — never at abandonment steps, email/SMS steps, retargeting steps, or any off-site moment. The customer opens the widget; it cannot reach out.
- Brand Concierge must have a clear narrative reason: what did the customer ask, what did they get? Do not include BC at a step just because the customer is on the website. A BC bullet without a specific question is noise — omit it.
- Brand Concierge cannot personalise outbound content (emails, SMS, push). Email/SMS personalisation is a Decision Management call.
- Brand Concierge conversational recommendations are NOT Decision Management. DM appears within a BC interaction only if a specific promotional offer from the offer catalogue is being surfaced (e.g. a loyalty discount applied to a recommended product).

`;
  return overlay + JOURNEY_SYSTEM_PROMPT;
}

/**
 * Closed list of Adobe Journey Optimizer delivery channels that the
 * activ[] / activActive[] arrays may contain. These are the only
 * strings the model may emit there — we enforce it both in the system
 * prompt (above) and via a strict enum in the response schema below,
 * AND we re-clamp post-parse in normaliseJourney() so any drift
 * (older cache entries, non-schema fallbacks, model hallucinations)
 * gets quietly snapped to the nearest valid channel.
 *
 * Order matters for fallback rendering — index 0 is the safest
 * generic default (Email).
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

/**
 * Vertex Gemini responseSchema (subset that matters for structural validation).
 * We keep this loose — Gemini honours length constraints from the system prompt
 * and we re-validate post-parse.
 */
const JOURNEY_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    client: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        slug: { type: 'string' },
        domain: { type: 'string' },
        brandColour: { type: 'string' },
        darkColour: { type: 'string' },
        journeyType: { type: 'string' },
      },
      required: ['name', 'brandColour'],
    },
    persona: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        role: { type: 'string' },
        intro: { type: 'string' },
      },
      required: ['name'],
    },
    stepLabels: { type: 'array', items: { type: 'string' } },
    stepIcons: { type: 'array', items: { type: 'string' } },
    descriptions: { type: 'array', items: { type: 'string' } },
    data: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          bullets: { type: 'array', items: { type: 'string' } },
          identity: { type: 'string' },
        },
        required: ['status', 'bullets'],
      },
    },
    adobe: {
      type: 'array',
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string' },
            text: { type: 'string' },
          },
          required: ['type', 'text'],
        },
      },
    },
    tech: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          heading: { type: 'string' },
          bullets: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                text: { type: 'string' },
                confirmed: { type: 'boolean' },
              },
              required: ['text'],
            },
          },
        },
        required: ['heading', 'bullets'],
      },
    },
    slides: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          label: { type: 'string' },
          activeNode: { type: 'integer' },
          desc: { type: 'string' },
          data: { type: 'array', items: { type: 'string' } },
          dataActive: { type: 'array', items: { type: 'string' } },
          ingestion: { type: 'array', items: { type: 'string' } },
          ingestionActive: { type: 'array', items: { type: 'string' } },
          segs: {
            type: 'array',
            items: {
              type: 'object',
              properties: { i: { type: 'string' }, l: { type: 'string' } },
              required: ['l'],
            },
          },
          segActive: { type: 'array', items: { type: 'string' } },
          ids: {
            type: 'array',
            items: {
              type: 'array',
              items: {},
            },
          },
          orch: { type: 'array', items: { type: 'string' } },
          orchActive: { type: 'array', items: { type: 'string' } },
          // Decisioning runs as a stacked sub-column underneath Orchestration
          // in the journey map (column 4 = Orch top half + Decisioning bottom
          // half). Optional in the schema so cached results that pre-date
          // this addition still render — empty arrays just hide the strip.
          decisioning: { type: 'array', items: { type: 'string' } },
          decisioningActive: { type: 'array', items: { type: 'string' } },
          // activ[] / activActive[] are constrained to the closed AJO
          // channel list. Vertex's structured-output mode rejects any
          // string outside the enum, which gives us hard schema-level
          // protection against hallucinated channels (paid media,
          // third-party ESPs, etc.) on top of the system-prompt rule.
          activ: { type: 'array', items: { type: 'string', enum: AJO_CHANNELS } },
          activActive: { type: 'array', items: { type: 'string', enum: AJO_CHANNELS } },
          tech: {
            type: 'array',
            items: {
              type: 'object',
              properties: { t: { type: 'string' }, a: { type: 'boolean' } },
              required: ['t'],
            },
          },
        },
        required: ['label', 'activeNode', 'desc'],
      },
    },
  },
  required: ['client', 'persona', 'stepLabels', 'descriptions', 'data', 'adobe', 'tech', 'slides'],
};

// ─── POST-VALIDATION (lock array lengths) ────────────────────────────────────

function ensureLength(arr, n, fillFactory) {
  const out = Array.isArray(arr) ? arr.slice(0, n) : [];
  while (out.length < n) out.push(fillFactory(out.length));
  return out;
}

// ─── Phase 3 helpers: post-Vertex content scans ─────────────────────────────

// Words/phrases that indicate the model put a "no journey yet" placeholder
// or a data-write-back into orch (both belong elsewhere). Matched
// case-insensitively against the trimmed bullet text.
const ORCH_PLACEHOLDER_RX = /\b(no journey|queued|not yet|waiting|triggered but)\b/i;
const ORCH_WRITE_BACK_RX = /\b(written to|profile updated|affinity written|attribute (?:updated|written)|signal (?:captured|written))\b/i;

// DM purity — bullets that name a paid-media platform, are pure
// signal-flagging without delivery, are minor display rules, or are
// BC-style conversational recommendations.
const DM_PAID_MEDIA_RX = /\b(meta|google|instagram|facebook|tiktok|paid media|carousel|ad creative|dsp|programmatic)\b/i;
const DM_SIGNAL_ONLY_RX = /^(?:\s*)(?:high[- ]intent (?:profile )?flagged|.*affinity noted|.*threshold reached|signal flagged|propensity score (?:noted|flagged))(?:\s*)$/i;
const DM_MINOR_RULE_RX = /^(?:\s*)(?:badge shown|label applied|tag added|sustainability badge)(?:\s*)$/i;
const DM_BC_LEAK_RX = /\b(brand concierge|conversational|asked about|guided to|outfit guidance)\b/i;

// Identity namespace — strings that are not person-level identifiers.
const IDS_FORBIDDEN_RX = /\b(order|session|token|transaction|reference)\b/i;

// Paid media impressions — never available at the individual level.
const PAID_IMPRESSION_RX = /\b(meta ad impression|google ad shown|instagram impression|facebook impression|tiktok impression|ad shown|ad impression)\b/i;

// Email events on Web SDK — should be AJO email tracking instead.
const WEBSDK_EMAIL_RX = /\b(email (?:engagement|open|click|opens|clicks).*(?:web ?sdk|browser sdk))\b/i;

// CJA references that have leaked into orch/activ (belong in segs).
const CJA_PREFIX_RX = /^\s*cja\s*:/i;

// SMS detection (rules out push notifications, in-app messages, etc).
const SMS_RX = /\b(sms|text message|text msg)\b/i;

// Step labels that imply the customer is OFF the brand's owned channel.
const OFF_CHANNEL_LABEL_RX = /\b(abandon|abandonment|email|sms|retargeting|paid media|push|off[- ]site|out[- ]of[- ]session)\b/i;

// Generic TECH catch-all — name a real ESP or omit.
const GENERIC_EMAIL_TECH_RX = /^(?:\s*)email delivery platform(?:\s*)$/i;

function runContentScans(slides, j) {
  if (!Array.isArray(slides) || slides.length === 0) return;

  // Track new-vs-carried orch items across slides so scans 1 + 2 can
  // both reason about novelty.
  const seenOrch = new Set();
  const slideOffChannel = slides.map((s) =>
    OFF_CHANNEL_LABEL_RX.test(safeString(s && s.label))
  );

  // Set of live SMS-channel slides (used by scan 5 — Phone ID rule).
  for (let i = 0; i < slides.length; i++) {
    const s = slides[i];
    if (!s) continue;

    // Scan 1 — orch placeholders / write-backs / cross-slide duplicates.
    const orchRaw = Array.isArray(s.orch) ? s.orch : [];
    const orchClean = [];
    for (const item of orchRaw) {
      const text = safeString(item).trim();
      if (!text) continue;
      if (ORCH_PLACEHOLDER_RX.test(text)) continue;
      if (ORCH_WRITE_BACK_RX.test(text)) continue;
      // Drop carry-forward duplicates (skill v9: accumulate() does this
      // visually; the model shouldn't repeat itself in the data).
      if (seenOrch.has(text)) continue;
      seenOrch.add(text);
      orchClean.push(text);
    }
    s.orch = orchClean;

    // Scan 2a — orchActive completeness. Every orch item that is new
    // at this slide (i.e. not present in any prior slide's orch — we
    // approximate via seenOrch.size delta) gets added to orchActive
    // if missing. We re-derive newness from orchClean order: items
    // appended at this slide ARE new because we filtered duplicates
    // above, so their union with the existing orchActive is correct.
    const orchActiveSet = new Set(
      (Array.isArray(s.orchActive) ? s.orchActive : []).map((v) => safeString(v).trim())
    );
    const orchSet = new Set(orchClean);
    // Strip orchActive entries that aren't in orch (clamp to validity)
    // then ensure every orch item that's new at this slide is active.
    const finalActive = [];
    for (const t of orchClean) {
      if (orchActiveSet.has(t) || true) {
        // True "newness" = it wasn't in any earlier slide. Because
        // dedupe above already removed cross-slide repeats from
        // s.orch, every item left here is genuinely new at this step.
        finalActive.push(t);
      }
    }
    // De-dupe and clamp to entries that exist in orch.
    const seenActive = Object.create(null);
    s.orchActive = finalActive.filter((v) => orchSet.has(v) && (seenActive[v] ? false : (seenActive[v] = true)));

    // Scan 2b — segActive emoji-prefix bug. The accumulator matches
    // segActive entries against segs[i].l exactly; an emoji-prefixed
    // entry will never match and the segment will silently never
    // highlight. Strip any leading non-letter run that doesn't appear
    // in the segs[].l set.
    const segs = Array.isArray(s.segs) ? s.segs : [];
    const segLabels = new Set(segs.map((sg) => safeString(sg && sg.l).trim()));
    s.segActive = (Array.isArray(s.segActive) ? s.segActive : [])
      .map((v) => {
        const raw = safeString(v).trim();
        if (segLabels.has(raw)) return raw;
        // Try stripping a leading emoji + whitespace/newline run.
        const stripped = raw.replace(/^[^\p{L}\p{N}]+/u, '').trim();
        return segLabels.has(stripped) ? stripped : null;
      })
      .filter((v) => v !== null);

    // Scan 3 — Decision Management purity. Drop bullets that mention
    // paid media, are signal-only, are minor display rules, or are BC
    // conversational recommendations. Keep the parallel
    // decisioningActive in sync with the cleaned set.
    const decRaw = Array.isArray(s.decisioning) ? s.decisioning : [];
    const decClean = decRaw
      .map((v) => safeString(v).trim())
      .filter((v) => {
        if (!v) return false;
        if (DM_PAID_MEDIA_RX.test(v)) return false;
        if (DM_SIGNAL_ONLY_RX.test(v)) return false;
        if (DM_MINOR_RULE_RX.test(v)) return false;
        if (DM_BC_LEAK_RX.test(v)) return false;
        return true;
      });
    s.decisioning = decClean;
    const decSet = new Set(decClean);
    s.decisioningActive = (Array.isArray(s.decisioningActive) ? s.decisioningActive : [])
      .map((v) => safeString(v).trim())
      .filter((v) => decSet.has(v));

    // Scan 5a — identity namespace. Person-level identifiers only.
    const ids = Array.isArray(s.ids) ? s.ids : [];
    s.ids = ids.filter((row) => {
      if (!Array.isArray(row) || !row.length) return false;
      const label = safeString(row[0]).trim();
      if (!label) return false;
      return !IDS_FORBIDDEN_RX.test(label);
    });

    // Scan 6a — CJA bullets in orch belong in segs (or get dropped if
    // already represented). We move the segment-friendly form (label
    // after the "CJA: " prefix) to segs and remove the orch entry.
    if (s.orch.length) {
      const remainingOrch = [];
      for (const t of s.orch) {
        if (CJA_PREFIX_RX.test(t)) {
          const segLabel = t.replace(CJA_PREFIX_RX, '').trim();
          if (segLabel && !Array.from(segLabels).some((l) => l.toLowerCase() === segLabel.toLowerCase())) {
            (s.segs = s.segs || []).push({ i: '📊', l: segLabel });
            segLabels.add(segLabel);
          }
          // and drop from orch entirely
          continue;
        }
        remainingOrch.push(t);
      }
      s.orch = remainingOrch;
      // Re-sync orchActive after the move.
      const liveOrch = new Set(s.orch);
      s.orchActive = (s.orchActive || []).filter((v) => liveOrch.has(v));
    }
    // Same scrub for activ — CJA never belongs in activation.
    if (Array.isArray(s.activ)) {
      s.activ = s.activ.filter((v) => !CJA_PREFIX_RX.test(safeString(v).trim()));
    }

    // Scan 6b — paid-impression items in data/ingestion (never
    // available at the individual level).
    if (Array.isArray(s.data)) {
      const cleanData = s.data.filter((v) => !PAID_IMPRESSION_RX.test(safeString(v)));
      const dataSet = new Set(cleanData);
      s.dataActive = (Array.isArray(s.dataActive) ? s.dataActive : []).filter((v) => dataSet.has(v));
      s.data = cleanData;
    }
    if (Array.isArray(s.ingestion)) {
      const cleanIng = s.ingestion.filter((v) => !PAID_IMPRESSION_RX.test(safeString(v)));
      const ingSet = new Set(cleanIng);
      s.ingestionActive = (Array.isArray(s.ingestionActive) ? s.ingestionActive : []).filter((v) => ingSet.has(v));
      s.ingestion = cleanIng;
    }

    // Scan 6c — email events on Web SDK should be AJO email tracking.
    // Rewrite in place (preserves item identity for orchActive matching).
    if (Array.isArray(s.ingestion)) {
      s.ingestion = s.ingestion.map((v) => {
        const t = safeString(v);
        if (WEBSDK_EMAIL_RX.test(t)) {
          return 'AJO email open / click events → ExperienceEvent';
        }
        return t;
      });
      // Keep ingestionActive aligned to the rewritten strings — easiest
      // to clamp by intersection with the rewritten ingestion set.
      const ingSet2 = new Set(s.ingestion);
      s.ingestionActive = (Array.isArray(s.ingestionActive) ? s.ingestionActive : []).filter((v) => ingSet2.has(v));
    }

    // Scan 7 — Brand Concierge placement. BC entries (orch bullets
    // with "Brand Concierge:" prefix) are forbidden at off-channel
    // steps (abandonment, email/SMS, retargeting). We drop them along
    // with their matching orchActive entries.
    if (slideOffChannel[i] && Array.isArray(s.orch)) {
      const filtered = s.orch.filter((v) => !/^\s*brand concierge\s*:/i.test(safeString(v)));
      const dropped = s.orch.length !== filtered.length;
      if (dropped) {
        const liveOrch = new Set(filtered);
        s.orchActive = (Array.isArray(s.orchActive) ? s.orchActive : []).filter((v) => liveOrch.has(v));
        s.orch = filtered;
      }
    }
  }

  // Scan 4 — Activation timing. Look for paid-destination pushes
  // ("segments to Meta", "audience to Google", "Custom Audience push")
  // landing on a slide whose label contains "abandon"; if the next
  // slide exists, push them forward by one. We model this minimally:
  // we move the activActive entry only — leaving activ in place is
  // safe because the abandonment slide may still have other channels
  // legitimately listed.
  const ABANDON_LABEL_RX = /\babandon(ment)?\b/i;
  const PAID_PUSH_RX = /\b(meta|google|facebook|tiktok|dsp|paid media|custom audience)\b/i;
  for (let i = 0; i < slides.length - 1; i++) {
    const s = slides[i];
    if (!s || !ABANDON_LABEL_RX.test(safeString(s.label))) continue;
    const aActive = Array.isArray(s.activActive) ? s.activActive : [];
    const next = slides[i + 1];
    if (!next) continue;
    const moved = [];
    const stay = [];
    for (const v of aActive) {
      if (PAID_PUSH_RX.test(safeString(v))) moved.push(v);
      else stay.push(v);
    }
    if (moved.length) {
      s.activActive = stay;
      next.activActive = Array.from(new Set([...(next.activActive || []), ...moved]));
      // ensure those entries also exist on next.activ
      next.activ = Array.from(new Set([...(next.activ || []), ...moved]));
    }
  }

  // Scan 5b — SMS sent without a Phone ID. Walk forward; if a slide's
  // orch (or desc) mentions SMS but no Phone ID exists in any earlier
  // ids[], inject a Phone ID into THAT slide's ids[] (active true).
  // Conservative: we don't try to back-date the capture step — the
  // user can refine the journey if the timing matters.
  let phoneIdSeen = false;
  for (let i = 0; i < slides.length; i++) {
    const s = slides[i];
    if (!s) continue;
    if (Array.isArray(s.ids)) {
      for (const row of s.ids) {
        if (!Array.isArray(row)) continue;
        if (/\bphone\b/i.test(safeString(row[0]))) { phoneIdSeen = true; break; }
      }
    }
    const orchHasSms = Array.isArray(s.orch) && s.orch.some((v) => SMS_RX.test(safeString(v)));
    const descHasSms = SMS_RX.test(safeString(s.desc));
    if ((orchHasSms || descHasSms) && !phoneIdSeen) {
      s.ids = (Array.isArray(s.ids) ? s.ids : []).concat([['Phone ID', true]]);
      phoneIdSeen = true;
    }
  }

  // Scan 8a — generic "Email delivery platform" tech entries. Drop
  // them at the bullet level on j.tech (the source the live deck and
  // the one-pager both read), and mirror by stripping out per-slide
  // tech entries with the same generic text.
  if (Array.isArray(j.tech)) {
    for (const grp of j.tech) {
      if (!grp || !Array.isArray(grp.bullets)) continue;
      grp.bullets = grp.bullets.filter((b) => !(b && GENERIC_EMAIL_TECH_RX.test(safeString(b.text))));
    }
  }
  for (const s of slides) {
    if (Array.isArray(s.tech)) {
      s.tech = s.tech.filter((o) => !(o && GENERIC_EMAIL_TECH_RX.test(safeString(o.t))));
    }
  }

  // Scan 8b — strip [confirmed]/[assumed] markers from any per-slide
  // tech entry that leaked through. The PPTX/one-pager keep the labels
  // (separately applied via b.confirmed); the live deck shows them via
  // the .tech-badge already, so the inline marker is noise.
  for (const s of slides) {
    if (!Array.isArray(s.tech)) continue;
    s.tech = s.tech.map((o) => {
      if (!o || typeof o.t !== 'string') return o;
      const cleaned = o.t.replace(/\s*\[(?:confirmed|assumed)\]\s*$/i, '').trim();
      return cleaned !== o.t ? { ...o, t: cleaned } : o;
    });
  }

  // Scan 8c — drop tech entries that are never a:true across any
  // slide. A permanently dimmed entry means the platform plays no
  // active role in the journey — it's noise.
  const everActiveTech = new Set();
  for (const s of slides) {
    if (!Array.isArray(s.tech)) continue;
    for (const o of s.tech) {
      if (o && o.a) everActiveTech.add(safeString(o.t).trim());
    }
  }
  if (everActiveTech.size > 0) {
    for (const s of slides) {
      if (!Array.isArray(s.tech)) continue;
      s.tech = s.tech.filter((o) => o && everActiveTech.has(safeString(o.t).trim()));
    }
  }
}

function normaliseJourney(journeyData, overrides = {}) {
  const j = (journeyData && typeof journeyData === 'object') ? journeyData : {};
  const clientIn = (j.client && typeof j.client === 'object') ? j.client : {};
  const brandColour = normaliseHex(overrides.brandColour || clientIn.brandColour, '#E60000');
  // tier travels through the journeyData itself so the renderer (and
  // any downstream tooling that re-renders from cached JSON) knows
  // which layout / which Adobe products are in scope. Default 'advanced'
  // for cached results that pre-date Phase 1.
  const tier = (overrides.tier === 'foundation' || clientIn.tier === 'foundation')
    ? 'foundation'
    : 'advanced';
  const client = {
    name: safeString(overrides.clientName || clientIn.name, 'Client'),
    slug: slugify(overrides.clientName || clientIn.name || clientIn.slug || 'client'),
    domain: safeString(clientIn.domain || overrides.domain),
    brandColour,
    darkColour: normaliseHex(clientIn.darkColour || darken(brandColour, 0.55), darken(brandColour, 0.55)),
    journeyType: safeString(overrides.journeyType || clientIn.journeyType, 'Customer Journey'),
    tier,
  };

  const persona = (j.persona && typeof j.persona === 'object') ? j.persona : {};
  const personaOut = {
    name: safeString(overrides.personaName || persona.name, 'Sarah'),
    role: safeString(persona.role, ''),
    intro: safeString(persona.intro, ''),
  };

  const stepLabels = ensureLength(j.stepLabels, 12, (i) => `${String(i + 1).padStart(2, '0')}  Step ${i + 1}`);
  // Resolve per-step icon keys: prefer Gemini's choice when it's a key we
  // know about, otherwise fall back to a label-keyword heuristic so every
  // node always has *some* sensible pictogram.
  const stepIcons = resolveStepIcons(j.stepIcons, stepLabels.map(l => l.replace(/^\d+\s+/, '')));
  const descriptions = ensureLength(j.descriptions, 13, (i) => (i === 2 ? '' : `Step description ${i + 1}.`));
  // Strict rule: index 2 MUST be empty string (hMerge spacer).
  descriptions[2] = '';

  const data = ensureLength(j.data, 12, () => ({ status: 'Customer', bullets: [], identity: null }));
  const adobe = ensureLength(j.adobe, 12, () => ([{ type: 'product', text: 'Real-Time CDP' }]));
  const tech = ensureLength(j.tech, 12, () => ({ heading: 'Technology', bullets: [] }));
  const slides = ensureLength(j.slides, 13, (i) => ({
    label: i === 0 ? 'Overview' : (stepLabels[i - 1] || `Step ${i}`).replace(/^\d+\s+/, ''),
    activeNode: i === 0 ? -1 : (i - 1),
    desc: i === 0 ? `${client.name} customer journey overview.` : `${personaOut.name} continues the journey.`,
    data: [], dataActive: [],
    ingestion: [], ingestionActive: [],
    segs: [], segActive: [],
    ids: [],
    orch: [], orchActive: [],
    decisioning: [], decisioningActive: [],
    activ: [], activActive: [],
    tech: [],
  }));
  // Backfill decisioning/decisioningActive on slides parsed from older
  // cached results (pre-Phase 2). Empty arrays render the sub-column as
  // blank — they don't break the layout.
  for (let i = 0; i < slides.length; i++) {
    if (!Array.isArray(slides[i].decisioning)) slides[i].decisioning = [];
    if (!Array.isArray(slides[i].decisioningActive)) slides[i].decisioningActive = [];
  }

  // ─── Phase 3: post-Vertex content scans (skill v9 §Pre-write pattern scan)
  //
  // Eight quiet auto-fixes that run AFTER the model has emitted the
  // journey. Each one targets a class of silent-bug the colleague's
  // skill specifically calls out — duplicated orch carry-forward,
  // segActive emoji-prefix mismatch, DM-on-paid-media leakage, etc.
  // Auto-fix rather than reject because the model can't usefully
  // self-correct from a thrown error and the user shouldn't see a
  // regenerate loop. Applies to every tier; the Foundation clamp below
  // sees the cleaned shape so any DM/BC the scans missed still get
  // stripped.
  runContentScans(slides, j);

  // Foundation tier clamp — strip Decision Management and Brand
  // Concierge from the journey entirely so the prompt overlay is
  // belt-and-braces. Empty decisioning arrays => the renderer drops the
  // Decisioning sub-column for Foundation; orch entries beginning
  // "Brand Concierge:" are removed (and the matching orchActive entries
  // along with them) so an Advanced-leaning model that ignored the tier
  // overlay can't smuggle DM/BC into a Foundation deck.
  if (tier === 'foundation') {
    for (let i = 0; i < slides.length; i++) {
      slides[i].decisioning = [];
      slides[i].decisioningActive = [];
      const orch = Array.isArray(slides[i].orch) ? slides[i].orch : [];
      const orchActiveSet = new Set(Array.isArray(slides[i].orchActive) ? slides[i].orchActive : []);
      const filtered = orch.filter((s) => !/^(\s*)brand concierge\s*:/i.test(safeString(s)));
      slides[i].orch = filtered;
      slides[i].orchActive = filtered.filter((s) => orchActiveSet.has(s));
    }
    // Strip DM/BC product blocks from the adobe[] cells too. We do this
    // tolerantly: if a "product" block names DM or BC we drop it AND the
    // immediately-following heading/bullet/blank run that belongs to it
    // (i.e. up to the next "product" entry or end of array).
    const FORBIDDEN_PRODUCTS = /^(decision management|brand concierge)$/i;
    if (Array.isArray(j.adobe)) {
      for (let i = 0; i < j.adobe.length; i++) {
        const blocks = Array.isArray(j.adobe[i]) ? j.adobe[i] : [];
        const out = [];
        let dropping = false;
        for (const b of blocks) {
          if (b && b.type === 'product') {
            dropping = !!(b.text && FORBIDDEN_PRODUCTS.test(safeString(b.text).trim()));
            if (!dropping) out.push(b);
          } else if (!dropping) {
            out.push(b);
          }
        }
        j.adobe[i] = out;
      }
    }
  }
  // Ensure activeNode invariant.
  slides[0].activeNode = -1;
  for (let i = 1; i < 13; i++) {
    slides[i].activeNode = i - 1;
  }

  // Channel sanitisation: clamp every activ[] / activActive[] entry to
  // the closed AJO channel list. This protects against three things:
  //   (1) model drift — Gemini occasionally hallucinates a new channel
  //       even with the schema enum, especially on refinement;
  //   (2) older cache entries generated before this constraint existed;
  //   (3) the schema-less fallback path (callGemini retry without
  //       responseSchema) which doesn't enforce the enum at all.
  // After filtering we always end up with at least one channel per
  // step (slides 1-12) so the Activation column never renders blank;
  // Email is the safest fallback.
  for (let i = 0; i < slides.length; i++) {
    const s = slides[i];
    const cleanActiv = (Array.isArray(s.activ) ? s.activ : [])
      .map((v) => safeString(v).trim())
      .filter((v) => AJO_CHANNEL_SET.has(v));
    // De-dupe while preserving order.
    const seen = Object.create(null);
    s.activ = cleanActiv.filter((v) => (seen[v] ? false : (seen[v] = true)));
    if (i > 0 && !s.activ.length) s.activ = ['Email'];
    const activSet = new Set(s.activ);
    s.activActive = (Array.isArray(s.activActive) ? s.activActive : [])
      .map((v) => safeString(v).trim())
      .filter((v) => activSet.has(v));
  }

  return { client, persona: personaOut, stepLabels, stepIcons, descriptions, data, adobe, tech, slides };
}

// ─── PUBLIC: GENERATE JOURNEY (LLM ORCHESTRATION) ────────────────────────────

async function generateJourney({
  sandbox,
  scrapeId,
  brandColour,
  journeyType,
  personaName,
  clientName,
  // Freeform user prompt appended to the first-time generation. Steers
  // the very first Vertex AI call (e.g. "focus on first-time customers,
  // emphasise loyalty rewards, mention sustainability throughout").
  additionalContext,
  // 'foundation' | 'advanced'. Foundation excludes Decision Management
  // and Brand Concierge from the journey entirely — col 4 in the
  // rendered HTML becomes a single full-height Orchestration column.
  tier = 'advanced',
  // Refinement mode: when both fields are present, we re-issue the
  // generation with the previous JSON in the user payload and ask the
  // model to apply `refinementPrompt` while preserving the rest of the
  // journey + every schema invariant. This is what powers the "Refine
  // with Vertex AI" panel that appears after the first generation.
  previousJourney,
  refinementPrompt,
}) {
  const resolvedTier = tier === 'foundation' ? 'foundation' : 'advanced';
  if (!sandbox) throw new Error('sandbox is required');
  if (!scrapeId) throw new Error('scrapeId is required');

  const scrape = await brandScrapeStore.getScrape(sandbox, scrapeId);
  if (!scrape) throw new Error(`Brand scrape not found for sandbox=${sandbox} id=${scrapeId}`);
  if (scrape.payloadExpired) {
    throw new Error('Brand scrape payload has expired (>3 days). Re-run the scrape in Brand scraper.');
  }

  const summary = summariseScrapeForPrompt(scrape);
  const inferredColour = pickPrimaryColour(summary.colours, '#E60000');
  const finalBrandColour = normaliseHex(brandColour || inferredColour, '#E60000');
  const resolvedClientName = clientName || scrape.brandName || summary.brandName || 'Client';

  // The Vertex AI system prompt + JSON schema stay the same in both
  // modes — only the user payload and instruction line change. This
  // keeps the schema invariants (12 stepLabels, 13 descriptions, etc.)
  // enforced uniformly and lets the model reuse its training on this
  // schema regardless of whether it's a first run or a refinement.
  const isRefinement = !!(refinementPrompt && previousJourney && typeof previousJourney === 'object');
  const trimmedContext = (typeof additionalContext === 'string' ? additionalContext : '').trim();
  const trimmedRefine = (typeof refinementPrompt === 'string' ? refinementPrompt : '').trim();

  const clientInputs = {
    name: resolvedClientName,
    domain: summary.url,
    brandColour: finalBrandColour,
    journeyType: journeyType || 'Customer Journey',
    personaName: personaName || (summary.personas[0] && summary.personas[0].name) || '',
  };

  let userPayload;
  if (isRefinement) {
    userPayload = {
      instruction:
        'You previously generated the JSON in "previousJourney" for this brand. Apply the user\'s "refinementRequest" to update it and return ONE new JSON object matching the same schema described in the system prompt. ' +
        'Preserve sections that the request does not touch — only modify what the user asked you to change. ' +
        'All schema invariants still apply: exactly 12 stepLabels (NN  prefix), 12 stepIcons from the catalog, 13 descriptions (index 2 = ""), 12 data/adobe/tech items, 13 slides with the activeNode invariant, etc. Return JSON only.',
      inputs: {
        client: clientInputs,
        brandSummary: summary,
        refinementRequest: trimmedRefine,
        previousJourney,
      },
    };
  } else {
    const inputs = {
      client: clientInputs,
      brandSummary: summary,
    };
    if (trimmedContext) inputs.additionalContext = trimmedContext;
    userPayload = {
      instruction:
        'Design a 12-step AEP customer journey for the brand below. Return one JSON object matching the schema described in the system prompt.' +
        (trimmedContext ? ' Pay special attention to "additionalContext" in the inputs — it carries freeform guidance from the human user that should shape the narrative, persona behaviour, and step focus.' : ''),
      inputs,
    };
  }

  // gemini-2.5-pro supports up to 65536 output tokens. The full journey
  // schema (12 steps × 13 slides × ~10 array fields each) routinely emits
  // 30–50KB of JSON, and the model also spends a chunk of the budget on
  // hidden "thinking" tokens — so anything below 32k risks truncation.
  // Use the full ceiling and let the model decide.
  const JOURNEY_MAX_OUTPUT_TOKENS = 65535;

  // Common Gemini options for every journey call. retryOn429 lets the
  // shared client absorb a single Vertex AI rate-limit hit (project RPM
  // burned by another concurrent caller) by sleeping ~30s and retrying
  // once before surfacing a friendly RATE_LIMITED error to the user.
  const baseGeminiOpts = {
    maxOutputTokens: JOURNEY_MAX_OUTPUT_TOKENS,
    temperature: 0.3,
    jsonMode: true,
    retryOn429: true,
    retryOn429DelayMs: 30000,
    retryOn429Attempts: 1,
  };

  // System prompt is rebuilt per-call so the tier overlay (Foundation
  // vs Advanced) is bound to the same call. Cheap to re-string-concat.
  const systemPrompt = buildSystemPrompt(resolvedTier);

  let raw;
  try {
    raw = await callGemini(systemPrompt, JSON.stringify(userPayload, null, 2), {
      ...baseGeminiOpts,
      responseSchema: JOURNEY_RESPONSE_SCHEMA,
    });
  } catch (e) {
    // Vertex AI rate limit even after auto-retry — bubble the friendly
    // message straight through (vertexClient already crafted it).
    if (e && e.code === 'RATE_LIMITED') {
      throw e;
    }
    // Schema unsupported by this model? Retry without it.
    if (/responseSchema|schema/i.test(String(e && e.message || e))) {
      raw = await callGemini(systemPrompt, JSON.stringify(userPayload, null, 2), {
        ...baseGeminiOpts,
      });
    } else if (e && e.code === 'MAX_TOKENS') {
      // The model still ran out of room even at the model maximum. This
      // usually means the prompt was huge (lots of pages in the brand
      // scrape) — retry once with thinking turned down so all available
      // tokens go to JSON output rather than internal reasoning.
      try {
        raw = await callGemini(systemPrompt, JSON.stringify(userPayload, null, 2), {
          ...baseGeminiOpts,
          temperature: 0.2,
          responseSchema: JOURNEY_RESPONSE_SCHEMA,
        });
      } catch (retryErr) {
        if (retryErr && retryErr.code === 'RATE_LIMITED') throw retryErr;
        throw new Error(
          'Vertex AI couldn\'t fit the full 12-step journey within the output ' +
          'token limit, even after a retry. This usually means the brand scrape ' +
          'is unusually large — try a tighter Journey type or a more specific ' +
          'persona to reduce the response size. ' +
          `(${String(retryErr && retryErr.message || retryErr)})`
        );
      }
    } else {
      throw e;
    }
  }

  let parsed;
  try {
    parsed = JSON.parse(stripJsonFences(raw));
  } catch (e) {
    throw new Error(`Gemini returned non-JSON for journey: ${String(e && e.message || e)}`);
  }

  const journeyData = normaliseJourney(parsed, {
    brandColour: finalBrandColour,
    journeyType,
    personaName,
    clientName: resolvedClientName,
    domain: summary.url,
    tier: resolvedTier,
  });

  const htmlJourney = renderJourneyHtml(journeyData);
  const htmlOnePager = renderOnePagerHtml(journeyData);

  return { journeyData, htmlJourney, htmlOnePager };
}

// ─── HTML JOURNEY MAP (porting references/html-rules.md) ─────────────────────

function renderJourneyHtml(journeyData) {
  const j = journeyData;
  const brand = j.client.brandColour;
  const dark = j.client.darkColour;
  const clientName = j.client.name;
  const personaName = j.persona.name;
  // Tier governs which Adobe products are in scope and whether column 4
  // is a single Orchestration column (Foundation) or stacked
  // Orchestration + Decisioning (Advanced). Default 'advanced' for older
  // cached journeys parsed before the tier field existed.
  const tier = (j.client && j.client.tier === 'foundation') ? 'foundation' : 'advanced';

  // Build SVG nodes — bigger circles with a centered Feather-style icon as
  // the primary visual, the step number sitting as a small pill badge in
  // the top-right corner of the circle, and the wrapped label below /
  // above depending on whether the node is on the top or bottom row.
  // The icon pictograms come from STEP_ICON_CATALOG (24x24) — we apply a
  // 0.92 scale so they read clearly inside the 22px-radius circle.
  const NODE_RADIUS = 22;
  const ICON_SIZE = 22;          // rendered diameter of the icon glyph
  const ICON_SCALE = ICON_SIZE / 24;
  const BADGE_DX = NODE_RADIUS - 4;
  const BADGE_DY = -(NODE_RADIUS - 4);
  const nodesSvg = NODES.map((n, idx) => {
    const stepLabel = (j.stepLabels[idx] || '').replace(/^\d+\s+/, '');
    const lines = wrapStepLabelTwoLines(stepLabel);
    const isTop = n.cy < 110;
    // Push labels slightly further out to make room for the bigger circle.
    const line1Y = isTop ? n.cy - 30 : n.cy + 30;
    const line2Y = isTop ? n.cy - 40 : n.cy + 40;
    const numberLabel = String(idx + 1).padStart(2, '0');
    const iconKey = (j.stepIcons && j.stepIcons[idx]) || heuristicIconForLabel(stepLabel);
    const iconBody = STEP_ICON_CATALOG[iconKey] || STEP_ICON_CATALOG.zap;
    // Translate icon so its 24x24 viewBox lands centered in the circle
    // after scaling by ICON_SCALE.
    const iconTx = n.cx - (24 * ICON_SCALE) / 2;
    const iconTy = n.cy - (24 * ICON_SCALE) / 2;
    return `
      <g id="node-${idx}" class="node">
        <circle class="node-circle" cx="${n.cx}" cy="${n.cy}" r="${NODE_RADIUS}"></circle>
        <g class="node-icon" transform="translate(${iconTx} ${iconTy}) scale(${ICON_SCALE})">${iconBody}</g>
        <g class="node-badge">
          <circle cx="${n.cx + BADGE_DX}" cy="${n.cy + BADGE_DY}" r="9"></circle>
          <text x="${n.cx + BADGE_DX}" y="${n.cy + BADGE_DY + 3}" text-anchor="middle">${escapeHtml(numberLabel)}</text>
        </g>
        <text class="node-label" x="${n.cx}" y="${isTop ? line2Y : line1Y}" text-anchor="middle">${escapeHtml(lines[0])}</text>
        ${lines[1] ? `<text class="node-label" x="${n.cx}" y="${isTop ? line1Y : line2Y}" text-anchor="middle">${escapeHtml(lines[1])}</text>` : ''}
      </g>`;
  }).join('');

  // Build a confirmed-flag lookup keyed by tech bullet text from the
  // top-level j.tech grouped technology blocks (each with a heading +
  // bullets[{text, confirmed}]). The slide-level tech entries only
  // carry {t, a} — we enrich them here with c (confirmed) so the live
  // interactive deck can show the same [confirmed]/[assumed] badge as
  // the one-pager and PPTX. Lookup is normalised lower-case for
  // tolerance against minor casing drift between layers.
  const techConfirmedByText = new Map();
  if (Array.isArray(j.tech)) {
    for (const grp of j.tech) {
      if (!grp || !Array.isArray(grp.bullets)) continue;
      for (const b of grp.bullets) {
        if (!b || !b.text) continue;
        const key = String(b.text).trim().toLowerCase();
        if (!techConfirmedByText.has(key)) {
          techConfirmedByText.set(key, !!b.confirmed);
        }
      }
    }
  }

  const slidesJson = JSON.stringify(j.slides.map((s, idx) => ({
    label: safeString(s.label || (idx === 0 ? 'Overview' : 'Step ' + idx)),
    activeNode: typeof s.activeNode === 'number' ? s.activeNode : (idx === 0 ? -1 : idx - 1),
    desc: safeString(s.desc),
    data: Array.isArray(s.data) ? s.data : [],
    dataActive: Array.isArray(s.dataActive) ? s.dataActive : [],
    ingestion: Array.isArray(s.ingestion) ? s.ingestion : [],
    ingestionActive: Array.isArray(s.ingestionActive) ? s.ingestionActive : [],
    segs: Array.isArray(s.segs) ? s.segs.map((sg, k) => ({
      i: safeString(sg && sg.i, DEFAULT_STEP_ICONS[k % 12]),
      l: safeString(sg && sg.l, ''),
    })) : [],
    segActive: Array.isArray(s.segActive) ? s.segActive : [],
    ids: Array.isArray(s.ids) ? s.ids.map((row) => Array.isArray(row) ? [safeString(row[0]), !!row[1]] : [safeString(row), false]) : [],
    orch: Array.isArray(s.orch) ? s.orch : [],
    orchActive: Array.isArray(s.orchActive) ? s.orchActive : [],
    // Decisioning is the bottom half of column 4 — Decision Management
    // bullets (one line per decision: outcome + signal that drove it).
    // Falls back to [] for older cached journeys with no decisioning data.
    decisioning: Array.isArray(s.decisioning) ? s.decisioning : [],
    decisioningActive: Array.isArray(s.decisioningActive) ? s.decisioningActive : [],
    activ: Array.isArray(s.activ) ? s.activ : [],
    activActive: Array.isArray(s.activActive) ? s.activActive : [],
    tech: Array.isArray(s.tech) ? s.tech.map((t) => {
      const text = safeString(t && t.t, '');
      const key = text.trim().toLowerCase();
      // c: true => [confirmed] vendor; false => [assumed] inference;
      // null => no flag known (older cached results — render no badge).
      const c = techConfirmedByText.has(key) ? techConfirmedByText.get(key) : null;
      return { t: text, a: !!(t && t.a), c };
    }) : [],
  })));

  const pathSegsJson = JSON.stringify(PATH_SEGS);

  const personaIntro = j.persona.intro || `${personaName}, a customer of ${clientName}.`;
  const journeyType = j.client.journeyType || 'Customer Journey';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(clientName)} — AEP Customer Journey</title>
<style>
  :root {
    --brand: ${brand};
    --brand-dark: ${dark};
    --ink: #1A1A1A;
    --ink-soft: #4a5060;
    --bg: #f5f5f7;
    --panel: #ffffff;
    --border: #e5e7eb;
    /* Skill v9: softer mint wash so the "this is happening NOW" cue
       reads as a tonal layer rather than a competing block of colour.
       Translucent rgba lets it sit on top of the panel without picking
       up a hard edge between siblings, and the 0.16 alpha is just
       enough to register on light AND dark slide chrome. */
    --active-bg: rgba(76, 175, 80, 0.16);
    --active-stroke: #4caf50;
    /* Shared timing for the journey-map node cross-fade — keeps the
       circle, icon, badge and label all dissolving as a single unit. */
    --node-fade: 0.7s ease-in-out;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; height: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Adobe Clean', sans-serif; color: var(--ink); background: var(--bg); }
  .slide { display: flex; height: 100vh; min-height: 600px; }
  .left-panel { flex: 0 0 80%; display: flex; flex-direction: column; padding: 22px 26px 18px; min-width: 0; }
  .right-panel { flex: 0 0 20%; background: var(--brand-dark); color: #fff; padding: 22px 22px 18px; display: flex; flex-direction: column; gap: 16px; min-width: 220px; }

  .header { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin-bottom: 12px; }
  .header .client-block { display: flex; align-items: center; gap: 14px; }
  .header img.client-logo { max-height: 44px; max-width: 220px; object-fit: contain; }
  .header .title { font-size: 18px; font-weight: 600; letter-spacing: 0.2px; }
  .header .journey-type { font-size: 12px; color: var(--ink-soft); margin-top: 2px; }

  .journey-map-container { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 16px 12px; margin-bottom: 14px; transition: padding 0.4s ease, flex-basis 0.4s ease; display: flex; flex-direction: column; }
  /* Overview mode: hide the data panel and let the journey map fill the
     left column so the whole 12-step picture is at maximum size before
     the user drills into individual steps. */
  .journey-map-container.expanded { flex: 1 1 auto; justify-content: center; padding: 28px 18px; }
  .journey-map-container.expanded svg.journey-svg { max-height: none; height: 100%; flex: 1 1 auto; }
  /* Skill v9: replace display:none with a max-height + opacity slide
     so the panel collapses smoothly when the user reaches the overview
     slide, rather than snapping out and snapping back in. The map
     container's flex-basis transition (already in place) drives the
     resulting layout reflow at the same 0.5s tempo. */
  .data-panel.hidden { max-height: 0; opacity: 0; padding-top: 0; padding-bottom: 0; margin-top: 0; margin-bottom: 0; border-width: 0; overflow: hidden; }
  svg.journey-svg { width: 100%; height: auto; max-height: 280px; display: block; }
  .journey-base { stroke: #c9ced8; stroke-width: 2.5; fill: none; }
  .journey-active { stroke: var(--brand); stroke-width: 4; fill: none; opacity: 0; transition: opacity var(--node-fade); }
  .journey-active.visible { opacity: 1; }
  /* Overview-only stroke-dasharray draw animation. Hidden on every
     slide except slide 0; on entry it snaps to length=offset (invisible)
     then transitions offset→0 over ~6s to "draw" the path end-to-end. */
  .journey-draw { stroke: var(--brand); stroke-width: 4; fill: none; opacity: 0; transition: opacity 0.4s ease; pointer-events: none; }
  .journey-draw.visible { opacity: 1; }
  @media (prefers-reduced-motion: reduce) {
    .journey-draw { transition: none !important; }
    .journey-active { transition: none !important; }
    .journey-map-container { transition: none !important; }
    .data-panel { transition: none !important; }
  }

  /* Active-state transitions everywhere (circle, icon, badge) share the
     same slow ease-in-out curve so the whole node cross-fades as a unit
     rather than each piece animating independently. No scale bounce, no
     infinite pulse — just a calm appear / dissolve as the active step
     advances. */
  .node { cursor: pointer; }
  .node-circle {
    fill: #fff;
    stroke: #c9ced8;
    stroke-width: 2;
    transition: fill var(--node-fade), stroke var(--node-fade), stroke-width var(--node-fade);
  }

  /* Icon glyph: stroked Feather-style outline. Inactive icons sit at
     a slightly muted opacity so the active icon clearly "appears" when
     the slide advances; on dissolve the previous active fades back to
     the muted baseline. */
  .node-icon {
    color: #6b7180;
    opacity: 0.78;
    pointer-events: none;
    transition: color var(--node-fade), opacity var(--node-fade);
    transform-box: fill-box;
    transform-origin: center;
  }
  .node-icon * {
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  /* Solid pictograms (e.g. cursor, star, play) — fill instead of stroke. */
  .node-icon polygon {
    fill: currentColor;
    stroke: currentColor;
  }

  /* Number badge: small white pill in the top-right corner, brand-coloured
     text. Inverts to a brand-filled pill with white text when active. */
  .node-badge circle {
    fill: #fff;
    stroke: var(--brand);
    stroke-width: 1.5;
    transition: fill var(--node-fade), stroke var(--node-fade);
  }
  .node-badge text {
    font-size: 8.5px;
    font-weight: 700;
    fill: var(--brand);
    pointer-events: none;
    transition: fill var(--node-fade);
  }

  .node-label { font-size: 10px; fill: #4a5060; font-weight: 600; transition: fill var(--node-fade), font-weight var(--node-fade); }

  /* Hover on inactive nodes — gentle, non-distracting cue. */
  .node:hover .node-circle { stroke: var(--brand); }
  .node:hover .node-icon { color: var(--brand); opacity: 1; }

  /* Active node — brand-filled circle, fully-opaque white icon, inverted
     badge. No pulse, no scale; the slow fade above is the entire effect. */
  .node-active .node-circle {
    fill: var(--brand);
    stroke: var(--brand);
    stroke-width: 2.5;
  }
  .node-active .node-icon { color: #fff; opacity: 1; }
  .node-active .node-badge circle { fill: var(--brand); stroke: #fff; }
  .node-active .node-badge text { fill: #fff; }
  .node-active .node-label { fill: var(--ink); font-weight: 700; }

  @media (prefers-reduced-motion: reduce) {
    .node-icon, .node-badge circle, .node-badge text, .node-circle, .node-label, .journey-active { transition: none; }
  }

  .data-panel { background: var(--panel); border: 2px solid var(--brand); border-radius: 12px; padding: 14px 16px 18px; flex: 1 1 auto; display: flex; flex-direction: column; min-height: 0; max-height: 9999px; opacity: 1; transition: max-height 0.5s ease, opacity 0.4s ease, padding 0.5s ease, margin 0.5s ease, border-width 0.5s ease; }
  /* Skill v9: bigger, calmer title — sits above the data grid as a
     clear "what AEP does here" anchor rather than a tiny label. The
     inline accent dot reuses --brand so the panel signature reads as
     one piece even when the brand colour changes via recolour. */
  .data-panel-title { font-size: 13px; font-weight: 700; color: var(--brand); letter-spacing: 0.5px; margin-bottom: 12px; text-transform: uppercase; display: inline-flex; align-items: center; gap: 8px; }
  .data-panel-title::before { content: ''; display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--brand); }
  .data-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; flex: 1 1 auto; min-height: 0; }
  .data-col { display: flex; flex-direction: column; gap: 6px; min-height: 0; overflow: hidden; }
  /* Stacked sub-column layout: column 2 (Ingestion + Segments) and
     column 4 (Orchestration + Decisioning) split vertically 50/50 with
     a thin divider, so each strand carries its own header without
     making the whole panel taller. */
  /* Stacked column (Ingestion+Segments, Orchestration+Decisioning).
     CSS grid with minmax rows means each half always anchors to a
     stable baseline that lines up with the unstacked sibling cols
     (Data Collected, Identities, Activation), even when one half has
     two bullets and the other has eight. minmax(80px, 1fr) gives each
     half a guaranteed visible footprint while still letting them
     redistribute under content pressure. */
  .data-col.stacked {
    display: grid;
    grid-template-rows: minmax(80px, 1fr) minmax(80px, 1fr);
    padding: 0;
    gap: 0;
  }
  .data-col-half { min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; padding-bottom: 4px; }
  .data-col-half:first-child { border-bottom: 1px solid var(--border); padding-bottom: 6px; margin-bottom: 6px; }
  .data-col-half:last-child { padding-bottom: 6px; }
  .data-col-title { font-size: 10px; font-weight: 700; text-transform: uppercase; color: var(--ink-soft); letter-spacing: 0.3px; padding-bottom: 4px; border-bottom: 1px solid var(--border); }
  .data-col-subtitle { font-size: 9.5px; font-weight: 700; text-transform: uppercase; color: var(--ink-soft); letter-spacing: 0.3px; opacity: 0.85; padding-bottom: 2px; }
  .data-item { font-size: 10.5px; line-height: 1.35; padding: 4px 6px; border-radius: 4px; color: var(--ink); background: #f9fafb; border: 1px solid transparent; transition: opacity 0.25s ease, background 0.25s ease, color 0.25s ease, border-color 0.25s ease; }
  .data-item.active { background: var(--active-bg); border-color: var(--active-stroke); color: #1b5e20; font-weight: 600; }
  /* Cumulative trail — items captured on prior slides remain visible as
     dimmed past entries so the user can SEE the AEP picture growing as
     they navigate forward. Applies to every column. */
  .data-item.past { opacity: 0.42; background: transparent; border-color: transparent; }
  /* Tech badge — surfaces whether a vendor was found in the input
     detectedTech list (confirmed) or inferred from the industry
     (assumed). Same pill style as the one-pager so the live deck and
     the leave-behind PPTX tell the same story. */
  .tech-badge { display: inline-block; font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 3px; margin-left: 6px; vertical-align: middle; letter-spacing: 0.2px; }
  .tech-badge.confirmed { background: #e8f5e9; color: #1b5e20; }
  .tech-badge.assumed { background: #fff3e0; color: #b26a00; }
  /* Brand Concierge badge — Advanced-tier orch column. Bullets the model
     prefixes "Brand Concierge:" pick up a small violet "BC" pill before
     the text and a thin left-accent so audiences can see at a glance
     that this is conversational AI fired from an owned channel, not a
     marketer-orchestrated AJO push. The accent is intentionally subtle
     — BC sits inside the same Journey Orchestration column on purpose
     (per the skill v9 spec); the badge is the cue, not a new column. */
  .bc-badge { display: inline-block; font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 3px; margin-right: 6px; vertical-align: middle; letter-spacing: 0.4px; background: rgba(125, 73, 220, 0.14); color: #5a2eb8; text-transform: uppercase; }
  .data-item.is-bc { border-left: 2px solid rgba(125, 73, 220, 0.55); padding-left: 5px; }
  .data-item.is-bc.past { border-left-color: rgba(125, 73, 220, 0.32); }
  .data-item.is-bc.active { border-left-color: rgba(125, 73, 220, 0.85); }
  .seg { display: flex; align-items: center; gap: 6px; padding: 4px 6px; border-radius: 4px; font-size: 10px; line-height: 1.25; background: #f9fafb; border: 1px solid transparent; transition: opacity 0.25s ease, background 0.25s ease, color 0.25s ease, border-color 0.25s ease; }
  .seg.active { background: var(--active-bg); border-color: var(--active-stroke); color: #1b5e20; font-weight: 600; }
  .seg.past { opacity: 0.42; background: transparent; border-color: transparent; }
  .seg-icon { font-size: 13px; }
  .seg span { display: inline; }

  .right-panel .adobe-wordmark { font-size: 11px; letter-spacing: 1.5px; opacity: 0.75; text-transform: uppercase; font-weight: 700; }
  .right-panel .slide-label { font-size: 18px; font-weight: 600; line-height: 1.2; }
  .right-panel .nav-dots { display: flex; flex-wrap: wrap; gap: 5px; }
  .right-panel .nav-dot { width: 7px; height: 7px; border-radius: 50%; background: rgba(255,255,255,0.3); cursor: pointer; transition: background 0.2s ease; }
  .right-panel .nav-dot.active { background: var(--brand); }
  .right-panel .slide-desc { font-size: 13px; line-height: 1.45; opacity: 0.95; flex: 1 1 auto; }
  .right-panel .persona { display: flex; align-items: center; gap: 12px; margin-top: 8px; padding: 10px 8px; background: rgba(255,255,255,0.05); border-radius: 10px; }
  .right-panel .persona-meta { font-size: 11px; line-height: 1.35; opacity: 0.85; }
  .right-panel .persona-meta strong { font-size: 13px; opacity: 1; display: block; margin-bottom: 2px; }
  .right-panel .nav-arrows { display: flex; gap: 8px; margin-top: auto; }
  .right-panel .nav-arrows button { flex: 1; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: #fff; padding: 8px 0; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; }
  .right-panel .nav-arrows button:hover { background: rgba(255,255,255,0.2); }
  .right-panel .nav-arrows button:disabled { opacity: 0.35; cursor: default; }

  @media (max-width: 900px) {
    .slide { flex-direction: column; height: auto; }
    .left-panel, .right-panel { flex-basis: auto; }
  }
</style>
</head>
<body>
<div class="slide">
  <div class="left-panel">
    <div class="header">
      <div class="client-block">
        <img class="client-logo" alt="${escapeAttr(clientName)} logo" src="https://logo.clearbit.com/${escapeAttr(safeString(j.client.domain).replace(/^https?:\/\//, '').replace(/\/.*$/, ''))}" onerror="this.style.display='none'"/>
        <div>
          <div class="title">${escapeHtml(clientName)} <span style="opacity:0.6;font-weight:500"> · Adobe Experience Platform</span></div>
          <div class="journey-type">${escapeHtml(journeyType)}</div>
        </div>
      </div>
    </div>
    <div class="journey-map-container">
      <svg class="journey-svg" viewBox="0 0 1040 230" id="journey-svg" preserveAspectRatio="xMidYMid meet">
        <path class="journey-base" d="${BASE_PATH}"></path>
        <path class="journey-draw" id="journey-draw" d="${BASE_PATH}"></path>
        <path class="journey-active" id="active-seg"></path>
        ${nodesSvg}
      </svg>
    </div>
    <div class="data-panel">
      <div class="data-panel-title">Adobe Experience Platform</div>
      <div class="data-grid">
        <div class="data-col">
          <div class="data-col-title">Data Collected</div>
          <div id="col-data"></div>
        </div>
        <div class="data-col stacked">
          <div class="data-col-half">
            <div class="data-col-title">Data Ingestion</div>
            <div id="col-ingestion"></div>
          </div>
          <div class="data-col-half">
            <div class="data-col-subtitle">Segments</div>
            <div id="col-segments"></div>
          </div>
        </div>
        <div class="data-col">
          <div class="data-col-title">Identities</div>
          <div id="col-identities"></div>
        </div>
        ${tier === 'foundation' ? `
        <!-- Foundation tier: column 4 collapses to a single full-height
             Journey Orchestration column. Decisioning lives only in
             Advanced. The col-decisioning div is still rendered (hidden)
             so the per-tier renderer JS can write into it without
             nullref-checking, but it has no visible chrome. -->
        <div class="data-col">
          <div class="data-col-title">Journey Orchestration</div>
          <div id="col-orch"></div>
          <div id="col-decisioning" hidden></div>
        </div>` : `
        <div class="data-col stacked">
          <div class="data-col-half">
            <div class="data-col-title">Journey Orchestration</div>
            <div id="col-orch"></div>
          </div>
          <div class="data-col-half">
            <div class="data-col-subtitle">Decisioning</div>
            <div id="col-decisioning"></div>
          </div>
        </div>`}
        <div class="data-col">
          <div class="data-col-title">Activation / Destinations</div>
          <div id="col-activ"></div>
        </div>
        <div class="data-col">
          <div class="data-col-title">Existing ${escapeHtml(clientName)} Technology</div>
          <div id="col-tech"></div>
        </div>
      </div>
    </div>
  </div>
  <div class="right-panel">
    <div class="adobe-wordmark">Adobe</div>
    <div class="slide-label" id="slide-label">Overview</div>
    <div class="nav-dots" id="nav-dots"></div>
    <div class="slide-desc" id="slide-desc"></div>
    <div class="persona">
      ${personaAvatarSvg(brand, dark)}
      <div class="persona-meta">
        <strong>${escapeHtml(personaName)}</strong>
        ${escapeHtml(personaIntro)}
      </div>
    </div>
    <div class="nav-arrows">
      <button id="prev-btn">&larr; Prev</button>
      <button id="next-btn">Next &rarr;</button>
    </div>
  </div>
</div>
<script>
(function(){
  const slides = ${slidesJson};
  const pathSegs = ${pathSegsJson};
  let current = 0;

  // Skill v9: the active-seg path is the single source of truth for
  // the brand-coloured trail. On the overview slide we point active-seg
  // at the full BASE_PATH and animate stroke-dashoffset from len → 0
  // over 7s with a deep cubic-bezier ease. On every other slide
  // render() points the same path at the relevant sub-segment, so
  // there's only ever one drawn brand-coloured stroke on screen — the
  // one that's "active right now". The journey-draw path stays in the
  // SVG as a static base for layering, but it never animates.
  const OVERVIEW_PATH = ${JSON.stringify(BASE_PATH)};
  function animateOverview() {
    const seg = document.getElementById('active-seg');
    if (!seg) return;
    seg.setAttribute('d', OVERVIEW_PATH);
    let len = 0;
    try { len = seg.getTotalLength(); } catch (_) { len = 1200; }
    seg.style.strokeDasharray = String(len);
    seg.style.transition = 'none';
    seg.style.strokeDashoffset = String(len);
    seg.classList.add('visible');
    void seg.getBoundingClientRect();
    const reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    seg.style.transition = reduced ? 'none' : 'stroke-dashoffset 7s cubic-bezier(0.25, 0.1, 0.25, 1)';
    seg.style.strokeDashoffset = '0';
  }
  function hideOverviewDraw() {
    // Clear the dasharray + transition so render() can take over the
    // active-seg path for the per-step sub-segment without inheriting
    // the 7s overview ease.
    const seg = document.getElementById('active-seg');
    if (!seg) return;
    seg.style.transition = '';
    seg.style.strokeDasharray = '';
    seg.style.strokeDashoffset = '';
  }

  function render() {
    const s = slides[current];
    document.getElementById('slide-label').textContent = s.label || '';
    document.getElementById('slide-desc').textContent = s.desc || '';

    // Overview-mode layout: collapse the data panel and let the map
    // expand to fill the left column. The cumulative columns are still
    // rendered into hidden DOM (so the trail accumulates state correctly
    // when the user steps forward to slide 1) — they just don't show.
    const isOverview = (s.activeNode === -1) || (current === 0);
    const mapContainer = document.querySelector('.journey-map-container');
    const dataPanel = document.querySelector('.data-panel');
    if (mapContainer) mapContainer.classList.toggle('expanded', isOverview);
    if (dataPanel) dataPanel.classList.toggle('hidden', isOverview);
    if (isOverview) animateOverview(); else hideOverviewDraw();

    const dots = document.getElementById('nav-dots');
    dots.innerHTML = '';
    for (let i = 0; i < slides.length; i++) {
      const d = document.createElement('div');
      d.className = 'nav-dot' + (i === current ? ' active' : '');
      d.addEventListener('click', () => { current = i; render(); });
      dots.appendChild(d);
    }

    for (let n = 0; n < 12; n++) {
      const el = document.getElementById('node-' + n);
      if (el) el.classList.toggle('node-active', s.activeNode === n);
    }
    const seg = document.getElementById('active-seg');
    if (s.activeNode >= 0 && pathSegs[s.activeNode + 1]) {
      seg.setAttribute('d', pathSegs[s.activeNode + 1]);
      seg.classList.add('visible');
    } else {
      seg.removeAttribute('d');
      seg.classList.remove('visible');
    }

    // Cumulative trail across slides[0..current]: accumulate the union of
    // entries seen on every slide visited so far, mark the ones flagged
    // active on the current slide, dim everything else as past.
    // This shows the AEP picture *building* across the journey rather
    // than blinking different per-slide snapshots in and out.
    function accumulate(currentIdx, getList, getActiveList, keyOf) {
      const map = new Map();
      for (let i = 0; i <= currentIdx; i++) {
        const list = (getList(slides[i]) || []);
        const activeKeys = getActiveList ? (getActiveList(slides[i]) || []) : null;
        list.forEach(item => {
          const k = keyOf(item);
          if (!map.has(k)) map.set(k, { item: item, isActive: false });
          if (i === currentIdx) {
            map.get(k).item = item;
            if (activeKeys && activeKeys.indexOf(k) !== -1) map.get(k).isActive = true;
          }
        });
      }
      return Array.from(map.values()).map(v => ({
        item: v.item,
        isActive: v.isActive,
        isPast: !v.isActive,
      }));
    }
    function liStr(t, isActive, isPast) {
      const cls = isActive ? ' active' : (isPast ? ' past' : '');
      return '<div class="data-item' + cls + '">' + esc(t) + '</div>';
    }

    // String-list columns (Data, Ingestion, Orchestration, Decisioning, Activation).
    document.getElementById('col-data').innerHTML = accumulate(
      current, s => s.data || [], s => s.dataActive || [], x => String(x)
    ).map(o => liStr(o.item, o.isActive, o.isPast)).join('');

    document.getElementById('col-ingestion').innerHTML = accumulate(
      current, s => s.ingestion || [], s => s.ingestionActive || [], x => String(x)
    ).map(o => liStr(o.item, o.isActive, o.isPast)).join('');

    document.getElementById('col-orch').innerHTML = accumulate(
      current, s => s.orch || [], s => s.orchActive || [], x => String(x)
    ).map(o => {
      // Brand Concierge bullets sit in this same column per the skill
      // v9 spec; we surface a "BC" pill + violet accent so the audience
      // can see where conversational AI fires vs where AJO pushes.
      // Match is case-insensitive and strips the prefix from the
      // visible text (the badge replaces it).
      var raw = String(o.item);
      var bcMatch = raw.match(/^\s*brand\s+concierge\s*:\s*(.*)$/i);
      if (bcMatch) {
        var rest = bcMatch[1];
        var cls = (o.isActive ? ' active' : (o.isPast ? ' past' : '')) + ' is-bc';
        return '<div class="data-item' + cls + '"><span class="bc-badge">BC</span>' + esc(rest) + '</div>';
      }
      return liStr(o.item, o.isActive, o.isPast);
    }).join('');

    // Decisioning is the bottom half of column 4. When a journey carries
    // no decisioning bullets at all, the inner div stays empty and the
    // sub-column renders as an empty strip — same visual weight as a
    // step where nothing is happening on that strand.
    document.getElementById('col-decisioning').innerHTML = accumulate(
      current, s => s.decisioning || [], s => s.decisioningActive || [], x => String(x)
    ).map(o => liStr(o.item, o.isActive, o.isPast)).join('');

    document.getElementById('col-activ').innerHTML = accumulate(
      current, s => s.activ || [], s => s.activActive || [], x => String(x)
    ).map(o => liStr(o.item, o.isActive, o.isPast)).join('');

    // Segments — accumulate by label, active when label appears in segActive.
    document.getElementById('col-segments').innerHTML = accumulate(
      current, s => s.segs || [], s => s.segActive || [], sg => String(sg && sg.l)
    ).map(o => {
      const cls = o.isActive ? ' active' : (o.isPast ? ' past' : '');
      const sg = o.item;
      return '<div class="seg' + cls + '">' +
        '<span class="seg-icon">' + esc(sg.i || '\u2728') + '</span>' +
        String(sg.l || '').split('\\n').map(l => '<span>' + esc(l) + '</span>').join('') +
      '</div>';
    }).join('');

    // Identities — tuple [label, isActive]. Accumulate by label; active
    // when the tuple at the current slide is true.
    {
      const map = new Map();
      for (let i = 0; i <= current; i++) {
        const list = (slides[i] && slides[i].ids) || [];
        list.forEach(row => {
          const k = String(row && row[0]);
          if (!map.has(k)) map.set(k, { label: k, isActive: false });
          if (i === current && row && row[1]) map.get(k).isActive = true;
        });
      }
      document.getElementById('col-identities').innerHTML = Array.from(map.values()).map(v => {
        const cls = v.isActive ? ' active' : ' past';
        return '<div class="data-item' + cls + '"><span style="font-weight:600">' + esc(v.label) + '</span></div>';
      }).join('');
    }

    // Tech — {t, a, c}. Accumulate by text; active when a===true at
    // current. Render a [confirmed]/[assumed] pill badge if the c flag
    // is known (null on older cached journeys — we just omit the badge
    // rather than fabricating a confidence we don't have).
    {
      const map = new Map();
      for (let i = 0; i <= current; i++) {
        const list = (slides[i] && slides[i].tech) || [];
        list.forEach(o => {
          const k = String(o && o.t);
          if (!map.has(k)) map.set(k, { text: k, isActive: false, confirmed: (o && typeof o.c === 'boolean') ? o.c : null });
          if (i === current && o && o.a) map.get(k).isActive = true;
          if (o && typeof o.c === 'boolean') map.get(k).confirmed = o.c;
        });
      }
      document.getElementById('col-tech').innerHTML = Array.from(map.values()).map(v => {
        const cls = v.isActive ? ' active' : ' past';
        let badge = '';
        if (v.confirmed === true) badge = '<span class="tech-badge confirmed">confirmed</span>';
        else if (v.confirmed === false) badge = '<span class="tech-badge assumed">assumed</span>';
        return '<div class="data-item' + cls + '">' + esc(v.text) + badge + '</div>';
      }).join('');
    }

    document.getElementById('prev-btn').disabled = current === 0;
    document.getElementById('next-btn').disabled = current === slides.length - 1;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  document.getElementById('prev-btn').addEventListener('click', () => { if (current > 0) { current--; render(); } });
  document.getElementById('next-btn').addEventListener('click', () => { if (current < slides.length - 1) { current++; render(); } });
  document.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' && current < slides.length - 1) { current++; render(); }
    if (e.key === 'ArrowLeft' && current > 0) { current--; render(); }
  });

  render();
})();
</script>
</body>
</html>`;
}

function wrapStepLabelTwoLines(label) {
  const words = safeString(label).trim().split(/\s+/);
  if (words.length <= 1) return [words[0] || '', ''];
  if (words.length === 2) return words;
  // split roughly in half by character count for visual balance
  const total = words.join(' ').length;
  let acc = 0;
  for (let i = 1; i < words.length; i++) {
    acc += words[i - 1].length + 1;
    if (acc >= total / 2) {
      return [words.slice(0, i).join(' '), words.slice(i).join(' ')];
    }
  }
  return [words[0], words.slice(1).join(' ')];
}

function personaAvatarSvg(brand, dark) {
  return `<svg width="60" height="64" viewBox="0 0 108 115" aria-hidden="true">
    <rect x="4" y="4" width="100" height="111" rx="8" fill="${escapeAttr(darken(dark, 0.2))}"/>
    <ellipse cx="54" cy="112" rx="40" ry="28" fill="${escapeAttr(darken(dark, 0.35))}"/>
    <rect x="45" y="70" width="18" height="16" fill="#e8c9a0"/>
    <ellipse cx="54" cy="55" rx="22" ry="24" fill="#e8c9a0"/>
    <ellipse cx="54" cy="34" rx="22" ry="11" fill="#3d2b1f"/>
    <rect x="37" y="49" width="13" height="8" rx="3.5" fill="none" stroke="#555" stroke-width="1.4"/>
    <rect x="55" y="49" width="13" height="8" rx="3.5" fill="none" stroke="#555" stroke-width="1.4"/>
    <line x1="50" y1="53" x2="55" y2="53" stroke="#555" stroke-width="1.1"/>
    <circle cx="43.5" cy="53" r="2" fill="#333"/>
    <circle cx="61.5" cy="53" r="2" fill="#333"/>
    <path d="M 46,64 Q 54,70 62,64" stroke="#c87941" stroke-width="1.4" fill="none" stroke-linecap="round"/>
    <polygon points="54,86 50,95 54,110 58,95" fill="${escapeAttr(brand)}"/>
  </svg>`;
}

// ─── HTML ONE-PAGER ─────────────────────────────────────────────────────────

function renderOnePagerHtml(journeyData) {
  const j = journeyData;
  const brand = j.client.brandColour;
  const clientName = j.client.name;

  // Build the table cells row by row.
  // Row 0: Description — 13 columns, with col 2-3 merged for step 2.
  // Row 1: Data Collected — 13 columns, no merge.
  // Row 2: Adobe Platform — 13 columns, col 2-3 merged for step 2.
  // Row 3: Existing Tech — 13 columns, col 2-3 merged for step 2.

  const stepLabelsRow = `
    <tr class="step-labels-row">
      <th></th>
      ${j.stepLabels.map((label) => `<th>${escapeHtml(label)}</th>`).join('')}
    </tr>`;

  // Description row: descriptions has 13 items (index 2 is empty merge spacer).
  // Render: cells 0,1 then merged cell for index 1 (covering col 2-3), then 3..12.
  // The skill spec says step 2 description goes in col 2 with hMerge into col 3.
  // We render: header label + step1 + step2 (colspan=2 if descriptions[2]==='') + step3..step12 (mapped from desc[3]..desc[12])
  const descCells = renderRowCells(j.descriptions, 'desc', { mergeStep2: true });
  const dataCells = renderDataCells(j.data);
  const adobeCells = renderAdobeCells(j.adobe);
  const techCells = renderTechCells(j.tech, clientName);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(clientName)} — AEP One-Pager</title>
<style>
  :root {
    --brand: ${brand};
    --brand-dark: ${j.client.darkColour};
    --ink: #1A1A1A;
    --ink-soft: #4a5060;
    --bg: #fafafa;
    --panel: #ffffff;
    --border: #d6d9e0;
    --row-label-bg: ${j.client.darkColour};
    --row-label-fg: #ffffff;
    --highlight: ${brand};
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; min-height: 100%; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Adobe Clean', sans-serif; color: var(--ink); background: var(--bg); }
  .page { padding: 22px 26px; }
  .header { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin-bottom: 18px; }
  .header .title { font-size: 20px; font-weight: 600; }
  .header .subtitle { font-size: 12px; color: var(--ink-soft); }
  .header .client-name { font-size: 22px; font-weight: 700; color: var(--brand); }
  table.one-pager {
    width: 100%; border-collapse: separate; border-spacing: 0;
    background: var(--panel); border: 1px solid var(--border); border-radius: 10px; overflow: hidden;
    table-layout: fixed; font-size: 10.5px;
  }
  table.one-pager th, table.one-pager td {
    border-right: 1px solid var(--border); border-bottom: 1px solid var(--border);
    vertical-align: top; padding: 8px 8px; line-height: 1.35;
  }
  table.one-pager th:last-child, table.one-pager td:last-child { border-right: none; }
  .step-labels-row th {
    background: #f3f4f7; font-size: 10px; font-weight: 700; text-align: center; padding: 10px 6px;
    color: var(--ink); text-transform: none; letter-spacing: 0.2px;
  }
  .step-labels-row th:first-child { background: transparent; border-right: none; border-bottom: 1px solid var(--border); }
  .row-label {
    background: var(--row-label-bg); color: var(--row-label-fg); font-weight: 700; font-size: 12px;
    width: 11%; padding: 12px 10px; text-align: left; vertical-align: middle;
  }
  td.cell { background: var(--panel); }
  td.cell .status { font-weight: 700; text-decoration: underline; margin-bottom: 4px; display: block; }
  td.cell .heading { font-weight: 700; margin-top: 6px; }
  td.cell .product { text-decoration: underline; font-weight: 600; margin-top: 4px; display: block; }
  td.cell ul { margin: 4px 0 0; padding-left: 14px; }
  td.cell ul li { margin: 0 0 2px; }
  td.cell .identity-block { margin-top: 6px; padding-top: 6px; border-top: 1px dashed var(--border); }
  td.cell.desc { font-weight: 600; font-size: 11px; }
  td.cell.merged { background: #fffaf0; }
  .confirmed-tag { display: inline-block; font-size: 9px; padding: 1px 4px; border-radius: 3px; background: #e8f5e9; color: #1b5e20; margin-left: 4px; }
  .assumed-tag { display: inline-block; font-size: 9px; padding: 1px 4px; border-radius: 3px; background: #fff3e0; color: #b26a00; margin-left: 4px; }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div>
      <div class="title">${escapeHtml(clientName)} <span style="opacity:0.5;font-weight:500"> · Adobe Experience Platform One-Pager</span></div>
      <div class="subtitle">${escapeHtml(j.client.journeyType || 'Customer Journey')}</div>
    </div>
    <div class="client-name">${escapeHtml(clientName)}</div>
  </div>
  <table class="one-pager">
    ${stepLabelsRow}
    <tr><td class="row-label">Description</td>${descCells}</tr>
    <tr><td class="row-label">Data Collected</td>${dataCells}</tr>
    <tr><td class="row-label">Adobe Platform</td>${adobeCells}</tr>
    <tr><td class="row-label">Existing ${escapeHtml(clientName)} Technology</td>${techCells}</tr>
  </table>
</div>
</body>
</html>`;
}

/** Description-style rendering: descriptions[] is 13 items, index 2 is the hMerge spacer. */
function renderRowCells(descriptions, kind, { mergeStep2 = true } = {}) {
  // Output order matches the 12 step columns left-to-right, with step 2 merged across cols 2 and 3.
  // Cells produced (in order): step1 (desc[0]), step2 merged (desc[1] colspan=2), step3 (desc[3]), step4 (desc[4]), ..., step12 (desc[12]).
  // descriptions length is 13, index 2 is "" spacer.
  const cells = [];
  cells.push(`<td class="cell desc">${escapeHtml(descriptions[0] || '')}</td>`);
  if (mergeStep2) {
    cells.push(`<td class="cell desc merged" colspan="2">${escapeHtml(descriptions[1] || '')}</td>`);
  } else {
    cells.push(`<td class="cell desc">${escapeHtml(descriptions[1] || '')}</td>`);
    cells.push(`<td class="cell desc">${escapeHtml(descriptions[2] || '')}</td>`);
  }
  // Steps 3..12 from descriptions[3..12]
  for (let i = 3; i <= 12; i++) {
    cells.push(`<td class="cell desc">${escapeHtml(descriptions[i] || '')}</td>`);
  }
  return cells.join('');
}

/** Data Collected row: 12 items, no merge — one cell per step (skill puts step 2 in col 2 and leaves col 3 blank). */
function renderDataCells(data) {
  const cells = [];
  for (let i = 0; i < 12; i++) {
    const d = data[i] || { status: '', bullets: [] };
    const bulletsHtml = (Array.isArray(d.bullets) && d.bullets.length)
      ? `<ul>${d.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>` : '';
    const identityHtml = d.identity
      ? `<div class="identity-block"><span class="heading">Identity:</span><ul><li>${escapeHtml(d.identity)}</li></ul></div>` : '';
    cells.push(`<td class="cell">
      <span class="status">${escapeHtml(d.status || 'Customer')}</span>
      ${bulletsHtml}
      ${identityHtml}
    </td>`);
    if (i === 1) {
      // Step 2 is in col 2; col 3 is blank in the original PPTX. Mirror that here so widths align with the Description row's merged cell.
      cells.push(`<td class="cell"></td>`);
    }
  }
  return cells.join('');
}

/** Adobe row: 12 items each is an array of {type, text} blocks. Step 2 spans 2 cols. */
function renderAdobeCells(adobe) {
  const cells = [];
  for (let i = 0; i < 12; i++) {
    const blocks = Array.isArray(adobe[i]) ? adobe[i] : [];
    const html = renderAdobeBlocks(blocks);
    if (i === 1) {
      cells.push(`<td class="cell merged" colspan="2">${html}</td>`);
    } else {
      cells.push(`<td class="cell">${html}</td>`);
    }
  }
  return cells.join('');
}

function renderAdobeBlocks(blocks) {
  let html = '';
  let listOpen = false;
  for (const b of blocks) {
    const type = b && b.type;
    const text = escapeHtml(b && b.text || '');
    if (type === 'product') {
      if (listOpen) { html += '</ul>'; listOpen = false; }
      html += `<span class="product">${text}</span>`;
    } else if (type === 'heading') {
      if (listOpen) { html += '</ul>'; listOpen = false; }
      html += `<div class="heading">${text}</div>`;
    } else if (type === 'bullet') {
      if (!listOpen) { html += '<ul>'; listOpen = true; }
      html += `<li>${text}</li>`;
    } else if (type === 'blank') {
      if (listOpen) { html += '</ul>'; listOpen = false; }
      html += '<div style="height:6px"></div>';
    }
  }
  if (listOpen) html += '</ul>';
  return html;
}

/** Tech row: 12 items each {heading, bullets:[{text,confirmed}]}. Step 2 spans 2 cols. */
function renderTechCells(tech /*, clientName */) {
  const cells = [];
  for (let i = 0; i < 12; i++) {
    const t = tech[i] || { heading: '', bullets: [] };
    const heading = `<span class="status">${escapeHtml(t.heading || '')}</span>`;
    const bullets = Array.isArray(t.bullets) ? t.bullets : [];
    const list = bullets.length
      ? `<ul>${bullets.map((b) => `<li>${escapeHtml(b.text || '')}<span class="${b.confirmed ? 'confirmed-tag' : 'assumed-tag'}">${b.confirmed ? 'confirmed' : 'assumed'}</span></li>`).join('')}</ul>`
      : '';
    if (i === 1) {
      cells.push(`<td class="cell merged" colspan="2">${heading}${list}</td>`);
    } else {
      cells.push(`<td class="cell">${heading}${list}</td>`);
    }
  }
  return cells.join('');
}

// ─── PPTX RENDERER (port of the Python script in script-boilerplate.md) ──────

const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_RELS = 'http://schemas.openxmlformats.org/package/2006/relationships';

const FONT_TYPEFACE = 'Adobe Clean';

function renderPptx(journeyData, options = {}) {
  const PizZip = require('pizzip');
  const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');

  const j = normaliseJourney(journeyData);
  const templateBytes = fs.readFileSync(PPTX_TEMPLATE_PATH);
  const zip = new PizZip(templateBytes);

  // Open slide1.xml
  const slideXmlStr = zip.file('ppt/slides/slide1.xml').asText();
  const dom = new DOMParser().parseFromString(slideXmlStr, 'text/xml');
  const doc = dom.documentElement || dom;

  // ── 1) Find the table and replace each row's cell contents ────────────────
  const tables = getElementsByLocalName(doc, NS_A, 'tbl');
  if (!tables.length) throw new Error('PPTX template missing <a:tbl> in slide1.xml');
  const tbl = tables[0];
  const rows = getChildrenByLocalName(tbl, NS_A, 'tr');
  if (rows.length < 4) throw new Error(`PPTX template expected 4 table rows, found ${rows.length}`);

  // Row 0: Description (set_row → first cell label, cells[1] = desc[0], cells[2] = desc[1], cells[3] = blank, cells[4..13] = desc[2..11] → with descriptions filtered to 12 items).
  // Row 1: Data Collected (set_row_no_merge → first cell label, then cells[1..13] = DATA_FLAT)
  // Row 2: Adobe Platform (set_row)
  // Row 3: Existing Tech (set_row, label includes client name)
  const descContent = j.descriptions.filter((d) => d !== ''); // 12 items
  const descParas = descContent.map((d) => [pPlain(dom, d, { bold: true, align: 'l' })]);
  setRow(dom, rows[0], 'Description', descParas);

  const dataParas = j.data.map((d) => buildDataParas(dom, d));
  // Row 1: no_merge variant. DATA_FLAT = [data[0], data[1], blank, data[2..11]] — 13 items.
  const dataFlat = [dataParas[0], dataParas[1], [pBlank(dom)], ...dataParas.slice(2)];
  setRowNoMerge(dom, rows[1], 'Data Collected', dataFlat);
  // After: set gridSpan='2' on row1 cells[2] and hMerge='1' on cells[3].
  const row1Cells = getChildrenByLocalName(rows[1], NS_A, 'tc');
  if (row1Cells[2]) row1Cells[2].setAttribute('gridSpan', '2');
  if (row1Cells[3]) row1Cells[3].setAttribute('hMerge', '1');

  const adobeParas = j.adobe.map((blocks) => buildAdobeParas(dom, blocks));
  setRow(dom, rows[2], 'Adobe Platform', adobeParas);

  const techParas = j.tech.map((t) => buildTechParas(dom, t));
  setRow(dom, rows[3], `Existing ${j.client.name} Technology`, techParas);

  // ── 2) Top visual section: remove Admiral Picture shapes, add STEP_LABELS ─
  const spTrees = getElementsByLocalName(doc, NS_P, 'spTree');
  if (!spTrees.length) throw new Error('PPTX template missing <p:spTree>');
  const spTree = spTrees[0];

  removeAdmiralImages(spTree);

  // Insert 12 STEP_LABELS shapes; _sp_id starts at 200, increments per shape.
  let nextSpId = { value: 201 };
  for (let i = 0; i < 12; i++) {
    const labelText = j.stepLabels[i] || `${String(i + 1).padStart(2, '0')}  Step`;
    const [x, y, w, h] = STEP_LABEL_GEOMETRY[i];
    const sp = buildLabelShape(dom, labelText, x, y, w, h, { fontsizePt: 11, bold: true, colorHex: '1A1A1A', align: 'l' }, nextSpId);
    spTree.appendChild(sp);
  }

  // ── 3) Optional: client logo (top-right) ─────────────────────────────────
  let updatedRels = null;
  if (options.logoBuffer && Buffer.isBuffer(options.logoBuffer) && options.logoBuffer.length > 0) {
    const logoExt = inferLogoExt(options.logoMime, options.logoBuffer);
    const logoMediaName = `clientLogo.${logoExt}`;
    const logoMediaPath = `ppt/media/${logoMediaName}`;

    const relsPath = 'ppt/slides/_rels/slide1.xml.rels';
    const relsStr = zip.file(relsPath).asText();
    const relsDom = new DOMParser().parseFromString(relsStr, 'text/xml');
    const relsRoot = relsDom.documentElement;
    const existingRels = getChildrenByLocalName(relsRoot, NS_RELS, 'Relationship');
    let maxId = 0;
    for (const r of existingRels) {
      const id = r.getAttribute('Id') || '';
      const m = /^rId(\d+)$/.exec(id);
      if (m) maxId = Math.max(maxId, Number(m[1]));
    }
    const logoRid = `rId${maxId + 1}`;
    const newRel = relsDom.createElementNS(NS_RELS, 'Relationship');
    newRel.setAttribute('Id', logoRid);
    newRel.setAttribute('Type', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image');
    newRel.setAttribute('Target', `../media/${logoMediaName}`);
    relsRoot.appendChild(newRel);
    updatedRels = { path: relsPath, xml: serializeXml(relsDom) };

    // Insert <p:pic> into spTree (top-right, fixed coordinates per content-rules.md).
    const pic = buildLogoPic(dom, logoRid, 67.0, 0.5, 7.0, 2.5, nextSpId);
    spTree.appendChild(pic);

    zip.file(logoMediaPath, options.logoBuffer);
  } else {
    // Fallback: text branding in the top-right (matches make_sp() fallback).
    const sp = buildLabelShape(dom, j.client.name, 1.36, 0.7, 73.5, 2.2, {
      fontsizePt: 22, bold: true, colorHex: hexToPptxRgb(j.client.brandColour), align: 'r',
    }, nextSpId);
    spTree.appendChild(sp);
  }

  // ── 4) Serialise + write back ────────────────────────────────────────────
  const newSlideXml = serializeXml(dom);
  zip.file('ppt/slides/slide1.xml', newSlideXml);
  if (updatedRels) zip.file(updatedRels.path, updatedRels.xml);

  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function inferLogoExt(mime, buffer) {
  const m = String(mime || '').toLowerCase();
  if (m.includes('png')) return 'png';
  if (m.includes('jpeg') || m.includes('jpg')) return 'jpg';
  if (m.includes('gif')) return 'gif';
  if (m.includes('svg')) return 'svg';
  // Sniff PNG magic
  if (buffer && buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) return 'png';
  if (buffer && buffer.length > 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'jpg';
  return 'png';
}

// ── XML / DOM helpers ────────────────────────────────────────────────────────

function getElementsByLocalName(root, ns, localName) {
  const out = [];
  function walk(node) {
    if (!node) return;
    if (node.nodeType === 1 && node.namespaceURI === ns && node.localName === localName) {
      out.push(node);
    }
    let child = node.firstChild;
    while (child) { walk(child); child = child.nextSibling; }
  }
  walk(root);
  return out;
}

function getChildrenByLocalName(parent, ns, localName) {
  const out = [];
  let child = parent && parent.firstChild;
  while (child) {
    if (child.nodeType === 1 && child.namespaceURI === ns && child.localName === localName) {
      out.push(child);
    }
    child = child.nextSibling;
  }
  return out;
}

function serializeXml(dom) {
  const { XMLSerializer } = require('@xmldom/xmldom');
  let xml = new XMLSerializer().serializeToString(dom);
  // Ensure XML declaration with standalone='yes' (matches PPTX convention).
  if (!/^<\?xml/.test(xml)) {
    xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + xml;
  } else {
    xml = xml.replace(/^<\?xml[^?]+\?>/, '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>');
  }
  return xml;
}

// ── PPTX paragraph builders (match Python helpers in script-boilerplate.md) ─

function makeRpr(dom, { bold = false, underline = false } = {}) {
  const el = dom.createElementNS(NS_A, 'a:rPr');
  el.setAttribute('lang', 'en-GB');
  el.setAttribute('sz', '1350');
  el.setAttribute('b', bold ? '1' : '0');
  el.setAttribute('i', '0');
  el.setAttribute('u', underline ? 'sng' : 'none');
  el.setAttribute('strike', 'noStrike');
  el.setAttribute('kern', '1200');
  const sf = dom.createElementNS(NS_A, 'a:solidFill');
  const sc = dom.createElementNS(NS_A, 'a:schemeClr');
  sc.setAttribute('val', 'dk1');
  sf.appendChild(sc);
  el.appendChild(sf);
  el.appendChild(dom.createElementNS(NS_A, 'a:effectLst'));
  const lat = dom.createElementNS(NS_A, 'a:latin');
  lat.setAttribute('typeface', FONT_TYPEFACE);
  lat.setAttribute('panose', '020B0503020404020204');
  lat.setAttribute('pitchFamily', '34');
  lat.setAttribute('charset', '0');
  el.appendChild(lat);
  const ea = dom.createElementNS(NS_A, 'a:ea');
  ea.setAttribute('typeface', '+mn-ea');
  el.appendChild(ea);
  const cs = dom.createElementNS(NS_A, 'a:cs');
  cs.setAttribute('typeface', '+mn-cs');
  el.appendChild(cs);
  return el;
}

function makeEndParaRpr(dom, { bold = false } = {}) {
  const el = dom.createElementNS(NS_A, 'a:endParaRPr');
  el.setAttribute('lang', 'en-GB');
  el.setAttribute('sz', '1350');
  el.setAttribute('b', bold ? '1' : '0');
  el.setAttribute('i', '0');
  el.setAttribute('u', 'none');
  el.setAttribute('strike', 'noStrike');
  el.setAttribute('kern', '1200');
  const sf = dom.createElementNS(NS_A, 'a:solidFill');
  const sc = dom.createElementNS(NS_A, 'a:schemeClr');
  sc.setAttribute('val', 'dk1');
  sf.appendChild(sc);
  el.appendChild(sf);
  el.appendChild(dom.createElementNS(NS_A, 'a:effectLst'));
  const lat = dom.createElementNS(NS_A, 'a:latin');
  lat.setAttribute('typeface', FONT_TYPEFACE);
  lat.setAttribute('panose', '020B0503020404020204');
  lat.setAttribute('pitchFamily', '34');
  lat.setAttribute('charset', '0');
  el.appendChild(lat);
  const ea = dom.createElementNS(NS_A, 'a:ea');
  ea.setAttribute('typeface', '+mn-ea');
  el.appendChild(ea);
  const cs = dom.createElementNS(NS_A, 'a:cs');
  cs.setAttribute('typeface', '+mn-cs');
  el.appendChild(cs);
  return el;
}

function pPlain(dom, text, { bold = false, underline = false, align = null } = {}) {
  const p = dom.createElementNS(NS_A, 'a:p');
  if (align) {
    const ppr = dom.createElementNS(NS_A, 'a:pPr');
    ppr.setAttribute('algn', align);
    p.appendChild(ppr);
  }
  const r = dom.createElementNS(NS_A, 'a:r');
  r.appendChild(makeRpr(dom, { bold, underline }));
  const t = dom.createElementNS(NS_A, 'a:t');
  t.appendChild(dom.createTextNode(safeString(text)));
  r.appendChild(t);
  p.appendChild(r);
  p.appendChild(makeEndParaRpr(dom, { bold }));
  return p;
}

function pBlank(dom, { bold = false } = {}) {
  const p = dom.createElementNS(NS_A, 'a:p');
  p.appendChild(makeEndParaRpr(dom, { bold }));
  return p;
}

function pBullet(dom, text) {
  const p = dom.createElementNS(NS_A, 'a:p');
  const ppr = dom.createElementNS(NS_A, 'a:pPr');
  ppr.setAttribute('marL', '285750');
  ppr.setAttribute('indent', '-285750');
  const buFont = dom.createElementNS(NS_A, 'a:buFont');
  buFont.setAttribute('typeface', 'Arial');
  buFont.setAttribute('panose', '020B0604020202020204');
  buFont.setAttribute('pitchFamily', '34');
  buFont.setAttribute('charset', '0');
  ppr.appendChild(buFont);
  const buChar = dom.createElementNS(NS_A, 'a:buChar');
  buChar.setAttribute('char', '•');
  ppr.appendChild(buChar);
  p.appendChild(ppr);
  const r = dom.createElementNS(NS_A, 'a:r');
  r.appendChild(makeRpr(dom, { bold: false }));
  const t = dom.createElementNS(NS_A, 'a:t');
  t.appendChild(dom.createTextNode(safeString(text)));
  r.appendChild(t);
  p.appendChild(r);
  return p;
}

function buildDataParas(dom, d) {
  const paras = [pPlain(dom, d.status || 'Customer', { underline: true }), pBlank(dom)];
  for (const b of (d.bullets || [])) paras.push(pBullet(dom, b));
  if (d.identity) {
    paras.push(pBlank(dom));
    paras.push(pPlain(dom, 'Identity:', { bold: true }));
    paras.push(pBullet(dom, d.identity));
  }
  return paras;
}

function buildAdobeParas(dom, blocks) {
  const out = [];
  for (const b of (blocks || [])) {
    if (!b) continue;
    if (b.type === 'product') out.push(pPlain(dom, b.text || '', { underline: true }));
    else if (b.type === 'heading') out.push(pPlain(dom, b.text || '', { bold: true }));
    else if (b.type === 'bullet') out.push(pBullet(dom, b.text || ''));
    else if (b.type === 'blank') out.push(pBlank(dom));
  }
  return out;
}

function buildTechParas(dom, t) {
  const paras = [pPlain(dom, t.heading || '', { underline: true, bold: true }), pBlank(dom)];
  for (const b of (t.bullets || [])) {
    const text = (b.text || '') + (b.confirmed ? ' [confirmed]' : ' [assumed]');
    paras.push(pBullet(dom, text));
  }
  return paras;
}

function makeSectionCellParas(dom, label) {
  const p = dom.createElementNS(NS_A, 'a:p');
  const ppr = dom.createElementNS(NS_A, 'a:pPr');
  ppr.setAttribute('algn', 'l');
  p.appendChild(ppr);
  const r = dom.createElementNS(NS_A, 'a:r');
  const rpr = dom.createElementNS(NS_A, 'a:rPr');
  rpr.setAttribute('lang', 'en-GB');
  rpr.setAttribute('sz', '2200');
  rpr.setAttribute('b', '1');
  rpr.setAttribute('i', '0');
  const sf = dom.createElementNS(NS_A, 'a:solidFill');
  const sc = dom.createElementNS(NS_A, 'a:schemeClr');
  sc.setAttribute('val', 'tx1');
  sf.appendChild(sc);
  rpr.appendChild(sf);
  const lat = dom.createElementNS(NS_A, 'a:latin');
  lat.setAttribute('typeface', FONT_TYPEFACE);
  lat.setAttribute('panose', '020B0503020404020204');
  lat.setAttribute('pitchFamily', '34');
  lat.setAttribute('charset', '0');
  rpr.appendChild(lat);
  r.appendChild(rpr);
  const t = dom.createElementNS(NS_A, 'a:t');
  t.appendChild(dom.createTextNode(safeString(label)));
  r.appendChild(t);
  p.appendChild(r);
  return [p];
}

function makeTxBody(dom, paras) {
  const txb = dom.createElementNS(NS_A, 'a:txBody');
  txb.appendChild(dom.createElementNS(NS_A, 'a:bodyPr'));
  txb.appendChild(dom.createElementNS(NS_A, 'a:lstStyle'));
  for (const p of paras) txb.appendChild(p.cloneNode(true));
  return txb;
}

function replaceTxBody(dom, tc, paras) {
  // Remove existing a:txBody (there should be exactly one).
  const existing = getChildrenByLocalName(tc, NS_A, 'txBody');
  for (const e of existing) tc.removeChild(e);
  // Insert new txBody before tcPr (if present), else append.
  const tcPrs = getChildrenByLocalName(tc, NS_A, 'tcPr');
  const txb = makeTxBody(dom, paras);
  if (tcPrs.length) {
    tc.insertBefore(txb, tcPrs[0]);
  } else {
    tc.appendChild(txb);
  }
}

function setRow(dom, row, labelText, contentList) {
  const cells = getChildrenByLocalName(row, NS_A, 'tc');
  replaceTxBody(dom, cells[0], makeSectionCellParas(dom, labelText));
  // contentList is 12 items (one per step). Map: cell[1]=item[0], cell[2]=item[1], cell[3]=blank, cell[4..13]=item[2..11].
  if (cells[1]) replaceTxBody(dom, cells[1], contentList[0] || [pBlank(dom)]);
  if (cells[2]) replaceTxBody(dom, cells[2], contentList[1] || [pBlank(dom)]);
  if (cells[3]) replaceTxBody(dom, cells[3], [pBlank(dom)]);
  for (let i = 0; i < 10; i++) {
    const ci = 4 + i;
    if (cells[ci]) replaceTxBody(dom, cells[ci], contentList[2 + i] || [pBlank(dom)]);
  }
}

function setRowNoMerge(dom, row, labelText, contentList) {
  const cells = getChildrenByLocalName(row, NS_A, 'tc');
  replaceTxBody(dom, cells[0], makeSectionCellParas(dom, labelText));
  for (let i = 1; i < 14 && i - 1 < contentList.length; i++) {
    if (cells[i]) replaceTxBody(dom, cells[i], contentList[i - 1] || [pBlank(dom)]);
  }
}

// ── Top-visual shape builders ────────────────────────────────────────────────

const ADMIRAL_PICTURE_NAMES = new Set([
  'Picture 21', 'Picture 24', 'Picture 25', 'Picture 26', 'Picture 27',
  'Picture 28', 'Picture 29', 'Picture 30', 'Picture 31', 'Picture 32',
  'Picture 33', 'Picture 34', 'Picture 35', 'Picture 36',
]);

function removeAdmiralImages(spTree) {
  const toRemove = [];
  let child = spTree.firstChild;
  while (child) {
    if (child.nodeType === 1) {
      // Look for <p:cNvPr name="..."/> inside this element.
      const cnvprs = getElementsByLocalName(child, NS_P, 'cNvPr');
      for (const c of cnvprs) {
        const n = c.getAttribute('name') || '';
        if (ADMIRAL_PICTURE_NAMES.has(n)) {
          toRemove.push(child);
          break;
        }
      }
    }
    child = child.nextSibling;
  }
  for (const el of toRemove) spTree.removeChild(el);
}

function cmEmu(v) {
  return String(Math.round(v * 360000));
}

function buildLabelShape(dom, text, xCm, yCm, wCm, hCm, { fontsizePt = 9, bold = false, colorHex = 'FFFFFF', align = 'l' } = {}, nextSpId) {
  nextSpId.value += 1;
  const sid = String(nextSpId.value);
  const sp = dom.createElementNS(NS_P, 'p:sp');

  const nv = dom.createElementNS(NS_P, 'p:nvSpPr');
  const cnv = dom.createElementNS(NS_P, 'p:cNvPr');
  cnv.setAttribute('id', sid);
  cnv.setAttribute('name', `Label${sid}`);
  nv.appendChild(cnv);
  const cNvSpPr = dom.createElementNS(NS_P, 'p:cNvSpPr');
  const spLocks = dom.createElementNS(NS_A, 'a:spLocks');
  spLocks.setAttribute('noGrp', '1');
  cNvSpPr.appendChild(spLocks);
  nv.appendChild(cNvSpPr);
  nv.appendChild(dom.createElementNS(NS_P, 'p:nvPr'));
  sp.appendChild(nv);

  const sppr = dom.createElementNS(NS_P, 'p:spPr');
  const xfrm = dom.createElementNS(NS_A, 'a:xfrm');
  const off = dom.createElementNS(NS_A, 'a:off');
  off.setAttribute('x', cmEmu(xCm));
  off.setAttribute('y', cmEmu(yCm));
  xfrm.appendChild(off);
  const ext = dom.createElementNS(NS_A, 'a:ext');
  ext.setAttribute('cx', cmEmu(wCm));
  ext.setAttribute('cy', cmEmu(hCm));
  xfrm.appendChild(ext);
  sppr.appendChild(xfrm);
  const pg = dom.createElementNS(NS_A, 'a:prstGeom');
  pg.setAttribute('prst', 'rect');
  pg.appendChild(dom.createElementNS(NS_A, 'a:avLst'));
  sppr.appendChild(pg);
  sppr.appendChild(dom.createElementNS(NS_A, 'a:noFill'));
  sp.appendChild(sppr);

  const txb = dom.createElementNS(NS_P, 'p:txBody');
  const bpr = dom.createElementNS(NS_A, 'a:bodyPr');
  bpr.setAttribute('wrap', 'square');
  bpr.setAttribute('rtlCol', '0');
  txb.appendChild(bpr);
  txb.appendChild(dom.createElementNS(NS_A, 'a:lstStyle'));
  const para = dom.createElementNS(NS_A, 'a:p');
  const ppr = dom.createElementNS(NS_A, 'a:pPr');
  ppr.setAttribute('algn', align);
  para.appendChild(ppr);
  const run = dom.createElementNS(NS_A, 'a:r');
  const rpr = dom.createElementNS(NS_A, 'a:rPr');
  rpr.setAttribute('lang', 'en-GB');
  rpr.setAttribute('sz', String(Math.round(fontsizePt * 100)));
  rpr.setAttribute('b', bold ? '1' : '0');
  rpr.setAttribute('dirty', '0');
  const sf = dom.createElementNS(NS_A, 'a:solidFill');
  const srgb = dom.createElementNS(NS_A, 'a:srgbClr');
  srgb.setAttribute('val', colorHex);
  sf.appendChild(srgb);
  rpr.appendChild(sf);
  const lat = dom.createElementNS(NS_A, 'a:latin');
  lat.setAttribute('typeface', FONT_TYPEFACE);
  rpr.appendChild(lat);
  run.appendChild(rpr);
  const t = dom.createElementNS(NS_A, 'a:t');
  t.appendChild(dom.createTextNode(safeString(text)));
  run.appendChild(t);
  para.appendChild(run);
  txb.appendChild(para);
  sp.appendChild(txb);

  return sp;
}

function buildLogoPic(dom, rid, xCm, yCm, wCm, hCm, nextSpId) {
  nextSpId.value += 1;
  const sid = String(nextSpId.value);
  const pic = dom.createElementNS(NS_P, 'p:pic');

  const nv = dom.createElementNS(NS_P, 'p:nvPicPr');
  const cnv = dom.createElementNS(NS_P, 'p:cNvPr');
  cnv.setAttribute('id', sid);
  cnv.setAttribute('name', 'ClientLogo');
  nv.appendChild(cnv);
  nv.appendChild(dom.createElementNS(NS_P, 'p:cNvPicPr'));
  nv.appendChild(dom.createElementNS(NS_P, 'p:nvPr'));
  pic.appendChild(nv);

  const blipFill = dom.createElementNS(NS_P, 'p:blipFill');
  const blip = dom.createElementNS(NS_A, 'a:blip');
  blip.setAttributeNS(NS_R, 'r:embed', rid);
  blipFill.appendChild(blip);
  const stretch = dom.createElementNS(NS_A, 'a:stretch');
  stretch.appendChild(dom.createElementNS(NS_A, 'a:fillRect'));
  blipFill.appendChild(stretch);
  pic.appendChild(blipFill);

  const sppr = dom.createElementNS(NS_P, 'p:spPr');
  const xfrm = dom.createElementNS(NS_A, 'a:xfrm');
  const off = dom.createElementNS(NS_A, 'a:off');
  off.setAttribute('x', cmEmu(xCm));
  off.setAttribute('y', cmEmu(yCm));
  xfrm.appendChild(off);
  const ext = dom.createElementNS(NS_A, 'a:ext');
  ext.setAttribute('cx', cmEmu(wCm));
  ext.setAttribute('cy', cmEmu(hCm));
  xfrm.appendChild(ext);
  sppr.appendChild(xfrm);
  const pg = dom.createElementNS(NS_A, 'a:prstGeom');
  pg.setAttribute('prst', 'rect');
  pg.appendChild(dom.createElementNS(NS_A, 'a:avLst'));
  sppr.appendChild(pg);
  pic.appendChild(sppr);

  return pic;
}

// ─── HTTP HANDLERS ───────────────────────────────────────────────────────────

async function handleGenerate(req, res) {
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  const sandbox = String(body.sandbox || '').trim();
  const scrapeId = String(body.scrapeId || '').trim();
  if (!sandbox || !scrapeId) { res.status(400).json({ error: 'sandbox and scrapeId are required' }); return; }
  // Refinement mode: caller passes the previous journey JSON + a freeform
  // user prompt. Both must be present; a missing previousJourney with a
  // refinementPrompt falls back to a fresh generation so the user always
  // gets something useful.
  const previousJourney = (body.previousJourney && typeof body.previousJourney === 'object')
    ? body.previousJourney
    : null;
  const refinementPrompt = typeof body.refinementPrompt === 'string'
    ? body.refinementPrompt
    : '';
  // AEP capability tier — Foundation = RT-CDP + AJO + CJA only;
  // Advanced = also includes Decision Management + Brand Concierge.
  // Default is 'advanced' so callers that pre-date this field (legacy
  // localStorage cache loads, older external integrations) keep getting
  // today's behaviour with no surprise.
  const tier = body.tier === 'foundation' ? 'foundation' : 'advanced';
  try {
    const result = await generateJourney({
      sandbox,
      scrapeId,
      brandColour: body.brandColour,
      journeyType: body.journeyType,
      personaName: body.personaName,
      clientName: body.clientName,
      additionalContext: body.additionalContext,
      tier,
      previousJourney,
      refinementPrompt,
    });
    res.status(200).json({
      ok: true,
      mode: (previousJourney && refinementPrompt.trim()) ? 'refinement' : 'initial',
      ...result,
    });
  } catch (e) {
    console.error('[clientJourney] generate failed', e);
    res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
}

async function handlePptx(req, res) {
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  const journeyData = body.journeyData;
  if (!journeyData || typeof journeyData !== 'object') {
    res.status(400).json({ error: 'journeyData (object) is required' });
    return;
  }
  let logoBuffer = null;
  let logoMime = null;
  if (body.logoBase64 && typeof body.logoBase64 === 'string') {
    try {
      logoBuffer = Buffer.from(body.logoBase64, 'base64');
      logoMime = body.logoMime || 'image/png';
    } catch (_) { logoBuffer = null; }
  }
  try {
    const buf = renderPptx(journeyData, { logoBuffer, logoMime });
    const slug = slugify((journeyData.client && journeyData.client.slug) || (journeyData.client && journeyData.client.name) || 'client');
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.set('Content-Disposition', `attachment; filename="${slug}-one-pager.pptx"`);
    res.set('Content-Length', String(buf.length));
    res.status(200).end(buf);
  } catch (e) {
    console.error('[clientJourney] pptx failed', e);
    res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
}

module.exports = {
  generateJourney,
  renderJourneyHtml,
  renderOnePagerHtml,
  renderPptx,
  normaliseJourney,
  summariseScrapeForPrompt,
  handleGenerate,
  handlePptx,
};
