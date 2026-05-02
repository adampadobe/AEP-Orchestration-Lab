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
 * and Preference Details + Preference Details). On top of that base, each
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
const ACCEPT_JSON = 'application/json';

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
];

/** Human-readable labels for the success message (order matches BASE_PROFILE_FIELD_GROUP_REFS plus Profile Core v2 prepended). */
const BASE_PROFILE_FIELD_GROUP_LABELS = [
  'Profile Core v2',
  'Demographic Details',
  'Personal Contact Details',
  'Loyalty Details',
  'Consent and Preference Details',
  'Preference Details',
];

const STEP_NAMES = Object.freeze(['createSchema', 'attachFieldGroups', 'createDataset', 'httpFlow']);

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
      const msg = data.message || data.title || res.statusText;
      log(sandbox, 'discoverTenant.failed', { httpStatus: res.status, msg });
      throw new Error(`Schema list failed: ${msg}`);
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
        lastErr = data.message || data.title || res.statusText || String(res.status);
        if (!/accept header/i.test(String(lastErr))) {
          throw new Error(`Tenant field groups list failed: ${lastErr}`);
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
            msg: data?.message || data?.title || res.statusText,
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
      lastErr = data.message || data.title || data.detail || res.statusText || String(res.status);
      const retry = res.status === 415 || res.status === 406 || /unsupported media type|not acceptable/i.test(String(lastErr));
      if (!retry) {
        throw new Error(`Create tenant field group "${body.title}" failed: ${lastErr}`);
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
      lastErr = data.message || data.title || data.detail || res.statusText || String(res.status);
      const retry = res.status === 415 || res.status === 406 || /unsupported media type|not acceptable/i.test(String(lastErr));
      if (!retry) throw new Error(`Create schema failed: ${lastErr}`);
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
      const msg = data.message || data.title || data.detail || res.statusText;
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
    for (const h of attempts) {
      const { res, data } = await fetchJson(url, {
        method: 'POST',
        headers: { ...base, ...h },
        body: JSON.stringify(body),
      });
      if (res.ok) return data;
      lastErr = data.message || data.title || data.detail || res.statusText;
      if (res.status !== 415 && !/unsupported media type/i.test(String(lastErr))) {
        throw new Error(`Create identity descriptor failed: ${lastErr}`);
      }
    }
    throw new Error(`Create identity descriptor failed: ${lastErr}`);
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

  async function attachFieldGroupsAndDescriptor(token, clientId, orgId, sandbox, tenantCtx, profileCore, schemaRow, tenantFgList, globalFgList) {
    const metaAltId = schemaRow['meta:altId'];
    const schemaId = schemaRow.$id;
    let full = (await getSchemaByAltId(token, clientId, orgId, sandbox, metaAltId)) || schemaRow;

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
        const msg = String(e.message || e);
        if (/409|already exists|duplicate/i.test(msg)) descriptorOk = true;
        else throw e;
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
    };
  }

  /* ---- Catalog / dataset helpers ---- */

  async function paginateDataSets(token, clientId, orgId, sandbox) {
    const pages = [];
    let url = `${CATALOG_BASE}/dataSets?limit=100&properties=name,schemaRef,tags`;
    for (let i = 0; i < 100; i++) {
      const { res, data } = await fetchJson(url, { method: 'GET', headers: headersJson(token, clientId, orgId, sandbox) });
      if (!res.ok) {
        const msg = data.message || data.title || res.statusText;
        throw new Error(`Catalog dataSets: ${msg}`);
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
      const msg = data.message || data.title || data.detail || res.statusText;
      throw new Error(`Create dataset failed: ${msg}`);
    }
    if (Array.isArray(data) && data[0] && typeof data[0] === 'string') {
      const m = data[0].match(/@\/dataSets\/([0-9a-fA-F]+)/);
      if (m) return { id: m[1], raw: data };
    }
    if (data && data.id) return data;
    return { id: null, raw: data };
  }

  async function enableProfileOnDataset(token, clientId, orgId, sandbox, datasetId) {
    if (!datasetId) return { ok: false };
    const url = `${CATALOG_BASE}/dataSets/${encodeURIComponent(datasetId)}`;
    const body = { tags: { unifiedProfile: ['enabled:true'] } };
    const { res, data } = await fetchJson(url, {
      method: 'PATCH',
      headers: { ...headersJson(token, clientId, orgId, sandbox), Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true };
    return { ok: false, error: data.message || data.title || res.statusText };
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
   * auto-created for this sandbox during this run. The base list mirrors
   * the labels operators see in the UI's setup-instructions card so the
   * message is verifiable against what the wizard says it'll do.
   */
  function buildStep2SuccessMessage(resolvedIndustry, patchApplied, created) {
    const createdFragment =
      created && created.length ? ` (created in this sandbox: ${created.map((c) => c.title).join(', ')})` : '';
    if (!patchApplied) {
      return `Field groups were already present; primary Email identity checked${createdFragment}.`;
    }
    const labels = [...BASE_PROFILE_FIELD_GROUP_LABELS];
    for (const r of resolvedIndustry) labels.push(r.label);
    return `Field groups attached and primary Email identity set (${labels.join(' + ')})${createdFragment}.`;
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
          message: buildStep2SuccessMessage(ar.resolvedIndustry, ar.patchApplied, ar.created),
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

  return {
    runStatus,
    runStep,
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
};
