/**
 * Profile Generation – create AEP profiles by industry (Retail, FSI, Travel, Media, Sports, Public, …).
 * Email format: kirkham+<industry>-<x>@adobetest.com
 */

const sandboxSelect = document.getElementById('sandboxSelect');
const industrySelect = document.getElementById('industry');
const profileIndexInput = document.getElementById('profileIndex');
const emailDisplay = document.getElementById('emailDisplay');
const generateBtn = document.getElementById('generateBtn');
const generateMessage = document.getElementById('generateMessage');

const INDUSTRY_GROUPS = {
  retail: 'industryRetail',
  fsi: 'industryFsi',
  travel: 'industryTravel',
  media: 'industryMedia',
  sports: 'industrySports',
  telecommunications: 'industryTelecommunications',
  public: 'industryPublic',
};

function setMessage(el, text, type) {
  if (!el) return;
  el.textContent = text;
  el.className = 'consent-message' + (type ? ' ' + type : '');
  el.hidden = !text;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/** Yes/No select: undefined if unset, else boolean */
function triBool(id) {
  const x = document.getElementById(id)?.value;
  if (x === '') return undefined;
  return x === 'true';
}

function parseNumInput(id) {
  const el = document.getElementById(id);
  if (!el || el.value === '') return null;
  const n = parseFloat(el.value);
  return Number.isNaN(n) ? null : n;
}

function setInput(id, value) {
  const el = document.getElementById(id);
  if (el && !el.readOnly) el.value = value == null ? '' : String(value);
}

/** Random non-placeholder <option> on a select (skips empty value). */
function randomSelectOption(selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const opts = Array.from(sel.options).filter((o) => o.value !== '' && !o.disabled);
  if (opts.length === 0) return;
  sel.value = pick(opts).value;
}

const RANDOM_INDUSTRY_OPTIONS = ['retail', 'fsi', 'travel', 'media', 'sports', 'telecommunications', 'public'];

/**
 * ISO 8601 calendar date YYYY-MM-DD (local). XDM `date` / Operational Profile samples expect this, not YYYY-DD-MM.
 */
function formatLocalYyyyMmDd(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Normalize omnichannel donationDate to YYYY-MM-DD. Accepts ISO; if middle segment > 12, treats input as legacy YYYY-DD-MM and converts.
 */
function normalizeOmnichannelDonationDate(raw) {
  const s = (raw || '').trim();
  if (!s) return formatLocalYyyyMmDd(new Date());
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return s;
  const [, y, a, b] = m;
  const na = parseInt(a, 10);
  if (na > 12) {
    return `${y}-${b}-${a}`;
  }
  return `${y}-${a}-${b}`;
}

/** Fill personal, location, phone, and industry fields with plausible random values. */
function fillRandomSampleData() {
  let industry = (industrySelect?.value || '').trim().toLowerCase();
  const customEmail = (emailDisplay?.value || '').trim();
  // Do not auto-pick an industry when the user already typed a custom email (no industry selected).
  if (!industry && !customEmail) {
    industry = pick(RANDOM_INDUSTRY_OPTIONS);
    if (industrySelect) industrySelect.value = industry;
  }
  showIndustryFields(industry);

  setInput('profileIndex', String(randomInt(1, 99)));
  syncEmailFieldEditability();
  updateEmailDisplay();

  const firstNames = ['Alex', 'Jordan', 'Sam', 'Riley', 'Casey', 'Morgan', 'Taylor', 'Quinn', 'Jamie', 'Drew'];
  const lastNames = ['Smith', 'Jones', 'Garcia', 'Miller', 'Davis', 'Wilson', 'Brown', 'Moore', 'Taylor', 'Lee'];
  setInput('firstName', pick(firstNames));
  setInput('lastName', pick(lastNames));
  setInput('age', String(randomInt(22, 72)));

  const streets = ['123 Maple Ave', '456 Oak Street', '789 Pine Rd', '42 Cedar Ln', '900 Bay Blvd'];
  const cities = ['San Jose', 'Austin', 'Portland', 'Denver', 'Seattle', 'Boston', 'Chicago', 'Atlanta'];
  const states = ['CA', 'TX', 'OR', 'CO', 'WA', 'MA', 'IL', 'GA'];
  setInput('streetAddress', pick(streets));
  setInput('city', pick(cities));
  setInput('state', pick(states));
  setInput('postalCode', String(randomInt(10000, 99999)));
  setInput('country', pick(['US', 'GB', 'CA']));

  setInput('phoneCountryCode', '1');
  setInput('phoneNumber', String(randomInt(2000000000, 9999999999)));

  setInput('scoringPropensityScore', String(randomInt(15, 92)));
  setInput('scoringChurnPrediction', pick(['low', 'medium', 'high', '0.08', '0.22', '0.41']));

  switch (industry) {
    case 'retail':
      setInput('retailFavoriteColor', pick(['navy', 'teal', 'burgundy', 'ivory', 'charcoal']));
      setInput('retailFavoriteStore', pick(['Nordstrom', 'Target', 'REI', 'Whole Foods', 'Sephora']));
      setInput('retailFavoriteDesigner', pick(['Patagonia', 'Allbirds', 'Levi\'s', 'Nike']));
      setInput('retailFavoriteFashionBrand', pick(['Zara', 'Uniqlo', 'COS', 'Arket']));
      setInput('retailLinkedStores', `${pick(['Nordstrom Downtown', 'Target Uptown', 'REI Flagship'])}, ${pick(['Whole Foods', 'Sephora', 'Apple Store'])}`);
      randomSelectOption('retailCobrandedCard');
      randomSelectOption('retailShirtSize');
      setInput('retailPantsSize', String(randomInt(28, 38)));
      setInput('retailShoeSize', String(randomInt(7, 13)));
      break;
    case 'fsi':
      randomSelectOption('fsiCurrentTier');
      randomSelectOption('fsiCreditClassification');
      setInput('fsiProductInterest', pick(['mortgages', 'credit cards', 'wealth management', 'auto loans', 'HELOC']));
      randomSelectOption('fsiCheckingAcct');
      randomSelectOption('fsiSavingsAcct');
      setInput('fsiFinancialAdvisorTop', pick(['Jordan Lee', 'Alex Morgan', 'Sam Rivera']));
      setInput('fsiLinkedBranchTop', pick(['Downtown', 'Westside', 'Airport']));
      randomSelectOption('fsiHasAssignedBeneficiaryTop');
      setInput('fsiAssignedBeneficiary', `Beneficiary ${randomInt(1, 99)}, Spouse ${randomInt(1, 9)}`);
      setInput('fsiPolicyType', pick(['Term Life', 'Whole Life', 'Disability']) + ', ' + pick(['Auto', 'Home']));
      setInput('fsiWatchList', pick(['rate-alert', 'promo-eligible', 'high-value']));
      setInput('fsiCsat', String(randomInt(70, 99)));
      {
        const yy = new Date().getFullYear() - randomInt(1, 5);
        const mm = String(randomInt(1, 12)).padStart(2, '0');
        const dd = String(randomInt(1, 28)).padStart(2, '0');
        setInput('fsiMembershipStartDate', `${yy}-${mm}-${dd}`);
      }
      setInput('fsiCrFinancialAdvisor', pick(['Jordan Lee', 'Alex Morgan']));
      setInput('fsiFinancialAdvisorID', `FA-${randomInt(10000, 99999)}`);
      randomSelectOption('fsiCrHasAssignedBeneficiary');
      setInput('fsiCrLinkedBranch', pick(['Main', 'Uptown']));
      setInput('fsiBalanceCheckingTotal', String(randomInt(2000, 25000)));
      setInput('fsiBalanceCreditCardsTotal', String(randomInt(0, 8000)));
      setInput('fsiBalanceSavingsTotal', String(randomInt(5000, 80000)));
      setInput('fsiCreditScore', String(randomInt(620, 820)));
      setInput('fsiHouseholdIncome', String(randomInt(50000, 250000)));
      setInput('fsiNetWorth', String(randomInt(100000, 2000000)));
      setInput('fsiEmploymentStatus', pick(['employed', 'self-employed', 'retired']));
      setInput('fsiIncomeClassification', pick(['middle', 'upper', 'high']));
      setInput('fsiNetWorthClassification', pick(['mass affluent', 'high net worth']));
      setInput('fsiInvestingStyle', pick(['conservative', 'moderate', 'growth']));
      setInput('fsiCheckingType', pick(['standard', 'high-yield']));
      setInput('fsiCreditCardType', pick(['rewards', 'cashback', 'travel']));
      setInput('fsiSavingsType', pick(['money market', 'passbook']));
      randomSelectOption('fsiMortgageHolder');
      randomSelectOption('fsiHeloc');
      randomSelectOption('fsiLoansAcct');
      randomSelectOption('fsiCreditcardAcct');
      randomSelectOption('fsiInvestmentAcct');
      randomSelectOption('fsiInsuranceAcct');
      break;
    case 'travel':
      setInput('travelFavouriteAirline', pick(['Emirates', 'Delta', 'United', 'Lufthansa', 'Qantas']));
      randomSelectOption('travelPrimaryTravelClass');
      randomSelectOption('travelPrimaryTravelerType');
      randomSelectOption('travelPrimaryTripPurpose');
      setInput('travelAvgDaysBooking', String(randomInt(7, 90)));
      setInput('travelAvgTripLength', String(randomInt(2, 14)));
      setInput('travelLastTravelCode', `TRV-${randomInt(1000, 9999)}`);
      setInput('travelPropertyClassAffinity', pick(['luxury', 'resort', 'boutique']));
      randomSelectOption('travelCobrandedCard');
      setInput('travelPillowType', pick(['firm', 'soft', 'hypoallergenic']));
      randomSelectOption('travelHearingAccessible');
      randomSelectOption('travelMobilityAccessible');
      randomSelectOption('travelHighFloor');
      randomSelectOption('travelLateCheckOut');
      randomSelectOption('travelNearElevator');
      setInput('travelRecentHotelName', pick(['Grand Plaza', 'Ocean View', 'City Central']));
      setInput('travelRecentHotelRoomType', pick(['King', 'Suite', 'Double']));
      setInput('travelRecentHotelClass', pick(['4-star', '5-star']));
      setInput('travelRecentHotelLengthDays', String(randomInt(2, 10)));
      setInput('travelRecentAmountDailyAvg', String(randomInt(150, 450)));
      setInput('travelRecentAmountTotal', String(randomInt(800, 4000)));
      break;
    case 'media':
      randomSelectOption('mediaAccountType');
      randomSelectOption('mediaContractStatus');
      setInput('mediaAccountData', pick(['bundle-gold', 'lineup-premier', 'account-ref-' + randomInt(1000, 9999)]));
      setInput('mediaAccountDetails', pick(['HD DVR', 'Streaming add-on', 'Family plan']));
      setInput('mediaDebtStatus', pick(['current', 'good standing']));
      setInput('mediaProductHolding', pick(['Internet + TV', 'Mobile + broadband']));
      setInput('mediaServiceRAGStatus', pick(['green', 'amber']));
      setInput('mediaPackages', pick(['Entertainment', 'Sports', 'Movies']) + ', ' + pick(['News', 'Kids']));
      setInput('mediaChannel', pick(['Web', 'OTT', 'App', 'Cable', 'Satellite']));
      setInput('mediaViewingHours', String(randomInt(5, 40)));
      break;
    case 'sports':
      setInput('sportsFavouriteTeam', pick(['Arsenal', 'Lakers', 'Yankees', 'Patriots', 'Storm']));
      setInput('sportsPtSession', pick(['weekly', 'biweekly', 'monthly', 'none']));
      break;
    case 'telecommunications':
      setInput('telecomBundleName', pick(['Home Plus', 'Premium Bundle', 'Starter Pack', 'Family Max']));
      setInput('telecomPrimaryPartyID', `party-${randomInt(10000, 99999)}`);
      randomSelectOption('telecomConnectionType');
      setInput('telecomDataCap', String(pick([0, 100, 500, 1000])));
      setInput('telecomDownloadSpeed', String(randomInt(50, 1000)));
      setInput('telecomUploadSpeed', String(randomInt(10, 500)));
      randomSelectOption('telecomSelfSetup');
      setInput('telecomInternetPlanName', pick(['Gigabit Pro', 'Fiber 500', 'Basic Internet']));
      setInput('telecomLandlineMinutes', String(randomInt(100, 2000)));
      randomSelectOption('telecomCallBlocking');
      randomSelectOption('telecomCallForwarding');
      randomSelectOption('telecomVoicemail');
      setInput('telecomLandlinePlanName', pick(['Basic Landline', 'Home Phone Plus']));
      setInput('telecomChannels', String(randomInt(50, 300)));
      setInput('telecomStreamingService', pick(['Netflix', 'HBO Max', 'Disney+', 'Peacock']));
      setInput('telecomMediaPlanName', pick(['Entertainment Plus', 'TV Max']));
      setInput('telecomPlanLevel', pick(['Premium', 'Standard', 'Basic']));
      randomSelectOption('telecomEarlyUpgradeEnrollment');
      randomSelectOption('telecomPortedNumber');
      setInput('telecomMobilePlanName', pick(['Unlimited Plus', '5G Essential']));
      break;
    case 'public':
      setInput('publicDonatedAmount', String(randomInt(25, 500)));
      setInput('publicDonationDate', formatLocalYyyyMmDd(new Date()));
      setInput(
        'publicEventRegistered',
        pick(['Race for Life London', 'Race for Life 5k', 'Shine Night Walk', 'Dryathlon']),
      );
      break;
    default:
      break;
  }

  setInput('loyaltyProgram', pick(['Rewards Plus', 'Premier Club', 'Member One']));
  setInput('loyaltyTier', pick(['Gold', 'Silver', 'Platinum', 'Bronze']));
  setInput('loyaltyStatus', 'active');
  setInput('loyaltyID', `LYL-${randomInt(10000, 99999)}`);
  setInput('loyaltyPoints', String(randomInt(1000, 50000)));
  setInput('loyaltyLifetimePoints', String(randomInt(5000, 80000)));
  setInput('loyaltyAdjustedPoints', String(randomInt(-500, 2000)));
  setInput('loyaltyExpiredPoints', String(randomInt(0, 3000)));
  setInput('loyaltyReturnedPoints', String(randomInt(0, 1500)));
  setInput('loyaltyPromisedPoints', String(randomInt(0, 5000)));
  setInput('loyaltyPointsRedeemed', String(randomInt(0, 25000)));
  setInput('loyaltyLifetimePurchases', String(randomInt(1000, 50000)));
  const y = new Date().getFullYear();
  const m = String(randomInt(1, 12)).padStart(2, '0');
  const day = String(randomInt(1, 28)).padStart(2, '0');
  setInput('loyaltyJoinDate', `${y - 1}-${m}-${day}`);
  setInput('loyaltyTierExpiryDate', `${y + 1}-${m}-${day}`);
  setInput('loyaltyUpgradeDate', `${y}-${m}-${day}`);
  setInput('loyaltyPointsExpirationDate', `${y}-${String(randomInt(1, 12)).padStart(2, '0')}-01`);
  setInput('loyaltyPointsExpiring', String(randomInt(100, 8000)));
  setInput('loyaltyCardNumber', String(randomInt(1000000000000000, 9999999999999999)));
  setInput('loyaltyCardSeries', pick(['Classic', 'Signature', 'Elite']));
  setInput('loyaltyCardStatus', 'active');
  setInput('loyaltyDetailsLevel', pick(['Gold', 'Silver', 'Member']));
  setInput('loyaltyDetailsPoints', String(randomInt(500, 25000)));
}

/** yyyy-mm-dd from date input → ISO-8601 for XDM date-times */
function loyaltyDateToIso(value) {
  if (!value || !String(value).trim()) return null;
  const d = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  return new Date(`${d}T12:00:00.000Z`).toISOString();
}

/** Root <code>loyalty.*</code> plus tenant <code>loyaltyDetails.*</code> (mapped under <code>_demoemea</code> on the wire). */
function getLoyaltyAttributes() {
  const attrs = {};
  const v = (id) => (document.getElementById(id)?.value || '').trim();
  const num = (id) => {
    const el = document.getElementById(id);
    if (!el || el.value === '') return null;
    const n = parseFloat(el.value);
    return Number.isNaN(n) ? null : n;
  };

  if (v('loyaltyProgram')) attrs['loyalty.program'] = v('loyaltyProgram');
  if (v('loyaltyTier')) attrs['loyalty.tier'] = v('loyaltyTier');
  if (v('loyaltyStatus')) attrs['loyalty.status'] = v('loyaltyStatus');
  const lid = v('loyaltyID');
  if (lid) {
    const first = lid
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)[0];
    if (first) attrs['_demoemea.identification.core.loyaltyId'] = first;
  }

  const addNum = (id, path) => {
    const n = num(id);
    if (n != null) attrs[path] = n;
  };
  addNum('loyaltyPoints', 'loyalty.points');
  addNum('loyaltyLifetimePoints', 'loyalty.lifetimePoints');
  addNum('loyaltyAdjustedPoints', 'loyalty.adjustedPoints');
  addNum('loyaltyExpiredPoints', 'loyalty.expiredPoints');
  addNum('loyaltyReturnedPoints', 'loyalty.returnedPoints');
  addNum('loyaltyPromisedPoints', 'loyalty.promisedPoints');
  addNum('loyaltyPointsRedeemed', 'loyalty.pointsRedeemed');
  addNum('loyaltyLifetimePurchases', 'loyalty.lifetimePurchases');

  const joinIso = loyaltyDateToIso(document.getElementById('loyaltyJoinDate')?.value);
  if (joinIso) attrs['loyalty.joinDate'] = joinIso;
  const tierExpIso = loyaltyDateToIso(document.getElementById('loyaltyTierExpiryDate')?.value);
  if (tierExpIso) attrs['loyalty.tierExpiryDate'] = tierExpIso;
  if (v('loyaltyUpgradeDate')) attrs['loyalty.upgradeDate'] = v('loyaltyUpgradeDate');

  const peDate = loyaltyDateToIso(document.getElementById('loyaltyPointsExpirationDate')?.value);
  const peAmt = num('loyaltyPointsExpiring');
  if (peDate || peAmt != null) {
    attrs['loyalty.pointsExpiration'] = [{
      ...(peDate && { pointsExpirationDate: peDate }),
      ...(peAmt != null && { pointsExpiring: peAmt }),
    }];
  }

  const cn = v('loyaltyCardNumber');
  const cs = v('loyaltyCardSeries');
  const cst = v('loyaltyCardStatus');
  if (cn || cs || cst) {
    attrs['loyalty.cardsDetails'] = [{
      ...(cn && { number: cn }),
      ...(cs && { series: cs }),
      ...(cst && { status: cst }),
    }];
  }

  if (v('loyaltyDetailsLevel')) attrs['loyaltyDetails.level'] = v('loyaltyDetailsLevel');
  const ldPts = num('loyaltyDetailsPoints');
  if (ldPts != null) attrs['loyaltyDetails.points'] = ldPts;

  return attrs;
}

/** Tenant <code>_demoemea.scoring.core.propensityScore</code> and <code>_demoemea.scoring.churn.churnPrediction</code>. */
function getScoringAttributes() {
  const attrs = {};
  const score = parseNumInput('scoringPropensityScore');
  if (score != null) attrs['scoring.core.propensityScore'] = score;
  const churn = (document.getElementById('scoringChurnPrediction')?.value || '').trim();
  if (churn) attrs['scoring.churn.churnPrediction'] = churn;
  return attrs;
}

function getEmail() {
  const industry = (industrySelect?.value || '').trim().toLowerCase();
  const x = parseInt(profileIndexInput?.value || '1', 10) || 1;
  if (!industry) return (emailDisplay?.value || '').trim();
  return `kirkham+${industry}-${x}@adobetest.com`;
}

/** Read-only + auto pattern when an industry is chosen; free text when "-- Select industry --". */
function syncEmailFieldEditability() {
  if (!emailDisplay) return;
  const industry = (industrySelect?.value || '').trim().toLowerCase();
  if (industry) {
    emailDisplay.readOnly = true;
    emailDisplay.setAttribute('readonly', 'readonly');
  } else {
    emailDisplay.readOnly = false;
    emailDisplay.removeAttribute('readonly');
  }
}

function updateEmailDisplay() {
  if (!emailDisplay) return;
  const industry = (industrySelect?.value || '').trim().toLowerCase();
  if (!industry) return;
  const x = parseInt(profileIndexInput?.value || '1', 10) || 1;
  emailDisplay.value = `kirkham+${industry}-${x}@adobetest.com`;
}

function showIndustryFields(industry) {
  const groups = document.querySelectorAll('.industry-field-group');
  groups.forEach((g) => { g.hidden = true; });
  const placeholder = document.getElementById('industryPlaceholder');
  const id = industry ? INDUSTRY_GROUPS[industry] : null;
  if (id) {
    const el = document.getElementById(id);
    if (el) el.hidden = false;
    if (placeholder) placeholder.hidden = true;
  } else {
    if (placeholder) placeholder.hidden = false;
  }
}

function getIndustryAttributes(industry) {
  const attrs = {};
  if (!industry) return attrs;

  if (industry === 'retail') {
    const v = (id) => (document.getElementById(id)?.value || '').trim();
    /* _demoemea.individualCharacteristics.retail (operational-profile-schema-sample.json) */
    if (v('retailFavoriteColor')) attrs['individualCharacteristics.retail.favoriteColor'] = v('retailFavoriteColor');
    if (v('retailFavoriteStore')) attrs['individualCharacteristics.retail.favoriteStore'] = v('retailFavoriteStore');
    if (v('retailFavoriteDesigner')) attrs['individualCharacteristics.retail.favoriteDesigner'] = v('retailFavoriteDesigner');
    if (v('retailFavoriteFashionBrand')) attrs['individualCharacteristics.retail.favoriteFashionBrand'] = v('retailFavoriteFashionBrand');
    const linkedRaw = v('retailLinkedStores');
    if (linkedRaw) {
      const stores = linkedRaw.split(',').map((s) => s.trim()).filter(Boolean);
      if (stores.length) attrs['individualCharacteristics.retail.linkedStore'] = stores;
    }
    const cobranded = document.getElementById('retailCobrandedCard')?.value;
    if (cobranded === 'true') attrs['individualCharacteristics.retail.cobrandedCreditCardHolder'] = true;
    if (cobranded === 'false') attrs['individualCharacteristics.retail.cobrandedCreditCardHolder'] = false;
    if (v('retailShirtSize')) attrs['individualCharacteristics.retail.shirtSize'] = v('retailShirtSize');
    if (v('retailPantsSize')) attrs['individualCharacteristics.retail.pantsSize'] = v('retailPantsSize');
    if (v('retailShoeSize')) attrs['individualCharacteristics.retail.shoeSize'] = v('retailShoeSize');
  } else if (industry === 'fsi') {
    const v = (id) => (document.getElementById(id)?.value || '').trim();
    const p = 'individualCharacteristics.fsi';
    if (v('fsiCurrentTier')) attrs[`${p}.customerRelationship.currentTier`] = v('fsiCurrentTier');
    if (v('fsiCreditClassification')) attrs[`${p}.financialDetails.creditClassification`] = v('fsiCreditClassification');
    if (v('fsiProductInterest')) attrs[`${p}.financialDetails.customerBehavior.productInterest`] = v('fsiProductInterest');
    if (v('fsiInvestingStyle')) attrs[`${p}.financialDetails.customerBehavior.investingStyle`] = v('fsiInvestingStyle');
    const chk = triBool('fsiCheckingAcct');
    if (chk !== undefined) attrs[`${p}.productOverview.checkingAcct`] = chk;
    const sav = triBool('fsiSavingsAcct');
    if (sav !== undefined) attrs[`${p}.productOverview.savingsAcct`] = sav;
    const mtg = triBool('fsiMortgageHolder');
    if (mtg !== undefined) attrs[`${p}.productOverview.mortgageHolder`] = mtg;
    const hel = triBool('fsiHeloc');
    if (hel !== undefined) attrs[`${p}.productOverview.heloc`] = hel;
    const loan = triBool('fsiLoansAcct');
    if (loan !== undefined) attrs[`${p}.productOverview.loansAcct`] = loan;
    const cc = triBool('fsiCreditcardAcct');
    if (cc !== undefined) attrs[`${p}.productOverview.creditcardAcct`] = cc;
    const inv = triBool('fsiInvestmentAcct');
    if (inv !== undefined) attrs[`${p}.productOverview.investmentAcct`] = inv;
    const ins = triBool('fsiInsuranceAcct');
    if (ins !== undefined) attrs[`${p}.productOverview.insuranceAcct`] = ins;
    if (v('fsiCheckingType')) attrs[`${p}.productOverview.checkingType`] = v('fsiCheckingType');
    if (v('fsiCreditCardType')) attrs[`${p}.productOverview.creditCardType`] = v('fsiCreditCardType');
    if (v('fsiSavingsType')) attrs[`${p}.productOverview.savingsType`] = v('fsiSavingsType');
    if (v('fsiFinancialAdvisorTop')) attrs[`${p}.financialAdvisor`] = v('fsiFinancialAdvisorTop');
    if (v('fsiLinkedBranchTop')) attrs[`${p}.linkedBranch`] = v('fsiLinkedBranchTop');
    const hat = triBool('fsiHasAssignedBeneficiaryTop');
    if (hat !== undefined) attrs[`${p}.hasAssignedBeneficiary`] = hat;
    const ab = v('fsiAssignedBeneficiary');
    if (ab) {
      const list = ab.split(',').map((s) => s.trim()).filter(Boolean);
      if (list.length) attrs[`${p}.assignedBeneficiary`] = list;
    }
    const pol = v('fsiPolicyType');
    if (pol) {
      const list = pol.split(',').map((s) => s.trim()).filter(Boolean);
      if (list.length) attrs[`${p}.policyType`] = list;
    }
    const wl = v('fsiWatchList');
    if (wl) {
      const list = wl.split(',').map((s) => s.trim()).filter(Boolean);
      if (list.length) attrs[`${p}.watchList`] = list;
    }
    const csat = parseNumInput('fsiCsat');
    if (csat != null) attrs[`${p}.customerRelationship.csat`] = csat;
    if (v('fsiMembershipStartDate')) attrs[`${p}.customerRelationship.membershipStartDate`] = v('fsiMembershipStartDate');
    if (v('fsiCrFinancialAdvisor')) attrs[`${p}.customerRelationship.financialAdvisor`] = v('fsiCrFinancialAdvisor');
    if (v('fsiFinancialAdvisorID')) attrs[`${p}.customerRelationship.financialAdvisorID`] = v('fsiFinancialAdvisorID');
    const hacb = triBool('fsiCrHasAssignedBeneficiary');
    if (hacb !== undefined) attrs[`${p}.customerRelationship.hasAssignedBeneficiary`] = hacb;
    if (v('fsiCrLinkedBranch')) attrs[`${p}.customerRelationship.linkedBranch`] = v('fsiCrLinkedBranch');
    const b1 = parseNumInput('fsiBalanceCheckingTotal');
    const b2 = parseNumInput('fsiBalanceCreditCardsTotal');
    const b3 = parseNumInput('fsiBalanceSavingsTotal');
    if (b1 != null || b2 != null || b3 != null) {
      attrs[`${p}.financialDetails.balance`] = {
        ...(b1 != null && { checkingTotal: b1 }),
        ...(b2 != null && { creditCardsTotal: b2 }),
        ...(b3 != null && { savingsTotal: b3 }),
      };
    }
    const fcs = parseNumInput('fsiCreditScore');
    if (fcs != null) attrs[`${p}.financialDetails.creditScore`] = fcs;
    const hhi = parseNumInput('fsiHouseholdIncome');
    if (hhi != null) attrs[`${p}.financialDetails.householdIncome`] = hhi;
    const nw = parseNumInput('fsiNetWorth');
    if (nw != null) attrs[`${p}.financialDetails.netWorth`] = nw;
    if (v('fsiEmploymentStatus')) attrs[`${p}.financialDetails.employmentStatus`] = v('fsiEmploymentStatus');
    if (v('fsiIncomeClassification')) attrs[`${p}.financialDetails.incomeClassification`] = v('fsiIncomeClassification');
    if (v('fsiNetWorthClassification')) attrs[`${p}.financialDetails.netWorthClassification`] = v('fsiNetWorthClassification');
  } else if (industry === 'travel') {
    const v = (id) => (document.getElementById(id)?.value || '').trim();
    const tp = 'individualCharacteristics.travel';
    if (v('travelFavouriteAirline')) attrs[`${tp}.favouriteAirlineCompany`] = v('travelFavouriteAirline');
    if (v('travelPrimaryTravelClass')) attrs[`${tp}.primaryTravelClass`] = v('travelPrimaryTravelClass');
    if (v('travelPrimaryTravelerType')) attrs[`${tp}.primaryTravelerType`] = v('travelPrimaryTravelerType');
    if (v('travelPrimaryTripPurpose')) attrs[`${tp}.primaryTripPurpose`] = v('travelPrimaryTripPurpose');
    if (v('travelLastTravelCode')) attrs[`${tp}.lastTravelCode`] = v('travelLastTravelCode');
    if (v('travelPropertyClassAffinity')) attrs[`${tp}.propertyClassAffinity`] = v('travelPropertyClassAffinity');
    const days = parseInt(document.getElementById('travelAvgDaysBooking')?.value || '', 10);
    if (!isNaN(days)) attrs[`${tp}.avgDaysBookingBeforeTrip`] = days;
    const tripLen = parseNumInput('travelAvgTripLength');
    if (tripLen != null) attrs[`${tp}.avgTripLength`] = tripLen;
    const tcc = triBool('travelCobrandedCard');
    if (tcc !== undefined) attrs[`${tp}.cobrandedCreditCardHolder`] = tcc;
    const hotelRoom = {};
    if (v('travelPillowType')) hotelRoom.pillowType = v('travelPillowType');
    const ha = triBool('travelHearingAccessible');
    if (ha !== undefined) hotelRoom.hearingAccessible = ha;
    const ma = triBool('travelMobilityAccessible');
    if (ma !== undefined) hotelRoom.mobilityAccessible = ma;
    const stay = {};
    const hf = triBool('travelHighFloor');
    if (hf !== undefined) stay.highFloor = hf;
    const lc = triBool('travelLateCheckOut');
    if (lc !== undefined) stay.lateCheckOut = lc;
    const ne = triBool('travelNearElevator');
    if (ne !== undefined) stay.nearElevator = ne;
    if (Object.keys(hotelRoom).length || Object.keys(stay).length) {
      attrs[`${tp}.preferences`] = { hotel: {} };
      if (Object.keys(hotelRoom).length) attrs[`${tp}.preferences`].hotel.hotelRoomPreference = hotelRoom;
      if (Object.keys(stay).length) attrs[`${tp}.preferences`].hotel.stayPreference = stay;
    }
    const rs = {};
    if (v('travelRecentHotelName')) rs.hotelName = v('travelRecentHotelName');
    if (v('travelRecentHotelRoomType')) rs.hotelRoomType = v('travelRecentHotelRoomType');
    if (v('travelRecentHotelClass')) rs.hotelClass = v('travelRecentHotelClass');
    const rld = parseNumInput('travelRecentHotelLengthDays');
    if (rld != null) rs.hotelLengthDays = rld;
    const ada = parseNumInput('travelRecentAmountDailyAvg');
    if (ada != null) rs.amountDailyAvg = ada;
    const at = parseNumInput('travelRecentAmountTotal');
    if (at != null) rs.amountTotal = at;
    if (Object.keys(rs).length) attrs[`${tp}.recentStay`] = rs;
  } else if (industry === 'media') {
    const v = (id) => (document.getElementById(id)?.value || '').trim();
    if (v('mediaAccountType')) attrs['media.accountType'] = v('mediaAccountType');
    if (v('mediaContractStatus')) attrs['media.contractStatus'] = v('mediaContractStatus');
    if (v('mediaAccountData')) attrs['media.accountData'] = v('mediaAccountData');
    if (v('mediaAccountDetails')) attrs['media.accountDetails'] = v('mediaAccountDetails');
    if (v('mediaDebtStatus')) attrs['media.debtStatus'] = v('mediaDebtStatus');
    if (v('mediaProductHolding')) attrs['media.productHolding'] = v('mediaProductHolding');
    if (v('mediaServiceRAGStatus')) attrs['media.serviceRAGStatus'] = v('mediaServiceRAGStatus');
    const pkgs = v('mediaPackages');
    if (pkgs) {
      const list = pkgs.split(',').map((s) => s.trim()).filter(Boolean);
      if (list.length) attrs['media.packages'] = list;
    }
    const ch = v('mediaChannel');
    const hrsRaw = document.getElementById('mediaViewingHours')?.value;
    const hrs = hrsRaw !== '' && hrsRaw != null ? parseInt(hrsRaw, 10) : null;
    if (ch || (hrs != null && !isNaN(hrs))) {
      const viewingItem = {};
      if (ch) viewingItem.channel = ch;
      if (hrs != null && !isNaN(hrs)) viewingItem.viewingHours = hrs;
      if (Object.keys(viewingItem).length) attrs['media.viewingData'] = [viewingItem];
    }
  } else if (industry === 'sports') {
    const v = (id) => (document.getElementById(id)?.value || '').trim();
    if (v('sportsFavouriteTeam')) attrs['individualCharacteristics.favouriteTeam'] = v('sportsFavouriteTeam');
    /* _demoemea.gym — sibling of identification, not under individualCharacteristics */
    if (v('sportsPtSession')) attrs['gym.ptSession'] = v('sportsPtSession');
  } else if (industry === 'telecommunications') {
    const v = (id) => (document.getElementById(id)?.value || '').trim();
    const boolVal = (id) => {
      const x = document.getElementById(id)?.value;
      if (x === '') return undefined;
      return x === 'true';
    };
    const numVal = (id) => {
      const x = document.getElementById(id)?.value;
      if (x === '') return undefined;
      const n = parseInt(x, 10);
      return isNaN(n) ? undefined : n;
    };
    if (v('telecomBundleName')) attrs['telecomSubscription.bundleName'] = v('telecomBundleName');
    if (v('telecomPrimaryPartyID')) attrs['telecomSubscription.primaryPartyID'] = v('telecomPrimaryPartyID');
    const connType = v('telecomConnectionType');
    const dataCap = numVal('telecomDataCap');
    const downloadSpeed = numVal('telecomDownloadSpeed');
    const uploadSpeed = numVal('telecomUploadSpeed');
    const selfSetup = boolVal('telecomSelfSetup');
    const internetPlanName = v('telecomInternetPlanName');
    if (connType || dataCap != null || downloadSpeed != null || uploadSpeed != null || selfSetup !== undefined || internetPlanName) {
      const internetSub = {
        ...(connType && { connectionType: connType }),
        ...(dataCap != null && { dataCap }),
        ...(downloadSpeed != null && { downloadSpeed }),
        ...(uploadSpeed != null && { uploadSpeed }),
        ...(selfSetup !== undefined && { selfSetup }),
        ...(internetPlanName && {
          subscriptionDetails: { planName: internetPlanName, status: 'active', startDate: new Date().toISOString().slice(0, 10) },
        }),
      };
      attrs['telecomSubscription.internetSubscription'] = [internetSub];
    }
    const landlineMinutes = numVal('telecomLandlineMinutes');
    const callBlocking = boolVal('telecomCallBlocking');
    const callForwarding = boolVal('telecomCallForwarding');
    const voicemail = boolVal('telecomVoicemail');
    const landlinePlanName = v('telecomLandlinePlanName');
    if (landlineMinutes != null || callBlocking !== undefined || callForwarding !== undefined || voicemail !== undefined || landlinePlanName) {
      const landlineSub = {
        ...(landlineMinutes != null && { minutes: landlineMinutes }),
        ...(callBlocking !== undefined && { callBlocking }),
        ...(callForwarding !== undefined && { callForwarding }),
        ...(voicemail !== undefined && { voicemail }),
        ...(landlinePlanName && {
          subscriptionDetails: { planName: landlinePlanName, status: 'active', startDate: new Date().toISOString().slice(0, 10) },
        }),
      };
      attrs['telecomSubscription.landlineSubscription'] = [landlineSub];
    }
    const channels = numVal('telecomChannels');
    const streamingService = v('telecomStreamingService');
    const mediaPlanName = v('telecomMediaPlanName');
    if (channels != null || streamingService || mediaPlanName) {
      const mediaSub = {
        ...(channels != null && { channels }),
        ...(streamingService && {
          streamingServices: [{ serviceName: streamingService }],
        }),
        ...(mediaPlanName && {
          subscriptionDetails: { planName: mediaPlanName, status: 'active', startDate: new Date().toISOString().slice(0, 10) },
        }),
      };
      attrs['telecomSubscription.mediaSubscription'] = [mediaSub];
    }
    const planLevel = v('telecomPlanLevel');
    const earlyUpgrade = boolVal('telecomEarlyUpgradeEnrollment');
    const portedNumber = boolVal('telecomPortedNumber');
    const mobilePlanName = v('telecomMobilePlanName');
    if (planLevel || earlyUpgrade !== undefined || portedNumber !== undefined || mobilePlanName) {
      const mobileSub = {
        ...(planLevel && { planLevel }),
        ...(earlyUpgrade !== undefined && { earlyUpgradeEnrollment: earlyUpgrade }),
        ...(portedNumber !== undefined && { portedNumber }),
        ...(mobilePlanName && {
          subscriptionDetails: { planName: mobilePlanName, status: 'active', startDate: new Date().toISOString().slice(0, 10) },
        }),
      };
      attrs['telecomSubscription.mobileSubscription'] = [mobileSub];
    }
  } else if (industry === 'public') {
    const v = (id) => (document.getElementById(id)?.value || '').trim();
    const amt = parseNumInput('publicDonatedAmount');
    if (amt != null) attrs['omnichannelCdpUseCasePack.donatedAmount'] = amt;
    const dRaw = v('publicDonationDate');
    attrs['omnichannelCdpUseCasePack.donationDate'] = dRaw ? normalizeOmnichannelDonationDate(dRaw) : formatLocalYyyyMmDd(new Date());
    if (v('publicEventRegistered')) attrs['omnichannelCdpUseCasePack.eventRegistered'] = v('publicEventRegistered');
  }
  return attrs;
}

async function loadSandboxes() {
  if (!sandboxSelect) return;
  if (window.AepGlobalSandbox) {
    await window.AepGlobalSandbox.loadSandboxesIntoSelect(sandboxSelect);
    window.AepGlobalSandbox.onSandboxSelectChange(sandboxSelect);
    window.AepGlobalSandbox.attachStorageSync(sandboxSelect);
    return;
  }
  sandboxSelect.innerHTML = '<option value="">Loading sandboxes…</option>';
  try {
    const res = await fetch('/api/sandboxes');
    const data = await res.json().catch(() => ({}));
    sandboxSelect.innerHTML = '';
    const sandboxes = data.sandboxes || [];
    const defaultOpt = document.createElement('option');
    defaultOpt.value = '';
    defaultOpt.textContent = 'Default (from env)';
    sandboxSelect.appendChild(defaultOpt);
    if (sandboxes.length === 0) {
      const emptyOpt = document.createElement('option');
      emptyOpt.value = '';
      emptyOpt.textContent = 'No sandboxes available';
      emptyOpt.disabled = true;
      sandboxSelect.appendChild(emptyOpt);
      return;
    }
    sandboxes.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = s.name;
      const label = s.title ? `${s.title} (${s.name})` : s.name;
      opt.textContent = s.type ? `${label} - ${s.type}` : label;
      sandboxSelect.appendChild(opt);
    });
    if (sandboxes.some((s) => s.name === 'kirkham')) sandboxSelect.value = 'kirkham';
  } catch {
    sandboxSelect.innerHTML = '<option value="">Failed to load sandboxes</option>';
  }
}

if (industrySelect) {
  industrySelect.addEventListener('change', () => {
    showIndustryFields(industrySelect.value?.trim().toLowerCase() || '');
    syncEmailFieldEditability();
    updateEmailDisplay();
  });
}

if (profileIndexInput) {
  const onProfileIndexChange = () => {
    if ((industrySelect?.value || '').trim()) updateEmailDisplay();
  };
  profileIndexInput.addEventListener('input', onProfileIndexChange);
  profileIndexInput.addEventListener('change', onProfileIndexChange);
}

if (generateBtn && generateMessage) {
  generateBtn.addEventListener('click', async () => {
    const industry = (industrySelect?.value || '').trim().toLowerCase();
    const x = parseInt(profileIndexInput?.value || '1', 10) || 1;
    const email = getEmail().trim();
    if (!email) {
      setMessage(
        generateMessage,
        'No email entered. Type an address in Personal email, or select an industry to fill kirkham+<industry>-<x>@adobetest.com automatically.',
        'warning',
      );
      emailDisplay?.focus();
      return;
    }
    if (!email.includes('@')) {
      setMessage(generateMessage, 'Enter a valid email address (must include @).', 'error');
      emailDisplay?.focus();
      return;
    }
    const sandbox = (sandboxSelect?.value || '').trim() || undefined;
    const firstName = (document.getElementById('firstName')?.value || '').trim();
    const lastName = (document.getElementById('lastName')?.value || '').trim();
    const ageVal = document.getElementById('age')?.value;
    const age = ageVal ? parseInt(ageVal, 10) : null;

    const attributes = getIndustryAttributes(industry);
    /* Same value as _demoemea.identification.core.email (set on server); root personalEmail mixin for union profile. */
    attributes['personalEmail.address'] = email;
    if (firstName) attributes['person.name.firstName'] = firstName;
    if (lastName) attributes['person.name.lastName'] = lastName;
    if (age != null && !isNaN(age) && age > 0) attributes['individualCharacteristics.core.age'] = age;

    const streetAddress = (document.getElementById('streetAddress')?.value || '').trim();
    const city = (document.getElementById('city')?.value || '').trim();
    const state = (document.getElementById('state')?.value || '').trim();
    const postalCode = (document.getElementById('postalCode')?.value || '').trim();
    const country = (document.getElementById('country')?.value || '').trim();
    const phoneCountryCode = (document.getElementById('phoneCountryCode')?.value || '').trim();
    const phoneNumber = (document.getElementById('phoneNumber')?.value || '').trim();

    if (streetAddress || city || state || postalCode || country) {
      attributes['homeAddress'] = {
        ...(streetAddress && { street1: streetAddress }),
        ...(city && { city }),
        ...(state && { stateProvince: state }),
        ...(postalCode && { postalCode }),
        ...(country && { countryCode: country }),
      };
    }
    if (phoneNumber) {
      attributes['mobilePhone'] = {
        ...(phoneCountryCode && { countryCode: phoneCountryCode }),
        number: phoneNumber,
        primary: true,
        status: 'active',
      };
    }

    Object.assign(attributes, getScoringAttributes());
    /* Fresh loyalty id each generate (_demoemea.identification.core.loyaltyId, string). */
    setInput('loyaltyID', `LYL-${randomInt(100000, 999999)}`);
    Object.assign(attributes, getLoyaltyAttributes());

    attributes.testProfile = true;

    generateBtn.disabled = true;
    setMessage(generateMessage, 'Generating profile…', '');
    const debugEl = document.getElementById('generateDebug');
    const debugClientRequest = document.getElementById('debugClientRequest');
    const debugServerRequest = document.getElementById('debugServerRequest');
    const debugPayload = document.getElementById('debugPayload');
    const debugStatus = document.getElementById('debugStatus');
    const debugResponse = document.getElementById('debugResponse');
    if (debugEl) debugEl.hidden = true;

    const appendIfExisting = document.getElementById('appendIfExisting')?.checked === true;
    const clientBody = { email, industry, profileIndex: x, sandbox, attributes, appendIfExisting };
    const clientRequest = {
      method: 'POST',
      url: `${window.location.origin}/api/profile/generate`,
      headers: { 'Content-Type': 'application/json' },
      body: clientBody,
    };

    try {
      const res = await fetch('/api/profile/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clientBody),
      });
      const data = await res.json().catch(() => ({}));

      if (debugEl && debugClientRequest && debugServerRequest && debugPayload && debugStatus && debugResponse) {
        debugEl.hidden = false;
        debugClientRequest.textContent = JSON.stringify(clientRequest, null, 2);
        const serverReq = data.requestDetails
          ? { method: data.requestDetails.method, url: data.requestDetails.url, headers: data.requestDetails.headers }
          : data.requestUrl != null
            ? { method: 'POST', url: data.requestUrl, headers: data.requestHeaders }
            : null;
        debugServerRequest.textContent = serverReq ? JSON.stringify(serverReq, null, 2) : '(not available)';
        const formatBody =
          typeof formatAepPayloadPreContent === 'function' ? formatAepPayloadPreContent : (d) => JSON.stringify(d.sentToAep, null, 2);
        debugPayload.textContent = data.sentToAep != null ? formatBody(data) : '(none)';
        debugStatus.textContent = `${data.streamingStatus ?? res.status} ${res.ok ? 'OK' : ''}`;
        debugResponse.textContent = JSON.stringify(
          {
            streamingTransport: data.streamingTransport,
            mergeDiagnostics: data.mergeDiagnostics,
            ecidSource: data.ecidSource,
            appendIfExisting: data.appendIfExisting,
            testProfileNote:
              'In sentToAep, envelope uses body.xdmEntity._demoemea.testProfile; bare mode uses _demoemea.testProfile. If Profile does not show the field, add Data Prep mapping for that path on your HTTP dataflow.',
            streamingResponse: data.streamingResponse,
          },
          null,
          2,
        );
      }

      if (!res.ok) {
        let errMsg = data.error || data.message || 'Failed to generate profile.';
        if (Array.isArray(data.streamErrors) && data.streamErrors.length) {
          errMsg += ' ' + data.streamErrors.join(' ');
        }
        if (data.streamingStatus) errMsg += ' (HTTP ' + data.streamingStatus + ')';
        setMessage(generateMessage, errMsg, 'error');
        return;
      }
      let okMsg = data.message || `Request sent: ${email}`;
      if (data.appendIfExisting) {
        if (data.ecidSource === 'existing') okMsg += ' Reused existing ECID (merged into that profile).';
        else okMsg += ' No existing profile for this email — new ECID generated.';
      }
      if (data.streamingWarning) okMsg += ` Streaming note: ${data.streamingWarning}`;
      setMessage(generateMessage, okMsg, data.streamingWarning ? 'warning' : 'success');
    } catch (err) {
      setMessage(generateMessage, err.message || 'Network error', 'error');
      if (debugEl && debugClientRequest && debugServerRequest && debugPayload && debugStatus && debugResponse) {
        debugEl.hidden = false;
        debugClientRequest.textContent = JSON.stringify(clientRequest, null, 2);
        debugServerRequest.textContent = '(request failed before server response)';
        debugPayload.textContent = '(request failed before send)';
        debugStatus.textContent = '—';
        debugResponse.textContent = err.message || String(err);
      }
    } finally {
      generateBtn.disabled = false;
    }
  });
}

const fillRandomBtn = document.getElementById('fillRandomBtn');
if (fillRandomBtn) {
  fillRandomBtn.addEventListener('click', () => {
    fillRandomSampleData();
  });
}

if (sandboxSelect) loadSandboxes();
showIndustryFields(industrySelect?.value?.trim().toLowerCase() || '');
syncEmailFieldEditability();
updateEmailDisplay();
