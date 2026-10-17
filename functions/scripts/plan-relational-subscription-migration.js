#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const TARGETS = Object.freeze({
  '40_telecom.sql': ['REL_TELECOM_SUBSCRIPTION', 'REL_TELECOM_PLAN_CATALOG'],
  '50_media.sql': ['REL_MEDIA_SUBSCRIPTION'],
});

function identifier(value, name) {
  if (typeof value !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`${name} must be an unquoted Snowflake identifier.`);
  }
  return value.toUpperCase();
}

function buildSubscriptionMigration({ database, schema, warehouse }) {
  const db = identifier(database, 'database');
  const sourceSchema = identifier(schema, 'schema');
  const wh = identifier(warehouse, 'warehouse');
  const statements = [];
  for (const [file, tables] of Object.entries(TARGETS)) {
    const source = fs.readFileSync(path.join(__dirname, '../sql/rel', file), 'utf8');
    for (const table of tables) {
      const prefix = `CREATE DYNAMIC TABLE IF NOT EXISTS REL.${table}\n`;
      const statement = source.split(';').find((part) => part.trim().startsWith(prefix));
      if (!statement) throw new Error(`Missing migration definition: ${table}`);
      statements.push(statement.trim()
        .replace(prefix, `CREATE OR REPLACE DYNAMIC TABLE REL.${table}\n`)
        .replace(/\{\{WAREHOUSE\}\}/g, wh)
        .replace(/\b(AEP_SCHEMA|REL)\./g, (_match, name) =>
          name === 'AEP_SCHEMA' ? `${db}.${sourceSchema}.` : `${db}.REL.`) + ';');
    }
  }
  return [
    '-- REVIEW ONLY: this script does not connect to Snowflake or execute SQL.',
    '-- Replaces three derived dynamic tables; source/profile tables are not modified.',
    '-- Snowflake DDL is not transactional. Inspect definitions, grants, downstream',
    '-- dependencies and ingestion mappings before executing in an approved window.',
    '-- Pause incremental ingestion and arrange a refreshed snapshot after replacement.',
    ...statements,
  ].join('\n\n');
}

function main(args) {
  const config = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    if (!['database', 'schema', 'warehouse'].includes(key) || !args[i].startsWith('--') ||
        !args[i + 1] || Object.hasOwn(config, key)) {
      throw new Error('Usage: node functions/scripts/plan-relational-subscription-migration.js --database DB --schema SCHEMA --warehouse WH');
    }
    config[key] = args[i + 1];
  }
  return buildSubscriptionMigration(config);
}

if (require.main === module) {
  try {
    process.stdout.write(main(process.argv.slice(2)) + '\n');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { buildSubscriptionMigration };
