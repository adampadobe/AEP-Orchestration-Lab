/**
 * Army BC: live Edge chat by default (Brand Concierge conversations API).
 * Local catalog fallback when Edge fails or ?armyBcLocal=1.
 * Legacy: ?armyBcRemote=1 still forces Edge (same as default).
 */
(function () {
  function isUseLocal() {
    const params = new URLSearchParams(window.location.search);
    if (params.has('armyBcLocal')) return true;
    if (window.__armyBcForceLocal === true) return true;
    if (window.__armyBcUseLocal === true) return true;
    if (window.__armyBcUseLocal === false) return false;
    if (params.has('armyBcRemote')) return false;
    return false;
  }

  function isBcConversationUrl(url) {
    if (!url || typeof url !== 'string') return false;
    return url.includes('edge.adobedc.net') && url.includes('brand-concierge') && url.includes('conversations');
  }

  function isInteractUrl(url) {
    if (!url || typeof url !== 'string') return false;
    return url.includes('edge.adobedc.net') && url.includes('/interact');
  }

  function rememberUserText(payload) {
    const msg = window.ArmyBcLocalEngine?.extractUserMessage?.(payload);
    if (msg) window.__armyBcLastUserText = msg;
  }

  function deliverLocalTurn(payload) {
    rememberUserText(payload);
    const streamCb = payload?.onStreamResponse;
    const failCb = payload?.onFailureCallback;

    return ArmyBcLocalEngine.buildTurn(payload).then(function (turn) {
      if (typeof streamCb === 'function') {
        return ArmyBcLocalEngine.streamTurnToCallback(turn, streamCb);
      }
      return turn;
    })
      .catch(function (err) {
        console.warn('[army-bc-local] buildTurn failed:', err);
        if (typeof failCb === 'function') {
          failCb(err);
          return undefined;
        }
        throw err;
      });
  }

  function patchFetch() {
    if (window.__armyBcLocalFetchPatched) return;
    const native = window.fetch.bind(window);
    window.fetch = async function (input, init) {
      const url = typeof input === 'string' ? input : input?.url;
      const res = await native(input, init);
      if (res.status === 400 && (isInteractUrl(url) || isBcConversationUrl(url))) {
        window.__armyBcForceLocal = true;
        console.warn('[army-bc-local] Edge returned 400 — local catalog on next turn:', url);
      }
      return res;
    };
    window.__armyBcLocalFetchPatched = true;
  }

  function wrapAlloy(instanceName) {
    const name = instanceName || 'alloy';
    const alloyFn = window[name];
    if (!alloyFn || alloyFn.__armyBcWrapped) return;

    const wrapped = function (command) {
      const args = Array.prototype.slice.call(arguments, 1);
      if (command !== 'sendConversationEvent') {
        return alloyFn.apply(window, [command].concat(args));
      }
      const payload = args[0];
      if (isUseLocal() && window.ArmyBcLocalEngine) {
        return deliverLocalTurn(payload);
      }
      return alloyFn('sendConversationEvent', payload)
        .then(function (result) {
          if (
            window.__armyBcForceLocal ||
            (window.ArmyBcLocalEngine && ArmyBcLocalEngine.isChatFailure(result))
          ) {
            window.__armyBcForceLocal = false;
            return deliverLocalTurn(payload);
          }
          return result;
        })
        .catch(function (err) {
          console.warn('[army-bc-local] sendConversationEvent failed:', err);
          if (window.ArmyBcLocalEngine) {
            return deliverLocalTurn(payload);
          }
          throw err;
        });
    };

    Object.keys(alloyFn).forEach(function (k) {
      try {
        wrapped[k] = alloyFn[k];
      } catch (_) {
        /* read-only */
      }
    });
    wrapped.__armyBcWrapped = true;
    window[name] = wrapped;
  }

  function patchBootstrap() {
    if (!window.adobe?.concierge?.bootstrap || window.adobe.concierge.bootstrap.__armyBcPatched) {
      return;
    }
    const orig = window.adobe.concierge.bootstrap.bind(window.adobe.concierge);
    window.adobe.concierge.bootstrap = async function (config) {
      const userBefore = config.onBeforeEventSend;
      config.onBeforeEventSend = function (payload) {
        window.__armyBcLastPayload = payload;
        rememberUserText(payload);
        if (typeof userBefore === 'function') return userBefore(payload);
      };
      const out = await orig(config);
      wrapAlloy(config.instanceName || 'alloy');
      return out;
    };
    window.adobe.concierge.bootstrap.__armyBcPatched = true;
  }

  function trackUserBubbles() {
    const mounts = document.querySelectorAll('#brand-concierge-mount');
    mounts.forEach(function (mount) {
      if (mount.__armyBcObserved) return;
      mount.__armyBcObserved = true;
      const obs = new MutationObserver(function () {
        const users = mount.querySelectorAll('.user-message, [class*="user-message"]');
        const last = users[users.length - 1];
        if (last && last.textContent) {
          window.__armyBcLastUserText = last.textContent.trim();
        }
      });
      obs.observe(mount, { childList: true, subtree: true, characterData: true });
    });
  }

  function init() {
    patchFetch();
    patchBootstrap();
    wrapAlloy('alloy');
    if (window.ArmyBcLocalEngine) {
      ArmyBcLocalEngine.loadData()
        .then(function () {
          ArmyBcLocalEngine.observeMultimodalCards?.();
        })
        .catch(function () {});
    }
    trackUserBubbles();
    const obs = new MutationObserver(trackUserBubbles);
    obs.observe(document.documentElement, { childList: true, subtree: true });
    if (isUseLocal()) {
      console.info('[army-bc-local] Using local catalog (?armyBcLocal=1).');
    } else {
      console.info(
        '[army-bc-local] Using live Brand Concierge on Edge (add ?armyBcLocal=1 for local catalog only).',
      );
    }
  }

  init();
  document.addEventListener('DOMContentLoaded', init);
})();
