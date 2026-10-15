#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { generateEcid } = require('../ecidGenerator');
const { generateTravelProfileRow } = require('../snowflakeTravelProfileGenerator');
const { generateIndustryProfileRow } = require('../snowflakeIndustryProfileGenerator');
const { listSnowflakeProfileIndustries } = require('../snowflakeIndustryProfileRegistry');
const { qualifiedRecipientTable } = require('../snowflakeRecipientStore');
const { HERO_PROFILE_NAMES } = require('../snowflakeRelationalGenerator');
const { prepareSeedTables, buildSeedRecord, writeSeedRecords, getNextSeedCrmIndex } = require('../snowflakeSeedStore');

function usage() {
  return [
    'Usage: node functions/scripts/generate-relational-snowflake.js [options]',
    '',
    '  --industry <name|all>      Industry details to seed (default: all)',
    '  --count <number>           New shared base recipients to create (default: 10)',
    '  --base-email <email>       Required demo email; also accepts SNOWFLAKE_SEED_BASE_EMAIL',
    '  --hero-profiles <number>   Travel heroes (default: up to 5 for travel/all)',
    '  --as-of-date <YYYY-MM-DD>  Reference date for generated trips (default: today)',
    '',
    'Writes Snowflake only. Existing AEP ingestion flows are not modified.',
    'Connection: SNOWFLAKE_ACCOUNT, SNOWFLAKE_USER, SNOWFLAKE_WAREHOUSE,',
    'SNOWFLAKE_DATABASE, SNOWFLAKE_SCHEMA (default AEP_SCHEMA), optional SNOWFLAKE_ROLE,',
    'and SNOWFLAKE_PRIVATE_KEY_PATH / SNOWFLAKE_PRIVATE_KEY_PASSPHRASE or SNOWFLAKE_PASSWORD.',
  ].join('\n');
}

function parseArgs(argv) {
  const result = { industry: 'all', count: 10, heroProfiles: null, asOfDate: null, baseEmail: null };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--help' || argv[i] === '-h') return { help: true };
    const [flag, inlineValue] = argv[i].split('=', 2);
    const value = inlineValue === undefined ? argv[++i] : inlineValue;
    if (value === undefined || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    if (flag === '--industry') result.industry = value.trim().toLowerCase();
    else if (flag === '--count') result.count = Number(value);
    else if (flag === '--hero-profiles') result.heroProfiles = Number(value);
    else if (flag === '--as-of-date') result.asOfDate = value;
    else if (flag === '--base-email') result.baseEmail = value.trim();
    else throw new Error(`Unknown option: ${flag}`);
  }
  if (result.industry !== 'all' && !listSnowflakeProfileIndustries().includes(result.industry)) {
    throw new Error(`Unsupported industry "${result.industry}"`);
  }
  if (!Number.isInteger(result.count) || result.count < 1 || result.count > 1000) {
    throw new Error('--count must be an integer between 1 and 1000');
  }
  if (result.heroProfiles == null) {
    result.heroProfiles = ['travel', 'all'].includes(result.industry) ? Math.min(5, result.count) : 0;
  }
  if (!Number.isInteger(result.heroProfiles) || result.heroProfiles < 0 || result.heroProfiles > result.count) {
    throw new Error('--hero-profiles must be an integer between 0 and --count');
  }
  if (result.heroProfiles && !['travel', 'all'].includes(result.industry)) {
    throw new Error('--hero-profiles can only be used with travel or all industries');
  }
  if (result.asOfDate && (!/^\d{4}-\d{2}-\d{2}$/.test(result.asOfDate)
      || !Number.isFinite(Date.parse(`${result.asOfDate}T00:00:00Z`))
      || new Date(`${result.asOfDate}T00:00:00Z`).toISOString().slice(0, 10) !== result.asOfDate)) {
    throw new Error('--as-of-date must be a valid date in YYYY-MM-DD format');
  }
  result.asOfDate ||= new Date().toISOString().slice(0, 10);
  return result;
}

function safeIdentifier(value, label = 'identifier') {
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,254}$/.test(String(value || ''))) {
    throw new Error(`${label} must be a valid unquoted Snowflake identifier`);
  }
  return value;
}

function snowflakeOptionsFromEnv() {
  const account = process.env.SNOWFLAKE_ACCOUNT;
  const username = process.env.SNOWFLAKE_USER;
  if (!account || !username) throw new Error('SNOWFLAKE_ACCOUNT and SNOWFLAKE_USER are required');
  const cfg = {
    warehouse: safeIdentifier(process.env.SNOWFLAKE_WAREHOUSE, 'SNOWFLAKE_WAREHOUSE'),
    database: safeIdentifier(process.env.SNOWFLAKE_DATABASE, 'SNOWFLAKE_DATABASE'),
    schema: safeIdentifier(process.env.SNOWFLAKE_SCHEMA || 'AEP_SCHEMA', 'SNOWFLAKE_SCHEMA'),
  };
  const options = { account, username, ...cfg, application: 'AEP_ORCHESTRATION_LAB_RELATIONAL_GENERATOR' };
  if (process.env.SNOWFLAKE_ROLE) options.role = safeIdentifier(process.env.SNOWFLAKE_ROLE, 'SNOWFLAKE_ROLE');
  const keyPath = process.env.SNOWFLAKE_PRIVATE_KEY_PATH;
  if (keyPath) {
    const expanded = keyPath.startsWith('~/') ? path.join(os.homedir(), keyPath.slice(2)) : keyPath;
    const key = crypto.createPrivateKey({
      key: fs.readFileSync(expanded, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim(),
      format: 'pem',
      passphrase: process.env.SNOWFLAKE_PRIVATE_KEY_PASSPHRASE || undefined,
    });
    options.authenticator = 'SNOWFLAKE_JWT';
    options.privateKey = key.export({ type: 'pkcs8', format: 'pem' }).toString();
    if (!username.includes('@')) options.username = username.toUpperCase();
  } else if (process.env.SNOWFLAKE_PASSWORD) {
    options.password = process.env.SNOWFLAKE_PASSWORD;
  } else {
    throw new Error('Set SNOWFLAKE_PRIVATE_KEY_PATH or SNOWFLAKE_PASSWORD');
  }
  return { options, cfg };
}

function executeAsync(connection, sqlText, binds = []) {
  return new Promise((resolve, reject) => connection.execute({
    sqlText, binds,
    complete(error, _statement, rows) {
      if (error) reject(error);
      else resolve(rows || []);
    },
  }));
}

async function seedNewProfiles(execute, cfg, options) {
  const baseEmail = String(options.baseEmail || process.env.SNOWFLAKE_SEED_BASE_EMAIL || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(baseEmail)) throw new Error('--base-email must be a valid email');
  const industries = options.industry === 'all' ? listSnowflakeProfileIndustries() : [options.industry];
  for (const industry of industries) await prepareSeedTables(execute, cfg, industry);
  const parent = qualifiedRecipientTable(cfg.database, cfg.schema);
  const start = await getNextSeedCrmIndex(execute, cfg, industries);
  const runStamp = new Date().toISOString();
  const [local, domain] = baseEmail.split('@');
  const identities = Array.from({ length: options.count }, (_, index) => ({
    idx: start + index,
    crmId: `CRM${start + index}`,
    ecid: generateEcid(),
    email: `${local}+${runStamp.slice(0, 10).replaceAll('-', '')}-${crypto.randomUUID().slice(0, 8)}@${domain}`,
  }));
  const results = {};
  for (const industry of industries) {
    const records = identities.map((identity, index) => {
      const hero = index < options.heroProfiles;
      const names = industry === 'travel' && hero ? HERO_PROFILE_NAMES[index % HERO_PROFILE_NAMES.length] : null;
      const input = {
        ...identity, runStamp, asOfDate: options.asOfDate, hero,
        firstName: identity.firstName || names?.[0], lastName: identity.lastName || names?.[1],
      };
      const generated = industry === 'travel'
        ? generateTravelProfileRow(input) : generateIndustryProfileRow(industry, input);
      const rowObject = generated.rowObject;
      identity.sharedProfile ||= Object.fromEntries([
        'ECID', 'EMAIL', 'EMAILIDSHA256', 'CRMID', 'GAID', 'LOYALTYID', 'PHONENUMBER', 'PUSHTOKENS',
        'STACKCHATID', 'FIRSTNAME', 'LASTNAME', 'DATEOFBIRTH', 'GENDER', 'NATIONALITY',
        'PRIMARYEMAIL', 'PRIMARYPHONE', 'ADDRESSSTREET', 'ADDRESSCITY', 'ADDRESSPOSTALCODE', 'ADDRESSCOUNTRY',
      ].map((column) => [column, rowObject[column]]));
      Object.assign(rowObject, identity.sharedProfile);
      identity.firstName ||= rowObject.FIRSTNAME;
      identity.lastName ||= rowObject.LASTNAME;
      return buildSeedRecord(industry, rowObject, { index, runStamp, asOfDate: options.asOfDate, hero });
    });
    try {
      results[industry] = await writeSeedRecords(execute, cfg, industry, records);
    } catch (error) {
      throw new Error(`Seeding ${industry} failed. Previously committed industries: ${Object.keys(results).join(', ') || 'none'}. ${error.message}`, { cause: error });
    }
  }
  return { ok: true, recipientTable: parent, recipientsCreated: identities.length, tableRowcounts: results };
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  // Validate the seed address before opening a connection.
  const baseEmail = args.baseEmail || process.env.SNOWFLAKE_SEED_BASE_EMAIL;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(baseEmail || ''))) {
    throw new Error('--base-email must be a valid email');
  }
  const { options, cfg } = snowflakeOptionsFromEnv();
  const connection = require('snowflake-sdk').createConnection(options);
  try {
    await new Promise((resolve, reject) => connection.connect((error) => error ? reject(error) : resolve()));
    const result = await seedNewProfiles((sql, binds) => executeAsync(connection, sql, binds), cfg, args);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await new Promise((resolve) => connection.destroy(resolve));
  }
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`Snowflake seeding failed: ${error.message || String(error)}\n`);
    process.exitCode = 1;
  });
}

module.exports = { parseArgs, safeIdentifier, seedNewProfiles, main };
