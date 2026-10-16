import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compilePlan, contains, fingerprint } from './provision-decisioning-catalog.mjs';

export function ruleModelRepair(asset, raw) {
  if (asset.entity_type !== 'offer-rules' || raw.name !== asset.item.name ||
      !contains(raw.condition, asset.item.condition) || raw.exdRule !== true) {
    throw new Error(`Rule identity/condition drift: ${asset.key}`);
  }
  if (contains(raw.segmentModel, asset.item.segmentModel)) return [];
  if (raw.segmentModel) throw new Error(`Existing visual model differs: ${asset.key}; review before overwriting`);
  return [{ op: 'add', path: '/segmentModel', value: asset.item.segmentModel }];
}

async function main(args) {
  const [planPath, journalPath, repairPath, mode, confirmation] = args;
  if (!planPath || !journalPath || !repairPath || !['--preview', '--apply'].includes(mode)) {
    throw new Error('Usage: node scripts/repair-decisioning-rule-models.mjs <plan> <original-journal> <repair-journal> --preview|--apply [reviewed-hash]');
  }
  if (new Set([planPath, journalPath, repairPath].map(p => resolve(p))).size !== 3) throw new Error('Artifact paths must differ');
  const plan = JSON.parse(await readFile(planPath, 'utf8'));
  const journal = JSON.parse(await readFile(journalPath, 'utf8'));
  const compiled = compilePlan(plan);
  if (journal.fingerprint !== compiled.fingerprint) throw new Error('Original journal/plan mismatch');
  const rules = compiled.assets.filter(a => a.entity_type === 'offer-rules');
  const call = async (route, body) => {
    const response = await fetch(`https://aep-orchestration-lab.web.app/api/decisioning/catalog/${route}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sandbox: plan.sandbox, entity_type: 'offer-rules', ...body }),
      signal: AbortSignal.timeout(120000),
    });
    const result = await response.json();
    if (!response.ok || result.ok !== true) throw new Error(`${route}: ${result.error || response.status}`);
    return result;
  };
  const bundle = rules.map(asset => {
    const entry = journal.assets[asset.key];
    if (entry?.status !== 'verified' || !entry.id) throw new Error(`Unverified original rule: ${asset.key}`);
    return { key: asset.key, id: entry.id, name: asset.item.name, segmentModel: asset.item.segmentModel };
  });
  const hash = fingerprint(bundle);
  if (mode === '--preview') {
    for (const asset of rules) ruleModelRepair(asset, (await call('get', { id: journal.assets[asset.key].id })).raw);
    console.log(JSON.stringify({ sandbox: plan.sandbox, fingerprint: hash, rules: bundle,
      scope: 'Add missing visual attributes only; preserve PQL, IDs and attachments. No creates or activation.' }, null, 2));
    return;
  }
  if (confirmation !== hash) throw new Error('Supply reviewed repair fingerprint');
  const record = { fingerprint: hash, assets: {} };
  await writeFile(repairPath, JSON.stringify(record, null, 2), { flag: 'wx', flush: true });
  const save = () => writeFile(repairPath, JSON.stringify(record, null, 2), { flush: true });
  for (const asset of rules) {
    const id = journal.assets[asset.key].id;
    const raw = (await call('get', { id })).raw;
    const patches = ruleModelRepair(asset, raw);
    if (patches.length) {
      const input = { action: 'update', id, patches };
      const preview = await call('change-preview', input);
      record.assets[asset.key] = { id, status: 'pending' };
      await save();
      await call('change-apply', { ...input, preflight_id: preview.preflight_id,
        confirmation: preview.required_confirmation });
    }
    const checked = (await call('get', { id })).raw;
    if (!contains(checked.segmentModel, asset.item.segmentModel) || !contains(checked.condition, raw.condition)) {
      throw new Error(`Rule repair readback failed: ${id}`);
    }
    record.assets[asset.key] = { id, status: 'verified' };
    await save();
  }
  console.log(JSON.stringify({ sandbox: plan.sandbox, verifiedRules: rules.length, policyActivated: false }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => {
    console.error(`Rule model repair stopped; inspect repair journal before any retry: ${error.message}`);
    process.exitCode = 1;
  });
}
