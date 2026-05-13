/**
 * Etihad iPad gate-agent lab: RTDB ajoLookups/{sandbox} (REST) + GET /api/profile/table.
 */
(function () {
  'use strict';

  var rtdbBase =
    (window.firebaseDatabaseConfig && window.firebaseDatabaseConfig.databaseURL) ||
    'https://aep-orchestration-lab-default-rtdb.firebaseio.com';

  var rtdbData = {};

  var COLOUR_STORE_KEY = 'ipadBezColour';
  var SIZE_STORE_KEY = 'ipadBezSize';

  var SIZE_MAP = {
    '11': { vpW: 834, vpH: 1194, wrapW: 870, outerH: 1242, baseScale: 0.75 },
    '13': { vpW: 1024, vpH: 1366, wrapW: 1062, outerH: 1416, baseScale: 0.62 },
  };

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

  function updateClock() {
    var el = document.getElementById('ipadStatusTime');
    if (el) {
      el.textContent = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    }
  }

  function applyRtdbToShell() {
    var sp = rtdbData.StaffPortal || {};
    var cd = rtdbData.CoreDemoData || {};

    var airlineName = cd.name || cd.airlineName || 'Etihad Airways';
    var agentName = sp.AgentName || '—';
    var agentId = sp.AgentID || '';
    var agentType = sp.AgentType || '';
    var terminal = sp.FlightTerminalInfo || '';
    var colour = sp.Colour ? String(sp.Colour).replace(/^#/, '') : '';

    setText('gaAirlineName', airlineName);
    setText('gaAgentName', agentName);
    setText('gaAgentMeta', [agentId, agentType, terminal].filter(Boolean).join(' · ') || '—');

    var accent = document.getElementById('gaAgentAccent');
    if (accent) {
      if (colour) accent.style.borderLeft = '4px solid #' + colour;
      else accent.style.borderLeft = '';
    }

    setText('ipadSandboxLabel', getSandboxName() || '—');
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

  function renderPassengerCard(data) {
    var rows = data.rows || [];
    var td = rtdbData.TravelData || {};
    var cl = rtdbData.CustomerLoyalty || {};

    var first = rowVal(rows, 'person.name.firstName');
    var last = rowVal(rows, 'person.name.lastName');
    var fullName = (first + ' ' + last).trim();

    setText('gaPassengerName', fullName || '—');
    setText('gaEmail', data.profileEmail || rowVal(rows, 'personalEmail.address') || '—');
    setText('gaPhone', rowVal(rows, 'mobilePhone.number') || '—');
    setText('gaBookingRef', td.bookingRef || td.bookingReference || '—');
    setText('gaFlight', td.flightNumber || td.flight || '—');
    setText('gaSeatPref', td.seatPreference || rowVal(rows, 'travelPreferences.seat') || '—');
    setText('gaMealPref', td.mealPreference || rowVal(rows, 'travelPreferences.meal') || '—');
    setText('gaMiles', cl.miles || cl.balance || rowVal(rows, '_demoemea.loyalty.miles') || '—');

    var tier = cl.tier || rowVal(rows, '_demoemea.loyalty.tier') || '';
    var badge = document.getElementById('gaLoyaltyBadge');
    if (badge) badge.textContent = tier || 'Member';

    var card = document.getElementById('gaPassengerCard');
    if (card) card.hidden = false;
  }

  function seatOccupied(row, col) {
    var code = col.charCodeAt(0) || 0;
    return ((row * 31 + code) * 17) % 10 < 4;
  }

  function restoreSeatClasses(el) {
    var seat = el.getAttribute('data-seat') || '';
    var row = parseInt(seat, 10) || 0;
    var col = seat.replace(/^\d+/, '') || 'A';
    var premium = row > 0 && row <= 3;
    var occupied = row > 0 && !premium && seatOccupied(row, col);
    el.classList.remove('ga-seat--selected', 'ga-seat--available', 'ga-seat--premium', 'ga-seat--occupied');
    el.classList.add(occupied ? 'ga-seat--occupied' : premium ? 'ga-seat--premium' : 'ga-seat--available');
  }

  function buildSeatGrid() {
    var grid = document.getElementById('gaSeatGrid');
    var confirmBtn = document.getElementById('btnConfirmUpgrade');
    if (!grid) return;
    if (confirmBtn) confirmBtn.hidden = true;
    var COLS = ['A', 'B', 'C', '', 'D', 'E', 'F', 'G'];
    var ROWS = 14;
    var html = '';
    for (var r = 1; r <= ROWS; r++) {
      html += '<div class="ga-seat-row"><span class="ga-seat-row-num">' + r + '</span>';
      for (var i = 0; i < COLS.length; i++) {
        var col = COLS[i];
        if (!col) {
          html += '<span class="ga-seat-aisle"></span>';
          continue;
        }
        var premium = r <= 3;
        var occupied = !premium && seatOccupied(r, col);
        var cls = occupied ? 'ga-seat--occupied' : premium ? 'ga-seat--premium' : 'ga-seat--available';
        html +=
          '<button type="button" class="ga-seat ' +
          cls +
          '" data-seat="' +
          r +
          col +
          '" aria-label="Seat ' +
          r +
          col +
          '"></button>';
      }
      html += '</div>';
    }
    grid.innerHTML = html;
  }

  function onSeatGridClick(e) {
    var btn = e.target && e.target.closest ? e.target.closest('.ga-seat--available, .ga-seat--premium') : null;
    if (!btn) return;
    var grid = document.getElementById('gaSeatGrid');
    if (!grid) return;
    grid.querySelectorAll('.ga-seat--selected').forEach(function (s) {
      s.classList.remove('ga-seat--selected');
      restoreSeatClasses(s);
    });
    btn.classList.add('ga-seat--selected');
    btn.classList.remove('ga-seat--available', 'ga-seat--premium');
    var confirmBtn = document.getElementById('btnConfirmUpgrade');
    if (confirmBtn) confirmBtn.hidden = false;
  }

  function openSeatMap() {
    var modal = document.getElementById('gaSeatMapModal');
    if (modal) {
      modal.hidden = false;
      buildSeatGrid();
    }
  }

  function closeSeatMap() {
    var modal = document.getElementById('gaSeatMapModal');
    if (modal) modal.hidden = true;
    var confirmBtn = document.getElementById('btnConfirmUpgrade');
    if (confirmBtn) confirmBtn.hidden = true;
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
    }, 3000);
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
    var cfg = SIZE_MAP[size] || SIZE_MAP['11'];
    var scale = effectiveScale(cfg.baseScale);
    if (scalerEl) scalerEl.style.setProperty('--ipad-scale', String(scale));
    if (bezelEl) {
      bezelEl.style.setProperty('--device-vp-w', cfg.vpW + 'px');
      bezelEl.style.setProperty('--device-vp-h', cfg.vpH + 'px');
    }
    if (scalerWrap) {
      scalerWrap.style.setProperty('--ipad-wrap-w', cfg.wrapW + 'px');
      scalerWrap.style.setProperty('--ipad-outer-h', cfg.outerH + 'px');
      scalerWrap.style.setProperty('--ipad-scale', String(scale));
    }
    document.querySelectorAll('[data-ipad-size]').forEach(function (b) {
      b.classList.toggle('ipad-ctrl-btn--active', b.getAttribute('data-ipad-size') === size);
    });
    try {
      sessionStorage.setItem(SIZE_STORE_KEY, size);
    } catch (e1) {}
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
    } catch (e2) {}
  }

  function setLoading(on) {
    var btn = document.querySelector('.ga-search-btn');
    if (btn) {
      btn.disabled = !!on;
      btn.textContent = on ? 'Looking up…' : 'Look up';
    }
    if (on) {
      var card = document.getElementById('gaPassengerCard');
      if (card) card.hidden = true;
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
            renderPassengerCard(data);
          })
          .catch(function (err) {
            showError('Lookup failed: ' + (err && err.message ? err.message : String(err)));
          })
          .finally(function () {
            setLoading(false);
          });
      });
    }

    var btnBoard = document.getElementById('btnProcessBoarding');
    if (btnBoard) {
      btnBoard.addEventListener('click', function () {
        var n = document.getElementById('gaPassengerName');
        showToast('Boarding processed for ' + (n && n.textContent ? n.textContent : 'passenger'));
      });
    }
    var btnUp = document.getElementById('btnOfferUpgrade');
    if (btnUp) btnUp.addEventListener('click', openSeatMap);
    var btnBag = document.getElementById('btnManageBaggage');
    if (btnBag) {
      btnBag.addEventListener('click', function () {
        showToast('Baggage management opened');
      });
    }
    var closeBtn = document.getElementById('gaSeatMapClose');
    if (closeBtn) closeBtn.addEventListener('click', closeSeatMap);
    var confirmBtn = document.getElementById('btnConfirmUpgrade');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', function () {
        closeSeatMap();
        showToast('Upgrade confirmed');
      });
    }

    var modal = document.getElementById('gaSeatMapModal');
    if (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target === modal) closeSeatMap();
      });
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeSeatMap();
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

    var grid = document.getElementById('gaSeatGrid');
    if (grid) grid.addEventListener('click', onSeatGridClick);

    window.addEventListener('aep-global-sandbox-change', function () {
      loadRtdbData();
    });
    window.addEventListener('resize', function () {
      var active = document.querySelector('[data-ipad-size].ipad-ctrl-btn--active');
      var size = active && active.getAttribute('data-ipad-size') ? active.getAttribute('data-ipad-size') : '11';
      applySize(size);
    });
  }

  updateClock();
  setInterval(updateClock, 1000);

  var savedColour = null;
  var savedSize = null;
  try {
    savedColour = sessionStorage.getItem(COLOUR_STORE_KEY);
  } catch (e3) {}
  try {
    savedSize = sessionStorage.getItem(SIZE_STORE_KEY);
  } catch (e4) {}

  applyBezelColour(savedColour || 'space-black');
  applySize(savedSize || '11');
  wireEvents();
  loadRtdbData();
})();
