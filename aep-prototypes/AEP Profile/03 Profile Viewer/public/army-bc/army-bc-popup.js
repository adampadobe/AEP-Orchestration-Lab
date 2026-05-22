(function () {
  var btn = document.getElementById('modArmyBcFab') || document.getElementById('aepBcReopenBtn');
  var modal = document.getElementById('aepBcModal');
  if (!btn || !modal) return;

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

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modal.classList.contains('is-open')) {
      closeModal();
    }
  });
})();
