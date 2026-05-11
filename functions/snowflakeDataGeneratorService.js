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
 *     (fixed name pools, UK-style addresses, `adamp.adobedemo+DDMMYYYY+N@gmail.com` emails,
 *     daily email counter + next CRM index read from Snowflake when not overridden).
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
const { buildSnowflakeConnectOptions, describeConnectError } = require('./snowflakeService');

const DEFAULT_TABLE = 'BASE_PROFILES';
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

const COLUMNS = [
  'CRMID', 'ECID', 'EMAIL', 'EMAILIDSHA256', 'GAID', 'LOYALTYID', 'PASSPORTID',
  'PHONENUMBER', 'PUSHTOKENS', 'STACKCHATID',
  'FIRSTNAME', 'LASTNAME', 'BIRTHDATE', 'GENDER',
  'HOMEADDRESS_STREET1', 'HOMEADDRESS_CITY', 'HOMEADDRESS_STATEPROVINCE',
  'HOMEADDRESS_POSTALCODE', 'HOMEADDRESS_COUNTRY',
  'PERSONALEMAIL_ADDRESS', 'PERSONALEMAIL_LABEL', 'PERSONALEMAIL_PRIMARY',
  'PERSONALEMAIL_STATUS', 'PERSONALEMAIL_STATUSREASON', 'PERSONALEMAIL_TYPE',
  'MOBILEPHONE_NUMBER', 'MOBILEPHONE_STATUS', 'MOBILEPHONE_PRIMARY',
  'TESTPROFILE',
  '_RECORDCREATEDTIMESTAMP', '_RECORDUPDATEDTIMESTAMP',
  'PERSON_NAME_COURTESYTITLE', 'PERSON_NAME_SUFFIX', 'PERSON_NAME_FULLNAME',
  'PERSON_BIRTHDAY', 'PERSON_BIRTHMONTH', 'PERSON_BIRTHYEAR',
  'PERSON_BIRTHDAYANDMONTH',
];

const COLUMN_DDL = [
  'CRMID VARCHAR(64)', 'ECID VARCHAR(64)', 'EMAIL VARCHAR(320)',
  'EMAILIDSHA256 VARCHAR(128)', 'GAID VARCHAR(128)', 'LOYALTYID VARCHAR(64)',
  'PASSPORTID VARCHAR(64)', 'PHONENUMBER VARCHAR(40)', 'PUSHTOKENS ARRAY',
  'STACKCHATID VARCHAR(64)',
  'FIRSTNAME VARCHAR(100)', 'LASTNAME VARCHAR(100)',
  'BIRTHDATE VARCHAR(10)', 'GENDER VARCHAR(16)',
  'HOMEADDRESS_STREET1 VARCHAR(200)', 'HOMEADDRESS_CITY VARCHAR(100)',
  'HOMEADDRESS_STATEPROVINCE VARCHAR(100)', 'HOMEADDRESS_POSTALCODE VARCHAR(20)',
  'HOMEADDRESS_COUNTRY VARCHAR(100)',
  'PERSONALEMAIL_ADDRESS VARCHAR(320)', 'PERSONALEMAIL_LABEL VARCHAR(40)',
  'PERSONALEMAIL_PRIMARY BOOLEAN', 'PERSONALEMAIL_STATUS VARCHAR(40)',
  'PERSONALEMAIL_STATUSREASON VARCHAR(80)', 'PERSONALEMAIL_TYPE VARCHAR(40)',
  'MOBILEPHONE_NUMBER VARCHAR(40)', 'MOBILEPHONE_STATUS VARCHAR(40)',
  'MOBILEPHONE_PRIMARY BOOLEAN',
  'TESTPROFILE BOOLEAN',
  '_RECORDCREATEDTIMESTAMP VARCHAR(40)', '_RECORDUPDATEDTIMESTAMP VARCHAR(40)',
  'PERSON_NAME_COURTESYTITLE VARCHAR(40)', 'PERSON_NAME_SUFFIX VARCHAR(40)',
  'PERSON_NAME_FULLNAME VARCHAR(200)',
  'PERSON_BIRTHDAY NUMBER(2,0)', 'PERSON_BIRTHMONTH NUMBER(2,0)',
  'PERSON_BIRTHYEAR NUMBER(4,0)', 'PERSON_BIRTHDAYANDMONTH VARCHAR(5)',
];

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
 * @param {number} emailCounter — daily email sequence (see `getDailyEmailCounterFromTable`).
 */
function generateBaseProfileRow(idx, runStamp, emailCounter = 1) {
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

  const email = generateAgenticEmail(emailCounter);
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
      const email = row[0];
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
    const mx = rows[0] && rows[0][0];
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
 * @param {{ labUser: string, sandbox: string, count?: number, table?: string, batchSize?: number, startIndex?: number }} input
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

    const emailStartCounter = await getDailyEmailCounterFromTable(conn, fqTable);

    const rows = [];
    for (let i = 0; i < count; i++) {
      rows.push(
        generateBaseProfileRow(startIndex + i, runStamp, emailStartCounter + i)
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
      emailEndCounter: emailStartCounter + count - 1,
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

module.exports = {
  COLUMNS,
  COLUMN_DDL,
  DEFAULT_TABLE,
  DEFAULT_COUNT,
  MAX_COUNT,
  generateBaseProfileRow,
  generateAgenticEmail,
  formatDdMmYyyy,
  rowToObject,
  safeIdentifier,
  fullyQualified,
  handleGenerateBaseProfiles,
};
