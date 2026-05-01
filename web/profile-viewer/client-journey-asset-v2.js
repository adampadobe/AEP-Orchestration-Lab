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

  var FN_BASE = 'https://us-central1-aep-orchestration-lab.cloudfunctions.net';
  var GENERATE_URL = FN_BASE + '/clientJourneyV2Generate';
  var PPTX_URL = '/api/client-journey-v2/pptx';

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
  var brandSwatch = document.getElementById('cjv2BrandSwatch');

  var outputSection = document.getElementById('cjv2Output');
  var pptxStatusEl = document.getElementById('cjv2PptxStatus');
  var downloadHtmlBtn = document.getElementById('cjv2DownloadHtmlBtn');
  var downloadPptxBtn = document.getElementById('cjv2DownloadPptxBtn');
  var openNewTabBtn = document.getElementById('cjv2OpenNewTabBtn');
  var iframeEl = document.getElementById('cjv2HtmlPreview');

  var debugSection = document.getElementById('cjv2DebugSection');
  var sourcesEl = document.getElementById('cjv2Sources');
  var logEl = document.getElementById('cjv2Log');
  var metaEl = document.getElementById('cjv2Meta');

  /** @type {{html:string,journey:object,sources:Array,meta:object,log:Array}|null} */
  var lastResult = null;
  /** @type {string|null} */
  var lastBlobUrl = null;

  // ── Brand colour swatch live preview ───────────────────────────────────

  function updateSwatch() {
    var raw = String(brandColorInput.value || '').replace(/^#/, '').trim();
    if (/^[0-9A-Fa-f]{6}$/.test(raw)) {
      brandSwatch.style.background = '#' + raw;
      brandSwatch.style.borderColor = '#' + raw;
    } else {
      brandSwatch.style.background = '';
      brandSwatch.style.borderColor = '';
    }
  }
  brandColorInput.addEventListener('input', updateSwatch);
  updateSwatch();

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

  function readForm() {
    var fd = new FormData(form);
    var body = {};
    fd.forEach(function (val, key) { body[key] = String(val); });
    body.tier = body.tier === 'Advanced' ? 'Advanced' : 'Foundation';
    body.client = String(body.client || '').trim();
    body.brandColor = String(body.brandColor || '').trim();
    return body;
  }

  function clearLastResult() {
    if (lastBlobUrl) {
      try { URL.revokeObjectURL(lastBlobUrl); } catch (e) {}
      lastBlobUrl = null;
    }
    lastResult = null;
    iframeEl.src = 'about:blank';
    outputSection.hidden = true;
    debugSection.hidden = true;
  }

  resetBtn.addEventListener('click', function () {
    form.reset();
    setStatus('');
    setPptxStatus('');
    clearLastResult();
    longCallNote.hidden = true;
    updateSwatch();
  });

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    var body = readForm();
    if (!body.client) {
      setStatus('Client name is required.', 'error');
      return;
    }
    clearLastResult();
    generateBtn.disabled = true;
    longCallNote.hidden = false;
    var startedAt = Date.now();
    setStatus('Sending request to Vertex AI Gemini…');

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
        throw new Error(detail);
      }
      if (!json.html || !json.journey) {
        throw new Error('Server returned ok but no html or journey in payload');
      }

      lastResult = json;
      var elapsed = Math.round((Date.now() - startedAt) / 1000);
      setStatus('Done in ' + elapsed + 's. ' + (json.meta && json.meta.tier) + ' tier journey for ' + (json.meta && json.meta.client) + '.', 'success');
      renderOutput();
    } catch (err) {
      console.error('[cjv2] generate failed:', err);
      setStatus(String(err.message || err), 'error');
    } finally {
      clearInterval(tickHandle);
      generateBtn.disabled = false;
      longCallNote.hidden = true;
    }
  });

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

    outputSection.hidden = false;
    debugSection.hidden = false;

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

  // Cleanup on unload to avoid leaking blob URLs.
  window.addEventListener('beforeunload', function () {
    if (lastBlobUrl) { try { URL.revokeObjectURL(lastBlobUrl); } catch (e) {} }
  });
})();
