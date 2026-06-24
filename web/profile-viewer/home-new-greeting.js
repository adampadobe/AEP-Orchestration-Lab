/**
 * Greeting bar for home-new.html — first name, sandbox, Adobe (ADBE) stock quote.
 */
(function attachHomeNewGreeting(global) {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function capitalize(s) {
    var t = String(s || '').trim();
    if (!t) return '';
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  function firstNameFromDisplayName(dn) {
    var parts = String(dn || '').trim().split(/\s+/);
    return parts[0] || '';
  }

  function firstNameFromEmail(email) {
    var local = String((email || '').split('@')[0] || '').trim();
    if (!local) return '';
    var segment = local.split(/[._-]/)[0];
    return capitalize(segment);
  }

  function resolveSandboxName() {
    if (global.AepLabSandboxSync && typeof global.AepLabSandboxSync.getSandbox === 'function') {
      var sb = global.AepLabSandboxSync.getSandbox();
      if (sb) return String(sb);
    }
    if (global.AepGlobalSandbox && typeof global.AepGlobalSandbox.getSandboxName === 'function') {
      var name = String(global.AepGlobalSandbox.getSandboxName() || '').trim();
      if (name) return name;
    }
    try {
      return String(localStorage.getItem('aepGlobalSandboxName') || '').trim();
    } catch (_e) {
      return '';
    }
  }

  function authHeadersPromise() {
    var sync = global.AepLabSandboxSync;
    if (!sync || typeof sync.getAuthHeaders !== 'function') return Promise.resolve(null);
    var wait =
      sync.whenReady && typeof sync.whenReady.then === 'function' ? sync.whenReady : Promise.resolve();
    return wait.then(function () {
      return sync.getAuthHeaders();
    });
  }

  function fetchWorkspaceFirstName() {
    return authHeadersPromise().then(function (headers) {
      if (!headers || !headers.Authorization) return '';
      return fetch('/api/lab/workspace-profile', { headers: headers })
        .then(function (res) {
          return res.json().catch(function () {
            return {};
          });
        })
        .then(function (json) {
          var profile = json && json.profile;
          if (profile && profile.firstName) return String(profile.firstName).trim();
          return '';
        })
        .catch(function () {
          return '';
        });
    });
  }

  function resolveFirstName() {
    return fetchWorkspaceFirstName().then(function (fromProfile) {
      if (fromProfile) return fromProfile;
      try {
        var auth =
          global.firebase && global.firebase.auth && global.firebase.auth();
        var user = auth && auth.currentUser;
        if (user) {
          var fromDn = firstNameFromDisplayName(user.displayName);
          if (fromDn) return fromDn;
          var fromEmail = firstNameFromEmail(user.email);
          if (fromEmail) return fromEmail;
        }
      } catch (_e) {}
      return 'there';
    });
  }

  function formatPrice(n, currency) {
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency || 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(n);
    } catch (_e) {
      return '$' + Number(n).toFixed(2);
    }
  }

  function renderStock(el, payload) {
    if (!el) return;
    if (!payload || !payload.ok || payload.price == null) {
      el.textContent = 'ADBE — unavailable';
      el.classList.add('home-greeting-stat--muted');
      return;
    }
    var change = Number(payload.change) || 0;
    var sign = change >= 0 ? '+' : '';
    var pct = payload.changePct != null ? sign + Number(payload.changePct).toFixed(2) + '%' : '';
    el.innerHTML =
      '<span class="home-greeting-stock-symbol">ADBE</span> ' +
      '<span class="home-greeting-stock-price">' +
      esc(formatPrice(payload.price, payload.currency)) +
      '</span>' +
      (pct
        ? ' <span class="home-greeting-stock-change' +
          (change >= 0 ? ' home-greeting-stock-change--up' : ' home-greeting-stock-change--down') +
          '">' +
          esc(pct) +
          '</span>'
        : '');
  }

  function parseStooqCsv(text) {
    var line = String(text || '').trim().split('\n').pop();
    if (!line) return null;
    var parts = line.split(',');
    if (parts.length < 5) return null;
    var price = parseFloat(parts[4]);
    if (!isFinite(price)) return null;
    var prev = parseFloat(parts[5]);
    var change = isFinite(prev) ? price - prev : null;
    var changePct = change != null && prev ? (change / prev) * 100 : null;
    return {
      ok: true,
      symbol: 'ADBE',
      price: price,
      currency: 'USD',
      change: change,
      changePct: changePct,
    };
  }

  function fetchStockFallback() {
    var stooqUrl = 'https://stooq.com/q/l/?s=adbe.us&i=d';
    var proxyUrl =
      'https://api.allorigins.win/raw?url=' + encodeURIComponent(stooqUrl);
    return fetch(proxyUrl)
      .then(function (res) {
        if (!res.ok) throw new Error('fallback HTTP ' + res.status);
        return res.text();
      })
      .then(function (text) {
        var parsed = parseStooqCsv(text);
        if (!parsed) throw new Error('Could not parse quote');
        return parsed;
      });
  }

  function loadStock() {
    var el = document.getElementById('homeGreetingStock');
    if (!el) return;
    el.textContent = 'ADBE — loading…';
    fetch('/api/lab/adobe-stock', { credentials: 'same-origin' })
      .then(function (res) {
        return res.json().catch(function () {
          return { ok: false };
        });
      })
      .then(function (json) {
        if (json && json.ok) {
          renderStock(el, json);
          return;
        }
        return fetchStockFallback().then(function (fallback) {
          renderStock(el, fallback);
        });
      })
      .catch(function () {
        fetchStockFallback()
          .then(function (fallback) {
            renderStock(el, fallback);
          })
          .catch(function () {
            renderStock(el, null);
          });
      });
  }

  function renderGreeting(firstName) {
    var nameEl = document.getElementById('homeGreetingName');
    if (nameEl) nameEl.textContent = firstName || 'there';
  }

  function renderSandbox() {
    var el = document.getElementById('homeGreetingSandbox');
    if (!el) return;
    var name = resolveSandboxName();
    el.textContent = name || 'No sandbox selected';
    el.classList.toggle('home-greeting-stat--muted', !name);
  }

  function init() {
    var bar = document.getElementById('homeGreetingBar');
    if (!bar || bar.getAttribute('data-home-greeting-init') === '1') return;
    bar.setAttribute('data-home-greeting-init', '1');

    resolveFirstName().then(renderGreeting);
    renderSandbox();
    loadStock();

    global.addEventListener('aep-global-sandbox-change', renderSandbox);
    global.addEventListener('aep-lab-email-session-updated', function () {
      resolveFirstName().then(renderGreeting);
    });
    global.addEventListener('aep-lab-google-session-updated', function () {
      resolveFirstName().then(renderGreeting);
    });
  }

  function boot() {
    if (document.getElementById('homeGreetingBar')) {
      init();
      return;
    }
    global.addEventListener('aep-deferred-dashboard-mounted', init, { once: true });
  }

  global.HomeNewGreeting = { init: init, boot: boot };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
