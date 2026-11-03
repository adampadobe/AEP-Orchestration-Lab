/* H&M UAE Lab demo storefront: routing, catalogue, bag and simulated checkout.
   Lab integration (events, identity, presenter) is owned by hm-demo.js via window.HmLab. */
(function (global) {
  'use strict';
  const doc = global.document;
  const byId = (id) => doc.getElementById(id);
  const STORAGE_PREFIX = 'hmShopper:';
  const PAGES = ['home', 'category', 'product', 'bag', 'checkout', 'confirmation'];
  const ROUTE_PARAMS = ['page', 'product', 'filter'];
  const MAX_QTY = 99, MAX_LINES = 50;
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const ORDER_RE = /^HM-[A-Za-z0-9-]{1,60}$/;
  const APPAREL = ['XS', 'S', 'M', 'L', 'XL'];
  const FILTERS = Object.freeze([
    { id: 'all', label: 'View all' },
    { id: 'outerwear', label: 'Outerwear' },
    { id: 'knitwear', label: 'Knitwear' },
    { id: 'jeans', label: 'Jeans' },
    { id: 'dresses', label: 'Dresses' },
    { id: 'skirts-accessories', label: 'Skirts & accessories' },
  ]);
  const product = (sku, slug, name, colour, priceFils, filter, sizes) => Object.freeze({
    sku, name, colour, priceFils, filter, sizes: Object.freeze(sizes),
    image: 'hm-assets/product-' + slug + '.avif', alt: name + ', ' + colour,
  });
  // Illustrative AED demo prices in integer fils; not live H&M prices, stock or sizes.
  const CATALOG = Object.freeze([
    product('HMD-1001', 'high-waist-mini-skirt', 'High-waist mini skirt', 'Dark brown', 9900, 'skirts-accessories', APPAREL),
    product('HMD-1002', 'oversized-funnel-collar-coat', 'Oversized funnel-collar coat', 'Black', 34900, 'outerwear', APPAREL),
    product('HMD-1003', 'funnel-collar-tie-belt-jacket', 'Funnel-collar tie-belt jacket', 'Dark mole marl', 29900, 'outerwear', APPAREL),
    product('HMD-1004', 'trumpet-sleeved-rib-knit-dress', 'Trumpet-sleeved rib-knit dress', 'Black', 14900, 'dresses', APPAREL),
    product('HMD-1005', 'flared-skirt-satin-dress', 'Flared-skirt satin dress', 'Black', 19900, 'dresses', APPAREL),
    product('HMD-1006', 'balloon-sleeved-velour-jacket', 'Balloon-sleeved velour jacket', 'Black', 24900, 'outerwear', APPAREL),
    product('HMD-1007', 'mohair-blend-triangle-scarf', 'Mohair-blend triangle scarf', 'Light beige', 8900, 'skirts-accessories', ['One size']),
    product('HMD-1008', 'fluffy-jacket', 'Fluffy jacket', 'Beige leopard print', 27900, 'outerwear', APPAREL),
    product('HMD-1009', 'button-top-sweatshirt', 'Button-top sweatshirt', 'Navy blue striped', 11900, 'knitwear', APPAREL),
    product('HMD-1010', 'slim-straight-high-waist-ankle-jeans', 'Slim Straight High Waist Ankle Jeans', 'Light denim blue', 12900, 'jeans', ['32', '34', '36', '38', '40', '42']),
    product('HMD-1011', 'rib-knit-wool-blend-jumper', 'Rib-knit wool-blend jumper', 'Black', 16900, 'knitwear', APPAREL),
    product('HMD-1012', 'oversized-wool-turtleneck-jumper', 'Oversized wool turtleneck jumper', 'Dark maroon', 19900, 'knitwear', APPAREL),
  ]);
  const BY_SKU = new Map(CATALOG.map((item) => [item.sku, item]));
  const FILTER_IDS = new Set(FILTERS.map((f) => f.id));

  let scopeKey = '';
  let state = emptyState();
  let busy = false, pendingContext = false, lastRouteKey = null, lastUrl = '';
  let pendingProductView = Promise.resolve();
  let lastEmail = '';
  const pdpSize = new Map();

  function emptyState() { return { cart: [], lastOrder: null }; }
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  const money = (fils) => 'AED ' + (fils / 100).toFixed(2);
  const lab = () => global.HmLab || null;
  function currentScope() {
    try { return String(lab()?.scope() || 'preview:local'); } catch { return 'preview:local'; }
  }
  function report(error) {
    try { lab()?.reportError(error); } catch { /* the inline status below still shows it */ }
  }
  function clearSiteStatus() {
    const node = byId('hmSiteStatus');
    if (node) { node.hidden = true; node.textContent = ''; }
  }

  // ---------- Persistence (sessionStorage, scoped, allowlisted) ----------
  function validLine(line) {
    const item = line && BY_SKU.get(line.sku);
    return !!item && item.sizes.includes(line.size) && Number.isInteger(line.qty) && line.qty >= 1 && line.qty <= MAX_QTY;
  }
  function sanitizeLines(lines) {
    if (!Array.isArray(lines)) return [];
    const merged = [];
    for (const raw of lines.slice(0, MAX_LINES)) {
      const line = raw && { sku: String(raw.sku), size: String(raw.size), qty: raw.qty };
      if (!validLine(line)) continue;
      const same = merged.find((l) => l.sku === line.sku && l.size === line.size);
      if (same) same.qty = Math.min(MAX_QTY, same.qty + line.qty); else merged.push(line);
    }
    return merged;
  }
  function restore(key) {
    let data = null;
    try { data = JSON.parse(global.sessionStorage.getItem(STORAGE_PREFIX + key) || 'null'); } catch { data = null; }
    const next = emptyState();
    if (!data || data.v !== 1) return next;
    next.cart = sanitizeLines(data.cart);
    const order = data.lastOrder;
    if (order && ORDER_RE.test(String(order.orderId))) {
      const lines = sanitizeLines(order.lines);
      if (lines.length) next.lastOrder = { orderId: String(order.orderId), lines };
    }
    return next;
  }
  function save() {
    try {
      global.sessionStorage.setItem(STORAGE_PREFIX + scopeKey, JSON.stringify({ v: 1, cart: state.cart, lastOrder: state.lastOrder }));
    } catch (error) { report(new Error('Bag could not be saved in this browser session: ' + error.message)); }
  }
  function loadScope() {
    scopeKey = currentScope();
    state = restore(scopeKey);
    lastEmail = '';
    pdpSize.clear();
  }

  // ---------- Payloads (integer fils; AED numbers in payload) ----------
  function payloadItem(line) {
    const item = BY_SKU.get(line.sku);
    return { sku: item.sku, name: item.name, price: item.priceFils / 100, qty: line.qty, size: line.size, color: item.colour };
  }
  const linesTotal = (lines) => lines.reduce((sum, l) => sum + BY_SKU.get(l.sku).priceFils * l.qty, 0);
  const cartCount = () => state.cart.reduce((sum, l) => sum + l.qty, 0);
  function payload(lines, extra) {
    return Object.assign({ items: lines.map(payloadItem), total: linesTotal(lines) / 100 }, extra || {});
  }
  async function interact(type, body) {
    const api = lab();
    if (!api || typeof api.interact !== 'function') throw new Error('Lab controls are unavailable; this action was not completed.');
    const receipt = await api.interact(type, body);
    if (!receipt) throw new Error('The Lab did not acknowledge this action. Nothing was changed.');
    return receipt;
  }
  function newOrderId() {
    const bytes = new Uint8Array(8);
    global.crypto.getRandomValues(bytes);
    return 'HM-' + Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').toUpperCase().slice(0, 12);
  }

  // ---------- Busy guard ----------
  function setBusy(on) {
    busy = on;
    const site = byId('hmCustomerSite');
    site.setAttribute('aria-busy', String(on));
    if (on) {
      site.querySelectorAll('#hmMain button, #hmMain input, #hmMain select, .hm-dialog button, .hm-dialog input').forEach((el) => {
        if (!el.disabled) { el.disabled = true; el.dataset.hmBusyDisabled = '1'; }
      });
    } else {
      site.querySelectorAll('[data-hm-busy-disabled]').forEach((el) => { el.disabled = false; delete el.dataset.hmBusyDisabled; });
    }
  }
  async function runAction(fn) {
    if (busy) throw new Error('Wait for the current action to finish.');
    const focusKey = doc.activeElement?.dataset?.hmKey || '';
    setBusy(true);
    try { return await fn(); } finally {
      setBusy(false);
      if (pendingContext) { pendingContext = false; applyContext(); }
      if (focusKey && !doc.activeElement?.closest?.('#hmCustomerSite')) doc.querySelector('[data-hm-key="' + CSS.escape(focusKey) + '"]')?.focus();
    }
  }

  // ---------- Routing ----------
  function parseRoute(search) {
    const params = new URLSearchParams(search);
    const page = params.get('page') || 'home';
    if (!PAGES.includes(page)) return { page: 'notfound', reason: 'This page is not part of the H&M demo.' };
    if (page === 'product') {
      const item = BY_SKU.get(params.get('product') || '');
      return item ? { page, sku: item.sku } : { page: 'notfound', reason: 'This product is not in the demo catalogue.' };
    }
    if (page === 'category') {
      const filter = params.get('filter') || 'all';
      return FILTER_IDS.has(filter) ? { page, filter } : { page: 'notfound', reason: 'This category filter is not available in the demo.' };
    }
    return { page };
  }
  const routeKey = (route) => route.page + (route.page === 'product' ? ':' + route.sku : '');
  function urlFor(target) {
    const url = new URL(global.location.href);
    const incoming = new URLSearchParams(target);
    ROUTE_PARAMS.forEach((name) => url.searchParams.delete(name));
    ROUTE_PARAMS.forEach((name) => { const v = incoming.get(name); if (v && !(name === 'page' && v === 'home')) url.searchParams.set(name, v); });
    url.hash = '';
    return url.pathname + url.search;
  }
  function closeDialogs() {
    doc.querySelectorAll('#hmCustomerSite dialog[open]').forEach((d) => d.close());
  }
  function navigate(target, options) {
    if (busy) return false;
    const url = urlFor(target);
    closeDialogs();
    if (options?.replace) global.history.replaceState(null, '', url); else global.history.pushState(null, '', url);
    applyRoute();
    return true;
  }
  function pageTitle(route) {
    if (route.page === 'product') return BY_SKU.get(route.sku).name;
    return { home: 'Home page', category: 'Women', bag: 'Shopping bag', checkout: 'Checkout', confirmation: 'Order confirmation', notfound: 'Page not found' }[route.page];
  }
  function applyRoute() {
    const route = parseRoute(global.location.search);
    lastUrl = global.location.pathname + global.location.search;
    const key = routeKey(route);
    const transition = key !== lastRouteKey;
    lastRouteKey = key;
    render(route);
    if (!transition) return;
    clearSiteStatus();
    const title = pageTitle(route);
    doc.title = 'Web page view - ' + title;
    global.scrollTo(0, 0);
    if (route.page !== 'home') doc.querySelector('[data-hm-view="' + route.page + '"] .hm-page-title')?.focus({ preventScroll: true });
    if (route.page === 'notfound') return;
    try { void lab()?.pageView({ page: route.page, title }); } catch (error) { report(error); }
    if (route.page === 'product') {
      pendingProductView = interact('productView', payload([{ sku: route.sku, size: '', qty: 1 }]))
        .catch((error) => report(error));
    }
  }

  // ---------- Rendering ----------
  const productHref = (sku) => '?page=product&product=' + encodeURIComponent(sku);
  const categoryHref = (filter) => '?page=category' + (filter && filter !== 'all' ? '&filter=' + encodeURIComponent(filter) : '');
  function card(item, lazy) {
    return '<li class="hm-card"><a href="' + productHref(item.sku) + '" data-hm-route="product">' +
      '<div class="hm-card-img"><img src="' + item.image + '" alt="' + escapeHtml(item.alt) + '" width="450" height="675"' + (lazy ? ' loading="lazy"' : '') + '></div>' +
      '<p class="hm-card-name">' + escapeHtml(item.name) + '</p><p class="hm-card-price">' + money(item.priceFils) + '</p>' +
      '<p class="hm-card-colour">' + escapeHtml(item.colour) + '</p></a></li>';
  }
  function breadcrumb(parts) {
    return '<ol class="hm-breadcrumb" aria-label="Breadcrumb">' + parts.map(([label, href]) =>
      '<li>' + (href ? '<a href="' + href + '" data-hm-route>' + escapeHtml(label) + '</a>' : '<span aria-current="page">' + escapeHtml(label) + '</span>') + '</li>').join('') + '</ol>';
  }
  function renderHomeGrid() {
    byId('hmNewInGrid').innerHTML = CATALOG.map((item) =>
      '<li><a href="' + productHref(item.sku) + '" data-hm-route="product"><img src="' + item.image + '" alt="' + escapeHtml(item.alt) + '" width="450" height="675" loading="lazy"></a></li>').join('');
    byId('hmMenuLinks').innerHTML = FILTERS.map((f) =>
      '<a href="' + categoryHref(f.id) + '" data-hm-route="category">' + escapeHtml(f.id === 'all' ? 'Women: view all' : f.label) + '</a>').join('') +
      '<a href="?page=bag" data-hm-route="bag">Shopping bag</a>';
  }
  function renderCategory(route) {
    const items = CATALOG.filter((item) => route.filter === 'all' || item.filter === route.filter);
    const label = FILTERS.find((f) => f.id === route.filter).label;
    byId('hmCategory').innerHTML = breadcrumb([['H&M', '?'], ['Women', route.filter === 'all' ? '' : categoryHref('all')]].concat(route.filter === 'all' ? [] : [[label, '']])) +
      '<h1 class="hm-page-title" id="hmCategoryTitle" tabindex="-1">Women' + (route.filter === 'all' ? '' : ' / ' + escapeHtml(label)) + '</h1>' +
      '<p class="hm-note">Demo catalogue from the supplied captures. Prices are illustrative AED demo pricing; the captured promotion is not applied.</p>' +
      '<ul class="hm-filters" aria-label="Filter Women">' + FILTERS.map((f) =>
        '<li><a href="' + categoryHref(f.id) + '" data-hm-route="category"' + (f.id === route.filter ? ' aria-current="true"' : '') + '>' + escapeHtml(f.label) + '</a></li>').join('') + '</ul>' +
      '<p class="hm-count">' + items.length + (items.length === 1 ? ' item' : ' items') + '</p>' +
      '<ul class="hm-product-grid">' + items.map((item) => card(item, true)).join('') + '</ul>';
  }
  function renderProduct(route) {
    const item = BY_SKU.get(route.sku);
    const chosen = item.sizes.length === 1 ? item.sizes[0] : pdpSize.get(item.sku) || '';
    byId('hmProduct').innerHTML = breadcrumb([['H&M', '?'], ['Women', categoryHref('all')], [FILTERS.find((f) => f.id === item.filter).label, categoryHref(item.filter)], [item.name, '']]) +
      '<div class="hm-pdp"><div class="hm-gallery">' +
      '<figure><img src="' + item.image + '" alt="' + escapeHtml(item.alt) + '" width="450" height="675"></figure>' +
      '<figure><img src="' + item.image + '" alt="Detail view: ' + escapeHtml(item.alt) + '" width="450" height="675"></figure></div>' +
      '<form class="hm-pdp-info" id="hmAddForm" novalidate><h1 class="hm-page-title" tabindex="-1">' + escapeHtml(item.name) + '</h1>' +
      '<p class="hm-price">' + money(item.priceFils) + '</p><p class="hm-note">Illustrative AED demo price.</p>' +
      '<p>Colour: ' + escapeHtml(item.colour) + '</p>' +
      '<fieldset class="hm-sizes" aria-describedby="hmSizeError"><legend>Select size</legend><div class="hm-size-grid">' +
      item.sizes.map((size, i) => '<label><input type="radio" name="hmSize" value="' + escapeHtml(size) + '" data-hm-key="size-' + i + '"' + (size === chosen ? ' checked' : '') + '><span>' + escapeHtml(size) + '</span></label>').join('') +
      '</div></fieldset><p class="hm-field-error" id="hmSizeError" role="alert" aria-live="assertive"></p>' +
      '<button class="hm-button" type="submit" data-hm-key="add">Add to bag</button>' +
      '<p class="hm-form-status" id="hmAddStatus" role="status" aria-live="polite"></p>' +
      '<div class="hm-details"><p>Sizes shown are a demo selection. Availability, materials and delivery times are not represented.</p><p>Article: ' + escapeHtml(item.sku) + ' (demo reference)</p></div>' +
      '</form></div>';
  }
  function lineRow(line, index, editable) {
    const item = BY_SKU.get(line.sku);
    const controls = editable
      ? '<div class="hm-qty" role="group" aria-label="Quantity for ' + escapeHtml(item.name) + '"><button type="button" data-hm-cart="dec" data-hm-line="' + index + '" data-hm-key="dec-' + index + '" aria-label="Decrease quantity">&minus;</button>' +
        '<output aria-live="polite">' + line.qty + '</output><button type="button" data-hm-cart="inc" data-hm-line="' + index + '" data-hm-key="inc-' + index + '" aria-label="Increase quantity"' + (line.qty >= MAX_QTY ? ' disabled' : '') + '>+</button></div>' +
        '<button type="button" class="hm-remove" data-hm-cart="remove" data-hm-line="' + index + '" data-hm-key="rm-' + index + '">Remove</button>'
      : '<span class="hm-muted">Quantity: ' + line.qty + '</span>';
    return '<li class="hm-line"><a href="' + productHref(item.sku) + '" data-hm-route="product" tabindex="-1" aria-hidden="true"><img src="' + item.image + '" alt="" width="450" height="675" loading="lazy"></a>' +
      '<div class="hm-line-meta"><a href="' + productHref(item.sku) + '" data-hm-route="product">' + escapeHtml(item.name) + '</a>' +
      '<span>' + money(item.priceFils) + '</span><span class="hm-muted">Colour: ' + escapeHtml(item.colour) + '</span><span class="hm-muted">Size: ' + escapeHtml(line.size) + '</span>' + controls + '</div>' +
      '<p class="hm-line-total">' + money(BY_SKU.get(line.sku).priceFils * line.qty) + '</p></li>';
  }
  function summary(lines, action) {
    const total = linesTotal(lines);
    return '<aside class="hm-summary" aria-label="Order summary"><h2>Order summary</h2><dl>' +
      '<dt>Order value</dt><dd>' + money(total) + '</dd><dt>Delivery</dt><dd>Not charged in demo</dd>' +
      '<dt class="hm-total">Total</dt><dd class="hm-total">' + money(total) + '</dd></dl>' + (action || '') +
      '<p class="hm-note">Illustrative AED demo pricing. No promotion is applied. No payment is taken; no order is placed with H&amp;M.</p></aside>';
  }
  const emptyBag = '<div class="hm-empty"><p>Your shopping bag is empty.</p><a class="hm-button" href="?page=category" data-hm-route="category">Shop Women</a></div>';
  function renderBag() {
    byId('hmBag').innerHTML = '<h1 class="hm-page-title" id="hmBagTitle" tabindex="-1">Shopping bag</h1>' +
      (state.cart.length ? '<div class="hm-two-col"><div><ul class="hm-lines">' + state.cart.map((l, i) => lineRow(l, i, true)).join('') + '</ul>' +
        '<p class="hm-form-status" id="hmBagStatus" role="status" aria-live="polite"></p></div>' +
        summary(state.cart, '<button class="hm-button" type="button" data-hm-cart="checkout" data-hm-key="checkout">Continue to checkout</button>') + '</div>'
        : emptyBag);
  }
  function renderCheckout() {
    const node = byId('hmCheckout');
    if (!state.cart.length) { node.innerHTML = '<h1 class="hm-page-title" id="hmCheckoutTitle" tabindex="-1">Checkout</h1>' + emptyBag; return; }
    node.innerHTML = '<h1 class="hm-page-title" id="hmCheckoutTitle" tabindex="-1">Checkout</h1>' +
      '<p class="hm-note">Simulated checkout. Do not enter real customer, address or payment details.</p>' +
      '<div class="hm-two-col"><form class="hm-form" id="hmCheckoutForm" novalidate>' +
      '<fieldset><legend>Contact</legend><label for="hmCheckoutEmail">Synthetic email for this demo</label>' +
      '<input id="hmCheckoutEmail" type="email" autocomplete="off" maxlength="254" required aria-describedby="hmCheckoutEmailNote" value="' + escapeHtml(lastEmail) + '">' +
      '<p class="hm-note" id="hmCheckoutEmailNote">Used only on this page for the simulated confirmation. It is not stored, not sent with the order event, not used to sign in and not written to a profile.</p></fieldset>' +
      '<fieldset><legend>Delivery and payment</legend><p>Standard delivery (simulated). No payment details are collected.</p></fieldset>' +
      '<label class="hm-check"><input id="hmCheckoutAck" type="checkbox" required>No payment is taken; no order is placed with H&amp;M.</label>' +
      '<button class="hm-button" type="submit" data-hm-key="place">Complete simulated order</button>' +
      '<p class="hm-form-status" id="hmCheckoutStatus" role="status" aria-live="polite"></p>' +
      '<a href="?page=bag" data-hm-route="bag">Back to shopping bag</a></form>' +
      '<div><ul class="hm-lines">' + state.cart.map((l, i) => lineRow(l, i, false)).join('') + '</ul>' + summary(state.cart) + '</div></div>';
  }
  function renderConfirmation() {
    const order = state.lastOrder;
    byId('hmConfirmation').innerHTML = '<div class="hm-confirm"><h1 class="hm-page-title" id="hmConfirmationTitle" tabindex="-1">' + (order ? 'Thank you for your order' : 'No recent order') + '</h1>' +
      (order
        ? '<p>Demo order reference: <strong>' + escapeHtml(order.orderId) + '</strong></p>' +
          (lastEmail ? '<p>Confirmation shown for ' + escapeHtml(lastEmail) + '. No email is sent.</p>' : '') +
          '<p>' + order.lines.reduce((n, l) => n + l.qty, 0) + ' item(s), ' + money(linesTotal(order.lines)) + ' (illustrative AED demo pricing).</p>' +
          '<p class="hm-note">This was a simulated order. No payment was taken, nothing will ship and no order was placed with H&amp;M.</p>'
        : '<p>There is no simulated order in this browser session for the current Lab context.</p>') +
      '<a class="hm-button" href="?page=category" data-hm-route="category">Continue shopping</a></div>';
  }
  function renderNotFound(route) {
    byId('hmNotFound').innerHTML = '<div class="hm-confirm"><h1 class="hm-page-title" id="hmNotFoundTitle" tabindex="-1">Page not available</h1>' +
      '<p>' + escapeHtml(route.reason) + '</p><a class="hm-button" href="?" data-hm-route="home">Go to the homepage</a></div>';
  }
  function renderChrome() {
    const count = cartCount();
    const badge = byId('hmBagCount');
    badge.textContent = String(count);
    badge.dataset.empty = String(count === 0);
    byId('hmBagLink').setAttribute('aria-label', 'Shopping bag, ' + count + (count === 1 ? ' item' : ' items'));
    let profile = null;
    try { profile = lab()?.profile() || null; } catch { profile = null; }
    byId('hmAccountDot').hidden = !profile;
    byId('hmAccountButton').setAttribute('aria-label', profile ? 'Account: synthetic profile connected' : 'Account');
  }
  function render(route) {
    route = route || parseRoute(global.location.search);
    if (busy) return;
    const focusKey = doc.activeElement?.dataset?.hmKey || '';
    doc.querySelectorAll('#hmMain [data-hm-view]').forEach((view) => { view.hidden = view.dataset.hmView !== route.page; });
    if (route.page === 'category') renderCategory(route);
    else if (route.page === 'product') renderProduct(route);
    else if (route.page === 'bag') renderBag();
    else if (route.page === 'checkout') renderCheckout();
    else if (route.page === 'confirmation') renderConfirmation();
    else if (route.page === 'notfound') renderNotFound(route);
    renderChrome();
    if (focusKey) doc.querySelector('#hmMain [data-hm-key="' + CSS.escape(focusKey) + '"]')?.focus();
  }

  // ---------- Actions ----------
  function setText(id, text, error) {
    const node = byId(id);
    if (node) { node.textContent = text; node.dataset.error = String(!!error); }
  }
  async function addToBag(form) {
    const route = parseRoute(global.location.search);
    if (route.page !== 'product') return;
    const item = BY_SKU.get(route.sku);
    const size = item.sizes.length === 1 ? item.sizes[0] : form.querySelector('input[name="hmSize"]:checked')?.value || '';
    if (!item.sizes.includes(size)) {
      setText('hmSizeError', 'Select a size.', true);
      form.querySelector('input[name="hmSize"]')?.focus();
      return;
    }
    setText('hmSizeError', '');
    const existing = state.cart.find((l) => l.sku === item.sku && l.size === size);
    if (existing && existing.qty >= MAX_QTY) { setText('hmAddStatus', 'Maximum quantity of ' + MAX_QTY + ' reached for this size.', true); return; }
    if (!existing && state.cart.length >= MAX_LINES) { setText('hmAddStatus', 'The demo bag is full.', true); return; }
    try {
      await runAction(async () => {
        setText('hmAddStatus', 'Adding to bag...');
        await pendingProductView;
        await interact('add', payload([{ sku: item.sku, size, qty: 1 }]));
        if (existing) existing.qty += 1; else state.cart.push({ sku: item.sku, size, qty: 1 });
        save();
      });
      renderChrome();
      setText('hmAddStatus', 'Added to bag: ' + item.name + ', size ' + size + '.');
    } catch (error) {
      setText('hmAddStatus', 'Not added to bag. ' + error.message, true);
      report(error);
    }
  }
  async function cartAction(kind, index) {
    if (kind === 'checkout') return startCheckout();
    const line = state.cart[index];
    if (!line) return;
    const type = kind === 'inc' ? 'add' : 'remove';
    const qty = kind === 'remove' ? line.qty : 1;
    if (kind === 'inc' && line.qty >= MAX_QTY) return;
    try {
      await runAction(async () => {
        setText('hmBagStatus', 'Updating bag...');
        await interact(type, payload([{ sku: line.sku, size: line.size, qty }]));
        if (kind === 'inc') line.qty += 1;
        else if (kind === 'dec' && line.qty > 1) line.qty -= 1;
        else state.cart.splice(state.cart.indexOf(line), 1);
        save();
      });
      render();
      setText('hmBagStatus', 'Bag updated.');
    } catch (error) {
      setText('hmBagStatus', 'Bag not changed. ' + error.message, true);
      report(error);
    }
  }
  async function startCheckout() {
    if (!state.cart.length) return;
    try {
      await runAction(async () => {
        setText('hmBagStatus', 'Starting checkout...');
        await interact('checkout', payload(state.cart));
      });
      navigate('?page=checkout');
    } catch (error) {
      setText('hmBagStatus', 'Checkout not started. ' + error.message, true);
      report(error);
    }
  }
  async function placeOrder(form) {
    const email = byId('hmCheckoutEmail').value.trim();
    const ack = byId('hmCheckoutAck');
    if (!EMAIL_RE.test(email)) { setText('hmCheckoutStatus', 'Enter a valid synthetic email address.', true); byId('hmCheckoutEmail').focus(); return; }
    if (!ack.checked) { setText('hmCheckoutStatus', 'Confirm that no payment is taken and no order is placed with H&M.', true); ack.focus(); return; }
    if (!state.cart.length) return;
    const lines = state.cart.map((l) => ({ ...l }));
    const orderId = newOrderId();
    try {
      await runAction(async () => {
        setText('hmCheckoutStatus', 'Completing simulated order...');
        await interact('purchase', payload(lines, { orderId }));
        state.lastOrder = { orderId, lines };
        state.cart = [];
        save();
      });
      lastEmail = email;
      form.reset();
      navigate('?page=confirmation');
    } catch (error) {
      setText('hmCheckoutStatus', 'Order not completed; your bag is unchanged. ' + error.message, true);
      report(error);
    }
  }
  async function connectAccount() {
    const email = byId('hmAccountEmail').value.trim();
    if (!EMAIL_RE.test(email)) { setText('hmAccountStatus', 'Enter a valid synthetic profile email.', true); return; }
    try {
      await runAction(async () => {
        setText('hmAccountStatus', 'Connecting profile...');
        const api = lab();
        if (!api || typeof api.connect !== 'function') throw new Error('Lab controls are unavailable.');
        await api.connect(email);
      });
      setText('hmAccountStatus', 'Existing synthetic profile connected for this browser visitor.');
      renderChrome();
    } catch (error) {
      setText('hmAccountStatus', 'Not connected. ' + error.message, true);
    }
  }

  // ---------- Context ----------
  function applyContext() {
    if (busy) { pendingContext = true; return; }
    if (currentScope() !== scopeKey) { loadScope(); closeDialogs(); render(); } else renderChrome();
  }
  function reset() {
    if (busy) throw new Error('Wait for the current H&M action to finish before resetting.');
    try { global.sessionStorage.removeItem(STORAGE_PREFIX + scopeKey); } catch { /* storage unavailable */ }
    state = emptyState();
    loadScope();
    closeDialogs();
    render();
  }
  function snapshot() {
    return JSON.parse(JSON.stringify({ scope: scopeKey, cart: state.cart, lastOrder: state.lastOrder, route: parseRoute(global.location.search), busy }));
  }

  // ---------- Events ----------
  function openDialog(id, opener) {
    if (busy) return;
    const dialog = byId(id);
    if (!dialog || dialog.open) return;
    closeDialogs();
    dialog.showModal();
    if (opener) { opener.setAttribute('aria-expanded', 'true'); dialog.addEventListener('close', () => { opener.setAttribute('aria-expanded', 'false'); opener.focus(); }, { once: true }); }
    if (id === 'hmSearchDialog') { byId('hmSearchInput').value = ''; renderSearch(''); byId('hmSearchInput').focus(); }
    if (id === 'hmAccountDialog') {
      let profile = null;
      try { profile = lab()?.profile() || null; } catch { profile = null; }
      setText('hmAccountStatus', profile ? 'Connected: ' + (profile.firstName || 'synthetic profile') + '.' : '');
    }
  }
  function renderSearch(query) {
    const q = query.trim().toLowerCase();
    const results = q ? CATALOG.filter((item) => (item.name + ' ' + item.colour + ' ' + item.filter).toLowerCase().includes(q)) : CATALOG.slice(0, 6);
    byId('hmSearchResults').innerHTML = results.length
      ? results.map((item) => '<li><a href="' + productHref(item.sku) + '" data-hm-route="product"><img src="' + item.image + '" alt="" width="450" height="675" loading="lazy"><span>' +
        escapeHtml(item.name) + '</span><span>' + money(item.priceFils) + '</span></a></li>').join('')
      : '<li>No demo products match "' + escapeHtml(query.trim()) + '".</li>';
  }
  function bind() {
    const site = byId('hmCustomerSite');
    site.addEventListener('click', (event) => {
      const link = event.target.closest('a[href]');
      if (link && site.contains(link)) {
        const url = new URL(link.getAttribute('href'), global.location.href);
        if (url.origin === global.location.origin && url.pathname === global.location.pathname && !url.hash) {
          if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          if (busy) { report(new Error('Wait for the current action to finish before leaving this page.')); return; }
          navigate(url.search || '?');
          return;
        }
        if (busy && !url.hash) event.preventDefault();
      }
      const opener = event.target.closest('[data-hm-open]');
      if (opener) { openDialog(opener.dataset.hmOpen, opener); return; }
      const info = event.target.closest('[data-hm-info]');
      if (info) {
        const topic = info.dataset.hmInfo;
        byId('hmInfoTitle').textContent = topic === 'Favourites' ? 'Favourites' : topic;
        byId('hmInfoText').textContent = topic === 'Favourites'
          ? 'Favourites are not available in this demo. Use the shopping bag to keep items.'
          : topic + ' is not part of this H&M demo. The demo covers Women: browse, product details, bag and simulated checkout.';
        openDialog('hmInfoDialog', info);
        return;
      }
      if (event.target.closest('[data-hm-close]')) { if (!busy) event.target.closest('dialog')?.close(); return; }
      const cart = event.target.closest('[data-hm-cart]');
      if (cart && !busy) void cartAction(cart.dataset.hmCart, Number(cart.dataset.hmLine));
    });
    site.addEventListener('change', (event) => {
      if (event.target.name === 'hmSize') {
        const route = parseRoute(global.location.search);
        if (route.page === 'product') pdpSize.set(route.sku, event.target.value);
        setText('hmSizeError', '');
      } else if (event.target.id === 'hmCheckoutAck' && event.target.checked) {
        setText('hmCheckoutStatus', '');
      }
    });
    site.addEventListener('submit', (event) => {
      const form = event.target;
      if (form.id === 'hmAddForm') { event.preventDefault(); if (!busy) void addToBag(form); }
      else if (form.id === 'hmCheckoutForm') { event.preventDefault(); if (!busy) void placeOrder(form); }
      else if (form.id === 'hmAccountForm') { event.preventDefault(); if (!busy) void connectAccount(); }
      else if (form.id === 'hmSearchForm') {
        event.preventDefault();
        byId('hmSearchResults').querySelector('a')?.click();
      } else if (form.id === 'hmNewsletter') {
        event.preventDefault();
        const input = byId('hmNewsletterEmail');
        if (!EMAIL_RE.test(input.value.trim())) { setText('hmNewsletterStatus', 'Enter a valid email address.', true); input.focus(); return; }
        input.value = '';
        setText('hmNewsletterStatus', 'Thank you. Local demo acknowledgement only: no subscription was created and nothing was sent.');
      }
    });
    byId('hmSearchInput').addEventListener('input', (event) => renderSearch(event.target.value));
    site.querySelectorAll('dialog').forEach((dialog) => dialog.addEventListener('cancel', (event) => { if (busy) event.preventDefault(); }));
    global.addEventListener('popstate', () => {
      if (busy) {
        global.history.pushState(null, '', lastUrl);
        report(new Error('Wait for the current action to finish before leaving this page.'));
        return;
      }
      closeDialogs();
      applyRoute();
    });
    global.addEventListener('beforeunload', (event) => { if (busy) { event.preventDefault(); event.returnValue = ''; } });
    global.addEventListener('hm-context-change', applyContext);
  }

  function reserveLabInset() {
    const anchor = byId('hmDemoTopAnchor');
    if (!anchor || typeof global.ResizeObserver !== 'function') return;
    const watch = () => {
      const toolbar = anchor.querySelector('.lab-env-toolbar');
      if (!toolbar) return false;
      const update = () => doc.body.style.setProperty('--hm-lab-inset', Math.ceil(toolbar.getBoundingClientRect().height) + 'px');
      new global.ResizeObserver(update).observe(toolbar);
      update();
      return true;
    };
    if (watch()) return;
    const observer = new global.MutationObserver(() => { if (watch()) observer.disconnect(); });
    observer.observe(anchor, { childList: true, subtree: true });
  }

  function init() {
    reserveLabInset();
    loadScope();
    renderHomeGrid();
    bind();
    applyRoute();
  }
  global.HmStore = Object.freeze({ reset, render: () => render(), state: snapshot, catalog: CATALOG, isBusy: () => busy });
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})(window);
