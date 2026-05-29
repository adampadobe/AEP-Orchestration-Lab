/**
 * Ask JLR UI — dock bar expands to chat panel; delegates search to JlrAskEngine.
 */
(function () {
  'use strict';

  var SPARKLE_SVG =
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2l1.2 4.2L17 8l-3.8 1.8L12 14l-1.2-4.2L7 8l3.8-1.8L12 2z" fill="currentColor"/><path d="M5 18l.5 1.8 1.7.5-1.7.5L5 22l-.5-1.7-1.7-.5 1.7-.5.5-1.8z" fill="currentColor" opacity=".7"/></svg>';

  var SEND_SVG =
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3.4 20.6l17-8.5a1 1 0 000-1.8l-17-8.5a1 1 0 00-1.45 1.12l2.3 7.9-2.3 7.9a1 1 0 001.45 1.12z" fill="currentColor"/></svg>';

  function el(tag, className, html) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (html != null) node.innerHTML = html;
    return node;
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderCards(cards) {
    if (!cards || !cards.length) return null;
    var wrap = el('div', 'jlr-ask__cards');
    cards.forEach(function (card) {
      var item = el('article', 'jlr-ask__card');
      var imgWrap = el('div', 'jlr-ask__card-image-wrap');
      var img = el('img', 'jlr-ask__card-image');
      img.src = card.imageUrl || '';
      img.alt = card.title || 'Vehicle';
      img.loading = 'lazy';
      img.decoding = 'async';
      imgWrap.appendChild(img);
      var body = el('div', 'jlr-ask__card-body');
      var titleRow = el('div', 'jlr-ask__card-title-row');
      titleRow.appendChild(el('h3', 'jlr-ask__card-title', escapeHtml(card.title)));
      if (card.badge) titleRow.appendChild(el('span', 'jlr-ask__card-badge', escapeHtml(card.badge)));
      body.appendChild(titleRow);
      body.appendChild(el('p', 'jlr-ask__card-desc', escapeHtml(card.description)));
      var link = el('a', 'jlr-ask__card-link');
      link.href = card.pageUrl || '#';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'View on official site';
      body.appendChild(link);
      item.appendChild(imgWrap);
      item.appendChild(body);
      wrap.appendChild(item);
    });
    return wrap;
  }

  function initJlrAsk() {
    if (!document.body.classList.contains('jlr-demo-page')) return;
    if (document.getElementById('jlrAskRoot')) return;

    var root = el('div', 'jlr-ask');
    root.id = 'jlrAskRoot';

    var dismissDock = el('button', 'jlr-ask__dismiss-dock', '&times;');
    dismissDock.type = 'button';
    dismissDock.setAttribute('aria-label', 'Hide Ask JLR');

    var panel = el('div', 'jlr-ask__panel');
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', 'Ask JLR chat');

    var header = el('div', 'jlr-ask__panel-header');
    var titleRow = el('div', 'jlr-ask__panel-title-row');
    titleRow.appendChild(el('h2', 'jlr-ask__panel-title', 'Ask JLR'));
    titleRow.appendChild(el('span', 'jlr-ask__beta', 'BETA'));
    header.appendChild(titleRow);

    var controls = el('div', 'jlr-ask__panel-controls');
    var infoBtn = el('button', 'jlr-ask__icon-btn', 'i');
    infoBtn.type = 'button';
    infoBtn.setAttribute('aria-label', 'About Ask JLR');
    var minBtn = el('button', 'jlr-ask__icon-btn', '&minus;');
    minBtn.type = 'button';
    minBtn.setAttribute('aria-label', 'Minimise Ask JLR');
    var closeBtn = el('button', 'jlr-ask__icon-btn', '&times;');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close Ask JLR');
    controls.appendChild(infoBtn);
    controls.appendChild(minBtn);
    controls.appendChild(closeBtn);
    header.appendChild(controls);

    var infoPop = el('div', 'jlr-ask__info-pop');
    infoPop.hidden = true;
    infoPop.textContent =
      'Ask JLR uses the UK model catalogue in this demo. Responses are generated locally — not live Brand Concierge. Jaguar models appear only when you mention Jaguar. Drop an image file (e.g. defender-red.jpg) to match by file name.';

    var messages = el('div', 'jlr-ask__messages');
    messages.setAttribute('aria-live', 'polite');

    var intro = el('div', 'jlr-ask__intro');
    var avatar = el('div', 'jlr-ask__avatar', SPARKLE_SVG);
    var introBubble = el('div', 'jlr-ask__bubble jlr-ask__bubble--assistant');
    introBubble.textContent =
      'Ask about Range Rover, Defender and Discovery — electric and hybrid options, colours, doors, and availability. Mention Jaguar to include approved-used Jaguar models. Or drop an image file named like defender-red.jpg to find a match.';
    intro.appendChild(avatar);
    intro.appendChild(introBubble);
    messages.appendChild(intro);

    var footer = el('div', 'jlr-ask__panel-footer');
    var panelInputRow = el('div', 'jlr-ask__panel-input-row');
    var panelInput = el('input', 'jlr-ask__panel-input');
    panelInput.type = 'text';
    panelInput.id = 'jlrAskPanelInput';
    panelInput.placeholder = 'Type your question here…';
    panelInput.setAttribute('autocomplete', 'off');
    panelInput.setAttribute('spellcheck', 'false');
    var panelSend = el('button', 'jlr-ask__send-btn', SEND_SVG);
    panelSend.type = 'button';
    panelSend.setAttribute('aria-label', 'Send message');
    panelInputRow.appendChild(panelInput);
    panelInputRow.appendChild(panelSend);
    footer.appendChild(panelInputRow);
    footer.appendChild(
      el(
        'p',
        'jlr-ask__disclaimer',
        'This assistant uses demo catalogue data and may provide incomplete responses. Not affiliated with JLR.',
      ),
    );

    panel.appendChild(header);
    panel.appendChild(infoPop);
    panel.appendChild(messages);

    var dropOverlay = el('div', 'jlr-ask__drop-overlay');
    dropOverlay.innerHTML =
      '<div class="jlr-ask__drop-overlay-inner"><strong>Drop image to search</strong><span>File name drives the match — e.g. defender-red.jpg</span></div>';
    panel.appendChild(dropOverlay);

    panel.appendChild(footer);

    var dock = el('div', 'jlr-ask__dock');
    var brand = el('div', 'jlr-ask__brand');
    brand.appendChild(el('span', 'jlr-ask__brand-icon', SPARKLE_SVG));
    brand.appendChild(document.createTextNode('ASK JLR'));
    var dockInputWrap = el('div', 'jlr-ask__dock-input-wrap');
    var dockInput = el('input', 'jlr-ask__dock-input');
    dockInput.type = 'text';
    dockInput.id = 'jlrAskDockInput';
    dockInput.placeholder = 'Ask about models, colours, electric options, and availability…';
    dockInput.setAttribute('autocomplete', 'off');
    dockInput.setAttribute('spellcheck', 'false');
    dockInputWrap.appendChild(dockInput);
    var dockActions = el('div', 'jlr-ask__dock-actions');
    dockActions.appendChild(el('span', 'jlr-ask__beta', 'BETA'));
    var dockSend = el('button', 'jlr-ask__send-btn', SEND_SVG);
    dockSend.type = 'button';
    dockSend.setAttribute('aria-label', 'Send message');
    dockActions.appendChild(dockSend);
    dock.appendChild(brand);
    dock.appendChild(dockInputWrap);
    dock.appendChild(dockActions);

    root.appendChild(dismissDock);
    root.appendChild(panel);
    root.appendChild(dock);
    document.body.appendChild(root);

    var expanded = false;
    var busy = false;

    function setExpanded(on) {
      expanded = !!on;
      root.classList.toggle('is-expanded', expanded);
      if (expanded) {
        window.setTimeout(function () {
          panelInput.focus();
        }, 50);
      }
    }

    function appendUserBubble(text) {
      var bubble = el('div', 'jlr-ask__bubble jlr-ask__bubble--user');
      bubble.textContent = text;
      messages.appendChild(bubble);
      messages.scrollTop = messages.scrollHeight;
    }

    function appendUserFileBubble(file) {
      var bubble = el('div', 'jlr-ask__bubble jlr-ask__bubble--user jlr-ask__bubble--file');
      var label = el('span', 'jlr-ask__file-label', '📎 ' + (file.name || 'image'));
      bubble.appendChild(label);
      if (file.type && file.type.indexOf('image/') === 0) {
        var thumb = el('img', 'jlr-ask__file-thumb');
        thumb.alt = '';
        var objUrl = URL.createObjectURL(file);
        thumb.src = objUrl;
        window.setTimeout(function () {
          URL.revokeObjectURL(objUrl);
        }, 60000);
        bubble.appendChild(thumb);
      }
      messages.appendChild(bubble);
      messages.scrollTop = messages.scrollHeight;
    }

    function appendTyping() {
      var typing = el('div', 'jlr-ask__typing');
      typing.setAttribute('data-jlr-ask-typing', '1');
      typing.innerHTML = '<span></span><span></span><span></span>';
      messages.appendChild(typing);
      messages.scrollTop = messages.scrollHeight;
      return typing;
    }

    function appendAssistantReply(introText, cards) {
      var block = el('div', 'jlr-ask__intro');
      block.appendChild(el('div', 'jlr-ask__avatar', SPARKLE_SVG));
      var col = el('div');
      col.appendChild(el('div', 'jlr-ask__bubble jlr-ask__bubble--assistant', escapeHtml(introText)));
      var cardsEl = renderCards(cards);
      if (cardsEl) col.appendChild(cardsEl);
      block.appendChild(col);
      messages.appendChild(block);
      messages.scrollTop = messages.scrollHeight;
    }

    function sendMessage(raw) {
      var text = String(raw || '').trim();
      if (!text || busy) return;
      if (typeof JlrAskEngine === 'undefined') return;

      setExpanded(true);
      busy = true;
      appendUserBubble(text);
      dockInput.value = '';
      panelInput.value = '';
      var typingEl = appendTyping();

      window.setTimeout(function () {
        JlrAskEngine.query(text)
          .then(function (result) {
            if (typingEl && typingEl.parentNode) typingEl.parentNode.removeChild(typingEl);
            appendAssistantReply(result.intro || 'Here are some options.', result.cards || []);
          })
          .catch(function () {
            if (typingEl && typingEl.parentNode) typingEl.parentNode.removeChild(typingEl);
            appendAssistantReply('Something went wrong loading the catalogue. Please try again.', []);
          })
          .finally(function () {
            busy = false;
          });
      }, 450);
    }

    function sendFile(file) {
      if (!file || busy) return;
      if (typeof JlrAskEngine === 'undefined' || typeof JlrAskEngine.queryFromFilename !== 'function') return;

      setExpanded(true);
      busy = true;
      appendUserFileBubble(file);
      dockInput.value = '';
      panelInput.value = '';
      var typingEl = appendTyping();

      window.setTimeout(function () {
        JlrAskEngine.queryFromFilename(file.name || '')
          .then(function (result) {
            if (typingEl && typingEl.parentNode) typingEl.parentNode.removeChild(typingEl);
            appendAssistantReply(result.intro || 'Here is a match from your file name.', result.cards || []);
          })
          .catch(function () {
            if (typingEl && typingEl.parentNode) typingEl.parentNode.removeChild(typingEl);
            appendAssistantReply('Something went wrong reading that file name. Please try again.', []);
          })
          .finally(function () {
            busy = false;
          });
      }, 550);
    }

    function handleDragOver(e) {
      e.preventDefault();
      e.stopPropagation();
      root.classList.add('is-dragover');
    }

    function handleDragLeave(e) {
      e.preventDefault();
      e.stopPropagation();
      if (e.currentTarget === root && !root.contains(e.relatedTarget)) {
        root.classList.remove('is-dragover');
      }
    }

    function handleDrop(e) {
      e.preventDefault();
      e.stopPropagation();
      root.classList.remove('is-dragover');
      var files = e.dataTransfer && e.dataTransfer.files;
      if (!files || !files.length) return;
      var file = files[0];
      sendFile(file);
    }

    ['dragenter', 'dragover'].forEach(function (evt) {
      root.addEventListener(evt, handleDragOver);
    });
    root.addEventListener('dragleave', handleDragLeave);
    root.addEventListener('drop', handleDrop);

    function onDockFocus() {
      setExpanded(true);
    }

    dockInput.addEventListener('focus', onDockFocus);
    dockInput.addEventListener('input', function () {
      if (!expanded) setExpanded(true);
      panelInput.value = dockInput.value;
    });
    panelInput.addEventListener('input', function () {
      dockInput.value = panelInput.value;
    });

    dockInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendMessage(dockInput.value);
      }
    });
    panelInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        sendMessage(panelInput.value);
      }
    });

    dockSend.addEventListener('click', function () {
      sendMessage(dockInput.value);
    });
    panelSend.addEventListener('click', function () {
      sendMessage(panelInput.value);
    });

    minBtn.addEventListener('click', function () {
      setExpanded(false);
    });
    closeBtn.addEventListener('click', function () {
      root.classList.add('is-dismissed');
    });
    dismissDock.addEventListener('click', function () {
      root.classList.add('is-dismissed');
    });
    infoBtn.addEventListener('click', function () {
      infoPop.hidden = !infoPop.hidden;
    });

    if (typeof JlrAskEngine !== 'undefined') {
      void JlrAskEngine.loadModels();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initJlrAsk);
  } else {
    initJlrAsk();
  }
})();
