'use strict';

const {
  PROFILE_STREAM_ROOT_PATH_PREFIXES,
  assignProfileStreamingAttributes,
  mirrorPreferredLanguageDemoSchema,
} = require('./profileStreamingCore');

const ALIASES = {
  'xdm:testProfile': 'testProfile',
  'consents.marketing.val': 'consents.marketing.any.val',
  'optInOut._channels.push': 'consents.marketing.push.val',
  'optInOut._channels.whatsapp': 'consents.marketing.whatsApp.val',
  'personalEmail.language': 'preferredLanguage',
  'preferences.preferredLanguage': 'preferredLanguage',
};

function leaves(value, path = '', out = []) {
  if (value && typeof value === 'object' && Object.keys(value).length) {
    for (const [key, child] of Object.entries(value)) {
      leaves(child, path ? `${path}.${key}` : key, out);
    }
  } else if (path) {
    out.push({ path, value });
  }
  return out;
}

function schemaNode(schema, path) {
  let node = schema;
  for (const key of path.split('.')) {
    if ((node?.$ref || node?.allOf || node?.oneOf || node?.anyOf) && !node.properties && !node.items) {
      throw new Error('Generation requires a fully resolved schema.');
    }
    if (node?.type === 'array') {
      if (!/^\d+$/.test(key)) return null;
      node = node.items;
    } else {
      node = node?.properties?.[key]
        || Object.entries(node?.patternProperties || {}).find(([pattern]) => new RegExp(pattern).test(key))?.[1]
        || (node?.additionalProperties === true ? { additionalProperties: true }
          : node?.additionalProperties || null);
    }
    if (!node || typeof node !== 'object') return null;
  }
  if ((node.$ref || node.allOf || node.oneOf || node.anyOf) && !node.properties && !node.items) {
    throw new Error('Generation requires a fully resolved schema.');
  }
  return node;
}

function read(object, path) {
  return path.split('.').reduce((value, key) => value?.[key], object);
}

function write(object, path, value) {
  const keys = path.split('.');
  let target = object;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!target[key] || typeof target[key] !== 'object') target[key] = /^\d+$/.test(keys[i + 1]) ? [] : {};
    target = target[key];
  }
  target[keys.at(-1)] = value;
}

function relativePath(path, xdmKey) {
  for (const prefix of [xdmKey, '_demoemea', 'demoemea', 'xdm:demoss']) {
    if (path.startsWith(`${prefix}.`)) return path.slice(prefix.length + 1);
  }
  return path;
}

function resolvePath(schema, path, xdmKey) {
  if (schemaNode(schema, path)) return path;
  const relative = relativePath(path, xdmKey);
  const rootFirst = PROFILE_STREAM_ROOT_PATH_PREFIXES.has(relative.split('.')[0])
    || relative.startsWith('consents.') || relative.startsWith('optInOut.');
  const candidates = rootFirst ? [relative, `${xdmKey}.${relative}`] : [`${xdmKey}.${relative}`, relative];
  return candidates.find(candidate => schemaNode(schema, candidate)) || null;
}

function consentAliasValue(path, value) {
  if (path.startsWith('optInOut._channels.')) {
    return { in: 'y', out: 'n', not_provided: 'u' }[String(value).toLowerCase()];
  }
  if (path === 'consents.marketing.val' && /^(y|n|p|u|dy|dn)$/i.test(String(value))) {
    return String(value).toLowerCase();
  }
  return value;
}

/**
 * Validate requested leaves against the resolved schema and project generated
 * compatibility mirrors away. Expectations use the exact paths/values sent.
 */
function alignGenerationWithSchema(entity, attributes, schema, xdmKey = '_demoemea') {
  if (!schema?.properties || typeof schema.properties !== 'object') {
    throw new Error('Resolved generation schema has no properties.');
  }
  const invalidPaths = [];
  const mappedPaths = [];
  const expected = {};
  for (const { path, value } of leaves(attributes)) {
    if (!path || path.split('.').some(key => ['__proto__', 'prototype', 'constructor'].includes(key))) {
      invalidPaths.push(path);
      continue;
    }
    const relative = relativePath(path, xdmKey);
    let target = resolvePath(schema, path, xdmKey);
    let next = value;
    if (!target) {
      const alias = ALIASES[relative];
      target = alias ? resolvePath(schema, alias, xdmKey) : null;
      if (target) next = consentAliasValue(relative, value);
    }
    if (!target || next === undefined) {
      invalidPaths.push(path);
      continue;
    }
    // Reuse streaming coercions for unchanged paths, including numeric leaves.
    if (relative === relativePath(target, xdmKey)) {
      const tenant = {};
      const roots = {};
      assignProfileStreamingAttributes(tenant, roots, { [relative]: value });
      mirrorPreferredLanguageDemoSchema(tenant, roots);
      const sent = relative.startsWith('profilePlaceContext.')
        ? read(entity, `${xdmKey}.${relative}`)
        : read(PROFILE_STREAM_ROOT_PATH_PREFIXES.has(relative.split('.')[0]) ? roots : tenant, relative);
      if (sent !== undefined) next = sent;
    }
    const node = schemaNode(schema, target);
    const types = Array.isArray(node.type) ? node.type : node.type ? [node.type] : [];
    const valueType = next === null ? 'null' : Array.isArray(next) ? 'array' : typeof next;
    const typeMatches = !types.length || types.includes(valueType)
      || (types.includes('integer') && Number.isInteger(next));
    if (!typeMatches || (node.enum && !node.enum.includes(next))) {
      invalidPaths.push(path);
      continue;
    }
    if (Object.hasOwn(expected, target) && JSON.stringify(expected[target]) !== JSON.stringify(next)) {
      invalidPaths.push(path);
      continue;
    }
    expected[target] = next;
    if (path !== target) mappedPaths.push({ from: path, to: target });
  }
  if (invalidPaths.length) return { ok: false, invalidPaths, mappedPaths };

  const adjusted = structuredClone(entity);
  for (const [path, value] of Object.entries(expected)) write(adjusted, path, value);
  const projected = {};
  const omittedPaths = [];
  for (const { path, value } of leaves(adjusted)) {
    if (schemaNode(schema, path)) write(projected, path, value);
    else omittedPaths.push(path);
  }
  for (const path of ['identityMap', `${xdmKey}.identification.core.email`, `${xdmKey}.identification.core.ecid`]) {
    if (JSON.stringify(read(projected, path)) !== JSON.stringify(read(entity, path))) invalidPaths.push(path);
  }
  for (const [namespace, leaf] of [['Email', 'email'], ['ECID', 'ecid']]) {
    const identity = projected.identityMap?.[namespace]?.[0]?.id;
    if (!identity || read(projected, `${xdmKey}.identification.core.${leaf}`) !== identity) {
      invalidPaths.push(`${xdmKey}.identification.core.${leaf}`);
    }
  }
  if ((entity.testProfile === true || entity['xdm:testProfile'] === true)
      && projected.testProfile !== true && projected['xdm:testProfile'] !== true) {
    invalidPaths.push('testProfile');
  }
  if (invalidPaths.length) return { ok: false, invalidPaths, mappedPaths };
  return { ok: true, entity: projected, persistenceAttributes: expected, mappedPaths, omittedPaths };
}

module.exports = { alignGenerationWithSchema };
