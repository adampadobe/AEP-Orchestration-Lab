/**
 * Event Generator: same XDM contract as aep-prototypes AEP Profile server.js
 * and aep-event-sender-bundle/send-aep-event.js, with optional alternate tenant
 * (e.g. _demosystem5) and identityMap ecid key (e.g. lowercase "ecid").
 */
'use strict';

const { readFileSync, existsSync } = require('fs');
const { join } = require('path');

const XDM_TENANT_ID = process.env.AEP_XDM_TENANT_ID || 'demoemea';
const EVENT_SCHEMA_ID =
  process.env.AEP_EVENT_GENERATOR_SCHEMA_ID ||
  process.env.AEP_EVENT_SCHEMA_ID ||
  `https://ns.adobe.com/${XDM_TENANT_ID}/schemas/9bc433dd59aeea8231b6d1a25a9d1f6de0cd3ea609aa1ebb`;
const EVENT_SCHEMA_CONTENT_TYPE = 'application/vnd.adobe.xed-full+json;version=1.0';
const EVENT_DATASET_ID = process.env.AEP_EVENT_GENERATOR_DATASET_ID || process.env.AEP_EVENT_DATASET_ID || '698f17dbf12b21fe67779cb1';
const EVENT_FLOW_ID = process.env.AEP_EVENT_GENERATOR_FLOW_ID || process.env.AEP_EVENT_FLOW_ID || 'b326ba47-fb29-4e32-a2f3-54f47c9e1ea7';
const EVENT_GENERATOR_STREAMING_URL =
  process.env.AEP_EVENT_GENERATOR_STREAMING_URL ||
  'https://dcs.adobedc.net/collection/d7824b017e820f769cb6efe11330d650136377522b4e75515fdd14102a4a9449';
const DEFAULT_SANDBOX = (process.env.AEP_EVENT_GENERATOR_SANDBOX || process.env.AEP_EVENT_SANDBOX || 'kirkham').trim() || 'kirkham';
const EDGE_INTERACT_ECID = process.env.AEP_EDGE_ECID || '62722406001178632594092146103219305888';
const DEFAULT_MIN_ORCH_ID = 'e9be0273f1c354c81ec459d439a99f2ee41e6bcad259967b6c367c7e29d0ab21';

const TARGETS_PATH = join(__dirname, 'event-generator-targets.json');

function loadEventGeneratorTargets() {
  if (!existsSync(TARGETS_PATH)) return [];
  try {
    const raw = readFileSync(TARGETS_PATH, 'utf8');
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function getXdmTenantKey(body) {
  const k = body && (body.xdmTenantKey || body.xdmTenantNamespace);
  if (k != null && typeof k === 'string' && k.trim()) return k.trim();
  return '_demoemea';
}

function getIdentityMapEcidKey(body) {
  const k = body && body.identityMapEcidKey;
  if (k != null && typeof k === 'string' && k.trim()) return k.trim();
  return 'ECID';
}

function syncXdmDemoemeaLowercaseAlias(xdm) {
  if (!xdm || typeof xdm !== 'object' || !xdm._demoemea || typeof xdm._demoemea !== 'object') return;
  try {
    xdm.demoemea = JSON.parse(JSON.stringify(xdm._demoemea));
  } catch {
    xdm.demoemea = { ...xdm._demoemea };
  }
}

/** Mirror `_foo` → `foo` for tenants that use underscore-prefixed field groups. */
function syncXdmTenantLowercaseAlias(xdm, tenantKey) {
  if (!xdm || typeof xdm !== 'object' || !tenantKey || !tenantKey.startsWith('_') || !xdm[tenantKey]) return;
  const short = tenantKey.slice(1);
  if (typeof xdm[tenantKey] !== 'object') return;
  try {
    xdm[short] = JSON.parse(JSON.stringify(xdm[tenantKey]));
  } catch {
    xdm[short] = { ...xdm[tenantKey] };
  }
}

function mergeGeneratorPublicIntoTenant(tenant, pubIn) {
  if (!tenant || !pubIn || typeof pubIn !== 'object' || Array.isArray(pubIn)) return;
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
  if (pubIn.linkUrl != null && String(pubIn.linkUrl).trim() !== '') dest.linkUrl = String(pubIn.linkUrl).trim();
  if (pubIn.ctaLabel != null && String(pubIn.ctaLabel).trim() !== '') dest.ctaLabel = String(pubIn.ctaLabel).trim();
  if (Object.keys(dest).length > 0) tenant.public = dest;

  if (donationAmountNumber != null && Number.isFinite(donationAmountNumber)) {
    if (!tenant.omnichannelCdpUseCasePack || typeof tenant.omnichannelCdpUseCasePack !== 'object') {
      tenant.omnichannelCdpUseCasePack = {};
    }
    tenant.omnichannelCdpUseCasePack.donatedAmount = donationAmountNumber;
  }
}

function mergeGeneratorInteractionDetailsChannel(tenant, channelIn) {
  if (!tenant) return;
  const ch =
    channelIn == null ? '' : typeof channelIn === 'string' ? channelIn.trim() : String(channelIn).trim();
  if (!ch) return;
  if (!tenant.interactionDetails) tenant.interactionDetails = {};
  if (!tenant.interactionDetails.core) tenant.interactionDetails.core = {};
  tenant.interactionDetails.core.channel = ch;
}

function buildEdgeInteractPayload() {
  const isoTimestamp = new Date().toISOString();
  const timestamp = String(Date.now());
  const ecid = EDGE_INTERACT_ECID;
  return {
    event: {
      xdm: {
        identityMap: { ECID: [{ id: ecid, primary: true }] },
        _experience: {
          campaign: { orchestration: { eventID: DEFAULT_MIN_ORCH_ID } },
        },
        eventType: 'transaction',
        timestamp: isoTimestamp,
        _id: timestamp,
        web: { webPageDetails: { URL: '', name: '', viewName: '' } },
        _demoemea: { identification: { core: { ecid } } },
      },
    },
  };
}

/**
 * @param {Record<string, unknown>} reqBody
 * @param {{ style?: 'full' | 'minimal', defaultOrchestrationEventID?: string }} [options]
 */
function buildEventGeneratorXdm(reqBody, options) {
  const body = reqBody && typeof reqBody === 'object' ? reqBody : {};
  const style = options && options.style === 'minimal' ? 'minimal' : 'full';
  const defaultOrch = (options && options.defaultOrchestrationEventID) || '';
  const tenantKey = getXdmTenantKey(body);
  const ecidImKey = getIdentityMapEcidKey(body);
  const useDemosystem5 = tenantKey === '_demosystem5';
  const useDemoemea = tenantKey === '_demoemea';

  if (style === 'minimal') {
    const now =
      typeof body.timestamp === 'string' && body.timestamp.trim() ? body.timestamp.trim() : new Date().toISOString();
    const _id = body._id != null ? String(body._id) : String(Date.now());
    const eventType = (body.eventType || '').trim() || 'donation.made';
    const orchestrationId =
      (body.eventID || '').trim() ||
      (body.orchestrationEventID || '').trim() ||
      defaultOrch ||
      DEFAULT_MIN_ORCH_ID;
    const email = (body.email || '').trim();
    const ecidRaw = body.ecid != null ? String(body.ecid).trim() : '';
    const ecid = ecidRaw || EDGE_INTERACT_ECID;

    /** @type {Record<string, Array<{ id: string; primary: boolean }>>} */
    const identityMap = {};
    identityMap[ecidImKey] = [{ id: ecid, primary: true }];
    if (!useDemosystem5 && email) {
      identityMap.Email = [{ id: email, primary: false }];
    }

    const tenantNode = {};
    if (useDemosystem5) {
      tenantNode.identification = { core: { ecid } };
    } else {
      tenantNode.identification = { core: { ecid, email: email || '' } };
    }
    mergeGeneratorPublicIntoTenant(tenantNode, body.public);
    mergeGeneratorInteractionDetailsChannel(tenantNode, body.channel);

    const xdm = {
      identityMap,
      [tenantKey]: tenantNode,
      _id,
      _experience: { campaign: { orchestration: { eventID: orchestrationId } } },
      eventType,
      timestamp: now,
    };
    const vName = body.viewName != null ? String(body.viewName).trim() : '';
    const vUrl = body.viewUrl != null ? String(body.viewUrl).trim() : '';
    if (vName || vUrl) {
      xdm.web = { webPageDetails: { URL: vUrl, name: vName, viewName: vName } };
    }
    if (useDemoemea) syncXdmDemoemeaLowercaseAlias(xdm);
    if (useDemosystem5) syncXdmTenantLowercaseAlias(xdm, '_demosystem5');
    return xdm;
  }

  if (useDemosystem5) {
    const now = (typeof body.timestamp === 'string' && body.timestamp.trim() && body.timestamp) || new Date().toISOString();
    const _id = body._id != null ? String(body._id) : String(Date.now());
    const eventType = (body.eventType || '').trim() || 'transaction';
    const orchestrationId =
      (body.eventID || '').trim() ||
      (body.orchestrationEventID || '').trim() ||
      defaultOrch ||
      DEFAULT_MIN_ORCH_ID;
    const ecidRaw = body.ecid != null ? String(body.ecid).trim() : '';
    const ecid = ecidRaw || EDGE_INTERACT_ECID;

    const identityMap = {};
    identityMap[ecidImKey] = [{ id: ecid, primary: true }];

    const _demosystem5 = { identification: { core: { ecid } } };
    mergeGeneratorPublicIntoTenant(_demosystem5, body.public);
    mergeGeneratorInteractionDetailsChannel(_demosystem5, body.channel);

    const xdm = {
      identityMap,
      _demosystem5,
      _id,
      _experience: { campaign: { orchestration: { eventID: orchestrationId } } },
      eventType,
      timestamp: now,
    };
    const viewName = body.viewName != null ? String(body.viewName).trim() : '';
    const viewUrl = body.viewUrl != null ? String(body.viewUrl).trim() : '';
    if (viewName || viewUrl) {
      xdm.web = { webPageDetails: { URL: viewUrl, name: viewName, viewName: viewName } };
    }
    syncXdmTenantLowercaseAlias(xdm, '_demosystem5');
    return xdm;
  }

  const payload = buildEdgeInteractPayload();
  const xdm = payload.event.xdm;
  if (body.timestamp) xdm.timestamp = body.timestamp;
  if (body._id != null) xdm._id = String(body._id);
  const orchestrationFromBody = (body.eventID || body.orchestrationEventID || '').trim();
  if (orchestrationFromBody) {
    xdm._experience.campaign.orchestration.eventID = orchestrationFromBody;
  } else if (defaultOrch) {
    xdm._experience.campaign.orchestration.eventID = defaultOrch;
  }
  if (body.eventType != null && typeof body.eventType === 'string') {
    const et = body.eventType.trim();
    if (et) xdm.eventType = et;
  }
  if (body.ecid) {
    const e = String(body.ecid);
    const k = getIdentityMapEcidKey(body);
    if (!xdm.identityMap[k] || !xdm.identityMap[k][0]) {
      xdm.identityMap[k] = [{ id: e, primary: true }];
    } else {
      xdm.identityMap[k][0].id = e;
    }
    if (xdm._demoemea && xdm._demoemea.identification && xdm._demoemea.identification.core) {
      xdm._demoemea.identification.core.ecid = e;
    }
  }
  const emailInteract = (body.email || '').trim();
  if (emailInteract) {
    if (!xdm.identityMap.Email) xdm.identityMap.Email = [{ id: emailInteract, primary: false }];
    if (!xdm._demoemea) xdm._demoemea = {};
    if (!xdm._demoemea.identification) xdm._demoemea.identification = {};
    if (!xdm._demoemea.identification.core) xdm._demoemea.identification.core = {};
    xdm._demoemea.identification.core.email = emailInteract;
  }
  const viewName = body.viewName != null ? String(body.viewName).trim() : '';
  const viewUrl = body.viewUrl != null ? String(body.viewUrl).trim() : '';
  if (viewName || viewUrl) {
    xdm.web = { webPageDetails: { URL: viewUrl, name: viewName, viewName: viewName } };
  } else {
    delete xdm.web;
  }
  mergeGeneratorPublicIntoTenant(xdm._demoemea, body.public);
  mergeGeneratorInteractionDetailsChannel(xdm._demoemea, body.channel);
  syncXdmDemoemeaLowercaseAlias(xdm);
  return xdm;
}

const RESOLVED_GENERATOR_SCHEMA_ID = process.env.AEP_EVENT_GENERATOR_SCHEMA_ID || EVENT_SCHEMA_ID;

module.exports = {
  loadEventGeneratorTargets,
  buildEventGeneratorXdm,
  EVENT_GENERATOR_STREAMING_URL,
  EVENT_GENERATOR_SCHEMA_ID: RESOLVED_GENERATOR_SCHEMA_ID,
  EVENT_DATASET_ID,
  EVENT_SCHEMA_CONTENT_TYPE,
  EVENT_GENERATOR_DATASET_ID: EVENT_DATASET_ID,
  EVENT_GENERATOR_FLOW_ID: EVENT_FLOW_ID,
  DEFAULT_SANDBOX,
  EDGE_INTERACT_ECID,
};
