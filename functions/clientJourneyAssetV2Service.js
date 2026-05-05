/**
 * Client Journey Asset v2 — server implementation of the bundled
 * `aep-client-journey` Claude skill.
 *
 * Built from a clean baseline: this module shares no runtime code, no
 * route, no export name, and no template asset with v1
 * (`clientJourneyAssetService.js`). Both can ship simultaneously.
 *
 * Responsibilities:
 *   1. Read the canonical skill markdown from
 *        functions/assets/client-journey-v2-skill/
 *      (SKILL_SERVER.md + content-rules.md + html-rules.md +
 *       brand-concierge.md when the request asks for the Advanced tier).
 *   2. Pre-fetch curated Adobe Experience League capability snippets from
 *      Context7 (cached in Firestore for 24 h, with a small static-summary
 *      fallback for any topic Context7 doesn't cover).
 *   3. Call Vertex AI Gemini in JSON mode, with Google Search grounding
 *      enabled so the model can do real client tech-stack research when
 *      the operator leaves the tech-stack form field blank.
 *   4. Validate the strict JSON response (12 step labels, 13 descriptions
 *      with index 2 empty, 12 PPTX cells, 13 slides[] entries).
 *   5. Render two artefacts from the single JSON response:
 *        a. Standalone interactive HTML journey (per html-rules.md).
 *        b. Cloned Admiral PPTX one-pager (per content-rules.md +
 *           script-boilerplate.md, ported to Node via pizzip + xmldom).
 *
 * Public surface:
 *   handleGenerate(req, res, { contextSevenKey })
 *     POST clientJourneyV2Generate (direct Cloud Function URL — long call)
 *     → { meta, html, pptxData, journey, sources, log }
 *
 *   handlePptx(req, res)
 *     POST /api/client-journey-v2/pptx
 *     → application/vnd.openxmlformats-officedocument.presentationml.presentation
 */

'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const { callGemini, callGeminiResearch, stripJsonFences } = require('./vertexClient');
const { jsonrepair } = require('jsonrepair');

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

const SKILL_DIR = path.join(__dirname, 'assets', 'client-journey-v2-skill');
const PPTX_TEMPLATE_PATH = path.join(__dirname, 'assets', 'client-journey-v2-template.pptx');

const FIRESTORE_DOC_CACHE_COLLECTION = 'clientJourneyV2DocsCache';
const DOC_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 h
const CONTEXT7_BASE = 'https://context7.com/api/v1';
const CONTEXT7_TOKEN_BUDGET = 1500;
const CONTEXT7_TIMEOUT_MS = 12_000;

// Generation-pass output budget. Gemini 2.5 supports up to 65536 output
// tokens; 16k is comfortable headroom for the 13-slide journey JSON
// (typical real-world payload is ~9–12k tokens) without leaving a wide
// margin for the model to ramble itself into a truncation.
const GEMINI_MAX_OUTPUT_TOKENS = 16_384;
// Generation-pass temperature. The schema is strict and the deliverable
// is structured JSON — determinism beats creativity here. Creativity
// belongs in the upstream research pass, not in the generator.
const GEMINI_TEMPERATURE = 0.25;

/** SVG journey map — verbatim from html-rules.md (12 nodes). */
const NODES = [
  { cx: 25,  cy: 168 },
  { cx: 113, cy: 65  },
  { cx: 200, cy: 158 },
  { cx: 288, cy: 58  },
  { cx: 376, cy: 168 },
  { cx: 464, cy: 62  },
  { cx: 552, cy: 158 },
  { cx: 640, cy: 55  },
  { cx: 726, cy: 165 },
  { cx: 814, cy: 52  },
  { cx: 900, cy: 168 },
  { cx: 982, cy: 70  },
];

const BASE_PATH = 'M 25,168 C 55,168 85,65 113,65 C 141,65 172,158 200,158 ' +
  'C 228,158 260,58 288,58 C 316,58 348,168 376,168 ' +
  'C 404,168 436,62 464,62 C 492,62 524,158 552,158 ' +
  'C 580,158 612,55 640,55 C 668,55 698,165 726,165 ' +
  'C 754,165 786,52 814,52 C 842,52 872,168 900,168 ' +
  'C 922,168 958,70 982,70';

/** Cumulative active-trail segments — pathSegs[N] = path through node N. */
const PATH_SEGS = (function buildPathSegs() {
  const segs = [''];
  // Each cubic Bezier segment ends at a node; build by cumulative slicing.
  // We re-emit the path in the same shape as the original by walking the
  // base path's tokens. The skill provides an authoritative table — keep
  // that authoritative form here verbatim.
  segs.push('M 25,168 C 55,168 85,65 113,65');
  segs.push('M 25,168 C 55,168 85,65 113,65 C 141,65 172,158 200,158');
  segs.push('M 25,168 C 55,168 85,65 113,65 C 141,65 172,158 200,158 C 228,158 260,58 288,58');
  segs.push('M 25,168 C 55,168 85,65 113,65 C 141,65 172,158 200,158 C 228,158 260,58 288,58 C 316,58 348,168 376,168');
  segs.push('M 25,168 C 55,168 85,65 113,65 C 141,65 172,158 200,158 C 228,158 260,58 288,58 C 316,58 348,168 376,168 C 404,168 436,62 464,62');
  segs.push('M 25,168 C 55,168 85,65 113,65 C 141,65 172,158 200,158 C 228,158 260,58 288,58 C 316,58 348,168 376,168 C 404,168 436,62 464,62 C 492,62 524,158 552,158');
  segs.push('M 25,168 C 55,168 85,65 113,65 C 141,65 172,158 200,158 C 228,158 260,58 288,58 C 316,58 348,168 376,168 C 404,168 436,62 464,62 C 492,62 524,158 552,158 C 580,158 612,55 640,55');
  segs.push('M 25,168 C 55,168 85,65 113,65 C 141,65 172,158 200,158 C 228,158 260,58 288,58 C 316,58 348,168 376,168 C 404,168 436,62 464,62 C 492,62 524,158 552,158 C 580,158 612,55 640,55 C 668,55 698,165 726,165');
  segs.push('M 25,168 C 55,168 85,65 113,65 C 141,65 172,158 200,158 C 228,158 260,58 288,58 C 316,58 348,168 376,168 C 404,168 436,62 464,62 C 492,62 524,158 552,158 C 580,158 612,55 640,55 C 668,55 698,165 726,165 C 754,165 786,52 814,52');
  segs.push('M 25,168 C 55,168 85,65 113,65 C 141,65 172,158 200,158 C 228,158 260,58 288,58 C 316,58 348,168 376,168 C 404,168 436,62 464,62 C 492,62 524,158 552,158 C 580,158 612,55 640,55 C 668,55 698,165 726,165 C 754,165 786,52 814,52 C 842,52 872,168 900,168');
  segs.push(BASE_PATH);
  return segs;
})();

/** STEP_LABEL_GEOMETRY — verbatim from content-rules.md (cm units, 12 entries). */
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

/** Logo position — verbatim from content-rules.md. */
const LOGO_GEOMETRY = { x_cm: 67.0, y_cm: 0.5, w_cm: 7.0, h_cm: 2.5 };

const DEFAULT_STEP_ICONS = ['🚗', '🔍', '🌐', '📋', '🛒', '☕', '🎯', '🔐', '🎁', '📝', '💬', '✅'];

/** Topics for Context7 fetch. Brand Concierge only when tier === 'Advanced'. */
const CONTEXT7_TOPICS = [
  { id: 'rtcdp',          query: 'Adobe Real-Time CDP overview',                tier: 'all' },
  { id: 'ajo',            query: 'Adobe Journey Optimizer essentials',          tier: 'all' },
  { id: 'aiAgentic',      query: 'Adobe Experience Cloud AI agentic features',  tier: 'all' },
  { id: 'cja',            query: 'Adobe Customer Journey Analytics overview',   tier: 'all' },
  { id: 'destinations',   query: 'Adobe Experience Platform Destinations',      tier: 'all' },
  { id: 'brandConcierge', query: 'Adobe Brand Concierge overview',              tier: 'Advanced' },
];

/**
 * Pinned Context7 library IDs per topic — bypasses fuzzy search entirely.
 *
 * Background: Context7's fuzzy `search` endpoint returns wrong libraries for
 * several Adobe topics (e.g. `rtcdp` → polymarket trading client, `ajo` →
 * Adobe Commerce Optimizer, `brandConcierge` → GitHub Primer design system).
 * Pinning the library ID makes the per-topic fetch deterministic and lets us
 * pick the highest-trust Adobe-owned library for each topic.
 *
 * Conventions:
 *   - A string value pins the topic to that library — the service skips the
 *     `/search` call and goes straight to `/api/v1/<id>?type=txt&topic=...`.
 *   - `null` means "no usable Adobe library exists in Context7 today" — the
 *     service skips Context7 entirely and routes to STATIC_DOC_FALLBACKS.
 *
 * Keep in sync with scripts/verify-context7-coverage.mjs.
 */
const PINNED_LIBRARY_IDS = {
  // RT-CDP and Destinations are both AEP applications — share the canonical
  // Experience Platform library on experienceleague.adobe.com (trustScore 10).
  rtcdp:          '/websites/experienceleague_adobe_en_experience-platform',
  // AJO has no dedicated library in Context7; the Experience Platform docs
  // include AJO collection / personalisation / journey content as the best
  // available Adobe-owned source.
  ajo:            '/websites/experienceleague_adobe_en_experience-platform',
  // Existing match — Adobe Experience Manager Cloud Service docs cover the
  // Experience Cloud AI Assistant and agentic-AI surfaces.
  aiAgentic:      '/adobedocs/experience-manager-cloud-service.en',
  // Existing match — Customer Journey Analytics API on developer.adobe.com.
  cja:            '/websites/developer_adobe_cja-apis_api',
  // Existing match — Experience Platform docs include Destinations content.
  destinations:   '/websites/experienceleague_adobe_en_experience-platform',
  // Brand Concierge is too new — Context7 has no Adobe-owned library for it.
  // Route this topic straight to the static-summary fallback.
  brandConcierge: null,
};

/**
 * Static-summary fallback used when Context7 returns nothing useful.
 * Each summary is a short, deliberately-conservative paraphrase of the
 * public Experience League overview pages the original skill points to
 * in Step 1b. Refresh manually when Adobe ships a major capability.
 */
const STATIC_DOC_FALLBACKS = {
  rtcdp:
`Real-Time CDP unifies known and anonymous customer data into a single,
real-time profile. Capabilities include identity stitching across web, mobile,
CRM, and offline sources; streaming and batch ingestion of XDM
ExperienceEvents and Profile records; rule-based and ML-driven segmentation
that evaluates in real time at the edge or in the hub; and downstream
Activation to paid media, owned channels, and data-warehouse destinations
through the Destinations service. RT-CDP is the data foundation every other
Adobe Experience Platform application reads from.`,
  ajo:
`Adobe Journey Optimizer (AJO) is the orchestration and outbound delivery
layer on top of RT-CDP. It triggers customer journeys from real-time
ExperienceEvents (cart abandon, page view, login), enrols profiles into
multi-step journeys with wait, condition, and merge nodes, and delivers
messages on email, push, in-app, web, and SMS channels. AJO uses the unified
profile for personalisation tokens and respects centralised frequency,
quiet-hours, and consent rules. Decision Management (the offer-decisioning
engine inside AJO) selects which offer or content variant each individual
profile receives at the moment of delivery.`,
  aiAgentic:
`Adobe Experience Cloud AI is the layer of generative and agentic AI shipped
across Adobe Experience Cloud applications. The AI Assistant answers natural-
language questions about audiences, attributes, and journeys inside the
authoring UI. Customer AI and Attribution AI produce propensity scores and
journey-attribution insights surfaced to AJO and CJA. Recently Adobe has
introduced agentic capabilities that can author segments, draft journey
outlines, and generate content variants from operator prompts — always
grounded in the unified AEP profile and the brand's content / offer library.`,
  cja:
`Customer Journey Analytics (CJA) is the analytics workspace built on AEP
data. It analyses behaviour across web, mobile, offline, call-centre, and
any other source ingested into AEP, supporting cross-device journey analysis
and multi-touch attribution. Marketers use CJA Workspace to build funnel,
fallout, and flow visualisations; segments produced in CJA can be published
back to RT-CDP for re-use in AJO journeys and Destinations. CJA outputs
insights, not deliveries — never describe CJA as triggering a journey.`,
  destinations:
`The Destinations service in AEP activates real-time segments to downstream
systems. Categories include paid-media destinations (Meta, Google, TikTok,
The Trade Desk, DV360), CRM and customer-engagement platforms (Salesforce
Marketing Cloud, Braze, Marketo), email and SMS service providers, cloud
storage, and data warehouses (Snowflake, BigQuery). Activation is event-
driven once a segment qualifies a profile, and uses identity-mapping rules
to expose the right identifier to each destination.`,
  brandConcierge:
`Adobe Brand Concierge is a customer-initiated conversational AI assistant
embedded on a brand's website or app. Built on AEP Agent Orchestrator, it
reads the visitor's real-time AEP profile (segments, purchase history,
loyalty status, propensity scores) and answers natural-language questions
about the brand's catalogue using the brand's knowledge base. Conversation
intent and product affinities are written back to the unified profile as
computed attributes for downstream use. Brand Concierge is always
customer-initiated — never proactive — and only available where the customer
is on a brand-owned channel.`,
};

const SAFE_BRAND_DEFAULT = '333333';

// ─── SKILL LOADER (cold start) ───────────────────────────────────────────────

let SKILL_CACHE = null;

function loadSkill() {
  if (SKILL_CACHE) return SKILL_CACHE;
  const read = (file) => {
    try {
      return fs.readFileSync(path.join(SKILL_DIR, file), 'utf8');
    } catch (err) {
      throw new Error(
        `clientJourneyAssetV2Service: failed to read skill asset ${file} ` +
        `at ${SKILL_DIR}: ${String(err && err.message || err)}`
      );
    }
  };
  SKILL_CACHE = {
    skillServer:    read('SKILL_SERVER.md'),
    contentRules:   read('content-rules.md'),
    htmlRules:      read('html-rules.md'),
    brandConcierge: read('brand-concierge.md'),
  };
  return SKILL_CACHE;
}

// ─── BASIC HELPERS ───────────────────────────────────────────────────────────

function slugify(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'client';
}

function normaliseHex(hex, fallback = SAFE_BRAND_DEFAULT) {
  if (!hex) return fallback;
  const cleaned = String(hex).replace(/^#/, '').trim();
  return /^[0-9A-Fa-f]{6}$/.test(cleaned) ? cleaned.toUpperCase() : fallback;
}

function hexToRgb(hex) {
  const h = normaliseHex(hex);
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function darkenHex(hex, amount = 0.2) {
  const { r, g, b } = hexToRgb(hex);
  const t = (n) => Math.max(0, Math.min(255, Math.round(n * (1 - amount))));
  return [t(r), t(g), t(b)].map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const lin = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function pickReadableTextColor(brandHex) {
  // White on brand if brand is dark; near-black on brand if brand is light.
  return relativeLuminance(brandHex) < 0.45 ? '#ffffff' : '#1a1a1a';
}

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function jsonInline(value) {
  // Inlining JSON inside a <script> tag — escape closing tags + line separators.
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function setCors(res, methods = 'GET, POST, OPTIONS') {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', methods);
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Max-Age', '3600');
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return null; }
  }
  if (Buffer.isBuffer(req.body)) {
    try { return JSON.parse(req.body.toString('utf8')); } catch { return null; }
  }
  return new Promise((resolve) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (c) => { raw += c; if (raw.length > 4_000_000) req.destroy(); });
    req.on('end', () => {
      if (!raw) return resolve(null);
      try { resolve(JSON.parse(raw)); } catch { resolve(null); }
    });
    req.on('error', () => resolve(null));
  });
}

// ─── CONTEXT7 CLIENT ─────────────────────────────────────────────────────────

async function fetchWithTimeout(url, init = {}, timeoutMs = CONTEXT7_TIMEOUT_MS) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function ctx7Search(key, query) {
  const url = `${CONTEXT7_BASE}/search?query=${encodeURIComponent(query)}`;
  const res = await fetchWithTimeout(url, {
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`Context7 search HTTP ${res.status}`);
  const data = await res.json();
  const results = (data && (data.results || data.libraries)) || [];
  if (!Array.isArray(results) || results.length === 0) return null;
  const top = results[0];
  return top && (top.id || top.libraryId || top.name) || null;
}

async function ctx7Fetch(key, libraryId, topic, tokens = CONTEXT7_TOKEN_BUDGET) {
  const id = libraryId.startsWith('/') ? libraryId : `/${libraryId}`;
  const url =
    `${CONTEXT7_BASE}${id}` +
    `?type=txt&topic=${encodeURIComponent(topic)}&tokens=${tokens}`;
  const res = await fetchWithTimeout(url, {
    headers: { Authorization: `Bearer ${key}`, Accept: 'text/plain' },
  });
  if (!res.ok) throw new Error(`Context7 docs HTTP ${res.status}`);
  return res.text();
}

// ─── FIRESTORE 24h CACHE ─────────────────────────────────────────────────────

let _firestoreCache;
function getFirestore() {
  if (_firestoreCache) return _firestoreCache;
  const admin = require('firebase-admin');
  if (!admin.apps.length) admin.initializeApp();
  _firestoreCache = admin.firestore();
  return _firestoreCache;
}

function topicCacheKey(libraryId, topic, tokens) {
  const norm = libraryId || 'unresolved';
  return crypto
    .createHash('sha1')
    .update(`${norm}|${topic}|${tokens}`)
    .digest('hex');
}

async function readDocCache(cacheKey) {
  try {
    const db = getFirestore();
    const doc = await db.collection(FIRESTORE_DOC_CACHE_COLLECTION).doc(cacheKey).get();
    if (!doc.exists) return null;
    const v = doc.data() || {};
    if (!v.expiresAtMs || v.expiresAtMs < Date.now()) return null;
    if (typeof v.snippets !== 'string' || !v.snippets.trim()) return null;
    return v;
  } catch (err) {
    console.warn(`[client-journey-v2] cache read failed (${cacheKey}): ${err.message || err}`);
    return null;
  }
}

async function writeDocCache(cacheKey, payload) {
  try {
    const db = getFirestore();
    await db.collection(FIRESTORE_DOC_CACHE_COLLECTION).doc(cacheKey).set({
      ...payload,
      fetchedAtMs: Date.now(),
      expiresAtMs: Date.now() + DOC_CACHE_TTL_MS,
    });
  } catch (err) {
    console.warn(`[client-journey-v2] cache write failed (${cacheKey}): ${err.message || err}`);
  }
}

/**
 * Resolve one Experience League topic. Source order:
 *   1. If `PINNED_LIBRARY_IDS[topic]` is `null` → STATIC_DOC_FALLBACKS
 *      (intentional: no usable Adobe library exists in Context7 today).
 *   2. Firestore cache (24 h) — key includes the pinned library id so a
 *      future change of pinned id naturally invalidates old entries.
 *   3. If pinned id is set → fetch directly from
 *      GET /api/v1/<pinnedId>?type=txt&topic=<query>&tokens=<n>.
 *      If pinned id is `undefined` (topic absent from PINNED_LIBRARY_IDS) →
 *      legacy behaviour: fuzzy `/search` first, then docs fetch.
 *   4. STATIC_DOC_FALLBACKS as the final safety net.
 * Always returns { source: 'cache' | 'context7' | 'fallback', text }.
 */
async function resolveTopic(key, topic) {
  const hasPin = Object.prototype.hasOwnProperty.call(PINNED_LIBRARY_IDS, topic.id);
  const pinnedId = hasPin ? PINNED_LIBRARY_IDS[topic.id] : undefined;

  // (1) Deliberately route to the static summary when a topic is pinned to null.
  if (hasPin && pinnedId === null) {
    return {
      source: 'fallback',
      text: STATIC_DOC_FALLBACKS[topic.id] || '',
      libraryId: null,
      topicId: topic.id,
    };
  }

  // (2) Cache key includes the pinned id (or a query-derived synthetic id when
  // unpinned) so changing the pinned id invalidates old entries naturally.
  const cacheLibSlug = pinnedId || `query:${topic.query}`;
  const cacheKey = topicCacheKey(cacheLibSlug, topic.query, CONTEXT7_TOKEN_BUDGET);
  const cached = await readDocCache(cacheKey);
  if (cached) {
    return {
      source: 'cache',
      text: cached.snippets,
      libraryId: cached.libraryId || pinnedId || null,
      topicId: topic.id,
    };
  }

  if (key) {
    try {
      // (3) Pinned id present → skip /search; go straight to docs fetch.
      // No pinned id → fall back to legacy fuzzy /search → docs fetch flow.
      const libraryId = pinnedId || (await ctx7Search(key, topic.query));
      if (libraryId) {
        const snippets = await ctx7Fetch(key, libraryId, topic.query, CONTEXT7_TOKEN_BUDGET);
        if (snippets && snippets.length >= 100) {
          await writeDocCache(cacheKey, {
            libraryId,
            topic: topic.query,
            tokens: CONTEXT7_TOKEN_BUDGET,
            snippets,
          });
          return { source: 'context7', text: snippets, libraryId, topicId: topic.id };
        }
      }
    } catch (err) {
      console.warn(
        `[client-journey-v2] Context7 fetch failed for ${topic.id} (${topic.query}): ` +
        `${err.message || err}`
      );
    }
  }

  // (4) Final safety net — static summary.
  const fallback = STATIC_DOC_FALLBACKS[topic.id] || '';
  return { source: 'fallback', text: fallback, libraryId: pinnedId || null, topicId: topic.id };
}

async function fetchExperienceLeagueContext(tier, key) {
  const topics = CONTEXT7_TOPICS.filter((t) => t.tier === 'all' || t.tier === tier);
  const results = await Promise.all(topics.map((t) => resolveTopic(key, t)));
  return results.map((r) => {
    const meta = CONTEXT7_TOPICS.find((t) => t.id === r.topicId) || {};
    return {
      id: r.topicId,
      title: meta.query,
      source: r.source,
      libraryId: r.libraryId,
      text: r.text,
    };
  });
}

// ─── PROMPT BUILDERS ─────────────────────────────────────────────────────────

function buildSystemPrompt(tier) {
  const skill = loadSkill();
  const sections = [
    skill.skillServer,
    '\n\n---\n\n## CONTENT RULES (verbatim from skill references/content-rules.md)\n\n',
    skill.contentRules,
    '\n\n---\n\n## HTML RULES (verbatim from skill references/html-rules.md)\n\n',
    skill.htmlRules,
  ];
  if (tier === 'Advanced') {
    sections.push(
      '\n\n---\n\n## BRAND CONCIERGE (verbatim from skill references/brand-concierge.md)\n\n',
      skill.brandConcierge
    );
  }
  return sections.join('');
}

function buildUserPrompt(input, snippets, research) {
  const parts = [];
  parts.push('### REQUEST INPUT');
  parts.push(JSON.stringify({
    client: input.client,
    clientDomain: input.clientDomain || '',
    brandColor: input.brandColor,
    journeyType: input.journeyType || '',
    personaName: input.personaName || '',
    personaGender: input.personaGender || 'female',
    marketerPersonaName: input.marketerPersonaName || '',
    tier: input.tier,
    techStack: input.techStack || '',
    additionalContext: input.additionalContext || '',
  }, null, 2));
  parts.push('');
  parts.push('### CONTEXT7 EXPERIENCE LEAGUE SNIPPETS');
  for (const s of snippets) {
    parts.push(`#### ${s.title}  (source: ${s.source})`);
    parts.push(s.text);
    parts.push('');
  }
  parts.push('');

  // Live research output from the upstream Google Search-grounded
  // research pass (call 1 of the two-call flow). Only present when the
  // research pass actually returned something — on grounding failure we
  // fall through with empty strings and the generation pass continues.
  const techResearch  = (research && research.techStackResearch) || '';
  const adobeResearch = (research && research.adobeFreshness)    || '';
  const hasResearch = Boolean(techResearch.trim() || adobeResearch.trim());
  if (hasResearch) {
    parts.push('### LIVE RESEARCH (FROM GOOGLE SEARCH GROUNDING)');
    parts.push(
      'These bullets come from a separate, just-run Gemini call with ' +
      'Google Search grounding ENABLED. Treat them as authoritative ' +
      'when populating the TECH row and when surfacing recent Adobe ' +
      'agentic / AI capability bullets. Carry the [confirmed] / [assumed] ' +
      'tags through verbatim into the TECH bullets — do not soften them. ' +
      'If a bullet lists a citation like "(builtwith.com)", keep the ' +
      'platform name but drop the parenthetical URL when emitting JSON.'
    );
    parts.push('');
    if (techResearch.trim()) {
      parts.push('#### Tech stack research');
      parts.push(techResearch.trim());
      parts.push('');
    }
    if (adobeResearch.trim()) {
      parts.push('#### Recent Adobe capability freshness');
      parts.push(adobeResearch.trim());
      parts.push('');
    }
  }

  parts.push('### CLIENT TECH RESEARCH INSTRUCTIONS');
  if (input.techStack && input.techStack.trim()) {
    parts.push(
      'The operator provided a starting tech stack below. Use it as the spine ' +
      'of the TECH row. Mark the operator-supplied entries as `[confirmed]`. ' +
      'You may add additional likely platforms (CRM, ESP, paid media, analytics) ' +
      'inferred from the journey type and client sector and label those `[assumed]`.\n\n' +
      'Operator-supplied tech stack (one per line):\n' +
      String(input.techStack).trim()
    );
  } else if (hasResearch && techResearch.trim()) {
    parts.push(
      'The operator did NOT supply a tech stack. Use the bullets under ' +
      '"Tech stack research" above as the spine of the TECH row — they ' +
      'were produced by a Google Search-grounded research pass run ' +
      'immediately before this call. Carry the [confirmed] / [assumed] ' +
      'tags through verbatim. Do not invent additional platform names ' +
      'beyond what the research surfaced unless they are obvious sector ' +
      'standards (and label those [assumed]).'
    );
  } else {
    // Research pass either failed or was skipped AND operator left the
    // textarea blank. Fall back to a sector-inferred TECH row, clearly
    // labelled, rather than failing the whole generation.
    parts.push(
      'The operator did NOT supply a tech stack and the upstream ' +
      'research pass returned no tech-stack bullets. Infer 4–6 likely ' +
      'marketing technology platforms (CRM, ESP, paid media, analytics, ' +
      'CMS / commerce) from the client sector and tier, and tag each ' +
      'one `[assumed]`. Do NOT use `[confirmed]` for any bullet in this ' +
      'fallback case.'
    );
  }
  parts.push('');
  parts.push('### OUTPUT REQUIREMENT');
  parts.push(
    'Respond with one JSON object matching the schema in the system prompt. ' +
    'No markdown, no commentary, no fences. Run the eight self-scans silently ' +
    'before emitting and fix any flag.'
  );
  return parts.join('\n');
}

function buildRefineUserPrompt(input, snippets, refinePrompt, existingJourney) {
  const parts = [];
  parts.push('### REFINE REQUEST INPUT');
  parts.push(JSON.stringify({
    client: input.client,
    clientDomain: input.clientDomain || '',
    brandColor: input.brandColor,
    journeyType: input.journeyType || '',
    personaName: input.personaName || '',
    personaGender: input.personaGender || 'female',
    marketerPersonaName: input.marketerPersonaName || '',
    tier: input.tier,
    techStack: input.techStack || '',
    additionalContext: input.additionalContext || '',
  }, null, 2));
  parts.push('');
  parts.push('### USER REFINEMENT PROMPT');
  parts.push(String(refinePrompt || '').trim());
  parts.push('');
  parts.push('### CURRENT JOURNEY JSON (MUST BE UPDATED, NOT REBUILT FROM SCRATCH)');
  parts.push(JSON.stringify(existingJourney, null, 2));
  parts.push('');
  parts.push('### CONTEXT7 EXPERIENCE LEAGUE SNIPPETS');
  for (const s of snippets) {
    parts.push(`#### ${s.title}  (source: ${s.source})`);
    parts.push(s.text);
    parts.push('');
  }
  parts.push('');
  parts.push('### REFINEMENT REQUIREMENTS');
  parts.push(
    'Apply only the requested edits while preserving untouched structure, order, and schema rules. ' +
    'Keep a strict 12-step journey plus overview (13 slides total), keep required arrays and fields, ' +
    'maintain tier constraints (Foundation vs Advanced), and keep Context7 / Experience League alignment. ' +
    'Do not remove required slide, row, or tech/adobe/data sections unless explicitly requested and still schema-valid.'
  );
  parts.push('');
  parts.push('### OUTPUT REQUIREMENT');
  parts.push(
    'Respond with one JSON object matching the schema in the system prompt. ' +
    'No markdown, no commentary, no fences. Run the eight self-scans silently before emitting and fix any flag.'
  );
  return parts.join('\n');
}

// ─── TWO-CALL FLOW (research + generation) ───────────────────────────────────
//
// Vertex AI rejects `tools: [{ googleSearch: {} }]` combined with
// `responseMimeType: 'application/json'` / `responseSchema` (HTTP 400
// "controlled generation is not supported with Search tool"). To keep
// both Google Search grounding AND a strict-schema journey JSON, we run
// two sequential Gemini calls:
//
//   Call 1 — runResearchPass:    grounding ON,  free text out, 2k tokens.
//   Call 2 — runGenerationPass:  no tools,      controlled JSON out, 24k tokens.
//
// The research output is appended to call 2's user prompt under a clearly
// labelled section so Gemini treats it as authoritative for TECH bullets.

const RESEARCH_SYSTEM_PROMPT =
  'You are a senior MarTech research assistant for an Adobe Experience ' +
  'Cloud architect. You have Google Search grounding enabled. Return ONLY ' +
  'a markdown response in two clearly headed sections — no prose intro, ' +
  'no closing summary, no code fences. Use the EXACT section headings ' +
  'requested in the user message. Inside each section, output a flat ' +
  'bulleted list (one bullet per line, dash prefix). Tag each tech-stack ' +
  'bullet [confirmed] when you found a credible public source for it, ' +
  '[assumed] when you inferred it from sector / journey type. Do not ' +
  'invent specific platform names without a basis. Keep each bullet under ' +
  '180 characters. Never emit JSON in this pass.';

function buildResearchUserPrompt(input, opts) {
  const wantsTechStack = !!(opts && opts.wantsTechStack);
  const parts = [];
  parts.push('### REQUEST CONTEXT');
  parts.push(JSON.stringify({
    client: input.client,
    clientDomain: input.clientDomain || '',
    journeyType: input.journeyType || '',
    tier: input.tier,
  }, null, 2));
  parts.push('');
  parts.push(
    'Use Google Search grounding aggressively. Two sections required, ' +
    'in this exact order, with these exact headings:'
  );
  parts.push('');

  if (wantsTechStack) {
    parts.push('## TECH_STACK_RESEARCH');
    parts.push(
      'Bullet list of 5–10 marketing-technology platforms ' +
      JSON.stringify(input.client) +
      ' actually uses today: CRM, ESP / marketing automation, paid-media ' +
      'platforms, web analytics, CMS / commerce, CDP, and any in-house ' +
      'data warehouse or activation tooling. Prefer credible sources ' +
      '(BuiltWith, the company\'s engineering / careers page, vendor ' +
      'case studies, recent press releases, LinkedIn job postings for ' +
      'martech roles). Format: "- PlatformName — one-line role [confirmed|assumed] (source: short-domain.com)". ' +
      'When grounding cannot find a source for a platform you suspect, ' +
      'tag it [assumed] and skip the (source:) suffix. Skip platforms ' +
      'that are merely speculative.'
    );
    parts.push('');
  } else {
    parts.push('## TECH_STACK_RESEARCH');
    parts.push(
      '(intentionally skipped — operator supplied an explicit tech-stack ' +
      'list on the form. Output the heading then the literal string ' +
      '"_skipped_" so the downstream parser stays happy.)'
    );
    parts.push('');
  }

  parts.push('## ADOBE_FRESHNESS');
  parts.push(
    'Bullet list of any Adobe Experience Platform / Journey Optimizer / ' +
    'Customer Journey Analytics / Brand Concierge / Agent Orchestrator ' +
    'features released or materially updated in the LAST 6 MONTHS that ' +
    'are relevant to a journey of type ' +
    JSON.stringify(input.journeyType || 'general acquisition / engagement / retention') +
    ' for a ' + JSON.stringify(input.tier) + '-tier deployment. Prefer ' +
    'announcements on business.adobe.com, Adobe Summit / Adobe MAX news ' +
    'pages, blog.adobe.com, and Experience League "What\'s new" pages. ' +
    'Format: "- FeatureName — one-line capability summary (source: short-domain.com, Mon YYYY)". ' +
    'If grounding surfaces nothing material, output the literal string ' +
    '"_no recent material updates_" under this heading and stop. Do not ' +
    'invent feature names.'
  );

  return parts.join('\n');
}

/**
 * Parse the research-pass markdown into two named sections.
 *
 * The model is instructed to use exact `## TECH_STACK_RESEARCH` and
 * `## ADOBE_FRESHNESS` headings, but Gemini occasionally adds a leading
 * `# Research output` H1 or wraps in fences — strip both defensively.
 */
function parseResearchSections(raw) {
  const text = String(raw || '');
  const stripped = stripJsonFences(text); // also strips ```text ...``` fences
  const result = { techStackResearch: '', adobeFreshness: '' };

  // Find headings using a tolerant regex — accept `## TECH_STACK_RESEARCH`,
  // `**TECH_STACK_RESEARCH**`, or just `TECH_STACK_RESEARCH:` on its own line.
  const techRe = /(?:^|\n)\s*(?:#+\s*|\*\*\s*)?TECH[_ ]STACK[_ ]RESEARCH(?:\s*\*\*)?\s*:?\s*\n([\s\S]*?)(?=(?:\n\s*(?:#+\s*|\*\*\s*)?ADOBE[_ ]FRESHNESS)|$)/i;
  const adobeRe = /(?:^|\n)\s*(?:#+\s*|\*\*\s*)?ADOBE[_ ]FRESHNESS(?:\s*\*\*)?\s*:?\s*\n([\s\S]*)$/i;

  const techMatch  = techRe.exec(stripped);
  const adobeMatch = adobeRe.exec(stripped);

  if (techMatch && techMatch[1]) {
    const body = techMatch[1].trim();
    if (body && !/^_skipped_$/i.test(body)) result.techStackResearch = body;
  }
  if (adobeMatch && adobeMatch[1]) {
    const body = adobeMatch[1].trim();
    if (body && !/^_no recent material updates_$/i.test(body)) result.adobeFreshness = body;
  }
  // Fallback: no headings at all → put the whole body under techStackResearch
  // so the generation pass at least sees the grounded bullets.
  if (!result.techStackResearch && !result.adobeFreshness && stripped.trim()) {
    result.techStackResearch = stripped.trim();
  }
  return result;
}

async function runResearchPass(input) {
  const wantsTechStack = !(input.techStack && input.techStack.trim());
  const userPrompt = buildResearchUserPrompt(input, { wantsTechStack });
  const t0 = Date.now();
  let raw = '';
  try {
    raw = await callGeminiResearch(RESEARCH_SYSTEM_PROMPT, userPrompt, {
      // Defaults from callGeminiResearch are temperature 0.4, maxOutputTokens 2048,
      // tools [{ googleSearch: {} }], jsonMode false, allowTruncation true.
      // 30s retry buys one ride through a transient grounding 429.
      retryOn429: true,
      retryOn429Attempts: 1,
      retryOn429DelayMs: 30_000,
    });
  } catch (err) {
    const ms = Date.now() - t0;
    console.warn(
      `[cjv2] research pass failed after ${ms}ms — continuing without ` +
      `grounded research. wantsTechStack=${wantsTechStack}. ` +
      `error=${err && err.message || err}`
    );
    return {
      ms,
      wantsTechStack,
      techStackResearch: '',
      adobeFreshness: '',
      raw: '',
      error: String(err && err.message || err),
    };
  }
  const ms = Date.now() - t0;
  const parsed = parseResearchSections(raw);
  console.log(
    `[cjv2] research pass`,
    {
      ms,
      tookGrounding: Boolean((parsed.techStackResearch || parsed.adobeFreshness).trim()),
      wantsTechStack,
      rawChars: String(raw || '').length,
      techChars: parsed.techStackResearch.length,
      freshChars: parsed.adobeFreshness.length,
    }
  );
  return {
    ms,
    wantsTechStack,
    techStackResearch: parsed.techStackResearch,
    adobeFreshness: parsed.adobeFreshness,
    raw,
  };
}

/**
 * Strip Markdown JSON fences and surrounding whitespace from a raw
 * Gemini response. Tolerant of:
 *   - Plain JSON (no fence)        → trimmed
 *   - ```json … ``` complete fence → fenced contents trimmed
 *   - ```json … (no closing fence) → opening stripped, body trimmed
 *   - Bare ``` … ``` fences        → contents trimmed
 *
 * Controlled-generation Gemini calls SHOULD never emit fences, but we
 * have observed it in the wild when the model decides to add a leading
 * "```json\n" anyway, so we strip defensively before strict parsing.
 */
function stripGenerationFences(raw) {
  if (!raw) return '';
  let s = String(raw).trim();
  const completeFence = /^```(?:json)?\s*([\s\S]*?)\s*```\s*$/i.exec(s);
  if (completeFence) return completeFence[1].trim();
  const openingFence = /^```(?:json)?\s*([\s\S]*)$/i.exec(s);
  if (openingFence) {
    return openingFence[1].replace(/```\s*$/i, '').trim();
  }
  return s;
}

/**
 * Parse the Gemini generation-pass response into a journey object,
 * with three layers of resilience against minor model JSON hiccups:
 *
 *   (1) Strip Markdown fences + whitespace, then try strict JSON.parse.
 *   (2) On SyntaxError, run jsonrepair (handles missing colons,
 *       trailing commas, single quotes, smart quotes, unescaped
 *       newlines) and re-parse. Log the repair, log a head/tail
 *       preview of the original raw output to Cloud Logs.
 *   (3) On repair failure, if the caller supplied `retryFn`, invoke
 *       it once with the original SyntaxError so the caller can ask
 *       Gemini to self-correct, then run the same strict + repair
 *       flow on the retry response.
 *
 * Throws an Error with `code === 'CJV2_JSON_PARSE_FAILED'` and a safe
 * `details` object (no PII — only the parse-error message, position,
 * and which mitigations were tried) when every mitigation fails.
 *
 * Returns `{ journey, repaired, retried }` where `repaired` and
 * `retried` are booleans the caller can surface for observability.
 *
 * @param {string} raw — raw Gemini response text (call returns a string).
 * @param {{ retryFn?: (firstErr: Error) => Promise<string> }} [opts]
 */
function isJourneyShapedObject(v) {
  // The downstream pipeline expects a non-null object (it later reads
  // `.meta`, `.slides`, etc.). jsonrepair is permissive enough to wrap
  // raw garbage like `<<< not json >>>` into a quoted string, which
  // would technically `JSON.parse` cleanly but is useless to us — so we
  // treat anything that isn't a non-null, non-array object as a parse
  // failure and let the repair / retry path try again.
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

async function parseGenerationJson(raw, opts = {}) {
  const retryFn = opts && typeof opts.retryFn === 'function' ? opts.retryFn : null;
  const cleaned = stripGenerationFences(raw);

  try {
    const parsed = JSON.parse(cleaned);
    if (!isJourneyShapedObject(parsed)) {
      // Synthesise a SyntaxError so the repair / retry path engages.
      const e = new SyntaxError(
        `parsed value is not a JSON object (got ${parsed === null ? 'null' : Array.isArray(parsed) ? 'array' : typeof parsed})`
      );
      throw e;
    }
    return { journey: parsed, repaired: false, retried: false };
  } catch (firstErr) {
    if (!(firstErr instanceof SyntaxError)) throw firstErr;

    // Cloud-Logs-only preview of the raw model output so future parse
    // failures have something to post-mortem against. NEVER include
    // this in the HTTP response — it can be tens of kilobytes.
    console.warn('[cjv2] raw JSON parse failed — head/tail preview', {
      head: cleaned.slice(0, 2000),
      tail: cleaned.slice(-500),
      totalChars: cleaned.length,
    });

    const firstPosition = (firstErr && Object.prototype.hasOwnProperty.call(firstErr, 'position'))
      ? firstErr.position
      : null;

    // Pass 1 mitigation — jsonrepair on the original cleaned response.
    const originalLen = cleaned.length;
    try {
      const repairedStr = jsonrepair(cleaned);
      const journey = JSON.parse(repairedStr);
      if (!isJourneyShapedObject(journey)) {
        // jsonrepair "succeeded" by wrapping garbage in quotes — useless.
        throw new SyntaxError(
          'jsonrepair produced a non-object value ' +
          `(got ${journey === null ? 'null' : Array.isArray(journey) ? 'array' : typeof journey})`
        );
      }
      console.warn('[cjv2] generation JSON repaired', {
        originalLen,
        repairedLen: repairedStr.length,
        syntaxErrorAt: firstErr.message,
      });
      return { journey, repaired: true, retried: false };
    } catch (repairErr) {
      console.warn('[cjv2] jsonrepair failed on initial response', {
        firstError: firstErr.message,
        repairError: String(repairErr && repairErr.message || repairErr),
      });
    }

    // Pass 2 mitigation — one-shot retry, asking Gemini to self-correct.
    if (!retryFn) {
      const e = new Error('Gemini returned malformed JSON and no retry was attempted');
      e.code = 'CJV2_JSON_PARSE_FAILED';
      e.details = {
        firstError: firstErr.message,
        position: firstPosition,
        repairTried: true,
        retryTried: false,
      };
      throw e;
    }

    let retryRaw;
    try {
      retryRaw = await retryFn(firstErr);
    } catch (retryCallErr) {
      const e = new Error('Gemini retry call failed after malformed JSON');
      e.code = 'CJV2_JSON_PARSE_FAILED';
      e.details = {
        firstError: firstErr.message,
        position: firstPosition,
        repairTried: true,
        retryTried: true,
        retryCallError: String(retryCallErr && retryCallErr.message || retryCallErr),
      };
      throw e;
    }

    const cleanedRetry = stripGenerationFences(retryRaw);
    try {
      const parsedRetry = JSON.parse(cleanedRetry);
      if (!isJourneyShapedObject(parsedRetry)) {
        throw new SyntaxError(
          `retry parsed value is not a JSON object (got ${parsedRetry === null ? 'null' : Array.isArray(parsedRetry) ? 'array' : typeof parsedRetry})`
        );
      }
      return { journey: parsedRetry, repaired: false, retried: true };
    } catch (secondParseErr) {
      if (!(secondParseErr instanceof SyntaxError)) throw secondParseErr;
      console.warn('[cjv2] retry response JSON parse failed — head/tail preview', {
        head: cleanedRetry.slice(0, 2000),
        tail: cleanedRetry.slice(-500),
        totalChars: cleanedRetry.length,
        firstError: firstErr.message,
        secondError: secondParseErr.message,
      });
      // Last-ditch: jsonrepair the retry response before giving up.
      try {
        const repairedRetry = jsonrepair(cleanedRetry);
        const journey = JSON.parse(repairedRetry);
        if (!isJourneyShapedObject(journey)) {
          throw new SyntaxError(
            'jsonrepair produced a non-object value on retry ' +
            `(got ${journey === null ? 'null' : Array.isArray(journey) ? 'array' : typeof journey})`
          );
        }
        console.warn('[cjv2] retry response JSON repaired', {
          originalLen: cleanedRetry.length,
          repairedLen: repairedRetry.length,
          firstError: firstErr.message,
          secondError: secondParseErr.message,
        });
        return { journey, repaired: true, retried: true };
      } catch (finalRepairErr) {
        void finalRepairErr;
        const e = new Error('Gemini returned malformed JSON after repair + retry');
        e.code = 'CJV2_JSON_PARSE_FAILED';
        e.details = {
          firstError: firstErr.message,
          position: firstPosition,
          repairTried: true,
          retryTried: true,
        };
        throw e;
      }
    }
  }
}

async function runGenerationPass(input, snippets, research) {
  const systemPrompt = buildSystemPrompt(input.tier);
  const baseUserPrompt = buildUserPrompt(input, snippets, research);
  const t0 = Date.now();

  // The retry path appends a short corrective note to the user prompt
  // so Gemini knows the previous response was malformed and what the
  // failure looked like. Everything else (system prompt, schema-less
  // JSON mode, max tokens, temperature) stays identical so we don't
  // shift the response distribution.
  const call = (extra = '') => callGemini(systemPrompt, baseUserPrompt + extra, {
    maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
    temperature: GEMINI_TEMPERATURE,
    jsonMode: true,
    retryOn429: true,
    retryOn429Attempts: 1,
    // NO tools here — this call uses controlled JSON output.
    // Mixing tools + responseMimeType:'application/json' is rejected
    // by Vertex AI (see vertexClient.js comment on the `tools` opt).
  });

  const firstRaw = await call();
  let parseResult;
  try {
    parseResult = await parseGenerationJson(firstRaw, {
      retryFn: async (firstErr) => {
        const pos = (firstErr && Object.prototype.hasOwnProperty.call(firstErr, 'position'))
          ? firstErr.position
          : null;
        const positionHint = (pos != null) ? ` around position ${pos}` : '';
        const errMsg = (firstErr && firstErr.message) ? firstErr.message : 'unknown';
        const repairHint =
          '\n\n### RETRY NOTE\n' +
          `Your previous response had a JSON syntax error${positionHint}. ` +
          `The parser reported: "${errMsg}". ` +
          'Return ONLY valid JSON matching the schema in the system prompt — ' +
          'no prose, no markdown, no code fences, no trailing commas, no comments. ' +
          'Double-check every property name is followed by a colon, every string ' +
          'is double-quoted, and every array / object is closed.';
        console.warn('[cjv2] generation JSON parse retry — asking Gemini to self-correct', {
          firstError: errMsg,
          position: pos,
        });
        return call(repairHint);
      },
    });
  } catch (e) {
    const ms = Date.now() - t0;
    console.warn('[cjv2] generation pass failed', {
      ms,
      code: e && e.code,
      details: e && e.details,
      rawChars: String(firstRaw || '').length,
    });
    throw e;
  }

  const ms = Date.now() - t0;
  const journey = parseResult.journey;
  const slideCount = (journey && Array.isArray(journey.slides)) ? journey.slides.length : 0;
  console.log('[cjv2] generation pass', {
    ms,
    slideCount,
    retried: parseResult.retried,
    repaired: parseResult.repaired,
  });
  return {
    journey,
    raw: firstRaw,
    ms,
    retried: parseResult.retried,
    repaired: parseResult.repaired,
  };
}

async function runRefinementPass(input, snippets, refinePrompt, existingJourney) {
  const systemPrompt = buildSystemPrompt(input.tier);
  const baseUserPrompt = buildRefineUserPrompt(input, snippets, refinePrompt, existingJourney);
  const t0 = Date.now();
  const call = (extra = '') => callGemini(systemPrompt, baseUserPrompt + extra, {
    maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
    temperature: GEMINI_TEMPERATURE,
    jsonMode: true,
    retryOn429: true,
    retryOn429Attempts: 1,
  });
  const firstRaw = await call();
  let parseResult;
  try {
    parseResult = await parseGenerationJson(firstRaw, {
      retryFn: async (firstErr) => {
        const pos = (firstErr && Object.prototype.hasOwnProperty.call(firstErr, 'position'))
          ? firstErr.position
          : null;
        const positionHint = (pos != null) ? ` around position ${pos}` : '';
        const errMsg = (firstErr && firstErr.message) ? firstErr.message : 'unknown';
        const repairHint =
          '\n\n### RETRY NOTE\n' +
          `Your previous response had a JSON syntax error${positionHint}. ` +
          `The parser reported: "${errMsg}". ` +
          'Return ONLY valid JSON matching the schema in the system prompt — ' +
          'no prose, no markdown, no code fences, no trailing commas, no comments.';
        return call(repairHint);
      },
    });
  } catch (e) {
    const ms = Date.now() - t0;
    console.warn('[cjv2] refinement pass failed', {
      ms,
      code: e && e.code,
      details: e && e.details,
      rawChars: String(firstRaw || '').length,
    });
    throw e;
  }
  return {
    journey: parseResult.journey,
    ms: Date.now() - t0,
    retried: parseResult.retried,
    repaired: parseResult.repaired,
  };
}

// ─── INPUT VALIDATION ────────────────────────────────────────────────────────

function normaliseInput(raw) {
  const body = (raw && typeof raw === 'object') ? raw : {};
  const tier = body.tier === 'Advanced' ? 'Advanced' : 'Foundation';
  const personaGender = body.personaGender === 'male' ? 'male' : 'female';
  const client = String(body.client || '').trim();
  if (!client) throw new Error('client is required');
  return {
    client,
    clientSlug: slugify(client),
    clientDomain: String(body.clientDomain || '').trim(),
    brandColor: normaliseHex(body.brandColor),
    journeyType: String(body.journeyType || '').trim(),
    personaName: String(body.personaName || '').trim(),
    personaGender,
    marketerPersonaName: String(body.marketerPersonaName || '').trim(),
    tier,
    techStack: String(body.techStack || ''),
    additionalContext: String(body.additionalContext || ''),
  };
}

function normaliseRefineInput(raw) {
  const body = (raw && typeof raw === 'object') ? raw : {};
  const journey = body.journey;
  const refinePrompt = String(body.refinePrompt || '').trim();
  if (!journey || typeof journey !== 'object' || Array.isArray(journey)) {
    throw new Error('journey object is required');
  }
  if (!refinePrompt) {
    throw new Error('refinePrompt is required');
  }

  const meta = (journey.meta && typeof journey.meta === 'object') ? journey.meta : {};
  const context = (body.context && typeof body.context === 'object') ? body.context : {};
  const tier = context.tier === 'Advanced' || meta.tier === 'Advanced' ? 'Advanced' : 'Foundation';
  const client = String(context.client || meta.client || '').trim();
  if (!client) throw new Error('context.client (or journey.meta.client) is required');

  return {
    refinePrompt,
    journey,
    context: {
      client,
      clientSlug: slugify(client),
      clientDomain: String(context.clientDomain || meta.clientDomain || '').trim(),
      brandColor: normaliseHex(context.brandColor || meta.brandColor),
      journeyType: String(context.journeyType || meta.journeyType || '').trim(),
      personaName: String(context.personaName || meta.personaName || '').trim(),
      personaGender: context.personaGender === 'male' || meta.personaGender === 'male' ? 'male' : 'female',
      marketerPersonaName: String(context.marketerPersonaName || meta.marketerPersonaName || '').trim(),
      tier,
      techStack: String(context.techStack || ''),
      additionalContext: String(context.additionalContext || ''),
    },
  };
}

// ─── JOURNEY VALIDATION ──────────────────────────────────────────────────────

function validateJourney(j, tier) {
  const errs = [];
  const has = (cond, msg) => { if (!cond) errs.push(msg); };

  has(j && typeof j === 'object', 'response is not an object');
  if (!j) return errs;

  has(j.meta && typeof j.meta === 'object', 'missing meta object');
  has(Array.isArray(j.stepLabels) && j.stepLabels.length === 12, 'stepLabels must have 12 entries');
  has(Array.isArray(j.descriptions) && j.descriptions.length === 13, 'descriptions must have 13 entries');
  if (Array.isArray(j.descriptions) && j.descriptions.length === 13) {
    has(j.descriptions[2] === '', 'descriptions[2] must be the empty string');
  }
  has(Array.isArray(j.pptxData)  && j.pptxData.length  === 12, 'pptxData must have 12 entries');
  has(Array.isArray(j.pptxAdobe) && j.pptxAdobe.length === 12, 'pptxAdobe must have 12 entries');
  has(Array.isArray(j.pptxTech)  && j.pptxTech.length  === 12, 'pptxTech must have 12 entries');
  has(Array.isArray(j.slides)    && j.slides.length    === 13, 'slides must have 13 entries (overview + 12 steps)');
  if (Array.isArray(j.slides) && j.slides.length === 13) {
    has(j.slides[0].activeNode === -1, 'slides[0].activeNode must be -1 (overview)');
    for (let i = 1; i < 13; i++) {
      has(j.slides[i] && j.slides[i].activeNode === i - 1, `slides[${i}].activeNode must be ${i - 1}`);
    }
    if (tier === 'Foundation') {
      for (let i = 0; i < 13; i++) {
        const s = j.slides[i] || {};
        has(
          (!s.decisioning || s.decisioning.length === 0) &&
          (!s.decisioningActive || s.decisioningActive.length === 0),
          `Foundation tier — slides[${i}].decisioning must be empty`
        );
      }
    }
  }
  has(Array.isArray(j.icons) && j.icons.length === 12, 'icons must have 12 entries');

  return errs;
}

function normaliseJourneyDescriptions(journey, logFn) {
  if (!journey || typeof journey !== 'object' || !Array.isArray(journey.descriptions)) return;

  const source = journey.descriptions.map((item) => (item == null ? '' : String(item)));
  const sourceLen = source.length;

  // Keep strict failure for genuinely incomplete payloads.
  if (sourceLen < 12) {
    journey.descriptions = source;
    return;
  }

  if (sourceLen === 12) {
    journey.descriptions = [
      source[0] || '',
      source[1] || '',
      '',
      ...source.slice(2, 12),
    ];
    if (typeof logFn === 'function') {
      logFn('[cjv2] normalized descriptions from 12->13 by inserting merge placeholder at index 2');
    }
    return;
  }

  const hasMergePlaceholder = source[2] === '';
  const orderedStepDescriptions = hasMergePlaceholder
    ? [source[0] || '', source[1] || '', ...source.slice(3)]
    : source.slice();

  if (orderedStepDescriptions.length < 12) {
    journey.descriptions = source;
    return;
  }

  const rebuilt = [
    orderedStepDescriptions[0] || '',
    orderedStepDescriptions[1] || '',
    '',
    ...orderedStepDescriptions.slice(2, 12),
  ];

  const changed = rebuilt.length !== source.length || rebuilt.some((value, idx) => value !== source[idx]);
  journey.descriptions = rebuilt;

  if (!changed || typeof logFn !== 'function') return;

  if (sourceLen === 13 && source[2] !== '') {
    const dropped = source[12] ? ' (dropped trailing non-placeholder entry)' : '';
    logFn(`[cjv2] normalized descriptions from 13->13 by forcing merge placeholder at index 2 and realigning step order${dropped}`);
    return;
  }

  if (sourceLen > 13) {
    logFn(`[cjv2] normalized descriptions from ${sourceLen}->13 by preserving step mapping and trimming extras`);
  }
}

function fillIconDefaults(icons) {
  const out = Array.isArray(icons) ? icons.slice(0, 12) : [];
  for (let i = out.length; i < 12; i++) out.push(DEFAULT_STEP_ICONS[i]);
  return out;
}

// ─── STANDALONE HTML RENDERER ────────────────────────────────────────────────

function femaleAvatarSvg(brand) {
  return `<svg class="persona-avatar" width="90" height="90" viewBox="0 0 80 80">
    <circle cx="40" cy="40" r="40" fill="#${brand}"/>
    <ellipse cx="40" cy="72" rx="24" ry="14" fill="#2a2a2a"/>
    <rect x="35" y="52" width="10" height="8" rx="2" fill="#e8c9a0"/>
    <ellipse cx="40" cy="44" rx="16" ry="17" fill="#e8c9a0"/>
    <ellipse cx="40" cy="30" rx="16" ry="8" fill="#3d2b1f"/>
    <ellipse cx="24" cy="40" rx="4" ry="10" fill="#3d2b1f"/>
    <ellipse cx="56" cy="40" rx="4" ry="10" fill="#3d2b1f"/>
    <circle cx="34" cy="43" r="2.5" fill="#2a2a2a"/>
    <circle cx="46" cy="43" r="2.5" fill="#2a2a2a"/>
    <circle cx="35" cy="42" r="1" fill="white"/>
    <circle cx="47" cy="42" r="1" fill="white"/>
    <path d="M31 40 Q33 38 36 40" stroke="#2a2a2a" stroke-width="1" fill="none" stroke-linecap="round"/>
    <path d="M43 40 Q45 38 48 40" stroke="#2a2a2a" stroke-width="1" fill="none" stroke-linecap="round"/>
    <path d="M34 51 Q40 56 46 51" stroke="#c87941" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  </svg>`;
}

function maleAvatarSvg(brand) {
  return `<svg class="persona-avatar" width="90" height="90" viewBox="0 0 80 80">
    <circle cx="40" cy="40" r="40" fill="#${brand}"/>
    <ellipse cx="40" cy="72" rx="24" ry="14" fill="#2a2a2a"/>
    <rect x="35" y="52" width="10" height="8" rx="2" fill="#e8c9a0"/>
    <ellipse cx="40" cy="44" rx="16" ry="17" fill="#e8c9a0"/>
    <ellipse cx="40" cy="29" rx="16" ry="7" fill="#3d2b1f"/>
    <circle cx="34" cy="43" r="2.5" fill="#2a2a2a"/>
    <circle cx="46" cy="43" r="2.5" fill="#2a2a2a"/>
    <circle cx="35" cy="42" r="1" fill="white"/>
    <circle cx="47" cy="42" r="1" fill="white"/>
    <path d="M31 39 Q34 37 37 39" stroke="#3d2b1f" stroke-width="1.4" fill="none" stroke-linecap="round"/>
    <path d="M43 39 Q46 37 49 39" stroke="#3d2b1f" stroke-width="1.4" fill="none" stroke-linecap="round"/>
    <path d="M34 51 Q40 56 46 51" stroke="#c87941" stroke-width="1.5" fill="none" stroke-linecap="round"/>
  </svg>`;
}

function buildSvgNodes(stepLabels, icons) {
  const out = [];
  for (let i = 0; i < 12; i++) {
    const { cx, cy } = NODES[i];
    const isTop = cy < 110;
    const lines = String(stepLabels[i] || '').replace(/^\d+\s+/, '').trim().split(/\s+/);
    // Two label lines max — "01 Awareness" → ["01", "Awareness"], "01  Plan Comparison" → strip prefix → ["Plan", "Comparison"]
    // Easier: strip the "NN  " prefix then split on whitespace.
    const stripped = String(stepLabels[i] || '').replace(/^\d{2}\s+/, '').trim();
    const words = stripped.split(/\s+/);
    let line1 = words.slice(0, Math.ceil(words.length / 2)).join(' ');
    let line2 = words.slice(Math.ceil(words.length / 2)).join(' ');
    if (!line2 && line1.length > 12) {
      // single long word — put it all on line 1
      line2 = '';
    }
    const labelsHtml = isTop
      ? `<text class="node-label" x="${cx}" y="${cy - 26}">${escHtml(line1)}</text>` +
        (line2 ? `<text class="node-label" x="${cx}" y="${cy - 36}">${escHtml(line2)}</text>` : '')
      : `<text class="node-label" x="${cx}" y="${cy + 26}">${escHtml(line1)}</text>` +
        (line2 ? `<text class="node-label" x="${cx}" y="${cy + 36}">${escHtml(line2)}</text>` : '');
    out.push(
      `<g class="node-group" id="node-${i}" onclick="goTo(${i + 1})">` +
      `<circle class="node-circle" cx="${cx}" cy="${cy}"></circle>` +
      `<foreignObject x="${cx - 13}" y="${cy - 13}" width="26" height="26" style="pointer-events:none;">` +
      `<div xmlns="http://www.w3.org/1999/xhtml" class="node-emoji">${escHtml(icons[i] || DEFAULT_STEP_ICONS[i])}</div>` +
      `</foreignObject>` +
      labelsHtml +
      `</g>`
    );
  }
  return out.join('\n      ');
}

function renderStandaloneHtml(journey, input) {
  const brand = normaliseHex(journey.meta && journey.meta.brandColor || input.brandColor);
  const brandRgb = hexToRgb(brand);
  const brandAlpha = `rgba(${brandRgb.r},${brandRgb.g},${brandRgb.b},0.45)`;
  const brandDark = darkenHex(brand, 0.18);
  const isFoundation = (journey.meta && journey.meta.tier) !== 'Advanced';
  const rightTextColor = pickReadableTextColor(brand);
  const personaName = (journey.meta && journey.meta.personaName) || input.personaName || 'Persona';
  const personaGender = (journey.meta && journey.meta.personaGender) || input.personaGender || 'female';
  const avatar = personaGender === 'male' ? maleAvatarSvg(brand) : femaleAvatarSvg(brand);
  const clientName = (journey.meta && journey.meta.client) || input.client;
  const clientSlug = (journey.meta && journey.meta.clientSlug) || slugify(clientName);
  const clientDomain = input.clientDomain || (journey.meta && journey.meta.clientDomain) || '';
  const tier = isFoundation ? 'Foundation' : 'Advanced';

  const icons = fillIconDefaults(journey.icons);
  const stepLabels = (journey.stepLabels || []).slice(0, 12);
  const slidesInline = jsonInline(journey.slides);
  const pathSegsInline = jsonInline(PATH_SEGS);

  const svgNodesHtml = buildSvgNodes(stepLabels, icons);
  const techCol6Header = `Existing ${escHtml(clientName)} Technology`;

  const dataPanelGrid = isFoundation
    ? `
        <div class="data-col">
          <div class="data-col-header">Data Collected</div>
          <div id="col-data"></div>
        </div>
        <div class="data-col col-ingestion-wrap" style="padding:0;">
          <div class="col-half" style="padding: 8px 10px 4px;">
            <div class="data-col-header">Data Ingestion</div>
            <div id="col-ingestion"></div>
          </div>
          <div class="col-half" style="padding: 6px 10px 4px;">
            <div class="col-sub-header">Segments</div>
            <div id="col-segments"></div>
          </div>
        </div>
        <div class="data-col">
          <div class="data-col-header">Identities</div>
          <div id="col-identities"></div>
        </div>
        <div class="data-col" style="padding: 8px 10px 4px;">
          <div class="data-col-header">Journey Orchestration</div>
          <div id="col-orch"></div>
        </div>
        <div class="data-col">
          <div class="data-col-header">Activation / Destinations</div>
          <div id="col-activ"></div>
        </div>
        <div class="data-col">
          <div class="data-col-header">${techCol6Header}</div>
          <div id="col-tech"></div>
        </div>`
    : `
        <div class="data-col">
          <div class="data-col-header">Data Collected</div>
          <div id="col-data"></div>
        </div>
        <div class="data-col col-ingestion-wrap" style="padding:0;">
          <div class="col-half" style="padding: 8px 10px 4px;">
            <div class="data-col-header">Data Ingestion</div>
            <div id="col-ingestion"></div>
          </div>
          <div class="col-half" style="padding: 6px 10px 4px;">
            <div class="col-sub-header">Segments</div>
            <div id="col-segments"></div>
          </div>
        </div>
        <div class="data-col">
          <div class="data-col-header">Identities</div>
          <div id="col-identities"></div>
        </div>
        <div class="data-col col-orch-wrap" style="padding:0;">
          <div class="col-half" style="padding: 8px 10px 4px;">
            <div class="data-col-header">Journey Orchestration</div>
            <div id="col-orch"></div>
          </div>
          <div class="col-half" style="padding: 6px 10px 4px;">
            <div class="col-sub-header">Decisioning</div>
            <div id="col-decisioning"></div>
          </div>
        </div>
        <div class="data-col">
          <div class="data-col-header">Activation / Destinations</div>
          <div id="col-activ"></div>
        </div>
        <div class="data-col">
          <div class="data-col-header">${techCol6Header}</div>
          <div id="col-tech"></div>
        </div>`;

  const logoImg = clientDomain
    ? `<img src="https://logo.clearbit.com/${escHtml(clientDomain)}" alt="${escHtml(clientName)}"
            style="max-height:48px; max-width:200px; object-fit:contain;"
            onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-block';">
       <span style="display:none; font-weight:700; font-size:18px; color:#1a1a1a;">${escHtml(clientName)}</span>`
    : `<span style="font-weight:700; font-size:18px; color:#1a1a1a;">${escHtml(clientName)}</span>`;

  const summary = (journey.meta && journey.meta.summary) || `${tier} tier journey for ${clientName}.`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escHtml(clientName)} — AEP Journey (v2)</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', Arial, sans-serif;
    background: #f7f7f7;
    height: 100vh;
    overflow: hidden;
    display: flex;
    align-items: stretch;
  }
  .slide { display: flex; width: 100vw; height: 100vh; }
  .left-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: #f7f7f7;
    overflow: hidden;
  }
  .right-panel {
    flex: 0 0 22%;
    background: #${brandDark};
    color: ${rightTextColor};
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 20px;
  }

  .header {
    background: #ffffff;
    border-bottom: 1px solid #e5e5e5;
    padding: 14px 18px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }
  .header-title {
    font-weight: 700;
    font-size: 14px;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    color: #1a1a1a;
  }

  .journey-map-container {
    padding: 4px 16px 0;
    flex-shrink: 0;
    flex-grow: 0;
    display: flex;
    align-items: center;
    transition: flex-grow 0.7s cubic-bezier(0.4, 0, 0.2, 1), padding 0.7s ease;
  }
  .journey-map-container.expanded {
    flex-grow: 1;
    padding: 16px 40px 20px;
  }
  .journey-map-container.expanded .journey-svg {
    height: 100%;
    width: 100%;
  }
  .journey-svg { width: 100%; height: auto; overflow: visible; }

  .journey-base { fill: none; stroke: #ddd; stroke-width: 2; }
  .journey-active {
    fill: none;
    stroke: #${brand};
    stroke-width: 3;
    stroke-linecap: round;
    opacity: 0;
  }
  .journey-active.visible { opacity: 1; transition: opacity 0.6s ease; }

  .node-circle {
    fill: #fff;
    stroke: #ccc;
    stroke-width: 2;
    transition: fill 0.3s, stroke 0.3s;
    r: 13;
  }
  .node-active .node-circle {
    fill: #${brand};
    stroke: #${brand};
    animation: nodePulse 1.5s ease-in-out infinite;
  }
  @keyframes nodePulse {
    0%, 100% { filter: drop-shadow(0 0 0px rgba(0,0,0,0)); }
    50%      { filter: drop-shadow(0 0 6px ${brandAlpha}); }
  }
  .node-label { font-size: 8.5px; fill: #444; text-anchor: middle; }
  .node-active .node-label { font-weight: 700; }
  .node-emoji {
    width: 26px; height: 26px;
    display: flex; align-items: center; justify-content: center;
    font-size: 13px; line-height: 1;
    user-select: none;
  }
  .node-group { cursor: pointer; }

  .data-panel {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: #ffffff;
    border-top: 3px solid #${brand};
    overflow-y: auto;
    overflow-x: hidden;
    margin: 0 16px 10px;
    border-radius: 0 0 6px 6px;
    opacity: 1;
    max-height: 2000px;
    transform: translateY(0);
    transition: opacity 0.65s ease,
                max-height 0.75s cubic-bezier(0.4, 0, 0.2, 1),
                margin-bottom 0.75s ease,
                transform 0.65s ease;
  }
  .data-panel.hidden {
    max-height: 0;
    opacity: 0;
    transform: translateY(18px);
    margin-bottom: 0;
    border-top-width: 0;
    pointer-events: none;
  }
  .data-panel-title {
    font-size: 12px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 2.5px;
    color: #1a1a1a;
    padding: 8px 16px;
    border-bottom: 2px solid #1a1a1a;
    flex-shrink: 0;
    background: #ffffff;
  }
  .data-grid {
    display: flex;
    min-height: fit-content;
    border-top: none;
  }
  .data-col {
    flex: 1;
    padding: 8px 10px 6px;
    border-right: 1px solid #eeeeee;
    overflow-y: visible;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .data-col:last-child { border-right: none; }
  .data-col-header {
    font-size: 10.5px;
    font-weight: 700;
    color: #${brand};
    text-transform: uppercase;
    letter-spacing: 0.8px;
    padding-bottom: 4px;
    border-bottom: 1px solid #f1f1f1;
    margin-bottom: 4px;
  }
  .col-sub-header {
    font-size: 10px;
    font-weight: 700;
    color: #${brand};
    text-transform: uppercase;
    letter-spacing: 0.8px;
    padding-bottom: 4px;
    border-bottom: 1px solid #f1f1f1;
    margin-bottom: 4px;
  }
  .data-item, .seg {
    font-size: 11px;
    line-height: 1.35;
    color: #1a1a1a;
    padding: 3px 6px;
    border-left: 2px solid transparent;
    transition: opacity 0.35s ease, background 0.35s ease;
  }
  .data-item.active, .seg.active {
    color: #1a1a1a;
    background: rgba(80, 200, 120, 0.18);
    border-left: 2px solid rgba(80, 200, 120, 0.7);
    font-weight: 600;
  }
  .data-item.past, .seg.past { opacity: 0.38; }
  .seg { display: flex; align-items: flex-start; gap: 6px; }
  .seg-icon { flex-shrink: 0; width: 16px; text-align: center; }

  .col-ingestion-wrap, .col-orch-wrap {
    display: grid;
    grid-template-rows: minmax(80px, 1fr) minmax(80px, 1fr);
    padding: 0;
    overflow: hidden;
  }
  .col-half {
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 8px 10px 4px;
    min-height: 0;
  }
  .col-half:first-child { border-bottom: 1px solid #eeeeee; }
  .col-half:last-child { padding-top: 28px; }

  .right-panel { gap: 12px; }
  .right-panel .nav-dots { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; }
  .nav-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: rgba(255,255,255,0.35);
    cursor: pointer;
    transition: background 0.2s ease, transform 0.2s ease;
  }
  .nav-dot:hover { transform: scale(1.2); }
  .nav-dot.active { background: ${rightTextColor}; transform: scale(1.3); }
  .slide-label {
    font-weight: 800;
    font-size: 17px;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    margin-top: 10px;
  }
  .slide-desc {
    font-size: 13.5px;
    line-height: 1.45;
    margin-top: 8px;
    max-width: 95%;
  }
  .right-arrows {
    display: flex;
    gap: 14px;
    margin-top: 14px;
  }
  .arrow-btn {
    background: rgba(255,255,255,0.18);
    color: ${rightTextColor};
    border: 0;
    width: 36px; height: 36px;
    border-radius: 50%;
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.2s;
  }
  .arrow-btn:hover { background: rgba(255,255,255,0.32); }
  .persona-avatar { margin-top: 14px; flex-shrink: 0; }
  .persona-name {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    opacity: 0.85;
  }
  .adobe-wordmark {
    font-family: 'Arial Black', Arial, sans-serif;
    font-weight: 900;
    font-size: 22px;
    color: #FA0F00;
    letter-spacing: -0.5px;
    margin-bottom: 4px;
  }
</style>
</head>
<body>
  <div class="slide">
    <div class="left-panel">
      <div class="header">
        <div style="display:flex; align-items:center; gap:14px;">
          ${logoImg}
        </div>
        <div class="header-title">Adobe Experience Platform · ${escHtml(tier)} journey · v2</div>
      </div>

      <div class="journey-map-container expanded" id="journey-map-container">
        <svg class="journey-svg" viewBox="-20 -10 1040 230" id="journey-svg">
          <path class="journey-base" d="${BASE_PATH}"></path>
          <path class="journey-active" id="active-seg"></path>
          ${svgNodesHtml}
        </svg>
      </div>

      <div class="data-panel hidden">
        <div class="data-panel-title">Adobe Experience Platform — Live Data View</div>
        <div class="data-grid">${dataPanelGrid}
        </div>
      </div>
    </div>

    <div class="right-panel">
      <div class="adobe-wordmark">Adobe</div>
      <div class="nav-dots" id="nav-dots"></div>
      <div class="slide-label" id="slide-label">Overview</div>
      <div class="slide-desc" id="slide-desc">${escHtml(summary)}</div>
      ${avatar}
      <div class="persona-name">${escHtml(personaName)}</div>
      <div class="right-arrows">
        <button class="arrow-btn" type="button" onclick="prevSlide()" aria-label="Previous step">‹</button>
        <button class="arrow-btn" type="button" onclick="nextSlide()" aria-label="Next step">›</button>
      </div>
    </div>
  </div>

<script>
const slides = ${slidesInline};
const pathSegs = ${pathSegsInline};
let current = 0;
let overviewTimers = [];

function clearOverviewTimers() {
  overviewTimers.forEach(t => clearTimeout(t));
  overviewTimers = [];
}
function resetNodes() {
  for (let n = 0; n < 12; n++) {
    const el = document.getElementById('node-' + n);
    if (el) el.classList.remove('node-active');
  }
}
function animateOverview() {
  clearOverviewTimers();
  resetNodes();
  const seg = document.getElementById('active-seg');
  seg.setAttribute('d', pathSegs[11]);
  seg.style.transition = 'none';
  seg.style.opacity = '1';
  seg.classList.remove('visible');
  const totalLength = seg.getTotalLength();
  seg.style.strokeDasharray = totalLength + ' ' + totalLength;
  seg.style.strokeDashoffset = totalLength;
  seg.getBoundingClientRect();
  const duration = 7000;
  seg.style.transition = 'stroke-dashoffset ' + duration + 'ms cubic-bezier(0.35, 0, 0.45, 1)';
  seg.style.strokeDashoffset = '0';
}
function goTo(idx) {
  clearOverviewTimers();
  current = Math.max(0, Math.min(slides.length - 1, idx));
  const seg = document.getElementById('active-seg');
  seg.style.transition = 'none';
  seg.style.strokeDasharray = '';
  seg.style.strokeDashoffset = '';
  seg.style.opacity = '';
  seg.classList.remove('visible');
  seg.removeAttribute('d');
  resetNodes();
  renderContent();
  if (current === 0) animateOverview();
}
function nextSlide() { goTo(current + 1); }
function prevSlide() { goTo(current - 1); }

function accumulate(field, activeField) {
  const seen = new Map();
  for (let i = 0; i <= current; i++) {
    const items = slides[i][field] || [];
    const active = slides[i][activeField] || [];
    items.forEach(t => {
      if (i === current && active.includes(t)) seen.set(t, 'active');
      else if (!seen.has(t)) seen.set(t, 'past');
    });
  }
  return seen;
}
function accumulateSegs() {
  const seen = new Map();
  for (let i = 0; i <= current; i++) {
    const segs = slides[i].segs || [];
    const active = slides[i].segActive || [];
    segs.forEach(sg => {
      if (i === current && active.includes(sg.l)) seen.set(sg.l, { i: sg.i, state: 'active' });
      else if (!seen.has(sg.l)) seen.set(sg.l, { i: sg.i, state: 'past' });
    });
  }
  return seen;
}
function accumulateIds() {
  const seen = new Map();
  for (let i = 0; i <= current; i++) {
    (slides[i].ids || []).forEach(([label, active]) => {
      if (i === current && active) seen.set(label, 'active');
      else if (!seen.has(label)) seen.set(label, active ? 'active' : 'past');
    });
  }
  return seen;
}
function accumulateTech() {
  const seen = new Map();
  for (let i = 0; i <= current; i++) {
    (slides[i].tech || []).forEach(({ t, a }) => {
      if (i === current && a) seen.set(t, 'active');
      else if (!seen.has(t)) seen.set(t, 'past');
    });
  }
  return seen;
}

function renderContent() {
  const s = slides[current];
  const isOverview = current === 0;
  const panel = document.querySelector('.data-panel');
  if (isOverview) panel.classList.add('hidden');
  else panel.classList.remove('hidden');
  document.querySelector('.journey-map-container').classList.toggle('expanded', isOverview);

  document.getElementById('slide-label').textContent = s.label;
  document.getElementById('slide-desc').textContent = s.desc;

  const dotsEl = document.getElementById('nav-dots');
  dotsEl.innerHTML = slides.map((_, i) =>
    '<div class="nav-dot' + (i === current ? ' active' : '') + '" onclick="goTo(' + i + ')"></div>'
  ).join('');

  if (!isOverview) {
    for (let n = 0; n < 12; n++) {
      const el = document.getElementById('node-' + n);
      if (el) el.classList.toggle('node-active', s.activeNode === n);
    }
    const seg = document.getElementById('active-seg');
    const pi = s.activeNode;
    if (s.activeNode >= 0 && pi > 0) {
      seg.setAttribute('d', pathSegs[pi]);
      seg.classList.add('visible');
    } else {
      seg.removeAttribute('d');
      seg.classList.remove('visible');
    }
  }

  const renderCol = (id, map) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = [...map.entries()].map(([t, state]) =>
      '<div class="data-item' +
      (state === 'active' ? ' active' : state === 'past' ? ' past' : '') +
      '">' + String(t).replace(/\\n/g, ' ') + '</div>'
    ).join('');
  };

  renderCol('col-data',       accumulate('data', 'dataActive'));
  renderCol('col-ingestion',  accumulate('ingestion', 'ingestionActive'));
  renderCol('col-orch',       accumulate('orch', 'orchActive'));
  const decEl = document.getElementById('col-decisioning');
  if (decEl) renderCol('col-decisioning', accumulate('decisioning', 'decisioningActive'));
  renderCol('col-activ',      accumulate('activ', 'activActive'));

  const segMap = accumulateSegs();
  const segsEl = document.getElementById('col-segments');
  if (segsEl) {
    segsEl.innerHTML = [...segMap.entries()].map(([label, info]) =>
      '<div class="seg' + (info.state === 'active' ? ' active' : info.state === 'past' ? ' past' : '') + '">' +
        '<span class="seg-icon">' + info.i + '</span>' +
        '<span>' + label.replace(/\\n/g, ' ') + '</span>' +
      '</div>'
    ).join('');
  }
  const idMap = accumulateIds();
  const idsEl = document.getElementById('col-identities');
  if (idsEl) {
    idsEl.innerHTML = [...idMap.entries()].map(([label, state]) =>
      '<div class="data-item' + (state === 'active' ? ' active' : ' past') + '">' +
        '<span style="font-weight:600">' + label + '</span>' +
      '</div>'
    ).join('');
  }
  const techMap = accumulateTech();
  renderCol('col-tech', techMap);
}

document.addEventListener('keydown', e => {
  if (e.key === 'ArrowRight') nextSlide();
  if (e.key === 'ArrowLeft')  prevSlide();
});

renderContent();
animateOverview();
</script>
</body>
</html>
`;
}

// ─── PPTX RENDERER ───────────────────────────────────────────────────────────

const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_RELS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const FONT_TYPEFACE = 'Adobe Clean';

function cm(v) { return String(Math.round(v * 360_000)); }

function el(doc, name, attrs = {}, children = []) {
  const e = doc.createElementNS(NS_A, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  for (const c of children) if (c) e.appendChild(c);
  return e;
}
function pEl(doc, name, attrs = {}, children = []) {
  const e = doc.createElementNS(NS_P, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  for (const c of children) if (c) e.appendChild(c);
  return e;
}

function makeRpr(doc, { bold = false, underline = false, sz = '1350' } = {}) {
  const rpr = el(doc, 'a:rPr');
  rpr.setAttribute('lang', 'en-GB');
  rpr.setAttribute('sz', sz);
  rpr.setAttribute('b', bold ? '1' : '0');
  rpr.setAttribute('i', '0');
  rpr.setAttribute('u', underline ? 'sng' : 'none');
  rpr.setAttribute('strike', 'noStrike');
  rpr.setAttribute('kern', '1200');
  const sf = el(doc, 'a:solidFill');
  const sc = el(doc, 'a:schemeClr');
  sc.setAttribute('val', 'dk1');
  sf.appendChild(sc);
  rpr.appendChild(sf);
  rpr.appendChild(el(doc, 'a:effectLst'));
  const lat = el(doc, 'a:latin');
  lat.setAttribute('typeface', FONT_TYPEFACE);
  lat.setAttribute('panose', '020B0503020404020204');
  lat.setAttribute('pitchFamily', '34');
  lat.setAttribute('charset', '0');
  rpr.appendChild(lat);
  const ea = el(doc, 'a:ea');
  ea.setAttribute('typeface', '+mn-ea');
  rpr.appendChild(ea);
  const cs = el(doc, 'a:cs');
  cs.setAttribute('typeface', '+mn-cs');
  rpr.appendChild(cs);
  return rpr;
}

function makeEndParaRpr(doc, { bold = false } = {}) {
  const rpr = el(doc, 'a:endParaRPr');
  rpr.setAttribute('lang', 'en-GB');
  rpr.setAttribute('sz', '1350');
  rpr.setAttribute('b', bold ? '1' : '0');
  rpr.setAttribute('i', '0');
  rpr.setAttribute('u', 'none');
  rpr.setAttribute('strike', 'noStrike');
  rpr.setAttribute('kern', '1200');
  const sf = el(doc, 'a:solidFill');
  const sc = el(doc, 'a:schemeClr');
  sc.setAttribute('val', 'dk1');
  sf.appendChild(sc);
  rpr.appendChild(sf);
  rpr.appendChild(el(doc, 'a:effectLst'));
  const lat = el(doc, 'a:latin');
  lat.setAttribute('typeface', FONT_TYPEFACE);
  lat.setAttribute('panose', '020B0503020404020204');
  lat.setAttribute('pitchFamily', '34');
  lat.setAttribute('charset', '0');
  rpr.appendChild(lat);
  const ea = el(doc, 'a:ea');
  ea.setAttribute('typeface', '+mn-ea');
  rpr.appendChild(ea);
  const cs = el(doc, 'a:cs');
  cs.setAttribute('typeface', '+mn-cs');
  rpr.appendChild(cs);
  return rpr;
}

function pPlain(doc, text, { bold = false, underline = false, align } = {}) {
  const p = el(doc, 'a:p');
  if (align) {
    const ppr = el(doc, 'a:pPr');
    ppr.setAttribute('algn', align);
    p.appendChild(ppr);
  }
  const r = el(doc, 'a:r');
  r.appendChild(makeRpr(doc, { bold, underline }));
  const t = el(doc, 'a:t');
  t.appendChild(doc.createTextNode(String(text ?? '')));
  r.appendChild(t);
  p.appendChild(r);
  p.appendChild(makeEndParaRpr(doc, { bold }));
  return p;
}

function pBlank(doc, { bold = false } = {}) {
  const p = el(doc, 'a:p');
  p.appendChild(makeEndParaRpr(doc, { bold }));
  return p;
}

function pBullet(doc, text) {
  const p = el(doc, 'a:p');
  const ppr = el(doc, 'a:pPr');
  ppr.setAttribute('marL', '285750');
  ppr.setAttribute('indent', '-285750');
  const buFont = el(doc, 'a:buFont');
  buFont.setAttribute('typeface', 'Arial');
  buFont.setAttribute('panose', '020B0604020202020204');
  buFont.setAttribute('pitchFamily', '34');
  buFont.setAttribute('charset', '0');
  ppr.appendChild(buFont);
  const buChar = el(doc, 'a:buChar');
  buChar.setAttribute('char', '•');
  ppr.appendChild(buChar);
  p.appendChild(ppr);
  const r = el(doc, 'a:r');
  r.appendChild(makeRpr(doc, { bold: false }));
  const t = el(doc, 'a:t');
  t.appendChild(doc.createTextNode(String(text ?? '')));
  r.appendChild(t);
  p.appendChild(r);
  return p;
}

function makeTxBody(doc, paras) {
  const tx = el(doc, 'a:txBody');
  tx.appendChild(el(doc, 'a:bodyPr'));
  tx.appendChild(el(doc, 'a:lstStyle'));
  for (const p of paras) tx.appendChild(p);
  return tx;
}

function descCell(doc, text) {
  return [pPlain(doc, text, { bold: true, align: 'l' })];
}

function dataCell(doc, statusBlock) {
  const status = statusBlock && statusBlock.status ? statusBlock.status : '';
  const bullets = (statusBlock && Array.isArray(statusBlock.bullets)) ? statusBlock.bullets : [];
  if (!status && bullets.length === 0) return [pBlank(doc)];
  const out = [pPlain(doc, status, { underline: true }), pBlank(doc)];
  for (const b of bullets) out.push(pBullet(doc, b));
  return out;
}

function adobeCell(doc, blockSet) {
  const blocks = (blockSet && Array.isArray(blockSet.blocks)) ? blockSet.blocks : [];
  if (blocks.length === 0) return [pBlank(doc)];
  const out = [];
  for (const block of blocks) {
    const t = String(block && block.type || '').toLowerCase();
    const text = String(block && block.text || '');
    if (t === 'product') out.push(pPlain(doc, text, { underline: true }));
    else if (t === 'heading') out.push(pPlain(doc, text, { bold: true }));
    else if (t === 'bullet') out.push(pBullet(doc, text));
    else if (t === 'blank') out.push(pBlank(doc));
  }
  return out.length ? out : [pBlank(doc)];
}

function techCell(doc, cellData) {
  const heading = cellData && cellData.heading ? cellData.heading : '';
  const bullets = (cellData && Array.isArray(cellData.bullets)) ? cellData.bullets : [];
  if (!heading && bullets.length === 0) return [pBlank(doc)];
  const out = [pPlain(doc, heading, { underline: true, bold: true }), pBlank(doc)];
  for (const b of bullets) out.push(pBullet(doc, b));
  return out;
}

function sectionCell(doc, label) {
  const p = el(doc, 'a:p');
  const ppr = el(doc, 'a:pPr');
  ppr.setAttribute('algn', 'l');
  p.appendChild(ppr);
  const r = el(doc, 'a:r');
  const rpr = el(doc, 'a:rPr');
  rpr.setAttribute('lang', 'en-GB');
  rpr.setAttribute('sz', '2200');
  rpr.setAttribute('b', '1');
  rpr.setAttribute('i', '0');
  const sf = el(doc, 'a:solidFill');
  const sc = el(doc, 'a:schemeClr');
  sc.setAttribute('val', 'tx1');
  sf.appendChild(sc);
  rpr.appendChild(sf);
  const lat = el(doc, 'a:latin');
  lat.setAttribute('typeface', FONT_TYPEFACE);
  lat.setAttribute('panose', '020B0503020404020204');
  lat.setAttribute('pitchFamily', '34');
  lat.setAttribute('charset', '0');
  rpr.appendChild(lat);
  r.appendChild(rpr);
  const t = el(doc, 'a:t');
  t.appendChild(doc.createTextNode(label));
  r.appendChild(t);
  p.appendChild(r);
  return [p];
}

function getDirectChildren(node, ns, localName) {
  const out = [];
  if (!node || !node.childNodes) return out;
  for (let i = 0; i < node.childNodes.length; i++) {
    const c = node.childNodes[i];
    if (c.nodeType === 1 && c.namespaceURI === ns && (c.localName || c.tagName.split(':').pop()) === localName) {
      out.push(c);
    }
  }
  return out;
}

function replaceTxBody(tc, doc, paras) {
  const olds = getDirectChildren(tc, NS_A, 'txBody');
  for (const o of olds) tc.removeChild(o);
  const tcprs = getDirectChildren(tc, NS_A, 'tcPr');
  const txb = makeTxBody(doc, paras);
  if (tcprs.length > 0) tc.insertBefore(txb, tcprs[0]);
  else tc.appendChild(txb);
}

function setRow(row, doc, label, content14) {
  const cells = getDirectChildren(row, NS_A, 'tc');
  if (cells.length < 14) throw new Error(`expected 14 tc cells in row, got ${cells.length}`);
  replaceTxBody(cells[0], doc, sectionCell(doc, label));
  replaceTxBody(cells[1], doc, content14[0]);
  replaceTxBody(cells[2], doc, content14[1]);
  replaceTxBody(cells[3], doc, [pBlank(doc)]);
  for (let i = 0; i < 10; i++) {
    replaceTxBody(cells[4 + i], doc, content14[2 + i]);
  }
}

function setRowNoMerge(row, doc, label, content14) {
  const cells = getDirectChildren(row, NS_A, 'tc');
  if (cells.length < 14) throw new Error(`expected 14 tc cells in row, got ${cells.length}`);
  replaceTxBody(cells[0], doc, sectionCell(doc, label));
  for (let i = 1; i < 14; i++) {
    replaceTxBody(cells[i], doc, content14[i - 1]);
  }
}

// ── Step labels and logo (top-area shapes) ───────────────────────────────────

function buildLabelShape(doc, spIdSeed, idx, text, geom) {
  const id = String(spIdSeed + idx);
  const sp = pEl(doc, 'p:sp');
  const nv = pEl(doc, 'p:nvSpPr');
  const cnv = pEl(doc, 'p:cNvPr', { id, name: `Label${id}` });
  nv.appendChild(cnv);
  const cnvSp = pEl(doc, 'p:cNvSpPr');
  const spLocks = el(doc, 'a:spLocks');
  spLocks.setAttribute('noGrp', '1');
  cnvSp.appendChild(spLocks);
  nv.appendChild(cnvSp);
  nv.appendChild(pEl(doc, 'p:nvPr'));
  sp.appendChild(nv);

  const sppr = pEl(doc, 'p:spPr');
  const xfrm = el(doc, 'a:xfrm');
  const off = el(doc, 'a:off');
  off.setAttribute('x', cm(geom[0]));
  off.setAttribute('y', cm(geom[1]));
  xfrm.appendChild(off);
  const ext = el(doc, 'a:ext');
  ext.setAttribute('cx', cm(geom[2]));
  ext.setAttribute('cy', cm(geom[3]));
  xfrm.appendChild(ext);
  sppr.appendChild(xfrm);
  const pg = el(doc, 'a:prstGeom');
  pg.setAttribute('prst', 'rect');
  pg.appendChild(el(doc, 'a:avLst'));
  sppr.appendChild(pg);
  sppr.appendChild(el(doc, 'a:noFill'));
  sp.appendChild(sppr);

  const tx = pEl(doc, 'p:txBody');
  const bpr = el(doc, 'a:bodyPr');
  bpr.setAttribute('wrap', 'square');
  bpr.setAttribute('rtlCol', '0');
  tx.appendChild(bpr);
  tx.appendChild(el(doc, 'a:lstStyle'));
  const para = el(doc, 'a:p');
  const ppr = el(doc, 'a:pPr');
  ppr.setAttribute('algn', 'l');
  para.appendChild(ppr);
  const r = el(doc, 'a:r');
  const rpr = el(doc, 'a:rPr');
  rpr.setAttribute('lang', 'en-GB');
  rpr.setAttribute('sz', String(11 * 100));
  rpr.setAttribute('b', '1');
  rpr.setAttribute('dirty', '0');
  const sf = el(doc, 'a:solidFill');
  const srgb = el(doc, 'a:srgbClr');
  srgb.setAttribute('val', '1A1A1A');
  sf.appendChild(srgb);
  rpr.appendChild(sf);
  const lat = el(doc, 'a:latin');
  lat.setAttribute('typeface', FONT_TYPEFACE);
  rpr.appendChild(lat);
  r.appendChild(rpr);
  const t = el(doc, 'a:t');
  t.appendChild(doc.createTextNode(text));
  r.appendChild(t);
  para.appendChild(r);
  tx.appendChild(para);
  sp.appendChild(tx);
  return sp;
}

function buildLogoPic(doc, spId, rid, geom) {
  const pic = pEl(doc, 'p:pic');
  const nv = pEl(doc, 'p:nvPicPr');
  const cnv = pEl(doc, 'p:cNvPr', { id: String(spId), name: 'ClientLogoV2' });
  nv.appendChild(cnv);
  nv.appendChild(pEl(doc, 'p:cNvPicPr'));
  nv.appendChild(pEl(doc, 'p:nvPr'));
  pic.appendChild(nv);
  const blipFill = pEl(doc, 'p:blipFill');
  const blip = el(doc, 'a:blip');
  blip.setAttributeNS(NS_R, 'r:embed', rid);
  blipFill.appendChild(blip);
  const stretch = el(doc, 'a:stretch');
  stretch.appendChild(el(doc, 'a:fillRect'));
  blipFill.appendChild(stretch);
  pic.appendChild(blipFill);
  const sppr = pEl(doc, 'p:spPr');
  const xfrm = el(doc, 'a:xfrm');
  const off = el(doc, 'a:off');
  off.setAttribute('x', cm(geom.x_cm));
  off.setAttribute('y', cm(geom.y_cm));
  xfrm.appendChild(off);
  const ext = el(doc, 'a:ext');
  ext.setAttribute('cx', cm(geom.w_cm));
  ext.setAttribute('cy', cm(geom.h_cm));
  xfrm.appendChild(ext);
  sppr.appendChild(xfrm);
  const pg = el(doc, 'a:prstGeom');
  pg.setAttribute('prst', 'rect');
  pg.appendChild(el(doc, 'a:avLst'));
  sppr.appendChild(pg);
  pic.appendChild(sppr);
  return pic;
}

const ADMIRAL_NAMES_TO_DELETE = new Set([
  'Picture 24', 'Picture 25', 'Picture 26', 'Picture 27',
  'Picture 28', 'Picture 29', 'Picture 30', 'Picture 31',
  'Picture 32', 'Picture 33', 'Picture 34', 'Picture 35',
  'Picture 21', 'Picture 36',
]);

function pruneAdmiralImages(spTree) {
  const nodes = Array.from(spTree.childNodes || []);
  let removed = 0;
  for (const n of nodes) {
    if (n.nodeType !== 1) continue;
    const cNvPr = n.getElementsByTagNameNS(NS_P, 'cNvPr')[0];
    const name = cNvPr && cNvPr.getAttribute('name') || '';
    if (ADMIRAL_NAMES_TO_DELETE.has(name)) {
      spTree.removeChild(n);
      removed++;
    }
  }
  return removed;
}

async function fetchClearbitLogo(domain) {
  if (!domain) return null;
  const url = `https://logo.clearbit.com/${encodeURIComponent(domain)}`;
  try {
    const res = await fetchWithTimeout(url, {
      headers: { 'User-Agent': 'aep-orchestration-lab/clientJourneyV2' },
    }, 8000);
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch {
    return null;
  }
}

async function renderPptx(journey, input) {
  const PizZip = require('pizzip');
  const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');

  const tplBytes = fs.readFileSync(PPTX_TEMPLATE_PATH);
  const zip = new PizZip(tplBytes);

  // ── Edit slide1.xml table content ──────────────────────────────────────
  const slideXmlStr = zip.file('ppt/slides/slide1.xml').asText();
  const doc = new DOMParser().parseFromString(slideXmlStr, 'text/xml');

  const tbls = doc.getElementsByTagNameNS(NS_A, 'tbl');
  if (tbls.length === 0) throw new Error('slide1.xml has no <a:tbl>');
  const tbl = tbls[0];
  const rows = getDirectChildren(tbl, NS_A, 'tr');
  if (rows.length < 4) throw new Error(`expected at least 4 rows, got ${rows.length}`);

  // Row 0 — Description (col 3 hMerge)
  const descCells = (journey.descriptions || []).filter((d) => d !== '');
  const descContent = descCells.map((d) => descCell(doc, d));
  if (descContent.length !== 12) {
    // Pad / truncate defensively to 12 visible cells; the row has 14 tc:
    // [section-label, c1, c2, c3-blank, c4..c13]
    while (descContent.length < 12) descContent.push([pBlank(doc)]);
    descContent.length = 12;
  }
  // setRow expects content14 = [step1, step2, then steps 3..12] i.e. 12 entries; index 1 = step 2 widest
  setRow(rows[0], doc, 'Description', descContent);

  // Row 1 — Data Collected (no hMerge; col 3 left blank)
  const dataCells12 = (journey.pptxData || []).slice(0, 12);
  while (dataCells12.length < 12) dataCells12.push({ status: '', bullets: [] });
  const dataParas = dataCells12.map((d) => dataCell(doc, d));
  // Build the 13-entry layout: [step1, step2, BLANK, step3..step12]
  const dataFlat = [dataParas[0], dataParas[1], [pBlank(doc)], ...dataParas.slice(2)];
  setRowNoMerge(rows[1], doc, 'Data Collected', dataFlat);
  // Re-apply step-2 gridSpan + step-3 hMerge per script-boilerplate.md
  const row1Cells = getDirectChildren(rows[1], NS_A, 'tc');
  if (row1Cells[2]) row1Cells[2].setAttribute('gridSpan', '2');
  if (row1Cells[3]) row1Cells[3].setAttribute('hMerge', '1');

  // Row 2 — Adobe Platform (hMerge step 2)
  const adobeCells12 = (journey.pptxAdobe || []).slice(0, 12);
  while (adobeCells12.length < 12) adobeCells12.push({ blocks: [] });
  setRow(rows[2], doc, 'Adobe Platform', adobeCells12.map((a) => adobeCell(doc, a)));

  // Row 3 — Existing Technology (hMerge step 2)
  const techCells12 = (journey.pptxTech || []).slice(0, 12);
  while (techCells12.length < 12) techCells12.push({ heading: '', bullets: [] });
  const clientName = (journey.meta && journey.meta.client) || input.client;
  setRow(rows[3], doc, `Existing ${clientName} Technology`, techCells12.map((t) => techCell(doc, t)));

  // ── Edit spTree: prune Admiral specifics, add 12 step labels + optional logo ──
  const cSlds = doc.getElementsByTagNameNS(NS_P, 'cSld');
  if (cSlds.length === 0) throw new Error('slide1.xml has no <p:cSld>');
  const spTrees = cSlds[0].getElementsByTagNameNS(NS_P, 'spTree');
  if (spTrees.length === 0) throw new Error('slide1.xml has no <p:spTree>');
  const spTree = spTrees[0];

  const removed = pruneAdmiralImages(spTree);
  console.log(`[client-journey-v2] PPTX render: pruned ${removed} Admiral-specific images`);

  // 12 step labels
  const stepLabels = (journey.stepLabels || []).slice(0, 12);
  while (stepLabels.length < 12) stepLabels.push(`${String(stepLabels.length + 1).padStart(2, '0')}  Step`);
  for (let i = 0; i < 12; i++) {
    const sp = buildLabelShape(doc, 1000, i, stepLabels[i], STEP_LABEL_GEOMETRY[i]);
    spTree.appendChild(sp);
  }

  // Optional Clearbit logo
  let logoBytes = null;
  if (input.clientDomain) {
    logoBytes = await fetchClearbitLogo(input.clientDomain);
  }

  const RELS_PATH = 'ppt/slides/_rels/slide1.xml.rels';
  const LOGO_MEDIA_NAME = 'clientLogoV2.png';
  let relsXmlStr = null;
  if (logoBytes) {
    relsXmlStr = zip.file(RELS_PATH).asText();
    const relsDoc = new DOMParser().parseFromString(relsXmlStr, 'text/xml');
    const relEls = relsDoc.getElementsByTagNameNS(NS_RELS, 'Relationship');
    let maxId = 0;
    for (let i = 0; i < relEls.length; i++) {
      const id = relEls[i].getAttribute('Id') || '';
      const m = /^rId(\d+)$/.exec(id);
      if (m) maxId = Math.max(maxId, parseInt(m[1], 10));
    }
    const newRid = `rId${maxId + 1}`;
    const newRel = relsDoc.createElementNS(NS_RELS, 'Relationship');
    newRel.setAttribute('Id', newRid);
    newRel.setAttribute('Type', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image');
    newRel.setAttribute('Target', `../media/${LOGO_MEDIA_NAME}`);
    const relsRoot = relsDoc.documentElement;
    relsRoot.appendChild(newRel);
    relsXmlStr = new XMLSerializer().serializeToString(relsDoc);

    const logoPic = buildLogoPic(doc, 9999, newRid, LOGO_GEOMETRY);
    spTree.appendChild(logoPic);
  } else {
    // Text fallback in the same top-right region.
    const fallbackText = (journey.meta && journey.meta.client) || input.client || 'Client';
    const sp = buildLabelShape(doc, 9000, 0, fallbackText, [LOGO_GEOMETRY.x_cm, LOGO_GEOMETRY.y_cm + 0.4, LOGO_GEOMETRY.w_cm, LOGO_GEOMETRY.h_cm]);
    spTree.appendChild(sp);
  }

  // serializeToString(Document) already emits the XML declaration; do not
  // prepend a second one — PowerPoint treats the package as corrupt/repair.
  const newSlideXml = new XMLSerializer().serializeToString(doc);

  zip.file('ppt/slides/slide1.xml', newSlideXml);
  if (relsXmlStr) zip.file(RELS_PATH, relsXmlStr);
  if (logoBytes) zip.file(`ppt/media/${LOGO_MEDIA_NAME}`, logoBytes);

  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// ─── HANDLERS ────────────────────────────────────────────────────────────────

async function handleGenerate(req, res, opts = {}) {
  setCors(res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  const log = [];
  const log_ = (msg) => { log.push(`${new Date().toISOString()} ${msg}`); console.log(`[client-journey-v2] ${msg}`); };

  let input;
  try {
    const body = await readBody(req);
    input = normaliseInput(body);
  } catch (err) {
    res.status(400).json({ error: 'Invalid request body', detail: String(err.message || err) });
    return;
  }
  log_(`generate start client="${input.client}" tier=${input.tier}`);

  const ctx7Key = (opts && opts.contextSevenKey) || '';
  if (!ctx7Key) log_('Context7 key missing — every topic will use the static-summary fallback');

  let snippets = [];
  try {
    snippets = await fetchExperienceLeagueContext(input.tier, ctx7Key);
    log_(`Context7 sources: ${snippets.map((s) => `${s.id}=${s.source}`).join(', ')}`);
  } catch (err) {
    log_(`Context7 fetch unexpectedly threw: ${err.message || err}`);
    snippets = CONTEXT7_TOPICS
      .filter((t) => t.tier === 'all' || t.tier === input.tier)
      .map((t) => ({
        id: t.id,
        title: t.query,
        source: 'fallback',
        libraryId: null,
        text: STATIC_DOC_FALLBACKS[t.id] || '',
      }));
  }

  // Two-call flow: research (grounding ON, free text out) → generation
  // (no tools, controlled JSON out). Vertex rejects tools + responseSchema
  // in a single call (HTTP 400 INVALID_ARGUMENT, May 2026).
  const research = await runResearchPass(input);
  log_(
    `research pass: ms=${research.ms} wantsTechStack=${research.wantsTechStack} ` +
    `techChars=${(research.techStackResearch || '').length} ` +
    `freshChars=${(research.adobeFreshness || '').length}` +
    (research.error ? ` error=${research.error}` : '')
  );

  let journey;
  let generationMs = 0;
  let generationRetried = false;
  let generationRepaired = false;
  try {
    const out = await runGenerationPass(input, snippets, research);
    journey = out.journey;
    generationMs = out.ms;
    generationRetried = !!out.retried;
    generationRepaired = !!out.repaired;
  } catch (err) {
    if (err && err.code === 'CJV2_JSON_PARSE_FAILED') {
      // User-facing: friendly, transient-issue framing.
      // Cloud-Logs-side: full details already emitted by runGenerationPass.
      log_(`Gemini JSON parse failed after repair + retry: ${err.message}`);
      res.status(502).json({
        error: 'Gemini returned malformed JSON even after repair. Please try again — transient model issue.',
        code: 'CJV2_JSON_PARSE_FAILED',
        details: err.details, // safe: { firstError, position, repairTried, retryTried }
        log,
      });
      return;
    }
    log_(`Gemini generation pass failed: ${err.message || err}`);
    res.status(502).json({
      error: 'Vertex AI Gemini failed to produce a journey',
      code: err && err.code,
      detail: String(err.message || err),
      log,
    });
    return;
  }
  // Defensive: ensure meta carries the operator-supplied invariants
  journey.meta = Object.assign({}, journey.meta, {
    client: input.client,
    clientSlug: input.clientSlug,
    clientDomain: input.clientDomain,
    brandColor: normaliseHex(journey.meta && journey.meta.brandColor || input.brandColor),
    tier: input.tier,
    personaName: (journey.meta && journey.meta.personaName) || input.personaName,
    personaGender: (journey.meta && journey.meta.personaGender) || input.personaGender,
    marketerPersonaName: (journey.meta && journey.meta.marketerPersonaName) || input.marketerPersonaName,
  });
  journey.icons = fillIconDefaults(journey.icons);
  normaliseJourneyDescriptions(journey, log_);

  const errs = validateJourney(journey, input.tier);
  if (errs.length) {
    res.status(502).json({
      error: 'Vertex AI response failed schema validation',
      validationErrors: errs,
      meta: journey.meta,
      log,
    });
    return;
  }

  let html;
  try {
    html = renderStandaloneHtml(journey, input);
  } catch (err) {
    res.status(500).json({ error: 'HTML render failed', detail: String(err.message || err), log });
    return;
  }

  log_(
    `generation pass: ms=${generationMs} slideCount=${(journey.slides || []).length} ` +
    `stepLabels=${(journey.stepLabels || []).length} ` +
    `retried=${generationRetried} repaired=${generationRepaired}`
  );
  log_(`generate ok client="${input.client}" tier=${input.tier} htmlBytes=${html.length}`);

  res.status(200).json({
    ok: true,
    meta: journey.meta,
    journey,
    html,
    sources: snippets.map((s) => ({
      id: s.id, title: s.title, source: s.source, libraryId: s.libraryId,
    })),
    // Debug-only field. The front-end intentionally ignores this; we
    // surface it so operators can inspect what the grounded research
    // pass actually returned (Cloud Logs already has the raw response).
    _research: {
      ms: research.ms,
      wantsTechStack: research.wantsTechStack,
      techStackResearch: research.techStackResearch,
      adobeFreshness: research.adobeFreshness,
      error: research.error || null,
    },
    log,
  });
}

async function handleRefine(req, res, opts = {}) {
  setCors(res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  const log = [];
  const log_ = (msg) => { log.push(`${new Date().toISOString()} ${msg}`); console.log(`[client-journey-v2] ${msg}`); };

  let request;
  try {
    const body = await readBody(req);
    request = normaliseRefineInput(body);
  } catch (err) {
    res.status(400).json({ error: 'Invalid request body', detail: String(err.message || err) });
    return;
  }

  const input = request.context;
  const sourceErrors = validateJourney(request.journey, input.tier);
  if (sourceErrors.length) {
    res.status(400).json({
      error: 'Provided journey failed schema validation',
      validationErrors: sourceErrors,
    });
    return;
  }
  log_(`refine start client="${input.client}" tier=${input.tier}`);

  const ctx7Key = (opts && opts.contextSevenKey) || '';
  if (!ctx7Key) log_('Context7 key missing — every topic will use the static-summary fallback');

  let snippets = [];
  try {
    snippets = await fetchExperienceLeagueContext(input.tier, ctx7Key);
    log_(`Context7 sources: ${snippets.map((s) => `${s.id}=${s.source}`).join(', ')}`);
  } catch (err) {
    log_(`Context7 fetch unexpectedly threw: ${err.message || err}`);
    snippets = CONTEXT7_TOPICS
      .filter((t) => t.tier === 'all' || t.tier === input.tier)
      .map((t) => ({
        id: t.id,
        title: t.query,
        source: 'fallback',
        libraryId: null,
        text: STATIC_DOC_FALLBACKS[t.id] || '',
      }));
  }

  let journey;
  let refinementMs = 0;
  let refinementRetried = false;
  let refinementRepaired = false;
  try {
    const out = await runRefinementPass(input, snippets, request.refinePrompt, request.journey);
    journey = out.journey;
    refinementMs = out.ms;
    refinementRetried = !!out.retried;
    refinementRepaired = !!out.repaired;
  } catch (err) {
    if (err && err.code === 'CJV2_JSON_PARSE_FAILED') {
      log_(`Gemini JSON parse failed during refine after repair + retry: ${err.message}`);
      res.status(502).json({
        error: 'Gemini returned malformed JSON even after repair. Please try refining again — transient model issue.',
        code: 'CJV2_JSON_PARSE_FAILED',
        details: err.details,
        log,
      });
      return;
    }
    log_(`Gemini refinement pass failed: ${err.message || err}`);
    res.status(502).json({
      error: 'Vertex AI Gemini failed to refine the journey',
      code: err && err.code,
      detail: String(err.message || err),
      log,
    });
    return;
  }

  journey.meta = Object.assign({}, journey.meta, {
    client: input.client,
    clientSlug: input.clientSlug,
    clientDomain: input.clientDomain,
    brandColor: normaliseHex(journey.meta && journey.meta.brandColor || input.brandColor),
    tier: input.tier,
    personaName: (journey.meta && journey.meta.personaName) || input.personaName,
    personaGender: (journey.meta && journey.meta.personaGender) || input.personaGender,
    marketerPersonaName: (journey.meta && journey.meta.marketerPersonaName) || input.marketerPersonaName,
    journeyType: (journey.meta && journey.meta.journeyType) || input.journeyType,
    additionalContext: (journey.meta && journey.meta.additionalContext) || input.additionalContext,
  });
  journey.icons = fillIconDefaults(journey.icons);
  normaliseJourneyDescriptions(journey, log_);

  const errs = validateJourney(journey, input.tier);
  if (errs.length) {
    res.status(502).json({
      error: 'Vertex AI refined response failed schema validation',
      validationErrors: errs,
      meta: journey.meta,
      log,
    });
    return;
  }

  let html;
  try {
    html = renderStandaloneHtml(journey, input);
  } catch (err) {
    res.status(500).json({ error: 'HTML render failed', detail: String(err.message || err), log });
    return;
  }

  log_(
    `refinement pass: ms=${refinementMs} slideCount=${(journey.slides || []).length} ` +
    `stepLabels=${(journey.stepLabels || []).length} ` +
    `retried=${refinementRetried} repaired=${refinementRepaired}`
  );
  log_(`refine ok client="${input.client}" tier=${input.tier} htmlBytes=${html.length}`);

  res.status(200).json({
    ok: true,
    meta: journey.meta,
    journey,
    html,
    sources: snippets.map((s) => ({
      id: s.id, title: s.title, source: s.source, libraryId: s.libraryId,
    })),
    log,
  });
}

async function handlePptx(req, res) {
  setCors(res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

  let body;
  try { body = await readBody(req); }
  catch { res.status(400).json({ error: 'Invalid JSON body' }); return; }
  if (!body || typeof body !== 'object') { res.status(400).json({ error: 'Empty body' }); return; }

  const journey = body.journey || body;
  if (!journey || !journey.meta) {
    res.status(400).json({ error: 'Missing journey.meta' });
    return;
  }

  // Re-validate the JSON so a tampered round-trip can't crash the renderer.
  const tier = journey.meta.tier === 'Advanced' ? 'Advanced' : 'Foundation';
  const errs = validateJourney(journey, tier);
  if (errs.length) {
    res.status(400).json({ error: 'Journey JSON failed schema validation', validationErrors: errs });
    return;
  }

  const input = {
    client: journey.meta.client,
    clientSlug: journey.meta.clientSlug || slugify(journey.meta.client),
    clientDomain: body.clientDomain || journey.meta.clientDomain || '',
    brandColor: normaliseHex(journey.meta.brandColor),
    personaName: journey.meta.personaName || '',
    personaGender: journey.meta.personaGender || 'female',
    tier,
  };

  let buf;
  try {
    buf = await renderPptx(journey, input);
  } catch (err) {
    res.status(500).json({ error: 'PPTX render failed', detail: String(err.message || err) });
    return;
  }

  const filename = `${input.clientSlug}-one-pager-v2.pptx`;
  res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
  res.set('Content-Disposition', `attachment; filename="${filename}"`);
  res.set('Cache-Control', 'no-store');
  res.status(200).send(buf);
}

module.exports = {
  handleGenerate,
  handleRefine,
  handlePptx,
  // Exported for unit-test harnesses (none committed yet).
  __internal: {
    NODES,
    PATH_SEGS,
    STEP_LABEL_GEOMETRY,
    STATIC_DOC_FALLBACKS,
    CONTEXT7_TOPICS,
    PINNED_LIBRARY_IDS,
    normaliseInput,
    normaliseRefineInput,
    normaliseJourneyDescriptions,
    validateJourney,
    renderStandaloneHtml,
    buildSystemPrompt,
    buildUserPrompt,
    buildRefineUserPrompt,
    buildResearchUserPrompt,
    parseResearchSections,
    runResearchPass,
    runGenerationPass,
    runRefinementPass,
    parseGenerationJson,
    stripGenerationFences,
  },
};
