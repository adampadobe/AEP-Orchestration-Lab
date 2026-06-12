/**
 * Inject canonical decisioning mount placeholders when missing (journey chrome / multi-page demos).
 * Keep markup in sync with shared/decisioning-mount-zones.fragment.html
 */
(function (global) {
  'use strict';

  var LOG_PREFIX = '[decisioning-mount-zones]';

  var TOP_RIBBON_ID = 'TopRibbon';
  var HERO_ID = 'hero-banner';
  var CONTENT_CARD_ID = 'ContentCardContainer';

  function log(msg) {
    try {
      console.log(LOG_PREFIX, msg);
    } catch (_e) {}
  }

  function hasHeroAnchor(doc) {
    return doc.getElementById(HERO_ID) || doc.querySelector('[data-hero-mount]');
  }

  function hasMountContract(doc) {
    if (!doc || !doc.body) return false;
    if (doc.getElementById(TOP_RIBBON_ID) && doc.getElementById(CONTENT_CARD_ID) && hasHeroAnchor(doc)) {
      return true;
    }
    return /decisioning-mounts:\s*dynamic-only/i.test(doc.documentElement.innerHTML);
  }

  /**
   * Insert TopRibbon, hero-banner, and ContentCardContainer at sensible defaults.
   * @param {Document} [doc]
   * @param {{ insertTarget?: Element }} [opts]
   * @returns {boolean} true when zones were added
   */
  function ensureDecisioningMountZones(doc, opts) {
    opts = opts || {};
    doc = doc || document;
    if (!doc.body) return false;
    if (hasMountContract(doc)) return false;

    var target = opts.insertTarget;
    if (!target) {
      target = doc.querySelector('main') || doc.body;
    }

    var added = false;

    if (!doc.getElementById(TOP_RIBBON_ID)) {
      var ribbon = doc.createElement('section');
      ribbon.id = TOP_RIBBON_ID;
      ribbon.setAttribute('role', 'region');
      ribbon.setAttribute('aria-label', 'Personalized top ribbon');
      if (target.firstChild) {
        target.insertBefore(ribbon, target.firstChild);
      } else {
        target.appendChild(ribbon);
      }
      added = true;
    }

    if (!hasHeroAnchor(doc)) {
      var hero = doc.createElement('section');
      hero.id = HERO_ID;
      hero.setAttribute('role', 'region');
      hero.setAttribute('aria-label', 'Personalized hero');
      var heroInsertAfter = doc.getElementById(TOP_RIBBON_ID);
      if (heroInsertAfter && heroInsertAfter.parentNode === target) {
        if (heroInsertAfter.nextSibling) {
          target.insertBefore(hero, heroInsertAfter.nextSibling);
        } else {
          target.appendChild(hero);
        }
      } else if (target.firstChild) {
        target.insertBefore(hero, target.firstChild);
      } else {
        target.appendChild(hero);
      }
      added = true;
    }

    if (!doc.getElementById(CONTENT_CARD_ID)) {
      var cards = doc.createElement('section');
      cards.id = CONTENT_CARD_ID;
      cards.className = 'ContentCardContainer';
      cards.setAttribute('role', 'region');
      cards.setAttribute('aria-label', 'Content cards');
      var afterHero = doc.getElementById(HERO_ID);
      if (afterHero && afterHero.parentNode) {
        var parent = afterHero.parentNode;
        if (afterHero.nextSibling) {
          parent.insertBefore(cards, afterHero.nextSibling);
        } else {
          parent.appendChild(cards);
        }
      } else if (target.firstChild) {
        target.appendChild(cards);
      } else {
        target.appendChild(cards);
      }
      added = true;
    }

    if (added) log('injected mount zones into ' + (target.tagName || 'document'));
    return added;
  }

  global.DecisioningMountZones = {
    ensure: ensureDecisioningMountZones,
    hasContract: hasMountContract,
  };
})(typeof window !== 'undefined' ? window : globalThis);
