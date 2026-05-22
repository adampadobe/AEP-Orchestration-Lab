(function () {
  var SELECTOR =
    '.army-bc-inline #brand-concierge-mount, .aep-bc-modal #brand-concierge-mount';

  function moveDisclaimer(mount) {
    var disclaimer = mount.querySelector('.disclaimer-message');
    if (!disclaimer || disclaimer.dataset.armyBcDisclaimerMoved === '1') {
      return !!disclaimer;
    }

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

  function scan() {
    var mounts = document.querySelectorAll(SELECTOR);
    var done = true;
    mounts.forEach(function (mount) {
      if (!moveDisclaimer(mount)) done = false;
    });
    return done;
  }

  function observe() {
    if (scan()) return;

    var obs = new MutationObserver(function () {
      if (scan()) obs.disconnect();
    });

    document.querySelectorAll(SELECTOR).forEach(function (mount) {
      obs.observe(mount, { childList: true, subtree: true });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', observe);
  } else {
    observe();
  }
})();
