/**
 * KSIA AIVC native mobile app — navigation, mock data, postMessage bridge.
 *
 * SDK / Tags hooks:
 * - #brand-concierge-mobile-mount — Brand Concierge inject target inside app shell
 * - window.postMessage to parent: { source: 'ksia-mobile-lab', type: 'ksia-experience-event', payload }
 * - Listens for parent: { source: 'ksia-mobile-lab-parent', type: 'sdk-injected' }
 */
(function () {
  'use strict';

  var PAGE_ID = document.body && document.body.getAttribute('data-ksia-mobile-page');
  var data = window.KsiaMockData || {};

  function postExperienceEvent(eventType, extra) {
    var payload = {
      eventType: eventType || 'ksia.mobile.page.view',
      viewName: 'KSIA mobile · ' + (PAGE_ID || 'app'),
      viewUrl: location.href.split('?')[0],
      channel: 'Mobile App',
      public: extra && typeof extra === 'object' ? extra : {},
    };
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(
          { source: 'ksia-mobile-lab', type: 'ksia-experience-event', payload: payload },
          '*',
        );
      }
    } catch (_) {
      /* cross-origin guard */
    }
  }

  function bindBcFab() {
    var fab = document.getElementById('ksiaMobileBcFab');
    var mount = document.getElementById('brand-concierge-mobile-mount');
    if (!fab) return;
    fab.addEventListener('click', function () {
      postExperienceEvent('ksia.mobile.concierge.open', { action: 'open_concierge' });
      if (mount && mount.children.length) {
        mount.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }
      /* Navigate to concierge hub when BC not yet injected */
      if (PAGE_ID !== 'concierge') {
        window.location.href = 'concierge.html?aepSimMobile=1';
      }
    });
  }

  function renderTabBar() {
    var mount = document.getElementById('ksiaMobileTabBar');
    if (!mount) return;
    var tabs = [
      { id: 'home', label: 'Home', href: 'index.html', icon: '\u2302' },
      { id: 'trip', label: 'Trip', href: 'trip.html', icon: '\u2708' },
      { id: 'wallet', label: 'Wallet', href: 'wallet.html', icon: '\uD83D\uDCB3' },
      { id: 'concierge', label: 'Concierge', href: 'concierge.html', icon: '\u2728' },
      { id: 'notifications', label: 'Alerts', href: 'notifications.html', icon: '\uD83D\uDD14' },
    ];
    mount.innerHTML = tabs
      .map(function (t) {
        var active = t.id === PAGE_ID ? ' is-active' : '';
        var href = t.href.indexOf('?') >= 0 ? t.href : t.href + '?aepSimMobile=1';
        return (
          '<a href="' +
          href +
          '" class="ksia-mobile-tab' +
          active +
          '" aria-current="' +
          (active ? 'page' : 'false') +
          '">' +
          '<span class="ksia-mobile-tab-icon" aria-hidden="true">' +
          t.icon +
          '</span>' +
          '<span>' +
          t.label +
          '</span></a>'
        );
      })
      .join('');
  }

  function fillHero() {
    var hero = data.AIVC_HERO;
    if (!hero) return;
    var els = {
      kicker: document.getElementById('ksiaMobileHeroKicker'),
      flight: document.getElementById('ksiaMobileHeroFlight'),
      meta: document.getElementById('ksiaMobileHeroMeta'),
      badge: document.getElementById('ksiaMobileHeroBadge'),
    };
    if (els.kicker) els.kicker.textContent = hero.kicker || 'Your AIVC companion';
    if (els.flight) els.flight.textContent = hero.tripSummary || '';
    if (els.meta) els.meta.textContent = hero.stage || '';
    if (els.badge) els.badge.textContent = hero.status || '';
  }

  function fillStages() {
    var mount = document.getElementById('ksiaMobileStages');
    var stages = data.AIVC_JOURNEY_STAGES || [];
    if (!mount) return;
    mount.innerHTML = stages
      .map(function (s) {
        var cls = 'ksia-mobile-stage';
        if (s.state === 'current') cls += ' ksia-mobile-stage--current';
        if (s.state === 'done') cls += ' ksia-mobile-stage--done';
        return (
          '<li class="' +
          cls +
          '"><span class="ksia-mobile-stage-dot"></span>' +
          '<span class="ksia-mobile-stage-label">' +
          s.label +
          '</span></li>'
        );
      })
      .join('');
  }

  function fillAssistant() {
    var assistant = data.AIVC_ASSISTANT;
    if (!assistant) return;
    var title = document.getElementById('ksiaMobileAssistantTitle');
    var lead = document.getElementById('ksiaMobileAssistantLead');
    var rec = document.getElementById('ksiaMobileAssistantRec');
    var actions = document.getElementById('ksiaMobileAssistantActions');
    if (title) title.textContent = assistant.title || 'Your companion';
    if (lead) lead.textContent = assistant.lead || '';
    if (rec) rec.textContent = assistant.recommendation || '';
    if (actions && assistant.actions) {
      actions.innerHTML = assistant.actions
        .map(function (a) {
          return (
            '<a href="#" class="ksia-mobile-action" data-action="' +
            a.label +
            '">' +
            '<span class="ksia-mobile-action-icon">' +
            (a.icon || '') +
            '</span>' +
            '<span class="ksia-mobile-action-body">' +
            '<p class="ksia-mobile-action-title">' +
            a.label +
            '</p></span>' +
            '<span class="ksia-mobile-action-chevron" aria-hidden="true">\u203A</span></a>'
          );
        })
        .join('');
      actions.querySelectorAll('[data-action]').forEach(function (el) {
        el.addEventListener('click', function (e) {
          e.preventDefault();
          postExperienceEvent('ksia.mobile.assistant.action', { action: el.getAttribute('data-action') });
        });
      });
    }
  }

  function fillNextActions() {
    var mount = document.getElementById('ksiaMobileNextActions');
    var actions = data.AIVC_NEXT_ACTIONS || [];
    if (!mount) return;
    mount.innerHTML = actions
      .map(function (a) {
        return (
          '<li><a href="#" class="ksia-mobile-action" data-action="' +
          a.title +
          '">' +
          '<span class="ksia-mobile-action-icon">' +
          (a.icon || '') +
          '</span>' +
          '<span class="ksia-mobile-action-body">' +
          '<p class="ksia-mobile-action-title">' +
          a.title +
          '</p>' +
          '<p class="ksia-mobile-action-desc">' +
          a.desc +
          '</p></span>' +
          '<span class="ksia-mobile-action-chevron" aria-hidden="true">\u203A</span></a></li>'
        );
      })
      .join('');
    mount.querySelectorAll('[data-action]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        postExperienceEvent('ksia.mobile.next_action', { action: el.getAttribute('data-action') });
      });
    });
  }

  function fillWallet() {
    var wallet = data.AIVC_WALLET_PREVIEW;
    if (!wallet) return;
    var bar = document.getElementById('ksiaMobileWalletBar');
    var items = document.getElementById('ksiaMobileWalletItems');
    var pct = document.getElementById('ksiaMobileWalletPct');
    if (pct && wallet.total) {
      pct.textContent = Math.round((wallet.progress / wallet.total) * 100) + '%';
    }
    if (bar && wallet.total) {
      bar.style.width = Math.round((wallet.progress / wallet.total) * 100) + '%';
    }
    if (items && wallet.items) {
      items.innerHTML = wallet.items
        .map(function (item) {
          var statusCls = 'ksia-mobile-wallet-status';
          if (item.status === 'ready') statusCls += ' ksia-mobile-wallet-status--ready';
          else if (item.status === 'partial') statusCls += ' ksia-mobile-wallet-status--partial';
          else statusCls += ' ksia-mobile-wallet-status--pending';
          return (
            '<li class="ksia-mobile-wallet-item">' +
            '<span>' +
            item.label +
            '</span>' +
            '<span class="' +
            statusCls +
            '">' +
            item.status +
            '</span></li>'
          );
        })
        .join('');
    }
  }

  function fillNotifications() {
    var mount = document.getElementById('ksiaMobileNotifications');
    if (!mount) return;
    var notifs = [
      {
        title: 'Gate confirmed — B12',
        body: 'SV 123 boarding starts 16:35. AIVC saved 12 min via e-gate wallet.',
        time: '2h ago',
        unread: true,
      },
      {
        title: 'Complete wallet setup',
        body: 'Add dietary preferences and notification settings before departure.',
        time: '5h ago',
        unread: true,
      },
      {
        title: 'Parking reminder',
        body: 'Pre-book P1 short-stay for Terminal 1 — recommended for SV 123.',
        time: 'Yesterday',
        unread: false,
      },
    ];
    mount.innerHTML = notifs
      .map(function (n) {
        return (
          '<div class="ksia-mobile-notif-item">' +
          (n.unread ? '<span class="ksia-mobile-notif-dot" aria-hidden="true"></span>' : '<span style="width:8px;flex-shrink:0"></span>') +
          '<div><p class="ksia-mobile-notif-title">' +
          n.title +
          '</p><p class="ksia-mobile-notif-body">' +
          n.body +
          '</p><p class="ksia-mobile-notif-time">' +
          n.time +
          '</p></div></div>'
        );
      })
      .join('');
  }

  function initPage() {
    renderTabBar();
    bindBcFab();
    fillHero();
    fillStages();
    fillAssistant();
    fillNextActions();
    fillWallet();
    fillNotifications();
    postExperienceEvent('ksia.mobile.page.view', { page: PAGE_ID });
  }

  window.addEventListener('message', function (ev) {
    if (!ev.data || ev.data.source !== 'ksia-mobile-lab-parent') return;
    if (ev.data.type === 'sdk-injected') {
      var hint = document.getElementById('ksiaMobileSdkHint');
      if (hint) hint.hidden = true;
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPage);
  } else {
    initPage();
  }
})();
