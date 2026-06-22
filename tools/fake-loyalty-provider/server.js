'use strict';

/**
 * Fake AJO Loyalty reward provider — accepts fulfillment calls from Adobe Loyalty
 * Challenges (private beta). Deploy to Cloud Run with FAKE_LOYALTY_API_KEY set.
 */

const crypto = require('node:crypto');
const express = require('express');

const PORT = Number(process.env.PORT) || 8080;
const API_KEY = String(process.env.FAKE_LOYALTY_API_KEY || '').trim();

/** @type {Map<string, { transactionId: string }>} */
const idempotencyIndex = new Map();

/** @type {Array<{ transactionId: string, receivedAt: string, idempotencyKey: string | null, payload: unknown }>} */
const fulfillmentLedger = [];

function requireApiKey(req, res, next) {
  if (!API_KEY) {
    console.warn('[fake-loyalty] FAKE_LOYALTY_API_KEY is not set');
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

const app = express();

app.use(express.json({
  limit: '1mb',
  verify: (req, _res, buf) => {
    req.rawBody = buf.length ? buf.toString('utf8') : '';
  },
}));

app.use(express.urlencoded({ extended: false }));

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.post('/oauth/token', (req, res) => {
  const grantType = req.body?.grant_type;
  if (grantType && grantType !== 'client_credentials') {
    res.status(400).json({ error: 'unsupported_grant_type' });
    return;
  }
  const accessToken = crypto.randomUUID().replace(/-/g, '');
  console.log('[fake-loyalty] POST /oauth/token issued access token');
  res.status(200).json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: 3600,
  });
});

app.post('/v1/fulfill', requireApiKey, (req, res) => {
  const idempotencyKey = String(
    req.get('Idempotency-Key') || req.get('x-idempotency-key') || '',
  ).trim() || null;
  const rawPayload = req.rawBody || JSON.stringify(req.body ?? {});

  console.log('[fake-loyalty] POST /v1/fulfill', {
    idempotencyKey,
    contentType: req.get('content-type') || '',
    bodyPreview: rawPayload.slice(0, 8000),
  });

  if (idempotencyKey && idempotencyIndex.has(idempotencyKey)) {
    const existing = idempotencyIndex.get(idempotencyKey);
    res.status(200).json({
      status: 'accepted',
      transactionId: existing.transactionId,
      idempotent: true,
    });
    return;
  }

  const transactionId = crypto.randomUUID();
  const entry = {
    transactionId,
    receivedAt: new Date().toISOString(),
    idempotencyKey,
    payload: req.body ?? rawPayload,
  };
  fulfillmentLedger.push(entry);
  if (idempotencyKey) {
    idempotencyIndex.set(idempotencyKey, { transactionId });
  }

  res.status(200).json({ status: 'accepted', transactionId });
});

app.listen(PORT, () => {
  console.log(`fake-loyalty-provider listening on :${PORT}`);
});
