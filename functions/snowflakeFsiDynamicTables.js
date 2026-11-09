'use strict';

const fs = require('node:fs');
const path = require('node:path');

const TARGETS = new Set(['REL_FSI_ACCOUNT', 'REL_FSI_CARD', 'REL_FSI_TRANSACTION']);
const SOURCE_FILE = path.join(__dirname, 'sql', 'rel', '20_fsi.sql');

function compileReplacement(table, policy, {assert, identifier, quote}) {
  const parts = typeof table === 'string' ? table.split('.') : [];
  assert(parts.length === 3 && parts[0] === policy.database && parts[1] === 'REL',
    'SCOPE_DENIED', 'FSI dynamic-table replacement requires an explicitly qualified target in the REL schema.');
  parts.forEach(identifier);
  assert(TARGETS.has(parts[2]), 'SCOPE_DENIED', 'Only the three registered FSI relational targets can be replaced.');
  const allowedSchemas = policy.allowedSchemas || [policy.schema];
  assert(allowedSchemas.includes('AEP_SCHEMA') && allowedSchemas.includes('REL'),
    'SCOPE_DENIED', 'FSI replacement requires both AEP_SCHEMA and REL in the workspace allowlist.');

  const source = fs.readFileSync(SOURCE_FILE, 'utf8');
  const prefix = `CREATE DYNAMIC TABLE IF NOT EXISTS REL.${parts[2]}`;
  const definition = source.split(';').map(statement => statement.trim())
    .find(statement => statement.startsWith(prefix));
  assert(definition, 'MIGRATION_DEFINITION_MISSING', `No checked-in FSI definition exists for ${parts[2]}.`);

  const db = quote(policy.database), warehouse = quote(policy.warehouse);
  const sql = definition
    .replace(prefix, `CREATE OR REPLACE DYNAMIC TABLE ${db}.${quote('REL')}.${quote(parts[2])} COPY GRANTS`)
    .replace(/\bAEP_SCHEMA\.([A-Za-z_][A-Za-z0-9_$]*)\b/g,
      (_match, name) => `${db}.${quote('AEP_SCHEMA')}.${quote(name)}`)
    .replace(/\bREL\.([A-Za-z_][A-Za-z0-9_$]*)\b/g,
      (_match, name) => `${db}.${quote('REL')}.${quote(name)}`)
    .replace(/\{\{WAREHOUSE\}\}/g, warehouse);
  return {sql};
}

module.exports = {compileReplacement};
