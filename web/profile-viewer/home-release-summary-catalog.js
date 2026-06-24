/**
 * Bundled Experience Cloud release catalog for home-new.html (until /api/release-notes/summary ships).
 */
(function attachHomeReleaseCatalog(global) {
  'use strict';

  var AJO_CURRENT_URL =
    'https://experienceleague.adobe.com/en/docs/journey-optimizer/using/whats-new/release-notes';
  var AJO_PREVIOUS_URL =
    'https://experienceleague.adobe.com/en/docs/journey-optimizer/using/whats-new/previous-rn-new/release-notes-2026';
  var CAMPAIGN_V8_WEB_URL =
    'https://experienceleague.adobe.com/en/docs/campaign-web/v8/release-notes/whats-new';

  var JUNE_PRODUCTS = {
    cdp: {
      id: 'cdp',
      name: 'Real-Time CDP',
      shortName: 'CDP',
      releaseNotesUrl:
        'https://experienceleague.adobe.com/en/docs/experience-platform/release-notes/latest',
      highlights: [
        { title: 'When to Activate', body: 'Control which profile change types trigger destination exports.', badge: 'Beta' },
        { title: 'Azure Private Link', body: 'Route exports to Azure Blob, ADLS Gen2, and Event Hubs over private IPs.', badge: 'GA' },
        { title: 'Persistent Split', body: 'Persistent vs random percentage splits in Audience Composition.', badge: 'GA' },
        { title: 'LAVA Source', body: 'Ingest loyalty and engagement data into Real-Time Customer Profile.', badge: 'GA' },
        { title: 'Schema Inventory Enhancements', body: 'Metadata columns, filtering, tags, folders, and inline management actions.', badge: 'GA' },
        { title: 'Google Ad Manager 360', body: 'Destination moved from beta to generally available.', badge: 'GA' },
        { title: 'Export Arrays as Enrichment', body: 'Export array fields to cloud storage as separate JSON or Parquet columns.', badge: 'Beta' },
        { title: 'Auto-Disable Failed Dataflows', body: 'Sources failing continuously for 30 days are automatically disabled.', badge: 'GA' },
      ],
      sections: [
        {
          title: 'Destinations & Activation',
          items: [
            { title: 'When to Activate', body: 'Control which profile change types trigger exports.', badge: 'Beta' },
            { title: 'Azure Private Link', body: 'Route exports to Azure Blob, ADLS Gen2, and Event Hubs over private IPs.', badge: 'GA' },
            { title: 'Google Ad Manager 360', body: 'Destination moved from beta to GA.', badge: 'GA' },
          ],
        },
        {
          title: 'Data, Profiles & Operations',
          items: [
            { title: 'Persistent Split', body: 'Choose persistent or random percentage splits in Audience Composition.', badge: 'GA' },
            { title: 'LAVA Source', body: 'Ingest loyalty and engagement data from LAVA into Real-Time Customer Profile.', badge: 'GA' },
            { title: 'Schema Inventory Enhancements', body: 'Metadata columns, enhanced filtering, tags, folders, and inline management.', badge: 'GA' },
          ],
        },
      ],
    },
    ajoJ: {
      id: 'ajoJ',
      name: 'Journey Optimizer — Journeys',
      shortName: 'AJO-J',
      releaseNotesUrl: AJO_CURRENT_URL + '#june-26-journeys',
      highlights: [
        { title: 'Journey Simulation', body: 'Validate journey logic with simulated users and events — now GA with Journey Agent support in the Simulation menu.', badge: 'GA' },
        { title: 'Journey Fragments', body: 'Reusable node sets stored in Fragment Inventory and insertable across any journey.', badge: 'GA' },
        { title: 'Journey path optimization — Targeting', body: 'Optimize activity supports targeting rules on audience segments and profile attributes.', badge: 'GA' },
        { title: 'AI Assistant for Journey Expressions', body: 'Natural-language prompts in the advanced expression editor generate ready-to-use journey logic.', badge: 'Beta' },
        { title: 'Stop a paused journey directly', body: 'Paused journeys can move to Stopped without resuming to Live first.', badge: 'GA' },
        { title: 'Supplemental identifier support for external audiences', body: 'CSV and Federated Audience Composition audiences support supplemental IDs in journeys.', badge: 'GA' },
        { title: 'Automatic stop for non-recurring Read Audience journeys', body: 'Journeys stop when the last profile exits instead of waiting for the 91-day timeout.', badge: 'GA' },
        { title: 'Increased live journey limit', body: 'Up to 200 active journeys (from 100), rolling out across regions.', badge: 'GA' },
      ],
      sections: [
        {
          title: 'Journeys',
          items: [
            { title: 'Journey Simulation', body: 'Simulation mode with temporary profiles; Journey Agent can generate simulated users and events.', badge: 'GA' },
            { title: 'Journey Fragments', body: 'Reusable eligibility, routing, and welcome sequences with sandbox tooling export.', badge: 'GA' },
            { title: 'Journey path optimization — Targeting', body: 'Deterministic routing by segment or profile attribute in Optimize activities.', badge: 'GA' },
            { title: 'AI Assistant for Journey Expressions', body: 'Plain-language expression generation in the advanced editor.', badge: 'Beta' },
            { title: 'Certificate-Based Custom Authentication', body: 'Custom actions support JWT client assertion via Adobe-managed certificate.', badge: 'GA' },
            { title: 'Increased live journey limit', body: '200 active journeys with new guardrails.', badge: 'GA' },
          ],
        },
      ],
    },
    ajoC: {
      id: 'ajoC',
      name: 'Journey Optimizer — Orchestrated Campaigns',
      shortName: 'AJO-C',
      releaseNotesUrl: AJO_CURRENT_URL + '#june-26-oc',
      highlights: [
        { title: 'File-based targeting in Orchestrated campaigns', body: 'Load CSV/TXT directly on the canvas without ingesting into AEP first.', badge: 'LA' },
        { title: 'Loop-based personalization for relational data', body: 'Loop block iterates orders, accounts, or bookings in email and SMS.', badge: 'Soon' },
      ],
      sections: [
        {
          title: 'Orchestrated campaigns',
          items: [
            { title: 'File-based targeting', body: 'CSV/TXT audience at execution time with column mapping and validation policies.', badge: 'LA' },
            { title: 'Loop-based personalization for relational data', body: 'Personalization editor Loop block for relational collections.', badge: 'Soon' },
          ],
        },
      ],
    },
    ajoDecisioning: {
      id: 'ajoDecisioning',
      name: 'Journey Optimizer — Decisioning',
      shortName: 'Decisioning',
      releaseNotesUrl: AJO_CURRENT_URL + '#june-26-decisioning',
      highlights: [
        { title: 'Decisioning support in Direct Mail channel', body: 'Decision policies in Direct Mail journeys and campaigns with batch export.', badge: 'GA' },
        { title: 'AEM content fragments in Decisioning', body: 'Map AEM fragments to decision items inside decision policies — now GA.', badge: 'GA' },
        { title: 'Dynamic item attributes', body: 'Personalize decision item custom attributes at delivery time.', badge: 'Soon' },
      ],
      sections: [
        {
          title: 'Decisioning',
          items: [
            { title: 'Decisioning support in Direct Mail channel', body: 'Offer policies in Direct Mail with batch decisioning for audience export.', badge: 'GA' },
            { title: 'AEM content fragments in Decisioning', body: 'Fragment mapping in decision policies for delivery-time content.', badge: 'GA' },
            { title: 'Dynamic item attributes', body: 'Profile, contextual, and audience data personalize item attributes at send time.', badge: 'Soon' },
          ],
        },
      ],
    },
    ajo: {
      id: 'ajo',
      name: 'Journey Optimizer',
      shortName: 'AJO',
      releaseNotesUrl: AJO_CURRENT_URL,
      highlights: [
        { title: 'Simulate content variations', body: 'Default simulate path plus AI-generated content variants for proofing.', badge: 'GA' },
        { title: 'AEM Content Fragments enhancements', body: 'Multi-config fetch, locale/variation support, and Managed Services repositories.', badge: 'GA' },
        { title: 'URL parameter encryption', body: 'Encrypt URL parameters in email tracking and landing page links.', badge: 'GA' },
        { title: 'Estimated Clicks metric', body: 'Filters bot and NHI traffic for genuine engagement reporting.', badge: 'GA' },
        { title: 'LINE channel', body: 'Multiple formats, real-time previews, grouped messages up to five.', badge: 'Soon' },
        { title: 'Webhook support for API campaigns', body: 'Configure webhook URL for real-time per-message status updates.', badge: 'GA' },
        { title: 'AI Assistant for content generation', body: 'Firefly image editing, stronger brand extraction, and CAI support.', badge: 'GA' },
        { title: 'Reporting hub improvements', body: 'Unified reporting across journeys, campaigns, and channels.', badge: 'GA' },
      ],
      sections: [
        {
          title: 'Content management',
          items: [
            { title: 'Simulate content variations', body: 'Single-screen simulate workflow with CSV/JSON input and AI variant generation.', badge: 'GA' },
            { title: 'AEM Content Fragments in Journey Optimizer', body: 'Lifecycle page, sync status, locale/variation, and repository switching.', badge: 'GA' },
            { title: 'AI Assistant + AEM Asset Essentials', body: 'Brand-approved images fetched automatically when generating content.', badge: 'GA' },
          ],
        },
        {
          title: 'Email channel',
          items: [
            { title: 'URL parameter encryption', body: 'Additional security for sensitive tracking parameters.', badge: 'GA' },
            { title: 'Automated technical validation', body: 'Checks for unsupported HTML/CSS, Outlook issues, and Gmail size thresholds.', badge: 'GA' },
          ],
        },
        {
          title: 'Channels & reporting',
          items: [
            { title: 'LINE channel', body: 'Rich LINE messages with grouped delivery.', badge: 'Soon' },
            { title: 'Estimated Clicks metric', body: 'Genuine engagement view across Journeys, Campaigns, and Channel reports.', badge: 'GA' },
            { title: 'Webhook support for API campaigns', body: 'Real-time delivery status callbacks.', badge: 'GA' },
          ],
        },
      ],
    },
    cja: {
      id: 'cja',
      name: 'Customer Journey Analytics',
      shortName: 'CJA',
      releaseNotesUrl: 'https://experienceleague.adobe.com/en/docs/analytics-platform/using/releases/release-notes',
      highlights: [
        { title: 'Journey Canvas Enhancements', body: 'Exclude nodes; create segments and audiences from fallout data.', badge: 'GA' },
        { title: 'Mobile App Support', body: 'Content Analytics for iOS and Android image assets.', badge: 'GA' },
        { title: 'Analytics MCP Servers', body: 'Connect MCP clients to CJA for agentic workflows.', badge: 'GA' },
        { title: 'Data Mirror', body: 'Model-based schemas and CDC for Snowflake, Databricks, and BigQuery.', badge: 'Beta' },
        { title: 'Analyze AEP Audiences in CJA', body: 'Ingest audience membership from AEP Profile datasets.', badge: 'GA' },
        { title: 'Bulk Project Migration', body: 'Migrate up to 20 Adobe Analytics projects to CJA at once.', badge: 'GA' },
        { title: 'Real-Time Reporting', body: 'Data and visualizations update in real time within Analysis Workspace.', badge: 'GA' },
        { title: 'Attribution IQ', body: 'Improved drag-and-drop, redesigned tooltips, and click-to-analyze menu.', badge: 'GA' },
      ],
      sections: [
        {
          title: 'Analysis Workspace',
          items: [
            { title: 'Journey Canvas Enhancements', body: 'Exclude nodes; use fallout data to create segments, trends, audiences, and breakdowns.', badge: 'GA' },
            { title: 'Attribution IQ', body: 'Improved drag-and-drop and redesigned tooltips for touchpoint analysis.', badge: 'GA' },
          ],
        },
        {
          title: 'Data & Migration',
          items: [
            { title: 'Analyze AEP Audiences in CJA', body: 'Ingest audience membership data from AEP Profile datasets.', badge: 'GA' },
            { title: 'Bulk Project Migration', body: 'Migrate up to 20 AA projects to CJA at once.', badge: 'GA' },
          ],
        },
      ],
    },
    campaign: {
      id: 'campaign',
      name: 'Campaign v8 Web UI',
      shortName: 'Campaign',
      releaseNotesUrl: CAMPAIGN_V8_WEB_URL,
      highlights: [
        { title: 'Multilingual delivery', body: 'Multiple languages and CSV bulk upload for message variants in Web UI.', badge: 'GA' },
        { title: 'Content experiments / A/B testing', body: 'Test subject lines, sender names, and email body variants.', badge: 'GA' },
        { title: 'AEM Live & language copies', body: 'Access AEM copies directly in Campaign with real-time content refresh.', badge: 'GA' },
        { title: 'Profile enrichment', body: 'Link Campaign DB fields to transactional messages for personalization.', badge: 'GA' },
        { title: 'Rich push notifications', body: 'Expanded push formats and preview in the Web UI composer.', badge: 'GA' },
        { title: 'Deliverability dashboard', body: 'Inbox placement and reputation signals in the Web UI.', badge: 'GA' },
        { title: 'Snowflake & Databricks OAuth2', body: 'Modern OAuth2 authentication for federated data access from Web UI workflows.', badge: 'GA' },
        { title: 'IMS session reliability', body: 'Improved login stability for Web UI operators.', badge: 'Fix' },
      ],
      sections: [
        {
          title: 'Campaign v8 Web UI',
          items: [
            { title: 'Multilingual delivery', body: 'Language variants and CSV bulk upload in the Web UI.', badge: 'GA' },
            { title: 'Content experiments / A/B testing', body: 'Subject line, sender, and body variant tests.', badge: 'GA' },
            { title: 'AEM Live & language copies', body: 'Real-time AEM content in Campaign Web UI.', badge: 'GA' },
            { title: 'Profile enrichment', body: 'Campaign DB fields in transactional personalization.', badge: 'GA' },
          ],
        },
      ],
    },
    brandConcierge: {
      id: 'brandConcierge',
      name: 'Brand Concierge',
      shortName: 'Concierge',
      releaseNotesUrl: 'https://experienceleague.adobe.com/en/docs/brand-concierge/using/release-notes',
      highlights: [
        { title: 'Real-Time CDP Integration', body: 'Connect Brand Concierge with Real-Time CDP for profile-aware conversations.', badge: 'GA' },
        { title: 'Self-Serve Tuning Enhancement', body: 'Fine-tune concierge responses without engineering support.', badge: 'GA' },
        { title: 'Context-Aware Product Recommendation', body: 'Recommend products using live session and profile context.', badge: 'GA' },
        { title: 'CX Enterprise Coworker', body: 'Agentic workflows for audiences and campaigns with built-in governance.', badge: 'New' },
        { title: 'AI Monitoring Dashboards', body: 'Track adoption, conversations, feedback, and AI credit consumption.', badge: 'GA' },
        { title: 'Side-by-Side Comparison', body: 'Compare product options within the concierge experience.', badge: 'GA' },
        { title: 'Support Agent', body: 'Troubleshooting and how-to guidance surfaced in chat.', badge: 'GA' },
        { title: 'Agentic AI Capability Catalog', body: 'Discover agentic AI jobs available in licensed CX Enterprise apps.', badge: 'New' },
      ],
      sections: [
        {
          title: 'Product & Integrations',
          items: [
            { title: 'Real-Time CDP Integration', body: 'Unified personalization with Real-Time CDP profiles.', badge: 'GA' },
            { title: 'Self-Serve Tuning Enhancement', body: 'Operators tune concierge behaviour without code.', badge: 'GA' },
          ],
        },
        {
          title: 'Agentic AI',
          items: [
            { title: 'CX Enterprise Coworker', body: 'Automates end-to-end CX workflows with governance.', badge: 'New' },
            { title: 'AI Monitoring', body: 'Dashboards for agentic AI usage and AI credits.', badge: 'GA' },
          ],
        },
      ],
    },
    brandVisibility: {
      id: 'brandVisibility',
      name: 'Brand Visibility',
      shortName: 'Visibility',
      releaseNotesUrl: 'https://experienceleague.adobe.com/en/docs/llm-optimizer/using/release-notes',
      highlights: [
        { title: 'Google Analytics Integration', body: 'Connect GA data to measure brand presence in AI surfaces.', badge: 'GA' },
        { title: 'Brand Presence Enhancements', body: 'Richer visibility scoring across generative answer engines.', badge: 'GA' },
        { title: 'Opportunities CSV Export', body: 'Export opportunity findings for offline analysis and reporting.', badge: 'GA' },
        { title: 'LLM Answer Tracking', body: 'Monitor how models cite and summarise your brand over time.', badge: 'Beta' },
        { title: 'Competitive Benchmarks', body: 'Compare share of voice against key competitors in AI responses.', badge: 'Beta' },
        { title: 'Scheduled Reports', body: 'Email digest of visibility shifts and new opportunities.', badge: 'GA' },
        { title: 'Prompt Library Templates', body: 'Starter prompts aligned to vertical use cases and journeys.', badge: 'GA' },
        { title: 'API Access', body: 'Programmatic read access for dashboards and internal tooling.', badge: 'Beta' },
      ],
      sections: [
        {
          title: 'Measurement & Insights',
          items: [
            { title: 'Google Analytics Integration', body: 'Import web analytics to enrich brand visibility scoring.', badge: 'GA' },
            { title: 'Brand Presence Enhancements', body: 'Expanded scoring dimensions for generative search.', badge: 'GA' },
          ],
        },
      ],
    },
    target: {
      id: 'target',
      name: 'Adobe Target',
      shortName: 'Target',
      releaseNotesUrl: 'https://experienceleague.adobe.com/en/docs/target/using/release-notes/release-notes',
      highlights: [
        { title: 'Activity Overview URL Fix', body: 'Incomplete activity URL on Activity Overview resolved.', badge: 'Fix' },
        { title: 'Localized Activity Reports', body: 'Date formats in Activity reports now respect locale settings.', badge: 'Fix' },
        { title: 'Form-based Activity Save', body: 'GB18030 characters in Location no longer block save.', badge: 'Fix' },
        { title: 'Audience Calendar Localization', body: 'Create Audience flow calendar now fully localized.', badge: 'Fix' },
        { title: 'AEP Audience Activation', body: 'Tighter handoff from Real-Time CDP segments to Target activities.', badge: 'GA' },
        { title: 'Recommendations Diagnostics', body: 'Clearer health signals for catalog and algorithm issues.', badge: 'GA' },
        { title: 'Personalization at Scale', body: 'Improved activity QA workflows for enterprise rollouts.', badge: 'GA' },
        { title: 'Admin Role Controls', body: 'Granular permissions for activity publish and archive.', badge: 'GA' },
      ],
      sections: [
        {
          title: 'Activities & Reporting',
          items: [
            { title: 'Activity Overview URL Fix', body: 'Resolves incomplete URLs on Activity Overview.', badge: 'Fix' },
            { title: 'Localized Activity Reports', body: 'Locale-aware date formats in reports.', badge: 'Fix' },
          ],
        },
      ],
    },
  };

  var MAY_AJO_PRODUCTS = {
    ajoJ: {
      id: 'ajoJ',
      name: 'Journey Optimizer — Journeys',
      shortName: 'AJO-J',
      releaseNotesUrl: AJO_PREVIOUS_URL + '#may-26-journeys',
      highlights: [
        { title: 'Journey re-entry controls', body: 'Fine-grained re-entry rules for recurring and event-triggered journeys.', badge: 'GA' },
        { title: 'Read audience batch sizing', body: 'Configurable batch sizes for large audience read steps.', badge: 'GA' },
        { title: 'Journey version compare', body: 'Side-by-side diff of journey canvas versions.', badge: 'Beta' },
        { title: 'Custom action timeout tuning', body: 'Per-action timeout and retry policies in journey settings.', badge: 'GA' },
      ],
      sections: [
        {
          title: 'Journeys — May 2026',
          items: [
            { title: 'Journey re-entry controls', body: 'Re-entry windows and caps per profile.', badge: 'GA' },
            { title: 'Read audience batch sizing', body: 'Tune throughput for million-profile audiences.', badge: 'GA' },
            { title: 'Journey version compare', body: 'Compare published vs draft canvas versions.', badge: 'Beta' },
          ],
        },
      ],
    },
    ajoC: {
      id: 'ajoC',
      name: 'Journey Optimizer — Orchestrated Campaigns',
      shortName: 'AJO-C',
      releaseNotesUrl: AJO_PREVIOUS_URL + '#may-26-oc',
      highlights: [
        { title: 'Campaign calendar view', body: 'Month grid for scheduled orchestrated campaigns.', badge: 'GA' },
        { title: 'Approval workflow templates', body: 'Reusable approval chains for campaign publish.', badge: 'Beta' },
      ],
      sections: [
        {
          title: 'Orchestrated campaigns — May 2026',
          items: [
            { title: 'Campaign calendar view', body: 'Visual schedule of live and upcoming campaigns.', badge: 'GA' },
            { title: 'Approval workflow templates', body: 'Standardise marketing sign-off paths.', badge: 'Beta' },
          ],
        },
      ],
    },
    ajoDecisioning: {
      id: 'ajoDecisioning',
      name: 'Journey Optimizer — Decisioning',
      shortName: 'Decisioning',
      releaseNotesUrl: AJO_PREVIOUS_URL + '#may-26-decisioning',
      highlights: [
        { title: 'Offer frequency capping', body: 'Cap impressions per profile across channels in decision policies.', badge: 'GA' },
        { title: 'Ranking formula library', body: 'Save and reuse ranking formulas across sandboxes.', badge: 'GA' },
      ],
      sections: [
        {
          title: 'Decisioning — May 2026',
          items: [
            { title: 'Offer frequency capping', body: 'Cross-channel caps in decision policies.', badge: 'GA' },
            { title: 'Ranking formula library', body: 'Shared formula inventory with sandbox tooling.', badge: 'GA' },
          ],
        },
      ],
    },
    ajo: {
      id: 'ajo',
      name: 'Journey Optimizer',
      shortName: 'AJO',
      releaseNotesUrl: AJO_PREVIOUS_URL,
      highlights: [
        { title: 'Email proofing refresh', body: 'Faster inbox rendering previews for multi-locale proofs.', badge: 'GA' },
        { title: 'SMS link tracking', body: 'Short-link analytics in channel reporting.', badge: 'GA' },
        { title: 'Content template versioning', body: 'Version history and rollback for AJO templates.', badge: 'Beta' },
      ],
      sections: [
        {
          title: 'Content & channels — May 2026',
          items: [
            { title: 'Email proofing refresh', body: 'Improved multi-locale proof rendering.', badge: 'GA' },
            { title: 'SMS link tracking', body: 'Engagement metrics for tracked short links.', badge: 'GA' },
            { title: 'Content template versioning', body: 'Rollback to prior template versions.', badge: 'Beta' },
          ],
        },
      ],
    },
  };

  function mergeProducts(base, overlay) {
    var out = {};
    var key;
    for (key in base) {
      if (Object.prototype.hasOwnProperty.call(base, key)) out[key] = base[key];
    }
    for (key in overlay) {
      if (Object.prototype.hasOwnProperty.call(overlay, key)) out[key] = overlay[key];
    }
    return out;
  }

  global.HomeReleaseCatalog = {
    productOrder: [
      'cdp',
      'ajoJ',
      'ajoC',
      'ajoDecisioning',
      'ajo',
      'cja',
      'campaign',
      'brandConcierge',
      'brandVisibility',
      'target',
    ],
    defaultPeriodId: 'june-2026',
    periodOrder: ['june-2026', 'may-2026'],
    periods: {
      'june-2026': {
        id: 'june-2026',
        label: 'June 2026 (current)',
        period: 'June 2026',
        fetchedAt: '2026-06-19T14:32:00.000Z',
        sourceUrl:
          'https://experienceleague.adobe.com/en/docs/release-notes/experience-cloud/current',
        products: JUNE_PRODUCTS,
      },
      'may-2026': {
        id: 'may-2026',
        label: 'May 2026',
        period: 'May 2026',
        fetchedAt: '2026-05-15T10:00:00.000Z',
        sourceUrl: AJO_PREVIOUS_URL,
        products: mergeProducts(JUNE_PRODUCTS, MAY_AJO_PRODUCTS),
      },
    },
  };
})(window);
