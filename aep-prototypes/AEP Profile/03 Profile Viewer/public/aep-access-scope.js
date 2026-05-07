(function (global) {
  'use strict';

  var LS_MODE = 'aepAccessMode';
  var LS_WORKSPACE_NAME = 'aepWorkspaceName';
  var LS_WORKSPACE_SLUG = 'aepWorkspaceSlug';
  var MODE_SANDBOX = 'sandbox';
  var MODE_WORKSPACE = 'workspace';

  function safeGet(key) {
    try {
      return localStorage.getItem(key) || '';
    } catch (_e) {
      return '';
    }
  }

  function safeSet(key, val) {
    try {
      localStorage.setItem(key, String(val || ''));
    } catch (_e) {}
  }

  function safeRemove(key) {
    try {
      localStorage.removeItem(key);
    } catch (_e) {}
  }

  function toSlug(raw) {
    return String(raw || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64);
  }

  function modeValue(raw) {
    return raw === MODE_WORKSPACE ? MODE_WORKSPACE : MODE_SANDBOX;
  }

  function hasExplicitMode() {
    return !!safeGet(LS_MODE);
  }

  function getAccessMode() {
    return modeValue(safeGet(LS_MODE));
  }

  function getWorkspaceName() {
    return String(safeGet(LS_WORKSPACE_NAME) || '').trim();
  }

  function getWorkspaceSlug() {
    var direct = toSlug(safeGet(LS_WORKSPACE_SLUG));
    if (direct) return direct;
    return toSlug(getWorkspaceName());
  }

  function dispatchChange() {
    try {
      global.dispatchEvent(new CustomEvent('aep-access-scope-change', { detail: getScope() }));
    } catch (_e) {}
  }

  function setAccessMode(mode) {
    safeSet(LS_MODE, modeValue(mode));
    dispatchChange();
  }

  function setWorkspaceName(name) {
    var value = String(name || '').trim().slice(0, 120);
    var slug = toSlug(value);
    if (value) safeSet(LS_WORKSPACE_NAME, value);
    else safeRemove(LS_WORKSPACE_NAME);
    if (slug) safeSet(LS_WORKSPACE_SLUG, slug);
    else safeRemove(LS_WORKSPACE_SLUG);
    dispatchChange();
  }

  function setWorkspaceSlug(slug) {
    var value = toSlug(slug);
    if (value) safeSet(LS_WORKSPACE_SLUG, value);
    else safeRemove(LS_WORKSPACE_SLUG);
    dispatchChange();
  }

  function getSandboxNameFromStorage() {
    return String(safeGet('aepGlobalSandboxName') || '').trim();
  }

  function getScope() {
    var mode = getAccessMode();
    if (mode === MODE_WORKSPACE) {
      var workspaceSlug = getWorkspaceSlug();
      return {
        mode: MODE_WORKSPACE,
        scopeType: MODE_WORKSPACE,
        scopeId: workspaceSlug,
        workspaceName: getWorkspaceName(),
        sandbox: '',
        hasScope: !!workspaceSlug,
      };
    }
    var sandbox = getSandboxNameFromStorage();
    return {
      mode: MODE_SANDBOX,
      scopeType: MODE_SANDBOX,
      scopeId: sandbox,
      workspaceName: '',
      sandbox: sandbox,
      hasScope: !!sandbox,
    };
  }

  function buildScopeQuery() {
    var scope = getScope();
    var params = new URLSearchParams();
    if (scope.scopeType === MODE_WORKSPACE) {
      if (scope.scopeId) {
        params.set('scopeType', MODE_WORKSPACE);
        params.set('scopeId', scope.scopeId);
      }
      return params.toString();
    }
    if (scope.scopeId) params.set('sandbox', scope.scopeId);
    return params.toString();
  }

  function appendScope(url) {
    var qs = buildScopeQuery();
    if (!qs) return url;
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + qs;
  }

  global.AepAccessScope = {
    LS_MODE: LS_MODE,
    LS_WORKSPACE_NAME: LS_WORKSPACE_NAME,
    LS_WORKSPACE_SLUG: LS_WORKSPACE_SLUG,
    MODE_SANDBOX: MODE_SANDBOX,
    MODE_WORKSPACE: MODE_WORKSPACE,
    hasExplicitMode: hasExplicitMode,
    getAccessMode: getAccessMode,
    setAccessMode: setAccessMode,
    getWorkspaceName: getWorkspaceName,
    getWorkspaceSlug: getWorkspaceSlug,
    setWorkspaceName: setWorkspaceName,
    setWorkspaceSlug: setWorkspaceSlug,
    toSlug: toSlug,
    getScope: getScope,
    buildScopeQuery: buildScopeQuery,
    appendScope: appendScope,
  };
})(typeof window !== 'undefined' ? window : this);
