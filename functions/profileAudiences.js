const { fetchUpsProfileEntities } = require('./profileTableHelpers');

const AUDIENCES_BASE = 'https://platform.adobe.io/data/core/ups/audiences';

async function getAudienceNameById(id, sandboxName, token, clientId, orgId) {
  const url = `${AUDIENCES_BASE}/${id}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-api-key': clientId,
      'x-gw-ims-org-id': orgId,
      'x-sandbox-name': sandboxName,
      Accept: 'application/json',
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return id;
  return data.name || data.audienceId || id;
}

/**
 * @returns {Promise<{ email: string, realized: object[], exited: object[] }>}
 */
async function buildAudiencesPayload(email, sandboxName, token, clientId, orgId) {
  const response = await fetchUpsProfileEntities(email, sandboxName, token, clientId, orgId);
  const keys = Object.keys(response || {}).filter((k) => !k.startsWith('_'));
  if (keys.length === 0) return { email, realized: [], exited: [] };
  const entityPayload = response[keys[0]];
  const entity = entityPayload?.entity ?? entityPayload;
  const segmentMembership = entity?.segmentMembership?.ups ?? entity?.segmentMembership ?? {};
  const entries = Object.entries(segmentMembership);
  const realized = [];
  const exited = [];
  const namePromises = entries.map(([segmentId]) => getAudienceNameById(segmentId, sandboxName, token, clientId, orgId));
  const names = await Promise.all(namePromises);
  entries.forEach(([segmentId, info], i) => {
    const status = info?.status ?? 'realized';
    const lastQualificationTime = info?.lastQualificationTime ?? null;
    const item = { segmentId, name: names[i], lastQualificationTime };
    if (status === 'realized') realized.push(item);
    else exited.push(item);
  });
  const sortByTime = (a, b) => {
    const ta = a.lastQualificationTime ? new Date(a.lastQualificationTime).getTime() : 0;
    const tb = b.lastQualificationTime ? new Date(b.lastQualificationTime).getTime() : 0;
    return tb - ta;
  };
  realized.sort(sortByTime);
  exited.sort(sortByTime);
  return { email, realized, exited };
}

module.exports = { buildAudiencesPayload };
