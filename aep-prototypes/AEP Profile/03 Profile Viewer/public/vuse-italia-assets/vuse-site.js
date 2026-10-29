/* Site behaviour for the captured Vuse IT pages: age gate, carousels, catalogue, cart, account, store finder.
 * All interactions are local; data capture is relayed to the host frame via postMessage. */
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
  function read(key, fallback) {
    try { var v = sessionStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
  }
  function write(key, value) { sessionStorage.setItem(key, JSON.stringify(value)); }
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

  function toast(msg) {
    var t = el('<div class="vs-toast" role="status">' + esc(msg) + '</div>');
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2600);
  }

  /* ---------- Modal helpers ---------- */
  function openModal(inner, opts) {
    closeModal();
    var b = el('<div class="vs-backdrop" data-vs-modal><div class="vs-modal' + (opts && opts.narrow ? ' vs-modal--narrow' : '') +
      '" role="dialog" aria-modal="true"><button class="vs-close" type="button" aria-label="Close">×</button></div></div>');
    var m = b.firstElementChild;
    m.insertAdjacentHTML('beforeend', inner);
    b.addEventListener('click', function (e) { if (e.target === b || e.target.closest('.vs-close')) closeModal(); });
    document.body.appendChild(b);
    document.documentElement.classList.add('vs-locked');
    return m;
  }
  function closeModal() {
    $$('[data-vs-modal]').forEach(function (n) { n.remove(); });
    if (!$('.cmp-batcom-agegate.vs-open')) document.documentElement.classList.remove('vs-locked');
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeModal(); closeDrawer(); } });

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
      closeModal();
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
        '<div><strong>' + esc(i.name) + '</strong><small>Qty ' + i.qty + '</small>' +
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
    });
    var co = $('[data-vs-checkout]', foot);
    co && co.addEventListener('click', function () { drawer.classList.remove('vs-open'); openCheckout(); });
    requestAnimationFrame(function () { drawer.classList.add('vs-open'); });
  }
  function closeDrawer() {
    if (!drawer || !drawer.classList.contains('vs-open')) return;
    drawer.classList.remove('vs-open');
    abandonCart();
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
    var m = openModal(
      '<h2>Checkout</h2>' +
      '<form class="vs-form" novalidate>' +
        '<div class="vs-row"><div class="vs-field"><label>First name</label><input name="firstName" required value="' + esc(id.firstName || '') + '"></div>' +
        '<div class="vs-field"><label>Last name</label><input name="lastName" required value="' + esc(id.lastName || '') + '"></div></div>' +
        '<div class="vs-field"><label>Email</label><input name="email" type="email" required value="' + esc(id.email || '') + '"></div>' +
        '<div class="vs-field"><label>Address</label><input name="address" required value="' + (id.signedIn ? 'Via Torino 21' : '') + '"></div>' +
        '<div class="vs-row"><div class="vs-field"><label>City</label><input name="city" required value="' + (id.signedIn ? 'Milano' : '') + '"></div>' +
        '<div class="vs-field"><label>Postcode</label><input name="zip" required value="' + (id.signedIn ? '20123' : '') + '"></div></div>' +
        '<div class="vs-total" style="margin-top:8px"><span>Total</span><span>' + money(cartTotal(items)) + '</span></div>' +
        '<div class="vs-error" data-vs-error></div>' +
        '<button class="vs-btn vs-btn--block" type="submit">Place order</button>' +
      '</form>', { narrow: true });
    $('form', m).addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target;
      var missing = $$('input[required]', f).filter(function (i) { return !i.value.trim(); });
      if (missing.length) { $('[data-vs-error]', m).textContent = 'Please complete all required fields.'; return; }
      var orderId = 'VIT' + Date.now().toString().slice(-8);
      post('commerce.purchases', { items: items, total: cartTotal(items), currency: CURRENCY, orderId: orderId, email: f.email.value.trim() });
      write(KEYS.cart, []);
      write(KEYS.abandon, true);
      renderBasket();
      m.innerHTML = '<button class="vs-close" type="button" aria-label="Close">×</button>' +
        '<h2>Thank you for your order</h2><p>Your order number is <strong>' + orderId + '</strong>.</p>' +
        '<p>We have sent a confirmation to ' + esc(f.email.value.trim()) + '.</p>' +
        '<div class="vs-actions" style="margin-top:20px"><button type="button" class="vs-btn vs-btn--block" data-vs-done>Continue shopping</button></div>';
      $('[data-vs-done]', m).addEventListener('click', closeModal);
    });
  }

  /* ---------- Account ---------- */
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

  function openAccount() {
    var id = identity();
    if (id && id.signedIn) return openProfile(id);
    var m = openModal(
      '<div class="vs-tabs" role="tablist"><button class="vs-tab" role="tab" aria-selected="true" data-vs-tab="signin">Sign in</button>' +
      '<button class="vs-tab" role="tab" aria-selected="false" data-vs-tab="register">Create account</button></div>' +
      '<form class="vs-form" data-vs-panel="signin" novalidate>' +
        '<div class="vs-field"><label>Email</label><input name="email" type="email" autocomplete="off" list="vsRecentEmails" required>' +
        '<datalist id="vsRecentEmails">' + recentEmails().map(function (e) { return '<option value="' + esc(e) + '">'; }).join('') + '</datalist></div>' +
        '<div class="vs-field"><label>Password</label><input name="password" type="password" autocomplete="current-password" required></div>' +
        '<div class="vs-error" data-vs-error></div>' +
        '<button class="vs-btn vs-btn--block" type="submit">Sign in</button>' +
      '</form>' +
      '<form class="vs-form" data-vs-panel="register" hidden novalidate>' +
        '<div class="vs-row"><div class="vs-field"><label>First name</label><input name="firstName" autocomplete="given-name" required></div>' +
        '<div class="vs-field"><label>Last name</label><input name="lastName" autocomplete="family-name" required></div></div>' +
        '<div class="vs-row"><div class="vs-field"><label>Email</label><input name="email" type="email" autocomplete="email" required></div>' +
        '<div class="vs-field"><label>Date of birth</label><input name="dob" type="date" required></div></div>' +
        '<div class="vs-field"><label>Password</label><input name="password" type="password" autocomplete="new-password" required></div>' +
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
      });
    });
    $('[data-vs-panel="signin"]', m).addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target;
      var email = f.email.value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !f.password.value) {
        $('[data-vs-error]', f).textContent = 'Please enter a valid email and password.';
        return;
      }
      var prev = identity() || {};
      var first = prev.email === email && prev.firstName ? prev.firstName : email.split('@')[0].split(/[._+]/)[0];
      first = first.charAt(0).toUpperCase() + first.slice(1);
      var last = prev.email === email ? (prev.lastName || '') : '';
      setIdentity({ email: email, firstName: first, lastName: last, signedIn: true });
      post('login', { email: email, firstName: first, lastName: last, isNew: false });
      closeModal();
      toast('Welcome back, ' + first);
    });
    $('[data-vs-panel="register"]', m).addEventListener('submit', function (e) {
      e.preventDefault();
      var f = e.target;
      var err = $('[data-vs-error]', f);
      var email = f.email.value.trim();
      if (!f.firstName.value.trim() || !f.lastName.value.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !f.password.value || !f.dob.value) {
        err.textContent = 'Please complete all required fields.';
        return;
      }
      var age = (Date.now() - new Date(f.dob.value).getTime()) / (365.25 * 864e5);
      if (!(age >= 18)) { err.textContent = 'You must be at least 18 years old to register.'; return; }
      if (!$('[data-vs-terms]', f).checked) { err.textContent = 'Please accept the Terms and Conditions.'; return; }
      var id = { email: email, firstName: f.firstName.value.trim(), lastName: f.lastName.value.trim(), dob: f.dob.value, signedIn: true };
      setIdentity(id);
      post('login', { email: id.email, firstName: id.firstName, lastName: id.lastName, dob: id.dob, isNew: true });
      var consent = readConsent(f);
      write(KEYS.consent, consent);
      post('consent.preferences', consent);
      if ($('[data-vs-loyalty]', f).checked) {
        write(KEYS.loyalty, true);
        post('loyalty.join', { programme: 'Vuse Rewards', tier: 'Member' });
      }
      closeModal();
      toast('Welcome to Vuse, ' + id.firstName);
    });
  }

  function openProfile(id) {
    var joined = read(KEYS.loyalty, false);
    var m = openModal(
      '<h2>Hi ' + esc(id.firstName) + '</h2><p class="vs-note" style="margin-top:0">' + esc(id.email) + '</p>' +
      '<h3 style="margin-top:20px">Communication preferences</h3>' + consentTable(read(KEYS.consent, {})) +
      (joined ? '<p><strong>Vuse Rewards</strong> · Member</p>'
        : '<label class="vs-loyalty"><input type="checkbox" data-vs-loyalty><span><strong>Join Vuse Rewards</strong>Earn points on every purchase and unlock exclusive offers.</span></label>') +
      '<div class="vs-actions"><button type="button" class="vs-btn vs-btn--block" data-vs-save>Save preferences</button>' +
      '<button type="button" class="vs-btn vs-btn--ghost vs-btn--block" data-vs-signout>Sign out</button></div>', { narrow: true });
    $('[data-vs-save]', m).addEventListener('click', function () {
      var consent = readConsent(m);
      write(KEYS.consent, consent);
      post('consent.preferences', consent);
      var l = $('[data-vs-loyalty]', m);
      if (l && l.checked) { write(KEYS.loyalty, true); post('loyalty.join', { programme: 'Vuse Rewards', tier: 'Member' }); }
      closeModal();
      toast('Your preferences have been saved');
    });
    $('[data-vs-signout]', m).addEventListener('click', function () {
      setIdentity(Object.assign({}, id, { signedIn: false }));
      closeModal();
    });
  }

  /* ---------- Store locator ---------- */
  var STORES = [
    ['Tabaccheria Duomo', 'Via Torino 2', '20123 Milano', 'Mon–Sat 7:30–20:00'],
    ['Tabacchi Brera 12', 'Via Fiori Chiari 12', '20121 Milano', 'Mon–Sun 8:00–21:00'],
    ['Rivendita n. 148 Porta Romana', 'Corso di Porta Romana 74', '20122 Milano', 'Mon–Sat 7:00–19:30'],
    ['Tabaccheria Navigli', 'Ripa di Porta Ticinese 33', '20143 Milano', 'Mon–Sun 8:00–22:00'],
    ['Tabacchi Isola', 'Via Borsieri 9', '20159 Milano', 'Mon–Sat 7:30–19:30'],
    ['Tabaccheria Centrale FS', 'Piazza Duca d’Aosta 1', '20124 Milano', 'Mon–Sun 6:00–22:00'],
    ['Tabacchi Città Studi', 'Via Pascoli 41', '20133 Milano', 'Mon–Sat 7:00–20:00'],
    ['Rivendita n. 52 CityLife', 'Piazza Tre Torri 1', '20145 Milano', 'Mon–Sun 10:00–21:00']
  ];
  function initStoreLocator() {
    var root = $('.batcom-storelocator');
    if (!root) return;
    var input = $('input.mapboxgl-ctrl-geocoder--input', root);
    var listing = $('.batcom-storelocator--listing', root);
    var map = $('.batcom-storelocator--map', root);
    if (map) map.style.display = 'none';
    if (!input || !listing) return;
    function search(q) {
      q = (q || '').trim();
      if (!q) return;
      var city = /^\d{5}$/.test(q) ? 'Milano' : q.replace(/\b\w/g, function (c) { return c.toUpperCase(); });
      var results = STORES.map(function (s, i) {
        var km = (0.3 + i * 0.6).toFixed(1);
        return { name: s[0], address: s[1], postcode: s[2].replace('Milano', city), hours: s[3], distanceKm: parseFloat(km) };
      });
      listing.innerHTML = '<ul class="vs-stores">' + results.map(function (r) {
        return '<li><strong>' + esc(r.name) + '</strong><span>' + esc(r.address) + ', ' + esc(r.postcode) + '</span>' +
          '<span>' + esc(r.hours) + ' · ' + r.distanceKm + ' km</span><a href="#" data-vs-noop>Get directions</a></li>';
      }).join('') + '</ul>';
      post('storeLocator.search', { query: q, results: results.length, nearest: results[0].name });
    }
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); search(input.value); } });
    var go = $('.mapboxgl-ctrl-geocoder--icon-search', root);
    go && go.addEventListener('click', function () { search(input.value); });
    var loc = $('.batcom-storelocator--getloc', root);
    loc && loc.addEventListener('click', function (e) { e.preventDefault(); input.value = 'Milano'; search('Milano'); });
  }

  /* ---------- Accordions, nav, forms ---------- */
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
      f.addEventListener('submit', function (e) { e.preventDefault(); });
    });
  }

  /* ---------- Click routing ---------- */
  function onClick(e) {
    if (e.target.closest('[data-vs-modal], .vs-drawer, .cmp-batcom-agegate')) {
      if (e.target.closest('[data-vs-noop]')) e.preventDefault();
      return;
    }
    if (e.target.closest('.batcom-bff-minibasket')) { e.preventDefault(); openDrawer(); return; }
    if (e.target.closest('a.batcom-bff-accounticon__icon')) { e.preventDefault(); openAccount(); return; }

    var card = e.target.closest('.product-card');
    if (card) {
      var buy = e.target.closest('.product-card__buy-button');
      if (buy) {
        e.preventDefault();
        var p = productFromCard(card);
        if (p.purchasable) { addToCart(p, 1); openDrawer(); } else openProduct(p);
        return;
      }
      if (e.target.closest('.product-card__buy-quantityBtn')) { e.preventDefault(); return; }
      if (e.target.closest('a, .product-card__image, .product-card__name')) { e.preventDefault(); openProduct(productFromCard(card)); return; }
    }

    var a = e.target.closest('a');
    if (!a) return;
    var vh = a.getAttribute('data-vuse-href');
    var href = a.getAttribute('href') || '';
    if (vh) {
      e.preventDefault();
      if (/velo/i.test(vh)) { post('velo.view', { href: vh }); return; }
      if (/\/products\//.test(vh)) { openProduct(productFromHref(vh, a.textContent.trim())); return; }
      if (/customer\/account|login|register/.test(vh)) { openAccount(); return; }
      if (/checkout\/cart/.test(vh)) { openDrawer(); return; }
      return;
    }
    if (href === '#' || /^https?:/i.test(href) || /^(mailto|tel):/i.test(href)) e.preventDefault();
  }

  /* ---------- Host bridge ---------- */
  function onMessage(e) {
    if (e.origin !== location.origin || e.source !== window.parent) return;
    var d = e.data || {};
    if (d.source !== 'vuse-shell') return;
    if (d.type === 'identity' && d.payload) {
      var p = d.payload;
      setIdentity({ email: p.email, firstName: p.firstName, lastName: p.lastName || '', signedIn: p.signedIn !== false });
    } else if (d.type === 'reset') {
      resetAll();
    }
  }
  function resetAll() {
    Object.keys(sessionStorage).forEach(function (k) { if (k.indexOf('vuse') === 0) sessionStorage.removeItem(k); });
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
    window.addEventListener('pagehide', abandonCart);
    initNav();
    initAccordions();
    initCarousels();
    initProductRails();
    initStoreLocator();
    renderAccount();
    renderBasket();
    initAgeGate().then(function () {
      post('pageView', { page: PAGE, title: document.title, url: location.href });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
