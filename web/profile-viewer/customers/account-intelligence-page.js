(function () {
  const runBtn = document.getElementById('accountIntelRun');
  const crmEl = document.getElementById('accountIntelCrm');
  const errEl = document.getElementById('accountIntelError');
  const modeEl = document.getElementById('accountIntelMode');
  const ingestEl = document.getElementById('accountIntelIngest');
  const briefingEl = document.getElementById('accountIntelBriefing');
  const kpisEl = document.getElementById('accountIntelKpis');
  const painEl = document.getElementById('accountIntelPain');
  const matEl = document.getElementById('accountIntelMaturity');
  const qEl = document.getElementById('accountIntelQuestions');
  const outSection = document.getElementById('accountIntelOutput');

  if (!runBtn) return;

  function getApiBase() {
    var m = document.querySelector('meta[name="aep-api-base"]');
    if (m && m.content && String(m.content).trim()) return String(m.content).trim().replace(/\/$/, '');
    return '';
  }

  function apiNotFoundHelp() {
    return (
      'API not found (404). Open this page from the Profile Viewer Node server at http://localhost:3333/customers/adobe/account-intelligence.html ' +
      'so /api/account-intelligence/run exists. If you use another dev server port, set <meta name="aep-api-base" content="http://localhost:3333"> in the page head and restart the Node server.'
    );
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatBriefing(text) {
    const esc = escapeHtml(text || '');
    return esc.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br />');
  }

  function renderList(el, items) {
    if (!el || !items || !items.length) return;
    el.innerHTML = '<ul class="customer-ai-list">' + items.map((x) => '<li>' + escapeHtml(x) + '</li>').join('') + '</ul>';
  }

  function renderQuestions(el, items) {
    if (!el || !items || !items.length) return;
    el.innerHTML = '<ol class="customer-ai-questions">' + items.map((x) => '<li>' + escapeHtml(x) + '</li>').join('') + '</ol>';
  }

  runBtn.addEventListener('click', async function () {
    errEl.textContent = '';
    errEl.hidden = true;
    runBtn.disabled = true;
    modeEl.textContent = '';
    if (outSection) outSection.hidden = true;

    try {
      var base = getApiBase();
      var res = await fetch(base + '/api/account-intelligence/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preset: 'adobe',
          crmNotes: crmEl ? crmEl.value : '',
        }),
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok) {
        var msg = data.error || res.statusText || 'Request failed';
        if (res.status === 404) msg = apiNotFoundHelp();
        throw new Error(msg);
      }

      if (ingestEl) {
        ingestEl.innerHTML = '';
        const tbody = document.createElement('tbody');
        (data.ingestions || []).forEach(function (row) {
          const tr = document.createElement('tr');
          const status = row.ok ? '<span class="ok">OK</span>' : '<span class="bad">' + escapeHtml(row.error || 'Fail') + '</span>';
          const imgs = row.images || [];
          let imgCell = '<span class="customer-ai-thumb-meta">—</span>';
          if (imgs.length) {
            const parts = imgs
              .map(function (im) {
                if (im.thumbnailPath) {
                  return (
                    '<a href="' +
                    escapeHtml(im.sourceUrl) +
                    '" target="_blank" rel="noopener noreferrer" title="' +
                    escapeHtml(im.kind || '') +
                    '">' +
                    '<img src="' +
                    escapeHtml(im.thumbnailPath) +
                    '" alt="" loading="lazy" width="56" height="56" />' +
                    '</a>'
                  );
                }
                return '';
              })
              .filter(Boolean);
            if (parts.length) {
              imgCell = '<div class="customer-ai-thumb-strip">' + parts.join('') + '</div>';
            } else {
              imgCell = '<span class="customer-ai-thumb-meta">none</span>';
            }
          }
          tr.innerHTML =
            '<td>' +
            escapeHtml(row.label) +
            '</td><td>' +
            escapeHtml(row.url) +
            '</td><td>' +
            row.status +
            '</td><td>' +
            status +
            '</td><td>' +
            (row.textLength || 0) +
            '</td><td>' +
            imgCell +
            '</td>';
          tbody.appendChild(tr);
        });
        ingestEl.appendChild(tbody);
      }

      const p = data.produced || {};
      modeEl.textContent = data.mode === 'openai' ? 'Synthesis: OpenAI (OPENAI_API_KEY)' : 'Synthesis: on-device heuristics (add OPENAI_API_KEY in .env for richer narrative)';

      if (briefingEl) briefingEl.innerHTML = '<div class="customer-ai-prose">' + formatBriefing(p.executiveBriefing || '') + '</div>';
      renderList(kpisEl, p.likelyKpis);
      renderList(painEl, p.likelyPainPoints);
      if (matEl) matEl.innerHTML = '<div class="customer-ai-prose">' + formatBriefing(p.aiDataMaturityGuess || '') + '</div>';
      renderQuestions(qEl, p.discoveryQuestions);

      if (outSection) outSection.hidden = false;
    } catch (e) {
      errEl.textContent = e.message || String(e);
      errEl.hidden = false;
    } finally {
      runBtn.disabled = false;
    }
  });
})();
