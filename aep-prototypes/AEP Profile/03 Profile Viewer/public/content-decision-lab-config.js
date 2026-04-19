/**
 * Decision lab Edge — load/save Firestore config, inject Adobe Launch from saved URL.
 * Requires: firebase auth (anonymous), AepGlobalSandbox, AepLabSandboxSync.getAuthHeaders
 */
(function (global) {
  'use strict';

  async function labAuthFetch(url, options) {
    options = options || {};
    var extra =
      typeof AepLabSandboxSync !== 'undefined' && AepLabSandboxSync.getAuthHeaders
        ? await AepLabSandboxSync.getAuthHeaders()
        : {};
    return fetch(url, {
      ...options,
      headers: { ...extra, ...(options.headers || {}) },
    });
  }

  function sandboxQs() {
    var n =
      typeof AepGlobalSandbox !== 'undefined' && AepGlobalSandbox.getSandboxName
        ? String(AepGlobalSandbox.getSandboxName() || '').trim()
        : '';
    return n ? '?sandbox=' + encodeURIComponent(n) : '';
  }

  /**
   * @returns {Promise<{ ok: boolean, record?: object, storage?: string, error?: string }>}
   */
  async function fetchDecisionLabConfig() {
    var qs = sandboxQs();
    if (!qs) return { ok: false, error: 'Select a sandbox first.' };
    var res = await labAuthFetch('/api/decision-lab/config' + qs);
    return res.json().catch(function () {
      return { ok: false };
    });
  }

  /**
   * @param {object} body fields to save
   */
  async function saveDecisionLabConfig(body) {
    var sb =
      typeof AepGlobalSandbox !== 'undefined' && AepGlobalSandbox.getSandboxName
        ? String(AepGlobalSandbox.getSandboxName() || '').trim()
        : '';
    if (!sb) return { ok: false, error: 'Select a sandbox first.' };
    var res = await labAuthFetch('/api/decision-lab/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({ sandbox: sb }, body || {})),
    });
    return res.json().catch(function () {
      return { ok: false };
    });
  }

  function injectLaunchFromUrl(scriptUrl, scriptId) {
    scriptId = scriptId || 'cd-edge-launch-script';
    return new Promise(function (resolve, reject) {
      var existing = document.getElementById(scriptId);
      if (existing) existing.remove();
      var u = String(scriptUrl || '').trim();
      if (!u) {
        reject(new Error('No Launch script URL configured.'));
        return;
      }
      if (!/^https:\/\//i.test(u)) {
        reject(new Error('Launch URL must start with https://'));
        return;
      }
      var s = document.createElement('script');
      s.id = scriptId;
      s.async = true;
      s.src = u;
      s.onload = function () {
        resolve(u);
      };
      s.onerror = function () {
        reject(new Error('Failed to load: ' + u));
      };
      document.head.appendChild(s);
    });
  }

  global.CdLabConfigApi = {
    labAuthFetch: labAuthFetch,
    sandboxQs: sandboxQs,
    fetchDecisionLabConfig: fetchDecisionLabConfig,
    saveDecisionLabConfig: saveDecisionLabConfig,
    injectLaunchFromUrl: injectLaunchFromUrl,
  };
})(typeof window !== 'undefined' ? window : globalThis);
