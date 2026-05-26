/**
 * Rewrite Brand Concierge conversation URLs for deployment-specific Edge paths.
 * Default (live Edge): /brand-concierge/nld2/conversations
 * Local-only demo: skip rewrite when ?armyBcLocal=1 or window.__armyBcUseLocal === true
 *
 * Override deployment: ?bcDeployment=other-slug
 */
(function (global) {
  'use strict';
  var win = global || window;

  function resolveDeployment(targetWin) {
    var w = targetWin || win;
    var search = '';
    try {
      search = w.location && w.location.search ? w.location.search : '';
      if (!search && w.parent && w.parent !== w) {
        search = w.parent.location.search || '';
      }
    } catch (_e) {
      search = '';
    }
    var params = new URLSearchParams(search);
    var useLocal = params.has('armyBcLocal') || w.__armyBcUseLocal === true;
    var deploymentParam = params.get('bcDeployment');
    if (deploymentParam !== null && deploymentParam !== '') {
      return deploymentParam;
    }
    return useLocal ? null : 'nld2';
  }

  function rewriteUrl(url, deployment) {
    if (!deployment || !url || typeof url !== 'string' || url.indexOf('brand-concierge') === -1) {
      return url;
    }
    if (url.indexOf('/brand-concierge/' + deployment + '/conversations') !== -1) {
      return url;
    }
    if (url.indexOf('/brand-concierge-voice/' + deployment + '/conversations') !== -1) {
      return url;
    }
    var next = url
      .replace('/brand-concierge/conversations', '/brand-concierge/' + deployment + '/conversations')
      .replace(
        '/brand-concierge-voice/conversations',
        '/brand-concierge-voice/' + deployment + '/conversations',
      );
    if (next !== url) return next;
    try {
      var u = new URL(url, win.location.href);
      var parts = u.pathname.split('/').filter(Boolean);
      var bcIdx = parts.indexOf('brand-concierge');
      if (bcIdx === -1) {
        bcIdx = parts.indexOf('brand-concierge-voice');
      }
      if (bcIdx === -1) return url;
      var afterBc = parts[bcIdx + 1];
      if (afterBc === deployment) return url;
      if (afterBc === 'conversations' || afterBc === 'conversations-voice') {
        parts.splice(bcIdx + 1, 0, deployment);
        u.pathname = '/' + parts.join('/');
        return u.toString();
      }
    } catch (err) {
      console.warn('[army-bc-edge-path] URL rewrite skipped:', err);
    }
    return url;
  }

  function captureNativeFetch(targetWin) {
    if (!targetWin || typeof targetWin.fetch !== 'function') return;
    var current = targetWin.fetch;
    if (current.__armyBcPatched) return;
    targetWin.__armyBcNativeFetch = current.bind(targetWin);
  }

  function patchFetch(targetWin, deployment) {
    if (!targetWin || typeof targetWin.fetch !== 'function') return;
    if (targetWin.fetch.__armyBcPatched) return;
    captureNativeFetch(targetWin);
    if (!targetWin.__armyBcNativeFetch) return;
    var nativeFetch = targetWin.__armyBcNativeFetch;
    var patchedFetch = function (input, init) {
      if (typeof input === 'string') {
        input = rewriteUrl(input, deployment);
      } else if (input && typeof input.url === 'string') {
        var next = rewriteUrl(input.url, deployment);
        if (next !== input.url) {
          input = new targetWin.Request(next, input);
        }
      }
      return nativeFetch.call(targetWin, input, init);
    };
    patchedFetch.__armyBcPatched = true;
    targetWin.fetch = patchedFetch;
    targetWin.__armyBcFetchPathPatched = true;
  }

  function patchXhr(targetWin, deployment) {
    if (!targetWin) return;
    var XHR = targetWin.XMLHttpRequest;
    if (!XHR || !XHR.prototype) return;
    if (XHR.prototype.open && XHR.prototype.open.__armyBcXhrOpenPatched) return;
    var nativeOpen = XHR.prototype.open.__armyBcNativeOpen || XHR.prototype.open;
    function patchedOpen(method, url) {
      var args = Array.prototype.slice.call(arguments);
      if (typeof url === 'string') {
        args[1] = rewriteUrl(url, deployment);
      }
      return nativeOpen.apply(this, args);
    }
    patchedOpen.__armyBcXhrOpenPatched = true;
    patchedOpen.__armyBcNativeOpen = nativeOpen;
    XHR.prototype.open = patchedOpen;
    targetWin.__armyBcXhrPathPatched = true;
  }

  function patchRequest(targetWin, deployment) {
    if (!targetWin || !targetWin.Request || targetWin.__armyBcRequestPathPatched) return;
    var NativeRequest = targetWin.Request;
    targetWin.Request = function (input, init) {
      if (typeof input === 'string') {
        input = rewriteUrl(input, deployment);
      } else if (input && typeof input.url === 'string') {
        var next = rewriteUrl(input.url, deployment);
        if (next !== input.url) {
          input = new NativeRequest(next, input);
        }
      }
      return new NativeRequest(input, init);
    };
    targetWin.Request.prototype = NativeRequest.prototype;
    targetWin.__armyBcRequestPathPatched = true;
  }

  function patchSendBeacon(targetWin, deployment) {
    if (!targetWin || !targetWin.navigator || targetWin.__armyBcBeaconPathPatched) return;
    if (typeof targetWin.navigator.sendBeacon !== 'function') return;
    var native = targetWin.navigator.sendBeacon.bind(targetWin.navigator);
    targetWin.navigator.sendBeacon = function (url, data) {
      return native(rewriteUrl(url, deployment), data);
    };
    targetWin.__armyBcBeaconPathPatched = true;
  }

  function wrapAlloyInstance(targetWin, name, deployment) {
    var fn = targetWin[name];
    if (typeof fn !== 'function' || fn.__armyBcEdgeAlloyWrapped) return;
    var native = fn;
    var wrapped = function (command) {
      patchFetch(targetWin, deployment);
      var args = Array.prototype.slice.call(arguments, 1);
      return native.apply(targetWin, [command].concat(args));
    };
    Object.keys(native).forEach(function (key) {
      try {
        wrapped[key] = native[key];
      } catch (_e) {
        /* read-only */
      }
    });
    wrapped.__armyBcEdgeAlloyWrapped = true;
    targetWin[name] = wrapped;
  }

  function patchAlloy(targetWin, deployment) {
    if (!targetWin) return;
    wrapAlloyInstance(targetWin, 'alloy', deployment);
    (targetWin.__alloyNS || []).forEach(function (name) {
      wrapAlloyInstance(targetWin, name, deployment);
    });
  }

  function patchConciergeBootstrap(targetWin, deployment) {
    if (!targetWin.adobe || !targetWin.adobe.concierge || typeof targetWin.adobe.concierge.bootstrap !== 'function') {
      return;
    }
    if (targetWin.adobe.concierge.bootstrap.__armyBcEdgeBootstrapPatched) return;
    var orig = targetWin.adobe.concierge.bootstrap.bind(targetWin.adobe.concierge);
    targetWin.adobe.concierge.bootstrap = async function (config) {
      applyArmyBcEdgePathPatches(targetWin);
      var out = await orig(config);
      patchAlloy(targetWin, deployment);
      return out;
    };
    targetWin.adobe.concierge.bootstrap.__armyBcEdgeBootstrapPatched = true;
  }

  function applyArmyBcEdgePathPatches(targetWin) {
    var w = targetWin || win;
    var deployment = resolveDeployment(w);
    if (!deployment) return false;
    captureNativeFetch(w);
    patchFetch(w, deployment);
    patchXhr(w, deployment);
    patchRequest(w, deployment);
    patchSendBeacon(w, deployment);
    patchAlloy(w, deployment);
    patchConciergeBootstrap(w, deployment);
    w.ARMY_BC_EDGE = {
      deploymentSlug: deployment,
      rewriteUrl: function (url) {
        return rewriteUrl(url, deployment);
      },
    };
    console.info(
      '[army-bc-edge-path] BC conversations → /brand-concierge/' +
        deployment +
        '/conversations (?armyBcLocal=1 to skip)',
    );
    return true;
  }

  win.applyArmyBcEdgePathPatches = applyArmyBcEdgePathPatches;

  applyArmyBcEdgePathPatches(win);
})(typeof window !== 'undefined' ? window : this);
