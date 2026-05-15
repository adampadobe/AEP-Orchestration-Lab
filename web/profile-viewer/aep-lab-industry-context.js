/**
 * Shared Contact centre + iPad lab industry presets (single localStorage key, cross-tab sync).
 * Load before call-center-demo-apalmer.js and etihad-ipad.js.
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'aepLabCallCenterIndustry_v1';
  var LEGACY_STORAGE_KEY = 'aepCallCenterIndustry_v1_apalmerLab';

  /** @type {Record<string, object>} */
  var INDUSTRIES = {
    adobe: {
      label: 'Adobe & digital experience',
      tabShort: 'Adobe DX',
      heroTitle: 'Contact center workspace',
      heroSubtitle:
        'You are in the Adobe Experience Cloud stack: look up customers in Real-Time Customer Profile for journeys, consent, and personalization — the same unified record agents need when supporting Experience Platform and Journey Optimizer.',
      pinnedTitle: 'Look up a customer',
      pinnedLead:
        'Enter an email to load profile attributes, identity graph, audiences, and recent events from your AEP sandbox (RTCDP).',
      customerEmailLabel: 'Customer email',
      agentToolkitTitle: 'Agent toolkit',
      agentToolkitHint: 'Use Look up a customer above to retrieve Real-Time Customer Profile data.',
      recordPill: 'Quality monitoring',
      notesPlaceholder: 'Case notes, journey IDs, sandbox context… (demo — not saved)',
      metricQLabel: 'Interactions queued',
      metricQValue: '14',
      metricQHint: 'Skill: Experience Cloud care',
      metricWaitLabel: 'Longest wait',
      metricWaitValue: '03:42',
      metricWaitHint: 'Service level 3:00',
      metricAgentsLabel: 'Agents available',
      metricAgentsValue: '28',
      metricAgentsHint: 'Occupancy 82%',
      accent: '#0d66d0',
      accentSoft: '#e8f0ff',
      emailPlaceholder: 'e.g. customer@adobetest.com',
    },
    telco: {
      label: 'Telecommunications',
      tabShort: 'Telco',
      heroTitle: 'Care & retention workspace',
      heroSubtitle:
        'Typical telco agent desktop: churn risk, plan changes, and network incidents — all tied to a single subscriber profile in your CDP.',
      pinnedTitle: 'Look up a subscriber',
      pinnedLead: 'Enter the account email to load subscriber profile, line identifiers, and engagement history from the platform.',
      customerEmailLabel: 'Account email',
      agentToolkitTitle: 'Care toolkit',
      agentToolkitHint: 'Use Look up a subscriber above to load billing and line context from the profile.',
      recordPill: 'Recorded line',
      notesPlaceholder: 'Trouble ticket, plan, handset… (demo — not saved)',
      metricQLabel: 'Calls in queue',
      metricQValue: '31',
      metricQHint: 'Skill: Wireless billing',
      metricWaitLabel: 'Longest wait',
      metricWaitValue: '04:18',
      metricWaitHint: 'SLA 03:00',
      metricAgentsLabel: 'Agents staffed',
      metricAgentsValue: '42',
      metricAgentsHint: 'Shrinkage 9%',
      accent: '#7c3aed',
      accentSoft: '#ede9fe',
      emailPlaceholder: 'name@carrier.example.com',
    },
    banking: {
      label: 'Retail banking',
      tabShort: 'Banking',
      heroTitle: 'Service & advice workspace',
      heroSubtitle:
        'Banking contact centers pair authenticated callers with a golden customer profile: balances, products, risk flags, and consent — unified in Experience Platform.',
      pinnedTitle: 'Look up a customer',
      pinnedLead: 'Enter the registered email to retrieve profile, product holdings, and eligibility from the CDP-backed CRM view.',
      customerEmailLabel: 'Registered email',
      agentToolkitTitle: 'Service toolkit',
      agentToolkitHint: 'Use Look up a customer above after authentication to pull the unified banking profile.',
      recordPill: 'Compliance recording',
      notesPlaceholder: 'Product, complaint ID, disclosure… (demo — not saved)',
      metricQLabel: 'Calls in queue',
      metricQValue: '22',
      metricQHint: 'Queue: Retail service',
      metricWaitLabel: 'Longest wait',
      metricWaitValue: '02:51',
      metricWaitHint: 'ASA target 03:00',
      metricAgentsLabel: 'Advisors available',
      metricAgentsValue: '18',
      metricAgentsHint: 'Occupancy 88%',
      accent: '#047857',
      accentSoft: '#d1fae5',
      emailPlaceholder: 'customer@bank.example.com',
    },
    retail: {
      label: 'Retail & e-commerce',
      tabShort: 'Retail',
      heroTitle: 'Store & digital care',
      heroSubtitle:
        'Retail agents see orders, loyalty, and returns in one profile — the same 360° view marketers use for personalization.',
      pinnedTitle: 'Look up a shopper',
      pinnedLead: 'Enter email to load customer profile: loyalty tier, recent orders, and channel preferences from the platform.',
      customerEmailLabel: 'Customer email',
      agentToolkitTitle: 'Service toolkit',
      agentToolkitHint: 'Use Look up a shopper above to open the commerce profile.',
      recordPill: 'Session logged',
      notesPlaceholder: 'Order #, return reason, store… (demo — not saved)',
      metricQLabel: 'Chats & calls queued',
      metricQValue: '47',
      metricQHint: 'Peak: peak season',
      metricWaitLabel: 'Avg. speed to answer',
      metricWaitValue: '01:12',
      metricWaitHint: 'Target 02:00',
      metricAgentsLabel: 'Agents online',
      metricAgentsValue: '65',
      metricAgentsHint: 'Occupancy 76%',
      accent: '#c2410c',
      accentSoft: '#ffedd5',
      emailPlaceholder: 'shopper@example.com',
    },
    healthcare: {
      label: 'Healthcare & life sciences',
      tabShort: 'Healthcare',
      heroTitle: 'Member services workspace',
      heroSubtitle:
        'Healthcare support often combines PHI-safe processes with a unified consumer profile for benefits, care paths, and outreach — modelled here at a marketing-CDP level (demo only).',
      pinnedTitle: 'Look up a member',
      pinnedLead: 'Enter email to load the member profile view (demo — align with your BAA and governance in production).',
      customerEmailLabel: 'Member email',
      agentToolkitTitle: 'Care coordinator',
      agentToolkitHint: 'Use Look up a member above to retrieve benefits and engagement context from the profile.',
      recordPill: 'Privacy mode',
      notesPlaceholder: 'Benefit question, PCP, callback… (demo — not saved)',
      metricQLabel: 'Contacts in queue',
      metricQValue: '19',
      metricQHint: 'Skill: Member services',
      metricWaitLabel: 'Longest wait',
      metricWaitValue: '05:02',
      metricWaitHint: 'SLA 05:00',
      metricAgentsLabel: 'Nurses & agents',
      metricAgentsValue: '36',
      metricAgentsHint: 'After-hours 40%',
      accent: '#0369a1',
      accentSoft: '#e0f2fe',
      emailPlaceholder: 'member@healthplan.example.com',
    },
    travel: {
      label: 'Travel & hospitality',
      tabShort: 'Travel',
      heroTitle: 'Guest & traveler care',
      heroSubtitle:
        'Travel agents resolve itineraries, loyalty status, and disruptions using one traveler profile across web, app, and call center.',
      pinnedTitle: 'Look up a traveler',
      pinnedLead: 'Enter email to load traveler profile, loyalty tier, and recent trips from the CDP.',
      customerEmailLabel: 'Traveler email',
      agentToolkitTitle: 'Concierge toolkit',
      agentToolkitHint: 'Use Look up a traveler above for itinerary and loyalty context.',
      recordPill: 'Call recorded',
      notesPlaceholder: 'PNR, hotel, compensation… (demo — not saved)',
      metricQLabel: 'Contacts waiting',
      metricQValue: '26',
      metricQHint: 'Storm hold: EU',
      metricWaitLabel: 'Longest wait',
      metricWaitValue: '06:40',
      metricWaitHint: 'VIP callback first',
      metricAgentsLabel: 'Agents available',
      metricAgentsValue: '52',
      metricAgentsHint: 'Languages 12',
      accent: '#0e7490',
      accentSoft: '#cffafe',
      emailPlaceholder: 'guest@airline.example.com',
    },
    media: {
      label: 'Media & entertainment',
      tabShort: 'Media',
      heroTitle: 'Subscriber support',
      heroSubtitle:
        'Streaming and publishing agents see subscription state, device limits, and win-back offers from the same profile marketers use for audience suppression.',
      pinnedTitle: 'Look up a subscriber',
      pinnedLead: 'Enter email to load subscriber profile, plan, and engagement from the platform.',
      customerEmailLabel: 'Account email',
      agentToolkitTitle: 'Support toolkit',
      agentToolkitHint: 'Use Look up a subscriber above for entitlement and billing context.',
      recordPill: 'Monitored for QA',
      notesPlaceholder: 'Show title, device, promo… (demo — not saved)',
      metricQLabel: 'Chats in queue',
      metricQValue: '58',
      metricQHint: 'Skill: Billing',
      metricWaitLabel: 'Longest wait',
      metricWaitValue: '02:05',
      metricWaitHint: 'SLA 02:30',
      metricAgentsLabel: 'Agents available',
      metricAgentsValue: '71',
      metricAgentsHint: 'BOT deflection 34%',
      accent: '#be185d',
      accentSoft: '#fce7f3',
      emailPlaceholder: 'viewer@stream.example.com',
    },
    insurance: {
      label: 'Insurance',
      tabShort: 'Insurance',
      heroTitle: 'Policyholder services',
      heroSubtitle:
        'Insurance contact centers combine policy data and marketing profile for cross-sell, claims triage, and compliant outreach.',
      pinnedTitle: 'Look up a policyholder',
      pinnedLead: 'Enter email to retrieve profile, policies-in-force signals, and consent from the unified customer record.',
      customerEmailLabel: 'Policyholder email',
      agentToolkitTitle: 'Adjuster toolkit',
      agentToolkitHint: 'Use Look up a policyholder above to open risk and marketing-safe attributes.',
      recordPill: 'Compliance recording',
      notesPlaceholder: 'Claim #, coverage, FNOL… (demo — not saved)',
      metricQLabel: 'Calls in queue',
      metricQValue: '17',
      metricQHint: 'FNOL priority',
      metricWaitLabel: 'Longest wait',
      metricWaitValue: '03:55',
      metricWaitHint: 'CAT event: off',
      metricAgentsLabel: 'Licensed agents',
      metricAgentsValue: '24',
      metricAgentsHint: 'Occupancy 79%',
      accent: '#b45309',
      accentSoft: '#fef3c7',
      emailPlaceholder: 'insured@carrier.example.com',
    },
    public_sector: {
      label: 'Public sector',
      tabShort: 'Public sector',
      heroTitle: 'Citizen services desk',
      heroSubtitle:
        'Citizen-facing contact centers use a single profile to reduce repeat contacts and coordinate programs — aligned with Experience Platform for outbound and inbound journeys.',
      pinnedTitle: 'Look up a citizen / customer',
      pinnedLead: 'Enter email to load the profile used for service eligibility and program communications (demo).',
      customerEmailLabel: 'Contact email',
      agentToolkitTitle: 'Service toolkit',
      agentToolkitHint: 'Use Look up above to retrieve case context from the profile.',
      recordPill: 'Official use',
      notesPlaceholder: 'Reference #, program, language… (demo — not saved)',
      metricQLabel: 'Requests queued',
      metricQValue: '41',
      metricQHint: 'Channel: Phone',
      metricWaitLabel: 'Longest wait',
      metricWaitValue: '08:12',
      metricWaitHint: 'Target varies',
      metricAgentsLabel: 'Staff available',
      metricAgentsValue: '55',
      metricAgentsHint: 'Peak shift',
      accent: '#1d4ed8',
      accentSoft: '#dbeafe',
      emailPlaceholder: 'citizen@example.gov',
    },
  };

  var INDUSTRY_ORDER = [
    'adobe',
    'telco',
    'banking',
    'retail',
    'healthcare',
    'travel',
    'media',
    'insurance',
    'public_sector',
  ];

  function loadSavedIndustryId() {
    try {
      var raw = global.localStorage.getItem(STORAGE_KEY);
      if (raw && INDUSTRIES[raw]) return raw;
      var legacy = global.localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy && INDUSTRIES[legacy]) return legacy;
    } catch (_) {
      /* ignore */
    }
    return 'adobe';
  }

  function persistIndustry(id) {
    var next = INDUSTRIES[id] ? id : 'adobe';
    try {
      global.localStorage.setItem(STORAGE_KEY, next);
    } catch (_) {
      /* ignore */
    }
    try {
      global.dispatchEvent(
        new CustomEvent('aep-lab-industry-change', { detail: { industryId: next } }),
      );
    } catch (_) {
      /* ignore */
    }
  }

  /**
   * @param {(id: string) => void} cb
   */
  function attachCrossPageIndustryListener(cb) {
    if (typeof cb !== 'function') return;
    function resolveFromStorageValue(raw) {
      if (raw && INDUSTRIES[raw]) return raw;
      return loadSavedIndustryId();
    }
    global.addEventListener('storage', function (e) {
      if (!e || e.storageArea !== global.localStorage) return;
      if (e.key !== STORAGE_KEY && e.key !== LEGACY_STORAGE_KEY) return;
      cb(resolveFromStorageValue(e.newValue));
    });
    global.addEventListener('aep-lab-industry-change', function (ev) {
      var id = ev && ev.detail && ev.detail.industryId;
      if (id && INDUSTRIES[id]) cb(id);
    });
  }

  global.AepLabIndustryContext = {
    STORAGE_KEY: STORAGE_KEY,
    LEGACY_STORAGE_KEY: LEGACY_STORAGE_KEY,
    INDUSTRIES: INDUSTRIES,
    INDUSTRY_ORDER: INDUSTRY_ORDER,
    loadSavedIndustryId: loadSavedIndustryId,
    persistIndustry: persistIndustry,
    attachCrossPageIndustryListener: attachCrossPageIndustryListener,
  };
})(typeof window !== 'undefined' ? window : globalThis);
