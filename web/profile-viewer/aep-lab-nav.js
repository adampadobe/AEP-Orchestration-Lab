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
        { label: 'Profile generation (in development)', href: 'profile-generation.html', ico: '<svg width="16" height="16" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M17.5,2H.5a.5.5,0,0,0-.5.5v13a.5.5,0,0,0,.5.5h17a.5.5,0,0,0,.5-.5V2.5A.5.5,0,0,0,17.5,2ZM17,15H15.272a4.915,4.915,0,0,0-3.815-1.987.6675.6675,0,0,1-.5775-.67v-.9665a.67047.67047,0,0,1,.17-.4315A5.10447,5.10447,0,0,0,12.211,7.759C12.211,5.3475,10.9325,4,9,4S5.75,5.4,5.75,7.7585a5.162,5.162,0,0,0,1.217,3.186.668.668,0,0,1,.1705.4315v.9625a.664.664,0,0,1-.5795.67A4.75762,4.75762,0,0,0,2.7,15H1V3H17Z"/></svg>' },
        { label: 'Event tool', href: 'event-tool.html', ico: '<svg width="16" height="16" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M16.3075,14.0675A.23049.23049,0,0,1,16.079,14.3h-.002l-4.3845.0075-3.3,3.6245A.226.226,0,0,1,8.231,18,.2305.2305,0,0,1,8,17.77V6.231A.2305.2305,0,0,1,8.23,6H8.2325a.226.226,0,0,1,.1615.068l7.8455,7.838A.22552.22552,0,0,1,16.3075,14.0675Zm-10.8145.796,1.436-2.504a.2285.2285,0,0,0-.094-.3085l-.5905-.3385a.228.228,0,0,0-.3135.075l-1.4355,2.504a.2285.2285,0,0,0,.094.3085l.59.3385A.228.228,0,0,0,5.493,14.8635ZM12.226,3.945l1.4355-2.504a.228.228,0,0,0-.0935-.3085L12.9775.794a.228.228,0,0,0-.3135.075L11.2285,3.373a.228.228,0,0,0,.0935.3085l.5905.3385A.228.228,0,0,0,12.226,3.945ZM1.9865,11.6615,4.62,10.479a.2285.2285,0,0,0,.1055-.3045l-.279-.621a.228.228,0,0,0-.2974-.12458L4.1465,9.43l-2.631,1.182a.2285.2285,0,0,0-.1055.3045l.279.621A.228.228,0,0,0,1.9865,11.6615ZM13.8535,6.557,16.487,5.375a.2285.2285,0,0,0,.1055-.3045l-.279-.6205a.228.228,0,0,0-.2974-.12458l-.0026.00108L13.38,5.5085a.2285.2285,0,0,0-.1055.3045l.279.621a.22749.22749,0,0,0,.29672.12437Zm-12.62.2855,2.825.5915A.228.228,0,0,0,4.323,7.24957V7.2495l.1395-.666a.2285.2285,0,0,0-.168-.275L1.469,5.717a.228.228,0,0,0-.26449.18443V5.9015l-.1395.666A.2285.2285,0,0,0,1.2335,6.8425ZM13.803,9.6785l2.8255.5915a.2285.2285,0,0,0,.2645-.1845l.139-.666a.22751.22751,0,0,0-.16728-.27483L16.864,9.1445,14.039,8.553a.228.228,0,0,0-.26449.18443V8.7375l-.1395.666A.2285.2285,0,0,0,13.803,9.6785ZM3.462,2.3165,5.4,4.4555a.2285.2285,0,0,0,.3225.0065l.504-.457a.229.229,0,0,0,.026-.3215l-1.938-2.139A.2285.2285,0,0,0,3.992,1.538l-.5045.457A.2285.2285,0,0,0,3.462,2.3165ZM7.7745.3195l.3105,2.87a.228.228,0,0,0,.257.194l.6765-.073a.22751.22751,0,0,0,.20957-.24412L9.228,3.0655,8.9175.196a.228.228,0,0,0-.25592-.19615L8.6605,0,7.984.0745a.22751.22751,0,0,0-.20957.24412Z"/></svg>' },
        { label: 'Live activities', href: 'live-activities.html', ico: '<svg width="16" height="16" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M9 1.5a6.5 6.5 0 0 1 6.5 6.5c0 2.1-1 3.95-2.55 5.1L12.5 16.5h-7l-.45-3.4A6.48 6.48 0 0 1 2.5 8 6.5 6.5 0 0 1 9 1.5Zm0 1.5a5 5 0 1 0 5 5c0 1.65-.8 3.1-2 4l-.35 2.65h-5.3L6 12.1A4.98 4.98 0 0 1 4 8a5 5 0 0 1 5-5Zm-.75 2.25v3.5l2.5 1.5-.75 1.25L7 8.6V5Z"/></svg>' },
        { label: 'Firebase images (in development)', href: 'firebase-hosting.html', ico: '<svg width="16" height="16" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M16,2.5a.534.534,0,0,0-.5625-.5H.5625A.534.534,0,0,0,0,2.5v11a.534.534,0,0,0,.5625.5H1V3H16Z"/><path fill="currentColor" d="M17.5,4H2.5a.5.5,0,0,0-.5.5v11a.5.5,0,0,0,.5.5h15a.5.5,0,0,0,.5-.5V4.5A.5.5,0,0,0,17.5,4ZM17,13.6865,14.364,11.05a1,1,0,0,0-1.414,0l-1.536,1.536L7.636,8.8075a1,1,0,0,0-1.414,0L3,12.0295V5H17Z"/><circle fill="currentColor" cx="14.5" cy="7.5" r="1.25"/></svg>' },
        { label: 'Firebase database', href: 'firebase-database.html', ico: '<svg width="16" height="16" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><ellipse fill="currentColor" cx="9" cy="3.5" rx="8" ry="2.5"/><path fill="currentColor" d="M13.5,9.05a4.45,4.45,0,1,0,4.45,4.45A4.45,4.45,0,0,0,13.5,9.05Zm2.45,5.2h-1.7v1.7a.25.25,0,0,1-.25.25H13a.25.25,0,0,1-.25-.25v-1.7h-1.7A.25.25,0,0,1,10.8,14V13a.25.25,0,0,1,.25-.25h1.7v-1.7A.25.25,0,0,1,13,10.8h1a.25.25,0,0,1,.25.25v1.7h1.7a.25.25,0,0,1,.25.25v1A.25.25,0,0,1,15.95,14.25Z"/><path fill="currentColor" d="M7.5,13.5a5.986,5.986,0,0,1,.1735-1.41C5.144,11.928,1.75,11.3265,1,10.135V14.5c0,1.3415,3.3845,2.433,7.629,2.494A5.96609,5.96609,0,0,1,7.5,13.5Z"/><path fill="currentColor" d="M13.5,7.5a5.962,5.962,0,0,1,3.4805,1.119A.75086.75086,0,0,0,17,8.5V5.135c-1.2235,1.55-5.532,2-8,2s-7.106-.584-8-2V8.5c0,1.281,3.0855,2.3355,7.06,2.4815A5.99452,5.99452,0,0,1,13.5,7.5Z"/></svg>' },
        { label: 'Audit events', href: 'audit-events.html', ico: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2h8l4 4v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/><path d="M12 2v4h4"/><path d="M7 10h6M7 13h4"/></svg>' },
      ],
    },
    {
      group: 'Decisioning', id: 'decisioning',
      items: [
        { label: 'Decisioning lab', href: 'content-decision-live.html', ico: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="3" width="5" height="4" rx="1"/><rect x="1" y="13" width="5" height="4" rx="1"/><rect x="14" y="8" width="5" height="4" rx="1"/><path d="M6 5h3l3 5.5"/><path d="M6 15h3l3-5"/><path d="M12 10.5h2"/><path d="M10.5 1l.5 1.2.5-1.2M11.7 1.5l-1.2.5 1.2.5" stroke-width="1.1"/></svg>' },
        { label: 'Decisioning catalog', href: 'decisioning-catalog.html', ico: '<svg width="16" height="16" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M2.5,4.5a1,1,0,1,0,1,1A1,1,0,0,0,2.5,4.5Zm3,.5h10a.5.5,0,0,0,0-1h-10a.5.5,0,0,0,0,1Zm-3,4a1,1,0,1,0,1,1A1,1,0,0,0,2.5,9Zm3,.5h10a.5.5,0,0,0,0-1h-10a.5.5,0,0,0,0,1Zm-3,4a1,1,0,1,0,1,1A1,1,0,0,0,2.5,13.5Zm3,.5h7a.5.5,0,0,0,0-1h-7a.5.5,0,0,0,0,1Z"/></svg>' },
        { label: 'Decisioning visualiser', href: 'decisioning-visualiser.html', ico: '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path fill="currentColor" d="M13.5,9A4.5,4.5,0,1,0,18,13.5,4.5,4.5,0,0,0,13.5,9Zm2.0405,4.874L12.577,17.263a.3065.3065,0,0,1-.5135-.321l1-2.3745-1.4135-.607a.5295.5295,0,0,1-.1895-.835l2.964-3.3885a.3065.3065,0,0,1,.513.321l-1,2.3745,1.4125.607a.529.529,0,0,1,.1905.8345Z"/><path fill="currentColor" d="M8,13c0,.057.012.111.017.167A5.462,5.462,0,0,1,9,10.3435V5a1,1,0,0,1,1-1h2.05a2.5,2.5,0,1,0,0-1H10A2,2,0,0,0,8,5V8H5.95a2.5,2.5,0,1,0,0,1H8ZM14.5,2A1.5,1.5,0,1,1,13,3.5,1.5,1.5,0,0,1,14.5,2Zm-11,8A1.5,1.5,0,1,1,5,8.5,1.5,1.5,0,0,1,3.5,10Z"/></svg>' },
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

  /* ── Builders ── */

  function buildItem(def, filename) {
    var active = navItemActive(def.href, filename);
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
    def.items.forEach(function (item) { items.appendChild(buildItem(item, filename)); });
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
      el.closest('.dashboard-nav-group-toggle[data-tooltip]');
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
