/**
 * Shared POST /api/aep proxy client for Profile Viewer pages.
 * Core fetch + response parsing — logging and sandbox headers stay in callers.
 */
(function (global) {
  'use strict';

  async function aepCall(payload) {
    var res;
    try {
      res = await fetch('/api/aep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      return {
        httpOk: false,
        networkError: true,
        status: 0,
        data: { error: 'Network error calling /api/aep', detail: String(e.message || e) },
      };
    }
    var text = await res.text();
    var data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch (err) {
      data = { error: 'Non-JSON from proxy', detail: text.slice(0, 200) };
    }
    return { httpOk: res.ok, networkError: false, status: res.status, data: data };
  }

  global.AepProxyClient = { aepCall: aepCall };
})(typeof window !== 'undefined' ? window : this);
