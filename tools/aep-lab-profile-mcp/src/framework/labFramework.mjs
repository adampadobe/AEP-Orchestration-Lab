/**
 * AEP Orchestration Lab execution framework — MCP-side source of truth for Coworker.
 * Canonical UI/backend references:
 *   web/profile-viewer/profile-generation-shared.js (email scaler)
 *   web/profile-viewer/profile-generation-*.js (per-industry streams)
 *   functions/profileGenerateService.js, profileStreamingCore.js
 *   functions/industryAttributeMap.js, profileCoreV2Manifest.js
 *   docs/PROFILE_CORE_V2_TOPUP.md, docs/ANONYMOUS_EDGE_DEMO_PATTERN.md
 */

import { LAB_INDUSTRY_KEYS, INDUSTRY_ALIASES } from '../industries.mjs';
import {
  SEGMENT_HINTS_BY_INDUSTRY,
  TRAVEL_SEGMENT_HINTS,
  FSI_SEGMENT_HINTS,
  RETAIL_SEGMENT_HINTS,
} from '../personaBuilder/segments.mjs';
import { INDUSTRY_CONNECTION_COLLECTION } from '../sandboxConfig.mjs';

/** Lab-default mobile used in Profile Viewer placeholders and bulk seed scripts. */
export const LAB_DEFAULT_MOBILE_PHONE = '+447425627462';

/** Preferred test email domain in lab demos. */
export const LAB_TEST_EMAIL_DOMAIN = 'adobetest.com';

/**
 * @returns {object} Structured execution framework for lab_get_execution_framework / resources.
 */
export function getExecutionFramework() {
  return {
    version: '3.3.0',
    summary:
      'The lab streams Profile-class XDM via per-industry HTTP API connections (Firestore manifest). ' +
      'Generate creates/streams a profile; update re-streams a full writable snapshot (not deltas); ' +
      'events add ExperienceEvent rows via Edge or DCS generator targets.',
    workflows: {
      check_access: {
        tools: ['lab_mcp_access_info'],
        when: 'Start of every Coworker session or after sandbox switch.',
      },
      onboard_sandbox: {
        tools: ['lab_sandbox_profile_config', 'lab_onboard_sandbox', 'lab_batch_job_status'],
        order: [
          'lab_mcp_access_info — confirm sandbox on allowlist',
          'lab_sandbox_profile_config — list ready vs notReadyIndustries',
          'lab_onboard_sandbox mode=plan — ordered checklist',
          'lab_onboard_sandbox mode=execute industry=<key> — one industry per call (sync)',
          'lab_onboard_sandbox mode=execute_all — async all industries; poll lab_batch_job_status',
        ],
        note: 'Generate/update fail until Firestore connection has streaming.url, flowId, datasetId, schemaId, xdmKey.',
      },
      generate_profile: {
        tools: ['lab_profile_infra_status', 'lab_generate_profile', 'lab_lookup_profile', 'lab_get_profile'],
        steps: [
          'Optional: lab_profile_infra_status for sandbox + industry',
          'lab_generate_profile with email, sandbox, industry, randomize:true (or explicit attributes)',
          'Verify: lab_get_profile namespace=email',
        ],
        api: 'POST /api/profile/generate',
        serverSidePersona: 'MCP randomize builds correlated attributes in src/personaBuilder/ (mirrors Profile Viewer Fill random sample).',
      },
      update_profile: {
        tools: ['lab_get_profile', 'lab_update_profile'],
        rule:
          'FULL-SNAPSHOT STITCH: fetch current UPS rows, merge attribute_changes, POST ALL writable fields for the industry dataflow. ' +
          'Never send minimal deltas — timeseries ingestion clears sibling leaves.',
        api: 'POST /api/profile/update?industry=',
      },
      send_event: {
        tools: ['lab_generate_profile', 'lab_list_event_targets', 'lab_send_profile_event', 'lab_profile_activity'],
        steps: [
          'Generate profile; capture ecid from response',
          'lab_list_event_targets — pick target_id',
          'lab_send_profile_event with email, ecid, event_type, view_name',
          'lab_profile_activity — confirm event count',
        ],
        advanced: 'lab_send_edge_event when datastream_id is known (anonymous Edge / raw_payload).',
        api: 'POST /api/events/generator or POST /api/events/edge',
      },
      batch_seed: {
        tools: ['lab_generate_profiles_batch', 'lab_batch_job_status'],
        limits: { maxCount: 100, rateLimit: '3 batch jobs/hour per MCP key' },
      },
    },
    when_to_use: {
      lab_generate_profile:
        'New test identity, first stream into sandbox, or refresh with randomize/segment_hint. Sets testProfile by default.',
      lab_update_profile:
        'Change existing profile attributes after discuss step. Requires profile already in UPS. Uses industry dataflow from argument.',
      lab_send_profile_event:
        'Append experience events (web views, transactions, donations) without rewriting profile attributes.',
      lab_send_edge_event:
        'Direct Alloy-style Edge interact when you have datastream_id; include _<tenant>.identification.core.ecid for Demo Website schemas.',
      lab_onboard_sandbox:
        'New colleague sandbox missing Firestore connection docs or profile not enabled on dataset.',
    },
    dataflow_pattern: {
      description: 'Per industry: schema → dataset → HTTP API streaming flow → Firestore connection doc.',
      firestoreCollections: INDUSTRY_CONNECTION_COLLECTION,
      connectionFields: ['streaming.url', 'streaming.flowId', 'streaming.datasetId', 'streaming.schemaId', 'streaming.xdmKey'],
      profileCoreV2TopUp:
        'During infra step attachFieldGroups, profileCoreV2TopUp adds missing tenant leaves from functions/profileCoreV2Manifest.js (ADD-only). ' +
        'Critical for travel (travelReservations.*, hotel.*) in sandboxes that drift from apalmer canonical mixin.',
    },
    conventions: getLabConventions(),
    industries: LAB_INDUSTRY_KEYS.map((key) => ({
      key,
      segment_hints: SEGMENT_HINTS_BY_INDUSTRY[key] || [],
      connectionCollection: INDUSTRY_CONNECTION_COLLECTION[key],
    })),
    aliases: INDUSTRY_ALIASES,
    segment_hints_catalog: {
      travel: TRAVEL_SEGMENT_HINTS,
      fsi: FSI_SEGMENT_HINTS,
      retail: RETAIL_SEGMENT_HINTS,
    },
    attribute_ownership:
      'Static map in functions/industryAttributeMap.js — industry-specific prefixes first, generic catch-all last. ' +
      'lab_get_profile includes ownership hints. Updates must target the owning industry dataflow.',
    sources: [
      'web/profile-viewer/profile-generation-shared.js',
      'functions/profileGenerateService.js',
      'functions/industryAttributeMap.js',
      'functions/profileCoreV2Manifest.js',
      'docs/PROFILE_CORE_V2_TOPUP.md',
      'docs/ANONYMOUS_EDGE_DEMO_PATTERN.md',
    ],
  };
}

/**
 * @returns {object} Lab-wide conventions (emails, phone, testProfile, stitching).
 */
export function getLabConventions() {
  return {
    test_email_domain: LAB_TEST_EMAIL_DOMAIN,
    email_patterns: {
      ui_scaler:
        'Profile Viewer scales base email with today DDMMYYYY + daily counter: apalmer@adobetest.com → apalmer+23062026-1@adobetest.com. ' +
        'If local part already has +tag, appends -DDMMYYYY-N instead.',
      mcp_batch_default:
        'base_email without @ → {base}+{industry}-{n}@adobetest.com. With @: plus-tag {local}+{industry}-{n}@domain or {local}-{n} if + exists.',
      coworker_examples: [
        'travel.demo+001@adobetest.com',
        'hotel.reactivation+001@adobetest.com',
        'fsi.hnw+001@adobetest.com',
        'kirkham+retail-seed → kirkham+retail-1@adobetest.com (batch)',
      ],
      email_pattern_tokens: '{n}, {index}, {industry} for lab_generate_profiles_batch email_pattern',
    },
    mobile_phone: {
      lab_default: LAB_DEFAULT_MOBILE_PHONE,
      note:
        'Profile Viewer generators default to this UK test MSISDN (placeholder in profile-generation.html, bulk-seed script). ' +
        'MCP randomize uses lab_default unless attributes override mobilePhone.number.',
    },
    testProfile: {
      default: true,
      behavior:
        'profileGenerateService sets root testProfile:true unless test_profile:false or omitTestProfile. ' +
        'Streaming mirrors to xdm:testProfile for OOTB test-details mixin.',
      mcp_param: 'lab_generate_profile test_profile (optional boolean)',
    },
    identity_stitching: {
      profile_stream: 'Email is primary identity on generate/update; ECID in identityMap when append_if_existing or from prior generate.',
      anonymous_edge:
        'Web SDK: getIdentity → sendEvent with identityMap.ECID AND _<tenant>.identification.core.ecid (same string). See ANONYMOUS_EDGE_DEMO_PATTERN.md.',
      known_profile_event:
        'After email lookup, sendEvent may include identityMap ECID primary + email secondary — distinct from anonymous page-view.',
    },
    full_snapshot_update:
      'lab_update_profile merges into entire writable industry snapshot before POST — same as Profile Viewer table editor.',
    rate_limits: {
      generate_per_minute: 30,
      event_send_per_minute: 30,
      batch_jobs_per_hour: 3,
    },
  };
}

/** @type {Record<string, object>} */
const INDUSTRY_PLAYBOOKS = {
  generic: {
    label: 'Generic · CDP lab',
    profileGenerateIndustry: 'generic',
    persona_fields: [
      'individualCharacteristics.core.favouriteCategory',
      'homeAddress.*',
      'individualCharacteristics.public.* (donation demos)',
      'person.*, personalEmail.*, loyalty.*, scoring.* (shared common persona)',
    ],
    tenant_paths: ['_<tenant>.individualCharacteristics.core.*', 'scoring.* (shared)'],
    segment_hints: [],
    infra_prerequisites: ['genericProfileConnections Firestore doc', 'Profile enabled on generic dataset', 'Profile Core v2 top-up (shared leaves)'],
    example_prompt_chain: [
      'lab_sandbox_profile_config sandbox apalmer industry generic',
      'lab_generate_profile sandbox apalmer industry generic email demo+001@adobetest.com randomize true',
      'lab_get_profile sandbox apalmer identifier demo+001@adobetest.com',
    ],
  },
  travel: {
    label: 'Travel & hospitality',
    profileGenerateIndustry: 'travel',
    persona_fields: [
      'individualCharacteristics.travel.* (airline, class, recentStay)',
      'hotel.bookingDetails.* (segment overlays)',
      'travelReservations.flightReservations.*',
      'travelPreferences.* (root mixin)',
    ],
    tenant_paths: [
      'travelReservations.*',
      'hotel.bookingDetails.*',
      'individualCharacteristics.travel.*',
    ],
    segment_hints: TRAVEL_SEGMENT_HINTS,
    segment_semantics: {
      hotel_reactivation: 'Checkout >12 months ago, totalNights≥5, elevated churn/propensity — hotel edge segments',
      hotel_high_value: 'Platinum tier, high LTV, recent stay, rich hotel.bookingDetails',
    },
    infra_prerequisites: [
      'travelProfileConnections doc',
      'Profile Travel v1 + Hotel Experience FG',
      'Profile Core v2 top-up for travelReservations + hotel subtrees',
    ],
    example_prompt_chain: [
      'lab_generate_profile sandbox apalmer industry travel email hotel.reactivation+001@adobetest.com randomize true segment_hint hotel_reactivation',
      'lab_profile_activity sandbox apalmer identifier hotel.reactivation+001@adobetest.com',
    ],
  },
  fsi: {
    label: 'FSI · banking & wealth',
    persona_fields: [
      'industryFsi.* (income/credit bands, products)',
      'individualCharacteristics.fsi.*',
      'personalFinances.* (root)',
    ],
    tenant_paths: ['industryFsi.*', 'individualCharacteristics.fsi.*'],
    segment_hints: FSI_SEGMENT_HINTS,
    segment_semantics: {
      high_net_worth: 'Income 500k_plus, excellent credit 780+, high savings, platinum tier',
      credit_rebuild: 'Income under_50k, poor credit ≤579, elevated churn, bronze tier',
    },
    infra_prerequisites: ['fsiProfileConnections', 'Profile FSI v2 FG'],
    example_prompt_chain: [
      'lab_generate_profile sandbox apalmer industry fsi email fsi.hnw+001@adobetest.com randomize true segment_hint high_net_worth',
    ],
  },
  retail: {
    label: 'Retail',
    persona_fields: [
      'individualCharacteristics.retail.*',
      'scoring.retail.*',
      'orderProfile.* (generic-owned LTV/orders)',
    ],
    tenant_paths: ['individualCharacteristics.retail.*', 'scoring.retail.*', 'industryRetail.*'],
    segment_hints: RETAIL_SEGMENT_HINTS,
    segment_semantics: {
      loyalty_vip: 'Platinum, LTV≥25k, high ordersYTD, cobranded card',
      cart_abandoner: 'Recent basket, low propensity, modest LTV',
    },
    infra_prerequisites: ['retailProfileConnections', 'Profile Retail v2 FG'],
    example_prompt_chain: [
      'lab_generate_profiles_batch sandbox apalmer industry retail count 25 base_email kirkham+retail-vip randomize true segment_hint loyalty_vip',
    ],
  },
  telecom: {
    label: 'Telecommunications',
    persona_fields: ['industryTelecom.*', 'telecomSubscription.* (root)', 'bundle-coherent plan tiers'],
    tenant_paths: ['industryTelecom.*', 'telecomSubscription.*'],
    segment_hints: [],
    infra_prerequisites: ['telecomProfileConnections', 'Profile Telecom v1 FG'],
    aliases: ['telecommunications', 'telco'],
  },
  media: {
    label: 'Media & entertainment',
    persona_fields: ['industryMedia.*', 'subscriptions.* (root)', 'viewing/binge coherence'],
    tenant_paths: ['industryMedia.*', 'subscriptions.*'],
    segment_hints: [],
    infra_prerequisites: ['mediaProfileConnections', 'Profile Media v1/v2 FG'],
  },
  sports: {
    label: 'Sports & venues',
    persona_fields: ['industrySports.* (favouriteSport, team, fanSegment, merch)'],
    tenant_paths: ['industrySports.*'],
    segment_hints: [],
    infra_prerequisites: ['sportsProfileConnections', 'Profile Sports v1 FG'],
  },
};

/**
 * @param {string | undefined | null} rawIndustry
 * @returns {{ ok: true, industry: string, playbook: object } | { ok: false, error: string, supported: string[] }}
 */
export function getIndustryPlaybook(rawIndustry) {
  const key = String(rawIndustry || '').trim().toLowerCase();
  if (!key) {
    return {
      ok: true,
      industry: 'all',
      playbook: {
        industries: LAB_INDUSTRY_KEYS.map((k) => ({ key: k, ...INDUSTRY_PLAYBOOKS[k] })),
        conventions: getLabConventions(),
      },
    };
  }

  let resolved = key;
  if (!LAB_INDUSTRY_KEYS.includes(resolved)) {
    const alias = INDUSTRY_ALIASES[resolved];
    if (alias) resolved = alias.key;
  }

  if (!INDUSTRY_PLAYBOOKS[resolved]) {
    return {
      ok: false,
      error: `Unknown industry "${rawIndustry}".`,
      supported: [...LAB_INDUSTRY_KEYS],
    };
  }

  return {
    ok: true,
    industry: resolved,
    playbook: {
      ...INDUSTRY_PLAYBOOKS[resolved],
      conventions: getLabConventions(),
      framework_tools: ['lab_get_execution_framework', 'lab_get_industry_playbook', 'lab_generate_profile'],
    },
  };
}

/**
 * Markdown overview for lab://framework/overview resource.
 */
export function frameworkOverviewMarkdown() {
  const fw = getExecutionFramework();
  const lines = [
    '# AEP Orchestration Lab — execution framework',
    '',
    fw.summary,
    '',
    '## Workflows',
    ...Object.entries(fw.workflows).map(([name, w]) => `- **${name}**: ${w.tools?.join(', ') || ''}`),
    '',
    '## When to use which tool',
    ...Object.entries(fw.when_to_use).map(([tool, desc]) => `- **${tool}**: ${desc}`),
    '',
    '## Conventions',
    `- Test email domain: **${LAB_TEST_EMAIL_DOMAIN}**`,
    `- Default mobile: **${LAB_DEFAULT_MOBILE_PHONE}**`,
    `- testProfile: default **true** on generate`,
    `- Updates: **full-snapshot stitch** only`,
    '',
    'Call **lab_get_execution_framework** for full JSON.',
  ];
  return lines.join('\n');
}

/**
 * Markdown conventions doc for lab://framework/conventions resource.
 */
export function frameworkConventionsMarkdown() {
  const c = getLabConventions();
  return [
    '# Lab conventions',
    '',
    '## Email',
    c.email_patterns.ui_scaler,
    '',
    'Examples: ' + c.email_patterns.coworker_examples.join('; '),
    '',
    '## Mobile',
    `Default: ${c.mobile_phone.lab_default}`,
    c.mobile_phone.note,
    '',
    '## testProfile',
    c.testProfile.behavior,
    '',
    '## Identity / Edge',
    c.identity_stitching.anonymous_edge,
  ].join('\n');
}
