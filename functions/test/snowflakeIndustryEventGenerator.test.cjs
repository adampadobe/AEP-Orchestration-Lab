'use strict';

const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { getRecipientId } = require('../snowflakeRecipientFactory');
const {
  listIndustryEventTables,
  listIndustryEventTypes,
} = require('../snowflakeIndustryEventRegistry');
const { generateIndustryEventRows } = require('../snowflakeIndustryEventGenerator');

const identity = { EMAIL: 'profile@example.com', ECID: '123456789', CRMID: 'CRM42' };
const profiles = {
  fsi: { ...identity, TOTALACCOUNTS: 4, CHECKINGBALANCE: 2500, SAVINGSBALANCE: 12000, MORTGAGEBALANCE: 175000, INVESTMENTVALUE: 45000 },
  retail: { ...identity, ORDERSYTD: 10, TOTALORDERS: 42, RETURNRATE: 0.2, REWARDPOINTS: 8000, FAVOURITECATEGORY: 'fashion' },
  telecom: { ...identity, DATAUSAGEGB: 20, MONTHLYSPEND: 55, DEVICEMODEL: 'iPhone 17 Pro', NETWORKNPS: 9 },
  media: { ...identity, PRIMARYGENRE: 'drama', MONTHLYFEE: 17.99, SUBSCRIPTIONTIER: 'premium', DOWNLOADSPERMONTH: 6 },
  sports: { ...identity, FAVOURITESPORT: 'football', FAVOURITETEAM: 'Arsenal', MERCHSPENDYTD: 480, BETSREGULARLY: true, MEMBERSHIPTYPE: 'premium' },
};

describe('Snowflake industry event registry and generators', () => {
  for (const industry of Object.keys(profiles)) {
    it(`${industry} exposes exactly five governed event/enrichment tables`, () => {
      const tables = listIndustryEventTables(industry);
      assert.equal(tables.length, 5);
      assert.equal(listIndustryEventTypes(industry).length, 5);
      assert.equal(tables.filter((entry) => entry.kind === 'event').length, 4);
      assert.equal(tables.filter((entry) => entry.kind === 'enrichment').length, 1);
      for (const table of tables) {
        for (const column of ['EMAIL', 'ECID', 'CRMID', 'GENERATIONID', '_RECORDCREATEDTIMESTAMP']) {
          assert.ok(table.columns.includes(column));
        }
        if (table.kind === 'event') {
          assert.ok(table.columns.includes('EVENTID'));
          assert.ok(table.columns.includes('TIMESTAMP'));
        }
      }
    });

    it(`${industry} generation is deterministic, complete, and identity-consistent`, () => {
      const options = { now: '2026-07-23T10:00:00.000Z' };
      const first = generateIndustryEventRows(industry, profiles[industry], options);
      assert.deepEqual(first, generateIndustryEventRows(industry, profiles[industry], options));
      assert.deepEqual(Object.keys(first.rowsByType), listIndustryEventTypes(industry));
      for (const [type, rows] of Object.entries(first.rowsByType)) {
        assert.ok(rows.length >= 1 || (industry === 'retail' && type === 'return') || (industry === 'fsi' && type === 'advisory'));
        for (const [index, row] of rows.entries()) {
          assert.equal(row.EMAIL, identity.EMAIL);
          assert.equal(row.ECID, identity.ECID);
          assert.equal(row.CRMID, identity.CRMID);
          const enrichment = listIndustryEventTables(industry).find((table) => table.key === type).kind === 'enrichment';
          assert.equal(row.GENERATIONID, enrichment ? `${first.generationId}-${index}` : first.generationId);
        }
      }
    });
  }

  it('retail returns always reference generated orders', () => {
    const generated = generateIndustryEventRows('retail', profiles.retail, {
      now: '2026-07-23T10:00:00.000Z',
    });
    const orderIds = new Set(generated.rowsByType.order.map((row) => row.ORDER_ID));
    for (const row of generated.rowsByType.return) assert.ok(orderIds.has(row.ORDER_ID));
  });

  it('keeps retail returns order-relative, within 60 days, nonfuture and item-consistent across cohorts', () => {
    const now = '2026-11-08T16:00:00.947Z';
    for (let index = 0; index < 100; index++) {
      const generated = generateIndustryEventRows('retail', {
        ...profiles.retail, ECID: `retail-cohort-${index}`, RETURNRATE: 1, ORDERSYTD: 25,
      }, { now });
      const orders = new Map(generated.rowsByType.order.map((row) => [row.ORDER_ID, row]));
      assert.ok(generated.rowsByType.return.length);
      for (const row of generated.rowsByType.return) {
        const original = orders.get(row.ORDER_ID);
        const delay = Date.parse(row.TIMESTAMP) - Date.parse(original.TIMESTAMP);
        assert.equal(original.STATUS, 'delivered');
        assert.ok(delay >= 2 * 60 * 60 * 1000);
        assert.ok(delay <= 60 * 24 * 60 * 60 * 1000);
        assert.ok(Date.parse(row.TIMESTAMP) <= Date.parse(now));
        const purchased = original.ITEMS.find((item) => item.sku === row.ITEMS[0].sku);
        assert.ok(purchased);
        assert.ok(row.ITEMS[0].qty <= purchased.qty);
        assert.equal(row.ITEMS[0].reason, row.REASON);
        assert.equal(row.REFUND_AMOUNT, purchased.price);
      }
    }
  });

  it('links FSI transactions to accounts and keeps chronological running balances within limits', () => {
    const profile = { ...profiles.fsi, CHECKINGBALANCE: 0, SAVINGSBALANCE: 0 };
    const generated = generateIndustryEventRows('fsi', profile, { now: '2026-11-08T16:00:00.947Z' });
    const recipientId = getRecipientId('fsi', identity.CRMID, identity.ECID);
    const products = new Map(generated.rowsByType.products.map((row) => [row.ACCOUNT_NUMBER, row]));
    const balances = new Map();
    const accountProducts = new Map();
    const cardProducts = new Map();
    for (const product of products.values()) {
      if (['current_account', 'savings_account'].includes(product.PRODUCT_TYPE)) {
        const id = `${recipientId}-ACC-${product.ACCOUNT_NUMBER}`;
        balances.set(id, product.OPENING_BALANCE);
        accountProducts.set(id, product);
      } else if (product.PRODUCT_TYPE === 'credit_card') {
        const id = `${recipientId}-CARD-${product.ACCOUNT_NUMBER}`;
        balances.set(id, product.OPENING_BALANCE);
        cardProducts.set(id, product);
        assert.ok(product.INTEREST_RATE >= 0.18 && product.INTEREST_RATE <= 0.30);
      }
    }
    let previous = '';
    for (const row of generated.rowsByType.transaction) {
      assert.ok(row.TIMESTAMP >= previous);
      previous = row.TIMESTAMP;
      assert.notEqual(row.ACCOUNT_ID != null, row.CARD_ID != null, 'each transaction has exactly one account or card link');
      const id = row.ACCOUNT_ID || row.CARD_ID;
      assert.ok(balances.has(id), 'transaction points to an existing account or card');
      const product = (row.ACCOUNT_ID ? accountProducts : cardProducts).get(id);
      assert.equal(row.ACCOUNT_TYPE, product.PRODUCT_TYPE);
      if (product.PRODUCT_TYPE === 'savings_account') {
        assert.ok(['transfer', 'interest'].includes(row.TRANSACTION_TYPE));
      }
      if (product.PRODUCT_TYPE === 'credit_card') {
        assert.ok(!['salary', 'payroll', 'interest'].includes(row.TRANSACTION_TYPE));
      }
      const next = Number((balances.get(id)
        + (row.DIRECTION === 'credit' ? row.AMOUNT : -row.AMOUNT)).toFixed(2));
      assert.equal(row.BALANCE_AFTER, next);
      balances.set(id, next);
      if (product.PRODUCT_TYPE === 'current_account') {
        assert.ok(next >= -product.OVERDRAFT_LIMIT);
      } else if (product.PRODUCT_TYPE === 'credit_card') {
        assert.ok(next <= product.CREDIT_LIMIT);
      }
    }
    for (const [id, product] of [...accountProducts, ...cardProducts]) {
      assert.ok(Math.abs(product.BALANCE - balances.get(id)) <= 0.01);
    }
    const salaries = generated.rowsByType.transaction.filter((row) => row.TRANSACTION_TYPE === 'salary');
    assert.equal(salaries.length, 6);
    assert.ok(salaries.every((row) => row.ACCOUNT_ID && row.ACCOUNT_TYPE === 'current_account'));
    assert.equal(new Set(salaries.map((row) => row.AMOUNT)).size, 1);
  });

  it('keeps retail SKU metadata stable across recipients without changing registered columns', () => {
    const metadata = new Map();
    for (let index = 0; index < 50; index++) {
      const generated = generateIndustryEventRows('retail', {
        ...profiles.retail, ECID: `retail-sku-${index}`,
      }, { now: '2026-11-08T16:00:00.947Z' });
      for (const order of generated.rowsByType.order) {
        assert.equal(order.ORDER_TOTAL, Number(order.ITEMS.reduce((sum, item) => sum + item.qty * item.price, 0).toFixed(2)));
        for (const item of order.ITEMS) {
          const identity = JSON.stringify([item.name, item.category]);
          if (metadata.has(item.sku)) assert.equal(metadata.get(item.sku), identity);
          metadata.set(item.sku, identity);
        }
      }
    }
  });

  it('reuses media title identities across viewing, engagement, downloads and watchlists', () => {
    const now = '2026-11-08T16:00:00.947Z';
    const globalCatalog = new Map();
    for (let index = 0; index < 50; index++) {
      const generated = generateIndustryEventRows('media', {
        ...profiles.media, ECID: `media-catalog-${index}`,
      }, { now });
      const titles = new Map();
      for (const row of generated.rowsByType.viewing) {
        const metadata = JSON.stringify([row.TITLE, row.GENRE, row.CONTENT_TYPE]);
        if (globalCatalog.has(row.CONTENT_ID)) assert.equal(globalCatalog.get(row.CONTENT_ID), metadata);
        globalCatalog.set(row.CONTENT_ID, metadata);
        titles.set(row.CONTENT_ID, row);
        assert.ok(row.DURATION_WATCHED_MINUTES <= row.TOTAL_DURATION_MINUTES);
        assert.ok(row.COMPLETION_PCT <= 100);
      }
      for (const type of ['engagement', 'download', 'watchlist']) {
        for (const row of generated.rowsByType[type]) {
          const title = titles.get(row.CONTENT_ID);
          assert.ok(title, `${type} must refer to an existing viewed/catalog title`);
          assert.equal(row.TITLE, title.TITLE);
          if (row.GENRE) assert.equal(row.GENRE, title.GENRE);
          if (row.CONTENT_TYPE) assert.equal(row.CONTENT_TYPE, title.CONTENT_TYPE);
          if (type === 'download') {
            assert.ok(row.EXPIRY_DATE >= row.TIMESTAMP.slice(0, 10));
            if (row.STATUS === 'expired') assert.ok(row.EXPIRY_DATE <= now.slice(0, 10));
            if (row.STATUS === 'downloaded') assert.ok(row.EXPIRY_DATE > now.slice(0, 10));
          }
        }
      }
    }
  });

  it('keeps all generated event and enrichment rows within their existing source column contracts', () => {
    for (const [industry, profile] of Object.entries(profiles)) {
      const generated = generateIndustryEventRows(industry, profile, { now: '2026-11-08T16:00:00.947Z' });
      for (const table of listIndustryEventTables(industry)) {
        for (const row of generated.rowsByType[table.key]) {
          assert.ok(Object.keys(row).every((column) => table.columns.includes(column)), `${industry}.${table.key}`);
        }
      }
    }
  });

  it('sports betting is omitted when the profile does not bet regularly', () => {
    const generated = generateIndustryEventRows(
      'sports',
      { ...profiles.sports, BETSREGULARLY: false },
      { now: '2026-07-23T10:00:00.000Z' },
    );
    assert.equal(generated.rowsByType.betting.length, 0);
  });

  it('fsi generates funded personal loans with a repayment and future term end', () => {
    const now = '2026-10-16T11:00:00.000Z';
    const generated = generateIndustryEventRows('fsi', {
      ...profiles.fsi, TOTALACCOUNTS: 7, HOUSEHOLDINCOME: 60000, MONTHLYCREDITSPEND: 500,
    }, { now });
    const products = generated.rowsByType.products;
    const loan = products.find((row) => row.PRODUCT_TYPE === 'personal_loan');
    assert.ok(loan, 'FSI products must include a loan scenario');
    assert.ok(loan.BALANCE > 0);
    assert.ok(loan.INTEREST_RATE > 0);
    assert.ok(loan.MONTHLY_PAYMENT > loan.BALANCE * loan.INTEREST_RATE / 12);
    assert.ok(Date.parse(loan.TERM_END_DATE) > Date.parse(now));
    assert.ok(products.length <= 7);
    assert.equal(new Set(products.map((row) => row.ACCOUNT_NUMBER)).size, products.length);
  });

  it('fsi keeps low-account-count profiles within their account limit without forcing a loan', () => {
    const generated = generateIndustryEventRows('fsi', {
      ...profiles.fsi, TOTALACCOUNTS: 2,
    }, { now: '2026-10-16T11:00:00.000Z' });
    assert.deepEqual(generated.rowsByType.products.map((row) => row.PRODUCT_TYPE), ['current_account', 'savings_account']);
  });

  it('sports merchandise has stable product SKUs across recipients and distinct team/size variants', () => {
    const options = { now: '2026-10-16T11:00:00.000Z' };
    const products = new Map();
    const skus = new Map();
    for (const team of ['Arsenal', 'Liverpool']) {
      for (const size of ['M', 'L']) {
        for (let index = 0; index < 10; index += 1) {
          const generated = generateIndustryEventRows('sports', {
            ...profiles.sports, ECID: `sku-recipient-${index}`, FAVOURITETEAM: team,
            JERSEYSIZEPREFERENCE: size,
          }, options);
          for (const order of generated.rowsByType.merchandise) {
            for (const item of order.ITEMS) {
              assert.match(item.sku, /^SKU-[a-f0-9]{32}$/);
              const variant = JSON.stringify([team, item.name, item.size]);
              if (products.has(variant)) assert.equal(item.sku, products.get(variant));
              if (skus.has(item.sku)) assert.equal(variant, skus.get(item.sku));
              products.set(variant, item.sku);
              skus.set(item.sku, variant);
            }
          }
        }
      }
    }
    assert.equal(products.size, 20);
  });

  it('sports bets reference generated fixtures without inventing source columns', () => {
    const generated = generateIndustryEventRows('sports', profiles.sports, { now: '2026-10-15T12:00:00Z' });
    const fixtures = new Map(generated.rowsByType.attendance.map((row) => [row.EVENT_ID, row]));
    const columns = listIndustryEventTables('sports').find((table) => table.key === 'betting').columns;
    assert.ok(generated.rowsByType.betting.length);
    for (const row of generated.rowsByType.betting) {
      assert.equal(row.EVENT_NAME, fixtures.get(row.EVENT_ID).EVENT_NAME);
      assert.ok(Object.keys(row).every((column) => columns.includes(column)));
    }
  });
});
