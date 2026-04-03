#!/usr/bin/env node
/**
 * UAT helper for Consent Manager streaming (no browser).
 *
 * 1) GET profile via deployed /api/profile/consent
 * 2) POST /api/profile/update with dryRun:true (needs dataset + schema in env)
 * 3) Optional live POST when STREAM_URL + STREAM_FLOW_ID + profile ECID and --send
 *
 * Usage:
 *   node scripts/consent-stream-uat.mjs \
 *     --email 'adamp.adobedemo+130625-85@gmail.com' \
 *     --sandbox apalmer \
 *     --dry-run
 *
 * Env (for dry-run / send):
 *   CONSENT_UAT_BASE_URL   default https://aep-decision-lab-adamp-2026.web.app
 *   STREAM_DATASET_ID
 *   STREAM_SCHEMA_ID       full schema $id URI
 *   STREAM_URL             DCS collection URL — required for --send
 *   STREAM_FLOW_ID         HTTP API flow UUID — required for --send
 *
 * Shell: if you paste examples into zsh, keep the leading # on comment lines.
 *        A line like "Live send (note)" without # is parsed as a subshell and errors near ).
 */

const BASE = process.env.CONSENT_UAT_BASE_URL || 'https://aep-decision-lab-adamp-2026.web.app';

function arg(name, def = '') {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
  return def;
}

const email = arg('--email', process.env.CONSENT_UAT_EMAIL || '');
const sandbox = arg('--sandbox', process.env.CONSENT_UAT_SANDBOX || 'apalmer');
const doDry = process.argv.includes('--dry-run') || process.argv.includes('-n');
const doSend = process.argv.includes('--send');

const datasetId = process.env.STREAM_DATASET_ID || '';
const schemaId = process.env.STREAM_SCHEMA_ID || '';
const streamUrl = process.env.STREAM_URL || '';
const streamFlowId = process.env.STREAM_FLOW_ID || '';

/** Mirrors consent.js consentFormToStreamingUpdates() for a deterministic “toggle once” test. */
function sampleUpdates() {
  const marketingNow = new Date().toISOString();
  const chReason = 'Profile streaming default';
  const channelYn = 'y';
  const preferred = 'email';
  const preferredLanguage = 'en-GB';
  const val = 'y';
  const paths = [
    'email',
    'sms',
    'push',
    'call',
    'whatsApp',
    'fax',
    'postalMail',
    'commercialEmail',
  ];
  const updates = [
    { path: 'consents.marketing.val', value: val },
    { path: 'consents.marketing.any.val', value: val },
    { path: 'consents.marketing.any.reason', value: chReason },
    { path: 'consents.marketing.any.time', value: marketingNow },
    { path: 'consents.marketing.preferred', value: preferred },
    { path: 'consents.marketing.preferredLanguage', value: preferredLanguage },
    { path: 'person.name.firstName', value: 'Amanda' },
    { path: 'person.name.lastName', value: 'Johnson' },
    { path: 'person.name.fullName', value: 'Amanda Johnson' },
  ];
  for (const p of paths) {
    updates.push(
      { path: `consents.marketing.${p}.val`, value: channelYn },
      { path: `consents.marketing.${p}.reason`, value: chReason },
      { path: `consents.marketing.${p}.time`, value: marketingNow },
    );
  }
  updates.push(
    { path: 'consents.collect.val', value: 'y' },
    { path: 'consents.share.val', value: 'y' },
    { path: 'consents.personalize.content.val', value: 'y' },
  );
  const channels = {
    email: 'in',
    sms: 'in',
    push: 'in',
    phone: 'in',
    directMail: 'in',
    whatsapp: 'in',
    facebookFeed: 'not_provided',
    web: 'not_provided',
    mobileApp: 'not_provided',
    twitterFeed: 'not_provided',
  };
  for (const [k, v] of Object.entries(channels)) {
    updates.push({ path: `optInOut._channels.${k}`, value: v });
  }
  return updates;
}

async function main() {
  if (!email) {
    console.error('Missing --email or CONSENT_UAT_EMAIL');
    process.exit(1);
  }

  const q = new URLSearchParams({
    identifier: email,
    namespace: 'email',
    email,
    sandbox,
  });
  console.log('--- GET profile', `${BASE}/api/profile/consent?…`);
  const g = await fetch(`${BASE}/api/profile/consent?${q}`);
  const profile = await g.json();
  if (!g.ok) {
    console.error('Profile GET failed', g.status, profile);
    process.exit(1);
  }
  console.log('found:', profile.found, 'email:', profile.email, 'ecid:', profile.ecid);
  if (profile.found) {
    console.log('marketingConsent:', profile.marketingConsent, 'channels sample:', {
      email: profile.channels?.email,
      sms: profile.channels?.sms,
    });
  }

  if (!doDry && !doSend) {
    console.log('\nPass --dry-run (needs STREAM_DATASET_ID + STREAM_SCHEMA_ID) or --send (+ STREAM_URL + STREAM_FLOW_ID).');
    return;
  }

  if (!datasetId || !schemaId) {
    console.error('Set STREAM_DATASET_ID and STREAM_SCHEMA_ID for dry-run / send.');
    process.exit(1);
  }

  const body = {
    email,
    ...(profile.ecid ? { ecid: profile.ecid } : {}),
    updates: sampleUpdates(),
    sandbox,
    streaming: {
      url: streamUrl,
      flowId: streamFlowId,
      datasetId,
      schemaId,
      xdmKey: '_demoemea',
    },
  };

  if (doDry) {
    body.dryRun = true;
    console.log('\n--- POST profile/update dryRun');
    const r = await fetch(`${BASE}/api/profile/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok || !data.ok) {
      console.error('dryRun failed', r.status, data);
      process.exit(1);
    }
    const ent = data.envelope?.body?.xdmEntity;
    console.log('ok payloadFormat', data.payloadFormat, 'streamPayloadProfile', data.streamPayloadProfile);
    console.log('xdmEntity keys:', ent && Object.keys(ent));
    console.log('identityMap:', ent?.identityMap ? 'yes' : 'no', 'demoemea mirror:', ent?.demoemea ? 'yes' : 'no');
    console.log('envelope bytes:', JSON.stringify(data.envelope).length);
  }

  if (doSend) {
    if (!profile.ecid || String(profile.ecid).trim().length < 10) {
      console.error('--send requires profile ECID from Step 1 / GET consent (Profile Viewer parity).');
      process.exit(1);
    }
    if (!streamUrl || !streamFlowId) {
      console.error('--send requires STREAM_URL and STREAM_FLOW_ID');
      process.exit(1);
    }
    delete body.dryRun;
    console.log('\n--- POST profile/update LIVE');
    const r2 = await fetch(`${BASE}/api/profile/update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data2 = await r2.json();
    console.log('status', r2.status, 'message:', data2.message || data2.error);
    if (!r2.ok) {
      console.error(JSON.stringify(data2, null, 2).slice(0, 4000));
      process.exit(1);
    }
    console.log('Re-query profile in ~30–120s; UPS merge can lag.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
