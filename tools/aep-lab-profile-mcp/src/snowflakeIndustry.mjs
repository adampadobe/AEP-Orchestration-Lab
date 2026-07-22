export const SNOWFLAKE_PROFILE_TABLE_BY_INDUSTRY = Object.freeze({
  travel: 'AGENTIC_TRAVEL_PROFILE_CUSTOMER',
  fsi: 'AGENTIC_FSI_PROFILE_CUSTOMER',
  retail: 'AGENTIC_RETAIL_PROFILE_CUSTOMER',
  telecom: 'AGENTIC_TELECOM_PROFILE_CUSTOMER',
  media: 'AGENTIC_MEDIA_PROFILE_CUSTOMER',
  sports: 'AGENTIC_SPORTS_PROFILE_CUSTOMER',
});

export function snowflakeProfileTableForIndustry(industry) {
  return SNOWFLAKE_PROFILE_TABLE_BY_INDUSTRY[String(industry || 'travel').trim().toLowerCase()] || null;
}
