/**
 * Army BC demo: answer from local catalog (default until datastream is fixed).
 * BC chat uses onStreamResponse on sendConversationEvent — not only the returned promise.
 * Opt back into Edge chat with ?armyBcRemote=1
 */
(function () {
  const REMOTE_PARAM = 'armyBcRemote';
  const params = new URLSearchParams(window.location.search);
  const useLocal = !params.has(REMOTE_PARAM);

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
    if (!useLocal || window.__armyBcFetchPatched) return;
    const native = window.fetch.bind(window);
    window.fetch = async function (input, init) {
      const url = typeof input === 'string' ? input : input?.url;
      const res = await native(input, init);
      if (res.status === 400 && (isInteractUrl(url) || isBcConversationUrl(url))) {
        window.__armyBcForceLocal = true;
        console.warn('[army-bc-local] Edge returned 400 — using local catalog:', url);
      }
      return res;
    };
    window.__armyBcFetchPatched = true;
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
      if (useLocal && window.ArmyBcLocalEngine) {
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
          return deliverLocalTurn(payload);
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
    if (useLocal) {
      console.info('[army-bc-local] Using local catalog (add ?armyBcRemote=1 for Edge chat)');
    }
  }

  init();
  document.addEventListener('DOMContentLoaded', init);
})();
