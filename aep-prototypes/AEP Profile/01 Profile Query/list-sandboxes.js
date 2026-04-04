#!/usr/bin/env node
/**
 * List AEP sandboxes available to the authenticated user.
 * Uses the Sandbox Management API (no x-sandbox-name required).
 *
 * Usage: node list-sandboxes.js
 */

import { getAuth, getConfig } from '../00 Adobe Auth/src/index.js';

const SANDBOX_MANAGEMENT_BASE = 'https://platform.adobe.io/data/foundation/sandbox-management';

async function listSandboxes() {
  const { token, config } = await getAuth();
  const cfg = getConfig();

  const url = `${SANDBOX_MANAGEMENT_BASE}/?limit=100&offset=0`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'x-api-key': cfg.clientId,
      'x-gw-ims-org-id': config.orgId,
    },
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg = data.message || data.error_description || data.title || res.statusText;
    throw new Error(`Sandbox API ${res.status}: ${msg}`);
  }

  const sandboxes = data.sandboxes || [];
  const active = sandboxes.filter((s) => s.state === 'active');
  const other = sandboxes.filter((s) => s.state !== 'active');

  console.log('\nSandboxes you have access to:\n');
  console.log('Active sandboxes:');
  if (active.length === 0) {
    console.log('  (none)');
  } else {
    active.forEach((s) => {
      const def = s.isDefault ? ' [default]' : '';
      console.log(`  ${s.name} – ${s.title || s.name} (${s.type})${def}`);
    });
  }

  if (other.length > 0) {
    console.log('\nOther sandboxes (not active):');
    other.forEach((s) => {
      console.log(`  ${s.name} – ${s.title || s.name} (state: ${s.state})`);
    });
  }

  console.log(`\nTotal: ${active.length} active, ${sandboxes.length} total\n`);
}

listSandboxes().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
