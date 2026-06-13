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

  function renderAssistantActions(mount, actions) {
    if (!mount || !actions || !actions.length) return;
    mount.innerHTML = actions
      .map(function (a) {
        var href = a.href && a.href.indexOf('#') === 0 ? a.href : resolveHref(a.href || '');
        return (
          '<a href="' + href + '" class="ksia-board-assistant-action">' +
          '<span class="ksia-board-assistant-action-icon" aria-hidden="true">' + (a.icon || '') + '</span>' +
          '<span>' + a.label + '</span></a>'
        );
      })
      .join('');
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

    var assistant = data.AIVC_ASSISTANT;
    if (assistant) {
      var aTitle = document.getElementById('ksiaAivcAssistantTitle');
      var aLead = document.getElementById('ksiaAivcAssistantLead');
      var aRec = document.getElementById('ksiaAivcAssistantRec');
      if (aTitle) aTitle.textContent = assistant.title;
      if (aLead) aLead.textContent = assistant.lead;
      if (aRec) aRec.textContent = assistant.recommendation || '';
      renderAssistantActions(document.getElementById('ksiaAivcAssistantActions'), assistant.actions);
    }

    var timelineMount = document.getElementById('ksiaAivcTimeline');
    var timeline = data.AIVC_JOURNEY_TIMELINE || [];
    if (timelineMount) {
      timelineMount.innerHTML = timeline
        .map(function (t) {
          var stateClass = t.state === 'current' ? ' ksia-aivc-timeline-item--current' : t.state === 'done' ? ' ksia-aivc-timeline-item--done' : '';
          var items = (t.items || [])
            .map(function (item) {
              return '<li>' + item + '</li>';
            })
            .join('');
          return (
            '<li class="ksia-aivc-timeline-item' + stateClass + '">' +
            '<div class="ksia-aivc-timeline-marker" aria-hidden="true"></div>' +
            '<div class="ksia-aivc-timeline-body">' +
            '<div class="ksia-aivc-timeline-head">' +
            '<span class="ksia-aivc-timeline-label">' + t.label + '</span>' +
            '<span class="ksia-aivc-timeline-when">' + t.when + '</span></div>' +
            '<p class="ksia-aivc-timeline-summary">' + t.summary + '</p>' +
            '<ul class="ksia-aivc-timeline-items">' + items + '</ul>' +
            (t.href ? '<a href="' + resolveHref(t.href) + '" class="ksia-at-airport-inline-link">Explore ' + t.label.toLowerCase() + ' &rarr;</a>' : '') +
            '</div></li>'
          );
        })
        .join('');
    }

    var potMount = document.getElementById('ksiaAivcPotGrid');
    var pots = data.AIVC_POT_MODULES || [];
    if (potMount) {
      potMount.innerHTML = pots
        .map(function (p) {
          var stubClass = p.stub ? ' ksia-aivc-pot-card--stub' : '';
          var stubBadge = p.stub ? '<span class="ksia-transport-stub-badge">Stub</span>' : '';
          return (
            '<li><a href="' + resolveHref(p.href) + '" class="ksia-aivc-pot-card' + stubClass + '">' +
            stubBadge +
            '<span class="ksia-aivc-pot-badge">' + p.badge + '</span>' +
            '<span class="ksia-aivc-pot-icon" aria-hidden="true">' + p.icon + '</span>' +
            '<span class="ksia-aivc-pot-title">' + p.title + '</span>' +
            '<span class="ksia-aivc-pot-desc">' + p.desc + '</span>' +
            '<span class="ksia-aivc-pot-arrow" aria-hidden="true">&rarr;</span></a></li>'
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

  function renderBoardingPass(mount, pass) {
    if (!mount || !pass) return;
    mount.innerHTML =
      '<div class="ksia-aivc-boarding-pass-inner">' +
      '<div class="ksia-aivc-boarding-pass-header">' +
      '<span class="ksia-aivc-boarding-pass-airline">Saudia</span>' +
      '<span class="ksia-aivc-boarding-pass-status">' + pass.status + '</span></div>' +
      '<p class="ksia-aivc-boarding-pass-route">' + pass.route + '</p>' +
      '<dl class="ksia-aivc-boarding-pass-meta">' +
      '<div><dt>Passenger</dt><dd>' + pass.passenger + '</dd></div>' +
      '<div><dt>Flight</dt><dd>' + pass.flight + '</dd></div>' +
      '<div><dt>Date</dt><dd>' + pass.date + '</dd></div>' +
      '<div><dt>Departure</dt><dd>' + pass.departure + '</dd></div>' +
      '<div><dt>Gate</dt><dd>' + pass.gate + '</dd></div>' +
      '<div><dt>Seat</dt><dd>' + pass.seat + '</dd></div>' +
      '<div><dt>Terminal</dt><dd>' + pass.terminal + '</dd></div>' +
      '<div><dt>Sequence</dt><dd>' + pass.sequence + '</dd></div>' +
      '</dl>' +
      '<div class="ksia-aivc-boarding-pass-barcode" aria-hidden="true"></div>' +
      '</div>';
  }

  function initWalletSetup() {
    var pass = data.WALLET_BOARDING_PASS;
    renderBoardingPass(document.getElementById('ksiaWalletBoardingPass'), pass);

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

    var paymentMount = document.getElementById('ksiaWalletPaymentMethods');
    var payments = data.WALLET_PAYMENT_METHODS || [];
    if (paymentMount) {
      paymentMount.innerHTML = payments
        .map(function (p) {
          var statusClass = ' ksia-aivc-payment-item--' + p.status;
          return (
            '<li class="ksia-aivc-payment-item' + statusClass + '">' +
            '<span class="ksia-aivc-payment-label">' + p.label + '</span>' +
            '<span class="ksia-aivc-payment-detail">' + p.detail + '</span></li>'
          );
        })
        .join('');
    }

    var walletAssistant = data.WALLET_ASSISTANT;
    if (walletAssistant) {
      var wTitle = document.getElementById('ksiaWalletAssistantTitle');
      var wLead = document.getElementById('ksiaWalletAssistantLead');
      if (wTitle) wTitle.textContent = walletAssistant.title;
      if (wLead) wLead.textContent = walletAssistant.lead;
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

    var paymentBtn = document.getElementById('ksiaWalletPaymentBtn');
    if (paymentBtn) {
      paymentBtn.addEventListener('click', function () {
        if (window.KsiaLabEvents) {
          window.KsiaLabEvents.emit('ksia.aivc.wallet.payment', { action: 'link' });
        }
        paymentBtn.textContent = 'Payment linked (mock)';
        paymentBtn.disabled = true;
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
    if (flight) flight.textContent = scenario.flight + ' · ' + scenario.route + ' · ' + scenario.terminal;

    var timelineMount = document.getElementById('ksiaDisruptionTimeline');
    var timeline = data.DISRUPTION_TIMELINE || [];
    if (timelineMount) {
      timelineMount.innerHTML = timeline
        .map(function (t) {
          var typeClass = t.type ? ' ksia-aivc-disruption-timeline-item--' + t.type : '';
          return (
            '<li class="ksia-aivc-disruption-timeline-item' + typeClass + '">' +
            '<span class="ksia-aivc-disruption-timeline-time">' + t.time + '</span>' +
            '<div class="ksia-aivc-disruption-timeline-body">' +
            '<span class="ksia-aivc-disruption-timeline-label">' + t.label + '</span>' +
            '<p class="ksia-aivc-disruption-timeline-detail">' + t.detail + '</p></div></li>'
          );
        })
        .join('');
    }

    var assistant = data.DISRUPTION_ASSISTANT;
    if (assistant) {
      var dTitle = document.getElementById('ksiaDisruptionAssistantTitle');
      var dLead = document.getElementById('ksiaDisruptionAssistantLead');
      if (dTitle) dTitle.textContent = assistant.title;
      if (dLead) dLead.textContent = assistant.lead;
      renderAssistantActions(document.getElementById('ksiaDisruptionAssistantActions'), assistant.actions);
    }

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

    var rebookNote = document.getElementById('ksiaDisruptionRebookingNote');
    if (rebookNote && data.DISRUPTION_REBOOKING_NOTE) {
      rebookNote.textContent = data.DISRUPTION_REBOOKING_NOTE;
    }

    var altMount = document.getElementById('ksiaDisruptionAlternatives');
    if (altMount && scenario.alternatives) {
      altMount.innerHTML =
        '<table class="ksia-board-table ksia-aivc-alt-table"><thead><tr>' +
        '<th>Flight</th><th>Departure</th><th>Seats</th><th>Status</th><th></th>' +
        '</tr></thead><tbody>' +
        scenario.alternatives
          .map(function (a, i) {
            return (
              '<tr><td>' + a.flight + '</td><td>' + a.time + '</td><td>' + a.seats + '</td>' +
              '<td><span class="ksia-status">' + a.status + '</span></td>' +
              '<td><button type="button" class="ksia-btn ksia-btn-secondary ksia-aivc-alt-btn" data-ksia-alt-index="' + i + '">Select</button></td></tr>'
            );
          })
          .join('') +
        '</tbody></table>';
      altMount.querySelectorAll('.ksia-aivc-alt-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var idx = btn.getAttribute('data-ksia-alt-index');
          var alt = scenario.alternatives[Number(idx)];
          if (window.KsiaLabEvents && alt) {
            window.KsiaLabEvents.emit('ksia.aivc.disruption.rebook', { flight: alt.flight, time: alt.time });
          }
          altMount.querySelectorAll('.ksia-aivc-alt-btn').forEach(function (b) {
            b.textContent = 'Select';
            b.disabled = false;
          });
          btn.textContent = 'Selected';
          btn.disabled = true;
        });
      });
    }

    var retail = document.getElementById('ksiaDisruptionRetailLink');
    if (retail) {
      retail.href = resolveHref(scenario.retailLink);
      retail.textContent = scenario.retailNote;
    }

    var conciergeBtn = document.getElementById('ksiaDisruptionConciergeCta');
    if (conciergeBtn) {
      conciergeBtn.addEventListener('click', function () {
        if (window.KsiaLabEvents) {
          window.KsiaLabEvents.emitAivcAction('disruption-concierge');
        }
      });
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
