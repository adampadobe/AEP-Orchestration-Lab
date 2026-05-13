/**
 * POST /api/ipad/event — Etihad iPad lab staff actions → Event Generator HTTP API streaming
 * (same envelope as POST /api/events/generator DCS path, minimal XDM).
 */
'use strict';

const eventGeneratorService = require('./eventGeneratorService');

const MAX_EVENT_TYPE_LEN = 120;
/** Lab-only event types from the Etihad iPad spec (extend as UI grows). */
const EVENT_TYPE_RE = /^flight\.staff\.[a-z0-9_.]+$/i;
const MAX_PAYLOAD_JSON = 16384;

/**
 * @param {unknown} raw
 * @returns {Record<string, unknown>}
 */
function sanitizePayload(raw) {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return {};
  try {
    const s = JSON.stringify(raw);
    if (s.length > MAX_PAYLOAD_JSON) return {};
    return JSON.parse(s);
  } catch {
    return {};
  }
}

function isValidSandbox(s) {
  const t = String(s || '').trim();
  return t.length > 0 && t.length <= 64 && /^[a-zA-Z0-9_-]+$/.test(t);
}

function isValidEmail(s) {
  const t = String(s || '').trim().toLowerCase();
  if (t.length < 3 || t.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {{
 *   setCors: (res: import('express').Response, methods?: string) => void;
 *   resolveSandboxFromQuery: (req: import('express').Request) => string;
 *   getAdobeAccessToken: () => Promise<string>;
 *   ADOBE_IMS_ORG: { value: () => string };
 * }} deps
 */
async function handleIpadEventPost(req, res, deps) {
  const { setCors, resolveSandboxFromQuery, getAdobeAccessToken, ADOBE_IMS_ORG } = deps;
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }

  /** @type {Record<string, unknown>} */
  let body;
  try {
    body = typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse(req.rawBody || '{}');
  } catch {
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }

  const fromBody = String(body.sandbox || '').trim();
  const sandbox = fromBody || resolveSandboxFromQuery(req);
  if (!isValidSandbox(sandbox)) {
    res.status(400).json({ error: 'Invalid or missing sandbox' });
    return;
  }

  const eventType = String(body.eventType || '').trim();
  if (!eventType || eventType.length > MAX_EVENT_TYPE_LEN || !EVENT_TYPE_RE.test(eventType)) {
    res.status(400).json({ error: 'Invalid or missing eventType (expected flight.staff.*)' });
    return;
  }

  const email = String(body.email || '').trim().toLowerCase();
  if (!isValidEmail(email)) {
    res.status(400).json({ error: 'Invalid or missing email' });
    return;
  }

  const payload = sanitizePayload(body.payload);

  let accessToken;
  try {
    accessToken = await getAdobeAccessToken();
  } catch (e) {
    res.status(500).json({ error: 'Auth failed', detail: String(e && e.message ? e.message : e) });
    return;
  }

  const orgId = ADOBE_IMS_ORG.value();

  /** @type {Record<string, unknown>} */
  const genBody = {
    email,
    eventType,
    public: {
      dashboard: {
        etihadIpad: {
          ...payload,
        },
      },
    },
  };

  try {
    const xdm = eventGeneratorService.buildEventGeneratorXdm(genBody, { style: 'minimal' });
    const idStr = xdm._id != null ? String(xdm._id) : `ipad-${Date.now()}`;
    const ts = xdm.timestamp || new Date().toISOString();
    const xdmEntity = {
      ...xdm,
      _id: idStr,
      '@id': idStr,
      'xdm:timestamp': ts,
      timestamp: ts,
    };
    const streamEnvelope = {
      header: {
        schemaRef: {
          id: eventGeneratorService.EVENT_GENERATOR_SCHEMA_ID,
          contentType: eventGeneratorService.EVENT_SCHEMA_CONTENT_TYPE,
        },
        imsOrgId: orgId,
        datasetId: eventGeneratorService.EVENT_GENERATOR_DATASET_ID,
        source: { name: 'AEP Orchestration Lab iPad gate agent' },
      },
      body: {
        xdmMeta: {
          schemaRef: {
            id: eventGeneratorService.EVENT_GENERATOR_SCHEMA_ID,
            contentType: eventGeneratorService.EVENT_SCHEMA_CONTENT_TYPE,
          },
        },
        xdmEntity,
      },
    };

    const streamUrl = eventGeneratorService.EVENT_GENERATOR_STREAMING_URL;
    const streamRes = await fetch(streamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'sandbox-name': sandbox,
        Authorization: `Bearer ${accessToken}`,
        'x-adobe-flow-id': eventGeneratorService.EVENT_GENERATOR_FLOW_ID,
      },
      body: JSON.stringify(streamEnvelope),
    });
    const rtext = await streamRes.text();
    let sdata = {};
    try {
      sdata = rtext ? JSON.parse(rtext) : {};
    } catch {
      sdata = {};
    }
    if (!streamRes.ok) {
      res.status(502).json({
        error:
          sdata.message ||
          sdata.title ||
          sdata.detail ||
          sdata.report?.message ||
          `Streaming ${streamRes.status}`,
        streamingResponse: sdata,
        streamingUrl: streamUrl,
      });
      return;
    }
    res.status(200).json({
      ok: true,
      message: 'Event sent to AEP (streaming).',
      eventId: xdmEntity['@id'],
      transport: 'dcs',
    });
  } catch (err) {
    res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
}

module.exports = { handleIpadEventPost };
