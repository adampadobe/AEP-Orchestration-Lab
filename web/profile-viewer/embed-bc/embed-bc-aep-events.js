/**
 * Brand Concierge → AEP Experience Events via existing alloy sendEvent.
 * Adds `_demoemea.brandConcierge` (conversationID, turnIndex, actorType, …) and
 * mirrors anonymous demo tenant identification (`_demoemea.identification.core.ecid`
 * + identityMap.ECID) when a lab ECID is known.
 */
(function (global) {
  'use strict';

  var TENANT_KEY = '_demoemea';
  var EVENT_TYPE = 'web.interaction';
  var CONV_STORAGE_KEY = 'aepBcConversationId';
  var TURN_STORAGE_KEY = 'aepBcTurnIndex';
  var BC_MOUNT_SELECTOR =
    '#brand-concierge-mount, #bcBottomDockMount, #bcModalBarMount, #siteCloneBcFrameMount, #siteCloneBcInline, .bc-bottom-dock__mount';
  var ECID_UI_ID = 'infoEcid';
  var DEDUPE_MS = 900;

  function bcDebug() {
    try {
      return global.localStorage.getItem('aepLabBcEventsDebug') === '1';
    } catch (_e) {
      return false;
    }
  }

  function bcLog() {
    if (!bcDebug()) return;
    try {
      var args = ['[embed-bc-aep-events]'].concat(Array.prototype.slice.call(arguments));
      global.console.log.apply(global.console, args);
    } catch (_e2) {
      /* noop */
    }
  }

  function readSession(key) {
    try {
      return global.sessionStorage.getItem(key);
    } catch (_e) {
      return null;
    }
  }

  function writeSession(key, value) {
    try {
      global.sessionStorage.setItem(key, String(value));
    } catch (_e2) {
      /* quota / private mode */
    }
  }

  function sandboxKey() {
    try {
      if (global.AepLabEnvBarPrefs && typeof global.AepLabEnvBarPrefs.sandboxKey === 'function') {
        return global.AepLabEnvBarPrefs.sandboxKey(global.AepLabEnvBarPrefs.getSelectedSandbox());
      }
    } catch (_e) {
      /* noop */
    }
    try {
      if (global.AepGlobalSandbox && typeof global.AepGlobalSandbox.getSandboxName === 'function') {
        var n = String(global.AepGlobalSandbox.getSandboxName() || '')
          .trim()
          .toLowerCase();
        if (n) return n.replace(/[^a-z0-9_-]/g, '_');
      }
    } catch (_e2) {
      /* noop */
    }
    return '__default__';
  }

  function normaliseEcidDigits(raw) {
    var v = String(raw || '').trim();
    if (!v || v === '—' || v === '-') return '';
    return /^\d+$/.test(v) ? v : '';
  }

  function readEcidFromUnifiedPrefs() {
    try {
      if (!global.AepLabEnvBarPrefs || typeof global.AepLabEnvBarPrefs.getDoc !== 'function') return '';
      var doc = global.AepLabEnvBarPrefs.getDoc();
      var sk = sandboxKey();
      var entry = doc && doc.tagsBySandbox && doc.tagsBySandbox[sk];
      return normaliseEcidDigits(entry && entry.ecid);
    } catch (_e) {
      return '';
    }
  }

  function readEcidFromLegacyMaps() {
    try {
      if (!global.AepLabEnvBarPrefs || typeof global.AepLabEnvBarPrefs.readMap !== 'function') return '';
      for (var i = 0; i < global.localStorage.length; i++) {
        var key = global.localStorage.key(i);
        if (!key || key.indexOf('LastResolvedEcidBySandbox') === -1) continue;
        var map = global.AepLabEnvBarPrefs.readMap(key);
        var hit = normaliseEcidDigits(map[sandboxKey()]);
        if (hit) return hit;
      }
    } catch (_e2) {
      /* noop */
    }
    return '';
  }

  function resolveLabEcid() {
    var fromUi = normaliseEcidDigits(
      global.document && global.document.getElementById
        ? (global.document.getElementById(ECID_UI_ID) || {}).textContent
        : '',
    );
    if (fromUi) return fromUi;
    var fromUnified = readEcidFromUnifiedPrefs();
    if (fromUnified) return fromUnified;
    return readEcidFromLegacyMaps();
  }

  function newConversationId() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') {
      return global.crypto.randomUUID();
    }
    return 'bc-' + Date.now() + '-' + Math.random().toString(16).slice(2, 10);
  }

  function resetConversationState() {
    var id = newConversationId();
    writeSession(CONV_STORAGE_KEY, id);
    writeSession(TURN_STORAGE_KEY, '1');
    writeSession('aepBcConversationStartSent', '');
    return id;
  }

  function getOrCreateConversationId(options) {
    options = options || {};
    if (options.newConversation) {
      return resetConversationState();
    }
    var existing = readSession(CONV_STORAGE_KEY);
    if (existing) return existing;
    return resetConversationState();
  }

  function readTurnIndex() {
    var raw = readSession(TURN_STORAGE_KEY);
    var current = parseInt(raw, 10);
    if (!Number.isFinite(current) || current < 1) current = 1;
    return current;
  }

  function allocateTurnIndex() {
    var current = readTurnIndex();
    writeSession(TURN_STORAGE_KEY, String(current + 1));
    return current;
  }

  function prepareMetaForSend(meta) {
    meta = meta || {};
    if (meta.turnIndex == null) meta.turnIndex = allocateTurnIndex();
    return meta;
  }

  function defaultActorType(interactionType) {
    switch (interactionType) {
      case 'userMessage':
      case 'recommendationClicked':
      case 'meetingBooked':
        return 'user';
      case 'assistantResponse':
      case 'recommendationPresented':
        return 'assistant';
      default:
        return 'system';
    }
  }

  function extractUserText(payload) {
    if (global.ArmyBcLocalEngine && typeof global.ArmyBcLocalEngine.extractUserMessage === 'function') {
      var fromEngine = global.ArmyBcLocalEngine.extractUserMessage(payload);
      if (fromEngine) return fromEngine;
    }
    if (typeof payload?.message === 'string' && payload.message.trim()) {
      return payload.message.trim();
    }
    if (global.__embedBcLastUserText) return String(global.__embedBcLastUserText).trim();
    return '';
  }

  function inferIntent(text) {
    if (global.ArmyBcLocalEngine && typeof global.ArmyBcLocalEngine.intentFromText === 'function') {
      var hit = global.ArmyBcLocalEngine.intentFromText(String(text || ''));
      if (hit && hit.kind) return String(hit.kind);
    }
    return 'general';
  }

  function inferProductCategory(text, intent) {
    var i = intent || inferIntent(text);
    return i && i !== 'general' ? String(i) : 'general';
  }

  function edgeConfigOverrides() {
    try {
      if (
        global.SiteCloneBcConfig &&
        typeof global.SiteCloneBcConfig.getDatastreamId === 'function'
      ) {
        var id = String(global.SiteCloneBcConfig.getDatastreamId() || '')
          .trim()
          .toLowerCase();
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) {
          return { edgeConfigOverrides: { datastreamId: id } };
        }
      }
    } catch (_e) {
      /* noop */
    }
    try {
      if (global.DemoLabEdgeConfig && typeof global.DemoLabEdgeConfig.edgeConfigOverrides === 'function') {
        var lab = global.DemoLabEdgeConfig.edgeConfigOverrides();
        if (lab && lab.edgeConfigOverrides && lab.edgeConfigOverrides.datastreamId) return lab;
      }
    } catch (_e2) {
      /* noop */
    }
    return {};
  }

  function mergeDemoemeaIdentification(xdm) {
    var next = xdm && typeof xdm === 'object' ? Object.assign({}, xdm) : {};
    var ecid = resolveLabEcid();
    if (!ecid) return next;

    var tenant =
      next[TENANT_KEY] && typeof next[TENANT_KEY] === 'object' ? Object.assign({}, next[TENANT_KEY]) : {};
    var identification =
      tenant.identification && typeof tenant.identification === 'object'
        ? Object.assign({}, tenant.identification)
        : {};
    var core =
      identification.core && typeof identification.core === 'object'
        ? Object.assign({}, identification.core)
        : {};
    if (!core.ecid) core.ecid = ecid;
    identification.core = core;
    tenant.identification = identification;
    next[TENANT_KEY] = tenant;

    var identityMap =
      next.identityMap && typeof next.identityMap === 'object' ? Object.assign({}, next.identityMap) : {};
    if (!Array.isArray(identityMap.ECID) || !identityMap.ECID.length) {
      identityMap.ECID = [{ id: ecid, primary: true }];
    }
    next.identityMap = identityMap;
    return next;
  }

  function buildBrandConciergeFields(meta) {
    meta = meta || {};
    var interactionType = String(meta.interactionType || '').trim();
    if (!interactionType) return null;
    if (meta.turnIndex == null) return null;
    var text = String(meta.text || '').trim();
    var intent = String(meta.intent || inferIntent(text)).trim() || 'general';
    var actorType = String(meta.actorType || defaultActorType(interactionType)).trim();
    if (actorType !== 'user' && actorType !== 'assistant' && actorType !== 'system') {
      actorType = defaultActorType(interactionType);
    }
    return {
      conversationID: getOrCreateConversationId({ newConversation: !!meta.newConversation }),
      interactionType: interactionType,
      intent: intent,
      productCategory: String(meta.productCategory || inferProductCategory(text, intent)).trim() || 'general',
      turnIndex: meta.turnIndex,
      actorType: actorType,
    };
  }

  function enrichSendEventOptions(options, meta) {
    var base = options && typeof options === 'object' ? options : {};
    var xdm = base.xdm && typeof base.xdm === 'object' ? Object.assign({}, base.xdm) : {};
    if (
      xdm[TENANT_KEY] &&
      typeof xdm[TENANT_KEY] === 'object' &&
      xdm[TENANT_KEY].brandConcierge &&
      typeof xdm[TENANT_KEY].brandConcierge === 'object'
    ) {
      return base;
    }
    var bc = buildBrandConciergeFields(meta);
    if (!bc) return base;
    xdm.eventType = EVENT_TYPE;
    var tenant =
      xdm[TENANT_KEY] && typeof xdm[TENANT_KEY] === 'object' ? Object.assign({}, xdm[TENANT_KEY]) : {};
    tenant.brandConcierge = bc;
    xdm[TENANT_KEY] = tenant;
    xdm = mergeDemoemeaIdentification(xdm);
    return Object.assign({}, base, edgeConfigOverrides(), { xdm: xdm });
  }

  var recentDedupe = {};

  function shouldSendInteraction(meta) {
    var key =
      String(meta.interactionType || '') +
      '|' +
      String(meta.text || '').slice(0, 80) +
      '|' +
      String(meta.intent || '');
    var now = Date.now();
    if (recentDedupe[key] && now - recentDedupe[key] < DEDUPE_MS) return false;
    recentDedupe[key] = now;
    return true;
  }

  function resolveAlloyFn(win) {
    var w = win || global;
    if (typeof w.alloy === 'function') return w.alloy;
    return null;
  }

  function sendBrandConciergeInteraction(alloyFn, meta, extraOptions, win) {
    meta = meta || {};
    if (!shouldSendInteraction(meta)) return Promise.resolve(null);
    meta = prepareMetaForSend(meta);
    var alloy = typeof alloyFn === 'function' ? alloyFn : resolveAlloyFn(win);
    if (typeof alloy !== 'function') {
      bcLog('skip sendEvent — alloy unavailable', meta.interactionType);
      return Promise.resolve(null);
    }
    var payload = enrichSendEventOptions(extraOptions || {}, meta);
    bcLog('sendEvent', meta.interactionType, payload);
    return Promise.resolve(alloy('sendEvent', payload))
      .then(function (result) {
        bcLog('sendEvent OK', meta.interactionType, result);
        if (global.AepLabDebug && typeof global.AepLabDebug.logSendEvent === 'function') {
          global.AepLabDebug.logSendEvent('bc:' + (meta.interactionType || 'interaction'), payload, result, null);
        }
        return result;
      })
      .catch(function (err) {
        console.warn('[embed-bc-aep-events] sendEvent failed:', meta.interactionType, err);
        if (global.AepLabDebug && typeof global.AepLabDebug.logSendEvent === 'function') {
          global.AepLabDebug.logSendEvent('bc:' + (meta.interactionType || 'interaction'), payload, null, err);
        }
        return null;
      });
  }

  function chainOnBeforeEventSend(existingFn) {
    return function (content) {
      var base = content;
      if (typeof existingFn === 'function') {
        var out = existingFn(content);
        if (out !== undefined) base = out;
      }
      if (!base || typeof base !== 'object') base = content || {};
      var meta = global.__embedBcPendingAepMeta;
      global.__embedBcPendingAepMeta = null;
      if (!meta) {
        meta = { interactionType: 'userMessage', actorType: 'user', text: extractUserText(base) };
      }
      if (!shouldSendInteraction(meta)) return base;
      return enrichSendEventOptions(base, prepareMetaForSend(meta));
    };
  }

  function responseHasRecommendations(result) {
    try {
      var handles = result && result.handle;
      if (!Array.isArray(handles)) return false;
      for (var i = 0; i < handles.length; i++) {
        var payloads = handles[i] && handles[i].payload;
        if (!Array.isArray(payloads)) continue;
        for (var j = 0; j < payloads.length; j++) {
          var response = payloads[j] && payloads[j].response;
          var mm = response && response.multimodalElements;
          var elements = (mm && mm.elements) || (response && response.multimodalElements);
          if (Array.isArray(elements) && elements.length) return true;
          if (Array.isArray(response && response.widgets) && response.widgets.length) return true;
        }
      }
    } catch (_e) {
      /* noop */
    }
    return false;
  }

  function wrapAlloyInstance(alloyFn, win) {
    if (typeof alloyFn !== 'function' || alloyFn.__embedBcAepEventsWrapped) return alloyFn;
    var w = win || global;
    var native = alloyFn;
    var wrapped = function (command) {
      var args = Array.prototype.slice.call(arguments, 1);
      if (command === 'sendEvent' && global.__embedBcPendingAepMeta) {
        var pendingMeta = global.__embedBcPendingAepMeta;
        global.__embedBcPendingAepMeta = null;
        if (shouldSendInteraction(pendingMeta)) {
          args[0] = enrichSendEventOptions(args[0] || {}, prepareMetaForSend(pendingMeta));
        }
      }
      if (command === 'sendConversationEvent') {
        var payload = args[0];
        var text = extractUserText(payload);
        var intent = inferIntent(text);
        var productCategory = inferProductCategory(text, intent);
        var baseMeta = { intent: intent, productCategory: productCategory, text: text };
        return native.apply(w, [command].concat(args)).then(function (result) {
          void sendBrandConciergeInteraction(
            native,
            Object.assign({ interactionType: 'assistantResponse', actorType: 'assistant' }, baseMeta),
            null,
            w,
          );
          if (responseHasRecommendations(result)) {
            void sendBrandConciergeInteraction(
              native,
              Object.assign({ interactionType: 'recommendationPresented', actorType: 'assistant' }, baseMeta),
              null,
              w,
            );
          }
          return result;
        });
      }
      return native.apply(w, [command].concat(args));
    };
    Object.keys(native).forEach(function (key) {
      try {
        wrapped[key] = native[key];
      } catch (_e2) {
        /* read-only */
      }
    });
    wrapped.__embedBcAepEventsWrapped = true;
    return wrapped;
  }

  function wrapAlloyOnWindow(win) {
    if (!win) return;
    if (typeof win.alloy === 'function') {
      win.alloy = wrapAlloyInstance(win.alloy, win);
    }
    (win.__alloyNS || []).forEach(function (name) {
      if (typeof win[name] === 'function') {
        win[name] = wrapAlloyInstance(win[name], win);
      }
    });
  }

  function usesAlloyConversationTracking(win) {
    var alloy = resolveAlloyFn(win || global);
    return !!(alloy && alloy.__embedBcAepEventsWrapped);
  }

  function trackDomInteraction(meta, win) {
    var alloy = resolveAlloyFn(win || global);
    if (typeof alloy !== 'function') return;
    void sendBrandConciergeInteraction(alloy, meta, null, win || global);
  }

  function cardLabelFromNode(node) {
    if (!node) return '';
    return (
      node.querySelector('.bc-multimodal-card__text label')?.textContent?.trim() ||
      node.getAttribute('aria-label')?.replace(/^View\s+/i, '').trim() ||
      node.textContent?.trim().slice(0, 120) ||
      ''
    );
  }

  function bindDomTracking(win) {
    var w = win || global;
    var doc = w.document;
    if (!doc || w.__embedBcAepDomBound) return;
    w.__embedBcAepDomBound = true;

    doc.addEventListener(
      'click',
      function (event) {
        var target = event.target;
        if (!target || !target.closest) return;
        if (!target.closest(BC_MOUNT_SELECTOR)) return;

        var card = target.closest('.bc-multimodal-card, .bc-card');
        if (card) {
          var label = cardLabelFromNode(card);
          trackDomInteraction(
            {
              interactionType: 'recommendationClicked',
              actorType: 'user',
              intent: inferIntent(label),
              productCategory: inferProductCategory(label),
              text: label,
            },
            w,
          );
          return;
        }

        var meetingTrigger = target.closest('button, a, [role="button"], input[type="submit"]');
        if (meetingTrigger) {
          var labelText = String(meetingTrigger.textContent || meetingTrigger.value || '').trim();
          if (/schedule\s+(a\s+)?meeting|book\s+(a\s+)?meeting/i.test(labelText)) {
            trackDomInteraction(
              {
                interactionType: 'meetingBooked',
                actorType: 'user',
                intent: 'meeting',
                productCategory: 'general',
                text: labelText,
              },
              w,
            );
          }
        }
      },
      true,
    );

    doc.addEventListener(
      'submit',
      function (event) {
        var form = event.target;
        if (!form || !form.closest || !form.closest(BC_MOUNT_SELECTOR)) return;
        if (!form.closest('[class*="meeting"], form')) return;
        trackDomInteraction(
          {
            interactionType: 'meetingBooked',
            actorType: 'user',
            intent: 'meeting',
            productCategory: 'general',
          },
          w,
        );
      },
      true,
    );
  }

  function observeMessageNode(node, meta, win) {
    if (!node || node.__embedBcAepMsgSent) return;
    var text = String(node.textContent || '').trim();
    if (!text) return;
    node.__embedBcAepMsgSent = true;
    trackDomInteraction(Object.assign({}, meta, { text: text }), win);
  }

  function observeBcDomMessages(win) {
    var w = win || global;
    var doc = w.document;
    if (!doc || w.__embedBcAepMsgObserved) return;
    w.__embedBcAepMsgObserved = true;

    function scanMount(mount) {
      if (!mount || mount.__embedBcAepMountObserved) return;
      mount.__embedBcAepMountObserved = true;
      var obs = new MutationObserver(function () {
        if (usesAlloyConversationTracking(w)) return;
        mount.querySelectorAll('.user-message, [class*="user-message"]').forEach(function (node) {
          observeMessageNode(node, { interactionType: 'userMessage', actorType: 'user' }, w);
        });
        mount
          .querySelectorAll('.assistant-message, [class*="assistant-message"], [class*="agent-message"]')
          .forEach(function (node) {
            observeMessageNode(node, { interactionType: 'assistantResponse', actorType: 'assistant' }, w);
          });
        mount.querySelectorAll('.bc-multimodal-card, .bc-card').forEach(function (node) {
          if (node.__embedBcAepCardSeen) return;
          node.__embedBcAepCardSeen = true;
          var label = cardLabelFromNode(node);
          trackDomInteraction(
            {
              interactionType: 'recommendationPresented',
              actorType: 'assistant',
              intent: inferIntent(label),
              productCategory: inferProductCategory(label),
              text: label,
            },
            w,
          );
        });
      });
      obs.observe(mount, { childList: true, subtree: true, characterData: true });
    }

    function scanAll() {
      doc.querySelectorAll(BC_MOUNT_SELECTOR).forEach(scanMount);
    }

    scanAll();
    var rootObs = new MutationObserver(scanAll);
    rootObs.observe(doc.documentElement, { childList: true, subtree: true });
  }

  function augmentBootstrapConfig(config) {
    config = config || {};
    config.onBeforeEventSend = chainOnBeforeEventSend(config.onBeforeEventSend);
    return config;
  }

  function patchConciergeBootstrap(targetWin) {
    var w = targetWin || global;
    if (!w.adobe?.concierge?.bootstrap || w.adobe.concierge.bootstrap.__embedBcAepBootstrapPatched) {
      return;
    }
    var orig = w.adobe.concierge.bootstrap.bind(w.adobe.concierge);
    w.adobe.concierge.bootstrap = async function (config) {
      augmentBootstrapConfig(config || {});
      var out = await orig(config);
      wrapAlloyOnWindow(w);
      bindDomTracking(w);
      observeBcDomMessages(w);
      if (!readSession('aepBcConversationStartSent')) {
        writeSession('aepBcConversationStartSent', '1');
        void sendBrandConciergeInteraction(
          resolveAlloyFn(w),
          {
            interactionType: 'conversationStart',
            actorType: 'system',
            intent: 'general',
            productCategory: 'general',
            newConversation: !readSession(CONV_STORAGE_KEY),
          },
          null,
          w,
        );
      }
      return out;
    };
    w.adobe.concierge.bootstrap.__embedBcAepBootstrapPatched = true;
  }

  function install(win) {
    var w = win || global;
    patchConciergeBootstrap(w);
    patchConciergeBootstrap(global);
    wrapAlloyOnWindow(w);
    if (w !== global) wrapAlloyOnWindow(global);
    bindDomTracking(w);
    if (w !== global) bindDomTracking(global);
    observeBcDomMessages(w);
    if (w !== global) observeBcDomMessages(global);
  }

  function onTagsInjected() {
    bcLog('Tags injected — re-wrap alloy + BC hooks');
    install(global);
    try {
      var frame = global.document.getElementById('skyDemoSiteFrame');
      if (frame && frame.contentWindow) install(frame.contentWindow);
    } catch (_e) {
      /* noop */
    }
  }

  if (!global.__embedBcAepTagsInjectListener) {
    global.__embedBcAepTagsInjectListener = true;
    global.addEventListener('aep-demo-tags-injected', onTagsInjected);
  }

  if (!global.__embedBcAepDatastreamChangeListener) {
    global.__embedBcAepDatastreamChangeListener = true;
    global.addEventListener('aep-lab-edge-datastream-changed', function () {
      bcLog('datastream changed — re-wrap alloy + BC hooks');
      onTagsInjected();
    });
  }

  global.EmbedBcAepEvents = {
    install: install,
    augmentBootstrapConfig: augmentBootstrapConfig,
    wrapAlloyInstance: wrapAlloyInstance,
    wrapAlloyOnWindow: wrapAlloyOnWindow,
    buildBrandConciergeFields: buildBrandConciergeFields,
    enrichSendEventOptions: enrichSendEventOptions,
    sendBrandConciergeInteraction: sendBrandConciergeInteraction,
    resetConversationState: resetConversationState,
    resolveLabEcid: resolveLabEcid,
  };

  patchConciergeBootstrap(global);
})(typeof window !== 'undefined' ? window : this);
