/**
 * Shared Profile Viewer modal — single mount point for demo websites.
 * Markup lives here; rendering and API calls remain in aep-profile-drawer.js (DemoProfileDrawer).
 *
 * @see docs/profile-viewer-modal-migration-audit.md
 * @see CONTRIBUTING.md — Shared Profile Viewer modal
 */
(function attachProfileViewerModal(global) {
  'use strict';

  var MOUNT_ATTR = 'data-aep-profile-viewer-modal-mount';
  var MOUNTED_ATTR = 'data-aep-profile-viewer-modal-mounted';
  var DEFAULT_MOUNT_ID = 'profileViewerModalMount';
  var _context = {};

  /** Canonical drawer shell (master reference: sky-demo.html, Jun 2026). */
  function drawerShellMarkup() {
    return (
      '<div class="aep-profile-drawer-hover-zone" id="profileHoverZone" aria-hidden="true"></div>' +
      '<aside class="aep-profile-drawer" id="profileDrawer" tabindex="-1" aria-label="Profile preview">' +
      '<div class="aep-profile-drawer-inner">' +
      '<section class="aep-profile-drawer-col aep-profile-drawer-block aep-profile-drawer-block--customer" aria-labelledby="profileDrawerCustomerHeading">' +
      '<h2 class="aep-profile-drawer-card-title aep-profile-drawer-panel-heading" id="profileDrawerCustomerHeading">CUSTOMER PROFILE</h2>' +
      '<div class="aep-profile-drawer-avatar-ring">' +
      '<img id="profileDrawerAvatar" class="aep-profile-drawer-avatar" src="https://contenthosting.web.app/AEPProfile/avatar-female.png" alt="Customer profile photo" width="124" height="124" loading="lazy" decoding="async" />' +
      '</div>' +
      '<div class="aep-profile-drawer-card-fields">' +
      '<p><strong>Name:</strong> <span id="profileDrawerName">No profile loaded</span></p>' +
      '<p><strong>Gender:</strong> <span id="profileDrawerGender">—</span></p>' +
      '<p><strong>Age:</strong> <span id="profileDrawerAge">—</span></p>' +
      '<p class="aep-profile-drawer-copyable-row"><strong>Email:</strong> <span class="aep-profile-drawer-copyable-value-wrap"><span id="profileDrawerEmail">—</span><button type="button" class="aep-profile-drawer-copy-btn" id="profileDrawerEmailCopy" hidden aria-label="Copy email to clipboard" title="Copy email"><svg class="aep-profile-drawer-copy-icon" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M5 2a1 1 0 0 0-1 1v1H3a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-1h1a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1H5zm0 2h6v8H5V4zm-2 2h1v6a2 2 0 0 0 2 2h6v1H3V6z"/></svg></button></span></p>' +
      '<p><strong>Phone:</strong> <span id="profileDrawerPhone">Unknown</span></p>' +
      '<p><strong>City:</strong> <span id="profileDrawerCity">—</span></p>' +
      '<p><strong>Customer Lifetime Value:</strong> <span id="profileDrawerLtv">$500</span></p>' +
      '</div>' +
      '<div class="aep-profile-drawer-card-consent" aria-label="Marketing channel consent">' +
      '<label><input type="checkbox" id="profileDrawerConsentEmail" disabled title="consents.marketing.email.val" /><span class="aep-profile-drawer-consent-label">Email</span></label>' +
      '<label><input type="checkbox" id="profileDrawerConsentSms" disabled title="consents.marketing.sms.val" /><span class="aep-profile-drawer-consent-label">SMS</span></label>' +
      '<label><input type="checkbox" id="profileDrawerConsentPush" disabled title="consents.marketing.push.val" /><span class="aep-profile-drawer-consent-label">Push</span></label>' +
      '</div>' +
      '</section>' +
      '<section class="aep-profile-drawer-col aep-profile-drawer-block aep-profile-drawer-block--identity" aria-labelledby="profileDrawerIdentityHeading">' +
      '<h2 class="aep-profile-drawer-panel-heading" id="profileDrawerIdentityHeading">IDENTITY</h2>' +
      '<div class="aep-profile-drawer-identity-fields">' +
      '<div class="aep-profile-drawer-identity-row aep-profile-drawer-identity-row--ecid"><strong>ECID</strong><span class="aep-profile-drawer-copyable-value-wrap"><span id="profileDrawerDesktopId">—</span><button type="button" class="aep-profile-drawer-copy-btn" id="profileDrawerEcidCopy" hidden aria-label="Copy ECID to clipboard" title="Copy ECID"><svg class="aep-profile-drawer-copy-icon" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M5 2a1 1 0 0 0-1 1v1H3a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-1h1a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1H5zm0 2h6v8H5V4zm-2 2h1v6a2 2 0 0 0 2 2h6v1H3V6z"/></svg></button></span></div>' +
      '<div class="aep-profile-drawer-identity-row"><strong title="_demoemea.scoring.core.propensityScore">Propensity score</strong><span id="profileDrawerPropensityScore">—</span></div>' +
      '<div class="aep-profile-drawer-identity-row"><strong title="_demoemea.scoring.churn.churnPrediction">Churn score</strong><span id="profileDrawerChurnScore">—</span></div>' +
      '<div class="aep-profile-drawer-identity-row"><strong title="_demoemea.scoring.npsScore">NPS score</strong><span id="profileDrawerNpsScore">—</span></div>' +
      '<div class="aep-profile-drawer-identity-row"><strong>Loyalty Status</strong><span id="profileDrawerLoyalty">Unknown</span></div>' +
      '</div>' +
      '</section>' +
      '<div class="aep-profile-drawer-col aep-profile-drawer-col--graph" aria-label="Identity graph">' +
      '<div class="aep-profile-drawer-graph-head">' +
      '<h2 class="aep-profile-drawer-panel-heading">IDENTITY GRAPH</h2>' +
      '<div class="aep-profile-drawer-graph-zoom" role="group" aria-label="Zoom">' +
      '<button type="button" id="identityGraphZoomIn" class="aep-profile-drawer-zoom-btn" aria-label="Zoom in">+</button>' +
      '<button type="button" id="identityGraphZoomOut" class="aep-profile-drawer-zoom-btn" aria-label="Zoom out">−</button>' +
      '</div>' +
      '</div>' +
      '<div class="aep-profile-drawer-graph-viewport" id="identityGraphViewport">' +
      '<svg class="aep-profile-drawer-graph-svg" id="identityGraphSvg" viewBox="0 0 320 320" preserveAspectRatio="xMidYMid meet" aria-hidden="true"></svg>' +
      '</div>' +
      '</div>' +
      '<div class="aep-profile-drawer-col-group" aria-label="Audiences and messages sent">' +
      '<div class="aep-profile-drawer-col aep-profile-drawer-col--stacked-panel">' +
      '<h2 class="aep-profile-drawer-panel-heading">AUDIENCES</h2>' +
      '<ul class="aep-profile-drawer-audiences" id="profileDrawerAudiences"><li>No audience membership loaded</li></ul>' +
      '</div>' +
      '<div class="aep-profile-drawer-col aep-profile-drawer-col--stacked-panel aep-profile-drawer-col--messages-sent" aria-labelledby="profileDrawerMessageSentHeading">' +
      '<div class="aep-profile-drawer-message-sent-heading-row">' +
      '<h2 class="aep-profile-drawer-panel-heading" id="profileDrawerMessageSentHeading">MESSAGES SENT</h2>' +
      '<p class="aep-profile-drawer-email-sends-subheading">(last 24 hours)</p>' +
      '</div>' +
      '<div class="aep-profile-drawer-email-sends-body">' +
      '<p class="aep-profile-drawer-email-sends-count-row" aria-live="polite">' +
      '<span class="aep-profile-drawer-email-sends-count" id="profileDrawerMessageSentValue">—</span>' +
      '<span class="aep-profile-drawer-email-sends-unit" id="profileDrawerMessageSentUnit"></span>' +
      '</p>' +
      '<p class="aep-profile-drawer-email-sends-count-row aep-profile-drawer-push-sends-row" id="profileDrawerPushSendsRow" hidden aria-live="polite">' +
      '<span class="aep-profile-drawer-email-sends-count" id="profileDrawerPushSentValue"></span>' +
      '<span class="aep-profile-drawer-email-sends-unit" id="profileDrawerPushSentUnit"></span>' +
      '</p>' +
      '</div>' +
      '</div>' +
      '</div>' +
      '<div class="aep-profile-drawer-col">' +
      '<h2 class="aep-profile-drawer-panel-heading">LAST 5 EVENTS</h2>' +
      '<div class="aep-profile-drawer-events" id="profileDrawerEvents"><p>No events found for this profile</p></div>' +
      '</div>' +
      '</div>' +
      '</aside>'
    );
  }

  function resolveMountHost(config) {
    var mountId = (config && config.mountPointId) || _context.mountPointId || DEFAULT_MOUNT_ID;
    var host = document.getElementById(mountId);
    if (host) return host;
    host = document.createElement('div');
    host.id = mountId;
    host.setAttribute(MOUNT_ATTR, '1');
    host.className = 'aep-profile-viewer-modal-mount-fallback';
    document.body.appendChild(host);
    return host;
  }

  /**
   * Inject shared drawer markup once. Safe to call repeatedly.
   * @param {object} [config] — mountPointId, profileOpenClass (stored for open/close)
   * @returns {{ mounted: boolean, alreadyPresent?: boolean }}
   */
  function mount(config) {
    if (config) setContext(config);
    if (document.getElementById('profileDrawer')) {
      return { mounted: true, alreadyPresent: true };
    }
    var host = resolveMountHost(config);
    host.innerHTML = drawerShellMarkup();
    host.setAttribute(MOUNTED_ATTR, '1');
    return { mounted: true };
  }

  /** Update per-demo context (profileOpenClass, mountPointId, hooks). */
  function setContext(config) {
    if (!config || typeof config !== 'object') return;
    _context = Object.assign({}, _context, config);
  }

  function getOpenClass() {
    return (_context && _context.profileOpenClass) || 'aep-profile-drawer-open';
  }

  /** Open the hover drawer (body class toggled by aep-profile-drawer hover logic). */
  function open() {
    document.body.classList.add(getOpenClass());
  }

  /** Close the hover drawer. */
  function close() {
    document.body.classList.remove(getOpenClass());
  }

  /** Push normalized profile data into the drawer UI. */
  function renderProfile(data) {
    var drawer = global.DemoProfileDrawer || global.AepProfileDrawer;
    if (drawer && typeof drawer.updateProfileDrawer === 'function') {
      drawer.updateProfileDrawer(data);
      return;
    }
    if (typeof global.console !== 'undefined' && typeof global.console.warn === 'function') {
      global.console.warn('[ProfileViewerModal] DemoProfileDrawer.updateProfileDrawer not available yet');
    }
  }

  function autoMountFromDom() {
    var preset = document.getElementById(DEFAULT_MOUNT_ID);
    if (preset && !document.getElementById('profileDrawer')) {
      mount();
    }
  }

  var api = {
    mount: mount,
    open: open,
    close: close,
    setContext: setContext,
    renderProfile: renderProfile,
    getContext: function () {
      return Object.assign({}, _context);
    },
  };

  global.ProfileViewerModal = api;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoMountFromDom);
  } else {
    autoMountFromDom();
  }
})(typeof window !== 'undefined' ? window : globalThis);
