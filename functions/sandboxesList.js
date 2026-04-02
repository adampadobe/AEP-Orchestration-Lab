const SANDBOX_MANAGEMENT_BASE = 'https://platform.adobe.io/data/foundation/sandbox-management';

/**
 * @returns {Promise<{ name: string, title: string, type: string }[]>}
 */
async function listActiveSandboxes(token, clientId, orgId) {
  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
    'x-api-key': clientId,
    'x-gw-ims-org-id': orgId,
  };
  const all = [];
  let offset = 0;
  const limit = 100;
  for (;;) {
    const url = `${SANDBOX_MANAGEMENT_BASE}/?limit=${limit}&offset=${offset}`;
    const apiRes = await fetch(url, { method: 'GET', headers });
    const data = await apiRes.json().catch(() => ({}));
    if (!apiRes.ok) {
      const msg = data.message || data.error_description || apiRes.statusText;
      throw new Error(msg || `Sandbox API ${apiRes.status}`);
    }
    const batch = data.sandboxes || [];
    all.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }
  return all
    .filter((s) => s.state === 'active')
    .map((s) => ({ name: s.name, title: s.title || s.name, type: s.type || '' }));
}

module.exports = { listActiveSandboxes };
