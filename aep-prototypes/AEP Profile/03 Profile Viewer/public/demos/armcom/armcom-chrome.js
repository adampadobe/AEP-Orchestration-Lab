/**
 * Arm site chrome — header, footer, nav.
 */
(function () {
  'use strict';

  var NAV = [
    { id: 'home', label: 'Home', href: 'index.html' },
    { id: 'cloud-ai', label: 'Cloud AI', href: 'cloud-ai/index.html' },
    { id: 'developer', label: 'Developer', href: 'developer/index.html' },
    { id: 'subscribe', label: 'Subscribe', href: 'resources/subscribe.html' },
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

  function currentPageId() {
    var body = document.body;
    return body && body.getAttribute('data-armcom-page-id') ? body.getAttribute('data-armcom-page-id') : 'home';
  }

  function renderHeader() {
    var pageId = currentPageId();
    var isDev = pageId === 'developer' || document.body.classList.contains('armcom-site--developer');
    var navHtml = NAV.map(function (item) {
      var active = item.id === pageId ? ' active' : '';
      return '<a href="' + resolveHref(item.href) + '" class="' + (active ? 'active' : '') + '">' + item.label + '</a>';
    }).join('');

    return (
      (isDev
        ? '<div class="armcom-dev-banner"><strong>developer.arm.com</strong> — second property in the Arm digital estate</div>'
        : '') +
      '<header class="armcom-site-header">' +
      '<div class="armcom-site-header-inner">' +
      '<a href="' +
      resolveHref('index.html') +
      '" class="armcom-logo" aria-label="Arm home">arm<span>®</span></a>' +
      '<nav class="armcom-nav" aria-label="Primary">' +
      navHtml +
      '<a href="' +
      resolveHref('resources/subscribe.html') +
      '" class="armcom-nav-cta">Stay connected</a>' +
      '</nav></div></header>'
    );
  }

  function renderFooter() {
    return (
      '<footer class="armcom-site-footer">' +
      '<div class="armcom-site-footer-inner">' +
      '<span>© Arm Limited. Lab mockup — not affiliated with Arm Ltd.</span>' +
      '<span>Adobe Experience Platform demo</span>' +
      '</div></footer>'
    );
  }

  function mount() {
    var mountEl = document.getElementById('armcom-chrome-mount');
    if (!mountEl) return;
    mountEl.innerHTML = renderHeader();
    var footer = document.createElement('div');
    footer.innerHTML = renderFooter();
    document.body.appendChild(footer.firstChild);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
