(function () {
  'use strict';

  var identifierInput = document.getElementById('ddcIdentifier');
  var namespaceSelectId = 'ddcNs';
  var lookupBtn = document.getElementById('ddcLookupBtn');
  var statusEl = document.getElementById('demoDeliveryStatus');
  var ecidEl = document.getElementById('infoEcid');

  if (typeof attachEmailDatalist === 'function') {
    attachEmailDatalist('ddcIdentifier');
  }
  if (typeof AepIdentityPicker !== 'undefined') {
    AepIdentityPicker.init('ddcIdentifier', namespaceSelectId);
  }

  function getSandboxParam() {
    if (
      typeof window.AepGlobalSandbox !== 'undefined' &&
      typeof window.AepGlobalSandbox.getSandboxParam === 'function'
    ) {
      return window.AepGlobalSandbox.getSandboxParam();
    }
    return '';
  }

  function getNamespace() {
    if (
      typeof window.AepIdentityPicker !== 'undefined' &&
      typeof window.AepIdentityPicker.getNamespace === 'function'
    ) {
      return window.AepIdentityPicker.getNamespace('ddcIdentifier');
    }
    var el = document.getElementById(namespaceSelectId);
    return el && el.value ? String(el.value) : 'email';
  }

  function setStatus(text, type) {
    if (!statusEl) return;
    statusEl.textContent = text || '';
    if (type) statusEl.setAttribute('data-status', type);
    else statusEl.removeAttribute('data-status');
  }

  function setEcid(value) {
    if (!ecidEl) return;
    ecidEl.textContent = value || '-';
  }

  function parseEcid(value) {
    if (value == null) return '';
    if (Array.isArray(value) && value.length) return String(value[0] || '').trim();
    return String(value).trim();
  }

  async function lookupProfile(identifier, namespace) {
    var url =
      '/api/profile/consent?identifier=' +
      encodeURIComponent(identifier) +
      '&namespace=' +
      encodeURIComponent(namespace) +
      getSandboxParam();
    var res = await fetch(url);
    var data = await res.json().catch(function () {
      return {};
    });
    if (!res.ok) {
      throw new Error(data.error || data.message || 'Profile lookup failed.');
    }
    return data;
  }

  async function runDecisioning() {
    var identifier = String((identifierInput && identifierInput.value) || '').trim();
    if (!identifier) {
      setStatus('Enter an identifier value before running decisioning.', 'error');
      return;
    }
    var namespace = getNamespace();
    setStatus('Looking up profile and requesting decisioning content...');
    if (lookupBtn) lookupBtn.disabled = true;
    try {
      var profile = await lookupProfile(identifier, namespace);
      var ecid = parseEcid(profile.ecid);
      setEcid(ecid && /^\d{10,}$/.test(ecid) ? ecid : '-');

      if (typeof addEmail === 'function') addEmail(identifier);

      if (
        typeof window.RaceForLifeAjo === 'undefined' ||
        typeof window.RaceForLifeAjo.refreshFromProfile !== 'function'
      ) {
        throw new Error('AJO renderer is not available on this page.');
      }

      await window.RaceForLifeAjo.refreshFromProfile(
        {
          email: profile.email || identifier,
          ecid: ecid || null,
        },
        identifier,
        namespace
      );
      setStatus('Decisioning content loaded into laptop and mobile preview frames.');
    } catch (err) {
      setStatus(err && err.message ? err.message : 'Unable to run decisioning.', 'error');
    } finally {
      if (lookupBtn) lookupBtn.disabled = false;
    }
  }

  if (lookupBtn) {
    lookupBtn.addEventListener('click', runDecisioning);
  }
  if (identifierInput) {
    identifierInput.addEventListener('keydown', function (evt) {
      if (evt.key === 'Enter') {
        evt.preventDefault();
        runDecisioning();
      }
    });
  }
})();
