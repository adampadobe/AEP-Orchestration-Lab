#!/usr/bin/env node
/**
 * Phase 3 / 3.1 unit tests: persona parity, segment hints, ACL, rate limits.
 */

import { createHash } from 'node:crypto';
import {
  buildPersonaAttributes,
  normalizeSegmentHint,
  TRAVEL_SEGMENT_HINTS,
  FSI_SEGMENT_HINTS,
  RETAIL_SEGMENT_HINTS,
} from '../src/personaBuilder.mjs';
import { loadAuthConfig, validateMcpApiKey, validateOAuthBearer } from '../src/auth.mjs';
import { assertSandboxAllowedForAccess } from '../src/sandboxAllowlist.mjs';
import { checkBatchJobRate, checkEdgeSendRate, checkGenerateRate } from '../src/rateLimiter.mjs';
import { keyIdFromApiKey } from '../src/auditLog.mjs';
import { LAB_INDUSTRY_KEYS } from '../src/industries.mjs';
import {
  ensurePreferredLanguageOnAttributes,
  normalizeGenerateProfileParams,
  resolveTestProfileParam,
} from '../src/framework/generateProfileParams.mjs';
import { CRITICAL_RULES } from '../src/framework/labFramework.mjs';
import {
  buildDemoemeaIdentificationCore,
  buildEventIdentityMap,
  buildEventPreflightSummary,
  extractEcidFromProfileTable,
  isValidEcid,
  resolveEventIdentities,
  validateEventIdentity,
} from '../src/framework/eventIdentity.mjs';
import {
  planDualStreamGenerate,
  splitAttributesByIndustry,
} from '../src/framework/dualStreamGenerate.mjs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function mockReq(headers = {}) {
  return { headers };
}

const INDUSTRY_REQUIRED_PATHS = {
  travel: [
    'travelReservations.flightReservations.departureAirportCode',
    'travelPreferences.meal',
    'hotel.bookingDetails.hotelName',
    'hotel.checkIn.checkInMethod',
  ],
  fsi: [
    'industryFsi.householdIncomeBand',
    'industryFsi.financialProducts.checking',
    'personalFinances.creditScores',
    'personalFinances.personalTaxProfile.householdIncome.amount',
  ],
  retail: [
    'individualCharacteristics.retail.favoriteStore',
    'orderProfile.lifetimeValue',
    'scoring.retail.loyaltyProgramSignUp',
  ],
  telecom: [
    'industryTelecom.planTier',
    'telecomSubscription.bundleName',
    'telecomSubscription.mobileSubscription',
  ],
  media: [
    'industryMedia.subscriptionTier',
    'industryMedia.engagementFlags.bingeWatcher',
    'subscriptions',
  ],
  sports: [
    'industrySports.favouriteSport',
    'industrySports.fanFlags.streamLive',
    'scoring.product.affinity',
  ],
  generic: ['individualCharacteristics.core.favouriteCategory', 'homeAddress.city'],
};

function getPathValue(attrs, path) {
  if (Array.isArray(path)) {
    const [base, key] = path;
    const obj = attrs[base];
    return obj && typeof obj === 'object' ? obj[key] : undefined;
  }
  return attrs[path];
}

function testTestProfileDefaults() {
  const defaultResolved = resolveTestProfileParam({});
  assert(defaultResolved.ok && defaultResolved.test_profile === true, 'test_profile defaults true');

  const blocked = resolveTestProfileParam({ test_profile: false });
  assert(!blocked.ok && String(blocked.error).includes('test_profile_override_reason'), 'false without reason blocked');

  const override = resolveTestProfileParam({
    test_profile: false,
    test_profile_override_reason: 'production identity migration test',
  });
  assert(override.ok && override.test_profile === false, 'false with reason allowed');

  const normalized = normalizeGenerateProfileParams({ test_profile: undefined });
  assert(normalized.ok && normalized.test_profile === true, 'normalize defaults test_profile true');
}

function testPreferredLanguageOnPersona() {
  for (const industry of LAB_INDUSTRY_KEYS) {
    const attrs = buildPersonaAttributes(industry, `${industry}@test.com`);
    assert(attrs['preferredLanguage'], `${industry}: root preferredLanguage`);
    assert(attrs['preferences.preferredLanguage'], `${industry}: preferences.preferredLanguage`);
    assert(attrs['personalEmail.language'], `${industry}: personalEmail.language`);
    const lang = attrs['preferredLanguage'];
    assert(typeof lang === 'string' && lang.includes('-'), `${industry}: BCP-47 language`);
  }

  const empty = ensurePreferredLanguageOnAttributes({});
  assert(empty.appliedDefault && empty.language === 'en-US', 'empty attrs get en-US default');
  assert(empty.attributes['preferredLanguage'] === 'en-US', 'default on root path');

  const partial = ensurePreferredLanguageOnAttributes({ 'personalEmail.language': 'fr-FR' });
  assert(partial.language === 'fr-FR' && !partial.appliedDefault, 'existing language preserved');
}

function testCriticalRulesPresent() {
  assert(Array.isArray(CRITICAL_RULES) && CRITICAL_RULES.length >= 4, 'criticalRules array');
  const ids = CRITICAL_RULES.map((r) => r.id);
  assert(ids.includes('test_profile_required'), 'test_profile rule');
  assert(ids.includes('preferred_language_required'), 'language rule');
  assert(ids.includes('sandbox_config_preflight'), 'preflight rule');
  assert(ids.includes('event_identity_stitch'), 'event identity rule');
}

function testEventIdentityValidation() {
  assert(!validateEventIdentity({}).ok, 'reject empty identity');
  assert(!validateEventIdentity({ ecid: '123' }).ok, 'reject short ecid');
  assert(validateEventIdentity({ ecid: '1234567890' }).ok, 'accept ecid only');
  assert(validateEventIdentity({ email: 'a@b.com' }).ok, 'accept email only');

  const both = buildEventIdentityMap({ email: 'demo@adobetest.com', ecid: '1234567890123' });
  assert(both.ECID[0].primary === true, 'ECID primary when both');
  assert(both.Email[0].primary === false, 'Email secondary when ecid present');

  const emailOnly = buildEventIdentityMap({ email: 'demo@adobetest.com' });
  assert(emailOnly.Email[0].primary === true, 'Email primary when ecid absent');
  assert(!emailOnly.ECID, 'no ECID key when absent');

  const core = buildDemoemeaIdentificationCore({ email: 'demo@adobetest.com', ecid: '9999999999' });
  assert(core.ecid === '9999999999' && core.email === 'demo@adobetest.com', 'tenant core mirrors ids');

  const extracted = extractEcidFromProfileTable({
    ecid: '1111111111',
    rows: [{ path: '_demoemea.identification.core.ecid', value: '2222222222' }],
  });
  assert(extracted === '1111111111', 'prefer top-level ecid');

  const resolved = resolveEventIdentities({
    email: 'demo@adobetest.com',
    profileEcid: '3333333333',
  });
  assert(resolved.ok && resolved.ecid === '3333333333', 'auto-resolve ecid from profile');
  assert(resolved.warnings.length >= 1, 'warn on auto-resolve');

  const emailOnlyWarn = resolveEventIdentities({ email: 'solo@adobetest.com' });
  assert(emailOnlyWarn.ok && !emailOnlyWarn.ecid, 'email-only resolves');
  assert(emailOnlyWarn.warnings.some((w) => w.includes('email-only')), 'warn email-only');

  const preflight = buildEventPreflightSummary({
    sandbox: 'apalmer',
    email: 'demo@adobetest.com',
    ecid: '1234567890',
    target_id: 'lab-event-tool-edge',
    targets: [{ id: 'lab-event-tool-edge', dataStreamId: 'ds-abc', transport: 'edge' }],
  });
  assert(preflight.identity.identityMap.ECID, 'preflight identityMap');
  assert(preflight.target.resolved?.dataStreamId === 'ds-abc', 'preflight target resolved');

  assert(isValidEcid('1234567890'), 'isValidEcid true');
  assert(!isValidEcid('abc'), 'isValidEcid false');
}

function testIndustryPersonas() {
  for (const industry of LAB_INDUSTRY_KEYS) {
    const attrs = buildPersonaAttributes(industry, `${industry}@test.com`);
    assert(Object.keys(attrs).length > 5, `${industry}: non-empty persona`);
    for (const path of INDUSTRY_REQUIRED_PATHS[industry] || []) {
      const val = getPathValue(attrs, path);
      const label = Array.isArray(path) ? `${path[0]}.${path[1]}` : path;
      assert(val != null && val !== '', `${industry}: ${label}`);
    }
  }
}

function testFsiIncomeCreditCorrelation() {
  const samples = Array.from({ length: 30 }, () => buildPersonaAttributes('fsi', 'fsi@test.com', 'high_net_worth'));
  for (const attrs of samples) {
    const score = Number(attrs['individualCharacteristics.core.creditScore']);
    assert(score >= 780, 'high_net_worth credit score >= 780');
    assert(attrs['industryFsi.householdIncomeBand'] === '500k_plus', 'high_net_worth income band');
  }

  const rebuild = buildPersonaAttributes('fsi', 'rebuild@test.com', 'credit_rebuild');
  const rebuildScore = Number(rebuild['individualCharacteristics.core.creditScore']);
  assert(rebuildScore <= 579, 'credit_rebuild score <= 579');
  assert(rebuild['industryFsi.creditScoreBand'] === 'poor', 'credit_rebuild poor band');
}

function testSegmentHints() {
  for (const hint of TRAVEL_SEGMENT_HINTS) {
    const attrs = buildPersonaAttributes('travel', 'hotel@test.com', hint);
    assert(attrs['hotel.bookingDetails.hotelName'], `${hint}: hotelName`);
    assert(attrs['hotel.bookingDetails.totalNights'] >= 5, `${hint}: totalNights`);
    assert(attrs['scoring.core.propensityScore'] != null, `${hint}: propensity`);
  }

  const reactivation = buildPersonaAttributes('travel', 'r@test.com', 'hotel_reactivation');
  const checkout = new Date(String(reactivation['hotel.bookingDetails.checkOutDate']));
  const daysAgo = (Date.now() - checkout.getTime()) / 86400000;
  assert(daysAgo > 365, 'reactivation checkout >365 days ago');

  const highValue = buildPersonaAttributes('travel', 'hv@test.com', 'hotel_high_value');
  assert(highValue['loyalty.tier'] === 'platinum', 'high value platinum');

  for (const hint of FSI_SEGMENT_HINTS) {
    const norm = normalizeSegmentHint(hint, 'fsi');
    assert(norm === hint, `fsi hint ${hint} normalizes`);
    const attrs = buildPersonaAttributes('fsi', 'fsi@test.com', hint);
    assert(attrs['personalFinances.creditScores'], `fsi ${hint} creditScores`);
  }

  for (const hint of RETAIL_SEGMENT_HINTS) {
    const norm = normalizeSegmentHint(hint, 'retail');
    assert(norm === hint, `retail hint ${hint} normalizes`);
    const attrs = buildPersonaAttributes('retail', 'retail@test.com', hint);
    assert(attrs['orderProfile.lifetimeValue'] != null, `retail ${hint} LTV`);
  }

  const vip = buildPersonaAttributes('retail', 'vip@test.com', 'loyalty_vip');
  assert(vip['loyalty.tier'] === 'platinum', 'loyalty_vip platinum');
  assert(Number(vip['orderProfile.lifetimeValue']) >= 25000, 'loyalty_vip high LTV');

  const abandoner = buildPersonaAttributes('retail', 'ab@test.com', 'cart_abandoner');
  assert(Number(abandoner['scoring.core.propensityScore']) <= 0.35 || Number(abandoner['scoring.core.propensityScore']) <= 35,
    'cart_abandoner low propensity');

  const badTravel = normalizeSegmentHint('invalid', 'travel');
  assert(String(badTravel).includes('Unknown'), 'invalid travel hint error');

  const badRetail = normalizeSegmentHint('hotel_high_value', 'retail');
  assert(String(badRetail).includes('Unknown'), 'travel hint rejected for retail');

  const badGeneric = normalizeSegmentHint('loyalty_vip', 'generic');
  assert(String(badGeneric).includes('not supported'), 'retail hint rejected for generic');
}

function testTravelPortalParity() {
  const attrs = buildPersonaAttributes('travel', 'travel@test.com');
  assert(attrs['travelReservations.flightReservations.departureAirportCode'], 'flight departureAirportCode');
  assert(attrs['travelReservations.flightReservations.arrivalAirportCode'], 'flight arrivalAirportCode');
  assert(attrs['travelReservations.flightReservations.flightNumber'], 'flight flightNumber');
  assert(attrs['travelReservations.flightReservations.multiLeg.multiLeg'] != null, 'flight multiLeg');
  assert(attrs['travelPreferences.meal'], 'travelPreferences.meal');
  assert(attrs['travelPreferences.seat'], 'travelPreferences.seat');
  assert(attrs['hotel.bookingDetails.hotelName'], 'hotel.bookingDetails.hotelName');
  assert(attrs['hotel.checkIn.checkInMethod'], 'hotel.checkIn.checkInMethod');
  assert(attrs['hotel.checkOut.checkOutMethod'], 'hotel.checkOut.checkOutMethod');
  assert(
    !attrs['individualCharacteristics.travel.recentStay'],
    'no UI-only individualCharacteristics.travel.recentStay',
  );
  assert(!attrs['identification.core.loyaltyId'], 'travel default: no loyalty');

  const withLoyalty = buildPersonaAttributes('travel', 'loyal@test.com', null, { loyalty_member: true });
  const loyaltyId = String(withLoyalty['identification.core.loyaltyId'] || '');
  assert(loyaltyId.startsWith('LYL-'), 'loyalty_member uses LYL- prefix');
  assert(withLoyalty['loyalty.tier'], 'loyalty_member sets tier');
  assert(withLoyalty['loyaltyDetails.points'] != null, 'loyalty_member sets points');
}

function testIndustryPortalParity() {
  const fsi = buildPersonaAttributes('fsi', 'fsi@test.com');
  assert(fsi['industryFsi.creditScoreBand'], 'fsi creditScoreBand');
  assert(fsi['personalFinances.creditScores'], 'fsi creditScores array');
  assert(!fsi['individualCharacteristics.fsi.financialDetails.creditScore'], 'fsi: no tenant fsi subtree');

  const retail = buildPersonaAttributes('retail', 'retail@test.com');
  assert(retail['individualCharacteristics.retail.cobrandedCreditCardHolder'] != null, 'retail cobranded flag');
  assert(retail['orderProfile.lastOrderSku'], 'retail lastOrderSku');
  assert(retail['scoring.retail.loyaltyProgramSignUp'] != null, 'retail propensity');

  const retailNoOrder = buildPersonaAttributes('retail', 'r2@test.com', null, { last_order_details: false });
  assert(retailNoOrder['orderProfile.lastOrderDate'], 'retail recency lastOrderDate');
  assert(!retailNoOrder['orderProfile.lastOrderSku'], 'retail last_order_details:false skips SKU block');

  const telecom = buildPersonaAttributes('telecom', 'tel@test.com');
  assert(telecom['industryTelecom.serviceFlags.hasMobile'] != null, 'telecom serviceFlags');
  assert(telecom['telecomSubscription.bundleName'], 'telecom bundleName');

  const media = buildPersonaAttributes('media', 'media@test.com');
  assert(media['industryMedia.primaryGenre'], 'media primaryGenre');
  assert(Array.isArray(media.subscriptions) && media.subscriptions.length, 'media subscriptions array');
  assert(!media['media.accountType'], 'media: no UI-only media.* subtree');

  const sports = buildPersonaAttributes('sports', 'sports@test.com');
  assert(sports['individualCharacteristics.core.favouriteCategory'] === 'sports', 'sports favouriteCategory');
  assert(sports['scoring.product.affinity'], 'sports product affinity');
  assert(!sports['gym.ptSession'], 'sports: no gym.ptSession');

  const generic = buildPersonaAttributes('generic', 'gen@test.com');
  assert(generic['homeAddress.street1'], 'generic homeAddress');
  assert(!generic['identification.core.loyaltyId'], 'generic default: no loyalty');

  for (const industry of ['fsi', 'retail', 'telecom', 'media', 'sports']) {
    const loyal = buildPersonaAttributes(industry, `${industry}@test.com`, null, { loyalty_member: true });
    assert(String(loyal['identification.core.loyaltyId'] || '').startsWith('LYL-'), `${industry} loyalty_member LYL-`);
  }
}

function testDualStreamGeneratePlan() {
  const email = 'travel.demo+001@adobetest.com';
  const attrs = buildPersonaAttributes('travel', email, 'hotel_reactivation');
  const split = splitAttributesByIndustry(attrs, 'travel');
  assert(
    split.genericAttrs['person.name.firstName'] != null,
    'travel persona keeps person.* on generic stream',
  );
  assert(
    split.industryAttrs['travelReservations.flightReservations.departureAirportCode'] != null,
    'travel persona keeps flight reservations on industry stream',
  );
  assert(
    split.industryAttrs['travelPreferences.meal'] != null,
    'travel persona keeps travelPreferences on industry stream',
  );
  assert(
    split.genericAttrs['scoring.churn.churnPrediction'] != null,
    'scoring.* routes to generic stream',
  );
  assert(
    split.genericAttrs['identification.core.loyaltyId'] == null,
    'travel default loyalty omitted from generic stream',
  );
  assert(
    split.industryAttrs['hotel.bookingDetails.hotelName'] != null,
    'hotel subtree routes to travel stream',
  );

  const plan = planDualStreamGenerate({ industry: 'travel', attributes: attrs, email });
  assert(plan.dualStream === true, 'travel generate plan is dual-stream');
  assert(plan.steps.length === 2, 'travel generate plan has generic + travel steps');
  assert(plan.steps[0].industry === 'generic' && plan.steps[0].role === 'generic_base', 'step 1 generic base');
  assert(
    plan.steps[1].industry === 'travel' && plan.steps[1].appendIfExisting === true,
    'step 2 travel overlay appendIfExisting',
  );

  const genericOnly = planDualStreamGenerate({
    industry: 'generic',
    attributes: buildPersonaAttributes('generic', email),
    email,
  });
  assert(genericOnly.dualStream === false, 'generic industry single stream');
  assert(genericOnly.steps.length === 1, 'generic single step');
}

async function run() {
  process.env.AEP_LAB_MCP_API_KEY = 'phase3-test-key';
  process.env.AEP_LAB_MCP_BATCH_STORE = 'memory';
  process.env.AEP_LAB_MCP_FIRESTORE = 'off';

  testCriticalRulesPresent();
  testEventIdentityValidation();
  testTestProfileDefaults();
  testPreferredLanguageOnPersona();
  testIndustryPersonas();
  testTravelPortalParity();
  testIndustryPortalParity();
  testFsiIncomeCreditCorrelation();
  testSegmentHints();
  testDualStreamGeneratePlan();

  loadAuthConfig();
  const cfg = loadAuthConfig();
  assert(keyIdFromApiKey('phase3-test-key') === cfg.keyId, 'keyId stable');

  const access = {
    allowedSandboxes: ['kirkham'],
    allowedSet: new Set(['kirkham']),
  };
  assert(assertSandboxAllowedForAccess('kirkham', access).ok, 'kirkham allowed');
  assert(!assertSandboxAllowedForAccess('apalmer', access).ok, 'apalmer blocked for kirkham ACL');

  const genKey = 'rate-gen-' + Date.now();
  for (let i = 0; i < 30; i += 1) {
    assert(checkGenerateRate(genKey).ok, `generate rate ${i}`);
  }
  assert(!checkGenerateRate(genKey).ok, 'generate rate capped at 30/min');

  const batchKey = 'rate-batch-' + Date.now();
  for (let i = 0; i < 3; i += 1) {
    assert(checkBatchJobRate(batchKey).ok, `batch rate ${i}`);
  }
  assert(!checkBatchJobRate(batchKey).ok, 'batch rate capped at 3/hr');

  const edgeKey = 'rate-edge-' + Date.now();
  for (let i = 0; i < 30; i += 1) {
    assert(checkEdgeSendRate(edgeKey).ok, `edge send rate ${i}`);
  }
  assert(!checkEdgeSendRate(edgeKey).ok, 'edge send rate capped at 30/min');

  const { registerListEventTargetsTool } = await import('../src/tools/listEventTargets.mjs');
  const { registerSendProfileEventTool } = await import('../src/tools/sendProfileEvent.mjs');
  const { registerSendEdgeEventTool } = await import('../src/tools/sendEdgeEvent.mjs');
  const { registerPreflightProfileEventTool } = await import('../src/tools/preflightProfileEvent.mjs');
  const { registerBrandScrapeTools } = await import('../src/tools/brandScrape.mjs');
  assert(typeof registerListEventTargetsTool === 'function', 'registerListEventTargetsTool');
  assert(typeof registerSendProfileEventTool === 'function', 'registerSendProfileEventTool');
  assert(typeof registerSendEdgeEventTool === 'function', 'registerSendEdgeEventTool');
  assert(typeof registerPreflightProfileEventTool === 'function', 'registerPreflightProfileEventTool');
  assert(typeof registerBrandScrapeTools === 'function', 'registerBrandScrapeTools');
  const { registerGenerateProfileFromBrandScrapeTools } = await import('../src/tools/generateProfileFromBrandScrape.mjs');
  assert(typeof registerGenerateProfileFromBrandScrapeTools === 'function', 'registerGenerateProfileFromBrandScrapeTools');
  const { registerPrepareDemoFromBrandScrapeTool } = await import('../src/tools/prepareDemoFromBrandScrape.mjs');
  const { registerCreateJourneyFromBrandScrapeTool } = await import('../src/tools/createJourneyFromBrandScrape.mjs');
  assert(typeof registerPrepareDemoFromBrandScrapeTool === 'function', 'registerPrepareDemoFromBrandScrapeTool');
  assert(typeof registerCreateJourneyFromBrandScrapeTool === 'function', 'registerCreateJourneyFromBrandScrapeTool');

  const { summarizeScrapeForDemoPrep } = await import('../src/brandScrapeDemoPrep.mjs');
  const demoSummary = summarizeScrapeForDemoPrep({
    scrapeId: 'sc1',
    brandName: 'Acme',
    industry: 'Travel & Hospitality',
    scrapeStatus: 'complete',
    personas: { personas: [{ name: 'A' }, { name: 'B' }] },
    campaigns: { campaigns: [{ name: 'Summer sale' }] },
    segments: { segments: [{ name: 'VIP' }] },
  });
  assert(demoSummary.industry === 'travel' && demoSummary.personasCount === 2, 'summarizeScrapeForDemoPrep');

  const { getBrandScraperCfOrigin, getLabCloudFunctionsOrigin } = await import('../src/labApiClient.mjs');
  const cfOrigin = getBrandScraperCfOrigin();
  assert(cfOrigin.includes('cloudfunctions.net'), 'brand scraper CF origin default');
  assert(getLabCloudFunctionsOrigin() === cfOrigin, 'lab CF origin alias');

  const {
    summarizeBrandScrape,
    summarizeBrandScrapeListItem,
    isBrandScrapeTerminal,
  } = await import('../src/brandScrapeSummary.mjs');
  const sampleSummary = summarizeBrandScrape({
    scrapeId: 'abc123',
    sandbox: 'apalmer',
    brandName: 'Acme',
    url: 'https://acme.example',
    scrapeStatus: 'complete',
    crawlSummary: { assets: { colors: ['#112233'], fonts: ['Inter'] }, pagesScraped: 3 },
    analysis: { about: 'Acme sells widgets.', tone: 'friendly' },
    personas: { personas: [{ name: 'Buyer' }] },
  });
  assert(sampleSummary && sampleSummary.scrapeId === 'abc123', 'summarizeBrandScrape scrapeId');
  assert(sampleSummary.colors[0] === '#112233', 'summarizeBrandScrape colors');
  assert(sampleSummary.personasCount === 1, 'summarizeBrandScrape personasCount');
  const listItem = summarizeBrandScrapeListItem({ scrapeId: 'x', brandName: 'X', scrapeStatus: 'running' });
  assert(listItem && listItem.scrapeId === 'x', 'summarizeBrandScrapeListItem');
  assert(isBrandScrapeTerminal('complete') && isBrandScrapeTerminal('failed'), 'terminal statuses');
  assert(!isBrandScrapeTerminal('running'), 'running not terminal');

  const {
    normalizeBrandScrapeUrl,
    brandScrapeUrlsMatch,
    resolveBrandScrapeFromList,
  } = await import('../src/brandScrapeResolve.mjs');
  const norm = normalizeBrandScrapeUrl('https://www.Nike.com/');
  assert(norm && norm.key === 'nike.com/', 'normalizeBrandScrapeUrl strips www');
  assert(brandScrapeUrlsMatch('https://nike.com', norm), 'url match nike');
  const sbNorm = normalizeBrandScrapeUrl('https://www.starbucks.ae/en');
  assert(sbNorm && sbNorm.key === 'starbucks.ae/en', 'normalize starbucks.ae/en');
  const sbResolved = resolveBrandScrapeFromList(
    [
      {
        scrapeId: 'home1',
        url: 'https://www.starbucks.ae/en',
        brandName: 'Homepage',
        scrapeStatus: 'complete',
        personasPresent: true,
        updatedAt: '2026-06-23T12:20:00.000Z',
      },
      {
        scrapeId: 'dup1',
        url: 'https://starbucks.ae/en',
        brandName: 'Starbucks',
        scrapeStatus: 'running',
        personasPresent: false,
        updatedAt: '2026-06-23T12:16:00.000Z',
      },
    ],
    { url: 'https://www.starbucks.ae/en', require_personas: true, require_complete: true },
  );
  assert(!sbResolved.need_new_scrape && sbResolved.scrape_id === 'home1', 'resolve reuses Homepage complete starbucks scrape');
  const resolved = resolveBrandScrapeFromList(
    [
      {
        scrapeId: 'old1',
        url: 'https://www.nike.com',
        scrapeStatus: 'complete',
        personasPresent: true,
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        scrapeId: 'new1',
        url: 'https://nike.com/',
        scrapeStatus: 'complete',
        personasPresent: true,
        updatedAt: '2026-06-01T00:00:00.000Z',
      },
      {
        scrapeId: 'run1',
        url: 'https://nike.com',
        scrapeStatus: 'running',
        personasPresent: false,
        updatedAt: '2026-06-20T00:00:00.000Z',
      },
    ],
    { url: 'https://www.nike.com/', require_personas: true, require_complete: true },
  );
  assert(!resolved.need_new_scrape && resolved.scrape_id === 'new1', 'resolve picks newest complete nike scrape');
  const needNew = resolveBrandScrapeFromList([], { url: 'https://acme.example', prefer_existing: true });
  assert(needNew.need_new_scrape, 'empty list needs new scrape');

  const {
    inferLabIndustryFromScrape,
    inferLabIndustryFromRecord,
    extractScrapeIndustryTaxonomy,
    mapTaxonomyToLabIndustry,
    parsePersonaName,
    buildAttributesFromBrandScrapePersona,
    inferSegmentHintFromScrape,
    suggestEmailForScrapePersona,
  } = await import('../src/brandScrapePersonaMap.mjs');
  assert(inferLabIndustryFromScrape('Travel & Hospitality').industry === 'travel', 'scrape industry travel');
  assert(inferLabIndustryFromScrape('Financial services').industry === 'fsi', 'scrape industry fsi');
  assert(inferLabIndustryFromScrape('FOOD & BEVERAGE').industry === 'retail', 'Starbucks food beverage → retail');
  assert(inferLabIndustryFromScrape('Food & beverage').industry === 'retail', 'food beverage canonical');
  assert(mapTaxonomyToLabIndustry('Retail & E-commerce').industry === 'retail', 'mapTaxonomy alias');
  assert(inferLabIndustryFromScrape('Telecommunications').industry === 'telecom', 'telecom taxonomy');
  assert(inferLabIndustryFromScrape('Media & Entertainment').industry === 'media', 'media taxonomy');
  const starbucksRecord = {
    brandName: 'Starbucks',
    industryInfo: { industry: 'Food & beverage', confidence: 'high' },
  };
  assert(extractScrapeIndustryTaxonomy(starbucksRecord) === 'Food & beverage', 'extract from industryInfo');
  assert(inferLabIndustryFromRecord(starbucksRecord).industry === 'retail', 'Starbucks record → retail');
  const etihadRecord = { industry: 'Travel & Hospitality' };
  assert(inferLabIndustryFromRecord(etihadRecord).industry === 'travel', 'record top-level industry');
  const { scrapeIndustryLabFields } = await import('../src/brandScrapeSummary.mjs');
  const summaryFields = scrapeIndustryLabFields({ industry: 'Food & beverage' });
  assert(summaryFields.lab_industry === 'retail', 'summary lab_industry retail');
  assert(summaryFields.scrape_industry === 'Food & beverage', 'summary scrape_industry');
  const parsed = parsePersonaName('Sarah Chen');
  assert(parsed.firstName === 'Sarah' && parsed.lastName === 'Chen', 'parsePersonaName');
  const emailSuggest = suggestEmailForScrapePersona({
    persona: { name: 'Sarah Chen' },
    brandName: 'Acme Hotels',
    personaIndex: 0,
  });
  assert(emailSuggest.includes('@adobetest.com'), 'suggestEmail domain');
  assert(inferSegmentHintFromScrape('travel', ['High value hotel guest']) === 'hotel_high_value', 'segment infer hv');
  const built = buildAttributesFromBrandScrapePersona({
    persona: {
      name: 'Sarah Chen',
      age: 34,
      location: 'London, UK',
      occupation: 'Product Manager',
      preferred_channels: ['Email', 'Web'],
      suggested_segments: ['Lapsed hotel guest'],
    },
    email: 'sarah.chen+1@adobetest.com',
    industry: 'travel',
  });
  assert(built.attributes['person.name.firstName'] === 'Sarah', 'overlay firstName');
  assert(built.segmentHint === 'hotel_reactivation', 'overlay segment hotel_reactivation');
  assert(built.overlays.includes('person.name'), 'overlays tracked');

  const withMobile = buildAttributesFromBrandScrapePersona({
    persona: { name: 'Chloe Park' },
    email: 'adamp.adobedemo+23062026-1@gmail.com',
    industry: 'retail',
    mobilePhone: '+447425627462',
  });
  assert(withMobile.attributes['mobilePhone.number'] === '+447425627462', 'stored mobile overlay');
  assert(withMobile.overlays.includes('mobilePhone.number'), 'mobile overlay tracked');
  assert(withMobile.attributes['person.name.firstName'] === 'Chloe', 'persona name independent of email');

  const {
    shouldUseStoredGenerationPrefs,
    STORED_PREFS_MISSING_HINT,
  } = await import('../src/tools/generationPrefs.mjs');
  assert(shouldUseStoredGenerationPrefs(undefined, undefined) === true, 'default use stored when no email');
  assert(shouldUseStoredGenerationPrefs(undefined, 'a@b.com') === false, 'explicit email skips stored');
  assert(shouldUseStoredGenerationPrefs(false, undefined) === false, 'explicit false skips stored');
  assert(shouldUseStoredGenerationPrefs(true, 'a@b.com') === true, 'explicit true with email');
  assert(STORED_PREFS_MISSING_HINT.includes('Profile Generation'), 'prefs missing hint mentions portal');

  const {
    PORTAL_EVENT_TYPES,
    buildRetailJourneyEventPack,
    resolveDemoEventSequence,
    toGeneratorPostBody,
  } = await import('../src/framework/demoEventPacks.mjs');
  const starbucksPack = buildRetailJourneyEventPack({ brandName: 'Starbucks', baseUrl: 'https://www.starbucks.ae' });
  assert(starbucksPack.length === 4, 'retail journey pack has 4 events');
  assert(starbucksPack[0].event_type === PORTAL_EVENT_TYPES.productViews, 'step1 productViews');
  assert(starbucksPack[3].event_type === PORTAL_EVENT_TYPES.transaction, 'step4 transaction');
  assert(starbucksPack[0].view_name.includes('Pike Place'), 'Starbucks default product');
  const retailResolved = resolveDemoEventSequence({ industry: 'retail' });
  assert(retailResolved.sequence === 'retail_journey', 'retail industry defaults retail_journey');
  assert(retailResolved.events.length === 4, 'retail resolved 4 events');
  const travelResolved = resolveDemoEventSequence({ industry: 'travel' });
  assert(travelResolved.sequence === 'single_page_view', 'travel defaults single page view');
  assert(travelResolved.events[0].event_type === PORTAL_EVENT_TYPES.pageViews, 'single page view type');
  const genBody = toGeneratorPostBody(starbucksPack[0], {
    email: 'demo+001@adobetest.com',
    ecid: '62722406001178632594092146103219305888',
    target_id: 'lab-event-tool-edge',
  });
  assert(genBody.eventType === 'commerce.productViews', 'generator body eventType camelCase');
  assert(genBody.viewName && genBody.ecid && genBody.email, 'generator body identity fields');

  const { registerSendRetailJourneyEventsTool } = await import('../src/tools/sendRetailJourneyEvents.mjs');
  assert(typeof registerSendRetailJourneyEventsTool === 'function', 'registerSendRetailJourneyEventsTool');

  const oauthOff = validateOAuthBearer(mockReq());
  assert(!oauthOff.ok && oauthOff.message.includes('not configured'), 'oauth off by default');

  process.env.AEP_LAB_MCP_OAUTH_ISSUER = 'https://issuer.example';
  process.env.AEP_LAB_MCP_OAUTH_AUDIENCE = 'mcp-audience';
  const oauthStub = validateOAuthBearer(mockReq({ authorization: 'Bearer fake' }));
  assert(!oauthStub.ok && oauthStub.message.includes('not implemented'), 'oauth stub when env set');

  const goodKey = await validateMcpApiKey(mockReq({ 'x-aep-lab-mcp-key': 'phase3-test-key' }));
  assert(goodKey.ok, 'api key ok');

  console.log(JSON.stringify({
    ok: true,
    tests: 'phase3.4 event identity + critical rules + testProfile/language + persona + all-industry portal parity + ACL + rate limits',
    industries: LAB_INDUSTRY_KEYS.length,
    segmentPacks: { travel: TRAVEL_SEGMENT_HINTS, fsi: FSI_SEGMENT_HINTS, retail: RETAIL_SEGMENT_HINTS },
  }));
}

run().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err.message || err) }));
  process.exit(1);
});
