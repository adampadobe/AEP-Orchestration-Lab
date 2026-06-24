/**
 * Scoped localStorage persistence for Solutions Consultant Command Centre.
 * Keyed by Firebase user + active sandbox so each consultant sees their own data.
 */
(function attachHomeCommandStore(global) {
  'use strict';

  var STORAGE_VERSION = 'v1';
  var listeners = [];

  function safeJsonParse(raw, fallback) {
    try {
      return raw ? JSON.parse(raw) : fallback;
    } catch (_e) {
      return fallback;
    }
  }

  function resolveUserKey() {
    try {
      var auth = global.firebase && global.firebase.auth && global.firebase.auth();
      var user = auth && auth.currentUser;
      if (user && user.uid) return String(user.uid);
      if (user && user.email) return String(user.email).split('@')[0].toLowerCase();
    } catch (_e) {}
    try {
      var slug =
        global.AepAccessScope && typeof global.AepAccessScope.getWorkspaceSlug === 'function'
          ? global.AepAccessScope.getWorkspaceSlug()
          : '';
      if (slug) return 'ws:' + slug;
    } catch (_e2) {}
    return 'anonymous';
  }

  function resolveSandboxKey() {
    if (global.AepLabSandboxSync && typeof global.AepLabSandboxSync.getSandbox === 'function') {
      var sb = global.AepLabSandboxSync.getSandbox();
      if (sb) return String(sb).toLowerCase();
    }
    if (global.AepGlobalSandbox && typeof global.AepGlobalSandbox.getSandboxName === 'function') {
      var name = String(global.AepGlobalSandbox.getSandboxName() || '').trim();
      if (name) return name.toLowerCase();
    }
    try {
      var ls = String(localStorage.getItem('aepGlobalSandboxName') || '').trim();
      if (ls) return ls.toLowerCase();
    } catch (_e) {}
    return 'no-sandbox';
  }

  function storageKey() {
    return (
      'aepCommandCentre:' +
      STORAGE_VERSION +
      ':' +
      resolveUserKey() +
      ':' +
      resolveSandboxKey()
    );
  }

  function generateId(prefix) {
    return (prefix || 'id') + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function defaultState() {
    return {
      customers: [],
      tasks: [],
      meetings: [],
      activity: [],
      pocs: [],
      knowledgeBase: [],
      capacity: [],
      updatedAt: new Date().toISOString(),
    };
  }

  function loadState() {
    try {
      var raw = localStorage.getItem(storageKey());
      var parsed = safeJsonParse(raw, null);
      if (!parsed || typeof parsed !== 'object') return defaultState();
      return {
        customers: Array.isArray(parsed.customers) ? parsed.customers : [],
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
        meetings: Array.isArray(parsed.meetings) ? parsed.meetings : [],
        activity: Array.isArray(parsed.activity) ? parsed.activity : [],
        pocs: Array.isArray(parsed.pocs) ? parsed.pocs : [],
        knowledgeBase: Array.isArray(parsed.knowledgeBase) ? parsed.knowledgeBase : [],
        capacity: Array.isArray(parsed.capacity) ? parsed.capacity : [],
        updatedAt: parsed.updatedAt || new Date().toISOString(),
      };
    } catch (_e) {
      return defaultState();
    }
  }

  function saveState(state) {
    var next = Object.assign({}, state, { updatedAt: new Date().toISOString() });
    try {
      localStorage.setItem(storageKey(), JSON.stringify(next));
    } catch (_e) {}
    listeners.forEach(function (fn) {
      try {
        fn(next);
      } catch (_e2) {}
    });
    return next;
  }

  function saveLocalCache(state) {
    var next = Object.assign({}, state, { updatedAt: new Date().toISOString() });
    try {
      localStorage.setItem(storageKey(), JSON.stringify(next));
    } catch (_e) {}
    return next;
  }

  function subscribe(fn) {
    if (typeof fn === 'function') listeners.push(fn);
    return function unsubscribe() {
      listeners = listeners.filter(function (f) {
        return f !== fn;
      });
    };
  }

  function getScope() {
    return {
      userKey: resolveUserKey(),
      sandboxKey: resolveSandboxKey(),
      storageKey: storageKey(),
    };
  }

  global.HomeCommandStore = {
    loadState: loadState,
    saveState: saveState,
    saveLocalCache: saveLocalCache,
    subscribe: subscribe,
    generateId: generateId,
    getScope: getScope,
    defaultState: defaultState,
  };
})(window);
