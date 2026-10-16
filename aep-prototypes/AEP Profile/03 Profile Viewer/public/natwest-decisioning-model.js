(function (root) {
  'use strict';
  const defaults = {
    account: 'Current account', checking: true, savings: false, mortgage: false,
    loan: false, investment: false, prop: 50, churn: 10,
    cases: 'none', product: 'savings', available: 2, consent: 'y', personalisation: 'y',
  };
  const fields = {
    account: 'individualCharacteristics.fsi.productOverview.checkingAcctType',
    checking: 'individualCharacteristics.fsi.productOverview.checkingAcct',
    savings: 'individualCharacteristics.fsi.productOverview.savingsAcct',
    mortgage: 'individualCharacteristics.fsi.productOverview.mortgageHolder',
    loan: 'individualCharacteristics.fsi.productOverview.loansAcct',
    investment: 'individualCharacteristics.fsi.productOverview.investmentAcct',
    product: 'individualCharacteristics.fsi.financialDetails.customerBehavior.productInterest',
    prop: 'scoring.core.propensityScore', churn: 'scoring.churn.churnPrediction',
    cases: 'complaint.status', available: 'offersAndPromotions.eligibleOffers',
    consent: 'consents.marketing.email.val', personalisation: 'consents.personalize.content.val',
  };
  const groups = [
    ['profile', 'Profile', [
      ['account', 'Account Type (checking)', { text: true }],
    ]],
    ['holdings', 'Product holdings', [
      ['checking', 'Current account held', [true, false]],
      ['savings', 'Savings account held', [true, false]],
      ['mortgage', 'Mortgage held', [true, false]],
      ['loan', 'Loan account held', [true, false]],
      ['investment', 'Investment account held', [true, false]],
    ]],
    ['scores', 'Scores', [
      ['prop', 'Propensity score', { min: 0 }],
      ['churn', 'Churn prediction', { min: 0 }],
    ]],
    ['cases', 'Complaints', [['cases', 'Complaint status', { text: true }]]],
    ['intent', 'Intent', [
      ['product', 'Product interest', { text: true }],
      ['available', 'Eligible offer count', { min: 0, integer: true }],
    ]],
    ['consent', 'Consent', [
      ['consent', 'Email marketing consent', { text: true }],
      ['personalisation', 'Content personalisation consent', { text: true }],
    ]],
  ];
  const scenarios = [
    ['Everyday banking', {}],
    ['Open complaint', { cases: 'open' }],
    ['Retention support', { churn: 70 }],
    ['First current account', { checking: false, account: '', product: 'current' }],
    ['Existing savings', { savings: true }],
    ['Explore new product', { product: 'mortgage', prop: 75 }],
    ['Grow savings', { savings: true, product: 'investment' }],
    ['Everyday guidance', { available: 0 }],
    ['Contact hold', { consent: 'n' }],
    ['Personalisation hold', { personalisation: 'n' }],
  ];
  const labels = {
    none: 'None', current: 'Current account', savings: 'Savings', mortgage: 'Mortgage',
    loan: 'Loan', investment: 'Investments', active: 'Active', lapsed: 'Lapsed',
    started: 'Started', submitted: 'Submitted', approved: 'Approved',
    complete: 'Complete', required: 'Required', normal: 'Normal', restricted: 'Restricted',
    fraud: 'Fraud concern', open: 'Open', resolved: 'Resolved', browsed: 'Browsed',
    abandoned: 'Abandoned', yes: 'Yes', no: 'No', full: 'Marketing + service',
    service: 'Service only', true: 'Yes', false: 'No', y: 'Yes', n: 'No',
  };
  const objectives = [
    ['service', 'Resolve / Support', 'service', 'Put an unresolved complaint first'],
    ['protect', 'Retain / Support', 'service', 'Offer help when churn prediction is high'],
    ['prepare', 'Explore / Start', 'marketing', 'Explore a first current account'],
    ['complete', 'Support / Use', 'marketing', 'Get more from a product already held'],
    ['convert', 'Explore / Compare', 'marketing', 'High propensity for a new product'],
    ['grow', 'Grow', 'marketing', 'Explore the next goal for a saver'],
    ['engage', 'Engage', 'marketing', 'Stay connected with everyday banking'],
  ];
  const content = {
    protect: ['A little help with your banking', 'Explore ways to get support and make everyday banking work better for you.', 'Explore banking support', 'mobile-app-customer.png'],
    service: ['Let us help get things sorted', 'Find support for your banking complaint and see how to contact us securely.', 'Explore support', 'mobile-app-customer.png'],
    prepare: ['Your next step starts here', 'Explore current account options and check the details before you apply. Eligibility criteria apply.', 'Explore current accounts', 'isa-savings-couple.png'],
    complete: ['Make more of your everyday banking', 'Find guidance on managing a product you already hold through the NatWest app.', 'Explore product guidance', 'mobile-app-customer.png'],
    convert: ['Make your next move with NatWest', 'Compare options for your stated product interest and check the details before you apply.', 'Explore your options', 'isa-savings-couple.png'],
    grow: ['Make room for your savings goals', 'Explore NatWest savings accounts and ISAs and find an option that fits your plans.', 'Explore savings', 'isa-savings-couple.png'],
    engage: ['Banking that fits around you', 'Manage your everyday banking with the NatWest app. App eligibility criteria apply.', 'Explore the app', 'mobile-app-customer.png'],
  };
  function pathFor(name) {
    if (!Object.hasOwn(fields, name)) throw new Error('Unknown profile signal: ' + name);
    return fields[name];
  }
  const industryFor = name => fields[name].startsWith('individualCharacteristics.fsi.') ? 'fsi' : 'generic';
  const labelFor = value => Object.hasOwn(labels, value) ? labels[value] : String(value);
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
      if (Array.isArray(choices) ? !choices.includes(value) : choices.text ? typeof value !== 'string' :
        !Number.isFinite(value) || value < choices.min || choices.integer && !Number.isInteger(value)) {
        throw new Error('Invalid decisioning attribute: ' + name);
      }
    }
    return state;
  }
  function readState(rows) {
    const values = new Map(rows.map(row => [relativePath(row.path), scalar(row)]));
    const result = {};
    for (const name of Object.keys(defaults)) {
      const value = values.get(pathFor(name));
      if (value !== undefined && value !== null) result[name] = value;
    }
    return validate(result);
  }
  function differences(rows, expected) {
    const values = new Map(rows.map(row => [relativePath(row.path), scalar(row)]));
    return Object.entries(expected).filter(([path, value]) => values.get(path) !== value)
      .map(([path, expectedValue]) => ({ path, expected: expectedValue, actual: values.get(path) }));
  }
  function buildSnapshots(data, state, baseline, edited = []) {
    validate(state);
    const changed = Object.keys(defaults).filter(name => state[name] !== baseline[name] ||
      edited.includes(name) && !data.rows.some(row => relativePath(row.path) === pathFor(name) && scalar(row) !== null));
    if (!changed.length) throw new Error('No profile attributes have changed.');
    const expected = Object.fromEntries(changed.map(name => [pathFor(name), state[name]]));
    const snapshots = new Map();
    for (const name of changed) {
      const industry = industryFor(name);
      const config = data.industries && data.industries[industry];
      if (!config || !config.writable || !config.schemaId) throw new Error('Complete ' + industry + ' Profile Generation setup before applying changes.');
      if (!snapshots.has(industry)) {
        const rows = data.rows.filter(row => row.writable === true && row.industry === industry);
        if (!rows.length) throw new Error('No writable snapshot rows for ' + industry + '.');
        // Preserve recognised sample fields even on older servers without their ownership annotations.
        for (const signal of Object.keys(fields).filter(signal => industryFor(signal) === industry)) {
          const row = data.rows.find(row => relativePath(row.path) === pathFor(signal));
          if (row && !rows.includes(row)) rows.push(row);
        }
        snapshots.set(industry, new Map(rows.map(row => [relativePath(row.path), {
          path: relativePath(row.path), value: scalar(row), valueType: row.valueType,
        }])));
      }
      snapshots.get(industry).set(pathFor(name), {
        path: pathFor(name), value: state[name], valueType: typeof state[name],
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
    const contact = s.consent === 'y' && s.personalisation === 'y';
    const complaint = !['', 'none', 'resolved', 'closed'].includes(s.cases.trim().toLowerCase());
    const marketing = contact && !complaint && s.churn < 65;
    const product = s.product.trim().toLowerCase();
    const held = s[product === 'current' ? 'checking' : product] === true &&
      ['current', 'savings', 'mortgage', 'loan', 'investment'].includes(product);
    const hasOffers = s.available > 0;
    const conditions = [
      [contact, complaint],
      [contact, s.churn >= 65, !complaint],
      [marketing, !s.checking, product === 'current', hasOffers],
      [marketing, held],
      [marketing, s.prop >= 65, !held, !!product, hasOffers],
      [marketing, s.savings, s.prop >= 35, !held, !!product, hasOffers],
      [marketing],
    ];
    const reasons = [
      ['Email and personalisation consent explicitly yes', 'Unresolved complaint'],
      ['Email and personalisation consent explicitly yes', 'Churn prediction at least 65', 'No unresolved complaint'],
      ['Marketing guardrails clear', 'No current account held', 'Current account interest', 'Eligible offer count above zero'],
      ['Marketing guardrails clear', 'Interested product already held'],
      ['Marketing guardrails clear', 'Propensity at least 65', 'Interested product not held', 'Product interest supplied', 'Eligible offer count above zero'],
      ['Marketing guardrails clear', 'Savings account held', 'Propensity at least 35', 'Interested product not held', 'Product interest supplied', 'Eligible offer count above zero'],
      ['Marketing guardrails clear'],
    ];
    const ladder = objectives.map(([id, title, type, description], index) => ({
      id, title, type, description,
      gates: conditions[index].map((ok, gate) => ({ ok, text: reasons[index][gate] })),
      eligible: conditions[index].every(Boolean),
    }));
    const winner = ladder.find(item => item.eligible) || null;
    const candidates = winner ? [0, 1].map((variant, index) => {
      const relevance = variant === 0 ? 28 : 19;
      const urgency = winner.type === 'service' ? 25 : 10;
      const propensity = Math.round(Math.min(s.prop, 100) * (variant === 0 ? 0.15 : 0.12));
      const customer = s.account.trim() ? 12 : 8;
      const business = s.checking ? 8 : 10;
      const confidence = product ? 10 : 5;
      const parts = { relevance, urgency, propensity, customer, business, confidence };
      return { id: winner.id + '-' + index, title: index ? 'Supporting guidance' : content[winner.id][0], parts,
        score: Object.values(parts).reduce((sum, value) => sum + value, 0) };
    }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)) : [];
    return { state: s, ladder, winner, candidates,
      hold: !contact ? 'Email marketing and content personalisation both require explicit y consent.' : 'No eligible next-best action.' };
  }
  const api = { defaults, fields, groups, scenarios, labels, labelFor, industryFor, objectives, content, pathFor, relativePath, scalar,
    validate, readState, differences, buildSnapshots, evaluate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NatwestDecisioningModel = api;
})(typeof window !== 'undefined' ? window : globalThis);
