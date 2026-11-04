import { runProfileReadbackAcceptance } from '../src/profileReadbackAcceptance.mjs';

const SANDBOX = String(process.env.PROFILE_ACCEPTANCE_SANDBOX || '').trim();
const INDUSTRY = String(process.env.PROFILE_ACCEPTANCE_INDUSTRY || '').trim().toLowerCase();
const EMAIL = String(process.env.PROFILE_ACCEPTANCE_EMAIL || '').trim();
const ECID = String(process.env.PROFILE_ACCEPTANCE_ECID || '').trim();
const GENERATED_AT = String(process.env.PROFILE_ACCEPTANCE_GENERATED_AT || '').trim();
const ALLOWED_INDUSTRIES = new Set(['travel', 'media', 'fsi']);

function required(name, value) {
  if (!value) throw new Error(`${name} is required.`);
}

required('PROFILE_ACCEPTANCE_SANDBOX', SANDBOX);
required('PROFILE_ACCEPTANCE_INDUSTRY', INDUSTRY);
required('PROFILE_ACCEPTANCE_EMAIL', EMAIL);
required('PROFILE_ACCEPTANCE_ECID', ECID);
required('PROFILE_ACCEPTANCE_GENERATED_AT', GENERATED_AT);

if (!ALLOWED_INDUSTRIES.has(INDUSTRY)) {
  throw new Error('PROFILE_ACCEPTANCE_INDUSTRY must be travel, media, or fsi.');
}
if (!/^\d{10,}$/.test(ECID)) throw new Error('PROFILE_ACCEPTANCE_ECID must be a numeric ECID.');
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(EMAIL)) throw new Error('PROFILE_ACCEPTANCE_EMAIL must be a valid email address.');

const apiOrigin = String(
  process.env.AEP_LAB_API_ORIGIN || 'https://aep-orchestration-lab.web.app',
).replace(/\/$/, '');

async function lookupProfile({ sandbox, namespace, identifier }) {
  const url = new URL('/api/profile/table', apiOrigin);
  url.searchParams.set('sandbox', sandbox);
  url.searchParams.set('namespace', namespace);
  url.searchParams.set('identifier', identifier);
  const response = await fetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(`${namespace} profile lookup returned non-JSON HTTP ${response.status}.`);
  }
  return { ok: response.ok, status: response.status, data };
}

try {
  const result = await runProfileReadbackAcceptance({
    sandbox: SANDBOX,
    industry: INDUSTRY,
    email: EMAIL,
    ecid: ECID,
    generatedAt: GENERATED_AT,
    slaSeconds: Number(process.env.PROFILE_ACCEPTANCE_SLA_SECONDS || 60),
    pollIntervalMs: Number(process.env.PROFILE_ACCEPTANCE_POLL_INTERVAL_MS || 5_000),
    lookupProfile,
  });
  console.log(JSON.stringify({ industry: INDUSTRY, sandbox: SANDBOX, ...result }, null, 2));
  if (!result.ok) process.exitCode = 1;
} catch (error) {
  console.error(`Profile readback acceptance failed: ${error.message}`);
  process.exitCode = 1;
}
