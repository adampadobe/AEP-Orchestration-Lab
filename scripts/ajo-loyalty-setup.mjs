#!/usr/bin/env node
/**
 * Idempotent AJO Loyalty Challenges lab setup for a sandbox (default: apalmer).
 *
 * - GET/PUT loyalty org config (identity namespace loyaltyId)
 * - Ensure reward provider exists (reuse known guid or register)
 * - Pick lab audience from Platform audiences API
 * - Create event definition + purchase task + Standard challenge (draft → publish)
 * - Attempt journey shell via POST /challenges/initialize + PUT journeys/from-challenge
 *
 * Policy: call platform.adobe.io from terminal (see docs/AJO_LOYALTY_CHALLENGES.md).
 *
 * Usage:
 *   npm run ajo:loyalty-setup -- --sandbox apalmer
 *   npm run ajo:loyalty-setup -- --dry-run
 *
 * Env: ADOBE_* from ~/.config/adobe-ims/credentials.env
 *      LOYALTY_PROVIDER_API_KEY (or legacy FAKE_LOYALTY_API_KEY if provider must be registered)
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const credPath = join(homedir(), '.config', 'adobe-ims', 'credentials.env');

const DEFAULT_PROVIDER_HOST =
  process.env.LOYALTY_PROVIDER_HOST || 'loyalty-reward-provider-a5xduykcsq-uc.a.run.app';
const LAB_NAMESPACE = 'loyaltyId';
const LAB_EVENT_NAME = 'AEP Lab Coffee Purchase Event';
const LAB_EVENT_IDENTIFIER = 'loyalty.coffee.purchase';
const LAB_TASK_ID = 'aep-lab-coffee-purchase-task';
const LAB_CHALLENGE_NAME = 'Buy 3 Coffees — Lab Challenge';
const COFFEE_PURCHASE_GOAL = 3;
const COFFEE_REWARD_POINTS = '100';
const EVENT_TRANSFORMER =
  '{ "loyaltyId": _demoemea.identification.core.loyaltyId, "quantity": 1, "productCategory": "coffee" }';

function defaultFulfillUrl(sandbox) {
  const sb = String(sandbox || 'apalmer').trim().toLowerCase();
  return `https://${DEFAULT_PROVIDER_HOST}/${sb}/v1/fulfill`;
}

function providerDisplayName(sandbox) {
  return `${String(sandbox || 'apalmer').trim().toLowerCase()} loyalty provider`;
}

function loadEnvFile(filePath) {
  const out = {};
  if (!filePath || !existsSync(filePath)) return out;
  for (const line of readFileSync(filePath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

function mergeCredentialsIntoEnv(filePath) {
  for (const [k, v] of Object.entries(loadEnvFile(filePath))) {
    if (v == null || String(v).trim() === '') continue;
    if (process.env[k] == null || String(process.env[k]).trim() === '') process.env[k] = v;
  }
}

function parseArgs(argv) {
  const out = {
    sandbox: '',
    providerGuid: '',
    fulfillUrl: '',
    audienceId: '',
    dryRun: false,
    skipJourney: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--sandbox' && argv[i + 1]) out.sandbox = String(argv[++i]).trim();
    else if (a === '--provider-guid' && argv[i + 1]) out.providerGuid = String(argv[++i]).trim();
    else if (a === '--fulfill-url' && argv[i + 1]) out.fulfillUrl = String(argv[++i]).trim();
    else if (a === '--audience-id' && argv[i + 1]) out.audienceId = String(argv[++i]).trim();
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--skip-journey') out.skipJourney = true;
  }
  return out;
}

async function imsToken() {
  const clientId = process.env.ADOBE_CLIENT_ID || process.env.ADOBE_API_KEY;
  const clientSecret = process.env.ADOBE_CLIENT_SECRET;
  const scopes = process.env.ADOBE_SCOPES;
  if (!clientId || !clientSecret || !scopes) {
    throw new Error('Missing ADOBE_CLIENT_ID, ADOBE_CLIENT_SECRET, or ADOBE_SCOPES.');
  }
  const imsUrl = process.env.ADOBE_IMS_TOKEN_URL || 'https://ims-na1.adobelogin.com/ims/token/v3';
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
    scope: scopes,
  });
  const r = await fetch(imsUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(`IMS ${r.status}: ${data.error_description || data.error || r.statusText}`);
  }
  return { token: data.access_token, clientId };
}

function platformHeaders(auth) {
  return {
    Authorization: `Bearer ${auth.token}`,
    'x-api-key': auth.clientId,
    'x-gw-ims-org-id': auth.orgId,
    'x-sandbox-name': auth.sandbox,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

async function loyaltyFetch(auth, method, path, json) {
  const url = `https://platform.adobe.io/ajo${path.startsWith('/') ? path : `/${path}`}`;
  const headers = platformHeaders(auth);
  const init = { method, headers };
  if (json != null && method !== 'GET') init.body = JSON.stringify(json);
  const res = await fetch(url, init);
  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { _raw: text.slice(0, 12000) };
  }
  return { res, url, parsed, text };
}

async function platformFetch(auth, url, method = 'GET', json) {
  const headers = platformHeaders(auth);
  const init = { method, headers };
  if (json != null && method !== 'GET') init.body = JSON.stringify(json);
  const res = await fetch(url, init);
  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { _raw: text.slice(0, 8000) };
  }
  return { res, parsed, text };
}

function isoDaysFromNow(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

function buildProviderPayload({ url, apiKey, sandbox }) {
  return {
    name: providerDisplayName(sandbox),
    desc: `Lab reward fulfillment gateway for ${sandbox} sandbox`,
    enabled: true,
    url,
    additionalHeaders: {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json',
    },
    rewardDefinition: {
      points: {
        name: 'Program Points',
        denomination: 'Points',
        enabled: true,
        isDefault: true,
        kvpCustom: {},
        rewardJsonata: '',
      },
    },
  };
}

function buildPurchaseTask(providerGuid) {
  return {
    taskType: 'purchase',
    taskId: LAB_TASK_ID,
    taskName: 'Buy 3 coffees',
    desc: 'Purchase task — buy 3 coffee products to earn the lab reward',
    variables: {
      goal: COFFEE_PURCHASE_GOAL,
      type: 'qty',
      include: { valuesSet: [LAB_EVENT_IDENTIFIER] },
      qtyMin: 1,
    },
    schedule: { duration: 'task', maxRepeat: 1 },
    reward: { endpoint: providerGuid, definition: 'points', rewardValue: COFFEE_REWARD_POINTS },
  };
}

function buildChallenge({ audienceId, providerGuid, task }) {
  return {
    name: LAB_CHALLENGE_NAME,
    desc: 'Buy 3 coffees, earn 100 loyalty points (AEP Orchestration Lab demo)',
    startDate: isoDaysFromNow(0),
    endDate: isoDaysFromNow(90),
    state: 'draft',
    audienceId,
    tasksToComplete: 1,
    tasks: [task],
    reward: { endpoint: providerGuid, definition: 'points', rewardValue: COFFEE_REWARD_POINTS },
  };
}

function buildJourneyMetadata(challengeId, audienceId, audienceName) {
  return {
    metadata: {
      challengeId,
      journeyName: 'Buy 3 Coffees — Lab Journey',
      numberOfTasks: 1,
      taskNames: { '0': 'Buy 3 coffees' },
      creationStatus: 'inProgress',
    },
    audienceQualification: {
      segmentId: audienceId,
      segmentName: audienceName || 'Lab audience',
    },
    content: {
      launch: {
        messages: [{ type: 'wait', name: 'Lab enrollment wait', delay: 'PT15M' }],
      },
    },
  };
}

async function pickAudience(auth, preferredId) {
  if (preferredId) return { id: preferredId, name: '(cli override)' };

  const { res, parsed } = await platformFetch(
    auth,
    'https://platform.adobe.io/data/core/ups/audiences?limit=100&sort=name:asc',
  );
  if (!res.ok) {
    throw new Error(`List audiences ${res.status}: ${parsed.message || JSON.stringify(parsed).slice(0, 400)}`);
  }
  const children = parsed.children || [];
  if (children.length === 0) throw new Error('No audiences in sandbox — create a segment first.');

  const exact = children.find((row) => row.name === 'Hotel - Recorded destination context');
  const preferred =
    exact ||
    children.find((row) => String(row.name || '').toLowerCase().includes('known email')) ||
    children.find((row) => {
      const n = String(row.name || '').toLowerCase();
      return n.includes('lab') || n.includes('loyal') || n.includes('hotel');
    });
  const pick = preferred || children[0];
  return { id: String(pick.id), name: pick.name };
}

async function ensureNamespace(auth, dryRun) {
  const got = await loyaltyFetch(auth, 'GET', '/loyalty/metadata/config');
  if (got.res.status === 403 || got.res.status === 404) {
    console.warn(`Loyalty config API ${got.res.status} — beta may be disabled.`);
    return { ok: false, config: null };
  }
  if (!got.res.ok) throw new Error(`GET config ${got.res.status}: ${JSON.stringify(got.parsed)}`);
  const config = got.parsed;
  if (config.namespace === LAB_NAMESPACE) {
    console.log(`Config namespace already "${LAB_NAMESPACE}".`);
    return { ok: true, config };
  }
  console.log(`Updating namespace "${config.namespace}" → "${LAB_NAMESPACE}"…`);
  if (dryRun) return { ok: true, config: { ...config, namespace: LAB_NAMESPACE } };
  const put = await loyaltyFetch(auth, 'PUT', '/loyalty/metadata/config', {
    ...config,
    namespace: LAB_NAMESPACE,
  });
  if (!put.res.ok) throw new Error(`PUT config ${put.res.status}: ${JSON.stringify(put.parsed)}`);
  return { ok: true, config: put.parsed };
}

function normalizeFulfillUrl(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

async function ensureProvider(auth, args, dryRun) {
  const fulfillUrl = normalizeFulfillUrl(args.fulfillUrl || defaultFulfillUrl(auth.sandbox));
  const expectedName = providerDisplayName(auth.sandbox);

  const list = await loyaltyFetch(auth, 'GET', '/loyalty/metadata/config/rewards/providers');
  if (!list.res.ok) throw new Error(`GET providers ${list.res.status}`);
  const providers = Array.isArray(list.parsed) ? list.parsed : [];
  if (args.providerGuid) {
    const byGuid = providers.find((p) => p.guid === args.providerGuid);
    if (byGuid) {
      console.log(`Reward provider found: ${byGuid.guid} (${byGuid.name})`);
      return byGuid.guid;
    }
  }
  const byUrl = providers.find((p) => normalizeFulfillUrl(p.url) === fulfillUrl);
  if (byUrl?.guid) {
    console.log(`Reward provider matched by URL: ${byUrl.guid} (${byUrl.name})`);
    return byUrl.guid;
  }
  const byName = providers.find((p) => p.name === expectedName);
  if (byName?.guid) {
    console.log(`Reward provider matched by name: ${byName.guid}`);
    return byName.guid;
  }

  const apiKey = String(
    process.env.LOYALTY_PROVIDER_API_KEY || process.env.FAKE_LOYALTY_API_KEY || '',
  ).trim();
  if (!apiKey && !dryRun) {
    throw new Error(
      'Provider not found. Set LOYALTY_PROVIDER_API_KEY to register, or pass --provider-guid for an existing provider.',
    );
  }
  console.log(`Registering reward provider "${expectedName}" at ${fulfillUrl}…`);
  if (dryRun) return args.providerGuid || '(dry-run-provider-guid)';
  const post = await loyaltyFetch(
    auth,
    'POST',
    '/loyalty/metadata/config/rewards/providers',
    buildProviderPayload({
      url: fulfillUrl,
      apiKey: apiKey || '<dry-run>',
      sandbox: auth.sandbox,
    }),
  );
  if (post.res.status === 409) {
    const refreshed = await loyaltyFetch(auth, 'GET', '/loyalty/metadata/config/rewards/providers');
    const again = Array.isArray(refreshed.parsed) ? refreshed.parsed : [];
    const existing =
      again.find((p) => p.name === expectedName)
      || again.find((p) => normalizeFulfillUrl(p.url) === fulfillUrl);
    if (existing?.guid) {
      console.log(`Reward provider already exists: ${existing.guid}`);
      return existing.guid;
    }
  }
  if (!post.res.ok) throw new Error(`POST provider ${post.res.status}: ${JSON.stringify(post.parsed)}`);
  return post.parsed.guid || args.providerGuid;
}

async function ensureEventDefinition(auth, config, dryRun) {
  const list = await loyaltyFetch(auth, 'GET', '/loyalty/metadata/config/events');
  if (!list.res.ok) throw new Error(`GET events ${list.res.status}`);
  const events = Array.isArray(list.parsed) ? list.parsed : [];
  const existing = events.find((e) => e.name === LAB_EVENT_NAME);
  if (existing?.guid) {
    console.log(`Event definition exists: ${existing.guid} (${existing.name})`);
    return existing.guid;
  }

  const payload = {
    name: LAB_EVENT_NAME,
    identifierPath: 'eventType',
    identifier: [LAB_EVENT_IDENTIFIER],
    schema: config.eventSchemaId,
    xdmSchemaId: config.eventSchemaId,
    transformer: EVENT_TRANSFORMER,
  };
  console.log('Creating event definition…');
  if (dryRun) return '(dry-run-event-guid)';
  const post = await loyaltyFetch(auth, 'POST', '/loyalty/metadata/config/events', payload);
  if (!post.res.ok) throw new Error(`POST event ${post.res.status}: ${JSON.stringify(post.parsed)}`);
  if (post.parsed?.guid) return post.parsed.guid;
  const refreshed = await loyaltyFetch(auth, 'GET', '/loyalty/metadata/config/events');
  const created = (Array.isArray(refreshed.parsed) ? refreshed.parsed : []).find(
    (e) => e.name === LAB_EVENT_NAME,
  );
  return created?.guid || '(unknown-event-guid)';
}

async function findChallenge(auth) {
  const list = await loyaltyFetch(auth, 'GET', '/loyalty/metadata/challenges?limit=50');
  if (!list.res.ok) return null;
  const children = list.parsed.children || [];
  return children.find((c) => c.name === LAB_CHALLENGE_NAME) || null;
}

async function ensureChallenge(auth, { audienceId, audienceName, providerGuid }, dryRun) {
  let existing = await findChallenge(auth);
  if (existing?._id) {
    console.log(`Challenge exists: ${existing._id} (state=${existing.state})`);
    return {
      challengeId: existing._id,
      state: existing.state,
      created: false,
      audienceId: existing.audienceId,
    };
  }

  const task = buildPurchaseTask(providerGuid);
  const challenge = buildChallenge({ audienceId, providerGuid, task });
  console.log(`Creating challenge "${LAB_CHALLENGE_NAME}" for audience ${audienceId}…`);
  if (dryRun) return { challengeId: '(dry-run-challenge-id)', state: 'draft', created: true };

  const post = await loyaltyFetch(auth, 'POST', '/loyalty/metadata/challenges', challenge);
  if (!post.res.ok) throw new Error(`POST challenge ${post.res.status}: ${JSON.stringify(post.parsed)}`);
  existing = await findChallenge(auth);
  if (!existing?._id) throw new Error('Challenge created but id not found in list.');
  return { challengeId: existing._id, state: existing.state, created: true, audienceName };
}

async function patchChallenge(auth, challengeId, body, dryRun) {
  if (dryRun) return true;
  const patch = await loyaltyFetch(auth, 'PATCH', `/loyalty/metadata/challenges/${challengeId}`, body);
  if (patch.res.status === 409 && String(patch.parsed.message || '').includes('unpublish')) {
    const unpub = await loyaltyFetch(
      auth,
      'POST',
      `/loyalty/metadata/challenges/${challengeId}/unpublish`,
    );
    if (!unpub.res.ok) throw new Error(`Unpublish ${unpub.res.status}: ${JSON.stringify(unpub.parsed)}`);
    const retry = await loyaltyFetch(auth, 'PATCH', `/loyalty/metadata/challenges/${challengeId}`, body);
    if (!retry.res.ok) throw new Error(`PATCH challenge ${retry.res.status}: ${JSON.stringify(retry.parsed)}`);
    return true;
  }
  if (!patch.res.ok) throw new Error(`PATCH challenge ${patch.res.status}: ${JSON.stringify(patch.parsed)}`);
  return true;
}

async function publishChallenge(auth, challengeId, dryRun) {
  const got = await loyaltyFetch(auth, 'GET', `/loyalty/metadata/challenges/${challengeId}`);
  if (got.parsed.state === 'published') {
    console.log('Challenge already published.');
    return true;
  }
  console.log('Publishing challenge…');
  if (dryRun) return true;
  const pub = await loyaltyFetch(auth, 'POST', `/loyalty/metadata/challenges/${challengeId}/publish`);
  if (!pub.res.ok) throw new Error(`Publish ${pub.res.status}: ${JSON.stringify(pub.parsed)}`);
  return true;
}

async function tryJourneySetup(auth, challengeId, audienceId, audienceName, dryRun, skipJourney) {
  if (skipJourney) {
    console.log('Skipping journey steps (--skip-journey).');
    return { journeyContainerId: null, journeyVersionId: null, warning: 'skipped' };
  }

  await patchChallenge(
    auth,
    challengeId,
    { journeyMetadata: buildJourneyMetadata(challengeId, audienceId, audienceName) },
    dryRun,
  );

  if (dryRun) return { journeyContainerId: null, journeyVersionId: null, warning: 'dry-run' };

  const init = await loyaltyFetch(auth, 'POST', '/loyalty/metadata/challenges/initialize', {
    challengeId,
  });
  if (!init.res.ok) {
    console.warn(
      `Journey initialize returned ${init.res.status}: ${init.parsed.message || init.parsed.detail || 'unknown'}`,
    );
    console.warn('Complete journey in Loyalty admin → Publish challenge → Generate journey if API key lacks journey authoring.');
    return { journeyContainerId: null, journeyVersionId: null, warning: init.parsed.message };
  }

  const journey = await loyaltyFetch(
    auth,
    'PUT',
    `/loyalty/metadata/journeys/from-challenge/${challengeId}?publishChallenge=false`,
  );
  if (!journey.res.ok) {
    console.warn(`Journey update ${journey.res.status}: ${journey.parsed.message || journey.parsed.detail}`);
    return {
      journeyContainerId: journey.parsed.journeyContainerId || null,
      journeyVersionId: journey.parsed.journeyVersionId || null,
      warning: journey.parsed.message,
    };
  }
  return {
    journeyContainerId: journey.parsed.journeyContainerId || null,
    journeyVersionId: journey.parsed.journeyVersionId || null,
    journeyUrl: journey.parsed.journeyUrl || null,
    warning: null,
  };
}

async function main() {
  mergeCredentialsIntoEnv(credPath);
  const args = parseArgs(process.argv);
  const sandbox = args.sandbox || process.env.ADOBE_SANDBOX_NAME || 'apalmer';
  if (!args.fulfillUrl) args.fulfillUrl = defaultFulfillUrl(sandbox);
  const orgId = process.env.ADOBE_IMS_ORG || process.env.ADOBE_ORG_ID;
  if (!orgId) throw new Error('Missing ADOBE_IMS_ORG.');

  const { token, clientId } = await imsToken();
  const auth = { token, clientId, orgId, sandbox };

  console.log(`AJO Loyalty lab setup — sandbox "${sandbox}"${args.dryRun ? ' (dry run)' : ''}`);

  const configResult = await ensureNamespace(auth, args.dryRun);
  if (!configResult.ok || !configResult.config) {
    process.exit(1);
  }

  const providerGuid = await ensureProvider(auth, args, args.dryRun);
  const eventGuid = await ensureEventDefinition(auth, configResult.config, args.dryRun);
  const audience = await pickAudience(auth, args.audienceId);
  console.log(`Audience: ${audience.id} — ${audience.name}`);

  const challengeInfo = await ensureChallenge(
    auth,
    { audienceId: audience.id, audienceName: audience.name, providerGuid },
    args.dryRun,
  );

  const boundAudienceId = challengeInfo.audienceId || audience.id;
  const boundAudienceName =
    challengeInfo.audienceId && challengeInfo.audienceId !== audience.id
      ? audience.name
      : audience.name;

  const task = buildPurchaseTask(providerGuid);
  if (challengeInfo.state !== 'published') {
    await patchChallenge(
      auth,
      challengeInfo.challengeId,
      { tasks: [task], audienceId: boundAudienceId },
      args.dryRun,
    );

    await patchChallenge(
      auth,
      challengeInfo.challengeId,
      {
        journeyMetadata: buildJourneyMetadata(
          challengeInfo.challengeId,
          boundAudienceId,
          boundAudienceName,
        ),
      },
      args.dryRun,
    );
  } else {
    console.log('Challenge published — skipping task/journeyMetadata patch.');
  }

  await publishChallenge(auth, challengeInfo.challengeId, args.dryRun);
  const journey = await tryJourneySetup(
    auth,
    challengeInfo.challengeId,
    boundAudienceId,
    boundAudienceName,
    args.dryRun,
    args.skipJourney,
  );

  const summary = {
    sandbox,
    namespace: LAB_NAMESPACE,
    providerGuid,
    providerName: providerDisplayName(sandbox),
    fulfillUrl: args.fulfillUrl,
    eventDefinitionGuid: eventGuid,
    eventIdentifier: LAB_EVENT_IDENTIFIER,
    coffeePurchaseGoal: COFFEE_PURCHASE_GOAL,
    rewardPoints: COFFEE_REWARD_POINTS,
    taskId: LAB_TASK_ID,
    audienceId: boundAudienceId,
    audienceName: boundAudienceName,
    challengeId: challengeInfo.challengeId,
    challengeName: LAB_CHALLENGE_NAME,
    journeyContainerId: journey.journeyContainerId,
    journeyVersionId: journey.journeyVersionId,
    journeyUrl: journey.journeyUrl || null,
    journeyNote: journey.warning,
  };

  console.log('\n=== Setup summary ===');
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
