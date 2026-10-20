/* Cloud packages use the verified-principal API; legacy ZIP/library tools stay independent. */
(function () {
  'use strict';
  const byId = (id) => document.getElementById(id);
  const root = byId('imageHostingCustomers');
  if (!root) return;
  const state = {
    sandbox: '', items: new Map(), revisions: new Map(), configuration: [],
    scopes: new Map(), cursor: null, inspected: false, busy: false, pending: null, preview: null
  };
  const dialog = byId('customerPreviewDialog');
  const text = (tag, value, className) => {
    const node = document.createElement(tag);
    node.textContent = value == null ? '' : String(value);
    if (className) node.className = className;
    return node;
  };
  const sandboxName = () => window.AepGlobalSandbox?.getSandboxName() || '';
  const storageKey = () => 'aepCustomerOperation:' + state.sandbox;
  const name = (id) => byId(id).value.trim();
  function report(message, error = false) {
    byId('customerStatus').textContent = message;
    byId('customerStatus').dataset.error = String(error);
    if (dialog.open) {
      byId('customerPreviewStatus').textContent = message;
      byId('customerPreviewStatus').dataset.error = String(error);
    }
  }
  function remember(pending) {
    state.pending = pending;
    try {
      if (pending) sessionStorage.setItem(storageKey(), JSON.stringify(pending));
      else sessionStorage.removeItem(storageKey());
    } catch (_) {
      report('Operation tracking could not be saved in this browser. Keep this page open and retain the operation ID.', true);
    }
  }
  async function api(action, payload = {}) {
    if (!state.sandbox || state.sandbox !== sandboxName()) throw new Error('Sandbox changed. Inspect the current sandbox again.');
    const headers = new Headers(await window.AepLabSandboxSync?.getAuthHeaders());
    if (!headers.get('Authorization')) throw new Error('Sign in to the lab before using cloud customer packages.');
    headers.set('Content-Type', 'application/json');
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 90000);
    let response;
    let result;
    try {
      response = await fetch('/api/lab/demo-assets', {
        method: 'POST', headers, signal: controller.signal,
        body: JSON.stringify({ ...payload, action, sandbox: state.sandbox })
      });
      try { result = await response.json(); } catch (_) {
        const error = new Error('The server returned an unreadable response (HTTP ' + response.status + '). Check operation status before trying again.');
        error.status = response.status;
        throw error;
      }
    } catch (error) {
      if (controller.signal.aborted) throw new Error('Request timed out. No automatic retry was made. Check operation status if you submitted changes.');
      throw error;
    } finally { window.clearTimeout(timeout); }
    const operationStatus = ['customer-status', 'customer-recover'].includes(action) && typeof result.status === 'string';
    if (!response.ok || (result.ok === false && !operationStatus)) {
      const detail = typeof result.error === 'string' ? result.error : result.error?.message;
      const error = new Error((result.code ? result.code + ': ' : '') + (detail || 'Request failed (HTTP ' + response.status + ').') +
        (result.operationId ? ' Operation: ' + result.operationId : ''));
      error.operationId = result.operationId;
      error.status = response.status;
      throw error;
    }
    return result;
  }
  function eligible() {
    return state.inspected && byId('customerClassification').checked &&
      [...state.scopes.values()].includes('customer') &&
      [...state.items.keys()].every((path) => ['customer', 'shared'].includes(state.scopes.get(path)));
  }
  function controls() {
    byId('customerControls').disabled = state.busy;
    root.setAttribute('aria-busy', String(state.busy));
    const allowed = eligible() && !state.pending;
    byId('customerSave').disabled = !allowed;
    byId('customerPreparePreview').disabled = !allowed;
    root.querySelectorAll('[data-restore]').forEach((button) => { button.disabled = !allowed; });
    byId('customerMore').hidden = !state.cursor;
    byId('customerCheckStatus').hidden = !state.pending;
    byId('customerPreviewCheckStatus').hidden = !state.pending;
    byId('customerPreviewCheckStatus').disabled = state.busy;
    byId('customerPreviewCancel').textContent = state.pending ? 'Close — keep tracking operation' : 'Cancel';
    byId('customerRecover').hidden = !state.pending?.operationId;
    byId('customerApply').disabled = state.busy || !state.preview || !!state.pending ||
      !!state.preview?.imageFailed || state.preview?.imagesPending > 0 || !byId('customerPreviewConfirm').checked;
    byId('customerPreviewCancel').disabled = state.busy;
  }
  async function run(work) {
    if (state.busy) return;
    state.busy = true;
    controls();
    try { await work(); } catch (error) {
      if (error.operationId) remember({ ...state.pending, operationId: error.operationId });
      report(error.message || String(error), true);
    } finally { state.busy = false; controls(); }
  }
  function classification() {
    if (!eligible()) throw new Error('Classify every inventory path, select at least one customer file and confirm your review first.');
    return {
      customer_paths: [...state.items.keys()].filter((path) => state.scopes.get(path) === 'customer'),
      shared_paths: [...state.items.keys()].filter((path) => state.scopes.get(path) === 'shared')
    };
  }
  function requiredName(id) {
    const value = name(id);
    if (!value) { byId(id).focus(); throw new Error('Enter a customer name. Spaces are supported.'); }
    return value;
  }
  function renderInventory() {
    const container = byId('customerInventory');
    container.replaceChildren();
    state.items.forEach((item, path) => {
      const label = text('label', '', 'image-hosting-customer-check');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = state.scopes.get(path) === 'customer';
      input.indeterminate = state.scopes.get(path) === 'unassigned';
      const span = text('span', path, 'image-hosting-customer-path');
      span.append(text('span', state.scopes.get(path) + ' · ' + (item.size ?? '?') + ' bytes', 'image-hosting-customer-meta'));
      if (item.sha256) span.append(text('span', 'SHA-256: ' + item.sha256, 'image-hosting-customer-meta'));
      input.addEventListener('change', () => {
        state.scopes.set(path, input.checked ? 'customer' : 'shared');
        input.indeterminate = false;
        span.querySelector('.image-hosting-customer-meta').textContent = state.scopes.get(path) + ' · ' + (item.size ?? '?') + ' bytes';
        byId('customerClassification').checked = false;
        controls();
      });
      label.append(input, span);
      container.append(label);
    });
    if (!state.items.size) container.append(text('p', 'No library files. Upload at least one customer file in the library below, then inspect again. Saving or switching currently requires at least one selected customer file.'));
  }
  function renderConfiguration() {
    const container = byId('customerConfiguration');
    container.replaceChildren();
    container.className = 'image-hosting-customer-config';
    state.configuration.forEach((entry, index) => {
      const row = text('div', '');
      const label = text('label', entry.path + ' (JSON value; edits apply only when preparing a new customer)');
      const input = document.createElement('input');
      input.type = 'text';
      input.value = JSON.stringify(entry.value) ?? 'null';
      input.id = 'customerConfig' + index;
      label.htmlFor = input.id;
      label.append(input);
      const approval = text('label', '', 'image-hosting-customer-check');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = 'customerConfigApprove' + index;
      approval.append(checkbox, text('span', 'Use this value for the new customer (explicitly approve retained values, or edit / clear them first)'));
      row.append(label, approval);
      container.append(row);
    });
    if (!state.configuration.length) container.append(text('p', 'No approved settings returned. New customer preparation requires an editable customer name setting.'));
  }
  function renderRevisions() {
    const container = byId('customerRevisions');
    container.replaceChildren();
    state.revisions.forEach((revision) => {
      const row = text('div', '', 'image-hosting-customer-revision');
      const info = text('div', revision.customerName);
      info.append(text('span', [revision.createdAt, revision.fileCount + ' files', revision.revisionId].join(' · '), 'image-hosting-customer-meta'));
      const button = text('button', 'Preview restore');
      button.type = 'button';
      button.className = 'dashboard-btn-outline';
      button.dataset.restore = revision.revisionId;
      button.setAttribute('aria-label', 'Preview restore of ' + revision.customerName + ', revision ' + revision.revisionId);
      button.addEventListener('click', () => run(async () => {
        const result = await api('customer-switch-preview', {
          ...classification(), revision_id: revision.revisionId, backup_customer_name: requiredName('customerSaveName')
        });
        showPreview(result, 'Restore saved customer');
      }));
      row.append(info, button);
      container.append(row);
    });
    if (!state.revisions.size) container.append(text('p', 'No saved customer revisions yet.'));
  }
  async function inspect(append = false) {
    if (sandboxName() !== state.sandbox) {
      state.sandbox = sandboxName();
      state.pending = null;
      try { state.pending = JSON.parse(sessionStorage.getItem(storageKey()) || 'null'); } catch (_) {
        report('Stored operation tracking is unreadable. Inspect server status before making changes.', true);
      }
      append = false;
    }
    if (!append) {
      state.inspected = false;
      state.items.clear(); state.scopes.clear(); state.revisions.clear();
      state.cursor = null;
      state.preview = null;
      byId('customerClassification').checked = false;
    }
    const result = await api('customer-inspect', append ? { cursor: state.cursor } : {});
    (result.items || []).forEach((item) => {
      state.items.set(item.relPath, item);
      if (!state.scopes.has(item.relPath)) state.scopes.set(item.relPath, item.scope || 'unassigned');
    });
    (result.revisions || []).forEach((revision) => state.revisions.set(revision.revisionId, revision));
    if (!append) {
      state.configuration = result.configuration || [];
      byId('customerSaveName').value = result.activeCustomer || result.rtdbCustomerName || '';
      const summary = byId('customerActive');
      summary.replaceChildren(
        text('span', 'Active customer: ' + (result.activeCustomer || 'unassigned') +
          '. RTDB customer: ' + (result.rtdbCustomerName || 'unassigned') + '. Inspect again after manual library changes.')
      );
      if (result.drift != null) summary.append(text('span', 'Drift: ' +
        (typeof result.drift === 'string' ? result.drift : JSON.stringify(result.drift)), 'image-hosting-customer-meta'));
      (result.warnings || []).forEach((warning) => summary.append(text('span',
        typeof warning === 'string' ? warning : JSON.stringify(warning), 'image-hosting-customer-meta')));
      byId('customerReplacements').replaceChildren();
      renderConfiguration();
    }
    if (result.operation && !['completed', 'succeeded', 'rolled_back'].includes(result.operation.status)) {
      remember({ ...state.pending, operationId: result.operation.operationId });
    }
    state.cursor = result.nextCursor || null;
    state.inspected = true;
    renderInventory(); renderRevisions();
    report(state.pending ? 'An operation needs attention. Check status before making changes. Operation: ' + (state.pending.operationId || state.pending.idempotencyKey) :
      state.cursor ? 'Full inventory inspected. More saved revisions are available via Load more; you can classify and save now.' :
        'Inventory inspected. Review classification and the approved configuration before previewing.');
  }
  function safeUrl(value) {
    try {
      const url = new URL(value, window.location.href);
      return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
    } catch (_) { return null; }
  }
  function imagePreview(container, label, value, after = false) {
    const preview = state.preview;
    const failed = () => {
      if (!after || state.preview !== preview) return;
      preview.imageFailed = true;
      report('An AFTER image preview failed. Activation is disabled. Cancel and prepare a fresh preview; do not activate without reviewing the incoming images.', true);
      controls();
    };
    const figure = text('figure', '');
    figure.append(text('figcaption', label));
    const url = value && safeUrl(value);
    if (url) {
      const image = document.createElement('img');
      image.alt = label;
      image.loading = after ? 'eager' : 'lazy';
      image.referrerPolicy = 'no-referrer';
      if (after) preview.imagesPending++;
      const settled = () => {
        if (after && state.preview === preview) { preview.imagesPending--; controls(); }
      };
      image.addEventListener('load', settled, { once: true });
      image.addEventListener('error', () => {
        image.replaceWith(text('p', 'Image preview unavailable. Cancel and prepare again if this is an incoming image.'));
        failed(); settled();
      }, { once: true });
      image.src = url;
      figure.append(image, text('span', value, 'image-hosting-customer-meta image-hosting-customer-path'));
    } else {
      figure.append(text('p', 'No image'));
      if (after) failed();
    }
    container.append(figure);
  }
  function showPreview(result, title) {
    if (!result.preflightId) throw new Error('Server did not return a preflight ID. Nothing was applied.');
    state.preview = { ...result, sandbox: state.sandbox, key: crypto.randomUUID(), imageFailed: false, imagesPending: 0 };
    byId('customerPreviewTitle').textContent = title;
    const container = byId('customerPreviewContent');
    container.replaceChildren(
      text('p', 'Incoming / saved customer: ' + result.customerName),
      text('p', 'Outgoing backup: ' + (result.outgoingCustomerName || 'none')),
      text('p', 'Preview expires: ' + (result.expiresAt || 'server-controlled') + '. Shared paths remain untouched.')
    );
    (result.warnings || []).forEach((warning) => container.append(text('p', String(warning))));
    (result.files || []).forEach((file) => {
      const row = text('div', '', 'image-hosting-customer-diff');
      row.append(text('h3', file.action.toUpperCase() + ' · ' + file.relPath));
      if (file.contentType && !file.contentType.startsWith('image/')) {
        row.append(text('p', 'Non-image asset: ' + file.contentType + ' · ' + file.size + ' bytes · SHA-256: ' + file.sha256));
        container.append(row);
        return;
      }
      const images = text('div', '', 'image-hosting-customer-images');
      imagePreview(images, 'Before', file.beforeUrl);
      imagePreview(images, file.action === 'delete' ? 'After — deleted' : 'After', file.previewUrl,
        file.action !== 'delete' && (file.action !== 'keep' || !!file.previewUrl));
      row.append(images);
      container.append(row);
    });
    container.append(text('h3', 'Approved configuration diff'));
    (result.configurationDiff || []).forEach((entry) => {
      const row = text('div', '', 'image-hosting-customer-diff');
      row.append(text('strong', entry.path), text('pre', 'Before: ' + JSON.stringify(entry.before) + '\nAfter: ' + JSON.stringify(entry.after)));
      container.append(row);
    });
    if (!result.configurationDiff?.length) container.append(text('p', 'No configuration changes. Current approved settings are included in cloud saves.'));
    byId('customerPreviewConfirm').checked = false;
    byId('customerPreviewStatus').textContent = state.preview.imageFailed ?
      'An AFTER image preview is unavailable. Activation is disabled. Cancel and prepare a fresh preview.' :
      'Preview only. No active content has changed. Incoming images must load before activation.';
    dialog.showModal();
    byId('customerPreviewTitle').tabIndex = -1;
    byId('customerPreviewTitle').focus({ preventScroll: true });
    dialog.scrollTop = 0;
    controls();
  }
  function addReplacement() {
    const row = text('div', '', 'image-hosting-customer-replacement');
    const pathLabel = text('label', 'Exact customer file path (existing or new)');
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'folder/logo.png';
    input.dataset.targetPath = '';
    pathLabel.append(input);
    const fileLabel = text('label', 'Replacement file (maximum 8 MiB)');
    const file = document.createElement('input');
    file.type = 'file';
    fileLabel.append(file);
    const remove = text('button', 'Remove replacement');
    remove.type = 'button';
    remove.className = 'dashboard-btn-outline';
    remove.addEventListener('click', () => row.remove());
    row.append(pathLabel, fileLabel, remove);
    byId('customerReplacements').append(row);
  }
  function base64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read ' + file.name));
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.readAsDataURL(file);
    });
  }
  async function prepare() {
    const paths = classification();
    const customerName = requiredName('customerNewName');
    const backupName = requiredName('customerSaveName');
    const changes = state.configuration.flatMap((entry, index) => {
      if (!byId('customerConfigApprove' + index).checked) {
        if (entry.value !== null && entry.value !== '') throw new Error('Review and explicitly approve or clear the new customer value for ' + entry.path + '. No outgoing brand text is silently retained.');
        return [];
      }
      let value;
      try { value = JSON.parse(byId('customerConfig' + index).value); } catch (_) {
        throw new Error('Enter valid JSON for ' + entry.path + ' (put text values in double quotes).');
      }
      return [{ path: entry.path, value }];
    });
    if (!changes.some((entry) => /(^|[/.])name$|customerName$|brandName$/i.test(entry.path) && entry.value === customerName)) {
      throw new Error('Edit the approved customer / brand name setting to match the new customer name before preparing.');
    }
    const seen = new Set();
    const selected = [...byId('customerReplacements').children].map((row) => {
      const path = row.querySelector('[data-target-path]').value;
      const file = row.querySelector('[type=file]').files[0];
      if (!path || path !== path.trim() || path.startsWith('/') || /[\\?#\u0000-\u001f\u007f]/.test(path) ||
          path.split('/').some((part) => !part || part.startsWith('.') || part.includes(':'))) {
        throw new Error('Enter an exact relative customer path without empty, hidden or traversal segments: ' + path);
      }
      if (paths.shared_paths.includes(path)) throw new Error('Replacement target cannot overwrite a shared path: ' + path);
      if (seen.has(path)) throw new Error('Duplicate replacement target: ' + path);
      seen.add(path);
      if (!file || !file.size || file.size > 8 * 1024 * 1024) throw new Error('Choose a non-empty file up to 8 MiB for ' + path);
      return { path, file };
    });
    const replacements = [];
    for (const { path, file } of selected) {
      report('Staging replacement for ' + path + '…');
      const staged = await api('customer-stage', { file_name: file.name, content_type: file.type || 'application/octet-stream', base64: await base64(file) });
      if (!staged.stageId) throw new Error('No staging ID returned for ' + path);
      replacements.push({ rel_path: path, stage_id: staged.stageId });
    }
    const result = await api('customer-switch-preview', {
      ...paths, customer_name: customerName, backup_customer_name: backupName, replacements, changes
    });
    showPreview(result, 'Prepare new customer — review switch');
  }
  async function operationResult(result) {
    const operation = result.operation || result;
    if (operation.operationId) remember({ ...state.pending, operationId: operation.operationId });
    if (operation.verified === true && ['completed', 'succeeded', 'success', 'applied', 'saved'].includes(operation.status)) {
      remember(null); state.preview = null;
      if (dialog.open) dialog.close();
      await inspect();
      byId('imageHostingRefreshBtn')?.click();
      report('Verified customer operation complete. Customer: ' + (operation.customerName || 'see active summary') +
        '. Revision: ' + (operation.revisionId || 'see saved revisions') + '. Outgoing backup: ' + (operation.backupRevisionId || 'none'));
    } else if (operation.status === 'succeeded' && operation.verified === false) {
      remember(null); state.preview = null;
      if (dialog.open) dialog.close();
      await inspect();
      byId('imageHostingRefreshBtn')?.click();
      report('This historical operation succeeded but has been superseded; its customer package is not currently active. Tracking cleared. Review the refreshed active customer.', true);
    } else if (operation.status === 'rolled_back') {
      remember(null); state.preview = null;
      if (dialog.open) dialog.close();
      await inspect();
      byId('imageHostingRefreshBtn')?.click();
      report('Operation rolled back. No new customer is ready. Inspect the outgoing customer before another preview.', true);
    } else {
      report('Operation: ' + (operation.operationId || state.pending?.idempotencyKey || 'unknown') +
        ' · ' + (operation.status || 'unknown') + '. ' + (typeof operation.error === 'string' ? operation.error :
          operation.error?.message || 'Not verified ready. Check status; recover only if the server allows it.'), true);
    }
  }
  byId('customerInspect').addEventListener('click', () => run(() => inspect()));
  byId('customerMore').addEventListener('click', () => run(() => inspect(true)));
  byId('customerClassification').addEventListener('change', controls);
  byId('customerMarkShared').addEventListener('click', () => {
    state.scopes.forEach((scope, path) => { if (scope !== 'customer') state.scopes.set(path, 'shared'); });
    byId('customerClassification').checked = false;
    renderInventory(); controls();
  });
  byId('customerSave').addEventListener('click', () => run(async () => {
    showPreview(await api('customer-save-preview', { ...classification(), customer_name: requiredName('customerSaveName') }), 'Save customer in cloud — review');
  }));
  byId('customerAddReplacement').addEventListener('click', addReplacement);
  byId('customerPreparePreview').addEventListener('click', () => run(prepare));
  byId('customerPreviewConfirm').addEventListener('change', controls);
  byId('customerPreviewCancel').addEventListener('click', () => { state.preview = null; dialog.close(); });
  dialog.addEventListener('cancel', (event) => {
    if (state.busy) event.preventDefault();
    else state.preview = null;
  });
  byId('customerApply').addEventListener('click', () => run(async () => {
    const preview = state.preview;
    if (!preview || !byId('customerPreviewConfirm').checked || state.pending || preview.imageFailed || preview.imagesPending > 0) throw new Error('Create and confirm a fresh preview with all incoming images loaded first.');
    if (preview.sandbox !== sandboxName()) throw new Error('Sandbox changed. Cancel and inspect again.');
    if (preview.expiresAt && Date.parse(preview.expiresAt) <= Date.now()) throw new Error('Preview expired. Cancel and create a new preview.');
    remember({ idempotencyKey: preview.key });
    report('Applying confirmed package. Do not submit again; status can be checked if the connection fails.');
    try {
      await operationResult(await api('customer-apply', { preflight_id: preview.preflightId, confirmed: true, idempotency_key: preview.key }));
    } catch (error) {
      error.message += ' Apply was not retried. Check operation status before any further changes. Tracking key: ' + preview.key;
      throw error;
    }
  }));
  byId('customerCheckStatus').addEventListener('click', () => run(async () => {
    try {
      await operationResult(await api('customer-status', state.pending?.operationId ?
        { operation_id: state.pending.operationId } : { idempotency_key: state.pending?.idempotencyKey }));
    } catch (error) {
      if (error.status !== 404) throw error;
      if (!window.confirm('The server confirms no operation exists for this tracked key or ID. Clear this tracking record and inspect again? No apply request will be retried.')) throw error;
      remember(null); state.preview = null;
      if (dialog.open) dialog.close();
      await inspect();
      report('Tracking cleared after confirmed operation-not-found response. Review the refreshed inventory and create a new preview.');
    }
  }));
  byId('customerPreviewCheckStatus').addEventListener('click', () => byId('customerCheckStatus').click());
  byId('customerRecover').addEventListener('click', () => run(async () => {
    if (!state.pending?.operationId) throw new Error('Check operation status to obtain the operation ID first.');
    if (!window.confirm('Recover the outgoing customer for operation ' + state.pending.operationId + '? The server will reject recovery until its timeout safety period has passed.')) return;
    await operationResult(await api('customer-recover', { operation_id: state.pending.operationId, confirmed: true }));
  }));
  controls();
})();
