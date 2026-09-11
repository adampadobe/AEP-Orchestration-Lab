import assert from 'node:assert/strict';
import test from 'node:test';

import {
  registerConfirmProfileGenerationTool,
  registerGenerationPrefsTools,
} from '../src/tools/generationPrefs.mjs';
import { registerFocusedAdobeCapabilityTools, registerFocusedAjoCleanupTools, registerFocusedCommerceOptimizerTools, registerFocusedCommerceTools, registerFocusedCreativityTools, registerFocusedDemoPrepTools, registerFocusedFireflyTools, registerFocusedMcpGuideTools, registerFocusedMeasurementQualityTools, registerFocusedPdfTools, registerFocusedProfileTools, registerFocusedWeatherTools, registerProfileTools } from '../src/tools/index.mjs';

function registrationRecorder() {
  const names = [];
  return {
    names,
    server: {
      registerTool(name) {
        names.push(name);
      },
    },
  };
}

test('full generation preferences registration remains backward compatible', () => {
  const { names, server } = registrationRecorder();
  registerGenerationPrefsTools(server);
  assert.deepEqual(names, [
    'lab_get_generation_prefs',
    'lab_set_generation_prefs',
    'lab_confirm_generation_plan',
    'lab_confirm_profile_generation',
  ]);
});

test('focused profile registration can expose only the confirmation gate', () => {
  const { names, server } = registrationRecorder();
  registerConfirmProfileGenerationTool(server);
  assert.deepEqual(names, ['lab_confirm_profile_generation']);
});

test('focused profile endpoint exposes the complete governed profile lifecycle', () => {
  const { names, server } = registrationRecorder();
  registerFocusedProfileTools(server);
  assert.deepEqual(names, [
    'lab_mcp_access_info',
    'lab_list_industries',
    'lab_profile_infra_status',
    'lab_preflight_profile_generate',
    'lab_confirm_profile_generation',
    'lab_generate_profile',
    'lab_lookup_profile',
    'lab_get_profile',
    'lab_update_profile',
    'lab_profile_activity',
    'lab_list_event_targets',
    'lab_preflight_profile_event',
    'lab_send_profile_event',
    'lab_send_profile_events_batch',
    'lab_send_retail_journey_events',
    'lab_snowflake_config',
    'lab_snowflake_test_connection',
    'lab_snowflake_get_profile_by_email',
    'lab_snowflake_enrich_profiles',
    'lab_snowflake_get_profile_bundle',
    'lab_run_playbook',
  ]);
});

test('focused demo-prep endpoint contains scrape, stable assets, RTDB and orchestration only', () => {
  const focused = registrationRecorder();
  registerFocusedDemoPrepTools(focused.server);
  assert.equal(focused.names.length, 21);
  assert.deepEqual(focused.names.slice(-11), [
    'lab_brand_scrape_classify_images',
    'lab_demo_customer_switch',
    'lab_demo_assets_inspect',
    'lab_demo_assets_preview_from_scrape',
    'lab_demo_assets_apply',
    'lab_demo_assets_restore',
    'lab_demo_config_inspect',
    'lab_demo_config_preview',
    'lab_demo_config_apply',
    'lab_demo_config_restore',
    'lab_prepare_demo_from_brand_scrape',
  ]);
  assert.equal(focused.names.includes('lab_brand_scrape'), true);
  assert.equal(focused.names.includes('lab_generate_profile'), false);

  const full = registrationRecorder();
  registerProfileTools(full.server);
  assert.equal(full.names.length, 196);
  for (const tool of focused.names) assert.equal(full.names.includes(tool), true, `${tool} should remain in the full MCP`);
});

test('focused PDF endpoint contains access plus the complete PDF preparation lifecycle', () => {
  const focused = registrationRecorder();
  registerFocusedPdfTools(focused.server);
  assert.equal(focused.names.length, 14);
  assert.deepEqual(focused.names, [
    'lab_mcp_access_info',
    'lab_pdf_capabilities', 'lab_pdf_draft_list', 'lab_pdf_draft_get', 'lab_pdf_draft_save',
    'lab_pdf_extract_docx_data', 'lab_pdf_html_preview', 'lab_pdf_generate',
    'lab_pdf_job_list', 'lab_pdf_job_status', 'lab_pdf_server_template_list',
    'lab_pdf_server_template_analyse', 'lab_pdf_server_template_publish', 'lab_pdf_server_template_archive',
  ]);
  const full = registrationRecorder();
  registerProfileTools(full.server);
  for (const tool of focused.names.slice(1)) assert.equal(full.names.includes(tool), true, `${tool} should remain in the full MCP`);
});

test('focused entry endpoint is access plus advisory tools and lab_load_toolset', () => {
  const { names, server } = registrationRecorder();
  registerFocusedMcpGuideTools(server);
  assert.deepEqual(names, [
    'lab_mcp_access_info',
    'lab_mcp_contexts',
    'lab_mcp_recommend_context',
    'lab_mcp_workflow',
    'lab_load_toolset',
  ]);
});

test('focused AJO cleanup endpoint contains access plus six governed tools', () => {
  const focused = registrationRecorder();
  registerFocusedAjoCleanupTools(focused.server);
  assert.deepEqual(focused.names, [
    'lab_mcp_access_info',
    'lab_ajo_journey_list', 'lab_ajo_journey_audit', 'lab_ajo_journey_delete',
    'lab_ajo_campaign_list', 'lab_ajo_campaign_audit', 'lab_ajo_campaign_delete',
  ]);
});

test('focused weather endpoint is access plus current, forecast, and map lookups', () => {
  const { names, server } = registrationRecorder();
  registerFocusedWeatherTools(server);
  assert.deepEqual(names, ['lab_mcp_access_info', 'lab_weather_current', 'lab_weather_forecast', 'lab_weather_map']);
});

test('focused Firefly endpoint exposes access plus governed image, video, and audio operations', () => {
  const { names, server } = registrationRecorder();
  registerFocusedFireflyTools(server);
  assert.deepEqual(names, [
    'lab_mcp_access_info',
    'lab_firefly_capabilities', 'lab_firefly_generate_preview', 'lab_firefly_generate_apply',
    'lab_firefly_generate_video_preview', 'lab_firefly_generate_video_apply',
    'lab_firefly_audio_voice_list',
    'lab_firefly_audio_speech_preview', 'lab_firefly_audio_speech_apply',
    'lab_firefly_audio_transcribe_preview', 'lab_firefly_audio_transcribe_apply',
    'lab_firefly_audio_dub_preview', 'lab_firefly_audio_dub_apply',
    'lab_firefly_job_status', 'lab_firefly_job_cancel',
  ]);
});

test('focused creativity endpoint exposes governed production APIs without duplicating Firefly', () => {
  const { names, server } = registrationRecorder();
  registerFocusedCreativityTools(server);
  assert.deepEqual(names, [
    'lab_mcp_access_info', 'lab_creativity_capabilities', 'lab_creativity_access_probe',
    'lab_creativity_photoshop_edit_preview', 'lab_creativity_photoshop_edit_apply',
    'lab_creativity_indesign_merge_preview', 'lab_creativity_indesign_merge_apply',
    'lab_creativity_substance_render_preview', 'lab_creativity_substance_render_apply',
    'lab_creativity_express_documents', 'lab_creativity_express_document_get',
    'lab_creativity_express_variation_preview', 'lab_creativity_express_variation_apply',
    'lab_creativity_illustrator_trace_preview', 'lab_creativity_illustrator_trace_apply',
    'lab_creativity_job_status',
  ]);
  assert.equal(names.some((name) => name.startsWith('lab_firefly_')), false);
});

test('focused Adobe capabilities endpoint is read-only inventory plus bounded probes', () => {
  const { names, server } = registrationRecorder();
  registerFocusedAdobeCapabilityTools(server);
  assert.deepEqual(names, [
    'lab_mcp_access_info', 'adobe_api_catalog', 'ajo_suppression_addresses', 'genstudio_experience_list',
  ]);
});

test('focused measurement quality endpoint contains access plus five read-only diagnostics', () => {
  const { names, server } = registrationRecorder();
  registerFocusedMeasurementQualityTools(server);
  assert.deepEqual(names, [
    'lab_mcp_access_info', 'assurance_session_list', 'assurance_event_inspect',
    'launch_property_audit', 'launch_environment_list', 'status_incident_correlate',
  ]);
});

test('focused Commerce Optimizer endpoint is access plus fourteen governed tools', () => {
  const { names, server } = registrationRecorder();
  registerFocusedCommerceOptimizerTools(server);
  assert.deepEqual(names, [
    'lab_mcp_access_info',
    'commerce_optimizer_access_info', 'commerce_optimizer_capabilities', 'commerce_optimizer_view_check',
    'commerce_optimizer_attribute_metadata', 'commerce_optimizer_product_search', 'commerce_optimizer_product_get',
    'commerce_optimizer_category_tree', 'commerce_optimizer_navigation', 'commerce_optimizer_recommendations',
    'commerce_optimizer_graphql_query', 'commerce_optimizer_ingestion_change_preview',
    'commerce_optimizer_ingestion_change_apply', 'commerce_optimizer_ingestion_delete_audit',
    'commerce_optimizer_ingestion_delete_apply',
  ]);
});

test('focused Commerce endpoint exposes access plus eighteen storefront-prep tools', () => {
  const focused = registrationRecorder();
  registerFocusedCommerceTools(focused.server);
  assert.deepEqual(focused.names, [
    'lab_mcp_access_info',
    'commerce_access_info', 'commerce_capabilities', 'commerce_store_configs', 'commerce_catalog_summary',
    'commerce_product_search', 'commerce_product_get', 'commerce_category_tree', 'commerce_inventory_status',
    'commerce_product_attributes', 'commerce_inventory_sources', 'commerce_product_media', 'commerce_category_products',
    'commerce_graphql_schema', 'commerce_graphql_query', 'commerce_admin_change_preview', 'commerce_admin_change_apply',
    'commerce_admin_delete_audit', 'commerce_admin_delete_apply',
  ]);
});
