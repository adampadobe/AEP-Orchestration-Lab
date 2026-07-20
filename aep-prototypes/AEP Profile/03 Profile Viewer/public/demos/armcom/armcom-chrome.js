/**
 * Arm site chrome — arm.com header and footer.
 */
(function () {
  'use strict';

  (function redirectArmcomDirectUrlToShell() {
    if (window !== window.top) return;
    var path = String(window.location.pathname || '');
    var marker = '/demos/armcom/';
    var idx = path.toLowerCase().indexOf(marker);
    if (idx === -1) return;
    if (/armcom-demo\.html$/i.test(path) || /armcom-mobile-demo\.html$/i.test(path)) return;

    var rel = path.slice(idx + marker.length);
    if (!rel) rel = 'index.html';
    var search = window.location.search || '';
    if (search.indexOf('frame=') !== -1) return;

    var depth = (rel.match(/\//g) || []).length;
    var isMobile = /^mobile\//i.test(rel);
    var up = '../'.repeat(depth + 2);
    var shell = isMobile ? up + 'armcom-mobile-demo.html' : up + 'armcom-demo.html';
    var qs = 'frame=' + encodeURIComponent(rel.replace(/^\//, ''));
    if (search && search.length > 1) qs += '&' + search.slice(1);

    if (window.AepLabConsole) {
      window.AepLabConsole.info('env-bar', 'redirect direct armcom URL to demo shell', {
        demoPrefix: 'armcom',
        from: path,
        to: shell + '?' + qs,
        inIframe: false,
      });
    }
    window.location.replace(shell + '?' + qs);
  })();

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
      title: 'Markets',
      links: ['Cloud AI', 'Edge AI', 'Physical AI', 'Automotive', 'IoT'],
    },
    {
      title: 'Partners',
      links: ['Find a Partner', 'Partner Ecosystem', 'AI Partners', 'Approved Partners'],
    },
    {
      title: 'Developers',
      links: ['Developer Hub', 'Documentation', 'Downloads', 'Training'],
    },
    {
      title: 'Support',
      links: ['Contact Support', 'Resources', 'Community', 'Service Status'],
    },
    {
      title: 'Company',
      links: ['About Arm', 'Leadership', 'Newsroom', 'Careers', 'Sustainability'],
    },
  ];

  var SOCIAL = [
    { label: 'X', href: '#' },
    { label: 'Facebook', href: '#' },
    { label: 'LinkedIn', href: '#' },
    { label: 'YouTube', href: '#' },
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

  var MEGA_NAV = {
    Products: 'products',
    Markets: 'markets',
    Partners: 'partners',
    Developers: 'developers',
    'Support & Training': 'supportTraining',
    Company: 'company',
  };

  function renderHeader() {
    var dark = isDarkHeader();
    var nav = PRIMARY_NAV.map(function (label) {
      var megaId = MEGA_NAV[label];
      if (megaId) {
        return (
          '<button type="button" class="armcom-nav-item armcom-nav-item--mega" data-armcom-mega="' + megaId + '" aria-haspopup="true" aria-expanded="false">' +
          '<span class="armcom-nav-item__label">' + label + '</span>' +
          '<span class="armcom-nav-item__caret" aria-hidden="true"></span>' +
          '</button>'
        );
      }
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
      '<button type="button" class="armcom-header-icon" aria-label="Language">' +
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5"/><path d="M3 12h18M12 3c2.5 3 4 6 4 9s-1.5 6-4 9M12 3c-2.5 3-4 6-4 9s1.5 6 4 9" stroke="currentColor" stroke-width="1.5"/></svg>' +
      '</button>' +
      '<button type="button" class="armcom-header-icon" aria-label="Search">' +
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.5"/><path d="M20 20l-3-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>' +
      '</button>' +
      '<div class="armcom-account-anchor">' +
      '<button type="button" class="armcom-header-icon armcom-header-icon--account" id="armcomAccountBtn" aria-label="Arm Account" aria-haspopup="dialog" aria-expanded="false" aria-controls="armcomAccountPopout">' +
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.5"/><path d="M5 20c0-3.3 3.1-6 7-6s7 2.7 7 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>' +
      '</button></div>' +
      '</div></div></header>'
    );
  }

  function renderFooterNewsletter() {
    return (
      '<section class="armcom-footer-newsletter" aria-labelledby="armcom-footer-newsletter-heading">' +
      '<div class="armcom-footer-newsletter-inner">' +
      '<div class="armcom-footer-newsletter-copy">' +
      '<h2 id="armcom-footer-newsletter-heading">Stay connected on Cloud AI</h2>' +
      '<p>Subscribe for Arm Cloud AI news, case studies, and developer insights. Your work email stitches anonymous browsing into a unified B2B profile.</p>' +
      '</div>' +
      '<form id="armcomFooterNewsletterForm" class="armcom-footer-newsletter-form" novalidate>' +
      '<div class="armcom-footer-newsletter-fields">' +
      '<input type="email" name="email" required placeholder="Work email" autocomplete="email" aria-label="Work email">' +
      '<input type="text" name="company" placeholder="Company" autocomplete="organization" aria-label="Company">' +
      '<button type="submit" class="armcom-btn armcom-btn-primary" data-armcom-track="Footer newsletter">Subscribe</button>' +
      '</div>' +
      '<p class="armcom-footer-newsletter-note">Prefer the full form? <a href="' +
      resolveHref('resources/subscribe.html') +
      '">Open Marketo subscribe</a></p>' +
      '</form>' +
      '<div id="armcomFooterNewsletterSuccess" class="armcom-footer-newsletter-success" hidden role="status">' +
      '<strong>Thank you</strong> — your profile is unified across arm.com, developer.arm.com, Marketo, Salesforce, and paid social.' +
      '</div>' +
      '</div></section>'
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

    var social = SOCIAL.map(function (s) {
      return '<a href="' + s.href + '" class="armcom-footer-social-link" aria-label="' + s.label + '">' + s.label + '</a>';
    }).join('');

    return (
      '<footer class="armcom-footer">' +
      '<div class="armcom-footer-inner">' +
      '<div class="armcom-footer-top">' +
      '<div class="armcom-footer-grid">' + cols + '</div>' +
      '<div class="armcom-footer-lang">' +
      '<button type="button" class="armcom-footer-lang-btn" aria-label="Language">' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5"/><path d="M3 12h18M12 3c2.5 3 4 6 4 9s-1.5 6-4 9M12 3c-2.5 3-4 6-4 9s1.5 6 4 9" stroke="currentColor" stroke-width="1.5"/></svg>' +
      ' English</button></div></div>' +
      renderFooterNewsletter() +
      '<div class="armcom-footer-mid">' +
      '<div class="armcom-footer-social">' + social + '</div>' +
      '<div class="armcom-footer-legal">' +
      '<a href="#">Privacy Policy</a><a href="#">Terms of Use</a><a href="#">Cookies</a><a href="#">Accessibility</a>' +
      '</div></div>' +
      '<div class="armcom-footer-bottom">' +
      '<p class="armcom-footer-copy">Copyright © 2024 Arm Limited (or its affiliates). All rights reserved.</p>' +
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
