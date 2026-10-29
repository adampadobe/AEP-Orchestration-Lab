/* Site behaviour for the captured Vuse IT pages: age gate, carousels, catalogue, cart, account, store finder.
 * Authentication, payment and fulfilment are simulated; customer writes require a host acknowledgement. */
(function () {
  'use strict';

  var KEYS = {
    gate: 'vuseAgeGate',
    cart: 'vuseCart',
    identity: 'vuseIdentity',
    abandon: 'vuseAbandonSent',
    consent: 'vuseConsent',
    loyalty: 'vuseLoyalty'
  };
  var PAGE = (location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '') || 'index';
  var CURRENCY = 'EUR';

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  var scope = '';
  var context = null;
  var pending = null;
  var gateReady = false;
  var currentView = '';
  var rootUrl = 'https://www.vuse.com/it/it/' + (PAGE === 'index' ? '' : PAGE);
  function read(key, fallback) {
    if (!scope) return fallback;
    try { var v = localStorage.getItem(scope + key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
  }
  function write(key, value) {
    if (!scope) throw new Error('Waiting for the lab visitor context.');
    localStorage.setItem(scope + key, JSON.stringify(value));
  }
  function view(page, title, url) {
    if (!gateReady || !context || currentView === url) return;
    currentView = url;
    post('pageView', { page: page, title: title, url: url });
  }
  function rootView() { view(PAGE, document.title, rootUrl); }
  function ready() { post('site.ready', { page: PAGE, title: document.title, url: rootUrl }); }
  // Shared Lab recent-identifier cache (email-cache.js, same origin): newest first, max 20.
  function recentEmails() {
    try {
      var list = (JSON.parse(localStorage.getItem('aep-profile-viewer-recent-identifiers-v1')) || {}).email;
      return Array.isArray(list) ? list.filter(function (e) { return typeof e === 'string' && e.indexOf('@') > 0; }).slice(0, 20) : [];
    } catch (e) { return []; }
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) { return '€' + (Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, ''); }
  function el(html) { var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }

  function post(type, payload) {
    if (window.parent === window) return;
    window.parent.postMessage({ source: 'vuse-site', type: type, payload: payload || {} }, location.origin);
  }

  function submitCustomer(payload) {
    if (!context) return Promise.reject(new Error('Waiting for the lab visitor context.'));
    if (pending || read('uncertain', false)) return Promise.reject(new Error('A previous submission is pending or uncertain. Check the lab before retrying; use New visitor only after resolving delivery.'));
    var email = String(payload.email || '').trim().toLowerCase();
    var binding = read('boundEmail', '') || (identity() || {}).email;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return Promise.reject(new Error('Please enter a valid email address.'));
    if (binding && binding.toLowerCase() !== email) return Promise.reject(new Error('Use New visitor in the lab before switching to a different email.'));
    payload.email = email;
    var requestId = 'vuse-' + crypto.randomUUID();
    return new Promise(function (resolve, reject) {
      write('uncertain', { requestId: requestId });
      pending = { requestId: requestId, payload: payload, resolve: resolve, reject: reject };
      pending.timer = setTimeout(function () {
        if (!pending || pending.requestId !== requestId) return;
        pending.timedOut = true;
        pending.reject(new Error('Delivery is uncertain: no acknowledgement received. Do not submit again; check the lab.'));
        // A late acknowledgement cannot safely complete an already dismissed checkout.
      }, 30000);
      window.parent.postMessage({ source: 'vuse-site', type: 'customer.submit', requestId: requestId, payload: payload }, location.origin);
    });
  }

  function result(d) {
    if (!pending || pending.timedOut || d.requestId !== pending.requestId) return;
    var request = pending;
    var p = d.payload || {};
    clearTimeout(request.timer);
    pending = null;
    write('uncertain', p.uncertain ? { requestId: d.requestId } : false);
    if (!p.ok) { request.reject(new Error(p.error || (p.uncertain ? 'Delivery is uncertain. Check the lab before retrying.' : 'The lab rejected this submission.'))); return; }
    if (p.uncertain) { request.reject(new Error('Delivery is uncertain. Check the lab before retrying.')); return; }
    var received = p.identity || {};
    if (!received.email || received.email.toLowerCase() !== request.payload.email) {
      write('uncertain', { requestId: d.requestId });
      request.reject(new Error('The lab acknowledgement did not match this customer. Check the lab before retrying.'));
      return;
    }
    var old = identity() || {};
    var details = Object.assign({}, old.details || {}, request.payload.details || {});
    var id = {
      email: received.email.toLowerCase(),
      firstName: received.firstName || details.firstName || old.firstName || '',
      lastName: received.lastName || details.lastName || old.lastName || '',
      details: details,
      signedIn: true
    };
    write('boundEmail', id.email);
    setIdentity(id);
    if (request.payload.preferences) write(KEYS.consent, request.payload.preferences);
    if (request.payload.loyalty) write(KEYS.loyalty, true);
    request.resolve(p);
  }

  function submitForm(form, payload, success) {
    var error = $('[data-vs-error]', form);
    var buttons = $$('button[type="submit"], [data-vs-save]', form);
    buttons.forEach(function (b) { b.disabled = true; });
    if (error) error.textContent = 'Saving through the lab…';
    return submitCustomer(payload).then(function (p) {
      if (error) error.textContent = '';
      success(p);
    }).catch(function (e) {
      if (error) error.textContent = e.message;
    }).finally(function () {
      buttons.forEach(function (b) { b.disabled = !!read('uncertain', false); });
    });
  }

  function logout() {
    if (pending || read('uncertain', false)) { toast('Resolve the pending or uncertain submission in the lab first.'); return; }
    var id = identity();
    if (id) setIdentity(Object.assign({}, id, { signedIn: false }));
    post('logout', {});
    closeModal();
    toast('Signed out. Use New visitor to switch customer.');
  }

  function toast(msg) {
    var t = el('<div class="vs-toast" role="status">' + esc(msg) + '</div>');
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2600);
  }

  /* ---------- Modal helpers ---------- */
  function openModal(inner, opts) {
    closeModal(true);
    var b = el('<div class="vs-backdrop" data-vs-modal><div class="vs-modal' + (opts && opts.narrow ? ' vs-modal--narrow' : '') +
      '" role="dialog" aria-modal="true"><button class="vs-close" type="button" aria-label="Close">×</button></div></div>');
    var m = b.firstElementChild;
    m.insertAdjacentHTML('beforeend', inner);
    b.addEventListener('click', function (e) { if (e.target === b || e.target.closest('.vs-close')) closeModal(); });
    document.body.appendChild(b);
    document.documentElement.classList.add('vs-locked');
    return m;
  }
  function closeModal(replacing) {
    var hadModal = !!$('[data-vs-modal]');
    $$('[data-vs-modal]').forEach(function (n) { n.remove(); });
    if (!$('.cmp-batcom-agegate.vs-open')) document.documentElement.classList.remove('vs-locked');
    if (hadModal && !replacing) {
      if (drawer && drawer.classList.contains('vs-open')) view('cart', 'Your cart', 'https://www.vuse.com/it/it/checkout/cart');
      else rootView();
    }
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { if ($('[data-vs-modal]')) closeModal(); else closeDrawer(); }
  });

  /* ---------- Identity ---------- */
  function identity() { return read(KEYS.identity, null); }
  function renderAccount() {
    var id = identity();
    $$('a.batcom-bff-accounticon__icon').forEach(function (a) {
      var label = a.querySelector('.vs-account-name');
      if (id && id.signedIn) {
        a.setAttribute('aria-label', 'Hi ' + id.firstName);
        if (!label) { label = el('<span class="vs-account-name"></span>'); a.appendChild(label); }
        label.textContent = id.firstName;
        a.classList.add('vs-signed-in');
      } else {
        a.setAttribute('aria-label', 'Sign in');
        a.classList.remove('vs-signed-in');
        if (label) label.remove();
      }
    });
  }
  function setIdentity(id) { write(KEYS.identity, id); renderAccount(); }

  /* ---------- Age gate ---------- */
  function initAgeGate() {
    var gate = $('.cmp-batcom-agegate');
    if (!gate) return Promise.resolve();
    if (read(KEYS.gate, null) === 'verified') return Promise.resolve();
    return new Promise(function (resolve) {
      var content = $('.batcom-agegate__content', gate);
      gate.classList.remove('batcom-hide');
      if (content) content.classList.remove('batcom-hide');
      gate.classList.add('vs-open');
      document.documentElement.classList.add('vs-locked');
      var over = $('.batcom-agegate__button-over-age .cmp-button', gate);
      var under = $('.batcom-agegate__button-under-age .cmp-button', gate);
      if (over) over.focus({ focusVisible: false });
      over && over.addEventListener('click', function () {
        write(KEYS.gate, 'verified');
        gate.classList.remove('vs-open');
        gate.classList.add('batcom-hide');
        document.documentElement.classList.remove('vs-locked');
        post('ageGate.verified', { page: PAGE, age: 18 });
        resolve();
      });
      under && under.addEventListener('click', function (e) {
        e.preventDefault();
        write(KEYS.gate, 'underage');
        var btns = $('.batcom-agegate__buttons', gate);
        if (btns) btns.innerHTML = '<p class="vs-underage">Sorry, you must be at least 18 years old to access this site.</p>';
        post('ageGate.underage', { page: PAGE });
      });
    });
  }

  /* ---------- Hero carousel (Swiper snapshot) ---------- */
  function params(node, name) {
    try { return JSON.parse(node.getAttribute('data-nc-params-' + name) || '{}'); } catch (e) { return {}; }
  }
  function initSwiper(root, opts) {
    var wrapper = $('.swiper-wrapper', root);
    var slides = wrapper ? $$(':scope > .swiper-slide', wrapper) : [];
    if (!wrapper || slides.length < 1) return;
    root.classList.add('vs-carousel-ready');
    root.style.overflow = 'hidden';
    var index = 0;
    var timer = null;
    function perView() {
      var w = window.innerWidth;
      return w >= 1024 ? (opts.desktop || 1) : w >= 768 ? (opts.tablet || 1) : (opts.mobile || 1);
    }
    function maxIndex() { return Math.max(0, slides.length - perView()); }
    function layout() {
      var pv = perView();
      var gap = pv > 1 ? 20 : 0;
      var width = (root.clientWidth - gap * (pv - 1)) / pv;
      wrapper.style.transitionDuration = '0ms';
      slides.forEach(function (s) {
        s.style.width = width + 'px';
        s.style.marginRight = gap + 'px';
      });
      go(Math.min(index, maxIndex()), true);
    }
    function go(i, instant) {
      index = (i + maxIndex() + 1) % (maxIndex() + 1);
      var step = slides[0].getBoundingClientRect().width + (parseFloat(slides[0].style.marginRight) || 0);
      wrapper.style.transitionDuration = instant ? '0ms' : '450ms';
      wrapper.style.transform = 'translate3d(' + (-index * step) + 'px,0,0)';
      slides.forEach(function (s, n) {
        s.classList.toggle('swiper-slide-active', n === index);
        s.setAttribute('aria-hidden', n < index || n >= index + perView() ? 'true' : 'false');
      });
      bullets.forEach(function (b, n) {
        b.classList.toggle('swiper-pagination-bullet-active', n === index);
        if (n === index) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
      });
    }
    var pag = $('.swiper-pagination', root);
    var bullets = [];
    if (pag) {
      pag.innerHTML = '';
      for (var n = 0; n <= maxIndex(); n++) {
        var b = el('<span class="swiper-pagination-bullet" role="button" tabindex="0" title="Go to slide ' + (n + 1) + '"></span>');
        (function (k) { b.addEventListener('click', function () { go(k); restart(); }); })(n);
        pag.appendChild(b);
        bullets.push(b);
      }
    }
    $$('.swiper-button-next, .cmp-carousel__action--next, .cmp-carouselv2__next, [class*="carousel"][class*="next"]', root).forEach(function (b) {
      b.addEventListener('click', function (e) { e.preventDefault(); go(index + 1); restart(); });
    });
    $$('.swiper-button-prev, .cmp-carousel__action--previous, .cmp-carouselv2__prev, [class*="carousel"][class*="prev"]', root).forEach(function (b) {
      b.addEventListener('click', function (e) { e.preventDefault(); go(index - 1); restart(); });
    });
    var playBtn = $('.cmp-carousel__play-pause', root);
    var playing = !!opts.autoplay;
    function restart() {
      clearInterval(timer);
      if (playing) timer = setInterval(function () { go(index + 1); }, opts.delay || 5000);
    }
    if (playBtn) {
      playBtn.addEventListener('click', function () {
        playing = !playing;
        playBtn.classList.toggle('cmp-carousel__play-pause--playing', playing);
        playBtn.classList.toggle('cmp-carousel__play-pause--paused', !playing);
        restart();
      });
    }
    var x0 = null;
    root.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    root.addEventListener('touchend', function (e) {
      if (x0 == null) return;
      var dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 40) { go(index + (dx < 0 ? 1 : -1)); restart(); }
      x0 = null;
    });
    window.addEventListener('resize', layout);
    layout();
    restart();
  }
  function initCarousels() {
    $$('[data-nc="Carousel"]').forEach(function (c) {
      var p = params(c, 'carousel');
      initSwiper($('.swiper', c) || c, { autoplay: p.autoplay !== false, delay: p.delay || 5000, desktop: 1, tablet: 1, mobile: 1 });
    });
    $$('[data-nc="CarouselV2"]').forEach(function (c) {
      var p = params(c, 'carouselv2');
      initSwiper($('.swiper', c) || c, {
        autoplay: !!p.autoplay, delay: p.delay || 5000,
        desktop: p.noOfColumnsDesktop || 2, tablet: p.noOfColumnsTablet || 2, mobile: p.noOfColumnsMobile || 1
      });
    });
  }

  /* ---------- Product rail ---------- */
  function initProductRails() {
    $$('.product-card').forEach(function (card) {
      var quantity = $('[data-key="quantity"]', card);
      if (quantity && productFromCard(card).purchasable) quantity.classList.remove('batcom-hide');
    });
    $$('.cmp-list__carousel-skeleton-wrapper, .batcom-dynamiclist__skeleton-container').forEach(function (n) { n.style.display = 'none'; });
    $$('[data-nc="ProductListCarousel"]').forEach(function (rail) {
      var ul = $('ul.batcom-dynamiclist__products', rail);
      if (!ul) return;
      ul.classList.add('vs-scroll');
      var items = $$(':scope > li', ul);
      var dots = $$('.dot', rail);
      function step() { return items[0] ? items[0].getBoundingClientRect().width : 240; }
      var prev = $('.cmp-list__carousel-prev', rail);
      var next = $('.cmp-list__carousel-next', rail);
      prev && prev.addEventListener('click', function () { ul.scrollBy({ left: -step() * 2, behavior: 'smooth' }); });
      next && next.addEventListener('click', function () { ul.scrollBy({ left: step() * 2, behavior: 'smooth' }); });
      dots.forEach(function (d, i) {
        d.addEventListener('click', function () { ul.scrollTo({ left: i * step(), behavior: 'smooth' }); });
      });
      ul.addEventListener('scroll', function () {
        var i = Math.round(ul.scrollLeft / step());
        dots.forEach(function (d, n) { d.classList.toggle('active', n === i); });
      }, { passive: true });
    });
  }

  /* ---------- Catalogue ---------- */
  function nicotineOf(name) {
    var m = /(\d+(?:[.,]\d+)?)\s*mg/i.exec(name || '');
    return m ? parseFloat(m[1].replace(',', '.')) : null;
  }
  function categoryOf(name, href) {
    var s = ((name || '') + ' ' + (href || '')).toLowerCase();
    if (/pod|liquid|e-liquid/.test(s)) return 'Pods & e-liquids';
    if (/go|monouso|disposable|box/.test(s)) return 'Disposable';
    if (/pro|kit|device|reload|epen|ricaric/.test(s)) return 'Rechargeable';
    return 'Vuse';
  }
  function productFromCard(card) {
    var link = $('.product-card__link[data-vuse-href]', card);
    var name = ($('.product-card__name', card) || {}).textContent || '';
    var priceText = ($('.product-card__price', card) || {}).textContent || '';
    var img = $('.product-card__image img', card);
    var price = parseFloat(priceText.replace(/[^\d,.]/g, '').replace(',', '.')) || null;
    var href = link ? link.getAttribute('data-vuse-href') : '';
    name = name.trim();
    var nic = nicotineOf(name);
    return {
      sku: card.getAttribute('data-key-sku') || href.split('/').pop(),
      name: name,
      href: href,
      price: price,
      currency: CURRENCY,
      image: img ? img.getAttribute('src') : '',
      nicotine: nic,
      category: categoryOf(name, href),
      purchasable: price != null && (nic === 0 || nic === null && /zero|0 ?mg/i.test(name))
    };
  }
  function productFromHref(href, label) {
    var slug = href.split('/').pop().replace(/\.html$/, '');
    var card = $$('.product-card').filter(function (c) {
      var l = $('.product-card__link[data-vuse-href]', c);
      return l && l.getAttribute('data-vuse-href') === href;
    })[0];
    if (card) return productFromCard(card);
    var name = label || slug.replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    return {
      sku: slug, name: name, href: href, price: null, currency: CURRENCY, image: '',
      nicotine: nicotineOf(name), category: categoryOf(name, href), purchasable: false
    };
  }

  function openProduct(p) {
    post('productView', { sku: p.sku, name: p.name, href: p.href, price: p.price, currency: CURRENCY, category: p.category });
    var zeroOnly = p.purchasable;
    var strengths = zeroOnly ? ['0 mg/ml'] : ['0 mg/ml', '6 mg/ml', '12 mg/ml', '18 mg/ml', '20 mg/ml'];
    var current = p.nicotine != null ? p.nicotine + ' mg/ml' : strengths[0];
    if (strengths.indexOf(current) < 0) strengths.unshift(current);
    var m = openModal(
      '<div class="vs-pdp">' +
        '<div class="vs-pdp__img">' + (p.image ? '<img src="' + esc(p.image) + '" alt="' + esc(p.name) + '">' : '') + '</div>' +
        '<div>' +
          '<h2>' + esc(p.name) + '</h2>' +
          (p.price != null ? '<div class="vs-pdp__price">' + money(p.price) + '</div>' : '') +
          '<div class="vs-pdp__label">Nicotine strength</div>' +
          '<div class="vs-chips" data-vs-strength>' + strengths.map(function (s) {
            return '<button type="button" class="vs-chip" aria-pressed="' + (s === current) + '">' + esc(s) + '</button>';
          }).join('') + '</div>' +
          (zeroOnly
            ? '<label class="vs-sub"><input type="checkbox" data-vs-subscribe><span><strong>Subscribe &amp; save</strong>Delivered every month. Pause or cancel anytime.</span></label>' +
              '<div class="vs-pdp__label">Quantity</div>' +
              '<div class="vs-chips" data-vs-qty>' + [1, 2, 3, 5].map(function (q, i) {
                return '<button type="button" class="vs-chip" aria-pressed="' + (i === 0) + '">' + q + '</button>';
              }).join('') + '</div>' +
              '<div class="vs-actions" style="margin-top:24px"><button type="button" class="vs-btn vs-btn--block" data-vs-add>Add to cart</button>' +
              '<a href="store-locator.html" class="vs-btn vs-btn--ghost vs-btn--block">Find a store</a></div>'
            : '<p class="vs-note">Starting January 1, 2025, products containing nicotine are no longer available for sale on our website. You can still find them at authorised retailers.</p>' +
              '<div class="vs-actions"><a href="store-locator.html" class="vs-btn vs-btn--block">Find a store</a></div>') +
        '</div>' +
      '</div>');
    var productPath;
    try { productPath = new URL(p.href, 'https://www.vuse.com').pathname; } catch (e) { productPath = '/it/it/products/' + encodeURIComponent(p.sku); }
    if (productPath.indexOf('/it/it/products/') !== 0) productPath = '/it/it/products/' + encodeURIComponent(p.sku);
    view('product', p.name, 'https://www.vuse.com' + productPath);
    $$('[data-vs-strength] .vs-chip, [data-vs-qty] .vs-chip', m).forEach(function (c) {
      c.addEventListener('click', function () {
        $$('.vs-chip', c.parentNode).forEach(function (x) { x.setAttribute('aria-pressed', String(x === c)); });
      });
    });
    var add = $('[data-vs-add]', m);
    add && add.addEventListener('click', function () {
      var qtyChip = $('[data-vs-qty] .vs-chip[aria-pressed="true"]', m);
      var qty = qtyChip ? parseInt(qtyChip.textContent, 10) : 1;
      var sub = $('[data-vs-subscribe]', m);
      addToCart(p, qty);
      if (sub && sub.checked) post('subscription.intent', { sku: p.sku, name: p.name, frequency: 'monthly', price: p.price, currency: CURRENCY });
      closeModal(true);
      openDrawer();
    });
  }

  /* ---------- Cart ---------- */
  function cart() { return read(KEYS.cart, []); }
  function cartTotal(items) { return items.reduce(function (t, i) { return t + (i.price || 0) * i.qty; }, 0); }
  function addToCart(p, qty) {
    var items = cart();
    var line = items.filter(function (i) { return i.sku === p.sku; })[0];
    if (line) line.qty += qty; else items.push({ sku: p.sku, name: p.name, price: p.price, qty: qty, image: p.image, nicotine: p.nicotine });
    write(KEYS.cart, items);
    post('commerce.productListAdds', { sku: p.sku, name: p.name, price: p.price, qty: qty, currency: CURRENCY, nicotine: p.nicotine == null ? 0 : p.nicotine });
    renderBasket();
  }
  function renderBasket() {
    var count = cart().reduce(function (t, i) { return t + i.qty; }, 0);
    $$('.batcom-bff-minibasket').forEach(function (mb) {
      mb.classList.toggle('batcom-bff-minibasket--is-empty', count === 0);
      mb.style.position = 'relative';
      mb.style.cursor = 'pointer';
      var badge = $('.vs-badge', mb);
      if (count && !badge) { badge = el('<span class="vs-badge"></span>'); mb.appendChild(badge); }
      if (badge) { if (count) badge.textContent = count; else badge.remove(); }
    });
  }
  var drawer = null;
  function openDrawer() {
    view('cart', 'Your cart', 'https://www.vuse.com/it/it/checkout/cart');
    if (!drawer) {
      drawer = el('<aside class="vs-drawer" aria-label="Cart"><div class="vs-drawer__head"><h3>Your cart</h3>' +
        '<button class="vs-close" style="position:static" type="button" aria-label="Close">×</button></div>' +
        '<div class="vs-drawer__body"></div><div class="vs-drawer__foot"></div></aside>');
      $('.vs-close', drawer).addEventListener('click', closeDrawer);
      document.body.appendChild(drawer);
    }
    var items = cart();
    var body = $('.vs-drawer__body', drawer);
    var foot = $('.vs-drawer__foot', drawer);
    body.innerHTML = items.length ? items.map(function (i) {
      return '<div class="vs-line">' + (i.image ? '<img src="' + esc(i.image) + '" alt="">' : '<span></span>') +
        '<div><strong>' + esc(i.name) + '</strong><label>Quantity <input type="number" min="1" max="99" value="' + i.qty + '" data-vs-line-qty="' + esc(i.sku) + '" aria-label="Quantity for ' + esc(i.name) + '"></label>' +
        '<button type="button" class="vs-link" data-vs-remove="' + esc(i.sku) + '" style="font-size:13px">Remove</button></div>' +
        '<strong>' + money((i.price || 0) * i.qty) + '</strong></div>';
    }).join('') : '<p class="vs-empty">Your cart is empty.</p>';
    foot.innerHTML = items.length
      ? '<div class="vs-total"><span>Total</span><span>' + money(cartTotal(items)) + '</span></div>' +
        '<button type="button" class="vs-btn vs-btn--block" data-vs-checkout>Checkout</button>'
      : '';
    $$('[data-vs-remove]', body).forEach(function (b) {
      b.addEventListener('click', function () {
        write(KEYS.cart, cart().filter(function (i) { return i.sku !== b.getAttribute('data-vs-remove'); }));
        renderBasket();
        openDrawer();
      });
      $$('[data-vs-line-qty]', body).forEach(function (input) {
        input.addEventListener('change', function () {
          var qty = Number(input.value);
          var lines = cart();
          var line = lines.filter(function (i) { return i.sku === input.getAttribute('data-vs-line-qty'); })[0];
          if (!Number.isInteger(qty) || qty < 1 || qty > 99) { toast('Choose a quantity between 1 and 99.'); input.value = line ? line.qty : 1; return; }
          if (line) line.qty = qty;
          write(KEYS.cart, lines);
          renderBasket();
          if (line) $(':scope > strong', input.closest('.vs-line')).textContent = money((line.price || 0) * qty);
          $('.vs-total span:last-child', foot).textContent = money(cartTotal(lines));
        });
      });
    });
    var co = $('[data-vs-checkout]', foot);
    co && co.addEventListener('click', function () { drawer.classList.remove('vs-open'); openCheckout(); });
    requestAnimationFrame(function () { drawer.classList.add('vs-open'); });
  }
  function closeDrawer() {
    if (!drawer || !drawer.classList.contains('vs-open')) return;
    drawer.classList.remove('vs-open');
    rootView();
  }
  function abandonCart() {
    var items = cart();
    if (!items.length || read(KEYS.abandon, false)) return;
    write(KEYS.abandon, true);
    post('cart.abandon', { items: items, total: cartTotal(items), currency: CURRENCY });
  }

  function openCheckout() {
    var id = identity() || {};
    var items = cart();
    if (!items.length) { toast('Add a product before checking out.'); return; }
    var m = openModal(
      '<h2>Checkout</h2>' +
      '<p class="vs-note">Demo checkout: payment and fulfilment are simulated. No payment details are collected and no email is sent.</p>' +
      '<form class="vs-form" novalidate>' +
        customerFields(id, true) +
        '<div class="vs-field"><label>Email</label><input name="email" type="email" required value="' + esc(id.email || '') + '"></div>' +
        '<div class="vs-total" style="margin-top:8px"><span>Total</span><span>' + money(cartTotal(items)) + '</span></div>' +
        '<div class="vs-error" data-vs-error></div>' +
        '<button class="vs-btn vs-btn--block" type="submit">Place order</button>' +
      '</form>', { narrow: true });
    view('checkout', 'Checkout', 'https://www.vuse.com/it/it/checkout');
    $('form', m).addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target;
      if (!validForm(f)) return;
      var orderId = 'VIT-' + crypto.randomUUID();
      submitForm(f, { action: 'checkout', email: field(f, 'email'), details: customerDetails(f), items: items, total: cartTotal(items), currency: CURRENCY, orderId: orderId }, function () {
        write(KEYS.cart, []);
        write(KEYS.abandon, true);
        renderBasket();
        m.innerHTML = '<button class="vs-close" type="button" aria-label="Close">×</button>' +
          '<h2>Demo order confirmed</h2><p>Your simulated order number is <strong>' + esc(orderId) + '</strong>.</p>' +
          '<p>Payment and fulfilment are simulated. No charge, shipment or confirmation email has been made.</p>' +
          '<div class="vs-actions" style="margin-top:20px"><button type="button" class="vs-btn vs-btn--block" data-vs-done>Continue shopping</button></div>';
        view('confirmation', 'Demo order confirmed', 'https://www.vuse.com/it/it/checkout/confirmation');
        $('[data-vs-done]', m).addEventListener('click', function () { closeModal(); });
      });
    });
  }

  /* ---------- Account ---------- */
  function field(form, name) { var input = form.elements.namedItem(name); return input ? input.value.trim() : ''; }
  function customerFields(id, shippingRequired) {
    var d = id.details || {};
    var a = d.address || {};
    return [
      ['firstName', 'First name', d.firstName || id.firstName, 'text', true],
      ['lastName', 'Last name', d.lastName || id.lastName, 'text', true],
      ['dateOfBirth', 'Date of birth', d.dateOfBirth, 'date', !shippingRequired],
      ['phone', 'Phone', d.phone, 'tel', false],
      ['street1', 'Street address', a.street1, 'text', shippingRequired],
      ['city', 'City', a.city, 'text', shippingRequired],
      ['postalCode', 'Postcode', a.postalCode, 'text', shippingRequired],
      ['countryCode', 'Country code (2 letters)', a.countryCode, 'text', shippingRequired]
    ].map(function (f) {
      return '<div class="vs-field"><label>' + f[1] + '<input name="' + f[0] + '" type="' + f[3] + '" value="' + esc(f[2] || '') + '"' + (f[4] ? ' required' : '') + (f[0] === 'countryCode' ? ' maxlength="2" pattern="[A-Za-z]{2}"' : '') + '></label></div>';
    }).join('');
  }
  function customerDetails(form) {
    var d = {};
    ['firstName', 'lastName', 'dateOfBirth', 'phone'].forEach(function (name) { if (field(form, name)) d[name] = field(form, name); });
    var address = {};
    ['street1', 'city', 'postalCode', 'countryCode'].forEach(function (name) {
      var value = field(form, name);
      if (value) address[name] = name === 'countryCode' ? value.toUpperCase() : value;
    });
    if (Object.keys(address).length) d.address = address;
    return d;
  }
  function adult(dob) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) return false;
    var birth = new Date(dob + 'T00:00:00Z');
    if (!Number.isFinite(birth.getTime()) || birth.toISOString().slice(0, 10) !== dob) return false;
    var today = new Date();
    var age = today.getFullYear() - birth.getUTCFullYear();
    if (today.getMonth() < birth.getUTCMonth() || (today.getMonth() === birth.getUTCMonth() && today.getDate() < birth.getUTCDate())) age--;
    return age >= 18;
  }
  function validForm(form) {
    var error = $('[data-vs-error]', form);
    if (!form.checkValidity() || $$('input[required]', form).some(function (i) { return !i.value.trim(); })) {
      error.textContent = 'Please complete all required fields with valid values.'; return false;
    }
    if (field(form, 'email') && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(field(form, 'email'))) {
      error.textContent = 'Please enter a valid email address.'; return false;
    }
    if (field(form, 'dateOfBirth') && !adult(field(form, 'dateOfBirth'))) {
      error.textContent = 'You must be at least 18 years old.'; return false;
    }
    return true;
  }
  var BRANDS = [['vuse', 'Vuse'], ['velo', 'Velo'], ['glo', 'glo']];
  var CHANNELS = [['email', 'Email'], ['sms', 'SMS'], ['whatsapp', 'WhatsApp']];
  function consentTable(state) {
    state = state || {};
    return '<table class="vs-consent"><thead><tr><th>Brand</th>' + CHANNELS.map(function (c) { return '<th>' + c[1] + '</th>'; }).join('') +
      '</tr></thead><tbody>' + BRANDS.map(function (b) {
        return '<tr><td>' + b[1] + '</td>' + CHANNELS.map(function (c) {
          var on = state[b[0]] && state[b[0]][c[0]];
          return '<td><input type="checkbox" aria-label="' + b[1] + ' ' + c[1] + '" data-vs-consent="' + b[0] + '.' + c[0] + '"' + (on ? ' checked' : '') + '></td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table>';
  }
  function readConsent(root) {
    var out = {};
    BRANDS.forEach(function (b) { out[b[0]] = {}; CHANNELS.forEach(function (c) { out[b[0]][c[0]] = false; }); });
    $$('[data-vs-consent]', root).forEach(function (i) {
      var k = i.getAttribute('data-vs-consent').split('.');
      out[k[0]][k[1]] = i.checked;
    });
    return out;
  }

  function openAccount(initialTab) {
    var id = identity();
    if (id && id.signedIn) return openProfile(id);
    var m = openModal(
      '<p class="vs-note">Synthetic customers only. Authentication is simulated; do not enter a real password. Customer details are saved through the lab.</p>' +
      '<div class="vs-tabs" role="tablist"><button class="vs-tab" role="tab" aria-selected="true" data-vs-tab="signin">Sign in</button>' +
      '<button class="vs-tab" role="tab" aria-selected="false" data-vs-tab="register">Create account</button></div>' +
      '<form class="vs-form" data-vs-panel="signin" novalidate>' +
        '<div class="vs-field"><label>Email</label><input name="email" type="email" autocomplete="off" list="vsRecentEmails" required>' +
        '<datalist id="vsRecentEmails">' + recentEmails().map(function (e) { return '<option value="' + esc(e) + '">'; }).join('') + '</datalist></div>' +
        '<div class="vs-error" data-vs-error></div>' +
        '<button class="vs-btn vs-btn--block" type="submit">Sign in</button>' +
      '</form>' +
      '<form class="vs-form" data-vs-panel="register" hidden novalidate>' +
        customerFields({}, false) +
        '<div class="vs-field"><label>Email</label><input name="email" type="email" autocomplete="email" required></div>' +
        '<h3 style="margin-top:8px">Stay in touch</h3>' +
        '<p class="vs-note" style="margin-top:0">Choose how BAT Italia brands may contact you with news and offers.</p>' +
        consentTable({}) +
        '<label class="vs-loyalty"><input type="checkbox" data-vs-loyalty><span><strong>Join Vuse Rewards</strong>Earn points on every purchase and unlock exclusive offers.</span></label>' +
        '<label class="vs-check"><input type="checkbox" data-vs-terms required><span>I confirm I am over 18 and accept the Terms and Conditions and Privacy Policy.</span></label>' +
        '<div class="vs-error" data-vs-error></div>' +
        '<button class="vs-btn vs-btn--block" type="submit">Create account</button>' +
      '</form>', { narrow: false });
    $$('[data-vs-tab]', m).forEach(function (t) {
      t.addEventListener('click', function () {
        var which = t.getAttribute('data-vs-tab');
        $$('[data-vs-tab]', m).forEach(function (x) { x.setAttribute('aria-selected', String(x === t)); });
        $$('[data-vs-panel]', m).forEach(function (p) { p.hidden = p.getAttribute('data-vs-panel') !== which; });
        view('account-' + which, which === 'register' ? 'Create account' : 'Sign in', 'https://www.vuse.com/it/it/customer/account/' + (which === 'register' ? 'create' : 'login'));
      });
    });
    $('[data-vs-tab="' + (initialTab === 'register' ? 'register' : 'signin') + '"]', m).click();
    $('[data-vs-panel="signin"]', m).addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target;
      if (!validForm(f)) return;
      submitForm(f, { action: 'login', email: field(f, 'email') }, function () {
        closeModal();
        toast('Simulated sign in complete');
      });
    });
    $('[data-vs-panel="register"]', m).addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target;
      if (!validForm(f)) return;
      submitForm(f, { action: 'register', email: field(f, 'email'), details: customerDetails(f), preferences: readConsent(f), loyalty: $('[data-vs-loyalty]', f).checked }, function () {
        closeModal();
        toast('Demo account saved');
      });
    });
  }

  function openProfile(id) {
    var joined = read(KEYS.loyalty, false);
    var m = openModal(
      '<h2>Hi ' + esc(id.firstName) + '</h2><p class="vs-note" style="margin-top:0">' + esc(id.email) + '</p>' +
      '<form class="vs-form" novalidate>' + customerFields(id, false) +
      '<h3 style="margin-top:20px">Communication preferences</h3>' + consentTable(read(KEYS.consent, {})) +
      (joined ? '<p><strong>Vuse Rewards</strong> · Member</p>'
        : '<label class="vs-loyalty"><input type="checkbox" data-vs-loyalty><span><strong>Join Vuse Rewards</strong>Earn points on every purchase and unlock exclusive offers.</span></label>') +
      '<div class="vs-error" data-vs-error></div>' +
      '<div class="vs-actions"><button type="submit" class="vs-btn vs-btn--block" data-vs-save>Save profile and preferences</button>' +
      '<button type="button" class="vs-btn vs-btn--ghost vs-btn--block" data-vs-signout>Sign out</button></div></form>', { narrow: true });
    view('account', 'My account', 'https://www.vuse.com/it/it/customer/account');
    $('form', m).addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target;
      if (!validForm(f)) return;
      var l = $('[data-vs-loyalty]', m);
      submitForm(f, { action: 'profile', email: id.email, details: customerDetails(f), preferences: readConsent(f), loyalty: !!(l && l.checked) }, function () {
        closeModal();
        toast('Your profile and preferences have been saved');
      });
    });
    $('[data-vs-signout]', m).addEventListener('click', logout);
  }

  /* ---------- Store locator ---------- */
  function initStoreLocator() {
    var root = $('.batcom-storelocator');
    if (!root) return;
    var input = $('input.mapboxgl-ctrl-geocoder--input', root);
    var listing = $('.batcom-storelocator--listing', root);
    var map = $('.batcom-storelocator--map', root);
    if (map) map.style.display = 'none';
    if (!input || !listing) return;
    function search() {
      listing.innerHTML = '<p class="vs-note" role="status">Live store search and geolocation are not connected in this demo. No retailer results or distances are available.</p>';
    }
    search();
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); search(input.value); } });
    var go = $('.mapboxgl-ctrl-geocoder--icon-search', root);
    go && go.addEventListener('click', function () { search(input.value); });
    var loc = $('.batcom-storelocator--getloc', root);
    loc && loc.addEventListener('click', function (e) { e.preventDefault(); search(); });
  }

  /* ---------- Accordions, nav, forms ---------- */
  function openSearch(initialQuery) {
    var products = $$('.product-card').map(productFromCard).filter(function (p, index, list) {
      return list.findIndex(function (other) { return other.sku === p.sku; }) === index;
    });
    var m = openModal('<h2>Search captured products</h2><form class="vs-form"><label>Search <input name="query" type="search" value="' + esc(initialQuery || '') + '"></label><button type="submit" class="vs-btn">Search</button></form><div data-vs-results aria-live="polite"></div>');
    function search() {
      var query = field($('form', m), 'query').toLowerCase();
      var matches = products.filter(function (p) { return p.name.toLowerCase().indexOf(query) !== -1; });
      var results = $('[data-vs-results]', m);
      results.innerHTML = matches.length ? matches.map(function (p, index) {
        return '<p><button class="vs-link" type="button" data-vs-result="' + index + '">' + esc(p.name) + '</button></p>';
      }).join('') : '<p>No matching products in this captured page.</p>';
      $$('[data-vs-result]', results).forEach(function (b) { b.addEventListener('click', function () { openProduct(matches[Number(b.getAttribute('data-vs-result'))]); }); });
    }
    $('form', m).addEventListener('submit', function (e) { e.preventDefault(); search(); });
    search();
    view('search', 'Search captured products', 'https://www.vuse.com/it/it/search');
  }
  function initAccordions() {
    $$('.cmp-accordion__button').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.preventDefault();
        var panel = document.getElementById(b.getAttribute('aria-controls'));
        var open = b.getAttribute('aria-expanded') !== 'true';
        b.setAttribute('aria-expanded', String(open));
        b.classList.toggle('cmp-accordion__button--expanded', open);
        if (panel) {
          panel.classList.toggle('cmp-accordion__panel--expanded', open);
          panel.classList.toggle('cmp-accordion__panel--hidden', !open);
          panel.setAttribute('aria-hidden', String(!open));
        }
      });
    });
  }
  function initNav() {
    $$('li.cmp-navigation__item--mega-nav').forEach(function (li) {
      var fly = $('.cmp-navigation__mega-nav-desktop-flyout', li);
      if (!fly) return;
      li.addEventListener('focusin', function () { fly.classList.add('is-flyout-visible'); });
      li.addEventListener('focusout', function (e) { if (!li.contains(e.relatedTarget)) fly.classList.remove('is-flyout-visible'); });
    });
    $$('form').forEach(function (f) {
      if (f.closest('[data-vs-modal]')) return;
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var input = $('input[name="fulltext"]', f);
        if (input) openSearch(input.value);
        else toast('This captured form is not connected to a live service.');
      });
    });
  }

  /* ---------- Click routing ---------- */
  function onClick(e) {
    if (!context || !gateReady) {
      if (!e.target.closest('.cmp-batcom-agegate')) { e.preventDefault(); toast('Complete the age check after the lab visitor is ready.'); }
      return;
    }
    if (e.target.closest('[data-vs-modal], .vs-drawer, .cmp-batcom-agegate')) {
      if (e.target.closest('[data-vs-noop]')) e.preventDefault();
      return;
    }
    if (e.target.closest('.batcom-bff-minibasket')) { e.preventDefault(); openDrawer(); return; }
    if (e.target.closest('.cmp-search__toggle')) { e.preventDefault(); openSearch(); return; }
    if (e.target.closest('a.batcom-bff-accounticon__icon')) { e.preventDefault(); openAccount(); return; }

    var card = e.target.closest('.product-card');
    if (card) {
      var buy = e.target.closest('.product-card__buy-button');
      if (buy) {
        e.preventDefault();
        var p = productFromCard(card);
        var quantity = Number(($('.product-card__buy-quantityInput', card) || {}).value) || 1;
        if (p.purchasable) { addToCart(p, quantity); openDrawer(); } else openProduct(p);
        return;
      }
      var quantityButton = e.target.closest('.product-card__buy-quantityBtn');
      if (quantityButton) {
        e.preventDefault();
        var input = $('.product-card__buy-quantityInput', card);
        if (input) input.value = Math.max(1, Math.min(99, (Number(input.value) || 1) + (quantityButton.getAttribute('data-key') === 'increase-amount' ? 1 : -1)));
        return;
      }
      if (e.target.closest('a, .product-card__image, .product-card__name')) { e.preventDefault(); openProduct(productFromCard(card)); return; }
    }

    var a = e.target.closest('a');
    if (!a) return;
    var vh = a.getAttribute('data-vuse-href');
    var href = a.getAttribute('href') || '';
    if (vh) {
      e.preventDefault();
      if (/velo/i.test(vh)) { toast('The Velo storefront is not included in this captured demo.'); return; }
      if (/\/products\//.test(vh)) { openProduct(productFromHref(vh, a.textContent.trim())); return; }
      if (/logout|signout/.test(vh)) { logout(); return; }
      if (/customer\/account|login|register/.test(vh)) { openAccount(/register|account\/create/.test(vh) ? 'register' : 'signin'); return; }
      if (/checkout\/cart/.test(vh)) { openDrawer(); return; }
      toast('This destination is not included in this captured demo.');
      return;
    }
    if (/logout|signout/.test(href)) { e.preventDefault(); logout(); return; }
    if (/customer\/account|login|register/.test(href)) { e.preventDefault(); openAccount(/register|account\/create/.test(href) ? 'register' : 'signin'); return; }
    if (href === '#' || /^https?:/i.test(href) || /^(mailto|tel):/i.test(href)) { e.preventDefault(); toast('This link is not connected to a live service in the demo.'); }
  }

  /* ---------- Host bridge ---------- */
  function onMessage(e) {
    if (e.origin !== location.origin || e.source !== window.parent) return;
    var d = e.data || {};
    if (d.source !== 'vuse-shell') return;
    if (d.type === 'site.requestContext') {
      ready();
    } else if (d.type === 'site.context' && d.payload) {
      var c = d.payload;
      if (typeof c.sandbox !== 'string' || typeof c.visitorKey !== 'string' || !c.sandbox || !c.visitorKey) return;
      var nextScope = 'vuseShopper:' + c.sandbox + ':' + c.visitorKey + ':';
      if (context && nextScope === scope) return;
      if (context) { location.reload(); return; }
      context = c;
      scope = nextScope;
      renderAccount();
      renderBasket();
      var stored = identity();
      if (stored && stored.signedIn) {
        setIdentity(Object.assign({}, stored, { signedIn: false }));
        submitCustomer({ action: 'resume', email: stored.email }).catch(function (error) { toast(error.message); });
      }
      initAgeGate().then(function () { gateReady = true; rootView(); });
    } else if (d.type === 'customer.result') {
      result(d);
    } else if (d.type === 'reset') {
      resetAll();
    }
  }
  function resetAll() {
    if (pending) { clearTimeout(pending.timer); pending.reject(new Error('Visitor reset.')); pending = null; }
    Object.keys(localStorage).forEach(function (k) { if (k.indexOf('vuseShopper:') === 0) localStorage.removeItem(k); });
    Object.keys(KEYS).forEach(function (key) { sessionStorage.removeItem(KEYS[key]); });
    location.reload();
  }

  window.VuseSite = {
    resetAll: resetAll,
    abandonCart: abandonCart,
    openAccount: openAccount,
    openCart: openDrawer
  };

  function boot() {
    document.addEventListener('click', onClick);
    window.addEventListener('message', onMessage);
    initNav();
    initAccordions();
    initCarousels();
    initProductRails();
    initStoreLocator();
    renderAccount();
    renderBasket();
    ready();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
