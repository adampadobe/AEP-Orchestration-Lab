import assert from 'node:assert/strict';
import test from 'node:test';

process.env.AEP_LAB_MCP_API_KEY = 'server-held-test-key';
process.env.AEP_LAB_MCP_ALLOWED_SANDBOXES = 'apalmer,kirkham';

const { describeImsBearerForLog, validateImsBearer, validateMcpRequest } = await import('../src/auth.mjs');

function request(headers = {}) {
  return { headers };
}

function imsHeaders(overrides = {}) {
  return {
    authorization: 'Bearer valid-test-token',
    'x-gw-ims-org-id': '1234567890@AdobeOrg',
    'x-gw-ims-email': 'apalmer@adobe.com',
    ...overrides,
  };
}

function enrollmentDb(entries = []) {
  return {
    collection(name) {
      assert.equal(name, 'mcpApiKeys');
      return {
        where(field, operator, value) {
          assert.equal(field, 'principalEmail');
          assert.equal(operator, '==');
          assert.equal(value, 'apalmer@adobe.com');
          return {
            async get() {
              return {
                docs: entries.map((entry, index) => ({
                  id: `key-${index}`,
                  data: () => entry,
                })),
              };
            },
          };
        },
      };
    },
  };
}

function validUserInfo() {
  return {
    ok: true,
    status: 200,
    async json() {
      return {
        sub: 'ims-user-123',
        account_type: 'ent',
        email_verified: true,
        email: 'apalmer@adobe.com',
        name: 'Adam Palmer',
      };
    },
  };
}

test('IMS auth requires bearer and Adobe org headers', async () => {
  const missingBearer = await validateImsBearer(request(), { db: enrollmentDb(), fetchImpl: async () => validUserInfo() });
  assert.equal(missingBearer.status, 401);

  const missingOrg = await validateImsBearer(request({ authorization: 'Bearer token' }), {
    db: enrollmentDb(),
    fetchImpl: async () => validUserInfo(),
  });
  assert.equal(missingOrg.status, 401);
});

test('IMS auth validates token identity and uses active Portal enrollment', async () => {
  let requestedUrl;
  let requestedAuthorization;
  const result = await validateImsBearer(request(imsHeaders()), {
    now: 100,
    db: enrollmentDb([
      {
        principalUid: 'firebase-user-1',
        principalEmail: 'apalmer@adobe.com',
        principalLabel: 'Adam Palmer',
        sandbox: 'apalmer',
        revoked: false,
      },
      {
        principalUid: 'firebase-user-1',
        principalEmail: 'apalmer@adobe.com',
        allowedSandboxes: ['kirkham'],
        revoked: false,
      },
      { sandbox: 'ignored', revoked: true },
    ]),
    fetchImpl: async (url, options) => {
      requestedUrl = url;
      requestedAuthorization = options.headers.authorization;
      return validUserInfo();
    },
  });

  assert.equal(requestedUrl, 'https://ims-na1.adobelogin.com/ims/userinfo/v2');
  assert.equal(requestedAuthorization, 'Bearer valid-test-token');
  assert.equal(result.ok, true);
  assert.equal(result.source, 'ims');
  assert.equal(result.principalEmail, 'apalmer@adobe.com');
  assert.equal(result.principalUid, 'firebase-user-1');
  assert.deepEqual(result.principalAccess.allowedSandboxes, ['apalmer', 'kirkham']);
  assert.equal(result.forwardMcpApiKey, 'server-held-test-key');
  assert.match(result.keyId, /^ims-[a-f0-9]{12}$/);
});

test('IMS auth falls back to the authenticated IMS profile when UserInfo has no email scope', async () => {
  const requestedUrls = [];
  const result = await validateImsBearer(request(imsHeaders({
    authorization: 'Bearer cowork-scoped-token',
    'x-gw-ims-user-id': 'ims-user-123',
  })), {
    now: 200,
    db: enrollmentDb([{
      principalUid: 'firebase-user-1',
      principalEmail: 'apalmer@adobe.com',
      sandbox: 'apalmer',
      revoked: false,
    }]),
    fetchImpl: async (url) => {
      requestedUrls.push(url);
      if (url.endsWith('/ims/userinfo/v2')) {
        return { ok: true, status: 200, async json() { return { email_verified: true }; } };
      }
      assert.equal(url, 'https://ims-na1.adobelogin.com/ims/profile/v3');
      return {
        ok: true,
        status: 200,
        async json() {
          return { userId: 'ims-user-123', email: 'apalmer@adobe.com', emailVerified: true };
        },
      };
    },
  });

  assert.deepEqual(requestedUrls, [
    'https://ims-na1.adobelogin.com/ims/userinfo/v2',
    'https://ims-na1.adobelogin.com/ims/profile/v3',
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.principalEmail, 'apalmer@adobe.com');
});

test('IMS auth does not trust a forwarded email when authenticated IMS endpoints omit it', async () => {
  const rejected = await validateImsBearer(request(imsHeaders({
    authorization: 'Bearer no-email-token',
  })), {
    db: enrollmentDb([{ principalUid: 'firebase-user-1', sandbox: 'apalmer', revoked: false }]),
    fetchImpl: async () => ({ ok: true, status: 200, async json() { return { userId: 'ims-user-123' }; } }),
    logger: { warn() {} },
  });

  assert.equal(rejected.status, 403);
  assert.match(rejected.message, /verified Adobe corporate identity/);
});

test('IMS auth rejects identity mismatch and missing enrollment', async () => {
  const mismatch = await validateImsBearer(request(imsHeaders({
    authorization: 'Bearer mismatch-token',
    'x-gw-ims-email': 'someoneelse@adobe.com',
  })), {
    db: enrollmentDb(),
    fetchImpl: async () => validUserInfo(),
  });
  assert.equal(mismatch.status, 403);
  assert.match(mismatch.message, /does not match/);

  const unenrolled = await validateImsBearer(request(imsHeaders({ authorization: 'Bearer unenrolled-token' })), {
    db: enrollmentDb(),
    fetchImpl: async () => validUserInfo(),
  });
  assert.equal(unenrolled.status, 403);
  assert.match(unenrolled.message, /No active AEP Lab enrollment/);
});

test('dual auth keeps API-key clients on the existing path', async () => {
  const result = await validateMcpRequest(request({ 'x-aep-lab-mcp-key': 'server-held-test-key' }));
  assert.equal(result.ok, true);
  assert.equal(result.source, 'env');
});

test('IMS rejection diagnostics report token shape without credential or identity values', async () => {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'secret-kid' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    sub: 'sensitive-user-id',
    email: 'apalmer@adobe.com',
    exp: Math.floor(Date.now() / 1000) + 300,
    custom_claim: 'sensitive-value',
  })).toString('base64url');
  const token = `${header}.${payload}.sensitive-signature`;
  const diagnostics = describeImsBearerForLog(token, request(imsHeaders({
    authorization: `Bearer ${token}`,
    'x-gw-ims-user-id': 'sensitive-user-id',
  })));

  assert.equal(diagnostics.format, 'jwt');
  assert.equal(diagnostics.algorithm, 'RS256');
  assert.equal(diagnostics.kidPresent, true);
  assert.equal(diagnostics.hasEmailClaim, true);
  assert.equal(diagnostics.forwardedEmailMatchesTokenClaim, true);
  assert.equal(diagnostics.forwardedUserIdMatchesTokenClaim, true);
  assert.ok(diagnostics.claimNames.includes('custom_claim'));

  const warnings = [];
  const rejected = await validateImsBearer(request(imsHeaders({
    authorization: `Bearer ${token}`,
    'x-gw-ims-user-id': 'sensitive-user-id',
  })), {
    db: enrollmentDb(),
    fetchImpl: async () => ({ ok: false, status: 403 }),
    logger: { warn: (...args) => warnings.push(args.join(' ')) },
  });
  assert.equal(rejected.status, 403);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /userinfo-http-status/);
  assert.match(warnings[0], /"format":"jwt"/);
  assert.doesNotMatch(warnings[0], /sensitive-user-id|sensitive-signature|sensitive-value|apalmer@adobe\.com|secret-kid/);
});
