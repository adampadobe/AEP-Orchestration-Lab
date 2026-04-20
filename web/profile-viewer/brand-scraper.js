(function () {
  'use strict';

  // Firebase Hosting rewrites cap proxied requests at 60s. The analyze endpoint
  // runs longer (≈75s with all four LLM calls), so hit the function's direct
  // Cloud Run URL. List/get/delete are fast and still go via /api/*.
  const ANALYZE_URL = 'https://brandscraperanalyze-a5xduykcsq-uc.a.run.app/';

  const form = document.getElementById('brandScraperForm');
  const urlInput = document.getElementById('brandScraperUrl');
  const btypeSel = document.getElementById('brandScraperBusinessType');
  const countrySel = document.getElementById('brandScraperCountry');
  const statusEl = document.getElementById('brandScraperStatus');
  const runBtn = document.getElementById('brandScraperRun');
  const resultsEl = document.getElementById('brandScraperResults');
  const historyListEl = document.getElementById('brandScraperHistoryList');
  const historyEmptyEl = document.getElementById('brandScraperHistoryEmpty');
  const historySandboxEl = document.getElementById('brandScraperHistorySandbox');
  const historyRefreshBtn = document.getElementById('brandScraperHistoryRefresh');
  if (!form || !urlInput || !statusEl || !resultsEl) return;

  function getSandbox() {
    try {
      return (window.AepGlobalSandbox && window.AepGlobalSandbox.getSandboxName()) || '';
    } catch (_e) { return ''; }
  }

  const LS_COUNTRY_PREFIX = 'aepBrandScraperCountry_';
  function countryKey(sb) { return LS_COUNTRY_PREFIX + (sb || 'default'); }

  function applyStoredCountry() {
    if (!countrySel) return;
    const sb = getSandbox();
    let stored = null;
    try { stored = localStorage.getItem(countryKey(sb)); } catch (_e) { /* ignore */ }
    if (!stored) return;
    // Only set if the option actually exists in the dropdown.
    const has = Array.from(countrySel.options).some(o => o.value === stored);
    if (has) countrySel.value = stored;
  }

  if (countrySel) {
    countrySel.addEventListener('change', () => {
      const sb = getSandbox();
      if (!sb) return; // no sandbox, no sticky save
      try { localStorage.setItem(countryKey(sb), countrySel.value); } catch (_e) { /* ignore */ }
    });
  }

  function withSandboxQuery(path) {
    const sb = getSandbox();
    const sep = path.includes('?') ? '&' : '?';
    return sb ? path + sep + 'sandbox=' + encodeURIComponent(sb) : path;
  }

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

  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return esc(iso);
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
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
    if (a.about) blocks.push('<section class="brand-scraper-result-block"><h4>About</h4><p>' + esc(a.about) + '</p></section>');
    if (Array.isArray(a.tone_of_voice)) blocks.push('<section class="brand-scraper-result-block"><h4>Tone of voice</h4>' + renderList(a.tone_of_voice, it => '<li><strong>' + esc(it.rule) + '</strong>' + (it.example ? ' — <em>' + esc(it.example) + '</em>' : '') + '</li>') + '</section>');
    if (Array.isArray(a.brand_values)) blocks.push('<section class="brand-scraper-result-block"><h4>Brand values</h4>' + renderList(a.brand_values, it => '<li><strong>' + esc(it.value) + '</strong> — ' + esc(it.description) + '</li>') + '</section>');
    if (Array.isArray(a.editorial_guidelines)) blocks.push('<section class="brand-scraper-result-block"><h4>Editorial guidelines</h4>' + renderList(a.editorial_guidelines, it => '<li><strong>' + esc(it.rule) + '</strong>' + (it.example ? ' — <em>' + esc(it.example) + '</em>' : '') + '</li>') + '</section>');
    if (Array.isArray(a.image_guidelines)) blocks.push('<section class="brand-scraper-result-block"><h4>Image guidelines</h4>' + renderList(a.image_guidelines, it => '<li>' + esc(it.rule) + (it.example ? ' — <em>' + esc(it.example) + '</em>' : '') + '</li>') + '</section>');
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

  function renderSegments(s) {
    if (!s) return '';
    if (s.skipped) return '<p class="brand-scraper-result-muted">Segments skipped: ' + esc(s.reason || 'no key') + '.</p>';
    if (s.error) return '<p class="brand-scraper-result-muted">Segment generation failed: ' + esc(s.error) + '</p>';
    const list = Array.isArray(s.segments) ? s.segments : [];
    if (!list.length) return '';
    const groups = { edge: [], streaming: [], batch: [], other: [] };
    for (const seg of list) {
      const key = (seg.evaluation_type || '').toLowerCase();
      (groups[key] || groups.other).push(seg);
    }
    const renderCard = (seg) => {
      const criteria = Array.isArray(seg.criteria) ? seg.criteria : [];
      const campaigns = Array.isArray(seg.suggested_campaigns) ? seg.suggested_campaigns : [];
      const useCases = Array.isArray(seg.use_cases) ? seg.use_cases : [];
      const personas = Array.isArray(seg.qualified_personas) ? seg.qualified_personas : [];
      const evalType = (seg.evaluation_type || '').toLowerCase();
      return (
        '<article class="brand-scraper-segment" data-eval="' + esc(evalType) + '">' +
          '<header class="brand-scraper-segment-head">' +
            '<span class="brand-scraper-segment-eval brand-scraper-segment-eval--' + esc(evalType || 'other') + '">' + esc(evalType || 'segment') + '</span>' +
            (seg.estimated_size ? '<span class="brand-scraper-segment-size">' + esc(seg.estimated_size) + '</span>' : '') +
          '</header>' +
          '<h5>' + esc(seg.name || 'Untitled segment') + '</h5>' +
          (seg.description ? '<p>' + esc(seg.description) + '</p>' : '') +
          (criteria.length ? '<div class="brand-scraper-segment-block"><h6>Criteria</h6><ul>' +
            criteria.map(c => '<li><code>' + esc(c) + '</code></li>').join('') + '</ul></div>' : '') +
          (useCases.length ? '<div class="brand-scraper-segment-block"><h6>Use cases</h6><ul>' +
            useCases.map(u => '<li>' + esc(u) + '</li>').join('') + '</ul></div>' : '') +
          (campaigns.length ? '<div class="brand-scraper-persona-block"><h6>Suggested campaigns</h6><div class="brand-scraper-persona-chips">' +
            campaigns.map(c => '<span class="brand-scraper-chip">' + esc(c) + '</span>').join('') + '</div></div>' : '') +
          (personas.length ? '<div class="brand-scraper-persona-block"><h6>Qualified personas</h6><div class="brand-scraper-persona-chips">' +
            personas.map(p => '<span class="brand-scraper-chip brand-scraper-chip--segment">' + esc(p) + '</span>').join('') + '</div></div>' : '') +
        '</article>'
      );
    };

    const sections = [];
    const groupMeta = [
      ['edge', 'Edge evaluation', 'Instant, same-page personalisation. No profile-store lookup.'],
      ['streaming', 'Streaming evaluation', 'Near real-time within minutes. Event-driven triggers.'],
      ['batch', 'Batch evaluation', 'Refreshed every 24h. Historical patterns, LTV.'],
      ['other', 'Other', ''],
    ];
    for (const [key, label, hint] of groupMeta) {
      const segs = groups[key];
      if (!segs || !segs.length) continue;
      sections.push(
        '<div class="brand-scraper-segment-section">' +
          '<h5>' + esc(label) + ' <span class="brand-scraper-asset-hint">' + segs.length + (hint ? ' · ' + esc(hint) : '') + '</span></h5>' +
          '<div class="brand-scraper-segment-grid">' + segs.map(renderCard).join('') + '</div>' +
        '</div>'
      );
    }

    return '<section class="brand-scraper-result-block">' +
      '<h4>Audience segments <span class="brand-scraper-asset-hint">' + list.length + ' Real-Time CDP-style segments · ' + esc(s.provider || '') + '</span></h4>' +
      sections.join('') +
    '</section>';
  }

  function renderCampaigns(c) {
    if (!c) return '';
    if (c.skipped) return '<p class="brand-scraper-result-muted">Campaigns skipped: ' + esc(c.reason || 'no key') + '.</p>';
    if (c.error) return '<p class="brand-scraper-result-muted">Campaign generation failed: ' + esc(c.error) + '</p>';
    const list = Array.isArray(c.campaigns) ? c.campaigns : [];
    if (!list.length) return '';
    const detected = list.filter(x => !x.is_recommendation);
    const recommended = list.filter(x => x.is_recommendation);

    const renderCard = (cp) => {
      const headlines = Array.isArray(cp.headlines) ? cp.headlines : [];
      const segments = Array.isArray(cp.target_segments) ? cp.target_segments : [];
      const sources = Array.isArray(cp.source_urls) ? cp.source_urls : [];
      return (
        '<article class="brand-scraper-campaign">' +
          '<header class="brand-scraper-campaign-head">' +
            '<div>' +
              '<span class="brand-scraper-campaign-type">' + esc(cp.type || 'Campaign') + '</span>' +
              '<h5>' + esc(cp.name || 'Untitled') + '</h5>' +
            '</div>' +
            (cp.channel ? '<span class="brand-scraper-chip">' + esc(cp.channel) + '</span>' : '') +
          '</header>' +
          (cp.summary ? '<p>' + esc(cp.summary) + '</p>' : '') +
          (headlines.length ? '<div class="brand-scraper-campaign-block"><h6>Headlines</h6><ul>' +
            headlines.map(h => '<li>' + esc(h) + '</li>').join('') + '</ul></div>' : '') +
          (cp.cta ? '<div class="brand-scraper-campaign-cta">' + esc(cp.cta) + '</div>' : '') +
          '<div class="brand-scraper-campaign-meta">' +
            (cp.time_context ? '<span class="brand-scraper-chip">' + esc(cp.time_context) + '</span>' : '') +
            (cp.season ? '<span class="brand-scraper-chip">' + esc(cp.season) + '</span>' : '') +
          '</div>' +
          (segments.length ? '<div class="brand-scraper-persona-block"><h6>Target segments</h6><div class="brand-scraper-persona-chips">' +
            segments.map(s => '<span class="brand-scraper-chip brand-scraper-chip--segment">' + esc(s) + '</span>').join('') +
            '</div></div>' : '') +
          (sources.length ? '<div class="brand-scraper-campaign-block"><h6>Evidence</h6><ul>' +
            sources.map(u => '<li><a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(u) + '</a></li>').join('') + '</ul></div>' : '') +
        '</article>'
      );
    };

    const sections = [];
    if (detected.length) {
      sections.push(
        '<div class="brand-scraper-campaign-section">' +
          '<h5>Detected on-site <span class="brand-scraper-asset-hint">' + detected.length + ' campaign' + (detected.length === 1 ? '' : 's') + '</span></h5>' +
          '<div class="brand-scraper-campaign-grid">' + detected.map(renderCard).join('') + '</div>' +
        '</div>'
      );
    }
    if (recommended.length) {
      sections.push(
        '<div class="brand-scraper-campaign-section">' +
          '<h5>Recommended for demo <span class="brand-scraper-asset-hint">' + recommended.length + ' suggestion' + (recommended.length === 1 ? '' : 's') + '</span></h5>' +
          '<div class="brand-scraper-campaign-grid">' + recommended.map(renderCard).join('') + '</div>' +
        '</div>'
      );
    }

    return '<section class="brand-scraper-result-block">' +
      '<h4>Campaigns <span class="brand-scraper-asset-hint">' + list.length + ' total · ' + esc(c.provider || '') + '</span></h4>' +
      sections.join('') +
    '</section>';
  }

  function renderPersonas(p) {
    if (!p) return '';
    if (p.skipped) return '<p class="brand-scraper-result-muted">Personas skipped: ' + esc(p.reason || 'no key') + '.</p>';
    if (p.error) return '<p class="brand-scraper-result-muted">Persona generation failed: ' + esc(p.error) + '</p>';
    const list = Array.isArray(p.personas) ? p.personas : [];
    if (!list.length) return '';
    const cards = list.map((persona, idx) => {
      const initials = (persona.name || '').split(/\s+/).map(s => s[0] || '').join('').slice(0, 2).toUpperCase() || '—';
      const channels = Array.isArray(persona.preferred_channels) ? persona.preferred_channels : [];
      const goals = Array.isArray(persona.goals) ? persona.goals : [];
      const pains = Array.isArray(persona.pain_points) ? persona.pain_points : [];
      const behaviours = Array.isArray(persona.behaviors) ? persona.behaviors : [];
      const segments = Array.isArray(persona.suggested_segments) ? persona.suggested_segments : [];
      return (
        '<article class="brand-scraper-persona">' +
          '<header class="brand-scraper-persona-head">' +
            '<span class="brand-scraper-persona-avatar">' + esc(initials) + '</span>' +
            '<div>' +
              '<h5>' + esc(persona.name || 'Persona ' + (idx + 1)) + '</h5>' +
              '<p class="brand-scraper-result-muted">' +
                esc((persona.occupation || '') + (persona.age ? ' · ' + persona.age : '') + (persona.location ? ' · ' + persona.location : '')) +
              '</p>' +
              (persona.income_range ? '<p class="brand-scraper-result-muted">' + esc(persona.income_range) + '</p>' : '') +
            '</div>' +
          '</header>' +
          (persona.bio ? '<p class="brand-scraper-persona-bio">' + esc(persona.bio) + '</p>' : '') +
          (persona.brand_affinity ? '<p class="brand-scraper-persona-affinity"><strong>Brand affinity:</strong> ' + esc(persona.brand_affinity) + '</p>' : '') +
          (goals.length ? '<div class="brand-scraper-persona-block"><h6>Goals</h6><ul>' + goals.map(g => '<li>' + esc(g) + '</li>').join('') + '</ul></div>' : '') +
          (pains.length ? '<div class="brand-scraper-persona-block"><h6>Pain points</h6><ul>' + pains.map(g => '<li>' + esc(g) + '</li>').join('') + '</ul></div>' : '') +
          (behaviours.length ? '<div class="brand-scraper-persona-block"><h6>Behaviours</h6><ul>' + behaviours.map(g => '<li>' + esc(g) + '</li>').join('') + '</ul></div>' : '') +
          (channels.length ? '<div class="brand-scraper-persona-chips">' + channels.map(c => '<span class="brand-scraper-chip">' + esc(c) + '</span>').join('') + '</div>' : '') +
          (segments.length ? '<div class="brand-scraper-persona-block"><h6>Likely segments</h6><div class="brand-scraper-persona-chips">' + segments.map(s => '<span class="brand-scraper-chip brand-scraper-chip--segment">' + esc(s) + '</span>').join('') + '</div></div>' : '') +
        '</article>'
      );
    }).join('');

    return '<section class="brand-scraper-result-block">' +
      '<h4>Customer personas <span class="brand-scraper-asset-hint">' + list.length + ' generated · ' + esc(p.provider || '') + '</span></h4>' +
      '<div class="brand-scraper-persona-grid">' + cards + '</div>' +
    '</section>';
  }

  function renderAssets(a) {
    if (!a) return '';
    const blocks = [];

    if (Array.isArray(a.favicons) && a.favicons.length) {
      blocks.push(
        '<div class="brand-scraper-asset-row">' +
          '<h5>Favicons</h5>' +
          '<div class="brand-scraper-favicons">' +
          a.favicons.map(f =>
            '<a href="' + esc(f.href) + '" target="_blank" rel="noopener" title="' + esc(f.rel) + (f.sizes ? ' ' + esc(f.sizes) : '') + '">' +
              '<img src="' + esc(f.href) + '" alt="" loading="lazy" referrerpolicy="no-referrer" />' +
            '</a>'
          ).join('') +
          '</div>' +
        '</div>'
      );
    }

    if (Array.isArray(a.ogImages) && a.ogImages.length) {
      blocks.push(
        '<div class="brand-scraper-asset-row">' +
          '<h5>Open Graph / social preview</h5>' +
          '<div class="brand-scraper-og-grid">' +
          a.ogImages.slice(0, 8).map(url =>
            '<a href="' + esc(url) + '" target="_blank" rel="noopener">' +
              '<img src="' + esc(url) + '" alt="" loading="lazy" referrerpolicy="no-referrer" />' +
            '</a>'
          ).join('') +
          '</div>' +
        '</div>'
      );
    }

    if (Array.isArray(a.colours) && a.colours.length) {
      blocks.push(
        '<div class="brand-scraper-asset-row">' +
          '<h5>Colour palette <span class="brand-scraper-asset-hint">ranked by frequency</span></h5>' +
          '<div class="brand-scraper-swatches">' +
          a.colours.map(c =>
            '<div class="brand-scraper-swatch" title="' + esc(c.value) + ' · ' + c.count + 'x">' +
              '<span class="brand-scraper-swatch-chip" style="background:' + esc(c.value) + '"></span>' +
              '<code>' + esc(c.value) + '</code>' +
            '</div>'
          ).join('') +
          '</div>' +
        '</div>'
      );
    }

    if (Array.isArray(a.fonts) && a.fonts.length) {
      blocks.push(
        '<div class="brand-scraper-asset-row">' +
          '<h5>Fonts <span class="brand-scraper-asset-hint">from <code>font-family</code> declarations</span></h5>' +
          '<div class="brand-scraper-fonts">' +
          a.fonts.map(f =>
            '<span class="brand-scraper-font-chip" style="font-family:' + esc(f.value) + ',sans-serif" title="' + f.count + 'x">' +
              esc(f.value) +
            '</span>'
          ).join('') +
          '</div>' +
        '</div>'
      );
    }

    if (Array.isArray(a.images) && a.images.length) {
      blocks.push(
        '<div class="brand-scraper-asset-row">' +
          '<h5>Images <span class="brand-scraper-asset-hint">first ' + a.images.length + ' discovered — thumbnails load from origin, some sites block hotlinking</span></h5>' +
          '<div class="brand-scraper-image-grid">' +
          a.images.slice(0, 48).map(img =>
            '<a href="' + esc(img.src) + '" target="_blank" rel="noopener" title="' + esc(img.alt || img.src) + '">' +
              '<img src="' + esc(img.src) + '" alt="' + esc(img.alt || '') + '" loading="lazy" referrerpolicy="no-referrer" />' +
            '</a>'
          ).join('') +
          '</div>' +
        '</div>'
      );
    }

    if (!blocks.length) return '';
    return '<section class="brand-scraper-result-block">' +
      '<h4>Assets</h4>' +
      blocks.join('') +
    '</section>';
  }

  function renderCrawl(c) {
    if (!c || !Array.isArray(c.pages)) return '';
    const rows = c.pages.map(p => (
      '<tr>' +
        '<td><a href="' + esc(p.url) + '" target="_blank" rel="noopener">' + esc(p.url) + '</a></td>' +
        '<td>' + esc(p.title || '—') + '</td>' +
        '<td class="brand-scraper-num">' + esc(p.status) + '</td>' +
        '<td class="brand-scraper-num">' + esc((p.textLength || 0).toLocaleString()) + '</td>' +
      '</tr>'
    )).join('');
    return '<section class="brand-scraper-result-block">' +
      '<h4>Crawl summary</h4>' +
      '<p class="brand-scraper-result-muted">' + (c.pagesScraped || 0) + ' pages scraped, ' + (c.totalDiscovered || 0) + ' URLs discovered.</p>' +
      '<table class="brand-scraper-table"><thead><tr><th>URL</th><th>Title</th><th>Status</th><th>Chars</th></tr></thead><tbody>' + rows + '</tbody></table>' +
    '</section>';
  }

  function renderResults(data) {
    resultsEl.hidden = false;
    const crawl = data.crawl || data.crawlSummary;
    resultsEl.innerHTML = (
      '<header class="brand-scraper-result-header">' +
        '<h3>' + esc(data.brandName || 'Results') + '</h3>' +
        '<p class="brand-scraper-result-muted">' + esc(data.baseUrl || data.url || '') + ' · ' +
          esc((data.businessType || '').toUpperCase()) + (data.country ? ' · ' + esc(data.country) : '') +
          (data.elapsedMs ? ' · ' + (data.elapsedMs / 1000).toFixed(1) + 's' : '') +
          (data.sandbox ? ' · sandbox: <code>' + esc(data.sandbox) + '</code>' : '') +
        '</p>' +
      '</header>' +
      (data.analysisError ? '<p class="brand-scraper-result-muted">Analysis error: ' + esc(data.analysisError) + '</p>' : '') +
      renderAnalysis(data.analysis) +
      renderSegments(data.segments) +
      renderCampaigns(data.campaigns) +
      renderPersonas(data.personas) +
      renderAssets(crawl && crawl.assets) +
      renderCrawl(crawl)
    );
    resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderHistory(items) {
    const sb = getSandbox();
    if (historySandboxEl) historySandboxEl.textContent = sb ? 'Sandbox: ' + sb : 'No sandbox selected';

    if (!Array.isArray(items) || !items.length) {
      historyListEl.hidden = true;
      historyListEl.innerHTML = '';
      historyEmptyEl.hidden = false;
      historyEmptyEl.textContent = sb
        ? 'No scrapes yet for this sandbox. Run one above to populate the list.'
        : 'Select a sandbox to see its scrapes.';
      return;
    }
    historyEmptyEl.hidden = true;
    historyListEl.hidden = false;
    historyListEl.innerHTML = items.map(it => (
      '<article class="brand-scraper-history-card" data-scrape-id="' + esc(it.scrapeId) + '">' +
        '<div class="brand-scraper-history-card-main">' +
          '<h4>' + esc(it.brandName || it.baseUrl || it.url) + '</h4>' +
          '<p class="brand-scraper-result-muted">' + esc(it.baseUrl || it.url || '') + '</p>' +
          '<p class="brand-scraper-result-muted">' +
            fmtDate(it.updatedAt || it.createdAt) +
            (typeof it.pagesScraped === 'number' ? ' · ' + it.pagesScraped + ' pages' : '') +
            (it.analysisPresent ? ' · analysed' : (it.analysisError ? ' · error' : ' · no analysis')) +
            (it.personasPresent ? ' · personas' : '') +
            (it.campaignsPresent ? ' · campaigns' : '') +
            (it.segmentsPresent ? ' · segments' : '') +
          '</p>' +
        '</div>' +
        '<div class="brand-scraper-history-card-actions">' +
          '<button type="button" class="dashboard-btn-outline" data-action="view">View</button>' +
          '<button type="button" class="dashboard-btn-outline" data-action="delete">Delete</button>' +
        '</div>' +
      '</article>'
    )).join('');
  }

  let historyItemsCache = [];

  async function loadHistory() {
    const sb = getSandbox();
    if (historySandboxEl) historySandboxEl.textContent = sb ? 'Sandbox: ' + sb : 'No sandbox selected';
    if (!sb) { historyItemsCache = []; renderHistory([]); return; }
    historyEmptyEl.hidden = false;
    historyEmptyEl.textContent = 'Loading…';
    historyListEl.hidden = true;
    try {
      const resp = await fetch(withSandboxQuery('/api/brand-scraper/scrapes'));
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        historyEmptyEl.textContent = 'Failed to load scrapes: ' + (data.error || resp.statusText);
        historyItemsCache = [];
        return;
      }
      historyItemsCache = Array.isArray(data.items) ? data.items : [];
      renderHistory(historyItemsCache);
    } catch (e) {
      historyEmptyEl.textContent = 'Network error: ' + (e && e.message || e);
      historyItemsCache = [];
    }
  }

  function urlKey(u) {
    if (!u) return '';
    try { return new URL(u).toString().replace(/\/$/, '').toLowerCase(); }
    catch (_e) { return String(u).trim().toLowerCase().replace(/\/$/, ''); }
  }

  function findExistingScrape(targetUrl) {
    const key = urlKey(targetUrl);
    if (!key) return null;
    return historyItemsCache.find(it => urlKey(it.baseUrl) === key || urlKey(it.url) === key) || null;
  }

  async function viewScrape(scrapeId) {
    try {
      const resp = await fetch(withSandboxQuery('/api/brand-scraper/scrapes/' + encodeURIComponent(scrapeId)));
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) { setStatus('Could not load scrape: ' + (data.error || resp.statusText), 'error'); return; }
      renderResults({
        ...data,
        crawl: data.crawlSummary,
      });
      setStatus('Loaded scrape from ' + fmtDate(data.updatedAt || data.createdAt) + '.', 'info');
    } catch (e) {
      setStatus('Network error: ' + (e && e.message || e), 'error');
    }
  }

  async function deleteScrape(scrapeId) {
    if (!confirm('Delete this scrape? This cannot be undone.')) return;
    try {
      const resp = await fetch(withSandboxQuery('/api/brand-scraper/scrapes/' + encodeURIComponent(scrapeId)), { method: 'DELETE' });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) { setStatus('Delete failed: ' + (data.error || resp.statusText), 'error'); return; }
      await loadHistory();
    } catch (e) {
      setStatus('Network error: ' + (e && e.message || e), 'error');
    }
  }

  if (historyListEl) {
    historyListEl.addEventListener('click', (evt) => {
      const btn = evt.target.closest('button[data-action]');
      if (!btn) return;
      const card = btn.closest('[data-scrape-id]');
      const id = card && card.getAttribute('data-scrape-id');
      if (!id) return;
      if (btn.dataset.action === 'view') viewScrape(id);
      else if (btn.dataset.action === 'delete') deleteScrape(id);
    });
  }

  if (historyRefreshBtn) historyRefreshBtn.addEventListener('click', loadHistory);

  window.addEventListener('aep-global-sandbox-change', () => {
    resultsEl.hidden = true;
    resultsEl.innerHTML = '';
    setStatus('');
    applyStoredCountry();
    loadHistory();
  });

  form.addEventListener('submit', async function (evt) {
    evt.preventDefault();
    const url = normaliseUrl(urlInput.value);
    if (!url) { setStatus('Enter a brand URL to continue.', 'error'); urlInput.focus(); return; }
    try { new URL(url); } catch (_e) {
      setStatus('That URL doesn\u2019t look valid. Try something like nike.com.', 'error');
      urlInput.focus(); return;
    }

    const sb = getSandbox();
    if (!sb) {
      setStatus('Select a sandbox in the sidebar before running a scrape — results are stored per sandbox.', 'error');
      return;
    }

    // Ask about append if this URL has been scraped already in this sandbox.
    const existing = findExistingScrape(url);
    let mode = 'new';
    let existingScrapeId = '';
    if (existing) {
      const when = fmtDate(existing.updatedAt || existing.createdAt);
      const append = confirm(
        'You already have a scrape for "' + (existing.brandName || existing.baseUrl || url) + '" from ' + when + '.\n\n' +
        'OK → append this run to the existing scrape (merge pages, assets, colours, fonts; grow personas list).\n' +
        'Cancel → create a new, separate scrape.'
      );
      if (append) {
        mode = 'append';
        existingScrapeId = existing.scrapeId;
      }
    }

    if (runBtn) runBtn.disabled = true;
    const modeLabel = mode === 'append' ? 'appending to existing scrape' : 'running new scrape';
    setStatus('Crawling ' + url + ' for sandbox "' + sb + '" (' + modeLabel + ') \u2026 this can take 30\u201390 seconds.', 'info');
    resultsEl.hidden = true;

    try {
      const analyzeUrl = ANALYZE_URL + (ANALYZE_URL.includes('?') ? '&' : '?') + 'sandbox=' + encodeURIComponent(sb);
      const resp = await fetch(analyzeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url,
          sandbox: sb,
          mode: mode,
          existingScrapeId: existingScrapeId,
          businessType: btypeSel && btypeSel.value,
          country: countrySel && countrySel.value,
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setStatus('Analysis failed: ' + (data.error || resp.statusText), 'error');
        return;
      }
      const actionVerb = data.appended ? 'Appended to existing scrape' : 'Saved as new scrape';
      setStatus('Done \u2014 crawled ' + (data.crawl && data.crawl.pagesScraped) + ' pages in ' +
        (data.elapsedMs ? (data.elapsedMs / 1000).toFixed(1) + 's' : '') + '. ' + actionVerb + ' in sandbox "' + sb + '".', 'info');
      renderResults(data);
      loadHistory();
    } catch (e) {
      setStatus('Network error: ' + (e && e.message || e), 'error');
    } finally {
      if (runBtn) runBtn.disabled = false;
    }
  });

  // Initial load — wait a tick so the sidebar/sandbox sync can settle.
  setTimeout(() => { applyStoredCountry(); loadHistory(); }, 300);
})();
