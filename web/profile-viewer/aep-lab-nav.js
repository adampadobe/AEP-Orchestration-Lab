/**
 * AEP Lab Navigation — builds the collapsible sidebar with grouped sections,
 * collapse/expand state, section group toggling, and hover tooltips.
 * Sidebar content is generated from a single NAV definition so every page
 * shares an identical menu without duplicating HTML.
 */
(function () {
  'use strict';

  var LS_COLLAPSED = 'aepSidebarCollapsed';
  var LS_GROUPS    = 'aepNavGroups';

  var NAV = [
    { label: 'Home', href: 'home.html', ico: '\u2302' },
    { label: 'Global values', href: 'global-settings.html', ico: '\u2699' },
    {
      group: 'Profiles', id: 'profiles',
      items: [
        { label: 'Profile Viewer', href: 'index.html', ico: '\uD83D\uDC64' },
        { label: 'Decisioning lab', href: 'content-decision-live.html', ico: '\u25C7' },
        { label: 'Data viewer', href: 'schema-viewer.html', ico: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="8" cy="4.5" rx="6" ry="2.5"/><path d="M2 4.5v4c0 1.38 2.69 2.5 6 2.5.7 0 1.37-.04 2-.13"/><path d="M14 4.5v4c0 .47-.3.9-.8 1.27"/><path d="M2 8.5v4c0 1.38 2.69 2.5 6 2.5.7 0 1.37-.04 2-.13"/><path d="M14 8.5v1"/><circle cx="15" cy="14" r="2.5"/><path d="M17 16l1.5 1.5"/></svg>' },
        { label: 'Audience', href: 'audience-membership.html', ico: '\uD83D\uDC65' },
      ],
    },
    {
      group: 'Tools', id: 'tools',
      items: [
        { label: 'Profile generation', href: 'profile-generation.html', ico: '\u2795' },
        { label: 'Consent', href: 'consent.html', ico: '\u2713' },
        { label: 'Event generator', href: 'event-generator.html', ico: '\uD83D\uDCE4' },
        { label: 'Events trigger', href: 'events-trigger.html', ico: '\u26A1' },
        { label: 'Firebase images', href: 'firebase-hosting.html', ico: '\uD83D\uDDBC' },
      ],
    },
    {
      group: 'Demos', id: 'demos',
      items: [
        { label: 'Donate (demo)', href: 'donate-demo.html', ico: '\uD83D\uDC9D' },
        { label: 'Race for Life (demo)', href: 'race-for-life-demo.html', ico: '\uD83C\uDFC3' },
      ],
    },
  ];

  /* ── localStorage helpers ── */

  function lsGet(key, fallback) {
    try { var v = localStorage.getItem(key); return v !== null ? v : fallback; }
    catch (e) { return fallback; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, val); } catch (e) {}
  }

  function isCollapsed() { return lsGet(LS_COLLAPSED, '0') === '1'; }

  function persistCollapsed(collapsed) {
    lsSet(LS_COLLAPSED, collapsed ? '1' : '0');
    var html = document.documentElement;
    if (collapsed) html.setAttribute('data-sidebar-collapsed', '');
    else html.removeAttribute('data-sidebar-collapsed');
  }

  function getGroupStates() {
    try { return JSON.parse(lsGet(LS_GROUPS, '{}')); }
    catch (e) { return {}; }
  }

  function saveGroupStates(s) { lsSet(LS_GROUPS, JSON.stringify(s)); }

  /* ── Helpers ── */

  function currentFile() {
    return (window.location.pathname || '').split('/').pop() || '';
  }

  function mk(tag, cls, attrs) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }

  /* ── Builders ── */

  function buildItem(def, filename) {
    var active = filename === def.href;
    var a = mk('a', 'dashboard-nav-item' + (active ? ' dashboard-nav-item--active' : ''), {
      href: def.href,
      'data-tooltip': def.label,
    });
    var ico = mk('span', 'dashboard-nav-ico', { 'aria-hidden': 'true' });
    if (def.ico && def.ico.charAt(0) === '<') { ico.innerHTML = def.ico; } else { ico.textContent = def.ico; }
    var lbl = mk('span', 'dashboard-nav-label');
    lbl.textContent = def.label;
    a.appendChild(ico);
    a.appendChild(lbl);
    return a;
  }

  function buildGroup(def, filename, gStates) {
    var expanded = gStates[def.id] !== false;
    var wrap = mk('div', 'dashboard-nav-group' + (expanded ? ' dashboard-nav-group--expanded' : ''), {
      'data-group': def.id,
    });

    var toggle = mk('button', 'dashboard-nav-group-toggle', {
      type: 'button', 'aria-expanded': String(expanded),
    });
    var chev = mk('span', 'dashboard-nav-group-chevron', { 'aria-hidden': 'true' });
    var gl = mk('span', 'dashboard-nav-group-label');
    gl.textContent = def.group;
    toggle.appendChild(chev);
    toggle.appendChild(gl);
    wrap.appendChild(toggle);

    var items = mk('div', 'dashboard-nav-group-items');
    def.items.forEach(function (item) { items.appendChild(buildItem(item, filename)); });
    wrap.appendChild(items);

    toggle.addEventListener('click', function () {
      var isExp = wrap.classList.toggle('dashboard-nav-group--expanded');
      toggle.setAttribute('aria-expanded', String(isExp));
      var st = getGroupStates();
      st[def.id] = isExp;
      saveGroupStates(st);
    });

    return wrap;
  }

  /* ── Tooltip (fixed-position element on <body>) ── */

  function setupTooltips(sidebar) {
    var tip = mk('div', 'dashboard-nav-tooltip');
    document.body.appendChild(tip);

    sidebar.addEventListener('mouseover', function (e) {
      if (!sidebar.classList.contains('dashboard-sidebar--collapsed')) {
        tip.classList.remove('dashboard-nav-tooltip--visible');
        return;
      }
      var item = e.target.closest('.dashboard-nav-item[data-tooltip]');
      if (!item) { tip.classList.remove('dashboard-nav-tooltip--visible'); return; }
      tip.textContent = item.getAttribute('data-tooltip');
      var r = item.getBoundingClientRect();
      tip.style.top = (r.top + r.height / 2) + 'px';
      tip.style.left = (r.right + 8) + 'px';
      tip.classList.add('dashboard-nav-tooltip--visible');
    });

    sidebar.addEventListener('mouseout', function (e) {
      var rel = e.relatedTarget;
      if (!rel || typeof rel.closest !== 'function' || !rel.closest('.dashboard-nav-item[data-tooltip]')) {
        tip.classList.remove('dashboard-nav-tooltip--visible');
      }
    });
  }

  /* ── Main build ── */

  function buildSidebar(sidebar) {
    var collapsed = isCollapsed();
    var gStates  = getGroupStates();
    var filename = currentFile();

    sidebar.innerHTML = '';
    if (collapsed) sidebar.classList.add('dashboard-sidebar--collapsed');

    /* Header: brand + hamburger toggle */
    var header = mk('div', 'dashboard-sidebar-header');

    var brand = mk('div', 'dashboard-sidebar-brand');
    var markEl = mk('span', 'dashboard-sidebar-mark', { 'aria-hidden': 'true' });
    markEl.textContent = '\u25C6';
    var titles = mk('div', 'dashboard-sidebar-titles');
    var nameEl = mk('span', 'dashboard-sidebar-name');
    nameEl.textContent = 'AEP';
    var subEl = mk('span', 'dashboard-sidebar-sub');
    subEl.textContent = 'Profile Viewer';
    titles.appendChild(nameEl);
    titles.appendChild(subEl);
    brand.appendChild(markEl);
    brand.appendChild(titles);

    var toggleBtn = mk('button', 'dashboard-sidebar-toggle', {
      type: 'button',
      'aria-label': collapsed ? 'Expand sidebar' : 'Collapse sidebar',
    });
    var toggleIco = mk('span', 'dashboard-sidebar-toggle-ico', { 'aria-hidden': 'true' });
    toggleIco.innerHTML = '<span></span><span></span><span></span>';
    toggleBtn.appendChild(toggleIco);

    header.appendChild(brand);
    header.appendChild(toggleBtn);
    sidebar.appendChild(header);

    /* Navigation */
    var nav = mk('nav', 'dashboard-sidebar-nav');
    NAV.forEach(function (entry) {
      if (entry.group) nav.appendChild(buildGroup(entry, filename, gStates));
      else nav.appendChild(buildItem(entry, filename));
    });
    sidebar.appendChild(nav);

    /* Theme toggle (footer) */
    var footer = mk('div', 'aep-theme-sidebar-footer', { 'data-aep-theme-slot': '1' });
    var themeBtn = mk('button', 'aep-theme-toggle-btn', { type: 'button' });
    var themeIco = mk('span', 'aep-theme-toggle-ico', { 'aria-hidden': 'true' });
    themeIco.textContent = '\u25D1';
    var themeTxt = mk('span', 'aep-theme-toggle-text');
    themeTxt.textContent = 'Dark mode';
    themeBtn.appendChild(themeIco);
    themeBtn.appendChild(themeTxt);
    footer.appendChild(themeBtn);
    sidebar.appendChild(footer);

    try {
      if (typeof AepTheme !== 'undefined') {
        if (AepTheme.bindToggleButtons) AepTheme.bindToggleButtons();
        if (AepTheme.syncToggleLabels) AepTheme.syncToggleLabels(AepTheme.getMode());
      }
    } catch (e) { /* theme integration optional */ }

    /* Collapse toggle handler */
    toggleBtn.addEventListener('click', function () {
      var nowCollapsed = sidebar.classList.toggle('dashboard-sidebar--collapsed');
      persistCollapsed(nowCollapsed);
      toggleBtn.setAttribute('aria-label', nowCollapsed ? 'Expand sidebar' : 'Collapse sidebar');
    });

    /* Tooltips */
    setupTooltips(sidebar);
  }

  /* ── Init ── */

  function init() {
    document.querySelectorAll('.dashboard-sidebar').forEach(buildSidebar);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
