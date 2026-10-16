import { createHash } from 'node:crypto';
import { open, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const BASE = 'https://aep-orchestration-lab.web.app';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TEXT_FIELDS = new Set(['agentScript', 'briefMessage', 'compactDescription', 'compactSubtitle',
  'compactTitle', 'fullCTA', 'title', 'fullDescription', 'fullSubtitle']);
const OPERATORS = new Set(['eq', 'in', 'gt', 'gte', 'lt', 'lte']);
const SYMBOLS = { eq: '=', gt: '>', gte: '>=', lt: '<', lte: '<=' };

function requireValue(ok, message) {
  if (!ok) throw new Error(message);
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  }
  return value;
}

export function fingerprint(value) {
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}

function conditions(rule, fields) {
  requireValue(rule && ['and', 'or'].includes(rule.operator), 'Rule operator must be and or or');
  requireValue(Array.isArray(rule.conditions) && rule.conditions.length >= 1 && rule.conditions.length <= 2,
    'Every rule must use one or two conditions');
  for (const c of rule.conditions) {
    const type = fields.get(c.path);
    requireValue(type && OPERATORS.has(c.op), `Unknown rule field or operator: ${c.path}`);
    const values = c.op === 'in' ? c.value : [c.value];
    requireValue(Array.isArray(values) && values.length > 0, `Empty values for ${c.path}`);
    requireValue(values.every(v => typeof v === type && (type !== 'number' || Number.isFinite(v))),
      `Rule value type mismatch: ${c.path}`);
    requireValue(type === 'number' || ['eq', 'in'].includes(c.op), `Non-numeric comparison: ${c.path}`);
  }
  return rule.conditions;
}

function pql(rule, fields) {
  return conditions(rule, fields).map(c => {
    if (fields.get(c.path) === 'string') {
      return c.op === 'in'
        ? `stringCompare("equals", ${c.path}, ${JSON.stringify(c.value)}, false)`
        : `${c.path}.equals(${JSON.stringify(c.value)}, false)`;
    }
    if (c.op === 'in') return `(${c.value.map(v => `${c.path} = ${JSON.stringify(v)}`).join(' or ')})`;
    return `${c.path} ${SYMBOLS[c.op]} ${JSON.stringify(c.value)}`;
  }).map(text => `(${text})`).join(` ${rule.operator} `);
}

function matches(rule, attributes) {
  const tests = rule.conditions.map(c => {
    const actual = attributes[c.path];
    if (actual === undefined) return false;
    const norm = v => typeof v === 'string' ? v.toLowerCase() : v;
    switch (c.op) {
      case 'eq': return norm(actual) === norm(c.value);
      case 'in': return c.value.some(v => norm(v) === norm(actual));
      case 'gt': return actual > c.value;
      case 'gte': return actual >= c.value;
      case 'lt': return actual < c.value;
      case 'lte': return actual <= c.value;
      default: throw new Error(`Unknown operator ${c.op}`);
    }
  });
  return rule.operator === 'and' ? tests.every(Boolean) : tests.some(Boolean);
}

export function evaluateScenario(plan, attributes) {
  for (const objective of plan.objectives) {
    if (!matches(objective.rule, attributes)) continue;
    const offer = [...objective.offers].sort((a, b) => b.priority - a.priority)
      .find(item => !item.rule || matches(item.rule, attributes));
    if (offer) return { objective: objective.key, offer: offer.key };
  }
  return { objective: null, offer: null };
}

export function compilePlan(plan) {
  requireValue(plan.version === 1 && plan.sandbox === 'kirkham', 'Version 1 plans target kirkham only');
  requireValue(typeof plan.customer === 'string' && plan.customer.trim(), 'customer is required');
  requireValue(/^_[A-Za-z][A-Za-z0-9]*$/.test(plan.tenant), 'Verified tenant key is required');
  requireValue(typeof plan.schemaId === 'string' && plan.schemaId.startsWith('https://ns.adobe.com/'),
    'Verified offer schemaId is required');
  requireValue(typeof plan.catalogId === 'string' && plan.catalogId.startsWith('xcore:decision-catalog:'),
    'Verified catalogId is required');
  requireValue(typeof plan.collectionTemplateId === 'string' && plan.collectionTemplateId,
    'A live tag-based collectionTemplateId is required');
  requireValue(typeof plan.profileSchemaId === 'string' && plan.profileSchemaId.startsWith('https://ns.adobe.com/'),
    'Verified Operational Profile schema ID is required');
  requireValue(Array.isArray(plan.profileFields) && plan.profileFields.length > 0, 'profileFields are required');
  const fields = new Map();
  for (const f of plan.profileFields) {
    requireValue(typeof f.path === 'string' && /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)+$/.test(f.path),
      `Invalid profile path: ${f.path}`);
    requireValue(!f.path.startsWith('_') || f.path.startsWith(`${plan.tenant}.`), `Wrong tenant: ${f.path}`);
    requireValue(!/Decisioning\./i.test(f.path), `Use reusable schema fields, not brand subtrees: ${f.path}`);
    requireValue(['string', 'number', 'boolean'].includes(f.type) && !fields.has(f.path), `Invalid/duplicate field: ${f.path}`);
    requireValue(typeof f.dataflow === 'string' && f.dataflow.trim(), `Missing owning dataflow: ${f.path}`);
    fields.set(f.path, f.type);
  }
  requireValue(Array.isArray(plan.objectives) && plan.objectives.length === 7, 'Exactly seven ranked objectives are required');
  const assets = [];
  const keys = new Set();
  const names = new Set();
  const add = (key, entity_type, item) => {
    requireValue(/^[a-z][a-z0-9-]*$/.test(key) && !keys.has(key), `Invalid/duplicate asset key: ${key}`);
    const name = item.name || item._experience?.decisioning?.decisionitem?.itemName;
    const nameKey = `${entity_type}:${name}`;
    requireValue(!names.has(nameKey), `Duplicate asset name: ${name}`);
    names.add(nameKey);
    keys.add(key);
    assets.push({ key, entity_type, item });
  };
  const ruleAsset = (key, label, rule) => {
    add(key, 'offer-rules', {
      name: `${plan.customer} - ${label}`, exdRule: true, type: 'DECISION_ITEM',
      condition: { type: 'PQL', format: 'pql/text', value: pql(rule, fields) },
    });
    return { profileConstraintType: 'eligibilityRule', eligibilityRule: { ref: key } };
  };
  const tagIds = new Set();
  const objectiveKeys = new Set();
  const rules = [];
  for (const [index, o] of plan.objectives.entries()) {
    requireValue(/^[a-z][a-z0-9-]*$/.test(o.key) && !objectiveKeys.has(o.key), 'Unique objective keys are required');
    objectiveKeys.add(o.key);
    requireValue(typeof o.label === 'string' && o.label.trim(), `Missing objective label: ${o.key}`);
    requireValue(o.tag && UUID.test(o.tag.id) && o.tag.name && o.tag.sourceOfferId,
      `Objective ${o.key} needs a verified unified tag UUID, name and sourceOfferId; DPS tags are not compatible`);
    requireValue(!tagIds.has(o.tag.id), 'Each objective needs a distinct tag UUID');
    tagIds.add(o.tag.id);
    requireValue(Array.isArray(o.offers) && o.offers.length > 0, `No offers for ${o.key}`);
    const strategyConstraint = ruleAsset(`${o.key}-rule`, `${o.label} eligibility`, o.rule);
    rules.push(o.rule);
    const priorities = new Set();
    for (const offer of o.offers) {
      requireValue(/^[a-z][a-z0-9-]*$/.test(offer.key) && offer.name, `Invalid offer for ${o.key}`);
      requireValue(Number.isInteger(offer.priority) && offer.priority >= 0 && !priorities.has(offer.priority),
        `Non-integer or duplicate priority in ${o.key}`);
      priorities.add(offer.priority);
      requireValue(offer.content && Object.keys(offer.content).length > 0, `No source content for ${offer.key}`);
      for (const [key, value] of Object.entries(offer.content)) {
        requireValue(TEXT_FIELDS.has(key) && typeof value === 'string' && value.trim(),
          `Unsupported/empty content field: ${key}`);
      }
      const itemConstraints = offer.rule
        ? ruleAsset(`${o.key}-${offer.key}-rule`, `${o.label} - ${offer.name} eligibility`, offer.rule)
        : { profileConstraintType: 'none' };
      if (offer.rule) rules.push(offer.rule);
      const content = { textContent: offer.content };
      if (offer.imageHighRes) {
        for (const [key, value] of Object.entries(offer.imageHighRes)) {
          requireValue(['sourceURL', 'destinationURL', 'repository', 'type'].includes(key) &&
            typeof value === 'string' && value.trim(), `Unsupported/empty image field: ${key}`);
          if (key.endsWith('URL')) requireValue(new URL(value).protocol === 'https:', 'Media URLs must use HTTPS');
        }
        content.mediaAssets = { imageHighRes: offer.imageHighRes };
      }
      add(`${o.key}-${offer.key}`, 'offer-items', {
        _experience: { decisioning: {
          decisionitem: { itemName: `${plan.customer} - ${offer.name}`, itemPriority: offer.priority,
            itemCatalogID: plan.catalogId, itemTags: [o.tag.id], itemConstraints },
          offeritem: { lifecycleStatus: 'draft' },
        } },
        [plan.tenant]: { content },
      });
    }
    add(`${o.key}-collection`, 'item-collections', {
      name: `${plan.customer} - Objective ${index + 1} - ${o.label}`,
      constraints: [{ itemCatalogId: plan.catalogId,
        constraint: `SELECT * FROM offer_items WHERE (_experience.decisioning.decisionitem.itemTags IN ('${o.tag.id}') )`,
        uiModel: { tagTemplate: o.tag.id } }],
    });
    add(`${o.key}-strategy`, 'selection-strategies', {
      name: `${plan.customer} - NBA Strategy ${index + 1} - ${o.label}`,
      rank: { priority: 1, order: { orderEvaluationType: 'static' } },
      profileConstraint: strategyConstraint,
      optionSelection: { filter: { ref: `${o.key}-collection` } },
    });
  }
  requireValue(Array.isArray(plan.scenarios) && plan.scenarios.length > 0, 'Scenario assertions are required');
  for (const s of plan.scenarios) {
    requireValue(s.name && s.attributes && typeof s.attributes === 'object', 'Invalid scenario');
    for (const [path, value] of Object.entries(s.attributes)) {
      requireValue(fields.get(path) === typeof value && (typeof value !== 'number' || Number.isFinite(value)),
        `Scenario ${s.name}: invalid field/value ${path}`);
    }
    const result = evaluateScenario(plan, s.attributes);
    requireValue(result.objective === s.expectedObjective && result.offer === s.expectedOffer,
      `Scenario ${s.name}: expected ${s.expectedObjective}/${s.expectedOffer}, got ${result.objective}/${result.offer}`);
  }
  for (const o of plan.objectives) {
    requireValue(plan.scenarios.some(s => s.expectedObjective === o.key), `No winning scenario for ${o.key}`);
    for (const offer of o.offers) {
      requireValue(plan.scenarios.some(s => s.expectedObjective === o.key && s.expectedOffer === offer.key),
        `No winning scenario for ${o.key}/${offer.key}`);
    }
  }
  for (const rule of rules) {
    const complete = plan.scenarios.filter(s => rule.conditions.every(c => Object.hasOwn(s.attributes, c.path)));
    requireValue(complete.some(s => matches(rule, s.attributes)) && complete.some(s => !matches(rule, s.attributes)),
      `Every rule needs explicit matching and non-matching scenario values: ${rule.conditions.map(c => c.path).join(', ')}`);
  }
  return { fingerprint: fingerprint(plan), sandbox: plan.sandbox, assets };
}

export function contains(actual, expected) {
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && actual.length === expected.length &&
      expected.every((value, i) => contains(actual[i], value));
  }
  if (expected && typeof expected === 'object') {
    return actual && typeof actual === 'object' &&
      Object.entries(expected).every(([key, value]) => contains(actual[key], value));
  }
  return actual === expected;
}

function substitute(value, ids, template) {
  if (Array.isArray(value)) return value.map(v => substitute(v, ids, template));
  if (value && typeof value === 'object') {
    if (Object.keys(value).length === 1 && value.ref) {
      requireValue(ids[value.ref], `Missing returned ID for ${value.ref}`);
      return ids[value.ref];
    }
    if (Object.keys(value).length === 1 && value.tagTemplate) {
      const model = structuredClone(typeof template === 'string' ? JSON.parse(template) : template);
      requireValue(model?.operator === 'in' &&
        model.value?.left === '_experience.decisioning.decisionitem.itemTags' &&
        Array.isArray(model.value.right), 'Collection template must be a single tag IN predicate');
      model.value.right = [value.tagTemplate];
      return typeof template === 'string' ? JSON.stringify(model) : model;
    }
    return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, substitute(v, ids, template)]));
  }
  return value;
}

export async function runPlan(plan, { call, state, save, confirm }) {
  const compiled = compilePlan(plan);
  requireValue(state.fingerprint === compiled.fingerprint, 'Journal belongs to a different plan');
  requireValue(state.assets && typeof state.assets === 'object' && !Array.isArray(state.assets),
    'Invalid journal assets');
  requireValue(confirm === compiled.fingerprint, 'Apply requires the exact reviewed plan fingerprint');
  const schema = await call('schema', null);
  requireValue(schema.schemaId === plan.schemaId, 'Live catalog schema differs from the reviewed plan');
  const get = async (entity_type, id) => {
    const result = await call('get', { entity_type, id, schemaId: plan.schemaId });
    requireValue(result.raw && result.raw.id === id, `Missing/mismatched raw readback for ${id}`);
    return result.raw;
  };
  for (const o of plan.objectives) {
    const raw = await get('offer-items', o.tag.sourceOfferId);
    const di = raw._experience?.decisioning?.decisionitem;
    requireValue(di?.itemCatalogID === plan.catalogId && di.itemTags?.includes(o.tag.id) &&
      di.itemTagDetails?.some(t => t.id === o.tag.id && t.name === o.tag.name),
    `Live tag verification failed: ${o.tag.name}`);
  }
  const template = await get('item-collections', plan.collectionTemplateId);
  requireValue(template.constraints?.length === 1 &&
    template.constraints[0].itemCatalogId === plan.catalogId, 'Wrong collection template catalog/shape');
  const ids = {};
  for (const asset of compiled.assets) {
    const item = substitute(asset.item, ids, template.constraints[0].uiModel);
    let record = state.assets[asset.key];
    if (record) {
      requireValue(record.id, `Ambiguous prior write for ${asset.key}: inspect Adobe before recovery; do not retry`);
      requireValue(record.entity_type === asset.entity_type, `Journal entity type mismatch: ${asset.key}`);
      const raw = await get(asset.entity_type, record.id);
      requireValue(contains(raw, item), `Persisted asset drifted: ${asset.key} (${record.id})`);
    } else {
      const body = { entity_type: asset.entity_type, action: 'create', item, schemaId: plan.schemaId };
      const preview = await call('change-preview', body);
      requireValue(preview.preflight_id && preview.required_confirmation &&
        fingerprint(preview.proposed) === fingerprint(item),
        `Incomplete or changed preview for ${asset.key}`);
      record = state.assets[asset.key] = { entity_type: asset.entity_type, status: 'pending' };
      await save(state);
      const result = await call('change-apply', { ...body, preflight_id: preview.preflight_id,
        confirmation: preview.required_confirmation });
      requireValue(result.id, `No returned ID for ${asset.key}; inspect Adobe before recovery`);
      record.id = result.id;
      await save(state);
      const raw = await get(asset.entity_type, result.id);
      requireValue(contains(raw, item), `Readback mismatch: ${asset.key} (${result.id})`);
    }
    record.status = 'verified';
    ids[asset.key] = record.id;
    await save(state);
  }
  return { sandbox: plan.sandbox, ids, policyActivated: false, lifecycleStatus: 'draft' };
}

async function main(args) {
  const [filename, ...flags] = args;
  requireValue(filename, 'Usage: node scripts/provision-decisioning-catalog.mjs <plan.json> [--apply --confirm <fingerprint> --state <journal.json>]');
  const options = {};
  for (let i = 0; i < flags.length; i++) {
    const flag = flags[i];
    requireValue(['--apply', '--confirm', '--state'].includes(flag) && !Object.hasOwn(options, flag),
      `Unknown/duplicate argument: ${flag}`);
    options[flag] = flag === '--apply' ? true : flags[++i];
    requireValue(options[flag] && !String(options[flag]).startsWith('--'), `Missing value: ${flag}`);
  }
  const plan = JSON.parse(await readFile(filename, 'utf8'));
  const compiled = compilePlan(plan);
  if (!options['--apply']) {
    console.log(JSON.stringify({ ...compiled, warning: 'LOCAL PLAN ONLY. References resolve sequentially on apply. All offers remain draft. Tag collections include existing/future items with that tag. Strategy order must be wired and tested in a separately reviewed decision policy.' }, null, 2));
    return;
  }
  requireValue(options['--confirm'] === compiled.fingerprint, 'Supply the fingerprint of the explicitly approved dry run');
  requireValue(options['--state'], '--state is required for durable write recovery');
  const statePath = resolve(options['--state']);
  requireValue(statePath !== resolve(filename), 'Journal cannot overwrite the plan');
  const lockPath = `${statePath}.lock`;
  const lock = await open(lockPath, 'wx');
  try {
    let state;
    try {
      state = JSON.parse(await readFile(statePath, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      state = { fingerprint: compiled.fingerprint, assets: {} };
      await writeFile(statePath, JSON.stringify(state, null, 2), { flag: 'wx', flush: true });
    }
    const call = async (route, body) => {
      const response = await fetch(`${BASE}/api/decisioning/catalog/${route}${body ? '' : '?sandbox=kirkham'}`, {
        method: body ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify({ ...body, sandbox: plan.sandbox }) } : {}),
        signal: AbortSignal.timeout(120_000),
      });
      const result = await response.json();
      requireValue(response.ok && result.ok === true, `${route}: ${result.error || `HTTP ${response.status}`}`);
      return result;
    };
    const save = async value => {
      const tempPath = `${statePath}.tmp`;
      await writeFile(tempPath, JSON.stringify(value, null, 2), { flush: true });
      await rename(tempPath, statePath);
    };
    console.log(JSON.stringify(await runPlan(plan, { call, state, save, confirm: options['--confirm'] }), null, 2));
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => {
    console.error(`Catalog provisioning stopped: ${error.message}`);
    process.exitCode = 1;
  });
}
