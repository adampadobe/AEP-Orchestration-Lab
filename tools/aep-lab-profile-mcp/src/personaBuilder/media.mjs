import {
  assign,
  isoDateAgo,
  isoDateInFuture,
  randomBetween,
  randomPick,
  weightedBool,
} from './utils.mjs';

const TIER_TO_PLAN_NAME = {
  free: 'Free (Ad-supported)',
  standard: 'Standard',
  premium: 'Premium',
  premium_plus: 'Premium Plus',
  family: 'Family Bundle',
};
const SUBSCRIPTION_TIERS = Object.keys(TIER_TO_PLAN_NAME);
const DEVICES = ['mobile', 'tablet', 'tv', 'web', 'console'];
const VIEWING_BANDS = ['under_60', '60_300', '300_600', '600_plus'];
const GENRES = ['drama', 'comedy', 'documentary', 'sports', 'kids', 'news'];
const SKU_POOL = ['SUB-STD-MO', 'SUB-PREM-MO', 'SUB-FAM-YR', 'SUB-PREM-YR'];
const BILLING_PERIODS = ['monthly', 'quarterly', 'annual'];
const TERM_POOL_BY_BILLING = {
  monthly: [1, 3, 6, 12, 24],
  quarterly: [3, 6, 12],
  annual: [1, 2, 3],
};

/**
 * Subscription/viewing-coherent media persona (mirrors profile-generation-media.js).
 * @returns {Record<string, unknown>}
 */
export function buildMediaPersonaAttributes() {
  const attrs = {};
  const tier = randomPick(SUBSCRIPTION_TIERS);
  const planName = TIER_TO_PLAN_NAME[tier];
  const genre = randomPick(GENRES);
  const bingeWatcher = weightedBool(0.55);
  const billingPeriod = randomPick(BILLING_PERIODS);
  const termPool = TERM_POOL_BY_BILLING[billingPeriod] || [12];
  const term = randomPick(termPool);
  const termUnit = billingPeriod === 'annual' ? 'years' : 'months';
  const startDays = randomBetween(30, 365);

  let status;
  if (bingeWatcher && weightedBool(0.90)) {
    status = weightedBool(0.85) ? 'active' : 'trial';
  } else {
    status = weightedBool(0.85) ? 'active' : randomPick(['cancelled', 'paused', 'trial']);
  }

  assign(attrs, 'industryMedia.subscriptionTier', tier);
  assign(attrs, 'industryMedia.preferredDevice', randomPick(DEVICES));
  assign(attrs, 'industryMedia.viewingMinutesBand', randomPick(VIEWING_BANDS));
  assign(attrs, 'industryMedia.primaryGenre', genre);
  assign(attrs, 'industryMedia.lastViewedRecency', randomPick(['today', 'this_week', 'this_month', 'lapsed']));
  assign(attrs, 'industryMedia.accountSharingBand', randomPick(['solo', 'couple', 'family', 'extended']));
  assign(attrs, 'industryMedia.engagementFlags.adSupported', weightedBool(0.30));
  assign(attrs, 'industryMedia.engagementFlags.downloadsEnabled', weightedBool(0.70));
  assign(attrs, 'industryMedia.engagementFlags.sportsPackage', weightedBool(0.20));
  assign(attrs, 'industryMedia.engagementFlags.hasKidsProfile', weightedBool(0.30));
  assign(attrs, 'industryMedia.engagementFlags.liveTv', weightedBool(0.40));
  assign(attrs, 'industryMedia.engagementFlags.bingeWatcher', bingeWatcher);
  assign(attrs, 'individualCharacteristics.core.favouriteSubCategory', genre);
  assign(attrs, 'media.accountType', tier === 'free' ? 'basic' : tier);
  assign(attrs, 'media.contractStatus', 'active');
  assign(attrs, 'media.debtStatus', 'current');
  assign(attrs, 'media.productHolding', randomPick(['TV + broadband', 'Streaming only', 'TV + mobile']));
  assign(attrs, 'media.serviceRAGStatus', randomPick(['green', 'amber', 'green']));
  assign(attrs, 'media.packages', randomPick([['Entertainment'], ['Entertainment', 'Sports'], ['Kids', 'Sports']]));

  const subStart = isoDateAgo(startDays);
  let subEnd;
  if (status === 'cancelled') {
    subEnd = isoDateAgo(randomBetween(1, 90));
  } else {
    const termDays = termUnit === 'years' ? term * 365 : term * 30;
    const aheadDays = termDays - startDays;
    subEnd = aheadDays >= 1 ? isoDateInFuture(aheadDays) : isoDateInFuture(randomBetween(15, 365));
  }

  assign(attrs, 'subscriptions', [{
    SKU: randomPick(SKU_POOL),
    planName,
    billingPeriod,
    status,
    type: randomPick(['streaming', 'cable', 'hybrid']),
    category: randomPick(['video_streaming', 'live_tv', 'kids']),
    paymentMethod: randomPick(['credit_card', 'paypal', 'apple_pay']),
    country: randomPick(['US', 'UK', 'FR', 'DE']),
    startDate: subStart,
    endDate: subEnd,
    term,
    termUnitOfTime: termUnit,
    renew: randomPick(['auto', 'manual']),
  }]);

  return attrs;
}
