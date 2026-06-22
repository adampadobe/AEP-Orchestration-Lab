/**
 * Intent Coverage overlay page — isolate the modal panel from the frozen Walnut export.
 */
(function (global) {
  'use strict';

  function findModalRoot() {
    var titles = Array.from(document.querySelectorAll('[data-rsp-slot="text"]')).filter(function (el) {
      return (el.textContent || '').trim() === 'Intent Coverage' && el.childElementCount === 0;
    });
    if (!titles.length) return null;
    var title = titles[0];
    return (
      title.closest('[class*="macro-dynamic-m"]') ||
      title.closest('[class*="macro-static-oqgd9d"]') ||
      (title.closest('[class*="macro-static-FIB96"]') &&
        title.closest('[class*="macro-static-FIB96"]').parentElement &&
        title.closest('[class*="macro-static-FIB96"]').parentElement.parentElement &&
        title.closest('[class*="macro-static-FIB96"]').parentElement.parentElement.parentElement)
    );
  }

  function isolateModal() {
    if (!/intent-coverage-overlay\.html/i.test(global.location.pathname || '')) return;
    var modal = findModalRoot();
    if (!modal || modal.classList.contains('llm-intent-overlay-panel')) return;
    modal.classList.add('llm-intent-overlay-panel');
    document.documentElement.classList.add('llm-intent-overlay-host');
    document.body.appendChild(modal);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', isolateModal);
  } else {
    isolateModal();
  }
  global.setTimeout(isolateModal, 200);
  global.setTimeout(isolateModal, 1200);
})(typeof window !== 'undefined' ? window : globalThis);
