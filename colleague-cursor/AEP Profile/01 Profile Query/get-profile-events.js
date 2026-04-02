#!/usr/bin/env node
/**
 * Query AEP Real-Time Customer Profile – experience events for a profile by email.
 * Uses the same Profile Access API with schema.name=experienceevent.
 *
 * Usage: node get-profile-events.js [email]
 * Example: node get-profile-events.js kirkham+media-1@adobetest.com
 */

import { getAuth, getConfig } from '../00 Adobe Auth/src/index.js';

const PROFILE_API_BASE = 'https://platform.adobe.io/data/core/ups/access/entities';

async function getProfileEventsByEmail(email) {
  const { token, config } = await getAuth();
  const cfg = getConfig();

  const params = new URLSearchParams({
    'schema.name': '_xdm.context.experienceevent',
    'relatedSchema.name': '_xdm.context.profile',
    relatedEntityId: email,
    relatedEntityIdNS: 'email',
    orderby: '-timestamp',
    limit: '500',
  });
  // Optional: add 'fields' to limit returned event fields
  // params.set('fields', 'timestamp,_id,commerce,productListItems,_demoemea');

  const url = `${PROFILE_API_BASE}?${params.toString()}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'x-api-key': cfg.clientId,
      'x-gw-ims-org-id': config.orgId,
      'x-sandbox-name': config.sandboxName,
    },
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg = data.message || data.error_description || data.title || res.statusText;
    throw new Error(`Profile API ${res.status}: ${msg}`);
  }

  return data;
}

// Event IDs we sent (mortgage + FSI cart) – used when --ours-only
const OUR_EVENT_IDS = new Set([
  'a1b2c3d4-e5f6-4789-a012-3mortgage001', 'a1b2c3d4-e5f6-4789-a012-3mortgage002', 'a1b2c3d4-e5f6-4789-a012-3mortgage003',
  'fsi-cart-001-add-savings', 'fsi-cart-002-add-insurance', 'fsi-cart-003-view-cart', 'fsi-cart-004-abandoned',
  'fsi-cart-005-add-current-account', 'fsi-cart-006-add-credit-card', 'fsi-cart-007-view-cart', 'fsi-cart-008-abandoned',
]);

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const oursOnly = process.argv.includes('--ours-only');
  const email = args[0] || 'kirkham+media-1@adobetest.com';
  if (!email) {
    console.error('Usage: node get-profile-events.js [email] [--ours-only] [--table]');
    process.exit(1);
  }

  console.error('Fetching experience events for:', email, oursOnly ? '(filtering to mortgage/FSI events only)' : '');
  const response = await getProfileEventsByEmail(email);

  let children = response.children || [];
  if (oursOnly) {
    children = children.filter((c) => {
      const eid = c.entity?._id || c.entityId;
      return eid && OUR_EVENT_IDS.has(String(eid));
    });
    console.error('Our events (mortgage/FSI) found:', children.length);
  }

  // Sort by timestamp descending (newest first)
  children.sort((a, b) => {
    const tsA = a.timestamp ?? (a.entity?.timestamp ? new Date(a.entity.timestamp).getTime() : 0);
    const tsB = b.timestamp ?? (b.entity?.timestamp ? new Date(b.entity.timestamp).getTime() : 0);
    return tsB - tsA;
  });

  // Add formatted date/time received to each event
  const events = children.map((c) => {
    const ts = c.timestamp ?? (c.entity?.timestamp ? new Date(c.entity.timestamp).getTime() : null);
    const dateTimeReceived = ts != null ? new Date(ts).toISOString() : null;
    return { ...c, dateTimeReceived };
  });

  const page = response._page || {};
  console.error('Events returned:', events.length, page.next ? '(more pages available)' : '');

  if (process.argv.includes('--table')) {
    const lastN = 20;
    const slice = events.slice(0, lastN);
    const col1 = 'DateTime Received';
    const col2 = 'Event Type';
    const col3 = 'Entity ID';
    const w1 = Math.max(col1.length, 28);
    const w2 = Math.max(col2.length, 45);
    const w3 = Math.max(col3.length, 40);
    const sep = `+${'-'.repeat(w1 + 2)}+${'-'.repeat(w2 + 2)}+${'-'.repeat(w3 + 2)}+`;
    console.log(`\nLast ${lastN} events for ${email}\n`);
    console.log(sep);
    console.log(`| ${col1.padEnd(w1)} | ${col2.padEnd(w2)} | ${col3.padEnd(w3)} |`);
    console.log(sep);
    slice.forEach((e, i) => {
      const dt = e.dateTimeReceived ?? '—';
      const et = e.entity?.eventType ?? '—';
      const id = (e.entityId ?? '').toString();
      const idShort = id.length > w3 ? id.slice(0, w3 - 3) + '...' : id;
      console.log(`| ${dt.padEnd(w1)} | ${(et || '—').padEnd(w2)} | ${idShort.padEnd(w3)} |`);
    });
    console.log(sep);
    console.log('');
  } else {
    console.log(JSON.stringify({ email, totalReturned: events.length, hasMore: !!page.next, events }, null, 2));
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
