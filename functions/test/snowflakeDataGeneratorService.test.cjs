'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { isCanonicalEcid } = require('../ecidGenerator');
const {
  generateBaseProfileRow,
  generateAgenticEmail,
  generateEcid,
  rowToObject,
  handleInsertProfileFromAep,
  handleGenerateIndustryProfiles,
  resolveDualLoadInsertSchema,
} = require('../snowflakeDataGeneratorService');
const { COLUMNS: TRAVEL_COLUMNS } = require('../snowflakeTravelProfileSchema');
const { scaleEmail } = require('../labProfileGenerationPrefsStore');

const TRAVEL_CREATED_IDX = TRAVEL_COLUMNS.indexOf('_RECORDCREATEDTIMESTAMP');
const TRAVEL_UPDATED_IDX = TRAVEL_COLUMNS.indexOf('_RECORDUPDATEDTIMESTAMP');

function serviceWithConnection(rowsForSql = () => [], { allocator = true, baseEmail = 'demo@example.com' } = {}) {
  const calls = [];
  let destroyed = false;
  let emailCounter = 0;
  let crmSequence = 1000;
  const connection = {
    connect(callback) { callback(null); },
    destroy(callback) { destroyed = true; callback(); },
    execute(options) {
      calls.push(options);
      try {
        const rows = rowsForSql(options.sqlText);
        if (options.sqlText.startsWith('SELECT "INCREMENT"')) options.complete(null, null, allocator ? [{ INCREMENT: 1000 }] : []);
        else if (options.sqlText.endsWith('.NEXTVAL AS START_INDEX')) {
          options.complete(null, null, [{ START_INDEX: crmSequence }]);
          crmSequence += 1000;
        } else options.complete(null, null, rows);
      } catch (error) {
        options.complete(error);
      }
    },
  };
  const servicePath = require.resolve('../snowflakeDataGeneratorService');
  const originalRequire = createRequire(servicePath);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(servicePath, 'utf8'), {
    module, process, Buffer, console,
    require(id) {
      if (id === 'snowflake-sdk') return { createConnection: () => connection };
      if (id === './snowflakeConnectionStore') return {
        resolveConnection: async () => ({
          config: { database: 'DEMO_DB', schema: 'LAB', warehouse: 'DEMO_WH', authMethod: 'password' },
          credential: 'offline-test-only',
        }),
      };
      if (id === './labProfileGenerationPrefsStore') return {
        getPrefs: async () => ({ baseEmail }),
        isValidEmail: (email) => !!email,
        reserveNextEmail: async () => ({ scaledEmail: `demo+${++emailCounter}@example.com` }),
        reserveEmails: async (_uid, _sandbox, count, options) => {
          assert.equal(options.expectedBaseEmail, baseEmail);
          const first = emailCounter + 1;
          const emails = Array.from({ length: count }, () => ({
            scaledEmail: `demo+${++emailCounter}@example.com`, counterN: emailCounter,
          }));
          return { emails, baseEmail, counterN: first, nextCounterN: emailCounter + 1, counterDate: '20261016' };
        },
      };
      return originalRequire(id);
    },
  }, { filename: servicePath });
  return { service: module.exports, calls, isDestroyed: () => destroyed, reservedEmailCount: () => emailCounter };
}

describe('Snowflake seed API offline integration', () => {
  it('rejects missing or stale email preferences before connecting or reserving IDs', async () => {
    for (const baseEmail of ['', 'new@example.com']) {
      const fixture = serviceWithConnection(undefined, { baseEmail });
      const result = await fixture.service.handleGenerateIndustryProfiles({
        labUser: 'offline-user', sandbox: 'test', industry: 'retail', count: 2,
        expectedBaseEmail: 'old@example.com',
      });
      assert.equal(result.ok, false);
      assert.match(result.error.code, /EMAIL_PREFS_/);
      assert.equal(fixture.calls.length, 0);
      assert.equal(fixture.reservedEmailCount(), 0);
    }
  });

  it('requires the migrated sequence before reserving emails or writing any profile data', async () => {
    const fixture = serviceWithConnection(undefined, { allocator: false });
    const result = await fixture.service.handleGenerateIndustryProfiles({
      labUser: 'offline-user', sandbox: 'test', industry: 'retail', count: 2,
    });
    assert.equal(result.ok, false);
    assert.match(result.error.message, /allocator.*migration|CRM sequence migration/);
    assert.equal(fixture.reservedEmailCount(), 0);
    assert.equal(fixture.calls.some(({ sqlText }) => /^MERGE|^BEGIN/.test(sqlText)), false);
    assert.equal(fixture.isDestroyed(), true);
  });

  it('API seeding and AEP dual-load consume the same physical-target sequence', async () => {
    const fixture = serviceWithConnection();
    const seeded = await fixture.service.handleGenerateIndustryProfiles({
      labUser: 'offline-user', sandbox: 'test', industry: 'retail', count: 2,
    });
    const dual = await fixture.service.handleInsertProfileFromAep({
      labUser: 'offline-user', sandbox: 'test', industry: 'fsi',
      email: 'aep@example.com', ecid: '12345678901234567890123456789012345678', attributes: {},
    });
    assert.equal(seeded.ok, true);
    assert.equal(dual.ok, true, JSON.stringify(dual.error));
    const allocations = fixture.calls.filter(({ sqlText }) => sqlText.endsWith('.NEXTVAL AS START_INDEX'));
    assert.equal(allocations.length, 2);
    assert.equal(allocations[0].sqlText, allocations[1].sqlText);
    assert.match(allocations[0].sqlText, /DEMO_DB.LAB.AEP_LAB_RECIPIENT_CRM_SEQUENCE/);
    assert.notEqual(dual.crmId, seeded.profiles[0].crmId);
  });

  it('runs the page endpoint through parent and child writes for all six industries', async () => {
    for (const industry of ['travel', 'fsi', 'retail', 'telecom', 'media', 'sports']) {
      const fixture = serviceWithConnection();
      const result = await fixture.service.handleGenerateIndustryProfiles({
        labUser: 'offline-user', sandbox: 'test', industry, count: 2,
      });
      assert.equal(result.ok, true, JSON.stringify(result.error));
      assert.equal(result.recipientRowcount, 2);
      assert.equal(result.tableRowcounts[result.recipientTable], 2);
      assert.ok(Object.keys(result.tableRowcounts).length > 2);
      assert.equal(result.profiles[0].recipientId, result.profiles[0].columns.RECIPIENT_ID);
      assert.equal(result.emailAllocation.nextCounterN, 3);
      assert.equal(result.profiles[1].emailCounterN, 2);
      assert.equal(fixture.reservedEmailCount(), 2);
      assert.equal(fixture.calls.at(-1).sqlText, 'COMMIT');
      assert.equal(fixture.isDestroyed(), true);
    }
  });

  it('returns failure and rolls back the parent when a source write fails', async () => {
    const fixture = serviceWithConnection((sql) => {
      if (sql.startsWith('MERGE INTO') && sql.includes('AGENTIC_RETAIL_PROFILE_CUSTOMER target')) {
        throw new Error('injected source write failure');
      }
      return [];
    });
    const result = await fixture.service.handleGenerateIndustryProfiles({
      labUser: 'offline-user', sandbox: 'test', industry: 'retail', count: 1,
    });
    assert.equal(result.ok, false);
    assert.match(result.error.message, /injected source write failure/);
    assert.ok(result.error.hints.some((hint) => /reserved.*not be reused/.test(hint)));
    assert.equal(fixture.calls.at(-1).sqlText, 'ROLLBACK');
    assert.equal(fixture.isDestroyed(), true);
  });

  it('keeps legacy/custom base dual-load targets independent of the shared parent', async () => {
    for (const table of ['BASE_PROFILES', 'CUSTOM_BASE']) {
      const fixture = serviceWithConnection();
      const result = await fixture.service.handleInsertProfileFromAep({
        labUser: 'offline-user', sandbox: 'test', table,
        email: 'demo@example.com', ecid: '123', attributes: {},
      });
      assert.equal(result.ok, true, JSON.stringify(result.error));
      assert.equal(result.schemaKey, 'BASE_PROFILES');
      assert.equal(result.columnsWritten, 38);
      assert.ok(fixture.calls[0].sqlText.startsWith(`CREATE TABLE IF NOT EXISTS DEMO_DB.LAB.${table}`));
      assert.equal(fixture.calls.some(({ sqlText }) => sqlText.includes('REL.RECIPIENT')), false);
      assert.equal(fixture.calls.some(({ sqlText }) => sqlText.includes('RECIPIENT_ID')), false);
      assert.equal(fixture.isDestroyed(), true);
    }
  });
});

describe('snowflakeDataGeneratorService email alignment', () => {
  it('generateBaseProfileRow uses emailOverride for EMAIL columns', () => {
    const scaled = scaleEmail('adamp.adobedemo@gmail.com', 1, new Date('2026-07-22T12:00:00Z'));
    const row = generateBaseProfileRow(1001, '2026-07-22T12:00:00.000Z', 99, scaled);
    const obj = rowToObject(row);
    assert.equal(obj.EMAIL, scaled);
    assert.equal(obj.PERSONALEMAIL_ADDRESS, scaled);
    assert.equal(scaled, 'adamp.adobedemo+22072026-1@gmail.com');
  });

  it('legacy generateAgenticEmail keeps Agentic plus-plus scheme', () => {
    const legacy = generateAgenticEmail(3);
    assert.match(legacy, /^adamp\.adobedemo\+\d{8}\+3@gmail\.com$/);
  });

  it('generateEcid returns a canonical Edge-acceptable 38-digit AEP identity', () => {
    const ecid = generateEcid();
    assert.match(ecid, /^\d{38}$/);
    assert.ok(isCanonicalEcid(ecid), `expected a canonical ECID, got ${ecid}`);
  });

  it('dual_load path email override matches generation prefs hyphen format', () => {
    const prefsEmail = 'apalmer+22072026-5@adobetest.com';
    const row = generateBaseProfileRow(2000, '2026-07-22T12:00:00.000Z', 1, prefsEmail);
    const obj = rowToObject(row);
    assert.equal(obj.EMAIL, prefsEmail);
    assert.match(obj.EMAIL, /\+\d{8}-\d+@/);
  });

  it('resolveDualLoadInsertSchema uses travel mapper for AGENTIC_TRAVEL_PROFILE_CUSTOMER', () => {
    const travel = resolveDualLoadInsertSchema('AGENTIC_TRAVEL_PROFILE_CUSTOMER');
    assert.equal(travel.schemaKey, 'AGENTIC_TRAVEL_PROFILE_CUSTOMER');
    assert.equal(travel.defaultMode, 'crm_generate');
    assert.equal(typeof travel.generateRow, 'function');
    assert.equal(travel.skipCreateTable, true);
    assert.ok(travel.columns.includes('DATEOFBIRTH'));
    assert.ok(!travel.columns.includes('BIRTHDATE'));

    const legacy = resolveDualLoadInsertSchema('BASE_PROFILES');
    assert.equal(legacy.schemaKey, 'BASE_PROFILES');
    assert.equal(legacy.skipCreateTable, false);
    assert.ok(legacy.columns.includes('BIRTHDATE'));
    for (const table of ['BASE_PROFILES', 'CUSTOM_BASE']) {
      const withIndustry = resolveDualLoadInsertSchema(table, 'travel');
      assert.equal(withIndustry.schemaKey, 'BASE_PROFILES');
      assert.equal(withIndustry.industry, null);
      assert.equal(withIndustry.skipCreateTable, false);
    }
  });

  it('resolveDualLoadInsertSchema routes every new industry table to crm_generate', () => {
    for (const industry of ['fsi', 'retail', 'telecom', 'media', 'sports']) {
      const schema = resolveDualLoadInsertSchema('', industry);
      assert.equal(schema.industry, industry);
      assert.equal(schema.defaultMode, 'crm_generate');
      assert.equal(typeof schema.generateRow, 'function');
      assert.ok(schema.columns.includes('LIFETIMEVALUE'));
      assert.ok(schema.columns.length >= 39);
    }
  });

  it('rejects an industry/table mismatch before attempting a Snowflake connection', async () => {
    await assert.rejects(
      handleInsertProfileFromAep({
        labUser: 'test-user',
        sandbox: 'test',
        industry: 'fsi',
        table: 'AGENTIC_RETAIL_PROFILE_CUSTOMER',
        email: 'test@example.com',
        ecid: '123',
      }),
      /belongs to industry retail, not fsi/,
    );
  });

  it('rejects an unsupported governed batch industry before connecting', async () => {
    await assert.rejects(
      handleGenerateIndustryProfiles({
        labUser: 'test-user',
        sandbox: 'test',
        industry: 'public',
        count: 1,
      }),
      /Unsupported Snowflake CRM industry "public"/,
    );
  });

  it('dual-load insert mapping writes Python-runner timestamps into travel row binds', () => {
    const { mapRow } = resolveDualLoadInsertSchema('AGENTIC_TRAVEL_PROFILE_CUSTOMER');
    const runStamp = '2026-07-22T21:49:38.000Z';
    const expectedStamp = '2026-07-22 21:49:38.000';
    const { row, rowObject } = mapRow({
      email: 'apalmer+22072026-1@adobetest.com',
      ecid: '00000000000000000000000000000001',
      crmId: 'CRM1001',
      attributes: {},
      runStamp,
    });

    assert.equal(rowObject._RECORDCREATEDTIMESTAMP, expectedStamp);
    assert.equal(rowObject._RECORDUPDATEDTIMESTAMP, expectedStamp);
    assert.equal(row[TRAVEL_CREATED_IDX], expectedStamp);
    assert.equal(row[TRAVEL_UPDATED_IDX], expectedStamp);
  });

  it('dual-load travel mapper binds persona fields from nested AEP attributes', () => {
    const { mapRow } = resolveDualLoadInsertSchema('AGENTIC_TRAVEL_PROFILE_CUSTOMER');
    const { rowObject } = mapRow({
      email: 'apalmer+22072026-2@adobetest.com',
      ecid: '40000000000000000000000000000003',
      crmId: 'CRM1003',
      attributes: {
        person: {
          name: { firstName: 'Alex', lastName: 'Traveler' },
          gender: 'female',
          birthDate: '1990-05-15',
        },
        mobilePhone: { number: '+447425627462' },
        testProfile: true,
      },
      runStamp: '2026-07-22T22:00:00.000Z',
    });

    assert.equal(rowObject.FIRSTNAME, 'Alex');
    assert.equal(rowObject.LASTNAME, 'Traveler');
    assert.equal(rowObject.EMAIL, 'apalmer+22072026-2@adobetest.com');
    assert.equal(rowObject.ECID, '40000000000000000000000000000003');
    assert.equal(rowObject.DATEOFBIRTH, '1990-05-15');
    assert.equal(rowObject.PRIMARYEMAIL, 'apalmer+22072026-2@adobetest.com');
    assert.equal(rowObject.LIFETIMEVALUE, 0);
  });
});
