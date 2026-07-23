'use strict';

const { createHash } = require('node:crypto');
const admin = require('firebase-admin');
const liveActivityCore = require('./liveActivityCore');
const labUserSandboxStore = require('./labUserSandboxStore');

const COLLECTION = 'liveActivityTemplates';
const LEGACY_KEY = 'aepLaPayloadTemplatesV1';
const BUILTIN_RTDB_PATH = 'profileViewerConfig/liveActivitiesPostmanCollection';
const BUILTIN_FALLBACK_URL =
  'https://aep-orchestration-lab.web.app/profile-viewer/data/live-activities.postman_collection.json';
const BUILTIN_CACHE_MS = 5 * 60 * 1000;

let db;
let builtinCache = { fetchedAt: 0, templates: [] };

function getDb() {
  if (!admin.apps.length) admin.initializeApp();
  if (!db) db = admin.firestore();
  return db;
}

function normalizeSandbox(value) {
  return String(value || '').trim().toLowerCase().slice(0, 120);
}

function slug(value, fallback = 'template') {
  const out = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return out || fallback;
}

function customTemplateId(value, name) {
  const requested = String(value || '').trim();
  if (requested) {
    const clean = requested.startsWith('la-custom-') ? requested : `la-custom-${slug(requested)}`;
    return clean.slice(0, 120);
  }
  return `la-custom-${slug(name)}-${Date.now()}`;
}

function docId(uid, sandbox, templateId) {
  return createHash('sha256').update(`${uid}:${sandbox}:${templateId}`).digest('hex').slice(0, 40);
}

function walkPostman(items, groups, out) {
  (Array.isArray(items) ? items : []).forEach((node) => {
    if (Array.isArray(node?.item)) {
      walkPostman(node.item, groups.concat(String(node.name || '').trim()).filter(Boolean), out);
      return;
    }
    if (node?.request?.body?.mode !== 'raw') return;
    const raw = String(node.request.body.raw || '').replace(/^\uFEFF/, '').trim();
    if (!raw) return;
    const name = groups.concat(String(node.name || 'Request').trim()).filter(Boolean).join(' — ');
    out.push({ name, json: raw });
  });
}

function builtinTemplatesFromCollection(collection) {
  const flat = [];
  walkPostman(collection?.item, [], flat);
  const bodies = new Set();
  const ids = new Set();
  const result = [];
  flat.forEach((entry, index) => {
    const normalized = entry.json.replace(/\s+/g, ' ').trim();
    if (bodies.has(normalized)) return;
    bodies.add(normalized);
    const base = `la-builtin-${slug(entry.name.replace(/\s*—\s*/g, ' '), `request-${index}`)}`;
    let id = base;
    let suffix = 2;
    while (ids.has(id)) {
      id = `${base}-${suffix}`;
      suffix += 1;
    }
    ids.add(id);
    try {
      const body = liveActivityCore.validateTemplateBody(entry.json);
      result.push({
        id,
        name: entry.name,
        customer: String(entry.name.split('—')[0] || 'Built-in').trim(),
        description: 'Built-in Live Activity template',
        source: 'builtin',
        readOnly: true,
        body,
        variableDefinitions: [],
      });
    } catch (e) {
      console.warn('[liveActivity] skipped invalid built-in template', entry.name, e.message || e);
    }
  });
  return result;
}

async function loadBuiltinCollection() {
  if (Date.now() - builtinCache.fetchedAt < BUILTIN_CACHE_MS && builtinCache.templates.length) {
    return builtinCache.templates;
  }
  let collection = null;
  try {
    if (!admin.apps.length) admin.initializeApp();
    const snap = await admin.database().ref(BUILTIN_RTDB_PATH).once('value');
    collection = snap.val();
  } catch (e) {
    console.warn('[liveActivity] RTDB template read failed:', e.message || e);
  }
  if (!collection || !Array.isArray(collection.item)) {
    const response = await fetch(BUILTIN_FALLBACK_URL);
    if (!response.ok) throw new Error(`built-in template fallback HTTP ${response.status}`);
    collection = await response.json();
  }
  const templates = builtinTemplatesFromCollection(collection);
  builtinCache = { fetchedAt: Date.now(), templates };
  return templates;
}

function serializeCustom(doc) {
  const data = doc?.data ? doc.data() : doc;
  return {
    id: String(data.id || ''),
    name: String(data.name || ''),
    customer: String(data.customer || ''),
    description: String(data.description || ''),
    source: String(data.source || 'user'),
    readOnly: false,
    body: data.body,
    variableDefinitions: Array.isArray(data.variableDefinitions) ? data.variableDefinitions : [],
    version: Number(data.version || 1),
    updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt || null,
  };
}

async function readLegacyTemplates(uid, sandbox) {
  const keys = await labUserSandboxStore.getLabKeys(uid, sandbox);
  let rows = [];
  try {
    rows = JSON.parse(keys[LEGACY_KEY] || '[]');
  } catch {
    rows = [];
  }
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => {
      const tag = normalizeSandbox(row?.savedInSandbox);
      return row && (!tag || tag === sandbox);
    })
    .map((row) => {
      try {
        return {
          id: customTemplateId(row.id, row.name),
          name: String(row.name || row.id || 'Saved template').slice(0, 160),
          customer: String(row.customer || 'My templates').slice(0, 120),
          description: 'Saved from the Live Activities page',
          source: 'legacy',
          readOnly: false,
          body: liveActivityCore.validateTemplateBody(row.json || row.body),
          variableDefinitions: [],
          version: 1,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

async function listTemplates(uid, sandboxInput) {
  const sandbox = normalizeSandbox(sandboxInput);
  if (!uid || !sandbox) throw Object.assign(new Error('uid and sandbox are required'), { status: 400 });
  const [builtins, customSnap, legacy] = await Promise.all([
    loadBuiltinCollection(),
    getDb().collection(COLLECTION).where('principalUid', '==', String(uid)).get(),
    readLegacyTemplates(uid, sandbox),
  ]);
  const custom = customSnap.docs
    .filter((doc) => normalizeSandbox(doc.data()?.sandbox) === sandbox)
    .map(serializeCustom);
  const merged = new Map();
  [...builtins, ...legacy, ...custom].forEach((row) => merged.set(row.id, row));
  return [...merged.values()].sort((a, b) => {
    if (a.source === 'builtin' && b.source !== 'builtin') return -1;
    if (a.source !== 'builtin' && b.source === 'builtin') return 1;
    return `${a.customer} ${a.name}`.localeCompare(`${b.customer} ${b.name}`);
  });
}

async function getTemplate(uid, sandbox, templateId) {
  const templates = await listTemplates(uid, sandbox);
  return templates.find((row) => row.id === String(templateId || '').trim()) || null;
}

async function mirrorLegacyTemplate(uid, sandbox, template) {
  const keys = await labUserSandboxStore.getLabKeys(uid, sandbox);
  let rows = [];
  try {
    rows = JSON.parse(keys[LEGACY_KEY] || '[]');
  } catch {
    rows = [];
  }
  if (!Array.isArray(rows)) rows = [];
  const next = rows.filter((row) => String(row?.id || '') !== template.id);
  next.push({
    id: template.id,
    name: template.name,
    customer: template.customer,
    json: JSON.stringify(template.body, null, 2),
    savedInSandbox: sandbox,
  });
  await labUserSandboxStore.mergeLabKeys(uid, sandbox, { [LEGACY_KEY]: JSON.stringify(next) });
}

async function upsertTemplate(uid, sandboxInput, input) {
  const sandbox = normalizeSandbox(sandboxInput);
  const name = String(input?.name || '').trim().slice(0, 160);
  const customer = String(input?.customer || '').trim().slice(0, 120);
  if (!uid || !sandbox || !name || !customer) {
    throw Object.assign(new Error('uid, sandbox, customer, and name are required'), { status: 400 });
  }
  const id = customTemplateId(input.id, name);
  if (id.startsWith('la-builtin-') || id.startsWith('la-example-')) {
    throw Object.assign(new Error('built-in and example template IDs are read-only'), { status: 400 });
  }
  const body = liveActivityCore.validateTemplateBody(input.body || input.json);
  const variableDefinitions = liveActivityCore.normalizeVariableDefinitions(
    input.variableDefinitions || input.requiredVariables,
  );
  const ref = getDb().collection(COLLECTION).doc(docId(uid, sandbox, id));
  const previous = await ref.get();
  const previousData = previous.exists ? previous.data() || {} : {};
  const record = {
    id,
    principalUid: String(uid).slice(0, 128),
    sandbox,
    customer,
    name,
    description: String(input.description || '').trim().slice(0, 1000),
    source: String(input.source || 'mcp').trim().slice(0, 40),
    body,
    variableDefinitions,
    version: Number(previousData.version || 0) + 1,
    createdAt: previousData.createdAt || admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (input.validateOnly === true) {
    return {
      id,
      name,
      customer,
      description: record.description,
      source: record.source,
      readOnly: false,
      body,
      variableDefinitions,
      version: record.version,
      updatedAt: null,
      validated: true,
      persisted: false,
      wouldCreate: !previous.exists,
    };
  }
  await ref.set(record);
  const result = serializeCustom(record);
  await mirrorLegacyTemplate(uid, sandbox, result);
  return result;
}

async function deleteTemplate(uid, sandboxInput, templateId) {
  const sandbox = normalizeSandbox(sandboxInput);
  const id = String(templateId || '').trim();
  if (!uid || !sandbox || !id || id.startsWith('la-builtin-') || id.startsWith('la-example-')) {
    throw Object.assign(new Error('a custom template ID is required'), { status: 400 });
  }
  await getDb().collection(COLLECTION).doc(docId(uid, sandbox, id)).delete();
  const keys = await labUserSandboxStore.getLabKeys(uid, sandbox);
  let rows = [];
  try {
    rows = JSON.parse(keys[LEGACY_KEY] || '[]');
  } catch {
    rows = [];
  }
  const next = (Array.isArray(rows) ? rows : []).filter((row) => String(row?.id || '') !== id);
  await labUserSandboxStore.mergeLabKeys(uid, sandbox, { [LEGACY_KEY]: JSON.stringify(next) });
  return { id, deleted: true };
}

module.exports = {
  COLLECTION,
  LEGACY_KEY,
  builtinTemplatesFromCollection,
  listTemplates,
  getTemplate,
  upsertTemplate,
  deleteTemplate,
};
