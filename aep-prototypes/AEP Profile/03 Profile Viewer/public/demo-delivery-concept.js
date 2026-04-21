(function () {
  'use strict';

  var identifierInput = document.getElementById('ddcIdentifier');
  var namespaceSelectId = 'ddcNs';
  var lookupBtn = document.getElementById('ddcLookupBtn');
  var statusEl = document.getElementById('demoDeliveryStatus');
  var ecidEl = document.getElementById('infoEcid');
  var fullscreenBtn = document.getElementById('ddcFullscreenBtn');
  var fullscreenTarget = document.getElementById('demoDeliveryMain');

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

  function getFullscreenElement() {
    return (
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.msFullscreenElement ||
      null
    );
  }

  function requestFullscreenEl(el) {
    if (!el) return Promise.reject(new Error('No element.'));
    if (typeof el.requestFullscreen === 'function') return el.requestFullscreen();
    if (typeof el.webkitRequestFullscreen === 'function') return el.webkitRequestFullscreen();
    if (typeof el.msRequestFullscreen === 'function') return el.msRequestFullscreen();
    return Promise.reject(new Error('Full screen is not supported in this browser.'));
  }

  function exitFullscreenDoc() {
    if (typeof document.exitFullscreen === 'function') return document.exitFullscreen();
    if (typeof document.webkitExitFullscreen === 'function') return document.webkitExitFullscreen();
    if (typeof document.msExitFullscreen === 'function') return document.msExitFullscreen();
    return Promise.reject(new Error('Unable to exit full screen.'));
  }

  var FS_ICON_ENTER =
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">' +
    '<path fill="currentColor" d="M12.75,14.93652h-5.5c-1.24072,0-2.25-1.00928-2.25-2.25v-5.5c0-1.24072,1.00928-2.25,2.25-2.25h5.5c1.24072,0,2.25,1.00928,2.25,2.25v5.5c0,1.24072-1.00928,2.25-2.25,2.25ZM7.25,6.43652c-.41357,0-.75.33643-.75.75v5.5c0,.41357.33643.75.75.75h5.5c.41357,0,.75-.33643.75-.75v-5.5c0-.41357-.33643-.75-.75-.75h-5.5Z"/>' +
    '<path fill="currentColor" d="M4.5,19h-2.25c-.68945,0-1.25-.56055-1.25-1.25v-2.25c0-.41406.33594-.75.75-.75s.75.33594.75.75v2h2c.41406,0,.75.33594.75.75s-.33594.75-.75.75Z"/>' +
    '<path fill="currentColor" d="M17.75,19h-2.25c-.41406,0-.75-.33594-.75-.75s.33594-.75.75-.75h2v-2c0-.41406.33594-.75.75-.75s.75.33594.75.75v2.25c0,.68945-.56055,1.25-1.25,1.25Z"/>' +
    '<path fill="currentColor" d="M18.25,5.25c-.41406,0-.75-.33594-.75-.75v-2h-2c-.41406,0-.75-.33594-.75-.75s.33594-.75.75-.75h2.25c.68945,0,1.25.56055,1.25,1.25v2.25c0,.41406-.33594.75-.75.75Z"/>' +
    '<path fill="currentColor" d="M1.75,5.25c-.41406,0-.75-.33594-.75-.75v-2.25c0-.68945.56055-1.25,1.25-1.25h2.25c.41406,0,.75.33594.75.75s-.33594.75-.75.75h-2v2c0,.41406-.33594.75-.75.75Z"/>' +
    '</svg>';
  var FS_ICON_EXIT =
    '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false">' +
    '<path fill="currentColor" d="M12.75,15h-5.5c-1.24072,0-2.25-1.00928-2.25-2.25v-5.5c0-1.24072,1.00928-2.25,2.25-2.25h5.5c1.24072,0,2.25,1.00928,2.25,2.25v5.5c0,1.24072-1.00928,2.25-2.25,2.25ZM7.25,6.5c-.41357,0-.75.33643-.75.75v5.5c0,.41357.33643.75.75.75h5.5c.41357,0,.75-.33643.75-.75v-5.5c0-.41357-.33643-.75-.75-.75h-5.5Z"/>' +
    '<path fill="currentColor" d="M19,4.5h-2.25c-.68945,0-1.25-.56055-1.25-1.25V1c0-.41406.33594-.75.75-.75s.75.33594.75.75v2h2c.41406,0,.75.33594.75.75s-.33594.75-.75.75Z"/>' +
    '<path fill="currentColor" d="M3.25,4.5H1c-.41406,0-.75-.33594-.75-.75s.33594-.75.75-.75h2V1c0-.41406.33594-.75.75-.75s.75.33594.75.75v2.25c0,.68945-.56055,1.25-1.25,1.25Z"/>' +
    '<path fill="currentColor" d="M3.75,19.75c-.41406,0-.75-.33594-.75-.75v-2H1c-.41406,0-.75-.33594-.75-.75s.33594-.75.75-.75h2.25c.68945,0,1.25.56055,1.25,1.25v2.25c0,.41406-.33594.75-.75.75Z"/>' +
    '<path fill="currentColor" d="M16.25,19.75c-.41406,0-.75-.33594-.75-.75v-2.25c0-.68945.56055-1.25,1.25-1.25h2.25c.41406,0,.75.33594.75.75s-.33594.75-.75.75h-2v2c0,.41406-.33594.75-.75.75Z"/>' +
    '</svg>';

  function syncFullscreenButton() {
    if (!fullscreenBtn || !fullscreenTarget) return;
    var active = getFullscreenElement() === fullscreenTarget;
    fullscreenBtn.innerHTML = active ? FS_ICON_EXIT : FS_ICON_ENTER;
    fullscreenBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
    var label = active ? 'Exit full screen' : 'Enter full screen';
    fullscreenBtn.setAttribute('aria-label', label);
    fullscreenBtn.setAttribute('title', label);
  }

  async function toggleDemoFullscreen() {
    if (!fullscreenTarget) return;
    try {
      if (getFullscreenElement() === fullscreenTarget) {
        await exitFullscreenDoc();
      } else {
        await requestFullscreenEl(fullscreenTarget);
      }
    } catch (err) {
      setStatus(
        err && err.message ? err.message : 'Full screen could not be toggled.',
        'error'
      );
    }
    syncFullscreenButton();
  }

  if (fullscreenBtn && fullscreenTarget) {
    fullscreenBtn.addEventListener('click', toggleDemoFullscreen);
    document.addEventListener('fullscreenchange', syncFullscreenButton);
    document.addEventListener('webkitfullscreenchange', syncFullscreenButton);
    syncFullscreenButton();
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
