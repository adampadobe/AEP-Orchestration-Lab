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

  // ─── Channel selector ──────────────────────────────────────────────────────
  /** @type {'voice'|'email'|'mobile'} */
  let selectedChannel = 'voice';

  function setSelectedChannel(ch) {
    selectedChannel = ch;
    document.querySelectorAll('.cc-channel-btn').forEach((btn) => {
      const active = btn.dataset.channel === ch;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  document.querySelectorAll('.cc-channel-btn').forEach((btn) => {
    btn.addEventListener('click', () => setSelectedChannel(btn.dataset.channel));
  });

  // ─── RTDB helpers (Etihad iPad parity: ajoLookups/{sandbox}, StaffPortal, CoreDemoData, Mobile) ──
  const CC_DEFAULT_BRAND = 'Experience Care';
  const CC_DEFAULT_AGENT_NAME = 'Alex';
  const CC_DEFAULT_AGENT_INITIALS = 'AL';

  function getRtdbSandboxName() {
    try {
      if (typeof window.AepGlobalSandbox !== 'undefined' && typeof window.AepGlobalSandbox.getSandboxName === 'function') {
        return window.AepGlobalSandbox.getSandboxName() || 'apalmer';
      }
    } catch (_) { /* ignore */ }
    try {
      const m = window.location.search.match(/[?&]sandbox=([^&]+)/);
      if (m) return decodeURIComponent(m[1]);
    } catch (_) { /* ignore */ }
    return 'apalmer';
  }

  /** Same validation as etihad-ipad.js: RTDB `StaffPortal.Colour` (6-hex, optional #). */
  function sanitizeRtdbHex6(input) {
    const s = String(input || '')
      .trim()
      .replace(/^#/, '');
    if (!/^[0-9A-Fa-f]{6}$/.test(s)) return '';
    return '#' + s.toLowerCase();
  }

  function buildCcTopbarBackgroundCss(hex) {
    return (
      'linear-gradient(135deg, ' +
      'color-mix(in srgb, ' +
      hex +
      ' 82%, var(--dash-surface)) 0%, ' +
      'color-mix(in srgb, ' +
      hex +
      ' 42%, var(--dash-surface)) 100%)'
    );
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

  /** Reset top bar + branding + staff line when RTDB is unavailable (accent colours restored via applyIndustry). */
  function clearRtdbCallCenterChrome() {
    const hdr = document.getElementById('ccAppHeader');
    if (hdr) {
      hdr.style.removeProperty('background');
      hdr.style.removeProperty('--cc-topbar-accent');
      hdr.classList.remove('cc-app-header--rtdb-brand-surface');
    }
    const brandEl = document.getElementById('ccBrandName');
    if (brandEl) brandEl.textContent = CC_DEFAULT_BRAND;
    const nameEl = document.getElementById('ccAgentName');
    if (nameEl) nameEl.textContent = CC_DEFAULT_AGENT_NAME;
    const initialsEl = document.getElementById('ccUserInitials');
    if (initialsEl) {
      initialsEl.textContent = CC_DEFAULT_AGENT_INITIALS;
      initialsEl.title = 'Demo agent';
    }
    const metaEl = document.getElementById('ccAgentMeta');
    if (metaEl) {
      metaEl.textContent = '';
      metaEl.hidden = true;
    }
  }

  function applyRtdbToAgentUi(rtdb) {
    if (!rtdb || typeof rtdb !== 'object') {
      clearRtdbCallCenterChrome();
      applyIndustry(currentIndustryId);
      return;
    }
    const sp = rtdb.StaffPortal || {};
    const cd = rtdb.CoreDemoData || {};
    const mb = rtdb.Mobile || {};

    const hdr = document.getElementById('ccAppHeader');
    const hex = sanitizeRtdbHex6(sp.Colour);
    if (hdr) {
      if (hex) {
        hdr.style.setProperty('--cc-topbar-accent', hex);
        hdr.style.background = buildCcTopbarBackgroundCss(hex);
        hdr.classList.add('cc-app-header--rtdb-brand-surface');
      } else {
        hdr.style.removeProperty('background');
        hdr.style.removeProperty('--cc-topbar-accent');
        hdr.classList.remove('cc-app-header--rtdb-brand-surface');
      }
    }

    /* Same source as etihad-ipad `gaAirlineName`: CoreDemoData.name || CoreDemoData.airlineName (not passenger name). */
    const brand =
      (cd.name && String(cd.name).trim()) ||
      (cd.airlineName && String(cd.airlineName).trim()) ||
      '';
    const brandEl = document.getElementById('ccBrandName');
    if (brandEl) brandEl.textContent = brand || CC_DEFAULT_BRAND;

    const agentNameRaw = mb.StaffName || sp.AgentName || sp.agentName;
    const agentName = agentNameRaw && String(agentNameRaw).trim();
    if (agentName) {
      const nameEl = document.getElementById('ccAgentName');
      if (nameEl) nameEl.textContent = agentName;
      const initialsEl = document.getElementById('ccUserInitials');
      if (initialsEl) {
        const parts = agentName.split(/\s+/);
        initialsEl.textContent = parts.map((p) => (p[0] || '')).join('').slice(0, 2).toUpperCase();
        initialsEl.title = agentName;
      }
    } else {
      const nameEl = document.getElementById('ccAgentName');
      if (nameEl) nameEl.textContent = CC_DEFAULT_AGENT_NAME;
      const initialsEl = document.getElementById('ccUserInitials');
      if (initialsEl) {
        initialsEl.textContent = CC_DEFAULT_AGENT_INITIALS;
        initialsEl.title = 'Demo agent';
      }
    }

    const agentId = sp.AgentID != null ? String(sp.AgentID).trim() : '';
    const agentType =
      (sp.AgentType && String(sp.AgentType).trim()) ||
      (mb.StaffRole && String(mb.StaffRole).trim()) ||
      '';
    const terminal =
      (sp.FlightTerminalInfo && String(sp.FlightTerminalInfo).trim()) ||
      (mb.Terminal && String(mb.Terminal).trim()) ||
      '';
    const metaLine = [agentId, agentType, terminal].filter(Boolean).join(' · ');
    const metaEl = document.getElementById('ccAgentMeta');
    if (metaEl) {
      if (metaLine) {
        metaEl.textContent = metaLine;
        metaEl.hidden = false;
      } else {
        metaEl.textContent = '';
        metaEl.hidden = true;
      }
    }

    if (hex) {
      document.body.style.setProperty('--cc-accent', hex);
      document.body.style.setProperty('--cc-accent-soft', 'color-mix(in srgb, ' + hex + ' 16%, var(--dash-surface))');
    } else {
      applyIndustry(currentIndustryId);
    }
  }

  async function initFromRtdb() {
    const data = await fetchRtdbLookups();
    applyRtdbToAgentUi(data);
  }

  // ─── Travel data from profile table ───────────────────────────────────────
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

  /** Exact `path` / `attribute` match for `/api/profile/table` rows (avoids ambiguous `.number` suffix matches). */
  function ccProfileTableRowVal(rows, path) {
    if (!rows || !Array.isArray(rows) || !path) return '';
    const exact = rows.find((row) => {
      const a = row.attribute || '';
      const p = row.path || '';
      return a === path || p === path;
    });
    if (exact && exact.value != null) {
      const s = String(exact.value).trim();
      if (s) return s;
    }
    return '';
  }

  function extractMobilePhoneNumberFromTablePayload(tablePayload) {
    const rows = tablePayload && Array.isArray(tablePayload.rows) ? tablePayload.rows : [];
    const direct =
      ccProfileTableRowVal(rows, 'mobilePhone.number') ||
      ccProfileTableRowVal(rows, '_demoemea.mobilePhone.number');
    if (direct) return direct;
    const fuzzy = rows.find((row) => {
      if (row.value == null || String(row.value).trim() === '') return false;
      const pl = String(row.path || '').toLowerCase().replace(/_/g, '.');
      const al = String(row.attribute || '').toLowerCase().replace(/_/g, '.');
      const blob = pl + ' ' + al;
      return blob.includes('mobilephone') && blob.includes('number');
    });
    return fuzzy && fuzzy.value != null ? String(fuzzy.value).trim() : '';
  }

  function extractTravelFromRows(tablePayload) {
    const rows = (tablePayload && Array.isArray(tablePayload.rows)) ? tablePayload.rows : [];
    const find = (fragment) => {
      const lf = fragment.toLowerCase();
      const row = rows.find((r) => r.path && r.path.toLowerCase().includes(lf) && r.value && r.value !== '');
      return row ? row.value : null;
    };
    return {
      flightNumber:            find('flightreservations.flightnumber'),
      flightClass:             find('flightreservations.flightclass'),
      flightDate:              find('flightreservations.flightdate'),
      confirmationNumber:      find('flightreservations.confirmationnumber'),
      departureAirportCode:    find('flightreservations.departureairportcode'),
      arrivalAirportCode:      find('flightreservations.arrivalairportcode'),
      flightReservationStatus: find('flightreservations.flightreservationstatus'),
      numberOfPassengers:      find('flightreservations.numberofpassengers'),
      layoverAirport:          find('multilleg.layoverairportcode_1') || find('layoverairportcode'),
      seatPreference:          find('travelpreferences.seat'),
      mealPreference:          find('travelpreferences.meal'),
      loyaltyPoints:           find('loyaltydetails.points'),
      loyaltyId:               find('identification.core.loyaltyid'),
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

  function renderBookingPanel(travel, email) {
    const content = document.getElementById('ccBookingContent');
    if (!content) return;

    if (!travel || (!travel.flightNumber && !travel.confirmationNumber)) {
      content.innerHTML = `
        <p class="cc-history-lead">No booking data found in profile for this customer.</p>
        <p class="cc-history-lead" style="margin-top:0.35rem;font-size:0.8rem;opacity:0.6;">
          Expected at <code>_demoemea.travelReservations.flightReservations</code> in the AEP sandbox.
          Seed the profile via Profile Generation to populate this view.
        </p>`;
      return;
    }

    const dept  = travel.departureAirportCode || '—';
    const arr   = travel.arrivalAirportCode || '—';
    const flt   = travel.flightNumber || '—';
    const cls   = travel.flightClass || '—';
    const dt    = formatFlightDate(travel.flightDate);
    const ref   = travel.confirmationNumber || '—';
    const pax   = travel.numberOfPassengers || '1';
    const stat  = travel.flightReservationStatus || 'Confirmed';
    const seat  = travel.seatPreference || '—';
    const meal  = travel.mealPreference || '—';
    const pts   = travel.loyaltyPoints ? Number(travel.loyaltyPoints).toLocaleString() : '—';
    const lid   = travel.loyaltyId || '—';
    const via   = travel.layoverAirport ? ` via ${travel.layoverAirport}` : '';

    const statusCls = /cancel/i.test(stat) ? 'cc-tx-status--warn' :
                      /wait|pending/i.test(stat) ? 'cc-tx-status--pending' : 'cc-tx-status--ok';

    content.innerHTML = `
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

    content.querySelectorAll('.cc-booking-action').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const eventType = btn.dataset.event;
        const lookupEmail = email || getEmail().trim();
        if (!lookupEmail) { setStatus('No customer loaded.', 'error'); return; }
        btn.disabled = true;
        try {
          const target = getSelectedGeneratorTarget();
          const channelLabel = selectedChannel === 'voice' ? 'Call' : selectedChannel === 'mobile' ? 'Mobile' : 'Web';
          const body = augmentCcGeneratorPostBody({
            targetId: target ? target.id : undefined,
            email: lookupEmail,
            eventType,
            viewName: 'Contact centre — booking amendment',
            viewUrl: typeof window !== 'undefined' ? window.location.href.split('?')[0] : '',
            channel: channelLabel,
          });
          const res = await fetch('/api/events/generator', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          await res.json().catch(() => ({}));
          setStatus(`Event sent to AEP: ${eventType}`, 'success');
        } catch (err) {
          setStatus('Event failed: ' + ((err && err.message) || String(err)), 'error');
        } finally {
          window.setTimeout(() => { btn.disabled = false; }, 3000);
        }
      });
    });
  }

  async function fetchAndRenderTravel(email, tableDataPreloaded) {
    const tableData =
      tableDataPreloaded != null ? tableDataPreloaded : await fetchProfileTableRows(email);
    const travel = extractTravelFromRows(tableData);
    renderBookingPanel(travel, email);
  }

  // ─── Experience events: helpers (compact port from profile-viewer/app.js) ──

  const ccJourneyNameCache = new Map();

  async function fetchCcJourneyName(versionId) {
    if (!versionId) return null;
    if (ccJourneyNameCache.has(versionId)) return ccJourneyNameCache.get(versionId);
    const sandbox = getRtdbSandboxName();
    try {
      const res = await fetch(`/api/journey-name?id=${encodeURIComponent(versionId)}&sandbox=${encodeURIComponent(sandbox)}`);
      const data = await res.json().catch(() => ({}));
      const name = data.name || null;
      ccJourneyNameCache.set(versionId, name);
      return name;
    } catch (_) {
      ccJourneyNameCache.set(versionId, null);
      return null;
    }
  }

  function ccFindEventRow(ev, testFn) {
    return (ev.rows || []).find((r) => testFn((r.path || '').toLowerCase(), (r.attribute || '').toLowerCase()));
  }

  function ccGetEventJourneyVersionId(ev) {
    const r = ccFindEventRow(ev, (p, a) => p.includes('messageexecution') && (p.includes('journeyversionid') || a === 'journeyversionid'));
    return r && r.value ? String(r.value).trim() : '';
  }

  function ccGetEventFeedbackStatus(ev) {
    const r = ccFindEventRow(ev, (p) => p.includes('messagedelivery') && p.includes('feedbackstatus'));
    return r && r.value ? String(r.value).trim() : '';
  }

  function ccGetEventChannel(ev) {
    const r = ccFindEventRow(ev, (p, a) =>
      p.endsWith('channel') || a === 'channel' ||
      p.includes('messagechannel') || p.includes('channel.type') ||
      p.endsWith('messagingchannel') || p.includes('channeltype')
    );
    return r && r.value ? String(r.value).trim() : '';
  }

  function ccGetEventSource(ev) {
    const name = (ev.eventName || '').toLowerCase();
    const ch = ccGetEventChannel(ev).toLowerCase();
    const vid = ccGetEventJourneyVersionId(ev);
    if (vid || name.includes('message') || name.includes('journey') || name.includes('campaign')) return 'Journey Optimizer';
    if (name.includes('application.login') || name.includes('mobile.logon')) return 'Mobile';
    if (ch.includes('push') || name.includes('push')) return 'Push';
    if (ch.includes('sms') || name.includes('sms')) return 'SMS';
    if (name.includes('email') || ch.includes('email')) return 'Email';
    if (name.includes('commerce') || name.includes('product') || name.includes('cart')) return 'Edge Network';
    return 'AEP';
  }

  function ccGetEventTypeLabel(ev) {
    const name = ev.eventName || '';
    const short = name.replace(/^(application|commerce|web|mobile)\./i, '').replace(/([a-z])([A-Z])/g, '$1 $2');
    return short.charAt(0).toUpperCase() + short.slice(1) || 'Experience event';
  }

  function ccGetEventTypeIcon(eventName) {
    const n = (eventName || '').toLowerCase();
    if (n.includes('email') || n.includes('message.feedback')) return '✉️';
    if (n.includes('push')) return '🔔';
    if (n.includes('sms')) return '💬';
    if (n.includes('login') || n.includes('logon')) return '🔑';
    if (n.includes('product') || n.includes('commerce')) return '🛍️';
    if (n.includes('journey') || n.includes('campaign')) return '🗺️';
    if (n.includes('location')) return '📍';
    if (n.includes('flight') || n.includes('travel') || n.includes('booking')) return '✈️';
    if (n.includes('seat')) return '💺';
    if (n.includes('contact.center')) return '📞';
    return '◇';
  }

  function ccFormatTimestamp(ts) {
    if (!ts) return '—';
    const d = new Date(typeof ts === 'number' ? ts : parseInt(ts, 10));
    if (isNaN(d.getTime())) return '—';
    const now = Date.now();
    const diff = now - d.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (mins < 2) return 'Just now';
    if (mins < 60) return `${mins} min ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return 'Yesterday · ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' · ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function ccFormatNow() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function ccAggregateJourneyActivity(events) {
    const map = new Map();
    (events || []).forEach((ev) => {
      const vid = ccGetEventJourneyVersionId(ev);
      if (!vid) return;
      const ts = ev.timestamp != null ? (typeof ev.timestamp === 'number' ? ev.timestamp : parseInt(ev.timestamp, 10)) : 0;
      if (!map.has(vid)) map.set(vid, { vid, count: 0, lastTs: ts });
      const j = map.get(vid);
      j.count += 1;
      if (ts > j.lastTs) j.lastTs = ts;
    });
    return Array.from(map.values()).sort((a, b) => b.lastTs - a.lastTs);
  }

  // ─── Renderers ────────────────────────────────────────────────────────────

  function renderCcRecentEvents(events) {
    const tbody = document.getElementById('ccEventsTableBody');
    const countEl = document.getElementById('ccEventsCount');
    if (!tbody) return;

    const latest = (events || []).slice(0, 10);
    if (latest.length === 0) {
      tbody.innerHTML = '<tr class="cc-events-placeholder-row"><td colspan="5" class="cc-events-placeholder">No experience events found for this profile.</td></tr>';
      if (countEl) countEl.hidden = true;
      return;
    }

    if (countEl) {
      countEl.textContent = `${(events || []).length} total`;
      countEl.hidden = false;
    }

    tbody.innerHTML = latest.map((ev) => {
      const source = ccGetEventSource(ev);
      const type = ccGetEventTypeLabel(ev);
      const icon = ccGetEventTypeIcon(ev.eventName);
      const when = ccFormatTimestamp(ev.timestamp);
      const fb = ccGetEventFeedbackStatus(ev);
      const detail = fb || type;
      const statusClass = /sent|delivered|open|click/i.test(fb) ? 'cc-tx-status--ok' :
                          /bounce|fail|error/i.test(fb) ? 'cc-tx-status--warn' :
                          fb ? 'cc-tx-status--pending' : '';
      const statusLabel = fb || '—';
      const statusHtml = statusClass
        ? `<span class="cc-tx-status ${statusClass}">${statusLabel}</span>`
        : `<span style="opacity:0.5">—</span>`;
      return `<tr>
        <td><span class="cc-tx-ico" aria-hidden="true">${icon}</span> ${source}</td>
        <td>${type}</td>
        <td>${when}</td>
        <td>${detail}</td>
        <td>${statusHtml}</td>
      </tr>`;
    }).join('');
  }

  function renderCcActivityFeed(events, agentName) {
    const feed = document.getElementById('ccActivityFeed');
    const agentNote = document.getElementById('ccActivityAgentNote');
    const agentNowEl = document.getElementById('ccActivityNow');
    const agentNameEl = document.getElementById('ccActivityAgentName');

    if (agentNameEl && agentName) agentNameEl.textContent = agentName;
    if (agentNowEl) agentNowEl.textContent = ccFormatNow();
    if (agentNote) agentNote.textContent = 'Profile loaded from AEP — Real-Time Customer Profile unified record.';

    if (!feed) return;

    const latest3 = (events || []).slice(0, 3);
    const existingAgent = feed.querySelector('.cc-activity-row--agent');

    const newRows = latest3.map((ev) => {
      const source = ccGetEventSource(ev);
      const icon = ccGetEventTypeIcon(ev.eventName);
      const type = ccGetEventTypeLabel(ev);
      const when = ccFormatTimestamp(ev.timestamp);
      const initial = source.charAt(0).toUpperCase();
      return `<li class="cc-activity-row">
        <span class="cc-activity-avatar" aria-hidden="true">${initial}</span>
        <div class="cc-activity-bubble">
          <p class="cc-activity-meta"><strong>${source}</strong> · ${when}</p>
          <p>${icon} ${type}</p>
        </div>
      </li>`;
    }).join('');

    if (existingAgent) {
      existingAgent.insertAdjacentHTML('beforebegin', newRows);
    } else {
      feed.insertAdjacentHTML('beforeend', newRows);
    }
  }

  async function fetchCcEvents(email) {
    const sandbox = getRtdbSandboxName();
    const qs = `identifier=${encodeURIComponent(email)}&namespace=email&sandbox=${encodeURIComponent(sandbox)}`;
    try {
      const res = await fetch(`/api/profile/events?${qs}`);
      return res.ok ? (await res.json()).events || [] : [];
    } catch (_) {
      return [];
    }
  }

  async function fetchAndRenderCcEvents(email) {
    const events = await fetchCcEvents(email);
    window._ccLastEvents = events;
    renderCcRecentEvents(events);
    renderCcDetailsJourneyActivity(events);
    renderCcEventActivityChart(events);
    renderCcEngagementTrendChart(events);
    const agentName = (document.getElementById('ccAgentName') || {}).textContent || 'You';
    renderCcActivityFeed(events, agentName);
  }

  /* ── Details panel: Journey activity table ── */
  function renderCcDetailsJourneyActivity(events) {
    const emptyEl = document.getElementById('ccDetailsJourneyEmpty');
    const wrapEl = document.getElementById('ccDetailsJourneyWrap');
    const tbody = document.getElementById('ccDetailsJourneyBody');
    if (!tbody || !wrapEl || !emptyEl) return;

    const rows = ccAggregateJourneyActivity(events);
    if (rows.length === 0) {
      emptyEl.hidden = false;
      wrapEl.hidden = true;
      tbody.innerHTML = '';
      return;
    }

    emptyEl.hidden = true;
    wrapEl.hidden = false;
    const maxCount = Math.max(...rows.map((r) => r.count), 1);
    tbody.innerHTML = rows.map((r, i) => {
      const pct = Math.round((r.count / maxCount) * 100);
      const last = r.lastTs ? ccFormatTimestamp(r.lastTs) : '—';
      const feedbackStatus = '';
      return `<tr>
        <td class="cc-journey-name-cell" data-ccdjrow="${i}"><span class="cc-journey-name-loading">${r.vid.slice(0, 8)}…</span></td>
        <td><div class="cc-journey-count-wrap"><div class="cc-journey-count-bar"><div class="cc-journey-count-bar-fill" style="width:${pct}%"></div></div><span class="cc-journey-count-text">${r.count}</span></div></td>
        <td class="cc-journey-last-seen">${last}</td>
      </tr>`;
    }).join('');

    rows.forEach((r, i) => {
      fetchCcJourneyName(r.vid).then((name) => {
        const cell = tbody.querySelector(`[data-ccdjrow="${i}"]`);
        if (cell) cell.textContent = name || r.vid.slice(0, 8) + '…';
      });
    });
  }

  /* ── Engagement signals: event activity chart ── */
  const CC_ENGAGEMENT_DEFAULT_HOURS = 168;

  function getCcEngagementHoursBack() {
    const sel = document.getElementById('ccEngagementDateRange');
    if (!sel) return CC_ENGAGEMENT_DEFAULT_HOURS;
    const n = Number(sel.value);
    return Number.isFinite(n) && n > 0 ? n : CC_ENGAGEMENT_DEFAULT_HOURS;
  }

  function resetCcEngagementRangeToDefault() {
    const sel = document.getElementById('ccEngagementDateRange');
    if (sel) sel.value = String(CC_ENGAGEMENT_DEFAULT_HOURS);
  }

  function getCcEngagementRangeTitle(hours) {
    const map = {
      24: 'Last 24 hours',
      168: 'Last 7 days',
      720: 'Last 30 days',
      2160: 'Last 90 days',
      4320: 'Last 180 days',
      8760: 'Last 365 days',
    };
    return map[hours] || `Last ${hours} hours`;
  }

  /**
   * Rolling window [now − hours, now] split into buckets.
   * ≤24h → hourly; ≤60d → daily; else weekly (so long ranges stay readable).
   */
  function getCcEngagementBucketSpec(hoursBack) {
    const HOUR_MS = 3600000;
    const rangeMs = hoursBack * HOUR_MS;
    const days = hoursBack / 24;
    if (hoursBack <= 24) {
      return {
        rangeMs,
        numBuckets: 24,
        bucketMs: HOUR_MS,
        xGranularity: 'hour',
        bucketPhrase: 'hourly buckets',
      };
    }
    if (days <= 60) {
      const numBuckets = Math.max(1, Math.ceil(days));
      return {
        rangeMs,
        numBuckets,
        bucketMs: rangeMs / numBuckets,
        xGranularity: 'day',
        bucketPhrase: 'daily buckets',
      };
    }
    const numBuckets = Math.max(1, Math.ceil(days / 7));
    return {
      rangeMs,
      numBuckets,
      bucketMs: rangeMs / numBuckets,
      xGranularity: 'week',
      bucketPhrase: 'weekly buckets',
    };
  }

  function ccIsMessagingOrJourneyBucket(ev) {
    const s = ccGetEventSource(ev);
    return s === 'Journey Optimizer' || s === 'Email' || s === 'Push' || s === 'SMS';
  }

  function ccReadTokenFrom(el, name, fallback) {
    try {
      const node = el && el.nodeType === 1 ? el : document.body;
      const v = getComputedStyle(node).getPropertyValue(name).trim();
      return v || fallback;
    } catch (_) {
      return fallback;
    }
  }

  function ccHexToRgba(hex, alpha) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  function ccFormatEngagementAxisLabel(ms, granularity) {
    const d = new Date(ms);
    if (granularity === 'hour') {
      return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    }
    if (granularity === 'day') {
      return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
    }
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }

  function ccBuildEngagementTimeBuckets(scoped, hoursBack) {
    const spec = getCcEngagementBucketSpec(hoursBack);
    const now = Date.now();
    const windowStart = now - spec.rangeMs;
    const totals = new Array(spec.numBuckets).fill(0);
    const messaging = new Array(spec.numBuckets).fill(0);
    (scoped || []).forEach((ev) => {
      const ts =
        ev.timestamp != null ? (typeof ev.timestamp === 'number' ? ev.timestamp : parseInt(ev.timestamp, 10)) : NaN;
      if (!Number.isFinite(ts) || ts < windowStart || ts > now) return;
      let idx = Math.floor((ts - windowStart) / spec.bucketMs);
      if (idx < 0) idx = 0;
      if (idx >= spec.numBuckets) idx = spec.numBuckets - 1;
      totals[idx] += 1;
      if (ccIsMessagingOrJourneyBucket(ev)) messaging[idx] += 1;
    });
    const labels = [];
    for (let i = 0; i < spec.numBuckets; i += 1) {
      const mid = windowStart + i * spec.bucketMs + spec.bucketMs / 2;
      labels.push(ccFormatEngagementAxisLabel(mid, spec.xGranularity));
    }
    return { labels, totals, messaging, spec, windowStart, windowEnd: now };
  }

  function ccYAxisSoftBounds(seriesArrays) {
    const flat = [];
    seriesArrays.forEach((arr) => {
      (arr || []).forEach((n) => {
        if (typeof n === 'number' && Number.isFinite(n)) flat.push(n);
      });
    });
    let minV = flat.length ? Math.min(...flat) : 0;
    let maxV = flat.length ? Math.max(...flat) : 0;
    if (!Number.isFinite(minV)) minV = 0;
    if (!Number.isFinite(maxV)) maxV = 0;
    if (minV === 0 && maxV === 0) return { min: 0, max: 1 };
    if (minV === maxV) {
      const bump = minV === 0 ? 1 : Math.max(minV * 0.1, 0.5);
      return { min: Math.max(0, minV - bump * 0.2), max: maxV + bump };
    }
    const span = maxV - minV;
    const pad = Math.max(span * 0.12, 0.5);
    return { min: Math.max(0, minV - pad * 0.15), max: maxV + pad };
  }

  function refreshCcDrawerEngagementFromRange() {
    const drawerApi = window.DemoProfileDrawer || window.AepProfileDrawer;
    if (
      !drawerApi ||
      typeof drawerApi.getLastLookedUpProfile !== 'function' ||
      typeof drawerApi.patchLastProfileOrUpdate !== 'function'
    ) {
      return;
    }
    const prof = drawerApi.getLastLookedUpProfile();
    const evs = window._ccLastEvents;
    if (!prof || !evs || !window.EmailEngagementMetrics) return;
    const hours = getCcEngagementHoursBack();
    const emailN = window.EmailEngagementMetrics.getEmailSendsLastHours(evs, hours);
    const pushN = window.EmailEngagementMetrics.getPushSendsLastHours(evs, hours);
    drawerApi.patchLastProfileOrUpdate({
      emailSendsLast24h: emailN,
      pushSendsLast24h: pushN,
      engagementMetricsHoursBack: hours,
    });
  }

  /* ── Overview: experience-event volume trend (SVG, profile /api/profile/events) ── */
  const CC_TREND_LEGEND_A = 'Digital touchpoints';
  const CC_TREND_LEGEND_B = 'Journey & platform';

  function ccTrendScopedEventsFromApi(events) {
    const hours = getCcEngagementHoursBack();
    const raw = events || [];
    if (window.EmailEngagementMetrics && typeof window.EmailEngagementMetrics.filterEventsByDateRange === 'function') {
      return window.EmailEngagementMetrics.filterEventsByDateRange(raw, hours);
    }
    return raw;
  }

  /** Edge / app / messaging channels vs Journey Optimizer + generic AEP (same buckets as the event table “Source”). */
  function ccTrendIsDigitalTouchpoint(ev) {
    const src = ccGetEventSource(ev);
    return new Set(['Edge Network', 'Mobile', 'Push', 'SMS', 'Email']).has(src);
  }

  function ccTrendEventTimestamp(ev) {
    if (ev.timestamp == null) return null;
    const ts = typeof ev.timestamp === 'number' ? ev.timestamp : parseInt(ev.timestamp, 10);
    if (!Number.isFinite(ts) || ts <= 0) return null;
    return ts;
  }

  function ccTrendBinCountForHours(hours) {
    const h = Number(hours);
    if (!Number.isFinite(h) || h <= 0) return 6;
    if (h <= 24) return 6;
    if (h <= 168) return 7;
    if (h <= 720) return 10;
    return 12;
  }

  function ccTrendHoursLabel(hours) {
    const h = Number(hours);
    if (!Number.isFinite(h) || h <= 0) return 'selected window';
    if (h === 24) return 'last 24 hours';
    if (h === 168) return 'last 7 days';
    if (h === 720) return 'last 30 days';
    if (h === 2160) return 'last 90 days';
    if (h === 4320) return 'last 180 days';
    if (h === 8760) return 'last 365 days';
    return h + ' hours';
  }

  function renderCcEngagementTrendChart(events) {
    const emptyEl = document.getElementById('ccTrendChartEmpty');
    const wrapEl = document.getElementById('ccTrendChartWrap');
    const noteEl = document.getElementById('ccTrendChartNote');
    const legendA = document.getElementById('ccTrendLegendA');
    const legendB = document.getElementById('ccTrendLegendB');
    const svg = document.getElementById('ccTrendChartSvg');
    const gridG = document.getElementById('ccTrendChartGrid');
    const areaA = document.getElementById('ccTrendAreaA');
    const areaB = document.getElementById('ccTrendAreaB');
    const lineA = document.getElementById('ccTrendLineA');
    const lineB = document.getElementById('ccTrendLineB');
    if (!emptyEl || !wrapEl || !svg || !gridG || !areaA || !areaB || !lineA || !lineB) return;

    const hours = getCcEngagementHoursBack();
    if (noteEl) {
      noteEl.textContent = '· ' + ccTrendHoursLabel(hours) + ', from AEP experience events';
    }

    const profileLoaded = document.body.classList.contains('call-center-profile-loaded');
    if (!profileLoaded) {
      emptyEl.hidden = false;
      emptyEl.textContent =
        'Load a customer profile to chart experience-event volume over time (same time window as Engagement signals).';
      wrapEl.hidden = true;
      if (legendA) {
        legendA.innerHTML = '<i class="cc-chart-dot cc-chart-dot--a" aria-hidden="true"></i>' + CC_TREND_LEGEND_A;
      }
      if (legendB) {
        legendB.innerHTML = '<i class="cc-chart-dot cc-chart-dot--b" aria-hidden="true"></i>' + CC_TREND_LEGEND_B;
      }
      gridG.innerHTML = '';
      lineA.setAttribute('points', '');
      lineB.setAttribute('points', '');
      areaA.setAttribute('points', '');
      areaB.setAttribute('points', '');
      return;
    }

    const scoped = ccTrendScopedEventsFromApi(events);
    if (scoped.length === 0) {
      emptyEl.hidden = false;
      emptyEl.textContent = 'No experience events in this date range for this profile.';
      wrapEl.hidden = true;
      if (legendA) {
        legendA.innerHTML = '<i class="cc-chart-dot cc-chart-dot--a" aria-hidden="true"></i>' + CC_TREND_LEGEND_A + ' · 0';
      }
      if (legendB) {
        legendB.innerHTML = '<i class="cc-chart-dot cc-chart-dot--b" aria-hidden="true"></i>' + CC_TREND_LEGEND_B + ' · 0';
      }
      gridG.innerHTML = '';
      lineA.setAttribute('points', '');
      lineB.setAttribute('points', '');
      areaA.setAttribute('points', '');
      areaB.setAttribute('points', '');
      return;
    }

    emptyEl.hidden = true;
    wrapEl.hidden = false;

    const nBins = ccTrendBinCountForHours(hours);
    const end = Date.now();
    const start = end - hours * 3600000;
    const binMs = (end - start) / nBins;
    const digital = new Array(nBins).fill(0);
    const other = new Array(nBins).fill(0);

    scoped.forEach((ev) => {
      const ts = ccTrendEventTimestamp(ev);
      if (ts == null || ts < start || ts > end) return;
      const bin = Math.min(nBins - 1, Math.max(0, Math.floor((ts - start) / binMs)));
      if (ccTrendIsDigitalTouchpoint(ev)) digital[bin] += 1;
      else other[bin] += 1;
    });

    const sumD = digital.reduce((a, b) => a + b, 0);
    const sumO = other.reduce((a, b) => a + b, 0);
    if (legendA) {
      legendA.innerHTML =
        '<i class="cc-chart-dot cc-chart-dot--a" aria-hidden="true"></i>' + CC_TREND_LEGEND_A + ' (' + sumD + ')';
    }
    if (legendB) {
      legendB.innerHTML =
        '<i class="cc-chart-dot cc-chart-dot--b" aria-hidden="true"></i>' + CC_TREND_LEGEND_B + ' (' + sumO + ')';
    }

    const W = 280;
    const H = 120;
    const padL = 8;
    const padR = 8;
    const padT = 10;
    const padB = 10;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;
    const maxY = Math.max(1, ...digital, ...other);

    const xs = (i) => padL + (nBins === 1 ? innerW / 2 : (i / (nBins - 1)) * innerW);
    const ys = (v) => padT + innerH * (1 - v / maxY);

    const gridLines = 4;
    let gridHtml = '';
    for (let g = 1; g <= gridLines; g += 1) {
      const y = padT + (innerH * g) / (gridLines + 1);
      gridHtml += '<line x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y + '"/>';
    }
    gridG.innerHTML = gridHtml;

    const buildPoints = (counts) => {
      const parts = [];
      for (let i = 0; i < nBins; i += 1) {
        parts.push(xs(i).toFixed(2) + ',' + ys(counts[i]).toFixed(2));
      }
      return parts.join(' ');
    };

    const polyPoints = (counts) => {
      const top = buildPoints(counts).split(' ').filter(Boolean);
      const baseLeft = padL + ',' + (H - padB);
      const baseRight = W - padR + ',' + (H - padB);
      return baseLeft + ' ' + top.join(' ') + ' ' + baseRight;
    };

    lineA.setAttribute('points', buildPoints(digital));
    lineB.setAttribute('points', buildPoints(other));
    areaA.setAttribute('points', polyPoints(digital));
    areaB.setAttribute('points', polyPoints(other));
  }

  const CC_CHART_PALETTE = [
    '#1473e6', '#e68619', '#12805c', '#c9252d', '#7c4dff',
    '#0d66d0', '#d7373f', '#2d9d78', '#e8a735', '#5c6bc0',
    '#00838f', '#ad1457', '#558b2f', '#ef6c00', '#6a1b9a',
  ];
  let ccEventChartInst = null;
  let ccEventChartMode = 'line';

  function renderCcEventActivityChart(events) {
    const sectionEl = document.getElementById('ccEngagementChartSection');
    const emptyEl = document.getElementById('ccEngagementChartEmpty');
    const canvas = document.getElementById('ccEventActivityChart');
    const legendEl = document.getElementById('ccEventActivityLegend');
    const toggleEl = document.getElementById('ccEngagementToggle');
    const captionEl = document.getElementById('ccEngagementChartCaption');
    if (!sectionEl || !canvas) return;

    const hours = getCcEngagementHoursBack();
    const raw = events || [];
    const scoped =
      window.EmailEngagementMetrics && typeof window.EmailEngagementMetrics.filterEventsByDateRange === 'function'
        ? window.EmailEngagementMetrics.filterEventsByDateRange(raw, hours)
        : raw;

    function setCaption(text, show) {
      if (!captionEl) return;
      if (show && text) {
        captionEl.textContent = text;
        captionEl.hidden = false;
      } else {
        captionEl.textContent = '';
        captionEl.hidden = true;
      }
    }

    if (!scoped.length) {
      if (ccEventChartInst) {
        ccEventChartInst.destroy();
        ccEventChartInst = null;
      }
      sectionEl.hidden = true;
      if (emptyEl) emptyEl.hidden = false;
      if (toggleEl) toggleEl.hidden = true;
      setCaption('', false);
      return;
    }

    sectionEl.hidden = false;
    if (emptyEl) emptyEl.hidden = true;
    if (toggleEl) toggleEl.hidden = false;

    const rangeTitle = getCcEngagementRangeTitle(hours);
    const tokenRoot = sectionEl.closest('.cc-card--engagement') || sectionEl;
    const readT = (name, fb) => ccReadTokenFrom(tokenRoot, name, fb);
    const gridColor = readT('--dash-border', 'rgba(128,128,128,0.25)');
    const tickInk = readT('--dash-text-secondary', readT('--dash-muted', 'rgb(110,110,115)'));
    const titleInk = readT('--dash-text', 'rgb(15,23,42)');
    const surf = readT('--dash-surface', '#ffffff');
    const lineColorA = readT('--dash-blue', '#1473e6');
    const lineColorB = readT('--dash-success-border', '#2d8c6f');
    const ttBg = readT('--dash-surface', '#ffffff');
    const ttBorder = readT('--dash-border', 'rgba(148,163,184,0.45)');

    if (ccEventChartInst) {
      ccEventChartInst.destroy();
      ccEventChartInst = null;
    }

    const isLine = ccEventChartMode === 'line';
    const isDoughnut = ccEventChartMode === 'doughnut';

    if (isLine) {
      const bucketed = ccBuildEngagementTimeBuckets(scoped, hours);
      const lineLabels = bucketed.labels;
      const totals = bucketed.totals;
      const messaging = bucketed.messaging;
      const spec = bucketed.spec;
      const yb = ccYAxisSoftBounds([totals, messaging]);
      const ptR = spec.numBuckets > 48 ? 0 : spec.numBuckets > 24 ? 2 : 3;
      const fillA = ccHexToRgba(lineColorA, 0.14) || 'rgba(20,115,230,0.14)';

      ccEventChartInst = new Chart(canvas, {
        type: 'line',
        data: {
          labels: lineLabels,
          datasets: [
            {
              label: 'Total events',
              data: totals,
              borderColor: lineColorA,
              backgroundColor: fillA,
              fill: true,
              tension: 0.25,
              pointRadius: ptR,
              pointHoverRadius: Math.max(ptR, 4),
              pointHitRadius: Math.max(10, ptR + 6),
              borderWidth: 2,
            },
            {
              label: 'Messaging & journeys',
              data: messaging,
              borderColor: lineColorB,
              backgroundColor: 'transparent',
              fill: false,
              tension: 0.25,
              pointRadius: ptR,
              pointHoverRadius: Math.max(ptR, 4),
              pointHitRadius: Math.max(10, ptR + 6),
              borderWidth: 2,
              borderDash: [5, 4],
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          interaction: { mode: 'index', intersect: false },
          scales: {
            x: {
              offset: true,
              grid: { color: gridColor },
              ticks: {
                color: tickInk,
                maxRotation: spec.numBuckets > 18 ? 50 : 30,
                minRotation: spec.numBuckets > 18 ? 24 : 0,
                autoSkip: true,
                maxTicksLimit: spec.xGranularity === 'hour' ? 8 : spec.numBuckets > 20 ? 12 : 14,
                font: { size: 10 },
              },
            },
            y: {
              min: yb.min,
              max: yb.max,
              grid: { color: gridColor },
              ticks: {
                color: tickInk,
                precision: 0,
                callback: (v) => (Math.abs(v - Math.round(v)) < 0.001 ? String(Math.round(v)) : String(Math.round(v * 10) / 10)),
              },
            },
          },
          plugins: {
            legend: { display: false },
            title: {
              display: true,
              text: rangeTitle + ' · ' + spec.bucketPhrase,
              color: titleInk,
              font: { size: 12, weight: '600' },
              padding: { bottom: 6, top: 0 },
            },
            tooltip: {
              backgroundColor: ttBg,
              titleColor: titleInk,
              bodyColor: titleInk,
              borderColor: ttBorder,
              callbacks: {
                label: (ctx) => {
                  const y = ctx.parsed && typeof ctx.parsed.y === 'number' ? ctx.parsed.y : ctx.raw;
                  return ` ${ctx.dataset.label}: ${y}`;
                },
              },
            },
          },
        },
      });

      setCaption(
        `${rangeTitle} — ${spec.bucketPhrase}. Solid: all experience events in the window. Dashed: email, push, SMS, and Journey Optimizer touches.`,
        true,
      );

      if (legendEl) {
        legendEl.hidden = false;
        legendEl.innerHTML =
          '<span class="cc-engagement-legend-item"><span class="cc-engagement-legend-line cc-engagement-legend-line--solid" style="border-color:' +
          lineColorA +
          '"></span>Total events</span>' +
          '<span class="cc-engagement-legend-item"><span class="cc-engagement-legend-line cc-engagement-legend-line--dash" style="border-color:' +
          lineColorB +
          '"></span>Messaging &amp; journeys</span>';
      }
      return;
    }

    const counts = {};
    scoped.forEach((ev) => {
      const t = ev.eventName || 'unknown';
      counts[t] = (counts[t] || 0) + 1;
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    const labels = sorted.map((e) => e[0]);
    const data = sorted.map((e) => e[1]);
    const colors = sorted.map((_, i) => CC_CHART_PALETTE[i % CC_CHART_PALETTE.length]);

    setCaption(`${rangeTitle} — counts by event type (same window as date range).`, true);

    ccEventChartInst = new Chart(canvas, {
      type: isDoughnut ? 'doughnut' : 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Events',
          data,
          backgroundColor: colors,
          borderWidth: isDoughnut ? 2 : 0,
          borderColor: surf,
          borderRadius: isDoughnut ? 0 : 4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: {
            display: true,
            position: 'bottom',
            labels: {
              boxWidth: 10,
              boxHeight: 10,
              padding: 10,
              font: { size: 11 },
              color: () => ccReadTokenFrom(tokenRoot, '--dash-text', 'rgb(15,23,42)'),
            },
          },
          title: {
            display: true,
            text: rangeTitle + ' · by event type',
            color: titleInk,
            font: { size: 12, weight: '600' },
            padding: { bottom: 6, top: 0 },
          },
          tooltip: {
            backgroundColor: ttBg,
            titleColor: titleInk,
            bodyColor: titleInk,
            borderColor: ttBorder,
            callbacks: { label: (ctx) => `${ctx.label}: ${ctx.parsed ?? ctx.raw} events` },
          },
        },
        ...(isDoughnut
          ? { cutout: '55%' }
          : {
              indexAxis: 'x',
              scales: {
                x: { grid: { color: gridColor }, ticks: { color: tickInk, maxRotation: 30, font: { size: 10 } } },
                y: { grid: { color: gridColor }, ticks: { color: tickInk }, beginAtZero: true },
              },
            }),
      },
    });

    if (legendEl) {
      legendEl.innerHTML = '';
      legendEl.hidden = true;
    }
  }

  const customerEmail = document.getElementById('customerEmail');
  if (typeof attachEmailDatalist === 'function') attachEmailDatalist('customerEmail');

  const queryProfileBtn = document.getElementById('queryProfileBtn');
  const infoEcid = document.getElementById('infoEcid');
  const generatorTargetSelect = document.getElementById('generatorTarget');
  const ccEventDestToggle = document.getElementById('ccEventDestToggle');
  const ccEventDestPanel = document.getElementById('ccEventDestPanel');
  const ccEventDestSrCurrent = document.getElementById('ccEventDestSrCurrent');
  const ccEventDestField = document.querySelector('.cc-event-dest-field');
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

  const EVENT_DEST_EXPANDED_KEY = 'aepCcEventDestExpanded';

  function readEventDestExpandedPref() {
    try {
      const v = window.localStorage.getItem(EVENT_DEST_EXPANDED_KEY);
      return v === '1' || v === 'true';
    } catch (_) {
      return false;
    }
  }

  function persistEventDestExpanded(expanded) {
    try {
      window.localStorage.setItem(EVENT_DEST_EXPANDED_KEY, expanded ? '1' : '0');
    } catch (_) {
      /* ignore */
    }
  }

  function updateCcEventDestSummary() {
    if (!generatorTargetSelect) return;
    const opt = generatorTargetSelect.options[generatorTargetSelect.selectedIndex];
    const text = opt && opt.textContent ? String(opt.textContent).trim() : '—';
    const hasChoice = Boolean(text && text !== '—');
    if (ccEventDestSrCurrent) {
      ccEventDestSrCurrent.textContent = hasChoice
        ? `Current selection: ${text}. Expand or press Enter to change.`
        : 'No destination selected. Expand to choose a streaming destination.';
    }
    if (ccEventDestToggle) {
      ccEventDestToggle.setAttribute(
        'title',
        hasChoice ? `Current: ${text}. Click to change.` : 'Choose event destination',
      );
    }
  }

  function setCcEventDestExpanded(expanded, options) {
    const skipPersist = options && options.skipPersist;
    if (!ccEventDestField || !ccEventDestToggle || !ccEventDestPanel) return;
    ccEventDestField.classList.toggle('cc-event-dest-expanded', expanded);
    ccEventDestToggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    ccEventDestPanel.hidden = !expanded;
    if (!skipPersist) persistEventDestExpanded(expanded);
  }

  function initCcEventDestDisclosure() {
    if (!ccEventDestToggle || !ccEventDestPanel || !ccEventDestField) return;
    setCcEventDestExpanded(readEventDestExpandedPref(), { skipPersist: true });
    ccEventDestToggle.addEventListener('click', () => {
      const next = !ccEventDestField.classList.contains('cc-event-dest-expanded');
      setCcEventDestExpanded(next);
      if (next && generatorTargetSelect) {
        window.requestAnimationFrame(() => {
          generatorTargetSelect.focus();
        });
      }
    });
    ccEventDestToggle.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      if (ccEventDestField.classList.contains('cc-event-dest-expanded')) return;
      e.preventDefault();
      setCcEventDestExpanded(true);
      if (generatorTargetSelect) {
        window.requestAnimationFrame(() => {
          generatorTargetSelect.focus();
        });
      }
    });
    if (generatorTargetSelect) {
      generatorTargetSelect.addEventListener('change', () => {
        updateCcEventDestSummary();
      });
    }
    updateCcEventDestSummary();
  }

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

  function getLastProfileFromDrawerApi() {
    const d = window.DemoProfileDrawer;
    const a = window.AepProfileDrawer;
    if (d && typeof d.getLastLookedUpProfile === 'function') return d.getLastLookedUpProfile();
    if (a && typeof a.getLastLookedUpProfile === 'function') return a.getLastLookedUpProfile();
    return null;
  }

  /** Display name for screen pop / hero — same source as agent cards (not drawer DOM timing). */
  function getCcScreenPopDisplayName(lookupEmail) {
    const profile = getLastProfileFromDrawerApi();
    const emailFallback = String(lookupEmail || '').trim();
    if (profile) {
      const first = profile.firstName != null ? String(profile.firstName).trim() : '';
      const last = profile.lastName != null ? String(profile.lastName).trim() : '';
      const full = `${first} ${last}`.trim();
      if (full) return full;
      const em = profile.email != null ? String(profile.email).trim() : '';
      if (em) return em;
    }
    return emailFallback || 'Customer';
  }

  /**
   * Phone for agent cards / hero: `mobilePhone.number` (XDM / table), then `phone` on merged profile,
   * then phone-like identities (consent graph).
   * Sourced from `DemoProfileDrawer.getLastLookedUpProfile()` after consent + optional `patchLastProfileOrUpdate({ phone })` from table.
   */
  function pickPhoneFromProfileIdentities(profile) {
    const p = profile || {};
    if (p.mobilePhone && typeof p.mobilePhone === 'object' && p.mobilePhone.number != null) {
      const m = String(p.mobilePhone.number).trim();
      if (m) return m;
    }
    if (p.phone != null && String(p.phone).trim() !== '') {
      return String(p.phone).trim();
    }
    const ids = p.identities;
    if (!Array.isArray(ids)) return '';
    for (let i = 0; i < ids.length; i += 1) {
      const id = ids[i];
      const ns = String(id && id.namespace != null ? id.namespace : '');
      if (/phone|sms/i.test(ns)) {
        const v = String(id.value || '').trim();
        if (v) return v;
      }
    }
    return '';
  }

  function formatCcCardScalar(val) {
    if (val == null) return '';
    const s = String(val).trim();
    return s;
  }

  /**
   * Fill Contact details / Profile attributes cards from the same object as the bottom drawer
   * (`getLastLookedUpProfile()`), so we are not racing drawer DOM paints.
   * @param {string} lookupEmail - typed email when API omits canonical email
   */
  function applyCcAgentCardsFromLastProfile(lookupEmail) {
    const profile = getLastProfileFromDrawerApi();
    const emailFallback = String(lookupEmail || '').trim();

    const emailRaw = profile && profile.email != null && String(profile.email).trim() ? String(profile.email).trim() : emailFallback;
    setElText('ccCardEmail', emailRaw ? emailRaw : '—');

    const phoneRaw = pickPhoneFromProfileIdentities(profile || {});
    setElText('ccCardPhone', phoneRaw ? phoneRaw : '—');

    const cityRaw = formatCcCardScalar(profile && profile.city);
    setElText('ccCardCity', cityRaw ? cityRaw : '—');

    const first = profile && profile.firstName ? String(profile.firstName).trim() : '';
    const last = profile && profile.lastName ? String(profile.lastName).trim() : '';
    const full = `${first} ${last}`.trim();
    setElText('ccCardFullName', full ? full : 'No profile loaded');

    const ltvRaw = formatCcCardScalar(profile && profile.customerLifetimeValue);
    setElText('ccCardLtv', ltvRaw ? ltvRaw : '—');

    const prop = formatCcCardScalar(profile && profile.propensityScore);
    setElText('ccCardPropensity', prop ? prop : '—');

    const churn = formatCcCardScalar(profile && profile.churnPrediction);
    setElText('ccCardChurn', churn ? churn : '—');

    const loyalty = formatCcCardScalar(profile && profile.loyaltyStatus);
    setElText('ccCardLoyalty', loyalty ? loyalty : 'Unknown');

    updateFauxCardPan();
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
    const fallbackEmail = customerEmail ? String(customerEmail.value || '').trim() : '';
    const drawerName = copyElText('profileDrawerName');
    const name =
      drawerName && drawerName !== 'No profile loaded' ? drawerName : getCcScreenPopDisplayName(fallbackEmail);
    const email = copyElText('profileDrawerEmail');
    const phone = copyElText('profileDrawerPhone');
    const dispName = name || fallbackEmail || 'Customer';
    setElText('ccSessionName', dispName);
    const emailDisp = email && email !== '—' ? email : fallbackEmail || '—';
    setElText('ccSessionEmail', emailDisp);
    const phoneDisp = phone && phone !== 'Unknown' && phone !== '—' ? phone : '—';
    setElText('ccHeroPhoneLine', phoneDisp);

    const avFrom = document.getElementById('profileDrawerAvatar');
    const heroAv = document.getElementById('ccHeroAvatar');
    if (heroAv && avFrom && avFrom.getAttribute('src')) heroAv.src = avFrom.src;

    setElText('ccHeroStatusVerb', 'Talking');
    const channelLabel = selectedChannel === 'voice' ? 'Voice call' : selectedChannel === 'mobile' ? 'Mobile' : 'Email';
    setElText('ccHeroChannel', channelLabel + ' · Adobe Experience Platform');

    const qn = document.getElementById('ccQueueActiveName');
    const qs = document.getElementById('ccQueueActiveSub');
    if (qn)
      qn.textContent =
        name && name !== 'Customer' && name !== fallbackEmail ? name.split(/\s+/)[0] + ' · active' : 'Awaiting lookup';
    if (qs) qs.textContent = fallbackEmail || emailDisp !== '—' ? 'On session' : 'Session idle';
  }

  function resetIdleAgentUi() {
    document.body.classList.remove('call-center-profile-loaded');
    window._ccLastEvents = null;
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
    ].forEach((id) => setElText(id, '—'));
    updateFauxCardPan();
    if (ccScreenPop) ccScreenPop.hidden = true;
    if (ccScreenPopName) ccScreenPopName.textContent = '—';
    renderCcEngagementTrendChart([]);
    renderCcEventActivityChart([]);
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

  function ccInboundEventType() {
    if (selectedChannel === 'email') return 'contactCentre.inbound.email';
    if (selectedChannel === 'mobile') return 'contactCentre.inbound.sms';
    return 'contactCentre.inbound.call';
  }

  function ccInboundChannelLabel() {
    if (selectedChannel === 'email') return 'Email';
    if (selectedChannel === 'mobile') return 'SMS';
    return 'Voice';
  }

  function getEmail() {
    return (customerEmail && customerEmail.value) || '';
  }

  /** Email field or last-loaded profile drawer email (for generator identity). */
  function getCcCustomerEmailForEvents() {
    const fromInput = getEmail().trim();
    if (fromInput) return fromInput;
    const drawer = document.getElementById('profileDrawerEmail');
    const t = drawer ? String(drawer.textContent || '').trim() : '';
    if (t && t !== '—') return t;
    return '';
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

  async function sendCcInboundEvent(email) {
    const target = getSelectedGeneratorTarget();
    const ecid = getEcidForExperienceEvent();
    const eventType = ccInboundEventType();
    const channelLabel = ccInboundChannelLabel();
    const body = {
      targetId: target ? target.id : undefined,
      email: String(email || '').trim(),
      eventType,
      // cx → _demoemea.interactionDetails.core.channel (contact centre channel)
      channel: 'cx',
      // message.channel → _demoemea.message.channel (specific inbound channel)
      message: { channel: channelLabel.toLowerCase() },
      viewName: 'Contact centre · inbound · ' + channelLabel,
      viewUrl: typeof window !== 'undefined' ? window.location.href.split('?')[0] : '',
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

  /** Static demo flights (concierge mimic; not real inventory). */
  const CC_DEMO_FLIGHTS_OUTBOUND = [
    { id: 'ey11', flightNo: 'EY 11', label: 'Abu Dhabi → London Heathrow', time: '09:30', route: 'AUH–LHR' },
    { id: 'ey19', flightNo: 'EY 19', label: 'Abu Dhabi → London Heathrow', time: '14:05', route: 'AUH–LHR' },
    { id: 'ey25', flightNo: 'EY 25', label: 'Abu Dhabi → London Heathrow', time: '22:40', route: 'AUH–LHR' },
  ];
  const CC_DEMO_FLIGHTS_RETURN = [
    { id: 'ey12', flightNo: 'EY 12', label: 'London Heathrow → Abu Dhabi', time: '10:15', route: 'LHR–AUH' },
    { id: 'ey20', flightNo: 'EY 20', label: 'London Heathrow → Abu Dhabi', time: '21:30', route: 'LHR–AUH' },
  ];
  const CC_DEMO_SEATS = ['1A', '1B', '2A', '2B', '3A', '3B'];

  /** @type {{ outboundId: string, returnId: string, seatOutbound: string|null, seatReturn: string|null }} */
  let ccFlightBookingState = {
    outboundId: CC_DEMO_FLIGHTS_OUTBOUND[0].id,
    returnId: CC_DEMO_FLIGHTS_RETURN[0].id,
    seatOutbound: null,
    seatReturn: null,
  };

  /** @type {HTMLElement|null} */
  let ccFlightBookingOpener = null;

  function findCcDemoFlight(leg, id) {
    const list = leg === 'outbound' ? CC_DEMO_FLIGHTS_OUTBOUND : CC_DEMO_FLIGHTS_RETURN;
    return list.find((f) => f.id === id) || list[0];
  }

  function resetCcFlightBookingState() {
    ccFlightBookingState = {
      outboundId: CC_DEMO_FLIGHTS_OUTBOUND[0].id,
      returnId: CC_DEMO_FLIGHTS_RETURN[0].id,
      seatOutbound: null,
      seatReturn: null,
    };
  }

  function buildCcFlightRadioGroup(container, flights, groupName, checkedId, onChange) {
    if (!container) return;
    container.innerHTML = '';
    flights.forEach((f) => {
      const lbl = document.createElement('label');
      lbl.className = 'cc-flight-option';
      const inp = document.createElement('input');
      inp.type = 'radio';
      inp.name = groupName;
      inp.value = f.id;
      inp.checked = f.id === checkedId;
      inp.addEventListener('change', () => {
        if (!inp.checked) return;
        if (groupName === 'ccFlightOutbound') ccFlightBookingState.outboundId = f.id;
        else ccFlightBookingState.returnId = f.id;
        onChange();
      });
      const main = document.createElement('span');
      main.className = 'cc-flight-option-main';
      const route = document.createElement('span');
      route.className = 'cc-flight-option-route';
      route.textContent = f.label + ' · ' + f.flightNo;
      const meta = document.createElement('span');
      meta.className = 'cc-flight-option-meta';
      meta.textContent = f.time + ' · ' + f.route;
      main.appendChild(route);
      main.appendChild(meta);
      lbl.appendChild(inp);
      lbl.appendChild(main);
      container.appendChild(lbl);
    });
  }

  function buildCcSeatGrid(container, legKey, onChange) {
    if (!container) return;
    container.innerHTML = '';
    const curSeat = legKey === 'outbound' ? ccFlightBookingState.seatOutbound : ccFlightBookingState.seatReturn;
    CC_DEMO_SEATS.forEach((seat) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cc-seat-btn';
      b.textContent = seat;
      b.setAttribute('aria-pressed', curSeat === seat ? 'true' : 'false');
      b.addEventListener('click', () => {
        if (legKey === 'outbound') ccFlightBookingState.seatOutbound = seat;
        else ccFlightBookingState.seatReturn = seat;
        container.querySelectorAll('.cc-seat-btn').forEach((btn) => {
          btn.setAttribute('aria-pressed', btn === b ? 'true' : 'false');
        });
        onChange();
      });
      container.appendChild(b);
    });
  }

  function updateCcFlightBookSubmitState() {
    const hint = document.getElementById('ccFlightBookingEmailHint');
    const submit = document.getElementById('ccFlightBookSubmit');
    const email = getCcCustomerEmailForEvents().trim();
    const seatsOk = Boolean(ccFlightBookingState.seatOutbound && ccFlightBookingState.seatReturn);
    if (!email) {
      if (hint) {
        hint.hidden = false;
        hint.textContent =
          'Load a customer profile first so an email is available — the lab generator uses it like inbound contactCentre events.';
      }
      if (submit) submit.disabled = true;
      return;
    }
    if (hint) hint.hidden = true;
    if (submit) submit.disabled = !seatsOk;
  }

  function syncCcFlightModalSelectionsFromState() {
    buildCcFlightRadioGroup(
      document.getElementById('ccFlightOutboundOptions'),
      CC_DEMO_FLIGHTS_OUTBOUND,
      'ccFlightOutbound',
      ccFlightBookingState.outboundId,
      updateCcFlightBookSubmitState,
    );
    buildCcFlightRadioGroup(
      document.getElementById('ccFlightReturnOptions'),
      CC_DEMO_FLIGHTS_RETURN,
      'ccFlightReturn',
      ccFlightBookingState.returnId,
      updateCcFlightBookSubmitState,
    );
    buildCcSeatGrid(document.getElementById('ccSeatGridOutbound'), 'outbound', updateCcFlightBookSubmitState);
    buildCcSeatGrid(document.getElementById('ccSeatGridReturn'), 'return', updateCcFlightBookSubmitState);
    updateCcFlightBookSubmitState();
  }

  function openCcFlightBookingModal() {
    const root = document.getElementById('ccFlightBookingRoot');
    const opener = document.getElementById('ccFlightBookingBtn');
    if (!root) return;
    ccFlightBookingOpener = opener || null;
    resetCcFlightBookingState();
    syncCcFlightModalSelectionsFromState();
    root.hidden = false;
    window.requestAnimationFrame(() => {
      const radio = root.querySelector('#ccFlightOutboundOptions input[type="radio"]');
      if (radio) radio.focus();
      else {
        const closeBtn = document.getElementById('ccFlightBookingClose');
        if (closeBtn) closeBtn.focus();
      }
    });
  }

  function closeCcFlightBookingModal() {
    const root = document.getElementById('ccFlightBookingRoot');
    if (!root || root.hidden) return;
    root.hidden = true;
    const back = ccFlightBookingOpener;
    ccFlightBookingOpener = null;
    if (back && typeof back.focus === 'function') {
      window.requestAnimationFrame(() => back.focus());
    }
  }

  async function sendCcFlightBookedEvent() {
    const email = getCcCustomerEmailForEvents().trim();
    if (!email) return;
    if (!ccFlightBookingState.seatOutbound || !ccFlightBookingState.seatReturn) return;
    const target = getSelectedGeneratorTarget();
    const ecid = getEcidForExperienceEvent();
    const ob = findCcDemoFlight('outbound', ccFlightBookingState.outboundId);
    const rt = findCcDemoFlight('return', ccFlightBookingState.returnId);
    const channelLower = ccInboundChannelLabel().toLowerCase();
    const body = augmentCcGeneratorPostBody({
      targetId: target ? target.id : undefined,
      email,
      eventType: 'contactCentre.flight.booked',
      channel: 'cx',
      message: {
        channel: channelLower,
        outbound: {
          flightNo: ob.flightNo,
          seat: ccFlightBookingState.seatOutbound,
          label: ob.label,
          time: ob.time,
          route: ob.route,
        },
        return: {
          flightNo: rt.flightNo,
          seat: ccFlightBookingState.seatReturn,
          label: rt.label,
          time: rt.time,
          route: rt.route,
        },
      },
      viewName: 'Contact centre · flight booking',
      viewUrl: typeof window !== 'undefined' ? window.location.href.split('?')[0] : '',
    });
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
    return data;
  }

  function initCcFlightBookingModal() {
    const btn = document.getElementById('ccFlightBookingBtn');
    const root = document.getElementById('ccFlightBookingRoot');
    const backdrop = document.getElementById('ccFlightBookingBackdrop');
    const dlgClose = document.getElementById('ccFlightBookingClose');
    const cancel = document.getElementById('ccFlightBookingCancel');
    const submit = document.getElementById('ccFlightBookSubmit');
    if (!btn || !root) return;

    btn.addEventListener('click', () => {
      activateWorkspaceTab('orders');
      openCcFlightBookingModal();
    });
    dlgClose && dlgClose.addEventListener('click', () => closeCcFlightBookingModal());
    cancel && cancel.addEventListener('click', () => closeCcFlightBookingModal());
    backdrop &&
      backdrop.addEventListener('click', () => {
        closeCcFlightBookingModal();
      });
    submit &&
      submit.addEventListener('click', async () => {
        if (!getCcCustomerEmailForEvents().trim()) {
          updateCcFlightBookSubmitState();
          return;
        }
        if (!ccFlightBookingState.seatOutbound || !ccFlightBookingState.seatReturn) return;
        submit.disabled = true;
        try {
          await sendCcFlightBookedEvent();
          setStatus('Sent contactCentre.flight.booked to AEP.', 'success');
          closeCcFlightBookingModal();
          const em = getCcCustomerEmailForEvents().trim();
          if (em) void fetchAndRenderCcEvents(em);
        } catch (err) {
          setStatus('Flight booking event failed: ' + ((err && err.message) || String(err)), 'error');
        } finally {
          if (submit) submit.disabled = false;
          updateCcFlightBookSubmitState();
        }
      });

    if (customerEmail) {
      customerEmail.addEventListener('input', () => {
        if (!root.hidden) updateCcFlightBookSubmitState();
      });
    }
  }

  async function loadGeneratorTargets() {
    if (!generatorTargetSelect) return;
    try {
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
    } finally {
      updateCcEventDestSummary();
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
    const flightRoot = document.getElementById('ccFlightBookingRoot');
    if (flightRoot && !flightRoot.hidden) {
      e.preventDefault();
      closeCcFlightBookingModal();
      return;
    }
    if (document.body.classList.contains('call-center-nav-open')) {
      setNavOpen(false);
      return;
    }
    if (ccEventDestField && ccEventDestField.classList.contains('cc-event-dest-expanded') && ccEventDestPanel) {
      const ae = document.activeElement;
      if (ae && (ccEventDestPanel === ae || ccEventDestPanel.contains(ae))) {
        setCcEventDestExpanded(false);
        if (ccEventDestToggle) ccEventDestToggle.focus();
        return;
      }
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
      resetCcEngagementRangeToDefault();
      queryProfileBtn.disabled = true;
      setStatus('Loading profile from AEP…', '');
      stopSessionTimer();
      sessionSeconds = 0;
      updateSessionTimerEl();
      let drawerCallOk = false;
      let profileFound = false;
      try {
        // loadProfileDataForDrawer returns true after a successful HTTP consent response (boolean).
        // `type === 'success'` on onUserMessage means `data.found` (profile entity exists).
        drawerCallOk = await window.AepProfileDrawer.loadProfileDataForDrawer(email, {
          onUserMessage: (msg, type) => {
            setStatus(msg, type);
            if (type === 'success') profileFound = true;
          },
          addEmailOnSuccess: true,
          engagementMetricsHoursBack: getCcEngagementHoursBack(),
        });
        if (drawerCallOk && profileFound) {
          try {
            await sendCcInboundEvent(email);
            setStatus(
              'Profile loaded. Sent ' + ccInboundEventType() + ' to AEP (with ECID when available).',
              'success',
            );
          } catch (loginErr) {
            setStatus(
              'Profile loaded. ' +
                ccInboundEventType() +
                ' event failed: ' +
                (loginErr && loginErr.message ? loginErr.message : String(loginErr)),
              'error',
            );
          }
          let tablePayload = null;
          try {
            tablePayload = await fetchProfileTableRows(email);
          } catch (_) {
            tablePayload = null;
          }
          const mobileFromTable = extractMobilePhoneNumberFromTablePayload(tablePayload);
          if (
            mobileFromTable &&
            window.AepProfileDrawer &&
            typeof window.AepProfileDrawer.patchLastProfileOrUpdate === 'function'
          ) {
            window.AepProfileDrawer.patchLastProfileOrUpdate({ phone: mobileFromTable });
          }
          const emailForCards = email;
          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
              mirrorAboutCardsFromDrawer();
              applyCcAgentCardsFromLastProfile(emailForCards);
              mirrorProfileToAgentUi();
              if (ccScreenPop && ccScreenPopName) {
                ccScreenPopName.textContent = getCcScreenPopDisplayName(emailForCards);
                ccScreenPop.hidden = false;
              }
              startSessionTimer();
              activateWorkspaceTab('details');
            });
          });
          void fetchAndRenderTravel(email, tablePayload);
          void fetchAndRenderCcEvents(email);
        } else if (drawerCallOk && !profileFound) {
          setStatus('No profile in store for this email. Try another address or seed data in the sandbox.', 'warn');
          resetIdleAgentUi();
        }
      } catch (err) {
        setStatus((err && err.message) || 'Could not load profile.', 'error');
      } finally {
        if (profileFound) {
          document.body.classList.add('call-center-profile-loaded');
        } else {
          document.body.classList.remove('call-center-profile-loaded');
        }
        queryProfileBtn.disabled = false;
      }
    });

  if (typeof window.AepProfileDrawer !== 'undefined' && typeof window.AepProfileDrawer.init === 'function') {
    window.AepProfileDrawer.init({
      emailInputId: 'customerEmail',
      viewName: 'Contact centre (apalmer sandbox)',
      getSelectedGeneratorTarget,
      engagementMetricsHoursBack: getCcEngagementHoursBack(),
    });
  }
  document.body.classList.add('aep-profile-drawer-open');

  document.querySelectorAll('.call-center-state-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.call-center-state-btn').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
    });
  });

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cc-chart-type]');
    if (!btn) return;
    const type = btn.getAttribute('data-cc-chart-type');
    if (type === ccEventChartMode) return;
    ccEventChartMode = type;
    const toggleEl = document.getElementById('ccEngagementToggle');
    if (toggleEl) {
      toggleEl.querySelectorAll('[data-cc-chart-type]').forEach((b) => {
        const active = b === btn;
        b.classList.toggle('cc-engagement-toggle-btn--active', active);
        b.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    }
    const lastEmail = (document.getElementById('customerEmail') || {}).value || '';
    if (lastEmail) {
      renderCcEventActivityChart(window._ccLastEvents || []);
      renderCcEngagementTrendChart(window._ccLastEvents || []);
    }
  });

  const ccEngagementDateRange = document.getElementById('ccEngagementDateRange');
  if (ccEngagementDateRange) {
    ccEngagementDateRange.addEventListener('change', () => {
      renderCcEventActivityChart(window._ccLastEvents || []);
      renderCcEngagementTrendChart(window._ccLastEvents || []);
      refreshCcDrawerEngagementFromRange();
    });
  }

  initIndustryUi();
  initCcFlightBookingModal();
  initCcEventDestDisclosure();
  void loadGeneratorTargets();
  void initFromRtdb();
  window.addEventListener('aep-global-sandbox-change', function () {
    void initFromRtdb();
    resetCcEngagementRangeToDefault();
    const em = customerEmail ? String(customerEmail.value || '').trim() : '';
    if (em && document.body.classList.contains('call-center-profile-loaded')) {
      void fetchAndRenderCcEvents(em);
    } else {
      window._ccLastEvents = [];
      renderCcRecentEvents([]);
      renderCcDetailsJourneyActivity([]);
      renderCcEventActivityChart([]);
      renderCcEngagementTrendChart([]);
      refreshCcDrawerEngagementFromRange();
    }
  });
  if (typeof window.AepDemoGeneratorTargets !== 'undefined' && window.AepDemoGeneratorTargets.onSandboxChange) {
    window.AepDemoGeneratorTargets.onSandboxChange(function () {
      void loadGeneratorTargets();
    });
  }

  window.addEventListener('aep-theme-change', function () {
    renderCcEngagementTrendChart(window._ccLastEvents || []);
    if (window._ccLastEvents && window._ccLastEvents.length) {
      renderCcEventActivityChart(window._ccLastEvents);
    }
  });

  renderCcEngagementTrendChart([]);

  function applyCallCenterEmailFromQuery() {
    try {
      const p = new URLSearchParams(window.location.search);
      const raw = p.get('email') || p.get('identifier') || '';
      const email = String(raw || '').trim();
      if (!email || !customerEmail) return;
      customerEmail.value = email;
      if (queryProfileBtn) queryProfileBtn.click();
    } catch (_err) {
      /* noop */
    }
  }
  window.setTimeout(applyCallCenterEmailFromQuery, 650);
})();
