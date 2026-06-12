/**
 * Reusable Code Based Experience mount + inject helpers for site-clone demo pages.
 * Uses CdEdgeMounts item parsing (same as Edge Lab + Race for Life).
 */
(function (global) {
  'use strict';

  var CACHE_BUST = '20260615';
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
      findHeroParent: function (doc) {
        return doc.getElementById(FRAGMENTS.hero) || doc.querySelector('[data-hero-mount]') || doc.querySelector('main');
      },
      findContentCardInsertAfter: function (doc) {
        var hero = doc.getElementById(FRAGMENTS.hero);
        if (hero && hero.parentNode) return hero;
        return doc.querySelector('main') || doc.body;
      },
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

  function mountStylesCss() {
    return (
      '#' +
      FRAGMENTS.topRibbon +
      '{position:sticky;top:0;z-index:120;width:100%;box-sizing:border-box;}' +
      '#' +
      FRAGMENTS.topRibbon +
      ':empty{display:none;}' +
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
      '.cd-edge-has-decision:not(:empty) ~ *{visibility:hidden;}' +
      '#' +
      FRAGMENTS.contentCard +
      '{position:relative;width:100%;max-width:960px;margin:1rem auto;box-sizing:border-box;}' +
      '#' +
      FRAGMENTS.contentCard +
      ':empty{display:none;}' +
      '.cd-banner{position:relative;display:flex;flex-direction:column;overflow:hidden;}' +
      '.cd-banner--overlay{min-height:min(52vh,400px);}' +
      '.cd-banner--overlay .cd-banner-figure{position:absolute;inset:0;min-height:100%;background-repeat:no-repeat;background-position:center top;background-size:cover;}' +
      '.cd-banner--overlay .cd-banner-figure.cd-banner-figure--empty{display:block;background-image:none!important;background:var(--cd-no-image-bg,currentColor);opacity:0.92;}' +
      '.cd-banner--overlay .cd-banner-scrim{display:block;position:absolute;inset:0;z-index:1;background:linear-gradient(to top,color-mix(in srgb,currentColor 90%,transparent),color-mix(in srgb,currentColor 40%,transparent) 45%,transparent);}' +
      '.cd-banner--overlay .cd-banner-copy{position:relative;z-index:2;flex:1;display:flex;flex-direction:column;gap:0.75rem;justify-content:var(--cd-block-justify,flex-end);min-height:min(52vh,400px);padding:1.35rem 1.5rem 1.5rem;}' +
      '.cd-banner-copy{display:flex;flex-direction:column;gap:0.75rem;justify-content:var(--cd-block-justify,flex-start);}' +
      '.cd-slot{display:flex;width:100%;justify-content:var(--cd-slot-justify,center);align-items:var(--cd-slot-align,flex-start);}' +
      '.cd-slot-title,.cd-edge-ajo-card-title{margin:0;font-size:clamp(1rem,2.5vw,1.35rem);font-weight:700;line-height:1.25;color:var(--cd-title-color,inherit);}' +
      '.cd-slot-desc,.cd-edge-ajo-card-desc{margin:0;font-size:0.875rem;line-height:1.45;color:var(--cd-desc-color,inherit);opacity:0.92;}' +
      '.cd-slot-cta{display:inline-block;padding:0.35rem 0.85rem;border-radius:999px;text-decoration:none;font-size:0.75rem;font-weight:600;background:var(--cd-cta-bg,currentColor);color:var(--cd-cta-text,inherit);border:1px solid color-mix(in srgb,currentColor 20%,transparent);}' +
      '.cd-banner-image,.cd-edge-ajo-card-img{width:100%;max-height:200px;object-fit:cover;display:block;}' +
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

  function insertAfter(parent, node, ref) {
    if (!parent || !node) return;
    if (ref && ref.parentNode === parent) {
      if (ref.nextSibling) parent.insertBefore(node, ref.nextSibling);
      else parent.appendChild(node);
      return;
    }
    parent.appendChild(node);
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

    var ribbon = ensureMountEl(
      doc,
      FRAGMENTS.topRibbon,
      'cd-edge-mount-body cd-edge-mount-body--ribbon-fixed',
    );
    var ribbonRef = resolved.findRibbonInsertAfter(doc);
    if (resolved.insertRibbonAtBodyStart && doc.body) {
      if (ribbon.parentNode !== doc.body || ribbon !== doc.body.firstElementChild) {
        doc.body.insertBefore(ribbon, doc.body.firstElementChild);
      }
    } else if (ribbonRef && ribbonRef.parentNode) {
      if (ribbon.parentNode !== ribbonRef.parentNode || ribbon.previousSibling !== ribbonRef) {
        insertAfter(ribbonRef.parentNode, ribbon, ribbonRef);
      }
    } else if (!ribbon.parentNode) {
      doc.body.insertBefore(ribbon, doc.body.firstChild);
    }

    var heroParent = resolved.findHeroParent(doc);
    var hero = ensureMountEl(doc, FRAGMENTS.hero, 'cd-edge-mount-body cd-edge-mount-body--hero cd-banner-wrap');
    if (heroParent) {
      if (heroParent.style.position !== 'relative') heroParent.style.position = 'relative';
      if (hero.parentNode !== heroParent) {
        heroParent.insertBefore(hero, heroParent.firstChild);
      }
    } else if (!hero.parentNode) {
      var main = doc.querySelector('main') || doc.body;
      main.appendChild(hero);
    }

    var card = ensureMountEl(doc, FRAGMENTS.contentCard, 'cd-edge-mount-body ContentCardContainer');
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

  function markHeroHasDecision(doc) {
    var hero = doc && doc.getElementById(FRAGMENTS.hero);
    if (hero && !hero.classList.contains('cd-edge-has-decision') && !hero.matches(':empty')) {
      hero.classList.add('cd-edge-has-decision');
    }
  }

  function findTopRibbonItem(propositions) {
    if (!propositions || !propositions.length) return null;
    var pi;
    var ii;
    for (pi = 0; pi < propositions.length; pi++) {
      var items = propositions[pi].items || [];
      for (ii = 0; ii < items.length; ii++) {
        var item = items[ii];
        var data = item && (item.data || item.characteristics || item);
        if (!data) continue;
        if (data.type === 'topRibbon' && data.content) return { item: item, content: data.content };
        if (data.content && typeof data.content === 'object' && data.content.type === 'topRibbon') {
          return { item: item, content: data.content };
        }
      }
    }
    return null;
  }

  function renderStructuredTopRibbon(el, content) {
    if (!el || !content || typeof content !== 'object') return false;
    el.textContent = '';
    el.classList.add('cd-edge-rendered-ribbon');
    var bar = document.createElement('div');
    bar.className = 'cd-banner cd-banner--overlay cd-banner--ribbon-bar';
    if (content.backgroundColor) bar.style.backgroundColor = String(content.backgroundColor);
    if (content.color) bar.style.color = String(content.color);
    var copy = document.createElement('div');
    copy.className = 'cd-banner-copy';
    copy.style.display = 'flex';
    copy.style.flexWrap = 'wrap';
    copy.style.alignItems = 'center';
    copy.style.justifyContent = 'center';
    copy.style.gap = '0.5rem';
    if (content.message) {
      var msg = document.createElement('span');
      msg.className = 'cd-slot-desc';
      msg.textContent = String(content.message);
      copy.appendChild(msg);
    }
    if (content.cta && content.cta.url && content.cta.label) {
      var a = document.createElement('a');
      a.className = 'cd-slot-cta';
      a.href = String(content.cta.url);
      a.textContent = String(content.cta.label);
      a.target = '_blank';
      a.rel = 'noopener';
      copy.appendChild(a);
    }
    bar.appendChild(copy);
    el.appendChild(bar);
    return true;
  }

  var STYLE_DEFAULTS = {
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

  function mountUsesTopRibbonSurface(mount) {
    if (!mount) return false;
    if (mount.id === FRAGMENTS.topRibbon) return true;
    return /topribbon/i.test(String(mount.id || ''));
  }

  function applyStyleToMount(mount, st) {
    if (!mount || !st) return;
    var banner = mount.querySelector('.cd-banner');
    if (banner) {
      banner.classList.remove('cd-banner--overlay', 'cd-banner--half', 'cd-banner--below');
      banner.classList.add('cd-banner--' + (st.layoutMode || STYLE_DEFAULTS.layoutMode));
      if (st.titleColor) banner.style.setProperty('--cd-title-color', String(st.titleColor));
      if (st.descColor) banner.style.setProperty('--cd-desc-color', String(st.descColor));
      if (st.ctaBg) banner.style.setProperty('--cd-cta-bg', String(st.ctaBg));
      if (st.ctaText) banner.style.setProperty('--cd-cta-text', String(st.ctaText));
      var nib = st.noImageBg != null && String(st.noImageBg).trim() ? String(st.noImageBg).trim() : '';
      if (nib) {
        banner.style.setProperty('--cd-no-image-bg', nib);
        banner.style.setProperty('background-color', nib);
      } else {
        banner.style.removeProperty('--cd-no-image-bg');
        banner.style.removeProperty('background-color');
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
    var ribbonFixed = mountUsesTopRibbonSurface(mount) && (!!mh || mount.classList.contains('cd-edge-mount-body--ribbon-fixed'));
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
    return mount.innerHTML !== prior && mount.innerHTML.trim() !== '';
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

    if (typeof global.CdEdgeMounts === 'undefined' || typeof global.CdEdgeMounts.applyPropositionsManually !== 'function') {
      return false;
    }

    global.CdEdgeMounts.applyPropositionsManually(propositions, {
      root: scopeRoot,
      mountIdPrefix: opts.mountIdPrefix != null ? String(opts.mountIdPrefix) : '',
    });

    var card = scopeRoot.getElementById(FRAGMENTS.contentCard);
    if (card) normalizeContentCardLayout(card);
    markHeroHasDecision(scopeRoot);
    if (opts.surfaceStyles) applySurfaceStyles(scopeRoot, opts.surfaceStyles);
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
  };
})(typeof window !== 'undefined' ? window : globalThis);
