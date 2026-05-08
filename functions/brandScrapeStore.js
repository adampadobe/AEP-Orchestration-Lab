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
 *       buildPhase ('crawl' | 'brand' | 'audiences' | 'complete') — progressive build; optional on legacy rows,
 *       runSteps: [{ id, label, status: 'ok'|'failed'|'skipped', detail? }] — last-fail trace,
 *       analysisPending (boolean, index only — true after crawl checkpoint until final save),
 *       runStartedAt, crawlEngine, includeSummary,
 *       payloadRetentionExpiresAt (Timestamp) — when JSON payload may be GC’d;
 *         user can POST …/extend to push this out (images use shorter storage),
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

const MS_PER_DAY = 86400000;
/** Default text/JSON payload retention (Firestore + GCS record.json / versions). */
const DEFAULT_PAYLOAD_RETENTION_MS = 14 * MS_PER_DAY;
/** Classified crawl images: short-lived GCS prefix `scrape-cache-images/` + legacy `…/images/`. */
const IMAGE_ARTIFACT_MAX_AGE_MS = 3 * MS_PER_DAY;

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
  // JSON payloads live under `scrapes/` (see docs/image-hosting-lifecycle.json:
  // daysSinceCustomTime ~14d + user extend; images use `scrape-cache-images/`).
  return `scrapes/${safeSlug(sandbox || 'default')}/${safeSlug(scrapeId)}/${RECORD_OBJECT_NAME}`;
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function serializeTimestamp(v) {
  if (!v) return null;
  if (typeof v.toDate === 'function') return v.toDate().toISOString();
  const ms = firestoreTimestampToMs(v);
  if (ms != null) return new Date(ms).toISOString();
  return v;
}

function firestoreTimestampToMs(ts) {
  if (!ts) return null;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.toDate === 'function') {
    const dt = ts.toDate();
    return Number.isFinite(dt && dt.getTime && dt.getTime()) ? dt.getTime() : null;
  }
  if (typeof ts === 'number' && Number.isFinite(ts)) return ts;
  if (typeof ts === 'string') {
    const d = Date.parse(ts);
    return Number.isFinite(d) ? d : null;
  }
  if (typeof ts === 'object') {
    const sec = Number(ts._seconds != null ? ts._seconds : ts.seconds);
    const nsec = Number(ts._nanoseconds != null ? ts._nanoseconds : ts.nanoseconds);
    if (Number.isFinite(sec)) {
      return sec * 1000 + (Number.isFinite(nsec) ? Math.floor(nsec / 1e6) : 0);
    }
  }
  return null;
}

/** First retention window for a scrape row (no immediate mass-delete for legacy rows). */
function computeInitialPayloadRetentionExpiresAtMs({ createdAtMs, nowMs }) {
  const now = typeof nowMs === 'number' ? nowMs : Date.now();
  const created = typeof createdAtMs === 'number' && createdAtMs > 0 ? createdAtMs : now;
  return Math.max(created, now) + DEFAULT_PAYLOAD_RETENTION_MS;
}

/** Resolve expiry for API/UI from Firestore index (lazy default when field missing). */
function derivePayloadRetentionExpiresAtMsFromIndex(data) {
  if (!data || typeof data !== 'object') return Date.now() + DEFAULT_PAYLOAD_RETENTION_MS;
  const direct = firestoreTimestampToMs(data.payloadRetentionExpiresAt);
  if (direct != null) return direct;
  const created = firestoreTimestampToMs(data.createdAt);
  const now = Date.now();
  if (created == null) return now + DEFAULT_PAYLOAD_RETENTION_MS;
  return computeInitialPayloadRetentionExpiresAtMs({ createdAtMs: created, nowMs: now });
}

/** ISO expiry for list/detail responses (always defined for UX countdown). */
function payloadRetentionExpiresIsoForApi(data) {
  const s = serializeTimestamp(data.payloadRetentionExpiresAt);
  if (s) return s;
  return new Date(derivePayloadRetentionExpiresAtMsFromIndex(data)).toISOString();
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
    payloadRetentionExpiresAt: payloadRetentionExpiresIsoForApi(data),
    payloadRetentionExtendedAt: serializeTimestamp(data.payloadRetentionExtendedAt),
    scrapeImageRetentionDays: 3,
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

  try {
    await file.setMetadata({ customTime: new Date().toISOString() });
  } catch (_e) { /* best-effort — lifecycle still has age fallback during migration */ }

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
 * User-initiated cancel for a stuck scrape.
 * This flips the index row to a terminal state immediately. The running worker
 * cannot be hard-killed here, but UI/history no longer stays "Running…".
 */
async function cancelScrapeRun(sandbox, scrapeId, { reason } = {}) {
  const name = String(sandbox || '').trim();
  const sid = String(scrapeId || '').trim();
  if (!name || !sid) return { ok: false, status: 'bad_request' };
  const ref = getDb().collection(COLLECTION).doc(docId(name, sid));
  let out = { ok: false, status: 'not_found' };
  await getDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) {
      out = { ok: false, status: 'not_found' };
      return;
    }
    const data = snap.data() || {};
    const status = String(data.scrapeStatus || '');
    const active = status === 'running' || status === 'crawl_complete' || data.analysisPending === true
      || (data.buildPhase && data.buildPhase !== 'complete');
    if (!active) {
      out = { ok: false, status: status || 'complete' };
      return;
    }
    tx.set(ref, {
      scrapeStatus: 'failed',
      scrapeError: 'Run cancelled by user. You can retry this scrape from the card.',
      buildPhase: 'cancelled',
      runSteps: [{
        id: 'cancelled',
        label: 'Run cancelled',
        status: 'failed',
        detail: String(reason || 'Cancelled from history card').slice(0, 500),
      }],
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    out = { ok: true, status: 'cancelled' };
  });
  return out;
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
  const ref = getDb().collection(COLLECTION).doc(docId(name, scrapeId));
  const preSnap = await ref.get();
  const hadIndexedPayload = !!(preSnap.exists && preSnap.data() && preSnap.data().storagePath);

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

  try {
    if (!hadIndexedPayload) {
      await file.setMetadata({ customTime: new Date().toISOString() });
    } else {
      const [m] = await file.getMetadata();
      if (!m || !m.customTime) {
        const created = m && m.timeCreated ? Date.parse(m.timeCreated) : Date.now();
        const ageMs = Date.now() - created;
        const ctMs = ageMs >= DEFAULT_PAYLOAD_RETENTION_MS ? Date.now() : created;
        await file.setMetadata({ customTime: new Date(ctMs).toISOString() });
      }
    }
  } catch (e) {
    console.warn('[brandScrapeStore] record.json customTime align failed', path, String((e && e.message) || e));
  }

  // 2. Write the slim, queryable index doc to Firestore.
  const resolvedBuildPhase = options.buildPhase != null
    ? String(options.buildPhase)
    : (isCheckpoint ? 'crawl' : 'complete');

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
    buildPhase: resolvedBuildPhase,
  };

  const safeIndexDoc = stripUndefined(indexDoc);
  await getDb().runTransaction(async (tx) => {
    const prev = await tx.get(ref);
    const now = admin.firestore.FieldValue.serverTimestamp();
    const base = prev.exists ? prev.data() : {};
    const nowWall = Date.now();
    const createdMs = firestoreTimestampToMs(base.createdAt);
    let payloadRetentionExpiresAt = base.payloadRetentionExpiresAt;
    if (!payloadRetentionExpiresAt) {
      payloadRetentionExpiresAt = admin.firestore.Timestamp.fromMillis(
        computeInitialPayloadRetentionExpiresAtMs({
          createdAtMs: createdMs != null ? createdMs : nowWall,
          nowMs: nowWall,
        }),
      );
    }
    tx.set(ref, {
      ...safeIndexDoc,
      createdAt: base.createdAt || now,
      updatedAt: now,
      payloadRetentionExpiresAt,
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
      buildPhase: data.buildPhase || null,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      payloadRetentionExpiresAt: payloadRetentionExpiresIsoForApi({
        ...data,
        scrapeId: data.scrapeId || d.id,
      }),
      scrapeImageRetentionDays: 3,
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
    // GCS lifecycle (or manual delete) removed the JSON blob — in that case
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

const STALE_RUNNING_SCRAPE_MS = 35 * 60 * 1000;

async function refreshGcsPayloadCustomTime(sandbox, scrapeId) {
  const prefix = `scrapes/${safeSlug(sandbox)}/${safeSlug(scrapeId)}/`;
  const bucket = getBucket();
  const iso = new Date().toISOString();
  const [files] = await bucket.getFiles({ prefix, maxResults: 200 });
  for (const f of files || []) {
    const n = f.name || '';
    if (!n.endsWith(RECORD_OBJECT_NAME) && !/\/versions\/v\d+\.json$/i.test(n)) continue;
    await f.setMetadata({ customTime: iso }).catch(() => {});
  }
}

/**
 * Push JSON payload retention (Firestore + GCS customTime on record.json / versions).
 * Does not extend classified image blobs (short-lived; use Image hosting for long URLs).
 */
async function extendScrapeRetention(sandbox, scrapeId, { days = 14 } = {}) {
  const name = String(sandbox || '').trim();
  const sid = String(scrapeId || '').trim();
  if (!name || !sid) throw new Error('sandbox and scrapeId are required');
  const d = Math.min(90, Math.max(1, Math.round(Number(days)) || 14));
  const addMs = d * MS_PER_DAY;
  const ref = getDb().collection(COLLECTION).doc(docId(name, sid));
  let outIso = '';

  await getDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw Object.assign(new Error('not found'), { code: 'NOT_FOUND' });
    const data = snap.data() || {};
    if (data.sandbox && data.sandbox !== name) throw Object.assign(new Error('forbidden'), { code: 'FORBIDDEN' });
    const prevExpiryMs = derivePayloadRetentionExpiresAtMsFromIndex(data);
    const baseFrom = Math.max(Date.now(), prevExpiryMs);
    const nextTs = admin.firestore.Timestamp.fromMillis(baseFrom + addMs);
    outIso = nextTs.toDate().toISOString();
    tx.set(ref, {
      payloadRetentionExpiresAt: nextTs,
      payloadRetentionExtendedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  await refreshGcsPayloadCustomTime(name, sid);
  return { ok: true, scrapeId: sid, sandbox: name, days: d, payloadRetentionExpiresAt: outIso };
}

/** Legacy path `scrapes/.../images/` (pre split-prefix); delete when older than IMAGE_ARTIFACT_MAX_AGE_MS. */
async function purgeLegacyScrapeImages({ maxDeletes = 200 } = {}) {
  const bucket = getBucket();
  const [files] = await bucket.getFiles({ prefix: 'scrapes/', maxResults: 800 });
  const cutoff = Date.now() - IMAGE_ARTIFACT_MAX_AGE_MS;
  let deleted = 0;
  for (const f of files || []) {
    const n = f.name || '';
    if (!n.includes('/images/')) continue;
    let created = 0;
    try {
      const [meta] = await f.getMetadata();
      created = meta && meta.timeCreated ? Date.parse(meta.timeCreated) : 0;
    } catch (_e) { /* ignore */ }
    if (!created || created > cutoff) continue;
    await f.delete({ ignoreNotFound: true }).catch(() => {});
    deleted += 1;
    if (deleted >= maxDeletes) break;
  }
  return deleted;
}

/** Backfill GCS customTime on JSON blobs missing it (pairs with daysSinceCustomTime lifecycle). */
async function backfillGcsCustomTimeForRecordObjects({ maxPatches = 60 } = {}) {
  const bucket = getBucket();
  const [files] = await bucket.getFiles({ prefix: 'scrapes/', maxResults: 400 });
  let patched = 0;
  for (const f of files || []) {
    const n = f.name || '';
    if (!n.endsWith(RECORD_OBJECT_NAME) && !/\/versions\/v\d+\.json$/i.test(n)) continue;
    let meta = {};
    try {
      const [m] = await f.getMetadata();
      meta = m || {};
    } catch (_e) { continue; }
    if (meta.customTime) continue;
    const created = meta.timeCreated ? Date.parse(meta.timeCreated) : Date.now();
    const ageMs = Date.now() - created;
    const ctMs = ageMs >= DEFAULT_PAYLOAD_RETENTION_MS ? Date.now() : created;
    try {
      await f.setMetadata({ customTime: new Date(ctMs).toISOString() });
      patched += 1;
    } catch (_e) { /* ignore */ }
    if (patched >= maxPatches) break;
  }
  return patched;
}

/** Scheduled maintenance: fail very old running scrapes (stuck index rows). */
async function runBrandScrapeStaleMaintenance() {
  const db = getDb();
  const nowMs = Date.now();
  let failedStaleRunning = 0;
  let legacyImagesPurged = 0;
  let gcsCustomTimeBackfilled = 0;

  try {
    legacyImagesPurged = await purgeLegacyScrapeImages({ maxDeletes: 200 });
  } catch (e) {
    console.warn('[brandScrapeStore] purgeLegacyScrapeImages', String((e && e.message) || e));
  }
  try {
    gcsCustomTimeBackfilled = await backfillGcsCustomTimeForRecordObjects({ maxPatches: 60 });
  } catch (e) {
    console.warn('[brandScrapeStore] backfillGcsCustomTimeForRecordObjects', String((e && e.message) || e));
  }

  const staleStatuses = ['running', 'crawl_complete'];
  for (const status of staleStatuses) {
    const runSnap = await db.collection(COLLECTION).where('scrapeStatus', '==', status).limit(300).get();
    for (const doc of runSnap.docs) {
      const d = doc.data() || {};
      const rs = d.runStartedAt;
      const t = firestoreTimestampToMs(rs) || 0;
      if (t && nowMs - t > STALE_RUNNING_SCRAPE_MS && d.scrapeId && d.sandbox) {
        await markScrapeFailed(String(d.sandbox), String(d.scrapeId), {
          error: 'Run timed out (stale). The worker did not finish within 35 minutes; cancel/retry from the card.',
          steps: [{
            id: 'runtime',
            label: 'Run did not finish',
            status: 'failed',
            detail: `Status "${status}" stayed active past the timeout window (worker disconnect, long API stall, or crash).`,
          }],
        });
        failedStaleRunning += 1;
      }
    }
  }

  console.log(JSON.stringify({
    src: 'brandScrapeStore.maintenance',
    phase: 'stale_cleanup',
    failedStaleRunning,
    legacyImagesPurged,
    gcsCustomTimeBackfilled,
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
  cancelScrapeRun,
  runBrandScrapeStaleMaintenance,
  extendScrapeRetention,
  hasRealPayload,
  computeInitialPayloadRetentionExpiresAtMs,
  derivePayloadRetentionExpiresAtMsFromIndex,
  DEFAULT_PAYLOAD_RETENTION_MS,
  IMAGE_ARTIFACT_MAX_AGE_MS,
};
