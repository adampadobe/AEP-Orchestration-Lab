/**
 * Site-clone demo shell — handles login-request postMessage from iframe snapshots.
 */
(function siteCloneLoginShell(global) {
  'use strict';

  function resolveFileSlug(opts) {
    var env = global.SiteCloneDemoEnv || {};
    if (opts && opts.fileSlug) return String(opts.fileSlug).trim();
    if (env.fileSlug) return String(env.fileSlug).trim();
    return '';
  }

  function loginSourcesForSlug(fileSlug) {
    var slug = String(fileSlug || '').trim().toLowerCase();
    return {
      labSource: slug ? slug + '-lab' : 'site-clone-lab',
      shellSource: slug ? slug + '-demo-shell' : 'site-clone-demo-shell',
    };
  }

  /**
   * @param {{
   *   fileSlug?: string,
   *   getEmail: () => string,
   *   setMessage: (text: string, type?: string) => void,
   *   customerEmailEl?: HTMLInputElement|null,
   *   tagsInjection?: { stitchAfterProfileLookup?: (profile: unknown, email: string) => Promise<boolean> }|null,
   *   iframeEl?: HTMLIFrameElement|null,
   * }} opts
   */
  function init(opts) {
    if (global.__siteCloneLoginShellInit) return;
    global.__siteCloneLoginShellInit = true;

    var options = opts || {};
    var fileSlug = resolveFileSlug(options);
    var sources = loginSourcesForSlug(fileSlug);
    var customerEmail = options.customerEmailEl || document.getElementById('customerEmail');
    var siteFrame = options.iframeEl || null;

    if (!siteFrame && global.SiteCloneBcPage && global.SiteCloneBcPage.iframeId) {
      siteFrame = document.getElementById(global.SiteCloneBcPage.iframeId);
    }

    function getEmail() {
      if (typeof options.getEmail === 'function') return options.getEmail();
      return (customerEmail && customerEmail.value) || '';
    }

    function setMessage(text, type) {
      if (typeof options.setMessage === 'function') options.setMessage(text, type);
    }

    async function performProfileLookup(email) {
      var idVal = String(email || getEmail() || '').trim();
      if (!idVal) return false;
      if (customerEmail) customerEmail.value = idVal;
      setMessage('Looking up profile...', '');
      if (
        typeof global.DemoProfileDrawer === 'undefined' ||
        typeof global.DemoProfileDrawer.loadProfileDataForDrawer !== 'function'
      ) {
        setMessage('Profile drawer is not available.', 'error');
        return false;
      }
      var ok = await global.DemoProfileDrawer.loadProfileDataForDrawer(idVal, { updateMessage: true });
      if (!ok) return false;
      var tagsInjection = options.tagsInjection;
      if (tagsInjection && typeof tagsInjection.stitchAfterProfileLookup === 'function') {
        var profile =
          global.DemoProfileDrawer && typeof global.DemoProfileDrawer.getLastLookedUpProfile === 'function'
            ? global.DemoProfileDrawer.getLastLookedUpProfile()
            : null;
        var stitched = await tagsInjection.stitchAfterProfileLookup(profile, idVal);
        if (stitched) setMessage('Profile loaded and email linked to ECID for stitching.', 'success');
      }
      return true;
    }

    function postLoginComplete(detail) {
      var payload = {
        source: sources.shellSource,
        type: 'login-complete',
        found: !!detail.found,
        email: detail.email || '',
        firstName: detail.firstName || null,
      };
      if (siteFrame && siteFrame.contentWindow) {
        siteFrame.contentWindow.postMessage(payload, '*');
      }
      global.postMessage(payload, '*');
    }

    async function handleLoginRequest(data) {
      if (!data || data.source !== sources.labSource) return;
      if (data.type !== 'login-request') return;
      var email = String(data.email || '').trim();
      if (!email) return;
      var ok = await performProfileLookup(email);
      var profile =
        global.DemoProfileDrawer && typeof global.DemoProfileDrawer.getLastLookedUpProfile === 'function'
          ? global.DemoProfileDrawer.getLastLookedUpProfile()
          : null;
      postLoginComplete({
        found: !!ok,
        email: email,
        firstName: profile && profile.firstName ? profile.firstName : null,
      });
    }

    global.addEventListener('message', function (ev) {
      if (siteFrame && siteFrame.contentWindow && ev.source === siteFrame.contentWindow) {
        void handleLoginRequest(ev.data);
        return;
      }
      void handleLoginRequest(ev.data);
    });
  }

  global.SiteCloneLoginShell = {
    init: init,
    loginSourcesForSlug: loginSourcesForSlug,
  };
})(typeof window !== 'undefined' ? window : globalThis);
