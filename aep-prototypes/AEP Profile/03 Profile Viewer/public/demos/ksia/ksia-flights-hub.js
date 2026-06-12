/**
 * KSIA Flights hub — board tabs, stepper, assistant rows, flight search.
 */
(function () {
  'use strict';

  var data = window.KsiaMockData || {};

  function resolveHref(href) {
    if (window.KsiaChrome && typeof window.KsiaChrome.resolveHref === 'function') {
      return window.KsiaChrome.resolveHref(href);
    }
    return href;
  }

  function statusClass(status) {
    var s = String(status || '').toLowerCase();
    if (s.indexOf('delay') !== -1) return 'ksia-flights-row-status--delayed';
    if (s.indexOf('board') !== -1 || s.indexOf('landed') !== -1) return 'ksia-flights-row-status--active';
    return 'ksia-flights-row-status--ontime';
  }

  function renderBoardTable(type, rows, mountId) {
    var mount = document.getElementById(mountId);
    if (!mount || !rows || !rows.length) return;

    var destCol = type === 'arrivals' ? 'From' : 'To';
    var destKey = type === 'arrivals' ? 'from' : 'to';

    var html =
      '<table class="ksia-board-table ksia-flights-board-table"><thead><tr>' +
      '<th>Flight</th><th>' + destCol + '</th><th>Time</th><th>Terminal</th><th>Status</th>' +
      '</tr></thead><tbody>';

    rows.forEach(function (row) {
      html +=
        '<tr><td class="ksia-flights-row-flight">' + row.flight + '</td>' +
        '<td>' + row[destKey] + '</td>' +
        '<td>' + (row.time || row.scheduled) + '</td>' +
        '<td>' + row.terminal + '</td>' +
        '<td><span class="ksia-status ksia-flights-row-status ' + statusClass(row.status) + '">' + row.status + '</span></td></tr>';
    });

    html += '</tbody></table>';
    mount.innerHTML = html;
  }

  function initBoardTabs() {
    var tabs = document.querySelectorAll('[data-ksia-board-tab]');
    var panels = {
      arrivals: document.getElementById('ksiaPanelArrivals'),
      departures: document.getElementById('ksiaPanelDepartures'),
    };
    if (!tabs.length) return;

    renderBoardTable('arrivals', data.SAMPLE_ARRIVALS, 'ksiaArrivalsBoard');
    renderBoardTable('departures', data.SAMPLE_DEPARTURES, 'ksiaDeparturesBoard');

    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var target = tab.getAttribute('data-ksia-board-tab');
        tabs.forEach(function (t) {
          var isActive = t === tab;
          t.classList.toggle('ksia-flights-tab--active', isActive);
          t.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
        Object.keys(panels).forEach(function (key) {
          var panel = panels[key];
          if (!panel) return;
          var show = key === target;
          panel.classList.toggle('ksia-flights-board-panel--active', show);
          if (show) panel.removeAttribute('hidden');
          else panel.setAttribute('hidden', '');
        });
        if (window.KsiaLabEvents) {
          window.KsiaLabEvents.emit('ksia.flights.board.tab', { tab: target });
        }
      });
    });
  }

  function initStepper() {
    var mount = document.getElementById('ksiaFlightsStepper');
    var steps = data.FLIGHTS_JOURNEY_STEPS || [];
    if (!mount || !steps.length) return;

    mount.innerHTML = steps
      .map(function (step, i) {
        var stateClass = step.state ? ' ksia-flights-step--' + step.state : '';
        var connector = i < steps.length - 1 ? '<span class="ksia-flights-step-connector" aria-hidden="true"></span>' : '';
        return (
          '<li class="ksia-flights-step' + stateClass + '">' +
          '<span class="ksia-flights-step-dot" aria-hidden="true"></span>' +
          '<span class="ksia-flights-step-label">' + step.label + '</span>' +
          connector +
          '</li>'
        );
      })
      .join('');
  }

  function initAssistant() {
    var mount = document.getElementById('ksiaFlightsAssistant');
    var items = data.FLIGHTS_ASSISTANT_SUGGESTIONS || [];
    if (!mount || !items.length) return;

    mount.innerHTML = items
      .map(function (item) {
        return (
          '<li><a href="' + resolveHref(item.href) + '" class="ksia-flights-assistant-row" data-ksia-assistant-link>' +
          '<span class="ksia-flights-assistant-icon" aria-hidden="true">' + (item.icon || '&#10022;') + '</span>' +
          '<span class="ksia-flights-assistant-body">' +
          '<span class="ksia-flights-assistant-title">' + item.title + '</span>' +
          '<span class="ksia-flights-assistant-desc">' + item.desc + '</span>' +
          '</span>' +
          '<span class="ksia-flights-assistant-arrow" aria-hidden="true">&rarr;</span>' +
          '</a></li>'
        );
      })
      .join('');

    mount.querySelectorAll('[data-ksia-assistant-link]').forEach(function (el) {
      el.addEventListener('click', function () {
        if (window.KsiaLabEvents) {
          window.KsiaLabEvents.emit('ksia.aivc.suggestion.click', { label: el.querySelector('.ksia-flights-assistant-title').textContent.trim() });
        }
      });
    });
  }

  function initServices() {
    var mount = document.getElementById('ksiaFlightsServices');
    var items = data.FLIGHTS_RELATED_SERVICES || [];
    if (!mount || !items.length) return;

    mount.innerHTML = items
      .map(function (item) {
        return (
          '<li><a href="' + resolveHref(item.href) + '" class="ksia-flights-service-card" data-ksia-service-link>' +
          '<span class="ksia-flights-service-icon" aria-hidden="true">' + (item.icon || '&#9679;') + '</span>' +
          '<span class="ksia-flights-service-label">' + item.label + '</span>' +
          '</a></li>'
        );
      })
      .join('');

    mount.querySelectorAll('[data-ksia-service-link]').forEach(function (el) {
      el.addEventListener('click', function () {
        if (window.KsiaLabEvents) {
          window.KsiaLabEvents.emit('ksia.flights.service.click', { label: el.textContent.trim() });
        }
      });
    });
  }

  function initTripCard() {
    var trip = data.FLIGHTS_TRIP_CARD;
    var mount = document.getElementById('ksiaFlightsTripCard');
    if (!trip || !mount) return;

    var originEl = mount.querySelector('.ksia-flights-trip-endpoint:not(.ksia-flights-trip-endpoint--dest) .ksia-flights-trip-city');
    var destEl = mount.querySelector('.ksia-flights-trip-endpoint--dest .ksia-flights-trip-city');
    var flightEl = mount.querySelector('.ksia-flights-trip-flight');
    var statusEl = mount.querySelector('.ksia-flights-status');
    var pillEl = mount.querySelector('.ksia-flights-pill');

    if (originEl) originEl.textContent = trip.originCity || originEl.textContent;
    if (destEl) destEl.textContent = trip.destCity || destEl.textContent;
    if (flightEl) flightEl.textContent = trip.flight || flightEl.textContent;
    if (statusEl) {
      statusEl.textContent = trip.status || statusEl.textContent;
      statusEl.className = 'ksia-flights-status ksia-flights-status--' + (trip.statusKey || 'ontime');
    }
    if (pillEl) pillEl.textContent = trip.phase || pillEl.textContent;
  }

  function initFlightSearch() {
    var form = document.getElementById('ksiaFlightSearch');
    if (!form) return;

    var dateInput = document.getElementById('ksiaTravelDate');
    if (dateInput && !dateInput.value) {
      var d = new Date();
      d.setDate(d.getDate() + 2);
      dateInput.value = d.toISOString().slice(0, 10);
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var origin = (document.getElementById('ksiaOrigin') || {}).value || '';
      var dest = (document.getElementById('ksiaDestination') || {}).value || '';
      var date = (dateInput && dateInput.value) || '';
      if (window.KsiaLabEvents && typeof window.KsiaLabEvents.emitFlightSearch === 'function') {
        window.KsiaLabEvents.emitFlightSearch(origin, dest, date);
      }
      window.location.href = resolveHref('flights/departures.html');
    });
  }

  function boot() {
    initTripCard();
    initBoardTabs();
    initStepper();
    initAssistant();
    initServices();
    initFlightSearch();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
