(function (global) {
  'use strict';

  var MOUNT_SELECTOR =
    '.embed-bc-inline #brand-concierge-mount, .aep-bc-modal #brand-concierge-mount, #siteCloneBcInline #brand-concierge-mount, .site-clone-bc-inline #brand-concierge-mount, #siteCloneBcModalMount';

  function moveDisclaimer(mount) {
    if (!mount) return false;
    var disclaimer = mount.querySelector('.disclaimer-message');
    if (!disclaimer) return false;
    if (disclaimer.dataset.embedBcDisclaimerMoved === '1') return true;

    var inputContainer = disclaimer.closest('.input-container');
    if (!inputContainer) {
      disclaimer.classList.add('embed-bc-disclaimer-external');
      disclaimer.dataset.embedBcDisclaimerMoved = '1';
      return true;
    }

    var inputSection =
      inputContainer.closest('.input-section') || inputContainer.parentElement;
    var host = inputSection ? inputSection.parentElement : mount;

    if (host && inputSection && host.contains(inputSection)) {
      disclaimer.classList.add('embed-bc-disclaimer-external');
      host.insertBefore(disclaimer, inputSection.nextSibling);
    } else if (inputContainer.parentElement) {
      disclaimer.classList.add('embed-bc-disclaimer-external');
      inputContainer.parentElement.insertBefore(disclaimer, inputContainer.nextSibling);
    }

    disclaimer.dataset.embedBcDisclaimerMoved = '1';
    return true;
  }

  function scan(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var mounts = scope.querySelectorAll(
      root && root.querySelector ? '#brand-concierge-mount, #siteCloneBcModalMount' : MOUNT_SELECTOR,
    );
    var done = true;
    mounts.forEach(function (mount) {
      if (!moveDisclaimer(mount)) done = false;
    });
    return done;
  }

  function observe(root) {
    if (scan(root)) return;

    var scope = root && root.querySelectorAll ? root : document;
    var targets = scope.querySelectorAll(
      root && root.querySelector ? '#brand-concierge-mount, #siteCloneBcModalMount' : MOUNT_SELECTOR,
    );
    if (!targets.length) return;

    var obs = new MutationObserver(function () {
      if (scan(root)) obs.disconnect();
    });

    targets.forEach(function (mount) {
      obs.observe(mount, { childList: true, subtree: true });
    });
  }

  global.repositionArmyBcDisclaimer = function (mountOrRoot) {
    if (mountOrRoot && mountOrRoot.nodeType === 1) {
      var el = mountOrRoot;
      if (el.id === 'brand-concierge-mount' || el.id === 'siteCloneBcModalMount') {
        moveDisclaimer(el);
        return;
      }
      scan(el);
      return;
    }
    scan(mountOrRoot);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      observe();
    });
  } else {
    observe();
  }
})(typeof window !== 'undefined' ? window : this);
