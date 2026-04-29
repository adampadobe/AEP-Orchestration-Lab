/*
 * Demo use case assets — orchestrator script.
 *
 * Sister of client-journey-asset.js. Same flow shape:
 *   1. Read the active sandbox from window.AepGlobalSandbox.
 *   2. Look up a brand scrape in that sandbox by URL/domain/brand-name.
 *   3. Show the scrape card + a refine form (brand colour, use case,
 *      Adobe products multi-select, step count, persona, optional image
 *      uploads, additional context). Cache hit shows "Load previous"
 *      + "Forget" inline buttons next to Generate.
 *   4. POST /api/demo-use-case/generate — backend asks Vertex AI Gemini
 *      to design a 3-slide deck (framing → experience → value),
 *      returns the JSON + 3 ready-to-render HTML strings.
 *   5. Render each HTML in a sandboxed iframe via blob URL (full-screen
 *      friendly), with per-tab fullscreen + recolour panel.
 *   6. "Refine with Vertex AI" sends the current demoData + a freeform
 *      prompt back to /generate for in-place updates.
 *   7. "Download PPTX" POSTs demoData + uploaded images to /api/demo-
 *      use-case/pptx and streams the binary back as a download.
 *
 * Copy-and-adapt from client-journey-asset.js for v1 (per the plan); a
 * follow-up may extract a shared aep-asset-tools.js module.
 */

(function () {
  'use strict';

  // Same reasoning as client-journey: /api/* rewrites cap at 60s and
  // Vertex calls run 60-120s. Hit the Cloud Function URL directly for
  // /generate and use the rewrite for the fast PPTX render.
  var FN_BASE = 'https://us-central1-aep-orchestration-lab.cloudfunctions.net';
  var GENERATE_URL = FN_BASE + '/demoUseCaseGenerate';
  var PPTX_URL = '/api/demo-use-case/pptx';

  // Closed Adobe products list — must stay in sync with ADOBE_PRODUCTS
  // in functions/demoUseCaseAssetService.js so the multi-select chips
  // can only check products the backend will accept.
  var ADOBE_PRODUCTS = [
    'Real-Time CDP',
    'Customer Journey Analytics',
    'Journey Optimizer',
    'Journey Optimizer Decisioning',
    'AEM Sites',
    'AEM Assets',
    'AEM Assets Dynamic Media',
    'Adobe Target',
    'Brand Concierge',
    'Mix Modeller',
    'Workfront',
    'Marketo Engage',
    'Commerce',
    'Product Analytics',
  ];

  // Image dropzones cap each upload at ~500KB after canvas downscale so
  // uploads plus demoData JSON fit in localStorage and the POST body.
  var IMAGE_LIMITS = {
    persona:      { maxWidth: 600,  maxHeight: 600,  quality: 0.86, mime: 'image/jpeg' },
    device:       { maxWidth: 1280, maxHeight: 800,  quality: 0.86, mime: 'image/jpeg' },
    lifestyle:    { maxWidth: 1280, maxHeight: 1280, quality: 0.86, mime: 'image/jpeg' },
    brandSurface: { maxWidth: 1600, maxHeight: 1000, quality: 0.82, mime: 'image/jpeg' },
    ajoCanvas:    { maxWidth: 1600, maxHeight: 900, quality: 0.82, mime: 'image/jpeg' },
    aepComposite: { maxWidth: 1600, maxHeight: 1200, quality: 0.82, mime: 'image/jpeg' },
  };
  var IMAGE_SLOTS = ['persona', 'device', 'lifestyle', 'brandSurface', 'ajoCanvas', 'aepComposite'];
  function emptyImages() {
    var o = {};
    IMAGE_SLOTS.forEach(function (k) { o[k] = ''; });
    return o;
  }

  function imageUrlFromV2Item(it) {
    if (!it || it.error) return '';
    var pub = it.publicUrl && String(it.publicUrl).trim();
    if (/^https?:\/\//i.test(pub)) return pub;
    var sig = it.signedUrl && String(it.signedUrl).trim();
    if (/^https?:\/\//i.test(sig)) return sig;
    return '';
  }

  function categoryOfV2(it) {
    return String((it.classification && it.classification.category) || '').toLowerCase();
  }

  /** Map classified crawl images (crawlSummary.assets.imagesV2) into deck slots; each URL at most once. */
  function pickScrapeImagesForSlots(imagesV2) {
    var out = emptyImages();
    if (!Array.isArray(imagesV2) || !imagesV2.length) return out;
    var items = [];
    for (var i = 0; i < imagesV2.length; i++) {
      var it = imagesV2[i];
      var url = imageUrlFromV2Item(it);
      if (!url) continue;
      items.push({ url: url, cat: categoryOfV2(it) });
    }
    var used = Object.create(null);
    function take(matchFn) {
      for (var j = 0; j < items.length; j++) {
        var x = items[j];
        if (!x.url || used[x.url]) continue;
        if (matchFn(x.cat)) {
          used[x.url] = true;
          return x.url;
        }
      }
      return '';
    }
    function takeCats(cats) {
      var set = Object.create(null);
      for (var c = 0; c < cats.length; c++) set[cats[c]] = true;
      return take(function (cat) { return !!set[cat]; });
    }

    out.persona = takeCats(['portrait']);
    out.brandSurface = takeCats(['hero_banner'])
      || take(function (cat) { return cat === 'lifestyle' || cat === 'product' || cat === 'illustration'; });
    out.lifestyle = takeCats(['lifestyle'])
      || take(function (cat) { return cat === 'hero_banner' || cat === 'decorative'; });
    out.ajoCanvas = takeCats(['infographic', 'illustration'])
      || take(function (cat) { return cat === 'hero_banner' || cat === 'product' || cat === 'decorative'; });
    out.aepComposite = takeCats(['product', 'infographic'])
      || take(function (cat) { return cat === 'illustration'; });
    out.device = take(function (cat) { return cat === 'product' || cat === 'hero_banner'; });
    return out;
  }

  function mergeScrapeImagesIntoState(scrape, onlyEmpty) {
    var v2 = (scrape && scrape.crawlSummary && scrape.crawlSummary.assets && scrape.crawlSummary.assets.imagesV2) || [];
    var picked = pickScrapeImagesForSlots(v2);
    IMAGE_SLOTS.forEach(function (slot) {
      var url = picked[slot];
      if (!url) return;
      if (onlyEmpty && state.images[slot]) return;
      state.images[slot] = url;
    });
  }

  function scrapeHasClassifiedImages(scrape) {
    var v2 = (scrape && scrape.crawlSummary && scrape.crawlSummary.assets && scrape.crawlSummary.assets.imagesV2) || [];
    if (!Array.isArray(v2)) return false;
    for (var i = 0; i < v2.length; i++) {
      if (!v2[i].error && imageUrlFromV2Item(v2[i])) return true;
    }
    return false;
  }

  function updateApplyScrapeImagesButton() {
    var btn = document.getElementById('ducApplyScrapeImagesBtn');
    if (!btn) return;
    var ok = !!(state.selectedScrape && scrapeHasClassifiedImages(state.selectedScrape));
    btn.disabled = !ok;
    btn.title = ok
      ? 'Maps classified crawl photos into the image slots (Framing, Experience, Value).'
      : 'No usable classified images on this scrape — run a crawl with images in Brand scraper first.';
  }

  // ─── DOM refs ─────────────────────────────────────────────────────────
  var $ = function (id) { return document.getElementById(id); };
  var sandboxBadge = $('ducSandboxBadge');
  var urlInput = $('ducUrl');
  var lookupBtn = $('ducLookupBtn');
  var lookupStatus = $('ducLookupStatus');
  var summarySection = $('ducScrapeSummary');
  var scrapeCard = $('ducScrapeCard');
  var brandColourInput = $('ducBrandColour');
  var brandColourPicker = $('ducBrandColourPicker');
  var brandSwatchRow = $('ducBrandSwatchRow');
  var brandSwatchCaption = $('ducBrandSwatchCaption');
  var useCaseInput = $('ducUseCase');
  var personaInput = $('ducPersona');
  var stepCountSelect = $('ducStepCount');
  var customProductInput = $('ducCustomProduct');
  var productsContainer = $('ducProducts');
  var generateBtn = $('ducGenerateBtn');
  var generateStatus = $('ducGenerateStatus');
  var progressEl = $('ducProgress');
  var progressStageEl = $('ducProgressStage');
  var progressElapsedEl = $('ducProgressElapsed');
  var progressTrackEl = $('ducProgressTrack');
  var progressFillEl = $('ducProgressFill');
  var resultsSection = $('ducResults');
  var tabFraming = $('ducTabFraming');
  var tabExperience = $('ducTabExperience');
  var tabValue = $('ducTabValue');
  var embedFraming = $('ducEmbedFraming');
  var embedExperience = $('ducEmbedExperience');
  var embedValue = $('ducEmbedValue');
  var iframeFraming = $('ducFramingIframe');
  var iframeExperience = $('ducExperienceIframe');
  var iframeValue = $('ducValueIframe');
  var downloadPptxBtn = $('ducDownloadPptxBtn');
  var prevLoadBtn = $('ducPrevLoadBtn');
  var prevForgetBtn = $('ducPrevForgetBtn');
  var recolourEl = $('ducRecolour');
  var recolourSwatchesEl = $('ducRecolourSwatches');
  var recolourPicker = $('ducRecolourPicker');
  var recolourHex = $('ducRecolourHex');
  var recolourReset = $('ducRecolourReset');
  var recolourEyedropper = $('ducRecolourEyedropper');
  var additionalContextInput = $('ducAdditionalContext');
  var refinePanel = $('ducRefinePanel');
  var refinePromptInput = $('ducRefinePrompt');
  var refineBtn = $('ducRefineBtn');
  var refineStatus = $('ducRefineStatus');

  // ─── State ────────────────────────────────────────────────────────────
  var state = {
    selectedScrape: null,
    demoData: null,
    framingBlobUrl: null,
    experienceBlobUrl: null,
    valueBlobUrl: null,
    scrapeColours: [],
    originalBrandColour: '',
    activeBrandColour: '',
    selectedProducts: [],     // Array<string> — checked product names
    images: emptyImages(), // data: URLs or https image URLs ('' = neutral SVG placeholder in HTML)
    activeTab: 'framing',
  };

  /** Cached GET /api/image-hosting/library for the active sandbox (images only). */
  var libraryImageCache = { sandbox: '', items: null };
  var libraryPickerFilterTimer = null;

  // Combobox handles — built once in init().
  var personaCombo = null;
  var useCaseCombo = null;

  // ─── Cache ────────────────────────────────────────────────────────────
  var CACHE_INDEX_KEY = 'duc-asset-cache:index';
  var CACHE_ENTRY_PREFIX = 'duc-asset-cache:entry:';
  var MAX_CACHE_ENTRIES = 8;

  function cacheKey(sandbox, scrapeId) { return CACHE_ENTRY_PREFIX + sandbox + '::' + scrapeId; }
  function readCacheIndex() {
    try { var raw = localStorage.getItem(CACHE_INDEX_KEY); var arr = raw ? JSON.parse(raw) : []; return Array.isArray(arr) ? arr : []; } catch (_) { return []; }
  }
  function writeCacheIndex(arr) { try { localStorage.setItem(CACHE_INDEX_KEY, JSON.stringify(arr)); } catch (_) {} }
  function evictOldestIfNeeded() {
    var idx = readCacheIndex();
    while (idx.length > MAX_CACHE_ENTRIES) { var oldest = idx.shift(); try { localStorage.removeItem(oldest); } catch (_) {} }
    writeCacheIndex(idx);
  }
  function loadFromCache(sandbox, scrapeId) {
    if (!sandbox || !scrapeId) return null;
    try {
      var raw = localStorage.getItem(cacheKey(sandbox, scrapeId));
      if (!raw) return null;
      var entry = JSON.parse(raw);
      if (!entry || !entry.demoData || !entry.framingHtml || !entry.experienceHtml || !entry.valueHtml) return null;
      return entry;
    } catch (_) { return null; }
  }
  function saveToCache(sandbox, scrapeId, payload) {
    if (!sandbox || !scrapeId || !payload) return;
    var key = cacheKey(sandbox, scrapeId);
    var entry = {
      sandbox: sandbox, scrapeId: scrapeId, generatedAt: Date.now(),
      brandName: payload.brandName || '',
      brandColour: payload.brandColour || '',
      originalBrandColour: payload.originalBrandColour || payload.brandColour || '',
      colourOverride: payload.colourOverride || undefined,
      useCase: payload.useCase || '',
      personaName: payload.personaName || '',
      stepCount: payload.stepCount || 6,
      products: payload.products || [],
      customProduct: payload.customProduct || '',
      additionalContext: payload.additionalContext || '',
      lastRefinementPrompt: payload.lastRefinementPrompt || '',
      images: Object.assign(emptyImages(), payload.images || {}),
      demoData: payload.demoData,
      framingHtml: payload.framingHtml,
      experienceHtml: payload.experienceHtml,
      valueHtml: payload.valueHtml,
    };
    try { localStorage.setItem(key, JSON.stringify(entry)); }
    catch (e) {
      console.warn('[demo-use-case] cache save failed, evicting oldest', e);
      var idx = readCacheIndex(); var oldest = idx.shift();
      if (oldest) { try { localStorage.removeItem(oldest); } catch (_) {} writeCacheIndex(idx); }
      try { localStorage.setItem(key, JSON.stringify(entry)); }
      catch (e2) { console.warn('[demo-use-case] cache save still failing — likely image upload too large', e2); return; }
    }
    var index = readCacheIndex();
    var existing = index.indexOf(key);
    if (existing !== -1) index.splice(existing, 1);
    index.push(key);
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
  function showLoadPrev(entry) {
    if (!prevLoadBtn) return;
    prevLoadBtn.textContent = 'Load previous result (' + relativeTime(entry.generatedAt) + ')';
    var bits = [];
    if (entry.brandColour) bits.push('colour ' + entry.brandColour);
    if (entry.useCase) bits.push('use case: ' + entry.useCase.slice(0, 40) + (entry.useCase.length > 40 ? '…' : ''));
    if (entry.personaName) bits.push('persona: ' + entry.personaName);
    if (entry.stepCount) bits.push(entry.stepCount + ' steps');
    if (entry.products && entry.products.length) bits.push(entry.products.length + ' product' + (entry.products.length === 1 ? '' : 's'));
    prevLoadBtn.title = 'Generated ' + new Date(entry.generatedAt).toLocaleString() + (bits.length ? ' — ' + bits.join(', ') : '');
    prevLoadBtn.hidden = false;
    if (prevForgetBtn) prevForgetBtn.hidden = false;
  }
  function hideLoadPrev() {
    if (prevLoadBtn) prevLoadBtn.hidden = true;
    if (prevForgetBtn) prevForgetBtn.hidden = true;
  }

  function applyCachedEntry(entry) {
    state.demoData = entry.demoData;
    state.originalBrandColour = String(entry.originalBrandColour || entry.brandColour || '').toUpperCase();
    state.activeBrandColour = String(entry.colourOverride || entry.brandColour || state.originalBrandColour).toUpperCase();
    if (additionalContextInput) additionalContextInput.value = entry.additionalContext || '';
    if (refinePromptInput) refinePromptInput.value = '';
    if (refineStatus) setStatus(refineStatus, '', '');
    state.images = Object.assign(emptyImages(), entry.images || {});
    syncDropzonePreviews();
    state.selectedProducts = Array.isArray(entry.products) ? entry.products.slice() : [];
    if (customProductInput) customProductInput.value = entry.customProduct || '';
    syncProductChips();
    if (useCaseInput) useCaseInput.value = entry.useCase || '';
    if (personaInput) personaInput.value = entry.personaName || '';
    if (stepCountSelect && entry.stepCount) stepCountSelect.value = String(entry.stepCount);
    mountIframe(iframeFraming, entry.framingHtml, 'framing');
    mountIframe(iframeExperience, entry.experienceHtml, 'experience');
    mountIframe(iframeValue, entry.valueHtml, 'value');
    resultsSection.hidden = false;
    activateTab('framing');
    renderRecolourPanel(state.scrapeColours, state.originalBrandColour, state.activeBrandColour);
    if (state.activeBrandColour && state.activeBrandColour !== state.originalBrandColour) {
      applyRecolour(state.activeBrandColour, { persist: false });
    }
    progress.finish('success', 'Loaded previously generated result from ' + relativeTime(entry.generatedAt));
    setStatus(generateStatus, 'Restored previous result. Generate again to replace it, or download the PPTX.', 'success');
    updateApplyScrapeImagesButton();
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
    } catch (_) {}
    return '';
  }
  function refreshSandboxBadge() {
    if (!sandboxBadge) return;
    var sb = getSandbox();
    if (sb) { sandboxBadge.textContent = sb; sandboxBadge.classList.remove('is-empty'); }
    else { sandboxBadge.textContent = 'not set'; sandboxBadge.classList.add('is-empty'); }
  }
  function normaliseDomain(input) {
    var raw = String(input || '').trim().toLowerCase();
    if (!raw) return '';
    raw = raw.replace(/^https?:\/\//, '').replace(/^www\./, '');
    raw = raw.split(/[\/?#]/)[0];
    return raw;
  }
  function looksLikeUrl(input) {
    var raw = String(input || '').trim().toLowerCase();
    if (!raw) return false;
    if (/^https?:\/\//.test(raw)) return true;
    var bare = raw.replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[\/?#]/)[0];
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(bare) && /\.[a-z]{2,}$/.test(bare);
  }
  function hostFromUrl(u) {
    if (!u) return '';
    try { var parsed = new URL(u); return (parsed.hostname || '').toLowerCase().replace(/^www\./, ''); }
    catch (_) { return normaliseDomain(u); }
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function escapeAttr(s) { return escapeHtml(s); }

  // ─── Brand colour swatches (pre-generation form) ──────────────────────

  function normaliseColourEntry(entry) {
    if (!entry) return null;
    var raw = typeof entry === 'string' ? entry : (entry.hex || entry.color || entry.value || entry.colour);
    if (!raw) return null;
    var m = String(raw).trim().replace(/^#/, '');
    if (m.length === 3) m = m[0] + m[0] + m[1] + m[1] + m[2] + m[2];
    if (!/^[0-9a-fA-F]{6}$/.test(m)) return null;
    return { hex: '#' + m.toUpperCase(), count: typeof entry === 'object' && Number.isFinite(entry.count) ? entry.count : 0 };
  }
  function normaliseColourList(colours) {
    if (!Array.isArray(colours)) return [];
    var seen = Object.create(null);
    var out = [];
    for (var i = 0; i < colours.length; i++) {
      var n = normaliseColourEntry(colours[i]); if (!n) continue;
      if (n.hex === '#FFFFFF' || n.hex === '#000000') continue;
      if (seen[n.hex]) continue;
      seen[n.hex] = true; out.push(n);
    }
    return out;
  }
  function pickPrimaryColour(normalised) {
    if (!Array.isArray(normalised) || !normalised.length) return '#E60000';
    for (var i = 0; i < normalised.length; i++) {
      var hex = normalised[i].hex.replace('#', '');
      var r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
      var lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum > 18 && lum < 235) return normalised[i].hex;
    }
    return normalised[0].hex;
  }
  function renderBrandSwatches(normalised, primary) {
    if (!brandSwatchRow || !brandSwatchCaption) return;
    if (!normalised.length) { brandSwatchRow.hidden = true; brandSwatchCaption.hidden = true; brandSwatchRow.innerHTML = ''; return; }
    brandSwatchCaption.hidden = false; brandSwatchRow.hidden = false;
    var primaryUpper = (primary || '').toUpperCase();
    brandSwatchRow.innerHTML = normalised.map(function (c) {
      var isPrimary = c.hex === primaryUpper;
      var classes = 'duc-brand-swatch' + (isPrimary ? ' is-primary is-active' : '');
      var label = c.hex + (isPrimary ? ' (primary)' : '') + (c.count ? ' · seen ' + c.count + 'x' : '');
      return '<button type="button" role="radio" class="' + classes + '" data-hex="' + escapeAttr(c.hex) + '" aria-checked="' + (isPrimary ? 'true' : 'false') + '" aria-label="' + escapeAttr(label) + '" title="' + escapeAttr(label) + '">' +
        '<span class="duc-brand-swatch-fill" style="background:' + escapeAttr(c.hex) + '"></span></button>';
    }).join('');
  }
  function highlightActiveSwatch(hex) {
    if (!brandSwatchRow) return;
    var target = (hex || '').toUpperCase();
    var btns = brandSwatchRow.querySelectorAll('.duc-brand-swatch');
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
  function clientDarken(hex, amount) {
    var amt = Math.max(0, Math.min(1, amount == null ? 0.55 : amount));
    var h = String(hex || '').replace(/^#/, '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return '#1A1A1A';
    var r = Math.round(parseInt(h.slice(0, 2), 16) * (1 - amt));
    var g = Math.round(parseInt(h.slice(2, 4), 16) * (1 - amt));
    var b = Math.round(parseInt(h.slice(4, 6), 16) * (1 - amt));
    return '#' + [r, g, b].map(function (v) { var s = v.toString(16); return s.length === 1 ? '0' + s : s; }).join('').toUpperCase();
  }
  function injectIframeColourOverride(iframeEl, brand, dark) {
    if (!iframeEl) return;
    function apply() {
      var doc; try { doc = iframeEl.contentDocument; } catch (_) { return; }
      if (!doc || !doc.documentElement) return;
      var styleId = 'duc-colour-override';
      var style = doc.getElementById(styleId);
      if (!style) { style = doc.createElement('style'); style.id = styleId; (doc.head || doc.documentElement).appendChild(style); }
      style.textContent = ':root{--brand:' + brand + ' !important;--brand-dark:' + dark + ' !important;}';
    }
    var doc; try { doc = iframeEl.contentDocument; } catch (_) { doc = null; }
    if (doc && doc.readyState === 'complete') apply();
    else { iframeEl.addEventListener('load', apply, { once: true }); setTimeout(apply, 0); }
  }
  function applyRecolour(hex, opts) {
    opts = opts || {};
    var upper = String(hex || '').toUpperCase();
    if (!/^#[0-9A-F]{6}$/.test(upper)) return;
    var dark = clientDarken(upper, 0.55);
    state.activeBrandColour = upper;
    if (state.demoData && state.demoData.client) {
      state.demoData.client.brandColour = upper;
      state.demoData.client.darkColour = dark;
    }
    injectIframeColourOverride(iframeFraming, upper, dark);
    injectIframeColourOverride(iframeExperience, upper, dark);
    injectIframeColourOverride(iframeValue, upper, dark);
    if (recolourPicker) recolourPicker.value = upper;
    if (recolourHex) recolourHex.value = upper;
    highlightActiveRecolourSwatch(upper);
    if (opts.persist !== false) persistRecolourToCache(upper);
  }
  function highlightActiveRecolourSwatch(hex) {
    if (!recolourSwatchesEl) return;
    var target = (hex || '').toUpperCase();
    var btns = recolourSwatchesEl.querySelectorAll('.duc-recolour-swatch');
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
    if (entry.demoData && entry.demoData.client) {
      entry.demoData.client.brandColour = hex;
      entry.demoData.client.darkColour = clientDarken(hex, 0.55);
    }
    try { localStorage.setItem(cacheKey(sb, state.selectedScrape.scrapeId), JSON.stringify(entry)); } catch (_) {}
  }
  function renderRecolourPanel(scrapeColours, originalHex, activeHex) {
    if (!recolourEl || !recolourSwatchesEl) return;
    var colours = Array.isArray(scrapeColours) ? scrapeColours : [];
    if (!colours.length && !originalHex) { recolourEl.hidden = true; return; }
    recolourEl.hidden = false;
    var active = (activeHex || originalHex || '').toUpperCase();
    recolourSwatchesEl.innerHTML = colours.map(function (c) {
      var hex = c.hex.toUpperCase();
      var isActive = hex === active;
      var label = hex + (c.count ? ' · seen ' + c.count + 'x' : '');
      return '<button type="button" role="radio" class="duc-recolour-swatch' + (isActive ? ' is-active' : '') + '"' +
        ' data-hex="' + escapeAttr(hex) + '" aria-checked="' + (isActive ? 'true' : 'false') + '"' +
        ' aria-label="' + escapeAttr(label) + '" title="' + escapeAttr(label) + '">' +
        '<span class="duc-recolour-fill" style="background:' + escapeAttr(hex) + '"></span></button>';
    }).join('');
    if (recolourPicker) recolourPicker.value = active;
    if (recolourHex) recolourHex.value = active;
  }

  // ─── Themed combobox ──────────────────────────────────────────────────
  function setupCombobox(opts) {
    var input = opts.input, toggle = opts.toggle, panel = opts.panel;
    if (!input || !toggle || !panel) return null;
    var allOptions = [], optionEls = [], activeIdx = -1;
    function isOpen() { return !panel.hidden; }
    function setOptions(next) {
      allOptions = Array.isArray(next) ? next : [];
      // Chevron is always visible so the input *looks* like a dropdown
      // affordance — we just dim it when there's nothing to suggest
      // so the user understands an open will say "no suggestions".
      // (Original behaviour was to hide the chevron entirely; that
      // hid the affordance for scrapes with empty campaigns/personas
      // and made the combobox indistinguishable from a plain input.)
      toggle.hidden = false;
      toggle.classList.toggle('is-empty', allOptions.length === 0);
    }
    function filterOptions(filterStr) {
      var f = (filterStr || '').toLowerCase().trim();
      if (!f) return allOptions.slice();
      return allOptions.filter(function (o) {
        var v = (o.value || '').toLowerCase(), lbl = (o.label || '').toLowerCase();
        return v.indexOf(f) !== -1 || lbl.indexOf(f) !== -1;
      });
    }
    function render(filterStr) {
      panel.innerHTML = ''; optionEls = []; activeIdx = -1;
      var filtered = filterOptions(filterStr);
      if (!filtered.length) {
        var empty = document.createElement('div');
        empty.className = 'duc-combo-empty';
        empty.textContent = allOptions.length ? 'No matches — keep typing to use a custom value.' : 'No suggestions available.';
        panel.appendChild(empty); return;
      }
      var frag = document.createDocumentFragment();
      filtered.forEach(function (o) {
        var btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'duc-combo-option'; btn.setAttribute('role', 'option'); btn.dataset.value = o.value;
        var v = document.createElement('span'); v.className = 'duc-combo-option-value'; v.textContent = o.value; btn.appendChild(v);
        if (o.label) { var l = document.createElement('span'); l.className = 'duc-combo-option-label'; l.textContent = o.label; btn.appendChild(l); }
        btn.addEventListener('mousedown', function (ev) {
          ev.preventDefault();
          input.value = btn.dataset.value;
          close(); input.focus();
          input.dispatchEvent(new Event('change', { bubbles: true }));
        });
        frag.appendChild(btn); optionEls.push(btn);
      });
      panel.appendChild(frag);
    }
    function open() {
      // Open even when there are zero options so the user gets a clear
      // "No suggestions available" panel instead of a silently-dead
      // chevron — discoverability over silence.
      render(input.value);
      panel.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-expanded', 'true');
    }
    function close() { panel.hidden = true; input.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-expanded', 'false'); activeIdx = -1; }
    function setActive(idx) {
      if (!optionEls.length) return;
      if (idx < 0) idx = optionEls.length - 1;
      if (idx >= optionEls.length) idx = 0;
      optionEls.forEach(function (el, i) { el.classList.toggle('is-active', i === idx); });
      activeIdx = idx;
      if (optionEls[idx] && optionEls[idx].scrollIntoView) optionEls[idx].scrollIntoView({ block: 'nearest' });
    }
    toggle.addEventListener('click', function () { if (isOpen()) close(); else open(); input.focus(); });
    input.addEventListener('input', function () {
      if (!isOpen()) open(); else render(input.value);
    });
    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'ArrowDown') { ev.preventDefault(); if (!isOpen()) open(); else setActive(activeIdx + 1); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); if (!isOpen()) open(); else setActive(activeIdx - 1); }
      else if (ev.key === 'Enter') {
        if (isOpen() && activeIdx >= 0) { ev.preventDefault(); input.value = optionEls[activeIdx].dataset.value; close(); input.dispatchEvent(new Event('change', { bubbles: true })); }
      } else if (ev.key === 'Escape') { if (isOpen()) { ev.preventDefault(); close(); } }
    });
    document.addEventListener('mousedown', function (ev) {
      if (!isOpen()) return;
      var t = ev.target;
      if (panel.contains(t) || t === input || t === toggle || toggle.contains(t)) return;
      close();
    });
    return { setOptions: setOptions, open: open, close: close };
  }

  // ─── Persona / use-case suggestions from the scrape ───────────────────
  function dedupeByValue(items) {
    var seen = Object.create(null), out = [];
    for (var i = 0; i < items.length; i++) {
      var v = (items[i].value || '').trim();
      if (!v) continue;
      var k = v.toLowerCase();
      if (seen[k]) continue;
      seen[k] = true; out.push(items[i]);
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
      return { value: name, label: bits.filter(Boolean).join(' · ') };
    }).filter(Boolean);
    return dedupeByValue(items).slice(0, 12);
  }
  // For use case: combine the scrape's campaigns (best signal — these
  // are real customer-facing journeys the brand actually runs or that
  // the scraper recommended) with a small set of "I want to ..." style
  // templates derived from the brand industry / persona occupations,
  // because some scrapes have empty campaigns[] and we still want the
  // dropdown to feel useful. The combobox stays freeform — picking a
  // suggestion just fills the input and the user can edit it into a
  // proper first-person sentence before generating.
  function buildUseCaseOptions(scrape) {
    var out = [];
    var campaignsRaw = scrape && scrape.campaigns && Array.isArray(scrape.campaigns.campaigns)
      ? scrape.campaigns.campaigns
      : (Array.isArray(scrape && scrape.campaigns) ? scrape.campaigns : []);
    var detected = [], suggested = [];
    for (var i = 0; i < campaignsRaw.length; i++) {
      var c = campaignsRaw[i];
      if (!c || typeof c !== 'object') continue;
      var name = (c.name || '').toString().trim();
      if (!name) continue;
      var bits = [];
      if (c.type) bits.push(c.type);
      if (c.channel) bits.push(c.channel);
      var entry = {
        value: name,
        label: bits.filter(Boolean).join(' · ') || 'campaign',
        recommendation: !!c.is_recommendation,
      };
      if (c.is_recommendation) suggested.push(entry); else detected.push(entry);
    }
    out = out.concat(detected, suggested);

    // Persona-derived templates: gives the user a quick "I want to ..."
    // starter even when the campaign list is thin. We only generate a
    // template per persona (max 4) so the dropdown doesn't explode.
    var personaRaw = scrape && scrape.personas && Array.isArray(scrape.personas.personas)
      ? scrape.personas.personas
      : (Array.isArray(scrape && scrape.personas) ? scrape.personas : []);
    var brand = (scrape && (scrape.brandName || scrape.url)) || 'this brand';
    var added = 0;
    for (var j = 0; j < personaRaw.length && added < 4; j++) {
      var p = personaRaw[j];
      if (!p || typeof p !== 'object') continue;
      var pname = (p.name || '').toString().trim();
      if (!pname) continue;
      // First-person template grounded in this persona's role.
      var role = (p.occupation || p.role || '').toString().trim();
      var tagline = role ? (' as a ' + role.toLowerCase()) : '';
      out.push({
        value: 'I want to discover and engage with ' + brand + tagline + '.',
        label: 'template · ' + pname,
      });
      added++;
    }

    return dedupeByValue(out).slice(0, 16);
  }
  function renderSuggestionHint(hintEl, options, kind) {
    if (!hintEl) return;
    if (!options.length) { hintEl.hidden = true; hintEl.textContent = ''; return; }
    hintEl.hidden = false;
    hintEl.textContent = options.length + ' ' + kind + ' from this scrape — pick from the list or type your own.';
  }
  function populateSuggestions(scrape) {
    var personaOpts = buildPersonaOptions(scrape);
    var useCaseOpts = buildUseCaseOptions(scrape);
    if (personaCombo) personaCombo.setOptions(personaOpts);
    if (useCaseCombo) useCaseCombo.setOptions(useCaseOpts);
    renderSuggestionHint($('ducPersonaHint'), personaOpts, personaOpts.length === 1 ? 'persona' : 'personas');
    renderSuggestionHint($('ducUseCaseHint'), useCaseOpts, useCaseOpts.length === 1 ? 'campaign' : 'campaigns');
  }

  // ─── Adobe products multi-select ──────────────────────────────────────
  function buildProductChips() {
    if (!productsContainer) return;
    productsContainer.innerHTML = ADOBE_PRODUCTS.map(function (p) {
      return '<button type="button" class="duc-product-chip" data-product="' + escapeAttr(p) + '" aria-pressed="false">' +
        '<svg class="check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>' +
        '<span>' + escapeHtml(p) + '</span>' +
        '</button>';
    }).join('');
    productsContainer.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest && e.target.closest('.duc-product-chip');
      if (!btn) return;
      var p = btn.getAttribute('data-product');
      var ix = state.selectedProducts.indexOf(p);
      if (ix === -1) state.selectedProducts.push(p);
      else state.selectedProducts.splice(ix, 1);
      syncProductChips();
    });
  }
  function syncProductChips() {
    if (!productsContainer) return;
    var chips = productsContainer.querySelectorAll('.duc-product-chip');
    var set = {}; state.selectedProducts.forEach(function (p) { set[p] = true; });
    Array.prototype.forEach.call(chips, function (chip) {
      var p = chip.getAttribute('data-product');
      var on = !!set[p];
      chip.classList.toggle('is-selected', on);
      chip.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  // ─── Image dropzones (with canvas downscale) ──────────────────────────
  // Each dropzone is independent — drag-drop, click-to-pick, paste, or
  // clear-to-fallback. We canvas-downscale to keep entries below 500KB
  // so the localStorage cache + the POST body stay reasonable.

  function readFileAsImage(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () {
        var img = new Image();
        img.onload = function () { resolve(img); };
        img.onerror = function () { reject(new Error('Could not decode image')); };
        img.src = fr.result;
      };
      fr.onerror = function () { reject(new Error('Could not read file')); };
      fr.readAsDataURL(file);
    });
  }

  function downscaleToDataUrl(img, slot) {
    var limits = IMAGE_LIMITS[slot] || IMAGE_LIMITS.persona;
    var sw = img.naturalWidth || img.width;
    var sh = img.naturalHeight || img.height;
    var ratio = Math.min(1, limits.maxWidth / sw, limits.maxHeight / sh);
    var w = Math.round(sw * ratio);
    var h = Math.round(sh * ratio);
    var canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    var dataUrl = canvas.toDataURL(limits.mime, limits.quality);
    // If output is still > 600KB, retry at lower quality.
    if (dataUrl.length > 600 * 1024 && limits.mime === 'image/jpeg') {
      dataUrl = canvas.toDataURL('image/jpeg', 0.7);
    }
    return dataUrl;
  }

  async function handleImageDrop(slot, file) {
    if (!file || !/^image\//.test(file.type)) {
      setStatus(generateStatus, 'That doesn\'t look like an image file.', 'error');
      return;
    }
    try {
      var img = await readFileAsImage(file);
      var dataUrl = downscaleToDataUrl(img, slot);
      state.images[slot] = dataUrl;
      syncDropzonePreviews();
    } catch (e) {
      console.warn('[demo-use-case] image upload failed', e);
      setStatus(generateStatus, 'Image upload failed: ' + (e && e.message || e), 'error');
    }
  }

  function syncDropzonePreviews() {
    IMAGE_SLOTS.forEach(function (slot) {
      var area = document.querySelector('[data-dz-target="' + slot + '"]');
      if (!area) return;
      var img = area.querySelector('.duc-dz-preview');
      var empty = area.querySelector('.duc-dz-empty');
      var clearBtn = document.querySelector('[data-dz-clear="' + slot + '"]');
      if (state.images[slot]) {
        if (img) { img.src = state.images[slot]; img.hidden = false; }
        if (empty) empty.style.display = 'none';
        if (clearBtn) clearBtn.hidden = false;
      } else {
        if (img) { img.removeAttribute('src'); img.hidden = true; }
        if (empty) empty.style.display = '';
        if (clearBtn) clearBtn.hidden = true;
      }
    });
  }

  function bindDropzones() {
    IMAGE_SLOTS.forEach(function (slot) {
      var area = document.querySelector('[data-dz-target="' + slot + '"]');
      if (!area) return;
      var fileInput = area.querySelector('input[type="file"]');
      area.addEventListener('click', function (e) {
        if (e.target && e.target.closest && e.target.closest('.duc-dz-clear')) return;
        if (e.target && e.target.closest && e.target.closest('.duc-dz-pick-library')) return;
        if (fileInput) fileInput.click();
      });
      area.addEventListener('dragover', function (e) { e.preventDefault(); area.classList.add('is-dragover'); });
      area.addEventListener('dragleave', function () { area.classList.remove('is-dragover'); });
      area.addEventListener('drop', function (e) {
        e.preventDefault();
        area.classList.remove('is-dragover');
        var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (file) handleImageDrop(slot, file);
      });
      if (fileInput) {
        fileInput.addEventListener('change', function () {
          var file = fileInput.files && fileInput.files[0];
          if (file) handleImageDrop(slot, file);
          fileInput.value = '';
        });
      }
      var clearBtn = document.querySelector('[data-dz-clear="' + slot + '"]');
      if (clearBtn) {
        clearBtn.addEventListener('click', function (e) {
          e.preventDefault(); e.stopPropagation();
          state.images[slot] = '';
          syncDropzonePreviews();
        });
      }
      var pickBtn = document.querySelector('[data-dz-pick-library="' + slot + '"]');
      if (pickBtn) {
        pickBtn.addEventListener('click', function (e) {
          e.preventDefault();
          e.stopPropagation();
          openLibraryPicker(slot);
        });
      }
    });
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
    if (!r.ok) { var d = await r.json().catch(function () { return {}; }); throw new Error(d.error || ('HTTP ' + r.status)); }
    return r.json();
  }

  async function fetchImageHostingLibrary(sandbox) {
    if (!sandbox) throw new Error('sandbox is required');
    var r = await fetch('/api/image-hosting/library?sandbox=' + encodeURIComponent(sandbox));
    var data = await r.json().catch(function () { return {}; });
    if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
    return Array.isArray(data.items) ? data.items : [];
  }

  function isLibraryImageFile(item) {
    if (!item || item.isFolderMarker) return false;
    var f = String(item.file || '');
    if (f === '.aep-library-folder' || f.indexOf('.aep-library-folder') !== -1) return false;
    var ct = String(item.contentType || '').toLowerCase();
    if (ct.indexOf('image/') === 0) return true;
    var ext = (f.split('.').pop() || '').toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp'].indexOf(ext) !== -1;
  }

  function absoluteLibraryImageUrl(item) {
    if (!item) return '';
    var pub = item.publicUrl && String(item.publicUrl).trim();
    if (/^https?:\/\//i.test(pub)) return pub;
    var cdn = item.cdnUrl && String(item.cdnUrl).trim();
    if (cdn && cdn.charAt(0) === '/') {
      try {
        var o = (window.location && window.location.origin) || '';
        if (o) return o + cdn;
      } catch (_e) { /* ignore */ }
    }
    return cdn || pub || '';
  }

  var SLOT_LIBRARY_LABELS = {
    brandSurface: 'Brand surface',
    persona: 'Persona photo',
    device: 'Step mockup',
    ajoCanvas: 'AJO canvas',
    lifestyle: 'Lifestyle photo',
    aepComposite: 'AEP composite',
  };

  async function loadLibraryImageItemsForSandbox() {
    var sb = getSandbox();
    if (!sb) throw new Error('Choose a sandbox first.');
    if (libraryImageCache.sandbox === sb && libraryImageCache.items) return libraryImageCache.items;
    var raw = await fetchImageHostingLibrary(sb);
    var filtered = [];
    for (var i = 0; i < raw.length; i++) {
      if (isLibraryImageFile(raw[i])) filtered.push(raw[i]);
    }
    libraryImageCache.sandbox = sb;
    libraryImageCache.items = filtered;
    return filtered;
  }

  function renderLibraryPickerTiles(targetSlot, filterText) {
    var grid = document.getElementById('ducLibraryPickerGrid');
    var emptyEl = document.getElementById('ducLibraryPickerEmpty');
    if (!grid) return;
    var items = libraryImageCache.items || [];
    var q = String(filterText || '').trim().toLowerCase();
    var list = !q ? items.slice() : items.filter(function (it) {
      var rel = String(it.relPath || '').toLowerCase();
      return rel.indexOf(q) !== -1;
    });
    grid.innerHTML = '';
    if (!list.length) {
      if (emptyEl) {
        if (q && items.length) {
          emptyEl.textContent = 'No library files match that filter.';
        } else if (!items.length) {
          emptyEl.textContent = 'No image files in this sandbox library yet. Open Image hosting to publish assets from a scrape.';
        } else {
          emptyEl.textContent = 'No matches.';
        }
        emptyEl.hidden = false;
      }
      return;
    }
    if (emptyEl) {
      emptyEl.textContent = 'No image files in this sandbox library yet. Open Image hosting to publish assets from a scrape.';
      emptyEl.hidden = true;
    }
    for (var j = 0; j < list.length; j++) {
      (function (item) {
        var url = absoluteLibraryImageUrl(item);
        if (!url) return;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'duc-library-picker-tile';
        btn.setAttribute('role', 'listitem');
        var cap = String(item.relPath || item.file || 'image');
        btn.setAttribute('title', cap);
        var thumb = document.createElement('img');
        thumb.alt = '';
        thumb.loading = 'lazy';
        thumb.src = url;
        thumb.onerror = function () { thumb.style.visibility = 'hidden'; };
        var meta = document.createElement('span');
        meta.className = 'duc-library-tile-meta';
        meta.textContent = cap;
        btn.appendChild(thumb);
        btn.appendChild(meta);
        btn.addEventListener('click', function () {
          if (!targetSlot) return;
          state.images[targetSlot] = url;
          syncDropzonePreviews();
          var dlg = document.getElementById('ducLibraryPickerDialog');
          if (dlg && typeof dlg.close === 'function') dlg.close();
          setStatus(generateStatus, 'Slot updated from image library.', 'success');
        });
        grid.appendChild(btn);
      })(list[j]);
    }
  }

  async function openLibraryPicker(slot) {
    var dlg = document.getElementById('ducLibraryPickerDialog');
    var grid = document.getElementById('ducLibraryPickerGrid');
    var hint = document.getElementById('ducLibraryPickerHint');
    var emptyEl = document.getElementById('ducLibraryPickerEmpty');
    var title = document.getElementById('ducLibraryPickerTitle');
    var filterEl = document.getElementById('ducLibraryPickerFilter');
    if (!dlg || !grid || !slot) return;
    var sb = getSandbox();
    if (!sb) {
      setStatus(generateStatus, 'Choose a sandbox first — the image library is per sandbox.', 'error');
      return;
    }
    if (libraryImageCache.sandbox !== sb) {
      libraryImageCache.sandbox = '';
      libraryImageCache.items = null;
    }
    if (title) title.textContent = 'Pick image — ' + (SLOT_LIBRARY_LABELS[slot] || slot);
    if (hint) hint.textContent = 'Files from Image hosting for sandbox "' + sb + '". Thumbnails use the same CDN URLs as the library grid.';
    if (filterEl) filterEl.value = '';
    if (emptyEl) {
      emptyEl.textContent = 'No image files in this sandbox library yet. Open Image hosting to publish assets from a scrape.';
      emptyEl.hidden = true;
    }
    grid.innerHTML = '<p class="duc-suggest-hint" style="margin:0.5rem 1rem">Loading library…</p>';
    try {
      await loadLibraryImageItemsForSandbox();
    } catch (e) {
      grid.innerHTML = '';
      if (emptyEl) {
        emptyEl.textContent = 'Could not load library: ' + (e && e.message ? e.message : e) + '. Open Image hosting to confirm this sandbox.';
        emptyEl.hidden = false;
      }
      return;
    }
    renderLibraryPickerTiles(slot, '');
    if (typeof dlg.showModal === 'function') {
      dlg.dataset.ducPickerSlot = slot;
      dlg.showModal();
    } else {
      setStatus(generateStatus, 'Your browser does not support the image picker dialog.', 'error');
    }
  }

  function bindLibraryPickerDialog() {
    var dlg = document.getElementById('ducLibraryPickerDialog');
    var closeBtn = document.getElementById('ducLibraryPickerClose');
    var filterEl = document.getElementById('ducLibraryPickerFilter');
    if (closeBtn && dlg) {
      closeBtn.addEventListener('click', function () { if (typeof dlg.close === 'function') dlg.close(); });
    }
    if (dlg) {
      dlg.addEventListener('click', function (ev) {
        if (ev.target === dlg && typeof dlg.close === 'function') dlg.close();
      });
    }
    if (filterEl && dlg) {
      filterEl.addEventListener('input', function () {
        var slot = dlg.dataset.ducPickerSlot || '';
        if (libraryPickerFilterTimer) clearTimeout(libraryPickerFilterTimer);
        var v = filterEl.value;
        libraryPickerFilterTimer = setTimeout(function () {
          libraryPickerFilterTimer = null;
          renderLibraryPickerTiles(slot, v);
        }, 160);
      });
    }
  }

  // ─── Lookup ───────────────────────────────────────────────────────────
  async function lookupScrape() {
    var sandbox = getSandbox();
    if (!sandbox) { setStatus(lookupStatus, 'Choose a sandbox first.', 'error'); return; }
    var domain = normaliseDomain(urlInput.value);
    if (!domain) { setStatus(lookupStatus, 'Enter a customer URL or domain.', 'error'); return; }
    lookupBtn.disabled = true;
    setStatus(lookupStatus, 'Searching brand scrapes in sandbox "' + sandbox + '" for ' + domain + '…', '');
    summarySection.hidden = true; resultsSection.hidden = true; scrapeCard.innerHTML = '';
    if (recolourEl) recolourEl.hidden = true;
    hideLoadPrev();
    try {
      var summaries = await fetchScrapes(sandbox);
      var minSubstrLen = 3;
      var exact = [], subdomain = [], hostContains = [], nameContains = [];
      for (var i = 0; i < summaries.length; i++) {
        var s = summaries[i];
        var host = hostFromUrl(s.url || s.baseUrl || '');
        var brandLc = String(s.brandName || '').toLowerCase();
        if (host) {
          if (host === domain) { exact.push(s); continue; }
          if (host.endsWith('.' + domain) || domain.endsWith('.' + host)) { subdomain.push(s); continue; }
          if (domain.length >= minSubstrLen && host.indexOf(domain) !== -1) { hostContains.push(s); continue; }
        }
        if (brandLc && domain.length >= minSubstrLen && brandLc.indexOf(domain) !== -1) nameContains.push(s);
      }
      var candidates = [], matchKind = '';
      if (exact.length) { candidates = exact; matchKind = 'exact host'; }
      else if (subdomain.length) { candidates = subdomain; matchKind = 'subdomain'; }
      else if (hostContains.length) { candidates = hostContains; matchKind = 'host contains'; }
      else if (nameContains.length) { candidates = nameContains; matchKind = 'brand name contains'; }
      if (!candidates.length) {
        showScrapeMissing(domain, sandbox, false, urlInput.value);
        setStatus(lookupStatus, 'No brand scrape matches "' + domain + '" in sandbox "' + sandbox + '".', 'error');
        return;
      }
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
        showScrapeMissing(domain, sandbox, true, urlInput.value);
        setStatus(lookupStatus, 'Scrape payload has expired (>3 days). Re-run the scrape.', 'error');
        return;
      }
      onScrapeLoaded(hydrated);
      setStatus(lookupStatus, 'Found scrape from ' + new Date(hydrated.savedAt || pick.savedAt || Date.now()).toLocaleString() + '. Ready to generate.', 'success');
    } catch (e) {
      console.error('[demo-use-case] lookup failed', e);
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
      actionHtml = ' <a href="brand-scraper.html?url=' + encodeURIComponent(/^https?:\/\//.test(rawInput) ? rawInput : ('https://' + domain)) +
        '&sandbox=' + encodeURIComponent(sandbox) + '">Run a scrape</a> first, then come back here.';
    } else {
      actionHtml = '<br><span class="duc-empty-hint">' +
        'To run a new scrape, you need the customer\'s exact URL or domain ' +
        '(e.g. <code>nike.com</code> or <code>https://www.nike.com/uk/</code>). ' +
        '<a href="brand-scraper.html?sandbox=' + encodeURIComponent(sandbox) + '">Open Brand scraper</a>' +
        ' and enter the full URL there, then come back here.</span>';
    }
    scrapeCard.innerHTML = '<div class="duc-empty">' + msg + actionHtml + '</div>';
    document.getElementById('ducRefineForm').style.display = 'none';
  }

  function onScrapeLoaded(scrape) {
    state.selectedScrape = scrape;
    summarySection.hidden = false;
    document.getElementById('ducRefineForm').style.display = '';
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
      return '<span class="duc-colour-swatch" style="background:' + escapeAttr(c.hex) + '" title="' + escapeAttr(c.hex) + '"></span>';
    }).join('');
    var sandbox = getSandbox();
    var cached = loadFromCache(sandbox, scrape.scrapeId);
    var cachedPillHtml = cached
      ? '<span class="duc-cached-pill" title="A previous result is cached in this browser">✓ Cached</span>'
      : '';
    scrapeCard.innerHTML =
      '<div class="duc-brand-row">' +
        (logoSrc ? '<img class="duc-logo" alt="" src="' + escapeAttr(logoSrc) + '" onerror="this.style.display=\'none\'">' : '') +
        '<div>' +
          '<div class="duc-brand-name">' + escapeHtml(scrape.brandName || clearbitDomain || 'Brand') + cachedPillHtml + '</div>' +
          '<div class="duc-brand-meta">' + escapeHtml(hostUrl || '') + '</div>' +
        '</div>' +
      '</div>' +
      '<dl>' +
        '<dt>Industry</dt><dd>' + escapeHtml(scrape.industry || '—') + '</dd>' +
        '<dt>Country</dt><dd>' + escapeHtml(scrape.country || '—') + '</dd>' +
        '<dt>Pages</dt><dd>' + escapeHtml(String((cs.pagesScraped != null ? cs.pagesScraped : (Array.isArray(cs.pages) ? cs.pages.length : '—')))) + '</dd>' +
        '<dt>Saved</dt><dd>' + escapeHtml(scrape.savedAt ? new Date(scrape.savedAt).toLocaleString() : '—') + '</dd>' +
        '<dt>Brand colours</dt><dd><div class="duc-colours">' + swatchesHtml + '</div></dd>' +
      '</dl>';
    renderBrandSwatches(colours, primary);
    applyBrandColour(primary);
    if (cached) {
      if (cached.brandColour) applyBrandColour(cached.brandColour);
      if (cached.useCase && useCaseInput) useCaseInput.value = cached.useCase;
      if (cached.personaName && personaInput) personaInput.value = cached.personaName;
      if (cached.stepCount && stepCountSelect) stepCountSelect.value = String(cached.stepCount);
      if (additionalContextInput) additionalContextInput.value = cached.additionalContext || '';
      state.selectedProducts = Array.isArray(cached.products) ? cached.products.slice() : [];
      if (customProductInput) customProductInput.value = cached.customProduct || '';
      state.images = Object.assign(emptyImages(), cached.images || {});
      syncProductChips();
      syncDropzonePreviews();
      showLoadPrev(cached);
    } else {
      hideLoadPrev();
      if (additionalContextInput) additionalContextInput.value = '';
      state.selectedProducts = ['Real-Time CDP', 'Journey Optimizer'];
      if (customProductInput) customProductInput.value = '';
      state.images = emptyImages();
      mergeScrapeImagesIntoState(scrape, false);
      syncProductChips();
      syncDropzonePreviews();
      resultsSection.hidden = true;
    }
    updateApplyScrapeImagesButton();
    if (refinePromptInput) refinePromptInput.value = '';
    if (refineStatus) setStatus(refineStatus, '', '');
  }

  // ─── Generate progress tracker ────────────────────────────────────────
  // Demo deck JSON is smaller than the journey JSON so generation is a
  // bit faster (~60-90s typical), but we keep the same overrun-aware bar
  // shape so it visually matches the journey page.
  var STAGES = [
    [0,   'Loading brand scrape from sandbox…'],
    [3,   'Preparing prompt for Vertex AI Gemini…'],
    [10,  'Designing 3-slide demo deck (framing → experience → value)…'],
    [50,  'Refining persona walkthrough + value statement…'],
    [80,  'Rendering Framing / Experience / Value HTML…'],
    [110, 'Still working — Vertex AI is taking longer than usual…'],
  ];
  var progress = {
    rafId: null, startedAt: 0, stageIdx: -1, estimatedSeconds: 90, overrunHandled: false,
    start: function () {
      if (!progressEl) return;
      progress.startedAt = performance.now();
      progress.stageIdx = -1; progress.overrunHandled = false;
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
      for (var i = STAGES.length - 1; i > progress.stageIdx; i--) {
        if (elapsedSec >= STAGES[i][0]) { progress.stageIdx = i; progressStageEl.textContent = STAGES[i][1]; break; }
      }
      progressElapsedEl.textContent = formatElapsed(elapsedSec);
      if (overrun) {
        if (!progress.overrunHandled) {
          progressEl.classList.add('is-overrun');
          progressTrackEl.removeAttribute('aria-valuenow');
          progress.overrunHandled = true;
        }
      } else {
        var pct = 95 * (1 - Math.pow(1 - elapsedSec / progress.estimatedSeconds, 2));
        progressFillEl.style.width = pct.toFixed(1) + '%';
        progressTrackEl.setAttribute('aria-valuenow', String(Math.round(pct)));
      }
      progress.rafId = requestAnimationFrame(progress.tick);
    },
    finish: function (kind, finalText) {
      if (!progressEl) return;
      if (progress.rafId) { cancelAnimationFrame(progress.rafId); progress.rafId = null; }
      progressEl.classList.remove('is-overrun');
      if (kind === 'success') { progressEl.classList.add('is-success'); progressFillEl.style.width = '100%'; progressTrackEl.setAttribute('aria-valuenow', '100'); }
      else { progressEl.classList.add('is-error'); }
      if (finalText) progressStageEl.textContent = finalText;
      if (kind === 'success') {
        setTimeout(function () { if (progressEl.classList.contains('is-success')) progressEl.hidden = true; }, 2500);
      }
    },
  };
  function formatElapsed(seconds) {
    var s = Math.max(0, Math.round(seconds));
    if (s < 60) return s + 's';
    var m = Math.floor(s / 60), rem = s % 60;
    return m + 'm ' + (rem < 10 ? '0' : '') + rem + 's';
  }

  // ─── Generate ─────────────────────────────────────────────────────────
  function readGenerateInputs() {
    var sandbox = getSandbox();
    var brandColour = (brandColourInput.value || '').trim() || '#E60000';
    if (!/^#[0-9a-fA-F]{6}$/.test(brandColour)) throw new Error('Brand colour must be a #RRGGBB hex.');
    return {
      sandbox: sandbox,
      brandColour: brandColour,
      useCase: (useCaseInput.value || '').trim(),
      personaName: (personaInput.value || '').trim(),
      stepCount: parseInt(stepCountSelect && stepCountSelect.value, 10) || 6,
      products: state.selectedProducts.slice(),
      customProduct: (customProductInput && customProductInput.value || '').trim(),
      additionalContext: (additionalContextInput && additionalContextInput.value || '').trim(),
    };
  }

  async function generate() {
    if (!state.selectedScrape) { setStatus(generateStatus, 'Look up a scrape first.', 'error'); return; }
    var ins;
    try { ins = readGenerateInputs(); } catch (e) { setStatus(generateStatus, e.message, 'error'); return; }
    if (!ins.products.length && !ins.customProduct) {
      setStatus(generateStatus, 'Pick at least one Adobe product to demonstrate (or enter a custom one).', 'error');
      return;
    }
    if (!ins.useCase) {
      setStatus(generateStatus, 'Add a use case statement before generating.', 'error');
      if (useCaseInput) useCaseInput.focus();
      return;
    }
    generateBtn.disabled = true;
    setStatus(generateStatus, '', ''); setStatus(refineStatus, '', '');
    resultsSection.hidden = true;
    progress.start();
    try {
      var resp = await fetch(GENERATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sandbox: ins.sandbox,
          scrapeId: state.selectedScrape.scrapeId,
          brandColour: ins.brandColour,
          useCase: ins.useCase,
          personaName: ins.personaName || undefined,
          stepCount: ins.stepCount,
          products: ins.products,
          customProduct: ins.customProduct || undefined,
          additionalContext: ins.additionalContext || undefined,
          clientName: state.selectedScrape.brandName || undefined,
          images: state.images,
        }),
      });
      var data = await resp.json().catch(function () { return {}; });
      if (!resp.ok || !data.ok) throw new Error((data && data.error) || ('HTTP ' + resp.status));
      state.demoData = data.demoData;
      state.originalBrandColour = ins.brandColour.toUpperCase();
      state.activeBrandColour = ins.brandColour.toUpperCase();
      mountIframe(iframeFraming, data.framingHtml, 'framing');
      mountIframe(iframeExperience, data.experienceHtml, 'experience');
      mountIframe(iframeValue, data.valueHtml, 'value');
      renderRecolourPanel(state.scrapeColours, state.originalBrandColour, state.activeBrandColour);
      saveToCache(ins.sandbox, state.selectedScrape.scrapeId, {
        brandName: state.selectedScrape.brandName,
        brandColour: ins.brandColour,
        originalBrandColour: ins.brandColour,
        useCase: ins.useCase,
        personaName: ins.personaName,
        stepCount: ins.stepCount,
        products: ins.products,
        customProduct: ins.customProduct,
        additionalContext: ins.additionalContext,
        images: state.images,
        demoData: data.demoData,
        framingHtml: data.framingHtml,
        experienceHtml: data.experienceHtml,
        valueHtml: data.valueHtml,
      });
      if (refinePromptInput) refinePromptInput.value = '';
      var fresh = loadFromCache(ins.sandbox, state.selectedScrape.scrapeId);
      if (fresh) showLoadPrev(fresh);
      var pill = scrapeCard.querySelector('.duc-cached-pill');
      if (!pill) {
        var nameEl = scrapeCard.querySelector('.duc-brand-name');
        if (nameEl) nameEl.insertAdjacentHTML('beforeend', ' <span class="duc-cached-pill" title="A previous result is cached in this browser">\u2713 Cached</span>');
      }
      resultsSection.hidden = false;
      progress.finish('success', 'Generated successfully');
      setStatus(generateStatus, 'Use the tabs to switch slides, the \u26F6 icon for full-screen, or download the PPTX. To tweak, type into the Refine box below.', 'success');
      activateTab('framing');
    } catch (e) {
      console.error('[demo-use-case] generate failed', e);
      progress.finish('error', 'Generate failed: ' + (e && e.message || e));
      setStatus(generateStatus, 'Generate failed: ' + (e && e.message || e), 'error');
    } finally {
      generateBtn.disabled = false;
    }
  }

  // ─── Refine (post-generation) ─────────────────────────────────────────
  async function refineAssets() {
    if (!state.selectedScrape) { setStatus(refineStatus, 'Look up a scrape first.', 'error'); return; }
    if (!state.demoData) { setStatus(refineStatus, 'Generate a demo deck first, then refine it.', 'error'); return; }
    var prompt = (refinePromptInput && refinePromptInput.value || '').trim();
    if (!prompt) { setStatus(refineStatus, 'Type a refinement prompt before clicking Refine.', 'error'); if (refinePromptInput) refinePromptInput.focus(); return; }
    var ins;
    try { ins = readGenerateInputs(); } catch (e) { setStatus(refineStatus, e.message, 'error'); return; }
    refineBtn.disabled = true; generateBtn.disabled = true;
    setStatus(refineStatus, 'Refining with Vertex AI…', '');
    setStatus(generateStatus, '', '');
    progress.start();
    try {
      var resp = await fetch(GENERATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sandbox: ins.sandbox,
          scrapeId: state.selectedScrape.scrapeId,
          brandColour: ins.brandColour,
          useCase: ins.useCase,
          personaName: ins.personaName || undefined,
          stepCount: ins.stepCount,
          products: ins.products,
          customProduct: ins.customProduct || undefined,
          clientName: state.selectedScrape.brandName || undefined,
          previousData: state.demoData,
          refinementPrompt: prompt,
          images: state.images,
        }),
      });
      var data = await resp.json().catch(function () { return {}; });
      if (!resp.ok || !data.ok) throw new Error((data && data.error) || ('HTTP ' + resp.status));
      state.demoData = data.demoData;
      mountIframe(iframeFraming, data.framingHtml, 'framing');
      mountIframe(iframeExperience, data.experienceHtml, 'experience');
      mountIframe(iframeValue, data.valueHtml, 'value');
      if (state.activeBrandColour && state.activeBrandColour !== state.originalBrandColour) {
        applyRecolour(state.activeBrandColour, { persist: false });
      }
      var existing = loadFromCache(ins.sandbox, state.selectedScrape.scrapeId) || {};
      saveToCache(ins.sandbox, state.selectedScrape.scrapeId, {
        brandName: state.selectedScrape.brandName,
        brandColour: existing.brandColour || ins.brandColour,
        originalBrandColour: existing.originalBrandColour || ins.brandColour,
        colourOverride: state.activeBrandColour && state.activeBrandColour !== state.originalBrandColour ? state.activeBrandColour : undefined,
        useCase: existing.useCase || ins.useCase,
        personaName: existing.personaName || ins.personaName,
        stepCount: existing.stepCount || ins.stepCount,
        products: existing.products && existing.products.length ? existing.products : ins.products,
        customProduct: existing.customProduct || ins.customProduct,
        additionalContext: existing.additionalContext || '',
        lastRefinementPrompt: prompt,
        images: state.images,
        demoData: data.demoData,
        framingHtml: data.framingHtml,
        experienceHtml: data.experienceHtml,
        valueHtml: data.valueHtml,
      });
      var fresh = loadFromCache(ins.sandbox, state.selectedScrape.scrapeId);
      if (fresh) showLoadPrev(fresh);
      progress.finish('success', 'Refinement applied');
      setStatus(refineStatus, 'Updated. The framing, experience, and value slides have been replaced.', 'success');
      if (refinePromptInput) refinePromptInput.value = '';
    } catch (e) {
      console.error('[demo-use-case] refine failed', e);
      progress.finish('error', 'Refine failed: ' + (e && e.message || e));
      setStatus(refineStatus, 'Refine failed: ' + (e && e.message || e), 'error');
    } finally {
      refineBtn.disabled = false; generateBtn.disabled = false;
    }
  }

  function mountIframe(iframeEl, html, kind) {
    var blobKey = (kind === 'framing' ? 'framingBlobUrl' : (kind === 'experience' ? 'experienceBlobUrl' : 'valueBlobUrl'));
    if (state[blobKey]) { try { URL.revokeObjectURL(state[blobKey]); } catch (_) {} }
    var blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    state[blobKey] = url;
    iframeEl.src = url;
  }

  // ─── PPTX download ────────────────────────────────────────────────────
  async function downloadPptx() {
    if (!state.demoData) { setStatus(generateStatus, 'Generate the demo deck first.', 'error'); return; }
    downloadPptxBtn.disabled = true;
    var originalLabel = downloadPptxBtn.textContent;
    downloadPptxBtn.textContent = 'Building PPTX…';
    try {
      var resp = await fetch(PPTX_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ demoData: state.demoData, images: state.images }),
      });
      if (!resp.ok) {
        var t = await resp.text().catch(function () { return ''; });
        throw new Error(t || ('HTTP ' + resp.status));
      }
      var blob = await resp.blob();
      var slug = (state.demoData.client && (state.demoData.client.slug || state.demoData.client.name)) || 'demo';
      slug = String(slug).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = slug + '-demo-deck.pptx';
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    } catch (e) {
      console.error('[demo-use-case] PPTX download failed', e);
      setStatus(generateStatus, 'PPTX download failed: ' + (e && e.message || e), 'error');
    } finally {
      downloadPptxBtn.disabled = false;
      downloadPptxBtn.textContent = originalLabel || 'Download PPTX';
    }
  }

  // ─── Tabs + per-embed fullscreen ──────────────────────────────────────
  function activateTab(name) {
    state.activeTab = name;
    [
      [tabFraming, embedFraming, 'framing'],
      [tabExperience, embedExperience, 'experience'],
      [tabValue, embedValue, 'value'],
    ].forEach(function (row) {
      var tab = row[0], embed = row[1], n = row[2];
      var on = name === n;
      if (tab) tab.setAttribute('aria-selected', on ? 'true' : 'false');
      if (embed) embed.hidden = !on;
    });
  }

  function bindFullscreenButtons() {
    var btns = document.querySelectorAll('.duc-fullscreen-btn');
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
    var btns = document.querySelectorAll('.duc-fullscreen-btn');
    Array.prototype.forEach.call(btns, function (btn) {
      var targetId = btn.getAttribute('data-target');
      var el = document.getElementById(targetId);
      var isFs = el && fsEl === el;
      btn.setAttribute('aria-pressed', isFs ? 'true' : 'false');
      btn.setAttribute('aria-label', isFs ? 'Exit full screen' : 'Enter full screen');
    });
  }

  function syncBrandColourInputs() {
    brandColourInput.addEventListener('input', function () {
      var v = brandColourInput.value.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(v)) { brandColourPicker.value = v; highlightActiveSwatch(v); }
    });
    brandColourPicker.addEventListener('input', function () {
      var v = brandColourPicker.value.toUpperCase();
      brandColourInput.value = v; highlightActiveSwatch(v);
    });
    if (brandSwatchRow) {
      brandSwatchRow.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest && e.target.closest('.duc-brand-swatch');
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
    urlInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); lookupScrape(); } });

    personaCombo = setupCombobox({ input: personaInput, toggle: $('ducPersonaToggle'), panel: $('ducPersonaPanel') });
    useCaseCombo = setupCombobox({ input: useCaseInput, toggle: $('ducUseCaseToggle'), panel: $('ducUseCasePanel') });

    buildProductChips();
    syncProductChips();
    bindDropzones();
    syncDropzonePreviews();
    bindLibraryPickerDialog();

    var applyScrapeImagesBtn = $('ducApplyScrapeImagesBtn');
    if (applyScrapeImagesBtn) {
      applyScrapeImagesBtn.addEventListener('click', function () {
        if (!state.selectedScrape) return;
        mergeScrapeImagesIntoState(state.selectedScrape, false);
        syncDropzonePreviews();
        setStatus(generateStatus, 'Image slots updated from scrape. Generate or download PPTX to refresh outputs.', 'success');
      });
    }

    generateBtn.addEventListener('click', generate);
    downloadPptxBtn.addEventListener('click', downloadPptx);
    if (refineBtn) refineBtn.addEventListener('click', refineAssets);
    if (refinePromptInput) {
      refinePromptInput.addEventListener('keydown', function (ev) {
        if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') { ev.preventDefault(); refineAssets(); }
      });
    }
    if (tabFraming) tabFraming.addEventListener('click', function () { activateTab('framing'); });
    if (tabExperience) tabExperience.addEventListener('click', function () { activateTab('experience'); });
    if (tabValue) tabValue.addEventListener('click', function () { activateTab('value'); });
    if (prevLoadBtn) {
      prevLoadBtn.addEventListener('click', function () {
        if (!state.selectedScrape) return;
        var entry = loadFromCache(getSandbox(), state.selectedScrape.scrapeId);
        if (!entry) { setStatus(generateStatus, 'No cached result for this scrape any more — generate a fresh one.', 'error'); hideLoadPrev(); return; }
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
        var pill = scrapeCard.querySelector('.duc-cached-pill');
        if (pill) pill.remove();
        setStatus(generateStatus, 'Cached result forgotten.', '');
      });
    }
    if (recolourSwatchesEl) {
      recolourSwatchesEl.addEventListener('click', function (e) {
        var btn = e.target && e.target.closest && e.target.closest('.duc-recolour-swatch');
        if (!btn) return;
        var hex = btn.getAttribute('data-hex');
        if (hex) applyRecolour(hex);
      });
    }
    if (recolourPicker) recolourPicker.addEventListener('input', function () { applyRecolour(recolourPicker.value); });
    if (recolourHex) recolourHex.addEventListener('input', function () { var v = recolourHex.value.trim(); if (/^#[0-9a-fA-F]{6}$/.test(v)) applyRecolour(v); });
    if (recolourReset) recolourReset.addEventListener('click', function () { if (state.originalBrandColour) applyRecolour(state.originalBrandColour); });
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
          if (e && e.name !== 'AbortError') {
            console.warn('[demo-use-case] eyedropper failed', e);
            setStatus(generateStatus, 'Eyedropper failed: ' + (e && e.message || e), 'error');
          }
        } finally { recolourEyedropper.classList.remove('is-active'); }
      });
    }
    syncBrandColourInputs();
    bindFullscreenButtons();
    refreshSandboxBadge();
    window.addEventListener('aep-lab-sandbox-synced', refreshSandboxBadge);
    window.addEventListener('storage', function (e) {
      if (!e || !e.key) return;
      if (e.key === 'aepSandboxName' || e.key.indexOf('aepGlobal') === 0) refreshSandboxBadge();
    });
    try {
      var qs = new URLSearchParams(window.location.search);
      if (qs.get('url')) urlInput.value = qs.get('url');
    } catch (_) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
