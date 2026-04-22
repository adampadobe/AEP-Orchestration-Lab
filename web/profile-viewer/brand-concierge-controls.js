/**
 * Dismiss / reopen Brand Concierge panel (paired with brand-concierge-controls.css).
 */
(function initBrandConciergeControls() {
  var DISMISSED = 'aep-bc-panel-dismissed';

  function sync(dismissBtn, reopenBtn) {
    var dismissed = document.body.classList.contains(DISMISSED);
    if (reopenBtn) reopenBtn.hidden = !dismissed;
    if (dismissBtn) dismissBtn.hidden = dismissed;
  }

  function bind() {
    var dismissBtn = document.getElementById('aepBcDismissBtn');
    var reopenBtn = document.getElementById('aepBcReopenBtn');
    if (!dismissBtn && !reopenBtn) return;

    function setDismissed(on) {
      document.body.classList.toggle(DISMISSED, on);
      sync(dismissBtn, reopenBtn);
    }

    dismissBtn &&
      dismissBtn.addEventListener('click', function () {
        setDismissed(true);
      });

    reopenBtn &&
      reopenBtn.addEventListener('click', function () {
        setDismissed(false);
      });

    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape') return;
      if (document.body.classList.contains(DISMISSED)) return;
      setDismissed(true);
      if (reopenBtn) reopenBtn.focus();
    });

    sync(dismissBtn, reopenBtn);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
