/**
 * Optional event sequences for demo prep — suggestions only; any event_type string works
 * (same as Profile Viewer Event tool free-text input + mobile lab senders).
 */

/** @typedef {{ event_type: string, view_name?: string, view_url?: string, channel?: string, timestamp?: string, public?: Record<string, unknown>, message?: Record<string, unknown> }} DemoEventStep */

/** Common datalist suggestions (event-generator.html) — not an allowlist. */
export const EVENT_TYPE_SUGGESTIONS = Object.freeze({
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
 * Retail customer journey — optional convenience pack using common commerce types.
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
      event_type: EVENT_TYPE_SUGGESTIONS.productViews,
      view_name: product,
      view_url: `${baseUrl}/menu/product`,
      channel: 'web',
      timestamp: hoursAgoIso(4),
    },
    {
      event_type: EVENT_TYPE_SUGGESTIONS.productListAdds,
      view_name: `Cart — ${product}`,
      view_url: `${baseUrl}/cart`,
      channel: 'web',
      timestamp: hoursAgoIso(3),
    },
    {
      event_type: EVENT_TYPE_SUGGESTIONS.productListViews,
      view_name: 'Review cart',
      view_url: `${baseUrl}/cart`,
      channel: 'web',
      timestamp: hoursAgoIso(2),
    },
    {
      event_type: EVENT_TYPE_SUGGESTIONS.transaction,
      view_name: `${brand} order complete`,
      view_url: `${baseUrl}/checkout/confirmation`,
      channel: 'web',
      timestamp: hoursAgoIso(1),
    },
  ];
}

/**
 * Build steps from an explicit list of event type strings (Coworker / custom demos).
 *
 * @param {string[]} eventTypes
 * @param {object} [context]
 * @param {string} [context.view_name]
 * @param {string} [context.view_url]
 * @param {string} [context.channel]
 */
export function buildEventsFromEventTypes(eventTypes, context = {}) {
  const types = (Array.isArray(eventTypes) ? eventTypes : [])
    .map((t) => String(t || '').trim())
    .filter(Boolean);
  if (!types.length) {
    return [
      {
        event_type: EVENT_TYPE_SUGGESTIONS.pageViews,
        view_name: context.view_name || 'Brand demo landing',
        view_url: context.view_url,
        channel: context.channel || 'web',
      },
    ];
  }
  return types.map((event_type, index) => ({
    event_type,
    view_name:
      index === 0 && context.view_name
        ? context.view_name
        : context.view_name
          ? `${context.view_name} — ${event_type}`
          : event_type,
    view_url: context.view_url,
    channel: context.channel || 'web',
  }));
}

/**
 * Resolve event steps for demo prep / journey send tools.
 *
 * @param {object} opts
 * @param {string[]} [opts.event_types] — explicit list (any strings); highest priority
 * @param {string} [opts.event_sequence] — retail_journey | single_page_view
 * @param {string} [opts.industry] — lab industry; retail defaults to retail_journey when no event_types
 * @param {string} [opts.event_type] — single custom event override
 * @param {string} [opts.view_name]
 * @param {string} [opts.brandName]
 * @param {string} [opts.baseUrl]
 * @param {string} [opts.channel]
 * @returns {{ sequence: string, events: DemoEventStep[] }}
 */
export function resolveDemoEventSequence({
  event_types,
  event_sequence,
  industry,
  event_type,
  view_name,
  brandName,
  baseUrl,
  channel,
}) {
  if (Array.isArray(event_types) && event_types.length) {
    return {
      sequence: 'custom_list',
      events: buildEventsFromEventTypes(event_types, { view_name, channel }),
    };
  }

  if (event_type) {
    return {
      sequence: 'custom_single',
      events: [
        {
          event_type,
          view_name: view_name || 'Brand demo landing',
          view_url: undefined,
          channel: channel || 'web',
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
        event_type: EVENT_TYPE_SUGGESTIONS.pageViews,
        view_name: view_name || 'Brand demo landing',
        channel: channel || 'web',
      },
    ],
  };
}