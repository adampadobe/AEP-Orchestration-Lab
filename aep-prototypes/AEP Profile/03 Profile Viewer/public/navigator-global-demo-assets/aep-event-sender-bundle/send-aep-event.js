/**
 * Self-contained AEP experience-event sender (Edge datastream + optional DCS HTTP streaming).
 * Ported from Profile Viewer server.js — same XDM shapes as POST /api/events/generator.
 *
 * Requirements for Edge: Bearer token, x-api-key (IMS OAuth client id), x-gw-ims-org-id, dataStreamId on preset.
 * Requirements for DCS: Bearer token, streaming URL, x-adobe-flow-id, sandbox-name, schema + dataset ids (defaults below or env).
 *
 * @module send-aep-event
 */

import { readFileSync, existsSync } from 'fs';

// --- Defaults (override via env or auth / preset) — same fallbacks as server.js ---
const XDM_TENANT_ID = process.env.AEP_XDM_TENANT_ID || 'demoemea';

export const EVENT_SCHEMA_CONTENT_TYPE = 'application/vnd.adobe.xed-full+json;version=1.0';

export const EVENT_SCHEMA_ID =
  process.env.AEP_EVENT_GENERATOR_SCHEMA_ID ||
  process.env.AEP_EVENT_SCHEMA_ID ||
  `https://ns.adobe.com/${XDM_TENANT_ID}/schemas/9bc433dd59aeea8231b6d1a25a9d1f6de0cd3ea609aa1ebb`;

export const EVENT_DATASET_ID =
  process.env.AEP_EVENT_GENERATOR_DATASET_ID || process.env.AEP_EVENT_DATASET_ID || '698f17dbf12b21fe67779cb1';

export const EVENT_FLOW_ID =
  process.env.AEP_EVENT_GENERATOR_FLOW_ID || process.env.AEP_EVENT_FLOW_ID || 'b326ba47-fb29-4e32-a2f3-54f47c9e1ea7';

export const EVENT_GENERATOR_STREAMING_URL =
  process.env.AEP_EVENT_GENERATOR_STREAMING_URL ||
  'https://dcs.adobedc.net/collection/d7824b017e820f769cb6efe11330d650136377522b4e75515fdd14102a4a9449';

export const DEFAULT_SANDBOX =
  (process.env.AEP_EVENT_GENERATOR_SANDBOX || process.env.AEP_EVENT_SANDBOX || 'kirkham').trim() || 'production';

const DEFAULT_EDGE_ECID =
  process.env.AEP_EDGE_ECID || '62722406001178632594092146103219305888';

function buildEdgeInteractPayload(ecidFallback = DEFAULT_EDGE_ECID) {
  const isoTimestamp = new Date().toISOString();
  const timestamp = String(Date.now());
  const ecid = ecidFallback;
  return {
    event: {
      xdm: {
        identityMap: {
          ECID: [{ id: ecid, primary: true }],
        },
        _experience: {
          campaign: {
            orchestration: {
              eventID: 'e9be0273f1c354c81ec459d439a99f2ee41e6bcad259967b6c367c7e29d0ab21',
            },
          },
        },
        eventType: 'transaction',
        timestamp: isoTimestamp,
        _id: timestamp,
        web: {
          webPageDetails: {
            URL: '',
            name: '',
            viewName: '',
          },
        },
        _demoemea: {
          identification: {
            core: { ecid },
          },
        },
      },
    },
  };
}

/** Some Edge / XDM pipelines expect lowercase `demoemea` alongside `_demoemea`. */
function syncXdmDemoemeaLowercaseAlias(xdm) {
  if (!xdm || typeof xdm !== 'object' || !xdm._demoemea || typeof xdm._demoemea !== 'object') return;
  try {
    xdm.demoemea = JSON.parse(JSON.stringify(xdm._demoemea));
  } catch {
    xdm.demoemea = { ...xdm._demoemea };
  }
}

function mergeGeneratorPublicIntoDemoemea(_demoemea, pubIn) {
  if (!_demoemea || !pubIn || typeof pubIn !== 'object' || Array.isArray(pubIn)) return;
  const dest = {};
  let donationAmountNumber = null;
  const da = pubIn.donationAmount;
  const donatedOnly = pubIn.donatedAmount;
  if (da != null && da !== '') {
    if (typeof da === 'number' && Number.isFinite(da)) {
      dest.donationAmount = da;
      donationAmountNumber = da;
    } else {
      const n = Number(String(da).replace(/,/g, ''));
      dest.donationAmount = Number.isFinite(n) && !Number.isNaN(n) ? n : String(da).trim();
      if (Number.isFinite(n) && !Number.isNaN(n)) donationAmountNumber = n;
    }
  } else if (donatedOnly != null && donatedOnly !== '') {
    const n =
      typeof donatedOnly === 'number' && Number.isFinite(donatedOnly)
        ? donatedOnly
        : Number(String(donatedOnly).replace(/,/g, ''));
    if (Number.isFinite(n) && !Number.isNaN(n)) {
      dest.donationAmount = n;
      donationAmountNumber = n;
    }
  }
  const er = pubIn.eventRegistration;
  if (er != null && String(er).trim() !== '') dest.eventRegistration = String(er).trim();
  const dd = pubIn.donationDate;
  if (dd != null && String(dd).trim() !== '') dest.donationDate = String(dd).trim();
  if (Object.keys(dest).length > 0) _demoemea.public = dest;

  if (donationAmountNumber != null && Number.isFinite(donationAmountNumber)) {
    if (!_demoemea.omnichannelCdpUseCasePack || typeof _demoemea.omnichannelCdpUseCasePack !== 'object') {
      _demoemea.omnichannelCdpUseCasePack = {};
    }
    _demoemea.omnichannelCdpUseCasePack.donatedAmount = donationAmountNumber;
  }
}

function mergeGeneratorInteractionDetailsChannel(_demoemea, channelIn) {
  if (!_demoemea) return;
  const ch =
    channelIn == null ? '' : typeof channelIn === 'string' ? channelIn.trim() : String(channelIn).trim();
  if (!ch) return;
  if (!_demoemea.interactionDetails) _demoemea.interactionDetails = {};
  if (!_demoemea.interactionDetails.core) _demoemea.interactionDetails.core = {};
  _demoemea.interactionDetails.core.channel = ch;
}

/**
 * @param {Record<string, unknown>} reqBody
 * @param {{ style?: 'full' | 'minimal', defaultOrchestrationEventID?: string, defaultEcid?: string }} [options]
 */
export function buildEventGeneratorXdm(reqBody, options = {}) {
  const body = reqBody && typeof reqBody === 'object' ? reqBody : {};
  const style = options.style === 'minimal' ? 'minimal' : 'full';
  const fallbackEcid = options.defaultEcid || DEFAULT_EDGE_ECID;

  if (style === 'minimal') {
    const now =
      typeof body.timestamp === 'string' && body.timestamp.trim()
        ? body.timestamp.trim()
        : new Date().toISOString();
    const _id = body._id != null ? String(body._id) : String(Date.now());
    const eventType = (body.eventType || '').trim() || 'donation.made';
    const orchestrationId =
      (body.eventID || '').trim() ||
      (body.orchestrationEventID || '').trim() ||
      (options.defaultOrchestrationEventID || '').trim() ||
      'e9be0273f1c354c81ec459d439a99f2ee41e6bcad259967b6c367c7e29d0ab21';
    const email = (body.email || '').trim();
    const ecidRaw = body.ecid != null ? String(body.ecid).trim() : '';
    const ecid = ecidRaw || fallbackEcid;
    const _demoemea = {
      identification: {
        core: {
          ecid,
          email: email || '',
        },
      },
    };
    mergeGeneratorPublicIntoDemoemea(_demoemea, body.public);
    mergeGeneratorInteractionDetailsChannel(_demoemea, body.channel);
    /** @type {Record<string, Array<{ id: string; primary: boolean }>>} */
    const identityMap = {
      ECID: [{ id: ecid, primary: true }],
    };
    if (email) {
      identityMap.Email = [{ id: email, primary: false }];
    }
    const xdm = {
      identityMap,
      _demoemea,
      _id,
      _experience: {
        campaign: {
          orchestration: { eventID: orchestrationId },
        },
      },
      eventType,
      timestamp: now,
    };
    syncXdmDemoemeaLowercaseAlias(xdm);
    return xdm;
  }

  const payload = buildEdgeInteractPayload(fallbackEcid);
  const xdm = payload.event.xdm;
  if (body.timestamp) xdm.timestamp = body.timestamp;
  if (body._id != null) xdm._id = String(body._id);
  if (body.eventID) xdm._experience.campaign.orchestration.eventID = body.eventID;
  if (body.eventType != null && typeof body.eventType === 'string') {
    const et = body.eventType.trim();
    if (et) xdm.eventType = et;
  }
  if (body.ecid) {
    const ecid = String(body.ecid);
    if (!xdm.identityMap.ECID || !xdm.identityMap.ECID[0]) {
      xdm.identityMap.ECID = [{ id: ecid, primary: true }];
    } else {
      xdm.identityMap.ECID[0].id = ecid;
    }
    xdm._demoemea.identification.core.ecid = ecid;
  }
  const emailInteract = (body.email || '').trim();
  if (emailInteract) {
    xdm.identityMap.Email = [{ id: emailInteract, primary: false }];
    if (!xdm._demoemea) xdm._demoemea = {};
    if (!xdm._demoemea.identification) xdm._demoemea.identification = {};
    if (!xdm._demoemea.identification.core) xdm._demoemea.identification.core = {};
    xdm._demoemea.identification.core.email = emailInteract;
  }
  const viewName = body.viewName != null ? String(body.viewName).trim() : '';
  const viewUrl = body.viewUrl != null ? String(body.viewUrl).trim() : '';
  if (viewName || viewUrl) {
    xdm.web = {
      webPageDetails: {
        URL: viewUrl,
        name: viewName,
        viewName: viewName,
      },
    };
  } else {
    delete xdm.web;
  }
  mergeGeneratorPublicIntoDemoemea(xdm._demoemea, body.public);
  mergeGeneratorInteractionDetailsChannel(xdm._demoemea, body.channel);
  syncXdmDemoemeaLowercaseAlias(xdm);
  return xdm;
}

/**
 * @param {string} filePath absolute or cwd-relative path to event-generator-targets.json
 * @returns {Array<Record<string, unknown>>}
 */
export function loadPresetsFromFile(filePath) {
  if (!existsSync(filePath)) return [];
  try {
    const raw = readFileSync(filePath, 'utf8');
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/**
 * Pick preset by id, or first preset if id missing / not found.
 * @param {Array<Record<string, unknown>>} presets
 * @param {string} [targetId]
 */
export function resolvePreset(presets, targetId) {
  const want = (targetId || '').trim();
  let preset = presets.find((t) => t && typeof t === 'object' && t.id === want);
  if (!preset && presets.length) preset = presets[0];
  return preset || null;
}

/**
 * @typedef {{ token: string, clientId: string, orgId: string, sandbox?: string }} GeneratorAuth
 * Edge requires token + clientId (x-api-key) + orgId. DCS uses token + sandbox; flow id from env/constants unless preset adds later.
 */

/**
 * Same contract as Profile Viewer POST /api/events/generator.
 *
 * @param {Record<string, unknown>} requestBody — email (required), eventType, ecid, viewName, viewUrl, channel, public, targetId (ignored here; pass preset separately)
 * @param {GeneratorAuth} auth
 * @param {Record<string, unknown>} preset — one object from event-generator-targets.json
 * @returns {Promise<{ ok: boolean, message?: string, error?: string, transport?: string, requestId?: string | null, eventId?: string, edgeUrl?: string, streamingUrl?: string, targetId?: string, edgeStatus?: number, edgeBody?: string, streamingResponse?: unknown }>}
 */
export async function sendGeneratorEvent(requestBody, auth, preset) {
  const email = (requestBody?.email || '').trim();
  if (!email) {
    return { ok: false, error: 'Missing email.' };
  }
  if (!preset || typeof preset !== 'object') {
    return { ok: false, error: 'Missing preset (datastream / streaming config).' };
  }
  const token = (auth?.token || '').trim();
  if (!token) {
    return { ok: false, error: 'Missing Bearer token.' };
  }
  const clientId = (auth?.clientId || '').trim();
  const orgId = (auth?.orgId || '').trim();
  const sandbox = (auth?.sandbox || DEFAULT_SANDBOX).trim() || DEFAULT_SANDBOX;

  const transport = (preset.transport || 'dcs').toLowerCase() === 'edge' ? 'edge' : 'dcs';

  try {
    if (transport === 'edge') {
      if (!preset.dataStreamId || typeof preset.dataStreamId !== 'string') {
        return { ok: false, error: 'Preset is missing dataStreamId.' };
      }
      if (!clientId || !orgId) {
        return { ok: false, error: 'Edge transport requires auth.clientId (x-api-key) and auth.orgId (x-gw-ims-org-id).' };
      }
      const xdmStyle = preset.xdmStyle === 'minimal' ? 'minimal' : 'full';
      const xdm = buildEventGeneratorXdm(requestBody, {
        style: xdmStyle,
        defaultOrchestrationEventID: preset.defaultOrchestrationEventID || '',
      });
      const edgeBase = (preset.edgeInteractBase || 'https://server.adobedc.net/ee/v2/interact').split('?')[0];
      const edgeUrl = `${edgeBase}?dataStreamId=${encodeURIComponent(preset.dataStreamId)}`;
      const payload = { event: { xdm } };
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'x-api-key': clientId,
        'x-gw-ims-org-id': orgId,
      };
      const edgeRes = await fetch(edgeUrl, { method: 'POST', headers, body: JSON.stringify(payload) });
      const text = await edgeRes.text();
      let data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch (_) {}
      if (!edgeRes.ok) {
        const msg =
          data.message ||
          data.title ||
          data.detail ||
          data.error ||
          text.slice(0, 200) ||
          `Edge ${edgeRes.status}`;
        return {
          ok: false,
          error: msg,
          edgeStatus: edgeRes.status,
          edgeBody: text.slice(0, 500),
          edgeUrl,
          targetId: preset.id,
        };
      }
      return {
        ok: true,
        message: 'Event sent to Edge interact.',
        transport: 'edge',
        edgeUrl,
        requestId: data.requestId || null,
        targetId: preset.id,
      };
    }

    const xdm = buildEventGeneratorXdm(requestBody, { style: 'full' });
    const idStr = xdm._id != null ? String(xdm._id) : `event-${Date.now()}`;
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
        schemaRef: { id: EVENT_SCHEMA_ID, contentType: EVENT_SCHEMA_CONTENT_TYPE },
        imsOrgId: orgId,
        datasetId: EVENT_DATASET_ID,
        source: { name: 'AEP event sender bundle' },
      },
      body: {
        xdmMeta: { schemaRef: { id: EVENT_SCHEMA_ID, contentType: EVENT_SCHEMA_CONTENT_TYPE } },
        xdmEntity,
      },
    };
    const streamUrl =
      (preset.streamingUrl && String(preset.streamingUrl).trim()) || EVENT_GENERATOR_STREAMING_URL;
    const streamRes = await fetch(streamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'sandbox-name': sandbox,
        Authorization: `Bearer ${token}`,
        'x-adobe-flow-id': EVENT_FLOW_ID,
      },
      body: JSON.stringify(streamEnvelope),
    });
    const text = await streamRes.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch (_) {}
    if (!streamRes.ok) {
      return {
        ok: false,
        error: data.message || data.title || data.detail || data.report?.message || `Streaming ${streamRes.status}`,
        streamingResponse: data,
        streamingUrl: streamUrl,
        targetId: preset.id,
      };
    }
    return {
      ok: true,
      message: 'Event sent to AEP (streaming).',
      eventId: xdmEntity['@id'],
      streamingUrl: streamUrl,
      targetId: preset.id,
      transport: 'dcs',
    };
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
}
