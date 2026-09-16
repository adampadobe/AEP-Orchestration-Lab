'use strict';

/**
 * Bulk attach/detach of Decisioning tags across offer-items. DPS has no
 * array-body batch endpoint, so applyTagChangeToOffer is called once per
 * offer by the MCP-side sequential job processor (mirrors
 * decisioningBulkProcessor.mjs), not looped here.
 *
 * itemTags write format: docs/DECISIONING_APIS.md confirmed live against
 * sandbox apalmer that the value is neither the tag's `dps:tag:...` id
 * ("Invalid [tagId] id") nor its bare hex suffix ("At least one of the tags
 * is invalid") — but neither of those is the tag's actual dashed UUID (the
 * `id` GET /tags returns), which was never tried. A separately deployed ExD
 * accelerator MCP (exd-accelerator-mcp) confirms that full UUID, used
 * verbatim in a plain array, is the correct value — so 'xcore_id' (the raw
 * id) is tried first below, with the earlier-falsified/never-fully-confirmed
 * shapes kept only as a fallback in case a sandbox's DPS version differs.
 * Rather than hard-code even a well-evidenced guess, applyTagChangeToOffer
 * still tries each candidate, in order, against the real write the caller
 * asked for — the first PATCH DPS accepts (not a 400/422) wins, and that
 * format is cached per sandbox in decisioningTagFormatStore so every later
 * call skips straight to it. A non-format error (403/404/409/500/...) aborts
 * immediately instead of cycling through formats.
 */

const decisioningCatalogService = require('./decisioningCatalogService');
const decisioningTagFormatStore = require('./decisioningTagFormatStore');
const { stable, digest } = require('./decisioningCatalogWriteService');

const { platformFetch, resolveCatalogSchema, resolveEntityIdOrName, listCatalogEntities, getCatalogEntity, MAX_LIMIT } = decisioningCatalogService;

const JSON_PATCH_CONTENT_TYPE = 'application/json-patch+json';
const ITEM_TAGS_PATH = '/_experience/decisioning/decisionitem/itemTags';
const BULK_MAX = 200;

const TAG_FORMATS = ['xcore_id', 'name', 'tags_object', 'full_id_uri'];

function badRequest(message) {
  return Object.assign(new Error(message), { status: 400 });
}

async function resolveOfferSchemaHeaders(opts) {
  const schema = await resolveCatalogSchema({
    sandbox: opts.sandbox,
    accessToken: opts.accessToken,
    clientId: opts.clientId,
    orgId: opts.orgId,
    schemaId: opts.schemaId,
    autoDetect: opts.autoDetect,
    getCatalogConfig: opts.getCatalogConfig,
  });
  if (!schema.ok || !schema.schemaId) {
    return { ok: false, error: schema.error || 'Missing x-schema-id for offer-items' };
  }
  return { ok: true, headers: { 'x-schema-id': schema.schemaId } };
}

async function resolveTags(opts, tags) {
  const resolved = [];
  for (const raw of tags) {
    const result = await resolveEntityIdOrName({ ...opts, entityType: 'tags', idOrName: raw });
    if (!result.ok) return result;
    resolved.push({ input: raw, id: result.id, name: result.name });
  }
  return { ok: true, tags: resolved };
}

async function resolveOfferSelector(opts, selector) {
  const provided = ['ids', 'name_prefix', 'collection'].filter((k) => selector && selector[k] != null && selector[k] !== '');
  if (provided.length !== 1) {
    return { ok: false, status: 400, error: 'offer_selector requires exactly one of: ids, name_prefix, collection.' };
  }

  if (selector.ids) {
    if (!Array.isArray(selector.ids) || selector.ids.length === 0) {
      return { ok: false, status: 400, error: 'offer_selector.ids must be a non-empty array.' };
    }
    const offers = [];
    for (const idOrName of selector.ids) {
      const resolved = await resolveEntityIdOrName({ ...opts, entityType: 'offer-items', idOrName });
      if (!resolved.ok) return resolved;
      offers.push({ id: resolved.id, name: resolved.name });
    }
    return { ok: true, offers };
  }

  const listResult = await listCatalogEntities({ ...opts, entityType: 'offer-items', limit: MAX_LIMIT });
  if (!listResult.ok) return listResult;

  if (selector.name_prefix) {
    const prefix = String(selector.name_prefix);
    const offers = listResult.items.filter((i) => String(i.name || '').startsWith(prefix)).map((i) => ({ id: i.id, name: i.name }));
    return { ok: true, offers };
  }

  // selector.collection — item-collections expose an opaque predicate, not a
  // member-id list (see lab_decisioning_capabilities known_gaps), so this only
  // works when the raw entity happens to carry one of these common shapes.
  const collResolved = await resolveEntityIdOrName({ ...opts, entityType: 'item-collections', idOrName: selector.collection });
  if (!collResolved.ok) return collResolved;

  const raw = collResolved.raw || {};
  const memberIds = raw.members || raw.itemIds || raw.decisionItemIds || (Array.isArray(raw.items) ? raw.items : null);
  if (!Array.isArray(memberIds)) {
    return {
      ok: false,
      status: 501,
      error:
        `Collection membership introspection is unsupported for "${selector.collection}" — item-collections expose an ` +
        'opaque predicate, not a member list. Use offer_selector.ids or offer_selector.name_prefix instead.',
    };
  }
  const idSet = new Set(memberIds);
  const offers = listResult.items.filter((i) => idSet.has(i.id)).map((i) => ({ id: i.id, name: i.name }));
  return { ok: true, offers };
}

function computeAfterTags(action, currentTags, requestedNames) {
  if (action === 'attach') return Array.from(new Set([...currentTags, ...requestedNames]));
  if (action === 'replace') return Array.from(new Set(requestedNames));
  return currentTags.filter((n) => !requestedNames.includes(n));
}

async function tagBulkPreview(params) {
  const action = ['attach', 'detach', 'replace'].includes(params.action) ? params.action : null;
  if (!action) throw badRequest('action must be "attach", "detach", or "replace".');
  if (!Array.isArray(params.tags) || params.tags.length === 0 || params.tags.length > 20) {
    throw badRequest('tags must be a non-empty array of 1-20 tag ids or exact names.');
  }

  const tagsResolved = await resolveTags(params, params.tags);
  if (!tagsResolved.ok) return tagsResolved;

  const offersResolved = await resolveOfferSelector(params, params.offer_selector);
  if (!offersResolved.ok) return offersResolved;

  if (offersResolved.offers.length > BULK_MAX) {
    return { ok: false, status: 400, error: `offer_selector matched ${offersResolved.offers.length} offers — narrow it to ${BULK_MAX} or fewer.` };
  }

  const requestedNames = tagsResolved.tags.map((t) => t.name);
  const changes = [];
  const noOp = [];
  for (const offer of offersResolved.offers) {
    const full = await getCatalogEntity({ ...params, entityType: 'offer-items', id: offer.id });
    if (!full.ok) return full;
    const currentTags = full.item.tags || [];
    const afterTags = computeAfterTags(action, currentTags, requestedNames);
    const changed = JSON.stringify([...currentTags].sort()) !== JSON.stringify([...afterTags].sort());
    if (changed) {
      changes.push({ offer_id: offer.id, offer_name: offer.name, current_tags: currentTags, after_tags: afterTags, op: action });
    } else {
      noOp.push({
        offer_id: offer.id,
        reason: action === 'attach' ? 'Tag(s) already present.' : action === 'replace' ? 'Tag set already matches.' : 'Tag(s) not present.',
      });
    }
  }

  const cachedFormat = await decisioningTagFormatStore.getTagFormat(params.sandbox);
  const chunkSize = Math.min(BULK_MAX, offersResolved.offers.length) || 0;
  const snapshot = { action, tagIds: tagsResolved.tags.map((t) => t.id).sort(), offerIds: offersResolved.offers.map((o) => o.id).sort() };
  const previewHash = digest(stable(snapshot));

  return {
    ok: true,
    sandbox: params.sandbox,
    action,
    resolved_tag_format: cachedFormat,
    format_note: cachedFormat
      ? `Cached from a prior successful apply in this sandbox.`
      : 'Unresolved for this sandbox — apply will try each candidate format against the real write and cache whichever DPS accepts.',
    resolved_tags: tagsResolved.tags,
    matched_offers: offersResolved.offers.length,
    offer_ids: offersResolved.offers.map((o) => o.id),
    changes,
    no_op: noOp,
    batch_plan: { total: offersResolved.offers.length, chunk_size: chunkSize, chunks: chunkSize ? Math.ceil(offersResolved.offers.length / chunkSize) : 0 },
    preview_hash: previewHash,
  };
}

function buildTagValue(format, finalIds, idToName) {
  switch (format) {
    case 'full_id_uri':
      return finalIds.map((id) => `https://platform.adobe.io/data/core/dps/tags/${id}`);
    case 'xcore_id':
      return finalIds;
    case 'tags_object':
      return { tags: finalIds };
    case 'name':
      return finalIds.map((id) => idToName.get(id) || id);
    default:
      throw badRequest(`Unknown itemTags format: ${format}`);
  }
}

/** Apply one attach/detach to one offer-item, re-reading its live current tags first (fail-closed against drift). */
async function applyTagChangeToOffer(params) {
  const { offerId, action, tags } = params;

  const current = await getCatalogEntity({ ...params, entityType: 'offer-items', id: offerId });
  if (!current.ok) return current;

  const existingDetails = (current.raw && current.raw._experience && current.raw._experience.decisioning && current.raw._experience.decisioning.decisionitem && current.raw._experience.decisioning.decisionitem.itemTagDetails) || [];
  const idToName = new Map();
  for (const t of existingDetails) if (t.id) idToName.set(t.id, t.name || t.tagName || t.id);
  for (const t of tags) idToName.set(t.id, t.name);

  const existingIds = existingDetails.map((t) => t.id).filter(Boolean);
  const requestedIds = tags.map((t) => t.id);
  const finalIds = action === 'attach'
    ? Array.from(new Set([...existingIds, ...requestedIds]))
    : action === 'replace'
      ? Array.from(new Set(requestedIds))
      : existingIds.filter((id) => !requestedIds.includes(id));

  const beforeNames = existingIds.map((id) => idToName.get(id) || id);
  const afterNames = finalIds.map((id) => idToName.get(id) || id);
  if (JSON.stringify([...beforeNames].sort()) === JSON.stringify([...afterNames].sort())) {
    return { ok: true, no_op: true, offer_id: offerId, after_tags: afterNames };
  }

  const schemaHeaders = await resolveOfferSchemaHeaders(params);
  if (!schemaHeaders.ok) return schemaHeaders;

  const cachedFormat = await decisioningTagFormatStore.getTagFormat(params.sandbox);
  const candidates = cachedFormat ? [cachedFormat, ...TAG_FORMATS.filter((f) => f !== cachedFormat)] : [...TAG_FORMATS];

  let lastError;
  for (const format of candidates) {
    const value = buildTagValue(format, finalIds, idToName);
    const patchResult = await platformFetch({
      ...params,
      method: 'PATCH',
      path: `/data/core/dps/offer-items/${encodeURIComponent(offerId)}`,
      body: [{ op: 'add', path: ITEM_TAGS_PATH, value }],
      extraHeaders: { ...schemaHeaders.headers, 'Content-Type': JSON_PATCH_CONTENT_TYPE },
    });
    if (patchResult.ok) {
      if (format !== cachedFormat) {
        await decisioningTagFormatStore.saveTagFormat(params.sandbox, format).catch(() => {});
      }
      return { ok: true, no_op: false, offer_id: offerId, resolved_tag_format: format, after_tags: afterNames };
    }
    lastError = patchResult;
    if (patchResult.status !== 400 && patchResult.status !== 422) return { ok: false, error: patchResult.error, status: patchResult.status, offer_id: offerId };
  }

  return {
    ok: false,
    offer_id: offerId,
    status: lastError ? lastError.status : 400,
    error: `No itemTags format accepted by DPS for this offer (tried: ${candidates.join(', ')}). Last error: ${lastError && lastError.error}`,
  };
}

module.exports = {
  BULK_MAX,
  TAG_FORMATS,
  resolveTags,
  resolveOfferSelector,
  tagBulkPreview,
  applyTagChangeToOffer,
};
