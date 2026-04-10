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
        { label: 'Data viewer', href: 'schema-viewer.html', ico: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="8" cy="4.5" rx="6" ry="2.5"/><path d="M2 4.5v4c0 1.38 2.69 2.5 6 2.5.7 0 1.37-.04 2-.13"/><path d="M14 4.5v4c0 .47-.3.9-.8 1.27"/><path d="M2 8.5v4c0 1.38 2.69 2.5 6 2.5.7 0 1.37-.04 2-.13"/><path d="M14 8.5v1"/><circle cx="15" cy="14" r="2.5"/><path d="M17 16l1.5 1.5"/></svg>' },
        { label: 'Audience', href: 'audience-membership.html', ico: '\uD83D\uDC65' },
        { label: 'Consent', href: 'consent.html', ico: '\u2713' },
      ],
    },
    {
      group: 'Tools', id: 'tools',
      items: [
        { label: 'Journeys', href: 'journeys.html', ico: '<svg width="16" height="16" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M14.5,14c-1.933,0-3.5-.6265-3.5-1.4v-2c0,.773,1.567,1.533,3.5,1.533S18,11.373,18,10.6v2C18,13.3735,16.433,14,14.5,14ZM18,16.5895v-2.579c0,.773-1.567,1.4-3.5,1.4s-3.5-.6265-3.5-1.4V16.59c0,.773,1.567,1.4,3.5,1.4S18,17.363,18,16.5895Zm0-7.534c0-.773-1.5975-1.313-3.5305-1.313S11,8.2825,11,9.0555s1.567,1.4,3.5,1.4S18,9.829,18,9.0555Z"/><path fill="currentColor" d="M10,14a1,1,0,0,1-1-1V5a1,1,0,0,1,1-1h2.05a2.5,2.5,0,1,0,0-1H10A2,2,0,0,0,8,5V8H5.95a2.5,2.5,0,1,0,0,1H8v4a2,2,0,0,0,2,2ZM14.5,2A1.5,1.5,0,1,1,13,3.5,1.5,1.5,0,0,1,14.5,2Zm-11,8A1.5,1.5,0,1,1,5,8.5,1.5,1.5,0,0,1,3.5,10Z"/></svg>' },
        { label: 'Decisioning lab', href: 'content-decision-live.html', ico: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="5" height="4" rx="1"/><rect x="1" y="13" width="5" height="4" rx="1"/><rect x="14" y="8" width="5" height="4" rx="1"/><path d="M6 5h3l3 5.5"/><path d="M6 15h3l3-5"/><path d="M12 10.5h2"/><path d="M10.5 1l.5 1.2.5-1.2M11.7 1.5l-1.2.5 1.2.5" stroke-width="1.1"/></svg>' },
        { label: 'Profile generation', href: 'profile-generation.html', ico: '\u2795' },
        { label: 'Event tool', href: 'event-tool.html', ico: '\uD83D\uDCE4' },
        { label: 'Firebase images', href: 'firebase-hosting.html', ico: '\uD83D\uDDBC' },
        { label: 'Audit events', href: 'audit-events.html', ico: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2h8l4 4v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/><path d="M12 2v4h4"/><path d="M7 10h6M7 13h4"/></svg>' },
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
