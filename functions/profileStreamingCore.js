/**
 * Profile record streaming to DCS (HTTP API) — logic mirrored from Profile Viewer server.js.
 */

const { randomUUID } = require('crypto');

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

/** Map consent field value to y/n for operational-style payloads. */
function operationalPickYn(v, defaultY = 'y') {
  if (v == null || v === '') return defaultY;
  if (typeof v === 'object' && v !== null && v.val != null) return operationalPickYn(v.val, defaultY);
  const s = String(v).toLowerCase();
  if (s === 'n' || s === 'no' || s === 'out') return 'n';
  if (s === 'y' || s === 'yes' || s === 'in') return 'y';
  return defaultY;
}

function operationalChannelTime(marketing, key, fallbackIso) {
  const o = marketing && marketing[key];
  if (o && typeof o === 'object' && o.time != null && String(o.time).trim() !== '') return String(o.time);
  return fallbackIso;
}

/** One marketing channel object: time, val, optional reason (from consent form / streaming updates). */
function operationalMarketingField(marketing, key, now, defaultYn = 'y') {
  const o = marketing && marketing[key];
  const val = operationalPickYn(typeof o === 'object' ? o : undefined, defaultYn);
  const out = { time: operationalChannelTime(marketing, key, now), val };
  if (o && typeof o === 'object' && o.reason != null && String(o.reason).trim() !== '') {
    out.reason = String(o.reason).trim();
  }
  return out;
}

function buildOperationalPersonFromRootExtras(rootExtras) {
  const roots = rootExtras && typeof rootExtras === 'object' ? rootExtras : {};
  const nm = roots.person && typeof roots.person === 'object' ? roots.person.name : null;
  const firstName = nm && nm.firstName != null ? String(nm.firstName) : '';
  const lastName = nm && nm.lastName != null ? String(nm.lastName) : '';
  let fullName = nm && nm.fullName != null ? String(nm.fullName).trim() : '';
  if (!fullName) {
    fullName = [firstName, lastName].map((s) => String(s).trim()).filter(Boolean).join(' ').trim();
  }
  return {
    name: {
      firstName,
      lastName,
      fullName,
    },
  };
}

/**
 * DCS envelope xdmEntity for Consent Manager HTTP streams (tenant schema, no Profile union):
 * _demoemea.identification.core + optional _demoemea.optInOut._channels (same pattern as buildConsentXdm).
 * Root consents + idSpecific.Email[…].marketing.email (reason/time when present), person, personID, _id / _repo.
 * Intentionally no root identityMap / root optInOut — those are not on the wizard schema and cause DCVS-1057-400.
 *
 * @param {object} demoemea - Tenant object after applying updates (consents.*, optInOut, identification)
 * @param {string} email
 * @param {string} [ecid]
 * @param {object} [rootExtras] - e.g. person.name from consent form (Profile person mixin paths)
 */
function buildOperationalConsentXdmEntity(demoemea, email, ecid, rootExtras) {
  const now = new Date().toISOString();
  const em = String(email || '').trim();
  const c = (demoemea && demoemea.consents) || {};
  const m = c.marketing || {};
  const preferredLanguage =
    typeof m.preferredLanguage === 'string' && m.preferredLanguage.trim()
      ? m.preferredLanguage.trim()
      : 'en-US';

  const channels = ['email', 'sms', 'push', 'call', 'postalMail', 'whatsApp'];
  /** @type {Record<string, unknown>} */
  const marketingOut = {};
  if (m.val != null && m.val !== '') {
    marketingOut.val = operationalPickYn(m.val, 'y');
  }
  marketingOut.any = operationalMarketingField(m, 'any', now, 'y');
  marketingOut.preferred = typeof m.preferred === 'string' && m.preferred.trim() ? m.preferred.trim() : 'email';
  marketingOut.preferredLanguage = preferredLanguage;
  for (const ch of channels) {
    marketingOut[ch] = operationalMarketingField(m, ch, now, 'y');
  }
  marketingOut.fax = operationalMarketingField(m, 'fax', now, 'y');
  marketingOut.commercialEmail = operationalMarketingField(m, 'commercialEmail', now, 'y');

  /** @type {Record<string, unknown>} */
  const consentsOut = {};
  if (c.collect && typeof c.collect === 'object' && c.collect.val != null) {
    consentsOut.collect = { val: operationalPickYn(c.collect.val, 'y') };
  }
  consentsOut.idSpecific = {
    Email: {
      [em]: {
        marketing: {
          email: operationalMarketingField(m, 'email', now, 'y'),
        },
      },
    },
  };
  consentsOut.marketing = marketingOut;
  if (c.personalize && c.personalize.content && c.personalize.content.val != null) {
    consentsOut.personalize = { content: { val: operationalPickYn(c.personalize.content.val, 'y') } };
  }
  if (c.share && c.share.val != null) {
    consentsOut.share = { val: operationalPickYn(c.share.val, 'y') };
  }

  const core = { email: em };
  if (ecid != null && String(ecid).trim().length >= 10) core.ecid = String(ecid).trim();

  /** @type {Record<string, unknown>} */
  const tenantBlock = { identification: { core } };
  const oo = demoemea && demoemea.optInOut;
  if (oo && typeof oo === 'object' && !Array.isArray(oo)) {
    const ch = oo._channels;
    if (ch && typeof ch === 'object' && Object.keys(ch).length > 0) {
      tenantBlock.optInOut = { _channels: { ...ch } };
    }
  }

  /** @type {Record<string, unknown>} */
  const entity = {
    _demoemea: tenantBlock,
    _id: randomUUID(),
    _repo: { createDate: now, modifyDate: now },
    preferredLanguage,
    consents: consentsOut,
    person: buildOperationalPersonFromRootExtras(rootExtras),
    personID: em,
    metadata: { time: now },
  };

  return entity;
}

module.exports = {
  PROFILE_STREAM_ROOT_PATH_PREFIXES,
  setByPath,
  normalizeProfileUpdateDateString,
  buildConsentXdm,
  buildDefaultProfileStreamingConsentFields,
  profileStreamingUseEnvelope,
  buildProfileStreamPayload,
  buildProfileStreamingEnvelope,
  buildOperationalConsentXdmEntity,
  buildProfileDcsStreamingHeaders,
  redactedProfileDcsRequestHeaders,
  parseStreamingCollectionResponse,
  PROFILE_STREAM_SCHEMA_CONTENT_TYPE,
};
