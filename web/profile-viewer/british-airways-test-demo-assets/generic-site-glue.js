/**
 * generic-site-glue.js
 *
 * Zero-dependency interactivity shim for destaticized brand-scraper clones.
 * It only reads local markup and never calls a live backend.
 */
(function genericSiteGlue(global, doc) {
  'use strict';

  if (global.__genericSiteGlueRan) return;
  global.__genericSiteGlueRan = true;

  var STATE_CLASSES = ['is-open', 'open', 'is-active', 'active', 'show', 'expanded', 'visible'];
  var BOUND_ATTR = 'data-gsg-bound';

  function ready(fn) {
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  function once(el, fn) {
    if (!el || el.hasAttribute(BOUND_ATTR)) return;
    el.setAttribute(BOUND_ATTR, 'true');
    fn(el);
  }

  function toggleStateClasses(el, on) {
    STATE_CLASSES.forEach(function (name) { el.classList.toggle(name, on); });
  }

  var toastEl = null;
  var toastTimer = null;

  function ensureToast() {
    var existing = doc.querySelector('.toast, [data-toast], [role="status"]');
    if (existing) return existing;
    if (toastEl) return toastEl;
    toastEl = doc.createElement('div');
    toastEl.setAttribute('role', 'status');
    toastEl.setAttribute('aria-live', 'polite');
    toastEl.hidden = true;
    toastEl.style.cssText = [
      'position:fixed', 'left:50%', 'bottom:24px', 'transform:translateX(-50%)',
      'background:#111', 'color:#fff', 'padding:10px 18px', 'border-radius:6px',
      'font:14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
      'z-index:2147483000', 'box-shadow:0 4px 16px rgba(0,0,0,.25)', 'pointer-events:none'
    ].join(';');
    doc.body.appendChild(toastEl);
    return toastEl;
  }

  function showToast(message) {
    var el = ensureToast();
    el.textContent = message;
    el.hidden = false;
    el.style.display = '';
    global.clearTimeout(toastTimer);
    toastTimer = global.setTimeout(function () { el.hidden = true; }, 2600);
  }

  function wireDisclosures() {
    doc.querySelectorAll('[aria-expanded][aria-controls]').forEach(function (trigger) {
      once(trigger, function () {
        trigger.addEventListener('click', function () {
          var targetId = trigger.getAttribute('aria-controls');
          var target = targetId ? doc.getElementById(targetId) : null;
          var next = trigger.getAttribute('aria-expanded') !== 'true';
          trigger.setAttribute('aria-expanded', String(next));
          toggleStateClasses(trigger, next);
          if (target) {
            toggleStateClasses(target, next);
            if (target.hasAttribute('hidden') || !next) target.hidden = !next;
          }
        });
      });
    });

    doc.querySelectorAll('[data-toggle][data-target]').forEach(function (trigger) {
      once(trigger, function () {
        trigger.addEventListener('click', function (event) {
          var selector = trigger.getAttribute('data-target');
          var target = selector ? doc.querySelector(selector) : null;
          if (!target) return;
          event.preventDefault();
          var willShow = target.hasAttribute('hidden') || !target.classList.contains('is-open');
          toggleStateClasses(target, willShow);
          if (target.hasAttribute('hidden')) target.hidden = !willShow;
        });
      });
    });
  }

  function wireTabs() {
    doc.querySelectorAll('[role="tablist"]').forEach(function (tablist) {
      once(tablist, function () {
        var tabs = Array.prototype.slice.call(tablist.querySelectorAll('[role="tab"]'));
        tabs.forEach(function (tab) {
          tab.addEventListener('click', function () {
            tabs.forEach(function (candidate) {
              var selected = candidate === tab;
              candidate.setAttribute('aria-selected', String(selected));
              toggleStateClasses(candidate, selected);
              var panelId = candidate.getAttribute('aria-controls');
              var panel = panelId ? doc.getElementById(panelId) : null;
              if (panel) {
                panel.hidden = !selected;
                toggleStateClasses(panel, selected);
              }
            });
            var activeId = tab.getAttribute('aria-controls');
            var active = activeId ? doc.getElementById(activeId) : null;
            if (active && active.focus) active.focus({ preventScroll: true });
          });
        });
      });
    });
  }

  function findModalFor(trigger) {
    var selector = trigger.getAttribute('data-modal-target') || trigger.getAttribute('aria-controls');
    if (selector) return selector.charAt(0) === '#' ? doc.querySelector(selector) : doc.getElementById(selector);
    var href = trigger.getAttribute('href');
    return href && href.charAt(0) === '#' ? doc.querySelector(href) : null;
  }

  function openModal(modal) {
    if (!modal) return;
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    toggleStateClasses(modal, true);
    doc.body.classList.add('gsg-modal-open');
  }

  function closeModal(modal) {
    if (!modal) return;
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    toggleStateClasses(modal, false);
    doc.body.classList.remove('gsg-modal-open');
  }

  function wireModals() {
    doc.querySelectorAll('[aria-haspopup="dialog"], [data-modal-target]').forEach(function (trigger) {
      once(trigger, function () {
        trigger.addEventListener('click', function (event) {
          var modal = findModalFor(trigger);
          if (!modal) return;
          event.preventDefault();
          openModal(modal);
        });
      });
    });
    doc.querySelectorAll('[data-modal-close]').forEach(function (button) {
      once(button, function () {
        button.addEventListener('click', function (event) {
          var modal = button.closest('[role="dialog"], .modal, [data-modal]');
          if (!modal) return;
          event.preventDefault();
          closeModal(modal);
        });
      });
    });
    doc.querySelectorAll('[role="dialog"]').forEach(function (modal) {
      once(modal, function () {
        modal.addEventListener('click', function (event) {
          if (event.target === modal) closeModal(modal);
        });
      });
    });
    doc.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') doc.querySelectorAll('[role="dialog"]:not([hidden])').forEach(closeModal);
    });
  }

  function wireCarousels() {
    doc.querySelectorAll('[data-carousel], .carousel, .slider, .swiper').forEach(function (container) {
      once(container, function () {
        var track = container.querySelector('[data-carousel-track], .carousel__track, .slider__track, .swiper-wrapper') || container;
        var prev = container.querySelector('[data-carousel-prev], .carousel__prev, [aria-label*="previous" i], [class*="prev" i]');
        var next = container.querySelector('[data-carousel-next], .carousel__next, [aria-label*="next" i], [class*="next" i]');
        var firstChild = track.children && track.children[0];
        var step = firstChild ? firstChild.getBoundingClientRect().width + 16 : track.clientWidth * 0.8;
        if (prev) prev.addEventListener('click', function (event) {
          event.preventDefault();
          track.scrollBy({ left: -step, behavior: 'smooth' });
        });
        if (next) next.addEventListener('click', function (event) {
          event.preventDefault();
          track.scrollBy({ left: step, behavior: 'smooth' });
        });
      });
    });
  }

  function wireForms() {
    doc.querySelectorAll('form').forEach(function (form) {
      once(form, function () {
        form.addEventListener('submit', function (event) {
          event.preventDefault();
          var label = form.getAttribute('aria-label') || form.name || 'form';
          showToast('Demo interaction — "' + label + '" submission simulated');
        });
      });
    });
  }

  function wireAnchors() {
    doc.querySelectorAll('a[href^="#"]').forEach(function (link) {
      once(link, function () {
        link.addEventListener('click', function (event) {
          var id = link.getAttribute('href').slice(1);
          var target = id ? doc.getElementById(id) : null;
          if (!target) return;
          event.preventDefault();
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
          if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
          target.focus({ preventScroll: true });
        });
      });
    });
  }

  function wireDemoActions() {
    doc.querySelectorAll('[data-demo-action]').forEach(function (element) {
      once(element, function () {
        element.addEventListener('click', function () {
          showToast(element.getAttribute('data-demo-action') + ' selected — demo interaction');
        });
      });
    });
  }

  function wireBackToTop() {
    doc.querySelectorAll('#back-to-top, .back-to-top, [data-back-to-top], #scroll-top, .scroll-top').forEach(function (button) {
      once(button, function () {
        button.addEventListener('click', function (event) {
          event.preventDefault();
          global.scrollTo({ top: 0, behavior: 'smooth' });
        });
      });
    });
  }

  function init() {
    wireDisclosures();
    wireTabs();
    wireModals();
    wireCarousels();
    wireForms();
    wireAnchors();
    wireDemoActions();
    wireBackToTop();
  }

  ready(init);
})(typeof window !== 'undefined' ? window : this, document);
