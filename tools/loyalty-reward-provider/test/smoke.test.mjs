#!/usr/bin/env node
/**
 * Smoke tests for loyalty-reward-provider (local, sandbox-aware paths).
 */

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const fixturePath = join(root, 'fixtures', 'sample-fulfillment.json');
const testApiKey = 'smoke-test-api-key-' + Date.now();
const testSandbox = 'apalmer';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { _raw: text };
  }
  return { res, body };
}

async function main() {
  const port = 18000 + Math.floor(Math.random() * 1000);
  const base = `http://127.0.0.1:${port}`;
  const child = spawn('node', ['server.js'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      LOYALTY_PROVIDER_API_KEY: testApiKey,
      LOYALTY_DEFAULT_SANDBOX: testSandbox,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let started = false;
  for (let i = 0; i < 30; i += 1) {
    await wait(100);
    try {
      const { res } = await fetchJson(`${base}/health`);
      if (res.ok) {
        started = true;
        break;
      }
    } catch {
      /* retry */
    }
  }

  if (!started) {
    child.kill();
    console.error('FAIL: server did not start');
    process.exit(1);
  }

  const failures = [];

  const health = await fetchJson(`${base}/health`);
  if (!health.res.ok || health.body.status !== 'ok') {
    failures.push('/health');
  }

  const sandboxHealth = await fetchJson(`${base}/${testSandbox}/health`);
  if (!sandboxHealth.res.ok || sandboxHealth.body.sandbox !== testSandbox) {
    failures.push('/{sandbox}/health');
  }

  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
  const fulfill = await fetchJson(`${base}/${testSandbox}/v1/fulfill`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': testApiKey,
      'Idempotency-Key': 'smoke-idem-1',
    },
    body: JSON.stringify(fixture),
  });
  if (!fulfill.res.ok || fulfill.body.status !== 'accepted' || !fulfill.body.transactionId) {
    failures.push('/{sandbox}/v1/fulfill first call');
  }

  const fulfillDup = await fetchJson(`${base}/${testSandbox}/v1/fulfill`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': testApiKey,
      'Idempotency-Key': 'smoke-idem-1',
    },
    body: JSON.stringify(fixture),
  });
  if (
    !fulfillDup.res.ok
    || fulfillDup.body.transactionId !== fulfill.body.transactionId
    || !fulfillDup.body.idempotent
  ) {
    failures.push('/{sandbox}/v1/fulfill idempotency');
  }

  const unauthorized = await fetchJson(`${base}/${testSandbox}/v1/fulfill`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-API-Key': 'wrong-key' },
    body: JSON.stringify(fixture),
  });
  if (unauthorized.res.status !== 401) {
    failures.push('/{sandbox}/v1/fulfill unauthorized');
  }

  const oauth = await fetchJson(`${base}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!oauth.res.ok || !oauth.body.access_token) {
    failures.push('/oauth/token');
  }

  const ledgerUnauthorized = await fetchJson(`${base}/${testSandbox}/v1/ledger`);
  if (ledgerUnauthorized.res.status !== 401) {
    failures.push('/{sandbox}/v1/ledger unauthorized');
  }

  const ledger = await fetchJson(`${base}/${testSandbox}/v1/ledger`, {
    headers: { 'X-API-Key': testApiKey, Accept: 'application/json' },
  });
  if (!ledger.res.ok || !Array.isArray(ledger.body.entries) || ledger.body.entries.length < 1) {
    failures.push('/{sandbox}/v1/ledger after fulfill');
  }

  const legacyFulfill = await fetchJson(`${base}/v1/fulfill`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': testApiKey,
    },
    body: JSON.stringify(fixture),
  });
  if (!legacyFulfill.res.ok || legacyFulfill.body.sandbox !== testSandbox) {
    failures.push('legacy /v1/fulfill');
  }

  child.kill();

  if (failures.length) {
    console.error('FAIL:', failures.join(', '));
    process.exit(1);
  }
  console.log('OK: loyalty-reward-provider smoke tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
