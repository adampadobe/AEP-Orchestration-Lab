/**
 * Main-page AJO bridge for the embedded Sky snapshot.
 *
 * AJO authors the lab shell, but the Sky site is isolated in a same-origin iframe. This script
 * exposes a transparent main-document target over the real hero and moves nodes inserted after
 * that target into the iframe immediately after the hero. The target never adds visible chrome.
 */
(function skyDemoMainAjoBridge(global) {
  'use strict';

  var FRAME_ID = 'skyDemoSiteFrame';
  var TARGET_ID = 'skyAjoMainHeroBanner';
  var SENTINEL_ID = 'skyAjoMainHeroInsertEnd';
  var HERO_SELECTOR = '[data-test-id="hero"]';
  var PRODUCT_SECTION_SELECTOR = '[data-test-id="product-cards-section"]';
  var RETRY_DELAYS = [0, 100, 300, 750, 1500, 3000, 6000];
  var observer = null;
  var resizeObserver = null;
  var observedFrameWindow = null;
  var loadListenerFrame = null;

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
      }
      if (!hero && frameDocument) hero = frameDocument.querySelector(HERO_SELECTOR);
      return hero ? { frame: frame, frameDocument: frameDocument, hero: hero } : null;
    } catch (_e) {
      return null;
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
        'position:fixed;display:none;margin:0;padding:0;border:0;outline:0;background:transparent;z-index:2;';
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

  function moveInsertedNodes() {
    var boundary = ensureBoundary();
    var context = getFrameAndHero();
    if (!boundary || !context) return false;

    var pending = [];
    var node = boundary.target.nextSibling;
    while (node && node !== boundary.sentinel) {
      var next = node.nextSibling;
      pending.push(node);
      node = next;
    }
    if (!pending.length) return true;

    var insertionCursor = context.hero;
    pending.forEach(function (pendingNode) {
      var adopted = context.frameDocument.adoptNode(pendingNode);
      insertionCursor.parentNode.insertBefore(adopted, insertionCursor.nextSibling);
      insertionCursor = adopted;
    });
    return true;
  }

  function observeMainDocument() {
    if (observer || !document.body) return;
    observer = new MutationObserver(function () {
      moveInsertedNodes();
      syncBoundary();
    });
    observer.observe(document.body, { childList: true });
  }

  function observeFrame() {
    var context = getFrameAndHero();
    if (!context) return;
    if (observedFrameWindow !== context.frame.contentWindow) {
      if (observedFrameWindow) observedFrameWindow.removeEventListener('scroll', syncBoundary);
      observedFrameWindow = context.frame.contentWindow;
      observedFrameWindow.addEventListener('scroll', syncBoundary, { passive: true });
    }
    if (typeof ResizeObserver === 'function') {
      if (resizeObserver) resizeObserver.disconnect();
      resizeObserver = new ResizeObserver(syncBoundary);
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
            syncBoundary();
            moveInsertedNodes();
            observeFrame();
          }, delay);
        });
      });
    }
    syncBoundary();
    moveInsertedNodes();
    observeFrame();
  }

  global.addEventListener('resize', syncBoundary, { passive: true });
  RETRY_DELAYS.forEach(function (delay) {
    global.setTimeout(initialise, delay);
  });
})(typeof window !== 'undefined' ? window : globalThis);
