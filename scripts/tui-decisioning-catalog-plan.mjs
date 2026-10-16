import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compilePlan } from './provision-decisioning-catalog.mjs';

const require = createRequire(import.meta.url);
const model = require('../web/profile-viewer/tui-decisioning-model.js');

export function buildTuiPlan(rawOffers) {
  const verified = model.tags.map(([id]) => {
    const source = rawOffers.find(raw => raw._experience?.decisioning?.decisionitem?.itemCatalogID ===
      'xcore:decision-catalog:18c6b876319b00e4' &&
      raw._experience.decisioning.decisionitem.itemTags?.includes(id));
    const tag = source?._experience.decisioning.decisionitem.itemTagDetails?.find(tag => tag.id === id);
    if (!tag?.name || !source.id) throw new Error(`Missing live unified tag ${id}`);
    return { id, name: tag.name, sourceOfferId: source.id };
  });
  const plan = model.catalogPlan(verified);
  compilePlan(plan);
  return plan;
}

async function main(args) {
  if (args.length !== 2) throw new Error('Usage: node scripts/tui-decisioning-catalog-plan.mjs <verified-raw-offers.json> <output-plan.json>');
  if (resolve(args[0]) === resolve(args[1])) throw new Error('Output cannot overwrite the inventory');
  const offers = JSON.parse((await readFile(args[0], 'utf8')).replace(/^\uFEFF/, ''));
  if (!Array.isArray(offers)) throw new Error('Input must be an array of raw offers from kirkham');
  const plan = buildTuiPlan(offers);
  await writeFile(args[1], JSON.stringify(plan, null, 2), { flag: 'wx' });
  const result = compilePlan(plan);
  console.log(JSON.stringify({ fingerprint: result.fingerprint, assets: result.assets.length,
    scenarios: plan.scenarios.length, warning: 'Plan only. Reused tags include BA items. No consent policy gate, live media or activation is configured.' }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
