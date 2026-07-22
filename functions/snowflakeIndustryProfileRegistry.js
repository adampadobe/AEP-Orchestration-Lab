'use strict';

const { COLUMNS: TRAVEL_COLUMNS } = require('./snowflakeTravelProfileSchema');
const fsi = require('./snowflakeFsiProfileSchema');
const retail = require('./snowflakeRetailProfileSchema');
const telecom = require('./snowflakeTelecomProfileSchema');
const media = require('./snowflakeMediaProfileSchema');
const sports = require('./snowflakeSportsProfileSchema');

const INDUSTRY_CONFIG = Object.freeze({
  travel: { industry: 'travel', table: 'AGENTIC_TRAVEL_PROFILE_CUSTOMER', columns: TRAVEL_COLUMNS },
  fsi: { industry: 'fsi', table: fsi.TABLE, columns: fsi.COLUMNS, columnDdl: fsi.COLUMN_DDL },
  retail: { industry: 'retail', table: retail.TABLE, columns: retail.COLUMNS, columnDdl: retail.COLUMN_DDL },
  telecom: { industry: 'telecom', table: telecom.TABLE, columns: telecom.COLUMNS, columnDdl: telecom.COLUMN_DDL },
  media: { industry: 'media', table: media.TABLE, columns: media.COLUMNS, columnDdl: media.COLUMN_DDL },
  sports: { industry: 'sports', table: sports.TABLE, columns: sports.COLUMNS, columnDdl: sports.COLUMN_DDL },
});

const ALIASES = Object.freeze({ telco: 'telecom', telecommunications: 'telecom' });

function normalizeSnowflakeIndustry(industry) {
  const raw = String(industry || 'travel').trim().toLowerCase();
  return ALIASES[raw] || raw;
}

function getIndustryProfileConfig(industry) {
  return INDUSTRY_CONFIG[normalizeSnowflakeIndustry(industry)] || null;
}

function getIndustryProfileConfigByTable(table) {
  const target = String(table || '').trim().toUpperCase();
  return Object.values(INDUSTRY_CONFIG).find((entry) => entry.table === target) || null;
}

function listSnowflakeProfileIndustries() {
  return Object.keys(INDUSTRY_CONFIG);
}

module.exports = {
  INDUSTRY_CONFIG,
  normalizeSnowflakeIndustry,
  getIndustryProfileConfig,
  getIndustryProfileConfigByTable,
  listSnowflakeProfileIndustries,
};
