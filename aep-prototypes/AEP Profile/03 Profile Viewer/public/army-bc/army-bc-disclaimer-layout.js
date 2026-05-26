(function (global) {
  'use strict';

  var MOUNT_SELECTOR =
    '.army-bc-inline #brand-concierge-mount, .aep-bc-modal #brand-concierge-mount, #modDemoArmyBcInline #brand-concierge-mount, .mod-demo-army-bc-inline #brand-concierge-mount, #modDemoBcModalMount';

  function moveDisclaimer(mount) {
    if (!mount) return false;
    var disclaimer = mount.querySelector('.disclaimer-message');
    if (!disclaimer) return false;
    if (disclaimer.dataset.armyBcDisclaimerMoved === '1') return true;

    var inputContainer = disclaimer.closest('.input-container');
    if (!inputContainer) {
      disclaimer.classList.add('army-bc-disclaimer-external');
      disclaimer.dataset.armyBcDisclaimerMoved = '1';
      return true;
    }

    var inputSection =
      inputContainer.closest('.input-section') || inputContainer.parentElement;
    var host = inputSection ? inputSection.parentElement : mount;

    if (host && inputSection && host.contains(inputSection)) {
      disclaimer.classList.add('army-bc-disclaimer-external');
      host.insertBefore(disclaimer, inputSection.nextSibling);
    } else if (inputContainer.parentElement) {
      disclaimer.classList.add('army-bc-disclaimer-external');
      inputContainer.parentElement.insertBefore(disclaimer, inputContainer.nextSibling);
    }

    disclaimer.dataset.armyBcDisclaimerMoved = '1';
    return true;
  }

  function scan(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var mounts = scope.querySelectorAll(
      root && root.querySelector ? '#brand-concierge-mount, #modDemoBcModalMount' : MOUNT_SELECTOR,
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
      root && root.querySelector ? '#brand-concierge-mount, #modDemoBcModalMount' : MOUNT_SELECTOR,
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
      if (el.id === 'brand-concierge-mount' || el.id === 'modDemoBcModalMount') {
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
