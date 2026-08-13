/**
 * Governed per-user demo configuration over Firebase Realtime Database.
 *
 * Callers must resolve and verify the workspace owner before invoking this
 * service. Only allowlisted scalar fields under ajoLookups/{workspaceSlug}
 * can be changed. Preflights and revisions are stored in Firestore.
 */
const { createHash, randomUUID } = require('node:crypto');
const admin = require('firebase-admin');

const PREFLIGHT_COLLECTION = 'labDemoConfigPreflights';
const REVISION_COLLECTION = 'labDemoConfigRevisions';
const IDEMPOTENCY_COLLECTION = 'labDemoConfigIdempotency';
const PREFLIGHT_TTL_MS = 15 * 60 * 1000;
const MAX_CHANGES = 50;

const SECTION_INFO = {
  CoreDemoData: { category: 'Brand', description: 'Shared customer name, URL, logo, slogan and short name.' },
  StaffPortal: { category: 'Brand', description: 'Agent identity, location and presentation colours.' },
  CallCentre: { category: 'Scenario', description: 'Contact-centre industry selection.' },
  TravelData: { category: 'Scenario', description: 'Flight, route, gate and disruption details.' },
  Mobile: { category: 'Scenario', description: 'Mobile and iPad copy, staff and gate details.' },
  CustomerLoyalty: { category: 'Scenario', description: 'Loyalty tier, number, miles and points.' },
  Retail: { category: 'Scenario', description: 'Retail product and basket display values.' },
  CouponData: { category: 'Messaging', description: 'Coupon message subjects and body copy.' },
  Web: { category: 'Messaging', description: 'Web registration messaging.' },
  Whatsapp: { category: 'Messaging', description: 'WhatsApp imagery.' },
  webForm: { category: 'Messaging', description: 'Form-submit and form-abandon messages.' },
  ExpAccelerator: { category: 'Experimentation', description: 'Experimentation customer and industry overrides.' },
  ExpVisualiser: { category: 'Experimentation', description: 'Treatment and email preview image URLs.' },
  AgenticLayer: { category: 'Advanced', description: 'Agent endpoints; visible but not MCP-editable.' },
  ContentDecisionLive: { category: 'Advanced', description: 'Decisioning infrastructure; visible but not MCP-editable.' },
  meta: { category: 'Protected', description: 'Workspace ownership metadata; never MCP-editable.' },
};

function stringField(maxLength = 500) {
  return { type: 'string', maxLength };
}

function urlField() {
  return { type: 'url', maxLength: 2048 };
}

function addFields(target, section, fields, spec) {
  fields.forEach((field) => {
    target[`${section}.${field}`] = { ...spec };
  });
}

const FIELD_CATALOG = {};
addFields(FIELD_CATALOG, 'CoreDemoData', ['name', 'shortName', 'slogan'], stringField(240));
addFields(FIELD_CATALOG, 'CoreDemoData', ['url', 'customerLogo'], urlField());
addFields(
  FIELD_CATALOG,
  'StaffPortal',
  ['AgentName', 'AgentID', 'AgentType', 'LocationLabel', 'CaptainName', 'CoPilotName'],
  stringField(240),
);
FIELD_CATALOG['StaffPortal.Colour'] = { type: 'color' };
FIELD_CATALOG['StaffPortal.TextColourCallCentre'] = { type: 'color' };
FIELD_CATALOG['StaffPortal.TextColourIpad'] = { type: 'color' };
FIELD_CATALOG['CallCentre.industryId'] = {
  type: 'enum',
  values: ['generic', 'travel', 'fsi', 'retail', 'telecom', 'media', 'sports', 'public'],
};
addFields(
  FIELD_CATALOG,
  'TravelData',
  [
    'CheckedIn', 'FlightClass', 'Gate', 'Zone', 'ancillaryProductPurchased',
    'flightArrivalAirportCode', 'flightArrivalCountry', 'flightDate',
    'flightDepartureAirportCode', 'flightDepartureCountry', 'flightDisruptionDelayTime',
    'flightNumber', 'flightStatus', 'gate', 'route', 'origin', 'destination',
    'departure', 'departureIso',
  ],
  stringField(500),
);
addFields(
  FIELD_CATALOG,
  'Mobile',
  [
    'EntryImageUrl', 'EntryUpsellImageUrl', 'ExitImageUrl', 'LocationEntryText',
    'LocationEntryUpsellText', 'LocationExitEmailSubject', 'LocationExitText',
    'StaffName', 'StaffId', 'StaffRole', 'Terminal', 'Gate', 'paxOnBoard',
    'appLaunchText', 'appLoginText',
  ],
  stringField(2000),
);
addFields(
  FIELD_CATALOG,
  'CustomerLoyalty',
  ['LoyaltyLevel', 'LoyaltyNumber', 'PointsBalance', 'tier', 'miles', 'balance'],
  stringField(240),
);
addFields(FIELD_CATALOG, 'Retail', ['Description', 'Item', 'ItemURL', 'Price', 'Quantity'], stringField(1000));
addFields(
  FIELD_CATALOG,
  'CouponData',
  ['CouponSendBody', 'CouponSendSubject', 'CouponUseBody', 'CouponUseSubject'],
  stringField(4000),
);
FIELD_CATALOG['Web.WebRegistrationSubject'] = stringField(500);
FIELD_CATALOG['Whatsapp.ImageURL'] = urlField();
addFields(
  FIELD_CATALOG,
  'webForm',
  [
    'formAbandon-emailSubject', 'formAbandon-pushBody', 'formAbandon-pushTitle',
    'formAbandon-smsBody', 'formSubmit-emailSubject', 'formSubmit-pushBody',
    'formSubmit-pushTitle', 'formSubmit-smsBody',
  ],
  stringField(4000),
);
FIELD_CATALOG['ExpAccelerator.displayNameOverride'] = stringField(240);
FIELD_CATALOG['ExpAccelerator.opportunityIndustry'] = stringField(120);
FIELD_CATALOG['ExpAccelerator.useIndustrySamplePack'] = { type: 'boolean' };
addFields(
  FIELD_CATALOG,
  'ExpVisualiser',
  ['emailA', 'emailB', 'treatmentA', 'treatmentB', 'treatmentC'],
  urlField(),
);

const RECOMMENDED_PATHS = [
  'CoreDemoData.name',
  'CoreDemoData.shortName',
  'CoreDemoData.url',
  'CoreDemoData.customerLogo',
  'StaffPortal.Colour',
  'CallCentre.industryId',
  'ExpAccelerator.displayNameOverride',
  'ExpAccelerator.opportunityIndustry',
];

class DemoConfigError extends Error {
  constructor(message, status = 400, code = 'DEMO_CONFIG_INVALID') {
    super(message);
    this.name = 'DemoConfigError';
    this.status = status;
    this.code = code;
  }
}

function getRtdb() {
  if (!admin.apps.length) admin.initializeApp();
  return admin.database();
}

function getFirestore() {
  if (!admin.apps.length) admin.initializeApp();
  return admin.firestore();
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((out, key) => {
      out[key] = stableValue(value[key]);
      return out;
    }, {});
  }
  return value;
}

function hashValue(value) {
  return createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex');
}

function getPath(root, path) {
  const [section, field] = String(path || '').split('.');
  if (!section || !field) return undefined;
  const sectionValue = root && typeof root[section] === 'object' ? root[section] : {};
  return Object.prototype.hasOwnProperty.call(sectionValue || {}, field) ? sectionValue[field] : null;
}

function summarizeValue(value, protectedField = false) {
  if (protectedField) return '[REDACTED]';
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return { type: 'array', count: value.length };
  if (value && typeof value === 'object') {
    return { type: 'object', keys: Object.keys(value).sort().slice(0, 100) };
  }
  if (typeof value === 'string' && value.length > 1000) return `${value.slice(0, 1000)}…`;
  return value;
}

function normalizeValue(path, value, { allowNull = false } = {}) {
  const spec = FIELD_CATALOG[path];
  if (!spec) throw new DemoConfigError(`Path is not MCP-editable: ${path}`, 400, 'DEMO_CONFIG_PATH_NOT_ALLOWED');
  if (value === null && allowNull) return null;
  if (value === null || value === undefined || typeof value === 'object') {
    throw new DemoConfigError(`Path ${path} requires a scalar value.`, 400, 'DEMO_CONFIG_VALUE_INVALID');
  }

  if (spec.type === 'boolean') {
    if (typeof value !== 'boolean') {
      throw new DemoConfigError(`Path ${path} requires a boolean.`, 400, 'DEMO_CONFIG_VALUE_INVALID');
    }
    return value;
  }

  const text = String(value).trim();
  if (spec.maxLength && text.length > spec.maxLength) {
    throw new DemoConfigError(`Path ${path} exceeds ${spec.maxLength} characters.`, 400, 'DEMO_CONFIG_VALUE_TOO_LONG');
  }
  if (spec.type === 'url' && text && !/^https?:\/\/[^\s]+$/i.test(text)) {
    throw new DemoConfigError(`Path ${path} requires an http(s) URL.`, 400, 'DEMO_CONFIG_URL_INVALID');
  }
  if (spec.type === 'color' && text && !/^#[0-9a-f]{6}$/i.test(text)) {
    throw new DemoConfigError(`Path ${path} requires a six-digit hex colour such as #1473e6.`, 400, 'DEMO_CONFIG_COLOR_INVALID');
  }
  if (spec.type === 'enum' && !spec.values.includes(text.toLowerCase())) {
    throw new DemoConfigError(`Path ${path} must be one of: ${spec.values.join(', ')}.`, 400, 'DEMO_CONFIG_ENUM_INVALID');
  }
  return spec.type === 'enum' ? text.toLowerCase() : text;
}

function normalizeChanges(changes, opts = {}) {
  if (!Array.isArray(changes) || !changes.length) {
    throw new DemoConfigError('changes must contain at least one path/value pair.');
  }
  if (changes.length > MAX_CHANGES) {
    throw new DemoConfigError(`A maximum of ${MAX_CHANGES} changes is allowed per preview.`);
  }
  const seen = new Set();
  return changes.map((change) => {
    const path = String(change && change.path || '').trim();
    if (!path || path.split('.').length !== 2) {
      throw new DemoConfigError(`Invalid demo configuration path: ${path || '(empty)'}`);
    }
    if (seen.has(path)) throw new DemoConfigError(`Duplicate change path: ${path}`);
    seen.add(path);
    return { path, value: normalizeValue(path, change.value, opts) };
  });
}

function buildDiff(root, normalizedChanges) {
  return normalizedChanges.map((change) => {
    const before = getPath(root, change.path);
    return {
      path: change.path,
      before: before === undefined ? null : before,
      after: change.value,
      changed: JSON.stringify(before === undefined ? null : before) !== JSON.stringify(change.value),
    };
  }).filter((item) => item.changed);
}

function valuesForPaths(root, paths) {
  return paths.map((path) => ({ path, value: getPath(root, path) ?? null }));
}

function buildInspection(root, workspaceSlug, sandbox) {
  const data = root && typeof root === 'object' ? root : {};
  const sectionNames = new Set([...Object.keys(data), ...Object.keys(SECTION_INFO)]);
  const sections = [...sectionNames].sort().map((section) => {
    const sectionData = data[section] && typeof data[section] === 'object' && !Array.isArray(data[section])
      ? data[section]
      : {};
    const catalogKeys = Object.keys(FIELD_CATALOG)
      .filter((path) => path.startsWith(`${section}.`))
      .map((path) => path.slice(section.length + 1));
    const fieldNames = new Set([...Object.keys(sectionData), ...catalogKeys]);
    const fields = [...fieldNames].sort().map((field) => {
      const path = `${section}.${field}`;
      const spec = FIELD_CATALOG[path] || null;
      return {
        path,
        field,
        editable: Boolean(spec),
        value: summarizeValue(sectionData[field], section === 'meta' && field === 'adobeEmail'),
        validation: spec || undefined,
      };
    });
    const info = SECTION_INFO[section] || {
      category: 'Discovered',
      description: 'Existing workspace section; visible but not MCP-editable until catalogued.',
    };
    return {
      name: section,
      ...info,
      editable: fields.some((field) => field.editable),
      fields,
    };
  });

  return {
    ok: true,
    sandbox,
    workspaceSlug,
    storagePath: `ajoLookups/${workspaceSlug}`,
    sections,
    recommendedFields: RECOMMENDED_PATHS.map((path) => ({
      path,
      currentValue: summarizeValue(getPath(data, path)),
      validation: FIELD_CATALOG[path],
    })),
    guidance: [
      'Inspect before previewing or applying changes.',
      'Use lab_demo_config_preview for a before/after diff.',
      'Apply only with the returned preflight_id and explicit confirmation.',
      'Protected and uncatalogued fields are read-only through MCP.',
    ],
  };
}

async function readWorkspace(workspaceSlug, deps = {}) {
  const database = deps.database || getRtdb();
  const snap = await database.ref(`ajoLookups/${workspaceSlug}`).once('value');
  return snap.val() || {};
}

async function inspect({ workspaceSlug, sandbox }, deps = {}) {
  return buildInspection(await readWorkspace(workspaceSlug, deps), workspaceSlug, sandbox);
}

async function createPreview({ uid, workspaceSlug, sandbox, changes, source = 'manual', allowNull = false }, deps = {}) {
  const firestore = deps.firestore || getFirestore();
  const now = deps.now ? deps.now() : new Date();
  const root = await readWorkspace(workspaceSlug, deps);
  const normalized = normalizeChanges(changes, { allowNull });
  const diff = buildDiff(root, normalized);
  if (!diff.length) throw new DemoConfigError('The proposed values already match the current demo configuration.', 409, 'DEMO_CONFIG_NO_CHANGES');
  const paths = diff.map((item) => item.path);
  const beforeHash = hashValue(valuesForPaths(root, paths));
  const id = deps.randomId ? deps.randomId() : randomUUID();
  const expiresAt = new Date(now.getTime() + PREFLIGHT_TTL_MS).toISOString();
  const doc = {
    uid,
    workspaceSlug,
    sandbox,
    source: String(source || 'manual').slice(0, 120),
    status: 'pending',
    diff,
    paths,
    beforeHash,
    createdAt: now.toISOString(),
    expiresAt,
  };
  await firestore.collection(PREFLIGHT_COLLECTION).doc(id).set(doc);
  return {
    ok: true,
    sandbox,
    workspaceSlug,
    preflightId: id,
    expiresAt,
    source: doc.source,
    diff,
    confirmationRequired: true,
    nextStep: 'Review this diff, then call lab_demo_config_apply with confirmed=true.',
  };
}

function validateIdempotencyKey(value) {
  const key = String(value || '').trim();
  if (key.length < 8 || key.length > 128 || !/^[a-zA-Z0-9._:-]+$/.test(key)) {
    throw new DemoConfigError('idempotency_key must be 8–128 characters using letters, numbers, dot, underscore, colon or hyphen.');
  }
  return key;
}

async function applyPreview({ uid, workspaceSlug, sandbox, preflightId, confirmed, idempotencyKey }, deps = {}) {
  if (confirmed !== true) {
    throw new DemoConfigError('confirmed=true is required to apply demo configuration changes.', 400, 'DEMO_CONFIG_CONFIRMATION_REQUIRED');
  }
  const key = validateIdempotencyKey(idempotencyKey);
  const firestore = deps.firestore || getFirestore();
  const database = deps.database || getRtdb();
  const now = deps.now ? deps.now() : new Date();
  const idempotencyId = hashValue({ uid, sandbox, key });
  const existingIdempotency = await firestore.collection(IDEMPOTENCY_COLLECTION).doc(idempotencyId).get();
  if (existingIdempotency.exists) {
    const prior = existingIdempotency.data() || {};
    if (prior.preflightId !== String(preflightId || '').trim()) {
      throw new DemoConfigError(
        'idempotency_key was already used for a different preview.',
        409,
        'DEMO_CONFIG_IDEMPOTENCY_CONFLICT',
      );
    }
    return { ...prior, idempotentReplay: true };
  }

  const ref = firestore.collection(PREFLIGHT_COLLECTION).doc(String(preflightId || '').trim());
  const snap = await ref.get();
  if (!snap.exists) throw new DemoConfigError('Unknown preflight_id.', 404, 'DEMO_CONFIG_PREFLIGHT_NOT_FOUND');
  const preflight = snap.data() || {};
  if (preflight.uid !== uid || preflight.workspaceSlug !== workspaceSlug || preflight.sandbox !== sandbox) {
    throw new DemoConfigError('Preflight does not belong to this user and sandbox.', 403, 'DEMO_CONFIG_PREFLIGHT_FORBIDDEN');
  }
  if (preflight.status === 'applied' && preflight.result) {
    return { ...preflight.result, idempotentReplay: true };
  }
  if (Date.parse(preflight.expiresAt || '') <= now.getTime()) {
    throw new DemoConfigError('Preflight has expired; inspect and preview again.', 409, 'DEMO_CONFIG_PREFLIGHT_EXPIRED');
  }

  const root = await readWorkspace(workspaceSlug, { ...deps, database });
  const currentHash = hashValue(valuesForPaths(root, preflight.paths || []));
  if (currentHash !== preflight.beforeHash) {
    throw new DemoConfigError('Demo configuration changed after preview; inspect and preview again.', 409, 'DEMO_CONFIG_PREVIEW_CONFLICT');
  }

  const update = {};
  const beforeChanges = [];
  const afterChanges = [];
  for (const item of preflight.diff || []) {
    const normalized = normalizeValue(item.path, item.after, { allowNull: true });
    const slashPath = item.path.replace('.', '/');
    update[slashPath] = normalized;
    beforeChanges.push({ path: item.path, value: item.before ?? null });
    afterChanges.push({ path: item.path, value: normalized });
  }
  await database.ref(`ajoLookups/${workspaceSlug}`).update(update);

  const verifiedRoot = await readWorkspace(workspaceSlug, { ...deps, database });
  const verified = afterChanges.every((item) => JSON.stringify(getPath(verifiedRoot, item.path) ?? null) === JSON.stringify(item.value));
  if (!verified) throw new DemoConfigError('RTDB readback did not match the applied values.', 500, 'DEMO_CONFIG_VERIFY_FAILED');

  const revisionRef = firestore.collection(REVISION_COLLECTION).doc();
  const revision = {
    uid,
    workspaceSlug,
    sandbox,
    source: preflight.source || 'manual',
    preflightId: ref.id,
    beforeChanges,
    afterChanges,
    createdAt: now.toISOString(),
  };
  await revisionRef.set(revision);

  const result = {
    ok: true,
    sandbox,
    workspaceSlug,
    storagePath: `ajoLookups/${workspaceSlug}`,
    preflightId: ref.id,
    revisionId: revisionRef.id,
    appliedAt: now.toISOString(),
    verified: true,
    changes: afterChanges,
    nextStep: 'Call lab_demo_config_inspect to show the verified current structure, or lab_demo_config_restore to roll back this revision.',
  };
  await ref.set({ status: 'applied', appliedAt: now.toISOString(), result }, { merge: true });
  await firestore.collection(IDEMPOTENCY_COLLECTION).doc(idempotencyId).set(result);
  return result;
}

async function createRestorePreview({ uid, workspaceSlug, sandbox, revisionId }, deps = {}) {
  const firestore = deps.firestore || getFirestore();
  const snap = await firestore.collection(REVISION_COLLECTION).doc(String(revisionId || '').trim()).get();
  if (!snap.exists) throw new DemoConfigError('Unknown revision_id.', 404, 'DEMO_CONFIG_REVISION_NOT_FOUND');
  const revision = snap.data() || {};
  if (revision.uid !== uid || revision.workspaceSlug !== workspaceSlug || revision.sandbox !== sandbox) {
    throw new DemoConfigError('Revision does not belong to this user and sandbox.', 403, 'DEMO_CONFIG_REVISION_FORBIDDEN');
  }
  return createPreview({
    uid,
    workspaceSlug,
    sandbox,
    changes: revision.beforeChanges || [],
    source: `restore:${snap.id}`,
    allowNull: true,
  }, deps);
}

module.exports = {
  PREFLIGHT_COLLECTION,
  REVISION_COLLECTION,
  IDEMPOTENCY_COLLECTION,
  PREFLIGHT_TTL_MS,
  FIELD_CATALOG,
  SECTION_INFO,
  RECOMMENDED_PATHS,
  DemoConfigError,
  normalizeValue,
  normalizeChanges,
  buildDiff,
  buildInspection,
  createPreview,
  applyPreview,
  createRestorePreview,
  inspect,
};
