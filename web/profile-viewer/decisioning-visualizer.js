/**
 * Decisioning visualiser — interactive ranking methods (decisioning-visualiser.html).
 * Industry context: media (default), travel, retail, FSI, telco, automotive, or healthcare (examples + copy).
 *
 * Flow: Start → Channels → Schema → Collections → Rules → Journey → Ranking …
 * Panel id `channels` is delivery / decision items (playground “Items” step).
 * Extra steps: Priority, AI, Experimentation. Customer “Show for customer” toggles subset visibility.
 */
(function () {
  'use strict';

  var LS_INDUSTRY = 'dceVizIndustry';
  var LS_CUSTOMER_STEPS = 'dceVizCustomerSteps';

  var DCE_PANEL_ORDER = ['overview', 'channels', 'schema', 'collections', 'rules', 'journey', 'priority', 'formula', 'ai', 'experiment'];

  var INDUSTRY_LABEL_UI = {
    media: 'Media & entertainment',
    travel: 'Travel · Airline',
    retail: 'Retail',
    fsi: 'FSI',
    telco: 'Telco',
    automotive: 'Automotive',
    healthcare: 'Healthcare',
  };

  function getIndustry() {
    var b = document.body && document.body.getAttribute('data-dce-industry');
    if (b === 'travel' || b === 'retail' || b === 'fsi' || b === 'telco' || b === 'automotive' || b === 'healthcare') return b;
    return 'media';
  }

  function defaultCustomerSteps() {
    var o = {};
    DCE_PANEL_ORDER.forEach(function (k) { o[k] = true; });
    return o;
  }

  function getCustomerStepsState() {
    var d = defaultCustomerSteps();
    try {
      var raw = localStorage.getItem(LS_CUSTOMER_STEPS);
      if (!raw) return d;
      var parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return d;
      DCE_PANEL_ORDER.forEach(function (k) {
        if (typeof parsed[k] === 'boolean') d[k] = parsed[k];
      });
    } catch (e) {}
    return d;
  }

  function saveCustomerStepsState(state) {
    try {
      localStorage.setItem(LS_CUSTOMER_STEPS, JSON.stringify(state));
    } catch (e) {}
  }

  function getVisibleOrder() {
    var st = getCustomerStepsState();
    var o = DCE_PANEL_ORDER.filter(function (k) { return st[k] !== false; });
    if (!o.length) return ['overview'];
    return o;
  }

  function isCustomerStepOn(id) {
    return getCustomerStepsState()[id] !== false;
  }

  function getActivePanelId() {
    var p = document.querySelector('#dceVizRoot .panel.active');
    if (!p || !p.id || p.id.indexOf('dceViz-panel-') !== 0) return null;
    return p.id.replace('dceViz-panel-', '');
  }

  function updateCustomerButtonLabel() {
    var el = document.getElementById('dce-pg-customer-label');
    if (!el) return;
    var n = getVisibleOrder().length;
    var total = DCE_PANEL_ORDER.length;
    el.textContent = n === total ? 'Show for customer' : 'Show for customer (' + n + '/' + total + ')';
  }

  function applyCustomerStepVisibility() {
    var root = document.getElementById('dceVizRoot');
    if (!root) return;
    var st = getCustomerStepsState();
    DCE_PANEL_ORDER.forEach(function (id) {
      var on = st[id] !== false;
      var tab = root.querySelector('.tab-btn[data-dce-panel="' + id + '"]');
      var panel = document.getElementById('dceViz-panel-' + id);
      if (tab) tab.classList.toggle('dce-pg-step-suppressed', !on);
      if (panel) panel.classList.toggle('dce-pg-step-suppressed', !on);
    });
    root.querySelectorAll('a.overview-card[data-dce-panel]').forEach(function (a) {
      var id = a.getAttribute('data-dce-panel');
      if (id) a.classList.toggle('dce-pg-step-suppressed', st[id] === false);
    });
    updateCustomerButtonLabel();
  }

  function ensureActivePanelCustomerVisible() {
    var cur = getActivePanelId();
    var order = getVisibleOrder();
    if (!order.length) return;
    if (!cur || order.indexOf(cur) < 0) showPanel(order[0]);
    else updatePlaygroundChrome(cur);
  }

  // ── TAB NAVIGATION ────────────────────────────────────────────────────────
  function updatePlaygroundChrome(panelId) {
    var order = getVisibleOrder();
    var idx = order.indexOf(panelId);
    var fill = document.getElementById('dce-pg-progress-fill');
    var n = order.length || 1;
    if (fill && idx >= 0) fill.style.width = ((idx + 1) / n) * 100 + '%';
    var ctr = document.getElementById('dce-pg-counter');
    if (ctr && idx >= 0) ctr.textContent = idx + 1 + ' / ' + n;
    var back = document.getElementById('dce-pg-back');
    var next = document.getElementById('dce-pg-next');
    if (back) back.disabled = idx <= 0;
    if (next) next.disabled = idx < 0 || idx >= n - 1;
  }

  function showPanel(id) {
    var root = document.getElementById('dceVizRoot');
    if (!root) return;
    if (!isCustomerStepOn(id)) {
      var order = getVisibleOrder();
      if (order.length) showPanel(order[0]);
      return;
    }
    var panel = document.getElementById('dceViz-panel-' + id);
    if (!panel) return;
    var idx = DCE_PANEL_ORDER.indexOf(id);
    if (idx < 0) return;

    root.querySelectorAll('.panel').forEach(function (p) { p.classList.remove('active'); });
    root.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
    panel.classList.add('active');

    var tabFor = root.querySelector('.tab-btn[data-dce-panel="' + id + '"]');
    if (tabFor) tabFor.classList.add('active');

    updatePlaygroundChrome(id);

    var sec = document.getElementById('decisioning-visualiser');
    if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    var innerContent = root.querySelector('.content');
    if (innerContent) innerContent.scrollTop = 0;
    if (id === 'channels' && typeof window.dceVizUpdateChannelConnector === 'function') {
      window.requestAnimationFrame(function () {
        window.dceVizUpdateChannelConnector();
        window.requestAnimationFrame(function () {
          window.dceVizUpdateChannelConnector();
        });
      });
    }
  }

  window.dceVizShowPanel = showPanel;

  function bindVizRootClicks() {
    var root = document.getElementById('dceVizRoot');
    if (!root || root.getAttribute('data-dce-viz-bound') === '1') return;
    root.setAttribute('data-dce-viz-bound', '1');
    root.addEventListener('click', function (e) {
      var tab = e.target.closest && e.target.closest('.tab-btn');
      if (tab && root.contains(tab)) {
        e.preventDefault();
        var pid = tab.getAttribute('data-dce-panel');
        if (pid) showPanel(pid);
        return;
      }
      var card = e.target.closest && e.target.closest('a.overview-card');
      if (card && root.contains(card)) {
        e.preventDefault();
        var cid = card.getAttribute('data-dce-panel');
        if (cid) showPanel(cid);
      }
    });

    var pgBack = document.getElementById('dce-pg-back');
    var pgNext = document.getElementById('dce-pg-next');
    if (pgBack) {
      pgBack.addEventListener('click', function () {
        var order = getVisibleOrder();
        var cur = getActivePanelId();
        var i = order.indexOf(cur);
        if (i > 0) showPanel(order[i - 1]);
      });
    }
    if (pgNext) {
      pgNext.addEventListener('click', function () {
        var order = getVisibleOrder();
        var cur = getActivePanelId();
        var i = order.indexOf(cur);
        if (i >= 0 && i < order.length - 1) showPanel(order[i + 1]);
      });
    }

    var ddBtn = document.getElementById('dce-pg-industry-btn');
    var ddMenu = document.getElementById('dce-pg-industry-menu');
    var custBtn = document.getElementById('dce-pg-customer-btn');
    var custMenu = document.getElementById('dce-pg-customer-menu');

    function closeIndustryMenu() {
      if (!ddMenu || !ddBtn) return;
      ddMenu.hidden = true;
      ddBtn.setAttribute('aria-expanded', 'false');
    }
    function closeCustomerMenu() {
      if (!custMenu || !custBtn) return;
      custMenu.hidden = true;
      custBtn.setAttribute('aria-expanded', 'false');
    }
    function closeHeaderDropdowns() {
      closeIndustryMenu();
      closeCustomerMenu();
    }
    function toggleIndustryMenu() {
      if (!ddMenu || !ddBtn) return;
      closeCustomerMenu();
      ddMenu.hidden = !ddMenu.hidden;
      ddBtn.setAttribute('aria-expanded', ddMenu.hidden ? 'false' : 'true');
    }
    function toggleCustomerMenu() {
      if (!custMenu || !custBtn) return;
      closeIndustryMenu();
      custMenu.hidden = !custMenu.hidden;
      custBtn.setAttribute('aria-expanded', custMenu.hidden ? 'false' : 'true');
    }
    if (ddBtn && ddMenu) {
      ddBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleIndustryMenu();
      });
      ddMenu.querySelectorAll('.dce-pg-dropdown-item').forEach(function (item) {
        item.addEventListener('click', function () {
          var k = item.getAttribute('data-dce-industry');
          if (k) setIndustry(k, true);
          closeIndustryMenu();
        });
      });
    }
    if (custBtn && custMenu) {
      custBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleCustomerMenu();
      });
      custMenu.addEventListener('click', function (e) {
        e.stopPropagation();
      });
    }
    document.addEventListener('click', closeHeaderDropdowns);

    function initCustomerStepsUi() {
      if (!custMenu) return;
      var st = getCustomerStepsState();
      custMenu.querySelectorAll('.dce-pg-customer-cb').forEach(function (cb) {
        var id = cb.getAttribute('data-dce-step');
        if (id && Object.prototype.hasOwnProperty.call(st, id)) {
          cb.checked = st[id] !== false;
        }
        cb.addEventListener('change', function () {
          var sid = cb.getAttribute('data-dce-step');
          if (!sid) return;
          var next = getCustomerStepsState();
          next[sid] = cb.checked;
          var count = DCE_PANEL_ORDER.filter(function (k) { return next[k] !== false; }).length;
          if (count === 0) {
            cb.checked = true;
            next[sid] = true;
            return;
          }
          saveCustomerStepsState(next);
          applyCustomerStepVisibility();
          ensureActivePanelCustomerVisible();
        });
      });
      applyCustomerStepVisibility();
      ensureActivePanelCustomerVisible();
    }
    initCustomerStepsUi();
  }
  bindVizRootClicks();

  // ── CHANNELS TAB (decision → delivery copy from AJO Experience Decisioning playground) ──
  var DCE_CHANNELS = {
    email: {
      label: 'Email',
      what: 'Personalized offer blocks inside AJO email campaigns.',
      does: 'The decisioning engine fills a template placeholder at send time — each recipient gets the offer most relevant to them.',
      example: 'A weekly newsletter has an “Offer of the Week” block. Each recipient sees a different offer — one gets a data plan upgrade, another a loyalty reward.',
    },
    web: {
      label: 'Web',
      what: 'Real-time decisions delivered via Adobe Web SDK.',
      does: 'Offers are injected into the page as the customer browses — hero banners, inline cards, or modal overlays.',
      example: 'A returning telco customer sees “Welcome Back — Upgrade to 5G” as the homepage hero instead of the generic banner.',
    },
    app: {
      label: 'App',
      what: 'In-app messages and content cards within mobile applications.',
      does: 'The decisioning engine delivers personalized offers directly inside the app experience — banners, interstitials, or native content cards triggered by user behavior.',
      example: 'A banking app customer who just completed a transfer sees an in-app card: “You qualify for our Premium Cashback Card” — surfaced by the Decision Policy based on their transaction patterns.',
    },
    push: {
      label: 'Push',
      what: 'Mobile push notifications with personalized offers.',
      does: 'Push campaigns in AJO include a decisioning action. The winning item’s push representation is assembled and delivered to the device.',
      example: 'A customer who abandoned their cart 2 hours ago gets a push: “Free Express Shipping” — selected by the Decision Policy in real time.',
    },
    sms: {
      label: 'SMS',
      what: 'Personalized text messages with offer deep links.',
      does: 'SMS campaigns deliver the winning offer as a short message with a deep link to convert.',
      example: 'A high-value customer receives: “Hi Alex, your exclusive 30% upgrade offer expires tonight” with a link to the upgrade page.',
    },
    code: {
      label: 'Code',
      what: 'Structured JSON via Edge Decisioning API for any custom channel.',
      does: 'Any downstream system — kiosk, call center, IoT device, or custom app — can consume and render the winning offer.',
      example: 'A call center agent’s screen makes an API call when a customer dials in. The response surfaces the best retention offer as a talking-point card.',
    },
  };

  function bindChannelExplainer() {
    var panel = document.getElementById('dceViz-panel-channels');
    if (!panel || panel.getAttribute('data-dce-ch-bound') === '1') return;
    panel.setAttribute('data-dce-ch-bound', '1');

    var nameEl = document.getElementById('dce-ch-detail-name');
    var whatEl = document.getElementById('dce-ch-what');
    var doesEl = document.getElementById('dce-ch-does');
    var exEl = document.getElementById('dce-ch-example');
    var detail = document.getElementById('dce-ch-detail');
    if (!nameEl || !whatEl || !doesEl || !exEl || !detail) return;

    var wrap = document.getElementById('dce-ch-bridge-wrap');
    var svg = document.getElementById('dce-ch-connector-svg');
    var pathEl = document.getElementById('dce-ch-connector-path');

    function updateChannelConnector() {
      if (!wrap || !svg || !pathEl || !detail) return;
      if (!panel.classList.contains('active')) return;
      var pill = panel.querySelector('.dce-ch-pill.active');
      if (!pill) return;
      var wr = wrap.getBoundingClientRect();
      if (wr.width < 2 || wr.height < 2) {
        pathEl.setAttribute('d', '');
        return;
      }
      var pr = pill.getBoundingClientRect();
      var cr = detail.getBoundingClientRect();
      var x1 = (pr.left + pr.right) / 2 - wr.left;
      var y1 = pr.bottom - wr.top;
      var x2 = (cr.left + cr.right) / 2 - wr.left;
      var y2 = cr.top - wr.top;
      var yMid = y1 + (y2 - y1) * 0.5;
      svg.setAttribute('width', String(wr.width));
      svg.setAttribute('height', String(wr.height));
      svg.setAttribute('viewBox', '0 0 ' + wr.width + ' ' + wr.height);
      pathEl.setAttribute(
        'd',
        'M ' + x1 + ' ' + y1 + ' L ' + x1 + ' ' + yMid + ' L ' + x2 + ' ' + yMid + ' L ' + x2 + ' ' + y2
      );
    }

    function applyChannel(key) {
      var d = DCE_CHANNELS[key];
      if (!d) return;
      nameEl.textContent = d.label;
      whatEl.textContent = d.what;
      doesEl.textContent = d.does;
      exEl.textContent = d.example;
      panel.querySelectorAll('.dce-ch-pill').forEach(function (btn) {
        var k = btn.getAttribute('data-dce-channel');
        var on = k === key;
        btn.classList.toggle('active', on);
        btn.setAttribute('aria-selected', on ? 'true' : 'false');
        if (on && detail) detail.setAttribute('aria-labelledby', btn.id);
      });
      detail.classList.add('dce-ch-detail--pulse');
      window.setTimeout(function () {
        detail.classList.remove('dce-ch-detail--pulse');
      }, 320);
      window.requestAnimationFrame(function () {
        updateChannelConnector();
        window.requestAnimationFrame(updateChannelConnector);
      });
    }

    panel.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('.dce-ch-pill');
      if (!btn || !panel.contains(btn)) return;
      e.preventDefault();
      var key = btn.getAttribute('data-dce-channel');
      if (key) applyChannel(key);
    });

    window.addEventListener('resize', function () {
      updateChannelConnector();
    });

    window.dceVizUpdateChannelConnector = updateChannelConnector;

    applyChannel('email');
  }

  // ── OFFER SCHEMA TAB (SchemaStep parity — github.com/alexmtmr/experience-decisioning-playground) ──
  var SCHEMA_OFFERS = {
    media: {
      itemName: 'Premium annual — 2 months free',
      title: 'Premium annual — 2 months free',
      description: 'Stream in 4K with offline downloads — limited-time sign-up offer for new subscribers.',
      cta: 'Start watching →',
      priority: '82',
      start: '2026-04-01',
      end: '2026-08-31',
      webUrl: 'stream.example.com/premium',
      deepLink: 'app://subscribe/premium-annual',
      channelType: 'Web, App, TV',
      promoCode: 'STREAM26',
      contentType: 'Promotional',
      salesStage: 'Cross-sell',
      journeyStage: 'Acquisition',
      targetSegment: 'High-intent viewers',
      category: 'Subscription',
      margin: 'High',
      accent: '#CC0000',
      img: 'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=400&h=240&fit=crop',
    },
    travel: {
      itemName: 'Extra legroom bundle — long-haul',
      title: 'Extra legroom bundle — long-haul',
      description: 'Add comfort on your next transatlantic flight — bundle with priority boarding while seats last.',
      cta: 'Add to trip →',
      priority: '76',
      start: '2026-04-01',
      end: '2026-09-30',
      webUrl: 'airline.example.com/ancillaries',
      deepLink: 'app://trip/extra-legroom',
      channelType: 'Web, App',
      promoCode: 'SKY26',
      contentType: 'Ancillary',
      salesStage: 'Upsell',
      journeyStage: 'Pre-departure',
      targetSegment: 'Leisure & business',
      category: 'Ancillary',
      margin: 'High',
      accent: '#005f9e',
      img: 'https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=400&h=240&fit=crop',
    },
    retail: {
      itemName: '20% Off Running Shoes',
      title: '20% Off Running Shoes',
      description: 'Summer collection — limited time. Free returns on footwear.',
      cta: 'Shop Now →',
      priority: '70',
      start: '2026-04-01',
      end: '2026-08-31',
      webUrl: 'shop.example.com/running',
      deepLink: 'app://promo/shoes-summer',
      channelType: 'Web, App, Email',
      promoCode: 'RUN26',
      contentType: 'Promotional',
      salesStage: 'Cross-sell',
      journeyStage: 'Retention',
      targetSegment: 'High-value',
      category: 'Footwear',
      margin: 'Medium',
      accent: '#2D9D78',
      img: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400&h=240&fit=crop',
    },
    fsi: {
      itemName: 'Stocks & Shares ISA — switching bonus',
      title: 'Stocks & Shares ISA — switching bonus',
      description: 'Transfer in by quarter-end — £150 bonus paid to your cash hub when eligibility criteria are met.',
      cta: 'See rates →',
      priority: '68',
      start: '2026-04-01',
      end: '2026-12-31',
      webUrl: 'bank.example.com/isa',
      deepLink: 'app://wealth/isa-transfer',
      channelType: 'Web, App',
      promoCode: 'WEALTH26',
      contentType: 'Regulated',
      salesStage: 'Cross-sell',
      journeyStage: 'Consideration',
      targetSegment: 'Investors',
      category: 'Wealth',
      margin: 'Medium',
      accent: '#2680EB',
      img: 'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=400&h=240&fit=crop',
    },
    telco: {
      itemName: '5G Unlimited Plus — eSIM & roaming',
      title: '5G Unlimited Plus — eSIM & roaming',
      description: 'Unlimited data in 45 destinations — add a line this month and waive activation.',
      cta: 'Compare plans →',
      priority: '74',
      start: '2026-04-01',
      end: '2026-10-31',
      webUrl: 'telco.example.com/5g-unlimited',
      deepLink: 'app://plans/unlimited-plus',
      channelType: 'Web, App, Retail',
      promoCode: 'FIVEG26',
      contentType: 'Promotional',
      salesStage: 'Acquisition',
      journeyStage: 'Upgrade',
      targetSegment: 'Heavy data users',
      category: 'Mobile',
      margin: 'High',
      accent: '#E68619',
      img: 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400&h=240&fit=crop',
    },
    automotive: {
      itemName: 'New hybrid SUV — PCP launch event',
      title: 'New hybrid SUV — PCP launch event',
      description: 'Test drive this weekend — competitive PCP with optional service pack for early orders.',
      cta: 'Book test drive →',
      priority: '71',
      start: '2026-04-01',
      end: '2027-03-31',
      webUrl: 'dealer.example.com/suv-pcp',
      deepLink: 'app://vehicles/hybrid-suv',
      channelType: 'Web, Showroom',
      promoCode: 'DRIVE26',
      contentType: 'Promotional',
      salesStage: 'Upsell',
      journeyStage: 'Consideration',
      targetSegment: 'Households',
      category: 'Showroom',
      margin: 'Medium',
      accent: '#1a1a1a',
      img: 'https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=400&h=240&fit=crop',
    },
    healthcare: {
      itemName: 'Virtual primary — same-day video',
      title: 'Virtual primary — same-day video',
      description: '£0 copay for eligible members — book a same-day slot and renew scripts where appropriate.',
      cta: 'Book visit →',
      priority: '73',
      start: '2026-04-01',
      end: '2026-12-31',
      webUrl: 'care.example.com/virtual',
      deepLink: 'app://care/virtual-primary',
      channelType: 'App, Web',
      promoCode: 'WELL26',
      contentType: 'Clinical access',
      salesStage: 'Engagement',
      journeyStage: 'Retention',
      targetSegment: 'Chronic care',
      category: 'Virtual care',
      margin: 'Low',
      accent: '#6e4fc7',
      img: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=400&h=240&fit=crop',
    },
  };

  function bindOfferSchema() {
    var panel = document.getElementById('dceViz-panel-schema');
    if (!panel || panel.getAttribute('data-dce-schema-bound') === '1') return;
    panel.setAttribute('data-dce-schema-bound', '1');

    var treeMount = document.getElementById('dce-schema-tree-mount');
    var previewMount = document.getElementById('dce-schema-preview-mount');
    if (!treeMount || !previewMount) {
      window.dceVizApplySchemaIndustry = function () {};
      return;
    }

    var TREE = window.DCE_PLAYGROUND_SCHEMA_TREE;
    if (!TREE || !TREE.length) {
      treeMount.innerHTML = '<p class="dce-pg-schema-fallback">Schema tree failed to load.</p>';
      window.dceVizApplySchemaIndustry = function () {};
      return;
    }

    function escS(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/"/g, '&quot;');
    }

    function getOffer() {
      var k = getIndustry();
      var o = SCHEMA_OFFERS[k] || SCHEMA_OFFERS.media;
      if (!o.name) o.name = o.title || o.itemName;
      if (!o.img) o.img = SCHEMA_OFFERS.retail.img;
      return o;
    }

    function walkLeaves(items, out) {
      items.forEach(function (n) {
        if (n.children) walkLeaves(n.children, out);
        else out.push(n);
      });
    }

    function walkEnableCustom(items, enabled) {
      items.forEach(function (n) {
        if (n.children) walkEnableCustom(n.children, enabled);
        else if (n.custom) enabled[n.id] = true;
      });
    }

    function walkAllLeaves(items, enabled) {
      items.forEach(function (n) {
        if (n.children) walkAllLeaves(n.children, enabled);
        else enabled[n.id] = true;
      });
    }

    function collectOpenGroups(items, open) {
      items.forEach(function (n) {
        if (n.group) {
          open[n.id] = true;
          if (n.children) collectOpenGroups(n.children, open);
        }
      });
    }

    var allLeaves = [];
    walkLeaves(TREE, allLeaves);
    var SCHEMA_LEAF_TOTAL = allLeaves.length;

    if (!panel._dcePlaygroundSchema) {
      panel._dcePlaygroundSchema = {
        enabled: { f15: true, f16: true, f17: true, f18: true },
        open: { s3: true },
      };
    }
    var st = panel._dcePlaygroundSchema;

    function isEn(fid) {
      return !!st.enabled[fid];
    }

    function activeFieldList() {
      return allLeaves.filter(function (f) {
        return isEn(f.id);
      });
    }

    function previewValForField(field, offer) {
      var id = field.id;
      if (id === 'f15') return offer.itemName;
      if (id === 'f16') return offer.priority;
      if (id === 'f17') return offer.start;
      if (id === 'f18') return offer.end;
      if (id === 'f6') return offer.webUrl;
      if (id === 'f7') return offer.deepLink;
      if (id === 'f19') return offer.channelType;
      if (id === 'f8') return offer.promoCode;
      if (id === 'f9') return offer.contentType;
      if (id === 'f10') return offer.salesStage;
      if (id === 'f11') return offer.journeyStage;
      if (id === 'f12') return offer.targetSegment;
      if (id === 'f13') return offer.category;
      if (id === 'f14') return offer.margin;
      if (field.previewVal) return field.previewVal;
      return offer.title || offer.itemName;
    }

    function renderTreeHtml(items, depth) {
      var html = '';
      for (var i = 0; i < items.length; i++) {
        var node = items[i];
        if (node.group) {
          var isOpen = !!st.open[node.id];
          html += '<div class="dce-pg-schema-node">';
          html +=
            '<button type="button" class="dce-pg-schema-group" style="padding-left:' +
            (6 + depth * 14) +
            'px" data-dce-pg-toggle-group="' +
            escS(node.id) +
            '" aria-expanded="' +
            (isOpen ? 'true' : 'false') +
            '">';
          html += '<span class="dce-pg-schema-chev" aria-hidden="true">' + (isOpen ? '▼' : '▶') + '</span>';
          if (node.locked) html += '<span class="dce-pg-schema-lock" aria-hidden="true">🔒</span>';
          html += '<span class="dce-pg-schema-gname">' + escS(node.name) + '</span>';
          if (node.custom) html += '<span class="dce-pg-schema-custom">custom</span>';
          html += '</button>';
          if (isOpen) {
            html +=
              '<div class="dce-pg-schema-nested" style="margin-left:' +
              (10 + depth * 14) +
              'px">';
            html += renderTreeHtml(node.children, depth + 1);
            html += '</div>';
          }
          html += '</div>';
        } else {
          var on = isEn(node.id);
          html +=
            '<button type="button" class="dce-pg-schema-field' +
            (on ? ' is-on' : '') +
            '" style="padding-left:' +
            (8 + depth * 14) +
            'px" data-dce-pg-field="' +
            escS(node.id) +
            '" aria-pressed="' +
            (on ? 'true' : 'false') +
            '">';
          html += '<span class="dce-pg-schema-cb" aria-hidden="true"></span>';
          html +=
            '<span class="dce-pg-schema-ico dce-pg-schema-ico--' +
            escS(node.icon || 'type') +
            '" aria-hidden="true"></span>';
          html += '<span class="dce-pg-schema-fname">' + escS(node.name) + '</span>';
          html += '<span class="dce-pg-schema-ftype">' + escS(node.type) + '</span>';
          html += '</button>';
        }
      }
      return html;
    }

    function renderPreviewHtml() {
      var offer = getOffer();
      var active = activeFieldList();
      var n = active.length;
      var pct = SCHEMA_LEAF_TOTAL ? Math.round((n / SCHEMA_LEAF_TOTAL) * 100) : 0;

      var hasImage = active.some(function (f) {
        return f.id === 'f1' || f.id === 'f2';
      });
      var hasTitle = active.some(function (f) {
        return f.id === 'f3' || f.id === 'f15';
      });
      var hasDesc = active.some(function (f) {
        return f.id === 'f4';
      });
      var hasCTA = active.some(function (f) {
        return f.id === 'f5';
      });

      var stdFields = active.filter(function (f) {
        return !f.visual && !f.meta && !f.nav;
      });
      var navFields = active.filter(function (f) {
        return f.nav;
      });
      var metaFields = active.filter(function (f) {
        return f.meta;
      });

      function fieldRowHtml(f) {
        var pv = previewValForField(f, offer);
        return (
          '<div class="dce-pg-schema-preview-row">' +
          '<span class="dce-pg-schema-ico dce-pg-schema-ico--' +
          escS(f.icon || 'type') +
          '" aria-hidden="true"></span>' +
          '<span class="dce-pg-schema-plabel">' +
          escS(f.previewLabel || f.name) +
          '</span>' +
          '<span class="dce-pg-schema-pval">' +
          escS(pv) +
          '</span></div>'
        );
      }

      var mainCard = '';
      if (n === 0) {
        mainCard =
          '<div class="dce-pg-schema-empty"><span class="dce-pg-schema-empty-ico" aria-hidden="true">👁</span>' +
          '<p class="dce-pg-schema-empty-txt">Toggle fields to build the preview</p></div>';
      } else {
        if (hasImage) {
          mainCard +=
            '<div class="dce-pg-schema-imgwrap"><img src="' +
            escS(offer.img) +
            '" alt="" class="dce-pg-schema-img"/></div>';
        }
        mainCard += '<div class="dce-pg-schema-cardpad">';
        if (hasTitle) {
          mainCard += '<div class="dce-pg-schema-oname">' + escS(offer.title || offer.itemName) + '</div>';
        }
        if (hasDesc) mainCard += '<div class="dce-pg-schema-odesc">' + escS(offer.description) + '</div>';
        if (hasCTA) {
          mainCard +=
            '<div class="dce-pg-schema-octa" style="background:' +
            escS(offer.accent || '#2D9D78') +
            '">' +
            escS(offer.cta || 'Shop Now →') +
            '</div>';
        }
        mainCard += '</div>';
      }

      var h = '';
      h += '<div class="dce-pg-schema-preview-inner">';
      h += '<div class="dce-schema-preview card dce-pg-schema-maincard">';
      h += '<div class="dce-pg-schema-phdr"><span class="dce-pg-schema-pkick">Offer preview</span>';
      h += '<span class="dce-pg-schema-pcount">' + n + ' / ' + SCHEMA_LEAF_TOTAL + '</span></div>';
      h += mainCard;
      h += '</div>';

      if (stdFields.length) {
        h += '<div class="dce-schema-preview-section card dce-pg-schema-widget"><div class="dce-schema-preview-sec-label">Standard attributes</div>';
        h += '<div class="dce-pg-schema-plist">';
        stdFields.forEach(function (f) {
          h += fieldRowHtml(f);
        });
        h += '</div></div>';
      }
      if (navFields.length) {
        h += '<div class="dce-schema-preview-section card dce-pg-schema-widget"><div class="dce-schema-preview-sec-label">Navigation &amp; delivery</div>';
        h += '<div class="dce-pg-schema-plist">';
        navFields.forEach(function (f) {
          h += fieldRowHtml(f);
        });
        h += '</div></div>';
      }
      if (metaFields.length) {
        h += '<div class="dce-schema-preview-section card dce-pg-schema-widget dce-pg-schema-widget--meta"><div class="dce-schema-preview-sec-label">Metadata &amp; classification</div>';
        h += '<div class="dce-pg-schema-plist">';
        metaFields.forEach(function (f) {
          h += fieldRowHtml(f);
        });
        h += '</div></div>';
      }

      h += '<div class="dce-pg-schema-progress">';
      h += '<div class="dce-pg-schema-ptrack"><div class="dce-pg-schema-pfill" style="width:' + pct + '%"></div></div>';
      h += '<span class="dce-pg-schema-ppct">' + pct + '%</span></div>';
      h += '</div>';
      return h;
    }

    function renderAll() {
      treeMount.innerHTML = renderTreeHtml(TREE, 0);
      previewMount.innerHTML = renderPreviewHtml();
    }

    treeMount.addEventListener('click', function (e) {
      var g = e.target.closest && e.target.closest('[data-dce-pg-toggle-group]');
      if (g && treeMount.contains(g)) {
        e.preventDefault();
        var gid = g.getAttribute('data-dce-pg-toggle-group');
        if (gid) st.open[gid] = !st.open[gid];
        renderAll();
        return;
      }
      var f = e.target.closest && e.target.closest('[data-dce-pg-field]');
      if (f && treeMount.contains(f)) {
        e.preventDefault();
        var fid = f.getAttribute('data-dce-pg-field');
        if (fid) st.enabled[fid] = !st.enabled[fid];
        renderAll();
      }
    });

    var btnReset = document.getElementById('dce-schema-reset');
    var btnEnCust = document.getElementById('dce-schema-enable-custom');
    var btnEnAll = document.getElementById('dce-schema-enable-all');

    if (btnReset) {
      btnReset.addEventListener('click', function () {
        st.enabled = { f15: true, f16: true, f17: true, f18: true };
        st.open = { s3: true };
        renderAll();
      });
    }
    if (btnEnCust) {
      btnEnCust.addEventListener('click', function () {
        var e2 = {};
        for (var k in st.enabled) {
          if (Object.prototype.hasOwnProperty.call(st.enabled, k)) e2[k] = st.enabled[k];
        }
        walkEnableCustom(TREE, e2);
        st.enabled = e2;
        st.open = { s1: true, s1a: true, s1b: true, s1c: true, s1d: true, s2: true, s3: true };
        renderAll();
      });
    }
    if (btnEnAll) {
      btnEnAll.addEventListener('click', function () {
        st.open = {};
        collectOpenGroups(TREE, st.open);
        var e3 = {};
        walkAllLeaves(TREE, e3);
        st.enabled = e3;
        renderAll();
      });
    }

    function applySchemaIndustry() {
      renderAll();
    }

    window.dceVizApplySchemaIndustry = applySchemaIndustry;
    applySchemaIndustry();
  }

  // ── INDUSTRY CONFIG ─────────────────────────────────────────────────────────
  var PRIORITY_MEDIA = [
    { name: '🎬 Annual Plan — 2 months free', sub: 'Highest value · Long-term commitment', id: 's1' },
    { name: '📺 Premium HD — First month £4.99', sub: 'Mid-tier entry point · Monthly rolling', id: 's2' },
    { name: '🔔 30-Day Free Trial', sub: 'Low commitment · Acquisition offer', id: 's3' },
  ];
  var PRIORITY_TRAVEL = [
    { name: '✈️ Extra legroom — long-haul bundle', sub: 'Highest margin · Limited inventory', id: 's1' },
    { name: '🧳 Checked bags — 2×23kg', sub: 'Popular ancillary · mid route yield', id: 's2' },
    { name: '⭐ Priority boarding — Group 1', sub: 'Broad eligibility · conversion driver', id: 's3' },
  ];
  var PRIORITY_RETAIL = [
    { name: '🛍️ Cart VIP — free express delivery', sub: 'Highest margin · conversion on big-ticket baskets', id: 's1' },
    { name: '🏷️ Loyalty 3× points — this weekend', sub: 'Mid-tier · drives app & repeat visits', id: 's2' },
    { name: '💳 BNPL 0% — 12 months on electrics', sub: 'Broad reach · reduces basket abandonment', id: 's3' },
  ];
  var PRIORITY_FSI = [
    { name: '🏦 Fixed-rate mortgage — 4.19% 5yr', sub: 'Strategic priority · high lifetime value', id: 's1' },
    { name: '💳 Balance-transfer card — 0% 24 months', sub: 'Acquisition · broad eligibility', id: 's2' },
    { name: '📈 Stocks & Shares ISA — £150 switching bonus', sub: 'Mid-term savings · cross-sell', id: 's3' },
  ];
  var PRIORITY_TELCO = [
    { name: '📱 5G Unlimited Plus — roaming & eSIM', sub: 'Highest ARPU · strategic mobile growth', id: 's1' },
    { name: '🏠 Fibre Max 1Gbps — mesh Wi‑Fi included', sub: 'Home broadband · acquisition & churn save', id: 's2' },
    { name: '🧑‍💼 Business multi-line — static IP & SD‑WAN trial', sub: 'SMB connectivity · B2B attach', id: 's3' },
  ];
  var PRIORITY_AUTOMOTIVE = [
    { name: '🚙 New hybrid SUV — PCP launch event', sub: 'Volume target · Q4 registration push', id: 's1' },
    { name: '🔌 EV bundle — wallbox + off-peak tariff', sub: 'Electrification · OEM programme', id: 's2' },
    { name: '🛠️ Service plan+ — 3 years / 36k miles', sub: 'Aftersales · retention & fixed ops', id: 's3' },
  ];
  var PRIORITY_HEALTHCARE = [
    { name: '🩺 Virtual primary — same-day video (£0 copay)', sub: 'Digital front door · access & triage', id: 's1' },
    { name: '🏥 Specialty expedited — cardiology intake', sub: 'Clinical pathway · SLAs & capacity', id: 's2' },
    { name: '💊 Pharmacy + wellness — 90-day + coaching', sub: 'Adherence · chronic & prevention', id: 's3' },
  ];

  function getPriorityListForIndustry(key) {
    if (key === 'travel') return PRIORITY_TRAVEL;
    if (key === 'retail') return PRIORITY_RETAIL;
    if (key === 'fsi') return PRIORITY_FSI;
    if (key === 'telco') return PRIORITY_TELCO;
    if (key === 'automotive') return PRIORITY_AUTOMOTIVE;
    if (key === 'healthcare') return PRIORITY_HEALTHCARE;
    return PRIORITY_MEDIA;
  }

  /**
   * Item collections (AJO DPS) — rule-bound slices of the item pool, aligned with playground “Collection” layer.
   * Each collection references priority-demo offer ids (s1–s3) for the active industry.
   */
  /**
   * Collections UI — schema-filter “smart folders” with pills, rule line, and match grid (industry-specific).
   */
  var DCE_COL_PILL_IX = {};

  var DCE_COLLECTIONS_UI = {
    retail: {
      offers: [
        { id: 'r1', title: 'Free Express Delivery', icon: '🚚' },
        { id: 'r2', title: '0% BNPL on Electronics', icon: '💳' },
        { id: 'r3', title: 'Back-to-School Bundle', icon: '🎁' },
        { id: 'r4', title: 'New Collection Preview', icon: '👕' },
        { id: 'r5', title: 'Home — Free Assembly', icon: '🔧' },
        { id: 'r6', title: '3x Loyalty Points Weekend', icon: '🏅' },
        { id: 'r7', title: '20% Off Running Shoes', icon: '👟' },
        { id: 'r8', title: 'Premium Headphones €30 Off', icon: '🎧' },
        { id: 'r9', title: 'Smart Watch Trade-In', icon: '⌚' },
        { id: 'r10', title: 'Grocery Flash Sale — 15% Off', icon: '🍴' },
      ],
      pills: [
        { label: 'High-Margin Offers', ruleExpr: 'margin = "High"', description: 'High profit margin offers — prioritized to maximize revenue per impression.', matchIds: ['r1'] },
        { label: 'Loyalty Rewards', ruleExpr: 'type IN ("Loyalty", "Exclusive")', description: 'For loyalty members — builds retention and lifetime value.', matchIds: ['r1', 'r4', 'r6'] },
        { label: 'Electronics Deals', ruleExpr: 'category = "Electronics"', description: 'Electronics category — targets tech-interested shoppers.', matchIds: ['r2', 'r8', 'r9'] },
        { label: 'Discount & Bundles', ruleExpr: 'type IN ("Discount", "Bundle")', description: 'Price-led promotions for price-sensitive segments.', matchIds: ['r3', 'r7', 'r8', 'r10'] },
        { label: 'All Active Offers', ruleExpr: 'endDate > now()', description: 'Every offer within its validity window — broadest selection.', matchIds: ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9', 'r10'] },
      ],
    },
    media: {
      offers: [
        { id: 'm1', title: 'Premium annual — 2 months free', icon: '🎬' },
        { id: 'm2', title: 'Sports live pass add-on', icon: '⚽' },
        { id: 'm3', title: 'Kids & family annual', icon: '👨‍👩‍👧' },
        { id: 'm4', title: '30-day trial — card on file', icon: '🎁' },
        { id: 'm5', title: '4K UHD tier upgrade', icon: '📺' },
        { id: 'm6', title: 'Documentary hub monthly', icon: '📚' },
        { id: 'm7', title: 'Student plan discount', icon: '🎓' },
        { id: 'm8', title: 'CTV big-screen bundle', icon: '🖥' },
        { id: 'm9', title: 'Win-back — 50% off 3 mo', icon: '💌' },
        { id: 'm10', title: 'Streaming + music bundle', icon: '🎵' },
      ],
      pills: [
        { label: 'Premium & high ARPU', ruleExpr: 'margin = "High"', description: 'Top-yield subscription SKUs — annual and tier upgrades first.', matchIds: ['m1', 'm5', 'm6'] },
        { label: 'Live & sports', ruleExpr: 'genre = "Sports"', description: 'Live events and league passes for sports-heavy profiles.', matchIds: ['m2', 'm8'] },
        { label: 'Family & kids paths', ruleExpr: 'audience IN ("Family", "Kids")', description: 'Household and parental-control bundles in the same policy.', matchIds: ['m3', 'm7'] },
        { label: 'Trial & win-back', ruleExpr: 'segment IN ("trial", "win_back")', description: 'Acquisition and re-activation offers with short windows.', matchIds: ['m4', 'm9'] },
        { label: 'Full active catalogue', ruleExpr: 'endDate > now()', description: 'Everything currently valid — broadest eligible pool.', matchIds: ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10'] },
      ],
    },
    travel: {
      offers: [
        { id: 't1', title: 'Extra legroom — long-haul', icon: '✈️' },
        { id: 't2', title: 'Checked bags — 2×23 kg', icon: '🧳' },
        { id: 't3', title: 'Priority boarding — Group 1', icon: '⭐' },
        { id: 't4', title: 'Lounge pass — departure', icon: '☕' },
        { id: 't5', title: 'Inflight Wi‑Fi streaming', icon: '📶' },
        { id: 't6', title: 'Chef meal upgrade', icon: '🍽' },
        { id: 't7', title: 'Carbon offset bundle', icon: '🌱' },
        { id: 't8', title: 'Twin seat assignment', icon: '💺' },
        { id: 't9', title: 'Family row bundle', icon: '👨‍👩‍👧' },
        { id: 't10', title: 'Last-minute upgrade window', icon: '⚡' },
      ],
      pills: [
        { label: 'High-yield ancillaries', ruleExpr: 'yield_tier = "high"', description: 'Seat and service upsells with the strongest route yield.', matchIds: ['t1', 't6', 't10'] },
        { label: 'Loyalty & status', ruleExpr: 'tier IN ("Gold", "Platinum")', description: 'Tier-based perks that stack with fare rules.', matchIds: ['t3', 't4', 't8'] },
        { label: 'Long-haul comfort', ruleExpr: 'haul = "long"', description: 'Comfort bundles for intercontinental legs.', matchIds: ['t1', 't5', 't9'] },
        { label: 'Flash & seasonal', ruleExpr: 'window IN ("flash", "seasonal")', description: 'Time-boxed ancillaries during peaks and campaigns.', matchIds: ['t7', 't10'] },
        { label: 'All bookable', ruleExpr: 'inventory > 0', description: 'Every ancillary still available for this itinerary.', matchIds: ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9', 't10'] },
      ],
    },
    fsi: {
      offers: [
        { id: 'f1', title: 'Fixed-rate mortgage — 4.19% 5 yr', icon: '🏠' },
        { id: 'f2', title: 'Balance-transfer — 0% 24 mo', icon: '💳' },
        { id: 'f3', title: 'Stocks & Shares ISA — bonus', icon: '📈' },
        { id: 'f4', title: 'Everyday cashback current', icon: '🏦' },
        { id: 'f5', title: 'Premium wealth review', icon: '👔' },
        { id: 'f6', title: 'Student account pack', icon: '🎓' },
        { id: 'f7', title: 'SMB business tariff', icon: '🏢' },
        { id: 'f8', title: 'Green retrofit loan', icon: '🌿' },
        { id: 'f9', title: 'Home insurance bundle', icon: '🛡' },
        { id: 'f10', title: 'Mobile savings — 4.5% AER', icon: '📱' },
      ],
      pills: [
        { label: 'Mortgage & lending', ruleExpr: 'product_line = "lending"', description: 'Secured lending and regulated mortgage paths.', matchIds: ['f1', 'f8'] },
        { label: 'Cards & revolving', ruleExpr: 'type IN ("card", "credit")', description: 'Card acquisition and balance mechanics.', matchIds: ['f2', 'f4'] },
        { label: 'Wealth & invest', ruleExpr: 'segment IN ("wealth", "invest")', description: 'ISA, advisory, and growth-led offers.', matchIds: ['f3', 'f5'] },
        { label: 'Everyday & acquire', ruleExpr: 'segment = "retail_banking"', description: 'Current accounts, student, and SMB entry bundles.', matchIds: ['f4', 'f6', 'f7'] },
        { label: 'All approved offers', ruleExpr: 'compliance_status = "approved"', description: 'Everything passing policy and fair-lending checks.', matchIds: ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10'] },
      ],
    },
    telco: {
      offers: [
        { id: 'z1', title: '5G Unlimited Plus + eSIM', icon: '📱' },
        { id: 'z2', title: 'Fibre Gigabit + mesh Wi‑Fi', icon: '🏠' },
        { id: 'z3', title: 'Business multi-line + SD‑WAN', icon: '🏢' },
        { id: 'z4', title: 'Prepaid data booster', icon: '📶' },
        { id: 'z5', title: 'Family plan — 5 lines', icon: '👨‍👩‍👧' },
        { id: 'z6', title: 'Roaming Europe pass', icon: '✈️' },
        { id: 'z7', title: 'TV + fibre bundle', icon: '📺' },
        { id: 'z8', title: 'Churn save — 30% off', icon: '💌' },
        { id: 'z9', title: 'IoT fleet SIM pack', icon: '🚚' },
        { id: 'z10', title: 'Priority fault repair SLA', icon: '🔧' },
      ],
      pills: [
        { label: 'Mobile & 5G', ruleExpr: 'service = "mobile"', description: 'Handset-led and SIM-first acquisition paths.', matchIds: ['z1', 'z4', 'z5', 'z6'] },
        { label: 'Fibre & home', ruleExpr: 'service = "fixed"', description: 'Broadband and entertainment convergence.', matchIds: ['z2', 'z7'] },
        { label: 'SMB & business', ruleExpr: 'segment = "smb"', description: 'B2B connectivity and fleet-style add-ons.', matchIds: ['z3', 'z9'] },
        { label: 'Retention & save', ruleExpr: 'journey IN ("save", "retention")', description: 'Discounts and SLAs aimed at reducing churn.', matchIds: ['z8', 'z10'] },
        { label: 'All in-market', ruleExpr: 'status = "active"', description: 'Every SKU currently purchasable in region.', matchIds: ['z1', 'z2', 'z3', 'z4', 'z5', 'z6', 'z7', 'z8', 'z9', 'z10'] },
      ],
    },
    automotive: {
      offers: [
        { id: 'a1', title: 'Hybrid SUV PCP weekend', icon: '🚙' },
        { id: 'a2', title: 'EV bundle — wallbox + tariff', icon: '🔌' },
        { id: 'a3', title: 'Service plan+ — 36k miles', icon: '🛠' },
        { id: 'a4', title: 'Winter tyre pack', icon: '❄' },
        { id: 'a5', title: 'Fleet multi-vehicle lease', icon: '🚚' },
        { id: 'a6', title: 'EV test-drive incentive', icon: '🎁' },
        { id: 'a7', title: 'Accessories & retrofit pack', icon: '🧰' },
        { id: 'a8', title: 'PCP end-of-term upgrade', icon: '🔄' },
        { id: 'a9', title: 'Certified pre-owned warranty', icon: '✅' },
        { id: 'a10', title: 'Mobile tyre fitting', icon: '🛞' },
      ],
      pills: [
        { label: 'EV & electrification', ruleExpr: 'powertrain = "EV"', description: 'Charging, tariffs, and EV-first programmes.', matchIds: ['a2', 'a6'] },
        { label: 'Retail PCP', ruleExpr: 'programme = "retail_pcp"', description: 'Consumer finance and showroom-led vehicles.', matchIds: ['a1', 'a8'] },
        { label: 'Aftersales & care', ruleExpr: 'journey = "aftersales"', description: 'Service, tyres, and workshop attach.', matchIds: ['a3', 'a4', 'a10'] },
        { label: 'Fleet & business', ruleExpr: 'segment = "fleet"', description: 'Multi-vehicle and B2B incentives.', matchIds: ['a5', 'a9'] },
        { label: 'All programmes', ruleExpr: 'stock > 0', description: 'Every offer with available stock in market.', matchIds: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9', 'a10'] },
      ],
    },
    healthcare: {
      offers: [
        { id: 'h1', title: 'Virtual primary — same-day video', icon: '🩺' },
        { id: 'h2', title: 'Specialty — cardiology intake', icon: '🏥' },
        { id: 'h3', title: 'Pharmacy 90-day + coaching', icon: '💊' },
        { id: 'h4', title: 'Employer biometric screening', icon: '💼' },
        { id: 'h5', title: 'Urgent care video queue', icon: '⚡' },
        { id: 'h6', title: 'Chronic care — diabetes pathway', icon: '🫀' },
        { id: 'h7', title: 'Maternity bundle', icon: '🍼' },
        { id: 'h8', title: 'Mental health — EAP 6 sessions', icon: '🧠' },
        { id: 'h9', title: 'Preventive screening kit', icon: '📋' },
        { id: 'h10', title: 'Dental discount network', icon: '🦷' },
      ],
      pills: [
        { label: 'Virtual & primary', ruleExpr: 'care_mode = "virtual"', description: 'Digital front door and same-day access.', matchIds: ['h1', 'h5'] },
        { label: 'Specialty & referral', ruleExpr: 'pathway = "specialty"', description: 'Referral-led and specialty queues.', matchIds: ['h2', 'h6'] },
        { label: 'Pharmacy & wellness', ruleExpr: 'programme IN ("pharmacy", "wellness")', description: 'Medication adherence and prevention.', matchIds: ['h3', 'h9'] },
        { label: 'Employer & benefits', ruleExpr: 'payer = "employer"', description: 'Sponsored screenings and carve-outs.', matchIds: ['h4', 'h7', 'h8'] },
        { label: 'All covered', ruleExpr: 'eligible = true', description: 'Full benefits-eligible catalogue for this member.', matchIds: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7', 'h8', 'h9', 'h10'] },
      ],
    },
  };

  var DCE_COL_FILTER_SVG =
    '<svg class="dce-col-filter-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';

  function renderCollectionsPanel() {
    var mount = document.getElementById('dce-collections-mount');
    if (!mount) return;
    var ind = getIndustry();
    var conf = DCE_COLLECTIONS_UI[ind] || DCE_COLLECTIONS_UI.retail;
    var offers = conf.offers || [];
    var pills = conf.pills || [];
    var n = pills.length;
    var ix = DCE_COL_PILL_IX[ind];
    if (typeof ix !== 'number' || ix < 0 || ix >= n) {
      ix = 0;
      DCE_COL_PILL_IX[ind] = 0;
    } else {
      DCE_COL_PILL_IX[ind] = ix;
    }
    var active = pills[ix] || pills[0];
    var matchSet = {};
    (active && active.matchIds ? active.matchIds : []).forEach(function (oid) {
      matchSet[oid] = true;
    });

    var parts = [];
    parts.push('<div class="dce-collections-ui">');
    parts.push('<div class="dce-col-pills" role="tablist" aria-label="Collections">');
    pills.forEach(function (p, i) {
      var isOn = i === ix;
      parts.push(
        '<button type="button" class="dce-col-pill' +
          (isOn ? ' is-active' : '') +
          '" data-dce-col-ix="' +
          i +
          '" role="tab" aria-selected="' +
          (isOn ? 'true' : 'false') +
          '" id="dce-col-pill-' +
          i +
          '">' +
          escColHtml(p.label) +
          '</button>'
      );
    });
    parts.push('</div>');

    parts.push('<div class="dce-col-detail card" role="tabpanel" aria-labelledby="dce-col-pill-' + ix + '">');
    parts.push('<div class="dce-col-rule-block">');
    parts.push('<div class="dce-col-rule-row">' + DCE_COL_FILTER_SVG);
    parts.push('<code class="dce-col-rule-code">' + escColHtml(active.ruleExpr) + '</code></div>');
    parts.push('<p class="dce-col-rule-desc">' + escColHtml(active.description) + '</p>');
    parts.push('</div>');
    parts.push('<div class="dce-col-offer-grid">');
    offers.forEach(function (o) {
      var isMatch = !!matchSet[o.id];
      parts.push(
        '<div class="dce-col-offer-tile' +
          (isMatch ? '' : ' dce-col-offer-tile--dim') +
          '"><span class="dce-col-offer-ico" aria-hidden="true">' +
          (o.icon || '📋') +
          '</span><span class="dce-col-offer-title">' +
          escColHtml(o.title) +
          '</span>' +
          (isMatch ? '<span class="dce-col-match-pill">MATCH</span>' : '<span class="dce-col-match-spacer"></span>') +
          '</div>'
      );
    });
    parts.push('</div></div></div>');

    mount.innerHTML = parts.join('');
  }

  function bindCollectionsPills() {
    var mount = document.getElementById('dce-collections-mount');
    if (!mount || mount._dceColBound) return;
    mount._dceColBound = true;
    mount.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('.dce-col-pill') : null;
      if (!b || !mount.contains(b)) return;
      e.preventDefault();
      var raw = b.getAttribute('data-dce-col-ix');
      var ix = raw == null ? NaN : parseInt(raw, 10);
      if (isNaN(ix)) return;
      DCE_COL_PILL_IX[getIndustry()] = ix;
      renderCollectionsPanel();
    });
  }

  function applyCollectionsIndustry() {
    renderCollectionsPanel();
  }

  var DCE_RULES_ON = {};
  var DCE_RULES_TOTAL = 30;

  var DCE_RULES_DATA = {
    retail: {
      rules: [
        { title: 'VIP Customers Only', keepsLabel: 'keeps ~20%', logic: 'Profile · loyaltyTier IN ("Platinum", "Gold")', icon: '👑', keepRate: 0.2 },
        { title: 'Cart Value > €80', keepsLabel: 'keeps ~50%', logic: 'Context · cart.value > 80', icon: '🛒', keepRate: 0.5 },
        { title: 'Category Browsers', keepsLabel: 'keeps ~70%', logic: 'Event · browsedCategories CONTAINS "…"', icon: '🖥', keepRate: 0.7 },
        { title: 'Repeat Purchasers', keepsLabel: 'keeps ~40%', logic: 'Computed · purchaseCount ≥ 3 in 90d', icon: '🔁', keepRate: 0.4 },
      ],
      personas: [
        { initials: 'J', line: 'Jordan, 34 · Platinum', pass: [true, true, true, true] },
        { initials: 'R', line: 'Riley, 27 · No tier', pass: [false, false, true, false] },
        { initials: 'P', line: 'The Parkers · Silver', pass: [false, true, true, true] },
      ],
    },
    media: {
      rules: [
        { title: 'Premium subscribers', keepsLabel: 'keeps ~22%', logic: 'Profile · subscriptionTier IN ("Premium", "Annual")', icon: '⭐', keepRate: 0.22 },
        { title: 'High engagement viewers', keepsLabel: 'keeps ~48%', logic: 'Computed · watchHours30d ≥ 8', icon: '📺', keepRate: 0.48 },
        { title: 'Genre affinity match', keepsLabel: 'keeps ~65%', logic: 'Profile · genreAffinity CONTAINS campaign.genre', icon: '🎬', keepRate: 0.65 },
        { title: 'Win-back cohort', keepsLabel: 'keeps ~35%', logic: 'Segment · churnRisk90d = true', icon: '💌', keepRate: 0.35 },
      ],
      personas: [
        { initials: 'J', line: 'Jordan · Premium annual', pass: [true, true, true, false] },
        { initials: 'R', line: 'Riley · Ad-supported tier', pass: [false, false, true, true] },
        { initials: 'P', line: 'The Parkers · Family plan', pass: [true, true, false, false] },
      ],
    },
    travel: {
      rules: [
        { title: 'Gold & Platinum tier', keepsLabel: 'keeps ~18%', logic: 'Profile · loyaltyTier IN ("Gold", "Platinum")', icon: '✈️', keepRate: 0.18 },
        { title: 'Long-haul route', keepsLabel: 'keeps ~45%', logic: 'Context · haul = "long"', icon: '🌍', keepRate: 0.45 },
        { title: 'Ancillary window open', keepsLabel: 'keeps ~72%', logic: 'Context · hoursToDeparture ≤ 48', icon: '⏱', keepRate: 0.72 },
        { title: 'Repeat route bookers', keepsLabel: 'keeps ~38%', logic: 'Computed · segmentsFlown12m ≥ 3', icon: '🔁', keepRate: 0.38 },
      ],
      personas: [
        { initials: 'J', line: 'Jordan · Platinum · LHR→SFO', pass: [true, true, true, true] },
        { initials: 'R', line: 'Riley · Member · short-haul', pass: [false, false, true, false] },
        { initials: 'P', line: 'The Parkers · Silver · family', pass: [false, true, true, true] },
      ],
    },
    fsi: {
      rules: [
        { title: 'Authenticated session', keepsLabel: 'keeps ~55%', logic: 'Context · channel IN ("mobile_bank", "web_auth")', icon: '🔐', keepRate: 0.55 },
        { title: 'Wealth & invest intent', keepsLabel: 'keeps ~15%', logic: 'Profile · intentScore ≥ 0.75', icon: '📈', keepRate: 0.15 },
        { title: 'Product eligible', keepsLabel: 'keeps ~60%', logic: 'Profile · regulatedProduct IN ("mortgage", "isa")', icon: '🏦', keepRate: 0.6 },
        { title: 'Marketing consent', keepsLabel: 'keeps ~80%', logic: 'Consent · marketing = true', icon: '✉️', keepRate: 0.8 },
      ],
      personas: [
        { initials: 'J', line: 'Jordan · Logged-in · mortgage intent', pass: [true, true, true, true] },
        { initials: 'R', line: 'Riley · Guest · browsing', pass: [false, false, false, false] },
        { initials: 'P', line: 'The Parkers · ISA · opted in', pass: [true, false, true, true] },
      ],
    },
    telco: {
      rules: [
        { title: 'Unlimited mobile plan', keepsLabel: 'keeps ~28%', logic: 'Profile · planType = "unlimited"', icon: '📱', keepRate: 0.28 },
        { title: 'Fibre-addressable', keepsLabel: 'keeps ~52%', logic: 'Context · serviceability.fibre = true', icon: '🏠', keepRate: 0.52 },
        { title: 'SMB account', keepsLabel: 'keeps ~12%', logic: 'Segment · accountType = "smb"', icon: '🏢', keepRate: 0.12 },
        { title: 'Save / retention journey', keepsLabel: 'keeps ~33%', logic: 'Journey · stage IN ("save", "retention")', icon: '💌', keepRate: 0.33 },
      ],
      personas: [
        { initials: 'J', line: 'Jordan · Unlimited · fibre-ready', pass: [true, true, false, false] },
        { initials: 'R', line: 'Riley · Prepaid · urban', pass: [false, true, false, true] },
        { initials: 'P', line: 'The Parkers · SMB static IP', pass: [false, true, true, false] },
      ],
    },
    automotive: {
      rules: [
        { title: 'EV hand-raiser', keepsLabel: 'keeps ~20%', logic: 'Profile · interestTags CONTAINS "EV"', icon: '🔌', keepRate: 0.2 },
        { title: 'PCP retail eligible', keepsLabel: 'keeps ~45%', logic: 'Context · programme = "retail_pcp"', icon: '🚙', keepRate: 0.45 },
        { title: 'Service due ≤ 90d', keepsLabel: 'keeps ~58%', logic: 'Vehicle · serviceDueDays ≤ 90', icon: '🛠', keepRate: 0.58 },
        { title: 'Fleet / business', keepsLabel: 'keeps ~14%', logic: 'Segment · buyer = "fleet"', icon: '🚚', keepRate: 0.14 },
      ],
      personas: [
        { initials: 'J', line: 'Jordan · EV configure · PCP', pass: [true, true, true, false] },
        { initials: 'R', line: 'Riley · First enquiry · cash', pass: [false, false, false, false] },
        { initials: 'P', line: 'The Parkers · Workshop due · ICE', pass: [false, true, true, false] },
      ],
    },
    healthcare: {
      rules: [
        { title: 'Benefits active', keepsLabel: 'keeps ~70%', logic: 'Coverage · status = "active"', icon: '🩺', keepRate: 0.7 },
        { title: 'Virtual care eligible', keepsLabel: 'keeps ~40%', logic: 'Benefits · virtualVisitsRemaining > 0', icon: '💻', keepRate: 0.4 },
        { title: 'Chronic programme', keepsLabel: 'keeps ~25%', logic: 'Programme · pathway IN ("diabetes", "heart")', icon: '🫀', keepRate: 0.25 },
        { title: 'Employer-sponsored', keepsLabel: 'keeps ~35%', logic: 'Payer · type = "employer"', icon: '💼', keepRate: 0.35 },
      ],
      personas: [
        { initials: 'J', line: 'Jordan · PPO · diabetes CM', pass: [true, true, true, true] },
        { initials: 'R', line: 'Riley · Gap coverage · ad-hoc', pass: [false, false, false, false] },
        { initials: 'P', line: 'The Parkers · Employer HSA', pass: [true, true, false, true] },
      ],
    },
  };

  function getRulesOnState(ind) {
    var a = DCE_RULES_ON[ind];
    if (!a || a.length !== 4) {
      a = [false, false, false, false];
      DCE_RULES_ON[ind] = a;
    }
    return a;
  }

  function rulesEligiblePopulation(active, ruleDefs) {
    var on = 0;
    for (var i = 0; i < active.length; i++) if (active[i]) on++;
    if (on === 0) return DCE_RULES_TOTAL;
    var p = 1;
    for (var j = 0; j < active.length; j++) {
      if (active[j]) p *= ruleDefs[j].keepRate;
    }
    /* Match experience-decisioning-playground RulesStep: min 1 eligible when any rule is on */
    var n = Math.round(DCE_RULES_TOTAL * p);
    return Math.max(1, Math.min(DCE_RULES_TOTAL, n));
  }

  function dceRuleLogicLine(rd) {
    if (!rd) return '';
    if (rd.logic) return rd.logic;
    var parts = [];
    if (rd.source) parts.push(rd.source);
    if (rd.condition) parts.push(rd.condition);
    return parts.join(' · ');
  }

  function rulesAudienceHint(activeCount, eligible, total) {
    if (activeCount === 0) {
      return 'No rules active — everyone qualifies. Toggle rules on the left to narrow the audience.';
    }
    var frac = eligible / total;
    if (frac <= 0.1) return 'Very narrow audience — only the most qualified customers remain.';
    if (frac <= 0.25) return 'A focused segment — strong guardrails on who sees the offer.';
    return 'Rules are filtering your audience — adjust toggles to refine reach.';
  }

  function renderRulesPanel() {
    var mount = document.getElementById('dce-rules-toggle-mount');
    var headEl = document.getElementById('dce-rules-audience-head');
    var iconsEl = document.getElementById('dce-rules-icons');
    var barEl = document.getElementById('dce-rules-bar-fill');
    var hintEl = document.getElementById('dce-rules-audience-hint');
    var personaMount = document.getElementById('dce-rules-personas-mount');
    if (!mount || !headEl || !iconsEl || !barEl || !hintEl || !personaMount) return;

    var ind = getIndustry();
    var pack = DCE_RULES_DATA[ind] || DCE_RULES_DATA.retail;
    var rules = pack.rules;
    var active = getRulesOnState(ind);
    var activeCount = active.filter(function (x) { return x; }).length;
    var eligible = rulesEligiblePopulation(active, rules);
    var pct = Math.round((eligible / DCE_RULES_TOTAL) * 100);

    headEl.textContent =
      'Your audience — ' + eligible + ' of ' + DCE_RULES_TOTAL + ' eligible (' + pct + '%)';

    var iconParts = [];
    for (var g = 0; g < DCE_RULES_TOTAL; g++) {
      iconParts.push(
        '<span class="dce-rules-person-ico' + (g < eligible ? ' is-lit' : '') + '" aria-hidden="true"></span>'
      );
    }
    iconsEl.innerHTML = iconParts.join('');
    barEl.style.width = pct + '%';
    barEl.classList.toggle('dce-rules-bar-fill--neutral', activeCount === 0);
    hintEl.textContent = rulesAudienceHint(activeCount, eligible, DCE_RULES_TOTAL);
    if (activeCount === 0) {
      hintEl.classList.remove('dce-rules-audience-hint--warn');
    } else if (eligible / DCE_RULES_TOTAL <= 0.1 || eligible <= 3) {
      hintEl.classList.add('dce-rules-audience-hint--warn');
    } else {
      hintEl.classList.remove('dce-rules-audience-hint--warn');
    }

    var cardParts = [];
    for (var r = 0; r < rules.length; r++) {
      var rd = rules[r];
      var isOn = !!active[r];
      cardParts.push(
        '<button type="button" class="dce-rules-card' +
          (isOn ? ' is-on' : '') +
          '" data-dce-rule-ix="' +
          r +
          '" role="switch" aria-checked="' +
          (isOn ? 'true' : 'false') +
          '">' +
          '<span class="dce-rules-card-ico" aria-hidden="true">' +
          escColHtml(rd.icon) +
          '</span>' +
          '<span class="dce-rules-card-body">' +
          '<span class="dce-rules-card-title">' +
          escColHtml(rd.title) +
          ' <span class="dce-rules-keeps">' +
          escColHtml(rd.keepsLabel) +
          '</span></span>' +
          '<span class="dce-rules-card-logic">' +
          escColHtml(dceRuleLogicLine(rd)) +
          '</span></span>' +
          '<span class="dce-rules-switch" aria-hidden="true"></span>' +
          '</button>'
      );
    }
    mount.innerHTML = cardParts.join('');

    var pParts = [];
    pack.personas.forEach(function (per) {
      var ok = true;
      if (activeCount > 0) {
        for (var x = 0; x < active.length; x++) {
          if (active[x] && !per.pass[x]) ok = false;
        }
      }
      var rowClass = 'dce-rules-persona';
      if (activeCount === 0) rowClass += ' dce-rules-persona--neutral';
      else if (ok) rowClass += ' dce-rules-persona--eligible';
      else rowClass += ' dce-rules-persona--excluded';

      var checkParts = [];
      if (activeCount === 0) {
        checkParts.push(
          '<li class="dce-rules-check dce-rules-check--na">No rule filters applied — everyone in the sample pool.</li>'
        );
      } else {
        for (var c = 0; c < rules.length; c++) {
          if (!active[c]) continue;
          var passes = per.pass[c];
          checkParts.push(
            '<li class="dce-rules-check' +
              (passes ? ' dce-rules-check--ok' : ' dce-rules-check--bad') +
              '">' +
              (passes ? '✓' : '✗') +
              ' ' +
              escColHtml(rules[c].title) +
              '</li>'
          );
        }
      }

      var verdict;
      if (activeCount === 0) verdict = '<span class="dce-rules-verdict dce-rules-verdict--muted">—</span>';
      else if (ok) verdict = '<span class="dce-rules-verdict dce-rules-verdict--ok">Eligible</span>';
      else verdict = '<span class="dce-rules-verdict dce-rules-verdict--bad">Excluded</span>';

      pParts.push(
        '<div class="' +
          rowClass +
          '">' +
          '<span class="dce-rules-avatar">' +
          escColHtml(per.initials) +
          '</span>' +
          '<div class="dce-rules-persona-mid">' +
          '<div class="dce-rules-persona-line">' +
          escColHtml(per.line) +
          '</div>' +
          '<ul class="dce-rules-checklist">' +
          checkParts.join('') +
          '</ul></div>' +
          verdict +
          '</div>'
      );
    });
    personaMount.innerHTML = pParts.join('');
  }

  function bindRulesPanel() {
    var panel = document.getElementById('dceViz-panel-rules');
    if (!panel || panel._dceRulesBound) return;
    panel._dceRulesBound = true;
    panel.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('.dce-rules-card');
      if (!btn || !panel.contains(btn)) return;
      e.preventDefault();
      var raw = btn.getAttribute('data-dce-rule-ix');
      var ix = raw == null ? NaN : parseInt(raw, 10);
      if (isNaN(ix)) return;
      var ind = getIndustry();
      var st = getRulesOnState(ind);
      st[ix] = !st[ix];
      renderRulesPanel();
    });
  }

  function applyRulesIndustry() {
    renderRulesPanel();
  }

  /** Journey arbitration — signals weight competing journey candidates (demo scoring). */
  var DCE_JOURNEY_ON = {};

  var DCE_JOURNEY_DATA = {
    media: {
      profile: { initials: 'AC', name: 'Alex Chen', meta: 'Premium annual · San Francisco · Age 29' },
      formula: 'score = Σ (signal_weight × journey_fit) + base_journey_value',
      signals: [
        { title: 'Binge weekend streak?', desc: '12h watched · Fri–Sun', icon: '📺', defaultOn: true, boost: [0.28, 0.06, 0.1, 0.14, 0.04] },
        { title: 'Drama genre affinity', desc: 'Top genre 90d = drama', icon: '🎬', defaultOn: true, boost: [0.22, 0.05, 0.04, 0.2, 0.03] },
        { title: 'Kids profile active', desc: 'Family plan · parental controls on', icon: '👨‍👩‍👧', defaultOn: false, boost: [0.04, 0.06, 0.02, 0.08, 0.32] },
        { title: 'Ad-supported tier', desc: 'Upgrade window open', icon: '📣', defaultOn: false, boost: [0.18, 0.24, 0.26, 0.05, 0.02] },
        { title: 'High churn risk', desc: 'Login drop · competitor promo seen', icon: '⚠️', defaultOn: false, boost: [0.05, 0.38, 0.04, 0.06, 0.02] },
      ],
      journeys: [
        { title: 'Upgrade & save', subtitle: 'Annual plan · drama bundle', pill: 'Drama fit +22%', base: 0.72, valueNote: '+0.9 ARPU lift' },
        { title: 'Win-back offer', subtitle: 'Discounted comeback window', pill: 'Churn save +35%', base: 0.55, valueNote: '+0.5 save rate' },
        { title: 'Trial conversion', subtitle: 'Extended trial · card on file', pill: 'Trial +18%', base: 0.58, valueNote: '+0.6 activation' },
        { title: 'Content discovery', subtitle: 'Hero rails · continue watching', pill: 'Engage +12%', base: 0.5, valueNote: '+0.3 hours' },
        { title: 'Family plan pitch', subtitle: 'Add-on seats · kids profile', pill: 'Family +30%', base: 0.48, valueNote: '+0.4 attach' },
      ],
      policy: { title: 'Reached push frequency', desc: 'Daily cap hit (3/3) — email fallback only.', warn: true },
    },
    travel: {
      profile: { initials: 'JM', name: 'Jordan Miles', meta: 'Gold · London hub · Age 41' },
      formula: 'score = Σ (signal_weight × journey_fit) + base_route_value',
      signals: [
        { title: 'Upcoming long-haul?', desc: 'LHR → SFO in 9d · wide-body', icon: '✈️', defaultOn: true, boost: [0.32, 0.06, 0.12, 0.05, 0.08] },
        { title: 'Seat not selected', desc: 'Party of 2 · exit row eligible', icon: '💺', defaultOn: true, boost: [0.26, 0.04, 0.08, 0.14, 0.03] },
        { title: 'Lounge eligible', desc: 'Gold + long-haul', icon: '🛋', defaultOn: false, boost: [0.14, 0.05, 0.28, 0.2, 0.04] },
        { title: 'Family trip', desc: 'Child traveller on PNR', icon: '👪', defaultOn: false, boost: [0.08, 0.22, 0.06, 0.18, 0.1] },
        { title: 'Price-sensitive search', desc: 'Compared 6 fares · 48h', icon: '🔍', defaultOn: false, boost: [0.05, 0.28, 0.04, 0.06, 0.24] },
      ],
      journeys: [
        { title: 'Long-haul ancillaries', subtitle: 'Bags · seats · Wi‑Fi', pill: 'Route +28%', base: 0.74, valueNote: '+£42 ancillary' },
        { title: 'Short-haul bundles', subtitle: 'City breaks · saver stack', pill: 'Leisure +15%', base: 0.62, valueNote: '+£18 bundle' },
        { title: 'Loyalty accelerator', subtitle: 'Tier miles · status boost', pill: 'Gold +20%', base: 0.58, valueNote: '+3k miles' },
        { title: 'Airport retail & parking', subtitle: 'Partner earn', pill: 'Airport +10%', base: 0.45, valueNote: '+£6 retail' },
        { title: 'Partner earn push', subtitle: 'Hotels · car · experiences', pill: 'Partner +8%', base: 0.42, valueNote: '+£4 partner' },
      ],
      policy: { title: 'Contact policy — SMS', desc: 'Transactional only until opt-in marketing.', warn: false },
    },
    retail: {
      profile: { initials: 'ML', name: 'Morgan Lee', meta: 'Platinum · Manchester · Age 32' },
      formula: 'score = Σ (signal_weight × journey_fit) + base_offer_value',
      signals: [
        { title: 'High-intent cart abandon?', desc: '£120 basket · 2h ago', icon: '🛒', defaultOn: true, boost: [0.34, 0.05, 0.22, 0.08, 0.06] },
        { title: 'Loyalty Platinum', desc: '12-mo rolling · early access', icon: '👑', defaultOn: true, boost: [0.12, 0.3, 0.06, 0.14, 0.05] },
        { title: 'Mobile-first sessions', desc: '78% traffic on app', icon: '📱', defaultOn: false, boost: [0.2, 0.08, 0.04, 0.18, 0.1] },
        { title: 'Seasonal campaign match', desc: 'Outerwear browse spike', icon: '🧥', defaultOn: false, boost: [0.06, 0.1, 0.26, 0.2, 0.08] },
        { title: 'Click & collect pending', desc: 'Order ready — not collected', icon: '📦', defaultOn: false, boost: [0.24, 0.04, 0.08, 0.06, 0.12] },
      ],
      journeys: [
        { title: 'Express checkout recovery', subtitle: 'Free delivery · one tap', pill: 'Cart +32%', base: 0.7, valueNote: '+18% recover' },
        { title: 'Loyalty rewards lane', subtitle: 'Points burn · tier gift', pill: 'Tier +25%', base: 0.64, valueNote: '+£12 margin' },
        { title: 'Markdown & clearance', subtitle: 'Matched category sale', pill: 'Promo +20%', base: 0.52, valueNote: '+9% attach' },
        { title: 'Upsell attach path', subtitle: 'Care · warranty · bundle', pill: 'Attach +14%', base: 0.5, valueNote: '+£8 AOV' },
        { title: 'Brand stories & editorial', subtitle: 'Inspire · discover', pill: 'Engage +10%', base: 0.44, valueNote: '+0.4 pages' },
      ],
      policy: { title: 'Email frequency cap', desc: 'Promo weekly limit reached — app only.', warn: true },
    },
    fsi: {
      profile: { initials: 'SR', name: 'Sarah Reynolds', meta: 'Gold tier · London, UK · Age 34' },
      formula: 'score = Σ (attribute_weights × journey_fit) + base_journey_value',
      signals: [
        { title: 'Reduce my mortgage?', desc: 'Rate lock expiring · £320k outstanding', icon: '🏠', defaultOn: true, boost: [0.48, 0.04, 0.02, 0.06, 0.1] },
        { title: 'Checked refinance rates', desc: 'Viewed calculator 2h ago', icon: '📊', defaultOn: true, boost: [0.4, 0.08, 0.05, 0.04, 0.06] },
        { title: 'Improve my rewards?', desc: '£3.2k/mo spend · standard card', icon: '💳', defaultOn: false, boost: [0.05, 0.12, 0.42, 0.06, 0.08] },
        { title: 'Grow my savings?', desc: 'ISA eligible · idle cash', icon: '🌱', defaultOn: false, boost: [0.04, 0.38, 0.06, 0.14, 0.05] },
        { title: 'High churn risk', desc: 'Competitor offer detected', icon: '⚠️', defaultOn: false, boost: [0.06, 0.05, 0.08, 0.06, 0.36] },
      ],
      journeys: [
        { title: 'Mortgage refinance', subtitle: 'Highest margin · rate lock window', pill: 'Refi +40%', base: 0.68, valueNote: '+1.5 margin score' },
        { title: 'Investment advisory', subtitle: 'Wealth · ISA products', pill: 'Wealth +22%', base: 0.62, valueNote: '+1.1 margin score' },
        { title: 'Credit card upgrade', subtitle: 'Rewards · fee tier', pill: 'Spend +18%', base: 0.55, valueNote: '+0.7 interchange' },
        { title: 'Insurance cross-sell', subtitle: 'Home · life wrap', pill: 'Cover +12%', base: 0.48, valueNote: '+0.5 premium' },
        { title: 'Retention & loyalty', subtitle: 'Save offer · service bundle', pill: 'Save +35%', base: 0.45, valueNote: '+0.4 NPS' },
      ],
      policy: { title: 'Reached email contact frequency', desc: 'Weekly cap hit (3/3) — cooldown active.', warn: true },
    },
    telco: {
      profile: { initials: 'SO', name: 'Sam Okonkwo', meta: 'Unlimited mobile · Fibre-ready · Age 28' },
      formula: 'score = Σ (signal_weight × journey_fit) + base_programme_value',
      signals: [
        { title: 'High data usage', desc: 'Near unlimited cap · video heavy', icon: '📶', defaultOn: true, boost: [0.14, 0.08, 0.28, 0.06, 0.1] },
        { title: 'Fibre addressable', desc: 'FTTP live on postcode', icon: '🏠', defaultOn: true, boost: [0.38, 0.06, 0.12, 0.05, 0.04] },
        { title: 'Contract end window', desc: '≤ 60 days · save risk', icon: '⏱', defaultOn: false, boost: [0.06, 0.42, 0.1, 0.08, 0.12] },
        { title: 'Multi-line household', desc: '3 lines · family plan', icon: '👪', defaultOn: false, boost: [0.1, 0.06, 0.18, 0.22, 0.06] },
        { title: 'Open care case', desc: 'Bill dispute · NPS follow-up', icon: '🎧', defaultOn: false, boost: [0.04, 0.36, 0.08, 0.1, 0.14] },
      ],
      journeys: [
        { title: 'Fibre upgrade', subtitle: '1Gb install · self-setup', pill: 'ARPU +24%', base: 0.72, valueNote: '+£18 MRR' },
        { title: 'Mobile save / retention', subtitle: 'Loyalty discount · add-ons', pill: 'Save path +32%', base: 0.58, valueNote: '+0.6 save rate' },
        { title: 'Device trade-in', subtitle: 'Early upgrade · recycle', pill: 'Hardware +15%', base: 0.54, valueNote: '+£9 attach' },
        { title: 'SMB static IP', subtitle: 'Business line · SLA', pill: 'B2B +20%', base: 0.46, valueNote: '+£25 ARPU' },
        { title: 'Roaming & travel pack', subtitle: 'Trip add-on', pill: 'Roaming +10%', base: 0.44, valueNote: '+£6 pack' },
      ],
      policy: { title: 'Marketing consent', desc: 'SMS promos off — in-app only.', warn: false },
    },
    automotive: {
      profile: { initials: 'CT', name: 'Chris Taylor', meta: 'EV configure · PCP eligible · Age 36' },
      formula: 'score = Σ (signal_weight × journey_fit) + base_programme_value',
      signals: [
        { title: 'EV hand-raiser', desc: 'Config saved · test drive open', icon: '🔌', defaultOn: true, boost: [0.4, 0.1, 0.06, 0.14, 0.05] },
        { title: 'PCP quote started', desc: 'Deposit line not completed', icon: '🚙', defaultOn: true, boost: [0.12, 0.42, 0.08, 0.16, 0.04] },
        { title: 'Service due ≤ 90d', desc: 'MOT + brake check', icon: '🛠', defaultOn: false, boost: [0.06, 0.08, 0.44, 0.12, 0.05] },
        { title: 'Fleet / business buyer', desc: 'VAT reg on file', icon: '🏢', defaultOn: false, boost: [0.05, 0.14, 0.06, 0.38, 0.22] },
        { title: 'Stock match alert', desc: 'Preferred trim inbound', icon: '🔔', defaultOn: false, boost: [0.22, 0.2, 0.04, 0.08, 0.18] },
      ],
      journeys: [
        { title: 'EV test drive', subtitle: 'Local stock · 48h slot', pill: 'EV +30%', base: 0.7, valueNote: '+£2.1k margin' },
        { title: 'PCP showroom close', subtitle: 'Finance · handover', pill: 'Retail +25%', base: 0.64, valueNote: '+£1.8k F&I' },
        { title: 'Service & aftersales', subtitle: 'Plans · tyres · MOT', pill: 'Workshop +22%', base: 0.56, valueNote: '+£420 RO' },
        { title: 'Trade-in uplift', subtitle: 'Part-ex valuation hold', pill: 'Stock +14%', base: 0.5, valueNote: '+£800 trade' },
        { title: 'Fleet enquiry', subtitle: 'Account manager', pill: 'Fleet +18%', base: 0.45, valueNote: '+£15k TCV' },
      ],
      policy: { title: 'Out-of-hours contact', desc: 'Calls routed — SMS booking only.', warn: false },
    },
    healthcare: {
      profile: { initials: 'JE', name: 'Jordan Ellis', meta: 'PPO · Employer HSA · Age 39' },
      formula: 'score = Σ (signal_weight × pathway_fit) + base_care_value',
      signals: [
        { title: 'Virtual visit unused', desc: '2 visits left · plan year', icon: '💻', defaultOn: true, boost: [0.36, 0.08, 0.06, 0.12, 0.1] },
        { title: 'Specialty search spike', desc: 'Cardiology content 3×', icon: '🫀', defaultOn: true, boost: [0.08, 0.4, 0.06, 0.18, 0.05] },
        { title: 'Refill due soon', desc: 'Rx maintenance · 7d', icon: '💊', defaultOn: false, boost: [0.06, 0.06, 0.42, 0.1, 0.08] },
        { title: 'Diabetes care pathway', desc: 'HbA1c due · CM enrolled', icon: '📋', defaultOn: false, boost: [0.1, 0.12, 0.08, 0.38, 0.06] },
        { title: 'Open enrolment window', desc: 'Employer plan selection', icon: '🏢', defaultOn: false, boost: [0.05, 0.06, 0.05, 0.06, 0.4] },
      ],
      journeys: [
        { title: 'Virtual-first care', subtitle: 'Triage · same-week slot', pill: 'Virtual +28%', base: 0.68, valueNote: '+0.8 utilisation' },
        { title: 'Specialty referral assist', subtitle: 'In-network · prior auth', pill: 'Specialty +24%', base: 0.62, valueNote: '+12 days faster' },
        { title: 'Pharmacy adherence', subtitle: 'Mail order · 90d', pill: 'PDC +18%', base: 0.55, valueNote: '+6% adherence' },
        { title: 'Chronic programme', subtitle: 'Coaching · devices', pill: 'CM +32%', base: 0.52, valueNote: '+0.4 engagement' },
        { title: 'Wellness incentive', subtitle: 'Steps · screenings', pill: 'Wellness +14%', base: 0.46, valueNote: '+£40 reward' },
      ],
      policy: { title: 'Sensitive channel guard', desc: 'No SMS for clinical content — app inbox.', warn: true },
    },
  };

  function getJourneyData(ind) {
    var d = DCE_JOURNEY_DATA[ind];
    return d || DCE_JOURNEY_DATA.media;
  }

  function getJourneyOnState(ind, nSignals) {
    var a = DCE_JOURNEY_ON[ind];
    var data = getJourneyData(ind);
    var defs = data.signals;
    if (!a || a.length !== nSignals) {
      a = [];
      for (var i = 0; i < nSignals; i++) {
        a[i] = defs[i] && defs[i].defaultOn === true;
      }
      DCE_JOURNEY_ON[ind] = a;
    }
    return a;
  }

  function computeJourneyScores(ind) {
    var data = getJourneyData(ind);
    var nj = data.journeys.length;
    var st = getJourneyOnState(ind, data.signals.length);
    var out = [];
    for (var j = 0; j < nj; j++) {
      var s = data.journeys[j].base || 0;
      for (var i = 0; i < data.signals.length; i++) {
        if (st[i] && data.signals[i].boost && data.signals[i].boost[j] != null) {
          s += data.signals[i].boost[j];
        }
      }
      out.push(Math.round(s * 100) / 100);
    }
    return out;
  }

  function renderJourneyPanel() {
    var panel = document.getElementById('dceViz-panel-journey');
    if (!panel) return;
    var ind = getIndustry();
    var data = getJourneyData(ind);
    var scores = computeJourneyScores(ind);
    var st = getJourneyOnState(ind, data.signals.length);

    var rank = [];
    for (var rj = 0; rj < scores.length; rj++) {
      rank.push({ ix: rj, score: scores[rj], j: data.journeys[rj] });
    }
    rank.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return a.ix - b.ix;
    });

    var prof = document.getElementById('dce-journey-profile-mount');
    if (prof) {
      prof.innerHTML =
        '<div class="dce-journey-avatar" aria-hidden="true">' +
        escColHtml(data.profile.initials) +
        '</div>' +
        '<div class="dce-journey-profile-text">' +
        '<div class="dce-journey-profile-name">' +
        escColHtml(data.profile.name) +
        '</div>' +
        '<div class="dce-journey-profile-meta">' +
        escColHtml(data.profile.meta) +
        '</div></div>';
    }

    var sigMount = document.getElementById('dce-journey-signals-mount');
    if (sigMount) {
      var sh = '';
      for (var si = 0; si < data.signals.length; si++) {
        var sg = data.signals[si];
        var on = !!st[si];
        sh +=
          '<button type="button" class="dce-journey-signal card' +
          (on ? ' is-on' : '') +
          '" data-dce-journey-signal="' +
          si +
          '">' +
          '<span class="dce-journey-signal-ico" aria-hidden="true">' +
          escColHtml(sg.icon) +
          '</span>' +
          '<span class="dce-journey-signal-body">' +
          '<span class="dce-journey-signal-title">' +
          escColHtml(sg.title) +
          '</span>' +
          '<span class="dce-journey-signal-desc">' +
          escColHtml(sg.desc) +
          '</span></span>' +
          '<span class="dce-journey-signal-switch" aria-hidden="true"></span>' +
          '</button>';
      }
      sigMount.innerHTML = sh;
    }

    var pol = document.getElementById('dce-journey-policy-mount');
    if (pol && data.policy) {
      pol.innerHTML =
        '<div class="dce-journey-policy card' +
        (data.policy.warn ? ' dce-journey-policy--warn' : '') +
        '">' +
        '<span class="dce-journey-policy-ico" aria-hidden="true">' +
        (data.policy.warn ? '⛔' : 'ℹ️') +
        '</span>' +
        '<div class="dce-journey-policy-text">' +
        '<div class="dce-journey-policy-title">' +
        escColHtml(data.policy.title) +
        '</div>' +
        '<div class="dce-journey-policy-desc">' +
        escColHtml(data.policy.desc) +
        '</div></div></div>';
      pol.style.display = '';
    } else if (pol) {
      pol.innerHTML = '';
    }

    var fm = document.getElementById('dce-journey-formula');
    if (fm) fm.textContent = data.formula;

    var rm = document.getElementById('dce-journey-rank-mount');
    if (rm) {
      var rh = '';
      for (var ri = 0; ri < rank.length; ri++) {
        var row = rank[ri];
        var jj = row.j;
        var isWin = ri === 0;
        rh +=
          '<div class="dce-journey-card card' +
          (isWin ? ' dce-journey-card--winner' : '') +
          '" data-dce-journey-index="' +
          row.ix +
          '">' +
          '<div class="dce-journey-card-top">' +
          '<span class="dce-journey-card-num" aria-hidden="true">' +
          (ri + 1) +
          '</span>' +
          '<div class="dce-journey-card-main">' +
          '<div class="dce-journey-card-title">' +
          escColHtml(jj.title) +
          '</div>' +
          '<div class="dce-journey-card-sub">' +
          escColHtml(jj.subtitle) +
          '</div>' +
          (jj.pill
            ? '<span class="dce-journey-pill">' + escColHtml(jj.pill) + '</span>'
            : '') +
          '</div>' +
          '<div class="dce-journey-card-score-block">' +
          '<div class="dce-journey-card-score">' +
          escColHtml(String(row.score)) +
          '</div>' +
          '<div class="dce-journey-card-value">' +
          escColHtml(jj.valueNote || '') +
          '</div></div></div>' +
          (isWin
            ? '<div class="dce-journey-card-hint">Highest score wins — toggle signals on the left to reshuffle.</div>'
            : '') +
          '</div>';
      }
      rm.innerHTML = rh;
    }
  }

  function applyJourneyIndustry() {
    renderJourneyPanel();
  }

  function bindJourneyPanel() {
    var panel = document.getElementById('dceViz-panel-journey');
    if (!panel || panel.getAttribute('data-dce-journey-bound') === '1') return;
    panel.setAttribute('data-dce-journey-bound', '1');
    panel.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('.dce-journey-signal');
      if (!btn || !panel.contains(btn)) return;
      e.preventDefault();
      var raw = btn.getAttribute('data-dce-journey-signal');
      var ix = raw == null ? NaN : parseInt(raw, 10);
      if (isNaN(ix)) return;
      var ind = getIndustry();
      var data = getJourneyData(ind);
      var st = getJourneyOnState(ind, data.signals.length);
      st[ix] = !st[ix];
      renderJourneyPanel();
    });
  }

  function escColHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  var FORMULA_MEDIA = [
    { name: 'Drama Series — Annual Plan', category: 'drama', baseScore: 75, expiresIn: 20 },
    { name: 'Documentary Hub — Monthly', category: 'documentary', baseScore: 85, expiresIn: 36 },
    { name: 'Kids & Family — Annual Plan', category: 'kids', baseScore: 78, expiresIn: 10 },
  ];
  var FORMULA_TRAVEL = [
    { name: 'Business cabin upgrade — long-haul', category: 'business', baseScore: 75, expiresIn: 20 },
    { name: 'City break saver — short-haul bundle', category: 'leisure', baseScore: 85, expiresIn: 36 },
    { name: 'Family row + bags — 4 seats', category: 'family', baseScore: 78, expiresIn: 10 },
  ];
  var FORMULA_RETAIL = [
    { name: 'Member exclusive — extra 20% off electrics', category: 'member', baseScore: 75, expiresIn: 20 },
    { name: 'Premium beauty bundle — gift with purchase', category: 'premium', baseScore: 85, expiresIn: 36 },
    { name: 'Value aisle flash — household essentials', category: 'value', baseScore: 78, expiresIn: 10 },
  ];
  var FORMULA_FSI = [
    { name: 'Wealth — advisory portfolio review', category: 'wealth', baseScore: 75, expiresIn: 20 },
    { name: 'Everyday — cashback current account', category: 'everyday', baseScore: 85, expiresIn: 36 },
    { name: 'Business banking — fee-free 12 months', category: 'smb', baseScore: 78, expiresIn: 10 },
  ];
  var FORMULA_TELCO = [
    { name: 'Mobile — 5G device + unlimited bundle', category: 'mobile', baseScore: 75, expiresIn: 20 },
    { name: 'Home & fibre — gigabit + mesh upgrade', category: 'home', baseScore: 85, expiresIn: 36 },
    { name: 'Business lines — multi-line + static IP pack', category: 'smb', baseScore: 78, expiresIn: 10 },
  ];
  var FORMULA_AUTOMOTIVE = [
    { name: 'Showroom — hybrid SUV PCP weekend', category: 'showroom', baseScore: 75, expiresIn: 20 },
    { name: 'EV bundle — test drive + home charger', category: 'ev', baseScore: 85, expiresIn: 36 },
    { name: 'Fleet care — multi-vehicle service plan', category: 'fleet', baseScore: 78, expiresIn: 10 },
  ];
  var FORMULA_HEALTHCARE = [
    { name: 'Virtual visit — same-day primary video', category: 'virtual', baseScore: 85, expiresIn: 36 },
    { name: 'Specialty slot — expedited referral window', category: 'specialty', baseScore: 75, expiresIn: 20 },
    { name: 'Employer screening — biometric kit', category: 'employer', baseScore: 78, expiresIn: 10 },
  ];

  var offers = PRIORITY_MEDIA.slice();
  var formulaOffers = FORMULA_MEDIA.slice();

  var profilesMedia = [
    {
      reasoning: '🧠 <strong>Model reasoning:</strong> Maya streams 20+ hours/month — she already loves the product. High engagement signals low price-sensitivity. The model predicts she\'ll commit to an annual plan if anchored with the "2 months free" value framing. A free trial would be wasted on someone who\'s already sold.',
      ranks: [
        { name: 'Annual Plan — 2 months free', why: 'High engagement → ready to commit long-term', conf: 92 },
        { name: 'Premium HD — Monthly', why: 'Fallback if annual feels like too much', conf: 71 },
        { name: '30-Day Free Trial', why: 'Low relevance — she already uses the free tier heavily', conf: 34 },
        { name: 'Family Plan — 3 screens', why: 'No multi-user signals in her behaviour', conf: 18 },
        { name: 'Student Discount Plan', why: 'Age & usage profile doesn\'t match', conf: 9 },
        { name: '7-Day Free Trial — No card required', why: 'Too short — high engager needs commitment framing', conf: 6 },
        { name: 'Monthly Plan — Cancel anytime', why: 'Annual offer dominates; monthly adds little incremental value', conf: 4 },
      ],
    },
    {
      reasoning: '🧠 <strong>Model reasoning:</strong> Marcus watches infrequently and primarily uses a desktop browser — a signal of passive intent. He\'s never clicked a subscription prompt before. The model predicts he needs a low-stakes entry point with no credit card friction. Long-term commitment items will likely cause drop-off.',
      ranks: [
        { name: '7-Day Free Trial — No card required', why: 'Zero friction → matches low-commitment signals', conf: 87 },
        { name: 'Monthly Plan — Cancel anytime', why: 'Short commitment horizon fits his usage pattern', conf: 64 },
        { name: 'Student Discount Plan', why: 'Price sensitivity signal, though age uncertain', conf: 41 },
        { name: 'Annual Plan — 2 months free', why: 'Too long a commitment for passive viewer', conf: 22 },
        { name: 'Family Plan — 3 screens', why: 'Single-device usage — no multi-screen need', conf: 8 },
        { name: '30-Day Free Trial', why: 'Longer trial unlikely to convert passive user', conf: 5 },
        { name: 'Premium HD — Monthly', why: 'Price point too high for low-intent profile', conf: 3 },
      ],
    },
    {
      reasoning: '🧠 <strong>Model reasoning:</strong> The García household streams across 3 devices simultaneously, with both kids and adult content. This is the clearest signal for a family plan. The model has seen this pattern convert at 2.4× the rate of individual plans for households with similar multi-device behaviour.',
      ranks: [
        { name: 'Family Plan — 3 screens', why: 'Multi-device usage is the #1 conversion predictor', conf: 94 },
        { name: 'Annual Plan — 2 months free', why: 'High engagement household justifies annual savings', conf: 68 },
        { name: 'Premium HD — Monthly', why: 'Good fallback if family plan price is a barrier', conf: 45 },
        { name: '30-Day Free Trial', why: 'Already active — trial doesn\'t add perceived value', conf: 21 },
        { name: '7-Day Free Trial — No card required', why: 'Too short for a household to evaluate properly', conf: 11 },
        { name: 'Monthly Plan — Cancel anytime', why: 'Family needs multi-screen, not flexibility', conf: 7 },
        { name: 'Student Discount Plan', why: 'Household profile doesn\'t match student segment', conf: 2 },
      ],
    },
  ];

  var profilesTravel = [
    {
      reasoning: '🧠 <strong>Model reasoning:</strong> Alex is Gold tier with 40+ segments/year and always books business on long-haul. The model predicts seat and cabin upsells over bags — time savings and comfort dominate. A generic “extra bag” offer would underperform.',
      ranks: [
        { name: 'Business cabin upgrade — LHR→JFK', why: 'Tier + route history → highest uplift probability', conf: 93 },
        { name: 'Extra legroom bundle', why: 'Strong secondary for overnight flights', conf: 76 },
        { name: 'Priority security + lounge pass', why: 'Matches business traveller pain points', conf: 58 },
        { name: 'Wi‑Fi day pass', why: 'Nice add-on; lower incremental revenue', conf: 31 },
        { name: 'Checked bag bundle', why: 'Usually included in biz — weaker fit', conf: 22 },
        { name: 'Family row package', why: 'Solo traveller profile', conf: 9 },
        { name: 'Travel insurance add-on', why: 'Low propensity from past purchases', conf: 5 },
      ],
    },
    {
      reasoning: '🧠 <strong>Model reasoning:</strong> Sam books leisure rarely and compares on price. First long-haul in years — the model favours low-friction ancillaries (bags, standard seat) before premium upsells. Pushing business class would likely abandon the funnel.',
      ranks: [
        { name: 'Checked bag bundle — save vs airport', why: 'Price-sensitive · clear value', conf: 88 },
        { name: 'Standard seat selection', why: 'Reduces anxiety without big spend', conf: 67 },
        { name: 'Meal preorder discount', why: 'Small upsell aligned to budget trip', conf: 42 },
        { name: 'Priority boarding', why: 'Nice-to-have after core needs', conf: 28 },
        { name: 'Business cabin upgrade', why: 'High ticket — poor fit for profile', conf: 14 },
        { name: 'Lounge day pass', why: 'Luxury step too far for this trip', conf: 8 },
        { name: 'Travel insurance', why: 'Often deferred until later in path', conf: 4 },
      ],
    },
    {
      reasoning: '🧠 <strong>Model reasoning:</strong> The Nguyens travel as a family in peak season with a connecting itinerary. The model prioritises seated-together and bag bundles over individual upgrades — group cohesion is the strongest predictor of ancillary uptake here.',
      ranks: [
        { name: 'Family row + bags — 4 seats', why: 'Household + kids → #1 predictor for this segment', conf: 95 },
        { name: 'Priority boarding — Group 2 family', why: 'Board together · reduce stress', conf: 72 },
        { name: 'Meal bundle — kids', why: 'Aligned to family trip context', conf: 48 },
        { name: 'Extra legroom single seat', why: 'Weaker — family books as a unit', conf: 19 },
        { name: 'Business upgrade — one segment', why: 'Uneven value across party', conf: 11 },
        { name: 'Wi‑Fi pass', why: 'Secondary after seating resolved', conf: 7 },
        { name: 'Lounge access', why: 'Short connection — lower priority', conf: 3 },
      ],
    },
  ];

  var profilesRetail = [
    {
      reasoning: '🧠 <strong>Model reasoning:</strong> Jordan is Platinum loyalty with high app engagement and basket values over £120. The model predicts member-only and premium bundles over generic clearance — price sensitivity is low; recognition and exclusivity drive conversion.',
      ranks: [
        { name: 'Member exclusive — extra 20% off electrics', why: 'Tier + electronics browse history → strongest fit', conf: 93 },
        { name: 'Premium beauty bundle — gift with purchase', why: 'Cross-category affinity from past orders', conf: 76 },
        { name: 'Express delivery — next-day slot', why: 'Convenience matches high-intent checkout', conf: 58 },
        { name: 'Value aisle flash — household essentials', why: 'Lower margin vs member tier offers', conf: 31 },
        { name: 'Clearance apparel — extra 25% at checkout', why: 'Brand mismatch vs usual basket', conf: 22 },
        { name: 'Kids back-to-school bundle', why: 'No kids’ categories in profile', conf: 9 },
        { name: 'Subscription first month — half price', why: 'Already on paid tier — weak incremental', conf: 5 },
      ],
    },
    {
      reasoning: '🧠 <strong>Model reasoning:</strong> Riley abandons carts often and only converts on promo or free shipping. The model favours value aisle and BNPL-style framing before premium beauty — luxury upsells would likely bounce.',
      ranks: [
        { name: 'Value aisle flash — household essentials', why: 'Price-led · clear savings message', conf: 88 },
        { name: 'BNPL 0% — 12 months on electrics', why: 'Reduces sticker shock on big-ticket', conf: 67 },
        { name: 'Clearance apparel — extra 25% at checkout', why: 'Deal seeker profile', conf: 42 },
        { name: 'Express delivery — next-day slot', why: 'Only after basket value clears threshold', conf: 28 },
        { name: 'Premium beauty bundle — gift with purchase', why: 'Premium step — poor fit for tight budget', conf: 14 },
        { name: 'Member exclusive — extra 20% off electrics', why: 'Needs login friction — weaker for guest', conf: 8 },
        { name: 'Subscription first month — half price', why: 'Commitment aversion in segment', conf: 4 },
      ],
    },
    {
      reasoning: '🧠 <strong>Model reasoning:</strong> The Parkers shop weekly for a household of five with recurring grocery and school lists. The model prioritises bulk value and family bundles over single-SKU premium SKUs.',
      ranks: [
        { name: 'Kids back-to-school bundle', why: 'Household + kids categories → top predictor', conf: 95 },
        { name: 'Value aisle flash — household essentials', why: 'Bulk buy pattern · high basket overlap', conf: 72 },
        { name: 'Express delivery — next-day slot', why: 'Slot booking reduces trip stress', conf: 48 },
        { name: 'Member exclusive — extra 20% off electrics', why: 'Weaker — electronics not core for this trip', conf: 19 },
        { name: 'Premium beauty bundle — gift with purchase', why: 'Single-SKU focus vs basket mission', conf: 11 },
        { name: 'BNPL 0% — 12 months on electrics', why: 'Deferred for grocery-heavy shop', conf: 7 },
        { name: 'Clearance apparel — extra 25% at checkout', why: 'Secondary to school list', conf: 3 },
      ],
    },
  ];

  var profilesFSI = [
    {
      reasoning: '🧠 <strong>Model reasoning:</strong> Elena is a private-banking client with investable assets above £750k and regular advisory meetings. The model predicts wealth and structured products over mass-market cards — regulatory fit and relationship depth dominate.',
      ranks: [
        { name: 'Wealth — advisory portfolio review', why: 'Segment + AUM → strongest predicted uptake', conf: 94 },
        { name: 'Credit card — travel rewards', why: 'Premium spend pattern · aligns to lifestyle', conf: 71 },
        { name: 'Home insurance — multi-policy discount', why: 'Cross-hold opportunity from mortgage data', conf: 52 },
        { name: 'Everyday — cashback current account', why: 'Weaker — already on packaged current account', conf: 28 },
        { name: 'Business banking — fee-free 12 months', why: 'Solo profile — no SMB signals', conf: 14 },
        { name: 'Personal loan — 5.9% representative APR', why: 'Low debt appetite in file', conf: 9 },
        { name: 'Junior ISA — £25 top-up bonus', why: 'No dependents flagged in household', conf: 4 },
      ],
    },
    {
      reasoning: '🧠 <strong>Model reasoning:</strong> Chris uses the mobile app weekly for balance checks and has one direct debit — a classic mass-market profile. The model favours everyday cashback and balance-transfer nudges before wealth propositions that would feel mis-targeted.',
      ranks: [
        { name: 'Everyday — cashback current account', why: 'Salary-in pattern · everyday banking fit', conf: 89 },
        { name: 'Balance-transfer card — 0% 24 months', why: 'Revolving balance signal in bureau summary', conf: 68 },
        { name: 'Personal loan — 5.9% representative APR', why: 'Consolidation intent from browse', conf: 41 },
        { name: 'Stocks & Shares ISA — £150 switching bonus', why: 'Investment curiosity but lower priority', conf: 24 },
        { name: 'Wealth — advisory portfolio review', why: 'Wealth threshold not met — poor fit', conf: 11 },
        { name: 'Business banking — fee-free 12 months', why: 'No business account or turnover signals', conf: 6 },
        { name: 'Credit card — travel rewards', why: 'Fee sensitivity vs rewards value', conf: 3 },
      ],
    },
    {
      reasoning: '🧠 <strong>Model reasoning:</strong> Miguel runs a limited company with a business current account and regular card spend on software and travel. The model prioritises SMB banking and expense-friendly cards over retail ISA offers.',
      ranks: [
        { name: 'Business banking — fee-free 12 months', why: 'Ltd co. + BCA activity → top predictor', conf: 93 },
        { name: 'Credit card — travel rewards', why: 'Expense volume · reclaim-friendly categories', conf: 74 },
        { name: 'Personal loan — 5.9% representative APR', why: 'Equipment financing intent from search', conf: 46 },
        { name: 'Everyday — cashback current account', why: 'Secondary — business wallet already primary', conf: 21 },
        { name: 'Wealth — advisory portfolio review', why: 'AUM below private threshold', conf: 12 },
        { name: 'Balance-transfer card — 0% 24 months', why: 'Lower revolving need on business profile', conf: 7 },
        { name: 'Junior ISA — £25 top-up bonus', why: 'Irrelevant to company context', conf: 2 },
      ],
    },
  ];

  var profilesTelco = [
    {
      reasoning: '🧠 <strong>Model reasoning:</strong> Priya burns 40GB+/month with roaming and sports streaming on 5G. The model predicts handset upgrades and unlimited tiers over home fibre upsells — she’s rarely on Wi‑Fi during the day.',
      ranks: [
        { name: '5G Unlimited Plus — roaming & eSIM', why: 'Data volume + roaming events → strongest fit', conf: 94 },
        { name: 'International roaming pass — 30 days', why: 'Frequent EU/US trips in calendar', conf: 76 },
        { name: 'Tablet + 5G data add-on', why: 'Multi-device usage on account', conf: 58 },
        { name: 'Fibre Max 1Gbps — mesh Wi‑Fi included', why: 'Weaker — mobile-first usage pattern', conf: 29 },
        { name: 'Family plan — 4 lines', why: 'Single-line profile', conf: 18 },
        { name: 'Business multi-line — static IP & SD‑WAN trial', why: 'No B2B or VAT signals', conf: 9 },
        { name: 'Pay-as-you-go starter', why: 'Postpaid tenure 4+ years', conf: 4 },
      ],
    },
    {
      reasoning: '🧠 <strong>Model reasoning:</strong> Dan’s household streams 4K on multiple TVs and works from home — fibre speed and Wi‑Fi quality dominate. The model favours gigabit and mesh before mobile handset promos.',
      ranks: [
        { name: 'Fibre Max 1Gbps — mesh Wi‑Fi included', why: 'Usage + speed tests → line saturation signals', conf: 92 },
        { name: 'Home phone + streaming bundle', why: 'Bundle affinity from billing', conf: 68 },
        { name: 'Tablet + 5G data add-on', why: 'Kids’ devices on account', conf: 44 },
        { name: '5G Unlimited Plus — roaming & eSIM', why: 'Secondary — home is primary pain point', conf: 22 },
        { name: 'International roaming pass — 30 days', why: 'Low outbound travel score', conf: 11 },
        { name: 'Business multi-line — static IP & SD‑WAN trial', why: 'Residential service address', conf: 7 },
        { name: 'Pay-as-you-go starter', why: 'Long-standing postpaid customer', conf: 3 },
      ],
    },
    {
      reasoning: '🧠 <strong>Model reasoning:</strong> Renee runs a 12-person office on the operator’s business tariff with rising upload needs. The model prioritises SD‑WAN and multi-line packs over consumer handset offers.',
      ranks: [
        { name: 'Business multi-line — static IP & SD‑WAN trial', why: 'BCA + ticket volume → B2B predictor', conf: 95 },
        { name: '5G Unlimited Plus — roaming & eSIM', why: 'Director lines on same contract', conf: 71 },
        { name: 'International roaming pass — 30 days', why: 'Roaming for client visits', conf: 46 },
        { name: 'Fibre Max 1Gbps — mesh Wi‑Fi included', why: 'Weaker — office on leased line elsewhere', conf: 21 },
        { name: 'Family plan — 4 lines', why: 'Business account, not consumer household', conf: 12 },
        { name: 'Home phone + streaming bundle', why: 'Irrelevant to registered business ID', conf: 6 },
        { name: 'Pay-as-you-go starter', why: 'Established SMB billing', conf: 2 },
      ],
    },
  ];

  var profilesAutomotive = [
    {
      reasoning: '🧠 <strong>Model reasoning:</strong> Hannah is mid-funnel on a family SUV with two dealer visits and a part-exchange valuation saved. The model predicts showroom PCP and stock-led offers before EV-only bundles — she’s not yet on a BEV shortlist.',
      ranks: [
        { name: 'New hybrid SUV — PCP launch event', why: 'Config + test-drive signals → strongest close probability', conf: 93 },
        { name: 'Approved used — warranty extension', why: 'Cross-shopped CPO in same session', conf: 72 },
        { name: 'Part-exchange boost — this month', why: 'Valuation saved · trade-in intent', conf: 58 },
        { name: 'Service plan+ — 3 years / 36k miles', why: 'Post-handover attach opportunity', conf: 41 },
        { name: 'EV bundle — wallbox + off-peak tariff', why: 'Weaker — no charging research yet', conf: 22 },
        { name: 'Winter tyre + alignment pack', why: 'Seasonal · secondary to purchase', conf: 11 },
        { name: 'Business contract hire — 18 months', why: 'Personal PCP path · no fleet ID', conf: 5 },
      ],
    },
    {
      reasoning: '🧠 <strong>Model reasoning:</strong> Omar has browsed range calculators and wallbox installers — clear electrification intent. The model prioritises EV bundles and charger logistics before ICE showroom stock.',
      ranks: [
        { name: 'EV bundle — wallbox + off-peak tariff', why: 'Charging + tariff pages → top predictor', conf: 94 },
        { name: 'EV test drive — priority slot', why: 'High intent · low friction next step', conf: 77 },
        { name: 'Home charger install — fast track', why: 'Installer funnel started from app', conf: 52 },
        { name: 'New hybrid SUV — PCP launch event', why: 'Fallback if BEV stock waitlisted', conf: 28 },
        { name: 'Service plan+ — 3 years / 36k miles', why: 'Post-purchase · lower on acquisition path', conf: 14 },
        { name: 'Approved used — warranty extension', why: 'New-car preference in profile', conf: 8 },
        { name: 'Part-exchange boost — this month', why: 'Lease return not ICE trade-in', conf: 4 },
      ],
    },
    {
      reasoning: '🧠 <strong>Model reasoning:</strong> Claire manages 22 registered vehicles and an open service RFP. The model prioritises fleet service plans and contract terms over retail weekend PCP creatives.',
      ranks: [
        { name: 'Fleet care — multi-vehicle service plan', why: 'Fleet ID + mileage pattern → B2B predictor', conf: 95 },
        { name: 'Business contract hire — 18 months', why: 'Replacement cycle in procurement calendar', conf: 73 },
        { name: 'Telematics safety pack — fleet', why: 'Duty-of-care keyword in enquiry', conf: 46 },
        { name: 'Service plan+ — 3 years / 36k miles', why: 'Applicable to mixed car/van parc', conf: 24 },
        { name: 'New hybrid SUV — PCP launch event', why: 'Consumer creative — weak for fleet gate', conf: 12 },
        { name: 'EV bundle — wallbox + off-peak tariff', why: 'Depot charging already contracted', conf: 7 },
        { name: 'Part-exchange boost — this month', why: 'Not a retail part-ex journey', conf: 3 },
      ],
    },
  ];

  var profilesHealthcare = [
    {
      reasoning: '🧠 <strong>Model reasoning:</strong> Morgan books video visits for minor illness and manages two chronic meds through the app. The model predicts virtual primary and pharmacy bundles before specialty intake — no cardiology signals in her history.',
      ranks: [
        { name: 'Virtual primary — same-day video (£0 copay)', why: 'Digital-first usage + refill pattern → strongest fit', conf: 93 },
        { name: 'Urgent care video — under 30 min wait', why: 'After-hours symptom checker path', conf: 74 },
        { name: 'Pharmacy + wellness — 90-day + coaching', why: 'Adherence programme eligibility', conf: 58 },
        { name: 'Chronic care coach — diabetes programme', why: 'Condition in file · secondary on this journey', conf: 41 },
        { name: 'Mental health — therapist match', why: 'Weaker — no BH screen this session', conf: 22 },
        { name: 'Specialty expedited — cardiology intake', why: 'No cardiac risk flags in profile', conf: 11 },
        { name: 'Employer screening — biometric kit', why: 'Individual plan · no employer ID', conf: 5 },
      ],
    },
    {
      reasoning: '🧠 <strong>Model reasoning:</strong> James searched chest discomfort and completed a cardiac risk screener — high urgency for structured specialty access. The model prioritises expedited cardiology over retail pharmacy promos.',
      ranks: [
        { name: 'Specialty expedited — cardiology intake', why: 'Screener + keyword intent → top predictor', conf: 95 },
        { name: 'Cardiac imaging — fast booking', why: 'Referral pathway started in same session', conf: 76 },
        { name: 'Virtual primary — same-day video (£0 copay)', why: 'Triage step — not replacement for specialty', conf: 42 },
        { name: 'Pharmacy + wellness — 90-day + coaching', why: 'Post-diagnosis opportunity · lower on acute path', conf: 28 },
        { name: 'Chronic care coach — diabetes programme', why: 'Different condition cluster', conf: 14 },
        { name: 'Employer screening — biometric kit', why: 'No workforce benefits match', conf: 8 },
        { name: 'Mental health — therapist match', why: 'Deferred vs somatic chief complaint', conf: 4 },
      ],
    },
    {
      reasoning: '🧠 <strong>Model reasoning:</strong> Taylor administers an employer plan with open enrolment and onsite screening targets. The model prioritises employer wellness and biometric programmes over individual virtual retail offers.',
      ranks: [
        { name: 'Employer screening — biometric kit', why: 'HR admin + group ID → B2B2C predictor', conf: 94 },
        { name: 'Wellness challenge — team leaderboard', why: 'Open enrolment campaign in calendar', conf: 71 },
        { name: 'Virtual primary — same-day video (£0 copay)', why: 'Employee benefit · secondary to population programme', conf: 38 },
        { name: 'Pharmacy + wellness — 90-day + coaching', why: 'Formulary education slot in webinar', conf: 24 },
        { name: 'Specialty expedited — cardiology intake', why: 'Population health · not individual acute path', conf: 12 },
        { name: 'Chronic care coach — diabetes programme', why: 'Segmented later in nurture', conf: 7 },
        { name: 'Urgent care video — under 30 min wait', why: 'B2B gate · not employee retail journey', conf: 3 },
      ],
    },
  ];

  var profiles = profilesMedia;

  /** Selected persona index (0–2) for AI panel; sort applies to current profile only. */
  var aiSelectedProfileIdx = 0;
  /** When true, rows are ordered by conf descending; when false, model narrative order. */
  var aiRankSortByScore = false;

  // ── OFFER PRIORITY ────────────────────────────────────────────────────────
  function buildPriorityList() {
    var list = document.getElementById('dceViz-priority-list');
    if (!list) return;
    list.innerHTML = '';
    offers.forEach(function (o) {
      var el = document.createElement('div');
      el.className = 'offer-row';
      el.dataset.offerId = o.id;
      el.innerHTML =
        '<div class="offer-score-badge" id="dceViz-badge-' + o.id + '">0</div>' +
        '<div style="flex:1; min-width:0;">' +
        '<div class="offer-name">' + o.name + '</div>' +
        '<div class="offer-sub">' + o.sub + '</div>' +
        '<div class="priority-bar-wrap">' +
        '<div class="priority-bar-track">' +
        '<div class="priority-bar-fill" id="dceViz-bar-' + o.id + '" style="width:0%"></div>' +
        '</div></div></div>' +
        '<div class="crown">👑</div>';
      list.appendChild(el);
    });
  }

  function syncPrioritySliderLabels() {
    var n1 = document.getElementById('dceViz-s1-name');
    var n2 = document.getElementById('dceViz-s2-name');
    var n3 = document.getElementById('dceViz-s3-name');
    if (n1 && offers[0]) n1.textContent = offers[0].name;
    if (n2 && offers[1]) n2.textContent = offers[1].name;
    if (n3 && offers[2]) n3.textContent = offers[2].name;
  }

  function updatePriority() {
    var vals = offers.map(function (o) {
      return { name: o.name, sub: o.sub, id: o.id, score: parseInt(document.getElementById('dceViz-' + o.id).value, 10) };
    });
    document.getElementById('dceViz-s1-val').textContent = vals[0].score;
    document.getElementById('dceViz-s2-val').textContent = vals[1].score;
    document.getElementById('dceViz-s3-val').textContent = vals[2].score;

    var sorted = vals.slice().sort(function (a, b) { return b.score - a.score; });
    var maxScore = Math.max.apply(null, vals.map(function (v) { return v.score; }));
    var winner = sorted[0];
    var list = document.getElementById('dceViz-priority-list');

    var nodes = {};
    offers.forEach(function (o) {
      var el = list.querySelector('[data-offer-id="' + o.id + '"]');
      nodes[o.id] = el;
      el._firstTop = el.getBoundingClientRect().top;
    });

    vals.forEach(function (o) {
      document.getElementById('dceViz-badge-' + o.id).textContent = o.score;
      document.getElementById('dceViz-bar-' + o.id).style.width = maxScore > 0 ? (o.score / maxScore) * 100 + '%' : '0%';
    });
    offers.forEach(function (o) {
      nodes[o.id].classList.toggle('winner', o.id === winner.id);
    });

    sorted.forEach(function (o) {
      list.appendChild(nodes[o.id]);
    });

    sorted.forEach(function (o) {
      var el = nodes[o.id];
      var lastTop = el.getBoundingClientRect().top;
      var delta = el._firstTop - lastTop;
      if (Math.abs(delta) > 1) {
        el.style.transform = 'translateY(' + delta + 'px)';
        el.style.transition = 'none';
        el.getBoundingClientRect();
        el.style.transition = 'transform 0.38s cubic-bezier(0.34, 1.28, 0.64, 1)';
        el.style.transform = 'translateY(0)';
      }
    });

    var wl = document.getElementById('dceViz-winner-label');
    if (wl) {
      var nm = winner.name;
      var sp = nm.indexOf(' ');
      wl.textContent = sp >= 0 ? nm.slice(sp + 1).trim() : nm;
    }
  }

  // ── RANKING FORMULA ───────────────────────────────────────────────────────
  var currentInterest = 'drama';
  var currentPropensity = 'medium';
  var currentCampaign = 'none';

  function getHoursSlider() {
    var k = getIndustry();
    if (k === 'travel') return document.getElementById('dceViz-hours-slider-travel');
    if (k === 'retail') return document.getElementById('dceViz-hours-slider-retail');
    if (k === 'fsi') return document.getElementById('dceViz-hours-slider-fsi');
    if (k === 'telco') return document.getElementById('dceViz-hours-slider-telco');
    if (k === 'automotive') return document.getElementById('dceViz-hours-slider-automotive');
    if (k === 'healthcare') return document.getElementById('dceViz-hours-slider-healthcare');
    return document.getElementById('dceViz-hours-slider');
  }

  function getHoursValEl() {
    var k = getIndustry();
    if (k === 'travel') return document.getElementById('dceViz-hours-val-travel');
    if (k === 'retail') return document.getElementById('dceViz-hours-val-retail');
    if (k === 'fsi') return document.getElementById('dceViz-hours-val-fsi');
    if (k === 'telco') return document.getElementById('dceViz-hours-val-telco');
    if (k === 'automotive') return document.getElementById('dceViz-hours-val-automotive');
    if (k === 'healthcare') return document.getElementById('dceViz-hours-val-healthcare');
    return document.getElementById('dceViz-hours-val');
  }

  function setInterest(interest, btn) {
    currentInterest = interest;
    if (btn && btn.closest) {
      btn.closest('.toggle-pill').querySelectorAll('.toggle-opt').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
    }
    var ruleInterest = document.getElementById('dceViz-rule-interest');
    if (ruleInterest) ruleInterest.classList.add('active-rule');
    updateFormula();
  }

  function setPropensity(level, btn) {
    currentPropensity = level;
    if (btn && btn.closest) {
      btn.closest('.toggle-pill').querySelectorAll('.toggle-opt').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
    }
    updateFormula();
  }

  function setCampaign(group, btn) {
    currentCampaign = group;
    if (btn && btn.closest) {
      btn.closest('.toggle-pill').querySelectorAll('.toggle-opt').forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
    }
    updateFormula();
  }

  function computeFormulaScore(offer, interest, hours, propensity, campaign) {
    var score = offer.baseScore;
    var urgency = hours <= offer.expiresIn;
    var match = offer.category === interest;
    var highPropensity = propensity === 'high';
    var campaignMatch = campaign !== 'none' && offer.category === campaign;

    if (urgency) score *= 2;
    if (match) score += 30;
    if (highPropensity) score = Math.round(score * 1.5);
    if (campaignMatch) score += 50;

    return { score: score, urgency: urgency, match: match, highPropensity: highPropensity, campaignMatch: campaignMatch };
  }

  function buildFormulaList() {
    var container = document.getElementById('dceViz-formula-offers');
    if (!container) return;
    container.innerHTML = '';
    formulaOffers.forEach(function (o, i) {
      var el = document.createElement('div');
      el.className = 'formula-input-row';
      el.dataset.formulaId = o.category;
      el.innerHTML =
        '<div class="formula-rank-num" id="dceViz-frank-' + o.category + '">' + (i + 1) + '</div>' +
        '<div class="formula-input-label" style="flex:1;">' +
        '<span class="formula-trophy-' + o.category + '"></span>' +
        '<span style="color:white; font-weight:500;">' + o.name + '</span>' +
        '<div class="formula-sub-' + o.category + '" style="font-size:12px; color:rgba(255,255,255,0.55); margin-top:3px; line-height:1.5;"></div>' +
        '</div>' +
        '<div class="formula-input-value" id="dceViz-fscore-' + o.category + '" style="color:rgba(255,255,255,0.9); font-size:18px; font-weight:700;">—</div>';
      container.appendChild(el);
    });
  }

  function updateFormula() {
    var hs = getHoursSlider();
    if (!hs) return;
    var hours = parseInt(hs.value, 10);
    var hve = getHoursValEl();
    if (hve) hve.textContent = hours + 'h remaining';

    var urgencyActive = formulaOffers.some(function (o) { return hours <= o.expiresIn; });

    var urgencyFlag = document.getElementById('dceViz-urgency-flag');
    var urgencyFlagT = document.getElementById('dceViz-urgency-flag-travel');
    if (urgencyFlag) {
      urgencyFlag.style.display = getIndustry() === 'media' && urgencyActive ? 'flex' : 'none';
      if (getIndustry() === 'media' && urgencyActive) {
        var boostedNames = formulaOffers.filter(function (o) { return hours <= o.expiresIn; }).map(function (o) { return o.name.split('—')[0].trim(); });
        urgencyFlag.innerHTML = '⚡ Urgency ×2 active for: <strong style="margin-left:4px;">' + boostedNames.join(', ') + '</strong> — ranking order has changed.';
      }
    }
    if (urgencyFlagT) {
      urgencyFlagT.style.display = getIndustry() === 'travel' && urgencyActive ? 'flex' : 'none';
      if (getIndustry() === 'travel' && urgencyActive) {
        var boostedT = formulaOffers.filter(function (o) { return hours <= o.expiresIn; }).map(function (o) { return o.name.split('—')[0].trim(); });
        urgencyFlagT.innerHTML = '⚡ Urgency ×2 active for: <strong style="margin-left:4px;">' + boostedT.join(', ') + '</strong> — ranking order has changed.';
      }
    }
    var urgencyFlagR = document.getElementById('dceViz-urgency-flag-retail');
    if (urgencyFlagR) {
      urgencyFlagR.style.display = getIndustry() === 'retail' && urgencyActive ? 'flex' : 'none';
      if (getIndustry() === 'retail' && urgencyActive) {
        var boostedR = formulaOffers.filter(function (o) { return hours <= o.expiresIn; }).map(function (o) { return o.name.split('—')[0].trim(); });
        urgencyFlagR.innerHTML = '⚡ Urgency ×2 active for: <strong style="margin-left:4px;">' + boostedR.join(', ') + '</strong> — ranking order has changed.';
      }
    }
    var urgencyFlagFsi = document.getElementById('dceViz-urgency-flag-fsi');
    if (urgencyFlagFsi) {
      urgencyFlagFsi.style.display = getIndustry() === 'fsi' && urgencyActive ? 'flex' : 'none';
      if (getIndustry() === 'fsi' && urgencyActive) {
        var boostedF = formulaOffers.filter(function (o) { return hours <= o.expiresIn; }).map(function (o) { return o.name.split('—')[0].trim(); });
        urgencyFlagFsi.innerHTML = '⚡ Urgency ×2 active for: <strong style="margin-left:4px;">' + boostedF.join(', ') + '</strong> — ranking order has changed.';
      }
    }
    var urgencyFlagTelco = document.getElementById('dceViz-urgency-flag-telco');
    if (urgencyFlagTelco) {
      urgencyFlagTelco.style.display = getIndustry() === 'telco' && urgencyActive ? 'flex' : 'none';
      if (getIndustry() === 'telco' && urgencyActive) {
        var boostedTel = formulaOffers.filter(function (o) { return hours <= o.expiresIn; }).map(function (o) { return o.name.split('—')[0].trim(); });
        urgencyFlagTelco.innerHTML = '⚡ Urgency ×2 active for: <strong style="margin-left:4px;">' + boostedTel.join(', ') + '</strong> — ranking order has changed.';
      }
    }
    var urgencyFlagAuto = document.getElementById('dceViz-urgency-flag-automotive');
    if (urgencyFlagAuto) {
      urgencyFlagAuto.style.display = getIndustry() === 'automotive' && urgencyActive ? 'flex' : 'none';
      if (getIndustry() === 'automotive' && urgencyActive) {
        var boostedA = formulaOffers.filter(function (o) { return hours <= o.expiresIn; }).map(function (o) { return o.name.split('—')[0].trim(); });
        urgencyFlagAuto.innerHTML = '⚡ Urgency ×2 active for: <strong style="margin-left:4px;">' + boostedA.join(', ') + '</strong> — ranking order has changed.';
      }
    }
    var urgencyFlagHealth = document.getElementById('dceViz-urgency-flag-healthcare');
    if (urgencyFlagHealth) {
      urgencyFlagHealth.style.display = getIndustry() === 'healthcare' && urgencyActive ? 'flex' : 'none';
      if (getIndustry() === 'healthcare' && urgencyActive) {
        var boostedH = formulaOffers.filter(function (o) { return hours <= o.expiresIn; }).map(function (o) { return o.name.split('—')[0].trim(); });
        urgencyFlagHealth.innerHTML = '⚡ Urgency ×2 active for: <strong style="margin-left:4px;">' + boostedH.join(', ') + '</strong> — ranking order has changed.';
      }
    }

    var crossoverHint = document.getElementById('dceViz-crossover-hint');
    var crossoverHintT = document.getElementById('dceViz-crossover-hint-travel');
    var crossoverHintR = document.getElementById('dceViz-crossover-hint-retail');
    var crossoverHintFsi = document.getElementById('dceViz-crossover-hint-fsi');
    var crossoverHintTelco = document.getElementById('dceViz-crossover-hint-telco');
    var crossoverHintAuto = document.getElementById('dceViz-crossover-hint-automotive');
    var crossoverHintHealth = document.getElementById('dceViz-crossover-hint-healthcare');
    if (crossoverHint) crossoverHint.style.display = getIndustry() === 'media' && !urgencyActive ? 'block' : 'none';
    if (crossoverHintT) crossoverHintT.style.display = getIndustry() === 'travel' && !urgencyActive ? 'block' : 'none';
    if (crossoverHintR) crossoverHintR.style.display = getIndustry() === 'retail' && !urgencyActive ? 'block' : 'none';
    if (crossoverHintFsi) crossoverHintFsi.style.display = getIndustry() === 'fsi' && !urgencyActive ? 'block' : 'none';
    if (crossoverHintTelco) crossoverHintTelco.style.display = getIndustry() === 'telco' && !urgencyActive ? 'block' : 'none';
    if (crossoverHintAuto) crossoverHintAuto.style.display = getIndustry() === 'automotive' && !urgencyActive ? 'block' : 'none';
    if (crossoverHintHealth) crossoverHintHealth.style.display = getIndustry() === 'healthcare' && !urgencyActive ? 'block' : 'none';

    var ruleUrgency = document.getElementById('dceViz-rule-urgency');
    if (ruleUrgency) {
      ruleUrgency.classList.toggle('active-rule', urgencyActive);
      var badge = document.getElementById('dceViz-urgency-badge');
      if (badge) badge.style.opacity = urgencyActive ? '1' : '0.3';
    }

    var interestAttrLabel = document.getElementById('dceViz-interest-attr-label');
    if (interestAttrLabel) {
      var indAttr = getIndustry();
      if (indAttr === 'travel') interestAttrLabel.textContent = 'tripProfile';
      else if (indAttr === 'retail') interestAttrLabel.textContent = 'shopperSegment';
      else if (indAttr === 'fsi') interestAttrLabel.textContent = 'customerIntent';
      else if (indAttr === 'telco') interestAttrLabel.textContent = 'subscriberSegment';
      else if (indAttr === 'automotive') interestAttrLabel.textContent = 'buyerSegment';
      else if (indAttr === 'healthcare') interestAttrLabel.textContent = 'patientSegment';
      else interestAttrLabel.textContent = 'preferredGenre';
    }

    var interestDisplay = document.getElementById('dceViz-interest-val-display');
    if (interestDisplay) {
      if (getIndustry() === 'travel') {
        interestDisplay.textContent = currentInterest + ' (tripProfile → item.tripSegment)';
      } else if (getIndustry() === 'retail') {
        interestDisplay.textContent = currentInterest + ' (shopperSegment → item.merchSegment)';
      } else if (getIndustry() === 'fsi') {
        interestDisplay.textContent = currentInterest + ' (customerIntent → product.line)';
      } else if (getIndustry() === 'telco') {
        interestDisplay.textContent = currentInterest + ' (subscriberSegment → offer.line)';
      } else if (getIndustry() === 'automotive') {
        interestDisplay.textContent = currentInterest + ' (buyerSegment → offer.program)';
      } else if (getIndustry() === 'healthcare') {
        interestDisplay.textContent = currentInterest + ' (patientSegment → offer.carePath)';
      } else {
        interestDisplay.textContent = currentInterest + ' (preferredGenre → item.genre)';
      }
    }

    var highPropensity = currentPropensity === 'high';
    var rulePropensity = document.getElementById('dceViz-rule-propensity');
    if (rulePropensity) {
      rulePropensity.classList.toggle('active-rule', highPropensity);
      var pb = document.getElementById('dceViz-propensity-badge');
      if (pb) pb.style.opacity = highPropensity ? '1' : '0.3';
    }

    var campaignActive = currentCampaign !== 'none';
    var ruleCampaign = document.getElementById('dceViz-rule-campaign');
    if (ruleCampaign) {
      ruleCampaign.classList.toggle('active-rule', campaignActive);
      var cb = document.getElementById('dceViz-campaign-badge');
      if (cb) cb.style.opacity = campaignActive ? '1' : '0.3';
      var display = document.getElementById('dceViz-campaign-val-display');
      if (display) display.textContent = campaignActive ? currentCampaign : 'strategic';
    }

    var scored = formulaOffers.map(function (o) {
      var r = computeFormulaScore(o, currentInterest, hours, currentPropensity, currentCampaign);
      return {
        name: o.name, category: o.category, baseScore: o.baseScore, expiresIn: o.expiresIn,
        score: r.score, urgency: r.urgency, match: r.match, highPropensity: r.highPropensity, campaignMatch: r.campaignMatch
      };
    }).sort(function (a, b) { return b.score - a.score; });

    var winner = scored[0];

    var scoreEl = document.getElementById('dceViz-formula-score');
    if (scoreEl) scoreEl.textContent = winner.score;

    var expr = 'baseScore';
    if (winner.urgency) expr += ' × 2';
    if (winner.match) expr += ' + 30';
    if (winner.highPropensity) expr += ' × 1.5';
    if (winner.campaignMatch) expr += ' + 50';
    var exprEl = document.getElementById('dceViz-formula-expr-text');
    if (exprEl) exprEl.textContent = expr + ' = ' + winner.score;

    var winnerEl = document.getElementById('dceViz-formula-winner');
    if (winnerEl) winnerEl.textContent = winner.name;

    var indForm = getIndustry();
    var matchLabel = 'genre(+30)';
    if (indForm === 'travel') matchLabel = 'trip(+30)';
    if (indForm === 'retail') matchLabel = 'segment(+30)';
    if (indForm === 'fsi') matchLabel = 'intent(+30)';
    if (indForm === 'telco') matchLabel = 'line(+30)';
    if (indForm === 'automotive') matchLabel = 'program(+30)';
    if (indForm === 'healthcare') matchLabel = 'path(+30)';
    var breakdown = 'base(' + winner.baseScore + ')';
    if (winner.urgency) breakdown += ' × urgency(×2)';
    if (winner.match) breakdown += ' + ' + matchLabel;
    if (winner.highPropensity) breakdown += ' × propensity(×1.5)';
    if (winner.campaignMatch) breakdown += ' + campaign(+50)';
    breakdown += ' = ' + winner.score;
    var bdEl = document.getElementById('dceViz-formula-breakdown');
    if (bdEl) bdEl.textContent = breakdown;

    var container = document.getElementById('dceViz-formula-offers');
    var nodes = {};
    formulaOffers.forEach(function (o) {
      var el = container.querySelector('[data-formula-id="' + o.category + '"]');
      nodes[o.category] = el;
      el._firstTop = el.getBoundingClientRect().top;
    });

    scored.forEach(function (o, i) {
      var isWinner = i === 0;
      var el = nodes[o.category];
      el.classList.toggle('winner-row', isWinner);
      var rankNum = document.getElementById('dceViz-frank-' + o.category);
      if (rankNum) rankNum.textContent = i + 1;
      var trophy = el.querySelector('.formula-trophy-' + o.category);
      if (trophy) trophy.textContent = isWinner ? '🏆 ' : '';
      var sub = el.querySelector('.formula-sub-' + o.category);
      if (sub) {
        var tripOrGenre = '🎯 +30 genre';
        if (getIndustry() === 'travel') tripOrGenre = '🎯 +30 trip match';
        if (getIndustry() === 'retail') tripOrGenre = '🎯 +30 segment match';
        if (getIndustry() === 'fsi') tripOrGenre = '🎯 +30 intent match';
        if (getIndustry() === 'telco') tripOrGenre = '🎯 +30 line match';
        if (getIndustry() === 'automotive') tripOrGenre = '🎯 +30 program match';
        if (getIndustry() === 'healthcare') tripOrGenre = '🎯 +30 path match';
        sub.innerHTML = (o.urgency ? '<span style="color:#f5a623;font-weight:600;">⚡ ×2 urgency</span> · ' : '<span style="color:rgba(255,255,255,0.35);">cut-off ' + o.expiresIn + 'h</span> · ') +
          (o.match ? '<span style="color:#5ecf90;font-weight:600;">' + tripOrGenre + '</span> · ' : '') +
          (o.highPropensity ? '<span style="color:#c4a3f0;font-weight:600;">🧠 ×1.5 propensity</span> · ' : '') +
          (o.campaignMatch ? '<span style="color:#f87171;font-weight:600;">🚀 +50 campaign</span> · ' : '') +
          'base ' + o.baseScore + ' → <strong style="color:white;">' + o.score + '</strong>';
      }
      var scoreSpan = document.getElementById('dceViz-fscore-' + o.category);
      if (scoreSpan) scoreSpan.textContent = o.score;
    });

    scored.forEach(function (o) {
      container.appendChild(nodes[o.category]);
    });

    scored.forEach(function (o) {
      var el = nodes[o.category];
      var lastTop = el.getBoundingClientRect().top;
      var delta = el._firstTop - lastTop;
      if (Math.abs(delta) > 1) {
        el.style.transform = 'translateY(' + delta + 'px)';
        el.style.transition = 'none';
        el.getBoundingClientRect();
        el.style.transition = 'transform 0.38s cubic-bezier(0.34, 1.28, 0.64, 1)';
        el.style.transform = 'translateY(0)';
      }
    });
  }

  // ── AI MODELS ─────────────────────────────────────────────────────────────
  function selectProfile(idx, el) {
    var root = document.getElementById('dceVizRoot');
    var ind = getIndustry();
    root.querySelectorAll('.profile-card[data-dce-profile-industry="' + ind + '"]').forEach(function (c) { c.classList.remove('selected'); });
    el.classList.add('selected');
    aiSelectedProfileIdx = idx;
    var p = profiles[idx];
    document.getElementById('dceViz-ai-reasoning').innerHTML = p.reasoning;
    renderAiRankPanel();
  }

  function updateAiSortButtonLabel() {
    var btn = document.getElementById('dceViz-ai-sort-btn');
    if (!btn) return;
    btn.textContent = aiRankSortByScore ? 'Model rank order' : 'Sort by score ↓';
    btn.setAttribute('aria-pressed', aiRankSortByScore ? 'true' : 'false');
  }

  /**
   * Renders only this profile's ranked offers (fixes stray 0% rows from the old union of all personas).
   * Optional sort: highest predicted conversion first.
   */
  function renderAiRankPanel() {
    var container = document.getElementById('dceViz-ai-ranks');
    if (!container) return;
    var p = profiles[aiSelectedProfileIdx];
    if (!p || !Array.isArray(p.ranks)) return;

    var ranks = p.ranks.map(function (r) {
      return { name: r.name, why: r.why, conf: r.conf };
    });
    if (aiRankSortByScore) {
      ranks.sort(function (a, b) { return b.conf - a.conf; });
    }

    container.innerHTML = '';
    ranks.forEach(function (r, i) {
      var row = document.createElement('div');
      row.className = 'ai-offer-row' + (i === 0 ? ' top' : '');
      row.style.cssText = 'flex-direction:column; align-items:stretch; gap:6px; padding:10px 14px;';

      var topRow = document.createElement('div');
      topRow.style.cssText = 'display:flex; align-items:center; gap:10px;';

      var rankEl = document.createElement('div');
      rankEl.className = 'ai-rank';
      rankEl.textContent = String(i + 1);

      var nameEl = document.createElement('div');
      nameEl.className = 'ai-offer-name';
      nameEl.style.flex = '1';
      nameEl.textContent = r.name;

      var confWrap = document.createElement('div');
      confWrap.className = 'ai-confidence';
      var bar = document.createElement('div');
      bar.className = 'conf-bar';
      var fill = document.createElement('div');
      fill.className = 'conf-fill';
      fill.style.width = Math.max(0, Math.min(100, Number(r.conf) || 0)) + '%';
      bar.appendChild(fill);
      var pct = document.createElement('span');
      pct.style.cssText = 'min-width:36px; text-align:right;';
      pct.textContent = (Number(r.conf) || 0) + '%';
      confWrap.appendChild(bar);
      confWrap.appendChild(pct);

      topRow.appendChild(rankEl);
      topRow.appendChild(nameEl);
      topRow.appendChild(confWrap);

      var whyEl = document.createElement('div');
      whyEl.style.cssText = 'font-size:11px; padding-left:34px; font-style:italic;';
      whyEl.textContent = r.why;
      whyEl.style.color = i === 0 ? '#1a7a4a' : '#9a948e';

      row.appendChild(topRow);
      row.appendChild(whyEl);
      container.appendChild(row);
    });
  }

  // ── INDUSTRY SWITCH ───────────────────────────────────────────────────────
  function setIndustry(key, persist) {
    if (key !== 'travel' && key !== 'media' && key !== 'retail' && key !== 'fsi' && key !== 'telco' && key !== 'automotive' && key !== 'healthcare') key = 'media';

    var prevIndustry = document.body.getAttribute('data-dce-industry') || 'media';
    if (prevIndustry !== 'travel' && prevIndustry !== 'media' && prevIndustry !== 'retail' && prevIndustry !== 'fsi' && prevIndustry !== 'telco' && prevIndustry !== 'automotive' && prevIndustry !== 'healthcare') prevIndustry = 'media';

    var hsm = document.getElementById('dceViz-hours-slider');
    var hst = document.getElementById('dceViz-hours-slider-travel');
    var hsr = document.getElementById('dceViz-hours-slider-retail');
    var hsf = document.getElementById('dceViz-hours-slider-fsi');
    var hstel = document.getElementById('dceViz-hours-slider-telco');
    var hsauto = document.getElementById('dceViz-hours-slider-automotive');
    var hshealth = document.getElementById('dceViz-hours-slider-healthcare');
    var v = 48;
    if (prevIndustry === 'media' && hsm) v = parseInt(hsm.value, 10) || 48;
    else if (prevIndustry === 'travel' && hst) v = parseInt(hst.value, 10) || 48;
    else if (prevIndustry === 'retail' && hsr) v = parseInt(hsr.value, 10) || 48;
    else if (prevIndustry === 'fsi' && hsf) v = parseInt(hsf.value, 10) || 48;
    else if (prevIndustry === 'telco' && hstel) v = parseInt(hstel.value, 10) || 48;
    else if (prevIndustry === 'automotive' && hsauto) v = parseInt(hsauto.value, 10) || 48;
    else if (prevIndustry === 'healthcare' && hshealth) v = parseInt(hshealth.value, 10) || 48;

    document.body.setAttribute('data-dce-industry', key);
    if (persist) {
      try { localStorage.setItem(LS_INDUSTRY, key); } catch (e) {}
    }

    var pgLbl = document.getElementById('dce-pg-industry-label');
    if (pgLbl) pgLbl.textContent = INDUSTRY_LABEL_UI[key] || INDUSTRY_LABEL_UI.media;
    document.querySelectorAll('.dce-pg-dropdown-item').forEach(function (b) {
      var on = b.getAttribute('data-dce-industry') === key;
      b.classList.toggle('dce-pg-dropdown-item--active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    if (key === 'travel') {
      offers = PRIORITY_TRAVEL.slice();
      formulaOffers = FORMULA_TRAVEL.slice();
      profiles = profilesTravel;
      currentInterest = 'business';
    } else if (key === 'retail') {
      offers = PRIORITY_RETAIL.slice();
      formulaOffers = FORMULA_RETAIL.slice();
      profiles = profilesRetail;
      currentInterest = 'member';
    } else if (key === 'fsi') {
      offers = PRIORITY_FSI.slice();
      formulaOffers = FORMULA_FSI.slice();
      profiles = profilesFSI;
      currentInterest = 'everyday';
    } else if (key === 'telco') {
      offers = PRIORITY_TELCO.slice();
      formulaOffers = FORMULA_TELCO.slice();
      profiles = profilesTelco;
      currentInterest = 'mobile';
    } else if (key === 'automotive') {
      offers = PRIORITY_AUTOMOTIVE.slice();
      formulaOffers = FORMULA_AUTOMOTIVE.slice();
      profiles = profilesAutomotive;
      currentInterest = 'showroom';
    } else if (key === 'healthcare') {
      offers = PRIORITY_HEALTHCARE.slice();
      formulaOffers = FORMULA_HEALTHCARE.slice();
      profiles = profilesHealthcare;
      currentInterest = 'virtual';
    } else {
      offers = PRIORITY_MEDIA.slice();
      formulaOffers = FORMULA_MEDIA.slice();
      profiles = profilesMedia;
      currentInterest = 'drama';
    }
    currentCampaign = 'none';
    currentPropensity = 'medium';

    syncPrioritySliderLabels();
    buildPriorityList();
    updatePriority();

    buildFormulaList();
    if (hsm) hsm.value = String(v);
    if (hst) hst.value = String(v);
    if (hsr) hsr.value = String(v);
    if (hsf) hsf.value = String(v);
    if (hstel) hstel.value = String(v);
    if (hsauto) hsauto.value = String(v);
    if (hshealth) hshealth.value = String(v);

    aiSelectedProfileIdx = 0;
    aiRankSortByScore = false;
    updateAiSortButtonLabel();
    var ar = document.getElementById('dceViz-ai-reasoning');
    if (ar) ar.innerHTML = profiles[0].reasoning;
    renderAiRankPanel();

    var simWrap = document.querySelector('#dceViz-panel-formula .dce-viz-sim-grid[data-dce-industry-show="' + key + '"]');
    if (simWrap) {
      var pills = simWrap.querySelectorAll('.toggle-pill');
      if (pills[0]) {
        pills[0].querySelectorAll('.toggle-opt').forEach(function (b, i) { b.classList.toggle('active', i === 0); });
      }
      if (pills[1]) {
        pills[1].querySelectorAll('.toggle-opt').forEach(function (b, i) { b.classList.toggle('active', i === 1); });
      }
      if (pills[2]) {
        pills[2].querySelectorAll('.toggle-opt').forEach(function (b, i) { b.classList.toggle('active', i === 0); });
      }
    }

    document.querySelectorAll('.profile-card[data-dce-profile-industry="' + key + '"]').forEach(function (c, i) { c.classList.toggle('selected', i === 0); });

    updateFormula();

    if (typeof window.dceVizApplySchemaIndustry === 'function') window.dceVizApplySchemaIndustry();
    applyCollectionsIndustry();
    applyRulesIndustry();
    applyJourneyIndustry();
  }

  function initIndustry() {
    var key = 'media';
    try {
      var s = localStorage.getItem(LS_INDUSTRY);
      if (s === 'travel' || s === 'media' || s === 'retail' || s === 'fsi' || s === 'telco' || s === 'automotive' || s === 'healthcare') key = s;
    } catch (e) {}
    setIndustry(key, false);
    var activeId = getActivePanelId();
    if (activeId && isCustomerStepOn(activeId)) updatePlaygroundChrome(activeId);
    else {
      var ord = getVisibleOrder();
      if (ord.length) showPanel(ord[0]);
    }
  }

  // ── INIT ───────────────────────────────────────────────────────────────────
  try {
    bindOfferSchema();
    bindCollectionsPills();
    bindRulesPanel();
    bindJourneyPanel();
    initIndustry();
    bindChannelExplainer();
  } catch (err) {
    console.error('[decisioning-visualizer] init', err);
  }

  var sortBtn = document.getElementById('dceViz-ai-sort-btn');
  if (sortBtn) {
    sortBtn.addEventListener('click', function () {
      aiRankSortByScore = !aiRankSortByScore;
      updateAiSortButtonLabel();
      renderAiRankPanel();
    });
  }

  window.dceVizUpdatePriority = updatePriority;
  window.dceVizUpdateFormula = updateFormula;
  window.dceVizSetInterest = setInterest;
  window.dceVizSetPropensity = setPropensity;
  window.dceVizSetCampaign = setCampaign;
  window.dceVizSelectProfile = selectProfile;
})();
