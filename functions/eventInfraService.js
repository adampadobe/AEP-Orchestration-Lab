/**
 * Event Infrastructure — create XDM ExperienceEvent schema + dataset in a sandbox.
 * Optionally attaches **Experience Event Core v2.1** (ExperienceEvent-class field group) + ECID/Email
 * identity descriptors on `_{tenant}.identification.core.*` so the schema can be Profile-enabled in
 * the UI with **alternate primary identity** (`identityMap` per event).
 */

const SCHEMA_REGISTRY = 'https://platform.adobe.io/data/foundation/schemaregistry';
const CATALOG_BASE = 'https://platform.adobe.io/data/foundation/catalog';

const XDM_EXPERIENCE_EVENT_CLASS = 'https://ns.adobe.com/xdm/context/experienceevent';

const ACCEPT_JSON = 'application/json';
const ACCEPT_XED = 'application/vnd.adobe.xed+json;version=1';
const ACCEPT_XDM = 'application/vnd.adobe.xdm+json;version=1';

/** List responses: prefer full XED so rows include meta:intendedToExtend (xed-id profile omits it). */
const LIST_FIELDGROUP_ACCEPTS = [
  'application/vnd.adobe.xed+json',
  ACCEPT_XED,
  'application/vnd.adobe.xed-id+json',
  ACCEPT_JSON,
];

const eventEdgeService = require('./eventEdgeService');
const tagsReactorService = require('./tagsReactorService');

/** Shown after successful schema/dataset create (UI + API consumers). */
const EVENT_TOOL_IDENTITY_MAP_HINT =
  'Enable the schema for Profile in AEP: check "Use alternate primary identity" so the primary ID comes from each event\'s identityMap (anonymous: ECID primary only; known user: add Email with exactly one primary:true per event). This Event Tool sends identityMap on Edge — see ANONYMOUS_EDGE_DEMO_PATTERN.md in the repo docs folder.';

function log(sandbox, phase, detail = {}) {
  try { console.log('[eventInfra]', JSON.stringify({ sandbox, phase, ...detail })); }
  catch { console.log('[eventInfra]', sandbox, phase); }
}

/** Adobe Schema Registry errors often bury detail under report.additionalDetails. */
function extractAepErrorMessage(data, fallback) {
  const fb = String(fallback || 'Unknown error');
  if (!data || typeof data !== 'object') return fb;
  const report = data.report;
  if (report && typeof report === 'object') {
    if (Array.isArray(report.additionalDetails)) {
      const reasons = report.additionalDetails
        .map((x) => x && (x.errorReason || x.detail || x.message))
        .filter((s) => typeof s === 'string' && s.length > 0);
      if (reasons.length) return reasons.join('; ');
    }
    if (Array.isArray(report.details)) {
      const msgs = report.details
        .map((x) => x && (x.message || x.detail || x.errorReason))
        .filter((s) => typeof s === 'string' && s.length > 0);
      if (msgs.length) return msgs.join('; ');
    }
  }
  return data.detail || data.message || data.title || fb;
}

function normalizeFgTitleKey(title) {
  return String(title || '').toLowerCase().replace(/\s+/g, '');
}

function matchesInteractionDetailsLiteTitle(title) {
  const key = normalizeFgTitleKey(title);
  return key === 'interactiondetailslite' || /interactiondetailslite$/.test(key);
}

function matchesTravelHotelExperienceV1Title(title) {
  return /travel\s*[-–]?\s*hotel\s*experience\s*v1/i.test(String(title || ''));
}

function headers(token, clientId, orgId, sandbox, extra = {}) {
  return {
    Authorization: `Bearer ${token}`,
    'x-api-key': clientId,
    'x-gw-ims-org-id': orgId,
    'x-sandbox-name': sandbox,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

/* ── Schema operations ── */

async function findSchemaByTitle(token, clientId, orgId, sandbox, title) {
  const url = `${SCHEMA_REGISTRY}/tenant/schemas?limit=100&properties=title,$id,meta:altId,version,meta:class`;
  const h = headers(token, clientId, orgId, sandbox, {
    Accept: 'application/vnd.adobe.xed-id+json',
  });
  const { res, data } = await fetchJson(url, { method: 'GET', headers: h });
  if (!res.ok) return null;
  const results = data.results || [];
  return results.find((s) => String(s.title || '').trim() === title.trim()) || null;
}

/** Resolve a tenant schema by full `$id` URI (or `meta:altId`) for GET /tenant/schemas/{id}. */
async function findSchemaById(token, clientId, orgId, sandbox, schemaId) {
  const id = String(schemaId || '').trim();
  if (!id) return null;
  const enc = encodeURIComponent(id);
  const url = `${SCHEMA_REGISTRY}/tenant/schemas/${enc}`;
  const { res, data } = await fetchJson(url, {
    method: 'GET',
    headers: headers(token, clientId, orgId, sandbox, { Accept: ACCEPT_XED }),
  });
  if (!res.ok) return null;
  return data;
}

async function createEventSchema(token, clientId, orgId, sandbox, schemaTitle) {
  const body = {
    title: schemaTitle,
    type: 'object',
    description:
      'XDM ExperienceEvent schema for Edge event streaming. Created by AEP Profile Viewer Event Tool. ' +
      'After creation, enable for Real-Time Customer Profile in the AEP UI (recommended: alternate primary identity from identityMap on each payload).',
    allOf: [{ $ref: XDM_EXPERIENCE_EVENT_CLASS }],
    'meta:class': XDM_EXPERIENCE_EVENT_CLASS,
  };

  const url = `${SCHEMA_REGISTRY}/tenant/schemas`;
  const acceptOrder = [
    'application/vnd.adobe.xed+json',
    'application/vnd.adobe.xed+json;version=1',
    'application/json',
  ];

  let lastErr = 'Unknown';
  for (const accept of acceptOrder) {
    const h = headers(token, clientId, orgId, sandbox, {
      Accept: accept,
    });
    const { res, data } = await fetchJson(url, {
      method: 'POST',
      headers: h,
      body: JSON.stringify(body),
    });
    if (res.ok) {
      log(sandbox, 'createSchema.ok', { title: schemaTitle, schemaId: data.$id });
      return data;
    }
    lastErr = data.message || data.title || data.detail || res.statusText || String(res.status);
    log(sandbox, 'createSchema.try', { httpStatus: res.status, accept, err: String(lastErr).slice(0, 160) });
    if (res.status !== 415 && res.status !== 406) {
      throw new Error(`Create schema failed: ${lastErr}`);
    }
  }
  throw new Error(`Create schema failed: ${lastErr}`);
}

/* ── Experience Event Core v2.1 + identity descriptors (ExperienceEvent, alternate primary via identityMap) ── */

function parseTenantFromUri(uri) {
  const m = String(uri || '').match(/^https:\/\/ns\.adobe\.com\/([^/]+)\//);
  return m ? m[1] : null;
}

function xdmKeyFromTenantId(tenantId) {
  return tenantId ? `_${tenantId}` : '_demoemea';
}

async function discoverTenantContextForEventTool(token, clientId, orgId, sandbox) {
  const url = `${SCHEMA_REGISTRY}/tenant/schemas?limit=10&properties=title,$id,meta:altId`;
  const { res, data } = await fetchJson(url, {
    method: 'GET',
    headers: headers(token, clientId, orgId, sandbox, { Accept: 'application/vnd.adobe.xed-id+json' }),
  });
  if (!res.ok) {
    const msg = data.message || data.title || res.statusText;
    throw new Error(`Schema list failed: ${msg}`);
  }
  const results = data.results || [];
  for (const s of results) {
    const tid = parseTenantFromUri(s.$id);
    if (tid) {
      return { tenantId: tid, xdmKey: xdmKeyFromTenantId(tid), sampleSchemaId: s.$id };
    }
  }
  throw new Error(
    'No tenant XDM id found (expected a schema under https://ns.adobe.com/{tenant}/…). Create any tenant schema in this sandbox first, or import Experience Event Core v2.1.'
  );
}

async function listTenantFieldgroupsLike(token, clientId, orgId, sandbox) {
  const base = {
    Authorization: `Bearer ${token}`,
    'x-api-key': clientId,
    'x-gw-ims-org-id': orgId,
    'x-sandbox-name': sandbox,
  };
  const paths = ['/tenant/fieldgroups?limit=200', '/tenant/mixins?limit=200'];
  const accepts = LIST_FIELDGROUP_ACCEPTS;
  let lastErr = '';
  for (const pathSuffix of paths) {
    const url = `${SCHEMA_REGISTRY}${pathSuffix}`;
    for (const accept of accepts) {
      const { res, data } = await fetchJson(url, { method: 'GET', headers: { ...base, Accept: accept } });
      if (res.ok) return Array.isArray(data.results) ? data.results : [];
      lastErr = data.message || data.title || res.statusText || String(res.status);
      if (!/accept header/i.test(String(lastErr))) break;
    }
  }
  throw new Error(`Tenant field groups list failed: ${lastErr}`);
}

function mixinExtendsExperienceEventClass(m) {
  const ex = m && m['meta:intendedToExtend'];
  if (Array.isArray(ex)) {
    return ex.some((u) => String(u).toLowerCase().includes('experienceevent'));
  }
  if (typeof ex === 'string') {
    return ex.toLowerCase().includes('experienceevent');
  }
  return false;
}

/**
 * OOTB ExperienceEvent field group (not Profile Core v2 — that class is Profile).
 * Title in UI is typically "Experience Event Core v2.1".
 */
function findExperienceEventCoreV21Mixin(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const notProfile = list.filter((m) => {
    const t = String(m.title || '').toLowerCase();
    return !t.includes('profile core');
  });

  let hit = notProfile.find((m) => {
    const t = String(m.title || '').toLowerCase().replace(/\s+/g, ' ');
    const hasEE = /experience\s*event\s*core|experienceevent\s*core/.test(t);
    const has21 = t.includes('2.1');
    return hasEE && has21;
  });
  if (hit) return hit;

  hit = notProfile.find((m) => {
    const t = String(m.title || '').toLowerCase();
    return mixinExtendsExperienceEventClass(m) && t.includes('core') && t.includes('2.1');
  });
  return hit || null;
}

/** Adobe standard ExperienceEvent field group — channel on tenant `interactionDetails.core.channel`. */
function findInteractionDetailsLiteMixin(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return (
    list.find((m) => {
      if (matchesInteractionDetailsLiteTitle(m.title)) return true;
      if (!mixinExtendsExperienceEventClass(m)) return false;
      const t = String(m.title || '').toLowerCase().replace(/\s+/g, ' ');
      return /interaction\s*details\s*lite/.test(t);
    }) || null
  );
}

/** Adobe / lab "Travel - Hotel Experience v1" (ExperienceEvent) — hotel stay lifecycle fields. */
function findTravelHotelExperienceV1Mixin(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return (
    list.find((m) => matchesTravelHotelExperienceV1Title(m.title)) || null
  );
}

function isExperienceEventFieldGroupListRow(row) {
  if (!row || typeof row.$id !== 'string' || !row.$id) return false;
  if (mixinExtendsExperienceEventClass(row)) return true;
  if (matchesInteractionDetailsLiteTitle(row.title)) return true;
  if (matchesTravelHotelExperienceV1Title(row.title)) return true;
  return false;
}

const INTERACTION_DETAILS_LITE_FG_TITLE = 'Interaction Details Lite';
const TRAVEL_HOTEL_EXPERIENCE_V1_FG_TITLE = 'Travel - Hotel Experience v1';

/** Root-level `interactionDetails.core.channel` — matches Event Tool + generator payloads. */
const INTERACTION_DETAILS_LITE_EE_ROOT_PROPERTIES = {
  interactionDetails: {
    type: 'object',
    title: 'Interaction Details',
    properties: {
      core: {
        type: 'object',
        title: 'Core interaction details',
        properties: {
          channel: {
            type: 'string',
            title: 'Channel',
            description: 'Experience channel for this event (Interaction Details Lite).',
            'meta:enum': {
              web: 'Web',
              mobile: 'Mobile App',
              email: 'Email',
              pos: 'Point of Sale',
              callcentre: 'Call Centre',
              kiosk: 'Kiosk',
              agent: 'Travel Agent',
              partner: 'Partner',
            },
            'meta:xdmType': 'string',
          },
        },
        'meta:xdmType': 'object',
      },
    },
    'meta:xdmType': 'object',
  },
};

/**
 * Root-level `hotel.*` on ExperienceEvent — aligned with travel profile FG + eventGeneratorService
 * `mergeHospitalityPublicIntoHotelBookingDetails`.
 */
const TRAVEL_HOTEL_EXPERIENCE_V1_EE_ROOT_PROPERTIES = {
  hotel: {
    type: 'object',
    title: 'Hotel Experience',
    description:
      'Hotel stay lifecycle: booking details, check-in experience, in-stay services, and check-out rating.',
    properties: {
      bookingDetails: {
        type: 'object',
        title: 'Booking details',
        properties: {
          hotelName: { type: 'string', title: 'Hotel name' },
          hotelLocation: { type: 'string', title: 'Hotel location / city' },
          hotelChain: { type: 'string', title: 'Hotel chain' },
          checkInDate: { type: 'string', title: 'Check-in date', format: 'date' },
          checkOutDate: { type: 'string', title: 'Check-out date', format: 'date' },
          nightsStay: { type: 'integer', title: 'Nights this stay' },
          totalNights: { type: 'integer', title: 'Total nights past year' },
          roomType: { type: 'string', title: 'Room type' },
          rateCode: { type: 'string', title: 'Rate code' },
          roomNumber: { type: 'string', title: 'Room number' },
          confirmationNumber: { type: 'string', title: 'Confirmation number' },
          roomCost: { type: 'number', title: 'Room cost per night' },
          totalCost: { type: 'number', title: 'Total stay cost' },
        },
      },
      checkIn: {
        type: 'object',
        title: 'Check-in experience',
        properties: {
          checkInMethod: { type: 'string', title: 'Check-in method' },
          queueTime: { type: 'integer', title: 'Queue time (minutes)' },
          earlyCheckIn: { type: 'boolean', title: 'Early check-in' },
          roomReady: { type: 'boolean', title: 'Room ready on arrival' },
          upgradedRoom: { type: 'boolean', title: 'Room upgraded' },
          welcomeAmenities: { type: 'boolean', title: 'Welcome amenities provided' },
        },
      },
      housekeeping: {
        type: 'object',
        title: 'Housekeeping',
        properties: {
          doNotDisturb: { type: 'boolean', title: 'Do not disturb' },
          extraTowels: { type: 'boolean', title: 'Extra towels requested' },
          serviceRequested: { type: 'boolean', title: 'Housekeeping service requested' },
          cleanlinessRating: { type: 'integer', title: 'Cleanliness rating (1–10)' },
        },
      },
      amenities: {
        type: 'object',
        title: 'Amenity usage',
        properties: {
          amenityType: { type: 'string', title: 'Amenity type' },
          satisfactionRating: { type: 'integer', title: 'Amenity satisfaction rating (1–10)' },
        },
      },
      roomService: {
        type: 'object',
        title: 'Room service',
        properties: {
          interactionType: { type: 'string', title: 'Room service interaction type' },
          orderTotal: { type: 'number', title: 'Room service order total' },
          serviceRating: { type: 'integer', title: 'Room service rating (1–10)' },
        },
      },
      checkOut: {
        type: 'object',
        title: 'Check-out and rating',
        properties: {
          checkOutMethod: { type: 'string', title: 'Check-out method' },
          lateCheckOut: { type: 'boolean', title: 'Late check-out' },
          overallRating: { type: 'integer', title: 'Overall stay rating (1–10)' },
          finalBillAmount: { type: 'number', title: 'Final bill amount' },
          incidentalCharges: { type: 'number', title: 'Incidental charges' },
        },
      },
    },
  },
};

/**
 * Tenant ExperienceEvent field group — fields under `_{tenantId}` (AEP namespace rule).
 * Matches live sandboxes (e.g. apalmer InteractionDetails Lite) and eventGeneratorService
 * dual root + tenant payload alignment.
 */
function buildExperienceEventTenantFieldGroup(tenantId, title, description, tenantInnerProperties) {
  const tid = String(tenantId || '').trim().replace(/^_/, '');
  const tenantKey = tid ? `_${tid}` : '_demoemea';
  return {
    title,
    description,
    type: 'object',
    'meta:intendedToExtend': [XDM_EXPERIENCE_EVENT_CLASS],
    properties: {
      [tenantKey]: {
        type: 'object',
        properties: tenantInnerProperties,
        'meta:xdmType': 'object',
      },
    },
  };
}

function buildInteractionDetailsLiteExperienceEventFieldGroup(tenantId) {
  return buildExperienceEventTenantFieldGroup(
    tenantId,
    INTERACTION_DETAILS_LITE_FG_TITLE,
    'AEP Orchestration Lab — auto-created ExperienceEvent field group for tenant interactionDetails.core.channel (Interaction Details Lite).',
    INTERACTION_DETAILS_LITE_EE_ROOT_PROPERTIES
  );
}

function buildTravelHotelExperienceV1ExperienceEventFieldGroup(tenantId) {
  return buildExperienceEventTenantFieldGroup(
    tenantId,
    TRAVEL_HOTEL_EXPERIENCE_V1_FG_TITLE,
    'AEP Orchestration Lab — auto-created ExperienceEvent field group for tenant hotel stay lifecycle (booking through check-out).',
    TRAVEL_HOTEL_EXPERIENCE_V1_EE_ROOT_PROPERTIES
  );
}

async function relistTenantFieldGroupsUntilSeen(token, clientId, orgId, sandbox, expectedIds) {
  const expected = new Set((expectedIds || []).filter(Boolean).map(String));
  const BACKOFF_MS = [0, 800, 1500, 2500, 4000, 6000, 8000];
  let last = [];
  for (let i = 0; i < BACKOFF_MS.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, BACKOFF_MS[i]));
    try {
      last = await listTenantFieldgroupsLike(token, clientId, orgId, sandbox);
    } catch {
      last = [];
    }
    const seen = new Set(last.map((r) => String(r.$id || '')));
    let allSeen = true;
    for (const id of expected) {
      if (!seen.has(id)) {
        allSeen = false;
        break;
      }
    }
    if (allSeen) {
      log(sandbox, 'relistTenantFieldGroups.allSeen', { attempts: i + 1, expected: [...expected] });
      return last;
    }
  }
  log(sandbox, 'relistTenantFieldGroups.timeout', { expected: [...expected] });
  return last;
}

/**
 * Resolve Interaction Details Lite + Travel - Hotel Experience v1 for ExperienceEvent.
 * When absent from tenant/global catalogs, auto-create tenant FGs (same pattern as profile
 * infra `createIfMissing` / Event Tool booker-stayer provisioning).
 */
async function ensureRecommendedExperienceEventFieldGroups(token, clientId, orgId, sandbox) {
  /** @type {{ title: string, $id: string }[]} */
  const created = [];
  /** @type {string[]} */
  const warnings = [];
  /** @type {{ title: string, httpStatus?: number, message: string }[]} */
  const platformErrors = [];
  let merged = await listMergedExperienceEventFieldgroups(token, clientId, orgId, sandbox);
  let interactionLite = findInteractionDetailsLiteMixin(merged);
  let travelHotel = findTravelHotelExperienceV1Mixin(merged);

  let tenantId = parseTenantFromUri(interactionLite && interactionLite.$id) || parseTenantFromUri(travelHotel && travelHotel.$id);
  if (!tenantId) {
    try {
      const tenantCtx = await discoverTenantContextForEventTool(token, clientId, orgId, sandbox);
      tenantId = tenantCtx.tenantId;
    } catch (e) {
      const msg = String(e.message || e);
      warnings.push(msg);
      platformErrors.push({ title: '(tenant discovery)', message: msg });
      return {
        interactionLite,
        travelHotel,
        merged,
        created,
        warnings,
        platformErrors,
        autoProvisionAttempted: false,
      };
    }
  }

  const specs = [];
  if (!interactionLite) {
    specs.push({
      key: 'interactionLite',
      body: buildInteractionDetailsLiteExperienceEventFieldGroup(tenantId),
    });
  }
  if (!travelHotel) {
    specs.push({
      key: 'travelHotel',
      body: buildTravelHotelExperienceV1ExperienceEventFieldGroup(tenantId),
    });
  }

  /** @type {Record<string, { title?: string, $id?: string }>} */
  const createdByKey = {};
  const newIds = [];
  for (const item of specs) {
    try {
      const row = await postTenantFieldGroup(token, clientId, orgId, sandbox, item.body);
      if (row && row.$id) {
        newIds.push(String(row.$id));
        createdByKey[item.key] = row;
        created.push({ title: row.title || item.body.title, $id: String(row.$id) });
        log(sandbox, 'ensureRecommendedFg.created', { title: item.body.title, $id: row.$id });
      }
    } catch (e) {
      const msg = String(e.message || e);
      const httpStatus = e.httpStatus;
      if (/409|already exists|duplicate|conflict/i.test(msg)) {
        log(sandbox, 'ensureRecommendedFg.alreadyExists', { title: item.body.title });
        const titleMatcher =
          item.key === 'interactionLite' ? matchesInteractionDetailsLiteTitle : matchesTravelHotelExperienceV1Title;
        const existing = await findTenantExperienceEventFieldGroupByTitle(
          token,
          clientId,
          orgId,
          sandbox,
          item.body.title,
          titleMatcher
        );
        if (existing && existing.$id) createdByKey[item.key] = existing;
        continue;
      }
      const detail = httpStatus ? `HTTP ${httpStatus}: ${msg}` : msg;
      warnings.push(`Could not auto-create "${item.body.title}": ${detail.slice(0, 280)}`);
      platformErrors.push({ title: item.body.title, httpStatus, message: detail.slice(0, 400) });
      log(sandbox, 'ensureRecommendedFg.createFailed', { title: item.body.title, httpStatus, err: detail.slice(0, 280) });
    }
  }

  if (!interactionLite && createdByKey.interactionLite && createdByKey.interactionLite.$id) {
    interactionLite = createdByKey.interactionLite;
  }
  if (!travelHotel && createdByKey.travelHotel && createdByKey.travelHotel.$id) {
    travelHotel = createdByKey.travelHotel;
  }

  if (newIds.length) {
    await relistTenantFieldGroupsUntilSeen(token, clientId, orgId, sandbox, newIds);
    merged = await listMergedExperienceEventFieldgroups(token, clientId, orgId, sandbox);
    interactionLite =
      findInteractionDetailsLiteMixin(merged) || createdByKey.interactionLite || interactionLite;
    travelHotel =
      findTravelHotelExperienceV1Mixin(merged) || createdByKey.travelHotel || travelHotel;
  }

  if (!interactionLite) {
    interactionLite =
      createdByKey.interactionLite ||
      (await findTenantExperienceEventFieldGroupByTitle(
        token,
        clientId,
        orgId,
        sandbox,
        INTERACTION_DETAILS_LITE_FG_TITLE,
        matchesInteractionDetailsLiteTitle
      ));
  }
  if (!travelHotel) {
    travelHotel =
      createdByKey.travelHotel ||
      (await findTenantExperienceEventFieldGroupByTitle(
        token,
        clientId,
        orgId,
        sandbox,
        TRAVEL_HOTEL_EXPERIENCE_V1_FG_TITLE,
        matchesTravelHotelExperienceV1Title
      ));
  }

  return {
    interactionLite,
    travelHotel,
    merged,
    created,
    warnings,
    platformErrors,
    autoProvisionAttempted: specs.length > 0,
  };
}

function dedupeFieldgroupsById(rows) {
  const map = new Map();
  for (const r of rows || []) {
    if (isExperienceEventFieldGroupListRow(r)) {
      map.set(r.$id, r);
    }
  }
  return Array.from(map.values());
}

/**
 * Global OOTB field groups (ExperienceEvent-class) — used for Interaction Details Lite, Travel Hotel, etc.
 */
async function listGlobalExperienceEventFieldgroups(token, clientId, orgId, sandbox) {
  const url = `${SCHEMA_REGISTRY}/global/fieldgroups?limit=300&properties=title,$id,meta:intendedToExtend`;
  const base = {
    Authorization: `Bearer ${token}`,
    'x-api-key': clientId,
    'x-gw-ims-org-id': orgId,
    'x-sandbox-name': sandbox,
  };
  const accepts = LIST_FIELDGROUP_ACCEPTS;
  let lastErr = '';
  for (const accept of accepts) {
    const { res, data } = await fetchJson(url, { method: 'GET', headers: { ...base, Accept: accept } });
    if (res.ok) {
      const raw = Array.isArray(data.results) ? data.results : [];
      return raw.filter((m) => mixinExtendsExperienceEventClass(m));
    }
    lastErr = data.message || data.title || res.statusText || String(res.status);
    if (!/accept header/i.test(String(lastErr))) break;
  }
  throw new Error(`Global field groups list failed: ${lastErr}`);
}

/**
 * Merge tenant + global ExperienceEvent field group catalogs (deduped by $id).
 */
async function listMergedExperienceEventFieldgroups(token, clientId, orgId, sandbox) {
  let tenant = [];
  try {
    tenant = await listTenantFieldgroupsLike(token, clientId, orgId, sandbox);
  } catch {
    tenant = [];
  }
  let globalRows = [];
  try {
    globalRows = await listGlobalExperienceEventFieldgroups(token, clientId, orgId, sandbox);
  } catch {
    globalRows = [];
  }
  return dedupeFieldgroupsById([...(Array.isArray(tenant) ? tenant : []), ...globalRows]);
}

/**
 * Attach extra ExperienceEvent field groups by $ref (JSON Patch). Refetches schema between attempts.
 * @param {string[]} mixinIds
 */
async function attachFieldGroupRefsToSchema(token, clientId, orgId, sandbox, metaAltId, mixinIds) {
  const attached = [];
  const skipped = [];
  const warnings = [];
  for (const ref of mixinIds) {
    if (!ref) continue;
    const full = (await getSchemaByMetaAlt(token, clientId, orgId, sandbox, metaAltId)) || {};
    const ops = buildAddFieldGroupPatchOps(full, ref);
    if (!ops.length) {
      skipped.push(ref);
      continue;
    }
    try {
      await patchSchemaJsonPatch(token, clientId, orgId, sandbox, metaAltId, ops);
      attached.push(ref);
    } catch (e) {
      warnings.push(`${ref}: ${String(e.message || e).slice(0, 220)}`);
    }
  }
  return { attached, skipped, warnings };
}

function collectSchemaRefUris(schema) {
  const set = new Set();
  for (const x of schema.allOf || []) {
    if (x && typeof x.$ref === 'string') set.add(x.$ref);
  }
  for (const u of schema['meta:extends'] || []) {
    if (typeof u === 'string') set.add(u);
  }
  return set;
}

function buildAddFieldGroupPatchOps(fullSchema, mixinId) {
  const existing = collectSchemaRefUris(fullSchema);
  const ref = String(mixinId);
  if (existing.has(ref)) return [];
  return [
    { op: 'add', path: '/meta:extends/-', value: ref },
    { op: 'add', path: '/allOf/-', value: { $ref: ref } },
  ];
}

async function getSchemaByMetaAlt(token, clientId, orgId, sandbox, metaAltId) {
  const enc = encodeURIComponent(metaAltId);
  const url = `${SCHEMA_REGISTRY}/tenant/schemas/${enc}`;
  const { res, data } = await fetchJson(url, {
    method: 'GET',
    headers: headers(token, clientId, orgId, sandbox, { Accept: ACCEPT_XED }),
  });
  if (!res.ok) return null;
  return data;
}

async function patchSchemaJsonPatch(token, clientId, orgId, sandbox, metaAltId, operations) {
  if (!operations || operations.length === 0) return null;
  const enc = encodeURIComponent(metaAltId);
  const url = `${SCHEMA_REGISTRY}/tenant/schemas/${enc}`;
  let ifMatch = '1';
  for (let attempt = 0; attempt < 4; attempt++) {
    const full = await getSchemaByMetaAlt(token, clientId, orgId, sandbox, metaAltId);
    if (full && full.version != null) ifMatch = String(full.version);
    const { res, data } = await fetchJson(url, {
      method: 'PATCH',
      headers: {
        ...headers(token, clientId, orgId, sandbox),
        Accept: ACCEPT_JSON,
        'Content-Type': ACCEPT_JSON,
        'If-Match': ifMatch,
      },
      body: JSON.stringify(operations),
    });
    if (res.ok) return data;
    if (res.status === 412 || res.status === 428) {
      log(sandbox, 'eventInfra.patch.retry', { attempt, status: res.status });
      continue;
    }
    const msg = data.message || data.title || data.detail || res.statusText;
    throw new Error(`Schema PATCH failed: ${msg}`);
  }
  throw new Error('Schema PATCH failed: version conflict after retries');
}

async function postIdentityDescriptor(
  token,
  clientId,
  orgId,
  sandbox,
  schemaId,
  sourceVersion,
  sourceProperty,
  namespace,
  isPrimary
) {
  const body = {
    '@type': 'xdm:descriptorIdentity',
    'xdm:sourceSchema': schemaId,
    'xdm:sourceVersion': sourceVersion,
    'xdm:sourceProperty': sourceProperty,
    'xdm:namespace': namespace,
    'xdm:property': 'xdm:code',
    'xdm:isPrimary': !!isPrimary,
  };
  const url = `${SCHEMA_REGISTRY}/tenant/descriptors`;
  const base = {
    Authorization: `Bearer ${token}`,
    'x-api-key': clientId,
    'x-gw-ims-org-id': orgId,
    'x-sandbox-name': sandbox,
  };
  const attempts = [
    { 'Content-Type': ACCEPT_JSON, Accept: ACCEPT_XDM },
    { 'Content-Type': ACCEPT_JSON, Accept: ACCEPT_XED },
  ];
  let lastErr = '';
  for (const h of attempts) {
    const { res, data } = await fetchJson(url, {
      method: 'POST',
      headers: { ...base, ...h },
      body: JSON.stringify(body),
    });
    if (res.ok) return data;
    lastErr = data.message || data.title || data.detail || res.statusText;
    if (res.status === 409 || /already exists|duplicate/i.test(String(lastErr))) return { skipped: true, duplicate: true };
    if (res.status !== 415 && !/unsupported media type/i.test(String(lastErr))) {
      throw new Error(`Create identity descriptor failed: ${lastErr}`);
    }
  }
  throw new Error(`Create identity descriptor failed: ${lastErr}`);
}

/**
 * Attach Experience Event Core v2.1 + non-primary ECID/Email descriptors on tenant identification.core.*
 * so Profile UI can map namespaces; primary per event should come from identityMap (user enables alternate primary).
 */
async function attachExperienceEventCoreV21AndIdentityDescriptors(token, clientId, orgId, sandbox, schemaRow) {
  const empty = {
    experienceEventCoreV21Attached: false,
    profileCoreAttached: false,
    interactionDetailsLiteAttached: false,
    travelHotelExperienceV1Attached: false,
    hospitalityFieldGroupWarnings: [],
    identityDescriptors: 0,
    warn: null,
    tenantXdmKey: null,
  };
  const metaAltId = schemaRow['meta:altId'];
  const schemaId = schemaRow.$id;
  if (!metaAltId || !schemaId) {
    return {
      ...empty,
      warn: 'Missing meta:altId on new schema; skip Experience Event Core v2.1 attach.',
    };
  }

  let tenantCtx;
  try {
    tenantCtx = await discoverTenantContextForEventTool(token, clientId, orgId, sandbox);
  } catch (e) {
    return {
      ...empty,
      warn: String(e.message || e),
    };
  }

  let merged;
  try {
    merged = await listMergedExperienceEventFieldgroups(token, clientId, orgId, sandbox);
  } catch (e) {
    try {
      merged = await listTenantFieldgroupsLike(token, clientId, orgId, sandbox);
    } catch (e2) {
      return {
        ...empty,
        warn: String(e2.message || e2 || e.message || e),
      };
    }
  }

  const eeCore = findExperienceEventCoreV21Mixin(merged);
  if (!eeCore || !eeCore.$id) {
    return {
      ...empty,
      tenantXdmKey: tenantCtx.xdmKey,
      warn:
        'Experience Event Core v2.1 field group not found in this sandbox. In AEP: Schemas → Browse → import the standard Experience Event Core v2.1 field group, then run "Create schema" again with a new title or add the field group manually.',
    };
  }

  let full = (await getSchemaByMetaAlt(token, clientId, orgId, sandbox, metaAltId)) || schemaRow;
  const ops = buildAddFieldGroupPatchOps(full, eeCore.$id);
  let experienceEventCoreV21Attached = false;
  let experienceEventCoreWarning = null;
  if (ops.length) {
    try {
      await patchSchemaJsonPatch(token, clientId, orgId, sandbox, metaAltId, ops);
      experienceEventCoreV21Attached = true;
    } catch (e) {
      const msg = String(e.message || e);
      experienceEventCoreWarning = `Could not attach Experience Event Core v2.1 automatically (${msg.slice(0, 180)}). Add the field group in the Schema Editor if your org restricts this mixin on ExperienceEvent schemas.`;
      log(sandbox, 'eventInfra.experienceEventCore.patchFail', { err: msg.slice(0, 220) });
    }
    full = (await getSchemaByMetaAlt(token, clientId, orgId, sandbox, metaAltId)) || full;
  } else {
    experienceEventCoreV21Attached = true;
  }

  const interactionLite = findInteractionDetailsLiteMixin(merged);
  const travelHotel = findTravelHotelExperienceV1Mixin(merged);
  let hospitalityCreated = [];
  let hospitalityEnsureWarnings = [];
  let hospitalityPlatformErrors = [];
  let resolvedInteractionLite = interactionLite;
  let resolvedTravelHotel = travelHotel;
  if (!interactionLite || !travelHotel) {
    const ensured = await ensureRecommendedExperienceEventFieldGroups(token, clientId, orgId, sandbox);
    hospitalityCreated = ensured.created || [];
    hospitalityEnsureWarnings = ensured.warnings || [];
    hospitalityPlatformErrors = ensured.platformErrors || [];
    resolvedInteractionLite = ensured.interactionLite || interactionLite;
    resolvedTravelHotel = ensured.travelHotel || travelHotel;
    if (ensured.merged) merged = ensured.merged;
  }
  const extraRefs = [
    resolvedInteractionLite && resolvedInteractionLite.$id,
    resolvedTravelHotel && resolvedTravelHotel.$id,
  ].filter(Boolean);
  let interactionDetailsLiteAttached = false;
  let travelHotelExperienceV1Attached = false;
  const hospitalityFieldGroupWarnings = [...hospitalityEnsureWarnings];
  for (const c of hospitalityCreated) {
    if (c && c.title) hospitalityFieldGroupWarnings.push(`Auto-created field group "${c.title}" in this sandbox.`);
  }
  if (extraRefs.length) {
    const fgRes = await attachFieldGroupRefsToSchema(token, clientId, orgId, sandbox, metaAltId, extraRefs);
    for (const w of fgRes.warnings || []) hospitalityFieldGroupWarnings.push(w);
    if (resolvedInteractionLite && resolvedInteractionLite.$id && fgRes.attached.includes(resolvedInteractionLite.$id)) {
      interactionDetailsLiteAttached = true;
    }
    if (resolvedTravelHotel && resolvedTravelHotel.$id && fgRes.attached.includes(resolvedTravelHotel.$id)) {
      travelHotelExperienceV1Attached = true;
    }
    if (resolvedInteractionLite && resolvedInteractionLite.$id && fgRes.skipped.includes(resolvedInteractionLite.$id)) {
      interactionDetailsLiteAttached = true;
    }
    if (resolvedTravelHotel && resolvedTravelHotel.$id && fgRes.skipped.includes(resolvedTravelHotel.$id)) {
      travelHotelExperienceV1Attached = true;
    }
    if (!resolvedInteractionLite) {
      hospitalityFieldGroupWarnings.push(
        'Interaction Details Lite (ExperienceEvent) could not be resolved or auto-created — retry in a few seconds or add the field group manually in AEP if org policy blocks tenant FG creation.'
      );
    }
    if (!resolvedTravelHotel) {
      hospitalityFieldGroupWarnings.push(
        'Travel - Hotel Experience v1 (ExperienceEvent) could not be resolved or auto-created — retry in a few seconds or add the field group manually in AEP if org policy blocks tenant FG creation.'
      );
    }
    full = (await getSchemaByMetaAlt(token, clientId, orgId, sandbox, metaAltId)) || full;
  }

  const ver = Number(full.version) || 1;
  const tenant = String(tenantCtx.xdmKey || '_demoemea').replace(/^_/, '');
  const ecidPath = `/_${tenant}/identification/core/ecid`;
  const emailPath = `/_${tenant}/identification/core/email`;
  let identityDescriptors = 0;
  const pairs = [
    { path: ecidPath, ns: 'ECID', label: 'ecid' },
    { path: emailPath, ns: 'Email', label: 'email' },
  ];
  for (const p of pairs) {
    try {
      const r = await postIdentityDescriptor(token, clientId, orgId, sandbox, schemaId, ver, p.path, p.ns, false);
      if (r && (r.duplicate || r['@id'] || r['meta:altId'])) identityDescriptors += 1;
    } catch (e) {
      log(sandbox, 'eventInfra.descriptor.warn', { label: p.label, err: String(e.message || e).slice(0, 160) });
    }
  }

  return {
    experienceEventCoreV21Attached,
    /** @deprecated Same as experienceEventCoreV21Attached; kept for API consumers that still read this key. */
    profileCoreAttached: experienceEventCoreV21Attached,
    interactionDetailsLiteAttached,
    travelHotelExperienceV1Attached,
    hospitalityFieldGroupWarnings,
    hospitalityPlatformErrors,
    createdFieldGroups: hospitalityCreated,
    identityDescriptors,
    warn: experienceEventCoreWarning,
    tenantXdmKey: tenantCtx.xdmKey,
  };
}

/* ── Dataset operations ── */

function flattenDatasets(pages) {
  const rows = [];
  for (const p of pages) {
    if (!p || typeof p !== 'object') continue;
    if (Array.isArray(p.children)) rows.push(...p.children);
    if (Array.isArray(p.results)) rows.push(...p.results);
    for (const [k, v] of Object.entries(p)) {
      if (k.startsWith('_')) continue;
      if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
      if (/^[0-9a-f]{24}$/i.test(k) || typeof v.name === 'string' || v.schemaRef) {
        rows.push({ ...v, id: v.id || k });
      }
    }
  }
  return rows;
}

async function findDatasetByName(token, clientId, orgId, sandbox, name) {
  const url = `${CATALOG_BASE}/dataSets?limit=50&properties=name,schemaRef,tags&property=${encodeURIComponent(`name==${name}`)}`;
  const { res, data } = await fetchJson(url, { method: 'GET', headers: headers(token, clientId, orgId, sandbox) });
  if (!res.ok) return null;
  const rows = flattenDatasets([data]);
  return rows.find((d) => String(d.name || '') === name) || null;
}

async function createDataset(token, clientId, orgId, sandbox, schemaId, name) {
  const body = {
    name,
    description:
      'XDM ExperienceEvent dataset for Edge (AEP Event Tool). In AEP: enable for Profile when the schema uses identityMap as alternate primary; send identityMap on each event (ECID for anonymous; one primary:true per event).',
    schemaRef: {
      id: schemaId,
      contentType: 'application/vnd.adobe.xed+json;version=1',
    },
  };
  const url = `${CATALOG_BASE}/dataSets`;
  const { res, data } = await fetchJson(url, {
    method: 'POST',
    headers: {
      ...headers(token, clientId, orgId, sandbox),
      Accept: 'application/vnd.adobe.xdm+json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const msg = data.message || data.title || data.detail || res.statusText;
    throw new Error(`Create dataset failed: ${msg}`);
  }
  if (Array.isArray(data) && data[0] && typeof data[0] === 'string') {
    const m = data[0].match(/@\/dataSets\/([0-9a-fA-F]+)/);
    if (m) return { id: m[1] };
  }
  if (data && data.id) return data;
  return { id: null, raw: data };
}

/* ── Status — check what exists ── */

async function runEventInfraStatus(sandbox, token, clientId, orgId, schemaTitle, datasetName) {
  log(sandbox, 'status.start', { schemaTitle, datasetName });

  const schema = await findSchemaByTitle(token, clientId, orgId, sandbox, schemaTitle);
  const schemaFound = !!schema;
  const schemaId = schema ? schema.$id : null;
  const schemaMetaAltId = schema ? schema['meta:altId'] : null;

  let datasetFound = false;
  let datasetId = null;
  if (datasetName) {
    const ds = await findDatasetByName(token, clientId, orgId, sandbox, datasetName);
    if (ds) { datasetFound = true; datasetId = ds.id; }
  }

  log(sandbox, 'status.complete', { schemaFound, datasetFound });
  return { ok: true, sandbox, schemaFound, schemaId, schemaMetaAltId, datasetFound, datasetId };
}

/** Tenant ExperienceEvent field group: typed booker/stayer under `_{tenant}.public.bookingParty`. */
const BOOKER_STAYER_FG_TITLE = 'AEP Event Tool - Booker Stayer v1';

function xdmStringField(title) {
  return { type: 'string', title, 'meta:xdmType': 'string' };
}

function xdmBoolField(title) {
  return { type: 'boolean', title, 'meta:xdmType': 'boolean' };
}

function buildBookerStayerExperienceEventFieldGroup(tenantId) {
  const tid = String(tenantId || '').trim();
  const tk = tid.startsWith('_') ? tid : `_${tid}`;
  const personShape = {
    firstName: xdmStringField('First name'),
    lastName: xdmStringField('Last name'),
    email: xdmStringField('Email'),
    phone: xdmStringField('Phone'),
    crmId: xdmStringField('CRM ID'),
    loyaltyId: xdmStringField('Loyalty ID'),
  };
  return {
    title: BOOKER_STAYER_FG_TITLE,
    description:
      'Booker vs stayer / guest-of-record under tenant public.bookingParty. Created by AEP Orchestration Lab Event Tool.',
    type: 'object',
    'meta:intendedToExtend': [XDM_EXPERIENCE_EVENT_CLASS],
    definitions: {
      bookingPartyBlock: {
        type: 'object',
        properties: {
          [tk]: {
            type: 'object',
            properties: {
              public: {
                type: 'object',
                properties: {
                  bookingParty: {
                    type: 'object',
                    title: 'Booker / stayer',
                    properties: {
                      eventPerspective: {
                        type: 'string',
                        title: 'Primary subject of this event',
                        'meta:enum': {
                          booker: 'Booker',
                          stayer: 'Stayer',
                          both: 'Both',
                          unknown: 'Unknown',
                        },
                        'meta:xdmType': 'string',
                      },
                      bookerStayerSamePerson: xdmBoolField('Booker is the guest of record / stayer'),
                      booker: {
                        type: 'object',
                        title: 'Booker',
                        properties: {
                          ...personShape,
                          isPrimaryBooker: xdmBoolField('Primary booker'),
                        },
                        'meta:xdmType': 'object',
                      },
                      stayer: {
                        type: 'object',
                        title: 'Stayer / guest of record',
                        properties: {
                          ...personShape,
                          isGuestOfRecord: xdmBoolField('Guest of record'),
                          relationshipToBooker: xdmStringField('Relationship to booker'),
                        },
                        'meta:xdmType': 'object',
                      },
                    },
                    'meta:xdmType': 'object',
                  },
                },
                'meta:xdmType': 'object',
              },
            },
            'meta:xdmType': 'object',
          },
        },
      },
    },
    allOf: [{ $ref: '#/definitions/bookingPartyBlock', type: 'object', 'meta:xdmType': 'object' }],
  };
}

async function findTenantFieldGroupByTitle(token, clientId, orgId, sandbox, exactTitle) {
  let rows = [];
  try {
    rows = await listTenantFieldgroupsLike(token, clientId, orgId, sandbox);
  } catch {
    rows = [];
  }
  const want = String(exactTitle || '').trim();
  return (Array.isArray(rows) ? rows : []).find((r) => String(r.title || '').trim() === want) || null;
}

async function findTenantExperienceEventFieldGroupByTitle(token, clientId, orgId, sandbox, exactTitle, titleMatcher) {
  let rows = [];
  try {
    rows = await listTenantFieldgroupsLike(token, clientId, orgId, sandbox);
  } catch {
    rows = [];
  }
  const want = String(exactTitle || '').trim();
  const matchFn = typeof titleMatcher === 'function' ? titleMatcher : (t) => String(t || '').trim() === want;
  const hit = (Array.isArray(rows) ? rows : []).find((r) => matchFn(r.title));
  if (hit && hit.$id) return hit;
  return null;
}

async function postTenantFieldGroup(token, clientId, orgId, sandbox, body) {
  const url = `${SCHEMA_REGISTRY}/tenant/fieldgroups`;
  const baseHeaders = {
    Authorization: `Bearer ${token}`,
    'x-api-key': clientId,
    'x-gw-ims-org-id': orgId,
    'x-sandbox-name': sandbox,
    'Content-Type': 'application/json',
  };
  const acceptOrder = [
    'application/vnd.adobe.xed+json',
    ACCEPT_XED,
    ACCEPT_XDM,
    ACCEPT_JSON,
  ];
  let lastErr = 'Unknown';
  for (const accept of acceptOrder) {
    const { res, data } = await fetchJson(url, {
      method: 'POST',
      headers: { ...baseHeaders, Accept: accept },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      log(sandbox, 'postTenantFieldGroup.ok', { title: body.title, $id: data.$id });
      return data;
    }
    lastErr = extractAepErrorMessage(data, res.statusText || String(res.status));
    const retry =
      res.status === 415 ||
      res.status === 406 ||
      /unsupported media type|not acceptable/i.test(String(lastErr));
    if (!retry) {
      const err = new Error(`Create tenant field group failed: ${lastErr}`);
      err.httpStatus = res.status;
      err.platformError = { httpStatus: res.status, message: lastErr, body: data };
      throw err;
    }
  }
  const err = new Error(`Create tenant field group failed: ${lastErr}`);
  err.httpStatus = 0;
  err.platformError = { message: lastErr };
  throw err;
}

/* ── Combined setup (schema + field groups + dataset) ── */

const SETUP_EVENT_INFRA_SUBSTEPS = [
  { step: 'ensureFieldGroups', label: 'Field groups' },
  { step: 'createSchema', label: 'Schema' },
  { step: 'attachRecommendedFieldGroups', label: 'Attach field groups' },
  { step: 'createDataset', label: 'Dataset' },
];

async function runSetupEventInfra(sandbox, token, clientId, orgId, opts = {}) {
  const schemaTitle = String(opts.schemaTitle || '').trim();
  const datasetName = String(opts.datasetName || '').trim();
  if (!schemaTitle) return { ok: false, step: 'setupEventInfra', error: 'schemaTitle is required.' };
  if (!datasetName) return { ok: false, step: 'setupEventInfra', error: 'datasetName is required.' };

  /** @type {object[]} */
  const subSteps = [];
  let schemaId = null;
  let schemaMetaAltId = null;
  let datasetId = null;

  const ensured = await ensureRecommendedExperienceEventFieldGroups(token, clientId, orgId, sandbox);
  const fgOk = !!(ensured.interactionLite && ensured.interactionLite.$id && ensured.travelHotel && ensured.travelHotel.$id);
  subSteps.push({
    step: 'ensureFieldGroups',
    ok: fgOk,
    skipped: !ensured.autoProvisionAttempted && fgOk,
    interactionDetailsLiteId: ensured.interactionLite && ensured.interactionLite.$id ? String(ensured.interactionLite.$id) : null,
    travelHotelExperienceV1Id: ensured.travelHotel && ensured.travelHotel.$id ? String(ensured.travelHotel.$id) : null,
    createdFieldGroups: ensured.created || [],
    warnings: ensured.warnings || [],
    platformErrors: ensured.platformErrors || [],
  });
  if (!fgOk) {
    const platformDetail = (ensured.platformErrors || [])
      .map((p) => `${p.title}: ${p.message}`)
      .join(' ');
    const warningDetail = (ensured.warnings || []).join(' ');
    const detail = [platformDetail, warningDetail].filter(Boolean).join(' ');
    return {
      ok: false,
      step: 'setupEventInfra',
      subSteps,
      platformErrors: ensured.platformErrors || [],
      warnings: ensured.warnings || [],
      error:
        'Could not resolve or auto-create Interaction Details Lite and Travel - Hotel Experience v1 for ExperienceEvent. ' +
        (detail ||
          'Check Schema Registry permissions or import the field groups manually in AEP → Schemas → Browse.'),
    };
  }

  const schemaRes = await runEventInfraStep(sandbox, token, clientId, orgId, 'createSchema', { schemaTitle });
  subSteps.push({ step: 'createSchema', ...schemaRes });
  if (!schemaRes.ok) {
    return { ok: false, step: 'setupEventInfra', subSteps, error: schemaRes.error || 'createSchema failed.' };
  }
  schemaId = schemaRes.schemaId || null;
  schemaMetaAltId = schemaRes.schemaMetaAltId || null;

  const attachRes = await runEventInfraStep(sandbox, token, clientId, orgId, 'attachRecommendedFieldGroups', {
    schemaTitle,
    schemaId: schemaId || undefined,
  });
  subSteps.push({ step: 'attachRecommendedFieldGroups', ...attachRes });
  if (!attachRes.ok) {
    return {
      ok: false,
      step: 'setupEventInfra',
      subSteps,
      error: attachRes.error || 'attachRecommendedFieldGroups failed.',
      platformErrors: attachRes.platformErrors || [],
      warnings: attachRes.warnings || [],
    };
  }
  if (attachRes.schemaId) schemaId = attachRes.schemaId;
  if (attachRes.schemaMetaAltId) schemaMetaAltId = attachRes.schemaMetaAltId;

  const dsRes = await runEventInfraStep(sandbox, token, clientId, orgId, 'createDataset', { schemaTitle, datasetName });
  subSteps.push({ step: 'createDataset', ...dsRes });
  if (!dsRes.ok) {
    return { ok: false, step: 'setupEventInfra', subSteps, error: dsRes.error || 'createDataset failed.' };
  }
  datasetId = dsRes.datasetId || null;
  if (dsRes.schemaId) schemaId = dsRes.schemaId;

  const parts = ['Event infrastructure ready.'];
  if (schemaId) parts.push(`Schema ID: ${schemaId}.`);
  if (datasetId) parts.push(`Dataset ID: ${datasetId}.`);
  parts.push('Enable the schema and dataset for Profile in AEP (alternate primary from identityMap).');
  parts.push(EVENT_TOOL_IDENTITY_MAP_HINT);

  return {
    ok: true,
    step: 'setupEventInfra',
    sandbox,
    schemaTitle,
    datasetName,
    schemaId,
    schemaMetaAltId,
    datasetId,
    subSteps,
    createdFieldGroups: [
      ...(ensured.created || []),
      ...(attachRes.createdFieldGroups || []),
      ...(schemaRes.createdFieldGroups || []),
    ],
    identityMapHint: EVENT_TOOL_IDENTITY_MAP_HINT,
    message: parts.join(' '),
  };
}

/* ── Step-based provisioning ── */

async function runEventInfraStep(sandbox, token, clientId, orgId, step, opts = {}) {
  log(sandbox, 'step', { step, opts: Object.keys(opts) });

  if (step === 'createSchema') {
    const title = String(opts.schemaTitle || '').trim();
    if (!title) return { ok: false, error: 'schemaTitle is required.' };

    const existing = await findSchemaByTitle(token, clientId, orgId, sandbox, title);
    if (existing) {
      return {
        ok: true, sandbox, step, skipped: true,
        schemaId: existing.$id,
        schemaMetaAltId: existing['meta:altId'],
        message: `Schema "${title}" already exists.`,
      };
    }
    const created = await createEventSchema(token, clientId, orgId, sandbox, title);
    const attach = await attachExperienceEventCoreV21AndIdentityDescriptors(token, clientId, orgId, sandbox, created);
    const parts = [`Schema "${title}" created (ExperienceEvent class).`];
    if (attach.experienceEventCoreV21Attached) parts.push('Experience Event Core v2.1 field group attached.');
    if (attach.interactionDetailsLiteAttached) parts.push('Interaction Details Lite attached (root interactionDetails.core.channel).');
    if (attach.travelHotelExperienceV1Attached) parts.push('Travel - Hotel Experience v1 attached (maps core stay fields to hotel.bookingDetails on payloads).');
    for (const w of attach.hospitalityFieldGroupWarnings || []) {
      if (w) parts.push(`Note: ${w}`);
    }
    if (attach.identityDescriptors > 0) {
      parts.push(
        `Identity descriptors on ${attach.tenantXdmKey || 'tenant'}.identification.core.ecid / .email (not schema primary — use identityMap per event).`
      );
    }
    if (attach.warn) parts.push(`Note: ${attach.warn}`);
    parts.push(EVENT_TOOL_IDENTITY_MAP_HINT);
    return {
      ok: true,
      sandbox,
      step,
      schemaCreated: true,
      schemaId: created.$id,
      schemaMetaAltId: created['meta:altId'],
      experienceEventCoreV21Attached: !!attach.experienceEventCoreV21Attached,
      profileCoreAttached: !!attach.profileCoreAttached,
      interactionDetailsLiteAttached: !!attach.interactionDetailsLiteAttached,
      travelHotelExperienceV1Attached: !!attach.travelHotelExperienceV1Attached,
      hospitalityFieldGroupWarnings: attach.hospitalityFieldGroupWarnings || [],
      platformErrors: attach.hospitalityPlatformErrors || [],
      createdFieldGroups: attach.createdFieldGroups || [],
      identityDescriptorsCreated: Number(attach.identityDescriptors) || 0,
      experienceEventCoreWarning: attach.warn || null,
      profileCoreWarning: attach.warn || null,
      tenantXdmKey: attach.tenantXdmKey || null,
      identityMapHint: EVENT_TOOL_IDENTITY_MAP_HINT,
      message: parts.join(' '),
    };
  }

  if (step === 'attachRecommendedFieldGroups') {
    const title = String(opts.schemaTitle || '').trim();
    const schemaIdOpt = String(opts.schemaId || '').trim();
    if (!title && !schemaIdOpt) {
      return { ok: false, error: 'Provide schemaTitle or schemaId (full schema $id URI).' };
    }
    let schema = null;
    if (schemaIdOpt) {
      schema = await findSchemaById(token, clientId, orgId, sandbox, schemaIdOpt);
      if (!schema) {
        return {
          ok: false,
          error: `Schema not found for schemaId. Check the URI, sandbox (${sandbox}), and IMS org access.`,
        };
      }
    } else {
      schema = await findSchemaByTitle(token, clientId, orgId, sandbox, title);
      if (!schema) {
        return { ok: false, error: `Schema "${title}" not found. Create the schema first or check the exact title.` };
      }
    }
    const metaAltId = schema['meta:altId'];
    if (!metaAltId) {
      const ref = String(schema.$id || schemaIdOpt || title || 'schema').trim();
      return { ok: false, error: `Schema "${ref}" has no meta:altId yet — wait a few seconds after creation and retry.` };
    }
    const ensured = await ensureRecommendedExperienceEventFieldGroups(token, clientId, orgId, sandbox);
    const interactionLite = ensured.interactionLite;
    const travelHotel = ensured.travelHotel;
    const refs = [interactionLite && interactionLite.$id, travelHotel && travelHotel.$id].filter(Boolean);
    if (!refs.length) {
      const platformDetail = (ensured.platformErrors || [])
        .map((p) => `${p.title}: ${p.message}`)
        .join(' ');
      const warningDetail = (ensured.warnings || []).join(' ');
      const detail = [platformDetail, warningDetail].filter(Boolean).join(' ');
      return {
        ok: false,
        autoProvisionAttempted: !!ensured.autoProvisionAttempted,
        createdFieldGroups: ensured.created || [],
        warnings: ensured.warnings || [],
        platformErrors: ensured.platformErrors || [],
        error:
          'Could not resolve or auto-create Interaction Details Lite and Travel - Hotel Experience v1 for ExperienceEvent. ' +
          (detail ||
            'Wait a few seconds and retry — the lab creates tenant field groups when they are missing from the sandbox (same pattern as Travel/FSI profile setup).') +
          ' If this persists, check Schema Registry permissions or import the field groups manually in AEP → Schemas → Browse.',
      };
    }
    const fgRes = await attachFieldGroupRefsToSchema(token, clientId, orgId, sandbox, metaAltId, refs);
    const label = schemaIdOpt ? schema.$id || schemaIdOpt : title;
    const parts = [`Field groups processed for "${label}".`];
    if ((ensured.created || []).length) {
      parts.push(
        `Auto-created in sandbox: ${ensured.created.map((c) => c.title).join(', ')}.`,
      );
    }
    if (fgRes.attached.length) parts.push(`Attached: ${fgRes.attached.length} (${fgRes.attached.map((r) => r.split('/').pop()).join(', ')}).`);
    if (fgRes.skipped.length) parts.push(`Already present: ${fgRes.skipped.length}.`);
    for (const w of fgRes.warnings) parts.push(`Warning: ${w}`);
    for (const w of ensured.warnings || []) parts.push(`Note: ${w}`);
    if (!interactionLite) {
      parts.push('Note: Interaction Details Lite still not resolved after auto-provision — retry shortly.');
    }
    if (!travelHotel) {
      parts.push('Note: Travel - Hotel Experience v1 still not resolved after auto-provision — retry shortly.');
    }
    return {
      ok: true,
      sandbox,
      step,
      schemaTitle: String(schema.title || '').trim() || null,
      schemaId: schema.$id,
      schemaMetaAltId: metaAltId,
      attachedFieldGroupIds: fgRes.attached,
      skippedFieldGroupIds: fgRes.skipped,
      createdFieldGroups: ensured.created || [],
      autoProvisionAttempted: !!ensured.autoProvisionAttempted,
      interactionDetailsLiteFound: !!interactionLite,
      travelHotelExperienceV1Found: !!travelHotel,
      platformErrors: ensured.platformErrors || [],
      warnings: [...(fgRes.warnings || []), ...(ensured.warnings || [])],
      message: parts.join(' '),
    };
  }

  if (step === 'ensureBookerStayerFieldGroup') {
    const title = String(opts.schemaTitle || '').trim();
    const schemaIdOpt = String(opts.schemaId || '').trim();
    if (!title && !schemaIdOpt) {
      return { ok: false, error: 'Provide schemaTitle or schemaId (full schema $id URI).' };
    }
    let schema = null;
    if (schemaIdOpt) {
      schema = await findSchemaById(token, clientId, orgId, sandbox, schemaIdOpt);
    } else {
      schema = await findSchemaByTitle(token, clientId, orgId, sandbox, title);
    }
    if (!schema) {
      return { ok: false, error: 'Schema not found for the given title or schemaId.' };
    }
    const metaAltId = schema['meta:altId'];
    if (!metaAltId) {
      return { ok: false, error: 'Schema has no meta:altId yet — wait a few seconds and retry.' };
    }
    let tenantCtx;
    try {
      tenantCtx = await discoverTenantContextForEventTool(token, clientId, orgId, sandbox);
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
    let fgRow = await findTenantFieldGroupByTitle(token, clientId, orgId, sandbox, BOOKER_STAYER_FG_TITLE);
    let fieldGroupCreated = false;
    if (!fgRow) {
      try {
        const body = buildBookerStayerExperienceEventFieldGroup(tenantCtx.tenantId);
        fgRow = await postTenantFieldGroup(token, clientId, orgId, sandbox, body);
        fieldGroupCreated = true;
      } catch (e) {
        const msg = String(e.message || e);
        if (/duplicate|already exists|409/i.test(msg)) {
          fgRow = await findTenantFieldGroupByTitle(token, clientId, orgId, sandbox, BOOKER_STAYER_FG_TITLE);
        }
        if (!fgRow) {
          return { ok: false, error: msg };
        }
      }
    }
    if (!fgRow || !fgRow.$id) {
      return { ok: false, error: 'Booker/stayer field group could not be created or loaded.' };
    }
    const fgRes = await attachFieldGroupRefsToSchema(token, clientId, orgId, sandbox, metaAltId, [fgRow.$id]);
    const parts = [];
    if (fieldGroupCreated) parts.push(`Created "${BOOKER_STAYER_FG_TITLE}".`);
    else parts.push(`Field group "${BOOKER_STAYER_FG_TITLE}" already exists in this sandbox.`);
    if (fgRes.attached.length) {
      parts.push(`Attached to schema (${fgRes.attached.map((r) => r.split('/').pop()).join(', ')}).`);
    }
    if (fgRes.skipped.length) parts.push('Field group was already on the schema.');
    for (const w of fgRes.warnings) parts.push(`Warning: ${w}`);
    parts.push(
      `Payload path: ${tenantCtx.xdmKey}.public.bookingParty — use eventPerspective, booker, stayer, bookerStayerSamePerson.`,
    );
    return {
      ok: true,
      sandbox,
      step,
      fieldGroupCreated,
      fieldGroupId: fgRow.$id,
      fieldGroupTitle: BOOKER_STAYER_FG_TITLE,
      schemaId: schema.$id,
      schemaMetaAltId: metaAltId,
      tenantXdmKey: tenantCtx.xdmKey,
      attachedFieldGroupIds: fgRes.attached,
      skippedFieldGroupIds: fgRes.skipped,
      warnings: fgRes.warnings,
      message: parts.join(' '),
    };
  }

  if (step === 'createDataset') {
    const schemaTitle = String(opts.schemaTitle || '').trim();
    const datasetName = String(opts.datasetName || '').trim();
    if (!schemaTitle) return { ok: false, error: 'schemaTitle is required to find the schema.' };
    if (!datasetName) return { ok: false, error: 'datasetName is required.' };

    const schema = await findSchemaByTitle(token, clientId, orgId, sandbox, schemaTitle);
    if (!schema) {
      return { ok: false, error: `Schema "${schemaTitle}" not found. Create the schema first.` };
    }

    const existing = await findDatasetByName(token, clientId, orgId, sandbox, datasetName);
    if (existing) {
      return {
        ok: true, sandbox, step, skipped: true,
        schemaId: schema.$id,
        datasetId: existing.id,
        message: `Dataset "${datasetName}" already exists.`,
      };
    }

    const dsRes = await createDataset(token, clientId, orgId, sandbox, schema.$id, datasetName);
    return {
      ok: true,
      sandbox,
      step,
      datasetCreated: true,
      schemaId: schema.$id,
      datasetId: dsRes.id,
      identityMapHint: EVENT_TOOL_IDENTITY_MAP_HINT,
      message:
        `Dataset "${datasetName}" created. Enable for Profile in AEP when the linked schema is Profile-enabled (alternate primary from identityMap). ` +
        `Then create a datastream below or in Data Collection. ${EVENT_TOOL_IDENTITY_MAP_HINT}`,
    };
  }

  if (step === 'createDatastream') {
    const schemaTitle = String(opts.schemaTitle || '').trim();
    const datasetName = String(opts.datasetName || '').trim();
    const datastreamName = String(opts.datastreamName || '').trim() || `AEP Lab Datastream — ${sandbox}`;
    if (!schemaTitle) return { ok: false, error: 'schemaTitle is required.' };
    if (!datasetName) return { ok: false, error: 'datasetName is required.' };

    const schema = await findSchemaByTitle(token, clientId, orgId, sandbox, schemaTitle);
    if (!schema) {
      return { ok: false, error: `Schema "${schemaTitle}" not found. Create the schema first.` };
    }
    const ds = await findDatasetByName(token, clientId, orgId, sandbox, datasetName);
    if (!ds || !ds.id) {
      return { ok: false, error: `Dataset "${datasetName}" not found. Create the dataset first.` };
    }

    const created = await eventEdgeService.createDatastreamConfig(token, clientId, orgId, sandbox, {
      name: datastreamName,
      mappingSchemaId: schema.$id,
      datasetId: ds.id,
    });
    if (!created.ok) {
      log(sandbox, 'createDatastream.fail', {
        err: String(created.error || '').slice(0, 200),
        errorCount: Array.isArray(created.errors) ? created.errors.length : 0,
      });
      return {
        ok: false,
        sandbox,
        step,
        error: created.error || 'createDatastream failed',
        errors: created.errors,
        discovery: created.discovery,
      };
    }
    return {
      ok: true,
      sandbox,
      step,
      datastreamCreated: true,
      datastreamId: created.datastreamId,
      schemaId: schema.$id,
      datasetId: ds.id,
      message: `Datastream created. Edge ID: ${created.datastreamId}. In Tags, add the AEP Web SDK extension and set this Edge Configuration ID, then paste the embed URL into the lab.`,
      apiDetail: created.used || null,
    };
  }

  if (step === 'setupEventInfra') {
    return runSetupEventInfra(sandbox, token, clientId, orgId, opts);
  }

  if (step === 'probeTagsApi') {
    const r = await tagsReactorService.probeTagsApiAccess(token, clientId, orgId);
    return { sandbox, step, ...r };
  }

  return {
    ok: false,
    error: `Unknown step: ${step}. Use setupEventInfra, createSchema, attachRecommendedFieldGroups, ensureBookerStayerFieldGroup, createDataset, createDatastream, or probeTagsApi.`,
  };
}

/* ── Fetch eventType enum from schema ── */

async function fetchSchemaById(token, clientId, orgId, sandbox, schemaId, accept) {
  const h = headers(token, clientId, orgId, sandbox, { Accept: accept });
  const enc = encodeURIComponent(schemaId);
  return fetchJson(`${SCHEMA_REGISTRY}/tenant/schemas/${enc}`, { method: 'GET', headers: h });
}

async function fetchFullSchema(token, clientId, orgId, sandbox, schema) {
  const ids = [schema['meta:altId'], schema.$id].filter(Boolean);
  const acceptOrder = [
    'application/vnd.adobe.xed-full+json;version=1',
    'application/vnd.adobe.xed+json;version=1',
    'application/json',
  ];
  for (const id of ids) {
    for (const accept of acceptOrder) {
      const { res, data } = await fetchSchemaById(token, clientId, orgId, sandbox, id, accept);
      log(sandbox, 'fetchFull.try', { id: String(id).slice(0, 60), accept, status: res.status, hasProps: !!(data && data.properties) });
      if (res.ok && data && typeof data === 'object') return data;
    }
  }
  return null;
}

async function fetchGlobalEventTypes(token, clientId, orgId, sandbox) {
  const classId = 'https://ns.adobe.com/xdm/context/experienceevent';
  const accepts = [
    'application/vnd.adobe.xed-full+json;version=1',
    'application/vnd.adobe.xed+json;version=1',
  ];
  for (const accept of accepts) {
    const h = headers(token, clientId, orgId, sandbox, { Accept: accept });
    const enc = encodeURIComponent(classId);
    const { res, data } = await fetchJson(`${SCHEMA_REGISTRY}/global/classes/${enc}`, { method: 'GET', headers: h });
    log(sandbox, 'fetchGlobalClass', { status: res.status, accept, hasProps: !!(data && data.properties) });
    if (res.ok && data) {
      const types = extractEventTypes(data);
      if (types.length > 0) return types;
    }
  }
  return [];
}

function extractEventTypes(schema) {
  if (!schema || typeof schema !== 'object') return [];

  const found = new Map();
  const visited = new WeakSet();

  function walk(obj) {
    if (!obj || typeof obj !== 'object') return;
    if (visited.has(obj)) return;
    visited.add(obj);

    for (const [key, val] of Object.entries(obj)) {
      if (!val || typeof val !== 'object') continue;

      if (key === 'eventType') {
        const metaEnum = val['meta:enum'];
        if (metaEnum && typeof metaEnum === 'object') {
          for (const [k, label] of Object.entries(metaEnum)) {
            if (k && typeof k === 'string') found.set(k, String(label || k));
          }
        }
        if (Array.isArray(val.enum)) {
          for (const v of val.enum) {
            if (typeof v === 'string' && v && !found.has(v)) found.set(v, v);
          }
        }
      }

      if (Array.isArray(val)) {
        val.forEach(walk);
      } else {
        walk(val);
      }
    }
  }

  walk(schema);

  return Array.from(found.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.value.localeCompare(b.value));
}

async function fetchSchemaEventTypes(sandbox, token, clientId, orgId, schemaTitle, schemaIdOpt) {
  const title = String(schemaTitle || '').trim();
  const sid = String(schemaIdOpt || '').trim();
  log(sandbox, 'eventTypes.start', { schemaTitle: title, schemaId: sid || undefined });
  let schema = null;
  if (sid) {
    schema = await findSchemaById(token, clientId, orgId, sandbox, sid);
  } else if (title) {
    schema = await findSchemaByTitle(token, clientId, orgId, sandbox, title);
  }
  if (!schema) {
    const ref = sid || title || 'schema';
    return { ok: false, error: `Schema "${ref}" not found.`, eventTypes: [] };
  }

  const full = await fetchFullSchema(token, clientId, orgId, sandbox, schema);
  let eventTypes = [];

  if (full) {
    eventTypes = extractEventTypes(full);
    log(sandbox, 'eventTypes.fromSchema', { count: eventTypes.length, topKeys: full ? Object.keys(full).slice(0, 10) : [] });
  } else {
    log(sandbox, 'eventTypes.fullSchemaFailed');
  }

  if (eventTypes.length === 0) {
    log(sandbox, 'eventTypes.fallingBackToGlobal');
    eventTypes = await fetchGlobalEventTypes(token, clientId, orgId, sandbox);
    log(sandbox, 'eventTypes.fromGlobal', { count: eventTypes.length });
  }

  const resolvedTitle = String(schema.title || '').trim() || title || null;
  return { ok: true, schemaTitle: resolvedTitle, schemaId: schema.$id, eventTypes };
}

module.exports = {
  runEventInfraStatus,
  runEventInfraStep,
  fetchSchemaEventTypes,
  SETUP_EVENT_INFRA_SUBSTEPS,
  // Test / script helpers
  findInteractionDetailsLiteMixin,
  findTravelHotelExperienceV1Mixin,
  mixinExtendsExperienceEventClass,
  matchesInteractionDetailsLiteTitle,
  matchesTravelHotelExperienceV1Title,
  buildInteractionDetailsLiteExperienceEventFieldGroup,
  buildTravelHotelExperienceV1ExperienceEventFieldGroup,
  ensureRecommendedExperienceEventFieldGroups,
};
