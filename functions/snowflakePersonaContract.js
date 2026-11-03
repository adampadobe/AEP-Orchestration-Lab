'use strict';

const { isDeepStrictEqual } = require('node:util');
const { normalizeAepAttributesForSnowflake } = require('./snowflakeProfileMapper');
const { getIndustryProfileConfig } = require('./snowflakeIndustryProfileRegistry');

const ROOTS = {
  travel: 'customerProfile', fsi: 'fsiProfile', retail: 'retailProfile',
  telecom: 'telecomProfile', media: 'mediaProfile', sports: 'sportsProfile',
};
const COMMON = {
  FIRSTNAME: ['personalDetails.firstName', 'person.name.firstName'],
  LASTNAME: ['personalDetails.lastName', 'person.name.lastName'],
  DATEOFBIRTH: ['personalDetails.dateOfBirth', 'person.birthDate'],
  GENDER: ['personalDetails.gender', 'person.gender'],
  NATIONALITY: ['personalDetails.nationality', 'person.nationality'],
  PRIMARYPHONE: ['contactDetails.primaryPhone', 'mobilePhone.number'],
  ADDRESSSTREET: ['contactDetails.address.street', 'homeAddress.street1', 'homeAddress.street'],
  ADDRESSCITY: ['contactDetails.address.city', 'homeAddress.city'],
  ADDRESSPOSTALCODE: ['contactDetails.address.postalCode', 'homeAddress.postalCode'],
  ADDRESSCOUNTRY: ['contactDetails.address.country', 'homeAddress.country'],
};
const FSI_VALUE = {
  LIFETIMEVALUE: 'lifetimeValue', CUSTOMERSEGMENT: 'customerSegment', HOUSEHOLDINCOME: 'householdIncome',
  CREDITSCOREBAND: 'creditScoreBand', CREDITSCORE: 'creditScore', LIFESTAGE: 'lifeStage',
  EMPLOYMENTSTATUS: 'employmentStatus', PRIMARYBANKINGCHANNEL: 'primaryBankingChannel',
  TOTALACCOUNTS: 'totalAccounts', CHECKINGBALANCE: 'checkingBalance', SAVINGSBALANCE: 'savingsBalance',
  MORTGAGEBALANCE: 'mortgageBalance', INVESTMENTVALUE: 'investmentValue', CREDITCARDLIMIT: 'creditCardLimit',
  MONTHLYCREDITSPEND: 'monthlyCreditSpend', NEXTRATERENEWDATE: 'nextRateRenewDate',
  LASTBRANCHVISIT: 'lastBranchVisit', RISKRATING: 'riskRating',
};
const RETAIL_VALUE = {
  LIFETIMEVALUE: 'lifetimeValue', CUSTOMERSEGMENT: 'customerSegment', TOTALORDERS: 'totalOrders',
  LASTORDERDATE: 'lastOrderDate', LASTORDERVALUE: 'lastOrderValue', AVGORDERVALUE: 'avgOrderValue',
  RETURNRATE: 'returnRate', ORDERSYTD: 'ordersYtd', REWARDPOINTS: 'rewardPoints', LASTRETURNDATE: 'lastReturnDate',
};
const RETAIL_PREFERENCES = {
  FAVOURITECATEGORY: 'favouriteCategory', FAVOURITEBRAND: 'favouriteBrand', LINKEDSTOREID: 'linkedStoreId',
  LINKEDSTORENAME: 'linkedStoreName', PREFERREDSIZE: 'preferredSize', PREFERREDCHANNEL: 'preferredChannel',
  COBRANDEDCARDMEMBER: 'cobrandedCardMember',
};
const TRAVEL = {
  LASTHOLIDAYDATE: 'travelHistory.lastHolidayDate', LASTHOLIDAYDESTINATION: 'travelHistory.lastHolidayDestination',
  UPCOMINGHOLIDAYDATE: 'travelHistory.upcomingHolidayDate',
  UPCOMINGHOLIDAYDESTINATION: 'travelHistory.upcomingHolidayDestination',
  TOTALFLIGHTSTAKEN: 'travelHistory.totalFlightsTaken', TOTALDISTANCEFLOWN: 'travelHistory.totalDistanceFlown',
  FAVORITEDESTINATIONS: 'travelHistory.favoriteDestinations',
  PREFERREDCABINCLASS: 'travelPreferences.preferredCabinClass',
  PREFERREDSEATTYPE: 'travelPreferences.preferredSeatType', MEALPREFERENCE: 'travelPreferences.mealPreference',
  SPECIALASSISTANCE: 'travelPreferences.specialAssistance',
  LIFETIMEVALUE: 'customerValue.lifetimeValue', AVERAGEBOOKINGVALUE: 'customerValue.averageBookingValue',
  TOTALBOOKINGS: 'customerValue.totalBookings', CUSTOMERSEGMENT: 'customerValue.customerSegment',
};
const SHARED = {
  LIFETIMEVALUE: ['orderProfile.lifetimeValue'],
  PHONENUMBER: ['mobilePhone.number', 'identification.core.phoneNumber'],
  LOYALTYID: ['loyalty.loyaltyId', 'loyaltyDetails.loyaltyId', 'identification.core.loyaltyId'],
};
const INDUSTRY_SHARED = {
  fsi: {
    HOUSEHOLDINCOME: ['personalFinances.personalTaxProfile.householdIncome.amount'],
    CREDITSCORE: ['personalFinances.creditScores.0.score', 'individualCharacteristics.core.creditScore'],
    CREDITSCOREBAND: ['industryFsi.creditScoreBand'], LIFESTAGE: ['industryFsi.lifeStage'],
    EMPLOYMENTSTATUS: ['industryFsi.employment'], PRIMARYBANKINGCHANNEL: ['industryFsi.primaryBankingChannel'],
  },
  travel: {
    PREFERREDCABINCLASS: ['individualCharacteristics.travel.primaryTravelClass'],
    PREFERREDSEATTYPE: ['travelPreferences.seat'],
    MEALPREFERENCE: ['travelPreferences.meal'],
  },
  retail: {
    FAVOURITECATEGORY: ['individualCharacteristics.core.favouriteCategory'],
    FAVOURITEBRAND: ['individualCharacteristics.retail.favoriteFashionBrand'],
    COBRANDEDCARDMEMBER: ['individualCharacteristics.retail.cobrandedCreditCardHolder'],
    PREFERREDSIZE: ['individualCharacteristics.retail.shirtSize'],
    LASTORDERDATE: ['orderProfile.lastOrderDate'],
    LASTORDERVALUE: ['orderProfile.lastOrderValue'],
    ORDERSYTD: ['orderProfile.ordersYTD'],
  },
  telecom: {
    PLANTIER: ['industryTelecom.planTier'], DEVICETIER: ['industryTelecom.deviceTier'],
    BUNDLETYPE: ['telecomSubscription.bundleName'],
    UPGRADEELIGIBLE: ['industryTelecom.serviceFlags.upgradeEligible'],
  },
  media: {
    SUBSCRIPTIONTIER: ['industryMedia.subscriptionTier'], PRIMARYGENRE: ['industryMedia.primaryGenre'],
    PREFERREDDEVICE: ['industryMedia.preferredDevice'], ACCOUNTSHARING: ['industryMedia.accountSharingBand'],
    ADSUPPORTED: ['industryMedia.engagementFlags.adSupported'],
    LIVESPORTSPACKAGE: ['industryMedia.engagementFlags.sportsPackage'],
    KIDPROFILEENABLED: ['industryMedia.engagementFlags.hasKidsProfile'],
  },
  sports: {
    FAVOURITESPORT: ['industrySports.favouriteSport'], FAVOURITETEAM: ['industrySports.favouriteTeam'],
    FANSEGMENT: ['industrySports.fanSegment'], SEASONTICKET: ['industrySports.fanFlags.seasonTicket'],
    JERSEYSIZEPREFERENCE: ['industrySports.jerseySize'], FANTASYLEAGUE: ['industrySports.fanFlags.fantasyPlayer'],
    BETSREGULARLY: ['industrySports.fanFlags.betsRegularly'], STREAMLIVE: ['industrySports.fanFlags.streamLive'],
    NEWSLETTERSUBSCRIBED: ['industrySports.fanFlags.newsletterSub'],
  },
};

function read(attrs, path) {
  if (Object.hasOwn(attrs, path)) return { present: true, value: attrs[path] };
  // Normalization preserves arrays as leaves; indexed paths still need traversal.
  const parts = path.split('.');
  for (let count = parts.length - 1; count > 0; count -= 1) {
    const prefix = parts.slice(0, count).join('.');
    if (!Object.hasOwn(attrs, prefix)) continue;
    let value = attrs[prefix];
    for (const part of parts.slice(count)) {
      if (value == null || !Object.hasOwn(Object(value), part)) return { present: false };
      value = value[part];
    }
    return { present: true, value };
  }
  return { present: false };
}

function personaColumnPaths(industry) {
  const config = getIndustryProfileConfig(industry);
  if (!config) throw new Error(`Unsupported persona industry: ${industry}`);
  industry = config.industry;
  const root = ROOTS[config.industry];
  const paths = Object.fromEntries(Object.entries(COMMON).map(([column, [crm, ...aliases]]) => [
    column, [`${root}.${crm}`, ...aliases],
  ]));
  const add = (entries, prefix) => {
    for (const [column, path] of Object.entries(entries)) paths[column] = [`${root}.${prefix}${path}`];
  };
  if (industry === 'fsi') add(FSI_VALUE, 'customerValue.');
  else if (industry === 'retail') {
    add(RETAIL_VALUE, 'customerValue.');
    add(RETAIL_PREFERENCES, 'shoppingPreferences.');
  } else if (industry === 'travel') add(TRAVEL, '');
  else {
    for (const column of config.columns) {
      if (!paths[column] && !['RECIPIENT_ID', 'CRMID', 'ECID', 'EMAIL', 'EMAILIDSHA256', 'GAID',
        'LOYALTYID', 'PHONENUMBER', 'PUSHTOKENS', 'STACKCHATID', 'PRIMARYEMAIL', 'TESTPROFILE',
        '_RECORDCREATEDTIMESTAMP', '_RECORDUPDATEDTIMESTAMP'].includes(column)) {
        paths[column] = [`${root}.attributes.${column.toLowerCase()}`];
      }
    }
  }
  for (const [column, aliases] of Object.entries({ ...SHARED, ...INDUSTRY_SHARED[industry] })) {
    paths[column] = [...(paths[column] || []), ...aliases];
  }
  return paths;
}

function applyPersonaContract(industry, row, attributes) {
  const config = getIndustryProfileConfig(industry);
  if (!config) throw new Error(`Unsupported persona industry: ${industry}`);
  industry = config.industry;
  // A nested tenant object first flattens to tenant-prefixed keys, then strips the prefix.
  const attrs = normalizeAepAttributesForSnowflake(normalizeAepAttributesForSnowflake(attributes));
  const result = { ...row };
  const columnPaths = personaColumnPaths(industry);
  const supported = new Set(Object.values(columnPaths).flat());
  for (const path of Object.keys(attrs)) {
    if (path.startsWith(`${ROOTS[industry]}.`) && !supported.has(path)
      && path !== `${ROOTS[industry]}.contactDetails.primaryEmail`) {
      throw new Error(`Unsupported CRM persona attribute: ${path}`);
    }
  }
  const primaryEmail = read(attrs, `${ROOTS[industry]}.contactDetails.primaryEmail`);
  if (primaryEmail.present && primaryEmail.value !== row.EMAIL) {
    throw new Error('CRM primary email must match the generated profile identity');
  }
  for (const [column, paths] of Object.entries(columnPaths)) {
    const supplied = paths.map((path) => ({ path, ...read(attrs, path) })).filter(({ present }) => present);
    if (!supplied.length) continue;
    const value = supplied[0].value;
    if (supplied.some((entry) => !isDeepStrictEqual(entry.value, value))) {
      throw new Error(`Conflicting persona values for ${column}: ${supplied.map(({ path }) => path).join(', ')}`);
    }
    const ddl = config.columnDdl.find((entry) => entry.startsWith(`${column} `));
    if (!ddl) throw new Error(`Missing persona column definition for ${column}`);
    if (value !== null && (
      (/\bBOOLEAN\b/.test(ddl) && typeof value !== 'boolean')
      || (/\bNUMBER\b/.test(ddl) && (typeof value !== 'number' || !Number.isFinite(value)))
      || (/\bARRAY\b/.test(ddl) && (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string')))
      || (/\bVARCHAR\b/.test(ddl) && typeof value !== 'string')
      || (/\bDATE\b/.test(ddl) && (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)
        || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value))
    )) throw new Error(`Invalid persona value type for ${column}`);
    if (value === undefined) throw new Error(`Undefined persona value for ${column}`);
    const stringLimit = ddl.match(/\bVARCHAR\((\d+)\)/);
    if (typeof value === 'string' && stringLimit && Array.from(value).length > Number(stringLimit[1])) {
      throw new Error(`Persona value exceeds column length for ${column}`);
    }
    const numberType = ddl.match(/\bNUMBER\((\d+),\s*(\d+)\)/);
    if (typeof value === 'number' && numberType) {
      const [, precision, scale] = numberType.map(Number);
      if (Math.abs(value) >= 10 ** (precision - scale) || Number(value.toFixed(scale)) !== value) {
        throw new Error(`Persona value exceeds numeric precision or scale for ${column}`);
      }
    }
    result[column] = value;
  }
  return result;
}

module.exports = { applyPersonaContract, personaColumnPaths };
