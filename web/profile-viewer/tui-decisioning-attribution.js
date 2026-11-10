(function (root) {
  'use strict';
  function items(event) {
    if (String(event?.eventType || event?.eventName || '').trim().toLowerCase() !== 'decisioning.propositiondisplay') return [];
    const result = new Map();
    const fields = {
      id: 'offerId', name: 'offer',
      'itemSelection.selectionDetail.strategyID': 'strategyId',
      'itemSelection.selectionDetail.strategyId': 'strategyId',
      'itemSelection.selectionDetail.strategyName': 'strategy',
    };
    for (const row of Array.isArray(event?.rows) ? event.rows : []) {
      const match = String(row.path || '').match(/^(?:xdm\.)?_experience\.decisioning\.propositions?\.(\d+)\.items\.(\d+)\.(.+)$/);
      if (!match || !fields[match[3]] || row.value == null || !String(row.value).trim()) continue;
      const key = match[1] + ':' + match[2];
      if (!result.has(key)) result.set(key, { proposition: Number(match[1]), item: Number(match[2]) });
      result.get(key)[fields[match[3]]] = String(row.value).trim();
    }
    return [...result.values()].sort((a, b) => a.proposition - b.proposition || a.item - b.item);
  }
  function details(event) {
    const rows = Array.isArray(event?.rows) ? event.rows : [];
    const propositions = new Map();
    for (const row of rows) {
      const match = String(row.path || '').match(/^(?:xdm\.)?_experience\.decisioning\.propositions?\.(\d+)\.(.+)$/);
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
      if (!/\/(?:tui|cp)-decisioning-demo\.html$/.test(url.pathname)) return '';
      return { email: 'Email', mobile: 'App', web: 'Web' }[url.searchParams.get('channel')] || '';
    } catch {
      return '';
    }
  }
  const api = { details, preview, items };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TuiDecisioningAttribution = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
