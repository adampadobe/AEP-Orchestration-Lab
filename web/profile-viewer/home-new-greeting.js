/**
 * Greeting bar for home-new.html — first name, sandbox, Adobe (ADBE) stock via Google Finance.
 */
(function attachHomeNewGreeting(global) {
  'use strict';

  var GOOGLE_FINANCE_URL = 'https://www.google.com/finance/quote/ADBE:NASDAQ';
  var STOCK_FETCH_TIMEOUT_MS = 8000;
  var ADBE_MIN_PRICE = 80;
  var ADBE_MAX_PRICE = 2000;

  function fetchWithTimeout(url, opts, timeoutMs) {
    var ms = timeoutMs || STOCK_FETCH_TIMEOUT_MS;
    return Promise.race([
      fetch(url, opts),
      new Promise(function (_resolve, reject) {
        setTimeout(function () {
          reject(new Error('timeout'));
        }, ms);
      }),
    ]);
  }

  function isValidAdobePrice(n) {
    return Number.isFinite(n) && n >= ADBE_MIN_PRICE && n <= ADBE_MAX_PRICE;
  }

  function normalizeChangePct(pct, change, price) {
    var p = pct != null ? Number(pct) : null;
    var c = change != null ? Number(change) : null;
    var px = Number(price);
    if (p != null && Number.isFinite(p)) {
      if (Math.abs(p) > 0 && Math.abs(p) < 1) return p * 100;
      return p;
    }
    if (c != null && Number.isFinite(c) && Number.isFinite(px)) {
      var prev = px - c;
      if (prev) return (c / prev) * 100;
    }
    return null;
  }

  function normalizeQuote(raw) {
    if (!raw || raw.ok === false) return null;
    var price = Number(raw.price);
    if (!isValidAdobePrice(price)) return null;
    var change = raw.change != null ? Number(raw.change) : null;
    if (change != null && !Number.isFinite(change)) change = null;
    var changePct = normalizeChangePct(raw.changePct, change, price);
    if (change == null && changePct != null && Number.isFinite(changePct)) {
      var previous = price / (1 + changePct / 100);
      change = price - previous;
    }
    return {
      ok: true,
      symbol: 'ADBE',
      price: price,
      currency: raw.currency || 'USD',
      change: change,
      changePct: changePct,
      source: raw.source || 'unknown',
    };
  }

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

  function formatPrice(n) {
    var num = Number(n);
    if (!isFinite(num)) return '—';
    return '$' + num.toFixed(2);
  }

  function parseGoogleFinanceHtml(html) {
    var text = String(html || '');
    var price = null;
    var change = null;
    var changePct = null;

    var priceMatch =
      text.match(/data-last-price="([0-9.]+)"/) ||
      text.match(/"regularMarketPrice"\s*:\s*([0-9.]+)/);
    if (priceMatch) price = parseFloat(priceMatch[1]);

    var changeMatch =
      text.match(/data-last-change="([0-9.+-]+)"/) ||
      text.match(/"regularMarketChange"\s*:\s*([0-9.+-]+)/);
    if (changeMatch) change = parseFloat(changeMatch[1]);

    var pctMatch =
      text.match(/data-last-change-percent="([0-9.+-]+)"/) ||
      text.match(/"regularMarketChangePercent"\s*:\s*([0-9.+-]+)/);
    if (pctMatch) changePct = parseFloat(pctMatch[1]);

    return normalizeQuote({
      ok: true,
      price: price,
      change: change,
      changePct: changePct,
      currency: 'USD',
      source: 'google',
    });
  }

  function fetchGoogleFinanceQuote() {
    var proxyUrl =
      'https://api.allorigins.win/raw?url=' + encodeURIComponent(GOOGLE_FINANCE_URL);
    return fetchWithTimeout(proxyUrl)
      .then(function (res) {
        if (!res.ok) throw new Error('google HTTP ' + res.status);
        return res.text();
      })
      .then(function (html) {
        var parsed = parseGoogleFinanceHtml(html);
        if (!parsed) throw new Error('google parse failed');
        return parsed;
      });
  }

  function parseYahooChart(json) {
    var result = json && json.chart && json.chart.result && json.chart.result[0];
    var meta = result && result.meta;
    if (!meta || meta.regularMarketPrice == null) return null;
    var price = meta.regularMarketPrice;
    var prev = meta.chartPreviousClose != null ? meta.chartPreviousClose : meta.previousClose;
    var change = prev != null ? price - prev : null;
    var changePct = prev ? (change / prev) * 100 : null;
    return normalizeQuote({
      ok: true,
      price: price,
      change: change,
      changePct: changePct,
      currency: meta.currency || 'USD',
      source: 'yahoo',
    });
  }

  function fetchYahooFallback() {
    var yahooUrl =
      'https://query1.finance.yahoo.com/v8/finance/chart/ADBE?interval=1d&range=1d';
    var proxyUrl = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(yahooUrl);
    return fetchWithTimeout(proxyUrl)
      .then(function (res) {
        if (!res.ok) throw new Error('yahoo HTTP ' + res.status);
        return res.json();
      })
      .then(function (json) {
        var parsed = parseYahooChart(json);
        if (!parsed) throw new Error('yahoo parse failed');
        return parsed;
      });
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
    return normalizeQuote({
      ok: true,
      price: price,
      change: change,
      changePct: changePct,
      currency: 'USD',
      source: 'stooq',
    });
  }

  function fetchStooqFallback() {
    var stooqUrl = 'https://stooq.com/q/l/?s=adbe.us&i=d';
    var proxyUrl =
      'https://api.allorigins.win/raw?url=' + encodeURIComponent(stooqUrl);
    return fetchWithTimeout(proxyUrl)
      .then(function (res) {
        if (!res.ok) throw new Error('stooq HTTP ' + res.status);
        return res.text();
      })
      .then(function (text) {
        var parsed = parseStooqCsv(text);
        if (!parsed) throw new Error('stooq parse failed');
        return parsed;
      });
  }

  function fetchLabStockApi() {
    return fetchWithTimeout('/api/lab/adobe-stock', { credentials: 'same-origin' }).then(function (res) {
      return res.json().catch(function () {
        return { ok: false };
      });
    });
  }

  function renderStock(el, payload) {
    if (!el) return;
    var wrap = document.getElementById('homeGreetingStockWrap');
    el.href = GOOGLE_FINANCE_URL;

    if (!payload || !payload.ok || payload.price == null) {
      el.innerHTML = '<span class="home-greeting-stock-symbol">ADBE</span> unavailable';
      if (wrap) wrap.classList.add('home-greeting-stat--unavail');
      return;
    }

    if (wrap) wrap.classList.remove('home-greeting-stat--unavail');
    var change = Number(payload.change);
    var hasChange = isFinite(change);
    var pct = payload.changePct != null ? Number(payload.changePct) : null;
    var isUp = hasChange ? change >= 0 : pct != null ? pct >= 0 : true;
    var arrow = isUp ? '▲' : '▼';
    var changeCls = isUp
      ? 'home-greeting-stock-change--up'
      : 'home-greeting-stock-change--down';

    var changeLine = '';
    if (pct != null && isFinite(pct)) {
      var sign = pct >= 0 ? '+' : '';
      var changeAbs =
        hasChange && isFinite(change)
          ? ' (' + (change >= 0 ? '+' : '') + change.toFixed(2) + ')'
          : '';
      changeLine =
        '<span class="home-greeting-stock-change ' +
        changeCls +
        '"><span class="home-greeting-stock-arrow" aria-hidden="true">' +
        arrow +
        '</span> ' +
        sign +
        pct.toFixed(2) +
        '%' +
        changeAbs +
        ' <span class="home-greeting-stock-today">Today</span></span>';
    } else if (hasChange) {
      changeLine =
        '<span class="home-greeting-stock-change ' +
        changeCls +
        '"><span class="home-greeting-stock-arrow" aria-hidden="true">' +
        arrow +
        '</span> ' +
        (change >= 0 ? '+' : '') +
        change.toFixed(2) +
        ' <span class="home-greeting-stock-today">Today</span></span>';
    }

    el.innerHTML =
      '<span class="home-greeting-stock-price">' +
      esc(formatPrice(payload.price)) +
      '</span>' +
      changeLine;
    el.title = 'ADBE on Google Finance — click to open';
  }

  function loadStockChain() {
    return fetchLabStockApi()
      .then(function (json) {
        var quote = normalizeQuote(json);
        if (quote) return quote;
        return fetchYahooFallback();
      })
      .catch(function () {
        return fetchYahooFallback();
      })
      .catch(function () {
        return fetchGoogleFinanceQuote();
      })
      .catch(function () {
        return fetchStooqFallback();
      });
  }

  function loadStock() {
    var el = document.getElementById('homeGreetingStock');
    if (!el) return;
    el.innerHTML = '<span class="home-greeting-stock-symbol">ADBE</span> loading…';
    loadStockChain()
      .then(function (payload) {
        renderStock(el, normalizeQuote(payload) || payload);
      })
      .catch(function () {
        renderStock(el, null);
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

  var CANVAS_STORAGE_KEY = 'aepHomeNewCanvas';

  function isLightCanvas() {
    try {
      return localStorage.getItem(CANVAS_STORAGE_KEY) === 'light';
    } catch (_e) {
      return false;
    }
  }

  function applyCanvasMode(light) {
    var root = document.documentElement;
    if (light) root.setAttribute('data-home-new-canvas', 'light');
    else root.removeAttribute('data-home-new-canvas');
    try {
      localStorage.setItem(CANVAS_STORAGE_KEY, light ? 'light' : 'dark');
    } catch (_e) {}
    var btn = document.getElementById('homeNewCanvasToggle');
    if (btn) {
      btn.textContent = light ? 'Dark mode' : 'Light mode';
      btn.setAttribute('aria-label', light ? 'Switch to dark mode' : 'Switch to light mode');
    }
  }

  function bindCanvasToggle() {
    var btn = document.getElementById('homeNewCanvasToggle');
    if (!btn || btn.getAttribute('data-canvas-bound') === '1') return;
    btn.setAttribute('data-canvas-bound', '1');
    applyCanvasMode(isLightCanvas());
    btn.addEventListener('click', function () {
      applyCanvasMode(!isLightCanvas());
    });
  }

  function init() {
    var bar = document.getElementById('homeGreetingBar');
    if (!bar || bar.getAttribute('data-home-greeting-init') === '1') return;
    bar.setAttribute('data-home-greeting-init', '1');

    bindCanvasToggle();
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

  global.HomeNewGreeting = { init: init, boot: boot, loadStock: loadStock };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
