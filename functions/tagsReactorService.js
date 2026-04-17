/**
 * Adobe Experience Platform Tags — Reactor API probe (companies list).
 * Embed / Launch script URLs are created per environment in the Tags UI; full automation
 * requires additional Reactor endpoints (properties, hosts, libraries).
 */

async function probeTagsApiAccess(token, clientId, orgId) {
  const url = 'https://reactor.adobe.io/companies?page[size]=1';
  const headers = {
    Accept: 'application/vnd.api+json;revision=1',
    Authorization: `Bearer ${token}`,
    'x-api-key': clientId,
    'x-gw-ims-org-id': orgId,
  };
  const resp = await fetch(url, { method: 'GET', headers });
  const text = await resp.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (e) {
    data = { _parseError: String(e.message || e) };
  }

  if (resp.status === 401 || resp.status === 403) {
    return {
      ok: false,
      authorized: false,
      httpStatus: resp.status,
      hint:
        'Token cannot access Reactor (Tags). Add the Adobe Experience Platform Launch API product to your Adobe I/O project and extend ADOBE_SCOPES with the Launch/reactor scopes your org requires, then redeploy functions.',
      detail: text.slice(0, 400),
    };
  }

  if (!resp.ok) {
    return {
      ok: false,
      authorized: false,
      httpStatus: resp.status,
      detail: text.slice(0, 500),
    };
  }

  const list = Array.isArray(data.data) ? data.data : [];
  return {
    ok: true,
    authorized: true,
    companiesCount: list.length,
    hint:
      'Tags API is reachable. Create a property in Tags, add the AEP Web SDK extension, set the Edge Configuration ID to your datastream, then copy the Development environment embed code.',
  };
}

module.exports = { probeTagsApiAccess };
