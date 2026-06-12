/**
 * Reusable Code Based Experience mount + inject helpers for site-clone demo pages.
 * Uses CdEdgeMounts item parsing (same as Edge Lab + Race for Life).
 */
(function (global) {
  'use strict';

  var CACHE_BUST = '20260614';
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
      findRibbonInsertAfter: function (doc) {
        return doc.getElementById('masthead-header');
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
      '.cd-edge-mount-body--ribbon-fixed{padding:0.2rem 0.65rem;display:flex;flex-direction:column;box-sizing:border-box;}' +
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
      '.cd-banner,.cd-edge-ajo-card-inner{border-radius:8px;overflow:hidden;box-shadow:0 4px 16px color-mix(in srgb, currentColor 12%, transparent);}' +
      '.cd-slot-title,.cd-edge-ajo-card-title{margin:0;font-size:14px;font-weight:700;}' +
      '.cd-slot-desc,.cd-edge-ajo-card-desc{margin:0;font-size:12px;opacity:0.85;}' +
      '.cd-banner-image,.cd-edge-ajo-card-img{width:100%;max-height:200px;object-fit:cover;display:block;}' +
      '.cd-edge-ajo-iframe{width:100%;min-height:180px;border:0;border-radius:4px;}'
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
    if (ribbonRef && ribbonRef.parentNode) {
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
    resolveLayout: resolveLayout,
  };
})(typeof window !== 'undefined' ? window : globalThis);
