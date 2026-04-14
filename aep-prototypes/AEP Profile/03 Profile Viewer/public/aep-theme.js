/**
 * Global theme: localStorage key aepTheme = 'dark' | 'light'.
 * Sets html[data-aep-theme="dark"]; injects sidebar toggle on dashboard pages.
 * For paint-time sync before this script runs, pages include aep-head-sync.js in <head>.
 */
(function (global) {
  var LS = 'aepTheme';

  function getMode() {
    try {
      return localStorage.getItem(LS) === 'dark' ? 'dark' : 'light';
    } catch (e) {
      return 'light';
    }
  }

  function applyToDocument(mode) {
    var root = document.documentElement;
    if (mode === 'dark') root.setAttribute('data-aep-theme', 'dark');
    else root.removeAttribute('data-aep-theme');
    syncToggleLabels(mode);
  }

  function syncToggleLabels(mode) {
    var dark = mode === 'dark';
    global.document.querySelectorAll('.aep-theme-toggle-btn').forEach(function (btn) {
      btn.setAttribute('aria-pressed', dark ? 'true' : 'false');
      btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
      var txtEl = btn.querySelector('.aep-theme-toggle-text');
      var icoEl = btn.querySelector('.aep-theme-toggle-ico');
      if (txtEl) txtEl.textContent = dark ? 'Light mode' : 'Dark mode';
      if (icoEl) icoEl.textContent = dark ? '\u2600' : '\u25D1';
      if (!txtEl && !icoEl) btn.textContent = dark ? 'Light mode' : 'Dark mode';
    });
  }

  function setMode(mode) {
    var m = mode === 'dark' ? 'dark' : 'light';
    try {
      localStorage.setItem(LS, m);
      localStorage.setItem('aep-decisioning-theme', m);
    } catch (e) {}
    applyToDocument(m);
    try {
      global.dispatchEvent(new CustomEvent('aep-theme-change', { detail: { mode: m } }));
    } catch (e) {}
  }

  function toggle() {
    setMode(getMode() === 'dark' ? 'light' : 'dark');
  }

  function bindToggleButtons() {
    global.document.querySelectorAll('.aep-theme-toggle-btn').forEach(function (btn) {
      if (btn.dataset.aepThemeBound === '1') return;
      btn.dataset.aepThemeBound = '1';
      btn.addEventListener('click', toggle);
    });
    syncToggleLabels(getMode());
  }

  function injectFavicon() {
    var doc = global.document;
    if (!doc.head || doc.querySelector('link[data-aep-favicon="main"]')) return;
    /* Same multi-size .ico as AI Projects/firebaseFunctions/public/favicon.ico (copied to /web/favicon.ico). */
    var v = '20260416b';
    var ico = doc.createElement('link');
    ico.rel = 'icon';
    ico.href = '/favicon.ico?v=' + v;
    ico.setAttribute('sizes', 'any');
    ico.setAttribute('data-aep-favicon', 'main');
    doc.head.appendChild(ico);
    var apple = doc.createElement('link');
    apple.rel = 'apple-touch-icon';
    apple.href = '/apple-touch-icon.png?v=' + v;
    apple.setAttribute('data-aep-favicon', 'apple');
    doc.head.appendChild(apple);
  }

  function injectSidebarToggle() {
    var doc = global.document;
    doc.querySelectorAll('.dashboard-sidebar').forEach(function (sidebar) {
      if (sidebar.querySelector('[data-aep-theme-slot]')) return;
      var wrap = doc.createElement('div');
      wrap.className = 'aep-theme-sidebar-footer';
      wrap.setAttribute('data-aep-theme-slot', '1');
      var btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = 'aep-theme-toggle-btn';
      wrap.appendChild(btn);
      sidebar.appendChild(wrap);
    });
  }

  function init() {
    injectFavicon();
    applyToDocument(getMode());
    injectSidebarToggle();
    bindToggleButtons();
    global.addEventListener('storage', function (e) {
      if (e.key !== LS) return;
      var m = e.newValue === 'dark' ? 'dark' : 'light';
      applyToDocument(m);
    });
    global.addEventListener('aep-theme-change', function () {
      applyToDocument(getMode());
    });
  }

  global.AepTheme = {
    LS: LS,
    getMode: getMode,
    setMode: setMode,
    toggle: toggle,
    init: init,
    applyToDocument: applyToDocument,
    syncToggleLabels: syncToggleLabels,
    bindToggleButtons: bindToggleButtons,
    injectSidebarToggle: injectSidebarToggle,
  };

  if (global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : this);
