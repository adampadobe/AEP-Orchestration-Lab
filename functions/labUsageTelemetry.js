'use strict';

const { createHash } = require('node:crypto');

const EVENT_LIMIT = 5000;
const DAY_MS = 86400000;
const SKEW_MS = 5 * 60000;
const RATE_LIMIT = 60;
const RETENTION_DAYS = 90;
const ROUTES = Object.freeze([
  'home.html', 'home-new.html', 'global-settings.html', 'profile.html',
  'schema-viewer.html', 'audience-membership.html', 'profile-generation.html', 'consent.html',
  'journeys.html', 'event-tool.html', 'webhooks.html', 'live-activities.html',
  'brand-scraper.html', 'image-hosting.html', 'firebase-database.html',
  'audit-events.html', 'mcp-servers.html', 'usage-statistics.html',
  'journey-arbitration-v3.html',
].map((page) => '/profile-viewer/' + page));
const NOTICE = 'Lab usage reporting: signed-in page visits, successful lab logins and capped visible/recently-active time estimates are linked to your account and visible only to the lab owner. No keystrokes, query strings, profile data, referrers or page contents are collected. Detailed events are eligible for deletion after 90 days.';

function telemetryEnabled() {
  return process.env.LAB_USAGE_TELEMETRY_ENABLED === 'true';
}

function invalid(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

async function requireTelemetryUser(req, auth) {
  const bearer = /^Bearer\s+(\S+)$/i.exec(String(req.headers?.authorization || ''));
  if (!bearer) throw invalid('Firebase sign-in is required.', 401);
  let claims;
  try {
    claims = await auth.verifyIdToken(bearer[1], true);
  } catch (error) {
    if ([
      'auth/id-token-expired', 'auth/id-token-revoked', 'auth/invalid-id-token',
      'auth/argument-error', 'auth/invalid-argument', 'auth/user-disabled',
      'auth/user-not-found', 'auth/tenant-id-mismatch',
    ].includes(error.code)) throw invalid('Your sign-in is invalid. Sign in again.', 401);
    throw error;
  }
  if (!claims.uid || !claims.email || claims.firebase?.sign_in_provider === 'anonymous') {
    throw invalid('A non-anonymous lab account is required.', 403);
  }
  return claims;
}

function validateEvent(body, claims, now) {
  const fields = ['version', 'id', 'type', 'route', 'occurredAt', 'navigation', 'activeMs'];
  if (!body || typeof body !== 'object' || Array.isArray(body)
      || Buffer.byteLength(JSON.stringify(body)) > 1024
      || Object.keys(body).some((key) => !fields.includes(key))) {
    throw invalid('Supply only the versioned usage event fields (maximum 1 KB).');
  }
  if (![1, 2].includes(body.version) || !['page_view', 'sign_in', 'heartbeat'].includes(body.type)
      || (body.type === 'heartbeat' && body.version !== 2)
      || typeof body.id !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(body.id)
      || !ROUTES.includes(body.route)) {
    throw invalid('Invalid usage event version, ID, type or route.');
  }
  if (typeof body.occurredAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(body.occurredAt)
      || !Number.isFinite(Date.parse(body.occurredAt))
      || Math.abs(Date.parse(body.occurredAt) - now.getTime()) > SKEW_MS) {
    throw invalid('Event time must be within five minutes of the server clock.');
  }
  if (body.type === 'page_view' && !['navigate', 'reload', 'back_forward', 'auth_ready'].includes(body.navigation)) {
    throw invalid('Page views require a supported navigation type.');
  }
  if (body.type === 'sign_in' && (body.navigation !== undefined
      || !Number.isFinite(claims.auth_time)
      || Math.abs(claims.auth_time * 1000 - Date.parse(body.occurredAt)) > 60000
      || Math.abs(claims.auth_time * 1000 - now.getTime()) > SKEW_MS)) {
    throw invalid('Sign-in events require a recent successful Firebase authentication.');
  }
  if (body.type === 'heartbeat') {
    if (body.navigation !== undefined || !Number.isInteger(body.activeMs) || body.activeMs < 1 || body.activeMs > 30000) {
      throw invalid('Heartbeats require 1-30000 active milliseconds and no navigation field.');
    }
  } else if (body.activeMs !== undefined) throw invalid('Only heartbeats may contain active milliseconds.');
  return {
    version: body.version, type: body.type, route: body.route, occurredAt: body.occurredAt,
    ...(body.type === 'heartbeat' ? { activeMs: body.activeMs } : {}),
    ...(body.type === 'page_view' ? { navigation: body.navigation } : {}),
  };
}

async function collectEvent({ db, claims, body, now = new Date() }) {
  const event = validateEvent(body, claims, now);
  const actorKey = createHash('sha256').update(claims.uid).digest('hex');
  const eventKey = createHash('sha256').update(claims.uid + '\0' + body.id).digest('hex');
  const eventRef = db.collection('labUsageEvents').doc(eventKey);
  const rateRef = db.collection('labUsageRateLimits').doc(actorKey);
  const fingerprint = createHash('sha256').update(JSON.stringify(event)).digest('hex');
  return db.runTransaction(async (tx) => {
    const existing = await tx.get(eventRef);
    if (existing.exists) {
      if (existing.data().fingerprint !== fingerprint) throw invalid('Event ID was already used for a different event.', 409);
      return { duplicate: true };
    }
    const rate = await tx.get(rateRef);
    const previous = rate.exists ? rate.data() : {};
    const inWindow = Number.isFinite(previous.windowStart)
      && now.getTime() >= previous.windowStart && now.getTime() - previous.windowStart < 60000;
    const count = inWindow ? previous.count : 0;
    if (count >= RATE_LIMIT) throw invalid('Usage event rate limit reached. Retry later.', 429);
    tx.set(rateRef, {
      windowStart: inWindow ? previous.windowStart : now.getTime(),
      count: count + 1, expiresAt: new Date(now.getTime() + DAY_MS),
    });
    tx.create(eventRef, {
      ...event, uid: claims.uid, fingerprint, timestamp: now.toISOString(),
      expiresAt: new Date(now.getTime() + RETENTION_DAYS * DAY_MS),
    });
    return { duplicate: false };
  });
}

async function readTelemetry({ db, days, now }) {
  const start = new Date(now.getTime() - days * DAY_MS).toISOString();
  const result = await db.collection('labUsageEvents')
    .where('timestamp', '>=', start).where('timestamp', '<=', now.toISOString())
    .orderBy('timestamp', 'desc')
    .select('uid', 'type', 'route', 'timestamp', 'expiresAt', 'navigation', 'occurredAt', 'activeMs')
    .limit(EVENT_LIMIT + 1).get();
  return {
    records: result.docs.slice(0, EVENT_LIMIT).map((doc) => doc.data()),
    truncated: result.docs.length > EVENT_LIMIT,
  };
}

function summarizeTelemetry({ records, users, now, days, truncated, enabled }) {
  const start = now.getTime() - days * DAY_MS;
  const people = new Map(users.map((user) => [user.uid, {
    uid: user.uid, pageViews: 0, signIns: 0, lastPageViewAt: null, lastSignInEventAt: null,
    pages: new Map(),
  }]));
  const pages = new Map();
  const daily = new Map();
  const hours = Array.from({ length: 7 }, () => Array(24).fill(0));
  const active = new Set();
  let pageViews = 0;
  let signIns = 0;
  let unattributedEvents = 0;
  for (const record of records) {
    const ms = Date.parse(record.timestamp);
    const expiry = record.expiresAt?.toDate ? record.expiresAt.toDate().getTime() : new Date(record.expiresAt).getTime();
    if (!Number.isFinite(ms) || ms < start || ms > now.getTime()
        || !Number.isFinite(expiry) || expiry <= now.getTime()
        || !ROUTES.includes(record.route) || !['page_view', 'sign_in'].includes(record.type)) continue;
    const isPage = record.type === 'page_view';
    if (isPage) pageViews += 1;
    else signIns += 1;
    const date = new Date(ms);
    hours[date.getUTCDay()][date.getUTCHours()] += 1;
    const day = date.toISOString().slice(0, 10);
    if (!daily.has(day)) daily.set(day, { date: day, pageViews: 0, signIns: 0 });
    daily.get(day)[isPage ? 'pageViews' : 'signIns'] += 1;
    const user = people.get(record.uid);
    if (user) {
      active.add(user.uid);
      user[isPage ? 'pageViews' : 'signIns'] += 1;
      const last = isPage ? 'lastPageViewAt' : 'lastSignInEventAt';
      if (!user[last] || record.timestamp > user[last]) user[last] = record.timestamp;
      if (isPage) user.pages.set(record.route, (user.pages.get(record.route) || 0) + 1);
    } else unattributedEvents += 1;
    if (isPage) {
      if (!pages.has(record.route)) pages.set(record.route, {
        route: record.route, views: 0, reloads: 0, lastViewedAt: null, users: new Set(),
      });
      const page = pages.get(record.route);
      page.views += 1;
      if (record.navigation === 'reload') page.reloads += 1;
      if (user) page.users.add(user.uid);
      if (!page.lastViewedAt || record.timestamp > page.lastViewedAt) page.lastViewedAt = record.timestamp;
    }
  }
  return {
    enabled, completeness: 'partial', truncated, limit: EVENT_LIMIT, routes: ROUTES,
    summary: { pageViews, signIns, activeUsers: active.size, unattributedEvents },
    users: [...people.values()].map(({ pages: visited, ...user }) => ({
      ...user,
      pages: [...visited].map(([route, views]) => ({ route, views }))
        .sort((a, b) => b.views - a.views || a.route.localeCompare(b.route)),
    })),
    pages: [...pages.values()].map(({ users: visitors, ...page }) => ({ ...page, users: visitors.size }))
      .sort((a, b) => b.views - a.views || a.route.localeCompare(b.route)),
    daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)), hours,
  };
}

module.exports = {
  ROUTES, NOTICE, EVENT_LIMIT, telemetryEnabled, requireTelemetryUser, validateEvent,
  collectEvent, readTelemetry, summarizeTelemetry,
};
