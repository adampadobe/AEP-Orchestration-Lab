/**
 * Adds a focused-endpoint selector to the one-time MCP key modal. One key is
 * valid for every endpoint; the selector only changes the copied client config.
 */
(function (global) {
  'use strict';

  var MODAL_ID = 'mcpLabKeyModal';
  var PLACEHOLDER = '<paste your key — shown only at generate/rotate>';
  var HEADER_NAME = 'X-AEP-Lab-Mcp-Key';
  var ENDPOINTS = [
    {
      name: 'aep-lab-general',
      label: 'General demo preparation (85 tools)',
      url: 'https://aep-lab-profile-mcp-109406613852.us-central1.run.app/mcp',
    },
    {
      name: 'aep-lab-profiles',
      label: 'Profiles (9 tools)',
      url: 'https://aep-lab-profile-mcp-109406613852.us-central1.run.app/mcp/profile',
    },
    {
      name: 'aep-lab-audiences',
      label: 'Audiences (4 tools · controlled delete)',
      url: 'https://aep-lab-profile-mcp-109406613852.us-central1.run.app/mcp/audiences',
    },
    {
      name: 'aep-lab-decisioning',
      label: 'Decisioning (9 tools)',
      url: 'https://aep-lab-profile-mcp-109406613852.us-central1.run.app/mcp/decisioning',
    },
  ];

  function selectedEndpoint(modal) {
    var select = modal && modal.querySelector('#mcpLabKeyUrl');
    var index = select ? Number(select.value) : 0;
    return ENDPOINTS[index] || ENDPOINTS[0];
  }

  function configFor(endpoint, apiKey) {
    var config = {};
    config[endpoint.name] = {
      type: 'streamable-http',
      url: endpoint.url,
      headers: {},
    };
    config[endpoint.name].headers[HEADER_NAME] = apiKey;
    return JSON.stringify(config, null, 2);
  }

  function setToast(message) {
    var toast = document.getElementById('mcpLabKeyModalCopyToast');
    if (!toast) return;
    toast.textContent = message || '';
    clearTimeout(setToast._timer);
    if (message) {
      setToast._timer = setTimeout(function () {
        toast.textContent = '';
      }, 2400);
    }
  }

  function copyText(value) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(value);
    }
    var textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    var copied = document.execCommand('copy');
    textarea.remove();
    return copied ? Promise.resolve() : Promise.reject(new Error('Copy failed'));
  }

  function copyFromPicker(button, value, successMessage) {
    var originalLabel = button.textContent;
    copyText(value)
      .then(function () {
        button.textContent = 'Copied';
        setToast(successMessage);
        setTimeout(function () {
          button.textContent = originalLabel;
        }, 1500);
      })
      .catch(function () {
        setToast('Copy failed — select and copy the value manually.');
      });
  }

  function updateModal(modal) {
    var endpoint = selectedEndpoint(modal);
    var preview = modal.querySelector('#mcpLabKeySnippet');
    var hint = modal.querySelector('#mcpLabKeyEndpointHint');
    if (preview) preview.value = configFor(endpoint, PLACEHOLDER);
    if (hint) {
      hint.textContent = 'Coworker name: ' + endpoint.name + ' · ' + endpoint.url;
    }
  }

  function enhanceModal() {
    var modal = document.getElementById(MODAL_ID);
    if (!modal || modal.dataset.endpointPickerReady === '1') return;

    var urlInput = modal.querySelector('#mcpLabKeyUrl');
    if (!urlInput) return;

    var select = document.createElement('select');
    select.id = 'mcpLabKeyUrl';
    select.className = 'mcp-key-modal-input';
    select.setAttribute('aria-label', 'Choose AEP Lab MCP connection');
    ENDPOINTS.forEach(function (endpoint, index) {
      var option = document.createElement('option');
      option.value = String(index);
      option.textContent = endpoint.label + ' — ' + endpoint.url;
      select.appendChild(option);
    });
    urlInput.replaceWith(select);

    var row = select.closest('.mcp-key-modal-row');
    var hint = document.createElement('p');
    hint.id = 'mcpLabKeyEndpointHint';
    hint.className = 'mcp-key-hint';
    hint.setAttribute('aria-live', 'polite');
    if (row) row.insertAdjacentElement('afterend', hint);

    modal.dataset.endpointPickerReady = '1';
    select.addEventListener('change', function () {
      updateModal(modal);
    });
    updateModal(modal);
  }

  document.addEventListener(
    'click',
    function (event) {
      var button = event.target && event.target.closest ? event.target.closest('button') : null;
      if (!button) return;
      var modal = button.closest('#' + MODAL_ID + '[data-endpoint-picker-ready="1"]');
      if (!modal) return;
      if (
        button.id !== 'mcpLabKeyCopyUrlBtn' &&
        button.id !== 'mcpLabKeyCopyConfigBtn' &&
        button.id !== 'mcpLabKeyCopyAllBtn'
      ) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();

      var endpoint = selectedEndpoint(modal);
      var secretInput = modal.querySelector('#mcpLabKeyPlaintext');
      var secret = secretInput ? secretInput.value : '';
      if (button.id === 'mcpLabKeyCopyUrlBtn') {
        copyFromPicker(button, endpoint.url, endpoint.label + ' URL copied');
      } else if (button.id === 'mcpLabKeyCopyConfigBtn') {
        copyFromPicker(
          button,
          configFor(endpoint, PLACEHOLDER),
          endpoint.name + ' config copied (no secret) — paste your key into ' + HEADER_NAME,
        );
      } else {
        copyFromPicker(
          button,
          configFor(endpoint, secret),
          endpoint.name + ' complete config copied (includes secret)',
        );
      }
    },
    true,
  );

  var observer = new MutationObserver(enhanceModal);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enhanceModal);
  } else {
    enhanceModal();
  }

  global.AepMcpKeyEndpointPicker = {
    endpoints: ENDPOINTS.slice(),
    enhance: enhanceModal,
    configFor: configFor,
  };
})(typeof window !== 'undefined' ? window : globalThis);
