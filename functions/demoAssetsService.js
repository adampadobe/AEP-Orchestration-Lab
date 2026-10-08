'use strict';

/**
 * Demo Asset Library — storage, classification, and render helpers for
 * self-contained customer demo HTML files.
 *
 * Assets are stored as a "skeleton" (HTML with large base64 data URIs replaced
 * by content-hash tokens) plus deduplicated media objects in a PRIVATE GCS
 * bucket. Metadata lives in Firestore (Admin SDK only). Only the skeleton text
 * and extracted outline are ever sent to Gemini.
 */

const crypto = require('crypto');
const admin = require('firebase-admin');

const COLLECTION = 'demoAssets';
const TOKEN_COLLECTION = 'demoAssetRenderTokens';
const DEFAULT_BUCKET = 'aep-orchestration-lab-demo-assets';
const PUBLIC_BUCKETS = new Set(['aep-orchestration-lab-brand-scrapes']);
const MEDIA_MIN_BASE64_CHARS = 2048;
const MAX_HTML_BYTES = 25 * 1024 * 1024;
const RENDER_TOKEN_TTL_MS = 60 * 60 * 1000;
const MEDIA_TOKEN_RE = /__DEMO_MEDIA_([a-f0-9]{64})__/g;
const DATA_URI_RE = /data:([a-z0-9.+-]+\/[a-z0-9.+-]+(?:;[a-z0-9-]+=[^;,"'()\s]+)*);base64,([A-Za-z0-9+/]+={0,2})/gi;

const CONVERSATION_TYPES = [
  'Decisioning',
  'Architecture',
  'Event kit',
  'Customer story',
  'Agents / Coworker',
  'Journey',
  'Other',
];

const EDITABLE_FIELDS = ['title', 'customer', 'industry', 'conversationType', 'event', 'tags', 'summary', 'notes'];

class DemoAssetsError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/** Replace large base64 data URIs with stable content-hash tokens. */
function extractMedia(html) {
  const media = new Map();
  const skeleton = String(html).replace(DATA_URI_RE, (whole, header, b64) => {
    if (b64.length < MEDIA_MIN_BASE64_CHARS) return whole;
    const bytes = Buffer.from(b64, 'base64');
    const hash = sha256Hex(Buffer.concat([Buffer.from(`${header.toLowerCase()}\n`), bytes]));
    if (!media.has(hash)) media.set(hash, { hash, header, bytes });
    return `__DEMO_MEDIA_${hash}__`;
  });
  return { skeleton, media: [...media.values()] };
}

function mediaHashesIn(skeleton) {
  const out = new Set();
  for (const m of String(skeleton).matchAll(MEDIA_TOKEN_RE)) out.add(m[1]);
  return [...out];
}

/** Restore tokens; mediaMap maps hash → { header, bytes }. */
function rehydrate(skeleton, mediaMap) {
  return String(skeleton).replace(MEDIA_TOKEN_RE, (whole, hash) => {
    const m = mediaMap instanceof Map ? mediaMap.get(hash) : mediaMap[hash];
    if (!m) throw new DemoAssetsError(500, `Missing media object ${hash.slice(0, 12)}`);
    return `data:${m.header};base64,${Buffer.from(m.bytes).toString('base64')}`;
  });
}

function decodeEntities(s) {
  return String(s)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

function stripTags(s) {
  return decodeEntities(String(s).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/** Deterministic outline used for both classification and later AI context. */
function extractMeta(html) {
  const src = String(html);
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(src);
  const meta = {};
  for (const m of src.matchAll(/<meta\s+[^>]*>/gi)) {
    const tag = m[0];
    const key = /(?:name|property)\s*=\s*["']([^"']+)["']/i.exec(tag);
    const content = /content\s*=\s*["']([^"']*)["']/i.exec(tag);
    if (key && content && !/viewport|charset/i.test(key[1])) meta[key[1].toLowerCase()] = decodeEntities(content[1]).slice(0, 300);
  }
  const headings = [];
  for (const m of src.matchAll(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi)) {
    const text = stripTags(m[2]);
    if (text && headings.length < 40) headings.push({ level: Number(m[1]), text: text.slice(0, 160) });
  }
  const body = src
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(MEDIA_TOKEN_RE, ' ')
    .replace(DATA_URI_RE, ' ');
  const bodyMatch = /<body[^>]*>([\s\S]*)<\/body>/i.exec(body);
  const text = stripTags(bodyMatch ? bodyMatch[1] : body);
  return {
    title: titleMatch ? stripTags(titleMatch[1]).slice(0, 200) : '',
    meta,
    headings,
    textExcerpt: text.slice(0, 6000),
    textLength: text.length,
  };
}

function cleanString(v, max = 200) {
  return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanTags(v) {
  const list = Array.isArray(v) ? v : String(v || '').split(',');
  return [...new Set(list.map((t) => cleanString(t, 40).toLowerCase()).filter(Boolean))].slice(0, 20);
}

function normaliseConversationType(v) {
  const s = cleanString(v, 60).toLowerCase();
  return CONVERSATION_TYPES.find((t) => t.toLowerCase() === s) || (s ? 'Other' : '');
}

/** Heuristic fallback when Gemini is unavailable. */
function heuristicClassification(meta, { filename = '', folderPath = '' } = {}) {
  const hay = `${filename} ${folderPath} ${meta.title} ${meta.headings.map((h) => h.text).join(' ')}`.toLowerCase();
  let conversationType = 'Other';
  if (/decision|offer|arbitration|next.best/.test(hay)) conversationType = 'Decisioning';
  else if (/architect|apps|integration/.test(hay)) conversationType = 'Architecture';
  else if (/agent|coworker|co-worker/.test(hay)) conversationType = 'Agents / Coworker';
  else if (/story|case.study/.test(hay)) conversationType = 'Customer story';
  else if (/journey/.test(hay)) conversationType = 'Journey';
  const folder = cleanString(String(folderPath).split('/').filter(Boolean).pop() || '', 80);
  return {
    customer: '',
    industry: '',
    conversationType,
    event: folder,
    tags: [],
    summary: meta.title || filename,
    title: meta.title || filename.replace(/\.html?$/i, ''),
    source: 'heuristic',
  };
}

const CLASSIFY_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    customer: { type: 'string' },
    industry: { type: 'string' },
    conversationType: { type: 'string', enum: CONVERSATION_TYPES },
    event: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' },
  },
  required: ['title', 'customer', 'conversationType', 'summary'],
};

const CLASSIFY_SYSTEM = [
  'You classify Adobe Experience Cloud sales demo assets (self-contained HTML pages used as customer conversation starters).',
  'Return JSON only. "customer" is the named customer brand the asset is tailored to (empty string if generic or an event kit).',
  '"event" is a named event or programme (for example LEAP or WAF) if the asset is part of an event kit, else empty.',
  '"conversationType" must be one of the allowed values. "summary" is one or two sentences describing the story the asset tells.',
  '"tags" are up to 8 short lowercase topics (Adobe products, channels, industry themes). Do not invent facts not present in the input.',
].join(' ');

async function classifyAsset(meta, context = {}, deps = {}) {
  const fallback = heuristicClassification(meta, context);
  const callGemini = deps.callGemini;
  if (!callGemini) return fallback;
  const user = JSON.stringify({
    filename: context.filename || '',
    folderPath: context.folderPath || '',
    title: meta.title,
    meta: meta.meta,
    headings: meta.headings,
    textExcerpt: meta.textExcerpt.slice(0, 4000),
  });
  try {
    const raw = await callGemini(CLASSIFY_SYSTEM, user, {
      model: 'gemini-2.5-flash',
      jsonMode: true,
      responseSchema: CLASSIFY_SCHEMA,
      maxOutputTokens: 1024,
      temperature: 0.1,
    });
    const parsed = typeof raw === 'string'
      ? JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, ''))
      : raw;
    return {
      title: cleanString(parsed.title, 200) || fallback.title,
      customer: cleanString(parsed.customer, 120),
      industry: cleanString(parsed.industry, 80),
      conversationType: normaliseConversationType(parsed.conversationType) || fallback.conversationType,
      event: cleanString(parsed.event, 80) || fallback.event,
      tags: cleanTags(parsed.tags),
      summary: cleanString(parsed.summary, 600),
      source: 'gemini-2.5-flash',
    };
  } catch (e) {
    return { ...fallback, classifyError: cleanString(e && e.message, 200) };
  }
}

/** Validate an editable metadata patch. Unknown fields are rejected. */
function sanitisePatch(body) {
  const patch = {};
  for (const [k, v] of Object.entries(body || {})) {
    if (k === 'status') {
      if (v !== 'ready') throw new DemoAssetsError(400, 'status may only be set to "ready"');
      patch.status = 'ready';
      continue;
    }
    if (!EDITABLE_FIELDS.includes(k)) throw new DemoAssetsError(400, `Field "${k}" is not editable`);
    if (k === 'tags') patch.tags = cleanTags(v);
    else if (k === 'conversationType') patch.conversationType = normaliseConversationType(v);
    else patch[k] = cleanString(v, k === 'summary' || k === 'notes' ? 2000 : 200);
  }
  if (patch.title === '') throw new DemoAssetsError(400, 'title cannot be empty');
  return patch;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function allowedDomains() {
  return String(process.env.DEMO_ASSETS_ALLOWED_DOMAINS || 'adobe.com')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

function assertAllowedUser(claims) {
  if (!claims || !claims.uid) throw new DemoAssetsError(401, 'Sign in with your Adobe account to use the Demo Asset Library.');
  if (claims.isAnonymous || !claims.email) throw new DemoAssetsError(403, 'Anonymous sessions cannot access the Demo Asset Library.');
  const domain = claims.email.split('@').pop();
  if (!allowedDomains().includes(domain)) throw new DemoAssetsError(403, 'The Demo Asset Library is restricted to Adobe accounts.');
  return { uid: claims.uid, email: claims.email, name: claims.name || '' };
}

// ---------------------------------------------------------------------------
// Storage (GCS private bucket + Firestore)
// ---------------------------------------------------------------------------

function bucketName() {
  const name = String(process.env.DEMO_ASSETS_BUCKET || DEFAULT_BUCKET).trim();
  if (PUBLIC_BUCKETS.has(name)) throw new DemoAssetsError(500, `Refusing to store customer assets in public bucket ${name}`);
  return name;
}

function ensureApp() {
  if (!admin.apps.length) admin.initializeApp();
}

function getBucket() {
  ensureApp();
  return admin.storage().bucket(bucketName());
}

function getDb() {
  ensureApp();
  return admin.firestore();
}

function mediaPath(hash) {
  return `media/${hash}`;
}

function skeletonPath(assetId, versionId) {
  return `assets/${assetId}/versions/${versionId}/skeleton.html`;
}

async function saveMedia(bucket, items) {
  await Promise.all(items.map(async (m) => {
    const file = bucket.file(mediaPath(m.hash));
    const [exists] = await file.exists();
    if (exists) return;
    await file.save(m.bytes, {
      resumable: false,
      contentType: 'application/octet-stream',
      metadata: { cacheControl: 'private, max-age=0', metadata: { dataUriHeader: m.header } },
    });
  }));
}

async function loadMedia(bucket, hashes) {
  const map = new Map();
  await Promise.all(hashes.map(async (hash) => {
    const file = bucket.file(mediaPath(hash));
    const [[bytes], [md]] = await Promise.all([file.download(), file.getMetadata()]);
    const header = md && md.metadata && md.metadata.dataUriHeader;
    if (!header) throw new DemoAssetsError(500, `Media ${hash.slice(0, 12)} has no data URI header`);
    map.set(hash, { header, bytes });
  }));
  return map;
}

function toPublicAsset(id, d) {
  return {
    id,
    title: d.title || '',
    customer: d.customer || '',
    industry: d.industry || '',
    conversationType: d.conversationType || '',
    event: d.event || '',
    tags: d.tags || [],
    summary: d.summary || '',
    notes: d.notes || '',
    status: d.status || 'ready',
    originalFilename: d.originalFilename || '',
    folderPath: d.folderPath || '',
    sha256: d.sha256 || '',
    sizes: d.sizes || {},
    outline: d.outline || null,
    classification: d.classification || null,
    currentVersionId: d.currentVersionId || '',
    derivedFrom: d.derivedFrom || null,
    createdBy: d.createdBy || null,
    createdAt: d.createdAt && d.createdAt.toDate ? d.createdAt.toDate().toISOString() : d.createdAt || null,
    updatedAt: d.updatedAt && d.updatedAt.toDate ? d.updatedAt.toDate().toISOString() : d.updatedAt || null,
  };
}

async function listAssets() {
  const snap = await getDb().collection(COLLECTION).orderBy('createdAt', 'desc').limit(1000).get();
  return snap.docs.map((doc) => toPublicAsset(doc.id, doc.data()));
}

async function getAssetDoc(id) {
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(String(id || ''))) throw new DemoAssetsError(400, 'Invalid asset id');
  const ref = getDb().collection(COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new DemoAssetsError(404, 'Asset not found');
  return { ref, data: snap.data() };
}

async function getAsset(id) {
  const { data } = await getAssetDoc(id);
  return toPublicAsset(id, data);
}

async function findBySha(sha) {
  const snap = await getDb().collection(COLLECTION).where('sha256', '==', sha).limit(1).get();
  return snap.empty ? null : toPublicAsset(snap.docs[0].id, snap.docs[0].data());
}

/**
 * Store a dropped HTML file. Returns { asset, duplicate } — when the exact
 * file already exists and force is false, nothing is written.
 */
async function createAsset({ html, filename, folderPath, force }, user, deps = {}) {
  if (typeof html !== 'string' || !html.trim()) throw new DemoAssetsError(400, 'html is required');
  const htmlBytes = Buffer.byteLength(html, 'utf8');
  if (htmlBytes > MAX_HTML_BYTES) throw new DemoAssetsError(413, `HTML exceeds ${MAX_HTML_BYTES / 1024 / 1024} MB`);
  if (!/<html[\s>]|<body[\s>]|<!doctype html/i.test(html)) throw new DemoAssetsError(400, 'File does not look like an HTML document');

  const sha256 = sha256Hex(html);
  if (!force) {
    const existing = await findBySha(sha256);
    if (existing) return { asset: existing, duplicate: true };
  }

  const { skeleton, media } = extractMedia(html);
  const meta = extractMeta(skeleton);
  const classification = await classifyAsset(meta, { filename, folderPath }, deps);

  const db = getDb();
  const ref = db.collection(COLLECTION).doc();
  const versionRef = ref.collection('versions').doc();
  const bucket = getBucket();
  await saveMedia(bucket, media);
  await bucket.file(skeletonPath(ref.id, versionRef.id)).save(skeleton, {
    resumable: false,
    contentType: 'text/html; charset=utf-8',
    metadata: { cacheControl: 'private, max-age=0' },
  });

  const now = admin.firestore.FieldValue.serverTimestamp();
  const createdBy = { uid: user.uid, email: user.email, name: user.name };
  const sizes = {
    htmlBytes,
    skeletonBytes: Buffer.byteLength(skeleton, 'utf8'),
    mediaCount: media.length,
    mediaBytes: media.reduce((n, m) => n + m.bytes.length, 0),
  };
  const doc = {
    title: classification.title,
    customer: classification.customer,
    industry: classification.industry,
    conversationType: classification.conversationType,
    event: classification.event,
    tags: classification.tags,
    summary: classification.summary,
    notes: '',
    status: 'needs_review',
    originalFilename: cleanString(filename, 200),
    folderPath: cleanString(folderPath, 300),
    sha256,
    sizes,
    outline: { title: meta.title, headings: meta.headings.slice(0, 20), textLength: meta.textLength },
    classification: { source: classification.source, error: classification.classifyError || null },
    currentVersionId: versionRef.id,
    derivedFrom: null,
    createdBy,
    createdAt: now,
    updatedAt: now,
  };
  const batch = db.batch();
  batch.set(ref, doc);
  batch.set(versionRef, {
    skeletonPath: skeletonPath(ref.id, versionRef.id),
    mediaHashes: media.map((m) => m.hash),
    sha256,
    note: 'Original upload',
    createdBy,
    createdAt: now,
  });
  await batch.commit();
  return { asset: toPublicAsset(ref.id, { ...doc, createdAt: null, updatedAt: null }), duplicate: false };
}

async function updateAsset(id, body, user) {
  const { ref } = await getAssetDoc(id);
  const patch = sanitisePatch(body);
  if (!Object.keys(patch).length) throw new DemoAssetsError(400, 'Nothing to update');
  await ref.update({
    ...patch,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedBy: { uid: user.uid, email: user.email },
  });
  return getAsset(id);
}

async function deleteAsset(id) {
  const { ref } = await getAssetDoc(id);
  const bucket = getBucket();
  const versions = await ref.collection('versions').get();
  await bucket.deleteFiles({ prefix: `assets/${id}/` });
  const batch = getDb().batch();
  versions.docs.forEach((v) => batch.delete(v.ref));
  batch.delete(ref);
  await batch.commit();
  // Media objects are content-addressed and may be shared; they are left in place.
  return { ok: true, id };
}

async function loadRenderedHtml(id) {
  const { ref, data } = await getAssetDoc(id);
  const vSnap = await ref.collection('versions').doc(data.currentVersionId).get();
  if (!vSnap.exists) throw new DemoAssetsError(500, 'Current version is missing');
  const bucket = getBucket();
  const [buf] = await bucket.file(vSnap.data().skeletonPath).download();
  const skeleton = buf.toString('utf8');
  const media = await loadMedia(bucket, mediaHashesIn(skeleton));
  return { html: rehydrate(skeleton, media), asset: toPublicAsset(id, data) };
}

async function createRenderToken(id, user) {
  await getAssetDoc(id);
  const token = crypto.randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + RENDER_TOKEN_TTL_MS);
  await getDb().collection(TOKEN_COLLECTION).doc(token).set({
    assetId: id,
    uid: user.uid,
    expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
  });
  return { token, expiresAt: expiresAt.toISOString(), url: `/api/demo-assets/render/${token}` };
}

async function resolveRenderToken(token) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(String(token || ''))) throw new DemoAssetsError(404, 'Not found');
  const snap = await getDb().collection(TOKEN_COLLECTION).doc(token).get();
  if (!snap.exists) throw new DemoAssetsError(404, 'Not found');
  const d = snap.data();
  if (!d.expiresAt || d.expiresAt.toMillis() < Date.now()) throw new DemoAssetsError(410, 'Preview link expired — reopen it from the library.');
  return d.assetId;
}

/** Headers that force the rendered asset into an opaque-origin sandbox. */
const RENDER_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy': 'sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms allow-modals',
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};

function safeDownloadName(asset) {
  const base = [asset.customer, asset.title].filter(Boolean).join(' - ') || asset.originalFilename || 'demo-asset';
  return `${base.replace(/\.html?$/i, '').replace(/[^A-Za-z0-9 ._-]+/g, '').trim().slice(0, 120) || 'demo-asset'}.html`;
}

module.exports = {
  CONVERSATION_TYPES,
  RENDER_HEADERS,
  DemoAssetsError,
  extractMedia,
  rehydrate,
  mediaHashesIn,
  extractMeta,
  heuristicClassification,
  classifyAsset,
  sanitisePatch,
  assertAllowedUser,
  bucketName,
  listAssets,
  getAsset,
  createAsset,
  updateAsset,
  deleteAsset,
  loadRenderedHtml,
  createRenderToken,
  resolveRenderToken,
  safeDownloadName,
};
