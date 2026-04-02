#!/usr/bin/env node
/**
 * Generate AEP profiles via profile streaming.
 * Uses auth from ../00 Adobe Auth and .env (AEP_PROFILE_STREAMING_URL, AEP_PROFILE_FLOW_ID).
 *
 * Usage:
 *   node generate-profiles.js <industry> [index]
 *   node generate-profiles.js retail 1
 *   node generate-profiles.js fsi 2
 *
 * Industries: retail, fsi, travel, media, sports, telecommunications
 * Email format: kirkham+<industry>-<index>@adobetest.com
 */

import { getAuth, getConfig } from '../00 Adobe Auth/src/index.js';

function generateEcid() {
  let s = '4';
  for (let i = 0; i < 37; i++) s += Math.floor(Math.random() * 10);
  return s;
}

function setByPath(obj, path, value) {
  if (!path || typeof path !== 'string') return;
  const keys = path.split('.').filter(Boolean);
  if (keys.length === 0) return;
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (!(k in cur) || typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {};
    cur = cur[k];
  }
  cur[keys[keys.length - 1]] = value;
}

/** Keep in sync with PROFILE_STREAM_ROOT_PATH_PREFIXES in server.js */
const PROFILE_STREAM_ROOT_PATH_PREFIXES = new Set([
  'telecomSubscription',
  'person',
  'personID',
  'personalEmail',
  'homeAddress',
  'homePhone',
  'workAddress',
  'workPhone',
  'billingAddress',
  'billingAddressPhone',
  'mailingAddress',
  'shippingAddress',
  'shippingAddressPhone',
  'faxPhone',
  'mobilePhone',
  'loyalty',
]);

function getDefaultAttributes(industry) {
  const attrs = {};
  switch (industry) {
    case 'retail':
      attrs['individualCharacteristics.retail.favoriteColor'] = 'blue';
      attrs['individualCharacteristics.retail.favoriteStore'] = 'Demo Store';
      attrs['individualCharacteristics.retail.favoriteFashionBrand'] = 'Demo Fashion';
      attrs['individualCharacteristics.retail.linkedStore'] = ['Demo Mall', 'Demo Outlet'];
      attrs['individualCharacteristics.retail.cobrandedCreditCardHolder'] = false;
      attrs['individualCharacteristics.retail.shirtSize'] = 'M';
      break;
    case 'fsi':
      attrs['individualCharacteristics.fsi.customerRelationship.currentTier'] = 'Silver';
      attrs['individualCharacteristics.fsi.financialDetails.creditClassification'] = 'good';
      attrs['individualCharacteristics.fsi.financialDetails.customerBehavior.productInterest'] = 'mortgages';
      attrs['individualCharacteristics.fsi.financialDetails.customerBehavior.investingStyle'] = 'moderate';
      attrs['individualCharacteristics.fsi.financialAdvisor'] = 'Demo Advisor';
      attrs['individualCharacteristics.fsi.linkedBranch'] = 'Demo Branch';
      attrs['individualCharacteristics.fsi.hasAssignedBeneficiary'] = false;
      attrs['individualCharacteristics.fsi.assignedBeneficiary'] = ['Primary'];
      attrs['individualCharacteristics.fsi.policyType'] = ['Term'];
      attrs['individualCharacteristics.fsi.watchList'] = ['demo'];
      attrs['individualCharacteristics.fsi.customerRelationship.csat'] = 85;
      attrs['individualCharacteristics.fsi.customerRelationship.membershipStartDate'] = '2022-06-01';
      attrs['individualCharacteristics.fsi.financialDetails.balance'] = {
        checkingTotal: 5000,
        creditCardsTotal: 1200,
        savingsTotal: 15000,
      };
      attrs['individualCharacteristics.fsi.financialDetails.creditScore'] = 720;
      attrs['individualCharacteristics.fsi.productOverview.checkingAcct'] = true;
      attrs['individualCharacteristics.fsi.productOverview.savingsAcct'] = true;
      attrs['individualCharacteristics.fsi.productOverview.checkingType'] = 'high-yield';
      attrs['individualCharacteristics.fsi.productOverview.savingsType'] = 'money market';
      break;
    case 'travel':
      attrs['individualCharacteristics.travel.favouriteAirlineCompany'] = 'Demo Airlines';
      attrs['individualCharacteristics.travel.primaryTravelClass'] = 'economy';
      attrs['individualCharacteristics.travel.primaryTravelerType'] = 'leisure';
      attrs['individualCharacteristics.travel.avgDaysBookingBeforeTrip'] = 30;
      attrs['individualCharacteristics.travel.avgTripLength'] = 7;
      attrs['individualCharacteristics.travel.cobrandedCreditCardHolder'] = false;
      attrs['individualCharacteristics.travel.preferences'] = {
        hotel: {
          hotelRoomPreference: { pillowType: 'firm', hearingAccessible: false, mobilityAccessible: false },
          stayPreference: { highFloor: false, lateCheckOut: true, nearElevator: false },
        },
      };
      attrs['individualCharacteristics.travel.recentStay'] = {
        hotelName: 'Demo Hotel',
        hotelRoomType: 'King',
        hotelClass: '4-star',
        hotelLengthDays: 3,
        amountDailyAvg: 200,
        amountTotal: 600,
      };
      break;
    case 'media':
      attrs['media.accountType'] = 'premium';
      attrs['media.contractStatus'] = 'active';
      attrs['media.accountData'] = 'demo-account-data';
      attrs['media.accountDetails'] = 'Demo tier with DVR';
      attrs['media.debtStatus'] = 'current';
      attrs['media.productHolding'] = 'TV + broadband';
      attrs['media.serviceRAGStatus'] = 'green';
      attrs['media.packages'] = ['Entertainment', 'Sports'];
      attrs['media.viewingData'] = [{ channel: 'web', viewingHours: 5 }];
      break;
    case 'sports':
      attrs['individualCharacteristics.favouriteTeam'] = 'Demo FC';
      attrs['gym.ptSession'] = 'weekly';
      break;
    case 'telecommunications':
      attrs['telecomSubscription.bundleName'] = 'Demo Bundle';
      attrs['telecomSubscription.internetSubscription'] = [{
        connectionType: 'fiber',
        dataCap: 1000,
        downloadSpeed: 100,
        uploadSpeed: 50,
        selfSetup: true,
        subscriptionDetails: { planName: 'Gigabit Pro', status: 'active', startDate: new Date().toISOString().slice(0, 10) },
      }];
      attrs['telecomSubscription.mobileSubscription'] = [{
        planLevel: 'Premium',
        earlyUpgradeEnrollment: false,
        portedNumber: true,
        subscriptionDetails: { planName: 'Unlimited Plus', status: 'active', startDate: new Date().toISOString().slice(0, 10) },
      }];
      break;
    default:
      break;
  }
  return attrs;
}

async function generateProfile(email, industry, attributes = {}) {
  const streamUrl = process.env.AEP_PROFILE_STREAMING_URL;
  const flowId = process.env.AEP_PROFILE_FLOW_ID;
  const xdmKey = process.env.AEP_PROFILE_XDM_KEY || '_demoemea';

  if (!streamUrl || !flowId) {
    throw new Error('Set AEP_PROFILE_STREAMING_URL and AEP_PROFILE_FLOW_ID in .env');
  }

  const { token, config: authConfig } = await getAuth();
  const cfg = getConfig();
  const ecid = generateEcid();

  const demoemea = {
    identification: {
      core: {
        ecid,
        email,
      },
    },
  };

  const allAttrs = { ...getDefaultAttributes(industry), ...attributes };
  allAttrs['personalEmail.address'] = email;
  const rootExtras = {};
  for (const [path, val] of Object.entries(allAttrs)) {
    const cleanPath = (path || '').replace(/^(_demoemea\.|xdm:demoss\.)/i, '').trim();
    if (!cleanPath) continue;
    const top = cleanPath.split('.')[0];
    const target = PROFILE_STREAM_ROOT_PATH_PREFIXES.has(top) ? rootExtras : demoemea;
    setByPath(target, cleanPath, val);
  }

  const payload = { [xdmKey]: demoemea, ...rootExtras };
  const apiKey = process.env.AEP_PROFILE_STREAMING_API_KEY || cfg.clientId;
  const headers = {
    'Content-Type': 'application/json',
    'sandbox-name': authConfig.sandboxName || 'production',
    'x-adobe-flow-id': flowId,
    Authorization: `Bearer ${token}`,
    'x-api-key': apiKey,
  };

  const res = await fetch(streamUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data.detail || data.message || data.title || JSON.stringify(data);
    throw new Error(`Streaming failed (${res.status}): ${msg}`);
  }
  return { email, ecid };
}

const industry = (process.argv[2] || '').trim().toLowerCase();
const index = parseInt(process.argv[3] || '1', 10) || 1;
const validIndustries = ['retail', 'fsi', 'travel', 'media', 'sports', 'telecommunications'];

if (!validIndustries.includes(industry)) {
  console.error('Usage: node generate-profiles.js <industry> [index]');
  console.error('Industries:', validIndustries.join(', '));
  process.exit(1);
}

const email = `kirkham+${industry}-${index}@adobetest.com`;

generateProfile(email, industry)
  .then(({ email: e, ecid }) => {
    console.log(`Profile created: ${e}`);
    console.log(`ECID: ${ecid}`);
  })
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
