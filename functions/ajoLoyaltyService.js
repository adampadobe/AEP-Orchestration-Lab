'use strict';

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const ACTION_FIELDS = {
  config: [],
  challenge_list: ['limit', 'start'],
  challenge_get: ['challenge_id'],
  profile_state: ['profile_id', 'challenge_id', 'region', 'test'],
  profile_challenges: ['profile_id', 'region', 'state'],
};

function failure(status, message, platformResponse = null, platformStatus = null) {
  return Object.assign(new Error(message), { status, platformResponse, platformStatus });
}

function text(value, label, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) {
    throw failure(400, `${label} must be a non-empty string of at most ${max} characters without control characters.`);
  }
  return value.trim();
}

function challengeId(value) {
  const id = text(value, 'challenge_id', 160);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id)) throw failure(400, 'challenge_id is invalid.');
  return id;
}

function platformEvidence(action, data) {
  if (action !== 'config') return data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  // Configuration failures can also echo provider/sink settings; retain scalar diagnostics only.
  return Object.fromEntries(['code', 'error_code', 'errorCode', 'error', 'message', 'type', 'title', 'detail', 'status']
    .filter((key) => ['string', 'number', 'boolean'].includes(typeof data[key]))
    .map((key) => [key, data[key]]));
}

function configurationSummary(data, platformStatus) {
  const fields = {
    namespace: 'string', tenantId: 'string', eventSchemaId: 'string', eventDatasetId: 'string',
    eventVersion: 'string', applyEventsPriorToSignup: 'boolean', dupeDetection: 'boolean',
    archiveDays: 'number', archiveTTLDays: 'number',
  };
  const result = {};
  for (const [key, type] of Object.entries(fields)) {
    if (data[key] != null && typeof data[key] !== type) {
      throw failure(502, `Adobe Loyalty configuration has an invalid ${key} field.`, null, platformStatus);
    }
    result[key] = data[key] ?? null;
  }
  if (data.autoSignupEvents != null && (!Array.isArray(data.autoSignupEvents)
      || data.autoSignupEvents.some((event) => typeof event !== 'string'))) {
    throw failure(502, 'Adobe Loyalty configuration has invalid autoSignupEvents.', null, platformStatus);
  }
  result.autoSignupEvents = data.autoSignupEvents ?? null;
  return result;
}

function buildLoyaltyReadRequest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
      || typeof input.action !== 'string' || !Object.hasOwn(ACTION_FIELDS, input.action)) {
    throw failure(400, 'Unknown read-only Loyalty action.');
  }
  const fields = new Set(['action', 'sandbox', ...ACTION_FIELDS[input.action]]);
  if (Object.keys(input).some((key) => !fields.has(key))) {
    throw failure(400, 'Unsupported fields for this read-only Loyalty action.');
  }
  if (typeof input.sandbox !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,47}$/.test(input.sandbox)) {
    throw failure(400, 'sandbox is invalid.');
  }

  const action = input.action;
  const isState = action === 'profile_state' || action === 'profile_challenges';
  let origin = 'https://platform.adobe.io';
  if (isState) {
    const region = input.region === undefined ? 'va7' : input.region;
    if (typeof region !== 'string' || !/^[a-z][a-z0-9]{1,15}$/.test(region)) {
      throw failure(400, 'region must be an Adobe region code, or global.');
    }
    origin = region === 'global' ? origin : `https://platform-${region}.adobe.io`;
  }
  let path;
  const query = new URLSearchParams();
  if (action === 'config') path = '/ajo/loyalty/metadata/config';
  if (action === 'challenge_list') {
    path = '/ajo/loyalty/metadata/challenges';
    const limit = input.limit === undefined ? 25 : input.limit;
    if (!['string', 'number'].includes(typeof limit) || !/^\d+$/.test(String(limit))
        || !Number.isInteger(Number(limit)) || Number(limit) < 1 || Number(limit) > 100) {
      throw failure(400, 'limit must be an integer between 1 and 100.');
    }
    query.set('limit', String(Number(limit)));
    if (input.start !== undefined) query.set('start', text(input.start, 'start', 1024));
  }
  if (action === 'challenge_get') path = `/ajo/loyalty/metadata/challenges/${challengeId(input.challenge_id)}`;
  if (action === 'profile_state') {
    path = '/ajo/loyalty/challenges/state';
    query.set('pid', text(input.profile_id, 'profile_id', 512));
    query.set('v', '2');
    if (input.challenge_id !== undefined) query.set('cid', challengeId(input.challenge_id));
    if (input.test !== undefined) {
      if (![true, false, 'true', 'false'].includes(input.test)) throw failure(400, 'test must be true or false.');
      query.set('test', String(input.test));
    }
  }
  if (action === 'profile_challenges') {
    const profileId = text(input.profile_id, 'profile_id', 512);
    if (['.', '..', 'org', 'health', 'state', 'challenge', 'signup', 'events'].includes(profileId.toLowerCase())) {
      throw failure(400, 'profile_id conflicts with a reserved Loyalty route; use the profile_state read instead.');
    }
    path = `/ajo/loyalty/challenges/${encodeURIComponent(profileId)}`;
    const state = input.state === undefined ? 'active' : input.state;
    if (!['active', 'complete'].includes(state)) throw failure(400, 'state must be active or complete.');
    query.set('state', state);
  }
  const url = new URL(path, origin);
  url.search = query.toString();
  return url;
}

function buildLoyaltySignupRequest(input) {
  const fields = ['action', 'sandbox', 'profile_id', 'challenge_id', 'region', 'test', 'confirmed'];
  if (!input || typeof input !== 'object' || Array.isArray(input) || input.action !== 'signup'
      || Object.keys(input).some(key => !fields.includes(key)) || input.confirmed !== true
      || typeof input.region !== 'string' || typeof input.test !== 'boolean') {
    throw failure(400, 'Signup requires one confirmed challenge, an explicit region and boolean test mode; extra fields are not supported.');
  }
  const url = buildLoyaltyReadRequest({
    action: 'profile_state', sandbox: input.sandbox, profile_id: input.profile_id, region: input.region,
  });
  const id = challengeId(input.challenge_id), profileId = text(input.profile_id, 'profile_id', 512);
  if (id !== input.challenge_id || profileId !== input.profile_id) {
    throw failure(400, 'Signup identifiers must not contain surrounding whitespace.');
  }
  url.pathname = `/ajo/loyalty/challenges/signup/${id}`;
  url.search = '';
  return { url, body: { profileId, test: input.test } };
}

async function boundedResponseText(response) {
  const reader = response.body?.getReader();
  if (!reader) throw failure(502, 'Adobe Loyalty returned no readable response body.');
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) throw failure(502, 'Adobe Loyalty response exceeds the 2 MiB limit.');
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks).toString('utf8');
}

function createAjoLoyaltyService({ fetchImpl = fetch } = {}) {
  async function signup(headers, input) {
    const { url, body } = buildLoyaltySignupRequest(input);
    let response, raw;
    try {
      response = await fetchImpl(url, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(60_000),
      });
      raw = response.body ? await boundedResponseText(response) : '';
    } catch (error) {
      throw Object.assign(failure(error.name === 'TimeoutError' || error.name === 'AbortError' ? 504 : 502,
        'Adobe Loyalty signup response was not confirmed. Signup may have occurred; read member state before another attempt.'),
      { signupOutcomeUnknown: true });
    }
    let data = null;
    if (raw.trim()) {
      try { data = JSON.parse(raw); }
      catch {
        throw Object.assign(failure(response.ok ? 502 : response.status,
          'Adobe Loyalty signup returned a non-JSON response. Read member state before another attempt.',
          { responseText: raw.slice(0, 2000) }, response.status), { signupOutcomeUnknown: response.ok });
      }
    }
    if (response.status !== 200 || data?.error || data?.ok === false) {
      throw Object.assign(failure(response.ok ? 502 : response.status,
        `Adobe Loyalty signup returned HTTP ${response.status}. Read member state before another attempt.`, data, response.status),
      { signupOutcomeUnknown: response.ok });
    }
    return { ok: true, sandbox: input.sandbox, action: 'signup', challenge_id: input.challenge_id,
      platform_status: response.status, platform_host: url.hostname, accepted: true, data };
  }
  async function read(headers, input) {
    const url = buildLoyaltyReadRequest(input);
    let response;
    let data;
    try {
      response = await fetchImpl(url, {
        method: 'GET',
        headers,
        redirect: 'error',
        signal: AbortSignal.timeout(60_000),
      });
      const body = await boundedResponseText(response);
      try { data = JSON.parse(body); }
      catch {
        throw failure(response.ok ? 502 : response.status,
          `Adobe Loyalty returned HTTP ${response.status} with a non-JSON response.`, null, response.status);
      }
    } catch (error) {
      if (response && !response.ok) {
        throw failure(response.status, `Adobe Loyalty returned HTTP ${response.status}.`, null, response.status);
      }
      if (error.status) throw error;
      const timeout = error.name === 'TimeoutError' || error.name === 'AbortError';
      throw failure(timeout ? 504 : 502, timeout ? 'Adobe Loyalty read timed out.' : 'Adobe Loyalty read failed before a complete response.');
    }
    if (!response.ok) {
      throw failure(response.status, `Adobe Loyalty returned HTTP ${response.status}.`, platformEvidence(input.action, data), response.status);
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw failure(502, 'Adobe Loyalty returned an unexpected JSON response.', platformEvidence(input.action, data), response.status);
    }
    // Metadata also uses the paged children envelope observed in Adobe's live response.
    const listField = input.action === 'challenge_list'
      ? (Object.hasOwn(data, 'children') ? 'children' : 'challengeList')
      : (['profile_state', 'profile_challenges'].includes(input.action) ? 'challengeList' : null);
    if (listField && (!Array.isArray(data[listField])
        || data[listField].some((item) => !item || typeof item !== 'object' || Array.isArray(item)))) {
      throw failure(502, `Adobe Loyalty response has missing or invalid ${listField}; it cannot be treated as an empty result.`, data, response.status);
    }
    // OrgConfig embeds provider authentication and sink definitions; never return it wholesale.
    const result = input.action === 'config' ? configurationSummary(data, response.status) : data;
    return {
      ok: true,
      sandbox: input.sandbox,
      action: input.action,
      platform_status: response.status,
      platform_host: url.hostname,
      read_at: new Date().toISOString(),
      data: result,
      ...(input.action === 'config' ? { privacy: 'Only identity and event configuration fields are returned; provider and sink authentication is omitted.' } : {}),
    };
  }
  return { read, signup };
}

module.exports = { buildLoyaltyReadRequest, buildLoyaltySignupRequest, createAjoLoyaltyService };
