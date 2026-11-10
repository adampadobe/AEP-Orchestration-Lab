'use strict';

const { buildProfileTablePayload, appendProfileAccessMergePolicyIfConfigured } = require('./profileTableHelpers');
const ORG = 'BF9C27AA6464801C0A495FD0@AdobeOrg';
const BASE = 'https://platform.adobe.io/data/core/ups/access/entities';

async function boundedJson(response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Profile response is unreadable.');
  const chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 1024 * 1024) throw new Error('Profile response exceeded the size limit.');
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally {
    await reader.cancel();
  }
}

function identityValues(rows, kind) {
  const pattern = kind === 'email'
    ? /(?:personalEmail\.address|identification\.core\.email|identityMap\.(?:Email|email)\.\d+\.id)$/i
    : /(?:identification\.core\.ecid|identityMap\.ECID\.\d+\.id)$/i;
  return rows.filter((row) => pattern.test(row.path)).map((row) => row.value);
}

function createMyDataFlowsTraceAep({ getAdobeAuth, fetchImpl = fetch }) {
  async function inspect(identity, expected) {
    const auth = await getAdobeAuth();
    if (auth.orgId !== ORG) throw new Error('The configured Adobe organization does not match the trace.');
    const signal = AbortSignal.timeout(25_000);
    async function read(namespace, identifier) {
      const qs = new URLSearchParams({
        'schema.name': '_xdm.context.profile', entityId: identifier, entityIdNS: namespace,
      });
      appendProfileAccessMergePolicyIfConfigured(qs);
      const response = await fetchImpl(`${BASE}?${qs}`, {
        method: 'GET', redirect: 'error', signal,
        headers: {
          Authorization: `Bearer ${auth.accessToken}`, 'x-api-key': auth.clientId,
          'x-gw-ims-org-id': auth.orgId, 'x-sandbox-name': 'apalmer', Accept: 'application/json',
        },
      });
      const data = await boundedJson(response);
      if (response.status === 404 && data['error-code'] === 'UPLIB-201001-404'
        && data.title === 'Entity not found.' && Number(data.status) === 404) return null;
      if (!response.ok || !data || typeof data !== 'object' || Array.isArray(data)
        || Object.keys(data).some((key) => /^(?:_?errors?|error_description)$/i.test(key))) {
        throw new Error('Profile Access did not return a valid successful read.');
      }
      const ids = Object.keys(data).filter((key) => !key.startsWith('_'));
      if (!ids.length) return null;
      if (ids.length !== 1) throw new Error('Profile Access returned multiple entities for the traced identity.');
      return buildProfileTablePayload(identity.email, data);
    }
    const [email, ecid] = await Promise.all([read('Email', identity.email), read('ECID', identity.ecid)]);
    if (!email || !ecid) {
      return { state: 'waiting', detail: 'The exact person is not yet visible by both Email and ECID. Read again; do not regenerate.', evidence: {
        emailVisible: !!email, ecidVisible: !!ecid,
      } };
    }
    const matches = [email, ecid].every((result) =>
      identityValues(result.rows, 'email').includes(identity.email)
      && identityValues(result.rows, 'ecid').includes(identity.ecid));
    const sameEntity = !!email.entityId && email.entityId === ecid.entityId;
    const expectedFields = [email, ecid].map((result) => ({
      mobileMatches: result.rows.some((row) =>
        /(?:mobilePhone\.number|identification\.core\.phoneNumber)$/i.test(row.path)
        && row.value === expected.mobilePhone),
      testProfileMatches: result.rows.some((row) =>
        /(?:^|\.)testProfile$/.test(row.path) && row.valueType === 'boolean' && row.value === 'true'),
    }));
    const verified = matches && sameEntity && expectedFields.every((fields) =>
      fields.mobileMatches && fields.testProfileMatches);
    return {
      state: verified ? 'verified' : 'waiting',
      detail: verified
        ? 'Same stored entity verified by Email and ECID, with the saved mobile and test-profile flag. This is not a full industry-field or source-dataset audit.'
        : 'Profile data is visible but identity stitching, saved mobile or test-profile fields are not yet all verified.',
      evidence: { sameEntity, identitiesMatch: matches, reads: expectedFields, entityId: email.entityId,
        fields: email.rows.filter((row) => identityValues([row], 'email').length
          || identityValues([row], 'ecid').length
          || /(?:mobilePhone\.number|(?:^|\.)testProfile)$/.test(row.path)).slice(0, 20)
          .map(({ path, value, valueType }) => ({ path, value, valueType })) },
    };
  }
  return { inspect };
}

module.exports = { createMyDataFlowsTraceAep, identityValues };
