/*!
 * Paint-time sync for theme + sidebar (must match aep-theme.js / aep-lab-nav).
 * Include in <head> without defer/async so CSS sees html[data-aep-theme] before paint.
 * Keys: localStorage aepTheme === 'dark' | aepSidebarCollapsed === '1'
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
  } catch (e) { /* private mode / quota */ }
})();
