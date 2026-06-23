import {
  assign,
  pickByWeight,
  randomBetween,
  randomPick,
  weightedBool,
} from './utils.mjs';

const BUNDLE_PROFILES = [
  {
    name: 'Family Quad-Play',
    weight: 0.40,
    planTier: 'premium',
    monthlySpend: '100_200',
    dataAllowance: 'unlimited',
    connectionType: 'fiber',
    mediaChannels: 100,
    landline: { voicemail: true, callerID: true },
    hasMobile: true,
    hasBroadband: true,
    hasTv: true,
    hasFamilyPlan: true,
  },
  {
    name: 'Single Mobile-Only',
    weight: 0.30,
    planTier: 'standard',
    monthlySpend: 'under_25',
    dataAllowance: '5_25gb',
    connectionType: null,
    mediaChannels: 0,
    landline: null,
    hasMobile: true,
    hasBroadband: false,
    hasTv: false,
    hasFamilyPlan: false,
  },
  {
    name: 'Streaming + Internet',
    weight: 0.20,
    planTier: 'standard',
    monthlySpend: '50_100',
    dataAllowance: 'unlimited',
    connectionType: 'cable',
    mediaChannels: 80,
    landline: null,
    hasMobile: false,
    hasBroadband: true,
    hasTv: true,
    hasFamilyPlan: false,
  },
  {
    name: 'Senior Landline + Internet',
    weight: 0.10,
    planTier: 'basic',
    monthlySpend: '25_50',
    dataAllowance: '5_25gb',
    connectionType: 'dsl',
    mediaChannels: 0,
    landline: { voicemail: true, callerID: true },
    hasMobile: false,
    hasBroadband: true,
    hasTv: false,
    hasFamilyPlan: false,
  },
];

const PLAN_LEVEL_BY_PLAN = {
  basic: 'Basic',
  standard: 'Standard',
  premium: 'Premium',
  unlimited: 'Unlimited',
};

const SPEED_BY_CONNECTION = {
  fiber: { dlMin: 500, dlMax: 1000, ulMin: 100, ulMax: 500 },
  cable: { dlMin: 100, dlMax: 300, ulMin: 25, ulMax: 50 },
  dsl: { dlMin: 25, dlMax: 50, ulMin: 5, ulMax: 10 },
};

const CONTRACT_END_BANDS = ['under_3m', '3_12m', '1_2y', 'over_2y'];
const DEVICE_TIERS = ['budget', 'mid_range', 'flagship'];
const NETWORK_NPS = ['detractor', 'passive', 'promoter'];

/**
 * Bundle-coherent telecom persona (mirrors profile-generation-telecom.js).
 * @returns {Record<string, unknown>}
 */
export function buildTelecomPersonaAttributes() {
  const attrs = {};
  const bundle = pickByWeight(BUNDLE_PROFILES);
  const contractBand = randomPick(CONTRACT_END_BANDS);
  const isUnder1Yr = contractBand === 'under_3m';
  const tier = bundle.planTier;
  const planLevel = PLAN_LEVEL_BY_PLAN[tier] || 'Standard';

  assign(attrs, 'industryTelecom.planTier', tier);
  assign(attrs, 'industryTelecom.monthlySpendBand', bundle.monthlySpend);
  assign(attrs, 'industryTelecom.dataAllowance', bundle.dataAllowance);
  assign(attrs, 'industryTelecom.contractEndBand', contractBand);
  assign(attrs, 'industryTelecom.deviceTier', randomPick(DEVICE_TIERS));
  assign(attrs, 'industryTelecom.networkNps', randomPick(NETWORK_NPS));
  assign(attrs, 'industryTelecom.serviceFlags.hasMobile', bundle.hasMobile);
  assign(attrs, 'industryTelecom.serviceFlags.hasBroadband', bundle.hasBroadband);
  assign(attrs, 'industryTelecom.serviceFlags.hasTv', bundle.hasTv);
  assign(attrs, 'industryTelecom.serviceFlags.hasFamilyPlan', bundle.hasFamilyPlan);
  assign(attrs, 'industryTelecom.serviceFlags.recentNetworkIssue', weightedBool(0.20));
  assign(attrs, 'industryTelecom.serviceFlags.upgradeEligible', !isUnder1Yr && weightedBool(0.25));

  assign(attrs, 'telecomSubscription.bundleName', bundle.name);
  assign(attrs, 'telecomSubscription.mobileSubscription', [{
    planLevel,
    earlyUpgradeEnrollment: !isUnder1Yr && weightedBool(0.20),
    portedNumber: weightedBool(0.25),
  }]);

  if (bundle.connectionType) {
    const speeds = SPEED_BY_CONNECTION[bundle.connectionType] || SPEED_BY_CONNECTION.cable;
    const isUnlimited = bundle.dataAllowance === 'unlimited';
    assign(attrs, 'telecomSubscription.internetSubscription', [{
      connectionType: bundle.connectionType,
      downloadSpeed: randomBetween(speeds.dlMin, speeds.dlMax),
      uploadSpeed: randomBetween(speeds.ulMin, speeds.ulMax),
      dataCap: isUnlimited ? randomPick([1000, 2000]) : randomPick([100, 250, 500]),
      selfSetup: weightedBool(0.55),
    }]);
  }

  if (bundle.mediaChannels > 0) {
    assign(attrs, 'telecomSubscription.mediaSubscription', [{ channels: bundle.mediaChannels }]);
  }

  if (bundle.landline) {
    assign(attrs, 'telecomSubscription.landlineSubscription', [{
      voicemail: bundle.landline.voicemail,
      callerID: bundle.landline.callerID,
    }]);
  }

  return attrs;
}
