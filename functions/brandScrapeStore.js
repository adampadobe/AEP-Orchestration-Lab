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
 *       runSteps: [{ id, label, status: 'ok'|'failed'|'skipped', detail? }] — last-fail trace,
 *       analysisPending (boolean, index only — true after crawl checkpoint until final save),
 *       runStartedAt, crawlEngine, includeSummary,
 *       scrapeVersions: [{ version, storagePath, savedAt }] — archived snapshots
 *         before append/overwrite (GCS under …/versions/vN.json, max 25) }
 *
 * Cloud Storage: gs://<BUCKET>/scrapes/<sandbox>/<scrapeId>/record.json
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

function hydrateScrapeVersions(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((v) => ({
      version: Number(v.version) || 0,
      storagePath: v.storagePath || '',
      savedAt: serializeTimestamp(v.savedAt),
    }))
    .filter((v) => v.version > 0)
    .sort((a, b) => a.version - b.version);
}

function hydrate(data) {
  if (!data) return null;
  const scrapeVersions = hydrateScrapeVersions(data.scrapeVersions);
  return {
    ...data,
    createdAt: serializeTimestamp(data.createdAt),
    updatedAt: serializeTimestamp(data.updatedAt),
    runStartedAt: serializeTimestamp(data.runStartedAt),
    scrapeVersions,
  };
}

function hasRealPayload(val, innerArrayKey) {
  if (!val || typeof val !== 'object') return false;
  if (val.skipped || val.error || val.dropped) return false;
  if (innerArrayKey) return Array.isArray(val[innerArrayKey]) && val[innerArrayKey].length > 0;
  return true;
}

/** True if a hydrated scrape is worth freezing before an append overwrites record.json */
function snapshotWorthy(rec) {
  if (!rec || typeof rec !== 'object') return false;
  if (hasRealPayload(rec.analysis)) return true;
  if (hasRealPayload(rec.personas, 'personas')) return true;
  if (hasRealPayload(rec.campaigns, 'campaigns')) return true;
  if (hasRealPayload(rec.segments, 'segments')) return true;
  if (hasRealPayload(rec.stakeholders, 'people')) return true;
  const pages = rec.crawlSummary && rec.crawlSummary.pages;
  if (Array.isArray(pages) && pages.some((p) => (p.textLength || 0) > 400)) return true;
  return false;
}

/**
 * Persist a frozen JSON snapshot of `snapshot` (pre-merge baseline) before the
 * caller writes the new main record.json. Updates Firestore scrapeVersions only.
 */
async function writeArchiveSnapshotIfWorthy(sandboxName, scrapeId, snapshot) {
  const name = String(sandboxName || '').trim();
  const sid = String(scrapeId || '').trim();
  if (!name || !sid || !snapshot || !snapshotWorthy(snapshot)) return null;

  const ref = getDb().collection(COLLECTION).doc(docId(name, sid));
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  if (!data.storagePath) return null;

  const prevVersions = Array.isArray(data.scrapeVersions) ? data.scrapeVersions : [];
  const nextV = prevVersions.length
    ? Math.max(0, ...prevVersions.map((x) => Number(x.version) || 0)) + 1
    : 1;
  const vPath = `scrapes/${safeSlug(name)}/${safeSlug(sid)}/versions/v${nextV}.json`;

  const toStore = stripUndefined({
    sandbox: name,
    scrapeId: sid,
    url: snapshot.url || '',
    baseUrl: snapshot.baseUrl || '',
    brandName: snapshot.brandName || '',
    businessType: snapshot.businessType || '',
    country: snapshot.country || '',
    industry: snapshot.industry || '',
    industryInfo: snapshot.industryInfo !== undefined ? snapshot.industryInfo : null,
    crawlSummary: snapshot.crawlSummary || null,
    analysis: snapshot.analysis || null,
    analysisError: snapshot.analysisError || null,
    personas: snapshot.personas || null,
    personasError: snapshot.personasError || null,
    campaigns: snapshot.campaigns || null,
    campaignsError: snapshot.campaignsError || null,
    segments: snapshot.segments || null,
    segmentsError: snapshot.segmentsError || null,
    stakeholders: snapshot.stakeholders || null,
    stakeholdersError: snapshot.stakeholdersError || null,
    lastExport: snapshot.lastExport || null,
    elapsedMs: typeof snapshot.elapsedMs === 'number' ? snapshot.elapsedMs : null,
    schemaVersion: 2,
    snapshotKind: 'pre_append',
    archivedAt: new Date().toISOString(),
  });

  const blob = Buffer.from(JSON.stringify(toStore), 'utf8');
  const file = getBucket().file(vPath);
  const saveOpts = {
    contentType: 'application/json; charset=utf-8',
    resumable: false,
    metadata: {
      cacheControl: 'private, max-age=60',
      metadata: { sandbox: safeSlug(name), scrapeId: safeSlug(sid), archiveVersion: String(nextV) },
    },
  };
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await file.save(blob, saveOpts);
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  if (lastErr) {
    console.error('[brandScrapeStore] archive snapshot GCS failed', vPath, String((lastErr && lastErr.message) || lastErr));
    return null;
  }

  const savedIso = new Date().toISOString();
  const newEntry = stripUndefined({ version: nextV, storagePath: vPath, savedAt: savedIso });
  const merged = [...prevVersions, newEntry].slice(-25);
  await ref.set(stripUndefined({
    scrapeVersions: merged,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }), { merge: true });

  return nextV;
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
    tx.set(ref, {
      ...patch,
      createdAt,
      runSteps: admin.firestore.FieldValue.delete(),
    }, { merge: true });
  });
}

function normalizeRunSteps(steps) {
  if (!Array.isArray(steps) || !steps.length) return null;
  const out = [];
  for (const s of steps.slice(0, 24)) {
    if (!s || typeof s !== 'object') continue;
    const status = ['ok', 'failed', 'skipped'].includes(s.status) ? s.status : 'failed';
    out.push(stripUndefined({
      id: String(s.id || '').slice(0, 36),
      label: String(s.label || '').slice(0, 80),
      status,
      detail: s.detail != null ? String(s.detail).slice(0, 600) : null,
    }));
  }
  return out.length ? out : null;
}

/** Terminal failure while a run is in progress (does not delete prior GCS payloads). */
async function markScrapeFailed(sandbox, scrapeId, { error, steps } = {}) {
  const name = String(sandbox || '').trim();
  const sid = String(scrapeId || '').trim();
  if (!name || !sid) return;
  const ref = getDb().collection(COLLECTION).doc(docId(name, sid));
  const normalized = normalizeRunSteps(steps);
  await ref.set({
    scrapeStatus: 'failed',
    scrapeError: String(error || 'unknown error').slice(0, 800),
    runSteps: normalized && normalized.length ? normalized : admin.firestore.FieldValue.delete(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
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
  const archiveSnapshotOf = options.archiveSnapshotOf || null;

  if (!isCheckpoint && archiveSnapshotOf) {
    await writeArchiveSnapshotIfWorthy(name, scrapeId, archiveSnapshotOf);
  }

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
  const saveOpts = {
    contentType: 'application/json; charset=utf-8',
    resumable: false,
    metadata: {
      cacheControl: 'private, max-age=60',
      metadata: { sandbox: safeSlug(name), scrapeId: safeSlug(scrapeId) },
    },
  };
  const file = getBucket().file(path);
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await file.save(blob, saveOpts);
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  if (lastErr) {
    throw new Error('GCS write failed for ' + path + ': ' + ((lastErr && lastErr.message) || lastErr));
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
    analysisPending: !!isCheckpoint,
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
      runSteps: admin.firestore.FieldValue.delete(),
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
      analysisPending: typeof data.analysisPending === 'boolean' ? data.analysisPending : null,
      runStartedAt: data.runStartedAt,
      crawlEngine: data.crawlEngine || null,
      archiveVersionCount: Array.isArray(data.scrapeVersions) ? data.scrapeVersions.length : 0,
      runSteps: Array.isArray(data.runSteps) ? data.runSteps : [],
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
async function getScrape(sandbox, id, opts = {}) {
  const name = String(sandbox || '').trim();
  const sid = String(id || '').trim();
  if (!name || !sid) return null;
  const ref = getDb().collection(COLLECTION).doc(docId(name, sid));
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  if (data.sandbox && data.sandbox !== name) return null;

  const availableVersions = hydrateScrapeVersions(data.scrapeVersions);
  const rawVer = opts && opts.version != null && opts.version !== ''
    ? Number(opts.version)
    : NaN;
  const wantVersion = Number.isFinite(rawVer) && rawVer > 0 ? rawVer : null;

  // Legacy: no storagePath → payload is inline on the Firestore doc.
  if (!data.storagePath) {
    if (wantVersion != null) return null;
    const base = hydrate({ scrapeId: data.scrapeId || snap.id, ...data });
    if (!base) return null;
    return { ...base, availableVersions, viewingVersion: null };
  }

  // Hybrid (v2): read the full blob from GCS and layer the Firestore
  // fields (storagePath + timestamps) on top. Optional historical version.
  let gcsPath = data.storagePath;
  if (wantVersion != null) {
    const vers = Array.isArray(data.scrapeVersions) ? data.scrapeVersions : [];
    const hit = vers.find((x) => Number(x.version) === wantVersion);
    gcsPath = (hit && hit.storagePath) || `scrapes/${safeSlug(name)}/${safeSlug(sid)}/versions/v${wantVersion}.json`;
  }

  let full = null;
  try {
    const [buf] = await getBucket().file(gcsPath).download();
    full = JSON.parse(buf.toString('utf8'));
  } catch (e) {
    console.error('[brandScrapeStore] GCS read failed', {
      sandbox: name,
      scrapeId: sid,
      storagePath: gcsPath,
      error: String((e && e.message) || e),
    });
    if (wantVersion != null) return null;
    // Bucket lifecycle can delete the blob after 3 days — in that case
    // we still return the index-doc summary so the UI can display what
    // it knows and the user gets a clear "payload expired" state.
    const expired = hydrate({
      scrapeId: data.scrapeId || snap.id,
      ...data,
      payloadExpired: true,
    });
    return expired
      ? { ...expired, availableVersions, viewingVersion: null }
      : null;
  }
  const merged = hydrate({
    ...full,
    ...data,
    scrapeId: data.scrapeId || snap.id,
  });
  return merged
    ? { ...merged, availableVersions, viewingVersion: wantVersion }
    : null;
}

const STALE_RUNNING_SCRAPE_MS = 95 * 60 * 1000;

/** Scheduled maintenance: fail very old running scrapes (stuck index rows). */
async function runBrandScrapeStaleMaintenance() {
  const db = getDb();
  const nowMs = Date.now();
  let failedStaleRunning = 0;

  const runSnap = await db.collection(COLLECTION).where('scrapeStatus', '==', 'running').limit(300).get();
  for (const doc of runSnap.docs) {
    const d = doc.data() || {};
    const rs = d.runStartedAt;
    const t = rs && typeof rs.toMillis === 'function' ? rs.toMillis() : 0;
    if (t && nowMs - t > STALE_RUNNING_SCRAPE_MS && d.scrapeId && d.sandbox) {
      await markScrapeFailed(String(d.sandbox), String(d.scrapeId), {
        error: 'Run timed out (stale). The tab or worker may have been interrupted; delete and retry.',
        steps: [{
          id: 'runtime',
          label: 'Run did not finish',
          status: 'failed',
          detail: 'Status stayed "running" past the timeout window (worker disconnect or crash).',
        }],
      });
      failedStaleRunning += 1;
    }
  }

  console.log(JSON.stringify({
    src: 'brandScrapeStore.maintenance',
    phase: 'stale_cleanup',
    failedStaleRunning,
    t: new Date().toISOString(),
  }));
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
  const prefix = `scrapes/${safeSlug(name)}/${safeSlug(sid)}/`;
  try {
    const [files] = await getBucket().getFiles({ prefix, maxResults: 500 });
    await Promise.all((files || []).map((f) => f.delete({ ignoreNotFound: true }).catch(() => {})));
  } catch (e) {
    console.warn('[brandScrapeStore] GCS prefix delete failed', prefix, String((e && e.message) || e));
  }

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
  runBrandScrapeStaleMaintenance,
  hasRealPayload,
};
