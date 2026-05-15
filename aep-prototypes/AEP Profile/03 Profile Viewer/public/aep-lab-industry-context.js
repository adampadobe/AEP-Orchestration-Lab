/**
 * Shared Contact centre + Etihad iPad lab industry presets (single localStorage key, cross-tab sync).
 * Toggle ids align with POST /api/profile/generate `industry` keys where possible:
 *   generic | travel | fsi | telecom | retail | media | sports
 * Legacy UI ids (adobe, telco, banking, healthcare, insurance, public_sector) are migrated on read.
 *
 * Load before call-center-demo-apalmer.js and etihad-ipad.js.
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'aepLabCallCenterIndustry_v1';
  var LEGACY_STORAGE_KEY = 'aepCallCenterIndustry_v1_apalmerLab';

  /**
   * Old lab preset ids → current toggle ids (matches `profileGenerateService` INDUSTRY_TO_CONNECTION_STORE keys).
   * @type {Record<string, string>}
   */
  var LEGACY_INDUSTRY_ID_MAP = {
    adobe: 'generic',
    telco: 'telecom',
    banking: 'fsi',
    healthcare: 'generic',
    insurance: 'generic',
    public_sector: 'generic',
  };

  /** @type {Record<string, { label: string; tabShort: string; profileGenerateIndustry: string; heroTitle: string; heroSubtitle: string; pinnedTitle: string; pinnedLead: string; customerEmailLabel: string; agentToolkitTitle: string; agentToolkitHint: string; recordPill: string; notesPlaceholder: string; metricQLabel: string; metricQValue: string; metricQHint: string; metricWaitLabel: string; metricWaitValue: string; metricWaitHint: string; metricAgentsLabel: string; metricAgentsValue: string; metricAgentsHint: string; accent: string; accentSoft: string; emailPlaceholder: string; ipad?: Record<string, unknown> }>} */
  var INDUSTRIES = {
    generic: {
      label: 'Generic · CDP lab',
      tabShort: 'Generic',
      profileGenerateIndustry: 'generic',
      heroTitle: 'Staff workspace',
      heroSubtitle:
        'Industry-agnostic tablet: look up Real-Time Customer Profile for identities, consent, audiences, and recent events — the same unified record agents need across Adobe Experience Platform and Journey Optimizer.',
      pinnedTitle: 'Look up a profile',
      pinnedLead:
        'Enter an email to load profile attributes, identity graph, audiences, and recent events from your AEP sandbox (RTCDP).',
      customerEmailLabel: 'Profile email',
      agentToolkitTitle: 'Agent toolkit',
      agentToolkitHint: 'Use Look up a profile above to retrieve Real-Time Customer Profile data.',
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
      ipad: {},
    },
    travel: {
      label: 'Travel & hospitality',
      tabShort: 'Travel',
      profileGenerateIndustry: 'travel',
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
      ipad: {
        showTravelChrome: true,
        showGaActions: true,
        headerEmoji: '✈️',
        headerSub: 'Gate & cabin crew',
        searchPlaceholder: 'Passenger email or loyalty ID',
        defaultBrandName: 'Etihad Airways',
        detractorHeadline: 'At-risk guest (detractor)',
        detractorBodyTemplate:
          'NPS is below {threshold} — acknowledge concerns early; keep boarding efficient and empathetic.',
        detractorFourthDt: 'Travel preferences',
        detractorOfferChurn:
          'Suggested: acknowledge the journey so far, keep a calm recovery tone, invite quick feedback at the gate, and offer a discreet gesture (e.g. priority re-seating consideration) if policy allows.',
        detractorOfferTier:
          'Suggested: greet as {tier} — thank them for flying Etihad and offer a brief, personal service check-in before boarding.',
        detractorOfferDefault:
          'Suggested: warm greeting using the name on screen, brief empathy for any inconvenience, and invite them to share how we can help today.',
        memberSubtitlePrefix: 'Guest ·',
        tabLabels: { travel: 'Travel', boarding: 'Boarding' },
        cardTitles: {
          'travel-booking': 'Current booking',
          'travel-prefs': 'Travel preferences',
          'loyalty-stats': 'Travel statistics',
          'flight-details': 'Flight details',
          'crew': 'Crew',
        },
        broadcastTitle: '📡 Staff broadcast',
        staffActionBoard: '🛂 Process boarding',
        staffActionUpgrade: '⬆️ Offer upgrade',
        staffActionBaggage: '🧳 Manage baggage',
        broadcastButtons: [
          { event: 'flight.staff.boarding.open', label: 'Open boarding gates', icon: '🛂' },
          { event: 'flight.staff.boarding.final_call', label: 'Final call', icon: '📣' },
          { event: 'flight.staff.doors.prepare', label: 'Prepare doors', icon: '🚪' },
          { event: 'flight.staff.boarding.complete', label: 'Boarding complete', icon: '✅' },
        ],
        ipadOffers: [
          { title: 'Upgrade to Business', subtitle: 'Bid from 500 USD', badge: 'NEW', grade: 'AA' },
          { title: 'Extra legroom', subtitle: 'Rows 20–24', badge: '', grade: 'A' },
          { title: 'Lounge access', subtitle: 'Abu Dhabi', badge: 'HOT', grade: 'AAA' },
          { title: 'Miles accelerator', subtitle: '2× this sector', badge: '', grade: 'A' },
          { title: 'Carbon offset', subtitle: 'Optional add-on', badge: '', grade: 'AA' },
        ],
      },
    },
    fsi: {
      label: 'FSI · banking & wealth',
      tabShort: 'FSI',
      profileGenerateIndustry: 'fsi',
      heroTitle: 'Service & advice workspace',
      heroSubtitle:
        'Banking contact centers pair authenticated callers with a golden customer profile: balances, products, risk flags, and consent — unified in Experience Platform (FSI profile stream).',
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
      ipad: {
        headerSub: 'Branch & wealth tablet',
        searchPlaceholder: 'Registered email or customer ID',
        defaultBrandName: 'Demo Financial',
        detractorHeadline: 'At-risk customer (detractor)',
        detractorFourthDt: 'Service preferences',
        tabLabels: { travel: 'Products & holdings', boarding: 'Queue' },
        cardTitles: {
          'travel-booking': 'Primary products',
          'travel-prefs': 'Risk & servicing notes',
          'loyalty-stats': 'Relationship metrics',
          'flight-details': 'Branch session',
          'crew': 'Team on duty',
        },
        ipadOffers: [
          { title: 'Rate-lock consultation', subtitle: 'Mortgage desk', badge: 'NEW', grade: 'AA' },
          { title: 'Wealth check-in', subtitle: '15-minute review', badge: '', grade: 'A' },
          { title: 'Cashback booster', subtitle: 'Eligible cards', badge: 'HOT', grade: 'AAA' },
          { title: 'Fraud alert coaching', subtitle: 'Soft skills pack', badge: '', grade: 'A' },
          { title: 'ESG savings bundle', subtitle: 'Retail branch', badge: '', grade: 'AA' },
        ],
      },
    },
    telecom: {
      label: 'Telecommunications',
      tabShort: 'Telecom',
      profileGenerateIndustry: 'telecom',
      heroTitle: 'Care & retention workspace',
      heroSubtitle:
        'Telco agents see churn risk, plan changes, and network incidents tied to a subscriber profile streamed from the lab telecom generator.',
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
      ipad: {
        headerSub: 'Retail & care desk',
        searchPlaceholder: 'Account email or line ID',
        defaultBrandName: 'Demo Mobile',
        detractorHeadline: 'At-risk subscriber (detractor)',
        detractorFourthDt: 'Usage & preferences',
        tabLabels: { travel: 'Plan & usage', boarding: 'Dispatch' },
        cardTitles: {
          'travel-booking': 'Line & plan',
          'travel-prefs': 'Network & add-ons',
          'loyalty-stats': 'Tenure & value',
          'flight-details': 'Shift snapshot',
          'crew': 'Floor lead',
        },
        ipadOffers: [
          { title: 'Unlimited weekend data', subtitle: 'Add-on pack', badge: 'NEW', grade: 'AA' },
          { title: 'Family plan merge', subtitle: 'Save 20%', badge: '', grade: 'A' },
          { title: 'Device trade-in boost', subtitle: 'Eligible handsets', badge: 'HOT', grade: 'AAA' },
          { title: 'Roaming shield', subtitle: 'Travel zones', badge: '', grade: 'A' },
          { title: 'Priority technician', subtitle: 'Same-day slot', badge: '', grade: 'AA' },
        ],
      },
    },
    retail: {
      label: 'Retail & e-commerce',
      tabShort: 'Retail',
      profileGenerateIndustry: 'retail',
      heroTitle: 'Store & digital care',
      heroSubtitle:
        'Retail agents see orders, loyalty, and returns in one profile — the same 360° view marketers use for personalization (retail generator stream).',
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
      ipad: {
        headerSub: 'Omni-channel service',
        searchPlaceholder: 'Shopper email or loyalty ID',
        defaultBrandName: 'Demo Retail',
        detractorHeadline: 'At-risk shopper (detractor)',
        detractorFourthDt: 'Channel preferences',
        tabLabels: { travel: 'Orders & visits', boarding: 'Pickup desk' },
        cardTitles: {
          'travel-booking': 'Active orders',
          'travel-prefs': 'Style & fulfilment prefs',
          'loyalty-stats': 'Commerce signals',
          'flight-details': 'Store pulse',
          'crew': 'Shift lead',
        },
        ipadOffers: [
          { title: 'VIP fitting slot', subtitle: 'Flagship store', badge: 'NEW', grade: 'AA' },
          { title: 'Extended returns', subtitle: 'Gold tier', badge: '', grade: 'A' },
          { title: 'Click & collect fast lane', subtitle: 'Today only', badge: 'HOT', grade: 'AAA' },
          { title: 'Loyalty double points', subtitle: 'Online basket', badge: '', grade: 'A' },
          { title: 'Personal stylist chat', subtitle: 'Remote session', badge: '', grade: 'AA' },
        ],
      },
    },
    media: {
      label: 'Media & entertainment',
      tabShort: 'Media',
      profileGenerateIndustry: 'media',
      heroTitle: 'Subscriber support',
      heroSubtitle:
        'Streaming and publishing agents see subscription state, device limits, and win-back offers from the same profile marketers use for suppression (media generator stream).',
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
      ipad: {
        headerSub: 'Subscriber care',
        searchPlaceholder: 'Subscriber email or account ID',
        defaultBrandName: 'Demo Streaming',
        detractorHeadline: 'At-risk subscriber (detractor)',
        detractorFourthDt: 'Watch habits',
        tabLabels: { travel: 'Entitlements', boarding: 'Queue' },
        cardTitles: {
          'travel-booking': 'Subscription snapshot',
          'travel-prefs': 'Devices & profiles',
          'loyalty-stats': 'Engagement scores',
          'flight-details': 'Ops snapshot',
          'crew': 'Lead agent',
        },
        ipadOffers: [
          { title: 'Annual plan discount', subtitle: 'Limited promo', badge: 'NEW', grade: 'AA' },
          { title: 'Sports add-on trial', subtitle: '7 days free', badge: '', grade: 'A' },
          { title: '4K upgrade', subtitle: 'Eligible devices', badge: 'HOT', grade: 'AAA' },
          { title: 'Pause & save', subtitle: 'Up to 3 months', badge: '', grade: 'A' },
          { title: 'Household merge', subtitle: 'Single bill', badge: '', grade: 'AA' },
        ],
      },
    },
    sports: {
      label: 'Sports & venues',
      tabShort: 'Sports',
      profileGenerateIndustry: 'sports',
      heroTitle: 'Fan & member services',
      heroSubtitle:
        'Sports organisations unify ticketing, memberships, and merchandise in one fan profile — modelled here with the lab sports generator stream.',
      pinnedTitle: 'Look up a member',
      pinnedLead: 'Enter email to load membership tier, ticket history, and engagement signals from the CDP.',
      customerEmailLabel: 'Member email',
      agentToolkitTitle: 'Fan desk toolkit',
      agentToolkitHint: 'Use Look up a member above for seat history and loyalty context.',
      recordPill: 'Session logged',
      notesPlaceholder: 'Seat map, refund, merch… (demo — not saved)',
      metricQLabel: 'Calls in queue',
      metricQValue: '19',
      metricQHint: 'Skill: Memberships',
      metricWaitLabel: 'Longest wait',
      metricWaitValue: '03:10',
      metricWaitHint: 'Match night SLA',
      metricAgentsLabel: 'Crew available',
      metricAgentsValue: '33',
      metricAgentsHint: 'Volunteer coverage 12%',
      accent: '#15803d',
      accentSoft: '#dcfce7',
      emailPlaceholder: 'fan@club.example.com',
      ipad: {
        headerSub: 'Venue guest services',
        searchPlaceholder: 'Member email or fan ID',
        defaultBrandName: 'Demo Arena',
        detractorHeadline: 'At-risk member (detractor)',
        detractorFourthDt: 'Match-day prefs',
        tabLabels: { travel: 'Tickets & access', boarding: 'Gate' },
        cardTitles: {
          'travel-booking': 'Upcoming events',
          'travel-prefs': 'Access needs',
          'loyalty-stats': 'Fan value signals',
          'flight-details': 'Venue snapshot',
          'crew': 'Event captain',
        },
        ipadOffers: [
          { title: 'Merch bundle', subtitle: 'Pickup at kiosk', badge: 'NEW', grade: 'AA' },
          { title: 'Seat upgrade window', subtitle: 'Last-minute', badge: '', grade: 'A' },
          { title: 'Parking pass', subtitle: 'Season holders', badge: 'HOT', grade: 'AAA' },
          { title: 'Kids club fast track', subtitle: 'Family plan', badge: '', grade: 'A' },
          { title: 'Rain-check credit', subtitle: 'Weather policy', badge: '', grade: 'AA' },
        ],
      },
    },
  };

  var INDUSTRY_ORDER = ['generic', 'travel', 'fsi', 'telecom', 'retail', 'media', 'sports'];

  /** Baseline iPad chrome when `industry.ipad` omits a field (generic / industry-agnostic). */
  var IPAD_UI_DEFAULTS = {
    showTravelChrome: false,
    showGaActions: false,
    headerEmoji: '💼',
    headerSub: 'Front-line service',
    searchPlaceholder: 'Customer email or identifier',
    defaultBrandName: 'Experience Cloud',
    detractorHeadline: 'At-risk customer (detractor)',
    detractorBodyTemplate:
      'NPS is below {threshold} — acknowledge concerns early, confirm the issue, and close with a clear next step.',
    detractorFourthDt: 'Profile highlights',
    detractorOfferChurn:
      'Suggested: validate frustration, recap commitments already made, and offer a supervised follow-up (e.g. callback / case owner) if policy allows.',
    detractorOfferTier: 'Suggested: recognise {tier} status with a concise thank-you, then focus on resolution speed and a single actionable next step.',
    detractorOfferDefault:
      'Suggested: open with empathy, restate the customer goal in one sentence, and confirm consent before any proactive outreach.',
    memberSubtitlePrefix: 'Profile ·',
    tabLabels: {
      personal: 'Personal',
      travel: 'Activity',
      loyalty: 'Loyalty',
      preferences: 'Preferences',
      offers: 'Offers',
      boarding: 'Boarding',
    },
    cardTitles: {
      'personal-info': 'Personal information',
      'contact-details': 'Contact details',
      'travel-booking': 'Key touchpoints',
      'travel-prefs': 'Preferences & notes',
      'loyalty-status': 'Loyalty status',
      'loyalty-stats': 'Engagement metrics',
      'ai-insights': 'Scores & signals',
      communication: 'Communication preferences',
      'flight-details': 'Session details',
      crew: 'Team roster',
    },
    broadcastTitle: '📡 Staff signals (demo stream)',
    broadcastButtons: [
      { event: 'flight.staff.boarding.open', label: 'Begin service window', icon: '▶' },
      { event: 'flight.staff.boarding.final_call', label: 'Final reminder', icon: '📣' },
      { event: 'flight.staff.doors.prepare', label: 'Prepare wrap-up', icon: '🚪' },
      { event: 'flight.staff.boarding.complete', label: 'Mark interaction complete', icon: '✅' },
    ],
    ipadOffers: [
      { title: 'Profile completeness workshop', subtitle: '15-minute walkthrough', badge: 'NEW', grade: 'AA' },
      { title: 'Consent preference centre', subtitle: 'Rebuild trust', badge: '', grade: 'A' },
      { title: 'Journey audit pack', subtitle: 'Lifecycle QA', badge: 'HOT', grade: 'AA' },
      { title: 'Signal health check', subtitle: 'Streaming review', badge: '', grade: 'A' },
      { title: 'Sandbox quickstart', subtitle: 'Architect desk', badge: '', grade: 'AA' },
    ],
    staffActionBoard: '🛂 Process service step',
    staffActionUpgrade: '⬆️ Suggest next-best action',
    staffActionBaggage: '🧳 Log follow-up task',
  };

  function shallowCopy(o) {
    var out = {};
    for (var k in o) {
      if (Object.prototype.hasOwnProperty.call(o, k)) out[k] = o[k];
    }
    return out;
  }

  /**
   * @param {string} labIndustryId
   * @returns {Record<string, unknown> & { profileGenerateIndustry: string }}
   */
  function mergeIpadUi(labIndustryId) {
    var def = INDUSTRIES[labIndustryId] || INDUSTRIES.generic;
    var o = def.ipad || {};
    var out = shallowCopy(IPAD_UI_DEFAULTS);
    var k;
    for (k in o) {
      if (!Object.prototype.hasOwnProperty.call(o, k)) continue;
      if (k === 'tabLabels' || k === 'cardTitles') {
        out[k] = Object.assign({}, IPAD_UI_DEFAULTS[k], o[k]);
      } else {
        out[k] = o[k];
      }
    }
    out.profileGenerateIndustry = def.profileGenerateIndustry || 'generic';
    return out;
  }

  function normalizeLabIndustryId(raw) {
    var s = String(raw || '').trim();
    if (INDUSTRIES[s]) return s;
    if (LEGACY_INDUSTRY_ID_MAP[s]) return LEGACY_INDUSTRY_ID_MAP[s];
    return 'generic';
  }

  function loadSavedIndustryId() {
    try {
      var raw = global.localStorage.getItem(STORAGE_KEY);
      var nid = normalizeLabIndustryId(raw);
      if (raw && raw !== nid) {
        try {
          global.localStorage.setItem(STORAGE_KEY, nid);
        } catch (_) {
          /* ignore */
        }
      }
      if (nid && INDUSTRIES[nid]) return nid;
      var legacy = global.localStorage.getItem(LEGACY_STORAGE_KEY);
      var lid = normalizeLabIndustryId(legacy);
      if (legacy && legacy !== lid) {
        try {
          global.localStorage.setItem(LEGACY_STORAGE_KEY, lid);
        } catch (_) {
          /* ignore */
        }
      }
      if (lid && INDUSTRIES[lid]) return lid;
    } catch (_) {
      /* ignore */
    }
    return 'generic';
  }

  function persistIndustry(id) {
    var next = INDUSTRIES[id] ? id : 'generic';
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
      var n = normalizeLabIndustryId(raw);
      return INDUSTRIES[n] ? n : loadSavedIndustryId();
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

  function getProfileGenerateIndustry(labIndustryId) {
    var def = INDUSTRIES[labIndustryId] || INDUSTRIES.generic;
    return def.profileGenerateIndustry || 'generic';
  }

  global.AepLabIndustryContext = {
    STORAGE_KEY: STORAGE_KEY,
    LEGACY_STORAGE_KEY: LEGACY_STORAGE_KEY,
    LEGACY_INDUSTRY_ID_MAP: LEGACY_INDUSTRY_ID_MAP,
    INDUSTRIES: INDUSTRIES,
    INDUSTRY_ORDER: INDUSTRY_ORDER,
    IPAD_UI_DEFAULTS: IPAD_UI_DEFAULTS,
    mergeIpadUi: mergeIpadUi,
    normalizeLabIndustryId: normalizeLabIndustryId,
    getProfileGenerateIndustry: getProfileGenerateIndustry,
    loadSavedIndustryId: loadSavedIndustryId,
    persistIndustry: persistIndustry,
    attachCrossPageIndustryListener: attachCrossPageIndustryListener,
  };
})(typeof window !== 'undefined' ? window : globalThis);
