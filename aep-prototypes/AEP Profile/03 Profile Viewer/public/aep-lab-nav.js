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
  /** Same key as aep-global-sandbox.js — selected sandbox technical name */
  var LS_SANDBOX   = 'aepGlobalSandboxName';
  /** Legacy — Decisioning overview; kept in sync with navHideKey decisioningOverview in global-settings */
  var LS_HIDE_EDP  = 'aepHideDataViewerDecisioningPlayground';
  /** Per–in-development nav item: localStorage key = LS_NAV_HIDE_PREFIX + navHideKey → "1" hides from sidebar when in-dev is enabled */
  var LS_NAV_HIDE_PREFIX = 'aepNavHideInDev_';
  /** Master switch per sandbox: aepShowInDevCapabilities_<slug> === '1' shows all in-development nav (subject to per-item hides). Missing key = off. */
  var LS_SHOW_INDEV_PREFIX = 'aepShowInDevCapabilities_';

  function sandboxSlugForInDev() {
    try {
      var s = String(localStorage.getItem(LS_SANDBOX) || '').trim().toLowerCase();
      return s || '__default__';
    } catch (e) {
      return '__default__';
    }
  }

  function showInDevCapabilitiesStorageKey() {
    return LS_SHOW_INDEV_PREFIX + sandboxSlugForInDev();
  }

  function isInDevCapabilitiesEnabled() {
    try {
      return localStorage.getItem(showInDevCapabilitiesStorageKey()) === '1';
    } catch (e) {
      return false;
    }
  }

  /** Demos (donate / Race for Life): visible when in-dev capabilities are on for this sandbox, unless hidden via Global values */
  function isDemosNavVisible() {
    return isInDevCapabilitiesEnabled() && !isNavInDevHidden('demos');
  }

  /** Global values / sidebar: hide when key set (developers); legacy EDP key counts for decisioningOverview */
  function isNavInDevHidden(navHideKey) {
    if (!navHideKey) return false;
    try {
      if (localStorage.getItem(LS_NAV_HIDE_PREFIX + navHideKey) === '1') return true;
      if (navHideKey === 'decisioningOverview' && localStorage.getItem(LS_HIDE_EDP) === '1') return true;
    } catch (e) {}
    return false;
  }

  /** Sidebar: respect per-item hide (Global values); in-development items also need the per-sandbox master toggle */
  function shouldShowNavItem(item) {
    if (!isSandboxAllowedForNavItem(item)) return false;
    if (item.navHideKey && isNavInDevHidden(item.navHideKey)) return false;
    if (!item.inDevelopment) return true;
    if (!isInDevCapabilitiesEnabled()) return false;
    return true;
  }

  /** Optional per-item sandbox allow-list gate (technical names, lowercase contains match). */
  function isSandboxAllowedForNavItem(item) {
    if (!item || !item.onlySandboxContains) return true;
    var allow = Array.isArray(item.onlySandboxContains)
      ? item.onlySandboxContains
      : [item.onlySandboxContains];
    if (!allow.length) return true;
    var current = '';
    try {
      current = String(localStorage.getItem(LS_SANDBOX) || '').trim().toLowerCase();
    } catch (e) {
      current = '';
    }
    if (!current) return false;
    return allow.some(function (needle) {
      var n = String(needle || '').trim().toLowerCase();
      return !!n && current.indexOf(n) !== -1;
    });
  }

  var NAV = [
    { label: 'Home', href: 'home.html', ico: '<svg width="16" height="16" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M17.666,10.125,9.375,1.834a.53151.53151,0,0,0-.75,0L.334,10.125a.53051.53051,0,0,0,0,.75l.979.9785A.5.5,0,0,0,1.6665,12H2v4.5a.5.5,0,0,0,.5.5h4a.5.5,0,0,0,.5-.5v-5a.5.5,0,0,1,.5-.5h3a.5.5,0,0,1,.5.5v5a.5.5,0,0,0,.5.5h4a.5.5,0,0,0,.5-.5V12h.3335a.5.5,0,0,0,.3535-.1465l.979-.9785A.53051.53051,0,0,0,17.666,10.125Z"/></svg>' },
    { label: 'Global values', href: 'global-settings.html', ico: '<svg width="16" height="16" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M7.35,13.5a6.15759,6.15759,0,0,1,.204-1.55A25.07476,25.07476,0,0,0,6.168,9.7C5.1315,8.157,4.189,9.111,3.573,6.882c-.523-1.891.827-2.706.694-4.324A8.03648,8.03648,0,0,0,1,9c0,4.556,3.9715,7.271,6.777,7.866a3.44443,3.44443,0,0,0,.523.084c.015-.0385.0235-.0775.0375-.116A6.113,6.113,0,0,1,7.35,13.5Z"/><path fill="currentColor" d="M8.0135,2.327a1.85251,1.85251,0,0,0-.55-.226c-.909-.1055.44,2.3885.3885,2.057a1.15173,1.15173,0,0,1,2.2825-.0735A1.871,1.871,0,0,1,9.716,5.217c-.7055.927-.85,2.577-1.2,2.155-3.2955-1.35-2.9325.4355-1.85,1.629,1.279,1.4105,1.1365.8465,1.8865.8565A6.116,6.116,0,0,1,14.836,7.5V7.4335a2.883,2.883,0,0,1,.833-2,1.55006,1.55006,0,0,1,.365-.1745c-.096-.1745-.2-.342-.31-.509-.0185.0095-.035.022-.0545.031-.625.2915-.7115.3775-1,0a.788.788,0,0,1,.1735-1.163,7.993,7.993,0,0,0-5.83-2.6105c1.0135.014,2.223.765,1.6065,1.9645.093-.1905-2.0135-.645-2.3-.645-.386,0,.7875-1.4445.68-1.3195A8.04239,8.04239,0,0,0,5.692,1.719c.547.353,1.1555.2295,1.772.382A1.507,1.507,0,0,1,8.0135,2.327Z"/><path fill="currentColor" d="M13.5,9.05a4.45,4.45,0,1,0,4.45,4.45A4.45,4.45,0,0,0,13.5,9.05Zm-1.169,7.156-2.064-2.064a.25.25,0,0,1,0-.3535l.518-.518a.25.25,0,0,1,.3535,0L12.504,14.636l3.053-3.053a.25.25,0,0,1,.3535,0l.5215.5215a.25.25,0,0,1,0,.3535l-3.75,3.75A.25.25,0,0,1,12.331,16.206Z"/></svg>' },
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
        { label: 'Profile generation (in development)', href: 'profile-generation.html', inDevelopment: true, navHideKey: 'profileGeneration', ico: '<svg width="16" height="16" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M17.5,2H.5a.5.5,0,0,0-.5.5v13a.5.5,0,0,0,.5.5h17a.5.5,0,0,0,.5-.5V2.5A.5.5,0,0,0,17.5,2ZM17,15H15.272a4.915,4.915,0,0,0-3.815-1.987.6675.6675,0,0,1-.5775-.67v-.9665a.67047.67047,0,0,1,.17-.4315A5.10447,5.10447,0,0,0,12.211,7.759C12.211,5.3475,10.9325,4,9,4S5.75,5.4,5.75,7.7585a5.162,5.162,0,0,0,1.217,3.186.668.668,0,0,1,.1705.4315v.9625a.664.664,0,0,1-.5795.67A4.75762,4.75762,0,0,0,2.7,15H1V3H17Z"/></svg>' },
        { label: 'Event tool', href: 'event-tool.html', ico: '<svg width="16" height="16" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M16.3075,14.0675A.23049.23049,0,0,1,16.079,14.3h-.002l-4.3845.0075-3.3,3.6245A.226.226,0,0,1,8.231,18,.2305.2305,0,0,1,8,17.77V6.231A.2305.2305,0,0,1,8.23,6H8.2325a.226.226,0,0,1,.1615.068l7.8455,7.838A.22552.22552,0,0,1,16.3075,14.0675Zm-10.8145.796,1.436-2.504a.2285.2285,0,0,0-.094-.3085l-.5905-.3385a.228.228,0,0,0-.3135.075l-1.4355,2.504a.2285.2285,0,0,0,.094.3085l.59.3385A.228.228,0,0,0,5.493,14.8635ZM12.226,3.945l1.4355-2.504a.228.228,0,0,0-.0935-.3085L12.9775.794a.228.228,0,0,0-.3135.075L11.2285,3.373a.228.228,0,0,0,.0935.3085l.5905.3385A.228.228,0,0,0,12.226,3.945ZM1.9865,11.6615,4.62,10.479a.2285.2285,0,0,0,.1055-.3045l-.279-.621a.228.228,0,0,0-.2974-.12458L4.1465,9.43l-2.631,1.182a.2285.2285,0,0,0-.1055.3045l.279.621A.228.228,0,0,0,1.9865,11.6615ZM13.8535,6.557,16.487,5.375a.2285.2285,0,0,0,.1055-.3045l-.279-.6205a.228.228,0,0,0-.2974-.12458l-.0026.00108L13.38,5.5085a.2285.2285,0,0,0-.1055.3045l.279.621a.22749.22749,0,0,0,.29672.12437Zm-12.62.2855,2.825.5915A.228.228,0,0,0,4.323,7.24957V7.2495l.1395-.666a.2285.2285,0,0,0-.168-.275L1.469,5.717a.228.228,0,0,0-.26449.18443V5.9015l-.1395.666A.2285.2285,0,0,0,1.2335,6.8425ZM13.803,9.6785l2.8255.5915a.2285.2285,0,0,0,.2645-.1845l.139-.666a.22751.22751,0,0,0-.16728-.27483L16.864,9.1445,14.039,8.553a.228.228,0,0,0-.26449.18443V8.7375l-.1395.666A.2285.2285,0,0,0,13.803,9.6785ZM3.462,2.3165,5.4,4.4555a.2285.2285,0,0,0,.3225.0065l.504-.457a.229.229,0,0,0,.026-.3215l-1.938-2.139A.2285.2285,0,0,0,3.992,1.538l-.5045.457A.2285.2285,0,0,0,3.462,2.3165ZM7.7745.3195l.3105,2.87a.228.228,0,0,0,.257.194l.6765-.073a.22751.22751,0,0,0,.20957-.24412L9.228,3.0655,8.9175.196a.228.228,0,0,0-.25592-.19615L8.6605,0,7.984.0745a.22751.22751,0,0,0-.20957.24412Z"/></svg>' },
        { label: 'Webhooks', href: 'webhooks.html', ico: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" d="M10 3a7 7 0 1 0 7 7h-2a5 5 0 1 1-5-5V3z"/><path stroke="currentColor" stroke-width="1.5" stroke-linecap="round" d="M10 7v6M7 10h6"/></svg>' },
        {
          label: 'Live activities',
          href: 'live-activities.html',
          ico:
            '<svg width="16" height="16" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path fill="currentColor" d="M10.25,7.027a.247.247,0,0,0-.25.244v9.897a.247.247,0,0,0,.423.1765L13.255,14.5h4c.223,0,.2395-.363.1125-.49S10.423,7.1,10.423,7.1A.24451.24451,0,0,0,10.25,7.027Z"/><path fill="currentColor" d="M1,1V6.238A5.36747,5.36747,0,0,1,3,5.15V3H14V8.579l2,2V1Z"/><path fill="currentColor" d="M4.5,6.1835a4.125,4.125,0,0,0-4.125,4.125c0,2.278,4.125,7.4765,4.125,7.4765s4.125-5.2,4.125-7.4765A4.125,4.125,0,0,0,4.5,6.1835Zm0,5.875a1.75,1.75,0,1,1,1.75-1.75A1.75,1.75,0,0,1,4.5,12.0585Z"/></svg>',
        },
        { label: 'Brand scraper', href: 'brand-scraper.html', ico: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="7.5"/><path d="M2.5 10h15"/><path d="M10 2.5a11 11 0 0 1 0 15"/><path d="M10 2.5a11 11 0 0 0 0 15"/></svg>' },
        { label: 'Image hosting', href: 'image-hosting.html', navHideKey: 'imageHosting', ico: '<svg width="16" height="16" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M17.5,4H2.5a.5.5,0,0,0-.5.5v11a.5.5,0,0,0,.5.5h15a.5.5,0,0,0,.5-.5V4.5A.5.5,0,0,0,17.5,4ZM17,13.6865,14.364,11.05a1,1,0,0,0-1.414,0l-1.536,1.536L7.636,8.8075a1,1,0,0,0-1.414,0L3,12.0295V5H17Z"/><circle fill="currentColor" cx="14.5" cy="7.5" r="1.25"/></svg>' },
        { label: 'Real-time database', href: 'firebase-database.html', ico: '<svg width="16" height="16" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><ellipse fill="currentColor" cx="9" cy="3.5" rx="8" ry="2.5"/><path fill="currentColor" d="M13.5,9.05a4.45,4.45,0,1,0,4.45,4.45A4.45,4.45,0,0,0,13.5,9.05Zm2.45,5.2h-1.7v1.7a.25.25,0,0,1-.25.25H13a.25.25,0,0,1-.25-.25v-1.7h-1.7A.25.25,0,0,1,10.8,14V13a.25.25,0,0,1,.25-.25h1.7v-1.7A.25.25,0,0,1,13,10.8h1a.25.25,0,0,1,.25.25v1.7h1.7a.25.25,0,0,1,.25.25v1A.25.25,0,0,1,15.95,14.25Z"/><path fill="currentColor" d="M7.5,13.5a5.986,5.986,0,0,1,.1735-1.41C5.144,11.928,1.75,11.3265,1,10.135V14.5c0,1.3415,3.3845,2.433,7.629,2.494A5.96609,5.96609,0,0,1,7.5,13.5Z"/><path fill="currentColor" d="M13.5,7.5a5.962,5.962,0,0,1,3.4805,1.119A.75086.75086,0,0,0,17,8.5V5.135c-1.2235,1.55-5.532,2-8,2s-7.106-.584-8-2V8.5c0,1.281,3.0855,2.3355,7.06,2.4815A5.99452,5.99452,0,0,1,13.5,7.5Z"/></svg>' },
        { label: 'Audit events', href: 'audit-events.html', ico: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2h8l4 4v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/><path d="M12 2v4h4"/><path d="M7 10h6M7 13h4"/></svg>' },
      ],
    },
    {
      group: 'Decisioning', id: 'decisioning',
      items: [
        { label: 'Decisioning lab (in development)', href: 'content-decision-live.html', inDevelopment: true, navHideKey: 'decisioningLab', ico: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="5" height="4" rx="1"/><rect x="1" y="13" width="5" height="4" rx="1"/><rect x="14" y="8" width="5" height="4" rx="1"/><path d="M6 5h3l3 5.5"/><path d="M6 15h3l3-5"/><path d="M12 10.5h2"/><path d="M10.5 1l.5 1.2.5-1.2M11.7 1.5l-1.2.5 1.2.5" stroke-width="1.1"/></svg>' },
        { label: 'Decisioning lab (Edge)', href: 'content-decision-live-edge.html', navHideKey: 'decisioningLabEdge', ico: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="5" height="4" rx="1"/><rect x="1" y="13" width="5" height="4" rx="1"/><rect x="14" y="8" width="5" height="4" rx="1"/><path d="M6 5h3l3 5.5"/><path d="M6 15h3l3-5"/><path d="M12 10.5h2"/><path d="M10.5 1l.5 1.2.5-1.2M11.7 1.5l-1.2.5 1.2.5" stroke-width="1.1"/></svg>' },
        { label: 'Demo Delivery Concept (in development)', href: 'demo-delivery-concept.html', inDevelopment: true, navHideKey: 'demoDeliveryConcept', ico: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="16" height="10" rx="1.5"/><path d="M7 17h6"/><path d="M10 13v4"/><rect x="7" y="6" width="6" height="4" rx="0.8"/></svg>' },
        { label: 'Decisioning catalog', href: 'decisioning-catalog.html', ico: '<svg width="16" height="16" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M2.5,4.5a1,1,0,1,0,1,1A1,1,0,0,0,2.5,4.5Zm3,.5h10a.5.5,0,0,0,0-1h-10a.5.5,0,0,0,0,1Zm-3,4a1,1,0,1,0,1,1A1,1,0,0,0,2.5,9Zm3,.5h10a.5.5,0,0,0,0-1h-10a.5.5,0,0,0,0,1Zm-3,4a1,1,0,1,0,1,1A1,1,0,0,0,2.5,13.5Zm3,.5h7a.5.5,0,0,0,0-1h-7a.5.5,0,0,0,0,1Z"/></svg>' },
        { label: 'Decisioning visualiser', href: 'decisioning-visualiser.html', ico: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path fill="currentColor" d="M13.5,9A4.5,4.5,0,1,0,18,13.5,4.5,4.5,0,0,0,13.5,9Zm2.0405,4.874L12.577,17.263a.3065.3065,0,0,1-.5135-.321l1-2.3745-1.4135-.607a.5295.5295,0,0,1-.1895-.835l2.964-3.3885a.3065.3065,0,0,1,.513.321l-1,2.3745,1.4125.607a.529.529,0,0,1,.1905.8345Z"/><path fill="currentColor" d="M8,13c0,.057.012.111.017.167A5.462,5.462,0,0,1,9,10.3435V5a1,1,0,0,1,1-1h2.05a2.5,2.5,0,1,0,0-1H10A2,2,0,0,0,8,5V8H5.95a2.5,2.5,0,1,0,0,1H8ZM14.5,2A1.5,1.5,0,1,1,13,3.5,1.5,1.5,0,0,1,14.5,2Zm-11,8A1.5,1.5,0,1,1,5,8.5,1.5,1.5,0,0,1,3.5,10Z"/></svg>' },
        {
          label: 'Decisioning overview (in development)',
          href: 'experience-decisioning.html',
          inDevelopment: true,
          navHideKey: 'decisioningOverview',
          ico: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4"/><path d="M12 18v-4"/><path d="M4.93 4.93l2.83 2.83"/><path d="M12.24 12.24l2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h-4"/><path d="M4.93 19.07l2.83-2.83"/><path d="M12.24 7.76l2.83-2.83"/></svg>',
        },
        {
          label: 'Decisioning overview v2 (in development)',
          href: 'decisioning-overview-v2.html',
          inDevelopment: true,
          navHideKey: 'decisioningOverviewV2',
          ico: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4"/><path d="M12 18v-4"/><path d="M4.93 4.93l2.83 2.83"/><path d="M12.24 12.24l2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h-4"/><path d="M4.93 19.07l2.83-2.83"/><path d="M12.24 7.76l2.83-2.83"/><path d="M15 4h2v2"/></svg>',
        },
        {
          label: 'Journey arbitration (in development)',
          href: 'journey-arbitration.html',
          inDevelopment: true,
          navHideKey: 'journeyArbitration',
          ico: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h12v4H4z"/><path d="M4 12h8v4H4z"/><circle cx="15" cy="14" r="2"/></svg>',
        },
      ],
    },
    {
      group: 'Experimentation', id: 'experimentation',
      items: [
        { label: 'Experimentation visualiser (in development)', href: 'experimentation-visualiser.html', inDevelopment: true, navHideKey: 'experimentationVisualiser', ico: '<svg width="16" height="16" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path fill="currentColor" d="M6.5 2.25a.75.75 0 0 1 .75-.75h4a.75.75 0 0 1 .75.75v4.38l3.42 7.6a1.25 1.25 0 0 1-1.14 1.77H4.02a1.25 1.25 0 0 1-1.14-1.77l3.42-7.6V2.25Z"/><path fill="currentColor" fill-opacity=".35" d="M6 8.5h6l-1.2 2.67a2 2 0 0 1-1.83 1.2H9.03a2 2 0 0 1-1.83-1.2L6 8.5Z"/></svg>' },
        { label: 'Experimentation overview (in development)', href: 'experimentation-overview.html', inDevelopment: true, navHideKey: 'experimentationOverview', ico: '<svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="2.5" width="12" height="13" rx="1.5"/><path d="M6 6.5h6M6 9.5h6M6 12.5h4"/></svg>' },
        { label: 'Experimentation Accelerator', href: 'experimentation-accelerator.html', navHideKey: 'experimentationAccelerator', ico: '<svg width="16" height="16" viewBox="0 0 18 18" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M10.5 1.25 4.5 10.25h3.75L8.25 16.75 13.5 7.75H9.75L10.5 1.25Z"/></svg>' },
      ],
    },
    {
      group: 'Data Collection', id: 'dataCollection',
      items: [
        {
          label: 'Tags',
          href: 'tags.html',
          navHideKey: 'dataCollectionTags',
          ico:
            '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" d="M3 7l7-3 7 3v8l-7 3-7-3V7z"/><path stroke="currentColor" stroke-width="1.5" stroke-linecap="round" d="M3 7l7 3 7-3"/><path stroke="currentColor" stroke-width="1.5" stroke-linecap="round" d="M10 10v8"/></svg>',
        },
      ],
    },
    {
      group: 'Architecture', id: 'architecture',
      items: [
        {
          label: 'AEP & Apps (in development)',
          href: 'aep-architecture-apps.html',
          inDevelopment: true,
          navHideKey: 'aepArchitectureApps',
          ico:
            '<svg width="16" height="16" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path fill="currentColor" d="M8.7875,8.915,1.4435,5.1755c-.1205-.0615-.1205-.1615,0-.223l7.344-3.74a.47149.47149,0,0,1,.425,0L16.5565,4.95c.1205.0615.1205.1615,0,.223L9.2125,8.915A.468.468,0,0,1,8.7875,8.915Z"/><path fill="currentColor" d="M16.557,12.9525l-2.3-1.1705L9,14.459,3.742,11.782l-2.3,1.1705c-.1205.0615-.1205.1615,0,.223L8.7875,16.915a.468.468,0,0,0,.425,0l7.3445-3.7395C16.677,13.114,16.677,13.014,16.557,12.9525Z"/><path fill="currentColor" d="M16.557,8.9525l-2.3-1.1705L9,10.459,3.742,7.782l-2.3,1.1705c-.1205.0615-.1205.1615,0,.223L8.7875,12.915a.468.468,0,0,0,.425,0L16.557,9.1755C16.677,9.114,16.677,9.014,16.557,8.9525Z"/></svg>',
        },
        {
          label: 'Agentic layer',
          href: 'agentic-ai-v2.html',
          inDevelopment: true,
          navHideKey: 'agenticLayerArchitectureV2',
          ico:
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path stroke="currentColor" stroke-width="2" stroke-linejoin="round" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>',
        },
        {
          label: 'Adobe integration flow (in development)',
          href: 'architecture-end-to-end.html',
          inDevelopment: true,
          navHideKey: 'architectureEndToEnd',
          ico:
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M4 12h3l2-3 4 6 2-3h5"/></svg>',
        },
      ],
    },
    {
      group: 'Demos', id: 'demos',
      items: [
        { label: 'Donate (demo)', href: 'donate-demo.html', ico: '\uD83D\uDC9D' },
        { label: 'Race for Life (demo)', href: 'race-for-life-demo.html', ico: '\uD83C\uDFC3' },
        {
          label: 'British Army (demo)',
          href: 'mod-demo.html',
          ico:
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" d="M12 3l2 4 4.5.5-3 3 1 5L12 14l-4.5 3 1-5-3-3L10 7l2-4z"/><path stroke="currentColor" stroke-width="1.5" d="M6 21h12" opacity="0.6"/></svg>',
        },
        {
          label: 'Navigator Global (demo)',
          href: 'navigator-global-demo.html',
          ico:
            '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" d="M12 2a7 7 0 015.196 11.607l2.804 2.804a1 1 0 01-1.414 1.414l-2.804-2.804A7 7 0 1112 2z"/><circle cx="12" cy="11" r="3.5" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>',
        },
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

  /** When this page lives under _archive/firebase-hosting-legacy/, nav hrefs must step up to profile-viewer root. */
  function navHrefPrefix() {
    try {
      var p = String(window.location.pathname || '').replace(/\\/g, '/');
      if (p.indexOf('/_archive/firebase-hosting-legacy/') !== -1) return '../';
    } catch (e) {}
    return '';
  }

  /** Match nav href to current page; supports same file + hash when href includes #fragment. */
  function navItemActive(defHref, filename) {
    if (!defHref) return false;
    var parts = defHref.split('#');
    var base = parts[0] || '';
    if (filename !== base) return false;
    if (parts.length >= 2 && parts[1]) {
      return (window.location.hash || '') === '#' + parts[1];
    }
    return true;
  }

  function mk(tag, cls, attrs) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    return e;
  }

  function normalizeNavLabelText(s) {
    return String(s == null ? '' : s).replace(/\u00a0/g, ' ').trim();
  }

  function stripInDevelopmentSuffix(s) {
    return normalizeNavLabelText(s).replace(/\s+\(in development\)\s*$/i, '').trim();
  }

  /* ── Builders ── */

  function buildItem(def, filename) {
    var active = navItemActive(def.href, filename);
    var raw = normalizeNavLabelText(def.label);
    var isLiveActivities = def.href === 'live-activities.html';
    var stacked = /^(.+?)\s+\(in development\)\s*$/i.exec(raw);
    var useStacked = !!stacked && !isLiveActivities;
    var tooltipText = stripInDevelopmentSuffix(raw) || raw;
    var itemHref = def.href || '';
    if (itemHref && !/^https?:\/\//i.test(itemHref)) itemHref = navHrefPrefix() + itemHref;
    var a = mk('a', 'dashboard-nav-item' + (active ? ' dashboard-nav-item--active' : ''), {
      href: itemHref,
      'data-tooltip': tooltipText,
    });
    var ico = mk('span', 'dashboard-nav-ico', { 'aria-hidden': 'true' });
    if (def.ico && def.ico.charAt(0) === '<') { ico.innerHTML = def.ico; } else { ico.textContent = def.ico; }
    var lbl = mk('span', 'dashboard-nav-label');
    if (useStacked) {
      lbl.className += ' dashboard-nav-label--stacked';
      var primary = mk('span', 'dashboard-nav-label-primary');
      primary.textContent = stacked[1].trim();
      var dev = mk('span', 'dashboard-nav-label-dev');
      dev.textContent = '(in development)';
      lbl.appendChild(primary);
      lbl.appendChild(dev);
    } else {
      lbl.textContent = isLiveActivities ? stripInDevelopmentSuffix(raw) || raw : raw;
    }
    a.appendChild(ico);
    a.appendChild(lbl);
    return a;
  }

  function buildSubgroup(sgDef, visibleSgItems, filename, gStates) {
    if (!visibleSgItems || visibleSgItems.length === 0) return null;

    var expanded = gStates[sgDef.id] !== false;
    var wrap = mk('div', 'dashboard-nav-subgroup' + (expanded ? ' dashboard-nav-subgroup--expanded' : ''), {
      'data-subgroup': sgDef.id,
    });

    var toggle = mk('button', 'dashboard-nav-subgroup-toggle', {
      type: 'button',
      'aria-expanded': String(expanded),
      'data-tooltip': sgDef.label,
      'aria-label': (expanded ? 'Collapse ' : 'Expand ') + sgDef.label + ' section',
    });
    var chev = mk('span', 'dashboard-nav-subgroup-chevron', { 'aria-hidden': 'true' });
    var gl = mk('span', 'dashboard-nav-subgroup-label');
    gl.textContent = sgDef.label;
    toggle.appendChild(chev);
    toggle.appendChild(gl);
    wrap.appendChild(toggle);

    var sgItems = mk('div', 'dashboard-nav-subgroup-items');
    visibleSgItems.forEach(function (item) {
      sgItems.appendChild(buildItem(item, filename));
    });
    wrap.appendChild(sgItems);

    toggle.addEventListener('click', function () {
      var isExp = wrap.classList.toggle('dashboard-nav-subgroup--expanded');
      toggle.setAttribute('aria-expanded', String(isExp));
      toggle.setAttribute('aria-label', (isExp ? 'Collapse ' : 'Expand ') + sgDef.label + ' section');
      var st = getGroupStates();
      st[sgDef.id] = isExp;
      saveGroupStates(st);
    });

    return wrap;
  }

  function buildGroup(def, filename, gStates) {
    var visibleItems = [];
    (def.items || []).forEach(function (item) {
      if (shouldShowNavItem(item)) visibleItems.push(item);
    });

    var subgroupsToShow = [];
    if (def.subgroups && def.subgroups.length) {
      def.subgroups.forEach(function (sg) {
        var sgVis = [];
        sg.items.forEach(function (item) {
          if (shouldShowNavItem(item)) sgVis.push(item);
        });
        if (sgVis.length) subgroupsToShow.push({ def: sg, items: sgVis });
      });
    }

    if (visibleItems.length === 0 && subgroupsToShow.length === 0) return null;

    var expanded = gStates[def.id] !== false;
    var wrapCls =
      'dashboard-nav-group' +
      (expanded ? ' dashboard-nav-group--expanded' : '') +
      (subgroupsToShow.length ? ' dashboard-nav-group--has-subgroups' : '');
    var wrap = mk('div', wrapCls, {
      'data-group': def.id,
    });

    var toggle = mk('button', 'dashboard-nav-group-toggle', {
      type: 'button',
      'aria-expanded': String(expanded),
      'data-tooltip': def.group,
      'aria-label': (expanded ? 'Collapse ' : 'Expand ') + def.group + ' section',
    });
    var chev = mk('span', 'dashboard-nav-group-chevron', { 'aria-hidden': 'true' });
    var gl = mk('span', 'dashboard-nav-group-label');
    gl.textContent = def.group;
    toggle.appendChild(chev);
    toggle.appendChild(gl);
    wrap.appendChild(toggle);

    var items = mk('div', 'dashboard-nav-group-items');
    visibleItems.forEach(function (item) {
      items.appendChild(buildItem(item, filename));
    });
    subgroupsToShow.forEach(function (sg) {
      var sub = buildSubgroup(sg.def, sg.items, filename, gStates);
      if (sub) items.appendChild(sub);
    });
    wrap.appendChild(items);

    toggle.addEventListener('click', function () {
      var isExp = wrap.classList.toggle('dashboard-nav-group--expanded');
      toggle.setAttribute('aria-expanded', String(isExp));
      toggle.setAttribute('aria-label', (isExp ? 'Collapse ' : 'Expand ') + def.group + ' section');
      var st = getGroupStates();
      st[def.id] = isExp;
      saveGroupStates(st);
    });

    return wrap;
  }

  /* ── Tooltip (fixed-position element on <body>) ── */

  function sidebarIsIconOnly(sidebar) {
    return sidebar.classList.contains('dashboard-sidebar--collapsed') ||
      document.documentElement.hasAttribute('data-sidebar-collapsed');
  }

  function tooltipTarget(el) {
    if (!el || typeof el.closest !== 'function') return null;
    return el.closest('.dashboard-nav-item[data-tooltip]') ||
      el.closest('.dashboard-nav-group-toggle[data-tooltip]') ||
      el.closest('.dashboard-nav-subgroup-toggle[data-tooltip]');
  }

  function setupTooltips(sidebar) {
    var tip = mk('div', 'dashboard-nav-tooltip');
    document.body.appendChild(tip);

    sidebar.addEventListener('mouseover', function (e) {
      if (!sidebarIsIconOnly(sidebar)) {
        tip.classList.remove('dashboard-nav-tooltip--visible');
        return;
      }
      var el = tooltipTarget(e.target);
      if (!el) { tip.classList.remove('dashboard-nav-tooltip--visible'); return; }
      tip.textContent = el.getAttribute('data-tooltip');
      var r = el.getBoundingClientRect();
      tip.style.top = (r.top + r.height / 2) + 'px';
      tip.style.left = (r.right + 8) + 'px';
      tip.classList.add('dashboard-nav-tooltip--visible');
    });

    sidebar.addEventListener('mouseout', function (e) {
      var rel = e.relatedTarget;
      if (tooltipTarget(rel)) return;
      tip.classList.remove('dashboard-nav-tooltip--visible');
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
    markEl.innerHTML =
      '<img class="dashboard-sidebar-mark-img" src="images/adobe-brand-mark.png" alt="" width="32" height="32" decoding="async" draggable="false" />';
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
    toggleIco.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" focusable="false">' +
      '<rect fill="currentColor" height="2" rx="0.5" width="14" x="2" y="8"/>' +
      '<rect fill="currentColor" height="2" rx="0.5" width="14" x="2" y="3"/>' +
      '<rect fill="currentColor" height="2" rx="0.5" width="14" x="2" y="13"/></svg>';
    toggleBtn.appendChild(toggleIco);

    header.appendChild(brand);
    header.appendChild(toggleBtn);
    sidebar.appendChild(header);

    /* Navigation */
    var nav = mk('nav', 'dashboard-sidebar-nav');
    NAV.forEach(function (entry) {
      if (entry.id === 'demos' && !isDemosNavVisible()) return;
      if (entry.group) {
        var grp = buildGroup(entry, filename, gStates);
        if (grp) nav.appendChild(grp);
      } else {
        nav.appendChild(buildItem(entry, filename));
      }
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

  window.addEventListener('aep-global-sandbox-change', function () {
    document.querySelectorAll('.dashboard-sidebar').forEach(buildSidebar);
  });

  window.addEventListener('aep-edp-visibility-change', function () {
    document.querySelectorAll('.dashboard-sidebar').forEach(buildSidebar);
  });

  window.addEventListener('aep-nav-indev-visibility-change', function () {
    document.querySelectorAll('.dashboard-sidebar').forEach(buildSidebar);
  });

  try {
    window.addEventListener('storage', function (e) {
      if (!e.key) return;
      if (
        e.key.indexOf(LS_NAV_HIDE_PREFIX) === 0 ||
        e.key.indexOf(LS_SHOW_INDEV_PREFIX) === 0 ||
        e.key === LS_HIDE_EDP ||
        e.key === LS_SANDBOX
      ) {
        document.querySelectorAll('.dashboard-sidebar').forEach(buildSidebar);
      }
    });
  } catch (e2) {}

  try {
    window.AepNavInDev = {
      LS_PREFIX: LS_NAV_HIDE_PREFIX,
      LEGACY_EDP: LS_HIDE_EDP,
      LS_SHOW_INDEV_PREFIX: LS_SHOW_INDEV_PREFIX,
      sandboxSlugForInDev: sandboxSlugForInDev,
      showInDevCapabilitiesStorageKey: showInDevCapabilitiesStorageKey,
      isInDevCapabilitiesEnabled: isInDevCapabilitiesEnabled,
      isNavInDevHidden: isNavInDevHidden,
      /** True if this in-development link should appear in the sidebar / home quick paths */
      shouldShowMenuItem: function (navHideKey) {
        if (!navHideKey) return true;
        if (!isInDevCapabilitiesEnabled()) return false;
        return !isNavInDevHidden(navHideKey);
      },
      /** Demos group (Donate / Race for Life): when in-dev capabilities are on, unless hidden in Global values */
      shouldShowDemosMenu: function () {
        return isDemosNavVisible();
      },
    };
  } catch (e3) {}
})();
