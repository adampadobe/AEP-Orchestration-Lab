/**
 * Etihad iPad gate-agent lab: RTDB ajoLookups/{sandbox} + GET /api/profile/table + POST /api/ipad/event.
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
    setText('ipadSandboxLabel', getSandboxName() || '—');
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

  async function loadRtdbData() {
    var slug = getSandboxName() || 'apalmer';
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
    var tail = path.split('.').pop();
    var r = rows.find(function (row) {
      var a = row.attribute || '';
      var p = row.path || '';
      return a === path || p === path || a.endsWith('.' + tail) || p.endsWith('.' + tail);
    });
    if (!r) return '';
    return r.value != null ? String(r.value) : '';
  }

  function resolveNamespace(identifier) {
    var v = String(identifier || '').trim();
    if (!v) return 'email';
    if (v.indexOf('@') !== -1) return 'email';
    return 'loyaltyId';
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
    if (!el) return;
    var label = tierRaw && String(tierRaw).trim() ? String(tierRaw).trim() : 'Member';
    el.textContent = label;
    el.classList.remove('ga-tier--bronze', 'ga-tier--silver', 'ga-tier--gold', 'ga-tier--platinum');
    var slug = tierSlug(label);
    if (slug) el.classList.add('ga-tier--' + slug);
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
    var fullName = (first + ' ' + last).trim() || '—';

    var email = data.profileEmail || rowVal(rows, 'personalEmail.address') || '—';
    var phone = rowVal(rows, 'mobilePhone.number') || '—';
    var gender = rowVal(rows, 'person.gender') || '';
    var dob = rowVal(rows, 'person.birthDate') || rowVal(rows, 'person.birthDayAndMonth') || '';
    var nationality = rowVal(rows, 'person.nationality') || '—';
    var addr = [rowVal(rows, 'homeAddress.street1'), rowVal(rows, 'homeAddress.city')]
      .filter(Boolean)
      .join(', ') || '—';
    var lang = rowVal(rows, 'person.preferredLanguage') || rowVal(rows, '_demoemea.preferences.language') || '—';

    currentPassengerEmail = (data.profileEmail || rowVal(rows, 'personalEmail.address') || '').trim() || '';

    var tier = cl.tier || rowVal(rows, '_demoemea.loyalty.tier') || '';
    var miles = cl.miles || cl.balance || rowVal(rows, '_demoemea.loyalty.miles') || '—';
    var loyaltyId = rowVal(rows, '_demoemea.loyalty.id') || rowVal(rows, 'loyaltyIds.loyaltyId') || '—';
    var program = rowVal(rows, '_demoemea.loyalty.program') || 'Etihad Guest';

    setText('gaProfileFullName', fullName);
    setText('gaProfileLoyaltyId', loyaltyId !== '—' ? 'Member · ' + loyaltyId : '—');
    setTierBadge(document.getElementById('gaLoyaltyTierBadge'), tier);
    setTierBadge(document.getElementById('gaLoyaltyTierInline'), tier);

    var gIcon = document.getElementById('gaGenderIcon');
    if (gIcon) {
      var gl = gender.toLowerCase();
      gIcon.textContent = gl.indexOf('f') === 0 ? '👩' : gl.indexOf('m') === 0 ? '👨' : '👤';
    }

    var img = document.getElementById('gaProfilePhoto');
    var photoUrl = rowVal(rows, 'personImage.url') || rowVal(rows, '_demoemea.profile.photoUrl') || '';
    if (img) {
      if (photoUrl && photoUrl.indexOf('http') === 0) {
        img.src = photoUrl;
        img.style.display = '';
        img.alt = fullName;
      } else {
        img.removeAttribute('src');
        img.style.display = 'none';
        img.alt = '';
      }
    }

    setText('gaFullName', fullName);
    setText('gaGender', gender || '—');
    setText('gaDOB', dob || 'Not available');
    setText('gaAge', rowVal(rows, 'person.age') || '—');
    setText('gaNationality', nationality);
    setText('gaEmail', email);
    setText('gaPhone', phone);
    setText('gaAddress', addr);
    setText('gaLanguage', lang);

    setText('gaFlight', td.flightNumber || td.flight || rowVal(rows, '_demoemea.booking.flight') || '—');
    setText('gaRoute', td.route || '—');
    setText('gaFlightClass', td.cabin || rowVal(rows, '_demoemea.booking.class') || '—');
    setText('gaFlightDate', td.flightDate || 'Not available');
    setText('gaPassengers', td.passengers || rowVal(rows, '_demoemea.booking.pax') || '—');
    setText('gaBookingRef', td.bookingRef || td.bookingReference || '—');
    setText('gaSeat', td.seat || rowVal(rows, '_demoemea.booking.seat') || '—');
    setText('gaGate', td.gate || '—');
    setText('gaBoardingTime', td.boardingTime || '—');
    setText('gaBaggage', td.baggage || rowVal(rows, '_demoemea.booking.baggage') || '—');
    setText('gaCheckIn', td.checkInStatus || '—');
    setText('gaSeatPref', td.seatPreference || rowVal(rows, 'travelPreferences.seat') || '—');
    setText('gaMealPref', td.mealPreference || rowVal(rows, 'travelPreferences.meal') || '—');
    setText('gaSpecialReqs', rowVal(rows, 'travelPreferences.specialRequests') || 'None');

    setText('gaLoyaltyProgram', program);
    setText('gaLoyaltyID', loyaltyId);
    setText('gaMiles', miles);
    setText('gaMemberSince', cl.memberSince || rowVal(rows, '_demoemea.loyalty.memberSince') || '—');
    setText('gaNextTier', cl.nextTier || rowVal(rows, '_demoemea.loyalty.nextTier') || '—');
    setText('gaMilesNeeded', cl.milesToNext || rowVal(rows, '_demoemea.loyalty.milesNeeded') || '—');
    setText('gaOrdersYTD', rowVal(rows, '_demoemea.stats.flightsYtd') || '—');
    setText('gaLTV', rowVal(rows, '_demoemea.stats.ltv') || '—');
    setText('gaNPS', formatScore(rowVal(rows, '_demoemea.ai.nps')));
    setText('gaChurn', formatScore(rowVal(rows, '_demoemea.ai.churnRisk')));
    setText('gaUpgrade', formatScore(rowVal(rows, '_demoemea.ai.upgradePropensity')));

    setText('gaChurnPref', formatScore(rowVal(rows, '_demoemea.ai.churnRisk')));
    setText('gaPropensityPref', formatScore(rowVal(rows, '_demoemea.ai.propensity')));
    setText('gaNPSPref', formatScore(rowVal(rows, '_demoemea.ai.nps')));
    setText('gaUpgradePref', formatScore(rowVal(rows, '_demoemea.ai.upgradePropensity')));
    setText('gaPrefChannel', rowVal(rows, '_demoemea.preferences.channel') || 'Email');
    setText('gaPrefLang', lang);

    setText('gbsFlight', td.flightNumber || td.flight || '—');
    setText('gbsRoute', td.route || '—');
    setText('gbsPassenger', fullName);

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
        setLoading(true);
        lookupProfile(val)
          .then(function (data) {
            if (!data || !data.found) {
              showError('Profile not found');
              return;
            }
            renderAll(data);
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
  loadRtdbData();
})();
