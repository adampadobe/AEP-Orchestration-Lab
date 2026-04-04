/**
 * Shared identity namespace picker – replaces email-only inputs with
 * a namespace dropdown + identifier input across all profile lookup pages.
 *
 * Usage:
 *   <script src="identity-picker.js"></script>
 *   then: AepIdentityPicker.init('email');          // wraps <input id="email">
 *         AepIdentityPicker.getQueryString('email'); // → 'identifier=val&namespace=ecid'
 */
(function () {
  'use strict';

  const NAMESPACES = [
    { value: 'email', label: 'Email' },
    { value: 'ecid', label: 'ECID' },
    { value: 'crmId', label: 'CRM ID' },
    { value: 'loyaltyId', label: 'Loyalty ID' },
    { value: 'phone', label: 'Phone' },
  ];

  const PLACEHOLDERS = {
    email: 'Enter email address',
    ecid: 'Enter ECID value',
    crmId: 'Enter CRM ID',
    loyaltyId: 'Enter Loyalty ID',
    phone: 'Enter phone number',
  };

  const LS_KEY = 'aepIdentityNamespace';
  const instances = {};

  function savedNamespace() {
    try { return localStorage.getItem(LS_KEY) || 'email'; } catch { return 'email'; }
  }

  function persistNamespace(ns) {
    try { localStorage.setItem(LS_KEY, ns); } catch { /* noop */ }
  }

  /**
   * Wrap an existing <input> with a namespace dropdown.
   * The input's label and placeholder are updated; type is changed to text.
   * @param {string} inputId - the id of the existing input element
   * @param {object} [opts]
   * @param {boolean} [opts.compact] - if true, render a smaller inline layout
   */
  function init(inputId, opts) {
    const input = document.getElementById(inputId);
    if (!input || instances[inputId]) return;

    input.type = 'text';
    input.autocomplete = 'off';

    const ns = savedNamespace();
    input.placeholder = PLACEHOLDERS[ns] || PLACEHOLDERS.email;

    const label = input.closest('.form-row')?.querySelector('label');
    if (label) label.textContent = 'Identifier value';

    const selectId = inputId + 'IdentityNs';
    const select = document.createElement('select');
    select.id = selectId;
    select.className = 'sandbox-select identity-ns-select';
    select.setAttribute('aria-label', 'Identity namespace');
    NAMESPACES.forEach((n) => {
      const opt = document.createElement('option');
      opt.value = n.value;
      opt.textContent = n.label;
      select.appendChild(opt);
    });
    select.value = ns;

    const nsLabel = document.createElement('label');
    nsLabel.htmlFor = selectId;
    nsLabel.textContent = 'Identity namespace';
    nsLabel.className = 'identity-ns-label';

    const nsWrap = document.createElement('div');
    nsWrap.className = 'form-row identity-ns-wrap';
    nsWrap.appendChild(nsLabel);
    nsWrap.appendChild(select);

    const inputRow = input.closest('.form-row');
    if (inputRow && inputRow.parentNode) {
      inputRow.parentNode.insertBefore(nsWrap, inputRow);
    }

    select.addEventListener('change', () => {
      const v = select.value;
      input.placeholder = PLACEHOLDERS[v] || PLACEHOLDERS.email;
      persistNamespace(v);
      Object.values(instances).forEach((inst) => {
        if (inst.select !== select) inst.select.value = v;
      });
    });

    instances[inputId] = { input, select, nsWrap };
  }

  /** Current namespace for a given input. */
  function getNamespace(inputId) {
    const inst = instances[inputId];
    return inst ? inst.select.value : savedNamespace();
  }

  /** Current identifier value (trimmed). */
  function getIdentifier(inputId) {
    const inst = instances[inputId];
    return inst ? (inst.input.value || '').trim() : '';
  }

  /**
   * Build a URL query string fragment: identifier=X&namespace=Y
   * Ready to append after '?' or '&'.
   */
  function getQueryString(inputId) {
    const id = getIdentifier(inputId);
    const ns = getNamespace(inputId);
    return `identifier=${encodeURIComponent(id)}&namespace=${encodeURIComponent(ns)}`;
  }

  window.AepIdentityPicker = { init, getNamespace, getIdentifier, getQueryString };
})();
