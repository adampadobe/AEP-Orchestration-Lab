import {
  assign,
  isoDateAgo,
  randomBetween,
  randomDecimal,
  randomPick,
  weightedBool,
} from './utils.mjs';
import { HOUSEHOLD_INCOME_BAND_MIDPOINT } from './fsi.mjs';
import { LTV_MIDPOINT } from './retail.mjs';
import { applyTravelSegmentHint } from './travel.mjs';

/** Travel segment hints (hotel edge segments). */
export const TRAVEL_SEGMENT_HINTS = ['hotel_high_value', 'hotel_reactivation'];

/** FSI segment hints for wealth / credit-rebuild demos. */
export const FSI_SEGMENT_HINTS = ['high_net_worth', 'credit_rebuild'];

/** Retail segment hints for loyalty / abandonment demos. */
export const RETAIL_SEGMENT_HINTS = ['loyalty_vip', 'cart_abandoner'];

export const SEGMENT_HINTS_BY_INDUSTRY = {
  travel: TRAVEL_SEGMENT_HINTS,
  fsi: FSI_SEGMENT_HINTS,
  retail: RETAIL_SEGMENT_HINTS,
};

/**
 * Apply FSI segment overlays.
 * @param {Record<string, unknown>} attrs
 * @param {string} segmentHint
 */
export function applyFsiSegmentHint(attrs, segmentHint) {
  const hint = String(segmentHint || '').trim().toLowerCase();

  if (hint === 'high_net_worth') {
    const incomeBand = '500k_plus';
    const creditBand = 'excellent';
    const incomeAmount = HOUSEHOLD_INCOME_BAND_MIDPOINT[incomeBand];
    const creditScore = randomBetween(780, 850);

    assign(attrs, 'industryFsi.householdIncomeBand', incomeBand);
    assign(attrs, 'industryFsi.creditScoreBand', creditBand);
    assign(attrs, 'industryFsi.lifeStage', 'pre_retirement');
    assign(attrs, 'industryFsi.employment', 'employed');
    assign(attrs, 'industryFsi.financialProducts.investment', true);
    assign(attrs, 'industryFsi.financialProducts.mortgage', weightedBool(0.70));
    assign(attrs, 'industryFsi.financialProducts.savings', true);
    assign(attrs, 'industryFsi.financialProducts.checking', true);
    assign(attrs, 'individualCharacteristics.fsi.customerRelationship.currentTier', 'Platinum');
    assign(attrs, 'individualCharacteristics.fsi.financialDetails.creditClassification', 'excellent');
    assign(attrs, 'individualCharacteristics.fsi.financialDetails.creditScore', creditScore);
    assign(attrs, 'individualCharacteristics.fsi.financialDetails.balance', {
      checkingTotal: randomBetween(50_000, 150_000),
      creditCardsTotal: randomBetween(0, 5000),
      savingsTotal: randomBetween(250_000, 1_500_000),
    });
    assign(attrs, 'individualCharacteristics.fsi.productOverview.savingsAcct', true);
    assign(attrs, 'individualCharacteristics.fsi.productOverview.checkingAcct', true);
    assign(attrs, 'individualCharacteristics.core.creditScore', creditScore);
    assign(attrs, 'personalFinances.personalTaxProfile.householdIncome.amount', incomeAmount);
    assign(attrs, 'personalFinances.personalTaxProfile.householdIncome.currencyCode', 'USD');
    assign(attrs, 'personalFinances.personalTaxProfile.taxBracket', '37%');
    assign(attrs, 'personalFinances.accountCardsTotal', randomBetween(3, 6));
    assign(attrs, 'personalFinances.creditScores', [{
      score: creditScore,
      provider: 'Experian',
      scoreDate: new Date().toISOString(),
    }]);
    assign(attrs, 'scoring.churn.churnPrediction', randomDecimal(0.02, 0.15));
    assign(attrs, 'scoring.core.propensityScore', randomDecimal(0.75, 0.95));
    assign(attrs, 'scoring.npsScore', randomBetween(8, 10));
    assign(attrs, 'loyalty.tier', 'platinum');
    assign(attrs, 'loyaltyDetails.level', 'platinum');
    return attrs;
  }

  if (hint === 'credit_rebuild') {
    const incomeBand = 'under_50k';
    const creditBand = 'poor';
    const creditScore = randomBetween(320, 579);

    assign(attrs, 'industryFsi.householdIncomeBand', incomeBand);
    assign(attrs, 'industryFsi.creditScoreBand', creditBand);
    assign(attrs, 'industryFsi.lifeStage', randomPick(['student', 'young_professional']));
    assign(attrs, 'industryFsi.employment', randomPick(['student', 'unemployed', 'contract']));
    assign(attrs, 'industryFsi.financialProducts.creditCard', weightedBool(0.40));
    assign(attrs, 'industryFsi.financialProducts.loan', weightedBool(0.35));
    assign(attrs, 'industryFsi.financialProducts.investment', false);
    assign(attrs, 'industryFsi.financialProducts.mortgage', false);
    assign(attrs, 'individualCharacteristics.fsi.customerRelationship.currentTier', 'Bronze');
    assign(attrs, 'individualCharacteristics.fsi.financialDetails.creditClassification', 'fair');
    assign(attrs, 'individualCharacteristics.fsi.financialDetails.creditScore', creditScore);
    assign(attrs, 'individualCharacteristics.fsi.financialDetails.balance', {
      checkingTotal: randomBetween(500, 3000),
      creditCardsTotal: randomBetween(2000, 8000),
      savingsTotal: randomBetween(0, 2000),
    });
    assign(attrs, 'individualCharacteristics.core.creditScore', creditScore);
    assign(attrs, 'personalFinances.personalTaxProfile.householdIncome.amount', HOUSEHOLD_INCOME_BAND_MIDPOINT[incomeBand]);
    assign(attrs, 'personalFinances.personalTaxProfile.householdIncome.currencyCode', 'USD');
    assign(attrs, 'personalFinances.accountCardsTotal', randomBetween(0, 2));
    assign(attrs, 'personalFinances.creditScores', [{
      score: creditScore,
      provider: randomPick(['Equifax', 'TransUnion']),
      scoreDate: new Date().toISOString(),
    }]);
    assign(attrs, 'scoring.churn.churnPrediction', randomDecimal(0.55, 0.85));
    assign(attrs, 'scoring.core.propensityScore', randomDecimal(0.15, 0.45));
    assign(attrs, 'scoring.npsScore', randomBetween(0, 5));
    return attrs;
  }

  return attrs;
}

/**
 * Apply retail segment overlays.
 * @param {Record<string, unknown>} attrs
 * @param {string} segmentHint
 */
export function applyRetailSegmentHint(attrs, segmentHint) {
  const hint = String(segmentHint || '').trim().toLowerCase();

  if (hint === 'loyalty_vip') {
    const ordersYTD = randomBetween(25, 60);
    const lastOrderSize = randomBetween(3, 10);
    const avgUnitPrice = randomBetween(80, 150);
    const lastOrderValue = +(lastOrderSize * avgUnitPrice).toFixed(2);
    const lifetimeValue = Math.max(LTV_MIDPOINT.over_10k, ordersYTD * lastOrderValue);

    assign(attrs, 'loyalty.tier', 'platinum');
    assign(attrs, 'loyaltyDetails.level', 'platinum');
    assign(attrs, 'loyalty.points', randomBetween(80_000, 200_000));
    assign(attrs, 'loyaltyDetails.points', randomBetween(80_000, 200_000));
    assign(attrs, 'individualCharacteristics.retail.cobrandedCreditCardHolder', true);
    assign(attrs, 'orderProfile.lifetimeValue', lifetimeValue);
    assign(attrs, 'orderProfile.ordersYTD', ordersYTD);
    assign(attrs, 'orderProfile.lastOrderDate', isoDateAgo(randomBetween(1, 14)));
    assign(attrs, 'orderProfile.lastOrderSize', lastOrderSize);
    assign(attrs, 'orderProfile.lastOrderValue', lastOrderValue);
    assign(attrs, 'orderProfile.lastOrderPaymentMethod', 'cobranded_card');
    assign(attrs, 'scoring.retail.loyaltyProgramSignUp', randomBetween(85, 100));
    assign(attrs, 'scoring.retail.loyaltyStatusUpgrade', randomBetween(70, 100));
    assign(attrs, 'scoring.retail.cobrandedCreditCardSignUp', randomBetween(75, 100));
    assign(attrs, 'scoring.churn.churnPrediction', randomDecimal(0.02, 0.15));
    assign(attrs, 'scoring.core.propensityScore', randomDecimal(0.75, 0.95));
    assign(attrs, 'scoring.npsScore', randomBetween(8, 10));
    return attrs;
  }

  if (hint === 'cart_abandoner') {
    const lastOrderSize = randomBetween(2, 8);
    const lastOrderValue = +(lastOrderSize * randomBetween(40, 90)).toFixed(2);

    assign(attrs, 'orderProfile.lastOrderDate', isoDateAgo(randomBetween(1, 7)));
    assign(attrs, 'orderProfile.lastOrderSize', lastOrderSize);
    assign(attrs, 'orderProfile.lastOrderValue', lastOrderValue);
    assign(attrs, 'orderProfile.lastOrderPaymentMethod', randomPick(['credit_card', 'paypal', 'apple_pay']));
    assign(attrs, 'orderProfile.ordersYTD', randomBetween(1, 8));
    assign(attrs, 'orderProfile.lifetimeValue', randomBetween(200, 1500));
    assign(attrs, 'scoring.retail.cobrandedCreditCardSignUp', randomBetween(10, 40));
    assign(attrs, 'scoring.retail.loyaltyProgramSignUp', randomBetween(15, 45));
    assign(attrs, 'scoring.churn.churnPrediction', randomDecimal(0.55, 0.85));
    assign(attrs, 'scoring.core.propensityScore', randomDecimal(0.10, 0.35));
    assign(attrs, 'scoring.npsScore', randomBetween(0, 5));
    assign(attrs, 'individualCharacteristics.retail.cobrandedCreditCardHolder', false);
    return attrs;
  }

  return attrs;
}

/**
 * Apply industry-specific segment overlay.
 * @param {Record<string, unknown>} attrs
 * @param {string} industry
 * @param {string | null | undefined} segmentHint
 */
export function applySegmentHint(attrs, industry, segmentHint) {
  if (!segmentHint) return attrs;
  const hint = String(segmentHint).trim().toLowerCase();
  if (!hint) return attrs;

  switch (industry) {
    case 'travel':
      return applyTravelSegmentHint(attrs, hint);
    case 'fsi':
      return applyFsiSegmentHint(attrs, hint);
    case 'retail':
      return applyRetailSegmentHint(attrs, hint);
    default:
      return attrs;
  }
}

/**
 * @param {string | undefined | null} segmentHint
 * @param {string} industry
 * @returns {string | null} normalized hint or validation error message
 */
export function normalizeSegmentHint(segmentHint, industry) {
  if (!segmentHint) return null;
  const hint = String(segmentHint).trim().toLowerCase();
  if (!hint) return null;

  const supported = SEGMENT_HINTS_BY_INDUSTRY[industry];
  if (!supported) {
    const allHints = Object.entries(SEGMENT_HINTS_BY_INDUSTRY)
      .map(([ind, hints]) => `${ind}: ${hints.join(', ')}`)
      .join('; ');
    return `segment_hint "${segmentHint}" is not supported for industry "${industry}". Supported: ${allHints}.`;
  }

  if (supported.includes(hint)) return hint;
  return `Unknown ${industry} segment_hint "${segmentHint}". Supported: ${supported.join(', ')}.`;
}
