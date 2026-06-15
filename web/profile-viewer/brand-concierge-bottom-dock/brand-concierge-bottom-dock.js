/**
 * Brand-agnostic centre-bottom Brand Concierge dock shell (JLR Ask layout pattern).
 */
(function (global) {
  'use strict';

  var CACHE_BUST = '20260613';
  var SPARKLE_SVG =
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2l1.2 4.2L17 8l-3.8 1.8L12 14l-1.2-4.2L7 8l3.8-1.8L12 2z" fill="currentColor"/></svg>';

  function el(tag, className, html) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (html != null) node.innerHTML = html;
    return node;
  }

  function init(options) {
    var opt = options || {};
    if (document.getElementById('bcBottomDockRoot')) {
      return global.BrandConciergeBottomDock;
    }

    var ctaLabel = String(opt.ctaLabel || 'ASK').trim() || 'ASK';
    var placeholder = String(opt.placeholder || 'Ask a question…').trim();
    var disclaimer = String(opt.disclaimer || '').trim();
    var panelTitle = String(opt.panelTitle || 'Assistant').trim();
    var betaLabel = String(opt.betaLabel || 'BETA').trim();
    var mountSelector = String(opt.mountSelector || '#bcBottomDockMount').trim();

    var root = el('div', 'bc-bottom-dock is-hidden');
    root.id = 'bcBottomDockRoot';

    var panel = el('div', 'bc-bottom-dock__panel');
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', panelTitle);

    var header = el('div', 'bc-bottom-dock__panel-header');
    var titleRow = el('div', 'bc-bottom-dock__panel-title-row');
    titleRow.appendChild(el('h2', 'bc-bottom-dock__panel-title', panelTitle));
    titleRow.appendChild(el('span', 'bc-bottom-dock__beta', betaLabel));
    header.appendChild(titleRow);

    var controls = el('div', 'bc-bottom-dock__panel-controls');
    var minBtn = el('button', 'bc-bottom-dock__icon-btn', '&minus;');
    minBtn.type = 'button';
    minBtn.setAttribute('aria-label', 'Minimise assistant');
    var closeBtn = el('button', 'bc-bottom-dock__icon-btn', '&times;');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close assistant');
    controls.appendChild(minBtn);
    controls.appendChild(closeBtn);
    header.appendChild(controls);

    var body = el('div', 'bc-bottom-dock__panel-body');
    var mount = el('div', 'bc-bottom-dock__mount');
    mount.id = mountSelector.replace(/^#/, '') || 'bcBottomDockMount';
    body.appendChild(mount);

    var footer = el('div', 'bc-bottom-dock__panel-footer');
    if (disclaimer) footer.appendChild(el('p', 'bc-bottom-dock__disclaimer', disclaimer));

    panel.appendChild(header);
    panel.appendChild(body);
    panel.appendChild(footer);

    var dock = el('div', 'bc-bottom-dock__dock');
    var brand = el('button', 'bc-bottom-dock__brand');
    brand.type = 'button';
    brand.appendChild(el('span', 'bc-bottom-dock__brand-icon', SPARKLE_SVG));
    brand.appendChild(document.createTextNode(ctaLabel));

    var dockInputWrap = el('div', 'bc-bottom-dock__dock-input-wrap');
    var dockInput = el('input', 'bc-bottom-dock__dock-input');
    dockInput.type = 'text';
    dockInput.placeholder = placeholder;
    dockInput.setAttribute('autocomplete', 'off');
    dockInput.setAttribute('spellcheck', 'false');
    dockInputWrap.appendChild(dockInput);

    var dockActions = el('div', 'bc-bottom-dock__dock-actions');
    dockActions.appendChild(el('span', 'bc-bottom-dock__beta', betaLabel));
    dock.appendChild(brand);
    dock.appendChild(dockInputWrap);
    dock.appendChild(dockActions);

    root.appendChild(panel);
    root.appendChild(dock);
    document.body.appendChild(root);

    function setExpanded(on) {
      root.classList.toggle('is-expanded', !!on);
      if (!on) root.classList.remove('bc-bottom-dock--typing');
    }

    function setTyping(on) {
      root.classList.toggle('bc-bottom-dock--typing', !!on);
    }

    function syncTypingFromDockInput() {
      setTyping(!!String(dockInput.value || '').trim());
    }

    function bindMountTyping() {
      if (mount.dataset.typingBound === '1') return;
      mount.dataset.typingBound = '1';
      mount.addEventListener('input', function (e) {
        var t = e.target;
        if (!t || (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA')) return;
        setTyping(!!String(t.value || '').trim());
      });
      mount.addEventListener('focusin', function (e) {
        var t = e.target;
        if (!t || (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA')) return;
        if (String(t.value || '').trim()) setTyping(true);
      });
    }

    function setVisible(on) {
      root.classList.toggle('is-hidden', !on);
      if (!on) setExpanded(false);
    }

    function openPanel() {
      setExpanded(true);
      bindMountTyping();
      window.setTimeout(function () {
        dockInput.focus();
      }, 50);
      if (typeof opt.onExpand === 'function') opt.onExpand(mount);
    }

    brand.addEventListener('click', openPanel);
    dockInput.addEventListener('focus', openPanel);
    dockInput.addEventListener('input', syncTypingFromDockInput);
    minBtn.addEventListener('click', function () {
      setExpanded(false);
    });
    closeBtn.addEventListener('click', function () {
      setExpanded(false);
    });

    dockInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        openPanel();
      }
    });

    var api = {
      root: root,
      mount: mount,
      setVisible: setVisible,
      setExpanded: setExpanded,
      openPanel: openPanel,
    };
    global.BrandConciergeBottomDock = api;
    return api;
  }

  global.BrandConciergeBottomDock = { CACHE_BUST: CACHE_BUST, init: init };
})(typeof window !== 'undefined' ? window : globalThis);
