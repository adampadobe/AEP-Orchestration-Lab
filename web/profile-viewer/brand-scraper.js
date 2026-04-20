(function () {
  'use strict';

  const form = document.getElementById('brandScraperForm');
  const urlInput = document.getElementById('brandScraperUrl');
  const statusEl = document.getElementById('brandScraperStatus');
  const runBtn = document.getElementById('brandScraperRun');
  if (!form || !urlInput || !statusEl) return;

  function setStatus(message, kind) {
    if (!message) {
      statusEl.hidden = true;
      statusEl.textContent = '';
      statusEl.removeAttribute('data-kind');
      return;
    }
    statusEl.hidden = false;
    statusEl.textContent = message;
    if (kind) statusEl.setAttribute('data-kind', kind);
    else statusEl.removeAttribute('data-kind');
  }

  function normaliseUrl(raw) {
    const v = (raw || '').trim();
    if (!v) return '';
    if (/^https?:\/\//i.test(v)) return v;
    return 'https://' + v;
  }

  form.addEventListener('submit', function (evt) {
    evt.preventDefault();
    const url = normaliseUrl(urlInput.value);
    if (!url) {
      setStatus('Enter a brand URL to continue.', 'error');
      urlInput.focus();
      return;
    }
    try {
      // Validate
      // eslint-disable-next-line no-new
      new URL(url);
    } catch (_e) {
      setStatus('That URL doesn\u2019t look valid. Try something like nike.com.', 'error');
      urlInput.focus();
      return;
    }

    if (runBtn) runBtn.disabled = true;
    setStatus('Backend not wired yet \u2014 the Python prototype at aep-prototypes/brandscrape-studio/ is being ported to Cloud Functions. Analysis for ' + url + ' will run once the crawler endpoint lands.', 'info');
    if (runBtn) {
      setTimeout(function () { runBtn.disabled = false; }, 400);
    }
  });
})();
