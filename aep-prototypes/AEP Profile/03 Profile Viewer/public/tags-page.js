/**
 * Data Collection — Tags (Reactor): companies, properties, and property drill-down via /api/tags/reactor.
 */
(function () {
  'use strict';

  /** @type {Array<Record<string, unknown>>} */
  var tagsPropertyCache = [];
  /** @type {'one'|'all'} */
  var tagsPropertyViewMode = 'one';

  /** Lazy cache: propertyId -> sectionId -> items array */
  var tagsExplorerCache = {};

  /** @type {{ propertyId: string, propertyName: string, companyId: string, companyName: string, activeSection: string } | null} */
  var tagsExplorerContext = null;

  var TAGS_DRILL_SECTIONS = [
    { id: 'dataElements', label: 'Data elements', resource: 'dataElements' },
    { id: 'extensions', label: 'Extensions', resource: 'extensions' },
    { id: 'rules', label: 'Rules', resource: 'rules' },
    { id: 'hosts', label: 'Hosts', resource: 'hosts' },
    { id: 'environments', label: 'Environments', resource: 'environments' },
    { id: 'libraries', label: 'Libraries', resource: 'libraries' },
  ];

  function el(id) {
    return document.getElementById(id);
  }

  function tagsApiUrl(resource, companyId, propertyId, ruleId) {
    var p = new URLSearchParams();
    if (window.AepGlobalSandbox && AepGlobalSandbox.getSandboxName) {
      var sb = String(AepGlobalSandbox.getSandboxName() || '').trim();
      if (sb) p.set('sandbox', sb);
    }
    p.set('resource', resource);
    if (companyId) p.set('companyId', companyId);
    if (propertyId) p.set('propertyId', propertyId);
    if (ruleId) p.set('ruleId', ruleId);
    return '/api/tags/reactor?' + p.toString();
  }

  function setMsg(text, kind) {
    var n = el('tagsMsg');
    if (!n) return;
    var t = text || '';
    n.textContent = t;
    n.hidden = !t;
    var extra = '';
    if (kind === 'err' || kind === 'error') extra = ' error';
    else if (kind === 'ok' || kind === 'success') extra = ' success';
    n.className = 'consent-message consent-message--below-btn' + extra;
  }

  var UPDATED_BY_KEYS = [
    'updated_by_email',
    'updated_by_name',
    'updated_by_username',
    'last_updated_by_email',
    'last_updated_by_name',
    'revised_by_user_email',
    'revised_by_email',
  ];

  function pickUpdatedByFromAttrs(a) {
    if (!a || typeof a !== 'object') return '';
    for (var i = 0; i < UPDATED_BY_KEYS.length; i++) {
      var v = a[UPDATED_BY_KEYS[i]];
      if (v != null && String(v).trim()) return String(v).trim();
    }
    return '';
  }

  /**
   * @param {object} p - JSON:API property resource
   * @param {{ companyId?: string, companyName?: string }} ctx
   */
  function normalizePropertyResource(p, ctx) {
    ctx = ctx || {};
    var a = (p && p.attributes && typeof p.attributes === 'object') ? p.attributes : {};
    var domains = Array.isArray(a.domains) ? a.domains : [];
    return {
      companyId: ctx.companyId != null ? String(ctx.companyId) : '',
      companyName: ctx.companyName != null ? String(ctx.companyName) : '',
      propertyId: (p && p.id) ? String(p.id) : '',
      propertyName: a.name != null ? String(a.name) : ((p && p.id) ? String(p.id) : ''),
      platform: a.platform != null ? String(a.platform) : '',
      development: a.development === true,
      domains: domains,
      domainsDisplay: domains.join(', '),
      createdAt: a.created_at != null ? String(a.created_at) : '',
      updatedAt: a.updated_at != null ? String(a.updated_at) : '',
      updatedBy: pickUpdatedByFromAttrs(a),
    };
  }

  function formatDateTime(iso) {
    if (!iso || typeof iso !== 'string') return '—';
    var d = new Date(iso);
    if (Number.isNaN(d.getTime())) return escapeHtml(iso);
    return escapeHtml(d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }));
  }

  function setPropertiesHeadMode(mode) {
    tagsPropertyViewMode = mode === 'all' ? 'all' : 'one';
    var thead = el('tagsPropertiesHeadRow');
    if (!thead) return;
    if (mode === 'all') {
      thead.innerHTML =
        '<th scope="col">Company ID</th>' +
        '<th scope="col">Company</th>' +
        '<th scope="col">Property ID</th>' +
        '<th scope="col">Name</th>' +
        '<th scope="col">Platform</th>' +
        '<th scope="col">Dev</th>' +
        '<th scope="col">Domains</th>' +
        '<th scope="col">Created</th>' +
        '<th scope="col">Updated</th>' +
        '<th scope="col">Last updated by</th>';
    } else {
      thead.innerHTML =
        '<th scope="col">Property ID</th>' +
        '<th scope="col">Name</th>' +
        '<th scope="col">Platform</th>' +
        '<th scope="col">Dev</th>' +
        '<th scope="col">Domains</th>' +
        '<th scope="col">Created</th>' +
        '<th scope="col">Updated</th>' +
        '<th scope="col">Last updated by</th>';
    }
  }

  function rowMatchesPlatform(row, platformSel) {
    if (!platformSel) return true;
    var p = row.platform != null ? String(row.platform).trim() : '';
    if (platformSel === '__none__') return !p;
    return p === platformSel;
  }

  function rowMatchesFilter(row, q) {
    if (!q) return true;
    var dev = row.development ? 'yes development' : 'no production';
    var hay = [
      row.companyId,
      row.companyName,
      row.propertyId,
      row.propertyName,
      row.platform,
      dev,
      row.domainsDisplay,
      row.createdAt,
      row.updatedAt,
      row.updatedBy,
    ]
      .join(' ')
      .toLowerCase();
    return hay.indexOf(q) >= 0;
  }

  function rebuildPlatformDropdown() {
    var sel = el('tagsPropertiesPlatformFilter');
    if (!sel) return;
    var prev = sel.value;
    var hasEmpty = false;
    var distinct = {};
    tagsPropertyCache.forEach(function (r) {
      var p = r.platform != null ? String(r.platform).trim() : '';
      if (!p) hasEmpty = true;
      else distinct[p] = true;
    });
    var keys = Object.keys(distinct).sort(function (a, b) {
      return a.localeCompare(b);
    });
    sel.innerHTML = '';
    var o0 = document.createElement('option');
    o0.value = '';
    o0.textContent = 'All platforms';
    sel.appendChild(o0);
    if (hasEmpty) {
      var on = document.createElement('option');
      on.value = '__none__';
      on.textContent = '(not set)';
      sel.appendChild(on);
    }
    keys.forEach(function (p) {
      var o = document.createElement('option');
      o.value = p;
      o.textContent = p;
      sel.appendChild(o);
    });
    if (prev === '__none__' && hasEmpty) sel.value = prev;
    else if (prev && distinct[prev]) sel.value = prev;
    else sel.value = '';
  }

  function updateFilterCount(shown, total) {
    var n = el('tagsPropertiesFilterCount');
    if (!n) return;
    if (!total) {
      n.textContent = '';
      return;
    }
    n.textContent = shown === total ? String(total) + ' shown' : String(shown) + ' of ' + String(total) + ' shown';
  }

  function renderPropertiesFromCache() {
    var tbody = el('tagsPropertiesBody');
    if (!tbody) return;
    var q = (el('tagsPropertiesFilter') && el('tagsPropertiesFilter').value || '').trim().toLowerCase();
    var platformSel = (el('tagsPropertiesPlatformFilter') && el('tagsPropertiesPlatformFilter').value) || '';
    var total = tagsPropertyCache.length;
    var rows = tagsPropertyCache.filter(function (r) {
      return rowMatchesPlatform(r, platformSel) && rowMatchesFilter(r, q);
    });
    tbody.innerHTML = '';
    rows.forEach(function (row) {
      tbody.appendChild(buildPropertyRowTr(row));
    });
    updateFilterCount(rows.length, total);
  }

  /** Spectrum workflow icons under profile-viewer/vendor (relative to tags.html). */
  var TAGS_PLATFORM_ICON_DIR = 'vendor/spectrum-workflow-icons/';
  var TAGS_PLATFORM_ICON_MAP = {
    web: { file: 'S2_Icon_DeviceDesktop_20_N.svg', label: 'Web' },
    mobile: { file: 'S2_Icon_DevicePhone_20_N.svg', label: 'Mobile' },
    edge: { file: 'S2_Icon_Cloud_20_N.svg', label: 'Edge' },
  };

  /**
   * @returns {string} HTML for one <td> with icon + tooltip (platform name).
   */
  function buildPlatformCellHtml(platformRaw) {
    var raw = platformRaw != null ? String(platformRaw).trim() : '';
    if (!raw) {
      return '<td class="tags-platform-cell tags-platform-cell--empty"><span class="tags-platform-dash">—</span></td>';
    }
    var key = raw.toLowerCase();
    var mapped = TAGS_PLATFORM_ICON_MAP[key];
    if (!mapped) {
      if (key.indexOf('mobile') >= 0) mapped = TAGS_PLATFORM_ICON_MAP.mobile;
      else if (key.indexOf('web') >= 0) mapped = TAGS_PLATFORM_ICON_MAP.web;
      else if (key.indexOf('edge') >= 0) mapped = TAGS_PLATFORM_ICON_MAP.edge;
    }
    var iconFile = mapped ? mapped.file : 'S2_Icon_Apps_20_N.svg';
    var tooltip = mapped ? mapped.label : raw;
    var src = TAGS_PLATFORM_ICON_DIR + iconFile;
    // Instant label via CSS ::after + data attr (native title tooltips are delayed ~1s in browsers).
    return (
      '<td class="tags-platform-cell">' +
      '<span class="tags-platform-icon-wrap" data-tags-platform-tip="' +
      escapeHtml(tooltip) +
      '">' +
      '<img class="tags-platform-icon-img" src="' +
      escapeHtml(src) +
      '" width="20" height="20" alt="" role="img" draggable="false" aria-label="' +
      escapeHtml(tooltip) +
      '" />' +
      '</span></td>'
    );
  }

  function buildPropertyRowTr(row) {
    var tr = document.createElement('tr');
    var domText = row.domainsDisplay || '';
    var domCell =
      '<td class="tags-cell-domains" title="' +
      escapeHtml(domText) +
      '">' +
      escapeHtml(domText.length > 80 ? domText.slice(0, 77) + '…' : domText || '—') +
      '</td>';
    var devCell = '<td>' + escapeHtml(row.development ? 'Yes' : 'No') + '</td>';
    var platCell = buildPlatformCellHtml(row.platform);
    var ub = row.updatedBy ? escapeHtml(row.updatedBy) : '—';
    var nameCell =
      '<td class="tags-property-name-cell">' +
      '<button type="button" class="tags-property-name-btn">' +
      escapeHtml(row.propertyName || '') +
      '</button></td>';

    if (tagsPropertyViewMode === 'all') {
      tr.innerHTML =
        '<td><code>' +
        escapeHtml(row.companyId || '') +
        '</code></td><td>' +
        escapeHtml(row.companyName || '') +
        '</td><td><code>' +
        escapeHtml(row.propertyId || '') +
        '</code></td>' +
        nameCell +
        platCell +
        devCell +
        domCell +
        '<td>' +
        formatDateTime(row.createdAt) +
        '</td><td>' +
        formatDateTime(row.updatedAt) +
        '</td><td>' +
        ub +
        '</td>';
    } else {
      tr.innerHTML =
        '<td><code>' +
        escapeHtml(row.propertyId || '') +
        '</code></td>' +
        nameCell +
        platCell +
        devCell +
        domCell +
        '<td>' +
        formatDateTime(row.createdAt) +
        '</td><td>' +
        formatDateTime(row.updatedAt) +
        '</td><td>' +
        ub +
        '</td>';
    }
    tr.classList.add('tags-property-row');
    tr.dataset.propertyId = row.propertyId || '';
    tr.dataset.propertyName = row.propertyName || '';
    tr.dataset.companyId = row.companyId || '';
    tr.dataset.companyName = row.companyName || '';
    return tr;
  }

  function explorerCacheKey(propertyId, sectionId) {
    return String(propertyId || '') + '::' + String(sectionId || '');
  }

  function getExplorerCached(propertyId, sectionId) {
    var m = tagsExplorerCache[explorerCacheKey(propertyId, sectionId)];
    return m != null ? m : null;
  }

  function setExplorerCached(propertyId, sectionId, items) {
    tagsExplorerCache[explorerCacheKey(propertyId, sectionId)] = items;
  }

  function hidePropertyExplorerPanel() {
    var panel = el('tagsPropertyExplorerPanel');
    var msg = el('tagsExplorerMsg');
    var tbody = el('tagsExplorerBody');
    var thead = el('tagsExplorerHead');
    var ctx = el('tagsExplorerContext');
    var pills = el('tagsExplorerPills');
    var ruleWrap = el('tagsExplorerRuleWrap');
    var ruleBody = el('tagsExplorerRuleBody');
    var ruleHead = el('tagsExplorerRuleHead');
    if (panel) panel.hidden = true;
    if (msg) {
      msg.textContent = '';
      msg.hidden = true;
    }
    if (tbody) tbody.innerHTML = '';
    if (thead) thead.innerHTML = '';
    if (ctx) ctx.textContent = '';
    if (pills) pills.innerHTML = '';
    if (ruleWrap) ruleWrap.hidden = true;
    if (ruleBody) ruleBody.innerHTML = '';
    if (ruleHead) ruleHead.innerHTML = '';
    tagsExplorerContext = null;
  }

  function setExplorerPillsActive(sectionId) {
    var pills = el('tagsExplorerPills');
    if (!pills) return;
    var btns = pills.querySelectorAll('button[data-tags-section]');
    for (var i = 0; i < btns.length; i++) {
      var b = btns[i];
      var on = b.getAttribute('data-tags-section') === sectionId;
      b.classList.toggle('tags-explorer-pill--active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    }
  }

  function buildExplorerPills() {
    var pills = el('tagsExplorerPills');
    if (!pills) return;
    pills.innerHTML = '';
    TAGS_DRILL_SECTIONS.forEach(function (sec) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-secondary tags-explorer-pill';
      btn.setAttribute('data-tags-section', sec.id);
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', 'false');
      btn.textContent = sec.label;
      pills.appendChild(btn);
    });
  }

  /** Embed snippet matching Tags “Web install instructions” (sync vs async). */
  function environmentScriptSnippet(url, wantAsync) {
    var u = String(url || '').trim();
    if (!u) return '';
    var safeAttr = u.replace(/"/g, '%22');
    return (
      '<script src="' + safeAttr + '"' + (wantAsync ? ' async' : '') + '></scr' + 'ipt>'
    );
  }

  function copyStringToClipboard(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      return navigator.clipboard.writeText(text).then(function () {
        return true;
      });
    }
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        var ok = document.execCommand('copy');
        document.body.removeChild(ta);
        if (ok) resolve(true);
        else reject(new Error('execCommand'));
      } catch (e) {
        reject(e);
      }
    });
  }

  function buildEnvironmentInstallCellInner(env) {
    var url = env && env.scriptUrl ? String(env.scriptUrl).trim() : '';
    if (!url) {
      return (
        '<td class="tags-cell-install"><span class="tags-env-install-missing" title="No library script URL yet. Build a library, assign it to this environment, or open the environment in Tags.">—</span></td>'
      );
    }
    var enc = encodeURIComponent(url);
    return (
      '<td class="tags-cell-install"><div class="tags-env-install-cell" role="group" aria-label="Copy install script">' +
      '<button type="button" class="btn btn-secondary tags-env-copy-btn" data-tags-script-url="' +
      enc +
      '" data-tags-async="0" title="Copy standard &lt;script&gt; tag">' +
      'Copy' +
      '</button> ' +
      '<button type="button" class="btn btn-secondary tags-env-copy-btn" data-tags-script-url="' +
      enc +
      '" data-tags-async="1" title="Copy async &lt;script&gt; tag">' +
      'Async' +
      '</button>' +
      '</div></td>'
    );
  }

  function renderExplorerMainTable(sectionId, items) {
    var thead = el('tagsExplorerHead');
    var tbody = el('tagsExplorerBody');
    if (!thead || !tbody) return;
    tbody.innerHTML = '';
    var i;
    var tr;
    if (sectionId === 'dataElements') {
      thead.innerHTML =
        '<tr>' +
        '<th scope="col">Name</th><th scope="col">Element ID</th><th scope="col">Extension</th>' +
        '<th scope="col">Settings (preview)</th><th scope="col">Delegate descriptor</th>' +
        '<th scope="col">Enabled</th><th scope="col">Dirty</th><th scope="col">Updated</th>' +
        '</tr>';
      for (i = 0; i < items.length; i++) {
        var row = items[i];
        tr = document.createElement('tr');
        var settingsPrev = row.settingsPreview || '';
        var settingsShow = truncateText(settingsPrev, 72);
        var extCell = row.extensionId ? '<code>' + escapeHtml(row.extensionId) + '</code>' : '—';
        tr.innerHTML =
          '<td>' +
          escapeHtml(row.name || '—') +
          '</td><td><code>' +
          escapeHtml(row.elementId || '') +
          '</code></td><td>' +
          extCell +
          '</td><td class="tags-cell-settings" title="' +
          escapeHtml(settingsPrev) +
          '">' +
          escapeHtml(settingsShow || '—') +
          '</td><td class="tags-cell-delegate">' +
          escapeHtml(truncateText(row.delegateDescriptorId || '', 48)) +
          '</td><td>' +
          escapeHtml(row.enabled ? 'Yes' : 'No') +
          '</td><td>' +
          escapeHtml(row.dirty ? 'Yes' : 'No') +
          '</td><td>' +
          formatDateTime(row.updatedAt) +
          '</td>';
        tbody.appendChild(tr);
      }
      return;
    }
    if (sectionId === 'extensions') {
      thead.innerHTML =
        '<tr><th scope="col">Name</th><th scope="col">Extension ID</th><th scope="col">Package</th>' +
        '<th scope="col">Delegate descriptor</th><th scope="col">Enabled</th><th scope="col">Updated</th></tr>';
      for (i = 0; i < items.length; i++) {
        var ex = items[i];
        tr = document.createElement('tr');
        tr.innerHTML =
          '<td>' +
          escapeHtml(ex.name || '—') +
          '</td><td><code>' +
          escapeHtml(ex.extensionId || '') +
          '</code></td><td><code>' +
          escapeHtml(ex.packageId || '—') +
          '</code></td><td>' +
          escapeHtml(truncateText(ex.delegateDescriptorId || '', 40)) +
          '</td><td>' +
          escapeHtml(ex.enabled ? 'Yes' : 'No') +
          '</td><td>' +
          formatDateTime(ex.updatedAt) +
          '</td>';
        tbody.appendChild(tr);
      }
      return;
    }
    if (sectionId === 'rules') {
      thead.innerHTML =
        '<tr><th scope="col">Name</th><th scope="col">Rule ID</th><th scope="col">Enabled</th>' +
        '<th scope="col">Updated</th><th scope="col">Components</th></tr>';
      for (i = 0; i < items.length; i++) {
        var ru = items[i];
        tr = document.createElement('tr');
        tr.innerHTML =
          '<td>' +
          escapeHtml(ru.name || '—') +
          '</td><td><code>' +
          escapeHtml(ru.ruleId || '') +
          '</code></td><td>' +
          escapeHtml(ru.enabled ? 'Yes' : 'No') +
          '</td><td>' +
          formatDateTime(ru.updatedAt) +
          '</td><td><button type="button" class="btn btn-secondary tags-rule-components-btn" data-rule-id="' +
          escapeHtml(ru.ruleId || '') +
          '">Load</button></td>';
        tbody.appendChild(tr);
      }
      return;
    }
    if (sectionId === 'hosts') {
      thead.innerHTML =
        '<tr><th scope="col">Name</th><th scope="col">Host ID</th><th scope="col">Type</th>' +
        '<th scope="col">Status</th><th scope="col">Updated</th></tr>';
      for (i = 0; i < items.length; i++) {
        var h = items[i];
        tr = document.createElement('tr');
        tr.innerHTML =
          '<td>' +
          escapeHtml(h.name || '—') +
          '</td><td><code>' +
          escapeHtml(h.hostId || '') +
          '</code></td><td>' +
          escapeHtml(h.typeOf || '—') +
          '</td><td>' +
          escapeHtml(h.status || '—') +
          '</td><td>' +
          formatDateTime(h.updatedAt) +
          '</td>';
        tbody.appendChild(tr);
      }
      return;
    }
    if (sectionId === 'environments') {
      thead.innerHTML =
        '<tr><th scope="col">Name</th><th scope="col">Environment ID</th><th scope="col">Stage</th>' +
        '<th scope="col">Path</th><th scope="col">Archive</th><th scope="col">Install</th><th scope="col">Updated</th></tr>';
      for (i = 0; i < items.length; i++) {
        var env = items[i];
        tr = document.createElement('tr');
        tr.innerHTML =
          '<td>' +
          escapeHtml(env.name || '—') +
          '</td><td><code>' +
          escapeHtml(env.environmentId || '') +
          '</code></td><td>' +
          escapeHtml(env.stage || '—') +
          '</td><td class="tags-cell-settings">' +
          escapeHtml(truncateText(env.path || '', 48)) +
          '</td><td>' +
          escapeHtml(env.archive ? 'Yes' : 'No') +
          '</td>' +
          buildEnvironmentInstallCellInner(env) +
          '<td>' +
          formatDateTime(env.updatedAt) +
          '</td>';
        tbody.appendChild(tr);
      }
      return;
    }
    if (sectionId === 'libraries') {
      thead.innerHTML =
        '<tr><th scope="col">Name</th><th scope="col">Library ID</th><th scope="col">State</th><th scope="col">Updated</th></tr>';
      for (i = 0; i < items.length; i++) {
        var lib = items[i];
        tr = document.createElement('tr');
        tr.innerHTML =
          '<td>' +
          escapeHtml(lib.name || '—') +
          '</td><td><code>' +
          escapeHtml(lib.libraryId || '') +
          '</code></td><td>' +
          escapeHtml(lib.state || '—') +
          '</td><td>' +
          formatDateTime(lib.updatedAt) +
          '</td>';
        tbody.appendChild(tr);
      }
    }
  }

  async function loadDrillSection(sectionId, forceRefresh) {
    if (!tagsExplorerContext) return;
    var propertyId = tagsExplorerContext.propertyId;
    var msg = el('tagsExplorerMsg');
    var ruleWrap = el('tagsExplorerRuleWrap');
    if (ruleWrap) ruleWrap.hidden = true;

    var secDef = TAGS_DRILL_SECTIONS.filter(function (s) {
      return s.id === sectionId;
    })[0];
    if (!secDef) return;

    if (forceRefresh) {
      delete tagsExplorerCache[explorerCacheKey(propertyId, sectionId)];
    }
    if (!forceRefresh) {
      var cached = getExplorerCached(propertyId, sectionId);
      if (cached) {
        renderExplorerMainTable(sectionId, cached);
        if (msg) {
          msg.textContent = String(cached.length) + ' row(s) (cached).';
          msg.hidden = false;
          msg.className = 'consent-message consent-message--below-btn success';
        }
        setExplorerPillsActive(sectionId);
        tagsExplorerContext.activeSection = sectionId;
        return;
      }
    }

    if (msg) {
      msg.textContent = 'Loading…';
      msg.hidden = false;
      msg.className = 'consent-message consent-message--below-btn';
    }
    el('tagsExplorerHead').innerHTML = '';
    el('tagsExplorerBody').innerHTML = '';

    try {
      var res = await fetch(tagsApiUrl(secDef.resource, '', propertyId));
      var data = await res.json().catch(function () {
        return {};
      });
      if (!data.ok) {
        if (msg) {
          msg.textContent = data.error || data.detail || 'Request failed.';
          msg.hidden = false;
          msg.className = 'consent-message consent-message--below-btn error';
        }
        return;
      }
      var items = data.items || [];
      setExplorerCached(propertyId, sectionId, items);
      renderExplorerMainTable(sectionId, items);
      tagsExplorerContext.activeSection = sectionId;
      setExplorerPillsActive(sectionId);
      if (msg) {
        msg.textContent =
          String(items.length) +
          ' row(s)' +
          (data.pagesFetched ? ' · pages: ' + String(data.pagesFetched) : '') +
          '.';
        msg.hidden = false;
        msg.className = 'consent-message consent-message--below-btn success';
      }
    } catch (e) {
      if (msg) {
        msg.textContent = e.message || 'Network error';
        msg.hidden = false;
        msg.className = 'consent-message consent-message--below-btn error';
      }
    }
  }

  async function loadRuleComponentsForRule(ruleId) {
    var msg = el('tagsExplorerMsg');
    var wrap = el('tagsExplorerRuleWrap');
    var thead = el('tagsExplorerRuleHead');
    var tbody = el('tagsExplorerRuleBody');
    var label = el('tagsExplorerRuleIdLabel');
    if (!ruleId || !wrap || !thead || !tbody) return;
    wrap.hidden = false;
    if (label) label.textContent = ruleId;
    thead.innerHTML =
      '<tr><th scope="col">Name</th><th scope="col">Component ID</th><th scope="col">Delegate descriptor</th>' +
      '<th scope="col">Order</th><th scope="col">Enabled</th><th scope="col">Updated</th></tr>';
    tbody.innerHTML = '';
    if (msg) {
      msg.textContent = 'Loading rule components…';
      msg.hidden = false;
      msg.className = 'consent-message consent-message--below-btn';
    }
    try {
      var res = await fetch(tagsApiUrl('ruleComponents', '', '', ruleId));
      var data = await res.json().catch(function () {
        return {};
      });
      if (!data.ok) {
        if (msg) {
          msg.textContent = data.error || data.detail || 'Request failed.';
          msg.className = 'consent-message consent-message--below-btn error';
        }
        return;
      }
      var items = data.items || [];
      items.forEach(function (rc) {
        var tr = document.createElement('tr');
        tr.innerHTML =
          '<td>' +
          escapeHtml(rc.name || '—') +
          '</td><td><code>' +
          escapeHtml(rc.componentId || '') +
          '</code></td><td class="tags-cell-delegate">' +
          escapeHtml(truncateText(rc.delegateDescriptorId || '', 40)) +
          '</td><td>' +
          escapeHtml(rc.order != null ? String(rc.order) : '—') +
          '</td><td>' +
          escapeHtml(rc.enabled ? 'Yes' : 'No') +
          '</td><td>' +
          formatDateTime(rc.updatedAt) +
          '</td>';
        tbody.appendChild(tr);
      });
      if (msg) {
        msg.textContent = String(items.length) + ' component(s) for rule ' + ruleId + '.';
        msg.className = 'consent-message consent-message--below-btn success';
      }
      try {
        wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } catch (e1) {
        wrap.scrollIntoView();
      }
    } catch (e) {
      if (msg) {
        msg.textContent = e.message || 'Network error';
        msg.className = 'consent-message consent-message--below-btn error';
      }
    }
  }

  /**
   * @param {{ propertyId: string, propertyName?: string, companyId?: string, companyName?: string }} ctx
   * @param {string|null} initialSection - TAGS_DRILL id or null (name click: pick tab first)
   * @param {boolean} forceRefreshFirst
   */
  function openPropertyExplorerPanel(ctx, initialSection, forceRefreshFirst) {
    ctx = ctx || {};
    var propertyId = ctx.propertyId ? String(ctx.propertyId).trim() : '';
    if (!propertyId) return;
    var panel = el('tagsPropertyExplorerPanel');
    var ctxEl = el('tagsExplorerContext');
    if (!panel) return;

    tagsExplorerCache = {};

    tagsExplorerContext = {
      propertyId: propertyId,
      propertyName: ctx.propertyName != null ? String(ctx.propertyName) : '',
      companyId: ctx.companyId != null ? String(ctx.companyId) : '',
      companyName: ctx.companyName != null ? String(ctx.companyName) : '',
      activeSection: '',
    };

    if (ctxEl) {
      var parts = [];
      if (tagsExplorerContext.companyName) parts.push(tagsExplorerContext.companyName);
      parts.push(tagsExplorerContext.propertyName || propertyId);
      parts.push('(' + propertyId + ')');
      ctxEl.textContent = parts.join(' · ');
    }

    buildExplorerPills();
    panel.hidden = false;

    var pills = el('tagsExplorerPills');
    if (pills) {
      pills.onclick = function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest('button[data-tags-section]') : null;
        if (!btn || !pills.contains(btn)) return;
        ev.preventDefault();
        var sid = btn.getAttribute('data-tags-section');
        if (sid) loadDrillSection(sid, false);
      };
    }

    el('tagsExplorerHead').innerHTML = '';
    el('tagsExplorerBody').innerHTML = '';
    var ruleWrap = el('tagsExplorerRuleWrap');
    if (ruleWrap) ruleWrap.hidden = true;

    var msg = el('tagsExplorerMsg');
    if (initialSection) {
      loadDrillSection(initialSection, !!forceRefreshFirst);
    } else {
      if (msg) {
        msg.textContent = 'Choose a resource type above (data loads when you pick one).';
        msg.hidden = false;
        msg.className = 'consent-message consent-message--below-btn';
      }
      TAGS_DRILL_SECTIONS.forEach(function (s) {
        var b = el('tagsExplorerPills') && el('tagsExplorerPills').querySelector('[data-tags-section="' + s.id + '"]');
        if (b) {
          b.classList.remove('tags-explorer-pill--active');
          b.setAttribute('aria-selected', 'false');
        }
      });
    }

    try {
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (e2) {
      panel.scrollIntoView();
    }
  }

  function truncateText(s, max) {
    var t = s == null ? '' : String(s);
    var n = max > 0 ? max : 80;
    if (t.length <= n) return t;
    return t.slice(0, n - 1) + '…';
  }

  function resetPropertyFilterUi() {
    var f = el('tagsPropertiesFilter');
    if (f) f.value = '';
    var plat = el('tagsPropertiesPlatformFilter');
    if (plat) {
      plat.innerHTML = '';
      var o = document.createElement('option');
      o.value = '';
      o.textContent = 'All platforms';
      plat.appendChild(o);
      plat.value = '';
    }
    updateFilterCount(0, 0);
  }

  function clearTables() {
    var tb = el('tagsCompaniesBody');
    var tb2 = el('tagsPropertiesBody');
    if (tb) tb.innerHTML = '';
    if (tb2) tb.innerHTML = '';
    tagsPropertyCache = [];
    resetPropertyFilterUi();
    setPropertiesHeadMode('one');
    hidePropertyExplorerPanel();
  }

  function companyDisplayName(c) {
    if (!c) return '';
    var id = c.id || '';
    return (c.attributes && (c.attributes.name || c.attributes.title)) || id;
  }

  /**
   * @returns {Array<object>} items
   */
  function ingestCompaniesResponse(data) {
    var items = data && Array.isArray(data.items) ? data.items : [];
    var sel = el('tagsCompanySelect');
    if (sel) {
      sel.innerHTML = '<option value="">— Select a company —</option>';
      items.forEach(function (c) {
        var id = c.id || '';
        var name = companyDisplayName(c);
        var opt = document.createElement('option');
        opt.value = id;
        opt.textContent = name + ' (' + id + ')';
        sel.appendChild(opt);
      });
      if (items.length === 1 && items[0] && items[0].id) {
        sel.value = String(items[0].id);
      }
    }
    var tbody = el('tagsCompaniesBody');
    if (tbody) {
      tbody.innerHTML = '';
      items.forEach(function (c) {
        var tr = document.createElement('tr');
        var id = c.id || '';
        var name = companyDisplayName(c) || '—';
        tr.innerHTML =
          '<td><code>' +
          escapeHtml(id) +
          '</code></td><td>' +
          escapeHtml(String(name)) +
          '</td>';
        tbody.appendChild(tr);
      });
    }
    return items;
  }

  /**
   * @param {number} n - company count
   * @param {Array<object>} items - raw JSON:API company resources
   */
  function setTagsCompanyUiMode(n, items) {
    items = items || [];
    var multi = el('tagsMultiCompanyControls');
    var singleNote = el('tagsSingleCompanyNote');
    var companiesPanel = el('tagsCompaniesPanel');
    var loadPropsBtn = el('tagsLoadPropertiesBtn');
    var loadAllBtn = el('tagsLoadAllBtn');
    if (n === 1) {
      if (multi) multi.hidden = true;
      if (companiesPanel) companiesPanel.hidden = true;
      if (loadPropsBtn) loadPropsBtn.hidden = true;
      if (singleNote) {
        var c0 = items[0];
        var nid = c0 && c0.id ? String(c0.id) : '';
        var nname = companyDisplayName(c0);
        singleNote.innerHTML =
          'Using company <strong>' +
          escapeHtml(nname) +
          '</strong> — <code>' +
          escapeHtml(nid) +
          '</code>. Use <strong>Load all properties</strong> below.';
        singleNote.hidden = false;
      }
      if (loadAllBtn) {
        loadAllBtn.classList.remove('btn-secondary');
        loadAllBtn.classList.add('btn-primary');
      }
    } else {
      if (multi) multi.hidden = false;
      if (companiesPanel) companiesPanel.hidden = false;
      if (loadPropsBtn) loadPropsBtn.hidden = false;
      if (singleNote) {
        singleNote.hidden = true;
        singleNote.textContent = '';
      }
      if (loadAllBtn) {
        loadAllBtn.classList.add('btn-secondary');
        loadAllBtn.classList.remove('btn-primary');
      }
    }
  }

  var tagsCompaniesFetchInFlight = false;

  async function fetchAndApplyTagsCompanies(opts) {
    opts = opts || {};
    if (tagsCompaniesFetchInFlight) return;
    tagsCompaniesFetchInFlight = true;
    setMsg(opts.loadingMsg || 'Loading companies…', '');
    clearTables();
    var refreshBtn = el('tagsLoadCompaniesBtn');
    var loadAllBtn = el('tagsLoadAllBtn');
    if (refreshBtn) refreshBtn.disabled = true;
    if (loadAllBtn) loadAllBtn.disabled = true;
    try {
      var res = await fetch(tagsApiUrl('companies'));
      var data = await res.json().catch(function () {
        return {};
      });
      if (!data.ok) {
        setMsg(data.error || data.detail || 'Request failed.', 'err');
        ingestCompaniesResponse({ items: [] });
        setTagsCompanyUiMode(0, []);
        return;
      }
      var items = ingestCompaniesResponse(data);
      setTagsCompanyUiMode(items.length, items);
      var suffix = data.pagesFetched ? ' · pages: ' + data.pagesFetched : '';
      setMsg(
        (opts.doneVerb || 'Loaded') +
          ' ' +
          items.length +
          ' compan' +
          (items.length === 1 ? 'y' : 'ies') +
          suffix +
          '.',
        'ok'
      );
    } catch (e) {
      setMsg(e.message || 'Network error', 'err');
      ingestCompaniesResponse({ items: [] });
      setTagsCompanyUiMode(0, []);
    } finally {
      tagsCompaniesFetchInFlight = false;
      if (refreshBtn) refreshBtn.disabled = false;
      if (loadAllBtn) loadAllBtn.disabled = false;
    }
  }

  function loadCompaniesManualRefresh() {
    fetchAndApplyTagsCompanies({ loadingMsg: 'Refreshing companies…', doneVerb: 'Refreshed' });
  }

  function bootstrapTagsCompanies() {
    fetchAndApplyTagsCompanies({ loadingMsg: 'Loading companies…', doneVerb: 'Loaded' });
  }

  async function loadCompanies() {
    loadCompaniesManualRefresh();
  }

  async function loadPropertiesForSelected() {
    var sel = el('tagsCompanySelect');
    var cid = sel && sel.value ? String(sel.value).trim() : '';
    if (!cid) {
      setMsg('Select a company first (load companies, then pick from the list).', 'err');
      return;
    }
    var opt = sel && sel.options[sel.selectedIndex];
    var cname = '';
    if (opt && opt.textContent) {
      var raw = String(opt.textContent);
      var idx = raw.lastIndexOf(' (');
      cname = idx > 0 ? raw.slice(0, idx).trim() : raw.trim();
    }
    setPropertiesHeadMode('one');
    setMsg('Loading properties…', '');
    hidePropertyExplorerPanel();
    el('tagsPropertiesBody').innerHTML = '';
    tagsPropertyCache = [];
    resetPropertyFilterUi();
    el('tagsLoadPropertiesBtn').disabled = true;
    try {
      var res = await fetch(tagsApiUrl('properties', cid));
      var data = await res.json().catch(function () {
        return {};
      });
      if (!data.ok) {
        setMsg(data.error || data.detail || 'Request failed.', 'err');
        return;
      }
      var items = data.items || [];
      items.forEach(function (p) {
        tagsPropertyCache.push(
          normalizePropertyResource(p, { companyId: cid, companyName: cname })
        );
      });
      rebuildPlatformDropdown();
      renderPropertiesFromCache();
      setMsg('Loaded ' + items.length + ' propert' + (items.length === 1 ? 'y' : 'ies') + ' for company ' + cid + '.', 'ok');
    } catch (e) {
      setMsg(e.message || 'Network error', 'err');
    } finally {
      el('tagsLoadPropertiesBtn').disabled = false;
    }
  }

  async function loadAllProperties() {
    var singleCompanyUi = el('tagsMultiCompanyControls') && el('tagsMultiCompanyControls').hidden;
    var confirmMsg = singleCompanyUi
      ? 'Load all Tag properties for this company? This may take a little while.'
      : 'This may take a while: it loads every Tag property for each company in your org. Continue?';
    if (!window.confirm(confirmMsg)) return;
    setPropertiesHeadMode('all');
    setMsg(singleCompanyUi ? 'Loading all properties…' : 'Loading all properties (all companies)…', '');
    hidePropertyExplorerPanel();
    el('tagsCompaniesBody').innerHTML = '';
    el('tagsPropertiesBody').innerHTML = '';
    tagsPropertyCache = [];
    resetPropertyFilterUi();
    el('tagsLoadAllBtn').disabled = true;
    try {
      var res = await fetch(tagsApiUrl('allProperties'));
      var data = await res.json().catch(function () {
        return {};
      });
      if (!data.ok) {
        setMsg(data.error || data.detail || 'Request failed.', 'err');
        return;
      }
      var rows = data.rows || [];
      rows.forEach(function (r) {
        var domains = Array.isArray(r.domains) ? r.domains : [];
        tagsPropertyCache.push({
          companyId: r.companyId != null ? String(r.companyId) : '',
          companyName: r.companyName != null ? String(r.companyName) : '',
          propertyId: r.propertyId != null ? String(r.propertyId) : '',
          propertyName: r.propertyName != null ? String(r.propertyName) : '',
          platform: r.platform != null ? String(r.platform) : '',
          development: r.development === true,
          domains: domains,
          domainsDisplay: domains.join(', '),
          createdAt: r.createdAt != null ? String(r.createdAt) : '',
          updatedAt: r.updatedAt != null ? String(r.updatedAt) : '',
          updatedBy: r.updatedBy != null ? String(r.updatedBy) : '',
        });
      });
      rebuildPlatformDropdown();
      renderPropertiesFromCache();
      var failNote = '';
      if (data.failures && data.failures.length) {
        failNote = ' · ' + data.failures.length + ' company fetch(es) failed (see server response).';
      }
      setMsg(
        'Loaded ' + rows.length + ' properties across ' + (data.companiesCount || 0) + ' companies.' + failNote,
        'ok'
      );
    } catch (e) {
      setMsg(e.message || 'Network error', 'err');
    } finally {
      el('tagsLoadAllBtn').disabled = false;
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function init() {
    var sb = el('sandboxSelect');
    if (sb && window.AepGlobalSandbox && AepGlobalSandbox.loadSandboxesIntoSelect) {
      window.AepGlobalSandbox.loadSandboxesIntoSelect(sb).then(function () {
        if (window.AepGlobalSandbox.onSandboxSelectChange) window.AepGlobalSandbox.onSandboxSelectChange(sb);
        bootstrapTagsCompanies();
      });
    } else {
      bootstrapTagsCompanies();
    }

    if (sb) {
      sb.addEventListener('change', function () {
        bootstrapTagsCompanies();
      });
    }

    if (el('tagsLoadCompaniesBtn')) el('tagsLoadCompaniesBtn').addEventListener('click', loadCompanies);
    if (el('tagsLoadPropertiesBtn')) el('tagsLoadPropertiesBtn').addEventListener('click', loadPropertiesForSelected);
    if (el('tagsLoadAllBtn')) el('tagsLoadAllBtn').addEventListener('click', loadAllProperties);

    var filt = el('tagsPropertiesFilter');
    if (filt) {
      filt.addEventListener('input', function () {
        renderPropertiesFromCache();
      });
    }
    var platF = el('tagsPropertiesPlatformFilter');
    if (platF) {
      platF.addEventListener('change', function () {
        renderPropertiesFromCache();
      });
    }

    var propBody = el('tagsPropertiesBody');
    if (propBody) {
      propBody.addEventListener('click', function (e) {
        var nameBtn = e.target && e.target.closest ? e.target.closest('.tags-property-name-btn') : null;
        if (!nameBtn || !propBody.contains(nameBtn)) return;
        e.preventDefault();
        e.stopPropagation();
        var tr = nameBtn.closest('tr.tags-property-row');
        if (!tr) return;
        var pid = tr.dataset.propertyId;
        if (!pid) return;
        openPropertyExplorerPanel(
          {
            propertyId: pid,
            propertyName: tr.dataset.propertyName || '',
            companyId: tr.dataset.companyId || '',
            companyName: tr.dataset.companyName || '',
          },
          null,
          false
        );
      });
      propBody.addEventListener('dblclick', function (e) {
        if (e.target && e.target.closest && e.target.closest('.tags-property-name-btn')) return;
        var tr = e.target && e.target.closest ? e.target.closest('tr.tags-property-row') : null;
        if (!tr || !propBody.contains(tr)) return;
        var pid = tr.dataset.propertyId;
        if (!pid) return;
        openPropertyExplorerPanel(
          {
            propertyId: pid,
            propertyName: tr.dataset.propertyName || '',
            companyId: tr.dataset.companyId || '',
            companyName: tr.dataset.companyName || '',
          },
          'dataElements',
          false
        );
      });
    }

    var explorerBody = el('tagsExplorerBody');
    if (explorerBody) {
      explorerBody.addEventListener('click', function (e) {
        var copyBtn = e.target && e.target.closest ? e.target.closest('.tags-env-copy-btn') : null;
        if (copyBtn && explorerBody.contains(copyBtn)) {
          e.preventDefault();
          var rawEnc = copyBtn.getAttribute('data-tags-script-url');
          if (!rawEnc) return;
          var url = '';
          try {
            url = decodeURIComponent(rawEnc);
          } catch (err) {
            url = rawEnc;
          }
          var wantAsync = copyBtn.getAttribute('data-tags-async') === '1';
          var snippet = environmentScriptSnippet(url, wantAsync);
          if (!snippet) return;
          var msg = el('tagsExplorerMsg');
          var flash = function (text, isErr) {
            if (!msg) return;
            msg.textContent = text;
            msg.hidden = false;
            msg.className =
              'consent-message consent-message--below-btn' + (isErr ? ' error' : ' success');
          };
          copyStringToClipboard(snippet)
            .then(function () {
              flash(
                wantAsync ? 'Copied async embed script to the clipboard.' : 'Copied embed script to the clipboard.',
                false
              );
            })
            .catch(function () {
              flash('Could not copy to the clipboard.', true);
            });
          return;
        }
        var b = e.target && e.target.closest ? e.target.closest('.tags-rule-components-btn') : null;
        if (!b || !explorerBody.contains(b)) return;
        e.preventDefault();
        var rid = b.getAttribute('data-rule-id');
        if (rid) loadRuleComponentsForRule(rid);
      });
    }

    if (el('tagsExplorerClose')) {
      el('tagsExplorerClose').addEventListener('click', hidePropertyExplorerPanel);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
