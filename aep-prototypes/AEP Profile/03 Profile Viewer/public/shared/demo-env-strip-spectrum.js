/**
 * Adobe Spectrum layout variant for the lab env bar (Sky pilot).
 * Activated via data-demo-env-strip-variant="spectrum" on the site-clone-shell mount.
 *
 * @see shared/demo-env-bar-spectrum.css
 */
(function attachDemoEnvStripSpectrum(global) {
  'use strict';

  var MOUNTED_ATTR = 'data-demo-env-strip-mounted';
  var MOUNTED_EVENT = 'aep-demo-env-strip-mounted';

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

  function datastreamUuidTooltipMarkup() {
    return (
      '<span class="spectrum-env-field-tooltip">' +
      '<button type="button" class="spectrum-env-field-tooltip__trigger" aria-label="Lab datastream UUID — what it is and how to find one">' +
      spectrumIcon('info') +
      '</button>' +
      '<div class="spectrum-env-field-tooltip__panel" role="tooltip">' +
      '<p class="spectrum-env-field-tooltip__lead"><strong>Lab override only.</strong> When this page sends events through the browser Web SDK (Alloy) — for example the anonymous page view right after you inject Tags, or Brand Concierge / Target if enabled — this UUID tells Edge which datastream to use (<code>edgeConfigOverrides</code>). It does <strong>not</strong> change the datastream configured inside your Launch property.</p>' +
      '<p class="spectrum-env-field-tooltip__lead">Pick a datastream from the list, or choose <strong>Enter UUID…</strong> and paste one wired to your sandbox. Align it with the sandbox selected at the top of the env bar so profile lookup and events land in the right place.</p>' +
      '<p class="spectrum-env-field-tooltip__lead"><strong>Not the same as Event destination.</strong> The dropdown below routes <em>server-side</em> lab events (journey postMessage events, profile lookup <code>application.login</code>, and the drawer timeline mirror) through <code>POST /api/events/generator</code>. Both may need to point at your sandbox for a clean demo, but they are separate pipes.</p>' +
      '<p class="spectrum-env-field-tooltip__lead"><strong>Enable services on the datastream.</strong> In DSN, the datastream must include the services your demo uses — at minimum <strong>Adobe Experience Platform</strong> so <code>web.interaction</code> and profile timeline events land. Turn on <strong>Brand Concierge</strong>, <strong>Adobe Journey Optimizer</strong>, and/or <strong>Adobe Target / Personalization</strong> on that datastream when you use those lab features; otherwise Alloy may send but BC, decisioning, or drawer events will not appear.</p>' +
      '<p class="spectrum-env-field-tooltip__lead">Datastreams are created outside this lab. Use one of the Demo Sandbox Network portals:</p>' +
      '<ul class="spectrum-env-field-tooltip__list">' +
      '<li><a href="https://livedemos.adobe.com/" target="_blank" rel="noopener noreferrer">https://livedemos.adobe.com/</a> — live-demos DSN</li>' +
      '<li><a href="https://dsn.adobe.com/" target="_blank" rel="noopener noreferrer">https://dsn.adobe.com/</a> — standard DSN</li>' +
      '</ul>' +
      '<p class="spectrum-env-field-tooltip__foot">Inside DSN, create (or pick) a datastream wired to your sandbox with the services above enabled. Copy its <strong>Datastream ID</strong> here. Copy the Launch <strong>embed-script URL</strong> from the Web SDK extension into the Tags section above.</p>' +
      '</div></span>'
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

  function channelToggleMarkup(c) {
    var webUrl = String((c && c.webUrl) || '').trim();
    var mobileUrl = String((c && c.mobileUrl) || '').trim();
    if (!webUrl || !mobileUrl) return '';
    var channel = String((c && c.channel) || 'web').trim().toLowerCase();
    var webActive = channel === 'web' ? ' is-active' : '';
    var mobileActive = channel === 'mobile' ? ' is-active' : '';
    var webCurrent = channel === 'web' ? ' aria-current="page"' : '';
    var mobileCurrent = channel === 'mobile' ? ' aria-current="page"' : '';
    return (
      '<nav class="mobile-demo-shell-channel-toggle lab-env-toolbar__channel-toggle" aria-label="Demo channel">' +
      '<a href="' +
      esc(webUrl) +
      '" class="mobile-demo-shell-channel-toggle__link' +
      webActive +
      '"' +
      webCurrent +
      '>Web</a>' +
      '<a href="' +
      esc(mobileUrl) +
      '" class="mobile-demo-shell-channel-toggle__link' +
      mobileActive +
      '"' +
      mobileCurrent +
      '>Mobile</a>' +
      '</nav>'
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
    var bcPrefsAttrs = 'data-demo-env-strip-mount="site-clone-bc-prefs" id="siteCloneBcPrefsMount"';
    if (c.includeBottomDock) bcPrefsAttrs += ' data-demo-env-strip-bc-bottom="1"';
    var decisioningSection =
      c.includeDecisioning !== false
        ? '<div class="spectrum-env-display-mode lab-env-decisioning-wrap"><span class="spectrum-env-field__label">Decisioning</span><div data-demo-env-strip-mount="site-clone-decisioning-prefs" id="siteCloneDecisioningPrefsMount"></div></div>'
        : '';

    var overlayFooterParts = [];
    if (c.selectedScriptId) {
      overlayFooterParts.push(
        '<div class="spectrum-env-selected-script ' +
          esc(c.scriptPreviewClass || 'mod-demo-script-preview') +
          '" data-env-overlay-footer-item><span class="spectrum-env-selected-script__label">Selected script:</span> <code id="' +
          esc(c.selectedScriptId) +
          '">None</code></div>',
      );
    }
    if (c.messageId) {
      overlayFooterParts.push(
        '<p id="' +
          esc(c.messageId) +
          '" class="' +
          esc(c.messageClass || 'mod-demo-message') +
          ' spectrum-env-inline-message" data-env-overlay-footer-item role="status" aria-live="polite" hidden></p>',
      );
    }
    if (c.disclaimerHtml) {
      overlayFooterParts.push(
        '<div class="spectrum-env-info-bar spectrum-env-info-bar--muted" data-env-overlay-footer-item><span class="spectrum-env-info-bar__icon">' +
          spectrumIcon('info') +
          '</span><div class="spectrum-env-info-bar__text mod-demo-disclaimer">' +
          c.disclaimerHtml +
          '</div></div>',
      );
    }

    var overlayFooter = overlayFooterParts.length
      ? '<div class="lab-env-overlay-footer" data-env-overlay-footer>' + overlayFooterParts.join('') + '</div>'
      : '';

    return (
      '<div class="aep-demo-env-bar aep-demo-env-bar--spectrum">' +
      '<header class="spectrum-env-status-bar lab-env-toolbar" aria-label="Configuration status">' +
      '<div class="spectrum-env-status-bar__brand lab-env-toolbar__brand">' +
      '<span class="spectrum-env-status-bar__logo">' +
      spectrumIcon('adobe') +
      '</span>' +
      '<div class="spectrum-env-status-bar__titles">' +
      '<strong class="spectrum-env-status-bar__title lab-env-toolbar__title">' +
      esc(title) +
      '</strong>' +
      '<span class="spectrum-env-status-bar__subtitle">' +
      esc(subtitle) +
      '</span></div>' +
      channelToggleMarkup(c) +
      '</div>' +
      '<span class="lab-env-toolbar-divider" aria-hidden="true"></span>' +
      '<div class="spectrum-env-status-bar__stats lab-env-toolbar__stats">' +
      '<div class="spectrum-env-stat spectrum-env-stat--sandbox"><span class="spectrum-env-stat__label">Sandbox</span><span class="spectrum-env-pill spectrum-env-pill--blue lab-env-sandbox-chip lab-env-chip" id="aepSpectrumSandboxPill" title="Sandbox">—</span></div>' +
      '<div class="spectrum-env-stat"><span class="spectrum-env-stat__label">Environment</span><span class="spectrum-env-pill spectrum-env-pill--blue lab-env-chip" id="aepSpectrumEnvPill" title="Tags environment">Development</span></div>' +
      '<div class="spectrum-env-stat"><span class="spectrum-env-stat__label">Property</span><span class="spectrum-env-stat__value lab-env-chip lab-env-chip--status lab-env-status-light lab-env-status-light--positive" id="aepSpectrumPropertyChip" title="Tags property"><span class="spectrum-env-status-light spectrum-env-status-light--positive" id="aepSpectrumPropertyDot" aria-hidden="true"></span><span id="aepSpectrumPropertyStatus">Active</span></span></div>' +
      '<div class="spectrum-env-stat"><span class="spectrum-env-stat__label">SDK Status</span><span class="spectrum-env-stat__value lab-env-chip lab-env-chip--status lab-env-status-light lab-env-status-light--positive" id="aepSpectrumSdkChip" title="SDK status"><span class="spectrum-env-status-light spectrum-env-status-light--positive" id="aepSpectrumSdkDot" aria-hidden="true"></span><span id="aepSpectrumSdkStatus">Connected</span></span></div>' +
      '<div class="spectrum-env-stat"><span class="spectrum-env-stat__label">Scripts Loaded</span><button type="button" class="spectrum-env-link-btn lab-env-chip" id="aepSpectrumScriptsCount" title="Selected Launch script">None</button></div>' +
      '</div>' +
      '<div class="lab-env-toolbar__actions">' +
      '<a class="lab-env-version-pill" id="aepLabEnvVersionPill" href="/version.json" target="_blank" rel="noopener noreferrer" title="Lab deploy version" aria-label="Lab deploy version">—</a>' +
      '<button type="button" class="spectrum-env-icon-btn lab-env-dock-toolbar-btn" id="aepLabEnvDockToolbarBtn" aria-label="Hide environment bar" title="Hide environment bar">' +
      '<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M10.00391,12.58887c-.88818,0-1.75293-.45996-2.22803-1.2832h0c-.70801-1.22754-.28613-2.80078.93994-3.50879.59326-.34375,1.28516-.43359,1.94922-.25684.6626.17773,1.21631.60352,1.55908,1.19727.34326.59375.43408,1.28613.25684,1.94824-.17773.66309-.60254,1.2168-1.19678,1.55957-.40332.2334-.84473.34375-1.28027.34375Z"/><path d="M6.90674,18.31836c-.33936,0-.68213-.08496-.99219-.26465l-.81982-.47266c-.89307-.51367-1.25-1.64941-.81104-2.58301l.58008-1.2334c-.26514-.36328-.48975-.75098-.67188-1.16113l-1.35693-.1123c-1.02881-.08496-1.83447-.95996-1.83447-1.99121l-.00098-.94629c0-1.0332.80518-1.90918,1.8335-1.99414l1.35449-.11426c.0918-.20898.19238-.40918.30176-.59961.10986-.19141.2334-.37891.36914-.56445l-.58057-1.22949c-.44092-.93262-.08643-2.06836.80713-2.58496l.82031-.47363c.89258-.5166,2.05371-.25879,2.64258.58984l.77734,1.11816c.44385-.0498.89209-.04785,1.34082,0l.77539-1.11914c.58887-.84961,1.75098-1.10938,2.64355-.59375l.81982.47266c.89404.51562,1.24951,1.65137.81055,2.58398l-.58008,1.23242c.26562.36426.49023.75195.67188,1.16113l1.35693.1123c1.02832.08496,1.83398.95996,1.83496,1.99121l.00049.94727c.00098,1.03125-.80371,1.90723-1.83203,1.99414l-1.35547.11426c-.09131.20898-.19189.4082-.30273.59961h0c-.10938.18945-.23242.37793-.36816.56348l.58057,1.22949c.44043.93164.08643,2.06738-.80664,2.58496l-.8208.47461c-.89355.51855-2.05371.25781-2.64258-.59082l-.77734-1.11816c-.4458.04883-.89404.04785-1.34082.00098l-.77637,1.12012c-.38379.55371-1.01172.85645-1.65039.85645Z"/></svg></button>' +
      '<button type="button" class="spectrum-env-icon-btn lab-env-full-open-btn" id="aepLabEnvFullOpenBtn" hidden aria-label="Open environment settings" title="Environment settings">' +
      '<svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M10.00391,12.58887c-.88818,0-1.75293-.45996-2.22803-1.2832h0c-.70801-1.22754-.28613-2.80078.93994-3.50879.59326-.34375,1.28516-.43359,1.94922-.25684.6626.17773,1.21631.60352,1.55908,1.19727.34326.59375.43408,1.28613.25684,1.94824-.17773.66309-.60254,1.2168-1.19678,1.55957-.40332.2334-.84473.34375-1.28027.34375Z"/><path d="M6.90674,18.31836c-.33936,0-.68213-.08496-.99219-.26465l-.81982-.47266c-.89307-.51367-1.25-1.64941-.81104-2.58301l.58008-1.2334c-.26514-.36328-.48975-.75098-.67188-1.16113l-1.35693-.1123c-1.02881-.08496-1.83447-.95996-1.83447-1.99121l-.00098-.94629c0-1.0332.80518-1.90918,1.8335-1.99414l1.35449-.11426c.0918-.20898.19238-.40918.30176-.59961.10986-.19141.2334-.37891.36914-.56445l-.58057-1.22949c-.44092-.93262-.08643-2.06836.80713-2.58496l.82031-.47363c.89258-.5166,2.05371-.25879,2.64258.58984l.77734,1.11816c.44385-.0498.89209-.04785,1.34082,0l.77539-1.11914c.58887-.84961,1.75098-1.10938,2.64355-.59375l.81982.47266c.89404.51562,1.24951,1.65137.81055,2.58398l-.58008,1.23242c.26562.36426.49023.75195.67188,1.16113l1.35693.1123c1.02832.08496,1.83398.95996,1.83496,1.99121l.00049.94727c.00098,1.03125-.80371,1.90723-1.83203,1.99414l-1.35547.11426c-.09131.20898-.19189.4082-.30273.59961h0c-.10938.18945-.23242.37793-.36816.56348l.58057,1.22949c.44043.93164.08643,2.06738-.80664,2.58496l-.8208.47461c-.89355.51855-2.05371.25781-2.64258-.59082l-.77734-1.11816c-.4458.04883-.89404.04785-1.34082.00098l-.77637,1.12012c-.38379.55371-1.01172.85645-1.65039.85645Z"/></svg></button>' +
      '<button type="button" class="spectrum-env-icon-btn lab-env-toggle-btn" id="aepLabEnvToggleBtn" aria-label="Show environment controls" aria-expanded="false" title="Expand environment panel">' +
      '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M6.7 9.3 12 14.6l5.3-5.3 1.4 1.4-6.7 6.7-6.7-6.7 1.4-1.4Z"/></svg></button>' +
      '<button type="button" class="spectrum-env-icon-btn lab-env-pin-btn" id="aepLabEnvPinBtn" aria-label="Pin environment panel open" aria-pressed="false" title="Pin environment panel open">' +
      '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M14 4v4.5l4.2 4.2-1.4 1.4L12.5 10V16h-1v-6L7.2 14.1 5.8 12.7 10 8.5V4h4Z"/></svg></button>' +
      '</div>' +
      '<div class="spectrum-env-status-bar__updated lab-env-overlay-only"><span class="spectrum-env-status-bar__clock">' +
      spectrumIcon('clock') +
      '</span><span class="spectrum-env-stat__label">Last Updated</span><span id="aepSpectrumLastUpdated">—</span></div>' +
      '</header>' +
      '<div class="lab-env-overlay-panel" id="aepLabEnvOverlayPanel" role="region" aria-label="Lab environment controls" hidden>' +
      '<section class="aep-demo-env-section spectrum-env-section" id="aepDemoEnvSection" aria-label="AEP environment">' +
      '<div class="aep-demo-env-editor" id="aepDemoEnvEditor">' +
      '<div id="aepDemoEnvConfigGrid" class="aep-demo-env-collapsible">' +
      '<div class="' +
      esc(prefix) +
      '-sdk-config-fields mod-sdk-config-fields mod-demo-tags-block site-clone-bc-env-strip spectrum-env-fields-root lab-env-col-stack">' +
      '<div class="spectrum-env-cards spectrum-env-cards--trio">' +
      '<article class="spectrum-env-card spectrum-env-card--environment">' +
      cardHeader('globe', 'Environment', 'blue') +
      '<div class="spectrum-env-card__body spectrum-env-card__body--fields">' +
      '<div class="form-group form-row spectrum-env-field spectrum-env-field--full"><label for="sandboxSelect">Sandbox</label><select id="sandboxSelect" class="sandbox-select spectrum-env-input" aria-label="Select AEP sandbox"><option value="">Loading sandboxes…</option></select></div>' +
      '<div id="' +
      esc(prefix) +
      'SdkConfigFields" class="spectrum-env-collapsible-fields">' +
      '<div class="spectrum-env-collapsible-fields__grid">' +
      '<div class="form-group form-row spectrum-env-field spectrum-env-field--full"><label for="' +
      esc(prefix) +
      'TagsProperty">Tags property</label><select id="' +
      esc(prefix) +
      'TagsProperty" class="spectrum-env-input" aria-label="Tags property"><option value="">Select property</option></select></div>' +
      '<div class="form-group form-row spectrum-env-field spectrum-env-field--full"><label for="' +
      esc(prefix) +
      'TagsEnvironment">Tags environment</label><select id="' +
      esc(prefix) +
      'TagsEnvironment" class="spectrum-env-input" aria-label="Tags environment"></select></div>' +
      '<div class="spectrum-env-card__actions"><button type="button" id="' +
      esc(injectId) +
      '" class="btn-lookup spectrum-btn spectrum-btn--primary"><span class="spectrum-btn__icon">' +
      spectrumIcon('send') +
      '</span>Inject Selected Script</button></div><p id="' +
      esc(prefix) +
      'TagsStatus" class="spectrum-env-tags-status spectrum-env-field__hint" aria-live="polite"></p></div></div></div></article>' +
      '<article class="spectrum-env-card spectrum-env-card--data-collection">' +
      cardHeader('adobe', 'Adobe Data Collection', 'red') +
      '<div class="spectrum-env-card__body spectrum-env-card__body--stacked">' +
      '<div class="form-group form-row spectrum-env-field spectrum-env-field--full spectrum-env-field--has-tooltip"><div class="spectrum-env-field-label-row"><label for="siteCloneBcDatastreamId">Datastream UUID</label>' +
      datastreamUuidTooltipMarkup() +
      '</div><select id="siteCloneBcDatastreamId" class="site-clone-bc-datastream-input site-clone-bc-datastream-select spectrum-env-input" aria-label="Lab datastream override UUID"><option value="">Select datastream</option></select><div id="siteCloneBcDatastreamUuidManualRow" class="site-clone-bc-datastream-manual-row" hidden><label for="siteCloneBcDatastreamUuidManual" class="spectrum-env-field__label site-clone-bc-datastream-manual-label">Or paste datastream UUID</label><input type="text" id="siteCloneBcDatastreamUuidManual" class="site-clone-bc-datastream-input site-clone-bc-datastream-manual-input spectrum-env-input" aria-label="Paste datastream UUID" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" autocomplete="off" spellcheck="false"><div class="site-clone-bc-datastream-manual-actions"><button type="button" id="siteCloneBcDatastreamUuidManualApply" class="btn-lookup spectrum-btn spectrum-btn--primary site-clone-bc-datastream-manual-apply">Apply UUID</button><button type="button" id="siteCloneBcDatastreamUuidManualCancel" class="btn-lookup spectrum-btn spectrum-btn--secondary site-clone-bc-datastream-manual-cancel">Cancel</button></div><p id="siteCloneBcDatastreamUuidManualError" class="site-clone-bc-datastream-manual-error site-clone-bc-style-url-hint spectrum-env-field__hint" aria-live="polite"></p></div><p id="siteCloneBcDatastreamHint" class="site-clone-bc-style-url-hint spectrum-env-field__hint spectrum-env-field__hint--muted" aria-live="polite">Used for lab sendEvent (edgeConfigOverrides).</p></div>' +
      '<div class="form-group form-row spectrum-env-field spectrum-env-field--full"><label for="generatorTarget">Event destination</label><select id="generatorTarget" class="spectrum-env-input" aria-label="Edge or DCS streaming target"></select></div>' +
      '<div class="spectrum-env-sdk-panel spectrum-env-sdk-panel--compact"><span class="spectrum-env-field__label">SDK status</span><span class="spectrum-env-badge spectrum-env-badge--green spectrum-env-badge--lg" id="aepSpectrumTargetSdkBadge">SDK Connected</span><p class="spectrum-env-sdk-panel__meta" id="aepSpectrumTargetSdkMeta">Destination: Edge · Environment: Development</p></div>' +
      '<div id="' +
      esc(prefix) +
      'SdkConfigSummary" class="' +
      summaryClass +
      '" hidden><div class="spectrum-env-info-bar spectrum-env-info-bar--card"><span class="spectrum-env-info-bar__icon">' +
      spectrumIcon('info') +
      '</span><span id="' +
      esc(prefix) +
      'SdkConfigSummaryText" class="spectrum-env-info-bar__text"></span><button type="button" id="' +
      esc(c.changeSdkBtnId || prefix + 'ChangeSdkConfigBtn') +
      '" class="btn-lookup spectrum-btn spectrum-btn--secondary"><span class="spectrum-btn__icon">' +
      spectrumIcon('gear') +
      '</span>Change SDK Config</button></div></div></div></article>' +
      '<article class="spectrum-env-card spectrum-env-card--bc lab-env-bc-panel">' +
      cardHeader('palette', 'Brand Concierge', 'purple') +
      '<div class="spectrum-env-card__body lab-env-bc-panel__body">' +
      '<div class="form-group form-row spectrum-env-field spectrum-env-field--full"><label for="siteCloneBcStyleConfigUrl">Style configuration</label><select id="siteCloneBcStyleConfigUrl" class="site-clone-bc-style-url-select site-clone-bc-style-url-input spectrum-env-input" aria-label="Brand Concierge style configuration script"></select></div>' +
      '<div class="spectrum-env-bc-pills" id="aepSpectrumBcPills" role="list" aria-label="Brand Concierge status" aria-live="polite">' +
      '<span class="spectrum-env-badge spectrum-env-badge--blue" id="aepSpectrumBcPillScripts" role="listitem"><span class="spectrum-env-badge__icon" aria-hidden="true">' +
      spectrumIcon('info') +
      '</span>Scripts</span>' +
      '<span class="spectrum-env-badge spectrum-env-badge--purple" id="aepSpectrumBcPillModal" role="listitem">Modal</span>' +
      '<span class="spectrum-env-badge spectrum-env-badge--green" id="aepSpectrumBcPillInjected" role="listitem">Injected</span>' +
      '<span class="spectrum-env-badge spectrum-env-badge--orange" id="aepSpectrumBcPillEnv" role="listitem">Development</span></div>' +
      '<p id="siteCloneBcStyleConfigResolved" class="site-clone-bc-style-url-hint spectrum-env-card__hint" aria-live="polite"></p>' +
      '<div class="spectrum-env-display-mode lab-env-bc-prefs-wrap"><span class="spectrum-env-field__label">Display mode</span><div ' +
      bcPrefsAttrs +
      '></div></div>' +
      decisioningSection +
      '</div></article></div>' +
      legacyHiddenToggles(prefix, c.defaultBcStyle || 'miral') +
      '<div class="form-row mod-demo-tags-company-row" hidden><label for="' +
      esc(prefix) +
      'TagsCompany">Tags company</label><select id="' +
      esc(prefix) +
      'TagsCompany" aria-label="Tags company"></select></div></div></div>' +
      '<div class="aep-demo-env-compact spectrum-env-compact" id="aepDemoEnvCompact" hidden><span class="aep-demo-env-compact-text" id="aepDemoEnvCompactText"></span><button type="button" id="aepDemoEnvExpandBtn" class="btn-lookup spectrum-btn spectrum-btn--secondary aep-demo-env-expand-btn">Change environment</button></div></div></section>' +
      '<section class="aep-demo-profile-section spectrum-env-card spectrum-env-card--profile lab-env-overlay-profile" id="aepDemoProfileSection" aria-label="Profile lookup">' +
      cardHeader('profile', 'Profile Lookup', 'blue') +
      '<div class="spectrum-env-card__body spectrum-env-profile-grid">' +
      '<div class="spectrum-env-profile-main">' +
      '<div class="form-group form-row spectrum-env-field"><label for="' +
      esc(c.nsSelectId || prefix + 'Ns') +
      '">Namespace</label><select id="' +
      esc(c.nsSelectId || prefix + 'Ns') +
      '" class="sandbox-select spectrum-env-input" aria-label="Identity namespace"><option value="email">Email</option><option value="ecid">ECID</option><option value="crmId">CRM ID</option><option value="loyaltyId">Loyalty ID</option><option value="phone">Phone</option></select></div>' +
      '<div class="form-group form-row spectrum-env-field spectrum-env-field--grow"><label for="customerEmail">Identifier value</label><input type="text" id="customerEmail" class="spectrum-env-input" placeholder="Enter identifier" autocomplete="off" spellcheck="false"></div>' +
      '<button type="button" id="queryProfileBtn" class="btn-lookup spectrum-btn spectrum-btn--primary spectrum-env-profile-lookup"><span class="spectrum-btn__icon">' +
      spectrumIcon('search') +
      '</span>' +
      esc(c.profileBtnLabel || 'Look up profile') +
      '</button>' +
      '<div class="spectrum-env-ecid"><span class="spectrum-env-ecid__label">ECID:</span><strong id="infoEcid" class="spectrum-env-ecid__value">—</strong><button type="button" class="spectrum-env-icon-btn" id="aepSpectrumEcidCopy" aria-label="Copy ECID">' +
      spectrumIcon('copy') +
      '</button></div>' +
      (global.DemoEnvStrip && typeof global.DemoEnvStrip.labDebugProfileMarkup === 'function'
        ? global.DemoEnvStrip.labDebugProfileMarkup()
        : '') +
      '</div></div></section>' +
      overlayFooter +
      '</div></div>'
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

    var topAnchor = host.closest('[class*="-demo-top-anchor"]');
    if (topAnchor && host.querySelector('.lab-env-overlay-panel')) {
      topAnchor.classList.add('lab-env-spectrum-overlay');
      try {
        if (global.sessionStorage.getItem('aepLabEnvBarDocked') === '1') {
          topAnchor.classList.add('lab-env-top-anchor--docked-hidden');
        }
      } catch (_dockEarly) {
        /* noop */
      }
    }

    var fields = document.getElementById(shellCfg.prefix + 'SdkConfigFields');
    if (fields) fields.setAttribute(MOUNTED_ATTR, '1');

    if (deps && typeof deps.mountSiteCloneProfileBcPrefs === 'function') {
      deps.mountSiteCloneProfileBcPrefs({
        mountId: 'siteCloneBcPrefsMount',
        includeBottomDock: shellCfg.includeBottomDock,
        includeDecisioning: false,
      });
    }
    if (
      shellCfg.includeDecisioning !== false &&
      deps &&
      typeof deps.mountSiteCloneDecisioningPrefs === 'function'
    ) {
      deps.mountSiteCloneDecisioningPrefs({ mountId: 'siteCloneDecisioningPrefsMount' });
    }

    if (global.DemoEnvBarSpectrumSync && typeof global.DemoEnvBarSpectrumSync.init === 'function') {
      global.DemoEnvBarSpectrumSync.init({ prefix: shellCfg.prefix, selectedScriptId: shellCfg.selectedScriptId });
    }

    if (fields) {
      try {
        global.dispatchEvent(
          new CustomEvent(MOUNTED_EVENT, {
            detail: { prefix: shellCfg.prefix, mountId: shellCfg.prefix + 'SdkConfigFields' },
          }),
        );
      } catch (_e) {
        /* noop */
      }
    }

    return { mounted: true };
  }

  global.DemoEnvStripSpectrum = {
    siteCloneSpectrumFullMarkup: siteCloneSpectrumFullMarkup,
    mountSpectrumShell: mountSpectrumShell,
  };
})(typeof window !== 'undefined' ? window : globalThis);
