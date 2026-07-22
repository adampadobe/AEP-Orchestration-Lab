/**
 * Snowflake industry manifests — read-only introspection for Agentic travel (Phase A).
 * Single source of truth for phase tables, event groups, dual-load targets, validation rules.
 */

'use strict';

const { COLUMNS } = require('./snowflakeBaseProfileSchema');
const { COLUMNS: TRAVEL_COLUMNS } = require('./snowflakeTravelProfileSchema');

const PHASE_TABLES = {
  phase1: [
    'AGENTIC_TRAVEL_PROFILE_CUSTOMER_BASE_PROFILE',
    'AGENTIC_TRAVEL_PROFILE_CUSTOMER',
    'AGENTIC_TRAVEL_EVENT_WEBSITE',
    'AGENTIC_TRAVEL_EVENT_BOOKING',
  ],
  phase2: [
    'AGENTIC_TRAVEL_PROFILE_LOYALTY',
    'AGENTIC_TRAVEL_PROFILE_PREFERENCES',
    'AGENTIC_TRAVEL_EVENT_MOBILE',
    'AGENTIC_TRAVEL_EVENT_CALLCENTRE',
    'AGENTIC_TRAVEL_EVENT_CHECKIN',
  ],
  phase3: [
    'AGENTIC_TRAVEL_EVENT_DISRUPTION',
    'AGENTIC_TRAVEL_EVENT_INFLIGHT',
    'AGENTIC_TRAVEL_EVENT_HOTEL',
    'AGENTIC_TRAVEL_EVENT_LOYALTY',
    'AGENTIC_TRAVEL_EVENT_POS',
  ],
};

/** Enrich runner event type keys (services/agentic-travel-runner web_app.py). */
const ENRICH_EVENT_TYPES = [
  'mobile',
  'website',
  'booking',
  'checkin',
  'call',
  'disruption',
  'inflight',
  'hotel',
  'loyalty',
  'pos',
];

const EVENT_GROUPS = {
  phase1: ['website', 'booking'],
  phase2: ['mobile', 'call', 'checkin'],
  phase3: ['disruption', 'inflight', 'hotel', 'loyalty', 'pos'],
};

const TRAVEL_MANIFEST = {
  industry: 'travel',
  label: 'Agentic Travel Demo',
  phaseTables: PHASE_TABLES,
  allTables: [
    ...PHASE_TABLES.phase1,
    ...PHASE_TABLES.phase2,
    ...PHASE_TABLES.phase3,
  ],
  baseProfiles: {
    /** Primary customer table — query-profiles + dual-load target (aligned). */
    table: 'AGENTIC_TRAVEL_PROFILE_CUSTOMER',
    baseProfileTable: 'AGENTIC_TRAVEL_PROFILE_CUSTOMER_BASE_PROFILE',
    /** Legacy Node batch generator default (38-col BASE_PROFILES shape). */
    legacyBatchTable: 'BASE_PROFILES',
    columnCount: TRAVEL_COLUMNS.length,
    columns: TRAVEL_COLUMNS,
    baseProfileColumnCount: COLUMNS.length,
    baseProfileColumns: COLUMNS,
  },
  dualLoad: {
    defaultTargetTable: 'AGENTIC_TRAVEL_PROFILE_CUSTOMER',
    queryTable: 'AGENTIC_TRAVEL_PROFILE_CUSTOMER',
    mapperSchema: 'AGENTIC_TRAVEL_PROFILE_CUSTOMER',
    columnCount: TRAVEL_COLUMNS.length,
    defaultMode: 'crm_generate',
    modes: {
      crm_generate:
        'Default — generates full travel CRM row (LTV, holidays, preferences) via Node generator aligned with agentic-travel-runner Phase 1; binds EMAIL, ECID, CRMID (+ optional FIRSTNAME/LASTNAME) from AEP generate.',
      mirror:
        'Legacy — maps AEP dot-path attributes only; travel CRM columns stay empty/default. Pass mode=mirror on insert-profile-from-aep to opt in.',
    },
    note:
      'Dual-load INSERT targets AGENTIC_TRAVEL_PROFILE_CUSTOMER with shared Firestore email/ECID from AEP generate. ' +
      'AEP carries behavioral intent (events, segmentation); Snowflake carries operational CRM (bookings, LTV, preferences). ' +
      'Verify with lab_snowflake_get_profile_by_email — all 39 columns including LIFETIMEVALUE and holiday fields.',
  },
  emailGeneration: {
    pattern: '<local>+DDMMYYYY-N@<domain>',
    source: 'labProfileGenerationPrefs',
    api: {
      reserve: 'POST /api/lab/generation-prefs/next-email',
      prefs: 'GET /api/lab/generation-prefs',
    },
    dualLoad: 'Uses exact email from AEP generate response (never a separate Snowflake counter).',
    snowflakeOnlyBatch: {
      default: 'use_generation_prefs:true — reserves N emails from Firestore before INSERT',
      legacy: 'use_generation_prefs:false — deprecated Agentic adamp.adobedemo+DDMMYYYY+N@gmail.com scan',
    },
  },
  eventGroups: EVENT_GROUPS,
  enrichEventTypes: ENRICH_EVENT_TYPES,
  validationRules: {
    phases: Object.keys(PHASE_TABLES),
    generateFullCount: { min: 1, max: 1000 },
    enrichProfilesRequired: ['profiles', 'eventTypes'],
    enrichEventTypesAllowed: ENRICH_EVENT_TYPES,
  },
  runner: {
    urlEnv: 'AGENTIC_TRAVEL_RUNNER_URL',
    secretEnv: 'AGENTIC_TRAVEL_RUNNER_HMAC_SECRET',
    operations: ['generate-full', 'enrich-profiles'],
  },
};

/** Draft retail manifest — table proposals validated read-only until recipes ship. */
const RETAIL_DRAFT_MANIFEST = {
  industry: 'retail',
  label: 'Retail (draft — governed provision not enabled)',
  status: 'draft',
  proposedTables: [
    'RETAIL_PROFILE_CUSTOMER',
    'RETAIL_EVENT_PURCHASE',
    'RETAIL_EVENT_CART',
  ],
  provisionRecipes: [],
  note:
    'Net-new retail tables may be validated via lab_snowflake_validate_proposal proposed_tables only. ' +
    'No CREATE DDL recipes in v3.23.',
};

const INDUSTRY_MANIFESTS = {
  travel: TRAVEL_MANIFEST,
  retail: RETAIL_DRAFT_MANIFEST,
};

/**
 * @param {string} [industry]
 * @returns {typeof TRAVEL_MANIFEST | null}
 */
function getIndustryManifest(industry) {
  const key = String(industry || 'travel').trim().toLowerCase();
  return INDUSTRY_MANIFESTS[key] || null;
}

/**
 * @returns {string[]}
 */
function listSupportedIndustries() {
  return Object.keys(INDUSTRY_MANIFESTS);
}

/**
 * Travel-only read-only validation for enrich / phase proposals (no DDL).
 * @param {object} input
 * @param {string[]} [input.phases]
 * @param {string[]} [input.eventTypes]
 * @param {number} [input.count]
 */
function validateTravelProposal(input) {
  const manifest = TRAVEL_MANIFEST;
  const errors = [];
  const warnings = [];

  const phases = Array.isArray(input.phases) ? input.phases : [];
  const eventTypes = Array.isArray(input.eventTypes) ? input.eventTypes : [];
  const countRaw = input.count;

  if (phases.length) {
    for (const p of phases) {
      const phase = String(p || '').trim().toLowerCase();
      if (!manifest.phaseTables[phase]) {
        errors.push(`Unknown phase "${p}". Expected: ${manifest.validationRules.phases.join(', ')}`);
      }
    }
  }

  if (eventTypes.length) {
    const allowed = new Set(manifest.enrichEventTypes);
    for (const et of eventTypes) {
      const key = String(et || '').trim().toLowerCase();
      if (!allowed.has(key)) {
        errors.push(
          `Unknown enrich event type "${et}". Allowed: ${manifest.enrichEventTypes.join(', ')}`,
        );
      }
    }
  }

  if (countRaw != null && countRaw !== '') {
    const count = Number(countRaw);
    const { min, max } = manifest.validationRules.generateFullCount;
    if (!Number.isFinite(count) || count < min || count > max) {
      errors.push(`count must be between ${min} and ${max}`);
    }
  }

  if (!phases.length && !eventTypes.length && (countRaw == null || countRaw === '')) {
    warnings.push('No phases, eventTypes, or count supplied — manifest introspection only.');
  }

  return {
    ok: errors.length === 0,
    industry: 'travel',
    valid: errors.length === 0,
    errors,
    warnings,
    resolved: {
      phases: phases.map((p) => String(p).trim().toLowerCase()).filter((p) => manifest.phaseTables[p]),
      eventTypes: eventTypes
        .map((e) => String(e).trim().toLowerCase())
        .filter((e) => manifest.enrichEventTypes.includes(e)),
    },
    manifestSummary: {
      phases: manifest.validationRules.phases,
      enrichEventTypes: manifest.enrichEventTypes,
      dualLoadTarget: manifest.dualLoad.defaultTargetTable,
      queryTable: manifest.dualLoad.queryTable,
    },
  };
}

module.exports = {
  PHASE_TABLES,
  ENRICH_EVENT_TYPES,
  EVENT_GROUPS,
  TRAVEL_MANIFEST,
  RETAIL_DRAFT_MANIFEST,
  INDUSTRY_MANIFESTS,
  getIndustryManifest,
  listSupportedIndustries,
  validateTravelProposal,
};
