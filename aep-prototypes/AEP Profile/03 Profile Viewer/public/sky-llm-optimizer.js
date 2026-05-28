/**
 * Sky — Adobe LLM Optimizer demo (multi-page shell + lab chrome).
 */
(function () {
  'use strict';

  var NAV = [
    { id: 'overview', label: 'Overview' },
    { id: 'brand-presence', label: 'Brand Presence' },
    { id: 'agentic-traffic', label: 'Agentic Traffic' },
    { id: 'referral-traffic', label: 'Referral Traffic' },
    { id: 'llm-response', label: 'LLM Response' },
    { id: 'opportunities', label: 'Opportunities' },
    { id: 'collaboration', label: 'Collaboration' },
    { id: 'customer-configuration', label: 'Customer Configuration' },
    { id: 'settings', label: 'Settings' },
  ];

  var PLATFORMS = [
    { id: 'chatgpt-plus', name: 'ChatGPT Plus', share: '49 % global market share', icon: 'openai' },
    { id: 'chatgpt-free', name: 'ChatGPT (Free)', share: '49 % global market share', icon: 'openai' },
    { id: 'gemini', name: 'Gemini', share: '19 % global market share', icon: 'gemini' },
    { id: 'google-ai-mode', name: 'Google AI Mode', share: '17 % global market share', icon: 'google' },
    { id: 'copilot', name: 'Microsoft Copilot', share: '3 % global market share', icon: 'microsoft' },
    { id: 'chatgpt-paid', name: 'ChatGPT (Paid)', share: '2 % global market share', icon: 'openai' },
    { id: 'perplexity', name: 'Perplexity', share: '2 % global market share', icon: 'perplexity' },
    { id: 'google-overview', name: 'Google AI Overview', share: '1 % global market share', icon: 'google' },
  ];

  var METRICS = {
    'chatgpt-plus': { visibility: '36%', mentions: '24', citations: '0', agentic: '215', sentiment: '0' },
    'chatgpt-free': { visibility: '36%', mentions: '24', citations: '0', agentic: '215', sentiment: '0' },
    gemini: { visibility: '41%', mentions: '31', citations: '2', agentic: '188', sentiment: '12' },
    'google-ai-mode': { visibility: '38%', mentions: '27', citations: '1', agentic: '201', sentiment: '8' },
    copilot: { visibility: '29%', mentions: '18', citations: '0', agentic: '142', sentiment: '4' },
    'chatgpt-paid': { visibility: '44%', mentions: '35', citations: '3', agentic: '198', sentiment: '6' },
    perplexity: { visibility: '33%', mentions: '22', citations: '4', agentic: '156', sentiment: '19' },
    'google-overview': { visibility: '37%', mentions: '26', citations: '1', agentic: '175', sentiment: '5' },
  };

  var MARKET = {
    'chatgpt-plus': [
      { name: 'Sky', citations: 72, mentions: 18 },
      { name: 'Virgin Media', citations: 65, mentions: 22 },
      { name: 'BT', citations: 58, mentions: 28 },
      { name: 'Netflix', citations: 54, mentions: 20 },
      { name: 'Disney+', citations: 48, mentions: 24 },
      { name: 'TalkTalk', citations: 42, mentions: 30 },
    ],
    'chatgpt-free': [
      { name: 'Sky', citations: 70, mentions: 20 },
      { name: 'Virgin Media', citations: 63, mentions: 24 },
      { name: 'BT', citations: 56, mentions: 30 },
      { name: 'Netflix', citations: 52, mentions: 22 },
      { name: 'TalkTalk', citations: 40, mentions: 32 },
    ],
    gemini: [
      { name: 'Sky', citations: 78, mentions: 15 },
      { name: 'Virgin Media', citations: 68, mentions: 20 },
      { name: 'BT', citations: 60, mentions: 26 },
      { name: 'NOW', citations: 55, mentions: 18 },
      { name: 'Disney+', citations: 50, mentions: 22 },
    ],
    'google-ai-mode': [
      { name: 'Sky', citations: 74, mentions: 17 },
      { name: 'Virgin Media', citations: 66, mentions: 21 },
      { name: 'BT', citations: 62, mentions: 24 },
      { name: 'EE', citations: 52, mentions: 25 },
      { name: 'Netflix', citations: 48, mentions: 28 },
    ],
    copilot: [
      { name: 'Sky', citations: 68, mentions: 19 },
      { name: 'BT', citations: 61, mentions: 27 },
      { name: 'Virgin Media', citations: 59, mentions: 23 },
      { name: 'Vodafone', citations: 45, mentions: 30 },
      { name: 'TalkTalk', citations: 38, mentions: 34 },
    ],
    'chatgpt-paid': [
      { name: 'Sky', citations: 80, mentions: 14 },
      { name: 'Virgin Media', citations: 70, mentions: 18 },
      { name: 'BT', citations: 64, mentions: 22 },
      { name: 'Netflix', citations: 58, mentions: 20 },
      { name: 'Disney+', citations: 52, mentions: 24 },
    ],
    perplexity: [
      { name: 'Sky', citations: 71, mentions: 16 },
      { name: 'Virgin Media', citations: 64, mentions: 22 },
      { name: 'BT', citations: 55, mentions: 28 },
      { name: 'NOW', citations: 53, mentions: 19 },
      { name: 'TalkTalk', citations: 41, mentions: 31 },
    ],
    'google-overview': [
      { name: 'Sky', citations: 73, mentions: 18 },
      { name: 'Virgin Media', citations: 67, mentions: 21 },
      { name: 'BT', citations: 60, mentions: 25 },
      { name: 'EE', citations: 51, mentions: 26 },
      { name: 'Netflix', citations: 47, mentions: 27 },
    ],
  };

  var PAGE_META = {
    overview: {
      title: 'Overview',
      subtitle:
        'Get insights and recommendations across Brand Presence, Agentic Traffic, Referral Traffic and Opportunities for all categories and markets.',
      iconClass: 'sky-llm-page-icon--overview',
    },
    'brand-presence': {
      title: 'Brand Presence',
      subtitle: 'Track how Sky is mentioned and cited across LLM surfaces for TV, broadband and streaming queries.',
      iconClass: 'sky-llm-page-icon--default',
    },
    'agentic-traffic': {
      title: 'Agentic Traffic',
      subtitle: 'Sessions and interactions driven by AI agents referencing sky.com and competitor domains.',
      iconClass: 'sky-llm-page-icon--default',
    },
    'referral-traffic': {
      title: 'Referral Traffic',
      subtitle: 'Click-through referrals from ChatGPT, Gemini, Copilot and other platforms to sky.com.',
      iconClass: 'sky-llm-page-icon--default',
    },
    'llm-response': {
      title: 'LLM Response',
      subtitle: 'Sample prompts and model answers where Sky appears alongside UK telecom and entertainment brands.',
      iconClass: 'sky-llm-page-icon--default',
    },
    opportunities: {
      title: 'Opportunities',
      subtitle: 'Prioritised actions to improve citability, mentions and agentic discovery for sky.com.',
      iconClass: 'sky-llm-page-icon--default',
    },
    collaboration: {
      title: 'Collaboration',
      subtitle: 'Shared workspaces, exports and stakeholder comments for Sky marketing and SEO teams.',
      iconClass: 'sky-llm-page-icon--default',
    },
    'customer-configuration': {
      title: 'Customer Configuration',
      subtitle: 'Site properties, crawl scope and category mappings for the Sky digital estate.',
      iconClass: 'sky-llm-page-icon--default',
    },
    settings: {
      title: 'Settings',
      subtitle: 'Notifications, integrations and audit preferences for this LLM Optimizer tenant.',
      iconClass: 'sky-llm-page-icon--default',
    },
  };

  var state = {
    page: 'overview',
    platformId: 'chatgpt-plus',
  };

  var rootEl;
  var contentEl;
  var platformTriggerNameEl;
  var platformMenuEl;
  var platformTriggerEl;

  function platformIconSvg(type) {
    if (type === 'openai') {
      return '<svg class="sky-llm-platform-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a7 7 0 00-5.2 11.6L4 18l4.4-2.8A7 7 0 1012 2z"/></svg>';
    }
    if (type === 'gemini') {
      return '<svg class="sky-llm-platform-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285f4" d="M12 2l2.4 6.8L22 12l-7.6 3.2L12 22l-2.4-6.8L2 12l7.6-3.2L12 2z"/></svg>';
    }
    if (type === 'google') {
      return '<svg class="sky-llm-platform-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#4285f4"/><text x="12" y="16" text-anchor="middle" fill="#fff" font-size="10" font-weight="700">G</text></svg>';
    }
    if (type === 'microsoft') {
      return '<svg class="sky-llm-platform-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="8" height="8" fill="#f25022"/><rect x="13" y="3" width="8" height="8" fill="#7fba00"/><rect x="3" y="13" width="8" height="8" fill="#00a4ef"/><rect x="13" y="13" width="8" height="8" fill="#ffb900"/></svg>';
    }
    if (type === 'perplexity') {
      return '<svg class="sky-llm-platform-icon" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="4" fill="#20808d"/><path fill="#fff" d="M8 7h3v10H8zm5 0h3v10h-3z"/></svg>';
    }
    return '';
  }

  function sparkline(down) {
    var color = down ? '#d7373f' : '#2d9d78';
    var points = down ? '0,8 6,6 12,7 18,4 24,2' : '0,10 6,8 12,6 18,5 24,3';
    return (
      '<svg class="sky-llm-spark" width="28" height="12" viewBox="0 0 24 12" aria-hidden="true">' +
      '<polyline fill="none" stroke="' +
      color +
      '" stroke-width="1.5" points="' +
      points +
      '"/></svg>'
    );
  }

  function marketRowsHtml(platformId) {
    var rows = MARKET[platformId] || MARKET['chatgpt-plus'];
    return rows
      .map(function (row) {
        return (
          '<div class="sky-llm-market-row">' +
          '<span>' +
          row.name +
          '</span>' +
          '<div class="sky-llm-market-bar" title="Citations and mentions share">' +
          '<span class="sky-llm-market-bar-cite" style="width:' +
          row.citations +
          '%"></span>' +
          '<span class="sky-llm-market-bar-mention" style="width:' +
          row.mentions +
          '%"></span>' +
          '</div>' +
          '<span>' +
          row.citations +
          '%</span>' +
          '</div>'
        );
      })
      .join('');
  }

  function overviewContent(platformId) {
    var m = METRICS[platformId] || METRICS['chatgpt-plus'];
    return (
      '<div class="sky-llm-grid-2 sky-llm-grid-2--wide-left">' +
      '<article class="sky-llm-card sky-llm-visibility-banner">' +
      '<div class="sky-llm-gauge">Current<br>Visibility</div>' +
      '<div class="sky-llm-banner-copy">' +
      '<h2>Content visibility score unavailable</h2>' +
      '<p>Your site returned fewer than 10 measurable LLM results in this period. Enable public search data to unlock the visibility score for sky.com.</p>' +
      '</div></article>' +
      '<article class="sky-llm-card sky-llm-next-steps">' +
      '<h3>Next step to unlock more insights</h3>' +
      '<p style="margin:0 0 0.5rem;font-size:12px;color:var(--llmo-text-secondary)">Push optimisation for 100 additional keywords across TV bundles and broadband.</p>' +
      '<div class="sky-llm-progress" aria-hidden="true"><span></span></div>' +
      '<button type="button" class="sky-llm-btn sky-llm-btn--primary">Enable auto-link publishing</button>' +
      '<button type="button" class="sky-llm-btn sky-llm-btn--link">See all steps</button>' +
      '</article></div>' +
      '<article class="sky-llm-card sky-llm-strategy-card">' +
      '<h3>Strengthen your prompting strategy</h3>' +
      '<div class="sky-llm-metrics">' +
      '<div class="sky-llm-metric"><div class="sky-llm-metric-label">Visibility Score</div>' +
      '<div class="sky-llm-metric-value"><span data-metric="visibility">' +
      m.visibility +
      '</span> <span class="sky-llm-trend--down">▼</span></div>' +
      sparkline(true) +
      '</div>' +
      '<div class="sky-llm-metric"><div class="sky-llm-metric-label">Brand Mentions</div>' +
      '<div class="sky-llm-metric-value"><span data-metric="mentions">' +
      m.mentions +
      '</span> <span class="sky-llm-trend--down">▼</span></div>' +
      sparkline(true) +
      '</div>' +
      '<div class="sky-llm-metric"><div class="sky-llm-metric-label">Citations</div>' +
      '<div class="sky-llm-metric-value"><span data-metric="citations">' +
      m.citations +
      '</span> <span class="sky-llm-trend--down">▼</span></div>' +
      sparkline(true) +
      '</div>' +
      '<div class="sky-llm-metric"><div class="sky-llm-metric-label">Agentic Interactions</div>' +
      '<div class="sky-llm-metric-value"><span data-metric="agentic">' +
      m.agentic +
      '</span> <span class="sky-llm-trend--up">▲</span></div>' +
      sparkline(false) +
      '</div>' +
      '<div class="sky-llm-metric"><div class="sky-llm-metric-label">Total Sentiment</div>' +
      '<div class="sky-llm-metric-value"><span data-metric="sentiment">' +
      m.sentiment +
      '</span></div></div>' +
      '</div></article>' +
      '<div class="sky-llm-grid-2">' +
      '<article class="sky-llm-card"><h3>Sentiment Distribution</h3>' +
      '<svg class="sky-llm-chart-svg" viewBox="0 0 400 200" role="img" aria-label="Sentiment by week">' +
      '<line x1="50" y1="30" x2="50" y2="150" stroke="#ccc"/><line x1="50" y1="150" x2="370" y2="150" stroke="#ccc"/>' +
      '<text x="12" y="35" font-size="9" fill="#6e6e6e">100%</text><text x="12" y="95" font-size="9" fill="#6e6e6e">50%</text>' +
      '<rect x="95" y="75" width="48" height="75" fill="#d7373f"/><rect x="95" y="55" width="48" height="20" fill="#6d6d6d"/><rect x="95" y="35" width="48" height="20" fill="#2d9d78"/>' +
      '<rect x="185" y="82" width="48" height="68" fill="#d7373f"/><rect x="185" y="58" width="48" height="24" fill="#6d6d6d"/><rect x="185" y="38" width="48" height="20" fill="#2d9d78"/>' +
      '<rect x="275" y="78" width="48" height="72" fill="#d7373f"/><rect x="275" y="54" width="48" height="24" fill="#6d6d6d"/><rect x="275" y="34" width="48" height="20" fill="#2d9d78"/>' +
      '<text x="100" y="168" font-size="9" fill="#6e6e6e">May 5</text><text x="188" y="168" font-size="9" fill="#6e6e6e">May 12</text><text x="278" y="168" font-size="9" fill="#6e6e6e">May 19</text>' +
      '</svg><div class="sky-llm-legend"><span><i style="background:#d7373f"></i> Negative</span>' +
      '<span><i style="background:#6d6d6d"></i> Neutral</span><span><i style="background:#2d9d78"></i> Positive</span></div></article>' +
      '<article class="sky-llm-card"><h3>Market Comparison</h3>' +
      '<div class="sky-llm-legend"><span><i style="background:#1473e6"></i> Citations</span>' +
      '<span><i style="background:#e68619"></i> Mentions</span></div>' +
      '<div data-market-chart>' +
      marketRowsHtml(platformId) +
      '</div></article></div>' +
      '<div class="sky-llm-grid-2">' +
      '<article class="sky-llm-card"><h3>Traffic Trends</h3>' +
      '<svg class="sky-llm-chart-svg" viewBox="0 0 400 180" role="img" aria-label="Agentic and referral traffic">' +
      '<line x1="40" y1="20" x2="40" y2="140" stroke="#ccc"/><line x1="40" y1="140" x2="380" y2="140" stroke="#ccc"/>' +
      '<polyline fill="none" stroke="#1473e6" stroke-width="2" points="55,115 105,98 155,90 205,78 255,68 305,58 355,50"/>' +
      '<polyline fill="none" stroke="#75b6ff" stroke-width="2" points="55,125 105,112 155,108 205,100 255,95 305,88 355,82"/>' +
      '<text x="50" y="158" font-size="8" fill="#6e6e6e">May 2</text><text x="320" y="158" font-size="8" fill="#6e6e6e">May 26</text>' +
      '</svg><div class="sky-llm-legend"><span><i style="background:#1473e6"></i> Agentic Traffic</span>' +
      '<span><i style="background:#75b6ff"></i> Referral Traffic</span></div></article>' +
      '<article class="sky-llm-card"><h3>Latest Opportunities</h3>' +
      '<ul class="sky-llm-opportunities">' +
      '<li><a href="#opportunities"><span><strong>Add LLM-friendly Content</strong>' +
      '<span>Update robots.txt and structured data for Sky TV and broadband pages.</span></span><span class="sky-llm-chevron">›</span></a></li>' +
      '<li><a href="#opportunities"><span><strong>Rewrite Complex Content</strong>' +
      '<span>Use layperson terms on fibre and bundle comparison pages.</span></span><span class="sky-llm-chevron">›</span></a></li>' +
      '<li><a href="#agentic-traffic"><span><strong>Agentic Traffic Trend Analysis</strong>' +
      '<span>Compare agent referrals vs Virgin Media, BT and Netflix.</span></span><span class="sky-llm-chevron">›</span></a></li>' +
      '</ul></article></div>'
    );
  }

  function brandPresenceContent() {
    return (
      '<div class="sky-llm-stat-row">' +
      '<div class="sky-llm-stat-card"><div class="label">Share of voice</div><div class="value">18%</div></div>' +
      '<div class="sky-llm-stat-card"><div class="label">Top category</div><div class="value">TV</div></div>' +
      '<div class="sky-llm-stat-card"><div class="label">New mentions</div><div class="value">+6</div></div>' +
      '</div>' +
      '<article class="sky-llm-card"><h3>Topic presence</h3><div class="sky-llm-table-wrap"><table class="sky-llm-table">' +
      '<thead><tr><th>Topic</th><th>Sky rank</th><th>Virgin Media</th><th>BT</th><th>Mentions</th></tr></thead><tbody>' +
      '<tr><td>Best TV bundles UK</td><td>2</td><td>1</td><td>4</td><td>42</td></tr>' +
      '<tr><td>Fibre broadband deals</td><td>3</td><td>2</td><td>1</td><td>38</td></tr>' +
      '<tr><td>Sports streaming packages</td><td>1</td><td>3</td><td>5</td><td>31</td></tr>' +
      '<tr><td>Sky Glass vs Netflix</td><td>1</td><td>—</td><td>—</td><td>27</td></tr>' +
      '<tr><td>Full fibre availability</td><td>4</td><td>2</td><td>1</td><td>22</td></tr>' +
      '</tbody></table></div></article>'
    );
  }

  function agenticTrafficContent() {
    return (
      '<article class="sky-llm-card"><h3>Sessions by agent platform</h3><div class="sky-llm-table-wrap"><table class="sky-llm-table">' +
      '<thead><tr><th>Platform</th><th>Sessions</th><th>Pages / session</th><th>Top landing page</th></tr></thead><tbody>' +
      '<tr><td>ChatGPT Plus</td><td>128</td><td>2.4</td><td>/tv</td></tr>' +
      '<tr><td>Gemini</td><td>46</td><td>1.9</td><td>/broadband</td></tr>' +
      '<tr><td>Microsoft Copilot</td><td>24</td><td>2.1</td><td>/deals</td></tr>' +
      '<tr><td>Perplexity</td><td>17</td><td>1.6</td><td>/help</td></tr>' +
      '</tbody></table></div></article>' +
      '<article class="sky-llm-card" style="margin-top:0.75rem"><h3>Weekly agentic sessions</h3>' +
      '<svg class="sky-llm-chart-svg" viewBox="0 0 400 160" role="img"><polyline fill="none" stroke="#1473e6" stroke-width="2" points="40,120 100,95 160,88 220,72 280,65 340,52"/></svg></article>'
    );
  }

  function referralTrafficContent() {
    return (
      '<article class="sky-llm-card"><h3>Referral sources</h3><div class="sky-llm-table-wrap"><table class="sky-llm-table">' +
      '<thead><tr><th>Source</th><th>Clicks</th><th>Change</th><th>Conversion rate</th></tr></thead><tbody>' +
      '<tr><td>chatgpt.com</td><td>312</td><td>+12%</td><td>3.2%</td></tr>' +
      '<tr><td>gemini.google.com</td><td>89</td><td>+4%</td><td>2.8%</td></tr>' +
      '<tr><td>copilot.microsoft.com</td><td>41</td><td>-2%</td><td>2.1%</td></tr>' +
      '<tr><td>perplexity.ai</td><td>36</td><td>+18%</td><td>4.0%</td></tr>' +
      '</tbody></table></div></article>'
    );
  }

  function llmResponseContent() {
    return (
      '<article class="sky-llm-response-card"><h4>Prompt: “Best TV and broadband bundle in the UK”</h4>' +
      '<p>Models often cite <strong>Sky</strong> for sports and entertainment bundles, <strong>Virgin Media</strong> for gigabit speeds, and <strong>BT</strong> for full-fibre coverage. Sky Glass is mentioned for integrated streaming hardware.</p></article>' +
      '<article class="sky-llm-response-card"><h4>Prompt: “Sky vs Netflix for movies”</h4>' +
      '<p>Responses compare Sky Cinema with <strong>Netflix</strong> and <strong>Disney+</strong>, noting Sky’s live channels vs on-demand catalogues. Citations frequently link to sky.com/tv.</p></article>' +
      '<article class="sky-llm-response-card"><h4>Prompt: “Cheapest fibre near me”</h4>' +
      '<p><strong>TalkTalk</strong> and <strong>BT</strong> lead on price-led answers; Sky appears in mid-tier “value + TV” recommendations with links to postcode checkers.</p></article>'
    );
  }

  function opportunitiesContent() {
    return (
      '<article class="sky-llm-card"><h3>All opportunities</h3><div class="sky-llm-table-wrap"><table class="sky-llm-table">' +
      '<thead><tr><th>Opportunity</th><th>Impact</th><th>Effort</th><th>Status</th></tr></thead><tbody>' +
      '<tr><td>Add LLM-friendly structured data to bundle pages</td><td><span class="sky-llm-pill sky-llm-pill--high">High</span></td><td>Medium</td><td>Open</td></tr>' +
      '<tr><td>Rewrite technical broadband jargon</td><td><span class="sky-llm-pill sky-llm-pill--med">Medium</span></td><td>Low</td><td>In progress</td></tr>' +
      '<tr><td>Connect Google Search Console</td><td><span class="sky-llm-pill sky-llm-pill--high">High</span></td><td>Low</td><td>Open</td></tr>' +
      '<tr><td>Competitive citation audit vs Virgin Media</td><td><span class="sky-llm-pill sky-llm-pill--med">Medium</span></td><td>Medium</td><td>Planned</td></tr>' +
      '<tr><td>Agentic landing page experiment on /deals</td><td><span class="sky-llm-pill sky-llm-pill--low">Low</span></td><td>High</td><td>Open</td></tr>' +
      '</tbody></table></div></article>'
    );
  }

  function collaborationContent() {
    return (
      '<article class="sky-llm-card"><h3>Shared reports</h3><div class="sky-llm-table-wrap"><table class="sky-llm-table">' +
      '<thead><tr><th>Report</th><th>Owner</th><th>Last updated</th></tr></thead><tbody>' +
      '<tr><td>Q2 LLM visibility — Sky UK</td><td>Marketing analytics</td><td>2 days ago</td></tr>' +
      '<tr><td>Competitor citation benchmark</td><td>SEO</td><td>1 week ago</td></tr>' +
      '<tr><td>Agentic traffic readout</td><td>Growth</td><td>3 days ago</td></tr>' +
      '</tbody></table></div></article>'
    );
  }

  function customerConfigContent() {
    return (
      '<article class="sky-llm-card"><h3>Site properties</h3><div class="sky-llm-form-grid">' +
      '<div><label for="skyLlmCfgSite">Primary domain</label><input id="skyLlmCfgSite" type="text" value="sky.com" readonly></div>' +
      '<div><label for="skyLlmCfgCats">Default categories</label><select id="skyLlmCfgCats"><option>All Categories</option><option>TV &amp; Entertainment</option><option>Broadband</option></select></div>' +
      '<div><label for="skyLlmCfgMarket">Primary market</label><select id="skyLlmCfgMarket"><option>United Kingdom</option><option>Republic of Ireland</option></select></div>' +
      '<div><button type="button" class="sky-llm-btn sky-llm-btn--primary">Save configuration</button></div>' +
      '</div></article>'
    );
  }

  function settingsContent() {
    return (
      '<article class="sky-llm-card"><h3>Notifications</h3><div class="sky-llm-form-grid">' +
      '<div><label><input type="checkbox" checked> Weekly visibility digest</label></div>' +
      '<div><label><input type="checkbox" checked> Citation drops vs Virgin Media / BT</label></div>' +
      '<div><label><input type="checkbox"> Agentic traffic anomalies</label></div>' +
      '</div></article>' +
      '<article class="sky-llm-card" style="margin-top:0.75rem"><h3>Integrations</h3>' +
      '<p style="margin:0;font-size:13px;color:var(--llmo-text-secondary)">Google Search Console — <strong>Not connected</strong>. Analytics — <strong>Connected</strong> (demo).</p></article>'
    );
  }

  function renderPageContent(pageId, platformId) {
    if (pageId === 'overview') return overviewContent(platformId);
    if (pageId === 'brand-presence') return brandPresenceContent();
    if (pageId === 'agentic-traffic') return agenticTrafficContent();
    if (pageId === 'referral-traffic') return referralTrafficContent();
    if (pageId === 'llm-response') return llmResponseContent();
    if (pageId === 'opportunities') return opportunitiesContent();
    if (pageId === 'collaboration') return collaborationContent();
    if (pageId === 'customer-configuration') return customerConfigContent();
    if (pageId === 'settings') return settingsContent();
    return overviewContent(platformId);
  }

  function pageFromHash() {
    var hash = (window.location.hash || '').replace(/^#/, '').trim();
    if (!hash || hash === 'overview') return 'overview';
    var found = NAV.some(function (n) {
      return n.id === hash;
    });
    return found ? hash : 'overview';
  }

  function renderContent() {
    var meta = PAGE_META[state.page] || PAGE_META.overview;
    var iconInner = state.page === 'overview' ? '🏠' : '◆';
    contentEl.innerHTML =
      '<header class="sky-llm-page-head">' +
      '<div class="sky-llm-page-icon ' +
      meta.iconClass +
      '" aria-hidden="true">' +
      iconInner +
      '</div>' +
      '<div><h1>' +
      meta.title +
      '</h1><p>' +
      meta.subtitle +
      '</p></div></header>' +
      '<div class="sky-llm-toolbar">' +
      '<div class="sky-llm-filters">' +
      '<div class="sky-llm-filter"><label>Date Range</label><select><option selected>Last 4 Weeks</option><option>Last 7 Weeks</option><option>Last Quarter</option></select></div>' +
      '<div class="sky-llm-filter"><label>Platform <span class="sky-llm-info-icon" title="LLM platform">i</span></label>' +
      '<div class="sky-llm-platform-wrap">' +
      '<button type="button" class="sky-llm-platform-trigger" id="skyLlmPlatformTrigger" aria-haspopup="listbox" aria-expanded="false">' +
      '<span id="skyLlmPlatformTriggerName">' +
      (PLATFORMS.find(function (p) {
        return p.id === state.platformId;
      }) || PLATFORMS[0]).name +
      '</span> <span aria-hidden="true">▾</span></button>' +
      '<ul class="sky-llm-platform-menu" id="skyLlmPlatformMenu" role="listbox" hidden></ul></div></div>' +
      '<div class="sky-llm-filter"><label>Category</label><select><option>All Categories</option><option>TV &amp; Entertainment</option><option>Broadband</option></select></div>' +
      '<div class="sky-llm-filter"><label>Market</label><select><option>All Markets</option><option>United Kingdom</option></select></div>' +
      '<button type="button" class="sky-llm-btn sky-llm-btn--apply" disabled>Apply Filters</button>' +
      '</div>' +
      '<div class="sky-llm-toolbar-actions">' +
      '<button type="button" class="sky-llm-btn">Share</button>' +
      '<button type="button" class="sky-llm-btn">Export to PDF</button>' +
      '<button type="button" class="sky-llm-btn sky-llm-btn--primary">Start Product Tour</button>' +
      '</div></div>' +
      '<div id="skyLlmPageBody">' +
      renderPageContent(state.page, state.platformId) +
      '</div>';

    platformTriggerEl = document.getElementById('skyLlmPlatformTrigger');
    platformTriggerNameEl = document.getElementById('skyLlmPlatformTriggerName');
    platformMenuEl = document.getElementById('skyLlmPlatformMenu');
    bindPlatformPicker();
    updateNavActive();
  }

  function updateNavActive() {
    if (!rootEl) return;
    rootEl.querySelectorAll('.sky-llm-product-nav a[data-page]').forEach(function (a) {
      a.classList.toggle('is-active', a.getAttribute('data-page') === state.page);
    });
  }

  function navigate(pageId) {
    if (!NAV.some(function (n) {
      return n.id === pageId;
    })) return;
    state.page = pageId;
    if (window.location.hash.replace('#', '') !== pageId) {
      window.location.hash = pageId === 'overview' ? '' : pageId;
    }
    renderContent();
    document.title =
      'Sky — LLM Optimizer: ' + (PAGE_META[pageId] || PAGE_META.overview).title + ' – AEP Profile Viewer';
  }

  function bindPlatformPicker() {
    if (!platformTriggerEl || !platformMenuEl) return;

    function closeMenu() {
      platformMenuEl.hidden = true;
      platformTriggerEl.setAttribute('aria-expanded', 'false');
    }

    function openMenu() {
      platformMenuEl.hidden = false;
      platformTriggerEl.setAttribute('aria-expanded', 'true');
      platformMenuEl.innerHTML = '';
      PLATFORMS.forEach(function (p) {
        var li = document.createElement('li');
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sky-llm-platform-option' + (p.id === state.platformId ? ' is-selected' : '');
        btn.innerHTML =
          '<span class="sky-llm-platform-check">✓</span>' +
          platformIconSvg(p.icon) +
          '<span class="sky-llm-platform-copy"><strong>' +
          p.name +
          '</strong><span>' +
          p.share +
          '</span></span>';
        btn.addEventListener('click', function () {
          state.platformId = p.id;
          if (platformTriggerNameEl) platformTriggerNameEl.textContent = p.name;
          closeMenu();
          if (state.page === 'overview') {
            var body = document.getElementById('skyLlmPageBody');
            if (body) body.innerHTML = overviewContent(state.platformId);
          }
        });
        li.appendChild(btn);
        platformMenuEl.appendChild(li);
      });
    }

    platformTriggerEl.addEventListener('click', function (e) {
      e.stopPropagation();
      if (platformMenuEl.hidden) openMenu();
      else closeMenu();
    });
  }

  function buildShell() {
    var navHtml = NAV.map(function (item) {
      var href = item.id === 'overview' ? '#' : '#' + item.id;
      return '<a href="' + href + '" data-page="' + item.id + '">' + item.label + '</a>';
    }).join('');

    rootEl.innerHTML =
      '<div class="sky-llm-app-root">' +
      '<header class="sky-llm-header">' +
      '<div class="sky-llm-header-brand"><img src="https://www.adobe.com/favicon.ico" width="24" height="24" alt="">' +
      '<span class="sky-llm-header-title">Adobe LLM Optimizer</span></div>' +
      '<div class="sky-llm-header-actions">' +
      '<div class="sky-llm-site-field"><label>Site</label><input type="text" value="sky.com" readonly aria-readonly="true"></div>' +
      '<button type="button" class="sky-llm-header-icon" aria-label="Help">?</button>' +
      '<button type="button" class="sky-llm-header-icon" aria-label="Notifications">🔔</button>' +
      '<button type="button" class="sky-llm-header-icon" aria-label="Account">👤</button>' +
      '</div></header>' +
      '<div class="sky-llm-body">' +
      '<nav class="sky-llm-product-nav" aria-label="LLM Optimizer">' +
      navHtml +
      '<div class="sky-llm-product-nav-footer">LLM Optimizer</div></nav>' +
      '<div class="sky-llm-main" id="skyLlmContent"></div></div></div>';

    contentEl = document.getElementById('skyLlmContent');

    rootEl.querySelectorAll('.sky-llm-product-nav a[data-page]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        navigate(a.getAttribute('data-page'));
      });
    });

    document.addEventListener('click', function (e) {
      if (platformMenuEl && platformTriggerEl && !platformMenuEl.hidden) {
        if (!platformMenuEl.contains(e.target) && !platformTriggerEl.contains(e.target)) {
          platformMenuEl.hidden = true;
          platformTriggerEl.setAttribute('aria-expanded', 'false');
        }
      }
    });
  }

  function initLabFlyoutSidebar() {
    var body = document.body;
    if (!body.classList.contains('sky-llm-optimizer-page')) return;
    var sidebar = document.querySelector('.dashboard-sidebar');
    if (!sidebar) return;
    var mq = window.matchMedia('(max-width: 768px)');
    var hideTimer = null;

    function clearHideTimer() {
      if (hideTimer) {
        window.clearTimeout(hideTimer);
        hideTimer = null;
      }
    }
    function setFlyoutOpen(open) {
      body.classList.toggle('mod-demo-page--nav-open', open);
    }
    function scheduleClose() {
      clearHideTimer();
      hideTimer = window.setTimeout(function () {
        setFlyoutOpen(false);
      }, 450);
    }
    function onPointerMove(e) {
      if (mq.matches) return;
      if (e.clientX <= 24) {
        clearHideTimer();
        setFlyoutOpen(true);
        return;
      }
      var r = sidebar.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        clearHideTimer();
        setFlyoutOpen(true);
        return;
      }
      if (body.classList.contains('mod-demo-page--nav-open')) scheduleClose();
    }
    sidebar.addEventListener('mouseenter', function () {
      if (!mq.matches) {
        clearHideTimer();
        setFlyoutOpen(true);
      }
    });
    sidebar.addEventListener('mouseleave', function () {
      if (!mq.matches) scheduleClose();
    });
    document.addEventListener('mousemove', onPointerMove, { passive: true });
    setFlyoutOpen(false);
  }

  function initProfileLookup() {
    var customerEmail = document.getElementById('customerEmail');
    if (typeof attachEmailDatalist === 'function') attachEmailDatalist('customerEmail');
    if (typeof AepIdentityPicker !== 'undefined') AepIdentityPicker.init('customerEmail', 'skyLlmNs');
    var skyLlmMessage = document.getElementById('skyLlmMessage');
    var queryProfileBtn = document.getElementById('queryProfileBtn');
    var generatorTargetSelect = document.getElementById('generatorTarget');
    var generatorTargets = [];

    function getEmail() {
      return customerEmail ? String(customerEmail.value || '').trim() : '';
    }
    function setMessage(text, type) {
      if (!skyLlmMessage) return;
      skyLlmMessage.textContent = text || '';
      skyLlmMessage.className =
        'mod-demo-message' + (type ? ' mod-demo-message--' + String(type).replace(/\s+/g, '-') : '');
      skyLlmMessage.hidden = !text;
    }
    function getSelectedGeneratorTarget() {
      var id = (generatorTargetSelect && generatorTargetSelect.value) || '';
      return generatorTargets.find(function (t) {
        return t.id === id;
      }) || generatorTargets[0] || null;
    }
    if (typeof DemoProfileDrawer !== 'undefined') {
      DemoProfileDrawer.init({
        emailInputId: 'customerEmail',
        profileOpenClass: 'mod-demo-page--profile-open',
        viewName: 'Sky LLM Optimizer',
        emailGetter: getEmail,
        messageSetter: setMessage,
        getSelectedGeneratorTarget: getSelectedGeneratorTarget,
        fetchBrowserEcidOnInit: true,
      });
    }
    if (queryProfileBtn) {
      queryProfileBtn.addEventListener('click', async function () {
        var email = getEmail();
        if (!email) {
          setMessage('Enter a customer identifier first.', 'error');
          return;
        }
        setMessage('Looking up profile…', '');
        await DemoProfileDrawer.loadProfileDataForDrawer(email, { updateMessage: true });
      });
    }
    if (generatorTargetSelect && window.AepDemoGeneratorTargets) {
      void window.AepDemoGeneratorTargets.loadGeneratorTargetsIntoSelect(generatorTargetSelect, {}).then(function (t) {
        generatorTargets = t || [];
      });
    }
    if (typeof AepDemoEnvStrip !== 'undefined' && AepDemoEnvStrip.initStandardEnvBar) {
      AepDemoEnvStrip.initStandardEnvBar({});
    }
  }

  function init() {
    rootEl = document.getElementById('skyLlmApp');
    if (!rootEl) return;
    buildShell();
    state.page = pageFromHash();
    renderContent();
    window.addEventListener('hashchange', function () {
      var next = pageFromHash();
      if (next !== state.page) {
        state.page = next;
        renderContent();
      }
    });
    initLabFlyoutSidebar();
    initProfileLookup();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
