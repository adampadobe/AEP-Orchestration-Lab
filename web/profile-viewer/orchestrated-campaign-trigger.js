(function () {
  'use strict';

  const DEFAULT_CAMPAIGN = {
    name: 'Daily News Briefing — Signal Trigger',
    campaignId: 'dc0db936-0846-4e55-bfdc-9e3a8b859812',
  };
  const DEFAULT_VARIABLES = {
    editionDate: '29/07/2026',
    readTime: '3 minutes',
    weatherImageUrl: 'https://aep-orchestration-lab.web.app/cdn/kirkham/image-11.png',
    featuredArticle: 'One sentence here introducing the day. Everything you need to know in under five minutes, and head to the website for more. Get in touch using the link below. And don’t forget to catch up on xyz.',
    trending: 'https://aep-orchestration-lab.web.app/cdn/kirkham/image-8.png',
    comingUp: 'https://aep-orchestration-lab.web.app/cdn/kirkham/image.png',
    featuredHeadline: 'AFTERSHOCKS CONTINUE IN VENEZUELA',
    featureSummary: 'At least 1,450 people are confirmed dead after the two earthquakes that rocked Venezuela last Wednesday. Stories of “miracle” rescues are being reported – but the country also faced an aftershock today.',
    featureImageUrl: 'https://aep-orchestration-lab.web.app/cdn/kirkham/image-10.png',
    featuredArticleUrl: '',
    trendingHeadline: 'IT’S COMING HOME!',
    trendingBody: 'Britain is well and truly in the grips of football fever after England’s win against Mexico last night. Across Sky News’ social media, the most watched clips this morning by a long way are reflecting this – like this clip of fans celebrating two back-to-back goals in two minutes.',
    trendingImageUrl: 'https://aep-orchestration-lab.web.app/cdn/kirkham/image-9.png',
    trendingIconUrl: 'https://aep-orchestration-lab.web.app/cdn/kirkham/image-7.png',
    trendingArticleUrl: 'https://aep-orchestration-lab.web.app/cdn/kirkham/image-3.png',
    comingUp1: '8am: GDP figures for 2026 Q2 due to be released',
    comingUp2: '12pm: PMQs – expect the PM to get a grilling over the latest amendments to the Online Safety Act',
    comingUp3: '8pm: England vs Panama in Dallas',
  };

  const dom = {
    sandbox: document.getElementById('sandboxSelect'),
    campaignName: document.getElementById('octCampaignName'),
    campaignList: document.getElementById('octCampaignList'),
    campaignId: document.getElementById('octCampaignId'),
    campaignIdHint: document.getElementById('octCampaignIdHint'),
    statusBtn: document.getElementById('octStatusBtn'),
    saveBtn: document.getElementById('octSaveBtn'),
    deleteBtn: document.getElementById('octDeleteBtn'),
    lookupMsg: document.getElementById('octLookupMsg'),
    quickPanel: document.getElementById('octQuickPanel'),
    customPanel: document.getElementById('octCustomPanel'),
    customPayload: document.getElementById('octCustomPayload'),
    preview: document.getElementById('octRequestPreview'),
    copyCurlBtn: document.getElementById('octCopyCurlBtn'),
    sendBtn: document.getElementById('octSendBtn'),
    resetBtn: document.getElementById('octResetBtn'),
    sendMsg: document.getElementById('octSendMsg'),
    response: document.getElementById('octResponse'),
    responseTitle: document.getElementById('octResponseTitle'),
    responseJson: document.getElementById('octResponseJson'),
  };

  let campaigns = [];
  let activeMode = 'quick';

  function getSandbox() {
    if (dom.sandbox && dom.sandbox.value) return dom.sandbox.value;
    if (window.AepGlobalSandbox && window.AepGlobalSandbox.getSandbox) {
      return window.AepGlobalSandbox.getSandbox() || '';
    }
    return '';
  }

  async function labAuthFetch(url, options) {
    const extra = window.AepLabSandboxSync && window.AepLabSandboxSync.getAuthHeaders
      ? await window.AepLabSandboxSync.getAuthHeaders()
      : {};
    options = options || {};
    return fetch(url, {
      ...options,
      headers: { ...extra, ...(options.headers || {}) },
    });
  }

  function setMessage(el, text, type) {
    if (!el) return;
    el.hidden = !text;
    el.textContent = text || '';
    el.classList.toggle('consent-message--success', type === 'success');
    el.classList.toggle('consent-message--error', type === 'error');
  }

  function findSavedByName(name) {
    const key = String(name || '').trim().toLowerCase();
    return campaigns.find((item) => item.name.toLowerCase() === key) || null;
  }

  function renderCampaigns() {
    dom.campaignList.innerHTML = '';
    campaigns.forEach((item) => {
      const option = document.createElement('option');
      option.value = item.name;
      option.label = item.campaignId;
      dom.campaignList.appendChild(option);
    });
  }

  function syncCampaignSelection() {
    const saved = findSavedByName(dom.campaignName.value);
    if (saved) {
      dom.campaignId.value = saved.campaignId;
      dom.campaignId.readOnly = true;
      dom.campaignIdHint.textContent = 'Campaign ID loaded from the saved trigger for this sandbox.';
      dom.deleteBtn.hidden = false;
      if (saved.payload && typeof saved.payload === 'object') applyPayload(saved.payload);
    } else {
      if (dom.campaignId.readOnly && dom.campaignName.value.trim()) dom.campaignId.value = '';
      dom.campaignId.readOnly = !dom.campaignName.value.trim();
      if (!dom.campaignName.value.trim()) dom.campaignId.value = '';
      dom.campaignIdHint.textContent = dom.campaignName.value.trim()
        ? 'New trigger name — enter its campaign ID.'
        : 'Select a saved trigger, or enter a new trigger name to edit.';
      dom.deleteBtn.hidden = true;
    }
    updatePreview();
  }

  function readQuickPayload() {
    const variables = {};
    document.querySelectorAll('[data-variable]').forEach((input) => {
      variables[input.dataset.variable] = input.value;
    });
    return { variables };
  }

  function readPayload() {
    if (activeMode === 'quick') return readQuickPayload();
    const parsed = JSON.parse(dom.customPayload.value || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Custom payload must be a JSON object.');
    }
    return parsed;
  }

  function applyPayload(payload) {
    if (!payload || typeof payload !== 'object') return;
    const variables = payload.variables && typeof payload.variables === 'object' ? payload.variables : {};
    document.querySelectorAll('[data-variable]').forEach((input) => {
      if (Object.prototype.hasOwnProperty.call(variables, input.dataset.variable)) {
        input.value = variables[input.dataset.variable] == null ? '' : String(variables[input.dataset.variable]);
      }
    });
    dom.customPayload.value = JSON.stringify(payload, null, 2);
    updatePreview();
  }

  function campaignPath() {
    const id = dom.campaignId.value.trim();
    return `/ajo/campaign-orchestration/orchestratedCampaigns/${encodeURIComponent(id)}`;
  }

  function updatePreview() {
    let payload;
    try {
      payload = readPayload();
    } catch (error) {
      dom.preview.textContent = `Payload error: ${error.message}`;
      return;
    }
    const sandbox = getSandbox() || '<sandbox>';
    const id = dom.campaignId.value.trim() || '<campaign-id>';
    dom.preview.textContent = [
      `POST https://platform.adobe.io/ajo/campaign-orchestration/orchestratedCampaigns/${id}/trigger`,
      'Authorization: Bearer <server-managed access token>',
      'Content-Type: application/json',
      'x-api-key: <server-managed API key>',
      `x-sandbox-name: ${sandbox}`,
      'x-api-version: 1',
      'x-gw-ims-org-id: <server-managed IMS org>',
      '',
      JSON.stringify(payload, null, 2),
    ].join('\n');
  }

  function storageKey() {
    return `aepOrchestratedCampaignTriggers_${getSandbox() || 'default'}`;
  }

  function loadLocalCampaigns() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey()) || '[]');
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  }

  function persistLocalCampaigns() {
    try { localStorage.setItem(storageKey(), JSON.stringify(campaigns)); } catch { /* ignore */ }
  }

  async function persistCampaigns() {
    persistLocalCampaigns();
    const sandbox = getSandbox();
    if (!sandbox) return;
    const response = await labAuthFetch('/api/orchestrated-campaigns/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sandbox, campaigns }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) return;
      throw new Error(data.error || 'Saved locally, but Firebase save failed.');
    }
  }

  async function loadCampaigns() {
    campaigns = loadLocalCampaigns();
    const sandbox = getSandbox();
    if (sandbox) {
      try {
        const response = await labAuthFetch(`/api/orchestrated-campaigns/config?sandbox=${encodeURIComponent(sandbox)}`);
        const data = await response.json().catch(() => ({}));
        if (response.ok && data.record && Array.isArray(data.record.campaigns)) {
          campaigns = data.record.campaigns;
          persistLocalCampaigns();
        }
      } catch { /* local fallback */ }
    }
    if (!campaigns.length) campaigns = [{ ...DEFAULT_CAMPAIGN, payload: { variables: { ...DEFAULT_VARIABLES } } }];
    renderCampaigns();
    dom.campaignName.value = campaigns[0].name;
    syncCampaignSelection();
  }

  async function saveCurrentCampaign(showMessage) {
    const name = dom.campaignName.value.trim();
    const campaignId = dom.campaignId.value.trim();
    if (!name || !campaignId) throw new Error('Enter both a trigger name and campaign ID.');
    const payload = readPayload();
    const existing = findSavedByName(name);
    const record = { name, campaignId, payload };
    if (existing) campaigns[campaigns.indexOf(existing)] = record;
    else campaigns.push(record);
    renderCampaigns();
    dom.campaignId.readOnly = true;
    dom.deleteBtn.hidden = false;
    await persistCampaigns();
    if (showMessage) setMessage(dom.lookupMsg, `Saved “${name}” for sandbox “${getSandbox()}”.`, 'success');
  }

  async function callAep(method, path, json) {
    const sandbox = getSandbox();
    if (!sandbox) throw new Error('Select a sandbox first.');
    const body = {
      method,
      path,
      platform_headers: {
        'Content-Type': 'application/json',
        'x-sandbox-name': sandbox,
        'x-api-version': '1',
      },
    };
    if (json !== undefined) body.json = json;
    const response = await fetch('/api/aep', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = data.platform_response || data;
      throw new Error(detail.message || detail.detail || detail.error || `Adobe API returned ${response.status}.`);
    }
    return { response, data };
  }

  function checkStatus() {
    const campaignId = dom.campaignId.value.trim();
    const sandbox = getSandbox();
    if (!campaignId) {
      setMessage(dom.lookupMsg, 'Enter a campaign ID first.', 'error');
      return;
    }
    if (!sandbox) {
      setMessage(dom.lookupMsg, 'Select a sandbox first.', 'error');
      return;
    }

    const note = 'Trigger setup is ready. Adobe does not provide a read-only status endpoint for this signal API; confirm that the campaign is Published in AJO before sending.';
    setMessage(dom.lookupMsg, note, 'success');
    showResponse('Trigger readiness', {
      ready: true,
      sandbox,
      campaignId,
      endpoint: `POST https://platform.adobe.io${campaignPath()}/trigger`,
      note,
    });
  }

  function showResponse(title, data) {
    dom.response.hidden = false;
    dom.responseTitle.textContent = title;
    dom.responseJson.textContent = JSON.stringify(data, null, 2);
  }

  async function sendTrigger() {
    const id = dom.campaignId.value.trim();
    if (!id) {
      setMessage(dom.sendMsg, 'Choose a saved trigger or enter a campaign ID first.', 'error');
      return;
    }
    let payload;
    try { payload = readPayload(); }
    catch (error) {
      setMessage(dom.sendMsg, error.message, 'error');
      return;
    }
    dom.sendBtn.disabled = true;
    setMessage(dom.sendMsg, 'Sending trigger…', '');
    try {
      const result = await callAep('POST', `${campaignPath()}/trigger`, payload);
      await saveCurrentCampaign(false);
      setMessage(dom.sendMsg, `${result.response.status} Accepted — signal sent to ${dom.campaignName.value.trim()}.`, 'success');
      showResponse(`Trigger response · ${result.response.status}`, result.data);
    } catch (error) {
      setMessage(dom.sendMsg, error.message, 'error');
    } finally {
      dom.sendBtn.disabled = false;
    }
  }

  function setMode(mode) {
    if (mode === activeMode) return;
    if (mode === 'custom') dom.customPayload.value = JSON.stringify(readQuickPayload(), null, 2);
    activeMode = mode;
    dom.quickPanel.hidden = mode !== 'quick';
    dom.customPanel.hidden = mode !== 'custom';
    document.querySelectorAll('.oct-mode-btn').forEach((button) => {
      button.classList.toggle('oct-mode-btn--active', button.dataset.mode === mode);
    });
    updatePreview();
  }

  async function copyCurl() {
    let payload;
    try { payload = readPayload(); }
    catch (error) {
      setMessage(dom.sendMsg, error.message, 'error');
      return;
    }
    const id = dom.campaignId.value.trim() || '<campaign-id>';
    const curl = [
      `curl --request POST 'https://platform.adobe.io/ajo/campaign-orchestration/orchestratedCampaigns/${id}/trigger'`,
      `  --header 'Authorization: Bearer <access_token>'`,
      `  --header 'Content-Type: application/json'`,
      `  --header 'x-api-key: <client_id>'`,
      `  --header 'x-api-version: 1'`,
      `  --header 'x-gw-ims-org-id: <ims_org_id>'`,
      `  --header 'x-sandbox-name: ${getSandbox() || '<sandbox>'}'`,
      `  --data-raw '${JSON.stringify(payload).replace(/'/g, "'\\''")}'`,
    ].join(' \\\n');
    await navigator.clipboard.writeText(curl);
    setMessage(dom.sendMsg, 'cURL copied to clipboard.', 'success');
  }

  async function deleteCurrent() {
    const saved = findSavedByName(dom.campaignName.value);
    if (!saved) return;
    campaigns = campaigns.filter((item) => item !== saved);
    await persistCampaigns();
    renderCampaigns();
    dom.campaignName.value = '';
    dom.campaignId.value = '';
    syncCampaignSelection();
    setMessage(dom.lookupMsg, `Deleted “${saved.name}” from this sandbox.`, 'success');
  }

  async function onSandboxChange() {
    setMessage(dom.lookupMsg, '', '');
    dom.campaignName.value = '';
    dom.campaignId.value = '';
    await loadCampaigns();
    updatePreview();
  }

  async function init() {
    if (window.AepGlobalSandbox) {
      await window.AepGlobalSandbox.loadSandboxesIntoSelect(dom.sandbox);
      window.AepGlobalSandbox.onSandboxSelectChange(dom.sandbox);
      window.AepGlobalSandbox.attachStorageSync(dom.sandbox);
      if (window.AepGlobalSandbox.onChange) window.AepGlobalSandbox.onChange(onSandboxChange);
    }
    dom.sandbox.addEventListener('change', onSandboxChange);
    dom.campaignName.addEventListener('input', syncCampaignSelection);
    dom.campaignName.addEventListener('change', syncCampaignSelection);
    dom.campaignId.addEventListener('input', updatePreview);
    document.querySelectorAll('[data-variable]').forEach((input) => input.addEventListener('input', updatePreview));
    dom.customPayload.addEventListener('input', updatePreview);
    document.querySelectorAll('.oct-mode-btn').forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode)));
    dom.statusBtn.addEventListener('click', checkStatus);
    dom.saveBtn.addEventListener('click', async () => {
      try { await saveCurrentCampaign(true); }
      catch (error) { setMessage(dom.lookupMsg, error.message, 'error'); }
    });
    dom.deleteBtn.addEventListener('click', deleteCurrent);
    dom.sendBtn.addEventListener('click', sendTrigger);
    dom.copyCurlBtn.addEventListener('click', copyCurl);
    dom.resetBtn.addEventListener('click', () => {
      applyPayload({ variables: { ...DEFAULT_VARIABLES } });
      setMessage(dom.sendMsg, 'Supplied template restored.', 'success');
    });
    applyPayload({ variables: { ...DEFAULT_VARIABLES } });
    await loadCampaigns();
    updatePreview();
  }

  init();
})();
