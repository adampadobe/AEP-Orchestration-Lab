'use strict';

const { createHash, randomUUID } = require('node:crypto');

const EVENTS = new Set(['start', 'update', 'end']);
const MAX_PAYLOAD_BYTES = 100_000;
const MAX_TEMPLATE_VARIABLES = 40;
const SAFE_ID = /^[A-Za-z0-9._:-]+$/;
const VARIABLE_KEY = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const ALLOWED_VARIABLE_ROOTS = [
  'recipients.0.context.requestPayload.aps.attributes.',
  'recipients.0.context.requestPayload.aps.content-state.',
  'recipients.0.context.requestPayload.aps.alert.',
];

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function parseBody(value) {
  if (typeof value === 'string') {
    const trimmed = value.replace(/^\uFEFF/, '').trim();
    if (!trimmed) throw Object.assign(new Error('template body is empty'), { status: 400 });
    try {
      return JSON.parse(trimmed);
    } catch (e) {
      // Postman exports timestamps as bare {{$timestamp}}, which is not JSON.
      // Preserve the token as a string; the server replaces it during preflight.
      const postmanSafe = trimmed.replace(
        /:(\s*)(\{\{[^{}]+\}\})(?=\s*[,}\]])/g,
        (_match, whitespace, token) => `:${whitespace}${JSON.stringify(token)}`,
      );
      try {
        return JSON.parse(postmanSafe);
      } catch {
        throw Object.assign(new Error(`template body is invalid JSON: ${e.message || e}`), { status: 400 });
      }
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw Object.assign(new Error('template body must be a JSON object'), { status: 400 });
  }
  return cloneJson(value);
}

function apsFromPayload(payload) {
  return payload?.recipients?.[0]?.context?.requestPayload?.aps || null;
}

function validateTemplateBody(value) {
  const body = parseBody(value);
  if (!Array.isArray(body.recipients) || body.recipients.length !== 1) {
    throw Object.assign(new Error('template must contain exactly one recipients[] entry'), { status: 400 });
  }
  const aps = apsFromPayload(body);
  if (!aps || typeof aps !== 'object' || Array.isArray(aps)) {
    throw Object.assign(
      new Error('template must include recipients[0].context.requestPayload.aps'),
      { status: 400 },
    );
  }
  const bytes = Buffer.byteLength(JSON.stringify(body), 'utf8');
  if (bytes > MAX_PAYLOAD_BYTES) {
    throw Object.assign(new Error(`template exceeds ${MAX_PAYLOAD_BYTES} bytes`), { status: 400 });
  }
  return body;
}

function normalizeVariableDefinitions(input) {
  const list = Array.isArray(input) ? input : [];
  if (list.length > MAX_TEMPLATE_VARIABLES) {
    throw Object.assign(new Error(`maximum ${MAX_TEMPLATE_VARIABLES} template variables`), { status: 400 });
  }
  const seen = new Set();
  return list.map((row) => {
    const value = row && typeof row === 'object' ? row : {};
    const key = String(value.key || '').trim();
    const path = String(value.path || '').trim().replace(/\[(\d+)\]/g, '.$1').replace(/^\.+/, '');
    const type = String(value.type || 'string').trim().toLowerCase();
    if (!VARIABLE_KEY.test(key)) {
      throw Object.assign(new Error(`invalid variable key "${key}"`), { status: 400 });
    }
    if (seen.has(key)) {
      throw Object.assign(new Error(`duplicate variable key "${key}"`), { status: 400 });
    }
    seen.add(key);
    if (!ALLOWED_VARIABLE_ROOTS.some((root) => path.startsWith(root))) {
      throw Object.assign(
        new Error(
          `variable "${key}" path must be inside APS attributes, content-state, or alert`,
        ),
        { status: 400 },
      );
    }
    if (!['string', 'number', 'boolean', 'json'].includes(type)) {
      throw Object.assign(new Error(`variable "${key}" has unsupported type "${type}"`), { status: 400 });
    }
    return {
      key,
      label: String(value.label || key).trim().slice(0, 120) || key,
      description: String(value.description || '').trim().slice(0, 500),
      path,
      type,
      required: value.required !== false,
      example: value.example == null ? null : value.example,
    };
  });
}

function normalizeVariableValue(definition, raw) {
  if (definition.type === 'string') return String(raw);
  if (definition.type === 'number') {
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new Error(`${definition.label} must be a number`);
    return n;
  }
  if (definition.type === 'boolean') {
    if (raw === true || raw === false) return raw;
    if (String(raw).toLowerCase() === 'true') return true;
    if (String(raw).toLowerCase() === 'false') return false;
    throw new Error(`${definition.label} must be true or false`);
  }
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      throw new Error(`${definition.label} must be valid JSON`);
    }
  }
  return cloneJson(raw);
}

function setPath(target, path, value) {
  const parts = path.split('.').filter(Boolean);
  let cursor = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    const nextKey = parts[i + 1];
    if (cursor[key] == null || typeof cursor[key] !== 'object') {
      cursor[key] = /^\d+$/.test(nextKey) ? [] : {};
    }
    cursor = cursor[key];
  }
  cursor[parts[parts.length - 1]] = value;
}

function missingExecutionFields(input, variableDefinitions) {
  const missing = [];
  const campaignId = String(input.campaignId || '').trim();
  const ecid = String(input.ecid || '').trim();
  const liveActivityId = String(input.liveActivityId || '').trim();
  const event = String(input.event || '').trim().toLowerCase();
  if (!campaignId) missing.push({ key: 'campaign_id', label: 'AJO campaign ID' });
  if (!ecid) missing.push({ key: 'ecid', label: 'Recipient ECID' });
  if (!liveActivityId) missing.push({ key: 'live_activity_id', label: 'Live Activity ID' });
  if (!EVENTS.has(event)) missing.push({ key: 'event', label: 'Event (start, update, or end)' });
  const variables = input.variables && typeof input.variables === 'object' && !Array.isArray(input.variables)
    ? input.variables
    : {};
  variableDefinitions.forEach((definition) => {
    const value = variables[definition.key];
    if (definition.required && (value == null || value === '')) {
      missing.push({
        key: `variables.${definition.key}`,
        label: definition.label,
        description: definition.description || undefined,
        type: definition.type,
        example: definition.example,
      });
    }
  });
  return missing;
}

function validateExecutionIdentifiers({ campaignId, ecid, liveActivityId, event }) {
  if (campaignId.length > 160 || !SAFE_ID.test(campaignId)) {
    throw Object.assign(new Error('campaign ID contains unsupported characters or is too long'), { status: 400 });
  }
  if (!/^\d{10,40}$/.test(ecid)) {
    throw Object.assign(new Error('ECID must contain 10–40 digits'), { status: 400 });
  }
  if (liveActivityId.length < 8 || liveActivityId.length > 256 || !SAFE_ID.test(liveActivityId)) {
    throw Object.assign(new Error('Live Activity ID contains unsupported characters or is invalid'), { status: 400 });
  }
  if (!EVENTS.has(event)) {
    throw Object.assign(new Error('event must be start, update, or end'), { status: 400 });
  }
}

function buildExecutionPayload({ templateBody, variableDefinitions, input, nowMs = Date.now() }) {
  const definitions = normalizeVariableDefinitions(variableDefinitions);
  const missingFields = missingExecutionFields(input, definitions);
  if (missingFields.length) return { ready: false, missingFields };

  const campaignId = String(input.campaignId).trim();
  const ecid = String(input.ecid).trim();
  const liveActivityId = String(input.liveActivityId).trim();
  const event = String(input.event).trim().toLowerCase();
  validateExecutionIdentifiers({ campaignId, ecid, liveActivityId, event });

  const payload = validateTemplateBody(templateBody);
  payload.requestId = randomUUID();
  payload.campaignId = campaignId;
  const recipient = payload.recipients[0];
  recipient.type = 'aep';
  recipient.userId = ecid;
  recipient.namespace = 'ECID';
  const aps = apsFromPayload(payload);
  aps.timestamp = Math.floor(nowMs / 1000);
  aps.event = event;
  if (!aps.attributes || typeof aps.attributes !== 'object' || Array.isArray(aps.attributes)) {
    aps.attributes = {};
  }
  if (
    !aps.attributes.liveActivityData ||
    typeof aps.attributes.liveActivityData !== 'object' ||
    Array.isArray(aps.attributes.liveActivityData)
  ) {
    aps.attributes.liveActivityData = {};
  }
  aps.attributes.liveActivityData.liveActivityID = liveActivityId;

  const variables = input.variables && typeof input.variables === 'object' ? input.variables : {};
  definitions.forEach((definition) => {
    if (variables[definition.key] == null || variables[definition.key] === '') return;
    setPath(payload, definition.path, normalizeVariableValue(definition, variables[definition.key]));
  });

  const rendered = JSON.stringify(payload);
  const unresolved = [...new Set((rendered.match(/\{\{[^{}]+\}\}/g) || []))];
  if (unresolved.length) {
    throw Object.assign(
      new Error(`template still contains unresolved placeholders: ${unresolved.join(', ')}`),
      { status: 400 },
    );
  }
  if (Buffer.byteLength(rendered, 'utf8') > MAX_PAYLOAD_BYTES) {
    throw Object.assign(new Error(`rendered payload exceeds ${MAX_PAYLOAD_BYTES} bytes`), { status: 400 });
  }

  return {
    ready: true,
    payload,
    payloadHash: createHash('sha256').update(rendered).digest('hex'),
  };
}

function maskEcid(ecid) {
  const value = String(ecid || '');
  if (value.length < 10) return value;
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

function previewPayload(payload) {
  const preview = cloneJson(payload);
  if (preview?.recipients?.[0]?.userId) {
    preview.recipients[0].userId = maskEcid(preview.recipients[0].userId);
  }
  return preview;
}

module.exports = {
  EVENTS,
  MAX_PAYLOAD_BYTES,
  parseBody,
  validateTemplateBody,
  normalizeVariableDefinitions,
  missingExecutionFields,
  buildExecutionPayload,
  previewPayload,
  maskEcid,
};
