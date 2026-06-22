'use strict';

/**
 * AJO Loyalty reward provider — sandbox-aware fulfillment gateway for the lab.
 * Deploy to Cloud Run with LOYALTY_PROVIDER_API_KEY (or legacy FAKE_LOYALTY_API_KEY).
 *
 * Path-based sandboxes:
 *   POST /{sandbox}/v1/fulfill
 *   GET  /{sandbox}/v1/ledger
 * Legacy (defaults to DEFAULT_SANDBOX):
 *   POST /v1/fulfill
 *   GET  /v1/ledger
 */

const crypto = require('node:crypto');
const express = require('express');

const PORT = Number(process.env.PORT) || 8080;
const API_KEY = String(
  process.env.LOYALTY_PROVIDER_API_KEY || process.env.FAKE_LOYALTY_API_KEY || '',
).trim();
const DEFAULT_SANDBOX = String(process.env.LOYALTY_DEFAULT_SANDBOX || 'apalmer').trim();
const MAX_LEDGER_ENTRIES = 500;
const SANDBOX_KEY_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

/** @type {Map<string, { fulfillmentLedger: Array<object>, idempotencyIndex: Map<string, { transactionId: string }> }>} */
const sandboxStores = new Map();

/**
 * @param {string} sandbox
 */
function normalizeSandbox(sandbox) {
  const key = String(sandbox || DEFAULT_SANDBOX).trim().toLowerCase();
  if (!SANDBOX_KEY_RE.test(key)) {
    return null;
  }
  return key;
}

/**
 * @param {string} sandbox
 */
function getSandboxStore(sandbox) {
  const key = normalizeSandbox(sandbox);
  if (!key) return null;
  if (!sandboxStores.has(key)) {
    sandboxStores.set(key, {
      fulfillmentLedger: [],
      idempotencyIndex: new Map(),
    });
  }
  return { key, store: sandboxStores.get(key) };
}

/**
 * @param {unknown} payload
 * @returns {string | null}
 */
function extractMemberId(payload) {
  if (payload == null) return null;
  if (typeof payload === 'object' && !Array.isArray(payload)) {
    const id = /** @type {{ memberId?: unknown }} */ (payload).memberId;
    return id != null && String(id).trim() ? String(id).trim() : null;
  }
  if (typeof payload === 'string') {
    try {
      return extractMemberId(JSON.parse(payload));
    } catch {
      return null;
    }
  }
  return null;
}

function requireApiKey(req, res, next) {
  if (!API_KEY) {
    console.warn('[loyalty-provider] LOYALTY_PROVIDER_API_KEY is not set');
    res.status(503).json({ error: 'Provider API key not configured' });
    return;
  }
  const provided = String(req.get('X-API-Key') || req.get('x-api-key') || '').trim();
  if (provided !== API_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {string} sandbox
 */
function handleFulfill(req, res, sandbox) {
  const resolved = getSandboxStore(sandbox);
  if (!resolved) {
    res.status(400).json({ error: 'Invalid sandbox key' });
    return;
  }
  const { key, store } = resolved;
  const idempotencyKey = String(
    req.get('Idempotency-Key') || req.get('x-idempotency-key') || '',
  ).trim() || null;
  const rawPayload = req.rawBody || JSON.stringify(req.body ?? {});

  console.log(`[loyalty-provider] POST /${key}/v1/fulfill`, {
    idempotencyKey,
    contentType: req.get('content-type') || '',
    bodyPreview: rawPayload.slice(0, 8000),
  });

  if (idempotencyKey && store.idempotencyIndex.has(idempotencyKey)) {
    const existing = store.idempotencyIndex.get(idempotencyKey);
    res.status(200).json({
      status: 'accepted',
      transactionId: existing.transactionId,
      sandbox: key,
      idempotent: true,
    });
    return;
  }

  const transactionId = crypto.randomUUID();
  const entry = {
    transactionId,
    sandbox: key,
    receivedAt: new Date().toISOString(),
    idempotencyKey,
    payload: req.body ?? rawPayload,
  };
  store.fulfillmentLedger.push(entry);
  while (store.fulfillmentLedger.length > MAX_LEDGER_ENTRIES) {
    store.fulfillmentLedger.shift();
  }
  if (idempotencyKey) {
    store.idempotencyIndex.set(idempotencyKey, { transactionId });
  }

  res.status(200).json({ status: 'accepted', transactionId, sandbox: key });
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {string} sandbox
 */
function handleLedger(req, res, sandbox) {
  const resolved = getSandboxStore(sandbox);
  if (!resolved) {
    res.status(400).json({ error: 'Invalid sandbox key' });
    return;
  }
  const { key, store } = resolved;
  const limitRaw = Number(req.query.limit);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(500, Math.max(1, Math.floor(limitRaw)))
    : 50;
  const entries = store.fulfillmentLedger
    .slice(-limit)
    .reverse()
    .map((entry) => ({
      transactionId: entry.transactionId,
      sandbox: entry.sandbox,
      receivedAt: entry.receivedAt,
      idempotencyKey: entry.idempotencyKey,
      memberId: extractMemberId(entry.payload),
      payload: entry.payload,
    }));
  res.status(200).json({
    ok: true,
    sandbox: key,
    count: entries.length,
    totalStored: store.fulfillmentLedger.length,
    entries,
  });
}

const app = express();

app.use(express.json({
  limit: '1mb',
  verify: (req, _res, buf) => {
    req.rawBody = buf.length ? buf.toString('utf8') : '';
  },
}));

app.use(express.urlencoded({ extended: false }));

app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'loyalty-reward-provider',
    defaultSandbox: DEFAULT_SANDBOX,
    sandboxesActive: sandboxStores.size,
  });
});

app.get('/:sandbox/health', (req, res) => {
  const resolved = getSandboxStore(req.params.sandbox);
  if (!resolved) {
    res.status(400).json({ error: 'Invalid sandbox key' });
    return;
  }
  res.status(200).json({
    status: 'ok',
    sandbox: resolved.key,
    ledgerEntries: resolved.store.fulfillmentLedger.length,
  });
});

app.post('/oauth/token', (req, res) => {
  const grantType = req.body?.grant_type;
  if (grantType && grantType !== 'client_credentials') {
    res.status(400).json({ error: 'unsupported_grant_type' });
    return;
  }
  const accessToken = crypto.randomUUID().replace(/-/g, '');
  console.log('[loyalty-provider] POST /oauth/token issued access token');
  res.status(200).json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: 3600,
  });
});

app.post('/:sandbox/v1/fulfill', requireApiKey, (req, res) => {
  handleFulfill(req, res, req.params.sandbox);
});

app.get('/:sandbox/v1/ledger', requireApiKey, (req, res) => {
  handleLedger(req, res, req.params.sandbox);
});

app.post('/v1/fulfill', requireApiKey, (req, res) => {
  handleFulfill(req, res, DEFAULT_SANDBOX);
});

app.get('/v1/ledger', requireApiKey, (req, res) => {
  handleLedger(req, res, DEFAULT_SANDBOX);
});

app.listen(PORT, () => {
  console.log(`loyalty-reward-provider listening on :${PORT} (default sandbox: ${DEFAULT_SANDBOX})`);
});
