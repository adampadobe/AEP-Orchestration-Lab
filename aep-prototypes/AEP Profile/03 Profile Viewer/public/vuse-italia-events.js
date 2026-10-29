(function (root) {
  'use strict';
  const TYPES = Object.freeze({
    pageView: 'web.webPageDetails.pageViews', 'ageGate.verified': 'ageGate.verified',
    'ageGate.underage': 'ageGate.underage', productView: 'commerce.productViews',
    'commerce.productListAdds': 'commerce.productListAdds', 'subscription.intent': 'subscription.intent',
    'cart.abandon': 'cart.abandon', 'commerce.purchases': 'commerce.purchases',
    'storeLocator.search': 'storeLocator.search', login: 'userAccount.login',
    'consent.preferences': 'consent.preferences', 'loyalty.join': 'loyalty.join', 'velo.view': 'velo.view',
  });
  const STEPS = Object.freeze([
    { label: 'Age gate', type: 'ageGate.verified', payload: {} },
    { label: 'Simulate product interest (not a page view)', type: 'productView', payload: { sku: 'VUSE-PRO', name: 'Vuse PRO', category: 'device', price: 9.99, currency: 'EUR' } },
    { label: 'Store locator', type: 'storeLocator.search', payload: { query: 'Milano', results: 3 } },
    { label: 'Connect existing customer (no consent change)', type: 'login', payload: {} },
    { label: 'Loyalty join', type: 'loyalty.join', payload: { programme: 'Vuse', tier: 'Member' } },
    { label: 'Add to cart / subscribe', type: 'commerce.productListAdds', payload: { sku: 'VUSE-PRO', name: 'Vuse PRO', price: 9.99, qty: 1, currency: 'EUR' } },
    { label: 'Cart abandon', type: 'cart.abandon', payload: { items: [{ sku: 'VUSE-PRO', name: 'Vuse PRO', price: 9.99, qty: 1 }], total: 9.99 } },
    { label: 'Velo cross-brand view', type: 'velo.view', payload: { href: 'https://www.vuse.com/it/it/velo' } },
  ]);
  function validateContext(ctx) {
    if (!ctx.sandbox) throw new Error('Select a sandbox in the Lab environment bar.');
    if (!ctx.target || ctx.target.id !== 'lab-event-tool-edge' || !ctx.target.dataStreamId || ctx.target.transport !== 'edge') {
      throw new Error('Select the configured Lab Event tool Edge target.');
    }
    if (!/^\d{10,}$/.test(ctx.ecid || '')) throw new Error('Inject Tags to resolve a valid ECID before recording an interaction.');
    if (ctx.known && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ctx.email || '')) throw new Error('Look up a profile with its own email and ECID.');
  }
  function eventType(value) {
    const text = String(value || '').trim();
    if (!text || text.length > 256 || /[\u0000-\u001f\u007f]/.test(text)) throw new Error('Enter an event type of 1-256 characters without control characters.');
    return text;
  }
  function safeUrl(value, base, external) {
    const fallback = 'https://www.vuse.com/it/it/';
    const resolvedBase = new URL(base || fallback, fallback);
    const url = new URL(value || resolvedBase.href, resolvedBase);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('A page URL must use HTTP or HTTPS.');
    if (url.pathname.startsWith('/profile-viewer/vuse-italia-assets/')) {
      const page = url.pathname.split('/').pop().replace(/\.html$/, '');
      url.href = fallback + (page === 'index' ? '' : page);
    }
    if (!external && (url.hostname !== 'www.vuse.com' || !url.pathname.startsWith('/it/it/'))) throw new Error('Use a canonical Vuse Italia page URL without customer data.');
    url.search = ''; url.hash = ''; url.username = ''; url.password = '';
    return url.href;
  }
  function baseBody(type, ctx, payload) {
    validateContext(ctx);
    const body = {
      targetId: 'lab-event-tool-edge', sandbox: ctx.sandbox, eventType: eventType(type),
      channel: 'Web', ecid: ctx.ecid, xdmStyle: 'full', identityMapEcidKey: 'ECID',
      viewName: 'Vuse IT – ' + (payload.title || payload.page || ctx.page || 'Home'),
      viewUrl: safeUrl(payload.url, ctx.url),
      public: { brand_name: 'vuse', market: 'IT', site: 'vuse.com/it/it', page: String(payload.page || ctx.page || 'home') },
    };
    if (ctx.known) body.email = ctx.email;
    return body;
  }
  function item(p) {
    return { SKU: String(p.sku || ''), name: String(p.name || ''), quantity: Math.max(1, Number(p.qty) || 1), priceTotal: (Number(p.price) || 0) * Math.max(1, Number(p.qty) || 1) };
  }
  function build(type, payload, ctx) {
    if (!Object.hasOwn(TYPES, type)) throw new Error('Unknown Vuse interaction.');
    const p = payload || {};
    const body = baseBody(type === 'login' && p.isNew ? 'userAccount.createProfile' : TYPES[type], ctx, p);
    const pub = body.public;
    if (type.startsWith('ageGate.')) Object.assign(pub, { ageVerified: type === 'ageGate.verified', ageGateMethod: 'self-declaration' });
    if (['productView', 'commerce.productListAdds', 'subscription.intent'].includes(type)) {
      Object.assign(pub, { product_sku: String(p.sku || ''), product_name: String(p.name || ''), product_category: String(p.category || ''), currency: String(p.currency || 'EUR'), product_price: Number(p.price) || 0 });
      if (p.nicotine != null) pub.nicotine = String(p.nicotine);
      if (p.frequency != null) pub.subscription_frequency = String(p.frequency);
      body.productListItems = [item(p)];
    }
    if (['cart.abandon', 'commerce.purchases'].includes(type)) {
      body.productListItems = (Array.isArray(p.items) ? p.items : []).map(item);
      pub.cart_total = Number(p.total) || 0;
      pub.currency = String(p.currency || 'EUR');
      if (p.orderId) pub.order_id = String(p.orderId);
    }
    // The generator does not forward arbitrary XDM roots; message preserves item detail.
    if (body.productListItems) body.message = { productListItems: body.productListItems };
    if (type === 'storeLocator.search') Object.assign(pub, { store_locator_query: String(p.query || ''), store_locator_results: Array.isArray(p.results) ? p.results.length : Number(p.results) || 0 });
    if (type === 'login') {
      if (!ctx.known) throw new Error('Look up and stitch the email before recording sign-in.');
      if (p.isNew) {
        body.person = { name: { firstName: String(p.firstName || ''), lastName: String(p.lastName || '') } };
        body.personalEmail = { address: ctx.email };
      }
    }
    if (type === 'consent.preferences') {
      for (const brand of ['vuse', 'velo', 'glo']) {
        for (const channel of ['email', 'sms', 'whatsapp']) {
          const preference = p[brand] && p[brand][channel];
          if (preference !== undefined) pub['consent_' + channel + '_' + brand] = preference === true || preference === 'y' ? 'y' : 'n';
        }
      }
    }
    if (type === 'loyalty.join') Object.assign(pub, { reward_points_balance: 0, loyalty_tier: String(p.tier || 'Member'), loyalty_programme: String(p.programme || 'Vuse') });
    if (type === 'velo.view') Object.assign(pub, { brand_name: 'velo', linkUrl: safeUrl(p.href, ctx.url, true) });
    return body;
  }
  function buildCustom(type, ctx, fields) {
    if (!fields || typeof fields !== 'object' || Array.isArray(fields)) throw new Error('Public fields must be a JSON object.');
    if (Object.values(fields).some((value) => value !== null && typeof value === 'object')) throw new Error('Use scalar public fields; the generator does not forward arbitrary nested public objects.');
    const body = baseBody(type, ctx, {});
    body.public = { ...fields, ...body.public };
    return body;
  }
  function redact(body) {
    return JSON.parse(JSON.stringify(body, (key, value) => /email|ecid|firstName|lastName|address|query/i.test(key) ? '(hidden)' : value));
  }
  const api = Object.freeze({ TYPES, STEPS, build, buildCustom, redact });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VuseItaliaEvents = api;
})(typeof window !== 'undefined' ? window : globalThis);
