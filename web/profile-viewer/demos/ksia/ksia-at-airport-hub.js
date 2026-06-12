/**
 * KSIA At the Airport hub — terminal finder, wayfinding, security preview, journey stepper.
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

  function initHero() {
    var ctx = data.AIRPORT_HERO_CONTEXT;
    var mount = document.getElementById('ksiaAirportHeroContext');
    if (!ctx || !mount) return;

    mount.innerHTML = (ctx.details || [])
      .map(function (detail, i) {
        var sep = i > 0 ? '<span class="ksia-at-airport-hero-sep" aria-hidden="true">&middot;</span>' : '';
        return sep + '<span class="ksia-at-airport-hero-detail">' + detail + '</span>';
      })
      .join('');
  }

  function renderFinderResult(flight) {
    var mount = document.getElementById('ksiaAirportFinderResult');
    if (!mount || !flight) return;

    mount.innerHTML =
      '<p class="ksia-at-airport-finder-result-text">' +
      'Your flight <strong>' + flight.flight + '</strong> &middot; ' +
      flight.terminal + ' &middot; Gate <strong>' + flight.gate + '</strong>' +
      '</p>';
  }

  function initFlightLookup() {
    var select = document.getElementById('ksiaAirportFlightSelect');
    var form = document.getElementById('ksiaAirportFlightLookup');
    var options = data.AIRPORT_FLIGHT_LOOKUP_OPTIONS || [];
    var defaultFlight = data.AIRPORT_FLIGHT_LOOKUP_DEFAULT;

    if (select && options.length) {
      select.innerHTML = options
        .map(function (opt) {
          return '<option value="' + opt.id + '">' + opt.label + '</option>';
        })
        .join('');
    }

    if (defaultFlight) renderFinderResult(defaultFlight);

    if (!form) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var id = select ? select.value : '';
      var match = options.find(function (o) { return o.id === id; }) || {};
      var result = match.result || defaultFlight;
      renderFinderResult(result);
      if (window.KsiaLabEvents) {
        window.KsiaLabEvents.emit('ksia.airport.flight.lookup', { flight: result.flight });
      }
    });
  }

  function initWayfinding() {
    var mount = document.getElementById('ksiaAirportWayfindingSteps');
    var steps = data.AIRPORT_WAYFINDING_STEPS || [];
    if (!mount || !steps.length) return;

    mount.innerHTML = steps
      .map(function (step) {
        return '<li>' + step + '</li>';
      })
      .join('');
  }

  function initSecurity() {
    var preview = data.AIRPORT_SECURITY_PREVIEW;
    if (!preview) return;

    var waitEl = document.getElementById('ksiaSecurityWait');
    var leadEl = document.getElementById('ksiaSecurityLead');
    if (waitEl && preview.waitTime) waitEl.textContent = preview.waitTime;
    if (leadEl && preview.lead) leadEl.textContent = preview.lead;
  }

  function initStepper() {
    var mount = document.getElementById('ksiaAirportStepper');
    var hintMount = document.getElementById('ksiaAirportNextHint');
    var steps = data.AIRPORT_JOURNEY_STEPS || [];
    if (!mount || !steps.length) return;

    mount.innerHTML = steps
      .map(function (step, i) {
        var stateClass = step.state ? ' ksia-at-airport-step--' + step.state : '';
        var connector = i < steps.length - 1 ? '<span class="ksia-at-airport-step-connector" aria-hidden="true"></span>' : '';
        return (
          '<li class="ksia-at-airport-step' + stateClass + '">' +
          '<span class="ksia-at-airport-step-dot" aria-hidden="true"></span>' +
          '<span class="ksia-at-airport-step-label">' + step.label + '</span>' +
          connector +
          '</li>'
        );
      })
      .join('');

    if (hintMount && data.AIRPORT_NEXT_ACTION_HINT) {
      hintMount.textContent = data.AIRPORT_NEXT_ACTION_HINT;
    }
  }

  function initAssistant() {
    var mount = document.getElementById('ksiaAirportAssistant');
    var items = data.AIRPORT_ASSISTANT_SUGGESTIONS || [];
    if (!mount || !items.length) return;

    mount.innerHTML = items
      .map(function (item) {
        return (
          '<li><a href="' + resolveHref(item.href) + '" class="ksia-at-airport-assistant-row" data-ksia-assistant-link>' +
          '<span class="ksia-at-airport-assistant-icon" aria-hidden="true">' + (item.icon || '&#10022;') + '</span>' +
          '<span class="ksia-at-airport-assistant-body">' +
          '<span class="ksia-at-airport-assistant-title">' + item.title + '</span>' +
          '<span class="ksia-at-airport-assistant-desc">' + item.desc + '</span>' +
          '</span>' +
          '<span class="ksia-at-airport-assistant-arrow" aria-hidden="true">&rarr;</span>' +
          '</a></li>'
        );
      })
      .join('');

    mount.querySelectorAll('[data-ksia-assistant-link]').forEach(function (el) {
      el.addEventListener('click', function () {
        if (window.KsiaLabEvents) {
          window.KsiaLabEvents.emit('ksia.aivc.suggestion.click', {
            label: el.querySelector('.ksia-at-airport-assistant-title').textContent.trim(),
          });
        }
      });
    });
  }

  function initServices() {
    var mount = document.getElementById('ksiaAirportServices');
    var items = data.AIRPORT_SERVICES_GRID || [];
    if (!mount || !items.length) return;

    mount.innerHTML = items
      .map(function (item) {
        return (
          '<li><a href="' + resolveHref(item.href) + '" class="ksia-at-airport-service-card" data-ksia-service-link>' +
          '<span class="ksia-at-airport-service-icon" aria-hidden="true">' + (item.icon || '&#9679;') + '</span>' +
          '<span class="ksia-at-airport-service-label">' + item.label + '</span>' +
          '</a></li>'
        );
      })
      .join('');

    mount.querySelectorAll('[data-ksia-service-link]').forEach(function (el) {
      el.addEventListener('click', function () {
        if (window.KsiaLabEvents) {
          window.KsiaLabEvents.emit('ksia.airport.service.click', { label: el.textContent.trim() });
        }
      });
    });
  }

  function initTerminals() {
    var mount = document.getElementById('ksiaAirportTerminals');
    var terminals = data.AIRPORT_TERMINALS || [];
    if (!mount || !terminals.length) return;

    mount.innerHTML = terminals
      .map(function (t) {
        var featured = t.featured ? ' ksia-at-airport-terminal-card--featured' : ' ksia-at-airport-terminal-card--compact';
        var desc = t.desc ? '<p class="ksia-at-airport-terminal-desc">' + t.desc + '</p>' : '';
        return (
          '<a href="' + resolveHref(t.href) + '" class="ksia-at-airport-terminal-card' + featured + '">' +
          '<span class="ksia-at-airport-terminal-name">' + t.name + '</span>' +
          desc +
          '<span class="ksia-at-airport-terminal-cta">' + (t.featured ? 'Explore terminal' : 'View') + ' &rarr;</span>' +
          '</a>'
        );
      })
      .join('');
  }

  function initLinks() {
    var guideLink = document.getElementById('ksiaTerminalGuideLink');
    if (guideLink) guideLink.setAttribute('href', resolveHref('at-the-airport/terminal-guide.html'));
  }

  function boot() {
    initHero();
    initFlightLookup();
    initWayfinding();
    initSecurity();
    initStepper();
    initAssistant();
    initServices();
    initTerminals();
    initLinks();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
