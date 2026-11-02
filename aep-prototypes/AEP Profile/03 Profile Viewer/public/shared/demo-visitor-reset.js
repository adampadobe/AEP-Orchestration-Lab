/**
 * Reload-based visitor reset. Never sends events or uses a cached ECID as proof.
 */
(function attachDemoVisitorReset(global) {
  'use strict';
  if (global.AepDemoVisitorReset) return;

  var MARKER_KEY = 'aep-demo-visitor-reset-v1';
  var INVALIDATION_KEY = 'aep-demo-visitor-invalidated-v1';
  var config = {};
  var adapters = [];
  var marker = null;
  var state = { status: 'idle', blocked: false, message: '' };
  var verification = null;
  var resetPromise = null;
  var generation = 0;
  var timer = null;
  var invalidationReady = Promise.resolve();
  var resetPage = false;
  var resumeGeneration = -1;
  var completedDetail = null;
  var verifyingEcid = '';
  var sdkWindows = new WeakMap();
  var sdkRecords = [];
  var guardWarnings = [];
  var guardedFrames = new WeakSet();

  function submissionError() {
    var error = new Error('Adobe sendEvent blocked: the visitor reset is pending, failed, or invalidated. ' +
      'Verify a new visitor or reload before submitting identity or experience events.');
    error.code = 'AEP_DEMO_VISITOR_BLOCKED';
    return error;
  }

  function warnGuard(message) {
    if (guardWarnings.indexOf(message) !== -1) return;
    guardWarnings.push(message);
    if (global.console && typeof global.console.warn === 'function') global.console.warn('[Visitor reset]', message);
    emit('aep-demo-visitor-reset-guard-warning', { message: message });
  }

  function rejectQueuedSubmissions(fn) {
    if (!state.blocked || typeof fn !== 'function' || !Array.isArray(fn.q)) return;
    // Adobe's supported bootstrap queue contains [resolve, reject, arguments].
    for (var i = fn.q.length - 1; i >= 0; i--) {
      var entry = fn.q[i];
      if (entry && entry[2] && entry[2][0] === 'sendEvent') {
        fn.q.splice(i, 1);
        if (typeof entry[1] === 'function') entry[1](submissionError());
      }
    }
  }

  function guardSdkName(win, record, name) {
    if (typeof name !== 'string' || !name || /^(?:__proto__|prototype|constructor|__alloyNS)$/.test(name)) return;
    var descriptor = Object.getOwnPropertyDescriptor(win, name);
    if (record.names.has(name) && descriptor && descriptor.get === record.names.get(name)) return;
    if (descriptor && (!descriptor.configurable || descriptor.get || descriptor.set)) {
      warnGuard('Cannot safely intercept SDK instance "' + name + '" with an existing accessor or non-configurable binding.');
      return;
    }
    var current = descriptor && descriptor.value;
    var proxies = new WeakMap();
    function wrap(value) {
      if (typeof value !== 'function') return value;
      rejectQueuedSubmissions(value);
      if (proxies.has(value)) return proxies.get(value);
      var wrapped = new Proxy(value, {
        apply: function (target, receiver, args) {
          if (state.blocked && args[0] === 'sendEvent') return Promise.reject(submissionError());
          return Reflect.apply(target, receiver, args);
        }
      });
      proxies.set(value, wrapped);
      proxies.set(wrapped, wrapped);
      return wrapped;
    }
    current = wrap(current);
    var binding = {
      get: function () { return current; },
      set: function (value) { current = wrap(value); },
      configurable: true,
      enumerable: descriptor ? descriptor.enumerable : true
    };
    try {
      Object.defineProperty(win, name, binding);
      record.names.set(name, binding.get);
      sdkRecords.push({ win: win, name: name, getter: binding.get });
    } catch (error) {
      warnGuard('Could not guard SDK instance "' + name + '": ' + error.message);
    }
  }

  function guardSdkWindow(win) {
    // Only the same-origin Window API may be inspected; never bypass frame origin boundaries.
    try {
      if (!win || !win.document) return false;
      var record = sdkWindows.get(win);
      if (!record) {
        record = { names: new Map(), namespaceArrays: new WeakMap() };
        sdkWindows.set(win, record);
        guardSdkName(win, record, 'alloy');
        guardSdkName(win, record, config.alloyInstanceName);
        var descriptor = Object.getOwnPropertyDescriptor(win, '__alloyNS');
        if (!descriptor || (descriptor.configurable && !descriptor.get && !descriptor.set)) {
          var namespaces;
          function wrapNamespaces(value) {
            if (!Array.isArray(value)) return value;
            if (record.namespaceArrays.has(value)) return record.namespaceArrays.get(value);
            value.forEach(function (name) { guardSdkName(win, record, name); });
            var originalPush = value.push;
            Object.defineProperty(value, 'push', {
              configurable: true, writable: true, enumerable: false,
              value: function () {
                Array.prototype.forEach.call(arguments, function (name) { guardSdkName(win, record, name); });
                return Reflect.apply(originalPush, this, arguments);
              }
            });
            var proxy = new Proxy(value, {
              set: function (target, key, item, receiver) {
                if (/^\d+$/.test(String(key))) guardSdkName(win, record, item);
                return Reflect.set(target, key, item, receiver);
              }
            });
            record.namespaceArrays.set(value, proxy);
            record.namespaceArrays.set(proxy, proxy);
            return proxy;
          }
          namespaces = wrapNamespaces(descriptor && descriptor.value);
          Object.defineProperty(win, '__alloyNS', {
            configurable: true, enumerable: descriptor ? descriptor.enumerable : true,
            get: function () { return namespaces; },
            set: function (value) { namespaces = wrapNamespaces(value); }
          });
        } else {
          (win.__alloyNS || []).forEach(function (name) { guardSdkName(win, record, name); });
          warnGuard('Adobe __alloyNS cannot be observed safely; late custom instance names require guardSdkWindow().');
        }
      }
      guardSdkName(win, record, 'alloy');
      guardSdkName(win, record, config.alloyInstanceName);
      (win.__alloyNS || []).forEach(function (name) { guardSdkName(win, record, name); });
      return true;
    } catch (error) {
      warnGuard('An iframe SDK is not accessible to the visitor reset guard (cross-origin or detached).');
      return false;
    }
  }

  function guardFrames() {
    if (typeof global.document.querySelectorAll !== 'function') return;
    global.document.querySelectorAll('iframe').forEach(function (frame) {
      if (!guardedFrames.has(frame)) {
        guardedFrames.add(frame);
        frame.addEventListener('load', function () { guardSdkWindow(frame.contentWindow); });
      }
      guardSdkWindow(frame.contentWindow);
    });
  }

  function emit(name, detail) {
    global.dispatchEvent(new global.CustomEvent(name, { detail: detail }));
  }

  function setState(status, message) {
    state = { status: status, blocked: !/^(idle|complete)$/.test(status), message: message || '' };
    sdkRecords.forEach(function (record) {
      try {
        var descriptor = Object.getOwnPropertyDescriptor(record.win, record.name);
        if (!descriptor || descriptor.get !== record.getter) {
          warnGuard('SDK binding "' + record.name + '" was redefined outside the supported assignment lifecycle; refresh its guard explicitly.');
          return;
        }
        rejectQueuedSubmissions(record.win[record.name]);
      } catch (error) {
        warnGuard('A previously guarded SDK frame is no longer accessible after navigation.');
      }
    });
    var statusEl = global.document.getElementById('aepLabProfileStatus');
    if (statusEl) {
      statusEl.textContent = state.message;
      statusEl.setAttribute('role', status === 'error' ? 'alert' : 'status');
    }
    emit('aep-demo-visitor-reset-state', Object.assign({}, state));
  }

  function fail(error) {
    var message = 'Visitor reset failed: ' + (error && error.message ? error.message : String(error));
    global.clearTimeout(timer);
    if (marker) {
      marker.status = 'error';
      try { global.sessionStorage.setItem(MARKER_KEY, JSON.stringify(marker)); }
      catch (storageError) { global.console.error('[Visitor reset] Could not retain failure state.', storageError); }
    }
    setState('error', message);
    global.console.error('[Visitor reset]', message);
    if (global.AepLabConsole && typeof global.AepLabConsole.error === 'function') {
      global.AepLabConsole.error('visitor-reset', message);
    }
    return error instanceof Error ? error : new Error(message);
  }

  function readJson(storage, key) {
    var raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }

  function ecidFrom(value) {
    if (typeof value === 'string') return /^\d{38}$/.test(value.trim()) ? value.trim() : '';
    if (!value || typeof value !== 'object') return '';
    if (Array.isArray(value)) {
      for (var i = 0; i < value.length; i++) {
        var id = ecidFrom(value[i]);
        if (id) return id;
      }
      return '';
    }
    return ecidFrom(value.identity && (value.identity.ECID || value.identity.ecid)) ||
      ecidFrom(value.ECID || value.ecid || value.id);
  }

  function sdk() {
    if (typeof config.getSdk === 'function') return config.getSdk();
    if (typeof config.alloy === 'function') return config.alloy;
    return global[config.alloyInstanceName || 'alloy'];
  }

  function timeoutMs() {
    return Number(config.timeoutMs) > 0 ? Number(config.timeoutMs) : 15000;
  }

  function bounded(promise, ms, message) {
    return new Promise(function (resolve, reject) {
      var timeout = global.setTimeout(function () { reject(new Error(message)); }, ms);
      Promise.resolve(promise).then(function (value) {
        global.clearTimeout(timeout);
        resolve(value);
      }, function (error) {
        global.clearTimeout(timeout);
        reject(error);
      });
    });
  }

  function prefix() {
    return String(config.storagePrefix || config.prefix || 'demoTagsInjection');
  }

  function sandbox() {
    var select = global.document.getElementById('sandboxSelect');
    return String((global.AepGlobalSandbox && global.AepGlobalSandbox.getSelected()) ||
      (select && select.value) || config.defaultSandbox || '__default__').trim().toLowerCase();
  }

  function scriptUrl() {
    var p = prefix();
    var sk = sandbox();
    var session = global.AepLabTagsInjectSession;
    var prefs = global.AepLabEnvBarPrefs;
    var doc = prefs && prefs.getDoc();
    var field = global.document.getElementById(config.selectedScriptId || p + 'SelectedScript');
    var script = global.document.getElementById(p + 'LaunchScript');
    var legacy = readJson(global.localStorage, p + 'SelectedLaunchScriptBySandbox') || {};
    return String(config.scriptUrl ||
      (session && session.readScript(p, sk)) ||
      (doc && doc.tagsBySandbox && doc.tagsBySandbox[sk] && doc.tagsBySandbox[sk].launchScript) ||
      legacy[sk] || (field && (field.value || field.textContent)) ||
      (script && script.src) || '').trim();
  }

  function saveScript(url) {
    if (!url || url === 'None') return;
    var session = global.AepLabTagsInjectSession;
    if (session) session.writeScript(prefix(), sandbox(), url);
    global.sessionStorage.setItem(prefix() + 'PendingLaunchInject', url);
  }

  function orgName(value) {
    return String(value || '').replace(/%40/ig, '@').replace(/(?:@|_)AdobeOrg$/i, '');
  }

  function cookieOrg(name) {
    var match = /^kndctr_(.+)_AdobeOrg_(?:identity|cluster)$/.exec(name) ||
      /^AMCVS?_(.+)(?:%40|@)AdobeOrg$/i.exec(name);
    return match ? orgName(match[1]) : '';
  }

  function cookieNames() {
    return global.document.cookie.split(';').map(function (cookie) {
      return cookie.trim().split('=')[0];
    }).filter(Boolean);
  }

  function activeOrg() {
    var supplied = orgName(config.orgId || config.imsOrgId);
    if (supplied) return supplied;
    var orgs = Array.from(new Set(cookieNames().map(cookieOrg).filter(Boolean)));
    if (orgs.length === 1) return orgs[0];
    throw new Error('Cannot identify the active Adobe organization safely. Configure orgId before resetting.');
  }

  function clearCookies(org) {
    var names = cookieNames().filter(function (name) { return cookieOrg(name) === org || name === 's_ecid'; });
    names = Array.from(new Set(names.concat([
      'kndctr_' + org + '_AdobeOrg_identity', 'kndctr_' + org + '_AdobeOrg_cluster',
      'AMCV_' + org + '%40AdobeOrg', 'AMCVS_' + org + '%40AdobeOrg',
      'AMCV_' + org + '@AdobeOrg', 'AMCVS_' + org + '@AdobeOrg', 's_ecid'
    ])));
    var labels = global.location.hostname.split('.');
    var domains = [''];
    for (var i = 0; i < labels.length - 1; i++) {
      domains.push(labels.slice(i).join('.'), '.' + labels.slice(i).join('.'));
    }
    var parts = global.location.pathname.split('/');
    var paths = ['/'];
    for (var j = 1; j < parts.length; j++) {
      var path = parts.slice(0, j + 1).join('/');
      paths.push(path, path + '/');
    }
    names.forEach(function (name) {
      domains.forEach(function (domain) {
        paths.forEach(function (path) {
          global.document.cookie = name + '=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=' +
            path + (domain ? '; Domain=' + domain : '') + (global.location.protocol === 'https:' ? '; Secure' : '');
        });
      });
    });
  }

  function clearIdentityCaches() {
    [global.localStorage, global.sessionStorage].forEach(function (storage) {
      var keys = [];
      for (var i = 0; i < storage.length; i++) keys.push(storage.key(i));
      keys.forEach(function (key) {
        if (/LastResolvedEcidBySandbox$/.test(key)) {
          var map = readJson(storage, key) || {};
          Object.keys(map).forEach(function (sk) { map[sk] = ''; });
          storage.setItem(key, JSON.stringify(map));
        }
      });
      storage.removeItem('aep-demo-session-identifier-v1');
    });
    var prefs = global.AepLabEnvBarPrefs;
    var doc = prefs ? prefs.getDoc() : readJson(global.localStorage, 'aepLabEnvBarV1');
    if (doc && doc.tagsBySandbox) {
      var patch = {};
      Object.keys(doc.tagsBySandbox).forEach(function (sk) { patch[sk] = { ecid: '' }; });
      if (prefs) prefs.patchDoc({ tagsBySandbox: patch });
      else {
        Object.keys(patch).forEach(function (sk) { doc.tagsBySandbox[sk].ecid = ''; });
        global.localStorage.setItem('aepLabEnvBarV1', JSON.stringify(doc));
      }
    }
  }

  function clearUi() {
    var email = global.document.getElementById('customerEmail');
    if (email) {
      email.value = '';
      email.removeAttribute('data-profile-email');
    }
    var drawer = global.DemoProfileDrawer;
    if (drawer && typeof drawer.clearDrawerVisitorState === 'function') drawer.clearDrawerVisitorState();
  }

  function invokeAdapters(hook, detail) {
    return Promise.all(adapters.map(function (adapter) {
      return typeof adapter[hook] === 'function' ? adapter[hook](detail) : undefined;
    }));
  }

  function invalidate(detail) {
    clearUi();
    clearIdentityCaches();
    return invokeAdapters('invalidate', detail);
  }

  function availability() {
    var available = false;
    var reason = '';
    try {
      available = typeof sdk() === 'function';
      if (!available) reason = 'Inject and configure the Web SDK before resetting the visitor.';
    } catch (error) { reason = error.message; }
    return { available: available, canReset: available && !/^(restoring|resetting|pending|verifying)$/.test(state.status), reason: reason };
  }

  function pending() {
    return !!marker && /^(restoring|pending|verifying)$/.test(state.status);
  }

  async function complete(ecid, token) {
    await invalidationReady;
    if (token !== generation || !pending()) return true;
    if (!ecid) throw new Error('Adobe returned no usable ECID; no new visitor has been verified.');
    if (ecid === marker.oldEcid) {
      throw new Error('Adobe returned the previous ECID. Identity cookies may be inaccessible or restored; the visitor was not reset.');
    }
    var detail = { ecid: ecid };
    await invokeAdapters('afterReset', detail);
    if (token !== generation || !pending()) return true;
    var drawer = global.DemoProfileDrawer;
    if (drawer && typeof drawer.patchLastProfileOrUpdate === 'function') {
      drawer.patchLastProfileOrUpdate({
        ecid: ecid, identities: [{ namespace: 'ECID', value: ecid }],
        events: [], eventsStory: [], audiences: { realized: [], exited: [] }
      });
    }
    global.sessionStorage.removeItem(MARKER_KEY);
    marker = null;
    completedDetail = detail;
    global.clearTimeout(timer);
    setState('complete', 'New anonymous visitor ready. No identity stitch or experience event was sent by reset.');
    emit('aep-demo-visitor-reset-complete', detail);
    return true;
  }

  function acceptEcid(value) {
    if (!pending()) {
      if (state.status === 'error' || state.status === 'invalidated') return Promise.reject(new Error(state.message));
      if (state.status === 'complete' && ecidFrom(value) !== completedDetail.ecid) {
        return Promise.reject(fail(new Error('A stale or unavailable ECID arrived after reset verification. Reload or retry reset before using this visitor.')));
      }
      return Promise.resolve(state.status !== 'idle');
    }
    var ecid = ecidFrom(value);
    if (!ecid || ecid === marker.oldEcid || (verifyingEcid && ecid !== verifyingEcid)) {
      generation++;
      return Promise.reject(fail(new Error(!ecid ?
        'Adobe returned no usable ECID; no new visitor has been verified.' :
        'Adobe returned the previous ECID or an inconsistent identity. Identity cookies may be inaccessible or restored; the visitor was not reset.')));
    }
    if (!verification) {
      var token = generation;
      verifyingEcid = ecid;
      verification = complete(ecid, token).catch(function (error) {
        if (token === generation && pending()) fail(error);
        throw error;
      });
    }
    return verification;
  }

  function resume() {
    if (!pending()) return;
    var token = generation;
    if (resumeGeneration === token) return;
    resumeGeneration = token;
    var deadline = Date.now() + timeoutMs();
    timer = global.setTimeout(function () {
      if (token === generation && pending()) {
        generation++;
        fail(new Error('Timed out waiting for a verified new ECID. Check the restored Tags script and Adobe cookies, then retry reset.'));
      }
    }, timeoutMs());
    (async function waitForIdentity() {
      while (token === generation && pending() && Date.now() < deadline) {
        var alloy = sdk();
        if (typeof alloy === 'function') {
          var result = await bounded(alloy('getIdentity', { namespaces: ['ECID'] }),
            Math.max(1, deadline - Date.now()), 'Timed out waiting for Adobe getIdentity.');
          if (token === generation && pending()) await acceptEcid(result);
          return;
        }
        await new Promise(function (resolve) { global.setTimeout(resolve, 100); });
      }
    })().catch(function (error) {
      if (token === generation && pending()) fail(error);
    });
  }

  function init(cfg) {
    config = Object.assign({}, config, cfg || {});
    guardSdkWindow(global);
    guardFrames();
    if (marker && state.status === 'restoring') {
      try {
        invalidationReady = Promise.resolve(invalidate({ reason: 'resume', oldEcid: marker.oldEcid }));
        invalidationReady.catch(function (error) { fail(error); });
        setState(marker.status === 'error' ? 'error' : 'pending',
          marker.status === 'error' ? 'Visitor reset is unverified. Retry reset; sending and stitching remain blocked.' :
            'Restoring Web SDK and verifying a new anonymous visitor…');
        if (pending()) resume();
      } catch (error) { fail(error); }
    } else {
      emit('aep-demo-visitor-reset-state', Object.assign({}, state));
    }
    return api;
  }

  async function performReset() {
    if (!availability().canReset) {
      throw fail(new Error(availability().reason || 'A visitor reset is already in progress.'));
    }
    if (!global.confirm('Reset this visitor and request a new ECID? Adobe identity cookies are shared across tabs on this origin/organization. Other open demos will be invalidated. Existing AEP profiles are NOT deleted. Sandbox, Tags, datastream, settings, and recent emails are preserved.')) return false;
    generation++;
    var token = generation;
    global.clearTimeout(timer);
    verification = null;
    verifyingEcid = '';
    setState('resetting', 'Reading the live Adobe ECID before resetting…');
    try {
      var oldEcid = ecidFrom(await bounded(sdk()('getIdentity', { namespaces: ['ECID'] }),
        timeoutMs(), 'Timed out reading the live Adobe ECID. No reset was performed.'));
      if (token !== generation) throw new Error('Another tab changed the visitor while reset was starting. Reload or retry.');
      if (!oldEcid) throw new Error('No live Adobe ECID is available. Inject/configure the SDK before resetting.');
      var org = activeOrg();
      await bounded(invokeAdapters('beforeReset', { oldEcid: oldEcid }), timeoutMs(), 'A demo could not prepare for visitor reset.');
      if (token !== generation) throw new Error('Another tab changed the visitor while reset was preparing. Reload or retry.');
      marker = {
        version: 1, id: String(Date.now()) + '-' + Math.random().toString(36).slice(2),
        oldEcid: oldEcid, orgId: org, prefix: prefix(), sandbox: sandbox(),
        scriptUrl: scriptUrl(), status: 'pending'
      };
      global.sessionStorage.setItem(MARKER_KEY, JSON.stringify(marker));
      saveScript(marker.scriptUrl);
      emit('aep-demo-visitor-reset-start', { oldEcid: oldEcid });
      await bounded(invalidate({ reason: 'reset', oldEcid: oldEcid }), timeoutMs(), 'A demo could not clear its visitor state.');
      if (token !== generation) throw new Error('Another tab changed the visitor while reset was preparing. Reload or retry.');
      clearCookies(org);
      global.localStorage.setItem(INVALIDATION_KEY, JSON.stringify({
        id: marker.id, orgId: org, oldEcid: oldEcid
      }));
      setState('resetting', 'Reloading to discard Web SDK identity memory…');
      global.location.reload();
      return true;
    } catch (error) {
      // Errors deliberately keep sending blocked, even when failure preceded cookie deletion.
      throw fail(error);
    }
  }

  function reset() {
    if (resetPromise) return resetPromise;
    resetPromise = performReset().finally(function () { resetPromise = null; });
    return resetPromise;
  }

  function registerAdapter(adapter) {
    adapters.push(adapter);
    if (state.blocked && typeof adapter.invalidate === 'function') {
      try {
        var result = adapter.invalidate({ reason: 'register', status: state.status });
        invalidationReady = Promise.all([invalidationReady, result]);
        invalidationReady.catch(function (error) { fail(error); });
      } catch (error) { fail(error); }
    } else if (completedDetail && typeof adapter.afterReset === 'function') {
      try {
        bounded(adapter.afterReset(completedDetail), timeoutMs(), 'A demo could not finish visitor reset.')
          .catch(function (error) { fail(error); });
      } catch (error) { fail(error); }
    }
    return function () { adapters = adapters.filter(function (item) { return item !== adapter; }); };
  }

  global.addEventListener('storage', function (event) {
    if (event.key !== INVALIDATION_KEY || !event.newValue) return;
    try {
      var detail = JSON.parse(event.newValue);
      if (!detail.id || !ecidFrom(detail.oldEcid) || !detail.orgId || (marker && detail.id === marker.id)) return;
      generation++;
      global.clearTimeout(timer);
      verification = null;
      verifyingEcid = '';
      marker = Object.assign({}, detail, {
        version: 1, status: 'pending', prefix: prefix(), sandbox: sandbox(), scriptUrl: scriptUrl()
      });
      setState('invalidated', 'Another tab reset the Adobe visitor. Reload this demo or reset again before sending or looking up a profile.');
      global.sessionStorage.setItem(MARKER_KEY, JSON.stringify(marker));
      saveScript(marker.scriptUrl);
      invalidationReady = Promise.resolve(invalidate({ reason: 'cross-tab' }));
      invalidationReady.catch(function (error) { fail(error); });
      emit('aep-demo-visitor-invalidated', { reason: 'cross-tab' });
    } catch (error) { fail(error); }
  });

  try {
    marker = readJson(global.sessionStorage, MARKER_KEY);
    if (marker) {
      resetPage = true;
      if (marker.version !== 1 || !ecidFrom(marker.oldEcid)) throw new Error('The saved visitor reset cannot be verified. Retry reset.');
      state = { status: 'restoring', blocked: true, message: 'A visitor reset is awaiting verification.' };
    }
  } catch (error) { fail(error); }

  var api = {
    init: init, reset: reset, resume: resume, acceptEcid: acceptEcid,
    isBlocked: function () { return state.blocked; }, isPending: pending,
    isResetPage: function () { return resetPage; },
    availability: availability, canReset: function () { return availability().canReset; },
    getState: function () { return Object.assign({}, state); }, registerAdapter: registerAdapter
  };
  api.guardSdkWindow = guardSdkWindow;
  api.getGuardWarnings = function () { return guardWarnings.slice(); };
  global.AepDemoVisitorReset = api;
  guardSdkWindow(global);
  guardFrames();
  if (typeof global.MutationObserver === 'function' && global.document.documentElement) {
    new global.MutationObserver(guardFrames).observe(global.document.documentElement, { childList: true, subtree: true });
  }
})(window);
