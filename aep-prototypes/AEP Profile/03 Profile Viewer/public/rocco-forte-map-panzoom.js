/**
 * Rocco Forte Hotels — sharp pan/zoom for static map image (native pixel scale cap).
 */
(function roccoForteMapPanZoom(global) {
  'use strict';

  var HOTEL_BOUNDS = { minX: 0.395, minY: 0.22, maxX: 0.58, maxY: 0.62 };

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  /**
   * @param {{
   *   viewport: HTMLElement,
   *   scene: HTMLElement,
   *   image: HTMLImageElement,
   *   bounds?: { minX: number, minY: number, maxX: number, maxY: number },
   * }} config
   */
  function init(config) {
    var viewport = config.viewport;
    var scene = config.scene;
    var image = config.image;
    var bounds = config.bounds || HOTEL_BOUNDS;
    if (!viewport || !scene || !image) return null;

    var scale = 1;
    var tx = 0;
    var ty = 0;
    var minScale = 0.2;
    var maxScale = 1;
    var imgW = 0;
    var imgH = 0;
    var dragging = false;
    var dragStartX = 0;
    var dragStartY = 0;
    var dragOriginTx = 0;
    var dragOriginTy = 0;

    function applyTransform() {
      scene.style.transform = 'translate(' + tx + 'px, ' + ty + 'px) scale(' + scale + ')';
    }

    function viewportSize() {
      return { w: viewport.clientWidth, h: viewport.clientHeight };
    }

    function computeScaleLimits() {
      if (!imgW || !imgH) return;
      var vp = viewportSize();
      minScale = Math.min(vp.w / imgW, vp.h / imgH) * 0.92;
      maxScale = 1;
      scale = clamp(scale, minScale, maxScale);
    }

    function fitToBounds(targetBounds, paddingFactor) {
      if (!imgW || !imgH) return;
      var vp = viewportSize();
      if (!vp.w || !vp.h) return;
      var pad = typeof paddingFactor === 'number' ? paddingFactor : 0.06;
      var bx = targetBounds.minX * imgW;
      var by = targetBounds.minY * imgH;
      var bw = (targetBounds.maxX - targetBounds.minX) * imgW;
      var bh = (targetBounds.maxY - targetBounds.minY) * imgH;
      var padX = bw * pad;
      var padY = bh * pad;
      bx -= padX;
      by -= padY;
      bw += padX * 2;
      bh += padY * 2;
      var nextScale = Math.min(vp.w / bw, vp.h / bh);
      nextScale = clamp(nextScale, minScale, maxScale);
      scale = nextScale;
      tx = (vp.w - bw * scale) / 2 - bx * scale;
      ty = (vp.h - bh * scale) / 2 - by * scale;
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
      applyTransform();
    }

    function onWheel(e) {
      e.preventDefault();
      var factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
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
      applyTransform();
    }

    function onPointerUp(e) {
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
      computeScaleLimits();
      fitToBounds(bounds);
    }

    function onResize() {
      computeScaleLimits();
      applyTransform();
    }

    viewport.addEventListener('wheel', onWheel, { passive: false });
    viewport.addEventListener('pointerdown', onPointerDown);
    viewport.addEventListener('pointermove', onPointerMove);
    viewport.addEventListener('pointerup', onPointerUp);
    viewport.addEventListener('pointercancel', onPointerUp);
    viewport.addEventListener('pointerleave', onPointerUp);

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

    return {
      fitToBounds: fitToBounds,
      fitHotels: function () {
        fitToBounds(bounds);
      },
      fitFullMap: function () {
        if (!imgW || !imgH) return;
        var vp = viewportSize();
        scale = clamp(Math.min(vp.w / imgW, vp.h / imgH) * 0.98, minScale, maxScale);
        tx = (vp.w - imgW * scale) / 2;
        ty = (vp.h - imgH * scale) / 2;
        applyTransform();
      },
    };
  }

  global.RoccoForteMapPanZoom = { init: init, HOTEL_BOUNDS: HOTEL_BOUNDS };
})(typeof window !== 'undefined' ? window : globalThis);
