/**
 * Per-sandbox Brand Scraper record storage.
 * Collection: brandScrapes/{sandbox}__{scrapeId}
 *   { sandbox, scrapeId, url, baseUrl, brandName, businessType, country,
 *     crawlSummary, analysis, analysisError, elapsedMs, createdAt, updatedAt }
 *
 * All reads/writes via Admin SDK; client Firestore rules deny all.
 */

'use strict';

const admin = require('firebase-admin');

const COLLECTION = 'brandScrapes';
const MAX_RECORD_CHARS = 900_000; // stay well under Firestore 1MiB doc limit

let db;
function getDb() {
  if (!db) {
    if (!admin.apps.length) admin.initializeApp();
    db = admin.firestore();
  }
  return db;
}

function safeSlug(s) {
  return String(s || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 200);
}

function docId(sandbox, id) {
  return `${safeSlug(sandbox || 'default')}__${safeSlug(id)}`.slice(0, 400);
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
  };
}

async function saveScrape(sandbox, payload) {
  const name = String(sandbox || '').trim();
  if (!name) throw new Error('sandbox is required');
  const scrapeId = String((payload && payload.scrapeId) || '').trim() || genId();
  const record = {
    sandbox: name,
    scrapeId,
    url: payload.url || '',
    baseUrl: payload.baseUrl || '',
    brandName: payload.brandName || '',
    businessType: payload.businessType || '',
    country: payload.country || '',
    crawlSummary: payload.crawlSummary || null,
    analysis: payload.analysis || null,
    analysisError: payload.analysisError || null,
    elapsedMs: typeof payload.elapsedMs === 'number' ? payload.elapsedMs : null,
  };
  const encoded = JSON.stringify(record);
  if (encoded.length > MAX_RECORD_CHARS) {
    // If the record is too large (e.g. huge analysis), drop page text details.
    record.crawlSummary = record.crawlSummary
      ? { ...record.crawlSummary, pages: (record.crawlSummary.pages || []).slice(0, 20) }
      : null;
  }
  const ref = getDb().collection(COLLECTION).doc(docId(name, scrapeId));
  await getDb().runTransaction(async (tx) => {
    const prev = await tx.get(ref);
    const now = admin.firestore.FieldValue.serverTimestamp();
    const base = prev.exists ? prev.data() : {};
    tx.set(ref, {
      ...record,
      createdAt: base.createdAt || now,
      updatedAt: now,
    }, { merge: true });
  });
  const after = await ref.get();
  return hydrate(after.exists ? after.data() : null);
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
      elapsedMs: data.elapsedMs,
      analysisError: data.analysisError,
      analysisPresent: !!(data.analysis && !data.analysis.skipped && !data.analysis.error),
      pagesScraped: data.crawlSummary ? data.crawlSummary.pagesScraped : null,
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

async function getScrape(sandbox, id) {
  const name = String(sandbox || '').trim();
  const sid = String(id || '').trim();
  if (!name || !sid) return null;
  const ref = getDb().collection(COLLECTION).doc(docId(name, sid));
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data() || {};
  if (data.sandbox && data.sandbox !== name) return null;
  return hydrate({ scrapeId: data.scrapeId || snap.id, ...data });
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
  await ref.delete();
  return true;
}

module.exports = { saveScrape, listScrapes, getScrape, deleteScrape, genId };
