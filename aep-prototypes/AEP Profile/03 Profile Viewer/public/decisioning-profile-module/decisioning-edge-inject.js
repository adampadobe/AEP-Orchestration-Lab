/**
 * Reusable Code Based Experience mount + inject helpers for site-clone demo pages.
 * Uses CdEdgeMounts item parsing (same as Edge Lab + Race for Life).
 */
(function (global) {
  'use strict';

  var CACHE_BUST = '20260617-ksia-journey-url';
  var LOG_PREFIX = '[decisioning-edge-inject]';
  var MOUNT_ATTR = 'data-decisioning-edge-mount';
  var STYLE_ID = 'decisioningEdgeMountStyles';

  var FRAGMENTS = {
    topRibbon: 'TopRibbon',
    hero: 'hero-banner',
    contentCard: 'ContentCardContainer',
  };

  function log() {
    try {
      var args = Array.prototype.slice.call(arguments);
      args.unshift(LOG_PREFIX);
      console.log.apply(console, args);
    } catch (_e) {}
  }

  function getPlacements() {
    if (typeof global.CdEdgeMounts !== 'undefined' && typeof global.CdEdgeMounts.getPlacements === 'function') {
      return global.CdEdgeMounts.getPlacements();
    }
    return global.CdEdgeMounts && global.CdEdgeMounts.DEFAULT_PLACEMENTS
      ? global.CdEdgeMounts.DEFAULT_PLACEMENTS.slice()
      : [];
  }

  function findSkyHeroBlockForInject(doc) {
    var main = doc.querySelector('main#app');
    if (!main) return null;
    var hero = main.querySelector('[data-test-id="hero"]');
    if (hero) {
      var node = hero;
      while (node.parentElement && node.parentElement !== main) {
        node = node.parentElement;
      }
      if (node.parentElement === main) return node;
    }
    var i;
    for (i = 0; i < main.children.length; i++) {
      var child = main.children[i];
      if (child && child.querySelector && child.querySelector('[data-test-id="hero"]')) {
        return child;
      }
    }
    return null;
  }

  function findSkyInjectAfterNode(doc) {
    if (!doc) return null;
    var heroBlock = findSkyHeroBlockForInject(doc);
    if (heroBlock) return heroBlock;
    var main = doc.querySelector('main#app');
    return main && main.children.length > 1 ? main.children[1] : main ? main.firstElementChild : null;
  }

  function findGenericHeroHost(doc) {
    if (!doc) return null;
    var host = doc.querySelector('[data-hero-mount]');
    if (host) return host;
    var mount = doc.getElementById(FRAGMENTS.hero);
    if (mount && mount.parentNode && mount.parentNode !== mount) return mount.parentNode;
    return doc.querySelector('main');
  }

  function findGenericContentCardInsertAfter(doc) {
    if (!doc) return null;
    var heroHost = doc.querySelector('[data-hero-mount]');
    if (heroHost) return heroHost;
    var heroMount = doc.getElementById(FRAGMENTS.hero);
    if (heroMount && heroMount.parentNode) return heroMount;
    return doc.querySelector('main') || doc.body;
  }

  var LAYOUT_PRESETS = {
    'sky-home': {
      insertRibbonAtBodyStart: true,
      findRibbonInsertAfter: function () {
        return null;
      },
      findHeroParent: findSkyHeroBlockForInject,
      findContentCardInsertAfter: findSkyInjectAfterNode,
    },
    generic: {
      findRibbonInsertAfter: function (doc) {
        return doc.body && doc.body.firstElementChild;
      },
      findHeroParent: findGenericHeroHost,
      findContentCardInsertAfter: findGenericContentCardInsertAfter,
    },
  };

  function resolveLayout(layout) {
    if (!layout) return LAYOUT_PRESETS.generic;
    if (typeof layout === 'string') return LAYOUT_PRESETS[layout] || LAYOUT_PRESETS.generic;
    if (typeof layout === 'object') {
      var base = LAYOUT_PRESETS[layout.preset || 'generic'] || LAYOUT_PRESETS.generic;
      return {
        insertRibbonAtBodyStart: layout.insertRibbonAtBodyStart === true || base.insertRibbonAtBodyStart === true,
        findRibbonInsertAfter: layout.findRibbonInsertAfter || base.findRibbonInsertAfter,
        findHeroParent: layout.findHeroParent || base.findHeroParent,
        findContentCardInsertAfter: layout.findContentCardInsertAfter || base.findContentCardInsertAfter,
      };
    }
    return LAYOUT_PRESETS.generic;
  }

  function ribbonMountClass(resolved) {
    if (resolved && resolved.insertRibbonAtBodyStart) {
      return 'cd-edge-mount-body cd-edge-mount-body--ribbon-inline';
    }
    return 'cd-edge-mount-body cd-edge-mount-body--ribbon-fixed';
  }

  function mountStylesCss() {
    return (
      '#' +
      FRAGMENTS.topRibbon +
      '{position:relative;width:100%;box-sizing:border-box;z-index:1;}' +
      '#' +
      FRAGMENTS.topRibbon +
      '.cd-edge-mount-body--ribbon-inline:not(:empty){position:relative;z-index:2147483000;width:100%;}' +
      '#' +
      FRAGMENTS.topRibbon +
      ':empty{display:none;}' +
      '#' +
      FRAGMENTS.topRibbon +
      '.cd-edge-mount-body--ribbon-inline{padding:0;margin:0;min-height:0;overflow:visible;background:transparent;border:none;}' +
      '#' +
      FRAGMENTS.topRibbon +
      '.cd-edge-mount-body--ribbon-inline .TopRibbon{width:100%;box-sizing:border-box;}' +
      '.TopRibbon__content{display:flex;flex-direction:row;flex-wrap:nowrap;align-items:center;justify-content:center;gap:0.35rem;padding:0.35rem 0.75rem;text-align:center;box-sizing:border-box;}' +
      '.TopRibbon__image{flex:0 0 auto;max-height:2.25rem;width:auto;object-fit:contain;vertical-align:middle;}' +
      '#' +
      FRAGMENTS.topRibbon +
      '.cd-edge-mount-body--ribbon-inline .cd-banner.cd-banner--overlay{min-height:0!important;max-height:none;flex-direction:row;align-items:center;justify-content:center;}' +
      '#' +
      FRAGMENTS.topRibbon +
      '.cd-edge-mount-body--ribbon-inline .cd-banner--overlay .cd-banner-copy{flex-direction:row;flex-wrap:nowrap;align-items:center;justify-content:center;gap:0.35rem;min-height:0!important;max-height:none;padding:0.35rem 0.75rem!important;}' +
      '#' +
      FRAGMENTS.topRibbon +
      '.cd-edge-mount-body--ribbon-inline .cd-banner-image{flex:0 0 auto;max-height:2.25rem;max-width:5rem;width:auto;object-fit:contain;}' +
      '#' +
      FRAGMENTS.topRibbon +
      '.cd-edge-mount-body--ribbon-fixed{min-height:8rem;padding:0.2rem 0.65rem;display:flex;flex-direction:column;box-sizing:border-box;overflow:hidden;}' +
      '#' +
      FRAGMENTS.topRibbon +
      '.cd-edge-mount-body--ribbon-fixed .cd-banner.cd-banner--overlay{min-height:0!important;max-height:100%;flex:1 1 auto;overflow:hidden;}' +
      '#' +
      FRAGMENTS.topRibbon +
      '.cd-edge-mount-body--ribbon-fixed .cd-banner--overlay .cd-banner-copy{min-height:0!important;flex:1 1 auto;max-height:100%;overflow:hidden;padding:0.2rem 0.5rem!important;gap:0.2rem!important;justify-content:center;}' +
      '#' +
      FRAGMENTS.topRibbon +
      '.cd-edge-mount-body--ribbon-fixed .cd-slot--title,' +
      '#' +
      FRAGMENTS.topRibbon +
      '.cd-edge-mount-body--ribbon-fixed .cd-slot--desc{min-width:0;overflow:hidden;}' +
      '#' +
      FRAGMENTS.topRibbon +
      '.cd-edge-mount-body--ribbon-fixed .cd-slot-title,' +
      '#' +
      FRAGMENTS.topRibbon +
      '.cd-edge-mount-body--ribbon-fixed .cd-slot-desc{margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:0.75rem;line-height:1.25;}' +
      '#' +
      FRAGMENTS.hero +
      '{position:relative;width:100%;box-sizing:border-box;min-height:0;}' +
      '#' +
      FRAGMENTS.hero +
      ':empty{display:none;}' +
      '#' +
      FRAGMENTS.hero +
      '.cd-edge-has-decision{position:absolute;inset:0;z-index:5;}' +
      '#' +
      FRAGMENTS.hero +
      '.cd-edge-mount-body--hero-flow.cd-edge-has-decision{position:relative!important;inset:auto!important;width:100%;height:auto;min-height:0;z-index:1;}' +
      '#' +
      FRAGMENTS.hero +
      '.cd-edge-mount-body--hero-flow.cd-edge-has-decision:not(:empty) ~ *{display:none!important;visibility:visible;}' +
      '#' +
      FRAGMENTS.hero +
      '.cd-edge-has-decision:not(:empty) ~ *{visibility:hidden;}' +
      '#' +
      FRAGMENTS.contentCard +
      '{position:relative;width:100%;max-width:960px;margin:1rem auto;box-sizing:border-box;}' +
      '#' +
      FRAGMENTS.contentCard +
      ':empty{display:none;}' +
      '.cd-banner{position:relative;display:flex;flex-direction:column;overflow:hidden;}' +
      '.cd-banner--overlay{min-height:min(52vh,400px);}' +
      '.cd-banner--overlay .cd-banner-figure{position:absolute;inset:0;min-height:100%;background-repeat:no-repeat;background-position:center center;background-size:contain;}' +
      '.cd-banner--overlay .cd-banner-figure.cd-banner-figure--empty{display:block;background-image:none!important;background:var(--cd-no-image-bg,currentColor);opacity:0.92;}' +
      '.cd-banner--overlay .cd-banner-scrim{display:block;position:absolute;inset:0;z-index:1;background:linear-gradient(to top,color-mix(in srgb,currentColor 90%,transparent),color-mix(in srgb,currentColor 40%,transparent) 45%,transparent);}' +
      '.cd-banner--overlay .cd-banner-copy{position:relative;z-index:2;flex:1;display:flex;flex-direction:column;gap:0.75rem;justify-content:var(--cd-block-justify,flex-end);min-height:min(52vh,400px);padding:1.35rem 1.5rem 1.5rem;}' +
      '.cd-banner--overlay.cd-banner--contain-fit{position:relative;overflow:visible;min-height:0;display:block;}' +
      '.cd-banner--overlay.cd-banner--contain-fit .cd-banner-figure{position:relative;inset:auto;min-height:0;display:flex;align-items:center;justify-content:center;background-repeat:no-repeat;background-position:center center;background-size:contain;}' +
      '.cd-banner--overlay.cd-banner--contain-fit .cd-banner-figure img,' +
      '.cd-banner--overlay.cd-banner--contain-fit>.cd-banner-image{width:100%;max-width:100%;height:auto;max-height:var(--cd-hero-img-max-height,min(42vh,360px));object-fit:contain;object-position:center;display:block;margin-left:auto;margin-right:auto;}' +
      '.cd-banner--overlay.cd-banner--contain-fit .cd-banner-scrim{position:absolute;inset:0;z-index:1;display:block;}' +
      '.cd-banner--overlay.cd-banner--contain-fit .cd-banner-copy{position:absolute;inset:0;z-index:2;min-height:0;display:flex;flex-direction:column;gap:0.75rem;justify-content:center;align-items:center;text-align:center;padding:1.25rem 1.5rem;}' +
      '.cd-edge-mount-body--hero-flow:not(.cd-edge-mount-body--layout-below) .cd-banner--overlay.cd-banner--contain-fit .cd-banner-copy{justify-content:center;}' +
      '.cd-banner-copy{display:flex;flex-direction:column;gap:0.75rem;justify-content:var(--cd-block-justify,flex-start);}' +
      '.cd-slot{display:flex;width:100%;justify-content:var(--cd-slot-justify,center);align-items:var(--cd-slot-align,flex-start);}' +
      '.cd-slot-title,.cd-edge-ajo-card-title{margin:0;font-size:clamp(1rem,2.5vw,1.35rem);font-weight:700;line-height:1.25;color:var(--cd-title-color,inherit);}' +
      '.cd-slot-desc,.cd-edge-ajo-card-desc{margin:0;font-size:0.875rem;line-height:1.45;color:var(--cd-desc-color,inherit);opacity:0.92;}' +
      '.cd-slot-cta{display:inline-block;padding:0.35rem 0.85rem;border-radius:999px;text-decoration:none;font-size:0.75rem;font-weight:600;background:var(--cd-cta-bg,currentColor);color:var(--cd-cta-text,inherit);border:1px solid color-mix(in srgb,currentColor 20%,transparent);}' +
      '.cd-banner-image,.cd-edge-ajo-card-img{width:100%;max-width:100%;height:auto;max-height:none;object-fit:contain;display:block;margin-left:auto;margin-right:auto;}' +
      '[data-hero-mount]:has(#' +
      FRAGMENTS.hero +
      '.cd-edge-has-decision:not(:empty)),' +
      '[data-hero-mount].cd-edge-hero-host-has-decision{overflow:visible;height:auto;min-height:min(42vh,360px);width:100%;max-width:none;box-sizing:border-box;}' +
      '[data-hero-mount].cd-edge-hero-host-full-width{width:100vw;max-width:100vw;margin-left:calc(50% - 50vw);margin-right:calc(50% - 50vw);position:relative;left:0;}' +
      '#' +
      FRAGMENTS.hero +
      '.cd-edge-mount-body--hero-flow:not(.cd-edge-mount-body--layout-below){width:100%;max-width:100%;}' +
      '#' +
      FRAGMENTS.hero +
      '.cd-edge-mount-body--hero-flow:not(.cd-edge-mount-body--layout-below) .cd-banner--overlay.cd-banner--contain-fit{width:100%;max-width:100%;}' +
      '#' +
      FRAGMENTS.topRibbon +
      '.cd-edge-mount-body--ribbon-inline .cd-banner--below .cd-banner-image,' +
      '#' +
      FRAGMENTS.topRibbon +
      '.cd-edge-mount-body--ribbon-inline .cd-banner--below .cd-banner-figure img{max-height:none;max-width:100%;width:100%;object-fit:contain;}' +
      '#' +
      FRAGMENTS.hero +
      '.cd-edge-mount-body--hero-flow .cd-banner--below{background:transparent!important;overflow:visible;min-height:0!important;}' +
      '#' +
      FRAGMENTS.hero +
      '.cd-edge-mount-body--hero-flow .cd-banner--below .cd-banner-image,' +
      '#' +
      FRAGMENTS.hero +
      '.cd-edge-mount-body--hero-flow .cd-banner--below .cd-banner-figure img{width:100%;max-width:100%;height:auto;max-height:var(--cd-sky-hero-img-max-height,min(42vh,360px));object-fit:contain;display:block;margin-left:auto;margin-right:auto;}' +
      '#' +
      FRAGMENTS.hero +
      '.cd-edge-mount-body--hero-flow .cd-banner--below .cd-banner-figure--empty{min-height:0;height:auto;max-height:var(--cd-sky-hero-img-max-height,min(42vh,360px));opacity:1;}' +
      '#' +
      FRAGMENTS.hero +
      '.cd-edge-mount-body--hero-flow .cd-banner--below .cd-banner-copy{padding:1rem 1.25rem 1.25rem;}' +
      '#' +
      FRAGMENTS.hero +
      '.cd-edge-mount-body--hero-flow .cd-slot--cta,' +
      '#' +
      FRAGMENTS.hero +
      '.cd-edge-mount-body--hero-flow .cd-slot--cta-group{display:none!important;}' +
      '#' +
      FRAGMENTS.contentCard +
      '.cd-edge-mount-body--card-below .cd-banner--below .cd-banner-image,' +
      '#' +
      FRAGMENTS.contentCard +
      '.cd-edge-mount-body--card-below .cd-banner--below .cd-banner-figure img{width:100%;max-width:100%;max-height:none;height:auto;object-fit:contain;display:block;margin-left:auto;margin-right:auto;}' +
      '.cd-banner--below{overflow:visible;}' +
      '.cd-banner--below .cd-banner-figure{min-height:0;border-bottom:none;flex:0 0 auto;display:flex;align-items:center;justify-content:center;}' +
      '.cd-banner--below .cd-banner-figure img{width:100%;max-width:100%;height:auto;max-height:none;object-fit:contain;display:block;margin-left:auto;margin-right:auto;}' +
      '.cd-banner--below .cd-banner-image{width:100%;max-width:100%;height:auto;max-height:none;object-fit:contain;display:block;margin-left:auto;margin-right:auto;}' +
      '.cd-banner--below .cd-banner-scrim{display:none!important;}' +
      '.cd-banner--below .cd-banner-copy{position:relative;z-index:1;padding:1rem 1.25rem 1.25rem;min-height:0;text-align:center;}' +
      '#' +
      FRAGMENTS.contentCard +
      '.cd-edge-mount-body--card-below .cd-slot--cta,' +
      '#' +
      FRAGMENTS.contentCard +
      '.cd-edge-mount-body--card-below .cd-slot--cta-group,' +
      '#' +
      FRAGMENTS.contentCard +
      '.cd-edge-mount-body--card-below .cd-card-dismiss{display:none!important;}' +
      '.cd-edge-ajo-iframe{width:100%;min-height:180px;border:0;border-radius:4px;}' +
      '.cd-edge-vis--no-title .cd-slot--title{display:none!important;}' +
      '.cd-edge-vis--no-desc .cd-slot--desc{display:none!important;}' +
      '.cd-edge-vis--no-cta .cd-slot--cta{display:none!important;}' +
      '.cd-edge-vis--no-fig .cd-banner-figure,.cd-edge-vis--no-fig .cd-banner-image{display:none!important;}'
    );
  }

  function ensureMountStyles(doc) {
    if (!doc || doc.getElementById(STYLE_ID)) return;
    var styleEl = doc.createElement('style');
    styleEl.id = STYLE_ID;
    styleEl.setAttribute(MOUNT_ATTR, '1');
    styleEl.textContent = mountStylesCss();
    (doc.head || doc.documentElement).appendChild(styleEl);
  }

  function ensureMountEl(doc, id, className) {
    var el = doc.getElementById(id);
    if (!el) {
      el = doc.createElement('div');
      el.id = id;
      el.setAttribute(MOUNT_ATTR, '1');
      el.setAttribute('role', 'region');
      el.setAttribute('data-decisioning-fragment', id);
      if (className) el.className = className;
    } else if (className) {
      el.className = className;
      el.setAttribute(MOUNT_ATTR, '1');
    }
    return el;
  }

  function isInvalidDomInsert(parent, node, ref) {
    if (!parent || !node) return true;
    if (node === parent) return true;
    if (node.contains(parent)) return true;
    if (ref && (node === ref || node.contains(ref) || ref.contains(node))) return true;
    return false;
  }

  function safeInsertBefore(parent, node, ref) {
    if (!parent || !node) return false;
    if (isInvalidDomInsert(parent, node, ref)) {
      log('safeInsertBefore skipped invalid insert', parent.id || parent.tagName, node.id || node.tagName);
      if (node.parentNode !== parent) parent.appendChild(node);
      return false;
    }
    parent.insertBefore(node, ref);
    return true;
  }

  function insertAfter(parent, node, ref) {
    if (!parent || !node) return;
    if (ref && ref.parentNode === parent) {
      if (isInvalidDomInsert(parent, node, ref)) {
        log('insertAfter skipped invalid insert', parent.id || parent.tagName, node.id || node.tagName);
        if (node.parentNode !== parent) parent.appendChild(node);
        return;
      }
      if (ref.nextSibling) parent.insertBefore(node, ref.nextSibling);
      else parent.appendChild(node);
      return;
    }
    parent.appendChild(node);
  }

  function normalizeTopRibbonMount(mount) {
    if (!mount) return;
    if (mount.querySelector('.TopRibbon__content, .TopRibbon, .cd-banner')) {
      mount.classList.add('cd-edge-mount-body--ribbon-inline');
      mount.classList.remove('cd-edge-mount-body--ribbon-fixed');
      mount.style.removeProperty('height');
      mount.style.removeProperty('max-height');
      mount.style.removeProperty('min-height');
      mount.style.removeProperty('overflow');
      if (mount.querySelector('.cd-banner')) normalizeBannerToBelow(mount);
    }
  }

  function ribbonAlreadyInMainContent(ribbon) {
    if (!ribbon || !ribbon.parentNode || !ribbon.ownerDocument) return false;
    var main = ribbon.ownerDocument.querySelector('main');
    return !!(main && main.contains(ribbon));
  }

  function mountHasRenderedContent(el) {
    if (!el || el.matches(':empty')) return false;
    return !!el.querySelector(
      '.cd-banner, .TopRibbon, .TopRibbon__content, .cd-edge-ajo-card-inner, iframe, .cd-edge-rendered-ribbon',
    );
  }

  function countFilledDecisioningMounts(doc) {
    if (!doc) return { topRibbon: false, hero: false, contentCard: false, filled: 0 };
    var topRibbon = mountHasRenderedContent(doc.getElementById(FRAGMENTS.topRibbon));
    var hero = mountHasRenderedContent(doc.getElementById(FRAGMENTS.hero));
    var contentCard = mountHasRenderedContent(doc.getElementById(FRAGMENTS.contentCard));
    var filled = (topRibbon ? 1 : 0) + (hero ? 1 : 0) + (contentCard ? 1 : 0);
    return { topRibbon: topRibbon, hero: hero, contentCard: contentCard, filled: filled };
  }

  /**
   * Ensure AJO fragment mounts exist in target document (iframe or host page).
   * @param {Document} doc
   * @param {string|object} [layout] preset key or custom resolver object
   */
  function ensureDecisioningMounts(doc, layout) {
    if (!doc || !doc.body) return null;
    var resolved = resolveLayout(layout);
    ensureMountStyles(doc);

    var ribbon = ensureMountEl(doc, FRAGMENTS.topRibbon, ribbonMountClass(resolved));
    var ribbonRef = resolved.findRibbonInsertAfter(doc);
    if (resolved.insertRibbonAtBodyStart && doc.body) {
      if (ribbon.parentNode !== doc.body || ribbon !== doc.body.firstElementChild) {
        safeInsertBefore(doc.body, ribbon, doc.body.firstElementChild);
      }
    } else if (!ribbonAlreadyInMainContent(ribbon) && ribbonRef && ribbonRef.parentNode) {
      if (ribbon.parentNode !== ribbonRef.parentNode || ribbon.previousSibling !== ribbonRef) {
        insertAfter(ribbonRef.parentNode, ribbon, ribbonRef);
      }
    } else if (!ribbon.parentNode) {
      safeInsertBefore(doc.body, ribbon, doc.body.firstChild);
    }

    var heroParent = resolved.findHeroParent(doc);
    var heroClass = 'cd-edge-mount-body cd-edge-mount-body--hero cd-banner-wrap';
    if (resolved.insertRibbonAtBodyStart) heroClass += ' cd-edge-mount-body--hero-flow';
    else if (heroParent && heroParent.getAttribute && heroParent.getAttribute('data-hero-mount')) {
      heroClass += ' cd-edge-mount-body--hero-flow';
    }
    var hero = ensureMountEl(doc, FRAGMENTS.hero, heroClass);
    if (heroParent && heroParent !== hero) {
      if (heroParent.style.position !== 'relative') heroParent.style.position = 'relative';
      if (hero.parentNode !== heroParent) {
        safeInsertBefore(heroParent, hero, heroParent.firstChild);
      }
    } else if (!hero.parentNode) {
      var main = doc.querySelector('main') || doc.body;
      main.appendChild(hero);
    }

    var card = ensureMountEl(
      doc,
      FRAGMENTS.contentCard,
      'cd-edge-mount-body ContentCardContainer',
    );
    var cardRef = resolved.findContentCardInsertAfter(doc);
    if (cardRef && cardRef.parentNode) {
      if (card.parentNode !== cardRef.parentNode || card.previousSibling !== cardRef) {
        insertAfter(cardRef.parentNode, card, cardRef);
      }
    } else if (!card.parentNode) {
      var mainCard = doc.querySelector('main') || doc.body;
      mainCard.appendChild(card);
    }

    return { topRibbon: ribbon, hero: hero, contentCard: card };
  }

  function removeDecisioningMounts(doc) {
    if (!doc) return;
    doc.querySelectorAll('[' + MOUNT_ATTR + '="1"]').forEach(function (el) {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });
    var heroParent = findSkyHeroBlockForInject(doc);
    if (heroParent && heroParent.style.position === 'relative') heroParent.style.position = '';
  }

  function normalizeContentCardLayout(root) {
    if (!root || !root.style) return;
    root.style.removeProperty('height');
    root.style.removeProperty('min-height');
  }

  function isSkyHomeLayout(layout) {
    var resolved = resolveLayout(layout);
    return !!(resolved && resolved.insertRibbonAtBodyStart);
  }

  function normalizeBannerToBelow(mount) {
    if (!mount) return;
    var banners = mount.querySelectorAll('.cd-banner--overlay, .cd-banner--half, .cd-banner');
    var i;
    for (i = 0; i < banners.length; i++) {
      var banner = banners[i];
      banner.classList.remove('cd-banner--overlay', 'cd-banner--half', 'cd-banner--contain-fit');
      banner.classList.add('cd-banner--below');
      banner.style.removeProperty('min-height');
      var scrim = banner.querySelector('.cd-banner-scrim');
      if (scrim) scrim.style.display = 'none';
    }
    var imgs = mount.querySelectorAll('.cd-banner-image, .cd-banner-figure img');
    for (i = 0; i < imgs.length; i++) {
      imgs[i].style.objectFit = 'contain';
      imgs[i].style.width = '100%';
      imgs[i].style.maxWidth = '100%';
      imgs[i].style.height = 'auto';
      imgs[i].style.maxHeight = '';
      imgs[i].style.marginLeft = 'auto';
      imgs[i].style.marginRight = 'auto';
    }
  }

  /** Generic site-clone overlay: copy centered over a contained (uncropped) image. */
  function normalizeOverlayBanner(mount) {
    if (!mount) return;
    var doc = mount.ownerDocument || document;
    var banners = mount.querySelectorAll('.cd-banner--below, .cd-banner--half, .cd-banner--overlay, .cd-banner');
    var i;
    for (i = 0; i < banners.length; i++) {
      var banner = banners[i];
      banner.classList.remove('cd-banner--below', 'cd-banner--half');
      banner.classList.add('cd-banner--overlay', 'cd-banner--contain-fit');
      banner.style.removeProperty('min-height');
      banner.style.background = 'transparent';
      if (!banner.querySelector('.cd-banner-scrim')) {
        var scrim = doc.createElement('div');
        scrim.className = 'cd-banner-scrim';
        scrim.setAttribute('aria-hidden', 'true');
        var copyEl = banner.querySelector('.cd-banner-copy');
        if (copyEl) banner.insertBefore(scrim, copyEl);
        else banner.appendChild(scrim);
      } else {
        var existingScrim = banner.querySelector('.cd-banner-scrim');
        if (existingScrim) existingScrim.style.removeProperty('display');
      }
    }
    var copy = mount.querySelector('.cd-banner-copy');
    if (copy) {
      copy.style.setProperty('--cd-block-justify', 'center');
      copy.style.textAlign = 'center';
    }
    mount.querySelectorAll('.cd-slot--title, .cd-slot--desc, .cd-slot--cta').forEach(function (slot) {
      slot.style.setProperty('--cd-slot-justify', 'center');
      slot.style.setProperty('--cd-slot-align', 'center');
    });
    mount.querySelectorAll('.cd-banner-image, .cd-banner-figure img').forEach(function (imgEl) {
      imgEl.style.objectFit = 'contain';
      imgEl.style.objectPosition = 'center';
      imgEl.style.width = '100%';
      imgEl.style.maxWidth = '100%';
      imgEl.style.height = 'auto';
      imgEl.style.maxHeight = 'var(--cd-hero-img-max-height, min(42vh, 360px))';
      imgEl.style.marginLeft = 'auto';
      imgEl.style.marginRight = 'auto';
    });
  }

  /** Expand [data-hero-mount] to full content / viewport width (KSIA .ksia-hero, Etihad, …). */
  function expandHeroHostFullWidth(host) {
    if (!host) return;
    host.classList.add('cd-edge-hero-host-has-decision', 'cd-edge-hero-host-full-width');
    host.style.overflow = 'visible';
    host.style.height = 'auto';
    host.style.width = '100%';
    host.style.maxWidth = 'none';
    host.style.boxSizing = 'border-box';
  }

  /** Measure native hero host height before decisioning hides siblings. */
  function measureGenericHeroHost(host) {
    if (!host) return null;
    var h = host.offsetHeight || 0;
    if (!h) {
      var rect = host.getBoundingClientRect();
      h = Math.round(rect.height || 0);
    }
    return h ? { imgHeight: h } : null;
  }

  /** Measure native Sky hero picture height before decisioning hides siblings. */
  function measureSkyHeroReference(heroMount) {
    if (!heroMount || !heroMount.parentElement) return null;
    var parent = heroMount.parentElement;
    var img =
      parent.querySelector('picture[data-test-id="php-image-bg-asset"] img') ||
      parent.querySelector('[data-test-id="hero"] picture img') ||
      parent.querySelector('img.image__Image-sc-21rhmd-0') ||
      parent.querySelector('picture img[data-skyui-core*="Image"]') ||
      parent.querySelector('picture img');
    var imgH = 0;
    var imgW = 0;
    if (img) {
      var rect = img.getBoundingClientRect();
      imgH = Math.round(rect.height || img.offsetHeight || 0);
      imgW = Math.round(rect.width || img.offsetWidth || 0);
      if (!imgH && img.naturalHeight && img.naturalWidth) {
        var parentW = parent.offsetWidth || heroMount.offsetWidth;
        if (parentW) imgH = Math.round((parentW / img.naturalWidth) * img.naturalHeight);
      }
    }
    if (!imgH) {
      var picture = parent.querySelector('picture[data-test-id="php-image-bg-asset"]') || parent.querySelector('picture');
      if (picture && picture.offsetHeight) imgH = picture.offsetHeight;
    }
    if (!imgH) return null;
    return { imgHeight: imgH, imgWidth: imgW };
  }

  function applySkyHeroMetrics(heroMount, metrics, noImageBg) {
    if (!heroMount || !metrics || !metrics.imgHeight) return;
    var maxH = Math.max(40, Math.round(metrics.imgHeight));
    heroMount.style.setProperty('--cd-sky-hero-img-max-height', maxH + 'px');
    heroMount.setAttribute('data-cd-sky-hero-img-h', String(maxH));
    var banner = heroMount.querySelector('.cd-banner');
    if (banner) {
      banner.style.removeProperty('background-color');
      banner.style.background = 'transparent';
      banner.style.removeProperty('min-height');
      var nib = noImageBg != null && String(noImageBg).trim() ? String(noImageBg).trim() : '';
      var empty = banner.querySelector('.cd-banner-figure--empty');
      if (empty && nib) empty.style.backgroundColor = nib;
    }
    heroMount.querySelectorAll('.cd-banner-image, .cd-banner-figure img').forEach(function (imgEl) {
      imgEl.style.width = '100%';
      imgEl.style.height = 'auto';
      imgEl.style.maxHeight = 'var(--cd-sky-hero-img-max-height, min(42vh, 360px))';
      imgEl.style.objectFit = 'contain';
    });
  }

  function reapplySkyHeroMetricsFromCache(heroMount, noImageBg) {
    if (!heroMount) return;
    var cached = heroMount.getAttribute('data-cd-sky-hero-img-h');
    if (!cached) return;
    applySkyHeroMetrics(heroMount, { imgHeight: parseInt(cached, 10) || 0 }, noImageBg);
  }

  function hideBannerCta(mount) {
    if (!mount) return;
    mount.classList.add('cd-edge-vis--no-cta');
    mount.querySelectorAll('.cd-slot--cta, .cd-slot--cta-group, .cd-card-dismiss').forEach(function (el) {
      el.style.display = 'none';
    });
  }

  /** Sky snapshot: hero + content card use stacked image-above-copy layout (not overlay). */
  function normalizeSkyHomeDecisionLayouts(doc, layout, surfaceStyles) {
    if (!doc || !isSkyHomeLayout(layout)) return;
    var heroNoImageBg =
      surfaceStyles && surfaceStyles[FRAGMENTS.hero] && surfaceStyles[FRAGMENTS.hero].noImageBg
        ? surfaceStyles[FRAGMENTS.hero].noImageBg
        : '';
    var hero = doc.getElementById(FRAGMENTS.hero);
    var heroMetrics = hero && !hero.matches(':empty') ? measureSkyHeroReference(hero) : null;
    if (hero && !hero.matches(':empty')) {
      hero.classList.add('cd-edge-mount-body--hero-flow', 'cd-edge-mount-body--layout-below');
      normalizeBannerToBelow(hero);
      hero.style.minHeight = '0';
      hero.style.maxHeight = '';
      hero.style.height = '';
      if (heroMetrics) applySkyHeroMetrics(hero, heroMetrics, heroNoImageBg);
      else reapplySkyHeroMetricsFromCache(hero, heroNoImageBg);
      hideBannerCta(hero);
    }
    var card = doc.getElementById(FRAGMENTS.contentCard);
    if (card && !card.matches(':empty')) {
      card.classList.add('cd-edge-mount-body--card-below');
      normalizeBannerToBelow(card);
      hideBannerCta(card);
    }
    var ribbon = doc.getElementById(FRAGMENTS.topRibbon);
    if (ribbon && !ribbon.matches(':empty')) {
      ribbon.classList.add('cd-edge-mount-body--ribbon-inline');
      ribbon.style.position = 'relative';
      ribbon.style.zIndex = '2147483000';
      ribbon.style.width = '100%';
      normalizeTopRibbonMount(ribbon);
    }
  }

  /** Generic site-clone demos (KSIA, Etihad, …): overlay copy on contained image; expand hero host. */
  function normalizeGenericDecisionLayouts(doc, layout) {
    if (!doc || isSkyHomeLayout(layout)) return;
    var hero = doc.getElementById(FRAGMENTS.hero);
    if (hero && !hero.matches(':empty')) {
      hero.classList.add('cd-edge-mount-body--hero-flow');
      hero.classList.remove('cd-edge-mount-body--layout-below');
      normalizeOverlayBanner(hero);
      hero.style.minHeight = '0';
      hero.style.maxHeight = '';
      hero.style.height = '';
      hero.style.overflow = 'visible';
      hero.style.width = '100%';
      hero.style.maxWidth = '100%';
      var host = hero.closest('[data-hero-mount]');
      if (host) {
        expandHeroHostFullWidth(host);
        var hostMetrics = measureGenericHeroHost(host);
        if (hostMetrics && hostMetrics.imgHeight) {
          hero.style.setProperty('--cd-hero-img-max-height', Math.max(40, Math.round(hostMetrics.imgHeight)) + 'px');
        }
      }
    }
    var card = doc.getElementById(FRAGMENTS.contentCard);
    if (card && !card.matches(':empty')) {
      card.classList.remove('cd-edge-mount-body--card-below');
      normalizeOverlayBanner(card);
    }
  }

  function markHeroHasDecision(doc) {
    var hero = doc && doc.getElementById(FRAGMENTS.hero);
    if (hero && !hero.classList.contains('cd-edge-has-decision') && !hero.matches(':empty')) {
      hero.classList.add('cd-edge-has-decision');
    }
  }

  function parseTopRibbonContentFromItem(item) {
    if (!item) return null;
    var data = item.data || item.characteristics || item;
    if (!data || typeof data !== 'object') return null;
    if (data.type === 'topRibbon' && data.content) return data.content;
    if (data.content && typeof data.content === 'object') {
      if (data.content.type === 'topRibbon') {
        return data.content.content && typeof data.content.content === 'object' ? data.content.content : data.content;
      }
      if (data.content.message != null || data.content.imageUrl != null || data.content.imageURL != null) {
        return data.content;
      }
    }
    if (typeof data.content === 'string') {
      var t = data.content.trim();
      if (t.charAt(0) === '{' || t.charAt(0) === '[') {
        try {
          var parsed = JSON.parse(t);
          if (parsed && parsed.type === 'topRibbon' && parsed.content) return parsed.content;
          if (parsed && (parsed.message != null || parsed.imageUrl != null || parsed.imageURL != null)) return parsed;
        } catch (_e) {
          /* noop */
        }
      }
    }
    return null;
  }

  function ribbonMountNeedsContent(mount) {
    if (!mount) return false;
    if (mount.matches(':empty')) return true;
    return !mount.querySelector('.TopRibbon, .TopRibbon__content, .cd-banner, .cd-edge-ajo-card-inner, iframe');
  }

  function findTopRibbonItem(propositions) {
    if (!propositions || !propositions.length) return null;
    var pi;
    var ii;
    for (pi = 0; pi < propositions.length; pi++) {
      var items = propositions[pi].items || [];
      for (ii = 0; ii < items.length; ii++) {
        var item = items[ii];
        var content = parseTopRibbonContentFromItem(item);
        if (content) return { item: item, content: content };
      }
    }
    return null;
  }

  function renderStructuredTopRibbon(el, content) {
    if (!el || !content || typeof content !== 'object') return false;
    el.textContent = '';
    el.classList.add('cd-edge-rendered-ribbon', 'cd-edge-mount-body--ribbon-inline');
    el.classList.remove('cd-edge-mount-body--ribbon-fixed');
    var root = document.createElement('div');
    root.className = 'TopRibbon';
    if (content.backgroundColor) root.style.backgroundColor = String(content.backgroundColor);
    if (content.color) root.style.color = String(content.color);
    var row = document.createElement('div');
    row.className = 'TopRibbon__content';
    var imgUrl =
      content.imageUrl != null
        ? String(content.imageUrl)
        : content.imageURL != null
          ? String(content.imageURL)
          : content.image != null
            ? String(content.image)
            : '';
    if (imgUrl.trim()) {
      var img = document.createElement('img');
      img.className = 'TopRibbon__image';
      img.src = imgUrl.trim();
      img.alt = content.message != null ? String(content.message) : 'Offer';
      img.loading = 'lazy';
      img.decoding = 'async';
      row.appendChild(img);
    }
    if (content.message) {
      var msg = document.createElement('span');
      msg.className = 'TopRibbon__text';
      msg.textContent = String(content.message);
      row.appendChild(msg);
    }
    if (content.cta && content.cta.url && content.cta.label) {
      var a = document.createElement('a');
      a.className = 'TopRibbon__cta';
      a.href = String(content.cta.url);
      a.textContent = String(content.cta.label);
      a.target = '_blank';
      a.rel = 'noopener';
      row.appendChild(a);
    }
    root.appendChild(row);
    el.appendChild(root);
    return true;
  }

  var STYLE_DEFAULTS =
    global.CdSurfaceStylesCore && global.CdSurfaceStylesCore.STYLE_DEFAULTS_INJECT
      ? global.CdSurfaceStylesCore.STYLE_DEFAULTS_INJECT
      : {
          layoutMode: 'overlay',
          blockY: 'flex-end',
          titleH: 'center',
          titleV: 'flex-start',
          descH: 'center',
          descV: 'center',
          ctaH: 'center',
          ctaV: 'flex-end',
          titleColor: '',
          descColor: '',
          ctaBg: '',
          ctaText: '',
          noImageBg: '',
          showTitle: true,
          showDesc: true,
          showCta: true,
          showImage: true,
          mountMinHeight: '',
        };

  function coreApplyStyleToMount(mount, st) {
    if (global.CdSurfaceStylesCore && typeof global.CdSurfaceStylesCore.applyStyleToMount === 'function') {
      global.CdSurfaceStylesCore.applyStyleToMount(mount, st, {
        mode: 'inject',
        defaults: STYLE_DEFAULTS,
        topRibbonFragment: FRAGMENTS.topRibbon,
        heroFragment: FRAGMENTS.hero,
        injectHooks: {
          normalizeBannerToBelow: normalizeBannerToBelow,
          reapplySkyHeroMetricsFromCache: reapplySkyHeroMetricsFromCache,
          hideBannerCta: hideBannerCta,
          normalizeOverlayBanner: normalizeOverlayBanner,
          expandHeroHostFullWidth: expandHeroHostFullWidth,
        },
      });
      return;
    }
    applyStyleToMountLegacy(mount, st);
  }

  function applyStyleToMountLegacy(mount, st) {
    var VIS_CLASS = [
      'cd-edge-vis--no-title',
      'cd-edge-vis--no-desc',
      'cd-edge-vis--no-cta',
      'cd-edge-vis--no-fig',
    ];
    function sanitizeMountMinHeight(raw) {
      var s = String(raw || '').trim();
      if (!s) return '';
      if (s.length > 40) s = s.slice(0, 40);
      if (!/^[0-9a-zA-Z%().,\s+-]+$/.test(s)) return '';
      return s;
    }
    function mountUsesTopRibbonSurface(mountEl) {
      if (!mountEl) return false;
      if (mountEl.id === FRAGMENTS.topRibbon) return true;
      return /topribbon/i.test(String(mountEl.id || ''));
    }
    if (!mount || !st) return;
    var isHeroFlow = mount.classList.contains('cd-edge-mount-body--hero-flow');
    var isLayoutBelow = mount.classList.contains('cd-edge-mount-body--layout-below');
    var isCardBelow = mount.classList.contains('cd-edge-mount-body--card-below');
    var usesStackedLayout = isLayoutBelow || isCardBelow;
    var banner = mount.querySelector('.cd-banner');
    if (banner) {
      if (!isHeroFlow && !usesStackedLayout) {
        banner.classList.remove('cd-banner--overlay', 'cd-banner--half', 'cd-banner--below', 'cd-banner--contain-fit');
        banner.classList.add('cd-banner--' + (st.layoutMode || STYLE_DEFAULTS.layoutMode));
      }
      if (st.titleColor) banner.style.setProperty('--cd-title-color', String(st.titleColor));
      if (st.descColor) banner.style.setProperty('--cd-desc-color', String(st.descColor));
      if (st.ctaBg) banner.style.setProperty('--cd-cta-bg', String(st.ctaBg));
      if (st.ctaText) banner.style.setProperty('--cd-cta-text', String(st.ctaText));
      var nib = st.noImageBg != null && String(st.noImageBg).trim() ? String(st.noImageBg).trim() : '';
      if (nib) {
        banner.style.setProperty('--cd-no-image-bg', nib);
        if (isHeroFlow || usesStackedLayout) {
          banner.style.removeProperty('background-color');
          banner.style.background = 'transparent';
          var fig = banner.querySelector('.cd-banner-figure--empty');
          if (fig) fig.style.backgroundColor = nib;
        } else {
          banner.style.setProperty('background-color', nib);
        }
      } else {
        banner.style.removeProperty('--cd-no-image-bg');
        if (!isHeroFlow && !usesStackedLayout) banner.style.removeProperty('background-color');
      }
    }
    var copy = mount.querySelector('.cd-banner-copy');
    if (copy) copy.style.setProperty('--cd-block-justify', st.blockY || STYLE_DEFAULTS.blockY);
    var t = mount.querySelector('.cd-slot--title');
    if (t) {
      t.style.setProperty('--cd-slot-justify', st.titleH || STYLE_DEFAULTS.titleH);
      t.style.setProperty('--cd-slot-align', st.titleV || STYLE_DEFAULTS.titleV);
    }
    var d = mount.querySelector('.cd-slot--desc');
    if (d) {
      d.style.setProperty('--cd-slot-justify', st.descH || STYLE_DEFAULTS.descH);
      d.style.setProperty('--cd-slot-align', st.descV || STYLE_DEFAULTS.descV);
    }
    var c = mount.querySelector('.cd-slot--cta');
    if (c) {
      c.style.setProperty('--cd-slot-justify', st.ctaH || STYLE_DEFAULTS.ctaH);
      c.style.setProperty('--cd-slot-align', st.ctaV || STYLE_DEFAULTS.ctaV);
    }
    VIS_CLASS.forEach(function (cls) {
      mount.classList.remove(cls);
    });
    if (st.showTitle === false) mount.classList.add('cd-edge-vis--no-title');
    if (st.showDesc === false) mount.classList.add('cd-edge-vis--no-desc');
    if (st.showCta === false) mount.classList.add('cd-edge-vis--no-cta');
    if (st.showImage === false) mount.classList.add('cd-edge-vis--no-fig');
    var mh = sanitizeMountMinHeight(st.mountMinHeight);
    var ribbonInline = mount.classList.contains('cd-edge-mount-body--ribbon-inline');
    var ribbonFixed =
      !ribbonInline && mountUsesTopRibbonSurface(mount) && (!!mh || mount.classList.contains('cd-edge-mount-body--ribbon-fixed'));
    if (isHeroFlow) {
      mount.style.minHeight = '0';
      mount.style.maxHeight = '';
      mount.style.height = '';
      mount.style.overflow = '';
      if (isLayoutBelow) {
        normalizeBannerToBelow(mount);
        reapplySkyHeroMetricsFromCache(mount, st.noImageBg);
        hideBannerCta(mount);
      } else {
        normalizeOverlayBanner(mount);
        mount.style.width = '100%';
        mount.style.maxWidth = '100%';
        var heroHost = mount.closest('[data-hero-mount]');
        if (heroHost) expandHeroHostFullWidth(heroHost);
      }
      return;
    }
    if (isCardBelow) {
      mount.style.minHeight = mh || '';
      normalizeBannerToBelow(mount);
      hideBannerCta(mount);
      return;
    }
    if (ribbonInline) {
      mount.classList.remove('cd-edge-mount-body--ribbon-fixed');
      mount.style.maxHeight = '';
      mount.style.height = '';
      mount.style.overflow = '';
      mount.style.minHeight = mh || '';
      var topRibbonInner = mount.querySelector('.TopRibbon');
      if (topRibbonInner && st.noImageBg) {
        topRibbonInner.style.backgroundColor = String(st.noImageBg).trim();
      }
      return;
    }
    if (ribbonFixed) {
      mount.classList.add('cd-edge-mount-body--ribbon-fixed');
      var resolvedHeight = mh || '8rem';
      mount.style.minHeight = resolvedHeight;
      mount.style.maxHeight = resolvedHeight;
      mount.style.height = resolvedHeight;
      mount.style.overflow = 'hidden';
    } else {
      mount.style.maxHeight = '';
      mount.style.height = '';
      mount.style.overflow = '';
      mount.style.minHeight = mh || '';
    }
  }

  function applyStyleToMount(mount, st) {
    coreApplyStyleToMount(mount, st);
  }

  /**
   * Apply saved Edge Lab surface styles to mounts in target document (iframe).
   * @param {Document} doc
   * @param {Record<string, object>|null|undefined} surfaceStyles keyed by fragment id
   */
  function applySurfaceStyles(doc, surfaceStyles) {
    if (!doc || !surfaceStyles || typeof surfaceStyles !== 'object') return;
    var fragments = [FRAGMENTS.topRibbon, FRAGMENTS.hero, FRAGMENTS.contentCard];
    var fi;
    for (fi = 0; fi < fragments.length; fi++) {
      var frag = fragments[fi];
      var saved = surfaceStyles[frag];
      if (!saved) continue;
      var mount = doc.getElementById(frag);
      if (!mount) continue;
      applyStyleToMount(mount, Object.assign({}, STYLE_DEFAULTS, saved));
      if (frag === FRAGMENTS.topRibbon) normalizeTopRibbonMount(mount);
    }
  }

  /**
   * Extract and inject Top Ribbon from an Alloy sendEvent / decision response.
   * @param {unknown[]|{ propositions?: unknown[] }} decisionData propositions array or sendEvent result
   * @param {ParentNode} [root] document root (iframe document when omitted uses document)
   * @param {{ layout?: string|object, mountIdPrefix?: string }} [opts]
   * @returns {boolean} true when ribbon content was applied
   */
  function injectTopRibbon(decisionData, root, opts) {
    opts = opts || {};
    var propositions = Array.isArray(decisionData)
      ? decisionData
      : decisionData && (decisionData.propositions || decisionData.decisions);
    if (!propositions || !propositions.length) {
      log('injectTopRibbon: no propositions');
      return false;
    }
    var scopeRoot = root && root.nodeType === 9 ? root : root && root.ownerDocument ? root.ownerDocument : document;
    if (root && root.nodeType === 1 && root.ownerDocument) scopeRoot = root.ownerDocument;
    if (!scopeRoot || !scopeRoot.body) return false;

    ensureDecisioningMounts(scopeRoot, opts.layout);
    var mount = scopeRoot.getElementById(FRAGMENTS.topRibbon);
    if (!mount) {
      console.warn('[decisioning-edge-inject] No Top Ribbon mount found');
      return false;
    }

    var structured = findTopRibbonItem(propositions);
    if (structured && renderStructuredTopRibbon(mount, structured.content)) {
      return true;
    }

    if (typeof global.CdEdgeMounts === 'undefined' || typeof global.CdEdgeMounts.applyPropositionsManually !== 'function') {
      console.warn('[decisioning-edge-inject] CdEdgeMounts not loaded');
      return false;
    }

    var prior = mount.innerHTML;
    global.CdEdgeMounts.applyPropositionsManually(propositions, {
      root: scopeRoot,
      mountIdPrefix: opts.mountIdPrefix != null ? String(opts.mountIdPrefix) : '',
    });
    normalizeTopRibbonMount(mount);
    return mount.innerHTML !== prior && mount.innerHTML.trim() !== '';
  }

  /**
   * Apply top ribbon from structured AJO payloads and/or scoped EXD items.
   * @returns {boolean}
   */
  function applyTopRibbonFromPropositions(propositions, scopeRoot, opts) {
    if (!propositions || !propositions.length || !scopeRoot) return false;
    var mount = scopeRoot.getElementById(FRAGMENTS.topRibbon);
    if (!mount || !ribbonMountNeedsContent(mount)) return !!mount && !ribbonMountNeedsContent(mount);

    var structured = findTopRibbonItem(propositions);
    if (structured && renderStructuredTopRibbon(mount, structured.content)) {
      normalizeTopRibbonMount(mount);
      return true;
    }
    return injectTopRibbon(propositions, scopeRoot, opts);
  }

  /**
   * Apply all Code Based Experience surfaces (ribbon, hero, content card) like Race for Life / Edge Lab.
   */
  function applyDecisioningPropositions(propositions, root, opts) {
    opts = opts || {};
    if (!propositions || !propositions.length) return false;
    var scopeRoot = root && root.nodeType === 9 ? root : root && root.ownerDocument ? root.ownerDocument : document;
    if (root && root.nodeType === 1 && root.ownerDocument) scopeRoot = root.ownerDocument;
    if (!scopeRoot || !scopeRoot.body) return false;

    ensureDecisioningMounts(scopeRoot, opts.layout);

    applyTopRibbonFromPropositions(propositions, scopeRoot, opts);

    if (typeof global.CdEdgeMounts === 'undefined' || typeof global.CdEdgeMounts.applyPropositionsManually !== 'function') {
      return false;
    }

    global.CdEdgeMounts.applyPropositionsManually(propositions, {
      root: scopeRoot,
      mountIdPrefix: opts.mountIdPrefix != null ? String(opts.mountIdPrefix) : '',
    });

    applyTopRibbonFromPropositions(propositions, scopeRoot, opts);

    var ribbonMount = scopeRoot.getElementById(FRAGMENTS.topRibbon);
    if (ribbonMount) normalizeTopRibbonMount(ribbonMount);

    var card = scopeRoot.getElementById(FRAGMENTS.contentCard);
    if (card) normalizeContentCardLayout(card);

    normalizeSkyHomeDecisionLayouts(scopeRoot, opts.layout, opts.surfaceStyles);
    if (opts.surfaceStyles) applySurfaceStyles(scopeRoot, opts.surfaceStyles);
    normalizeSkyHomeDecisionLayouts(scopeRoot, opts.layout, opts.surfaceStyles);
    normalizeGenericDecisionLayouts(scopeRoot, opts.layout);
    markHeroHasDecision(scopeRoot);
    return true;
  }

  global.DecisioningEdgeInject = {
    CACHE_BUST: CACHE_BUST,
    FRAGMENTS: FRAGMENTS,
    LAYOUT_PRESETS: LAYOUT_PRESETS,
    ensureDecisioningMounts: ensureDecisioningMounts,
    removeDecisioningMounts: removeDecisioningMounts,
    injectTopRibbon: injectTopRibbon,
    applyDecisioningPropositions: applyDecisioningPropositions,
    applySurfaceStyles: applySurfaceStyles,
    resolveLayout: resolveLayout,
    countFilledDecisioningMounts: countFilledDecisioningMounts,
  };
})(typeof window !== 'undefined' ? window : globalThis);
