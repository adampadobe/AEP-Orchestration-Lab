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
const DEMO_RENDER_ORIGIN = 'https://aep-orchestration-lab-demo-render.web.app';
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

// ---------------------------------------------------------------------------
// Near-duplicate detection (64-bit SimHash over word 5-shingles)
// ---------------------------------------------------------------------------

const SIMHASH_SHINGLE = 5;
const SIMHASH_MAX_TOKENS = 200000;
const SIMILAR_MAX_DISTANCE = 10;
const MAX_SIMILAR = 5;

/**
 * Fingerprint the whole skeleton (markup, copy and scripts) minus media, so
 * JS-rendered demos are comparable and a rebrand of the same deck still matches.
 * Returns a 16-char hex string, or '' when there is too little content.
 */
function computeSimHash(html) {
  const src = String(html || '').replace(MEDIA_TOKEN_RE, ' ').replace(DATA_URI_RE, ' ').toLowerCase();
  const tokens = src.match(/[a-z0-9]{2,}/g) || [];
  if (tokens.length > SIMHASH_MAX_TOKENS) tokens.length = SIMHASH_MAX_TOKENS;
  if (tokens.length < SIMHASH_SHINGLE * 4) return '';
  const shingles = new Set();
  for (let i = 0; i + SIMHASH_SHINGLE <= tokens.length; i += 1) {
    shingles.add(tokens.slice(i, i + SIMHASH_SHINGLE).join(' '));
  }
  const counts = new Int32Array(64);
  for (const sh of shingles) {
    const h = crypto.createHash('sha1').update(sh).digest();
    for (let bit = 0; bit < 64; bit += 1) {
      counts[bit] += (h[bit >> 3] >> (bit & 7)) & 1 ? 1 : -1;
    }
  }
  let out = 0n;
  for (let bit = 0; bit < 64; bit += 1) if (counts[bit] > 0) out |= 1n << BigInt(bit);
  return out.toString(16).padStart(16, '0');
}

function simHashDistance(a, b) {
  if (!/^[a-f0-9]{16}$/.test(a || '') || !/^[a-f0-9]{16}$/.test(b || '')) return null;
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let n = 0;
  while (x) { n += Number(x & 1n); x >>= 1n; }
  return n;
}

/** Assets whose fingerprint is within SIMILAR_MAX_DISTANCE bits, closest first. */
function findSimilarAssets(simHash, assets, { excludeId, maxDistance = SIMILAR_MAX_DISTANCE } = {}) {
  if (!simHash) return [];
  const out = [];
  for (const a of assets || []) {
    if (!a || a.id === excludeId || !a.simHash) continue;
    const d = simHashDistance(simHash, a.simHash);
    if (d == null || d > maxDistance) continue;
    out.push({ id: a.id, title: a.title, customer: a.customer, conversationType: a.conversationType, distance: d, score: Math.round((1 - d / 64) * 100) / 100 });
  }
  return out.sort((x, y) => x.distance - y.distance).slice(0, MAX_SIMILAR);
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
    deleted: d.deleted === true,
    deletedAt: d.deletedAt && d.deletedAt.toDate ? d.deletedAt.toDate().toISOString() : d.deletedAt || null,
    originalFilename: d.originalFilename || '',
    folderPath: d.folderPath || '',
    sha256: d.sha256 || '',
    simHash: d.simHash || '',
    sizes: d.sizes || {},
    outline: d.outline || null,
    classification: d.classification || null,
    currentVersionId: d.currentVersionId || '',
    derivedFrom: d.derivedFrom || null,
    adaptationBrief: d.adaptationBrief || null,
    createdBy: d.createdBy || null,
    createdAt: d.createdAt && d.createdAt.toDate ? d.createdAt.toDate().toISOString() : d.createdAt || null,
    updatedAt: d.updatedAt && d.updatedAt.toDate ? d.updatedAt.toDate().toISOString() : d.updatedAt || null,
  };
}

function encodeCursor(id) {
  return Buffer.from(String(id)).toString('base64url');
}

function decodeCursor(cursor, pattern = /^[A-Za-z0-9_-]{6,64}$/) {
  if (!cursor) return '';
  try {
    const id = Buffer.from(String(cursor), 'base64url').toString('utf8');
    if (!pattern.test(id)) throw new Error('bad cursor');
    return id;
  } catch (_e) {
    throw new DemoAssetsError(400, 'Invalid cursor');
  }
}

function matchesAssetSearch(asset, query) {
  if (!query) return true;
  const needle = query.toLowerCase();
  const values = [asset.title, asset.customer, asset.industry, asset.conversationType, asset.event,
    asset.summary, asset.originalFilename, ...(asset.tags || [])];
  return values.some((value) => String(value || '').toLowerCase().includes(needle));
}

async function listAssets(options) {
  const db = getDb();
  const collection = db.collection(COLLECTION);
  if (!options) {
    return (await listAllAssets()).slice(0, 1000);
  }

  const limit = Math.min(Math.max(Number(options.limit) || 100, 1), 200);
  const query = cleanString(options.q, 200).toLowerCase();
  const includeDeleted = options.deleted === true;
  const cursorId = decodeCursor(options.cursor);
  let cursor = cursorId ? await collection.doc(cursorId).get() : null;
  if (cursorId && !cursor.exists) throw new DemoAssetsError(400, 'Invalid cursor');
  const selected = [];
  let exhausted = false;
  while (selected.length <= limit && !exhausted) {
    let q = collection.orderBy('createdAt', 'desc');
    if (cursor) q = q.startAfter(cursor);
    const snap = await q.limit(500).get();
    if (!snap.docs.length) break;
    cursor = snap.docs[snap.docs.length - 1];
    exhausted = snap.docs.length < 500;
    for (const doc of snap.docs) {
      const data = doc.data();
      if ((data.deleted === true) !== includeDeleted) continue;
      const asset = toPublicAsset(doc.id, data);
      if (!matchesAssetSearch(asset, query)) continue;
      selected.push({ doc, asset });
      if (selected.length > limit) break;
    }
    if (selected.length > limit) break;
  }
  const hasMore = selected.length > limit;
  const page = selected.slice(0, limit);
  return {
    assets: page.map((entry) => entry.asset),
    nextCursor: hasMore ? encodeCursor(page[page.length - 1].doc.id) : null,
  };
}

async function listAllAssets({ includeDeleted = false } = {}) {
  const collection = getDb().collection(COLLECTION);
  const out = [];
  let cursor = null;
  while (true) {
    let query = collection.orderBy('createdAt', 'desc');
    if (cursor) query = query.startAfter(cursor);
    const snap = await query.limit(500).get();
    if (!snap.docs.length) break;
    out.push(...snap.docs.filter((doc) => includeDeleted || doc.data().deleted !== true)
      .map((doc) => toPublicAsset(doc.id, doc.data())));
    if (snap.docs.length < 500) break;
    cursor = snap.docs[snap.docs.length - 1];
  }
  return out;
}

async function getAssetDoc(id, { includeDeleted = false } = {}) {
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(String(id || ''))) throw new DemoAssetsError(400, 'Invalid asset id');
  const ref = getDb().collection(COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new DemoAssetsError(404, 'Asset not found');
  const data = snap.data();
  if (!includeDeleted && data.deleted === true) throw new DemoAssetsError(404, 'Asset not found');
  return { ref, data };
}

async function getAsset(id) {
  const { data } = await getAssetDoc(id);
  return toPublicAsset(id, data);
}

async function findBySha(sha) {
  const collection = getDb().collection(COLLECTION);
  let cursor = null;
  while (true) {
    let query = collection.where('sha256', '==', sha);
    if (cursor) query = query.startAfter(cursor);
    const snap = await query.limit(500).get();
    const existing = snap.docs.find((doc) => doc.data().deleted !== true);
    if (existing) return toPublicAsset(existing.id, existing.data());
    if (snap.docs.length < 500) return null;
    cursor = snap.docs[snap.docs.length - 1];
  }
}

function normaliseAssetFilename(filename) {
  return cleanString(filename, 200).toLowerCase().normalize('NFKC')
    .replace(/\.html?$/i, '')
    .replace(/(?:(?:[\s_-]+(?:v(?:ersion)?[\s_-]*\d+(?:\.\d+)*|copy|final|updated|revised)|[\s_-]*\(\d+\)|[_-]\d+))+$/i, '')
    .replace(/[\s_-]+/g, ' ').trim();
}

function findFilenameMatches(filename, assets) {
  const name = normaliseAssetFilename(filename);
  if (!name) return [];
  const words = new Set(name.split(' '));
  return assets.map((asset) => {
    const existing = normaliseAssetFilename(asset.originalFilename);
    if (!existing) return null;
    const otherWords = new Set(existing.split(' '));
    const shared = [...words].filter((word) => otherWords.has(word)).length;
    const score = name === existing ? 1 : 2 * shared / (words.size + otherWords.size);
    return score >= 0.85 ? { ...asset, filenameScore: score } : null;
  }).filter(Boolean).sort((a, b) => b.filenameScore - a.filenameScore);
}

function prepareUpload(html) {
  if (typeof html !== 'string' || !html.trim()) throw new DemoAssetsError(400, 'html is required');
  const htmlBytes = Buffer.byteLength(html, 'utf8');
  if (htmlBytes > MAX_HTML_BYTES) throw new DemoAssetsError(413, `HTML exceeds ${MAX_HTML_BYTES / 1024 / 1024} MB`);
  if (!/<html[\s>]|<body[\s>]|<!doctype html/i.test(html)) throw new DemoAssetsError(400, 'File does not look like an HTML document');
  const { skeleton, media } = extractMedia(html);
  return {
    skeleton, media, sha256: sha256Hex(html),
    sizes: {
      htmlBytes,
      skeletonBytes: Buffer.byteLength(skeleton, 'utf8'),
      mediaCount: media.length,
      mediaBytes: media.reduce((n, m) => n + m.bytes.length, 0),
    },
  };
}

/**
 * Store a dropped HTML file, or return a duplicate / version-candidate decision
 * without writing. Force explicitly keeps the upload as a separate asset.
 */
async function createAsset({ html, filename, folderPath, force }, user, deps = {}) {
  const { skeleton, media, sha256, sizes } = prepareUpload(html);
  if (!force) {
    const existing = await findBySha(sha256);
    if (existing) return { asset: existing, duplicate: true };
  }

  const assets = await listAllAssets();
  const versionCandidates = force ? [] : findFilenameMatches(filename, assets);
  if (versionCandidates.length) return { versionCandidates };
  const meta = extractMeta(skeleton);
  const simHash = computeSimHash(skeleton);
  const similar = simHash ? findSimilarAssets(simHash, assets) : [];
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
    simHash,
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
    sizes,
    skeletonBytes: sizes.skeletonBytes,
    originalFilename: doc.originalFilename,
    folderPath: doc.folderPath,
    source: 'upload',
    note: 'Original upload',
    createdBy,
    createdAt: now,
  });
  await batch.commit();
  return { asset: toPublicAsset(ref.id, { ...doc, createdAt: null, updatedAt: null }), duplicate: false, similar };
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

async function trashAsset(id, user) {
  const { ref, data } = await getAssetDoc(id);
  if (data.deleted === true) return { ok: true, id, deleted: true };
  await ref.update({
    deleted: true,
    deletedAt: admin.firestore.FieldValue.serverTimestamp(),
    deletedBy: user ? { uid: user.uid, email: user.email || '' } : null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { ok: true, id, deleted: true };
}

async function restoreAsset(id, user) {
  const { ref } = await getAssetDoc(id, { includeDeleted: true });
  await ref.update({
    deleted: false,
    deletedAt: null,
    deletedBy: null,
    restoredAt: admin.firestore.FieldValue.serverTimestamp(),
    restoredBy: user ? { uid: user.uid, email: user.email || '' } : null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { ok: true, asset: await getAsset(id) };
}

async function deleteAsset(id) {
  const { ref } = await getAssetDoc(id, { includeDeleted: true });
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

async function loadSkeleton(id, versionId) {
  const { ref, data } = await getAssetDoc(id);
  const vId = versionId || data.currentVersionId;
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(String(vId || ''))) throw new DemoAssetsError(400, 'Invalid version id');
  const vSnap = await ref.collection('versions').doc(vId).get();
  if (!vSnap.exists) throw new DemoAssetsError(versionId ? 404 : 500, versionId ? 'Version not found' : 'Current version is missing');
  const [buf] = await getBucket().file(vSnap.data().skeletonPath).download();
  return { skeleton: buf.toString('utf8'), versionId: vId, version: vSnap.data(), ref, data };
}

async function rehydrateSkeleton(skeleton) {
  const media = await loadMedia(getBucket(), mediaHashesIn(skeleton));
  return rehydrate(skeleton, media);
}

async function loadRenderedHtml(id, opts = {}) {
  const { skeleton, data, version } = await loadSkeleton(id, opts.versionId);
  const asset = opts.versionId ? {
    ...data,
    originalFilename: version.originalFilename == null ? data.originalFilename : version.originalFilename,
    folderPath: version.folderPath == null ? data.folderPath : version.folderPath,
    sizes: version.sizes || data.sizes,
  } : data;
  return { html: await rehydrateSkeleton(skeleton), asset: toPublicAsset(id, asset) };
}

function buildRenderUrl(token, origin = DEMO_RENDER_ORIGIN) {
  const parsed = new URL(origin);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new DemoAssetsError(500, 'Demo render origin must be an HTTPS origin without a path');
  }
  return new URL(`/render/${encodeURIComponent(token)}`, parsed.origin).toString();
}

async function createRenderToken(id, user, opts = {}) {
  const { ref, data } = await getAssetDoc(id);
  const versionId = opts.versionId || data.currentVersionId;
  if (!opts.proposalId) {
    if (!/^[A-Za-z0-9_-]{6,64}$/.test(String(versionId || ''))) throw new DemoAssetsError(400, 'Invalid version id');
    if (!(await ref.collection('versions').doc(versionId).get()).exists) throw new DemoAssetsError(404, 'Version not found');
  }
  const token = crypto.randomBytes(24).toString('base64url');
  const url = buildRenderUrl(token);
  const expiresAt = new Date(Date.now() + RENDER_TOKEN_TTL_MS);
  const doc = {
    assetId: id,
    uid: user.uid,
    createdAt: admin.firestore.Timestamp.fromDate(new Date()),
    expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
    revoked: false,
  };
  if (!opts.proposalId) doc.versionId = versionId;
  if (opts.proposalId) doc.proposalId = cleanString(opts.proposalId, 64);
  await getDb().collection(TOKEN_COLLECTION).doc(token).set(doc);
  return { token, tokenId: token, versionId: opts.proposalId ? null : versionId, expiresAt: expiresAt.toISOString(), url };
}

async function listRenderTokens(id, user) {
  await getAssetDoc(id, { includeDeleted: true });
  const snap = await getDb().collection(TOKEN_COLLECTION).where('assetId', '==', id).get();
  return snap.docs.filter((doc) => doc.data().uid === user.uid).map((doc) => {
    const token = doc.data();
    return {
      id: doc.id,
      tokenId: doc.id,
      versionId: token.versionId || null,
      createdAt: token.createdAt && token.createdAt.toDate ? token.createdAt.toDate().toISOString() : token.createdAt || null,
      expiresAt: token.expiresAt && token.expiresAt.toDate ? token.expiresAt.toDate().toISOString() : token.expiresAt || null,
      revoked: token.revoked === true,
      url: buildRenderUrl(doc.id),
    };
  }).sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

async function revokeRenderToken(id, tokenId, user) {
  await getAssetDoc(id, { includeDeleted: true });
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(String(tokenId || ''))) throw new DemoAssetsError(400, 'Invalid token id');
  const ref = getDb().collection(TOKEN_COLLECTION).doc(tokenId);
  const snap = await ref.get();
  if (!snap.exists || snap.data().assetId !== id || snap.data().uid !== user.uid) {
    throw new DemoAssetsError(404, 'Render token not found');
  }
  if (snap.data().revoked !== true) {
    await ref.update({ revoked: true, revokedAt: admin.firestore.FieldValue.serverTimestamp() });
  }
  return { ok: true, id: tokenId, revoked: true };
}

/** Resolve a render token to { assetId, versionId?, proposalId? }. */
async function resolveRenderTarget(token) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(String(token || ''))) throw new DemoAssetsError(404, 'Not found');
  const snap = await getDb().collection(TOKEN_COLLECTION).doc(token).get();
  if (!snap.exists) throw new DemoAssetsError(404, 'Not found');
  const d = snap.data();
  if (d.revoked === true) throw new DemoAssetsError(410, 'Preview link has been revoked.');
  if (!d.expiresAt || d.expiresAt.toMillis() < Date.now()) throw new DemoAssetsError(410, 'Preview link expired — reopen it from the library.');
  const asset = await getDb().collection(COLLECTION).doc(d.assetId).get();
  if (!asset.exists || asset.data().deleted === true) throw new DemoAssetsError(404, 'Not found');
  return { assetId: d.assetId, versionId: d.versionId || null, proposalId: d.proposalId || null };
}

async function resolveRenderToken(token) {
  return (await resolveRenderTarget(token)).assetId;
}

/** Headers that force the rendered asset into an opaque-origin sandbox. */
const RENDER_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Content-Security-Policy': 'sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms allow-modals',
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
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
  listAllAssets,
  getAsset,
  createAsset,
  prepareUpload,
  normaliseAssetFilename,
  findFilenameMatches,
  updateAsset,
  deleteAsset,
  trashAsset,
  restoreAsset,
  loadRenderedHtml,
  createRenderToken,
  listRenderTokens,
  revokeRenderToken,
  buildRenderUrl,
  resolveRenderToken,
  resolveRenderTarget,
  loadSkeleton,
  rehydrateSkeleton,
  safeDownloadName,
  computeSimHash,
  simHashDistance,
  findSimilarAssets,
  SIMILAR_MAX_DISTANCE,
  // Shared with demoStudioService (same private bucket / collections).
  _internal: {
    COLLECTION,
    TOKEN_COLLECTION,
    MAX_HTML_BYTES,
    RENDER_TOKEN_TTL_MS,
    MEDIA_TOKEN_RE,
    sha256Hex,
    stripTags,
    cleanString,
    getBucket,
    getDb,
    getAssetDoc,
    encodeCursor,
    decodeCursor,
    loadMedia,
    saveMedia,
    skeletonPath,
    toPublicAsset,
  },
};
