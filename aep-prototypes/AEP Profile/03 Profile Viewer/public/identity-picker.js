/**
 * Shared identity namespace picker – wires up namespace <select> + identifier
 * <input> pairs across all profile lookup pages.
 *
 * Each page places its own namespace <select> in the HTML (giving full layout
 * control), then calls AepIdentityPicker.init(inputId, selectId) to connect
 * placeholder syncing, localStorage persistence, and cross-page sync.
 */
(function () {
  'use strict';

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
   * Wire up an existing namespace <select> + identifier <input>.
   * @param {string} inputId  - id of the identifier <input>
   * @param {string} selectId - id of the namespace <select>
   */
  function init(inputId, selectId) {
    const input = document.getElementById(inputId);
    const select = document.getElementById(selectId);
    if (!input || !select || instances[inputId]) return;

    const ns = savedNamespace();
    select.value = ns;
    input.placeholder = PLACEHOLDERS[ns] || PLACEHOLDERS.email;

    select.addEventListener('change', () => {
      const v = select.value;
      input.placeholder = PLACEHOLDERS[v] || PLACEHOLDERS.email;
      persistNamespace(v);
      Object.values(instances).forEach((inst) => {
        if (inst.select !== select) {
          inst.select.value = v;
          inst.input.placeholder = PLACEHOLDERS[v] || PLACEHOLDERS.email;
        }
      });
    });

    instances[inputId] = { input, select };
  }

  function getNamespace(inputId) {
    const inst = instances[inputId];
    return inst ? inst.select.value : savedNamespace();
  }

  function getIdentifier(inputId) {
    const inst = instances[inputId];
    return inst ? (inst.input.value || '').trim() : '';
  }

  function getQueryString(inputId) {
    const id = getIdentifier(inputId);
    const ns = getNamespace(inputId);
    return `identifier=${encodeURIComponent(id)}&namespace=${encodeURIComponent(ns)}`;
  }

  window.AepIdentityPicker = { init, getNamespace, getIdentifier, getQueryString };
})();
