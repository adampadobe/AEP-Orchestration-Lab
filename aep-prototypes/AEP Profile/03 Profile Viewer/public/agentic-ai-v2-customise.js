/**
 * Customise dock: per-workspace URLs for the eight specialist agent cards on Agentic layer v2.
 * Storage: RTDB ajoLookups/{ldap}/AgenticLayer/agentUrls
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

  var lastSavedUrls = null;
  var saveInFlight = null;
  var refreshGeneration = 0;

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

  function extractAgentUrls(section) {
    if (!section || typeof section !== 'object') return null;
    if (section.agentUrls && typeof section.agentUrls === 'object') {
      return section.agentUrls;
    }
    var flat = emptyRecord();
    var has = false;
    FIELD_KEYS.forEach(function (k) {
      if (typeof section[k] === 'string' && section[k].trim()) {
        flat[k] = section[k].trim();
        has = true;
      }
    });
    return has ? flat : null;
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
      el.addEventListener('click', function () {
        if (!el.classList.contains('agentic-v2-agent-card--has-link')) return;
        onAgentCardActivate({ currentTarget: el });
      });
      el.addEventListener('keydown', function (e) {
        if (!el.classList.contains('agentic-v2-agent-card--has-link')) return;
        onAgentCardKeydown(e);
      });
    });
  }

  function getWorkspaceSlug() {
    var c = rtdb();
    if (c && typeof c.resolveLdapSlugAsync === 'function') {
      return c.resolveLdapSlugAsync();
    }
    if (c && c.getLdapSlugSync) {
      return Promise.resolve(c.getLdapSlugSync() || '');
    }
    return Promise.resolve('');
  }

  function updateWorkspaceLabel(workspaceSlug) {
    var el = document.getElementById('agenticV2SandboxLabel');
    if (!el) return;
    var ws = workspaceSlug || '';
    var strong = el.querySelector('strong');
    if (strong) {
      strong.textContent = ws || '—';
      return;
    }
    el.textContent = ws ? 'Workspace: ' + ws : 'Workspace: —';
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

  function urlsHasMeaningfulData(urls) {
    var u = normalizeStored(urls);
    return FIELD_KEYS.some(function (k) {
      return !!u[k];
    });
  }

  function loadUrlsFromRtdb() {
    var c = rtdb();
    if (!c) return Promise.resolve(null);
    return c.whenReady().then(function () {
      return c.loadSection(c.SECTIONS.AgenticLayer);
    }).then(function (section) {
      return extractAgentUrls(section);
    });
  }

  function urlsEqual(a, b) {
    var x = normalizeStored(a);
    var y = normalizeStored(b);
    return FIELD_KEYS.every(function (k) {
      return x[k] === y[k];
    });
  }

  function isUserEditingInputs() {
    var active = document.activeElement;
    if (!active || !active.id) return false;
    return FIELD_KEYS.some(function (k) {
      return active.id === INPUT_IDS[k];
    });
  }

  function saveUrlsToRtdb(urls) {
    var c = rtdb();
    if (!c) return Promise.reject(new Error('Demo config RTDB module not loaded'));
    return c.saveSection(c.SECTIONS.AgenticLayer, { agentUrls: urls });
  }

  function persistUrls(urls, statusPrefix) {
    var k;
    for (k in urls) {
      if (urls[k] && !validateUrl(urls[k])) {
        setStatus('Each non-empty URL must be a valid http(s) address.', 'err');
        return Promise.resolve(false);
      }
    }
    if (lastSavedUrls && urlsEqual(urls, lastSavedUrls)) {
      return Promise.resolve(true);
    }
    setStatus((statusPrefix || 'Saving') + '…', '');
    if (saveInFlight) return saveInFlight;
    saveInFlight = getWorkspaceSlug()
      .then(function (ws) {
        if (!ws) {
          throw new Error('Sign in with your Adobe lab account to save agent URLs.');
        }
        return saveUrlsToRtdb(urls);
      })
      .then(function () {
        return getWorkspaceSlug();
      })
      .then(function (ws) {
        lastSavedUrls = normalizeStored(urls);
        applyUrlsToAgentCards(urls);
        setStatus('Saved agent links for workspace “' + (ws || 'your lab') + '”.', 'ok');
        return true;
      })
      .catch(function (e) {
        setStatus(String((e && e.message) || e), 'err');
        return false;
      })
      .finally(function () {
        saveInFlight = null;
      });
    return saveInFlight;
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
        { passive: true },
      );
    }
  }

  function init() {
    initDock();

    var btn = document.getElementById('agenticV2CustomiseUpdate');
    if (btn) {
      btn.addEventListener('click', function () {
        persistUrls(collectInputsRaw(), 'Saving');
      });
    }

    FIELD_KEYS.forEach(function (key) {
      var inp = document.getElementById(INPUT_IDS[key]);
      if (!inp) return;
      inp.addEventListener('blur', function () {
        persistUrls(collectInputsRaw(), 'Saving');
      });
    });

    function refreshFromRtdb() {
      var gen = ++refreshGeneration;
      loadUrlsFromRtdb().then(function (urls) {
        if (gen !== refreshGeneration) return;
        var normalized = normalizeStored(urls);
        lastSavedUrls = normalized;
        if (!isUserEditingInputs()) {
          fillInputsFromStored(urls);
        }
        applyUrlsToAgentCards(urls);
        return getWorkspaceSlug();
      }).then(function (ws) {
        if (gen !== refreshGeneration) return;
        updateWorkspaceLabel(ws);
        if (!ws) {
          setStatus('Sign in to load your workspace agent URLs.', 'err');
        } else {
          setStatus('', '');
        }
      }).catch(function (e) {
        if (gen !== refreshGeneration) return;
        console.warn('[agentic-v2] RTDB agent URL load failed:', e);
        if (lastSavedUrls && urlsHasMeaningfulData(lastSavedUrls)) {
          setStatus('', '');
          return;
        }
        setStatus('Could not load agent URLs from RTDB.', 'err');
      });
    }

    function scheduleRefreshAfterAuth() {
      function tryRefresh() {
        refreshFromRtdb();
      }
      if (window.__aepLabSyncReady && typeof window.__aepLabSyncReady.then === 'function') {
        window.__aepLabSyncReady.then(tryRefresh);
      } else {
        tryRefresh();
      }
      window.setTimeout(tryRefresh, 1500);
    }

    bindAgentCardsOnce();

    window.addEventListener('aep-demo-config-changed', refreshFromRtdb);

    document.addEventListener('aep-lab-sandbox-keys-applied', refreshFromRtdb);

    scheduleRefreshAfterAuth();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
