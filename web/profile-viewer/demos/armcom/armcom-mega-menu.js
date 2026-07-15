/**
 * Arm.com mega-menu — click-to-open nav dropdowns with left rail + right panel.
 */
(function () {
  'use strict';

  var MEGA_IDS = ['products', 'markets', 'partners', 'developers', 'supportTraining', 'company'];
  var openMenuId = null;
  var activeCategory = {};

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
    if (!href || href === '#') return '#';
    return assetPrefix() + href;
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function trackNavClick(link) {
    if (!link) return;
    var events = window.ArmcomEvents;
    if (!events || typeof events.sendContentClick !== 'function') return;
    var extra = {
      navSection: link.track || link.label,
      href: link.href || '',
    };
    if (link.topic) extra.topic = link.topic;
    if (link.intent) extra.intentLevel = link.intent;
    events.sendContentClick(link.track || link.label, extra);
    if (link.topic === 'cloud-ai' && typeof events.sendContentInterest === 'function') {
      events.sendContentInterest(link.track || link.label, extra);
    }
  }

  function renderLink(link) {
    var href = resolveHref(link.href);
    return (
      '<a href="' + escapeHtml(href) + '" class="armcom-mega-link" data-armcom-nav-href="' + escapeHtml(link.href) + '" data-armcom-nav-track="' + escapeHtml(link.track || link.label) + '"' +
      (link.topic ? ' data-armcom-nav-topic="' + escapeHtml(link.topic) + '"' : '') +
      (link.intent ? ' data-armcom-nav-intent="' + escapeHtml(link.intent) + '"' : '') +
      '>' +
      '<span class="armcom-mega-link__title">' + escapeHtml(link.label) + ' <span class="armcom-mega-arrow" aria-hidden="true">→</span></span>' +
      (link.description ? '<span class="armcom-mega-link__desc">' + escapeHtml(link.description) + '</span>' : '') +
      '</a>'
    );
  }

  function renderFeatured(featured) {
    if (!featured) return '';
    var href = resolveHref(featured.href);
    var img = featured.image
      ? '<img src="' + escapeHtml(resolveHref(featured.image)) + '" alt="' + escapeHtml(featured.imageAlt || '') + '" class="armcom-mega-featured__img">'
      : '<div class="armcom-mega-featured__brand">' + escapeHtml(featured.brand || '') + '</div>';
    return (
      '<a href="' + escapeHtml(href) + '" class="armcom-mega-featured" data-armcom-nav-href="' + escapeHtml(featured.href) + '" data-armcom-nav-track="' + escapeHtml(featured.track || featured.label) + '"' +
      (featured.topic ? ' data-armcom-nav-topic="' + escapeHtml(featured.topic) + '"' : '') +
      (featured.intent ? ' data-armcom-nav-intent="' + escapeHtml(featured.intent) + '"' : '') +
      '>' +
      img +
      '<span class="armcom-mega-featured__title">' + escapeHtml(featured.label) + ' <span class="armcom-mega-arrow" aria-hidden="true">→</span></span>' +
      (featured.description ? '<span class="armcom-mega-featured__desc">' + escapeHtml(featured.description) + '</span>' : '') +
      '</a>'
    );
  }

  function renderPanel(menu, category) {
    if (!category) return '';
    var titleHref = category.titleHref ? resolveHref(category.titleHref) : '';
    var titleHtml = category.title
      ? (titleHref
        ? '<a href="' + escapeHtml(titleHref) + '" class="armcom-mega-panel__title" data-armcom-nav-href="' + escapeHtml(category.titleHref) + '" data-armcom-nav-track="Nav — ' + escapeHtml(category.title) + '">' + escapeHtml(category.title) + ' <span class="armcom-mega-arrow" aria-hidden="true">→</span></a>'
        : '<h3 class="armcom-mega-panel__title armcom-mega-panel__title--static">' + escapeHtml(category.title) + ' <span class="armcom-mega-arrow" aria-hidden="true">→</span></h3>')
      : '';
    var links = (category.links || []).map(renderLink).join('');
    var imageHtml = category.image
      ? '<div class="armcom-mega-panel__image"><img src="' + escapeHtml(resolveHref(category.image)) + '" alt="' + escapeHtml(category.imageAlt || '') + '"></div>'
      : '';
    var featuredHtml = category.featured ? renderFeatured(category.featured) : '';
    var layoutClass = featuredHtml ? ' armcom-mega-panel__body--featured' : imageHtml ? ' armcom-mega-panel__body--image' : '';

    return (
      '<div class="armcom-mega-panel" data-armcom-panel="' + escapeHtml(category.id) + '" role="region" aria-label="' + escapeHtml(category.label) + '">' +
      '<div class="armcom-mega-panel__header">' + titleHtml +
      (category.description ? '<p class="armcom-mega-panel__desc">' + escapeHtml(category.description) + '</p>' : '') +
      '</div>' +
      '<div class="armcom-mega-panel__body' + layoutClass + '">' +
      '<div class="armcom-mega-panel__links">' + links + '</div>' +
      imageHtml + featuredHtml +
      '</div></div>'
    );
  }

  function renderRailItem(menuId, cat, isActive) {
    return (
      '<button type="button" class="armcom-mega-rail__item' + (isActive ? ' is-active' : '') + '" data-armcom-rail="' + escapeHtml(cat.id) + '" data-armcom-menu="' + escapeHtml(menuId) + '" aria-current="' + (isActive ? 'true' : 'false') + '">' +
      '<span class="armcom-mega-rail__icon">' + cat.icon + '</span>' +
      '<span class="armcom-mega-rail__label">' + escapeHtml(cat.label) + '</span>' +
      '</button>'
    );
  }

  function renderMenu(menu) {
    if (!menu || !menu.categories || !menu.categories.length) return '';
    var activeId = activeCategory[menu.id] || menu.categories[0].id;
    var rail = menu.categories.map(function (cat) {
      return renderRailItem(menu.id, cat, cat.id === activeId);
    }).join('');
    var panels = menu.categories.map(function (cat) {
      var hiddenAttr = cat.id !== activeId ? ' hidden' : '';
      return '<div class="armcom-mega-panels__item"' + hiddenAttr + ' data-armcom-panel-wrap="' + escapeHtml(cat.id) + '">' + renderPanel(menu, cat) + '</div>';
    }).join('');
    var footer = menu.footer
      ? '<div class="armcom-mega-menu__footer"><a href="' + escapeHtml(resolveHref(menu.footer.href)) + '" class="armcom-mega-footer-link" data-armcom-nav-href="' + escapeHtml(menu.footer.href) + '" data-armcom-nav-track="' + escapeHtml(menu.footer.track || menu.footer.label) + '">' + escapeHtml(menu.footer.label) + ' <span class="armcom-mega-arrow" aria-hidden="true">→</span></a></div>'
      : '';

    return (
      '<div class="armcom-mega-menu" id="armcomMega-' + escapeHtml(menu.id) + '" data-armcom-mega-menu="' + escapeHtml(menu.id) + '" role="dialog" aria-label="' + escapeHtml(menu.label) + ' menu" hidden>' +
      '<div class="armcom-mega-menu__inner">' +
      '<div class="armcom-mega-rail">' +
      '<p class="armcom-mega-rail__heading">' + escapeHtml(menu.railLabel || menu.label.toUpperCase()) + '</p>' +
      '<div class="armcom-mega-rail__list" role="tablist">' + rail + '</div>' +
      footer +
      '</div>' +
      '<div class="armcom-mega-panels">' + panels + '</div>' +
      '</div></div>'
    );
  }

  function renderAllMenus() {
    var data = window.ArmcomNavData || {};
    return MEGA_IDS.map(function (id) {
      return renderMenu(data[id]);
    }).join('');
  }

  function setActiveCategory(menuId, categoryId) {
    activeCategory[menuId] = categoryId;
    var menuEl = document.getElementById('armcomMega-' + menuId);
    if (!menuEl) return;
    menuEl.querySelectorAll('.armcom-mega-rail__item').forEach(function (btn) {
      var active = btn.getAttribute('data-armcom-rail') === categoryId;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-current', active ? 'true' : 'false');
    });
    menuEl.querySelectorAll('[data-armcom-panel-wrap]').forEach(function (wrap) {
      var show = wrap.getAttribute('data-armcom-panel-wrap') === categoryId;
      wrap.hidden = !show;
    });
  }

  function closeAll() {
    openMenuId = null;
    document.querySelectorAll('[data-armcom-mega-menu]').forEach(function (el) {
      el.hidden = true;
    });
    document.querySelectorAll('[data-armcom-mega]').forEach(function (btn) {
      btn.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
    });
    var backdrop = document.getElementById('armcomMegaBackdrop');
    if (backdrop) backdrop.hidden = true;
    document.body.classList.remove('armcom-mega-open');
  }

  function openMenu(menuId, trigger) {
    if (openMenuId === menuId) {
      closeAll();
      return;
    }
    closeAll();
    openMenuId = menuId;
    var menuEl = document.getElementById('armcomMega-' + menuId);
    if (menuEl) menuEl.hidden = false;
    var data = window.ArmcomNavData || {};
    var menu = data[menuId];
    if (menu && menu.categories && menu.categories.length) {
      setActiveCategory(menuId, menu.categories[0].id);
    }
    if (trigger) {
      trigger.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
    }
    var backdrop = document.getElementById('armcomMegaBackdrop');
    if (backdrop) backdrop.hidden = false;
    document.body.classList.add('armcom-mega-open');
  }

  function wireNavLinks(root) {
    root.querySelectorAll('[data-armcom-nav-href]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        var href = el.getAttribute('data-armcom-nav-href');
        if (!href || href === '#') {
          e.preventDefault();
          return;
        }
        trackNavClick({
          label: el.textContent.trim(),
          href: href,
          track: el.getAttribute('data-armcom-nav-track'),
          topic: el.getAttribute('data-armcom-nav-topic') || undefined,
          intent: el.getAttribute('data-armcom-nav-intent') || undefined,
        });
        closeAll();
      });
    });
  }

  function wireRailItems(root) {
    root.querySelectorAll('.armcom-mega-rail__item').forEach(function (btn) {
      btn.addEventListener('mouseenter', function () {
        var menuId = btn.getAttribute('data-armcom-menu');
        var catId = btn.getAttribute('data-armcom-rail');
        if (menuId && catId) setActiveCategory(menuId, catId);
      });
      btn.addEventListener('focus', function () {
        var menuId = btn.getAttribute('data-armcom-menu');
        var catId = btn.getAttribute('data-armcom-rail');
        if (menuId && catId) setActiveCategory(menuId, catId);
      });
      btn.addEventListener('click', function () {
        var menuId = btn.getAttribute('data-armcom-menu');
        var catId = btn.getAttribute('data-armcom-rail');
        if (menuId && catId) setActiveCategory(menuId, catId);
      });
    });
  }

  function mount() {
    var header = document.querySelector('.armcom-header');
    if (!header || !window.ArmcomNavData) return;

    var mountPoint = document.getElementById('armcom-mega-mount');
    if (!mountPoint) {
      mountPoint = document.createElement('div');
      mountPoint.id = 'armcom-mega-mount';
      mountPoint.className = 'armcom-mega-mount';
      header.appendChild(mountPoint);
    }

    mountPoint.innerHTML =
      '<div id="armcomMegaBackdrop" class="armcom-mega-backdrop" hidden aria-hidden="true"></div>' +
      renderAllMenus();

    wireNavLinks(mountPoint);
    wireRailItems(mountPoint);

    document.querySelectorAll('[data-armcom-mega]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var menuId = btn.getAttribute('data-armcom-mega');
        if (menuId) openMenu(menuId, btn);
      });
    });

    var backdrop = document.getElementById('armcomMegaBackdrop');
    if (backdrop) {
      backdrop.addEventListener('click', closeAll);
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeAll();
    });

    document.addEventListener('click', function (e) {
      if (!openMenuId) return;
      var target = e.target;
      if (!(target instanceof Element)) return;
      if (target.closest('[data-armcom-mega]') || target.closest('[data-armcom-mega-menu]')) return;
      closeAll();
    });
  }

  function init() {
    if (!document.querySelector('.armcom-header')) {
      setTimeout(mount, 0);
      return;
    }
    mount();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.ArmcomMegaMenu = {
    open: openMenu,
    close: closeAll,
    mount: mount,
  };
})();
