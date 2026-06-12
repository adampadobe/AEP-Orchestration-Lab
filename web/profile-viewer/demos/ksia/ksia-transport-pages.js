/**
 * KSIA transport section — hub, parking, drop-off, public transport.
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

  function pageId() {
    return document.body && document.body.getAttribute('data-ksia-page-id');
  }

  function initTransportHub() {
    var hero = data.TRANSPORT_HERO;
    var kicker = document.getElementById('ksiaTransportHeroKicker');
    var lead = document.getElementById('ksiaTransportHeroLead');
    var stage = document.getElementById('ksiaTransportHeroStage');
    if (hero) {
      if (kicker) kicker.textContent = hero.kicker;
      if (lead) lead.textContent = hero.lead;
      if (stage) stage.textContent = hero.stage;
    }

    var modesMount = document.getElementById('ksiaTransportModes');
    var modes = data.TRANSPORT_MODES || [];
    if (modesMount) {
      modesMount.innerHTML = modes
        .map(function (m) {
          var stub = m.stub ? ' ksia-transport-mode-card--stub' : '';
          var stubBadge = m.stub ? '<span class="ksia-transport-stub-badge">Coming soon</span>' : '';
          return (
            '<li><a href="' + resolveHref(m.href) + '" class="ksia-transport-mode-card' + stub + '">' +
            '<span class="ksia-transport-mode-icon" aria-hidden="true">' + m.icon + '</span>' +
            '<span class="ksia-transport-mode-label">' + m.label + '</span>' +
            stubBadge +
            '<span class="ksia-transport-mode-desc">' + m.desc + '</span>' +
            '<span class="ksia-transport-mode-arrow" aria-hidden="true">&rarr;</span></a></li>'
          );
        })
        .join('');
    }

    var assistant = data.TRANSPORT_ASSISTANT;
    if (assistant) {
      var title = document.getElementById('ksiaTransportAssistantTitle');
      var leadEl = document.getElementById('ksiaTransportAssistantLead');
      var rec = document.getElementById('ksiaTransportAssistantRec');
      var actions = document.getElementById('ksiaTransportAssistantActions');
      if (title) title.textContent = assistant.title;
      if (leadEl) leadEl.textContent = assistant.lead;
      if (rec) rec.textContent = assistant.recommendation;
      if (actions && assistant.actions) {
        actions.innerHTML = assistant.actions
          .map(function (a) {
            return (
              '<a href="' + resolveHref(a.href) + '" class="ksia-board-assistant-action">' +
              '<span aria-hidden="true">' + a.icon + '</span> ' + a.label + '</a>'
            );
          })
          .join('');
      }
    }
  }

  function initParking() {
    var mount = document.getElementById('ksiaParkingProducts');
    var products = data.PARKING_PRODUCTS || [];
    if (mount) {
      mount.innerHTML = products
        .map(function (p) {
          return (
            '<article class="ksia-transport-product-card">' +
            '<span class="ksia-transport-product-type">' + p.type + '</span>' +
            '<h3 class="ksia-transport-product-name">' + p.name + '</h3>' +
            '<p class="ksia-transport-product-terminal">' + p.terminal + ' · ' + p.proximity + '</p>' +
            '<p class="ksia-transport-product-price">' + p.price + '</p>' +
            '<p class="ksia-transport-product-price-note">' + p.priceNote + '</p>' +
            '<ul class="ksia-transport-product-features">' +
            p.features.map(function (f) { return '<li>' + f + '</li>'; }).join('') +
            '</ul>' +
            '<button type="button" class="ksia-btn ksia-btn-primary ksia-transport-book-btn" data-parking-id="' + p.id + '">Book (mock)</button>' +
            '</article>'
          );
        })
        .join('');

      mount.querySelectorAll('.ksia-transport-book-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          if (window.KsiaLabEvents) {
            window.KsiaLabEvents.emit('ksia.transport.parking.book', { product: btn.getAttribute('data-parking-id') });
          }
          btn.textContent = 'Added to wallet (mock)';
          btn.disabled = true;
        });
      });
    }

    var assistant = data.PARKING_ASSISTANT;
    if (assistant) {
      var title = document.getElementById('ksiaParkingAssistantTitle');
      var lead = document.getElementById('ksiaParkingAssistantLead');
      var cta = document.getElementById('ksiaParkingAssistantCta');
      if (title) title.textContent = assistant.title;
      if (lead) lead.textContent = assistant.lead;
      if (cta) {
        cta.textContent = assistant.cta;
        cta.addEventListener('click', function () {
          if (window.KsiaLabEvents) {
            window.KsiaLabEvents.emit('ksia.transport.parking.prebook', { flight: assistant.flight });
          }
          cta.textContent = 'Pre-booked for SV 123 (mock)';
        });
      }
    }
  }

  function initDropOff() {
    var zonesMount = document.getElementById('ksiaDropOffZones');
    var zones = data.DROP_OFF_ZONES || [];
    if (zonesMount) {
      zonesMount.innerHTML = zones
        .map(function (z) {
          return (
            '<article class="ksia-transport-zone-card">' +
            '<h3 class="ksia-transport-zone-terminal">' + z.terminal + '</h3>' +
            '<p class="ksia-transport-zone-name">' + z.zone + '</p>' +
            '<p class="ksia-transport-zone-stay">Max stay: <strong>' + z.maxStay + '</strong></p>' +
            '<p class="ksia-transport-zone-note">' + z.note + '</p></article>'
          );
        })
        .join('');
    }

    var rulesMount = document.getElementById('ksiaDropOffRules');
    var rules = data.DROP_OFF_RULES || [];
    if (rulesMount) {
      rulesMount.innerHTML = rules.map(function (r) { return '<li>' + r + '</li>'; }).join('');
    }
  }

  function initPublicTransport() {
    var mount = document.getElementById('ksiaPublicTransportRoutes');
    var options = data.PUBLIC_TRANSPORT_OPTIONS || [];
    if (mount) {
      mount.innerHTML = options
        .map(function (o) {
          var stub = o.stub ? ' ksia-transport-route-card--stub' : '';
          var stubNote = o.stub ? '<span class="ksia-transport-stub-badge">PoT #14 stub</span>' : '';
          return (
            '<article class="ksia-transport-route-card' + stub + '">' +
            stubNote +
            '<span class="ksia-transport-route-mode">' + o.mode + '</span>' +
            '<h3 class="ksia-transport-route-name">' + o.name + '</h3>' +
            '<dl class="ksia-transport-route-meta">' +
            '<div><dt>Est. time</dt><dd>' + o.time + '</dd></div>' +
            '<div><dt>Cost</dt><dd>' + o.cost + '</dd></div>' +
            '</dl>' +
            '<p class="ksia-transport-route-note">' + o.note + '</p></article>'
          );
        })
        .join('');
    }
  }

  function init() {
    var id = pageId();
    if (id === 'transport-hub') initTransportHub();
    if (id === 'parking') initParking();
    if (id === 'drop-off') initDropOff();
    if (id === 'public-transport') initPublicTransport();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
