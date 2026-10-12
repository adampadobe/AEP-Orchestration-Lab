(function (global) {
  'use strict';
  const fields = {
    engage: 'engagementStatus', days: 'daysToDeparture',
    docs: 'documentsStatus', anc: 'ancillariesHeld',
    caseState: 'caseStatus', intent: 'shoppingIntent', recency: 'hoursSinceActivity',
    fare: 'fareAvailability', consent: 'consentLevel', safe: 'safeToContact', fatigue: 'messages7d',
  };
  const numeric = new Set(['days', 'recency', 'fatigue']);
  const disruptionPath = 'travelReservations.flightReservations.flightDisruption.disruptionType';
  const bookingPath = 'travelReservations.flightReservations.bookingStatus';
  const propensity = { '1': 1, '2': 2, '3': 3 };
  function readPropensity(score) {
    const value = Number(score);
    if (!Number.isFinite(value)) throw new Error('Invalid numeric propensity score');
    if (value === 1 || value === 2 || value === 3) return String(value);
    // Display legacy 0-100 profiles until Apply saves the new 1-3 scale.
    return value < 35 ? '1' : value < 65 ? '2' : '3';
  }
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
    if (byPath.has(disruptionPath)) state.disruption = String(byPath.get(disruptionPath));
    if (byPath.has(bookingPath)) state.booking = String(byPath.get(bookingPath));
    const tier = byPath.get('airlineCustomer.loyaltyTier');
    if (tier != null) state.tier = String(tier).toLowerCase();
    const score = byPath.get('scoring.core.propensityScore');
    if (score != null) state.prop = readPropensity(score);
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
    groups.forEach((updates, industry) => {
      if (industry === 'travel') return;
      Array.from(updates.keys()).forEach(path => {
        if (path.startsWith('britishAirwaysDecisioning.') || path === 'airlineCustomer.loyaltyTier' || path === disruptionPath || path === bookingPath) updates.delete(path);
      });
    });
    Object.entries(fields).forEach(([key, leaf]) => {
      const path = 'britishAirwaysDecisioning.' + leaf;
      travel.set(path, { path, value: state[key], valueType: numeric.has(key) ? 'number' : 'string' });
    });
    travel.set(disruptionPath, { path: disruptionPath, value: state.disruption, valueType: 'string' });
    travel.set(bookingPath, { path: bookingPath, value: state.booking, valueType: 'string' });
    const generic = groups.get('generic');
    const unchangedTier = (baseline || readState(rows)).tier === state.tier;
    const existingTier = rows.find(row => relativePath(row.path) === 'airlineCustomer.loyaltyTier');
    travel.set('airlineCustomer.loyaltyTier', {
      path: 'airlineCustomer.loyaltyTier',
      value: unchangedTier && existingTier ? scalar(existingTier) : state.tier.charAt(0).toUpperCase() + state.tier.slice(1),
      valueType: 'string',
    });
    const path = 'scoring.core.propensityScore';
    if (!Object.hasOwn(propensity, state.prop)) throw new Error('Propensity must be 1, 2 or 3');
    generic.set(path, { path, value: propensity[state.prop], valueType: 'number' });
    return Array.from(groups, ([industry, updates]) => ({ industry, updates: Array.from(updates.values()) }));
  }
  const api = { fields, disruptionPath, bookingPath, propensity, readPropensity, relativePath, readState, buildSnapshots };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.BaDecisioningModel = api;
})(typeof window !== 'undefined' ? window : globalThis);
