/**
 * Industry-specific copy for Experience Decisioning playground.
 * Rule logic stays aligned with base profiles (tier, cartValue, browsed, purchases).
 * Upstream concept: github.com/alexmtmr/experience-decisioning-playground
 */
import { OFFERS as RETAIL_OFFERS } from './offers';
import { PROFILES as RETAIL_PROFILES, RESULTS as RETAIL_RESULTS } from './profiles';

const BASE = {
  OFFERS: RETAIL_OFFERS,
  PROFILES: RETAIL_PROFILES,
  RESULTS: RETAIL_RESULTS,
};

/** Same scores / oi indices as retail; themed reasons only. */
const THEMED_RESULTS = {
  fsi: {
    0: [
      { oi: 0, score: 96, reason: 'Premier banking + strong balances → priority service perk.' },
      { oi: 5, score: 84, reason: 'Wealth segment signals + high-margin fit.' },
      { oi: 1, score: 78, reason: 'Rewards multiplier matches active relationship.' },
      { oi: 7, score: 65, reason: 'Product bundle leverages portfolio affinity.' },
      { oi: 6, score: 52, reason: 'Exclusive rate preview — strong but secondary.' },
    ],
    1: [
      { oi: 3, score: 91, reason: 'Rate-sensitive segment → targeted lending offer.' },
      { oi: 9, score: 83, reason: 'Everyday banking promo matches spend pattern.' },
      { oi: 4, score: 79, reason: 'Packaged products fit value-seeking profile.' },
      { oi: 8, score: 68, reason: 'Advisory add-on — broad relevance.' },
      { oi: 2, score: 61, reason: 'Credit line available but lower utilization.' },
    ],
    2: [
      { oi: 4, score: 93, reason: 'Household bundle matches joint goals.' },
      { oi: 9, score: 86, reason: 'Cash-back on essentials — weekly spend pattern.' },
      { oi: 8, score: 82, reason: 'Mortgage + planning — full household need.' },
      { oi: 1, score: 71, reason: 'Relationship rewards for Silver-tier family.' },
      { oi: 3, score: 58, reason: 'Generic rate offer — less targeted.' },
    ],
  },
  travel: {
    0: [
      { oi: 0, score: 96, reason: 'Elite flyer + high trip value → priority perks.' },
      { oi: 5, score: 84, reason: 'Route and cabin affinity + margin.' },
      { oi: 1, score: 78, reason: 'Miles multiplier matches loyalty cadence.' },
      { oi: 7, score: 65, reason: 'Upgrade path fits destination interest.' },
      { oi: 6, score: 52, reason: 'Lounge preview — nice but lower priority.' },
    ],
    1: [
      { oi: 3, score: 91, reason: 'Fare deal matches price-sensitive search.' },
      { oi: 9, score: 83, reason: 'Flash partner offer — deal-seeking trips.' },
      { oi: 4, score: 79, reason: 'Bundle (hotel+car) fits itinerary style.' },
      { oi: 8, score: 68, reason: 'Ancillary upsell — broad fit.' },
      { oi: 2, score: 61, reason: 'Installment fare available but short haul.' },
    ],
    2: [
      { oi: 4, score: 93, reason: 'Family itinerary matches package exactly.' },
      { oi: 9, score: 86, reason: 'Resort dining credit — weekly leisure pattern.' },
      { oi: 8, score: 82, reason: 'Bag + seat bundle — household travel need.' },
      { oi: 1, score: 71, reason: 'Tier bonus miles for Silver travelers.' },
      { oi: 3, score: 58, reason: 'Generic discount — less tailored.' },
    ],
  },
  media: {
    0: [
      { oi: 0, score: 96, reason: 'VIP subscriber + high engagement → premium delivery.' },
      { oi: 5, score: 84, reason: 'Genre affinity + ARPU signals.' },
      { oi: 1, score: 78, reason: 'Points weekend fits binge behavior.' },
      { oi: 7, score: 65, reason: 'Early access leverages catalog taste.' },
      { oi: 6, score: 52, reason: 'Exclusive drop — strong but secondary.' },
    ],
    1: [
      { oi: 3, score: 91, reason: 'Promo pricing matches promo-responsive viewer.' },
      { oi: 9, score: 83, reason: 'Flash catalog sale — app-first discovery.' },
      { oi: 4, score: 79, reason: 'Bundle fits value bundles and add-ons.' },
      { oi: 8, score: 68, reason: 'Device bundle — broad appeal.' },
      { oi: 2, score: 61, reason: 'Financing available but low basket.' },
    ],
    2: [
      { oi: 4, score: 93, reason: 'Kids profile pack matches household plan.' },
      { oi: 9, score: 86, reason: 'Pantry-style add-ons — weekly viewing + snacks.' },
      { oi: 8, score: 82, reason: 'Hardware + install — living-room upgrade.' },
      { oi: 1, score: 71, reason: 'Household tier bonus on family plan.' },
      { oi: 3, score: 58, reason: 'Broad promo — less specific.' },
    ],
  },
  sports: {
    0: [
      { oi: 0, score: 96, reason: 'Season-ticket tier + merch AOV → express pickup.' },
      { oi: 5, score: 84, reason: 'Team category affinity + margin.' },
      { oi: 1, score: 78, reason: 'Fan points weekend matches gameday cadence.' },
      { oi: 7, score: 65, reason: 'Jersey drop fits kit interest.' },
      { oi: 6, score: 52, reason: 'VIP preview — secondary priority.' },
    ],
    1: [
      { oi: 3, score: 91, reason: 'Cleat/gear promo matches bargain hunter.' },
      { oi: 9, score: 83, reason: 'Concessions flash — mobile order behavior.' },
      { oi: 4, score: 79, reason: 'Bundle (ticket+merch) for value seekers.' },
      { oi: 8, score: 68, reason: 'Equipment trade — broad appeal.' },
      { oi: 2, score: 61, reason: 'Payment plan open but low cart.' },
    ],
    2: [
      { oi: 4, score: 93, reason: 'Youth league bundle matches family mission.' },
      { oi: 9, score: 86, reason: 'Tailgate essentials — weekly gameday shop.' },
      { oi: 8, score: 82, reason: 'Seating upgrade + setup — venue day need.' },
      { oi: 1, score: 71, reason: 'Loyalty bonus for Silver members.' },
      { oi: 3, score: 58, reason: 'General discount — less targeted.' },
    ],
  },
  telecommunications: {
    0: [
      { oi: 0, score: 96, reason: 'Premium unlimited + high usage → priority care perk.' },
      { oi: 5, score: 84, reason: 'Device category signals + margin.' },
      { oi: 1, score: 78, reason: 'Loyalty multiplier matches recharge pattern.' },
      { oi: 7, score: 65, reason: 'Handset trade aligns with upgrade cycle.' },
      { oi: 6, score: 52, reason: 'Exclusive plan preview — lower priority.' },
    ],
    1: [
      { oi: 3, score: 91, reason: 'Accessory promo matches price-sensitive buyer.' },
      { oi: 9, score: 83, reason: 'Add-on flash — app-first usage.' },
      { oi: 4, score: 79, reason: 'Bundle (line+device) for seekers of value.' },
      { oi: 8, score: 68, reason: 'Home internet bundle — broad fit.' },
      { oi: 2, score: 61, reason: 'Device financing available but low basket.' },
    ],
    2: [
      { oi: 4, score: 93, reason: 'Family plan bundle matches household lines.' },
      { oi: 9, score: 86, reason: 'Streaming add-on flash — weekly data pattern.' },
      { oi: 8, score: 82, reason: 'Router + install — connected home need.' },
      { oi: 1, score: 71, reason: 'Line bonus for Silver-tier accounts.' },
      { oi: 3, score: 58, reason: 'Generic accessory deal — less tailored.' },
    ],
  },
  public: {
    0: [
      { oi: 0, score: 96, reason: 'Registered citizen + high engagement → priority channel.' },
      { oi: 5, score: 84, reason: 'Service category fit + program margin.' },
      { oi: 1, score: 78, reason: 'Benefits multiplier matches active participation.' },
      { oi: 7, score: 65, reason: 'Program preview leverages declared interest.' },
      { oi: 6, score: 52, reason: 'Exclusive briefing — secondary fit.' },
    ],
    1: [
      { oi: 3, score: 91, reason: 'Fee waiver path matches cost-sensitive resident.' },
      { oi: 9, score: 83, reason: 'Limited-time service window — digital-first.' },
      { oi: 4, score: 79, reason: 'Bundled services for value seekers.' },
      { oi: 8, score: 68, reason: 'Cross-program enrollment — broad appeal.' },
      { oi: 2, score: 61, reason: 'Payment plan available but low case value.' },
    ],
    2: [
      { oi: 4, score: 93, reason: 'Household services bundle matches case mission.' },
      { oi: 9, score: 86, reason: 'Community program flash — weekly touchpoints.' },
      { oi: 8, score: 82, reason: 'Assistance package — household need.' },
      { oi: 1, score: 71, reason: 'Tier credit for Silver enrollees.' },
      { oi: 3, score: 58, reason: 'General offer — less specific.' },
    ],
  },
};

const OFFER_COPY = {
  fsi: {
    names: [
      'Premier Service Line',
      '3× Rewards Weekend',
      '0% Intro on Cards',
      'Rate Lock — Personal Loan',
      'Bundle: Checking + Savings',
      'Wealth Session — €30 Off',
      'Private Client Preview',
      'Device Trade Credit',
      'Planning Desk — Free Review',
      'Everyday Cashback Flash',
    ],
    descs: [
      'For Premier relationships on balances above €50k',
      'Earn triple points on eligible card spend',
      '12 months interest-free on qualifying products',
      'Summer rate — limited time on approved credit',
      'Starter + growth accounts in one package',
      'Fee reduction on advisory session booking',
      'Early access to new structured products',
      'Credit toward managed portfolio devices',
      'Complimentary planning above €200 relationship',
      'Pantry-style cashback on debit today only',
    ],
  },
  travel: {
    names: [
      'Priority Check-In & Bags',
      '3× Miles Weekend',
      '0% on Travel Card',
      'Flash Fare — Long Haul',
      'Hotel + Transfer Bundle',
      'Noise-Cancel Headset €30 Off',
      'Lounge Preview Access',
      'Seat + Bundle Upgrade',
      'Resort Credit — Free Add-On',
      'Dining Flash — 15% Off',
    ],
    descs: [
      'For elite members on itineraries over €50',
      'Earn triple miles on qualifying segments',
      '12-month promo APR on travel card',
      'Summer routes — limited inventory',
      'Stay + airport transfer combo',
      'Top-rated headset for red-eye flights',
      'Early lounge access for status members',
      'Extra legroom + bundle savings',
      'Free resort credit on packages €200+',
      'Partner restaurants today only',
    ],
  },
  media: {
    names: [
      'Express Catalog Delivery',
      '3× Points Weekend',
      '0% on Hardware Plan',
      'Season Pass — 20% Off',
      'Bundle: Stream + Cloud',
      'Premium Headphones €30 Off',
      'Early Drop — New Series',
      'Device Trade Toward TV',
      'Install & Setup — Free',
      'Snack Box Flash — 15% Off',
    ],
    descs: [
      'For VIP subs on carts over €50',
      'Triple points on rentals and purchases',
      'Interest-free financing on eligible devices',
      'Limited series — time-boxed discount',
      'Back-to-binge backpack + storage deal',
      'Noise-cancelling — top rated',
      'Early access for loyalty viewers',
      'Credit when you trade old gear',
      'Free assembly on large screens €200+',
      'Pantry add-ons for watch nights',
    ],
  },
  sports: {
    names: [
      'Express Locker Pickup',
      '3× Fan Points Weekend',
      '0% on Gear Financing',
      'Kit Drop — 20% Off',
      'Bundle: Ticket + Scarf',
      'Cleats €30 Off',
      'New Kit Preview',
      'Trade Old Boots In',
      'Seat Upgrade Package',
      'Concessions Flash — 15% Off',
    ],
    descs: [
      'For season members on orders over €50',
      'Triple points on merch and tickets',
      'Interest-free payment on team store',
      'Summer kit — limited inventory',
      'Matchday bundle for families',
      'Top-rated boots for turf and pitch',
      'Early access for loyalty members',
      'Credit toward new season strip',
      'Seat + stand experience over €200',
      'Gameday bites today only',
    ],
  },
  telecommunications: {
    names: [
      'Priority Care Line',
      '3× Loyalty Weekend',
      '0% on Phone Plan',
      'Accessory Flash — 20% Off',
      'Bundle: Fiber + Mobile',
      'Router Upgrade €30 Off',
      'Exclusive Plan Preview',
      'Handset Trade Credit',
      'Home Install — Free Visit',
      'Add-On Flash — 15% Off',
    ],
    descs: [
      'For unlimited tiers on bills over €50',
      'Triple points on recharge and accessories',
      'Interest-free device payment promo',
      'Summer accessories — limited time',
      'Broadband + mobile in one package',
      'Wi‑Fi 7 hardware — top rated',
      'Early access for loyalty accounts',
      'Credit when you trade old phone',
      'Free technician on installs €200+',
      'Streaming add-ons today only',
    ],
  },
  public: {
    names: [
      'Priority Service Channel',
      '3× Benefits Weekend',
      '0% Fee Waiver Program',
      'Program Fee Relief — 20%',
      'Bundle: ID + Notifications',
      'Workshop Session — €30 Off',
      'Citizen Preview Access',
      'Credential Trade Credit',
      'Community Desk — Free Session',
      'Service Window Flash — 15% Off',
    ],
    descs: [
      'For enrolled residents on cases over €50',
      'Triple credits on qualifying filings',
      'Deferred fees on approved programs',
      'Limited enrollment — summer window',
      'Digital ID + alerts starter pack',
      'Top-rated workshop slots',
      'Early briefing for active participants',
      'Credit toward renewed credentials',
      'Free intake on programs €200+',
      'Same-day slots today only',
    ],
  },
};

const PROFILE_COPY = {
  fsi: {
    names: ['Priya N.', 'Marcus T.', 'The Nguyens'],
    details: [
      'Mobile-first · 3–4 logins/mo · Cards & wealth',
      'Rate shopping · Converts on promo APR',
      'Joint goals · School fees + home plan',
    ],
    avatars: ['P', 'M', 'N'],
  },
  travel: {
    names: ['Alex M.', 'Sofia R.', 'The Patels'],
    details: [
      'App-first · 3–4 trips/mo · Long-haul & city breaks',
      'Fare alerts · Books on deal',
      'Family trips · School holidays + beach',
    ],
    avatars: ['A', 'S', 'P'],
  },
  media: {
    names: ['Jordan K.', 'Casey L.', 'The Millers'],
    details: [
      'Stream-first · 3–4 sessions/wk · Drama & docs',
      'Trial hopping · Converts on bundle promo',
      'Household plan · Kids profiles + sports',
    ],
    avatars: ['J', 'C', 'M'],
  },
  sports: {
    names: ['Riley J.', 'Morgan S.', 'The Garcías'],
    details: [
      'App-first · 3–4 visits/mo · Kit & tickets',
      'Deal seeker · Buys on promo windows',
      'Family fans · Youth league + merch',
    ],
    avatars: ['R', 'M', 'G'],
  },
  telecommunications: {
    names: ['Taylor V.', 'Jamie P.', 'The Okafors'],
    details: [
      'Self-serve app · 3–4 changes/mo · Devices & fiber',
      'Plan compare · Switches on promo',
      'Family lines · Kids tablets + home Wi‑Fi',
    ],
    avatars: ['T', 'J', 'O'],
  },
  public: {
    names: ['Sam D.', 'Robin H.', 'The Cohens'],
    details: [
      'Portal-first · 3–4 cases/mo · Benefits & permits',
      'Cost sensitive · Completes on fee relief',
      'Household filings · School + community programs',
    ],
    avatars: ['S', 'R', 'C'],
  },
};

function mapOffers(industryKey) {
  const copy = OFFER_COPY[industryKey];
  if (!copy) return RETAIL_OFFERS;
  return RETAIL_OFFERS.map((o, i) => ({
    ...o,
    name: copy.names[i] ?? o.name,
    desc: copy.descs[i] ?? o.desc,
  }));
}

function mapProfiles(industryKey) {
  const pc = PROFILE_COPY[industryKey];
  if (!pc) return RETAIL_PROFILES;
  return RETAIL_PROFILES.map((p, i) => ({
    ...p,
    name: pc.names[i] ?? p.name,
    detail: pc.details[i] ?? p.detail,
    avatar: pc.avatars[i] ?? p.avatar,
  }));
}

/**
 * @param {string} industry
 * @returns {{ OFFERS: typeof RETAIL_OFFERS, PROFILES: typeof RETAIL_PROFILES, RESULTS: typeof RETAIL_RESULTS }}
 */
export function getIndustryPack(industry) {
  if (!industry || industry === 'retail') {
    return { OFFERS: BASE.OFFERS, PROFILES: BASE.PROFILES, RESULTS: BASE.RESULTS };
  }
  const results = THEMED_RESULTS[industry];
  if (!results) {
    return { OFFERS: BASE.OFFERS, PROFILES: BASE.PROFILES, RESULTS: BASE.RESULTS };
  }
  return {
    OFFERS: mapOffers(industry),
    PROFILES: mapProfiles(industry),
    RESULTS: results,
  };
}
