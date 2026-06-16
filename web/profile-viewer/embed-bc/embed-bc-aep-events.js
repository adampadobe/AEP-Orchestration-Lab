/**
 * Brand Concierge → AEP Experience Events via existing alloy sendEvent.
 * Adds `_demoemea.brandConcierge` (conversationID, turnIndex, actorType, …),
 * root `conversation` (prompt / response per operational XDM), and mirrors
 * anonymous demo tenant identification (`_demoemea.identification.core.ecid`
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
    global.__embedBcLastTurnPrompt = null;
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

  function rememberUserText(text) {
    var msg = String(text || '').trim();
    if (msg) global.__embedBcLastUserText = msg;
  }

  function rememberTurnPrompt(conversationId, turnIndex, text) {
    var prompt = String(text || '').trim();
    if (!prompt || !conversationId || turnIndex == null) return;
    global.__embedBcLastTurnPrompt = {
      conversationID: String(conversationId),
      turnIndex: turnIndex,
      prompt: prompt,
    };
  }

  function buildTurnId(conversationId, turnIndex) {
    return String(conversationId || '') + '-' + String(turnIndex);
  }

  function buildPromptBlock(text) {
    var t = String(text || '').trim();
    if (!t) return null;
    return {
      raw: [{ purpose: 'free-form text', text: t }],
      source: 'end-user',
    };
  }

  function buildResponseBlock(text) {
    var t = String(text || '').trim();
    if (!t) return null;
    return {
      raw: [{ purpose: 'main', text: t }],
      source: 'system',
    };
  }

  /**
   * Operational XDM `conversation` block (sibling to eventType / _demoemea).
   * @param {Record<string, unknown>} meta
   */
  function buildConversationFields(meta) {
    meta = meta || {};
    if (meta.turnIndex == null) return null;
    var interactionType = String(meta.interactionType || '').trim();
    if (!interactionType || interactionType === 'conversationStart') return null;

    var conversationID = getOrCreateConversationId({ newConversation: !!meta.newConversation });
    var conv = {
      conversationID: conversationID,
      turnIndex: meta.turnIndex,
      turnID: buildTurnId(conversationID, meta.turnIndex),
    };

    var promptText = String(meta.promptText || meta.text || '').trim();
    var responseText = String(meta.responseText || '').trim();

    if (
      interactionType === 'userMessage' ||
      interactionType === 'recommendationClicked' ||
      interactionType === 'meetingBooked'
    ) {
      var prompt = buildPromptBlock(promptText);
      if (prompt) conv.prompt = prompt;
    }

    if (interactionType === 'assistantResponse' || interactionType === 'recommendationPresented') {
      var lastPrompt = global.__embedBcLastTurnPrompt;
      var pairedPromptText = String(meta.promptText || '').trim();
      if (!pairedPromptText && lastPrompt && lastPrompt.conversationID === conversationID && lastPrompt.prompt) {
        pairedPromptText = String(lastPrompt.prompt).trim();
      }
      if (pairedPromptText) {
        var pairedPrompt = buildPromptBlock(pairedPromptText);
        if (pairedPrompt) conv.prompt = pairedPrompt;
      }
      var response = buildResponseBlock(responseText);
      if (response) conv.response = response;
    }

    return conv;
  }

  function extractAssistantTextFromResult(result) {
    try {
      if (result && result.response) {
        var direct = result.response.message || result.response.text;
        if (typeof direct === 'string' && direct.trim()) return direct.trim();
      }
      var handles = result && result.handle;
      if (!Array.isArray(handles)) return '';
      for (var i = 0; i < handles.length; i++) {
        var payloads = handles[i] && handles[i].payload;
        if (!Array.isArray(payloads)) continue;
        for (var j = 0; j < payloads.length; j++) {
          var payload = payloads[j] || {};
          var response = payload.response || payload;
          if (!response || typeof response !== 'object') continue;
          if (typeof response.message === 'string' && response.message.trim()) {
            return response.message.trim();
          }
          if (typeof response.text === 'string' && response.text.trim()) {
            return response.text.trim();
          }
          var mm = response.multimodalElements;
          var elements = (mm && mm.elements) || response.multimodalElements;
          if (Array.isArray(elements) && elements.length) {
            var parts = [];
            for (var k = 0; k < elements.length; k++) {
              var el = elements[k];
              var bit = el && (el.text || el.label || el.title || el.name);
              if (bit) parts.push(String(bit).trim());
            }
            if (parts.length) return parts.join(' ');
          }
        }
      }
    } catch (_e) {
      /* noop */
    }
    return '';
  }

  function extractAssistantTextFromStreamChunk(chunk) {
    if (!chunk) return '';
    if (typeof chunk === 'string' && chunk.trim()) return chunk.trim();
    if (typeof chunk.message === 'string' && chunk.message.trim()) return chunk.message.trim();
    if (typeof chunk.text === 'string' && chunk.text.trim()) return chunk.text.trim();
    if (chunk.response && typeof chunk.response === 'object') {
      return extractAssistantTextFromResult({ response: chunk.response });
    }
    return extractAssistantTextFromResult(chunk);
  }

  function textsLikelySame(a, b) {
    var left = String(a || '').trim().toLowerCase();
    var right = String(b || '').trim().toLowerCase();
    if (!left || !right) return false;
    return left === right;
  }

  function wrapConversationPayloadForAssistantCapture(payload) {
    if (!payload || typeof payload !== 'object') return payload;
    var next = Object.assign({}, payload);
    global.__embedBcLastStreamedAssistantText = '';
    var origStream = payload.onStreamResponse;
    next.onStreamResponse = function (chunk) {
      var captured = extractAssistantTextFromStreamChunk(chunk);
      if (captured) global.__embedBcLastStreamedAssistantText = captured;
      if (typeof origStream === 'function') return origStream(chunk);
    };
    return next;
  }

  function resolveAssistantResponseText(result, win, userPromptText) {
    var prompt = String(userPromptText || '').trim();
    function pickCandidate() {
      var fromStream = String(global.__embedBcLastStreamedAssistantText || '').trim();
      var fromResult = extractAssistantTextFromResult(result);
      var fromDom = extractLastAssistantTextFromDom(win);
      var candidates = [fromStream, fromResult, fromDom];
      for (var i = 0; i < candidates.length; i++) {
        var hit = String(candidates[i] || '').trim();
        if (!hit) continue;
        if (prompt && textsLikelySame(hit, prompt)) continue;
        return hit;
      }
      return '';
    }

    var immediate = pickCandidate();
    if (immediate) return Promise.resolve(immediate);

    var delayMs = 300;
    var maxAttempts = 14;
    return new Promise(function (resolve) {
      var attempt = 0;
      function tick() {
        var hit = pickCandidate();
        if (hit) {
          resolve(hit);
          return;
        }
        attempt += 1;
        if (attempt >= maxAttempts) {
          resolve('');
          return;
        }
        setTimeout(tick, delayMs);
      }
      setTimeout(tick, delayMs);
    });
  }

  function sendAssistantTurnEvents(alloyFn, baseMeta, assistantText, result, win, turnIndex) {
    var assistantMeta = Object.assign(
      {
        interactionType: 'assistantResponse',
        actorType: 'assistant',
        responseText: assistantText,
        promptText: baseMeta.text,
        text: baseMeta.text,
        turnIndex: turnIndex,
      },
      { intent: baseMeta.intent, productCategory: baseMeta.productCategory },
    );
    if (!assistantText) return;
    void sendBrandConciergeInteraction(alloyFn, assistantMeta, null, win);
    if (responseHasRecommendations(result)) {
      void sendBrandConciergeInteraction(
        alloyFn,
        Object.assign({}, assistantMeta, { interactionType: 'recommendationPresented' }),
        null,
        win,
      );
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
    var conversation = buildConversationFields(meta);
    if (conversation) xdm.conversation = conversation;
    xdm = mergeDemoemeaIdentification(xdm);
    return Object.assign({}, base, edgeConfigOverrides(), { xdm: xdm });
  }

  var recentDedupe = {};

  function shouldSendInteraction(meta) {
    var textPart = String(meta.text || '').slice(0, 80);
    var key =
      String(meta.interactionType || '') +
      '|' +
      textPart +
      '|' +
      String(meta.intent || '');
    // Distinct turns with no extracted text must not collapse into one dedupe bucket.
    if (!textPart && meta.interactionType === 'userMessage') return true;
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
    if (meta.interactionType === 'userMessage' && (!meta.text || !String(meta.text).trim())) {
      meta.text = extractLastUserTextFromDom(win);
    }
    if (meta.interactionType === 'userMessage' && meta.text) {
      rememberTurnPrompt(getOrCreateConversationId(), meta.turnIndex, meta.text);
    }
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
      if (global.__embedBcSkipBeforeEventSendUserMessage) return base;
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
        var payload = wrapConversationPayloadForAssistantCapture(args[0]);
        args[0] = payload;
        var text = extractUserText(payload);
        rememberUserText(text);
        var intent = inferIntent(text);
        var productCategory = inferProductCategory(text, intent);
        var baseMeta = { intent: intent, productCategory: productCategory, text: text };
        var userMeta = Object.assign({ interactionType: 'userMessage', actorType: 'user' }, baseMeta);
        userMeta = prepareMetaForSend(userMeta);
        var pairedTurnIndex = userMeta.turnIndex;
        global.__embedBcSkipBeforeEventSendUserMessage = true;
        void sendBrandConciergeInteraction(native, userMeta, null, w);
        return native
          .apply(w, [command].concat(args))
          .then(function (result) {
            return resolveAssistantResponseText(result, w, text).then(function (assistantText) {
              sendAssistantTurnEvents(native, baseMeta, assistantText, result, w, pairedTurnIndex);
              return result;
            });
          })
          .finally(function () {
            global.__embedBcSkipBeforeEventSendUserMessage = false;
            global.__embedBcLastStreamedAssistantText = '';
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

  function isLocalBcEngine(win) {
    var w = win || global;
    try {
      if (w.__embedBcForceLocal === true) return true;
      if (w.__embedBcUseLocal === true) return true;
      if (w.__embedBcUseLocal === false) return false;
      var params = new URLSearchParams(w.location && w.location.search ? w.location.search : '');
      if (params.has('embedBcLocal')) return true;
      if (params.has('embedBcRemote')) return false;
    } catch (_e) {
      /* noop */
    }
    return false;
  }

  function usesAlloyConversationTracking(win) {
    var alloy = resolveAlloyFn(win || global);
    return !!(alloy && alloy.__embedBcAepEventsWrapped && !isLocalBcEngine(win));
  }

  function extractLastUserTextFromDom(win) {
    var w = win || global;
    try {
      var doc = w.document;
      if (!doc || !doc.querySelectorAll) return '';
      var nodes = doc.querySelectorAll('.user-message, [class*="user-message"]');
      for (var i = nodes.length - 1; i >= 0; i--) {
        var t = String(nodes[i] && nodes[i].textContent ? nodes[i].textContent : '').trim();
        if (t) return t;
      }
    } catch (_e) {
      /* noop */
    }
    return '';
  }

  function extractLastAssistantTextFromDom(win) {
    var w = win || global;
    try {
      var doc = w.document;
      if (!doc || !doc.querySelectorAll) return '';
      var nodes = doc.querySelectorAll(
        '.assistant-message, [class*="assistant-message"], [class*="agent-message"]',
      );
      for (var i = nodes.length - 1; i >= 0; i--) {
        var t = String(nodes[i] && nodes[i].textContent ? nodes[i].textContent : '').trim();
        if (t) return t;
      }
    } catch (_e2) {
      /* noop */
    }
    return '';
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

        var suggestion = target.closest(
          '.prompt-suggestion, [class*="prompt-suggestion"], [class*="follow-up"], [class*="followup"]',
        );
        if (suggestion) {
          var suggestionText = String(suggestion.textContent || '').trim();
          if (suggestionText) {
            rememberUserText(suggestionText);
            trackDomInteraction(
              {
                interactionType: 'userMessage',
                actorType: 'user',
                intent: inferIntent(suggestionText),
                productCategory: inferProductCategory(suggestionText),
                text: suggestionText,
              },
              w,
            );
          }
          return;
        }

        // Fallback: some BC builds render prompt buttons without the exact
        // `prompt-suggestion` class we match above.
        var promptSuggestionsContainer = target.closest(
          '.prompt-suggestions-container, [class*="prompt-suggestions-container"]',
        );
        if (promptSuggestionsContainer) {
          var btn =
            target.closest('button, [role="button"]') ||
            promptSuggestionsContainer.querySelector('button, [role="button"]');
          if (btn) {
            var aria = String(btn.getAttribute('aria-label') || '').trim().toLowerCase();
            if (!/send/.test(aria)) {
              var suggestionText2 = String(btn.textContent || '').trim();
              if (suggestionText2) {
                rememberUserText(suggestionText2);
                trackDomInteraction(
                  {
                    interactionType: 'userMessage',
                    actorType: 'user',
                    intent: inferIntent(suggestionText2),
                    productCategory: inferProductCategory(suggestionText2),
                    text: suggestionText2,
                  },
                  w,
                );
                return;
              }
            }
          }
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
    var enriched = Object.assign({}, meta, { text: text });
    if (meta.interactionType === 'assistantResponse') enriched.responseText = text;
    trackDomInteraction(enriched, win);
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
