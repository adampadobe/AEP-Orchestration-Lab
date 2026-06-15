/**
 * Right-side Brand Concierge "Modal bar" shell (Adobe Ask-style pill + side panel).
 */
(function (global) {
  'use strict';

  var CACHE_BUST = '20260617-modal-bar';
  var SPARKLE_SVG =
    '<svg class="bc-modal-bar__sparkle" viewBox="0 0 24 24" fill="none" aria-hidden="true">' +
    '<path d="M12 2.5l1.05 3.65L16.7 7.3l-3.65 1.75L12 12.5l-1.05-3.55L7.3 7.3l3.65-1.15L12 2.5z" stroke="currentColor" stroke-width="1.4" fill="none"/>' +
    '<path d="M6.2 14.2l.55 1.95 1.95.55-1.95.95-.55 1.95-.95-1.95-1.95-.55 1.95-.95.55-1.95.95 1.95 1.95.55z" fill="currentColor"/>' +
    '</svg>';
  var SEND_SVG =
    '<svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M3.5 10.5 16.2 4.1c.55-.28 1.15.35.82.9L14.6 10l2.42 5c.33.55-.27 1.18-.82.9L3.5 10.5Z"/></svg>';
  var EXPAND_SVG =
    '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M8 3H3v5M12 3h5v5M12 17h5v-5M8 17H3v-5"/></svg>';
  var DEFAULT_SUGGESTIONS = [
    'Where can I go to learn about AI on Experience League?',
    'Getting started with Experience Manager',
    'Set up an Adobe Analytics report suite',
    'Explain Adobe Target A/B testing',
  ];

  function el(tag, className, html) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (html != null) node.innerHTML = html;
    return node;
  }

  function buildSuggestions(parent, items, onPick) {
    items.forEach(function (text) {
      var btn = el('button', 'bc-modal-bar__suggestion');
      btn.type = 'button';
      btn.innerHTML =
        '<span class="bc-modal-bar__suggestion-sparkle">' +
        SPARKLE_SVG +
        '</span><span>' +
        String(text).replace(/</g, '&lt;') +
        '</span>';
      btn.addEventListener('click', function () {
        onPick(text);
      });
      parent.appendChild(btn);
    });
  }

  function init(options) {
    var opt = options || {};
    if (document.getElementById('bcModalBarRoot')) {
      return global.BrandConciergeModalBar;
    }

    var panelTitle = String(opt.panelTitle || 'Ask').trim() || 'Ask';
    var placeholder = String(opt.placeholder || 'Ask a question…').trim();
    var pillLabel = String(opt.pillLabel || 'Ask a question').trim();
    var disclaimer = String(opt.disclaimer || '').trim();
    var betaLabel = String(opt.betaLabel || 'BETA').trim();
    var introTitle = String(
      opt.introTitle || 'Not sure where to start? Ask me anything about Adobe products.',
    ).trim();
    var introSub = String(opt.introSub || 'Type your question or pick a suggestion below.').trim();
    var mountSelector = String(opt.mountSelector || '#bcModalBarMount').trim();
    var suggestions = Array.isArray(opt.suggestions) && opt.suggestions.length ? opt.suggestions : DEFAULT_SUGGESTIONS;

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

    var intro = el('div', 'bc-modal-bar__intro');
    intro.appendChild(el('p', 'bc-modal-bar__intro-title', introTitle));
    intro.appendChild(el('p', 'bc-modal-bar__intro-sub', introSub));

    var suggestionsHost = el('div', 'bc-modal-bar__suggestions');
    var body = el('div', 'bc-modal-bar__panel-body');
    var mount = el('div', 'bc-modal-bar__mount');
    mount.id = mountSelector.replace(/^#/, '') || 'bcModalBarMount';
    body.appendChild(mount);

    var composerWrap = el('div', 'bc-modal-bar__composer-wrap');
    var composer = el('div', 'bc-modal-bar__composer');
    var composerInner = el('div', 'bc-modal-bar__composer-inner');
    composerInner.innerHTML = SPARKLE_SVG;
    var composerInput = el('input', 'bc-modal-bar__composer-input');
    composerInput.type = 'text';
    composerInput.placeholder = placeholder;
    composerInput.setAttribute('autocomplete', 'off');
    composerInput.setAttribute('spellcheck', 'false');
    composerInner.appendChild(composerInput);
    composerInner.appendChild(el('span', 'bc-modal-bar__beta', betaLabel));
    var sendBtn = el('button', 'bc-modal-bar__send-btn', SEND_SVG);
    sendBtn.type = 'button';
    sendBtn.setAttribute('aria-label', 'Send question');
    composer.appendChild(composerInner);
    composer.appendChild(sendBtn);
    composerWrap.appendChild(composer);
    if (disclaimer) composerWrap.appendChild(el('p', 'bc-modal-bar__disclaimer', disclaimer));

    panel.appendChild(header);
    panel.appendChild(intro);
    panel.appendChild(suggestionsHost);
    panel.appendChild(body);
    panel.appendChild(composerWrap);

    var pill = el('div', 'bc-modal-bar__pill');
    var pillBtn = el('button', 'bc-modal-bar__pill-btn');
    pillBtn.type = 'button';
    pillBtn.setAttribute('aria-label', 'Open assistant');
    var pillInner = el('div', 'bc-modal-bar__pill-inner');
    pillInner.innerHTML = SPARKLE_SVG;
    pillInner.appendChild(el('span', 'bc-modal-bar__pill-text', pillLabel));
    pillInner.appendChild(el('span', 'bc-modal-bar__beta', betaLabel));
    pillInner.appendChild(el('span', 'bc-modal-bar__pill-send', SEND_SVG));
    pillBtn.appendChild(pillInner);
    pill.appendChild(pillBtn);

    root.appendChild(panel);
    root.appendChild(pill);
    document.body.appendChild(root);

    function setExpanded(on) {
      root.classList.toggle('is-expanded', !!on);
      if (on) {
        window.setTimeout(function () {
          composerInput.focus();
        }, 50);
        if (typeof opt.onExpand === 'function') opt.onExpand(mount);
      }
    }

    function setVisible(on) {
      root.classList.toggle('is-hidden', !on);
      if (!on) {
        setExpanded(false);
        root.classList.remove('is-wide');
      }
    }

    function applyQuestion(text) {
      var q = String(text || '').trim();
      if (!q) return;
      composerInput.value = q;
      var inputs = mount.querySelectorAll('input, textarea');
      var i;
      for (i = 0; i < inputs.length; i++) {
        inputs[i].value = q;
        inputs[i].dispatchEvent(new Event('input', { bubbles: true }));
      }
      setExpanded(true);
    }

    function clearConversation() {
      composerInput.value = '';
      var inputs = mount.querySelectorAll('input, textarea');
      var i;
      for (i = 0; i < inputs.length; i++) {
        inputs[i].value = '';
        inputs[i].dispatchEvent(new Event('input', { bubbles: true }));
      }
    }

    buildSuggestions(suggestionsHost, suggestions, applyQuestion);

    pillBtn.addEventListener('click', function () {
      setExpanded(true);
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
    sendBtn.addEventListener('click', function () {
      applyQuestion(composerInput.value);
    });
    composerInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        applyQuestion(composerInput.value);
      }
    });

    var api = {
      root: root,
      mount: mount,
      setVisible: setVisible,
      setExpanded: setExpanded,
      openPanel: function () {
        setExpanded(true);
      },
    };
    global.BrandConciergeModalBar = api;
    return api;
  }

  global.BrandConciergeModalBar = { CACHE_BUST: CACHE_BUST, init: init };
})(typeof window !== 'undefined' ? window : globalThis);
