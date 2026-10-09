(function (global) {
  'use strict';
  const fields = {
    engage: 'engagementStatus', booking: 'journeyStage', days: 'daysToDeparture',
    docs: 'documentsStatus', anc: 'ancillariesHeld', disruption: 'disruptionSeverity',
    caseState: 'caseStatus', intent: 'shoppingIntent', recency: 'hoursSinceActivity',
    fare: 'fareAvailability', consent: 'consentLevel', safe: 'safeToContact', fatigue: 'messages7d',
  };
  const numeric = new Set(['days', 'recency', 'fatigue']);
  const propensity = { low: 20, medium: 50, high: 80 };
  function relativePath(path) {
    return String(path).replace(/^_[a-zA-Z0-9]+\./, '').replace(/^demoemea\./, '');
  }
  function scalar(row) {
    if (row.valueType === 'number') {
      const value = Number(row.value);
      if (!Number.isFinite(value)) throw new Error('Invalid numeric profile value at ' + row.path);
      return value;
    }
    if (row.valueType === 'boolean') return row.value === true || row.value === 'true';
    if (row.valueType === 'null') return null;
    return row.value;
  }
  function readState(rows) {
    const byPath = new Map(rows.map(row => [relativePath(row.path), scalar(row)]));
    const state = {};
    Object.entries(fields).forEach(([key, leaf]) => {
      const value = byPath.get('britishAirwaysDecisioning.' + leaf);
      if (value !== undefined) state[key] = numeric.has(key) ? Number(value) : String(value);
    });
    const tier = byPath.get('loyalty.tier') ?? byPath.get('loyaltyDetails.level');
    if (tier != null) state.tier = String(tier).toLowerCase();
    const score = byPath.get('scoring.core.propensityScore');
    if (score != null) state.prop = Number(score) < 35 ? 'low' : Number(score) < 65 ? 'medium' : 'high';
    return state;
  }
  function buildSnapshots(rows, state, industries, baseline) {
    const groups = new Map();
    rows.filter(row => row.writable === true && row.industry).forEach(row => {
      if (!groups.has(row.industry)) groups.set(row.industry, new Map());
      groups.get(row.industry).set(relativePath(row.path), {
        path: relativePath(row.path), value: scalar(row), valueType: row.valueType,
      });
    });
    for (const industry of ['generic', 'travel']) {
      if (industries && industries[industry] && industries[industry].writable) {
        if (!groups.has(industry)) groups.set(industry, new Map());
      } else if (!groups.has(industry)) {
        throw new Error(industry + ' writable profile dataflow is missing. Complete its Profile Generation setup first.');
      }
    }
    const travel = groups.get('travel');
    Object.entries(fields).forEach(([key, leaf]) => {
      const path = 'britishAirwaysDecisioning.' + leaf;
      travel.set(path, { path, value: state[key], valueType: numeric.has(key) ? 'number' : 'string' });
    });
    const generic = groups.get('generic');
    const unchangedTier = (baseline || readState(rows)).tier === state.tier;
    const existingTier = generic.get('loyalty.tier') || generic.get('loyaltyDetails.level');
    for (const path of ['loyalty.tier', 'loyaltyDetails.level']) {
      if (!generic.has(path) || !unchangedTier) {
        const tier = unchangedTier && existingTier ? existingTier.value : state.tier.charAt(0).toUpperCase() + state.tier.slice(1);
        generic.set(path, { path, value: tier, valueType: 'string' });
      }
    }
    const path = 'scoring.core.propensityScore';
    if (!generic.has(path) || readState(rows).prop !== state.prop) {
      generic.set(path, { path, value: propensity[state.prop], valueType: 'number' });
    }
    return Array.from(groups, ([industry, updates]) => ({ industry, updates: Array.from(updates.values()) }));
  }
  const api = { fields, propensity, relativePath, readState, buildSnapshots };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.BaDecisioningModel = api;
})(typeof window !== 'undefined' ? window : globalThis);
