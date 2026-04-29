/*
 * Client journey assets — orchestrator script.
 *
 * Flow:
 *   1. The active sandbox is read from window.AepGlobalSandbox.getSandboxName()
 *      (the same value the Global values page edits and aep-lab-sandbox-sync
 *      mirrors across pages). A small read-only badge shows it so the user
 *      always knows which sandbox they're targeting.
 *   2. User types a URL/domain and hits "Look up scrape". We GET
 *      /api/brand-scraper/scrapes?sandbox=… (existing endpoint), then
 *      hostname-match against each scrape's `url` field. If we find one
 *      we hydrate it with /api/brand-scraper/scrapes/<id>?sandbox=… so we
 *      can pre-fill the brand-colour picker from crawlSummary.assets.colours.
 *   3. If no scrape matches we show an empty state pointing the user at
 *      brand-scraper.html (mirrors the image-hosting pattern).
 *   4. User refines (brand colour, journey type, persona) and hits Generate.
 *      We POST /api/client-journey/generate, then load the two returned HTML
 *      strings into iframes via blob URLs so they're isolated and full-screen
 *      friendly.
 *   5. "Download PPTX" POSTs the journeyData to /api/client-journey/pptx and
 *      streams the binary response back as a download.
 */

(function () {
  'use strict';

  // Firebase Hosting rewrites cap proxied requests at 60s, but the
  // Vertex AI Gemini call routinely takes 90–120s for a full 12-step
  // journey + one-pager. Hit the Cloud Function direct URL for generate
  // (matches the brand-scraper pattern); /api/* is fine for the fast
  // PPTX render.
  var FN_BASE = 'https://us-central1-aep-orchestration-lab.cloudfunctions.net';
  var GENERATE_URL = FN_BASE + '/clientJourneyGenerate';

  // ─── DOM refs ─────────────────────────────────────────────────────────
  var $ = function (id) { return document.getElementById(id); };
  var sandboxBadge = $('cjSandboxBadge');
  var urlInput = $('cjUrl');
  var lookupBtn = $('cjLookupBtn');
  var lookupStatus = $('cjLookupStatus');
  var summarySection = $('cjScrapeSummary');
  var scrapeCard = $('cjScrapeCard');
  var brandColourInput = $('cjBrandColour');
  var brandColourPicker = $('cjBrandColourPicker');
  var brandSwatchRow = $('cjBrandSwatchRow');
  var brandSwatchCaption = $('cjBrandSwatchCaption');
  var journeyTypeInput = $('cjJourneyType');
  var personaInput = $('cjPersona');
  var generateBtn = $('cjGenerateBtn');
  var generateStatus = $('cjGenerateStatus');
  var progressEl = $('cjProgress');
  var progressStageEl = $('cjProgressStage');
  var progressElapsedEl = $('cjProgressElapsed');
  var progressTrackEl = $('cjProgressTrack');
  var progressFillEl = $('cjProgressFill');
  var resultsSection = $('cjResults');
  var tabJourney = $('cjTabJourney');
  var tabOnePager = $('cjTabOnePager');
  var embedJourney = $('cjEmbedJourney');
  var embedOnePager = $('cjEmbedOnePager');
  var iframeJourney = $('cjJourneyIframe');
  var iframeOnePager = $('cjOnePagerIframe');
  var downloadPptxBtn = $('cjDownloadPptxBtn');
  var prevLoadBtn = $('cjPrevLoadBtn');
  var prevForgetBtn = $('cjPrevForgetBtn');
  var recolourEl = $('cjRecolour');
  var recolourSwatchesEl = $('cjRecolourSwatches');
  var recolourPicker = $('cjRecolourPicker');
  var recolourHex = $('cjRecolourHex');
  var recolourReset = $('cjRecolourReset');
  var recolourEyedropper = $('cjRecolourEyedropper');

  // ─── State ────────────────────────────────────────────────────────────
  var state = {
    selectedScrape: null,    // Hydrated scrape record from /api/brand-scraper/scrapes/<id>
    journeyData: null,       // Last generated journey JSON (used for PPTX download)
    journeyBlobUrl: null,
    onePagerBlobUrl: null,
    scrapeColours: [],       // [{hex, count}] from the active scrape (for recolour palette)
    originalBrandColour: '', // Hex the assets were originally generated with — used by Reset
    activeBrandColour: '',   // Currently applied hex (may differ from original after recolour)
  };

  // ─── Cache (per-browser) ──────────────────────────────────────────────
  // We persist generated journeys in localStorage keyed by sandbox+scrapeId
  // so the user can navigate away, come back, and still see / download the
  // last result without re-paying the 60–120s Vertex AI bill. We also cap
  // the cache to MAX_CACHE_ENTRIES with simple LRU eviction so the store
  // doesn't balloon past localStorage's ~5MB ceiling — full HTML for both
  // assets is typically 200–500KB per entry.

  var CACHE_INDEX_KEY = 'cj-asset-cache:index';
  var CACHE_ENTRY_PREFIX = 'cj-asset-cache:entry:';
  var MAX_CACHE_ENTRIES = 8;

  function cacheKey(sandbox, scrapeId) {
    return CACHE_ENTRY_PREFIX + sandbox + '::' + scrapeId;
  }

  function readCacheIndex() {
    try {
      var raw = localStorage.getItem(CACHE_INDEX_KEY);
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (_) { return []; }
  }

  function writeCacheIndex(arr) {
    try { localStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(arr)); } catch (_) {}
  }

  function evictOldestIfNeeded() {
    var idx = readCacheIndex();
    while (idx.length > MAX_CACHE_ENTRIES) {
      var oldest = idx.shift();
      try { localStorage.removeItem(oldest); } catch (_) {}
    }
    writeCacheIndex(idx);
  }

  function loadFromCache(sandbox, scrapeId) {
    if (!sandbox || !scrapeId) return null;
    try {
      var raw = localStorage.getItem(cacheKey(sandbox, scrapeId));
      if (!raw) return null;
      var entry = JSON.parse(raw);
      if (!entry || !entry.journeyData || !entry.htmlJourney || !entry.htmlOnePager) return null;
      return entry;
    } catch (_) { return null; }
  }

  function saveToCache(sandbox, scrapeId, payload) {
    if (!sandbox || !scrapeId || !payload) return;
    var key = cacheKey(sandbox, scrapeId);
    var entry = {
      sandbox: sandbox,
      scrapeId: scrapeId,
      generatedAt: Date.now(),
      brandName: payload.brandName || '',
      brandColour: payload.brandColour || '',
      journeyType: payload.journeyType || '',
      personaName: payload.personaName || '',
      journeyData: payload.journeyData,
      htmlJourney: payload.htmlJourney,
      htmlOnePager: payload.htmlOnePager,
    };
    try {
      localStorage.setItem(key, JSON.stringify(entry));
    } catch (e) {
      // Quota exceeded — try evicting one and retry once.
      console.warn('[client-journey] cache save failed, evicting oldest', e);
      var idx = readCacheIndex();
      var oldest = idx.shift();
      if (oldest) {
        try { localStorage.removeItem(oldest); } catch (_) {}
        writeCacheIndex(idx);
      }
      try { localStorage.setItem(key, JSON.stringify(entry)); }
      catch (e2) { console.warn('[client-journey] cache save still failing', e2); return; }
    }
    var index = readCacheIndex();
    var existing = index.indexOf(key);
    if (existing !== -1) index.splice(existing, 1);
    index.push(key); // most-recent at end
    writeCacheIndex(index);
    evictOldestIfNeeded();
  }

  function relativeTime(epochMs) {
    var diff = Date.now() - epochMs;
    if (diff < 60000) return 'just now';
    var mins = Math.floor(diff / 60000);
    if (mins < 60) return mins + ' minute' + (mins === 1 ? '' : 's') + ' ago';
    var hours = Math.floor(mins / 60);
    if (hours < 24) return hours + ' hour' + (hours === 1 ? '' : 's') + ' ago';
    var days = Math.floor(hours / 24);
    if (days < 30) return days + ' day' + (days === 1 ? '' : 's') + ' ago';
    return new Date(epochMs).toLocaleDateString();
  }

  // Show the inline "Load previous result" + "Forget" buttons next to
  // Generate when we have a cached entry for the active scrape. Title
  // attribute carries the timestamp + refinements so the user can hover
  // for full context without a big banner.
  function showLoadPrev(entry) {
    if (!prevLoadBtn) return;
    prevLoadBtn.textContent = 'Load previous result (' + relativeTime(entry.generatedAt) + ')';
    var bits = [];
    if (entry.brandColour) bits.push('colour ' + entry.brandColour);
    if (entry.journeyType) bits.push('type: ' + entry.journeyType);
    if (entry.personaName) bits.push('persona: ' + entry.personaName);
    prevLoadBtn.title =
      'Generated ' + new Date(entry.generatedAt).toLocaleString() +
      (bits.length ? ' — ' + bits.join(', ') : '');
    prevLoadBtn.hidden = false;
    if (prevForgetBtn) prevForgetBtn.hidden = false;
  }

  function hideLoadPrev() {
    if (prevLoadBtn) prevLoadBtn.hidden = true;
    if (prevForgetBtn) prevForgetBtn.hidden = true;
  }

  function applyCachedEntry(entry) {
    state.journeyData = entry.journeyData;
    state.originalBrandColour = String(entry.originalBrandColour || entry.brandColour || '').toUpperCase();
    state.activeBrandColour = String(entry.colourOverride || entry.brandColour || state.originalBrandColour).toUpperCase();
    mountIframe(iframeJourney, entry.htmlJourney, 'journey');
    mountIframe(iframeOnePager, entry.htmlOnePager, 'onepager');
    resultsSection.hidden = false;
    activateTab('journey');
    renderRecolourPanel(state.scrapeColours, state.originalBrandColour, state.activeBrandColour);
    // Re-apply any colour override the user picked previously (don't
    // re-persist — we just loaded from cache, the colour is already there).
    if (state.activeBrandColour && state.activeBrandColour !== state.originalBrandColour) {
      applyRecolour(state.activeBrandColour, { persist: false });
    }
    progress.finish('success', 'Loaded previously generated result from ' + relativeTime(entry.generatedAt));
    setStatus(generateStatus, 'Restored previous result. Generate again to replace it, or download the PPTX.', 'success');
  }

  // ─── Helpers ──────────────────────────────────────────────────────────

  function setStatus(el, msg, kind) {
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'status' + (kind ? ' ' + kind : '');
  }

  function getSandbox() {
    try {
      if (window.AepGlobalSandbox && typeof window.AepGlobalSandbox.getSandboxName === 'function') {
        return String(window.AepGlobalSandbox.getSandboxName() || '').trim();
      }
    } catch (_) { /* noop */ }
    return '';
  }

  function refreshSandboxBadge() {
    if (!sandboxBadge) return;
    var sb = getSandbox();
    if (sb) {
      sandboxBadge.textContent = sb;
      sandboxBadge.classList.remove('is-empty');
    } else {
      sandboxBadge.textContent = 'not set';
      sandboxBadge.classList.add('is-empty');
    }
  }

  function normaliseDomain(input) {
    var raw = String(input || '').trim().toLowerCase();
    if (!raw) return '';
    raw = raw.replace(/^https?:\/\//, '').replace(/^www\./, '');
    raw = raw.split(/[\/?#]/)[0];
    return raw;
  }

  // True for inputs we can hand off to the brand-scraper as-is. Brand-name-only
  // text like "Nike" comes back false because the scraper itself needs a real
  // URL/domain to crawl — we still allow it for *lookup* (fuzzy match against
  // existing scrapes), but not for kicking off a new scrape.
  function looksLikeUrl(input) {
    var raw = String(input || '').trim().toLowerCase();
    if (!raw) return false;
    if (/^https?:\/\//.test(raw)) return true;
    var bare = raw.replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[\/?#]/)[0];
    // Require a dot AND a valid TLD-ish suffix (≥2 chars, letters only).
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(bare) && /\.[a-z]{2,}$/.test(bare);
  }

  function hostFromUrl(u) {
    if (!u) return '';
    try {
      var parsed = new URL(u);
      return (parsed.hostname || '').toLowerCase().replace(/^www\./, '');
    } catch (_) {
      return normaliseDomain(u);
    }
  }

  // Normalise a single colour entry from crawlSummary.assets.colours into
  // { hex: '#RRGGBB', count: number } | null. The brand-scraper returns
  // { value, count } ordered by frequency, but older payloads might use
  // { hex } / { color } or plain strings — handle all three shapes.
  function normaliseColourEntry(entry) {
    if (!entry) return null;
    var raw = typeof entry === 'string'
      ? entry
      : (entry.hex || entry.color || entry.value || entry.colour);
    if (!raw) return null;
    var m = String(raw).trim().replace(/^#/, '');
    if (m.length === 3) m = m[0] + m[0] + m[1] + m[1] + m[2] + m[2];
    if (!/^[0-9a-fA-F]{6}$/.test(m)) return null;
    return {
      hex: '#' + m.toUpperCase(),
      count: typeof entry === 'object' && Number.isFinite(entry.count) ? entry.count : 0,
    };
  }

  // Build a deduped, frequency-ordered list of usable brand colours.
  // We intentionally keep pure white / pure black out of the picker because
  // they're never useful as a primary brand accent.
  function normaliseColourList(colours) {
    if (!Array.isArray(colours)) return [];
    var seen = Object.create(null);
    var out = [];
    for (var i = 0; i < colours.length; i++) {
      var n = normaliseColourEntry(colours[i]);
      if (!n) continue;
      if (n.hex === '#FFFFFF' || n.hex === '#000000') continue;
      if (seen[n.hex]) continue;
      seen[n.hex] = true;
      out.push(n);
    }
    return out;
  }

  // Choose the strongest brand-accent candidate: highest-frequency colour
  // that isn't extremely light or extremely dark. Falls back to the first
  // entry if every candidate is washed-out, or to Adobe's red (#E60000) if
  // the scrape returned no usable colours at all.
  function pickPrimaryColour(normalised) {
    if (!Array.isArray(normalised) || !normalised.length) return '#E60000';
    for (var i = 0; i < normalised.length; i++) {
      var hex = normalised[i].hex.replace('#', '');
      var r = parseInt(hex.slice(0, 2), 16);
      var g = parseInt(hex.slice(2, 4), 16);
      var b = parseInt(hex.slice(4, 6), 16);
      var lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum > 18 && lum < 235) return normalised[i].hex;
    }
    return normalised[0].hex;
  }

  // Render the click-to-pick swatch row under the brand colour input.
  // The primary is marked with a small "P" pip and selected by default.
  function renderBrandSwatches(normalised, primary) {
    if (!brandSwatchRow || !brandSwatchCaption) return;
    if (!normalised.length) {
      brandSwatchRow.hidden = true;
      brandSwatchCaption.hidden = true;
      brandSwatchRow.innerHTML = '';
      return;
    }
    brandSwatchCaption.hidden = false;
    brandSwatchRow.hidden = false;
    var primaryUpper = (primary || '').toUpperCase();
    brandSwatchRow.innerHTML = normalised.map(function (c) {
      var isPrimary = c.hex === primaryUpper;
      var classes = 'cj-brand-swatch'
        + (isPrimary ? ' is-primary' : '')
        + (isPrimary ? ' is-active' : '');
      var label = c.hex + (isPrimary ? ' (primary)' : '') + (c.count ? ' · seen ' + c.count + 'x' : '');
      return '<button type="button" role="radio" '
        + 'class="' + classes + '" '
        + 'data-hex="' + escapeAttr(c.hex) + '" '
        + 'aria-checked="' + (isPrimary ? 'true' : 'false') + '" '
        + 'aria-label="' + escapeAttr(label) + '" '
        + 'title="' + escapeAttr(label) + '">'
        + '<span class="cj-brand-swatch-fill" style="background:' + escapeAttr(c.hex) + '"></span>'
        + '</button>';
    }).join('');
  }

  // Mirror the active state when the user types a hex or uses the picker —
  // so the swatch row stays in sync even if the chosen value happens to
  // match one of the scraped colours.
  function highlightActiveSwatch(hex) {
    if (!brandSwatchRow) return;
    var target = (hex || '').toUpperCase();
    var btns = brandSwatchRow.querySelectorAll('.cj-brand-swatch');
    for (var i = 0; i < btns.length; i++) {
      var match = (btns[i].getAttribute('data-hex') || '').toUpperCase() === target;
      btns[i].classList.toggle('is-active', match);
      btns[i].setAttribute('aria-checked', match ? 'true' : 'false');
    }
  }

  function applyBrandColour(hex) {
    if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return;
    var upper = hex.toUpperCase();
    brandColourInput.value = upper;
    brandColourPicker.value = upper;
    highlightActiveSwatch(upper);
  }

  // ─── Live recolour (post-generation) ──────────────────────────────────
  //
  // The generated HTML uses CSS custom properties (--brand, --brand-dark)
  // and the iframes are blob:-loaded same-origin sandboxed, so we can
  // reach into contentDocument and inject a tiny override <style>. That
  // lets the user audition any colour from the scrape palette (or a
  // custom hex) instantly without paying another 60–120s Vertex AI bill.
  // We also mutate state.journeyData.client.{brandColour,darkColour} so
  // a subsequent PPTX download picks up the new colour, and persist the
  // override on the cached entry so reload + Load previous keeps it.

  function clientDarken(hex, amount) {
    var amt = Math.max(0, Math.min(1, amount == null ? 0.55 : amount));
    var h = String(hex || '').replace(/^#/, '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return '#1A1A1A';
    var r = Math.round(parseInt(h.slice(0, 2), 16) * (1 - amt));
    var g = Math.round(parseInt(h.slice(2, 4), 16) * (1 - amt));
    var b = Math.round(parseInt(h.slice(4, 6), 16) * (1 - amt));
    return '#' + [r, g, b].map(function (v) {
      var s = v.toString(16);
      return s.length === 1 ? '0' + s : s;
    }).join('').toUpperCase();
  }

  function injectIframeColourOverride(iframeEl, brand, dark) {
    if (!iframeEl) return;
    function apply() {
      var doc;
      try { doc = iframeEl.contentDocument; }
      catch (_) { return; }
      if (!doc || !doc.documentElement) return;
      var styleId = 'cj-colour-override';
      var style = doc.getElementById(styleId);
      if (!style) {
        style = doc.createElement('style');
        style.id = styleId;
        (doc.head || doc.documentElement).appendChild(style);
      }
      // Higher specificity than the original :root block by virtue of
      // appearing later in the document. We override --brand-dark too so
      // the right-rail panel + table accents track the new accent.
      style.textContent =
        ':root{--brand:' + brand + ' !important;--brand-dark:' + dark + ' !important;}';
    }
    // contentDocument is available immediately for blob: same-origin iframes,
    // but if the iframe is still loading we wait for the load event.
    var doc;
    try { doc = iframeEl.contentDocument; } catch (_) { doc = null; }
    if (doc && doc.readyState === 'complete') {
      apply();
    } else {
      iframeEl.addEventListener('load', apply, { once: true });
      // Defensive: also try again on next tick — some browsers fire load
      // synchronously for blob: URLs and we may miss the listener.
      setTimeout(apply, 0);
    }
  }

  function applyRecolour(hex, opts) {
    opts = opts || {};
    var upper = String(hex || '').toUpperCase();
    if (!/^#[0-9A-F]{6}$/.test(upper)) return;
    var dark = clientDarken(upper, 0.55);
    state.activeBrandColour = upper;
    if (state.journeyData && state.journeyData.client) {
      state.journeyData.client.brandColour = upper;
      state.journeyData.client.darkColour = dark;
    }
    injectIframeColourOverride(iframeJourney, upper, dark);
    injectIframeColourOverride(iframeOnePager, upper, dark);
    if (recolourPicker) recolourPicker.value = upper;
    if (recolourHex) recolourHex.value = upper;
    highlightActiveRecolourSwatch(upper);
    if (opts.persist !== false) persistRecolourToCache(upper);
  }

  function highlightActiveRecolourSwatch(hex) {
    if (!recolourSwatchesEl) return;
    var target = (hex || '').toUpperCase();
    var btns = recolourSwatchesEl.querySelectorAll('.cj-recolour-swatch');
    for (var i = 0; i < btns.length; i++) {
      var match = (btns[i].getAttribute('data-hex') || '').toUpperCase() === target;
      btns[i].classList.toggle('is-active', match);
      btns[i].setAttribute('aria-checked', match ? 'true' : 'false');
    }
  }

  function persistRecolourToCache(hex) {
    if (!state.selectedScrape) return;
    var sb = getSandbox();
    var entry = loadFromCache(sb, state.selectedScrape.scrapeId);
    if (!entry) return;
    entry.brandColour = hex;
    entry.colourOverride = hex;
    if (entry.journeyData && entry.journeyData.client) {
      entry.journeyData.client.brandColour = hex;
      entry.journeyData.client.darkColour = clientDarken(hex, 0.55);
    }
    try {
      localStorage.setItem(cacheKey(sb, state.selectedScrape.scrapeId), JSON.stringify(entry));
    } catch (_) { /* quota — ignore */ }
  }

  function renderRecolourPanel(scrapeColours, originalHex, activeHex) {
    if (!recolourEl || !recolourSwatchesEl) return;
    var colours = Array.isArray(scrapeColours) ? scrapeColours : [];
    if (!colours.length && !originalHex) {
      recolourEl.hidden = true;
      return;
    }
    recolourEl.hidden = false;
    var active = (activeHex || originalHex || '').toUpperCase();
    recolourSwatchesEl.innerHTML = colours.map(function (c) {
      var hex = c.hex.toUpperCase();
      var isActive = hex === active;
      var label = hex + (c.count ? ' · seen ' + c.count + 'x' : '');
      return '<button type="button" role="radio" class="cj-recolour-swatch' + (isActive ? ' is-active' : '') + '"' +
        ' data-hex="' + escapeAttr(hex) + '"' +
        ' aria-checked="' + (isActive ? 'true' : 'false') + '"' +
        ' aria-label="' + escapeAttr(label) + '"' +
        ' title="' + escapeAttr(label) + '">' +
        '<span class="cj-recolour-fill" style="background:' + escapeAttr(hex) + '"></span>' +
        '</button>';
    }).join('');
    if (recolourPicker) recolourPicker.value = active;
    if (recolourHex) recolourHex.value = active;
  }

  // ─── API ──────────────────────────────────────────────────────────────

  async function fetchScrapes(sandbox) {
    var r = await fetch('/api/brand-scraper/scrapes' + (sandbox ? ('?sandbox=' + encodeURIComponent(sandbox)) : ''));
    var data = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
    return Array.isArray(data.items) ? data.items : [];
  }

  async function fetchScrape(sandbox, scrapeId) {
    var r = await fetch('/api/brand-scraper/scrapes/' + encodeURIComponent(scrapeId) + (sandbox ? ('?sandbox=' + encodeURIComponent(sandbox)) : ''));
    if (!r.ok) {
      var d = await r.json().catch(function () { return {}; });
      throw new Error(d.error || ('HTTP ' + r.status));
    }
    return r.json();
  }

  // ─── Lookup ───────────────────────────────────────────────────────────

  async function lookupScrape() {
    var sandbox = getSandbox();
    if (!sandbox) {
      setStatus(lookupStatus, 'Choose a sandbox first.', 'error');
      return;
    }
    var domain = normaliseDomain(urlInput.value);
    if (!domain) {
      setStatus(lookupStatus, 'Enter a customer URL or domain.', 'error');
      return;
    }
    lookupBtn.disabled = true;
    setStatus(lookupStatus, 'Searching brand scrapes in sandbox "' + sandbox + '" for ' + domain + '…', '');
    summarySection.hidden = true;
    resultsSection.hidden = true;
    scrapeCard.innerHTML = '';
    if (recolourEl) recolourEl.hidden = true;
    hideLoadPrev();

    try {
      var summaries = await fetchScrapes(sandbox);
      // 4-tier match ladder. We use the strongest tier that yields any
      // results — so "nike.com" still wins exact, but "Nike" or "admir"
      // gracefully degrade to a contains match against host or brandName.
      // The minLen guard on tiers 3/4 prevents 2-letter inputs (e.g. "co")
      // from matching every scrape on the planet.
      var minSubstrLen = 3;
      var exact = [];
      var subdomain = [];
      var hostContains = [];
      var nameContains = [];
      for (var i = 0; i < summaries.length; i++) {
        var s = summaries[i];
        var host = hostFromUrl(s.url || s.baseUrl || '');
        var brandLc = String(s.brandName || '').toLowerCase();
        if (host) {
          if (host === domain) {
            exact.push(s);
            continue;
          }
          if (host.endsWith('.' + domain) || domain.endsWith('.' + host)) {
            subdomain.push(s);
            continue;
          }
          if (domain.length >= minSubstrLen && host.indexOf(domain) !== -1) {
            hostContains.push(s);
            continue;
          }
        }
        if (brandLc && domain.length >= minSubstrLen && brandLc.indexOf(domain) !== -1) {
          nameContains.push(s);
        }
      }

      var candidates = [];
      var matchKind = '';
      if (exact.length)            { candidates = exact;        matchKind = 'exact host'; }
      else if (subdomain.length)   { candidates = subdomain;    matchKind = 'subdomain'; }
      else if (hostContains.length){ candidates = hostContains; matchKind = 'host contains'; }
      else if (nameContains.length){ candidates = nameContains; matchKind = 'brand name contains'; }

      if (!candidates.length) {
        showScrapeMissing(domain, sandbox, /* expired */ false, urlInput.value);
        setStatus(lookupStatus, 'No brand scrape matches "' + domain + '" in sandbox "' + sandbox + '".', 'error');
        return;
      }

      // Newest first
      candidates.sort(function (a, b) {
        var ta = new Date(a.savedAt || a.updatedAt || 0).getTime();
        var tb = new Date(b.savedAt || b.updatedAt || 0).getTime();
        return tb - ta;
      });
      var pick = candidates[0];

      var matchSuffix = candidates.length > 1
        ? ' (' + candidates.length + ' ' + matchKind + ' matches; using newest)'
        : ' (' + matchKind + ' match)';
      setStatus(lookupStatus, 'Loading scrape "' + (pick.brandName || pick.scrapeId) + '"' + matchSuffix + '…', '');
      var hydrated = await fetchScrape(sandbox, pick.scrapeId);
      if (!hydrated) throw new Error('Failed to load scrape ' + pick.scrapeId);
      if (hydrated.payloadExpired) {
        showScrapeMissing(domain, sandbox, /* expired */ true, urlInput.value);
        setStatus(lookupStatus, 'Scrape payload has expired (>3 days). Re-run the scrape.', 'error');
        return;
      }
      onScrapeLoaded(hydrated);
      setStatus(lookupStatus, 'Found scrape from ' + new Date(hydrated.savedAt || pick.savedAt || Date.now()).toLocaleString() + '. Ready to generate.', 'success');
    } catch (e) {
      console.error('[client-journey] lookup failed', e);
      setStatus(lookupStatus, 'Lookup failed: ' + (e && e.message || e), 'error');
    } finally {
      lookupBtn.disabled = false;
    }
  }

  function showScrapeMissing(domain, sandbox, expired, rawInput) {
    summarySection.hidden = false;
    var hasUrl = looksLikeUrl(rawInput);
    var msg = expired
      ? 'The scrape for <strong>' + escapeHtml(domain) + '</strong> in sandbox "' + escapeHtml(sandbox) + '" exists but its payload has expired (bucket lifecycle is 3 days).'
      : 'No brand scrape for <strong>' + escapeHtml(domain) + '</strong> in sandbox "' + escapeHtml(sandbox) + '".';

    var actionHtml;
    if (hasUrl) {
      // Input is URL-shaped — we can pre-fill the scraper safely.
      actionHtml = ' <a href="brand-scraper.html?url=' +
        encodeURIComponent(/^https?:\/\//.test(rawInput) ? rawInput : ('https://' + domain)) +
        '&sandbox=' + encodeURIComponent(sandbox) +
        '">Run a scrape</a> first, then come back here.';
    } else {
      // Brand-name-only input ("Nike") can't be scraped directly — the
      // brand-scraper needs a real URL/domain to crawl. Send the user there
      // without a pre-filled URL so they enter the customer's site themselves.
      actionHtml = '<br><span class="cj-empty-hint">' +
        'To run a new scrape, you need the customer\'s exact URL or domain ' +
        '(e.g. <code>nike.com</code> or <code>https://www.nike.com/uk/</code>). ' +
        '<a href="brand-scraper.html?sandbox=' + encodeURIComponent(sandbox) + '">Open Brand scraper</a>' +
        ' and enter the full URL there, then come back here.' +
        '</span>';
    }

    scrapeCard.innerHTML = '<div class="cj-empty">' + msg + actionHtml + '</div>';
    document.getElementById('cjRefineForm').style.display = 'none';
  }

  // ─── Persona / journey-type dropdown suggestions ──────────────────────
  //
  // The brand scrape produces ~6 personas (with occupation/bio) and a mix
  // of detected + recommended marketing campaigns (with type/channel).
  // These map cleanly to the two free-text refinement fields, so we pipe
  // them into a <datalist> attached to each input — that gives a native
  // combobox UX (click input → suggestions, type to filter, custom values
  // still allowed) without us having to swap input modes or build a
  // custom popover. The hint below each input both surfaces the count
  // and exposes a "Show options" affordance for keyboards that don't
  // open the datalist on focus.
  //
  // We dedupe by lowercased value, cap to a sensible visible count, and
  // attach friendly secondary labels (occupation / campaign type) so the
  // user can pick confidently without having to bounce back to the
  // brand scraper page.

  var MAX_PERSONA_SUGGESTIONS = 12;
  var MAX_JOURNEY_TYPE_SUGGESTIONS = 16;

  function dedupeByValue(items) {
    var seen = Object.create(null);
    var out = [];
    for (var i = 0; i < items.length; i++) {
      var v = (items[i].value || '').trim();
      if (!v) continue;
      var k = v.toLowerCase();
      if (seen[k]) continue;
      seen[k] = true;
      out.push(items[i]);
    }
    return out;
  }

  function buildPersonaOptions(scrape) {
    var raw = scrape && scrape.personas && Array.isArray(scrape.personas.personas)
      ? scrape.personas.personas
      : (Array.isArray(scrape && scrape.personas) ? scrape.personas : []);
    var items = raw.map(function (p) {
      if (!p || typeof p !== 'object') return null;
      var name = (p.name || '').toString().trim();
      if (!name) return null;
      var bits = [];
      if (p.occupation) bits.push(p.occupation);
      else if (p.role) bits.push(p.role);
      if (p.age != null && p.age !== '') bits.push(p.age + 'y');
      if (p.location) bits.push(p.location);
      return {
        value: name,
        label: bits.filter(Boolean).join(' · '),
      };
    }).filter(Boolean);
    return dedupeByValue(items).slice(0, MAX_PERSONA_SUGGESTIONS);
  }

  function buildJourneyTypeOptions(scrape) {
    var raw = scrape && scrape.campaigns && Array.isArray(scrape.campaigns.campaigns)
      ? scrape.campaigns.campaigns
      : (Array.isArray(scrape && scrape.campaigns) ? scrape.campaigns : []);
    // Detected campaigns first (more concrete to the brand), then suggestions.
    var detected = [];
    var suggested = [];
    for (var i = 0; i < raw.length; i++) {
      var c = raw[i];
      if (!c || typeof c !== 'object') continue;
      var name = (c.name || '').toString().trim();
      if (!name) continue;
      var bits = [];
      if (c.type) bits.push(c.type);
      if (c.channel) bits.push(c.channel);
      var entry = {
        value: name,
        label: bits.filter(Boolean).join(' · '),
        recommendation: !!c.is_recommendation,
      };
      if (c.is_recommendation) suggested.push(entry);
      else detected.push(entry);
    }
    var ordered = detected.concat(suggested);
    return dedupeByValue(ordered).slice(0, MAX_JOURNEY_TYPE_SUGGESTIONS);
  }

  function renderDatalist(datalistEl, options) {
    if (!datalistEl) return;
    datalistEl.innerHTML = '';
    if (!options.length) return;
    var frag = document.createDocumentFragment();
    for (var i = 0; i < options.length; i++) {
      var o = document.createElement('option');
      o.value = options[i].value;
      // Chrome/Edge show the `label` next to the value in the dropdown;
      // Safari ignores it but still renders the value, so we lose nothing.
      if (options[i].label) o.label = options[i].label;
      frag.appendChild(o);
    }
    datalistEl.appendChild(frag);
  }

  function renderSuggestionHint(hintEl, inputEl, options, kind) {
    if (!hintEl) return;
    if (!options.length) {
      hintEl.hidden = true;
      hintEl.textContent = '';
      return;
    }
    hintEl.hidden = false;
    hintEl.textContent = options.length + ' ' + kind + ' from this scrape — start typing or ';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cj-suggest-hint-link';
    btn.textContent = 'show options';
    btn.addEventListener('click', function () {
      if (!inputEl) return;
      inputEl.focus();
      // Nudge the native datalist popover open by selecting the field
      // and dispatching an input event — works on Chromium-based browsers.
      try { inputEl.select(); } catch (_e) { /* no-op */ }
    });
    hintEl.appendChild(btn);
  }

  function populateSuggestions(scrape) {
    var personaOpts = buildPersonaOptions(scrape);
    var journeyOpts = buildJourneyTypeOptions(scrape);
    renderDatalist(document.getElementById('cjPersonaOptions'), personaOpts);
    renderDatalist(document.getElementById('cjJourneyTypeOptions'), journeyOpts);
    renderSuggestionHint($('cjPersonaHint'), personaInput, personaOpts, personaOpts.length === 1 ? 'persona' : 'personas');
    renderSuggestionHint($('cjJourneyTypeHint'), journeyTypeInput, journeyOpts, journeyOpts.length === 1 ? 'campaign' : 'campaigns');
  }

  function onScrapeLoaded(scrape) {
    state.selectedScrape = scrape;
    summarySection.hidden = false;
    document.getElementById('cjRefineForm').style.display = '';

    populateSuggestions(scrape);

    var cs = scrape.crawlSummary || {};
    var assets = cs.assets || {};
    var allColours = normaliseColourList(assets.colours);
    var colours = allColours.slice(0, 8);
    var primary = pickPrimaryColour(colours);
    state.scrapeColours = colours;

    var hostUrl = scrape.url || '';
    var clearbitDomain = hostFromUrl(hostUrl);
    var logoSrc = clearbitDomain ? ('https://logo.clearbit.com/' + clearbitDomain) : '';

    var swatchesHtml = colours.map(function (c) {
      return '<span class="cj-colour-swatch" style="background:' + escapeAttr(c.hex) + '" title="' + escapeAttr(c.hex) + '"></span>';
    }).join('');

    // Check for a cached previous generation BEFORE writing the card so we
    // can stamp a ✓ Cached pill onto the brand-name row.
    var sandbox = getSandbox();
    var cached = loadFromCache(sandbox, scrape.scrapeId);
    var cachedPillHtml = cached
      ? '<span class="cj-cached-pill" title="A previous result is cached in this browser">✓ Cached</span>'
      : '';

    scrapeCard.innerHTML =
      '<div class="cj-brand-row">' +
        (logoSrc ? '<img class="cj-logo" alt="" src="' + escapeAttr(logoSrc) + '" onerror="this.style.display=\'none\'">' : '') +
        '<div>' +
          '<div class="cj-brand-name">' + escapeHtml(scrape.brandName || clearbitDomain || 'Brand') + cachedPillHtml + '</div>' +
          '<div class="cj-brand-meta">' + escapeHtml(hostUrl || '') + '</div>' +
        '</div>' +
      '</div>' +
      '<dl>' +
        '<dt>Industry</dt><dd>' + escapeHtml(scrape.industry || '—') + '</dd>' +
        '<dt>Country</dt><dd>' + escapeHtml(scrape.country || '—') + '</dd>' +
        '<dt>Pages</dt><dd>' + escapeHtml(String((cs.pagesScraped != null ? cs.pagesScraped : (Array.isArray(cs.pages) ? cs.pages.length : '—')))) + '</dd>' +
        '<dt>Saved</dt><dd>' + escapeHtml(scrape.savedAt ? new Date(scrape.savedAt).toLocaleString() : '—') + '</dd>' +
        '<dt>Brand colours</dt><dd><div class="cj-colours">' + swatchesHtml + '</div></dd>' +
      '</dl>';

    renderBrandSwatches(colours, primary);
    applyBrandColour(primary);

    // Surface previously generated assets if we have a cache hit. Pre-fill
    // the refinement inputs with whatever was used last time so the user
    // can either restore it or tweak + regenerate without losing context.
    if (cached) {
      if (cached.brandColour) applyBrandColour(cached.brandColour);
      if (cached.journeyType) journeyTypeInput.value = cached.journeyType;
      if (cached.personaName) personaInput.value = cached.personaName;
      showLoadPrev(cached);
    } else {
      hideLoadPrev();
      resultsSection.hidden = true;
    }
  }

  // ─── Generate progress tracker ────────────────────────────────────────
  //
  // The Vertex AI call is opaque (one round-trip, no streamed progress),
  // so we fake a determinate bar by easing fill % toward 95 over the
  // expected window (default ~110s). We swap to an indeterminate stripe
  // animation if Vertex overruns, and snap to 100% on success or red on
  // error. Stage text steps through the rough phases the backend goes
  // through so the user knows the request is alive.

  var STAGES = [
    // [seconds-into-call, stage text]
    [0,   'Loading brand scrape from sandbox…'],
    [3,   'Preparing prompt for Vertex AI Gemini…'],
    [12,  'Generating 12-step customer journey…'],
    [80,  'Refining journey content with brand context…'],
    [110, 'Rendering interactive HTML + one-pager…'],
    [140, 'Still working — Vertex AI is taking longer than usual…'],
  ];

  var progress = {
    rafId: null,
    startedAt: 0,
    stageIdx: -1,
    estimatedSeconds: 110,
    overrunHandled: false,

    start: function () {
      if (!progressEl) return;
      progress.startedAt = performance.now();
      progress.stageIdx = -1;
      progress.overrunHandled = false;
      progressEl.hidden = false;
      progressEl.classList.remove('is-success', 'is-error', 'is-overrun');
      progressFillEl.style.width = '0%';
      progressTrackEl.setAttribute('aria-valuenow', '0');
      progress.tick();
    },

    tick: function () {
      var elapsedMs = performance.now() - progress.startedAt;
      var elapsedSec = elapsedMs / 1000;
      var overrun = elapsedSec >= progress.estimatedSeconds;

      // Update stage label as soon as we cross each threshold.
      for (var i = STAGES.length - 1; i > progress.stageIdx; i--) {
        if (elapsedSec >= STAGES[i][0]) {
          progress.stageIdx = i;
          progressStageEl.textContent = STAGES[i][1];
          break;
        }
      }

      progressElapsedEl.textContent = formatElapsed(elapsedSec);

      if (overrun) {
        if (!progress.overrunHandled) {
          progressEl.classList.add('is-overrun');
          // Indeterminate state: drop the aria-valuenow so screen readers
          // know it's no longer a known-progress bar.
          progressTrackEl.removeAttribute('aria-valuenow');
          progress.overrunHandled = true;
        }
      } else {
        // Smooth easing curve: fast at first, slows asymptotically toward 95%.
        var pct = 95 * (1 - Math.pow(1 - elapsedSec / progress.estimatedSeconds, 2));
        progressFillEl.style.width = pct.toFixed(1) + '%';
        progressTrackEl.setAttribute('aria-valuenow', String(Math.round(pct)));
      }

      progress.rafId = requestAnimationFrame(progress.tick);
    },

    finish: function (kind, finalText) {
      if (!progressEl) return;
      if (progress.rafId) {
        cancelAnimationFrame(progress.rafId);
        progress.rafId = null;
      }
      progressEl.classList.remove('is-overrun');
      if (kind === 'success') {
        progressEl.classList.add('is-success');
        progressFillEl.style.width = '100%';
        progressTrackEl.setAttribute('aria-valuenow', '100');
      } else {
        progressEl.classList.add('is-error');
      }
      if (finalText) progressStageEl.textContent = finalText;
      // Auto-hide after a moment on success so the panel doesn't stay cluttered.
      if (kind === 'success') {
        setTimeout(function () {
          if (progressEl.classList.contains('is-success')) progressEl.hidden = true;
        }, 2500);
      }
    },
  };

  function formatElapsed(seconds) {
    var s = Math.max(0, Math.round(seconds));
    if (s < 60) return s + 's';
    var m = Math.floor(s / 60);
    var rem = s % 60;
    return m + 'm ' + (rem < 10 ? '0' : '') + rem + 's';
  }

  // ─── Generate ─────────────────────────────────────────────────────────

  async function generate() {
    if (!state.selectedScrape) {
      setStatus(generateStatus, 'Look up a scrape first.', 'error');
      return;
    }
    var sandbox = getSandbox();
    var brandColour = (brandColourInput.value || '').trim() || '#E60000';
    if (!/^#[0-9a-fA-F]{6}$/.test(brandColour)) {
      setStatus(generateStatus, 'Brand colour must be a #RRGGBB hex.', 'error');
      return;
    }
    var journeyType = (journeyTypeInput.value || '').trim();
    var personaName = (personaInput.value || '').trim();

    generateBtn.disabled = true;
    setStatus(generateStatus, '', '');
    resultsSection.hidden = true;
    progress.start();

    try {
      var resp = await fetch(GENERATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sandbox: sandbox,
          scrapeId: state.selectedScrape.scrapeId,
          brandColour: brandColour,
          journeyType: journeyType || undefined,
          personaName: personaName || undefined,
          clientName: state.selectedScrape.brandName || undefined,
        }),
      });
      var data = await resp.json().catch(function () { return {}; });
      if (!resp.ok || !data.ok) throw new Error((data && data.error) || ('HTTP ' + resp.status));

      state.journeyData = data.journeyData;
      state.originalBrandColour = brandColour.toUpperCase();
      state.activeBrandColour = brandColour.toUpperCase();
      mountIframe(iframeJourney, data.htmlJourney, 'journey');
      mountIframe(iframeOnePager, data.htmlOnePager, 'onepager');
      renderRecolourPanel(state.scrapeColours, state.originalBrandColour, state.activeBrandColour);

      // Persist so the user can restore this result on their next visit
      // without burning another 60–120s Vertex AI call. Keyed by sandbox
      // + scrapeId so multiple customers and sandboxes coexist cleanly.
      saveToCache(sandbox, state.selectedScrape.scrapeId, {
        brandName: state.selectedScrape.brandName,
        brandColour: brandColour,
        originalBrandColour: brandColour,
        journeyType: journeyType,
        personaName: personaName,
        journeyData: data.journeyData,
        htmlJourney: data.htmlJourney,
        htmlOnePager: data.htmlOnePager,
      });
      // Refresh the banner so it reflects "just now" + the new refinements
      // (and the pill on the scrape card if it wasn't there before).
      var fresh = loadFromCache(sandbox, state.selectedScrape.scrapeId);
      if (fresh) showLoadPrev(fresh);
      var pill = scrapeCard.querySelector('.cj-cached-pill');
      if (!pill) {
        var nameEl = scrapeCard.querySelector('.cj-brand-name');
        if (nameEl) {
          nameEl.insertAdjacentHTML('beforeend',
            ' <span class="cj-cached-pill" title="A previous result is cached in this browser">\u2713 Cached</span>');
        }
      }

      resultsSection.hidden = false;
      progress.finish('success', 'Generated successfully');
      setStatus(generateStatus, 'Use the tabs to switch views, the \u26F6 icon for full-screen, or download the PPTX.', 'success');
      activateTab('journey');
    } catch (e) {
      console.error('[client-journey] generate failed', e);
      progress.finish('error', 'Generate failed: ' + (e && e.message || e));
      setStatus(generateStatus, 'Generate failed: ' + (e && e.message || e), 'error');
    } finally {
      generateBtn.disabled = false;
    }
  }

  function mountIframe(iframeEl, html, kind) {
    var blobKey = kind === 'journey' ? 'journeyBlobUrl' : 'onePagerBlobUrl';
    if (state[blobKey]) {
      try { URL.revokeObjectURL(state[blobKey]); } catch (_) { /* noop */ }
    }
    var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    state[blobKey] = url;
    iframeEl.src = url;
  }

  // ─── PPTX download ────────────────────────────────────────────────────

  async function downloadPptx() {
    if (!state.journeyData) {
      setStatus(generateStatus, 'Generate the journey first.', 'error');
      return;
    }
    downloadPptxBtn.disabled = true;
    var originalLabel = downloadPptxBtn.textContent;
    downloadPptxBtn.textContent = 'Building PPTX…';
    try {
      var resp = await fetch('/api/client-journey/pptx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ journeyData: state.journeyData }),
      });
      if (!resp.ok) {
        var t = await resp.text().catch(function () { return ''; });
        throw new Error(t || ('HTTP ' + resp.status));
      }
      var blob = await resp.blob();
      var slug = (state.journeyData.client && (state.journeyData.client.slug || state.journeyData.client.name)) || 'client';
      slug = String(slug).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = slug + '-one-pager.pptx';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        URL.revokeObjectURL(a.href);
        a.remove();
      }, 1000);
    } catch (e) {
      console.error('[client-journey] PPTX download failed', e);
      setStatus(generateStatus, 'PPTX download failed: ' + (e && e.message || e), 'error');
    } finally {
      downloadPptxBtn.disabled = false;
      downloadPptxBtn.textContent = originalLabel || 'Download PPTX';
    }
  }

  // ─── Tabs + per-embed fullscreen ──────────────────────────────────────

  function activateTab(name) {
    var isJourney = name === 'journey';
    tabJourney.setAttribute('aria-selected', isJourney ? 'true' : 'false');
    tabOnePager.setAttribute('aria-selected', isJourney ? 'false' : 'true');
    embedJourney.hidden = !isJourney;
    embedOnePager.hidden = isJourney;
  }

  function bindFullscreenButtons() {
    var btns = document.querySelectorAll('.cj-fullscreen-btn');
    Array.prototype.forEach.call(btns, function (btn) {
      btn.addEventListener('click', function () {
        var targetId = btn.getAttribute('data-target');
        var el = document.getElementById(targetId);
        if (!el) return;
        var doc = document;
        var isFs = (doc.fullscreenElement === el) || (doc.webkitFullscreenElement === el);
        if (isFs) {
          if (doc.exitFullscreen) doc.exitFullscreen();
          else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
        } else {
          if (el.requestFullscreen) el.requestFullscreen().catch(function (err) { console.warn('FS request failed', err); });
          else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
        }
      });
    });
    document.addEventListener('fullscreenchange', updateFsAria);
    document.addEventListener('webkitfullscreenchange', updateFsAria);
  }

  function updateFsAria() {
    var fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    var btns = document.querySelectorAll('.cj-fullscreen-btn');
    Array.prototype.forEach.call(btns, function (btn) {
      var targetId = btn.getAttribute('data-target');
      var el = document.getElementById(targetId);
      var isFs = el && fsEl === el;
      btn.setAttribute('aria-pressed', isFs ? 'true' : 'false');
      btn.setAttribute('aria-label', isFs ? 'Exit full screen' : 'Enter full screen');
    });
  }

  // ─── Misc ─────────────────────────────────────────────────────────────

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function escapeAttr(s) { return escapeHtml(s); }

  function syncBrandColourInputs() {
    brandColourInput.addEventListener('input', function () {
      var v = brandColourInput.value.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(v)) {
        brandColourPicker.value = v;
        highlightActiveSwatch(v);
      }
    });
    brandColourPicker.addEventListener('input', function () {
      var v = brandColourPicker.value.toUpperCase();
      brandColourInput.value = v;
      highlightActiveSwatch(v);
    });
    if (brandSwatchRow) {
      brandSwatchRow.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest && e.target.closest('.cj-brand-swatch');
        if (!btn) return;
        var hex = btn.getAttribute('data-hex');
        if (hex) applyBrandColour(hex);
      });
    }
  }

  // ─── Init ─────────────────────────────────────────────────────────────

  function init() {
    if (!lookupBtn) return;
    lookupBtn.addEventListener('click', lookupScrape);
    urlInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); lookupScrape(); }
    });
    generateBtn.addEventListener('click', generate);
    downloadPptxBtn.addEventListener('click', downloadPptx);
    tabJourney.addEventListener('click', function () { activateTab('journey'); });
    tabOnePager.addEventListener('click', function () { activateTab('onepager'); });
    if (prevLoadBtn) {
      prevLoadBtn.addEventListener('click', function () {
        if (!state.selectedScrape) return;
        var entry = loadFromCache(getSandbox(), state.selectedScrape.scrapeId);
        if (!entry) {
          setStatus(generateStatus, 'No cached result for this scrape any more — generate a fresh one.', 'error');
          hideLoadPrev();
          return;
        }
        applyCachedEntry(entry);
      });
    }
    if (prevForgetBtn) {
      prevForgetBtn.addEventListener('click', function () {
        if (!state.selectedScrape) return;
        var sb = getSandbox();
        var key = cacheKey(sb, state.selectedScrape.scrapeId);
        try { localStorage.removeItem(key); } catch (_) {}
        var idx = readCacheIndex().filter(function (k) { return k !== key; });
        writeCacheIndex(idx);
        hideLoadPrev();
        var pill = scrapeCard.querySelector('.cj-cached-pill');
        if (pill) pill.remove();
        setStatus(generateStatus, 'Cached result forgotten.', '');
      });
    }
    if (recolourSwatchesEl) {
      recolourSwatchesEl.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest && e.target.closest('.cj-recolour-swatch');
        if (!btn) return;
        var hex = btn.getAttribute('data-hex');
        if (hex) applyRecolour(hex);
      });
    }
    if (recolourPicker) {
      recolourPicker.addEventListener('input', function () {
        applyRecolour(recolourPicker.value);
      });
    }
    if (recolourHex) {
      recolourHex.addEventListener('input', function () {
        var v = recolourHex.value.trim();
        if (/^#[0-9a-fA-F]{6}$/.test(v)) applyRecolour(v);
      });
    }
    if (recolourReset) {
      recolourReset.addEventListener('click', function () {
        if (state.originalBrandColour) applyRecolour(state.originalBrandColour);
      });
    }
    // EyeDropper API (Chrome / Edge / Opera 95+). When supported, expose a
    // sampler button that lets the user click anywhere on the screen — even
    // outside the browser — to pick a colour. On unsupported browsers
    // (Firefox, Safari) the button stays hidden so we degrade gracefully.
    if (recolourEyedropper && typeof window.EyeDropper === 'function') {
      recolourEyedropper.hidden = false;
      recolourEyedropper.addEventListener('click', async function () {
        if (recolourEyedropper.classList.contains('is-active')) return;
        recolourEyedropper.classList.add('is-active');
        try {
          var dropper = new window.EyeDropper();
          var result = await dropper.open();
          if (result && result.sRGBHex) {
            applyRecolour(result.sRGBHex);
            setStatus(generateStatus, 'Recoloured to ' + result.sRGBHex.toUpperCase() + ' from screen sample.', 'success');
          }
        } catch (e) {
          // User cancelled (Esc) → AbortError; anything else is unexpected.
          if (e && e.name !== 'AbortError') {
            console.warn('[client-journey] eyedropper failed', e);
            setStatus(generateStatus, 'Eyedropper failed: ' + (e && e.message || e), 'error');
          }
        } finally {
          recolourEyedropper.classList.remove('is-active');
        }
      });
    }
    syncBrandColourInputs();
    bindFullscreenButtons();
    refreshSandboxBadge();
    window.addEventListener('aep-lab-sandbox-synced', refreshSandboxBadge);
    window.addEventListener('storage', function (e) {
      if (!e || !e.key) return;
      if (e.key === 'aepSandboxName' || e.key.indexOf('aepGlobal') === 0) {
        refreshSandboxBadge();
      }
    });
    try {
      var qs = new URLSearchParams(window.location.search);
      if (qs.get('url')) urlInput.value = qs.get('url');
    } catch (_) { /* noop */ }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
