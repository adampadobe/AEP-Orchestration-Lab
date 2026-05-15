/**
 * Etihad iPad lab: RTDB ajoLookups/{sandbox} + GET /api/profile/table + POST /api/ipad/event.
 */
(function () {
  'use strict';

  var rtdbBase =
    (window.firebaseDatabaseConfig && window.firebaseDatabaseConfig.databaseURL) ||
    'https://aep-orchestration-lab-default-rtdb.firebaseio.com';

  var rtdbData = {};
  var currentPassengerEmail = '';
  var currentProfileData = null;
  var boardingSelectedSeat = '';

  var COLOUR_STORE_KEY = 'ipadBezColour';
  var SIZE_STORE_KEY = 'ipadBezSize';
  var ORIENT_STORE_KEY = 'ipadBezOrient';

  /** Client-only recent email lookups (max 5, newest first, case-insensitive dedupe). */
  var ETIHAD_IPAD_RECENT_EMAILS_KEY = 'etihadIpadRecentEmails';
  var ETIHAD_IPAD_RECENT_EMAILS_MAX = 5;

  /** NPS on 0–10 scale: scores strictly below this show the at-risk (detractor) banner. */
  var ETIHAD_IPAD_DETRACTOR_NPS_THRESHOLD = 7;
  var ETIHAD_IPAD_DETRACTOR_DISMISS_PREFIX = 'etihadIpadDetractorDismissed:';

  var SIZE_MAP = {
    '11': { vpW: 834, vpH: 1194, wrapW: 870, outerH: 1242, baseScale: 0.75 },
    '13': { vpW: 1024, vpH: 1366, wrapW: 1062, outerH: 1416, baseScale: 0.62 },
  };

  var isLandscape = false;
  var currentSizeKey = '11';

  var FS_LOGO_ENTER =
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">' +
    '<path fill="currentColor" d="M12.75,14.93652h-5.5c-1.24072,0-2.25-1.00928-2.25-2.25v-5.5c0-1.24072,1.00928-2.25,2.25-2.25h5.5c1.24072,0,2.25,1.00928,2.25,2.25v5.5c0,1.24072-1.00928,2.25-2.25,2.25ZM7.25,6.43652c-.41357,0-.75.33643-.75.75v5.5c0,.41357.33643.75.75.75h5.5c.41357,0,.75-.33643.75-.75v-5.5c0-.41357-.33643-.75-.75-.75h-5.5Z"/>' +
    '<path fill="currentColor" d="M4.5,19h-2.25c-.68945,0-1.25-.56055-1.25-1.25v-2.25c0-.41406.33594-.75.75-.75s.75.33594.75.75v2h2c.41406,0,.75.33594.75.75s-.33594.75-.75.75Z"/>' +
    '<path fill="currentColor" d="M17.75,19h-2.25c-.41406,0-.75-.33594-.75-.75s.33594-.75.75-.75h2v-2c0-.41406.33594-.75.75-.75s.75.33594.75.75v2.25c0,.68945-.56055,1.25-1.25,1.25Z"/>' +
    '<path fill="currentColor" d="M18.25,5.25c-.41406,0-.75-.33594-.75-.75v-2h-2c-.41406,0-.75-.33594-.75-.75s.33594-.75.75-.75h2.25c.68945,0,1.25.56055,1.25,1.25v2.25c0,.41406-.33594.75-.75.75ZM17.75,2.5h.00977-.00977Z"/>' +
    '<path fill="currentColor" d="M1.75,5.25c-.41406,0-.75-.33594-.75-.75v-2.25c0-.68945.56055-1.25,1.25-1.25h2.25c.41406,0,.75.33594.75.75s-.33594.75-.75.75h-2v2c0,.41406-.33594.75-.75.75Z"/>' +
    '</svg>';

  var FS_LOGO_EXIT =
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">' +
    '<path fill="currentColor" d="M12.75,15h-5.5c-1.24072,0-2.25-1.00928-2.25-2.25v-5.5c0-1.24072,1.00928-2.25,2.25-2.25h5.5c1.24072,0,2.25,1.00928,2.25,2.25v5.5c0,1.24072-1.00928,2.25-2.25,2.25ZM7.25,6.5c-.41357,0-.75.33643-.75.75v5.5c0,.41357.33643.75.75.75h5.5c.41357,0,.75-.33643.75-.75v-5.5c0-.41357-.33643-.75-.75-.75h-5.5Z"/>' +
    '<path fill="currentColor" d="M19,4.5h-2.25c-.68945,0-1.25-.56055-1.25-1.25V1c0-.41406.33594-.75.75-.75s.75.33594.75.75v2h2c.41406,0,.75.33594.75.75s-.33594.75-.75.75Z"/>' +
    '<path fill="currentColor" d="M3.25,4.5H1c-.41406,0-.75-.33594-.75-.75s.33594-.75.75-.75h2V1c0-.41406.33594-.75.75-.75s.75.33594.75.75v2.25c0,.68945-.56055,1.25-1.25,1.25Z"/>' +
    '<path fill="currentColor" d="M3.75,19.75c-.41406,0-.75-.33594-.75-.75v-2H1c-.41406,0-.75-.33594-.75-.75s.33594-.75.75-.75h2.25c.68945,0,1.25.56055,1.25,1.25v2.25c0,.41406-.33594.75-.75.75ZM3.25,17h.00977-.00977Z"/>' +
    '<path fill="currentColor" d="M16.25,19.75c-.41406,0-.75-.33594-.75-.75v-2.25c0-.68945.56055-1.25,1.25-1.25h2.25c.41406,0,.75.33594.75.75s-.33594.75-.75.75h-2v2c0,.41406-.33594.75-.75.75Z"/>' +
    '</svg>';

  var OFFERS = [
    { title: 'Upgrade to Business', subtitle: 'Bid from 500 USD', badge: 'NEW', grade: 'AA' },
    { title: 'Extra legroom', subtitle: 'Rows 20–24', badge: '', grade: 'A' },
    { title: 'Lounge access', subtitle: 'Abu Dhabi', badge: 'HOT', grade: 'AAA' },
    { title: 'Miles accelerator', subtitle: '2× this sector', badge: '', grade: 'A' },
    { title: 'Carbon offset', subtitle: 'Optional add-on', badge: '', grade: 'AA' },
  ];

  function getFsEl() {
    return (
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement ||
      null
    );
  }

  function isEtihadIpadFs() {
    var el = getFsEl();
    return !!(el && el.id === 'etihadIpadFsMount');
  }

  function exitFs() {
    if (typeof document.exitFullscreen === 'function') return document.exitFullscreen();
    if (typeof document.webkitExitFullscreen === 'function') return document.webkitExitFullscreen();
    if (typeof document.mozCancelFullScreen === 'function') return document.mozCancelFullScreen();
    if (typeof document.msExitFullscreen === 'function') return document.msExitFullscreen();
    return Promise.resolve();
  }

  function enterFs(el) {
    if (!el) return Promise.resolve();
    if (typeof el.requestFullscreen === 'function') return el.requestFullscreen();
    if (typeof el.webkitRequestFullscreen === 'function') return el.webkitRequestFullscreen();
    if (typeof el.mozRequestFullScreen === 'function') return el.mozRequestFullScreen();
    if (typeof el.msRequestFullscreen === 'function') return el.msRequestFullscreen();
    return Promise.resolve();
  }

  function getSandboxName() {
    if (window.AepGlobalSandbox && typeof window.AepGlobalSandbox.getSandboxName === 'function') {
      return window.AepGlobalSandbox.getSandboxName() || '';
    }
    return 'apalmer';
  }

  function getSandboxParam() {
    if (window.AepGlobalSandbox && typeof window.AepGlobalSandbox.getSandboxParam === 'function') {
      return window.AepGlobalSandbox.getSandboxParam();
    }
    var n = getSandboxName();
    return n ? '&sandbox=' + encodeURIComponent(n) : '';
  }

  function setText(id, val) {
    var el = document.getElementById(id);
    if (el) el.textContent = val != null ? String(val) : '';
  }

  /** True when profile/table has no displayable value (treats em dash + “Not available” as empty). */
  function isEmptyDisplayValue(raw) {
    if (raw == null) return true;
    var s = String(raw).trim();
    if (!s) return true;
    if (s === '—') return true;
    if (/^not available$/i.test(s)) return true;
    return false;
  }

  /**
   * Central helper: real profile value → normal text; empty → dummy demo copy (never mixed).
   * @returns {{ text: string, isDummy: boolean }}
   */
  function formatFieldDisplay(raw, dummyLabel) {
    if (!isEmptyDisplayValue(raw)) {
      return { text: String(raw).trim(), isDummy: false };
    }
    return { text: String(dummyLabel != null ? dummyLabel : '—'), isDummy: true };
  }

  function setFieldDisplay(id, raw, dummyLabel) {
    var el = document.getElementById(id);
    if (!el) return;
    var fd = formatFieldDisplay(raw, dummyLabel);
    el.textContent = fd.text;
    el.classList.toggle('ga-field-dummy', fd.isDummy);
  }

  function formatScoreFieldDisplay(raw, dummyLabel) {
    if (!isEmptyDisplayValue(raw)) {
      return { text: formatScore(raw), isDummy: false };
    }
    return { text: String(dummyLabel != null ? dummyLabel : '—'), isDummy: true };
  }

  function setScoreFieldDisplay(id, raw, dummyLabel) {
    var el = document.getElementById(id);
    if (!el) return;
    var fd = formatScoreFieldDisplay(raw, dummyLabel);
    el.textContent = fd.text;
    el.classList.toggle('ga-field-dummy', fd.isDummy);
  }

  function setLoyaltyTierBadge(el, tierRaw, dummyLabel) {
    if (!el) return;
    var fd = formatFieldDisplay(tierRaw, dummyLabel != null ? dummyLabel : 'Gold Guest');
    el.textContent = fd.text;
    el.classList.remove('ga-tier--bronze', 'ga-tier--silver', 'ga-tier--gold', 'ga-tier--platinum');
    el.classList.toggle('ga-field-dummy', fd.isDummy);
    if (!fd.isDummy) {
      var slug = tierSlug(fd.text);
      if (slug) el.classList.add('ga-tier--' + slug);
    }
  }

  /** “Member · {id}” line under the profile name; dummy id only when loyalty id is missing. */
  function setProfileLoyaltySubtitle(id, memberIdRaw, dummyMemberId) {
    var el = document.getElementById(id);
    if (!el) return;
    var fd = formatFieldDisplay(memberIdRaw, dummyMemberId);
    el.textContent = fd.isDummy ? 'Member · ' + fd.text : 'Member · ' + String(memberIdRaw).trim();
    el.classList.toggle('ga-field-dummy', fd.isDummy);
  }

  function showEl(id, on) {
    var el = document.getElementById(id);
    if (el) el.hidden = !on;
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function updateClock() {
    var el = document.getElementById('ipadStatusTime');
    if (el) {
      el.textContent = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    }
  }

  function adjustColorBrightness(hex, pct) {
    var h = (hex || '2B3990').replace(/^#/, '');
    if (h.length !== 6) h = '2B3990';
    var r = parseInt(h.slice(0, 2), 16);
    var g = parseInt(h.slice(2, 4), 16);
    var b = parseInt(h.slice(4, 6), 16);
    var f = 1 + pct / 100;
    r = Math.max(0, Math.min(255, Math.round(r * f)));
    g = Math.max(0, Math.min(255, Math.round(g * f)));
    b = Math.max(0, Math.min(255, Math.round(b * f)));
    return (
      '#' +
      [r, g, b]
        .map(function (x) {
          return x.toString(16).padStart(2, '0');
        })
        .join('')
    );
  }

  function applyHeaderGradient(colourHex) {
    var hdr = document.getElementById('gaAppHeader');
    if (!hdr) return;
    if (!colourHex) {
      hdr.style.background = '';
      return;
    }
    var c = colourHex.replace(/^#/, '');
    var end = adjustColorBrightness(c, -28);
    hdr.style.background = 'linear-gradient(135deg, #' + c + ' 0%, ' + end + ' 100%)';
  }

  /** Same source as ga-agent-accent / header: RTDB `StaffPortal.Colour` (6-hex, optional #). */
  function sanitizeRtdbHex6(input) {
    var s = String(input || '')
      .trim()
      .replace(/^#/, '');
    if (!/^[0-9A-Fa-f]{6}$/.test(s)) return '';
    return '#' + s.toLowerCase();
  }

  function getStaffPortalAccentHexCss() {
    var sp = rtdbData.StaffPortal || {};
    return sanitizeRtdbHex6(sp.Colour);
  }

  function applyDetractorBannerAccentFromRtdb() {
    var b = document.getElementById('gaDetractorBanner');
    if (!b) return;
    var hex = getStaffPortalAccentHexCss();
    if (hex) {
      b.style.setProperty('--ga-detractor-accent', hex);
      b.style.setProperty('background', 'color-mix(in srgb, ' + hex + ' 12%, var(--dash-surface))');
    } else {
      b.style.removeProperty('--ga-detractor-accent');
      b.style.removeProperty('background');
    }
  }

  function hideDetractorBanner() {
    var b = document.getElementById('gaDetractorBanner');
    if (!b) return;
    b.hidden = true;
    b.style.removeProperty('--ga-detractor-accent');
    b.style.removeProperty('background');
  }

  function clearDetractorDismissSessionKeysOnNewSearch() {
    try {
      var rm = [];
      for (var i = 0; i < sessionStorage.length; i++) {
        var k = sessionStorage.key(i);
        if (k && k.indexOf(ETIHAD_IPAD_DETRACTOR_DISMISS_PREFIX) === 0) rm.push(k);
      }
      for (var j = 0; j < rm.length; j++) sessionStorage.removeItem(rm[j]);
    } catch (eD0) {}
  }

  function getPassengerDismissStorageKey(data) {
    if (!data) return ETIHAD_IPAD_DETRACTOR_DISMISS_PREFIX + 'guest';
    var rows = data.rows || [];
    var em =
      (data.profileEmail && String(data.profileEmail).trim()) ||
      rowVal(rows, 'personalEmail.address') ||
      findByPathSuffix(rows, ['identification.core.email', 'person.emailaddress.address']) ||
      '';
    if (em) return ETIHAD_IPAD_DETRACTOR_DISMISS_PREFIX + String(em).toLowerCase();
    var lid = rowVal(rows, '_demoemea.loyalty.id') || rowVal(rows, 'loyaltyIds.loyaltyId') || '';
    if (lid) return ETIHAD_IPAD_DETRACTOR_DISMISS_PREFIX + 'loyalty:' + String(lid).toLowerCase();
    return ETIHAD_IPAD_DETRACTOR_DISMISS_PREFIX + 'guest';
  }

  function dismissDetractorBannerPersisted() {
    hideDetractorBanner();
    try {
      if (currentProfileData) sessionStorage.setItem(getPassengerDismissStorageKey(currentProfileData), '1');
    } catch (eD1) {}
  }

  /** Valid NPS 0–10 only; anything else → no detractor banner (missing / wrong field). */
  function parseNpsForDetractor(raw) {
    if (raw === '' || raw == null) return null;
    var n = parseFloat(String(raw).trim().replace(/%/g, ''));
    if (!Number.isFinite(n)) return null;
    if (n >= 0 && n <= 10) return n;
    return null;
  }

  function pickLoyaltyLevelFromRows(rows, tierFallback) {
    var v =
      rowVal(rows, '_demoemea.loyaltyDetails.level') ||
      findByPathSuffix(rows, ['loyaltydetails.level', 'loyalty.tierlevel']) ||
      '';
    if (v) return String(v).trim();
    return tierFallback ? String(tierFallback).trim() : '';
  }

  function isChurnRiskElevated(raw) {
    if (raw === '' || raw == null) return false;
    var n = parseFloat(String(raw).trim().replace(/%/g, ''));
    if (!Number.isFinite(n)) return false;
    if (n >= 0 && n <= 1) return n >= 0.55;
    if (n > 1 && n <= 100) return n >= 55;
    return false;
  }

  function pickFlightReservationFragment(rows) {
    var v = findByPathKeywords(rows, ['flightreservation', 'itinerary']);
    if (v) return String(v).trim();
    v = findByPathSuffix(rows, ['travelreservations.flightreservations', 'flightreservations']);
    return v ? String(v).trim() : '';
  }

  function buildTravelPrefsSummaryForDetractor(rows, td) {
    var seat =
      (td && td.seatPreference) ||
      rowVal(rows, 'travelPreferences.seat') ||
      findByPathSuffix(rows, ['preferences.seat', 'seatpreference']) ||
      '';
    var meal =
      (td && td.mealPreference) ||
      rowVal(rows, 'travelPreferences.meal') ||
      findByPathSuffix(rows, ['preferences.meal', 'mealpreference']) ||
      '';
    var spec = rowVal(rows, 'travelPreferences.specialRequests') || '';
    var parts = [];
    if (seat) parts.push('Seat: ' + seat);
    if (meal) parts.push('Meal: ' + meal);
    if (spec && String(spec).toLowerCase() !== 'none') parts.push('Requests: ' + spec);
    if (parts.length) return parts.join(' · ');
    var fr = pickFlightReservationFragment(rows);
    if (fr) {
      var short = fr.length > 72 ? fr.slice(0, 69) + '…' : fr;
      return 'From profile: ' + short;
    }
    var travelScore = findByPathKeywords(rows, ['scoring', 'travel']);
    if (travelScore) return 'From profile: ' + String(travelScore).trim();
    return '—';
  }

  function buildDetractorOfferLine(churnHigh, loyaltyLevel, tierFromRtdb) {
    var tierLabel = String(loyaltyLevel || tierFromRtdb || '').trim();
    if (churnHigh) {
      return 'Suggested: acknowledge the journey so far, keep a calm recovery tone, invite quick feedback at the gate, and offer a discreet gesture (e.g. priority re-seating consideration) if policy allows.';
    }
    if (tierLabel && tierSlug(tierLabel)) {
      return (
        'Suggested: greet as ' +
        tierLabel.charAt(0).toUpperCase() +
        tierLabel.slice(1) +
        ' — thank them for flying Etihad and offer a brief, personal service check-in before boarding.'
      );
    }
    return 'Suggested: warm greeting using the name on screen, brief empathy for any inconvenience, and invite them to share how we can help today.';
  }

  function updateDetractorBanner(rows, data, ctx) {
    var npsNum = parseNpsForDetractor(ctx && ctx.npsRaw != null ? ctx.npsRaw : pickNpsFromRows(rows));
    var dismissKey = getPassengerDismissStorageKey(data);
    var dismissed = false;
    try {
      dismissed = sessionStorage.getItem(dismissKey) === '1';
    } catch (eD2) {}

    if (npsNum == null || npsNum >= ETIHAD_IPAD_DETRACTOR_NPS_THRESHOLD || dismissed) {
      hideDetractorBanner();
      return;
    }

    var td = rtdbData.TravelData || {};
    var cl = rtdbData.CustomerLoyalty || {};
    var churnRaw = ctx && ctx.churnRaw != null ? ctx.churnRaw : pickChurnFromRows(rows);
    var churnHigh = isChurnRiskElevated(churnRaw);
    var tierRtdb = cl.tier || rowVal(rows, '_demoemea.loyalty.tier') || '';
    var loyaltyLevel = pickLoyaltyLevelFromRows(rows, tierRtdb);
    var travelLine = buildTravelPrefsSummaryForDetractor(rows, td);

    var bodyEl = document.getElementById('gaDetractorBody');
    if (bodyEl) {
      bodyEl.textContent =
        'NPS is below ' +
        ETIHAD_IPAD_DETRACTOR_NPS_THRESHOLD +
        ' — acknowledge concerns early; keep boarding efficient and empathetic.';
    }
    var offerEl = document.getElementById('gaDetractorOffer');
    if (offerEl) offerEl.textContent = buildDetractorOfferLine(churnHigh, loyaltyLevel, tierRtdb);

    var kv = document.getElementById('gaDetractorKv');
    if (kv) {
      var npsShow = String(npsNum);
      var churnShow = formatScore(churnRaw);
      var loyaltyShow = loyaltyLevel || tierRtdb || '—';
      var tp = travelLine || '—';
      kv.innerHTML =
        '<dt>NPS score</dt><dd>' +
        escapeHtml(npsShow) +
        '</dd>' +
        '<dt>Churn prediction</dt><dd>' +
        escapeHtml(churnShow) +
        '</dd>' +
        '<dt>Loyalty level</dt><dd>' +
        escapeHtml(loyaltyShow || '—') +
        '</dd>' +
        '<dt>Travel preferences</dt><dd>' +
        escapeHtml(tp) +
        '</dd>';
    }

    var b = document.getElementById('gaDetractorBanner');
    if (b) {
      b.hidden = false;
      applyDetractorBannerAccentFromRtdb();
    }
  }

  /** Banner title: "{customer} iPad" from RTDB CoreDemoData (shortName / brand / name / airlineName). */
  function ipadHeroCustomerLabel(cd) {
    cd = cd || {};
    var i;
    var extras = [cd.shortName, cd.brand, cd.customerShortName];
    for (i = 0; i < extras.length; i++) {
      var ex = extras[i] != null ? String(extras[i]).trim() : '';
      if (ex) return ex;
    }
    var full = ((cd.name && String(cd.name).trim()) || (cd.airlineName && String(cd.airlineName).trim()) || '');
    if (!full) return 'Etihad';
    var parts = full.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0];
    var w1 = parts[0];
    var w2 = parts[1];
    if (/^(airways|airlines|air)$/i.test(w2)) return w1;
    if (parts.length === 2) return w1 + ' ' + w2;
    return w1;
  }

  function applyIpadHeroTitleFromRtdb(cd) {
    var customer = ipadHeroCustomerLabel(cd);
    var label = customer + ' iPad';
    var heroEl = document.getElementById('etihadIpadHeroTitle');
    if (heroEl) heroEl.textContent = label;
    try {
      document.title = customer + ' · iPad – AEP Profile Viewer';
    } catch (e) {
      /* ignore */
    }
  }

  function applyRtdbToShell() {
    var sp = rtdbData.StaffPortal || {};
    var cd = rtdbData.CoreDemoData || {};
    var td = rtdbData.TravelData || {};
    var mb = rtdbData.Mobile || {};

    var airlineName = cd.name || cd.airlineName || 'Etihad Airways';
    var agentName = mb.StaffName || sp.AgentName || '—';
    var agentId = mb.StaffId || sp.AgentID || '';
    var agentType = mb.StaffRole || sp.AgentType || '';
    var terminal = sp.FlightTerminalInfo || mb.Terminal || '';
    var colour = sp.Colour ? String(sp.Colour).replace(/^#/, '') : '';

    setText('gaAirlineName', airlineName);
    setText('gaAgentName', agentName);
    setText('gaAgentMeta', [agentId, agentType, terminal].filter(Boolean).join(' · ') || '—');

    var accent = document.getElementById('gaAgentAccent');
    if (accent) {
      if (colour) accent.style.borderLeft = '4px solid #' + colour;
      else accent.style.borderLeft = '';
    }

    applyHeaderGradient(colour);

    var flightNo = td.flightNumber || td.flight || '';
    var route = td.route || [td.origin, td.destination].filter(Boolean).join(' → ') || '—';
    var dep = td.departure || td.departureTime || '—';
    var status = td.flightStatus || td.status || 'Boarding';

    setText('gaFlightStripFlight', flightNo || '—');
    setText('gaFlightStripRoute', route);
    setText('gaFlightStripDep', dep);
    setText('gaFlightStripStatus', status);

    var pill = document.getElementById('gaActiveFlightPill');
    if (pill) pill.hidden = !flightNo;
    setText('gaActiveFlightText', flightNo || '—');

    setText('gafiFlight', flightNo || '—');
    setText('gafiRoute', route);
    setText('gafiDep', dep);
    setText('gafiGate', td.gate || mb.Gate || '—');
    setText('gafiPaxCount', mb.paxOnBoard != null ? String(mb.paxOnBoard) : mb.paxCount != null ? String(mb.paxCount) : '—');

    setText('gafiCaptain', sp.CaptainName || mb.CaptainName || '—');
    setText('gafiCoPilot', sp.CoPilotName || mb.CoPilotName || '—');

    var manifest = mb.CrewManifest;
    var cm = document.getElementById('gaCrewManifest');
    if (cm) {
      if (Array.isArray(manifest) && manifest.length) {
        cm.innerHTML = manifest
          .map(function (c) {
            return (
              '<div class="ga-crew-row"><span class="ga-crew-role">' +
              escapeHtml(c.role || '') +
              '</span><span>' +
              escapeHtml(c.name || '') +
              '</span></div>'
            );
          })
          .join('');
      } else {
        cm.innerHTML = '';
      }
    }

    updateFlightCountdown(td);
    setText('ipadSandboxLabel', normalizeAjoLookupSlug(getSandboxName()) || getSandboxName() || '—');

    applyIpadHeroTitleFromRtdb(cd);

    var dBanner = document.getElementById('gaDetractorBanner');
    if (dBanner && !dBanner.hidden) applyDetractorBannerAccentFromRtdb();
  }

  function updateFlightCountdown(td) {
    var el = document.getElementById('gafiCountdown');
    if (!el) return;
    var iso = td.departureIso || td.departureISO;
    if (!iso) {
      el.textContent = '—';
      return;
    }
    var t = Date.parse(iso);
    if (!t || Number.isNaN(t)) {
      el.textContent = '—';
      return;
    }
    var diff = t - Date.now();
    if (diff <= 0) {
      el.textContent = 'Departed';
      return;
    }
    var m = Math.floor(diff / 60000);
    var h = Math.floor(m / 60);
    var mm = m % 60;
    el.textContent = h > 0 ? h + 'h ' + mm + 'm' : mm + ' min';
  }

  /** RTDB slug must satisfy `database.rules.json` (lowercase a-z0-9._-); Adobe sandbox names are normalized here only for RTDB. */
  function normalizeAjoLookupSlug(raw) {
    var s = String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '');
    if (s.length < 2 || s.length > 48) return '';
    return s;
  }

  async function loadRtdbData() {
    var slug = normalizeAjoLookupSlug(getSandboxName()) || 'apalmer';
    try {
      var res = await fetch(rtdbBase + '/ajoLookups/' + encodeURIComponent(slug) + '.json');
      if (res.ok) rtdbData = (await res.json()) || {};
      else rtdbData = {};
    } catch (e) {
      rtdbData = {};
      console.warn('[etihad-ipad] RTDB fetch failed', e);
    }
    applyRtdbToShell();
    if (currentProfileData) renderAll(currentProfileData);
  }

  function rowVal(rows, path) {
    if (!rows || !Array.isArray(rows)) return '';
    var exact = rows.find(function (row) {
      var a = row.attribute || '';
      var p = row.path || '';
      return a === path || p === path;
    });
    if (exact) return exact.value != null ? String(exact.value) : '';
    var tail = path.split('.').pop();
    var r = rows.find(function (row) {
      var a = row.attribute || '';
      var p = row.path || '';
      return a.endsWith('.' + tail) || p.endsWith('.' + tail);
    });
    if (!r) return '';
    return r.value != null ? String(r.value) : '';
  }

  /** Normalised path for suffix / keyword scans (aligns with app.js + profile-generation-generic). */
  function pathLower(row) {
    return String((row && row.path) || '')
      .toLowerCase()
      .replace(/_/g, '.');
  }

  function findRowValue(rows, testFn) {
    var r = rows.find(testFn);
    if (!r || r.value == null) return '';
    var v = String(r.value).trim();
    return v || '';
  }

  function findByPathKeywords(rows, keywords) {
    var kws = keywords.map(function (k) {
      return String(k).toLowerCase();
    });
    return findRowValue(rows, function (row) {
      var p = pathLower(row);
      return kws.every(function (k) {
        return p.indexOf(k) !== -1;
      });
    });
  }

  function findByPathSuffix(rows, suffixes) {
    for (var ri = 0; ri < rows.length; ri++) {
      var row = rows[ri];
      var p = pathLower(row);
      for (var si = 0; si < suffixes.length; si++) {
        var s = String(suffixes[si]).toLowerCase();
        if (p.endsWith('.' + s) || p.endsWith(s)) {
          var v = String(row.value != null ? row.value : '').trim();
          if (v) return v;
        }
      }
    }
    return '';
  }

  function composeAddressFromRows(rows) {
    var street =
      findByPathSuffix(rows, ['street1', 'address1', 'addressline1']) ||
      findByPathKeywords(rows, ['address', 'street']);
    var city = findByPathSuffix(rows, ['city']) || findByPathKeywords(rows, ['address', 'city']);
    var state = findByPathSuffix(rows, ['state', 'stateprovince', 'region']);
    var postal = findByPathSuffix(rows, ['postalcode', 'zip', 'zipcode']);
    var country = findByPathSuffix(rows, ['country', 'countrycode']);
    var parts = [street, city, state, postal, country].filter(Boolean);
    return parts.length ? parts.join(', ') : '';
  }

  /** Phone: standard mixins, then identityMap Phone/SMS, then tenant identification.core.phoneNumber. */
  function findPhoneFromTableRows(rows) {
    var v =
      findByPathSuffix(rows, ['mobilephone.number', 'mobilephonenumber', 'homephone.number']) ||
      findByPathKeywords(rows, ['mobilephone', 'number']);
    if (v) return v;
    v = findByPathSuffix(rows, ['identification.core.phonenumber', 'core.phonenumber']);
    if (v) return v;
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var p = pathLower(row);
      if (p.indexOf('identitymap') === -1) continue;
      if (!/\.(id|xid)$/.test(p)) continue;
      if (!/phone|sms/i.test(p)) continue;
      var pv = String(row.value != null ? row.value : '').trim();
      if (pv) return pv;
    }
    return '';
  }

  function pickPreferredLanguage(rows) {
    return (
      findByPathSuffix(rows, ['preferences.preferredlanguage', 'preferredlanguage', 'person.preferredlanguage']) ||
      findByPathKeywords(rows, ['personalemail', 'language']) ||
      rowVal(rows, 'person.preferredLanguage') ||
      rowVal(rows, '_demoemea.preferences.language') ||
      ''
    );
  }

  function pickNpsFromRows(rows) {
    return (
      findByPathSuffix(rows, ['npsscore', 'scoring.nps']) ||
      findByPathKeywords(rows, ['scoring', 'nps']) ||
      rowVal(rows, '_demoemea.scoring.npsScore') ||
      rowVal(rows, '_demoemea.scoring.nps') ||
      rowVal(rows, '_demoemea.ai.nps') ||
      ''
    );
  }

  function pickChurnFromRows(rows) {
    return (
      findByPathSuffix(rows, ['churn.churnprediction', 'churnprediction', 'churnscore']) ||
      findByPathKeywords(rows, ['churn', 'prediction']) ||
      rowVal(rows, '_demoemea.scoring.churn.churnPrediction') ||
      rowVal(rows, '_demoemea.ai.churnRisk') ||
      ''
    );
  }

  /** Core propensity (0–100), tenant-agnostic path scan. */
  function pickPropensityFromRows(rows) {
    return (
      findByPathKeywords(rows, ['scoring', 'core', 'propensity']) ||
      findByPathSuffix(rows, ['scoring.core.propensityscore', 'propensityscore']) ||
      rowVal(rows, '_demoemea.scoring.core.propensityScore') ||
      rowVal(rows, '_demoemea.ai.propensity') ||
      ''
    );
  }

  /** Seat / travel upgrade propensity — schema leaf when present; no random placeholders. */
  function pickUpgradePropensityFromRows(rows) {
    return (
      findByPathSuffix(rows, [
        'scoring.travel.propensityforseatupgrade',
        'propensityforseatupgrade',
      ]) ||
      findByPathKeywords(rows, ['travel', 'propensity']) ||
      rowVal(rows, '_demoemea.scoring.travel.propensityForSeatUpgrade') ||
      rowVal(rows, '_demoemea.ai.upgradePropensity') ||
      ''
    );
  }

  function pickFlightsYtd(rows) {
    return (
      findByPathSuffix(rows, ['flightsytd', 'flightytd', 'flightcountytd']) ||
      rowVal(rows, '_demoemea.stats.flightsYtd') ||
      ''
    );
  }

  function pickLtv(rows) {
    return (
      findByPathKeywords(rows, ['lifetime', 'value']) ||
      findByPathSuffix(rows, ['orderprofile.lifetimevalue', 'lifetimevalue', 'customerlifetimevalue']) ||
      findByPathKeywords(rows, ['commerce', 'lifetime']) ||
      rowVal(rows, '_demoemea.stats.ltv') ||
      rowVal(rows, '_demoemea.orderProfile.lifetimeValue') ||
      ''
    );
  }

  function resolveNamespace(identifier) {
    var v = String(identifier || '').trim();
    if (!v) return 'email';
    if (v.indexOf('@') !== -1) return 'email';
    return 'loyaltyId';
  }

  function readRecentEmailsFromStorage() {
    try {
      var raw = localStorage.getItem(ETIHAD_IPAD_RECENT_EMAILS_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      var out = [];
      for (var i = 0; i < parsed.length; i++) {
        var s = typeof parsed[i] === 'string' ? parsed[i].trim() : '';
        if (s && resolveNamespace(s) === 'email') out.push(s);
      }
      return out;
    } catch (eRe0) {
      return [];
    }
  }

  function writeRecentEmailsToStorage(list) {
    try {
      localStorage.setItem(ETIHAD_IPAD_RECENT_EMAILS_KEY, JSON.stringify(list));
    } catch (eRe1) {}
  }

  /** Rebuild datalist + hint from storage (call after writes and on load). */
  function refreshRecentEmailDatalistUi() {
    var emails = readRecentEmailsFromStorage();
    var dl = document.getElementById('etihadIpadRecentEmailList');
    if (dl) {
      dl.innerHTML = '';
      for (var i = 0; i < emails.length; i++) {
        var opt = document.createElement('option');
        opt.value = emails[i];
        dl.appendChild(opt);
      }
    }
    var hint = document.getElementById('etihadIpadRecentEmailHint');
    if (hint) hint.hidden = emails.length === 0;
  }

  /**
   * After a successful profile table load, remember the typed query if it was an email search.
   * Prunes to ETIHAD_IPAD_RECENT_EMAILS_MAX distinct addresses (case-insensitive); newest first.
   */
  function rememberRecentEmailAfterSuccessfulLookup(typedQuery) {
    var trimmed = String(typedQuery || '').trim();
    if (!trimmed || resolveNamespace(trimmed) !== 'email') return;
    var lower = trimmed.toLowerCase();
    var prev = readRecentEmailsFromStorage();
    var next = [trimmed];
    for (var i = 0; i < prev.length; i++) {
      if (prev[i].toLowerCase() === lower) continue;
      next.push(prev[i]);
      if (next.length >= ETIHAD_IPAD_RECENT_EMAILS_MAX) break;
    }
    writeRecentEmailsToStorage(next);
    refreshRecentEmailDatalistUi();
  }

  async function lookupProfile(identifier) {
    var ns = resolveNamespace(identifier);
    var url =
      '/api/profile/table?identifier=' +
      encodeURIComponent(identifier) +
      '&namespace=' +
      encodeURIComponent(ns) +
      getSandboxParam();
    var res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  function ipadEventPayloadBase() {
    var sp = rtdbData.StaffPortal || {};
    var td = rtdbData.TravelData || {};
    return {
      flightNumber: td.flightNumber || td.flight || '',
      agentId: sp.AgentID || '',
    };
  }

  function resolveIpadEventEmail() {
    if (currentPassengerEmail) return currentPassengerEmail;
    var ga = document.getElementById('gaEmail');
    if (ga && ga.classList.contains('ga-field-dummy')) return 'broadcast@etihad.com';
    var t = ga && ga.textContent ? String(ga.textContent).trim() : '';
    if (t && t !== '—') return t;
    return 'broadcast@etihad.com';
  }

  async function sendIpadEvent(eventType, extra) {
    var sandbox = getSandboxName() || 'apalmer';
    var email = resolveIpadEventEmail();
    var payload = Object.assign({}, ipadEventPayloadBase(), { ts: new Date().toISOString() }, extra || {});
    var res = await fetch('/api/ipad/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sandbox: sandbox,
        email: email,
        eventType: eventType,
        payload: payload,
      }),
    });
    var j = await res.json().catch(function () {
      return {};
    });
    if (!res.ok) throw new Error((j && j.error) || 'HTTP ' + res.status);
    return j;
  }

  function tierSlug(tier) {
    var t = String(tier || '')
      .toLowerCase()
      .trim();
    if (t.indexOf('platinum') !== -1) return 'platinum';
    if (t.indexOf('gold') !== -1) return 'gold';
    if (t.indexOf('silver') !== -1) return 'silver';
    if (t.indexOf('bronze') !== -1) return 'bronze';
    return '';
  }

  function setTierBadge(el, tierRaw) {
    setLoyaltyTierBadge(el, tierRaw, 'Gold Guest');
  }

  function formatScore(v) {
    if (v === '' || v == null) return '—';
    var n = Number(v);
    if (!Number.isNaN(n) && String(v).trim() !== '') {
      if (n <= 1 && n >= 0) return Math.round(n * 100) + '%';
      return String(v);
    }
    return String(v);
  }

  function renderOffersGrid() {
    var grid = document.getElementById('gaOffersGrid');
    if (!grid) return;
    grid.innerHTML = OFFERS.map(function (o) {
      var badge =
        o.badge && o.badge.trim()
          ? '<span class="ga-offer-badge">' + escapeHtml(o.badge) + '</span>'
          : '';
      return (
        '<div class="ga-offer-card">' +
        badge +
        '<p class="ga-offer-card-title">' +
        escapeHtml(o.title) +
        '</p>' +
        '<p class="ga-offer-card-sub">' +
        escapeHtml(o.subtitle) +
        '</p></div>'
      );
    }).join('');
  }

  function rangeRows(from, to) {
    var a = [];
    for (var r = from; r <= to; r++) a.push(r);
    return a;
  }

  var A380_CABINS = [
    {
      cls: 'cabin-first',
      title: 'First Class',
      rowNums: rangeRows(1, 3),
      left: ['A', 'C'],
      right: ['H', 'K'],
      occ: 0.42,
      prem: true,
    },
    {
      cls: 'cabin-business',
      title: 'Business Class',
      rowNums: rangeRows(11, 20),
      left: ['A', 'B', 'C', 'D'],
      right: ['E', 'F', 'G', 'H'],
      occ: 0.38,
      prem: true,
    },
    {
      cls: 'cabin-premium',
      title: 'Premium Economy',
      rowNums: rangeRows(35, 38),
      left: ['A', 'B', 'C'],
      right: ['H', 'J', 'K'],
      occ: 0.32,
      prem: true,
    },
    {
      cls: 'cabin-economy',
      title: 'Economy',
      rowNums: rangeRows(45, 56),
      left: ['A', 'B', 'C'],
      right: ['H', 'J', 'K'],
      occ: 0.52,
      prem: false,
    },
  ];

  function seatHash(code) {
    var h = 0;
    var s = String(code);
    for (var i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  function seatOccupiedForCabin(seatCode, occ) {
    return (seatHash(seatCode) % 1000) / 1000 < occ;
  }

  function restoreBoardingSeatClass(btn) {
    var occ = parseFloat(btn.getAttribute('data-occ') || '0.5');
    var prem = btn.getAttribute('data-prem') === '1';
    var seat = btn.getAttribute('data-seat') || '';
    var occupied = seatOccupiedForCabin(seat, occ);
    btn.classList.remove('ga-seat--selected', 'ga-seat--available', 'ga-seat--premium', 'ga-seat--occupied');
    btn.classList.add(occupied ? 'ga-seat--occupied' : prem ? 'ga-seat--premium' : 'ga-seat--available');
  }

  function buildSeatMap() {
    var root = document.getElementById('gaSeatMap');
    if (!root) return;
    boardingSelectedSeat = '';
    var selInfo = document.getElementById('gaSelectedInfo');
    var assign = document.getElementById('btnAssignSeat');
    if (selInfo) selInfo.hidden = true;
    if (assign) assign.disabled = true;

    var html = '';
    A380_CABINS.forEach(function (cab) {
      html += '<div class="cabin-section ' + cab.cls + '"><h4>' + escapeHtml(cab.title) + '</h4>';
      cab.rowNums.forEach(function (rowNum) {
        html += '<div class="ga-seat-row"><span class="ga-seat-row-num">' + rowNum + '</span>';
        cab.left.forEach(function (col) {
          var code = rowNum + col;
          var occ = cab.occ;
          var prem = cab.prem;
          var occupied = seatOccupiedForCabin(code, occ);
          var cls = occupied ? 'ga-seat--occupied' : prem ? 'ga-seat--premium' : 'ga-seat--available';
          html +=
            '<button type="button" class="ga-seat ' +
            cls +
            '" data-seat="' +
            code +
            '" data-occ="' +
            occ +
            '" data-prem="' +
            (prem ? '1' : '0') +
            '" aria-label="Seat ' +
            code +
            '"></button>';
        });
        html += '<span class="ga-seat-aisle"></span>';
        cab.right.forEach(function (col) {
          var code = rowNum + col;
          var occ = cab.occ;
          var prem = cab.prem;
          var occupied = seatOccupiedForCabin(code, occ);
          var cls = occupied ? 'ga-seat--occupied' : prem ? 'ga-seat--premium' : 'ga-seat--available';
          html +=
            '<button type="button" class="ga-seat ' +
            cls +
            '" data-seat="' +
            code +
            '" data-occ="' +
            occ +
            '" data-prem="' +
            (prem ? '1' : '0') +
            '" aria-label="Seat ' +
            code +
            '"></button>';
        });
        html += '</div>';
      });
      html += '</div>';
    });
    root.innerHTML = html;
  }

  function onGaSeatMapClick(e) {
    var btn = e.target && e.target.closest ? e.target.closest('.ga-seat--available, .ga-seat--premium') : null;
    if (!btn) return;
    var root = document.getElementById('gaSeatMap');
    if (!root) return;
    root.querySelectorAll('.ga-seat--selected').forEach(function (s) {
      s.classList.remove('ga-seat--selected');
      restoreBoardingSeatClass(s);
    });
    btn.classList.add('ga-seat--selected');
    btn.classList.remove('ga-seat--available', 'ga-seat--premium');
    boardingSelectedSeat = btn.getAttribute('data-seat') || '';
    var selInfo = document.getElementById('gaSelectedInfo');
    var assign = document.getElementById('btnAssignSeat');
    if (selInfo) selInfo.hidden = !boardingSelectedSeat;
    setText('gaSelectedSeat', boardingSelectedSeat || '—');
    if (assign) assign.disabled = !boardingSelectedSeat;
  }

  function activateTab(name) {
    document.querySelectorAll('.ga-tab').forEach(function (t) {
      t.classList.toggle('ga-tab--active', t.getAttribute('data-tab') === name);
    });
    var cap = name.charAt(0).toUpperCase() + name.slice(1);
    var pid = 'tab' + cap;
    document.querySelectorAll('.ga-tab-panel').forEach(function (p) {
      var on = p.id === pid;
      p.hidden = !on;
      p.classList.toggle('ga-tab-panel--active', on);
    });
    if (name === 'boarding') buildSeatMap();
  }

  function renderAll(data) {
    currentProfileData = data;
    var rows = data.rows || [];
    var td = rtdbData.TravelData || {};
    var cl = rtdbData.CustomerLoyalty || {};

    var first = rowVal(rows, 'person.name.firstName');
    var last = rowVal(rows, 'person.name.lastName');
    var fullNameRaw = (first + ' ' + last).trim();
    var fullNameFd = formatFieldDisplay(fullNameRaw, 'Guest Traveller');
    var fullNameForPhotoAlt = fullNameFd.isDummy ? 'Guest' : fullNameFd.text;

    var emailRaw =
      (data.profileEmail && String(data.profileEmail).trim()) ||
      rowVal(rows, 'personalEmail.address') ||
      findByPathSuffix(rows, ['identification.core.email', 'person.emailaddress.address']) ||
      '';
    var phoneRaw = findPhoneFromTableRows(rows) || rowVal(rows, 'mobilePhone.number') || '';
    var genderRaw = rowVal(rows, 'person.gender') || '';
    var dobRaw = rowVal(rows, 'person.birthDate') || rowVal(rows, 'person.birthDayAndMonth') || '';
    var nationalityRaw = rowVal(rows, 'person.nationality') || '';
    var addrRaw =
      composeAddressFromRows(rows) ||
      [rowVal(rows, 'homeAddress.street1'), rowVal(rows, 'homeAddress.city')].filter(Boolean).join(', ') ||
      rowVal(rows, 'homeAddress.city') ||
      findByPathSuffix(rows, ['homeaddress.city', 'address.city']) ||
      '';
    var langRaw = pickPreferredLanguage(rows) || '';

    var npsRaw = pickNpsFromRows(rows);
    var churnRaw = pickChurnFromRows(rows);
    var propensityRaw = pickPropensityFromRows(rows);
    var upgradeRaw = pickUpgradePropensityFromRows(rows);
    var flightsYtdRaw = pickFlightsYtd(rows);
    var ltvRaw = pickLtv(rows);

    currentPassengerEmail = String(emailRaw || '').trim();

    var tierRaw = cl.tier || rowVal(rows, '_demoemea.loyalty.tier') || '';
    var milesRaw =
      (cl.miles != null && String(cl.miles).trim() !== '' ? String(cl.miles) : '') ||
      (cl.balance != null && String(cl.balance).trim() !== '' ? String(cl.balance) : '') ||
      rowVal(rows, '_demoemea.loyalty.miles') ||
      '';
    var loyaltyIdRaw = rowVal(rows, '_demoemea.loyalty.id') || rowVal(rows, 'loyaltyIds.loyaltyId') || '';
    var programRaw = rowVal(rows, '_demoemea.loyalty.program') || '';

    var flightRaw =
      (td.flightNumber && String(td.flightNumber).trim()) ||
      (td.flight && String(td.flight).trim()) ||
      rowVal(rows, '_demoemea.booking.flight') ||
      '';
    var routeRaw = (td.route && String(td.route).trim()) || rowVal(rows, '_demoemea.booking.route') || '';
    var cabinRaw = (td.cabin && String(td.cabin).trim()) || rowVal(rows, '_demoemea.booking.class') || '';
    var flightDateRaw = (td.flightDate && String(td.flightDate).trim()) || '';
    var passengersRaw =
      (td.passengers != null && String(td.passengers).trim() !== '' ? String(td.passengers) : '') ||
      rowVal(rows, '_demoemea.booking.pax') ||
      '';
    var bookingRefRaw = (td.bookingRef && String(td.bookingRef).trim()) || (td.bookingReference && String(td.bookingReference).trim()) || '';
    var seatRaw = (td.seat && String(td.seat).trim()) || rowVal(rows, '_demoemea.booking.seat') || '';
    var gateRaw = (td.gate && String(td.gate).trim()) || '';
    var boardingRaw = (td.boardingTime && String(td.boardingTime).trim()) || '';
    var baggageRaw = (td.baggage && String(td.baggage).trim()) || rowVal(rows, '_demoemea.booking.baggage') || '';
    var checkInRaw = (td.checkInStatus && String(td.checkInStatus).trim()) || '';
    var seatPrefRaw = (td.seatPreference && String(td.seatPreference).trim()) || rowVal(rows, 'travelPreferences.seat') || '';
    var mealPrefRaw = (td.mealPreference && String(td.mealPreference).trim()) || rowVal(rows, 'travelPreferences.meal') || '';
    var specialReqsRaw = rowVal(rows, 'travelPreferences.specialRequests') || '';

    var memberSinceRaw =
      (cl.memberSince != null && String(cl.memberSince).trim() !== '' ? String(cl.memberSince) : '') ||
      rowVal(rows, '_demoemea.loyalty.memberSince') ||
      '';
    var nextTierRaw =
      (cl.nextTier != null && String(cl.nextTier).trim() !== '' ? String(cl.nextTier) : '') ||
      rowVal(rows, '_demoemea.loyalty.nextTier') ||
      '';
    var milesNeededRaw =
      (cl.milesToNext != null && String(cl.milesToNext).trim() !== '' ? String(cl.milesToNext) : '') ||
      rowVal(rows, '_demoemea.loyalty.milesNeeded') ||
      '';

    var prefChannelRaw = rowVal(rows, '_demoemea.preferences.channel') || '';

    setFieldDisplay('gaProfileFullName', fullNameRaw, 'Guest Traveller');
    setProfileLoyaltySubtitle('gaProfileLoyaltyId', loyaltyIdRaw, 'EY00000000');
    setTierBadge(document.getElementById('gaLoyaltyTierBadge'), tierRaw);
    setTierBadge(document.getElementById('gaLoyaltyTierInline'), tierRaw);

    var gIcon = document.getElementById('gaGenderIcon');
    if (gIcon) {
      if (!isEmptyDisplayValue(genderRaw)) {
        var gl = String(genderRaw).toLowerCase();
        gIcon.textContent = gl.indexOf('f') === 0 ? '👩' : gl.indexOf('m') === 0 ? '👨' : '👤';
      } else {
        gIcon.textContent = '👤';
      }
    }

    var img = document.getElementById('gaProfilePhoto');
    var photoUrl = rowVal(rows, 'personImage.url') || rowVal(rows, '_demoemea.profile.photoUrl') || '';
    if (img) {
      if (photoUrl && photoUrl.indexOf('http') === 0) {
        img.src = photoUrl;
        img.style.display = '';
        img.alt = fullNameForPhotoAlt;
      } else {
        img.removeAttribute('src');
        img.style.display = 'none';
        img.alt = '';
      }
    }

    setFieldDisplay('gaFullName', fullNameRaw, 'Guest Traveller');
    setFieldDisplay('gaGender', genderRaw, 'Prefer not to say');
    setFieldDisplay('gaDOB', dobRaw, '15 JAN 1990');
    setFieldDisplay('gaAge', rowVal(rows, 'person.age'), '42');
    setFieldDisplay('gaNationality', nationalityRaw, 'United Kingdom (GB)');
    setFieldDisplay('gaEmail', emailRaw, 'guest.demo@example.com');
    setFieldDisplay('gaPhone', phoneRaw, '+971 00 000 0000');
    setFieldDisplay('gaAddress', addrRaw, '123 Demo Street, London (LHR), SW1A 1AA');
    setFieldDisplay('gaLanguage', langRaw, 'English (UK)');

    setFieldDisplay('gaFlight', flightRaw, 'EY 200');
    setFieldDisplay('gaRoute', routeRaw, 'AUH → LHR');
    setFieldDisplay('gaFlightClass', cabinRaw, 'Business');
    setFieldDisplay('gaFlightDate', flightDateRaw, '15 May 2026');
    setFieldDisplay('gaPassengers', passengersRaw, '2');
    setFieldDisplay('gaBookingRef', bookingRefRaw, 'EYDEM000');
    setFieldDisplay('gaSeat', seatRaw, '14A');
    setFieldDisplay('gaGate', gateRaw, 'C12');
    setFieldDisplay('gaBoardingTime', boardingRaw, '08:40');
    setFieldDisplay('gaBaggage', baggageRaw, '23 kg (1 bag)');
    setFieldDisplay('gaCheckIn', checkInRaw, 'Online — complete');
    setFieldDisplay('gaSeatPref', seatPrefRaw, 'Window');
    setFieldDisplay('gaMealPref', mealPrefRaw, 'Vegetarian');
    setFieldDisplay('gaSpecialReqs', specialReqsRaw, 'No special requests logged');

    setFieldDisplay('gaLoyaltyProgram', programRaw, 'Etihad Guest');
    setFieldDisplay('gaLoyaltyID', loyaltyIdRaw, 'EY00000000');
    setFieldDisplay('gaMiles', milesRaw, '480,000');
    setFieldDisplay('gaMemberSince', memberSinceRaw, '2017');
    setFieldDisplay('gaNextTier', nextTierRaw, 'Platinum');
    setFieldDisplay('gaMilesNeeded', milesNeededRaw, '12,500');
    setFieldDisplay('gaOrdersYTD', flightsYtdRaw, '3 flights YTD');
    setFieldDisplay('gaLTV', ltvRaw, 'AED 120,000');
    setScoreFieldDisplay('gaNPS', npsRaw, '8');
    setScoreFieldDisplay('gaChurn', churnRaw, '18%');
    setScoreFieldDisplay('gaUpgrade', upgradeRaw, '62%');

    setScoreFieldDisplay('gaChurnPref', churnRaw, '18%');
    setScoreFieldDisplay('gaPropensityPref', propensityRaw, '74%');
    setScoreFieldDisplay('gaNPSPref', npsRaw, '8');
    setScoreFieldDisplay('gaUpgradePref', upgradeRaw, '62%');
    setFieldDisplay('gaPrefChannel', prefChannelRaw, 'Email');
    setFieldDisplay('gaPrefLang', langRaw, 'English (UK)');

    setFieldDisplay('gbsFlight', flightRaw, 'EY 200');
    setFieldDisplay('gbsRoute', routeRaw, 'AUH → LHR');
    setFieldDisplay('gbsPassenger', fullNameRaw, 'Guest Traveller');

    var raw = document.getElementById('gaRawJson');
    if (raw) {
      try {
        raw.textContent = JSON.stringify(data, null, 2);
      } catch (e) {
        raw.textContent = String(data);
      }
    }

    renderOffersGrid();

    showEl('gaProfileHeader', true);
    showEl('gaTabs', true);
    showEl('gaTabPanels', true);
    showEl('gaActions', true);
    showEl('gaViewToggle', true);

    updateDetractorBanner(rows, data, { npsRaw: npsRaw, churnRaw: churnRaw });

    var btnBoard = document.getElementById('btnProcessBoarding');
    if (btnBoard) btnBoard.disabled = false;

    activateTab('personal');
  }

  var toastTimer;
  function showToast(msg) {
    var el = document.getElementById('gaToast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('ga-toast--visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove('ga-toast--visible');
    }, 3200);
  }

  var bezelEl = document.getElementById('ipadBezel');
  var scalerEl = document.getElementById('ipadBezelScaler');
  var scalerWrap = document.getElementById('ipadBezelScalerWrap');

  function effectiveScale(base) {
    var b = typeof base === 'number' ? base : 0.75;
    if (typeof window.innerWidth === 'number' && window.innerWidth <= 1400) {
      return b * 0.9;
    }
    return b;
  }

  function applySize(size) {
    currentSizeKey = size || '11';
    var cfg = SIZE_MAP[currentSizeKey] || SIZE_MAP['11'];
    var vpW = cfg.vpW;
    var vpH = cfg.vpH;
    if (isLandscape) {
      var t = vpW;
      vpW = vpH;
      vpH = t;
    }
    var scale = effectiveScale(cfg.baseScale);
    if (isEtihadIpadFs()) {
      scale = Math.min(1, scale * 1.12);
    }
    if (scalerEl) scalerEl.style.setProperty('--ipad-scale', String(scale));
    if (bezelEl) {
      bezelEl.style.setProperty('--device-vp-w', vpW + 'px');
      bezelEl.style.setProperty('--device-vp-h', vpH + 'px');
    }
    if (scalerWrap) {
      scalerWrap.style.setProperty('--ipad-wrap-w', cfg.wrapW + 'px');
      scalerWrap.style.setProperty('--ipad-outer-h', cfg.outerH + 'px');
      scalerWrap.style.setProperty('--ipad-scale', String(scale));
    }
    document.querySelectorAll('[data-ipad-size]').forEach(function (b) {
      b.classList.toggle('ipad-ctrl-btn--active', b.getAttribute('data-ipad-size') === currentSizeKey);
    });
    try {
      sessionStorage.setItem(SIZE_STORE_KEY, currentSizeKey);
    } catch (e1) {}
  }

  function syncOrientButtons() {
    document.querySelectorAll('[data-ipad-orient]').forEach(function (b) {
      var land = b.getAttribute('data-ipad-orient') === 'landscape';
      var active = land === isLandscape;
      b.classList.toggle('ipad-ctrl-btn--active', active);
      b.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    try {
      sessionStorage.setItem(ORIENT_STORE_KEY, isLandscape ? 'landscape' : 'portrait');
    } catch (e2) {}
  }

  function applyBezelColour(colour) {
    if (!bezelEl) return;
    ['space-black', 'silver', 'natural-titanium', 'blue-titanium'].forEach(function (c) {
      bezelEl.classList.remove('ipad-bezel--' + c);
    });
    bezelEl.classList.add('ipad-bezel--' + colour);
    document.querySelectorAll('[data-ipad-colour]').forEach(function (s) {
      var active = s.getAttribute('data-ipad-colour') === colour;
      s.classList.toggle('ipad-colour-swatch--active', active);
      s.setAttribute('aria-checked', active ? 'true' : 'false');
    });
    try {
      sessionStorage.setItem(COLOUR_STORE_KEY, colour);
    } catch (e3) {}
  }

  function syncEtihadIpadFsButton() {
    var fsBtn = document.getElementById('etihadIpadFullscreenBtn');
    var fsExitFloat = document.getElementById('etihadIpadFsExitFloat');
    var active = isEtihadIpadFs();
    if (fsBtn) {
      fsBtn.innerHTML = active ? FS_LOGO_EXIT : FS_LOGO_ENTER;
      fsBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
      var label = active ? 'Exit full screen' : 'Enter full screen';
      fsBtn.setAttribute('aria-label', label);
      fsBtn.setAttribute(
        'title',
        active
          ? 'Return to the dashboard layout. Press Esc to exit.'
          : 'Fill the screen with the iPad preview. Press Esc to exit.'
      );
    }
    if (fsExitFloat) fsExitFloat.hidden = !active;
    try {
      document.body.classList.toggle('etihad-ipad-page--fs', active);
    } catch (eFs) {}
    applySize(currentSizeKey);
  }

  function initEtihadIpadFullscreen() {
    var fsRoot = document.getElementById('etihadIpadFsMount');
    var fsBtn = document.getElementById('etihadIpadFullscreenBtn');
    var fsExitFloat = document.getElementById('etihadIpadFsExitFloat');
    if (!fsRoot || !fsBtn) return;
    syncEtihadIpadFsButton();
    fsBtn.addEventListener('click', function () {
      if (isEtihadIpadFs()) {
        exitFs().catch(function () {});
      } else {
        enterFs(fsRoot).catch(function () {});
      }
    });
    if (fsExitFloat) {
      fsExitFloat.addEventListener('click', function () {
        exitFs().catch(function () {});
      });
    }
    ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'].forEach(function (ev) {
      document.addEventListener(ev, syncEtihadIpadFsButton);
    });
  }

  function setStaffDataView(mode) {
    var staff = document.getElementById('gaStaffView');
    var data = document.getElementById('gaDataView');
    var isData = mode === 'data';
    if (staff) staff.hidden = isData;
    if (data) data.hidden = !isData;
    document.querySelectorAll('.ga-view-btn').forEach(function (b) {
      b.classList.toggle('ga-view-btn--active', b.getAttribute('data-view') === mode);
    });
  }

  function setLoading(on) {
    var btn = document.querySelector('.ga-search-btn');
    if (btn) {
      btn.disabled = !!on;
      btn.textContent = on ? 'Looking up…' : 'Search';
    }
    if (on) {
      currentPassengerEmail = '';
      currentProfileData = null;
      hideDetractorBanner();
      showEl('gaProfileHeader', false);
      showEl('gaTabs', false);
      showEl('gaTabPanels', false);
      showEl('gaActions', false);
      showEl('gaViewToggle', false);
      showEl('gaDataView', false);
      setStaffDataView('staff');
      var err = document.getElementById('gaSearchError');
      if (err) {
        err.hidden = true;
        err.textContent = '';
      }
    }
  }

  function showError(msg) {
    var err = document.getElementById('gaSearchError');
    if (!err) return;
    err.textContent = msg;
    err.hidden = false;
    setTimeout(function () {
      err.hidden = true;
    }, 5000);
  }

  function wireEvents() {
    var form = document.getElementById('gaSearchForm');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var input = document.getElementById('gaSearchInput');
        var val = input && input.value ? String(input.value).trim() : '';
        if (!val) return;
        clearDetractorDismissSessionKeysOnNewSearch();
        setLoading(true);
        lookupProfile(val)
          .then(function (data) {
            if (!data || !data.found) {
              showError('Profile not found');
              return;
            }
            renderAll(data);
            rememberRecentEmailAfterSuccessfulLookup(val);
          })
          .catch(function (err) {
            showError('Lookup failed: ' + (err && err.message ? err.message : String(err)));
          })
          .finally(function () {
            setLoading(false);
          });
      });
    }

    var btnFlightToggle = document.getElementById('btnFlightInfoToggle');
    if (btnFlightToggle) {
      btnFlightToggle.addEventListener('click', function () {
        var p = document.getElementById('gaFlightInfoPanel');
        if (!p) return;
        p.hidden = !p.hidden;
        btnFlightToggle.textContent = p.hidden ? 'Flight Info ▾' : 'Flight Info ▴';
      });
    }

    var flightPanel = document.getElementById('gaFlightInfoPanel');
    if (flightPanel) {
      flightPanel.addEventListener('click', function (e) {
        var b = e.target && e.target.closest ? e.target.closest('.ga-broadcast-btn') : null;
        if (!b || b.disabled) return;
        var evType = b.getAttribute('data-event');
        if (!evType) return;
        sendIpadEvent(evType, { broadcast: true })
          .then(function () {
            showToast('Broadcast sent');
            b.classList.add('ga-broadcast-btn--sent');
          })
          .catch(function (err) {
            showToast('Event failed: ' + (err && err.message ? err.message : String(err)));
          });
      });
    }

    var tabs = document.getElementById('gaTabs');
    if (tabs) {
      tabs.addEventListener('click', function (e) {
        var t = e.target && e.target.closest ? e.target.closest('.ga-tab') : null;
        if (!t) return;
        var name = t.getAttribute('data-tab');
        if (name) activateTab(name);
      });
    }

    document.querySelectorAll('.ga-view-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        var v = b.getAttribute('data-view') || 'staff';
        setStaffDataView(v);
      });
    });

    var btnCopy = document.getElementById('btnCopyJson');
    if (btnCopy) {
      btnCopy.addEventListener('click', function () {
        var raw = document.getElementById('gaRawJson');
        var txt = raw && raw.textContent ? raw.textContent : '';
        if (!txt) {
          showToast('Nothing to copy');
          return;
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(txt).then(
            function () {
              showToast('JSON copied');
            },
            function () {
              showToast('Copy failed');
            }
          );
        } else {
          showToast('Clipboard not available');
        }
      });
    }

    var btnBoard = document.getElementById('btnProcessBoarding');
    if (btnBoard) {
      btnBoard.addEventListener('click', function () {
        var n = document.getElementById('gaProfileFullName');
        var name = n && n.textContent ? n.textContent : 'passenger';
        sendIpadEvent('flight.staff.boarding.process', { passengerName: name })
          .then(function () {
            showToast('Boarding processed for ' + name);
            btnBoard.disabled = true;
          })
          .catch(function (err) {
            showToast('Event failed: ' + (err && err.message ? err.message : String(err)));
          });
      });
    }

    var btnUp = document.getElementById('btnOfferUpgrade');
    if (btnUp) {
      btnUp.addEventListener('click', function () {
        activateTab('offers');
        showToast('Offers tab');
      });
    }

    var btnBag = document.getElementById('btnManageBaggage');
    if (btnBag) {
      btnBag.addEventListener('click', function () {
        sendIpadEvent('flight.staff.baggage.open', {})
          .then(function () {
            showToast('Baggage management screen opened');
          })
          .catch(function (err) {
            showToast('Event failed: ' + (err && err.message ? err.message : String(err)));
          });
      });
    }

    var btnAssign = document.getElementById('btnAssignSeat');
    if (btnAssign) {
      btnAssign.addEventListener('click', function () {
        if (!boardingSelectedSeat) return;
        sendIpadEvent('flight.staff.seat.selection', { seatNumber: boardingSelectedSeat, seat: boardingSelectedSeat })
          .then(function () {
            showToast('Seat ' + boardingSelectedSeat + ' assigned and event sent to AEP');
            boardingSelectedSeat = '';
            buildSeatMap();
          })
          .catch(function (err) {
            showToast('Seat event failed: ' + (err && err.message ? err.message : String(err)));
          });
      });
    }

    var btnDetClose = document.getElementById('gaDetractorClose');
    var btnDetCloseX = document.getElementById('gaDetractorCloseX');
    if (btnDetClose) btnDetClose.addEventListener('click', dismissDetractorBannerPersisted);
    if (btnDetCloseX) btnDetCloseX.addEventListener('click', dismissDetractorBannerPersisted);

    var seatMap = document.getElementById('gaSeatMap');
    if (seatMap) seatMap.addEventListener('click', onGaSeatMapClick);

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (isEtihadIpadFs()) exitFs().catch(function () {});
    });

    document.querySelectorAll('[data-ipad-colour]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        applyBezelColour(btn.getAttribute('data-ipad-colour') || 'space-black');
      });
    });
    document.querySelectorAll('[data-ipad-size]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        applySize(btn.getAttribute('data-ipad-size') || '11');
      });
    });

    document.querySelectorAll('[data-ipad-orient]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        isLandscape = btn.getAttribute('data-ipad-orient') === 'landscape';
        syncOrientButtons();
        applySize(currentSizeKey);
      });
    });

    window.addEventListener('aep-global-sandbox-change', function () {
      loadRtdbData();
    });
    window.addEventListener('resize', function () {
      applySize(currentSizeKey);
    });

    initEtihadIpadFullscreen();
  }

  updateClock();
  setInterval(updateClock, 1000);
  setInterval(function () {
    updateFlightCountdown(rtdbData.TravelData || {});
  }, 30000);

  var savedColour = null;
  var savedSize = null;
  var savedOrient = null;
  try {
    savedColour = sessionStorage.getItem(COLOUR_STORE_KEY);
  } catch (e4) {}
  try {
    savedSize = sessionStorage.getItem(SIZE_STORE_KEY);
  } catch (e5) {}
  try {
    savedOrient = sessionStorage.getItem(ORIENT_STORE_KEY);
  } catch (e6) {}

  isLandscape = savedOrient === 'landscape';
  applyBezelColour(savedColour || 'space-black');
  applySize(savedSize || '11');
  syncOrientButtons();
  wireEvents();
  refreshRecentEmailDatalistUi();
  loadRtdbData();
})();
