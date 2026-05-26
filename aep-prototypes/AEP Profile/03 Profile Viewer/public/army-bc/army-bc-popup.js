/**
 * army-mod-home-3: floating FAB opens/closes Brand Concierge modal.
 * Idempotent — safe to call again after MOD demo loads scripts on demand.
 */
(function (global) {
  'use strict';

  function getFab() {
    return (
      document.getElementById('modDemoBcFab') ||
      document.getElementById('aepBcReopenBtn') ||
      document.getElementById('modArmyBcFab')
    );
  }

  function getModal() {
    return document.getElementById('aepBcModal');
  }

  function initArmyBcPopup() {
    var btn = getFab();
    var modal = getModal();
    if (!btn || !modal) return false;
    if (btn.__armyBcPopupBound) return true;

    var closeTargets = modal.querySelectorAll('[data-aep-bc-close]');

    function openModal() {
      modal.classList.add('is-open');
      modal.removeAttribute('hidden');
      btn.setAttribute('aria-expanded', 'true');
      document.body.classList.add('aep-bc-modal-open');
      var closeBtn = modal.querySelector('.aep-bc-modal__close');
      if (closeBtn) closeBtn.focus();
    }

    function closeModal() {
      modal.classList.remove('is-open');
      modal.setAttribute('hidden', '');
      btn.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('aep-bc-modal-open');
      btn.focus();
    }

    btn.addEventListener('click', openModal);

    closeTargets.forEach(function (el) {
      el.addEventListener('click', closeModal);
    });

    if (!global.__armyBcPopupEscapeBound) {
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && modal.classList.contains('is-open')) {
          closeModal();
        }
      });
      global.__armyBcPopupEscapeBound = true;
    }

    btn.__armyBcPopupBound = true;
    global.ArmyBcPopup = { open: openModal, close: closeModal };
    return true;
  }

  global.initArmyBcPopup = initArmyBcPopup;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initArmyBcPopup);
  } else {
    initArmyBcPopup();
  }
})(typeof window !== 'undefined' ? window : this);
