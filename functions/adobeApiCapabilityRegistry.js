'use strict';

const BASE_IMS_SCOPES = Object.freeze([
  'AdobeID',
  'openid',
  'additional_info.projectedProductContext',
  'read_organizations',
]);

function capability(id, name, group, scopes, phase, risk, useCases) {
  return Object.freeze({ id, name, group, scopes: Object.freeze(scopes), phase, risk, useCases: Object.freeze(useCases) });
}

/**
 * Reviewed Adobe Developer Console inventory for the Demo Emea AJO project.
 * This is deliberately a versioned code snapshot, not a claim of live tenant access.
 */
const ADOBE_API_CAPABILITIES = Object.freeze([
  capability('aem-sites-content-management', 'AEM Cloud Service Sites Content Management', 'content', ['aem.folders', 'aem.fragments.management'], 3, 'write-capable', ['Synchronize approved fragments into AEM Sites', 'Reuse governed content in AJO and web demos']),
  capability('adobe-campaign', 'Adobe Campaign', 'orchestration', ['campaign_sdk', 'campaign_config_server_general', 'deliverability_service_general'], 4, 'write-capable', ['Bridge Campaign delivery configuration and reporting', 'Support migration and coexistence demonstrations']),
  capability('io-management', 'Adobe I/O Management API', 'operations', ['adobeio_api', 'read_client_secret', 'manage_client_secrets'], 4, 'administrative', ['Inventory Console projects and integrations', 'Audit credential configuration without exposing secrets']),
  capability('firefly', 'Adobe Firefly API', 'creative', ['firefly_api', 'ff_apis'], 3, 'billable', ['Generate campaign imagery from an approved brief', 'Create governed creative variants for customer demos']),
  capability('experience-platform', 'Adobe Experience Platform API', 'orchestration', [], 1, 'mixed', ['Build profile and event context', 'Power audiences, consent, decisioning, and measurement']),
  capability('illustrator', 'Adobe Illustrator API', 'creative', ['firefly_api', 'ff_apis', 'indesign_services'], 4, 'billable', ['Create or adapt vector-led campaign assets', 'Automate branded production variants']),
  capability('smart-content', 'Adobe Smart Content', 'content', ['read_pc.dma_smart_content'], 4, 'read-only', ['Discover reusable smart content', 'Improve asset selection for personalization']),
  capability('journey-optimizer', 'Adobe Journey Optimizer', 'orchestration', ['cjm.suppression_service.client.all', 'cjm.suppression_service.client.delete'], 1, 'write-capable', ['Add pre-send suppression safety checks', 'Inspect allow-list readiness for controlled demos']),
  capability('adobe-express-beta', 'Adobe Express API (beta)', 'creative', ['ee.express_api'], 3, 'beta', ['Produce deterministic channel variants', 'Prototype editable personalized assets outside production']),
  capability('aem-dynamic-media', 'AEM Dynamic Media API', 'content', ['aem.assets.delivery'], 3, 'read-only', ['Deliver optimized renditions', 'Resolve channel-ready asset URLs']),
  capability('privacy-service', 'Adobe Privacy Service API', 'governance', [], 4, 'destructive', ['Create a separate governed data-subject-request workflow', 'Track access and delete request status']),
  capability('frame-io', 'Frame.io API', 'creative', ['frame.s2s.all'], 2, 'write-capable', ['Add human review and approval gates', 'Attach review evidence to campaign assets']),
  capability('audio-video-firefly', 'Adobe Firefly Audio and Video API', 'creative', ['firefly_api', 'ff_apis'], 4, 'billable', ['Generate or adapt motion and audio variants', 'Extend customer stories beyond static imagery']),
  capability('lightroom', 'Adobe Lightroom API', 'creative', [], 4, 'write-capable', ['Apply consistent photographic treatment', 'Prepare approved image renditions']),
  capability('fusion', 'Adobe Fusion', 'operations', [], 4, 'write-capable', ['Orchestrate external approvals and handoffs', 'Connect Adobe workflows to third-party systems']),
  capability('edge-delivery-services', 'AEM Edge Delivery Services', 'content', ['aem.frontend.all'], 3, 'write-capable', ['Publish fast demo landing experiences', 'Connect approved content to Edge Delivery sites']),
  capability('app-builder-data', 'Adobe App Builder Data Services', 'operations', ['adobeio.abdata.manage', 'adobeio.abdata.read', 'adobeio.abdata.write'], 4, 'write-capable', ['Store lightweight integration state', 'Cache cursors and deduplication records for events']),
  capability('target', 'Adobe Target', 'orchestration', ['target_sdk'], 3, 'write-capable', ['Activate profile and creative variants in experiments', 'Compare AJO and Target decision outcomes']),
  capability('photoshop', 'Adobe Photoshop API', 'creative', [], 3, 'billable', ['Apply production image edits', 'Create channel crops and template-driven variants']),
  capability('io-events', 'Adobe I/O Events', 'operations', ['event_receiver_api'], 2, 'event-driven', ['Replace polling with event-driven synchronization', 'Journal and replay integration events safely']),
  capability('commerce-accs', 'Adobe Commerce as a Cloud Service', 'commerce', ['commerce.accs'], 2, 'write-capable', ['Use live products, media, price, and inventory in demos', 'Validate shopper-facing personalization']),
  capability('aem-content-ai', 'AEM Content AI', 'content', ['contentai.api'], 3, 'ai-assisted', ['Enrich assets with content intelligence', 'Improve creative discovery and reuse']),
  capability('genstudio', 'GenStudio for Performance Marketing API', 'creative', ['aem.experimental'], 1, 'read-only', ['Select approved experiences inside Profile Viewer', 'Feed approved creative into AJO and Target workflows']),
  capability('commerce-optimizer-ingestion', 'Adobe Commerce Optimizer Ingestion', 'commerce', ['commerce.aco.ingestion'], 2, 'write-capable', ['Prepare governed demo catalogs', 'Ingest products, categories, prices, and product layers']),
  capability('pdf-services', 'Adobe PDF Services', 'creative', ['DCAPI'], 3, 'billable', ['Generate personalized journey attachments', 'Convert approved documents into delivery-ready PDFs']),
  capability('express-review', 'Adobe Express Review API', 'creative', [], 4, 'write-capable', ['Collect lightweight creative feedback', 'Track review state before activation']),
  capability('adobe-status', 'Adobe Status API', 'operations', [], 4, 'read-only', ['Surface relevant service incidents', 'Separate platform outages from integration defects']),
  capability('substance-3d', 'Adobe Substance 3D API', 'creative', ['firefly_api', 'ff_apis', 'substance.jobs.create', 'substance.spaces.create'], 4, 'billable', ['Create 3D product visualization workflows', 'Generate reusable product-scene assets']),
  capability('content-tagging', 'Adobe Content Tagging API', 'creative', ['firefly_api', 'ff_apis'], 3, 'ai-assisted', ['Auto-tag generated and approved assets', 'Improve search and rules-based asset selection']),
  capability('customer-journey-analytics', 'Customer Journey Analytics', 'measurement', ['read_pc.acp', 'read_pc.dma_tartan'], 3, 'read-only', ['Measure cross-channel journey performance', 'Close the loop from activation to insight']),
  capability('places', 'Adobe Places', 'orchestration', [], 4, 'write-capable', ['Add location context to mobile experiences', 'Trigger place-aware journey scenarios']),
  capability('assurance', 'Adobe Assurance API', 'measurement', ['assurance_manage_sessions', 'assurance_read_events', 'assurance_read_annotations', 'assurance_read_plugins', 'assurance_read_clients'], 3, 'write-capable', ['Validate mobile and Edge event flows', 'Capture evidence for demo troubleshooting']),
  capability('experience-platform-launch', 'Experience Platform Launch API', 'operations', [], 3, 'write-capable', ['Audit Tags properties and environments', 'Automate governed data-collection configuration']),
  capability('indesign', 'Adobe InDesign API', 'creative', ['creative_sdk', 'firefly_api', 'ff_apis'], 4, 'billable', ['Generate document variants at scale', 'Produce campaign collateral from structured content']),
  capability('aem-assets-author', 'AEM Assets Author API', 'content', ['aem.assets.author', 'aem.folders'], 3, 'write-capable', ['Publish approved assets into DAM', 'Maintain the campaign asset supply chain']),
]);

const TOKEN_PROFILES = Object.freeze({
  ajoSuppressionRead: Object.freeze([...BASE_IMS_SCOPES, 'cjm.suppression_service.client.all']),
  genstudioRead: Object.freeze([...BASE_IMS_SCOPES, 'aem.experimental']),
  assuranceSessionEventRead: Object.freeze([...BASE_IMS_SCOPES, 'assurance_manage_sessions', 'assurance_read_events']),
  adobeStatusRead: Object.freeze([...BASE_IMS_SCOPES]),
});

function capabilityCatalog() {
  const groups = {};
  const phases = {};
  for (const item of ADOBE_API_CAPABILITIES) {
    groups[item.group] = (groups[item.group] || 0) + 1;
    phases[item.phase] = (phases[item.phase] || 0) + 1;
  }
  return {
    ok: true,
    snapshot: { project: 'Demo Emea AJO', reviewedOn: '2026-09-11', source: 'Adobe Developer Console inventory' },
    evidenceModel: ['connected', 'token_issued', 'tenant_verified', 'operation_verified'],
    warning: 'A connected service or issued token does not by itself prove tenant entitlement. Run the bounded read-only probe for the intended operation.',
    implementation: {
      phase1: ['Capability and scope registry', 'AJO suppression and allow-list reads', 'GenStudio approved-experience discovery'],
      phase2: ['Frame.io approval gate', 'I/O Events synchronization', 'Commerce and Commerce Optimizer workflow composition'],
      phase3: ['Firefly Video generation', 'Assurance and Tags measurement diagnostics', 'Adobe Status incident correlation', 'Later creative and AEM adapters'],
      phase4: ['Administrative, beta, high-risk, and specialist APIs'],
    },
    totals: { services: ADOBE_API_CAPABILITIES.length, groups, phases },
    baseImsScopes: BASE_IMS_SCOPES,
    services: ADOBE_API_CAPABILITIES,
  };
}

module.exports = { BASE_IMS_SCOPES, ADOBE_API_CAPABILITIES, TOKEN_PROFILES, capabilityCatalog };
