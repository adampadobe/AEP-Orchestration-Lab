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

  function renderStepper(mountId, steps) {
    var mount = document.getElementById(mountId);
    if (!mount || !steps || !steps.length) return;
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

  function renderServices(mountId, items) {
    var mount = document.getElementById(mountId);
    if (!mount || !items || !items.length) return;
    mount.innerHTML = items
      .map(function (item) {
        return (
          '<li><a href="' + resolveHref(item.href) + '" class="ksia-flights-service-card">' +
          '<span class="ksia-flights-service-icon" aria-hidden="true">' + (item.icon || '&#9679;') + '</span>' +
          '<span class="ksia-flights-service-label">' + item.label + '</span>' +
          '</a></li>'
        );
      })
      .join('');
  }

  function renderSuggestions(mountId, items) {
    var mount = document.getElementById(mountId);
    if (!mount || !items || !items.length) return;
    mount.innerHTML = items
      .map(function (item) {
        return (
          '<li><a href="' + resolveHref(item.href) + '" class="ksia-flights-assistant-row">' +
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
  }

  function initConcierge(prefix) {
    var copy = data.CONCIERGE_COPY;
    if (!copy) return;
    var title = document.getElementById(prefix + 'ConciergeTitle');
    var lead = document.getElementById(prefix + 'ConciergeLead');
    var cta = document.getElementById(prefix + 'ConciergeCta');
    if (title) title.textContent = copy.title;
    if (lead) lead.textContent = copy.lead;
    if (cta) {
      if (copy.cta) cta.textContent = copy.cta;
      cta.addEventListener('click', function () {
        if (window.KsiaLabEvents) {
          window.KsiaLabEvents.emitAivcAction('concierge-open');
        }
        cta.textContent = 'Concierge opened (mock)';
      });
    }
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

    renderStepper('ksiaTransportStepper', data.TRANSPORT_JOURNEY_STEPS);

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

    renderSuggestions('ksiaTransportSuggestions', data.TRANSPORT_ASSISTANT_SUGGESTIONS);
    renderServices('ksiaTransportServices', data.TRANSPORT_RELATED_SERVICES);
    initConcierge('ksiaTransport');
  }

  function initParking() {
    var availMount = document.getElementById('ksiaParkingAvailability');
    var availability = data.PARKING_AVAILABILITY || [];
    if (availMount) {
      availMount.innerHTML = availability
        .map(function (a) {
          return (
            '<article class="ksia-transport-zone-card">' +
            '<h3 class="ksia-transport-zone-terminal">' + a.zone + '</h3>' +
            '<p class="ksia-transport-zone-name">' + a.terminal + '</p>' +
            '<p class="ksia-transport-zone-stay"><strong>' + a.spaces + '</strong></p>' +
            '<p class="ksia-transport-zone-note">Status: ' + a.status + '</p></article>'
          );
        })
        .join('');
    }

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

    renderServices('ksiaParkingServices', data.TRANSPORT_RELATED_SERVICES);
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

    var assistant = data.DROP_OFF_ASSISTANT;
    if (assistant) {
      var title = document.getElementById('ksiaDropOffAssistantTitle');
      var lead = document.getElementById('ksiaDropOffAssistantLead');
      var cta = document.getElementById('ksiaDropOffAssistantCta');
      if (title) title.textContent = assistant.title;
      if (lead) lead.textContent = assistant.lead;
      if (cta) {
        cta.textContent = assistant.cta;
        cta.addEventListener('click', function () {
          if (window.KsiaLabEvents) {
            window.KsiaLabEvents.emit('ksia.transport.dropoff.pin', { flight: 'SV 123' });
          }
          cta.textContent = 'Pin sent to driver (mock)';
        });
      }
    }
  }

  function initPublicTransport() {
    var planner = data.PUBLIC_TRANSPORT_PLANNER;
    var plannerMount = document.getElementById('ksiaPublicTransportPlanner');
    if (plannerMount && planner) {
      plannerMount.innerHTML =
        '<p class="ksia-board-assistant-lead"><strong>From:</strong> ' + planner.origin + '<br>' +
        '<strong>To:</strong> ' + planner.destination + '</p>' +
        '<p class="ksia-transport-assistant-rec">Suggested: ' + planner.suggestedMode + ' · ' + planner.eta + '</p>';
    }

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

    renderServices('ksiaPublicTransportServices', data.TRANSPORT_RELATED_SERVICES);
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
