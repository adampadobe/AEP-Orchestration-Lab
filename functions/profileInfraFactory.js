/**
 * Generic, config-driven runner for the per-industry profile setup wizards
 * (Generic, Travel, FSI, Telecommunications, Retail, Media, Sports, ...).
 *
 * Replaces the per-industry `*ProfileInfraService.js` clones — those files
 * collapse to ~30-line config exports that delegate to this factory. The
 * external behaviour of the existing Generic and Travel wizards is preserved
 * 1:1 (same exported function names, same return shapes, same wizard step
 * semantics, same retry budgets, same eventual-consistency guards).
 *
 * Design intent
 * -------------
 * The five wizard outcomes (status, createSchema, attachFieldGroups,
 * createDataset, httpFlow) are identical across industries except for:
 *   - schema / dataset / dataflow titles
 *   - which Adobe-OOTB Profile-class field groups to attach on top of the
 *     mandatory Generic base set
 *   - whether to also resolve org-imported custom tenant field groups
 *     (e.g. "Profile Retail v2", "Profile FSI v2") that vary per sandbox
 *
 * The factory therefore exposes a single `createProfileInfraService(config)`
 * that returns `{ runStatus, runStep, STEP_NAMES, ...nameConstants }` —
 * everything the per-industry wrapper needs to wire into `functions/index.js`.
 *
 * Layered field-group resolver
 * ----------------------------
 * Every Profile schema MUST carry the Generic base set (Profile Core v2 +
 * Demographic Details + Personal Contact Details + Loyalty Details + Consent
 * and Preference Details + Preference Details + Profile test details). On top of that base, each
 * industry config supplies an `industryFieldGroups` array of additional
 * resolution candidates:
 *
 *   { source: 'ootb', $id: 'https://ns.adobe.com/...' }
 *   { source: 'tenantTitlePattern', match: /^Profile Retail( v\d+)?$/i, optional: true }
 *   { source: 'tenantTitlePattern', match: /^Profile Telecom v\d+$/i, optional: true,
 *     createIfMissing: { title: 'Profile Telecom v1', description: '...', properties: { industryTelecom: { ... XDM ... } } } }
 *   { source: 'ootbByIndustryTag', industries: ['Telecommunications'], titleHints: [/telecom/i] }
 *
 * For each entry the factory:
 *   - 'ootb'                → uses the literal $id straight from config
 *   - 'tenantTitlePattern'  → searches the live tenant-FG list by title regex;
 *                             if `createIfMissing` is provided AND nothing
 *                             matches in this sandbox, the factory POSTs the
 *                             FG (Profile-class, properties wrapped under
 *                             `_<tenant>`) and re-resolves
 *   - 'ootbByIndustryTag'   → searches the live /global/fieldgroups list for
 *                             Profile-class FGs whose `meta:industries`
 *                             intersects `industries` OR whose title matches
 *                             any of `titleHints` (Adobe does not consistently
 *                             populate meta:industries on OOTB FGs as of 2026,
 *                             so titleHints is the actually-effective matcher
 *                             — verified against the apalmer sandbox; the
 *                             industries[] list is forward-compat and will
 *                             start contributing if Adobe begins tagging)
 *
 * If the entry resolves it goes into the PATCH ops; otherwise:
 *   - `optional: true` → silently skipped (the wizard still succeeds; the
 *      industry just runs with one fewer FG attached, falling back to
 *      Profile Core v2's tenant subtree at `_<tenant>.<tenantSubtreePrefix>.*`
 *      for any data the missing FG would have typed)
 *   - `optional: false` → the wizard step fails fast with a clear message
 *
 * The `tenantSubtreePrefix` config field documents the per-industry subtree
 * the UI streams free-form data under when no FG resolves (mirrors the way
 * Travel reservations land under `_demoemea.travelReservations.*` even
 * though no Adobe ExperienceEvent FG is attached to the Profile schema).
 */

const SCHEMA_REGISTRY = 'https://platform.adobe.io/data/foundation/schemaregistry';
const CATALOG_BASE = 'https://platform.adobe.io/data/foundation/catalog';

const ACCEPT_XDM = 'application/vnd.adobe.xdm+json;version=1';
const ACCEPT_XED = 'application/vnd.adobe.xed+json;version=1';
const ACCEPT_XED_FULL = 'application/vnd.adobe.xed-full+json';
const ACCEPT_JSON = 'application/json';
// NOTE intentionally NOT used as Content-Type on /tenant/fieldgroups PATCH —
// Adobe's gateway rejects `application/json-patch+json` with HTTP 415
// (verified against kirkham Apr 2026). The PATCH body IS a JSON-Patch
// array but the request must declare `Content-Type: application/json`.
// Kept as a named constant for documentation only.
// eslint-disable-next-line no-unused-vars
const ACCEPT_JSON_PATCH_DOCUMENTED_NOT_USED = 'application/json-patch+json';

const { getManifestForIndustry } = require('./profileCoreV2Manifest');

/**
 * Durable Firestore status cache invalidation hook. Loaded lazily so
 * unit tests / scripts that import this factory without firebase-admin
 * configured don't pay the import cost. Failures are non-fatal — the
 * cache is a perf optimisation, never a correctness boundary.
 */
let _statusCacheModule;
function getStatusCache() {
  if (!_statusCacheModule) {
    try {
      _statusCacheModule = require('./profileInfraStatusCache');
    } catch (_) {
      _statusCacheModule = { invalidateStatusCache: async () => {} };
    }
  }
  return _statusCacheModule;
}
async function safeInvalidateStatusCache(industryKey, sandbox) {
  if (!industryKey || !sandbox) return;
  try {
    await getStatusCache().invalidateStatusCache({ sandbox, industry: industryKey });
  } catch (_) {
    /* helper logs internally */
  }
}

/**
 * Mandatory base set attached to EVERY industry Profile schema.
 *
 * Loyalty Details lives under the nested `mixins/profile/...` namespace (NOT
 * the flat `mixins/...` one). Sending the wrong path causes the Schema
 * Registry to reject the entire PATCH with a misleading 404 "Resource not
 * found" because AEP cannot resolve one of the $ref values in the body.
 *
 * `profile-consents` is the OOTB Consent and Preference Details field group
 * (`consents.marketing.preferred`, channel objects, etc.) — it is OOTB
 * Profile-class even though the URI doesn't say so. Verified against the
 * adobe/xdm repo before locking in.
 */
const BASE_PROFILE_FIELD_GROUP_REFS = [
  'https://ns.adobe.com/xdm/context/profile-person-details',
  'https://ns.adobe.com/xdm/context/profile-personal-details',
  'https://ns.adobe.com/xdm/mixins/profile/profile-loyalty-details',
  'https://ns.adobe.com/xdm/mixins/profile-consents',
  'https://ns.adobe.com/xdm/context/profile-preferences-details',
  /** OOTB "Profile test details" — `xdm:testProfile` on the Profile union record (adobe/xdm profile-test-profile.schema.json). */
  'https://ns.adobe.com/xdm/context/profile-test-profile',
];

/** Human-readable labels for the success message (order matches BASE_PROFILE_FIELD_GROUP_REFS plus Profile Core v2 prepended). */
const BASE_PROFILE_FIELD_GROUP_LABELS = [
  'Profile Core v2',
  'Demographic Details',
  'Personal Contact Details',
  'Loyalty Details',
  'Consent and Preference Details',
  'Preference Details',
  'Profile test details',
];

const STEP_NAMES = Object.freeze(['createSchema', 'attachFieldGroups', 'createDataset', 'httpFlow']);

/**
 * Build the JSON-Patch body that adds `"union"` to a schema's
 * `meta:immutableTags` array. Two ops are emitted so the PATCH works
 * on schemas that have NO `meta:immutableTags` field yet (the first op
 * adds the array, the second op appends `"union"`). Schemas that already
 * have an array but no `"union"` value will see the first op fail with
 * 400 and the second succeed — except Adobe applies the array as a
 * whole, so we instead emit a single conditional patch sequence:
 *
 *   - if no array: { add /meta:immutableTags ["union"] }
 *   - if array exists but no "union": { add /meta:immutableTags/- "union" }
 *
 * The caller decides which shape to send based on a fresh GET. Returning
 * BOTH a "set" op and an "append" op is the cleanest way to express the
 * two cases without spreading branching logic across the orchestrator.
 */
function buildAddProfileUnionPatchOps(currentImmutableTags) {
  if (Array.isArray(currentImmutableTags)) {
    if (currentImmutableTags.includes('union')) return [];
    return [{ op: 'add', path: '/meta:immutableTags/-', value: 'union' }];
  }
  return [{ op: 'add', path: '/meta:immutableTags', value: ['union'] }];
}

/* -------------------- Pure helpers (no closures over config) -------------------- */

function parseTenantFromUri(uri) {
  const m = String(uri || '').match(/^https:\/\/ns\.adobe\.com\/([^/]+)\//);
  return m ? m[1] : null;
}

function xdmKeyFromTenantId(tenantId) {
  return tenantId ? `_${tenantId}` : '_demoemea';
}

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

function headersJson(token, clientId, orgId, sandbox, extra = {}) {
  return {
    Authorization: `Bearer ${token}`,
    'x-api-key': clientId,
    'x-gw-ims-org-id': orgId,
    'x-sandbox-name': sandbox,
    Accept: ACCEPT_JSON,
    'Content-Type': ACCEPT_JSON,
    ...extra,
  };
}

function headersXed(token, clientId, orgId, sandbox, withContentType) {
  const h = {
    Authorization: `Bearer ${token}`,
    'x-api-key': clientId,
    'x-gw-ims-org-id': orgId,
    'x-sandbox-name': sandbox,
    Accept: ACCEPT_XED,
  };
  if (withContentType) h['Content-Type'] = ACCEPT_XED;
  return h;
}

/**
 * Extract the most informative human-readable error message from an Adobe
 * Schema Registry / Catalog 4xx response body. Adobe wraps the actually-
 * useful detail (e.g. "Descriptor with id <…> already exists", schema
 * validation drift, missing reference, …) inside `report.additionalDetails[]`
 * or `report.details[]`, leaving only a generic `title` like "Descriptor
 * validation error" or "Schema validation error" at the top level.
 *
 * Caller-friendly priority:
 *   1. report.additionalDetails[].errorReason   (joined by "; ")
 *   2. report.details[].message                 (joined by "; ")
 *   3. detail
 *   4. message
 *   5. title
 *   6. fallback
 *
 * Always returns a non-empty string.
 */
function extractAepErrorMessage(data, fallback) {
  const fb = String(fallback || 'Unknown error');
  if (!data || typeof data !== 'object') return fb;
  const report = data.report;
  if (report && typeof report === 'object') {
    if (Array.isArray(report.additionalDetails)) {
      const reasons = report.additionalDetails
        .map((x) => x && (x.errorReason || x.detail || x.message))
        .filter((s) => typeof s === 'string' && s.length > 0);
      if (reasons.length) return reasons.join('; ');
    }
    if (Array.isArray(report.details)) {
      const msgs = report.details
        .map((x) => x && (x.message || x.detail || x.errorReason))
        .filter((s) => typeof s === 'string' && s.length > 0);
      if (msgs.length) return msgs.join('; ');
    }
  }
  return data.detail || data.message || data.title || fb;
}

/**
 * Detect Adobe's "already exists" error variants, including the case where
 * the duplicate signal is buried inside `report.additionalDetails[].errorReason`
 * under a generic top-level title like "Descriptor validation error" or
 * "Schema validation error". Used for idempotency in createPrimaryEmailDescriptor
 * and other wizard creators.
 */
function looksLikeAlreadyExists(messageOrError) {
  if (!messageOrError) return false;
  const s = String(messageOrError);
  return /already exists|duplicate|already created|409\b/i.test(s);
}

function collectSchemaRefUris(schema) {
  const set = new Set();
  for (const x of schema.allOf || []) {
    if (x && typeof x.$ref === 'string') set.add(x.$ref);
  }
  for (const u of schema['meta:extends'] || []) {
    if (typeof u === 'string') set.add(u);
  }
  return set;
}

function findProfileCoreV2Mixin(results) {
  return results.find((m) => {
    const t = String(m.title || '').toLowerCase();
    return t === 'profile core v2' || t.includes('profile core v2');
  });
}

function isPrimaryEmailIdentityDescriptor(d) {
  if (!d) return false;
  const primary = d['xdm:isPrimary'];
  if (primary !== true && primary !== 'true') return false;
  const prop = String(d['xdm:sourceProperty'] || '');
  if (!/email/i.test(prop)) return false;
  const ns = String(d['xdm:namespace'] || '').toLowerCase();
  const nsOk = !ns || ns === 'email' || ns.includes('email');
  if (!nsOk) return false;
  return /identification/i.test(prop) || /\/core\/email/i.test(prop) || /email$/i.test(prop.replace(/\/+$/, ''));
}

function descriptorSourceSchemaMatches(src, schemaId, schemaMetaAltId) {
  if (!src || !schemaId) return false;
  if (src === schemaId) return true;
  if (schemaMetaAltId && src === schemaMetaAltId) return true;
  const a = String(schemaId).replace(/\/+$/, '');
  const b = String(src).replace(/\/+$/, '');
  if (a === b) return true;
  if (schemaMetaAltId) {
    const c = String(schemaMetaAltId).replace(/\/+$/, '');
    if (b === c) return true;
  }
  return false;
}

function collectDescriptorResults(data) {
  if (!data || typeof data !== 'object') return [];
  const out = [];
  for (const x of [...(data.results || []), ...(data.children || [])]) {
    if (x && typeof x === 'object') out.push(x);
  }
  return out;
}

function flattenDatasets(pages) {
  const rows = [];
  for (const p of pages) {
    if (!p || typeof p !== 'object') continue;
    if (Array.isArray(p)) {
      rows.push(...p);
      continue;
    }
    if (Array.isArray(p.children)) rows.push(...p.children);
    if (Array.isArray(p.results)) rows.push(...p.results);
    if (Array.isArray(p.datasets)) rows.push(...p.datasets);
    for (const [k, v] of Object.entries(p)) {
      if (k.startsWith('_')) continue;
      if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
      const idKey24 = /^[0-9a-f]{24}$/i.test(k);
      const idKeyUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(k);
      if (idKey24 || idKeyUuid || typeof v.name === 'string' || v.schemaRef) {
        rows.push({ ...v, id: v.id || k });
      }
    }
  }
  const byId = new Map();
  for (const r of rows) {
    const id = r && r.id;
    if (id && !byId.has(id)) byId.set(id, r);
  }
  return [...byId.values()];
}

function datasetHasProfileEnabledTag(ds) {
  const tags = ds && ds.tags;
  if (!tags || typeof tags !== 'object') return false;
  const v = tags.unifiedProfile;
  if (!Array.isArray(v)) return false;
  return v.some((s) => /enabled\s*[:=]\s*true/i.test(String(s)));
}

function schemaHasProfileUnionTag(fullSchema) {
  if (!fullSchema || typeof fullSchema !== 'object') return false;
  const tags = fullSchema['meta:immutableTags'];
  if (!Array.isArray(tags)) return false;
  return tags.includes('union');
}

/* -------------------- Profile Core v2 top-up helpers (pure) -------------------- */

/**
 * Walk a resolved `xed-full` mixin body and return:
 *   - presentPathSet  :  every dot-joined tenant-relative path that resolves
 *                         to a concrete object/leaf (so `travelReservations`,
 *                         `travelReservations.flightReservations`, and every
 *                         leaf below it all appear).
 *   - presentNodeMap  :  Map<dotPath, node>  — the actual schema subtree at
 *                         each path. Used to detect type conflicts (a leaf
 *                         already exists but with a different JSON-Schema
 *                         `type` than the manifest wants).
 *   - tenantKey       :  e.g. `_demoemea` (null if the body has no tenant
 *                         object, which means Profile Core v2 is malformed
 *                         and the wizard should surface a hard error).
 *
 * Both authoring (`xed+json`) and resolved (`xed-full+json`) shapes are
 * supported — authoring puts the tenant object under
 * `definitions.customFields.properties._<tenant>`, resolved puts it at
 * top-level `properties._<tenant>`.
 */
function walkResolvedMixinTenantTree(fgBody) {
  const tryRoots = [
    fgBody && fgBody.properties,
    fgBody && fgBody.definitions && fgBody.definitions.customFields && fgBody.definitions.customFields.properties,
  ];
  let rootProps = null;
  for (const p of tryRoots) { if (p && typeof p === 'object' && !Array.isArray(p)) { rootProps = p; break; } }
  if (!rootProps) return { tenantKey: null, presentPathSet: new Set(), presentNodeMap: new Map() };
  const tenantKey = Object.keys(rootProps).find((k) => k.startsWith('_')) || null;
  if (!tenantKey) return { tenantKey: null, presentPathSet: new Set(), presentNodeMap: new Map() };
  const tenantNode = rootProps[tenantKey];
  const presentPathSet = new Set();
  const presentNodeMap = new Map();
  function visit(node, dotPath) {
    if (!node || typeof node !== 'object') return;
    const childProps = node.properties;
    if (!childProps || typeof childProps !== 'object') return;
    for (const [k, child] of Object.entries(childProps)) {
      const p = dotPath ? `${dotPath}.${k}` : k;
      presentPathSet.add(p);
      presentNodeMap.set(p, child);
      visit(child, p);
    }
  }
  visit(tenantNode, '');
  return { tenantKey, presentPathSet, presentNodeMap };
}

/**
 * Walk the AUTHORING (`xed+json`) mixin body and find every ancestor path
 * that terminates in a `$ref`-linked datatype (e.g. `identification.core`
 * → `$ref: https://ns.adobe.com/<tenant>/datatypes/<id>`). Leaves under
 * those paths cannot be PATCHed on the FG directly — they live in the
 * shared datatype, so the top-up treats them as `conflict` (skip) rather
 * than trying to overwrite the $ref with an inline properties tree.
 *
 * Returns a Set<dotPath> of tenant-relative paths whose subtree is
 * $ref-linked. Empty if the body has no tenant object.
 */
function collectRefBlockedAncestorPaths(authoringBody) {
  const blocked = new Set();
  const root =
    authoringBody &&
    authoringBody.definitions &&
    authoringBody.definitions.customFields &&
    authoringBody.definitions.customFields.properties;
  if (!root || typeof root !== 'object') return blocked;
  const tenantKey = Object.keys(root).find((k) => k.startsWith('_'));
  if (!tenantKey) return blocked;
  function visit(node, dotPath) {
    if (!node || typeof node !== 'object') return;
    if (typeof node.$ref === 'string' && node.$ref.length > 0) {
      if (dotPath) blocked.add(dotPath);
      return;
    }
    const childProps = node.properties;
    if (!childProps || typeof childProps !== 'object') return;
    for (const [k, child] of Object.entries(childProps)) {
      const p = dotPath ? `${dotPath}.${k}` : k;
      visit(child, p);
    }
  }
  visit(root[tenantKey], '');
  return blocked;
}

/**
 * Compare the resolved mixin tree with a manifest and produce:
 *   - needsAdd       :  [{ path, schema }]  smallest non-overlapping parents
 *                        to ADD (e.g. if the whole `travelReservations`
 *                        parent is missing, one entry for that parent —
 *                        NOT one entry per leaf inside).
 *   - alreadyPresent :  [path] every manifest path whose resolved type
 *                        already matches (simple primitive-type check).
 *   - conflicts      :  [{ path, reason }] where the sandbox already has
 *                        something with a conflicting shape / type, OR the
 *                        path would fall under a $ref-linked ancestor
 *                        (can't PATCH the FG — the shared datatype owns
 *                        those leaves).
 *
 * The caller (`topUpProfileCoreV2`) then turns `needsAdd` into JSON-Patch
 * `add` ops targeting `/definitions/customFields/properties/_<tenant>/properties/...`.
 */
function diffManifestAgainstMixin(manifest, presentPathSet, presentNodeMap, refBlockedAncestorPaths) {
  const needsAdd = [];
  const alreadyPresent = [];
  const conflicts = [];
  const refBlocked = refBlockedAncestorPaths || new Set();
  // Sort manifest paths so shallower paths sort before deeper ones (when
  // an ancestor is missing we record ONE add for that ancestor and skip
  // all of its descendants in the same manifest).
  const manifestPaths = Object.keys(manifest).sort((a, b) => a.split('.').length - b.split('.').length || a.localeCompare(b));
  const coveredByAddedAncestor = new Set();

  function pathIsUnderRefAncestor(path) {
    for (const bp of refBlocked) {
      if (path === bp) continue; // the $ref node itself is fine; only descendants are blocked
      if (path.startsWith(`${bp}.`)) return bp;
    }
    return null;
  }

  function schemasTypesAgree(manifestSchema, liveNode) {
    const mType = manifestSchema && manifestSchema.type;
    const lType = liveNode && liveNode.type;
    if (!mType || !lType) return true; // nothing to compare
    if (mType === lType) return true;
    return false;
  }

  for (const mpath of manifestPaths) {
    // If a shallower ancestor is in this manifest AND was added to
    // `needsAdd` above, skip this entry — it'll come along for the ride
    // inside the added ancestor subtree.
    let skip = false;
    for (const ancestor of coveredByAddedAncestor) {
      if (mpath.startsWith(`${ancestor}.`)) { skip = true; break; }
    }
    if (skip) continue;

    const blockedBy = pathIsUnderRefAncestor(mpath);
    if (blockedBy) {
      if (presentPathSet.has(mpath)) {
        // Present via the shared datatype — fine, count as alreadyPresent.
        alreadyPresent.push(mpath);
      } else {
        conflicts.push({ path: mpath, reason: `ancestor '${blockedBy}' is a $ref to a shared datatype; FG PATCH cannot add leaves here (edit the datatype instead)` });
      }
      continue;
    }

    if (presentPathSet.has(mpath)) {
      const live = presentNodeMap.get(mpath);
      if (!schemasTypesAgree(manifest[mpath], live)) {
        conflicts.push({ path: mpath, reason: `existing leaf has type '${live && live.type}' but manifest expects '${manifest[mpath].type}'` });
      } else {
        alreadyPresent.push(mpath);
      }
      continue;
    }

    // Not present — figure out the shallowest missing ancestor in `mpath`
    // so we add the biggest subtree we can in a single op.
    const parts = mpath.split('.');
    let addPath = mpath;
    for (let i = 1; i < parts.length; i++) {
      const ancestor = parts.slice(0, i).join('.');
      if (!presentPathSet.has(ancestor)) { addPath = ancestor; break; }
    }
    if (!coveredByAddedAncestor.has(addPath)) {
      coveredByAddedAncestor.add(addPath);
      // The schema we ADD is whichever manifest entry matches addPath
      // (may be an ancestor of the current manifest path). If the
      // manifest doesn't have an entry at addPath exactly (e.g. it only
      // has `travelReservations.flightReservations.*` leaves flattened),
      // we still need a schema body — in that case we build one by
      // walking the manifest for everything under addPath and nesting it.
      let addSchema = manifest[addPath];
      if (!addSchema) addSchema = buildCompositeSubtreeFromManifest(manifest, addPath);
      if (!addSchema) {
        conflicts.push({ path: addPath, reason: 'no manifest schema available for this path' });
        continue;
      }
      needsAdd.push({ path: addPath, schema: addSchema });
    }
  }

  return { needsAdd, alreadyPresent, conflicts };
}

/**
 * When a manifest is flat (path-keyed) and we need to add a whole parent,
 * assemble the inline JSON-Schema object from every manifest entry
 * whose path is at-or-under `parentDotPath`. Used as a fallback when
 * the manifest doesn't declare the parent itself (only its leaves).
 */
function buildCompositeSubtreeFromManifest(manifest, parentDotPath) {
  const prefix = parentDotPath ? `${parentDotPath}.` : '';
  const entries = Object.keys(manifest).filter((k) => k === parentDotPath || k.startsWith(prefix));
  if (entries.length === 0) return null;
  // Build a nested `{ type:'object', properties:{...} }` tree.
  const root = { type: 'object', properties: {} };
  for (const key of entries) {
    if (key === parentDotPath) {
      Object.assign(root, manifest[key]);
      continue;
    }
    const rel = key.slice(prefix.length).split('.');
    let node = root;
    for (let i = 0; i < rel.length; i++) {
      const seg = rel[i];
      if (i === rel.length - 1) {
        node.properties = node.properties || {};
        node.properties[seg] = manifest[key];
      } else {
        node.properties = node.properties || {};
        node.properties[seg] = node.properties[seg] || { type: 'object', properties: {} };
        node = node.properties[seg];
      }
    }
  }
  return root;
}

/**
 * Turn a `diffManifestAgainstMixin` result into JSON-Patch ADD ops
 * targeting the authoring `definitions.customFields.properties._<tenant>/properties/*`
 * subtree. Handles adding missing intermediate parents via recursive-add:
 * if the manifest says "add `travelReservations`" and the tenant object
 * has no `travelReservations` key yet, we ADD that whole subtree in one
 * op at path `.../properties/travelReservations`.
 *
 * Returns an array of `{ op:'add', path, value }` objects.
 */
function buildTopUpJsonPatchOps(tenantKey, needsAdd) {
  const ops = [];
  const encodeSegment = (s) => String(s).replace(/~/g, '~0').replace(/\//g, '~1');
  for (const { path, schema } of needsAdd || []) {
    const parts = String(path || '').split('.').filter(Boolean);
    if (parts.length === 0) continue;
    const prefix = `/definitions/customFields/properties/${encodeSegment(tenantKey)}/properties`;
    const segPath = parts.map((seg, i) => {
      if (i === 0) return encodeSegment(seg);
      return `properties/${encodeSegment(seg)}`;
    }).join('/');
    const jsonPointer = `${prefix}/${segPath}`;
    ops.push({ op: 'add', path: jsonPointer, value: schema });
  }
  return ops;
}

/* -------------------- Layered industry FG resolver -------------------- */

/**
 * Pick Profile-class entries from a `/global/fieldgroups` list whose
 * `meta:industries` array intersects the configured industries set OR whose
 * `title` matches any of the configured titleHints regex array.
 *
 * Adobe does not consistently populate `meta:industries` on OOTB Profile-class
 * field groups (verified empty for all 34 Profile-class entries in the apalmer
 * sandbox in 2026 — see /tmp/probe-fg-evidence-summary-2.json). The
 * titleHints regex list is therefore the actually-effective matcher today;
 * the `industries` list is kept for forward compatibility (if Adobe ships
 * updated metadata, those entries auto-flow in without code changes).
 *
 * Returns the deduplicated list of `{ $id, title }` to attach.
 */
function pickProfileClassOotbByTag(globalList, industries, titleHints) {
  const indSet = new Set((industries || []).map((s) => String(s).toLowerCase()));
  const titleRes = (titleHints || []).filter((re) => re instanceof RegExp);
  const out = new Map();
  for (const row of globalList || []) {
    if (!isProfileClassFieldGroup(row)) continue;
    const matchesIndustry =
      Array.isArray(row['meta:industries']) &&
      row['meta:industries'].some((t) => indSet.has(String(t).toLowerCase()));
    const matchesTitle = titleRes.some((re) => re.test(String(row.title || '')));
    if (!matchesIndustry && !matchesTitle) continue;
    if (!row.$id) continue;
    if (out.has(row.$id)) continue;
    out.set(row.$id, { $id: String(row.$id), title: String(row.title || '') });
  }
  return [...out.values()];
}

function isProfileClassFieldGroup(row) {
  if (!row || typeof row !== 'object') return false;
  const ext = row['meta:intendedToExtend'];
  if (Array.isArray(ext) && ext.includes('https://ns.adobe.com/xdm/context/profile')) return true;
  if (row['meta:class'] === 'https://ns.adobe.com/xdm/context/profile') return true;
  return false;
}

/**
 * Resolve one `industryFieldGroups` config entry against the live tenant FG list
 * and (optionally) the live /global/fieldgroups list.
 *
 * Return shape:
 *   { resolved: true,  ref, label, optional }            - attach this $id
 *   { resolved: true,  refs: [{ref,label}], optional }   - attach multiple (ootbByIndustryTag)
 *   { resolved: false, optional, reason, needsCreate? }  - skip (or create when needsCreate is set)
 *
 * `needsCreate` is set only for tenantTitlePattern entries whose config
 * contains `createIfMissing`. The orchestrator (attachFieldGroupsAndDescriptor)
 * is responsible for POSTing the FG, relisting, and re-resolving — keeping
 * this helper a pure function of its inputs.
 */
function resolveIndustryFgEntry(entry, tenantFgList, globalFgList) {
  const optional = entry.optional === true;
  if (entry.source === 'ootb') {
    const id = String(entry.$id || '').trim();
    if (!id) return { resolved: false, optional, reason: 'OOTB entry missing $id' };
    return { resolved: true, ref: id, label: entry.label || id.split('/').pop(), optional };
  }
  if (entry.source === 'tenantTitlePattern') {
    const re = entry.match instanceof RegExp ? entry.match : null;
    if (!re) return { resolved: false, optional, reason: 'tenantTitlePattern entry missing match regex' };
    // Choose the highest-versioned candidate (e.g. v3 over v2 over v1) so a
    // sandbox that has both Profile Retail v1 and Profile Retail v2 picks the
    // newer one. Tie-break by title (deterministic) to keep behaviour stable.
    const matches = (tenantFgList || []).filter((m) => re.test(String(m.title || '')));
    if (matches.length === 0) {
      const result = { resolved: false, optional, reason: `no tenant FG matches /${re.source}/` };
      if (entry.createIfMissing && typeof entry.createIfMissing === 'object') {
        result.needsCreate = {
          spec: entry.createIfMissing,
          label: entry.label || entry.createIfMissing.title || re.source,
        };
      }
      return result;
    }
    const versionOf = (s) => {
      const m = String(s.title || '').match(/v(\d+(?:\.\d+)?)/i);
      return m ? Number(m[1]) : 0;
    };
    matches.sort((a, b) => versionOf(b) - versionOf(a) || String(a.title).localeCompare(String(b.title)));
    const pick = matches[0];
    return {
      resolved: true,
      ref: String(pick.$id),
      label: entry.label || String(pick.title || pick.$id.split('/').pop()),
      optional,
    };
  }
  if (entry.source === 'ootbByIndustryTag') {
    const picks = pickProfileClassOotbByTag(globalFgList || [], entry.industries, entry.titleHints);
    if (picks.length === 0) {
      return { resolved: false, optional: true, reason: 'no /global Profile-class FG matched industries/titleHints' };
    }
    return {
      resolved: true,
      refs: picks.map((p) => ({ ref: p.$id, label: p.title })),
      optional: true,
    };
  }
  return { resolved: false, optional, reason: `unknown source "${entry.source}"` };
}

/**
 * Wrap a per-industry `createIfMissing.properties` tree under the tenant's
 * `_<tenantId>` namespace and decorate with the Profile-class metadata AEP
 * expects (verified against the live `Profile Retail v2` body in apalmer —
 * see /tmp/probe-fg-evidence-summary-2.json: definitions.customFields wraps
 * a single top-level `_<tenant>` object, allOf $refs that customFields, and
 * meta:intendedToExtend lists the Profile context class).
 */
function buildTenantFieldGroupCreateBody(tenantId, createSpec) {
  const tenantKey = `_${tenantId}`;
  return {
    title: createSpec.title,
    description: createSpec.description || `AEP Lab auto-created Profile-class field group for ${createSpec.title}.`,
    type: 'object',
    'meta:intendedToExtend': ['https://ns.adobe.com/xdm/context/profile'],
    definitions: {
      customFields: {
        type: 'object',
        properties: {
          [tenantKey]: {
            type: 'object',
            properties: createSpec.properties || {},
          },
        },
      },
    },
    allOf: [{ $ref: '#/definitions/customFields', type: 'object', 'meta:xdmType': 'object' }],
  };
}

/* -------------------- Factory -------------------- */

function createProfileInfraService(config) {
  if (!config || typeof config !== 'object') {
    throw new Error('createProfileInfraService: config object required');
  }
  const {
    industryKey,
    schemaTitle,
    schemaDescription,
    datasetName,
    datasetDescription,
    dataflowName,
    industryFieldGroups = [],
    tenantSubtreePrefix = null,
    industryDisplayName,
  } = config;

  if (!industryKey || !schemaTitle || !datasetName || !dataflowName) {
    throw new Error('createProfileInfraService: industryKey, schemaTitle, datasetName, dataflowName all required');
  }

  const displayName = industryDisplayName || industryKey;
  const logTag = `[${industryKey}ProfileInfra]`;

  const log = (sandbox, phase, detail = {}) => {
    try {
      console.log(logTag, JSON.stringify({ sandbox, phase, ...detail }));
    } catch (_) {
      console.log(logTag, sandbox, phase);
    }
  };

  /* ---- Schema registry helpers ---- */

  async function discoverTenantContext(token, clientId, orgId, sandbox) {
    log(sandbox, 'discoverTenant.start', {});
    const url = `${SCHEMA_REGISTRY}/tenant/schemas?limit=10&properties=title,$id,meta:altId`;
    const { res, data } = await fetchJson(url, { method: 'GET', headers: headersXed(token, clientId, orgId, sandbox) });
    if (!res.ok) {
      const msg = extractAepErrorMessage(data, res.statusText);
      log(sandbox, 'discoverTenant.failed', { httpStatus: res.status, msg });
      throw new Error(`Schema list failed (HTTP ${res.status}): ${msg}`);
    }
    const results = data.results || [];
    for (const s of results) {
      const tid = parseTenantFromUri(s.$id);
      if (tid) {
        log(sandbox, 'discoverTenant.ok', { tenantId: tid, xdmKey: xdmKeyFromTenantId(tid) });
        return { tenantId: tid, xdmKey: xdmKeyFromTenantId(tid), sampleSchemaId: s.$id };
      }
    }
    log(sandbox, 'discoverTenant.noTenantSchema', { scanned: results.length });
    throw new Error(
      'Could not discover XDM tenant id: no tenant schemas in this sandbox. Create any tenant schema first, or use a sandbox with existing XDM resources.'
    );
  }

  async function listTenantFieldGroups(token, clientId, orgId, sandbox) {
    const base = {
      Authorization: `Bearer ${token}`,
      'x-api-key': clientId,
      'x-gw-ims-org-id': orgId,
      'x-sandbox-name': sandbox,
    };
    const acceptCandidates = [
      'application/vnd.adobe.xed-id+json',
      'application/vnd.adobe.xed+json',
      'application/vnd.adobe.xed-id+json;version=1',
      'application/vnd.adobe.xed+json;version=1',
      'application/vnd.adobe.xdm+json;version=1',
      'application/json',
    ];
    const pathVariants = [
      '/tenant/fieldgroups?limit=200',
      '/tenant/fieldgroups',
      '/tenant/mixins?limit=200',
      '/tenant/mixins',
    ];
    let lastErr = 'Unknown';
    for (const pathSuffix of pathVariants) {
      const url = `${SCHEMA_REGISTRY}${pathSuffix}`;
      for (const accept of acceptCandidates) {
        const { res, data } = await fetchJson(url, { method: 'GET', headers: { ...base, Accept: accept } });
        if (res.ok) {
          const rows = data.results || [];
          log(sandbox, 'listFieldGroupsLike.ok', { path: pathSuffix.split('?')[0], count: rows.length });
          return rows;
        }
        lastErr = extractAepErrorMessage(data, res.statusText || String(res.status));
        if (!/accept header/i.test(String(lastErr))) {
          throw new Error(`Tenant field groups list failed (HTTP ${res.status}): ${lastErr}`);
        }
      }
    }
    throw new Error(`Tenant field groups list failed: ${lastErr}`);
  }

  /**
   * List Adobe-OOTB Profile-class field groups from /global/fieldgroups.
   * Used by the `ootbByIndustryTag` resolver source. Mirrors
   * `listTenantFieldGroups` (same accept-header fallback strategy) but hits
   * the global endpoint AND deliberately omits the `?properties=` filter so
   * `meta:intendedToExtend` and `meta:industries` come back populated (the
   * filtered list strips them — verified in the apalmer probe).
   *
   * Paginated through `_links.next`; bounded at 30 pages (= 6,000 rows) to
   * cap worst-case latency. Returns an empty list on any unrecoverable error
   * so a /global outage never breaks the wizard for users whose tenant FGs
   * already cover the industry.
   */
  async function listGlobalOotbFieldGroups(token, clientId, orgId, sandbox) {
    const base = {
      Authorization: `Bearer ${token}`,
      'x-api-key': clientId,
      'x-gw-ims-org-id': orgId,
      'x-sandbox-name': sandbox,
    };
    const acceptCandidates = [
      'application/vnd.adobe.xed+json',
      'application/vnd.adobe.xed+json;version=1',
      'application/vnd.adobe.xed-id+json',
      'application/json',
    ];
    const out = [];
    let url = `${SCHEMA_REGISTRY}/global/fieldgroups?limit=100`;
    for (let page = 0; page < 30; page++) {
      let pageOk = false;
      for (const accept of acceptCandidates) {
        const { res, data } = await fetchJson(url, { method: 'GET', headers: { ...base, Accept: accept } });
        if (res.ok) {
          out.push(...(data.results || []));
          const next =
            data._links?.next?.href ||
            (typeof data._links?.next === 'string' ? data._links.next : null) ||
            (typeof data._page?.next === 'string' ? data._page.next : null);
          if (!next) {
            pageOk = true;
            url = '';
          } else {
            url = next.startsWith('http') ? next : `https://platform.adobe.io${next.startsWith('/') ? next : `/${next}`}`;
            pageOk = true;
          }
          break;
        }
        // 406/415 → try the next accept; anything else → bail to keep this
        // helper non-fatal (caller treats empty list as "nothing to discover").
        if (res.status !== 406 && res.status !== 415) {
          log(sandbox, 'listGlobalFieldGroups.failed', {
            httpStatus: res.status,
            msg: extractAepErrorMessage(data, res.statusText),
          });
          return out;
        }
      }
      if (!pageOk || !url) break;
    }
    log(sandbox, 'listGlobalFieldGroups.ok', { count: out.length });
    return out;
  }

  /**
   * POST a new tenant Profile-class field group. Body is built by
   * `buildTenantFieldGroupCreateBody(tenantId, createSpec)`. Uses the same
   * accept-fallback as `postTenantSchemaCreate` because the registry
   * occasionally rotates which media types it accepts on POST.
   *
   * Returns the created FG row ($id, meta:altId, version, ...). Throws on
   * unrecoverable errors so the orchestrator can surface a clear failure.
   */
  async function createTenantFieldGroup(token, clientId, orgId, sandbox, body) {
    const url = `${SCHEMA_REGISTRY}/tenant/fieldgroups`;
    const baseHeaders = {
      Authorization: `Bearer ${token}`,
      'x-api-key': clientId,
      'x-gw-ims-org-id': orgId,
      'x-sandbox-name': sandbox,
      'Content-Type': 'application/json',
    };
    const acceptOrder = [
      'application/vnd.adobe.xed+json',
      'application/vnd.adobe.xed+json;version=1',
      ACCEPT_XED,
      ACCEPT_XDM,
      'application/json',
    ];
    let lastErr = 'Unknown';
    for (const accept of acceptOrder) {
      const { res, data } = await fetchJson(url, {
        method: 'POST',
        headers: { ...baseHeaders, Accept: accept },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        log(sandbox, 'createTenantFieldGroup.ok', {
          title: body.title,
          $id: data.$id,
          acceptUsed: accept.slice(0, 48),
        });
        return data;
      }
      lastErr = extractAepErrorMessage(data, res.statusText || String(res.status));
      const retry = res.status === 415 || res.status === 406 || /unsupported media type|not acceptable/i.test(String(lastErr));
      if (!retry) {
        throw new Error(`Create tenant field group "${body.title}" failed (HTTP ${res.status}): ${lastErr}`);
      }
    }
    throw new Error(`Create tenant field group "${body.title}" failed: ${lastErr}`);
  }

  async function listAllTenantSchemas(token, clientId, orgId, sandbox) {
    const out = [];
    let url = `${SCHEMA_REGISTRY}/tenant/schemas?limit=100&properties=title,$id,meta:altId,version`;
    for (let page = 0; page < 50; page++) {
      const { res, data } = await fetchJson(url, { method: 'GET', headers: headersXed(token, clientId, orgId, sandbox) });
      if (!res.ok) break;
      const results = data.results || [];
      out.push(...results);
      const next =
        data._links?.next?.href ||
        (typeof data._links?.next === 'string' ? data._links.next : null) ||
        (typeof data._page?.next === 'string' ? data._page.next : null);
      if (!next) break;
      url = next.startsWith('http') ? next : `https://platform.adobe.io${next.startsWith('/') ? next : `/${next}`}`;
    }
    return out;
  }

  function findOurSchema(schemas) {
    const norm = (t) => String(t || '').trim();
    return schemas.find((s) => norm(s.title) === schemaTitle);
  }

  async function getSchemaByAltId(token, clientId, orgId, sandbox, metaAltId) {
    const enc = encodeURIComponent(metaAltId);
    const url = `${SCHEMA_REGISTRY}/tenant/schemas/${enc}`;
    const { res, data } = await fetchJson(url, { method: 'GET', headers: headersXed(token, clientId, orgId, sandbox) });
    if (!res.ok) return null;
    return data;
  }

  async function postTenantSchemaCreate(token, clientId, orgId, sandbox, body) {
    const url = `${SCHEMA_REGISTRY}/tenant/schemas`;
    const baseHeaders = {
      Authorization: `Bearer ${token}`,
      'x-api-key': clientId,
      'x-gw-ims-org-id': orgId,
      'x-sandbox-name': sandbox,
      'Content-Type': 'application/json',
    };
    const acceptOrder = [
      'application/vnd.adobe.xed+json',
      'application/vnd.adobe.xed+json;version=1',
      ACCEPT_XED,
      ACCEPT_XDM,
      'application/json',
    ];
    let lastErr = 'Unknown';
    for (const accept of acceptOrder) {
      const { res, data } = await fetchJson(url, {
        method: 'POST',
        headers: { ...baseHeaders, Accept: accept },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        log(sandbox, 'postTenantSchema.ok', { acceptUsed: accept.slice(0, 48) });
        return data;
      }
      lastErr = extractAepErrorMessage(data, res.statusText || String(res.status));
      const retry = res.status === 415 || res.status === 406 || /unsupported media type|not acceptable/i.test(String(lastErr));
      if (!retry) throw new Error(`Create schema failed (HTTP ${res.status}): ${lastErr}`);
    }
    throw new Error(`Create schema failed: ${lastErr}`);
  }

  function buildSchemaShellBody() {
    const description =
      schemaDescription ||
      `AEP Lab ${displayName} Profile schema (Profile-enabled). Used by the Generate Profiles page (${displayName} industry) to stream sample customer profiles into Real-Time Customer Profile.`;
    return {
      title: schemaTitle,
      type: 'object',
      description,
      allOf: [{ $ref: 'https://ns.adobe.com/xdm/context/profile' }],
      'meta:class': 'https://ns.adobe.com/xdm/context/profile',
    };
  }

  async function createSchemaShell(token, clientId, orgId, sandbox) {
    return postTenantSchemaCreate(token, clientId, orgId, sandbox, buildSchemaShellBody());
  }

  /**
   * Build PATCH ops for the base Generic FG set + Profile Core v2 + every
   * resolved entry from `industryFieldGroups`. Returns both the ops list
   * and the resolution report so the wizard step can surface what was added.
   *
   * @param fullSchema           Latest tenant schema (for `existing` ref dedupe)
   * @param profileCoreMixinId   Resolved Profile Core v2 $id
   * @param tenantFgList         Latest /tenant/fieldgroups list (for tenantTitlePattern)
   * @param globalFgList         Latest /global/fieldgroups list (for ootbByIndustryTag)
   *
   * Returns:
   *   ops              - JSON-Patch ops to apply
   *   resolvedIndustry - { label, ref, source } per attached industry FG
   *                      (includes both curated `ootb` $ids and entries
   *                      discovered via `ootbByIndustryTag` — the discovered
   *                      ones are also surfaced separately as `discovered`)
   *   skippedOptional  - optional entries the resolver could not satisfy
   *   needsCreate      - tenantTitlePattern entries that have a
   *                      `createIfMissing` spec but did not resolve; the
   *                      orchestrator must POST these and re-call this
   *                      function with refreshed lists
   *   discovered       - subset of `resolvedIndustry` from `ootbByIndustryTag`
   */
  function buildAttachFieldGroupPatchOps(fullSchema, profileCoreMixinId, tenantFgList, globalFgList) {
    const existing = collectSchemaRefUris(fullSchema);
    const targetRefs = [...BASE_PROFILE_FIELD_GROUP_REFS, String(profileCoreMixinId)];

    /** @type {{label: string, ref: string, source: string}[]} */
    const resolvedIndustry = [];
    /** @type {{entry: object, reason: string}[]} */
    const skippedOptional = [];
    /** @type {{entry: object, spec: object, label: string}[]} */
    const needsCreate = [];
    /** @type {{label: string, ref: string}[]} */
    const discovered = [];

    for (const entry of industryFieldGroups) {
      const r = resolveIndustryFgEntry(entry, tenantFgList, globalFgList);
      if (r.resolved) {
        if (Array.isArray(r.refs)) {
          // ootbByIndustryTag returns multiple refs in a single resolution.
          for (const item of r.refs) {
            if (!item.ref || targetRefs.includes(item.ref)) continue;
            targetRefs.push(item.ref);
            resolvedIndustry.push({ label: item.label, ref: item.ref, source: entry.source });
            discovered.push({ label: item.label, ref: item.ref });
          }
        } else if (r.ref) {
          if (!targetRefs.includes(r.ref)) {
            targetRefs.push(r.ref);
            resolvedIndustry.push({ label: r.label, ref: r.ref, source: entry.source });
          }
        }
      } else if (r.needsCreate) {
        needsCreate.push({ entry, spec: r.needsCreate.spec, label: r.needsCreate.label });
      } else if (r.optional) {
        skippedOptional.push({ entry, reason: r.reason });
      } else {
        // Required entry that did not resolve -> fail-fast with a clear message.
        throw new Error(
          `Required field group could not be resolved for ${displayName}: ${r.reason}. Either import it into this sandbox or mark the entry optional in industryFieldGroups.`
        );
      }
    }

    const ops = [];
    for (const ref of targetRefs) {
      if (!ref || existing.has(ref)) continue;
      ops.push({ op: 'add', path: '/meta:extends/-', value: ref });
      ops.push({ op: 'add', path: '/allOf/-', value: { $ref: ref } });
      existing.add(ref);
    }

    return { ops, resolvedIndustry, skippedOptional, needsCreate, discovered, requiredRefs: targetRefs };
  }

  async function patchSchemaJsonPatch(token, clientId, orgId, sandbox, metaAltId, operations) {
    if (!operations || operations.length === 0) return null;
    const enc = encodeURIComponent(metaAltId);
    const url = `${SCHEMA_REGISTRY}/tenant/schemas/${enc}`;
    let ifMatch = '1';
    // Up to 6 attempts so we cover both the precondition-conflict retry
    // case (412 / 428) and the AEP propagation window where the schema
    // appears in the listing index seconds before it becomes retrievable
    // by altId. Backoff for 404: 1.5s, 3s, 4.5s, 6s, 7.5s — total ~22s.
    const NOT_FOUND_BACKOFF_MS = [1500, 3000, 4500, 6000, 7500];
    for (let attempt = 0; attempt < 6; attempt++) {
      const full = await getSchemaByAltId(token, clientId, orgId, sandbox, metaAltId);
      if (full && full.version != null) ifMatch = String(full.version);
      const { res, data } = await fetchJson(url, {
        method: 'PATCH',
        headers: {
          ...headersJson(token, clientId, orgId, sandbox),
          'If-Match': ifMatch,
        },
        body: JSON.stringify(operations),
      });
      if (res.ok) return data;
      if (res.status === 412 || res.status === 428) {
        log(sandbox, 'patchSchema.preconditionRetry', { attempt, status: res.status });
        continue;
      }
      if (res.status === 404 && attempt < NOT_FOUND_BACKOFF_MS.length) {
        log(sandbox, 'patchSchema.notFoundRetry', {
          attempt,
          metaAltId,
          backoffMs: NOT_FOUND_BACKOFF_MS[attempt],
        });
        await new Promise((r) => setTimeout(r, NOT_FOUND_BACKOFF_MS[attempt]));
        continue;
      }
      const msg = extractAepErrorMessage(data, res.statusText);
      throw new Error(`Schema PATCH failed: HTTP ${res.status} — ${msg} (altId: ${metaAltId})`);
    }
    throw new Error(
      `Schema PATCH failed: gave up after 6 attempts (last status seen for altId ${metaAltId} was 404 — AEP eventual-consistency window may be longer than usual; refresh the page and re-run step 2).`
    );
  }

  /** Status check: every required FG ref must be present on the schema.
   *
   * Optional entries (which today is essentially every industry entry — see
   * the per-industry config files) never block readiness, so this function
   * only inspects required `tenantTitlePattern` / `ootb` entries. The
   * `ootbByIndustryTag` source is always optional by definition (zero matches
   * is a valid outcome — Adobe simply hasn't shipped a Profile-class FG for
   * that industry). The global list is therefore not needed here today, but
   * is accepted for symmetry with `attachFieldGroupsAndDescriptor` and for
   * future entries that might mark a discovered FG as required.
   */
  function profileFieldGroupsComplete(fullSchema, profileCoreMixinId, tenantFgList, globalFgList) {
    if (!fullSchema || !profileCoreMixinId) return false;
    const refs = collectSchemaRefUris(fullSchema);

    const need = [
      'https://ns.adobe.com/xdm/context/profile',
      ...BASE_PROFILE_FIELD_GROUP_REFS,
      String(profileCoreMixinId),
    ];

    for (const entry of industryFieldGroups) {
      if (entry.optional === true) continue;
      const r = resolveIndustryFgEntry(entry, tenantFgList, globalFgList);
      if (r.resolved) {
        if (r.ref) need.push(r.ref);
        if (Array.isArray(r.refs)) for (const x of r.refs) need.push(x.ref);
      }
    }

    return need.every((r) => refs.has(r));
  }

  /* ---- Identity descriptor ---- */

  async function listDescriptorsForSchema(token, clientId, orgId, sandbox, schemaId, schemaMetaAltId) {
    const filterBySchema = (uri) =>
      `${SCHEMA_REGISTRY}/tenant/descriptors?limit=500&property=${encodeURIComponent(`xdm:sourceSchema==${uri}`)}`;
    const startUrls = [];
    if (schemaId) startUrls.push(filterBySchema(schemaId));
    if (schemaMetaAltId && schemaMetaAltId !== schemaId) startUrls.push(filterBySchema(schemaMetaAltId));
    startUrls.push(`${SCHEMA_REGISTRY}/tenant/descriptors?limit=500`);
    const acceptOrder = ['application/vnd.adobe.xdm+json', 'application/vnd.adobe.xdm-v2+json'];
    const baseHeaders = {
      Authorization: `Bearer ${token}`,
      'x-api-key': clientId,
      'x-gw-ims-org-id': orgId,
      'x-sandbox-name': sandbox,
    };
    for (const accept of acceptOrder) {
      for (const startUrl of startUrls) {
        const { res, data } = await fetchJson(startUrl, {
          method: 'GET',
          headers: { ...baseHeaders, Accept: accept },
        });
        if (!res.ok) continue;
        const merged = collectDescriptorResults(data);
        const filtered = merged.filter((d) => {
          if (!d) return false;
          return descriptorSourceSchemaMatches(d['xdm:sourceSchema'], schemaId, schemaMetaAltId);
        });
        if (filtered.length > 0) return filtered;
      }
    }
    return [];
  }

  async function createPrimaryEmailDescriptor(token, clientId, orgId, sandbox, schemaId, sourceVersion, xdmKey) {
    const tenant = String(xdmKey || '_demoemea').replace(/^_/, '');
    const sourceProperty = `/_${tenant}/identification/core/email`;
    const body = {
      '@type': 'xdm:descriptorIdentity',
      'xdm:sourceSchema': schemaId,
      'xdm:sourceVersion': sourceVersion,
      'xdm:sourceProperty': sourceProperty,
      'xdm:namespace': 'Email',
      'xdm:property': 'xdm:code',
      'xdm:isPrimary': true,
    };
    const url = `${SCHEMA_REGISTRY}/tenant/descriptors`;
    const base = {
      Authorization: `Bearer ${token}`,
      'x-api-key': clientId,
      'x-gw-ims-org-id': orgId,
      'x-sandbox-name': sandbox,
    };
    const attempts = [
      { 'Content-Type': 'application/json', Accept: ACCEPT_XDM },
      { 'Content-Type': 'application/json', Accept: ACCEPT_XED },
    ];
    let lastErr = '';
    let lastStatus = 0;
    for (const h of attempts) {
      const { res, data } = await fetchJson(url, {
        method: 'POST',
        headers: { ...base, ...h },
        body: JSON.stringify(body),
      });
      if (res.ok) return data;
      lastStatus = res.status;
      lastErr = extractAepErrorMessage(data, res.statusText);
      if (res.status !== 415 && !/unsupported media type/i.test(String(lastErr))) {
        throw new Error(`Create identity descriptor failed (HTTP ${res.status}): ${lastErr}`);
      }
    }
    throw new Error(`Create identity descriptor failed (HTTP ${lastStatus}): ${lastErr}`);
  }

  /**
   * Wait for a freshly-POSTed tenant FG to appear in /tenant/fieldgroups.
   * AEP's eventual-consistency window is usually <1s but can stretch to 5-7s
   * under load. Backoff `[800, 1500, 2500, 4000]` ms = ~9s worst case.
   * Returns the refreshed list (which may or may not yet contain the new FG;
   * callers must re-resolve and decide whether to keep waiting).
   */
  async function relistTenantFieldGroupsUntilSeen(token, clientId, orgId, sandbox, expectedIds) {
    const expected = new Set((expectedIds || []).filter(Boolean).map(String));
    const BACKOFF_MS = [0, 800, 1500, 2500, 4000];
    let last = await listTenantFieldGroups(token, clientId, orgId, sandbox);
    for (let i = 0; i < BACKOFF_MS.length; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, BACKOFF_MS[i]));
      if (i > 0) last = await listTenantFieldGroups(token, clientId, orgId, sandbox);
      const seen = new Set(last.map((r) => String(r.$id || '')));
      let allSeen = true;
      for (const id of expected) {
        if (!seen.has(id)) {
          allSeen = false;
          break;
        }
      }
      if (allSeen) {
        log(sandbox, 'relistTenantFieldGroups.allSeen', { attempts: i + 1, expected: [...expected] });
        return last;
      }
    }
    log(sandbox, 'relistTenantFieldGroups.timeout', { expected: [...expected] });
    return last;
  }

  /**
   * Fetch one tenant field group body by its `meta:altId` with the given
   * Accept variant (raw authoring `xed+json` OR resolved `xed-full+json`).
   *
   * Returns the parsed body on 2xx; throws with a clean message otherwise.
   */
  async function getTenantFieldGroupByAltId(token, clientId, orgId, sandbox, metaAltId, accept) {
    const enc = encodeURIComponent(metaAltId);
    const url = `${SCHEMA_REGISTRY}/tenant/fieldgroups/${enc}`;
    const { res, data } = await fetchJson(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-api-key': clientId,
        'x-gw-ims-org-id': orgId,
        'x-sandbox-name': sandbox,
        Accept: accept || ACCEPT_XED,
      },
    });
    if (!res.ok) {
      const msg = extractAepErrorMessage(data, res.statusText);
      throw new Error(`Get field group ${metaAltId} failed: HTTP ${res.status} — ${msg}`);
    }
    return data;
  }

  /**
   * PATCH a tenant field group with JSON-Patch ADD ops. Concurrency-safe:
   * uses `If-Match` with the current FG version and retries once on 409 /
   * 412 / 428 (re-GET, recompute diff via the caller's closure, retry).
   *
   * Header contract — verified live against `kirkham` sandbox Apr 2026:
   *   - Content-Type : `application/json`
   *       Adobe's Schema Registry gateway rejects `application/json-patch+json`
   *       on /tenant/fieldgroups/{altId} PATCH with HTTP 415
   *       "Content-Type 'application/json-patch+json' is not supported."
   *       The body still IS a JSON-Patch ARRAY ([ {op,path,value}, … ]) —
   *       the registry parses it as a JSON document, not as a patch type.
   *   - Accept       : `application/vnd.adobe.xed+json;version=1`
   *       Returns the new FG body so the caller can verify the version bump.
   *   - If-Match     : `<current FG version>` (e.g. "1.6")
   *       Required for optimistic concurrency. On 412/428/409 the caller
   *       re-GETs and retries with the new version.
   *
   * @param {string[]} ops      JSON-Patch array (already validated upstream)
   * @param {string}   altId    FG `meta:altId`
   * @param {string}   version  current FG version string (e.g. "1.5")
   */
  async function patchTenantFieldGroupJsonPatch(token, clientId, orgId, sandbox, altId, version, ops) {
    if (!ops || ops.length === 0) return { ok: true, applied: false };
    const enc = encodeURIComponent(altId);
    const url = `${SCHEMA_REGISTRY}/tenant/fieldgroups/${enc}`;
    const { res, data } = await fetchJson(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'x-api-key': clientId,
        'x-gw-ims-org-id': orgId,
        'x-sandbox-name': sandbox,
        'Content-Type': ACCEPT_JSON,
        Accept: ACCEPT_XED,
        'If-Match': String(version || '1'),
      },
      body: JSON.stringify(ops),
    });
    if (res.ok) return { ok: true, applied: true, body: data };
    // Adobe Schema Registry 4xx responses bury the most useful field
    // (e.g. "Descriptor with id <…> already exists") under
    // `report.additionalDetails[].errorReason`. Use the shared extractor
    // so wizard status messages, function logs, and the retry classifier
    // all see the same human-readable detail.
    const detail = extractAepErrorMessage(data, res.statusText);
    return {
      ok: false,
      status: res.status,
      message: detail,
      body: data,
    };
  }

  /**
   * Ensure the local `Profile Core v2` field group contains every tenant-
   * relative leaf the AEP Orchestration Lab streams for the given
   * industry. Missing leaves are ADDED via JSON-Patch (smallest non-
   * overlapping subtree per gap). Never REMOVES or REPLACES existing
   * leaves with a conflicting shape — those are reported as `conflicts`
   * for the operator to resolve manually.
   *
   * Concurrency-safe: on HTTP 409 / 412 / 428 the function re-GETs the
   * FG, recomputes the diff, and retries once. A second conflict fails
   * with a clean message.
   *
   * Return shape:
   *   {
   *     mixinAltId         : string        the FG meta:altId
   *     mixinPriorVersion  : string        version seen BEFORE the PATCH
   *     mixinNewVersion    : string|null   version AFTER the PATCH (null if no PATCH was sent)
   *     added              : string[]      tenant-relative paths newly added
   *     alreadyPresent     : string[]      paths confirmed already present
   *     conflicts          : string[]      paths skipped due to type / $ref conflicts
   *     patchOpCount       : number        # of JSON-Patch ops sent (0 for idempotent no-op runs)
   *   }
   */
  async function topUpProfileCoreV2(token, clientId, orgId, sandbox, profileCore) {
    if (!profileCore || !profileCore['meta:altId']) {
      throw new Error('topUpProfileCoreV2: missing profileCore.meta:altId');
    }
    const altId = profileCore['meta:altId'];
    const manifest = getManifestForIndustry(industryKey);
    const manifestPathCount = Object.keys(manifest).length;

    async function planOnce() {
      const [rawBody, resolvedBody] = await Promise.all([
        getTenantFieldGroupByAltId(token, clientId, orgId, sandbox, altId, ACCEPT_XED),
        getTenantFieldGroupByAltId(token, clientId, orgId, sandbox, altId, ACCEPT_XED_FULL),
      ]);
      const walked = walkResolvedMixinTenantTree(resolvedBody);
      if (!walked.tenantKey) {
        throw new Error(
          `Profile Core v2 has no tenant object (no _<tenant> key under properties). Mixin appears malformed; fix manually before re-running the wizard.`
        );
      }
      const refBlocked = collectRefBlockedAncestorPaths(rawBody);
      const diff = diffManifestAgainstMixin(manifest, walked.presentPathSet, walked.presentNodeMap, refBlocked);
      const ops = buildTopUpJsonPatchOps(walked.tenantKey, diff.needsAdd);
      return { rawBody, resolvedBody, walked, diff, ops };
    }

    let attempt = 0;
    let plan = await planOnce();
    log(sandbox, 'topUpProfileCoreV2.plan', {
      industryKey,
      manifestPathCount,
      presentLeafCount: plan.walked.presentPathSet.size,
      addedPlanCount: plan.diff.needsAdd.length,
      conflictCount: plan.diff.conflicts.length,
      tenantKey: plan.walked.tenantKey,
      mixinVersion: plan.rawBody.version,
    });

    if (plan.ops.length === 0) {
      // Idempotent no-op — nothing to add.
      return {
        mixinAltId: altId,
        mixinPriorVersion: String(plan.rawBody.version || ''),
        mixinNewVersion: null,
        added: [],
        alreadyPresent: plan.diff.alreadyPresent,
        conflicts: plan.diff.conflicts.map((c) => `${c.path} (${c.reason})`),
        patchOpCount: 0,
      };
    }

    let lastError = null;
    while (attempt < 2) {
      const priorVersion = String(plan.rawBody.version || '1');
      const result = await patchTenantFieldGroupJsonPatch(
        token,
        clientId,
        orgId,
        sandbox,
        altId,
        priorVersion,
        plan.ops
      );
      if (result.ok) {
        // Re-GET to verify and capture the new version number.
        const verifyRaw = await getTenantFieldGroupByAltId(token, clientId, orgId, sandbox, altId, ACCEPT_XED);
        const verifyResolved = await getTenantFieldGroupByAltId(token, clientId, orgId, sandbox, altId, ACCEPT_XED_FULL);
        const verifyWalked = walkResolvedMixinTenantTree(verifyResolved);
        const stillMissing = [];
        for (const a of plan.diff.needsAdd) {
          if (!verifyWalked.presentPathSet.has(a.path)) stillMissing.push(a.path);
        }
        if (stillMissing.length) {
          throw new Error(
            `topUpProfileCoreV2 PATCH returned 2xx but post-check could not see: ${stillMissing.join(', ')}. Sandbox: ${sandbox}, altId: ${altId}.`
          );
        }
        log(sandbox, 'topUpProfileCoreV2.patched', {
          industryKey,
          added: plan.diff.needsAdd.map((a) => a.path),
          priorVersion,
          newVersion: verifyRaw.version,
          opCount: plan.ops.length,
        });
        return {
          mixinAltId: altId,
          mixinPriorVersion: priorVersion,
          mixinNewVersion: String(verifyRaw.version || ''),
          added: plan.diff.needsAdd.map((a) => a.path),
          alreadyPresent: plan.diff.alreadyPresent,
          conflicts: plan.diff.conflicts.map((c) => `${c.path} (${c.reason})`),
          patchOpCount: plan.ops.length,
        };
      }
      lastError = result;
      const retriable = result.status === 409 || result.status === 412 || result.status === 428;
      if (!retriable || attempt >= 1) break;
      log(sandbox, 'topUpProfileCoreV2.retryOnConflict', {
        attempt,
        status: result.status,
        message: String(result.message || '').slice(0, 240),
      });
      attempt++;
      plan = await planOnce();
      if (plan.ops.length === 0) {
        // Someone else patched in the same paths while we were waiting.
        return {
          mixinAltId: altId,
          mixinPriorVersion: String(plan.rawBody.version || ''),
          mixinNewVersion: null,
          added: [],
          alreadyPresent: plan.diff.alreadyPresent,
          conflicts: plan.diff.conflicts.map((c) => `${c.path} (${c.reason})`),
          patchOpCount: 0,
        };
      }
    }
    throw new Error(
      `Profile Core v2 top-up PATCH failed in sandbox ${sandbox} after ${attempt + 1} attempt(s): HTTP ${lastError && lastError.status} — ${(lastError && lastError.message) || 'unknown'}. AltId: ${altId}.`
    );
  }

  async function attachFieldGroupsAndDescriptor(token, clientId, orgId, sandbox, tenantCtx, profileCore, schemaRow, tenantFgList, globalFgList) {
    const metaAltId = schemaRow['meta:altId'];
    const schemaId = schemaRow.$id;
    let full = (await getSchemaByAltId(token, clientId, orgId, sandbox, metaAltId)) || schemaRow;

    // Step 2a: sandbox-drift guard. Ensure the local Profile Core v2 mixin
    // contains every tenant-relative leaf this industry streams. ADD-only
    // (never REMOVE/REPLACE); conflicts are reported non-fatally so the
    // wizard continues even if a type-conflicting leaf exists. Runs BEFORE
    // the FG is attached to the industry schema — subsequent streams from
    // the lab therefore see a Profile Core v2 shape that actually types
    // every path the UI sends.
    /** @type {object} */
    let topUp = { skipped: true, reason: 'no altId' };
    if (profileCore && profileCore['meta:altId']) {
      try {
        topUp = await topUpProfileCoreV2(token, clientId, orgId, sandbox, profileCore);
      } catch (e) {
        // Non-fatal: log and surface the error in the response so the
        // operator can see WHY top-up failed, but let the wizard proceed
        // to attach the existing Profile Core v2 shape. The industry FG
        // attachment still provides the industry-specific paths.
        const msg = String(e.message || e);
        log(sandbox, 'topUpProfileCoreV2.failedNonFatal', { error: msg.slice(0, 400) });
        topUp = { skipped: true, error: msg };
      }
    }

    // First pass: see whether any tenantTitlePattern entries need creation.
    let workingTenantList = tenantFgList;
    let planResult = buildAttachFieldGroupPatchOps(full, profileCore.$id, workingTenantList, globalFgList);

    /** @type {{title: string, $id: string, source: string}[]} */
    const created = [];

    if (planResult.needsCreate.length) {
      const newIds = [];
      for (const item of planResult.needsCreate) {
        const body = buildTenantFieldGroupCreateBody(tenantCtx.tenantId, item.spec);
        let createdRow;
        try {
          createdRow = await createTenantFieldGroup(token, clientId, orgId, sandbox, body);
        } catch (e) {
          const msg = String(e.message || e);
          // 409 / duplicate — someone (or a previous run) created it between
          // our list and our POST. Re-list will pick it up; treat as success.
          if (/409|already exists|duplicate|conflict/i.test(msg)) {
            log(sandbox, 'createTenantFieldGroup.alreadyExists', { title: item.spec.title });
            continue;
          }
          // Optional-entry create failure: log and continue (the wizard can
          // still complete with the remaining FGs and the tenant subtree
          // fallback). Required-entry failures throw.
          if (item.entry.optional === true) {
            log(sandbox, 'createTenantFieldGroup.optionalFailed', { title: item.spec.title, error: msg.slice(0, 240) });
            continue;
          }
          throw e;
        }
        if (createdRow && createdRow.$id) {
          newIds.push(String(createdRow.$id));
          created.push({ title: createdRow.title || item.spec.title, $id: String(createdRow.$id), source: 'tenantTitlePattern.createIfMissing' });
        }
      }
      // Wait for the registry to surface the new FGs in the listing endpoint
      // (eventual consistency), then re-plan with the refreshed list.
      if (newIds.length) {
        workingTenantList = await relistTenantFieldGroupsUntilSeen(token, clientId, orgId, sandbox, newIds);
        planResult = buildAttachFieldGroupPatchOps(full, profileCore.$id, workingTenantList, globalFgList);
      }
    }

    let patchApplied = false;
    if (planResult.ops.length) {
      await patchSchemaJsonPatch(token, clientId, orgId, sandbox, metaAltId, planResult.ops);
      patchApplied = true;
      full = (await getSchemaByAltId(token, clientId, orgId, sandbox, metaAltId)) || full;
    }
    const sourceVersion = Number(full.version) || 1;
    const existingDesc = await listDescriptorsForSchema(token, clientId, orgId, sandbox, schemaId, metaAltId);
    const hasPrimaryEmail = existingDesc.some((d) => isPrimaryEmailIdentityDescriptor(d));
    let descriptorOk = hasPrimaryEmail;
    if (!hasPrimaryEmail) {
      try {
        await createPrimaryEmailDescriptor(token, clientId, orgId, sandbox, schemaId, sourceVersion, tenantCtx.xdmKey);
        descriptorOk = true;
      } catch (e) {
        // Idempotency: if AEP rejects because the descriptor already exists
        // (we missed it in the pre-check above due to filter encoding /
        // shape variance), treat that as success. Now that
        // createPrimaryEmailDescriptor surfaces the buried
        // `report.additionalDetails[].errorReason`, the duplicate signal
        // ("Descriptor with id <…> already exists", under a generic
        // top-level title like "Descriptor validation error") arrives in
        // the message and `looksLikeAlreadyExists` matches it.
        const msg = String(e.message || e);
        if (looksLikeAlreadyExists(msg)) {
          log(sandbox, 'createPrimaryEmailDescriptor.alreadyExists', { msg: msg.slice(0, 240) });
          descriptorOk = true;
        } else {
          throw e;
        }
      }
    }
    return {
      patchApplied,
      descriptorOk,
      fullSchema: full,
      resolvedIndustry: planResult.resolvedIndustry,
      skippedOptional: planResult.skippedOptional,
      created,
      discovered: planResult.discovered,
      profileCoreV2TopUp: topUp,
    };
  }

  /* ---- Catalog / dataset helpers ---- */

  async function paginateDataSets(token, clientId, orgId, sandbox) {
    const pages = [];
    let url = `${CATALOG_BASE}/dataSets?limit=100&properties=name,schemaRef,tags`;
    for (let i = 0; i < 100; i++) {
      const { res, data } = await fetchJson(url, { method: 'GET', headers: headersJson(token, clientId, orgId, sandbox) });
      if (!res.ok) {
        const msg = extractAepErrorMessage(data, res.statusText);
        throw new Error(`Catalog dataSets failed (HTTP ${res.status}): ${msg}`);
      }
      pages.push(data);
      const next = data._links?.next?.href || data._page?.next;
      if (!next) break;
      url = next.startsWith('http') ? next : `https://platform.adobe.io${next.startsWith('/') ? next : `/${next}`}`;
    }
    return pages;
  }

  function findDatasetForSchema(datasets, schemaId, schemaMetaAltId) {
    if (!schemaId) return undefined;
    const byRef = datasets.find((d) => {
      const refId = d?.schemaRef?.id;
      if (!refId) return false;
      if (refId === schemaId) return true;
      if (schemaMetaAltId && refId === schemaMetaAltId) return true;
      const a = String(schemaId).replace(/\/+$/, '');
      const b = String(refId).replace(/\/+$/, '');
      return a === b;
    });
    if (byRef) return byRef;
    return datasets.find((d) => d && String(d.name || '') === datasetName);
  }

  async function listDataSetsByPropertyFilter(token, clientId, orgId, sandbox, propertyExpr) {
    const url = `${CATALOG_BASE}/dataSets?limit=50&properties=name,schemaRef,tags&property=${encodeURIComponent(propertyExpr)}`;
    const { res, data } = await fetchJson(url, { method: 'GET', headers: headersJson(token, clientId, orgId, sandbox) });
    if (!res.ok) return [];
    return flattenDatasets([data]);
  }

  /**
   * Catalog metadata field that AEP requires on Profile-enabled streaming
   * datasets. The Catalog API now (verified May 2026 against gerdos) rejects
   * `PATCH /dataSets/<id>` with HTTP 422 — `Field 'adobe/siphon/table/format'
   * cannot be empty or blank` — when the resulting tags object would not
   * contain a non-empty value for this key. The canonical value for the
   * Delta-Lake-backed at-rest format AEP Profile expects is `delta` —
   * verified live against every Profile-enabled dataset in apalmer, kirkham,
   * and gerdos (see /tmp/aep-probe-dataset-format.json).
   *
   * NOTE: this is the value stored in `tags["adobe/siphon/table/format"]`
   * on the Catalog dataset (NOT the same as `fileDescription.format`, which
   * is `"parquet"` on every dataset). The two are different metadata
   * surfaces — `tags` is what the Profile-enable PATCH validates, so this
   * is what we set.
   */
  const ADOBE_SIPHON_TABLE_FORMAT_KEY = 'adobe/siphon/table/format';
  const ADOBE_SIPHON_TABLE_FORMAT_VALUE = ['delta'];

  function tagValueIsEmpty(v) {
    if (v == null) return true;
    if (Array.isArray(v)) return v.length === 0 || v.every((s) => String(s ?? '').trim().length === 0);
    return String(v).trim().length === 0;
  }

  async function createDataset(token, clientId, orgId, sandbox, schemaId, name) {
    const description =
      datasetDescription ||
      `AEP Lab ${displayName} Profile streaming dataset (Profile-enabled). Sourced via HTTP API streaming for ${displayName}-industry sample profile generation in this lab.`;
    const body = {
      name,
      description,
      schemaRef: {
        id: schemaId,
        contentType: 'application/vnd.adobe.xed+json;version=1',
      },
      tags: {
        unifiedProfile: ['enabled:true'],
        // Required by the Catalog API on Profile-enabled streaming datasets.
        // Without it, subsequent PATCHes (e.g. re-enabling Profile) fail with
        // HTTP 422 "Field 'adobe/siphon/table/format' cannot be empty or blank".
        // See ADOBE_SIPHON_TABLE_FORMAT_VALUE comment above for sourcing.
        [ADOBE_SIPHON_TABLE_FORMAT_KEY]: ADOBE_SIPHON_TABLE_FORMAT_VALUE,
      },
    };
    const url = `${CATALOG_BASE}/dataSets`;
    const { res, data } = await fetchJson(url, {
      method: 'POST',
      headers: {
        ...headersJson(token, clientId, orgId, sandbox),
        Accept: 'application/vnd.adobe.xdm+json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const msg = extractAepErrorMessage(data, res.statusText);
      throw new Error(`Create dataset failed (HTTP ${res.status}): ${msg}`);
    }
    if (Array.isArray(data) && data[0] && typeof data[0] === 'string') {
      const m = data[0].match(/@\/dataSets\/([0-9a-fA-F]+)/);
      if (m) return { id: m[1], raw: data };
    }
    if (data && data.id) return data;
    return { id: null, raw: data };
  }

  async function getDatasetById(token, clientId, orgId, sandbox, datasetId) {
    if (!datasetId) return null;
    const url = `${CATALOG_BASE}/dataSets/${encodeURIComponent(datasetId)}`;
    const { res, data } = await fetchJson(url, {
      method: 'GET',
      headers: headersJson(token, clientId, orgId, sandbox),
    });
    if (!res.ok) return null;
    // Catalog GET-by-id returns `{ <id>: { ...dataset } }`. Unwrap so callers
    // get the dataset object directly.
    if (data && typeof data === 'object' && !Array.isArray(data) && data[datasetId] && typeof data[datasetId] === 'object') {
      return { id: datasetId, ...data[datasetId] };
    }
    return data;
  }

  /**
   * PATCH `tags.unifiedProfile = ['enabled:true']` on a streaming dataset,
   * preserving every other tag key that already exists AND ensuring the
   * Catalog-required `adobe/siphon/table/format` key is non-empty.
   *
   * AEP's `/data/foundation/catalog/dataSets/<id>` PATCH treats the `tags`
   * object as a REPLACE on PATCH (not a merge) — so a PATCH body of just
   * `{ tags: { unifiedProfile: [...] } }` would erase all the other tag
   * keys AND trigger HTTP 422 "Field 'adobe/siphon/table/format' cannot
   * be empty or blank". This helper avoids both by:
   *   1. GETting the current dataset to read the live tags object.
   *   2. Merging in `unifiedProfile: ['enabled:true']` and (if missing /
   *      empty) `adobe/siphon/table/format: ['delta']`.
   *   3. PATCHing the merged tags object.
   *
   * Idempotent: if the dataset is already Profile-enabled AND the format
   * field is already non-empty, the function returns `{ ok: true,
   * skipped: true }` without sending a PATCH.
   */
  async function enableProfileOnDataset(token, clientId, orgId, sandbox, datasetId) {
    if (!datasetId) return { ok: false };
    const url = `${CATALOG_BASE}/dataSets/${encodeURIComponent(datasetId)}`;

    const current = await getDatasetById(token, clientId, orgId, sandbox, datasetId);
    const existingTags = (current && current.tags && typeof current.tags === 'object') ? current.tags : {};

    const alreadyProfileEnabled = datasetHasProfileEnabledTag(current);
    const formatPresent = !tagValueIsEmpty(existingTags[ADOBE_SIPHON_TABLE_FORMAT_KEY]);
    if (alreadyProfileEnabled && formatPresent) {
      return { ok: true, skipped: true };
    }

    const mergedTags = { ...existingTags };
    mergedTags.unifiedProfile = ['enabled:true'];
    if (!formatPresent) {
      mergedTags[ADOBE_SIPHON_TABLE_FORMAT_KEY] = ADOBE_SIPHON_TABLE_FORMAT_VALUE;
    }

    const body = { tags: mergedTags };
    const { res, data } = await fetchJson(url, {
      method: 'PATCH',
      headers: { ...headersJson(token, clientId, orgId, sandbox), Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true };
    return { ok: false, error: extractAepErrorMessage(data, res.statusText) };
  }

  /* ---- Step messages ---- */

  function manualFlowSteps() {
    return [
      `In AEP: Sources → Streaming → HTTP API — create a connection and dataflow named "${dataflowName}" targeting dataset "${datasetName}".`,
      `When prompted, accept that the dataset is enabled for Real-Time Customer Profile (intended for ${displayName} Profile, same as Generic).`,
      'After the dataflow is created, click "Fetch URL & Flow ID from AEP" on this page to populate the Collection URL and Flow ID, then click Save connection.',
      `Use Generate or Update to stream ${displayName} profiles via /api/profile/update.`,
    ];
  }

  /**
   * Compose the success message for step 2: the mandatory base set, followed
   * by any industry FGs that resolved in this sandbox, plus any FGs
   * auto-created for this sandbox during this run, plus a summary of the
   * Profile Core v2 drift top-up (added leaves / conflicts / no-op).
   * The base list mirrors the labels operators see in the UI's
   * setup-instructions card so the message is verifiable against what
   * the wizard says it'll do.
   */
  function buildStep2SuccessMessage(resolvedIndustry, patchApplied, created, topUp) {
    const createdFragment =
      created && created.length ? ` (created in this sandbox: ${created.map((c) => c.title).join(', ')})` : '';
    const parts = [];
    if (!patchApplied) {
      parts.push(`Field groups were already present; primary Email identity checked${createdFragment}.`);
    } else {
      const labels = [...BASE_PROFILE_FIELD_GROUP_LABELS];
      for (const r of resolvedIndustry) labels.push(r.label);
      parts.push(`Field groups attached and primary Email identity set (${labels.join(' + ')})${createdFragment}.`);
    }
    if (topUp && !topUp.skipped) {
      if (topUp.added && topUp.added.length) {
        parts.push(`Profile Core v2 patched: added ${topUp.added.length} tenant-subtree leaf/leaves (${topUp.added.join(', ')}).`);
      } else if ((topUp.alreadyPresent || []).length) {
        parts.push('Profile Core v2 already up to date.');
      }
      if (topUp.conflicts && topUp.conflicts.length) {
        parts.push(`Warning: ${topUp.conflicts.length} Profile Core v2 leaf/leaves skipped due to conflicts (${topUp.conflicts.join('; ')}).`);
      }
    } else if (topUp && topUp.error) {
      parts.push(`Warning: Profile Core v2 top-up skipped (${topUp.error}).`);
    }
    return parts.join(' ');
  }

  /* ---- Wizard runners ---- */

  async function runStatus(sandbox, token, clientId, orgId) {
    log(sandbox, 'status.start', {});
    let tenantCtx;
    try {
      tenantCtx = await discoverTenantContext(token, clientId, orgId, sandbox);
    } catch (e) {
      return {
        ok: false,
        sandbox,
        error: String(e.message || e),
        ready: false,
        naming: { schema: schemaTitle, dataset: datasetName, httpDataflow: dataflowName },
      };
    }

    let mixins;
    try {
      mixins = await listTenantFieldGroups(token, clientId, orgId, sandbox);
    } catch (e) {
      const msg = String(e.message || e);
      return {
        ok: false,
        sandbox,
        ready: false,
        error: msg,
        tenantId: tenantCtx.tenantId,
        xdmKey: tenantCtx.xdmKey,
        fieldGroupsListFailed: true,
        naming: { schema: schemaTitle, dataset: datasetName, httpDataflow: dataflowName },
        nextSteps: manualFlowSteps(),
      };
    }
    const profileCore = findProfileCoreV2Mixin(mixins);

    // Discover OOTB Profile-class FGs once per status call. Optional source
    // (returns [] on any error), so a /global outage doesn't block status.
    let globalFgList = [];
    try {
      globalFgList = await listGlobalOotbFieldGroups(token, clientId, orgId, sandbox);
    } catch (e) {
      log(sandbox, 'status.globalFgListFailed', { error: String(e.message || e).slice(0, 200) });
    }

    const allSchemas = await listAllTenantSchemas(token, clientId, orgId, sandbox);
    const schema = findOurSchema(allSchemas);

    const pages = await paginateDataSets(token, clientId, orgId, sandbox);
    let datasets = flattenDatasets(pages);
    let dataset = schema ? findDatasetForSchema(datasets, schema.$id, schema['meta:altId']) : null;
    if (!dataset && schema) {
      try {
        const byName = await listDataSetsByPropertyFilter(token, clientId, orgId, sandbox, `name==${datasetName}`);
        dataset = findDatasetForSchema(byName, schema.$id, schema['meta:altId']);
      } catch (_) {
        /* ignore */
      }
    }

    let hasDescriptor = false;
    let fieldGroupsAttached = false;
    let schemaInProfileUnion = false;
    if (schema) {
      const desc = await listDescriptorsForSchema(token, clientId, orgId, sandbox, schema.$id, schema['meta:altId']);
      hasDescriptor = desc.some((d) => isPrimaryEmailIdentityDescriptor(d));
      if (schema['meta:altId']) {
        const full = await getSchemaByAltId(token, clientId, orgId, sandbox, schema['meta:altId']);
        if (full) {
          schemaInProfileUnion = schemaHasProfileUnionTag(full);
          if (profileCore) {
            fieldGroupsAttached = profileFieldGroupsComplete(full, profileCore.$id, mixins, globalFgList);
          }
        }
      }
    }

    const datasetProfileEnabled = !!dataset && datasetHasProfileEnabledTag(dataset);
    const ready = !!(profileCore && schema && dataset && hasDescriptor && fieldGroupsAttached);

    return {
      ok: true,
      sandbox,
      ready,
      schemaInProfileUnion,
      // Short alias for the at-a-glance status badges added May 2026 — same
      // boolean as `schemaInProfileUnion`, kept under both names so the
      // existing wizard call sites and the new aggregate `/api/profile-infra
      // /status-all` endpoint stay consistent.
      schemaInUnion: schemaInProfileUnion,
      tenantId: tenantCtx.tenantId,
      xdmKey: tenantCtx.xdmKey,
      profileCoreMixinFound: !!profileCore,
      profileCoreMixinId: profileCore?.$id || null,
      schemaFound: !!schema,
      schemaId: schema?.$id || null,
      schemaMetaAltId: schema?.['meta:altId'] || null,
      primaryEmailDescriptor: hasDescriptor,
      datasetFound: !!dataset,
      datasetId: dataset?.id || null,
      datasetProfileEnabled,
      tenantSubtreePrefix,
      prepSteps: {
        step1_schemaShell: !!schema,
        step2_fieldGroupsIdentity: !!(schema && fieldGroupsAttached),
        step3_dataset: !!dataset && datasetProfileEnabled,
        step4_readyForManualHttpFlow: !!dataset,
      },
      naming: { schema: schemaTitle, dataset: datasetName, httpDataflow: dataflowName },
      nextSteps: ready ? [] : manualFlowSteps(),
    };
  }

  async function runStep(sandbox, token, clientId, orgId, stepName) {
    const step = String(stepName || '').trim();
    log(sandbox, 'wizard.step', { step });
    if (!STEP_NAMES.includes(step)) {
      return {
        ok: false,
        sandbox,
        error: `Invalid step "${step}". Use one of: ${STEP_NAMES.join(', ')}.`,
      };
    }

    try {
      if (step === 'createSchema') {
        const tenantCtx = await discoverTenantContext(token, clientId, orgId, sandbox);
        const allSchemas = await listAllTenantSchemas(token, clientId, orgId, sandbox);
        const existing = findOurSchema(allSchemas);
        if (existing) {
          // Skip-by-already-exists is also a successful "schema present"
          // outcome — drop the cached status doc so the next read
          // reflects current AEP truth (e.g. an out-of-band FG attach).
          await safeInvalidateStatusCache(industryKey, sandbox);
          return {
            ok: true,
            sandbox,
            step,
            skipped: true,
            message: `Schema "${schemaTitle}" already exists. Run step 2.`,
            tenantId: tenantCtx.tenantId,
            xdmKey: tenantCtx.xdmKey,
            schemaId: existing.$id,
            schemaMetaAltId: existing['meta:altId'],
          };
        }
        const created = await createSchemaShell(token, clientId, orgId, sandbox);
        await safeInvalidateStatusCache(industryKey, sandbox);
        return {
          ok: true,
          sandbox,
          step,
          schemaCreated: true,
          tenantId: tenantCtx.tenantId,
          xdmKey: tenantCtx.xdmKey,
          schemaId: created.$id,
          schemaMetaAltId: created['meta:altId'],
          message:
            `Schema shell created (Profile class only). Run step 2 to attach the standard Profile field groups${
              industryFieldGroups.length ? ` plus the ${displayName}-specific field group(s) when present in this sandbox` : ''
            } + primary Email identity.`,
        };
      }

      if (step === 'attachFieldGroups') {
        const tenantCtx = await discoverTenantContext(token, clientId, orgId, sandbox);
        const mixins = await listTenantFieldGroups(token, clientId, orgId, sandbox);
        // Best-effort discovery of OOTB Profile-class FGs (for the
        // `ootbByIndustryTag` resolver source). Empty list is a fine
        // outcome — the resolver simply contributes zero refs.
        let globalFgList = [];
        try {
          globalFgList = await listGlobalOotbFieldGroups(token, clientId, orgId, sandbox);
        } catch (e) {
          log(sandbox, 'attachFieldGroups.globalFgListFailed', { error: String(e.message || e).slice(0, 200) });
        }
        const profileCore = findProfileCoreV2Mixin(mixins);
        if (!profileCore) {
          return {
            ok: false,
            sandbox,
            step,
            profileCoreMixinMissing: true,
            error:
              'Profile Core v2 field group not found in this sandbox. Import it first, then run this step again.',
          };
        }
        const allSchemas = await listAllTenantSchemas(token, clientId, orgId, sandbox);
        const schema = findOurSchema(allSchemas);
        if (!schema) {
          return {
            ok: false,
            sandbox,
            step,
            error: `No schema "${schemaTitle}". Run step 1 (Create schema) first.`,
          };
        }
        // AEP eventual-consistency guard: list-by-altId can return a row
        // before get-by-altId becomes retrievable. Surface a clearer
        // "wait and retry" message before burning PATCH retries.
        const schemaMetaAltId = schema['meta:altId'];
        if (!schemaMetaAltId) {
          return {
            ok: false,
            sandbox,
            step,
            error: `Schema "${schemaTitle}" was returned by the listing endpoint but has no meta:altId yet. AEP propagation can take a few seconds — wait 5–10 seconds and try step 2 again.`,
          };
        }
        const schemaProbe = await getSchemaByAltId(token, clientId, orgId, sandbox, schemaMetaAltId);
        if (!schemaProbe) {
          log(sandbox, 'attachFieldGroups.schemaNotYetRetrievable', { metaAltId: schemaMetaAltId });
          return {
            ok: false,
            sandbox,
            step,
            error: `Schema "${schemaTitle}" was found in the listing index but is not yet retrievable by id. This is normal right after step 1 — AEP propagation can take a few seconds. Wait 5–10 seconds and click "2 · Attach field groups" again.`,
          };
        }
        const ar = await attachFieldGroupsAndDescriptor(
          token,
          clientId,
          orgId,
          sandbox,
          tenantCtx,
          profileCore,
          schema,
          mixins,
          globalFgList
        );
        await safeInvalidateStatusCache(industryKey, sandbox);
        return {
          ok: true,
          sandbox,
          step,
          tenantId: tenantCtx.tenantId,
          xdmKey: tenantCtx.xdmKey,
          schemaId: schema.$id,
          schemaMetaAltId: schema['meta:altId'],
          profileCoreMixinId: profileCore.$id,
          patchApplied: ar.patchApplied,
          descriptorOk: ar.descriptorOk,
          industryFieldGroupsResolved: ar.resolvedIndustry,
          industryFieldGroupsSkipped: ar.skippedOptional.map((s) => ({
            label: s.entry.label || (s.entry.match && s.entry.match.source) || s.entry.$id || 'unknown',
            reason: s.reason,
          })),
          industryFieldGroupsCreated: ar.created,
          industryFieldGroupsDiscovered: ar.discovered,
          profileCoreV2TopUp: ar.profileCoreV2TopUp || { skipped: true },
          message: buildStep2SuccessMessage(ar.resolvedIndustry, ar.patchApplied, ar.created, ar.profileCoreV2TopUp),
        };
      }

      if (step === 'createDataset') {
        const tenantCtx = await discoverTenantContext(token, clientId, orgId, sandbox);
        const allSchemas = await listAllTenantSchemas(token, clientId, orgId, sandbox);
        const schema = findOurSchema(allSchemas);
        if (!schema) {
          return {
            ok: false,
            sandbox,
            step,
            error: `${displayName} Profile schema not found. Complete steps 1 and 2 first.`,
          };
        }
        const schemaId = schema.$id;
        const pages = await paginateDataSets(token, clientId, orgId, sandbox);
        const datasets = flattenDatasets(pages);
        let dataset = findDatasetForSchema(datasets, schemaId, schema['meta:altId']);
        if (!dataset) {
          try {
            const byName = await listDataSetsByPropertyFilter(token, clientId, orgId, sandbox, `name==${datasetName}`);
            dataset = findDatasetForSchema(byName, schemaId, schema['meta:altId']);
          } catch (_) {
            /* ignore */
          }
        }
        if (dataset) {
          const profileEnabled = datasetHasProfileEnabledTag(dataset);
          let enabledNow = profileEnabled;
          if (!profileEnabled) {
            const r = await enableProfileOnDataset(token, clientId, orgId, sandbox, dataset.id);
            enabledNow = r.ok;
          }
          await safeInvalidateStatusCache(industryKey, sandbox);
          return {
            ok: true,
            sandbox,
            step,
            skipped: true,
            datasetProfileEnabled: enabledNow,
            message: enabledNow
              ? `Dataset already exists (${dataset.name || datasetName}) and is Profile-enabled.`
              : `Dataset already exists but is NOT Profile-enabled. Enable it for Real-Time Customer Profile in AEP UI before generating ${displayName} profiles.`,
            tenantId: tenantCtx.tenantId,
            xdmKey: tenantCtx.xdmKey,
            schemaId,
            schemaMetaAltId: schema['meta:altId'],
            datasetId: dataset.id,
          };
        }
        const dsRes = await createDataset(token, clientId, orgId, sandbox, schemaId, datasetName);
        dataset = { id: dsRes.id, name: datasetName, schemaRef: { id: schemaId } };
        await safeInvalidateStatusCache(industryKey, sandbox);
        return {
          ok: true,
          sandbox,
          step,
          datasetCreated: true,
          datasetProfileEnabled: true,
          tenantId: tenantCtx.tenantId,
          xdmKey: tenantCtx.xdmKey,
          schemaId,
          schemaMetaAltId: schema['meta:altId'],
          datasetId: dataset.id,
          message: `Dataset "${datasetName}" created (Profile-enabled). Run step 4 for HTTP flow instructions.`,
        };
      }

      // step === 'httpFlow'
      return {
        ok: true,
        sandbox,
        step: 'httpFlow',
        manual: true,
        naming: { schema: schemaTitle, dataset: datasetName, httpDataflow: dataflowName },
        nextSteps: manualFlowSteps(),
        message: `Create HTTP API dataflow "${dataflowName}" for dataset "${datasetName}". Then use "Fetch URL & Flow ID from AEP" on this page (Flow Service) or paste URL + Flow ID below.`,
      };
    } catch (e) {
      const msg = String(e.message || e);
      log(sandbox, 'wizard.step.error', { step, error: msg.slice(0, 400) });
      return { ok: false, sandbox, step, error: msg };
    }
  }

  /* ---- Enable for Profile (schema-first → dataset-second) ---- */

  /**
   * One-click "enable schema + dataset for Real-Time Customer Profile":
   *
   *   1. Look up `AEP Lab - <Industry> Profile - Schema` and the matching
   *      dataset by canonical name.
   *   2. STRICT: PATCH the schema FIRST. Add `"union"` to
   *      `meta:immutableTags` (or no-op if it's already there). After the
   *      PATCH, GET the schema and confirm the tag landed — if not, throw.
   *   3. ONLY THEN: PATCH the dataset to set
   *      `tags.unifiedProfile=['enabled:true']` (or no-op if it's already
   *      there). The schema-first order avoids the
   *      `UPDAEM-089029-400: Union Schema cannot be retrieved` warning that
   *      AEP raises when a Profile-enabled dataset references a non-Union
   *      schema.
   *
   * Idempotent: re-runs on already-Profile-enabled sandboxes report
   * `already-enabled` for both halves and never re-PATCH.
   *
   * Refuses to attempt step 2 if step 1 fails. AEP error reasons (the
   * useful ones buried under `report.additionalDetails[].errorReason`)
   * are surfaced verbatim via the shared `extractAepErrorMessage` helper.
   *
   * Return shape (always set, never throws — errors are surfaced as
   * structured fields so the caller HTTP layer can keep the 200 envelope
   * contract used by the rest of the wizard endpoints):
   *
   *   {
   *     ok                 : boolean   true iff schemaUnion landed AND datasetProfile landed
   *     sandbox, schemaId, schemaMetaAltId, datasetId
   *     schemaUnion        : 'enabled' | 'already-enabled' | 'failed' | 'skipped'
   *     datasetProfile     : 'enabled' | 'already-enabled' | 'skipped' | 'failed'
   *     schemaError        : string|null    extractAepErrorMessage on schema PATCH failure
   *     datasetError       : string|null    extractAepErrorMessage on dataset PATCH failure
   *     message            : string         human-readable summary for UI
   *   }
   */
  async function runEnableProfileImpl(sandbox, token, clientId, orgId) {
    log(sandbox, 'enableProfile.start', {});

    /** @type {{ok: boolean, sandbox: string, schemaId: string|null, schemaMetaAltId: string|null, datasetId: string|null, schemaUnion: string, datasetProfile: string, schemaError: string|null, datasetError: string|null, message: string}} */
    const out = {
      ok: false,
      sandbox,
      schemaId: null,
      schemaMetaAltId: null,
      datasetId: null,
      schemaUnion: 'skipped',
      datasetProfile: 'skipped',
      schemaError: null,
      datasetError: null,
      message: '',
    };

    // 1. Find schema + dataset under their canonical names.
    let schemaRow;
    try {
      const allSchemas = await listAllTenantSchemas(token, clientId, orgId, sandbox);
      schemaRow = findOurSchema(allSchemas);
    } catch (e) {
      out.schemaUnion = 'failed';
      out.schemaError = String(e.message || e);
      out.message = `Could not list schemas: ${out.schemaError}`;
      log(sandbox, 'enableProfile.listSchemas.failed', { error: out.schemaError.slice(0, 240) });
      return out;
    }

    if (!schemaRow) {
      out.schemaUnion = 'failed';
      out.schemaError = `Schema "${schemaTitle}" not found in this sandbox. Run Set up schema, field groups & dataset first.`;
      out.message = out.schemaError;
      return out;
    }
    out.schemaId = schemaRow.$id || null;
    out.schemaMetaAltId = schemaRow['meta:altId'] || null;

    if (!out.schemaMetaAltId) {
      out.schemaUnion = 'failed';
      out.schemaError =
        `Schema "${schemaTitle}" has no meta:altId yet (AEP propagation lag). Wait a few seconds and click Enable again.`;
      out.message = out.schemaError;
      return out;
    }

    // 2. Schema-first: PATCH `meta:immutableTags` to add "union" if missing.
    try {
      const fullSchema = await getSchemaByAltId(token, clientId, orgId, sandbox, out.schemaMetaAltId);
      if (!fullSchema) {
        out.schemaUnion = 'failed';
        out.schemaError =
          `Schema "${schemaTitle}" found in listing but not retrievable by altId yet. AEP propagation can lag a few seconds; wait and try again.`;
        out.message = out.schemaError;
        return out;
      }
      if (schemaHasProfileUnionTag(fullSchema)) {
        out.schemaUnion = 'already-enabled';
        log(sandbox, 'enableProfile.schemaUnion.alreadyEnabled', { schemaIdSuffix: String(out.schemaId || '').split('/').pop() });
      } else {
        const ops = buildAddProfileUnionPatchOps(fullSchema['meta:immutableTags']);
        await patchSchemaJsonPatch(token, clientId, orgId, sandbox, out.schemaMetaAltId, ops);
        // Verify the tag landed. AEP's schema-registry read replicas can lag
        // the write by a few seconds — verified against gerdos Telecom on
        // May 4 2026 where a 2xx PATCH read back the OLD `meta:immutableTags`
        // for ~1–2s before the union tag became visible. We therefore retry
        // the verify GET with a short backoff before declaring failure.
        // Total worst-case wait ≈ 9.5s (0 + 0.5 + 1 + 1.5 + 2.5 + 4) — short
        // enough to keep the wizard responsive, long enough to swallow the
        // typical replica-lag window.
        const VERIFY_BACKOFF_MS = [0, 500, 1000, 1500, 2500, 4000];
        let verified = false;
        let lastVerify = null;
        for (let i = 0; i < VERIFY_BACKOFF_MS.length; i++) {
          if (VERIFY_BACKOFF_MS[i] > 0) {
            await new Promise((r) => setTimeout(r, VERIFY_BACKOFF_MS[i]));
          }
          lastVerify = await getSchemaByAltId(token, clientId, orgId, sandbox, out.schemaMetaAltId);
          if (lastVerify && schemaHasProfileUnionTag(lastVerify)) {
            verified = true;
            if (i > 0) {
              log(sandbox, 'enableProfile.schemaUnion.verifyDelayed', {
                attempt: i,
                waitedMs: VERIFY_BACKOFF_MS.slice(0, i + 1).reduce((a, b) => a + b, 0),
              });
            }
            break;
          }
          log(sandbox, 'enableProfile.schemaUnion.verifyRetry', {
            attempt: i,
            backoffMs: VERIFY_BACKOFF_MS[i],
            sawTags: lastVerify ? JSON.stringify(lastVerify['meta:immutableTags'] ?? null).slice(0, 120) : 'null',
          });
        }
        if (!verified) {
          out.schemaUnion = 'failed';
          out.schemaError =
            'Schema PATCH returned 2xx but post-check could not see "union" in meta:immutableTags after ~10s of read-replica retries. Refresh and retry; if this persists, inspect the schema in AEP UI.';
          out.message = out.schemaError;
          return out;
        }
        out.schemaUnion = 'enabled';
        log(sandbox, 'enableProfile.schemaUnion.enabled', { schemaIdSuffix: String(out.schemaId || '').split('/').pop() });
      }
    } catch (e) {
      out.schemaUnion = 'failed';
      out.schemaError = String(e.message || e);
      out.message = `Schema PATCH failed: ${out.schemaError}`;
      log(sandbox, 'enableProfile.schemaUnion.failed', { error: out.schemaError.slice(0, 240) });
      // STRICT: never proceed to dataset PATCH if schema step did not succeed.
      return out;
    }

    // 3. Dataset-second: only reached if schema step is enabled OR already-enabled.
    let dataset;
    try {
      const pages = await paginateDataSets(token, clientId, orgId, sandbox);
      const datasets = flattenDatasets(pages);
      dataset = findDatasetForSchema(datasets, out.schemaId, out.schemaMetaAltId);
      if (!dataset) {
        try {
          const byName = await listDataSetsByPropertyFilter(token, clientId, orgId, sandbox, `name==${datasetName}`);
          dataset = findDatasetForSchema(byName, out.schemaId, out.schemaMetaAltId);
        } catch (_) {
          /* ignore — handled by null check below */
        }
      }
    } catch (e) {
      out.datasetProfile = 'failed';
      out.datasetError = String(e.message || e);
      out.message = `Schema enabled. Could not list datasets: ${out.datasetError}`;
      log(sandbox, 'enableProfile.listDatasets.failed', { error: out.datasetError.slice(0, 240) });
      return out;
    }

    if (!dataset) {
      out.datasetProfile = 'failed';
      out.datasetError = `Dataset "${datasetName}" not found in this sandbox. Run Set up schema, field groups & dataset first.`;
      out.message = `Schema enabled. ${out.datasetError}`;
      return out;
    }
    out.datasetId = dataset.id || null;

    if (datasetHasProfileEnabledTag(dataset)) {
      out.datasetProfile = 'already-enabled';
      log(sandbox, 'enableProfile.datasetProfile.alreadyEnabled', { datasetId: out.datasetId });
    } else {
      const r = await enableProfileOnDataset(token, clientId, orgId, sandbox, dataset.id);
      if (!r.ok) {
        out.datasetProfile = 'failed';
        out.datasetError = r.error || 'Dataset PATCH failed without an error message.';
        out.message = `Schema enabled. Dataset PATCH failed: ${out.datasetError}`;
        log(sandbox, 'enableProfile.datasetProfile.failed', { error: String(out.datasetError).slice(0, 240) });
        return out;
      }
      out.datasetProfile = 'enabled';
      log(sandbox, 'enableProfile.datasetProfile.enabled', { datasetId: out.datasetId });
    }

    out.ok = true;
    out.message = formatEnableProfileMessage(out);
    log(sandbox, 'enableProfile.ok', {
      schemaUnion: out.schemaUnion,
      datasetProfile: out.datasetProfile,
    });
    return out;
  }

  /**
   * Public wrapper around `runEnableProfileImpl` that drops the durable
   * status cache on EVERY exit path (success or failure). The schema /
   * dataset state in AEP can change even on partial failures (e.g. the
   * schema PATCH lands but the dataset PATCH 5xx's), so always
   * invalidating is the safest cheap option — false invalidations only
   * cost the next status read one extra AEP fetch, and runEnableProfile
   * is a rare per-provisioning click.
   */
  async function runEnableProfile(sandbox, token, clientId, orgId) {
    try {
      return await runEnableProfileImpl(sandbox, token, clientId, orgId);
    } finally {
      await safeInvalidateStatusCache(industryKey, sandbox);
    }
  }

  function formatEnableProfileMessage(result) {
    const schemaPart =
      result.schemaUnion === 'enabled' ? `Schema enabled for Profile`
        : result.schemaUnion === 'already-enabled' ? `Schema already enabled for Profile`
        : `Schema not enabled (${result.schemaUnion})`;
    const datasetPart =
      result.datasetProfile === 'enabled' ? `Dataset enabled for Profile`
        : result.datasetProfile === 'already-enabled' ? `Dataset already enabled for Profile`
        : `Dataset not enabled (${result.datasetProfile})`;
    return `${schemaPart}. ${datasetPart}.`;
  }

  return {
    runStatus,
    runStep,
    runEnableProfile,
    STEP_NAMES,
    SCHEMA_TITLE: schemaTitle,
    DATASET_NAME: datasetName,
    HTTP_DATAFLOW_NAME: dataflowName,
    INDUSTRY_KEY: industryKey,
    TENANT_SUBTREE_PREFIX: tenantSubtreePrefix,
  };
}

module.exports = {
  createProfileInfraService,
  BASE_PROFILE_FIELD_GROUP_REFS,
  BASE_PROFILE_FIELD_GROUP_LABELS,
  STEP_NAMES,
  // Exposed for unit tests / external use; not currently consumed elsewhere.
  pickProfileClassOotbByTag,
  isProfileClassFieldGroup,
  buildTenantFieldGroupCreateBody,
  resolveIndustryFgEntry,
  // Profile Core v2 top-up helpers — pure functions, exposed for the local
  // probe at scripts/verify-profile-core-v2-topup.mjs and for unit tests.
  walkResolvedMixinTenantTree,
  collectRefBlockedAncestorPaths,
  diffManifestAgainstMixin,
  buildCompositeSubtreeFromManifest,
  buildTopUpJsonPatchOps,
  // Shared error-surface helpers — exposed for unit tests and for any
  // future per-industry service that bypasses the factory wrappers.
  extractAepErrorMessage,
  looksLikeAlreadyExists,
  // Pure helper for the Enable-for-Profile orchestrator (exposed for unit tests).
  buildAddProfileUnionPatchOps,
};
