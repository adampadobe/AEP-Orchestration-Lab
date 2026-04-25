(function () {
  'use strict';

  // Firebase Hosting rewrites cap proxied requests at 60s. The analyze + classify
  // + export endpoints run longer, so hit the Cloud Functions direct URLs
  // (cloudfunctions.net is stable regardless of revision hash).
  // List/get/delete are fast and still go via /api/*.
  const FN_BASE = 'https://us-central1-aep-orchestration-lab.cloudfunctions.net';
  const ANALYZE_URL = FN_BASE + '/brandScraperAnalyze';
  const CLASSIFY_URL = FN_BASE + '/brandScraperClassify';
  const EXPORT_URL = FN_BASE + '/brandScraperExport';

  const form = document.getElementById('brandScraperForm');
  const urlInput = document.getElementById('brandScraperUrl');
  const btypeSel = document.getElementById('brandScraperBusinessType');
  const countrySel = document.getElementById('brandScraperCountry');
  const pagesInput = document.getElementById('brandScraperPages');
  const statusEl = document.getElementById('brandScraperStatus');
  const runBtn = document.getElementById('brandScraperRun');
  const resultsEl = document.getElementById('brandScraperResults');
  const historyListEl = document.getElementById('brandScraperHistoryList');
  const historyEmptyEl = document.getElementById('brandScraperHistoryEmpty');
  const historySandboxEl = document.getElementById('brandScraperHistorySandbox');
  const historyRefreshBtn = document.getElementById('brandScraperHistoryRefresh');
  const viewListBtn = document.getElementById('brandScraperViewList');
  const viewIndustryBtn = document.getElementById('brandScraperViewIndustry');
  const selectToggleBtn = document.getElementById('brandScraperHistorySelect');
  const selectBarEl = document.getElementById('brandScraperSelectBar');
  const selectCountEl = document.getElementById('brandScraperSelectCount');
  const selectAllBtn = document.getElementById('brandScraperSelectAll');
  const selectNoneBtn = document.getElementById('brandScraperSelectNone');
  const deleteSelectedBtn = document.getElementById('brandScraperDeleteSelected');
  if (!form || !urlInput || !statusEl || !resultsEl) return;

  function getSandbox() {
    try {
      return (window.AepGlobalSandbox && window.AepGlobalSandbox.getSandboxName()) || '';
    } catch (_e) { return ''; }
  }

  const LS_PAGES = 'aepBrandScraperPages';
  const PAGES_MIN = 1;
  const PAGES_MAX = 25;
  function clampPages(n) {
    const v = Math.floor(Number(n));
    if (!v || v < PAGES_MIN) return PAGES_MIN;
    if (v > PAGES_MAX) return PAGES_MAX;
    return v;
  }
  if (pagesInput) {
    try {
      const stored = localStorage.getItem(LS_PAGES);
      if (stored) pagesInput.value = clampPages(stored);
    } catch (_e) {}
    pagesInput.addEventListener('change', () => {
      pagesInput.value = clampPages(pagesInput.value);
      try { localStorage.setItem(LS_PAGES, String(pagesInput.value)); } catch (_e) {}
    });
  }

  const LS_RUN_OPTIONS = 'aepBrandScraperRunOptions';
  const RUN_OPTION_KEYS = ['analysis', 'personas', 'campaigns', 'segments', 'stakeholders', 'tagAudit'];

  function loadRunOptions() {
    const defaults = { analysis: true, personas: true, campaigns: true, segments: true, stakeholders: true, tagAudit: true };
    try {
      const raw = localStorage.getItem(LS_RUN_OPTIONS);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw);
      const out = { ...defaults };
      for (const k of RUN_OPTION_KEYS) if (typeof parsed[k] === 'boolean') out[k] = parsed[k];
      return out;
    } catch (_e) { return defaults; }
  }

  function saveRunOptions(opts) {
    try { localStorage.setItem(LS_RUN_OPTIONS, JSON.stringify(opts)); } catch (_e) {}
  }

  let runOptions = loadRunOptions();

  const optionsBtn = document.getElementById('brandScraperOptionsBtn');
  const optionsMenu = document.getElementById('brandScraperOptionsMenu');
  const optionsCountEl = document.getElementById('brandScraperOptionsCount');
  const crawlerJsCb = document.getElementById('brandScraperCrawlerJs');

  // ---------- Model config (per-sandbox LLM provider + Secret Manager keys) ----------
  const modelCollapsedEl = document.getElementById('brandScraperModelCollapsed');
  const modelExpandedEl = document.getElementById('brandScraperModelExpanded');
  const modelOverrideBtn = document.getElementById('brandScraperModelOverrideBtn');
  const modelCloseBtn = document.getElementById('brandScraperModelCloseBtn');
  const modelSelectEl = document.getElementById('brandScraperModelSelect');
  const modelStatusEl = document.getElementById('brandScraperModelStatus');
  const modelKeyRowEl = document.getElementById('brandScraperModelKeyRow');
  const modelKeyInputEl = document.getElementById('brandScraperModelKey');
  const modelSaveBtn = document.getElementById('brandScraperModelSave');
  const modelRemoveBtn = document.getElementById('brandScraperModelRemove');

  let modelConfigCache = null;
  let modelManualOverride = false; // session-only: user clicked Override

  function isAtRestDefault(cfg) {
    if (!cfg) return false;
    return cfg.preferredProvider === 'default' && !cfg.hasAnthropicKey && !cfg.hasOpenAIKey;
  }

  function renderModelConfig() {
    if (!modelSelectEl || !modelStatusEl) return;
    const cfg = modelConfigCache || {};
    const pref = cfg.preferredProvider || 'default';

    // Layout choice: collapsed when nothing custom is configured AND user
    // hasn't clicked Override this session. Otherwise show the full panel.
    const showCollapsed = isAtRestDefault(cfg) && !modelManualOverride;
    if (modelCollapsedEl) modelCollapsedEl.hidden = !showCollapsed;
    if (modelExpandedEl) modelExpandedEl.hidden = showCollapsed;
    if (showCollapsed) return; // nothing else to render

    modelSelectEl.value = pref;
    // Belt-and-braces: hide key row unconditionally when the DROPDOWN itself
    // is on 'default' right now — covers the sliver of time between user
    // changing the select and server PUT completing.
    const keyProviderSelected = (pref === 'anthropic' || pref === 'openai');
    const dropdownIsDefault = modelSelectEl.value === 'default';
    modelKeyRowEl.hidden = !keyProviderSelected || dropdownIsDefault;
    if (modelKeyInputEl) modelKeyInputEl.value = '';

    const hasKey = pref === 'anthropic' ? cfg.hasAnthropicKey : pref === 'openai' ? cfg.hasOpenAIKey : false;
    if (modelSaveBtn) modelSaveBtn.textContent = hasKey ? 'Replace key' : 'Save key';
    if (modelRemoveBtn) modelRemoveBtn.hidden = !hasKey;
    if (modelKeyInputEl) {
      modelKeyInputEl.placeholder = pref === 'openai' ? 'sk-...' : pref === 'anthropic' ? 'sk-ant-...' : '';
    }
    // Collapse button only makes sense when the user could go back to the
    // at-rest default state (nothing saved, default selected).
    if (modelCloseBtn) modelCloseBtn.hidden = !isAtRestDefault(cfg);

    let statusBits = [];
    if (pref === 'default') statusBits.push('Gemini (service account) — no key required');
    else if (pref === 'anthropic') statusBits.push(hasKey ? 'Anthropic key configured ✓' : 'Anthropic selected — paste a key below');
    else if (pref === 'openai') statusBits.push(hasKey ? 'OpenAI key configured ✓' : 'OpenAI selected — paste a key below');
    modelStatusEl.textContent = statusBits.join(' · ');
  }

  if (modelOverrideBtn) {
    modelOverrideBtn.addEventListener('click', () => {
      modelManualOverride = true;
      renderModelConfig();
    });
  }
  if (modelCloseBtn) {
    modelCloseBtn.addEventListener('click', () => {
      modelManualOverride = false;
      renderModelConfig();
    });
  }

  async function loadModelConfig() {
    if (!modelSelectEl) return;
    // Fresh sandbox → reset manual override; user can click Override again if wanted.
    modelManualOverride = false;
    const sb = getSandbox();
    if (!sb) {
      modelConfigCache = null;
      if (modelStatusEl) modelStatusEl.textContent = 'Select a sandbox to configure model.';
      modelKeyRowEl.hidden = true;
      return;
    }
    try {
      const resp = await fetch(withSandboxQuery('/api/brand-scraper/model-config'));
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) { modelStatusEl.textContent = 'Failed to load model config: ' + (data.error || resp.statusText); return; }
      modelConfigCache = data;
      renderModelConfig();
    } catch (e) {
      modelStatusEl.textContent = 'Network error loading model config: ' + (e && e.message || e);
    }
  }

  async function putModelConfig(body) {
    const sb = getSandbox();
    if (!sb) { setStatus('Select a sandbox first.', 'error'); return null; }
    const resp = await fetch(withSandboxQuery('/api/brand-scraper/model-config'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || resp.statusText);
    modelConfigCache = data;
    renderModelConfig();
    return data;
  }

  if (modelSelectEl) {
    modelSelectEl.addEventListener('change', async () => {
      const newPref = modelSelectEl.value;
      // Optimistic: apply locally so the key row hides/shows and the status
      // line updates before the server round-trip completes.
      if (modelConfigCache) {
        modelConfigCache = { ...modelConfigCache, preferredProvider: newPref };
        renderModelConfig();
      }
      try {
        await putModelConfig({ preferredProvider: newPref });
      } catch (e) {
        setStatus('Could not update model: ' + (e && e.message || e), 'error');
        // Server refused our change — resync from source of truth.
        loadModelConfig();
      }
    });
  }
  if (modelSaveBtn) {
    modelSaveBtn.addEventListener('click', async () => {
      const provider = modelSelectEl && modelSelectEl.value;
      const key = (modelKeyInputEl && modelKeyInputEl.value || '').trim();
      if (!provider || provider === 'default') return;
      if (!key) { setStatus('Paste an API key into the field before saving.', 'error'); return; }
      modelSaveBtn.disabled = true; modelSaveBtn.textContent = 'Saving…';
      try {
        const body = { preferredProvider: provider };
        body[provider + 'Key'] = key;
        await putModelConfig(body);
        setStatus('Key saved to Secret Manager for this sandbox. Future Analyses will use ' + provider + '.', 'info');
      } catch (e) {
        setStatus('Could not save key: ' + (e && e.message || e), 'error');
      } finally {
        modelSaveBtn.disabled = false;
      }
    });
  }
  if (modelRemoveBtn) {
    modelRemoveBtn.addEventListener('click', async () => {
      const provider = modelSelectEl && modelSelectEl.value;
      if (!provider || provider === 'default') return;
      if (!confirm('Remove the stored ' + provider + ' API key for this sandbox?')) return;
      modelRemoveBtn.disabled = true;
      try {
        const body = { preferredProvider: 'default' };
        body['clear' + provider[0].toUpperCase() + provider.slice(1) + 'Key'] = true;
        await putModelConfig(body);
        setStatus(provider + ' key removed. Falling back to default (Gemini).', 'info');
      } catch (e) {
        setStatus('Could not remove key: ' + (e && e.message || e), 'error');
      } finally {
        modelRemoveBtn.disabled = false;
      }
    });
  }

  const LS_CRAWLER = 'aepBrandScraperCrawler';
  /** Includes AI/run flags plus JS-rendered crawl (Playwright) — seven checkboxes in the Options menu. */
  const RUN_OPTIONS_MENU_TOTAL = RUN_OPTION_KEYS.length + 1;

  try {
    const stored = localStorage.getItem(LS_CRAWLER);
    if (crawlerJsCb && stored === 'js') crawlerJsCb.checked = true;
  } catch (_e) {}
  if (crawlerJsCb) {
    crawlerJsCb.addEventListener('change', () => {
      try { localStorage.setItem(LS_CRAWLER, crawlerJsCb.checked ? 'js' : 'fetch'); } catch (_e) {}
      applyRunOptionsToUI();
    });
  }

  function applyRunOptionsToUI() {
    if (!optionsMenu) return;
    const checks = optionsMenu.querySelectorAll('input[data-run-option]');
    let on = 0;
    checks.forEach(cb => {
      const key = cb.getAttribute('data-run-option');
      cb.checked = !!runOptions[key];
      if (runOptions[key]) on++;
    });
    if (crawlerJsCb && crawlerJsCb.checked) on++;
    if (optionsCountEl) optionsCountEl.textContent = on + '/' + RUN_OPTIONS_MENU_TOTAL;
    if (optionsBtn) optionsBtn.classList.toggle('is-reduced', on < RUN_OPTIONS_MENU_TOTAL);
  }

  if (optionsMenu) {
    optionsMenu.addEventListener('change', (evt) => {
      const cb = evt.target.closest('input[data-run-option]');
      if (!cb) return;
      const key = cb.getAttribute('data-run-option');
      runOptions[key] = cb.checked;
      saveRunOptions(runOptions);
      applyRunOptionsToUI();
    });
  }
  if (optionsBtn) {
    optionsBtn.addEventListener('click', (evt) => {
      evt.stopPropagation();
      const open = !optionsMenu.hidden;
      optionsMenu.hidden = open;
      optionsBtn.setAttribute('aria-expanded', open ? 'false' : 'true');
    });
  }
  document.addEventListener('click', (evt) => {
    if (!optionsMenu || optionsMenu.hidden) return;
    if (optionsMenu.contains(evt.target) || (optionsBtn && optionsBtn.contains(evt.target))) return;
    optionsMenu.hidden = true;
    if (optionsBtn) optionsBtn.setAttribute('aria-expanded', 'false');
  });

  applyRunOptionsToUI();

  const LS_COUNTRY_PREFIX = 'aepBrandScraperCountry_';
  function countryKey(sb) { return LS_COUNTRY_PREFIX + (sb || 'default'); }

  function applyStoredCountry() {
    if (!countrySel) return;
    const sb = getSandbox();
    let stored = null;
    try { stored = localStorage.getItem(countryKey(sb)); } catch (_e) { /* ignore */ }
    if (!stored) return;
    // Only set if the option actually exists in the dropdown.
    const has = Array.from(countrySel.options).some(o => o.value === stored);
    if (has) countrySel.value = stored;
  }

  if (countrySel) {
    countrySel.addEventListener('change', () => {
      const sb = getSandbox();
      if (!sb) return; // no sandbox, no sticky save
      try { localStorage.setItem(countryKey(sb), countrySel.value); } catch (_e) { /* ignore */ }
    });
  }

  function withSandboxQuery(path) {
    const sb = getSandbox();
    const sep = path.includes('?') ? '&' : '?';
    return sb ? path + sep + 'sandbox=' + encodeURIComponent(sb) : path;
  }

  // ---------- Progress bar (client-side elapsed-time estimate) ----------
  const progressEl = document.getElementById('brandScraperProgress');
  const progressFillEl = document.getElementById('brandScraperProgressFill');
  const progressPhaseEl = document.getElementById('brandScraperProgressPhase');
  const progressElapsedEl = document.getElementById('brandScraperProgressElapsed');
  const progressEtaEl = document.getElementById('brandScraperProgressEta');

  let progressHandle = null;

  function fmtSeconds(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return s + 's';
    return Math.floor(s / 60) + 'm ' + (s % 60) + 's';
  }

  function estimateAnalyzeDurationMs(opts) {
    // Rough per-phase Gemini Pro / Flash durations (seconds) observed in prod.
    let crawl = opts.crawler === 'js' ? 15 : 5;
    const inc = opts.include || {};
    if (inc.tagAudit !== false && opts.crawler === 'js') crawl += 3;
    const includes = inc;
    const trio = [includes.analysis, includes.personas, includes.campaigns, includes.stakeholders]
      .filter(Boolean).length;
    // trio members run in parallel — wall time ≈ max of them, not sum.
    const trioWall = trio === 0 ? 0 : 30 + (trio - 1) * 2;  // slight amortisation cost
    const segmentsWall = includes.segments ? 25 : 0;        // sequential after trio
    const industryWall = trio > 0 ? 2 : 0;                   // always runs when we have analysis context
    return (crawl + trioWall + segmentsWall + industryWall) * 1000;
  }

  function startProgress(totalMs, phases) {
    if (!progressEl) return;
    stopProgress();
    progressEl.hidden = false;
    progressEl.classList.remove('is-done');
    progressFillEl.style.width = '0%';
    progressElapsedEl.textContent = '0s';
    progressEtaEl.textContent = fmtSeconds(totalMs);

    const started = Date.now();
    const rotationMs = Math.max(2500, Math.floor(totalMs / (phases.length || 1)));
    progressPhaseEl.textContent = phases[0] || 'Working…';

    progressHandle = setInterval(() => {
      const elapsed = Date.now() - started;
      // Smooth asymptotic curve — linear to 80%, then slows to avoid hitting 100% early.
      const linearFrac = Math.min(0.8, elapsed / totalMs * 0.85);
      const remaining = 1 - linearFrac;
      const overrun = Math.max(0, elapsed - totalMs * 0.85);
      const slow = remaining * (1 - Math.exp(-overrun / (totalMs || 1)));
      const pct = Math.min(0.95, linearFrac + slow) * 100;
      progressFillEl.style.width = pct.toFixed(1) + '%';
      progressElapsedEl.textContent = fmtSeconds(elapsed);
      const phaseIdx = Math.min(phases.length - 1, Math.floor(elapsed / rotationMs));
      if (phases[phaseIdx]) progressPhaseEl.textContent = phases[phaseIdx];
    }, 250);
  }

  function stopProgress({ success } = {}) {
    if (progressHandle) { clearInterval(progressHandle); progressHandle = null; }
    if (!progressEl) return;
    if (success) {
      progressFillEl.style.width = '100%';
      progressEl.classList.add('is-done');
      progressPhaseEl.textContent = 'Done';
      setTimeout(() => { progressEl.hidden = true; }, 900);
    } else {
      progressEl.hidden = true;
    }
  }

  // Retry on Cloud Run cold-start 401/403 and transient 5xx. Short backoff
  // because 403-on-cold-start usually clears within 1-3 seconds.
  function isTransientStatus(s) {
    return s === 401 || s === 403 || s === 408 || s === 425 || s === 429 || (s >= 500 && s < 600);
  }
  async function fetchWithRetry(url, options, { retries = 2, backoffMs = 1500, onRetry } = {}) {
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const resp = await fetch(url, options);
        if (isTransientStatus(resp.status) && attempt < retries) {
          if (onRetry) onRetry(attempt + 1, resp.status);
          await new Promise(r => setTimeout(r, backoffMs * (attempt + 1)));
          continue;
        }
        return resp;
      } catch (e) {
        lastErr = e;
        if (attempt < retries) {
          if (onRetry) onRetry(attempt + 1, 'network');
          await new Promise(r => setTimeout(r, backoffMs * (attempt + 1)));
          continue;
        }
        throw e;
      }
    }
    if (lastErr) throw lastErr;
  }

  function setStatus(message, kind) {
    if (!message) {
      statusEl.hidden = true;
      statusEl.textContent = '';
      statusEl.removeAttribute('data-kind');
      return;
    }
    statusEl.hidden = false;
    statusEl.textContent = message;
    if (kind) statusEl.setAttribute('data-kind', kind);
    else statusEl.removeAttribute('data-kind');
  }

  function normaliseUrl(raw) {
    const v = (raw || '').trim();
    if (!v) return '';
    return /^https?:\/\//i.test(v) ? v : 'https://' + v;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function tagAuditVendorTags(v) {
    if (!v || typeof v !== 'object') return [];
    return Object.keys(v).filter(function (k) { return v[k]; }).sort();
  }

  function renderTagAuditPageDetails(ta) {
    if (!ta) {
      return '<div class="brand-scraper-tag-page-details"><p class="brand-scraper-result-muted">No tag audit for this page.</p></div>';
    }
    var blocks = [];
    if (ta.depthNote) {
      blocks.push('<p class="brand-scraper-result-muted"><strong>Coverage</strong> · ' + esc(ta.depthNote) + '</p>');
    }
    var vtags = tagAuditVendorTags(ta.vendors);
    if (vtags.length) {
      blocks.push('<p class="brand-scraper-result-muted"><strong>Vendors</strong></p><p class="brand-scraper-tag-chips">' +
        vtags.map(function (t) { return '<span class="brand-scraper-chip brand-scraper-chip--tag">' + esc(t) + '</span>'; }).join(' ') + '</p>');
    }
    var arch = ta.architecture;
    if (arch && ((arch.gtmContainerIds && arch.gtmContainerIds.length) || (arch.adobeLaunchScriptHints && arch.adobeLaunchScriptHints.length))) {
      var archBits = [];
      if (arch.gtmContainerIds && arch.gtmContainerIds.length) {
        archBits.push('GTM ' + arch.gtmContainerIds.map(function (id) { return esc(id); }).join(', '));
      }
      if (arch.adobeLaunchScriptHints && arch.adobeLaunchScriptHints.length) {
        archBits.push('Launch hints: ' + arch.adobeLaunchScriptHints.map(function (h) { return esc(h); }).join('; '));
      }
      blocks.push('<p class="brand-scraper-result-muted"><strong>Architecture</strong> · ' + archBits.join(' · ') + '</p>');
    }
    if (ta.dataLayer && (ta.dataLayer.present || ta.dataLayer.length != null)) {
      var dlMeta = 'length ' + esc(String(ta.dataLayer.length != null ? ta.dataLayer.length : '—'));
      if (ta.dataLayer.pushCount != null) dlMeta += ' · pushes ' + esc(String(ta.dataLayer.pushCount));
      blocks.push('<p class="brand-scraper-result-muted"><strong>Data layer</strong> · ' + dlMeta + '</p>');
      if (ta.dataLayer.recentEntries && ta.dataLayer.recentEntries.length) {
        blocks.push('<pre class="brand-scraper-tag-pre">' + esc(JSON.stringify(ta.dataLayer.recentEntries)) + '</pre>');
      }
    }
    if (ta.adobeSatellite && ta.adobeSatellite.present) {
      blocks.push('<p class="brand-scraper-result-muted"><strong>Adobe _satellite</strong> · ' + esc(ta.adobeSatellite.buildInfo || '—') + '</p>');
    }
    if (ta.alloy && ta.alloy.detected) {
      blocks.push('<p class="brand-scraper-result-muted"><strong>Adobe Alloy</strong> · ' + esc(ta.alloy.version || '') + '</p>');
    }
    if (ta.navigationTiming) {
      blocks.push('<p class="brand-scraper-result-muted"><strong>Navigation timing</strong> (ms)</p><pre class="brand-scraper-tag-pre">' +
        esc(JSON.stringify(ta.navigationTiming)) + '</pre>');
    }
    if (ta.networkBeaconSummary && typeof ta.networkBeaconSummary === 'object') {
      var bs = ta.networkBeaconSummary;
      var topIds = Object.keys(bs.countsByVendorId || {}).sort(function (a, b) {
        return (bs.countsByVendorId[b] || 0) - (bs.countsByVendorId[a] || 0);
      }).slice(0, 14);
      var fb = bs.firstAnalyticsCollectorHit;
      var countsLine = topIds.map(function (id) { return '<code>' + esc(id) + '</code> × ' + esc(String(bs.countsByVendorId[id])); }).join(', ');
      var netMeta = 'Failed tag-related HTTP: ' + esc(String(bs.failedBeaconRequests || 0));
      if (fb && fb.vendorId) {
        netMeta += ' · first strict collector <code>' + esc(fb.vendorId) + '</code> at seq ' + esc(String(fb.sequenceIndex != null ? fb.sequenceIndex : '—'));
      }
      blocks.push('<p class="brand-scraper-result-muted"><strong>Network (aggregates)</strong> · ' + netMeta + '</p>');
      if (countsLine) blocks.push('<p class="brand-scraper-result-muted">' + countsLine + '</p>');
    }
    if (ta.consentOrderHint && ta.consentOrderHint.state) {
      var st = ta.consentOrderHint.state;
      var cls = st === 'analytics_before_cmp' ? 'brand-scraper-result-warn' : 'brand-scraper-result-muted';
      blocks.push('<p class="' + cls + '"><strong>Consent order (heuristic)</strong> · <code>' + esc(st) + '</code> — ' + esc(ta.consentOrderHint.note || '') + '</p>');
    }
    if (ta.duplicateCollectors && ta.duplicateCollectors.length) {
      blocks.push('<p class="brand-scraper-result-warn"><strong>Possible duplicate collectors</strong></p><ul class="brand-scraper-tag-list">' +
        ta.duplicateCollectors.map(function (d) {
          return '<li><code>' + esc(d.key) + '</code> × ' + esc(String(d.count)) + '</li>';
        }).join('') + '</ul>');
    }
    if (ta.slowThirdPartyScripts && ta.slowThirdPartyScripts.length) {
      blocks.push('<p class="brand-scraper-result-muted"><strong>Slow third-party scripts</strong></p><ul class="brand-scraper-tag-list">' +
        ta.slowThirdPartyScripts.map(function (s) {
          return '<li>' + esc(String(s.durationMs)) + ' ms · <code>' + esc(s.url) + '</code></li>';
        }).join('') + '</ul>');
    }
    if (ta.networkSample && ta.networkSample.length) {
      var nr = ta.networkSample.map(function (r) {
        return '<tr><td class="brand-scraper-num">' + esc(String(r.sequenceIndex != null ? r.sequenceIndex : '')) + '</td>' +
          '<td class="brand-scraper-num">' + esc(String(r.status)) + '</td>' +
          '<td><code>' + esc(r.resourceType || '') + '</code></td>' +
          '<td><code>' + esc(r.vendorId || '—') + '</code></td>' +
          '<td class="brand-scraper-tag-url"><code>' + esc(r.url) + '</code></td></tr>';
      }).join('');
      blocks.push('<p class="brand-scraper-result-muted"><strong>Network sample</strong> (capture order)</p>' +
        '<table class="brand-scraper-table brand-scraper-table--compact"><thead><tr><th>#</th><th>HTTP</th><th>Type</th><th>Vendor</th><th>URL</th></tr></thead><tbody>' +
        nr + '</tbody></table>');
    }
    if (ta.consoleErrors && ta.consoleErrors.length) {
      blocks.push('<p class="brand-scraper-result-warn"><strong>Console errors</strong></p><ul class="brand-scraper-tag-list">' +
        ta.consoleErrors.map(function (e) {
          return '<li><code>' + esc(e.text || '') + '</code></li>';
        }).join('') + '</ul>');
    }
    return '<div class="brand-scraper-tag-page-details">' + blocks.join('') + '</div>';
  }

  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return esc(iso);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function renderList(items, fmt) {
    if (!Array.isArray(items) || !items.length) return '<p class="brand-scraper-result-muted">Not provided.</p>';
    return '<ul class="brand-scraper-result-list">' + items.map(fmt).join('') + '</ul>';
  }

  function renderAnalysis(a) {
    if (!a) return '';
    if (a.skipped) {
      return '<p class="brand-scraper-result-muted">LLM analysis skipped: ' + esc(a.reason || 'no key') + '.</p>';
    }
    if (a.error) {
      return '<p class="brand-scraper-result-muted">LLM returned invalid JSON: ' + esc(a.error) + '</p>'
        + (a.raw ? '<pre class="brand-scraper-pre">' + esc(a.raw) + '</pre>' : '');
    }
    const blocks = [];
    if (a.about) blocks.push('<section class="brand-scraper-result-block"><h4>About</h4><p>' + esc(a.about) + '</p></section>');
    if (Array.isArray(a.tone_of_voice)) blocks.push('<section class="brand-scraper-result-block"><h4>Tone of voice</h4>' + renderList(a.tone_of_voice, it => '<li><strong>' + esc(it.rule) + '</strong>' + (it.example ? ' — <em>' + esc(it.example) + '</em>' : '') + '</li>') + '</section>');
    if (Array.isArray(a.brand_values)) blocks.push('<section class="brand-scraper-result-block"><h4>Brand values</h4>' + renderList(a.brand_values, it => '<li><strong>' + esc(it.value) + '</strong> — ' + esc(it.description) + '</li>') + '</section>');
    if (Array.isArray(a.editorial_guidelines)) blocks.push('<section class="brand-scraper-result-block"><h4>Editorial guidelines</h4>' + renderList(a.editorial_guidelines, it => '<li><strong>' + esc(it.rule) + '</strong>' + (it.example ? ' — <em>' + esc(it.example) + '</em>' : '') + '</li>') + '</section>');
    if (Array.isArray(a.image_guidelines)) blocks.push('<section class="brand-scraper-result-block"><h4>Image guidelines</h4>' + renderList(a.image_guidelines, it => '<li>' + esc(it.rule) + (it.example ? ' — <em>' + esc(it.example) + '</em>' : '') + '</li>') + '</section>');
    if (Array.isArray(a.channel_guidelines) && a.channel_guidelines.length) {
      blocks.push('<section class="brand-scraper-result-block"><h4>Channel samples</h4>' +
        '<div class="brand-scraper-channel-grid">' + a.channel_guidelines.map(ch => (
          '<article class="brand-scraper-channel">' +
            '<header>' + esc(ch.channel || 'Channel') + '</header>' +
            (ch.subject_line ? '<div><span>Subject:</span> ' + esc(ch.subject_line) + '</div>' : '') +
            (ch.preheader ? '<div><span>Preheader:</span> ' + esc(ch.preheader) + '</div>' : '') +
            (ch.headline ? '<div><span>Headline:</span> ' + esc(ch.headline) + '</div>' : '') +
            (ch.body ? '<p>' + esc(ch.body) + '</p>' : '') +
            (ch.cta ? '<div class="brand-scraper-channel-cta">' + esc(ch.cta) + '</div>' : '') +
          '</article>'
        )).join('') + '</div></section>');
    }
    return blocks.join('');
  }

  function renderStakeholders(s) {
    if (!s) return '';
    if (s.skipped) return '<p class="brand-scraper-result-muted">Stakeholders skipped: ' + esc(s.reason || 'no key') + '.</p>';
    if (s.error) return '<p class="brand-scraper-result-muted">Stakeholder extraction failed: ' + esc(s.error) + '</p>';
    const list = Array.isArray(s.people) ? s.people : [];
    if (!list.length) return '<section class="brand-scraper-result-block"><h4>Business stakeholders</h4><p class="brand-scraper-result-muted">No named stakeholders found on the crawled pages. Try increasing Pages to scrape to capture an About / Team page.</p></section>';

    const levelOrder = ['Founder', 'C-suite', 'Board', 'VP', 'Director', 'Manager', 'IC', 'Unknown'];
    const groups = {};
    for (const p of list) {
      const key = levelOrder.includes(p.level) ? p.level : 'Unknown';
      (groups[key] = groups[key] || []).push(p);
    }

    const renderPersonCard = (p) => {
      const initials = (p.name || '').split(/\s+/).map(s => s[0] || '').join('').slice(0, 2).toUpperCase() || '?';
      return (
        '<article class="brand-scraper-stakeholder">' +
          '<div class="brand-scraper-stakeholder-avatar">' +
            (p.image_src
              ? '<img src="' + esc(p.image_src) + '" alt="' + esc(p.name || '') + '" loading="lazy" referrerpolicy="no-referrer" />'
              : '<span>' + esc(initials) + '</span>') +
          '</div>' +
          '<div class="brand-scraper-stakeholder-body">' +
            '<h5>' + esc(p.name || 'Unknown') + '</h5>' +
            (p.role ? '<p class="brand-scraper-stakeholder-role">' + esc(p.role) + '</p>' : '') +
            (p.department ? '<p class="brand-scraper-result-muted">' + esc(p.department) + '</p>' : '') +
            (p.bio ? '<p class="brand-scraper-stakeholder-bio">' + esc(p.bio) + '</p>' : '') +
            '<div class="brand-scraper-stakeholder-links">' +
              (p.linkedin ? '<a href="' + esc(p.linkedin) + '" target="_blank" rel="noopener">LinkedIn</a>' : '') +
              (p.source_url ? '<a href="' + esc(p.source_url) + '" target="_blank" rel="noopener">Source</a>' : '') +
            '</div>' +
          '</div>' +
        '</article>'
      );
    };

    const sections = [];
    for (const level of levelOrder) {
      const arr = groups[level];
      if (!arr || !arr.length) continue;
      sections.push(
        '<div class="brand-scraper-org-level">' +
          '<h5 class="brand-scraper-org-level-head">' + esc(level) + ' <span class="brand-scraper-asset-hint">' + arr.length + ' ' + (arr.length === 1 ? 'person' : 'people') + '</span></h5>' +
          '<div class="brand-scraper-org-row">' + arr.map(renderPersonCard).join('') + '</div>' +
        '</div>'
      );
    }

    return '<section class="brand-scraper-result-block">' +
      '<h4>Business stakeholders <span class="brand-scraper-asset-hint">' + list.length + ' identified · ' + esc(s.provider || '') + '</span></h4>' +
      '<div class="brand-scraper-org-chart">' + sections.join('') + '</div>' +
    '</section>';
  }

  function renderSegments(s) {
    if (!s) return '';
    if (s.skipped) return '<p class="brand-scraper-result-muted">Segments skipped: ' + esc(s.reason || 'no key') + '.</p>';
    if (s.error) return '<p class="brand-scraper-result-muted">Segment generation failed: ' + esc(s.error) + '</p>';
    const list = Array.isArray(s.segments) ? s.segments : [];
    if (!list.length) return '';
    const groups = { edge: [], streaming: [], batch: [], other: [] };
    for (const seg of list) {
      const key = (seg.evaluation_type || '').toLowerCase();
      (groups[key] || groups.other).push(seg);
    }
    const renderCard = (seg) => {
      const criteria = Array.isArray(seg.criteria) ? seg.criteria : [];
      const campaigns = Array.isArray(seg.suggested_campaigns) ? seg.suggested_campaigns : [];
      const useCases = Array.isArray(seg.use_cases) ? seg.use_cases : [];
      const personas = Array.isArray(seg.qualified_personas) ? seg.qualified_personas : [];
      const evalType = (seg.evaluation_type || '').toLowerCase();
      return (
        '<details class="brand-scraper-segment brand-scraper-collapsible" data-eval="' + esc(evalType) + '">' +
          '<summary>' +
            '<span class="brand-scraper-segment-eval brand-scraper-segment-eval--' + esc(evalType || 'other') + '">' + esc(evalType || 'segment') + '</span>' +
            '<span class="brand-scraper-segment-summary">' +
              '<strong>' + esc(seg.name || 'Untitled segment') + '</strong>' +
              (seg.description ? '<span class="brand-scraper-result-muted brand-scraper-collapsible-oneline">' + esc(seg.description) + '</span>' : '') +
            '</span>' +
            (seg.estimated_size ? '<span class="brand-scraper-segment-size">' + esc(seg.estimated_size) + '</span>' : '') +
            '<span class="brand-scraper-collapsible-chevron" aria-hidden="true">›</span>' +
          '</summary>' +
          '<div class="brand-scraper-collapsible-body">' +
            (seg.description ? '<p>' + esc(seg.description) + '</p>' : '') +
            (criteria.length ? '<div class="brand-scraper-segment-block"><h6>Criteria</h6><ul>' +
              criteria.map(c => '<li><code>' + esc(c) + '</code></li>').join('') + '</ul></div>' : '') +
            (useCases.length ? '<div class="brand-scraper-segment-block"><h6>Use cases</h6><ul>' +
              useCases.map(u => '<li>' + esc(u) + '</li>').join('') + '</ul></div>' : '') +
            (campaigns.length ? '<div class="brand-scraper-persona-block"><h6>Suggested campaigns</h6><div class="brand-scraper-persona-chips">' +
              campaigns.map(c => '<span class="brand-scraper-chip">' + esc(c) + '</span>').join('') + '</div></div>' : '') +
            (personas.length ? '<div class="brand-scraper-persona-block"><h6>Qualified personas</h6><div class="brand-scraper-persona-chips">' +
              personas.map(p => '<span class="brand-scraper-chip brand-scraper-chip--segment">' + esc(p) + '</span>').join('') + '</div></div>' : '') +
          '</div>' +
        '</details>'
      );
    };

    const sections = [];
    const groupMeta = [
      ['edge', 'Edge evaluation', 'Instant, same-page personalisation. No profile-store lookup.'],
      ['streaming', 'Streaming evaluation', 'Near real-time within minutes. Event-driven triggers.'],
      ['batch', 'Batch evaluation', 'Refreshed every 24h. Historical patterns, LTV.'],
      ['other', 'Other', ''],
    ];
    for (const [key, label, hint] of groupMeta) {
      const segs = groups[key];
      if (!segs || !segs.length) continue;
      sections.push(
        '<div class="brand-scraper-segment-section">' +
          '<h5>' + esc(label) + ' <span class="brand-scraper-asset-hint">' + segs.length + (hint ? ' · ' + esc(hint) : '') + '</span></h5>' +
          '<div class="brand-scraper-segment-grid">' + segs.map(renderCard).join('') + '</div>' +
        '</div>'
      );
    }

    return '<section class="brand-scraper-result-block" data-collapsible-group="segments">' +
      '<div class="brand-scraper-result-block-head">' +
        '<h4>Audience segments <span class="brand-scraper-asset-hint">' + list.length + ' Real-Time CDP-style segments · ' + esc(s.provider || '') + '</span></h4>' +
        '<div class="brand-scraper-result-block-actions">' +
          '<button type="button" class="dashboard-btn-outline" data-collapse-toggle="open">Expand all</button>' +
          '<button type="button" class="dashboard-btn-outline" data-collapse-toggle="close">Collapse all</button>' +
        '</div>' +
      '</div>' +
      sections.join('') +
    '</section>';
  }

  function renderCampaigns(c) {
    if (!c) return '';
    if (c.skipped) return '<p class="brand-scraper-result-muted">Campaigns skipped: ' + esc(c.reason || 'no key') + '.</p>';
    if (c.error) return '<p class="brand-scraper-result-muted">Campaign generation failed: ' + esc(c.error) + '</p>';
    const list = Array.isArray(c.campaigns) ? c.campaigns : [];
    if (!list.length) return '';
    const detected = list.filter(x => !x.is_recommendation);
    const recommended = list.filter(x => x.is_recommendation);

    const renderCard = (cp) => {
      const headlines = Array.isArray(cp.headlines) ? cp.headlines : [];
      const segments = Array.isArray(cp.target_segments) ? cp.target_segments : [];
      const sources = Array.isArray(cp.source_urls) ? cp.source_urls : [];
      return (
        '<details class="brand-scraper-campaign brand-scraper-collapsible">' +
          '<summary>' +
            '<span class="brand-scraper-campaign-summary">' +
              '<span class="brand-scraper-campaign-type">' + esc(cp.type || 'Campaign') + '</span>' +
              '<strong>' + esc(cp.name || 'Untitled') + '</strong>' +
              (cp.summary ? '<span class="brand-scraper-result-muted brand-scraper-collapsible-oneline">' + esc(cp.summary) + '</span>' : '') +
            '</span>' +
            (cp.channel ? '<span class="brand-scraper-chip">' + esc(cp.channel) + '</span>' : '') +
            '<span class="brand-scraper-collapsible-chevron" aria-hidden="true">›</span>' +
          '</summary>' +
          '<div class="brand-scraper-collapsible-body">' +
            (cp.summary ? '<p>' + esc(cp.summary) + '</p>' : '') +
            (headlines.length ? '<div class="brand-scraper-campaign-block"><h6>Headlines</h6><ul>' +
              headlines.map(h => '<li>' + esc(h) + '</li>').join('') + '</ul></div>' : '') +
            (cp.cta ? '<div class="brand-scraper-campaign-cta">' + esc(cp.cta) + '</div>' : '') +
            '<div class="brand-scraper-campaign-meta">' +
              (cp.time_context ? '<span class="brand-scraper-chip">' + esc(cp.time_context) + '</span>' : '') +
              (cp.season ? '<span class="brand-scraper-chip">' + esc(cp.season) + '</span>' : '') +
            '</div>' +
            (segments.length ? '<div class="brand-scraper-persona-block"><h6>Target segments</h6><div class="brand-scraper-persona-chips">' +
              segments.map(s => '<span class="brand-scraper-chip brand-scraper-chip--segment">' + esc(s) + '</span>').join('') +
              '</div></div>' : '') +
            (sources.length ? '<div class="brand-scraper-campaign-block"><h6>Evidence</h6><ul>' +
              sources.map(u => '<li><a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(u) + '</a></li>').join('') + '</ul></div>' : '') +
          '</div>' +
        '</details>'
      );
    };

    const sections = [];
    if (detected.length) {
      sections.push(
        '<div class="brand-scraper-campaign-section">' +
          '<h5>Detected on-site <span class="brand-scraper-asset-hint">' + detected.length + ' campaign' + (detected.length === 1 ? '' : 's') + '</span></h5>' +
          '<div class="brand-scraper-campaign-grid">' + detected.map(renderCard).join('') + '</div>' +
        '</div>'
      );
    }
    if (recommended.length) {
      sections.push(
        '<div class="brand-scraper-campaign-section">' +
          '<h5>Recommended for demo <span class="brand-scraper-asset-hint">' + recommended.length + ' suggestion' + (recommended.length === 1 ? '' : 's') + '</span></h5>' +
          '<div class="brand-scraper-campaign-grid">' + recommended.map(renderCard).join('') + '</div>' +
        '</div>'
      );
    }

    return '<section class="brand-scraper-result-block" data-collapsible-group="campaigns">' +
      '<div class="brand-scraper-result-block-head">' +
        '<h4>Campaigns <span class="brand-scraper-asset-hint">' + list.length + ' total · ' + esc(c.provider || '') + '</span></h4>' +
        '<div class="brand-scraper-result-block-actions">' +
          '<button type="button" class="dashboard-btn-outline" data-collapse-toggle="open">Expand all</button>' +
          '<button type="button" class="dashboard-btn-outline" data-collapse-toggle="close">Collapse all</button>' +
        '</div>' +
      '</div>' +
      sections.join('') +
    '</section>';
  }

  function renderPersonas(p) {
    if (!p) return '';
    if (p.skipped) return '<p class="brand-scraper-result-muted">Personas skipped: ' + esc(p.reason || 'no key') + '.</p>';
    if (p.error) return '<p class="brand-scraper-result-muted">Persona generation failed: ' + esc(p.error) + '</p>';
    const list = Array.isArray(p.personas) ? p.personas : [];
    if (!list.length) return '';
    const cards = list.map((persona, idx) => {
      const initials = (persona.name || '').split(/\s+/).map(s => s[0] || '').join('').slice(0, 2).toUpperCase() || '—';
      const channels = Array.isArray(persona.preferred_channels) ? persona.preferred_channels : [];
      const goals = Array.isArray(persona.goals) ? persona.goals : [];
      const pains = Array.isArray(persona.pain_points) ? persona.pain_points : [];
      const behaviours = Array.isArray(persona.behaviors) ? persona.behaviors : [];
      const segments = Array.isArray(persona.suggested_segments) ? persona.suggested_segments : [];
      const metaLine = [persona.occupation, persona.age, persona.location].filter(Boolean).join(' · ');
      return (
        '<details class="brand-scraper-persona brand-scraper-collapsible">' +
          '<summary>' +
            '<span class="brand-scraper-persona-avatar">' + esc(initials) + '</span>' +
            '<span class="brand-scraper-persona-summary">' +
              '<strong>' + esc(persona.name || 'Persona ' + (idx + 1)) + '</strong>' +
              (metaLine ? '<span class="brand-scraper-result-muted">' + esc(metaLine) + '</span>' : '') +
            '</span>' +
            '<span class="brand-scraper-collapsible-chevron" aria-hidden="true">›</span>' +
          '</summary>' +
          '<div class="brand-scraper-collapsible-body">' +
            (persona.income_range ? '<p class="brand-scraper-result-muted">' + esc(persona.income_range) + '</p>' : '') +
            (persona.bio ? '<p class="brand-scraper-persona-bio">' + esc(persona.bio) + '</p>' : '') +
            (persona.brand_affinity ? '<p class="brand-scraper-persona-affinity"><strong>Brand affinity:</strong> ' + esc(persona.brand_affinity) + '</p>' : '') +
            (goals.length ? '<div class="brand-scraper-persona-block"><h6>Goals</h6><ul>' + goals.map(g => '<li>' + esc(g) + '</li>').join('') + '</ul></div>' : '') +
            (pains.length ? '<div class="brand-scraper-persona-block"><h6>Pain points</h6><ul>' + pains.map(g => '<li>' + esc(g) + '</li>').join('') + '</ul></div>' : '') +
            (behaviours.length ? '<div class="brand-scraper-persona-block"><h6>Behaviours</h6><ul>' + behaviours.map(g => '<li>' + esc(g) + '</li>').join('') + '</ul></div>' : '') +
            (channels.length ? '<div class="brand-scraper-persona-chips">' + channels.map(c => '<span class="brand-scraper-chip">' + esc(c) + '</span>').join('') + '</div>' : '') +
            (segments.length ? '<div class="brand-scraper-persona-block"><h6>Likely segments</h6><div class="brand-scraper-persona-chips">' + segments.map(s => '<span class="brand-scraper-chip brand-scraper-chip--segment">' + esc(s) + '</span>').join('') + '</div></div>' : '') +
          '</div>' +
        '</details>'
      );
    }).join('');

    return '<section class="brand-scraper-result-block" data-collapsible-group="personas">' +
      '<div class="brand-scraper-result-block-head">' +
        '<h4>Customer personas <span class="brand-scraper-asset-hint">' + list.length + ' generated · ' + esc(p.provider || '') + '</span></h4>' +
        '<div class="brand-scraper-result-block-actions">' +
          '<button type="button" class="dashboard-btn-outline" data-collapse-toggle="open">Expand all</button>' +
          '<button type="button" class="dashboard-btn-outline" data-collapse-toggle="close">Collapse all</button>' +
        '</div>' +
      '</div>' +
      '<div class="brand-scraper-persona-grid">' + cards + '</div>' +
    '</section>';
  }

  function renderAssets(a) {
    if (!a) return '';
    const blocks = [];

    if (Array.isArray(a.favicons) && a.favicons.length) {
      blocks.push(
        '<div class="brand-scraper-asset-row">' +
          '<h5>Favicons</h5>' +
          '<div class="brand-scraper-favicons">' +
          a.favicons.map(f =>
            '<a href="' + esc(f.href) + '" target="_blank" rel="noopener" title="' + esc(f.rel) + (f.sizes ? ' ' + esc(f.sizes) : '') + '">' +
              '<img src="' + esc(f.href) + '" alt="" loading="lazy" referrerpolicy="no-referrer" />' +
            '</a>'
          ).join('') +
          '</div>' +
        '</div>'
      );
    }

    if (Array.isArray(a.ogImages) && a.ogImages.length) {
      blocks.push(
        '<div class="brand-scraper-asset-row">' +
          '<h5>Open Graph / social preview</h5>' +
          '<div class="brand-scraper-og-grid">' +
          a.ogImages.slice(0, 8).map(url =>
            '<a href="' + esc(url) + '" target="_blank" rel="noopener">' +
              '<img src="' + esc(url) + '" alt="" loading="lazy" referrerpolicy="no-referrer" />' +
            '</a>'
          ).join('') +
          '</div>' +
        '</div>'
      );
    }

    if (Array.isArray(a.colours) && a.colours.length) {
      blocks.push(
        '<div class="brand-scraper-asset-row">' +
          '<h5>Colour palette <span class="brand-scraper-asset-hint">ranked by frequency</span></h5>' +
          '<div class="brand-scraper-swatches">' +
          a.colours.map(c =>
            '<div class="brand-scraper-swatch" title="' + esc(c.value) + ' · ' + c.count + 'x">' +
              '<span class="brand-scraper-swatch-chip" style="background:' + esc(c.value) + '"></span>' +
              '<code>' + esc(c.value) + '</code>' +
            '</div>'
          ).join('') +
          '</div>' +
        '</div>'
      );
    }

    if (Array.isArray(a.fonts) && a.fonts.length) {
      blocks.push(
        '<div class="brand-scraper-asset-row">' +
          '<h5>Fonts <span class="brand-scraper-asset-hint">from <code>font-family</code> declarations</span></h5>' +
          '<div class="brand-scraper-fonts">' +
          a.fonts.map(f =>
            '<span class="brand-scraper-font-chip" style="font-family:' + esc(f.value) + ',sans-serif" title="' + f.count + 'x">' +
              esc(f.value) +
            '</span>'
          ).join('') +
          '</div>' +
        '</div>'
      );
    }

    if (Array.isArray(a.imagesV2) && a.imagesV2.length) {
      const ok = a.imagesV2.filter(v => !v.error && v.signedUrl);
      const errored = a.imagesV2.filter(v => v.error);
      blocks.push(
        '<div class="brand-scraper-asset-row">' +
          '<h5>Classified images <span class="brand-scraper-asset-hint">' + ok.length + ' stored in GCS · links expire ' + fmtDate(a.imagesV2SignedUrlExpiresAt || ok[0] && ok[0].signedUrlExpiresAt) + (errored.length ? ' · ' + errored.length + ' failed' : '') + '</span></h5>' +
          '<div class="brand-scraper-imagev2-grid">' +
          ok.map(img => (
            '<figure class="brand-scraper-imagev2">' +
              '<a href="' + esc(img.signedUrl) + '" target="_blank" rel="noopener">' +
                '<img src="' + esc(img.signedUrl) + '" alt="' + esc(img.alt || (img.classification && img.classification.subject) || "") + '" loading="lazy" />' +
              '</a>' +
              '<figcaption>' +
                (img.classification && img.classification.category ? '<span class="brand-scraper-chip brand-scraper-chip--cat brand-scraper-chip--cat-' + esc(img.classification.category) + '">' + esc(img.classification.category) + '</span>' : '') +
                (img.classification && img.classification.subject ? '<span class="brand-scraper-imagev2-caption">' + esc(img.classification.subject) + '</span>' : '') +
              '</figcaption>' +
            '</figure>'
          )).join('') +
          '</div>' +
        '</div>'
      );
    }

    if (Array.isArray(a.images) && a.images.length && !(Array.isArray(a.imagesV2) && a.imagesV2.length)) {
      blocks.push(
        '<div class="brand-scraper-asset-row">' +
          '<h5>Image URLs <span class="brand-scraper-asset-hint">first ' + a.images.length + ' discovered — click <strong>Classify images</strong> to download and categorise</span></h5>' +
          '<div class="brand-scraper-image-grid">' +
          a.images.slice(0, 48).map(img =>
            '<a href="' + esc(img.src) + '" target="_blank" rel="noopener" title="' + esc(img.alt || img.src) + '">' +
              '<img src="' + esc(img.src) + '" alt="' + esc(img.alt || '') + '" loading="lazy" referrerpolicy="no-referrer" />' +
            '</a>'
          ).join('') +
          '</div>' +
        '</div>'
      );
    }

    if (!blocks.length) return '';
    return '<section class="brand-scraper-result-block">' +
      '<h4>Assets</h4>' +
      blocks.join('') +
    '</section>';
  }

  function renderTagAuditSummary(s) {
    if (!s) return '';
    const opps = Array.isArray(s.opportunities) ? s.opportunities : [];
    const tags = Array.isArray(s.vendorTags) ? s.vendorTags : [];
    const hasRollups = (s.pagesWithDuplicateCollectors | 0) > 0 || (s.pagesWithFailedBeacons | 0) > 0 || (s.pagesWithAnalyticsBeforeCmp | 0) > 0;
    const hasCov = s.vendorCoverage && typeof s.vendorCoverage === 'object' && Object.keys(s.vendorCoverage).length;
    if (!tags.length && !opps.length && !s.pagesWithConsoleErrors && !hasRollups && !hasCov) return '';
    const chips = tags.map(function (t) {
      return '<span class="brand-scraper-chip brand-scraper-chip--tag">' + esc(t) + '</span>';
    }).join(' ');
    const mix = s.engineMix || {};
    const mixLine = (mix.playwright || mix.fetch)
      ? ('<p class="brand-scraper-result-muted">Audit depth: ' +
        (mix.playwright ? mix.playwright + ' page(s) JS-rendered' : '') +
        (mix.playwright && mix.fetch ? '; ' : '') +
        (mix.fetch ? mix.fetch + ' page(s) HTML-only' : '') +
        '.</p>')
      : '';
    const rollupParts = [];
    if ((s.pagesWithDuplicateCollectors | 0) > 0) {
      rollupParts.push('Possible duplicate collectors on ' + s.pagesWithDuplicateCollectors + ' page(s)');
    }
    if ((s.pagesWithFailedBeacons | 0) > 0) {
      rollupParts.push('Tag-related HTTP failures on ' + s.pagesWithFailedBeacons + ' page(s)');
    }
    if ((s.pagesWithAnalyticsBeforeCmp | 0) > 0) {
      rollupParts.push('"Analytics before CMP" request order on ' + s.pagesWithAnalyticsBeforeCmp + ' page(s) (heuristic)');
    }
    const rollupHtml = rollupParts.length
      ? '<p class="brand-scraper-result-muted"><strong>Roll-ups</strong></p><ul class="brand-scraper-tag-list">' +
        rollupParts.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>'
      : '';
    const covRows = tags.map(function (t) {
      const c = (s.vendorCoverage && s.vendorCoverage[t]) || { pages: 0, pct: 0 };
      return '<tr><td><code>' + esc(t) + '</code></td><td class="brand-scraper-num">' + esc(String(c.pages)) + ' / ' + esc(String(s.pagesAudited || 0)) + '</td><td class="brand-scraper-num">' + esc(String(c.pct)) + '%</td></tr>';
    }).join('');
    const covHtml = hasCov
      ? '<details class="brand-scraper-tag-opps"><summary>Vendor coverage by audited page</summary>' +
        '<table class="brand-scraper-table brand-scraper-table--compact"><thead><tr><th>Vendor</th><th>Pages</th><th>%</th></tr></thead><tbody>' +
        covRows + '</tbody></table></details>'
      : '';
    return '<section class="brand-scraper-result-block brand-scraper-tag-audit">' +
      '<h4>Tag &amp; analytics snapshot</h4>' +
      '<p class="brand-scraper-result-muted">Directional signals from the crawl sample — not a certified compliance audit. Prefer <strong>JS-rendered crawl</strong> for network timings, duplicate collectors, and console errors.</p>' +
      '<p class="brand-scraper-result-muted">We report <strong>inventory</strong>, a <strong>sample of network requests</strong>, <strong>console errors</strong>, <strong>duplicate-collector heuristics</strong>, and <strong>rough CMP vs collector order</strong>. Enterprise tools add scripted journeys, payload rules, and attestations — we do not.</p>' +
      mixLine +
      (tags.length ? '<p class="brand-scraper-result-muted"><strong>Detected (crawl-wide)</strong></p><p class="brand-scraper-tag-chips">' + chips + '</p>' : '') +
      (s.pagesWithConsoleErrors ? '<p class="brand-scraper-result-warn">Browser console errors on ' + s.pagesWithConsoleErrors + ' page(s) while loading.</p>' : '') +
      rollupHtml +
      covHtml +
      (opps.length ? (
        '<details class="brand-scraper-tag-opps">' +
          '<summary>Conversation starters (' + opps.length + ')</summary>' +
          '<ul>' + opps.map(function (o) { return '<li>' + esc(o) + '</li>'; }).join('') + '</ul>' +
        '</details>'
      ) : '') +
    '</section>';
  }

  function renderCrawl(c) {
    if (!c || !Array.isArray(c.pages)) return '';
    const failureSummary = c.failureSummary || null;
    const failureParts = failureSummary && failureSummary.byReason
      ? Object.entries(failureSummary.byReason).map(([k, v]) => k + ' × ' + v).join(', ')
      : '';
    const rows = c.pages.map(function (p) {
      const ta = p.tagAudit;
      const mode = ta && ta.mode ? ta.mode : '—';
      const errs = ta && ta.consoleErrors ? ta.consoleErrors.length : 0;
      const errCell = errs ? ('<span class="brand-scraper-result-warn">' + errs + '</span>') : '0';
      const dupN = ta && ta.duplicateCollectors ? ta.duplicateCollectors.length : 0;
      const failN = ta && ta.networkBeaconSummary ? (ta.networkBeaconSummary.failedBeaconRequests || 0) : 0;
      const hint = ta && ta.consentOrderHint ? ta.consentOrderHint.state : '';
      const tagCellExtra = (dupN ? ' · dup ' + dupN : '') + (failN ? ' · HTTP ' + failN : '') + (hint === 'analytics_before_cmp' ? ' · consent?' : '');
      return (
        '<tr>' +
          '<td><a href="' + esc(p.url) + '" target="_blank" rel="noopener">' + esc(p.url) + '</a></td>' +
          '<td>' + esc(p.title || '—') + '</td>' +
          '<td class="brand-scraper-num">' + esc(p.status) + '</td>' +
          '<td class="brand-scraper-num">' + esc((p.textLength || 0).toLocaleString()) + '</td>' +
          '<td><code>' + esc(mode) + '</code>' + (tagCellExtra ? '<span class="brand-scraper-result-muted">' + esc(tagCellExtra) + '</span>' : '') + '</td>' +
          '<td class="brand-scraper-num">' + errCell + '</td>' +
        '</tr>' +
        '<tr class="brand-scraper-crawl-detail"><td colspan="6">' +
          '<details class="brand-scraper-tag-page-wrap">' +
            '<summary>Tag / network detail for this URL</summary>' +
            renderTagAuditPageDetails(ta) +
          '</details>' +
        '</td></tr>'
      );
    }).join('');
    return '<section class="brand-scraper-result-block">' +
      '<h4>Crawl summary</h4>' +
      '<p class="brand-scraper-result-muted">' + (c.pagesScraped || 0) + ' pages scraped, ' + (c.totalDiscovered || 0) + ' URLs discovered.</p>' +
      (failureParts ? '<p class="brand-scraper-result-muted"><strong>Failures observed:</strong> ' + esc(failureParts) + '.</p>' : '') +
      '<table class="brand-scraper-table"><thead><tr><th>URL</th><th>Title</th><th>Status</th><th>Chars</th><th>Tag audit</th><th>JS errors</th></tr></thead><tbody>' + rows + '</tbody></table>' +
    '</section>';
  }

  let currentScrapeData = null;

  function renderResults(data) {
    currentScrapeData = data;
    resultsEl.hidden = false;
    const crawl = data.crawl || data.crawlSummary;
    const lastExport = data.lastExport || null;
    resultsEl.innerHTML = (
      '<header class="brand-scraper-result-header">' +
        '<div class="brand-scraper-result-header-main">' +
          '<h3>' + esc(data.brandName || 'Results') + '</h3>' +
          '<p class="brand-scraper-result-muted">' + esc(data.baseUrl || data.url || '') + ' · ' +
            esc((data.businessType || '').toUpperCase()) + (data.country ? ' · ' + esc(data.country) : '') +
            (data.elapsedMs ? ' · ' + (data.elapsedMs / 1000).toFixed(1) + 's' : '') +
            (crawl && crawl.engine ? ' · crawler: <code>' + esc(crawl.engine) + '</code>' : '') +
            (data.sandbox ? ' · sandbox: <code>' + esc(data.sandbox) + '</code>' : '') +
          '</p>' +
        '</div>' +
        '<div class="brand-scraper-result-actions">' +
          (data.scrapeId ? '<button type="button" class="dashboard-btn-outline" data-action="classify-assets">Classify images</button>' : '') +
          (data.scrapeId ? '<button type="button" class="dashboard-btn-primary" data-action="export-kit">Export kit (ZIP)</button>' : '') +
        '</div>' +
      '</header>' +
      (lastExport && lastExport.signedUrl ? (
        '<div class="brand-scraper-export-link">' +
          '<span>Latest export ready:</span> ' +
          '<a href="' + esc(lastExport.signedUrl) + '" target="_blank" rel="noopener" download>Download ZIP</a>' +
          ' <span class="brand-scraper-result-muted">(link expires ' + fmtDate(lastExport.signedUrlExpiresAt) + ')</span>' +
        '</div>'
      ) : '') +
      (data.analysisError ? '<p class="brand-scraper-result-muted">Analysis error: ' + esc(data.analysisError) + '</p>' : '') +
      renderAnalysis(data.analysis) +
      renderStakeholders(data.stakeholders) +
      renderSegments(data.segments) +
      renderCampaigns(data.campaigns) +
      renderPersonas(data.personas) +
      renderAssets(crawl && crawl.assets) +
      renderTagAuditSummary(crawl && crawl.tagAuditSummary) +
      renderCrawl(crawl)
    );
    resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  let viewMode = 'list';      // 'list' | 'industry'
  let selectMode = false;
  const selected = new Set();

  function cardHtml(it) {
    const isChecked = selected.has(it.scrapeId);
    return (
      '<article class="brand-scraper-history-card' + (selectMode ? ' is-selectable' : '') + (isChecked ? ' is-selected' : '') + '" data-scrape-id="' + esc(it.scrapeId) + '">' +
        (selectMode ? (
          '<label class="brand-scraper-history-check">' +
            '<input type="checkbox" data-action="toggle-select"' + (isChecked ? ' checked' : '') + ' aria-label="Select ' + esc(it.brandName || it.scrapeId) + '" />' +
          '</label>'
        ) : '') +
        '<div class="brand-scraper-history-card-main">' +
          '<h4>' + esc(it.brandName || it.baseUrl || it.url) + '</h4>' +
          (it.industry ? '<p class="brand-scraper-history-industry">' + esc(it.industry) + '</p>' : '') +
          '<p class="brand-scraper-result-muted">' + esc(it.baseUrl || it.url || '') + '</p>' +
          '<p class="brand-scraper-result-muted">' +
            fmtDate(it.updatedAt || it.createdAt) +
            (typeof it.pagesScraped === 'number' ? ' · ' + it.pagesScraped + ' pages' : '') +
            (it.analysisPresent ? ' · analysed' : (it.analysisError ? ' · error' : ' · no analysis')) +
            (it.personasPresent ? ' · personas' : '') +
            (it.campaignsPresent ? ' · campaigns' : '') +
            (it.segmentsPresent ? ' · segments' : '') +
            (it.stakeholdersPresent ? ' · stakeholders' : '') +
          '</p>' +
        '</div>' +
        '<div class="brand-scraper-history-card-actions">' +
          '<button type="button" class="dashboard-btn-outline" data-action="view">View</button>' +
          '<button type="button" class="dashboard-btn-outline" data-action="delete">Delete</button>' +
        '</div>' +
      '</article>'
    );
  }

  function renderHistory(items) {
    const sb = getSandbox();
    if (historySandboxEl) historySandboxEl.textContent = sb ? 'Sandbox: ' + sb : 'No sandbox selected';

    // Drop stale selections if their rows are gone.
    const presentIds = new Set((items || []).map(i => i.scrapeId));
    Array.from(selected).forEach(id => { if (!presentIds.has(id)) selected.delete(id); });
    updateSelectBar();

    if (!Array.isArray(items) || !items.length) {
      historyListEl.hidden = true;
      historyListEl.innerHTML = '';
      historyEmptyEl.hidden = false;
      historyEmptyEl.textContent = sb
        ? 'No scrapes yet for this sandbox. Run one above to populate the list.'
        : 'Select a sandbox to see its scrapes.';
      return;
    }
    historyEmptyEl.hidden = true;
    historyListEl.hidden = false;

    if (viewMode === 'industry') {
      const groups = new Map();
      for (const it of items) {
        const key = (it.industry || 'Uncategorised');
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(it);
      }
      const keys = Array.from(groups.keys()).sort((a, b) => {
        if (a === 'Uncategorised') return 1;
        if (b === 'Uncategorised') return -1;
        return a.localeCompare(b);
      });
      historyListEl.innerHTML = keys.map(key => {
        const rows = groups.get(key);
        return (
          '<div class="brand-scraper-history-group">' +
            '<h4 class="brand-scraper-history-group-head">' +
              esc(key) +
              ' <span class="brand-scraper-asset-hint">' + rows.length + ' scrape' + (rows.length === 1 ? '' : 's') + '</span>' +
            '</h4>' +
            '<div class="brand-scraper-history-group-grid">' + rows.map(cardHtml).join('') + '</div>' +
          '</div>'
        );
      }).join('');
    } else {
      historyListEl.innerHTML = items.map(cardHtml).join('');
    }
  }

  function updateSelectBar() {
    if (!selectBarEl) return;
    selectBarEl.hidden = !selectMode;
    if (selectCountEl) selectCountEl.textContent = selected.size + ' selected';
    if (deleteSelectedBtn) deleteSelectedBtn.disabled = selected.size === 0;
    if (selectToggleBtn) {
      selectToggleBtn.textContent = selectMode ? 'Cancel' : 'Select';
      selectToggleBtn.classList.toggle('is-active', selectMode);
    }
  }

  let historyItemsCache = [];

  async function loadHistory() {
    const sb = getSandbox();
    if (historySandboxEl) historySandboxEl.textContent = sb ? 'Sandbox: ' + sb : 'No sandbox selected';
    if (!sb) { historyItemsCache = []; renderHistory([]); return; }
    historyEmptyEl.hidden = false;
    historyEmptyEl.textContent = 'Loading…';
    historyListEl.hidden = true;
    try {
      const resp = await fetch(withSandboxQuery('/api/brand-scraper/scrapes'));
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        historyEmptyEl.textContent = 'Failed to load scrapes: ' + (data.error || resp.statusText);
        historyItemsCache = [];
        return;
      }
      historyItemsCache = Array.isArray(data.items) ? data.items : [];
      renderHistory(historyItemsCache);
    } catch (e) {
      historyEmptyEl.textContent = 'Network error: ' + (e && e.message || e);
      historyItemsCache = [];
    }
  }

  function urlKey(u) {
    if (!u) return '';
    try { return new URL(u).toString().replace(/\/$/, '').toLowerCase(); }
    catch (_e) { return String(u).trim().toLowerCase().replace(/\/$/, ''); }
  }

  function findExistingScrape(targetUrl) {
    const key = urlKey(targetUrl);
    if (!key) return null;
    return historyItemsCache.find(it => urlKey(it.baseUrl) === key || urlKey(it.url) === key) || null;
  }

  async function viewScrape(scrapeId) {
    try {
      const resp = await fetch(withSandboxQuery('/api/brand-scraper/scrapes/' + encodeURIComponent(scrapeId)));
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) { setStatus('Could not load scrape: ' + (data.error || resp.statusText), 'error'); return; }
      renderResults({
        ...data,
        crawl: data.crawlSummary,
      });
      setStatus('Loaded scrape from ' + fmtDate(data.updatedAt || data.createdAt) + '.', 'info');
    } catch (e) {
      setStatus('Network error: ' + (e && e.message || e), 'error');
    }
  }

  async function deleteScrape(scrapeId) {
    if (!confirm('Delete this scrape? This cannot be undone.')) return;
    try {
      const resp = await fetch(withSandboxQuery('/api/brand-scraper/scrapes/' + encodeURIComponent(scrapeId)), { method: 'DELETE' });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) { setStatus('Delete failed: ' + (data.error || resp.statusText), 'error'); return; }
      await loadHistory();
    } catch (e) {
      setStatus('Network error: ' + (e && e.message || e), 'error');
    }
  }

  if (historyListEl) {
    historyListEl.addEventListener('click', (evt) => {
      // Clicks on the checkbox wrapper should not also trigger view/delete.
      const check = evt.target.closest('input[data-action="toggle-select"]');
      if (check) {
        const card = check.closest('[data-scrape-id]');
        const id = card && card.getAttribute('data-scrape-id');
        if (!id) return;
        if (check.checked) selected.add(id); else selected.delete(id);
        card.classList.toggle('is-selected', check.checked);
        updateSelectBar();
        return;
      }
      const btn = evt.target.closest('button[data-action]');
      if (!btn) return;
      const card = btn.closest('[data-scrape-id]');
      const id = card && card.getAttribute('data-scrape-id');
      if (!id) return;
      if (btn.dataset.action === 'view') viewScrape(id);
      else if (btn.dataset.action === 'delete') deleteScrape(id);
    });
  }

  if (selectToggleBtn) {
    selectToggleBtn.addEventListener('click', () => {
      selectMode = !selectMode;
      if (!selectMode) selected.clear();
      renderHistory(historyItemsCache);
    });
  }
  if (selectAllBtn) {
    selectAllBtn.addEventListener('click', () => {
      historyItemsCache.forEach(it => selected.add(it.scrapeId));
      renderHistory(historyItemsCache);
    });
  }
  if (selectNoneBtn) {
    selectNoneBtn.addEventListener('click', () => {
      selected.clear();
      renderHistory(historyItemsCache);
    });
  }
  if (deleteSelectedBtn) {
    deleteSelectedBtn.addEventListener('click', async () => {
      if (!selected.size) return;
      if (!confirm('Delete ' + selected.size + ' scrape' + (selected.size === 1 ? '' : 's') + '? This cannot be undone.')) return;
      deleteSelectedBtn.disabled = true;
      deleteSelectedBtn.textContent = 'Deleting…';
      const ids = Array.from(selected);
      let ok = 0;
      let fail = 0;
      for (const id of ids) {
        try {
          const resp = await fetch(withSandboxQuery('/api/brand-scraper/scrapes/' + encodeURIComponent(id)), { method: 'DELETE' });
          if (resp.ok) ok++; else fail++;
        } catch (_e) { fail++; }
      }
      selected.clear();
      selectMode = false;
      setStatus('Deleted ' + ok + ' scrape' + (ok === 1 ? '' : 's') + (fail ? ' (' + fail + ' failed)' : '') + '.', fail ? 'error' : 'info');
      deleteSelectedBtn.textContent = 'Delete selected';
      deleteSelectedBtn.disabled = false;
      await loadHistory();
    });
  }

  function setViewMode(mode) {
    viewMode = mode === 'industry' ? 'industry' : 'list';
    if (viewListBtn) viewListBtn.classList.toggle('is-active', viewMode === 'list');
    if (viewIndustryBtn) viewIndustryBtn.classList.toggle('is-active', viewMode === 'industry');
    renderHistory(historyItemsCache);
  }
  if (viewListBtn) viewListBtn.addEventListener('click', () => setViewMode('list'));
  if (viewIndustryBtn) viewIndustryBtn.addEventListener('click', () => setViewMode('industry'));

  async function runClassify() {
    if (!currentScrapeData || !currentScrapeData.scrapeId) return;
    const sb = getSandbox();
    if (!sb) { setStatus('Select a sandbox first.', 'error'); return; }
    const btn = resultsEl.querySelector('[data-action="classify-assets"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Classifying…'; }
    setStatus('Downloading images to GCS and classifying with Gemini vision \u2026', 'info');
    startProgress(30000, ['Downloading images', 'Classifying with Gemini vision', 'Generating signed URLs', 'Updating scrape']);
    try {
      const url = CLASSIFY_URL + '?sandbox=' + encodeURIComponent(sb);
      const resp = await fetchWithRetry(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sandbox: sb, scrapeId: currentScrapeData.scrapeId }),
      }, {
        retries: 2,
        onRetry: (n, status) => setStatus('Warming classifier (retry ' + n + ' of 2, ' + status + ') \u2026', 'info'),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) { setStatus('Classify failed: ' + (data.error || resp.statusText), 'error'); stopProgress(); return; }
      stopProgress({ success: true });
      setStatus('Classified ' + data.classified + '/' + data.total + ' images in ' + ((data.elapsedMs || 0) / 1000).toFixed(1) + 's. Signed URLs expire ' + fmtDate(data.signedUrlExpiresAt) + '.', 'info');
      // Merge into currentScrapeData and re-render
      const crawl = currentScrapeData.crawl || currentScrapeData.crawlSummary || {};
      const assets = crawl.assets || {};
      assets.imagesV2 = data.images || [];
      assets.imagesV2SignedUrlExpiresAt = data.signedUrlExpiresAt;
      crawl.assets = assets;
      if (currentScrapeData.crawl) currentScrapeData.crawl = crawl;
      else currentScrapeData.crawlSummary = crawl;
      renderResults(currentScrapeData);
    } catch (e) {
      setStatus('Network error: ' + (e && e.message || e), 'error');
      stopProgress();
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Classify images'; }
    }
  }

  async function runExport() {
    if (!currentScrapeData || !currentScrapeData.scrapeId) return;
    const sb = getSandbox();
    if (!sb) { setStatus('Select a sandbox first.', 'error'); return; }
    const btn = resultsEl.querySelector('[data-action="export-kit"]');
    if (btn) { btn.disabled = true; btn.textContent = 'Building ZIP…'; }
    setStatus('Building export kit ZIP (brand guidelines + personas + campaigns + segments + images) \u2026', 'info');
    startProgress(8000, ['Serialising scrape', 'Packaging images', 'Uploading ZIP to GCS', 'Generating signed URL']);
    try {
      const url = EXPORT_URL + '?sandbox=' + encodeURIComponent(sb);
      const resp = await fetchWithRetry(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sandbox: sb, scrapeId: currentScrapeData.scrapeId }),
      }, {
        retries: 2,
        onRetry: (n, status) => setStatus('Warming export kit (retry ' + n + ' of 2, ' + status + ') \u2026', 'info'),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) { setStatus('Export failed: ' + (data.error || resp.statusText), 'error'); stopProgress(); return; }
      stopProgress({ success: true });
      setStatus('Export ready in ' + ((data.elapsedMs || 0) / 1000).toFixed(1) + 's. Signed URL expires ' + fmtDate(data.signedUrlExpiresAt) + '.', 'info');
      currentScrapeData.lastExport = {
        storagePath: data.storagePath,
        signedUrl: data.signedUrl,
        signedUrlExpiresAt: data.signedUrlExpiresAt,
        createdAt: new Date().toISOString(),
      };
      renderResults(currentScrapeData);
      // Auto-trigger download
      const a = document.createElement('a');
      a.href = data.signedUrl;
      a.target = '_blank';
      a.rel = 'noopener';
      a.download = '';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      setStatus('Network error: ' + (e && e.message || e), 'error');
      stopProgress();
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Export kit (ZIP)'; }
    }
  }

  resultsEl.addEventListener('click', (evt) => {
    const toggleBtn = evt.target.closest('button[data-collapse-toggle]');
    if (toggleBtn) {
      const section = toggleBtn.closest('[data-collapsible-group]');
      if (!section) return;
      const shouldOpen = toggleBtn.dataset.collapseToggle === 'open';
      section.querySelectorAll('details.brand-scraper-collapsible').forEach(d => {
        if (shouldOpen) d.setAttribute('open', '');
        else d.removeAttribute('open');
      });
      return;
    }
    const btn = evt.target.closest('button[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'classify-assets') runClassify();
    else if (btn.dataset.action === 'export-kit') runExport();
  });

  if (historyRefreshBtn) historyRefreshBtn.addEventListener('click', loadHistory);

  window.addEventListener('aep-global-sandbox-change', () => {
    resultsEl.hidden = true;
    resultsEl.innerHTML = '';
    setStatus('');
    applyStoredCountry();
    loadHistory();
    loadModelConfig();
  });

  form.addEventListener('submit', async function (evt) {
    evt.preventDefault();
    const url = normaliseUrl(urlInput.value);
    if (!url) { setStatus('Enter a brand URL to continue.', 'error'); urlInput.focus(); return; }
    try { new URL(url); } catch (_e) {
      setStatus('That URL doesn\u2019t look valid. Try something like nike.com.', 'error');
      urlInput.focus(); return;
    }

    const sb = getSandbox();
    if (!sb) {
      setStatus('Select a sandbox in the sidebar before running a scrape — results are stored per sandbox.', 'error');
      return;
    }

    // Ask about append if this URL has been scraped already in this sandbox.
    const existing = findExistingScrape(url);
    let mode = 'new';
    let existingScrapeId = '';
    if (existing) {
      const when = fmtDate(existing.updatedAt || existing.createdAt);
      const append = confirm(
        'You already have a scrape for "' + (existing.brandName || existing.baseUrl || url) + '" from ' + when + '.\n\n' +
        'OK → append this run to the existing scrape (merge pages, assets, colours, fonts; grow personas list).\n' +
        'Cancel → create a new, separate scrape.'
      );
      if (append) {
        mode = 'append';
        existingScrapeId = existing.scrapeId;
      }
    }

    if (runBtn) runBtn.disabled = true;
    const modeLabel = mode === 'append' ? 'appending to existing scrape' : 'running new scrape';
    setStatus('Crawling ' + url + ' for sandbox "' + sb + '" (' + modeLabel + ') \u2026', 'info');
    resultsEl.hidden = true;

    const estMs = estimateAnalyzeDurationMs({
      crawler: (crawlerJsCb && crawlerJsCb.checked) ? 'js' : 'fetch',
      include: runOptions,
    });
    const phases = [
      'Crawling pages',
      (crawlerJsCb && crawlerJsCb.checked) ? 'Rendering JS (Playwright)' : 'Extracting page content',
      runOptions.analysis ? 'Generating brand guidelines' : null,
      runOptions.personas ? 'Building customer personas' : null,
      runOptions.campaigns ? 'Detecting campaigns' : null,
      runOptions.stakeholders ? 'Extracting stakeholders' : null,
      runOptions.segments ? 'Building audience segments' : null,
      'Classifying industry',
      'Saving to Firestore',
    ].filter(Boolean);
    startProgress(estMs, phases);

    try {
      const analyzeUrl = ANALYZE_URL + (ANALYZE_URL.includes('?') ? '&' : '?') + 'sandbox=' + encodeURIComponent(sb);
      const resp = await fetchWithRetry(analyzeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url,
          sandbox: sb,
          mode: mode,
          existingScrapeId: existingScrapeId,
          businessType: btypeSel && btypeSel.value,
          country: countrySel && countrySel.value,
          maxPages: pagesInput ? clampPages(pagesInput.value) : 5,
          crawler: (crawlerJsCb && crawlerJsCb.checked) ? 'js' : 'fetch',
          include: { ...runOptions },
        }),
      }, {
        retries: 2,
        onRetry: (n, status) => setStatus('Warming Cloud Run (retry ' + n + ' of 2, previous response ' + status + ') \u2026 this is normal after idle periods.', 'info'),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        let msg = 'Analysis failed: ' + (data.error || resp.statusText);
        if (data.details && data.details.byReason) {
          msg += '\n\nFailure breakdown: ' + Object.entries(data.details.byReason).map(([k,v]) => k + ' × ' + v).join(', ') + '.';
        }
        if (data.partial && data.partial.crawl) {
          setStatus(msg + '\n\nShowing partial scrape diagnostics below.', 'error');
          stopProgress();
          renderResults(data.partial);
          return;
        }
        setStatus(msg, 'error');
        stopProgress();
        return;
      }
      const actionVerb = data.appended ? 'Appended to existing scrape' : 'Saved as new scrape';
      setStatus('Done \u2014 crawled ' + (data.crawl && data.crawl.pagesScraped) + ' pages in ' +
        (data.elapsedMs ? (data.elapsedMs / 1000).toFixed(1) + 's' : '') + '. ' + actionVerb + ' in sandbox "' + sb + '".', 'info');
      stopProgress({ success: true });
      renderResults(data);
      loadHistory();
    } catch (e) {
      setStatus('Network error: ' + (e && e.message || e), 'error');
      stopProgress();
    } finally {
      if (runBtn) runBtn.disabled = false;
    }
  });

  // Capability → function-URL map for the traffic-light health checks.
  const HEALTHCHECK_URLS = {
    analyze: ANALYZE_URL,
    classify: CLASSIFY_URL,
    export: EXPORT_URL,
  };

  async function pingFunction(url) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);
      const resp = await fetch(url, {
        method: 'OPTIONS',
        signal: ctrl.signal,
        headers: { 'Access-Control-Request-Method': 'POST' },
      });
      clearTimeout(timer);
      // Cloud Functions v2 returns 204 for OPTIONS preflight when CORS is set.
      return resp.ok || resp.status === 204;
    } catch (_e) {
      return false;
    }
  }

  function applyLight(key, isOk) {
    const cards = document.querySelectorAll('.brand-scraper-card[data-healthcheck="' + key + '"]');
    cards.forEach(card => {
      const light = card.querySelector('.brand-scraper-card-light');
      if (!light) return;
      light.classList.remove('is-checking');
      light.classList.toggle('is-ok', !!isOk);
      light.classList.toggle('is-fail', !isOk);
      light.title = isOk ? 'Function healthy — CORS preflight OK' : 'Function did not respond — check deployment';
    });
  }

  async function runHealthChecks() {
    const keys = Object.keys(HEALTHCHECK_URLS);
    await Promise.all(keys.map(async k => {
      const ok = await pingFunction(HEALTHCHECK_URLS[k]);
      applyLight(k, ok);
    }));
  }

  // Hide wrappers whose <img> fails to load (403, hotlink-blocked, DNS, expired signed URL).
  // Image <error> events don't bubble, so use capture-phase listener.
  function hideBrokenImageWrapper(img) {
    const wrapper = img.closest('figure, a');
    if (wrapper) {
      wrapper.style.display = 'none';
      wrapper.setAttribute('data-broken', 'true');
    } else {
      img.style.display = 'none';
    }
  }
  function attachBrokenImgHandler(root) {
    if (!root) return;
    root.addEventListener('error', (evt) => {
      const t = evt.target;
      if (t && t.tagName === 'IMG') hideBrokenImageWrapper(t);
    }, true);
  }
  attachBrokenImgHandler(resultsEl);
  attachBrokenImgHandler(historyListEl);

  // Initial load — wait a tick so the sidebar/sandbox sync can settle.
  setTimeout(() => { applyStoredCountry(); loadHistory(); runHealthChecks(); loadModelConfig(); }, 300);
})();
