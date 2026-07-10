'use strict';

const crypto = require('crypto');
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const SERVICE_PATH = require.resolve('../labWorkspaceAuthService');
const ADMIN_PATH = require.resolve('firebase-admin');
const STORE_PATH = require.resolve('../labUserSandboxStore');
const PROVISION_PATH = require.resolve('../labRtdbProvisionService');

const TEST_TOKEN = 'test-approval-token-32chars-minimum';
const TEST_TOKEN_HASH = crypto.createHash('sha256').update(TEST_TOKEN, 'utf8').digest('hex');
const TEST_UID = 'test-uid-approve-001';

const MAIL_DEPS = {
  approvalBaseUrl: 'https://aep-orchestration-lab.web.app',
  mailgunKey: 'key-12345678',
  mailgunDomain: 'mail.example.com',
  mailFrom: 'lab@mail.example.com',
  mailgunRegion: '',
};

function tokenExpiresFuture() {
  return {
    toMillis: () => Date.now() + 60_000,
  };
}

function createApprovalHarness(docDataOverrides = {}) {
  const docData = {
    status: 'pending',
    adobeEmail: 'requester@adobe.com',
    firstName: 'Jane',
    lastName: 'Doe',
    tokenHash: TEST_TOKEN_HASH,
    tokenExpiresAt: tokenExpiresFuture(),
    workspaceSlug: 'jane-doe',
    workspaceName: 'Jane Doe',
    ...docDataOverrides,
  };

  const setCalls = [];
  const ref = {
    get: async () => ({
      exists: true,
      data: () => ({ ...docData }),
    }),
    set: async (patch) => {
      setCalls.push(patch);
      if (patch.status) docData.status = patch.status;
      if (patch.requesterNotifiedAt) docData.requesterNotifiedAt = patch.requesterNotifiedAt;
      if (patch.tokenHash && patch.tokenHash._type === 'delete') delete docData.tokenHash;
      if (patch.tokenExpiresAt && patch.tokenExpiresAt._type === 'delete') delete docData.tokenExpiresAt;
    },
  };

  const adminMock = {
    apps: [{ name: 'test' }],
    initializeApp: () => {},
    firestore: Object.assign(
      () => ({
        collection: () => ({
          doc: () => ref,
        }),
      }),
      {
        FieldValue: {
          serverTimestamp: () => ({ _type: 'serverTimestamp' }),
          delete: () => ({ _type: 'delete' }),
        },
      },
    ),
    auth: () => ({
      updateUser: async () => {},
    }),
  };

  return { docData, setCalls, ref, adminMock };
}

function installServiceMocks(harness) {
  const originals = {
    admin: require.cache[ADMIN_PATH],
    store: require.cache[STORE_PATH],
    provision: require.cache[PROVISION_PATH],
    service: require.cache[SERVICE_PATH],
  };

  require.cache[ADMIN_PATH] = {
    id: ADMIN_PATH,
    filename: ADMIN_PATH,
    loaded: true,
    exports: harness.adminMock,
  };
  require.cache[STORE_PATH] = {
    id: STORE_PATH,
    filename: STORE_PATH,
    loaded: true,
    exports: {
      upsertWorkspaceProfile: async () => ({}),
    },
  };
  require.cache[PROVISION_PATH] = {
    id: PROVISION_PATH,
    filename: PROVISION_PATH,
    loaded: true,
    exports: {
      provisionUserRtdbWorkspace: async () => ({ ok: true }),
    },
  };
  delete require.cache[SERVICE_PATH];

  const service = require('../labWorkspaceAuthService');

  return {
    service,
    restore: () => {
      for (const [path, original] of Object.entries({
        [ADMIN_PATH]: originals.admin,
        [STORE_PATH]: originals.store,
        [PROVISION_PATH]: originals.provision,
        [SERVICE_PATH]: originals.service,
      })) {
        if (original) require.cache[path] = original;
        else delete require.cache[path];
      }
    },
  };
}

describe('approveWorkspaceAuthRequest requester email', () => {
  let harness;
  let installed;
  let originalFetch;
  let fetchCalls;

  beforeEach(() => {
    harness = createApprovalHarness();
    installed = installServiceMocks(harness);
    fetchCalls = [];
    originalFetch = global.fetch;
    global.fetch = async (url, init) => {
      fetchCalls.push({ url, init });
      return {
        ok: true,
        status: 200,
        text: async () => '{"id":"<2026@test>"}',
      };
    };
    delete process.env.FUNCTIONS_EMULATOR;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    installed.restore();
  });

  it('sends email on first approval', async () => {
    const result = await installed.service.approveWorkspaceAuthRequest(
      { uid: TEST_UID, token: TEST_TOKEN },
      MAIL_DEPS,
    );

    assert.equal(result.ok, true);
    assert.equal(result.status, 'approved');
    assert.equal(result.requesterEmailSent, true);
    assert.equal(result.requesterEmailResult.sent, true);
    assert.equal(fetchCalls.length, 1);
    assert.match(fetchCalls[0].url, /api\.mailgun\.net/);

    const body = fetchCalls[0].init.body;
    assert.match(body, /to=requester%40adobe\.com/);
    assert.match(body, /Hi\+Jane%2C/);
    assert.match(
      body,
      /aep-orchestration-lab\.web\.app%2Fprofile-viewer%2Fhome\.html/,
    );
    assert.ok(
      harness.setCalls.some((patch) => patch.requesterNotifiedAt && patch.requesterNotifiedAt._type === 'serverTimestamp'),
    );
  });

  it('does not send email when already approved', async () => {
    harness.docData.status = 'approved';

    const result = await installed.service.approveWorkspaceAuthRequest(
      { uid: TEST_UID, token: TEST_TOKEN },
      MAIL_DEPS,
    );

    assert.equal(result.status, 'already_approved');
    assert.equal(fetchCalls.length, 0);
    assert.equal(result.requesterEmailSent, undefined);
  });

  it('still approves when Mailgun fails', async () => {
    global.fetch = async () => ({
      ok: false,
      status: 500,
      text: async () => 'Mailgun error',
    });

    const result = await installed.service.approveWorkspaceAuthRequest(
      { uid: TEST_UID, token: TEST_TOKEN },
      MAIL_DEPS,
    );

    assert.equal(result.ok, true);
    assert.equal(result.status, 'approved');
    assert.equal(result.requesterEmailSent, false);
    assert.equal(result.requesterEmailResult.sent, false);
    assert.match(result.requesterEmailResult.error, /Mailgun 500/);
    assert.ok(!harness.setCalls.some((patch) => patch.requesterNotifiedAt));
  });

  it('skips duplicate send when requesterNotifiedAt is already set', async () => {
    harness.docData.requesterNotifiedAt = { _type: 'serverTimestamp' };

    const result = await installed.service.approveWorkspaceAuthRequest(
      { uid: TEST_UID, token: TEST_TOKEN },
      MAIL_DEPS,
    );

    assert.equal(result.ok, true);
    assert.equal(result.status, 'approved');
    assert.equal(result.requesterEmailSent, false);
    assert.equal(result.requesterEmailResult.skipped, true);
    assert.equal(result.requesterEmailResult.reason, 'already_notified');
    assert.equal(fetchCalls.length, 0);
  });
});
