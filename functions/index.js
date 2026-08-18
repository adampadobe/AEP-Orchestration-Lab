/**
 * Standalone Firebase project for AEP Decisioning lab.
 * Mirrors proxy_server.py: POST /api/aep → platform.adobe.io (or optional regional
 * `platform_base_url` such as https://platform-nld2.adobe.io), GET webhook index (allowlisted).
 */
const { onRequest } = require('firebase-functions/v2/https');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { setGlobalOptions } = require('firebase-functions/v2');
const { defineSecret } = require('firebase-functions/params');

const ADOBE_CLIENT_ID = defineSecret('ADOBE_CLIENT_ID');
const ADOBE_CLIENT_SECRET = defineSecret('ADOBE_CLIENT_SECRET');
const ADOBE_IMS_ORG = defineSecret('ADOBE_IMS_ORG');
const ADOBE_SCOPES = defineSecret('ADOBE_SCOPES');
/** Optional machine-to-machine key used by a future AJO custom action. */
const PDF_PERSONALISATION_API_KEY = defineSecret('PDF_PERSONALISATION_API_KEY');
/** Dedicated least-privilege AWS identity for private PDF output storage. */
const PDF_S3_ACCESS_KEY_ID = defineSecret('PDF_S3_ACCESS_KEY_ID');
const PDF_S3_SECRET_ACCESS_KEY = defineSecret('PDF_S3_SECRET_ACCESS_KEY');

const EASTER_EGG_MAILGUN_API_KEY = defineSecret('EASTER_EGG_MAILGUN_API_KEY');
const EASTER_EGG_MAILGUN_DOMAIN = defineSecret('EASTER_EGG_MAILGUN_DOMAIN');

/**
 * Context7 API key — used by clientJourneyV2Generate to fetch curated
 * Adobe Experience League capability snippets for the system prompt.
 * Provision once with: `firebase functions:secrets:set CONTEXT7_API_KEY`
 * (paste at the prompt — never on the command line, never in any file).
 * The key is read only via .value() inside a request handler.
 */
const CONTEXT7_API_KEY = defineSecret('CONTEXT7_API_KEY');
/** Same secret as Cloud Run LOYALTY_PROVIDER_API_KEY — ledger proxy only; never exposed to browser. */
const LOYALTY_PROVIDER_API_KEY = defineSecret('FAKE_LOYALTY_API_KEY');

/** Shared with Cloud Run agentic-travel-runner (X-Runner-Signature). Secret Manager only — never commit. */
const AGENTIC_TRAVEL_RUNNER_HMAC_SECRET = defineSecret('AGENTIC_TRAVEL_RUNNER_HMAC_SECRET');

/** Default Platform sandbox; override at deploy: `ADOBE_SANDBOX_NAME=other firebase deploy` or edit this constant. */
const DEFAULT_ADOBE_SANDBOX = 'apalmer';
const RESOLVED_ADOBE_SANDBOX = String(
  process.env.ADOBE_SANDBOX_NAME || DEFAULT_ADOBE_SANDBOX
).trim();

const { setCors } = require('./httpCors');
const { serializeFirestoreRecord } = require('./firestoreSerialize');
const { DEFAULT_PLATFORM_BASE_URL, resolvePlatformBaseUrl } = require('./adobePlatform');
const { createAdobeAuth } = require('./adobeAuth');
/** Lazy require: defer loading heavy modules until first handler use (keeps deploy analysis under timeout). */
function lazyRequireMod(p) {
  let cache;
  return new Proxy({}, {
    get(_t, prop) {
      if (!cache) cache = require(p);
      const v = cache[prop];
      return typeof v === 'function' ? v.bind(cache) : v;
    },
  });
}

const profileTableHelpers = lazyRequireMod('./profileTableHelpers');
const ipadEventProxy = lazyRequireMod('./ipadEventProxy');
const loyaltyRewardProviderProxy = lazyRequireMod('./loyaltyRewardProviderProxy');
const profileConsentPayload = lazyRequireMod('./profileConsentPayload');
const profileAudiences = lazyRequireMod('./profileAudiences');
const profileEventsService = lazyRequireMod('./profileEventsService');
const sandboxesList = lazyRequireMod('./sandboxesList');
const joLookups = lazyRequireMod('./joLookups');
const schemaViewerService = lazyRequireMod('./schemaViewerService');
const svCache = lazyRequireMod('./schemaViewerCache');
const auditEventsService = lazyRequireMod('./auditEventsService');
const schemaRegistryService = lazyRequireMod('./schemaRegistryService');
const consentInfraService = lazyRequireMod('./consentInfraService');
const consentFlowLookup = lazyRequireMod('./consentFlowLookup');
const consentConnectionStore = lazyRequireMod('./consentConnectionStore');
const genericProfileInfraService = lazyRequireMod('./genericProfileInfraService');
const genericProfileConnectionStore = lazyRequireMod('./genericProfileConnectionStore');
const travelProfileInfraService = lazyRequireMod('./travelProfileInfraService');
const travelProfileConnectionStore = lazyRequireMod('./travelProfileConnectionStore');
const fsiProfileInfraService = lazyRequireMod('./fsiProfileInfraService');
const fsiProfileConnectionStore = lazyRequireMod('./fsiProfileConnectionStore');
const telecomProfileInfraService = lazyRequireMod('./telecomProfileInfraService');
const telecomProfileConnectionStore = lazyRequireMod('./telecomProfileConnectionStore');
const retailProfileInfraService = lazyRequireMod('./retailProfileInfraService');
const retailProfileConnectionStore = lazyRequireMod('./retailProfileConnectionStore');
const mediaProfileInfraService = lazyRequireMod('./mediaProfileInfraService');
const mediaProfileConnectionStore = lazyRequireMod('./mediaProfileConnectionStore');
const sportsProfileInfraService = lazyRequireMod('./sportsProfileInfraService');
const profileInfraStatusAllSvc = lazyRequireMod('./profileInfraStatusAll');
const sportsProfileConnectionStore = lazyRequireMod('./sportsProfileConnectionStore');
const industryAttributeMap = lazyRequireMod('./industryAttributeMap');
const { registerProfileRoutes } = require('./profileRoutes');
const { registerAudienceManagementRoutes } = require('./audienceManagementRoutes');
const { registerAjoCleanupRoutes } = require('./ajoCleanupRoutes');
const { registerSchemaRegistryRoutes } = require('./schemaRegistryRoutes');
const { registerLabRoutes } = require('./labRoutes');
const { registerMcpKeyRoutes } = require('./mcpKeyRoutes');
const { registerLiveActivityRoutes } = require('./liveActivityRoutes');
const mcpApiKeyStore = lazyRequireMod('./mcpApiKeyStore');
const { registerSnowflakeRoutes } = require('./snowflakeRoutes');
const journeyNameStore = lazyRequireMod('./journeyNameStore');
const eventEdgeService = lazyRequireMod('./eventEdgeService');
const eventGeneratorService = lazyRequireMod('./eventGeneratorService');
const eventConfigStore = lazyRequireMod('./eventConfigStore');
const orchestratedCampaignConfigStore = lazyRequireMod('./orchestratedCampaignConfigStore');
const catalogConfigStore = lazyRequireMod('./catalogConfigStore');
const decisionLabConfigStore = lazyRequireMod('./decisionLabConfigStore');
const decisioningEdgeEvaluateService = lazyRequireMod('./decisioningEdgeEvaluateService');
const decisioningExplainService = lazyRequireMod('./decisioningExplainService');
const decisioningCatalogService = lazyRequireMod('./decisioningCatalogService');
const decisioningCatalogAssessService = lazyRequireMod('./decisioningCatalogAssessService');
const archDiagramAssistService = lazyRequireMod('./archDiagramAssistService');
const archProposalStore = lazyRequireMod('./archProposalStore');
const labUserSandboxStore = lazyRequireMod('./labUserSandboxStore');
const labProfileGenerationPrefsStore = lazyRequireMod('./labProfileGenerationPrefsStore');
const labProfileRecentGeneratedStore = lazyRequireMod('./labProfileRecentGeneratedStore');
const labGenerationPrefsAuth = lazyRequireMod('./labGenerationPrefsAuth');
const snowflakePrincipalAuth = lazyRequireMod('./snowflakePrincipalAuth');
const { createLabMcpFirstRunService } = require('./labMcpFirstRunService');
const labWorkspaceAuthService = lazyRequireMod('./labWorkspaceAuthService');
const labRtdbProvisionService = lazyRequireMod('./labRtdbProvisionService');
const labDemoConfigService = lazyRequireMod('./labDemoConfigService');
const labDemoAssetService = lazyRequireMod('./labDemoAssetService');
const pdfPersonalisationService = require('./pdfPersonalisationService');
const pdfJourneyActionService = require('./pdfJourneyActionService');
const pdfPersonalisationStore = lazyRequireMod('./pdfPersonalisationStore');
const pdfJourneyApiKeyStore = lazyRequireMod('./pdfJourneyApiKeyStore');
const pdfJourneyTemplateStore = lazyRequireMod('./pdfJourneyTemplateStore');
const pdfJourneyCampaignStore = lazyRequireMod('./pdfJourneyCampaignStore');
const pdfJourneyStoryAssist = lazyRequireMod('./pdfJourneyStoryAssist');
const journeysBrowse = lazyRequireMod('./journeysBrowse');
const cjaJourneyMetrics = lazyRequireMod('./cjaJourneyMetrics');
const journeyBrowseCache = lazyRequireMod('./journeyBrowseCacheStore');
const easterEggNotify = lazyRequireMod('./easterEggNotify');
const { sandboxWebhookTool } = require('./sandboxWebhookTool');
const eventInfraService = lazyRequireMod('./eventInfraService');
const tagsReactorService = lazyRequireMod('./tagsReactorService');
const edgeLaunchRuleService = lazyRequireMod('./edgeLaunchRuleService');
const profileStreamingCore = lazyRequireMod('./profileStreamingCore');
const profileGenerateService = lazyRequireMod('./profileGenerateService');
const consentManagerLegacy = lazyRequireMod('./consentManagerLegacy');
const brandScraperService = lazyRequireMod('./brandScraperService');
const bcGeminiTrainingService = lazyRequireMod('./bcGeminiTrainingService');
const bcGeminiAnswerService = lazyRequireMod('./bcGeminiAnswerService');
const brandScraperDemoHost = lazyRequireMod('./brandScraperDemoHost');
const llmDemoPersonalizeService = lazyRequireMod('./llmDemoPersonalizeService');
const imageHostingLibrary = lazyRequireMod('./imageHostingLibrary');
const brandScrapeStore = lazyRequireMod('./brandScrapeStore');
const clientJourneyAssetV2Service = lazyRequireMod('./clientJourneyAssetV2Service');
const clientJourneyAssetV2ImportService = lazyRequireMod('./clientJourneyAssetV2ImportService');
const demoUseCaseAssetService = lazyRequireMod('./demoUseCaseAssetService');
const releaseNotesSummaryService = lazyRequireMod('./releaseNotesSummaryService');
const claudeSkillsService = lazyRequireMod('./claudeSkillsService');
const envBarConfigStore = lazyRequireMod('./envBarConfigStore');
const envBarPreferencesStore = lazyRequireMod('./envBarPreferencesStore');
const snowflakeService = lazyRequireMod('./snowflakeService');
const snowflakeDataGeneratorService = lazyRequireMod('./snowflakeDataGeneratorService');
const snowflakeAgenticTravelService = lazyRequireMod('./snowflakeAgenticTravelService');
const snowflakeIndustryCatalogService = lazyRequireMod('./snowflakeIndustryCatalogService');
const snowflakeProvisionService = lazyRequireMod('./snowflakeProvisionService');
const snowflakeIndustryEventService = lazyRequireMod('./snowflakeIndustryEventService');
const liveActivityTemplateStore = lazyRequireMod('./liveActivityTemplateStore');
const liveActivityService = lazyRequireMod('./liveActivityService');
const audienceManagementService = lazyRequireMod('./audienceManagementService');
const ajoCleanupService = lazyRequireMod('./ajoCleanupService');
const WEBHOOK_LISTENER_ALLOWED_HOST = 'webhooklistener-pscg5c4cja-uc.a.run.app';
const DEFAULT_WEBHOOK_LISTENER_URL = 'https://webhooklistener-pscg5c4cja-uc.a.run.app/';

function readFirebaseConfigProjectId() {
  const raw = String(process.env.FIREBASE_CONFIG || '').trim();
  if (!raw) return '';
  try {
    return String(JSON.parse(raw).projectId || '').trim();
  } catch {
    return '';
  }
}

const SANDBOX_GCP_PROJECT_ID = 'adbe-gcp0819';
const SANDBOX_FUNCTIONS_REGION = 'us-east4';
const SC_DEMO_SANDBOX_HOSTING_INVOKER_SA =
  'sc-demo-sbx-host-invoker@adbe-gcp0819.iam.gserviceaccount.com';
const DEFAULT_FUNCTIONS_REGION = 'us-central1';

function resolveFunctionsRegion() {
  const fromEnv = String(process.env.CLOUD_FUNCTIONS_REGION || '').trim();
  if (fromEnv) return fromEnv;
  const projectId = String(
    process.env.GCLOUD_PROJECT
      || process.env.GCP_PROJECT
      || process.env.GOOGLE_CLOUD_PROJECT
      || readFirebaseConfigProjectId()
      || '',
  ).trim();
  if (projectId === SANDBOX_GCP_PROJECT_ID) return SANDBOX_FUNCTIONS_REGION;
  return DEFAULT_FUNCTIONS_REGION;
}

const REGION = resolveFunctionsRegion();

/**
 * Gen2 runtime identity. Adobe sandbox project `adbe-gcp0819` has no default
 * `…-compute@developer.gserviceaccount.com`; Firebase would otherwise bind secrets
 * to a non-existent SA. We use a user-managed SA there.
 *
 * Override any time: `CF_RUNTIME_SERVICE_ACCOUNT=…@….iam.gserviceaccount.com`
 * (e.g. `npm run deploy:sandbox` sets it). Otherwise we detect the deploy target
 * from `GCLOUD_PROJECT` / `GOOGLE_CLOUD_PROJECT` / `FIREBASE_CONFIG.projectId`.
 */
const TARGET_PROJECT_FOR_RUNTIME = String(
  process.env.GCLOUD_PROJECT
    || process.env.GCP_PROJECT
    || process.env.GOOGLE_CLOUD_PROJECT
    || readFirebaseConfigProjectId()
    || '',
).trim();
const EXPLICIT_RUNTIME_SERVICE_ACCOUNT = String(process.env.CF_RUNTIME_SERVICE_ACCOUNT || '').trim();
const SC_DEMO_SANDBOX_RUNTIME_SA =
  'sc-demo-sandbox-cf-runtime@adbe-gcp0819.iam.gserviceaccount.com';
const RUNTIME_SERVICE_ACCOUNT =
  EXPLICIT_RUNTIME_SERVICE_ACCOUNT
  || (TARGET_PROJECT_FOR_RUNTIME === SANDBOX_GCP_PROJECT_ID ? SC_DEMO_SANDBOX_RUNTIME_SA : '')
  // Deploy analysis may not set GCLOUD_PROJECT/FIREBASE_CONFIG; `npm run deploy:sandbox` sets CLOUD_FUNCTIONS_REGION.
  || (REGION === SANDBOX_FUNCTIONS_REGION ? SC_DEMO_SANDBOX_RUNTIME_SA : '');
if (RUNTIME_SERVICE_ACCOUNT) {
  setGlobalOptions({
    region: REGION,
    serviceAccount: RUNTIME_SERVICE_ACCOUNT,
  });
}

/**
 * Default public Hosting origin when deploy-time env does not set
 * `LAB_HOSTING_ORIGIN`, `LAB_APPROVAL_BASE_URL`, or `HOSTING_ORIGIN`.
 * See docs/FIREBASE_PROJECT_MIGRATION.md.
 */
const LEGACY_LAB_HOSTING_ORIGIN = 'https://aep-orchestration-lab.web.app';

/**
 * Origin string baked into lab-approval function `environmentVariables` at deploy.
 * Override via deploy environment (same keys as runtime).
 */
function labHostingOriginForFunctionConfig() {
  const explicit = String(
    process.env.LAB_HOSTING_ORIGIN
      || process.env.LAB_APPROVAL_BASE_URL
      || process.env.HOSTING_ORIGIN
      || '',
  )
    .trim()
    .replace(/\/+$/, '');
  return explicit || LEGACY_LAB_HOSTING_ORIGIN;
}

/**
 * Origin for scheduled jobs that `fetch()` the live site (schema viewer CDN warm).
 * In GCP, defaults to `https://${GCLOUD_PROJECT}.web.app` when unset.
 */
function labHostingOriginForScheduledFetch() {
  const explicit = String(process.env.LAB_HOSTING_ORIGIN || process.env.HOSTING_ORIGIN || '')
    .trim()
    .replace(/\/+$/, '');
  if (explicit) return explicit;
  const pid = String(process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || '').trim();
  if (pid) return `https://${pid}.web.app`;
  return LEGACY_LAB_HOSTING_ORIGIN;
}

const PROFILE_FN_SECRETS = [ADOBE_CLIENT_ID, ADOBE_CLIENT_SECRET, ADOBE_IMS_ORG, ADOBE_SCOPES];

const { resolveFirestoreDatabaseId, SANDBOX_NATIVE_DATABASE_ID } = require('./adminFirestore');

/** Baked into Gen2 env so runtime Admin SDK targets Native `aep-lab` on sandbox (not Datastore `(default)`). */
function consentStoreRuntimeEnv() {
  const dbId = String(
    process.env.FIRESTORE_DATABASE_ID || resolveFirestoreDatabaseId() || '',
  ).trim();
  if (dbId) return { FIRESTORE_DATABASE_ID: dbId };
  if (TARGET_PROJECT_FOR_RUNTIME === SANDBOX_GCP_PROJECT_ID) {
    return { FIRESTORE_DATABASE_ID: SANDBOX_NATIVE_DATABASE_ID };
  }
  return {};
}

/** Firestore consent store — no Adobe secrets (same project Admin SDK). */
const CONSENT_STORE_FN_OPTS = {
  region: REGION,
  invoker: 'public',
  timeoutSeconds: 30,
  memory: '256MiB',
  environmentVariables: consentStoreRuntimeEnv(),
};

/**
 * Snowflake handlers route ALL outbound traffic through the Serverless VPC
 * Access connector `snowflake-egress`, which exits Cloud NAT through the
 * reserved static external IP recorded in docs/SNOWFLAKE_INTEGRATION.md.
 * The Snowflake admin allowlists exactly that IP in their NETWORK POLICY.
 *
 * `vpcConnectorEgressSettings: 'ALL_TRAFFIC'` is the bit that actually
 * forces the static-IP path (the default `PRIVATE_RANGES_ONLY` would still
 * use Google's dynamic IPs for public Snowflake hostnames).
 */
function resolveSnowflakeVpcConnector() {
  const fromEnv = String(process.env.SNOWFLAKE_VPC_CONNECTOR || '').trim();
  if (fromEnv) return fromEnv;
  if (TARGET_PROJECT_FOR_RUNTIME === SANDBOX_GCP_PROJECT_ID) return 'disabled';
  return 'snowflake-egress';
}

const SNOWFLAKE_VPC_CONNECTOR = resolveSnowflakeVpcConnector();
const SNOWFLAKE_VPC_OPTS =
  SNOWFLAKE_VPC_CONNECTOR && !/^(disabled|none|skip)$/i.test(SNOWFLAKE_VPC_CONNECTOR)
    ? { vpcConnector: SNOWFLAKE_VPC_CONNECTOR, vpcConnectorEgressSettings: 'ALL_TRAFFIC' }
    : {};

const SNOWFLAKE_FN_OPTS = {
  region: REGION,
  invoker: 'public',
  timeoutSeconds: 60,
  memory: '512MiB',
  secrets: [AGENTIC_TRAVEL_RUNNER_HMAC_SECRET],
  ...SNOWFLAKE_VPC_OPTS,
};

/** Long jobs: full Agentic phased generate + enrich (Python runner or heavy SQL). */
const SNOWFLAKE_AGENTIC_FN_OPTS = {
  ...SNOWFLAKE_FN_OPTS,
  timeoutSeconds: 540,
  memory: '2GiB',
};

/** Selected sandbox from ?sandbox= or deploy default. */
function resolveSandboxFromQuery(req) {
  const q = String(req.query.sandbox || '').trim();
  return q || String(process.env.ADOBE_SANDBOX_NAME || DEFAULT_ADOBE_SANDBOX).trim();
}

/** Sandbox for profile streaming: JSON body.sandbox overrides query (matches Profile Viewer). */
function resolveSandboxForProfileBody(req) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const fromBody = String(body.sandbox || '').trim();
  if (fromBody) return fromBody;
  return resolveSandboxFromQuery(req);
}

const { getAdobeAccessToken, aepHeaders } = createAdobeAuth({
  getClientId: () => ADOBE_CLIENT_ID.value(),
  getClientSecret: () => ADOBE_CLIENT_SECRET.value(),
  getScopes: () => ADOBE_SCOPES.value(),
  getImsOrg: () => ADOBE_IMS_ORG.value(),
});

exports.aepProxy = onRequest(
  {
    region: REGION,
    secrets: [ADOBE_CLIENT_ID, ADOBE_CLIENT_SECRET, ADOBE_IMS_ORG, ADOBE_SCOPES],
    environmentVariables: {
      ADOBE_SANDBOX_NAME: RESOLVED_ADOBE_SANDBOX,
    },
    invoker: 'public',
    timeoutSeconds: 120,
    memory: '256MiB',
  },
  async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    let body;
    try {
      body = typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse(req.rawBody || '{}');
    } catch (e) {
      res.status(400).json({ error: 'Invalid JSON body' });
      return;
    }
    const method = String(body.method || 'GET').toUpperCase();
    const path = body.path || '';
    const params = body.params || {};
    const jsonBody = body.json;
    const platformHeaders = body.platform_headers;
    const platformBase = resolvePlatformBaseUrl(body.platform_base_url);

    if (typeof path !== 'string' || !path.startsWith('/')) {
      res.status(400).json({ error: 'path must be a string starting with /' });
      return;
    }
    if (platformHeaders != null && typeof platformHeaders !== 'object') {
      res.status(400).json({ error: 'platform_headers must be an object' });
      return;
    }

    let accessToken;
    try {
      accessToken = await getAdobeAccessToken();
    } catch (e) {
      res.status(500).json({ error: 'Auth failed', detail: String(e.message || e) });
      return;
    }

    const qs = new URLSearchParams();
    if (params && typeof params === 'object') {
      for (const [k, v] of Object.entries(params)) {
        if (v == null) continue;
        if (Array.isArray(v)) v.forEach((item) => qs.append(k, String(item)));
        else qs.append(k, String(v));
      }
    }
    let url = `${platformBase}${path}`;
    const q = qs.toString();
    if (q) url += (url.includes('?') ? '&' : '?') + q;

    const headers = aepHeaders(accessToken, platformHeaders);
    const phSandbox =
      platformHeaders && typeof platformHeaders['x-sandbox-name'] === 'string'
        ? String(platformHeaders['x-sandbox-name']).trim()
        : '';
    const envSandbox = String(process.env.ADOBE_SANDBOX_NAME || DEFAULT_ADOBE_SANDBOX).trim();
    headers['x-sandbox-name'] = phSandbox || envSandbox;
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      // aepHeaders may set lowercase `content-type` from platform_headers; Node fetch
      // would emit two Content-Type values (e.g. AJO template.v1+json + application/json)
      // which Adobe rejects. Collapse to a single canonical header.
      const ct =
        headers['Content-Type'] ||
        headers['content-type'] ||
        headers['Content-type'] ||
        '';
      delete headers['content-type'];
      delete headers['Content-type'];
      headers['Content-Type'] = ct.trim() || 'application/json';
    }

    const init = { method, headers };
    if (['POST', 'PUT', 'PATCH'].includes(method) && jsonBody !== undefined && jsonBody !== null) {
      init.body = JSON.stringify(jsonBody);
    }

    let upstream;
    try {
      upstream = await fetch(url, init);
    } catch (e) {
      res.status(502).json({ error: String(e.message || e) });
      return;
    }

    const ctRaw = upstream.headers.get('Content-Type') || '';
    const ct = ctRaw.toLowerCase();
    const maxText = Math.min(Math.max(Number(body.max_response_text_chars) || 250000, 5000), 500000);
    let platformResponse;
    if (ct.includes('ndjson') || ct.includes('x-ndjson')) {
      const text = await upstream.text();
      const truncatedTotal = text.length > maxText;
      const work = truncatedTotal ? text.slice(0, maxText) : text;
      const maxLines = 200;
      const records = [];
      for (const line of work.split('\n')) {
        const t = line.trim();
        if (!t) continue;
        try {
          records.push(JSON.parse(t));
        } catch {
          records.push({ _unparsed_line: t.slice(0, 800) });
        }
        if (records.length >= maxLines) break;
      }
      platformResponse = {
        format: 'ndjson',
        content_type: ctRaw,
        upstream_text_length: text.length,
        truncated: truncatedTotal || records.length >= maxLines,
        records,
      };
    } else if (ct.includes('json')) {
      try {
        platformResponse = await upstream.json();
      } catch {
        platformResponse = { raw: (await upstream.text()).slice(0, maxText) };
      }
    } else {
      const text = await upstream.text();
      platformResponse = { raw: text.slice(0, maxText), truncated: text.length > maxText };
    }

    res.status(upstream.status).json({
      status: upstream.status,
      platform_response: platformResponse,
      request_url: url,
      platform_base_url: platformBase,
    });
  }
);

/**
 * Private-template HTML-to-PDF workspace and AJO handoff API.
 * Browser writes require an allow-listed Firebase user; future AJO calls use
 * X-PDF-API-Key. Download URLs carry a separate opaque, expiring token.
 */
exports.pdfPersonalisation = onRequest(
  {
    region: REGION,
    secrets: [
      ADOBE_CLIENT_ID,
      ADOBE_CLIENT_SECRET,
      ADOBE_IMS_ORG,
      ADOBE_SCOPES,
      PDF_PERSONALISATION_API_KEY,
      PDF_S3_ACCESS_KEY_ID,
      PDF_S3_SECRET_ACCESS_KEY,
    ],
    environmentVariables: {
      PDF_PERSONALISATION_PUBLIC_BASE_URL:
        process.env.PDF_PERSONALISATION_PUBLIC_BASE_URL
        || 'https://aep-orchestration-lab.web.app/api/pdf-personalisation',
      PDF_PERSONALISATION_ALLOWED_EMAILS:
        process.env.PDF_PERSONALISATION_ALLOWED_EMAILS || 'apalmer@adobe.com',
      PDF_PERSONALISATION_RETENTION_DAYS:
        process.env.PDF_PERSONALISATION_RETENTION_DAYS || '14',
      PDF_OUTPUT_STORE: process.env.PDF_OUTPUT_STORE || 'dual',
      PDF_S3_BUCKET: process.env.PDF_S3_BUCKET || 'adobe-demo-emea-ajo-pdf',
      PDF_S3_REGION: process.env.PDF_S3_REGION || 'us-east-1',
      PDF_S3_PREFIX: process.env.PDF_S3_PREFIX || 'pdf-personalisation',
      PDF_DLZ_PREFIX: process.env.PDF_DLZ_PREFIX || 'pdf-personalisation',
      PDF_JOURNEY_CAMPAIGN_ID:
        process.env.PDF_JOURNEY_CAMPAIGN_ID || pdfJourneyActionService.DEFAULT_CAMPAIGN_ID,
      ADOBE_SANDBOX_NAME: RESOLVED_ADOBE_SANDBOX,
    },
    invoker: 'public',
    timeoutSeconds: 300,
    memory: '1GiB',
    maxInstances: 10,
    concurrency: 10,
  },
  pdfPersonalisationService.createHandler({
    setCors,
    verifyIdTokenClaimsFromRequest: labUserSandboxStore.verifyIdTokenClaimsFromRequest,
    // PDF Services is enabled on the enterprise Adobe Developer Console project,
    // so it shares that project's OAuth service-principal credentials with AEP.
    getPdfClientId: () => ADOBE_CLIENT_ID.value(),
    getPdfClientSecret: () => ADOBE_CLIENT_SECRET.value(),
    getServiceApiKey: () => PDF_PERSONALISATION_API_KEY.value(),
    validateMcpApiKey: mcpApiKeyStore.validateUserApiKey,
    validateJourneyApiKey: pdfJourneyApiKeyStore.validateApiKey,
    listJourneyApiKeys: pdfJourneyApiKeyStore.listKeysForUser,
    createJourneyApiKey: pdfJourneyApiKeyStore.createKey,
    revokeJourneyApiKey: pdfJourneyApiKeyStore.revokeKey,
    maxJourneyApiKeys: pdfJourneyApiKeyStore.MAX_ACTIVE_KEYS_PER_USER,
    listBuiltinJourneyTemplates: pdfJourneyTemplateStore.builtinMetadata,
    listJourneyTemplates: (ownerUid, options) => pdfJourneyTemplateStore.listUploadedTemplates(ownerUid, {}, options),
    saveJourneyTemplate: pdfJourneyTemplateStore.saveTemplate,
    archiveJourneyTemplate: (ownerUid, templateName, options) => pdfJourneyTemplateStore.archiveTemplate(ownerUid, templateName, {}, options),
    resolveJourneyTemplateMetadata: pdfJourneyTemplateStore.resolveTemplateMetadata,
    listJourneyCampaigns: pdfJourneyCampaignStore.listCampaigns,
    saveJourneyCampaigns: pdfJourneyCampaignStore.saveCampaigns,
    suggestJourneyStoryFields: pdfJourneyStoryAssist.suggest,
    getJourneyActionRecord: pdfJourneyActionService.getRecord,
    journeyActionResponse: pdfJourneyActionService.statusResponse,
    getPdfJob: pdfPersonalisationStore.getJob,
    getS3AccessKeyId: () => PDF_S3_ACCESS_KEY_ID.value(),
    getS3SecretAccessKey: () => PDF_S3_SECRET_ACCESS_KEY.value(),
    getAdobeAccessToken,
    aepHeaders,
    adobeSandbox: RESOLVED_ADOBE_SANDBOX,
    dlzPrefix: process.env.PDF_DLZ_PREFIX || 'pdf-personalisation',
    // Gen2 may omit onRequest.environmentVariables. Inject non-secret S3 routing
    // directly so the adapter cannot silently fall back to GCS in production.
    outputStoreMode: process.env.PDF_OUTPUT_STORE || 'dual',
    s3Bucket: process.env.PDF_S3_BUCKET || 'adobe-demo-emea-ajo-pdf',
    s3Region: process.env.PDF_S3_REGION || 'us-east-1',
    s3Prefix: process.env.PDF_S3_PREFIX || 'pdf-personalisation',
  }),
);

/**
 * Async worker for AJO PDF custom actions. The HTTP action only validates and
 * enqueues, keeping the Journey runtime safely below its external-call timeout.
 */
exports.pdfJourneyActionWorker = onDocumentCreated(
  {
    document: `${pdfJourneyActionService.JOBS_COLLECTION}/{jobId}`,
    region: REGION,
    secrets: [
      ADOBE_CLIENT_ID,
      ADOBE_CLIENT_SECRET,
      ADOBE_IMS_ORG,
      ADOBE_SCOPES,
      PDF_S3_ACCESS_KEY_ID,
      PDF_S3_SECRET_ACCESS_KEY,
    ],
    environmentVariables: {
      PDF_PERSONALISATION_RETENTION_DAYS:
        process.env.PDF_PERSONALISATION_RETENTION_DAYS || '14',
      PDF_OUTPUT_STORE: process.env.PDF_OUTPUT_STORE || 'dual',
      PDF_S3_BUCKET: process.env.PDF_S3_BUCKET || 'adobe-demo-emea-ajo-pdf',
      PDF_S3_REGION: process.env.PDF_S3_REGION || 'us-east-1',
      PDF_S3_PREFIX: process.env.PDF_S3_PREFIX || 'pdf-personalisation',
      PDF_DLZ_PREFIX: process.env.PDF_DLZ_PREFIX || 'pdf-personalisation',
      PDF_JOURNEY_CAMPAIGN_ID:
        process.env.PDF_JOURNEY_CAMPAIGN_ID || pdfJourneyActionService.DEFAULT_CAMPAIGN_ID,
      ADOBE_SANDBOX_NAME: RESOLVED_ADOBE_SANDBOX,
    },
    timeoutSeconds: 300,
    memory: '1GiB',
    maxInstances: 10,
    concurrency: 10,
    retry: true,
  },
  async (event) => {
    const jobId = String(event.params && event.params.jobId || '');
    const result = await pdfJourneyActionService.processQueuedJob(jobId, {
      getPdfClientId: () => ADOBE_CLIENT_ID.value(),
      getPdfClientSecret: () => ADOBE_CLIENT_SECRET.value(),
      getS3AccessKeyId: () => PDF_S3_ACCESS_KEY_ID.value(),
      getS3SecretAccessKey: () => PDF_S3_SECRET_ACCESS_KEY.value(),
      getAdobeAccessToken,
      aepHeaders,
      adobeSandbox: RESOLVED_ADOBE_SANDBOX,
      dlzPrefix: process.env.PDF_DLZ_PREFIX || 'pdf-personalisation',
      outputStoreMode: process.env.PDF_OUTPUT_STORE || 'dual',
      s3Bucket: process.env.PDF_S3_BUCKET || 'adobe-demo-emea-ajo-pdf',
      s3Region: process.env.PDF_S3_REGION || 'us-east-1',
      s3Prefix: process.env.PDF_S3_PREFIX || 'pdf-personalisation',
      campaignId: process.env.PDF_JOURNEY_CAMPAIGN_ID || pdfJourneyActionService.DEFAULT_CAMPAIGN_ID,
      loadJourneyTemplateSource: pdfJourneyTemplateStore.loadTemplateSource,
    });
    console.info('[pdfJourneyActionWorker]', JSON.stringify({ jobId, result }));
  },
);

/** Delete expired PDF artefacts and their capability-token metadata. */
exports.pdfPersonalisationCleanup = onSchedule(
  {
    schedule: 'every day 03:17',
    timeZone: 'Etc/UTC',
    region: REGION,
    timeoutSeconds: 300,
    memory: '512MiB',
  },
  async () => {
    const result = await pdfPersonalisationStore.cleanupExpired();
    console.log('[pdfPersonalisationCleanup]', JSON.stringify(result));
  },
);

const profileFnOpts = {
  region: REGION,
  secrets: PROFILE_FN_SECRETS,
  environmentVariables: { ADOBE_SANDBOX_NAME: RESOLVED_ADOBE_SANDBOX },
  invoker: 'public',
  timeoutSeconds: 120,
  memory: '512MiB',
};

Object.assign(
  exports,
  registerSchemaRegistryRoutes({
    onRequest,
    profileFnOpts,
    setCors,
    resolveSandboxFromQuery,
    getAdobeAccessToken,
    ADOBE_CLIENT_ID,
    ADOBE_IMS_ORG,
    schemaRegistryService,
  })
);


/** GET /api/consent-infra/status?sandbox= */
exports.consentInfraStatus = onRequest(profileFnOpts, async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const sandbox = resolveSandboxFromQuery(req);
  console.log('[consentInfra.http]', JSON.stringify({ route: 'GET /api/consent-infra/status', sandbox }));
  let accessToken;
  try {
    accessToken = await getAdobeAccessToken();
  } catch (e) {
    console.log('[consentInfra.http]', JSON.stringify({ route: 'status', sandbox, outcome: 'auth_failed' }));
    res.status(500).json({ error: 'Auth failed', detail: String(e.message || e) });
    return;
  }
  try {
    const payload = await consentInfraService.runConsentInfraStatus(
      sandbox,
      accessToken,
      ADOBE_CLIENT_ID.value(),
      ADOBE_IMS_ORG.value()
    );
    console.log(
      '[consentInfra.http]',
      JSON.stringify({
        route: 'status',
        sandbox,
        httpStatus: 200,
        ok: payload.ok !== false,
        ready: payload.ready,
        error: payload.error || null,
      })
    );
    res.status(200).json(payload);
  } catch (e) {
    console.log(
      '[consentInfra.http]',
      JSON.stringify({ route: 'status', sandbox, httpStatus: 500, outcome: 'exception', error: String(e.message || e) })
    );
    res.status(500).json({ error: String(e.message || e), sandbox });
  }
});

/** POST /api/consent-infra/step — one wizard step. Body: { step: "createSchema"|"attachFieldGroups"|"createDataset"|"httpFlow" } */
exports.consentInfraStep = onRequest(profileFnOpts, async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const sandbox = resolveSandboxFromQuery(req);
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const step = String(body.step || '').trim();
  console.log('[consentInfra.http]', JSON.stringify({ route: 'POST /api/consent-infra/step', sandbox, step }));
  let accessToken;
  try {
    accessToken = await getAdobeAccessToken();
  } catch (e) {
    res.status(500).json({ error: 'Auth failed', detail: String(e.message || e) });
    return;
  }
  try {
    const payload = await consentInfraService.runConsentInfraStep(sandbox, accessToken, ADOBE_CLIENT_ID.value(), ADOBE_IMS_ORG.value(), step);
    res.status(200).json(payload);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e), sandbox, step });
  }
});

/**
 * POST /api/consent-infra/enable-profile?sandbox= — final on-platform action
 * for the Consent Manager pipeline. Schema-first → dataset-second; idempotent.
 *
 * NOTE: enabling the consent schema for Real-Time Customer Profile is a
 * one-way action in AEP (the union tag cannot be removed). The UI banner
 * above the button repeats that warning; this endpoint is only reached
 * after the architect deliberately clicks Enable.
 */
exports.consentInfraEnableProfile = onRequest(profileFnOpts, async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const sandbox = resolveSandboxFromQuery(req);
  console.log('[consentInfra.http]', JSON.stringify({ route: 'POST /api/consent-infra/enable-profile', sandbox }));
  let accessToken;
  try {
    accessToken = await getAdobeAccessToken();
  } catch (e) {
    res.status(500).json({ error: 'Auth failed', detail: String(e.message || e) });
    return;
  }
  try {
    const payload = await consentInfraService.runConsentInfraEnableProfile(
      sandbox,
      accessToken,
      ADOBE_CLIENT_ID.value(),
      ADOBE_IMS_ORG.value()
    );
    res.status(200).json(payload);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e), sandbox });
  }
});

/** POST /api/consent-infra/ensure — create schema, identity, dataset when missing (HTTP flow manual). Body: { dryRun?: boolean } */
exports.consentInfraEnsure = onRequest(profileFnOpts, async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const sandbox = resolveSandboxFromQuery(req);
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const dryRun = body.dryRun === true || body.dryRun === 'true';
  console.log('[consentInfra.http]', JSON.stringify({ route: 'POST /api/consent-infra/ensure', sandbox, dryRun }));
  let accessToken;
  try {
    accessToken = await getAdobeAccessToken();
  } catch (e) {
    console.log('[consentInfra.http]', JSON.stringify({ route: 'ensure', sandbox, outcome: 'auth_failed' }));
    res.status(500).json({ error: 'Auth failed', detail: String(e.message || e) });
    return;
  }
  try {
    const payload = await consentInfraService.runConsentInfraEnsure(sandbox, accessToken, ADOBE_CLIENT_ID.value(), ADOBE_IMS_ORG.value(), {
      dryRun,
    });
    console.log(
      '[consentInfra.http]',
      JSON.stringify({
        route: 'ensure',
        sandbox,
        httpStatus: 200,
        ok: payload.ok,
        ready: payload.ready,
        dryRun: payload.dryRun,
        profileCoreMixinMissing: payload.profileCoreMixinMissing || false,
        error: payload.error || null,
        schemaCreated: payload.manifest?.schemaCreated,
        datasetCreated: payload.manifest?.datasetCreated,
      })
    );
    res.status(200).json(payload);
  } catch (e) {
    console.log(
      '[consentInfra.http]',
      JSON.stringify({ route: 'ensure', sandbox, httpStatus: 500, outcome: 'exception', error: String(e.message || e) })
    );
    res.status(500).json({ error: String(e.message || e), sandbox });
  }
});

/**
 * GET /api/consent-infra/flow-lookup?sandbox=&flowId=&flowName=
 * Resolves DCS collection URL + flow UUID from Flow Service. Prefer flowId when set; else match dataflow by exact flowName (defaults to lab name if flowName omitted).
 */
exports.consentInfraFlowLookup = onRequest(profileFnOpts, async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const sandbox = resolveSandboxFromQuery(req);
  const flowId = String(req.query.flowId || '').trim();
  const flowName = String(req.query.flowName || '').trim();
  console.log(
    '[consentInfra.http]',
    JSON.stringify({ route: 'GET /api/consent-infra/flow-lookup', sandbox, hasFlowId: !!flowId })
  );
  let accessToken;
  try {
    accessToken = await getAdobeAccessToken();
  } catch (e) {
    res.status(500).json({ error: 'Auth failed', detail: String(e.message || e) });
    return;
  }
  try {
    const payload = await consentFlowLookup.lookupConsentHttpFlow(sandbox, accessToken, ADOBE_CLIENT_ID.value(), ADOBE_IMS_ORG.value(), {
      flowId: flowId || undefined,
      flowName: flowName || undefined,
    });
    res.status(200).json(payload);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e), sandbox });
  }
});

/**
 * GET/POST /api/consent-connection?sandbox= — read or merge-save streaming + infra IDs per sandbox (Firestore).
 * POST body: { sandbox?, streaming?: { url, flowId, flowName, datasetId, schemaId, xdmKey, apiKey }, infra?: { schemaMetaAltId, schemaId, datasetId, profileCoreMixinId, datasetName, imsOrg } }
 */
exports.consentConnectionStore = onRequest(CONSENT_STORE_FN_OPTS, async (req, res) => {
  setCors(res, 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  const sandboxQ = resolveSandboxFromQuery(req);
  if (req.method === 'GET') {
    try {
      const record = await consentConnectionStore.getConsentConnection(sandboxQ);
      res.status(200).json({ ok: true, sandbox: sandboxQ, record: serializeFirestoreRecord(record) });
    } catch (e) {
      console.log('[consentConnection]', JSON.stringify({ route: 'GET', sandbox: sandboxQ, error: String(e.message || e) }));
      res.status(500).json({ ok: false, error: String(e.message || e), sandbox: sandboxQ });
    }
    return;
  }
  if (req.method === 'POST') {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const sb = String(body.sandbox || sandboxQ).trim() || sandboxQ;
    try {
      const record = await consentConnectionStore.saveConsentConnection(sb, {
        streaming: body.streaming,
        infra: body.infra,
      });
      res.status(200).json({ ok: true, sandbox: sb, record: serializeFirestoreRecord(record) });
    } catch (e) {
      console.log('[consentConnection]', JSON.stringify({ route: 'POST', sandbox: sb, error: String(e.message || e) }));
      res.status(500).json({ ok: false, error: String(e.message || e), sandbox: sb });
    }
    return;
  }
  res.status(405).json({ error: 'Method not allowed' });
});


Object.assign(
  exports,
  registerProfileRoutes({
    onRequest,
    REGION,
    PROFILE_FN_SECRETS,
    RESOLVED_ADOBE_SANDBOX,
    profileFnOpts,
    setCors,
    resolveSandboxFromQuery,
    getAdobeAccessToken,
    ADOBE_CLIENT_ID,
    ADOBE_IMS_ORG,
    profileTableHelpers,
    ipadEventProxy,
    industryAttributeMap,
    profileInfraStatusAllSvc,
    genericProfileInfraService,
    travelProfileInfraService,
    fsiProfileInfraService,
    telecomProfileInfraService,
    retailProfileInfraService,
    mediaProfileInfraService,
    sportsProfileInfraService,
    genericProfileConnectionStore,
    travelProfileConnectionStore,
    fsiProfileConnectionStore,
    telecomProfileConnectionStore,
    retailProfileConnectionStore,
    mediaProfileConnectionStore,
    sportsProfileConnectionStore,
    consentFlowLookup,
    serializeFirestoreRecord,
    CONSENT_STORE_FN_OPTS,
    resolveSandboxForProfileBody,
    profileStreamingCore,
    profileGenerateService,
    consentManagerLegacy,
    consentInfraService,
    profileAudiences,
    profileConsentPayload,
    profileEventsService,
  })
);

Object.assign(
  exports,
  registerAudienceManagementRoutes({
    onRequest,
    profileFnOpts,
    setCors,
    getAdobeAccessToken,
    ADOBE_CLIENT_ID,
    ADOBE_IMS_ORG,
    mcpApiKeyStore,
    audienceManagementService,
  })
);

Object.assign(
  exports,
  registerAjoCleanupRoutes({
    onRequest,
    profileFnOpts,
    setCors,
    getAdobeAccessToken,
    ADOBE_CLIENT_ID,
    ADOBE_IMS_ORG,
    mcpApiKeyStore,
    ajoCleanupService,
  })
);

/** GET /api/sandboxes */
exports.sandboxesProxy = onRequest(profileFnOpts, async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed', sandboxes: [] });
    return;
  }

  const upstreamUrl = String(process.env.SANDBOX_LIST_UPSTREAM_URL || '').trim();
  const upstreamKey = String(process.env.SANDBOX_LIST_UPSTREAM_KEY || '').trim();
  if (upstreamUrl) {
    try {
      /** @type {Record<string, string>} */
      const headers = { Accept: 'application/json' };
      if (upstreamKey) headers['X-Sandbox-List-Key'] = upstreamKey;
      const upstream = await fetch(upstreamUrl, { method: 'GET', headers });
      const data = await upstream.json().catch(() => ({}));
      const sandboxes = Array.isArray(data.sandboxes) ? data.sandboxes : [];
      if (!upstream.ok) {
        const status = upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502;
        res.status(status).json({
          error: data.error || upstream.statusText || 'Upstream error',
          sandboxes,
        });
        return;
      }
      res.status(200).json({ sandboxes });
      return;
    } catch (e) {
      res.status(502).json({ error: String(e.message || e), sandboxes: [] });
      return;
    }
  }

  let accessToken;
  try {
    accessToken = await getAdobeAccessToken();
  } catch (e) {
    res.status(500).json({ error: 'Auth failed', detail: String(e.message || e), sandboxes: [] });
    return;
  }
  try {
    const sandboxes = await sandboxesList.listActiveSandboxes(
      accessToken,
      ADOBE_CLIENT_ID.value(),
      ADOBE_IMS_ORG.value()
    );
    res.status(200).json({ sandboxes });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e), sandboxes: [] });
  }
});

/** GET /api/decisioning/treatment-name?id= */
exports.decisioningTreatmentNameProxy = onRequest(profileFnOpts, async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed', name: null });
    return;
  }
  const id = String(req.query.id || '').trim();
  const sandbox = resolveSandboxFromQuery(req);
  if (!id) {
    res.status(400).json({ error: 'Missing id. Use ?id=...', name: null });
    return;
  }
  let accessToken;
  try {
    accessToken = await getAdobeAccessToken();
  } catch (e) {
    res.status(500).json({ error: 'Auth failed', detail: String(e.message || e), name: null });
    return;
  }
  try {
    const name = await joLookups.getTreatmentNameById(
      id,
      sandbox,
      accessToken,
      ADOBE_CLIENT_ID.value(),
      ADOBE_IMS_ORG.value()
    );
    res.status(200).json({ id, name });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e), name: null });
  }
});

/** POST /api/decisioning/edge-evaluate — Edge interact with personalization (surfaces / decisionScopes) */
exports.decisioningEdgeEvaluateProxy = onRequest(profileFnOpts, async (req, res) => {
  setCors(res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let body;
  try {
    body = typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse(req.rawBody || '{}');
  } catch {
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }

  const sandbox = String(body.sandbox || '').trim() || resolveSandboxFromQuery(req);
  const uid = await labUserSandboxStore.verifyIdTokenFromRequest(req);

  let accessToken;
  try {
    accessToken = await getAdobeAccessToken();
  } catch (e) {
    res.status(500).json({ error: 'Auth failed', detail: String(e.message || e) });
    return;
  }

  try {
    const result = await decisioningEdgeEvaluateService.evaluateDecisioningEdge({
      sandbox,
      uid,
      accessToken,
      clientId: ADOBE_CLIENT_ID.value(),
      orgId: ADOBE_IMS_ORG.value(),
      body,
    });
    if (!result.ok) {
      res.status(400).json(result);
      return;
    }
    res.status(200).json(result);
  } catch (e) {
    res.status(502).json({ error: String(e.message || e), sandbox });
  }
});

/** POST /api/decisioning/explain — summarize propositions + resolve treatment names */
exports.decisioningExplainProxy = onRequest(profileFnOpts, async (req, res) => {
  setCors(res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let body;
  try {
    body = typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse(req.rawBody || '{}');
  } catch {
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }

  const sandbox = String(body.sandbox || '').trim() || resolveSandboxFromQuery(req);
  const propositions = Array.isArray(body.propositions) ? body.propositions : [];

  let accessToken;
  try {
    accessToken = await getAdobeAccessToken();
  } catch (e) {
    res.status(500).json({ error: 'Auth failed', detail: String(e.message || e) });
    return;
  }

  try {
    const explained = await decisioningExplainService.explainDecisionResponse({
      propositions,
      placements: body.placements,
      sandbox,
      accessToken,
      clientId: ADOBE_CLIENT_ID.value(),
      orgId: ADOBE_IMS_ORG.value(),
      evaluateContext: body.evaluateContext || {
        mode: body.mode,
        surfaces: body.surfaces,
        decisionScopes: body.decisionScopes,
        datastreamId: body.datastreamId,
        identityMap: body.identityMap,
      },
    });
    res.status(200).json({ sandbox, ...explained });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e), sandbox });
  }
});

/** POST /api/decisioning/catalog/list — allowlisted DPS list + normalized rows */
exports.decisioningCatalogListProxy = onRequest(profileFnOpts, async (req, res) => {
  setCors(res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let body;
  try {
    body = typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse(req.rawBody || '{}');
  } catch {
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }

  const sandbox = String(body.sandbox || '').trim() || resolveSandboxFromQuery(req);

  let accessToken;
  try {
    accessToken = await getAdobeAccessToken();
  } catch (e) {
    res.status(500).json({ error: 'Auth failed', detail: String(e.message || e) });
    return;
  }

  try {
    const result = await decisioningCatalogService.listCatalogEntities({
      sandbox,
      accessToken,
      clientId: ADOBE_CLIENT_ID.value(),
      orgId: ADOBE_IMS_ORG.value(),
      entityType: body.entityType || body.entity_type,
      limit: body.limit,
      schemaId: body.schemaId || body.schema_id,
      autoDetect: body.autoDetect !== false && body.auto_detect !== false,
      getCatalogConfig: catalogConfigStore.getCatalogConfig,
    });
    if (!result.ok) {
      res.status(result.status === 400 ? 400 : 502).json({ sandbox, ...result });
      return;
    }
    res.status(200).json({ sandbox, ...result });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e), sandbox });
  }
});

/** POST /api/decisioning/catalog/get — allowlisted DPS get by id */
exports.decisioningCatalogGetProxy = onRequest(profileFnOpts, async (req, res) => {
  setCors(res, 'POST, GET, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  let body = {};
  if (req.method === 'POST') {
    try {
      body = typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse(req.rawBody || '{}');
    } catch {
      res.status(400).json({ error: 'Invalid JSON body' });
      return;
    }
  }

  const sandbox = String(body.sandbox || req.query.sandbox || '').trim() || resolveSandboxFromQuery(req);
  const entityType = body.entityType || body.entity_type || req.query.entity_type || req.query.entityType;
  const id = String(body.id || req.query.id || '').trim();

  if (!entityType || !id) {
    res.status(400).json({ error: 'entity_type and id are required' });
    return;
  }

  let accessToken;
  try {
    accessToken = await getAdobeAccessToken();
  } catch (e) {
    res.status(500).json({ error: 'Auth failed', detail: String(e.message || e) });
    return;
  }

  try {
    const result = await decisioningCatalogService.getCatalogEntity({
      sandbox,
      accessToken,
      clientId: ADOBE_CLIENT_ID.value(),
      orgId: ADOBE_IMS_ORG.value(),
      entityType,
      id,
      schemaId: body.schemaId || body.schema_id || req.query.schema_id,
      autoDetect: body.autoDetect !== false && body.auto_detect !== false && req.query.auto_detect !== 'false',
      getCatalogConfig: catalogConfigStore.getCatalogConfig,
    });
    if (!result.ok) {
      res.status(result.status === 404 ? 404 : result.status === 400 ? 400 : 502).json({ sandbox, ...result });
      return;
    }
    res.status(200).json({ sandbox, ...result });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e), sandbox });
  }
});

/** GET /api/decisioning/catalog/schema — Firestore schema + optional auto-detect */
exports.decisioningCatalogSchemaProxy = onRequest(profileFnOpts, async (req, res) => {
  setCors(res, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const sandbox = resolveSandboxFromQuery(req);
  const autoDetect = req.query.auto_detect !== 'false' && req.query.autoDetect !== 'false';

  let accessToken;
  try {
    accessToken = await getAdobeAccessToken();
  } catch (e) {
    res.status(500).json({ error: 'Auth failed', detail: String(e.message || e) });
    return;
  }

  try {
    const record = await catalogConfigStore.getCatalogConfig(sandbox);
    const resolved = await decisioningCatalogService.resolveCatalogSchema({
      sandbox,
      accessToken,
      clientId: ADOBE_CLIENT_ID.value(),
      orgId: ADOBE_IMS_ORG.value(),
      autoDetect,
      getCatalogConfig: catalogConfigStore.getCatalogConfig,
    });
    res.status(200).json({
      ok: true,
      sandbox,
      offerSchemaTitle: decisioningCatalogService.OFFER_SCHEMA_TITLE,
      record,
      schemaId: resolved.schemaId || (record && record.schemaId) || null,
      source: resolved.source || (record && record.schemaId ? 'firestore' : null),
      error: resolved.ok ? undefined : resolved.error,
      routes: { config: '/api/catalog/config' },
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e), sandbox });
  }
});

/** POST /api/decisioning/catalog/assess — catalog health report + suggestions */
exports.decisioningCatalogAssessProxy = onRequest(profileFnOpts, async (req, res) => {
  setCors(res, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let body;
  try {
    body = typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse(req.rawBody || '{}');
  } catch {
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }

  const sandbox = String(body.sandbox || '').trim() || resolveSandboxFromQuery(req);

  let accessToken;
  try {
    accessToken = await getAdobeAccessToken();
  } catch (e) {
    res.status(500).json({ error: 'Auth failed', detail: String(e.message || e) });
    return;
  }

  try {
    const report = await decisioningCatalogAssessService.assessDecisioningCatalog({
      sandbox,
      accessToken,
      clientId: ADOBE_CLIENT_ID.value(),
      orgId: ADOBE_IMS_ORG.value(),
      schemaId: body.schemaId || body.schema_id,
      autoDetect: body.autoDetect !== false && body.auto_detect !== false,
      getCatalogConfig: catalogConfigStore.getCatalogConfig,
    });
    res.status(200).json({ sandbox, ...report });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e), sandbox });
  }
});

/** GET /api/campaign-name?id= */
exports.campaignNameProxy = onRequest(profileFnOpts, async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed', name: null });
    return;
  }
  const id = String(req.query.id || '').trim();
  const sandbox = resolveSandboxFromQuery(req);
  if (!id) {
    res.status(400).json({ error: 'Missing id. Use ?id=...', name: null });
    return;
  }
  let accessToken;
  try {
    accessToken = await getAdobeAccessToken();
  } catch (e) {
    res.status(500).json({ error: 'Auth failed', detail: String(e.message || e), name: null });
    return;
  }
  try {
    const name = await joLookups.getCampaignNameById(
      id,
      sandbox,
      accessToken,
      ADOBE_CLIENT_ID.value(),
      ADOBE_IMS_ORG.value()
    );
    res.status(200).json({ id, name });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e), name: null });
  }
});

/** GET /api/journey-name?id= */
exports.journeyNameProxy = onRequest(profileFnOpts, async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed', name: null });
    return;
  }
  const id = String(req.query.id || '').trim();
  const sandbox = resolveSandboxFromQuery(req);
  if (!id) {
    res.status(400).json({ error: 'Missing id. Use ?id=...', name: null });
    return;
  }
  try {
    const cached = await journeyNameStore.getCachedJourneyName(sandbox, id);
    if (cached) {
      res.status(200).json({ id, name: cached, source: 'cache' });
      return;
    }
  } catch (e) {
    console.log('[journeyNameProxy] cache read failed, falling through to API', String(e.message || e));
  }
  let accessToken;
  try {
    accessToken = await getAdobeAccessToken();
  } catch (e) {
    res.status(500).json({ error: 'Auth failed', detail: String(e.message || e), name: null });
    return;
  }
  try {
    const name = await joLookups.getJourneyNameById(
      id,
      sandbox,
      accessToken,
      ADOBE_CLIENT_ID.value(),
      ADOBE_IMS_ORG.value()
    );
    // Bulk-cache all discovered journey names from the version map
    try {
      const vmap = await joLookups.listJourneyVersionMap(
        sandbox, accessToken, ADOBE_CLIENT_ID.value(), ADOBE_IMS_ORG.value()
      );
      const writes = [];
      for (const [vid, vname] of vmap) {
        if (vname) writes.push(journeyNameStore.setCachedJourneyName(sandbox, vid, vname));
      }
      if (name && !vmap.has(id)) {
        writes.push(journeyNameStore.setCachedJourneyName(sandbox, id, name));
      }
      await Promise.allSettled(writes);
    } catch (bulkErr) {
      if (name) {
        await journeyNameStore.setCachedJourneyName(sandbox, id, name).catch(() => {});
      }
    }
    res.status(200).json({ id, name, source: 'api' });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e), name: null });
  }
});

/** GET /api/webhooks/config|feed|stats, POST /api/webhooks/clear, ALL /api/webhooks/r/:sandbox/:token — per-sandbox webhook inbox (Firestore). */
exports.sandboxWebhookTool = onRequest(CONSENT_STORE_FN_OPTS, sandboxWebhookTool);

exports.webhookListenerProxy = onRequest(
  {
    region: REGION,
    invoker: 'public',
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method !== 'GET') {
      res.status(405).json({ ok: false, error: 'GET only' });
      return;
    }

    const raw = (process.env.WEBHOOK_LISTENER_URL || DEFAULT_WEBHOOK_LISTENER_URL).trim();
    let u;
    try {
      u = new URL(raw);
    } catch {
      res.status(500).json({ ok: false, error: 'Invalid WEBHOOK_LISTENER_URL' });
      return;
    }
    if (u.protocol !== 'https:' || u.hostname !== WEBHOOK_LISTENER_ALLOWED_HOST) {
      res.status(403).json({
        ok: false,
        error: 'Webhook listener host not allowlisted',
        allowed_host: WEBHOOK_LISTENER_ALLOWED_HOST,
      });
      return;
    }

    let upstream;
    try {
      upstream = await fetch(raw, {
        headers: { Accept: 'application/json', 'User-Agent': 'aep-decisioning-firebase-proxy' },
      });
    } catch (e) {
      res.status(502).json({ ok: false, error: String(e.message || e) });
      return;
    }

    const ct = upstream.headers.get('Content-Type') || '';
    if (!ct.toLowerCase().includes('json')) {
      const snippet = (await upstream.text()).slice(0, 500);
      res.status(502).json({
        ok: false,
        error: 'Upstream did not return JSON',
        upstream_status: upstream.status,
        snippet,
      });
      return;
    }

    let payload;
    try {
      payload = await upstream.json();
    } catch {
      res.status(502).json({
        ok: false,
        error: 'Invalid JSON from webhook listener',
        upstream_status: upstream.status,
      });
      return;
    }

    res.status(200).json({
      ok: true,
      upstream_status: upstream.status,
      listener_url: raw,
      data: payload,
    });
  }
);

/** GET /api/loyalty-provider/health|{sandbox}/ledger — proxy to AJO loyalty reward provider on Cloud Run. */
exports.loyaltyRewardProviderTool = onRequest(
  {
    region: REGION,
    invoker: 'public',
    secrets: [LOYALTY_PROVIDER_API_KEY],
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (req, res) => {
    await loyaltyRewardProviderProxy.handleLoyaltyRewardProviderRequest(req, res, {
      setCors,
      LOYALTY_PROVIDER_API_KEY,
    });
  },
);

/** @deprecated Use loyaltyRewardProviderTool — alias for /api/fake-loyalty/** backward compat. */
exports.fakeLoyaltyTool = exports.loyaltyRewardProviderTool;

// ---------------------------------------------------------------------------
// Schema Viewer / Data Viewer — serves /api/schema-viewer/** sub-paths
// ---------------------------------------------------------------------------

const schemaViewerFnOpts = {
  region: REGION,
  secrets: PROFILE_FN_SECRETS,
  environmentVariables: { ADOBE_SANDBOX_NAME: RESOLVED_ADOBE_SANDBOX },
  invoker: 'public',
  timeoutSeconds: 300,
  memory: '512MiB',
};

exports.schemaViewerProxy = onRequest(schemaViewerFnOpts, async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }

  let subPath = (req.path || req.url || '')
    .replace(/^\/api\/schema-viewer\/?/, '')
    .split('?')[0]
    .replace(/\/$/, '')
    .replace(/^\/+/, '');
  if (!subPath) {
    subPath = String(req.query.subPath || req.query.path || '').trim().replace(/^\/+/, '').replace(/\/$/, '');
  }
  const sandbox = (req.query.sandbox || '').trim() || RESOLVED_ADOBE_SANDBOX;
  const forceRefresh = req.query.refresh === 'true';
  const CDN_TTL = 600; // 10 minutes
  const CACHEABLE = ['overview-stats', 'tenant-schemas', 'datasets', 'audiences'];

  let accessToken;
  try { accessToken = await getAdobeAccessToken(); } catch (e) {
    res.status(500).json({ error: 'Auth failed', detail: String(e.message || e) });
    return;
  }
  const clientId = ADOBE_CLIENT_ID.value();
  const orgId = ADOBE_IMS_ORG.value();

  try {
    let result;
    switch (subPath) {
      case 'overview-stats': {
        const [composed, dsResult] = await Promise.all([
          (async () => {
            let catInfo = null;
            try { catInfo = await schemaViewerService.fetchCatalogDatasetSchemaInfo(accessToken, clientId, orgId, sandbox); } catch { catInfo = null; }
            return schemaViewerService.fetchComposedSchemasListForSandbox(accessToken, clientId, orgId, sandbox, catInfo);
          })(),
          schemaViewerService.fetchCatalogDatasetsList(accessToken, clientId, orgId, sandbox),
        ]);
        const { sandboxName, schemas: rawList, schemaListSource } = composed;
        let profileCount = 0, eventCount = 0, otherCount = 0;
        for (const s of rawList) {
          const id = schemaViewerService.schemaSummaryKey(s);
          if (!id) continue;
          const kind = schemaViewerService.classifySchemaOverviewKind(s && s['meta:class']);
          if (kind === 'profile') profileCount++; else if (kind === 'event') eventCount++; else otherCount++;
        }
        result = { sandbox: sandboxName, schemaCount: profileCount + eventCount + otherCount, profileSchemaCount: profileCount, eventSchemaCount: eventCount, otherSchemaCount: otherCount, datasetCount: dsResult.datasets.length, schemaListSource: schemaListSource || 'registry' };
        break;
      }

      case 'tenant-schemas': {
        let catInfo = null;
        try { catInfo = await schemaViewerService.fetchCatalogDatasetSchemaInfo(accessToken, clientId, orgId, sandbox); } catch { catInfo = null; }
        const { sandboxName, schemas: rawList, schemaListSource, catalogLightGetMisses = 0 } =
          await schemaViewerService.fetchComposedSchemasListForSandbox(accessToken, clientId, orgId, sandbox, catInfo);
        const datasetCounts = catInfo?.counts ?? null;
        const mapped = rawList.map((s) => schemaViewerService.mapSchemaToRow(s, datasetCounts)).filter((x) => x.id);
        result = { sandbox: sandboxName, count: mapped.length, schemas: mapped, datasetCountsFromCatalog: datasetCounts != null, schemaListSource: schemaListSource || 'registry', catalogLightGetMisses, omittedByTitleNoiseFilter: 0 };
        break;
      }

      case 'registry': {
        const schemaId = (req.query.schemaId || req.query.schema_id || '').trim();
        if (!schemaId) { res.status(400).json({ error: 'Missing schemaId (full schema URI).' }); return; }
        const schema = await schemaViewerService.fetchSchemaById(accessToken, clientId, orgId, sandbox, schemaId);
        res.json({ schemaId, schema });
        return;
      }

      case 'datasets': {
        const { sandboxName, datasets } = await schemaViewerService.fetchCatalogDatasetsList(accessToken, clientId, orgId, sandbox);
        let enriched = datasets;
        try { enriched = await schemaViewerService.enrichDatasetsWithSchemaTitles(accessToken, clientId, orgId, sandboxName, datasets); } catch { enriched = datasets.map((d) => ({ ...d, schemaTitle: '' })); }
        const sorted = [...enriched].sort((a, b) => String(a.name || a.id || '').localeCompare(String(b.name || b.id || ''), undefined, { sensitivity: 'base' }));
        result = { sandbox: sandboxName, count: sorted.length, datasets: sorted };
        break;
      }

      case 'dataset-batches': {
        const datasetId = (req.query.datasetId || req.query.dataset_id || '').trim();
        if (!datasetId) { res.status(400).json({ error: 'Missing datasetId query parameter.' }); return; }
        const lim = Math.max(1, Math.min(200, Number(req.query.limit) || 25));
        const { sandboxName, rows, metricsSource } =
          await schemaViewerService.fetchCatalogBatchesByDataset(accessToken, clientId, orgId, sandbox, datasetId, lim);
        result = { sandbox: sandboxName, datasetId, count: rows.length, rows, metricsSource: metricsSource || null };
        break;
      }

      case 'audiences': {
        const { sandboxName, audiences } = await schemaViewerService.fetchAudiencesList(accessToken, clientId, orgId, sandbox);
        const sorted = [...audiences].sort((a, b) => String(a.name || a.id || '').localeCompare(String(b.name || b.id || ''), undefined, { sensitivity: 'base' }));
        result = { sandbox: sandboxName, count: sorted.length, audiences: sorted };
        break;
      }

      case 'audience-members': {
        const audienceId = (req.query.audienceId || '').trim();
        if (!audienceId) { res.status(400).json({ error: 'Missing audienceId query parameter.', members: [] }); return; }
        const payload = await schemaViewerService.runAudiencePreviewSample(accessToken, clientId, orgId, sandbox, audienceId);
        res.json(payload);
        return;
      }

      case 'operational-sample': {
        try {
          const { readFileSync, existsSync } = require('fs');
          const { join } = require('path');
          const samplePath = join(__dirname, 'operational-profile-schema-sample.json');
          if (!existsSync(samplePath)) { res.status(404).json({ error: 'operational-profile-schema-sample.json not found' }); return; }
          const raw = readFileSync(samplePath, 'utf8');
          res.type('json').send(raw);
        } catch (e) { res.status(500).json({ error: e.message || 'Failed to read sample' }); }
        return;
      }

      default:
        res.set('Cache-Control', 'no-store');
        res.status(404).json({ error: `Unknown schema-viewer sub-path: ${subPath}` });
        return;
    }

    if (result && CACHEABLE.includes(subPath)) {
      if (!forceRefresh) {
        res.set('Cache-Control', `public, s-maxage=${CDN_TTL}, stale-while-revalidate=${CDN_TTL}`);
      } else {
        res.set('Cache-Control', 'no-store');
      }
      svCache.touchSandbox(sandbox).catch(() => {});
      res.json({ ...result, _cache: forceRefresh ? 'refreshed' : 'miss' });
    } else {
      res.set('Cache-Control', 'no-store');
      res.json(result);
    }
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// ---------------------------------------------------------------------------
// Audit Events — paginated fetch with Firestore cache
// ---------------------------------------------------------------------------

exports.auditEventsProxy = onRequest(
  {
    region: REGION,
    secrets: PROFILE_FN_SECRETS,
    environmentVariables: { ADOBE_SANDBOX_NAME: RESOLVED_ADOBE_SANDBOX },
    invoker: 'public',
    timeoutSeconds: 300,
    memory: '256MiB',
  },
  async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

    let body;
    try {
      body = typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse(req.rawBody || '{}');
    } catch {
      res.status(400).json({ error: 'Invalid JSON body' });
      return;
    }

    const sandbox = String(body.sandbox || '').trim() ||
      String(process.env.ADOBE_SANDBOX_NAME || DEFAULT_ADOBE_SANDBOX).trim();
    const startISO = body.startDate || '';
    const endISO = body.endDate || '';
    const action = body.action || '';
    const skipCache = !!body.skipCache;

    if (!startISO || !endISO) {
      res.status(400).json({ error: 'startDate and endDate are required (ISO strings)' });
      return;
    }

    let accessToken;
    try {
      accessToken = await getAdobeAccessToken();
    } catch (e) {
      res.status(500).json({ error: 'Auth failed', detail: String(e.message || e) });
      return;
    }

    try {
      const result = await auditEventsService.getAuditEvents({
        token: accessToken,
        clientId: ADOBE_CLIENT_ID.value(),
        orgId: ADOBE_IMS_ORG.value(),
        sandbox,
        startISO,
        endISO,
        action,
        skipCache,
      });
      res.status(200).json({ success: true, ...result });
    } catch (e) {
      res.status(500).json({ error: String(e.message || e) });
    }
  },
);

// ---------------------------------------------------------------------------
// Edge Event Tool — send events via Edge Network interact, config per sandbox
// ---------------------------------------------------------------------------

function serializeEventConfigRecord(doc) {
  if (!doc || typeof doc !== 'object') return null;
  const o = { ...doc };
  if (o.updatedAt && typeof o.updatedAt.toDate === 'function') {
    o.updatedAt = o.updatedAt.toDate().toISOString();
  }
  return o;
}

function serializeDecisionLabRecord(doc) {
  if (!doc || typeof doc !== 'object') return null;
  const o = { ...doc };
  if (o.updatedAt && typeof o.updatedAt.toDate === 'function') {
    o.updatedAt = o.updatedAt.toDate().toISOString();
  }
  return o;
}

/** POST /api/events/edge — build XDM, send to Edge Network */
exports.eventEdgeProxy = onRequest(
  {
    region: REGION,
    secrets: PROFILE_FN_SECRETS,
    environmentVariables: { ADOBE_SANDBOX_NAME: RESOLVED_ADOBE_SANDBOX },
    invoker: 'public',
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

    let body;
    try {
      body = typeof req.body === 'object' && req.body !== null ? req.body : JSON.parse(req.rawBody || '{}');
    } catch {
      res.status(400).json({ error: 'Invalid JSON body' }); return;
    }

    const datastreamId = String(body.datastreamId || '').trim();
    if (!datastreamId) {
      res.status(400).json({ error: 'datastreamId is required' }); return;
    }

    let accessToken;
    try { accessToken = await getAdobeAccessToken(); }
    catch (e) { res.status(500).json({ error: 'Auth failed', detail: String(e.message || e) }); return; }

    const clientId = ADOBE_CLIENT_ID.value();
    const orgId = ADOBE_IMS_ORG.value();

    try {
      let payload;
      if (body.rawPayload && typeof body.rawPayload === 'object') {
        payload = body.rawPayload;
      } else if (body.triggerTemplate && typeof body.triggerTemplate === 'object') {
        payload = eventEdgeService.buildTriggerPayload(
          body.triggerTemplate,
          body.ecid || '',
          body.email || '',
          body.eventType || body.triggerTemplate.event?.xdm?.eventType || ''
        );
      } else {
        const xdm = eventEdgeService.buildGeneratorEdgeInteractXdm(body, {
          xdmStyle: body.xdmStyle || body.xdm_style || 'minimal',
        });
        payload = { event: { xdm } };
      }

      const result = await eventEdgeService.sendEdgeEvent(accessToken, clientId, orgId, datastreamId, payload);
      res.status(200).json({ ok: true, ...result, sentPayload: payload });
    } catch (e) {
      res.status(502).json({ error: String(e.message || e) });
    }
  },
);

/** GET /api/events/generator-targets — static presets + per-sandbox Firestore (Event tool / Decision lab). */
exports.eventGeneratorTargetsProxy = onRequest(profileFnOpts, async (req, res) => {
  setCors(res, 'GET, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  try {
    const sandbox = resolveSandboxFromQuery(req);
    const uid = await labUserSandboxStore.verifyIdTokenFromRequest(req);
    const staticTargets = eventGeneratorService.loadEventGeneratorTargets();
    let eventRec;
    let decisionRec;
    try {
      [eventRec, decisionRec] = await Promise.all([
        eventConfigStore.getEffectiveEventConfig(sandbox, uid),
        decisionLabConfigStore.getEffectiveDecisionLabConfig(sandbox, uid),
      ]);
    } catch (e) {
      eventRec = null;
      decisionRec = null;
    }
    const virtual = eventGeneratorService.buildLabFirestoreGeneratorPresets(sandbox, eventRec, decisionRec);
    const merged = [...virtual, ...staticTargets];
    const targets = merged.map((t) => ({
      id: t.id,
      label: t.label,
      transport: t.transport,
      dataStreamId: t.dataStreamId || null,
      xdmStyle: t.xdmStyle || 'full',
      streamingUrl: t.streamingUrl || null,
      source: t.source || 'preset',
    }));
    res.status(200).json({ sandbox, targets });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

/** POST /api/events/generator — Event Generator (same contract as aep-event-sender-bundle). */
exports.eventGeneratorProxy = onRequest(profileFnOpts, async (req, res) => {
  setCors(res, 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const email = (body.email || '').trim();
  const ecidRaw = body.ecid != null ? String(body.ecid).trim() : '';
  const ecidOk = /^\d{10,}$/.test(ecidRaw);
  if (!email && !ecidOk) {
    res.status(400).json({
      error:
        'Missing identity. Enter an email in the lab strip, or ensure a browser ECID is present (inject Web SDK and wait for the ECID in the strip) before sending events.',
    });
    return;
  }
  const sandbox = String(body.sandbox || '').trim() || resolveSandboxFromQuery(req);
  const uid = await labUserSandboxStore.verifyIdTokenFromRequest(req);
  const staticTargets = eventGeneratorService.loadEventGeneratorTargets();
  let eventRec;
  let decisionRec;
  try {
    [eventRec, decisionRec] = await Promise.all([
      eventConfigStore.getEffectiveEventConfig(sandbox, uid),
      decisionLabConfigStore.getEffectiveDecisionLabConfig(sandbox, uid),
    ]);
  } catch (e) {
    eventRec = null;
    decisionRec = null;
  }
  const virtual = eventGeneratorService.buildLabFirestoreGeneratorPresets(sandbox, eventRec, decisionRec);
  const allTargets = [...virtual, ...staticTargets];
  const wantId = (body.targetId || '').trim();
  const presetResult = eventGeneratorService.resolveGeneratorPreset(allTargets, wantId, sandbox);
  if (!presetResult.ok) {
    return res.status(400).json({
      error: presetResult.error,
      hint: presetResult.hint,
      requestedTargetId: presetResult.requestedId,
      availableTargetIds: presetResult.availableTargetIds,
      sandbox,
    });
  }
  const preset = presetResult.preset;

  let accessToken;
  try {
    accessToken = await getAdobeAccessToken();
  } catch (e) {
    res.status(500).json({ error: 'Auth failed', detail: String(e.message || e) });
    return;
  }
  const clientId = ADOBE_CLIENT_ID.value();
  const orgId = ADOBE_IMS_ORG.value();
  const transport = (preset.transport || 'dcs').toLowerCase() === 'edge' ? 'edge' : 'dcs';

  try {
    if (transport === 'edge') {
      if (!preset.dataStreamId || typeof preset.dataStreamId !== 'string') {
        res.status(500).json({ error: 'Preset is missing dataStreamId.' });
        return;
      }
      const xdm = eventEdgeService.buildGeneratorEdgeInteractXdm(body, preset);
      const edgeBase = (preset.edgeInteractBase || 'https://server.adobedc.net/ee/v2/interact').split('?')[0];
      const edgeUrl = `${edgeBase}?dataStreamId=${encodeURIComponent(preset.dataStreamId)}`;
      const payload = { event: { xdm } };
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        'x-api-key': clientId,
        'x-gw-ims-org-id': orgId,
      };
      const edgeRes = await fetch(edgeUrl, { method: 'POST', headers, body: JSON.stringify(payload) });
      const text = await edgeRes.text();
      let data = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = {};
      }
      if (!edgeRes.ok) {
        const msg =
          data.message || data.title || data.detail || data.error || text.slice(0, 200) || `Edge ${edgeRes.status}`;
        return res.status(502).json({
          error: msg,
          edgeStatus: edgeRes.status,
          edgeBody: text.slice(0, 500),
          edgeUrl,
        });
      }
      return res.json({
        ok: true,
        message: 'Event sent to Edge interact.',
        transport: 'edge',
        edgeUrl,
        requestId: data.requestId || null,
        targetId: preset.id,
      });
    }

    const xdm = eventGeneratorService.buildEventGeneratorXdm(body, { style: 'full' });
    const idStr = xdm._id != null ? String(xdm._id) : `event-${Date.now()}`;
    const ts = xdm.timestamp || new Date().toISOString();
    const xdmEntity = {
      ...xdm,
      _id: idStr,
      '@id': idStr,
      'xdm:timestamp': ts,
      timestamp: ts,
    };
    const streamEnvelope = {
      header: {
        schemaRef: {
          id: eventGeneratorService.EVENT_GENERATOR_SCHEMA_ID,
          contentType: eventGeneratorService.EVENT_SCHEMA_CONTENT_TYPE,
        },
        imsOrgId: orgId,
        datasetId: eventGeneratorService.EVENT_GENERATOR_DATASET_ID,
        source: { name: 'AEP Orchestration Lab Event Generator' },
      },
      body: {
        xdmMeta: {
          schemaRef: { id: eventGeneratorService.EVENT_GENERATOR_SCHEMA_ID, contentType: eventGeneratorService.EVENT_SCHEMA_CONTENT_TYPE },
        },
        xdmEntity,
      },
    };
    const sandbox = eventGeneratorService.DEFAULT_SANDBOX;
    const streamUrl = (preset.streamingUrl && String(preset.streamingUrl).trim()) || eventGeneratorService.EVENT_GENERATOR_STREAMING_URL;
    const streamRes = await fetch(streamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'sandbox-name': sandbox,
        Authorization: `Bearer ${accessToken}`,
        'x-adobe-flow-id': eventGeneratorService.EVENT_GENERATOR_FLOW_ID,
      },
      body: JSON.stringify(streamEnvelope),
    });
    const rtext = await streamRes.text();
    let sdata = {};
    try {
      sdata = rtext ? JSON.parse(rtext) : {};
    } catch {
      sdata = {};
    }
    if (!streamRes.ok) {
      return res.status(502).json({
        error: sdata.message || sdata.title || sdata.detail || sdata.report?.message || `Streaming ${streamRes.status}`,
        streamingResponse: sdata,
        streamingUrl: streamUrl,
        targetId: preset.id,
      });
    }
    return res.json({
      ok: true,
      message: 'Event sent to AEP (streaming).',
      eventId: xdmEntity['@id'],
      streamingUrl: streamUrl,
      targetId: preset.id,
      transport: 'dcs',
    });
  } catch (err) {
    res.status(500).json({ error: err && err.message ? err.message : String(err) });
  }
});

/** GET/POST /api/events/config — per-sandbox Edge config (Firestore) */
exports.eventConfigStore = onRequest(CONSENT_STORE_FN_OPTS, async (req, res) => {
  setCors(res, 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }

  const requestedPath = String(req.originalUrl || req.url || req.path || '').split('?')[0];
  if (requestedPath === '/api/orchestrated-campaigns/config') {
    await handleOrchestratedCampaignConfig(req, res);
    return;
  }

  const sandbox = (req.method === 'POST' && req.body?.sandbox)
    ? String(req.body.sandbox).trim()
    : resolveSandboxFromQuery(req);

  const uid = await labUserSandboxStore.verifyIdTokenFromRequest(req);

  if (req.method === 'GET') {
    try {
      const record = await eventConfigStore.getEffectiveEventConfig(sandbox, uid);
      res.status(200).json({
        ok: true,
        sandbox,
        record: serializeEventConfigRecord(record),
        storage: uid ? 'user' : 'shared',
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e.message || e), sandbox });
    }
    return;
  }
  if (req.method === 'POST') {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    try {
      if (!uid) {
        res.status(401).json({
          ok: false,
          error: 'Sign in required to save Edge config (anonymous sign-in is enough).',
          sandbox,
        });
        return;
      }
      const record = await eventConfigStore.saveEffectiveEventConfig(sandbox, uid, {
        datastreamId: body.datastreamId,
        datastreamTitle: body.datastreamTitle,
        schemaTitle: body.schemaTitle,
        schemaId: body.schemaId,
        datasetName: body.datasetName,
        customTriggers: body.customTriggers,
        quickMenuTriggers: body.quickMenuTriggers,
      });
      res.status(200).json({
        ok: true,
        sandbox,
        record: serializeEventConfigRecord(record),
        storage: 'user',
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e.message || e), sandbox });
    }
    return;
  }
  res.status(405).json({ error: 'Method not allowed' });
});

/** Handle /api/orchestrated-campaigns/config through the existing Event config function. */
async function handleOrchestratedCampaignConfig(req, res) {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const sandbox = req.method === 'POST' && body.sandbox
    ? String(body.sandbox).trim()
    : resolveSandboxFromQuery(req);
  const uid = await labUserSandboxStore.verifyIdTokenFromRequest(req);

  if (req.method === 'GET') {
    try {
      const record = await orchestratedCampaignConfigStore.getEffectiveConfig(sandbox, uid);
      res.status(200).json({
        ok: true,
        sandbox,
        record: serializeFirestoreRecord(record),
        storage: uid ? 'user' : 'shared',
      });
    } catch (error) {
      res.status(500).json({ ok: false, sandbox, error: String(error?.message || error) });
    }
    return;
  }

  if (req.method === 'POST') {
    if (!uid) {
      res.status(401).json({
        ok: false,
        sandbox,
        error: 'Sign in required to save campaign triggers. The browser will retain a local fallback.',
      });
      return;
    }
    try {
      const record = await orchestratedCampaignConfigStore.saveEffectiveConfig(
        sandbox,
        uid,
        body.campaigns,
      );
      res.status(200).json({
        ok: true,
        sandbox,
        record: serializeFirestoreRecord(record),
        storage: 'user',
      });
    } catch (error) {
      res.status(500).json({ ok: false, sandbox, error: String(error?.message || error) });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}

/** GET/POST /api/catalog/config — per-sandbox catalog schema ID (Firestore) */
exports.catalogConfigStore = onRequest(CONSENT_STORE_FN_OPTS, async (req, res) => {
  setCors(res, 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }

  const sandbox = (req.method === 'POST' && req.body?.sandbox)
    ? String(req.body.sandbox).trim()
    : resolveSandboxFromQuery(req);

  const uid = await labUserSandboxStore.verifyIdTokenFromRequest(req);

  if (req.method === 'GET') {
    try {
      const record = await catalogConfigStore.getEffectiveCatalogConfig(sandbox, uid);
      res.status(200).json({ ok: true, sandbox, record, storage: uid ? 'user' : 'shared' });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e.message || e), sandbox });
    }
    return;
  }
  if (req.method === 'POST') {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    try {
      if (!uid) {
        res.status(401).json({
          ok: false,
          error: 'Sign in required to save catalog config (anonymous sign-in is enough).',
          sandbox,
        });
        return;
      }
      const record = await catalogConfigStore.saveEffectiveCatalogConfig(sandbox, uid, {
        schemaId: body.schemaId,
      });
      res.status(200).json({ ok: true, sandbox, record, storage: 'user' });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e.message || e), sandbox });
    }
    return;
  }
  res.status(405).json({ error: 'Method not allowed' });
});

/** GET/POST /api/decision-lab/config — per-sandbox Decisioning lab Edge setup (Firestore) */
exports.decisionLabConfigStore = onRequest(CONSENT_STORE_FN_OPTS, async (req, res) => {
  setCors(res, 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  const sandbox = req.method === 'POST' && req.body?.sandbox
    ? String(req.body.sandbox).trim()
    : resolveSandboxFromQuery(req);

  const uid = await labUserSandboxStore.verifyIdTokenFromRequest(req);

  if (req.method === 'GET') {
    try {
      const record = await decisionLabConfigStore.getEffectiveDecisionLabConfig(sandbox, uid);
      res.status(200).json({
        ok: true,
        sandbox,
        record: serializeDecisionLabRecord(record),
        storage: uid ? 'user' : 'shared',
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e.message || e), sandbox });
    }
    return;
  }
  if (req.method === 'POST') {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    try {
      if (!uid) {
        res.status(401).json({
          ok: false,
          error: 'Sign in required to save Decision lab config (anonymous sign-in is enough).',
          sandbox,
        });
        return;
      }
      const record = await decisionLabConfigStore.saveEffectiveDecisionLabConfig(sandbox, uid, {
        launchScriptUrl: body.launchScriptUrl,
        datastreamId: body.datastreamId,
        schemaTitle: body.schemaTitle,
        datasetName: body.datasetName,
        edgePersonalizationMode: body.edgePersonalizationMode,
        tagsPropertyRef: body.tagsPropertyRef,
        targetPageUrl: body.targetPageUrl,
        placements: body.placements,
        surfaceOverrides: body.surfaceOverrides,
        surfaceStyles: body.surfaceStyles,
      });
      res.status(200).json({
        ok: true,
        sandbox,
        record: serializeDecisionLabRecord(record),
        storage: 'user',
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e.message || e), sandbox });
    }
    return;
  }
  res.status(405).json({ error: 'Method not allowed' });
});


Object.assign(
  exports,
  registerLabRoutes({
    onRequest,
    profileFnOpts,
    CONSENT_STORE_FN_OPTS,
    setCors,
    resolveSandboxFromQuery,
    labHostingOriginForFunctionConfig,
    EASTER_EGG_MAILGUN_API_KEY,
    EASTER_EGG_MAILGUN_DOMAIN,
    envBarConfigStore,
    labUserSandboxStore,
    envBarPreferencesStore,
    labRtdbProvisionService,
    labWorkspaceAuthService,
    labProfileGenerationPrefsStore,
    labProfileRecentGeneratedStore,
    labGenerationPrefsAuth,
    labDemoConfigService,
    labDemoAssetService,
    brandScrapeStore,
    imageHostingLibrary,
    labMcpFirstRunService: createLabMcpFirstRunService({
      labUserSandboxStore,
      labRtdbProvisionService,
      labProfileGenerationPrefsStore,
    }),
    mcpApiKeyStore,
  })
);

Object.assign(
  exports,
  registerMcpKeyRoutes({
    onRequest,
    CONSENT_STORE_FN_OPTS,
    setCors,
    labUserSandboxStore,
    mcpApiKeyStore,
    labWorkspaceAuthService,
    getAdobeAccessToken,
    ADOBE_CLIENT_ID,
    ADOBE_IMS_ORG,
    sandboxesList,
  }),
);

Object.assign(
  exports,
  registerLiveActivityRoutes({
    onRequest,
    profileFnOpts,
    setCors,
    labGenerationPrefsAuth,
    labWorkspaceAuthService,
    labUserSandboxStore,
    liveActivityTemplateStore,
    liveActivityService,
    getAdobeAccessToken,
    ADOBE_CLIENT_ID,
    ADOBE_IMS_ORG,
  }),
);

/** GET /api/tags/reactor — Reactor JSON:API: companies, properties, allProperties, property-scoped lists, ruleComponents&ruleId= */
exports.tagsReactorProxy = onRequest(
  {
    region: REGION,
    secrets: PROFILE_FN_SECRETS,
    environmentVariables: { ADOBE_SANDBOX_NAME: RESOLVED_ADOBE_SANDBOX },
    invoker: 'public',
    timeoutSeconds: 300,
    memory: '512MiB',
  },
  async (req, res) => {
    setCors(res, 'GET, OPTIONS');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'GET') { res.status(405).json({ error: 'GET only' }); return; }

    const sandbox = resolveSandboxFromQuery(req);
    const resource = String(req.query.resource || 'companies').trim().toLowerCase();
    const companyId = String(req.query.companyId || '').trim();
    const propertyId = String(req.query.propertyId || '').trim();
    const ruleId = String(req.query.ruleId || '').trim();

    let accessToken;
    try { accessToken = await getAdobeAccessToken(); }
    catch (e) { res.status(500).json({ ok: false, error: 'Auth failed', detail: String(e.message || e) }); return; }

    const clientId = ADOBE_CLIENT_ID.value();
    const orgId = ADOBE_IMS_ORG.value();

    try {
      if (resource === 'companies') {
        const r = await tagsReactorService.listCompanies(accessToken, clientId, orgId);
        res.status(200).json({ ok: r.ok, sandbox, resource: 'companies', ...r });
        return;
      }
      if (resource === 'properties') {
        if (!companyId) {
          res.status(400).json({ ok: false, error: 'companyId query param is required for resource=properties', sandbox });
          return;
        }
        const r = await tagsReactorService.listProperties(accessToken, clientId, orgId, companyId);
        res.status(200).json({ ok: r.ok, sandbox, resource: 'properties', companyId, ...r });
        return;
      }
      if (resource === 'allproperties') {
        const r = await tagsReactorService.listAllPropertiesAcrossCompanies(accessToken, clientId, orgId);
        res.status(200).json({ ok: r.ok, sandbox, resource: 'allProperties', ...r });
        return;
      }
      if (resource === 'dataelements') {
        if (!propertyId) {
          res.status(400).json({
            ok: false,
            error: 'propertyId query param is required for resource=dataElements',
            sandbox,
          });
          return;
        }
        const r = await tagsReactorService.listDataElements(accessToken, clientId, orgId, propertyId);
        res.status(200).json({
          ok: r.ok,
          sandbox,
          resource: 'dataElements',
          propertyId,
          items: r.items,
          pagesFetched: r.pagesFetched,
          meta: r.meta,
          httpStatus: r.httpStatus,
          error: r.error,
        });
        return;
      }
      const propertyScoped = [
        ['extensions', () => tagsReactorService.listExtensions(accessToken, clientId, orgId, propertyId)],
        ['rules', () => tagsReactorService.listRules(accessToken, clientId, orgId, propertyId)],
        ['hosts', () => tagsReactorService.listHosts(accessToken, clientId, orgId, propertyId)],
        ['environments', () => tagsReactorService.listEnvironments(accessToken, clientId, orgId, propertyId)],
        ['libraries', () => tagsReactorService.listLibraries(accessToken, clientId, orgId, propertyId)],
      ];
      for (const [resName, fn] of propertyScoped) {
        if (resource === resName) {
          if (!propertyId) {
            res.status(400).json({
              ok: false,
              error: `propertyId query param is required for resource=${resName}`,
              sandbox,
            });
            return;
          }
          const r = await fn();
          res.status(200).json({
            ok: r.ok,
            sandbox,
            resource: resName,
            propertyId,
            items: r.items,
            pagesFetched: r.pagesFetched,
            meta: r.meta,
            httpStatus: r.httpStatus,
            error: r.error,
          });
          return;
        }
      }
      if (resource === 'rulecomponents') {
        if (!ruleId) {
          res.status(400).json({
            ok: false,
            error: 'ruleId query param is required for resource=ruleComponents',
            sandbox,
          });
          return;
        }
        const r = await tagsReactorService.listRuleComponents(accessToken, clientId, orgId, ruleId);
        res.status(200).json({
          ok: r.ok,
          sandbox,
          resource: 'ruleComponents',
          ruleId,
          items: r.items,
          pagesFetched: r.pagesFetched,
          meta: r.meta,
          httpStatus: r.httpStatus,
          error: r.error,
        });
        return;
      }
      res.status(400).json({
        ok: false,
        error:
          'Invalid resource. Use companies, properties (companyId), allProperties, dataElements|extensions|rules|hosts|environments|libraries (propertyId), or ruleComponents (ruleId).',
        sandbox,
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e.message || e), sandbox });
    }
  },
);

/**
 * POST /api/edge-decisioning/preview-launch-rule
 * Read-only: resolves a Tags property + rule + Send-Event action, computes
 * the proposed merge of surfaces / decisionScopes based on placements +
 * target page URL, and returns a diff. No writes to Reactor.
 */
exports.edgeLaunchRulePreview = onRequest(
  {
    region: REGION,
    secrets: PROFILE_FN_SECRETS,
    environmentVariables: { ADOBE_SANDBOX_NAME: RESOLVED_ADOBE_SANDBOX },
    invoker: 'public',
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  async (req, res) => {
    setCors(res, 'POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'POST only' }); return; }
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    if (!body.propertyRef) { res.status(400).json({ ok: false, error: 'propertyRef required (name or PR… id)' }); return; }
    if (!body.targetPageUrl) { res.status(400).json({ ok: false, error: 'targetPageUrl required' }); return; }

    let accessToken;
    try { accessToken = await getAdobeAccessToken(); }
    catch (e) { res.status(500).json({ ok: false, error: 'Auth failed', detail: String(e.message || e) }); return; }

    const clientId = ADOBE_CLIENT_ID.value();
    const orgId = ADOBE_IMS_ORG.value();
    try {
      const result = await edgeLaunchRuleService.previewLaunchRuleUpdate({
        accessToken, clientId, orgId,
        propertyRef: body.propertyRef,
        ruleName: body.ruleName || 'Page View',
        targetPageUrl: body.targetPageUrl,
        placements: Array.isArray(body.placements) ? body.placements : [],
        edgePersonalizationMode: body.edgePersonalizationMode || null,
      });
      res.status(result.ok ? 200 : 400).json(result);
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e && e.message || e) });
    }
  },
);

/**
 * POST /api/edge-decisioning/apply-launch-rule
 * Writes: PATCH the Send-Event action's settings with the merged surfaces +
 * decisionScopes. Returns before/after. Does NOT build/publish — a Launch
 * library + build + publish still needs to run before the change is live.
 */
exports.edgeLaunchRuleApply = onRequest(
  {
    region: REGION,
    secrets: PROFILE_FN_SECRETS,
    environmentVariables: { ADOBE_SANDBOX_NAME: RESOLVED_ADOBE_SANDBOX },
    invoker: 'public',
    timeoutSeconds: 120,
    memory: '256MiB',
  },
  async (req, res) => {
    setCors(res, 'POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'POST only' }); return; }
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    if (!body.propertyRef) { res.status(400).json({ ok: false, error: 'propertyRef required' }); return; }
    if (!body.targetPageUrl) { res.status(400).json({ ok: false, error: 'targetPageUrl required' }); return; }

    let accessToken;
    try { accessToken = await getAdobeAccessToken(); }
    catch (e) { res.status(500).json({ ok: false, error: 'Auth failed', detail: String(e.message || e) }); return; }

    const clientId = ADOBE_CLIENT_ID.value();
    const orgId = ADOBE_IMS_ORG.value();
    try {
      const result = await edgeLaunchRuleService.applyLaunchRuleUpdate({
        accessToken, clientId, orgId,
        propertyRef: body.propertyRef,
        ruleName: body.ruleName || 'Page View',
        targetPageUrl: body.targetPageUrl,
        placements: Array.isArray(body.placements) ? body.placements : [],
        edgePersonalizationMode: body.edgePersonalizationMode || null,
      });
      res.status(result.ok ? 200 : 400).json(result);
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e && e.message || e) });
    }
  },
);

/**
 * POST /api/edge-decisioning/publish-launch-rule
 * Full happy path: PATCH rule_component settings → create a fresh library
 * bound to the Development environment → add the parent rule as a resource
 * → trigger a build → poll until terminal. On success the edit is live on
 * the page without leaving this tool.
 */
exports.edgeLaunchRulePublish = onRequest(
  {
    region: REGION,
    secrets: PROFILE_FN_SECRETS,
    environmentVariables: { ADOBE_SANDBOX_NAME: RESOLVED_ADOBE_SANDBOX },
    invoker: 'public',
    timeoutSeconds: 240,
    memory: '256MiB',
  },
  async (req, res) => {
    setCors(res, 'POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'POST only' }); return; }
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    if (!body.propertyRef) { res.status(400).json({ ok: false, error: 'propertyRef required' }); return; }
    if (!body.targetPageUrl) { res.status(400).json({ ok: false, error: 'targetPageUrl required' }); return; }

    let accessToken;
    try { accessToken = await getAdobeAccessToken(); }
    catch (e) { res.status(500).json({ ok: false, error: 'Auth failed', detail: String(e.message || e) }); return; }

    const clientId = ADOBE_CLIENT_ID.value();
    const orgId = ADOBE_IMS_ORG.value();
    try {
      const result = await edgeLaunchRuleService.applyAndPublishLaunchRule({
        accessToken, clientId, orgId,
        propertyRef: body.propertyRef,
        ruleName: body.ruleName || 'Page View',
        targetPageUrl: body.targetPageUrl,
        placements: Array.isArray(body.placements) ? body.placements : [],
        edgePersonalizationMode: body.edgePersonalizationMode || null,
      });
      res.status(result.ok ? 200 : 400).json(result);
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e && e.message || e) });
    }
  },
);

/**
 * POST /api/edge-decisioning/cleanup-orphan-libraries
 * Remove unbound libraries named 'AEP Lab ...' that got created by
 * failed publish attempts. Dry-run supported via body.dryRun = true.
 */
exports.edgeLaunchRuleCleanup = onRequest(
  {
    region: REGION,
    secrets: PROFILE_FN_SECRETS,
    environmentVariables: { ADOBE_SANDBOX_NAME: RESOLVED_ADOBE_SANDBOX },
    invoker: 'public',
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  async (req, res) => {
    setCors(res, 'POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'POST only' }); return; }
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    if (!body.propertyRef) { res.status(400).json({ ok: false, error: 'propertyRef required' }); return; }

    let accessToken;
    try { accessToken = await getAdobeAccessToken(); }
    catch (e) { res.status(500).json({ ok: false, error: 'Auth failed', detail: String(e.message || e) }); return; }

    const clientId = ADOBE_CLIENT_ID.value();
    const orgId = ADOBE_IMS_ORG.value();
    try {
      const result = await edgeLaunchRuleService.cleanupOrphanAutoPublishLibraries({
        accessToken, clientId, orgId,
        propertyRef: body.propertyRef,
        dryRun: body.dryRun === true,
        namePrefix: body.namePrefix || 'AEP Lab',
      });
      res.status(result.ok ? 200 : 400).json(result);
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e && e.message || e) });
    }
  },
);

/** GET /api/events/datastreams — list datastreams from Edge API */
exports.eventDatastreamsProxy = onRequest(
  {
    region: REGION,
    secrets: PROFILE_FN_SECRETS,
    environmentVariables: { ADOBE_SANDBOX_NAME: RESOLVED_ADOBE_SANDBOX },
    invoker: 'public',
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
    if (req.method !== 'GET') { res.status(405).json({ error: 'GET only' }); return; }

    /** Lightweight: deployment IMS org only (no Edge list call) — for manual datastream entry in EDS quickstart. */
    if (String(req.query.imsOrgOnly || '').trim() === '1') {
      res.status(200).json({ ok: true, imsOrg: ADOBE_IMS_ORG.value() });
      return;
    }

    let accessToken;
    try { accessToken = await getAdobeAccessToken(); }
    catch (e) { res.status(500).json({ error: 'Auth failed', detail: String(e.message || e) }); return; }

    try {
      const sandbox = resolveSandboxFromQuery(req);
      const imsOrg = ADOBE_IMS_ORG.value();
      const result = await eventEdgeService.listDatastreams(accessToken, ADOBE_CLIENT_ID.value(), imsOrg);
      if (result && result.errors) {
        res.status(200).json({
          ok: false,
          sandbox,
          datastreams: [],
          discoveryErrors: result.errors,
          note: 'Auto-discovery failed. Paste a datastream UUID in the field.',
          imsOrg,
        });
      } else {
        let datastreams = Array.isArray(result) ? result : [];
        if (sandbox && datastreams.length) {
          const sLower = sandbox.toLowerCase();
          const filtered = datastreams.filter((d) => {
            const sn = String((d && d.sandbox) || '').trim().toLowerCase();
            return !sn || sn === sLower;
          });
          if (filtered.length > 0) datastreams = filtered;
        }
        res.status(200).json({ ok: true, sandbox, datastreams, imsOrg });
      }
    } catch (e) {
      res.status(500).json({ error: String(e.message || e), datastreams: [], imsOrg: ADOBE_IMS_ORG.value() });
    }
  },
);

// ---------------------------------------------------------------------------
// Event Infrastructure — create ExperienceEvent schema + dataset per sandbox
// ---------------------------------------------------------------------------

/** GET /api/events/infra/status?sandbox=&schemaTitle=&datasetName= */
exports.eventInfraStatus = onRequest(profileFnOpts, async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (req.method !== 'GET') { res.status(405).json({ error: 'GET only' }); return; }
  const sandbox = resolveSandboxFromQuery(req);
  const schemaTitle = String(req.query.schemaTitle || '').trim();
  const datasetName = String(req.query.datasetName || '').trim();
  if (!schemaTitle) { res.status(400).json({ error: 'schemaTitle query param is required' }); return; }
  let accessToken;
  try { accessToken = await getAdobeAccessToken(); }
  catch (e) { res.status(500).json({ error: 'Auth failed', detail: String(e.message || e) }); return; }
  try {
    const result = await eventInfraService.runEventInfraStatus(sandbox, accessToken, ADOBE_CLIENT_ID.value(), ADOBE_IMS_ORG.value(), schemaTitle, datasetName);
    res.status(200).json(result);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e), sandbox });
  }
});

/** POST /api/events/infra/step — body.step: setupEventInfra | createSchema | attachRecommendedFieldGroups | ensureBookerStayerFieldGroup | createDataset | createDatastream | probeTagsApi (+ schemaTitle?, schemaId?, …) */
exports.eventInfraStep = onRequest(profileFnOpts, async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }
  const sandbox = resolveSandboxFromQuery(req);
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const step = String(body.step || '').trim();
  let accessToken;
  try { accessToken = await getAdobeAccessToken(); }
  catch (e) { res.status(500).json({ error: 'Auth failed', detail: String(e.message || e) }); return; }
  try {
    const result = await eventInfraService.runEventInfraStep(sandbox, accessToken, ADOBE_CLIENT_ID.value(), ADOBE_IMS_ORG.value(), step, {
      schemaTitle: body.schemaTitle,
      schemaId: body.schemaId,
      datasetName: body.datasetName,
      datasetId: body.datasetId,
      datastreamName: body.datastreamName,
      enableForProfile: body.enableForProfile === true || body.enable_for_profile === true,
    });
    res.status(200).json(result);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e), sandbox, step });
  }
});

/** GET /api/events/infra/event-types?sandbox=&schemaTitle=|schemaId= — extract eventType enum from schema */
exports.eventInfraEventTypes = onRequest(profileFnOpts, async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (req.method !== 'GET') { res.status(405).json({ error: 'GET only' }); return; }
  const sandbox = resolveSandboxFromQuery(req);
  const schemaTitle = String(req.query.schemaTitle || '').trim();
  const schemaId = String(req.query.schemaId || '').trim();
  if (!schemaTitle && !schemaId) {
    res.status(400).json({ error: 'schemaTitle or schemaId query param required', eventTypes: [] });
    return;
  }
  let accessToken;
  try { accessToken = await getAdobeAccessToken(); }
  catch (e) { res.status(500).json({ error: 'Auth failed', detail: String(e.message || e), eventTypes: [] }); return; }
  try {
    const result = await eventInfraService.fetchSchemaEventTypes(sandbox, accessToken, ADOBE_CLIENT_ID.value(), ADOBE_IMS_ORG.value(), schemaTitle, schemaId);
    res.status(200).json(result);
  } catch (e) {
    res.status(500).json({ error: String(e.message || e), eventTypes: [] });
  }
});

// ---------------------------------------------------------------------------
// Journey browse — list AJO journeys for the browse table
// ---------------------------------------------------------------------------

exports.journeysBrowse = onRequest(profileFnOpts, async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const sandbox = resolveSandboxFromQuery(req);
  const cjaDataViewId = String(req.query.cjaDataViewId || '').trim();
  const cjaDateRangeRaw = String(req.query.cjaDateRangeId || req.query.cjaDateRange || '').trim();
  const cjaDateRangeForCja = cjaDateRangeRaw ? cjaJourneyMetrics.normalizeCjaDateRangeId(cjaDateRangeRaw) : cjaJourneyMetrics.normalizeCjaDateRangeId();
  const start = Math.max(0, parseInt(req.query.start, 10) || 0);
  const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 200));
  const forceRefresh =
    req.query.refresh === '1'
    || String(req.query.force || '').toLowerCase() === '1'
    || String(req.query.force || '').toLowerCase() === 'true';

  if (!forceRefresh) {
    try {
      const cached = await journeyBrowseCache.getCachedDoc(sandbox);
      if (cached && journeyBrowseCache.isFresh(cached)) {
        const base = journeyBrowseCache.toApiPayload(cached);
        const ageMs = Date.now() - (cached.cachedAt && cached.cachedAt.toDate
          ? cached.cachedAt.toDate().getTime()
          : 0);
        let journeysOut = Array.isArray(base.journeys) ? base.journeys.map((r) => ({ ...r })) : [];
        let cjaMeta = { applied: false };
        const cjaDisabled = process.env.CJA_ENABLE_METRICS === '0' || process.env.CJA_ENABLE_METRICS === 'false';
        if (!cjaDisabled && journeysOut.length > 0) {
          try {
            const cjaToken = await getAdobeAccessToken();
            const cjaOptsCached = { dateRangeId: cjaDateRangeForCja };
            if (cjaDataViewId) cjaOptsCached.dataViewId = cjaDataViewId;
            cjaMeta = await cjaJourneyMetrics.enrichJourneyRowsWithCja(
              journeysOut,
              cjaToken,
              { clientId: ADOBE_CLIENT_ID.value() },
              { orgId: ADOBE_IMS_ORG.value() },
              cjaOptsCached,
            );
          } catch (cjaErr) {
            cjaMeta = { applied: false, message: cjaErr?.message || String(cjaErr) };
          }
        } else if (cjaDisabled) {
          cjaMeta = { applied: false, message: 'CJA metrics disabled (CJA_ENABLE_METRICS).' };
        }
        res.status(200).json({
          ...base,
          journeys: journeysOut,
          cja: cjaMeta,
          fromCache: true,
          cacheAgeMs: Math.max(0, Math.round(ageMs)),
          cachedAt: cached.cachedAt && cached.cachedAt.toDate
            ? cached.cachedAt.toDate().toISOString()
            : null,
          cacheTtlMs: journeyBrowseCache.cacheTtlMs(),
        });
        return;
      }
    } catch (e) {
      /* fall through to live fetch */
    }
  }

  let accessToken;
  try { accessToken = await getAdobeAccessToken(); } catch (e) {
    res.status(500).json({ error: 'Auth failed', detail: String(e.message || e) }); return;
  }
  const clientId = ADOBE_CLIENT_ID.value();
  const orgId = ADOBE_IMS_ORG.value();
  try {
    const payload = await journeysBrowse.buildBrowseResponse(
      sandbox,
      accessToken,
      clientId,
      orgId,
      start,
      limit,
      cjaDataViewId,
      cjaDateRangeRaw ? cjaDateRangeForCja : undefined,
    );
    if (payload.ok) {
      try {
        await journeyBrowseCache.saveJourneyBrowseCache(sandbox, payload);
      } catch (e) {
        /* cache write failure should not fail the request */
      }
    }
    res.status(payload.ok ? 200 : 502).json({
      ...payload,
      fromCache: false,
      cacheTtlMs: journeyBrowseCache.cacheTtlMs(),
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e), journeys: [] });
  }
});

/** GET /api/journeys/cja-dataviews — list all CJA data views; names containing "AJO" first (Journeys UI picker). */
exports.journeysCjaDataviews = onRequest(profileFnOpts, async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (req.method !== 'GET') { res.status(405).json({ error: 'GET only' }); return; }
  let accessToken;
  try {
    accessToken = await getAdobeAccessToken();
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Auth failed', detail: String(e.message || e), dataViews: [] });
    return;
  }
  const clientId = ADOBE_CLIENT_ID.value();
  const orgId = ADOBE_IMS_ORG.value();
  try {
    const result = await cjaJourneyMetrics.listCjaDataViewsAjoEnabled(accessToken, { clientId }, { orgId });
    res.status(result.ok ? 200 : 502).json({
      ok: result.ok,
      dataViews: result.dataViews || [],
      error: result.error,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e), dataViews: [] });
  }
});

/** POST /api/easter-egg-found — Marauder's Map register (Firestore + optional Mailgun to lab owners). */
exports.easterEggNotify = onRequest(
  {
    region: REGION,
    invoker: 'public',
    timeoutSeconds: 30,
    memory: '256MiB',
    secrets: [EASTER_EGG_MAILGUN_API_KEY, EASTER_EGG_MAILGUN_DOMAIN],
    /** MAIL_FROM on your Mailgun domain; MAILGUN_REGION '' = US, 'eu' = EU API host. */
    environmentVariables: {
      EASTER_EGG_MAIL_FROM: 'postmaster@mail.apalmer-consulting.com',
      EASTER_EGG_MAILGUN_REGION: '',
    },
  },
  async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }
    if (req.method === 'GET') {
      return easterEggNotify.handleEasterEggList(req, res);
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }
    const mailgunKey = EASTER_EGG_MAILGUN_API_KEY.value();
    const mailgunDomain = EASTER_EGG_MAILGUN_DOMAIN.value();
    /** Cloud Run sometimes omits onRequest.environmentVariables; keep Postmaster default in sync with Mailgun domain. */
    const mailFrom =
      process.env.EASTER_EGG_MAIL_FROM || 'postmaster@mail.apalmer-consulting.com';
    const mailgunRegion = process.env.EASTER_EGG_MAILGUN_REGION || '';
    return easterEggNotify.handleEasterEggNotify(req, res, {
      mailgunKey,
      mailgunDomain,
      mailFrom,
      mailgunRegion,
    });
  },
);

/** Hourly refresh of Firestore journey browse cache for sandboxes that were loaded at least once. */
exports.journeyBrowseCacheRefresh = onSchedule(
  {
    schedule: 'every 60 minutes',
    region: REGION,
    secrets: PROFILE_FN_SECRETS,
    timeoutSeconds: 540,
    memory: '512MiB',
  },
  async () => {
    let sandboxes;
    try {
      sandboxes = await journeyBrowseCache.listCachedSandboxNames();
    } catch (e) {
      console.error('[journeyBrowseCacheRefresh] list failed', e);
      return;
    }
    if (sandboxes.length === 0) {
      console.log('[journeyBrowseCacheRefresh] no sandboxes in cache yet');
      return;
    }
    let accessToken;
    try {
      accessToken = await getAdobeAccessToken();
    } catch (e) {
      console.error('[journeyBrowseCacheRefresh] auth failed', e);
      return;
    }
    const clientId = ADOBE_CLIENT_ID.value();
    const orgId = ADOBE_IMS_ORG.value();
    const refreshLimit = 500;
    for (let i = 0; i < sandboxes.length; i++) {
      const sb = sandboxes[i];
      try {
        const payload = await journeysBrowse.buildBrowseResponse(
          sb,
          accessToken,
          clientId,
          orgId,
          0,
          refreshLimit,
          '',
        );
        if (payload.ok) {
          await journeyBrowseCache.saveJourneyBrowseCache(sb, payload);
        }
      } catch (e) {
        console.error('[journeyBrowseCacheRefresh] sandbox', sb, e.message || e);
      }
      await new Promise((r) => setTimeout(r, 400));
    }
    console.log('[journeyBrowseCacheRefresh] refreshed', sandboxes.length, 'sandbox(es)');
  },
);

// ---------------------------------------------------------------------------
// Scheduled CDN pre-warm — hits Data Viewer endpoints to populate CDN cache
// for recently-accessed sandboxes.
// ---------------------------------------------------------------------------

const WARM_ENDPOINTS = ['overview-stats', 'tenant-schemas', 'datasets', 'audiences'];

exports.schemaViewerCacheWarm = onSchedule(
  {
    schedule: 'every 10 minutes',
    region: REGION,
    timeoutSeconds: 300,
    memory: '256MiB',
  },
  async () => {
    const hostingOrigin = labHostingOriginForScheduledFetch();
    const sandboxes = await svCache.getRecentSandboxes();
    if (sandboxes.length === 0) return;

    for (const sandbox of sandboxes) {
      const urls = WARM_ENDPOINTS.map(
        (ep) => `${hostingOrigin}/api/schema-viewer/${ep}?sandbox=${encodeURIComponent(sandbox)}`,
      );
      await Promise.allSettled(
        urls.map((url) => fetch(url).catch(() => {})),
      );
    }
  },
);

/** POST archDiagramAssist — Vertex AI assistant for AEP & Apps architecture diagram (tour + layout actions). */
exports.archDiagramAssist = onRequest(
  {
    region: REGION,
    invoker: 'public',
    timeoutSeconds: 300,
    memory: '512MiB',
  },
  async (req, res) => {
    await archDiagramAssistService.handleAssist(req, res);
  },
);

/** GET/POST/DELETE /api/arch-proposals — per-sandbox Architecture diagram snapshots (Firestore) */
exports.archProposals = onRequest(CONSENT_STORE_FN_OPTS, async (req, res) => {
  setCors(res, 'GET, POST, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }

  const sandbox =
    req.method === 'POST' && req.body?.sandbox
      ? String(req.body.sandbox).trim()
      : resolveSandboxFromQuery(req);

  try {
    if (req.method === 'GET') {
      const id = String(req.query.id || '').trim();
      if (id) {
        const record = await archProposalStore.getProposal(sandbox, id);
        res.status(200).json({ ok: true, sandbox, record });
        return;
      }
      const items = await archProposalStore.listProposals(sandbox);
      res.status(200).json({ ok: true, sandbox, items });
      return;
    }
    if (req.method === 'POST') {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const record = await archProposalStore.saveProposal(sandbox, {
        id: body.id,
        name: body.name,
        snapshot: body.snapshot,
      });
      res.status(200).json({ ok: true, sandbox, record });
      return;
    }
    if (req.method === 'DELETE') {
      const id = String(req.query.id || (req.body && req.body.id) || '').trim();
      const ok = await archProposalStore.deleteProposal(sandbox, id);
      res.status(200).json({ ok, sandbox, id });
      return;
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e), sandbox });
  }
});

/** GET/POST /api/arch-master — shared baseline architecture snapshot (sandbox-gated write) */
exports.archMaster = onRequest(CONSENT_STORE_FN_OPTS, async (req, res) => {
  setCors(res, 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }

  try {
    if (req.method === 'GET') {
      const record = await archProposalStore.getMaster();
      res.status(200).json({ ok: true, record });
      return;
    }
    if (req.method === 'POST') {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const sandbox = String(body.sandbox || '').trim();
      const record = await archProposalStore.saveMaster(sandbox, {
        snapshot: body.snapshot,
      });
      res.status(200).json({ ok: true, record });
      return;
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    const code = e.code === 'master-forbidden' ? 403 : 500;
    res.status(code).json({ ok: false, error: String(e.message || e) });
  }
});

/** POST /api/llm-demo/personalize — crawl + grounded research for LLM Demo personalization. */
exports.llmDemoPersonalize = onRequest(
  {
    region: REGION,
    invoker: 'public',
    timeoutSeconds: 120,
    memory: '512MiB',
  },
  async (req, res) => {
    setCors(res, 'POST, OPTIONS');
    res.set('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
    try {
      await llmDemoPersonalizeService.handlePersonalize(req, res);
    } catch (e) {
      if (!res.headersSent) {
        res.status(500).json({ error: String((e && e.message) || e) });
      } else {
        console.error('[llmDemoPersonalize] error after response started', String((e && e.message) || e));
      }
    }
  },
);

/** POST /api/brand-scraper/analyze — crawl a brand URL and optionally run LLM brand analysis. */
exports.brandScraperAnalyze = onRequest(
  {
    region: REGION,
    invoker: 'public',
    timeoutSeconds: 3600,
    memory: '2GiB',
  },
  async (req, res) => {
    setCors(res, 'POST, OPTIONS');
    res.set('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
    res.set('Access-Control-Expose-Headers', 'X-Brand-Scrape-Id');
    try {
      const anthropicKey = (process.env.ANTHROPIC_API_KEY || '').trim();
      await brandScraperService.handleAnalyse(req, res, { anthropicKey });
    } catch (e) {
      if (!res.headersSent) {
        res.status(500).json({ error: String(e && e.message || e) });
      } else {
        console.error('[brandScraperAnalyze] error after response started', String((e && e.message) || e));
      }
    }
  }
);

/**
 * POST /api/bc-gemini-train — build the Gemini Brand Concierge override's per-demo
 * corpus (scrapes each website in websiteUrls via the brand scraper, stores it with
 * productNames/manifestText in Firestore). See functions/bcGeminiTrainingService.js.
 */
exports.bcGeminiTrain = onRequest(
  {
    region: REGION,
    invoker: 'public',
    timeoutSeconds: 540,
    memory: '1GiB',
  },
  async (req, res) => {
    try {
      await bcGeminiTrainingService.handleTrain(req, res);
    } catch (e) {
      if (!res.headersSent) {
        res.status(500).json({ ok: false, error: String((e && e.message) || e) });
      } else {
        console.error('[bcGeminiTrain] error after response started', String((e && e.message) || e));
      }
    }
  },
);

/**
 * POST /api/bc-gemini-answer — answer one Brand Concierge turn from the stored
 * per-demo corpus via Gemini (controlled JSON). See functions/bcGeminiAnswerService.js.
 */
exports.bcGeminiAnswer = onRequest(
  {
    region: REGION,
    invoker: 'public',
    timeoutSeconds: 60,
    memory: '512MiB',
  },
  async (req, res) => {
    try {
      await bcGeminiAnswerService.handleAnswer(req, res);
    } catch (e) {
      if (!res.headersSent) {
        res.status(500).json({ ok: false, error: String((e && e.message) || e) });
      } else {
        console.error('[bcGeminiAnswer] error after response started', String((e && e.message) || e));
      }
    }
  },
);

/** POST /api/brand-scraper/demo-build — dedicated demo website worker (separate CF budget from analyse). */
exports.brandScraperDemoBuild = onRequest(
  {
    region: REGION,
    invoker: 'public',
    timeoutSeconds: 3600,
    memory: '2GiB',
  },
  async (req, res) => {
    setCors(res, 'POST, OPTIONS');
    res.set('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
    res.set('Access-Control-Expose-Headers', 'X-Brand-Scrape-Id');
    try {
      await brandScraperService.handleDemoBuild(req, res);
    } catch (e) {
      if (!res.headersSent) {
        res.status(500).json({ error: String(e && e.message || e) });
      } else {
        console.error('[brandScraperDemoBuild] error after response started', String((e && e.message) || e));
      }
    }
  }
);

/** Fail stale running scrape index rows (interrupted runs). */
exports.brandScraperStaleCleanup = onSchedule(
  {
    schedule: 'every 15 minutes',
    region: REGION,
    timeoutSeconds: 240,
    memory: '512MiB',
  },
  async () => {
    await brandScrapeStore.runBrandScrapeStaleMaintenance();
  },
);

/** GET/POST/DELETE /api/brand-scraper/scrapes… — list, get, delete, POST …/extend retention. */
exports.brandScraperScrapes = onRequest(
  {
    region: REGION,
    invoker: 'public',
    timeoutSeconds: 120,
    memory: '256MiB',
  },
  async (req, res) => {
    setCors(res, 'GET, POST, DELETE, OPTIONS');
    res.set('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
    await brandScraperService.handleScrapes(req, res);
  }
);

/** POST /api/brand-scraper/scrapes/classify?sandbox=… — V2: download + Gemini-vision classify. */
exports.brandScraperClassify = onRequest(
  {
    region: REGION,
    invoker: 'public',
    timeoutSeconds: 300,
    memory: '1GiB',
  },
  async (req, res) => {
    setCors(res, 'POST, OPTIONS');
    await brandScraperService.handleClassifyAssets(req, res);
  }
);

/** GET/PUT /api/brand-scraper/model-config?sandbox=… — per-sandbox LLM provider + Secret Manager keys. */
exports.brandScraperModelConfig = onRequest(
  {
    region: REGION,
    invoker: 'public',
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (req, res) => {
    setCors(res, 'GET, PUT, POST, OPTIONS');
    await brandScraperService.handleModelConfig(req, res);
  }
);

/** POST /api/brand-scraper/scrapes/export?sandbox=… — build ZIP + return signed URL. */
exports.brandScraperExport = onRequest(
  {
    region: REGION,
    invoker: 'public',
    timeoutSeconds: 180,
    memory: '1GiB',
  },
  async (req, res) => {
    setCors(res, 'POST, OPTIONS');
    await brandScraperService.handleExport(req, res);
  }
);

/**
 * POST clientJourneyV2Generate
 * Body: { client, clientDomain?, brandColor, journeyType?, personaName?,
 *         personaGender?, marketerPersonaName?, tier ('Foundation'|'Advanced'),
 *         techStack?, additionalContext? }
 * Returns: { ok, meta, journey, html, sources, log }
 *
 * v2 Client Journey Asset — independent baseline. Calls Vertex AI Gemini in
 * JSON mode with Google Search grounding for client tech-stack research,
 * pre-fetches Adobe Experience League capability snippets from Context7
 * (24h Firestore cache, static-summary fallback), then renders the standalone
 * interactive HTML journey. The PPTX one-pager is rendered separately by
 * clientJourneyV2Pptx so the long Vertex call doesn't block the binary.
 *
 * Long-running: 60–180s typical. The Hosting rewrite caps proxied requests
 * at 60s, so the v2 page invokes this function via its direct Cloud Function
 * URL (the /api/client-journey-v2/generate rewrite exists for curl debugging
 * but the browser never hits it).
 */
exports.clientJourneyV2Generate = onRequest(
  {
    region: REGION,
    invoker: 'public',
    secrets: [CONTEXT7_API_KEY],
    timeoutSeconds: 540,
    memory: '1GiB',
  },
  async (req, res) => {
    res.set('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
    await clientJourneyAssetV2Service.handleGenerate(req, res, {
      contextSevenKey: CONTEXT7_API_KEY.value(),
    });
  }
);

/**
 * POST clientJourneyV2Refine
 * Body: {
 *   journey: <previous clientJourneyV2Generate journey JSON>,
 *   refinePrompt: string,
 *   context?: { client, tier, clientDomain, journeyType, personaName, ... }
 * }
 * Returns: { ok, meta, journey, html, sources, log }
 *
 * Applies conversational edits against an existing generated journey while
 * preserving schema/tier constraints. Same response contract as generate so
 * the front-end can swap the result in-place without resetting downloads.
 */
exports.clientJourneyV2Refine = onRequest(
  {
    region: REGION,
    invoker: 'public',
    secrets: [CONTEXT7_API_KEY],
    timeoutSeconds: 540,
    memory: '1GiB',
  },
  async (req, res) => {
    res.set('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
    await clientJourneyAssetV2Service.handleRefine(req, res, {
      contextSevenKey: CONTEXT7_API_KEY.value(),
    });
  }
);

/**
 * GET /api/client-journey-v2/import/scrapes?sandbox=...
 * Returns: slim brand-scrape list for CJv2 prefill picker.
 */
exports.clientJourneyV2ImportScrapes = onRequest(
  {
    region: REGION,
    invoker: 'public',
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (req, res) => {
    setCors(res, 'GET, OPTIONS');
    res.set('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
    await clientJourneyAssetV2ImportService.handleImportScrapeList(req, res);
  }
);

/**
 * GET /api/client-journey-v2/import/profile?sandbox=...&scrapeId=...
 * Returns: deterministic CJv2 form prefill mapped from one scrape record.
 */
exports.clientJourneyV2ImportProfile = onRequest(
  {
    region: REGION,
    invoker: 'public',
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (req, res) => {
    setCors(res, 'GET, OPTIONS');
    res.set('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
    await clientJourneyAssetV2ImportService.handleImportMappedProfile(req, res);
  }
);

/**
 * POST /api/client-journey-v2/pptx
 * Body: the journey JSON returned by clientJourneyV2Generate (or `{ journey }`
 * wrapping it). Re-validates the schema before rendering to keep tampered
 * round-trips from crashing the renderer.
 * Returns: binary application/vnd.openxmlformats-officedocument.presentationml.presentation
 */
exports.clientJourneyV2Pptx = onRequest(
  {
    region: REGION,
    invoker: 'public',
    timeoutSeconds: 60,
    memory: '512MiB',
  },
  async (req, res) => {
    res.set('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
    await clientJourneyAssetV2Service.handlePptx(req, res);
  }
);

/** GET /api/release-notes/summary — Experience League release highlights for home-new dashboard. */
exports.releaseNotesSummary = onRequest(
  {
    region: REGION,
    invoker: 'public',
    timeoutSeconds: 120,
    memory: '512MiB',
  },
  async (req, res) => {
    setCors(res, 'GET, OPTIONS');
    await releaseNotesSummaryService.handleSummary(req, res);
  }
);

/**
 * POST /api/demo-use-case/generate
 * Body: { sandbox, scrapeId, brandColour?, useCase?, personaName?, products?,
 *         customProduct?, stepCount?, additionalContext?, previousData?,
 *         refinementPrompt?, clientName?, images? }
 * Returns: { ok, mode, demoData, framingHtml, experienceHtml, valueHtml }
 *
 * Sister of clientJourneyV2Generate — produces a 3-slide demo deck (framing
 * → experience → value) for use alongside live customer demos. Same
 * orchestration shape (Vertex Gemini structured-output → normalise →
 * render HTML) just with a different schema and renderers.
 */
exports.demoUseCaseGenerate = onRequest(
  {
    region: REGION,
    invoker: 'public',
    timeoutSeconds: 240,
    memory: '1GiB',
  },
  async (req, res) => {
    setCors(res, 'POST, OPTIONS');
    res.set('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
    await demoUseCaseAssetService.handleGenerate(req, res);
  }
);

/**
 * POST /api/demo-use-case/pptx
 * Body: { demoData, images? }
 * Returns: binary application/vnd.openxmlformats-officedocument.presentationml.presentation
 *
 * Stateless: caller supplies a previously-generated demoData JSON object
 * plus any uploaded images (base64 data URLs); we render a 16:9 3-slide
 * deck via PptxGenJS and stream it back. No LLM call.
 */
exports.demoUseCasePptx = onRequest(
  {
    region: REGION,
    invoker: 'public',
    timeoutSeconds: 60,
    memory: '512MiB',
  },
  async (req, res) => {
    setCors(res, 'POST, OPTIONS');
    res.set('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
    await demoUseCaseAssetService.handlePptx(req, res);
  }
);

/**
 * Image hosting library API — per-sandbox curated assets promoted from
 * brand-scraper classifications.
 *   GET    /api/image-hosting/library/download?sandbox=X&customer=name   ZIP download (must stay before generic GET list)
 *   GET    /api/image-hosting/library?sandbox=X       list current library
 *   POST   /api/image-hosting/library/publish         { sandbox, scrapeId, imageIndex, overrideFolder?, overrideFile?, replaceRelPath?, confirmed? }
 *   DELETE /api/image-hosting/library?sandbox=X&relPath=...
 *   POST   /api/image-hosting/library/rename          { sandbox, relPath, newRelPath }
 *   POST   /api/image-hosting/library/folder          { sandbox, folder } — empty folder marker
 */
exports.imageHostingLibrary = onRequest(
  {
    region: REGION,
    invoker: 'public',
    // AI image generation via Gemini 2.5 Flash Image can take ~10-30s
    // on top of normal publish/restore/upload operations, so give the
    // function headroom.
    timeoutSeconds: 120,
    memory: '1GiB',
  },
  async (req, res) => {
    setCors(res, 'GET, POST, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    try {
      const path = String(req.path || '').replace(/\/+$/, '');
      const sandbox = String((req.query && req.query.sandbox) || (req.body && req.body.sandbox) || '').trim();
      if (!sandbox) { res.status(400).json({ error: 'sandbox is required' }); return; }

      // Must run before the generic GET list handler — otherwise download
      // requests return JSON and the browser saves a non-ZIP as .zip.
      //
      // Build the ZIP fully in memory before flipping any response headers
      // so any error during enumeration / per-file download surfaces as a
      // JSON 500 (rather than mid-stream truncation of an
      // application/zip response, which yields a file that macOS Archive
      // Utility refuses to open). Sending a single buffer with a real
      // Content-Length and Cache-Control: no-transform also stops Hosting
      // / intermediaries from re-framing the bytes.
      if (req.method === 'GET' && /\/download$/.test(path)) {
        const customer = String((req.query && req.query.customer) || 'library').trim();
        const safe = customer.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'library';
        const fileName = `logo_${safe}.zip`;
        const { buffer, entries, skipped } = await imageHostingLibrary.buildLibraryZipBuffer(sandbox);

        // Cloud Run gen2 caps a single response at 32 MiB. When the
        // assembled ZIP would exceed our safe inline threshold, upload
        // it to GCS and hand the browser a short-lived V4 signed URL
        // instead — the inline path used to silently fail with an
        // empty-bodied response (see Cloud Functions log line
        // "Response size was too large. Please consider reducing
        // response size.") which the UI surfaces as a bare
        // "Download failed:" with no detail.
        if (buffer.length > imageHostingLibrary.BACKUP_INLINE_MAX_BYTES) {
          const { storagePath, downloadUrl, expiresAt } =
            await imageHostingLibrary.uploadBackupZipAndSign(sandbox, buffer, fileName);
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'private, no-store, max-age=0, must-revalidate, no-transform');
          res.status(200).json({
            mode: 'redirect',
            reason: 'inline-size-limit',
            fileName,
            size: buffer.length,
            entries,
            skipped: skipped.length,
            downloadUrl,
            expiresAt,
            storagePath,
          });
          return;
        }

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Length', String(buffer.length));
        res.setHeader('Cache-Control', 'private, no-store, max-age=0, must-revalidate, no-transform');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        // Surface count + skipped-file count as response headers so the
        // client can sanity-check what came back without parsing the ZIP.
        res.setHeader('X-Library-Entries', String(entries));
        res.setHeader('X-Library-Skipped', String(skipped.length));
        res.status(200).end(buffer);
        return;
      }

      if (req.method === 'GET') {
        const items = await imageHostingLibrary.listLibrary(sandbox);
        res.status(200).json({ sandbox, items });
        return;
      }

      if (req.method === 'POST' && /\/publish$/.test(path)) {
        const body = (req.body && typeof req.body === 'object') ? req.body : {};
        if (body.replaceRelPath && body.confirmed !== true) {
          res.status(400).json({ error: 'confirmed:true is required to replace an existing library file' });
          return;
        }
        // scrapeId is optional — callers may publish directly from an
        // uploaded file or a URL with no backing scrape ('_manual'
        // sentinel from the UI, or just omitted entirely).
        const scrapeId = String(body.scrapeId || '').trim();
        const imageIndex = Number.isInteger(body.imageIndex) ? body.imageIndex : -1;

        // Optional: client-supplied bytes (base64). When the origin CDN
        // blocks our server's User-Agent (Flynas, etc.) the browser has
        // already fetched the image successfully for rendering — posting
        // those bytes through is the most reliable publish path.
        let clientBytes = null;
        let clientContentType = '';
        if (body.imageBase64 && typeof body.imageBase64 === 'string') {
          try { clientBytes = Buffer.from(body.imageBase64, 'base64'); }
          catch (_e) { clientBytes = null; }
          clientContentType = String(body.imageContentType || '');
        }

        let img = null;
        if (imageIndex >= 0 && scrapeId && scrapeId !== '_manual') {
          const record = await brandScrapeStore.getScrape(sandbox, scrapeId);
          if (record) {
            const imgs = (record.crawlSummary && record.crawlSummary.assets && record.crawlSummary.assets.imagesV2) || [];
            img = imgs[imageIndex] || null;
          }
        }

        // If we have neither server bytes nor client bytes, we can't publish.
        const haveServerBytes = !!(img && img.storagePath);
        const haveClientBytes = !!(clientBytes && clientBytes.length);
        const haveDirectUrl = !!(body.imageUrl || (img && img.src));
        if (!haveServerBytes && !haveClientBytes && !haveDirectUrl) {
          res.status(400).json({ error: 'no image bytes available — classify, send imageBase64, or imageUrl' });
          return;
        }

        const published = await imageHostingLibrary.publishScrapeImage(sandbox, {
          scrapeStoragePath: haveServerBytes ? img.storagePath : '',
          imageUrl: body.imageUrl || (img && img.src) || '',
          clientBytes,
          clientContentType,
          classification: (img && img.classification) || body.classification || {},
          srcName: (img && img.classification && img.classification.subject)
            || (img && img.alt)
            || body.srcName
            || '',
          overrideFolder: body.overrideFolder,
          overrideFile: body.overrideFile,
          replaceRelPath: body.replaceRelPath,
          confirmed: body.confirmed === true,
        });
        res.status(200).json({ sandbox, published });
        return;
      }

      if (req.method === 'POST' && /\/ai-publish$/.test(path)) {
        const body = (req.body && typeof req.body === 'object') ? req.body : {};
        const scrapeId = String(body.scrapeId || '').trim();
        const imageIndex = Number.isInteger(body.imageIndex) ? body.imageIndex : -1;

        // Reach into the scrape record so the prompt gets the real brand
        // context. Fall back to whatever the client provided (lets the
        // UI trigger AI generation even without a scrape binding).
        let img = null;
        let brandName = body.brandName || '';
        if (scrapeId && imageIndex >= 0) {
          const record = await brandScrapeStore.getScrape(sandbox, scrapeId);
          if (record) {
            brandName = brandName || record.brandName || '';
            const imgs = (record.crawlSummary && record.crawlSummary.assets && record.crawlSummary.assets.imagesV2) || [];
            img = imgs[imageIndex] || null;
          }
        }

        try {
          const published = await imageHostingLibrary.publishAiImage(sandbox, {
            classification: (img && img.classification) || body.classification || {},
            brandName,
            subject: (img && img.classification && img.classification.subject) || body.subject || '',
            alt: (img && img.alt) || body.alt || '',
            sourceUrl: (img && img.src) || body.imageUrl || '',
            overrideFolder: body.overrideFolder,
            overrideFile: body.overrideFile,
          });
          res.status(200).json({ sandbox, published });
        } catch (e) {
          console.error('[imageHostingLibrary.ai-publish]', String(e && e.message || e));
          res.status(502).json({ error: 'AI generation failed: ' + String((e && e.message) || e) });
        }
        return;
      }

      if (req.method === 'POST' && /\/replace$/.test(path)) {
        const body = (req.body && typeof req.body === 'object') ? req.body : {};
        const relPath = String(body.relPath || '').trim();
        if (!relPath) { res.status(400).json({ error: 'relPath is required' }); return; }
        if (!body.base64 || typeof body.base64 !== 'string') {
          res.status(400).json({ error: 'base64 is required' });
          return;
        }
        let bytes;
        try { bytes = Buffer.from(body.base64, 'base64'); }
        catch (_e) { res.status(400).json({ error: 'invalid base64' }); return; }
        const published = await imageHostingLibrary.replaceLibraryObject(
          sandbox, relPath, bytes, String(body.contentType || '')
        );
        res.status(200).json({ sandbox, published });
        return;
      }

      if (req.method === 'POST' && /\/upload$/.test(path)) {
        const body = (req.body && typeof req.body === 'object') ? req.body : {};
        const files = Array.isArray(body.files) ? body.files : [];
        if (!files.length) { res.status(400).json({ error: 'files[] is required' }); return; }
        // onConflict: 'error' | 'replace' | 'version'. Honoured for
        // keep-filename uploads (auto-classifier path always
        // auto-suffixes — see resolveTargetName for the rationale).
        const onConflictRaw = String(body.onConflict || '').toLowerCase();
        const onConflict = (onConflictRaw === 'replace' || onConflictRaw === 'version' || onConflictRaw === 'error')
          ? onConflictRaw
          : undefined; // let uploadSingleFile pick the right default
        const result = await imageHostingLibrary.batchUpload(sandbox, files, {
          replace: !!body.replace,
          keepFilename: !!body.keepFilename,
          convertToPng: body.convertToPng !== undefined ? !!body.convertToPng : true,
          onConflict,
        });
        // Conflicts are NOT errors — they're a state the UI needs to
        // resolve via a prompt. Use 200 so the client can surface the
        // conflicts list and re-submit per-file with the chosen mode.
        // (Errors and uploaded items are also still returned.)
        res.status(200).json({ sandbox, ...result });
        return;
      }

      if (req.method === 'POST' && /\/restore$/.test(path)) {
        // Log body shape on entry so empty/oversized requests are
        // diagnosable from Cloud Logging without having to repro.
        const body = (req.body && typeof req.body === 'object') ? req.body : {};
        const b64Len = (body.zipBase64 && typeof body.zipBase64 === 'string') ? body.zipBase64.length : 0;
        console.log('[imageHostingLibrary.restore] enter', {
          sandbox, replace: body.replace !== false,
          base64Length: b64Len,
          approxZipBytes: Math.floor(b64Len * 3 / 4),
          contentLength: req.headers && req.headers['content-length'] ? req.headers['content-length'] : null,
        });
        if (!body.zipBase64 || typeof body.zipBase64 !== 'string') {
          res.status(400).json({ error: 'zipBase64 is required (got an empty or non-string body — did the JSON exceed the body parser limit?)' });
          return;
        }
        let zipBytes;
        try { zipBytes = Buffer.from(body.zipBase64, 'base64'); }
        catch (e) {
          console.error('[imageHostingLibrary.restore] base64 decode failed', String((e && e.message) || e));
          res.status(400).json({ error: 'invalid base64: ' + String((e && e.message) || e) });
          return;
        }
        // ZIP magic is 'PK\x03\x04' (0x504B0304). Reject non-ZIP early
        // with a clear message rather than letting unzipper throw a
        // cryptic "FILE_ENDED" or similar deep in the parser.
        if (zipBytes.length < 4 || zipBytes[0] !== 0x50 || zipBytes[1] !== 0x4B) {
          console.error('[imageHostingLibrary.restore] not a ZIP', { firstBytes: Array.from(zipBytes.slice(0, 8)), totalBytes: zipBytes.length });
          res.status(400).json({ error: 'uploaded file is not a valid ZIP (missing PK signature). First bytes: ' + Array.from(zipBytes.slice(0, 4)).map((b) => b.toString(16).padStart(2, '0')).join(' ') });
          return;
        }
        const replace = body.replace !== false; // default to replacing
        let out;
        try {
          out = await imageHostingLibrary.restoreLibraryFromZip(sandbox, zipBytes, { replace });
        } catch (e) {
          // Bubble up with full error context — the caller's generic
          // 500 catch a few lines down only emits e.message which can
          // be cryptic for unzipper / GCS errors. Surface stack trace
          // to Cloud Logging and a clean error message to the client.
          console.error('[imageHostingLibrary.restore] restoreLibraryFromZip failed', {
            sandbox, replace,
            zipBytes: zipBytes.length,
            errorName: e && e.name,
            errorMessage: e && e.message,
            errorCode: e && e.code,
            errorStack: e && e.stack,
          });
          res.status(500).json({
            error: 'restore failed: ' + (e && e.name ? e.name + ' — ' : '') + String((e && e.message) || e),
            stage: 'restoreLibraryFromZip',
            zipBytes: zipBytes.length,
          });
          return;
        }
        console.log('[imageHostingLibrary.restore] success', { sandbox, restored: out.length, replace });
        res.status(200).json({ sandbox, restored: out.length, items: out, replace });
        return;
      }

      if (req.method === 'POST' && /\/rename$/.test(path)) {
        const body = (req.body && typeof req.body === 'object') ? req.body : {};
        if (!body.relPath || !body.newRelPath) {
          res.status(400).json({ error: 'relPath + newRelPath required' });
          return;
        }
        const onConflictRaw = String(body.onConflict || '').toLowerCase();
        const onConflict = (onConflictRaw === 'replace' || onConflictRaw === 'version')
          ? onConflictRaw : 'error';
        try {
          const out = await imageHostingLibrary.renameLibraryObject(
            sandbox, body.relPath, body.newRelPath, { onConflict }
          );
          res.status(200).json({ sandbox, ...out });
        } catch (e) {
          // Surface "target already exists" as a structured 409 with
          // the suggested versioned name so the UI can prompt the user
          // to Replace / Save as <name>-1 / Cancel without a second
          // round-trip to discover the next free slot.
          if (e && e.code === 'TARGET_EXISTS') {
            res.status(409).json({
              error: e.message,
              code: 'TARGET_EXISTS',
              conflictingRelPath: e.conflictingRelPath,
              suggestedVersionRelPath: e.suggestedVersionRelPath,
            });
            return;
          }
          throw e;
        }
        return;
      }

      if (req.method === 'POST' && /\/folder$/.test(path)) {
        const body = (req.body && typeof req.body === 'object') ? req.body : {};
        const folder = String(body.folder || '').trim();
        if (!folder) {
          res.status(400).json({ error: 'folder is required (e.g. campaign-2025 or logos/primary)' });
          return;
        }
        const out = await imageHostingLibrary.createLibraryFolder(sandbox, folder);
        res.status(200).json({ sandbox, ...out });
        return;
      }

      if (req.method === 'DELETE') {
        const relPath = String((req.query && req.query.relPath) || '').trim();
        if (!relPath) { res.status(400).json({ error: 'relPath is required' }); return; }
        const out = await imageHostingLibrary.deleteLibraryObject(sandbox, relPath);
        res.status(200).json({ sandbox, ...out });
        return;
      }

      res.status(405).json({ error: 'Method not allowed' });
    } catch (e) {
      console.error('[imageHostingLibrary]', String(e && e.message || e));
      res.status(500).json({ error: String((e && e.message) || e) });
    }
  }
);

/**
 * Public CDN proxy — streams bytes from the library bucket at
 * gs://<bucket>/<sandbox>/library/<relPath>. Publicly readable; the
 * bucket stores only curated images promoted from brand scrapes.
 */
exports.imageHostingAsset = onRequest(
  {
    region: REGION,
    invoker: 'public',
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (req, res) => {
    setCors(res, 'GET, HEAD, OPTIONS');
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.status(405).send('GET only'); return;
    }
    try {
      const reqPath = String(req.path || '');
      if (/^\/profile-viewer\/[^/]+-demo(?:\.html|-assets\/)/i.test(reqPath)
        || reqPath === '/profile-viewer/brand-scraper-demo-nav.json') {
        await brandScraperDemoHost.handleProfileViewerDemoRequest(req, res);
        return;
      }
      if (/^\/demos\/[^/]+\/web(?:\/|$)/i.test(reqPath)) {
        await brandScraperDemoHost.handleDemoHostRequest(req, res);
        return;
      }
      // Hosting rewrites /cdn/** to this function, so req.path is the
      // full /cdn/<sandbox>/<relPath...> the client requested.
      const p = reqPath.replace(/^\/cdn\//, '');
      const parts = p.split('/').filter(Boolean);
      if (parts.length < 2) { res.status(400).send('bad path'); return; }
      const sandbox = parts.shift();
      const relPath = parts.join('/');
      if (!sandbox || !relPath) { res.status(400).send('bad path'); return; }
      const { file } = imageHostingLibrary.resolveAsset(sandbox, relPath);
      const [exists] = await file.exists();
      if (!exists) { res.status(404).send('not found'); return; }
      const [md] = await file.getMetadata().catch(() => [null]);
      const ct = (md && md.contentType) || 'application/octet-stream';
      res.setHeader('Content-Type', ct);
      // Library URLs are stable across replace — never `immutable` or
      // clients keep old pixels until hard-refresh. ETag enables 304.
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
      if (md && md.size) res.setHeader('Content-Length', String(md.size));
      if (md && md.etag) res.setHeader('ETag', md.etag);
      if (req.method === 'HEAD') { res.status(200).end(); return; }
      file.createReadStream().on('error', (e) => {
        console.error('[imageHostingAsset] stream', String(e && e.message || e));
        if (!res.headersSent) res.status(500).send('read error');
      }).pipe(res);
    } catch (e) {
      console.error('[imageHostingAsset]', String(e && e.message || e));
      if (!res.headersSent) res.status(500).send('internal error');
    }
  }
);

/**
 * Claude skills lab catalog API (shared Storage + Firestore + Vertex AI).
 *   POST   /api/claude-skills/upload    { fileName, contentBase64, skillId?, contentType? } — .zip extracted server-side
 *   POST   /api/claude-skills/analyze   { skillId, storagePath? } | { text, fileName }
 *   GET    /api/claude-skills/catalog   list published tiles
 *   POST   /api/claude-skills/publish   publish metadata + skillId
 *   DELETE /api/claude-skills/catalog?id=…
 */
const CLAUDE_SKILLS_FN_ENV = {
  CLAUDE_SKILLS_BUCKET: process.env.CLAUDE_SKILLS_BUCKET || 'aep-orchestration-lab-brand-scrapes',
};

function sendClaudeSkillsJson(res, status, payload) {
  if (res.headersSent) return;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(status).json(payload);
}

exports.claudeSkillsApi = onRequest(
  {
    region: REGION,
    invoker: 'public',
    timeoutSeconds: 120,
    memory: '512MiB',
    environmentVariables: CLAUDE_SKILLS_FN_ENV,
  },
  async (req, res) => {
    setCors(res, 'GET, POST, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    const path = String(req.path || req.url || '')
      .replace(/^\/api\/claude-skills\/?/, '')
      .split('?')[0]
      .replace(/\/+$/, '');
    const clientKey = String(
      (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
      || req.ip
      || 'anonymous',
    );
    try {
      if (req.method === 'POST' && path === 'upload') {
        const body = (req.body && typeof req.body === 'object') ? req.body : {};
        if (!String(body.contentBase64 || body.fileBase64 || '').trim()) {
          sendClaudeSkillsJson(res, 413, {
            ok: false,
            code: 'PAYLOAD_TOO_LARGE',
            error: 'Request body missing or too large for upload (max ~20 MB skill file before base64 encoding). Upload SKILL.md or a smaller ZIP without large binaries.',
          });
          return;
        }
        const out = await claudeSkillsService.uploadSkillFile(body);
        sendClaudeSkillsJson(res, 200, out);
        return;
      }
      if (req.method === 'POST' && path === 'analyze') {
        const body = (req.body && typeof req.body === 'object') ? req.body : {};
        const out = await claudeSkillsService.analyzeSkill(body, clientKey);
        sendClaudeSkillsJson(res, 200, out);
        return;
      }
      if (req.method === 'POST' && path === 'publish') {
        const body = (req.body && typeof req.body === 'object') ? req.body : {};
        const out = await claudeSkillsService.publishSkill(body);
        sendClaudeSkillsJson(res, 200, out);
        return;
      }
      if (req.method === 'GET' && (path === '' || path === 'catalog')) {
        const out = await claudeSkillsService.listCatalog();
        sendClaudeSkillsJson(res, 200, out);
        return;
      }
      if (req.method === 'DELETE' && (path === 'catalog' || path === '')) {
        const id = String((req.query && req.query.id) || '').trim();
        const out = await claudeSkillsService.deleteSkill(id);
        sendClaudeSkillsJson(res, 200, out);
        return;
      }
      sendClaudeSkillsJson(res, 404, { ok: false, error: 'Not found' });
    } catch (e) {
      const status = e.status || (e.code === 'RATE_LIMITED' ? 429 : 500);
      console.error('[claudeSkillsApi]', path || '(unknown)', String(e && e.message || e), e && e.stack ? `\n${e.stack}` : '');
      sendClaudeSkillsJson(res, status, {
        ok: false,
        error: String(e.message || e),
        code: e.code || undefined,
        step: path || undefined,
      });
    }
  },
);

/**
 * Public skill file proxy — streams bytes from the skills bucket at
 * gs://<bucket>/claude-skills/{skillId}/{file}
 */
exports.claudeSkillsAsset = onRequest(
  {
    region: REGION,
    invoker: 'public',
    timeoutSeconds: 30,
    memory: '256MiB',
    environmentVariables: CLAUDE_SKILLS_FN_ENV,
  },
  async (req, res) => {
    setCors(res, 'GET, OPTIONS');
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.status(405).send('GET only'); return;
    }
    try {
      const { file } = claudeSkillsService.resolveAsset(req.path);
      const [exists] = await file.exists();
      if (!exists) { res.status(404).send('not found'); return; }
      const [md] = await file.getMetadata().catch(() => [null]);
      const ct = (md && md.contentType) || 'text/plain; charset=utf-8';
      res.setHeader('Content-Type', ct);
      res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
      if (md && md.size) res.setHeader('Content-Length', String(md.size));
      if (md && md.etag) res.setHeader('ETag', md.etag);
      if (req.method === 'HEAD') { res.status(200).end(); return; }
      file.createReadStream().on('error', (err) => {
        console.error('[claudeSkillsAsset] stream', String(err && err.message || err));
        if (!res.headersSent) res.status(500).send('read error');
      }).pipe(res);
    } catch (e) {
      const status = e.status || 500;
      console.error('[claudeSkillsAsset]', String(e && e.message || e));
      if (!res.headersSent) res.status(status).send(status === 400 ? 'bad path' : 'internal error');
    }
  },
);


Object.assign(
  exports,
  registerSnowflakeRoutes({
    onRequest,
    SNOWFLAKE_FN_OPTS,
    SNOWFLAKE_AGENTIC_FN_OPTS,
    setCors,
    resolveSandboxFromQuery,
    snowflakePrincipalAuth,
    labWorkspaceAuthService,
    mcpApiKeyStore,
    labUserSandboxStore,
    snowflakeConnectionStore: require('./snowflakeConnectionStore'),
    snowflakeService,
    snowflakeDataGeneratorService,
    snowflakeAgenticTravelService,
    snowflakeIndustryCatalogService,
    snowflakeProvisionService,
    snowflakeIndustryEventService,
  })
);


/**
 * Sandbox-only public API gateway (Option 3): Hosting → this function → private Gen2
 * backends via hosting-invoker ID token. Wired in firebase.sandbox.json only.
 */
if (REGION === SANDBOX_FUNCTIONS_REGION) {
  const { createHandler: createSandboxApiGatewayHandler } = require('./sandboxApiGateway');
  exports.sandboxApiGateway = onRequest(
    {
      region: SANDBOX_FUNCTIONS_REGION,
      invoker: 'public',
      serviceAccount: SC_DEMO_SANDBOX_HOSTING_INVOKER_SA,
      timeoutSeconds: 300,
      memory: '512MiB',
    },
    createSandboxApiGatewayHandler(),
  );
}
