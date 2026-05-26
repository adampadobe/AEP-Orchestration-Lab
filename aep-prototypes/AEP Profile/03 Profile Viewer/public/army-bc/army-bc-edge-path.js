/**
 * Rewrite Brand Concierge conversation URLs for deployment-specific Edge paths.
 * Default (live Edge): /brand-concierge/nld2/conversations
 * Local-only demo: skip rewrite when ?armyBcLocal=1
 *
 * Override deployment: ?bcDeployment=other-slug
 */
(function () {
  var params = new URLSearchParams(window.location.search);
  var useLocal = params.has('armyBcLocal') || window.__armyBcUseLocal === true;
  var deploymentParam = params.get('bcDeployment');
  var deployment =
    deploymentParam !== null && deploymentParam !== ''
      ? deploymentParam
      : useLocal
        ? null
        : 'nld2';

  if (!deployment) return;

  function rewriteUrl(url) {
    if (!url || typeof url !== 'string' || url.indexOf('brand-concierge') === -1) {
      return url;
    }
    try {
      var u = new URL(url, window.location.href);
      var parts = u.pathname.split('/').filter(Boolean);
      var bcIdx = parts.indexOf('brand-concierge');
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

  if (!window.__armyBcFetchPathPatched) {
    var nativeFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      if (typeof input === 'string') {
        return nativeFetch(rewriteUrl(input), init);
      }
      if (input && typeof input === 'object' && input.url) {
        var next = rewriteUrl(input.url);
        if (next !== input.url) {
          input = new Request(next, input);
        }
      }
      return nativeFetch(input, init);
    };
    window.__armyBcFetchPathPatched = true;
  }

  window.ARMY_BC_EDGE = {
    deploymentSlug: deployment,
    rewriteUrl: rewriteUrl,
  };

  console.info(
    '[army-bc-edge-path] BC conversations → /brand-concierge/' +
      deployment +
      '/conversations (?armyBcLocal=1 to skip Edge and use local catalog)',
  );
})();
