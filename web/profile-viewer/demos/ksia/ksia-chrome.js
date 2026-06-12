/**
 * KSIA site chrome — sidebar nav with flyout (Etihad pattern), breadcrumbs, footer.
 */
(function () {
  'use strict';

  var ICONS = {
    home: '\u2302',
    info: '\u2139',
    flight: '\u2708',
    airport: '\u2693',
    transport: '\u26FD',
    shop: '\u2615',
    aivc: '\u2728',
    media: '\u25B6',
    contact: '\u2709',
  };

  function assetPrefix() {
    var path = String(location.pathname || '');
    var marker = '/demos/ksia/';
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
    return body && body.getAttribute('data-ksia-page-id') ? body.getAttribute('data-ksia-page-id') : 'home';
  }

  function navIcon(item) {
    var map = {
      home: 'home',
      about: 'info',
      flights: 'flight',
      'at-the-airport': 'airport',
      transport: 'transport',
      'shop-dine': 'shop',
      aivc: 'aivc',
      media: 'media',
      contact: 'contact',
    };
    return ICONS[map[item.id] || 'info'] || '\u2022';
  }

  function currentNavSection() {
    var body = document.body;
    if (body && body.getAttribute('data-ksia-nav-section')) {
      return body.getAttribute('data-ksia-nav-section');
    }
    var pageId = currentPageId();
    if (pageId === 'home') return 'home';
    if (pageId.indexOf('flights') === 0) return 'flights';
    if (pageId.indexOf('at-the-airport') === 0 || pageId.indexOf('terminal') === 0 || pageId === 'maps' || pageId === 'security' || pageId.indexOf('services') === 0 || pageId === 'lounges' || pageId === 'special-assistance') {
      return 'at-the-airport';
    }
    if (pageId.indexOf('transport') === 0 || pageId === 'parking' || pageId === 'drop-off' || pageId === 'public-transport') return 'transport';
    if (pageId.indexOf('shop-dine') === 0 || pageId === 'duty-free' || pageId === 'restaurants') return 'shop-dine';
    if (pageId.indexOf('aivc') === 0 || pageId === 'wallet-setup' || pageId === 'disruption-compensation') return 'aivc';
    return pageId;
  }

  function isNavActive(item) {
    var pageId = currentPageId();
    var section = currentNavSection();
    if (item.id === 'home' && pageId === 'home') return true;
    if (item.section && item.section === section) return true;
    if (item.id === section) return true;
    if (pageId === item.id) return true;
    return false;
  }

  function renderSidebar(nav) {
    var html =
      '<aside id="ksiaSidebar" class="ksia-sidebar">' +
      '<button type="button" class="ksia-sidebar-collapse" id="ksiaSidebarCollapse" aria-label="Collapse navigation">\u2039</button>' +
      '<div class="ksia-sidebar-logo">' +
      '<a href="' +
      resolveHref('index.html') +
      '" class="ksia-logo-link">' +
      '<span class="ksia-logo-mark" aria-hidden="true">KSIA</span>' +
      '<span class="ksia-logo-text">King Salman<br>International Airport</span>' +
      '</a></div>' +
      '<hr class="ksia-sidebar-divider">' +
      '<nav class="ksia-sidebar-nav" aria-label="Site sections">';

    nav.forEach(function (item) {
      var active = isNavActive(item) ? ' active' : '';
      var hasFlyout = item.children && item.children.length ? ' data-ksia-flyout="' + item.id + '"' : '';
      html +=
        '<a href="' +
        resolveHref(item.href) +
        '" class="ksia-nav-item' +
        active +
        '"' +
        hasFlyout +
        ' data-ksia-nav-id="' +
        item.id +
        '">' +
        '<span class="ksia-nav-icon" aria-hidden="true">' +
        navIcon(item) +
        '</span>' +
        '<span class="ksia-nav-label">' +
        item.label +
        '</span></a>';
    });

    html += '</nav></aside>';
    return html;
  }

  function renderFlyout() {
    return (
      '<div id="ksiaNavFlyout" class="ksia-nav-flyout" role="menu" aria-hidden="true">' +
      '<div class="ksia-nav-flyout-title" id="ksiaNavFlyoutTitle"></div>' +
      '<div id="ksiaNavFlyoutItems"></div></div>'
    );
  }

  function renderBreadcrumbs(meta) {
    if (!meta || !meta.heading) return '';
    var crumbs = meta.breadcrumbs || [];
    if (!crumbs.length) {
      return '<nav class="ksia-breadcrumbs" aria-label="Breadcrumb"><span>' + meta.heading + '</span></nav>';
    }
    var html = '<nav class="ksia-breadcrumbs" aria-label="Breadcrumb">';
    crumbs.forEach(function (c, i) {
      if (i > 0) html += '<span class="ksia-bc-sep">/</span>';
      if (c.href && i < crumbs.length - 1) {
        html += '<a href="' + resolveHref(c.href) + '">' + c.label + '</a>';
      } else {
        html += '<span>' + c.label + '</span>';
      }
    });
    html += '</nav>';
    return html;
  }

  function renderFooter() {
    return (
      '<footer class="ksia-footer">' +
      '<div class="ksia-footer-inner">' +
      '<p class="ksia-footer-brand">King Salman International Airport</p>' +
      '<p class="ksia-footer-tag">Vision 2030 — Saudi Arabia\'s gateway to the world</p>' +
      '<p class="ksia-footer-demo">Adobe Experience Platform lab mockup — not affiliated with KSIA.</p>' +
      '</div></footer>'
    );
  }

  function wireFlyout(nav) {
    var flyout = document.getElementById('ksiaNavFlyout');
    var titleEl = document.getElementById('ksiaNavFlyoutTitle');
    var itemsEl = document.getElementById('ksiaNavFlyoutItems');
    var sidebar = document.getElementById('ksiaSidebar');
    if (!flyout || !sidebar) return;

    var hideTimer = null;

    function showFlyout(item, anchorRect) {
      if (!item.children || !item.children.length) return;
      titleEl.textContent = item.label;
      itemsEl.innerHTML = item.children
        .map(function (child) {
          return (
            '<a href="' +
            resolveHref(child.href) +
            '" role="menuitem">' +
            child.label +
            '</a>'
          );
        })
        .join('');
      flyout.style.top = Math.max(0, anchorRect.top) + 'px';
      flyout.classList.add('open');
      flyout.setAttribute('aria-hidden', 'false');
    }

    function hideFlyout() {
      flyout.classList.remove('open');
      flyout.setAttribute('aria-hidden', 'true');
    }

    sidebar.querySelectorAll('[data-ksia-flyout]').forEach(function (el) {
      var navId = el.getAttribute('data-ksia-flyout');
      var item = nav.find(function (n) {
        return n.id === navId;
      });
      if (!item) return;

      el.addEventListener('mouseenter', function () {
        if (hideTimer) clearTimeout(hideTimer);
        showFlyout(item, el.getBoundingClientRect());
      });
      el.addEventListener('focus', function () {
        showFlyout(item, el.getBoundingClientRect());
      });
    });

    flyout.addEventListener('mouseenter', function () {
      if (hideTimer) clearTimeout(hideTimer);
    });
    flyout.addEventListener('mouseleave', hideFlyout);
    sidebar.addEventListener('mouseleave', function () {
      hideTimer = setTimeout(hideFlyout, 200);
    });
  }

  function wireSidebarCollapse() {
    var btn = document.getElementById('ksiaSidebarCollapse');
    var sidebar = document.getElementById('ksiaSidebar');
    if (!btn || !sidebar) return;
    btn.addEventListener('click', function () {
      sidebar.classList.toggle('collapsed');
      btn.textContent = sidebar.classList.contains('collapsed') ? '\u203A' : '\u2039';
    });
  }

  function mount() {
    var mount = document.getElementById('ksia-chrome-mount');
    if (!mount || !window.KsiaMockData) return;

    var nav = window.KsiaMockData.NAV;
    var pageId = currentPageId();
    var meta = window.KsiaMockData.PAGE_META[pageId] || null;

    mount.innerHTML = renderSidebar(nav) + renderFlyout();

    var main = document.getElementById('ksia-main');
    if (main) {
      if (meta && meta.heading) {
        main.insertAdjacentHTML('afterbegin', renderBreadcrumbs(meta));
      }
      main.insertAdjacentHTML('afterend', renderFooter());
    }

    wireFlyout(nav);
    wireSidebarCollapse();

    if (window.KsiaLabEvents && typeof window.KsiaLabEvents.emitPageView === 'function') {
      window.KsiaLabEvents.emitPageView(pageId, meta && meta.section ? meta.section : pageId.split('-')[0]);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  window.KsiaChrome = { assetPrefix: assetPrefix, resolveHref: resolveHref };
})();
