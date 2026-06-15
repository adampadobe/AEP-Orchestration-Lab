/**
 * Ensures site-clone BC page chrome (frame host, modal FAB, modal shell) exists.
 * Safe to call multiple times; used by shared/env-bar.js when features.bc is enabled.
 */
(function (global) {
  'use strict';

  var FAB_IMG = 'https://contenthosting.web.app/logos/adobe_icon_146235.webp';

  function insertBeforeSiteFrame(node) {
    var frame =
      document.querySelector('iframe.mod-demo-site-frame') ||
      document.querySelector('iframe[class*="-demo-site-frame"]') ||
      document.querySelector('iframe[id$="SiteFrame"]') ||
      document.querySelector('iframe[id$="Frame"]');
    if (frame && frame.parentNode) {
      frame.parentNode.insertBefore(node, frame);
      return;
    }
    document.body.insertBefore(node, document.body.firstChild);
  }

  function ensureFrameHost() {
    if (document.getElementById('siteCloneBcFrameHost')) return;
    var host = document.createElement('div');
    host.id = 'siteCloneBcFrameHost';
    host.className = 'site-clone-bc-frame-host';
    host.hidden = true;
    host.innerHTML =
      '<div id="siteCloneBcFrameMount" class="site-clone-bc-frame-mount"></div>';
    insertBeforeSiteFrame(host);
  }

  function ensureModalFab() {
    if (document.getElementById('siteCloneBcFab')) return;
    var fab = document.createElement('button');
    fab.type = 'button';
    fab.id = 'siteCloneBcFab';
    fab.className = 'aep-bc-reopen-btn site-clone-bc-fab';
    fab.hidden = true;
    fab.setAttribute('aria-label', 'Open Brand Concierge');
    fab.setAttribute('aria-expanded', 'false');
    fab.setAttribute('aria-controls', 'aepBcModal');
    fab.innerHTML =
      '<img src="' +
      FAB_IMG +
      '" alt="" width="48" height="48" decoding="async" />';
    document.body.appendChild(fab);
  }

  function ensureModalShell() {
    if (document.getElementById('aepBcModal')) return;
    var modal = document.createElement('div');
    modal.id = 'aepBcModal';
    modal.className = 'aep-bc-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'aepBcModalTitle');
    modal.hidden = true;
    modal.innerHTML =
      '<button type="button" class="aep-bc-modal__backdrop" data-aep-bc-close aria-label="Close dialog"></button>' +
      '<div class="aep-bc-modal__dialog">' +
      '<button type="button" class="aep-bc-modal__close" data-aep-bc-close aria-label="Close Brand Concierge">&times;</button>' +
      '<h2 id="aepBcModalTitle" class="visually-hidden">Brand Concierge</h2>' +
      '<div id="brand-concierge-mount" class="aep-bc-modal__mount"></div>' +
      '</div>';
    document.body.appendChild(modal);
  }

  function ensureSiteCloneBcChrome() {
    ensureFrameHost();
    ensureModalFab();
    ensureModalShell();
    return {
      frameHost: !!document.getElementById('siteCloneBcFrameHost'),
      fab: !!document.getElementById('siteCloneBcFab'),
      modal: !!document.getElementById('aepBcModal'),
    };
  }

  global.SiteCloneBcChrome = {
    ensure: ensureSiteCloneBcChrome,
  };
})(typeof window !== 'undefined' ? window : globalThis);
