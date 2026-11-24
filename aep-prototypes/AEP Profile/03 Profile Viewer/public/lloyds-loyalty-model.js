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
  const partnerOffers = [
    { key: 'waitrose', brand: 'Waitrose', initials: 'W', title: 'Click the Waitrose offer',
      description: '15% cashback · Online', label: 'View offer', amount: 10,
      sku: 'WAITROSE-OFFER-001', productName: 'Waitrose Offer',
      headline: '15% cashback at Waitrose', detail: 'Explore the Waitrose offer and send a £10 demo purchase for your loaded profile.' },
    { key: 'tkmaxx', brand: 'TK Maxx', initials: 'TK', title: 'Click the TK Maxx offer',
      description: '10% cashback · Online', label: 'View offer', amount: 20,
      sku: 'TKMAXX-OFFER-001', productName: 'TK Maxx Offer',
      headline: '10% cashback at TK Maxx', detail: 'Explore the TK Maxx offer and send a £20 demo purchase for your loaded profile.' },
    { key: 'puregym', brand: 'PureGym', initials: 'PG', title: 'Sign up to PureGym',
      description: 'Create your account', label: 'View offer', amount: 25,
      sku: 'PUREGYM-SIGNUP-001', productName: 'PureGym Signup',
      headline: 'Sign up to PureGym', detail: 'Explore PureGym membership and send a £25 demo signup purchase for your loaded profile.' },
  ];
  function progress(task) {
    const goal = task.variables?.goal, type = String(task.variables?.type || '').toLowerCase();
    const key = /^(qty|quantity|count)$/.test(type) ? 'qty' : /^(spend|amount)$/.test(type) ? 'spend' : /^(day|days)$/.test(type) ? 'days' : null;
    const value = key ? task.accumulators?.[key] : undefined;
    return typeof goal === 'number' && Number.isFinite(goal) && goal > 0 &&
      typeof value === 'number' && Number.isFinite(value) ? { goal, value, key } : null;
  }
  function spendTask(task, definition, defaultCurrency = 'GBP') {
    const variables = { ...definition?.variables, ...task.variables };
    const taskClass = String(task.taskClass || definition?.taskClass || '').trim().toLowerCase();
    const type = String(variables.type || task.taskType || definition?.taskType || '').trim().toLowerCase();
    const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
    const isSpend = taskClass ? taskClass === 'spend' :
      /^(spend|amount)$/.test(type) || (!type || type === 'purchase') && positive(variables.spendMin);
    if (!isSpend) return null;
    const goal = variables.spendMin ?? variables.goal, value = task.accumulators?.spend;
    return {
      goal: positive(goal) ? goal : null,
      value: typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null,
      currency: variables.currencyCode ?? task.currencyCode ?? definition?.currencyCode ?? defaultCurrency,
      variables,
    };
  }
  function spendPurchaseSku(spend, currency = 'GBP', amount = 10) {
    if (!spend || spend.currency !== currency || !spend.goal ||
        spend.variables.singleTrans === true && spend.goal > amount) return null;
    const values = filter => (Array.isArray(filter?.valuesSet) ? filter.valuesSet :
      typeof filter?.values_csv === 'string' ? filter.values_csv.split(',') : [])
      .filter(value => typeof value === 'string').map(value => value.trim()).filter(Boolean);
    const included = spend.variables.include == null ? ['*'] : values(spend.variables.include);
    const excluded = values(spend.variables.exclude);
    if (excluded.some(value => value.includes('*') && value !== '*')) return null;
    const candidates = included.includes('*') ? ['LOYALTY-SPEND-DEMO-10', ...included] : included;
    return candidates.find(sku => typeof sku === 'string' && sku.trim() && !sku.includes('*') &&
      !excluded.includes('*') && !excluded.includes(sku))?.trim() || null;
  }
  function spendPresentation(spend) {
    if (!spend?.goal || spend.value === null) return null;
    const money = amount => new Intl.NumberFormat('en-GB', {
      style: 'currency', currency: spend.currency, maximumFractionDigits: 2, minimumFractionDigits: 0,
    }).format(amount);
    const remaining = Math.max(spend.goal - spend.value, 0);
    const percent = Math.min(spend.value / spend.goal * 100, 100);
    return {
      summary: money(spend.value) + ' spent \u00b7 ' + money(remaining) + ' to go',
      target: percent.toLocaleString('en-GB', { maximumFractionDigits: 1 }) + '% of spend target',
      goalLabel: money(spend.goal), percent,
    };
  }
  function normaliseChallengeResponse(response) {
    if (!response || !Array.isArray(response.challengeList)) {
      throw new Error('Malformed Loyalty state: challengeList is missing. This is not an empty member-state response.');
    }
    const ids = new Set();
    const challengeList = response.challengeList.map(challenge => {
      if (!challenge || typeof challenge !== 'object' || Array.isArray(challenge) ||
          typeof challenge.challenge_id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$/.test(challenge.challenge_id)) {
        throw new Error('Malformed Loyalty state: a challenge has no valid challenge ID.');
      }
      if (ids.has(challenge.challenge_id)) throw new Error('Malformed Loyalty state: duplicate challenge ID ' + challenge.challenge_id + '.');
      ids.add(challenge.challenge_id);
      for (const key of ['name', 'challengeName', 'desc', 'state']) {
        if (challenge[key] != null && typeof challenge[key] !== 'string') throw new Error('Malformed challenge: ' + key + ' must be text.');
      }
      if (challenge.tasks != null && !Array.isArray(challenge.tasks)) throw new Error('Malformed challenge: tasks must be an array.');
      const tasks = (challenge.tasks || []).map(task => {
        if (!task || typeof task !== 'object' || Array.isArray(task)) throw new Error('Malformed task in Loyalty state.');
        for (const key of ['taskId', 'taskName', 'desc', 'taskState', 'taskType', 'taskClass']) {
          if (task[key] != null && typeof task[key] !== 'string') throw new Error('Malformed task: ' + key + ' must be text.');
        }
        for (const key of ['variables', 'accumulators']) {
          if (task[key] != null && (typeof task[key] !== 'object' || Array.isArray(task[key]))) {
            throw new Error('Malformed task: ' + key + ' must be an object.');
          }
        }
        return { ...task };
      });
      const optedIn = typeof challenge.optedIn === 'string' && /^(true|false)$/i.test(challenge.optedIn.trim())
        ? challenge.optedIn.trim().toLowerCase() === 'true' : challenge.optedIn;
      if (optedIn != null && typeof optedIn !== 'boolean') throw new Error('Malformed challenge: optedIn must be a Boolean.');
      return { ...challenge, optedIn, tasks, tasksReported: Array.isArray(challenge.tasks) };
    });
    return { ...response, challengeList };
  }
  function classifyChallenges(challenges) {
    return {
      joinedChallenges: challenges.filter(challenge => challenge.optedIn === true),
      availableChallenges: challenges.filter(challenge => challenge.optedIn === false),
      unknownChallenges: challenges.filter(challenge => typeof challenge.optedIn !== 'boolean'),
    };
  }
  function getChallengeSummary(challenge) {
    return (challenge.tasks || []).map(task => {
      if (typeof task.desc === 'string' && task.desc.trim()) return task.desc.trim();
      const variables = task.variables || {};
      const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0;
      if (positive(variables.spendMin)) {
        const currency = variables.currencyCode || task.currencyCode || challenge.currencyCode;
        return 'Qualifying spend target: ' + variables.spendMin +
          (typeof currency === 'string' && /^[A-Z]{3}$/.test(currency) ? ' ' + currency : '');
      }
      if (positive(variables.qtyMin)) return variables.qtyMin + ' qualifying items';
      if (positive(variables.daysMin)) return variables.daysMin + ' qualifying days';
      if (positive(variables.goal) && typeof variables.type === 'string') {
        return (task.taskName || 'Task') + ' target: ' + variables.goal;
      }
      return typeof task.taskName === 'string' ? task.taskName.trim() : '';
    }).filter(Boolean).join('; ');
  }
  function safeUrl(raw, base) {
    if (typeof raw !== 'string' || !raw.trim()) return '';
    try { const url = new URL(raw, base); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; }
    catch { return ''; }
  }
  function selectCards(propositions, surface) {
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
          if (item.schema === 'https://ns.adobe.com/personalization/message/content-card' ||
              consequence.detail?.schema === 'https://ns.adobe.com/personalization/message/content-card') {
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
          candidates.push({ proposition, item, consequenceId: consequence.id || item.id, content, meta: data.meta || {},
            qualifiedDate: data.qualifiedDate, publishedDate: data.publishedDate,
            rank: rank(data.meta?.rank) === -Infinity ? rank(proposition.scopeDetails.rank) : rank(data.meta.rank) });
        }
      }
    }
    return candidates.sort((left, right) => left.rank === right.rank ? 0 : left.rank > right.rank ? -1 : 1);
  }
  function selectCard(propositions, surface) {
    return selectCards(propositions, surface)[0] || null;
  }
  function selectLifecycleCards(candidates, previous = {}) {
    const id = card => JSON.stringify([card.proposition.id, card.item.id, card.consequenceId]);
    const stage = card => ['launch', 'inProgress', 'completion'].indexOf(card.meta.loyaltyStage ?? card.meta.stage);
    const date = value => {
      if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : -Infinity;
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return -Infinity;
      const parsed = Date.parse(value);
      return Number.isFinite(parsed) ? parsed : -Infinity;
    };
    const seen = new Set((previous.candidates || []).map(id));
    const selected = new Set((previous.cards || []).map(id));
    const groups = new Map(), winners = new Set(), evidence = [];
    for (const card of candidates) {
      const challengeId = typeof card.meta.challengeId === 'string' ? card.meta.challengeId.trim() : '';
      if (!challengeId) { winners.add(card); continue; }
      const group = typeof card.meta.lifecycleGroup === 'string' ? card.meta.lifecycleGroup.trim() : '';
      const key = JSON.stringify([challengeId, group]);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(card);
    }
    for (const [key, cards] of groups) {
      let pool = cards, reason = 'singleCard';
      if (cards.length > 1) {
        if (cards.some(card => stage(card) >= 0)) {
          const latest = Math.max(...cards.map(stage));
          pool = cards.filter(card => stage(card) === latest); reason = 'explicitStage';
        }
        for (const field of ['qualifiedDate', 'publishedDate']) {
          const latest = Math.max(...pool.map(card => date(card[field])));
          if (latest !== -Infinity) {
            pool = pool.filter(card => date(card[field]) === latest);
            if (reason !== 'explicitStage') reason = field;
            if (pool.length === 1) break;
          }
        }
        if (reason === 'singleCard' || pool.length > 1 && reason !== 'explicitStage') {
          const fresh = seen.size ? pool.filter(card => !seen.has(id(card))) : [];
          const retained = pool.filter(card => selected.has(id(card)));
          pool = fresh.length ? fresh : retained.length ? retained : pool;
          reason = fresh.length ? 'observedDelivery' : retained.length ? 'retainedDelivery' : 'adobeRank';
        }
      }
      const winner = pool[0];
      winners.add(winner);
      evidence.push({ key, challengeId: winner.meta.challengeId, candidateCount: cards.length,
        selectedId: id(winner), reason, stage: stage(winner) < 0 ? null : ['launch', 'inProgress', 'completion'][stage(winner)],
        qualifiedDate: winner.qualifiedDate, publishedDate: winner.publishedDate,
        suppressedIds: cards.filter(card => card !== winner).map(id),
        ambiguous: cards.length > 1 && reason === 'adobeRank' });
    }
    return { cards: candidates.filter(card => winners.has(card)), groups: evidence };
  }
  const api = { fields, brand: { profileLabel: 'Loaded Loyalty profile' },
    profileKpis: [['points', 'Profile points'], ['tier', 'Profile tier'], ['score', 'Propensity'], ['nps', 'NPS']],
    progress, spendTask, spendPurchaseSku, spendPresentation, normaliseChallengeResponse, classifyChallenges, getChallengeSummary, safeUrl, selectCard, selectCards, selectLifecycleCards, partnerOffers };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.LloydsLoyalty = api; root.DecisioningDemoModel = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
