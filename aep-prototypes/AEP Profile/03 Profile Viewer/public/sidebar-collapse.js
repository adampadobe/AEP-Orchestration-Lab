(function () {
  const STORAGE_KEY = 'dashboardSidebarCollapsed';
  const CLASS_COLLAPSED = 'dashboard-sidebar-collapsed';

  function init() {
    const aside = document.querySelector('aside.dashboard-sidebar');
    if (!aside || aside.querySelector('.dashboard-sidebar-toggle')) return;

    const toolbar = document.createElement('div');
    toolbar.className = 'dashboard-sidebar-toolbar';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dashboard-sidebar-toggle';
    const icon = document.createElement('span');
    icon.className = 'dashboard-sidebar-toggle-icon';
    icon.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 3; i++) {
      icon.appendChild(document.createElement('span'));
    }
    btn.appendChild(icon);
    toolbar.appendChild(btn);
    var brand = aside.querySelector('.dashboard-sidebar-brand');
    if (brand) {
      brand.appendChild(toolbar);
    } else {
      aside.insertBefore(toolbar, aside.firstChild);
    }

    function apply(collapsed) {
      document.body.classList.toggle(CLASS_COLLAPSED, collapsed);
      btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
      btn.setAttribute('aria-label', collapsed ? 'Expand navigation' : 'Collapse navigation');
      try {
        localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0');
      } catch (_) {}
    }

    let collapsed = false;
    try {
      collapsed = localStorage.getItem(STORAGE_KEY) === '1';
    } catch (_) {}
    apply(collapsed);

    btn.addEventListener('click', function () {
      apply(!document.body.classList.contains(CLASS_COLLAPSED));
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
