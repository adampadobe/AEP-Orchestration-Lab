/**
 * Injects sidebar links: Global values after Home; Decisioning lab after Profile Viewer (index.html).
 */
(function () {
  function inject() {
    var navs = document.querySelectorAll('.dashboard-sidebar-nav');
    if (!navs.length) return;
    var path = window.location.pathname || '';
    var onGlobal = path.indexOf('global-settings.html') !== -1;
    var onDecisioning = path.indexOf('content-decision-live.html') !== -1;

    navs.forEach(function (nav) {
      var home = nav.querySelector('a[href="home.html"]');
      var insertAfter = home;
      if (!home || !home.parentNode) {
        insertAfter = null;
      }

      if (!nav.querySelector('[data-aep-global-settings]')) {
        var gs = document.createElement('a');
        gs.href = 'global-settings.html';
        gs.setAttribute('data-aep-global-settings', '1');
        gs.className =
          'dashboard-nav-item' + (onGlobal ? ' dashboard-nav-item--active' : '');
        gs.title = 'Sandbox and other values shared across Profile Viewer pages';
        gs.innerHTML =
          '<span class="dashboard-nav-ico" aria-hidden="true">⚙</span>Global values';
        if (insertAfter) {
          insertAfter.parentNode.insertBefore(gs, insertAfter.nextSibling);
          insertAfter = gs;
        } else {
          nav.insertBefore(gs, nav.firstChild);
          insertAfter = gs;
        }
      }

      if (!nav.querySelector('[data-aep-decisioning-lab]')) {
        var dl = document.createElement('a');
        dl.href = 'content-decision-live.html';
        dl.setAttribute('data-aep-decisioning-lab', '1');
        dl.className =
          'dashboard-nav-item' + (onDecisioning ? ' dashboard-nav-item--active' : '');
        dl.title = 'Content Decision Lab — profile, webhook & banner preview';
        dl.innerHTML =
          '<span class="dashboard-nav-ico" aria-hidden="true">◇</span>Decisioning lab';
        var profileLink = nav.querySelector('a[href="index.html"]');
        var anchorForLab =
          profileLink ||
          nav.querySelector('[data-aep-global-settings]') ||
          home;
        if (anchorForLab && anchorForLab.parentNode) {
          anchorForLab.parentNode.insertBefore(dl, anchorForLab.nextSibling);
        } else {
          nav.insertBefore(dl, nav.firstChild);
        }
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();
