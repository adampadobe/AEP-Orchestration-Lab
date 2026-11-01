/**
 * POST /api/profile/generate — stream a sample profile (same contract as Express server.js).
 * Uses per-industry Firestore connection (URL, flowId, datasetId, schemaId, xdmKey) like profileUpdateProxy.
 */

'use strict';

const profileStreamingCore = require('./profileStreamingCore');
const profileTableHelpers = require('./profileTableHelpers');
const profilePlaceContext = require('./profilePlaceContext');
const { generateEcid, isCanonicalEcid } = require('./ecidGenerator');
const genericProfileConnectionStore = require('./genericProfileConnectionStore');
const travelProfileConnectionStore = require('./travelProfileConnectionStore');
const fsiProfileConnectionStore = require('./fsiProfileConnectionStore');
const telecomProfileConnectionStore = require('./telecomProfileConnectionStore');
const retailProfileConnectionStore = require('./retailProfileConnectionStore');
const mediaProfileConnectionStore = require('./mediaProfileConnectionStore');
const sportsProfileConnectionStore = require('./sportsProfileConnectionStore');
const { requestCorrelationId, logFunctionEvent } = require('./functionRequestLog');
const { createProfileMergeToken, verifyProfileMergeToken } = require('./profileMergeToken');

const INDUSTRY_TO_CONNECTION_STORE = {
  generic: genericProfileConnectionStore,
  travel: travelProfileConnectionStore,
  fsi: fsiProfileConnectionStore,
  telecom: telecomProfileConnectionStore,
  retail: retailProfileConnectionStore,
  media: mediaProfileConnectionStore,
  sports: sportsProfileConnectionStore,
};

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
 * Validate and normalize place context from generate attributes before any AEP call.
 * Only the Generic Profile schema carries the place field group; other industry
 * schemas would silently drop it, so reject it explicitly there.
 */
function resolveGeneratePlaceContext(filteredAttrs, industryKey) {
  const probe = {};
  profileStreamingCore.assignProfileStreamingAttributes(probe, {}, filteredAttrs);
  if (probe.profilePlaceContext === undefined) return { ok: true, value: null };
  if (industryKey !== 'generic') {
    return {
      ok: false,
      error: `profilePlaceContext is only supported on the generic industry profile (got "${industryKey}"). Send place context in a generic generate or update call.`,
      invalidPath: '_demoemea.profilePlaceContext',
    };
  }
  const result = profilePlaceContext.normalizeProfilePlaceContext(probe.profilePlaceContext, {
    defaultSource: 'profile-update',
    replaceGeohash: true,
  });
  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
      invalidPath: `_demoemea.profilePlaceContext.${result.leaf}`,
    };
  }
  return { ok: true, value: result.value };
}

/**
 * @param {object} req - Firebase HTTP request
 * @param {object} res - Firebase HTTP response
 * @param {{ setCors: Function, resolveSandboxForProfileBody: Function, getAdobeAccessToken: Function, getMergeTokenSecret?: Function, clientId: string, orgId: string, geoMirror?: { recordProfilePlace: Function } }} ctx
 *   geoMirror (optional) records the accepted place in the Firestore geo-hotspot mirror.
 */
async function handleProfileGenerate(req, res, ctx) {
  const {
    setCors,
    resolveSandboxForProfileBody,
    getAdobeAccessToken,
    getMergeTokenSecret,
    clientId,
    orgId,
    geoMirror,
  } = ctx;
  const startedAt = Date.now();
  const correlationId = requestCorrelationId(req);
  setCors(res);
  res.set('x-aep-lab-correlation-id', correlationId);
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
  const appendToken = String(body.appendToken || '').trim();
  const issueAppendToken = body.issueAppendToken === true;
  const appendIfExisting =
    body.appendIfExisting === true ||
    body.appendIfExisting === 'true' ||
    String(process.env.AEP_PROFILE_GENERATE_APPEND_IF_EXISTS || '').toLowerCase() === '1' ||
    String(process.env.AEP_PROFILE_GENERATE_APPEND_IF_EXISTS || '').toLowerCase() === 'true';

  logFunctionEvent('INFO', 'profile.generate.started', {
    correlationId,
    sandbox,
    industry: industryRequested || 'generic',
    appendIfExisting,
    attributeCount: Object.keys(attributes).length,
    hasAppendToken: Boolean(appendToken),
    issueAppendToken,
  });

  if (!email) {
    res.status(400).json({ error: 'Email is required.' });
    return;
  }

  let mergeTokenSecret = '';
  let continuationEcid = null;
  if (appendToken) {
    if (!appendIfExisting) {
      res.status(400).json({
        error: 'appendToken requires appendIfExisting:true.',
        code: 'MERGE_TOKEN_REQUIRES_APPEND',
      });
      return;
    }
    try {
      mergeTokenSecret = String(getMergeTokenSecret ? getMergeTokenSecret() : '');
    } catch (e) {
      logFunctionEvent('ERROR', 'profile.generate.merge_token_secret_failed', {
        correlationId,
        errorCode: String(e && e.code || 'MERGE_TOKEN_SECRET_UNAVAILABLE'),
      });
      res.status(500).json({ error: 'Profile continuation validation is unavailable.', code: 'MERGE_TOKEN_SECRET_UNAVAILABLE' });
      return;
    }
    const verified = verifyProfileMergeToken({
      token: appendToken,
      email,
      sandbox,
      secret: mergeTokenSecret,
    });
    if (!verified.ok) {
      logFunctionEvent('WARNING', 'profile.generate.merge_token_rejected', {
        correlationId,
        errorCode: verified.code,
      });
      res.status(409).json({ error: verified.error, code: verified.code });
      return;
    }
    continuationEcid = verified.ecid;
  }

  if (issueAppendToken) {
    try {
      mergeTokenSecret = String(getMergeTokenSecret ? getMergeTokenSecret() : '');
    } catch (e) {
      logFunctionEvent('ERROR', 'profile.generate.merge_token_secret_failed', {
        correlationId,
        errorCode: String(e && e.code || 'MERGE_TOKEN_SECRET_UNAVAILABLE'),
      });
      res.status(500).json({ error: 'Profile continuation setup is unavailable.', code: 'MERGE_TOKEN_SECRET_UNAVAILABLE' });
      return;
    }
    if (!mergeTokenSecret) {
      logFunctionEvent('ERROR', 'profile.generate.merge_token_secret_failed', {
        correlationId,
        errorCode: 'MERGE_TOKEN_SECRET_UNAVAILABLE',
      });
      res.status(500).json({ error: 'Profile continuation setup is unavailable.', code: 'MERGE_TOKEN_SECRET_UNAVAILABLE' });
      return;
    }
  }

  const industryKeys = Object.keys(INDUSTRY_TO_CONNECTION_STORE);
  const industryKey = industryKeys.includes(industryRequested) ? industryRequested : 'generic';
  if (industryRequested && !industryKeys.includes(industryRequested)) {
    res.status(400).json({
      error: `Unknown industry "${industryRequested}". Supported: ${industryKeys.join(', ')}.`,
    });
    return;
  }

  const filteredAttrs = stripEmpty(attributes);
  const placeResult = resolveGeneratePlaceContext(filteredAttrs, industryKey);
  if (!placeResult.ok) {
    res.status(400).json({ error: placeResult.error, invalidPath: placeResult.invalidPath });
    return;
  }

  let accessToken;
  try {
    accessToken = await getAdobeAccessToken();
  } catch (e) {
    logFunctionEvent('ERROR', 'profile.generate.auth_failed', {
      correlationId,
      errorCode: String(e && e.code || e && e.name || 'ADOBE_AUTH_FAILED'),
      durationMs: Date.now() - startedAt,
    });
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
    logFunctionEvent('WARNING', 'profile.generate.connection_lookup_failed', {
      correlationId,
      sandbox,
      industry: industryKey,
      errorCode: String(lookupErr && lookupErr.code || lookupErr && lookupErr.name || 'CONNECTION_LOOKUP_FAILED'),
    });
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
    logFunctionEvent('WARNING', 'profile.generate.not_configured', {
      correlationId,
      sandbox,
      industry: industryKey,
      durationMs: Date.now() - startedAt,
    });
    res.status(400).json({
      error:
        'Profile streaming is not configured for this sandbox. Save the HTTP API connection (collection URL + flow ID, and dataset/schema IDs for envelope mode) on the industry profile setup panel.',
    });
    return;
  }

  let mergeDiagnostics = null;
  let ecid = generateEcid();
  let ecidSource = 'generated';
  if (continuationEcid) {
    ecid = continuationEcid;
    ecidSource = 'continuation_token';
  } else if (appendIfExisting) {
    try {
      const { ecid: existingEcid, diagnostics } = await profileTableHelpers.resolveExistingEcidForProfileMerge(
        email,
        sandbox,
        accessToken,
        clientId,
        orgId,
      );
      mergeDiagnostics = diagnostics;
      if (isCanonicalEcid(existingEcid)) {
        ecid = String(existingEcid).trim();
        ecidSource = 'existing';
      } else if (existingEcid) {
        logFunctionEvent('WARNING', 'profile.generate.existing_ecid_rejected', {
          correlationId,
          sandbox,
          industry: industryKey,
          errorCode: 'EXISTING_ECID_NON_CANONICAL',
        });
      }
    } catch (lookupErr) {
      mergeDiagnostics = {
        error: String(lookupErr && lookupErr.code || lookupErr && lookupErr.name || 'ECID_LOOKUP_FAILED'),
        namespacesAttempted: [],
      };
      logFunctionEvent('WARNING', 'profile.generate.existing_ecid_lookup_failed', {
        correlationId,
        sandbox,
        industry: industryKey,
        errorCode: String(lookupErr && lookupErr.code || lookupErr && lookupErr.name || 'ECID_LOOKUP_FAILED'),
      });
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

  const rootExtras = {};
  profileStreamingCore.assignProfileStreamingAttributes(demoemea, rootExtras, filteredAttrs);
  if (placeResult.value) {
    demoemea.profilePlaceContext = placeResult.value;
  }
  profileStreamingCore.mirrorPreferredLanguageDemoSchema(demoemea, rootExtras);

  // Default test profile: set bare `testProfile` only; `mirrorRootTestProfileFields` in
  // `buildProfileStreamPayload` / `buildProfileXdmEntityForStream` adds `xdm:testProfile` for OOTB
  // XDM / AJO-style consumers. (Your generic dataflow keyed off `testProfile`.) Opt out with
  // body.testProfile === false, body.omitTestProfile === true, or explicit false on either attribute key.
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
    logFunctionEvent('ERROR', 'profile.generate.stream_request_failed', {
      correlationId,
      sandbox,
      industry: industryKey,
      errorCode: String(e && e.code || e && e.name || 'STREAM_REQUEST_FAILED'),
      durationMs: Date.now() - startedAt,
    });
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
    logFunctionEvent('ERROR', 'profile.generate.stream_rejected', {
      correlationId,
      sandbox,
      industry: industryKey,
      streamingStatus: streamRes.status,
      streamErrorCount: streamErrors.length,
      durationMs: Date.now() - startedAt,
    });
    res.status(502).json({
      error: detail,
      correlationId,
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

  const geoMirrorResult = geoMirror
    ? await geoMirror.recordProfilePlace({ sandbox, email, ecid, place: demoemea.profilePlaceContext })
    : undefined;
  if (geoMirrorResult && geoMirrorResult.error) {
    logFunctionEvent('WARNING', 'profile.generate.geo_mirror_failed', {
      correlationId,
      sandbox,
      errorCode: String(geoMirrorResult.code || 'GEO_MIRROR_WRITE_FAILED'),
    });
  }

  let mergeAppendToken;
  if (issueAppendToken) {
    mergeAppendToken = createProfileMergeToken({
      email,
      sandbox,
      ecid,
      secret: mergeTokenSecret,
    });
  }
  logFunctionEvent('INFO', 'profile.generate.completed', {
    correlationId,
    sandbox,
    industry: industryKey,
    streamingStatus: streamRes.status,
    ecidSource,
    durationMs: Date.now() - startedAt,
  });

  res.status(200).json({
    ok: true,
    message: `Request sent: ${email}`,
    correlationId,
    email,
    ecid,
    ...(mergeAppendToken ? { appendToken: mergeAppendToken } : {}),
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
    geoMirror: geoMirrorResult,
  });
}

module.exports = {
  handleProfileGenerate,
  generateEcid,
};
