#!/usr/bin/env node
/**
 * Ingest experience events via HTTP Streaming (dataflow) collection endpoint.
 * Uses auth from ../00 Adobe Auth. One event per POST.
 *
 * Schema: API Operational Events (ExperienceEvent Core v2.1)
 *   https://ns.adobe.com/demoemea/schemas/9bc433dd59aeea8231b6d1a25a9d1f6de0cd3ea609aa1ebb
 * Tenant: _demoemea (XDM_TENANTID_PLACEHOLDER = demoemea)
 *
 * Event payload shape (per schema):
 *   - identityMap (Email primary)
 *   - @id, _id, xdm:timestamp (required)
 *   - _demoemea.identification.core (email, crmId, ecid, loyaltyId, phoneNumber)
 *   - _demoemea.demoEnvironment (brandName, brandIndustry, brandLogo, ldap, tms)
 *   - _demoemea.interactionDetails.core (form: name/category/action, channel, campaignChannel)
 *   - _demoemea.loyaltyDetails (level) when applicable
 *   - commerce, productListItems[] with SKU and productListItems[]._demoemea.core (description, imageURL, mainCategory, productURL, subCategory)
 *
 * Usage:
 *   node ingest-events-streaming.js [path-to-events.json]
 *   Default: ./events/mortgage-purchase-events.json
 */

import { getAuth } from '../00 Adobe Auth/src/index.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const XDM_TENANT_ID = 'demoemea';
const SCHEMA_ID = `https://ns.adobe.com/${XDM_TENANT_ID}/schemas/9bc433dd59aeea8231b6d1a25a9d1f6de0cd3ea609aa1ebb`;
const SCHEMA_CONTENT_TYPE = 'application/vnd.adobe.xed-full+json;version=1.0';

// HTTP Streaming collection (your dataflow)
const COLLECTION_URL = 'https://dcs.adobedc.net/collection/1706a1fe8d0a94139a5d329d85b147a9016d96fc7d4c6c01420ce5c8c022b620?syncValidation=false';
const FLOW_ID = 'b326ba47-fb29-4e32-a2f3-54f47c9e1ea7';
const DATASET_ID = '698f17dbf12b21fe67779cb1';
const SANDBOX_NAME = 'kirkham';

// Shared FSI identity and demo env for built-in events (schema: _<tenant>.identification.core, demoEnvironment)
const FSI_IDENTITY = {
  identityMap: { Email: [{ id: 'kirkham+media-1@adobetest.com', primary: true }] },
  _demoemea: {
    identification: {
      core: {
        email: 'kirkham+media-1@adobetest.com',
        crmId: '38h3qffS',
        ecid: '41368725014210978041842361448685459532',
        loyaltyId: '38h3qffS9311',
        phoneNumber: '569-387-4941',
      },
    },
    demoEnvironment: {
      brandName: 'Demo EMEA Bank',
      brandIndustry: 'Financial Services',
      brandLogo: 'https://demo-bank.example.com/assets/logo.png',
      ldap: 'demoemea-bank',
      tms: 'demo-emea-tms',
    },
  },
};

/** Return ISO timestamp for today at given hour and minute (UTC). */
function todayAt(hour, minute = 0) {
  const d = new Date();
  d.setUTCHours(hour, minute, 0, 0);
  return d.toISOString();
}

/**
 * eventType values from API Operational Events schema sample (root-level field).
 * Align with commerce/form action for each FSI event.
 */
const EVENT_TYPES = {
  productView: 'commerce.productViews',
  formSubmit: 'form.formSubmit',
  order: 'commerce.order',
  productListAdd: 'commerce.productListAdds',
  productListView: 'commerce.productListViews',
  cartAbandon: 'commerce.cartAbandons',
};

/** Build FSI events (mortgage + cart abandonment) with timestamps set to today for kirkham+media-1@adobetest.com. */
function getBuiltInFSIEvents() {
  const t = todayAt;
  return [
    { _id: 'a1b2c3d4-e5f6-4789-a012-3mortgage001', '@id': 'a1b2c3d4-e5f6-4789-a012-3mortgage001', timestamp: t(9, 15), eventType: EVENT_TYPES.productView, producedBy: 'self', ...FSI_IDENTITY, _demoemea: { ...FSI_IDENTITY._demoemea, interactionDetails: { core: { form: { name: 'Mortgage Eligibility Check', category: 'Mortgage', action: 'start' }, channel: 'web', campaignChannel: 'website' } } }, commerce: { productViews: { value: 1 } }, productListItems: [{ SKU: 'MORT-RES-FIXED-5Y', name: '5 Year Fixed Rate Residential Mortgage', quantity: 1, priceTotal: 285000, _demoemea: { core: { mainCategory: 'Mortgages', subCategory: 'Residential Fixed Rate', description: '5-year fixed rate residential mortgage, 4.25% APR, max LTV 85%', productURL: 'https://demo-bank.example.com/mortgages/fixed-5y', imageURL: 'https://demo-bank.example.com/assets/mortgage-5y.png' } } }] },
    { _id: 'a1b2c3d4-e5f6-4789-a012-3mortgage002', '@id': 'a1b2c3d4-e5f6-4789-a012-3mortgage002', timestamp: t(14, 22), eventType: EVENT_TYPES.formSubmit, producedBy: 'self', ...FSI_IDENTITY, _demoemea: { ...FSI_IDENTITY._demoemea, interactionDetails: { core: { form: { name: 'Mortgage Application', category: 'Mortgage', action: 'submit' }, channel: 'web', campaignChannel: 'website' } }, loyaltyDetails: { level: 'Elite' } } },
    { _id: 'a1b2c3d4-e5f6-4789-a012-3mortgage003', '@id': 'a1b2c3d4-e5f6-4789-a012-3mortgage003', timestamp: t(11, 45), eventType: EVENT_TYPES.order, producedBy: 'self', ...FSI_IDENTITY, _demoemea: { ...FSI_IDENTITY._demoemea, interactionDetails: { core: { form: { name: 'Mortgage Offer Acceptance', category: 'Mortgage', action: 'complete' }, channel: 'branch', campaignChannel: 'in-person' } }, loyaltyDetails: { level: 'Elite' } }, commerce: { order: { purchaseID: 'MORT-2025-013456', orderType: 'checkout', priceTotal: 285000, currencyCode: 'GBP', payments: [{ transactionID: 'TXN-MORT-2025-013456', paymentAmount: 285000, currencyCode: 'GBP', paymentType: 'mortgage_agreement' }] } }, productListItems: [{ SKU: 'MORT-RES-FIXED-5Y', name: '5 Year Fixed Rate Residential Mortgage', quantity: 1, priceTotal: 285000, _demoemea: { core: { mainCategory: 'Mortgages', subCategory: 'Residential Fixed Rate', description: '5-year fixed rate residential mortgage, 4.25% APR, £285,000 principal', productURL: 'https://demo-bank.example.com/mortgages/fixed-5y', imageURL: 'https://demo-bank.example.com/assets/mortgage-5y.png' } } }] },
    { _id: 'fsi-cart-001-add-savings', '@id': 'fsi-cart-001-add-savings', timestamp: t(10, 5), eventType: EVENT_TYPES.productListAdd, producedBy: 'self', ...FSI_IDENTITY, _demoemea: { ...FSI_IDENTITY._demoemea, interactionDetails: { core: { form: { name: 'Product Selection', category: 'Savings', action: 'add' }, channel: 'web', campaignChannel: 'website' } } }, commerce: { productListAdds: { id: 'cart-fsi-001', value: 1 } }, productListItems: [{ SKU: 'SAV-PREM-2.5', name: 'Premium Savings Account 2.5%', quantity: 1, priceTotal: 0, _demoemea: { core: { mainCategory: 'Savings', subCategory: 'Instant Access', description: 'Premium instant access savings, 2.5% AER', productURL: 'https://demo-bank.example.com/savings/premium', imageURL: 'https://demo-bank.example.com/assets/savings-premium.png' } } }] },
    { _id: 'fsi-cart-002-add-insurance', '@id': 'fsi-cart-002-add-insurance', timestamp: t(10, 12), eventType: EVENT_TYPES.productListAdd, producedBy: 'self', ...FSI_IDENTITY, _demoemea: { ...FSI_IDENTITY._demoemea, interactionDetails: { core: { form: { name: 'Product Selection', category: 'Insurance', action: 'add' }, channel: 'web', campaignChannel: 'website' } } }, commerce: { productListAdds: { id: 'cart-fsi-001', value: 1 } }, productListItems: [{ SKU: 'SAV-PREM-2.5', name: 'Premium Savings Account 2.5%', quantity: 1, priceTotal: 0, _demoemea: { core: { mainCategory: 'Savings', subCategory: 'Instant Access', description: 'Premium instant access savings, 2.5% AER', productURL: 'https://demo-bank.example.com/savings/premium', imageURL: 'https://demo-bank.example.com/assets/savings-premium.png' } } }, { SKU: 'INS-TRAVEL-ANNUAL', name: 'Annual Travel Insurance', quantity: 1, priceTotal: 89, _demoemea: { core: { mainCategory: 'Insurance', subCategory: 'Travel', description: 'Worldwide annual multi-trip travel insurance', productURL: 'https://demo-bank.example.com/insurance/travel', imageURL: 'https://demo-bank.example.com/assets/insurance-travel.png' } } }] },
    { _id: 'fsi-cart-003-view-cart', '@id': 'fsi-cart-003-view-cart', timestamp: t(10, 18), eventType: EVENT_TYPES.productListView, producedBy: 'self', ...FSI_IDENTITY, _demoemea: { ...FSI_IDENTITY._demoemea, interactionDetails: { core: { form: { name: 'Cart', category: 'Cart', action: 'view' }, channel: 'web', campaignChannel: 'website' } } }, commerce: { productListViews: { id: 'cart-fsi-001', value: 1 } }, productListItems: [{ SKU: 'SAV-PREM-2.5', name: 'Premium Savings Account 2.5%', quantity: 1, priceTotal: 0, _demoemea: { core: { mainCategory: 'Savings', subCategory: 'Instant Access', description: 'Premium instant access savings, 2.5% AER', productURL: 'https://demo-bank.example.com/savings/premium', imageURL: 'https://demo-bank.example.com/assets/savings-premium.png' } } }, { SKU: 'INS-TRAVEL-ANNUAL', name: 'Annual Travel Insurance', quantity: 1, priceTotal: 89, _demoemea: { core: { mainCategory: 'Insurance', subCategory: 'Travel', description: 'Worldwide annual multi-trip travel insurance', productURL: 'https://demo-bank.example.com/insurance/travel', imageURL: 'https://demo-bank.example.com/assets/insurance-travel.png' } } }] },
    { _id: 'fsi-cart-004-abandoned', '@id': 'fsi-cart-004-abandoned', timestamp: t(10, 25), eventType: EVENT_TYPES.cartAbandon, producedBy: 'self', ...FSI_IDENTITY, _demoemea: { ...FSI_IDENTITY._demoemea, interactionDetails: { core: { form: { name: 'Cart Abandoned', category: 'Cart', action: 'abandon' }, channel: 'web', campaignChannel: 'website' } } }, commerce: { cartAbandons: { id: 'cart-fsi-001', value: 89 } }, productListItems: [{ SKU: 'SAV-PREM-2.5', name: 'Premium Savings Account 2.5%', quantity: 1, priceTotal: 0, _demoemea: { core: { mainCategory: 'Savings', subCategory: 'Instant Access', description: 'Premium instant access savings, 2.5% AER', productURL: 'https://demo-bank.example.com/savings/premium', imageURL: 'https://demo-bank.example.com/assets/savings-premium.png' } } }, { SKU: 'INS-TRAVEL-ANNUAL', name: 'Annual Travel Insurance', quantity: 1, priceTotal: 89, _demoemea: { core: { mainCategory: 'Insurance', subCategory: 'Travel', description: 'Worldwide annual multi-trip travel insurance', productURL: 'https://demo-bank.example.com/insurance/travel', imageURL: 'https://demo-bank.example.com/assets/insurance-travel.png' } } }] },
    { _id: 'fsi-cart-005-add-current-account', '@id': 'fsi-cart-005-add-current-account', timestamp: t(14, 0), eventType: EVENT_TYPES.productListAdd, producedBy: 'self', ...FSI_IDENTITY, _demoemea: { ...FSI_IDENTITY._demoemea, interactionDetails: { core: { form: { name: 'Product Selection', category: 'Current Account', action: 'add' }, channel: 'web', campaignChannel: 'website' } } }, commerce: { productListAdds: { id: 'cart-fsi-002', value: 1 } }, productListItems: [{ SKU: 'CUR-ACC-PLUS', name: 'Current Account Plus', quantity: 1, priceTotal: 0, _demoemea: { core: { mainCategory: 'Current Accounts', subCategory: 'Packaged', description: 'Current account with travel insurance and breakdown cover', productURL: 'https://demo-bank.example.com/current-accounts/plus', imageURL: 'https://demo-bank.example.com/assets/current-account-plus.png' } } }] },
    { _id: 'fsi-cart-006-add-credit-card', '@id': 'fsi-cart-006-add-credit-card', timestamp: t(14, 8), eventType: EVENT_TYPES.productListAdd, producedBy: 'self', ...FSI_IDENTITY, _demoemea: { ...FSI_IDENTITY._demoemea, interactionDetails: { core: { form: { name: 'Product Selection', category: 'Credit Card', action: 'add' }, channel: 'web', campaignChannel: 'website' } } }, commerce: { productListAdds: { id: 'cart-fsi-002', value: 1 } }, productListItems: [{ SKU: 'CUR-ACC-PLUS', name: 'Current Account Plus', quantity: 1, priceTotal: 0, _demoemea: { core: { mainCategory: 'Current Accounts', subCategory: 'Packaged', description: 'Current account with travel insurance and breakdown cover', productURL: 'https://demo-bank.example.com/current-accounts/plus', imageURL: 'https://demo-bank.example.com/assets/current-account-plus.png' } } }, { SKU: 'CC-REWARD-PLAT', name: 'Platinum Rewards Credit Card', quantity: 1, priceTotal: 0, _demoemea: { core: { mainCategory: 'Credit Cards', subCategory: 'Rewards', description: '0% APR for 20 months, 1% cashback on spending', productURL: 'https://demo-bank.example.com/credit-cards/platinum-rewards', imageURL: 'https://demo-bank.example.com/assets/cc-platinum.png' } } }] },
    { _id: 'fsi-cart-007-view-cart', '@id': 'fsi-cart-007-view-cart', timestamp: t(14, 15), eventType: EVENT_TYPES.productListView, producedBy: 'self', ...FSI_IDENTITY, _demoemea: { ...FSI_IDENTITY._demoemea, interactionDetails: { core: { form: { name: 'Cart', category: 'Cart', action: 'view' }, channel: 'mobileApp', campaignChannel: 'mobile' } } }, commerce: { productListViews: { id: 'cart-fsi-002', value: 1 } }, productListItems: [{ SKU: 'CUR-ACC-PLUS', name: 'Current Account Plus', quantity: 1, priceTotal: 0, _demoemea: { core: { mainCategory: 'Current Accounts', subCategory: 'Packaged', description: 'Current account with travel insurance and breakdown cover', productURL: 'https://demo-bank.example.com/current-accounts/plus', imageURL: 'https://demo-bank.example.com/assets/current-account-plus.png' } } }, { SKU: 'CC-REWARD-PLAT', name: 'Platinum Rewards Credit Card', quantity: 1, priceTotal: 0, _demoemea: { core: { mainCategory: 'Credit Cards', subCategory: 'Rewards', description: '0% APR for 20 months, 1% cashback on spending', productURL: 'https://demo-bank.example.com/credit-cards/platinum-rewards', imageURL: 'https://demo-bank.example.com/assets/cc-platinum.png' } } }] },
    { _id: 'fsi-cart-008-abandoned', '@id': 'fsi-cart-008-abandoned', timestamp: t(14, 22), eventType: EVENT_TYPES.cartAbandon, producedBy: 'self', ...FSI_IDENTITY, _demoemea: { ...FSI_IDENTITY._demoemea, interactionDetails: { core: { form: { name: 'Cart Abandoned', category: 'Cart', action: 'abandon' }, channel: 'mobileApp', campaignChannel: 'mobile' } } }, commerce: { cartAbandons: { id: 'cart-fsi-002', value: 0 } }, productListItems: [{ SKU: 'CUR-ACC-PLUS', name: 'Current Account Plus', quantity: 1, priceTotal: 0, _demoemea: { core: { mainCategory: 'Current Accounts', subCategory: 'Packaged', description: 'Current account with travel insurance and breakdown cover', productURL: 'https://demo-bank.example.com/current-accounts/plus', imageURL: 'https://demo-bank.example.com/assets/current-account-plus.png' } } }, { SKU: 'CC-REWARD-PLAT', name: 'Platinum Rewards Credit Card', quantity: 1, priceTotal: 0, _demoemea: { core: { mainCategory: 'Credit Cards', subCategory: 'Rewards', description: '0% APR for 20 months, 1% cashback on spending', productURL: 'https://demo-bank.example.com/credit-cards/platinum-rewards', imageURL: 'https://demo-bank.example.com/assets/cc-platinum.png' } } }] },
  ];
}

function buildPayload(xdmEntity, imsOrgId) {
  return {
    header: {
      schemaRef: {
        id: SCHEMA_ID,
        contentType: SCHEMA_CONTENT_TYPE,
      },
      imsOrgId,
      datasetId: DATASET_ID,
      source: {
        name: 'API Operational Events dataflow details',
      },
    },
    body: {
      xdmMeta: {
        schemaRef: {
          id: SCHEMA_ID,
          contentType: SCHEMA_CONTENT_TYPE,
        },
      },
      xdmEntity,
    },
  };
}

/**
 * Normalize event to API Operational Events schema shape (per schema-sample).
 * Ensures: @id, _id, xdm:timestamp, eventType (optional), producedBy; moves loyaltyDetails under _demoemea.
 */
function normalizeEventForSchema(xdmEntity) {
  const e = { ...xdmEntity };
  if (!e['@id']) e['@id'] = e._id || `event-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  if (!e._id) e._id = e['@id'];
  if (e.timestamp && !e['xdm:timestamp']) e['xdm:timestamp'] = e.timestamp;
  if (e.producedBy == null) e.producedBy = 'self';
  if (e.loyaltyDetails != null && e._demoemea && !e._demoemea.loyaltyDetails) {
    e._demoemea.loyaltyDetails = e.loyaltyDetails;
    delete e.loyaltyDetails;
  }
  if (e.loyaltyDetails != null && !e._demoemea) {
    e._demoemea = { ...e._demoemea, loyaltyDetails: e.loyaltyDetails };
    delete e.loyaltyDetails;
  }
  return e;
}

async function sendEvent(token, xdmEntity, imsOrgId) {
  const payload = buildPayload(xdmEntity, imsOrgId);
  const res = await fetch(COLLECTION_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'sandbox-name': SANDBOX_NAME,
      'Authorization': `Bearer ${token}`,
      'x-adobe-flow-id': FLOW_ID,
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  if (!res.ok) {
    throw new Error(`Streaming ${res.status}: ${data.message || data.title || data.detail || text}`);
  }
  return data;
}

async function main() {
  const eventsPath = process.argv[2] || join(__dirname, 'events', 'mortgage-purchase-events.json');
  let events = [];

  try {
    const body = readFileSync(eventsPath, 'utf8');
    const normalized = body.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalized.split('\n').map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      try {
        events.push(JSON.parse(line));
      } catch {
        break;
      }
    }
  } catch (e) {
    console.error('Could not read/parse file, using built-in events:', e.message);
  }
  if (events.length < 11) {
    events = getBuiltInFSIEvents();
    console.error('Using built-in FSI events with timestamps dated today (file missing or partial).');
  }

  const { token, config } = await getAuth();
  const imsOrgId = config.orgId;
  if (!imsOrgId) {
    console.error('Missing ADOBE_ORG_ID in config (required for header.imsOrgId).');
    process.exit(1);
  }

  console.error('Sending', events.length, 'event(s) to HTTP streaming endpoint...');
  const results = [];
  for (let i = 0; i < events.length; i++) {
    const xdmEntity = normalizeEventForSchema(events[i]);
    const eventId = xdmEntity['@id'] || xdmEntity._id || `event-${i + 1}`;
    try {
      const result = await sendEvent(token, xdmEntity, imsOrgId);
      results.push({ eventId, ok: true, result });
      console.error('OK:', eventId);
    } catch (err) {
      results.push({ eventId, ok: false, error: err.message });
      console.error('FAIL:', eventId, err.message);
    }
    // Brief delay between requests to avoid rate limits
    if (i < events.length - 1) await new Promise((r) => setTimeout(r, 300));
  }

  const ok = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok).length;
  console.error('Done.', ok, 'succeeded,', fail, 'failed.');
  console.log(JSON.stringify({ sent: ok, failed: fail, results }));
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
