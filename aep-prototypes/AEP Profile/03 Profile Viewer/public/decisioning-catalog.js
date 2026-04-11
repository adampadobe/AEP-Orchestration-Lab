/**
 * Decisioning catalog — browse DPS offer items, item collections, and selection strategies.
 * Uses the same /api/aep proxy and global sandbox as the Decisioning lab.
 */
(function () {
  'use strict';

  var LOG_PREFIX = '[decisioning-catalog]';
  function dcLog() {
    var args = Array.prototype.slice.call(arguments);
    args.unshift(LOG_PREFIX);
    console.log.apply(console, args);
  }

  async function aepCall(payload) {
    dcLog('UPS proxy →', payload.method || 'POST', payload.path || '', payload.params || {});
    var res;
    try {
      res = await fetch('/api/aep', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    } catch (e) {
      dcLog('UPS proxy ✗ network', String(e.message || e));
      return { httpOk: false, data: { error: 'Network error calling /api/aep', detail: String(e.message || e) } };
    }
    var text = await res.text();
    var data;
    try { data = text ? JSON.parse(text) : {}; } catch (e) { data = { error: 'Non-JSON from proxy', detail: text.slice(0, 200) }; }
    dcLog('UPS proxy ← HTTP', res.status, res.ok ? 'ok' : 'error');
    return { httpOk: res.ok, data };
  }

  (function initCatalogExplorer() {
    var CATALOG_PRESETS = {
      'offer-items':          { path: '/data/core/dps/offer-items',          params: { limit: 50 } },
      'item-collections':     { path: '/data/core/dps/item-collections',     params: { limit: 50 } },
      'selection-strategies':  { path: '/data/core/dps/selection-strategies', params: { limit: 50 } },
    };

    var activeCatalog = 'offer-items';
    var lastCatalogRaw = null;

    /* ── Sandbox selector init ── */
    var catalogSandboxSelect = document.getElementById('sandboxSelect');
    if (typeof window.AepGlobalSandbox !== 'undefined' && catalogSandboxSelect) {
      window.AepGlobalSandbox.loadSandboxesIntoSelect(catalogSandboxSelect);
      window.AepGlobalSandbox.onSandboxSelectChange(catalogSandboxSelect);
      window.AepGlobalSandbox.attachStorageSync(catalogSandboxSelect);
    }

    var tabs = document.querySelectorAll('.cd-catalog-tab');
    var schemaDetails = document.getElementById('catalogSchemaDetails');
    var schemaBadge = document.getElementById('catalogSchemaBadge');
    var schemaInput = document.getElementById('catalogSchemaId');
    var btnSchemaSave = document.getElementById('btnSchemaSave');
    var btnFetch = document.getElementById('btnCatalogFetch');
    var statusEl = document.getElementById('catalogStatus');
    var countEl = document.getElementById('catalogCount');
    var resultsEl = document.getElementById('catalogResults');

    function collapseSchema() {
      if (schemaDetails) schemaDetails.removeAttribute('open');
      if (schemaBadge) schemaBadge.hidden = false;
    }
    function expandSchema() {
      if (schemaDetails) schemaDetails.setAttribute('open', '');
      if (schemaBadge) schemaBadge.hidden = true;
    }

    function getCatalogSandbox() {
      if (catalogSandboxSelect && catalogSandboxSelect.value) return catalogSandboxSelect.value;
      try {
        return localStorage.getItem('aepGlobalSandboxName') || localStorage.getItem('aep-sandbox') || '';
      } catch (e) { return ''; }
    }

    async function catalogAuthFetch(url, opts) {
      opts = opts || {};
      var extra = {};
      if (typeof AepLabSandboxSync !== 'undefined' && AepLabSandboxSync.getAuthHeaders) {
        extra = await AepLabSandboxSync.getAuthHeaders();
      }
      return fetch(url, Object.assign({}, opts, { headers: Object.assign({}, extra, opts.headers || {}) }));
    }

    function catalogAepCall(payload) {
      var sandbox = getCatalogSandbox();
      if (sandbox) {
        var ph = payload.platform_headers || {};
        ph['x-sandbox-name'] = sandbox;
        payload.platform_headers = ph;
      }
      return aepCall(payload);
    }

    var OFFER_SCHEMA_TITLE = 'Personalized Offer Items - Experience Decisioning';

    async function autoDetectSchemaId() {
      dcLog('Auto-detecting offer items schema in sandbox:', getCatalogSandbox());
      try {
        var result = await catalogAepCall({
          method: 'GET',
          path: '/data/foundation/schemaregistry/tenant/schemas',
          params: { limit: 100, orderby: 'title', property: 'title==' + OFFER_SCHEMA_TITLE },
          platform_headers: { accept: 'application/vnd.adobe.xed-id+json' },
        });
        if (!result.httpOk) {
          dcLog('Schema search failed:', result.data);
          return null;
        }
        var pr = result.data.platform_response || result.data;
        var schemas = pr.results || [];
        if (!schemas.length && pr.length) schemas = pr;
        for (var i = 0; i < schemas.length; i++) {
          var s = schemas[i];
          if (s.title === OFFER_SCHEMA_TITLE) {
            var schemaId = s['$id'] || s['meta:altId'] || '';
            dcLog('Schema auto-detected:', schemaId);
            return schemaId;
          }
        }
        dcLog('Schema "' + OFFER_SCHEMA_TITLE + '" not found in this sandbox');
        return null;
      } catch (e) {
        dcLog('Schema auto-detect error:', e);
        return null;
      }
    }

    async function loadSchemaConfig() {
      var sandbox = getCatalogSandbox();
      if (!sandbox) return;
      if (window.__aepLabSyncReady) {
        try {
          await window.__aepLabSyncReady;
        } catch (e) {}
      }
      try {
        var res = await catalogAuthFetch('/api/catalog/config?sandbox=' + encodeURIComponent(sandbox));
        var data = await res.json().catch(function () { return {}; });
        if (data.ok && data.record && data.record.schemaId) {
          schemaInput.value = data.record.schemaId;
          collapseSchema();
          return;
        }
      } catch (e) {
        dcLog('Catalog config load error:', e);
      }

      var detected = await autoDetectSchemaId();
      if (detected) {
        schemaInput.value = detected;
        await saveSchemaToFirebase();
        collapseSchema();
      } else {
        expandSchema();
      }
    }

    async function saveSchemaToFirebase() {
      var sandbox = getCatalogSandbox();
      var val = schemaInput.value.trim();
      if (!sandbox) return;
      try {
        await catalogAuthFetch('/api/catalog/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sandbox: sandbox, schemaId: val }),
        });
        if (val) collapseSchema();
        dcLog('Schema ID saved to Firebase:', val);
      } catch (e) {
        dcLog('Schema save error:', e);
      }
    }

    if (btnSchemaSave) {
      btnSchemaSave.addEventListener('click', saveSchemaToFirebase);
    }

    loadSchemaConfig();

    if (catalogSandboxSelect) {
      catalogSandboxSelect.addEventListener('change', function () {
        tagNameMap = {};
        rankingFunctionMap = {};
        segmentNameMap = {};
        resultsEl.innerHTML = '';
        countEl.textContent = '';
        statusEl.textContent = '';
        loadSchemaConfig();
      });
    }
    window.addEventListener('aep-global-sandbox-change', function () {
      tagNameMap = {};
      rankingFunctionMap = {};
      segmentNameMap = {};
      resultsEl.innerHTML = '';
      countEl.textContent = '';
      statusEl.textContent = '';
      loadSchemaConfig();
    });

    function updateSchemaVisibility() {
      if (schemaDetails) schemaDetails.style.display = activeCatalog === 'offer-items' ? '' : 'none';
    }
    updateSchemaVisibility();

    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (t) { t.setAttribute('aria-selected', 'false'); });
        tab.setAttribute('aria-selected', 'true');
        activeCatalog = tab.getAttribute('data-catalog');
        updateSchemaVisibility();
      });
    });

    function escHtml(s) {
      var d = document.createElement('div');
      d.textContent = s;
      return d.innerHTML;
    }

    function extractItems(data) {
      var pr = data && data.platform_response;
      var source = pr || data;
      if (!source) return [];
      if (Array.isArray(source.results)) return source.results;
      if (Array.isArray(source._embedded && source._embedded.results)) return source._embedded.results;
      if (source._embedded) {
        var keys = Object.keys(source._embedded);
        for (var i = 0; i < keys.length; i++) {
          var v = source._embedded[keys[i]];
          if (Array.isArray(v)) return v;
        }
      }
      if (Array.isArray(source)) return source;
      return [];
    }

    function itemName(item) {
      return item.name || (item._instance && item._instance.internalName) || item.id || '(unnamed)';
    }

    function itemDescription(item) {
      return item.description || (item._instance && item._instance['repo:name']) || '';
    }

    function getDecisionItem(it) {
      return (it._experience && it._experience.decisioning && it._experience.decisioning.decisionitem) || {};
    }

    function getOfferStatus(it) {
      var oi = it._experience && it._experience.decisioning && it._experience.decisioning.offeritem;
      return (oi && oi.lifecycleStatus) || it.status || '';
    }

    function formatDate(iso) {
      if (!iso) return '—';
      try { var d = new Date(iso); return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); } catch (e) { return iso; }
    }

    function dateStatusClass(startIso, endIso) {
      var now = new Date();
      if (endIso) {
        var end = new Date(endIso);
        if (end < now) return 'cd-offer-expired';
      }
      if (startIso) {
        var start = new Date(startIso);
        if (start > now) return 'cd-offer-scheduled';
      }
      return 'cd-offer-active';
    }

    function dateStatusLabel(startIso, endIso) {
      var now = new Date();
      if (endIso) {
        var end = new Date(endIso);
        if (end < now) return 'Expired';
      }
      if (startIso) {
        var start = new Date(startIso);
        if (start > now) return 'Scheduled';
      }
      return 'Active';
    }

    function getTagNames(di) {
      var details = di.itemTagDetails;
      if (Array.isArray(details) && details.length) {
        return details.map(function (t) { return t.name || t.id || ''; }).filter(Boolean);
      }
      return [];
    }

    var offerSortCol = 'name';
    var offerSortAsc = true;
    var lastOfferItems = [];

    function offerSortVal(it, col) {
      var di = getDecisionItem(it);
      var cal = di.itemCalendarConstraints || {};
      switch (col) {
        case 'name':     return (di.itemName || itemName(it)).toLowerCase();
        case 'priority': return di.itemPriority != null ? di.itemPriority : -1;
        case 'start':    return cal.startDate || '';
        case 'end':      return cal.endDate || '';
        case 'status':   return dateStatusLabel(cal.startDate || '', cal.endDate || '');
        case 'tags':     return getTagNames(di).join(',').toLowerCase();
        default:         return '';
      }
    }

    function sortOfferItems(items, col, asc) {
      return items.slice().sort(function (a, b) {
        var va = offerSortVal(a, col);
        var vb = offerSortVal(b, col);
        var cmp = 0;
        if (typeof va === 'number' && typeof vb === 'number') {
          cmp = va - vb;
        } else {
          cmp = String(va).localeCompare(String(vb));
        }
        return asc ? cmp : -cmp;
      });
    }

    function buildOfferTableHtml(items) {
      var cols = [
        { key: 'name', label: 'Name' },
        { key: 'priority', label: 'Priority' },
        { key: 'start', label: 'Start date' },
        { key: 'end', label: 'End date' },
        { key: 'status', label: 'Status' },
        { key: 'tags', label: 'Tags' },
      ];
      var html = '<table class="cd-catalog-table"><thead><tr>';
      for (var c = 0; c < cols.length; c++) {
        html += '<th class="cd-sortable-th" data-sort-type="offer" data-sort-col="' + cols[c].key + '">' +
          escHtml(cols[c].label) + sortArrowFor(cols[c].key, offerSortCol, offerSortAsc) + '</th>';
      }
      html += '</tr></thead><tbody>';
      var sorted = sortOfferItems(items, offerSortCol, offerSortAsc);
      for (var i = 0; i < sorted.length; i++) {
        var it = sorted[i];
        var di = getDecisionItem(it);
        var name = di.itemName || itemName(it);
        var priority = di.itemPriority != null ? di.itemPriority : '—';
        var cal = di.itemCalendarConstraints || {};
        var startDate = cal.startDate || '';
        var endDate = cal.endDate || '';
        var cls = dateStatusClass(startDate, endDate);
        var label = dateStatusLabel(startDate, endDate);
        var tags = getTagNames(di);
        var tagsHtml = tags.length
          ? tags.map(function (t) { return '<span class="cd-offer-tag">' + escHtml(t) + '</span>'; }).join(' ')
          : '<span style="color:var(--muted)">—</span>';
        html += '<tr>' +
          '<td class="cd-offer-name">' + escHtml(name) + '</td>' +
          '<td class="cd-offer-priority">' + escHtml(String(priority)) + '</td>' +
          '<td>' + escHtml(formatDate(startDate)) + '</td>' +
          '<td class="' + cls + '">' + escHtml(formatDate(endDate)) + '</td>' +
          '<td class="cd-offer-status ' + cls + '">' + escHtml(label) + '</td>' +
          '<td>' + tagsHtml + '</td>' +
          '</tr>';
      }
      html += '</tbody></table>';
      return html;
    }

    /* ── Item Collections table ── */

    var collSortCol = 'name';
    var collSortAsc = true;
    var lastCollItems = [];
    var tagNameMap = {};

    async function resolveTagNames(collections) {
      var catalogIds = {};
      collections.forEach(function (c) {
        (c.constraints || []).forEach(function (con) {
          if (con.itemCatalogId) catalogIds[con.itemCatalogId] = true;
        });
      });
      var ids = Object.keys(catalogIds);
      if (!ids.length) return;

      for (var i = 0; i < ids.length; i++) {
        try {
          var catResult = await catalogAepCall({ method: 'GET', path: '/data/core/dps/decision-catalogs/' + ids[i] });
          if (!catResult.httpOk) continue;
          var catData = catResult.data.platform_response || catResult.data;
          var schemaId = catData.schema;
          if (!schemaId) continue;

          var itemResult = await catalogAepCall({
            method: 'GET',
            path: '/data/core/dps/offer-items',
            params: { limit: 100 },
            platform_headers: { 'x-schema-id': schemaId },
          });
          if (!itemResult.httpOk) continue;
          var items = extractItems(itemResult.data);
          items.forEach(function (it) {
            var di = (it._experience && it._experience.decisioning && it._experience.decisioning.decisionitem) || {};
            (di.itemTagDetails || []).forEach(function (td) {
              var tid = td.tagId || td.id || '';
              var tname = td.tagName || td.name || '';
              if (tid && tname) tagNameMap[tid] = tname;
            });
          });
        } catch (e) {
          dcLog('Tag resolve error:', e);
        }
      }
      dcLog('Tag names resolved:', Object.keys(tagNameMap).length);
    }

    var COLL_COLS = [
      { key: 'name', label: 'Name' },
      { key: 'description', label: 'Description' },
      { key: 'rule', label: 'Collection rules' },
      { key: 'version', label: 'Ver.' },
      { key: 'created', label: 'Created' },
      { key: 'modified', label: 'Modified' },
    ];

    var OPERATOR_LABELS = {
      'in': 'Contains',
      'equals': 'Equals',
      'notEquals': 'Not equals',
      'greaterThan': 'Greater than',
      'greaterThanOrEquals': 'Greater than or equals',
      'lessThan': 'Less than',
      'lessThanOrEquals': 'Less than or equals',
      'contains': 'Contains',
      'startsWith': 'Starts with',
      'endsWith': 'Ends with',
      'and': 'All of',
      'or': 'Any of',
    };

    function parseCollectionRule(constraint) {
      if (!constraint || !constraint.uiModel) return null;
      try {
        var model = JSON.parse(constraint.uiModel);
        return formatUiModel(model);
      } catch (e) {
        return null;
      }
    }

    function formatUiModel(model) {
      if (!model || !model.operator) return null;
      var op = model.operator;
      if (op === 'and' || op === 'or') {
        var children = Array.isArray(model.value) ? model.value : [];
        var parts = children.map(function (child) { return formatUiModel(child); }).filter(Boolean);
        return parts.length ? parts.join(op === 'and' ? ' AND ' : ' OR ') : null;
      }
      var val = model.value || {};
      var fieldTitle = (val.meta && val.meta.left && val.meta.left.title) || '';
      var fieldType = (val.meta && val.meta.left && val.meta.left.type) || '';
      var leftPath = val.left || '';
      var isTagField = fieldType === 'tag' || leftPath.indexOf('itemTags') !== -1;
      if (!fieldTitle && isTagField) fieldTitle = 'Tags';
      var opLabel = OPERATOR_LABELS[op] || op;
      var right = val.right;
      var rightText = '';
      if (Array.isArray(right)) {
        var resolved = right.map(function (v) {
          var s = String(v);
          return (isTagField && tagNameMap[s]) ? tagNameMap[s] : s;
        });
        rightText = resolved.join(', ');
      } else if (right != null) {
        var s = String(right);
        rightText = (isTagField && tagNameMap[s]) ? tagNameMap[s] : s;
      }
      return (fieldTitle || 'Field') + ' ' + opLabel.toLowerCase() + ' ' + rightText;
    }

    function formatCollectionRules(constraints) {
      if (!Array.isArray(constraints) || !constraints.length) {
        return '<span style="color:var(--muted)">No rules</span>';
      }
      var parts = constraints.map(function (c) {
        var parsed = parseCollectionRule(c);
        if (parsed) {
          return '<span class="cd-offer-tag" style="background:var(--dash-blue,#1473e6);color:#fff;border:none">Rule</span> ' + escHtml(parsed);
        }
        return '<span style="color:var(--muted)">Custom filter</span>';
      });
      return parts.join('<br>');
    }

    function collectionRuleSortText(constraints) {
      if (!Array.isArray(constraints) || !constraints.length) return '';
      return constraints.map(function (c) {
        return parseCollectionRule(c) || '';
      }).join(' ').toLowerCase();
    }

    function collSortVal(it, col) {
      switch (col) {
        case 'name':        return (it.name || '').toLowerCase();
        case 'description': return (it.description || '').toLowerCase();
        case 'rule':         return collectionRuleSortText(it.constraints);
        case 'version':     return it.etag || 0;
        case 'created':     return it.created || '';
        case 'modified':    return it.modified || '';
        default:            return '';
      }
    }

    function buildCollTableHtml(items) {
      var html = '<table class="cd-catalog-table"><thead><tr>';
      for (var c = 0; c < COLL_COLS.length; c++) {
        html += '<th class="cd-sortable-th" data-sort-type="coll" data-sort-col="' + COLL_COLS[c].key + '">' +
          escHtml(COLL_COLS[c].label) + sortArrowFor(COLL_COLS[c].key, collSortCol, collSortAsc) + '</th>';
      }
      html += '</tr></thead><tbody>';
      var sorted = genericSort(items, collSortVal, collSortCol, collSortAsc);
      for (var i = 0; i < sorted.length; i++) {
        var it = sorted[i];
        var version = it.etag || 1;
        html += '<tr>' +
          '<td class="cd-offer-name">' + escHtml(it.name || '(unnamed)') + '</td>' +
          '<td>' + escHtml(it.description || '—') + '</td>' +
          '<td>' + formatCollectionRules(it.constraints) + '</td>' +
          '<td class="cd-offer-priority">' + version + '</td>' +
          '<td>' + escHtml(formatDate(it.created)) + '</td>' +
          '<td>' + escHtml(formatDate(it.modified)) + '</td>' +
          '</tr>';
      }
      html += '</tbody></table>';
      return html;
    }

    /* ── Selection Strategies table ── */

    var stratSortCol = 'name';
    var stratSortAsc = true;
    var lastStratItems = [];

    var STRAT_COLS = [
      { key: 'name', label: 'Name' },
      { key: 'priority', label: 'Priority' },
      { key: 'ranking', label: 'Ranking method' },
      { key: 'constraint', label: 'Profile constraint' },
      { key: 'collection', label: 'Item collection' },
      { key: 'version', label: 'Ver.' },
      { key: 'created', label: 'Created' },
      { key: 'modified', label: 'Modified' },
    ];

    var RANK_LABELS = {
      'static': 'Offer priority',
      'scoringFunction': 'Formula',
      'rankingStrategy': 'AI model',
    };

    var rankingFunctionMap = {};
    var segmentNameMap = {};

    async function loadRankingFunctions() {
      try {
        var result = await catalogAepCall({ method: 'GET', path: '/data/core/dps/ranking-formulas', params: { limit: 100 } });
        if (result.httpOk) {
          var items = extractItems(result.data);
          items.forEach(function (fn) {
            if (fn.id) rankingFunctionMap[fn.id] = fn;
          });
          dcLog('Ranking functions loaded:', Object.keys(rankingFunctionMap).length);
        }
      } catch (e) {
        dcLog('Ranking functions load failed:', e);
      }
    }

    async function resolveSegmentNames(strategies) {
      var ids = {};
      strategies.forEach(function (s) {
        var pc = s.profileConstraint;
        if (pc && (pc.profileConstraintType === 'allSegments' || pc.profileConstraintType === 'anySegments')) {
          (pc.segmentIdentities || []).forEach(function (seg) {
            if (seg.id && !segmentNameMap[seg.id]) ids[seg.id] = true;
          });
        }
      });
      var uniqueIds = Object.keys(ids);
      if (!uniqueIds.length) return;
      dcLog('Resolving', uniqueIds.length, 'segment name(s)…');
      await Promise.all(uniqueIds.map(async function (id) {
        try {
          var result = await catalogAepCall({ method: 'GET', path: '/data/core/ups/segment/definitions/' + id });
          if (result.httpOk) {
            var pr = result.data.platform_response || result.data;
            if (pr.name) segmentNameMap[id] = pr.name;
          }
        } catch (e) { /* skip */ }
      }));
      dcLog('Segment names resolved:', Object.keys(segmentNameMap).length);
    }

    function formatRanking(rank) {
      if (!rank || !rank.order) return '—';
      var type = rank.order.orderEvaluationType || '';
      var label = RANK_LABELS[type] || type;
      var fnId = rank.order.function || '';
      var badgeColor = type === 'static' ? 'var(--muted)' : 'var(--dash-blue,#1473e6)';
      var html = '<span class="cd-offer-tag" style="background:' + badgeColor + ';color:#fff;border:none">' + escHtml(label) + '</span>';
      if (fnId) {
        var fnObj = rankingFunctionMap[fnId];
        if (fnObj && fnObj.name) {
          html += ' ' + escHtml(fnObj.name);
        } else {
          html += ' <code style="font-size:0.65rem;color:var(--muted)">' + escHtml(fnId) + '</code>';
        }
      }
      return html;
    }

    function formatProfileConstraint(pc) {
      if (!pc) return '—';
      var type = pc.profileConstraintType || 'none';
      if (type === 'none') return '<span style="color:var(--muted)">All visitors</span>';
      if (type === 'eligibilityRule') {
        var name = pc.eligibilityRuleName || '';
        var id = pc.eligibilityRule || '';
        var parts = '<span class="cd-offer-tag" style="background:var(--dash-blue,#1473e6);color:#fff;border:none">Decision rule</span> ';
        parts += name ? escHtml(name) : '<code style="font-size:0.7rem">' + escHtml(id) + '</code>';
        return parts;
      }
      if (type === 'allSegments' || type === 'anySegments') {
        var label = 'Audiences';
        var segs = pc.segmentIdentities || [];
        var parts = '<span class="cd-offer-tag" style="background:#e68619;color:#fff;border:none">' + escHtml(label) + '</span> ';
        if (segs.length) {
          parts += segs.map(function (s) {
            var resolved = segmentNameMap[s.id];
            return resolved
              ? escHtml(resolved)
              : '<code style="font-size:0.7rem">' + escHtml(s.id || '') + '</code>';
          }).join(', ');
        }
        return parts;
      }
      return escHtml(type);
    }

    function constraintSortText(pc) {
      if (!pc) return '';
      var type = pc.profileConstraintType || 'none';
      if (type === 'eligibilityRule') return (pc.eligibilityRuleName || pc.eligibilityRule || '').toLowerCase();
      if (type === 'allSegments' || type === 'anySegments') {
        var segs = pc.segmentIdentities || [];
        var names = segs.map(function (s) { return (segmentNameMap[s.id] || s.id || '').toLowerCase(); });
        return type + ' ' + names.join(' ');
      }
      return type;
    }

    function stratSortVal(it, col) {
      switch (col) {
        case 'name':        return (it.name || '').toLowerCase();
        case 'priority':    return (it.rank && it.rank.priority != null) ? it.rank.priority : 0;
        case 'ranking': {
          var rtype = (it.rank && it.rank.order && it.rank.order.orderEvaluationType) || '';
          var rfn = (it.rank && it.rank.order && it.rank.order.function) || '';
          var robj = rankingFunctionMap[rfn];
          return rtype + ' ' + ((robj && robj.name) || rfn);
        }
        case 'constraint':  return constraintSortText(it.profileConstraint);
        case 'collection':  return (it.optionSelection && it.optionSelection.filterName) || '';
        case 'version':     return it.etag || 0;
        case 'created':     return it.created || '';
        case 'modified':    return it.modified || '';
        default:            return '';
      }
    }

    function buildStratTableHtml(items) {
      var html = '<table class="cd-catalog-table"><thead><tr>';
      for (var c = 0; c < STRAT_COLS.length; c++) {
        html += '<th class="cd-sortable-th" data-sort-type="strat" data-sort-col="' + STRAT_COLS[c].key + '">' +
          escHtml(STRAT_COLS[c].label) + sortArrowFor(STRAT_COLS[c].key, stratSortCol, stratSortAsc) + '</th>';
      }
      html += '</tr></thead><tbody>';
      var sorted = genericSort(items, stratSortVal, stratSortCol, stratSortAsc);
      for (var i = 0; i < sorted.length; i++) {
        var it = sorted[i];
        var priority = (it.rank && it.rank.priority != null) ? it.rank.priority : '—';
        var collection = (it.optionSelection && it.optionSelection.filterName) || '—';
        var version = it.etag || 1;
        html += '<tr>' +
          '<td class="cd-offer-name">' + escHtml(it.name || '(unnamed)') + '</td>' +
          '<td class="cd-offer-priority">' + escHtml(String(priority)) + '</td>' +
          '<td>' + formatRanking(it.rank) + '</td>' +
          '<td>' + formatProfileConstraint(it.profileConstraint) + '</td>' +
          '<td>' + escHtml(collection) + '</td>' +
          '<td class="cd-offer-priority">' + version + '</td>' +
          '<td>' + escHtml(formatDate(it.created)) + '</td>' +
          '<td>' + escHtml(formatDate(it.modified)) + '</td>' +
          '</tr>';
      }
      html += '</tbody></table>';
      return html;
    }

    /* ── Shared sort helpers ── */

    function sortArrowFor(col, activeCol, asc) {
      if (col !== activeCol) return ' <span class="cd-sort-arrow cd-sort-none">⇅</span>';
      return asc ? ' <span class="cd-sort-arrow">▲</span>' : ' <span class="cd-sort-arrow">▼</span>';
    }

    function genericSort(items, valFn, col, asc) {
      return items.slice().sort(function (a, b) {
        var va = valFn(a, col);
        var vb = valFn(b, col);
        var cmp = (typeof va === 'number' && typeof vb === 'number') ? va - vb : String(va).localeCompare(String(vb));
        return asc ? cmp : -cmp;
      });
    }

    function attachCatalogSortListeners(catalogKey) {
      resultsEl.querySelectorAll('.cd-sortable-th').forEach(function (th) {
        th.addEventListener('click', function () {
          var col = th.getAttribute('data-sort-col');
          var type = th.getAttribute('data-sort-type');

          if (type === 'offer') {
            if (offerSortCol === col) offerSortAsc = !offerSortAsc;
            else { offerSortCol = col; offerSortAsc = true; }
          } else if (type === 'coll') {
            if (collSortCol === col) collSortAsc = !collSortAsc;
            else { collSortCol = col; collSortAsc = true; }
          } else if (type === 'strat') {
            if (stratSortCol === col) stratSortAsc = !stratSortAsc;
            else { stratSortCol = col; stratSortAsc = true; }
          }
          rerenderCatalogTable(catalogKey);
        });
      });
    }

    function rerenderCatalogTable(catalogKey) {
      var tableHtml;
      if (catalogKey === 'offer-items') tableHtml = buildOfferTableHtml(lastOfferItems);
      else if (catalogKey === 'item-collections') tableHtml = buildCollTableHtml(lastCollItems);
      else if (catalogKey === 'selection-strategies') tableHtml = buildStratTableHtml(lastStratItems);
      else return;
      var rawPre = resultsEl.querySelector('#catalogRawPre');
      var rawState = rawPre && !rawPre.hidden;
      resultsEl.innerHTML = tableHtml +
        '<button type="button" class="cd-catalog-raw-toggle" id="catalogRawToggle">' + (rawState ? 'Hide raw JSON' : 'Show raw JSON') + '</button>' +
        '<pre id="catalogRawPre"' + (rawState ? '' : ' hidden') + '>' + escHtml(JSON.stringify(lastCatalogRaw, null, 2)) + '</pre>';
      attachCatalogSortListeners(catalogKey);
      document.getElementById('catalogRawToggle').addEventListener('click', function () {
        var pre = document.getElementById('catalogRawPre');
        var showing = !pre.hidden;
        pre.hidden = showing;
        this.textContent = showing ? 'Show raw JSON' : 'Hide raw JSON';
      });
    }

    function renderCards(items, catalogKey) {
      if (!items.length) {
        resultsEl.innerHTML = '<div class="cd-catalog-empty">No ' + escHtml(catalogKey.replace(/-/g, ' ')) + ' found in this sandbox.</div>';
        return;
      }

      var html;
      if (catalogKey === 'offer-items') {
        lastOfferItems = items;
        html = buildOfferTableHtml(items);
      } else if (catalogKey === 'item-collections') {
        lastCollItems = items;
        html = buildCollTableHtml(items);
      } else if (catalogKey === 'selection-strategies') {
        lastStratItems = items;
        html = buildStratTableHtml(items);
      }

      html += '<button type="button" class="cd-catalog-raw-toggle" id="catalogRawToggle">Show raw JSON</button>';
      html += '<pre id="catalogRawPre" hidden>' + escHtml(JSON.stringify(lastCatalogRaw, null, 2)) + '</pre>';
      resultsEl.innerHTML = html;
      attachCatalogSortListeners(catalogKey);
      document.getElementById('catalogRawToggle').addEventListener('click', function () {
        var pre = document.getElementById('catalogRawPre');
        var showing = !pre.hidden;
        pre.hidden = showing;
        this.textContent = showing ? 'Show raw JSON' : 'Hide raw JSON';
      });
    }

    if (btnFetch) {
      btnFetch.addEventListener('click', async function () {
        var cfg = CATALOG_PRESETS[activeCatalog];
        if (!cfg) return;
        statusEl.textContent = 'Loading…';
        statusEl.className = 'status';
        countEl.textContent = '';
        resultsEl.innerHTML = '';
        lastCatalogRaw = null;

        var payload = { method: 'GET', path: cfg.path, params: cfg.params };
        if (activeCatalog === 'offer-items') {
          var sid = schemaInput.value.trim();
          if (sid) payload.platform_headers = { 'x-schema-id': sid };
        }

        dcLog('Catalog →', activeCatalog, payload.path, 'sandbox:', getCatalogSandbox());
        var result = await catalogAepCall(payload);
        lastCatalogRaw = result.data;

        if (!result.httpOk) {
          var errMsg = 'Request failed';
          if (result.data && result.data.platform_response) {
            var pr = result.data.platform_response;
            if (pr.title) errMsg = pr.title;
            else if (pr.detail) errMsg = pr.detail;
            else if (pr.message) errMsg = pr.message;
          }
          if (activeCatalog === 'offer-items' && !schemaInput.value.trim()) {
            errMsg += ' — try setting x-schema-id for offer-items.';
          }
          dcLog('Catalog ✗', errMsg);
          statusEl.textContent = errMsg;
          statusEl.className = 'status err';
          return;
        }

        var items = extractItems(result.data);
        dcLog('Catalog ✓', activeCatalog, items.length + ' items');

        if (activeCatalog === 'selection-strategies') {
          await Promise.all([
            Object.keys(rankingFunctionMap).length ? Promise.resolve() : loadRankingFunctions(),
            resolveSegmentNames(items),
          ]);
        }

        if (activeCatalog === 'item-collections' && !Object.keys(tagNameMap).length) {
          statusEl.textContent = 'Resolving tag names…';
          await resolveTagNames(items);
        }

        countEl.textContent = items.length + ' item' + (items.length !== 1 ? 's' : '');
        statusEl.textContent = 'Loaded.';
        statusEl.className = 'status ok';
        renderCards(items, activeCatalog);
      });
    }
  })();

  dcLog('initialized');
})();
