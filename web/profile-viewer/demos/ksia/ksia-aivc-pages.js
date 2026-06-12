/**
 * KSIA AIVC section — companion hub, wallet setup, disruption compensation.
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

  function initAivcHub() {
    var hero = data.AIVC_HERO;
    if (hero) {
      var kicker = document.getElementById('ksiaAivcHeroKicker');
      var summary = document.getElementById('ksiaAivcTripSummary');
      var stage = document.getElementById('ksiaAivcHeroStage');
      var status = document.getElementById('ksiaAivcHeroStatus');
      if (kicker) kicker.textContent = hero.kicker;
      if (summary) summary.textContent = hero.tripSummary;
      if (stage) stage.textContent = hero.stage;
      if (status) status.textContent = hero.status;
    }

    var stagesMount = document.getElementById('ksiaAivcJourneyStages');
    var stages = data.AIVC_JOURNEY_STAGES || [];
    if (stagesMount) {
      stagesMount.innerHTML = stages
        .map(function (s, i) {
          var stateClass = s.state === 'current' ? ' ksia-aivc-stage--current' : s.state === 'done' ? ' ksia-aivc-stage--done' : '';
          var connector = i < stages.length - 1 ? '<span class="ksia-aivc-stage-connector" aria-hidden="true"></span>' : '';
          return (
            '<li class="ksia-aivc-stage' + stateClass + '">' +
            '<span class="ksia-aivc-stage-dot" aria-hidden="true"></span>' +
            '<span class="ksia-aivc-stage-label">' + s.label + '</span>' +
            '<span class="ksia-aivc-stage-desc">' + s.desc + '</span>' +
            connector + '</li>'
          );
        })
        .join('');
    }

    var actionsMount = document.getElementById('ksiaAivcNextActions');
    var actions = data.AIVC_NEXT_ACTIONS || [];
    if (actionsMount) {
      actionsMount.innerHTML = actions
        .map(function (a) {
          var pri = a.priority === 'high' ? ' ksia-aivc-action-row--high' : '';
          return (
            '<li><a href="' + resolveHref(a.href) + '" class="ksia-aivc-action-row' + pri + '">' +
            '<span class="ksia-aivc-action-icon" aria-hidden="true">' + a.icon + '</span>' +
            '<span class="ksia-aivc-action-body">' +
            '<span class="ksia-aivc-action-title">' + a.title + '</span>' +
            '<span class="ksia-aivc-action-desc">' + a.desc + '</span></span>' +
            '<span class="ksia-aivc-action-arrow" aria-hidden="true">&rarr;</span></a></li>'
          );
        })
        .join('');
    }

    var servicesMount = document.getElementById('ksiaAivcServicesGrid');
    var services = data.AIVC_CONNECTED_SERVICES || [];
    if (servicesMount) {
      servicesMount.innerHTML = services
        .map(function (s) {
          return (
            '<li><a href="' + resolveHref(s.href) + '" class="ksia-aivc-service-card">' +
            '<span class="ksia-aivc-service-icon" aria-hidden="true">' + s.icon + '</span>' +
            '<span class="ksia-aivc-service-label">' + s.label + '</span>' +
            '<span class="ksia-aivc-service-partner">' + s.partner + '</span></a></li>'
          );
        })
        .join('');
    }

    var preview = data.AIVC_WALLET_PREVIEW;
    if (preview) {
      var itemsMount = document.getElementById('ksiaAivcWalletItems');
      var progress = document.getElementById('ksiaAivcWalletProgress');
      if (itemsMount) {
        itemsMount.innerHTML = preview.items
          .map(function (item) {
            var statusClass = ' ksia-aivc-wallet-item--' + item.status;
            return (
              '<li class="ksia-aivc-wallet-item' + statusClass + '">' +
              '<span class="ksia-aivc-wallet-item-label">' + item.label + '</span>' +
              '<span class="ksia-aivc-wallet-item-value">' + item.value + '</span></li>'
            );
          })
          .join('');
      }
      if (progress) {
        progress.textContent = preview.progress + ' of ' + preview.total + ' complete';
        progress.setAttribute('aria-valuenow', String(preview.progress));
        progress.setAttribute('aria-valuemax', String(preview.total));
      }
      var bar = document.getElementById('ksiaAivcWalletProgressBar');
      if (bar && preview.total) {
        bar.style.width = Math.round((preview.progress / preview.total) * 100) + '%';
      }
    }

    var trustMount = document.getElementById('ksiaAivcTrustBand');
    var trust = data.AIVC_TRUST_OUTCOMES || [];
    if (trustMount) {
      trustMount.innerHTML = trust
        .map(function (t) {
          return (
            '<div class="ksia-aivc-trust-stat">' +
            '<span class="ksia-aivc-trust-value">' + t.stat + '</span>' +
            '<span class="ksia-aivc-trust-label">' + t.label + '</span></div>'
          );
        })
        .join('');
    }

    var conciergeBtn = document.getElementById('ksiaAivcConciergeCta');
    if (conciergeBtn) {
      conciergeBtn.addEventListener('click', function () {
        if (window.KsiaLabEvents) {
          window.KsiaLabEvents.emitAivcAction('concierge-open');
        }
      });
    }
  }

  function initWalletSetup() {
    var stepsMount = document.getElementById('ksiaWalletSetupSteps');
    var steps = data.WALLET_SETUP_STEPS || [];
    var doneCount = steps.filter(function (s) { return s.done; }).length;

    if (stepsMount) {
      stepsMount.innerHTML = steps
        .map(function (s, i) {
          var doneClass = s.done ? ' ksia-aivc-wallet-step--done' : '';
          var check = s.done ? '&#10003;' : String(i + 1);
          return (
            '<li class="ksia-aivc-wallet-step' + doneClass + '">' +
            '<span class="ksia-aivc-wallet-step-num" aria-hidden="true">' + check + '</span>' +
            '<span class="ksia-aivc-wallet-step-body">' +
            '<span class="ksia-aivc-wallet-step-label">' + s.label + '</span>' +
            '<span class="ksia-aivc-wallet-step-desc">' + s.desc + '</span></span></li>'
          );
        })
        .join('');
    }

    var progress = document.getElementById('ksiaWalletSetupProgress');
    if (progress) progress.textContent = doneCount + ' of ' + steps.length + ' complete';

    var prefs = data.WALLET_PREFERENCES || {};
    var lang = document.getElementById('ksiaWalletPrefLanguage');
    if (lang && prefs.languages) {
      lang.innerHTML = prefs.languages.map(function (l) {
        return '<option value="' + l + '">' + l + '</option>';
      }).join('');
    }

    var notifMount = document.getElementById('ksiaWalletPrefNotifications');
    if (notifMount && prefs.notifications) {
      notifMount.innerHTML = prefs.notifications
        .map(function (n, i) {
          var checked = i < 2 ? ' checked' : '';
          return (
            '<label class="ksia-aivc-pref-check"><input type="checkbox" name="notification" value="' + n + '"' + checked + '> ' + n + '</label>'
          );
        })
        .join('');
    }

    var dietMount = document.getElementById('ksiaWalletPrefDietary');
    if (dietMount && prefs.dietary) {
      dietMount.innerHTML = prefs.dietary
        .map(function (d, i) {
          var checked = i === 0 ? ' checked' : '';
          return (
            '<label class="ksia-aivc-pref-check"><input type="checkbox" name="dietary" value="' + d + '"' + checked + '> ' + d + '</label>'
          );
        })
        .join('');
    }

    var nafathBtn = document.getElementById('ksiaWalletNafathBtn');
    if (nafathBtn) {
      nafathBtn.addEventListener('click', function () {
        if (window.KsiaLabEvents) {
          window.KsiaLabEvents.emit('ksia.aivc.wallet.nafath', { step: 'verify' });
        }
        nafathBtn.textContent = 'Identity verified (mock)';
        nafathBtn.disabled = true;
      });
    }

    var completeBtn = document.getElementById('ksiaWalletCompleteBtn');
    if (completeBtn) {
      completeBtn.addEventListener('click', function () {
        if (window.KsiaLabEvents) {
          window.KsiaLabEvents.emitAivcAction('wallet-setup-complete');
        }
        completeBtn.textContent = 'Setup saved (mock)';
      });
    }
  }

  function initDisruption() {
    var scenario = data.DISRUPTION_SCENARIO;
    if (!scenario) return;

    var banner = document.getElementById('ksiaDisruptionBanner');
    if (banner) {
      banner.innerHTML =
        '<div class="ksia-aivc-disruption-banner-inner">' +
        '<span class="ksia-aivc-disruption-icon" aria-hidden="true">&#9888;</span>' +
        '<div class="ksia-aivc-disruption-banner-copy">' +
        '<p class="ksia-aivc-disruption-banner-title">Proactive alert: ' + scenario.flight + ' delayed ' + scenario.delay + '</p>' +
        '<p class="ksia-aivc-disruption-banner-lead">' + scenario.route + ' — revised departure ' + scenario.revisedDeparture + ' (was ' + scenario.originalDeparture + ').</p>' +
        '</div></div>';
    }

    var flight = document.getElementById('ksiaDisruptionFlight');
    if (flight) flight.textContent = scenario.flight + ' · ' + scenario.route;

    var voucher = document.getElementById('ksiaDisruptionVoucher');
    if (voucher) {
      voucher.innerHTML =
        '<p class="ksia-aivc-voucher-amount">' + scenario.voucherAmount + '</p>' +
        '<p class="ksia-aivc-voucher-code">Code: <strong>' + scenario.voucherCode + '</strong></p>' +
        '<button type="button" class="ksia-btn ksia-btn-primary" id="ksiaDisruptionClaimBtn">Claim voucher (mock)</button>';
      var claimBtn = document.getElementById('ksiaDisruptionClaimBtn');
      if (claimBtn) {
        claimBtn.addEventListener('click', function () {
          if (window.KsiaLabEvents) {
            window.KsiaLabEvents.emit('ksia.aivc.disruption.claim', { flight: scenario.flight });
          }
          claimBtn.textContent = 'Added to wallet';
          claimBtn.disabled = true;
        });
      }
    }

    var altMount = document.getElementById('ksiaDisruptionAlternatives');
    if (altMount && scenario.alternatives) {
      altMount.innerHTML =
        '<table class="ksia-board-table ksia-aivc-alt-table"><thead><tr>' +
        '<th>Flight</th><th>Departure</th><th>Seats</th><th>Status</th><th></th>' +
        '</tr></thead><tbody>' +
        scenario.alternatives
          .map(function (a) {
            return (
              '<tr><td>' + a.flight + '</td><td>' + a.time + '</td><td>' + a.seats + '</td>' +
              '<td><span class="ksia-status">' + a.status + '</span></td>' +
              '<td><button type="button" class="ksia-btn ksia-btn-secondary ksia-aivc-alt-btn">Select</button></td></tr>'
            );
          })
          .join('') +
        '</tbody></table>';
    }

    var retail = document.getElementById('ksiaDisruptionRetailLink');
    if (retail) {
      retail.href = resolveHref(scenario.retailLink);
      retail.textContent = scenario.retailNote;
    }
  }

  function init() {
    var id = pageId();
    if (id === 'aivc-hub') initAivcHub();
    if (id === 'wallet-setup') initWalletSetup();
    if (id === 'disruption-compensation') initDisruption();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
