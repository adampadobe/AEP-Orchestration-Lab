/**
 * Exposes the post-login Sky hero image in the main document for AJO authoring.
 * The visual remains inside the same-origin iframe; this transparent image mirrors source changes,
 * while sibling components inserted before or after it are laid over matching iframe spacers.
 */
(function skyPostLoginAjoBridge(global) {
  'use strict';

  var FRAME_ID = 'skyDemoSiteFrame';
  var IMAGE_SELECTOR = '[data-test-id="chp-hero-image"]';
  var START_ID = 'skyAjoPostLoginInsertStart';
  var TARGET_ID = 'skyAjoPostLoginImage';
  var END_ID = 'skyAjoPostLoginInsertEnd';
  var BEFORE_SPACER_ID = 'skyAjoPostLoginBeforeSpacer';
  var AFTER_SPACER_ID = 'skyAjoPostLoginAfterSpacer';
  var RETRY_DELAYS = [0, 100, 300, 750, 1500, 3000, 6000];
  var observer = null;
  var targetObserver = null;
  var frameWindow = null;
  var layoutScheduled = false;

  function isCrossOriginEditor() {
    if (global.top === global) return false;
    try {
      return global.top.location.origin !== global.location.origin;
    } catch (_e) {
      return true;
    }
  }

  function context() {
    var frame = document.getElementById(FRAME_ID);
    if (!frame) return null;
    try {
      var frameDocument = frame.contentDocument;
      var image = frameDocument && frameDocument.querySelector(IMAGE_SELECTOR);
      return image ? { frame: frame, frameDocument: frameDocument, image: image } : null;
    } catch (_e) {
      return null;
    }
  }

  function ensureBoundary() {
    var frame = document.getElementById(FRAME_ID);
    if (!frame) return null;
    var start = document.getElementById(START_ID);
    if (!start) {
      start = document.createElement('span');
      start.id = START_ID;
      start.hidden = true;
      frame.insertAdjacentElement('afterend', start);
    }
    var target = document.getElementById(TARGET_ID);
    if (!target) {
      target = document.createElement('img');
      target.id = TARGET_ID;
      target.alt = 'Sky latest deals';
      target.setAttribute('data-aep-authoring-target', 'post-login-hero-image');
      target.setAttribute('data-aep-insert-position', 'before after');
      target.style.cssText =
        'position:fixed;display:none;margin:0;padding:0;border:0;outline:0;background:transparent;opacity:.001;z-index:7602;';
      start.insertAdjacentElement('afterend', target);
    }
    var end = document.getElementById(END_ID);
    if (!end) {
      end = document.createElement('span');
      end.id = END_ID;
      end.hidden = true;
      target.insertAdjacentElement('afterend', end);
    }
    target.style.pointerEvents = isCrossOriginEditor() ? 'auto' : 'none';
    return { start: start, target: target, end: end };
  }

  function nodesBetween(start, end) {
    var nodes = [];
    var node = start.nextSibling;
    while (node && node !== end) {
      if (node.nodeType === 1) nodes.push(node);
      node = node.nextSibling;
    }
    return nodes;
  }

  function spacer(frameDocument, id, image, position) {
    var el = frameDocument.getElementById(id);
    if (!el) {
      el = frameDocument.createElement('div');
      el.id = id;
      el.setAttribute('aria-hidden', 'true');
      el.style.cssText = 'display:block;width:100%;height:0;margin:0;padding:0;border:0;pointer-events:none;';
      image.insertAdjacentElement(position, el);
    }
    return el;
  }

  function nodeHeight(node) {
    var style = global.getComputedStyle(node);
    return (
      (parseFloat(style.marginTop) || 0) +
      node.getBoundingClientRect().height +
      (parseFloat(style.marginBottom) || 0)
    );
  }

  function positionNodes(nodes, left, top, width, direction) {
    var total = 0;
    nodes.forEach(function (node) {
      node.setAttribute('data-sky-ajo-main-insert', direction);
      node.style.position = 'fixed';
      node.style.left = left + 'px';
      node.style.top = top + total + 'px';
      node.style.zIndex = '7602';
      node.style.maxWidth = width + 'px';
      node.style.pointerEvents = 'auto';
      total += nodeHeight(node);
    });
    return total;
  }

  function syncImageSource(target, image) {
    var source = image.currentSrc || image.src;
    if (source && target.getAttribute('src') !== source) target.setAttribute('src', source);
    if (!targetObserver) {
      targetObserver = new MutationObserver(function () {
        var next = context();
        if (!next) return;
        var src = target.getAttribute('src');
        if (!src || next.image.src === src) return;
        next.image.removeAttribute('srcset');
        next.image.src = src;
      });
      targetObserver.observe(target, { attributes: true, attributeFilter: ['src'] });
    }
  }

  function layout() {
    var boundary = ensureBoundary();
    var ctx = context();
    if (!boundary || !ctx) {
      if (boundary) boundary.target.style.display = 'none';
      return false;
    }

    var before = nodesBetween(boundary.start, boundary.target);
    var after = nodesBetween(boundary.target, boundary.end);
    var beforeSpacer = spacer(ctx.frameDocument, BEFORE_SPACER_ID, ctx.image, 'beforebegin');
    var afterSpacer = spacer(ctx.frameDocument, AFTER_SPACER_ID, ctx.image, 'afterend');
    var beforeHeight = before.reduce(function (total, node) { return total + nodeHeight(node); }, 0);
    var afterHeight = after.reduce(function (total, node) { return total + nodeHeight(node); }, 0);
    beforeSpacer.style.height = beforeHeight + 'px';
    afterSpacer.style.height = afterHeight + 'px';

    var frameRect = ctx.frame.getBoundingClientRect();
    var imageRect = ctx.image.getBoundingClientRect();
    var left = frameRect.left + imageRect.left;
    var top = frameRect.top + imageRect.top;
    positionNodes(before, left, top - beforeHeight, imageRect.width, 'before');
    positionNodes(after, left, top + imageRect.height, imageRect.width, 'after');

    boundary.target.style.left = left + 'px';
    boundary.target.style.top = top + 'px';
    boundary.target.style.width = imageRect.width + 'px';
    boundary.target.style.height = imageRect.height + 'px';
    boundary.target.style.display = imageRect.width > 0 && imageRect.height > 0 ? 'block' : 'none';
    boundary.target.style.pointerEvents = isCrossOriginEditor() ? 'auto' : 'none';
    syncImageSource(boundary.target, ctx.image);
    return true;
  }

  function scheduleLayout() {
    if (layoutScheduled) return;
    layoutScheduled = true;
    global.requestAnimationFrame(function () {
      layoutScheduled = false;
      layout();
    });
  }

  function initialise() {
    var frame = document.getElementById(FRAME_ID);
    if (!frame) return;
    ensureBoundary();
    if (!observer && document.body) {
      observer = new MutationObserver(scheduleLayout);
      observer.observe(document.body, { childList: true, subtree: true });
    }
    if (frameWindow !== frame.contentWindow) {
      if (frameWindow) frameWindow.removeEventListener('scroll', scheduleLayout);
      frameWindow = frame.contentWindow;
      frameWindow.addEventListener('scroll', scheduleLayout, { passive: true });
    }
    scheduleLayout();
  }

  var frame = document.getElementById(FRAME_ID);
  if (frame) frame.addEventListener('load', function () { RETRY_DELAYS.forEach(function (delay) { global.setTimeout(initialise, delay); }); });
  global.addEventListener('resize', scheduleLayout, { passive: true });
  RETRY_DELAYS.forEach(function (delay) { global.setTimeout(initialise, delay); });
})(typeof window !== 'undefined' ? window : globalThis);
