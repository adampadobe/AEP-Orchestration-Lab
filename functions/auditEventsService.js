const admin = require('firebase-admin');

const AUDIT_API_BASE = 'https://platform.adobe.io/data/foundation/audit/events';
const COLLECTION = 'auditEventsCache';
const PAGE_LIMIT = 100;
const MAX_PAGES = 50;

let db;
function getDb() {
  if (!db) {
    if (!admin.apps.length) admin.initializeApp();
    db = admin.firestore();
  }
  return db;
}

function cacheDocId(sandbox, startISO, endISO) {
  const raw = `${sandbox || 'default'}_${startISO}_${endISO}`;
  return raw.replace(/[\/\*\~\[\]]/g, '_').slice(0, 1500);
}

function ttlForRange(endISO) {
  const endDate = new Date(endISO);
  const now = new Date();
  const endDay = endDate.toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  if (endDay >= today) return 5 * 60 * 1000;
  return 60 * 60 * 1000;
}

async function getCachedEvents(sandbox, startISO, endISO) {
  try {
    const docId = cacheDocId(sandbox, startISO, endISO);
    const snap = await getDb().collection(COLLECTION).doc(docId).get();
    if (!snap.exists) return null;
    const data = snap.data();
    const age = Date.now() - (data.fetchedAtMs || 0);
    if (age > (data.ttlMs || 0)) return null;
    return data;
  } catch {
    return null;
  }
}

function slimEvent(ev) {
  return {
    id: ev.id || '',
    action: ev.action || '',
    timestamp: ev.timestamp || ev.created || '',
    userEmail: ev.userEmail || ev.user || ev.userId || '',
    assetType: ev.assetType || ev.permissionResource || '',
    assetName: ev.assetName || '',
    status: ev.status || '',
    permissionType: ev.permissionType || '',
  };
}

async function setCachedEvents(sandbox, startISO, endISO, events, total) {
  try {
    const docId = cacheDocId(sandbox, startISO, endISO);
    const ttlMs = ttlForRange(endISO);
    const slim = events.map(slimEvent);
    const payload = JSON.stringify(slim);
    if (payload.length > 900000) return;
    await getDb().collection(COLLECTION).doc(docId).set({
      events: slim,
      total,
      fetchedAtMs: Date.now(),
      fetchedAt: admin.firestore.FieldValue.serverTimestamp(),
      ttlMs,
      sandbox: sandbox || 'default',
      startISO,
      endISO,
    });
  } catch { /* non-fatal */ }
}

/**
 * Paginate through the AEP Audit Events API and return all events in the range.
 *
 * @param {object} opts
 * @param {string} opts.token    - Adobe access token
 * @param {string} opts.clientId - x-api-key
 * @param {string} opts.orgId   - x-gw-ims-org-id
 * @param {string} opts.sandbox - x-sandbox-name
 * @param {string} opts.startISO - ISO start timestamp
 * @param {string} opts.endISO   - ISO end timestamp
 * @param {string} [opts.action] - optional action filter
 * @param {function} [opts.onPage] - optional callback(pageNum, eventsSoFar) for progress
 * @returns {Promise<{ events: Array, total: number, pages: number, capped: boolean }>}
 */
async function fetchAllAuditEvents({ token, clientId, orgId, sandbox, startISO, endISO, action, onPage }) {
  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    'x-api-key': clientId,
    'x-gw-ims-org-id': orgId,
    'x-sandbox-name': sandbox || 'prod',
  };

  const allEvents = [];
  let offset = 0;
  let pageNum = 0;
  let capped = false;
  let queryId = null;

  for (; pageNum < MAX_PAGES; pageNum++) {
    const params = new URLSearchParams();
    params.set('limit', String(PAGE_LIMIT));
    params.set('start', String(offset));
    if (queryId) params.set('queryId', queryId);
    if (startISO) params.append('property', `timestamp>=${startISO}`);
    if (endISO) params.append('property', `timestamp<=${endISO}`);
    if (action) params.append('property', `action==${action}`);

    const url = `${AUDIT_API_BASE}?${params.toString()}`;
    const resp = await fetch(url, { method: 'GET', headers });
    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      const msg = data.detail || data.message || data.title || resp.statusText;
      throw new Error(`Audit API ${resp.status}: ${msg}`);
    }

    if (data.queryId) queryId = data.queryId;

    const embedded = data._embedded || data;
    const batch = embedded.events || [];
    allEvents.push(...batch);

    if (onPage) onPage(pageNum + 1, allEvents.length);

    const pageInfo = data.page || {};
    const totalElements = pageInfo.totalElements;
    if (batch.length < PAGE_LIMIT) break;
    if (totalElements && allEvents.length >= totalElements) break;
    offset += PAGE_LIMIT;
  }

  if (pageNum >= MAX_PAGES) capped = true;

  return { events: allEvents, total: allEvents.length, pages: pageNum + 1, capped };
}

/**
 * Main entry point: check cache, paginate if needed, cache result.
 */
async function getAuditEvents({ token, clientId, orgId, sandbox, startISO, endISO, action, skipCache }) {
  if (!skipCache && !action) {
    const cached = await getCachedEvents(sandbox, startISO, endISO);
    if (cached) {
      return {
        events: cached.events || [],
        total: cached.total || 0,
        fetchedAt: new Date(cached.fetchedAtMs).toISOString(),
        cached: true,
        pages: 0,
        capped: false,
      };
    }
  }

  const result = await fetchAllAuditEvents({ token, clientId, orgId, sandbox, startISO, endISO, action });

  if (!action) {
    setCachedEvents(sandbox, startISO, endISO, result.events, result.total).catch(() => {});
  }

  return {
    events: result.events,
    total: result.total,
    fetchedAt: new Date().toISOString(),
    cached: false,
    pages: result.pages,
    capped: result.capped,
  };
}

module.exports = { getAuditEvents, fetchAllAuditEvents };
