(function (root) {
  'use strict';
  const TYPES = Object.freeze({
    productView: 'commerce.productViews',
    add: 'commerce.productListAdds',
    remove: 'commerce.productListRemovals',
    checkout: 'commerce.checkouts',
    purchase: 'commerce.purchases',
  });
  const LABELS = Object.freeze({
    productView: 'Product viewed', add: 'Added to bag', remove: 'Removed from bag',
    checkout: 'Checkout started', purchase: 'Simulated order confirmed',
  });
  const REQUIRED_PATHS = Object.freeze([
    'web.webPageDetails.name', 'web.webPageDetails.URL', 'web.webPageDetails.viewName',
    '_demoemea.identification.core.ecid', '_demoemea.identification.core.email',
    '_demoemea.public.generic.ctaLabel', '_demoemea.public.generic.linkUrl',
    '_demoemea.public.retail.productName', '_demoemea.public.retail.sku',
    '_demoemea.public.retail.productCategory', '_demoemea.public.retail.orderValue',
    '_demoemea.public.retail.cartId',
    '_demoemea.message.currencyCode',
    '_demoemea.message.productListItems.SKU', '_demoemea.message.productListItems.name',
    '_demoemea.message.productListItems.quantity', '_demoemea.message.productListItems.priceTotal',
  ]);
  function validateContext(ctx) {
    if (!ctx.sandbox) throw new Error('Select a sandbox in the Lab environment bar.');
    if (ctx.target?.id !== 'lab-event-tool-edge' || ctx.target.transport !== 'edge' || !ctx.target.dataStreamId) {
      throw new Error('Select the configured Lab Event tool Edge target.');
    }
    if (!/^\d{10,}$/.test(ctx.ecid || '')) throw new Error('Inject Tags to resolve this browser ECID.');
    if (ctx.known && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ctx.email || '')) {
      throw new Error('Look up and connect a verified profile before sending a known-customer event.');
    }
  }
  function canonicalUrl(page) {
    const paths = { home: '', category: '/shop-women', product: '/demo-product', bag: '/cart', checkout: '/checkout', confirmation: '/demo-confirmation' };
    if (!Object.hasOwn(paths, page)) throw new Error('Unsupported H&M demo page.');
    return 'https://ae.hm.com/en' + paths[page] + (page === 'home' ? '/' : '');
  }
  function item(input) {
    if (!input || !/^[A-Za-z0-9_-]{1,80}$/.test(input.sku || '') ||
      typeof input.name !== 'string' || !input.name.trim() || input.name.length > 200) {
      throw new Error('A product needs a valid SKU and name.');
    }
    if (!Number.isInteger(input.qty) || input.qty < 1 || input.qty > 99 ||
      typeof input.price !== 'number' || !Number.isFinite(input.price) || input.price < 0 ||
      input.price > 100000 || Math.abs(input.price * 100 - Math.round(input.price * 100)) > 0.00001) {
      throw new Error('Use an integer quantity of 1-99 and a non-negative AED price in whole fils.');
    }
    return { SKU: input.sku, name: input.name.trim(), quantity: input.qty, priceTotal: Math.round(input.price * 100) * input.qty / 100 };
  }
  function build(type, payload, ctx) {
    if (!Object.hasOwn(TYPES, type)) throw new Error('Unsupported H&M interaction.');
    validateContext(ctx);
    if (!Array.isArray(payload?.items) || !payload.items.length || payload.items.length > 100) {
      throw new Error('Provide 1-100 products for the interaction.');
    }
    const items = payload.items.map(item);
    const total = items.reduce((sum, product) => sum + Math.round(product.priceTotal * 100), 0) / 100;
    if (payload.total !== undefined && (typeof payload.total !== 'number' || Math.abs(payload.total - total) > 0.00001)) {
      throw new Error('The event total must equal the item quantities and prices.');
    }
    if (type === 'purchase' && !/^HM-[A-Za-z0-9-]{1,60}$/.test(payload.orderId || '')) {
      throw new Error('A simulated order needs its local confirmation reference.');
    }
    const url = canonicalUrl(ctx.page || 'home');
    const body = {
      sandbox: ctx.sandbox, targetId: 'lab-event-tool-edge', eventType: TYPES[type],
      xdmStyle: 'full', channel: 'Web', identityMapEcidKey: 'ECID', ecid: ctx.ecid,
      viewName: LABELS[type], viewUrl: url,
      public: {
        generic: { ctaLabel: LABELS[type], linkUrl: url },
        retail: {
          productName: items.map((product) => product.name).join('; '),
          sku: items.map((product) => product.SKU).join('; '),
          productCategory: 'Women', orderValue: total, cartId: type === 'purchase' ? payload.orderId : 'hm-demo-bag',
        },
      },
      message: { currencyCode: 'AED', productListItems: items },
    };
    if (ctx.known) body.email = ctx.email;
    return body;
  }
  function properties(node) {
    if (!node || typeof node !== 'object') return {};
    const merged = { ...(node.properties || {}) };
    for (const part of node.allOf || []) {
      for (const [key, value] of Object.entries(properties(part))) {
        merged[key] = merged[key] ? { allOf: [merged[key], value] } : value;
      }
    }
    return merged;
  }
  function schemaNode(schema, path) {
    let node = schema;
    for (const key of path.split('.')) {
      if (node?.items) node = node.items;
      node = properties(node)[key];
      if (!node) return null;
    }
    return node;
  }
  function leafTypes(node) {
    return [...(Array.isArray(node?.type) ? node.type : node?.type ? [node.type] : []),
      ...(node?.allOf || []).flatMap(leafTypes)];
  }
  function missingSchemaPaths(schema) {
    return REQUIRED_PATHS.filter((path) => {
      const node = schemaNode(schema, path);
      if (!node) return true;
      const numeric = /(?:quantity|priceTotal|orderValue)$/.test(path);
      const expected = numeric ? /quantity$/.test(path) ? ['integer', 'number'] : ['number'] : ['string'];
      return !leafTypes(node).some((type) => expected.includes(type));
    });
  }
  function redact(body) {
    return JSON.parse(JSON.stringify(body, (key, value) => /email|ecid/i.test(key) ? '(hidden)' : value));
  }
  const api = Object.freeze({ TYPES, LABELS, REQUIRED_PATHS, build, canonicalUrl, missingSchemaPaths, redact });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.HmEvents = api;
})(typeof window !== 'undefined' ? window : globalThis);
