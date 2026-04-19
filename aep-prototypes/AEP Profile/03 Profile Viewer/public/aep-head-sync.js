/*!
 * Paint-time sync for theme + sidebar + palette prefs (must match aep-theme.js / aep-lab-nav / aep-theme-prefs.js).
 * Include in <head> without defer/async so CSS sees html[data-*] before paint.
 * Keys: aepTheme | aepSidebarCollapsed | aepMenuPalette | aepBgPreset | aepHomeDashboardSidebarTheme
 */
(function () {
  try {
    var d = document.documentElement;
    if (localStorage.getItem('aepTheme') === 'dark') {
      d.setAttribute('data-aep-theme', 'dark');
    } else {
      d.removeAttribute('data-aep-theme');
    }
    if (localStorage.getItem('aepSidebarCollapsed') === '1') {
      d.setAttribute('data-sidebar-collapsed', '');
    } else {
      d.removeAttribute('data-sidebar-collapsed');
    }
    var mp = localStorage.getItem('aepMenuPalette');
    if (mp && mp !== 'default') d.setAttribute('data-aep-menu-palette', mp);
    else d.removeAttribute('data-aep-menu-palette');
    var bp = localStorage.getItem('aepBgPreset');
    if (bp && bp !== 'default') d.setAttribute('data-aep-bg-preset', bp);
    else d.removeAttribute('data-aep-bg-preset');
    var st = localStorage.getItem('aepHomeDashboardSidebarTheme');
    if (st === 'light') d.setAttribute('data-ajo-sidebar', 'light');
    else d.setAttribute('data-ajo-sidebar', 'dark');
  } catch (e) { /* private mode / quota */ }
})();
