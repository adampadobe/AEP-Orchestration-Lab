/**
 * POST /api/profile/generate — stream a sample profile (same contract as Express server.js).
 * Uses per-industry Firestore connection (URL, flowId, datasetId, schemaId, xdmKey) like profileUpdateProxy.
 */

'use strict';

const profileStreamingCore = require('./profileStreamingCore');
const profileTableHelpers = require('./profileTableHelpers');
const genericProfileConnectionStore = require('./genericProfileConnectionStore');
const travelProfileConnectionStore = require('./travelProfileConnectionStore');
const fsiProfileConnectionStore = require('./fsiProfileConnectionStore');
const telecomProfileConnectionStore = require('./telecomProfileConnectionStore');
const retailProfileConnectionStore = require('./retailProfileConnectionStore');
const mediaProfileConnectionStore = require('./mediaProfileConnectionStore');
const sportsProfileConnectionStore = require('./sportsProfileConnectionStore');

const INDUSTRY_TO_CONNECTION_STORE = {
  generic: genericProfileConnectionStore,
  travel: travelProfileConnectionStore,
  fsi: fsiProfileConnectionStore,
  telecom: telecomProfileConnectionStore,
  retail: retailProfileConnectionStore,
  media: mediaProfileConnectionStore,
  sports: sportsProfileConnectionStore,
};

function generateEcid() {
  let s = '4';
  for (let i = 0; i < 37; i += 1) s += Math.floor(Math.random() * 10);
  return s;
}

function isEmpty(v) {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0 || v.every(isEmpty);
  if (typeof v === 'object') return Object.keys(v).length === 0 || Object.values(v).every(isEmpty);
  return false;
}

function stripEmpty(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(stripEmpty).filter((v) => !isEmpty(v));
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (isEmpty(v)) continue;
    const cleaned = stripEmpty(v);
    if (!isEmpty(cleaned)) out[k] = cleaned;
  }
  return out;
}

/**
 * @param {object} req - Firebase HTTP request
 * @param {object} res - Firebase HTTP response
 * @param {{ setCors: Function, resolveSandboxForProfileBody: Function, getAdobeAccessToken: Function, clientId: string, orgId: string }} ctx
 */
async function handleProfileGenerate(req, res, ctx) {
  const { setCors, resolveSandboxForProfileBody, getAdobeAccessToken, clientId, orgId } = ctx;
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const email = String(body.email || '').trim();
  const industryRequested = String(body.industry || '').trim().toLowerCase();
  const sandbox = resolveSandboxForProfileBody(req);
  const attributes = body.attributes && typeof body.attributes === 'object' ? body.attributes : {};
  const appendIfExisting =
    body.appendIfExisting === true ||
    body.appendIfExisting === 'true' ||
    String(process.env.AEP_PROFILE_GENERATE_APPEND_IF_EXISTS || '').toLowerCase() === '1' ||
    String(process.env.AEP_PROFILE_GENERATE_APPEND_IF_EXISTS || '').toLowerCase() === 'true';

  if (!email) {
    res.status(400).json({ error: 'Email is required.' });
    return;
  }

  const industryKeys = Object.keys(INDUSTRY_TO_CONNECTION_STORE);
  const industryKey = industryKeys.includes(industryRequested) ? industryRequested : 'generic';
  if (industryRequested && !industryKeys.includes(industryRequested)) {
    res.status(400).json({
      error: `Unknown industry "${industryRequested}". Supported: ${industryKeys.join(', ')}.`,
    });
    return;
  }

  let accessToken;
  try {
    accessToken = await getAdobeAccessToken();
  } catch (e) {
    res.status(500).json({ error: 'Auth failed', detail: String(e.message || e) });
    return;
  }

  let industryConnection = null;
  try {
    const getter = profileTableHelpers.resolveConnectionGetter(
      INDUSTRY_TO_CONNECTION_STORE[industryKey],
      industryKey,
    );
    if (getter) {
      industryConnection = await getter(sandbox);
    }
  } catch (lookupErr) {
    console.warn(
      '[profileGenerate.connection-lookup]',
      String(lookupErr && lookupErr.message ? lookupErr.message : lookupErr).slice(0, 240),
    );
  }

  const persistedStreaming =
    industryConnection && industryConnection.streaming && typeof industryConnection.streaming === 'object'
      ? industryConnection.streaming
      : {};

  const streamUrl = String(persistedStreaming.url || '').trim();
  const flowId = String(persistedStreaming.flowId || '').trim();
  const datasetId = String(persistedStreaming.datasetId || '').trim();
  const schemaId = String(persistedStreaming.schemaId || '').trim();
  const xdmKey = String(persistedStreaming.xdmKey || '_demoemea').trim();

  if (!streamUrl || !flowId) {
    res.status(400).json({
      error:
        'Profile streaming is not configured for this sandbox. Save the HTTP API connection (collection URL + flow ID, and dataset/schema IDs for envelope mode) on the industry profile setup panel.',
    });
    return;
  }

  let mergeDiagnostics = null;
  let ecid = generateEcid();
  let ecidSource = 'generated';
  if (appendIfExisting) {
    try {
      const { ecid: existingEcid, diagnostics } = await profileTableHelpers.resolveExistingEcidForProfileMerge(
        email,
        sandbox,
        accessToken,
        clientId,
        orgId,
      );
      mergeDiagnostics = diagnostics;
      if (existingEcid && String(existingEcid).length >= 10) {
        ecid = String(existingEcid).trim();
        ecidSource = 'existing';
      }
    } catch (lookupErr) {
      mergeDiagnostics = { error: String(lookupErr.message || lookupErr), namespacesAttempted: [] };
      console.warn('[profileGenerate.appendIfExisting]', String(lookupErr.message || lookupErr));
    }
  }

  const demoemea = {
    identification: {
      core: {
        ecid,
        email,
      },
    },
  };

  const filteredAttrs = stripEmpty(attributes);
  const rootExtras = {};
  profileStreamingCore.assignProfileStreamingAttributes(demoemea, rootExtras, filteredAttrs);
  profileStreamingCore.mirrorPreferredLanguageDemoSchema(demoemea, rootExtras);

  // All industry generates: dual-write test flags on the streaming `xdmEntity` root so both
  // OOTB XDM (`xdm:testProfile`) and generic dataflow / Postman bodies (`testProfile`, see AEP
  // Lab generic DCS samples) are satisfied. Opt out with body.testProfile === false,
  // body.omitTestProfile === true, or explicit false on either attribute key.
  const testProfileOptOut =
    body.testProfile === false ||
    body.testProfile === 'false' ||
    body.omitTestProfile === true ||
    body.omitTestProfile === 'true';
  const attrsSayNoTestProfile =
    filteredAttrs['xdm:testProfile'] === false ||
    filteredAttrs['xdm:testProfile'] === 'false' ||
    filteredAttrs.testProfile === false ||
    filteredAttrs.testProfile === 'false';
  if (!testProfileOptOut && !attrsSayNoTestProfile) {
    rootExtras['xdm:testProfile'] = true;
    rootExtras.testProfile = true;
  }

  const isAdobeDcsCollection = streamUrl ? /dcs\.adobedc\.net/i.test(streamUrl) : false;
  const hasDatasetAndSchema = Boolean(datasetId && schemaId);
  let useEnvelope =
    hasDatasetAndSchema || profileStreamingCore.profileStreamingUseEnvelope(process.env.AEP_PROFILE_STREAMING_ENVELOPE);
  if (isAdobeDcsCollection) {
    useEnvelope = true;
  }
  if (useEnvelope && (!datasetId || !schemaId)) {
    res.status(400).json({
      error:
        'Adobe DCS envelope requires streaming.datasetId and streaming.schemaId on your saved profile connection. Open the Generic (or industry) setup panel and save the connection from AEP.',
    });
    return;
  }

  const apiKey = String(persistedStreaming.apiKey || '').trim() || clientId;

  const built = profileStreamingCore.buildProfileStreamPayload(
    demoemea,
    email,
    ecid,
    xdmKey,
    orgId,
    'Profile Viewer generate',
    rootExtras,
    { useEnvelope, datasetId, schemaId },
  );

  const headers = profileStreamingCore.buildProfileDcsStreamingHeaders(accessToken, sandbox, flowId, apiKey);

  let streamRes;
  let rawText;
  try {
    streamRes = await fetch(streamUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(built.payload),
    });
    rawText = await streamRes.text();
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
    return;
  }

  const { parsed: data, streamErrors, streamWarnings } = profileStreamingCore.parseStreamingCollectionResponse(
    streamRes.status,
    rawText,
  );

  const redacted = profileStreamingCore.redactedProfileDcsRequestHeaders(headers);

  if (!streamRes.ok || streamErrors.length > 0) {
    const detail = streamErrors.length
      ? streamErrors.join(' ')
      : data.detail || data.message || data.title || `Streaming ${streamRes.status}`;
    res.status(502).json({
      error: detail,
      streamingStatus: streamRes.status,
      streamingResponse: data,
      sentToAep: built.payload,
      payloadFormat: built.format,
      streamErrors,
      streamWarnings,
      requestUrl: streamUrl,
      requestHeaders: redacted,
      email,
      ecid,
      ecidSource,
      appendIfExisting,
      mergeDiagnostics,
      industry: industryKey,
    });
    return;
  }

  res.status(200).json({
    ok: true,
    message: `Request sent: ${email}`,
    email,
    ecid,
    ecidSource,
    appendIfExisting,
    mergeDiagnostics,
    sentToAep: built.payload,
    payloadFormat: built.format,
    url: streamUrl,
    requestUrl: streamUrl,
    requestHeaders: redacted,
    streamingStatus: streamRes.status,
    streamingResponse: data,
    streamingWarning: streamWarnings.length ? streamWarnings.join(' ') : undefined,
    industry: industryKey,
  });
}

module.exports = {
  handleProfileGenerate,
};
