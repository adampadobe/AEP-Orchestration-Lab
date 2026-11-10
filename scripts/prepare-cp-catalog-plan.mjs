import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const model = require('../web/profile-viewer/cp-decisioning-model.js');
const schemaId = 'https://ns.adobe.com/demoemea/schemas/a951877632f590031b11072842a80e09818b31874d291cec';
const endpoint = 'https://aep-orchestration-lab.web.app/api/aep';
async function read(accept) {
  const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(60000), body: JSON.stringify({ method: 'GET',
      path: '/data/foundation/schemaregistry/tenant/schemas/' + encodeURIComponent(schemaId),
      platform_headers: { Accept: accept, 'x-sandbox-name': 'kirkham' } }) });
  const data = await res.json();
  if (!res.ok || data.status !== 200 || !data.platform_response) throw new Error('Schema verification failed: ' + JSON.stringify(data));
  return data.platform_response;
}
const metadata = await read('application/vnd.adobe.xed+json; version=1');
if (!/^\d+\.\d+$/.test(metadata.version)) throw new Error('Missing current schema version.');
const schema = await read('application/vnd.adobe.xed-full+json; version=' + metadata.version);
if (schema.version !== metadata.version) throw new Error('Schema changed while resolving; no catalog plan generated.');
const leaves = model.fields.map(field => {
  const node = field.path.split('.').reduce((node, key) => node?.properties?.[key], schema);
  const type = field.schemaType || field.type;
  if (!node || node.readOnly === true || !(node.type === type || type === 'number' && node.type === 'integer') ||
    field.format && node.format !== field.format) {
    throw new Error('Existing schema field is missing or incompatible: ' + field.path);
  }
  if (node.enum && field.values?.some(value => !node.enum.includes(value))) throw new Error('Invalid enum values: ' + field.path);
  if (field.path.includes('.airlineCustomer.')) throw new Error('CP must not use airline profile fields.');
  return { path: field.path, type: node.type, ...(node.format ? { format: node.format } : {}), ...(node.enum ? { enum: node.enum } : {}) };
});
const plan = model.catalogPlan({ sandbox: 'kirkham', schemaId, schemaVersion: schema.version,
  schemaTitle: schema.title, verifiedAt: new Date().toISOString(), fields: leaves });
await writeFile(new URL('../web/profile-viewer/cp-decisioning-catalog-plan.json', import.meta.url), JSON.stringify(plan, null, 2) + '\n');
console.log('Verified ' + leaves.length + ' existing schema fields; prepared 21 CP items and seven tag collections/strategies. No Adobe writes.');
