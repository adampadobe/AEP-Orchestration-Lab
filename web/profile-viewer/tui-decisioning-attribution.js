(function (root) {
  'use strict';
  function kind(event) {
    const type = String(event?.eventType || event?.eventName || '').trim().toLowerCase();
    const explicit = { 'decisioning.propositiondisplay': 'display', 'decisioning.propositioninteract': 'interact',
      'decisioning.propositionsend': 'send', 'decisioning.propositiondismiss': 'dismiss' }[type];
    if (explicit) return explicit;
    if (event?.eventType) return '';
    const flags = (Array.isArray(event?.rows) ? event.rows : []).filter(row =>
      /^(?:xdm\.)?_experience\.decisioning\.propositionEventType\.(send|display|interact|dismiss)$/.test(row.path || '') &&
      Number(row.value) === 1);
    return flags.length === 1 ? flags[0].path.split('.').pop() : '';
  }
  function items(event) {
    if (!['display', 'send', 'interact'].includes(kind(event))) return [];
    const result = new Map();
    const fields = {
      id: 'offerId', name: 'offer',
      'itemSelection.selectionDetail.strategyID': 'strategyId',
      'itemSelection.selectionDetail.strategyId': 'strategyId',
      'itemSelection.selectionDetail.strategyName': 'strategy',
      'characteristics.displayedOfferId': 'displayedOfferId',
      'characteristics.displayedOfferName': 'displayedOfferName',
    };
    for (const row of Array.isArray(event?.rows) ? event.rows : []) {
      const match = String(row.path || '').match(/^(?:xdm\.)?_experience\.decisioning\.propositions?\.(\d+)\.items\.(\d+)\.(.+)$/);
      if (!match || !fields[match[3]] || row.value == null || !String(row.value).trim()) continue;
      const key = match[1] + ':' + match[2];
      if (!result.has(key)) result.set(key, { proposition: Number(match[1]), item: Number(match[2]) });
      result.get(key)[fields[match[3]]] = String(row.value).trim();
    }
    const all = [...result.values()].sort((a, b) => a.proposition - b.proposition || a.item - b.item);
    for (const item of all) {
      if (item.displayedOfferId) {
        if (item.displayedOfferId !== item.offerId) { delete item.strategy; delete item.strategyId; }
        item.wrapperItemId = item.offerId; item.offerId = item.displayedOfferId;
        if (item.displayedOfferName) item.offer = item.displayedOfferName;
        delete item.displayedOfferId; delete item.displayedOfferName;
      }
      if (item.offer === item.offerId) delete item.offer;
      if (item.strategy === item.strategyId) delete item.strategy;
    }
    const isSelected = item => Boolean(item.strategy || item.strategyId || /^dps:/.test(item.offerId || ''));
    const selectedPropositions = new Set(all.filter(isSelected).map(item => item.proposition));
    // CBE also returns a content-wrapper item. It is not the selected catalog offer.
    return all.filter(item => selectedPropositions.has(item.proposition) ? isSelected(item) : Boolean(item.offer));
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
  function loyalty(event) {
    const fields = {};
    for (const row of Array.isArray(event?.rows) ? event.rows : []) {
      const match = String(row.path || '').match(/^(?:xdm\.)?_experience\.ajo\.loyalty\.challenge\.(id|name|metadata\.[A-Za-z][A-Za-z0-9]*)$/);
      if (match && typeof row.value === 'string' && row.value.trim()) fields[match[1]] = row.value.trim();
    }
    if (!fields.id) return null;
    return { id: fields.id, name: fields.name || '',
      metadata: Object.fromEntries(Object.entries(fields).filter(([key]) => key.startsWith('metadata.'))
        .map(([key, value]) => [key.slice(9), value])) };
  }
  const api = { details, preview, items, loyalty, kind };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TuiDecisioningAttribution = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
