/**
 * Profile record streaming to DCS (HTTP API) — logic mirrored from Profile Viewer server.js.
 */

const OPTINOUT_CHANNELS = [
  'email',
  'sms',
  'push',
  'phone',
  'directMail',
  'whatsapp',
  'facebookFeed',
  'web',
  'mobileApp',
  'twitterFeed',
];

const PROFILE_STREAM_ROOT_PATH_PREFIXES = new Set([
  'telecomSubscription',
  'person',
  'personID',
  'personalEmail',
  'homeAddress',
  'homePhone',
  'workAddress',
  'workPhone',
  'billingAddress',
  'billingAddressPhone',
  'mailingAddress',
  'shippingAddress',
  'shippingAddressPhone',
  'faxPhone',
  'mobilePhone',
  'loyalty',
]);

const PROFILE_STREAM_SCHEMA_CONTENT_TYPE = 'application/vnd.adobe.xed-full+json;version=1.0';

function setByPath(obj, path, value) {
  if (!path || typeof path !== 'string') return;
  const keys = path.split('.').filter(Boolean);
  if (keys.length === 0) return;
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (!(k in cur) || typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {};
    cur = cur[k];
  }
  cur[keys[keys.length - 1]] = value;
}

function normalizeProfileUpdateDateString(relativePath, val) {
  if (val == null || typeof val !== 'string') return val;
  const p = String(relativePath).toLowerCase();
  if (!p.includes('donationdate')) return val;
  const s = val.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return val;
  const [, y, a, b] = m;
  const na = parseInt(a, 10);
  if (na > 12) return `${y}-${b}-${a}`;
  return `${y}-${a}-${b}`;
}

function buildConsentXdm(email, opts) {
  const marketingConsent = opts.marketingConsent;
  const channelOptInOut = opts.channelOptInOut;
  const channels = opts.channels;
  const dataCollection = opts.dataCollection;
  const dataSharing = opts.dataSharing;
  const contentPersonalization = opts.contentPersonalization;

  const val = marketingConsent != null ? (String(marketingConsent).toUpperCase() === 'Y' ? 'y' : 'n') : 'y';
  const defaultChannelVal =
    channelOptInOut != null && String(channelOptInOut).toLowerCase() === 'out' ? 'out' : 'in';
  const toYorN = (v) => (v != null && String(v).toLowerCase() === 'y' ? 'y' : 'n');
  const channelYn = defaultChannelVal === 'out' ? 'n' : 'y';
  const marketingNow = new Date().toISOString();
  const channelConsent = (yn) => ({
    val: yn,
    reason: 'Profile streaming default',
    time: marketingNow,
  });
  const marketing = {
    val,
    any: { val, reason: 'Profile streaming default', time: marketingNow },
    preferred: 'email',
    email: channelConsent(channelYn),
    sms: channelConsent(channelYn),
    push: channelConsent(channelYn),
    call: channelConsent(channelYn),
    whatsApp: channelConsent(channelYn),
    fax: channelConsent(channelYn),
    postalMail: channelConsent(channelYn),
    commercialEmail: channelConsent(channelYn),
  };
  const _channels = {};
  if (channels && typeof channels === 'object' && Object.keys(channels).length > 0) {
    for (const key of OPTINOUT_CHANNELS) {
      const v = channels[key];
      _channels[key] = v === 'in' || v === 'out' || v === 'not_provided' ? v : defaultChannelVal;
    }
  } else {
    for (const key of OPTINOUT_CHANNELS) {
      _channels[key] = defaultChannelVal;
    }
  }
  const consents = {
    marketing,
    ...(dataCollection != null && { collect: { val: toYorN(dataCollection) } }),
    ...(dataSharing != null && { share: { val: toYorN(dataSharing) } }),
    ...(contentPersonalization != null && {
      personalize: { content: { val: toYorN(contentPersonalization) } },
    }),
  };
  return {
    identityMap: { Email: [{ id: email, primary: true }] },
    consents,
    optInOut: { _channels },
    _demoemea: {
      identification: { core: { email } },
      consents,
      optInOut: { _channels },
    },
  };
}

function buildDefaultProfileStreamingConsentFields(email) {
  const fragment = buildConsentXdm(email, {
    marketingConsent: 'Y',
    channelOptInOut: 'In',
    channels: undefined,
    dataCollection: 'Y',
    dataSharing: 'Y',
    contentPersonalization: 'Y',
  });
  return { consents: fragment.consents, optInOut: fragment.optInOut };
}

function profileStreamingUseEnvelope(envFlag) {
  const v = String(envFlag || '').toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** Root-level consents/optInOut: reuse tenant object when present so consent updates match the form (email-primary identity unchanged). */
function resolveStreamingConsentsOptInOut(tenantPayload, email) {
  const tenant = tenantPayload && typeof tenantPayload === 'object' ? tenantPayload : {};
  if (tenant.consents != null && typeof tenant.consents === 'object') {
    const optInOut =
      tenant.optInOut != null && typeof tenant.optInOut === 'object'
        ? tenant.optInOut
        : buildDefaultProfileStreamingConsentFields(email).optInOut;
    return { consents: tenant.consents, optInOut };
  }
  return buildDefaultProfileStreamingConsentFields(email);
}

function buildProfileXdmEntityForStream(tenantPayload, email, ecid, xdmKey, rootProfileFields) {
  const key = (xdmKey && String(xdmKey).trim()) || '_demoemea';
  const { consents, optInOut } = resolveStreamingConsentsOptInOut(tenantPayload, email);
  const roots = rootProfileFields && typeof rootProfileFields === 'object' ? rootProfileFields : {};
  const hasEcid = ecid != null && String(ecid).trim().length >= 10;
  const entity = {
    identityMap: {
      Email: [{ id: email, primary: true }],
      ...(hasEcid ? { ECID: [{ id: String(ecid).trim(), primary: false }] } : {}),
    },
    consents,
    optInOut,
    ...roots,
  };
  entity[key] = tenantPayload;
  // Do not mirror under lowercase `demoemea`: consent / Profile lab schemas compile only `_${tenantId}`;
  // an extra root key fails DCVS-1057-400 schema validation on DCS.
  return entity;
}

function buildProfileStreamingEnvelope(xdmEntity, orgId, sourceLabel, datasetId, schemaId) {
  const sid = String(schemaId || '').trim().replace(/\/+$/, '');
  const did = String(datasetId || '').trim();
  return {
    header: {
      schemaRef: {
        id: sid,
        contentType: PROFILE_STREAM_SCHEMA_CONTENT_TYPE,
      },
      imsOrgId: orgId,
      datasetId: did,
      source: { name: sourceLabel || 'Profile Viewer' },
    },
    body: {
      xdmMeta: {
        schemaRef: {
          id: sid,
          contentType: PROFILE_STREAM_SCHEMA_CONTENT_TYPE,
        },
      },
      xdmEntity,
    },
  };
}

/**
 * Builds DCS HTTP API body. Identity: Email primary; ECID included only when a valid ECID is provided.
 * Bare format duplicates consents/optInOut at root only when tenant lacks them (attribute-only updates use defaults).
 *
 * @returns {{ payload: object, format: 'envelope' | 'bare' }}
 */
function buildProfileStreamPayload(
  demoemeaTenantObject,
  email,
  ecid,
  xdmKey,
  orgId,
  sourceLabel,
  rootProfileFields,
  { useEnvelope, datasetId, schemaId }
) {
  const roots = rootProfileFields && typeof rootProfileFields === 'object' ? rootProfileFields : {};
  const hasRoots = Object.keys(roots).length > 0;
  if (!useEnvelope) {
    const k = (xdmKey && String(xdmKey).trim()) || '_demoemea';
    const { consents, optInOut } = resolveStreamingConsentsOptInOut(demoemeaTenantObject, email);
    const hasEcid = ecid != null && String(ecid).trim().length >= 10;
    return {
      payload: {
        identityMap: {
          Email: [{ id: email, primary: true }],
          ...(hasEcid ? { ECID: [{ id: String(ecid).trim(), primary: false }] } : {}),
        },
        [k]: demoemeaTenantObject,
        consents,
        optInOut,
        ...(hasRoots ? roots : {}),
      },
      format: 'bare',
    };
  }
  const xdmEntity = buildProfileXdmEntityForStream(
    demoemeaTenantObject,
    email,
    ecid,
    xdmKey,
    hasRoots ? roots : undefined
  );
  return {
    payload: buildProfileStreamingEnvelope(xdmEntity, orgId, sourceLabel, datasetId, schemaId),
    format: 'envelope',
  };
}

function buildProfileDcsStreamingHeaders(token, sandboxName, flowId, apiKey) {
  const h = {
    'Content-Type': 'application/json',
    'sandbox-name': sandboxName || 'production',
  };
  if (flowId) h['x-adobe-flow-id'] = flowId;
  h.Authorization = `Bearer ${token}`;
  h['x-api-key'] = apiKey;
  return h;
}

function redactedProfileDcsRequestHeaders(headers) {
  return {
    'Content-Type': headers['Content-Type'],
    'sandbox-name': headers['sandbox-name'],
    'x-adobe-flow-id': headers['x-adobe-flow-id'],
    'x-api-key': headers['x-api-key'] ? '***' : undefined,
    Authorization: 'Bearer ***',
  };
}

function parseStreamingCollectionResponse(httpStatus, rawText) {
  const trimmed = (rawText || '').trim();
  let parsed = {};
  if (trimmed) {
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      parsed = { _nonJsonResponse: trimmed.slice(0, 800) };
    }
  }
  const streamErrors = [];
  const streamWarnings = [];

  if (httpStatus < 200 || httpStatus >= 300) {
    streamErrors.push(`HTTP ${httpStatus}`);
  }

  const inspectRoot = (root) => {
    if (!root || typeof root !== 'object' || Array.isArray(root)) return;
    if (root.title && typeof root.status === 'number' && root.status >= 400) {
      streamErrors.push(`${root.title}${root.detail ? ': ' + root.detail : ''}`);
    }
    if (Array.isArray(root.errors)) {
      root.errors.forEach((e) => {
        const m = e && (e.message || e.detail || e.reason || e.code);
        if (m) streamErrors.push(String(m));
      });
    }
    if (Array.isArray(root.eventIngestionResults)) {
      root.eventIngestionResults.forEach((r) => {
        const f = r && r.failedRecordCount;
        if (typeof f === 'number' && f > 0) {
          streamErrors.push(`Ingestion: ${f} failed record(s)${r.datasetId ? ` (dataset ${r.datasetId})` : ''}.`);
        }
        if (r && Array.isArray(r.messages)) {
          r.messages.forEach((msg) => {
            const s = typeof msg === 'string' ? msg : msg?.message || msg?.description;
            if (s && /fail|error|invalid|reject|denied/i.test(s)) streamErrors.push(String(s));
          });
        }
      });
    }
    if (root.report && root.report.message && /fail|error|invalid|reject/i.test(String(root.report.message))) {
      streamErrors.push(String(root.report.message));
    }
  };

  inspectRoot(parsed);
  if (parsed.body && typeof parsed.body === 'object') inspectRoot(parsed.body);

  return { parsed, streamErrors, streamWarnings };
}

module.exports = {
  PROFILE_STREAM_ROOT_PATH_PREFIXES,
  setByPath,
  normalizeProfileUpdateDateString,
  buildConsentXdm,
  buildDefaultProfileStreamingConsentFields,
  profileStreamingUseEnvelope,
  buildProfileStreamPayload,
  buildProfileDcsStreamingHeaders,
  redactedProfileDcsRequestHeaders,
  parseStreamingCollectionResponse,
  PROFILE_STREAM_SCHEMA_CONTENT_TYPE,
};
