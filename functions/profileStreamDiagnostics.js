'use strict';

const { createHash } = require('node:crypto');

const INDUSTRIES = Object.freeze(['generic', 'travel', 'fsi', 'retail', 'media', 'sports', 'telecom']);
const TENANT_GROUPS = Object.freeze({
  generic: ['identification.core', 'individualCharacteristics.core', 'scoring.core', 'preferences', 'profilePlaceContext'],
  travel: ['travelReservations', 'hotel'],
  fsi: ['industryFsi'],
  retail: ['individualCharacteristics.retail', 'scoring.retail'],
  media: ['industryMedia'],
  sports: ['industrySports'],
  telecom: ['industryTelecom'],
});
const FSI_LEAVES = Object.freeze([
  'primaryBankingChannel', 'creditScoreBand', 'lifeStage', 'employment', 'householdIncomeBand',
  ...['checking', 'savings', 'creditCard', 'mortgage', 'investment', 'loan'].map((key) => `financialProducts.${key}`),
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_ID = /^[0-9a-f]{24,64}$/i;
const SCHEMA_ID = /^https:\/\/ns\.adobe\.com\/[a-z][a-z0-9_]{0,63}\/schemas\/[0-9a-f-]{24,64}$/i;
const SCHEMA_CONTENT_TYPE = 'application/vnd.adobe.xed-full+json;version=1.0';

function safeId(value) {
  return typeof value === 'string' && value === value.trim() && (UUID.test(value) || HEX_ID.test(value)) ? value : null;
}

function safeSchemaId(value) {
  return typeof value === 'string' && value === value.trim() && SCHEMA_ID.test(value) ? value : null;
}

function safeIndustry(value) {
  return INDUSTRIES.includes(value) ? value : 'unknown';
}

function at(object, path) {
  return path.split('.').reduce((value, key) =>
    value && typeof value === 'object' && Object.hasOwn(value, key) ? value[key] : undefined, object);
}

function typeOf(value) {
  if (value === undefined) return 'absent';
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function structure(value) {
  const result = { present: value !== undefined, type: typeOf(value), leafCount: 0, truncated: false };
  let visited = 0;
  function visit(node, depth) {
    if (++visited > 10000 || depth > 16) {
      result.truncated = true;
      return;
    }
    if (node !== null && typeof node === 'object') {
      for (const child of Object.values(node)) {
        visit(child, depth + 1);
        if (result.truncated) break;
      }
    } else if (node !== undefined) {
      result.leafCount++;
    }
  }
  visit(value, 0);
  return result;
}

function tenantSummary(tenant) {
  return {
    ...structure(tenant),
    industries: Object.fromEntries(INDUSTRIES.map((industry) => [
      industry,
      Object.fromEntries(TENANT_GROUPS[industry].map((path) => [path, structure(at(tenant, path))])),
    ])),
    fsiLeaves: Object.fromEntries(FSI_LEAVES.map((path) => {
      const value = at(tenant, `industryFsi.${path}`);
      return [path, { present: value !== undefined, type: typeOf(value) }];
    })),
  };
}

function identitySummary(entity) {
  const map = entity?.identityMap;
  const entries = map && typeof map === 'object' && !Array.isArray(map) ? Object.values(map) : [];
  return {
    present: map !== undefined,
    type: typeOf(map),
    namespaceCount: entries.length,
    entryCount: entries.reduce((sum, rows) => sum + (Array.isArray(rows) ? rows.length : 0), 0),
    ...Object.fromEntries(['Email', 'ECID'].map((namespace) => {
      const rows = Array.isArray(map?.[namespace]) ? map[namespace] : [];
      return [namespace, {
        present: Object.hasOwn(map || {}, namespace),
        count: rows.length,
        idCount: rows.filter((row) => typeof row?.id === 'string' && row.id.length > 0).length,
        primaryCount: rows.filter((row) => row?.primary === true).length,
      }];
    })),
    personalEmailPresent: at(entity, 'personalEmail.address') !== undefined,
  };
}

// Parse only the already-serialized wire body: toJSON/omission/coercion must match fetch exactly.
function summarizeProfileStreamWire(wireBody, { flowId, datasetId, schemaId, xdmKey = '_demoemea' } = {}) {
  const payload = JSON.parse(wireBody);
  const envelope = payload?.body?.xdmEntity !== undefined && payload?.header !== undefined;
  const entity = envelope ? payload.body.xdmEntity : payload;
  const headerRef = envelope ? payload.header?.schemaRef : undefined;
  const bodyRef = envelope ? payload.body?.xdmMeta?.schemaRef : undefined;
  return {
    payloadFormat: envelope ? 'envelope' : 'bare',
    payloadBytes: Buffer.byteLength(wireBody, 'utf8'),
    payloadSha256: createHash('sha256').update(wireBody, 'utf8').digest('hex'),
    flowId: safeId(flowId),
    datasetId: safeId(datasetId),
    schemaId: safeSchemaId(schemaId),
    headerDatasetId: safeId(payload?.header?.datasetId),
    headerSchemaRef: safeSchemaId(headerRef?.id),
    bodySchemaRef: safeSchemaId(bodyRef?.id),
    headerSchemaContentType: headerRef?.contentType === SCHEMA_CONTENT_TYPE ? SCHEMA_CONTENT_TYPE : null,
    bodySchemaContentType: bodyRef?.contentType === SCHEMA_CONTENT_TYPE ? SCHEMA_CONTENT_TYPE : null,
    identity: identitySummary(entity),
    tenantIdentity: {
      emailPresent: at(entity?.[xdmKey], 'identification.core.email') !== undefined,
      ecidPresent: at(entity?.[xdmKey], 'identification.core.ecid') !== undefined,
    },
    tenant: tenantSummary(entity?.[xdmKey]),
    lowercaseMirror: structure(entity?.demoemea),
    rootGroups: Object.fromEntries(['person', 'personalFinances', 'subscriptions', 'telecomSubscription',
      'travelPreferences', 'loyalty', 'consents', 'optInOut'].map((path) => [path, structure(entity?.[path])])),
  };
}

function safeCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function summarizeProfileStreamReceipt(data, { status, errorCount = 0, warningCount = 0 } = {}) {
  const root = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  const receipt = root.body && typeof root.body === 'object' && !Array.isArray(root.body) ? root.body : root;
  const transaction = receipt.xactionId ?? root.xactionId;
  const validation = receipt.syncValidation ?? receipt.synchronousValidation
    ?? root.syncValidation ?? root.synchronousValidation;
  const state = typeof validation === 'string' ? validation : validation?.status;
  const states = ['success', 'failure', 'pass', 'fail', 'passed', 'failed', 'enabled', 'disabled', 'skipped'];
  return {
    streamingStatus: Number.isInteger(status) && status >= 100 && status <= 599 ? status : null,
    xactionId: safeId(transaction)
      || (typeof transaction === 'string' && transaction === transaction.trim()
        && /^\d{1,20}(?::\d{1,20}){1,4}$/.test(transaction) ? transaction : null),
    inletId: safeId(receipt.inletId ?? root.inletId),
    receivedTimeMs: safeCount(receipt.receivedTimeMs ?? root.receivedTimeMs),
    synchronousValidation: {
      present: validation !== undefined,
      enabled: typeof validation === 'boolean' ? validation
        : typeof validation?.enabled === 'boolean' ? validation.enabled : null,
      skipped: typeof validation?.skipped === 'boolean' ? validation.skipped : null,
      state: states.includes(state) ? state : null,
      status: safeCount(validation?.status),
    },
    streamErrorCount: safeCount(errorCount),
    streamWarningCount: safeCount(warningCount),
    responseErrorCount: [root, ...(receipt === root ? [] : [receipt])].reduce(
      (sum, part) => sum + (Array.isArray(part.errors) ? part.errors.length : 0), 0),
    responseWarningCount: [root, ...(receipt === root ? [] : [receipt])].reduce(
      (sum, part) => sum + (Array.isArray(part.warnings) ? part.warnings.length : 0), 0),
  };
}

module.exports = { summarizeProfileStreamWire, summarizeProfileStreamReceipt, safeIndustry };
