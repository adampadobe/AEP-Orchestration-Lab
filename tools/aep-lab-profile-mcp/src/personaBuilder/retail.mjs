import {
  assign,
  isoDateAgo,
  randomBetween,
  randomPick,
  randomPickN,
  weightedBool,
} from './utils.mjs';

const STORE_POOL = [
  'Selfridges', 'Nordstrom', 'John Lewis', 'Westfield London', 'Mall of America', 'Online',
];
const COLOR_POOL = ['black', 'white', 'navy', 'grey', 'beige', 'red', 'blue'];
const DESIGNER_POOL = ['Burberry', 'Gucci', 'Prada', 'Nike', 'Patagonia', 'COS'];
const FASHION_BRAND_POOL = ['Nike', 'Adidas', "Levi's", 'Zara', 'Uniqlo', 'Ralph Lauren'];
const SHIRT_POOL = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const PAYMENT_POOL = ['credit_card', 'debit_card', 'paypal', 'apple_pay', 'google_pay', 'bnpl'];
const COBRANDED_PAYMENT = 'cobranded_card';
const ORDER_TYPE_POOL = ['online', 'click-and-collect', 'in-store', 'subscription'];
const SKU_PREFIX = ['SKU', 'PRD', 'ITM'];
const FAV_CATEGORIES = ['apparel', 'electronics', 'home', 'beauty', 'footwear'];
const LTV_BANDS = ['under_100', '100_500', '500_2k', '2k_10k', 'over_10k'];
const LTV_MIDPOINT = {
  under_100: 50,
  '100_500': 300,
  '500_2k': 1250,
  '2k_10k': 6000,
  over_10k: 25000,
};
const HOUSEHOLD_KIDS = {
  single: { has: false, count: 0 },
  couple: { has: false, count: 0 },
  family_young: { has: true, count: 2 },
  family_teen: { has: true, count: 2 },
  empty_nesters: { has: false, count: 0 },
};

function randomPantsSize() {
  return `${randomBetween(28, 40)}x${randomPick([30, 32, 34, 36])}`;
}

function randomShoeSize() {
  const base = randomBetween(6, 12);
  return `${base}${Math.random() < 0.5 ? '.5' : ''} US`;
}

function randomSku() {
  return `${randomPick(SKU_PREFIX)}-${randomBetween(100000, 999999)}`;
}

/**
 * Correlated retail persona (mirrors profile-generation-retail.js randomizePersona).
 * @returns {Record<string, unknown>}
 */
export function buildRetailPersonaAttributes() {
  const attrs = {};
  const favCategory = randomPick(FAV_CATEGORIES);
  const ltvBand = randomPick(LTV_BANDS);
  const household = randomPick(Object.keys(HOUSEHOLD_KIDS));
  const kids = HOUSEHOLD_KIDS[household];
  const isCobranded = weightedBool(0.30);
  const lastOrderSize = randomBetween(1, 12);
  const avgUnitPrice = randomBetween(15, 120);
  const lastOrderValue = +(lastOrderSize * avgUnitPrice).toFixed(2);
  const ordersYTD = randomBetween(1, 50);
  const ltvBandFloor = LTV_MIDPOINT[ltvBand] || 0;
  const orderActivityFloor = Math.round(ordersYTD * lastOrderValue * (0.6 + Math.random() * 0.6));
  const lifetimeValue = Math.max(200, ltvBandFloor, orderActivityFloor);
  const paymentMethod = isCobranded && weightedBool(0.70) ? COBRANDED_PAYMENT : randomPick(PAYMENT_POOL);

  assign(attrs, 'individualCharacteristics.core.favouriteCategory', favCategory);
  assign(attrs, 'individualCharacteristics.core.childrenInHouseHold', kids.has);
  assign(attrs, 'individualCharacteristics.core.numberChildreninHouseHold', kids.count);
  assign(attrs, 'individualCharacteristics.retail.favoriteColor', randomPick(COLOR_POOL));
  assign(attrs, 'individualCharacteristics.retail.favoriteStore', randomPick(STORE_POOL));
  assign(attrs, 'individualCharacteristics.retail.favoriteDesigner', randomPick(DESIGNER_POOL));
  assign(attrs, 'individualCharacteristics.retail.favoriteFashionBrand', randomPick(FASHION_BRAND_POOL));
  assign(attrs, 'individualCharacteristics.retail.linkedStore', randomPickN(STORE_POOL, randomBetween(1, 3)));
  assign(attrs, 'individualCharacteristics.retail.cobrandedCreditCardHolder', isCobranded);
  assign(attrs, 'individualCharacteristics.retail.shirtSize', randomPick(SHIRT_POOL));
  assign(attrs, 'individualCharacteristics.retail.pantsSize', randomPantsSize());
  assign(attrs, 'individualCharacteristics.retail.shoeSize', randomShoeSize());
  assign(attrs, 'orderProfile.lifetimeValue', lifetimeValue);
  assign(attrs, 'orderProfile.lastOrderDate', isoDateAgo(randomBetween(1, 90)));
  assign(attrs, 'orderProfile.lastOrderSize', lastOrderSize);
  assign(attrs, 'orderProfile.lastOrderValue', lastOrderValue);
  assign(attrs, 'orderProfile.lastOrderPaymentMethod', paymentMethod);
  const skus = [];
  for (let i = 0; i < randomBetween(1, 4); i += 1) skus.push(randomSku());
  assign(attrs, 'orderProfile.lastOrderSku', skus);
  assign(attrs, 'orderProfile.lastOrderStore', randomPickN(STORE_POOL, randomBetween(1, 2)));
  assign(attrs, 'orderProfile.lastOrderType', randomPickN(ORDER_TYPE_POOL, randomBetween(1, 2)));
  assign(attrs, 'orderProfile.ordersYTD', ordersYTD);
  assign(attrs, 'scoring.retail.cobrandedCreditCardSignUp', randomBetween(0, 100));
  assign(attrs, 'scoring.retail.loyaltyProgramSignUp', randomBetween(0, 100));
  assign(attrs, 'scoring.retail.loyaltyStatusUpgrade', randomBetween(0, 100));

  return attrs;
}

export { LTV_MIDPOINT };
