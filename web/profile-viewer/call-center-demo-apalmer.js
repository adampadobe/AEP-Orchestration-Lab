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

  // ─── RTDB helpers ─────────────────────────────────────────────────────────
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
        initialsEl.textContent = parts.map((p) => p[0] || '').join('').slice(0, 2).toUpperCase();
        initialsEl.title = agentName;
      }
    }

    const colour = sp.Colour || cd.Colour || null;
    if (colour) {
      document.body.style.setProperty('--cc-accent', colour);
      document.body.style.setProperty('--cc-accent-soft', colour + '22');
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
    const panel = document.getElementById('ccPanelOrders');
    if (!panel) return;

    if (!travel || (!travel.flightNumber && !travel.confirmationNumber)) {
      panel.innerHTML = `
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

  async function fetchAndRenderTravel(email) {
    const tableData = await fetchProfileTableRows(email);
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
  const CC_CHART_PALETTE = [
    '#1473e6', '#e68619', '#12805c', '#c9252d', '#7c4dff',
    '#0d66d0', '#d7373f', '#2d9d78', '#e8a735', '#5c6bc0',
    '#00838f', '#ad1457', '#558b2f', '#ef6c00', '#6a1b9a',
  ];
  let ccEventChartInst = null;
  let ccEventChartMode = 'doughnut';

  function renderCcEventActivityChart(events) {
    const sectionEl = document.getElementById('ccEngagementChartSection');
    const emptyEl = document.getElementById('ccEngagementChartEmpty');
    const canvas = document.getElementById('ccEventActivityChart');
    const legendEl = document.getElementById('ccEventActivityLegend');
    const toggleEl = document.getElementById('ccEngagementToggle');
    if (!sectionEl || !canvas) return;

    const counts = {};
    (events || []).forEach((ev) => {
      const t = ev.eventName || 'unknown';
      counts[t] = (counts[t] || 0) + 1;
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

    if (!sorted.length) {
      sectionEl.hidden = true;
      if (emptyEl) emptyEl.hidden = false;
      if (toggleEl) toggleEl.hidden = true;
      return;
    }

    sectionEl.hidden = false;
    if (emptyEl) emptyEl.hidden = true;
    if (toggleEl) toggleEl.hidden = false;

    const labels = sorted.map((e) => e[0]);
    const data = sorted.map((e) => e[1]);
    const colors = sorted.map((_, i) => CC_CHART_PALETTE[i % CC_CHART_PALETTE.length]);

    if (ccEventChartInst) { ccEventChartInst.destroy(); ccEventChartInst = null; }

    const isDoughnut = ccEventChartMode === 'doughnut';
    const isDark = document.documentElement.getAttribute('data-aep-theme') === 'dark';
    const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
    const tickColor = isDark ? '#b0b0b0' : '#666';

    ccEventChartInst = new Chart(canvas, {
      type: isDoughnut ? 'doughnut' : 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Events',
          data,
          backgroundColor: colors,
          borderWidth: isDoughnut ? 2 : 0,
          borderColor: isDark ? '#1e1e1e' : '#fff',
          borderRadius: isDoughnut ? 0 : 4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.parsed ?? ctx.raw} events` } },
        },
        ...(isDoughnut ? { cutout: '55%' } : {
          indexAxis: 'x',
          scales: {
            x: { grid: { color: gridColor }, ticks: { color: tickColor, maxRotation: 30, font: { size: 10 } } },
            y: { grid: { color: gridColor }, ticks: { color: tickColor }, beginAtZero: true },
          },
        }),
      },
    });

    if (legendEl) {
      legendEl.innerHTML = sorted.map((e, i) =>
        `<span class="cc-engagement-legend-item"><span class="cc-engagement-legend-swatch" style="background:${colors[i]}"></span>${e[0]} (${e[1]})</span>`
      ).join('');
    }
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
      const lis = Array.from(audUl.querySelectorAll('li'));
      const valid = lis.filter(li => li.textContent && !/no audience/i.test(li.textContent));
      if (valid.length > 0) {
        const names = valid.slice(0, 3).map(li => li.textContent.trim());
        audSummary = names.join(' · ');
        if (valid.length > 3) audSummary += ' +' + (valid.length - 3);
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
    const channelLabel = selectedChannel === 'voice' ? 'Voice call' : selectedChannel === 'mobile' ? 'Mobile' : 'Email';
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
      let drawerCallOk = false;
      let profileFound = false;
      try {
        // loadProfileDataForDrawer returns true/false (boolean), not {ok,found}.
        // Capture found status via the message callback — drawer fires type='success'
        // when a real profile exists, empty string when not found.
        drawerCallOk = await window.AepProfileDrawer.loadProfileDataForDrawer(email, {
          onUserMessage: (msg, type) => {
            setStatus(msg, type);
            if (type === 'success' && /profile found/i.test(msg)) profileFound = true;
          },
          addEmailOnSuccess: true,
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
          window.requestAnimationFrame(() => {
            mirrorProfileToAgentUi();
            mirrorAboutCardsFromDrawer();
            startSessionTimer();
            activateWorkspaceTab('details');
          });
          void fetchAndRenderTravel(email);
          void fetchAndRenderCcEvents(email);
        } else if (drawerCallOk && !profileFound) {
          setStatus('No profile in store for this email. Try another address or seed data in the sandbox.', 'warn');
          resetIdleAgentUi();
        }
        if (profileFound) {
          const nameEl = document.getElementById('profileDrawerName');
          const displayName = nameEl && nameEl.textContent ? nameEl.textContent.trim() : email;
          if (ccScreenPop && ccScreenPopName) {
            ccScreenPopName.textContent = displayName;
            ccScreenPop.hidden = false;
          }
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
    if (lastEmail) void renderCcEventActivityChart(window._ccLastEvents || []);
  });

  initIndustryUi();
  void loadGeneratorTargets();
  void initFromRtdb();
  if (typeof window.AepDemoGeneratorTargets !== 'undefined' && window.AepDemoGeneratorTargets.onSandboxChange) {
    window.AepDemoGeneratorTargets.onSandboxChange(function () {
      void loadGeneratorTargets();
    });
  }

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
