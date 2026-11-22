'use strict';

/**
 * "What's new → in progress": open pull requests for the lab repository,
 * refreshed every 30 minutes into Firestore and served from that cache.
 *
 * The repository is public, so the GitHub REST API is called without
 * credentials (60 requests/hour per egress IP is ample for a 30-minute
 * schedule plus a rare cold-cache refresh). If the repository ever becomes
 * private, add a defineSecret('GITHUB_READ_TOKEN') and pass it as `token`.
 */

const REPO = 'adampadobe/AEP-Orchestration-Lab';
const COLLECTION = 'labWhatsNew';
const DOC_ID = 'inProgress';
const MAX_ITEMS = 50;
const STALE_MS = 60 * 60000;
const MEMORY_CACHE_MS = 60000;

function sanitizePull(pull) {
  if (!pull || typeof pull !== 'object' || !Number.isInteger(pull.number) || typeof pull.title !== 'string') return null;
  const url = typeof pull.html_url === 'string' && pull.html_url.startsWith(`https://github.com/${REPO}/pull/`)
    ? pull.html_url : `https://github.com/${REPO}/pull/${pull.number}`;
  return {
    title: pull.title.slice(0, 300),
    number: pull.number,
    url,
    author: typeof pull.user?.login === 'string' ? pull.user.login : null,
    updatedAt: typeof pull.updated_at === 'string' ? pull.updated_at : null,
    draft: pull.draft === true,
    labels: (Array.isArray(pull.labels) ? pull.labels : [])
      .map((label) => (typeof label?.name === 'string' ? label.name : null)).filter(Boolean).slice(0, 10),
  };
}

async function fetchOpenPulls({ fetchImpl = fetch, token = null } = {}) {
  const url = `https://api.github.com/repos/${REPO}/pulls?state=open&sort=updated&direction=desc&per_page=${MAX_ITEMS}`;
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'aep-orchestration-lab-whats-new',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetchImpl(url, { headers, signal: controller.signal });
    if (!response.ok) {
      throw Object.assign(new Error(`GitHub pulls request failed with HTTP ${response.status}`), { code: `github-http-${response.status}` });
    }
    const body = await response.json();
    if (!Array.isArray(body)) throw Object.assign(new Error('GitHub pulls response was not a list'), { code: 'github-invalid' });
    return body.map(sanitizePull).filter(Boolean);
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch open PRs and cache them. Failures keep the previous items and record the error code. */
async function refreshInProgress({ db, fetchImpl, token, now = new Date(), logger = console }) {
  const ref = db.collection(COLLECTION).doc(DOC_ID);
  try {
    const items = await fetchOpenPulls({ fetchImpl, token });
    const record = { repo: REPO, items, fetchedAt: now.toISOString(), lastAttemptAt: now.toISOString(), lastError: null };
    await ref.set(record);
    return record;
  } catch (error) {
    logger.error('[whats-new] Unable to refresh open pull requests', { code: error.code || error.name || 'unknown' });
    await ref.set({ lastAttemptAt: now.toISOString(), lastError: error.code || 'refresh-failed' }, { merge: true });
    throw error;
  }
}

function publicSnapshot(record, now) {
  const fetchedAt = record?.fetchedAt || null;
  return {
    repo: REPO,
    fetchedAt,
    stale: !fetchedAt || now.getTime() - Date.parse(fetchedAt) > STALE_MS,
    items: Array.isArray(record?.items) ? record.items.map(sanitizeCached).filter(Boolean) : [],
  };
}

function sanitizeCached(item) {
  if (!item || !Number.isInteger(item.number) || typeof item.title !== 'string') return null;
  return {
    title: item.title, number: item.number, url: item.url, author: item.author ?? null,
    updatedAt: item.updatedAt ?? null, draft: item.draft === true, labels: Array.isArray(item.labels) ? item.labels : [],
  };
}

function registerWhatsNewRoutes({ onRequest, fnOpts, setCors, getDb, fetchImpl, logger = console, now = () => new Date() }) {
  let memory = null;
  function db() {
    if (getDb) return getDb();
    return require('./adminFirestore').getAdminFirestore();
  }
  return {
    labWhatsNewInProgress: onRequest(fnOpts, async (req, res) => {
      setCors(res, 'GET, OPTIONS');
      if (req.method === 'OPTIONS') return res.status(204).send('');
      if (req.method !== 'GET') {
        res.set('Allow', 'GET, OPTIONS');
        return res.status(405).json({ ok: false, error: 'Use GET for in-progress changes.' });
      }
      try {
        const current = now();
        if (memory && current.getTime() - memory.at < MEMORY_CACHE_MS) {
          res.set('Cache-Control', 'public, max-age=300');
          return res.status(200).json({ ok: true, ...memory.snapshot });
        }
        const store = db();
        let record = (await store.collection(COLLECTION).doc(DOC_ID).get()).data?.() || null;
        if (!record?.fetchedAt) {
          // Cold cache before the first scheduled run: refresh once inline.
          try { record = await refreshInProgress({ db: store, fetchImpl, now: current, logger }); } catch { /* reported below */ }
        }
        if (!record?.fetchedAt) return res.status(503).json({ ok: false, error: 'In-progress changes are not available yet. Retry shortly.' });
        const snapshot = publicSnapshot(record, current);
        memory = { at: current.getTime(), snapshot };
        res.set('Cache-Control', 'public, max-age=300');
        return res.status(200).json({ ok: true, ...snapshot });
      } catch (error) {
        logger.error('[whats-new] Unable to read in-progress changes', { code: error.code || 'unknown' });
        return res.status(503).json({ ok: false, error: 'In-progress changes are temporarily unavailable.' });
      }
    }),
  };
}

module.exports = {
  REPO, COLLECTION, DOC_ID, STALE_MS, sanitizePull, fetchOpenPulls, refreshInProgress, publicSnapshot, registerWhatsNewRoutes,
};
