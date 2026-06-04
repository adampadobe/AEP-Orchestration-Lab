/**
 * Opportunity detail views — offsite social/earned + dynamic table data (brand-aware URLs).
 */
(function (root) {
  'use strict';

  function deps() {
    return root.__llmOppDetailDeps || {};
  }

  function esc(s) {
    var fn = deps().escapeHtml;
    return fn ? fn(s) : String(s);
  }

  function brand() {
    var fn = deps().demoBrandLabel;
    return fn ? fn() : 'Sky';
  }

  function siteUrl(path) {
    var fn = deps().demoSiteUrl;
    return fn ? fn(path) : 'https://www.sky.com' + (path.charAt(0) === '/' ? path : '/' + path);
  }

  function linkCell(raw) {
    var fn = deps().demoLinkCell;
    return fn ? fn(raw) : '<td>' + esc(raw) + '</td>';
  }

  function backBtn() {
    return (
      '<button type="button" class="sky-llm-op-back" id="skyLlmOpBack">← Back to Opportunities</button>'
    );
  }

  function build404View() {
    var rows = [
      ['/products/hbmr212/HBM212', '2,438', '716', '658', '532', '532'],
      ['/coffee-buy', '1,686', '505', '411', '385', '385'],
      ['/magazine/entertainment', '1,609', '301', '412', '444', '444'],
    ];
    return {
      kind: 'table',
      title: 'Agentic Traffic 404s Analysis',
      subtitle: 'Analysis of 404 errors detected by AI agents crawling your site',
      kpi1Label: 'Total URLs',
      kpi1Value: '3',
      kpi2Label: 'Total Hits',
      kpi2Value: '5,733',
      summary:
        'Found 3 URLs returning 404 errors with 5733 total hits from AI agents, representing significant lost traffic potential.',
      sectionTitle: '404 Errors Details',
      tableHeaders: ['Url', 'Total', 'Week 19, 2024', 'Week 20, 2024', 'Week 21, 2024', 'Week 22, 2024'],
      rows: rows.map(function (row) {
        return [siteUrl(row[0])].concat(row.slice(1));
      }),
    };
  }

  function kpiStrip(items) {
    return (
      '<div class="sky-llm-op-kpi-row sky-llm-op-kpi-row--multi">' +
      items
        .map(function (item) {
          return (
            '<div class="sky-llm-op-kpi-card"><span class="sky-llm-op-kpi-label">' +
            esc(item.label) +
            (item.hint ? ' <span class="sky-llm-op-info" title="' + esc(item.hint) + '">i</span>' : '') +
            '</span><span class="sky-llm-op-kpi-value">' +
            esc(item.value) +
            '</span></div>'
          );
        })
        .join('') +
      '</div>'
    );
  }

  function priorityPill(level) {
    var cls = 'sky-llm-op-priority sky-llm-op-priority--medium';
    if (level === 'Critical') cls = 'sky-llm-op-priority sky-llm-op-priority--critical';
    if (level === 'High') cls = 'sky-llm-op-priority sky-llm-op-priority--high';
    return '<span class="' + cls + '">' + esc(level) + '</span>';
  }

  function buildRedditDetailHtml() {
    var b = brand();
    return (
      backBtn() +
      '<h1 class="sky-llm-op-detail-title">Reddit Sentiment Analysis — ' +
      esc(b) +
      '</h1>' +
      '<p class="sky-llm-op-detail-subtitle">Reddit is a critical data source for Large Language Models. When users ask AI assistants about your brand, LLM responses are influenced by Reddit content sentiment. This analysis identifies actionable improvements to ' +
      esc(b) +
      '\'s Reddit reputation across r/Coffee, r/espresso, r/InstantCoffee, r/BuyItForLife, and r/sustainability.</p>' +
      '<div class="sky-llm-op-recover-meta">' +
      '<span class="sky-llm-op-pill">Social &amp; Community</span>' +
      '<span class="sky-llm-op-pill">Social Media</span>' +
      '<span class="sky-llm-op-updated">Updated Mon, Jun 3, 2024</span>' +
      '<button type="button" class="sky-llm-op-export-btn sky-llm-op-export-btn--inline">Export to PDF</button>' +
      '</div>' +
      kpiStrip([
        { label: 'Posts Analyzed', value: '16', hint: 'Threads scanned in the last 90 days' },
        { label: 'Comments Analyzed', value: '1,487' },
        { label: 'Brand Mentions (Threads)', value: '221' },
        { label: 'Overall Sentiment (Threads)', value: 'Favorable' },
      ]) +
      '<div class="sky-llm-op-tabs">' +
      '<span class="sky-llm-op-tab sky-llm-op-tab--active">Suggestions</span>' +
      '<span class="sky-llm-op-tab">Performance</span>' +
      '</div>' +
      '<div class="sky-llm-op-subtabs">' +
      '<span class="sky-llm-op-subtab sky-llm-op-subtab--active">Current Suggestions</span>' +
      '<span class="sky-llm-op-subtab">Fixed Suggestions</span>' +
      '<span class="sky-llm-op-subtab">Ignored Suggestions</span>' +
      '<div class="sky-llm-op-subtabs-actions">' +
      '<button type="button" class="sky-llm-op-ghost-btn" disabled>Mark as Fixed</button>' +
      '<button type="button" class="sky-llm-op-ghost-btn" disabled>Ignore Suggestions</button>' +
      '</div></div>' +
      '<div class="sky-llm-op-table-wrap"><table class="sky-llm-op-table sky-llm-op-table-suggestions">' +
      '<thead><tr><th></th><th>Suggestion</th><th>Priority</th><th>Action Items</th><th>Evidence</th></tr></thead>' +
      '<tbody>' +
      '<tr><td class="sky-llm-op-expand-cell">▾</td><td>Counter Price-Anchored Comparisons with Total-Cost-of-Ownership Content</td><td>' +
      priorityPill('Critical') +
      '</td><td><button type="button" class="sky-llm-op-ghost-btn">View 3 actions</button></td><td><button type="button" class="sky-llm-op-ghost-btn">Evidence</button></td></tr>' +
      '<tr><td class="sky-llm-op-expand-cell">▾</td><td>Amplify MyBarista Personalization Story through Subreddit Engagement</td><td>' +
      priorityPill('High') +
      '</td><td><button type="button" class="sky-llm-op-ghost-btn">View 3 actions</button></td><td><button type="button" class="sky-llm-op-ghost-btn">Evidence</button></td></tr>' +
      '<tr><td class="sky-llm-op-expand-cell">▾</td><td>Publish Verified Sustainability Disclosure and Seed Cross-Subreddit Visibility</td><td>' +
      priorityPill('Medium') +
      '</td><td><button type="button" class="sky-llm-op-ghost-btn">View 3 actions</button></td><td><button type="button" class="sky-llm-op-ghost-btn">Evidence</button></td></tr>' +
      '</tbody></table></div>'
    );
  }

  function buildYoutubeDetailHtml() {
    var b = brand();
    return (
      backBtn() +
      '<h1 class="sky-llm-op-detail-title">YouTube Sentiment Analysis — ' +
      esc(b) +
      ' Pricing Perception</h1>' +
      '<p class="sky-llm-op-detail-subtitle">YouTube reviews and creator commentary shape how LLMs summarize pricing, value, and product comparisons for your brand.</p>' +
      '<div class="sky-llm-op-recover-meta">' +
      '<span class="sky-llm-op-pill">Social Media</span>' +
      '<span class="sky-llm-op-updated">Updated Mon, Jan 1, 2024</span>' +
      '</div>' +
      kpiStrip([
        { label: 'Videos Analyzed', value: '42' },
        { label: 'Comments Analyzed', value: '3,204' },
        { label: 'Brand Mentions', value: '318' },
        { label: 'Overall Sentiment', value: 'Mixed' },
      ]) +
      '<div class="sky-llm-op-tabs">' +
      '<span class="sky-llm-op-tab sky-llm-op-tab--active">Suggestions</span>' +
      '<span class="sky-llm-op-tab">Performance</span>' +
      '</div>' +
      '<div class="sky-llm-op-table-wrap"><table class="sky-llm-op-table sky-llm-op-table-suggestions">' +
      '<thead><tr><th></th><th>Suggestion</th><th>Priority</th><th>Action Items</th><th>Evidence</th></tr></thead>' +
      '<tbody>' +
      '<tr><td class="sky-llm-op-expand-cell">▾</td><td>Publish transparent pricing explainers aligned to top creator comparison keywords</td><td>' +
      priorityPill('High') +
      '</td><td><button type="button" class="sky-llm-op-ghost-btn">View 2 actions</button></td><td><button type="button" class="sky-llm-op-ghost-btn">Evidence</button></td></tr>' +
      '<tr><td class="sky-llm-op-expand-cell">▾</td><td>Seed official channel responses on high-velocity review threads</td><td>' +
      priorityPill('Medium') +
      '</td><td><button type="button" class="sky-llm-op-ghost-btn">View 2 actions</button></td><td><button type="button" class="sky-llm-op-ghost-btn">Evidence</button></td></tr>' +
      '</tbody></table></div>'
    );
  }

  function wikiKpiCard(item) {
    return (
      '<div class="sky-llm-op-kpi-card sky-llm-op-kpi-card--compact">' +
      '<span class="sky-llm-op-kpi-label">' +
      esc(item.label) +
      ' <span class="sky-llm-op-info" title="Compared to industry average">i</span></span>' +
      '<span class="sky-llm-op-kpi-value">' +
      esc(item.value) +
      '</span>' +
      '<span class="' +
      esc(item.subClass) +
      '">' +
      esc(item.sub) +
      '</span></div>'
    );
  }

  function wikiRecRow(label) {
    return (
      '<li>' +
      '<input type="checkbox" aria-label="Select recommendation">' +
      '<span class="sky-llm-op-rec-label">' +
      esc(label) +
      '</span>' +
      '<span class="sky-llm-op-rec-status">PENDING VALIDATION</span>' +
      '</li>'
    );
  }

  function buildWikipediaDetailHtml() {
    var b = brand();
    var kpis = [
      { label: 'References', value: '111', sub: '+39% vs Average', subClass: 'sky-llm-op-kpi-sub sky-llm-op-kpi-sub--pos' },
      { label: 'Sections', value: '9', sub: '+100% vs Average', subClass: 'sky-llm-op-kpi-sub sky-llm-op-kpi-sub--pos' },
      { label: 'Word Count', value: '3,432', sub: '+60% vs Average', subClass: 'sky-llm-op-kpi-sub sky-llm-op-kpi-sub--pos' },
      { label: 'Images', value: '6', sub: '+40% vs Average', subClass: 'sky-llm-op-kpi-sub sky-llm-op-kpi-sub--pos' },
      { label: 'Categories', value: '34', sub: '-10% vs Average', subClass: 'sky-llm-op-kpi-sub sky-llm-op-kpi-sub--neg' },
    ];
    var recs = [
      'Infobox Complete',
      'Sections Leader',
      'Categories Leader',
      'Article Quality Status',
      'References Above Average',
      'Images Above Average',
    ];

    return (
      backBtn() +
      '<div class="sky-llm-op-wiki-detail sky-llm-op-content-op">' +
      '<div class="sky-llm-op-wiki-head">' +
      '<div class="sky-llm-op-wiki-head-main">' +
      '<h1 class="sky-llm-op-detail-title">LLM discoverability: Improve Wikipedia presence</h1>' +
      '<p class="sky-llm-op-detail-subtitle">AI-powered suggestions to optimize your Wikipedia presence.</p>' +
      '<div class="sky-llm-op-recover-meta">' +
      '<span class="sky-llm-op-pill">Wikipedia Analysis</span>' +
      '<span class="sky-llm-op-updated">Updated Tue, Apr 23, 2024</span>' +
      '</div></div>' +
      '<div class="sky-llm-op-wiki-head-actions">' +
      '<button type="button" class="sky-llm-op-export-btn">Export to PDF</button>' +
      '<button type="button" class="sky-llm-op-deploy-btn" disabled>Deploy optimizations</button>' +
      '</div></div>' +
      '<div class="sky-llm-op-kpi-row sky-llm-op-kpi-row--five">' +
      kpis.map(wikiKpiCard).join('') +
      '</div>' +
      '<section class="sky-llm-op-panel sky-llm-op-panel--overview-lite">' +
      '<button type="button" class="sky-llm-op-panel-toggle" aria-expanded="true">' +
      '<span class="sky-llm-op-panel-title">Overview</span>' +
      '</button>' +
      '<div class="sky-llm-op-panel-body">' +
      '<p>Enhance your company\'s Wikipedia page to improve visibility in Large Language Model (LLM) and AI search responses. A well-maintained Wikipedia presence increases the likelihood of being accurately cited by AI systems like ChatGPT, Google AI Mode, Gemini, Perplexity, and Copilot. Review the suggestions below and use the action buttons to mark them as applied or dismiss them.</p>' +
      '<p class="sky-llm-op-platforms"><strong>IMPROVE VISIBILITY IN:</strong> ChatGPT (Paid) · ChatGPT (Free) · Google AI Overview · Perplexity · Google AI Mode · Microsoft Copilot · Gemini</p>' +
      '</div></section>' +
      '<div class="sky-llm-op-tabs">' +
      '<span class="sky-llm-op-tab sky-llm-op-tab--active">Suggestions &amp; Guidance</span>' +
      '<span class="sky-llm-op-tab">Market Comparison</span>' +
      '<span class="sky-llm-op-tab">Your Article</span>' +
      '</div>' +
      '<div class="sky-llm-op-guidance-head">' +
      '<div class="sky-llm-op-guidance-head-title">' +
      '<h2 class="sky-llm-op-section-title">Guidance</h2>' +
      '<span class="sky-llm-op-ai-badge">AI-Generated</span></div>' +
      '<button type="button" class="sky-llm-op-ghost-btn sky-llm-op-view-wiki-btn">View Wikipedia Page</button>' +
      '</div>' +
      '<section class="sky-llm-op-guidance-grid">' +
      '<div class="sky-llm-op-guidance-col"><h3>Recommendation</h3><p>Review and implement the suggested improvements to enhance Wikipedia presence and LLM visibility.</p></div>' +
      '<div class="sky-llm-op-guidance-col"><h3>Key Insight</h3><p>Wikipedia analysis identified ' +
      recs.length +
      ' improvement opportunities for <strong>' +
      esc(b) +
      '</strong>.</p></div>' +
      '<div class="sky-llm-op-guidance-col"><h3>Rationale</h3><p>Based on comparison with industry competitors in your category.</p></div>' +
      '</section>' +
      '<div class="sky-llm-op-section-head sky-llm-op-section-head--wiki-rec">' +
      '<div><h2 class="sky-llm-op-section-title">Strategic Recommendations</h2>' +
      '<span class="sky-llm-op-ai-badge">AI-Generated</span></div>' +
      '<a href="#" class="sky-llm-op-help-link">How priorities work</a>' +
      '</div>' +
      '<div class="sky-llm-op-toolbar">' +
      '<span class="sky-llm-op-filter">Status: Current (All)</span>' +
      '<span class="sky-llm-op-filter">Priority: All (' +
      recs.length +
      ')</span>' +
      '<button type="button" class="sky-llm-op-ghost-btn" disabled>Mark Fixed</button>' +
      '<button type="button" class="sky-llm-op-ghost-btn" disabled>Ignore</button>' +
      '</div>' +
      '<ul class="sky-llm-op-rec-list sky-llm-op-rec-list--wiki">' +
      recs.map(wikiRecRow).join('') +
      '</ul></div>'
    );
  }

  function buildCitedDetailHtml() {
    var b = brand();
    return (
      backBtn() +
      '<h1 class="sky-llm-op-detail-title">Cited Sentiment Analysis — ' +
      esc(b) +
      '</h1>' +
      '<p class="sky-llm-op-detail-subtitle">Earned citations in third-party articles influence how LLMs summarize brand sentiment. This view tracks citation context, tone, and remediation opportunities across the open web.</p>' +
      '<div class="sky-llm-op-recover-meta">' +
      '<span class="sky-llm-op-pill">Earned Content</span>' +
      '<span class="sky-llm-op-updated">Updated Mon, Jan 1, 2024</span>' +
      '</div>' +
      kpiStrip([
        { label: 'Articles Analyzed', value: '128' },
        { label: 'Brand Citations', value: '412' },
        { label: 'Positive Mentions', value: '64%' },
        { label: 'Neutral / Negative', value: '36%' },
      ]) +
      '<div class="sky-llm-op-tabs">' +
      '<span class="sky-llm-op-tab sky-llm-op-tab--active">Suggestions</span>' +
      '<span class="sky-llm-op-tab">Performance</span>' +
      '</div>' +
      '<div class="sky-llm-op-table-wrap"><table class="sky-llm-op-table sky-llm-op-table-suggestions">' +
      '<thead><tr><th></th><th>Suggestion</th><th>Priority</th><th>Action Items</th><th>Evidence</th></tr></thead>' +
      '<tbody>' +
      '<tr><td class="sky-llm-op-expand-cell">▾</td><td>Correct outdated product claims in top-cited publisher articles</td><td>' +
      priorityPill('Critical') +
      '</td><td><button type="button" class="sky-llm-op-ghost-btn">View 4 actions</button></td><td><button type="button" class="sky-llm-op-ghost-btn">Evidence</button></td></tr>' +
      '<tr><td class="sky-llm-op-expand-cell">▾</td><td>Pitch updated brand narrative to high-authority citation sources</td><td>' +
      priorityPill('High') +
      '</td><td><button type="button" class="sky-llm-op-ghost-btn">View 3 actions</button></td><td><button type="button" class="sky-llm-op-ghost-btn">Evidence</button></td></tr>' +
      '</tbody></table></div>'
    );
  }

  root.LlmOpportunityDetailViews = {
    build404View: build404View,
    buildRedditDetailHtml: buildRedditDetailHtml,
    buildYoutubeDetailHtml: buildYoutubeDetailHtml,
    buildWikipediaDetailHtml: buildWikipediaDetailHtml,
    buildCitedDetailHtml: buildCitedDetailHtml,
  };
  root.SkyLlmOpportunityDetailViews = root.LlmOpportunityDetailViews;
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
