/**
 * Contact center demo — off-canvas nav, AEP profile lookup, industry presets (bottom customise dock).
 */
(function () {
  const INDUSTRY_STORAGE_KEY = 'aepCallCenterIndustry_v1_apalmerLab';

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

  const BOOKING_PLACEHOLDER_HTML =
    '<p class="cc-history-lead" id="ccBookingPlaceholder">Load a customer profile above to see their flight booking from Adobe Experience Platform.</p>';

  /** @type {'voice'|'email'|'mobile'} */
  let selectedChannel = 'voice';

  function setSelectedChannel(ch) {
    if (ch !== 'voice' && ch !== 'email' && ch !== 'mobile') return;
    selectedChannel = ch;
    document.querySelectorAll('.cc-channel-btn').forEach((btn) => {
      const active = btn.dataset.ch === ch;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  document.querySelectorAll('.cc-channel-btn').forEach((btn) => {
    btn.addEventListener('click', () => setSelectedChannel(btn.dataset.ch));
  });

  function getRtdbSandboxName() {
    try {
      if (typeof window.AepGlobalSandbox !== 'undefined' && typeof window.AepGlobalSandbox.getSandboxName === 'function') {
        return window.AepGlobalSandbox.getSandboxName() || 'apalmer';
      }
    } catch (_) {
      /* ignore */
    }
    try {
      const m = window.location.search.match(/[?&]sandbox=([^&]+)/);
      if (m) return decodeURIComponent(m[1]);
    } catch (_) {
      /* ignore */
    }
    return 'apalmer';
  }

  async function fetchRtdbLookups() {
    const cfg = (typeof window.firebaseDatabaseConfig !== 'undefined' && window.firebaseDatabaseConfig) || {};
    const dbUrl = cfg.databaseURL || 'https://aep-orchestration-lab-default-rtdb.firebaseio.com';
    const sandbox = getRtdbSandboxName();
    try {
      const res = await fetch(`${dbUrl}/ajoLookups/${encodeURIComponent(sandbox)}.json`);
      return res.ok ? await res.json() : null;
    } catch (_) {
      return null;
    }
  }

  function accentSoftFromColour(colour) {
    if (typeof colour !== 'string' || !/^#([0-9a-fA-F]{6})$/.test(colour.trim())) return null;
    return colour.trim() + '22';
  }

  function applyRtdbToAgentUi(rtdb) {
    if (!rtdb || typeof rtdb !== 'object') return;
    const sp = rtdb.StaffPortal || {};
    const cd = rtdb.CoreDemoData || {};

    const agentName = sp.AgentName || sp.agentName || null;
    if (agentName) {
      const nameEl = document.getElementById('ccAgentName');
      if (nameEl) nameEl.textContent = agentName;
      const initialsEl = document.getElementById('ccUserInitials');
      if (initialsEl) {
        const parts = String(agentName).trim().split(/\s+/);
        initialsEl.textContent = parts
          .map((p) => p[0] || '')
          .join('')
          .slice(0, 2)
          .toUpperCase();
        initialsEl.title = agentName;
      }
    }

    const colour = sp.Colour || cd.Colour || null;
    if (colour) {
      document.body.style.setProperty('--cc-accent', colour);
      const soft = accentSoftFromColour(String(colour));
      if (soft) document.body.style.setProperty('--cc-accent-soft', soft);
    }
  }

  async function initFromRtdb() {
    const data = await fetchRtdbLookups();
    applyRtdbToAgentUi(data);
  }

  async function fetchProfileTableRows(email) {
    if (!email) return null;
    const sandbox = getRtdbSandboxName();
    const qs = `identifier=${encodeURIComponent(email)}&namespace=email&sandbox=${encodeURIComponent(sandbox)}`;
    try {
      const res = await fetch(`/api/profile/table?${qs}`);
      return res.ok ? await res.json() : null;
    } catch (_) {
      return null;
    }
  }

  function extractTravelFromRows(tablePayload) {
    const rows = tablePayload && Array.isArray(tablePayload.rows) ? tablePayload.rows : [];
    const find = (fragment) => {
      const lf = fragment.toLowerCase();
      const row = rows.find((r) => r.path && r.path.toLowerCase().includes(lf) && r.value && r.value !== '');
      return row ? row.value : null;
    };
    return {
      flightNumber: find('flightreservations.flightnumber'),
      flightClass: find('flightreservations.flightclass'),
      flightDate: find('flightreservations.flightdate'),
      confirmationNumber: find('flightreservations.confirmationnumber'),
      departureAirportCode: find('flightreservations.departureairportcode'),
      arrivalAirportCode: find('flightreservations.arrivalairportcode'),
      flightReservationStatus: find('flightreservations.flightreservationstatus'),
      numberOfPassengers: find('flightreservations.numberofpassengers'),
      layoverAirport: find('multilleg.layoverairportcode_1') || find('layoverairportcode'),
      seatPreference: find('travelpreferences.seat'),
      mealPreference: find('travelpreferences.meal'),
      loyaltyPoints: find('loyaltydetails.points'),
      loyaltyId: find('identification.core.loyaltyid'),
    };
  }

  function formatFlightDate(raw) {
    if (!raw) return '—';
    try {
      const d = new Date(raw);
      if (isNaN(d.getTime())) return raw;
      return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (_) {
      return raw;
    }
  }

  function generatorChannelLabel() {
    return selectedChannel === 'voice' ? 'Call' : selectedChannel === 'mobile' ? 'Mobile' : 'Web';
  }

  function renderBookingPanel(travel, email) {
    const panel = document.getElementById('ccPanelOrders');
    if (!panel) return;

    if (!travel || (!travel.flightNumber && !travel.confirmationNumber)) {
      panel.innerHTML =
        '<p class="cc-history-lead">No booking data found in profile for this customer.</p>' +
        '<p class="cc-history-lead cc-booking-seed-hint">Expected at <code>_demoemea.travelReservations.flightReservations</code> in the AEP sandbox. ' +
        'Seed the profile via Profile Generation to populate this view.</p>';
      return;
    }

    const dept = travel.departureAirportCode || '—';
    const arr = travel.arrivalAirportCode || '—';
    const flt = travel.flightNumber || '—';
    const cls = travel.flightClass || '—';
    const dt = formatFlightDate(travel.flightDate);
    const ref = travel.confirmationNumber || '—';
    const pax = travel.numberOfPassengers || '1';
    const stat = travel.flightReservationStatus || 'Confirmed';
    const seat = travel.seatPreference || '—';
    const meal = travel.mealPreference || '—';
    const pts = travel.loyaltyPoints ? Number(travel.loyaltyPoints).toLocaleString() : '—';
    const lid = travel.loyaltyId || '—';
    const via = travel.layoverAirport ? ` via ${travel.layoverAirport}` : '';

    const statusCls = /cancel/i.test(stat)
      ? 'cc-tx-status--warn'
      : /wait|pending/i.test(stat)
        ? 'cc-tx-status--pending'
        : 'cc-tx-status--ok';

    panel.innerHTML = `
    <div class="cc-order-card">
      <div class="cc-order-actions">
        <button type="button" class="cc-order-chip cc-order-chip--action cc-booking-action" data-event="contact.center.seat.change">Change seat</button>
        <button type="button" class="cc-order-chip cc-order-chip--action cc-booking-action" data-event="contact.center.meal.change">Meal preference</button>
        <button type="button" class="cc-order-chip cc-order-chip--action cc-booking-action" data-event="contact.center.upgrade.request">Request upgrade</button>
        <button type="button" class="cc-order-chip cc-order-chip--action cc-booking-action" data-event="contact.center.booking.amend">Amend booking</button>
      </div>
      <div class="cc-booking-route-header">
        <div class="cc-booking-route-airports">
          <span class="cc-booking-airport">${dept}</span>
          <svg class="cc-booking-plane-ico" viewBox="0 0 24 24" fill="currentColor" width="18" height="18" aria-hidden="true">
            <path d="M21 16v-2l-8-5V3.5A1.5 1.5 0 0 0 11.5 2A1.5 1.5 0 0 0 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/>
          </svg>
          <span class="cc-booking-airport">${arr}</span>
        </div>
        <div class="cc-booking-route-meta">
          <span class="cc-booking-flight-num">${flt}${via}</span>
          <span class="cc-tx-status ${statusCls}">${stat}</span>
        </div>
      </div>
      <dl class="cc-order-dl cc-booking-dl">
        <div><dt>Booking ref.</dt><dd>${ref}</dd></div>
        <div><dt>Class</dt><dd>${cls}</dd></div>
        <div><dt>Date</dt><dd>${dt}</dd></div>
        <div><dt>Passengers</dt><dd>${pax}</dd></div>
        <div><dt>Seat preference</dt><dd>${seat}</dd></div>
        <div><dt>Meal preference</dt><dd>${meal}</dd></div>
        <div><dt>Loyalty ID</dt><dd>${lid}</dd></div>
        <div><dt>Loyalty points</dt><dd>${pts}</dd></div>
      </dl>
    </div>`;

    panel.querySelectorAll('.cc-booking-action').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const eventType = btn.dataset.event;
        const lookupEmail = email || getEmail().trim();
        if (!lookupEmail) {
          setStatus('No customer loaded.', 'error');
          return;
        }
        btn.disabled = true;
        try {
          const target = getSelectedGeneratorTarget();
          const channelLabel = generatorChannelLabel();
          const body = augmentCcGeneratorPostBody({
            targetId: target ? target.id : undefined,
            email: lookupEmail,
            eventType,
            viewName: 'Contact centre — booking amendment',
            viewUrl: typeof window !== 'undefined' ? window.location.href.split('?')[0] : '',
            channel: channelLabel,
          });
          const ecid = getEcidForExperienceEvent();
          if (ecid) body.ecid = ecid;
          const res = await fetch('/api/events/generator', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(data.error || data.message || 'Request failed.');
          }
          setStatus(`Event sent to AEP: ${eventType}`, 'success');
        } catch (err) {
          setStatus('Event failed: ' + ((err && err.message) || String(err)), 'error');
        } finally {
          window.setTimeout(() => {
            btn.disabled = false;
          }, 3000);
        }
      });
    });
  }

  async function fetchAndRenderTravel(email) {
    const tableData = await fetchProfileTableRows(email);
    const travel = extractTravelFromRows(tableData);
    renderBookingPanel(travel, email);
  }

  function resetBookingPanelPlaceholder() {
    const panel = document.getElementById('ccPanelOrders');
    if (panel) panel.innerHTML = BOOKING_PLACEHOLDER_HTML;
  }

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
    const channelLabel =
      selectedChannel === 'voice' ? 'Voice call' : selectedChannel === 'mobile' ? 'Mobile' : 'Email';
    setElText('ccHeroChannel', channelLabel + ' · Adobe Experience Platform');

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
    resetBookingPanelPlaceholder();
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
    resetCcEventsUi();
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
    return generatorChannelLabel();
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
            void fetchAndRenderTravel(email);
            void fetchAndRenderCcEvents(email);
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
        resetCcEventsUi();
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

  window._ccLastEvents = [];
  const CC_JOURNEY_LOOKBACK_MS = 365 * 24 * 60 * 60 * 1000;
  const ccJourneyNameCache = new Map();
  let ccEventActivityChartInst = null;
  let ccEventChartType = 'doughnut';

  function getCcSandboxQs() {
    return '&sandbox=' + encodeURIComponent(getRtdbSandboxName());
  }

  function escapeHtmlCc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatCcEventTs(ts) {
    if (ts == null) return '—';
    const d = new Date(typeof ts === 'number' ? ts : parseInt(String(ts), 10));
    return isNaN(d.getTime()) ? '—' : d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
  }

  async function fetchCcJourneyName(journeyVersionId) {
    if (!journeyVersionId) return null;
    if (ccJourneyNameCache.has(journeyVersionId)) return ccJourneyNameCache.get(journeyVersionId);
    try {
      const res = await fetch('/api/journey-name?id=' + encodeURIComponent(journeyVersionId) + getCcSandboxQs());
      const data = await res.json().catch(() => ({}));
      const name = data.name || null;
      ccJourneyNameCache.set(journeyVersionId, name);
      return name;
    } catch (_) {
      ccJourneyNameCache.set(journeyVersionId, null);
      return null;
    }
  }

  function getCcEventJourneyVersionId(ev) {
    const rows = ev.rows || [];
    const row = rows.find((r) => {
      const p = (r.path || '').toLowerCase();
      const a = (r.attribute || '').toLowerCase();
      return p.includes('messageexecution') && (p.includes('journeyversionid') || a === 'journeyversionid');
    });
    if (!row || row.value == null) return '';
    return String(row.value).trim();
  }

  function getCcEventFeedbackStatus(ev) {
    const rows = ev.rows || [];
    const row = rows.find((r) => {
      const p = (r.path || '').toLowerCase();
      return (
        p === '_experience.customerjourneymanagement.messagedeliveryfeedback.feedbackstatus' ||
        (p.includes('messagedelivery') && p.includes('feedbackstatus'))
      );
    });
    if (!row || row.value == null) return '—';
    const val = String(row.value).trim();
    return val || '—';
  }

  function getCcPushChannelPlatform(ev) {
    const rows = ev.rows || [];
    const row = rows.find((r) => {
      const p = (r.path || '').toLowerCase().replace(/_/g, '.');
      return (
        p.endsWith('pushchannelcontext.platform') ||
        (p.includes('pushchannelcontext') && (p.endsWith('.platform') || p.endsWith('_platform')))
      );
    });
    if (!row || row.value == null) return '';
    return String(row.value).trim();
  }

  function ccEventChannelNamespaceIsEmail(ev) {
    const rows = ev.rows || [];
    for (const r of rows) {
      const p = (r.path || '').toLowerCase().replace(/_/g, '.');
      if (!p.includes('channelcontext')) continue;
      if (!(p.endsWith('.namespace') || p.endsWith('_namespace'))) continue;
      if (r.value == null || !String(r.value).trim()) continue;
      if (String(r.value).trim().toLowerCase() === 'email') return true;
    }
    return false;
  }

  function getCcEventChannel(ev) {
    const platformRaw = getCcPushChannelPlatform(ev);
    if (platformRaw && platformRaw.toLowerCase() === 'fcm') return 'Android Push';
    if (platformRaw && platformRaw.toLowerCase() === 'apns') return 'iOS Push';
    if (ccEventChannelNamespaceIsEmail(ev)) return 'email';
    if (ev.channel != null && String(ev.channel).trim()) return String(ev.channel).trim();
    const rows = ev.rows || [];
    const channelRow = rows.find((r) => {
      const p = (r.path || '').toLowerCase();
      const a = (r.attribute || '').toLowerCase();
      return (
        (p === 'channel' || p.endsWith('.channel') || p === '_experiencechannel' || a === 'channel') &&
        r.value != null &&
        String(r.value).trim()
      );
    });
    return channelRow ? String(channelRow.value).trim() : '—';
  }

  function formatCcChannelDisplay(raw) {
    const s = String(raw ?? '').trim();
    if (!s || s === '—') return s;
    const lower = s.toLowerCase();
    if (lower === 'email') return 'Email';
    if (lower === 'mobile') return 'Mobile';
    return s;
  }

  function ccGetEventTypeIcon(eventType) {
    if (!eventType) return '⚡';
    const key = String(eventType).trim();
    if (key.startsWith('web.')) return '🌐';
    if (key.startsWith('commerce.')) return '🛒';
    if (key.startsWith('email.')) return '📧';
    if (key.startsWith('contactCenter.')) return '📞';
    if (key.startsWith('app.') || key.startsWith('application.')) return '📱';
    if (key.startsWith('mobile.')) return '📱';
    return '⚡';
  }

  function aggregateCcJourneyActivity(events) {
    const map = new Map();
    (events || []).forEach((ev) => {
      const vid = getCcEventJourneyVersionId(ev);
      if (!vid) return;
      const ts = ev.timestamp != null ? (typeof ev.timestamp === 'number' ? ev.timestamp : parseInt(ev.timestamp, 10)) : 0;
      if (!map.has(vid)) {
        map.set(vid, { journeyVersionId: vid, count: 0, firstTs: ts, lastTs: ts });
      }
      const j = map.get(vid);
      j.count += 1;
      if (ts && (!j.firstTs || ts < j.firstTs)) j.firstTs = ts;
      if (ts > j.lastTs) j.lastTs = ts;
    });
    return Array.from(map.values()).sort((a, b) => b.lastTs - a.lastTs);
  }

  function filterCcEventsJourneyWindow(events) {
    const now = Date.now();
    return (events || []).filter((ev) => {
      const ts = ev.timestamp != null ? Number(ev.timestamp) : 0;
      return ts && now - ts <= CC_JOURNEY_LOOKBACK_MS;
    });
  }

  function ccFindLastEventForJourney(events, vid) {
    let best = null;
    let bestTs = -1;
    (events || []).forEach((ev) => {
      if (getCcEventJourneyVersionId(ev) !== vid) return;
      const ts = ev.timestamp != null ? Number(ev.timestamp) : 0;
      if (ts >= bestTs) {
        bestTs = ts;
        best = ev;
      }
    });
    return best;
  }

  function ccResolvedChartColors(n) {
    const el = document.querySelector('.cc-card--engagement') || document.body;
    const cs = getComputedStyle(el);
    let candidates = [
      cs.getPropertyValue('--cc-accent').trim(),
      cs.getPropertyValue('--cc-muted').trim(),
      cs.getPropertyValue('--cc-text').trim(),
      cs.getPropertyValue('--cc-border').trim(),
    ].filter((c) => c && c.length > 0);
    if (candidates.length === 0) {
      candidates = ['rgb(13, 102, 208)', 'rgb(100, 116, 139)', 'rgb(15, 23, 42)'];
    }
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push(candidates[i % candidates.length]);
    }
    return out;
  }

  function renderCcRecentEvents(events) {
    const tbody = document.getElementById('ccEventsTableBody');
    const countEl = document.getElementById('ccEventsCount');
    if (!tbody) return;
    const sorted = (events || []).slice().sort((a, b) => {
      const at = a && a.timestamp != null ? Number(a.timestamp) : 0;
      const bt = b && b.timestamp != null ? Number(b.timestamp) : 0;
      return bt - at;
    });
    const top = sorted.slice(0, 10);
    if (countEl) {
      if (sorted.length) {
        countEl.hidden = false;
        countEl.textContent = String(sorted.length) + ' in sandbox';
      } else {
        countEl.hidden = true;
        countEl.textContent = '';
      }
    }
    if (!top.length) {
      tbody.innerHTML =
        '<tr class="cc-events-placeholder-row"><td colspan="5" class="cc-events-placeholder">No experience events returned for this profile.</td></tr>';
      return;
    }
    tbody.innerHTML = top
      .map((ev) => {
        const src = escapeHtmlCc(formatCcChannelDisplay(getCcEventChannel(ev)));
        const name = escapeHtmlCc(ev.eventName || 'Experience event');
        const icon = ccGetEventTypeIcon(ev.eventName);
        const when = escapeHtmlCc(formatCcEventTs(ev.timestamp));
        const detailRaw = ev.entityId != null ? String(ev.entityId).trim() : '';
        const detail = escapeHtmlCc(detailRaw && detailRaw.length > 48 ? detailRaw.slice(0, 45) + '…' : detailRaw || '—');
        const st = escapeHtmlCc(getCcEventFeedbackStatus(ev));
        return (
          '<tr><td>' +
          src +
          '</td><td><span class="cc-tx-ico" aria-hidden="true">' +
          icon +
          '</span>' +
          name +
          '</td><td>' +
          when +
          '</td><td>' +
          detail +
          '</td><td>' +
          st +
          '</td></tr>'
        );
      })
      .join('');
  }

  function renderCcJourneyActivity(events) {
    const section = document.getElementById('ccJourneyActivitySection');
    const tbody = document.getElementById('ccJourneyTableBody');
    if (!section || !tbody) return;
    const filtered = filterCcEventsJourneyWindow(events);
    const rows = aggregateCcJourneyActivity(filtered);
    if (!rows.length) {
      section.hidden = true;
      tbody.innerHTML = '';
      return;
    }
    section.hidden = false;
    const maxCount = Math.max(...rows.map((r) => r.count), 1);
    tbody.innerHTML = rows
      .map((r, i) => {
        const pct = Math.round((r.count / maxCount) * 100);
        const last = r.lastTs ? formatCcEventTs(r.lastTs) : '—';
        const lastEv = ccFindLastEventForJourney(filtered, r.journeyVersionId);
        const stRaw = lastEv ? getCcEventFeedbackStatus(lastEv) : '—';
        const stEsc = escapeHtmlCc(stRaw);
        const bar =
          '<div class="cc-journey-count-bar-wrap"><div class="cc-journey-count-bar" style="width:' +
          pct +
          '%"></div><span class="cc-journey-count-text">' +
          r.count.toLocaleString() +
          '</span></div>';
        return (
          '<tr><td class="cc-journey-name-cell" data-cc-journey-row="' +
          i +
          '">…</td><td>' +
          bar +
          '</td><td class="cc-journey-last-seen">' +
          escapeHtmlCc(last) +
          '</td><td>' +
          stEsc +
          '</td></tr>'
        );
      })
      .join('');
    rows.forEach((r, i) => {
      fetchCcJourneyName(r.journeyVersionId).then((name) => {
        const cell = tbody.querySelector('[data-cc-journey-row="' + i + '"]');
        if (cell) cell.textContent = name || r.journeyVersionId || '—';
      });
    });
  }

  function renderCcDetailsJourneyActivity(events) {
    const emptyEl = document.getElementById('ccDetailsJourneyEmpty');
    const wrapEl = document.getElementById('ccDetailsJourneyWrap');
    const tbody = document.getElementById('ccDetailsJourneyBody');
    if (!emptyEl || !wrapEl || !tbody) return;
    const filtered = filterCcEventsJourneyWindow(events);
    const rows = aggregateCcJourneyActivity(filtered);
    if (!rows.length) {
      emptyEl.hidden = false;
      emptyEl.textContent = 'No journey-linked events in the last 365 days for this profile.';
      wrapEl.hidden = true;
      tbody.innerHTML = '';
      return;
    }
    emptyEl.hidden = true;
    wrapEl.hidden = false;
    const maxCount = Math.max(...rows.map((r) => r.count), 1);
    tbody.innerHTML = rows
      .map((r, i) => {
        const pct = Math.round((r.count / maxCount) * 100);
        const last = r.lastTs ? formatCcEventTs(r.lastTs) : '—';
        const bar =
          '<div class="cc-journey-count-bar-wrap"><div class="cc-journey-count-bar" style="width:' +
          pct +
          '%"></div><span class="cc-journey-count-text">' +
          r.count.toLocaleString() +
          '</span></div>';
        return (
          '<tr><td class="cc-journey-name-cell" data-cc-details-journey-row="' +
          i +
          '">…</td><td>' +
          bar +
          '</td><td class="cc-journey-last-seen">' +
          escapeHtmlCc(last) +
          '</td></tr>'
        );
      })
      .join('');
    rows.forEach((r, i) => {
      fetchCcJourneyName(r.journeyVersionId).then((name) => {
        const cell = tbody.querySelector('[data-cc-details-journey-row="' + i + '"]');
        if (cell) cell.textContent = name || r.journeyVersionId || '—';
      });
    });
  }

  function renderCcEventActivityChart(events) {
    const section = document.getElementById('ccEngagementChartSection');
    const emptyEl = document.getElementById('ccEngagementChartEmpty');
    const toggle = document.getElementById('ccEngagementToggle');
    const canvas = document.getElementById('ccEventActivityChart');
    const legendEl = document.getElementById('ccEventActivityLegend');
    if (!section || !emptyEl || !canvas) return;
    if (typeof window.Chart === 'undefined') {
      section.hidden = true;
      if (toggle) toggle.hidden = true;
      emptyEl.hidden = false;
      emptyEl.textContent = 'Chart library failed to load.';
      return;
    }
    if (ccEventActivityChartInst) {
      ccEventActivityChartInst.destroy();
      ccEventActivityChartInst = null;
    }
    const list = events || [];
    const counts = {};
    list.forEach((ev) => {
      const t = ev.eventName || 'unknown';
      counts[t] = (counts[t] || 0) + 1;
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (!sorted.length) {
      section.hidden = true;
      if (toggle) toggle.hidden = true;
      emptyEl.hidden = false;
      emptyEl.textContent = 'No event data available.';
      if (legendEl) legendEl.innerHTML = '';
      return;
    }
    section.hidden = false;
    emptyEl.hidden = true;
    if (toggle) toggle.hidden = false;
    const labels = sorted.map((e) => e[0]);
    const data = sorted.map((e) => e[1]);
    const colors = ccResolvedChartColors(labels.length);
    const el = document.querySelector('.cc-card--engagement') || document.body;
    const cs = getComputedStyle(el);
    const borderCol =
      cs.getPropertyValue('--cc-card').trim() ||
      cs.getPropertyValue('--cc-bank-elev').trim() ||
      'rgba(255, 255, 255, 0.12)';
    const gridCol =
      cs.getPropertyValue('--cc-bank-border').trim() || cs.getPropertyValue('--cc-border').trim() || 'rgba(255, 255, 255, 0.08)';
    const tickCol = cs.getPropertyValue('--cc-muted').trim() || 'rgb(148, 163, 184)';
    const isDoughnut = ccEventChartType === 'doughnut';
    ccEventActivityChartInst = new window.Chart(canvas, {
      type: isDoughnut ? 'doughnut' : 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Events',
            data,
            backgroundColor: colors,
            borderWidth: isDoughnut ? 2 : 0,
            borderColor: isDoughnut ? borderCol : colors,
            borderRadius: isDoughnut ? 0 : 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                let v = ctx.parsed;
                if (v && typeof v === 'object' && v.y !== undefined) v = v.y;
                return (ctx.label || '') + ': ' + v + ' events';
              },
            },
          },
        },
        ...(isDoughnut
          ? { cutout: '55%' }
          : {
              scales: {
                x: { grid: { color: gridCol }, ticks: { color: tickCol } },
                y: { grid: { color: gridCol }, ticks: { color: tickCol }, beginAtZero: true },
              },
            }),
      },
    });
    if (legendEl) {
      legendEl.innerHTML = sorted
        .map(
          (e, i) =>
            '<div class="cc-engagement-legend-item"><span class="cc-engagement-legend-swatch" style="background-color:' +
            escapeHtmlCc(colors[i]) +
            '"></span><span>' +
            escapeHtmlCc(e[0]) +
            '</span><span class="cc-engagement-legend-count">' +
            escapeHtmlCc(String(e[1])) +
            '</span></div>',
        )
        .join('');
    }
  }

  async function fetchAndRenderCcEvents(email) {
    const em = String(email || '').trim();
    if (!em) {
      window._ccLastEvents = [];
      renderCcRecentEvents([]);
      renderCcJourneyActivity([]);
      renderCcDetailsJourneyActivity([]);
      renderCcEventActivityChart([]);
      return;
    }
    const qs = 'identifier=' + encodeURIComponent(em) + '&namespace=email' + getCcSandboxQs();
    try {
      const res = await fetch('/api/profile/events?' + qs);
      const payload = await res.json().catch(() => ({}));
      const raw = res.ok && Array.isArray(payload.events) ? payload.events : [];
      raw.sort((a, b) => {
        const at = a && a.timestamp != null ? Number(a.timestamp) : 0;
        const bt = b && b.timestamp != null ? Number(b.timestamp) : 0;
        return bt - at;
      });
      window._ccLastEvents = raw;
    } catch (_) {
      window._ccLastEvents = [];
    }
    renderCcRecentEvents(window._ccLastEvents);
    renderCcJourneyActivity(window._ccLastEvents);
    renderCcDetailsJourneyActivity(window._ccLastEvents);
    renderCcEventActivityChart(window._ccLastEvents);
  }

  function resetCcEventsUi() {
    window._ccLastEvents = [];
    if (ccEventActivityChartInst) {
      try {
        ccEventActivityChartInst.destroy();
      } catch (_) {
        /* ignore */
      }
      ccEventActivityChartInst = null;
    }
    const tbody = document.getElementById('ccEventsTableBody');
    if (tbody) {
      tbody.innerHTML =
        '<tr class="cc-events-placeholder-row"><td colspan="5" class="cc-events-placeholder">Load a customer profile to see their experience events from AEP.</td></tr>';
    }
    const countEl = document.getElementById('ccEventsCount');
    if (countEl) {
      countEl.hidden = true;
      countEl.textContent = '';
    }
    const jSec = document.getElementById('ccJourneyActivitySection');
    if (jSec) jSec.hidden = true;
    const jBody = document.getElementById('ccJourneyTableBody');
    if (jBody) jBody.innerHTML = '';
    const dEmpty = document.getElementById('ccDetailsJourneyEmpty');
    const dWrap = document.getElementById('ccDetailsJourneyWrap');
    const dBody = document.getElementById('ccDetailsJourneyBody');
    if (dEmpty) {
      dEmpty.hidden = false;
      dEmpty.textContent = 'Load a customer profile to see journey activity from AEP experience events.';
    }
    if (dWrap) dWrap.hidden = true;
    if (dBody) dBody.innerHTML = '';
    const chSec = document.getElementById('ccEngagementChartSection');
    const chEmpty = document.getElementById('ccEngagementChartEmpty');
    const chToggle = document.getElementById('ccEngagementToggle');
    const leg = document.getElementById('ccEventActivityLegend');
    if (chSec) chSec.hidden = true;
    if (chEmpty) {
      chEmpty.hidden = true;
      chEmpty.textContent = 'No event data available.';
    }
    if (chToggle) chToggle.hidden = true;
    if (leg) leg.innerHTML = '';
    ccEventChartType = 'doughnut';
    const tgl = document.getElementById('ccEngagementToggle');
    if (tgl) {
      tgl.querySelectorAll('[data-cc-chart-type]').forEach((b) => {
        const dou = b.getAttribute('data-cc-chart-type') === 'doughnut';
        b.classList.toggle('cc-engagement-toggle-btn--active', dou);
        b.setAttribute('aria-pressed', dou ? 'true' : 'false');
      });
    }
  }

  document.addEventListener('click', (e) => {
    const wrap = document.getElementById('ccEngagementToggle');
    const btn = e.target && e.target.closest && e.target.closest('[data-cc-chart-type]');
    if (!wrap || !btn || !wrap.contains(btn)) return;
    const type = btn.getAttribute('data-cc-chart-type');
    if (!type || type === ccEventChartType) return;
    ccEventChartType = type === 'bar-v' ? 'bar-v' : 'doughnut';
    wrap.querySelectorAll('[data-cc-chart-type]').forEach((b) => {
      const active = b === btn;
      b.classList.toggle('cc-engagement-toggle-btn--active', active);
      b.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    renderCcEventActivityChart(window._ccLastEvents || []);
  });

  initIndustryUi();
  void loadGeneratorTargets();
  void initFromRtdb();
  if (typeof window.AepDemoGeneratorTargets !== 'undefined' && window.AepDemoGeneratorTargets.onSandboxChange) {
    window.AepDemoGeneratorTargets.onSandboxChange(function () {
      void loadGeneratorTargets();
      void initFromRtdb();
    });
  }
})();
