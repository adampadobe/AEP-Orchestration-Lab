'use strict';

const { createHash, randomUUID } = require('node:crypto');
const admin = require('firebase-admin');
const configService = require('./labDemoConfigService');
const { getBackupBucket } = require('./labDemoAssetService');
const { sandboxPrefix } = require('./imageHostingLibrary');

const SCOPES = 'labDemoCustomerScopes';
const LOCKS = 'labDemoCustomerLocks';
const OPERATIONS = 'labDemoCustomerOperations';
const TTL_MS = 15 * 60 * 1000;
const RECOVERY_DELAY_MS = 5 * 60 * 1000;
const MAX_FILES = 200;
const MAX_BYTES = 100 * 1024 * 1024;
const BRAND_PATHS = Object.freeze([
  'CoreDemoData.name', 'CoreDemoData.shortName', 'CoreDemoData.slogan',
  'CoreDemoData.url', 'CoreDemoData.customerLogo', 'StaffPortal.Colour',
  'CallCentre.industryId', 'ExpAccelerator.displayNameOverride',
  'ExpAccelerator.opportunityIndustry',
]);

class CustomerError extends Error {
  constructor(message, status = 400, code = 'DEMO_CUSTOMER_INVALID') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function digest(value) {
  return createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
}

function services(deps = {}) {
  if (!admin.apps.length && (!deps.firestore || !deps.activeBucket || !deps.backupBucket || !deps.database)) admin.initializeApp();
  return {
    firestore: deps.firestore || admin.firestore(),
    database: deps.database || admin.database(),
    activeBucket: deps.activeBucket || admin.storage().bucket(process.env.BRAND_SCRAPER_BUCKET || 'aep-orchestration-lab-brand-scrapes'),
    backupBucket: getBackupBucket(deps),
    ...deps,
  };
}

function scopeRef(context, deps) {
  return deps.firestore.collection(SCOPES).doc(digest([context.uid, context.workspaceSlug, context.sandbox]));
}

function libraryRoot(sandbox) {
  if (!/^[a-z0-9][a-z0-9._-]{0,119}$/.test(sandbox) || sandboxPrefix(sandbox) !== sandbox) throw new CustomerError('Invalid sandbox.');
  return `${sandbox}/library/`;
}

function relativePath(value) {
  if (typeof value !== 'string' || value.length > 400 || !value || /[\\?#\x00-\x1f]/.test(value)
    || value.split('/').some((part) => !part || part === '.' || part === '..' || part.startsWith('.'))) {
    throw new CustomerError('Use an exact relative library file path without hidden or traversal segments.');
  }
  return value;
}

function customerName(value) {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name || name.length > 160) throw new CustomerError('A customer name of 1-160 characters is required.');
  return name;
}

function keyValue(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9._:-]{8,120}$/.test(value)) throw new CustomerError('idempotency_key must be 8-120 letters, numbers, dots, underscores, colons or hyphens.');
  return value;
}

function cdnUrl(sandbox, path) {
  return `/cdn/${encodeURIComponent(sandbox)}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

function configValues(root) {
  return BRAND_PATHS.map((path) => {
    const [section, field] = path.split('.');
    return { path, value: configService.normalizeValue(path, root?.[section]?.[field] ?? null, { allowNull: true }) };
  });
}

async function readConfig(context, deps) {
  const snap = await deps.database.ref(`ajoLookups/${context.workspaceSlug}`).once('value');
  return configValues(snap.val() || {});
}

async function ownedDoc(ref, message = 'Record not found.') {
  const snap = await ref.get();
  if (!snap.exists) throw new CustomerError(message, 404, 'DEMO_CUSTOMER_NOT_FOUND');
  return snap.data();
}

async function readObject(bucket, path) {
  const [md] = await bucket.file(path).getMetadata();
  if (!md.generation) throw new CustomerError('Storage did not return an object generation; refusing an unpinned read.', 502);
  const [bytes] = await bucket.file(path, { generation: md.generation }).download();
  return { bytes, sha256: digest(bytes), generation: String(md.generation), contentType: md.contentType || 'application/octet-stream', size: bytes.length };
}

async function inventory(context, deps) {
  const root = libraryRoot(context.sandbox);
  const [files] = await deps.activeBucket.getFiles({ prefix: root });
  const visible = files.filter((file) => !file.name.slice(root.length).split('/').some((part) => part.startsWith('.')));
  if (visible.length > MAX_FILES) throw new CustomerError(`Customer operations support at most ${MAX_FILES} library files.`, 413);
  let total = 0;
  const items = [];
  for (const file of visible.sort((a, b) => a.name.localeCompare(b.name))) {
    const relPath = relativePath(file.name.slice(root.length));
    const object = await readObject(deps.activeBucket, file.name);
    total += object.size;
    if (total > MAX_BYTES) throw new CustomerError('Library exceeds the 100 MiB customer-operation limit.', 413);
    const { bytes, ...metadata } = object;
    items.push({ relPath, ...metadata, cdnUrl: cdnUrl(context.sandbox, relPath) });
  }
  return items;
}

function resourceRefs(context, deps) {
  return [
    `library:${sandboxPrefix(context.sandbox)}`, `workspace:${context.workspaceSlug}`,
  ].sort().map((name) => deps.firestore.collection(LOCKS).doc(digest(name)));
}

async function acquireLocks(context, owner, deps, recover = false, initialOperation = null) {
  const refs = resourceRefs(context, deps);
  await deps.firestore.runTransaction(async (tx) => {
    const snapshots = await Promise.all(refs.map((ref) => tx.get(ref)));
    snapshots.forEach((snap) => {
      if (!snap.exists) return;
      const lock = snap.data();
      if (String(lock.owner).startsWith('legacy:') && Date.now() - lock.acquiredAt >= RECOVERY_DELAY_MS) return;
      if (lock.owner !== owner || !recover) {
        throw new CustomerError('A customer or library operation holds this resource. Inspect its status before retrying.', 409, 'DEMO_CUSTOMER_BUSY');
      }
      if (Date.now() - lock.acquiredAt < RECOVERY_DELAY_MS) throw new CustomerError('Wait five minutes before recovery so the original request has stopped.', 409, 'DEMO_CUSTOMER_RECOVERY_TOO_EARLY');
    });
    if (initialOperation) tx.create(deps.firestore.collection(OPERATIONS).doc(owner), initialOperation);
    refs.forEach((ref) => tx.set(ref, { owner, acquiredAt: Date.now() }));
  });
}

async function releaseLocks(context, owner, deps) {
  const refs = resourceRefs(context, deps);
  await deps.firestore.runTransaction(async (tx) => {
    const snapshots = await Promise.all(refs.map((ref) => tx.get(ref)));
    snapshots.forEach((snap, i) => {
      if (snap.exists && snap.data().owner === owner) tx.delete(refs[i]);
    });
  });
}

// Legacy writes also take the same resource locks. Their requests are bounded
// by the Functions timeout; persistent package operations use explicit recovery.
async function withResourceLocks(context, work, dependencies = {}) {
  const release = await acquireLegacyWrite(context, dependencies);
  try {
    return await work();
  } finally {
    await release();
  }
}

async function acquireLegacyWrite(context, dependencies = {}) {
  const deps = services(dependencies);
  const owner = `legacy:${randomUUID()}`;
  await acquireLocks(context, owner, deps);
  return () => releaseLocks(context, owner, deps);
}

async function signedPreview(path, deps) {
  const [url] = await deps.backupBucket.file(path).getSignedUrl({ action: 'read', version: 'v4', expires: Date.now() + TTL_MS });
  if (!url) throw new CustomerError('Unable to create an image preview. No live assets were changed.', 503, 'DEMO_CUSTOMER_PREVIEW_UNAVAILABLE');
  return url;
}

async function savePrivate(path, bytes, contentType, deps) {
  if (deps.backupBucket.name && deps.backupBucket.name === deps.activeBucket.name) {
    throw new CustomerError('Customer snapshots require a private bucket separate from the public Image Hosting bucket.', 500);
  }
  await deps.backupBucket.file(path).save(bytes, {
    resumable: false, contentType,
    preconditionOpts: { ifGenerationMatch: 0 },
    metadata: { cacheControl: 'private, no-store' },
  });
  const verified = await readObject(deps.backupBucket, path);
  if (verified.sha256 !== digest(bytes)) throw new CustomerError('Cloud snapshot verification failed.', 500, 'DEMO_CUSTOMER_BACKUP_FAILED');
  return { backupPath: path, sha256: verified.sha256, contentType, size: bytes.length };
}

async function stage(context, input, dependencies = {}) {
  const deps = services(dependencies);
  const raw = input.base64;
  if (typeof raw !== 'string' || raw.length > 12 * 1024 * 1024 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(raw)) throw new CustomerError('Supply valid base64 for an image up to 8 MiB.', 413);
  const bytes = Buffer.from(raw, 'base64');
  if (!bytes.length || bytes.length > 8 * 1024 * 1024) throw new CustomerError('Image must be between 1 byte and 8 MiB.', 413);
  const sharp = deps.sharp || require('sharp');
  let md;
  try {
    md = await sharp(bytes, { limitInputPixels: 40_000_000, animated: true }).metadata();
  } catch (error) {
    throw new CustomerError(`Invalid or unsupported image: ${error.message}`);
  }
  const types = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', avif: 'image/avif' };
  const contentType = types[md.format === 'heif' && md.compression === 'av1' ? 'avif' : md.format];
  if (!contentType || contentType !== input.content_type) throw new CustomerError('Decoded image format must match content_type (PNG, JPEG, WebP, GIF or AVIF).');
  if ((md.pages || 1) > 200 || (md.width || 0) * (md.height || 0) > 40_000_000) throw new CustomerError('Image dimensions or animation exceed the supported limit.', 413);
  const stageId = randomUUID();
  const path = `demo-customer-staging/${scopeRef(context, deps).id}/${stageId}`;
  const saved = await savePrivate(path, bytes, contentType, deps);
  const previewUrl = await signedPreview(path, deps);
  await scopeRef(context, deps).collection('staging').doc(stageId).set({
    ...saved, fileName: String(input.file_name || '').slice(0, 240),
    width: md.width, height: md.height, expiresAt: new Date(Date.now() + TTL_MS).toISOString(),
  });
  return { ok: true, stageId, previewUrl, contentType, width: md.width, height: md.height };
}

async function inspect(context, input = {}, dependencies = {}) {
  const deps = services(dependencies);
  const ref = scopeRef(context, deps);
  const [scope, items, configuration] = await Promise.all([ref.get(), inventory(context, deps), readConfig(context, deps)]);
  const state = scope.exists ? scope.data() : {};
  let query = ref.collection('revisions').orderBy('createdAt', 'desc').limit(21);
  if (input.cursor) {
    const cursor = await ref.collection('revisions').doc(String(input.cursor)).get();
    if (!cursor.exists) throw new CustomerError('Unknown revision cursor.');
    query = query.startAfter(cursor);
  }
  const result = await query.get();
  const revisions = result.docs.slice(0, 20).map((doc) => {
    const data = doc.data();
    return { revisionId: doc.id, customerName: data.customerName, createdAt: data.createdAt, fileCount: data.files.length };
  });
  const activeCustomer = state.activeCustomer || null;
  const rtdbCustomerName = configuration.find((item) => item.path === 'CoreDemoData.name')?.value || null;
  const activeManifest = state.activeFiles || [];
  const fileDrift = digest(activeManifest.map(({ relPath, sha256 }) => ({ relPath, sha256 })).sort((a, b) => a.relPath.localeCompare(b.relPath)))
    !== digest(items.filter((item) => (state.customerPaths || []).includes(item.relPath)).map(({ relPath, sha256 }) => ({ relPath, sha256 })));
  const activeRevision = state.activeRevisionId ? await ownedDoc(ref.collection('revisions').doc(state.activeRevisionId)) : null;
  const drift = fileDrift || Boolean(activeRevision && digest(activeRevision.configuration) !== digest(configuration));
  let operation = null;
  const lock = await resourceRefs(context, deps)[0].get();
  const operationId = lock.exists && /^[a-f0-9]{64}$/.test(lock.data().owner) ? lock.data().owner : state.operationId;
  if (operationId) {
    const pending = await deps.firestore.collection(OPERATIONS).doc(operationId).get();
    if (pending.exists && pending.data().scopeId === ref.id) operation = await operationStatus(context, { operation_id: operationId }, deps, [scope, items, configuration]);
  }
  return {
    ok: true, activeCustomer, rtdbCustomerName, drift,
    items: items.map((item) => ({
      ...item, scope: (state.customerPaths || []).includes(item.relPath) ? 'customer' : (state.sharedPaths || []).includes(item.relPath) ? 'shared' : 'unassigned',
    })),
    configuration, revisions, nextCursor: result.docs.length > 20 ? revisions.at(-1).revisionId : null, operation,
    warnings: activeCustomer && activeCustomer !== rtdbCustomerName ? ['Saved active customer and RTDB name disagree. Confirm the outgoing backup name.'] : [],
  };
}

function classify(items, input, state) {
  if ([input.customer_paths, input.shared_paths].some((paths) => paths !== undefined && (!Array.isArray(paths) || paths.length > MAX_FILES))) {
    throw new CustomerError(`Customer/shared paths must be arrays of at most ${MAX_FILES} paths.`);
  }
  const customerPaths = [...new Set(input.customer_paths || state.customerPaths || [])].map(relativePath).sort();
  const sharedPaths = [...new Set(input.shared_paths || state.sharedPaths || [])].map(relativePath).sort();
  if (!customerPaths.length) throw new CustomerError('Select at least one customer-specific library path.');
  if (customerPaths.some((path) => sharedPaths.includes(path))) throw new CustomerError('A path cannot be both customer-specific and shared.');
  const unknown = items.filter((item) => !customerPaths.includes(item.relPath) && !sharedPaths.includes(item.relPath));
  if (unknown.length) throw new CustomerError(`Classify every existing asset as customer or shared first: ${unknown.map((item) => item.relPath).join(', ')}`, 409, 'DEMO_CUSTOMER_SCOPE_REQUIRED');
  return { customerPaths, sharedPaths };
}

function sortedManifest(files) {
  return files.map(({ relPath, sha256 }) => ({ relPath, sha256 })).sort((a, b) => a.relPath.localeCompare(b.relPath));
}

function versionFingerprint(items, configuration) {
  return digest({ files: sortedManifest(items), configuration });
}

async function preview(context, input, dependencies = {}) {
  const deps = services(dependencies);
  const ref = scopeRef(context, deps);
  const [snap, items, configuration] = await Promise.all([ref.get(), inventory(context, deps), readConfig(context, deps)]);
  const state = snap.exists ? snap.data() : {};
  const scope = classify(items, input, state);
  const saving = input.action === 'customer-save-preview';
  const rtdbName = configuration.find((item) => item.path === 'CoreDemoData.name')?.value;
  if (!saving && !input.backup_customer_name && state.activeCustomer && rtdbName && state.activeCustomer !== rtdbName) {
    throw new CustomerError('Active customer and RTDB names disagree. Confirm backup_customer_name before switching.', 409, 'DEMO_CUSTOMER_NAME_REQUIRED');
  }
  const outgoingCustomerName = customerName(saving ? input.customer_name : input.backup_customer_name || state.activeCustomer || configuration.find((item) => item.path === 'CoreDemoData.name')?.value);
  let name = saving ? outgoingCustomerName : input.customer_name;
  let desiredFiles = items.filter((item) => scope.customerPaths.includes(item.relPath));
  let desiredConfig = configuration;
  if (!saving && input.asset_preflight_id) {
    const assetPreview = await ownedDoc(deps.firestore.collection('labDemoAssetPreflights').doc(String(input.asset_preflight_id)));
    const configPreview = await ownedDoc(deps.firestore.collection(configService.PREFLIGHT_COLLECTION).doc(String(input.config_preflight_id)));
    for (const source of [assetPreview, configPreview]) {
      if (source.uid !== context.uid || source.sandbox !== context.sandbox || source.workspaceSlug !== context.workspaceSlug
        || source.status !== 'pending' || Date.parse(source.expiresAt) <= Date.now()) throw new CustomerError('Scrape preflight expired or belongs to a different workspace.', 409);
    }
    name = assetPreview.customerName;
    const stagedReplacements = [];
    for (const file of assetPreview.proposed) {
      const stageId = randomUUID();
      await ref.collection('staging').doc(stageId).set({
        backupPath: file.stagePath, sha256: file.sha256, size: file.size,
        contentType: file.contentType, expiresAt: assetPreview.expiresAt,
      });
      stagedReplacements.push({ rel_path: file.relPath, stage_id: stageId });
    }
    input = {
      ...input, customer_name: name, replacements: stagedReplacements,
      changes: [...new Map([
        ...(configPreview.proposedChanges || configPreview.diff.map((item) => ({ path: item.path, value: item.after }))),
        ...(input.changes || []),
      ].map((item) => [item.path, item])).values()],
    };
  }
  if (!saving && input.revision_id) {
    const revision = await ownedDoc(ref.collection('revisions').doc(String(input.revision_id)));
    name = revision.customerName;
    desiredFiles = revision.files;
    desiredConfig = revision.configuration;
  } else if (!saving) {
    name = customerName(name);
    const changes = input.changes || [];
    if (!Array.isArray(changes) || changes.length > BRAND_PATHS.length) throw new CustomerError('Invalid customer configuration changes.');
    const byPath = new Map(changes.map((item) => {
      if (!BRAND_PATHS.includes(item.path)) throw new CustomerError(`Not an approved customer branding field: ${item.path}`);
      return [item.path, configService.normalizeValue(item.path, item.value, { allowNull: true })];
    }));
    if (byPath.get('CoreDemoData.name') !== name) throw new CustomerError('Set CoreDemoData.name to the incoming customer name.');
    const missing = configuration.filter((item) => item.value !== null && item.value !== '' && !byPath.has(item.path));
    if (missing.length) throw new CustomerError(`Explicitly keep, replace or clear existing brand fields: ${missing.map((item) => item.path).join(', ')}`, 409, 'DEMO_CUSTOMER_FIELDS_REQUIRED');
    desiredConfig = configuration.map((item) => ({ ...item, value: byPath.has(item.path) ? byPath.get(item.path) : null }));
    const replacements = input.replacements || [];
    if (!Array.isArray(replacements) || replacements.length > MAX_FILES) throw new CustomerError('Invalid replacement list.');
    const seen = new Set();
    for (const replacement of replacements) {
      const relPath = relativePath(replacement.rel_path);
      if (seen.has(relPath) || scope.sharedPaths.includes(relPath)) throw new CustomerError(`Duplicate or shared replacement path: ${relPath}`);
      seen.add(relPath);
      const staged = await ownedDoc(ref.collection('staging').doc(String(replacement.stage_id)));
      if (Date.parse(staged.expiresAt) <= Date.now()) throw new CustomerError('Staged image expired. Upload it again.', 409);
      const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif' }[staged.contentType];
      if (!(relPath.toLowerCase().endsWith(`.${extension}`) || extension === 'jpg' && relPath.toLowerCase().endsWith('.jpeg'))) {
        throw new CustomerError(`Target ${relPath} must match the uploaded image format. Convert it explicitly before staging.`);
      }
      desiredFiles = desiredFiles.filter((item) => item.relPath !== relPath);
      desiredFiles.push({ ...staged, relPath });
      if (!scope.customerPaths.includes(relPath)) scope.customerPaths.push(relPath);
    }
  }
  if (desiredFiles.some((item) => scope.sharedPaths.includes(item.relPath))) throw new CustomerError('Saved customer collides with a shared path. Reclassify explicitly before restoring.', 409);
  if (desiredFiles.length > MAX_FILES || desiredFiles.reduce((sum, item) => sum + item.size, 0) > MAX_BYTES) throw new CustomerError('Customer package exceeds supported size.', 413);
  const projected = [...items.filter((item) => !scope.customerPaths.includes(item.relPath)), ...desiredFiles];
  if (projected.length > MAX_FILES || projected.reduce((sum, item) => sum + item.size, 0) > MAX_BYTES) {
    throw new CustomerError('The resulting library, including shared assets, exceeds the 200-file / 100 MiB limit.', 413);
  }
  const preflightId = randomUUID();
  const files = [];
  for (const item of desiredFiles) {
    let saved = item;
    if (!item.backupPath) {
      const object = await readObject(deps.activeBucket, libraryRoot(context.sandbox) + item.relPath);
      if (object.sha256 !== item.sha256) throw new CustomerError('Library changed while preparing preview.', 409);
      saved = { relPath: item.relPath, ...await savePrivate(`demo-customer-staging/${ref.id}/${preflightId}/${item.relPath}`, object.bytes, object.contentType, deps) };
    } else {
      const object = await readObject(deps.backupBucket, item.backupPath);
      if (object.sha256 !== item.sha256) throw new CustomerError('Saved image checksum does not match.', 409);
    }
    files.push(saved);
  }
  const doc = {
    kind: saving ? 'save' : 'switch', customerName: customerName(name), outgoingCustomerName,
    files, configuration: desiredConfig, scope,
    expected: versionFingerprint(items, configuration),
    expectedScope: digest(state),
    expiresAt: new Date(Date.now() + TTL_MS).toISOString(),
    status: 'pending',
  };
  const previews = [];
  for (const file of files) {
    const before = items.find((item) => item.relPath === file.relPath);
    previews.push({
      relPath: file.relPath, action: !before ? 'add' : before.sha256 === file.sha256 ? 'keep' : 'replace',
      contentType: file.contentType, sha256: file.sha256, size: file.size,
      beforeUrl: before?.cdnUrl || null, previewUrl: await signedPreview(file.backupPath, deps),
    });
  }
  if (!saving) items.filter((item) => scope.customerPaths.includes(item.relPath) && !files.some((file) => file.relPath === item.relPath))
    .forEach((item) => previews.push({ relPath: item.relPath, action: 'delete', beforeUrl: item.cdnUrl }));
  await ref.collection('preflights').doc(preflightId).set(doc);
  return {
    ok: true, preflightId, customerName: doc.customerName, outgoingCustomerName, files: previews,
    configurationDiff: desiredConfig.filter((item, i) => item.value !== configuration[i].value).map((item) => ({ path: item.path, before: configuration.find((current) => current.path === item.path)?.value ?? null, after: item.value })),
    warnings: ['Stable URLs may be cached by email image proxies. Existing emails can display newer branding when refetched.', ...(saving ? [] : ['Assets are published sequentially; avoid presenting until verification completes.'])],
    expiresAt: doc.expiresAt,
  };
}

async function createSnapshot(context, name, files, configuration, deps) {
  const ref = scopeRef(context, deps).collection('revisions').doc();
  const copied = [];
  for (const file of files) {
    const source = await readObject(file.backupPath ? deps.backupBucket : deps.activeBucket,
      file.backupPath || libraryRoot(context.sandbox) + file.relPath);
    if (source.sha256 !== file.sha256) throw new CustomerError(`Snapshot source changed: ${file.relPath}`, 409);
    const saved = await savePrivate(`demo-customer-backups/${scopeRef(context, deps).id}/${ref.id}/${file.relPath}`, source.bytes, source.contentType, deps);
    copied.push({ relPath: file.relPath, ...saved });
  }
  const snapshot = { customerName: name, files: copied, configuration, createdAt: new Date().toISOString() };
  await ref.set(snapshot);
  return { revisionId: ref.id, ...snapshot };
}

async function compareAndWriteConfig(context, expected, desired, deps) {
  let conflict = false;
  const result = await deps.database.ref(`ajoLookups/${context.workspaceSlug}`).transaction((root) => {
    if (digest(configValues(root || {})) !== digest(expected)) {
      conflict = true;
      // A cold local cache yields null first; return it so RTDB reruns with the server value instead of aborting.
      return root === null ? null : undefined;
    }
    const next = { ...(root || {}) };
    desired.forEach(({ path, value }) => {
      const [section, field] = path.split('.');
      next[section] = { ...next[section] };
      if (value === null) delete next[section][field];
      else next[section][field] = configService.normalizeValue(path, value);
      if (!Object.keys(next[section]).length) delete next[section];
    });
    conflict = false;
    return next;
  }, undefined, false);
  if (!result.committed || conflict) throw new CustomerError('RTDB branding changed after preview; no config overwrite was performed.', 409, 'DEMO_CUSTOMER_CONFIG_CONFLICT');
  if (digest(await readConfig(context, deps)) !== digest(desired)) throw new CustomerError('RTDB readback failed.', 500);
}

async function writeFiles(context, desired, current, deps) {
  const byPath = new Map(desired.map((item) => [relativePath(item.relPath), item]));
  const paths = [...new Set([...current.map((item) => item.relPath), ...byPath.keys()])].sort();
  for (const path of paths) {
    const before = current.find((item) => item.relPath === path);
    const file = deps.activeBucket.file(libraryRoot(context.sandbox) + path);
    const next = byPath.get(path);
    if (!next) {
      if (before) await file.delete({ ifGenerationMatch: before.generation });
      continue;
    }
    const object = await readObject(deps.backupBucket, next.backupPath);
    if (object.sha256 !== next.sha256) throw new CustomerError(`Saved image checksum mismatch: ${path}`, 409);
    await file.save(object.bytes, {
      contentType: next.contentType, resumable: false,
      preconditionOpts: { ifGenerationMatch: before?.generation || 0 },
      metadata: { cacheControl: 'public, max-age=0, must-revalidate' },
    });
  }
}

function operationRef(context, input, deps) {
  const id = input.operation_id || digest([context.uid, context.workspaceSlug, context.sandbox, keyValue(input.idempotency_key)]);
  if (typeof id !== 'string' || !/^[a-f0-9]{64}$/.test(id)) throw new CustomerError('Invalid operation ID.');
  return deps.firestore.collection(OPERATIONS).doc(id);
}

async function operationStatus(context, input, dependencies = {}, readback = null) {
  const deps = services(dependencies);
  const ref = operationRef(context, input, deps);
  const data = await ownedDoc(ref, 'Customer operation not found.');
  if (data.scopeId !== scopeRef(context, deps).id) throw new CustomerError('Operation does not belong to this workspace.', 403);
  let isCurrentlyActive = false;
  if (data.status === 'succeeded') {
    const [scope, items, configuration] = readback || await Promise.all([scopeRef(context, deps).get(), inventory(context, deps), readConfig(context, deps)]);
    const active = scope.exists ? scope.data() : {};
    isCurrentlyActive = active.operationId === ref.id
      && digest(sortedManifest(items.filter((item) => (active.customerPaths || []).includes(item.relPath)))) === digest(sortedManifest(data.targetFiles || []))
      && digest(configuration) === digest(data.configurationAfter);
  }
  return { ...data.result, ok: data.status === 'succeeded', verified: isCurrentlyActive, isCurrentlyActive, operationId: ref.id, status: data.status, error: data.error || null, canRecoverAfter: new Date(data.startedAt + RECOVERY_DELAY_MS).toISOString() };
}

async function rollback(context, op, deps) {
  if (!op.before) return;
  const desired = await ownedDoc(scopeRef(context, deps).collection('revisions').doc(op.before.revisionId));
  const currentConfig = await readConfig(context, deps);
  if (digest(currentConfig) !== digest(op.configurationBefore)) {
    if (digest(currentConfig) !== digest(op.configurationAfter)) throw new CustomerError('Configuration changed externally; manual reconciliation is required.', 409);
    await compareAndWriteConfig(context, currentConfig, op.configurationBefore, deps);
  }
  const items = await inventory(context, deps);
  const paths = [...new Set([...desired.files.map((item) => item.relPath), ...op.targetFiles.map((item) => item.relPath)])];
  const touched = items.filter((item) => paths.includes(item.relPath));
  for (const item of touched) {
    const old = desired.files.find((file) => file.relPath === item.relPath);
    const next = op.targetFiles.find((file) => file.relPath === item.relPath);
    if (item.sha256 !== old?.sha256 && item.sha256 !== next?.sha256) throw new CustomerError('An image changed externally; manual reconciliation is required.', 409);
  }
  await writeFiles(context, desired.files, touched, deps);
  const verified = (await inventory(context, deps)).filter((item) => paths.includes(item.relPath));
  if (digest(sortedManifest(verified)) !== digest(sortedManifest(desired.files))) throw new CustomerError('Rollback image verification failed.', 500);
  await scopeRef(context, deps).set(op.previousState || {}, { merge: false });
}

async function apply(context, input, dependencies = {}) {
  const deps = services(dependencies);
  if (input.confirmed !== true) throw new CustomerError('Explicit confirmation is required.');
  const ref = scopeRef(context, deps);
  const previewRef = ref.collection('preflights').doc(String(input.preflight_id || ''));
  const preflight = await ownedDoc(previewRef);
  const opRef = operationRef(context, input, deps);
  const requestHash = digest([previewRef.id, preflight.expected, preflight.files, preflight.configuration, preflight.customerName, preflight.outgoingCustomerName, preflight.scope]);
  const prior = await opRef.get();
  if (prior.exists) {
    if (prior.data().requestHash !== requestHash) throw new CustomerError('Idempotency key belongs to a different preview.', 409, 'DEMO_CUSTOMER_IDEMPOTENCY_CONFLICT');
    return { ...await operationStatus(context, { operation_id: opRef.id }, deps), idempotentReplay: true };
  }
  if (preflight.status !== 'pending' || Date.parse(preflight.expiresAt) <= Date.now()) throw new CustomerError('Preview expired or already consumed; prepare it again.', 409);
  let op = { scopeId: ref.id, requestHash, status: 'prepared', startedAt: Date.now() };
  await acquireLocks(context, opRef.id, deps, false, op);
  try {
    const [items, configuration, stateSnap] = await Promise.all([inventory(context, deps), readConfig(context, deps), ref.get()]);
    if (versionFingerprint(items, configuration) !== preflight.expected
      || digest(stateSnap.exists ? stateSnap.data() : {}) !== preflight.expectedScope) {
      throw new CustomerError('Library, customer classification or branding changed after preview; prepare it again.', 409);
    }
    const previousState = stateSnap.exists ? stateSnap.data() : {};
    const outgoing = items.filter((item) => preflight.scope.customerPaths.includes(item.relPath));
    const before = await createSnapshot(context, preflight.outgoingCustomerName, outgoing, configuration, deps);
    op = {
      ...op, before: { revisionId: before.revisionId }, previousState,
      configurationBefore: configuration, configurationAfter: preflight.configuration, targetFiles: preflight.files,
      status: 'applying',
    };
    await opRef.set(op);
    await ref.set({ ...previousState, operationId: opRef.id });
    let activeRevision = before;
    if (preflight.kind === 'switch') {
      activeRevision = await createSnapshot(context, preflight.customerName, preflight.files, preflight.configuration, deps);
      await writeFiles(context, activeRevision.files, outgoing, deps);
      await compareAndWriteConfig(context, configuration, preflight.configuration, deps);
      const actual = (await inventory(context, deps)).filter((item) => preflight.scope.customerPaths.includes(item.relPath) || preflight.files.some((file) => file.relPath === item.relPath));
      if (digest(sortedManifest(actual)) !== digest(sortedManifest(activeRevision.files))) throw new CustomerError('Image readback did not match the confirmed package.', 500);
      if (deps.verifyPublicFile) {
        for (const item of activeRevision.files) await deps.verifyPublicFile(cdnUrl(context.sandbox, item.relPath), item);
        for (const item of outgoing.filter((file) => !activeRevision.files.some((next) => next.relPath === file.relPath))) {
          await deps.verifyPublicFile(cdnUrl(context.sandbox, item.relPath), null);
        }
      }
    }
    const result = {
      ok: true, status: 'succeeded', operationId: opRef.id, customerName: preflight.customerName,
      revisionId: activeRevision.revisionId, backupRevisionId: before.revisionId, verified: true,
      publicDeliveryVerified: preflight.kind === 'switch' && Boolean(deps.verifyPublicFile),
      guidance: 'Storage and RTDB are verified. Check downstream rendering before presenting; email proxies can cache older images.',
    };
    await ref.set({
      activeCustomer: preflight.customerName, activeRevisionId: activeRevision.revisionId,
      activeFiles: sortedManifest(activeRevision.files), customerPaths: [...new Set([...preflight.scope.customerPaths, ...preflight.files.map((file) => file.relPath)])].sort(),
      sharedPaths: preflight.scope.sharedPaths, operationId: opRef.id,
    });
    await opRef.set({ ...op, status: 'succeeded', result });
    await previewRef.set({ status: 'applied' }, { merge: true });
    await releaseLocks(context, opRef.id, deps);
    return result;
  } catch (error) {
    let status = 'rolled_back';
    let recoveryError = null;
    try {
      await rollback(context, op, deps);
    } catch (failure) {
      status = 'recovery_required';
      recoveryError = failure.message;
    }
    try {
      await opRef.set({ ...op, status, error: error.message, recoveryError });
      if (status === 'rolled_back') await releaseLocks(context, opRef.id, deps);
    } catch (journalError) {
      const wrapped = new CustomerError(`Operation finalization failed: ${journalError.message}. Check operation ${opRef.id} before making further changes. Original failure: ${error.message}`, 500, 'DEMO_CUSTOMER_JOURNAL_FAILED');
      wrapped.operationId = opRef.id;
      throw wrapped;
    }
    const wrapped = new CustomerError(`Customer operation failed (${status}): ${error.message}${recoveryError ? `; ${recoveryError}` : ''}`, Number(error.status) || 500, 'DEMO_CUSTOMER_OPERATION_FAILED');
    wrapped.operationId = opRef.id;
    throw wrapped;
  }
}

async function recover(context, input, dependencies = {}) {
  const deps = services(dependencies);
  if (input.confirmed !== true) throw new CustomerError('Explicit recovery confirmation is required.');
  const ref = operationRef(context, input, deps);
  const op = await ownedDoc(ref);
  if (op.scopeId !== scopeRef(context, deps).id) throw new CustomerError('Operation belongs to another workspace.', 403);
  if (['succeeded', 'rolled_back'].includes(op.status)) {
    const locks = await Promise.all(resourceRefs(context, deps).map((lock) => lock.get()));
    if (locks.some((lock) => lock.exists && lock.data().owner === ref.id)) {
      await acquireLocks(context, ref.id, deps, true);
      await releaseLocks(context, ref.id, deps);
    }
    return operationStatus(context, input, deps);
  }
  await acquireLocks(context, ref.id, deps, true);
  try {
    await rollback(context, op, deps);
    await ref.set({ status: 'rolled_back', error: 'Recovered the outgoing customer after an interrupted operation.' }, { merge: true });
    await releaseLocks(context, ref.id, deps);
    return operationStatus(context, input, deps);
  } catch (error) {
    await ref.set({ status: 'recovery_required', error: error.message }, { merge: true });
    throw error;
  }
}

async function handle(context, input, dependencies = {}) {
  switch (input.action) {
    case 'customer-inspect': return inspect(context, input, dependencies);
    case 'customer-stage': return stage(context, input, dependencies);
    case 'customer-save-preview':
    case 'customer-switch-preview': return preview(context, input, dependencies);
    case 'customer-apply': return apply(context, input, dependencies);
    case 'customer-status': return operationStatus(context, input, dependencies);
    case 'customer-recover': return recover(context, input, dependencies);
    default: throw new CustomerError('Unknown customer action.');
  }
}

async function cleanTemporaryObjects(dependencies = {}) {
  const deps = services(dependencies);
  let deleted = 0;
  for await (const file of deps.backupBucket.getFilesStream({ prefix: 'demo-customer-staging/' })) {
    const [metadata] = await file.getMetadata();
    if (Date.parse(metadata.timeCreated) > Date.now() - 24 * 60 * 60 * 1000) continue;
    if (!Number.isFinite(Date.parse(metadata.timeCreated))) throw new CustomerError('Temporary object has no valid creation time.', 500);
    await file.delete({ ifGenerationMatch: metadata.generation });
    deleted += 1;
  }
  return { deleted };
}

module.exports = {
  BRAND_PATHS, SCOPES, OPERATIONS, LOCKS, CustomerError, handle, inspect,
  stage, preview, apply, recover, cleanTemporaryObjects, withResourceLocks, acquireLegacyWrite, relativePath, digest,
};
