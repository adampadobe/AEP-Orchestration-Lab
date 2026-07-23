'use strict';

const { normalizeSnowflakeIndustry } = require('./snowflakeIndustryProfileRegistry');

const IDENTITY_DDL = [
  'EMAIL VARCHAR(320)',
  'ECID VARCHAR(320)',
  'CRMID VARCHAR(320)',
];
const EVENT_META_DDL = [
  'EVENTID VARCHAR(320)',
  'GENERATIONID VARCHAR(320)',
  'TIMESTAMP VARCHAR(320)',
];
const PROFILE_META_DDL = ['GENERATIONID VARCHAR(320)'];
const RECORD_DDL = '_RECORDCREATEDTIMESTAMP VARCHAR(320)';

function columnName(ddl) {
  return String(ddl).trim().split(/\s+/)[0];
}

function table(industry, key, name, kind, fields) {
  const columnDdl = [
    ...IDENTITY_DDL,
    ...(kind === 'event' ? EVENT_META_DDL : PROFILE_META_DDL),
    ...fields,
    RECORD_DDL,
  ];
  return Object.freeze({
    industry,
    key,
    table: name,
    kind,
    columnDdl: Object.freeze(columnDdl),
    columns: Object.freeze(columnDdl.map(columnName)),
    arrayColumns: Object.freeze(
      fields.filter((field) => /\sARRAY$/i.test(field.trim())).map(columnName),
    ),
  });
}

const INDUSTRY_EVENT_CONFIG = Object.freeze({
  fsi: Object.freeze({
    digital: table('fsi', 'digital', 'AGENTIC_FSI_EVENT_DIGITAL', 'event', [
      'CHANNEL VARCHAR(320)', 'ACTION VARCHAR(320)', 'AMOUNT NUMBER(18,2)',
      'CURRENCY VARCHAR(10)', 'DEVICE VARCHAR(320)', 'SESSION_DURATION_SECONDS NUMBER(18,0)',
      'IP_COUNTRY VARCHAR(320)', 'AUTHENTICATION_METHOD VARCHAR(320)',
    ]),
    transaction: table('fsi', 'transaction', 'AGENTIC_FSI_EVENT_TRANSACTION', 'event', [
      'TRANSACTION_TYPE VARCHAR(320)', 'DIRECTION VARCHAR(10)', 'AMOUNT NUMBER(18,2)',
      'CURRENCY VARCHAR(10)', 'MERCHANT VARCHAR(320)', 'CATEGORY VARCHAR(320)',
      'BALANCE_AFTER NUMBER(18,2)', 'ACCOUNT_TYPE VARCHAR(320)', 'REFERENCE VARCHAR(320)',
    ]),
    application: table('fsi', 'application', 'AGENTIC_FSI_EVENT_APPLICATION', 'event', [
      'APPLICATION_ID VARCHAR(320)', 'PRODUCT_TYPE VARCHAR(320)', 'STAGE VARCHAR(320)',
      'AMOUNT_REQUESTED NUMBER(18,2)', 'TERM_MONTHS NUMBER(18,0)', 'CHANNEL VARCHAR(320)',
      'DECISION_REASON VARCHAR(320)',
    ]),
    advisory: table('fsi', 'advisory', 'AGENTIC_FSI_EVENT_ADVISORY', 'event', [
      'CHANNEL VARCHAR(320)', 'ADVISOR_ID VARCHAR(320)', 'TOPIC VARCHAR(320)',
      'DURATION_MINUTES NUMBER(18,0)', 'OUTCOME VARCHAR(320)', 'NEXT_ACTION_DATE VARCHAR(320)',
      'NPS_SCORE NUMBER(18,0)',
    ]),
    products: table('fsi', 'products', 'AGENTIC_FSI_PROFILE_PRODUCTS', 'enrichment', [
      'PRODUCT_TYPE VARCHAR(320)', 'ACCOUNT_NUMBER VARCHAR(320)', 'OPEN_DATE VARCHAR(320)',
      'BALANCE NUMBER(18,2)', 'INTEREST_RATE NUMBER(8,4)', 'TERM_END_DATE VARCHAR(320)',
      'MONTHLY_PAYMENT NUMBER(18,2)', 'STATUS VARCHAR(320)',
    ]),
  }),
  retail: Object.freeze({
    order: table('retail', 'order', 'AGENTIC_RETAIL_EVENT_ORDER', 'event', [
      'ORDER_ID VARCHAR(320)', 'ITEMS ARRAY', 'ITEM_COUNT NUMBER(18,0)',
      'ORDER_TOTAL NUMBER(18,2)', 'CURRENCY VARCHAR(10)', 'PAYMENT_METHOD VARCHAR(320)',
      'CHANNEL VARCHAR(320)', 'DELIVERY_METHOD VARCHAR(320)', 'STATUS VARCHAR(320)',
      'PROMO_CODE VARCHAR(320)',
    ]),
    browse: table('retail', 'browse', 'AGENTIC_RETAIL_EVENT_BROWSE', 'event', [
      'PAGE_TYPE VARCHAR(320)', 'PRODUCT_ID VARCHAR(320)', 'PRODUCT_NAME VARCHAR(320)',
      'CATEGORY VARCHAR(320)', 'DWELL_TIME_SECONDS NUMBER(18,0)', 'DEVICE VARCHAR(320)',
      'SEARCH_TERM VARCHAR(320)', 'REFERRAL_SOURCE VARCHAR(320)',
    ]),
    return: table('retail', 'return', 'AGENTIC_RETAIL_EVENT_RETURN', 'event', [
      'RETURN_ID VARCHAR(320)', 'ORDER_ID VARCHAR(320)', 'ITEMS ARRAY',
      'REASON VARCHAR(320)', 'REFUND_AMOUNT NUMBER(18,2)', 'METHOD VARCHAR(320)',
      'STATUS VARCHAR(320)',
    ]),
    service: table('retail', 'service', 'AGENTIC_RETAIL_EVENT_SERVICE', 'event', [
      'CASE_ID VARCHAR(320)', 'CHANNEL VARCHAR(320)', 'TOPIC VARCHAR(320)',
      'RESOLUTION VARCHAR(320)', 'CSAT_SCORE NUMBER(18,0)', 'RESPONSE_TIME_MINUTES NUMBER(18,0)',
    ]),
    rewards: table('retail', 'rewards', 'AGENTIC_RETAIL_PROFILE_REWARDS', 'enrichment', [
      'TIER VARCHAR(320)', 'POINTS_BALANCE NUMBER(18,0)', 'POINTS_EARNED_YTD NUMBER(18,0)',
      'POINTS_REDEEMED_YTD NUMBER(18,0)', 'TIER_EXPIRY_DATE VARCHAR(320)',
      'NEXT_TIER_THRESHOLD NUMBER(18,0)', 'PREFERRED_REWARD_TYPE VARCHAR(320)',
      'BIRTHDAY_REWARD_USED BOOLEAN', 'REFERRAL_COUNT NUMBER(18,0)',
    ]),
  }),
  telecom: Object.freeze({
    usage: table('telecom', 'usage', 'AGENTIC_TELECOM_EVENT_USAGE', 'event', [
      'USAGE_TYPE VARCHAR(320)', 'DURATION_SECONDS NUMBER(18,0)', 'DATA_MB NUMBER(18,2)',
      'DESTINATION VARCHAR(320)', 'ROAMING BOOLEAN', 'NETWORK_TYPE VARCHAR(320)',
      'PEAK_FLAG BOOLEAN',
    ]),
    billing: table('telecom', 'billing', 'AGENTIC_TELECOM_EVENT_BILLING', 'event', [
      'INVOICE_ID VARCHAR(320)', 'AMOUNT NUMBER(18,2)', 'CURRENCY VARCHAR(10)',
      'PAYMENT_STATUS VARCHAR(320)', 'PAYMENT_METHOD VARCHAR(320)', 'OVERDUE_DAYS NUMBER(18,0)',
      'BILL_PERIOD_START VARCHAR(320)', 'BILL_PERIOD_END VARCHAR(320)',
    ]),
    service: table('telecom', 'service', 'AGENTIC_TELECOM_EVENT_SERVICE', 'event', [
      'CASE_ID VARCHAR(320)', 'CHANNEL VARCHAR(320)', 'TOPIC VARCHAR(320)',
      'RESOLUTION VARCHAR(320)', 'NPS_SCORE NUMBER(18,0)', 'AGENT_ID VARCHAR(320)',
      'CALL_DURATION_SECONDS NUMBER(18,0)',
    ]),
    network: table('telecom', 'network', 'AGENTIC_TELECOM_EVENT_NETWORK', 'event', [
      'EVENT_TYPE VARCHAR(320)', 'CELL_ID VARCHAR(320)', 'DURATION_MINUTES NUMBER(18,0)',
      'IMPACT_AREA VARCHAR(320)', 'DOWNLOAD_SPEED_MBPS NUMBER(18,2)',
      'UPLOAD_SPEED_MBPS NUMBER(18,2)',
    ]),
    devices: table('telecom', 'devices', 'AGENTIC_TELECOM_PROFILE_DEVICES', 'enrichment', [
      'DEVICE_MODEL VARCHAR(320)', 'IMEI VARCHAR(320)', 'ACTIVATION_DATE VARCHAR(320)',
      'TRADE_IN_VALUE NUMBER(18,2)', 'INSURANCE BOOLEAN', 'INSURANCE_TIER VARCHAR(320)',
      'UPGRADE_ELIGIBLE_DATE VARCHAR(320)', 'PREVIOUS_DEVICE VARCHAR(320)',
      'CONTRACT_MONTHS NUMBER(18,0)', 'STATUS VARCHAR(320)',
    ]),
  }),
  media: Object.freeze({
    viewing: table('media', 'viewing', 'AGENTIC_MEDIA_EVENT_VIEWING', 'event', [
      'CONTENT_ID VARCHAR(320)', 'TITLE VARCHAR(320)', 'CONTENT_TYPE VARCHAR(320)',
      'GENRE VARCHAR(320)', 'SEASON NUMBER(18,0)', 'EPISODE NUMBER(18,0)',
      'DURATION_WATCHED_MINUTES NUMBER(18,0)', 'TOTAL_DURATION_MINUTES NUMBER(18,0)',
      'COMPLETION_PCT NUMBER(8,2)', 'DEVICE VARCHAR(320)', 'STREAM_QUALITY VARCHAR(320)',
      'PROFILE_NAME VARCHAR(320)',
    ]),
    engagement: table('media', 'engagement', 'AGENTIC_MEDIA_EVENT_ENGAGEMENT', 'event', [
      'ACTION VARCHAR(320)', 'CONTENT_ID VARCHAR(320)', 'TITLE VARCHAR(320)',
      'RATING NUMBER(8,1)', 'SHARE_PLATFORM VARCHAR(320)',
    ]),
    billing: table('media', 'billing', 'AGENTIC_MEDIA_EVENT_BILLING', 'event', [
      'EVENT_TYPE VARCHAR(320)', 'PLAN VARCHAR(320)', 'AMOUNT NUMBER(18,2)',
      'CURRENCY VARCHAR(10)', 'PAYMENT_METHOD VARCHAR(320)', 'PAYMENT_STATUS VARCHAR(320)',
      'ADDONS ARRAY',
    ]),
    download: table('media', 'download', 'AGENTIC_MEDIA_EVENT_DOWNLOAD', 'event', [
      'CONTENT_ID VARCHAR(320)', 'TITLE VARCHAR(320)', 'CONTENT_TYPE VARCHAR(320)',
      'FILE_SIZE_MB NUMBER(18,2)', 'DEVICE VARCHAR(320)', 'EXPIRY_DATE VARCHAR(320)',
      'STATUS VARCHAR(320)',
    ]),
    watchlist: table('media', 'watchlist', 'AGENTIC_MEDIA_PROFILE_WATCHLIST', 'enrichment', [
      'CONTENT_ID VARCHAR(320)', 'TITLE VARCHAR(320)', 'GENRE VARCHAR(320)',
      'CONTENT_TYPE VARCHAR(320)', 'ADDED_DATE VARCHAR(320)', 'PRIORITY NUMBER(18,0)',
      'ESTIMATED_DURATION_MINUTES NUMBER(18,0)', 'STATUS VARCHAR(320)',
    ]),
  }),
  sports: Object.freeze({
    attendance: table('sports', 'attendance', 'AGENTIC_SPORTS_EVENT_ATTENDANCE', 'event', [
      'EVENT_ID VARCHAR(320)', 'EVENT_NAME VARCHAR(320)', 'SPORT VARCHAR(320)',
      'VENUE VARCHAR(320)', 'SECTION VARCHAR(320)', 'TICKET_TYPE VARCHAR(320)',
      'TICKET_PRICE NUMBER(18,2)', 'COMPANIONS NUMBER(18,0)', 'GATE_SCAN_TIME VARCHAR(320)',
    ]),
    merchandise: table('sports', 'merchandise', 'AGENTIC_SPORTS_EVENT_MERCHANDISE', 'event', [
      'ORDER_ID VARCHAR(320)', 'ITEMS ARRAY', 'ITEM_COUNT NUMBER(18,0)',
      'ORDER_TOTAL NUMBER(18,2)', 'CURRENCY VARCHAR(10)', 'CHANNEL VARCHAR(320)',
      'PAYMENT_METHOD VARCHAR(320)', 'PERSONALISATION BOOLEAN',
    ]),
    engagement: table('sports', 'engagement', 'AGENTIC_SPORTS_EVENT_ENGAGEMENT', 'event', [
      'ACTION VARCHAR(320)', 'CONTEXT VARCHAR(320)', 'PLATFORM VARCHAR(320)',
      'POINTS_EARNED NUMBER(18,0)', 'RESULT VARCHAR(320)',
    ]),
    betting: table('sports', 'betting', 'AGENTIC_SPORTS_EVENT_BETTING', 'event', [
      'EVENT_ID VARCHAR(320)', 'EVENT_NAME VARCHAR(320)', 'BET_TYPE VARCHAR(320)',
      'STAKE NUMBER(18,2)', 'ODDS NUMBER(18,2)', 'OUTCOME VARCHAR(320)',
      'PAYOUT NUMBER(18,2)', 'BOOKMAKER VARCHAR(320)',
    ]),
    membership: table('sports', 'membership', 'AGENTIC_SPORTS_PROFILE_MEMBERSHIP', 'enrichment', [
      'MEMBERSHIP_TYPE VARCHAR(320)', 'MEMBER_SINCE VARCHAR(320)', 'RENEWAL_DATE VARCHAR(320)',
      'AUTO_RENEW BOOLEAN', 'ANNUAL_FEE NUMBER(18,2)', 'BENEFITS_USED ARRAY',
      'LOYALTY_POINTS NUMBER(18,0)', 'REFERRALS_MADE NUMBER(18,0)', 'STATUS VARCHAR(320)',
    ]),
  }),
});

function getIndustryEventConfig(industry) {
  return INDUSTRY_EVENT_CONFIG[normalizeSnowflakeIndustry(industry)] || null;
}

function getIndustryEventTable(industry, key) {
  const config = getIndustryEventConfig(industry);
  return config ? config[String(key || '').trim().toLowerCase()] || null : null;
}

function listIndustryEventTables(industry) {
  return Object.values(getIndustryEventConfig(industry) || {});
}

function listIndustryEventTypes(industry) {
  return Object.keys(getIndustryEventConfig(industry) || {});
}

module.exports = {
  INDUSTRY_EVENT_CONFIG,
  getIndustryEventConfig,
  getIndustryEventTable,
  listIndustryEventTables,
  listIndustryEventTypes,
};
