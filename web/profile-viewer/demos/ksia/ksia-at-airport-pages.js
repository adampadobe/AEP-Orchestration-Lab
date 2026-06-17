/**
 * KSIA at-the-airport subpages — terminal guide, maps, security, services.
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

  function catalogHref(productId) {
    if (!productId) return '';
    return resolveHref('products/product.html?id=' + encodeURIComponent(productId));
  }

  function pageId() {
    return document.body && document.body.getAttribute('data-ksia-page-id');
  }

  function initTerminalGuide() {
    var airlines = data.TERMINAL_GUIDE_AIRLINES || [];
    var listMount = document.getElementById('ksiaTerminalGuideList');
    var select = document.getElementById('ksiaTerminalGuideSelect');
    var form = document.getElementById('ksiaTerminalGuideForm');
    var resultMount = document.getElementById('ksiaTerminalGuideResult');

    if (listMount) {
      listMount.innerHTML = airlines
        .map(function (a) {
          return (
            '<li><button type="button" class="ksia-terminal-guide-airline" data-airline-code="' + a.code + '">' +
            '<span class="ksia-terminal-guide-code">' + a.code + '</span>' +
            '<span class="ksia-terminal-guide-name">' + a.name + '</span></button></li>'
          );
        })
        .join('');

      listMount.querySelectorAll('[data-airline-code]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var code = btn.getAttribute('data-airline-code');
          if (select) select.value = code;
          renderGuideResult(code, resultMount, airlines);
        });
      });
    }

    if (select) {
      select.innerHTML =
        '<option value="">Select airline</option>' +
        airlines
          .map(function (a) {
            return '<option value="' + a.code + '">' + a.name + ' (' + a.code + ')</option>';
          })
          .join('');
    }

    function renderGuideResult(code, mount, list) {
      if (!mount) return;
      var match = list.find(function (a) {
        return a.code === code;
      });
      if (!match) {
        mount.innerHTML = '<p class="ksia-terminal-guide-empty">Select an airline to see terminal assignment.</p>';
        return;
      }
      mount.innerHTML =
        '<div class="ksia-terminal-guide-result-card">' +
        '<p class="ksia-terminal-guide-result-kicker">' + match.name + ' (' + match.code + ')</p>' +
        '<p class="ksia-terminal-guide-result-terminal">' + match.terminal + '</p>' +
        '<p class="ksia-terminal-guide-result-note">' + match.note + '</p>' +
        '<a href="' + resolveHref('at-the-airport/maps.html') + '" class="ksia-btn ksia-btn-primary ksia-terminal-guide-map-cta">Open terminal map</a>' +
        '</div>';
      if (window.KsiaLabEvents) {
        window.KsiaLabEvents.emit('ksia.airport.terminal.lookup', { airline: match.code });
      }
    }

    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        renderGuideResult(select ? select.value : '', resultMount, airlines);
      });
    }

    if (airlines.length && resultMount) {
      renderGuideResult(airlines[0].code, resultMount, airlines);
      if (select) select.value = airlines[0].code;
    }
  }

  function initTerminalDetail(pageId) {
    var num = pageId.replace('terminal-', '');
    var detail = data['TERMINAL_' + num + '_DETAIL'];
    if (!detail) return;

    var tagline = document.getElementById('ksiaTerminal' + num + 'Tagline');
    if (tagline) tagline.textContent = detail.tagline;

    var preview = document.getElementById('ksiaTerminal' + num + 'Preview');
    if (preview && detail.preview) preview.hidden = false;

    var mapLabel = document.getElementById('ksiaTerminal' + num + 'MapLabel');
    if (mapLabel) mapLabel.textContent = detail.gatesMapLabel;

    var amenities = document.getElementById('ksiaTerminal' + num + 'Amenities');
    if (amenities && detail.amenities) {
      amenities.innerHTML = detail.amenities
        .map(function (a) {
          return (
            '<li class="ksia-terminal-detail-item">' +
            '<span class="ksia-terminal-detail-label">' + a.label + '</span>' +
            '<span class="ksia-terminal-detail-desc">' + a.desc + '</span></li>'
          );
        })
        .join('');
    }

    var shops = document.getElementById('ksiaTerminal' + num + 'Shops');
    if (shops && detail.shops) {
      shops.innerHTML = detail.shops
        .map(function (s) {
          return (
            '<li class="ksia-terminal-shop-card">' +
            '<span class="ksia-terminal-shop-type">' + s.type + '</span>' +
            '<span class="ksia-terminal-shop-name">' + s.name + '</span>' +
            '<span class="ksia-terminal-shop-note">' + s.note + '</span></li>'
          );
        })
        .join('');
    }

    var lounge = document.getElementById('ksiaTerminal' + num + 'Lounge');
    if (lounge && detail.lounge) {
      lounge.innerHTML =
        '<h3 class="ksia-terminal-lounge-name">' + detail.lounge.name + '</h3>' +
        '<p class="ksia-terminal-lounge-desc">' + detail.lounge.desc + '</p>' +
        '<a href="' + resolveHref(detail.lounge.href) + '" class="ksia-btn ksia-btn-primary">Explore lounges</a>';
    }

    var waits = document.getElementById('ksiaTerminal' + num + 'Waits');
    if (waits && detail.waitTimes) {
      waits.innerHTML = detail.waitTimes
        .map(function (w) {
          return (
            '<div class="ksia-terminal-wait-card">' +
            '<span class="ksia-terminal-wait-label">' + w.label + '</span>' +
            '<span class="ksia-terminal-wait-time">' + w.time + '</span></div>'
          );
        })
        .join('');
    }
  }

  function initTerminalGuideAssistant() {
    var module = data.TERMINAL_GUIDE_ASSISTANT;
    var mount = document.getElementById('ksiaTerminalGuideAssistant');
    if (!module || !mount) return;

    var tips = (module.tips || [])
      .map(function (t) {
        return '<li>' + t + '</li>';
      })
      .join('');

    mount.innerHTML =
      '<div class="ksia-board-assistant-card">' +
      '<p class="ksia-section-kicker">AIVC assistant</p>' +
      '<h2 class="ksia-display-heading">' + module.title + '</h2>' +
      '<p class="ksia-board-assistant-lead">' + module.lead + '</p>' +
      '<ul class="ksia-board-assistant-tips">' + tips + '</ul>' +
      '<a href="' + resolveHref(module.href) + '" class="ksia-btn ksia-btn-primary">' + module.cta + '</a>' +
      '</div>';
  }

  function initTerminalGuideTerminals() {
    var mount = document.getElementById('ksiaTerminalGuideTerminals');
    var terminals = data.AIRPORT_TERMINALS || [];
    if (!mount || !terminals.length) return;

    mount.innerHTML = terminals
      .map(function (t) {
        var desc = t.desc ? '<p class="ksia-at-airport-terminal-desc">' + t.desc + '</p>' : '';
        return (
          '<a href="' + resolveHref(t.href.replace('at-the-airport/', '')) + '" class="ksia-at-airport-terminal-card ksia-at-airport-terminal-card--compact">' +
          '<span class="ksia-at-airport-terminal-name">' + t.name + '</span>' +
          desc +
          '<span class="ksia-at-airport-terminal-cta">View &rarr;</span></a>'
        );
      })
      .join('');
  }

  function initMaps() {
    var maps = data.MAPS_WAYFINDING;
    if (!maps) return;

    var label = document.getElementById('ksiaMapsMapLabel');
    if (label) label.textContent = maps.mapLabel;

    var search = document.getElementById('ksiaMapsSearch');
    if (search) search.placeholder = maps.searchPlaceholder;

    var steps = document.getElementById('ksiaMapsDirections');
    if (steps && maps.directions) {
      steps.innerHTML = maps.directions.map(function (s) {
        return '<li>' + s + '</li>';
      }).join('');
    }

    var a11y = document.getElementById('ksiaMapsA11yNote');
    if (a11y) a11y.textContent = maps.accessibilityNote;

    var toggle = document.getElementById('ksiaMapsA11yToggle');
    if (toggle) {
      toggle.addEventListener('change', function () {
        if (window.KsiaLabEvents) {
          window.KsiaLabEvents.emit('ksia.maps.accessibility.toggle', { enabled: toggle.checked });
        }
      });
    }

    var form = document.getElementById('ksiaMapsSearchForm');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var q = search ? search.value.trim() : '';
        if (window.KsiaLabEvents) {
          window.KsiaLabEvents.emit('ksia.maps.search', { query: q });
        }
      });
    }

    initMapsAssistant();
  }

  function initMapsAssistant() {
    var module = data.MAPS_ASSISTANT;
    var mount = document.getElementById('ksiaMapsAssistant');
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
  }

  function initSecurity() {
    var sec = data.SECURITY_PAGE;
    if (!sec) return;

    var lanes = document.getElementById('ksiaSecurityLanes');
    if (lanes && sec.lanes) {
      lanes.innerHTML = sec.lanes
        .map(function (lane) {
          return (
            '<div class="ksia-security-lane-card">' +
            '<span class="ksia-security-lane-name">' + lane.name + '</span>' +
            '<span class="ksia-security-lane-wait">' + lane.wait + '</span>' +
            '<p class="ksia-security-lane-note">' + lane.note + '</p></div>'
          );
        })
        .join('');
    }

    var egate = document.getElementById('ksiaSecurityEgate');
    if (egate && sec.egateSteps) {
      egate.innerHTML = sec.egateSteps.map(function (s) {
        return '<li>' + s + '</li>';
      }).join('');
    }

    var checklist = document.getElementById('ksiaSecurityChecklist');
    if (checklist && sec.checklist) {
      checklist.innerHTML = sec.checklist
        .map(function (item) {
          return '<li><label><input type="checkbox"> ' + item + '</label></li>';
        })
        .join('');
    }

    var cta = document.getElementById('ksiaSecurityFastTrack');
    if (cta && sec.fastTrackHref) {
      cta.setAttribute('href', resolveHref(sec.fastTrackHref));
    }

    initSecurityAssistant();
  }

  function initSecurityAssistant() {
    var module = data.SECURITY_ASSISTANT;
    var mount = document.getElementById('ksiaSecurityAssistant');
    if (!module || !mount) return;

    var tips = (module.tips || [])
      .map(function (t) {
        return '<li>' + t + '</li>';
      })
      .join('');

    mount.innerHTML =
      '<div class="ksia-board-assistant-card">' +
      '<p class="ksia-section-kicker">AIVC assistant</p>' +
      '<h2 class="ksia-display-heading">' + module.title + '</h2>' +
      '<p class="ksia-board-assistant-lead">' + module.lead + '</p>' +
      '<ul class="ksia-board-assistant-tips">' + tips + '</ul>' +
      '<a href="' + resolveHref(module.href) + '" class="ksia-btn ksia-btn-primary">' + module.cta + '</a>' +
      '</div>';
  }

  function initServicesHub() {
    var mount = document.getElementById('ksiaServicesHubGrid');
    var items = data.SERVICES_HUB_ITEMS || [];
    if (mount && items.length) {
      mount.innerHTML = items
        .map(function (item) {
          return (
            '<li><a href="' + resolveHref(item.href) + '" class="ksia-services-hub-card">' +
            '<span class="ksia-services-hub-icon" aria-hidden="true">' + (item.icon || '&#9679;') + '</span>' +
            '<span class="ksia-services-hub-label">' + item.label + '</span>' +
            '<span class="ksia-services-hub-desc">' + item.desc + '</span></a></li>'
          );
        })
        .join('');
    }
    initServicesHubAssistant();
  }

  function initServicesHubAssistant() {
    var module = data.SERVICES_HUB_ASSISTANT;
    var mount = document.getElementById('ksiaServicesHubAssistant');
    if (!module || !mount) return;

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
      '<div class="ksia-board-assistant-actions">' + actions + '</div>' +
      '</div>';
  }

  function initLounges() {
    var page = data.LOUNGES_PAGE;
    if (!page) return;

    var tiers = document.getElementById('ksiaLoungesTiers');
    if (tiers && page.tiers) {
      var tierCatalogIds = data.KSIA_CATALOG_LOUNGE_TIER_IDS || {};
      tiers.innerHTML = page.tiers
        .map(function (t) {
          var productId = tierCatalogIds[t.name];
          var nameHtml = productId
            ? '<h3 class="ksia-lounge-tier-name"><a href="' + catalogHref(productId) + '" class="ksia-shop-offer-name-link">' + t.name + '</a></h3>'
            : '<h3 class="ksia-lounge-tier-name">' + t.name + '</h3>';
          var viewLink = productId
            ? '<a href="' + catalogHref(productId) + '" class="ksia-at-airport-inline-link">View product &rarr;</a>'
            : '';
          return (
            '<div class="ksia-lounge-tier-card">' +
            nameHtml +
            '<p class="ksia-lounge-tier-access">' + t.access + '</p>' +
            '<p class="ksia-lounge-tier-perks">' + t.perks + '</p>' +
            viewLink +
            '</div>'
          );
        })
        .join('');
    }

    var rec = document.getElementById('ksiaLoungesRecommendation');
    if (rec && page.recommendation) {
      var r = page.recommendation;
      rec.innerHTML =
        '<p class="ksia-section-kicker">AIVC assistant</p>' +
        '<h2 class="ksia-display-heading">' + r.title + '</h2>' +
        '<p class="ksia-board-assistant-lead">' + r.body + '</p>' +
        '<a href="' + resolveHref(r.href) + '" class="ksia-btn ksia-btn-primary">' + r.cta + '</a>' +
        '<button type="button" class="ksia-btn ksia-btn-secondary ksia-lounge-book-btn" id="ksiaLoungeBookBtn">Book lounge (demo)</button>';
      var bookBtn = document.getElementById('ksiaLoungeBookBtn');
      if (bookBtn) {
        bookBtn.addEventListener('click', function () {
          if (window.KsiaLabEvents) {
            window.KsiaLabEvents.emitAivcAction('lounge-book-demo');
          }
        });
      }
    }
  }

  function initSpecialAssistance() {
    var page = data.SPECIAL_ASSISTANCE_PAGE;
    if (!page) return;

    var steps = document.getElementById('ksiaAssistanceSteps');
    if (steps && page.requestSteps) {
      steps.innerHTML = page.requestSteps.map(function (s, i) {
        return '<li><span class="ksia-assistance-step-num">' + (i + 1) + '</span>' + s + '</li>';
      }).join('');
    }

    var contacts = document.getElementById('ksiaAssistanceContacts');
    if (contacts && page.contacts) {
      contacts.innerHTML = page.contacts
        .map(function (c) {
          return (
            '<div class="ksia-assistance-contact">' +
            '<span class="ksia-assistance-contact-label">' + c.label + '</span>' +
            '<span class="ksia-assistance-contact-value">' + c.value + '</span></div>'
          );
        })
        .join('');
    }

    var support = document.getElementById('ksiaAssistanceSupport');
    if (support && page.journeySupport) {
      support.innerHTML = page.journeySupport.map(function (s) {
        return '<li>' + s + '</li>';
      }).join('');
    }

    var form = document.getElementById('ksiaAssistanceRequestForm');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (window.KsiaLabEvents) {
          window.KsiaLabEvents.emit('ksia.assistance.request', { demo: true });
        }
      });
    }
  }

  function boot() {
    var id = pageId();
    if (id === 'terminal-guide') {
      initTerminalGuide();
      initTerminalGuideTerminals();
      initTerminalGuideAssistant();
    } else if (/^terminal-\d+$/.test(id)) initTerminalDetail(id);
    else if (id === 'maps') initMaps();
    else if (id === 'security') initSecurity();
    else if (id === 'services-hub') initServicesHub();
    else if (id === 'lounges') initLounges();
    else if (id === 'special-assistance') initSpecialAssistance();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
