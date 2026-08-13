/**
 * Main-page AJO bridge for the embedded Sky snapshot.
 *
 * AJO authors the lab shell, but the Sky site is isolated in a same-origin iframe. This script
 * exposes a transparent main-document target over the real hero. Components inserted after that
 * target remain in the main document so AJO can edit their nested content. A matching spacer in
 * the iframe pushes the product cards down while those components are positioned over the gap.
 */
(function skyDemoMainAjoBridge(global) {
  'use strict';

  var FRAME_ID = 'skyDemoSiteFrame';
  var TARGET_ID = 'skyAjoMainHeroBanner';
  var SENTINEL_ID = 'skyAjoMainHeroInsertEnd';
  var SPACER_ID = 'skyAjoHeroInsertSpacer';
  var HERO_SELECTOR = '[data-test-id="hero"]';
  var PRODUCT_SECTION_SELECTOR = '[data-test-id="product-cards-section"]';
  var RETRY_DELAYS = [0, 100, 300, 750, 1500, 3000, 6000];
  var observer = null;
  var resizeObserver = null;
  var insertedResizeObserver = null;
  var observedInsertedElements = [];
  var observedFrameWindow = null;
  var loadListenerFrame = null;
  var layoutScheduled = false;

  function isCrossOriginEditor() {
    if (global.top === global) return false;
    try {
      return global.top.location.origin !== global.location.origin;
    } catch (_e) {
      return true;
    }
  }

  function getFrameAndHero() {
    var frame = document.getElementById(FRAME_ID);
    if (!frame) return null;
    try {
      var frameDocument = frame.contentDocument;
      var hero = null;
      var productSection = frameDocument && frameDocument.querySelector(PRODUCT_SECTION_SELECTOR);
      if (productSection) {
        var productRoot = productSection;
        while (productRoot.parentElement && productRoot.parentElement.tagName !== 'MAIN') {
          productRoot = productRoot.parentElement;
        }
        hero = productRoot.previousElementSibling;
        if (hero && hero.id === SPACER_ID) hero = hero.previousElementSibling;
      }
      if (!hero && frameDocument) hero = frameDocument.querySelector(HERO_SELECTOR);
      return hero ? { frame: frame, frameDocument: frameDocument, hero: hero } : null;
    } catch (_e) {
      return null;
    }
  }

  function isPostLoginPage() {
    var frame = document.getElementById(FRAME_ID);
    if (!frame) return false;
    try {
      return /\/sky-post-login\.html(?:[?#]|$)/i.test(frame.contentWindow.location.href);
    } catch (_e) {
      return false;
    }
  }

  function ensureBoundary() {
    var frame = document.getElementById(FRAME_ID);
    if (!frame) return null;

    var target = document.getElementById(TARGET_ID);
    if (!target) {
      target = document.createElement('div');
      target.id = TARGET_ID;
      target.setAttribute('role', 'img');
      target.setAttribute('aria-label', 'Sky hero banner');
      target.setAttribute('data-aep-authoring-target', 'hero-banner');
      target.setAttribute('data-aep-insert-position', 'after');
      target.style.cssText =
        'position:fixed;display:none;margin:0;padding:0;border:0;outline:0;background:transparent;z-index:7601;';
      frame.insertAdjacentElement('afterend', target);
    }

    var sentinel = document.getElementById(SENTINEL_ID);
    if (!sentinel) {
      sentinel = document.createElement('span');
      sentinel.id = SENTINEL_ID;
      sentinel.hidden = true;
      sentinel.setAttribute('aria-hidden', 'true');
      target.insertAdjacentElement('afterend', sentinel);
    }

    target.style.pointerEvents = isCrossOriginEditor() ? 'auto' : 'none';
    return { target: target, sentinel: sentinel };
  }

  function syncBoundary() {
    var boundary = ensureBoundary();
    if (isPostLoginPage()) {
      if (boundary) boundary.target.style.display = 'none';
      return false;
    }
    var context = getFrameAndHero();
    if (!boundary || !context) {
      if (boundary) boundary.target.style.display = 'none';
      return false;
    }

    var frameRect = context.frame.getBoundingClientRect();
    var heroRect = context.hero.getBoundingClientRect();
    var target = boundary.target;
    target.style.left = frameRect.left + heroRect.left + 'px';
    target.style.top = frameRect.top + heroRect.top + 'px';
    target.style.width = heroRect.width + 'px';
    target.style.height = heroRect.height + 'px';
    target.style.display = heroRect.width > 0 && heroRect.height > 0 ? 'block' : 'none';
    target.style.pointerEvents = isCrossOriginEditor() ? 'auto' : 'none';
    return true;
  }

  function insertedElements(boundary) {
    var elements = [];
    var node = boundary.target.nextSibling;
    while (node && node !== boundary.sentinel) {
      if (node.nodeType === 1) elements.push(node);
      node = node.nextSibling;
    }
    return elements;
  }

  function ensureSpacer(context) {
    var spacer = context.frameDocument.getElementById(SPACER_ID);
    if (!spacer) {
      spacer = context.frameDocument.createElement('div');
      spacer.id = SPACER_ID;
      spacer.setAttribute('aria-hidden', 'true');
      spacer.setAttribute('data-sky-ajo-insert-spacer', '1');
      spacer.style.cssText =
        'display:block;width:100%;height:0;margin:0;padding:0;border:0;pointer-events:none;';
      context.hero.insertAdjacentElement('afterend', spacer);
    }
    return spacer;
  }

  function observeInsertedElements(elements) {
    if (typeof ResizeObserver !== 'function') return;
    var unchanged =
      elements.length === observedInsertedElements.length &&
      elements.every(function (element, index) {
        return element === observedInsertedElements[index];
      });
    if (unchanged) return;
    if (!insertedResizeObserver) insertedResizeObserver = new ResizeObserver(scheduleLayout);
    insertedResizeObserver.disconnect();
    observedInsertedElements = elements.slice();
    elements.forEach(function (element) {
      insertedResizeObserver.observe(element);
    });
  }

  function layoutInsertedNodes() {
    var boundary = ensureBoundary();
    if (isPostLoginPage()) {
      if (boundary) boundary.target.style.display = 'none';
      return false;
    }
    var context = getFrameAndHero();
    if (!boundary || !context) return false;
    syncBoundary();

    var elements = insertedElements(boundary);
    var frameRect = context.frame.getBoundingClientRect();
    var heroRect = context.hero.getBoundingClientRect();
    var left = frameRect.left + heroRect.left;
    var top = frameRect.top + heroRect.bottom;
    var totalHeight = 0;

    elements.forEach(function (element) {
      element.setAttribute('data-sky-ajo-main-insert', '1');
      element.style.position = 'fixed';
      element.style.left = left + 'px';
      element.style.top = top + totalHeight + 'px';
      element.style.zIndex = '7601';
      element.style.maxWidth = heroRect.width + 'px';
      element.style.pointerEvents = 'auto';
      var style = global.getComputedStyle(element);
      var marginTop = parseFloat(style.marginTop) || 0;
      var marginBottom = parseFloat(style.marginBottom) || 0;
      totalHeight += marginTop + element.getBoundingClientRect().height + marginBottom;
    });

    ensureSpacer(context).style.height = totalHeight + 'px';
    observeInsertedElements(elements);
    return true;
  }

  function scheduleLayout() {
    if (layoutScheduled) return;
    layoutScheduled = true;
    global.requestAnimationFrame(function () {
      layoutScheduled = false;
      layoutInsertedNodes();
    });
  }

  function observeMainDocument() {
    if (observer || !document.body) return;
    observer = new MutationObserver(function () {
      scheduleLayout();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function observeFrame() {
    var context = getFrameAndHero();
    if (!context) return;
    if (observedFrameWindow !== context.frame.contentWindow) {
      if (observedFrameWindow) observedFrameWindow.removeEventListener('scroll', scheduleLayout);
      observedFrameWindow = context.frame.contentWindow;
      observedFrameWindow.addEventListener('scroll', scheduleLayout, { passive: true });
    }
    if (typeof ResizeObserver === 'function') {
      if (resizeObserver) resizeObserver.disconnect();
      resizeObserver = new ResizeObserver(scheduleLayout);
      resizeObserver.observe(context.hero);
    }
  }

  function initialise() {
    var frame = document.getElementById(FRAME_ID);
    if (!frame) return;
    ensureBoundary();
    observeMainDocument();
    if (loadListenerFrame !== frame) {
      loadListenerFrame = frame;
      frame.addEventListener('load', function () {
        RETRY_DELAYS.forEach(function (delay) {
          global.setTimeout(function () {
            scheduleLayout();
            observeFrame();
          }, delay);
        });
      });
    }
    scheduleLayout();
    observeFrame();
  }

  global.addEventListener('resize', scheduleLayout, { passive: true });
  RETRY_DELAYS.forEach(function (delay) {
    global.setTimeout(initialise, delay);
  });
})(typeof window !== 'undefined' ? window : globalThis);
