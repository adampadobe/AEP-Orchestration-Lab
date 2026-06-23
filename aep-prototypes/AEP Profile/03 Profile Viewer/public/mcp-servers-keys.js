/**
 * Self-service MCP API keys on mcp-servers.html (lab Profile MCP row).
 */
(function (global) {
  'use strict';

  var MCP_URL = 'https://aep-lab-profile-mcp-109406613852.us-central1.run.app/mcp';
  var PANEL_ID = 'mcpLabKeyPanel';
  var MODAL_ID = 'mcpLabKeyModal';

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
        'aep-lab-profile': {
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

  function showKeyModal(title, apiKey, warning) {
    var existing = document.getElementById(MODAL_ID);
    if (existing) existing.remove();

    var wrap = document.createElement('div');
    wrap.id = MODAL_ID;
    wrap.className = 'mcp-key-modal-backdrop';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-labelledby', 'mcpLabKeyModalTitle');

    var snippet = coworkerSnippet(apiKey);
    wrap.innerHTML =
      '<div class="mcp-key-modal">' +
      '<h3 id="mcpLabKeyModalTitle" class="mcp-key-modal-title">' +
      escapeHtml(title) +
      '</h3>' +
      '<p class="mcp-key-modal-warning">' +
      escapeHtml(warning || 'Copy this key now. It will not be shown again.') +
      '</p>' +
      '<label class="mcp-key-modal-label" for="mcpLabKeyPlaintext">API key</label>' +
      '<div class="mcp-key-modal-row">' +
      '<input id="mcpLabKeyPlaintext" class="mcp-key-modal-input" type="text" readonly value="' +
      escapeHtml(apiKey) +
      '">' +
      '<button type="button" class="dashboard-btn-outline mcp-key-copy-btn" data-copy-target="mcpLabKeyPlaintext">Copy key</button>' +
      '</div>' +
      '<label class="mcp-key-modal-label" for="mcpLabKeySnippet">Coworker / Cursor mcp.json snippet</label>' +
      '<textarea id="mcpLabKeySnippet" class="mcp-key-modal-snippet" readonly rows="8">' +
      escapeHtml(snippet) +
      '</textarea>' +
      '<div class="mcp-key-modal-actions">' +
      '<button type="button" class="dashboard-btn-outline mcp-key-copy-btn" data-copy-target="mcpLabKeySnippet">Copy snippet</button>' +
      '<button type="button" class="dashboard-btn-primary" id="mcpLabKeyModalClose">Done</button>' +
      '</div>' +
      '</div>';

    document.body.appendChild(wrap);
    document.body.classList.add('mcp-key-modal-open');

    wrap.querySelectorAll('.mcp-key-copy-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-copy-target');
        var el = id ? document.getElementById(id) : null;
        if (!el) return;
        el.select();
        el.setSelectionRange(0, 99999);
        try {
          navigator.clipboard.writeText(el.value);
          btn.textContent = 'Copied';
          setTimeout(function () {
            btn.textContent = id === 'mcpLabKeyPlaintext' ? 'Copy key' : 'Copy snippet';
          }, 1500);
        } catch (_e) {}
      });
    });

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
        '<p class="mcp-key-hint">Complete your lab workspace profile to see allowed sandboxes.</p>';
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
      '<p class="mcp-key-lead">Sign in with lab access to generate a personal <code>X-AEP-Lab-Mcp-Key</code> for the Profile MCP (scoped to your workspace sandbox).</p>' +
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
      '<p class="mcp-key-lead">Generate a personal key for <strong>AEP Orchestration Lab — Profile MCP</strong>. Keys are scoped to your workspace sandbox. Max 3 active keys per user.</p>' +
      '<div class="mcp-key-section">' +
      '<p class="mcp-key-label">Allowed sandboxes</p>' +
      '<div id="mcpLabKeySandboxes" class="mcp-key-sandboxes"></div>' +
      '</div>' +
      '<div class="mcp-key-actions-row">' +
      '<button type="button" class="dashboard-btn-primary" id="mcpLabKeyGenerateBtn">Generate key</button>' +
      '</div>' +
      '<p id="mcpLabKeyStatus" class="mcp-key-status" aria-live="polite"></p>' +
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
