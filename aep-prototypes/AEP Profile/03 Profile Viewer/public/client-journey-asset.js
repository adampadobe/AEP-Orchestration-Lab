/*
 * Client journey assets — orchestrator script.
 *
 * Flow:
 *   1. Sandbox dropdown is populated by aep-lab-sandbox-sync (shared with
 *      every other lab page). When it changes we just store it for use.
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
  var sandboxSelect = $('sandboxSelect');
  var urlInput = $('cjUrl');
  var lookupBtn = $('cjLookupBtn');
  var lookupStatus = $('cjLookupStatus');
  var summarySection = $('cjScrapeSummary');
  var scrapeCard = $('cjScrapeCard');
  var brandColourInput = $('cjBrandColour');
  var brandColourPicker = $('cjBrandColourPicker');
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
    return (sandboxSelect && sandboxSelect.value && String(sandboxSelect.value).trim()) || '';
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

  function pickPrimaryColour(colours) {
    if (!Array.isArray(colours)) return '#E60000';
    for (var i = 0; i < colours.length; i++) {
      var entry = colours[i];
      var hex = typeof entry === 'string' ? entry : (entry && (entry.hex || entry.color));
      if (!hex) continue;
      var m = String(hex).replace(/^#/, '');
      if (!/^[0-9a-fA-F]{6}$/.test(m)) continue;
      var r = parseInt(m.slice(0, 2), 16);
      var g = parseInt(m.slice(2, 4), 16);
      var b = parseInt(m.slice(4, 6), 16);
      var lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum > 18 && lum < 235) return '#' + m.toUpperCase();
    }
    return '#E60000';
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
      // Match: prefer scrapes whose host equals our domain, then those whose host endsWith domain.
      var exact = [];
      var endsWith = [];
      for (var i = 0; i < summaries.length; i++) {
        var host = hostFromUrl(summaries[i].url || summaries[i].baseUrl || '');
        if (!host) continue;
        if (host === domain) exact.push(summaries[i]);
        else if (host.endsWith('.' + domain) || domain.endsWith('.' + host)) endsWith.push(summaries[i]);
      }
      var candidates = exact.length ? exact : endsWith;

      if (!candidates.length) {
        showScrapeMissing(domain, sandbox);
        setStatus(lookupStatus, 'No brand scrape matches ' + domain + ' in sandbox "' + sandbox + '".', 'error');
        return;
      }

      // Newest first
      candidates.sort(function (a, b) {
        var ta = new Date(a.savedAt || a.updatedAt || 0).getTime();
        var tb = new Date(b.savedAt || b.updatedAt || 0).getTime();
        return tb - ta;
      });
      var pick = candidates[0];

      setStatus(lookupStatus, 'Loading scrape "' + (pick.brandName || pick.scrapeId) + '"…', '');
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
    var colours = Array.isArray(assets.colours) ? assets.colours.slice(0, 6) : [];
    var primary = pickPrimaryColour(colours);

    var hostUrl = scrape.url || '';
    var clearbitDomain = hostFromUrl(hostUrl);
    var logoSrc = clearbitDomain ? ('https://logo.clearbit.com/' + clearbitDomain) : '';

    var swatchesHtml = colours.map(function (c) {
      var hex = (typeof c === 'string' ? c : (c && (c.hex || c.color))) || '';
      return '<span class="cj-colour-swatch" style="background:' + escapeAttr(hex) + '" title="' + escapeAttr(hex) + '"></span>';
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

    brandColourInput.value = primary;
    brandColourPicker.value = primary;
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
      if (/^#[0-9a-fA-F]{6}$/.test(v)) brandColourPicker.value = v;
    });
    brandColourPicker.addEventListener('input', function () {
      brandColourInput.value = brandColourPicker.value.toUpperCase();
    });
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
    // Populate the sandbox <select> via the shared global helper, then wire
    // the cross-tab + cross-page sync listeners (matches image-hosting and
    // brand-scraper). Without this the dropdown sits on "Loading sandboxes…"
    // forever because aep-lab-sandbox-sync only mirrors the active value, it
    // doesn't fetch the sandbox list itself.
    initSandboxSelect();
    // Pre-fill URL from ?url= query param so deep-links from elsewhere work.
    try {
      var qs = new URLSearchParams(window.location.search);
      if (qs.get('url')) urlInput.value = qs.get('url');
    } catch (_) { /* noop */ }
  }

  async function initSandboxSelect() {
    if (!sandboxSelect) return;
    try {
      if (window.AepGlobalSandbox && window.AepGlobalSandbox.loadSandboxesIntoSelect) {
        await window.AepGlobalSandbox.loadSandboxesIntoSelect(sandboxSelect);
      }
    } catch (e) {
      setStatus(lookupStatus, 'Failed to load sandboxes: ' + (e && e.message || e), 'error');
      console.warn('[client-journey] sandbox load failed', e);
      return;
    }
    if (window.AepGlobalSandbox) {
      if (typeof window.AepGlobalSandbox.onSandboxSelectChange === 'function') {
        window.AepGlobalSandbox.onSandboxSelectChange(sandboxSelect);
      }
      if (typeof window.AepGlobalSandbox.attachStorageSync === 'function') {
        window.AepGlobalSandbox.attachStorageSync(sandboxSelect);
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
