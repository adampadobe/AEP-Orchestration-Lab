#!/usr/bin/env node
/**
 * verify-context7-coverage.mjs — pre-deploy probe for the Client Journey
 * Asset v2 service. Hits Context7's REST API for each of the six Adobe
 * Experience League topics the v2 system prompt expects, prints a short
 * coverage report, and exits non-zero if any of the five mandatory topics
 * (everything except Brand Concierge) returns nothing.
 *
 * Library IDs are now PINNED — Context7's fuzzy `search` endpoint resolves
 * several Adobe topics to wrong libraries (Polymarket, Commerce Optimizer,
 * GitHub Primer Brand…), so this probe goes straight to the pinned ID and
 * reports per-topic status:
 *   - OK       — pinned ID is set and the docs endpoint returned ≥100 chars.
 *   - FALLBACK — pinned ID is `null` (no usable Adobe library exists in
 *                Context7 today); the service uses STATIC_DOC_FALLBACKS.
 *   - FAIL     — pinned ID is set but the docs endpoint returned non-2xx
 *                or empty content. Investigate (the library may have been
 *                removed or renamed inside Context7).
 *
 * Usage:
 *   CONTEXT7_API_KEY=<key> npm run verify:context7-coverage
 *
 * The key is read ONLY from process.env. It is never written to a file or
 * echoed verbatim — the script prints a length + first-3 / last-3 character
 * fingerprint so the operator can confirm which key is in use without
 * exposing the secret.
 *
 * Endpoints used (per Context7 REST API docs):
 *   GET https://context7.com/api/v1/<libraryId>?type=txt&topic=<topic>&tokens=<n>
 *     → curated text snippets
 *
 * The call requires header: Authorization: Bearer <CONTEXT7_API_KEY>.
 */

const CONTEXT7_BASE = 'https://context7.com/api/v1';
const TOKEN_BUDGET = 1500;
const TIMEOUT_MS = 15_000;
const MIN_USEFUL_CHARS = 100;

/**
 * Topics + pinned Context7 library IDs.
 *
 * KEEP IN SYNC with `PINNED_LIBRARY_IDS` in
 * functions/clientJourneyAssetV2Service.js — duplicated here because this
 * script is ESM and the service is CommonJS, and the service pulls in
 * firebase-admin which we don't want to load just to probe.
 *
 * Convention:
 *   - string  → pin to that library ID; probe it directly.
 *   - null    → no usable Adobe library exists in Context7; the service
 *               routes this topic to its STATIC_DOC_FALLBACKS entry.
 *               Mandatory topics are still allowed to be `null` if we've
 *               deliberately decided the static summary is good enough.
 */
const TOPICS = [
  {
    id: 'rtcdp',
    query: 'Adobe Real-Time CDP overview',
    libraryId: '/websites/experienceleague_adobe_en_experience-platform',
    mandatory: true,
  },
  {
    id: 'ajo',
    query: 'Adobe Journey Optimizer essentials',
    libraryId: '/websites/experienceleague_adobe_en_experience-platform',
    mandatory: true,
  },
  {
    id: 'aiAgentic',
    query: 'Adobe Experience Cloud AI agentic features',
    libraryId: '/adobedocs/experience-manager-cloud-service.en',
    mandatory: true,
  },
  {
    id: 'cja',
    query: 'Adobe Customer Journey Analytics overview',
    libraryId: '/websites/developer_adobe_cja-apis_api',
    mandatory: true,
  },
  {
    id: 'destinations',
    query: 'Adobe Experience Platform Destinations',
    libraryId: '/websites/experienceleague_adobe_en_experience-platform',
    mandatory: true,
  },
  {
    id: 'brandConcierge',
    query: 'Adobe Brand Concierge overview',
    libraryId: null,
    mandatory: false,
  },
];

function fingerprint(key) {
  if (!key || key.length < 8) return '<too-short>';
  return `len=${key.length}, ${key.slice(0, 3)}…${key.slice(-3)}`;
}

function shortPreview(text, max = 200) {
  if (!text) return '';
  const t = String(text).replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

async function fetchWithTimeout(url, init = {}, timeoutMs = TIMEOUT_MS) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchSnippets(key, libraryId, topic) {
  const id = libraryId.startsWith('/') ? libraryId : `/${libraryId}`;
  const url =
    `${CONTEXT7_BASE}${id}` +
    `?type=txt&topic=${encodeURIComponent(topic)}&tokens=${TOKEN_BUDGET}`;
  const res = await fetchWithTimeout(url, {
    headers: { Authorization: `Bearer ${key}`, Accept: 'text/plain' },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`docs HTTP ${res.status}: ${shortPreview(body, 160)}`);
    err.httpStatus = res.status;
    throw err;
  }
  return res.text();
}

async function probe(key, topic) {
  const out = {
    id: topic.id,
    query: topic.query,
    mandatory: topic.mandatory,
    libraryId: topic.libraryId,
  };

  if (topic.libraryId === null) {
    out.status = 'FALLBACK';
    out.detail =
      'pinned to null — no Adobe library in Context7. Service uses STATIC_DOC_FALLBACKS.';
    return out;
  }

  try {
    const snippets = await fetchSnippets(key, topic.libraryId, topic.query);
    out.snippetChars = snippets.length;
    out.snippetPreview = shortPreview(snippets, 200);
    if (snippets.length < MIN_USEFUL_CHARS) {
      out.status = 'FAIL';
      out.detail =
        `docs endpoint returned only ${snippets.length} chars (< ${MIN_USEFUL_CHARS}). ` +
        `Investigate — the pinned library may not cover this topic any more.`;
      return out;
    }
    out.status = 'OK';
    return out;
  } catch (err) {
    out.status = 'FAIL';
    out.detail =
      `${String(err.message || err)} — investigate; the pinned library may have ` +
      `been removed or renamed in Context7.`;
    if (err.httpStatus) out.httpStatus = err.httpStatus;
    return out;
  }
}

async function main() {
  const key = process.env.CONTEXT7_API_KEY || '';
  if (!key) {
    console.error('ERROR: CONTEXT7_API_KEY is not set in the environment.');
    console.error('Try: CONTEXT7_API_KEY=<key> npm run verify:context7-coverage');
    process.exit(2);
  }
  console.log(`Context7 key fingerprint: ${fingerprint(key)}`);
  console.log(`Token budget per topic:    ${TOKEN_BUDGET}`);
  console.log('Library IDs are PINNED (no fuzzy /search) — see top-of-file comment.');
  console.log('');

  const results = await Promise.all(TOPICS.map((t) => probe(key, t)));

  let mandatoryFailures = 0;
  for (const r of results) {
    const tag =
      r.status === 'OK'       ? '[OK]'       :
      r.status === 'FALLBACK' ? '[FALLBACK]' :
      r.status === 'FAIL'     ? '[FAIL]'     :
                                '[?]';
    const flag = r.mandatory ? '*' : ' ';
    console.log(`${flag} ${tag.padEnd(11)} ${r.id.padEnd(15)} "${r.query}"`);
    console.log(`              libraryId: ${r.libraryId === null ? '<null — static summary>' : r.libraryId}`);
    if (r.snippetChars !== undefined) {
      console.log(`              snippet chars: ${r.snippetChars}`);
      if (r.snippetPreview) console.log(`              preview: "${r.snippetPreview}"`);
    }
    if (r.detail) console.log(`              detail: ${r.detail}`);
    console.log('');
    // Mandatory FAIL → block. Mandatory FALLBACK is allowed (deliberate
    // decision). Non-mandatory anything is fine.
    if (r.mandatory && r.status === 'FAIL') mandatoryFailures++;
  }

  const fallbackCount = results.filter((r) => r.status === 'FALLBACK').length;
  console.log(`Summary: ${results.length} topics — ` +
    `OK=${results.filter((r) => r.status === 'OK').length}, ` +
    `FALLBACK=${fallbackCount}, ` +
    `FAIL=${results.filter((r) => r.status === 'FAIL').length}`);
  console.log(`Mandatory topics that FAILED (blocking): ${mandatoryFailures}`);
  if (mandatoryFailures === 0) {
    console.log(
      'All mandatory topics resolved. ' +
      (fallbackCount > 0
        ? `${fallbackCount} topic(s) are deliberately routed to STATIC_DOC_FALLBACKS in clientJourneyAssetV2Service.js — change pinned ID to a string when an Adobe-owned library appears in Context7.`
        : 'No fallbacks in use.')
    );
  } else {
    console.log(
      'Some mandatory topics returned nothing usable. The service WILL still ' +
      'work via STATIC_DOC_FALLBACKS, but the pinned library may need ' +
      'updating before the next deploy. Investigate the [FAIL] rows above.'
    );
  }

  process.exit(mandatoryFailures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`Unhandled error: ${err && err.stack || err}`);
  process.exit(3);
});
