'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { buildInsertSql, insertRows } = require('../snowflakeIndustryEventService');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { generateIndustryProfileRow } = require('../snowflakeIndustryProfileGenerator');
const { generateIndustryEventRows } = require('../snowflakeIndustryEventGenerator');
const { buildSeedRecord, writeSeedRecords } = require('../snowflakeSeedStore');
const { listIndustryEventTables } = require('../snowflakeIndustryEventRegistry');
const { snowflakeMemoryFixture } = require('./snowflakeMemoryFixture.cjs');

const CFG = { database: 'DB', schema: 'AEP_SCHEMA', warehouse: 'WH' };
const STAMP = '2026-10-15T12:00:00Z';
function enrichService(db) {
  const filename = require.resolve('../snowflakeIndustryEventService');
  const originalRequire = createRequire(filename);
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, Buffer, console,
    require(id) {
      return id === './snowflakeIndustryCatalogService'
        ? { withSnowflakeConnection: async (_user, _sandbox, work) => work(db.connection, CFG) }
        : originalRequire(id);
    },
  }, { filename });
  return module.exports;
}

describe('Snowflake industry event inserts', () => {
  it('uses SELECT for ARRAY expressions because Snowflake rejects them in VALUES', () => {
    const sql = buildInsertSql(
      'TRAVEL_DATABASE.AEP_SCHEMA.EVENTS',
      {
        columns: ['EVENTID', 'ITEMS'],
        arrayColumns: ['ITEMS'],
      },
      2,
    );

    assert.equal(
      sql,
      'INSERT INTO TRAVEL_DATABASE.AEP_SCHEMA.EVENTS (EVENTID, ITEMS) ' +
        'SELECT ?, PARSE_JSON(?)::ARRAY UNION ALL SELECT ?, PARSE_JSON(?)::ARRAY',
    );
    assert.doesNotMatch(sql, /\bVALUES\b/);
  });

  function bundleFixture(industry = 'telecom') {
    const calls = [];
    const tables = new Map(listIndustryEventTables(industry).map((table) => [table.table, []]));
    const profile = { ECID: 'offline-ecid', EMAIL: 'offline@example.test', CRMID: 'CRM1' };
    const connection = { execute(options) {
      calls.push(options);
      try {
        const { sqlText: sql, binds } = options;
        assert.deepEqual(Array.from(binds), [profile.ECID]);
        let result;
        if (sql.endsWith('LIMIT 1')) result = [profile];
        else {
          const table = sql.match(/FROM DB\.AEP_SCHEMA\.(\w+) WHERE ECID = \?/)[1];
          const stored = tables.get(table);
          assert.ok(stored, 'must only read a registered table');
          if (sql.startsWith('SELECT COUNT(*)')) result = [{ ROW_COUNT: String(stored.length) }];
          else {
            const [, orderBy, limit, offset] = sql.match(/ORDER BY (.+) LIMIT (\d+) OFFSET (\d+)$/);
            const columns = orderBy.split(', ').map((expression) => {
              assert.match(expression, / DESC NULLS LAST$/);
              return expression.replace(/ DESC NULLS LAST$/, '').replace(/^TO_JSON\((.+)\)$/, '$1');
            });
            const sorted = [...stored].sort((left, right) => {
              for (const column of columns) {
                const a = Array.isArray(left[column]) ? JSON.stringify(left[column]) : left[column];
                const b = Array.isArray(right[column]) ? JSON.stringify(right[column]) : right[column];
                if (a === b) continue;
                if (a == null) return 1;
                if (b == null) return -1;
                return a < b ? 1 : -1;
              }
              return 0;
            });
            result = sorted.slice(Number(offset), Number(offset) + Number(limit));
          }
        }
        options.complete(null, null, result);
      } catch (error) { options.complete(error); }
    } };
    return { tables, calls, service: enrichService({ connection }) };
  }

  describe('Snowflake non-travel profile bundle pagination', () => {
    const base = { labUser: 'offline', sandbox: 'test', industry: 'telecom', ecid: 'offline-ecid' };

    it('accepts every registered non-travel key without reading unrelated tables', async () => {
      for (const industry of ['fsi', 'retail', 'telecom', 'media', 'sports']) {
        for (const table of listIndustryEventTables(industry)) {
          const db = bundleFixture(industry);
          const result = await db.service.handleIndustryProfileBundle({ ...base, industry, tableKey: table.key });
          assert.deepEqual(Object.keys(result.tables), [table.key]);
          assert.equal(result.tables[table.key].totalCount, 0);
          assert.equal(db.calls.length, 3, 'profile, independent count, bounded page');
        }
      }
    });

    it('surfaces stored-count and page SQL failures instead of successful empty rows', async () => {
      for (const failOn of ['SELECT COUNT(*)', 'ORDER BY']) {
        const service = enrichService({ connection: { execute(options) {
          if (options.sqlText.includes(failOn)) options.complete(new Error('offline query rejected'));
          else options.complete(null, null, options.sqlText.endsWith('LIMIT 1')
            ? [{ ECID: base.ecid }] : [{ ROW_COUNT: 1 }]);
        } } });
        await assert.rejects(service.handleIndustryProfileBundle({ ...base, tableKey: 'usage' }), /offline query rejected/);
      }
    });

    it('rejects an inconsistent empty page after deletion instead of returning a nonadvancing continuation', async () => {
      for (const eventOffset of [0, 10]) {
        const service = enrichService({ connection: { execute(options) {
          options.complete(null, null, options.sqlText.endsWith('LIMIT 1')
            ? [{ ECID: base.ecid }]
            : options.sqlText.startsWith('SELECT COUNT(*)')
              ? [{ ROW_COUNT: 125 }]
              : []);
        } } });
        await assert.rejects(
          service.handleIndustryProfileBundle({ ...base, tableKey: 'usage', eventOffset }),
          /Stored row count and empty page are inconsistent for usage;.*Restart pagination/,
        );
      }
    });

    it('reads 125 tied-timestamp rows in bounded deterministic first/last pages with independent totals', async () => {
      const db = bundleFixture();
      const stored = db.tables.get('AGENTIC_TELECOM_EVENT_USAGE');
      for (let index = 0; index < 125; index++) stored.push({
        ECID: base.ecid, EVENTID: String(index).padStart(3, '0'), GENERATIONID: 'g',
        _RECORDCREATEDTIMESTAMP: STAMP,
      });
      const seen = [];
      let offset = 0;
      do {
        const result = await db.service.handleIndustryProfileBundle({ ...base, tableKey: 'usage', eventLimit: 10, eventOffset: offset });
        assert.deepEqual(Object.keys(result.tables), ['usage']);
        const page = result.tables.usage;
        assert.equal(page.totalCount, 125);
        assert.equal(page.count, offset === 120 ? 5 : 10);
        assert.equal(result.totalReturnedRows, page.count);
        assert.equal(result.eventOffset, offset);
        assert.equal(page.offset, offset);
        assert.equal(page.hasMore, offset < 120);
        assert.equal(page.nextOffset, offset < 120 ? offset + 10 : null);
        seen.push(...page.rows.map((row) => row.EVENTID));
        if (!page.hasMore) break;
        offset = page.nextOffset;
        stored.reverse(); // Physical insertion order must not decide timestamp ties.
      } while (true);
      assert.deepEqual(seen, Array.from({ length: 125 }, (_, index) => String(124 - index).padStart(3, '0')));
      assert.ok(db.calls.every(({ sqlText }) => /^SELECT /.test(sqlText)), 'read-only SQL');
      assert.ok(db.calls.some(({ sqlText }) => /ORDER BY _RECORDCREATEDTIMESTAMP DESC NULLS LAST, EVENTID DESC NULLS LAST, GENERATIONID/.test(sqlText)));
      const beyond = await db.service.handleIndustryProfileBundle({ ...base, tableKey: 'usage', eventOffset: 125 });
      assert.equal(beyond.tables.usage.totalCount, 125);
      assert.equal(beyond.tables.usage.count, 0);
      assert.equal(beyond.tables.usage.hasMore, false);
      assert.equal(beyond.tables.usage.nextOffset, null);
    });

    it('keeps legacy all-table defaults and 1–100 limit clamping, including empty tables', async () => {
      const db = bundleFixture();
      db.tables.get('AGENTIC_TELECOM_EVENT_USAGE').push(...Array.from({ length: 125 }, (_, index) => ({
        ECID: base.ecid, EVENTID: String(index), _RECORDCREATEDTIMESTAMP: STAMP,
      })));
      for (const [input, expected] of [[{}, 25], [{ eventLimit: 1000 }, 100], [{ eventLimit: -1 }, 1], [{ event_limit: 3.9 }, 3]]) {
        const result = await db.service.handleIndustryProfileBundle({ ...base, ...input });
        assert.equal(Object.keys(result.tables).length, 5);
        assert.equal(result.eventLimit, expected);
        assert.equal(result.tables.usage.count, expected);
        assert.equal(result.tables.usage.totalCount, 125);
        assert.equal(result.tables.usage.nextOffset, expected);
        const empty = result.tables.billing;
        assert.equal(empty.count, 0);
        assert.equal(empty.totalCount, 0);
        assert.equal(empty.hasMore, false);
        assert.equal(empty.nextOffset, null);
      }
    });

    it('uses all enrichment values to break tied snapshot timestamps and generation IDs', async () => {
      const db = bundleFixture();
      db.tables.get('AGENTIC_TELECOM_PROFILE_DEVICES').push(
        { ECID: base.ecid, GENERATIONID: 'same', _RECORDCREATEDTIMESTAMP: STAMP, DEVICE_MODEL: 'A' },
        { ECID: base.ecid, GENERATIONID: 'same', _RECORDCREATEDTIMESTAMP: STAMP, DEVICE_MODEL: 'Z' },
      );
      const result = await db.service.handleIndustryProfileBundle({ ...base, table_key: 'devices', event_limit: 1, event_offset: 1 });
      assert.equal(result.tables.devices.rows[0].DEVICE_MODEL, 'A');
      assert.equal(result.tables.devices.totalCount, 2);
      assert.ok(db.calls.some(({ sqlText }) => /GENERATIONID DESC NULLS LAST.*DEVICE_MODEL DESC NULLS LAST/.test(sqlText)));
    });

    it('rejects invalid offsets/selectors and Travel before any connection or query', async () => {
      const db = bundleFixture();
      for (const eventOffset of [-1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '1', null, true, []]) {
        await assert.rejects(db.service.handleIndustryProfileBundle({ ...base, eventOffset }), /eventOffset must/);
        await assert.rejects(db.service.handleIndustryProfileBundle({ ...base, event_offset: eventOffset }), /eventOffset must/);
      }
      for (const tableKey of ['', 'Usage', 'watchlist', 'UNKNOWN', 'usage; DROP TABLE X', '__proto__', 'constructor', null, 1]) {
        await assert.rejects(db.service.handleIndustryProfileBundle({ ...base, tableKey }), /tableKey must/);
      }
      await assert.rejects(db.service.handleIndustryProfileBundle({ ...base, industry: 'travel' }), /separate travel/);
      assert.equal(db.calls.length, 0);
    });

    it('orders registered ARRAY columns by their JSON values rather than unsupported ARRAY ordering', async () => {
      const db = bundleFixture('retail');
      db.tables.get('AGENTIC_RETAIL_EVENT_ORDER').push(
        { ECID: base.ecid, EVENTID: 'same', GENERATIONID: 'same', _RECORDCREATEDTIMESTAMP: STAMP, ITEMS: ['A'] },
        { ECID: base.ecid, EVENTID: 'same', GENERATIONID: 'same', _RECORDCREATEDTIMESTAMP: STAMP, ITEMS: ['Z'] },
      );
      const result = await db.service.handleIndustryProfileBundle({ ...base, industry: 'retail', tableKey: 'order', eventLimit: 1 });
      assert.equal(result.tables.order.rows[0].ITEMS[0], 'Z');
      assert.ok(db.calls.some(({ sqlText }) => /TO_JSON\(ITEMS\) DESC NULLS LAST/.test(sqlText)));
    });

    it('preserves zero offset and rejects invalid snake-case selectors through the HTTP error envelope', async () => {
      const { registerSnowflakeRoutes } = require('../snowflakeRoutes');
      const db = bundleFixture();
      const handler = registerSnowflakeRoutes({
        onRequest: (_options, fn) => fn,
        setCors() {},
        resolveSandboxFromQuery: () => '',
        snowflakePrincipalAuth: { resolveSnowflakePrincipal: async () => ({ ok: true, uid: 'offline', keySandbox: 'test' }) },
        snowflakeIndustryEventService: db.service,
      }).snowflakeAgenticProfileBundle;
      for (const [params, status] of [
        [{ table_key: 'usage', event_offset: 0, event_limit: 2 }, 200],
        [{ tableKey: 'usage', eventOffset: 0, eventLimit: 2 }, 200],
        [{ table_key: 'not-registered' }, 400],
        [{ event_offset: -1 }, 400],
        [{ eventOffset: null }, 400],
        [{ industry: 'travel' }, 400],
      ]) {
        const res = { status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
        await handler({ method: 'POST', body: { ...base, ...params } }, res);
        assert.equal(res.code, status);
        assert.equal(res.body.ok, status === 200);
        if (status === 200) {
          assert.equal(res.body.result.eventOffset, 0);
          assert.deepEqual(Object.keys(res.body.result.tables), ['usage']);
        } else assert.equal(typeof res.body.error, 'string');
      }
    });
  });

  it('commits all chunks together so GENERATIONID retries cannot skip a partially written table', async () => {
    const calls = [];
    const conn = { execute(options) { calls.push(options); options.complete(null, null, []); } };
    const count = await insertRows(conn, 'COLLEAGUE_DB.LAB.EVENTS', {
      columns: ['GENERATIONID', 'ITEMS'], arrayColumns: ['ITEMS'],
    }, [{ GENERATIONID: 'g1', ITEMS: ['one'] }, { GENERATIONID: 'g1', ITEMS: ['two'] }], 1);
    assert.equal(count, 2);
    assert.deepEqual(calls.map(({ sqlText }) => sqlText.split(' ')[0]), ['BEGIN', 'INSERT', 'INSERT', 'COMMIT']);
    assert.deepEqual(calls[1].binds, ['g1', '["one"]']);
  });

  it('rolls back the first chunk when a later chunk fails, and surfaces the failure', async () => {
    const calls = [];
    const conn = {
      execute(options) {
        calls.push(options.sqlText);
        options.complete(calls.length === 3 ? new Error('second chunk rejected') : null, null, []);
      },
    };
    await assert.rejects(insertRows(conn, 'DB.LAB.EVENTS', {
      columns: ['GENERATIONID'], arrayColumns: [],
    }, [{ GENERATIONID: 'g1' }, { GENERATIONID: 'g1' }], 1), /second chunk rejected/);
    assert.equal(calls.at(-1), 'ROLLBACK');
    assert.ok(!calls.includes('COMMIT'));
  });

  it('does not open a transaction for intentionally empty activity', async () => {
    assert.equal(await insertRows({ execute() { assert.fail('no query expected'); } }, 'DB.LAB.EVENTS', {
      columns: [], arrayColumns: [],
    }, []), 0);
  });

  for (const industry of ['fsi', 'retail', 'telecom', 'media', 'sports']) {
    it(`${industry} seed, enrich and repeat preserve actual row identities and counts`, async () => {
      const db = snowflakeMemoryFixture();
      const profile = generateIndustryProfileRow(industry, {
        idx: 1000, ecid: '12345678901234567890123456789012345678', email: 'demo@example.com', runStamp: STAMP,
        attributes: { 'industrySports.fanFlags.betsRegularly': true },
      }).rowObject;
      const record = buildSeedRecord(industry, profile, { index: 0, asOfDate: '2026-10-15', runStamp: STAMP });
      await writeSeedRecords(db.execute, CFG, industry, [record]);
      const original = new Map(listIndustryEventTables(industry).map((table) => [
        table.table, structuredClone(db.rows(`DB.AEP_SCHEMA.${table.table}`)),
      ]));
      const regenerated = generateIndustryEventRows(industry, record.profile, { now: STAMP });
      for (const table of listIndustryEventTables(industry)) {
        assert.deepEqual(record.events.rowsByType[table.key], regenerated.rowsByType[table.key]);
      }
      const service = enrichService(db);
      for (let attempt = 0; attempt < 2; attempt++) {
        const result = await service.handleIndustryEnrich({
          labUser: 'offline', sandbox: 'test', industry, profiles: [{ ecid: profile.ECID }],
        });
        assert.equal(result.ok, true);
        assert.equal(result.insertedRowCount, 0);
        for (const table of listIndustryEventTables(industry)) {
          assert.deepEqual(db.rows(`DB.AEP_SCHEMA.${table.table}`), original.get(table.table));
          assert.ok(result.profileResults[0].tableResults.find((item) => item.eventType === table.key).idempotent
            || !original.get(table.table).length);
        }
      }
    });

    it(`${industry} enrich-only followed by seed and enrich does not duplicate historical generations`, async () => {
      const db = snowflakeMemoryFixture();
      const profile = generateIndustryProfileRow(industry, {
        idx: 1000, ecid: `ecid-${industry}`, email: 'demo@example.com', runStamp: STAMP,
      }).rowObject;
      const { getIndustryProfileConfig } = require('../snowflakeIndustryProfileRegistry');
      db.rows(`DB.AEP_SCHEMA.${getIndustryProfileConfig(industry).table}`).push(profile);
      const service = enrichService(db);
      const input = { labUser: 'offline', sandbox: 'test', industry, profiles: [{ ecid: profile.ECID }] };
      const first = await service.handleIndustryEnrich(input);
      assert.ok(first.insertedRowCount > 0);
      const counts = listIndustryEventTables(industry).map((table) => db.rows(`DB.AEP_SCHEMA.${table.table}`).length);
      assert.equal((await service.handleIndustryEnrich(input)).insertedRowCount, 0);
      const record = buildSeedRecord(industry, profile, { index: 0, asOfDate: '2026-10-15', runStamp: STAMP });
      await writeSeedRecords(db.execute, CFG, industry, [record]);
      assert.deepEqual(listIndustryEventTables(industry).map((table) => db.rows(`DB.AEP_SCHEMA.${table.table}`).length), counts);
      assert.equal((await service.handleIndustryEnrich(input)).insertedRowCount, 0);
    });
  }

  it('recognizes legacy unsuffixed enrichment generations without inserting another snapshot', async () => {
    const db = snowflakeMemoryFixture();
    const profile = { ECID: 'legacy-ecid', EMAIL: 'legacy@example.com', CRMID: 'CRM1000' };
    db.rows('DB.AEP_SCHEMA.AGENTIC_RETAIL_PROFILE_CUSTOMER').push(profile);
    const generated = generateIndustryEventRows('retail', profile, { now: STAMP, eventTypes: ['rewards'] });
    db.rows('DB.AEP_SCHEMA.AGENTIC_RETAIL_PROFILE_REWARDS').push({
      ...generated.rowsByType.rewards[0], GENERATIONID: generated.generationId,
    });
    const result = await enrichService(db).handleIndustryEnrich({
      labUser: 'offline', sandbox: 'test', industry: 'retail', profiles: [{ ecid: profile.ECID }], eventTypes: ['rewards'],
    });
    assert.equal(result.insertedRowCount, 0);
    assert.equal(db.rows('DB.AEP_SCHEMA.AGENTIC_RETAIL_PROFILE_REWARDS').length, 1);
  });
});
