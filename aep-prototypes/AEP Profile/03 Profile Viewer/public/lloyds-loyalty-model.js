(function (root) {
  'use strict';
  const fields = [
    { key: 'loyaltyId', label: 'Loyalty ID', path: 'identification.core.loyaltyId', type: 'string', group: 'Loyalty' },
    { key: 'points', label: 'Profile loyalty points', path: 'loyaltyDetails.points', type: 'number', group: 'Loyalty' },
    { key: 'tier', label: 'Profile loyalty tier', path: 'loyaltyDetails.level', type: 'string', group: 'Loyalty' },
    { key: 'score', label: 'Propensity', path: 'scoring.core.propensityScore', type: 'number', group: 'Signals' },
    { key: 'nps', label: 'NPS', path: 'scoring.npsScore', type: 'number', group: 'Signals' },
    { key: 'emailConsent', label: 'Email consent', path: 'consents.marketing.email.val', type: 'string', group: 'Consent' },
    { key: 'personalize', label: 'Personalisation consent', path: 'consents.personalize.content.val', type: 'string', group: 'Consent' },
  ];
  function progress(task) {
    const goal = task.variables?.goal, type = String(task.variables?.type || '').toLowerCase();
    const key = /^(qty|quantity|count)$/.test(type) ? 'qty' : /^(spend|amount)$/.test(type) ? 'spend' : /^(day|days)$/.test(type) ? 'days' : null;
    const value = key ? task.accumulators?.[key] : undefined;
    return typeof goal === 'number' && Number.isFinite(goal) && goal > 0 &&
      typeof value === 'number' && Number.isFinite(value) ? { goal, value, key } : null;
  }
  function safeUrl(raw, base) {
    if (typeof raw !== 'string' || !raw.trim()) return '';
    try { const url = new URL(raw, base); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; }
    catch { return ''; }
  }
  function selectCard(propositions, surface) {
    const candidates = [];
    const rank = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : -Infinity;
    for (const proposition of propositions || []) {
      if (proposition.scope !== surface || !proposition.id || !proposition.scopeDetails) continue;
      for (const item of proposition.items || []) {
        if (/default-content-item$/.test(item.schema || '')) continue;
        const values = (item.data?.rules || []).flatMap(rule => rule.consequences || []);
        if (item.data?.content !== undefined) values.push({ id: item.id, detail: { data: item.data } });
        for (const consequence of values) {
          const data = consequence.detail?.data;
          if (!data || data.contentType && data.contentType !== 'application/json') continue;
          let content = data.content;
          if (typeof content === 'string') {
            try { content = JSON.parse(content); } catch { continue; }
          }
          if (!content || typeof content !== 'object' || Array.isArray(content)) continue;
          if (item.schema === 'https://ns.adobe.com/personalization/message/content-card') {
            content = { ...content,
              title: typeof content.title === 'string' ? { content: content.title } : content.title,
              body: typeof content.body === 'string' ? { content: content.body } : content.body,
              image: content.image || (content.imageUrl ? { url: content.imageUrl } : undefined),
              buttons: content.buttons || (content.actionUrl ? [{
                actionUrl: content.actionUrl, text: { content: data.meta?.buttonLabel || 'View reward' },
              }] : []),
            };
          }
          if (!['title', 'body'].some(key => typeof content[key]?.content === 'string' && content[key].content.trim()) &&
              !safeUrl(content.image?.url, 'https://example.invalid/')) continue;
          candidates.push({ proposition, item, consequenceId: consequence.id || item.id, content,
            rank: rank(data.meta?.rank) === -Infinity ? rank(proposition.scopeDetails.rank) : rank(data.meta.rank) });
        }
      }
    }
    return candidates.reduce((best, value) => !best || value.rank > best.rank ? value : best, null);
  }
  const api = { fields, brand: { profileLabel: 'Loaded Loyalty profile' },
    profileKpis: [['points', 'Profile points'], ['tier', 'Profile tier'], ['score', 'Propensity'], ['nps', 'NPS']],
    progress, safeUrl, selectCard };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.LloydsLoyalty = api; root.DecisioningDemoModel = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
