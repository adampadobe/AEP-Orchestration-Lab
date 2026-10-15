/**
 * Snowflake data generator — Phase 2 minimal port of the AgenticAI Demo's
 * `data_generator.py` (BASE-PROFILE generation only).
 *
 * Source: /Users/apalmer/Library/CloudStorage/OneDrive-Adobe/AI Projects/
 *   AgenticAI Demo/Agentic_Demo_Platform/data_generator.py
 *   (TravelDataGenerator.generate_base_profiles + insert_base_profiles).
 *
 * Phase 2 scope:
 *   - Generate N base profiles matching AgenticAI `TravelDataGenerator.generate_base_profiles`
 *     (fixed name pools, UK-style addresses; emails from shared Firestore generation prefs
 *     `<local>+DDMMYYYY-N@domain>` by default — same counter as Profile Viewer / MCP).
 *   - Legacy Snowflake table scan (`adamp.adobedemo+DDMMYYYY+N@gmail.com`) only when
 *     `useGenerationPrefs: false` is passed explicitly.
 *   - Idempotently CREATE TABLE IF NOT EXISTS for the target table using the
 *     same 38-column shape AgenticAI's BASE_PROFILE table uses, so a fresh
 *     Snowflake target works on first run.
 *   - Bulk INSERT in batches via snowflake-sdk binds (default 200/batch).
 *   - Return rowcount + first 3 generated rows so the UI can render a sample.
 *
 * Out of scope (Phase 3):
 *   - Full / website / booking event generators
 *   - Loyalty, mobile, call, disruption, in-flight, hotel, POS streams
 *   - The query / enrich panel
 */

'use strict';

const { randomUUID } = require('crypto');
const store = require('./snowflakeConnectionStore');
const { COLUMNS, COLUMN_DDL } = require('./snowflakeBaseProfileSchema');
const { COLUMNS: TRAVEL_COLUMNS } = require('./snowflakeTravelProfileSchema');
const {
  mapAepAttributesToBaseProfileRow,
  mapAepAttributesToTravelProfileRow,
  normalizeAepAttributesForSnowflake,
  getAttr,
} = require('./snowflakeProfileMapper');
const { generateTravelProfileRow } = require('./snowflakeTravelProfileGenerator');
const { generateIndustryProfileRow } = require('./snowflakeIndustryProfileGenerator');
const {
  getIndustryProfileConfig,
  getIndustryProfileConfigByTable,
  listSnowflakeProfileIndustries,
} = require('./snowflakeIndustryProfileRegistry');
const { buildSnowflakeConnectOptions, describeConnectError } = require('./snowflakeService');
const { TRAVEL_MANIFEST } = require('./snowflakeIndustryManifest');
const { readSnowflakeCell } = require('./snowflakeRow');
const prefsStore = require('./labProfileGenerationPrefsStore');
const { createRecipient, recipientRow } = require('./snowflakeRecipientFactory');
const { ensureRecipientTable, mergeRecipientRows, qualifiedRecipientTable } = require('./snowflakeRecipientStore');
const { prepareSeedTables, buildSeedRecord, writeSeedRecords, getNextSeedCrmIndex, withTransaction } = require('./snowflakeSeedStore');

const DEFAULT_TABLE = 'BASE_PROFILES';
const DUAL_LOAD_DEFAULT_TABLE = TRAVEL_MANIFEST.dualLoad.defaultTargetTable;
const DEFAULT_COUNT = 10;
const MAX_COUNT = 1000;
const DEFAULT_BATCH_SIZE = 200;
const SAMPLE_SIZE = 3;

const COURTESY_TITLES_MALE = [
  { v: 'Mr', w: 80 },
  { v: 'Dr', w: 10 },
  { v: 'Prof', w: 10 },
];
const COURTESY_TITLES_FEMALE = [
  { v: 'Mrs', w: 40 },
  { v: 'Ms', w: 30 },
  { v: 'Miss', w: 20 },
  { v: 'Dr', w: 5 },
  { v: 'Prof', w: 5 },
];
const NAME_SUFFIXES = ['Jr', 'Sr', 'III', 'IV', 'PhD', 'MD'];
const STATE_PROVINCES = ['England', 'Scotland', 'Wales', 'California', 'Ontario'];

/** Mirrors `data_generator.py` name / geography pools. */
const FIRST_NAMES_MALE = [
  'James', 'John', 'Robert', 'Michael', 'William', 'David', 'Richard', 'Joseph', 'Thomas', 'Christopher',
  'Daniel', 'Matthew', 'Anthony', 'Mark', 'Donald', 'Steven', 'Andrew', 'Paul', 'Joshua', 'Kenneth',
];
const FIRST_NAMES_FEMALE = [
  'Mary', 'Patricia', 'Jennifer', 'Linda', 'Barbara', 'Elizabeth', 'Susan', 'Jessica', 'Sarah', 'Karen',
  'Lisa', 'Nancy', 'Betty', 'Margaret', 'Sandra', 'Ashley', 'Kimberly', 'Emily', 'Donna', 'Michelle',
];
const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
  'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
];
const CITIES = ['London', 'Manchester', 'Birmingham', 'Leeds', 'Glasgow', 'Liverpool', 'Edinburgh', 'Bristol'];
const COUNTRIES = ['United Kingdom', 'United States', 'Canada', 'Australia', 'Germany', 'France', 'Spain', 'Italy'];

const AGENTIC_MOBILE = '+447425627462';

/** Pick a value with weighted probability, mirroring random.choices(). */
function pickWeighted(options) {
  const total = options.reduce((acc, o) => acc + o.w, 0);
  let r = Math.random() * total;
  for (const o of options) {
    r -= o.w;
    if (r <= 0) return o.v;
  }
  return options[options.length - 1].v;
}

/** Validate a Snowflake identifier so we can safely interpolate it into DDL. */
function safeIdentifier(name, fallback) {
  const v = String(name == null ? '' : name).trim();
  if (!v) return fallback;
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,254}$/.test(v)) {
    throw new Error(
      `invalid identifier "${name}" — only [A-Za-z_][A-Za-z0-9_] up to 255 chars allowed`
    );
  }
  return v;
}

function fullyQualified(database, schema, table) {
  const parts = [];
  if (database) parts.push(safeIdentifier(database, ''));
  if (schema) parts.push(safeIdentifier(schema, ''));
  parts.push(safeIdentifier(table, DEFAULT_TABLE));
  return parts.filter(Boolean).join('.');
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Same as Python `datetime.now().strftime("%d%m%Y")` (runtime local date). */
function formatDdMmYyyy(now = new Date()) {
  const d = String(now.getDate()).padStart(2, '0');
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const y = String(now.getFullYear());
  return `${d}${m}${y}`;
}

/** Same as `TravelDataGenerator.generate_email`. */
function generateAgenticEmail(emailCounter) {
  const dateStr = formatDdMmYyyy();
  return `adamp.adobedemo+${dateStr}+${emailCounter}@gmail.com`;
}

/** Canonical 38-digit ECID (two signed-64-bit halves) accepted by Edge Network. */
const { generateEcid } = require('./ecidGenerator');

/**
 * Mirrors `customer_journey_probabilities.CustomerJourneyConfig.get_customer_profile_flags`
 * for the one field we persist on base rows: `has_loyalty` (60 % enrollment).
 */
function getCustomerProfileFlags() {
  return { has_loyalty: Math.random() < 0.6 };
}

/**
 * Build one base profile row (array order matches COLUMNS exactly).
 * @param {number} idx — numeric CRM suffix (`CRM${idx}`).
 * @param {string} runStamp — ISO timestamp for record columns.
 * @param {number} emailCounter — legacy daily email sequence (see `getDailyEmailCounterFromTable`).
 * @param {string|null} [emailOverride] — when set, use this address instead of Agentic scheme.
 */
function generateBaseProfileRow(idx, runStamp, emailCounter = 1, emailOverride = null) {
  const isMale = Math.random() < 0.5;
  const gender = isMale ? 'male' : 'female';
  const firstName = isMale ? pickRandom(FIRST_NAMES_MALE) : pickRandom(FIRST_NAMES_FEMALE);
  const lastName = pickRandom(LAST_NAMES);
  const courtesyTitle = pickWeighted(isMale ? COURTESY_TITLES_MALE : COURTESY_TITLES_FEMALE);
  const suffix = Math.random() < 0.07
    ? NAME_SUFFIXES[Math.floor(Math.random() * NAME_SUFFIXES.length)]
    : null;
  const fullName = suffix ? `${firstName} ${lastName} ${suffix}` : `${firstName} ${lastName}`;

  const ageYears = 21 + Math.floor(Math.random() * 55);
  const jitterDays = Math.floor(Math.random() * 366);
  const birth = new Date(Date.now() - (ageYears * 365 + jitterDays) * 86400000);
  const birthDay = birth.getDate();
  const birthMonth = birth.getMonth() + 1;
  const birthYear = birth.getFullYear();
  const birthYmd = `${birthYear}-${String(birthMonth).padStart(2, '0')}-${String(birthDay).padStart(2, '0')}`;
  const birthDayMonth = `${String(birthMonth).padStart(2, '0')}-${String(birthDay).padStart(2, '0')}`;

  const email = emailOverride ? String(emailOverride).trim() : generateAgenticEmail(emailCounter);
  const city = pickRandom(CITIES);
  const country = pickRandom(COUNTRIES);
  const postalCode = `SW${idx % 10}A 1AA`;
  const street = `${idx} High Street`.slice(0, 200);
  const stateProvince = pickRandom(STATE_PROVINCES);

  const journey = getCustomerProfileFlags();
  const loyaltyId = journey.has_loyalty ? `LOYALTY${idx + 2000}` : null;

  return [
    `CRM${idx}`,                                       // CRMID
    randomUUID(),                                      // ECID
    email,                                             // EMAIL
    `sha256_${idx}`,                                   // EMAILIDSHA256
    `GAID${idx}`,                                      // GAID
    loyaltyId,                                         // LOYALTYID
    `PASS${idx}`,                                      // PASSPORTID
    AGENTIC_MOBILE,                                    // PHONENUMBER (`generate_phone`)
    null,                                              // PUSHTOKENS (array)
    `STACK${idx}`,                                     // STACKCHATID
    firstName,                                         // FIRSTNAME
    lastName,                                          // LASTNAME
    birthYmd,                                          // BIRTHDATE
    gender,                                            // GENDER
    street,                                            // HOMEADDRESS_STREET1
    city,                                              // HOMEADDRESS_CITY
    stateProvince,                                     // HOMEADDRESS_STATEPROVINCE
    postalCode,                                        // HOMEADDRESS_POSTALCODE
    country,                                           // HOMEADDRESS_COUNTRY
    email,                                             // PERSONALEMAIL_ADDRESS
    'Personal',                                        // PERSONALEMAIL_LABEL
    true,                                              // PERSONALEMAIL_PRIMARY
    'Active',                                          // PERSONALEMAIL_STATUS
    'Verified',                                        // PERSONALEMAIL_STATUSREASON
    'Personal',                                        // PERSONALEMAIL_TYPE
    AGENTIC_MOBILE,                                    // MOBILEPHONE_NUMBER
    'Active',                                          // MOBILEPHONE_STATUS
    true,                                              // MOBILEPHONE_PRIMARY
    true,                                              // TESTPROFILE
    runStamp,                                          // _RECORDCREATEDTIMESTAMP
    runStamp,                                          // _RECORDUPDATEDTIMESTAMP
    courtesyTitle,                                     // PERSON_NAME_COURTESYTITLE
    suffix,                                            // PERSON_NAME_SUFFIX
    fullName,                                          // PERSON_NAME_FULLNAME
    birthDay,                                          // PERSON_BIRTHDAY
    birthMonth,                                        // PERSON_BIRTHMONTH
    birthYear,                                         // PERSON_BIRTHYEAR
    birthDayMonth,                                     // PERSON_BIRTHDAYANDMONTH
  ];
}

function rowToObject(row) {
  const o = {};
  for (let i = 0; i < COLUMNS.length; i++) o[COLUMNS[i]] = row[i];
  return o;
}

/** Promise wrapper around connection.execute. */
function execAsync(conn, options) {
  return new Promise((resolve, reject) => {
    conn.execute({
      ...options,
      complete(err, _stmt, rows) {
        if (err) reject(err);
        else resolve(rows || []);
      },
    });
  });
}

async function withSnowflakeTransaction(conn, work) {
  return withTransaction((sqlText, binds) => execAsync(conn, { sqlText, binds }), work);
}

async function prepareRecipientStore(conn, database, profileTable, schema) {
  await execAsync(conn, {
    sqlText: `ALTER TABLE IF EXISTS ${profileTable} ADD COLUMN IF NOT EXISTS RECIPIENT_ID VARCHAR(64)`,
  });
  await ensureRecipientTable(
    (sqlText, binds) => execAsync(conn, { sqlText, binds }),
    database,
    schema,
  );
}

function connectAsync(snowflake, options) {
  return new Promise((resolve, reject) => {
    const conn = snowflake.createConnection(options);
    conn.connect((err) => (err ? reject(err) : resolve(conn)));
  });
}

function destroyAsync(conn) {
  return new Promise((resolve) => {
    try { conn.destroy(() => resolve()); } catch (_) { resolve(); }
  });
}

/**
 * Next email index for today, scanning existing rows in `fqTable` (Python
 * `get_daily_email_counter` on matching `+DDMMYYYY+` pattern).
 */
async function getDailyEmailCounterFromTable(conn, fqTable) {
  const today = formatDdMmYyyy();
  const pattern = `%+${today}+%`;
  try {
    const rows = await execAsync(conn, {
      sqlText: `SELECT EMAIL FROM ${fqTable} WHERE EMAIL LIKE ?`,
      binds: [pattern],
    });
    let maxCounter = 0;
    for (const row of rows) {
      const email = readSnowflakeCell(row, 0, 'EMAIL');
      if (typeof email !== 'string') continue;
      const parts = email.split('+');
      if (parts.length >= 3) {
        try {
          const tail = parts[2].split('@')[0];
          const counter = parseInt(tail, 10);
          if (Number.isFinite(counter)) maxCounter = Math.max(maxCounter, counter);
        } catch (_) {
          /* ignore malformed */
        }
      }
    }
    return maxCounter + 1;
  } catch (e) {
    console.warn('[snowflakeDataGenerator] getDailyEmailCounterFromTable:', String(e && e.message || e));
    return 1;
  }
}

/** Next CRM numeric suffix after MAX(SUBSTRING(CRMID,4))) or 1000 if empty (Python `get_next_customer_id`). */
async function getNextCrmStartIndex(conn, fqTable) {
  try {
    const rows = await execAsync(conn, {
      sqlText: `SELECT MAX(TRY_CAST(SUBSTRING(CRMID, 4) AS INTEGER)) AS MX FROM ${fqTable}`,
    });
    const mx = readSnowflakeCell(rows[0], 0, 'MX');
    if (mx == null || !Number.isFinite(Number(mx))) return 1000;
    return Number(mx) + 1;
  } catch (_) {
    return 1000;
  }
}

/**
 * Generate `count` base profiles and INSERT them into the user's Snowflake.
 * Returns rowcount + sample of the first SAMPLE_SIZE generated rows so the
 * UI can render a confirmation panel without round-tripping back to Snowflake.
 *
 * @param {{ labUser: string, sandbox: string, count?: number, table?: string, batchSize?: number, startIndex?: number, useGenerationPrefs?: boolean }} input
 */
async function handleGenerateBaseProfiles(input) {
  const labUser = String(input.labUser || '').trim();
  const sandbox = String(input.sandbox || '').trim();
  if (!sandbox) throw new Error('sandbox is required');

  const requestedCount = Number.isFinite(input.count) ? Math.floor(input.count) : DEFAULT_COUNT;
  if (requestedCount <= 0) throw new Error('count must be a positive integer');
  if (requestedCount > MAX_COUNT) {
    throw new Error(`count must be ≤ ${MAX_COUNT} (got ${requestedCount})`);
  }
  const count = requestedCount;
  const batchSize = Math.max(1, Math.min(Number(input.batchSize) || DEFAULT_BATCH_SIZE, count));
  const tableName = safeIdentifier(input.table || DEFAULT_TABLE, DEFAULT_TABLE);
  const useGenerationPrefs = input.useGenerationPrefs !== false;
  if (useGenerationPrefs && !labUser) {
    throw new Error('labUser uid is required when useGenerationPrefs is enabled');
  }

  const resolved = await store.resolveConnection(labUser, sandbox);
  if (!resolved) {
    return {
      ok: false,
      error: {
        message:
          'No Snowflake credential saved for this user/sandbox yet. Save the connection first, then generate.',
        code: 'NO_CREDENTIAL',
        sqlState: null,
        hints: [],
      },
    };
  }

  let snowflake;
  try {
    snowflake = require('snowflake-sdk');
  } catch (e) {
    return {
      ok: false,
      error: {
        message:
          'snowflake-sdk is not installed in the Cloud Functions package. Add it to functions/package.json and redeploy.',
        code: 'SDK_MISSING',
        sqlState: null,
        hints: [],
      },
    };
  }

  const cfg = resolved.config;
  const fqTable = fullyQualified(cfg.database, cfg.schema, tableName);

  const runStamp = new Date().toISOString();

  let conn;
  let warehouseUsed = cfg.warehouse || null;
  let connectOptions;
  try {
    connectOptions = buildSnowflakeConnectOptions(resolved);
  } catch (err) {
    return { ok: false, error: describeConnectError(err) };
  }
  try {
    conn = await connectAsync(snowflake, connectOptions);

    if (warehouseUsed) {
      await execAsync(conn, { sqlText: `USE WAREHOUSE ${safeIdentifier(warehouseUsed, '')}` });
    }
    if (cfg.database) {
      await execAsync(conn, { sqlText: `USE DATABASE ${safeIdentifier(cfg.database, '')}` });
    }
    if (cfg.schema) {
      await execAsync(conn, { sqlText: `USE SCHEMA ${safeIdentifier(cfg.schema, '')}` });
    }

    const createSql =
      `CREATE TABLE IF NOT EXISTS ${fqTable} (\n  ${COLUMN_DDL.join(',\n  ')}\n)`;
    await execAsync(conn, { sqlText: createSql });

    let startIndex;
    if (Number.isFinite(input.startIndex) && input.startIndex > 0) {
      startIndex = Math.floor(input.startIndex);
    } else {
      startIndex = await getNextCrmStartIndex(conn, fqTable);
    }

    /** @type {string[]} */
    let reservedEmails = [];
    let emailStartCounter = null;
    let emailSource = 'legacy_snowflake_table_scan';

    if (useGenerationPrefs) {
      emailSource = 'labProfileGenerationPrefs';
      for (let i = 0; i < count; i += 1) {
        try {
          const reserved = await prefsStore.reserveNextEmail(labUser, sandbox);
          reservedEmails.push(reserved.scaledEmail);
          if (emailStartCounter == null) emailStartCounter = reserved.counterN;
        } catch (e) {
          const status = e && e.status;
          const message = String(e && e.message || e);
          return {
            ok: false,
            error: {
              message: status === 400
                ? message
                : `Failed to reserve generation prefs email: ${message}`,
              code: status === 400 ? 'GENERATION_PREFS_MISSING' : 'GENERATION_PREFS_ERROR',
              sqlState: null,
              hints: [
                'Set base email in Profile Viewer → Profile Generation or PUT /api/lab/generation-prefs.',
                'Pass use_generation_prefs:false only for legacy Agentic Snowflake email counter.',
              ],
            },
          };
        }
      }
    } else {
      emailStartCounter = await getDailyEmailCounterFromTable(conn, fqTable);
    }

    const rows = [];
    for (let i = 0; i < count; i++) {
      const emailOverride = useGenerationPrefs ? reservedEmails[i] : null;
      const legacyCounter = emailStartCounter + i;
      rows.push(
        generateBaseProfileRow(startIndex + i, runStamp, legacyCounter, emailOverride)
      );
    }

    const sample = rows.slice(0, SAMPLE_SIZE).map(rowToObject);

    const placeholders = COLUMNS.map(() => '?').join(', ');
    const insertSql = `INSERT INTO ${fqTable} (${COLUMNS.join(', ')}) VALUES (${placeholders})`;

    let inserted = 0;
    for (let i = 0; i < rows.length; i += batchSize) {
      const slice = rows.slice(i, i + batchSize);
      await execAsync(conn, { sqlText: insertSql, binds: slice });
      inserted += slice.length;
    }

    return {
      ok: true,
      table: fqTable,
      rowcount: inserted,
      batchSize,
      startIndex,
      emailStartCounter,
      emailEndCounter: useGenerationPrefs
        ? (reservedEmails.length ? emailStartCounter + count - 1 : null)
        : emailStartCounter + count - 1,
      emailSource,
      useGenerationPrefs,
      reservedEmails: useGenerationPrefs ? reservedEmails.slice(0, SAMPLE_SIZE) : undefined,
      runStamp,
      warehouse: warehouseUsed,
      sample,
    };
  } catch (err) {
    return { ok: false, error: describeConnectError(err) };
  } finally {
    if (conn) await destroyAsync(conn);
  }
}

/**
 * Generate CRM profile rows in the governed table for one supported industry.
 * Unlike the legacy BASE_PROFILES generator, callers cannot select an arbitrary
 * table: the registry owns the industry -> table/schema mapping.
 *
 * @param {{ labUser: string, sandbox: string, industry?: string, count?: number, batchSize?: number }} input
 */
async function handleGenerateIndustryProfiles(input) {
  const labUser = String(input.labUser || '').trim();
  const sandbox = String(input.sandbox || '').trim();
  const industry = String(input.industry || 'travel').trim().toLowerCase();
  if (!sandbox) throw new Error('sandbox is required');
  if (!labUser) throw new Error('labUser uid is required');

  const config = getIndustryProfileConfig(industry);
  if (!config) {
    throw new Error(
      `Unsupported Snowflake CRM industry "${industry}". Expected: ${listSnowflakeProfileIndustries().join(', ')}`,
    );
  }
  const requestedCount = Number.isFinite(input.count) ? Math.floor(input.count) : DEFAULT_COUNT;
  if (requestedCount <= 0 || requestedCount > MAX_COUNT) {
    throw new Error(`count must be between 1 and ${MAX_COUNT}`);
  }
  const count = requestedCount;
  const batchSize = Math.max(1, Math.min(Number(input.batchSize) || DEFAULT_BATCH_SIZE, count));

  const resolved = await store.resolveConnection(labUser, sandbox);
  if (!resolved) {
    return {
      ok: false,
      error: {
        message: 'No Snowflake credential saved for this user/sandbox yet. Save the connection first.',
        code: 'NO_CREDENTIAL',
        sqlState: null,
        hints: [],
      },
    };
  }

  let snowflake;
  try {
    snowflake = require('snowflake-sdk');
  } catch (e) {
    return {
      ok: false,
      error: {
        message: 'snowflake-sdk is not installed in the Cloud Functions package.',
        code: 'SDK_MISSING',
        sqlState: null,
        hints: [],
      },
    };
  }

  const cfg = resolved.config;
  const fqTable = fullyQualified(cfg.database, cfg.schema, config.table);
  const runStamp = new Date().toISOString();
  const schema = resolveDualLoadInsertSchema(config.table, industry);
  let conn;
  try {
    conn = await connectAsync(snowflake, buildSnowflakeConnectOptions(resolved));
    if (cfg.warehouse) {
      await execAsync(conn, { sqlText: `USE WAREHOUSE ${safeIdentifier(cfg.warehouse, '')}` });
    }
    if (cfg.database) {
      await execAsync(conn, { sqlText: `USE DATABASE ${safeIdentifier(cfg.database, '')}` });
    }
    if (cfg.schema) {
      await execAsync(conn, { sqlText: `USE SCHEMA ${safeIdentifier(cfg.schema, '')}` });
    }

    const execute = (sqlText, binds) => execAsync(conn, { sqlText, binds });
    await prepareSeedTables(execute, cfg, industry);
    const startIndex = await getNextSeedCrmIndex(execute, cfg, [industry]);
    const records = [];
    const profiles = [];
    for (let i = 0; i < count; i += 1) {
      const reserved = await prefsStore.reserveNextEmail(labUser, sandbox);
      const idx = startIndex + i;
      const email = reserved.scaledEmail;
      const ecid = generateEcid();
      const crmId = `CRM${idx}`;
      const recipient = createRecipient({ industry, crmId, ecid, email, index: idx });
      const generated = schema.generateRow({
        idx,
        email,
        ecid,
        crmId,
        recipient,
        attributes: {},
        testProfile: true,
        runStamp,
      });
      const record = buildSeedRecord(industry, generated.rowObject, {
        index: i, asOfDate: runStamp.slice(0, 10), runStamp,
      });
      records.push(record);
      profiles.push({
        crmId,
        ecid,
        email,
        phoneNumber: generated.rowObject.PHONENUMBER || generated.rowObject.PRIMARYPHONE || null,
        loyaltyId: generated.rowObject.LOYALTYID || null,
        recipientId: record.parent.RECIPIENT_ID,
        columns: record.profile,
      });
    }

    const tableRowcounts = await writeSeedRecords(execute, cfg, industry, records, batchSize);

    return {
      ok: true,
      sandbox,
      industry,
      table: fqTable,
      tableName: config.table,
      rowcount: records.length,
      recipientRowcount: records.length,
      recipientTable: qualifiedRecipientTable(cfg.database, cfg.schema),
      tableRowcounts,
      relationalRefresh: industry === 'travel' ? 'immediate' : 'dynamic tables refresh asynchronously (target lag: 1 minute)',
      batchSize,
      startIndex,
      runStamp,
      profiles,
      sample: profiles.slice(0, SAMPLE_SIZE).map((profile) => profile.columns),
    };
  } catch (err) {
    const described = describeConnectError(err);
    const message = String(err && err.message || '');
    if (/does not exist|not authorized|insufficient privileges/i.test(message)) {
      described.code = 'INDUSTRY_TABLE_NOT_READY';
      described.hints = [
        'Check that the saved role can inspect, read, and alter the shared base and selected industry tables, create REL views/tables/dynamic tables, and use the configured warehouse.',
      ];
    }
    return { ok: false, error: described };
  } finally {
    if (conn) await destroyAsync(conn);
  }
}

/**
 * Resolve INSERT mapper + column list for dual-load target table.
 * @param {string} tableName
 */
function resolveDualLoadInsertSchema(tableName, industry) {
  const normalized = String(tableName || '').trim().toUpperCase();
  const industryConfig = industry ? getIndustryProfileConfig(industry) : null;
  const tableConfig = getIndustryProfileConfigByTable(normalized);
  const config = tableConfig || (!normalized ? industryConfig : null);
  if (config && config.industry === 'travel') {
    return {
      schemaKey: 'AGENTIC_TRAVEL_PROFILE_CUSTOMER',
      columns: TRAVEL_COLUMNS,
      mapRow: mapAepAttributesToTravelProfileRow,
      generateRow: generateTravelProfileRow,
      defaultMode: 'crm_generate',
      skipCreateTable: true,
      industry: 'travel',
    };
  }
  if (config) {
    return {
      schemaKey: config.table,
      columns: config.columns,
      generateRow: (input) => generateIndustryProfileRow(config.industry, input),
      defaultMode: 'crm_generate',
      skipCreateTable: true,
      industry: config.industry,
    };
  }
  return {
    schemaKey: 'BASE_PROFILES',
    columns: COLUMNS,
    mapRow: mapAepAttributesToBaseProfileRow,
    defaultMode: 'mirror',
    skipCreateTable: false,
    industry: null,
  };
}

/**
 * Resolve dual-load insert mode for target table.
 * @param {string} schemaKey
 * @param {string | undefined} requested
 */
function resolveDualLoadMode(schemaKey, requested) {
  const normalized = String(requested || '').trim().toLowerCase();
  if (normalized === 'mirror' || normalized === 'crm_generate') return normalized;
  if (getIndustryProfileConfigByTable(schemaKey)) return 'crm_generate';
  return 'mirror';
}

/**
 * INSERT one profile row mapped from AEP generate output (dual-load).
 *
 * @param {{ labUser: string, sandbox: string, email: string, ecid: string, attributes?: object, industry?: string, table?: string, mode?: 'crm_generate'|'mirror' }} input
 */
async function handleInsertProfileFromAep(input) {
  const labUser = String(input.labUser || '').trim();
  const sandbox = String(input.sandbox || '').trim();
  const email = String(input.email || '').trim();
  const ecid = String(input.ecid || '').trim();
  if (!sandbox) throw new Error('sandbox is required');
  if (!email) throw new Error('email is required');
  if (!ecid) throw new Error('ecid is required');

  const requestedIndustry = String(input.industry || 'travel').trim().toLowerCase();
  const industryConfig = getIndustryProfileConfig(requestedIndustry);
  if (!industryConfig) {
    throw new Error(
      `Unsupported Snowflake CRM industry "${requestedIndustry}". Expected: ${listSnowflakeProfileIndustries().join(', ')}`,
    );
  }
  const tableName = safeIdentifier(input.table || industryConfig.table, industryConfig.table);
  const knownTableConfig = getIndustryProfileConfigByTable(tableName);
  if (knownTableConfig && knownTableConfig.industry !== industryConfig.industry) {
    throw new Error(
      `Snowflake table ${tableName} belongs to industry ${knownTableConfig.industry}, not ${industryConfig.industry}`,
    );
  }
  const insertSchema = resolveDualLoadInsertSchema(tableName, requestedIndustry);
  const {
    columns: insertColumns,
    mapRow,
    generateRow,
    skipCreateTable,
    schemaKey,
    defaultMode,
    industry,
  } = insertSchema;
  const mode = resolveDualLoadMode(schemaKey, input.mode || defaultMode);
  if (mode === 'mirror' && industry && industry !== 'travel') {
    throw new Error('mode "mirror" is only supported for the legacy travel mapper; use crm_generate');
  }
  const resolved = await store.resolveConnection(labUser, sandbox);
  if (!resolved) {
    return {
      ok: false,
      error: {
        message:
          'No Snowflake credential saved for this user/sandbox yet. Save the connection first.',
        code: 'NO_CREDENTIAL',
        sqlState: null,
        hints: [],
      },
    };
  }

  let snowflake;
  try {
    snowflake = require('snowflake-sdk');
  } catch (e) {
    return {
      ok: false,
      error: {
        message: 'snowflake-sdk is not installed in the Cloud Functions package.',
        code: 'SDK_MISSING',
        sqlState: null,
        hints: [],
      },
    };
  }

  const connectOpts = buildSnowflakeConnectOptions(resolved);
  const cfg = resolved.config;
  const fqTable = fullyQualified(cfg.database, cfg.schema, tableName);
  const runStamp = new Date().toISOString();
  let conn;
  try {
    conn = await connectAsync(snowflake, connectOpts);
    if (!skipCreateTable) {
      await execAsync(conn, { sqlText: `CREATE TABLE IF NOT EXISTS ${fqTable} (\n  ${COLUMN_DDL.join(',\n  ')}\n)` });
    }
    if (industry) await prepareRecipientStore(conn, cfg.database, fqTable, cfg.schema);
    const startIndex = industry
      ? await getNextSeedCrmIndex((sqlText, binds) => execAsync(conn, { sqlText, binds }), cfg, [industry])
      : await getNextCrmStartIndex(conn, fqTable);
    const crmId = `CRM${startIndex}`;

    const existing = await execAsync(conn, {
      sqlText: `SELECT ${insertColumns.join(', ')} FROM ${fqTable} WHERE ECID = ? LIMIT 1`,
      binds: [ecid],
    });
    if (existing.length > 0) {
      const existingProfile = Object.fromEntries(insertColumns.map((column, index) => [
        column,
        readSnowflakeCell(existing[0], index, column),
      ]));
      const existingCrmId = String(existingProfile.CRMID || '');
      const recipient = industry ? createRecipient({
        industry,
        crmId: existingCrmId,
        ecid,
        email: existingProfile.EMAIL || email,
        index: Number(existingCrmId.match(/(\d+)$/)?.[1] || startIndex),
      }) : null;
      if (recipient) await withSnowflakeTransaction(conn, async () => {
        await execAsync(conn, {
          sqlText: `UPDATE ${fqTable} SET RECIPIENT_ID = ?, PUSHTOKENS = PARSE_JSON(?) WHERE ECID = ?`,
          binds: [recipient.recipientId, JSON.stringify(recipient.pushTokens), ecid],
        });
        await mergeRecipientRows(
          (sqlText, binds) => execAsync(conn, { sqlText, binds }),
          cfg.database,
          [recipientRow(
            recipient,
            existingProfile,
            runStamp,
            existingProfile.TESTPROFILE !== false,
          )],
          cfg.schema,
        );
      });
      return {
        ok: true,
        table: fqTable,
        crmId: existingCrmId,
        ...(recipient ? { recipientId: recipient.recipientId } : {}),
        ecid,
        email,
        idempotent: true,
        schemaKey,
        industry,
        mode,
        columnsWritten: insertColumns.length,
      };
    }

    const normalizedAttrs = normalizeAepAttributesForSnowflake(input.attributes);
    const testProfileAttr = getAttr(normalizedAttrs, 'testProfile');
    const testProfile = testProfileAttr === false || testProfileAttr === 'false' ? false : true;
    const recipient = industry ? createRecipient({ industry, crmId, ecid, email, index: startIndex }) : null;
    const generated = mode === 'crm_generate' && typeof generateRow === 'function'
      ? generateRow({
        idx: startIndex,
        email,
        ecid,
        crmId,
        recipient,
        attributes: normalizedAttrs,
        firstName: String(
          getAttr(normalizedAttrs, 'person.name.firstName') || getAttr(normalizedAttrs, 'firstName') || '',
        ).trim() || undefined,
        lastName: String(
          getAttr(normalizedAttrs, 'person.name.lastName') || getAttr(normalizedAttrs, 'lastName') || '',
        ).trim() || undefined,
        testProfile,
        runStamp,
      })
      : mapRow({
        email,
        ecid,
        crmId,
        recipient,
        attributes: normalizedAttrs,
        runStamp,
      });
    const rowObject = {
      ...generated.rowObject,
      ...(recipient ? { RECIPIENT_ID: recipient.recipientId, PUSHTOKENS: recipient.pushTokens } : {}),
    };
    const profileRow = {
      ...generated,
      rowObject,
      row: insertColumns.map((column) => rowObject[column] ?? null),
    };

    const placeholders = insertColumns.map(() => '?').join(', ');
    await withSnowflakeTransaction(conn, async () => {
      await execAsync(conn, {
        sqlText: `INSERT INTO ${fqTable} (${insertColumns.join(', ')}) VALUES (${placeholders})`,
        binds: profileRow.row,
      });
      if (recipient) await mergeRecipientRows(
        (sqlText, binds) => execAsync(conn, { sqlText, binds }),
        cfg.database,
        [recipientRow(recipient, rowObject, runStamp, testProfile)],
        cfg.schema,
      );
    });

    return {
      ok: true,
      table: fqTable,
      crmId,
      ecid,
      email,
      idempotent: false,
      schemaKey,
      industry,
      mode,
      columnsWritten: insertColumns.length,
      sample: profileRow.rowObject,
    };
  } catch (err) {
    return { ok: false, error: describeConnectError(err) };
  } finally {
    if (conn) await destroyAsync(conn);
  }
}

module.exports = {
  COLUMNS,
  COLUMN_DDL,
  DEFAULT_TABLE,
  DUAL_LOAD_DEFAULT_TABLE,
  DEFAULT_COUNT,
  MAX_COUNT,
  generateBaseProfileRow,
  generateAgenticEmail,
  generateEcid,
  formatDdMmYyyy,
  rowToObject,
  safeIdentifier,
  fullyQualified,
  getNextCrmStartIndex,
  handleGenerateBaseProfiles,
  handleGenerateIndustryProfiles,
  handleInsertProfileFromAep,
  resolveDualLoadInsertSchema,
  resolveDualLoadMode,
};
