/**
 * Portal Event Generator–aligned event sequences for MCP demo prep.
 * Event types MUST match web/profile-viewer/event-generator.html datalist + schema enum.
 * Never invent custom eventType strings (e.g. starbucks.page.view) — they are dropped by UPS.
 */

/** @typedef {{ event_type: string, view_name?: string, view_url?: string, channel?: string, timestamp?: string, public?: Record<string, unknown> }} DemoEventStep */

/** Schema-valid types from Event tool datalist (event-generator.html). */
export const PORTAL_EVENT_TYPES = Object.freeze({
  productViews: 'commerce.productViews',
  productListAdds: 'commerce.productListAdds',
  productListViews: 'commerce.productListViews',
  cartAbandons: 'commerce.cartAbandons',
  order: 'commerce.order',
  transaction: 'transaction',
  pageViews: 'web.webPageDetails.pageViews',
  formSubmit: 'form.formSubmit',
});

export const EVENT_SEQUENCE_KEYS = Object.freeze({
  retail_journey: 'retail_journey',
  single_page_view: 'single_page_view',
});

/**
 * ISO timestamp N hours before now (portal "yesterday" / journey spread pattern).
 * @param {number} hoursAgo
 */
export function hoursAgoIso(hoursAgo) {
  const ms = Math.max(0, Number(hoursAgo) || 0) * 60 * 60 * 1000;
  return new Date(Date.now() - ms).toISOString();
}

/**
 * @param {string | undefined | null} brandName
 */
export function defaultRetailProductName(brandName) {
  const b = String(brandName || '').trim().toLowerCase();
  if (b.includes('starbucks')) return 'Pike Place® Roast';
  if (b.includes('coffee') || b.includes('café') || b.includes('cafe')) return 'House Blend Coffee';
  return 'Featured product';
}

/**
 * Retail customer journey — mirrors Event tool commerce types for F&B / Starbucks demos.
 *
 * @param {object} [context]
 * @param {string} [context.brandName]
 * @param {string} [context.productName]
 * @param {string} [context.baseUrl]
 * @returns {DemoEventStep[]}
 */
export function buildRetailJourneyEventPack(context = {}) {
  const brand = String(context.brandName || 'Retail').trim() || 'Retail';
  const product = String(context.productName || defaultRetailProductName(brand)).trim();
  const baseUrl = String(context.baseUrl || 'https://shop.example.com').trim().replace(/\/$/, '') || 'https://shop.example.com';

  return [
    {
      event_type: PORTAL_EVENT_TYPES.productViews,
      view_name: product,
      view_url: `${baseUrl}/menu/product`,
      channel: 'web',
      timestamp: hoursAgoIso(4),
    },
    {
      event_type: PORTAL_EVENT_TYPES.productListAdds,
      view_name: `Cart — ${product}`,
      view_url: `${baseUrl}/cart`,
      channel: 'web',
      timestamp: hoursAgoIso(3),
    },
    {
      event_type: PORTAL_EVENT_TYPES.productListViews,
      view_name: 'Review cart',
      view_url: `${baseUrl}/cart`,
      channel: 'web',
      timestamp: hoursAgoIso(2),
    },
    {
      event_type: PORTAL_EVENT_TYPES.transaction,
      view_name: `${brand} order complete`,
      view_url: `${baseUrl}/checkout/confirmation`,
      channel: 'web',
      timestamp: hoursAgoIso(1),
    },
  ];
}

/**
 * Resolve event steps for demo prep / journey send tools.
 *
 * @param {object} opts
 * @param {string} [opts.event_sequence] — retail_journey | single_page_view
 * @param {string} [opts.industry] — lab industry (retail → default retail_journey)
 * @param {string} [opts.event_type] — explicit single event (legacy override)
 * @param {string} [opts.view_name]
 * @param {string} [opts.brandName]
 * @param {string} [opts.baseUrl]
 * @returns {{ sequence: string, events: DemoEventStep[] }}
 */
export function resolveDemoEventSequence({
  event_sequence,
  industry,
  event_type,
  view_name,
  brandName,
  baseUrl,
}) {
  if (event_type) {
    return {
      sequence: 'custom_single',
      events: [
        {
          event_type,
          view_name: view_name || 'Brand demo landing',
          channel: 'web',
        },
      ],
    };
  }

  const normIndustry = String(industry || '').trim().toLowerCase();
  let sequence = String(event_sequence || '').trim();
  if (!sequence) {
    sequence = normIndustry === 'retail' ? EVENT_SEQUENCE_KEYS.retail_journey : EVENT_SEQUENCE_KEYS.single_page_view;
  }

  if (sequence === EVENT_SEQUENCE_KEYS.retail_journey) {
    return {
      sequence,
      events: buildRetailJourneyEventPack({
        brandName,
        productName: view_name || undefined,
        baseUrl,
      }),
    };
  }

  return {
    sequence: EVENT_SEQUENCE_KEYS.single_page_view,
    events: [
      {
        event_type: PORTAL_EVENT_TYPES.pageViews,
        view_name: view_name || 'Brand demo landing',
        channel: 'web',
      },
    ],
  };
}

/**
 * POST /api/events/generator body shape (camelCase) — matches event-generator.js.
 *
 * @param {DemoEventStep} step
 * @param {object} identity
 * @param {string} identity.email
 * @param {string} identity.ecid
 * @param {string} [target_id]
 */
export function toGeneratorPostBody(step, { email, ecid, target_id }) {
  /** @type {Record<string, unknown>} */
  const body = {
    email,
    eventType: step.event_type,
    viewName: step.view_name || '',
    channel: step.channel || 'web',
  };
  if (ecid) body.ecid = ecid;
  if (step.view_url) body.viewUrl = step.view_url;
  if (step.timestamp) {
    body.timestamp = step.timestamp;
    body._id = String(new Date(step.timestamp).getTime());
  }
  if (target_id) body.targetId = target_id;
  if (step.public && typeof step.public === 'object') body.public = step.public;
  return body;
}
