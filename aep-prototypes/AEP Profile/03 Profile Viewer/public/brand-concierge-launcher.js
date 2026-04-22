/**
 * Toggle Brand Concierge mount visibility for pages using assets/brand-concierge-launcher.css.
 */
(function initBrandConciergeLauncher() {
  var btn = document.getElementById('brandConciergeLaunchBtn');
  var host = document.getElementById('brand-concierge-mount-host');
  if (!btn || !host) return;

  var OPEN_CLASS = 'aep-bc-launcher-open';

  function setOpen(open) {
    document.body.classList.toggle(OPEN_CLASS, open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    host.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  setOpen(false);

  btn.addEventListener('click', function () {
    setOpen(!document.body.classList.contains(OPEN_CLASS));
  });

  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && document.body.classList.contains(OPEN_CLASS)) {
      setOpen(false);
      btn.focus();
    }
  });
})();
