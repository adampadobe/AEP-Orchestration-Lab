/**
 * Event Infrastructure — create XDM ExperienceEvent schema + dataset in a sandbox.
 * Optionally attaches **Experience Event Core v2.1** (ExperienceEvent-class field group),
 * **Interaction Details Lite**, **B2C Event Identity v1**, and non-primary ECID/Email identity descriptors on
 * `_{tenant}.identification.core.*` so the schema can be Profile-enabled in the UI with
 * **alternate primary identity** (`identityMap` per event).
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
const { buildAddProfileUnionPatchOps } = require('./profileInfraFactory');
const {
  EVENT_INDUSTRY_PUBLIC_FG_TITLE,
  buildEventIndustryPublicV1ExperienceEventFieldGroup,
} = require('./eventIndustryFieldGroups');

const ADOBE_SIPHON_TABLE_FORMAT_KEY = 'adobe/siphon/table/format';
const ADOBE_SIPHON_TABLE_FORMAT_VALUE = ['delta'];

const PROFILE_UNION_VERIFY_BACKOFF_MS = [0, 500, 1000, 1500, 2500, 4000];

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

/** Debug / investigation FGs must never be resolved or attached (e.g. "AEP Lab Test … DEBUG"). */
function isExcludedDebugFieldGroupTitle(title) {
  const t = String(title || '');
  return /\bdebug\b/i.test(t) || /aep\s*lab\s*test/i.test(t);
}

function isGlobalAdobeFieldGroup(row) {
  return /^https:\/\/ns\.adobe\.com\/xdm\//.test(String(row && row.$id ? row.$id : ''));
}

function matchesInteractionDetailsLiteTitle(title) {
  if (isExcludedDebugFieldGroupTitle(title)) return false;
  const key = normalizeFgTitleKey(title);
  return key === 'interactiondetailslite' || /interactiondetailslite$/.test(key);
}

function isInteractionDetailsLiteCandidate(row) {
  if (!row || typeof row.$id !== 'string' || !row.$id) return false;
  if (isExcludedDebugFieldGroupTitle(row.title)) return false;
  if (matchesInteractionDetailsLiteTitle(row.title)) return true;
  if (!mixinExtendsExperienceEventClass(row)) return false;
  const t = String(row.title || '').toLowerCase().replace(/\s+/g, ' ');
  return /interaction\s*details\s*lite/.test(t);
}

function matchesTravelHotelExperienceV1Title(title) {
  return /travel\s*[-–]?\s*hotel\s*experience\s*v1/i.test(String(title || ''));
}

function matchesB2cEventIdentityV1Title(title) {
  const key = normalizeFgTitleKey(title);
  return key === 'b2ceventidentityv1' || /b2ceventidentityv1$/.test(key);
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

/**
 * Identity descriptor targets for Event Tool ExperienceEvent schemas.
 * ECID + Email are secondary on tenant identification.core.* — schema primary comes from identityMap per event.
 * @param {string} tenantXdmKey e.g. `_demoemea` or `_prisacar`
 * @returns {{ path: string, namespace: string, isPrimary: boolean, label: string }[]}
 */
function buildEventSchemaIdentityDescriptorPairs(tenantXdmKey) {
  const tenant = String(tenantXdmKey || '_demoemea').replace(/^_/, '');
  const base = `/_${tenant}/identification/core`;
  return [
    { path: `${base}/ecid`, namespace: 'ECID', isPrimary: false, label: 'ecid' },
    { path: `${base}/email`, namespace: 'Email', isPrimary: false, label: 'email' },
  ];
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

/** Adobe standard ExperienceEvent field group — tenant `interactionDetails.core.{channel,deviceType,source}`. */
function findInteractionDetailsLiteMixin(rows) {
  const candidates = (Array.isArray(rows) ? rows : []).filter(isInteractionDetailsLiteCandidate);
  if (!candidates.length) return null;
  const exactTitle = candidates.filter((m) => normalizeFgTitleKey(m.title) === 'interactiondetailslite');
  if (exactTitle.length) {
    const globalExact = exactTitle.find(isGlobalAdobeFieldGroup);
    return globalExact || exactTitle[0];
  }
  const global = candidates.find(isGlobalAdobeFieldGroup);
  return global || candidates[0];
}

/** Adobe / lab "Travel - Hotel Experience v1" (ExperienceEvent) — hotel stay lifecycle fields. */
function findTravelHotelExperienceV1Mixin(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return (
    list.find((m) => matchesTravelHotelExperienceV1Title(m.title)) || null
  );
}

/** Adobe / lab "B2C Event Identity v1" (ExperienceEvent) — tenant identification.core.* for ECID, Email, etc. */
function findB2cEventIdentityV1Mixin(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return (
    list.find((m) => {
      if (matchesB2cEventIdentityV1Title(m.title)) return true;
      if (!mixinExtendsExperienceEventClass(m)) return false;
      const t = String(m.title || '').toLowerCase().replace(/\s+/g, ' ');
      return /b2c\s*event\s*identity\s*v1/.test(t);
    }) || null
  );
}

function isExperienceEventFieldGroupListRow(row) {
  if (!row || typeof row.$id !== 'string' || !row.$id) return false;
  if (mixinExtendsExperienceEventClass(row)) return true;
  if (matchesInteractionDetailsLiteTitle(row.title)) return true;
  if (matchesTravelHotelExperienceV1Title(row.title)) return true;
  if (matchesB2cEventIdentityV1Title(row.title)) return true;
  return false;
}

/** Required ExperienceEvent field groups for Event Tool / lab_setup_event_infra parity (titles). */
const REQUIRED_EVENT_EXPERIENCE_FIELD_GROUP_TITLES = [
  'Interaction Details Lite',
  'B2C Event Identity v1',
];

const INTERACTION_DETAILS_LITE_FG_TITLE = 'Interaction Details Lite';
const TRAVEL_HOTEL_EXPERIENCE_V1_FG_TITLE = 'Travel - Hotel Experience v1';
const B2C_EVENT_IDENTITY_V1_FG_TITLE = 'B2C Event Identity v1';

function xdmStringField(title) {
  return { type: 'string', title, 'meta:xdmType': 'string' };
}

function xdmBoolField(title) {
  return { type: 'boolean', title, 'meta:xdmType': 'boolean' };
}

/** Tenant `interactionDetails.core.*` — matches apalmer Event Tool reference + generator payloads. */
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
          deviceType: xdmStringField('Device type'),
          source: xdmStringField('Source'),
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
    'AEP Orchestration Lab — auto-created ExperienceEvent field group for tenant interactionDetails.core (channel, deviceType, source).',
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

/** Tenant `identification.core.*` — aligned with AEP Event Tool reference schema + identity descriptors. */
const B2C_EVENT_IDENTITY_V1_EE_TENANT_INNER = {
  identification: {
    type: 'object',
    title: 'Identification',
    properties: {
      core: {
        type: 'object',
        title: 'Core identification',
        properties: {
          ecid: xdmStringField('Experience Cloud ID (ECID)'),
          email: xdmStringField('Email address'),
          crmId: xdmStringField('CRM ID'),
          emailIdSha256: xdmStringField('Email SHA256'),
          gaid: xdmStringField('Google Advertising ID'),
          loyaltyId: xdmStringField('Loyalty ID'),
          passportId: xdmStringField('Passport ID'),
          phoneNumber: xdmStringField('Phone number'),
          pushTokens: {
            type: 'array',
            title: 'Push tokens',
            items: { type: 'string', 'meta:xdmType': 'string' },
            'meta:xdmType': 'array',
          },
          stackchatId: xdmStringField('Stackchat ID'),
        },
        'meta:xdmType': 'object',
      },
    },
    'meta:xdmType': 'object',
  },
};

function buildB2cEventIdentityV1ExperienceEventFieldGroup(tenantId) {
  return buildExperienceEventTenantFieldGroup(
    tenantId,
    B2C_EVENT_IDENTITY_V1_FG_TITLE,
    'AEP Orchestration Lab — auto-created ExperienceEvent field group for tenant identification.core (B2C Event Identity v1).',
    B2C_EVENT_IDENTITY_V1_EE_TENANT_INNER
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
 * Resolve Interaction Details Lite and B2C Event Identity v1 for ExperienceEvent.
 * When absent from tenant/global catalogs, auto-create tenant FGs (same pattern as profile infra `createIfMissing`).
 * Industry-specific FGs (Travel - Hotel Experience v1, Booker/Stayer) are optional — use dedicated steps or travel profile infra.
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
  let b2cEventIdentity = findB2cEventIdentityV1Mixin(merged);

  let tenantId =
    parseTenantFromUri(interactionLite && interactionLite.$id) ||
    parseTenantFromUri(b2cEventIdentity && b2cEventIdentity.$id);
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
        b2cEventIdentity,
        merged,
        created,
        warnings,
        platformErrors,
        autoProvisionAttempted: false,
      };
    }
  }

  const titleMatcherByKey = {
    interactionLite: matchesInteractionDetailsLiteTitle,
    b2cEventIdentity: matchesB2cEventIdentityV1Title,
  };

  const specs = [];
  if (!interactionLite) {
    specs.push({
      key: 'interactionLite',
      body: buildInteractionDetailsLiteExperienceEventFieldGroup(tenantId),
    });
  }
  if (!b2cEventIdentity) {
    specs.push({
      key: 'b2cEventIdentity',
      body: buildB2cEventIdentityV1ExperienceEventFieldGroup(tenantId),
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
        const titleMatcher = titleMatcherByKey[item.key];
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
  if (!b2cEventIdentity && createdByKey.b2cEventIdentity && createdByKey.b2cEventIdentity.$id) {
    b2cEventIdentity = createdByKey.b2cEventIdentity;
  }

  if (newIds.length) {
    await relistTenantFieldGroupsUntilSeen(token, clientId, orgId, sandbox, newIds);
    merged = await listMergedExperienceEventFieldgroups(token, clientId, orgId, sandbox);
    interactionLite =
      findInteractionDetailsLiteMixin(merged) || createdByKey.interactionLite || interactionLite;
    b2cEventIdentity =
      findB2cEventIdentityV1Mixin(merged) || createdByKey.b2cEventIdentity || b2cEventIdentity;
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
  if (!b2cEventIdentity) {
    b2cEventIdentity =
      createdByKey.b2cEventIdentity ||
      (await findTenantExperienceEventFieldGroupByTitle(
        token,
        clientId,
        orgId,
        sandbox,
        B2C_EVENT_IDENTITY_V1_FG_TITLE,
        matchesB2cEventIdentityV1Title
      ));
  }

  return {
    interactionLite,
    b2cEventIdentity,
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

/** JSON Patch ops to detach a field group mixin from a schema (highest index first). */
function buildRemoveFieldGroupPatchOps(fullSchema, mixinId) {
  const ref = String(mixinId);
  const ops = [];
  const allOf = fullSchema.allOf || [];
  for (let i = allOf.length - 1; i >= 0; i--) {
    if (allOf[i] && allOf[i].$ref === ref) {
      ops.push({ op: 'remove', path: `/allOf/${i}` });
    }
  }
  const extendsList = fullSchema['meta:extends'] || [];
  for (let i = extendsList.length - 1; i >= 0; i--) {
    if (extendsList[i] === ref) {
      ops.push({ op: 'remove', path: `/meta:extends/${i}` });
    }
  }
  return ops;
}

/**
 * Field group $refs on a schema that look like Interaction Details Lite but are debug/test artifacts.
 * @param {object} schema
 * @param {object[]} mergedRows
 * @returns {string[]}
 */
function findWrongInteractionDetailsLiteRefsOnSchema(schema, mergedRows) {
  const byId = new Map((mergedRows || []).filter((r) => r && r.$id).map((r) => [String(r.$id), r]));
  const wrong = [];
  for (const ref of collectSchemaRefUris(schema)) {
    const row = byId.get(ref);
    if (!row) continue;
    if (isExcludedDebugFieldGroupTitle(row.title)) wrong.push(ref);
  }
  return wrong;
}

async function detachWrongInteractionDetailsLiteFromSchema(token, clientId, orgId, sandbox, metaAltId, schema, mergedRows) {
  const wrongRefs = findWrongInteractionDetailsLiteRefsOnSchema(schema, mergedRows);
  if (!wrongRefs.length) return { schema, removed: [], warnings: [] };
  const removeOps = [];
  for (const ref of wrongRefs) {
    removeOps.push(...buildRemoveFieldGroupPatchOps(schema, ref));
  }
  if (!removeOps.length) return { schema, removed: [], warnings: [] };
  await patchSchemaJsonPatch(token, clientId, orgId, sandbox, metaAltId, removeOps);
  const refreshed = (await getSchemaByMetaAlt(token, clientId, orgId, sandbox, metaAltId)) || schema;
  const titles = wrongRefs.map((ref) => {
    const row = (mergedRows || []).find((r) => String(r.$id) === ref);
    return row && row.title ? String(row.title) : ref;
  });
  return {
    schema: refreshed,
    removed: wrongRefs,
    warnings: [
      `Detached debug Interaction Details field group(s) from schema: ${titles.join(', ')}. Attaching correct Interaction Details Lite mixin.`,
    ],
  };
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
    b2cEventIdentityV1Attached: false,
    recommendedFieldGroupWarnings: [],
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

  let interactionRepairWarnings = [];
  const repair = await detachWrongInteractionDetailsLiteFromSchema(
    token,
    clientId,
    orgId,
    sandbox,
    metaAltId,
    full,
    merged
  );
  full = repair.schema;
  interactionRepairWarnings = repair.warnings || [];
  if ((repair.removed || []).length) {
    log(sandbox, 'eventInfra.interactionLite.repair', { removed: repair.removed });
  }

  const interactionLite = findInteractionDetailsLiteMixin(merged);
  const b2cEventIdentity = findB2cEventIdentityV1Mixin(merged);
  let recommendedCreated = [];
  let recommendedEnsureWarnings = [];
  let recommendedPlatformErrors = [];
  let resolvedInteractionLite = interactionLite;
  let resolvedB2cEventIdentity = b2cEventIdentity;
  if (!interactionLite || !b2cEventIdentity) {
    const ensured = await ensureRecommendedExperienceEventFieldGroups(token, clientId, orgId, sandbox);
    recommendedCreated = ensured.created || [];
    recommendedEnsureWarnings = ensured.warnings || [];
    recommendedPlatformErrors = ensured.platformErrors || [];
    resolvedInteractionLite = ensured.interactionLite || interactionLite;
    resolvedB2cEventIdentity = ensured.b2cEventIdentity || b2cEventIdentity;
    if (ensured.merged) merged = ensured.merged;
  }

  const extraRefs = [
    resolvedInteractionLite && resolvedInteractionLite.$id,
    resolvedB2cEventIdentity && resolvedB2cEventIdentity.$id,
  ].filter(Boolean);
  let interactionDetailsLiteAttached = false;
  let b2cEventIdentityV1Attached = false;
  const recommendedFieldGroupWarnings = [...recommendedEnsureWarnings, ...interactionRepairWarnings];
  for (const c of recommendedCreated) {
    if (c && c.title) recommendedFieldGroupWarnings.push(`Auto-created field group "${c.title}" in this sandbox.`);
  }
  if (extraRefs.length) {
    const fgRes = await attachFieldGroupRefsToSchema(token, clientId, orgId, sandbox, metaAltId, extraRefs);
    for (const w of fgRes.warnings || []) recommendedFieldGroupWarnings.push(w);
    if (resolvedInteractionLite && resolvedInteractionLite.$id && fgRes.attached.includes(resolvedInteractionLite.$id)) {
      interactionDetailsLiteAttached = true;
    }
    if (resolvedB2cEventIdentity && resolvedB2cEventIdentity.$id && fgRes.attached.includes(resolvedB2cEventIdentity.$id)) {
      b2cEventIdentityV1Attached = true;
    }
    if (resolvedInteractionLite && resolvedInteractionLite.$id && fgRes.skipped.includes(resolvedInteractionLite.$id)) {
      interactionDetailsLiteAttached = true;
    }
    if (resolvedB2cEventIdentity && resolvedB2cEventIdentity.$id && fgRes.skipped.includes(resolvedB2cEventIdentity.$id)) {
      b2cEventIdentityV1Attached = true;
    }
    if (!resolvedInteractionLite) {
      recommendedFieldGroupWarnings.push(
        'Interaction Details Lite (ExperienceEvent) could not be resolved or auto-created — retry in a few seconds or add the field group manually in AEP if org policy blocks tenant FG creation.'
      );
    }
    if (!resolvedB2cEventIdentity) {
      recommendedFieldGroupWarnings.push(
        'B2C Event Identity v1 (ExperienceEvent) could not be resolved or auto-created — retry in a few seconds or add the field group manually in AEP if org policy blocks tenant FG creation.'
      );
    }
    full = (await getSchemaByMetaAlt(token, clientId, orgId, sandbox, metaAltId)) || full;
  }

  const ver = Number(full.version) || 1;
  let identityDescriptors = 0;
  const pairs = buildEventSchemaIdentityDescriptorPairs(tenantCtx.xdmKey);
  for (const p of pairs) {
    try {
      const r = await postIdentityDescriptor(
        token,
        clientId,
        orgId,
        sandbox,
        schemaId,
        ver,
        p.path,
        p.namespace,
        p.isPrimary
      );
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
    b2cEventIdentityV1Attached,
    /** @deprecated Renamed to recommendedFieldGroupWarnings; kept for API consumers. */
    hospitalityFieldGroupWarnings: recommendedFieldGroupWarnings,
    recommendedFieldGroupWarnings,
    /** @deprecated Renamed to recommendedPlatformErrors; kept for API consumers. */
    hospitalityPlatformErrors: recommendedPlatformErrors,
    recommendedPlatformErrors,
    createdFieldGroups: recommendedCreated,
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

/* ── Enable schema + dataset for Profile (identityMap alternate primary) ── */

function schemaHasProfileUnionTag(fullSchema) {
  if (!fullSchema || typeof fullSchema !== 'object') return false;
  const tags = fullSchema['meta:immutableTags'];
  return Array.isArray(tags) && tags.includes('union');
}

function datasetHasProfileEnabledTag(ds) {
  const tags = ds && ds.tags;
  if (!tags || typeof tags !== 'object') return false;
  const v = tags.unifiedProfile;
  if (!Array.isArray(v)) return false;
  return v.some((s) => /enabled\s*[:=]\s*true/i.test(String(s)));
}

function tagValueIsEmpty(v) {
  if (v == null) return true;
  if (Array.isArray(v)) return v.length === 0 || v.every((x) => x == null || String(x).trim() === '');
  return String(v).trim() === '';
}

function schemaRefLooksLikeExperienceEventClass(ref) {
  const s = String(ref || '').toLowerCase();
  return s.includes('/context/experienceevent') || s.endsWith('experienceevent');
}

/** True when schema composes the XDM ExperienceEvent class (root identityMap comes from the class). */
function schemaExtendsExperienceEventClass(schema) {
  if (!schema || typeof schema !== 'object') return false;
  if (schemaRefLooksLikeExperienceEventClass(schema['meta:class'])) return true;
  for (const ref of collectSchemaRefUris(schema)) {
    if (schemaRefLooksLikeExperienceEventClass(ref)) return true;
  }
  return false;
}

/**
 * Resolved or composited schema exposes top-level `identityMap`.
 * Present on the base ExperienceEvent class, Experience Event Core v2.1, or other mixins — not Core v2.1 alone.
 */
function schemaIncludesIdentityMapField(fullSchema) {
  if (!fullSchema || typeof fullSchema !== 'object') return false;
  const props = fullSchema.properties;
  if (props && typeof props === 'object' && props.identityMap) return true;
  const defs = fullSchema.definitions;
  if (defs && typeof defs === 'object') {
    for (const d of Object.values(defs)) {
      if (d && d.properties && d.properties.identityMap) return true;
    }
  }
  for (const entry of fullSchema.allOf || []) {
    if (entry && entry.properties && entry.properties.identityMap) return true;
  }
  if (schemaExtendsExperienceEventClass(fullSchema)) return true;
  return false;
}

async function getDatasetById(token, clientId, orgId, sandbox, datasetId) {
  const url = `${CATALOG_BASE}/dataSets/${encodeURIComponent(datasetId)}`;
  const { res, data } = await fetchJson(url, {
    method: 'GET',
    headers: headers(token, clientId, orgId, sandbox),
  });
  if (!res.ok) return null;
  return data;
}

/**
 * PATCH `tags.unifiedProfile = ['enabled:true']` on a dataset, preserving other tag keys.
 * Idempotent when Profile is already enabled and siphon format is present.
 */
async function enableProfileOnDataset(token, clientId, orgId, sandbox, datasetId) {
  if (!datasetId) return { ok: false, error: 'datasetId is required.' };
  const url = `${CATALOG_BASE}/dataSets/${encodeURIComponent(datasetId)}`;
  const current = await getDatasetById(token, clientId, orgId, sandbox, datasetId);
  const existingTags = current && current.tags && typeof current.tags === 'object' ? current.tags : {};
  const alreadyProfileEnabled = datasetHasProfileEnabledTag(current);
  const formatPresent = !tagValueIsEmpty(existingTags[ADOBE_SIPHON_TABLE_FORMAT_KEY]);
  if (alreadyProfileEnabled && formatPresent) {
    return { ok: true, skipped: true };
  }
  const mergedTags = { ...existingTags, unifiedProfile: ['enabled:true'] };
  if (!formatPresent) {
    mergedTags[ADOBE_SIPHON_TABLE_FORMAT_KEY] = ADOBE_SIPHON_TABLE_FORMAT_VALUE;
  }
  const { res, data } = await fetchJson(url, {
    method: 'PATCH',
    headers: headers(token, clientId, orgId, sandbox),
    body: JSON.stringify({ tags: mergedTags }),
  });
  if (res.ok) return { ok: true };
  return { ok: false, error: extractAepErrorMessage(data, res.statusText) };
}

/**
 * Enable ExperienceEvent schema + dataset for Real-Time Customer Profile using
 * **alternate primary identity from identityMap** (matches AEP UI checkbox).
 *
 * Schema: PATCH `meta:immutableTags` += `"union"` when identityMap is on the schema
 * (base ExperienceEvent class or a mixin) and ECID/Email descriptors are secondary — primary
 * per event comes from payload `identityMap` (`primary: true` on exactly one entry).
 * Dataset: PATCH `tags.unifiedProfile = ['enabled:true']` after schema union lands.
 */
async function runEnableSchemaAndDatasetForProfile(sandbox, token, clientId, orgId, opts = {}) {
  const schemaTitle = String(opts.schemaTitle || '').trim();
  const datasetName = String(opts.datasetName || '').trim();
  const schemaIdOpt = String(opts.schemaId || '').trim();
  const datasetIdOpt = String(opts.datasetId || '').trim();

  log(sandbox, 'enableForProfile.start', { schemaTitle, datasetName, schemaId: schemaIdOpt || undefined });

  const out = {
    ok: false,
    step: 'enableForProfile',
    sandbox,
    alternatePrimaryIdentity: true,
    schemaId: null,
    schemaMetaAltId: null,
    datasetId: null,
    schemaUnion: 'skipped',
    datasetProfile: 'skipped',
    schemaError: null,
    datasetError: null,
    identityMapHint: EVENT_TOOL_IDENTITY_MAP_HINT,
    message: '',
  };

  let schemaRow = null;
  if (schemaIdOpt) {
    schemaRow = await findSchemaById(token, clientId, orgId, sandbox, schemaIdOpt);
  } else if (schemaTitle) {
    schemaRow = await findSchemaByTitle(token, clientId, orgId, sandbox, schemaTitle);
  } else {
    out.schemaUnion = 'failed';
    out.schemaError = 'Provide schemaTitle or schemaId.';
    out.message = out.schemaError;
    return out;
  }

  if (!schemaRow) {
    const ref = schemaIdOpt || schemaTitle || 'schema';
    out.schemaUnion = 'failed';
    out.schemaError = `Schema "${ref}" not found. Run Set up event infrastructure first.`;
    out.message = out.schemaError;
    return out;
  }

  out.schemaId = schemaRow.$id || null;
  out.schemaMetaAltId = schemaRow['meta:altId'] || null;
  if (!out.schemaMetaAltId) {
    out.schemaUnion = 'failed';
    out.schemaError = 'Schema has no meta:altId yet — wait a few seconds after creation and retry.';
    out.message = out.schemaError;
    return out;
  }

  const fullSchema =
    (await fetchFullSchema(token, clientId, orgId, sandbox, schemaRow)) ||
    (await getSchemaByMetaAlt(token, clientId, orgId, sandbox, out.schemaMetaAltId)) ||
    schemaRow;
  if (!schemaIncludesIdentityMapField(fullSchema)) {
    out.schemaUnion = 'failed';
    out.schemaError =
      'Schema is missing the identityMap field. Use an XDM ExperienceEvent schema (identityMap is on the base class) or attach a field group that adds identityMap, then retry.';
    out.message = out.schemaError;
    return out;
  }

  try {
    if (schemaHasProfileUnionTag(fullSchema)) {
      out.schemaUnion = 'already-enabled';
    } else {
      const ops = buildAddProfileUnionPatchOps(fullSchema['meta:immutableTags']);
      if (ops.length) {
        await patchSchemaJsonPatch(token, clientId, orgId, sandbox, out.schemaMetaAltId, ops);
      }
      let verified = false;
      for (let i = 0; i < PROFILE_UNION_VERIFY_BACKOFF_MS.length; i++) {
        if (PROFILE_UNION_VERIFY_BACKOFF_MS[i] > 0) {
          await new Promise((r) => setTimeout(r, PROFILE_UNION_VERIFY_BACKOFF_MS[i]));
        }
        const verify = await getSchemaByMetaAlt(token, clientId, orgId, sandbox, out.schemaMetaAltId);
        if (verify && schemaHasProfileUnionTag(verify)) {
          verified = true;
          break;
        }
      }
      if (!verified) {
        out.schemaUnion = 'failed';
        out.schemaError =
          'Schema PATCH returned 2xx but post-check could not see "union" in meta:immutableTags after retries.';
        out.message = out.schemaError;
        return out;
      }
      out.schemaUnion = 'enabled';
    }
  } catch (e) {
    out.schemaUnion = 'failed';
    out.schemaError = String(e.message || e);
    out.message = `Schema enable for Profile failed: ${out.schemaError}`;
    return out;
  }

  let dataset = null;
  if (datasetIdOpt) {
    dataset = await getDatasetById(token, clientId, orgId, sandbox, datasetIdOpt);
  } else if (datasetName) {
    dataset = await findDatasetByName(token, clientId, orgId, sandbox, datasetName);
  } else {
    out.datasetProfile = 'failed';
    out.datasetError = 'Provide datasetName or datasetId.';
    out.message = `Schema Profile-enabled. ${out.datasetError}`;
    return out;
  }

  if (!dataset || !dataset.id) {
    const ref = datasetIdOpt || datasetName || 'dataset';
    out.datasetProfile = 'failed';
    out.datasetError = `Dataset "${ref}" not found. Run Set up event infrastructure first.`;
    out.message = `Schema Profile-enabled. ${out.datasetError}`;
    return out;
  }
  out.datasetId = dataset.id;

  try {
    if (datasetHasProfileEnabledTag(dataset)) {
      out.datasetProfile = 'already-enabled';
    } else {
      const dsRes = await enableProfileOnDataset(token, clientId, orgId, sandbox, out.datasetId);
      if (!dsRes.ok) {
        out.datasetProfile = 'failed';
        out.datasetError = dsRes.error || 'Dataset PATCH failed.';
        out.message = `Schema Profile-enabled. ${out.datasetError}`;
        return out;
      }
      out.datasetProfile = dsRes.skipped ? 'already-enabled' : 'enabled';
    }
  } catch (e) {
    out.datasetProfile = 'failed';
    out.datasetError = String(e.message || e);
    out.message = `Schema Profile-enabled. Dataset enable failed: ${out.datasetError}`;
    return out;
  }

  out.ok = true;
  const schemaPart =
    out.schemaUnion === 'already-enabled' ? 'Schema already Profile-enabled (union tag).' : 'Schema enabled for Profile (union tag, alternate primary from identityMap).';
  const dsPart =
    out.datasetProfile === 'already-enabled' ? 'Dataset already Profile-enabled.' : 'Dataset enabled for Profile.';
  out.message = `${schemaPart} ${dsPart} Send events with identityMap on Edge — ECID primary when anonymous; exactly one primary:true per event when known user.`;
  log(sandbox, 'enableForProfile.ok', { schemaUnion: out.schemaUnion, datasetProfile: out.datasetProfile });
  return out;
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
  let schemaProfileEnabled = false;
  let datasetProfileEnabled = false;
  if (datasetName) {
    const ds = await findDatasetByName(token, clientId, orgId, sandbox, datasetName);
    if (ds) {
      datasetFound = true;
      datasetId = ds.id;
      datasetProfileEnabled = datasetHasProfileEnabledTag(ds);
    }
  }

  if (schema && schema['meta:altId']) {
    const full = await getSchemaByMetaAlt(token, clientId, orgId, sandbox, schema['meta:altId']);
    if (full) schemaProfileEnabled = schemaHasProfileUnionTag(full);
  }

  log(sandbox, 'status.complete', { schemaFound, datasetFound, schemaProfileEnabled, datasetProfileEnabled });
  return {
    ok: true,
    sandbox,
    schemaFound,
    schemaId,
    schemaMetaAltId,
    datasetFound,
    datasetId,
    schemaProfileEnabled,
    datasetProfileEnabled,
    alternatePrimaryIdentity: true,
    identityMapHint: EVENT_TOOL_IDENTITY_MAP_HINT,
  };
}

/** Tenant ExperienceEvent field group: typed booker/stayer under `_{tenant}.public.bookingParty`. */
const BOOKER_STAYER_FG_TITLE = 'AEP Event Tool - Booker Stayer v1';

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
  const fgOk = !!(
    ensured.interactionLite &&
    ensured.interactionLite.$id &&
    ensured.b2cEventIdentity &&
    ensured.b2cEventIdentity.$id
  );
  subSteps.push({
    step: 'ensureFieldGroups',
    ok: fgOk,
    skipped: !ensured.autoProvisionAttempted && fgOk,
    interactionDetailsLiteId: ensured.interactionLite && ensured.interactionLite.$id ? String(ensured.interactionLite.$id) : null,
    b2cEventIdentityV1Id: ensured.b2cEventIdentity && ensured.b2cEventIdentity.$id ? String(ensured.b2cEventIdentity.$id) : null,
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
        'Could not resolve or auto-create required ExperienceEvent field groups (Interaction Details Lite, B2C Event Identity v1). ' +
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
  parts.push('Enable the schema and dataset for Profile in AEP (alternate primary from identityMap), or use Enable schema & dataset for Profile in the Event tool.');
  parts.push(EVENT_TOOL_IDENTITY_MAP_HINT);

  const result = {
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

  if (opts.enableForProfile === true || opts.enable_for_profile === true) {
    const enableRes = await runEnableSchemaAndDatasetForProfile(sandbox, token, clientId, orgId, {
      schemaTitle,
      datasetName,
      schemaId: schemaId || undefined,
      datasetId: datasetId || undefined,
    });
    subSteps.push({ step: 'enableForProfile', ...enableRes });
    result.subSteps = subSteps;
    result.schemaUnion = enableRes.schemaUnion;
    result.datasetProfile = enableRes.datasetProfile;
    result.schemaProfileEnabled = enableRes.schemaUnion === 'enabled' || enableRes.schemaUnion === 'already-enabled';
    result.datasetProfileEnabled = enableRes.datasetProfile === 'enabled' || enableRes.datasetProfile === 'already-enabled';
    if (!enableRes.ok) {
      return {
        ok: false,
        step: 'setupEventInfra',
        subSteps,
        error: enableRes.message || enableRes.schemaError || enableRes.datasetError || 'enableForProfile failed.',
        schemaUnion: enableRes.schemaUnion,
        datasetProfile: enableRes.datasetProfile,
      };
    }
    parts.push(enableRes.message || 'Schema and dataset enabled for Profile (identityMap alternate primary).');
    result.message = parts.join(' ');
    result.ok = true;
  }

  return result;
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
    if (attach.interactionDetailsLiteAttached) parts.push('Interaction Details Lite attached (tenant interactionDetails.core.channel).');
    if (attach.b2cEventIdentityV1Attached) parts.push('B2C Event Identity v1 attached (tenant identification.core.ecid / .email).');
    for (const w of attach.recommendedFieldGroupWarnings || attach.hospitalityFieldGroupWarnings || []) {
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
      b2cEventIdentityV1Attached: !!attach.b2cEventIdentityV1Attached,
      recommendedFieldGroupWarnings: attach.recommendedFieldGroupWarnings || attach.hospitalityFieldGroupWarnings || [],
      hospitalityFieldGroupWarnings: attach.recommendedFieldGroupWarnings || attach.hospitalityFieldGroupWarnings || [],
      platformErrors: attach.recommendedPlatformErrors || attach.hospitalityPlatformErrors || [],
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

    const attach = await attachExperienceEventCoreV21AndIdentityDescriptors(token, clientId, orgId, sandbox, schema);
    const label = schemaIdOpt ? schema.$id || schemaIdOpt : title;
    const parts = [`Field groups and identity descriptors processed for "${label}".`];
    if (attach.experienceEventCoreV21Attached) parts.push('Experience Event Core v2.1 attached or already present.');
    if (attach.interactionDetailsLiteAttached) parts.push('Interaction Details Lite attached or already present.');
    if (attach.b2cEventIdentityV1Attached) parts.push('B2C Event Identity v1 attached or already present.');
    if ((attach.createdFieldGroups || []).length) {
      parts.push(`Auto-created: ${attach.createdFieldGroups.map((c) => c.title).join(', ')}.`);
    }
    if (attach.identityDescriptors > 0) {
      parts.push(
        `Identity descriptors on ${attach.tenantXdmKey || 'tenant'}.identification.core.ecid / .email (${attach.identityDescriptors} registered).`
      );
    }
    for (const w of attach.recommendedFieldGroupWarnings || attach.hospitalityFieldGroupWarnings || []) {
      if (w) parts.push(`Note: ${w}`);
    }
    if (attach.warn) parts.push(`Note: ${attach.warn}`);

    const coreOk =
      attach.interactionDetailsLiteAttached &&
      attach.b2cEventIdentityV1Attached;
    if (!coreOk) {
      return {
        ok: false,
        sandbox,
        step,
        schemaTitle: String(schema.title || '').trim() || null,
        schemaId: schema.$id,
        schemaMetaAltId: metaAltId,
        interactionDetailsLiteAttached: !!attach.interactionDetailsLiteAttached,
        b2cEventIdentityV1Attached: !!attach.b2cEventIdentityV1Attached,
        experienceEventCoreV21Attached: !!attach.experienceEventCoreV21Attached,
        createdFieldGroups: attach.createdFieldGroups || [],
        platformErrors: attach.recommendedPlatformErrors || attach.hospitalityPlatformErrors || [],
        warnings: attach.recommendedFieldGroupWarnings || attach.hospitalityFieldGroupWarnings || [],
        error:
          'Could not attach required ExperienceEvent field groups (Interaction Details Lite, B2C Event Identity v1). Retry shortly or check Schema Registry permissions.',
      };
    }

    return {
      ok: true,
      sandbox,
      step,
      schemaTitle: String(schema.title || '').trim() || null,
      schemaId: schema.$id,
      schemaMetaAltId: metaAltId,
      experienceEventCoreV21Attached: !!attach.experienceEventCoreV21Attached,
      interactionDetailsLiteAttached: !!attach.interactionDetailsLiteAttached,
      b2cEventIdentityV1Attached: !!attach.b2cEventIdentityV1Attached,
      identityDescriptorsCreated: Number(attach.identityDescriptors) || 0,
      createdFieldGroups: attach.createdFieldGroups || [],
      interactionDetailsLiteFound: !!attach.interactionDetailsLiteAttached,
      b2cEventIdentityV1Found: !!attach.b2cEventIdentityV1Attached,
      platformErrors: attach.recommendedPlatformErrors || attach.hospitalityPlatformErrors || [],
      warnings: attach.recommendedFieldGroupWarnings || attach.hospitalityFieldGroupWarnings || [],
      tenantXdmKey: attach.tenantXdmKey || null,
      message: parts.join(' '),
    };
  }

  if (step === 'attachIndustryEventFieldGroups') {
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

    /** @type {string[]} */
    const createdTitles = [];
    /** @type {string[]} */
    const attachIds = [];
    const warnings = [];

    let industryFg = await findTenantExperienceEventFieldGroupByTitle(
      token,
      clientId,
      orgId,
      sandbox,
      EVENT_INDUSTRY_PUBLIC_FG_TITLE,
      (row) => String(row.title || '').trim() === EVENT_INDUSTRY_PUBLIC_FG_TITLE,
    );
    if (!industryFg) {
      try {
        const body = buildEventIndustryPublicV1ExperienceEventFieldGroup(tenantCtx.tenantId);
        industryFg = await postTenantFieldGroup(token, clientId, orgId, sandbox, body);
        createdTitles.push(EVENT_INDUSTRY_PUBLIC_FG_TITLE);
      } catch (e) {
        const msg = String(e.message || e);
        if (/duplicate|already exists|409/i.test(msg)) {
          industryFg = await findTenantExperienceEventFieldGroupByTitle(
            token,
            clientId,
            orgId,
            sandbox,
            EVENT_INDUSTRY_PUBLIC_FG_TITLE,
            (row) => String(row.title || '').trim() === EVENT_INDUSTRY_PUBLIC_FG_TITLE,
          );
        }
        if (!industryFg) return { ok: false, error: msg };
      }
    }
    if (industryFg && industryFg.$id) attachIds.push(industryFg.$id);

    let travelHotel = findTravelHotelExperienceV1Mixin(
      await listMergedExperienceEventFieldgroups(token, clientId, orgId, sandbox),
    );
    if (!travelHotel) {
      try {
        const body = buildTravelHotelExperienceV1ExperienceEventFieldGroup(tenantCtx.tenantId);
        travelHotel = await postTenantFieldGroup(token, clientId, orgId, sandbox, body);
        createdTitles.push(TRAVEL_HOTEL_EXPERIENCE_V1_FG_TITLE);
      } catch (e) {
        const msg = String(e.message || e);
        if (/duplicate|already exists|409/i.test(msg)) {
          travelHotel = findTravelHotelExperienceV1Mixin(
            await listMergedExperienceEventFieldgroups(token, clientId, orgId, sandbox),
          );
        } else {
          warnings.push(`Travel hotel FG: ${msg}`);
        }
      }
    }
    if (travelHotel && travelHotel.$id) attachIds.push(travelHotel.$id);

    const uniqueAttach = [...new Set(attachIds.filter(Boolean))];
    const fgRes = await attachFieldGroupRefsToSchema(token, clientId, orgId, sandbox, metaAltId, uniqueAttach);
    for (const w of fgRes.warnings || []) warnings.push(w);

    const parts = [];
    if (createdTitles.length) parts.push(`Created: ${createdTitles.join(', ')}.`);
    if (fgRes.attached.length) {
      parts.push(`Attached to schema (${fgRes.attached.map((r) => r.split('/').pop()).join(', ')}).`);
    }
    if (fgRes.skipped.length) parts.push('Some field groups were already on the schema.');
    parts.push(
      `Industry payloads use ${tenantCtx.xdmKey}.public.* and optional root hotel.* — same datastream and dataset as Quick trigger.`,
    );

    return {
      ok: true,
      sandbox,
      step,
      schemaId: schema.$id,
      schemaMetaAltId: metaAltId,
      tenantXdmKey: tenantCtx.xdmKey,
      createdFieldGroups: createdTitles.map((t) => ({ title: t })),
      attachedFieldGroupIds: fgRes.attached,
      skippedFieldGroupIds: fgRes.skipped,
      warnings,
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

  if (step === 'enableForProfile') {
    return runEnableSchemaAndDatasetForProfile(sandbox, token, clientId, orgId, opts);
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
    error: `Unknown step: ${step}. Use setupEventInfra, enableForProfile, createSchema, attachRecommendedFieldGroups, attachIndustryEventFieldGroups, ensureBookerStayerFieldGroup, createDataset, createDatastream, or probeTagsApi.`,
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
  runEnableSchemaAndDatasetForProfile,
  fetchSchemaEventTypes,
  SETUP_EVENT_INFRA_SUBSTEPS,
  REQUIRED_EVENT_EXPERIENCE_FIELD_GROUP_TITLES,
  EVENT_TOOL_IDENTITY_MAP_HINT,
  // Test / script helpers
  findInteractionDetailsLiteMixin,
  findTravelHotelExperienceV1Mixin,
  findB2cEventIdentityV1Mixin,
  mixinExtendsExperienceEventClass,
  isExcludedDebugFieldGroupTitle,
  isGlobalAdobeFieldGroup,
  matchesInteractionDetailsLiteTitle,
  matchesTravelHotelExperienceV1Title,
  matchesB2cEventIdentityV1Title,
  buildInteractionDetailsLiteExperienceEventFieldGroup,
  buildTravelHotelExperienceV1ExperienceEventFieldGroup,
  buildB2cEventIdentityV1ExperienceEventFieldGroup,
  buildEventSchemaIdentityDescriptorPairs,
  buildRemoveFieldGroupPatchOps,
  findWrongInteractionDetailsLiteRefsOnSchema,
  ensureRecommendedExperienceEventFieldGroups,
  schemaHasProfileUnionTag,
  schemaIncludesIdentityMapField,
  datasetHasProfileEnabledTag,
  buildAddProfileUnionPatchOps,
};
