/**
 * Ensures site-clone BC page chrome (frame host, modal FAB, dock-parity modal shell).
 * Safe to call multiple times; used by shared/env-bar.js when features.bc is enabled.
 */
(function (global) {
  'use strict';

  var FAB_IMG = 'https://contenthosting.web.app/logos/adobe_icon_146235.webp';

  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function readPanelTitle() {
    var page = global.SiteCloneBcPage || {};
    if (page.bottomDockPanelTitle) return String(page.bottomDockPanelTitle).trim();
    if (page.modalPanelTitle) return String(page.modalPanelTitle).trim();
    var mount = document.querySelector('[data-demo-env-strip-mount]');
    var title = mount ? mount.getAttribute('data-demo-env-strip-title') : '';
    if (title) return title.replace(/\s*\(web\)\s*$/i, '').trim() + ' assistant';
    return 'Assistant';
  }

  function readBetaLabel() {
    var page = global.SiteCloneBcPage || {};
    return String(page.bottomDockBetaLabel || page.modalBetaLabel || 'BETA').trim() || 'BETA';
  }

  function modalDialogInnerHtml(title, beta) {
    return (
      '<header class="aep-bc-modal__panel-header bc-bottom-dock__panel-header">' +
      '<div class="bc-bottom-dock__panel-title-row">' +
      '<h2 id="aepBcModalTitle" class="bc-bottom-dock__panel-title">' +
      esc(title) +
      '</h2>' +
      '<span class="bc-bottom-dock__beta aep-bc-modal__beta">' +
      esc(beta) +
      '</span></div>' +
      '<div class="bc-bottom-dock__panel-controls">' +
      '<button type="button" class="bc-bottom-dock__icon-btn aep-bc-modal__close" data-aep-bc-close aria-label="Close assistant">&times;</button>' +
      '</div></header>' +
      '<div class="aep-bc-modal__panel-body bc-bottom-dock__panel-body">' +
      '<div id="brand-concierge-mount" class="aep-bc-modal__mount bc-bottom-dock__mount"></div>' +
      '</div>'
    );
  }

  function syncModalHeaderLabels() {
    var titleEl = document.getElementById('aepBcModalTitle');
    var betaEl = document.querySelector('.aep-bc-modal__beta');
    if (titleEl) titleEl.textContent = readPanelTitle();
    if (betaEl) betaEl.textContent = readBetaLabel();
  }

  function upgradeModalShell() {
    var modal = document.getElementById('aepBcModal');
    if (!modal) return;
    var dialog = modal.querySelector('.aep-bc-modal__dialog');
    if (!dialog) return;

    if (!dialog.querySelector('.aep-bc-modal__panel-header')) {
      var mount = dialog.querySelector('#brand-concierge-mount, #siteCloneBcModalMount');
      var legacyClose = dialog.querySelector('.aep-bc-modal__close:not([data-aep-bc-close])');
      if (legacyClose) legacyClose.remove();
      dialog.querySelectorAll('.aep-bc-modal__close').forEach(function (node) {
        node.remove();
      });
      dialog.querySelectorAll('.visually-hidden').forEach(function (node) {
        if (node.id === 'aepBcModalTitle') node.remove();
      });

      var mountId = mount && mount.id ? mount.id : 'brand-concierge-mount';
      var mountClasses = 'aep-bc-modal__mount bc-bottom-dock__mount';
      var preserved = mount ? mount.innerHTML : '';
      dialog.innerHTML = modalDialogInnerHtml(readPanelTitle(), readBetaLabel()).replace(
        'id="brand-concierge-mount"',
        'id="' + esc(mountId) + '"',
      );
      var nextMount = document.getElementById(mountId);
      if (nextMount) {
        nextMount.className = mountClasses;
        if (preserved) nextMount.innerHTML = preserved;
      }
    } else {
      syncModalHeaderLabels();
    }
  }

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
    if (!document.getElementById('aepBcModal')) {
      var modal = document.createElement('div');
      modal.id = 'aepBcModal';
      modal.className = 'aep-bc-modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-labelledby', 'aepBcModalTitle');
      modal.hidden = true;
      modal.innerHTML =
        '<button type="button" class="aep-bc-modal__backdrop" data-aep-bc-close aria-label="Close dialog" tabindex="-1"></button>' +
        '<div class="aep-bc-modal__dialog">' +
        modalDialogInnerHtml(readPanelTitle(), readBetaLabel()) +
        '</div>';
      document.body.appendChild(modal);
      return;
    }
    upgradeModalShell();
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
    upgradeModalShell: upgradeModalShell,
    syncModalHeaderLabels: syncModalHeaderLabels,
  };
})(typeof window !== 'undefined' ? window : globalThis);
