/**
 * Brand Concierge → AEP Experience Events via existing alloy sendEvent.
 * Adds `_demoemea.brandConcierge` (conversationID, turnIndex, actorType, …) without
 * changing identityMap or non-BC sendEvent calls.
 */
(function (global) {
  'use strict';

  var TENANT_KEY = '_demoemea';
  var EVENT_TYPE = 'web.interaction';
  var CONV_STORAGE_KEY = 'aepBcConversationId';
  var TURN_STORAGE_KEY = 'aepBcTurnIndex';
  var BC_MOUNT_SELECTOR =
    '#brand-concierge-mount, #bcBottomDockMount, #bcModalBarMount, #siteCloneBcFrameMount, #siteCloneBcInline';

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

  function consumeTurnIndex() {
    var raw = readSession(TURN_STORAGE_KEY);
    var current = parseInt(raw, 10);
    if (!Number.isFinite(current) || current < 1) current = 1;
    writeSession(TURN_STORAGE_KEY, String(current + 1));
    return current;
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
    return {};
  }

  function buildBrandConciergeFields(meta) {
    meta = meta || {};
    var interactionType = String(meta.interactionType || '').trim();
    if (!interactionType) return null;
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
      turnIndex: consumeTurnIndex(),
      actorType: actorType,
    };
  }

  function enrichSendEventOptions(options, meta) {
    var bc = buildBrandConciergeFields(meta);
    if (!bc) return options;
    var base = options && typeof options === 'object' ? options : {};
    var xdm = base.xdm && typeof base.xdm === 'object' ? Object.assign({}, base.xdm) : {};
    xdm.eventType = EVENT_TYPE;
    var tenant =
      xdm[TENANT_KEY] && typeof xdm[TENANT_KEY] === 'object' ? Object.assign({}, xdm[TENANT_KEY]) : {};
    tenant.brandConcierge = bc;
    xdm[TENANT_KEY] = tenant;
    return Object.assign({}, base, edgeConfigOverrides(), { xdm: xdm });
  }

  function sendBrandConciergeInteraction(alloyFn, meta, extraOptions) {
    if (typeof alloyFn !== 'function') return Promise.resolve(null);
    var payload = enrichSendEventOptions(extraOptions || {}, meta);
    return Promise.resolve(alloyFn('sendEvent', payload)).catch(function (err) {
      console.warn('[embed-bc-aep-events] sendEvent failed:', err);
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
      if (!global.__embedBcPendingAepMeta) return base;
      var meta = global.__embedBcPendingAepMeta;
      global.__embedBcPendingAepMeta = null;
      return enrichSendEventOptions(base, meta);
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
          var elements = (mm && mm.elements) || response && response.multimodalElements;
          if (Array.isArray(elements) && elements.length) return true;
          if (Array.isArray(response && response.widgets) && response.widgets.length) return true;
        }
      }
    } catch (_e) {
      /* noop */
    }
    return false;
  }

  function wrapAlloyInstance(alloyFn) {
    if (typeof alloyFn !== 'function' || alloyFn.__embedBcAepEventsWrapped) return alloyFn;
    var native = alloyFn;
    var wrapped = function (command) {
      var args = Array.prototype.slice.call(arguments, 1);
      if (command === 'sendEvent' && global.__embedBcPendingAepMeta) {
        args[0] = enrichSendEventOptions(args[0] || {}, global.__embedBcPendingAepMeta);
        global.__embedBcPendingAepMeta = null;
      }
      if (command === 'sendConversationEvent') {
        var payload = args[0];
        var text = extractUserText(payload);
        var intent = inferIntent(text);
        var productCategory = inferProductCategory(text, intent);
        var baseMeta = { intent: intent, productCategory: productCategory, text: text };
        void sendBrandConciergeInteraction(native, Object.assign({ interactionType: 'userMessage', actorType: 'user' }, baseMeta));
        return native.apply(global, [command].concat(args)).then(function (result) {
          void sendBrandConciergeInteraction(
            native,
            Object.assign({ interactionType: 'assistantResponse', actorType: 'assistant' }, baseMeta),
          );
          if (responseHasRecommendations(result)) {
            void sendBrandConciergeInteraction(
              native,
              Object.assign({ interactionType: 'recommendationPresented', actorType: 'assistant' }, baseMeta),
            );
          }
          return result;
        });
      }
      return native.apply(global, [command].concat(args));
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
      win.alloy = wrapAlloyInstance(win.alloy);
    }
    (win.__alloyNS || []).forEach(function (name) {
      if (typeof win[name] === 'function') {
        win[name] = wrapAlloyInstance(win[name]);
      }
    });
  }

  function trackDomInteraction(meta) {
    if (typeof global.alloy !== 'function') return;
    void sendBrandConciergeInteraction(global.alloy, meta);
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

  function bindDomTracking() {
    if (global.__embedBcAepDomBound) return;
    global.__embedBcAepDomBound = true;

    global.document.addEventListener(
      'click',
      function (event) {
        var target = event.target;
        if (!target || !target.closest) return;
        if (!target.closest(BC_MOUNT_SELECTOR)) return;

        var card = target.closest('.bc-multimodal-card, .bc-card');
        if (card) {
          var label = cardLabelFromNode(card);
          trackDomInteraction({
            interactionType: 'recommendationClicked',
            actorType: 'user',
            intent: inferIntent(label),
            productCategory: inferProductCategory(label),
            text: label,
          });
          return;
        }

        var meetingTrigger = target.closest(
          'button, a, [role="button"], input[type="submit"]',
        );
        if (meetingTrigger) {
          var labelText = String(meetingTrigger.textContent || meetingTrigger.value || '').trim();
          if (/schedule\s+(a\s+)?meeting|book\s+(a\s+)?meeting/i.test(labelText)) {
            trackDomInteraction({
              interactionType: 'meetingBooked',
              actorType: 'user',
              intent: 'meeting',
              productCategory: 'general',
              text: labelText,
            });
          }
        }
      },
      true,
    );

    global.document.addEventListener(
      'submit',
      function (event) {
        var form = event.target;
        if (!form || !form.closest || !form.closest(BC_MOUNT_SELECTOR)) return;
        if (!form.closest('[class*="meeting"], form')) return;
        trackDomInteraction({
          interactionType: 'meetingBooked',
          actorType: 'user',
          intent: 'meeting',
          productCategory: 'general',
        });
      },
      true,
    );
  }

  function augmentBootstrapConfig(config) {
    config = config || {};
    config.onBeforeEventSend = chainOnBeforeEventSend(config.onBeforeEventSend);
    return config;
  }

  function patchConciergeBootstrap() {
    if (!global.adobe?.concierge?.bootstrap || global.adobe.concierge.bootstrap.__embedBcAepBootstrapPatched) {
      return;
    }
    var orig = global.adobe.concierge.bootstrap.bind(global.adobe.concierge);
    global.adobe.concierge.bootstrap = async function (config) {
      augmentBootstrapConfig(config || {});
      var out = await orig(config);
      wrapAlloyOnWindow(global);
      bindDomTracking();
      if (!readSession('aepBcConversationStartSent')) {
        writeSession('aepBcConversationStartSent', '1');
        void sendBrandConciergeInteraction(global.alloy, {
          interactionType: 'conversationStart',
          actorType: 'system',
          intent: 'general',
          productCategory: 'general',
          newConversation: !readSession(CONV_STORAGE_KEY),
        });
      }
      return out;
    };
    global.adobe.concierge.bootstrap.__embedBcAepBootstrapPatched = true;
  }

  function install(win) {
    var w = win || global;
    patchConciergeBootstrap();
    wrapAlloyOnWindow(w);
    bindDomTracking();
  }

  global.EmbedBcAepEvents = {
    install: install,
    augmentBootstrapConfig: augmentBootstrapConfig,
    wrapAlloyInstance: wrapAlloyInstance,
    buildBrandConciergeFields: buildBrandConciergeFields,
    enrichSendEventOptions: enrichSendEventOptions,
    sendBrandConciergeInteraction: sendBrandConciergeInteraction,
    resetConversationState: resetConversationState,
  };

  patchConciergeBootstrap();
})(typeof window !== 'undefined' ? window : this);
