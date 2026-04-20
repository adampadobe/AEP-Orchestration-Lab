(function () {
  'use strict';

  const form = document.getElementById('brandScraperForm');
  const urlInput = document.getElementById('brandScraperUrl');
  const btypeSel = document.getElementById('brandScraperBusinessType');
  const countrySel = document.getElementById('brandScraperCountry');
  const statusEl = document.getElementById('brandScraperStatus');
  const runBtn = document.getElementById('brandScraperRun');
  const resultsEl = document.getElementById('brandScraperResults');
  if (!form || !urlInput || !statusEl || !resultsEl) return;

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
    return /^https?:\/\//i.test(v) ? v : 'https://' + v;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function renderList(items, fmt) {
    if (!Array.isArray(items) || !items.length) return '<p class="brand-scraper-result-muted">Not provided.</p>';
    return '<ul class="brand-scraper-result-list">' + items.map(fmt).join('') + '</ul>';
  }

  function renderAnalysis(a) {
    if (!a) return '';
    if (a.skipped) {
      return '<p class="brand-scraper-result-muted">LLM analysis skipped: ' + esc(a.reason || 'no key') + '.</p>';
    }
    if (a.error) {
      return '<p class="brand-scraper-result-muted">LLM returned invalid JSON: ' + esc(a.error) + '</p>'
        + (a.raw ? '<pre class="brand-scraper-pre">' + esc(a.raw) + '</pre>' : '');
    }
    const blocks = [];
    if (a.about) {
      blocks.push('<section class="brand-scraper-result-block"><h4>About</h4><p>' + esc(a.about) + '</p></section>');
    }
    if (Array.isArray(a.tone_of_voice)) {
      blocks.push('<section class="brand-scraper-result-block"><h4>Tone of voice</h4>' +
        renderList(a.tone_of_voice, it => '<li><strong>' + esc(it.rule) + '</strong>' + (it.example ? ' — <em>' + esc(it.example) + '</em>' : '') + '</li>') + '</section>');
    }
    if (Array.isArray(a.brand_values)) {
      blocks.push('<section class="brand-scraper-result-block"><h4>Brand values</h4>' +
        renderList(a.brand_values, it => '<li><strong>' + esc(it.value) + '</strong> — ' + esc(it.description) + '</li>') + '</section>');
    }
    if (Array.isArray(a.editorial_guidelines)) {
      blocks.push('<section class="brand-scraper-result-block"><h4>Editorial guidelines</h4>' +
        renderList(a.editorial_guidelines, it => '<li><strong>' + esc(it.rule) + '</strong>' + (it.example ? ' — <em>' + esc(it.example) + '</em>' : '') + '</li>') + '</section>');
    }
    if (Array.isArray(a.image_guidelines)) {
      blocks.push('<section class="brand-scraper-result-block"><h4>Image guidelines</h4>' +
        renderList(a.image_guidelines, it => '<li>' + esc(it.rule) + (it.example ? ' — <em>' + esc(it.example) + '</em>' : '') + '</li>') + '</section>');
    }
    if (Array.isArray(a.channel_guidelines) && a.channel_guidelines.length) {
      blocks.push('<section class="brand-scraper-result-block"><h4>Channel samples</h4>' +
        '<div class="brand-scraper-channel-grid">' + a.channel_guidelines.map(ch => (
          '<article class="brand-scraper-channel">' +
            '<header>' + esc(ch.channel || 'Channel') + '</header>' +
            (ch.subject_line ? '<div><span>Subject:</span> ' + esc(ch.subject_line) + '</div>' : '') +
            (ch.preheader ? '<div><span>Preheader:</span> ' + esc(ch.preheader) + '</div>' : '') +
            (ch.headline ? '<div><span>Headline:</span> ' + esc(ch.headline) + '</div>' : '') +
            (ch.body ? '<p>' + esc(ch.body) + '</p>' : '') +
            (ch.cta ? '<div class="brand-scraper-channel-cta">' + esc(ch.cta) + '</div>' : '') +
          '</article>'
        )).join('') + '</div></section>');
    }
    return blocks.join('');
  }

  function renderCrawl(c) {
    if (!c || !Array.isArray(c.pages)) return '';
    const rows = c.pages.map(p => (
      '<tr>' +
        '<td><a href="' + esc(p.url) + '" target="_blank" rel="noopener">' + esc(p.url) + '</a></td>' +
        '<td>' + esc(p.title || '—') + '</td>' +
        '<td class="brand-scraper-num">' + esc(p.status) + '</td>' +
        '<td class="brand-scraper-num">' + esc(p.textLength.toLocaleString()) + '</td>' +
      '</tr>'
    )).join('');
    return '<section class="brand-scraper-result-block">' +
      '<h4>Crawl summary</h4>' +
      '<p class="brand-scraper-result-muted">' + c.pagesScraped + ' pages scraped, ' + c.totalDiscovered + ' URLs discovered.</p>' +
      '<table class="brand-scraper-table"><thead><tr><th>URL</th><th>Title</th><th>Status</th><th>Chars</th></tr></thead><tbody>' + rows + '</tbody></table>' +
    '</section>';
  }

  function renderResults(data) {
    resultsEl.hidden = false;
    resultsEl.innerHTML = (
      '<header class="brand-scraper-result-header">' +
        '<h3>' + esc(data.brandName || 'Results') + '</h3>' +
        '<p class="brand-scraper-result-muted">' + esc(data.baseUrl) + ' · ' +
          (data.businessType || '').toUpperCase() + (data.country ? ' · ' + esc(data.country) : '') +
          ' · ' + (data.elapsedMs ? (data.elapsedMs / 1000).toFixed(1) + 's' : '') +
        '</p>' +
      '</header>' +
      (data.analysisError ? '<p class="brand-scraper-result-muted">Analysis error: ' + esc(data.analysisError) + '</p>' : '') +
      renderAnalysis(data.analysis) +
      renderCrawl(data.crawl)
    );
  }

  form.addEventListener('submit', async function (evt) {
    evt.preventDefault();
    const url = normaliseUrl(urlInput.value);
    if (!url) { setStatus('Enter a brand URL to continue.', 'error'); urlInput.focus(); return; }
    try { new URL(url); } catch (_e) {
      setStatus('That URL doesn\u2019t look valid. Try something like nike.com.', 'error');
      urlInput.focus();
      return;
    }

    if (runBtn) runBtn.disabled = true;
    setStatus('Crawling ' + url + ' \u2026 this can take 30\u201390 seconds.', 'info');
    resultsEl.hidden = true;

    try {
      const resp = await fetch('/api/brand-scraper/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url,
          businessType: btypeSel && btypeSel.value,
          country: countrySel && countrySel.value,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setStatus('Analysis failed: ' + (data.error || resp.statusText), 'error');
        return;
      }
      setStatus('Done \u2014 crawled ' + (data.crawl && data.crawl.pagesScraped) + ' pages in ' +
        (data.elapsedMs ? (data.elapsedMs / 1000).toFixed(1) + 's' : '') + '.', 'info');
      renderResults(data);
    } catch (e) {
      setStatus('Network error: ' + (e && e.message || e), 'error');
    } finally {
      if (runBtn) runBtn.disabled = false;
    }
  });
})();
