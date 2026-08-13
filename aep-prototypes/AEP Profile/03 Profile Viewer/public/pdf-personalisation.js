(function () {
  'use strict';

  const MAX_HTML_BYTES = 1_500_000;
  const MAX_HTML_DATA_BYTES = 1_500_000;
  const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
  const MAX_DOCUMENT_DATA_BYTES = 8 * 1024 * 1024;
  const supportedDocumentExtensions = new Set([
    'bmp', 'doc', 'docx', 'gif', 'jpeg', 'jpg', 'png', 'ppt', 'pptx',
    'rtf', 'tif', 'tiff', 'txt', 'xls', 'xlsx',
  ]);
  const sampleHtml = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 38px; color: #201d1b; background: #f4f1ed; font-family: Arial, sans-serif; }
    .ticket { max-width: 760px; margin: 0 auto; overflow: hidden; border-radius: 18px; background: #fff; box-shadow: 0 18px 55px rgba(61,37,22,.13); }
    .header { display: flex; justify-content: space-between; align-items: center; padding: 28px 32px; color: #fff; background: linear-gradient(120deg,#6d1020,#b31e36); }
    .brand { font-size: 24px; font-weight: bold; letter-spacing: .08em; }
    .reference { text-align: right; font-size: 12px; }
    .reference strong { display: block; margin-top: 4px; font-size: 19px; }
    .content { padding: 30px 32px; }
    h1 { margin: 0 0 8px; font-size: 25px; }
    .lead { margin: 0 0 26px; color: #665f5b; }
    .flight { display: grid; grid-template-columns: 1fr auto 1fr; gap: 20px; align-items: center; margin: 14px 0; padding: 20px; border: 1px solid #e9dfd9; border-radius: 12px; }
    .airport:last-child { text-align: right; }
    .code { display: block; color: #6d1020; font-size: 28px; font-weight: bold; }
    .route { color: #b31e36; font-weight: bold; }
    .meta { display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; margin-top: 22px; }
    .meta div { padding: 13px; border-radius: 9px; background: #f8f4f1; }
    .meta span { display: block; margin-bottom: 5px; color: #7b706a; font-size: 10px; text-transform: uppercase; }
    .footer { padding: 17px 32px; color: #776c66; background: #f8f4f1; font-size: 10px; }
  </style>
</head>
<body>
  <article class="ticket">
    <header class="header">
      <div class="brand">TRAVEL DEMO</div>
      <div class="reference">Booking reference<strong>{{data.bookingReference}}</strong></div>
    </header>
    <section class="content">
      <h1>Your booking is confirmed, {{data.firstName}}</h1>
      <p class="lead">Your personalised itinerary and ticket details are below.</p>
      <div class="flight">
        <div class="airport"><span class="code">{{data.departureAirport}}</span>{{formatDateTime data.departureDateTime}}</div>
        <div class="route">{{data.flightNumber}} →</div>
        <div class="airport"><span class="code">{{data.arrivalAirport}}</span>{{formatDateTime data.arrivalDateTime}}</div>
      </div>
      <div class="meta">
        <div><span>Passenger</span><strong>{{data.firstName}} {{data.lastName}}</strong></div>
        <div><span>Ticket</span><strong>{{data.ticketNumber}}</strong></div>
        <div><span>Total paid</span><strong>{{formatCurrency data.totalPaid data.currency}}</strong></div>
      </div>
    </section>
    <footer class="footer">Generated securely for this recipient · Do not forward if it contains personal information.</footer>
  </article>
</body>
</html>`;

  const sampleData = {
    bookingReference: 'EK8F2Q',
    ticketNumber: '1761234567890',
    firstName: 'Amelia',
    lastName: 'Palmer',
    flightNumber: 'EK 001',
    departureAirport: 'DXB',
    arrivalAirport: 'LHR',
    departureDateTime: '2026-08-12T07:45:00Z',
    arrivalDateTime: '2026-08-12T15:10:00Z',
    totalPaid: 1280.5,
    currency: 'GBP',
  };

  const htmlEditor = document.getElementById('pdfHtmlEditor');
  const dataEditor = document.getElementById('pdfDataEditor');
  const htmlEditorDetails = document.getElementById('pdfHtmlEditorDetails');
  const jsonEditorDetails = document.getElementById('pdfJsonEditorDetails');
  const htmlCodeShell = document.getElementById('pdfHtmlCodeShell');
  const jsonCodeShell = document.getElementById('pdfJsonCodeShell');
  const htmlHighlight = document.querySelector('#pdfHtmlHighlight code');
  const jsonHighlight = document.querySelector('#pdfJsonHighlight code');
  const beautifyJsonButton = document.getElementById('pdfBeautifyJson');
  const templateSelect = document.getElementById('pdfSavedTemplate');
  const templateName = document.getElementById('pdfTemplateName');
  const htmlFile = document.getElementById('pdfHtmlFile');
  const dropZone = document.getElementById('pdfHtmlDropZone');
  const fileMeta = document.getElementById('pdfHtmlFileMeta');
  const conversionModeSelect = document.getElementById('pdfConversionMode');
  const documentFile = document.getElementById('pdfDocumentFile');
  const documentDropZone = document.getElementById('pdfDocumentDropZone');
  const documentFileMeta = document.getElementById('pdfDocumentFileMeta');
  const jsonFile = document.getElementById('pdfJsonFile');
  const jsonDropZone = document.getElementById('pdfJsonDropZone');
  const jsonFileMeta = document.getElementById('pdfJsonFileMeta');
  const authState = document.getElementById('pdfAuthState');
  const statusEl = document.getElementById('pdfWorkspaceStatus');
  const jsonState = document.getElementById('pdfJsonState');
  const stageModeState = document.getElementById('pdfStageModeState');
  const stageSourceState = document.getElementById('pdfStageSourceState');
  const stageJsonState = document.getElementById('pdfStageJsonState');
  const stageOutputState = document.getElementById('pdfStageOutputState');
  const stageTemplateState = document.getElementById('pdfStageTemplateState');
  const reuseTemplateCount = document.getElementById('pdfReuseTemplateCount');
  const previewButton = document.getElementById('pdfPreviewButton');
  const generateButton = document.getElementById('pdfGenerateButton');
  const previewFrame = document.getElementById('pdfPreviewFrame');
  const documentPreviewFrame = document.getElementById('pdfDocumentPreviewFrame');
  const previewEmpty = document.getElementById('pdfPreviewEmpty');
  const previewMeta = document.getElementById('pdfPreviewMeta');
  const resultPanel = document.getElementById('pdfResultPanel');
  const openPreviewLink = document.getElementById('pdfOpenPreviewLink');
  const handoffJson = document.getElementById('pdfHandoffJson');
  const apiKeyStatus = document.getElementById('pdfApiKeyStatus');
  const apiKeyList = document.getElementById('pdfApiKeyList');
  const newApiKeyPanel = document.getElementById('pdfNewApiKey');
  const newApiKeyValue = document.getElementById('pdfNewApiKeyValue');
  const journeyTemplateStatus = document.getElementById('pdfJourneyTemplateStatus');
  const journeyTemplateList = document.getElementById('pdfJourneyTemplateList');
  const journeyTemplateMappingPanel = document.getElementById('pdfJourneyTemplateMappingPanel');
  const journeyTemplateMappings = document.getElementById('pdfJourneyTemplateMappings');
  const publishDetails = document.getElementById('pdfPublishDetails');
  let authUser = null;
  let lastResult = null;
  let sourceDocument = null;
  let sourceHtmlFileName = '';
  let journeyTemplateAnalysis = null;
  let journeyTemplatesAvailable = [];
  let journeyCampaignsAvailable = [];
  let activeJourneyTestJob = '';

  function conversionMode() {
    return conversionModeSelect.value === 'document' ? 'document' : 'html';
  }

  function updateDocumentOperation() {
    if (!sourceDocument) {
      document.getElementById('pdfDocumentOperationBadge').textContent = 'CreatePDFJob';
      return;
    }
    const extension = String(sourceDocument.fileName.split('.').pop() || '').toLowerCase();
    let mergeData = false;
    try { mergeData = Object.keys(parseData()).length > 0; } catch (_error) {}
    document.getElementById('pdfDocumentOperationBadge').textContent = extension === 'docx' && mergeData
      ? 'DocumentMergeJob'
      : 'CreatePDFJob';
  }

  function uniqueKey() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return `pdf-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function formatBytes(bytes) {
    const number = Number(bytes) || 0;
    if (number < 1024) return `${number} B`;
    if (number < 1024 * 1024) return `${(number / 1024).toFixed(1)} KB`;
    return `${(number / (1024 * 1024)).toFixed(2)} MB`;
  }

  function rememberEmptyDropState(zone) {
    if (!zone.dataset.emptyTitle) zone.dataset.emptyTitle = zone.querySelector('strong').textContent;
    if (!zone.dataset.emptyDescription) {
      zone.dataset.emptyDescription = zone.querySelector('.pdf-drop-description').textContent;
    }
    if (!zone.dataset.emptyAriaLabel) zone.dataset.emptyAriaLabel = zone.getAttribute('aria-label') || '';
  }

  function setDropZoneLoaded(zone, fileName, bytes, typeLabel, originLabel = 'Loaded') {
    rememberEmptyDropState(zone);
    const safeName = String(fileName || 'Loaded file');
    zone.classList.add('is-loaded');
    zone.querySelector('strong').textContent = safeName;
    zone.querySelector('.pdf-drop-description').textContent = `${originLabel} · ${typeLabel} · ${formatBytes(bytes)}`;
    zone.setAttribute('aria-label', `${safeName} loaded. Click or drop another file to replace it.`);
  }

  function resetDropZone(zone) {
    rememberEmptyDropState(zone);
    zone.classList.remove('is-loaded');
    zone.querySelector('strong').textContent = zone.dataset.emptyTitle;
    zone.querySelector('.pdf-drop-description').textContent = zone.dataset.emptyDescription;
    zone.setAttribute('aria-label', zone.dataset.emptyAriaLabel);
  }

  function setStatus(message, kind) {
    statusEl.hidden = !message;
    statusEl.textContent = message || '';
    statusEl.className = `pdf-status${kind ? ` is-${kind}` : ''}`;
    if (kind === 'error') {
      const activeStage = document.activeElement && document.activeElement.closest('.pdf-stage-card');
      if (activeStage) activeStage.open = true;
    }
  }

  function setStageState(element, message, kind) {
    if (!element) return;
    element.textContent = message;
    element.classList.toggle('is-success', kind === 'success');
    element.classList.toggle('is-error', kind === 'error');
  }

  function openStage(stageId, sourceButton) {
    const target = document.getElementById(stageId);
    if (!target) return;
    const current = sourceButton && sourceButton.closest('.pdf-stage-card');
    if (current && current !== target) current.open = false;
    target.open = true;
    window.requestAnimationFrame(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  function bindStageNavigation() {
    const stages = Array.from(document.querySelectorAll('.pdf-stage-card'));
    stages.forEach((stage) => { stage.open = false; });
    document.getElementById('pdfExpandAllStages').addEventListener('click', () => {
      stages.forEach((stage) => { stage.open = true; });
    });
    document.getElementById('pdfCollapseAllStages').addEventListener('click', () => {
      stages.forEach((stage) => { stage.open = false; });
      document.querySelector('.pdf-stage-stack').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    document.querySelectorAll('.pdf-stage-next').forEach((button) => {
      button.addEventListener('click', () => openStage(button.dataset.openStage, button));
    });
  }

  function setBusy(busy) {
    previewButton.disabled = busy;
    generateButton.disabled = busy;
    document.getElementById('pdfSaveTemplate').disabled = busy;
    document.getElementById('pdfAnalyseJourneyTemplate').disabled = busy;
    document.getElementById('pdfUploadJourneyTemplate').disabled = busy || !journeyTemplateAnalysis;
    beautifyJsonButton.disabled = busy;
  }

  function setAuthState(message, kind) {
    authState.textContent = message;
    authState.className = `pdf-auth-state${kind ? ` is-${kind}` : ''}`;
  }

  function escapeCode(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function highlightHandlebars(value) {
    const source = String(value || '');
    let output = '';
    let cursor = 0;
    const pattern = /{{{?[\s\S]*?}?}}/g;
    let match;
    while ((match = pattern.exec(source))) {
      output += escapeCode(source.slice(cursor, match.index));
      output += `<span class="pdf-syntax-handlebars">${escapeCode(match[0])}</span>`;
      cursor = match.index + match[0].length;
    }
    return output + escapeCode(source.slice(cursor));
  }

  function highlightHtmlAttributes(value) {
    const source = String(value || '');
    let output = '';
    let cursor = 0;
    const pattern = /([^\s=/>]+)(\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+)/g;
    let match;
    while ((match = pattern.exec(source))) {
      output += escapeCode(source.slice(cursor, match.index));
      output += `<span class="pdf-syntax-attribute">${escapeCode(match[1])}</span>`;
      output += `<span class="pdf-syntax-operator">${escapeCode(match[2])}</span>`;
      output += `<span class="pdf-syntax-string">${highlightHandlebars(match[3])}</span>`;
      cursor = match.index + match[0].length;
    }
    return output + escapeCode(source.slice(cursor));
  }

  function highlightHtmlTag(value) {
    const match = String(value || '').match(/^(<\/?)([^\s/>]+)([\s\S]*?)(\/?>)$/);
    if (!match) return escapeCode(value);
    return `<span class="pdf-syntax-bracket">${escapeCode(match[1])}</span>`
      + `<span class="pdf-syntax-tag">${escapeCode(match[2])}</span>`
      + highlightHtmlAttributes(match[3])
      + `<span class="pdf-syntax-bracket">${escapeCode(match[4])}</span>`;
  }

  function highlightCss(value) {
    const source = String(value || '');
    let output = '';
    let cursor = 0;
    const pattern = /(\/\*[\s\S]*?\*\/|"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|#[0-9a-f]{3,8}\b|-?\d+(?:\.\d+)?(?:px|rem|em|vh|vw|%|s|ms|deg)?\b|--?[a-z][\w-]*|[a-z-]+(?=\s*:))/gi;
    let match;
    while ((match = pattern.exec(source))) {
      output += escapeCode(source.slice(cursor, match.index));
      let className = 'pdf-syntax-css-value';
      if (match[0].startsWith('/*')) className = 'pdf-syntax-comment';
      else if (/^[a-z-]+$/i.test(match[0]) || match[0].startsWith('--')) className = 'pdf-syntax-css-property';
      output += `<span class="${className}">${escapeCode(match[0])}</span>`;
      cursor = match.index + match[0].length;
    }
    return output + escapeCode(source.slice(cursor));
  }

  function highlightHtmlSource(value) {
    const source = String(value || '');
    let output = '';
    let cursor = 0;
    const pattern = /<style\b[^>]*>[\s\S]*?<\/style>|<!--[\s\S]*?-->|<!doctype[\s\S]*?>|<\/?[a-z][^>]*>|{{{?[\s\S]*?}?}}/gi;
    let match;
    while ((match = pattern.exec(source))) {
      output += highlightHandlebars(source.slice(cursor, match.index));
      const token = match[0];
      if (/^<!--/.test(token)) {
        output += `<span class="pdf-syntax-comment">${escapeCode(token)}</span>`;
      } else if (/^<!doctype/i.test(token)) {
        output += `<span class="pdf-syntax-doctype">${escapeCode(token)}</span>`;
      } else if (/^<style\b/i.test(token)) {
        const styleMatch = token.match(/^(<style\b[^>]*>)([\s\S]*)(<\/style>)$/i);
        output += highlightHtmlTag(styleMatch[1]) + highlightCss(styleMatch[2]) + highlightHtmlTag(styleMatch[3]);
      } else if (token.startsWith('{{')) {
        output += `<span class="pdf-syntax-handlebars">${escapeCode(token)}</span>`;
      } else {
        output += highlightHtmlTag(token);
      }
      cursor = match.index + token.length;
    }
    return output + highlightHandlebars(source.slice(cursor));
  }

  function highlightJsonSource(value) {
    const source = String(value || '');
    let output = '';
    let cursor = 0;
    const pattern = /"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b/g;
    let match;
    while ((match = pattern.exec(source))) {
      output += escapeCode(source.slice(cursor, match.index));
      const token = match[0];
      let className = 'pdf-syntax-json-number';
      if (token.startsWith('"')) className = /^\s*:/.test(source.slice(pattern.lastIndex)) ? 'pdf-syntax-json-key' : 'pdf-syntax-json-string';
      else if (token === 'null') className = 'pdf-syntax-json-null';
      else if (token === 'true' || token === 'false') className = 'pdf-syntax-json-boolean';
      output += `<span class="${className}">${escapeCode(token)}</span>`;
      cursor = match.index + token.length;
    }
    return output + escapeCode(source.slice(cursor));
  }

  function editorMetrics(editor) {
    const value = editor.value || '';
    const lines = value ? value.split('\n').length : 0;
    const beforeCursor = value.slice(0, editor.selectionStart || 0).split('\n');
    return {
      characters: value.length,
      lines,
      line: beforeCursor.length,
      column: beforeCursor[beforeCursor.length - 1].length + 1,
    };
  }

  function syncEditor(editor, highlight, highlighter, prefix) {
    const metrics = editorMetrics(editor);
    highlight.innerHTML = `${highlighter(editor.value)}\n`;
    highlight.parentElement.scrollTop = editor.scrollTop;
    highlight.parentElement.scrollLeft = editor.scrollLeft;
    document.getElementById(`pdf${prefix}EditorStats`).textContent = `${metrics.lines} ${metrics.lines === 1 ? 'line' : 'lines'} · ${metrics.characters} characters`;
    document.getElementById(`pdf${prefix}CursorPosition`).textContent = `Line ${metrics.line}, column ${metrics.column}`;
    document.getElementById(`pdf${prefix}EditorSummaryMeta`).textContent = metrics.characters
      ? `${metrics.lines} ${metrics.lines === 1 ? 'line' : 'lines'} · ${metrics.characters} characters`
      : 'Click to open the syntax-coloured editor';
  }

  function syncHtmlEditorHighlight() {
    syncEditor(htmlEditor, htmlHighlight, highlightHtmlSource, 'Html');
  }

  function syncJsonEditorHighlight() {
    syncEditor(dataEditor, jsonHighlight, highlightJsonSource, 'Json');
  }

  function bindCodeEditor(editor, highlight, shell, wrapButton, details, sync) {
    editor.addEventListener('scroll', () => {
      highlight.parentElement.scrollTop = editor.scrollTop;
      highlight.parentElement.scrollLeft = editor.scrollLeft;
    });
    ['click', 'keyup', 'select'].forEach((eventName) => editor.addEventListener(eventName, sync));
    editor.addEventListener('keydown', (event) => {
      if (event.key !== 'Tab') return;
      event.preventDefault();
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      editor.setRangeText('  ', start, end, 'end');
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    });
    wrapButton.addEventListener('click', () => {
      const wrapped = shell.classList.toggle('is-wrapped');
      editor.wrap = wrapped ? 'soft' : 'off';
      wrapButton.setAttribute('aria-pressed', String(wrapped));
      wrapButton.textContent = wrapped ? 'Unwrap lines' : 'Wrap lines';
      sync();
      editor.focus();
    });
    details.addEventListener('toggle', () => { if (details.open) sync(); });
  }

  function bindCodeEditors() {
    bindCodeEditor(htmlEditor, htmlHighlight, htmlCodeShell, document.getElementById('pdfHtmlWrapToggle'), htmlEditorDetails, syncHtmlEditorHighlight);
    bindCodeEditor(dataEditor, jsonHighlight, jsonCodeShell, document.getElementById('pdfJsonWrapToggle'), jsonEditorDetails, syncJsonEditorHighlight);
    syncHtmlEditorHighlight();
    syncJsonEditorHighlight();
  }

  function parseData() {
    const raw = dataEditor.value || '{}';
    try {
      let value;
      let normalisedSmartQuotes = false;
      try {
        value = JSON.parse(raw);
      } catch (firstError) {
        const repaired = raw.replace(/[“”]/g, '"');
        if (repaired === raw) throw firstError;
        value = JSON.parse(repaired);
        normalisedSmartQuotes = true;
      }
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Use a JSON object');
      const maxBytes = conversionMode() === 'document' ? MAX_DOCUMENT_DATA_BYTES : MAX_HTML_DATA_BYTES;
      if (new Blob([JSON.stringify(value)]).size > maxBytes) {
        throw new Error(`Payload exceeds ${conversionMode() === 'document' ? '8 MB' : '1.5 MB'}`);
      }
      jsonState.textContent = normalisedSmartQuotes ? 'Valid · smart quotes fixed' : 'Valid JSON';
      jsonState.classList.remove('is-error');
      setStageState(stageJsonState, normalisedSmartQuotes ? 'JSON repaired' : 'Valid JSON', 'success');
      return value;
    } catch (error) {
      jsonState.textContent = 'Invalid JSON';
      jsonState.classList.add('is-error');
      setStageState(stageJsonState, 'Invalid JSON', 'error');
      throw new Error(`Personalisation data is invalid: ${error.message}`);
    }
  }

  function beautifyJson() {
    try {
      const data = parseData();
      dataEditor.value = JSON.stringify(data, null, 2);
      syncJsonEditorHighlight();
      markRequestChanged();
      setStatus('JSON payload beautified and validated.', 'success');
    } catch (error) {
      dataEditor.focus();
      setStatus(error.message, 'error');
    }
  }

  function pageOptions() {
    const preset = document.getElementById('pdfPagePreset').value;
    const sizes = {
      a4: { pageWidth: 8.27, pageHeight: 11.69 },
      letter: { pageWidth: 8.5, pageHeight: 11 },
      'a4-landscape': { pageWidth: 11.69, pageHeight: 8.27 },
    };
    return {
      ...(sizes[preset] || sizes.a4),
      includeHeaderFooter: document.getElementById('pdfHeaderFooter').checked,
      waitTimeToLoad: 100,
      locale: document.getElementById('pdfLocale').value.trim() || 'en-GB',
      timeZone: document.getElementById('pdfTimeZone').value.trim() || 'UTC',
    };
  }

  function activeTemplatePayload() {
    const templateId = templateSelect.value.trim();
    if (templateId) return { templateId };
    const htmlTemplate = htmlEditor.value;
    if (!htmlTemplate.trim()) throw new Error('Add or select an HTML template first.');
    if (new Blob([htmlTemplate]).size > MAX_HTML_BYTES) throw new Error('HTML template exceeds 1.5 MB.');
    return { htmlTemplate };
  }

  function activeDocumentPayload() {
    if (!sourceDocument) throw new Error('Drop in a supported source document first.');
    return { sourceDocument, data: parseData() };
  }

  function requestPayload(includeGenerationFields) {
    const mode = conversionMode();
    const payload = {
      conversionMode: mode,
      ...(mode === 'document' ? activeDocumentPayload() : activeTemplatePayload()),
    };
    if (mode === 'html') {
      payload.data = parseData();
      payload.options = pageOptions();
    }
    if (includeGenerationFields) {
      payload.documentName = document.getElementById('pdfDocumentName').value.trim() || 'personalised-document.pdf';
      payload.idempotencyKey = document.getElementById('pdfIdempotencyKey').value.trim();
    }
    return payload;
  }

  function projectId() {
    try {
      return String(window.firebaseDatabaseConfig && window.firebaseDatabaseConfig.projectId || 'aep-orchestration-lab').trim();
    } catch (_error) {
      return 'aep-orchestration-lab';
    }
  }

  function directFunctionUrl(path) {
    return `https://us-central1-${projectId()}.cloudfunctions.net/pdfPersonalisation${path}`;
  }

  async function token() {
    const user = authUser || (window.firebase && firebase.auth && firebase.auth().currentUser);
    if (!user || user.isAnonymous || !user.email) throw new Error('Sign in to the Lab with apalmer@adobe.com first.');
    return user.getIdToken(false);
  }

  async function api(path, init, direct) {
    const idToken = await token();
    const response = await fetch(direct ? directFunctionUrl(path) : `/api/pdf-personalisation${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${idToken}`,
        ...(init && init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init && init.headers || {}),
      },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(body.message || body.error || `Request failed (${response.status})`);
    }
    return { status: response.status, body };
  }

  async function copyText(value, button, restoredLabel) {
    try {
      await navigator.clipboard.writeText(String(value || ''));
      if (button) {
        const original = restoredLabel || button.textContent;
        button.textContent = 'Copied';
        window.setTimeout(() => { button.textContent = original; }, 1400);
      }
      return true;
    } catch (_error) {
      setStatus('Copy was blocked by the browser. Select the value and copy it manually.', 'error');
      return false;
    }
  }

  function setApiKeyStatus(message, kind) {
    apiKeyStatus.textContent = message || '';
    apiKeyStatus.className = `pdf-key-status${kind ? ` is-${kind}` : ''}`;
  }

  function renderApiKeys(keys) {
    apiKeyList.replaceChildren();
    if (!Array.isArray(keys) || keys.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'pdf-key-empty';
      empty.textContent = 'No active PDF journey keys yet.';
      apiKeyList.appendChild(empty);
      return;
    }
    keys.forEach((key) => {
      const item = document.createElement('div');
      item.className = 'pdf-key-list-item';
      const details = document.createElement('div');
      const title = document.createElement('strong');
      title.textContent = key.keyLabel || 'AJO custom action';
      const metadata = document.createElement('span');
      metadata.textContent = `${key.keyPrefix || 'pdf_…'}… · created ${key.createdAt ? new Date(key.createdAt).toLocaleString() : 'recently'}`;
      details.append(title, metadata);
      const revoke = document.createElement('button');
      revoke.type = 'button';
      revoke.className = 'dashboard-btn-outline pdf-key-revoke';
      revoke.textContent = 'Revoke';
      revoke.addEventListener('click', () => revokeApiKey(key.keyId, key.keyLabel));
      item.append(details, revoke);
      apiKeyList.appendChild(item);
    });
  }

  async function loadApiKeys() {
    try {
      setApiKeyStatus('Loading active keys…');
      const { body } = await api('/journey-action/keys', { method: 'GET' });
      renderApiKeys(body.keys || []);
      setApiKeyStatus(`${(body.keys || []).length} active key${(body.keys || []).length === 1 ? '' : 's'}.`);
    } catch (error) {
      renderApiKeys([]);
      setApiKeyStatus(error.message, 'error');
    }
  }

  async function generateApiKey() {
    const button = document.getElementById('pdfGenerateApiKey');
    try {
      button.disabled = true;
      setApiKeyStatus('Generating a scoped key…');
      const keyLabel = document.getElementById('pdfApiKeyLabel').value.trim();
      const { body } = await api('/journey-action/keys', {
        method: 'POST',
        body: JSON.stringify({ keyLabel }),
      });
      newApiKeyValue.type = 'password';
      newApiKeyValue.value = body.key || '';
      document.getElementById('pdfToggleApiKey').textContent = 'Show';
      newApiKeyPanel.hidden = false;
      setApiKeyStatus(`Created “${body.keyLabel}”. Copy it now, then paste it into AJO’s authentication Value field.`, 'success');
      await loadApiKeys();
      newApiKeyPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (error) {
      setApiKeyStatus(error.message, 'error');
    } finally {
      button.disabled = false;
    }
  }

  async function revokeApiKey(keyId, keyLabel) {
    if (!window.confirm(`Revoke “${keyLabel || 'this key'}”? Any AJO action using it will stop authenticating immediately.`)) return;
    try {
      setApiKeyStatus('Revoking key…');
      await api(`/journey-action/keys?keyId=${encodeURIComponent(keyId)}`, { method: 'DELETE' });
      setApiKeyStatus(`Revoked “${keyLabel || 'PDF journey key'}”.`, 'success');
      await loadApiKeys();
    } catch (error) {
      setApiKeyStatus(error.message, 'error');
    }
  }

  function actionSetupText() {
    refreshActionRequestId();
    const generatedKey = newApiKeyValue.value.trim();
    return [
      'AJO CUSTOM ACTION — GENERATE PERSONALISED PDF',
      'Name: GeneratePersonalisedPDF',
      'Description: Generate a personalised booking or check-in PDF and send it through the configured AJO API-triggered email campaign.',
      'Action type: Custom',
      'Channel: Email',
      'URL: https://aep-orchestration-lab.web.app/api/pdf-personalisation/journey-action',
      'Method: POST',
      'Header: Content-Type = application/json',
      'Header: Charset = UTF-8',
      'Authentication type: API key',
      'Authentication name: x-pdf-api-key',
      'Authentication location: Header',
      `Authentication value: ${generatedKey || '<generate a key on the PDF Personalisation page and paste it here>'}`,
      '',
      'AJO REQUEST FIELD DEFINITION',
      document.getElementById('pdfActionFieldDefinition').textContent.trim(),
      '',
      'REQUEST PAYLOAD',
      document.getElementById('pdfActionRequest').textContent.trim(),
      '',
      'SUCCESS RESPONSE',
      document.getElementById('pdfActionSuccess').textContent.trim(),
      '',
      'FAILURE RESPONSE',
      document.getElementById('pdfActionFailure').textContent.trim(),
    ].join('\n');
  }

  function refreshActionRequestId() {
    const target = document.getElementById('pdfActionRequest');
    if (!target) return '';
    try {
      const payload = JSON.parse(target.textContent);
      const unique = window.crypto && typeof window.crypto.randomUUID === 'function'
        ? window.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      payload.requestId = `riyadh-checkin-${unique}`;
      target.textContent = JSON.stringify(payload, null, 2);
    } catch (_error) {}
    return target.textContent.trim();
  }

  function bindCustomActionSetup() {
    document.getElementById('pdfGenerateApiKey').addEventListener('click', generateApiKey);
    document.getElementById('pdfCopyApiKey').addEventListener('click', (event) => {
      copyText(newApiKeyValue.value, event.currentTarget, 'Copy key');
    });
    document.getElementById('pdfToggleApiKey').addEventListener('click', (event) => {
      const reveal = newApiKeyValue.type === 'password';
      newApiKeyValue.type = reveal ? 'text' : 'password';
      event.currentTarget.textContent = reveal ? 'Hide' : 'Show';
    });
    document.getElementById('pdfCopyActionSetup').addEventListener('click', (event) => {
      copyText(actionSetupText(), event.currentTarget, 'Copy all setup values');
    });
    document.getElementById('pdfNewActionRequestId').addEventListener('click', (event) => {
      refreshActionRequestId();
      const original = event.currentTarget.textContent;
      event.currentTarget.textContent = 'New ID ready';
      window.setTimeout(() => { event.currentTarget.textContent = original; }, 1400);
    });
    document.querySelectorAll('[data-copy-target]').forEach((button) => {
      button.addEventListener('click', (event) => {
        const target = document.getElementById(button.dataset.copyTarget);
        if (target && target.id === 'pdfActionRequest') refreshActionRequestId();
        copyText(target && target.textContent.trim(), event.currentTarget, button.textContent);
      });
    });
    refreshActionRequestId();
  }

  function setJourneyTemplateStatus(message, kind) {
    journeyTemplateStatus.textContent = message || '';
    journeyTemplateStatus.className = `pdf-key-status${kind ? ` is-${kind}` : ''}`;
  }

  function templateNameFromFile(fileName) {
    return String(fileName || '')
      .replace(/\.[^.]+$/, '')
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
  }

  function displayLabelFromFile(fileName) {
    return String(fileName || '')
      .replace(/\.[^.]+$/, '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (character) => character.toUpperCase())
      .slice(0, 120);
  }

  function invalidateJourneyTemplateAnalysis(message) {
    journeyTemplateAnalysis = null;
    journeyTemplateMappingPanel.hidden = true;
    journeyTemplateMappings.replaceChildren();
    document.getElementById('pdfUploadJourneyTemplate').disabled = true;
    if (message) setJourneyTemplateStatus(message);
  }

  function syncJourneyTemplateDefaults(fileName, force = false) {
    const nameInput = document.getElementById('pdfJourneyTemplateName');
    const labelInput = document.getElementById('pdfJourneyTemplateLabel');
    const documentNameInput = document.getElementById('pdfJourneyTemplateDocumentName');
    const name = templateNameFromFile(fileName);
    if (force || !nameInput.value.trim()) nameInput.value = name;
    if (force || !labelInput.value.trim()) labelInput.value = displayLabelFromFile(fileName);
    if (force || !documentNameInput.value.trim()) documentNameInput.value = `${name || 'travel-document'}.pdf`;
  }

  async function currentJourneyTemplateSource() {
    if (conversionMode() === 'document') {
      if (!sourceDocument) throw new Error('Drop a source document into step 1 first.');
      return { ...sourceDocument };
    }
    const html = htmlEditor.value.trim();
    if (!html) throw new Error('Drop or paste an HTML template into step 1 first.');
    if (new Blob([html]).size > MAX_HTML_BYTES) throw new Error('HTML template exceeds 1.5 MB.');
    const fileName = /\.html?$/i.test(sourceHtmlFileName)
      ? sourceHtmlFileName
      : `${templateNameFromFile(document.getElementById('pdfJourneyTemplateName').value) || 'template'}.html`;
    return {
      fileName,
      mimeType: 'text/html',
      base64: await fileAsBase64(new File([html], fileName, { type: 'text/html' })),
    };
  }

  function parseJourneyTemplateSample() {
    const data = parseData();
    const passenger = data.passenger && typeof data.passenger === 'object' ? data.passenger : {};
    return {
      firstName: String(data.firstName || passenger.firstName || '').trim(),
      lastName: String(data.lastName || passenger.lastName || '').trim(),
      data,
    };
  }

  function renderJourneyTemplateMappings(analysis) {
    journeyTemplateMappings.replaceChildren();
    const mappings = Array.isArray(analysis.suggestedMappings) ? analysis.suggestedMappings : [];
    const sources = Array.isArray(analysis.canonicalSources) ? analysis.canonicalSources : [];
    mappings.forEach((mapping) => {
      const row = document.createElement('div');
      row.className = 'pdf-template-mapping-row';
      row.dataset.target = mapping.target;
      row.dataset.type = mapping.type;
      const target = document.createElement('div');
      target.className = 'pdf-template-mapping-target';
      const name = document.createElement('strong');
      name.textContent = mapping.target;
      const type = document.createElement('span');
      type.textContent = mapping.type === 'image' ? 'Image field' : 'Text field';
      target.append(name, type);
      const select = document.createElement('select');
      select.setAttribute('aria-label', `AJO source for ${mapping.target}`);
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = 'Choose AJO payload field';
      select.appendChild(empty);
      sources.forEach((source) => {
        const option = document.createElement('option');
        option.value = source;
        option.textContent = source;
        option.selected = source === mapping.source;
        select.appendChild(option);
      });
      select.addEventListener('change', () => {
        document.getElementById('pdfUploadJourneyTemplate').disabled = Array.from(
          journeyTemplateMappings.querySelectorAll('select'),
        ).some((item) => !item.value);
      });
      const requiredLabel = document.createElement('label');
      requiredLabel.className = 'pdf-template-mapping-required';
      const required = document.createElement('input');
      required.type = 'checkbox';
      required.checked = mapping.required === true;
      requiredLabel.append(required, document.createTextNode('Required'));
      row.append(target, select, requiredLabel);
      journeyTemplateMappings.appendChild(row);
    });
    journeyTemplateMappingPanel.hidden = false;
    document.getElementById('pdfJourneyTemplateMappingCount').textContent = `${mappings.length} detected`;
    document.getElementById('pdfUploadJourneyTemplate').disabled = mappings.some((mapping) => !mapping.source);
  }

  function collectJourneyTemplateMappings() {
    return Array.from(journeyTemplateMappings.querySelectorAll('.pdf-template-mapping-row')).map((row) => ({
      target: row.dataset.target,
      type: row.dataset.type,
      source: row.querySelector('select').value,
      required: row.querySelector('input[type="checkbox"]').checked,
    }));
  }

  async function analyseJourneyTemplate() {
    const button = document.getElementById('pdfAnalyseJourneyTemplate');
    try {
      parseJourneyTemplateSample();
      button.disabled = true;
      setJourneyTemplateStatus('Inspecting the current workspace template and JSON…');
      const sourceFile = await currentJourneyTemplateSource();
      const { body } = await api('/journey-action/template-analysis', {
        method: 'POST',
        body: JSON.stringify({ sourceFile }),
      });
      journeyTemplateAnalysis = body;
      renderJourneyTemplateMappings(body);
      const unmapped = (body.suggestedMappings || []).filter((mapping) => !mapping.source).length;
      setJourneyTemplateStatus(
        unmapped
          ? `${unmapped} detected field${unmapped === 1 ? '' : 's'} need a mapping before publishing.`
          : `${(body.fields || []).length} fields detected and automatically mapped. Review, then validate and publish.`,
        unmapped ? 'error' : 'success',
      );
    } catch (error) {
      setJourneyTemplateStatus(error.message, 'error');
    } finally {
      button.disabled = false;
    }
  }

  function renderJourneyTemplates(templates) {
    journeyTemplateList.replaceChildren();
    const items = Array.isArray(templates) ? templates : [];
    journeyTemplatesAvailable = items;
    renderTestTemplateOptions();
    document.getElementById('pdfJourneyTemplateCount').textContent = `${items.length} available`;
    const templateSummary = `${items.length} template${items.length === 1 ? '' : 's'}`;
    setStageState(stageTemplateState, templateSummary, items.length ? 'success' : '');
    setStageState(reuseTemplateCount, templateSummary, items.length ? 'success' : '');
    if (!items.length) {
      const empty = document.createElement('p');
      empty.className = 'pdf-key-empty';
      empty.textContent = 'No server templates are available.';
      journeyTemplateList.appendChild(empty);
      return;
    }
    items.forEach((template) => {
      const item = document.createElement('article');
      item.className = 'pdf-template-list-item';
      const details = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = template.templateName || template.name;
      const metadata = document.createElement('span');
      const source = template.source === 'builtin' ? 'Built-in' : (template.sourceFileName || 'Uploaded');
      metadata.textContent = `${template.label || template.templateName} · ${source}${template.size ? ` · ${formatBytes(template.size)}` : ''}`;
      const kind = document.createElement('span');
      kind.className = 'pdf-template-kind';
      kind.textContent = template.kind === 'document' ? 'Document' : 'HTML';
      const validation = document.createElement('span');
      validation.className = 'pdf-template-validation';
      validation.textContent = template.validation
        ? `Published v${template.version || 1} · ${template.validation.pageCount} page${template.validation.pageCount === 1 ? '' : 's'} · ${(template.fieldMappings || []).length} mapped fields`
        : 'Legacy upload · validation required on replacement';
      details.append(name, metadata, kind, validation);
      const actions = document.createElement('div');
      actions.className = 'pdf-template-list-actions';
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'dashboard-btn-outline';
      copy.textContent = 'Copy name';
      copy.addEventListener('click', () => copyText(name.textContent, copy, 'Copy name'));
      actions.appendChild(copy);
      if (template.canDelete) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'dashboard-btn-outline';
        remove.textContent = 'Delete';
        remove.addEventListener('click', () => deleteJourneyTemplate(name.textContent));
        actions.appendChild(remove);
      }
      item.append(details, actions);
      journeyTemplateList.appendChild(item);
    });
  }

  async function loadJourneyTemplates() {
    try {
      setJourneyTemplateStatus('Loading server template library…');
      const { body } = await api('/journey-action/template-library', { method: 'GET' });
      renderJourneyTemplates(body.templates || []);
      setJourneyTemplateStatus(`${body.uploadedCount || 0} uploaded template${body.uploadedCount === 1 ? '' : 's'} plus built-in templates are ready.`);
    } catch (error) {
      setStageState(stageTemplateState, 'Library unavailable', 'error');
      setStageState(reuseTemplateCount, 'Unavailable', 'error');
      setJourneyTemplateStatus(error.message, 'error');
    }
  }

  async function uploadJourneyTemplate() {
    const button = document.getElementById('pdfUploadJourneyTemplate');
    try {
      if (!journeyTemplateAnalysis) throw new Error('Detect and map the template fields before publishing.');
      const samplePayload = parseJourneyTemplateSample();
      const sourceFile = await currentJourneyTemplateSource();
      const fieldMappings = collectJourneyTemplateMappings();
      if (fieldMappings.some((mapping) => !mapping.source)) throw new Error('Every detected template field needs an AJO mapping.');
      const templateName = document.getElementById('pdfJourneyTemplateName').value.trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9-]{2,79}$/.test(templateName)) {
        throw new Error('Template name must contain 3 to 80 lowercase letters, numbers or hyphens.');
      }
      button.disabled = true;
      setJourneyTemplateStatus('Generating the Adobe preview, checking page count, and publishing the version…');
      const { body } = await api('/journey-action/template-library', {
        method: 'POST',
        body: JSON.stringify({
          templateName,
          label: document.getElementById('pdfJourneyTemplateLabel').value.trim(),
          documentName: document.getElementById('pdfJourneyTemplateDocumentName').value.trim(),
          subject: document.getElementById('pdfJourneyTemplateSubject').value.trim(),
          expectedPageCount: Number(document.getElementById('pdfJourneyTemplateExpectedPages').value) || 1,
          samplePayload,
          fieldMappings,
          replace: true,
          sourceFile,
        }),
      });
      const saved = body.template || {};
      setJourneyTemplateStatus(`Published “${saved.templateName || templateName}” v${saved.version || 1}. Adobe validation passed at ${body.validation.pageCount} page${body.validation.pageCount === 1 ? '' : 's'}.`, 'success');
      await loadJourneyTemplates();
    } catch (error) {
      setJourneyTemplateStatus(error.message, 'error');
    } finally {
      button.disabled = false;
    }
  }

  async function deleteJourneyTemplate(templateName) {
    if (!window.confirm(`Delete “${templateName}” from the server template library? New journey executions will no longer be able to use it.`)) return;
    try {
      setJourneyTemplateStatus(`Deleting “${templateName}”…`);
      await api(`/journey-action/template-library?templateName=${encodeURIComponent(templateName)}`, { method: 'DELETE' });
      setJourneyTemplateStatus(`Deleted “${templateName}” from future journey selections.`, 'success');
      await loadJourneyTemplates();
    } catch (error) {
      setJourneyTemplateStatus(error.message, 'error');
    }
  }

  function bindJourneyTemplateLibrary() {
    document.getElementById('pdfUploadJourneyTemplate').addEventListener('click', uploadJourneyTemplate);
    document.getElementById('pdfAnalyseJourneyTemplate').addEventListener('click', analyseJourneyTemplate);
    document.getElementById('pdfRefreshJourneyTemplates').addEventListener('click', loadJourneyTemplates);
    publishDetails.addEventListener('toggle', () => {
      if (publishDetails.open && !document.getElementById('pdfJourneyTemplateName').value.trim()) {
        const sourceName = conversionMode() === 'document'
          ? sourceDocument && sourceDocument.fileName
          : sourceHtmlFileName || templateName.value || 'travel-template.html';
        syncJourneyTemplateDefaults(sourceName || 'travel-template');
      }
    });
  }

  function currentSandbox() {
    if (window.AepGlobalSandbox && typeof window.AepGlobalSandbox.getSandboxName === 'function') {
      return String(window.AepGlobalSandbox.getSandboxName() || '').trim();
    }
    return '';
  }

  function selectedTestTemplate() {
    const name = document.getElementById('pdfTestTemplate').value;
    return journeyTemplatesAvailable.find((template) => (template.templateName || template.name) === name) || null;
  }

  function inputSchemaForTemplate(template) {
    if (!template) return [];
    if (Array.isArray(template.inputSchema) && template.inputSchema.length) return template.inputSchema;
    const seen = new Set();
    return (Array.isArray(template.fieldMappings) ? template.fieldMappings : []).reduce((fields, mapping) => {
      const source = String(mapping && mapping.source || '').trim();
      const name = source === 'carrierCode' ? 'flightNumber' : source === 'flightDate' ? 'departureDateTime' : source;
      if (!name || seen.has(name)) return fields;
      seen.add(name);
      fields.push({
        name,
        label: name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (value) => value.toUpperCase()),
        dataType: mapping.type === 'image' ? 'image' : 'string',
        required: mapping.required === true,
        recipientField: ['firstName', 'lastName', 'passengerName'].includes(name),
        targetFields: [mapping.target],
      });
      return fields;
    }, []);
  }

  function renderTestTemplateOptions() {
    const select = document.getElementById('pdfTestTemplate');
    if (!select) return;
    const previous = select.value;
    select.replaceChildren(new Option('Choose a published template', ''));
    journeyTemplatesAvailable.forEach((template) => {
      const name = template.templateName || template.name;
      const label = `${template.label || name} · ${template.kind === 'document' ? 'DOCX/document' : 'HTML'} · v${template.version || 1}`;
      select.add(new Option(label, name));
    });
    if (previous && journeyTemplatesAvailable.some((template) => (template.templateName || template.name) === previous)) {
      select.value = previous;
    } else if (journeyTemplatesAvailable.length) {
      const uploaded = journeyTemplatesAvailable.find((template) => template.source === 'uploaded');
      select.value = (uploaded || journeyTemplatesAvailable[0]).templateName || (uploaded || journeyTemplatesAvailable[0]).name;
    }
    renderTestDynamicFields();
  }

  function renderTestDynamicFields(values) {
    const template = selectedTestTemplate();
    const container = document.getElementById('pdfTestDynamicFields');
    if (!container) return;
    container.replaceChildren();
    if (!template) {
      container.innerHTML = '<p class="pdf-key-empty">Choose a published template to load its fields.</p>';
      document.getElementById('pdfTestFieldCount').textContent = 'Choose a template';
      return;
    }
    const schema = inputSchemaForTemplate(template).filter((field) => !field.recipientField);
    const defaults = {
      ...(template.sampleData && typeof template.sampleData === 'object' ? template.sampleData : {}),
      ...(values && typeof values === 'object' ? values : {}),
    };
    schema.forEach((field) => {
      const wrapper = document.createElement('div');
      wrapper.className = `pdf-test-field${field.required ? ' is-required' : ''}${field.dataType === 'image' ? ' is-image' : ''}`;
      const label = document.createElement('label');
      const inputId = `pdfTestData_${field.name.replace(/[^A-Za-z0-9_-]/g, '_')}`;
      label.htmlFor = inputId;
      label.textContent = field.label || field.name;
      const input = document.createElement('input');
      input.id = inputId;
      input.dataset.pdfTestField = field.name;
      input.dataset.pdfTestType = field.dataType || 'string';
      input.required = field.required === true;
      input.type = field.dataType === 'decimal' ? 'number' : 'text';
      if (field.dataType === 'decimal') input.step = 'any';
      input.placeholder = field.dataType === 'dateTime'
        ? '2026-08-12T09:15:00+03:00'
        : field.dataType === 'image'
          ? 'https://… or data:image/...;base64,…'
          : '';
      const value = defaults[field.name] == null || defaults[field.name] === ''
        ? field.sampleValue
        : defaults[field.name];
      input.value = value == null ? '' : String(value);
      wrapper.append(label, input);
      if (field.targetFields && field.targetFields.length) {
        const hint = document.createElement('small');
        hint.textContent = `Used by: ${field.targetFields.join(', ')}`;
        wrapper.appendChild(hint);
      }
      container.appendChild(wrapper);
    });
    document.getElementById('pdfTestFieldCount').textContent = `${schema.length} field${schema.length === 1 ? '' : 's'} · ${schema.filter((field) => field.required).length} required`;
    document.getElementById('pdfTestTemplateHint').textContent = `${template.label || template.templateName} · ${template.source === 'builtin' ? 'built-in' : 'server upload'} · version ${template.version || 1}`;
    document.getElementById('pdfTestDocumentName').value = template.documentName || `${template.templateName || template.name}.pdf`;
  }

  function renderTestCampaignOptions() {
    const select = document.getElementById('pdfTestCampaign');
    const previous = select.value;
    select.replaceChildren(new Option('Choose a transactional campaign', ''));
    journeyCampaignsAvailable.forEach((campaign) => {
      select.add(new Option(`${campaign.name} · ${campaign.campaignId}`, campaign.campaignId));
    });
    if (previous && journeyCampaignsAvailable.some((campaign) => campaign.campaignId === previous)) select.value = previous;
    else if (journeyCampaignsAvailable.length) select.value = journeyCampaignsAvailable[0].campaignId;
    syncTestCampaignManager();
  }

  function syncTestCampaignManager() {
    const campaignId = document.getElementById('pdfTestCampaign').value;
    const campaign = journeyCampaignsAvailable.find((item) => item.campaignId === campaignId);
    document.getElementById('pdfTestCampaignName').value = campaign ? campaign.name : '';
    document.getElementById('pdfTestCampaignId').value = campaign ? campaign.campaignId : '';
    document.getElementById('pdfTestCampaignHint').textContent = campaign
      ? `${campaign.name} · current sandbox: ${currentSandbox() || 'default'}`
      : 'Add or select an activated API-triggered email campaign.';
  }

  async function loadJourneyCampaigns() {
    const sandbox = currentSandbox();
    try {
      const query = sandbox ? `?sandbox=${encodeURIComponent(sandbox)}` : '';
      const { body } = await api(`/journey-action/campaigns${query}`, { method: 'GET' });
      journeyCampaignsAvailable = Array.isArray(body.campaigns) ? body.campaigns : [];
      renderTestCampaignOptions();
      document.getElementById('pdfTestCampaignStatus').textContent = `${journeyCampaignsAvailable.length} campaign${journeyCampaignsAvailable.length === 1 ? '' : 's'} available for ${sandbox || 'the default sandbox'}.`;
    } catch (error) {
      journeyCampaignsAvailable = [];
      renderTestCampaignOptions();
      document.getElementById('pdfTestCampaignStatus').textContent = error.message;
    }
  }

  async function persistJourneyCampaigns() {
    const { body } = await api('/journey-action/campaigns', {
      method: 'POST',
      body: JSON.stringify({ sandbox: currentSandbox(), campaigns: journeyCampaignsAvailable }),
    });
    journeyCampaignsAvailable = body.campaigns || [];
    renderTestCampaignOptions();
  }

  async function saveJourneyCampaign() {
    const status = document.getElementById('pdfTestCampaignStatus');
    try {
      const name = document.getElementById('pdfTestCampaignName').value.trim();
      const campaignId = document.getElementById('pdfTestCampaignId').value.trim();
      if (!name) throw new Error('Enter a friendly campaign name.');
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(campaignId)) {
        throw new Error('Campaign ID must be a valid UUID.');
      }
      const existing = journeyCampaignsAvailable.find((item) => item.campaignId === campaignId);
      if (existing) existing.name = name;
      else journeyCampaignsAvailable.push({ name, campaignId });
      await persistJourneyCampaigns();
      document.getElementById('pdfTestCampaign').value = campaignId;
      syncTestCampaignManager();
      status.textContent = `Saved “${name}” for ${currentSandbox() || 'the default sandbox'}.`;
    } catch (error) {
      status.textContent = error.message;
    }
  }

  async function removeJourneyCampaign() {
    const select = document.getElementById('pdfTestCampaign');
    if (!select.value) return;
    journeyCampaignsAvailable = journeyCampaignsAvailable.filter((campaign) => campaign.campaignId !== select.value);
    await persistJourneyCampaigns();
    document.getElementById('pdfTestCampaignStatus').textContent = 'Campaign removed from this dropdown.';
  }

  function currentTestFieldValues() {
    const values = {};
    document.querySelectorAll('[data-pdf-test-field]').forEach((input) => {
      const raw = input.value.trim();
      if (raw === '') return;
      values[input.dataset.pdfTestField] = input.dataset.pdfTestType === 'decimal' ? Number(raw) : raw;
    });
    return values;
  }

  function setStoryAssistStatus(message, kind) {
    const status = document.getElementById('pdfTestStoryStatus');
    status.textContent = message || '';
    status.className = `pdf-story-assist-status${kind ? ` is-${kind}` : ''}`;
  }

  function renderStoryMissingFields(fields) {
    const container = document.getElementById('pdfTestStoryMissing');
    container.replaceChildren();
    const items = Array.isArray(fields) ? fields : [];
    container.hidden = !items.length;
    if (!items.length) return;
    const intro = document.createElement('span');
    intro.textContent = 'Still needed';
    container.appendChild(intro);
    items.forEach((name) => {
      const chip = document.createElement('span');
      chip.textContent = name;
      container.appendChild(chip);
    });
  }

  async function populateTestFieldsWithGemini() {
    const button = document.getElementById('pdfTestStoryGenerate');
    try {
      const template = selectedTestTemplate();
      if (!template) throw new Error('Choose a published template before describing the journey.');
      const story = document.getElementById('pdfTestStory').value.trim();
      if (story.length < 10) throw new Error('Describe the traveller and journey in at least 10 characters.');
      button.disabled = true;
      button.innerHTML = '<span aria-hidden="true">✦</span> Gemini is reading the story…';
      renderStoryMissingFields([]);
      setStoryAssistStatus('Matching the story to the selected template fields…', 'working');
      const { body } = await api('/journey-action/story-assist', {
        method: 'POST',
        body: JSON.stringify({
          sandbox: currentSandbox(),
          templateName: template.templateName || template.name,
          story,
          recipient: {
            emailAddress: document.getElementById('pdfTestEmail').value.trim(),
            firstName: document.getElementById('pdfTestFirstName').value.trim(),
            lastName: document.getElementById('pdfTestLastName').value.trim(),
            documentName: document.getElementById('pdfTestDocumentName').value.trim(),
          },
        }),
      });
      renderTestDynamicFields({ ...currentTestFieldValues(), ...(body.values || {}) });
      const recipient = body.recipient || {};
      if (recipient.emailAddress) document.getElementById('pdfTestEmail').value = recipient.emailAddress;
      if (recipient.firstName) document.getElementById('pdfTestFirstName').value = recipient.firstName;
      if (recipient.lastName) document.getElementById('pdfTestLastName').value = recipient.lastName;
      if (recipient.documentName) document.getElementById('pdfTestDocumentName').value = recipient.documentName;
      renderStoryMissingFields(body.missingFields);
      const filledCount = Object.keys(body.values || {}).length + Object.keys(recipient).length;
      setStoryAssistStatus(`${body.summary} Populated ${filledCount} field${filledCount === 1 ? '' : 's'} with ${body.model || 'Gemini'}. Review them below before sending.`, 'success');
    } catch (error) {
      setStoryAssistStatus(error.message, 'error');
    } finally {
      button.disabled = false;
      button.innerHTML = '<span aria-hidden="true">✦</span> Populate fields with Gemini';
    }
  }

  function clearStoryAssist() {
    const story = document.getElementById('pdfTestStory');
    story.value = '';
    document.getElementById('pdfTestStoryCount').textContent = '0 / 8,000';
    renderStoryMissingFields([]);
    setStoryAssistStatus('');
    story.focus();
  }

  function loadStoryAssistExample() {
    const story = document.getElementById('pdfTestStory');
    story.value = story.defaultValue.trim();
    document.getElementById('pdfTestStoryCount').textContent = `${story.value.length.toLocaleString()} / 8,000`;
    renderStoryMissingFields([]);
    setStoryAssistStatus('Example restored. Edit any detail or populate the fields with Gemini.');
    story.focus();
  }

  function useWorkspaceJsonForTest() {
    try {
      const data = parseData();
      renderTestDynamicFields(data);
      const passenger = data.passenger && typeof data.passenger === 'object' ? data.passenger : {};
      document.getElementById('pdfTestFirstName').value = data.firstName || passenger.firstName || document.getElementById('pdfTestFirstName').value;
      document.getElementById('pdfTestLastName').value = data.lastName || passenger.lastName || document.getElementById('pdfTestLastName').value;
      setJourneyTestStatus('Workspace JSON loaded into the selected template fields.', 'success');
    } catch (error) {
      setJourneyTestStatus(error.message, 'error');
    }
  }

  function journeyTestPayload() {
    const template = selectedTestTemplate();
    const campaignId = document.getElementById('pdfTestCampaign').value;
    if (!template) throw new Error('Choose a published template.');
    if (!campaignId) throw new Error('Choose an AJO transactional campaign.');
    const emailAddress = document.getElementById('pdfTestEmail').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddress)) throw new Error('Enter a valid recipient email address.');
    const data = {};
    document.querySelectorAll('[data-pdf-test-field]').forEach((input) => {
      if (input.required && !input.value.trim()) throw new Error(`${input.previousElementSibling.textContent.replace('*', '').trim()} is required.`);
      if (input.value.trim() !== '') data[input.dataset.pdfTestField] = input.dataset.pdfTestType === 'decimal'
        ? Number(input.value)
        : input.value.trim();
    });
    return {
      requestId: `portal-pdf-${uniqueKey()}`,
      templateName: template.templateName || template.name,
      campaignId,
      emailAddress,
      firstName: document.getElementById('pdfTestFirstName').value.trim(),
      lastName: document.getElementById('pdfTestLastName').value.trim(),
      documentName: document.getElementById('pdfTestDocumentName').value.trim() || template.documentName,
      data,
    };
  }

  function setJourneyTestStatus(message, kind) {
    const status = document.getElementById('pdfTestStatus');
    status.hidden = !message;
    status.textContent = message || '';
    status.className = `pdf-status${kind ? ` is-${kind}` : ''}`;
  }

  function setJourneyTestProgress(state, error) {
    const completeThrough = { queued: -1, processing: 0, stored: 2, sent: 3 }[state] ?? -1;
    const active = { queued: 0, processing: 1, stored: 3 }[state];
    document.querySelectorAll('#pdfTestProgress li').forEach((item, index) => {
      item.classList.toggle('is-complete', index <= completeThrough);
      item.classList.toggle('is-active', !error && active === index);
      item.classList.toggle('is-error', !!error && index === (active == null ? Math.max(0, completeThrough + 1) : active));
    });
    document.getElementById('pdfTestProgressBadge').textContent = error ? 'Failed' : state === 'sent' ? 'Email accepted' : state || 'Ready';
  }

  function showJourneyTestResult(result) {
    document.getElementById('pdfTestResult').hidden = false;
    document.getElementById('pdfTestResultJob').textContent = result.jobId || activeJourneyTestJob;
    document.getElementById('pdfTestResultExecution').textContent = result.ajoExecutionId || 'Pending';
    const pdf = result.pdf;
    document.getElementById('pdfTestResultAttachment').textContent = pdf && pdf.storageLocations && pdf.storageLocations.dlz
      ? pdf.storageLocations.dlz.uri || pdf.storageLocations.dlz.objectPath
      : 'Pending';
    if (pdf) {
      const actions = document.getElementById('pdfTestResultActions');
      actions.hidden = false;
      document.getElementById('pdfTestOpenPdf').href = pdf.previewUrl;
      document.getElementById('pdfTestDownloadPdf').href = pdf.downloadUrl;
    }
  }

  async function pollJourneyTest(jobId) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (attempt) await new Promise((resolve) => window.setTimeout(resolve, 3000));
      const { body } = await api(`/journey-action/test-status/${encodeURIComponent(jobId)}`, { method: 'GET' });
      showJourneyTestResult(body);
      if (body.status === 'sent') return body;
      if (body.status === 'failed') throw new Error(body.error && body.error.message || 'PDF generation or AJO campaign execution failed.');
      setJourneyTestProgress(body.pdfJobId ? 'stored' : body.status === 'queued' ? 'queued' : 'processing');
    }
    throw new Error('The delivery is still processing. Keep the job ID and refresh its status later.');
  }

  async function sendJourneyTest() {
    const button = document.getElementById('pdfTestSend');
    try {
      const payload = journeyTestPayload();
      const campaign = journeyCampaignsAvailable.find((item) => item.campaignId === payload.campaignId);
      if (!window.confirm(`Send “${payload.documentName}” to ${payload.emailAddress} using ${campaign ? campaign.name : payload.campaignId}?`)) return;
      button.disabled = true;
      document.getElementById('pdfTestResult').hidden = true;
      document.getElementById('pdfTestResultActions').hidden = true;
      setJourneyTestProgress('queued');
      setJourneyTestStatus('Request accepted. Generating the personalised PDF and preparing the AJO attachment…', 'working');
      const { body } = await api('/journey-action/test-send', {
        method: 'POST', body: JSON.stringify({ ...payload, sandbox: currentSandbox() }),
      });
      activeJourneyTestJob = body.jobId;
      showJourneyTestResult(body);
      const result = await pollJourneyTest(body.jobId);
      setJourneyTestProgress('sent');
      setJourneyTestStatus(`AJO accepted the campaign execution for ${payload.emailAddress}. Execution ID: ${result.ajoExecutionId}`, 'success');
    } catch (error) {
      setJourneyTestProgress('processing', true);
      setJourneyTestStatus(error.message, 'error');
    } finally {
      button.disabled = false;
    }
  }

  async function copyJourneyTestPayload() {
    try {
      const payload = journeyTestPayload();
      await copyText(JSON.stringify(payload, null, 2), document.getElementById('pdfTestCopyPayload'), 'Copy request JSON');
      setJourneyTestStatus('Fresh request payload copied. A new request ID will be generated again when you send.', 'success');
    } catch (error) {
      setJourneyTestStatus(error.message, 'error');
    }
  }

  function bindJourneyTestSender() {
    document.getElementById('pdfTestTemplate').addEventListener('change', () => {
      renderTestDynamicFields();
      renderStoryMissingFields([]);
      setStoryAssistStatus('Template changed. Gemini will now target this template’s fields.');
    });
    document.getElementById('pdfTestCampaign').addEventListener('change', syncTestCampaignManager);
    document.getElementById('pdfTestSaveCampaign').addEventListener('click', saveJourneyCampaign);
    document.getElementById('pdfTestRemoveCampaign').addEventListener('click', () => removeJourneyCampaign().catch((error) => setJourneyTestStatus(error.message, 'error')));
    document.getElementById('pdfTestUseWorkspaceJson').addEventListener('click', useWorkspaceJsonForTest);
    document.getElementById('pdfTestCopyPayload').addEventListener('click', copyJourneyTestPayload);
    document.getElementById('pdfTestSend').addEventListener('click', sendJourneyTest);
    document.getElementById('pdfTestStoryGenerate').addEventListener('click', populateTestFieldsWithGemini);
    document.getElementById('pdfTestStoryClear').addEventListener('click', clearStoryAssist);
    document.getElementById('pdfTestStoryExample').addEventListener('click', loadStoryAssistExample);
    document.getElementById('pdfTestStory').addEventListener('input', (event) => {
      document.getElementById('pdfTestStoryCount').textContent = `${event.target.value.length.toLocaleString()} / 8,000`;
    });
    const initialStory = document.getElementById('pdfTestStory').value;
    document.getElementById('pdfTestStoryCount').textContent = `${initialStory.length.toLocaleString()} / 8,000`;
    window.addEventListener('aep-global-sandbox-change', () => {
      if (authUser) loadJourneyCampaigns().catch(() => {});
    });
  }

  function loadSample() {
    conversionModeSelect.value = 'html';
    applyConversionMode();
    templateSelect.value = '';
    htmlEditor.disabled = false;
    htmlEditor.value = sampleHtml;
    dataEditor.value = JSON.stringify(sampleData, null, 2);
    syncHtmlEditorHighlight();
    syncJsonEditorHighlight();
    templateName.value = 'Travel booking confirmation v1';
    sourceHtmlFileName = '';
    setStageState(stageSourceState, 'Sample HTML');
    syncJourneyTemplateDefaults('travel-booking-confirmation.html', true);
    document.getElementById('pdfJourneyTemplateSubject').value = 'Your booking confirmation';
    document.getElementById('pdfDocumentName').value = 'booking-confirmation.pdf';
    document.getElementById('pdfIdempotencyKey').value = uniqueKey();
    fileMeta.hidden = true;
    jsonFileMeta.hidden = true;
    resetDropZone(dropZone);
    resetDropZone(jsonDropZone);
    dropZone.setAttribute('aria-disabled', 'false');
    parseData();
    previewEmpty.hidden = false;
    resultPanel.hidden = true;
  }

  function markRequestChanged() {
    document.getElementById('pdfIdempotencyKey').value = uniqueKey();
    resultPanel.hidden = true;
    setStageState(stageOutputState, 'Not generated');
    documentPreviewFrame.removeAttribute('src');
    documentPreviewFrame.hidden = true;
    openPreviewLink.removeAttribute('href');
    openPreviewLink.hidden = true;
    if (conversionMode() === 'document') {
      previewEmpty.hidden = false;
      previewMeta.textContent = 'Direct conversion';
    }
    if (journeyTemplateAnalysis) {
      invalidateJourneyTemplateAnalysis('Template or JSON changed. Detect fields again before publishing.');
    }
  }

  function useUnsavedEditor() {
    if (templateSelect.value) templateSelect.value = '';
    htmlEditor.disabled = false;
    dropZone.setAttribute('aria-disabled', 'false');
    syncHtmlEditorHighlight();
    markRequestChanged();
  }

  async function readHtmlFile(file) {
    if (!file) return;
    if (!/\.html?$/i.test(file.name) && file.type !== 'text/html') throw new Error('Choose an .html or .htm file.');
    if (file.size > MAX_HTML_BYTES) throw new Error('HTML file exceeds 1.5 MB.');
    htmlEditor.value = await file.text();
    htmlEditorDetails.open = true;
    sourceHtmlFileName = file.name;
    setStageState(stageSourceState, file.name, 'success');
    templateName.value = file.name.replace(/\.html?$/i, '');
    syncJourneyTemplateDefaults(file.name, true);
    setDropZoneLoaded(dropZone, file.name, file.size, 'HTML');
    fileMeta.hidden = true;
    useUnsavedEditor();
    setStatus('HTML loaded. Add or paste its JSON, then preview, generate, or publish this same workspace template.', 'success');
  }

  async function readDataFile(file) {
    if (!file) return;
    const docx = /\.docx$/i.test(file.name);
    const json = /\.json$/i.test(file.name) || file.type === 'application/json';
    if (!docx && !json) throw new Error('Choose a .json or .docx data file.');
    if (docx) {
      if (file.size > MAX_DOCUMENT_BYTES) throw new Error('Word data document exceeds 10 MB.');
      setBusy(true);
      setStatus('Extracting JSON data from the Word document...', 'working');
      try {
        const { body } = await api('/convert-data-document', {
          method: 'POST',
          body: JSON.stringify({
            sourceDocument: {
              fileName: file.name,
              mimeType: file.type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
              base64: await fileAsBase64(file),
            },
          }),
        });
        dataEditor.value = JSON.stringify(body.data || {}, null, 2);
        jsonEditorDetails.open = true;
        syncJsonEditorHighlight();
        parseData();
        setDropZoneLoaded(jsonDropZone, file.name, file.size, 'DOCX → JSON');
        jsonFileMeta.hidden = true;
        if (conversionMode() === 'document') updateDocumentOperation();
        markRequestChanged();
        setStatus(`Converted “${file.name}” into editable JSON with ${body.fieldCount || 0} top-level fields.`, 'success');
        return;
      } finally {
        setBusy(false);
      }
    }
    const maxBytes = conversionMode() === 'document' ? MAX_DOCUMENT_DATA_BYTES : MAX_HTML_DATA_BYTES;
    if (file.size > maxBytes) {
      throw new Error(`JSON file exceeds ${conversionMode() === 'document' ? '8 MB' : '1.5 MB'}.`);
    }
    dataEditor.value = await file.text();
    const data = parseData();
    dataEditor.value = JSON.stringify(data, null, 2);
    jsonEditorDetails.open = true;
    syncJsonEditorHighlight();
    setDropZoneLoaded(jsonDropZone, file.name, file.size, 'JSON');
    jsonFileMeta.hidden = true;
    if (conversionMode() === 'document') updateDocumentOperation();
    markRequestChanged();
    setStatus('JSON payload loaded. Preview, generate, or publish using this same payload.', 'success');
  }

  function fileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('The document could not be read.'));
      reader.onload = () => {
        const value = String(reader.result || '');
        const comma = value.indexOf(',');
        if (comma < 0) reject(new Error('The document could not be encoded.'));
        else resolve(value.slice(comma + 1));
      };
      reader.readAsDataURL(file);
    });
  }

  async function readDocumentFile(file) {
    if (!file) return;
    const extension = String(file.name.split('.').pop() || '').toLowerCase();
    if (!supportedDocumentExtensions.has(extension)) {
      throw new Error('Unsupported document type. Use Word, PowerPoint, Excel, RTF, TXT, JPEG, PNG, BMP, GIF or TIFF.');
    }
    if (file.size > MAX_DOCUMENT_BYTES) throw new Error('Source document exceeds 10 MB.');
    sourceDocument = {
      fileName: file.name,
      mimeType: file.type || '',
      base64: await fileAsBase64(file),
    };
    setStageState(stageSourceState, file.name, 'success');
    syncJourneyTemplateDefaults(file.name, true);
    const documentMerge = extension === 'docx' && Object.keys(parseData()).length > 0;
    updateDocumentOperation();
    setDropZoneLoaded(documentDropZone, file.name, file.size, extension.toUpperCase());
    documentFileMeta.hidden = true;
    document.getElementById('pdfDocumentName').value = file.name.replace(/\.[^.]+$/, '.pdf');
    markRequestChanged();
    setStatus(
      documentMerge
        ? 'DOCX template loaded. Its tags will be merged with the JSON payload before Adobe returns the PDF.'
        : 'Source document loaded. Add JSON for a DOCX template merge, or convert the file directly.',
      'success',
    );
  }

  function applyConversionMode() {
    const documentMode = conversionMode() === 'document';
    setStageState(stageModeState, documentMode ? 'Document to PDF' : 'HTML to PDF', 'success');
    setStageState(
      stageSourceState,
      documentMode
        ? (sourceDocument ? sourceDocument.fileName : 'Add document')
        : (sourceHtmlFileName || 'Sample HTML'),
      documentMode && !sourceDocument ? '' : 'success',
    );
    document.getElementById('pdfHtmlModePanel').hidden = documentMode;
    document.getElementById('pdfDocumentModePanel').hidden = !documentMode;
    document.getElementById('pdfPersonalisationFields').hidden = false;
    document.querySelectorAll('.pdf-html-option').forEach((element) => { element.hidden = documentMode; });
    document.getElementById('pdfJsonState').hidden = false;
    previewButton.hidden = documentMode;
    previewFrame.hidden = documentMode;
    documentPreviewFrame.removeAttribute('src');
    documentPreviewFrame.hidden = true;
    openPreviewLink.hidden = true;
    previewEmpty.hidden = false;
    previewMeta.textContent = documentMode ? 'Document generation' : 'Not rendered';
    document.getElementById('pdfDataHeading').textContent = 'Personalisation and output';
    document.getElementById('pdfPreviewHeading').textContent = 'Preview and output';
    generateButton.textContent = documentMode ? 'Generate, preview and store PDF' : 'Generate and store PDF';
    document.getElementById('pdfModeHelp').textContent = documentMode
      ? 'DOCX plus JSON uses Adobe Document Generation. Empty JSON, or another supported file, uses direct Create PDF.'
      : 'Renders escaped Handlebars data into HTML, then submits a ZIP containing index.html.';
    document.getElementById('pdfPreviewEmptyTitle').textContent = documentMode
      ? 'Your personalised or converted PDF will appear here'
      : 'Your rendered HTML will appear here';
    document.getElementById('pdfPreviewEmptyText').textContent = documentMode
      ? 'Adobe returns the personalised or directly converted PDF, which is then stored privately.'
      : 'Preview uses the same server-side merge that runs before Adobe PDF Services.';
    document.getElementById('pdfFlowValidate').textContent = documentMode
      ? 'Authorised user, supported type, bounded file and JSON'
      : 'Authorised user, static HTML, bounded JSON';
    document.getElementById('pdfFlowPrepareTitle').textContent = 'Merge';
    document.getElementById('pdfFlowPrepare').textContent = documentMode
      ? 'DOCX tags receive text and image data from JSON'
      : 'Handlebars data into escaped HTML';
    document.getElementById('pdfFlowConvert').textContent = documentMode
      ? 'DocumentMergeJob or CreatePDFJob → PDF'
      : 'ZIP index.html → HTMLToPDFJob';
    resultPanel.hidden = true;
    document.getElementById('pdfDataHelp').textContent = documentMode
      ? 'For DOCX templates, keys match Word tags such as {{PassengerName}}. Image placeholders accept HTTPS URLs or data:image/...;base64 values. Use {} for direct conversion.'
      : 'HTML mode uses values beneath data in Handlebars expressions.';
    const jsonDropHelp = documentMode
      ? 'JSON up to 8 MB or DOCX up to 10 MB · extracted data remains editable'
      : 'JSON up to 1.5 MB or DOCX up to 10 MB · extracted data remains editable';
    jsonDropZone.dataset.emptyDescription = jsonDropHelp;
    if (!jsonDropZone.classList.contains('is-loaded')) {
      document.getElementById('pdfJsonDropHelp').textContent = jsonDropHelp;
    }
    updateDocumentOperation();
    markRequestChanged();
  }

  async function loadTemplates(selectId) {
    try {
      const { body } = await api('/templates', { method: 'GET' });
      const current = selectId || templateSelect.value;
      templateSelect.replaceChildren(new Option('Current workspace', ''));
      (body.templates || []).forEach((item) => {
        const label = `${item.name} · HTML ${formatBytes(item.size)} · JSON ${formatBytes(item.dataSize)}`;
        templateSelect.add(new Option(label, item.templateId));
      });
      if (current && Array.from(templateSelect.options).some((option) => option.value === current)) {
        templateSelect.value = current;
        htmlEditor.disabled = true;
      }
    } catch (error) {
      setStatus(error.message, 'error');
    }
  }

  async function loadSelectedTemplate() {
    const templateId = templateSelect.value.trim();
    if (!templateId) {
      htmlEditor.disabled = false;
      dropZone.setAttribute('aria-disabled', 'false');
      markRequestChanged();
      setStatus('Using the editable HTML and JSON currently in the workspace.', 'success');
      return;
    }
    try {
      setBusy(true);
      setStatus('Loading the saved HTML and JSON draft...', 'working');
      const { body } = await api(`/templates/${encodeURIComponent(templateId)}`, { method: 'GET' });
      htmlEditor.value = body.htmlTemplate || '';
      dataEditor.value = JSON.stringify(body.defaultData || {}, null, 2);
      syncHtmlEditorHighlight();
      syncJsonEditorHighlight();
      templateName.value = body.name || '';
      sourceHtmlFileName = body.sourceFileName || '';
      setStageState(stageSourceState, sourceHtmlFileName || body.name || 'Saved HTML', 'success');
      syncJourneyTemplateDefaults(sourceHtmlFileName || `${body.name || 'travel-template'}.html`, true);
      htmlEditor.disabled = true;
      dropZone.setAttribute('aria-disabled', 'true');
      setDropZoneLoaded(
        dropZone,
        sourceHtmlFileName || body.name || 'Saved HTML template',
        body.size,
        'HTML',
        'Loaded from repository',
      );
      setDropZoneLoaded(
        jsonDropZone,
        `${body.name || 'Saved template'} default.json`,
        body.dataSize,
        'JSON',
        'Loaded from repository',
      );
      fileMeta.hidden = true;
      jsonFileMeta.hidden = true;
      parseData();
      markRequestChanged();
      setStatus(`Loaded “${body.name}” with its default JSON. You can edit the JSON for this recipient before previewing or generating.`, 'success');
    } catch (error) {
      templateSelect.value = '';
      htmlEditor.disabled = false;
      dropZone.setAttribute('aria-disabled', 'false');
      setStatus(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function saveTemplate() {
    try {
      if (!htmlEditor.value.trim()) throw new Error('Add HTML before saving a template.');
      setBusy(true);
      const defaultData = parseData();
      setStatus('Saving the HTML and JSON as a private draft...', 'working');
      const { body } = await api('/templates', {
        method: 'POST',
        body: JSON.stringify({
          name: templateName.value,
          htmlTemplate: htmlEditor.value,
          defaultData,
          sourceFileName: sourceHtmlFileName,
        }),
      });
      await loadTemplates(body.templateId);
      htmlEditor.disabled = true;
      dropZone.setAttribute('aria-disabled', 'true');
      markRequestChanged();
      setStatus(`Saved “${body.name}” with its default JSON. Selecting templateId ${body.templateId} will restore the pair.`, 'success');
    } catch (error) {
      setStatus(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function renderPreview() {
    try {
      if (conversionMode() === 'document') throw new Error('Document conversion does not have an HTML preview. Generate the PDF to inspect it.');
      setBusy(true);
      setStatus('Rendering the personalisation data into static HTML...', 'working');
      const { body } = await api('/preview', {
        method: 'POST',
        body: JSON.stringify(requestPayload(false)),
      });
      previewFrame.srcdoc = body.renderedHtml;
      previewEmpty.hidden = true;
      previewMeta.textContent = `${formatBytes(body.renderedBytes)} rendered`;
      setStatus('Preview rendered. This is the HTML that will be zipped and sent to Adobe PDF Services.', 'success');
      return body;
    } catch (error) {
      setStatus(error.message, 'error');
      throw error;
    } finally {
      setBusy(false);
    }
  }

  async function pollJob(jobId) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 3000));
      const result = await api(`/status/${encodeURIComponent(jobId)}`, { method: 'GET' }, true);
      if (result.body.status === 'ready') return result.body;
    }
    throw new Error('PDF generation is still running. Use the job ID to check status later.');
  }

  function showResult(result) {
    lastResult = result;
    setStageState(stageOutputState, 'PDF ready', 'success');
    resultPanel.hidden = false;
    document.getElementById('pdfResultSize').textContent = formatBytes(result.size);
    document.getElementById('pdfResultJob').textContent = result.jobId;
    const locations = result.storageLocations || {};
    document.getElementById('pdfResultStorage').textContent = locations.dlz
      ? 'AJO attachment DLZ primary · S3 and Google Cloud backups'
      : result.storageProvider === 's3'
        ? `Amazon S3 · ${result.storageUri || 'private object'}`
        : 'Google Cloud Storage';
    const showLocation = (name, valueId, linkId) => {
      const location = locations[name];
      const value = document.getElementById(valueId);
      const link = document.getElementById(linkId);
      value.textContent = location && (location.uri || location.objectPath) || 'Not stored';
      value.title = value.textContent;
      if (location && location.downloadUrl) {
        link.href = location.downloadUrl;
        link.hidden = false;
      } else {
        link.removeAttribute('href');
        link.hidden = true;
      }
    };
    showLocation('dlz', 'pdfResultDlz', 'pdfDlzDownloadLink');
    showLocation('s3', 'pdfResultS3', 'pdfS3DownloadLink');
    showLocation('gcs', 'pdfResultGcs', 'pdfGcsDownloadLink');
    document.getElementById('pdfResultExpiry').textContent = new Date(result.expiresAt).toLocaleString();
    document.getElementById('pdfResultHash').textContent = result.sha256;
    document.getElementById('pdfDownloadLink').href = result.downloadUrl;
    const documentResult = result.conversionMode === 'document' && result.previewUrl;
    if (documentResult) {
      documentPreviewFrame.src = result.previewUrl;
      documentPreviewFrame.hidden = false;
      previewFrame.hidden = true;
      previewEmpty.hidden = true;
      previewMeta.textContent = `${formatBytes(result.size)} PDF preview`;
      openPreviewLink.href = result.previewUrl;
      openPreviewLink.hidden = false;
    } else {
      documentPreviewFrame.removeAttribute('src');
      documentPreviewFrame.hidden = true;
      openPreviewLink.removeAttribute('href');
      openPreviewLink.hidden = true;
    }
    const handoff = {
      status: result.status,
      jobId: result.jobId,
      conversionMode: result.conversionMode,
      documentOperation: result.documentOperation,
      sourceName: result.sourceName,
      templateId: result.templateId,
      expiresAt: result.expiresAt,
      ...result.ajoHandoff,
    };
    handoffJson.textContent = JSON.stringify(handoff, null, 2);
    (documentResult ? documentPreviewFrame : resultPanel).scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    });
  }

  async function generatePdf() {
    try {
      setBusy(true);
      setStageState(stageOutputState, 'Generating…');
      setStatus(
        conversionMode() === 'document'
          ? 'Merging DOCX data or converting the source document with Adobe PDF Services. This can take up to a minute...'
          : 'Generating the PDF with Adobe HTMLToPDFJob. This can take up to a minute...',
        'working',
      );
      const response = await api('/generate', {
        method: 'POST',
        body: JSON.stringify(requestPayload(true)),
      }, true);
      const result = response.status === 202 ? await pollJob(response.body.jobId) : response.body;
      showResult(result);
      setStatus(
        result.reused
          ? 'Existing idempotent PDF returned.'
          : conversionMode() === 'document'
            ? 'Document generated in Adobe DLZ with S3 and Google Cloud backups. The PDF preview is ready.'
            : 'PDF converted into Adobe DLZ with S3 and Google Cloud backups.',
        'success',
      );
    } catch (error) {
      setStageState(stageOutputState, 'Generation failed', 'error');
      setStatus(error.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function copyHandoff() {
    if (!lastResult) return;
    try {
      await navigator.clipboard.writeText(handoffJson.textContent);
      setStatus('AJO handoff JSON copied to the clipboard.', 'success');
    } catch (_error) {
      setStatus('Copy was blocked by the browser. Expand the handoff JSON and copy it manually.', 'error');
    }
  }

  function bindFileDrop() {
    dropZone.addEventListener('click', () => htmlFile.click());
    dropZone.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        htmlFile.click();
      }
    });
    htmlFile.addEventListener('change', () => {
      readHtmlFile(htmlFile.files && htmlFile.files[0]).catch((error) => setStatus(error.message, 'error'));
    });
    ['dragenter', 'dragover'].forEach((name) => dropZone.addEventListener(name, (event) => {
      event.preventDefault();
      dropZone.classList.add('is-dragging');
    }));
    ['dragleave', 'drop'].forEach((name) => dropZone.addEventListener(name, (event) => {
      event.preventDefault();
      dropZone.classList.remove('is-dragging');
    }));
    dropZone.addEventListener('drop', (event) => {
      readHtmlFile(event.dataTransfer && event.dataTransfer.files[0]).catch((error) => setStatus(error.message, 'error'));
    });

    jsonDropZone.addEventListener('click', () => jsonFile.click());
    jsonDropZone.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        jsonFile.click();
      }
    });
    jsonFile.addEventListener('change', () => {
      readDataFile(jsonFile.files && jsonFile.files[0]).catch((error) => setStatus(error.message, 'error'));
    });
    ['dragenter', 'dragover'].forEach((name) => jsonDropZone.addEventListener(name, (event) => {
      event.preventDefault();
      jsonDropZone.classList.add('is-dragging');
    }));
    ['dragleave', 'drop'].forEach((name) => jsonDropZone.addEventListener(name, (event) => {
      event.preventDefault();
      jsonDropZone.classList.remove('is-dragging');
    }));
    jsonDropZone.addEventListener('drop', (event) => {
      readDataFile(event.dataTransfer && event.dataTransfer.files[0]).catch((error) => setStatus(error.message, 'error'));
    });

    documentDropZone.addEventListener('click', () => documentFile.click());
    documentDropZone.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        documentFile.click();
      }
    });
    documentFile.addEventListener('change', () => {
      readDocumentFile(documentFile.files && documentFile.files[0]).catch((error) => setStatus(error.message, 'error'));
    });
    ['dragenter', 'dragover'].forEach((name) => documentDropZone.addEventListener(name, (event) => {
      event.preventDefault();
      documentDropZone.classList.add('is-dragging');
    }));
    ['dragleave', 'drop'].forEach((name) => documentDropZone.addEventListener(name, (event) => {
      event.preventDefault();
      documentDropZone.classList.remove('is-dragging');
    }));
    documentDropZone.addEventListener('drop', (event) => {
      readDocumentFile(event.dataTransfer && event.dataTransfer.files[0]).catch((error) => setStatus(error.message, 'error'));
    });
  }

  function waitForAuth() {
    return new Promise((resolve) => {
      let completed = false;
      const finish = (user) => {
        if (completed) return;
        completed = true;
        resolve(user || null);
      };
      const started = Date.now();
      const findAuth = () => {
        try {
          if (window.firebase && typeof firebase.auth === 'function') {
            const auth = firebase.auth();
            if (auth.currentUser) { finish(auth.currentUser); return; }
            const unsubscribe = auth.onAuthStateChanged((user) => {
              if (user) { unsubscribe(); finish(user); }
            });
            window.setTimeout(() => { unsubscribe(); finish(auth.currentUser); }, 7000);
            return;
          }
        } catch (_error) {}
        if (Date.now() - started > 7000) { finish(null); return; }
        window.setTimeout(findAuth, 100);
      };
      findAuth();
    });
  }

  async function init() {
    bindStageNavigation();
    bindCodeEditors();
    loadSample();
    bindFileDrop();
    bindCustomActionSetup();
    bindJourneyTemplateLibrary();
    bindJourneyTestSender();
    conversionModeSelect.addEventListener('change', applyConversionMode);
    htmlEditor.addEventListener('input', useUnsavedEditor);
    dataEditor.addEventListener('input', () => {
      jsonFileMeta.hidden = true;
      syncJsonEditorHighlight();
      try { parseData(); } catch (_error) {}
      if (conversionMode() === 'document') updateDocumentOperation();
      markRequestChanged();
    });
    ['pdfDocumentName', 'pdfPagePreset', 'pdfLocale', 'pdfTimeZone', 'pdfHeaderFooter'].forEach((id) => {
      document.getElementById(id).addEventListener('change', markRequestChanged);
    });
    templateSelect.addEventListener('change', () => { loadSelectedTemplate().catch(() => {}); });
    document.getElementById('pdfLoadSample').addEventListener('click', loadSample);
    document.getElementById('pdfRefreshTemplates').addEventListener('click', () => loadTemplates());
    document.getElementById('pdfSaveTemplate').addEventListener('click', saveTemplate);
    beautifyJsonButton.addEventListener('click', beautifyJson);
    previewButton.addEventListener('click', () => { renderPreview().catch(() => {}); });
    generateButton.addEventListener('click', generatePdf);
    document.getElementById('pdfCopyHandoff').addEventListener('click', copyHandoff);

    authUser = await waitForAuth();
    if (authUser && !authUser.isAnonymous && authUser.email) {
      setAuthState(authUser.email, 'ready');
      await Promise.all([loadTemplates(), loadApiKeys(), loadJourneyTemplates(), loadJourneyCampaigns()]);
    } else {
      setAuthState('Authorised sign-in required', 'error');
      setStatus('Sign in to the AEP Orchestration Lab with apalmer@adobe.com before saving templates or generating PDFs.', 'error');
    }
  }

  void init();
})();
