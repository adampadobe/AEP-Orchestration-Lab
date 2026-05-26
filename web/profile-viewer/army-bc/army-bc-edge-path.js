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
    if (!targetWin.__armyBcNativeFetch) {
      targetWin.__armyBcNativeFetch = targetWin.fetch.bind(targetWin);
    }
  }

  function patchFetch(targetWin, deployment) {
    if (!targetWin || typeof targetWin.fetch !== 'function') return;
    captureNativeFetch(targetWin);
    var nativeFetch = targetWin.__armyBcNativeFetch;
    targetWin.fetch = function (input, init) {
      if (typeof input === 'string') {
        input = rewriteUrl(input, deployment);
      } else if (input && typeof input.url === 'string') {
        var next = rewriteUrl(input.url, deployment);
        if (next !== input.url) {
          input = new Request(next, input);
        }
      }
      return nativeFetch.call(targetWin, input, init);
    };
    targetWin.__armyBcFetchPathPatched = true;
  }

  function patchXhr(targetWin, deployment) {
    if (!targetWin || targetWin.__armyBcXhrPathPatched) return;
    var XHR = targetWin.XMLHttpRequest;
    if (!XHR || !XHR.prototype) return;
    var nativeOpen = XHR.prototype.open;
    XHR.prototype.open = function (method, url) {
      var args = Array.prototype.slice.call(arguments);
      if (typeof url === 'string') {
        args[1] = rewriteUrl(url, deployment);
      }
      return nativeOpen.apply(this, args);
    };
    targetWin.__armyBcXhrPathPatched = true;
  }

  function applyArmyBcEdgePathPatches(targetWin) {
    var w = targetWin || win;
    var deployment = resolveDeployment(w);
    if (!deployment) return false;
    captureNativeFetch(w);
    patchFetch(w, deployment);
    patchXhr(w, deployment);
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
