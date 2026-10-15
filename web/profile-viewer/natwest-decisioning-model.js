(function (root) {
  'use strict';
  const defaults = {
    account: 'current', engagement: 'active', prop: 2,
    application: 'none', documents: 'complete', operations: 'normal',
    cases: 'none', product: 'savings', intent: 'browsed', recency: 24,
    available: 'yes', consent: 'full', safe: 'yes', fatigue: 1,
  };
  const fields = {
    account: 'accountType', engagement: 'engagementStatus',
    application: 'applicationStatus', documents: 'documentsStatus',
    operations: 'accountStatus', cases: 'caseStatus', product: 'productIntent',
    intent: 'shoppingIntent', recency: 'hoursSinceActivity', available: 'productAvailability',
    consent: 'consentLevel', safe: 'safeToContact', fatigue: 'messages7d',
  };
  const groups = [
    ['profile', 'Profile', [
      ['account', 'Account Type', ['none', 'current', 'savings', 'mortgage', 'loan', 'investment']],
      ['engagement', 'Engagement', ['active', 'lapsed']],
      ['prop', 'Propensity', [1, 2, 3]],
    ]],
    ['booking', 'Application', [
      ['application', 'Application status', ['none', 'started', 'submitted', 'approved']],
      ['documents', 'Documents', ['complete', 'required']],
    ]],
    ['ops', 'Operations', [['operations', 'Account status', ['normal', 'restricted', 'fraud']]]],
    ['cases', 'Cases', [['cases', 'Service case', ['none', 'open', 'resolved']]]],
    ['intent', 'Intent', [
      ['product', 'Product intent', ['savings', 'mortgage', 'loan', 'investment', 'current']],
      ['intent', 'Shopping intent', ['none', 'browsed', 'abandoned']],
      ['recency', 'Hours since activity', { min: 0, max: 168 }],
      ['available', 'Product available', ['yes', 'no']],
    ]],
    ['consent', 'Consent', [
      ['consent', 'Permission', ['full', 'service', 'none']],
      ['safe', 'Safe to contact', ['yes', 'no']],
      ['fatigue', 'Messages in 7 days', { min: 0, max: 6 }],
    ]],
  ];
  const scenarios = [
    ['Everyday banking', {}],
    ['Protect customer', { operations: 'fraud' }],
    ['Open service case', { cases: 'open' }],
    ['Finish application', { application: 'started', documents: 'required', product: 'mortgage' }],
    ['Approved', { application: 'approved', product: 'loan' }],
    ['Abandoned application', { account: 'none', intent: 'abandoned', product: 'current', prop: 3, recency: 1 }],
    ['Grow savings', { product: 'savings', prop: 3 }],
    ['Re-engage', { engagement: 'lapsed', intent: 'none', prop: 1 }],
    ['Contact hold', { safe: 'no' }],
    ['Frequency cap', { fatigue: 3 }],
  ];
  const labels = {
    none: 'None', current: 'Current account', savings: 'Savings', mortgage: 'Mortgage',
    loan: 'Loan', investment: 'Investments', active: 'Active', lapsed: 'Lapsed',
    started: 'Started', submitted: 'Submitted', approved: 'Approved',
    complete: 'Complete', required: 'Required', normal: 'Normal', restricted: 'Restricted',
    fraud: 'Fraud concern', open: 'Open', resolved: 'Resolved', browsed: 'Browsed',
    abandoned: 'Abandoned', yes: 'Yes', no: 'No', full: 'Marketing + service',
    service: 'Service only', 1: 'Low', 2: 'Medium', 3: 'High',
  };
  const objectives = [
    ['protect', 'Protect / Recover', 'service', 'Put customer safety first'],
    ['service', 'Service now', 'service', 'Resolve an open service need'],
    ['prepare', 'Prepare / Progress', 'service', 'Help complete the application'],
    ['complete', 'Complete / Welcome', 'service', 'Support an approved application'],
    ['convert', 'Convert', 'marketing', 'Continue a recent product journey'],
    ['grow', 'Grow', 'marketing', 'Help with the next financial goal'],
    ['engage', 'Engage', 'marketing', 'Stay connected with everyday banking'],
  ];
  const content = {
    protect: ['Your account security comes first', 'If something does not look right, review your account securely in the NatWest app. Never share a PIN, password or one-time passcode.', 'Review account security', 'mobile-app-customer.png'],
    service: ['Let us help get things sorted', 'Find support for your open banking query and see how to contact us securely.', 'Explore support', 'mobile-app-customer.png'],
    prepare: ['Your next step starts here', 'Pick up your application and check which supporting documents you need. An application is not a guarantee of approval.', 'Continue application', 'isa-savings-couple.png'],
    complete: ['Ready for your next chapter', 'Review your application outcome and the next steps for setting up your product.', 'See next steps', 'isa-savings-couple.png'],
    convert: ['Make your next move with NatWest', 'Explore the product you were looking at and check the details before you apply.', 'Explore your options', 'isa-savings-couple.png'],
    grow: ['Make room for your savings goals', 'Explore NatWest savings accounts and ISAs and find an option that fits your plans.', 'Explore savings', 'isa-savings-couple.png'],
    engage: ['Banking that fits around you', 'Manage your everyday banking with the NatWest app. App eligibility criteria apply.', 'Explore the app', 'mobile-app-customer.png'],
  };
  function pathFor(name) {
    return name === 'prop' ? 'scoring.core.propensityScore' : 'natwestDecisioning.' + fields[name];
  }
  function relativePath(path) { return String(path).replace(/^_[a-zA-Z0-9]+\./, '').replace(/^demoemea\./, ''); }
  function scalar(row) {
    if (row.valueType === 'number') {
      const value = Number(row.value);
      if (!Number.isFinite(value)) throw new Error('Invalid numeric profile value: ' + row.path);
      return value;
    }
    if (row.valueType === 'boolean') {
      if (![true, false, 'true', 'false'].includes(row.value)) throw new Error('Invalid boolean profile value: ' + row.path);
      return row.value === true || row.value === 'true';
    }
    return row.valueType === 'null' ? null : row.value;
  }
  function validate(input) {
    const state = { ...defaults, ...input };
    for (const [, , controls] of groups) for (const [name, , choices] of controls) {
      const value = state[name];
      if (Array.isArray(choices) ? !choices.includes(value) :
        !Number.isInteger(value) || value < choices.min || value > choices.max) {
        throw new Error('Invalid decisioning attribute: ' + name);
      }
    }
    return state;
  }
  function readState(rows) {
    const values = new Map(rows.map(row => [relativePath(row.path), scalar(row)]));
    const result = {};
    for (const name of Object.keys(defaults)) {
      let value = values.get(pathFor(name));
      if (name === 'prop' && typeof value === 'number' && value >= 0 && value <= 100 && ![1, 2, 3].includes(value)) {
        value = value >= 65 ? 3 : value >= 35 ? 2 : 1;
      }
      if (value !== undefined && value !== null) result[name] = value;
    }
    if (!('account' in result)) {
      const holding = ['checking', 'savings', 'mortgage', 'loan', 'investment'].find(product =>
        values.get('industryFsi.financialProducts.' + product) === true);
      if (holding) result.account = holding === 'checking' ? 'current' : holding;
    }
    return validate(result);
  }
  function differences(rows, expected) {
    const values = new Map(rows.map(row => [relativePath(row.path), scalar(row)]));
    return Object.entries(expected).filter(([path, value]) => values.get(path) !== value)
      .map(([path, expectedValue]) => ({ path, expected: expectedValue, actual: values.get(path) }));
  }
  function buildSnapshots(data, state, baseline) {
    validate(state);
    const changed = Object.keys(defaults).filter(name => state[name] !== baseline[name]);
    if (!changed.length) throw new Error('No profile attributes have changed.');
    const expected = Object.fromEntries(changed.map(name => [pathFor(name), state[name]]));
    const snapshots = new Map();
    for (const name of changed) {
      const industry = name === 'prop' ? 'generic' : 'fsi';
      const config = data.industries && data.industries[industry];
      if (!config || !config.writable || !config.schemaId) throw new Error('Complete ' + industry + ' Profile Generation setup before applying changes.');
      if (!snapshots.has(industry)) {
        const rows = data.rows.filter(row => row.writable === true && row.industry === industry);
        if (!rows.length) throw new Error('No writable snapshot rows for ' + industry + '.');
        snapshots.set(industry, new Map(rows.map(row => [relativePath(row.path), {
          path: relativePath(row.path), value: scalar(row), valueType: row.valueType,
        }])));
      }
      snapshots.get(industry).set(pathFor(name), {
        path: pathFor(name), value: state[name], valueType: typeof state[name] === 'number' ? 'number' : 'string',
      });
    }
    return {
      expected,
      snapshots: [...snapshots].map(([industry, rows]) => ({
        industry, updates: [...rows.values()],
      })),
    };
  }
  function evaluate(input) {
    const s = validate(input);
    const contact = s.safe === 'yes' && s.consent !== 'none';
    const marketing = contact && s.consent === 'full' && s.fatigue < 3 &&
      s.operations === 'normal' && s.cases !== 'open';
    const applicationIdle = s.application === 'none';
    const conditions = [
      [contact, s.operations !== 'normal'],
      [contact, s.cases === 'open', s.operations === 'normal'],
      [contact, ['started', 'submitted'].includes(s.application), s.documents === 'required' || s.application === 'started'],
      [contact, s.application === 'approved'],
      [marketing, applicationIdle, s.intent !== 'none', s.recency <= 48, s.available === 'yes', s.account !== s.product],
      [marketing, applicationIdle, s.account !== 'none', s.prop >= 2, s.engagement === 'active', s.available === 'yes', s.account !== s.product],
      [marketing, applicationIdle],
    ];
    const reasons = [
      ['Contact permitted', 'Account needs attention'],
      ['Contact permitted', 'Open service case', 'No account restriction'],
      ['Contact permitted', 'Application in progress', 'A next step is needed'],
      ['Contact permitted', 'Application approved'],
      ['Marketing guardrails clear', 'No active application', 'Recent product intent', 'Activity within 48 hours', 'Product available', 'New product interest'],
      ['Marketing guardrails clear', 'No active application', 'Existing customer', 'Medium / high propensity', 'Actively engaged', 'Product available', 'New product interest'],
      ['Marketing guardrails clear', 'No active application'],
    ];
    const ladder = objectives.map(([id, title, type, description], index) => ({
      id, title, type, description,
      gates: conditions[index].map((ok, gate) => ({ ok, text: reasons[index][gate] })),
      eligible: conditions[index].every(Boolean),
    }));
    const winner = ladder.find(item => item.eligible) || null;
    const candidates = winner ? [0, 1].map((variant, index) => {
      const relevance = variant === 0 ? 28 : 19;
      const urgency = winner.type === 'service' ? 25 : s.intent === 'abandoned' ? 20 : 10;
      const propensity = s.prop * (variant === 0 ? 5 : 4);
      const customer = s.engagement === 'active' ? 12 : 8;
      const business = s.account === 'none' ? 10 : 8;
      const confidence = s.recency <= 48 && s.intent !== 'none' ? 10 : 5;
      const parts = { relevance, urgency, propensity, customer, business, confidence };
      return { id: winner.id + '-' + index, title: index ? 'Supporting guidance' : content[winner.id][0], parts,
        score: Object.values(parts).reduce((sum, value) => sum + value, 0) };
    }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)) : [];
    return { state: s, ladder, winner, candidates,
      hold: !contact ? 'Contact is not permitted for this profile.' :
        s.fatigue >= 3 ? 'Marketing frequency cap reached (3 messages in 7 days).' : 'No eligible next-best action.' };
  }
  const api = { defaults, fields, groups, scenarios, labels, objectives, content, pathFor, relativePath, scalar,
    validate, readState, differences, buildSnapshots, evaluate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NatwestDecisioningModel = api;
})(typeof window !== 'undefined' ? window : globalThis);
