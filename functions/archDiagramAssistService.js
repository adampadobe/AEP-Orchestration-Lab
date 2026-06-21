/**
 * Vertex AI assistant for the AEP & Apps architecture diagram tool.
 *
 * Mirrors the client-journey asset pattern: Gemini structured JSON via
 * vertexClient.callGemini, long timeout on a dedicated Cloud Function export.
 *
 * MVP scope: tour copy/highlights/flows, custom logo boxes, simple connectors.
 * Geometry edits to canonical platform nodes are suggested in prose only (Phase 2).
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { callGemini, stripJsonFences } = require('./vertexClient');

const LOGO_CATALOG_PATH = path.join(
  __dirname,
  '..',
  'web',
  'profile-viewer',
  'data',
  'architecture-logos.json'
);
const TAXONOMY_PATH = path.join(
  __dirname,
  '..',
  'web',
  'profile-viewer',
  'data',
  'martech-taxonomy-reference.json'
);

const NODE_KEYS = [
  'tags', 'sources', 'edge', 'creative', 'aem', 'aep', 'streaming', 'batch',
  'query', 'intel', 'lake', 'pipeline', 'profile', 'identity', 'seg', 'decision',
  'jo', 'rtcdp', 'cja', 'mix', 'inbound', 'msg', 'paid', 'jrpt', 'mrpt',
];

const NODE_LABELS = {
  tags: 'Tags',
  sources: 'Sources',
  edge: 'Edge Network',
  creative: 'Creative Cloud',
  aem: 'AEM Assets',
  aep: 'Adobe Experience Platform',
  streaming: 'Streaming collection',
  batch: 'Batch collection',
  query: 'Query Service',
  intel: 'Intelligence & AI',
  lake: 'Data Lake',
  pipeline: 'Pipeline',
  profile: 'Real-Time Profile',
  identity: 'Identity Graph',
  seg: 'Segmentation',
  decision: 'Decisioning / Journeys',
  jo: 'Journey Optimizer',
  rtcdp: 'Real-Time CDP',
  cja: 'Customer Journey Analytics',
  mix: 'Mix Modeler',
  inbound: 'Inbound experiences',
  msg: 'Message Delivery',
  paid: 'Paid Media',
  jrpt: 'Journey Reporting',
  mrpt: 'Marketing performance',
};

const FLOW_IDS = [
  'flow-tags-edge',
  'flow-sources-stream',
  'flow-sources-batch',
  'flow-stream-lake',
  'flow-batch-lake',
  'flow-lake-pipeline',
  'flow-pipeline-profile',
  'flow-edge-profile',
  'flow-profile-seg',
  'flow-seg-jo',
  'flow-profile-cdp',
  'flow-edge-inbound',
  'flow-jo-msg',
  'flow-cdp-paid',
  'flow-cja-jrpt',
  'flow-mix-mrpt',
];

const FLOW_KINDS = ['ingress', 'intra', 'egress'];
const HIGHLIGHT_PREFIX = 'node-';
const VALID_ACTION_TYPES = new Set([
  'updateTourState',
  'replaceTour',
  'addCustomBox',
  'addUserLine',
]);

let logoCatalogCache;
let taxonomyCache;

function loadJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    console.warn('[arch-diagram-assist] could not load', filePath, e.message);
    return null;
  }
}

function setCors(res, methods = 'POST, OPTIONS') {
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
    req.on('data', (c) => { raw += c; if (raw.length > 2_000_000) req.destroy(); });
    req.on('end', () => {
      if (!raw) return resolve(null);
      try { resolve(JSON.parse(raw)); } catch { resolve(null); }
    });
    req.on('error', () => resolve(null));
  });
}

function getLogoCatalog() {
  if (logoCatalogCache === undefined) logoCatalogCache = loadJsonFile(LOGO_CATALOG_PATH);
  return logoCatalogCache;
}

function getTaxonomy() {
  if (taxonomyCache === undefined) taxonomyCache = loadJsonFile(TAXONOMY_PATH);
  return taxonomyCache;
}

/** Slim logo list for the system prompt (cap token use). */
function buildLogoCatalogSummary(maxEntries = 180) {
  const catalog = getLogoCatalog();
  if (!catalog || !Array.isArray(catalog.logos)) {
    return { count: 0, entries: [], tagGroups: [] };
  }
  const logos = catalog.logos;
  const entries = [];
  const tagCounts = {};
  for (let i = 0; i < logos.length && entries.length < maxEntries; i += 1) {
    const L = logos[i];
    if (!L || !L.file || !L.label) continue;
    const tags = Array.isArray(L.tags) ? L.tags.slice(0, 4) : [];
    entries.push({
      file: String(L.file),
      label: String(L.label).slice(0, 80),
      tags,
    });
    tags.forEach((t) => {
      tagCounts[t] = (tagCounts[t] || 0) + 1;
    });
  }
  const tagGroups = Object.keys(tagCounts)
    .sort((a, b) => tagCounts[b] - tagCounts[a])
    .slice(0, 24)
    .map((tag) => ({ tag, count: tagCounts[tag] }));
  return { count: logos.length, entries, tagGroups };
}

function buildSystemPrompt() {
  const logoSummary = buildLogoCatalogSummary();
  const taxonomy = getTaxonomy();
  const taxonomyNote = taxonomy && taxonomy.note
    ? String(taxonomy.note).slice(0, 400)
    : 'Martech taxonomy tags classify ecosystem vendor and Adobe catalog logos.';

  const nodeCatalog = NODE_KEYS.map((k) => ({
    key: k,
    domId: HIGHLIGHT_PREFIX + k,
    label: NODE_LABELS[k] || k,
  }));

  return [
    'You are an Adobe Enterprise Architecture (EA) presentation assistant embedded in the AEP Orchestration Lab.',
    'You help architects ideate and refine the interactive "AEP & Apps" reference architecture diagram and its deck-aligned tour.',
    '',
    '## Design principles (Adobe EA deck alignment)',
    '- One narrative beat per tour state: headline + 1–3 short body sentences; avoid walls of text.',
    '- Highlights should focus attention (typically 2–5 boxes per slide); do not highlight every node.',
    '- Animated flows use built-in SVG path ids with kind ingress (blue #308fff), intra (grey #7d8a9e), or egress (red #e34850).',
    '- Custom vendor/logo boxes use productLogo kind with logoFile paths from the catalog; place inside viewBox 0–1200 × 0–680.',
    '- Prefer Adobe product names customers recognize (Real-Time CDP, Journey Optimizer, Customer Journey Analytics, Mix Modeler).',
    '- When adding third-party systems, pick logos from the catalog and place near Sources or Engagement columns.',
    '- Do not rename or move canonical platform node ids (node-*); suggest copy and highlights instead.',
    '',
    '## Platform node catalog (highlights use domId)',
    JSON.stringify(nodeCatalog),
    '',
    '## Built-in animated flow path ids',
    JSON.stringify(FLOW_IDS),
    'Flow kind must be one of: ' + FLOW_KINDS.join(', '),
    '',
    '## Tour state schema (each state in tour.states[])',
    '{ label, headline, body, highlights: string[] (dom ids), flows: [{ id, kind }], userLineIds?: string[] }',
    '',
    '## Logo catalog (' + logoSummary.count + ' total; showing ' + logoSummary.entries.length + ')',
    taxonomyNote,
    'Tag groups: ' + JSON.stringify(logoSummary.tagGroups),
    'Entries (use exact file path for addCustomBox.logoFile):',
    JSON.stringify(logoSummary.entries),
    '',
    '## Response contract',
    'Return ONE JSON object only (no markdown fences):',
    '{',
    '  "assistantMessage": "concise explanation of what you changed and why",',
    '  "actions": [',
    '    { "type": "updateTourState", "stateIndex": 0, "patch": { "label"?, "headline"?, "body"?, "highlights"?, "flows"? } },',
    '    { "type": "replaceTour", "tour": { "version": 1, "states": [ ...full states array... ] } },',
    '    { "type": "addCustomBox", "box": { "name", "x", "y", "w", "h", "logoFile", "kind": "productLogo", "logoDescription"? } },',
    '    { "type": "addUserLine", "line": { "from": { "kind": "free", "x", "y" }, "to": { "kind": "free", "x", "y" }, "stroke"?, "lineArrows"?: "none"|"end"|"both" } }',
    '  ]',
    '}',
    '',
    'Rules:',
    '- Use updateTourState for surgical edits; replaceTour only when restructuring many states.',
    '- highlights entries MUST be dom ids like "node-aep", "node-cbox-<id>" is NOT valid for platform nodes only node-* and custom boxes are highlighted by node-cbox-* after creation (prefer platform nodes in MVP).',
    '- flows entries: id must be from FLOW_IDS; kind from FLOW_KINDS; omit stroke (client applies palette).',
    '- addCustomBox: x,y,w,h numbers; logoFile must match catalog file exactly; kind productLogo when logoFile set.',
    '- Keep actions minimal and safe; if the user asks for something unsupported (e.g. moving AEP node geometry), explain in assistantMessage and use tour/box actions only.',
  ].join('\n');
}

function normaliseHighlightId(id) {
  const s = String(id || '').trim();
  if (!s) return null;
  if (s.indexOf(HIGHLIGHT_PREFIX) === 0) return s;
  if (NODE_KEYS.indexOf(s) >= 0) return HIGHLIGHT_PREFIX + s;
  return s;
}

function sanitiseFlow(f) {
  if (!f || typeof f !== 'object') return null;
  const id = String(f.id || '').trim();
  if (FLOW_IDS.indexOf(id) < 0) return null;
  const kind = FLOW_KINDS.indexOf(f.kind) >= 0 ? f.kind : 'intra';
  return { id, kind };
}

function sanitiseTourState(st) {
  if (!st || typeof st !== 'object') return null;
  const out = {};
  if (typeof st.label === 'string') out.label = st.label.slice(0, 120);
  if (typeof st.headline === 'string') out.headline = st.headline.slice(0, 240);
  if (typeof st.body === 'string') out.body = st.body.slice(0, 2000);
  if (Array.isArray(st.highlights)) {
    out.highlights = st.highlights
      .map(normaliseHighlightId)
      .filter(Boolean)
      .slice(0, 32);
  }
  if (Array.isArray(st.flows)) {
    out.flows = st.flows.map(sanitiseFlow).filter(Boolean).slice(0, 16);
  }
  if (Array.isArray(st.userLineIds)) {
    out.userLineIds = st.userLineIds.map((x) => String(x)).slice(0, 32);
  }
  return out;
}

function sanitiseActions(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (let i = 0; i < raw.length; i += 1) {
    const a = raw[i];
    if (!a || typeof a !== 'object') continue;
    const type = String(a.type || '').trim();
    if (!VALID_ACTION_TYPES.has(type)) continue;

    if (type === 'updateTourState') {
      const stateIndex = Number(a.stateIndex);
      if (!Number.isInteger(stateIndex) || stateIndex < 0 || stateIndex > 64) continue;
      const patch = sanitiseTourState(a.patch || {});
      if (!patch || !Object.keys(patch).length) continue;
      out.push({ type, stateIndex, patch });
      continue;
    }

    if (type === 'replaceTour') {
      const tour = a.tour;
      if (!tour || !Array.isArray(tour.states) || !tour.states.length) continue;
      const states = tour.states.map(sanitiseTourState).filter(Boolean).slice(0, 32);
      if (!states.length) continue;
      out.push({ type, tour: { version: 1, states } });
      continue;
    }

    if (type === 'addCustomBox') {
      const box = a.box;
      if (!box || typeof box !== 'object') continue;
      const name = String(box.name || 'New box').slice(0, 120);
      const x = Number(box.x);
      const y = Number(box.y);
      const w = Number(box.w) || 80;
      const h = Number(box.h) || 48;
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const entry = {
        name,
        x: Math.max(0, Math.min(1180, x)),
        y: Math.max(0, Math.min(660, y)),
        w: Math.max(24, Math.min(400, w)),
        h: Math.max(20, Math.min(200, h)),
        fill: typeof box.fill === 'string' ? box.fill.slice(0, 32) : '#e5e7eb',
        stroke: typeof box.stroke === 'string' ? box.stroke.slice(0, 32) : '#94a3b8',
      };
      const logoFile = String(box.logoFile || '').trim();
      if (logoFile) {
        entry.kind = 'productLogo';
        entry.logoFile = logoFile.slice(0, 260);
        if (typeof box.logoDescription === 'string' && box.logoDescription.trim()) {
          entry.logoDescription = box.logoDescription.trim().slice(0, 500);
        }
      }
      out.push({ type, box: entry });
      continue;
    }

    if (type === 'addUserLine') {
      const line = a.line;
      if (!line || typeof line !== 'object') continue;
      function ep(v) {
        if (!v || typeof v !== 'object') return null;
        const x = Number(v.x);
        const y = Number(v.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        return { kind: 'free', x, y };
      }
      const from = ep(line.from);
      const to = ep(line.to);
      if (!from || !to) continue;
      const lar = line.lineArrows === 'none' || line.lineArrows === 'end' || line.lineArrows === 'both'
        ? line.lineArrows
        : 'end';
      out.push({
        type,
        line: {
          from,
          to,
          points: [{ x: from.x, y: from.y }, { x: to.x, y: to.y }],
          stroke: typeof line.stroke === 'string' ? line.stroke.slice(0, 32) : '#308fff',
          strokeWidth: 2,
          lineArrows: lar,
          dashStyle: 'solid',
        },
      });
    }
  }
  return out.slice(0, 24);
}

function normaliseInput(body) {
  if (!body || typeof body !== 'object') throw new Error('JSON body required');
  const prompt = String(body.prompt || body.message || '').trim();
  if (!prompt) throw new Error('prompt is required');
  if (prompt.length > 8000) throw new Error('prompt too long (max 8000 chars)');

  const currentStateIndex = Number.isInteger(Number(body.currentStateIndex))
    ? Number(body.currentStateIndex)
    : 0;

  const tour = body.tour && typeof body.tour === 'object' ? body.tour : null;
  const layoutSummary = body.layoutSummary && typeof body.layoutSummary === 'object'
    ? body.layoutSummary
    : null;

  const history = Array.isArray(body.history)
    ? body.history
        .filter((h) => h && typeof h.role === 'string' && typeof h.content === 'string')
        .slice(-8)
        .map((h) => ({
          role: h.role === 'assistant' ? 'assistant' : 'user',
          content: String(h.content).slice(0, 4000),
        }))
    : [];

  return {
    prompt,
    currentStateIndex,
    tour,
    layoutSummary,
    history,
  };
}

async function handleAssist(req, res) {
  setCors(res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'POST only' }); return; }

  let input;
  try {
    const body = await readBody(req);
    input = normaliseInput(body);
  } catch (err) {
    res.status(400).json({ ok: false, error: String(err.message || err) });
    return;
  }

  const userPayload = {
    instruction:
      'The user is editing the AEP & Apps architecture diagram in Edit mode. ' +
      'Apply their request by returning assistantMessage plus a minimal actions array. ' +
      'Prefer updateTourState for the current or named states; use addCustomBox for new vendor/system tiles.',
    userRequest: input.prompt,
    currentStateIndex: input.currentStateIndex,
    tour: input.tour,
    layoutSummary: input.layoutSummary,
    conversationHistory: input.history,
  };

  try {
    const raw = await callGemini(buildSystemPrompt(), JSON.stringify(userPayload), {
      maxOutputTokens: 16384,
      temperature: 0.35,
      jsonMode: true,
      retryOn429: true,
      retryOn429DelayMs: 30000,
      retryOn429Attempts: 1,
    });

    let parsed;
    try {
      parsed = JSON.parse(stripJsonFences(raw));
    } catch (e) {
      throw new Error('Gemini returned invalid JSON: ' + e.message);
    }

    const assistantMessage = String(parsed.assistantMessage || parsed.message || '').trim()
      || 'Suggested diagram updates are ready to apply.';
    const actions = sanitiseActions(parsed.actions);

    res.status(200).json({
      ok: true,
      assistantMessage,
      actions,
      meta: {
        actionCount: actions.length,
        model: process.env.VERTEX_GEMINI_MODEL || 'gemini-2.5-pro',
      },
    });
  } catch (err) {
    const code = err && err.code === 'RATE_LIMITED' ? 429 : 500;
    res.status(code).json({
      ok: false,
      error: String(err.message || err),
      code: err.code || undefined,
    });
  }
}

module.exports = { handleAssist, buildSystemPrompt, sanitiseActions, __internal: { NODE_KEYS, FLOW_IDS } };
