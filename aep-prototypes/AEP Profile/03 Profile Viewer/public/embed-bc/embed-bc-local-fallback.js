/**
 * Embed BC: live Edge chat by default (Brand Concierge conversations API).
 * Local catalog fallback when Edge fails or ?embedBcLocal=1.
 * Legacy: ?embedBcRemote=1 still forces Edge (same as default).
 */
(function () {
  function isUseLocal() {
    const params = new URLSearchParams(window.location.search);
    if (params.has('embedBcLocal')) return true;
    if (window.__embedBcForceLocal === true) return true;
    if (window.__embedBcUseLocal === true) return true;
    if (window.__embedBcUseLocal === false) return false;
    if (params.has('embedBcRemote')) return false;
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
    if (msg) window.__embedBcLastUserText = msg;
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
        console.warn('[embed-bc-local] buildTurn failed:', err);
        if (typeof failCb === 'function') {
          failCb(err);
          return undefined;
        }
        throw err;
      });
  }

  function patchFetch() {
    if (window.__embedBcLocalFetchPatched) return;
    const native = window.fetch.bind(window);
    window.fetch = async function (input, init) {
      const url = typeof input === 'string' ? input : input?.url;
      const res = await native(input, init);
      if (
        isUseLocal() &&
        res.status === 400 &&
        (isInteractUrl(url) || isBcConversationUrl(url))
      ) {
        window.__embedBcForceLocal = true;
        console.warn('[embed-bc-local] Edge returned 400 — local catalog on next turn:', url);
      }
      return res;
    };
    window.__embedBcLocalFetchPatched = true;
  }

  function wrapAlloy(instanceName) {
    const name = instanceName || 'alloy';
    const alloyFn = window[name];
    if (!alloyFn || alloyFn.__embedBcWrapped) return;

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
            window.__embedBcForceLocal ||
            (window.ArmyBcLocalEngine && ArmyBcLocalEngine.isChatFailure(result))
          ) {
            window.__embedBcForceLocal = false;
            return deliverLocalTurn(payload);
          }
          return result;
        })
        .catch(function (err) {
          console.warn('[embed-bc-local] sendConversationEvent failed:', err);
          if (isUseLocal() && window.ArmyBcLocalEngine) {
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
    wrapped.__embedBcWrapped = true;
    window[name] = wrapped;
  }

  function patchBootstrap() {
    if (!window.adobe?.concierge?.bootstrap || window.adobe.concierge.bootstrap.__embedBcPatched) {
      return;
    }
    const orig = window.adobe.concierge.bootstrap.bind(window.adobe.concierge);
    window.adobe.concierge.bootstrap = async function (config) {
      const userBefore = config.onBeforeEventSend;
      config.onBeforeEventSend = function (payload) {
        window.__embedBcLastPayload = payload;
        rememberUserText(payload);
        if (typeof userBefore === 'function') return userBefore(payload);
      };
      const out = await orig(config);
      wrapAlloy(config.instanceName || 'alloy');
      return out;
    };
    window.adobe.concierge.bootstrap.__embedBcPatched = true;
  }

  function trackUserBubbles() {
    const mounts = document.querySelectorAll('#brand-concierge-mount');
    mounts.forEach(function (mount) {
      if (mount.__embedBcObserved) return;
      mount.__embedBcObserved = true;
      const obs = new MutationObserver(function () {
        const users = mount.querySelectorAll('.user-message, [class*="user-message"]');
        const last = users[users.length - 1];
        if (last && last.textContent) {
          window.__embedBcLastUserText = last.textContent.trim();
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
      console.info('[embed-bc-local] Using local catalog (?embedBcLocal=1).');
    } else {
      console.info(
        '[embed-bc-local] Using live Brand Concierge on Edge (add ?embedBcLocal=1 for local catalog only).',
      );
    }
  }

  init();
  document.addEventListener('DOMContentLoaded', init);
})();
