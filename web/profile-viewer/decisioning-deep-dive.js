/**
 * Decisioning deep dive — Experience Decisioning playground topics (items, schema, collections, rules).
 * Bundled logic extracted from decisioning-visualizer.js (playground integration); prelude + tail only here.
 */
(function () {
  'use strict';

  var LS_INDUSTRY = 'dceVizIndustry';
  var LS_CONV = 'dceDeepDiveConversation';

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

  function escColHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function applyConversationUi() {
    var on = false;
    try {
      on = localStorage.getItem(LS_CONV) === '1';
    } catch (e) {}
    document.body.setAttribute('data-dce-dd-conversation', on ? 'on' : 'off');
    var cb = document.getElementById('dce-dd-conversation-toggle');
    if (cb) cb.checked = on;
  }

  function showDdPanel(id) {
    var root = document.getElementById('dceDeepDiveRoot');
    if (!root) return;
    root.querySelectorAll('.dce-dd-step').forEach(function (p) {
      p.classList.toggle('active', p.id === id);
    });
    root.querySelectorAll('.dce-dd-tab').forEach(function (b) {
      var pid = b.getAttribute('data-dce-dd-panel');
      b.classList.toggle('active', pid === id);
      b.setAttribute('aria-selected', pid === id ? 'true' : 'false');
    });
  }

  function bindDdChrome() {
    var root = document.getElementById('dceDeepDiveRoot');
    if (!root || root.getAttribute('data-dce-dd-bound') === '1') return;
    root.setAttribute('data-dce-dd-bound', '1');

    root.addEventListener('click', function (e) {
      var tab = e.target.closest && e.target.closest('.dce-dd-tab');
      if (tab && root.contains(tab)) {
        e.preventDefault();
        var pid = tab.getAttribute('data-dce-dd-panel');
        if (pid) showDdPanel(pid);
      }
    });

    var ddBtn = document.getElementById('dce-pg-industry-btn');
    var ddMenu = document.getElementById('dce-pg-industry-menu');
    function closeIndustryMenu() {
      if (!ddMenu || !ddBtn) return;
      ddMenu.hidden = true;
      ddBtn.setAttribute('aria-expanded', 'false');
    }
    function toggleIndustryMenu() {
      if (!ddMenu || !ddBtn) return;
      ddMenu.hidden = !ddMenu.hidden;
      ddBtn.setAttribute('aria-expanded', ddMenu.hidden ? 'false' : 'true');
    }
    if (ddBtn && ddMenu) {
      ddBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleIndustryMenu();
      });
      ddMenu.querySelectorAll('.dce-pg-dropdown-item').forEach(function (item) {
        item.addEventListener('click', function () {
          var k = item.getAttribute('data-dce-industry');
          if (k && typeof window.dceDdSetIndustry === 'function') window.dceDdSetIndustry(k, true);
          closeIndustryMenu();
        });
      });
      document.addEventListener('click', closeIndustryMenu);
    }

    var conv = document.getElementById('dce-dd-conversation-toggle');
    if (conv) {
      conv.addEventListener('change', function () {
        try {
          localStorage.setItem(LS_CONV, conv.checked ? '1' : '0');
        } catch (e) {}
        applyConversationUi();
      });
    }
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
  function renderCollectionsPanel() {
    var mount = document.getElementById('dce-collections-mount');
    if (!mount) return;
    var ind = getIndustry();
    var conf = DCE_COLLECTIONS_UI[ind] || DCE_COLLECTIONS_UI.retail;
    if (!conf || !conf.pills || !conf.pills.length) {
      mount.innerHTML = '<p class="dce-pg-schema-fallback">Collections data failed to load.</p>';
      return;
    }
    var offers = conf.offers || [];
    var pills = conf.pills || [];
    var n = pills.length;
    var defIx = n > 0 ? n - 1 : 0;
    var ix = DCE_COL_PILL_IX[ind];
    if (typeof ix !== 'number' || ix < 0 || ix >= n) {
      ix = defIx;
      DCE_COL_PILL_IX[ind] = defIx;
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
    var ruleCode = active.rule != null && active.rule !== '' ? active.rule : active.ruleExpr;
    var ruleDesc = active.info != null && active.info !== '' ? active.info : active.description;
    parts.push('<div class="dce-col-rule-row">' + DCE_COL_FILTER_SVG);
    parts.push('<code class="dce-col-rule-code">' + escColHtml(ruleCode) + '</code></div>');
    parts.push('<p class="dce-col-rule-desc">' + escColHtml(ruleDesc) + '</p>');
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

  var DCE_RULES_DATA = window.DCE_PLAYGROUND_RULES_DATA || {};

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
    if (rd.source && rd.condition) return rd.source + ' · ' + rd.condition;
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
    if (!pack || !pack.rules || !pack.personas) return;
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
          (per.detail
            ? '<div class="dce-rules-persona-detail">' + escColHtml(per.detail) + '</div>'
            : '') +
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
  function setIndustry(key, persist) {
    if (key !== 'travel' && key !== 'media' && key !== 'retail' && key !== 'fsi' && key !== 'telco' && key !== 'automotive' && key !== 'healthcare') key = 'media';
    document.body.setAttribute('data-dce-industry', key);
    if (persist) {
      try {
        localStorage.setItem(LS_INDUSTRY, key);
      } catch (e) {}
    }
    var pgLbl = document.getElementById('dce-pg-industry-label');
    if (pgLbl) pgLbl.textContent = INDUSTRY_LABEL_UI[key] || INDUSTRY_LABEL_UI.media;
    document.querySelectorAll('#dceDeepDiveRoot .dce-pg-dropdown-item').forEach(function (b) {
      var on = b.getAttribute('data-dce-industry') === key;
      b.classList.toggle('dce-pg-dropdown-item--active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (typeof window.dceVizApplySchemaIndustry === 'function') window.dceVizApplySchemaIndustry();
    applyCollectionsIndustry();
    applyRulesIndustry();
    if (typeof window.dceVizApplyItemsIndustry === 'function') window.dceVizApplyItemsIndustry();
  }

  window.dceDdSetIndustry = setIndustry;

  function initDeepDive() {
    bindOfferSchema();
    bindCollectionsPills();
    bindRulesPanel();
    if (typeof window.dceVizBindPlaygroundItemsStep === 'function') {
      window.dceVizBindPlaygroundItemsStep(getIndustry);
    } else {
      window.dceVizApplyItemsIndustry = function () {};
    }
    bindDdChrome();
    applyConversationUi();
    var key = 'media';
    try {
      var s = localStorage.getItem(LS_INDUSTRY);
      if (s === 'travel' || s === 'media' || s === 'retail' || s === 'fsi' || s === 'telco' || s === 'automotive' || s === 'healthcare') key = s;
    } catch (e) {}
    setIndustry(key, false);
    showDdPanel('dceViz-panel-channels');
  }

  try {
    initDeepDive();
  } catch (err) {
    console.error('[decisioning-deep-dive]', err);
  }
})();
