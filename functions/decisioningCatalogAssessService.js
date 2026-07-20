/**
 * Rule-based Decisioning catalog health report for MCP Coworker suggestions.
 */

const { listCatalogEntities } = require('./decisioningCatalogService');

/**
 * @param {object} catalog
 * @param {Array<object>} [catalog.offers]
 * @param {Array<object>} [catalog.collections]
 * @param {Array<object>} [catalog.strategies]
 */
function assessCatalogHealth(catalog) {
  const offers = Array.isArray(catalog?.offers) ? catalog.offers : [];
  const collections = Array.isArray(catalog?.collections) ? catalog.collections : [];
  const strategies = Array.isArray(catalog?.strategies) ? catalog.strategies : [];

  const now = new Date();

  const expiredOffers = offers.filter((o) => {
    if (!o.endDate) return false;
    return new Date(o.endDate) < now;
  });

  const scheduledOffers = offers.filter((o) => {
    if (!o.startDate) return false;
    return new Date(o.startDate) > now;
  });

  const activeOffers = offers.filter((o) => o.lifecycleStatus === 'Active');

  const offersWithoutTags = offers.filter((o) => !Array.isArray(o.tags) || o.tags.length === 0);

  const emptyCollections = collections.filter((c) => !c.hasRules || c.constraintCount === 0);

  const strategiesWithoutRanking = strategies.filter((s) => !s.rankingType);

  /** @type {Record<number, object[]>} */
  const byPriority = {};
  for (const s of strategies) {
    if (s.priority == null) continue;
    const p = Number(s.priority);
    if (!byPriority[p]) byPriority[p] = [];
    byPriority[p].push(s);
  }
  const duplicateStrategyPriorities = Object.entries(byPriority)
    .filter(([, list]) => list.length > 1)
    .map(([priority, list]) => ({
      priority: Number(priority),
      count: list.length,
      strategyIds: list.map((s) => s.id).filter(Boolean),
      strategyNames: list.map((s) => s.name).filter(Boolean),
    }));

  /** @type {string[]} */
  const suggestions = [];

  if (expiredOffers.length) {
    suggestions.push(
      `${expiredOffers.length} offer item(s) are expired — extend endDate or archive in AJO Decisioning catalog before demos.`,
    );
  }
  if (scheduledOffers.length) {
    suggestions.push(
      `${scheduledOffers.length} offer item(s) are scheduled for the future — move startDate earlier or use Active offers for live Edge evaluate demos.`,
    );
  }
  if (offersWithoutTags.length && collections.some((c) => c.hasRules)) {
    suggestions.push(
      `${offersWithoutTags.length} offer item(s) have no tags while collections use tag rules — tag offers or relax collection filters.`,
    );
  }
  if (emptyCollections.length) {
    suggestions.push(
      `${emptyCollections.length} item collection(s) have no rules — strategies referencing them may return zero eligible items.`,
    );
  }
  if (strategiesWithoutRanking.length) {
    suggestions.push(
      `${strategiesWithoutRanking.length} selection strateg(ies) missing ranking method — set Offer priority, Formula, or AI model ranking in AJO.`,
    );
  }
  if (duplicateStrategyPriorities.length) {
    suggestions.push(
      `${duplicateStrategyPriorities.length} duplicate strategy priority value(s) — tie-breaking may be non-deterministic; use unique priorities for demos.`,
    );
  }
  if (!offers.length) {
    suggestions.push('No offer items returned — verify x-schema-id (Personalized Offer Items schema) and sandbox AJO Decisioning setup.');
  }
  if (!strategies.length) {
    suggestions.push('No selection strategies returned — create strategies linked to item collections before Edge evaluate.');
  }
  if (offers.length && strategies.length && !activeOffers.length) {
    suggestions.push('All offer items are expired or scheduled — no Active offers for live personalization.');
  }

  const issueCount =
    expiredOffers.length +
    scheduledOffers.length +
    emptyCollections.length +
    strategiesWithoutRanking.length +
    duplicateStrategyPriorities.length +
    (offersWithoutTags.length && collections.some((c) => c.hasRules) ? 1 : 0);

  return {
    ok: true,
    summary: {
      offerCount: offers.length,
      activeOfferCount: activeOffers.length,
      collectionCount: collections.length,
      strategyCount: strategies.length,
      issueCount,
      healthy: issueCount === 0 && offers.length > 0 && strategies.length > 0,
    },
    findings: {
      expiredOffers: expiredOffers.map((o) => ({ id: o.id, name: o.name, endDate: o.endDate })),
      scheduledOffers: scheduledOffers.map((o) => ({ id: o.id, name: o.name, startDate: o.startDate })),
      offersWithoutTags: offersWithoutTags.map((o) => ({ id: o.id, name: o.name })),
      emptyCollections: emptyCollections.map((c) => ({ id: c.id, name: c.name })),
      strategiesWithoutRanking: strategiesWithoutRanking.map((s) => ({ id: s.id, name: s.name })),
      duplicateStrategyPriorities,
    },
    suggestions,
  };
}

/**
 * Fetch all three catalog entity types and run health assessment.
 * @param {object} opts — passed through to listCatalogEntities
 */
async function assessDecisioningCatalog(opts) {
  const [offersResult, collectionsResult, strategiesResult] = await Promise.all([
    listCatalogEntities({ ...opts, entityType: 'offer-items' }),
    listCatalogEntities({ ...opts, entityType: 'item-collections' }),
    listCatalogEntities({ ...opts, entityType: 'selection-strategies' }),
  ]);

  const errors = [];
  if (!offersResult.ok) errors.push({ entityType: 'offer-items', error: offersResult.error });
  if (!collectionsResult.ok) errors.push({ entityType: 'item-collections', error: collectionsResult.error });
  if (!strategiesResult.ok) errors.push({ entityType: 'selection-strategies', error: strategiesResult.error });

  const report = assessCatalogHealth({
    offers: offersResult.ok ? offersResult.items : [],
    collections: collectionsResult.ok ? collectionsResult.items : [],
    strategies: strategiesResult.ok ? strategiesResult.items : [],
  });

  return {
    ...report,
    fetchErrors: errors.length ? errors : undefined,
    schema: offersResult.ok ? offersResult.schema : undefined,
    counts: {
      offers: offersResult.ok ? offersResult.count : 0,
      collections: collectionsResult.ok ? collectionsResult.count : 0,
      strategies: strategiesResult.ok ? strategiesResult.count : 0,
    },
  };
}

module.exports = {
  assessCatalogHealth,
  assessDecisioningCatalog,
};
