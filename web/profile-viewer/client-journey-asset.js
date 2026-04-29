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
  var resultsSection = $('cjResults');
  var tabJourney = $('cjTabJourney');
  var tabOnePager = $('cjTabOnePager');
  var embedJourney = $('cjEmbedJourney');
  var embedOnePager = $('cjEmbedOnePager');
  var iframeJourney = $('cjJourneyIframe');
  var iframeOnePager = $('cjOnePagerIframe');
  var downloadPptxBtn = $('cjDownloadPptxBtn');

  // ─── State ────────────────────────────────────────────────────────────
  var state = {
    selectedScrape: null,    // Hydrated scrape record from /api/brand-scraper/scrapes/<id>
    journeyData: null,       // Last generated journey JSON (used for PPTX download)
    journeyBlobUrl: null,
    onePagerBlobUrl: null,
  };

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
        showScrapeMissing(domain, sandbox);
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
        showScrapeMissing(domain, sandbox, /* expired */ true);
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

  function showScrapeMissing(domain, sandbox, expired) {
    summarySection.hidden = false;
    var msg = expired
      ? 'The scrape for <strong>' + escapeHtml(domain) + '</strong> in sandbox "' + escapeHtml(sandbox) + '" exists but its payload has expired (bucket lifecycle is 3 days).'
      : 'No brand scrape for <strong>' + escapeHtml(domain) + '</strong> in sandbox "' + escapeHtml(sandbox) + '".';
    scrapeCard.innerHTML = '<div class="cj-empty">' + msg +
      ' <a href="brand-scraper.html?url=' + encodeURIComponent('https://' + domain) + '&sandbox=' + encodeURIComponent(sandbox) + '">Run a scrape</a> first, then come back here.</div>';
    // Hide the refine form until we have data
    document.getElementById('cjRefineForm').style.display = 'none';
  }

  function onScrapeLoaded(scrape) {
    state.selectedScrape = scrape;
    summarySection.hidden = false;
    document.getElementById('cjRefineForm').style.display = '';

    var cs = scrape.crawlSummary || {};
    var assets = cs.assets || {};
    var allColours = normaliseColourList(assets.colours);
    // Top 8 keeps the swatch row to a single line in most layouts while
    // still giving the user a useful spread of accent options.
    var colours = allColours.slice(0, 8);
    var primary = pickPrimaryColour(colours);

    var hostUrl = scrape.url || '';
    var clearbitDomain = hostFromUrl(hostUrl);
    var logoSrc = clearbitDomain ? ('https://logo.clearbit.com/' + clearbitDomain) : '';

    var swatchesHtml = colours.map(function (c) {
      return '<span class="cj-colour-swatch" style="background:' + escapeAttr(c.hex) + '" title="' + escapeAttr(c.hex) + '"></span>';
    }).join('');

    scrapeCard.innerHTML =
      '<div class="cj-brand-row">' +
        (logoSrc ? '<img class="cj-logo" alt="" src="' + escapeAttr(logoSrc) + '" onerror="this.style.display=\'none\'">' : '') +
        '<div>' +
          '<div class="cj-brand-name">' + escapeHtml(scrape.brandName || clearbitDomain || 'Brand') + '</div>' +
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
    setStatus(generateStatus, 'Asking Vertex AI Gemini to design the 12-step journey (this can take 30–60 seconds)…', '');
    resultsSection.hidden = true;

    try {
      var resp = await fetch('/api/client-journey/generate', {
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
      mountIframe(iframeJourney, data.htmlJourney, 'journey');
      mountIframe(iframeOnePager, data.htmlOnePager, 'onepager');

      resultsSection.hidden = false;
      setStatus(generateStatus, 'Generated. Use the tabs to switch views, the ⛶ icon for full-screen, or download the PPTX.', 'success');
      // Default to Journey tab
      activateTab('journey');
    } catch (e) {
      console.error('[client-journey] generate failed', e);
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
