/**
 * Adobe Spectrum layout variant for the lab env bar (Sky pilot).
 * Activated via data-demo-env-strip-variant="spectrum" on the site-clone-shell mount.
 *
 * @see shared/demo-env-bar-spectrum.css
 */
(function attachDemoEnvStripSpectrum(global) {
  'use strict';

  var MOUNTED_ATTR = 'data-demo-env-strip-mounted';

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function spectrumIcon(name) {
    var icons = {
      globe:
        '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.75"/><ellipse cx="12" cy="12" rx="4" ry="9" fill="none" stroke="currentColor" stroke-width="1.75"/><path d="M3 12h18" fill="none" stroke="currentColor" stroke-width="1.75"/></svg>',
      palette:
        '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M12 3a9 9 0 0 0-1 17.2V19a3 3 0 0 0 3-3h.2A9 9 0 0 0 12 3Zm-4 8a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5Zm2.5-4a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5Zm5 0a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5Zm2.5 4a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5Z"/></svg>',
      target:
        '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M14.5 3.5 12 6l-2.5-2.5L6 9 3.5 6.5 6 4 3.5 1.5 1.5 3.5 4 6 1.5 8.5 3.5 10.5 6 8l2.5 2.5L6 13.5l2.5 2.5 2.5-2.5 2.5 2.5 2.5-2.5L21 13.5l-2.5-2.5 2.5-2.5L21 6l-2.5-2.5L16 6l-1.5-2.5Z"/></svg>',
      profile:
        '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="8" r="3.5" fill="none" stroke="currentColor" stroke-width="1.75"/><path fill="none" stroke="currentColor" stroke-width="1.75" d="M5 20c1.5-3.5 4.2-5 7-5s5.5 1.5 7 5"/></svg>',
      adobe:
        '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M14.1 3 21 21h-4.2l-1.4-3.6H8.6L7.2 21H3l6.9-18h4.2Zm-1 11.2L10.8 8.4 8.7 14.2h4.4Z"/></svg>',
      send:
        '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="m3 11 18-8-8 18-2-7-8-3Z"/></svg>',
      search:
        '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="10.5" cy="10.5" r="5.75" fill="none" stroke="currentColor" stroke-width="1.75"/><path fill="none" stroke="currentColor" stroke-width="1.75" d="M15 15l5 5"/></svg>',
      gear:
        '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M12 8.25a3.75 3.75 0 1 0 0 7.5 3.75 3.75 0 0 0 0-7.5Zm9 3.75a8.2 8.2 0 0 1-.15 1.55l2.02 1.58-1.9 3.29-2.38-.98a8.27 8.27 0 0 1-1.34.78l-.36 2.53H9.71l-.36-2.53a8.27 8.27 0 0 1-1.34-.78l-2.38.98-1.9-3.29 2.02-1.58A8.2 8.2 0 0 1 3 12c0-.53.05-1.05.15-1.55L1.13 8.87l1.9-3.29 2.38.98c.4-.3.86-.56 1.34-.78l.36-2.53h4.58l.36 2.53c.48.22.94.48 1.34.78l2.38-.98 1.9 3.29-2.02 1.58c.1.5.15 1.02.15 1.55Z"/></svg>',
      info:
        '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.75"/><path fill="currentColor" d="M11 10h2v7h-2v-7Zm0-3h2v2h-2V7Z"/></svg>',
      clock:
        '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.75"/><path fill="none" stroke="currentColor" stroke-width="1.75" d="M12 7v5l3 2"/></svg>',
      copy:
        '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><rect x="8" y="8" width="11" height="11" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.75"/><path fill="none" stroke="currentColor" stroke-width="1.75" d="M6 16H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    };
    return icons[name] || '';
  }

  function cardHeader(icon, title, iconTone) {
    return (
      '<div class="spectrum-env-card__header">' +
      '<span class="spectrum-env-card__icon spectrum-env-card__icon--' +
      esc(iconTone || icon) +
      '">' +
      spectrumIcon(icon) +
      '</span>' +
      '<h3 class="spectrum-env-card__title">' +
      esc(title) +
      '</h3></div>'
    );
  }

  function legacyHiddenToggles(prefix, defaultBc) {
    var miralSel = defaultBc === 'miral' ? ' selected' : '';
    var genericSel = defaultBc === 'generic' ? ' selected' : '';
    var armySel = defaultBc === 'army' ? ' selected' : '';
    return (
      '<div class="site-clone-bc-env-strip__legacy-inject-toggles" aria-hidden="true">' +
      '<div class="form-row aep-demo-web-push-row" role="group" aria-label="Web push">' +
      '<label class="aep-demo-web-push-label"><input type="checkbox" id="' +
      esc(prefix) +
      'WebPushOnInjectToggle"><span>Register web push when injecting Tags</span></label></div>' +
      '<div class="aep-demo-web-push-retry"><button type="button" id="' +
      esc(prefix) +
      'WebPushRetryBtn" class="btn-lookup spectrum-btn spectrum-btn--quiet">Register web push now</button></div>' +
      '<div class="form-row aep-bc-toggle-row" role="group" aria-label="Brand Concierge">' +
      '<label class="aep-demo-web-push-label"><input type="checkbox" id="' +
      esc(prefix) +
      'BcOnInjectToggle"><span>Enable Brand Concierge when injecting Tags</span></label>' +
      '<select id="' +
      esc(prefix) +
      'BcStyleSelect" class="aep-bc-style-select" aria-label="Brand Concierge style">' +
      '<option value="miral"' +
      miralSel +
      '>Miral</option><option value="generic"' +
      genericSel +
      '>Generic (DemoEfficiency)</option><option value="army"' +
      armySel +
      '>Army Recruitment</option></select></div></div>'
    );
  }

  function siteCloneSpectrumFullMarkup(config) {
    var c = config || {};
    var prefix = String(c.prefix || '').trim();
    if (!prefix) return '';
    var injectId = prefix + 'InjectSdkBtn';
    var summaryClass =
      esc(prefix) +
      '-sdk-summary mod-sdk-summary mod-sdk-summary--below-env-grid spectrum-env-sdk-summary' +
      (c.summaryExtraClass ? ' ' + esc(c.summaryExtraClass) : '');
    var title = c.title || capPrefix(prefix) + ' (web)';
    var subtitle = c.subtitle || 'Active Configuration';
    var prefsAttrs = 'data-demo-env-strip-mount="site-clone-bc-prefs" id="siteCloneBcPrefsMount"';
    if (c.includeBottomDock) prefsAttrs += ' data-demo-env-strip-bc-bottom="1"';
    if (c.includeDecisioning) prefsAttrs += ' data-demo-env-strip-decisioning="1"';

    var footerParts = [];
    if (c.selectedScriptId) {
      footerParts.push(
        '<div class="spectrum-env-selected-script ' +
          esc(c.scriptPreviewClass || 'mod-demo-script-preview') +
          '"><span class="spectrum-env-selected-script__label">Selected script:</span> <code id="' +
          esc(c.selectedScriptId) +
          '">None</code></div>',
      );
    }
    if (c.messageId) {
      footerParts.push(
        '<p id="' +
          esc(c.messageId) +
          '" class="' +
          esc(c.messageClass || 'mod-demo-message') +
          ' spectrum-env-inline-message" role="status" aria-live="polite" hidden></p>',
      );
    }
    if (c.disclaimerHtml) {
      footerParts.push(
        '<div class="spectrum-env-info-bar spectrum-env-info-bar--muted"><span class="spectrum-env-info-bar__icon">' +
          spectrumIcon('info') +
          '</span><div class="spectrum-env-info-bar__text mod-demo-disclaimer">' +
          c.disclaimerHtml +
          '</div></div>',
      );
    }

    return (
      '<div class="aep-demo-env-bar aep-demo-env-bar--spectrum">' +
      '<header class="spectrum-env-status-bar" aria-label="Configuration status">' +
      '<div class="spectrum-env-status-bar__brand">' +
      '<span class="spectrum-env-status-bar__logo">' +
      spectrumIcon('adobe') +
      '</span>' +
      '<div class="spectrum-env-status-bar__titles">' +
      '<strong class="spectrum-env-status-bar__title">' +
      esc(title) +
      '</strong>' +
      '<span class="spectrum-env-status-bar__subtitle">' +
      esc(subtitle) +
      '</span></div></div>' +
      '<div class="spectrum-env-status-bar__stats">' +
      '<div class="spectrum-env-stat spectrum-env-stat--sandbox"><span class="spectrum-env-stat__label">Sandbox</span><span class="spectrum-env-pill spectrum-env-pill--blue lab-env-sandbox-chip" id="aepSpectrumSandboxPill">—</span></div>' +
      '<div class="spectrum-env-stat"><span class="spectrum-env-stat__label">Environment</span><span class="spectrum-env-pill spectrum-env-pill--blue" id="aepSpectrumEnvPill">Development</span></div>' +
      '<div class="spectrum-env-stat"><span class="spectrum-env-stat__label">Property</span><span class="spectrum-env-stat__value"><span class="spectrum-env-dot spectrum-env-dot--green" id="aepSpectrumPropertyDot"></span><span id="aepSpectrumPropertyStatus">Active</span></span></div>' +
      '<div class="spectrum-env-stat"><span class="spectrum-env-stat__label">SDK Status</span><span class="spectrum-env-stat__value"><span class="spectrum-env-dot spectrum-env-dot--green" id="aepSpectrumSdkDot"></span><span id="aepSpectrumSdkStatus">Connected</span></span></div>' +
      '<div class="spectrum-env-stat"><span class="spectrum-env-stat__label">Scripts Loaded</span><button type="button" class="spectrum-env-link-btn" id="aepSpectrumScriptsCount">None</button></div>' +
      '</div>' +
      '<div class="spectrum-env-status-bar__updated"><span class="spectrum-env-status-bar__clock">' +
      spectrumIcon('clock') +
      '</span><span class="spectrum-env-stat__label">Last Updated</span><span id="aepSpectrumLastUpdated">—</span></div>' +
      '<button type="button" class="spectrum-env-icon-btn lab-env-pin-btn" id="aepLabEnvPinBtn" aria-label="Pin environment bar open" aria-pressed="false" title="Pin open">' +
      '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M14 4v4.5l4.2 4.2-1.4 1.4L12.5 10V16h-1v-6L7.2 14.1 5.8 12.7 10 8.5V4h4Z"/></svg></button>' +
      '</header>' +
      '<section class="aep-demo-env-section spectrum-env-section" id="aepDemoEnvSection" aria-label="AEP environment">' +
      '<div class="aep-demo-env-editor" id="aepDemoEnvEditor">' +
      '<div id="aepDemoEnvConfigGrid" class="aep-demo-env-collapsible">' +
      '<div class="' +
      esc(prefix) +
      '-sdk-config-fields mod-sdk-config-fields mod-demo-tags-block site-clone-bc-env-strip spectrum-env-fields-root">' +
      '<div class="spectrum-env-cards spectrum-env-cards--duo">' +
      '<article class="spectrum-env-card spectrum-env-card--environment">' +
      cardHeader('globe', 'Environment', 'blue') +
      '<div class="spectrum-env-card__body spectrum-env-card__body--fields">' +
      '<div class="form-row spectrum-env-field"><label for="sandboxSelect">Sandbox</label><select id="sandboxSelect" class="sandbox-select spectrum-env-input" aria-label="Select AEP sandbox"><option value="">Loading sandboxes…</option></select></div>' +
      '<div id="' +
      esc(prefix) +
      'SdkConfigFields" class="spectrum-env-collapsible-fields">' +
      '<div class="spectrum-env-collapsible-fields__grid">' +
      '<div class="form-row spectrum-env-field"><label for="' +
      esc(prefix) +
      'TagsProperty">Tags property</label><input type="text" id="' +
      esc(prefix) +
      'TagsProperty" class="spectrum-env-input" aria-label="Tags property" placeholder="Select property" list="' +
      esc(prefix) +
      'TagsPropertyList" autocomplete="off" spellcheck="false"><datalist id="' +
      esc(prefix) +
      'TagsPropertyList"></datalist></div>' +
      '<div class="form-row spectrum-env-field"><label for="' +
      esc(prefix) +
      'TagsEnvironment">Tags environment</label><select id="' +
      esc(prefix) +
      'TagsEnvironment" class="spectrum-env-input" aria-label="Tags environment"></select></div>' +
      '<div class="spectrum-env-card__actions"><button type="button" id="' +
      esc(injectId) +
      '" class="btn-lookup spectrum-btn spectrum-btn--primary"><span class="spectrum-btn__icon">' +
      spectrumIcon('send') +
      '</span>Inject Selected Script</button></div></div></div></div></article>' +
      '<article class="spectrum-env-card spectrum-env-card--bc">' +
      cardHeader('palette', 'Brand Concierge', 'purple') +
      '<div class="spectrum-env-card__body">' +
      '<div class="form-row spectrum-env-field spectrum-env-field--full"><label for="siteCloneBcStyleConfigUrl">Style configuration</label><select id="siteCloneBcStyleConfigUrl" class="site-clone-bc-style-url-select site-clone-bc-style-url-input spectrum-env-input" aria-label="Brand Concierge style configuration script"></select></div>' +
      '<div class="spectrum-env-bc-pills" id="aepSpectrumBcPills" aria-live="polite">' +
      '<span class="spectrum-env-badge spectrum-env-badge--blue" id="aepSpectrumBcPillScripts"><span class="spectrum-env-badge__icon">' +
      spectrumIcon('info') +
      '</span>Scripts</span>' +
      '<span class="spectrum-env-badge spectrum-env-badge--purple" id="aepSpectrumBcPillModal">Modal</span>' +
      '<span class="spectrum-env-badge spectrum-env-badge--green" id="aepSpectrumBcPillInjected">Injected</span>' +
      '<span class="spectrum-env-badge spectrum-env-badge--orange" id="aepSpectrumBcPillEnv">Development</span></div>' +
      '<p id="siteCloneBcStyleConfigResolved" class="site-clone-bc-style-url-hint spectrum-env-card__hint" aria-live="polite"></p></div></article></div>' +
      '<article class="spectrum-env-card spectrum-env-card--target">' +
      cardHeader('adobe', 'Adobe Target', 'red') +
      '<div class="spectrum-env-card__body spectrum-env-card__body--target">' +
      '<div class="spectrum-env-target-grid">' +
      '<div class="form-row spectrum-env-field"><label for="siteCloneBcDatastreamId">Datastream UUID</label><input type="text" id="siteCloneBcDatastreamId" class="site-clone-bc-datastream-input spectrum-env-input" aria-label="Lab datastream override UUID" placeholder="Target-enabled datastream UUID" list="siteCloneBcDatastreamList" autocomplete="off" spellcheck="false"><datalist id="siteCloneBcDatastreamList"></datalist><p id="siteCloneBcDatastreamHint" class="site-clone-bc-style-url-hint spectrum-env-field__hint" aria-live="polite">Used for lab sendEvent / Target (edgeConfigOverrides).</p></div>' +
      '<div class="form-row spectrum-env-field"><label for="generatorTarget">Event destination</label><select id="generatorTarget" class="spectrum-env-input" aria-label="Edge or DCS streaming target"></select></div>' +
      '<div class="spectrum-env-sdk-panel"><span class="spectrum-env-field__label">SDK Status</span><span class="spectrum-env-badge spectrum-env-badge--green spectrum-env-badge--lg" id="aepSpectrumTargetSdkBadge">SDK Connected</span><p class="spectrum-env-sdk-panel__meta" id="aepSpectrumTargetSdkMeta">Destination: Edge · Environment: Development</p></div></div>' +
      '<div id="' +
      esc(prefix) +
      'SdkConfigSummary" class="' +
      summaryClass +
      '" hidden><div class="spectrum-env-info-bar"><span class="spectrum-env-info-bar__icon">' +
      spectrumIcon('info') +
      '</span><span id="' +
      esc(prefix) +
      'SdkConfigSummaryText" class="spectrum-env-info-bar__text"></span><button type="button" id="' +
      esc(c.changeSdkBtnId || prefix + 'ChangeSdkConfigBtn') +
      '" class="btn-lookup spectrum-btn spectrum-btn--secondary"><span class="spectrum-btn__icon">' +
      spectrumIcon('gear') +
      '</span>Change SDK Config</button></div></div></div></article>' +
      legacyHiddenToggles(prefix, c.defaultBcStyle || 'miral') +
      '<div class="form-row mod-demo-tags-company-row" hidden><label for="' +
      esc(prefix) +
      'TagsCompany">Tags company</label><select id="' +
      esc(prefix) +
      'TagsCompany" aria-label="Tags company"></select></div></div></div>' +
      '<div class="aep-demo-env-compact spectrum-env-compact" id="aepDemoEnvCompact" hidden><span class="aep-demo-env-compact-text" id="aepDemoEnvCompactText"></span><button type="button" id="aepDemoEnvExpandBtn" class="btn-lookup spectrum-btn spectrum-btn--secondary aep-demo-env-expand-btn">Change environment</button></div></div></section>' +
      '<section class="aep-demo-profile-section spectrum-env-card spectrum-env-card--profile" id="aepDemoProfileSection" aria-label="Profile lookup">' +
      cardHeader('profile', 'Profile Lookup', 'blue') +
      '<div class="spectrum-env-card__body spectrum-env-profile-grid">' +
      '<div class="spectrum-env-profile-main">' +
      '<div class="form-row spectrum-env-field"><label for="' +
      esc(c.nsSelectId || prefix + 'Ns') +
      '">Namespace</label><select id="' +
      esc(c.nsSelectId || prefix + 'Ns') +
      '" class="sandbox-select spectrum-env-input" aria-label="Identity namespace"><option value="email">Email</option><option value="ecid">ECID</option><option value="crmId">CRM ID</option><option value="loyaltyId">Loyalty ID</option><option value="phone">Phone</option></select></div>' +
      '<div class="form-row spectrum-env-field spectrum-env-field--grow"><label for="customerEmail">Identifier value</label><input type="text" id="customerEmail" class="spectrum-env-input" placeholder="Enter identifier" autocomplete="off" spellcheck="false"></div>' +
      '<button type="button" id="queryProfileBtn" class="btn-lookup spectrum-btn spectrum-btn--primary spectrum-env-profile-lookup"><span class="spectrum-btn__icon">' +
      spectrumIcon('search') +
      '</span>' +
      esc(c.profileBtnLabel || 'Look up profile') +
      '</button>' +
      '<div class="spectrum-env-ecid"><span class="spectrum-env-ecid__label">ECID:</span><strong id="infoEcid" class="spectrum-env-ecid__value">—</strong><button type="button" class="spectrum-env-icon-btn" id="aepSpectrumEcidCopy" aria-label="Copy ECID">' +
      spectrumIcon('copy') +
      '</button></div></div>' +
      '<div class="spectrum-env-profile-prefs"><div class="spectrum-env-display-mode"><span class="spectrum-env-field__label">Display mode</span><div ' +
      prefsAttrs +
      '></div></div></div></div>' +
      footerParts.join('') +
      '</section></div>'
    );
  }

  function capPrefix(prefix) {
    var p = String(prefix || '').trim();
    if (!p) return '';
    return p.charAt(0).toUpperCase() + p.slice(1);
  }

  function mountSpectrumShell(host, shellCfg, deps) {
    if (!host || !shellCfg) return { mounted: false, reason: 'missing-host-or-config' };
    host.classList.add('aep-demo-id-inner', 'aep-demo-id-inner--spectrum');
    host.innerHTML = siteCloneSpectrumFullMarkup(shellCfg);
    host.setAttribute(MOUNTED_ATTR, '1');

    var fields = document.getElementById(shellCfg.prefix + 'SdkConfigFields');
    if (fields) fields.setAttribute(MOUNTED_ATTR, '1');

    if (deps && typeof deps.mountSiteCloneProfileBcPrefs === 'function') {
      deps.mountSiteCloneProfileBcPrefs({
        mountId: 'siteCloneBcPrefsMount',
        includeBottomDock: shellCfg.includeBottomDock,
        includeDecisioning: shellCfg.includeDecisioning,
      });
    }

    if (global.DemoEnvBarSpectrumSync && typeof global.DemoEnvBarSpectrumSync.init === 'function') {
      global.DemoEnvBarSpectrumSync.init({ prefix: shellCfg.prefix, selectedScriptId: shellCfg.selectedScriptId });
    }

    return { mounted: true };
  }

  global.DemoEnvStripSpectrum = {
    siteCloneSpectrumFullMarkup: siteCloneSpectrumFullMarkup,
    mountSpectrumShell: mountSpectrumShell,
  };
})(typeof window !== 'undefined' ? window : globalThis);
