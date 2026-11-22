'use strict';

/**
 * Aggregate-only page heat map for the lab home page.
 *
 * labUsageEvents (raw, per-UID, 90-day TTL) → hourly roll-up →
 * labUsageAggregates/{YYYY-MM-DD} → GET /api/lab/usage/heatmap.
 *
 * Daily documents keep a per-route list of truncated, purpose-salted actor
 * digests (never UIDs or emails) so window-level unique-user buckets can be
 * computed without re-reading raw events. They expire with the same 90-day
 * retention as the raw events. The API only ever returns counts.
 */

const { createHash } = require('node:crypto');
const { CATALOGUE, ROUTES, DAY_MS, RETENTION_DAYS } = require('./labUsageTelemetry');

const COLLECTION = 'labUsageAggregates';
const WINDOWS = Object.freeze({ '7d': 7, '30d': 30 });
const MIN_VIEWS = 5;
const PAGE_SIZE = 2000;
const BACKFILL_DAYS = 60;
const BACKFILL_PER_RUN = 7;
const PAGES = new Map(CATALOGUE.pages.map((page) => [page.route, page]));

function dayKey(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function dayStart(day) {
  return Date.parse(day + 'T00:00:00.000Z');
}

function actorDigest(uid) {
  return createHash('sha256').update('lab-usage-aggregate\0' + uid).digest('hex').slice(0, 16);
}

function usersBucket(count) {
  if (count < 5) return '<5';
  if (count < 10) return '5-9';
  if (count < 25) return '10-24';
  if (count < 50) return '25-49';
  return '50+';
}

/** Recompute one UTC day from raw events and overwrite its aggregate document. */
async function rollupDay({ db, day, now = new Date() }) {
  const from = new Date(dayStart(day)).toISOString();
  const to = new Date(dayStart(day) + DAY_MS).toISOString();
  const routes = new Map();
  let pageViews = 0;
  let last = null;
  for (;;) {
    let query = db.collection('labUsageEvents')
      .where('timestamp', '>=', from).where('timestamp', '<', to)
      .orderBy('timestamp').select('uid', 'type', 'route', 'expiresAt').limit(PAGE_SIZE);
    if (last) query = query.startAfter(last);
    const page = await query.get();
    for (const doc of page.docs) {
      const event = doc.data();
      const expiry = event.expiresAt?.toDate ? event.expiresAt.toDate().getTime() : new Date(event.expiresAt).getTime();
      if (event.type !== 'page_view' || !ROUTES.includes(event.route) || typeof event.uid !== 'string'
          || !Number.isFinite(expiry) || expiry <= now.getTime()) continue;
      if (!routes.has(event.route)) routes.set(event.route, { route: event.route, views: 0, actors: new Set() });
      const entry = routes.get(event.route);
      entry.views += 1;
      entry.actors.add(actorDigest(event.uid));
      pageViews += 1;
    }
    if (page.docs.length < PAGE_SIZE) break;
    last = page.docs[page.docs.length - 1];
  }
  const record = {
    day,
    pageViews,
    routes: [...routes.values()].map((entry) => ({ route: entry.route, views: entry.views, actors: [...entry.actors].sort() }))
      .sort((a, b) => a.route.localeCompare(b.route)),
    complete: dayStart(day) + DAY_MS <= now.getTime(),
    computedAt: now.toISOString(),
    expiresAt: new Date(dayStart(day) + (RETENTION_DAYS + 1) * DAY_MS),
  };
  await db.collection(COLLECTION).doc(day).set(record);
  return { day, pageViews, routes: record.routes.length };
}

/**
 * Hourly job: always refresh today and yesterday (late events), then backfill a
 * few missing or incomplete days inside the retention window.
 */
async function runRollup({ db, now = new Date(), logger = console }) {
  const today = dayKey(now.getTime());
  const days = [today, dayKey(now.getTime() - DAY_MS)];
  const oldest = dayKey(now.getTime() - BACKFILL_DAYS * DAY_MS);
  const existing = await db.collection(COLLECTION).where('day', '>=', oldest).select('day', 'complete').get();
  const done = new Set(existing.docs.map((doc) => doc.data()).filter((data) => data.complete).map((data) => data.day));
  const backfill = [];
  for (let offset = 2; offset <= BACKFILL_DAYS && backfill.length < BACKFILL_PER_RUN; offset += 1) {
    const day = dayKey(now.getTime() - offset * DAY_MS);
    if (!done.has(day)) backfill.push(day);
  }
  const results = [];
  for (const day of [...days, ...backfill]) results.push(await rollupDay({ db, day, now }));
  logger.log('[lab-usage-rollup] refreshed', results.length, 'day(s)');
  return results;
}

/** Build the public, aggregate-only heat map for a 7d or 30d window. */
async function readHeatmap({ db, window, now = new Date() }) {
  const days = WINDOWS[window];
  if (!days) throw Object.assign(new Error('window must be 7d or 30d.'), { status: 400 });
  const today = dayStart(dayKey(now.getTime()));
  const currentFrom = dayKey(today - (days - 1) * DAY_MS);
  const previousFrom = dayKey(today - (2 * days - 1) * DAY_MS);
  const snapshot = await db.collection(COLLECTION).where('day', '>=', previousFrom).get();
  const current = new Map();
  const previous = new Map();
  let daysWithData = 0;
  let computedAt = null;
  for (const doc of snapshot.docs) {
    const data = doc.data();
    if (typeof data.day !== 'string' || data.day < previousFrom || data.day > dayKey(today)) continue;
    const isCurrent = data.day >= currentFrom;
    if (isCurrent) daysWithData += 1;
    if (isCurrent && (!computedAt || data.computedAt > computedAt)) computedAt = data.computedAt;
    for (const entry of Array.isArray(data.routes) ? data.routes : []) {
      if (!ROUTES.includes(entry.route) || !Number.isInteger(entry.views)) continue;
      const target = isCurrent ? current : previous;
      if (!target.has(entry.route)) target.set(entry.route, { views: 0, actors: new Set() });
      const total = target.get(entry.route);
      total.views += entry.views;
      (Array.isArray(entry.actors) ? entry.actors : []).forEach((actor) => total.actors.add(actor));
    }
  }
  let belowThreshold = 0;
  const items = [];
  for (const [route, total] of current) {
    if (total.views < MIN_VIEWS) { belowThreshold += 1; continue; }
    const page = PAGES.get(route) || {};
    const prior = previous.get(route)?.views || 0;
    items.push({
      route,
      navGroup: page.navGroup || null,
      label: page.label || route,
      views: total.views,
      uniqueUsersBucket: usersBucket(total.actors.size),
      trendPct: prior >= MIN_VIEWS ? Math.round(((total.views - prior) / prior) * 100) : null,
    });
  }
  items.sort((a, b) => b.views - a.views || a.route.localeCompare(b.route));
  return {
    window, from: currentFrom, to: dayKey(today), minViews: MIN_VIEWS,
    daysWithData, computedAt, belowThreshold, items,
  };
}

module.exports = {
  COLLECTION, WINDOWS, MIN_VIEWS, actorDigest, usersBucket, dayKey, rollupDay, runRollup, readHeatmap,
};
