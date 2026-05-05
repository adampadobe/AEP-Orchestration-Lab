/**
 * Client Journey Asset v2 — page logic.
 *
 * Long-running generate (60–180s) hits the direct Cloud Function URL to
 * dodge the 60s Hosting rewrite cap. Fast PPTX render goes via the
 * /api/client-journey-v2/pptx rewrite.
 *
 * Independent of v1 (client-journey-asset.js): no shared globals, no
 * shared cache, no shared event handlers.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'aepCjv2LastRun';
  var PERSIST_SCHEMA = 'cjv2PersistV1';
  var PERSIST_VERSION = 1;
  /** ~4.5MB — under typical 5MB localStorage practical limit */
  var MAX_PERSIST_CHARS = 4500000;

  var FN_BASE = 'https://us-central1-aep-orchestration-lab.cloudfunctions.net';
  var GENERATE_URL = FN_BASE + '/clientJourneyV2Generate';
  var REFINE_URL = FN_BASE + '/clientJourneyV2Refine';
  var PPTX_URL = '/api/client-journey-v2/pptx';
  var IMPORT_LIST_URL = '/api/client-journey-v2/import/scrapes';
  var IMPORT_PROFILE_URL = '/api/client-journey-v2/import/profile';

  // Local-dev override: if the page is served from localhost (the Express
  // prototype), the direct Cloud Function URL still works because
  // clientJourneyV2Generate has invoker:'public'. Same for /api/* — the
  // Express prototype proxies it. No host-specific switch needed.

  var form = document.getElementById('cjv2Form');
  var statusEl = document.getElementById('cjv2Status');
  var generateBtn = document.getElementById('cjv2GenerateBtn');
  var resetBtn = document.getElementById('cjv2ResetBtn');
  var longCallNote = document.getElementById('cjv2LongCallNote');
  var brandColorInput = document.getElementById('cjv2BrandColor');
  var brandColorPicker = document.getElementById('cjv2BrandColorPicker');
  var brandColorScrapeWrap = document.getElementById('cjv2BrandColorScrapeWrap');
  var brandColorScrapeGrid = document.getElementById('cjv2BrandColorScrapeGrid');
  /** Same id as other Profile Viewer pages — AepGlobalSandbox.getSandboxName() reads this first. */
  var sandboxSelectEl = document.getElementById('sandboxSelect');
  var importLoadBtn = document.getElementById('cjv2ImportLoadBtn');
  var importStatusEl = document.getElementById('cjv2ImportStatus');
  var importListWrapEl = document.getElementById('cjv2ImportListWrap');
  var importListEl = document.getElementById('cjv2ImportList');
  var importSortEl = document.getElementById('cjv2ImportSort');
  var importSourceEl = document.getElementById('cjv2ImportSource');
  /** Cached scrape rows for client-side re-sort (last successful list load). */
  var lastImportScrapeItems = [];
  var lastImportScrapeSandbox = '';

  var journeyTypeHidden = document.getElementById('cjv2JourneyTypeHidden');
  var journeyTypeSelect = document.getElementById('cjv2JourneyTypeSelect');
  var journeyTypeCustom = document.getElementById('cjv2JourneyTypeCustom');
  var journeyTypeHint = document.getElementById('cjv2JourneyTypeHint');
  var personaHidden = document.getElementById('cjv2PersonaHidden');
  var personaSelect = document.getElementById('cjv2PersonaSelect');
  var personaCustom = document.getElementById('cjv2PersonaCustom');
  var personaHint = document.getElementById('cjv2PersonaHint');

  /** Last scrape-derived option lists (also persisted on generate for restore). */
  var lastJourneyTypeOptions = [];
  var lastPersonaNameOptions = [];
  /** @type {Array<{ hex: string, count?: number }>} */
  var lastBrandColorOptions = [];

  var outputSection = document.getElementById('cjv2Output');
  var refinePanel = document.getElementById('cjv2RefinePanel');
  var refinePromptEl = document.getElementById('cjv2RefinePrompt');
  var refineBtn = document.getElementById('cjv2RefineBtn');
  var refineStatusEl = document.getElementById('cjv2RefineStatus');
  var pptxStatusEl = document.getElementById('cjv2PptxStatus');
  var downloadHtmlBtn = document.getElementById('cjv2DownloadHtmlBtn');
  var downloadPptxBtn = document.getElementById('cjv2DownloadPptxBtn');
  var openNewTabBtn = document.getElementById('cjv2OpenNewTabBtn');
  var previewMountEl = document.getElementById('cjv2PreviewMount');
  var onePagerMountEl = document.getElementById('cjv2OnePagerMount');
  var onePagerHtmlEl = document.getElementById('cjv2OnePagerHtml');
  var iframeEl = document.getElementById('cjv2HtmlPreview');

  var debugSection = document.getElementById('cjv2DebugSection');
  var sourcesEl = document.getElementById('cjv2Sources');
  var logEl = document.getElementById('cjv2Log');
  var metaEl = document.getElementById('cjv2Meta');

  var restoreBanner = document.getElementById('cjv2RestoreBanner');
  var restoreBannerText = document.getElementById('cjv2RestoreBannerText');
  var restoreBtn = document.getElementById('cjv2RestoreBtn');
  var restoreDiscardBtn = document.getElementById('cjv2RestoreDiscardBtn');
  /** @type {object|null} */
  var pendingRestorePayload = null;

  /** @type {{html:string,journey:object,sources:Array,meta:object,log:Array,onePagerHtml?:string}|null} */
  var lastResult = null;
  /** @type {string|null} */
  var lastBlobUrl = null;

  var FULLSCREEN_ICON_ENTER =
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">' +
    '<path fill="currentColor" d="M12.75,14.93652h-5.5c-1.24072,0-2.25-1.00928-2.25-2.25v-5.5c0-1.24072,1.00928-2.25,2.25-2.25h5.5c1.24072,0,2.25,1.00928,2.25,2.25v5.5c0,1.24072-1.00928,2.25-2.25,2.25ZM7.25,6.43652c-.41357,0-.75.33643-.75.75v5.5c0,.41357.33643.75.75.75h5.5c.41357,0,.75-.33643.75-.75v-5.5c0-.41357-.33643-.75-.75-.75h-5.5Z"/>' +
    '<path fill="currentColor" d="M4.5,19h-2.25c-.68945,0-1.25-.56055-1.25-1.25v-2.25c0-.41406.33594-.75.75-.75s.75.33594.75.75v2h2c.41406,0,.75.33594.75.75s-.33594.75-.75.75Z"/>' +
    '<path fill="currentColor" d="M17.75,19h-2.25c-.41406,0-.75-.33594-.75-.75s.33594-.75.75-.75h2v-2c0-.41406.33594-.75.75-.75s.75.33594.75.75v2.25c0,.68945-.56055,1.25-1.25,1.25Z"/>' +
    '<path fill="currentColor" d="M18.25,5.25c-.41406,0-.75-.33594-.75-.75v-2h-2c-.41406,0-.75-.33594-.75-.75s.33594-.75.75-.75h2.25c.68945,0,1.25.56055,1.25,1.25v2.25c0,.41406-.33594.75-.75.75ZM17.75,2.5h.00977-.00977Z"/>' +
    '<path fill="currentColor" d="M1.75,5.25c-.41406,0-.75-.33594-.75-.75v-2.25c0-.68945.56055-1.25,1.25-1.25h2.25c.41406,0,.75.33594.75.75s-.33594.75-.75.75h-2v2c0,.41406-.33594.75-.75.75Z"/>' +
    '</svg>';
  var FULLSCREEN_ICON_EXIT =
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">' +
    '<path fill="currentColor" d="M12.75,15h-5.5c-1.24072,0-2.25-1.00928-2.25-2.25v-5.5c0-1.24072,1.00928-2.25,2.25-2.25h5.5c1.24072,0,2.25,1.00928,2.25,2.25v5.5c0,1.24072-1.00928,2.25-2.25,2.25ZM7.25,6.5c-.41357,0-.75.33643-.75.75v5.5c0,.41357.33643.75.75.75h5.5c.41357,0,.75-.33643.75-.75v-5.5c0-.41357-.33643-.75-.75-.75h-5.5Z"/>' +
    '<path fill="currentColor" d="M19,4.5h-2.25c-.68945,0-1.25-.56055-1.25-1.25V1c0-.41406.33594-.75.75-.75s.75.33594.75.75v2h2c.41406,0,.75.33594.75.75s-.33594.75-.75.75Z"/>' +
    '<path fill="currentColor" d="M3.25,4.5H1c-.41406,0-.75-.33594-.75-.75s.33594-.75.75-.75h2V1c0-.41406.33594-.75.75-.75s.75.33594.75.75v2.25c0,.68945-.56055,1.25-1.25,1.25Z"/>' +
    '<path fill="currentColor" d="M3.75,19.75c-.41406,0-.75-.33594-.75-.75v-2H1c-.41406,0-.75-.33594-.75-.75s.33594-.75.75-.75h2.25c.68945,0,1.25.56055,1.25,1.25v2.25c0,.41406-.33594.75-.75.75ZM3.25,17h.00977-.00977Z"/>' +
    '<path fill="currentColor" d="M16.25,19.75c-.41406,0-.75-.33594-.75-.75v-2.25c0-.68945.56055-1.25,1.25-1.25h2.25c.41406,0,.75.33594.75.75s-.33594.75-.75.75h-2v2c0,.41406-.33594.75-.75.75Z"/>' +
    '</svg>';

  // ── Brand colour: hex text + native colour input sync ───────────────────

  function normaliseHex(raw) {
    var cleaned = String(raw || '').replace(/^#/, '').trim();
    if (!cleaned) return '';
    return /^[0-9A-Fa-f]{6}$/.test(cleaned) ? cleaned.toUpperCase() : null;
  }

  function setBrandColorInvalid(isInvalid) {
    if (isInvalid) brandColorInput.setAttribute('aria-invalid', 'true');
    else brandColorInput.removeAttribute('aria-invalid');
  }

  function syncBrandColorUi(hex) {
    var upper = normaliseHex(hex);
    if (!upper || !brandColorPicker) return;
    brandColorPicker.value = '#' + upper;
  }

  function applyBrandColor(hex, source) {
    var upper = normaliseHex(hex);
    if (!upper) return false;
    if (source !== 'text') brandColorInput.value = upper;
    if (source !== 'picker' && brandColorPicker) brandColorPicker.value = '#' + upper;
    syncBrandColorUi(upper);
    setBrandColorInvalid(false);
    if (statusEl.classList.contains('error') && /brand colour/i.test(statusEl.textContent || '')) {
      setStatus('');
    }
    return true;
  }

  function validateBrandColorForSubmit() {
    var raw = String(brandColorInput.value || '').trim();
    if (!raw) {
      setBrandColorInvalid(false);
      return { ok: true, value: '' };
    }
    var upper = normaliseHex(raw);
    if (!upper) {
      setBrandColorInvalid(true);
      return { ok: false, message: 'Brand colour must be a 6-digit hex value (for example E60000).' };
    }
    applyBrandColor(upper, 'text');
    return { ok: true, value: upper };
  }

  function normaliseBrandColorOptionsFromSnap(raw) {
    if (!Array.isArray(raw)) return [];
    var out = [];
    var seen = new Set();
    for (var i = 0; i < raw.length; i += 1) {
      var item = raw[i];
      var hex = '';
      if (typeof item === 'string') hex = normaliseHex(item) || '';
      else if (item && typeof item === 'object') hex = normaliseHex(item.hex || item.value || '') || '';
      if (!hex) continue;
      var key = hex.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      var row = { hex: hex };
      var c = item && typeof item === 'object' ? item.count : null;
      if (typeof c === 'number' && c > 0) row.count = c;
      out.push(row);
      if (out.length >= 20) break;
    }
    return out;
  }

  function clearBrandColorScrapeUi() {
    lastBrandColorOptions = [];
    if (brandColorScrapeGrid) brandColorScrapeGrid.innerHTML = '';
    if (brandColorScrapeWrap) brandColorScrapeWrap.hidden = true;
  }

  function syncBrandColorSwatchSelection() {
    if (!brandColorScrapeGrid) return;
    var current = normaliseHex(brandColorInput.value);
    brandColorScrapeGrid.querySelectorAll('.cjv2-brand-color-swatch').forEach(function (btn) {
      var h = btn.getAttribute('data-hex');
      var match = current && h && current === normaliseHex(h);
      btn.classList.toggle('is-selected', !!match);
      btn.setAttribute('aria-pressed', match ? 'true' : 'false');
    });
  }

  function renderBrandColorScrapePalette(options) {
    if (!brandColorScrapeWrap || !brandColorScrapeGrid) return;
    brandColorScrapeGrid.innerHTML = '';
    if (!options || !options.length) {
      brandColorScrapeWrap.hidden = true;
      lastBrandColorOptions = [];
      return;
    }
    lastBrandColorOptions = options.map(function (o) {
      var row = { hex: o.hex };
      if (typeof o.count === 'number' && o.count > 0) row.count = o.count;
      return row;
    });
    options.forEach(function (opt, idx) {
      var hex = normaliseHex(opt.hex);
      if (!hex) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cjv2-brand-color-swatch';
      btn.setAttribute('data-hex', hex);
      var count = typeof opt.count === 'number' && opt.count > 0 ? opt.count : 0;
      var label =
        (idx === 0 ? 'Suggested primary brand colour. ' : '') +
        '#' + hex +
        (count ? ', seen ' + count + ' times on scraped pages' : ', from brand scrape palette');
      btn.setAttribute('aria-label', label);
      btn.setAttribute('aria-pressed', 'false');
      if (idx === 0) {
        var badge = document.createElement('span');
        badge.className = 'cjv2-brand-color-swatch-badge';
        badge.textContent = 'Primary';
        btn.appendChild(badge);
      }
      var chip = document.createElement('span');
      chip.className = 'cjv2-brand-color-swatch-chip';
      chip.style.backgroundColor = '#' + hex;
      btn.appendChild(chip);
      var meta = document.createElement('span');
      meta.className = 'cjv2-brand-color-swatch-meta';
      var hexLine = document.createElement('span');
      hexLine.className = 'cjv2-brand-color-swatch-hex';
      hexLine.textContent = '#' + hex;
      meta.appendChild(hexLine);
      if (count) {
        var countLine = document.createElement('span');
        countLine.className = 'cjv2-brand-color-swatch-count';
        countLine.textContent = String(count) + '× on site';
        meta.appendChild(countLine);
      }
      btn.appendChild(meta);
      btn.addEventListener('click', function () {
        applyBrandColor(hex, 'text');
        syncBrandColorSwatchSelection();
      });
      brandColorScrapeGrid.appendChild(btn);
    });
    brandColorScrapeWrap.hidden = false;
    syncBrandColorSwatchSelection();
  }

  brandColorInput.addEventListener('input', function () {
    var upper = normaliseHex(brandColorInput.value);
    if (upper) applyBrandColor(upper, 'text');
    else syncBrandColorUi('');
    syncBrandColorSwatchSelection();
  });
  brandColorInput.addEventListener('blur', function () {
    var raw = String(brandColorInput.value || '').trim();
    if (!raw) {
      setBrandColorInvalid(false);
      syncBrandColorUi('');
      syncBrandColorSwatchSelection();
      return;
    }
    var upper = normaliseHex(raw);
    if (upper) {
      applyBrandColor(upper, 'text');
      syncBrandColorSwatchSelection();
      return;
    }
    setBrandColorInvalid(true);
  });
  if (brandColorPicker) {
    brandColorPicker.addEventListener('input', function () {
      applyBrandColor(brandColorPicker.value, 'picker');
      syncBrandColorSwatchSelection();
    });
  }
  syncBrandColorUi(brandColorInput.value);
  syncBrandColorSwatchSelection();

  // ── Form submit → generate ─────────────────────────────────────────────

  function setStatus(text, kind) {
    statusEl.textContent = text || '';
    statusEl.classList.remove('error', 'success');
    if (kind) statusEl.classList.add(kind);
  }

  function setPptxStatus(text, kind) {
    pptxStatusEl.textContent = text || '';
    pptxStatusEl.classList.remove('error', 'success');
    if (kind) pptxStatusEl.classList.add(kind);
  }

  function setRefineStatus(text, kind) {
    if (!refineStatusEl) return;
    refineStatusEl.textContent = text || '';
    refineStatusEl.classList.remove('error', 'success');
    if (kind) refineStatusEl.classList.add(kind);
  }

  function setImportStatus(text, kind) {
    if (!importStatusEl) return;
    importStatusEl.textContent = text || '';
    importStatusEl.classList.remove('error', 'success');
    if (kind) importStatusEl.classList.add(kind);
  }

  function getGlobalSandboxName() {
    try {
      if (window.AepGlobalSandbox && typeof window.AepGlobalSandbox.getSandboxName === 'function') {
        return String(window.AepGlobalSandbox.getSandboxName() || '').trim();
      }
    } catch (_e) {}
    return '';
  }

  function getSandboxForImport() {
    return getGlobalSandboxName();
  }

  async function initGlobalSandboxSelect() {
    if (!sandboxSelectEl || !window.AepGlobalSandbox) return;
    try {
      await window.AepGlobalSandbox.loadSandboxesIntoSelect(sandboxSelectEl);
      window.AepGlobalSandbox.onSandboxSelectChange(sandboxSelectEl);
      window.AepGlobalSandbox.attachStorageSync(sandboxSelectEl);
    } catch (err) {
      console.error('[cjv2] sandbox select init failed:', err);
    }
  }

  function userFacingServerError(json, detail) {
    if (!json || typeof json !== 'object') return detail;
    if (json.code === 'CJV2_JSON_PARSE_FAILED') {
      console.error('[cjv2] CJV2_JSON_PARSE_FAILED — server detail:', detail, json.details || null);
      return 'Temporary model issue — please press Generate again. ' +
        'Vertex AI Gemini returned slightly-malformed JSON for this run; the ' +
        'server already tried an automatic repair and a self-correcting retry.';
    }
    var hasSchemaErrors = Array.isArray(json.validationErrors) && json.validationErrors.length > 0;
    var schemaFailure = /schema validation/i.test(String(json.error || ''));
    if (hasSchemaErrors || schemaFailure) {
      return 'Model returned incomplete structure, please retry.';
    }
    return detail;
  }

  var SCRAPE_CHOICE_CUSTOM = '__custom__';

  function normaliseChoiceList(raw) {
    if (!Array.isArray(raw)) return [];
    var out = [];
    raw.forEach(function (item) {
      var v = String(item == null ? '' : item).trim();
      if (v) out.push(v);
    });
    return out;
  }

  function optionValueSet(selectEl) {
    var set = new Set();
    if (!selectEl || !selectEl.options) return set;
    for (var i = 0; i < selectEl.options.length; i += 1) {
      var v = String(selectEl.options[i].value || '');
      if (v && v !== SCRAPE_CHOICE_CUSTOM) set.add(v);
    }
    return set;
  }

  function populateScrapeSelect(selectEl, options, current) {
    if (!selectEl) return;
    var list = normaliseChoiceList(options);
    var want = String(current == null ? '' : current).trim();
    selectEl.innerHTML = '';
    var placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = list.length ? 'Choose from scrape…' : 'No scrape labels — use custom';
    placeholder.disabled = !list.length;
    placeholder.selected = !want;
    selectEl.appendChild(placeholder);
    list.forEach(function (label) {
      var opt = document.createElement('option');
      opt.value = label;
      opt.textContent = label;
      selectEl.appendChild(opt);
    });
    var customOpt = document.createElement('option');
    customOpt.value = SCRAPE_CHOICE_CUSTOM;
    customOpt.textContent = 'Custom…';
    selectEl.appendChild(customOpt);
    var values = optionValueSet(selectEl);
    if (want && values.has(want)) {
      selectEl.value = want;
    } else if (want) {
      selectEl.value = SCRAPE_CHOICE_CUSTOM;
    } else {
      selectEl.value = list.length ? '' : SCRAPE_CHOICE_CUSTOM;
    }
  }

  function syncJourneyHiddenFromUi() {
    if (!journeyTypeHidden) return;
    if (journeyTypeSelect && !journeyTypeSelect.hidden) {
      if (journeyTypeSelect.value === SCRAPE_CHOICE_CUSTOM) {
        journeyTypeHidden.value = journeyTypeCustom ? String(journeyTypeCustom.value || '').trim() : '';
        return;
      }
      journeyTypeHidden.value = String(journeyTypeSelect.value || '').trim();
      return;
    }
    journeyTypeHidden.value = journeyTypeCustom ? String(journeyTypeCustom.value || '').trim() : '';
  }

  function syncPersonaHiddenFromUi() {
    if (!personaHidden) return;
    if (personaSelect && !personaSelect.hidden) {
      if (personaSelect.value === SCRAPE_CHOICE_CUSTOM) {
        personaHidden.value = personaCustom ? String(personaCustom.value || '').trim() : '';
        return;
      }
      personaHidden.value = String(personaSelect.value || '').trim();
      return;
    }
    personaHidden.value = personaCustom ? String(personaCustom.value || '').trim() : '';
  }

  function syncScrapeChoiceHiddenFields() {
    syncJourneyHiddenFromUi();
    syncPersonaHiddenFromUi();
  }

  function setJourneyCustomVisible(show) {
    if (!journeyTypeCustom) return;
    journeyTypeCustom.hidden = !show;
    if (!show) journeyTypeCustom.value = '';
  }

  function setPersonaCustomVisible(show) {
    if (!personaCustom) return;
    personaCustom.hidden = !show;
    if (!show) personaCustom.value = '';
  }

  function refreshJourneyCustomVisibility() {
    if (!journeyTypeSelect || journeyTypeSelect.hidden) {
      setJourneyCustomVisible(true);
      return;
    }
    setJourneyCustomVisible(journeyTypeSelect.value === SCRAPE_CHOICE_CUSTOM);
  }

  function refreshPersonaCustomVisibility() {
    if (!personaSelect || personaSelect.hidden) {
      setPersonaCustomVisible(true);
      return;
    }
    setPersonaCustomVisible(personaSelect.value === SCRAPE_CHOICE_CUSTOM);
  }

  /**
   * Before a brand-scrape import (or after reset): type freely; selects stay hidden.
   */
  function enterManualScrapeChoiceMode() {
    lastJourneyTypeOptions = [];
    lastPersonaNameOptions = [];
    if (journeyTypeSelect) {
      journeyTypeSelect.innerHTML = '';
      journeyTypeSelect.hidden = true;
      journeyTypeSelect.disabled = true;
    }
    if (journeyTypeHint) journeyTypeHint.hidden = true;
    setJourneyCustomVisible(true);

    if (personaSelect) {
      personaSelect.innerHTML = '';
      personaSelect.hidden = true;
      personaSelect.disabled = true;
    }
    if (personaHint) personaHint.hidden = true;
    setPersonaCustomVisible(true);
    syncScrapeChoiceHiddenFields();
  }

  /**
   * After import: show dropdowns when the scrape produced option lists.
   */
  function applyImportedScrapeChoices(mapped) {
    var jOpts = normaliseChoiceList(mapped && mapped.journeyTypeOptions);
    var pOpts = normaliseChoiceList(mapped && mapped.personaNameOptions);
    lastJourneyTypeOptions = jOpts.slice();
    lastPersonaNameOptions = pOpts.slice();

    var jVal = journeyTypeHidden ? String(journeyTypeHidden.value || '').trim() : '';
    var pVal = personaHidden ? String(personaHidden.value || '').trim() : '';

    if (journeyTypeSelect) {
      journeyTypeSelect.hidden = false;
      journeyTypeSelect.disabled = false;
    }
    if (journeyTypeHint) journeyTypeHint.hidden = !jOpts.length;
    populateScrapeSelect(journeyTypeSelect, jOpts, jVal);
    refreshJourneyCustomVisibility();
    if (journeyTypeCustom && journeyTypeSelect && journeyTypeSelect.value === SCRAPE_CHOICE_CUSTOM) {
      journeyTypeCustom.value = jVal;
    }

    if (personaSelect) {
      personaSelect.hidden = false;
      personaSelect.disabled = false;
    }
    if (personaHint) personaHint.hidden = !pOpts.length;
    populateScrapeSelect(personaSelect, pOpts, pVal);
    refreshPersonaCustomVisibility();
    if (personaCustom && personaSelect && personaSelect.value === SCRAPE_CHOICE_CUSTOM) {
      personaCustom.value = pVal;
    }

    syncScrapeChoiceHiddenFields();
  }

  function bindScrapeChoiceControls() {
    if (form.getAttribute('data-cjv2-scrape-choice-bound') === '1') return;
    form.setAttribute('data-cjv2-scrape-choice-bound', '1');

    if (journeyTypeSelect) {
      journeyTypeSelect.addEventListener('change', function () {
        refreshJourneyCustomVisibility();
        syncJourneyHiddenFromUi();
      });
    }
    if (personaSelect) {
      personaSelect.addEventListener('change', function () {
        refreshPersonaCustomVisibility();
        syncPersonaHiddenFromUi();
      });
    }
    if (journeyTypeCustom) {
      journeyTypeCustom.addEventListener('input', syncJourneyHiddenFromUi);
    }
    if (personaCustom) {
      personaCustom.addEventListener('input', syncPersonaHiddenFromUi);
    }
  }

  function readForm() {
    var fd = new FormData(form);
    var body = {};
    fd.forEach(function (val, key) { body[key] = String(val); });
    body.tier = body.tier === 'Advanced' ? 'Advanced' : 'Foundation';
    body.client = String(body.client || '').trim();
    var maybeHex = normaliseHex(body.brandColor || '');
    body.brandColor = maybeHex || '';
    return body;
  }

  /**
   * Build a persistable form snapshot (same shape as readForm / POST body).
   * @param {Record<string, string>} body
   */
  function cloneFormSnapshot(body) {
    var snap = {
      tier: body.tier === 'Advanced' ? 'Advanced' : 'Foundation',
      client: String(body.client || '').trim(),
      clientDomain: String(body.clientDomain || '').trim(),
      brandColor: String(body.brandColor || '').trim(),
      journeyType: String(body.journeyType || '').trim(),
      personaName: String(body.personaName || '').trim(),
      personaGender: body.personaGender === 'male' ? 'male' : 'female',
      marketerPersonaName: String(body.marketerPersonaName || '').trim(),
      techStack: String(body.techStack || ''),
      additionalContext: String(body.additionalContext || ''),
    };
    if (lastJourneyTypeOptions && lastJourneyTypeOptions.length) {
      snap.journeyTypeOptions = lastJourneyTypeOptions.slice();
    }
    if (lastPersonaNameOptions && lastPersonaNameOptions.length) {
      snap.personaNameOptions = lastPersonaNameOptions.slice();
    }
    if (lastBrandColorOptions && lastBrandColorOptions.length) {
      snap.brandColorOptions = lastBrandColorOptions.map(function (o) {
        var row = { hex: o.hex };
        if (typeof o.count === 'number' && o.count > 0) row.count = o.count;
        return row;
      });
    }
    return snap;
  }

  function applyFormSnapshot(snap) {
    if (!snap || typeof snap !== 'object') return;
    var tier = snap.tier === 'Advanced' ? 'Advanced' : 'Foundation';
    form.querySelectorAll('input[name="tier"]').forEach(function (radio) {
      radio.checked = radio.value === tier;
    });
    var names = [
      'client', 'clientDomain', 'brandColor', 'journeyType', 'personaName',
      'marketerPersonaName', 'techStack', 'additionalContext',
    ];
    names.forEach(function (name) {
      var el = form.elements.namedItem(name);
      if (el && 'value' in el) el.value = snap[name] != null ? String(snap[name]) : '';
    });
    var genderEl = form.elements.namedItem('personaGender');
    if (genderEl && 'value' in genderEl) {
      genderEl.value = snap.personaGender === 'male' ? 'male' : 'female';
    }
    if (snap.brandColor) applyBrandColor(snap.brandColor, 'text');
    else syncBrandColorUi('');

    var jList = normaliseChoiceList(snap.journeyTypeOptions);
    var pList = normaliseChoiceList(snap.personaNameOptions);
    if (jList.length || pList.length) {
      lastJourneyTypeOptions = jList.slice();
      lastPersonaNameOptions = pList.slice();
      applyImportedScrapeChoices({
        journeyTypeOptions: lastJourneyTypeOptions,
        personaNameOptions: lastPersonaNameOptions,
      });
    } else {
      enterManualScrapeChoiceMode();
      if (journeyTypeCustom && snap.journeyType != null) journeyTypeCustom.value = String(snap.journeyType);
      if (personaCustom && snap.personaName != null) personaCustom.value = String(snap.personaName);
      syncScrapeChoiceHiddenFields();
    }

    var colorOpts = normaliseBrandColorOptionsFromSnap(snap.brandColorOptions);
    if (colorOpts.length) {
      lastBrandColorOptions = colorOpts.map(function (o) {
        var row = { hex: o.hex };
        if (typeof o.count === 'number' && o.count > 0) row.count = o.count;
        return row;
      });
      renderBrandColorScrapePalette(lastBrandColorOptions);
    } else {
      clearBrandColorScrapeUi();
    }
  }

  function showImportSource(meta) {
    if (!importSourceEl) return;
    if (!meta || !meta.scrapeId) {
      importSourceEl.hidden = true;
      importSourceEl.textContent = '';
      return;
    }
    importSourceEl.textContent = 'Prefilled from scrape ' + String(meta.scrapeId);
    importSourceEl.hidden = false;
  }

  function scrapeRunIsoForDisplay(item) {
    var r = item && (item.runStartedAt || item.createdAt || item.updatedAt);
    return r != null ? String(r).trim() : '';
  }

  function scrapeRunTimestampMs(item) {
    var iso = scrapeRunIsoForDisplay(item);
    if (!iso) return 0;
    var t = Date.parse(iso);
    return Number.isNaN(t) ? 0 : t;
  }

  function importNameSortKey(item) {
    return String(item && (item.brandName || item.url || item.scrapeId || '') || '').toLowerCase().trim();
  }

  function formatScrapeRunDisplay(iso) {
    if (!iso) return '';
    var t = Date.parse(String(iso));
    if (Number.isNaN(t)) return String(iso).slice(0, 22);
    try {
      return new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    } catch (_e) {
      return String(iso);
    }
  }

  function sortImportItems(items, sortKey) {
    var key = sortKey || 'newest';
    var arr = items.slice();
    if (key === 'newest') {
      arr.sort(function (a, b) {
        return scrapeRunTimestampMs(b) - scrapeRunTimestampMs(a);
      });
      return arr;
    }
    if (key === 'oldest') {
      arr.sort(function (a, b) {
        return scrapeRunTimestampMs(a) - scrapeRunTimestampMs(b);
      });
      return arr;
    }
    if (key === 'name-desc') {
      arr.sort(function (a, b) {
        return importNameSortKey(b).localeCompare(importNameSortKey(a));
      });
      return arr;
    }
    arr.sort(function (a, b) {
      return importNameSortKey(a).localeCompare(importNameSortKey(b));
    });
    return arr;
  }

  function bindImportSortControl() {
    if (!importSortEl || importSortEl.dataset.cjv2SortBound === '1') return;
    importSortEl.dataset.cjv2SortBound = '1';
    importSortEl.addEventListener('change', function () {
      renderImportList(lastImportScrapeItems, lastImportScrapeSandbox);
    });
  }

  function renderImportList(items, sandbox) {
    if (!importListEl || !importListWrapEl) return;
    lastImportScrapeItems = Array.isArray(items) ? items.slice() : [];
    lastImportScrapeSandbox = sandbox || '';
    importListEl.innerHTML = '';
    if (!lastImportScrapeItems.length) {
      importListWrapEl.hidden = true;
      return;
    }
    var sortKey = importSortEl && importSortEl.value ? importSortEl.value : 'newest';
    var sorted = sortImportItems(lastImportScrapeItems, sortKey);
    sorted.forEach(function (item) {
      var tr = document.createElement('tr');

      var tdBrand = document.createElement('td');
      tdBrand.className = 'cjv2-import-cell-brand';
      var strong = document.createElement('strong');
      strong.textContent = item.brandName || item.url || item.scrapeId || 'Unnamed scrape';
      tdBrand.appendChild(strong);
      var urlLine = item.url ? String(item.url) : '';
      if (urlLine) {
        var urlEl = document.createElement('span');
        urlEl.className = 'cjv2-import-cell-brand-url';
        urlEl.textContent = urlLine;
        tdBrand.appendChild(urlEl);
      }

      var tdTime = document.createElement('td');
      var runIso = scrapeRunIsoForDisplay(item);
      if (runIso) {
        tdTime.className = 'cjv2-import-cell-time';
        var timeEl = document.createElement('time');
        timeEl.dateTime = runIso;
        timeEl.textContent = formatScrapeRunDisplay(runIso);
        timeEl.title = 'Scrape run time (run start if known, else created / last updated) — ' + runIso;
        tdTime.appendChild(timeEl);
      } else {
        tdTime.className = 'cjv2-import-cell-time cjv2-import-cell-time--empty';
        tdTime.textContent = 'No timestamp';
      }

      var tdFlags = document.createElement('td');
      tdFlags.className = 'cjv2-import-cell-flags';
      var flags = [];
      if (item.analysisPresent) flags.push('analysis');
      if (item.personasPresent) flags.push('personas');
      if (item.campaignsPresent) flags.push('campaigns');
      if (item.segmentsPresent) flags.push('segments');
      tdFlags.textContent = flags.length ? flags.join(', ') : '—';

      var tdAct = document.createElement('td');
      tdAct.className = 'cjv2-import-cell-action';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cjv2-btn cjv2-btn-secondary';
      btn.textContent = 'Use';
      btn.addEventListener('click', function () {
        importMappedProfile(sandbox, item.scrapeId || item.id);
      });
      tdAct.appendChild(btn);

      tr.appendChild(tdBrand);
      tr.appendChild(tdTime);
      tr.appendChild(tdFlags);
      tr.appendChild(tdAct);
      importListEl.appendChild(tr);
    });
    importListWrapEl.hidden = false;
  }

  async function importMappedProfile(sandbox, scrapeId) {
    if (!sandbox || !scrapeId) return;
    if (importLoadBtn) importLoadBtn.disabled = true;
    setImportStatus('Importing scrape profile…');
    try {
      var url = IMPORT_PROFILE_URL + '?sandbox=' + encodeURIComponent(sandbox) +
        '&scrapeId=' + encodeURIComponent(scrapeId);
      var resp = await fetch(url, { cache: 'no-store' });
      var json = await resp.json();
      if (!resp.ok || !json || !json.mapped) {
        throw new Error((json && (json.error || json.detail)) || ('HTTP ' + resp.status));
      }
      applyFormSnapshot(json.mapped);
      showImportSource(json.mapped.metadata || { scrapeId: scrapeId });
      setImportStatus('Fields prefilled from scrape ' + scrapeId + '.', 'success');
      setStatus('');
    } catch (err) {
      console.error('[cjv2] import mapped profile failed:', err);
      setImportStatus('Import failed: ' + String(err.message || err), 'error');
    } finally {
      if (importLoadBtn) importLoadBtn.disabled = false;
    }
  }

  async function loadImportScrapes() {
    var sandbox = getSandboxForImport();
    if (!sandbox) {
      lastImportScrapeItems = [];
      lastImportScrapeSandbox = '';
      setImportStatus('Select a sandbox first.', 'error');
      if (importListWrapEl) importListWrapEl.hidden = true;
      return;
    }
    if (importLoadBtn) importLoadBtn.disabled = true;
    setImportStatus('Loading available scrapes…');
    try {
      var url = IMPORT_LIST_URL + '?sandbox=' + encodeURIComponent(sandbox);
      var resp = await fetch(url, { cache: 'no-store' });
      var json = await resp.json();
      if (!resp.ok || !json || !Array.isArray(json.items)) {
        throw new Error((json && (json.error || json.detail)) || ('HTTP ' + resp.status));
      }
      if (!json.items.length) {
        renderImportList([], sandbox);
        setImportStatus('No scrape records found for sandbox "' + sandbox + '".');
        return;
      }
      renderImportList(json.items, sandbox);
      setImportStatus('Select a scrape to prefill the brief.', 'success');
    } catch (err) {
      console.error('[cjv2] list scrapes failed:', err);
      lastImportScrapeItems = [];
      lastImportScrapeSandbox = '';
      if (importListWrapEl) importListWrapEl.hidden = true;
      setImportStatus('Could not load scrapes: ' + String(err.message || err), 'error');
    } finally {
      if (importLoadBtn) importLoadBtn.disabled = false;
    }
  }

  function buildPersistPayload(formSnap, serverJson) {
    return {
      v: PERSIST_VERSION,
      schema: PERSIST_SCHEMA,
      savedAt: new Date().toISOString(),
      form: formSnap,
      result: {
        html: serverJson.html,
        onePagerHtml: typeof serverJson.onePagerHtml === 'string' ? serverJson.onePagerHtml : '',
        journey: serverJson.journey,
        meta: serverJson.meta && typeof serverJson.meta === 'object' ? serverJson.meta : {},
        sources: Array.isArray(serverJson.sources) ? serverJson.sources : [],
        log: Array.isArray(serverJson.log) ? serverJson.log : [],
      },
    };
  }

  function tryPersistLastRun(formSnap, serverJson) {
    var payload = buildPersistPayload(formSnap, serverJson);
    var raw;
    try { raw = JSON.stringify(payload); }
    catch (e) {
      console.warn('[cjv2] persist: JSON.stringify failed', e);
      return;
    }
    if (raw.length > MAX_PERSIST_CHARS) {
      console.warn(
        '[cjv2] persist: payload too large (' + raw.length + ' chars); skipping localStorage'
      );
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, raw);
    } catch (e) {
      console.warn('[cjv2] persist: localStorage.setItem failed', e);
    }
  }

  function isValidPersist(parsed) {
    if (!parsed || typeof parsed !== 'object') return false;
    if (parsed.v !== PERSIST_VERSION || parsed.schema !== PERSIST_SCHEMA) return false;
    if (typeof parsed.savedAt !== 'string') return false;
    if (!parsed.form || typeof parsed.form !== 'object') return false;
    var r = parsed.result;
    if (!r || typeof r !== 'object') return false;
    if (typeof r.html !== 'string' || !r.html.length) return false;
    if (!r.journey || typeof r.journey !== 'object') return false;
    return true;
  }

  function formatRelativePast(iso) {
    var t = new Date(iso).getTime();
    if (Number.isNaN(t)) return 'earlier';
    var ms = Date.now() - t;
    if (ms < 0) return new Date(iso).toLocaleString();
    var minutes = Math.floor(ms / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) {
      return minutes + (minutes === 1 ? ' minute' : ' minutes') + ' ago';
    }
    var hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return hours + (hours === 1 ? ' hour' : ' hours') + ' ago';
    }
    var days = Math.floor(hours / 24);
    if (days < 14) {
      return days + (days === 1 ? ' day' : ' days') + ' ago';
    }
    return new Date(iso).toLocaleDateString();
  }

  function clearPersisted() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    pendingRestorePayload = null;
  }

  function hideRestoreBanner() {
    if (restoreBanner) restoreBanner.hidden = true;
  }

  function showRestoreBannerIfNeeded() {
    if (!restoreBanner || !restoreBannerText) return;
    var raw = null;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { return; }
    if (!raw) return;
    var parsed;
    try { parsed = JSON.parse(raw); }
    catch (e) {
      clearPersisted();
      return;
    }
    if (!isValidPersist(parsed)) {
      clearPersisted();
      return;
    }
    pendingRestorePayload = parsed;
    restoreBannerText.textContent = '';
    var t1 = document.createTextNode('You have a saved journey from ');
    var strong = document.createElement('strong');
    strong.textContent = formatRelativePast(parsed.savedAt);
    var t2 = document.createTextNode('.');
    restoreBannerText.appendChild(t1);
    restoreBannerText.appendChild(strong);
    restoreBannerText.appendChild(t2);
    restoreBanner.hidden = false;
  }

  function applyRestoredResult(parsed) {
    var r = parsed.result;
    lastResult = {
      ok: true,
      html: r.html,
      onePagerHtml: typeof r.onePagerHtml === 'string' ? r.onePagerHtml : '',
      journey: r.journey,
      meta: r.meta || {},
      sources: r.sources || [],
      log: r.log || [],
    };
    renderOutput();
    setStatus('Restored saved journey (' + formatRelativePast(parsed.savedAt) + ').', 'success');
    setPptxStatus('');
    hideRestoreBanner();
  }

  function clearLastResult() {
    if (lastBlobUrl) {
      try { URL.revokeObjectURL(lastBlobUrl); } catch (e) {}
      lastBlobUrl = null;
    }
    lastResult = null;
    iframeEl.src = 'about:blank';
    if (onePagerHtmlEl) onePagerHtmlEl.innerHTML = '';
    outputSection.hidden = true;
    debugSection.hidden = true;
    setRefineStatus('');
    syncFullscreenButtons();
  }

  function getFullscreenElement() {
    return (
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement ||
      null
    );
  }

  function requestFullscreen(el) {
    if (!el) return Promise.reject(new Error('No element.'));
    if (typeof el.requestFullscreen === 'function') return el.requestFullscreen();
    if (typeof el.webkitRequestFullscreen === 'function') return el.webkitRequestFullscreen();
    if (typeof el.mozRequestFullScreen === 'function') return el.mozRequestFullScreen();
    if (typeof el.msRequestFullscreen === 'function') return el.msRequestFullscreen();
    return Promise.reject(new Error('Full screen is not supported in this browser.'));
  }

  function exitFullscreen() {
    if (!getFullscreenElement()) return Promise.resolve();
    if (typeof document.exitFullscreen === 'function') return document.exitFullscreen();
    if (typeof document.webkitExitFullscreen === 'function') return document.webkitExitFullscreen();
    if (typeof document.mozCancelFullScreen === 'function') return document.mozCancelFullScreen();
    if (typeof document.msExitFullscreen === 'function') return document.msExitFullscreen();
    return Promise.reject(new Error('Unable to exit full screen.'));
  }

  /** @param {Element|null} btn */
  function resolveFullscreenMount(btn) {
    if (!btn) return null;
    var raw = btn.getAttribute('data-target');
    var id = raw != null ? String(raw).trim() : '';
    if (id) {
      var byAttr = document.getElementById(id);
      if (byAttr) return byAttr;
    }
    if (btn.id === 'cjv2FullscreenBtn' && previewMountEl) return previewMountEl;
    if (btn.id === 'cjv2OnePagerFullscreenBtn' && onePagerMountEl) return onePagerMountEl;
    return null;
  }

  function syncFullscreenButtons() {
    var fsEl = getFullscreenElement();
    document.querySelectorAll('button.cjv2-fullscreen-btn').forEach(function (btn) {
      var targetEl = resolveFullscreenMount(btn);
      if (!targetEl) return;
      var isFullscreen = fsEl === targetEl;
      var label = isFullscreen ? 'Exit full screen' : 'Enter full screen';
      btn.innerHTML = isFullscreen ? FULLSCREEN_ICON_EXIT : FULLSCREEN_ICON_ENTER;
      btn.setAttribute('aria-pressed', isFullscreen ? 'true' : 'false');
      btn.setAttribute('aria-label', label);
      btn.setAttribute('title', label);
    });
  }

  function bindFullscreen() {
    document.querySelectorAll('button.cjv2-fullscreen-btn').forEach(function (btn) {
      if (btn.getAttribute('data-cjv2-fs-bound') === '1') return;
      if (!resolveFullscreenMount(btn)) return;
      btn.setAttribute('data-cjv2-fs-bound', '1');
      btn.addEventListener('click', function () {
        var targetEl = resolveFullscreenMount(btn);
        if (!targetEl) {
          console.warn('[cjv2] fullscreen: no mount for button', btn && btn.id);
          setStatus('Full screen target is missing — refresh the page and try again.', 'error');
          return;
        }
        var active = getFullscreenElement() === targetEl;
        var p = active ? exitFullscreen() : requestFullscreen(targetEl);
        Promise.resolve(p)
          .catch(function (err) {
            var detail = err && err.message ? String(err.message) : String(err || 'unknown error');
            console.warn('[cjv2] fullscreen request failed:', detail, err || null);
            setStatus(
              'Could not toggle full screen — the browser blocked the request, full screen is not allowed for this element, or it is not supported. Try again with a direct click, or check site permissions.',
              'error'
            );
          })
          .finally(syncFullscreenButtons);
      });
    });
    if (document.documentElement.getAttribute('data-cjv2-fs-events-bound') === '1') return;
    document.documentElement.setAttribute('data-cjv2-fs-events-bound', '1');
    [
      'fullscreenchange',
      'webkitfullscreenchange',
      'mozfullscreenchange',
      'msfullscreenchange',
    ].forEach(function (eventName) {
      document.addEventListener(eventName, syncFullscreenButtons);
    });
    syncFullscreenButtons();
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  function normaliseStepLabel(label, index) {
    var text = String(label == null ? '' : label).trim();
    if (text) return text;
    return String(index + 1).padStart(2, '0') + ' Step';
  }

  function normaliseDescriptionForStep(descriptions, index) {
    if (!Array.isArray(descriptions)) return '';
    if (descriptions.length >= 13) {
      return String(index < 2 ? descriptions[index] : descriptions[index + 1] || '');
    }
    return String(descriptions[index] || '');
  }

  function renderDataCell(cell) {
    var status = cell && cell.status ? escapeHtml(cell.status) : '';
    var bullets = Array.isArray(cell && cell.bullets) ? cell.bullets : [];
    var rows = '';
    if (status) rows += '<span class="cjv2-opg-status">' + status + '</span>';
    if (bullets.length) {
      rows += '<ul class="cjv2-opg-list">' + bullets.map(function (bullet) {
        return '<li>' + escapeHtml(bullet) + '</li>';
      }).join('') + '</ul>';
    }
    return rows || '<span class="cjv2-opg-text-strong">-</span>';
  }

  function renderAdobeCell(cell) {
    var blocks = Array.isArray(cell && cell.blocks) ? cell.blocks : [];
    if (!blocks.length) return '<span class="cjv2-opg-text-strong">-</span>';
    var html = '';
    var listItems = [];
    function flushList() {
      if (!listItems.length) return;
      html += '<ul class="cjv2-opg-list">' + listItems.join('') + '</ul>';
      listItems = [];
    }
    blocks.forEach(function (block) {
      var type = String(block && block.type || '').toLowerCase();
      var text = escapeHtml(block && block.text || '');
      if (type === 'bullet') {
        listItems.push('<li>' + text + '</li>');
        return;
      }
      flushList();
      if (type === 'product') html += '<p class="cjv2-opg-product">' + text + '</p>';
      else if (type === 'heading') html += '<p class="cjv2-opg-block-title">' + text + '</p>';
      else if (type === 'blank') html += '<div class="cjv2-opg-blank" aria-hidden="true"></div>';
    });
    flushList();
    return html || '<span class="cjv2-opg-text-strong">-</span>';
  }

  function renderTechCell(cell) {
    var heading = cell && cell.heading ? escapeHtml(cell.heading) : '';
    var bullets = Array.isArray(cell && cell.bullets) ? cell.bullets : [];
    var html = '';
    if (heading) html += '<span class="cjv2-opg-status">' + heading + '</span>';
    if (bullets.length) {
      html += '<ul class="cjv2-opg-list">' + bullets.map(function (bullet) {
        var raw = String(bullet == null ? '' : bullet);
        var badge = '';
        var text = raw;
        var match = raw.match(/\[(confirmed|assumed)\]\s*$/i);
        if (match) {
          badge = '<span class="cjv2-opg-badge">' + escapeHtml(match[1]) + '</span>';
          text = raw.replace(/\[(confirmed|assumed)\]\s*$/i, '').trim();
        }
        return '<li>' + escapeHtml(text) + badge + '</li>';
      }).join('') + '</ul>';
    }
    return html || '<span class="cjv2-opg-text-strong">-</span>';
  }

  function buildOnePagerHtml(result) {
    var journey = result && result.journey || {};
    var meta = result && result.meta || journey.meta || {};
    var client = String(meta.client || 'Client');
    var journeyType = String(meta.journeyType || 'Customer journey');
    var tier = String(meta.tier || 'Foundation');
    var persona = String(meta.personaName || '');
    var marketer = String(meta.marketerPersonaName || '');
    var brand = String(meta.brandColor || '');
    var brandChipStyle = brand ? ' style="border-color:#' + escapeAttr(brand) + ';color:#' + escapeAttr(brand) + ';"' : '';

    var stepLabels = Array.isArray(journey.stepLabels) ? journey.stepLabels.slice(0, 12) : [];
    while (stepLabels.length < 12) stepLabels.push('');
    var descriptions = Array.isArray(journey.descriptions) ? journey.descriptions.slice(0, 13) : [];
    while (descriptions.length < 13) descriptions.push('');
    var dataCells = Array.isArray(journey.pptxData) ? journey.pptxData.slice(0, 12) : [];
    var adobeCells = Array.isArray(journey.pptxAdobe) ? journey.pptxAdobe.slice(0, 12) : [];
    var techCells = Array.isArray(journey.pptxTech) ? journey.pptxTech.slice(0, 12) : [];
    while (dataCells.length < 12) dataCells.push({ status: '', bullets: [] });
    while (adobeCells.length < 12) adobeCells.push({ blocks: [] });
    while (techCells.length < 12) techCells.push({ heading: '', bullets: [] });

    var stepHeadings = stepLabels.map(function (label, idx) {
      return '<th scope="col">' + escapeHtml(normaliseStepLabel(label, idx)) + '</th>';
    }).join('');

    var descriptionRow = descriptions.slice(0, 12).map(function (_, idx) {
      return '<td><p class="cjv2-opg-text-strong">' +
        escapeHtml(normaliseDescriptionForStep(descriptions, idx)) +
        '</p></td>';
    }).join('');
    var dataRow = dataCells.map(function (cell) {
      return '<td>' + renderDataCell(cell) + '</td>';
    }).join('');
    var adobeRow = adobeCells.map(function (cell) {
      return '<td>' + renderAdobeCell(cell) + '</td>';
    }).join('');
    var techRow = techCells.map(function (cell) {
      return '<td>' + renderTechCell(cell) + '</td>';
    }).join('');

    var whoLine = persona ? 'Persona: ' + escapeHtml(persona) : '';
    if (marketer) {
      whoLine += (whoLine ? ' · ' : '') + 'Marketer: ' + escapeHtml(marketer);
    }
    var whoHtml = whoLine ? '<p class="cjv2-opg-subheading">' + whoLine + '</p>' : '';

    return '' +
      '<div class="cjv2-opg-header">' +
        '<div>' +
          '<h4 class="cjv2-opg-heading">' + escapeHtml(client) + ' — Adobe Experience Platform one-pager</h4>' +
          '<p class="cjv2-opg-subheading">' + escapeHtml(journeyType) + '</p>' +
          whoHtml +
        '</div>' +
        '<span class="cjv2-opg-pill"' + brandChipStyle + '>' + escapeHtml(tier) + '</span>' +
      '</div>' +
      '<div class="cjv2-opg-table-wrap">' +
        '<table class="cjv2-opg-table">' +
          '<thead><tr><th scope="col" class="cjv2-opg-row-label">Section</th>' + stepHeadings + '</tr></thead>' +
          '<tbody>' +
            '<tr><th scope="row" class="cjv2-opg-row-label">Description</th>' + descriptionRow + '</tr>' +
            '<tr><th scope="row" class="cjv2-opg-row-label">Data collected</th>' + dataRow + '</tr>' +
            '<tr><th scope="row" class="cjv2-opg-row-label">Adobe platform</th>' + adobeRow + '</tr>' +
            '<tr><th scope="row" class="cjv2-opg-row-label">Existing ' + escapeHtml(client) + ' technology</th>' + techRow + '</tr>' +
          '</tbody>' +
        '</table>' +
      '</div>';
  }

  function ensureOnePagerHtml(result) {
    if (!result) return '';
    if (typeof result.onePagerHtml === 'string' && result.onePagerHtml.trim()) {
      return result.onePagerHtml;
    }
    var rendered = buildOnePagerHtml(result);
    result.onePagerHtml = rendered;
    return rendered;
  }

  bindScrapeChoiceControls();
  enterManualScrapeChoiceMode();

  resetBtn.addEventListener('click', function () {
    form.reset();
    setStatus('');
    setPptxStatus('');
    clearLastResult();
    longCallNote.hidden = true;
    showImportSource(null);
    enterManualScrapeChoiceMode();
    clearBrandColorScrapeUi();
    syncBrandColorUi(brandColorInput.value);
  });

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    syncScrapeChoiceHiddenFields();
    var body = readForm();
    if (!body.client) {
      setStatus('Client name is required.', 'error');
      return;
    }
    var brandValidation = validateBrandColorForSubmit();
    if (!brandValidation.ok) {
      setStatus(brandValidation.message, 'error');
      brandColorInput.focus();
      return;
    }
    body.brandColor = brandValidation.value;
    clearLastResult();
    generateBtn.disabled = true;
    if (refineBtn) refineBtn.disabled = true;
    longCallNote.hidden = false;
    var startedAt = Date.now();
    setStatus('Sending request to Vertex AI Gemini…');
    setRefineStatus('');

    var tickHandle = setInterval(function () {
      var elapsed = Math.round((Date.now() - startedAt) / 1000);
      setStatus('Working — ' + elapsed + 's elapsed. Vertex AI Gemini drafting the journey, running silent self-scans, and emitting JSON…');
    }, 4000);

    try {
      var resp = await fetch(GENERATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
      });
      var json;
      try { json = await resp.json(); }
      catch (parseErr) {
        throw new Error('Server returned non-JSON (HTTP ' + resp.status + ')');
      }
      if (!resp.ok || !json.ok) {
        var detail = json && (json.detail || json.error) || ('HTTP ' + resp.status);
        if (Array.isArray(json && json.validationErrors) && json.validationErrors.length) {
          detail += ' — schema errors: ' + json.validationErrors.slice(0, 3).join('; ');
        }
        // Preserve full backend detail in console while showing concise guidance.
        console.error('[cjv2] generate server error detail:', detail, json || null);
        var userMessage = userFacingServerError(json, detail);
        throw new Error(userMessage);
      }
      if (!json.html || !json.journey) {
        throw new Error('Server returned ok but no html or journey in payload');
      }

      lastResult = json;
      ensureOnePagerHtml(lastResult);
      tryPersistLastRun(cloneFormSnapshot(body), json);
      var elapsed = Math.round((Date.now() - startedAt) / 1000);
      setStatus('Done in ' + elapsed + 's. ' + (json.meta && json.meta.tier) + ' tier journey for ' + (json.meta && json.meta.client) + '.', 'success');
      renderOutput();
    } catch (err) {
      console.error('[cjv2] generate failed:', err);
      setStatus(String(err.message || err), 'error');
    } finally {
      clearInterval(tickHandle);
      generateBtn.disabled = false;
      if (refineBtn) refineBtn.disabled = false;
      longCallNote.hidden = true;
    }
  });

  async function refineJourney() {
    if (!lastResult || !lastResult.journey) {
      setRefineStatus('Generate a journey first, then refine it.', 'error');
      return;
    }
    var prompt = String(refinePromptEl && refinePromptEl.value || '').trim();
    if (!prompt) {
      setRefineStatus('Type a refinement prompt before clicking Refine assets.', 'error');
      if (refinePromptEl) refinePromptEl.focus();
      return;
    }
    syncScrapeChoiceHiddenFields();
    var body = readForm();
    var brandValidation = validateBrandColorForSubmit();
    if (!brandValidation.ok) {
      setStatus(brandValidation.message, 'error');
      brandColorInput.focus();
      return;
    }
    body.brandColor = brandValidation.value;

    var contextPayload = {
      client: body.client,
      clientDomain: body.clientDomain || '',
      brandColor: body.brandColor || '',
      journeyType: body.journeyType || '',
      personaName: body.personaName || '',
      personaGender: body.personaGender || 'female',
      marketerPersonaName: body.marketerPersonaName || '',
      tier: body.tier,
      techStack: body.techStack || '',
      additionalContext: body.additionalContext || '',
      meta: lastResult.meta || {},
    };

    refineBtn.disabled = true;
    generateBtn.disabled = true;
    longCallNote.hidden = false;
    setRefineStatus('Refining with Vertex AI…');
    setStatus('');
    setPptxStatus('');
    var startedAt = Date.now();

    try {
      var resp = await fetch(REFINE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          journey: lastResult.journey,
          refinePrompt: prompt,
          context: contextPayload,
        }),
        cache: 'no-store',
      });
      var json;
      try { json = await resp.json(); }
      catch (parseErr) {
        throw new Error('Server returned non-JSON (HTTP ' + resp.status + ')');
      }
      if (!resp.ok || !json.ok) {
        var detail = json && (json.detail || json.error) || ('HTTP ' + resp.status);
        if (Array.isArray(json && json.validationErrors) && json.validationErrors.length) {
          detail += ' — schema errors: ' + json.validationErrors.slice(0, 3).join('; ');
        }
        console.error('[cjv2] refine server error detail:', detail, json || null);
        throw new Error(userFacingServerError(json, detail));
      }
      if (!json.html || !json.journey) {
        throw new Error('Server returned ok but no html or journey in payload');
      }

      lastResult = json;
      ensureOnePagerHtml(lastResult);
      tryPersistLastRun(cloneFormSnapshot(body), json);
      renderOutput();
      setRefineStatus('Updated. The journey output was refined and replaced.', 'success');
      if (refinePromptEl) refinePromptEl.value = '';
      var elapsed = Math.round((Date.now() - startedAt) / 1000);
      setStatus('Refinement complete in ' + elapsed + 's.', 'success');
    } catch (err) {
      console.error('[cjv2] refine failed:', err);
      setRefineStatus('Refine failed: ' + String(err.message || err), 'error');
      setStatus('Your previous result is still loaded.', '');
    } finally {
      refineBtn.disabled = false;
      generateBtn.disabled = false;
      longCallNote.hidden = true;
    }
  }

  // ── Output rendering ──────────────────────────────────────────────────

  function renderOutput() {
    if (!lastResult) return;
    if (lastBlobUrl) {
      try { URL.revokeObjectURL(lastBlobUrl); } catch (e) {}
      lastBlobUrl = null;
    }
    var blob = new Blob([lastResult.html], { type: 'text/html;charset=utf-8' });
    lastBlobUrl = URL.createObjectURL(blob);
    iframeEl.src = lastBlobUrl;
    if (onePagerHtmlEl) {
      onePagerHtmlEl.innerHTML = ensureOnePagerHtml(lastResult);
      if (onePagerMountEl && getFullscreenElement() === onePagerMountEl) onePagerMountEl.scrollTop = 0;
    }

    outputSection.hidden = false;
    debugSection.hidden = false;
    if (refinePanel) refinePanel.hidden = false;

    sourcesEl.innerHTML = '';
    (lastResult.sources || []).forEach(function (s) {
      var li = document.createElement('li');
      var label = document.createElement('span');
      label.textContent = s.title;
      var pill = document.createElement('span');
      pill.className = 'cjv2-source-pill';
      pill.setAttribute('data-source', s.source);
      pill.textContent = s.source;
      li.appendChild(label);
      li.appendChild(pill);
      if (s.libraryId) {
        var ref = document.createElement('span');
        ref.style.marginLeft = '0.4rem';
        ref.style.opacity = '0.7';
        ref.textContent = '[' + s.libraryId + ']';
        li.appendChild(ref);
      }
      sourcesEl.appendChild(li);
    });

    logEl.textContent = (lastResult.log || []).join('\n');
    metaEl.textContent = JSON.stringify(lastResult.meta || {}, null, 2);

    bindFullscreen();
    syncFullscreenButtons();
  }

  // ── Download buttons ──────────────────────────────────────────────────

  function downloadHtml() {
    if (!lastResult || !lastResult.html) return;
    var blob = new Blob([lastResult.html], { type: 'text/html;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var slug = (lastResult.meta && lastResult.meta.clientSlug) || 'client';
    var a = document.createElement('a');
    a.href = url;
    a.download = slug + '-journey-v2.html';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      try { URL.revokeObjectURL(url); } catch (e) {}
      a.remove();
    }, 0);
  }

  function openInNewTab() {
    if (!lastBlobUrl) return;
    window.open(lastBlobUrl, '_blank', 'noopener');
  }

  async function downloadPptx() {
    if (!lastResult || !lastResult.journey) {
      setPptxStatus('No journey loaded.', 'error');
      return;
    }
    downloadPptxBtn.disabled = true;
    setPptxStatus('Rendering PPTX…');
    try {
      var resp = await fetch(PPTX_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          journey: lastResult.journey,
          clientDomain: (lastResult.meta && lastResult.meta.clientDomain) || '',
        }),
      });
      if (!resp.ok) {
        var errBody = {};
        try { errBody = await resp.json(); } catch (e) {}
        throw new Error(errBody.error || ('HTTP ' + resp.status));
      }
      var blob = await resp.blob();
      var slug = (lastResult.meta && lastResult.meta.clientSlug) || 'client';
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = slug + '-one-pager-v2.pptx';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        try { URL.revokeObjectURL(url); } catch (e) {}
        a.remove();
      }, 0);
      setPptxStatus('PPTX downloaded.', 'success');
    } catch (err) {
      console.error('[cjv2] pptx failed:', err);
      setPptxStatus(String(err.message || err), 'error');
    } finally {
      downloadPptxBtn.disabled = false;
    }
  }

  downloadHtmlBtn.addEventListener('click', downloadHtml);
  downloadPptxBtn.addEventListener('click', downloadPptx);
  openNewTabBtn.addEventListener('click', openInNewTab);
  if (importLoadBtn) importLoadBtn.addEventListener('click', loadImportScrapes);
  bindImportSortControl();
  if (refineBtn) refineBtn.addEventListener('click', refineJourney);
  if (refinePromptEl) {
    refinePromptEl.addEventListener('keydown', function (ev) {
      if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') {
        ev.preventDefault();
        refineJourney();
      }
    });
  }

  if (restoreBtn && restoreDiscardBtn) {
    restoreBtn.addEventListener('click', function () {
      var p = pendingRestorePayload;
      if (!p || !isValidPersist(p)) {
        hideRestoreBanner();
        return;
      }
      applyFormSnapshot(p.form);
      syncBrandColorUi(brandColorInput.value);
      applyRestoredResult(p);
    });
    restoreDiscardBtn.addEventListener('click', function () {
      clearPersisted();
      hideRestoreBanner();
    });
  }

  void initGlobalSandboxSelect();

  showRestoreBannerIfNeeded();
  bindFullscreen();

  // Cleanup on unload to avoid leaking blob URLs.
  window.addEventListener('beforeunload', function () {
    if (lastBlobUrl) { try { URL.revokeObjectURL(lastBlobUrl); } catch (e) {} }
  });
})();
