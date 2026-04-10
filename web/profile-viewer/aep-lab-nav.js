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
        { label: 'Profile Viewer', href: 'index.html', ico: '<svg width="16" height="16" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M9,.5A8.5,8.5,0,1,0,17.5,9,8.5,8.5,0,0,0,9,.5Zm5.491,13.59161a5.41289,5.41289,0,0,0-3.11213-1.56415.65361.65361,0,0,1-.5655-.65569V10.9256a.65656.65656,0,0,1,.16645-.42218A4.99536,4.99536,0,0,0,12.12006,7.3855c0-2.36029-1.25416-3.67963-3.14337-3.67963s-3.179,1.36835-3.179,3.67963A5.05147,5.05147,0,0,0,6.9892,10.5047a.655.655,0,0,1,.16656.42206v.94165a.64978.64978,0,0,1-.57006.65539,5.43158,5.43158,0,0,0-3.11963,1.5205,7.49965,7.49965,0,1,1,11.025.04731Z"/></svg>' },
        { label: 'Data viewer', href: 'schema-viewer.html', ico: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="8" cy="4.5" rx="6" ry="2.5"/><path d="M2 4.5v4c0 1.38 2.69 2.5 6 2.5.7 0 1.37-.04 2-.13"/><path d="M14 4.5v4c0 .47-.3.9-.8 1.27"/><path d="M2 8.5v4c0 1.38 2.69 2.5 6 2.5.7 0 1.37-.04 2-.13"/><path d="M14 8.5v1"/><circle cx="15" cy="14" r="2.5"/><path d="M17 16l1.5 1.5"/></svg>' },
        { label: 'Audience', href: 'audience-membership.html', ico: '<svg width="16" height="16" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><circle fill="currentColor" cx="9" cy="9" r="2.1005"/><path fill="currentColor" d="M13.0745,9.75a4.12348,4.12348,0,0,1-5.5975,3.1L5.4185,16.1435A7.98449,7.98449,0,0,0,16.962,9.75Z"/><path fill="currentColor" d="M9.75,4.9255a4.13351,4.13351,0,0,1,2.13,1.095L15.0395,3.764A7.97551,7.97551,0,0,0,9.75,1.038Z"/><path fill="currentColor" d="M15.9115,4.985,12.75,7.2445A4.11065,4.11065,0,0,1,13.0765,8.25H16.964A7.93442,7.93442,0,0,0,15.9115,4.985Z"/><path fill="currentColor" d="M6.208,12.05A4.13,4.13,0,0,1,8.25,4.9255V1.038A7.9905,7.9905,0,0,0,4.147,15.35Z"/></svg>' },
        { label: 'Consent', href: 'consent.html', ico: '<svg width="16" height="16" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M7.35,13.5a6.15759,6.15759,0,0,1,.204-1.55A25.07476,25.07476,0,0,0,6.168,9.7C5.1315,8.157,4.189,9.111,3.573,6.882c-.523-1.891.827-2.706.694-4.324A8.03648,8.03648,0,0,0,1,9c0,4.556,3.9715,7.271,6.777,7.866a3.44443,3.44443,0,0,0,.523.084c.015-.0385.0235-.0775.0375-.116A6.113,6.113,0,0,1,7.35,13.5Z"/><path fill="currentColor" d="M8.0135,2.327a1.85251,1.85251,0,0,0-.55-.226c-.909-.1055.44,2.3885.3885,2.057a1.15173,1.15173,0,0,1,2.2825-.0735A1.871,1.871,0,0,1,9.716,5.217c-.7055.927-.85,2.577-1.2,2.155-3.2955-1.35-2.9325.4355-1.85,1.629,1.279,1.4105,1.1365.8465,1.8865.8565A6.116,6.116,0,0,1,14.836,7.5V7.4335a2.883,2.883,0,0,1,.833-2,1.55006,1.55006,0,0,1,.365-.1745c-.096-.1745-.2-.342-.31-.509-.0185.0095-.035.022-.0545.031-.625.2915-.7115.3775-1,0a.788.788,0,0,1,.1735-1.163,7.993,7.993,0,0,0-5.83-2.6105c1.0135.014,2.223.765,1.6065,1.9645.093-.1905-2.0135-.645-2.3-.645-.386,0,.7875-1.4445.68-1.3195A8.04239,8.04239,0,0,0,5.692,1.719c.547.353,1.1555.2295,1.772.382A1.507,1.507,0,0,1,8.0135,2.327Z"/><path fill="currentColor" d="M13.5,9.05a4.45,4.45,0,1,0,4.45,4.45A4.45,4.45,0,0,0,13.5,9.05Zm-1.169,7.156-2.064-2.064a.25.25,0,0,1,0-.3535l.518-.518a.25.25,0,0,1,.3535,0L12.504,14.636l3.053-3.053a.25.25,0,0,1,.3535,0l.5215.5215a.25.25,0,0,1,0,.3535l-3.75,3.75A.25.25,0,0,1,12.331,16.206Z"/></svg>' },
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
        { label: 'Firebase database', href: 'firebase-database.html', ico: '\uD83D\uDDC4' },
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
