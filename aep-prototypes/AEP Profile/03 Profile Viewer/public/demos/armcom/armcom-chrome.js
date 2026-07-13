/**
 * Arm site chrome — arm.com header and footer.
 */
(function () {
  'use strict';

  var PRIMARY_NAV = [
    'Products',
    'Markets',
    'Partners',
    'Developers',
    'Support & Training',
    'Company',
  ];

  var FOOTER_COLS = [
    {
      title: 'Products',
      links: ['Arm AGI CPU', 'Compute Subsystems', 'CPUs', 'Development Tools'],
    },
    {
      title: 'Architecture',
      links: ['Learn the Architecture', 'CPU Architecture', 'System Architecture'],
    },
    {
      title: 'Partner Ecosystem',
      links: ['Join Partner Program', 'See All Partners', 'AI Partners'],
    },
    {
      title: 'Support & Training',
      links: ['Documentation Hub', 'Downloads', 'Contact Support', 'Training'],
    },
    {
      title: 'Company',
      links: ['Leadership', 'Investors', 'Newsroom', 'Careers'],
    },
  ];

  function assetPrefix() {
    var path = String(location.pathname || '');
    var marker = '/demos/armcom/';
    var idx = path.indexOf(marker);
    if (idx === -1) return '';
    var rest = path.slice(idx + marker.length);
    var depth = (rest.match(/\//g) || []).length;
    return depth ? '../'.repeat(depth) : '';
  }

  function resolveHref(href) {
    return assetPrefix() + href;
  }

  function logoSrc(dark) {
    var data = window.ArmcomMockData || {};
    return resolveHref(dark ? data.logoWhite || 'assets/arm-logo-white.svg' : data.logoBlack || 'assets/arm-logo-black.svg');
  }

  function isDarkHeader() {
    var body = document.body;
    if (!body) return true;
    if (body.classList.contains('armcom-site--light-header')) return false;
    if (body.classList.contains('armcom-site--home')) return true;
    var pageId = body.getAttribute('data-armcom-page-id') || '';
    return pageId === 'home' || pageId === 'cloud-ai-hub' || pageId === 'data-center-ai';
  }

  function renderHeader() {
    var dark = isDarkHeader();
    var nav = PRIMARY_NAV.map(function (label) {
      var href = '#';
      if (label === 'Markets') href = resolveHref('cloud-ai/index.html');
      if (label === 'Developers') href = resolveHref('developer/index.html');
      return '<button type="button" class="armcom-nav-item">' + label + '</button>';
    }).join('');

    return (
      '<header class="armcom-header' + (dark ? ' armcom-header--dark' : ' armcom-header--light') + '">' +
      '<div class="armcom-header-inner">' +
      '<a href="' + resolveHref('index.html') + '" class="armcom-header-logo" aria-label="Arm home">' +
      '<img src="' + logoSrc(dark) + '" alt="arm" width="98" height="30">' +
      '</a>' +
      '<nav class="armcom-header-nav" aria-label="Primary">' + nav + '</nav>' +
      '<div class="armcom-header-utils" aria-label="Utilities">' +
      '<button type="button" class="armcom-header-icon" aria-label="Search">' +
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.5"/><path d="M20 20l-3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>' +
      '</button>' +
      '<button type="button" class="armcom-header-icon" aria-label="Contact">' +
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M3 7l9 6 9-6" stroke="currentColor" stroke-width="1.5"/></svg>' +
      '</button>' +
      '<button type="button" class="armcom-header-icon" aria-label="Account">' +
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.5"/><path d="M5 20c0-3.3 3.1-6 7-6s7 2.7 7 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>' +
      '</button>' +
      '</div></div></header>'
    );
  }

  function renderFooter() {
    var cols = FOOTER_COLS.map(function (col) {
      return (
        '<div class="armcom-footer-col"><h3>' + col.title + '</h3><ul>' +
        col.links.map(function (l) { return '<li><a href="#">' + l + '</a></li>'; }).join('') +
        '</ul></div>'
      );
    }).join('');

    return (
      '<footer class="armcom-footer">' +
      '<div class="armcom-footer-inner">' +
      '<div class="armcom-footer-grid">' + cols + '</div>' +
      '<div class="armcom-footer-bottom">' +
      '<div class="armcom-footer-legal">' +
      '<a href="#">Terms of Use</a><a href="#">Privacy Policy</a><a href="#">Accessibility</a>' +
      '</div>' +
      '<img src="' + logoSrc(true) + '" alt="arm" class="armcom-footer-logo" width="72" height="22">' +
      '</div>' +
      '<p class="armcom-footer-disclaimer">Lab mockup for Adobe Experience Platform demo — not affiliated with Arm Ltd.</p>' +
      '</div></footer>'
    );
  }

  function mount() {
    var mountEl = document.getElementById('armcom-chrome-mount');
    if (!mountEl) return;
    mountEl.innerHTML = renderHeader();
    var footerWrap = document.createElement('div');
    footerWrap.innerHTML = renderFooter();
    document.body.appendChild(footerWrap.firstChild);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
