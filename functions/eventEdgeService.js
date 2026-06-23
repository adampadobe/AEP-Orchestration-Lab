/**
 * Edge Event Service — builds XDM payloads and sends experience events
 * to Adobe Edge Network via the interact endpoint.
 */

const EDGE_INTERACT_BASE = 'https://server.adobedc.net/ee/v2/interact';
/** GET list / discovery — used by listDatastreams and createDatastreamConfig probe. */
const EDGE_DATASTREAMS_PATHS = [
  'https://edge.adobe.io/ee/v2/datastreamConfigs',
  'https://edge.adobe.io/ee/v1/datastreamConfigs',
  'https://edge.adobe.io/ee/v1/edgeConfigs',
  'https://edge.adobe.io/datastreams',
  'https://edge.adobe.io/experienceedge/v1/datastreamConfigs',
  'https://edge.adobe.io/metadata/namespaces/edge/datasets/datastreams/records/',
];

function logEdge(phase, detail) {
  try {
    console.log('[edgeDatastream]', JSON.stringify({ ts: new Date().toISOString(), phase, ...detail }));
  } catch {
    console.log('[edgeDatastream]', phase);
  }
}

function bodySnippet(text, max) {
  const t = String(text || '');
  if (!t) return '';
  const trimmed = t.replace(/\s+/g, ' ').trim();
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed;
}

/* ── XDM helpers ── */

const {
  mergeGeneratorPublicIntoTenant,
  alignExperienceEventFieldGroupPayloads,
  normalizeInteractionDetailsChannel,
  resolveEffectiveGeneratorChannel,
  getXdmTenantKey,
  shouldUseEmailPrimaryIdentity,
  syncXdmDemoemeaLowercaseAlias,
  syncXdmTenantLowercaseAlias,
  normalizeExperienceCloudIdNamespaceInIdentityMap,
} = require('./eventGeneratorService');

function readXdmStyle(body) {
  const b = body && typeof body === 'object' ? body : {};
  return String(b.xdmStyle || b.xdm_style || '').trim().toLowerCase();
}

function hasHospitalityPublic(pub) {
  if (!pub || typeof pub !== 'object' || Array.isArray(pub)) return false;
  const keys = Object.keys(pub);
  if (keys.some((k) => /^hotel/i.test(k))) return true;
  if (pub.hotelItineraryId != null && String(pub.hotelItineraryId).trim()) return true;
  if (pub.itineraryId != null && String(pub.itineraryId).trim()) return true;
  if (pub.bookingParty && typeof pub.bookingParty === 'object') return true;
  return false;
}

/**
 * Rich XDM when callers opt in (tenant mirror, channel, public, message, etc.).
 * @param {Record<string, unknown>} body
 */
function shouldUseRichEdgeXdm(body) {
  const b = body && typeof body === 'object' ? body : {};
  const style = readXdmStyle(b);
  if (style === 'full') return true;
  if (style === 'minimal') return false;

  const explicitTenant = String(b.xdmTenantKey || b.xdm_tenant_key || b.xdmTenantNamespace || '').trim();
  if (explicitTenant) return true;

  if (b.message && typeof b.message === 'object' && !Array.isArray(b.message) && Object.keys(b.message).length > 0) {
    return true;
  }

  const pub = b.public && typeof b.public === 'object' && !Array.isArray(b.public) ? b.public : null;
  if (pub && Object.keys(pub).length > 0) return true;

  const viewName = (b.viewName || '').trim();
  const viewUrl = (b.viewUrl || '').trim();
  if (viewName || viewUrl) return true;

  return false;
}

function buildMinimalEdgeXdm(body) {
  const b = body && typeof body === 'object' ? body : {};
  const now = (typeof b.timestamp === 'string' && b.timestamp.trim()) || new Date().toISOString();
  const _id = b._id != null ? String(b._id) : String(Date.now());
  const eventType = (b.eventType || '').trim() || 'transaction';
  const orchestrationId = (b.eventID || b.orchestrationEventID || '').trim();
  const email = (b.email || '').trim();
  const ecid = b.ecid ? String(b.ecid).trim() : '';

  const identityMap = {};
  if (ecid) identityMap.ECID = [{ id: ecid, primary: true }];
  if (email) identityMap.Email = [{ id: email, primary: !ecid }];

  const xdm = {
    identityMap,
    _id,
    eventType,
    timestamp: now,
  };

  if (orchestrationId) {
    xdm._experience = { campaign: { orchestration: { eventID: orchestrationId } } };
  }

  const ch = normalizeInteractionDetailsChannel(
    b.channel == null ? '' : typeof b.channel === 'string' ? b.channel.trim() : String(b.channel).trim(),
  );
  if (ch) {
    xdm.interactionDetails = { core: { channel: ch } };
  }

  return xdm;
}

function buildRichEdgeXdm(body) {
  const b = body && typeof body === 'object' ? body : {};
  const now = (typeof b.timestamp === 'string' && b.timestamp.trim()) || new Date().toISOString();
  const _id = b._id != null ? String(b._id) : String(Date.now());
  const eventType = (b.eventType || '').trim() || 'transaction';
  const orchestrationId = (b.eventID || b.orchestrationEventID || '').trim();
  const email = (b.email || '').trim();
  const ecid = b.ecid ? String(b.ecid).trim() : '';
  const tenantKey = getXdmTenantKey(b);
  const effectiveCh = resolveEffectiveGeneratorChannel(b);

  const tenantNode = { identification: { core: { ecid: ecid || '', email: email || '' } } };
  mergeGeneratorPublicIntoTenant(tenantNode, b.public);
  const ch = normalizeInteractionDetailsChannel(effectiveCh);
  if (ch) {
    if (!tenantNode.interactionDetails) tenantNode.interactionDetails = {};
    if (!tenantNode.interactionDetails.core) tenantNode.interactionDetails.core = {};
    tenantNode.interactionDetails.core.channel = ch;
  }
  if (b.message && typeof b.message === 'object' && !Array.isArray(b.message)) {
    tenantNode.message = { ...b.message };
  }

  const identityMap = {};
  if (shouldUseEmailPrimaryIdentity(b, tenantKey)) {
    identityMap.Email = [{ id: email, primary: true }];
    tenantNode.identification = { core: { email } };
  } else {
    if (ecid) identityMap.ECID = [{ id: ecid, primary: true }];
    if (email) identityMap.Email = [{ id: email, primary: !ecid }];
  }

  const xdm = {
    identityMap,
    [tenantKey]: tenantNode,
    _id,
    eventType,
    timestamp: now,
  };

  if (orchestrationId) {
    xdm._experience = { campaign: { orchestration: { eventID: orchestrationId } } };
  }

  const viewName = (b.viewName || '').trim();
  const viewUrl = (b.viewUrl || '').trim();
  if (viewName || viewUrl) {
    xdm.web = { webPageDetails: { URL: viewUrl, name: viewName, viewName } };
  }

  alignExperienceEventFieldGroupPayloads(xdm, tenantKey, effectiveCh);
  if (tenantKey === '_demoemea') syncXdmDemoemeaLowercaseAlias(xdm);
  else if (tenantKey.startsWith('_')) syncXdmTenantLowercaseAlias(xdm, tenantKey);
  normalizeExperienceCloudIdNamespaceInIdentityMap(xdm.identityMap);
  return xdm;
}

/**
 * Build an XDM payload from request body fields.
 * Default: minimal (identityMap + eventType + _id + timestamp). Rich tenant/channel/FG only when opted in.
 */
function buildXdm(body) {
  return shouldUseRichEdgeXdm(body) ? buildRichEdgeXdm(body) : buildMinimalEdgeXdm(body);
}

/* ── Trigger template substitution ── */

function replacePlaceholders(obj, replacements) {
  if (obj == null) return obj;
  if (typeof obj === 'string') {
    let s = obj;
    for (const [key, val] of Object.entries(replacements)) {
      s = s.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(val));
    }
    return s;
  }
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => { obj[i] = replacePlaceholders(item, replacements); });
    return obj;
  }
  if (typeof obj === 'object') {
    for (const k of Object.keys(obj)) { obj[k] = replacePlaceholders(obj[k], replacements); }
    return obj;
  }
  return obj;
}

function isValidEdgeEcid(ecid) {
  const s = String(ecid || '').trim();
  return /^\d{10,}$/.test(s);
}

function pruneEmptyTenantEcid(xdm) {
  if (!xdm || typeof xdm !== 'object') return;
  for (const tk of ['_demoemea', 'demoemea']) {
    const tenant = xdm[tk];
    const core = tenant && tenant.identification && tenant.identification.core;
    if (!core || typeof core !== 'object') continue;
    if (core.ecid != null && !String(core.ecid).trim()) delete core.ecid;
  }
}

function buildTriggerPayload(template, ecid, email, eventType) {
  const payload = JSON.parse(JSON.stringify(template));
  const ecidStr = String(ecid || '').trim();
  const emailStr = String(email || '').trim();
  const ecidOk = isValidEdgeEcid(ecidStr);
  const _id = `trigger-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const timestamp = new Date().toISOString();
  replacePlaceholders(payload, { ecid: ecidOk ? ecidStr : '', email: emailStr, _id, timestamp, eventType });
  if (payload.event && payload.event.xdm) {
    const xdm = payload.event.xdm;
    const identityMap = {};
    if (ecidOk) identityMap.ECID = [{ id: ecidStr, primary: true }];
    if (emailStr) identityMap.Email = [{ id: emailStr, primary: !ecidOk }];
    xdm.identityMap = identityMap;
    if (emailStr && !ecidOk) {
      for (const tk of ['_demoemea', 'demoemea']) {
        const tenant = xdm[tk];
        if (!tenant || typeof tenant !== 'object') continue;
        if (!tenant.identification) tenant.identification = {};
        tenant.identification.core = { email: emailStr };
      }
    }
    pruneEmptyTenantEcid(xdm);
    normalizeExperienceCloudIdNamespaceInIdentityMap(xdm.identityMap);
    if (xdm._demoemea) syncXdmDemoemeaLowercaseAlias(xdm);
  }
  return payload;
}

/* ── Edge Network calls ── */

async function sendEdgeEvent(token, clientId, orgId, datastreamId, payload) {
  const url = `${EDGE_INTERACT_BASE}?dataStreamId=${encodeURIComponent(datastreamId)}`;
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'x-api-key': clientId,
    'x-gw-ims-org-id': orgId,
  };
  const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
  const text = await resp.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch {}

  if (!resp.ok) {
    const msg = data.message || data.title || data.detail || data.error || text.slice(0, 300) || `Edge ${resp.status}`;
    throw new Error(msg);
  }
  return { ok: true, requestId: data.requestId || null };
}

function extractDatastreamItems(data) {
  if (!data || typeof data !== 'object') return [];
  const candidates = [
    data._embedded?.datastreamItems,
    data._embedded?.edgeConfigItems,
    data.items,
    data.datastreams,
    data.results,
  ];
  for (const c of candidates) {
    if (Array.isArray(c) && c.length > 0) return c;
  }
  if (Array.isArray(data) && data.length > 0) return data;
  return [];
}

async function listDatastreams(token, clientId, orgId) {
  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    'x-api-key': clientId,
    'x-gw-ims-org-id': orgId,
  };
  const errors = [];
  for (const url of EDGE_DATASTREAMS_PATHS) {
    try {
      const resp = await fetch(url, { method: 'GET', headers });
      console.log(`[listDatastreams] ${url} → ${resp.status}`);
      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        errors.push(`${url} → ${resp.status}: ${errText.slice(0, 200)}`);
        continue;
      }
      const data = await resp.json().catch(() => ({}));
      const items = extractDatastreamItems(data);
      if (items.length === 0) {
        console.log(`[listDatastreams] ${url} returned OK but 0 items. Keys: ${Object.keys(data).join(', ')}`);
        errors.push(`${url} → 200 but 0 items (keys: ${Object.keys(data).join(', ')})`);
        continue;
      }
      console.log(`[listDatastreams] ${url} returned ${items.length} items`);
      return items.map((d) => ({
        id: d.datastreamId || d.id || '',
        title: d.title || d.name || d.datastreamId || d.id || '',
        sandbox: d.sandboxName || d.sandbox || '',
        enabled: d.enabled !== false,
        /** Same org used for the Edge list call — clients can pre-fill Web SDK configure. */
        orgId,
      })).filter((d) => d.id);
    } catch (e) {
      errors.push(`${url} → exception: ${e.message}`);
    }
  }
  console.log('[listDatastreams] All paths failed:', JSON.stringify(errors));
  return { items: [], errors };
}

/**
 * Extract datastream / edge config id from create response (shape varies by API version).
 */
function extractDatastreamIdFromCreateResponse(data) {
  if (!data || typeof data !== 'object') return '';
  if (data.data && typeof data.data === 'object' && !Array.isArray(data.data)) {
    const dr = data.data;
    if (dr.id) return String(dr.id).trim();
    const a = dr.attributes && typeof dr.attributes === 'object' ? dr.attributes : null;
    if (a) {
      const fromA = a.datastreamId || a.edgeConfigId || a.id || a.uuid;
      if (fromA) return String(fromA).trim();
    }
  }
  const d = data.data !== undefined ? data.data : data;
  const attrs = d && typeof d === 'object' ? d.attributes : null;
  const direct =
    data.datastreamId
    || data.id
    || data.uuid
    || (attrs && (attrs.datastreamId || attrs.id || attrs.uuid));
  if (direct) return String(direct).trim();
  if (typeof d === 'string' && /^[0-9a-f-]{36}$/i.test(d)) return d;
  return '';
}

/**
 * Create an Edge datastream via Data Collection Edge Configuration API.
 * Adobe does not publish a single stable public schema; we try a few payloads used by ee/v2.
 * Requires IMS token with access to edge.adobe.io for your org (same as listDatastreams).
 */
async function createDatastreamConfig(token, clientId, orgId, sandbox, params) {
  const name = String(params.name || 'AEP Lab datastream').trim().slice(0, 256);
  const mappingSchemaId = String(params.mappingSchemaId || '').trim();
  const datasetId = String(params.datasetId || '').trim();
  if (!mappingSchemaId || !datasetId) {
    return { ok: false, error: 'mappingSchemaId and datasetId are required.' };
  }
  const description = String(params.description || 'Created by AEP Profile Viewer (Event / Decisioning lab).').slice(0, 512);

  const baseHeaders = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    'x-api-key': clientId,
    'x-gw-ims-org-id': orgId,
    'Content-Type': 'application/json',
  };
  const withSandbox = { ...baseHeaders, 'x-sandbox-name': String(sandbox || '').trim() };

  logEdge('create.start', {
    sandbox: String(sandbox || '').trim(),
    nameLen: name.length,
    mappingSchemaId: mappingSchemaId.slice(0, 80),
    datasetId: datasetId.slice(0, 40),
  });

  const discovery = [];
  const probeHeaders = withSandbox;
  for (const url of EDGE_DATASTREAMS_PATHS) {
    try {
      const resp = await fetch(url, { method: 'GET', headers: probeHeaders });
      const text = await resp.text();
      const row = {
        url,
        sandboxHeader: true,
        httpStatus: resp.status,
        contentType: resp.headers.get('Content-Type') || '',
        bodySnippet: bodySnippet(text, 200),
      };
      discovery.push(row);
      logEdge('create.probeGET', row);
    } catch (e) {
      const row = { url, sandboxHeader: true, exception: String(e.message || e) };
      discovery.push(row);
      logEdge('create.probeGET.error', row);
    }
  }

  const attempts = [
    {
      url: 'https://edge.adobe.io/ee/v2/datastreamConfigs',
      label: 'v2 datastreamConfigs + AEP service',
      body: {
        title: name,
        name,
        description,
        mappingSchemaId,
        services: [
          {
            name: 'Adobe Experience Platform',
            enabled: true,
            settings: {
              datasets: [{ id: datasetId, schema: mappingSchemaId }],
            },
          },
        ],
      },
    },
    {
      url: 'https://edge.adobe.io/ee/v1/datastreamConfigs',
      label: 'v1 datastreamConfigs + AEP service',
      body: {
        title: name,
        name,
        description,
        mappingSchemaId,
        services: [
          {
            name: 'Adobe Experience Platform',
            enabled: true,
            settings: {
              datasets: [{ id: datasetId, schema: mappingSchemaId }],
            },
          },
        ],
      },
    },
    {
      url: 'https://edge.adobe.io/ee/v2/datastreamConfigs',
      label: 'v2 JSON:API style',
      body: {
        data: {
          type: 'datastream-configs',
          attributes: {
            title: name,
            description,
            mappingSchemaId,
            services: [
              {
                name: 'Adobe Experience Platform',
                enabled: true,
                settings: {
                  datasets: [{ id: datasetId, schema: mappingSchemaId }],
                },
              },
            ],
          },
        },
      },
    },
    {
      url: 'https://edge.adobe.io/ee/v2/datastreamConfigs',
      label: 'v2 datastreamConfigs + event dataset ids',
      body: {
        title: name,
        description,
        mappingSchemaId,
        eventDatasetIds: [datasetId],
      },
    },
    {
      url: 'https://edge.adobe.io/ee/v2/datastreamConfigs',
      label: 'v2 datastreamConfigs minimal',
      body: {
        title: name,
        description,
        schemaId: mappingSchemaId,
        datasetId,
      },
    },
    {
      url: 'https://edge.adobe.io/ee/v1/edgeConfigs',
      label: 'v1 edgeConfigs',
      body: {
        title: name,
        description,
        mappingSchemaId,
        eventDatasetId: datasetId,
      },
    },
    {
      url: 'https://edge.adobe.io/experienceedge/v1/datastreamConfigs',
      label: 'experienceedge v1',
      body: {
        title: name,
        description,
        mappingSchemaId,
        eventDatasetIds: [datasetId],
      },
    },
  ];

  const errors = [];
  let attemptIndex = 0;
  for (const h of [withSandbox, baseHeaders]) {
    for (const a of attempts) {
      attemptIndex += 1;
      try {
        const bodyStr = JSON.stringify(a.body);
        logEdge('create.post.try', {
          attempt: attemptIndex,
          label: a.label,
          url: a.url,
          sandboxHeader: !!h['x-sandbox-name'],
          bodyKeys: typeof a.body === 'object' && a.body ? Object.keys(a.body).slice(0, 12) : [],
        });
        const resp = await fetch(a.url, {
          method: 'POST',
          headers: h,
          body: bodyStr,
        });
        const text = await resp.text();
        let data = {};
        try {
          data = text ? JSON.parse(text) : {};
        } catch (e) {
          data = { _parseError: String(e.message || e) };
        }
        const id = extractDatastreamIdFromCreateResponse(data);
        logEdge('create.post.result', {
          attempt: attemptIndex,
          label: a.label,
          url: a.url,
          httpStatus: resp.status,
          sandboxHeader: !!h['x-sandbox-name'],
          hasId: !!id,
          parseKeys: data && typeof data === 'object' ? Object.keys(data).slice(0, 8) : [],
          bodySnippet: bodySnippet(text, 400),
        });
        if (resp.ok && id) {
          logEdge('create.success', { datastreamId: id, label: a.label, url: a.url });
          return {
            ok: true,
            datastreamId: id,
            raw: data,
            used: { url: a.url, label: a.label, sandboxHeader: !!h['x-sandbox-name'] },
          };
        }
        errors.push({
          url: a.url,
          label: a.label,
          sandboxHeader: !!h['x-sandbox-name'],
          httpStatus: resp.status,
          detail: text.slice(0, 800),
        });
      } catch (e) {
        logEdge('create.post.exception', { attempt: attemptIndex, label: a.label, url: a.url, error: String(e.message || e) });
        errors.push({ url: a.url, label: a.label, exception: String(e.message || e) });
      }
    }
  }

  const all404 = errors.length > 0 && errors.every((e) => e.httpStatus === 404);
  const hint = all404
    ? 'All edge.adobe.io create URLs returned 404 — these paths are likely wrong or not deployed for this host. Adobe does not document a public REST create API for datastreams; create the datastream in Data Collection UI and paste the ID. Compare GET probe below with Cloud Logging.'
    : 'Edge API did not return a new datastream ID. Confirm IMS scopes include Data Collection / Edge Configuration, or create the datastream in the Data Collection UI.';

  logEdge('create.failed', { errorCount: errors.length, all404, hint: hint.slice(0, 120) });

  return {
    ok: false,
    error: hint,
    errors,
    discovery,
  };
}

module.exports = {
  buildXdm,
  buildMinimalEdgeXdm,
  buildRichEdgeXdm,
  shouldUseRichEdgeXdm,
  buildTriggerPayload,
  sendEdgeEvent,
  listDatastreams,
  createDatastreamConfig,
};
