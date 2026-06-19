/**
 * KSIA AIVC native mobile app — navigation, mock data, postMessage bridge.
 *
 * SDK / Tags hooks:
 * - #brand-concierge-mobile-mount — Brand Concierge inject target inside app shell
 * - #ksiaMobileBcSheetMount — sheet mount for modal / fullscreen / FAB modes
 * - window.postMessage to parent: { source: 'ksia-mobile-lab', type: 'ksia-experience-event', payload }
 * - Listens for parent: { source: 'ksia-mobile-lab-parent', type: 'sdk-injected' | 'bc-ready' | 'bc-display-mode' }
 */
(function () {
  'use strict';

  var PAGE_ID = document.body && document.body.getAttribute('data-ksia-mobile-page');
  var data = window.KsiaMockData || {};
  var bcUxMode = 'off';
  var bcReady = false;
  var bcEnabled = false;
  var bcDisplayMode = '';

  var BC_MODE_OPTIONS = [
    { key: 'injected', label: 'Injected' },
    { key: 'modal', label: 'Modal' },
    { key: 'fullScreen', label: 'Full screen' },
    { key: 'bottomDock', label: 'FAB' },
  ];

  function ensureInlineBcMount() {
    if (document.getElementById('brand-concierge-mobile-mount')) return;
    var scroll = document.querySelector('.ksia-mobile-app-scroll');
    if (!scroll) return;
    var mount = document.createElement('div');
    mount.id = 'brand-concierge-mobile-mount';
    mount.setAttribute('aria-live', 'polite');
    mount.className = 'ksia-mobile-bc-mount ksia-mobile-bc-mount--inline';
    scroll.appendChild(mount);
  }

  function ensureBcSheetHost() {
    if (document.getElementById('ksiaMobileBcSheet')) return;
    var sheet = document.createElement('div');
    sheet.id = 'ksiaMobileBcSheet';
    sheet.className = 'ksia-mobile-bc-sheet';
    sheet.hidden = true;
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', 'Brand Concierge');
    sheet.innerHTML =
      '<button type="button" class="ksia-mobile-bc-sheet-backdrop" data-ksia-bc-sheet-close aria-label="Close assistant"></button>' +
      '<div class="ksia-mobile-bc-sheet-panel">' +
      '<header class="ksia-mobile-bc-sheet-header">' +
      '<h2 class="ksia-mobile-bc-sheet-title">AIVC assistant</h2>' +
      '<button type="button" class="ksia-mobile-bc-sheet-close" data-ksia-bc-sheet-close aria-label="Close assistant">&times;</button>' +
      '</header>' +
      '<div class="ksia-mobile-bc-sheet-body">' +
      '<div id="ksiaMobileBcSheetMount" class="ksia-mobile-bc-mount ksia-mobile-bc-mount--sheet" aria-live="polite"></div>' +
      '</div></div>';
    document.body.appendChild(sheet);
    sheet.querySelectorAll('[data-ksia-bc-sheet-close]').forEach(function (btn) {
      btn.addEventListener('click', closeBcSheet);
    });
  }

  function ensureBcModePicker() {
    if (document.getElementById('ksiaMobileBcModePicker')) return;
    var picker = document.createElement('div');
    picker.id = 'ksiaMobileBcModePicker';
    picker.className = 'ksia-mobile-bc-mode-picker';
    picker.hidden = true;
    picker.setAttribute('role', 'menu');
    picker.setAttribute('aria-label', 'Brand Concierge display mode');
    picker.innerHTML = BC_MODE_OPTIONS.map(function (opt) {
      return (
        '<button type="button" class="ksia-mobile-bc-mode-option" role="menuitemradio" data-bc-mode="' +
        opt.key +
        '">' +
        opt.label +
        '</button>'
      );
    }).join('');
    document.body.appendChild(picker);
    picker.querySelectorAll('[data-bc-mode]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var mode = btn.getAttribute('data-bc-mode');
        setBcModePickerOpen(false);
        postBcDisplayModeToParent(mode);
      });
    });
  }

  function setBcModePickerOpen(open) {
    var picker = document.getElementById('ksiaMobileBcModePicker');
    if (!picker) return;
    picker.hidden = !open;
    document.body.classList.toggle('ksia-mobile-bc-mode-picker-open', !!open);
    if (open) syncBcModePickerHighlight();
  }

  function syncBcModePickerHighlight() {
    var picker = document.getElementById('ksiaMobileBcModePicker');
    if (!picker) return;
    var active = bcDisplayMode || '';
    picker.querySelectorAll('[data-bc-mode]').forEach(function (btn) {
      var mode = btn.getAttribute('data-bc-mode');
      var isActive = mode === active;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-checked', isActive ? 'true' : 'false');
    });
  }

  function postBcDisplayModeToParent(modeKey) {
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(
          {
            source: 'ksia-mobile-lab',
            type: 'bc-set-display-mode',
            mode: String(modeKey || '').trim(),
          },
          '*',
        );
      }
    } catch (_) {
      /* cross-origin guard */
    }
  }

  function ensureBcInfrastructure() {
    ensureBcSheetHost();
    ensureInlineBcMount();
    ensureBcModePicker();
  }

  function setBcUxMode(mode) {
    bcUxMode = mode || 'off';
    document.body.classList.remove(
      'ksia-mobile-bc-mode-injected',
      'ksia-mobile-bc-mode-sheet',
      'ksia-mobile-bc-mode-fab',
      'ksia-mobile-bc-mode-fab-idle',
      'ksia-mobile-bc-mode-off',
    );
    if (bcUxMode !== 'off') {
      document.body.classList.add('ksia-mobile-bc-mode-' + bcUxMode);
    }
    updateFabVisibility();
    if (bcUxMode === 'sheet' && bcReady) {
      openBcSheet();
    } else if (bcUxMode !== 'sheet') {
      closeBcSheet();
    }
    syncBcModePickerHighlight();
  }

  function updateFabVisibility() {
    var fab = document.getElementById('ksiaMobileBcFab');
    if (!fab) return;
    var showFab =
      bcEnabled &&
      bcReady &&
      (bcUxMode === 'fab' || bcUxMode === 'sheet' || bcUxMode === 'fab-idle' || bcUxMode === 'injected');
    fab.hidden = !showFab;
    fab.setAttribute('aria-hidden', showFab ? 'false' : 'true');
  }

  function openBcSheet() {
    var sheet = document.getElementById('ksiaMobileBcSheet');
    if (!sheet) return;
    sheet.hidden = false;
    document.body.classList.add('ksia-mobile-bc-sheet-open');
    var fab = document.getElementById('ksiaMobileBcFab');
    if (fab) fab.setAttribute('aria-expanded', 'true');
  }

  function closeBcSheet() {
    var sheet = document.getElementById('ksiaMobileBcSheet');
    if (!sheet) return;
    sheet.hidden = true;
    document.body.classList.remove('ksia-mobile-bc-sheet-open');
    var fab = document.getElementById('ksiaMobileBcFab');
    if (fab) fab.setAttribute('aria-expanded', 'false');
  }

  function scrollToInlineMount() {
    var mount = document.getElementById('brand-concierge-mobile-mount');
    if (mount && mount.children.length) {
      mount.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return true;
    }
    return false;
  }

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
    if (!fab) return;
    fab.hidden = true;
    var longPressTimer = null;
    function clearLongPress() {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    }
    fab.addEventListener('pointerdown', function () {
      clearLongPress();
      longPressTimer = setTimeout(function () {
        longPressTimer = null;
        setBcModePickerOpen(true);
      }, 520);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (evtName) {
      fab.addEventListener(evtName, clearLongPress);
    });
    fab.addEventListener('click', function () {
      if (document.body.classList.contains('ksia-mobile-bc-mode-picker-open')) return;
      postExperienceEvent('ksia.mobile.concierge.open', { action: 'open_concierge' });
      if (bcUxMode === 'injected') {
        if (scrollToInlineMount()) return;
        if (PAGE_ID !== 'concierge') {
          window.location.href = 'concierge.html?aepSimMobile=1';
        }
        return;
      }
      if (bcReady && (bcUxMode === 'fab' || bcUxMode === 'sheet' || bcUxMode === 'fab-idle')) {
        openBcSheet();
        return;
      }
      if (PAGE_ID !== 'concierge') {
        window.location.href = 'concierge.html?aepSimMobile=1';
      }
    });
    document.addEventListener('pointerdown', function (ev) {
      var picker = document.getElementById('ksiaMobileBcModePicker');
      if (!picker || picker.hidden) return;
      var t = ev.target;
      if (!t || typeof t.closest !== 'function') return;
      if (t.closest('#ksiaMobileBcModePicker') || t.closest('#ksiaMobileBcFab')) return;
      setBcModePickerOpen(false);
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
    ensureBcInfrastructure();
    renderTabBar();
    bindBcFab();
    fillHero();
    fillStages();
    fillAssistant();
    fillNextActions();
    fillWallet();
    fillNotifications();
    updateFabVisibility();
    postExperienceEvent('ksia.mobile.page.view', { page: PAGE_ID });
  }

  window.addEventListener('message', function (ev) {
    if (!ev.data || ev.data.source !== 'ksia-mobile-lab-parent') return;
    if (typeof ev.data.bcEnabled === 'boolean') {
      bcEnabled = ev.data.bcEnabled;
      updateFabVisibility();
    }
    if (ev.data.displayMode) {
      bcDisplayMode = String(ev.data.displayMode || '').trim();
      syncBcModePickerHighlight();
    }
    if (ev.data.type === 'sdk-injected') {
      var hint = document.getElementById('ksiaMobileSdkHint');
      if (hint) hint.hidden = true;
      return;
    }
    if (ev.data.type === 'bc-prepare') {
      bcReady = false;
      updateFabVisibility();
      return;
    }
    if (ev.data.type === 'bc-ready') {
      bcReady = true;
      if (typeof ev.data.bcEnabled === 'boolean') bcEnabled = ev.data.bcEnabled;
      setBcUxMode(ev.data.mode || bcUxMode);
      var hint = document.getElementById('ksiaMobileSdkHint');
      if (hint) hint.hidden = true;
      return;
    }
    if (ev.data.type === 'bc-display-mode') {
      if (typeof ev.data.bcEnabled === 'boolean') bcEnabled = ev.data.bcEnabled;
      setBcUxMode(ev.data.mode || 'off');
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPage);
  } else {
    initPage();
  }
})();
