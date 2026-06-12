/**
 * Customise dock: per–AEP-sandbox URLs for the eight specialist agent cards on Agentic layer v2.
 * Storage: RTDB ajoLookups/{ldap}/sandboxes/{sandbox}/AgenticLayer/agentUrls
 */
(function () {
  'use strict';

  var FIELD_KEYS = ['brand', 'product', 'operational', 'field', 'audience', 'journey', 'data', 'support'];

  var INPUT_IDS = {
    brand: 'agenticV2UrlBrand',
    product: 'agenticV2UrlProduct',
    operational: 'agenticV2UrlOperational',
    field: 'agenticV2UrlField',
    audience: 'agenticV2UrlAudience',
    journey: 'agenticV2UrlJourney',
    data: 'agenticV2UrlData',
    support: 'agenticV2UrlSupport',
  };

  var CARD_IDS = {
    brand: 'node-agent-brand-v2',
    product: 'node-agent-product-v2',
    operational: 'node-agent-operational-v2',
    field: 'node-agent-field-v2',
    audience: 'node-agent-audience-v2',
    journey: 'node-agent-journey-v2',
    data: 'node-agent-data-v2',
    support: 'node-agent-support-v2',
  };

  function rtdb() {
    return window.AepDemoConfigRtdb;
  }

  function emptyRecord() {
    var o = {};
    FIELD_KEYS.forEach(function (k) {
      o[k] = '';
    });
    return o;
  }

  function normalizeStored(stored) {
    var o = emptyRecord();
    if (!stored || typeof stored !== 'object') return o;
    FIELD_KEYS.forEach(function (k) {
      if (typeof stored[k] === 'string') o[k] = stored[k].trim();
    });
    return o;
  }

  function applyUrlsToAgentCards(urls) {
    var u = normalizeStored(urls);
    FIELD_KEYS.forEach(function (key) {
      var id = CARD_IDS[key];
      var el = document.getElementById(id);
      if (!el) return;
      var href = u[key];
      el.removeAttribute('data-agent-url');
      el.classList.remove('agentic-v2-agent-card--has-link');
      el.removeAttribute('tabindex');
      el.removeAttribute('role');
      el.removeAttribute('aria-label');
      if (href) {
        el.setAttribute('data-agent-url', href);
        el.classList.add('agentic-v2-agent-card--has-link');
        el.setAttribute('tabindex', '0');
        el.setAttribute('role', 'link');
        var labelEl = el.querySelector('.agentic-v2-agent-card__label span');
        el.setAttribute('aria-label', 'Open ' + (labelEl ? labelEl.textContent.trim() : 'agent') + ' in a new tab');
      }
    });
  }

  function onAgentCardActivate(ev) {
    var card = ev.currentTarget;
    if (!card || !card.classList.contains('agentic-v2-agent-card--has-link')) return;
    var url = card.getAttribute('data-agent-url');
    if (!url) return;
    try {
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {}
  }

  function onAgentCardKeydown(ev) {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    ev.preventDefault();
    onAgentCardActivate(ev);
  }

  function bindAgentCardsOnce() {
    if (document.documentElement.getAttribute('data-agentic-v2-agent-links-bound') === '1') return;
    document.documentElement.setAttribute('data-agentic-v2-agent-links-bound', '1');
    FIELD_KEYS.forEach(function (key) {
      var el = document.getElementById(CARD_IDS[key]);
      if (!el) return;
      el.addEventListener('click', function (e) {
        if (!el.classList.contains('agentic-v2-agent-card--has-link')) return;
        onAgentCardActivate({ currentTarget: el });
      });
      el.addEventListener('keydown', function (e) {
        if (!el.classList.contains('agentic-v2-agent-card--has-link')) return;
        onAgentCardKeydown(e);
      });
    });
  }

  function currentSandboxName() {
    if (rtdb()) return rtdb().getActiveSandboxSlug();
    if (typeof AepGlobalSandbox !== 'undefined' && AepGlobalSandbox.getSandboxName) {
      return AepGlobalSandbox.getSandboxName() || '';
    }
    try {
      return String(localStorage.getItem('aepGlobalSandboxName') || '').trim();
    } catch (e) {
      return '';
    }
  }

  function fillInputsFromStored(urls) {
    var m = normalizeStored(urls);
    FIELD_KEYS.forEach(function (k) {
      var inp = document.getElementById(INPUT_IDS[k]);
      if (inp) inp.value = m[k] || '';
    });
  }

  function collectInputsRaw() {
    var o = {};
    FIELD_KEYS.forEach(function (k) {
      var el = document.getElementById(INPUT_IDS[k]);
      o[k] = el && el.value != null ? String(el.value).trim() : '';
    });
    return o;
  }

  function validateUrl(s) {
    if (!s) return false;
    try {
      var u = new URL(s);
      return u.protocol === 'https:' || u.protocol === 'http:';
    } catch (e) {
      return false;
    }
  }

  function setStatus(msg, kind) {
    var el = document.getElementById('agenticV2CustomiseStatus');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'status' + (kind === 'ok' ? ' ok' : kind === 'err' ? ' err' : '');
  }

  function loadUrlsFromRtdb() {
    var c = rtdb();
    if (!c) return Promise.resolve(null);
    return c.whenReady().then(function () {
      return c.migrateLocalStorageKeys(c.getActiveSandboxSlug());
    }).then(function () {
      return c.loadSection(c.SECTIONS.AgenticLayer);
    }).then(function (section) {
      return section && section.agentUrls ? section.agentUrls : null;
    });
  }

  function saveUrlsToRtdb(urls) {
    var c = rtdb();
    if (!c) return Promise.reject(new Error('Demo config RTDB module not loaded'));
    return c.saveSection(c.SECTIONS.AgenticLayer, { agentUrls: urls });
  }

  function initDock() {
    var mainEl = document.querySelector('main.dashboard-main.app-page');
    var dockOuter = document.getElementById('agenticV2DockOuter');
    var drawer = document.getElementById('agenticV2CustomiseDrawer');
    var hit = document.getElementById('agenticV2DockHit');
    if (!mainEl || !dockOuter) return;

    var PEEK_PX = 40;
    var peekRaf = null;
    var lastX = 0;
    var lastY = 0;

    function alignDock() {
      var r = mainEl.getBoundingClientRect();
      dockOuter.style.left = Math.max(0, r.left) + 'px';
      dockOuter.style.width = Math.min(r.width, window.innerWidth) + 'px';
    }

    function setPeekFromPoint(clientX, clientY) {
      if (drawer && drawer.open) {
        dockOuter.classList.add('workflow-dock-outer--peek');
        return;
      }
      var r = mainEl.getBoundingClientRect();
      var nearBottom = clientY >= window.innerHeight - PEEK_PX;
      var inMain = clientX >= r.left && clientX <= r.right;
      if (nearBottom && inMain) {
        dockOuter.classList.add('workflow-dock-outer--peek');
      } else {
        dockOuter.classList.remove('workflow-dock-outer--peek');
      }
    }

    function onMouseMove(e) {
      lastX = e.clientX;
      lastY = e.clientY;
      if (peekRaf) return;
      peekRaf = window.requestAnimationFrame(function () {
        peekRaf = null;
        setPeekFromPoint(lastX, lastY);
      });
    }

    alignDock();
    try {
      var ro = new ResizeObserver(alignDock);
      ro.observe(mainEl);
    } catch (e) {}
    window.addEventListener('resize', alignDock);
    document.addEventListener('mousemove', onMouseMove, { passive: true });
    document.documentElement.addEventListener('mouseleave', function () {
      if (drawer && !drawer.open) {
        dockOuter.classList.remove('workflow-dock-outer--peek');
      }
    });

    if (drawer) {
      drawer.addEventListener('toggle', function () {
        if (drawer.open) {
          dockOuter.classList.add('workflow-dock-outer--peek');
        } else {
          setPeekFromPoint(lastX, lastY);
        }
      });
    }

    if (hit) {
      hit.addEventListener(
        'touchstart',
        function () {
          dockOuter.classList.add('workflow-dock-outer--peek');
        },
        { passive: true }
      );
    }
  }

  function initSandboxSelect() {
    var sel = document.getElementById('agenticV2SandboxSelect');
    if (!sel || typeof AepGlobalSandbox === 'undefined') return;
    AepGlobalSandbox.loadSandboxesIntoSelect(sel).then(function () {
      AepGlobalSandbox.onSandboxSelectChange(sel);
      AepGlobalSandbox.attachStorageSync(sel);
    });
  }

  function init() {
    initDock();
    initSandboxSelect();
    bindAgentCardsOnce();

    var btn = document.getElementById('agenticV2CustomiseUpdate');
    if (btn) {
      btn.addEventListener('click', function () {
        var c = collectInputsRaw();
        var k;
        for (k in c) {
          if (c[k] && !validateUrl(c[k])) {
            setStatus('Each non-empty URL must be a valid http(s) address.', 'err');
            return;
          }
        }
        var sb = currentSandboxName();
        saveUrlsToRtdb(c)
          .then(function () {
            applyUrlsToAgentCards(c);
            setStatus('Saved agent links for sandbox “' + (sb || 'default') + '”.', 'ok');
          })
          .catch(function (e) {
            setStatus(String((e && e.message) || e), 'err');
          });
      });
    }

    function refreshFromRtdb() {
      loadUrlsFromRtdb().then(function (urls) {
        fillInputsFromStored(urls);
        applyUrlsToAgentCards(urls);
      });
    }

    window.addEventListener('aep-global-sandbox-change', function () {
      var sel = document.getElementById('agenticV2SandboxSelect');
      if (sel && typeof AepGlobalSandbox !== 'undefined') {
        var n = AepGlobalSandbox.getSandboxName();
        if (n !== undefined && Array.from(sel.options).some(function (o) { return o.value === n; })) {
          sel.value = n;
        }
      }
      refreshFromRtdb();
    });

    window.addEventListener('aep-demo-config-changed', refreshFromRtdb);

    if (window.__aepLabSyncReady && typeof window.__aepLabSyncReady.then === 'function') {
      window.__aepLabSyncReady.then(refreshFromRtdb);
    } else {
      refreshFromRtdb();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
