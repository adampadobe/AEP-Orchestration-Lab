/**
 * Self-service MCP API keys on mcp-servers.html — multiple named keys per global sandbox.
 */
(function (global) {
  'use strict';

  var MCP_HEADER_NAME = 'X-AEP-Lab-Mcp-Key';
  var MCP_BASE_URL = 'https://aep-lab-profile-mcp-109406613852.us-central1.run.app';
  var MCP_ENDPOINTS = [
    { id: 'aep-lab-guide', label: 'MCP guide and workflow routing (4 tools)', path: '/mcp/guide' },
    { id: 'aep-lab-general', label: 'General demo prep (98 tools)', path: '/mcp' },
    { id: 'aep-lab-demo-prep', label: 'Focused demo prep (19 tools)', path: '/mcp/demo-prep' },
    { id: 'aep-lab-profiles', label: 'Profiles and events (20 tools)', path: '/mcp/profile' },
    { id: 'aep-lab-decisioning', label: 'Decisioning (9 tools)', path: '/mcp/decisioning' },
    { id: 'aep-lab-audiences', label: 'Audience audit and delete (4 tools)', path: '/mcp/audiences' },
    { id: 'aep-lab-ajo-cleanup', label: 'AJO journey and campaign cleanup (7 tools)', path: '/mcp/ajo-cleanup' },
  ];
  var PANEL_ID = 'mcpLabKeyPanel';
  var MODAL_ID = 'mcpLabKeyModal';
  var KEY_PLACEHOLDER = '<paste your key — shown only at generate/rotate>';
  var SESSION_KEY_PREFIX = 'aepLabMcpKeySecret:';
  var DEFAULT_MAX_ACTIVE_KEYS_PER_SANDBOX = 25;
  var cachedKeysPayload = null;
  var selectedKeyId = '';

  function getGlobalSandboxName() {
    if (global.AepGlobalSandbox && typeof global.AepGlobalSandbox.getSandboxName === 'function') {
      return String(global.AepGlobalSandbox.getSandboxName() || '').trim();
    }
    if (global.AepLabSandboxSync && typeof global.AepLabSandboxSync.getSandbox === 'function') {
      return String(global.AepLabSandboxSync.getSandbox() || '').trim();
    }
    try {
      return String(localStorage.getItem('aepGlobalSandboxName') || '').trim();
    } catch (_e) {
      return '';
    }
  }

  function sessionKeyFor(keyId) {
    return SESSION_KEY_PREFIX + String(keyId || '');
  }

  function storeKeyInSession(keyId, apiKey) {
    if (!keyId || !apiKey) return;
    try {
      sessionStorage.setItem(sessionKeyFor(keyId), String(apiKey));
    } catch (_e) {}
  }

  function readKeyFromSession(keyId) {
    if (!keyId) return '';
    try {
      return String(sessionStorage.getItem(sessionKeyFor(keyId)) || '');
    } catch (_e) {
      return '';
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getAuth() {
    if (typeof firebase === 'undefined' || !firebase.auth) return null;
    try {
      if (!firebase.apps.length && global.firebaseDatabaseConfig) {
        firebase.initializeApp(global.firebaseDatabaseConfig);
      }
    } catch (_e) {}
    return firebase.auth();
  }

  function labAuthFetch(url, options) {
    options = options || {};
    if (global.AepLabSandboxSync && global.AepLabSandboxSync.getAuthHeaders) {
      return global.AepLabSandboxSync.getAuthHeaders().then(function (h) {
        var headers = Object.assign({ 'Content-Type': 'application/json' }, h || {}, options.headers || {});
        return global.fetch(url, Object.assign({}, options, { headers: headers }));
      });
    }
    var auth = getAuth();
    if (!auth || !auth.currentUser) {
      return Promise.reject(new Error('Not signed in'));
    }
    return auth.currentUser.getIdToken(false).then(function (token) {
      var headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {}, {
        Authorization: 'Bearer ' + token,
      });
      return global.fetch(url, Object.assign({}, options, { headers: headers }));
    });
  }

  function mcpKeysApiUrl() {
    var sb = getGlobalSandboxName();
    return sb ? '/api/lab/mcp-keys?sandbox=' + encodeURIComponent(sb) : '/api/lab/mcp-keys';
  }

  function endpointById(endpointId) {
    return MCP_ENDPOINTS.find(function (endpoint) {
      return endpoint.id === endpointId;
    }) || MCP_ENDPOINTS[0];
  }

  function endpointUrl(endpoint) {
    return MCP_BASE_URL + endpoint.path;
  }

  function coworkerSnippet(apiKey, endpoint) {
    endpoint = endpoint || MCP_ENDPOINTS[0];
    var config = {};
    config[endpoint.id] = {
      type: 'streamable-http',
      url: endpointUrl(endpoint),
      headers: {},
    };
    config[endpoint.id].headers[MCP_HEADER_NAME] = apiKey;
    return JSON.stringify(
      config,
      null,
      2,
    );
  }

  function coworkerSnippetPlaceholder(endpoint) {
    return coworkerSnippet(KEY_PLACEHOLDER, endpoint);
  }

  function activeKeysSorted(keys) {
    return (keys || [])
      .filter(function (k) {
        return k && !k.revoked;
      })
      .sort(function (a, b) {
        var sa = String(a.sandbox || (a.allowedSandboxes && a.allowedSandboxes[0]) || '');
        var sb = String(b.sandbox || (b.allowedSandboxes && b.allowedSandboxes[0]) || '');
        if (sa !== sb) return sa < sb ? -1 : 1;
        var ta = a.createdAt ? Date.parse(a.createdAt) : 0;
        var tb = b.createdAt ? Date.parse(b.createdAt) : 0;
        return tb - ta;
      });
  }

  function maxActiveKeysPerSandbox(data) {
    var parsed = Number(data && data.maxActiveKeysPerSandbox);
    return Number.isFinite(parsed) && parsed > 0
      ? Math.floor(parsed)
      : DEFAULT_MAX_ACTIVE_KEYS_PER_SANDBOX;
  }

  function keySandboxLabel(key) {
    if (!key) return '—';
    return String(key.sandbox || (key.allowedSandboxes && key.allowedSandboxes[0]) || '—');
  }

  function formatKeyDate(iso) {
    return iso ? new Date(iso).toLocaleString() : '—';
  }

  function setModalCopyToast(message) {
    var toast = document.getElementById('mcpLabKeyModalCopyToast');
    if (!toast) return;
    toast.textContent = message || '';
    if (message) {
      clearTimeout(setModalCopyToast._timer);
      setModalCopyToast._timer = setTimeout(function () {
        toast.textContent = '';
      }, 2200);
    }
  }

  function copyTextToClipboard(text, btn, defaultLabel, toastMessage) {
    if (!text) return Promise.resolve(false);
    var write = Promise.resolve();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      write = navigator.clipboard.writeText(text);
    } else {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } catch (_e) {
        document.body.removeChild(ta);
        return Promise.resolve(false);
      }
      document.body.removeChild(ta);
    }
    return write
      .then(function () {
        if (btn) {
          var priorLabel = btn.getAttribute('aria-label') || defaultLabel;
          btn.textContent = 'Copied';
          btn.setAttribute('aria-label', 'Copied to clipboard');
          setTimeout(function () {
            btn.textContent = defaultLabel;
            btn.setAttribute('aria-label', priorLabel);
          }, 1500);
        }
        setModalCopyToast(toastMessage || 'Copied to clipboard');
        return true;
      })
      .catch(function () {
        setModalCopyToast('Copy failed — select text and copy manually');
        return false;
      });
  }

  function renderCurrentKey(current, sandbox) {
    var section = document.getElementById('mcpLabKeyCurrentSection');
    if (!section) return;

    var sb = sandbox || getGlobalSandboxName();

    if (!sb) {
      section.innerHTML =
        '<h4 class="mcp-key-section-title">Your MCP key</h4>' +
        '<p class="mcp-key-empty">Select a sandbox in the nav, then generate a key for that sandbox.</p>';
      return;
    }

    if (!current) {
      section.innerHTML =
        '<h4 class="mcp-key-section-title">Key for sandbox <code>' +
        escapeHtml(sb) +
        '</code></h4>' +
        '<p class="mcp-key-empty">No MCP key for <strong>' +
        escapeHtml(sb) +
        '</strong> yet. Click <strong>Generate key</strong> to create one scoped to this sandbox only.</p>';
      return;
    }

    var created = formatKeyDate(current.createdAt);
    var rotated = current.rotatedAt ? formatKeyDate(current.rotatedAt) : '';
    var keyLabel = String(current.keyLabel || 'MCP key');

    section.innerHTML =
      '<h4 class="mcp-key-section-title">' +
      escapeHtml(keyLabel) +
      ' — sandbox <code>' +
      escapeHtml(sb) +
      '</code></h4>' +
      '<p class="mcp-key-current-lead">This key works only in sandbox <strong>' +
      escapeHtml(sb) +
      '</strong>. The full secret is shown once when you generate or rotate.</p>' +
      '<dl class="mcp-key-current-meta">' +
      '<div class="mcp-key-current-meta-row">' +
      '<dt>Name</dt>' +
      '<dd>' +
      escapeHtml(keyLabel) +
      '</dd>' +
      '</div>' +
      '<div class="mcp-key-current-meta-row">' +
      '<dt>Key prefix</dt>' +
      '<dd><code class="mcp-key-current-prefix">' +
      escapeHtml(current.keyPrefix || '????????') +
      '…</code></dd>' +
      '</div>' +
      '<div class="mcp-key-current-meta-row">' +
      '<dt>Key ID</dt>' +
      '<dd><code>' +
      escapeHtml(current.keyId) +
      '</code></dd>' +
      '</div>' +
      '<div class="mcp-key-current-meta-row">' +
      '<dt>Sandbox</dt>' +
      '<dd><code>' +
      escapeHtml(keySandboxLabel(current)) +
      '</code></dd>' +
      '</div>' +
      '<div class="mcp-key-current-meta-row">' +
      '<dt>Created</dt>' +
      '<dd>' +
      escapeHtml(created) +
      '</dd>' +
      '</div>' +
      (rotated
        ? '<div class="mcp-key-current-meta-row"><dt>Last rotated</dt><dd>' +
          escapeHtml(rotated) +
          '</dd></div>'
        : '') +
      '</dl>' +
      '<p class="mcp-key-current-note">Reveal is available only in the browser tab that created or rotated this key. Rotation affects this key only; other keys remain active.</p>' +
      '<div class="mcp-key-actions-row">' +
      '<button type="button" class="dashboard-btn-outline" id="mcpLabKeyRevealBtn">Reveal key</button>' +
      '<button type="button" class="dashboard-btn-outline" id="mcpLabKeyRotateBtn">Rotate key</button>' +
      '<button type="button" class="dashboard-btn-outline" id="mcpLabKeyRevokeBtn">Revoke key</button>' +
      '<button type="button" class="dashboard-btn-outline" id="mcpLabKeyCopyCoworkerBtn">Copy Coworker config</button>' +
      '</div>';

    var revealBtn = document.getElementById('mcpLabKeyRevealBtn');
    var sessionSecret = readKeyFromSession(current.keyId);
    if (revealBtn) {
      revealBtn.disabled = !sessionSecret;
      revealBtn.title = sessionSecret
        ? 'Show the key saved in this browser session'
        : 'Generate or rotate a key in this tab to enable reveal';
      revealBtn.addEventListener('click', function () {
        var secret = readKeyFromSession(current.keyId);
        if (!secret) {
          setStatus('Key not in this session. Generate or rotate to reveal.', true);
          return;
        }
        showKeyModal(
          keyLabel + ' MCP API key for ' + sb,
          secret,
          'Stored for this browser tab only (sessionStorage). Copy before closing the tab.',
        );
      });
    }

    var rotateBtn = document.getElementById('mcpLabKeyRotateBtn');
    if (rotateBtn) {
      rotateBtn.addEventListener('click', function () {
        var ok = global.confirm(
          'Rotate the MCP API key for sandbox ' +
            sb +
            ' named "' +
            keyLabel +
            '"?\n\nOnly this key stops working immediately. Update the client that uses it.',
        );
        if (!ok) return;
        rotateKey(current.keyId);
      });
    }

    var revokeBtn = document.getElementById('mcpLabKeyRevokeBtn');
    if (revokeBtn) {
      revokeBtn.addEventListener('click', function () {
        var ok = global.confirm(
          'Revoke the "' + keyLabel + '" MCP API key for sandbox ' + sb + '? It will stop working immediately.',
        );
        if (!ok) return;
        revokeKey(current.keyId);
      });
    }

    var copyBtn = document.getElementById('mcpLabKeyCopyCoworkerBtn');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        var secret = readKeyFromSession(current.keyId);
        copyTextToClipboard(
          secret ? coworkerSnippet(secret) : coworkerSnippetPlaceholder(),
          copyBtn,
          'Copy Coworker config',
        );
      });
    }
  }

  function modalCopyField(fieldId, label, value, btnId, btnLabel) {
    return (
      '<div class="mcp-key-modal-field">' +
      '<label class="mcp-key-modal-label" for="' +
      fieldId +
      '">' +
      escapeHtml(label) +
      '</label>' +
      '<div class="mcp-key-modal-row">' +
      '<input id="' +
      fieldId +
      '" class="mcp-key-modal-input" type="text" readonly value="' +
      escapeHtml(value) +
      '">' +
      '<button type="button" class="dashboard-btn-outline" id="' +
      btnId +
      '" aria-label="Copy ' +
      escapeHtml(label) +
      '">' +
      escapeHtml(btnLabel) +
      '</button>' +
      '</div>' +
      '</div>'
    );
  }

  function showKeyModal(title, apiKey, warning) {
    var existing = document.getElementById(MODAL_ID);
    if (existing) existing.remove();

    var wrap = document.createElement('div');
    wrap.id = MODAL_ID;
    wrap.className = 'mcp-key-modal-backdrop';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-labelledby', 'mcpLabKeyModalTitle');

    var selectedEndpoint = MCP_ENDPOINTS[0];
    var endpointOptions = MCP_ENDPOINTS.map(function (endpoint) {
      return (
        '<option value="' +
        escapeHtml(endpoint.id) +
        '">' +
        escapeHtml(endpoint.label) +
        '</option>'
      );
    }).join('');
    wrap.innerHTML =
      '<div class="mcp-key-modal">' +
      '<div class="mcp-key-modal-header">' +
      '<h3 id="mcpLabKeyModalTitle" class="mcp-key-modal-title">' +
      escapeHtml(title) +
      '</h3>' +
      '<button type="button" class="dashboard-btn-outline mcp-key-modal-header-copy" id="mcpLabKeyCopyConfigBtn" aria-label="Copy Coworker config without API key (paste key separately)">Copy Coworker config</button>' +
      '</div>' +
      '<p class="mcp-key-modal-warning">' +
      escapeHtml(warning || 'Copy this key now. It will not be shown again.') +
      '</p>' +
      '<p id="mcpLabKeyModalCopyToast" class="mcp-key-modal-copy-toast" aria-live="polite"></p>' +
      '<div class="mcp-key-modal-field">' +
      '<label class="mcp-key-modal-label" for="mcpLabKeyEndpoint">MCP endpoint</label>' +
      '<select id="mcpLabKeyEndpoint" class="mcp-key-modal-input">' +
      endpointOptions +
      '</select>' +
      '</div>' +
      '<div class="mcp-key-modal-fields">' +
      modalCopyField('mcpLabKeyName', 'MCP name', selectedEndpoint.id, 'mcpLabKeyCopyNameBtn', 'Copy name') +
      modalCopyField('mcpLabKeyUrl', 'MCP URL', endpointUrl(selectedEndpoint), 'mcpLabKeyCopyUrlBtn', 'Copy URL') +
      modalCopyField(
        'mcpLabKeyHeader',
        'Header',
        MCP_HEADER_NAME,
        'mcpLabKeyCopyHeaderBtn',
        'Copy header',
      ) +
      modalCopyField('mcpLabKeyPlaintext', 'API key', apiKey, 'mcpLabKeyCopySecretBtn', 'Copy key') +
      '</div>' +
      '<details class="mcp-key-modal-snippet-details">' +
      '<summary class="mcp-key-modal-snippet-summary">Coworker / Cursor mcp.json preview</summary>' +
      '<textarea id="mcpLabKeySnippet" class="mcp-key-modal-snippet" readonly rows="8" aria-label="Coworker MCP config preview without secret">' +
      escapeHtml(coworkerSnippetPlaceholder(selectedEndpoint)) +
      '</textarea>' +
      '</details>' +
      '<div class="mcp-key-modal-actions">' +
      '<button type="button" class="dashboard-btn-outline" id="mcpLabKeyCopyAllBtn" aria-label="Copy complete Coworker config with API key filled in">Copy all</button>' +
      '<button type="button" class="dashboard-btn-primary" id="mcpLabKeyModalClose">Done</button>' +
      '</div>' +
      '</div>';

    document.body.appendChild(wrap);
    document.body.classList.add('mcp-key-modal-open');

    function syncSelectedEndpoint() {
      var select = document.getElementById('mcpLabKeyEndpoint');
      selectedEndpoint = endpointById(select && select.value);
      var nameInput = document.getElementById('mcpLabKeyName');
      var urlInput = document.getElementById('mcpLabKeyUrl');
      var snippetInput = document.getElementById('mcpLabKeySnippet');
      if (nameInput) nameInput.value = selectedEndpoint.id;
      if (urlInput) urlInput.value = endpointUrl(selectedEndpoint);
      if (snippetInput) snippetInput.value = coworkerSnippetPlaceholder(selectedEndpoint);
    }

    var endpointSelect = document.getElementById('mcpLabKeyEndpoint');
    if (endpointSelect) endpointSelect.addEventListener('change', syncSelectedEndpoint);

    var copyConfigBtn = document.getElementById('mcpLabKeyCopyConfigBtn');
    if (copyConfigBtn) {
      copyConfigBtn.addEventListener('click', function () {
        copyTextToClipboard(
          coworkerSnippetPlaceholder(selectedEndpoint),
          copyConfigBtn,
          'Copy Coworker config',
          'Coworker config copied (no secret) — paste your key into ' + MCP_HEADER_NAME,
        );
      });
    }

    var copyNameBtn = document.getElementById('mcpLabKeyCopyNameBtn');
    if (copyNameBtn) {
      copyNameBtn.addEventListener('click', function () {
        copyTextToClipboard(selectedEndpoint.id, copyNameBtn, 'Copy name', 'MCP name copied');
      });
    }

    var copyUrlBtn = document.getElementById('mcpLabKeyCopyUrlBtn');
    if (copyUrlBtn) {
      copyUrlBtn.addEventListener('click', function () {
        copyTextToClipboard(endpointUrl(selectedEndpoint), copyUrlBtn, 'Copy URL', 'MCP URL copied');
      });
    }

    var copyHeaderBtn = document.getElementById('mcpLabKeyCopyHeaderBtn');
    if (copyHeaderBtn) {
      copyHeaderBtn.addEventListener('click', function () {
        copyTextToClipboard(MCP_HEADER_NAME, copyHeaderBtn, 'Copy header', 'Header name copied');
      });
    }

    var copySecretBtn = document.getElementById('mcpLabKeyCopySecretBtn');
    if (copySecretBtn) {
      copySecretBtn.addEventListener('click', function () {
        copyTextToClipboard(apiKey, copySecretBtn, 'Copy key', 'API key copied');
      });
    }

    var copyAllBtn = document.getElementById('mcpLabKeyCopyAllBtn');
    if (copyAllBtn) {
      copyAllBtn.addEventListener('click', function () {
        copyTextToClipboard(
          coworkerSnippet(apiKey, selectedEndpoint),
          copyAllBtn,
          'Copy all',
          'Complete Coworker config copied (includes secret)',
        );
      });
    }

    var closeBtn = document.getElementById('mcpLabKeyModalClose');
    if (closeBtn) {
      closeBtn.addEventListener('click', closeKeyModal);
    }
    wrap.addEventListener('click', function (e) {
      if (e.target === wrap) closeKeyModal();
    });
  }

  function closeKeyModal() {
    var modal = document.getElementById(MODAL_ID);
    if (modal) modal.remove();
    document.body.classList.remove('mcp-key-modal-open');
  }

  function setStatus(msg, isError) {
    var el = document.getElementById('mcpLabKeyStatus');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'mcp-key-status' + (isError ? ' mcp-key-status--error' : '');
  }

  function renderKeysList(keys, sandbox) {
    var list = document.getElementById('mcpLabKeyList');
    if (!list) return;

    var currentSb = sandbox || getGlobalSandboxName();
    var active = activeKeysSorted(keys).filter(function (key) {
      return keySandboxLabel(key) === currentSb;
    });

    if (!active.length) {
      list.innerHTML = '<p class="mcp-key-empty">No active MCP keys for this sandbox yet.</p>';
      return;
    }

    list.innerHTML = active
      .map(function (k) {
        var sb = keySandboxLabel(k);
        var created = k.createdAt ? new Date(k.createdAt).toLocaleString() : '—';
        var isCurrent = k.keyId === selectedKeyId;
        return (
          '<article class="mcp-key-card' +
          (isCurrent ? ' mcp-key-card--current' : '') +
          '" data-key-id="' +
          escapeHtml(k.keyId) +
          '">' +
          '<div class="mcp-key-card-main">' +
          '<span class="mcp-key-card-name">' +
          escapeHtml(k.keyLabel || 'MCP key') +
          '</span>' +
          '<span class="mcp-key-card-prefix" title="Key prefix">' +
          escapeHtml(k.keyPrefix || '????????') +
          '…</span>' +
          '<span class="mcp-key-card-id">Sandbox <code>' +
          escapeHtml(sb) +
          '</code></span>' +
          (isCurrent ? '<span class="mcp-key-card-badge">Selected</span>' : '') +
          '<span class="mcp-key-card-meta">ID ' +
          escapeHtml(k.keyId) +
          '</span>' +
          '<span class="mcp-key-card-meta">Created: ' +
          escapeHtml(created) +
          '</span>' +
          '</div>' +
          '<div class="mcp-key-card-actions">' +
          '<button type="button" class="dashboard-btn-outline mcp-key-manage-btn" data-key-id="' +
          escapeHtml(k.keyId) +
          '">' +
          (isCurrent ? 'Managing' : 'Manage') +
          '</button>' +
          '</div>' +
          '</article>'
        );
      })
      .join('');

    Array.prototype.forEach.call(list.querySelectorAll('.mcp-key-manage-btn'), function (button) {
      button.addEventListener('click', function () {
        selectedKeyId = String(button.getAttribute('data-key-id') || '');
        refreshKeysFromCache();
      });
    });
  }

  function applyKeysPayload(data) {
    cachedKeysPayload = data;
    var sandbox = data.sandbox || getGlobalSandboxName();
    var sandboxKeys = activeKeysSorted(data.keys || []).filter(function (key) {
      return keySandboxLabel(key) === sandbox;
    });
    var selected = sandboxKeys.find(function (key) {
      return key.keyId === selectedKeyId;
    });
    if (!selected) {
      selected = data.currentKey || sandboxKeys[0] || null;
      selectedKeyId = selected ? selected.keyId : '';
    }
    renderCurrentKey(selected, sandbox);
    renderKeysList(data.keys || [], sandbox);
    var keyCount = sandboxKeys.length;
    var maxKeys = maxActiveKeysPerSandbox(data);
    var genBtn = document.getElementById('mcpLabKeyGenerateBtn');
    if (genBtn) {
      genBtn.disabled = !sandbox || keyCount >= maxKeys;
      genBtn.textContent = keyCount ? 'Generate additional key' : 'Generate key';
    }
    var limitHint = document.getElementById('mcpLabKeyLimitHint');
    if (limitHint) {
      limitHint.textContent =
        'Create separate named keys for ChatGPT, Adobe Coworker, or other clients. Up to ' +
        maxKeys +
        ' active keys are allowed for each sandbox; existing keys remain active.';
    }
    if (!sandbox) {
      setStatus('Select a sandbox in the nav to manage its MCP key.');
    } else if (keyCount) {
      setStatus(
        keyCount +
          ' active ' +
          (keyCount === 1 ? 'key' : 'keys') +
          ' for ' +
          sandbox +
          (keyCount >= maxKeys ? '. Revoke an unused key before creating another.' : '.'),
        keyCount >= maxKeys,
      );
    } else {
      setStatus('No key for ' + sandbox + ' yet.');
    }
  }

  function refreshKeysFromCache() {
    if (!cachedKeysPayload) return;
    applyKeysPayload(cachedKeysPayload);
  }

  function refreshKeys() {
    var sandbox = getGlobalSandboxName();
    if (!sandbox) {
      renderCurrentKey(null, '');
      renderKeysList([], '');
      var genBtn = document.getElementById('mcpLabKeyGenerateBtn');
      if (genBtn) genBtn.disabled = true;
      setStatus('Select a sandbox in the nav to manage its MCP key.');
      return Promise.resolve();
    }

    setStatus('Loading key for ' + sandbox + '…');
    return labAuthFetch(mcpKeysApiUrl())
      .then(function (res) {
        return res.json().then(function (data) {
          return { res: res, data: data };
        });
      })
      .then(function (pair) {
        if (!pair.res.ok) {
          throw new Error((pair.data && pair.data.error) || 'Failed to load keys');
        }
        applyKeysPayload(pair.data);
      })
      .catch(function (err) {
        setStatus(String(err.message || err), true);
      });
  }

  function generateKey() {
    var sandbox = getGlobalSandboxName();
    var labelInput = document.getElementById('mcpLabKeyNameInput');
    var keyLabel = labelInput ? String(labelInput.value || '').trim() : '';
    if (!sandbox) {
      setStatus('Select a sandbox in the nav first.', true);
      return;
    }
    if (!keyLabel) {
      setStatus('Enter a key name such as ChatGPT or Adobe Coworker.', true);
      if (labelInput) labelInput.focus();
      return;
    }
    setStatus('Generating "' + keyLabel + '" key for ' + sandbox + '…');
    labAuthFetch('/api/lab/mcp-keys?sandbox=' + encodeURIComponent(sandbox), {
      method: 'POST',
      body: JSON.stringify({ sandbox: sandbox, keyLabel: keyLabel }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { res: res, data: data };
        });
      })
      .then(function (pair) {
        if (!pair.res.ok) {
          throw new Error((pair.data && pair.data.error) || 'Generate failed');
        }
        storeKeyInSession(pair.data.keyId, pair.data.key);
        selectedKeyId = pair.data.keyId;
        if (labelInput) labelInput.value = '';
        showKeyModal(
          'New "' + (pair.data.keyLabel || keyLabel) + '" MCP API key for ' + sandbox,
          pair.data.key,
          pair.data.warning,
        );
        return refreshKeys();
      })
      .catch(function (err) {
        setStatus(String(err.message || err), true);
      });
  }

  function rotateKey(keyId) {
    var sandbox = getGlobalSandboxName();
    setStatus('Rotating key…');
    labAuthFetch('/api/lab/mcp-keys/rotate', {
      method: 'POST',
      body: JSON.stringify({ keyId: keyId, action: 'rotate' }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { res: res, data: data };
        });
      })
      .then(function (pair) {
        if (!pair.res.ok) {
          throw new Error((pair.data && pair.data.error) || 'Rotate failed');
        }
        storeKeyInSession(pair.data.keyId || keyId, pair.data.key);
        showKeyModal(
          'Rotated MCP key for ' + (pair.data.sandbox || sandbox),
          pair.data.key,
          pair.data.warning || 'The previous key no longer works. Update Coworker / Cursor headers.',
        );
        return refreshKeys();
      })
      .catch(function (err) {
        setStatus(String(err.message || err), true);
      });
  }

  function revokeKey(keyId) {
    setStatus('Revoking key…');
    labAuthFetch('/api/lab/mcp-keys?keyId=' + encodeURIComponent(keyId), {
      method: 'DELETE',
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { res: res, data: data };
        });
      })
      .then(function (pair) {
        if (!pair.res.ok) {
          throw new Error((pair.data && pair.data.error) || 'Revoke failed');
        }
        setStatus('Key revoked.');
        return refreshKeys();
      })
      .catch(function (err) {
        setStatus(String(err.message || err), true);
      });
  }

  function onGlobalSandboxChange() {
    selectedKeyId = '';
    refreshKeys();
  }

  function renderSignedOut() {
    var panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    panel.innerHTML =
      '<h3 class="mcp-key-panel-title">Your MCP API key</h3>' +
      '<p class="mcp-key-lead">Sign in to generate a personal <code>X-AEP-Lab-Mcp-Key</code> for the lab MCP (<code>' +
      escapeHtml(MCP_SERVER_ID) +
      '</code>). You can keep separate named keys for ChatGPT, Adobe Coworker, and other clients.</p>' +
      '<button type="button" class="dashboard-btn-primary" id="mcpLabKeySignInBtn">Sign in to lab</button>';
    var btn = document.getElementById('mcpLabKeySignInBtn');
    if (btn) {
      btn.addEventListener('click', function () {
        if (global.AepAccessOnboarding && typeof global.AepAccessOnboarding.open === 'function') {
          global.AepAccessOnboarding.open();
        }
      });
    }
  }

  function renderSignedInShell() {
    var panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    panel.innerHTML =
      '<h3 class="mcp-key-panel-title">Your MCP API key</h3>' +
      '<div id="mcpLabKeyCurrentSection" class="mcp-key-section mcp-key-current-section" aria-live="polite"></div>' +
      '<label class="mcp-key-label" for="mcpLabKeyNameInput">New key name</label>' +
      '<div class="mcp-key-actions-row">' +
      '<input type="text" id="mcpLabKeyNameInput" class="mcp-key-name-input" maxlength="60" placeholder="e.g. ChatGPT">' +
      '<button type="button" class="dashboard-btn-primary" id="mcpLabKeyGenerateBtn">Generate key</button>' +
      '</div>' +
      '<p class="mcp-key-hint" id="mcpLabKeyLimitHint">Create separate named keys for ChatGPT, Adobe Coworker, or other clients. Up to ' +
      DEFAULT_MAX_ACTIVE_KEYS_PER_SANDBOX +
      ' active keys are allowed for each sandbox; existing keys remain active.</p>' +
      '<p id="mcpLabKeyStatus" class="mcp-key-status" aria-live="polite"></p>' +
      '<h4 class="mcp-key-section-title mcp-key-list-heading">Active keys for selected sandbox</h4>' +
      '<div id="mcpLabKeyList" class="mcp-key-list"></div>';

    var genBtn = document.getElementById('mcpLabKeyGenerateBtn');
    if (genBtn) genBtn.addEventListener('click', generateKey);
    var nameInput = document.getElementById('mcpLabKeyNameInput');
    if (nameInput) {
      nameInput.addEventListener('keydown', function (event) {
        if (event.key === 'Enter') {
          event.preventDefault();
          generateKey();
        }
      });
    }
    refreshKeys();
  }

  function initPanel() {
    var panel = document.getElementById(PANEL_ID);
    if (!panel) return;

    var auth = getAuth();
    if (!auth) {
      renderSignedOut();
      return;
    }

    auth.onAuthStateChanged(function (user) {
      if (user) {
        renderSignedInShell();
      } else {
        renderSignedOut();
      }
    });
  }

  function injectPanel() {
    var labSection = document.querySelector('[data-mcp-section="lab"]');
    if (!labSection || document.getElementById(PANEL_ID)) return;

    var panel = document.createElement('section');
    panel.id = PANEL_ID;
    panel.className = 'mcp-key-panel';
    panel.setAttribute('aria-labelledby', 'mcpLabKeyPanelHeading');

    var tableWrap = labSection.querySelector('.mcp-table-wrap');
    if (tableWrap && tableWrap.nextSibling) {
      labSection.insertBefore(panel, tableWrap.nextSibling);
    } else {
      labSection.appendChild(panel);
    }
    initPanel();
  }

  global.addEventListener('aep-global-sandbox-change', onGlobalSandboxChange);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectPanel);
  } else {
    injectPanel();
  }
})(typeof window !== 'undefined' ? window : global);
