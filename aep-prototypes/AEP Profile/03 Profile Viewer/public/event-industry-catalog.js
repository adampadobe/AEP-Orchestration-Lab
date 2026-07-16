/**
 * Industry event scenarios for Event Tool — aligned with profile-generation industries.
 * Payloads use tenant public.{industryId}.* + web.webPageDetails + interactionDetails (same schema/datastream).
 */
(function () {
  'use strict';

  function field(key, label, def, type) {
    return { key: key, label: label, default: def == null ? '' : def, type: type || 'text' };
  }

  /** @type {Array<{ id: string, label: string, scenarios: object[] }>} */
  var INDUSTRIES = [
    {
      id: 'generic',
      label: 'Generic',
      scenarios: [
        {
          id: 'pageView',
          label: 'Web page view',
          description: 'Standard page view with web context.',
          eventType: 'web.webPageDetails.pageViews',
          viewName: 'Lab demo page',
          viewUrl: 'https://example.com/page',
          public: {},
          fields: [],
        },
        {
          id: 'transaction',
          label: 'Generic transaction',
          description: 'Simple transaction event with page context.',
          eventType: 'transaction',
          viewName: 'Checkout complete',
          viewUrl: 'https://example.com/checkout/confirmation',
          public: { ctaLabel: 'Complete purchase' },
          fields: [field('ctaLabel', 'CTA label', 'Complete purchase')],
        },
      ],
    },
    {
      id: 'retail',
      label: 'Retail',
      scenarios: [
        {
          id: 'productView',
          label: 'Product view',
          description: 'Browse a product detail page.',
          eventType: 'commerce.productViews',
          viewName: 'Product detail',
          viewUrl: 'https://shop.example.com/product/sku-001',
          public: { productName: 'Featured product', sku: 'SKU-001', productCategory: 'Apparel' },
          fields: [
            field('productName', 'Product name', 'Featured product'),
            field('sku', 'SKU', 'SKU-001'),
            field('productCategory', 'Category', 'Apparel'),
          ],
        },
        {
          id: 'addToCart',
          label: 'Add to cart',
          description: 'Add item to shopping cart.',
          eventType: 'commerce.productListAdds',
          viewName: 'Shopping cart',
          viewUrl: 'https://shop.example.com/cart',
          public: { productName: 'Featured product', sku: 'SKU-001', cartId: 'cart-' + Date.now() },
          fields: [
            field('productName', 'Product name', 'Featured product'),
            field('sku', 'SKU', 'SKU-001'),
            field('cartId', 'Cart ID', 'cart-demo'),
          ],
        },
        {
          id: 'purchase',
          label: 'Purchase complete',
          description: 'Order confirmation after checkout.',
          eventType: 'commerce.purchases',
          viewName: 'Order confirmation',
          viewUrl: 'https://shop.example.com/order/confirmation',
          public: { productName: 'Featured product', orderValue: 49.99, sku: 'SKU-001' },
          fields: [
            field('productName', 'Product name', 'Featured product'),
            field('orderValue', 'Order value', 49.99, 'number'),
            field('sku', 'SKU', 'SKU-001'),
          ],
        },
      ],
    },
    {
      id: 'fsi',
      label: 'Financial services',
      scenarios: [
        {
          id: 'applicationPage',
          label: 'Application page view',
          description: 'Customer views an account application step.',
          eventType: 'web.webPageDetails.pageViews',
          viewName: 'Account application',
          viewUrl: 'https://bank.example.com/apply/current-account',
          public: { productType: 'Current account', applicationStep: 'Personal details' },
          fields: [
            field('productType', 'Product type', 'Current account'),
            field('applicationStep', 'Application step', 'Personal details'),
          ],
        },
        {
          id: 'depositMade',
          label: 'Deposit made',
          description: 'Deposit completed — FSI journey trigger.',
          eventType: 'deposit.made',
          viewName: 'Deposit confirmation',
          viewUrl: 'https://bank.example.com/deposit/confirmation',
          public: { depositAmount: 250, productType: 'Savings account' },
          fields: [
            field('depositAmount', 'Deposit amount', 250, 'number'),
            field('productType', 'Product type', 'Savings account'),
          ],
        },
        {
          id: 'applicationComplete',
          label: 'Application complete',
          description: 'Account application submitted successfully.',
          eventType: 'accountapplication.complete',
          viewName: 'Application submitted',
          viewUrl: 'https://bank.example.com/apply/confirmation',
          public: { productType: 'Current account', applicationStep: 'Submitted' },
          fields: [
            field('productType', 'Product type', 'Current account'),
            field('applicationStep', 'Application step', 'Submitted'),
          ],
        },
      ],
    },
    {
      id: 'telecom',
      label: 'Telecommunications',
      scenarios: [
        {
          id: 'planBrowse',
          label: 'Plan browse',
          description: 'Customer views mobile or broadband plans.',
          eventType: 'web.webPageDetails.pageViews',
          viewName: 'Mobile plans',
          viewUrl: 'https://telco.example.com/plans/mobile',
          public: { planTier: 'Unlimited 5G', planAction: 'browse' },
          fields: [
            field('planTier', 'Plan tier', 'Unlimited 5G'),
            field('planAction', 'Action', 'browse'),
          ],
        },
        {
          id: 'upgradeEligible',
          label: 'Upgrade eligible',
          description: 'Customer shown an upgrade offer.',
          eventType: 'telecom.plan.upgrade',
          viewName: 'Upgrade offer',
          viewUrl: 'https://telco.example.com/my-account/upgrade',
          public: { planTier: 'Unlimited 5G', planAction: 'upgrade_offer' },
          fields: [
            field('planTier', 'Current plan', 'Unlimited 5G'),
            field('planAction', 'Action', 'upgrade_offer'),
          ],
        },
      ],
    },
    {
      id: 'media',
      label: 'Media & entertainment',
      scenarios: [
        {
          id: 'contentView',
          label: 'Content view',
          description: 'Stream or article engagement.',
          eventType: 'media.contentView',
          viewName: 'Featured episode',
          viewUrl: 'https://media.example.com/watch/episode-1',
          public: { contentTitle: 'Pilot episode', genre: 'Drama', subscriptionTier: 'Premium' },
          fields: [
            field('contentTitle', 'Content title', 'Pilot episode'),
            field('genre', 'Genre', 'Drama'),
            field('subscriptionTier', 'Subscription tier', 'Premium'),
          ],
        },
        {
          id: 'insiderSignup',
          label: 'Insider signup',
          description: 'Newsletter or insider programme signup.',
          eventType: 'insider.interaction',
          viewName: 'Insider signup',
          viewUrl: 'https://media.example.com/insider/signup',
          public: {
            insider: { action: 'signup', newsletter: 'weekly digest' },
            contentTitle: 'Insider programme',
          },
          fields: [
            field('contentTitle', 'Content title', 'Insider programme'),
          ],
        },
      ],
    },
    {
      id: 'travel',
      label: 'Travel & hospitality',
      scenarios: [
        {
          id: 'hotelSearch',
          label: 'Hotel search',
          description: 'Guest searches for hotel availability.',
          eventType: 'hotel.search',
          viewName: 'Hotel search results',
          viewUrl: 'https://hotels.example.com/search',
          public: { hotelName: 'Premier Inn London', hotelLocation: 'London', checkInDate: '2026-08-01' },
          fields: [
            field('hotelName', 'Hotel name', 'Premier Inn London'),
            field('hotelLocation', 'Location', 'London'),
            field('checkInDate', 'Check-in date', '2026-08-01'),
          ],
        },
        {
          id: 'flightSearch',
          label: 'Flight search',
          description: 'Customer searches for flights.',
          eventType: 'travel.flight.search',
          viewName: 'Flight search',
          viewUrl: 'https://airline.example.com/flights/search',
          public: { departureAirport: 'LHR', arrivalAirport: 'DXB', confirmationNumber: 'FLT-DEMO-001' },
          fields: [
            field('departureAirport', 'Departure airport', 'LHR'),
            field('arrivalAirport', 'Arrival airport', 'DXB'),
            field('confirmationNumber', 'Confirmation / PNR', 'FLT-DEMO-001'),
          ],
        },
        {
          id: 'hotelBooking',
          label: 'Hotel booking',
          description: 'Hotel reservation confirmed.',
          eventType: 'hotel.booking',
          viewName: 'Booking confirmation',
          viewUrl: 'https://hotels.example.com/booking/confirmation',
          public: {
            hotelName: 'Premier Inn London',
            hotelItineraryId: 'ITN-DEMO-001',
            confirmationNumber: 'BK-DEMO-001',
            checkInDate: '2026-08-01',
          },
          fields: [
            field('hotelName', 'Hotel name', 'Premier Inn London'),
            field('hotelItineraryId', 'Itinerary ID', 'ITN-DEMO-001'),
            field('confirmationNumber', 'Confirmation number', 'BK-DEMO-001'),
            field('checkInDate', 'Check-in date', '2026-08-01'),
          ],
        },
      ],
    },
    {
      id: 'sports',
      label: 'Sports',
      scenarios: [
        {
          id: 'matchPage',
          label: 'Match / event page',
          description: 'Fan views an upcoming fixture page.',
          eventType: 'web.webPageDetails.pageViews',
          viewName: 'Upcoming match',
          viewUrl: 'https://sports.example.com/fixtures/next-match',
          public: { eventName: 'Home fixture', team: 'City FC', ticketType: 'General admission' },
          fields: [
            field('eventName', 'Event name', 'Home fixture'),
            field('team', 'Team', 'City FC'),
            field('ticketType', 'Ticket type', 'General admission'),
          ],
        },
        {
          id: 'ticketPurchase',
          label: 'Ticket purchase',
          description: 'Fan completes ticket checkout.',
          eventType: 'commerce.purchases',
          viewName: 'Ticket checkout',
          viewUrl: 'https://sports.example.com/tickets/confirmation',
          public: { eventName: 'Home fixture', team: 'City FC', orderValue: 65, ticketType: 'Adult' },
          fields: [
            field('eventName', 'Event name', 'Home fixture'),
            field('team', 'Team', 'City FC'),
            field('orderValue', 'Order value', 65, 'number'),
            field('ticketType', 'Ticket type', 'Adult'),
          ],
        },
      ],
    },
    {
      id: 'public',
      label: 'Public & nonprofit',
      scenarios: [
        {
          id: 'donation',
          label: 'Donation made',
          description: 'Charity donation completed.',
          eventType: 'donation.made',
          viewName: 'Thank you for your donation',
          viewUrl: 'https://charity.example.com/donate/thank-you',
          public: { donationAmount: 25, donationDate: new Date().toISOString().slice(0, 10) },
          fields: [
            field('donationAmount', 'Donation amount', 25, 'number'),
            field('donationDate', 'Donation date (YYYY-MM-DD)', new Date().toISOString().slice(0, 10)),
          ],
        },
        {
          id: 'eventRegistered',
          label: 'Event registration',
          description: 'Supporter registers for a fundraising event.',
          eventType: 'event.registered',
          viewName: 'Event registration',
          viewUrl: 'https://charity.example.com/events/register/confirmation',
          public: { eventRegistration: 'Race for Life 2026', donationAmount: 0 },
          fields: [
            field('eventRegistration', 'Event name', 'Race for Life 2026'),
          ],
        },
      ],
    },
  ];

  function getIndustries() {
    return INDUSTRIES.map(function (ind) {
      return { id: ind.id, label: ind.label };
    });
  }

  function findIndustry(industryId) {
    var id = String(industryId || '').trim();
    return INDUSTRIES.find(function (ind) { return ind.id === id; }) || null;
  }

  function getScenarios(industryId) {
    var ind = findIndustry(industryId);
    if (!ind) return [];
    return ind.scenarios.map(function (sc) {
      return { id: sc.id, label: sc.label, description: sc.description, eventType: sc.eventType };
    });
  }

  function getScenario(industryId, scenarioId) {
    var ind = findIndustry(industryId);
    if (!ind) return null;
    var sid = String(scenarioId || '').trim();
    return ind.scenarios.find(function (sc) { return sc.id === sid; }) || null;
  }

  function clonePublic(obj) {
    try {
      return JSON.parse(JSON.stringify(obj || {}));
    } catch (e) {
      return {};
    }
  }

  /**
   * Merge scenario defaults with form field values under public.{industryId}.*
   * @param {object} scenario
   * @param {Record<string, string|number>} fieldValues
   * @param {string} industryId
   */
  function buildPublicPayload(scenario, fieldValues, industryId) {
    var pub = clonePublic(scenario && scenario.public);
    var fields = (scenario && scenario.fields) || [];
    fields.forEach(function (f) {
      var raw = fieldValues && Object.prototype.hasOwnProperty.call(fieldValues, f.key)
        ? fieldValues[f.key]
        : f.default;
      if (raw == null || raw === '') return;
      if (f.type === 'number') {
        var n = Number(String(raw).replace(/,/g, ''));
        if (Number.isFinite(n)) pub[f.key] = n;
        else pub[f.key] = raw;
      } else {
        pub[f.key] = String(raw).trim();
      }
    });
    var id = String(industryId || '').trim();
    if (!id) return pub;
    var out = {};
    out[id] = pub;
    return out;
  }

  window.AepEventIndustryCatalog = {
    getIndustries: getIndustries,
    getScenarios: getScenarios,
    getScenario: getScenario,
    buildPublicPayload: buildPublicPayload,
  };
})();
