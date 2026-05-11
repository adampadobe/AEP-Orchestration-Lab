/**
 * Contact center demo — off-canvas nav, AEP profile lookup, industry presets (bottom customise dock).
 */
(function () {
  const INDUSTRY_STORAGE_KEY = 'aepCallCenterIndustry_v1';

  /** @type {Record<string, { label: string; tabShort: string; heroTitle: string; heroSubtitle: string; pinnedTitle: string; pinnedLead: string; customerEmailLabel: string; agentToolkitTitle: string; agentToolkitHint: string; recordPill: string; notesPlaceholder: string; metricQLabel: string; metricQValue: string; metricQHint: string; metricWaitLabel: string; metricWaitValue: string; metricWaitHint: string; metricAgentsLabel: string; metricAgentsValue: string; metricAgentsHint: string; accent: string; accentSoft: string; emailPlaceholder: string }>} */
  const INDUSTRIES = {
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

  const INDUSTRY_ORDER = [
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

  const customerEmail = document.getElementById('customerEmail');
  if (typeof attachEmailDatalist === 'function') attachEmailDatalist('customerEmail');

  const queryProfileBtn = document.getElementById('queryProfileBtn');
  const infoEcid = document.getElementById('infoEcid');
  const generatorTargetSelect = document.getElementById('generatorTarget');
  const ccStatus = document.getElementById('ccStatus');
  const ccScreenPop = document.getElementById('ccScreenPop');
  const ccScreenPopName = document.getElementById('ccScreenPopName');
  const openBtn = document.getElementById('ccNavOpenBtn');
  const closeBtn = document.getElementById('ccNavCloseBtn');
  const backdrop = document.getElementById('ccNavBackdrop');
  const sidebar = document.getElementById('ccSidebar');
  const customizeDock = document.getElementById('ccCustomizeDock');
  const customizeTabBtn = document.getElementById('ccCustomizeTabBtn');
  const customizePanel = document.getElementById('ccCustomizePanel');
  const industrySelect = document.getElementById('ccIndustrySelect');
  const industryTabBadge = document.getElementById('ccIndustryTabBadge');

  /** @type {Array<{ id: string, label: string }>} */
  let generatorTargets = [];

  function augmentCcGeneratorPostBody(body) {
    if (typeof window.AepDemoGeneratorTargets !== 'undefined' && window.AepDemoGeneratorTargets.augmentGeneratorPostBody) {
      return window.AepDemoGeneratorTargets.augmentGeneratorPostBody(body);
    }
    const src = body && typeof body === 'object' ? body : {};
    const b = { ...src };
    if (!b.sandbox && typeof window.AepGlobalSandbox !== 'undefined' && typeof window.AepGlobalSandbox.getSandboxName === 'function') {
      const s = String(window.AepGlobalSandbox.getSandboxName() || '').trim();
      if (s) b.sandbox = s;
    }
    return b;
  }

  let currentIndustryId = 'adobe';

  /** @type {number|null} */
  let sessionTimerId = null;
  let sessionSeconds = 0;

  function setElText(elId, text) {
    const el = document.getElementById(elId);
    if (el) el.textContent = text;
  }

  function getIndustry(id) {
    return INDUSTRIES[id] || INDUSTRIES.adobe;
  }

  function loadSavedIndustryId() {
    try {
      const raw = window.localStorage.getItem(INDUSTRY_STORAGE_KEY);
      if (raw && INDUSTRIES[raw]) return raw;
    } catch (_) {
      /* ignore */
    }
    return 'adobe';
  }

  function applyIndustry(id) {
    const ind = getIndustry(id);
    currentIndustryId = INDUSTRIES[id] ? id : 'adobe';
    document.body.dataset.ccIndustry = currentIndustryId;
    document.body.style.setProperty('--cc-accent', ind.accent);
    document.body.style.setProperty('--cc-accent-soft', ind.accentSoft);

    setElText('ccPinnedHeading', ind.pinnedTitle);
    setElText('ccPinnedLead', ind.pinnedLead);
    setElText('ccWorkspaceTitle', ind.heroTitle);
    setElText('ccWorkspaceSubtitle', ind.heroSubtitle);
    setElText('ccCustomerEmailLabel', ind.customerEmailLabel);
    setElText('ccAgentToolkitTitle', ind.agentToolkitTitle);
    setElText('ccAgentToolkitHint', ind.agentToolkitHint);
    setElText('ccRecordPill', ind.recordPill);
    setElText('ccMetricQLabel', ind.metricQLabel);
    setElText('ccMetricQValue', ind.metricQValue);
    setElText('ccMetricQHint', ind.metricQHint);
    setElText('ccMetricWaitLabel', ind.metricWaitLabel);
    setElText('ccMetricWaitValue', ind.metricWaitValue);
    setElText('ccMetricWaitHint', ind.metricWaitHint);
    setElText('ccMetricAgentsLabel', ind.metricAgentsLabel);
    setElText('ccMetricAgentsValue', ind.metricAgentsValue);
    setElText('ccMetricAgentsHint', ind.metricAgentsHint);

    if (industryTabBadge) industryTabBadge.textContent = ind.label;
    if (customerEmail) {
      customerEmail.placeholder = ind.emailPlaceholder;
    }
    const notes = document.getElementById('ccNotes');
    if (notes) notes.placeholder = ind.notesPlaceholder;
    if (industrySelect) industrySelect.value = currentIndustryId;
  }

  function persistIndustry(id) {
    try {
      window.localStorage.setItem(INDUSTRY_STORAGE_KEY, id);
    } catch (_) {
      /* ignore */
    }
  }

  function initIndustryUi() {
    if (industrySelect) {
      industrySelect.innerHTML = '';
      INDUSTRY_ORDER.forEach((key) => {
        const def = INDUSTRIES[key];
        if (!def) return;
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = def.label;
        industrySelect.appendChild(opt);
      });
    }
    applyIndustry(loadSavedIndustryId());
  }

  function setCustomizeOpen(open) {
    if (!customizeDock) return;
    customizeDock.classList.toggle('cc-customize-open', !!open);
    if (customizeTabBtn) customizeTabBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (customizePanel) customizePanel.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  customizeTabBtn &&
    customizeTabBtn.addEventListener('click', () => {
      const next = !customizeDock.classList.contains('cc-customize-open');
      setCustomizeOpen(next);
    });

  industrySelect &&
    industrySelect.addEventListener('change', () => {
      const id = industrySelect.value;
      applyIndustry(id);
      persistIndustry(id);
    });

  function formatMmSs(totalSec) {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function updateSessionTimerEl() {
    const txt = formatMmSs(sessionSeconds);
    const dock = document.getElementById('ccSessionTimerDock');
    const hero = document.getElementById('ccHeroTimer');
    if (dock) dock.textContent = txt;
    if (hero) hero.textContent = txt;
  }

  function stopSessionTimer() {
    if (sessionTimerId != null) {
      window.clearInterval(sessionTimerId);
      sessionTimerId = null;
    }
  }

  function startSessionTimer() {
    stopSessionTimer();
    sessionSeconds = 0;
    updateSessionTimerEl();
    sessionTimerId = window.setInterval(() => {
      sessionSeconds += 1;
      updateSessionTimerEl();
    }, 1000);
  }

  function copyElText(fromId) {
    const el = document.getElementById(fromId);
    return el ? String(el.textContent || '').trim() : '';
  }

  function mirrorAboutCardsFromDrawer() {
    const pairs = [
      ['profileDrawerEmail', 'ccCardEmail'],
      ['profileDrawerPhone', 'ccCardPhone'],
      ['profileDrawerCity', 'ccCardCity'],
      ['profileDrawerName', 'ccCardFullName'],
      ['profileDrawerLtv', 'ccCardLtv'],
      ['profileDrawerPropensityScore', 'ccCardPropensity'],
      ['profileDrawerChurnScore', 'ccCardChurn'],
      ['profileDrawerLoyalty', 'ccCardLoyalty'],
    ];
    pairs.forEach(([from, to]) => {
      const v = copyElText(from);
      setElText(to, v && v !== '' ? v : '—');
    });
    const ecidProfile = copyElText('profileDrawerDesktopId');
    const ecidHint = infoEcid ? String(infoEcid.textContent || '').trim() : '';
    setElText('ccSigEcid', ecidProfile && ecidProfile !== '—' ? ecidProfile : ecidHint || '—');

    const audUl = document.getElementById('profileDrawerAudiences');
    let audSummary = '—';
    if (audUl) {
      const lis = audUl.querySelectorAll('li');
      const first = lis[0];
      if (first && first.textContent && !/no audience/i.test(first.textContent)) {
        audSummary = lis.length + ' segment(s)';
      }
    }
    setElText('ccSigAud', audSummary);

    const firstConsent = document.querySelector('.aep-profile-drawer-card-consent input[type="checkbox"]');
    setElText('ccSigMarket', firstConsent && firstConsent.checked ? 'Opted in' : '—');

    updateFauxCardPan();
  }

  function updateFauxCardPan() {
    const el = document.getElementById('ccFauxCardLast4');
    if (!el) return;
    const ecid = infoEcid ? String(infoEcid.textContent || '').trim() : '';
    if (ecid && ecid !== '—' && /^\d+$/.test(ecid) && ecid.length >= 4) {
      el.textContent = '···· ···· ···· ' + ecid.slice(-4);
    } else {
      el.textContent = '···· ···· ···· ——';
    }
  }

  function mirrorProfileToAgentUi() {
    const name = copyElText('profileDrawerName');
    const email = copyElText('profileDrawerEmail');
    const phone = copyElText('profileDrawerPhone');
    const fallbackEmail = customerEmail ? String(customerEmail.value || '').trim() : '';
    const dispName = name && name !== 'No profile loaded' ? name : fallbackEmail || 'Customer';
    setElText('ccSessionName', dispName);
    const emailDisp = email && email !== '—' ? email : fallbackEmail || '—';
    setElText('ccSessionEmail', emailDisp);
    const phoneDisp = phone && phone !== 'Unknown' && phone !== '—' ? phone : '—';
    setElText('ccHeroPhoneLine', phoneDisp);

    const avFrom = document.getElementById('profileDrawerAvatar');
    const heroAv = document.getElementById('ccHeroAvatar');
    if (heroAv && avFrom && avFrom.getAttribute('src')) heroAv.src = avFrom.src;

    setElText('ccHeroStatusVerb', 'Talking');
    setElText('ccHeroChannel', 'Virtual engagement · Adobe Experience Platform');

    const qn = document.getElementById('ccQueueActiveName');
    const qs = document.getElementById('ccQueueActiveSub');
    if (qn)
      qn.textContent =
        name && name !== 'No profile loaded' ? name.split(/\s+/)[0] + ' · active' : 'Awaiting lookup';
    if (qs) qs.textContent = fallbackEmail || emailDisp !== '—' ? 'On session' : 'Session idle';
  }

  function resetIdleAgentUi() {
    setElText('ccSessionName', 'No active customer');
    setElText('ccSessionEmail', '—');
    setElText('ccHeroPhoneLine', '—');
    setElText('ccHeroStatusVerb', 'Idle');
    setElText('ccHeroChannel', 'Load a profile to simulate engagement');
    const heroAv = document.getElementById('ccHeroAvatar');
    if (heroAv) heroAv.src = 'https://contenthosting.web.app/AEPProfile/avatar-female.png';
    setElText('ccQueueActiveName', 'Awaiting lookup');
    const qs = document.getElementById('ccQueueActiveSub');
    if (qs) qs.textContent = 'Session idle';
    stopSessionTimer();
    sessionSeconds = 0;
    updateSessionTimerEl();
    [
      'ccCardEmail',
      'ccCardPhone',
      'ccCardCity',
      'ccCardFullName',
      'ccCardLtv',
      'ccCardPropensity',
      'ccCardChurn',
      'ccCardLoyalty',
      'ccSigEcid',
      'ccSigAud',
      'ccSigMarket',
    ].forEach((id) => setElText(id, '—'));
    updateFauxCardPan();
  }

  const WORKSPACE_TABS = [
    { key: 'details', tab: 'ccTabDetails', panel: 'ccPanelDetails' },
    { key: 'orders', tab: 'ccTabOrders', panel: 'ccPanelOrders' },
    { key: 'notes', tab: 'ccTabNotes', panel: 'ccPanelNotes' },
    { key: 'platform', tab: 'ccTabPlatform', panel: 'ccPanelPlatform' },
  ];

  function activateWorkspaceTab(whichKey) {
    WORKSPACE_TABS.forEach(({ key, tab, panel }) => {
      const active = key === whichKey;
      const t = document.getElementById(tab);
      const p = document.getElementById(panel);
      if (t) {
        t.classList.toggle('cc-tab--active', active);
        t.setAttribute('aria-selected', active ? 'true' : 'false');
      }
      if (p) {
        p.classList.toggle('cc-tab-panel--active', active);
        p.hidden = !active;
      }
    });
  }

  WORKSPACE_TABS.forEach(({ key, tab }) => {
    const el = document.getElementById(tab);
    if (el)
      el.addEventListener('click', () => {
        activateWorkspaceTab(key);
      });
  });

  const ccSessionEndBtn = document.getElementById('ccSessionEndBtn');
  ccSessionEndBtn &&
    ccSessionEndBtn.addEventListener('click', () => {
      stopSessionTimer();
      sessionSeconds = 0;
      updateSessionTimerEl();
      resetIdleAgentUi();
      if (ccScreenPop) ccScreenPop.hidden = true;
      document.body.classList.remove('call-center-profile-loaded');
    });

  const ccToggleContact = document.getElementById('ccToggleContact');
  const ccToggleOrg = document.getElementById('ccToggleOrg');
  ccToggleContact &&
    ccToggleContact.addEventListener('click', () => {
      ccToggleContact.classList.add('is-active');
      if (ccToggleOrg) ccToggleOrg.classList.remove('is-active');
    });
  ccToggleOrg &&
    ccToggleOrg.addEventListener('click', () => {
      ccToggleOrg.classList.add('is-active');
      if (ccToggleContact) ccToggleContact.classList.remove('is-active');
    });

  function demoExperienceChannel() {
    try {
      if (/\baepSimMobile=1\b/.test(window.location.search || '')) return 'Mobile';
      if (document.documentElement && document.documentElement.classList.contains('aep-sim-mobile')) return 'Mobile';
    } catch (_) {
      /* ignore */
    }
    return 'Web';
  }

  function demoApplicationLoginEventType() {
    try {
      if (/\baepSimMobile=1\b/.test(window.location.search || '')) return 'mobile.logon';
      if (document.documentElement && document.documentElement.classList.contains('aep-sim-mobile')) return 'mobile.logon';
    } catch (_) {
      /* ignore */
    }
    return 'application.login';
  }

  function getEmail() {
    return (customerEmail && customerEmail.value) || '';
  }

  function setStatus(text, type) {
    if (!ccStatus) return;
    ccStatus.textContent = text || '';
    ccStatus.className = 'call-center-status call-center-pinned-status' + (type ? ' call-center-status--' + type : '');
    ccStatus.hidden = !text;
  }

  function getSelectedGeneratorTarget() {
    const id = (generatorTargetSelect && generatorTargetSelect.value) || '';
    return generatorTargets.find((t) => t.id === id) || generatorTargets[0] || null;
  }

  function getEcidForExperienceEvent() {
    const ecidText = infoEcid ? String(infoEcid.textContent || '').trim() : '';
    return ecidText && ecidText !== '—' && /^\d+$/.test(ecidText) && ecidText.length >= 10 ? ecidText : null;
  }

  async function sendApplicationLoginExperienceEvent(email) {
    const target = getSelectedGeneratorTarget();
    const ecid = getEcidForExperienceEvent();
    const ind = getIndustry(currentIndustryId);
    const body = {
      targetId: target ? target.id : undefined,
      email: String(email || '').trim(),
      eventType: demoApplicationLoginEventType(),
      viewName: 'Contact center · ' + ind.tabShort,
      viewUrl: typeof window !== 'undefined' ? window.location.href.split('?')[0] : '',
      channel: demoExperienceChannel(),
    };
    if (ecid) body.ecid = ecid;
    const res = await fetch('/api/events/generator', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(augmentCcGeneratorPostBody(body)),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || data.message || 'Request failed.');
    }
    return data;
  }

  async function loadGeneratorTargets() {
    if (!generatorTargetSelect) return;
    if (typeof window.AepDemoGeneratorTargets !== 'undefined' && window.AepDemoGeneratorTargets.loadGeneratorTargetsIntoSelect) {
      generatorTargets = await window.AepDemoGeneratorTargets.loadGeneratorTargetsIntoSelect(generatorTargetSelect, {});
      return;
    }
    try {
      const res = await fetch('/api/events/generator-targets');
      const data = await res.json().catch(() => ({}));
      generatorTargets = Array.isArray(data.targets) ? data.targets : [];
      generatorTargetSelect.innerHTML = '';
      if (generatorTargets.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No targets (check event-generator-targets.json)';
        generatorTargetSelect.appendChild(opt);
        return;
      }
      generatorTargets.forEach((t) => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.label || t.id;
        generatorTargetSelect.appendChild(opt);
      });
    } catch {
      generatorTargetSelect.innerHTML = '';
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Failed to load targets';
      generatorTargetSelect.appendChild(opt);
    }
  }

  function setNavOpen(open) {
    document.body.classList.toggle('call-center-nav-open', !!open);
    if (backdrop) backdrop.hidden = !open;
    if (openBtn) openBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (sidebar) sidebar.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  openBtn &&
    openBtn.addEventListener('click', () => {
      setNavOpen(true);
    });
  closeBtn &&
    closeBtn.addEventListener('click', () => {
      setNavOpen(false);
    });
  backdrop &&
    backdrop.addEventListener('click', () => {
      setNavOpen(false);
    });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (document.body.classList.contains('call-center-nav-open')) {
      setNavOpen(false);
      return;
    }
    if (customizeDock && customizeDock.classList.contains('cc-customize-open')) {
      setCustomizeOpen(false);
    }
  });

  queryProfileBtn &&
    queryProfileBtn.addEventListener('click', async () => {
      const email = getEmail().trim();
      if (!email) {
        setStatus('Enter a customer email first.', 'error');
        return;
      }
      if (!window.AepProfileDrawer) {
        setStatus('Profile drawer script not loaded.', 'error');
        return;
      }
      queryProfileBtn.disabled = true;
      setStatus('Loading profile from AEP…', '');
      stopSessionTimer();
      sessionSeconds = 0;
      updateSessionTimerEl();
      let profileResult = null;
      try {
        profileResult = await window.AepProfileDrawer.loadProfileDataForDrawer(email, {
          onUserMessage: setStatus,
          addEmailOnSuccess: true,
        });
        if (profileResult && profileResult.ok && profileResult.found) {
          try {
            await sendApplicationLoginExperienceEvent(email);
            setStatus(
              'Profile loaded. Sent ' + demoApplicationLoginEventType() + ' to AEP (with ECID when available).',
              'success',
            );
          } catch (loginErr) {
            setStatus(
              'Profile loaded. ' +
                demoApplicationLoginEventType() +
                ' failed: ' +
                (loginErr && loginErr.message ? loginErr.message : String(loginErr)),
              'error',
            );
          }
          window.requestAnimationFrame(() => {
            mirrorProfileToAgentUi();
            mirrorAboutCardsFromDrawer();
            startSessionTimer();
            activateWorkspaceTab('details');
          });
        } else if (profileResult && profileResult.ok && !profileResult.found) {
          setStatus('No profile in store for this email. Try another address or seed data in the sandbox.', 'warn');
          resetIdleAgentUi();
        }
        if (ccScreenPop && ccScreenPopName && profileResult && profileResult.found) {
          const nameEl = document.getElementById('profileDrawerName');
          const displayName = nameEl && nameEl.textContent ? nameEl.textContent.trim() : email;
          ccScreenPopName.textContent = displayName;
          ccScreenPop.hidden = false;
        }
      } catch (err) {
        setStatus((err && err.message) || 'Could not load profile.', 'error');
      } finally {
        if (profileResult && profileResult.ok && profileResult.found) {
          document.body.classList.add('call-center-profile-loaded');
        } else {
          document.body.classList.remove('call-center-profile-loaded');
        }
        queryProfileBtn.disabled = false;
      }
    });

  document.body.classList.add('aep-profile-drawer-open');

  document.querySelectorAll('.call-center-state-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.call-center-state-btn').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
    });
  });

  initIndustryUi();
  void loadGeneratorTargets();
  if (typeof window.AepDemoGeneratorTargets !== 'undefined' && window.AepDemoGeneratorTargets.onSandboxChange) {
    window.AepDemoGeneratorTargets.onSandboxChange(function () {
      void loadGeneratorTargets();
    });
  }
})();
