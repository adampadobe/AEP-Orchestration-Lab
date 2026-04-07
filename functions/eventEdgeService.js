/**
 * Edge Event Service — builds XDM payloads and sends experience events
 * to Adobe Edge Network via the interact endpoint.
 */

const EDGE_INTERACT_BASE = 'https://server.adobedc.net/ee/v2/interact';
const EDGE_DATASTREAMS_PATHS = [
  'https://edge.adobe.io/ee/v2/datastreamConfigs',
  'https://edge.adobe.io/ee/v1/edgeConfigs',
  'https://edge.adobe.io/datastreams',
];

/* ── XDM helpers ── */

function syncDemoemeaAlias(xdm) {
  if (!xdm || typeof xdm !== 'object' || !xdm._demoemea) return;
  try { xdm.demoemea = JSON.parse(JSON.stringify(xdm._demoemea)); }
  catch { xdm.demoemea = { ...xdm._demoemea }; }
}

function mergePublicFields(demoemea, pub) {
  if (!demoemea || !pub || typeof pub !== 'object' || Array.isArray(pub)) return;
  const dest = {};
  let donationNum = null;

  const da = pub.donationAmount ?? pub.donatedAmount;
  if (da != null && da !== '') {
    const n = typeof da === 'number' ? da : Number(String(da).replace(/,/g, ''));
    if (Number.isFinite(n)) { dest.donationAmount = n; donationNum = n; }
    else dest.donationAmount = String(da).trim();
  }
  if (pub.eventRegistration != null && String(pub.eventRegistration).trim())
    dest.eventRegistration = String(pub.eventRegistration).trim();
  if (pub.donationDate != null && String(pub.donationDate).trim())
    dest.donationDate = String(pub.donationDate).trim();

  if (Object.keys(dest).length) demoemea.public = dest;
  if (donationNum != null) {
    if (!demoemea.omnichannelCdpUseCasePack) demoemea.omnichannelCdpUseCasePack = {};
    demoemea.omnichannelCdpUseCasePack.donatedAmount = donationNum;
  }
}

function mergeChannel(demoemea, channel) {
  if (!demoemea) return;
  const ch = channel == null ? '' : String(channel).trim();
  if (!ch) return;
  if (!demoemea.interactionDetails) demoemea.interactionDetails = {};
  if (!demoemea.interactionDetails.core) demoemea.interactionDetails.core = {};
  demoemea.interactionDetails.core.channel = ch;
}

/**
 * Build an XDM payload from request body fields.
 */
function buildXdm(body) {
  const b = body && typeof body === 'object' ? body : {};
  const now = (typeof b.timestamp === 'string' && b.timestamp.trim()) || new Date().toISOString();
  const _id = b._id != null ? String(b._id) : String(Date.now());
  const eventType = (b.eventType || '').trim() || 'transaction';
  const orchestrationId = (b.eventID || b.orchestrationEventID || '').trim() || '';
  const email = (b.email || '').trim();
  const ecid = b.ecid ? String(b.ecid).trim() : '';

  const _demoemea = { identification: { core: { ecid: ecid || '', email: email || '' } } };
  mergePublicFields(_demoemea, b.public);
  mergeChannel(_demoemea, b.channel);

  const identityMap = {};
  if (ecid) identityMap.ECID = [{ id: ecid, primary: true }];
  if (email) identityMap.Email = [{ id: email, primary: !ecid }];

  const xdm = {
    identityMap,
    _demoemea,
    _id,
    _experience: { campaign: { orchestration: { eventID: orchestrationId } } },
    eventType,
    timestamp: now,
  };

  const viewName = (b.viewName || '').trim();
  const viewUrl = (b.viewUrl || '').trim();
  if (viewName || viewUrl) {
    xdm.web = { webPageDetails: { URL: viewUrl, name: viewName, viewName } };
  }

  syncDemoemeaAlias(xdm);
  return xdm;
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

function buildTriggerPayload(template, ecid, email, eventType) {
  const payload = JSON.parse(JSON.stringify(template));
  const _id = `trigger-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const timestamp = new Date().toISOString();
  replacePlaceholders(payload, { ecid, email: email || '', _id, timestamp, eventType });
  if (payload.event && payload.event.xdm) {
    payload.event.xdm.identityMap = { ECID: [{ id: ecid, primary: true }] };
    if (email) payload.event.xdm.identityMap.Email = [{ id: email, primary: false }];
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
      })).filter((d) => d.id);
    } catch (e) {
      errors.push(`${url} → exception: ${e.message}`);
    }
  }
  console.log('[listDatastreams] All paths failed:', JSON.stringify(errors));
  return { items: [], errors };
}

module.exports = { buildXdm, buildTriggerPayload, sendEdgeEvent, listDatastreams };
