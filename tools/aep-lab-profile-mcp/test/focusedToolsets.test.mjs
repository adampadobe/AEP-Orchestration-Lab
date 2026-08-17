import assert from 'node:assert/strict';
import test from 'node:test';

import {
  registerConfirmProfileGenerationTool,
  registerGenerationPrefsTools,
} from '../src/tools/generationPrefs.mjs';
import { registerFocusedAjoCleanupTools, registerFocusedDemoPrepTools, registerFocusedMcpGuideTools, registerFocusedPdfTools, registerFocusedProfileTools, registerProfileTools } from '../src/tools/index.mjs';

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
  ]);
});

test('focused demo-prep endpoint contains scrape, stable assets, RTDB and orchestration only', () => {
  const focused = registrationRecorder();
  registerFocusedDemoPrepTools(focused.server);
  assert.equal(focused.names.length, 20);
  assert.deepEqual(focused.names.slice(-10), [
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
  assert.equal(full.names.length, 112);
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

test('focused guide endpoint is access plus three read-only advisory tools', () => {
  const { names, server } = registrationRecorder();
  registerFocusedMcpGuideTools(server);
  assert.deepEqual(names, [
    'lab_mcp_access_info',
    'lab_mcp_contexts',
    'lab_mcp_recommend_context',
    'lab_mcp_workflow',
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
