/**
 * POST /api/events/generator body — mirrors web/profile-viewer/event-generator.js send handler
 * and mobile lab shells (starbucks-mobile-demo.js, ksia-mobile-demo.js).
 *
 * Event type is free text (datalist suggestions only). Backend buildEventGeneratorXdm passes
 * arbitrary eventType through to XDM.
 */

/** Default when event_type omitted — matches Event tool full Edge target (not minimal). */
export const PORTAL_DEFAULT_EVENT_TYPE = 'transaction';

/** Datalist suggestions from event-generator.html (not restrictions). */
export const EVENT_TYPE_SUGGESTIONS = Object.freeze([
  'form.formSubmit',
  'commerce.productViews',
  'commerce.order',
  'commerce.productListAdds',
  'commerce.productListViews',
  'commerce.cartAbandons',
  'event.registered',
  'transaction',
  'donation.made',
  'web.webPageDetails.pageViews',
]);

/**
 * @param {string | undefined | null} value
 */
function trimOrEmpty(value) {
  return value != null ? String(value).trim() : '';
}

/**
 * @param {string | undefined | null} ecid
 */
export function isValidGeneratorEcid(ecid) {
  const s = trimOrEmpty(ecid);
  return /^\d{10,}$/.test(s);
}

/**
 * Build camelCase POST body for /api/events/generator.
 *
 * @param {object} params
 * @param {string} [params.sandbox]
 * @param {string} [params.email]
 * @param {string} [params.ecid]
 * @param {string} [params.target_id]
 * @param {string} [params.event_type] — any custom string (portal free-text input)
 * @param {string} [params.view_name]
 * @param {string} [params.view_url]
 * @param {string} [params.channel]
 * @param {string} [params.event_id] — portal orchestrationEventID → eventID
 * @param {string} [params.orchestration_event_id] — alias for event_id
 * @param {string} [params.timestamp] — ISO-8601; also sets _id like portal
 * @param {Record<string, unknown>} [params.public]
 * @param {string} [params.industry] — when 'public', portal only attaches public from form; MCP includes public whenever set
 * @param {Record<string, unknown>} [params.message] — _demoemea.message.* (call centre demos)
 * @param {string} [params.xdm_tenant_key] — e.g. _demoemea (mobile demos)
 * @param {string} [params.identity_map_ecid_key] — default ECID
 * @param {string} [params.primary_identity] — email-primary guests
 * @param {boolean} [params.email_primary_identity]
 * @param {boolean} [params.edge_minimal] — when true (default), server sends minimal XDM unless rich fields present; when false, forces full tenant/channel FG alignment
 * @param {'minimal'|'full'} [params.xdm_style] — explicit XDM style override (full forces rich payload)
 * @returns {Record<string, unknown>}
 */
export function buildGeneratorPostBody(params = {}) {
  const emailTrim = trimOrEmpty(params.email);
  const eventTypeTrim = trimOrEmpty(params.event_type);
  const viewNameVal = trimOrEmpty(params.view_name);
  const viewUrlVal = trimOrEmpty(params.view_url);
  const channelVal = trimOrEmpty(params.channel);
  const ecidTrim = trimOrEmpty(params.ecid);
  const orchId = trimOrEmpty(params.event_id || params.orchestration_event_id);
  const tsIso = trimOrEmpty(params.timestamp);
  const targetId = trimOrEmpty(params.target_id);
  const sandbox = trimOrEmpty(params.sandbox);

  const edgeMinimal = params.edge_minimal !== false;
  const xdmStyleExplicit = trimOrEmpty(params.xdm_style).toLowerCase();
  const defaultEventType = edgeMinimal ? 'donation.made' : PORTAL_DEFAULT_EVENT_TYPE;

  /** @type {Record<string, unknown>} */
  const body = {
    eventType: eventTypeTrim || defaultEventType,
    viewName: viewNameVal,
    viewUrl: viewUrlVal,
  };

  if (sandbox) body.sandbox = sandbox;
  if (emailTrim) body.email = emailTrim;
  if (targetId) body.targetId = targetId;
  if (channelVal) body.channel = channelVal;
  if (isValidGeneratorEcid(ecidTrim)) body.ecid = ecidTrim;
  if (orchId) body.eventID = orchId;

  if (tsIso) {
    body.timestamp = tsIso;
    body._id = String(new Date(tsIso).getTime());
  }

  const pub = params.public;
  const hasPublic =
    pub && typeof pub === 'object' && !Array.isArray(pub) && Object.keys(pub).length > 0;
  // Portal form only collects public when industry=public; backend + mobile merge whenever present.
  if (hasPublic) {
    body.public = pub;
  }

  if (params.message && typeof params.message === 'object' && !Array.isArray(params.message)) {
    body.message = params.message;
  }

  const tenantKey = trimOrEmpty(params.xdm_tenant_key);
  if (tenantKey) body.xdmTenantKey = tenantKey;

  const ecidKey = trimOrEmpty(params.identity_map_ecid_key);
  if (ecidKey) body.identityMapEcidKey = ecidKey;

  const primaryIdentity = trimOrEmpty(params.primary_identity);
  if (primaryIdentity) body.primaryIdentity = primaryIdentity;
  if (params.email_primary_identity === true) body.emailPrimaryIdentity = true;

  if (xdmStyleExplicit === 'full' || params.edge_minimal === false) {
    body.xdmStyle = 'full';
  } else if (xdmStyleExplicit === 'minimal') {
    body.xdmStyle = 'minimal';
  }

  return body;
}

/**
 * Reference extract of event-generator.js send handler (for parity tests).
 *
 * @param {object} input
 */
export function portalEventGeneratorSendBody(input = {}) {
  const body = {
    targetId: input.targetId || undefined,
    email: trimOrEmpty(input.email),
    eventType: trimOrEmpty(input.eventType) || (input.edgeMinimal ? 'donation.made' : PORTAL_DEFAULT_EVENT_TYPE),
    viewName: trimOrEmpty(input.viewName),
    viewUrl: trimOrEmpty(input.viewUrl),
  };
  const channelVal = trimOrEmpty(input.channel);
  if (channelVal) body.channel = channelVal;
  const ecid = trimOrEmpty(input.ecid);
  if (ecid && isValidGeneratorEcid(ecid)) body.ecid = ecid;
  const orch = trimOrEmpty(input.eventID);
  if (orch) body.eventID = orch;
  const tsIso = trimOrEmpty(input.timestamp);
  if (tsIso) {
    body.timestamp = tsIso;
    body._id = String(new Date(tsIso).getTime());
  }
  const industryVal = trimOrEmpty(input.industry).toLowerCase();
  const pub = input.public;
  if (pub && industryVal === 'public') body.public = pub;
  if (input.sandbox) body.sandbox = input.sandbox;
  return body;
}
