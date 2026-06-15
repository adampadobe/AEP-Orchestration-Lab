/**
 * Right-side Brand Concierge "Modal bar" shell (Adobe Ask-style pill + side panel).
 */
(function (global) {
  'use strict';

  var CACHE_BUST = '20260617-modal-bar-v3';
  var SPARKLE_SVG =
    '<svg class="bc-modal-bar__sparkle" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
    '<path d="M12 2.5l1.05 3.65L16.7 7.3l-3.65 1.75L12 12.5l-1.05-3.55L7.3 7.3l3.65-1.15L12 2.5z" stroke="currentColor" stroke-width="1.4" fill="none"/>' +
    '<path d="M6.2 14.2l.55 1.95 1.95.55-1.95.95-.55 1.95-.95-1.95-1.95-.55 1.95-.95.55-1.95.95 1.95 1.95.55z" fill="currentColor"/>' +
    '</svg>';
  var SEND_SVG =
    '<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M3.5 10.5 16.2 4.1c.55-.28 1.15.35.82.9L14.6 10l2.42 5c.33.55-.27 1.18-.82.9L3.5 10.5Z"/></svg>';
  var EXPAND_SVG =
    '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M8 3H3v5M12 3h5v5M12 17h5v-5M8 17H3v-5"/></svg>';

  function el(tag, className, html) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (html != null) node.innerHTML = html;
    return node;
  }

  function focusMountPrompt(mount) {
    var input = mount.querySelector(
      'input:not([type="hidden"]), textarea, [contenteditable="true"]',
    );
    if (input && typeof input.focus === 'function') input.focus();
  }

  function init(options) {
    var opt = options || {};
    if (document.getElementById('bcModalBarRoot')) {
      return global.BrandConciergeModalBar;
    }

    var panelTitle = String(opt.panelTitle || 'Ask').trim() || 'Ask';
    var pillLabel = String(opt.pillLabel || 'Ask a question').trim();
    var disclaimer = String(opt.disclaimer || '').trim();
    var betaLabel = String(opt.betaLabel || 'BETA').trim();
    var mountSelector = String(opt.mountSelector || '#bcModalBarMount').trim();

    var root = el('div', 'bc-modal-bar is-hidden');
    root.id = 'bcModalBarRoot';

    var panel = el('div', 'bc-modal-bar__panel');
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', panelTitle);

    var header = el('div', 'bc-modal-bar__panel-header');
    var titleRow = el('div', 'bc-modal-bar__title-row');
    titleRow.innerHTML = SPARKLE_SVG;
    titleRow.appendChild(el('h2', 'bc-modal-bar__title', panelTitle));
    titleRow.appendChild(el('span', 'bc-modal-bar__beta', betaLabel));
    header.appendChild(titleRow);

    var headerActions = el('div', 'bc-modal-bar__header-actions');
    var clearBtn = el('button', 'bc-modal-bar__clear-btn', 'Clear');
    clearBtn.type = 'button';
    var expandBtn = el('button', 'bc-modal-bar__icon-btn', EXPAND_SVG);
    expandBtn.type = 'button';
    expandBtn.setAttribute('aria-label', 'Expand panel');
    expandBtn.setAttribute('title', 'Expand panel');
    var closeBtn = el('button', 'bc-modal-bar__icon-btn', '&times;');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Minimise assistant');
    headerActions.appendChild(clearBtn);
    headerActions.appendChild(expandBtn);
    headerActions.appendChild(closeBtn);
    header.appendChild(headerActions);

    var body = el('div', 'bc-modal-bar__panel-body');
    var mount = el('div', 'bc-modal-bar__mount');
    mount.id = mountSelector.replace(/^#/, '') || 'bcModalBarMount';
    body.appendChild(mount);

    var footer = el('div', 'bc-modal-bar__panel-footer');
    if (disclaimer) footer.appendChild(el('p', 'bc-modal-bar__disclaimer', disclaimer));

    panel.appendChild(header);
    panel.appendChild(body);
    panel.appendChild(footer);

    var pillWrap = el('div', 'bc-modal-bar__pill');
    var pillBtn = el('button', 'bc-modal-bar__pill-btn');
    pillBtn.type = 'button';
    pillBtn.setAttribute('aria-label', 'Open assistant');
    var pillInner = el('div', 'bc-modal-bar__pill-inner');
    pillInner.innerHTML = SPARKLE_SVG;
    pillInner.appendChild(el('span', 'bc-modal-bar__pill-text', pillLabel));
    pillInner.appendChild(el('span', 'bc-modal-bar__beta', betaLabel));
    pillInner.appendChild(el('span', 'bc-modal-bar__pill-send', SEND_SVG));
    pillBtn.appendChild(pillInner);
    pillWrap.appendChild(pillBtn);

    root.appendChild(panel);
    root.appendChild(pillWrap);
    document.body.appendChild(root);

    function setExpanded(on) {
      root.classList.toggle('is-expanded', !!on);
    }

    function openPanel() {
      setExpanded(true);
      if (typeof opt.onExpand === 'function') opt.onExpand(mount);
      window.setTimeout(function () {
        focusMountPrompt(mount);
      }, 180);
    }

    function setVisible(on) {
      root.classList.toggle('is-hidden', !on);
      if (!on) {
        setExpanded(false);
        root.classList.remove('is-wide');
      }
    }

    function clearConversation() {
      var inputs = mount.querySelectorAll('input, textarea, [contenteditable="true"]');
      var i;
      for (i = 0; i < inputs.length; i++) {
        if (inputs[i].getAttribute('contenteditable') === 'true') {
          inputs[i].textContent = '';
        } else {
          inputs[i].value = '';
        }
        inputs[i].dispatchEvent(new Event('input', { bubbles: true }));
      }
    }

    pillBtn.addEventListener('click', function () {
      openPanel();
    });
    closeBtn.addEventListener('click', function () {
      setExpanded(false);
    });
    expandBtn.addEventListener('click', function () {
      root.classList.toggle('is-wide');
      expandBtn.setAttribute(
        'aria-label',
        root.classList.contains('is-wide') ? 'Narrow panel' : 'Expand panel',
      );
    });
    clearBtn.addEventListener('click', clearConversation);

    var api = {
      root: root,
      mount: mount,
      setVisible: setVisible,
      setExpanded: setExpanded,
      openPanel: openPanel,
    };
    global.BrandConciergeModalBar = api;
    return api;
  }

  global.BrandConciergeModalBar = { CACHE_BUST: CACHE_BUST, init: init };
})(typeof window !== 'undefined' ? window : globalThis);
