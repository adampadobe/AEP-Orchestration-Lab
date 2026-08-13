/** Apply the successfully looked-up profile's first name to the supplied My Sky snapshot. */
(function skyPostLoginProfile(global) {
  'use strict';

  function storedFirstName() {
    try {
      return String(global.sessionStorage.getItem('siteCloneLoginFirstName') || '').trim();
    } catch (_e) {
      return '';
    }
  }

  function applyFirstName() {
    var firstName = storedFirstName();
    if (!firstName) return;
    document.querySelectorAll('[data-test-id="welcomer-customer-greeting"], [data-test-id="greeting"]').forEach(function (el) {
      var text = String(el.textContent || '');
      if (/^welcome\b/i.test(text)) el.textContent = 'Welcome, ' + firstName;
      else if (/^hello\b/i.test(text)) el.textContent = 'Hello ' + firstName;
    });
  }

  function initialise() {
    [0, 100, 300, 750, 1500, 3000].forEach(function (delay) {
      global.setTimeout(applyFirstName, delay);
    });
    if (document.body && typeof MutationObserver === 'function') {
      var scheduled = false;
      new MutationObserver(function () {
        if (scheduled) return;
        scheduled = true;
        global.setTimeout(function () {
          scheduled = false;
          applyFirstName();
        }, 0);
      }).observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialise);
  else initialise();
})(typeof window !== 'undefined' ? window : globalThis);
