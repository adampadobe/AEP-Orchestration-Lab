/**
 * Canonical lab demo environment bar — single source of truth for site-clone demos.
 * Includes Adobe Tags, Adobe Target (datastream), Brand Concierge, and Decisioning toggles.
 *
 * @see docs/demo-env-strip-standard.md
 */
(function attachDemoEnvStrip(global) {
  'use strict';

  var MOUNT_ATTR = 'data-demo-env-strip-mount';
  var PREFIX_ATTR = 'data-demo-env-strip-prefix';
  var MOUNTED_ATTR = 'data-demo-env-strip-mounted';
  var CACHE_BUST = '20260623-spectrum';
  var MOUNTED_EVENT = 'aep-demo-env-strip-mounted';
  var FOOTER_ATTR = 'data-demo-env-strip-footer';

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

  function readShellConfig(host) {
    if (!host) return null;
    var prefix = String(host.getAttribute(PREFIX_ATTR) || '').trim();
    if (!prefix) return null;
    var cap = capPrefix(prefix);
    return {
      prefix: prefix,
      nsSelectId: host.getAttribute('data-demo-env-strip-ns-id') || prefix + 'Ns',
      selectedScriptId: host.getAttribute('data-demo-env-strip-selected-script-id') || prefix + 'SelectedScript',
      scriptPreviewClass: host.getAttribute('data-demo-env-strip-script-preview-class') || 'mod-demo-script-preview',
      messageId: host.getAttribute('data-demo-env-strip-message-id') || prefix + 'Message',
      messageClass: host.getAttribute('data-demo-env-strip-message-class') || 'mod-demo-message',
      disclaimerHtml: host.getAttribute('data-demo-env-strip-disclaimer') || '',
      profileBtnLabel: host.getAttribute('data-demo-env-strip-profile-btn-label') || 'Look up profile',
      changeSdkBtnId: host.getAttribute('data-demo-env-strip-change-sdk-btn-id') || prefix + 'ChangeSdkConfigBtn',
      summaryExtraClass: host.getAttribute('data-demo-env-strip-summary-class') || '',
      defaultBcStyle: host.getAttribute('data-demo-env-strip-default-bc-style') || '',
      includeBottomDock: host.getAttribute('data-demo-env-strip-bc-bottom') === '1',
      includeDecisioning: host.getAttribute('data-demo-env-strip-decisioning') !== '0',
      variant: String(host.getAttribute('data-demo-env-strip-variant') || '').trim().toLowerCase(),
      title: host.getAttribute('data-demo-env-strip-title') || '',
      subtitle: host.getAttribute('data-demo-env-strip-subtitle') || 'Active Configuration',
      hideGeneratorTarget: host.getAttribute('data-demo-env-strip-hide-generator-target') === '1',
      hideNamespace: host.getAttribute('data-demo-env-strip-hide-namespace') === '1',
      webUrl: host.getAttribute('data-demo-env-strip-web-url') || '',
      mobileUrl: host.getAttribute('data-demo-env-strip-mobile-url') || '',
      channel: host.getAttribute('data-demo-env-strip-channel') || '',
    };
  }

  /**
   * Site-clone Tags block (Tags + Brand Concierge style + Adobe Target datastream).
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
      '<div class="site-clone-bc-env-product-block" role="group" aria-labelledby="siteCloneBcProductHeading">' +
      '<span class="site-clone-bc-prefs__label site-clone-env-product-kicker" id="siteCloneBcProductHeading">Brand Concierge</span>' +
      '<div class="form-row site-clone-bc-style-url-row">' +
      '<label for="siteCloneBcStyleConfigUrl">Style configuration</label>' +
      '<select id="siteCloneBcStyleConfigUrl" class="site-clone-bc-style-url-select site-clone-bc-style-url-input" aria-label="Brand Concierge style configuration script"></select>' +
      '<p id="siteCloneBcStyleConfigResolved" class="site-clone-bc-style-url-hint" aria-live="polite"></p>' +
      '</div>' +
      '</div>' +
      '<div class="site-clone-bc-env-product-block" role="group" aria-labelledby="siteCloneTargetProductHeading">' +
      '<span class="site-clone-bc-prefs__label site-clone-env-product-kicker" id="siteCloneTargetProductHeading">Adobe Target</span>' +
      '<div class="form-row site-clone-bc-datastream-row">' +
      '<label for="siteCloneBcDatastreamId">Lab datastream override</label>' +
      '<input type="text" id="siteCloneBcDatastreamId" class="site-clone-bc-datastream-input" aria-label="Lab datastream override UUID" placeholder="Target-enabled datastream UUID" list="siteCloneBcDatastreamList" autocomplete="off" spellcheck="false">' +
      '<datalist id="siteCloneBcDatastreamList"></datalist>' +
      '<p id="siteCloneBcDatastreamHint" class="site-clone-bc-style-url-hint" aria-live="polite">Used for lab sendEvent / Target (edgeConfigOverrides).</p>' +
      '</div>' +
      '</div>' +
      '<div class="form-row site-clone-bc-env-strip__event-col">' +
      '<label for="generatorTarget">Event destination</label>' +
      '<select id="generatorTarget" aria-label="Edge or DCS streaming target"></select>' +
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

  function siteCloneProfileBcPrefsMarkup(options) {
    var opt = options || {};
    var bottomDockOption = opt.includeBottomDock
      ? '<label class="site-clone-bc-prefs__option">' +
        '<input type="checkbox" id="siteCloneBcBottomDockToggle" data-site-clone-bc-style-from="siteCloneBcStyleConfigUrl">' +
        '<span>Centre bottom</span>' +
        '</label>'
      : '';
    var decisioningBlock = opt.includeDecisioning
      ? '<div class="site-clone-decisioning-prefs-field" role="group" aria-labelledby="siteCloneDecisioningPrefsHeading">' +
        '<span class="site-clone-bc-prefs__label" id="siteCloneDecisioningPrefsHeading">Decisioning</span>' +
        '<div class="site-clone-bc-prefs__options">' +
        '<label class="site-clone-bc-prefs__option">' +
        '<input type="checkbox" id="siteCloneDecisioningEnabledToggle">' +
        '<span>Enable</span>' +
        '</label>' +
        '</div></div>'
      : '';
    return (
      '<div class="site-clone-profile-lab-prefs-row">' +
      '<div class="site-clone-bc-prefs-field" role="group" aria-labelledby="siteCloneBcPrefsHeading">' +
      '<span class="site-clone-bc-prefs__label" id="siteCloneBcPrefsHeading">Brand Concierge</span>' +
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
      bottomDockOption +
      '</div>' +
      '</div>' +
      decisioningBlock +
      '</div>'
    );
  }

  /**
   * Full env bar grid (environment + profile lookup columns). Tags/BC prefs mount inside.
   */
  function siteCloneEnvShellGridMarkup(config) {
    var c = config || {};
    var prefix = String(c.prefix || '').trim();
    if (!prefix) return '';
    var cap = capPrefix(prefix);
    var summaryClass =
      esc(prefix) + '-sdk-summary mod-sdk-summary mod-sdk-summary--below-env-grid' +
      (c.summaryExtraClass ? ' ' + esc(c.summaryExtraClass) : '');
    var tagsMountAttrs =
      MOUNT_ATTR +
      '="site-clone-tags" ' +
      PREFIX_ATTR +
      '="' +
      esc(prefix) +
      '"';
    if (c.defaultBcStyle) {
      tagsMountAttrs += ' data-demo-env-strip-default-bc-style="' + esc(c.defaultBcStyle) + '"';
    }
    var prefsAttrs = MOUNT_ATTR + '="site-clone-bc-prefs" id="siteCloneBcPrefsMount"';
    if (c.includeBottomDock) prefsAttrs += ' data-demo-env-strip-bc-bottom="1"';
    if (c.includeDecisioning) prefsAttrs += ' data-demo-env-strip-decisioning="1"';

    return (
      '<section class="aep-demo-env-section" id="aepDemoEnvSection" aria-label="AEP environment">' +
      '<div class="aep-demo-env-editor" id="aepDemoEnvEditor">' +
      '<div id="aepDemoEnvConfigGrid" class="aep-demo-env-collapsible">' +
      '<span class="aep-demo-env-kicker">Environment</span>' +
      '<div class="aep-demo-env-editor-grid">' +
      '<div class="form-row">' +
      '<label for="sandboxSelect">Sandbox</label>' +
      '<select id="sandboxSelect" class="sandbox-select" aria-label="Select AEP sandbox">' +
      '<option value="">Loading sandboxes…</option>' +
      '</select>' +
      '</div>' +
      '<div id="' +
      esc(prefix) +
      'SdkConfigFieldsMount" ' +
      tagsMountAttrs +
      '></div>' +
      '</div>' +
      '<div id="' +
      esc(prefix) +
      'SdkConfigSummary" class="' +
      summaryClass +
      '" hidden>' +
      '<span id="' +
      esc(prefix) +
      'SdkConfigSummaryText"></span>' +
      '<button type="button" id="' +
      esc(c.changeSdkBtnId || prefix + 'ChangeSdkConfigBtn') +
      '" class="btn-lookup">Change SDK config</button>' +
      '</div>' +
      '</div>' +
      '<div class="aep-demo-env-compact" id="aepDemoEnvCompact" hidden>' +
      '<span class="aep-demo-env-compact-text" id="aepDemoEnvCompactText"></span>' +
      '<button type="button" id="aepDemoEnvExpandBtn" class="btn-lookup aep-demo-env-expand-btn">Change environment</button>' +
      '</div>' +
      '</div>' +
      '</section>' +
      '<section class="aep-demo-profile-section" id="aepDemoProfileSection" aria-label="Profile lookup">' +
      '<span class="aep-demo-env-kicker">Profile lookup</span>' +
      '<div class="aep-demo-profile-section-grid">' +
      '<div class="form-row">' +
      '<label for="' +
      esc(c.nsSelectId || prefix + 'Ns') +
      '">Namespace</label>' +
      '<select id="' +
      esc(c.nsSelectId || prefix + 'Ns') +
      '" class="sandbox-select" aria-label="Identity namespace">' +
      '<option value="email">Email</option>' +
      '<option value="ecid">ECID</option>' +
      '<option value="crmId">CRM ID</option>' +
      '<option value="loyaltyId">Loyalty ID</option>' +
      '<option value="phone">Phone</option>' +
      '</select>' +
      '</div>' +
      '<div class="form-row">' +
      '<label for="customerEmail">Identifier value</label>' +
      '<input type="text" id="customerEmail" placeholder="Enter identifier" autocomplete="off" spellcheck="false">' +
      '</div>' +
      '<div class="mod-demo-profile-actions">' +
      '<button type="button" id="queryProfileBtn" class="btn-lookup">' +
      esc(c.profileBtnLabel || 'Look up profile') +
      '</button>' +
      '<span class="mod-demo-ecid-hint" id="ecidHint" aria-live="polite">ECID: <strong id="infoEcid">—</strong></span>' +
      '<div ' +
      prefsAttrs +
      '></div>' +
      '</div>' +
      '</div>' +
      '</section>'
    );
  }

  /**
   * Minimal env bar — sandbox + profile lookup only (no Tags / BC / decisioning).
   * Used by Sky LLM snapshot shells and call-centre pinned lookup.
   */
  function siteCloneMinimalGridMarkup(config) {
    var c = config || {};
    var prefix = String(c.prefix || '').trim();
    if (!prefix) return '';
    var genHidden = c.hideGeneratorTarget ? ' hidden' : '';
    var nsBlock = c.hideNamespace
      ? ''
      : '<div class="form-row">' +
        '<label for="' +
        esc(c.nsSelectId || prefix + 'Ns') +
        '">Namespace</label>' +
        '<select id="' +
        esc(c.nsSelectId || prefix + 'Ns') +
        '" class="sandbox-select" aria-label="Identity namespace">' +
        '<option value="email">Email</option>' +
        '<option value="ecid">ECID</option>' +
        '<option value="crmId">CRM ID</option>' +
        '<option value="loyaltyId">Loyalty ID</option>' +
        '<option value="phone">Phone</option>' +
        '</select>' +
        '</div>';
    return (
      '<section class="aep-demo-env-section" id="aepDemoEnvSection" aria-label="AEP environment">' +
      '<div class="aep-demo-env-editor" id="aepDemoEnvEditor">' +
      '<div id="aepDemoEnvConfigGrid" class="aep-demo-env-collapsible">' +
      '<span class="aep-demo-env-kicker">Environment</span>' +
      '<div class="aep-demo-env-editor-grid">' +
      '<div class="form-row">' +
      '<label for="sandboxSelect">Sandbox</label>' +
      '<select id="sandboxSelect" class="sandbox-select" aria-label="Select AEP sandbox">' +
      '<option value="">Loading sandboxes…</option>' +
      '</select>' +
      '</div>' +
      '<div class="form-row"' +
      genHidden +
      '>' +
      '<label for="generatorTarget">Event destination</label>' +
      '<select id="generatorTarget" aria-label="Edge or DCS streaming target"></select>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div class="aep-demo-env-compact" id="aepDemoEnvCompact" hidden>' +
      '<span class="aep-demo-env-compact-text" id="aepDemoEnvCompactText"></span>' +
      '<button type="button" id="aepDemoEnvExpandBtn" class="btn-lookup aep-demo-env-expand-btn">Change environment</button>' +
      '</div>' +
      '</div>' +
      '</section>' +
      '<section class="aep-demo-profile-section" id="aepDemoProfileSection" aria-label="Profile lookup">' +
      '<span class="aep-demo-env-kicker">Profile lookup</span>' +
      '<div class="aep-demo-profile-section-grid">' +
      nsBlock +
      '<div class="form-row">' +
      '<label for="customerEmail">Identifier value</label>' +
      '<input type="text" id="customerEmail" placeholder="Enter identifier" autocomplete="off" spellcheck="false">' +
      '</div>' +
      '<div class="mod-demo-profile-actions">' +
      '<button type="button" id="queryProfileBtn" class="btn-lookup">' +
      esc(c.profileBtnLabel || 'Look up profile') +
      '</button>' +
      '<span class="mod-demo-ecid-hint" id="ecidHint" aria-live="polite">ECID: <strong id="infoEcid">—</strong></span>' +
      '</div>' +
      '</div>' +
      '</section>'
    );
  }

  /** Sandbox select only — for FNB utility row and call-centre v1 hybrid chrome. */
  function siteCloneSandboxOnlyMarkup() {
    return (
      '<section class="aep-demo-env-section aep-demo-env-section--sandbox-only" id="aepDemoEnvSection" aria-label="AEP environment">' +
      '<div class="aep-demo-env-editor" id="aepDemoEnvEditor">' +
      '<div id="aepDemoEnvConfigGrid" class="aep-demo-env-collapsible">' +
      '<div class="aep-demo-env-editor-grid">' +
      '<div class="form-row">' +
      '<label for="sandboxSelect">Sandbox</label>' +
      '<select id="sandboxSelect" class="sandbox-select" aria-label="Select AEP sandbox">' +
      '<option value="">Loading sandboxes…</option>' +
      '</select>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div class="aep-demo-env-compact" id="aepDemoEnvCompact" hidden>' +
      '<span class="aep-demo-env-compact-text" id="aepDemoEnvCompactText"></span>' +
      '<button type="button" id="aepDemoEnvExpandBtn" class="btn-lookup aep-demo-env-expand-btn">Change environment</button>' +
      '</div>' +
      '</div>' +
      '</section>'
    );
  }

  function mountSiteCloneMinimalShell(config) {
    var c = config || {};
    var host = c.host;
    if (!host) return { mounted: false, reason: 'host-not-found' };
    if (host.getAttribute(MOUNTED_ATTR) === '1') {
      return { mounted: true, alreadyPresent: true };
    }
    var shellCfg = c.shellConfig || readShellConfig(host);
    if (!shellCfg) return { mounted: false, reason: 'missing-shell-config' };
    host.classList.add('aep-demo-id-inner');
    host.innerHTML = siteCloneMinimalGridMarkup(shellCfg);
    host.setAttribute(MOUNTED_ATTR, '1');
    mountShellFooter(host, shellCfg);
    try {
      global.dispatchEvent(new CustomEvent(MOUNTED_EVENT, { detail: { prefix: shellCfg.prefix, mode: 'minimal' } }));
    } catch (_e) {
      /* noop */
    }
    return { mounted: true };
  }

  function mountSiteCloneSandboxOnly(config) {
    var c = config || {};
    var host = c.host;
    if (!host) return { mounted: false, reason: 'host-not-found' };
    if (host.getAttribute(MOUNTED_ATTR) === '1') {
      return { mounted: true, alreadyPresent: true };
    }
    host.innerHTML = siteCloneSandboxOnlyMarkup();
    host.setAttribute(MOUNTED_ATTR, '1');
    try {
      global.dispatchEvent(
        new CustomEvent(MOUNTED_EVENT, { detail: { prefix: host.getAttribute(PREFIX_ATTR) || '', mode: 'sandbox-only' } }),
      );
    } catch (_e2) {
      /* noop */
    }
    return { mounted: true };
  }

  function siteCloneEnvShellFooterMarkup(config) {
    var c = config || {};
    if (!c.selectedScriptId) return '';
    var parts = [];
    parts.push(
      '<p class="' +
        esc(c.scriptPreviewClass || 'mod-demo-script-preview') +
        '">Selected script: <code id="' +
        esc(c.selectedScriptId) +
        '">None</code></p>',
    );
    if (c.messageId) {
      parts.push(
        '<p id="' +
          esc(c.messageId) +
          '" class="' +
          esc(c.messageClass || 'mod-demo-message') +
          '" role="status" aria-live="polite" hidden></p>',
      );
    }
    if (c.disclaimerHtml) {
      parts.push('<p class="mod-demo-disclaimer">' + c.disclaimerHtml + '</p>');
    }
    return parts.join('');
  }

  function mountShellFooter(host, config) {
    if (!host || !host.parentNode) return;
    var existing = host.parentNode.querySelector('[' + FOOTER_ATTR + '="1"]');
    if (existing) existing.remove();
    var html = siteCloneEnvShellFooterMarkup(config);
    if (!html) return;
    var wrap = document.createElement('div');
    wrap.setAttribute(FOOTER_ATTR, '1');
    wrap.innerHTML = html;
    while (wrap.firstChild) {
      host.parentNode.insertBefore(wrap.firstChild, host.nextSibling);
    }
  }

  function mountSiteCloneTagsFields(config) {
    var c = config || {};
    var prefix = String(c.prefix || '').trim();
    if (!prefix) return { mounted: false, reason: 'missing-prefix' };
    var hostId = c.mountId || prefix + 'SdkConfigFields';
    var host = document.getElementById(hostId);
    if (!host) {
      host = document.getElementById(prefix + 'SdkConfigFieldsMount');
    }
    if (!host) return { mounted: false, reason: 'host-not-found' };
    if (host.getAttribute(MOUNTED_ATTR) === '1' && document.getElementById(prefix + 'SdkConfigFields')) {
      return { mounted: true, alreadyPresent: true };
    }
    var html = siteCloneTagsFieldsMarkup(prefix, { defaultBcStyle: c.defaultBcStyle });
    if (host.getAttribute(MOUNT_ATTR) === 'site-clone-tags' || c.replaceHost !== false) {
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

  function mountSiteCloneProfileBcPrefs(config) {
    var c = config || {};
    var hostId = c.mountId || 'siteCloneBcPrefsMount';
    var host = document.getElementById(hostId);
    if (!host) return { mounted: false, reason: 'host-not-found' };
    if (host.getAttribute(MOUNTED_ATTR) === '1') return { mounted: true, alreadyPresent: true };
    var includeBottomDock =
      c.includeBottomDock === true || host.getAttribute('data-demo-env-strip-bc-bottom') === '1';
    var includeDecisioning =
      c.includeDecisioning !== false && host.getAttribute('data-demo-env-strip-decisioning') !== '0';
    host.innerHTML = siteCloneProfileBcPrefsMarkup({ includeBottomDock: includeBottomDock, includeDecisioning: includeDecisioning });
    host.setAttribute(MOUNTED_ATTR, '1');
    return { mounted: true };
  }

  function mountSiteCloneEnvShell(config) {
    var c = config || {};
    var host = c.host;
    if (!host) return { mounted: false, reason: 'host-not-found' };
    if (host.getAttribute(MOUNTED_ATTR) === '1') {
      return { mounted: true, alreadyPresent: true };
    }
    var shellCfg = c.shellConfig || readShellConfig(host);
    if (!shellCfg) return { mounted: false, reason: 'missing-shell-config' };
    if (shellCfg.variant === 'spectrum' && global.DemoEnvStripSpectrum && typeof global.DemoEnvStripSpectrum.mountSpectrumShell === 'function') {
      return global.DemoEnvStripSpectrum.mountSpectrumShell(host, shellCfg, {
        mountSiteCloneProfileBcPrefs: mountSiteCloneProfileBcPrefs,
      });
    }
    host.classList.add('aep-demo-id-inner');
    host.innerHTML = siteCloneEnvShellGridMarkup(shellCfg);
    host.setAttribute(MOUNTED_ATTR, '1');
    mountSiteCloneTagsFields({
      prefix: shellCfg.prefix,
      defaultBcStyle: shellCfg.defaultBcStyle || undefined,
    });
    mountSiteCloneProfileBcPrefs({
      mountId: 'siteCloneBcPrefsMount',
      includeBottomDock: shellCfg.includeBottomDock,
      includeDecisioning: shellCfg.includeDecisioning,
    });
    mountShellFooter(host, shellCfg);
    return { mounted: true };
  }

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
    var shellHosts = document.querySelectorAll('[' + MOUNT_ATTR + '="site-clone-shell"]');
    shellHosts.forEach(function (host) {
      if (host.getAttribute(MOUNTED_ATTR) === '1') return;
      mountSiteCloneEnvShell({ host: host });
    });

    var minimalHosts = document.querySelectorAll('[' + MOUNT_ATTR + '="site-clone-minimal"]');
    minimalHosts.forEach(function (host) {
      if (host.getAttribute(MOUNTED_ATTR) === '1') return;
      mountSiteCloneMinimalShell({ host: host });
    });

    var sandboxOnlyHosts = document.querySelectorAll('[' + MOUNT_ATTR + '="site-clone-sandbox-only"]');
    sandboxOnlyHosts.forEach(function (host) {
      if (host.getAttribute(MOUNTED_ATTR) === '1') return;
      mountSiteCloneSandboxOnly({ host: host });
    });

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
    siteCloneEnvShellGridMarkup: siteCloneEnvShellGridMarkup,
    siteCloneMinimalGridMarkup: siteCloneMinimalGridMarkup,
    siteCloneSandboxOnlyMarkup: siteCloneSandboxOnlyMarkup,
    siteCloneEnvShellFooterMarkup: siteCloneEnvShellFooterMarkup,
    readShellConfig: readShellConfig,
    mountSiteCloneTagsFields: mountSiteCloneTagsFields,
    mountSiteCloneProfileBcPrefs: mountSiteCloneProfileBcPrefs,
    mountSiteCloneEnvShell: mountSiteCloneEnvShell,
    mountSiteCloneMinimalShell: mountSiteCloneMinimalShell,
    mountSiteCloneSandboxOnly: mountSiteCloneSandboxOnly,
    siteCloneDemoEnvObject: siteCloneDemoEnvObject,
    autoMount: autoMountFromDom,
    capPrefix: capPrefix,
  };

  global.DemoEnvStrip = api;

  autoMountFromDom();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoMountFromDom);
  }
})(typeof window !== 'undefined' ? window : globalThis);
