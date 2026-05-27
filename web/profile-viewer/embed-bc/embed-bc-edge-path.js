/**
 * Rewrite Brand Concierge conversation URLs for deployment-specific Edge paths.
 * Default (live Edge): /brand-concierge/nld2/conversations
 * Local-only demo: skip rewrite when ?embedBcLocal=1 or window.__embedBcUseLocal === true
 *
 * Override deployment: ?bcDeployment=other-slug
 */
(function (global) {
  'use strict';
  var win = global || window;

  function resolveDatastreamConfigId(targetWin) {
    var w = targetWin || win;
    function readFrom(ctx) {
      try {
        if (ctx && ctx.SiteCloneBcConfig && typeof ctx.SiteCloneBcConfig.getDatastreamId === 'function') {
          var id = String(ctx.SiteCloneBcConfig.getDatastreamId() || '')
            .trim()
            .toLowerCase();
          if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) {
            return id;
          }
        }
      } catch (_e) {
        /* noop */
      }
      return null;
    }
    try {
      if (w.parent && w.parent !== w) {
        var fromParent = readFrom(w.parent);
        if (fromParent) return fromParent;
      }
    } catch (_e2) {
      /* noop */
    }
    return readFrom(w) || readFrom(win);
  }

  function rewriteConfigId(url, configId, baseWin) {
    if (!configId || !url || typeof url !== 'string' || url.indexOf('brand-concierge') === -1) {
      return url;
    }
    try {
      var w = baseWin || win;
      var u = new URL(url, w.location.href);
      u.searchParams.set('configId', configId);
      return u.toString();
    } catch (_e) {
      if (/[?&]configId=/i.test(url)) {
        return url.replace(/([?&])configId=[^&]*/gi, '$1configId=' + encodeURIComponent(configId));
      }
      return url + (url.indexOf('?') !== -1 ? '&' : '?') + 'configId=' + encodeURIComponent(configId);
    }
  }

  function applyConfigIdToBcUrl(url, baseWin) {
    var configId = resolveDatastreamConfigId(baseWin);
    return configId ? rewriteConfigId(url, configId, baseWin) : url;
  }

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
    var useLocal = params.has('embedBcLocal') || w.__embedBcUseLocal === true;
    var deploymentParam = params.get('bcDeployment');
    if (deploymentParam !== null && deploymentParam !== '') {
      return deploymentParam;
    }
    return useLocal ? null : 'nld2';
  }

  function rewriteUrl(url, deployment, baseWin) {
    if (!url || typeof url !== 'string' || url.indexOf('brand-concierge') === -1) {
      return url;
    }
    var next = url;
    if (deployment) {
      if (
        url.indexOf('/brand-concierge/' + deployment + '/conversations') !== -1 ||
        url.indexOf('/brand-concierge-voice/' + deployment + '/conversations') !== -1
      ) {
        next = url;
      } else {
        var pathRewritten = url
          .replace('/brand-concierge/conversations', '/brand-concierge/' + deployment + '/conversations')
          .replace(
            '/brand-concierge-voice/conversations',
            '/brand-concierge-voice/' + deployment + '/conversations',
          );
        if (pathRewritten !== url) {
          next = pathRewritten;
        } else {
          try {
            var w = baseWin || win;
            var u = new URL(url, w.location.href);
            var parts = u.pathname.split('/').filter(Boolean);
            var bcIdx = parts.indexOf('brand-concierge');
            if (bcIdx === -1) {
              bcIdx = parts.indexOf('brand-concierge-voice');
            }
            if (bcIdx !== -1) {
              var afterBc = parts[bcIdx + 1];
              if (afterBc !== deployment && (afterBc === 'conversations' || afterBc === 'conversations-voice')) {
                parts.splice(bcIdx + 1, 0, deployment);
                u.pathname = '/' + parts.join('/');
                next = u.toString();
              }
            }
          } catch (err) {
            console.warn('[embed-bc-edge-path] URL rewrite skipped:', err);
          }
        }
      }
    }
    return applyConfigIdToBcUrl(next, baseWin);
  }

  function captureNativeFetch(targetWin) {
    if (!targetWin || typeof targetWin.fetch !== 'function') return;
    var current = targetWin.fetch;
    if (current.__embedBcPatched) return;
    targetWin.__embedBcNativeFetch = current.bind(targetWin);
  }

  function patchFetch(targetWin, deployment) {
    if (!targetWin || typeof targetWin.fetch !== 'function') return;
    if (targetWin.fetch.__embedBcPatched) return;
    captureNativeFetch(targetWin);
    if (!targetWin.__embedBcNativeFetch) return;
    var nativeFetch = targetWin.__embedBcNativeFetch;
    var patchedFetch = function (input, init) {
      if (typeof input === 'string') {
        input = rewriteUrl(input, deployment, targetWin);
      } else if (input && typeof input.url === 'string') {
        var next = rewriteUrl(input.url, deployment, targetWin);
        if (next !== input.url) {
          input = new targetWin.Request(next, input);
        }
      }
      return nativeFetch.call(targetWin, input, init);
    };
    patchedFetch.__embedBcPatched = true;
    targetWin.fetch = patchedFetch;
    targetWin.__embedBcFetchPathPatched = true;
  }

  function patchXhr(targetWin, deployment) {
    if (!targetWin) return;
    var XHR = targetWin.XMLHttpRequest;
    if (!XHR || !XHR.prototype) return;
    if (XHR.prototype.open && XHR.prototype.open.__embedBcXhrOpenPatched) return;
    var nativeOpen = XHR.prototype.open.__embedBcNativeOpen || XHR.prototype.open;
    function patchedOpen(method, url) {
      var args = Array.prototype.slice.call(arguments);
      if (typeof url === 'string') {
        args[1] = rewriteUrl(url, deployment, targetWin);
      }
      return nativeOpen.apply(this, args);
    }
    patchedOpen.__embedBcXhrOpenPatched = true;
    patchedOpen.__embedBcNativeOpen = nativeOpen;
    XHR.prototype.open = patchedOpen;
    targetWin.__embedBcXhrPathPatched = true;
  }

  function patchRequest(targetWin, deployment) {
    if (!targetWin || !targetWin.Request || targetWin.__embedBcRequestPathPatched) return;
    var NativeRequest = targetWin.Request;
    targetWin.Request = function (input, init) {
      if (typeof input === 'string') {
        input = rewriteUrl(input, deployment, targetWin);
      } else if (input && typeof input.url === 'string') {
        var next = rewriteUrl(input.url, deployment, targetWin);
        if (next !== input.url) {
          input = new NativeRequest(next, input);
        }
      }
      return new NativeRequest(input, init);
    };
    targetWin.Request.prototype = NativeRequest.prototype;
    targetWin.__embedBcRequestPathPatched = true;
  }

  function patchSendBeacon(targetWin, deployment) {
    if (!targetWin || !targetWin.navigator || targetWin.__embedBcBeaconPathPatched) return;
    if (typeof targetWin.navigator.sendBeacon !== 'function') return;
    var native = targetWin.navigator.sendBeacon.bind(targetWin.navigator);
    targetWin.navigator.sendBeacon = function (url, data) {
      return native(rewriteUrl(url, deployment, targetWin), data);
    };
    targetWin.__embedBcBeaconPathPatched = true;
  }

  function wrapAlloyInstance(targetWin, name, deployment) {
    var fn = targetWin[name];
    if (typeof fn !== 'function' || fn.__embedBcEdgeAlloyWrapped) return;
    var native = fn;
    var wrapped = function (command) {
      captureNativeFetch(targetWin);
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
    wrapped.__embedBcEdgeAlloyWrapped = true;
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
    if (targetWin.adobe.concierge.bootstrap.__embedBcEdgeBootstrapPatched) return;
    var orig = targetWin.adobe.concierge.bootstrap.bind(targetWin.adobe.concierge);
    targetWin.adobe.concierge.bootstrap = async function (config) {
      applyArmyBcEdgePathPatches(targetWin);
      var out = await orig(config);
      applyArmyBcEdgePathPatches(targetWin);
      return out;
    };
    targetWin.adobe.concierge.bootstrap.__embedBcEdgeBootstrapPatched = true;
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
        return rewriteUrl(url, deployment, w);
      },
    };
    console.info(
      '[embed-bc-edge-path] BC conversations → /brand-concierge/' +
        deployment +
        '/conversations (?embedBcLocal=1 to skip)',
    );
    return true;
  }

  win.applyArmyBcEdgePathPatches = applyArmyBcEdgePathPatches;

  applyArmyBcEdgePathPatches(win);
})(typeof window !== 'undefined' ? window : this);
