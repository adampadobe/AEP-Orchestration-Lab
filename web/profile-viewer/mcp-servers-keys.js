/**
 * Self-service MCP API keys on mcp-servers.html (AEP Orchestration Lab MCP row).
 */
(function (global) {
  'use strict';

  var MCP_URL = 'https://aep-lab-profile-mcp-109406613852.us-central1.run.app/mcp';
  var MCP_SERVER_ID = 'aep-orchestration-lab-mcp';
  var PANEL_ID = 'mcpLabKeyPanel';
  var MODAL_ID = 'mcpLabKeyModal';
  var KEY_PLACEHOLDER = '<paste your key — shown only at generate/rotate>';
  var selectedCurrentKeyId = null;
  var SESSION_KEY_PREFIX = 'aepLabMcpKeySecret:';

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

  function clearKeyFromSession(keyId) {
    if (!keyId) return;
    try {
      sessionStorage.removeItem(sessionKeyFor(keyId));
    } catch (_e) {}
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

  function coworkerSnippet(apiKey) {
    return JSON.stringify(
      {
        [MCP_SERVER_ID]: {
          type: 'streamable-http',
          url: MCP_URL,
          headers: {
            'X-AEP-Lab-Mcp-Key': apiKey,
          },
        },
      },
      null,
      2,
    );
  }

  function coworkerSnippetPlaceholder() {
    return coworkerSnippet(KEY_PLACEHOLDER);
  }

  function activeKeysSorted(keys) {
    return (keys || [])
      .filter(function (k) {
        return k && !k.revoked;
      })
      .sort(function (a, b) {
        var ta = a.createdAt ? Date.parse(a.createdAt) : 0;
        var tb = b.createdAt ? Date.parse(b.createdAt) : 0;
        return tb - ta;
      });
  }

  function resolveCurrentKey(keys, currentKeyFromApi) {
    var active = activeKeysSorted(keys);
    if (!active.length) return null;
    if (selectedCurrentKeyId) {
      var picked = active.find(function (k) {
        return k.keyId === selectedCurrentKeyId;
      });
      if (picked) return picked;
    }
    if (currentKeyFromApi && currentKeyFromApi.keyId) {
      var fromApi = active.find(function (k) {
        return k.keyId === currentKeyFromApi.keyId;
      });
      if (fromApi) return fromApi;
    }
    return active[0];
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

  function renderCurrentKey(keys, currentKeyFromApi) {
    var section = document.getElementById('mcpLabKeyCurrentSection');
    if (!section) return;

    var active = activeKeysSorted(keys);
    var current = resolveCurrentKey(keys, currentKeyFromApi);

    if (!current) {
      section.innerHTML =
        '<h4 class="mcp-key-section-title">Your active key</h4>' +
        '<p class="mcp-key-empty">No active MCP key yet. Select sandboxes below and click <strong>Generate key</strong>.</p>';
      return;
    }

    selectedCurrentKeyId = current.keyId;
    var sandboxes = Array.isArray(current.allowedSandboxes)
      ? current.allowedSandboxes.join(', ')
      : '—';
    var created = formatKeyDate(current.createdAt);
    var rotated = current.rotatedAt ? formatKeyDate(current.rotatedAt) : '';

    var pickerHtml = '';
    if (active.length > 1) {
      pickerHtml =
        '<label class="mcp-key-label" for="mcpLabKeyCurrentSelect">Active key</label>' +
        '<select id="mcpLabKeyCurrentSelect" class="mcp-key-current-select">' +
        active
          .map(function (k) {
            var label =
              (k.keyPrefix || '????????') +
              '… · ID ' +
              k.keyId +
              (k.createdAt ? ' · ' + formatKeyDate(k.createdAt) : '');
            return (
              '<option value="' +
              escapeHtml(k.keyId) +
              '"' +
              (k.keyId === current.keyId ? ' selected' : '') +
              '>' +
              escapeHtml(label) +
              '</option>'
            );
          })
          .join('') +
        '</select>';
    }

    section.innerHTML =
      '<h4 class="mcp-key-section-title">Your active key</h4>' +
      '<p class="mcp-key-current-lead">Metadata for your current MCP API key. The full secret is only shown once when you generate or rotate.</p>' +
      pickerHtml +
      '<dl class="mcp-key-current-meta">' +
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
      '<dt>Sandboxes</dt>' +
      '<dd>' +
      escapeHtml(sandboxes) +
      '</dd>' +
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
      '<p class="mcp-key-current-note">The full secret is shown once at generate/rotate. Use <strong>Reveal key</strong> while this browser tab is open, or <strong>Generate new key</strong> / <strong>Rotate key</strong> to issue a new secret.</p>' +
      '<div class="mcp-key-actions-row">' +
      '<button type="button" class="dashboard-btn-outline" id="mcpLabKeyRevealBtn">Reveal key</button>' +
      '<button type="button" class="dashboard-btn-outline" id="mcpLabKeyGenerateNewBtn">Generate new key</button>' +
      '<button type="button" class="dashboard-btn-outline" id="mcpLabKeyCopyCoworkerBtn">Copy Coworker config</button>' +
      '</div>';

    var selectEl = document.getElementById('mcpLabKeyCurrentSelect');
    if (selectEl) {
      selectEl.addEventListener('change', function () {
        selectedCurrentKeyId = selectEl.value || null;
        renderCurrentKey(keys, null);
      });
    }

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
          'Your MCP API key',
          secret,
          'Stored for this browser tab only (sessionStorage). Copy before closing the tab.',
        );
      });
    }

    var genNewBtn = document.getElementById('mcpLabKeyGenerateNewBtn');
    if (genNewBtn) {
      genNewBtn.addEventListener('click', function () {
        var sandboxes = Array.isArray(current.allowedSandboxes) ? current.allowedSandboxes : [];
        if (!sandboxes.length) {
          generateKey();
          return;
        }
        var boxes = document.querySelectorAll('input[name="mcpLabKeySandbox"]');
        boxes.forEach(function (el) {
          el.checked = sandboxes.indexOf(el.value) !== -1;
        });
        generateKey();
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

  function showKeyModal(title, apiKey, warning) {
    var existing = document.getElementById(MODAL_ID);
    if (existing) existing.remove();

    var wrap = document.createElement('div');
    wrap.id = MODAL_ID;
    wrap.className = 'mcp-key-modal-backdrop';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-labelledby', 'mcpLabKeyModalTitle');

    var snippetWithKey = coworkerSnippet(apiKey);
    var snippetPlaceholder = coworkerSnippetPlaceholder();
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
      '<label class="mcp-key-modal-label" for="mcpLabKeyPlaintext">API key</label>' +
      '<div class="mcp-key-modal-row">' +
      '<input id="mcpLabKeyPlaintext" class="mcp-key-modal-input" type="text" readonly value="' +
      escapeHtml(apiKey) +
      '">' +
      '<button type="button" class="dashboard-btn-outline" id="mcpLabKeyCopySecretBtn" aria-label="Copy API key secret only">Copy key</button>' +
      '</div>' +
      '<label class="mcp-key-modal-label" for="mcpLabKeySnippet">Coworker / Cursor mcp.json (preview — key slot empty)</label>' +
      '<textarea id="mcpLabKeySnippet" class="mcp-key-modal-snippet" readonly rows="8" aria-label="Coworker MCP config preview without secret">' +
      escapeHtml(snippetPlaceholder) +
      '</textarea>' +
      '<div class="mcp-key-modal-actions">' +
      '<button type="button" class="dashboard-btn-outline" id="mcpLabKeyCopyAllBtn" aria-label="Copy complete Coworker config with API key filled in">Copy all</button>' +
      '<button type="button" class="dashboard-btn-primary" id="mcpLabKeyModalClose">Done</button>' +
      '</div>' +
      '</div>';

    document.body.appendChild(wrap);
    document.body.classList.add('mcp-key-modal-open');

    if (apiKey && selectedCurrentKeyId) {
      storeKeyInSession(selectedCurrentKeyId, apiKey);
    } else if (apiKey) {
      storeKeyInSession('latest', apiKey);
    }

    var copyConfigBtn = document.getElementById('mcpLabKeyCopyConfigBtn');
    if (copyConfigBtn) {
      copyConfigBtn.addEventListener('click', function () {
        copyTextToClipboard(
          snippetPlaceholder,
          copyConfigBtn,
          'Copy Coworker config',
          'Coworker config copied (no secret) — paste your key into X-AEP-Lab-Mcp-Key',
        );
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
          snippetWithKey,
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

  function renderKeysList(keys) {
    var list = document.getElementById('mcpLabKeyList');
    if (!list) return;

    var active = (keys || []).filter(function (k) {
      return k && !k.revoked;
    });

    if (!active.length) {
      list.innerHTML = '<p class="mcp-key-empty">No active MCP keys yet.</p>';
      return;
    }

    list.innerHTML = active
      .map(function (k) {
        var sandboxes = Array.isArray(k.allowedSandboxes) ? k.allowedSandboxes.join(', ') : '—';
        var created = k.createdAt ? new Date(k.createdAt).toLocaleString() : '—';
        return (
          '<article class="mcp-key-card" data-key-id="' +
          escapeHtml(k.keyId) +
          '">' +
          '<div class="mcp-key-card-main">' +
          '<span class="mcp-key-card-prefix" title="Key prefix">' +
          escapeHtml(k.keyPrefix || '????????') +
          '…</span>' +
          '<span class="mcp-key-card-id">ID ' +
          escapeHtml(k.keyId) +
          '</span>' +
          '<span class="mcp-key-card-meta">Sandboxes: ' +
          escapeHtml(sandboxes) +
          '</span>' +
          '<span class="mcp-key-card-meta">Created: ' +
          escapeHtml(created) +
          '</span>' +
          '</div>' +
          '<div class="mcp-key-card-actions">' +
          '<button type="button" class="dashboard-btn-outline mcp-key-rotate-btn" data-key-id="' +
          escapeHtml(k.keyId) +
          '">Rotate key</button>' +
          '<button type="button" class="dashboard-btn-outline mcp-key-revoke-btn" data-key-id="' +
          escapeHtml(k.keyId) +
          '">Revoke</button>' +
          '</div>' +
          '</article>'
        );
      })
      .join('');

    list.querySelectorAll('.mcp-key-rotate-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var keyId = btn.getAttribute('data-key-id');
        if (!keyId) return;
        var ok = global.confirm(
          'Rotate this MCP API key?\n\nThe current key will stop working immediately. Update X-AEP-Lab-Mcp-Key in Coworker or Cursor with the new value. Your key ID and MCP URL stay the same.',
        );
        if (!ok) return;
        rotateKey(keyId);
      });
    });

    list.querySelectorAll('.mcp-key-revoke-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var keyId = btn.getAttribute('data-key-id');
        if (!keyId) return;
        var ok = global.confirm('Revoke this MCP API key? It will stop working immediately.');
        if (!ok) return;
        revokeKey(keyId);
      });
    });
  }

  function renderSandboxPicker(allowedSandboxes) {
    var wrap = document.getElementById('mcpLabKeySandboxes');
    if (!wrap) return;
    var list = Array.isArray(allowedSandboxes) ? allowedSandboxes : [];
    if (!list.length) {
      wrap.innerHTML =
        '<p class="mcp-key-hint">No active Adobe sandboxes returned. Complete your lab workspace profile or retry after lab API access is available.</p>';
      return;
    }
    wrap.innerHTML = list
      .map(function (sb, i) {
        return (
          '<label class="mcp-key-sandbox-opt">' +
          '<input type="checkbox" name="mcpLabKeySandbox" value="' +
          escapeHtml(sb) +
          '"' +
          (i === 0 ? ' checked' : '') +
          '> ' +
          escapeHtml(sb) +
          '</label>'
        );
      })
      .join('');
  }

  function selectedSandboxes() {
    var boxes = document.querySelectorAll('input[name="mcpLabKeySandbox"]:checked');
    var out = [];
    boxes.forEach(function (el) {
      if (el.value) out.push(el.value);
    });
    return out;
  }

  function refreshKeys() {
    setStatus('Loading keys…');
    return labAuthFetch('/api/lab/mcp-keys')
      .then(function (res) {
        return res.json().then(function (data) {
          return { res: res, data: data };
        });
      })
      .then(function (pair) {
        if (!pair.res.ok) {
          throw new Error((pair.data && pair.data.error) || 'Failed to load keys');
        }
        renderSandboxPicker(pair.data.allowedSandboxes);
        renderCurrentKey(pair.data.keys, pair.data.currentKey);
        renderKeysList(pair.data.keys);
        var active = (pair.data.keys || []).filter(function (k) {
          return k && !k.revoked;
        }).length;
        var max = pair.data.maxActiveKeys || 3;
        var genBtn = document.getElementById('mcpLabKeyGenerateBtn');
        if (genBtn) genBtn.disabled = active >= max;
        setStatus(active ? active + ' active key(s) · max ' + max : '');
      })
      .catch(function (err) {
        setStatus(String(err.message || err), true);
      });
  }

  function generateKey() {
    var sandboxes = selectedSandboxes();
    if (!sandboxes.length) {
      setStatus('Select at least one sandbox.', true);
      return;
    }
    setStatus('Generating key…');
    labAuthFetch('/api/lab/mcp-keys', {
      method: 'POST',
      body: JSON.stringify({ sandboxes: sandboxes }),
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
        selectedCurrentKeyId = pair.data.keyId || selectedCurrentKeyId;
        storeKeyInSession(pair.data.keyId, pair.data.key);
        showKeyModal('Your new MCP API key', pair.data.key, pair.data.warning);
        return refreshKeys();
      })
      .catch(function (err) {
        setStatus(String(err.message || err), true);
      });
  }

  function rotateKey(keyId) {
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
        selectedCurrentKeyId = pair.data.keyId || keyId;
        storeKeyInSession(pair.data.keyId || keyId, pair.data.key);
        showKeyModal(
          'Rotated MCP API key',
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

  function renderSignedOut() {
    var panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    panel.innerHTML =
      '<h3 class="mcp-key-panel-title">Your MCP API key</h3>' +
      '<p class="mcp-key-lead">Sign in with lab access to generate a personal <code>X-AEP-Lab-Mcp-Key</code> for <strong>AEP Orchestration Lab MCP</strong> (<code>' +
      escapeHtml(MCP_SERVER_ID) +
      '</code>).</p>' +
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
      '<p class="mcp-key-lead">Generate a personal key for <strong>AEP Orchestration Lab MCP</strong> (<code>' +
      escapeHtml(MCP_SERVER_ID) +
      '</code>). Keys are scoped to sandboxes you select. Max 3 active keys per user.</p>' +
      '<div id="mcpLabKeyCurrentSection" class="mcp-key-section mcp-key-current-section" aria-live="polite"></div>' +
      '<div class="mcp-key-section">' +
      '<p class="mcp-key-label">Allowed sandboxes</p>' +
      '<div id="mcpLabKeySandboxes" class="mcp-key-sandboxes"></div>' +
      '</div>' +
      '<div class="mcp-key-actions-row">' +
      '<button type="button" class="dashboard-btn-primary" id="mcpLabKeyGenerateBtn">Generate key</button>' +
      '</div>' +
      '<p id="mcpLabKeyStatus" class="mcp-key-status" aria-live="polite"></p>' +
      '<h4 class="mcp-key-section-title mcp-key-list-heading">All keys</h4>' +
      '<div id="mcpLabKeyList" class="mcp-key-list"></div>';

    var genBtn = document.getElementById('mcpLabKeyGenerateBtn');
    if (genBtn) genBtn.addEventListener('click', generateKey);
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectPanel);
  } else {
    injectPanel();
  }
})(typeof window !== 'undefined' ? window : global);
