/**
 * Per-sandbox Brand Scraper record storage (hybrid Firestore + GCS).
 *
 * Firestore collection: brandScrapes/{sandbox}__{scrapeId}
 *   Slim index only — queryable fields for list / filter / sort:
 *     { sandbox, scrapeId, url, baseUrl, brandName, businessType, country,
 *       industry, industryInfo, elapsedMs, analysisError, pagesScraped,
 *       analysisPresent, personasPresent, campaignsPresent, segmentsPresent,
 *       stakeholdersPresent, storagePath, storageSize, hasFullRecord,
 *       lastExport, createdAt, updatedAt,
 *       scrapeStatus ('running' | 'crawl_complete' | 'failed' | 'complete'), scrapeError,
 *       runStartedAt, crawlEngine, includeSummary }
 *
 * Cloud Storage: gs://<BUCKET>/<sandbox>/<scrapeId>/record.json
 *   Full payload — crawlSummary + analysis + personas + campaigns +
 *   segments + stakeholders. No size ceiling (Firestore doc cap bypassed).
 *
 * All reads/writes via Admin SDK; client Firestore rules deny all.
 */

'use strict';

const admin = require('firebase-admin');

const COLLECTION = 'brandScrapes';
const BUCKET_NAME = process.env.BRAND_SCRAPER_BUCKET || 'aep-orchestration-lab-brand-scrapes';
const RECORD_OBJECT_NAME = 'record.json';

let db;
function getDb() {
  if (!db) {
    if (!admin.apps.length) admin.initializeApp();
    db = admin.firestore();
  }
  return db;
}

/**
 * Firestore rejects `undefined` values outright. LLM outputs routinely
 * contain undefined sub-fields (e.g. industryInfo.raw_response). Walk the
 * object and replace them with null so the write succeeds — the GCS blob
 * is the source of truth for the full payload anyway.
 */
function stripUndefined(value) {
  if (value === undefined) return null;
  if (value === null) return null;
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value)) {
      const v = value[k];
      if (v === undefined) continue;
      out[k] = stripUndefined(v);
    }
    return out;
  }
  return value;
}

function getBucket() {
  if (!admin.apps.length) admin.initializeApp();
  return admin.storage().bucket(BUCKET_NAME);
}

function safeSlug(s) {
  return String(s || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 200);
}

function docId(sandbox, id) {
  return `${safeSlug(sandbox || 'default')}__${safeSlug(id)}`.slice(0, 400);
}

function storageKey(sandbox, scrapeId) {
  // Scrape artifacts live under the `scrapes/` prefix so the bucket
  // lifecycle can expire them after 3 days without touching the
  // curated `<sandbox>/library/` tree.
  return `scrapes/${safeSlug(sandbox || 'default')}/${safeSlug(scrapeId)}/${RECORD_OBJECT_NAME}`;
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function serializeTimestamp(v) {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate().toISOString();
  return v;
}

function hydrate(data) {
  if (!data) return null;
  return {
    ...data,
    createdAt: serializeTimestamp(data.createdAt),
    updatedAt: serializeTimestamp(data.updatedAt),
    runStartedAt: serializeTimestamp(data.runStartedAt),
  };
}

function hasRealPayload(val, innerArrayKey) {
  if (!val || typeof val !== 'object') return false;
  if (val.skipped || val.error || val.dropped) return false;
  if (innerArrayKey) return Array.isArray(val[innerArrayKey]) && val[innerArrayKey].length > 0;
  return true;
}

/**
 * Mark a scrape as in-flight (Firestore index only — no GCS blob yet).
 * Append re-runs keep hasFullRecord/storagePath when a completed payload already exists.
 */
async function markScrapeRunning(sandbox, meta) {
  const name = String(sandbox || '').trim();
  const scrapeId = String((meta && meta.scrapeId) || '').trim();
  if (!name || !scrapeId) throw new Error('sandbox and scrapeId are required');
  const ref = getDb().collection(COLLECTION).doc(docId(name, scrapeId));
  const now = admin.firestore.FieldValue.serverTimestamp();
  await getDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.exists ? (snap.data() || {}) : {};
    const hadFull = !!(prev.storagePath && prev.hasFullRecord);
    const createdAt = prev.createdAt || now;
    const patch = stripUndefined({
      sandbox: name,
      scrapeId,
      url: meta.url != null ? String(meta.url) : '',
      baseUrl: meta.baseUrl != null ? String(meta.baseUrl) : '',
      brandName: meta.brandName != null ? String(meta.brandName) : '',
      businessType: meta.businessType || 'b2c',
      country: meta.country != null ? String(meta.country) : '',
      crawlEngine: meta.crawlEngine || null,
      includeSummary: meta.includeSummary || null,
      scrapeStatus: 'running',
      scrapeError: null,
      runStartedAt: now,
      updatedAt: now,
      hasFullRecord: hadFull,
      storagePath: prev.storagePath || null,
    });
    tx.set(ref, { ...patch, createdAt }, { merge: true });
  });
}

/** Terminal failure while a run is in progress (does not delete prior GCS payloads). */
async function markScrapeFailed(sandbox, scrapeId, { error } = {}) {
  const name = String(sandbox || '').trim();
  const sid = String(scrapeId || '').trim();
  if (!name || !sid) return;
  const ref = getDb().collection(COLLECTION).doc(docId(name, sid));
  await ref.set(stripUndefined({
    scrapeStatus: 'failed',
    scrapeError: String(error || 'unknown error').slice(0, 800),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }), { merge: true });
}

/**
 * Persist a scrape.
 * Strategy: the full payload goes to Cloud Storage; a slim searchable
 * index doc goes to Firestore with a pointer (storagePath) to the blob.
 */
async function saveScrape(sandbox, payload, options = {}) {
  const name = String(sandbox || '').trim();
  if (!name) throw new Error('sandbox is required');
  const scrapeId = String((payload && payload.scrapeId) || '').trim() || genId();
  const isCheckpoint = options.checkpoint === true;

  // 1. Write the full payload to GCS first. If this fails, we abort —
  //    we refuse to create a dangling Firestore index that can't hydrate.
  const fullRecord = {
    sandbox: name,
    scrapeId,
    url: payload.url || '',
    baseUrl: payload.baseUrl || '',
    brandName: payload.brandName || '',
    businessType: payload.businessType || '',
    country: payload.country || '',
    industry: payload.industry || '',
    industryInfo: payload.industryInfo || null,
    crawlSummary: payload.crawlSummary || null,
    analysis: payload.analysis || null,
    analysisError: payload.analysisError || null,
    personas: payload.personas || null,
    personasError: payload.personasError || null,
    campaigns: payload.campaigns || null,
    campaignsError: payload.campaignsError || null,
    segments: payload.segments || null,
    segmentsError: payload.segmentsError || null,
    stakeholders: payload.stakeholders || null,
    stakeholdersError: payload.stakeholdersError || null,
    lastExport: payload.lastExport || null,
    elapsedMs: typeof payload.elapsedMs === 'number' ? payload.elapsedMs : null,
    schemaVersion: 2, // hybrid storage
    savedAt: new Date().toISOString(),
  };

  const path = storageKey(name, scrapeId);
  const blob = Buffer.from(JSON.stringify(fullRecord), 'utf8');
  try {
    await getBucket().file(path).save(blob, {
      contentType: 'application/json; charset=utf-8',
      resumable: false,
      metadata: {
        cacheControl: 'private, max-age=60',
        metadata: { sandbox: safeSlug(name), scrapeId: safeSlug(scrapeId) },
      },
    });
  } catch (e) {
    throw new Error('GCS write failed for ' + path + ': ' + ((e && e.message) || e));
  }

  // 2. Write the slim, queryable index doc to Firestore.
  const indexDoc = {
    sandbox: name,
    scrapeId,
    url: fullRecord.url,
    baseUrl: fullRecord.baseUrl,
    brandName: fullRecord.brandName,
    businessType: fullRecord.businessType,
    country: fullRecord.country,
    industry: fullRecord.industry,
    industryInfo: fullRecord.industryInfo,
    elapsedMs: fullRecord.elapsedMs,
    analysisError: fullRecord.analysisError,
    analysisPresent: hasRealPayload(fullRecord.analysis),
    personasPresent: hasRealPayload(fullRecord.personas, 'personas'),
    campaignsPresent: hasRealPayload(fullRecord.campaigns, 'campaigns'),
    segmentsPresent: hasRealPayload(fullRecord.segments, 'segments'),
    stakeholdersPresent: hasRealPayload(fullRecord.stakeholders, 'people'),
    pagesScraped: fullRecord.crawlSummary ? fullRecord.crawlSummary.pagesScraped : null,
    lastExport: fullRecord.lastExport,
    storagePath: path,
    storageSize: blob.length,
    hasFullRecord: true,
    schemaVersion: 2,
    scrapeStatus: isCheckpoint ? 'crawl_complete' : 'complete',
    scrapeError: null,
  };

  const ref = getDb().collection(COLLECTION).doc(docId(name, scrapeId));
  const safeIndexDoc = stripUndefined(indexDoc);
  await getDb().runTransaction(async (tx) => {
    const prev = await tx.get(ref);
    const now = admin.firestore.FieldValue.serverTimestamp();
    const base = prev.exists ? prev.data() : {};
    tx.set(ref, {
      ...safeIndexDoc,
      createdAt: base.createdAt || now,
      updatedAt: now,
    }, { merge: true });
  });

  // 3. Return the fully-hydrated record so callers (e.g. the analyze
  //    endpoint) can relay it to the client without a round-trip.
  const after = await ref.get();
  const index = hydrate(after.exists ? after.data() : null);
  return {
    ...fullRecord,
    ...index, // timestamps + storagePath from Firestore
    analysisPresent: indexDoc.analysisPresent,
    personasPresent: indexDoc.personasPresent,
    campaignsPresent: indexDoc.campaignsPresent,
    segmentsPresent: indexDoc.segmentsPresent,
    stakeholdersPresent: indexDoc.stakeholdersPresent,
  };
}

async function listScrapes(sandbox, { limit = 50 } = {}) {
  const name = String(sandbox || '').trim();
  if (!name) return [];
  const snap = await getDb()
    .collection(COLLECTION)
    .where('sandbox', '==', name)
    .get();
  const items = [];
  snap.forEach((d) => {
    const data = d.data() || {};
    items.push(hydrate({
      scrapeId: data.scrapeId || d.id,
      sandbox: data.sandbox,
      url: data.url,
      baseUrl: data.baseUrl,
      brandName: data.brandName,
      businessType: data.businessType,
      country: data.country,
      industry: data.industry || '',
      elapsedMs: data.elapsedMs,
      analysisError: data.analysisError,
      // schemaVersion 2 records persist the `*Present` booleans directly
      // on the index doc. Legacy v1 records (shouldn't exist in prod but
      // kept for safety) still have the full payload inline, so fall back
      // to computing from that.
      analysisPresent: typeof data.analysisPresent === 'boolean'
        ? data.analysisPresent
        : hasRealPayload(data.analysis),
      personasPresent: typeof data.personasPresent === 'boolean'
        ? data.personasPresent
        : hasRealPayload(data.personas, 'personas'),
      campaignsPresent: typeof data.campaignsPresent === 'boolean'
        ? data.campaignsPresent
        : hasRealPayload(data.campaigns, 'campaigns'),
      segmentsPresent: typeof data.segmentsPresent === 'boolean'
        ? data.segmentsPresent
        : hasRealPayload(data.segments, 'segments'),
      stakeholdersPresent: typeof data.stakeholdersPresent === 'boolean'
        ? data.stakeholdersPresent
        : hasRealPayload(data.stakeholders, 'people'),
      pagesScraped: data.pagesScraped != null
        ? data.pagesScraped
        : (data.crawlSummary ? data.crawlSummary.pagesScraped : null),
      scrapeStatus: data.scrapeStatus || null,
      scrapeError: data.scrapeError || null,
      runStartedAt: data.runStartedAt,
      crawlEngine: data.crawlEngine || null,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    }));
  });
  items.sort((a, b) => {
    const at = a.updatedAt ? Date.parse(a.updatedAt) : 0;
    const bt = b.updatedAt ? Date.parse(b.updatedAt) : 0;
    return bt - at;
  });
  return items.slice(0, limit);
}

/**
 * Hydrate a single scrape's full payload. Schema v2 pulls from GCS and
 * merges with the Firestore index. Schema v1 (legacy) returns the index
 * doc alone since it still has the payload inline.
 */
async function getScrape(sandbox, id) {
  const name = String(sandbox || '').trim();
  const sid = String(id || '').trim();
  if (!name || !sid) return null;
  const ref = getDb().collection(COLLECTION).doc(docId(name, sid));
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  if (data.sandbox && data.sandbox !== name) return null;

  // Legacy: no storagePath → payload is inline on the Firestore doc.
  if (!data.storagePath) {
    return hydrate({ scrapeId: data.scrapeId || snap.id, ...data });
  }

  // Hybrid (v2): read the full blob from GCS and layer the Firestore
  // fields (storagePath + timestamps) on top.
  let full = null;
  try {
    const [buf] = await getBucket().file(data.storagePath).download();
    full = JSON.parse(buf.toString('utf8'));
  } catch (e) {
    console.error('[brandScrapeStore] GCS read failed', {
      sandbox: name,
      scrapeId: sid,
      storagePath: data.storagePath,
      error: String((e && e.message) || e),
    });
    // Bucket lifecycle can delete the blob after 3 days — in that case
    // we still return the index-doc summary so the UI can display what
    // it knows and the user gets a clear "payload expired" state.
    return hydrate({
      scrapeId: data.scrapeId || snap.id,
      ...data,
      payloadExpired: true,
    });
  }
  return hydrate({ ...full, ...data, scrapeId: data.scrapeId || snap.id });
}

async function deleteScrape(sandbox, id) {
  const name = String(sandbox || '').trim();
  const sid = String(id || '').trim();
  if (!name || !sid) return false;
  const ref = getDb().collection(COLLECTION).doc(docId(name, sid));
  const snap = await ref.get();
  if (!snap.exists) return false;
  const data = snap.data() || {};
  if (data.sandbox && data.sandbox !== name) return false;

  // Best-effort GCS delete; Firestore index doc is the source of truth.
  const path = data.storagePath || storageKey(name, sid);
  try { await getBucket().file(path).delete({ ignoreNotFound: true }); }
  catch (e) { console.warn('[brandScrapeStore] GCS delete failed', path, String((e && e.message) || e)); }

  await ref.delete();
  return true;
}

module.exports = {
  saveScrape,
  listScrapes,
  getScrape,
  deleteScrape,
  genId,
  markScrapeRunning,
  markScrapeFailed,
};
