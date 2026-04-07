const admin = require('firebase-admin');

const AUDIT_API_BASE = 'https://platform.adobe.io/data/foundation/audit/events';
const COLLECTION = 'auditEventsCache';
const PAGE_LIMIT = 100;
const MAX_PAGES = 10;

let db;
function getDb() {
  if (!db) {
    if (!admin.apps.length) admin.initializeApp();
    db = admin.firestore();
  }
  return db;
}

function dayDocId(sandbox, dayISO) {
  return `${sandbox || 'default'}_day_${dayISO}`.replace(/[\/\*\~\[\]]/g, '_').slice(0, 1500);
}

function ttlForDay(dayISO) {
  const today = new Date().toISOString().slice(0, 10);
  if (dayISO >= today) return 5 * 60 * 1000;
  return 60 * 60 * 1000;
}

async function getCachedDay(sandbox, dayISO) {
  try {
    const docId = dayDocId(sandbox, dayISO);
    const snap = await getDb().collection(COLLECTION).doc(docId).get();
    if (!snap.exists) return null;
    const data = snap.data();
    const age = Date.now() - (data.fetchedAtMs || 0);
    if (age > (data.ttlMs || 0)) return null;
    return data.events || [];
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

async function setCachedDay(sandbox, dayISO, events) {
  try {
    const docId = dayDocId(sandbox, dayISO);
    const slim = events.map(slimEvent);
    const payload = JSON.stringify(slim);
    if (payload.length > 900000) return;
    await getDb().collection(COLLECTION).doc(docId).set({
      events: slim,
      total: slim.length,
      fetchedAtMs: Date.now(),
      fetchedAt: admin.firestore.FieldValue.serverTimestamp(),
      ttlMs: ttlForDay(dayISO),
      sandbox: sandbox || 'default',
      dayISO,
    });
  } catch { /* non-fatal */ }
}

/**
 * Paginate through ALL events for a single day (bypasses the 1000 per-query cap).
 */
async function fetchDayEvents(headers, dayStart, dayEnd, action) {
  const allEvents = [];
  let offset = 0;
  let queryId = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams();
    params.set('limit', String(PAGE_LIMIT));
    params.set('start', String(offset));
    if (queryId) params.set('queryId', queryId);
    params.append('property', `timestamp>=${dayStart}`);
    params.append('property', `timestamp<=${dayEnd}`);
    if (action) params.append('property', `action==${action}`);

    const url = `${AUDIT_API_BASE}?${params.toString()}`;
    const resp = await fetch(url, { method: 'GET', headers });
    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      const msg = data.detail || data.message || data.title || resp.statusText;
      throw new Error(`Audit API ${resp.status}: ${msg}`);
    }

    if (data.queryId) queryId = data.queryId;

    const batch = (data._embedded || data).events || [];
    allEvents.push(...batch);

    const totalElements = (data.page || {}).totalElements;
    if (batch.length < PAGE_LIMIT) break;
    if (totalElements && allEvents.length >= totalElements) break;
    offset += PAGE_LIMIT;
  }

  return allEvents;
}

/**
 * Split the overall date range into individual calendar days.
 */
function dayChunks(startISO, endISO) {
  const chunks = [];
  const end = new Date(endISO);
  let cursor = new Date(startISO);
  cursor.setUTCHours(0, 0, 0, 0);

  while (cursor <= end) {
    const dayISO = cursor.toISOString().slice(0, 10);
    const dayStart = dayISO + 'T00:00:00.000Z';
    const dayEnd = dayISO + 'T23:59:59.999Z';
    chunks.push({ dayISO, dayStart, dayEnd: dayEnd < endISO ? dayEnd : endISO });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return chunks;
}

/**
 * Main entry point: fetch all events across the full date range by
 * chunking into daily windows, with per-day caching.
 */
async function getAuditEvents({ token, clientId, orgId, sandbox, startISO, endISO, action, skipCache }) {
  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    'x-api-key': clientId,
    'x-gw-ims-org-id': orgId,
    'x-sandbox-name': sandbox || 'prod',
  };

  const days = dayChunks(startISO, endISO);
  const allEvents = [];
  let totalPages = 0;
  let daysCached = 0;
  let daysFetched = 0;

  const todayISO = new Date().toISOString().slice(0, 10);

  for (const { dayISO, dayStart, dayEnd } of days) {
    const isToday = dayISO >= todayISO;

    if (!skipCache && !action && !isToday) {
      const cached = await getCachedDay(sandbox, dayISO);
      if (cached) {
        allEvents.push(...cached);
        daysCached++;
        continue;
      }
    }

    const dayEvents = await fetchDayEvents(headers, dayStart, dayEnd, action);
    allEvents.push(...dayEvents);
    daysFetched++;
    totalPages++;

    if (!action && !isToday) {
      setCachedDay(sandbox, dayISO, dayEvents).catch(() => {});
    }
  }

  return {
    events: allEvents,
    total: allEvents.length,
    fetchedAt: new Date().toISOString(),
    cached: daysFetched === 0 && daysCached > 0,
    pages: totalPages,
    days: days.length,
    daysCached,
    daysFetched,
    capped: false,
  };
}

module.exports = { getAuditEvents };
