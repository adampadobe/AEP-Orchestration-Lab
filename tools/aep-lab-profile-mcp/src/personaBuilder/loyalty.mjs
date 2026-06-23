import {
  assign,
  randomBetween,
  randomPick,
} from './utils.mjs';

const LOYALTY_TIERS = ['bronze', 'silver', 'gold', 'platinum'];

function randomLoyaltyPointsForTier(tier) {
  switch (String(tier || '').toLowerCase()) {
    case 'platinum':
      return randomBetween(50_000, 200_000);
    case 'gold':
      return randomBetween(20_000, 60_000);
    case 'silver':
      return randomBetween(5_000, 25_000);
    case 'bronze':
      return randomBetween(500, 7_500);
    default:
      return randomBetween(500, 50_000);
  }
}

/**
 * Portal-aligned loyalty block (LYL-* prefix). Generic-owned paths.
 * Emitted only when loyalty_member:true — matches Profile Viewer loyalty toggles.
 * @returns {Record<string, unknown>}
 */
export function buildPortalLoyaltyAttributes() {
  const attrs = {};
  const loyaltyTier = randomPick(LOYALTY_TIERS);
  const loyaltyId = `LYL-${randomBetween(100000, 999999)}`;
  const loyaltyPoints = randomLoyaltyPointsForTier(loyaltyTier);

  assign(attrs, 'identification.core.loyaltyId', loyaltyId);
  assign(attrs, 'loyalty.loyaltyID', [loyaltyId]);
  assign(attrs, 'loyalty.tier', loyaltyTier);
  assign(attrs, 'loyaltyDetails.level', loyaltyTier);
  assign(attrs, 'loyalty.points', loyaltyPoints);
  assign(attrs, 'loyaltyDetails.points', loyaltyPoints);
  return attrs;
}

/** @deprecated Use buildPortalLoyaltyAttributes */
export const buildTravelLoyaltyAttributes = buildPortalLoyaltyAttributes;
