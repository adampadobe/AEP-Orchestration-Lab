#!/usr/bin/env node
/**
 * Query AEP Real-Time Customer Profile by email identity.
 * Uses auth from ../00 Adobe Auth. Lists all attributes on the profile.
 *
 * Usage: node get-profile-by-email.js <email>
 * Example: node get-profile-by-email.js kirkham+media-1@adobetest.com
 */

import { getAuth, getConfig } from '../00 Adobe Auth/src/index.js';

const PROFILE_API_BASE = 'https://platform.adobe.io/data/core/ups/access/entities';

async function getProfileByEmail(email) {
  const { token, config } = await getAuth();
  const cfg = getConfig();

  const params = new URLSearchParams({
    'schema.name': '_xdm.context.profile',
    entityId: email,
    entityIdNS: 'email',
  });
  // Omit 'fields' so the API returns all profile attributes

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

/**
 * Recursively collect all leaf attribute paths from an object (dot notation).
 */
function listAttributePaths(obj, prefix = '') {
  const paths = [];
  if (obj === null || typeof obj !== 'object') {
    if (prefix) paths.push(prefix);
    return paths;
  }
  if (Array.isArray(obj)) {
    paths.push(prefix || '(array)');
    return paths;
  }
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length > 0) {
      paths.push(...listAttributePaths(value, path));
    } else {
      paths.push(path);
    }
  }
  return paths;
}

async function main() {
  const email = process.argv[2] || 'kirkham+media-1@adobetest.com';
  if (!email || email.startsWith('-')) {
    console.error('Usage: node get-profile-by-email.js <email>');
    process.exit(1);
  }

  console.error('Querying AEP Profile for:', email);
  const response = await getProfileByEmail(email);

  // Response is keyed by entity id (opaque); we want the first (and usually only) entity
  const keys = Object.keys(response).filter((k) => !k.startsWith('_'));
  if (keys.length === 0) {
    console.log('No profile found for this identity.');
    process.exit(0);
  }

  const entityId = keys[0];
  const entityPayload = response[entityId];
  const entity = entityPayload?.entity ?? entityPayload;

  if (!entity || (typeof entity === 'object' && Object.keys(entity).length === 0)) {
    console.log('Profile found but has no attributes (empty entity).');
    console.log(JSON.stringify(response, null, 2));
    process.exit(0);
  }

  const attributes = listAttributePaths(entity).sort();
  console.log('\n--- Profile attributes ---\n');
  attributes.forEach((path) => console.log(path));
  console.log('\n--- Full profile entity (JSON) ---\n');
  console.log(JSON.stringify(entity, null, 2));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
