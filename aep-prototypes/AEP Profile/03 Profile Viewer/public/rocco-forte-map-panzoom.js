/**
 * Rocco Forte Hotels — viewport pan/zoom over a fixed-size map (cover fill, wheel zoom).
 */
(function roccoForteMapPanZoom(global) {
  'use strict';

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  /**
   * @param {{
   *   viewport: HTMLElement,
   *   scene: HTMLElement,
   *   image: HTMLImageElement,
   *   panel?: HTMLElement,
   * }} config
   */
  function init(config) {
    var viewport = config.viewport;
    var scene = config.scene;
    var image = config.image;
    var panel = config.panel || viewport;
    if (!viewport || !scene || !image) return null;

    var scale = 1;
    var tx = 0;
    var ty = 0;
    var minScale = 1;
    var maxScale = 1;
    var imgW = 0;
    var imgH = 0;
    var dragging = false;
    var dragStartX = 0;
    var dragStartY = 0;
    var dragOriginTx = 0;
    var dragOriginTy = 0;

    function viewportSize() {
      return { w: viewport.clientWidth, h: viewport.clientHeight };
    }

    function coverScale() {
      var vp = viewportSize();
      if (!imgW || !imgH || !vp.w || !vp.h) return 1;
      return Math.max(vp.w / imgW, vp.h / imgH);
    }

    function applyTransform() {
      scene.style.transform = 'translate(' + tx + 'px, ' + ty + 'px) scale(' + scale + ')';
    }

    function constrainPan() {
      var vp = viewportSize();
      var scaledW = imgW * scale;
      var scaledH = imgH * scale;
      if (scaledW <= vp.w) tx = (vp.w - scaledW) / 2;
      else tx = clamp(tx, vp.w - scaledW, 0);
      if (scaledH <= vp.h) ty = (vp.h - scaledH) / 2;
      else ty = clamp(ty, vp.h - scaledH, 0);
    }

    function computeScaleLimits() {
      minScale = coverScale();
      maxScale = Math.max(minScale * 2.75, minScale + 0.35);
      maxScale = Math.min(maxScale, 1);
      scale = clamp(scale, minScale, maxScale);
      constrainPan();
    }

    function fitCover() {
      if (!imgW || !imgH) return;
      scale = coverScale();
      computeScaleLimits();
      constrainPan();
      applyTransform();
    }

    function zoomAt(clientX, clientY, factor) {
      var rect = viewport.getBoundingClientRect();
      var mx = clientX - rect.left;
      var my = clientY - rect.top;
      var nextScale = clamp(scale * factor, minScale, maxScale);
      if (nextScale === scale) return;
      var sceneX = (mx - tx) / scale;
      var sceneY = (my - ty) / scale;
      scale = nextScale;
      tx = mx - sceneX * scale;
      ty = my - sceneY * scale;
      constrainPan();
      applyTransform();
    }

    function onWheel(e) {
      if (!panel.contains(e.target) && e.target !== panel && e.target !== viewport) {
        var rect = panel.getBoundingClientRect();
        if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
          return;
        }
      }
      e.preventDefault();
      e.stopPropagation();
      var factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      zoomAt(e.clientX, e.clientY, factor);
    }

    function onPointerDown(e) {
      if (e.button !== 0) return;
      dragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      dragOriginTx = tx;
      dragOriginTy = ty;
      viewport.classList.add('is-dragging');
      if (viewport.setPointerCapture) viewport.setPointerCapture(e.pointerId);
    }

    function onPointerMove(e) {
      if (!dragging) return;
      tx = dragOriginTx + (e.clientX - dragStartX);
      ty = dragOriginTy + (e.clientY - dragStartY);
      constrainPan();
      applyTransform();
    }

    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      viewport.classList.remove('is-dragging');
      if (viewport.releasePointerCapture) {
        try {
          viewport.releasePointerCapture(e.pointerId);
        } catch (_err) {
          /* noop */
        }
      }
    }

    function onImageReady() {
      imgW = image.naturalWidth;
      imgH = image.naturalHeight;
      image.style.width = imgW + 'px';
      image.style.height = imgH + 'px';
      scene.style.width = imgW + 'px';
      scene.style.height = imgH + 'px';
      fitCover();
    }

    function onResize() {
      var prevCenterX = (viewport.clientWidth / 2 - tx) / scale;
      var prevCenterY = (viewport.clientHeight / 2 - ty) / scale;
      computeScaleLimits();
      tx = viewport.clientWidth / 2 - prevCenterX * scale;
      ty = viewport.clientHeight / 2 - prevCenterY * scale;
      constrainPan();
      applyTransform();
    }

    panel.addEventListener('wheel', onWheel, { passive: false, capture: true });
    viewport.addEventListener('wheel', onWheel, { passive: false });
    viewport.addEventListener('pointerdown', onPointerDown);
    viewport.addEventListener('pointermove', onPointerMove);
    viewport.addEventListener('pointerup', endDrag);
    viewport.addEventListener('pointercancel', endDrag);
    viewport.addEventListener('pointerleave', endDrag);
    viewport.setAttribute('tabindex', '0');
    viewport.setAttribute('role', 'application');
    viewport.setAttribute('aria-label', 'Interactive hotel map. Scroll to zoom, drag to pan.');

    if (typeof global.ResizeObserver !== 'undefined') {
      var ro = new global.ResizeObserver(onResize);
      ro.observe(viewport);
    } else {
      global.addEventListener('resize', onResize);
    }

    if (image.complete && image.naturalWidth) {
      onImageReady();
    } else {
      image.addEventListener('load', onImageReady, { once: true });
    }

    return { fitCover: fitCover, zoomAt: zoomAt };
  }

  global.RoccoForteMapPanZoom = { init: init };
})(typeof window !== 'undefined' ? window : globalThis);
