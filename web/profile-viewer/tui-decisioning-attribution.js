(function (root) {
  'use strict';
  function details(event) {
    const rows = Array.isArray(event?.rows) ? event.rows : [];
    const propositions = new Map();
    for (const row of rows) {
      const match = String(row.path || '').match(/^(?:xdm\.)?_experience\.decisioning\.propositions\.(\d+)\.(.+)$/);
      if (!match || row.value == null) continue;
      if (!propositions.has(match[1])) propositions.set(match[1], {});
      propositions.get(match[1])[match[2]] = String(row.value).trim();
    }
    return [...propositions.values()].map(fields => ({
      campaignId: fields['scopeDetails.activity.id'] || '',
      campaignName: fields['scopeDetails.activity.name'] || '',
      delivery: fields['scopeDetails.decisionProvider'] === 'AJO' ||
        fields['scopeDetails.decisionProvider'] === 'CJM'
        ? (/^web:\/\//i.test(fields.scope || '') ? 'Code-based experience (CBE)' : '') : '',
    })).filter(value => value.campaignId || value.campaignName || value.delivery);
  }
  function preview(event) {
    const row = (event?.rows || []).find(row => /^(?:xdm\.)?web\.webPageDetails\.URL$/.test(row.path || ''));
    if (!row) return '';
    try {
      const url = new URL(String(row.value));
      if (!url.pathname.endsWith('/tui-decisioning-demo.html')) return '';
      return { email: 'Email', mobile: 'App', web: 'Web' }[url.searchParams.get('channel')] || '';
    } catch {
      return '';
    }
  }
  const api = { details, preview };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TuiDecisioningAttribution = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
