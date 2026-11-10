(function (root) {
  'use strict';
  const tenant = '_demoemea';
  const dayMs = 86400000;
  const today = now => Date.parse(new Date(now).toISOString().slice(0, 10) + 'T00:00:00Z');
  function arrivalDate(days, now = Date.now()) {
    if (!Number.isInteger(days)) throw new Error('Days until arrival must be a whole number.');
    return new Date(today(now) + days * dayMs).toISOString().slice(0, 10);
  }
  function arrivalDays(date, now = Date.now()) {
    const timestamp = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(date + 'T00:00:00Z') : NaN;
    if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date) {
      throw new Error('Invalid stored check-in date: ' + date);
    }
    return (timestamp - today(now)) / dayMs;
  }
  const fields = [
    { key: 'booking', label: 'Break stage', path: tenant + '.hotel.customerContext.journeyStage', type: 'string', group: 'Holiday', values: ['Dreaming', 'Booked', 'In-Trip', 'Post-Trip'] },
    { key: 'days', label: 'Days until arrival (UTC)', path: tenant + '.hotel.bookingDetails.checkInDate', type: 'number', schemaType: 'string', format: 'date', fromProfile: arrivalDays, toProfile: arrivalDate, group: 'Holiday', min: 0, max: 365 },
    { key: 'ready', label: 'Lodge ready', path: tenant + '.hotel.checkIn.roomReady', type: 'boolean', group: 'Holiday' },
    { key: 'case', label: 'Complaint status', path: tenant + '.complaint.status', type: 'string', group: 'Support', values: ['None', 'Open', 'Pending', 'Escalated'] },
    { key: 'service', label: 'Lodge service requested', path: tenant + '.hotel.housekeeping.serviceRequested', type: 'boolean', group: 'Support' },
    { key: 'intent', label: 'Short-break intent', path: tenant + '.hotel.customerContext.shoppingIntent', type: 'string', group: 'Shopping', values: ['None', 'Low', 'Medium', 'High'] },
    { key: 'abandoned', label: 'Abandoned break search', path: tenant + '.hotel.customerContext.abandonedSearchFlag', type: 'boolean', group: 'Shopping' },
    { key: 'room', label: 'Accommodation preference', path: tenant + '.individualCharacteristics.travel.preferences.hotel.accommodationType', type: 'string', group: 'Preferences', values: ['Woodland Lodge', 'Executive Lodge', 'Treehouse'] },
    { key: 'score', label: 'Experience fit (demo score)', path: tenant + '.scoring.core.propensityScore', type: 'number', group: 'Preferences', min: 0, max: 5, step: 'any' },
    { key: 'engagement', label: 'Guest engagement', path: tenant + '.hotel.customerContext.engagementStatus', type: 'string', group: 'Preferences', values: ['New', 'Active', 'Lapsing', 'Dormant', 'Re-engaged'] },
    { key: 'points', label: 'Existing loyalty points', path: tenant + '.loyaltyDetails.points', type: 'number', group: 'Preferences', min: 0, max: 100000, step: 'any' },
    { key: 'app', label: 'Mobile app user', path: tenant + '.hotel.customerContext.mobileAppUser', type: 'boolean', group: 'Preferences' },
    { key: 'emailConsent', label: 'Email consent', path: 'consents.marketing.email.val', type: 'string', group: 'Consent', values: ['y', 'n', 'u'] },
    { key: 'personalize', label: 'Personalisation consent', path: 'consents.personalize.content.val', type: 'string', group: 'Consent', values: ['y', 'n', 'u'] },
  ];
  const byKey = Object.fromEntries(fields.map(field => [field.key, field]));
  const c = (key, op, value) => ({ path: byKey[key].path, op, value, ...(key === 'days' ? { dateWindow: true } : {}) });
  const eq = (key, value) => c(key, 'eq', value);
  const all = (...conditions) => ({ operator: 'and', conditions });
  const any = (...conditions) => ({ operator: 'or', conditions });
  const not = rule => ({ ...rule, exclude: true });
  function item(key, name, title, description, cta, image, rule) {
    return { key, name: 'CP - ' + name, image: 'cp-decisioning-assets/' + image + (['activities', 'dining'].includes(image) ? '.jpg' : '.webp'),
      imageAlt: { forest: 'Lodges nestled in the forest', lodge: 'Woodland Lodge in the forest',
        spa: 'Aqua Sana Forest Spa', pool: 'Subtropical Swimming Paradise',
        activities: 'Archery activity', dining: "Dishes from Huck's menu", treehouse: 'Treehouse in the forest' }[image],
      content: { title, briefMessage: description, compactTitle: title, compactSubtitle: 'Your forest moment',
        compactDescription: description, fullSubtitle: 'A short break, selected for you', fullDescription: description,
        fullCTA: cta, agentScript: description + ' Check availability, prices and terms with Center Parcs.' },
      ...(rule ? { rule } : {}) };
  }
  const objectives = [
    { key: 'protect', label: 'Protect / Recover', subtitle: 'Guest care before promotion',
      rule: any(eq('case', 'Escalated'), eq('service', true), eq('case', 'Pending')), offers: [
        item('guest-care', 'Guest care', 'Let us take care of your break', 'Find guest support while your query is being reviewed. Promotional suggestions take a back seat.', 'Find guest support', 'forest', all(eq('case', 'Escalated'))),
        item('lodge-care', 'Lodge care', 'A little help with your lodge', 'Find the village guest services information for your lodge request.', 'View guest services', 'lodge', all(eq('service', true))),
        item('support-guide', 'Support guide', 'Your family break comes first', 'Keep useful support information close at hand during your forest break.', 'View help information', 'forest'),
      ] },
    { key: 'stay', label: 'Enjoy the forest', subtitle: 'Make the most of time together',
      rule: all(eq('booking', 'In-Trip')), offers: [
        item('family-activities', 'Family activities', 'Make a new family memory', 'Explore activities for your forest break. Ages, booking requirements and availability vary.', 'Explore activities', 'activities', all(c('score', 'gte', 3))),
        item('dine-together', 'Dine together', 'Bring everyone to the table', "Discover restaurants including Huck's, and find dining options for your village.", 'Explore dining', 'dining', all(c('score', 'gte', 2), c('score', 'lt', 3))),
        item('swim-together', 'Swimming Paradise', 'A splash of family time', 'Discover the Subtropical Swimming Paradise and check village information before visiting.', 'Explore swimming', 'pool'),
      ] },
    { key: 'prepare', label: 'Get ready to arrive', subtitle: 'Useful essentials before the break',
      rule: all(eq('booking', 'Booked'), c('days', 'lte', 14)), offers: [
        item('arrival-guide', 'Arrival guide', 'Your forest break is nearly here', 'Review arrival guidance and your booking details before travelling. This demo does not confirm lodge access times.', 'Plan your arrival', 'lodge', all(c('days', 'lte', 1))),
        item('lodge-information', 'Lodge information', 'Know your home in the forest', 'Review accommodation information while preparing for your Woodland Lodge stay.', 'Explore your lodge', 'lodge', all(eq('room', 'Woodland Lodge'))),
        item('activity-planning', 'Activity planning', 'A little planning, more togetherness', 'Explore activity choices ahead of your stay. This preview does not book or reserve an activity.', 'Plan activities', 'activities'),
      ] },
    { key: 'posttrip', label: 'Welcome home', subtitle: 'Care and inspiration after the break',
      rule: all(eq('booking', 'Post-Trip')), offers: [
        item('stay-followup', 'Stay follow-up', 'Here to help after your stay', 'Find support for an outstanding question about your recent forest break.', 'Find help', 'forest', all(eq('case', 'Open'))),
        item('return-forest', 'Return to the forest', 'Make room for another memory', 'Explore future short breaks for your family. Dates, prices and accommodation remain subject to availability.', 'Explore another break', 'forest', all(eq('engagement', 'Active'))),
        item('forest-gift', 'Gift cards', 'Give them time together', 'Explore Center Parcs gift card information and check the current purchase and redemption terms.', 'Explore gift cards', 'lodge'),
      ] },
    { key: 'convert', label: 'Find your short break', subtitle: 'Turn inspiration into time together',
      rule: any(eq('intent', 'High'), eq('abandoned', true)), offers: [
        item('resume-search', 'Resume break search', 'Your forest escape is waiting to be explored', 'Return to short-break search and explore dates and lodges again. No price or availability is held by this demo.', 'Search short breaks', 'forest', all(eq('abandoned', true))),
        item('treehouse-search', 'Treehouse inspiration', 'A special stay among the trees', 'Discover Treehouse accommodation for a distinctive forest break. Village availability varies.', 'Explore Treehouses', 'treehouse', all(eq('room', 'Treehouse'))),
        item('woodland-search', 'Woodland breaks', 'Your home in the heart of the forest', 'Explore Woodland Lodges and find a short break that suits your family.', 'Explore Woodland Lodges', 'lodge'),
      ] },
    { key: 'grow', label: 'Make it extra special', subtitle: 'Relevant extras for a booked break',
      rule: all(eq('booking', 'Booked'), c('days', 'lte', 365), not(all(c('days', 'lte', 14)))), offers: [
        item('forest-spa', 'Forest Spa', 'Take a moment just for you', 'Explore Aqua Sana Forest Spa experiences. Eligibility, ages, prices and booking availability must be checked separately.', 'Explore Forest Spa', 'spa', all(c('score', 'gte', 3))),
        item('adventure-planning', 'Adventure planning', 'Add a little adventure', 'Browse activities for your family and plan ahead for your village stay.', 'Explore adventures', 'activities', all(c('score', 'gte', 2), c('score', 'lt', 3))),
        item('restaurant-planning', 'Restaurant planning', 'Plan a meal worth sharing', 'Discover restaurant options for your break and review village booking information.', 'Explore restaurants', 'dining', all(c('score', 'lt', 2))),
      ] },
    { key: 'engage', label: 'Stay inspired', subtitle: 'A forest break starts with an idea',
      rule: all(eq('booking', 'Dreaming'), eq('intent', 'None')), offers: [
        item('forest-inspiration', 'Forest inspiration', 'Less everyday. More together.', 'Discover short breaks in the forest, with lodges, activities and time to reconnect.', 'Discover short breaks', 'forest', any(eq('engagement', 'New'), eq('engagement', 'Active'))),
        item('digital-planning', 'Digital planning', 'Your forest plans, close at hand', 'Explore digital planning information for your next break. No app installation or account change is performed.', 'Explore planning tools', 'lodge', all(eq('app', false))),
        item('reconnect', 'Reconnect', 'Find your way back to the forest', 'Explore inspiration for a future family break. This is a demo suggestion, not a loyalty reward or member benefit.', 'Explore the forest', 'forest'),
      ] },
  ];
  objectives.forEach((o, i) => o.offers.forEach((offer, j) => { offer.priority = (7 - i) * 100 + 30 - j * 10; }));
  const defaults = { booking: 'Dreaming', days: 30, ready: false, case: 'None', service: false,
    intent: 'None', abandoned: false, room: 'Woodland Lodge', score: 1, engagement: 'Active',
    points: 0, app: true, emailConsent: 'y', personalize: 'y' };
  const examples = [
    ['Guest care first', { case: 'Escalated', intent: 'High' }, 'protect', 'guest-care'],
    ['Family activity moment', { booking: 'In-Trip', score: 3 }, 'stay', 'family-activities'],
    ['Arriving tomorrow', { booking: 'Booked', days: 1 }, 'prepare', 'arrival-guide'],
    ['Welcome home', { booking: 'Post-Trip' }, 'posttrip', 'return-forest'],
    ['Return to break search', { abandoned: true }, 'convert', 'resume-search'],
    ['A Forest Spa moment', { booking: 'Booked', days: 30, score: 3 }, 'grow', 'forest-spa'],
    ['Forest inspiration', {}, 'engage', 'forest-inspiration'],
  ];
  const scenarios = examples.map(([name, preset, expectedObjective, expectedOffer]) => ({
    name, preset, expectedObjective, expectedOffer,
  }));
  const demoScenarios = scenarios.map((s, i) => {
    const objective = objectives[i], offer = objective.offers.find(item => item.key === s.expectedOffer);
    const paths = [...objective.rule.conditions, ...(offer.rule?.conditions || [])].map(condition => condition.path);
    return { ...s, rank: i + 1, preset: { ...defaults, ...s.preset },
      signalKeys: [...new Set([...Object.keys(s.preset), ...fields.filter(f => paths.includes(f.path)).map(f => f.key)])] };
  }).reverse();
  const attributes = state => Object.fromEntries(fields.map(field =>
    [field.path, state[field.key] === undefined || state[field.key] === null ? state[field.key] :
      field.toProfile ? field.toProfile(state[field.key]) : state[field.key]]));
  function eligible(rule, state) {
    const attrs = Object.fromEntries(fields.map(field => [field.path, state[field.key]]));
    const tests = rule.conditions.map(condition => {
      if (condition.conditions) return eligible(condition, state);
      const actual = attrs[condition.path], wanted = condition.value;
      if (actual === undefined || actual === null) return false;
      if (condition.dateWindow) return Number.isInteger(actual) && actual >= 0 && actual <= wanted;
      const normal = value => typeof value === 'string' ? value.toLowerCase() : value;
      switch (condition.op) {
        case 'eq': return normal(actual) === normal(wanted);
        case 'gte': return actual >= wanted;
        case 'gt': return actual > wanted;
        case 'lt': return actual < wanted;
        case 'lte': return actual <= wanted;
        default: throw new Error('Unsupported CP comparison: ' + condition.op);
      }
    });
    const result = rule.operator === 'and' ? tests.every(Boolean) : tests.some(Boolean);
    return rule.exclude ? !result : result;
  }
  function evaluate(state) {
    const consent = state.emailConsent === 'y' && state.personalize === 'y';
    const ladder = objectives.map(o => ({ key: o.key, eligible: consent && eligible(o.rule, state),
      offers: o.offers.map(item => ({ key: item.key, priority: item.priority,
        eligible: consent && eligible(o.rule, state) && (!item.rule || eligible(item.rule, state)) })) }));
    for (const row of ladder) {
      const offer = row.offers.filter(item => item.eligible).sort((a, b) => b.priority - a.priority)[0];
      if (offer) return { objective: row.key, offer: offer.key, ladder, reason: 'Simulated eligibility / static priority. Not an AJO response.' };
    }
    return { objective: null, offer: null, ladder, reason: 'No simulated content: explicit consent and matching signals are required.' };
  }
  function describe(rule) {
    const ops = { eq: 'is', gt: '>', gte: '>=', lt: '<', lte: '<=' };
    const text = rule.conditions.map(c => c.conditions ? '(' + describe(c) + ')' :
      fields.find(field => field.path === c.path).label + (c.dateWindow ? ' within the next ' + c.value + ' days' : ' ' + ops[c.op] + ' ' + c.value))
      .join(rule.operator === 'and' ? ' AND ' : ' OR ');
    return rule.exclude ? 'NOT (' + text + ')' : text;
  }
  function rulePayload(name, rule) {
    const ops = { eq: 'equals', gt: '>', gte: '>=', lt: '<', lte: '<=' };
    function pql(rule) {
      const value = rule.conditions.map(c => {
      if (c.conditions) return '(' + pql(c) + ')';
      if (c.dateWindow) return '(' + c.path + ' occurs <= ' + c.value + ' days after today)';
      if (c.op !== 'eq') return '(' + c.path + ' ' + ops[c.op] + ' ' + JSON.stringify(c.value) + ')';
      return typeof c.value === 'string' ? '(' + c.path + '.equals(' + JSON.stringify(c.value) + ', false))'
        : '(' + c.path + ' = ' + JSON.stringify(c.value) + ')';
      }).join(' ' + rule.operator + ' ');
      return rule.exclude ? 'not (' + value + ')' : value;
    }
    function container(rule) {
      return { exclude: !!rule.exclude, isCollapsed: false, logicalOperator: rule.operator,
        itemType: 'segmentContainer', items: rule.conditions.map(c => {
          if (c.conditions) return container(c);
          const item = { comparisonType: ops[c.op], component: { id: 'profile.' + c.path, __entity__: true, type: 'bx' },
            isCaseSensitive: false, isPlaceholder: false, originalLocation: [], itemType: 'segmentRule' };
          if (!c.dateWindow) return { ...item, value: c.op === 'eq' ? [c.value] : c.value };
          const restriction = { type: 'rollingRangeConstraintRestriction', unit: 'days',
            itemType: 'rollingRangeConstraintRestriction', quantity: c.value };
          return { ...item, comparisonType: 'rolling-range-future', component: { ...item.component, type: 'rE' },
            temporalConstraint: { end: { ...restriction }, type: 'rolling-range-future', start: { ...restriction },
              subType: 'rolling-range-future-constraint', itemType: 'rolling-range', showEndFields: false,
              referencedDirection: 'after' } };
        }) };
    }
    const value = pql(rule);
    return { name, exdRule: true, type: 'DECISION_ITEM', condition: { type: 'PQL', format: 'pql/text', value },
      segmentModel: { lifecycleState: 'published', name, namespace: 'ups', isMissingAnsibleModel: false,
        relationalExpression: false, deprecated: { status: false, reason: '' }, description: '',
        evaluationInfo: { batch: { enabled: true }, continuous: { enabled: false }, synchronous: { enabled: false } },
        payloadInfo: { schemaPath: '' }, labels: [], tags: [], canHaveFolder: true,
        expression: { isValid: true, logicalOperator: rule.operator, itemType: 'segmentDefinition',
          profileAttributesContainer: container(rule),
          xEventAttributesContainer: { exclude: false, isCollapsed: false, items: [],
            logicalOperator: 'then', itemType: 'eventTypeCardContainer' } } } };
  }
  function catalogPlan(evidence) {
    if (!evidence || evidence.sandbox !== 'kirkham' || !evidence.verifiedAt ||
      fields.some(f => !evidence.fields.some(leaf => leaf.path === f.path &&
        (leaf.type === (f.schemaType || f.type) || f.type === 'number' && !f.schemaType && leaf.type === 'integer')))) {
      throw new Error('All CP controls require live kirkham profile-schema verification before exporting the catalog plan.');
    }
    return { version: 1, customer: 'CP', sandbox: 'kirkham', status: 'preview-only', evidence,
      approvalRequired: true, assetsCreated: false, activationAllowed: false,
      ruleEditorReference: ['dps:eligibility-rule:1d4c6e5be446184a', 'dps:eligibility-rule:1d4c6e6e9246184c',
        'dps:eligibility-rule:1d4c6ea010861852', '588ec48d-766f-4774-8b02-d51931e8d5b6'],
      unresolved: ['Confirm offer-level versus strategy-level rule attachments before any apply.',
        'Resolve new CP tag/collection/rule IDs after individually confirmed creation.',
        'Host approved media; review policy order and consent gate; no activation in this task.',
        'Arrival windows use checkInDate and UTC calendar days; grow is limited to the next 365 days.',
        'Verify the date editor preserves the today anchor before creating any live rules.',
        'Generic experience-fit score and loyalty points remain explicitly labelled demo/informational signals.'],
      consentGate: rulePayload('CP - Consent gate', all(eq('emailConsent', 'y'), eq('personalize', 'y'))),
      objectives: objectives.map((o, i) => ({ key: o.key, rank: i + 1, policyOrder: i + 1,
        tag: { name: 'CP - ' + o.label },
        collection: { name: 'CP - ' + o.label + ' collection', tagNames: ['CP - ' + o.label],
          constraints: [{ itemCatalogId: 'xcore:decision-catalog:18c6b876319b00e4',
            constraint: "SELECT * FROM offer_items WHERE (_experience.decisioning.decisionitem.itemTags IN ('{{CP_TAG_ID:" + o.key + "}}'))",
            uiModel: JSON.stringify({ operator: 'in', value: { left: '_experience.decisioning.decisionitem.itemTags',
              right: ['{{CP_TAG_ID:' + o.key + '}}'], meta: { left: { title: 'Tags', source: 'decisionItems', type: 'tag',
                property: { title: 'Tags', type: 'array', hasUUID: true, description: 'A set of tags to categorize an offer item' } } } } }) }],
          resolveTagIdsBeforeApply: true },
        strategy: { name: 'CP - ' + o.label + ' strategy', priority: i + 1, ranking: 'static item priority',
          collectionName: 'CP - ' + o.label + ' collection',
          rank: { priority: i + 1, order: { orderEvaluationType: 'static' } },
          optionSelection: { filter: '{{CP_COLLECTION_ID:' + o.key + '}}', filterName: 'CP - ' + o.label + ' collection' },
          profileConstraint: { profileConstraintType: 'none' }, attachmentScopeRequiresConfirmation: true },
        eligibility: rulePayload('CP - ' + o.label + ' eligibility', o.rule),
        offers: o.offers.map(item => ({ ...item, status: 'draft', tagNames: ['CP - ' + o.label],
          ...(item.rule ? { eligibility: rulePayload(item.name + ' eligibility', item.rule) } : {}) })) })),
      scenarios: demoScenarios.map(s => ({ ...s, attributes: attributes(s.preset) })) };
  }
  const model = { fields, objectives, defaults, scenarios, demoScenarios, evaluate, attributes, describe, rulePayload, catalogPlan, arrivalDate, arrivalDays,
    brand: { name: 'Center Parcs', prefix: 'cpDecisioning', frameId: 'cp-visualiser',
      viewName: 'CP Decisioning', moment: 'forest moment', eyebrow: 'LESS EVERYDAY. MORE TOGETHER.',
      fullWidthWeb: true, showSimulation: true, requiredSandbox: 'kirkham', confirmProfileChanges: true,
      catalogBoundary: 'Live results come from the configured AJO campaign/policy. Catalog activation is managed separately.' } };
  if (typeof module !== 'undefined' && module.exports) module.exports = model;
  else root.DecisioningDemoModel = model;
})(typeof globalThis !== 'undefined' ? globalThis : this);
