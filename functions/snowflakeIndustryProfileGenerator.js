'use strict';

const { createHash } = require('crypto');
const { faker } = require('@faker-js/faker');
const {
  formatSnowflakeRecordTimestamp,
  getAttr,
  normalizeAepAttributesForSnowflake,
} = require('./snowflakeProfileMapper');
const { getIndustryProfileConfig } = require('./snowflakeIndustryProfileRegistry');

const DAY_MS = 86400000;

function pick(values) {
  return faker.helpers.arrayElement(values);
}

function int(min, max) {
  return faker.number.int({ min, max });
}

function money(min, max) {
  return faker.number.float({ min, max, fractionDigits: 2 });
}

function dateYmd(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function daysAgo(min, max) {
  return dateYmd(Date.now() - int(min, max) * DAY_MS);
}

function daysAhead(min, max) {
  return dateYmd(Date.now() + int(min, max) * DAY_MS);
}

function bool(probability = 0.5) {
  return Math.random() < probability;
}

function sha256Email(email) {
  return createHash('sha256').update(String(email).toLowerCase(), 'utf8').digest('hex');
}

function commonProfile(input, attrs, industry) {
  const firstName = String(input.firstName || getAttr(attrs, 'person.name.firstName') || '').trim()
    || faker.person.firstName();
  const lastName = String(input.lastName || getAttr(attrs, 'person.name.lastName') || '').trim()
    || faker.person.lastName();
  const genderHint = String(getAttr(attrs, 'person.gender') || '').trim().toLowerCase();
  const gender = ['male', 'female', 'non_binary'].includes(genderHint) ? genderHint : pick(['male', 'female']);
  const birthHint = String(getAttr(attrs, 'person.birthDate') || '').trim();
  const dob = /^\d{4}-\d{2}-\d{2}$/.test(birthHint)
    ? birthHint
    : dateYmd(faker.date.birthdate({ min: 21, max: 78, mode: 'age' }));
  const email = String(input.email || '').trim();
  const stamp = formatSnowflakeRecordTimestamp(input.runStamp);
  const customerSegments = {
    fsi: ['mass_market', 'affluent', 'private_banking', 'credit_builder'],
    retail: ['occasional', 'regular', 'loyalty_vip', 'high_value'],
    telecom: ['value', 'standard', 'premium', 'family'],
    media: ['casual', 'engaged', 'binge_viewer', 'family'],
    sports: ['casual', 'regular', 'superfan', 'day_one'],
  };
  return {
    CRMID: String(input.crmId || `CRM${input.idx}`),
    ECID: String(input.ecid || ''),
    EMAIL: email,
    EMAILIDSHA256: sha256Email(email),
    GAID: `GAID${input.idx}`,
    LOYALTYID: bool(0.6) ? `LOYALTY${Number(input.idx) + 2000}` : null,
    PHONENUMBER: '+447425627462',
    PUSHTOKENS: null,
    STACKCHATID: `STACK${input.idx}`,
    FIRSTNAME: firstName,
    LASTNAME: lastName,
    DATEOFBIRTH: dob,
    GENDER: gender,
    NATIONALITY: String(getAttr(attrs, 'person.nationality') || 'GB'),
    PRIMARYEMAIL: email,
    PRIMARYPHONE: faker.phone.number({ style: 'international' }),
    ADDRESSSTREET: faker.location.streetAddress(),
    ADDRESSCITY: faker.location.city(),
    ADDRESSPOSTALCODE: faker.location.zipCode(),
    ADDRESSCOUNTRY: 'United Kingdom',
    LIFETIMEVALUE: money(500, 25000),
    CUSTOMERSEGMENT: pick(customerSegments[industry]),
    TESTPROFILE: input.testProfile !== false,
    _RECORDCREATEDTIMESTAMP: stamp,
    _RECORDUPDATEDTIMESTAMP: stamp,
  };
}

function generateFsi(attrs) {
  const incomeBand = String(getAttr(attrs, 'industryFsi.householdIncomeBand') || '100k_200k');
  const incomeRanges = {
    under_50k: [25000, 49999], '50k_100k': [50000, 99999], '100k_200k': [100000, 199999],
    '200k_500k': [200000, 499999], '500k_plus': [450000, 800000],
  };
  const incomeRange = incomeRanges[incomeBand] || incomeRanges['100k_200k'];
  let creditBand = String(getAttr(attrs, 'industryFsi.creditScoreBand') || 'good');
  if (incomeBand === '500k_plus' && !['very_good', 'excellent'].includes(creditBand)) creditBand = 'excellent';
  const creditRanges = { poor: [300, 579], fair: [580, 669], good: [670, 739], very_good: [740, 799], excellent: [800, 850] };
  const creditRange = creditRanges[creditBand] || creditRanges.good;
  const income = int(...incomeRange);
  const totalAccounts = int(2, income > 400000 ? 10 : 7);
  return {
    HOUSEHOLDINCOME: income,
    CREDITSCOREBAND: creditBand,
    CREDITSCORE: int(...creditRange),
    LIFESTAGE: getAttr(attrs, 'industryFsi.lifeStage') || pick(['young_professional', 'family', 'pre_retirement', 'retired']),
    EMPLOYMENTSTATUS: getAttr(attrs, 'industryFsi.employment') || pick(['employed', 'self_employed', 'contract', 'retired']),
    PRIMARYBANKINGCHANNEL: getAttr(attrs, 'industryFsi.primaryBankingChannel') || pick(['mobile', 'online', 'branch', 'phone']),
    TOTALACCOUNTS: totalAccounts,
    CHECKINGBALANCE: money(500, Math.max(2500, income * 0.08)),
    SAVINGSBALANCE: money(1000, Math.max(5000, income * 0.35)),
    MORTGAGEBALANCE: bool(0.55) ? money(50000, 750000) : 0,
    INVESTMENTVALUE: income > 200000 ? money(50000, income * 2.5) : money(0, income * 0.4),
    CREDITCARDLIMIT: money(1000, Math.max(5000, income * 0.15)),
    MONTHLYCREDITSPEND: money(250, Math.max(1000, income / 30)),
    NEXTRATERENEWDATE: daysAhead(30, 730),
    LASTBRANCHVISIT: daysAgo(5, 730),
    RISKRATING: creditBand === 'poor' ? 'high' : creditBand === 'fair' ? 'medium' : 'low',
  };
}

function generateRetail(attrs) {
  const aepLtv = Number(getAttr(attrs, 'orderProfile.lifetimeValue'));
  const ltv = Number.isFinite(aepLtv) && aepLtv > 0
    ? Math.round(aepLtv * pick([0.86, 0.91, 1.08, 1.14]) * 100) / 100
    : money(300, 30000);
  const orders = int(2, 180);
  const lastOrder = money(15, 850);
  return {
    LIFETIMEVALUE: ltv,
    TOTALORDERS: orders,
    LASTORDERDATE: daysAgo(1, 180),
    LASTORDERVALUE: lastOrder,
    FAVOURITECATEGORY: getAttr(attrs, 'individualCharacteristics.core.favouriteCategory') || pick(['fashion', 'beauty', 'home', 'electronics', 'sports']),
    FAVOURITEBRAND: pick(['Barbour', 'Nike', 'LEGO', 'Dyson', 'Apple', 'Adidas']),
    LINKEDSTOREID: `UK-${int(100, 999)}`,
    LINKEDSTORENAME: `${pick(['Oxford Street', 'Westfield', 'Manchester Arndale', 'Birmingham Bullring'])} Store`,
    AVGORDERVALUE: Math.round((ltv / orders) * 100) / 100,
    RETURNRATE: money(0, 0.25),
    COBRANDEDCARDMEMBER: bool(0.35),
    PREFERREDSIZE: pick(['XS', 'S', 'M', 'L', 'XL', 'XXL']),
    PREFERREDCHANNEL: pick(['store', 'web', 'mobile_app', 'marketplace']),
    ORDERSYTD: Math.min(orders, int(1, 32)),
    REWARDPOINTS: int(0, 25000),
    LASTRETURNDATE: bool(0.35) ? daysAgo(2, 240) : null,
  };
}

function generateTelecom(attrs) {
  const tier = String(getAttr(attrs, 'industryTelecom.planTier') || pick(['basic', 'standard', 'premium']));
  const deviceTier = String(getAttr(attrs, 'industryTelecom.deviceTier') || pick(['budget', 'mid_range', 'flagship']));
  const spendRanges = { basic: [12, 30], standard: [30, 65], premium: [65, 140] };
  const spend = money(...(spendRanges[tier] || spendRanges.standard));
  const allowanceHint = String(getAttr(attrs, 'industryTelecom.dataAllowance') || '25_100gb');
  const allowance = allowanceHint === 'unlimited' ? 999 : allowanceHint === '5_25gb' ? int(5, 25) : int(30, 200);
  const contractStart = Date.now() - int(60, 700) * DAY_MS;
  const endDays = int(10, 500);
  const npsHint = String(getAttr(attrs, 'industryTelecom.networkNps') || 'passive');
  const npsRanges = { detractor: [0, 6], passive: [7, 8], promoter: [9, 10] };
  return {
    PLANTIER: tier,
    BUNDLETYPE: getAttr(attrs, 'telecomSubscription.bundleName') || pick(['Mobile Only', 'Mobile + Broadband', 'Family Quad-Play']),
    MONTHLYSPEND: spend,
    DATAALLOWANCEGB: allowance,
    DATAUSAGEGB: allowance === 999 ? money(15, 180) : money(1, Math.max(2, allowance * 1.15)),
    CONTRACTSTARTDATE: dateYmd(contractStart),
    CONTRACTENDDATE: daysAhead(endDays, endDays),
    DEVICEMODEL: deviceTier === 'flagship' ? pick(['iPhone 17 Pro', 'Galaxy S26 Ultra', 'Pixel 11 Pro']) : pick(['Pixel 10a', 'Galaxy A57', 'iPhone 16e']),
    DEVICETIER: deviceTier,
    NETWORKNPS: int(...(npsRanges[npsHint] || npsRanges.passive)),
    TOTALCALLMINUTES: int(40, 2200),
    UPGRADEELIGIBLE: Boolean(getAttr(attrs, 'industryTelecom.serviceFlags.upgradeEligible')) || endDays < 90,
    LASTCONTACTDATE: daysAgo(1, 180),
    LASTCONTACTREASON: pick(['billing_query', 'network_issue', 'plan_change', 'device_support', 'upgrade']),
    CHURNRISK: npsHint === 'detractor' ? money(0.6, 0.95) : money(0.05, 0.55),
  };
}

function generateMedia(attrs) {
  const tier = String(getAttr(attrs, 'industryMedia.subscriptionTier') || pick(['free', 'standard', 'premium', 'family']));
  const fees = { free: 0, standard: 10.99, premium: 17.99, premium_plus: 22.99, family: 25.99 };
  const viewBand = String(getAttr(attrs, 'industryMedia.viewingMinutesBand') || '300_600');
  const viewRanges = { under_60: [10, 59], '60_300': [60, 300], '300_600': [300, 600], '600_plus': [600, 3000] };
  const sharing = String(getAttr(attrs, 'industryMedia.accountSharingBand') || pick(['solo', 'couple', 'family']));
  return {
    SUBSCRIPTIONTIER: tier,
    SUBSCRIPTIONSTARTDATE: daysAgo(30, 1800),
    MONTHLYFEE: fees[tier] ?? money(8, 30),
    PRIMARYGENRE: getAttr(attrs, 'industryMedia.primaryGenre') || pick(['drama', 'comedy', 'documentary', 'sports', 'kids']),
    PREFERREDDEVICE: getAttr(attrs, 'industryMedia.preferredDevice') || pick(['tv', 'mobile', 'tablet', 'web', 'console']),
    VIEWINGMINUTESMONTHLY: int(...(viewRanges[viewBand] || viewRanges['300_600'])),
    LASTVIEWEDDATE: daysAgo(0, 45),
    LASTVIEWEDTITLE: faker.book.title(),
    DOWNLOADSPERMONTH: int(0, 35),
    ACCOUNTSHARING: sharing,
    ADSUPPORTED: Boolean(getAttr(attrs, 'industryMedia.engagementFlags.adSupported')) || tier === 'free',
    LIVESPORTSPACKAGE: Boolean(getAttr(attrs, 'industryMedia.engagementFlags.sportsPackage')),
    KIDPROFILEENABLED: Boolean(getAttr(attrs, 'industryMedia.engagementFlags.hasKidsProfile')),
    CONTENTRATINGPREF: pick(['U', 'PG', '12', '15', '18']),
  };
}

function generateSports(attrs) {
  const fanSegment = String(getAttr(attrs, 'industrySports.fanSegment') || pick(['casual', 'regular', 'superfan', 'day_one']));
  const sport = String(getAttr(attrs, 'industrySports.favouriteSport') || pick(['football', 'rugby', 'cricket', 'tennis', 'motorsport']));
  const team = String(getAttr(attrs, 'industrySports.favouriteTeam') || pick(['Arsenal', 'Liverpool', 'England', 'McLaren']));
  const seasonTicketHint = Boolean(getAttr(attrs, 'industrySports.fanFlags.seasonTicket'));
  return {
    CUSTOMERSEGMENT: fanSegment,
    FAVOURITESPORT: sport,
    FAVOURITETEAM: team,
    FANSEGMENT: fanSegment,
    SEASONTICKET: seasonTicketHint || fanSegment === 'day_one',
    LASTATTENDEDDATE: daysAgo(3, 500),
    LASTEVENTNAME: `${team} ${pick(['Home Match', 'Cup Final', 'Fan Experience', 'Derby'])}`,
    MERCHSPENDYTD: fanSegment === 'superfan' || fanSegment === 'day_one' ? money(250, 1800) : money(0, 350),
    JERSEYSIZEPREFERENCE: getAttr(attrs, 'industrySports.jerseySize') || pick(['S', 'M', 'L', 'XL', 'XXL']),
    FANTASYLEAGUE: Boolean(getAttr(attrs, 'industrySports.fanFlags.fantasyPlayer')),
    BETSREGULARLY: Boolean(getAttr(attrs, 'industrySports.fanFlags.betsRegularly')),
    STREAMLIVE: Boolean(getAttr(attrs, 'industrySports.fanFlags.streamLive')) || bool(0.45),
    NEWSLETTERSUBSCRIBED: Boolean(getAttr(attrs, 'industrySports.fanFlags.newsletterSub')) || bool(0.55),
    LASTPURCHASEITEM: pick(['home jersey', 'scarf', 'match programme', 'training top', 'cap']),
    STADIUMSECTION: pick(['North Stand', 'South Stand', 'Family Enclosure', 'Club Level', 'Away End']),
    MEMBERSHIPTYPE: pick(['digital', 'supporter', 'premium', 'season_ticket']),
  };
}

const GENERATORS = { fsi: generateFsi, retail: generateRetail, telecom: generateTelecom, media: generateMedia, sports: generateSports };

function generateIndustryProfileRow(industry, input) {
  const config = getIndustryProfileConfig(industry);
  if (!config || config.industry === 'travel') throw new Error(`Unsupported non-travel CRM industry: ${industry}`);
  const idx = Number(input.idx);
  if (!Number.isFinite(idx) || idx <= 0) throw new Error('idx must be a positive integer');
  if (!String(input.email || '').trim()) throw new Error('email is required for CRM profile generation');
  if (!String(input.ecid || '').trim()) throw new Error('ecid is required for CRM profile generation');
  const attrs = normalizeAepAttributesForSnowflake(input.attributes);
  const rowObject = { ...commonProfile(input, attrs, config.industry), ...GENERATORS[config.industry](attrs) };
  const row = config.columns.map((column) => Object.prototype.hasOwnProperty.call(rowObject, column) ? rowObject[column] : null);
  return { row, rowObject, columns: config.columns.slice() };
}

module.exports = { generateIndustryProfileRow };
