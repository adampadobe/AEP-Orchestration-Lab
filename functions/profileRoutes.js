/**
 * Profile-related Cloud Function handlers extracted from index.js (Phase B).
 * Industry infra/status/connection routes use createProfileIndustryRoutes;
 * profile read/write proxies and consent legacy-update forwarding live here.
 */

const { createProfileIndustryRoutes } = require('./createProfileIndustryRoutes');

/**
 * @param {object} deps Shared context from index.js
 * @returns {Record<string, import('firebase-functions/v2/https').HttpsFunction>}
 */
function registerProfileRoutes(deps) {
  const {
    onRequest,
    REGION,
    PROFILE_FN_SECRETS,
    RESOLVED_ADOBE_SANDBOX,
    profileFnOpts,
    setCors,
    resolveSandboxFromQuery,
    getAdobeAccessToken,
    ADOBE_CLIENT_ID,
    ADOBE_IMS_ORG,
    profileTableHelpers,
    ipadEventProxy,
    industryAttributeMap,
    profileInfraStatusAllSvc,
    genericProfileInfraService,
    travelProfileInfraService,
    fsiProfileInfraService,
    telecomProfileInfraService,
    retailProfileInfraService,
    mediaProfileInfraService,
    sportsProfileInfraService,
    genericProfileConnectionStore,
    travelProfileConnectionStore,
    fsiProfileConnectionStore,
    telecomProfileConnectionStore,
    retailProfileConnectionStore,
    mediaProfileConnectionStore,
    sportsProfileConnectionStore,
    consentFlowLookup,
    serializeFirestoreRecord,
    CONSENT_STORE_FN_OPTS,
    resolveSandboxForProfileBody,
    profileStreamingCore,
    profileGenerateService,
    consentManagerLegacy,
    consentInfraService,
    profileAudiences,
    profileConsentPayload,
    profileEventsService,
  } = deps;

  const routes = {};

  routes.profileTableProxy = onRequest(
    {
      region: REGION,
      secrets: PROFILE_FN_SECRETS,
      environmentVariables: {
        ADOBE_SANDBOX_NAME: RESOLVED_ADOBE_SANDBOX,
      },
      invoker: 'public',
      timeoutSeconds: 90,
      memory: '512MiB',
    },
    async (req, res) => {
      setCors(res);
      if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
      }
      if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }
      const identifier = String(req.query.identifier || req.query.email || '').trim();
      const namespace = String(req.query.namespace || 'email').trim().toLowerCase();
      const sandbox = resolveSandboxFromQuery(req);
      if (!identifier) {
        res.status(400).json({ error: 'Missing identifier. Use ?identifier=…&namespace=email|ecid|crmId|loyaltyId|phone' });
        return;
      }
      let accessToken;
      try {
        accessToken = await getAdobeAccessToken();
      } catch (e) {
        res.status(500).json({ error: 'Auth failed', detail: String(e.message || e) });
        return;
      }
      const clientId = ADOBE_CLIENT_ID.value();
      const orgId = ADOBE_IMS_ORG.value();
      try {
        const ups = await profileTableHelpers.fetchUpsProfileEntities(identifier, sandbox, accessToken, clientId, orgId, namespace);
        const payload = profileTableHelpers.buildProfileTablePayload(identifier, ups);
        try {
          const statusAllPayload = await profileInfraStatusAllSvc.runProfileInfraStatusAll({
            sandbox,
            token: accessToken,
            clientId,
            orgId,
            services: {
              generic: genericProfileInfraService,
              travel: travelProfileInfraService,
              fsi: fsiProfileInfraService,
              telecom: telecomProfileInfraService,
              retail: retailProfileInfraService,
              media: mediaProfileInfraService,
              sports: sportsProfileInfraService,
            },
          });
          const writability = await profileTableHelpers.buildIndustryWritabilityMap({
            statusAllPayload,
            sandbox,
            connectionStores: {
              generic: genericProfileConnectionStore,
              travel: travelProfileConnectionStore,
              fsi: fsiProfileConnectionStore,
              telecom: telecomProfileConnectionStore,
              retail: retailProfileConnectionStore,
              media: mediaProfileConnectionStore,
              sports: sportsProfileConnectionStore,
            },
          });
          profileTableHelpers.enrichProfileTablePayloadWithWritability(payload, writability);
        } catch (enrichErr) {
          console.warn(
            '[profileTableProxy.enrich]',
            JSON.stringify({ sandbox, error: String(enrichErr && enrichErr.message ? enrichErr.message : enrichErr).slice(0, 240) })
          );
        }
        res.status(200).json(payload);
      } catch (e) {
        res.status(500).json({ error: String(e.message || e) });
      }
    }
  );

  routes.ipadEventProxy = onRequest(
    {
      region: REGION,
      secrets: PROFILE_FN_SECRETS,
      environmentVariables: {
        ADOBE_SANDBOX_NAME: RESOLVED_ADOBE_SANDBOX,
      },
      invoker: 'public',
      timeoutSeconds: 60,
      memory: '256MiB',
    },
    async (req, res) =>
      ipadEventProxy.handleIpadEventPost(req, res, {
        setCors,
        resolveSandboxFromQuery,
        getAdobeAccessToken,
        ADOBE_IMS_ORG,
      })
  );

  routes.profileAttributeOwnership = onRequest(
    { region: REGION, invoker: 'public', memory: '256MiB' },
    async (req, res) => {
      setCors(res, 'GET, OPTIONS');
      if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
      }
      if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }
      try {
        res.status(200).json({ ok: true, ...industryAttributeMap.getAttributeOwnershipPayload() });
      } catch (e) {
        res.status(500).json({ ok: false, error: String(e.message || e) });
      }
    }
  );

  const profileIndustryRoutesCtx = {
    onRequest,
    profileFnOpts,
    storeFnOpts: CONSENT_STORE_FN_OPTS,
    setCors,
    resolveSandboxFromQuery,
    getAdobeAccessToken,
    adobeClientIdValue: () => ADOBE_CLIENT_ID.value(),
    adobeImsOrgValue: () => ADOBE_IMS_ORG.value(),
    flowLookup: (...args) => consentFlowLookup.lookupConsentHttpFlow(...args),
    serializeFirestoreRecord,
  };

  const industryConfigs = [
    { key: 'generic', prefix: 'generic-profile', infra: genericProfileInfraService, store: genericProfileConnectionStore },
    { key: 'travel', prefix: 'travel-profile', infra: travelProfileInfraService, store: travelProfileConnectionStore },
    { key: 'fsi', prefix: 'fsi-profile', infra: fsiProfileInfraService, store: fsiProfileConnectionStore },
    { key: 'telecom', prefix: 'telecom-profile', infra: telecomProfileInfraService, store: telecomProfileConnectionStore },
    { key: 'retail', prefix: 'retail-profile', infra: retailProfileInfraService, store: retailProfileConnectionStore },
    { key: 'media', prefix: 'media-profile', infra: mediaProfileInfraService, store: mediaProfileConnectionStore },
    { key: 'sports', prefix: 'sports-profile', infra: sportsProfileInfraService, store: sportsProfileConnectionStore },
  ];

  for (const cfg of industryConfigs) {
    const industryRoutes = createProfileIndustryRoutes({
      industryKey: cfg.key,
      routePathPrefix: cfg.prefix,
      infraService: cfg.infra,
      connectionStore: cfg.store,
      ctx: profileIndustryRoutesCtx,
    });
    const exportPrefix = cfg.key === 'generic' ? 'generic' : cfg.key;
    routes[`${exportPrefix}ProfileInfraStatus`] = industryRoutes.statusHandler;
    routes[`${exportPrefix}ProfileInfraStep`] = industryRoutes.stepHandler;
    routes[`${exportPrefix}ProfileInfraEnableProfile`] = industryRoutes.enableProfileHandler;
    routes[`${exportPrefix}ProfileInfraFlowLookup`] = industryRoutes.flowLookupHandler;
    routes[`${exportPrefix}ProfileConnectionStore`] = industryRoutes.connectionStoreHandler;
  }

  routes.profileInfraStatusAll = onRequest(profileFnOpts, async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    const sandbox = resolveSandboxFromQuery(req);
    const bypassCache = String(req.query.refresh || '').trim() === '1';
    console.log(
      '[profileInfraStatusAll.http]',
      JSON.stringify({ route: 'GET /api/profile-infra/status-all', sandbox, bypassCache })
    );
    let accessToken;
    try {
      accessToken = await getAdobeAccessToken();
    } catch (e) {
      res.status(500).json({ error: 'Auth failed', detail: String(e.message || e), sandbox });
      return;
    }
    try {
      const payload = await profileInfraStatusAllSvc.runProfileInfraStatusAll({
        sandbox,
        token: accessToken,
        clientId: ADOBE_CLIENT_ID.value(),
        orgId: ADOBE_IMS_ORG.value(),
        bypassCache,
        services: {
          generic: genericProfileInfraService,
          travel: travelProfileInfraService,
          fsi: fsiProfileInfraService,
          telecom: telecomProfileInfraService,
          retail: retailProfileInfraService,
          media: mediaProfileInfraService,
          sports: sportsProfileInfraService,
        },
      });
      res.status(200).json(payload);
    } catch (e) {
      res.status(500).json({ error: String(e.message || e), sandbox });
    }
  });

/**
 * POST /api/profile/update — streams to the HTTP API connection (body.streaming.url + flowId, sandbox).
 * Default payload matches Profile Viewer: profileStreamingCore.buildProfileStreamPayload (identityMap + root consents/optInOut + _demoemea + demoemea mirror).
 * ECID optional: included in identityMap and identification.core when body.ecid is valid.
 * Optional streamPayloadProfile=operational for slim shape only.
 *
 * Consent Manager (consent.html) does **not** use this endpoint for “Update consent”: it builds a full DCS
 * envelope client-side and POSTs to `/api/consent/legacy-update` (see consent.js `buildConsentPayload` /
 * `postLegacyConsentUpdate`). The `body.consent` branch here is a compact programmatic shape via
 * `profileStreamingCore.buildConsentXdm` (no idSpecific tree); no in-repo UI currently sends it.
 */
routes.profileUpdateProxy = onRequest(profileFnOpts, async (req, res) => {
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
  const dryRun = body.dryRun === true || body.dryRun === 'true';
  const email = String(body.email || '').trim();
  const ecid = body.ecid != null ? String(body.ecid).trim() : '';
  const updates = Array.isArray(body.updates) ? body.updates : [];
  const consentRaw = body.consent;
  const hasConsent = consentRaw != null && typeof consentRaw === 'object' && !Array.isArray(consentRaw);
  const sandbox = resolveSandboxForProfileBody(req);

  if (!email) {
    res.status(400).json({ error: 'Email is required (primary identity for consent streaming).' });
    return;
  }
  const ecidForPayload = ecid.length >= 10 ? ecid : '';
  if (hasConsent && updates.length > 0) {
    res.status(400).json({ error: 'Send either updates or consent, not both.' });
    return;
  }
  if (!hasConsent && updates.length === 0) {
    res.status(400).json({ error: 'No updates provided (updates[] or consent object).' });
    return;
  }
  const ALLOWED_PERSONAL_TAX_BRACKETS = new Set(['10%', '12%', '22%', '24%', '32%', '35%', '37%']);

  // Industry routing — `?industry=<key>` (or body.industry) tells us
  // which per-industry HTTP API streaming dataflow to write to. When
  // absent we keep the historical default of `generic` so existing
  // callers (Consent Manager, Profile Viewer's old single-target Update
  // button) keep working unchanged. The body's `streaming.{url, flowId,
  // datasetId, schemaId, xdmKey}` STILL win when explicitly set — that
  // is the back-compat path for callers that already do their own
  // connection lookup client-side.
  const INDUSTRY_TO_CONNECTION_STORE = {
    generic: genericProfileConnectionStore,
    travel: travelProfileConnectionStore,
    fsi: fsiProfileConnectionStore,
    telecom: telecomProfileConnectionStore,
    retail: retailProfileConnectionStore,
    media: mediaProfileConnectionStore,
    sports: sportsProfileConnectionStore,
  };
  const requestedIndustryRaw = String(req.query.industry || body.industry || '').trim().toLowerCase();
  const industryKey = requestedIndustryRaw && INDUSTRY_TO_CONNECTION_STORE[requestedIndustryRaw]
    ? requestedIndustryRaw
    : 'generic';
  if (requestedIndustryRaw && !INDUSTRY_TO_CONNECTION_STORE[requestedIndustryRaw]) {
    res.status(400).json({
      error: `Unknown industry "${requestedIndustryRaw}". Supported: ${Object.keys(INDUSTRY_TO_CONNECTION_STORE).join(', ')}.`,
    });
    return;
  }

  const streaming = body.streaming && typeof body.streaming === 'object' ? body.streaming : {};
  // Look up the industry's persisted streaming connection. Body wins
  // when it sets a field; the connection store fills in the gaps. We
  // NEVER overwrite a non-empty body value — that would be a foot-gun
  // for the legacy single-target Update path.
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
      '[profileUpdateProxy.connection-lookup]',
      JSON.stringify({
        industry: industryKey,
        sandbox,
        error: String(lookupErr && lookupErr.message ? lookupErr.message : lookupErr).slice(0, 240),
      }),
    );
  }
  const persistedStreaming =
    industryConnection && industryConnection.streaming && typeof industryConnection.streaming === 'object'
      ? industryConnection.streaming
      : {};

  const streamUrl = String(streaming.url || persistedStreaming.url || '').trim();
  const flowId = String(streaming.flowId || persistedStreaming.flowId || '').trim();
  const datasetId = String(streaming.datasetId || persistedStreaming.datasetId || '').trim();
  const schemaId = String(streaming.schemaId || persistedStreaming.schemaId || '').trim();
  const xdmKey = String(
    streaming.xdmKey || persistedStreaming.xdmKey || '_demoemea',
  ).trim();
  const isAdobeDcsCollection = streamUrl ? /dcs\.adobedc\.net/i.test(streamUrl) : false;
  const hasDatasetAndSchema = Boolean(datasetId && schemaId);
  /** DCS HTTP API inlets require { header, body }; bare JSON returns 400 "header field is mandatory". */
  let useEnvelope =
    streaming.useEnvelope === true ||
    streaming.useEnvelope === 'true' ||
    hasDatasetAndSchema ||
    profileStreamingCore.profileStreamingUseEnvelope(process.env.AEP_PROFILE_STREAMING_ENVELOPE);
  if (isAdobeDcsCollection) {
    useEnvelope = true;
  }
  if (dryRun && hasDatasetAndSchema) {
    useEnvelope = true;
  }

  if (!dryRun && (!streamUrl || !flowId)) {
    res.status(400).json({
      error: `Missing streaming.url (DCS collection URL) and streaming.flowId. In AEP, create an HTTP API streaming dataflow named "${consentInfraService.CONSENT_HTTP_DATAFLOW_NAME}" for dataset "${consentInfraService.CONSENT_DATASET_NAME}", then save URL and Flow ID on the Consent page.`,
    });
    return;
  }
  if (dryRun && !hasDatasetAndSchema) {
    res.status(400).json({
      error:
        'Preview (dryRun) requires streaming.datasetId and streaming.schemaId. Save your HTTP API connection on the Consent page first.',
    });
    return;
  }
  if (useEnvelope && (!datasetId || !schemaId)) {
    res.status(400).json({
      error: isAdobeDcsCollection
        ? 'Adobe DCS expects a header/body envelope (schemaRef, imsOrgId, datasetId). Add Dataset ID and Schema $id from your HTTP API dataflow in Sandbox & streaming connection, run Prepare if needed, click Save connection, then try again.'
        : 'Envelope mode requires streaming.datasetId and streaming.schemaId.',
    });
    return;
  }

  const clientId = ADOBE_CLIENT_ID.value();
  const orgId = ADOBE_IMS_ORG.value();
  const apiKey = String(streaming.apiKey || persistedStreaming.apiKey || '').trim() || clientId;

  let accessToken;
  if (!dryRun) {
    try {
      accessToken = await getAdobeAccessToken();
    } catch (e) {
      res.status(500).json({ error: 'Auth failed', detail: String(e.message || e) });
      return;
    }
  }

  let demoemea;
  let applied = 0;
  const skippedPaths = [];
  const rootExtras = {};
  let sourceLabel = 'Firebase profile update';
  let successMessage;
  /** @type {Array<{ sourcePath: string, relativePath: string, underRootMixin: boolean }> | null} */
  let appliedPathsDetail = null;

  if (hasConsent) {
    const c = consentRaw;
    const fragment = profileStreamingCore.buildConsentXdm(email, {
      marketingConsent: c.marketingConsent,
      channelOptInOut: c.channelOptInOut,
      channels: c.channels,
      dataCollection: c.dataCollection,
      dataSharing: c.dataSharing,
      contentPersonalization: c.contentPersonalization,
    });
    demoemea = {
      identification: {
        core: {
          email,
          ...(ecidForPayload ? { ecid: ecidForPayload } : {}),
        },
      },
      consents: fragment._demoemea.consents,
      optInOut: fragment._demoemea.optInOut,
    };
    applied = 1;
    sourceLabel = 'Programmatic consent (body.consent)';
    successMessage = 'Profile update accepted (consent object). Re-query to see changes.';
  } else {
    demoemea = {
      identification: {
        core: {
          email,
          ...(ecidForPayload ? { ecid: ecidForPayload } : {}),
        },
      },
    };
    appliedPathsDetail = [];
    for (const u of updates) {
      const rawPath = u?.path != null ? String(u.path).trim() : '';
      const valueType = u?.valueType != null ? String(u.valueType).trim().toLowerCase() : '';
      let path = rawPath
        .replace(/^(_demoemea\.|xdm:demoss\.)/i, '')
        .replace(/^demoemea\./i, '');
      if (!path) {
        if (rawPath) skippedPaths.push(rawPath);
        continue;
      }
      const val = u.value;
      let out = val !== undefined && val !== null ? val : '';
      if (typeof out === 'string') {
        out = profileStreamingCore.normalizeProfileUpdateDateString(path, out);
      }
      if (valueType === 'boolean') {
        if (typeof out === 'string') {
          const n = out.trim().toLowerCase();
          out = n === 'true' || n === '1' || n === 'yes' || n === 'y';
        } else {
          out = Boolean(out);
        }
      } else if (valueType === 'number') {
        if (typeof out === 'string') {
          const n = Number(out.trim());
          out = Number.isFinite(n) ? n : out;
        }
      } else if (valueType === 'null') {
        if (typeof out === 'string' && out.trim() === '') out = null;
      }
      if (path.toLowerCase() === 'personalfinances.personaltaxprofile.taxbracket') {
        const normalized =
          typeof out === 'string'
            ? (/^\d+$/.test(out.trim()) ? `${out.trim()}%` : out.trim())
            : String(out == null ? '' : out).trim();
        if (!ALLOWED_PERSONAL_TAX_BRACKETS.has(normalized)) {
          res.status(400).json({
            error:
              `Invalid personalTaxProfile.taxBracket "${normalized || String(out)}". ` +
              `Allowed values: ${Array.from(ALLOWED_PERSONAL_TAX_BRACKETS).join(', ')}.`,
            invalidPath: rawPath || path,
            allowedValues: Array.from(ALLOWED_PERSONAL_TAX_BRACKETS),
          });
          return;
        }
        out = normalized;
      }
      const top = path.split('.')[0];
      const underRootMixin = profileStreamingCore.PROFILE_STREAM_ROOT_PATH_PREFIXES.has(top);
      const target = underRootMixin ? rootExtras : demoemea;
      if (
        typeof out === 'string' &&
        valueType !== 'string' &&
        !profileStreamingCore.isDigitStringSchemaLeafPath(path) &&
        out.trim() !== '' &&
        /^\d+$/.test(out)
      ) {
        profileStreamingCore.setByPath(target, path, parseInt(out, 10));
      } else {
        profileStreamingCore.setByPath(target, path, out);
      }
      applied++;
      appliedPathsDetail.push({ sourcePath: rawPath, relativePath: path, underRootMixin });
    }
    if (applied === 0) {
      res.status(400).json({
        error: 'No valid attribute paths after stripping tenant prefix.',
        skippedPaths,
      });
      return;
    }
    successMessage = `Profile update accepted (${applied} field(s)).`;
  }

  if (!hasConsent) {
    profileStreamingCore.mirrorPreferredLanguageDemoSchema(demoemea, rootExtras);
  }

  const normPayloadProfile = String(
    body.streamPayloadProfile || streaming.streamPayloadProfile || '',
  )
    .toLowerCase()
    .replace(/[-_\s]/g, '');
  const useOperationalConsent =
    normPayloadProfile === 'operational' ||
    normPayloadProfile === 'dcsoperational';
  const useOperationalProfileUnion =
    normPayloadProfile === 'operationalprofile' ||
    normPayloadProfile === 'operationalprofileunion';

  const envelopeSourceName =
    String(streaming.flowName || streaming.sourceName || '').trim() || sourceLabel;

  const streamingTarget = {
    transport: 'aep-http-api-dcs',
    idType: 'datasetId',
    collectionUrl: streamUrl || null,
    flowId: flowId || null,
    datasetId: datasetId || null,
    schemaId: schemaId || null,
    xdmKey: xdmKey || '_demoemea',
    industry: industryKey,
    note:
      'Profile updates POST to the Adobe DCS HTTP API collection URL with x-adobe-flow-id (dataflow/inlet). ' +
      'The envelope header carries an AEP Dataset ID and Schema $id — not an Adobe Experience Platform Edge datastream ID. ' +
      'Experience events from this demo use a separate Edge datastream via POST /api/events/generator.',
  };

  /** @type {object} */
  let payload;
  let payloadFormat;
  let streamPayloadProfileLabel = 'standard';
  if (useOperationalConsent && useEnvelope) {
    const xdmEntity = profileStreamingCore.buildOperationalConsentXdmEntity(demoemea, email, ecidForPayload, rootExtras);
    payload = profileStreamingCore.buildProfileStreamingEnvelope(xdmEntity, orgId, envelopeSourceName, datasetId, schemaId);
    payloadFormat = 'envelope';
    streamPayloadProfileLabel = 'operational-consent';
  } else if (useOperationalProfileUnion && useEnvelope) {
    const xdmEntity = profileStreamingCore.buildOperationalProfileUnionXdmEntity(
      demoemea,
      email,
      ecidForPayload,
      xdmKey,
      rootExtras,
    );
    payload = profileStreamingCore.buildProfileStreamingEnvelope(xdmEntity, orgId, envelopeSourceName, datasetId, schemaId);
    payloadFormat = 'envelope';
    streamPayloadProfileLabel = 'operational-profile-union';
  } else {
    const built = profileStreamingCore.buildProfileStreamPayload(
      demoemea,
      email,
      ecidForPayload,
      xdmKey,
      orgId,
      sourceLabel,
      rootExtras,
      { useEnvelope, datasetId, schemaId },
    );
    payload = built.payload;
    payloadFormat = built.format;
  }

  if (dryRun) {
    res.status(200).json({
      ok: true,
      dryRun: true,
      payloadFormat,
      streamPayloadProfile: streamPayloadProfileLabel,
      streamingTarget,
      envelope: payload,
      imsOrgId: orgId,
      industry: industryKey,
      note:
        streamPayloadProfileLabel === 'operational-consent'
          ? 'Operational consent payload (explicit streamPayloadProfile only).'
          : streamPayloadProfileLabel === 'operational-profile-union'
            ? 'Operational Profile union payload (root person/address + _demoemea tenant leaves, identityMap retained).'
            : payloadFormat === 'envelope'
              ? 'Standard streaming: identityMap (Email primary; ECID when body.ecid set), root consents/optInOut from merged tenant, _demoemea + demoemea mirror, root person.* from form.'
              : undefined,
    });
    return;
  }

  const headers = profileStreamingCore.buildProfileDcsStreamingHeaders(accessToken, sandbox, flowId, apiKey);

  let streamRes;
  let rawText;
  try {
    streamRes = await fetch(streamUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    rawText = await streamRes.text();
  } catch (e) {
    res.status(502).json({ error: String(e.message || e) });
    return;
  }

  const { parsed: data, streamErrors, streamWarnings } = profileStreamingCore.parseStreamingCollectionResponse(streamRes.status, rawText);

  if (!streamRes.ok || streamErrors.length > 0) {
    res.status(502).json({
      error: streamErrors.length ? streamErrors.join(' ') : 'Streaming failed',
      streamingStatus: streamRes.status,
      streamingResponse: data,
      sentToAep: payload,
      payloadFormat,
      streamPayloadProfile: streamPayloadProfileLabel,
      streamingTarget,
      requestHeaders: profileStreamingCore.redactedProfileDcsRequestHeaders(headers),
      industry: industryKey,
    });
    return;
  }

  res.status(200).json({
    ok: true,
    message: successMessage,
    sentToAep: payload,
    payloadFormat,
    streamPayloadProfile: streamPayloadProfileLabel,
    streamingTarget,
    streamingResponse: data,
    streamingWarning: streamWarnings.length ? streamWarnings.join(' ') : undefined,
    requestHeaders: profileStreamingCore.redactedProfileDcsRequestHeaders(headers),
    industry: industryKey,
    ...(appliedPathsDetail && appliedPathsDetail.length ? { appliedPathsDetail } : {}),
  });
});

/**
 * POST /api/profile/generate — stream a sample profile (Generate Profiles page). Same body as local Express.
 */
routes.profileGenerateProxy = onRequest(profileFnOpts, async (req, res) => {
  return profileGenerateService.handleProfileGenerate(req, res, {
    setCors,
    resolveSandboxForProfileBody,
    getAdobeAccessToken,
    clientId: ADOBE_CLIENT_ID.value(),
    orgId: ADOBE_IMS_ORG.value(),
  });
});

/**
 * POST /api/consent/legacy-update — mirrors the old firebaseFunctions consent-manager flow exactly.
 * Client builds the full DCS payload (header + body + xdmEntity) and sends it here.
 * This function only adds auth headers and forwards the payload to DCS — no server-side XDM building.
 *
 * Body: { payload: { header, body }, collectionUrl, flowId?, sandbox?, dryRun? }
 */
routes.consentManagerLegacyUpdate = onRequest(profileFnOpts, async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, success: false, error: 'Method not allowed' });
    return;
  }
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const dryRun = body.dryRun === true || body.dryRun === 'true';
  const sandbox = resolveSandboxForProfileBody(req);

  const payload = body.payload;
  if (!payload || typeof payload !== 'object' || !payload.header || !payload.body) {
    res.status(400).json({
      ok: false,
      success: false,
      error: 'payload object with header + body is required (client-built DCS envelope).',
    });
    return;
  }

  const orgId = ADOBE_IMS_ORG.value();
  if (payload.header && (!payload.header.imsOrgId || String(payload.header.imsOrgId).trim() === '')) {
    payload.header.imsOrgId = orgId;
  }

  if (dryRun) {
    res.status(200).json({
      ok: true,
      success: true,
      dryRun: true,
      payload,
      note: 'Client-built DCS payload (same shape as old Firebase consent-manager). Ready to send.',
    });
    return;
  }

  const collectionUrl = String(body.collectionUrl || '').trim();
  if (!collectionUrl) {
    res.status(400).json({
      ok: false,
      success: false,
      error: 'collectionUrl (DCS collection URL) is required for live update.',
    });
    return;
  }

  let accessToken;
  try {
    accessToken = await getAdobeAccessToken();
  } catch (e) {
    res.status(500).json({ ok: false, success: false, error: 'Auth failed', detail: String(e.message || e) });
    return;
  }

  const flowId = String(body.flowId || '').trim();
  const apiKey = ADOBE_CLIENT_ID.value();
  const headers = consentManagerLegacy.buildLegacyConsentDcsHeaders(accessToken, sandbox, flowId, apiKey, orgId);

  let streamRes;
  let rawText;
  try {
    streamRes = await fetch(collectionUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    rawText = await streamRes.text();
  } catch (e) {
    res.status(502).json({ ok: false, success: false, error: String(e.message || e) });
    return;
  }

  const { parsed: data, streamErrors, streamWarnings } = profileStreamingCore.parseStreamingCollectionResponse(streamRes.status, rawText);

  if (!streamRes.ok || streamErrors.length > 0) {
    res.status(502).json({
      ok: false,
      success: false,
      error: streamErrors.length ? streamErrors.join(' ') : 'Streaming failed',
      streamingStatus: streamRes.status,
      streamingResponse: data,
      sentToAep: payload,
      requestHeaders: consentManagerLegacy.redactLegacyConsentDcsHeaders(headers),
    });
    return;
  }

  res.status(200).json({
    ok: true,
    success: true,
    message: 'Consent update sent successfully.',
    sentToAep: payload,
    streamingResponse: data,
    streamingWarning: streamWarnings.length ? streamWarnings.join(' ') : undefined,
    requestHeaders: consentManagerLegacy.redactLegacyConsentDcsHeaders(headers),
  });
});


/** GET /api/profile/audiences */
routes.profileAudiencesProxy = onRequest(profileFnOpts, async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed', realized: [], exited: [] });
    return;
  }
  const identifier = String(req.query.identifier || req.query.email || '').trim();
  const namespace = String(req.query.namespace || 'email').trim().toLowerCase();
  const sandbox = resolveSandboxFromQuery(req);
  if (!identifier) {
    res.status(400).json({ error: 'Missing identifier. Use ?identifier=…&namespace=email|ecid|crmId|loyaltyId|phone', realized: [], exited: [] });
    return;
  }
  let accessToken;
  try {
    accessToken = await getAdobeAccessToken();
  } catch (e) {
    res.status(500).json({ error: 'Auth failed', detail: String(e.message || e), realized: [], exited: [] });
    return;
  }
  const clientId = ADOBE_CLIENT_ID.value();
  const orgId = ADOBE_IMS_ORG.value();
  try {
    const payload = await profileAudiences.buildAudiencesPayload(identifier, sandbox, accessToken, clientId, orgId, namespace);
    res.status(200).json(payload);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e), realized: [], exited: [] });
  }
});

/** GET /api/profile/consent */
routes.profileConsentProxy = onRequest(profileFnOpts, async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const sandbox = resolveSandboxFromQuery(req);
  const identifier = String(req.query.identifier || req.query.email || '').trim();
  const namespace = String(req.query.namespace || 'email').trim().toLowerCase();
  if (!identifier) {
    res.status(400).json({
      error: 'Missing identifier. Use ?email=… or ?identifier=…&namespace=email|ecid|crmId|loyaltyId|phone',
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
  const clientId = ADOBE_CLIENT_ID.value();
  const orgId = ADOBE_IMS_ORG.value();
  try {
    const ups = await profileTableHelpers.fetchUpsProfileEntities(identifier, sandbox, accessToken, clientId, orgId, namespace);
    const payload = profileConsentPayload.buildConsentGetPayload(identifier, ups);
    res.status(200).json(payload);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/** GET /api/profile/events */
routes.profileEventsProxy = onRequest(profileFnOpts, async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed', events: [] });
    return;
  }
  const identifier = String(req.query.identifier || req.query.email || '').trim();
  const namespace = String(req.query.namespace || 'email').trim().toLowerCase();
  const sandbox = resolveSandboxFromQuery(req);
  if (!identifier) {
    res.status(400).json({ error: 'Missing identifier. Use ?identifier=…&namespace=email|ecid|crmId|loyaltyId|phone', events: [] });
    return;
  }
  let accessToken;
  try {
    accessToken = await getAdobeAccessToken();
  } catch (e) {
    res.status(500).json({ error: 'Auth failed', detail: String(e.message || e), events: [] });
    return;
  }
  const clientId = ADOBE_CLIENT_ID.value();
  const orgId = ADOBE_IMS_ORG.value();
  try {
    const payload = await profileEventsService.buildEventsPayload(identifier, namespace, sandbox, accessToken, clientId, orgId);
    res.status(200).json(payload);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e), events: [] });
  }
});

  return routes;
}

module.exports = { registerProfileRoutes };
