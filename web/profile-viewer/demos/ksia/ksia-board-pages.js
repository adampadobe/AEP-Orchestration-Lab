/**
 * KSIA flight board pages — arrivals & departures with filters and assistant modules.
 */
(function () {
  'use strict';

  var data = window.KsiaMockData || {};
  var BUILD_TS = '20260612e';

  function resolveHref(href) {
    if (window.KsiaChrome && typeof window.KsiaChrome.resolveHref === 'function') {
      return window.KsiaChrome.resolveHref(href);
    }
    return href;
  }

  function pageId() {
    return document.body && document.body.getAttribute('data-ksia-page-id');
  }

  function statusClass(status) {
    var s = String(status || '').toLowerCase();
    if (s.indexOf('delay') !== -1) return 'ksia-flights-row-status--delayed';
    if (s.indexOf('board') !== -1 || s.indexOf('landed') !== -1 || s.indexOf('open') !== -1) {
      return 'ksia-flights-row-status--active';
    }
    return 'ksia-flights-row-status--ontime';
  }

  function formatUpdated() {
    var now = new Date();
    return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' AST';
  }

  function initTimestamp() {
    var el = document.getElementById('ksiaBoardUpdated');
    if (el) el.textContent = 'Last updated ' + formatUpdated();
  }

  function filterRows(type, rows) {
    var airline = (document.getElementById('ksiaFilterAirline') || {}).value || '';
    var flight = String((document.getElementById('ksiaFilterFlight') || {}).value || '').trim().toUpperCase();
    var place = String((document.getElementById('ksiaFilterPlace') || {}).value || '').trim().toLowerCase();

    return (rows || []).filter(function (row) {
      if (airline && row.airline !== airline) return false;
      if (flight && row.flight.toUpperCase().indexOf(flight) === -1) return false;
      var placeVal = type === 'arrivals' ? row.from : row.to;
      if (place && String(placeVal || '').toLowerCase().indexOf(place) === -1) return false;
      return true;
    });
  }

  function populateAirlineFilter(rows) {
    var select = document.getElementById('ksiaFilterAirline');
    if (!select || !rows) return;
    var airlines = [];
    rows.forEach(function (r) {
      if (r.airline && airlines.indexOf(r.airline) === -1) airlines.push(r.airline);
    });
    airlines.sort();
    select.innerHTML =
      '<option value="">All airlines</option>' +
      airlines.map(function (a) {
        return '<option value="' + a + '">' + a + '</option>';
      }).join('');
  }

  function renderBoard(type) {
    var mount = document.getElementById('ksiaBoardTable');
    if (!mount) return;

    var rows = type === 'arrivals' ? data.BOARD_ARRIVALS : data.BOARD_DEPARTURES;
    var filtered = filterRows(type, rows);

    if (type === 'arrivals') {
      var html =
        '<table class="ksia-board-table ksia-flights-board-table ksia-board-table--full"><thead><tr>' +
        '<th>Flight</th><th>Origin</th><th>Scheduled</th><th>Estimated</th><th>Status</th><th>Belt</th><th>Terminal</th>' +
        '</tr></thead><tbody>';

      filtered.forEach(function (row) {
        var rowClass = row.tracked ? ' class="ksia-board-row--tracked"' : '';
        html +=
          '<tr' + rowClass + '>' +
          '<td class="ksia-flights-row-flight">' + row.flight +
          (row.tracked ? ' <span class="ksia-board-tracked-pill">Your pickup</span>' : '') +
          '</td>' +
          '<td>' + row.from + '</td>' +
          '<td>' + row.scheduled + '</td>' +
          '<td>' + row.estimated + '</td>' +
          '<td><span class="ksia-status ksia-flights-row-status ' + statusClass(row.status) + '">' + row.status + '</span></td>' +
          '<td>' + row.belt + '</td>' +
          '<td>' + row.terminal + '</td></tr>';
      });
      html += '</tbody></table>';
      mount.innerHTML = html;
    } else {
      html =
        '<table class="ksia-board-table ksia-flights-board-table ksia-board-table--full"><thead><tr>' +
        '<th>Flight</th><th>Destination</th><th>Scheduled</th><th>Gate</th><th>Status</th><th>Terminal</th>' +
        '</tr></thead><tbody>';

      filtered.forEach(function (row) {
        var rowClass = row.tracked ? ' class="ksia-board-row--tracked"' : '';
        html +=
          '<tr' + rowClass + '>' +
          '<td class="ksia-flights-row-flight">' + row.flight +
          (row.tracked ? ' <span class="ksia-board-tracked-pill">Your flight</span>' : '') +
          '</td>' +
          '<td>' + row.to + '</td>' +
          '<td>' + row.scheduled + '</td>' +
          '<td>' + row.gate + '</td>' +
          '<td><span class="ksia-status ksia-flights-row-status ' + statusClass(row.status) + '">' + row.status + '</span></td>' +
          '<td>' + row.terminal + '</td></tr>';
      });
      html += '</tbody></table>';
      mount.innerHTML = html;
    }

    var empty = document.getElementById('ksiaBoardEmpty');
    if (empty) empty.hidden = filtered.length > 0;
  }

  function initFilters(type) {
    var rows = type === 'arrivals' ? data.BOARD_ARRIVALS : data.BOARD_DEPARTURES;
    populateAirlineFilter(rows);
    renderBoard(type);

    ['ksiaFilterAirline', 'ksiaFilterFlight', 'ksiaFilterPlace'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', function () {
        renderBoard(type);
      });
      el.addEventListener('change', function () {
        renderBoard(type);
      });
    });

    var reset = document.getElementById('ksiaFilterReset');
    if (reset) {
      reset.addEventListener('click', function () {
        var airline = document.getElementById('ksiaFilterAirline');
        var flight = document.getElementById('ksiaFilterFlight');
        var place = document.getElementById('ksiaFilterPlace');
        if (airline) airline.value = '';
        if (flight) flight.value = '';
        if (place) place.value = '';
        renderBoard(type);
      });
    }
  }

  function initArrivalsAssistant() {
    var module = data.ARRIVALS_ASSISTANT;
    var mount = document.getElementById('ksiaBoardAssistant');
    if (!module || !mount) return;

    var tips = (module.tips || [])
      .map(function (t) {
        return '<li>' + t + '</li>';
      })
      .join('');

    var actions = (module.actions || [])
      .map(function (a) {
        return (
          '<a href="' + resolveHref(a.href) + '" class="ksia-board-assistant-action" data-ksia-assistant-cta>' +
          '<span class="ksia-board-assistant-action-icon" aria-hidden="true">' + (a.icon || '&#9679;') + '</span>' +
          '<span>' + a.label + '</span></a>'
        );
      })
      .join('');

    mount.innerHTML =
      '<div class="ksia-board-assistant-card">' +
      '<p class="ksia-section-kicker">AIVC assistant</p>' +
      '<h2 class="ksia-display-heading">' + module.title + '</h2>' +
      '<p class="ksia-board-assistant-lead">' + module.lead + '</p>' +
      '<ul class="ksia-board-assistant-tips">' + tips + '</ul>' +
      '<div class="ksia-board-assistant-actions">' + actions + '</div>' +
      '</div>';

    mount.querySelectorAll('[data-ksia-assistant-cta]').forEach(function (el) {
      el.addEventListener('click', function () {
        if (window.KsiaLabEvents) {
          window.KsiaLabEvents.emit('ksia.aivc.suggestion.click', { label: el.textContent.trim() });
        }
      });
    });
  }

  function initDeparturesAssistant() {
    var module = data.DEPARTURES_ASSISTANT;
    var mount = document.getElementById('ksiaBoardAssistant');
    if (!module || !mount) return;

    var actions = (module.actions || [])
      .map(function (a) {
        return (
          '<li><a href="' + resolveHref(a.href) + '" class="ksia-flights-assistant-row" data-ksia-assistant-link>' +
          '<span class="ksia-flights-assistant-icon" aria-hidden="true">' + (a.icon || '&#10022;') + '</span>' +
          '<span class="ksia-flights-assistant-body">' +
          '<span class="ksia-flights-assistant-title">' + a.label + '</span>' +
          '<span class="ksia-flights-assistant-desc">' + a.desc + '</span>' +
          '</span>' +
          '<span class="ksia-flights-assistant-arrow" aria-hidden="true">&rarr;</span>' +
          '</a></li>'
        );
      })
      .join('');

    mount.innerHTML =
      '<div class="ksia-board-assistant-card">' +
      '<p class="ksia-section-kicker">AIVC assistant</p>' +
      '<h2 class="ksia-display-heading">' + module.title + '</h2>' +
      '<p class="ksia-board-assistant-lead">' + module.lead + '</p>' +
      '<ul class="ksia-flights-assistant-list">' + actions + '</ul>' +
      '</div>';

    mount.querySelectorAll('[data-ksia-assistant-link]').forEach(function (el) {
      el.addEventListener('click', function () {
        if (window.KsiaLabEvents) {
          window.KsiaLabEvents.emit('ksia.aivc.suggestion.click', {
            label: el.querySelector('.ksia-flights-assistant-title').textContent.trim(),
          });
        }
      });
    });
  }

  function initGateAlert() {
    var alert = data.DEPARTURES_GATE_ALERT;
    var mount = document.getElementById('ksiaGateAlert');
    if (!alert || !alert.show || !mount) return;
    mount.innerHTML =
      '<div class="ksia-board-gate-alert" role="status">' +
      '<span class="ksia-board-gate-alert-icon" aria-hidden="true">&#9888;</span>' +
      '<p>' + alert.message + '</p></div>';
    mount.hidden = false;
  }

  function initRelatedLinks(type) {
    var mount = document.getElementById('ksiaBoardRelated');
    if (!mount) return;

    if (type === 'arrivals') {
      mount.innerHTML =
        '<ul class="ksia-link-grid">' +
        '<li><a href="' + resolveHref('flights/index.html') + '" class="ksia-card-link">Flights hub</a></li>' +
        '<li><a href="' + resolveHref('flights/departures.html') + '" class="ksia-card-link">Departures board</a></li>' +
        '<li><a href="' + resolveHref('transport/parking.html') + '" class="ksia-card-link">Pickup parking</a></li>' +
        '</ul>';
    } else {
      mount.innerHTML =
        '<ul class="ksia-link-grid">' +
        '<li><a href="' + resolveHref('flights/index.html') + '" class="ksia-card-link">Flights hub</a></li>' +
        '<li><a href="' + resolveHref('flights/arrivals.html') + '" class="ksia-card-link">Arrivals board</a></li>' +
        '<li><a href="' + resolveHref('at-the-airport/security.html') + '" class="ksia-card-link">Security info</a></li>' +
        '</ul>';
    }
  }

  function boot() {
    var id = pageId();
    initTimestamp();

    if (id === 'flights-arrivals') {
      initFilters('arrivals');
      initArrivalsAssistant();
      initRelatedLinks('arrivals');
    } else if (id === 'flights-departures') {
      initGateAlert();
      initFilters('departures');
      initDeparturesAssistant();
      initRelatedLinks('departures');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  window.KsiaBoardPages = { formatUpdated: formatUpdated, BUILD_TS: BUILD_TS };
})();
