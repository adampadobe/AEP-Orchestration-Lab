import {
  assign,
  isoDateAgo,
  randomBetween,
  randomBellBetween,
  randomPick,
  weightedBool,
  weightedPick,
} from './utils.mjs';

const CREDIT_SCORE_BAND_MIDPOINT = {
  poor: 440,
  fair: 625,
  good: 705,
  very_good: 770,
  excellent: 825,
};

const HOUSEHOLD_INCOME_BAND_MIDPOINT = {
  under_50k: 35000,
  '50k_100k': 75000,
  '100k_200k': 150000,
  '200k_500k': 350000,
  '500k_plus': 750000,
};

const CREDIT_BAND_DISTRIBUTION_BY_INCOME = {
  under_50k: { poor: 0.50, fair: 0.30, good: 0.15, very_good: 0.05, excellent: 0.00 },
  '50k_100k': { poor: 0.20, fair: 0.30, good: 0.30, very_good: 0.20, excellent: 0.00 },
  '100k_200k': { poor: 0.05, fair: 0.20, good: 0.35, very_good: 0.30, excellent: 0.10 },
  '200k_500k': { poor: 0.02, fair: 0.10, good: 0.28, very_good: 0.40, excellent: 0.20 },
  '500k_plus': { poor: 0.01, fair: 0.05, good: 0.14, very_good: 0.30, excellent: 0.50 },
};

const ACCOUNT_CARDS_RANGE_BY_CREDIT_BAND = {
  poor: { min: 0, max: 1 },
  fair: { min: 1, max: 3 },
  good: { min: 2, max: 5 },
  very_good: { min: 3, max: 7 },
  excellent: { min: 3, max: 7 },
};

const EMPLOYMENT_TO_OOTB = {
  employed: 'Employed',
  self_employed: 'Self-Employed',
  contract: 'Contract',
  student: 'Student',
  retired: 'Retired',
  unemployed: 'Unemployed',
};

const TAX_BRACKET_BY_INCOME = {
  under_50k: '12%',
  '50k_100k': '22%',
  '100k_200k': '24%',
  '200k_500k': '32%',
  '500k_plus': '37%',
};

const EMPLOYMENT_BIAS_BY_LIFE_STAGE = {
  student: ['student', 'unemployed', 'contract'],
  young_professional: ['employed', 'employed', 'employed', 'contract'],
  family: ['employed', 'employed', 'self_employed', 'contract'],
  pre_retirement: ['employed', 'self_employed', 'retired'],
};

const INCOME_BANDS = Object.keys(CREDIT_BAND_DISTRIBUTION_BY_INCOME);
const LIFE_STAGES = ['student', 'young_professional', 'family', 'pre_retirement', 'retired'];
const PRIMARY_BANKING = ['branch', 'mobile', 'online', 'phone'];
const CREDIT_BUREAU_POOL = ['Equifax', 'Experian', 'TransUnion', 'FICO'];
const EMPLOYER_POOL = [
  'Adobe', 'Apple', 'JPMorgan', 'HSBC', 'Barclays', 'Goldman Sachs',
  'Wells Fargo', 'Citi', 'Lloyds', 'Santander',
];
const OCCUPATION_POOL = [
  'Software engineer', 'Product manager', 'Doctor', 'Lawyer', 'Accountant',
  'Financial analyst', 'Consultant', 'Operations manager', 'Data scientist',
];

function creditBandRange(creditBand) {
  switch (creditBand) {
    case 'poor': return { min: 300, max: 579 };
    case 'fair': return { min: 580, max: 669 };
    case 'good': return { min: 670, max: 739 };
    case 'very_good': return { min: 740, max: 799 };
    case 'excellent': return { min: 800, max: 850 };
    default: return { min: 600, max: 800 };
  }
}

function pickCreditBandForIncome(incomeBand) {
  const dist = CREDIT_BAND_DISTRIBUTION_BY_INCOME[incomeBand];
  if (!dist) return 'good';
  return weightedPick(dist) || 'good';
}

function pickEmploymentForLifeStage(lifeStage) {
  if (lifeStage === 'retired') return 'retired';
  const pool = EMPLOYMENT_BIAS_BY_LIFE_STAGE[lifeStage] || ['employed', 'contract'];
  return randomPick(pool);
}

function assignTaxFilingStatus(attrs) {
  const filingPick = Math.random();
  if (filingPick < 0.50) {
    assign(attrs, 'personalFinances.personalTaxProfile.filingJointly', true);
  } else if (filingPick < 0.65) {
    assign(attrs, 'personalFinances.personalTaxProfile.filingSeparately', true);
  } else {
    assign(attrs, 'personalFinances.personalTaxProfile.singleFiler', true);
  }
}

/**
 * Portal-equivalent FSI persona — only paths streamed by profile-generation-fsi.js buildUpdates.
 * @returns {Record<string, unknown>}
 */
export function buildFsiPersonaAttributes() {
  const attrs = {};
  const incomeBand = randomPick(INCOME_BANDS);
  const creditBand = pickCreditBandForIncome(incomeBand);
  const lifeStage = randomPick(LIFE_STAGES);
  const employment = pickEmploymentForLifeStage(lifeStage);
  const bandRange = creditBandRange(creditBand);
  const bandMid = Math.round((bandRange.min + bandRange.max) / 2);
  const creditScore = randomBellBetween(bandRange.min, bandRange.max, bandMid);
  const cardsRange = ACCOUNT_CARDS_RANGE_BY_CREDIT_BAND[creditBand] || { min: 1, max: 5 };
  const accountCardsTotal = randomBellBetween(
    cardsRange.min,
    cardsRange.max,
    Math.round((cardsRange.min + cardsRange.max) / 2),
  );
  const incomeAmount = HOUSEHOLD_INCOME_BAND_MIDPOINT[incomeBand] || randomBetween(35000, 250000);

  assign(attrs, 'industryFsi.householdIncomeBand', incomeBand);
  assign(attrs, 'industryFsi.creditScoreBand', creditBand);
  assign(attrs, 'industryFsi.lifeStage', lifeStage);
  assign(attrs, 'industryFsi.employment', employment);
  assign(attrs, 'industryFsi.primaryBankingChannel', randomPick(PRIMARY_BANKING));

  assign(attrs, 'individualCharacteristics.core.creditScore', creditScore);
  assign(attrs, 'individualCharacteristics.core.employer', randomPick(EMPLOYER_POOL));
  assign(attrs, 'individualCharacteristics.core.occupation', randomPick(OCCUPATION_POOL));

  assign(attrs, 'personalFinances.employmentStatus', EMPLOYMENT_TO_OOTB[employment] || 'Employed');
  assign(attrs, 'personalFinances.personalTaxProfile.householdIncome.amount', incomeAmount);
  assign(attrs, 'personalFinances.personalTaxProfile.householdIncome.currencyCode', 'USD');
  assign(attrs, 'personalFinances.personalTaxProfile.taxBracket', TAX_BRACKET_BY_INCOME[incomeBand] || '22%');
  assign(attrs, 'personalFinances.personalTaxProfile.isHeadOfHousehold', weightedBool(0.5));
  assign(attrs, 'personalFinances.accountCardsTotal', accountCardsTotal);
  assign(attrs, 'personalFinances.hasAssignedBeneficiary', weightedBool(0.55));
  assign(attrs, 'personalFinances.creditScores', [{
    score: creditScore,
    provider: randomPick(CREDIT_BUREAU_POOL),
    scoreDate: `${isoDateAgo(randomBetween(1, 90))}T00:00:00Z`,
  }]);

  assignTaxFilingStatus(attrs);

  assign(attrs, 'industryFsi.financialProducts.checking', weightedBool(0.95));
  assign(attrs, 'industryFsi.financialProducts.savings', weightedBool(0.85));
  assign(attrs, 'industryFsi.financialProducts.creditCard', weightedBool(0.55));
  assign(attrs, 'industryFsi.financialProducts.mortgage', weightedBool(0.30));
  assign(attrs, 'industryFsi.financialProducts.investment', weightedBool(
    incomeBand === '500k_plus' || incomeBand === '200k_500k' ? 0.65 : 0.30,
  ));
  assign(attrs, 'industryFsi.financialProducts.loan', weightedBool(0.25));

  return attrs;
}

export { CREDIT_SCORE_BAND_MIDPOINT, HOUSEHOLD_INCOME_BAND_MIDPOINT, pickCreditBandForIncome };
