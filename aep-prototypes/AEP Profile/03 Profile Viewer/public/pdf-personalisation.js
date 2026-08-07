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
      <h1>Your booking is confirmed, {{data.passenger.firstName}}</h1>
      <p class="lead">Your personalised itinerary and ticket details are below.</p>
      {{#each data.flightDetails}}
      <div class="flight">
        <div class="airport"><span class="code">{{departureAirport}}</span>{{formatDateTime departureDateTime}}</div>
        <div class="route">{{flightNumber}} →</div>
        <div class="airport"><span class="code">{{arrivalAirport}}</span>{{formatDateTime arrivalDateTime}}</div>
      </div>
      {{/each}}
      <div class="meta">
        <div><span>Passenger</span><strong>{{data.passenger.firstName}} {{data.passenger.lastName}}</strong></div>
        <div><span>Ticket</span><strong>{{data.ticketNumber}}</strong></div>
        <div><span>Total paid</span><strong>{{formatCurrency data.fareDetails.totalPaid data.fareDetails.currency}}</strong></div>
      </div>
    </section>
    <footer class="footer">Generated securely for this recipient · Do not forward if it contains personal information.</footer>
  </article>
</body>
</html>`;

  const sampleData = {
    bookingReference: 'EK8F2Q',
    ticketNumber: '1761234567890',
    passenger: { firstName: 'Amelia', lastName: 'Palmer' },
    flightDetails: [{
      flightNumber: 'EK 001',
      departureAirport: 'DXB',
      arrivalAirport: 'LHR',
      departureDateTime: '2026-08-12T07:45:00Z',
      arrivalDateTime: '2026-08-12T15:10:00Z',
    }],
    fareDetails: { totalPaid: 1280.5, currency: 'GBP' },
  };

  const htmlEditor = document.getElementById('pdfHtmlEditor');
  const dataEditor = document.getElementById('pdfDataEditor');
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
  const previewButton = document.getElementById('pdfPreviewButton');
  const generateButton = document.getElementById('pdfGenerateButton');
  const previewFrame = document.getElementById('pdfPreviewFrame');
  const documentPreviewFrame = document.getElementById('pdfDocumentPreviewFrame');
  const previewEmpty = document.getElementById('pdfPreviewEmpty');
  const previewMeta = document.getElementById('pdfPreviewMeta');
  const resultPanel = document.getElementById('pdfResultPanel');
  const openPreviewLink = document.getElementById('pdfOpenPreviewLink');
  const handoffJson = document.getElementById('pdfHandoffJson');
  let authUser = null;
  let lastResult = null;
  let sourceDocument = null;
  let sourceHtmlFileName = '';

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
  }

  function setBusy(busy) {
    previewButton.disabled = busy;
    generateButton.disabled = busy;
    document.getElementById('pdfSaveTemplate').disabled = busy;
    beautifyJsonButton.disabled = busy;
  }

  function setAuthState(message, kind) {
    authState.textContent = message;
    authState.className = `pdf-auth-state${kind ? ` is-${kind}` : ''}`;
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
      return value;
    } catch (error) {
      jsonState.textContent = 'Invalid JSON';
      jsonState.classList.add('is-error');
      throw new Error(`Personalisation data is invalid: ${error.message}`);
    }
  }

  function beautifyJson() {
    try {
      const data = parseData();
      dataEditor.value = JSON.stringify(data, null, 2);
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

  function loadSample() {
    conversionModeSelect.value = 'html';
    applyConversionMode();
    templateSelect.value = '';
    htmlEditor.disabled = false;
    htmlEditor.value = sampleHtml;
    dataEditor.value = JSON.stringify(sampleData, null, 2);
    templateName.value = 'Travel booking confirmation v1';
    sourceHtmlFileName = '';
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
    documentPreviewFrame.removeAttribute('src');
    documentPreviewFrame.hidden = true;
    openPreviewLink.removeAttribute('href');
    openPreviewLink.hidden = true;
    if (conversionMode() === 'document') {
      previewEmpty.hidden = false;
      previewMeta.textContent = 'Direct conversion';
    }
  }

  function useUnsavedEditor() {
    if (templateSelect.value) templateSelect.value = '';
    htmlEditor.disabled = false;
    dropZone.setAttribute('aria-disabled', 'false');
    markRequestChanged();
  }

  async function readHtmlFile(file) {
    if (!file) return;
    if (!/\.html?$/i.test(file.name) && file.type !== 'text/html') throw new Error('Choose an .html or .htm file.');
    if (file.size > MAX_HTML_BYTES) throw new Error('HTML file exceeds 1.5 MB.');
    htmlEditor.value = await file.text();
    sourceHtmlFileName = file.name;
    templateName.value = file.name.replace(/\.html?$/i, '');
    setDropZoneLoaded(dropZone, file.name, file.size, 'HTML');
    fileMeta.hidden = true;
    useUnsavedEditor();
    setStatus('HTML file loaded. Add or paste its JSON, then choose Save HTML + JSON to keep the pair in the repository.', 'success');
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
    setDropZoneLoaded(jsonDropZone, file.name, file.size, 'JSON');
    jsonFileMeta.hidden = true;
    if (conversionMode() === 'document') updateDocumentOperation();
    markRequestChanged();
    setStatus('JSON payload loaded. Preview or generate now, or use Save HTML + JSON to keep the pair in the repository.', 'success');
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
    document.getElementById('pdfPreviewHeading').textContent = documentMode ? 'Generate and store' : 'Preview and generate';
    generateButton.textContent = documentMode ? 'Generate document PDF' : 'Generate PDF';
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
      templateSelect.replaceChildren(new Option('Unsaved HTML + JSON in editor', ''));
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
      setStatus('Loading HTML and default JSON from the private template repository...', 'working');
      const { body } = await api(`/templates/${encodeURIComponent(templateId)}`, { method: 'GET' });
      htmlEditor.value = body.htmlTemplate || '';
      dataEditor.value = JSON.stringify(body.defaultData || {}, null, 2);
      templateName.value = body.name || '';
      sourceHtmlFileName = body.sourceFileName || '';
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
      setStatus('Saving the HTML and default JSON in the private repository...', 'working');
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
    resultPanel.hidden = false;
    document.getElementById('pdfResultSize').textContent = formatBytes(result.size);
    document.getElementById('pdfResultJob').textContent = result.jobId;
    document.getElementById('pdfResultStorage').textContent = result.storageProvider === 's3'
      ? `Amazon S3 · ${result.storageUri || 'private object'}`
      : 'Google Cloud Storage';
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
            ? 'Document generated and stored privately. The PDF preview is ready.'
            : 'PDF converted and stored privately.',
        'success',
      );
    } catch (error) {
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
    loadSample();
    bindFileDrop();
    conversionModeSelect.addEventListener('change', applyConversionMode);
    htmlEditor.addEventListener('input', useUnsavedEditor);
    dataEditor.addEventListener('input', () => {
      jsonFileMeta.hidden = true;
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
      await loadTemplates();
    } else {
      setAuthState('Authorised sign-in required', 'error');
      setStatus('Sign in to the AEP Orchestration Lab with apalmer@adobe.com before saving templates or generating PDFs.', 'error');
    }
  }

  void init();
})();
