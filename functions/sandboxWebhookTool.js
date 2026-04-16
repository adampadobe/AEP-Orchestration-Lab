/**
 * Sandbox-scoped webhook monitor: receive HTTP webhooks, persist per sandbox in Firestore,
 * serve stats/feed/clear for the lab UI. Inbound requests are unauthenticated except path token.
 */
const admin = require('firebase-admin');
const crypto = require('crypto');

const COLLECTION = 'sandboxWebhookToolConfigs';
const MAX_EVENTS = 200;

function getDb() {
  if (!admin.apps.length) admin.initializeApp();
  return admin.firestore();
}

function setCors(res, methods = 'GET, POST, PUT, PATCH, DELETE, OPTIONS') {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', methods);
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
}

function sanitizeSandboxKey(raw) {
  const t = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 64);
  return t || 'default';
}

function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('hex');
}

function parseRequestPath(req) {
  const u = req.url || req.originalUrl || '';
  return u.split('?')[0] || '/';
}

function pathSegments(path) {
  return path
    .split('/')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function getClientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (xf && typeof xf === 'string') return xf.split(',')[0].trim();
  return req.ip || req.connection?.remoteAddress || '';
}

/** Normalize headers to plain object (lowercase keys like many proxies). */
function collectHeaders(req) {
  const out = {};
  const h = req.headers || {};
  for (const [k, v] of Object.entries(h)) {
    if (v == null) continue;
    const key = String(k).toLowerCase();
    out[key] = Array.isArray(v) ? v.join(', ') : String(v);
  }
  return out;
}

function parseBodyForStore(req) {
  const ct = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();

  if (Buffer.isBuffer(req.rawBody) && req.rawBody.length) {
    const rawStr = req.rawBody.toString('utf8');
    return finalizeBody(ct, rawStr, null);
  }

  if (req.body !== undefined && req.body !== null) {
    if (Buffer.isBuffer(req.body)) {
      return finalizeBody(ct, req.body.toString('utf8'), null);
    }
    if (typeof req.body === 'string') {
      return finalizeBody(ct, req.body, null);
    }
    if (typeof req.body === 'object') {
      /** Already parsed (JSON or urlencoded). */
      let rawStr = '';
      try {
        rawStr = JSON.stringify(req.body);
      } catch {
        rawStr = '[object]';
      }
      return {
        contentType: ct || 'application/json',
        bodyJson: req.body,
        bodyText: rawStr,
      };
    }
  }

  return {
    contentType: ct || 'application/octet-stream',
    bodyJson: null,
    bodyText: '',
  };
}

function finalizeBody(ct, rawStr, _hint) {
  let bodyJson = null;
  if (ct.includes('json') && rawStr) {
    try {
      bodyJson = JSON.parse(rawStr);
    } catch {
      bodyJson = null;
    }
  }
  return {
    contentType: ct || 'application/octet-stream',
    bodyJson,
    bodyText: rawStr,
  };
}

function eventToWebhookRow(id, data) {
  const receivedAt = data.receivedAt;
  const ts =
    receivedAt && typeof receivedAt.toMillis === 'function'
      ? receivedAt.toMillis()
      : typeof data.timestampMs === 'number'
        ? data.timestampMs
        : Date.now();

  const bodyOut =
    data.bodyJson != null
      ? data.bodyJson
      : data.bodyText
        ? { _raw: data.bodyText }
        : {};

  return {
    id,
    timestamp: ts,
    method: data.method || 'POST',
    status: data.status || 'received',
    contentType: data.contentType || 'unknown',
    headers: data.headers || {},
    body: bodyOut,
    query: data.query || {},
    ip: data.ip || '',
    userAgent: data.userAgent || data.headers?.['user-agent'] || '',
    description: data.description || null,
    webhookType: data.webhookType || null,
    whatsappInfo: data.whatsappInfo || null,
  };
}

async function ensureConfig(db, sandboxKey) {
  const ref = db.collection(COLLECTION).doc(sandboxKey);
  const snap = await ref.get();
  if (snap.exists) {
    const d = snap.data();
    if (d.receiveToken && d.verifyToken) return d;
  }
  const receiveToken = randomToken(24);
  const verifyToken = randomToken(18);
  const payload = {
    receiveToken,
    verifyToken,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  await ref.set(payload, { merge: true });
  return { ...payload, createdAt: null };
}

async function validateToken(db, sandboxKey, token) {
  const ref = db.collection(COLLECTION).doc(sandboxKey);
  const snap = await ref.get();
  if (!snap.exists) return false;
  const d = snap.data();
  return d && d.receiveToken === token;
}

async function trimEvents(db, sandboxKey) {
  const col = db.collection(COLLECTION).doc(sandboxKey).collection('events');
  for (;;) {
    const check = await col.orderBy('receivedAt', 'desc').limit(MAX_EVENTS + 1).get();
    if (check.docs.length <= MAX_EVENTS) return;
    const excess = check.docs.length - MAX_EVENTS;
    const oldBatch = await col.orderBy('receivedAt', 'asc').limit(excess).get();
    const batch = db.batch();
    oldBatch.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

function publicOrigin(req) {
  const xfHost = req.get('x-forwarded-host');
  const host = (xfHost && String(xfHost).split(',')[0].trim()) || req.get('host') || 'localhost';
  const xfProto = req.get('x-forwarded-proto');
  const proto =
    (xfProto && String(xfProto).split(',')[0].trim()) || (req.secure ? 'https' : 'http');
  return `${proto}://${host}`;
}

async function handleConfig(req, res, db) {
  const sandboxKey = sanitizeSandboxKey(req.query.sandbox);
  const cfg = await ensureConfig(db, sandboxKey);
  const base = publicOrigin(req);
  const webhookUrl = `${base}/api/webhooks/r/${encodeURIComponent(sandboxKey)}/${cfg.receiveToken}`;

  res.status(200).json({
    success: true,
    sandbox: sandboxKey,
    webhookUrl,
    verifyToken: cfg.verifyToken,
    receiveToken: cfg.receiveToken,
  });
}

async function handleFeed(req, res, db) {
  const sandboxKey = sanitizeSandboxKey(req.query.sandbox);
  const token = String(req.query.token || '').trim();
  if (!(await validateToken(db, sandboxKey, token))) {
    res.status(403).json({ success: false, message: 'Invalid sandbox or token', webhooks: [] });
    return;
  }
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
  const includeErrors = String(req.query.includeErrors || 'true').toLowerCase() !== 'false';

  const col = db.collection(COLLECTION).doc(sandboxKey).collection('events');
  let q = col.orderBy('receivedAt', 'desc').limit(limit);
  const snap = await q.get();
  const webhooks = [];
  snap.forEach((doc) => {
    const row = eventToWebhookRow(doc.id, doc.data());
    if (!includeErrors && row.status === 'error') return;
    webhooks.push(row);
  });

  res.status(200).json({ success: true, webhooks });
}

async function handleStats(req, res, db) {
  const sandboxKey = sanitizeSandboxKey(req.query.sandbox);
  const token = String(req.query.token || '').trim();
  if (!(await validateToken(db, sandboxKey, token))) {
    res.status(403).json({
      success: false,
      message: 'Invalid sandbox or token',
      statistics: { total: 0, last24Hours: 0, lastHour: 0, totalErrors: 0 },
      healthStatus: 'unknown',
    });
    return;
  }

  const col = db.collection(COLLECTION).doc(sandboxKey).collection('events');
  const all = await col.get();
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const hourMs = 60 * 60 * 1000;

  let total = 0;
  let last24Hours = 0;
  let lastHour = 0;
  let totalErrors = 0;

  all.forEach((doc) => {
    const d = doc.data();
    const receivedAt = d.receivedAt;
    const ts =
      receivedAt && typeof receivedAt.toMillis === 'function'
        ? receivedAt.toMillis()
        : now;
    total++;
    if (now - ts <= dayMs) last24Hours++;
    if (now - ts <= hourMs) lastHour++;
    if (d.status === 'error') totalErrors++;
  });

  res.status(200).json({
    success: true,
    statistics: {
      total,
      last24Hours,
      lastHour,
      totalErrors,
    },
    healthStatus: 'healthy',
  });
}

async function handleClear(req, res, db) {
  let body = {};
  try {
    body = typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse(req.rawBody || '{}');
  } catch {
    body = {};
  }
  const sandboxKey = sanitizeSandboxKey(body.sandbox);
  const token = String(body.token || '').trim();
  if (!(await validateToken(db, sandboxKey, token))) {
    res.status(403).json({ success: false, message: 'Invalid sandbox or token' });
    return;
  }

  const col = db.collection(COLLECTION).doc(sandboxKey).collection('events');
  let deleted = 0;
  for (;;) {
    const batch = db.batch();
    const q = await col.limit(500).get();
    if (q.empty) break;
    q.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    deleted += q.size;
  }

  res.status(200).json({ success: true, deleted });
}

function safeDecodeURIComponent(s) {
  try {
    return decodeURIComponent(String(s || ''));
  } catch {
    return String(s || '');
  }
}

async function handleReceive(req, res, db, segments) {
  /** /api/webhooks/r/:sandbox/:token/... */
  const sandboxKey = sanitizeSandboxKey(safeDecodeURIComponent(segments[3]));
  const token = safeDecodeURIComponent(segments[4] || '').trim();

  setCors(res);

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  if (!(await validateToken(db, sandboxKey, token))) {
    res.status(403).json({ success: false, message: 'Invalid webhook URL' });
    return;
  }

  const cfgSnap = await db.collection(COLLECTION).doc(sandboxKey).get();
  const verifyToken = cfgSnap.exists ? String(cfgSnap.data().verifyToken || '') : '';

  /** Facebook verification (GET hub.*) */
  if (req.method === 'GET') {
    const q = req.query || {};
    const mode = String(q['hub.mode'] || q.hub_mode || '');
    const verify = String(q['hub.verify_token'] || q.hub_verify_token || '');
    const challenge = String(q['hub.challenge'] || q.hub_challenge || '');
    if (mode === 'subscribe' && verify && challenge) {
      if (verifyToken && verify === verifyToken) {
        res.status(200).type('text/plain').send(challenge);
        return;
      }
      res.status(403).type('text/plain').send('Verification failed');
      return;
    }
  }

  const headers = collectHeaders(req);
  const query = { ...(req.query || {}) };
  const ip = getClientIp(req);
  const userAgent = headers['user-agent'] || '';

  let status = 'received';
  let bodyJson = null;
  let bodyText = '';
  let contentType = String(headers['content-type'] || '').split(';')[0] || 'application/octet-stream';

  try {
    const parsed = parseBodyForStore(req);
    bodyJson = parsed.bodyJson;
    bodyText = parsed.bodyText;
    contentType = parsed.contentType || contentType;
  } catch (e) {
    status = 'error';
    bodyText = String(e.message || e);
  }

  const col = db.collection(COLLECTION).doc(sandboxKey).collection('events');
  const ref = col.doc();
  await ref.set({
    receivedAt: admin.firestore.FieldValue.serverTimestamp(),
    timestampMs: Date.now(),
    method: req.method,
    path: parseRequestPath(req),
    headers,
    query,
    contentType,
    bodyJson: bodyJson !== undefined ? bodyJson : null,
    bodyText,
    status,
    ip,
    userAgent,
  });

  await trimEvents(db, sandboxKey);

  /** Match original listener: JSON success for POST etc. */
  if (req.method === 'GET' && !String(req.query['hub.mode'] || '')) {
    res.status(200).json({ success: true, id: ref.id, message: 'Webhook received (GET)' });
    return;
  }

  res.status(200).json({ success: true, id: ref.id });
}

/**
 * @param {import('firebase-functions').https.Request} req
 * @param {import('express').Response} res
 */
async function sandboxWebhookTool(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  const db = getDb();
  const path = parseRequestPath(req);
  const segments = pathSegments(path);

  /** segments: api, webhooks, ... */
  if (segments[0] !== 'api' || segments[1] !== 'webhooks') {
    res.status(404).json({ success: false, message: 'Not found' });
    return;
  }

  const third = segments[2];

  try {
    if (third === 'config' && req.method === 'GET') {
      await handleConfig(req, res, db);
      return;
    }
    if (third === 'feed' && req.method === 'GET') {
      await handleFeed(req, res, db);
      return;
    }
    if (third === 'stats' && req.method === 'GET') {
      await handleStats(req, res, db);
      return;
    }
    if (third === 'clear' && req.method === 'POST') {
      await handleClear(req, res, db);
      return;
    }
    if (third === 'r' && segments.length >= 5) {
      await handleReceive(req, res, db, segments);
      return;
    }

    res.status(404).json({ success: false, message: 'Unknown webhook route' });
  } catch (e) {
    console.error('[sandboxWebhookTool]', e);
    res.status(500).json({ success: false, message: String(e.message || e) });
  }
}

module.exports = { sandboxWebhookTool, sanitizeSandboxKey, COLLECTION };
