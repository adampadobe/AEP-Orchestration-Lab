(function (root) {
  'use strict';
  const tenant = '_demoemea';
  const flight = tenant + '.travelReservations.flightReservations.';
  const airline = tenant + '.airlineCustomer.';
  const fields = [
    { key: 'booking', label: 'Holiday stage', path: airline + 'journeyStage', type: 'string', group: 'Holiday', values: ['Dreaming', 'Booked', 'In-Trip', 'Post-Trip'] },
    { key: 'days', label: 'Days until departure', path: flight + 'daysUntilDeparture', type: 'number', group: 'Holiday', min: 0, max: 365 },
    { key: 'documents', label: 'Travel documents', path: airline + 'documentsStatus', type: 'string', group: 'Holiday', values: ['Complete', 'Incomplete', 'Missing', 'Expiring'] },
    { key: 'disruption', label: 'Journey disruption', path: flight + 'flightDisruption.disruptionType', type: 'string', group: 'Support', values: ['none', 'delay', 'cancelled', 'baggage'] },
    { key: 'case', label: 'Service case', path: airline + 'caseStatus', type: 'string', group: 'Support', values: ['None', 'Open', 'Pending', 'Escalated'] },
    { key: 'intent', label: 'Holiday shopping intent', path: airline + 'shoppingIntent', type: 'string', group: 'Shopping', values: ['None', 'Low', 'Medium', 'High'] },
    { key: 'abandoned', label: 'Abandoned search', path: airline + 'abandonedSearchFlag', type: 'boolean', group: 'Shopping' },
    { key: 'availability', label: 'Searched fare availability', path: airline + 'fareAvailability', type: 'string', group: 'Shopping', values: ['Available', 'Limited', 'Sold Out'] },
    { key: 'score', label: 'Ancillary fit (demo score)', path: tenant + '.scoring.core.propensityScore', type: 'number', group: 'Preferences', min: 0, max: 5, step: 'any' },
    { key: 'engagement', label: 'Customer engagement', path: airline + 'engagementStatus', type: 'string', group: 'Preferences', values: ['New', 'Active', 'Lapsing', 'Dormant', 'Re-engaged'] },
    { key: 'points', label: 'Illustrative loyalty points', path: tenant + '.loyaltyDetails.points', type: 'number', group: 'Preferences', min: 0, max: 100000, step: 'any' },
    { key: 'app', label: 'Mobile app user', path: airline + 'mobileAppUser', type: 'boolean', group: 'Preferences' },
    { key: 'emailConsent', label: 'Email marketing consent', path: 'consents.marketing.email.val', type: 'string', group: 'Consent', values: ['y', 'n', 'u'] },
    { key: 'personalize', label: 'Content personalisation', path: 'consents.personalize.content.val', type: 'string', group: 'Consent', values: ['y', 'n', 'u'] },
  ];
  const byKey = Object.fromEntries(fields.map(f => [f.key, f]));
  const condition = (key, op, value) => ({ path: byKey[key].path, op, value });
  const eq = (key, value) => condition(key, 'eq', value);
  const rule = (...conditions) => ({ operator: 'and', conditions });
  const any = (...conditions) => ({ operator: 'or', conditions });
  const assets = 'tui-decisioning-assets/';
  function offer(key, name, title, description, cta, image, targeting) {
    return { key, name, content: {
      title, briefMessage: description, compactTitle: title,
      compactSubtitle: 'Your next holiday moment', compactDescription: description,
      fullSubtitle: 'A little inspiration, selected for you',
      fullDescription: description, fullCTA: cta,
      agentScript: 'Demo suggestion only: ' + description + ' Confirm current availability and terms with TUI.',
    }, image: assets + image, imageAlt: image === 'crete.jpg' ? 'Turquoise water and coastline in Crete' :
      image === 'gran-canaria.jpg' ? 'Beach and coastal scenery in Gran Canaria' : 'Holiday photography from the supplied TUI website',
    ...(targeting ? { rule: targeting } : {}) };
  }
  const objectives = [
    { key: 'protect', label: 'Protect / Recover', subtitle: 'Service before selling', source: 'Travel information / Help Centre / Manage My Booking',
      rule: any(eq('disruption', 'cancelled'), eq('case', 'Escalated')), offers: [
        offer('booking-help', 'Manage My Booking support', 'Your booking comes first', 'Open Manage My Booking to review your holiday details and available next steps.', 'Manage My Booking', 'gran-canaria.jpg', rule(eq('disruption', 'cancelled'), eq('case', 'None'))),
        offer('help-centre', 'Help Centre guidance', 'A helping hand for your holiday', 'Find the Help Centre and travel information in one place while your service case is being reviewed.', 'Explore the Help Centre', 'crete.jpg', rule(eq('case', 'Escalated'))),
        offer('service-only', 'Service-first communications', 'Let us focus on your holiday', 'This demonstration pauses promotional suggestions while a cancellation or escalated case needs attention.', 'View travel information', 'mexico.jpg'),
      ] },
    { key: 'travel', label: 'Enjoy the holiday', subtitle: 'Useful help while away', source: '24/7 support while away / Arrivals and Departures / Lost or delayed luggage',
      rule: rule(eq('booking', 'In-Trip')), offers: [
        offer('flight-update', 'Arrivals and departures', 'Keep your journey in view', 'Find arrivals and departures information before continuing your holiday.', 'View flight information', 'gran-canaria.jpg', rule(eq('disruption', 'delay'))),
        offer('baggage-help', 'Lost or delayed luggage', 'Help with your luggage', 'Find guidance for lost or delayed luggage through TUI travel information.', 'Find luggage guidance', 'crete.jpg', rule(eq('disruption', 'baggage'))),
        offer('in-resort', 'In-resort support', 'A helping hand while you are away', 'Explore the support information available for your holiday with TUI.', 'View holiday support', 'mexico.jpg'),
      ] },
    { key: 'prepare', label: 'Get ready to go', subtitle: 'The essentials before departure', source: 'Flight check-in / Travel information / Select your seats',
      rule: rule(eq('booking', 'Booked'), condition('days', 'lte', 14)), offers: [
        offer('checkin', 'Flight check-in', 'Your holiday is getting closer', 'Find flight check-in information and review the details for your upcoming trip. Check-in availability depends on your booking.', 'View check-in information', 'gran-canaria.jpg', rule(condition('days', 'lte', 1))),
        offer('documents', 'Travel document guidance', 'A little preparation goes a long way', 'Review the travel information for your destination and check the documents required for your journey.', 'Explore travel information', 'crete.jpg', rule(condition('documents', 'in', ['Incomplete', 'Missing', 'Expiring']))),
        offer('seats', 'Select your seats', 'Make your journey your own', 'Visit Manage My Booking to explore seat options for your flight. Availability and charges may apply.', 'Explore seat options', 'mexico.jpg'),
      ] },
    { key: 'posttrip', label: 'Welcome home', subtitle: 'Close the loop on the trip', source: 'Help Centre / Lost or delayed luggage / Holiday inspiration',
      rule: rule(eq('booking', 'Post-Trip')), offers: [
        offer('luggage-followup', 'Luggage follow-up', 'Still looking for luggage guidance?', 'Find TUI information about lost or delayed luggage following your journey.', 'View luggage guidance', 'gran-canaria.jpg', rule(eq('disruption', 'baggage'))),
        offer('case-followup', 'Service case follow-up', 'Help after your holiday', 'Use the Help Centre to find the right information for your outstanding holiday query.', 'Explore the Help Centre', 'crete.jpg', rule(condition('case', 'in', ['Open', 'Pending']))),
        offer('next-holiday', 'Next holiday inspiration', 'Where will your next smile take you?', 'Explore beach holidays, city breaks and more ideas for a future getaway.', 'Find holiday inspiration', 'mexico.jpg'),
      ] },
    { key: 'convert', label: 'Find your getaway', subtitle: 'Turn interest into a holiday', source: 'Package Holidays / Holiday deals / Free Kids Place Finder',
      rule: any(eq('intent', 'High'), eq('abandoned', true)), offers: [
        offer('resume', 'Package holiday search', 'Your next holiday starts here', 'Explore package holidays with flights, transfers and hotels in one place. Prices and availability are not provided by this demo.', 'Explore package holidays', 'crete.jpg', rule(eq('abandoned', false), eq('availability', 'Available'))),
        offer('alternatives', 'Explore holiday alternatives', 'There is more sunshine to discover', 'Browse holiday destinations and alternatives when your searched fare is unavailable.', 'Explore destinations', 'gran-canaria.jpg', rule(eq('availability', 'Sold Out'))),
        offer('return-search', 'Return to holiday search', 'Pick up your holiday inspiration', 'Return to the package holiday search to explore your options again. This demo does not reserve a price or a holiday.', 'Explore holiday options', 'mexico.jpg', rule(eq('abandoned', true))),
      ] },
    { key: 'grow', label: 'Make it extra special', subtitle: 'Relevant extras, not more noise', source: 'Experiences / Select your seats / Hotel Only',
      rule: rule(eq('booking', 'Booked'), condition('days', 'gt', 14)), offers: [
        offer('experiences', 'Holiday experiences', 'Make more of your time away', 'Discover the Experiences section for ideas to explore during your holiday. Options and availability vary.', 'Explore experiences', 'crete.jpg', rule(condition('score', 'gte', 3))),
        offer('seat-options', 'Seat options', 'A journey that suits you', 'Explore seat options through Manage My Booking before your next trip. Charges and restrictions may apply.', 'Explore seat options', 'gran-canaria.jpg', rule(condition('score', 'gte', 2), condition('score', 'lt', 3))),
        offer('hotel-options', 'Hotel inspiration', 'A stay worth looking forward to', 'Explore TUI hotel options for inspiration. This demonstration does not change your existing booking.', 'Explore hotel options', 'mexico.jpg', rule(condition('score', 'lt', 2))),
      ] },
    { key: 'engage', label: 'Keep the smiles coming', subtitle: 'Inspiration for the next chapter', source: 'Holiday Inspiration / TUI Smiles Rewards Club / My booking',
      rule: rule(eq('booking', 'Dreaming'), eq('intent', 'None')), offers: [
        offer('inspiration', 'Holiday inspiration', 'So many ways to find your happy', 'From Crete to Gran Canaria, explore destinations and holidays designed by TUI.', 'Find your inspiration', 'crete.jpg', rule(condition('engagement', 'in', ['New', 'Active', 'Re-engaged']))),
        offer('smiles', 'TUI Smiles Rewards Club information', 'Discover the TUI Smiles Rewards Club', 'Explore information about the TUI Smiles Rewards Club. Membership, benefits and terms must be checked with TUI; illustrative points here are not a TUI balance.', 'Explore rewards information', 'mexico.jpg', rule(condition('points', 'gt', 0))),
        offer('booking-tools', 'Digital booking tools', 'Your holiday details, close at hand', 'Explore Manage My Booking and the digital tools available for your holiday. No app download is performed by this demo.', 'Explore booking tools', 'gran-canaria.jpg', rule(eq('app', false))),
      ] },
  ];
  objectives.forEach((o, i) => o.offers.forEach((item, j) => { item.priority = (7 - i) * 100 + 30 - j * 10; }));
  const defaults = { booking: 'Dreaming', days: 30, documents: 'Complete', disruption: 'none', case: 'None',
    intent: 'None', abandoned: false, availability: 'Available', score: 1, engagement: 'Active',
    points: 0, app: true, emailConsent: 'y', personalize: 'y' };
  const scenarios = [];
  function scenario(name, preset, objective, item, featured) {
    scenarios.push({ name, preset, expectedObjective: objective, expectedOffer: item, featured: !!featured });
  }
  scenario('A change of plans', { disruption: 'cancelled', intent: 'High' }, 'protect', 'booking-help', true);
  scenario('Support comes first', { case: 'Escalated' }, 'protect', 'help-centre', true);
  scenario('Service-only hold', { disruption: 'cancelled', case: 'Pending' }, 'protect', 'service-only');
  scenario('Flight delayed', { booking: 'In-Trip', disruption: 'delay' }, 'travel', 'flight-update', true);
  scenario('Luggage while away', { booking: 'In-Trip', disruption: 'baggage' }, 'travel', 'baggage-help');
  scenario('Enjoying the holiday', { booking: 'In-Trip' }, 'travel', 'in-resort', true);
  scenario('Tomorrow is the day', { booking: 'Booked', days: 1 }, 'prepare', 'checkin', true);
  scenario('Document checklist', { booking: 'Booked', days: 7, documents: 'Incomplete' }, 'prepare', 'documents', true);
  scenario('Two days to go', { booking: 'Booked', days: 2 }, 'prepare', 'seats');
  scenario('Two weeks to go', { booking: 'Booked', days: 14 }, 'prepare', 'seats');
  scenario('Luggage after the trip', { booking: 'Post-Trip', disruption: 'baggage' }, 'posttrip', 'luggage-followup');
  scenario('A query after the trip', { booking: 'Post-Trip', case: 'Open' }, 'posttrip', 'case-followup');
  scenario('Welcome home', { booking: 'Post-Trip' }, 'posttrip', 'next-holiday', true);
  scenario('Dreaming of a getaway', { intent: 'High' }, 'convert', 'resume', true);
  scenario('Find another sunny spot', { intent: 'High', availability: 'Sold Out' }, 'convert', 'alternatives');
  scenario('Return to the search', { abandoned: true }, 'convert', 'return-search', true);
  scenario('An extra experience', { booking: 'Booked', days: 15, score: 3 }, 'grow', 'experiences', true);
  scenario('Your preferred seat', { booking: 'Booked', days: 30, score: 2 }, 'grow', 'seat-options');
  scenario('Stay inspired', { booking: 'Booked', days: 30, score: 1.99 }, 'grow', 'hotel-options');
  scenario('Holiday inspiration', {}, 'engage', 'inspiration', true);
  scenario('Discover Smiles', { engagement: 'Dormant', points: 100 }, 'engage', 'smiles', true);
  scenario('Digital holiday tools', { engagement: 'Dormant', app: false }, 'engage', 'booking-tools');
  scenario('Nothing eligible', { engagement: 'Dormant' }, null, null, true);
  scenario('No email consent', { emailConsent: 'n' }, null, null, true);
  scenario('Unknown personalisation', { personalize: 'u' }, null, null);
  const demoScenarios = ['protect', 'travel', 'prepare', 'posttrip', 'convert', 'grow', 'engage'].map(key => {
    const example = scenarios.find(s => s.expectedObjective === key);
    return { ...example, preset: { ...defaults, ...example.preset } };
  });

  function attributes(state) {
    return Object.fromEntries(fields.map(f => [f.path, state[f.key]]));
  }
  function testCondition(c, attrs) {
    const actual = attrs[c.path];
    const normal = value => typeof value === 'string' ? value.toLowerCase() : value;
    if (actual === undefined) return false;
    switch (c.op) {
      case 'eq': return normal(actual) === normal(c.value);
      case 'in': return c.value.some(v => normal(v) === normal(actual));
      case 'gt': return actual > c.value;
      case 'gte': return actual >= c.value;
      case 'lt': return actual < c.value;
      case 'lte': return actual <= c.value;
      default: throw new Error('Unsupported rule operator: ' + c.op);
    }
  }
  function eligible(targeting, state) {
    const attrs = attributes(state);
    const checks = targeting.conditions.map(c => testCondition(c, attrs));
    return targeting.operator === 'and' ? checks.every(Boolean) : checks.some(Boolean);
  }
  function evaluate(state) {
    const consent = state.emailConsent === 'y' && state.personalize === 'y';
    const ladder = objectives.map(o => ({
      key: o.key, eligible: consent && eligible(o.rule, state),
      offers: o.offers.map(item => ({ key: item.key, priority: item.priority,
        eligible: consent && eligible(o.rule, state) && (!item.rule || eligible(item.rule, state)) })),
    }));
    for (const step of ladder) {
      const item = step.offers.filter(item => item.eligible).sort((a, b) => b.priority - a.priority)[0];
      if (item) return { objective: step.key, offer: item.key, ladder, reason: 'First eligible objective; highest eligible item priority.' };
    }
    return { objective: null, offer: null, ladder, reason: consent
      ? 'No item is eligible for these profile signals.' : 'Content held: explicit email and personalisation consent are required.' };
  }
  function describe(targeting) {
    return targeting.conditions.map(c => {
      const f = fields.find(f => f.path === c.path);
      const labels = { eq: 'is', in: 'is one of', gt: '>', gte: '>=', lt: '<', lte: '<=' };
      return f.label + ' ' + labels[c.op] + ' ' + (Array.isArray(c.value) ? c.value.join(' / ') : c.value);
    }).join(targeting.operator === 'and' ? ' AND ' : ' OR ');
  }
  const tags = [
    ['b9fbf19e-47f6-4f69-95a0-3ba3072e53f3', 'NBA Obj - Protect / Recover'],
    ['70f2b3fd-d89f-4681-9bbc-6effde141912', 'NBA Obj - Travel now'],
    ['bef4131c-5989-45ac-9685-83f79ce56a4c', 'NBA Obj - Prepare / Service trip'],
    ['b8abc645-c6aa-4f5f-810a-9cc6dfbf8e19', 'NBA Obj - Complete post-trip'],
    ['dcf18a3c-e25d-45c2-80de-008f00ba1028', 'NBA Obj - Convert'],
    ['d1d5690a-6303-4f02-93c5-55dc46406398', 'NBA Obj - Grow'],
    ['fceeb6dc-8576-4e15-a26f-a4928e410b6c', 'NBA Obj - Engage'],
  ];
  function catalogPlan(verifiedTags) {
    if (!verifiedTags || verifiedTags.length !== 7) throw new Error('Seven live-verified tag references are required');
    return {
      version: 1, sandbox: 'kirkham', customer: 'TUI Demo', tenant,
      schemaId: 'https://ns.adobe.com/demoemea/schemas/5d5eedc2795d4dd54a076473b4b16a468953af983b80ee6',
      profileSchemaId: 'https://ns.adobe.com/demoemea/schemas/a951877632f590031b11072842a80e09818b31874d291cec',
      catalogId: 'xcore:decision-catalog:18c6b876319b00e4',
      collectionTemplateId: 'dps:item-collection:1d25b5cae6d8af22',
      profileFields: fields.filter(f => f.group !== 'Consent').map(f => ({
        path: f.path, type: f.type, dataflow: f.path.includes('.scoring.') || f.path.includes('.loyaltyDetails.') ? 'generic' : 'travel',
      })),
      objectives: objectives.map((o, i) => ({ key: o.key, label: o.label, rule: o.rule,
        tag: verifiedTags[i], offers: o.offers.map(item => ({
          key: item.key, name: item.name, priority: item.priority, content: item.content,
          ...(item.rule ? { rule: item.rule } : {}),
        })) })),
      scenarios: scenarios.filter(s => !Object.hasOwn(s.preset, 'emailConsent') && !Object.hasOwn(s.preset, 'personalize'))
        .map(s => ({
          name: s.name, attributes: Object.fromEntries(fields.filter(f => f.group !== 'Consent')
            .map(f => [f.path, ({ ...defaults, ...s.preset })[f.key]])),
          expectedObjective: s.expectedObjective, expectedOffer: s.expectedOffer,
        })),
    };
  }
  const model = { fields, objectives, defaults, scenarios, demoScenarios, evaluate, describe, attributes, catalogPlan, tags };
  if (typeof module !== 'undefined' && module.exports) module.exports = model;
  else root.TuiDecisioning = model;
})(typeof globalThis !== 'undefined' ? globalThis : this);
