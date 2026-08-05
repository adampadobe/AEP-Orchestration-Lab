/**
 * Makes the one-time MCP secret behaviour actionable when a key was created in
 * another browser session. Plaintext secrets remain browser-session-only.
 */
(function (global) {
  'use strict';

  var MODAL_ID = 'mcpLabKeyRecoveryModal';

  function closeRecoveryModal() {
    var modal = document.getElementById(MODAL_ID);
    if (modal) modal.remove();
    document.body.classList.remove('mcp-key-modal-open');
  }

  function selectedKeyName() {
    var firstValue = document.querySelector(
      '#mcpLabKeyCurrentSection .mcp-key-current-meta-row dd',
    );
    return firstValue ? String(firstValue.textContent || '').trim() : 'this key';
  }

  function prepareAdditionalKey() {
    closeRecoveryModal();
    var input = document.getElementById('mcpLabKeyNameInput');
    if (!input) return;
    if (!String(input.value || '').trim()) input.value = 'Adobe Coworker';
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    input.focus();
    input.select();
  }

  function rotateSelectedKey() {
    var rotateButton = document.getElementById('mcpLabKeyRotateBtn');
    closeRecoveryModal();
    if (rotateButton) rotateButton.click();
  }

  function showRecoveryModal() {
    closeRecoveryModal();

    var wrap = document.createElement('div');
    wrap.id = MODAL_ID;
    wrap.className = 'mcp-key-modal-backdrop';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-labelledby', 'mcpLabKeyRecoveryTitle');
    wrap.innerHTML =
      '<section class="mcp-key-modal">' +
      '<div class="mcp-key-modal-header">' +
      '<h3 class="mcp-key-modal-title" id="mcpLabKeyRecoveryTitle">This key cannot be revealed again</h3>' +
      '</div>' +
      '<p class="mcp-key-modal-warning">For security, the Lab stores only a one-way hash of each MCP key. The full secret is shown once and is available only in the browser tab that generated or rotated it.</p>' +
      '<p class="mcp-key-current-note">The safest option is to create an additional key named <strong>Adobe Coworker</strong>. Existing ChatGPT, Codex, or other client keys stay active. Alternatively, rotate <strong id="mcpLabRecoveryKeyName"></strong> if you know which client currently uses it.</p>' +
      '<div class="mcp-key-modal-actions">' +
      '<button type="button" class="dashboard-btn-outline" id="mcpLabKeyRecoveryCloseBtn">Close</button>' +
      '<button type="button" class="dashboard-btn-outline" id="mcpLabKeyRecoveryRotateBtn">Rotate this key</button>' +
      '<button type="button" class="dashboard-btn-primary" id="mcpLabKeyRecoveryGenerateBtn">Prepare additional Coworker key</button>' +
      '</div>' +
      '</section>';

    document.body.appendChild(wrap);
    document.body.classList.add('mcp-key-modal-open');

    var name = document.getElementById('mcpLabRecoveryKeyName');
    if (name) name.textContent = selectedKeyName();

    var closeButton = document.getElementById('mcpLabKeyRecoveryCloseBtn');
    var rotateButton = document.getElementById('mcpLabKeyRecoveryRotateBtn');
    var generateButton = document.getElementById('mcpLabKeyRecoveryGenerateBtn');
    if (closeButton) closeButton.addEventListener('click', closeRecoveryModal);
    if (rotateButton) rotateButton.addEventListener('click', rotateSelectedKey);
    if (generateButton) generateButton.addEventListener('click', prepareAdditionalKey);

    wrap.addEventListener('click', function (event) {
      if (event.target === wrap) closeRecoveryModal();
    });
    if (generateButton) generateButton.focus();
  }

  function enhanceRevealButton() {
    var revealButton = document.getElementById('mcpLabKeyRevealBtn');
    if (!revealButton || revealButton.dataset.keySecretUnavailable === '1') return;
    if (!revealButton.disabled) return;

    revealButton.disabled = false;
    revealButton.dataset.keySecretUnavailable = '1';
    revealButton.title = 'The secret is not stored. Click for safe recovery options.';

    var note = document.querySelector('#mcpLabKeyCurrentSection .mcp-key-current-note');
    if (note) {
      note.id = 'mcpLabKeyRevealHelp';
      note.textContent =
        'The full secret is unavailable in this tab and is not stored by the Lab. Click Reveal key for safe recovery options.';
      revealButton.setAttribute('aria-describedby', note.id);
    }
  }

  document.addEventListener(
    'click',
    function (event) {
      var target = event.target;
      var revealButton =
        target && target.closest
          ? target.closest('#mcpLabKeyRevealBtn[data-key-secret-unavailable="1"]')
          : null;
      if (!revealButton) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      showRecoveryModal();
    },
    true,
  );

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && document.getElementById(MODAL_ID)) closeRecoveryModal();
  });

  var observer = new MutationObserver(enhanceRevealButton);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enhanceRevealButton);
  } else {
    enhanceRevealButton();
  }

  global.AepMcpKeyRecovery = {
    enhance: enhanceRevealButton,
    show: showRecoveryModal,
  };
})(typeof window !== 'undefined' ? window : globalThis);
