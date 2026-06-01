/**
 * Canonical lab demo environment strip — single source of truth for Tags / BC site-clone layout.
 * Master reference: sky-demo.html (Jun 2026). JLR matches Sky structurally.
 *
 * @see docs/demo-env-strip-standard.md
 * @see site-clone-bc-env-strip.fragment.html (legacy copy-paste reference; prefer this module)
 */
(function attachDemoEnvStrip(global) {
  'use strict';

  var MOUNT_ATTR = 'data-demo-env-strip-mount';
  var PREFIX_ATTR = 'data-demo-env-strip-prefix';
  var MOUNTED_ATTR = 'data-demo-env-strip-mounted';
  var CACHE_BUST = '20260601-env-strip-mount-sync';
  var MOUNTED_EVENT = 'aep-demo-env-strip-mounted';

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function capPrefix(prefix) {
    var p = String(prefix || '').trim();
    if (!p) return '';
    return p.charAt(0).toUpperCase() + p.slice(1);
  }

  /**
   * Site-clone Tags block (compact row + BC style/datastream + legacy hidden toggles).
   * @param {string} prefix — e.g. sky, premierInn, mod
   * @param {{ defaultBcStyle?: string }} [options]
   */
  function siteCloneTagsFieldsMarkup(prefix, options) {
    var opt = options || {};
    var p = String(prefix || '').trim();
    if (!p) return '';
    var injectId = p + 'InjectSdkBtn';
    var defaultBc = opt.defaultBcStyle || 'miral';
    var miralSel = defaultBc === 'miral' ? ' selected' : '';
    var genericSel = defaultBc === 'generic' ? ' selected' : '';
    var armySel = defaultBc === 'army' ? ' selected' : '';

    return (
      '<div id="' +
      esc(p) +
      'SdkConfigFields" class="' +
      esc(p) +
      '-sdk-config-fields mod-sdk-config-fields mod-demo-tags-block site-clone-bc-env-strip">' +
      '<div class="form-row mod-demo-tags-company-row" hidden>' +
      '<label for="' +
      esc(p) +
      'TagsCompany">Tags company</label>' +
      '<select id="' +
      esc(p) +
      'TagsCompany" aria-label="Tags company"></select>' +
      '</div>' +
      '<div class="site-clone-bc-env-strip__tags-row">' +
      '<div class="site-clone-bc-env-strip__property-col">' +
      '<div class="form-row">' +
      '<label for="' +
      esc(p) +
      'TagsProperty">Tags property</label>' +
      '<input type="text" id="' +
      esc(p) +
      'TagsProperty" aria-label="Tags property" placeholder="Select property" list="' +
      esc(p) +
      'TagsPropertyList" autocomplete="off" spellcheck="false">' +
      '<datalist id="' +
      esc(p) +
      'TagsPropertyList"></datalist>' +
      '</div>' +
      '<div class="site-clone-bc-env-strip__inject-actions mod-demo-id-actions">' +
      '<button type="button" id="' +
      esc(injectId) +
      '" class="btn-lookup">Inject selected script</button>' +
      '</div>' +
      '</div>' +
      '<div class="form-row site-clone-bc-env-strip__environment-col">' +
      '<label for="' +
      esc(p) +
      'TagsEnvironment">Tags environment</label>' +
      '<select id="' +
      esc(p) +
      'TagsEnvironment" aria-label="Tags environment"></select>' +
      '</div>' +
      '<div class="site-clone-bc-env-pair">' +
      '<div class="form-row site-clone-bc-style-url-row">' +
      '<label for="siteCloneBcStyleConfigUrl">Brand Concierge style configuration</label>' +
      '<select id="siteCloneBcStyleConfigUrl" class="site-clone-bc-style-url-select site-clone-bc-style-url-input" aria-label="Brand Concierge style configuration script"></select>' +
      '<p id="siteCloneBcStyleConfigResolved" class="site-clone-bc-style-url-hint" aria-live="polite"></p>' +
      '</div>' +
      '<div class="form-row site-clone-bc-datastream-row">' +
      '<label for="siteCloneBcDatastreamId">Alloy datastream</label>' +
      '<input type="text" id="siteCloneBcDatastreamId" class="site-clone-bc-datastream-input" aria-label="Alloy datastream for Brand Concierge" placeholder="Select or search datastream" list="siteCloneBcDatastreamList" autocomplete="off" spellcheck="false">' +
      '<datalist id="siteCloneBcDatastreamList"></datalist>' +
      '<p id="siteCloneBcDatastreamHint" class="site-clone-bc-style-url-hint" aria-live="polite"></p>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div class="site-clone-bc-env-strip__legacy-inject-toggles" aria-hidden="true">' +
      '<div class="form-row aep-demo-web-push-row" role="group" aria-label="Web push">' +
      '<label class="aep-demo-web-push-label">' +
      '<input type="checkbox" id="' +
      esc(p) +
      'WebPushOnInjectToggle">' +
      '<span>Register web push when injecting Tags</span>' +
      '</label>' +
      '</div>' +
      '<div class="aep-demo-web-push-retry">' +
      '<button type="button" id="' +
      esc(p) +
      'WebPushRetryBtn" class="btn-lookup">Register web push now</button>' +
      '</div>' +
      '<div class="form-row aep-bc-toggle-row" role="group" aria-label="Brand Concierge">' +
      '<label class="aep-demo-web-push-label">' +
      '<input type="checkbox" id="' +
      esc(p) +
      'BcOnInjectToggle">' +
      '<span>Enable Brand Concierge when injecting Tags</span>' +
      '</label>' +
      '<select id="' +
      esc(p) +
      'BcStyleSelect" class="aep-bc-style-select" aria-label="Brand Concierge style">' +
      '<option value="miral"' +
      miralSel +
      '>Miral</option>' +
      '<option value="generic"' +
      genericSel +
      '>Generic (DemoEfficiency)</option>' +
      '<option value="army"' +
      armySel +
      '>Army Recruitment</option>' +
      '</select>' +
      '</div>' +
      '</div>' +
      '</div>'
    );
  }

  /** Profile-column BC display mode toggles (Full Screen / Modal / Injected). */
  function siteCloneProfileBcPrefsMarkup() {
    return (
      '<div class="site-clone-bc-prefs-field" role="group" aria-labelledby="siteCloneBcPrefsHeading">' +
      '<span class="site-clone-bc-prefs__label" id="siteCloneBcPrefsHeading">Show Brand Concierge</span>' +
      '<div class="site-clone-bc-prefs__options">' +
      '<label class="site-clone-bc-prefs__option">' +
      '<input type="checkbox" id="siteCloneBcFullScreenToggle" data-site-clone-bc-style-from="siteCloneBcStyleConfigUrl">' +
      '<span>Full Screen</span>' +
      '</label>' +
      '<label class="site-clone-bc-prefs__option">' +
      '<input type="checkbox" id="siteCloneBcModalToggle" data-site-clone-bc-style-from="siteCloneBcStyleConfigUrl">' +
      '<span>Modal</span>' +
      '</label>' +
      '<label class="site-clone-bc-prefs__option">' +
      '<input type="checkbox" id="siteCloneBcInjectedToggle" data-site-clone-bc-style-from="siteCloneBcStyleConfigUrl">' +
      '<span>Injected</span>' +
      '</label>' +
      '</div>' +
      '</div>'
    );
  }

  /**
   * @param {{ prefix: string, mountId?: string, replaceHost?: boolean, defaultBcStyle?: string }} config
   */
  function mountSiteCloneTagsFields(config) {
    var c = config || {};
    var prefix = String(c.prefix || '').trim();
    if (!prefix) return { mounted: false, reason: 'missing-prefix' };
    var hostId = c.mountId || prefix + 'SdkConfigFields';
    var host = document.getElementById(hostId);
    if (!host) return { mounted: false, reason: 'host-not-found' };
    if (host.getAttribute(MOUNTED_ATTR) === '1' && document.getElementById(prefix + 'SdkConfigFields')) {
      return { mounted: true, alreadyPresent: true };
    }
    var html = siteCloneTagsFieldsMarkup(prefix, { defaultBcStyle: c.defaultBcStyle });
    if (c.replaceHost !== false && host.getAttribute(MOUNT_ATTR) === 'site-clone-tags') {
      host.outerHTML = html;
    } else {
      host.innerHTML = html;
      host.id = prefix + 'SdkConfigFields';
      host.className =
        prefix + '-sdk-config-fields mod-sdk-config-fields mod-demo-tags-block site-clone-bc-env-strip';
    }
    var mounted = document.getElementById(prefix + 'SdkConfigFields');
    if (mounted) mounted.setAttribute(MOUNTED_ATTR, '1');
    if (mounted) {
      try {
        global.dispatchEvent(
          new CustomEvent(MOUNTED_EVENT, { detail: { prefix: prefix, mountId: prefix + 'SdkConfigFields' } }),
        );
      } catch (_e) {
        /* noop */
      }
    }
    return { mounted: !!mounted };
  }

  /**
   * @param {{ mountId?: string }} [config]
   */
  function mountSiteCloneProfileBcPrefs(config) {
    var c = config || {};
    var hostId = c.mountId || 'siteCloneBcPrefsMount';
    var host = document.getElementById(hostId);
    if (!host) return { mounted: false, reason: 'host-not-found' };
    if (host.getAttribute(MOUNTED_ATTR) === '1') return { mounted: true, alreadyPresent: true };
    host.innerHTML = siteCloneProfileBcPrefsMarkup();
    host.setAttribute(MOUNTED_ATTR, '1');
    return { mounted: true };
  }

  /** Build window.SiteCloneDemoEnv from prefix + storage prefix. */
  function siteCloneDemoEnvObject(prefix, storagePrefix) {
    var p = String(prefix || '').trim();
    var sp = String(storagePrefix || p + 'Demo').trim();
    return {
      storagePrefix: sp,
      webPushBySandboxKey: sp + 'WebPushOnInjectBySandbox',
      webPushLegacyKey: sp + 'WebPushOnInjectToggle',
      webPushToggleId: p + 'WebPushOnInjectToggle',
      bcOnInjectToggleId: p + 'BcOnInjectToggle',
      bcStyleSelectId: p + 'BcStyleSelect',
    };
  }

  function autoMountFromDom() {
    var tagsHosts = document.querySelectorAll('[' + MOUNT_ATTR + '="site-clone-tags"]');
    tagsHosts.forEach(function (host) {
      if (host.getAttribute(MOUNTED_ATTR) === '1') return;
      var prefix = host.getAttribute(PREFIX_ATTR) || '';
      if (!prefix && host.id && host.id.indexOf('SdkConfigFields') > 0) {
        prefix = host.id.replace(/SdkConfigFields$/, '').replace(/Mount$/, '');
      }
      var defaultBcStyle = host.getAttribute('data-demo-env-strip-default-bc-style') || '';
      mountSiteCloneTagsFields({
        prefix: prefix,
        mountId: host.id,
        replaceHost: true,
        defaultBcStyle: defaultBcStyle || undefined,
      });
    });

    var prefsHosts = document.querySelectorAll('[' + MOUNT_ATTR + '="site-clone-bc-prefs"]');
    prefsHosts.forEach(function (host) {
      if (host.getAttribute(MOUNTED_ATTR) === '1') return;
      mountSiteCloneProfileBcPrefs({ mountId: host.id || 'siteCloneBcPrefsMount' });
    });
  }

  var api = {
    CACHE_BUST: CACHE_BUST,
    siteCloneTagsFieldsMarkup: siteCloneTagsFieldsMarkup,
    siteCloneProfileBcPrefsMarkup: siteCloneProfileBcPrefsMarkup,
    mountSiteCloneTagsFields: mountSiteCloneTagsFields,
    mountSiteCloneProfileBcPrefs: mountSiteCloneProfileBcPrefs,
    siteCloneDemoEnvObject: siteCloneDemoEnvObject,
    autoMount: autoMountFromDom,
    capPrefix: capPrefix,
  };

  global.DemoEnvStrip = api;

  /** Mount hosts exist as soon as this script runs (bottom of body); do not wait for DOMContentLoaded only — DemoTagsInjection.init runs in later scripts in the same turn. */
  autoMountFromDom();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoMountFromDom);
  }
})(typeof window !== 'undefined' ? window : globalThis);
