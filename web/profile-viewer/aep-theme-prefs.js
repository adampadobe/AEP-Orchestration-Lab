/**
 * Theme preferences: menu palette + background preset (localStorage).
 * Applies html[data-aep-menu-palette] and html[data-aep-bg-preset] for CSS in aep-theme-palettes.css.
 * Works with AepTheme light/dark (data-aep-theme); palette rules use compound selectors for each mode.
 */
(function (global) {
  var LS_MENU = 'aepMenuPalette';
  var LS_BG = 'aepBgPreset';

  var VALID_MENU = { default: 1, slate: 1, ocean: 1, ember: 1, violet: 1 };
  var VALID_BG = { default: 1, warm: 1, cool: 1, contrast: 1 };

  function getMenuPalette() {
    try {
      var v = String(localStorage.getItem(LS_MENU) || 'default').trim().toLowerCase();
      return VALID_MENU[v] ? v : 'default';
    } catch (e) {
      return 'default';
    }
  }

  function getBgPreset() {
    try {
      var v = String(localStorage.getItem(LS_BG) || 'default').trim().toLowerCase();
      return VALID_BG[v] ? v : 'default';
    } catch (e) {
      return 'default';
    }
  }

  function applyToDocument() {
    var root = global.document.documentElement;
    var mp = getMenuPalette();
    var bp = getBgPreset();
    if (mp === 'default') root.removeAttribute('data-aep-menu-palette');
    else root.setAttribute('data-aep-menu-palette', mp);
    if (bp === 'default') root.removeAttribute('data-aep-bg-preset');
    else root.setAttribute('data-aep-bg-preset', bp);
    try {
      global.dispatchEvent(
        new CustomEvent('aep-theme-prefs-change', { detail: { menuPalette: mp, bgPreset: bp } })
      );
    } catch (e) {}
  }

  function setMenuPalette(id) {
    var v = String(id || 'default').trim().toLowerCase();
    if (!VALID_MENU[v]) v = 'default';
    try {
      if (v === 'default') localStorage.removeItem(LS_MENU);
      else localStorage.setItem(LS_MENU, v);
    } catch (e) {}
    applyToDocument();
  }

  function setBgPreset(id) {
    var v = String(id || 'default').trim().toLowerCase();
    if (!VALID_BG[v]) v = 'default';
    try {
      if (v === 'default') localStorage.removeItem(LS_BG);
      else localStorage.setItem(LS_BG, v);
    } catch (e) {}
    applyToDocument();
  }

  function bindPicker(rootEl) {
    if (!rootEl || rootEl.dataset.aepThemePrefsBound === '1') return;
    rootEl.dataset.aepThemePrefsBound = '1';
    rootEl.querySelectorAll('[data-aep-menu-palette-choice]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-aep-menu-palette-choice');
        setMenuPalette(id);
        syncPickerUi(rootEl);
      });
    });
    rootEl.querySelectorAll('[data-aep-bg-preset-choice]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-aep-bg-preset-choice');
        setBgPreset(id);
        syncPickerUi(rootEl);
      });
    });
    syncPickerUi(rootEl);
  }

  function syncPickerUi(rootEl) {
    if (!rootEl) return;
    var mp = getMenuPalette();
    var bp = getBgPreset();
    rootEl.querySelectorAll('[data-aep-menu-palette-choice]').forEach(function (btn) {
      var id = btn.getAttribute('data-aep-menu-palette-choice') || 'default';
      var on = id === mp;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.classList.toggle('aep-theme-pref-swatch--selected', on);
    });
    rootEl.querySelectorAll('[data-aep-bg-preset-choice]').forEach(function (btn) {
      var id = btn.getAttribute('data-aep-bg-preset-choice') || 'default';
      var on = id === bp;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.classList.toggle('aep-theme-pref-swatch--selected', on);
    });
  }

  function init() {
    applyToDocument();
    global.document.querySelectorAll('[data-aep-theme-prefs]').forEach(function (el) {
      bindPicker(el);
    });
  }

  global.AepThemePrefs = {
    LS_MENU: LS_MENU,
    LS_BG: LS_BG,
    getMenuPalette: getMenuPalette,
    getBgPreset: getBgPreset,
    setMenuPalette: setMenuPalette,
    setBgPreset: setBgPreset,
    applyToDocument: applyToDocument,
    bindPicker: bindPicker,
    init: init,
  };

  if (global.document.readyState === 'loading') {
    global.document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.addEventListener('storage', function (e) {
    if (e.key === LS_MENU || e.key === LS_BG) applyToDocument();
  });
})(typeof window !== 'undefined' ? window : this);
