/**
 * Example: Node 18+ (global fetch). Set env vars then:
 *   node example-send.mjs
 *
 * AEP_BEARER_TOKEN — required
 * AEP_CLIENT_ID — OAuth client id (used as x-api-key on Edge); required for Edge presets
 * AEP_ORG_ID — IMS org @ AdobeID; required for Edge presets
 * AEP_EVENT_PRESET_ID — optional; default edge-46677-donation
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  sendGeneratorEvent,
  loadPresetsFromFile,
  resolvePreset,
} from './send-aep-event.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const token = process.env.AEP_BEARER_TOKEN || '';
const clientId = process.env.AEP_CLIENT_ID || '';
const orgId = process.env.AEP_ORG_ID || '';
const presetId = process.env.AEP_EVENT_PRESET_ID || 'edge-46677-donation';

const presets = loadPresetsFromFile(join(__dirname, 'event-generator-targets.json'));
const preset = resolvePreset(presets, presetId);
if (!preset) {
  console.error('No preset found. Check event-generator-targets.json');
  process.exit(1);
}

const body = {
  email: process.env.AEP_TEST_EMAIL || 'demo@example.com',
  eventType: 'donation.made',
  viewName: 'Donate',
  viewUrl: 'https://example.org/donate',
  channel: 'Web',
  public: {
    donationAmount: Number(process.env.AEP_TEST_AMOUNT || 10),
    donationDate: process.env.AEP_TEST_DATE || new Date().toISOString().slice(0, 10),
  },
};
if (process.env.AEP_TEST_ECID) body.ecid = process.env.AEP_TEST_ECID;

const result = await sendGeneratorEvent(body, { token, clientId, orgId }, preset);
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
