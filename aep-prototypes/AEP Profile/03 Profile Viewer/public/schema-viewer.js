/**
 * Schema / JSON shape viewer – horizontal tree (D3) with zoom and instance or JSON Schema sources.
 */
(function () {
  'use strict';

  const sourceSelect = document.getElementById('schemaSourceSelect');
  const sandboxSelect = document.getElementById('sandboxSelect');
  const registryRow = document.getElementById('schemaRegistryRow');
  const pasteRow = document.getElementById('schemaPasteRow');
  const schemaIdInput = document.getElementById('schemaIdInput');
  const loadBtn = document.getElementById('schemaLoadBtn');
  const pasteTextarea = document.getElementById('schemaPasteJson');
  const maxDepthInput = document.getElementById('schemaMaxDepth');
  const maxChildrenInput = document.getElementById('schemaMaxChildren');
  const statusEl = document.getElementById('schemaViewerStatus');
  const svgEl = document.getElementById('schemaTreeSvg');
  const zoomInBtn = document.getElementById('schemaZoomIn');
  const zoomOutBtn = document.getElementById('schemaZoomOut');
  const zoomResetBtn = document.getElementById('schemaZoomReset');

  const browseCountEl = document.getElementById('schemaBrowseCount');
  const tableBody = document.getElementById('schemaTableBody');
  const schemaBrowseTableWrap = document.getElementById('schemaBrowseTableWrap');
  const detailAside = document.getElementById('schemaDetailAside');
  const schemaSidebarClose = document.getElementById('schemaSidebarClose');
  const schemaDetailTitle = document.getElementById('schemaDetailTitle');
  const schemaDetailName = document.getElementById('schemaDetailName');
  const schemaDetailDescription = document.getElementById('schemaDetailDescription');
  const schemaDetailClass = document.getElementById('schemaDetailClass');
  const schemaDetailType = document.getElementById('schemaDetailType');
  const schemaDetailBehavior = document.getElementById('schemaDetailBehavior');
  const schemaDetailProfile = document.getElementById('schemaDetailProfile');
  const schemaDetailId = document.getElementById('schemaDetailId');
  const schemaDetailTimestamps = document.getElementById('schemaDetailTimestamps');
  const schemaCopyIdBtn = document.getElementById('schemaCopyIdBtn');
  const schemaCopyJsonBtn = document.getElementById('schemaCopyJsonBtn');

  let lastMode = 'sample';
  let zoomBehavior = null;
  /** Mutable copy of the tree for expand/collapse (double-click on branch nodes). */
  let schemaTreeMutable = null;
  let browseSchemas = [];
  let browseMeta = {};
  let selectedBrowseId = null;
  let browseSortKey = 'name';
  let browseSortDir = 'asc';
  let browseSortHeaderEls = null;
  const fullSchemaJsonCache = new Map();

  const overviewPanel = document.getElementById('schemaAepPanelOverview');
  const browsePanel = document.getElementById('schemaAepPanelBrowse');
  const datasetsPanel = document.getElementById('schemaAepPanelDatasets');
  const audiencesPanel = document.getElementById('schemaAepPanelAudiences');
  const datasetTableBody = document.getElementById('datasetTableBody');
  const datasetBrowseCount = document.getElementById('datasetBrowseCount');
  const audienceTableBody = document.getElementById('audienceTableBody');
  const audienceBrowseCount = document.getElementById('audienceBrowseCount');
  const audienceMembersPanel = document.getElementById('audienceMembersPanel');
  const audienceMembersTitle = document.getElementById('audienceMembersTitle');
  const audienceMembersMeta = document.getElementById('audienceMembersMeta');
  const audienceMembersBody = document.getElementById('audienceMembersBody');
  const audienceMembersClose = document.getElementById('audienceMembersClose');
  const overviewStatsStatus = document.getElementById('overviewStatsStatus');
  const overviewStatSchemas = document.getElementById('overviewStatSchemas');
  const overviewStatProfile = document.getElementById('overviewStatProfile');
  const overviewStatEvent = document.getElementById('overviewStatEvent');
  const overviewStatOther = document.getElementById('overviewStatOther');
  const overviewStatDatasets = document.getElementById('overviewStatDatasets');
  const dataViewerSearchWrap = document.getElementById('dataViewerSearchWrap');
  const dataViewerSearch = document.getElementById('dataViewerSearch');

  let currentAepTab = 'overview';
  let datasetRows = [];
  let datasetSortKey = 'name';
  let datasetSortDir = 'asc';
  let datasetSortHeaderEls = null;
  let audienceRows = [];
  let audienceSortKey = 'name';
  let audienceSortDir = 'asc';
  let audienceSortHeaderEls = null;
  /** Separate from shared #dataViewerSearch so a Datasets filter never hides Browse rows (and vice versa). */
  let browseFilterQuery = '';
  let datasetsFilterQuery = '';
  let audiencesFilterQuery = '';

  function setStatus(msg, isError) {
    if (!statusEl) return;
    statusEl.textContent = msg || '';
    statusEl.classList.toggle('schema-status--error', !!isError);
  }

  function fieldHighlight(name) {
    if (!name || name === 'root' || name === '…') return false;
    if (/id$/i.test(name) || /ID$/.test(name)) return true;
    if (/(^|[_])id$/i.test(name)) return true;
    const key = name.toLowerCase();
    return ['email', 'ecid', 'messageid', 'campaignid', 'decisionpolicyid'].includes(key);
  }

  function opts() {
    return {
      maxDepth: Math.max(1, parseInt(maxDepthInput?.value, 10) || 8),
      maxChildren: Math.max(1, parseInt(maxChildrenInput?.value, 10) || 32),
    };
  }

  function buildFromInstance(val, name, depth, o) {
    const hi = fieldHighlight(name);
    if (depth > o.maxDepth) {
      return { name, typeLabel: '…', children: [], highlight: hi };
    }
    if (val === null) return { name, typeLabel: 'null', children: [], highlight: hi };
    if (Array.isArray(val)) {
      if (val.length === 0) {
        return { name, typeLabel: 'array (empty)', children: [], highlight: hi };
      }
      const child = buildFromInstance(val[0], '[item]', depth + 1, o);
      return { name, typeLabel: 'array', children: [child], highlight: hi };
    }
    if (typeof val === 'object') {
      const keys = Object.keys(val);
      const slice = keys.slice(0, o.maxChildren);
      const children = slice.map((k) => buildFromInstance(val[k], k, depth + 1, o));
      if (keys.length > o.maxChildren) {
        children.push({
          name: '…',
          typeLabel: `${keys.length - o.maxChildren} more`,
          children: [],
          highlight: false,
        });
      }
      return { name, typeLabel: 'object', children, highlight: hi };
    }
    const t = typeof val;
    return { name, typeLabel: t, children: [], highlight: hi };
  }

  function mergeSchemaProps(node) {
    if (!node || typeof node !== 'object') return {};
    let merged = {};
    if (node.properties && typeof node.properties === 'object') {
      Object.assign(merged, node.properties);
    }
    if (Array.isArray(node.allOf)) {
      for (const part of node.allOf) {
        if (part && typeof part === 'object' && part.properties) {
          Object.assign(merged, part.properties);
        }
      }
    }
    return merged;
  }

  function typeFromSchemaFragment(node) {
    if (!node || typeof node !== 'object') return 'unknown';
    const meta = node['meta:xdmType'] || node['meta']?.['xdm:type'];
    const t = node.type;
    if (meta) return String(meta);
    if (Array.isArray(t)) return t.join(' | ');
    if (t) return String(t);
    if (node.properties || node.allOf) return 'object';
    if (node.items) return 'array';
    if (node.$ref) return '$ref';
    return 'object';
  }

  function buildFromJsonSchema(node, name, depth, o) {
    const hi = fieldHighlight(name);
    if (depth > o.maxDepth) {
      return { name, typeLabel: '…', children: [], highlight: hi };
    }
    if (!node || typeof node !== 'object') {
      return { name, typeLabel: 'unknown', children: [], highlight: hi };
    }
    if (node.$ref && !node.properties && !node.items) {
      const ref = typeof node.$ref === 'string' ? node.$ref : JSON.stringify(node.$ref);
      return { name, typeLabel: `ref`, children: [{ name: ref, typeLabel: '', children: [] }], highlight: hi };
    }

    const props = mergeSchemaProps(node);
    const keys = Object.keys(props);
    if (keys.length > 0) {
      const slice = keys.slice(0, o.maxChildren);
      const children = slice.map((k) => buildFromJsonSchema(props[k], k, depth + 1, o));
      if (keys.length > o.maxChildren) {
        children.push({
          name: '…',
          typeLabel: `${keys.length - o.maxChildren} more`,
          children: [],
          highlight: false,
        });
      }
      const tl = typeFromSchemaFragment(node);
      return { name, typeLabel: tl, children, highlight: hi };
    }

    const tl = typeFromSchemaFragment(node);
    if (node.items && typeof node.items === 'object') {
      const child = buildFromJsonSchema(node.items, 'items', depth + 1, o);
      return { name, typeLabel: tl === 'object' ? 'array' : tl, children: [child], highlight: hi };
    }

    return { name, typeLabel: tl, children: [], highlight: hi };
  }

  function normalizeSchemaInput(obj) {
    if (!obj || typeof obj !== 'object') return { rootName: 'schema', node: {} };
    if (obj.properties || obj.allOf) return { rootName: 'schema', node: obj };
    const keys = Object.keys(obj).filter((k) => !k.startsWith('$'));
    if (keys.length === 1 && obj[keys[0]] && typeof obj[keys[0]] === 'object') {
      return { rootName: keys[0], node: obj[keys[0]] };
    }
    return { rootName: 'schema', node: obj };
  }

  function treeDatumHasBranch(d) {
    const dd = d.data;
    return (
      (Array.isArray(dd.children) && dd.children.length > 0) ||
      (Array.isArray(dd._children) && dd._children.length > 0)
    );
  }

  function toggleTreeDatum(dd) {
    if (!dd || typeof dd !== 'object') return;
    if (Array.isArray(dd._children) && dd._children.length > 0) {
      dd.children = dd._children;
      delete dd._children;
      return;
    }
    if (Array.isArray(dd.children) && dd.children.length > 0) {
      dd._children = dd.children;
      delete dd.children;
    }
  }

  function hierarchyChildrenAccessor(d) {
    if (Array.isArray(d.children) && d.children.length > 0) return d.children;
    return null;
  }

  /** Dot-notation path for XDM / JSON (e.g. _demoemea.identification.core.email). Drops synthetic root wrappers. */
  function buildSchemaFieldPath(hierarchyNode) {
    if (!hierarchyNode || !hierarchyNode.data) return '';
    const names = hierarchyNode
      .ancestors()
      .reverse()
      .map((n) => (n.data && n.data.name != null ? String(n.data.name) : ''))
      .filter(Boolean);
    while (names.length && (names[0] === 'schema' || names[0] === 'root')) names.shift();
    return names.join('.');
  }

  function copySchemaPathToClipboard(path) {
    if (!path) return;
    const done = () => setStatus(`Copied: ${path}`);
    const fail = () => setStatus('Could not copy to clipboard', true);
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(path).then(done).catch(fail);
    } else {
      try {
        const ta = document.createElement('textarea');
        ta.value = path;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        done();
      } catch {
        fail();
      }
    }
  }

  function drawSchemaTree() {
    if (!schemaTreeMutable || !svgEl) return;

    const width = svgEl.clientWidth || 1100;
    let height = svgEl.clientHeight;
    if (!height || height < 120) {
      height = parseInt(svgEl.getAttribute('height'), 10) || 0;
    }
    if (!height || height < 120) {
      height = Math.max(520, Math.round(window.innerHeight * 0.72));
    }
    const margin = { top: 24, right: 120, bottom: 24, left: 24 };

    d3.select(svgEl).selectAll('*').remove();

    const root = d3.hierarchy(schemaTreeMutable, hierarchyChildrenAccessor);
    const treeLayout = d3.tree().nodeSize([32, 200]);
    treeLayout(root);

    let xMin = Infinity;
    let xMax = -Infinity;
    let yMin = Infinity;
    let yMax = -Infinity;
    root.each((d) => {
      if (d.x < xMin) xMin = d.x;
      if (d.x > xMax) xMax = d.x;
      if (d.y < yMin) yMin = d.y;
      if (d.y > yMax) yMax = d.y;
    });

    const single = !root.children || root.children.length === 0;
    if (!Number.isFinite(xMin) || single) {
      xMin = xMax = 0;
      yMin = yMax = 0;
    }

    const tw = Math.max(yMax - yMin, 40) + margin.left + margin.right + 80;
    const th = Math.max(xMax - xMin, 40) + margin.top + margin.bottom + 80;

    const svg = d3
      .select(svgEl)
      .attr('viewBox', [0, 0, Math.max(tw, width), Math.max(th, height)])
      .attr('width', '100%')
      .attr('height', height);

    const gZoom = svg.append('g').attr('class', 'schema-zoom-layer');
    const gMain = gZoom.append('g').attr('class', 'schema-tree-root');

    const linkGen = d3
      .linkHorizontal()
      .x((d) => d.y)
      .y((d) => d.x);

    gMain
      .append('g')
      .attr('class', 'schema-links')
      .attr('fill', 'none')
      .selectAll('path')
      .data(root.links())
      .join('path')
      .attr('class', 'schema-link')
      .attr('d', (d) => linkGen({ source: d.source, target: d.target }));

    const nodeGs = gMain
      .append('g')
      .selectAll('g')
      .data(root.descendants())
      .join('g')
      .attr('class', 'schema-node')
      .attr('transform', (d) => `translate(${d.y},${d.x})`);

    nodeGs
      .append('circle')
      .attr('r', 6)
      .attr('fill', (d) => (treeDatumHasBranch(d) ? '#fff' : '#1473e6'))
      .attr('stroke', '#1473e6')
      .attr('stroke-width', (d) => (treeDatumHasBranch(d) ? 2 : 0))
      .style('cursor', 'pointer')
      .attr(
        'title',
        'Click: copy field path · Double-click (branches): expand or collapse'
      )
      .on('click', (event, d) => {
        event.stopPropagation();
        if (event.detail !== 1) return;
        const path = buildSchemaFieldPath(d);
        if (path) copySchemaPathToClipboard(path);
      })
      .on('dblclick', (event, d) => {
        event.stopPropagation();
        event.preventDefault();
        if (!treeDatumHasBranch(d)) return;
        toggleTreeDatum(d.data);
        drawSchemaTree();
      });

    nodeGs.each(function (d) {
      const el = d3.select(this);
      const dat = d.data;
      const label = `${dat.name}${dat.typeLabel ? ` : ${dat.typeLabel}` : ''}`;
      const approxW = Math.min(280, 8 + label.length * 6.2);
      const h = 20;
      if (dat.highlight) {
        el.insert('rect', 'circle')
          .attr('class', 'schema-pill')
          .attr('x', 12)
          .attr('y', -h / 2)
          .attr('width', approxW)
          .attr('height', h)
          .attr('rx', 10)
          .attr('ry', 10);
      }
      el.append('text')
        .attr('dx', 14)
        .attr('dy', 0)
        .attr('fill', '#2c2c2c')
        .attr('pointer-events', 'none')
        .text(label);
    });

    const safeN = (n) => (typeof n === 'number' && Number.isFinite(n) ? n : 0);
    const zx = safeN(margin.left - yMin + 40);
    const zy = safeN(margin.top - xMin + 40);
    gMain.attr('transform', `translate(${zx},${zy})`);

    zoomBehavior = d3
      .zoom()
      .scaleExtent([0.02, 96])
      .on('zoom', (event) => {
        gZoom.attr('transform', event.transform.toString());
      });

    svg.call(zoomBehavior);
    svg.call(zoomBehavior.transform, d3.zoomIdentity);
  }

  function renderTree(dataRoot) {
    try {
      schemaTreeMutable = JSON.parse(JSON.stringify(dataRoot));
    } catch {
      schemaTreeMutable = dataRoot;
    }
    drawSchemaTree();
  }

  function loadOperationalSample() {
    setStatus('Loading operational sample…');
    fetch('/api/schema-viewer/operational-sample')
      .then((r) => {
        if (!r.ok) throw new Error(r.statusText);
        return r.json();
      })
      .then((json) => {
        const o = opts();
        const tree = buildFromInstance(json, 'root', 0, o);
        renderTree(tree);
        setStatus(`Operational profile sample · max depth ${o.maxDepth}, max ${o.maxChildren} children per object`);
      })
      .catch((e) => setStatus(e.message || 'Failed to load sample', true));
  }

  /** Same as Profile Viewer – value only (empty = default sandbox from env). */
  function getSandboxQuery() {
    const val = sandboxSelect?.value?.trim();
    return val || '';
  }

  function formatCatalogTs(val) {
    if (val == null || val === '') return '—';
    if (typeof val === 'number' && Number.isFinite(val)) {
      try {
        return new Date(val).toLocaleString();
      } catch {
        return String(val);
      }
    }
    const n = Number(val);
    if (Number.isFinite(n) && String(val).trim() === String(n)) {
      try {
        return new Date(n).toLocaleString();
      } catch {
        /* fall through */
      }
    }
    const d = Date.parse(String(val));
    if (!Number.isNaN(d)) return new Date(d).toLocaleString();
    return String(val);
  }

  function setOverviewStatsMessage(msg, isError) {
    if (!overviewStatsStatus) return;
    overviewStatsStatus.textContent = msg || '';
    overviewStatsStatus.classList.toggle('schema-status--error', !!isError);
  }

  function buildQuery(extra) {
    const sandbox = getSandboxQuery();
    const params = new URLSearchParams();
    if (sandbox) params.set('sandbox', sandbox);
    if (extra) Object.entries(extra).forEach(([k, v]) => { if (v != null) params.set(k, v); });
    const s = params.toString();
    return s ? `?${s}` : '';
  }

  function cacheLabel(res) {
    const age = res.headers?.get?.('age');
    if (age && Number(age) > 0) return ` (cached ${age}s ago)`;
    return ' (live)';
  }

  async function loadOverviewStats(forceRefresh) {
    if (!overviewStatSchemas) return;
    const q = buildQuery(forceRefresh ? { refresh: 'true' } : null);
    setOverviewStatsMessage('Loading overview…');
    overviewStatSchemas.textContent = '…';
    overviewStatProfile.textContent = '…';
    overviewStatEvent.textContent = '…';
    overviewStatOther.textContent = '…';
    overviewStatDatasets.textContent = '…';
    try {
      const r = await fetch(`/api/schema-viewer/overview-stats${q}`);
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || 'Overview request failed');
      overviewStatSchemas.textContent = String(body.schemaCount ?? 0);
      overviewStatProfile.textContent = String(body.profileSchemaCount ?? 0);
      overviewStatEvent.textContent = String(body.eventSchemaCount ?? 0);
      overviewStatOther.textContent = String(body.otherSchemaCount ?? 0);
      overviewStatDatasets.textContent = String(body.datasetCount ?? 0);
      const src = body.schemaListSource ? ` · ${body.schemaListSource}` : '';
      setOverviewStatsMessage(
        `Sandbox “${body.sandbox || 'default'}”${src}${cacheLabel(r)}.`,
      );
    } catch (e) {
      setOverviewStatsMessage(e.message || 'Could not load overview', true);
      overviewStatSchemas.textContent = '—';
      overviewStatProfile.textContent = '—';
      overviewStatEvent.textContent = '—';
      overviewStatOther.textContent = '—';
      overviewStatDatasets.textContent = '—';
    }
  }

  function getDatasetFilter() {
    return datasetsFilterQuery.trim().toLowerCase();
  }

  function filteredDatasetRows() {
    const q = getDatasetFilter();
    if (!q) return datasetRows;
    return datasetRows.filter((d) => {
      const n = (d.name || '').toLowerCase();
      const id = (d.id || '').toLowerCase();
      const sid = (d.schemaId || '').toLowerCase();
      const st = (d.schemaTitle || '').toLowerCase();
      return n.includes(q) || id.includes(q) || sid.includes(q) || st.includes(q);
    });
  }

  function datasetTs(val) {
    if (val == null || val === '') return null;
    const n = Number(val);
    if (Number.isFinite(n)) return n;
    const d = Date.parse(String(val));
    return Number.isNaN(d) ? null : d;
  }

  function getDatasetSortHeaders() {
    if (!datasetSortHeaderEls) {
      const table = document.getElementById('datasetBrowseTable');
      datasetSortHeaderEls = table ? Array.from(table.querySelectorAll('thead th[data-ds-sort]')) : [];
    }
    return datasetSortHeaderEls;
  }

  function datasetSortValue(d, key) {
    switch (key) {
      case 'name':
        return (d.name || d.id || '').toLowerCase();
      case 'schemaTitle':
        return (d.schemaTitle || d.schemaId || '').toLowerCase();
      case 'created':
        return datasetTs(d.created);
      case 'updated':
        return datasetTs(d.updated);
      default:
        return '';
    }
  }

  function idCompareDataset(a, b) {
    return String(a.id || '').localeCompare(String(b.id || ''));
  }

  function compareDatasetRows(a, b) {
    const va = datasetSortValue(a, datasetSortKey);
    const vb = datasetSortValue(b, datasetSortKey);
    const aNull = va == null || va === '' || (typeof va === 'number' && !Number.isFinite(va));
    const bNull = vb == null || vb === '' || (typeof vb === 'number' && !Number.isFinite(vb));
    if (aNull && bNull) return idCompareDataset(a, b);
    if (aNull) return 1;
    if (bNull) return -1;
    let c = 0;
    if (typeof va === 'number' && typeof vb === 'number') c = va - vb;
    else c = String(va).localeCompare(String(vb), undefined, { sensitivity: 'base' });
    if (datasetSortDir === 'desc') c = -c;
    if (c !== 0) return c;
    return idCompareDataset(a, b);
  }

  function updateDatasetSortHeaders() {
    getDatasetSortHeaders().forEach((th) => {
      const key = th.getAttribute('data-ds-sort');
      const ind = th.querySelector('.schema-aep-sort-ind');
      if (key === datasetSortKey) {
        th.setAttribute('aria-sort', datasetSortDir === 'asc' ? 'ascending' : 'descending');
        if (ind) ind.textContent = datasetSortDir === 'asc' ? '▲' : '▼';
      } else {
        th.setAttribute('aria-sort', 'none');
        if (ind) ind.textContent = '';
      }
    });
  }

  function onDatasetSortHeaderActivate(th) {
    const key = th.getAttribute('data-ds-sort');
    if (!key) return;
    if (datasetSortKey === key) datasetSortDir = datasetSortDir === 'asc' ? 'desc' : 'asc';
    else {
      datasetSortKey = key;
      datasetSortDir = 'asc';
    }
    renderDatasetTable();
  }

  function initDatasetTableSort() {
    getDatasetSortHeaders().forEach((th) => {
      th.addEventListener('click', (e) => {
        e.stopPropagation();
        onDatasetSortHeaderActivate(th);
      });
      th.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onDatasetSortHeaderActivate(th);
        }
      });
    });
  }

  function renderDatasetTable() {
    if (!datasetTableBody) return;
    datasetTableBody.innerHTML = '';
    const rows = filteredDatasetRows().slice().sort(compareDatasetRows);
    updateDatasetSortHeaders();
    if (datasetBrowseCount) {
      const total = datasetRows.length;
      const shown = rows.length;
      const q = getDatasetFilter();
      if (total === 0) datasetBrowseCount.textContent = 'No datasets loaded.';
      else if (q && shown !== total) {
        datasetBrowseCount.textContent = `Showing ${shown} of ${total} dataset${total === 1 ? '' : 's'}`;
      } else {
        datasetBrowseCount.textContent = `${total} dataset${total === 1 ? '' : 's'} in this sandbox`;
      }
    }
    rows.forEach((d) => {
      const tr = document.createElement('tr');
      const tdCb = document.createElement('td');
      tdCb.className = 'schema-aep-td-cb';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.disabled = true;
      cb.title = 'Selection is not available in this local viewer';
      tdCb.appendChild(cb);
      tr.appendChild(tdCb);

      const tdName = document.createElement('td');
      const nameSpan = document.createElement('span');
      nameSpan.className = 'schema-aep-dataset-link schema-aep-dataset-link--name';
      nameSpan.textContent = d.name || '—';
      nameSpan.title = d.id || '';
      tdName.appendChild(nameSpan);
      tr.appendChild(tdName);

      const tdAct = document.createElement('td');
      tdAct.className = 'schema-aep-td-actions';
      const more = document.createElement('span');
      more.className = 'schema-aep-row-more';
      more.textContent = '⋯';
      more.title = 'Use Experience Platform for dataset actions';
      tdAct.appendChild(more);
      tr.appendChild(tdAct);

      const tdCr = document.createElement('td');
      tdCr.textContent = formatCatalogTs(d.created);
      tr.appendChild(tdCr);

      const tdSrc = document.createElement('td');
      tdSrc.className = 'schema-aep-td-source';
      const srcIc = document.createElement('span');
      srcIc.className = 'schema-aep-source-ic';
      srcIc.setAttribute('aria-hidden', 'true');
      srcIc.textContent = '▤';
      tdSrc.appendChild(srcIc);
      tdSrc.appendChild(document.createTextNode(' Schema'));
      tr.appendChild(tdSrc);

      const tdSch = document.createElement('td');
      const schBtn = document.createElement('button');
      schBtn.type = 'button';
      schBtn.className = 'schema-aep-dataset-link schema-aep-dataset-link--action';
      schBtn.textContent = d.schemaTitle || d.schemaId || '—';
      schBtn.title = d.schemaId || '';
      schBtn.disabled = !d.schemaId;
      if (d.schemaId) {
        schBtn.addEventListener('click', () => {
          setAepTab('browse', { openSchemaId: d.schemaId });
        });
      }
      tdSch.appendChild(schBtn);
      tr.appendChild(tdSch);

      const tdUp = document.createElement('td');
      tdUp.textContent = formatCatalogTs(d.updated);
      tr.appendChild(tdUp);

      datasetTableBody.appendChild(tr);
    });
  }

  async function loadDatasetsFromApi(forceRefresh) {
    if (!datasetTableBody) return;
    const q = buildQuery(forceRefresh ? { refresh: 'true' } : null);
    datasetTableBody.innerHTML = '';
    if (dataViewerSearch) dataViewerSearch.disabled = true;
    if (datasetBrowseCount) datasetBrowseCount.textContent = 'Loading datasets…';
    try {
      const r = await fetch(`/api/schema-viewer/datasets${q}`);
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || 'Failed to list datasets');
      datasetRows = body.datasets || [];
      renderDatasetTable();
      setStatus(`Datasets: ${body.count ?? datasetRows.length} in sandbox “${body.sandbox || 'default'}”.`);
    } catch (e) {
      datasetRows = [];
      renderDatasetTable();
      if (datasetBrowseCount) datasetBrowseCount.textContent = e.message || 'Error';
      setStatus(e.message || 'Could not load datasets', true);
    } finally {
      if (dataViewerSearch) dataViewerSearch.disabled = false;
    }
  }

  function formatAudienceDisplayTs(ms) {
    if (ms == null || !Number.isFinite(Number(ms))) return '—';
    try {
      return new Date(Number(ms)).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return '—';
    }
  }

  function evalChannelOn(info, key) {
    if (!info || typeof info !== 'object') return false;
    const block = info[key];
    if (!block || typeof block !== 'object') return false;
    return block.enabled === true || block.enable === true;
  }

  function evalChannelCount(info) {
    return ['batch', 'continuous', 'synchronous'].filter((k) => evalChannelOn(info, k)).length;
  }

  function buildAudienceBreakdownCell(info) {
    const wrap = document.createElement('div');
    wrap.className = 'schema-aep-audience-breakdown';
    const batch = evalChannelOn(info, 'batch');
    const stream = evalChannelOn(info, 'continuous');
    const edge = evalChannelOn(info, 'synchronous');
    wrap.title = `Batch ${batch ? 'on' : 'off'} · Streaming ${stream ? 'on' : 'off'} · Edge ${edge ? 'on' : 'off'}`;
    const labels = ['Batch', 'Streaming', 'Edge'];
    const states = [batch, stream, edge];
    states.forEach((on, i) => {
      const seg = document.createElement('span');
      seg.className =
        'schema-aep-audience-breakdown-seg' + (on ? ' schema-aep-audience-breakdown-seg--on' : '');
      seg.title = labels[i];
      wrap.appendChild(seg);
    });
    return wrap;
  }

  function getAudienceFilter() {
    return audiencesFilterQuery.trim().toLowerCase();
  }

  function filteredAudienceRows() {
    const q = getAudienceFilter();
    if (!q) return audienceRows;
    return audienceRows.filter((a) => {
      const n = (a.name || '').toLowerCase();
      const id = (a.id || '').toLowerCase();
      const o = (a.originLabel || '').toLowerCase();
      const t = (a.tagsLabel || '').toLowerCase();
      return n.includes(q) || id.includes(q) || o.includes(q) || t.includes(q);
    });
  }

  function audienceTs(ms) {
    if (ms == null || ms === '') return null;
    const n = Number(ms);
    return Number.isFinite(n) ? n : null;
  }

  function getAudienceSortHeaders() {
    if (!audienceSortHeaderEls) {
      const table = document.getElementById('audienceBrowseTable');
      audienceSortHeaderEls = table ? Array.from(table.querySelectorAll('thead th[data-au-sort]')) : [];
    }
    return audienceSortHeaderEls;
  }

  function audienceSortValue(a, key) {
    switch (key) {
      case 'name':
        return (a.name || a.id || '').toLowerCase();
      case 'profileCount':
        if (a.profileCount != null && Number.isFinite(Number(a.profileCount))) return Number(a.profileCount);
        return null;
      case 'originLabel':
        return (a.originLabel || '').toLowerCase();
      case 'created':
        return audienceTs(a.creationMs);
      case 'updated':
        return audienceTs(a.updateMs);
      case 'id':
        return (a.id || '').toLowerCase();
      case 'tags':
        return (a.tagsLabel || '').toLowerCase();
      case 'breakdown':
        return evalChannelCount(a.evaluationInfo);
      default:
        return '';
    }
  }

  function idCompareAudience(a, b) {
    return String(a.id || '').localeCompare(String(b.id || ''));
  }

  function compareAudienceRows(a, b) {
    const va = audienceSortValue(a, audienceSortKey);
    const vb = audienceSortValue(b, audienceSortKey);
    const aNull = va == null || (typeof va === 'number' && !Number.isFinite(va));
    const bNull = vb == null || (typeof vb === 'number' && !Number.isFinite(vb));
    if (aNull && bNull) return idCompareAudience(a, b);
    if (aNull) return 1;
    if (bNull) return -1;
    let c = 0;
    if (typeof va === 'number' && typeof vb === 'number') c = va - vb;
    else c = String(va).localeCompare(String(vb), undefined, { sensitivity: 'base' });
    if (audienceSortDir === 'desc') c = -c;
    if (c !== 0) return c;
    return idCompareAudience(a, b);
  }

  function updateAudienceSortHeaders() {
    getAudienceSortHeaders().forEach((th) => {
      const key = th.getAttribute('data-au-sort');
      const ind = th.querySelector('.schema-aep-sort-ind');
      if (key === audienceSortKey) {
        th.setAttribute('aria-sort', audienceSortDir === 'asc' ? 'ascending' : 'descending');
        if (ind) ind.textContent = audienceSortDir === 'asc' ? '▲' : '▼';
      } else {
        th.setAttribute('aria-sort', 'none');
        if (ind) ind.textContent = '';
      }
    });
  }

  function onAudienceSortHeaderActivate(th) {
    const key = th.getAttribute('data-au-sort');
    if (!key) return;
    if (audienceSortKey === key) audienceSortDir = audienceSortDir === 'asc' ? 'desc' : 'asc';
    else {
      audienceSortKey = key;
      audienceSortDir = 'asc';
    }
    renderAudienceTable();
  }

  async function loadAudienceMembersPreview(audienceRow) {
    if (!audienceMembersPanel || !audienceMembersTitle || !audienceMembersMeta || !audienceMembersBody) return;
    const id = audienceRow && audienceRow.id;
    if (!id) return;
    audienceMembersPanel.hidden = false;
    audienceMembersTitle.textContent = `Members (sample): ${(audienceRow.name && String(audienceRow.name)) || id}`;
    audienceMembersMeta.textContent =
      'Running Segmentation preview job… This can take up to about a minute for large audiences.';
    audienceMembersBody.innerHTML = '';
    const sandbox = getSandboxQuery();
    const q = new URLSearchParams({ audienceId: id });
    if (sandbox) q.set('sandbox', sandbox);
    try {
      const r = await fetch(`/api/schema-viewer/audience-members?${q}`);
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || 'Request failed');
      const n = body.memberCount != null ? body.memberCount : (body.members && body.members.length) || 0;
      audienceMembersMeta.textContent = `Sandbox: ${body.sandbox || '—'}. Sample rows in this response: ${n}. ${body.note || ''}`;
      const members = Array.isArray(body.members) ? body.members : [];
      if (members.length === 0) {
        audienceMembersBody.innerHTML =
          '<p>No sample rows returned. The audience may be empty, or the preview returned no identities yet.</p>';
        setStatus(`Preview ready: 0 sample members for “${body.audienceName || id}”.`);
        return;
      }
      const table = document.createElement('table');
      table.className = 'schema-aep-audience-members__table';
      const thead = document.createElement('thead');
      thead.innerHTML = '<tr><th>Identity / object</th><th>Profile API link</th></tr>';
      table.appendChild(thead);
      const tb = document.createElement('tbody');
      members.forEach((m) => {
        const tr = document.createElement('tr');
        const td1 = document.createElement('td');
        const c1 = document.createElement('code');
        c1.textContent = (m && m.objectId) || '—';
        td1.appendChild(c1);
        const td2 = document.createElement('td');
        td2.className = 'schema-aep-audience-members__href';
        if (m && m.profileHref) {
          const a = document.createElement('a');
          a.href = m.profileHref;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.textContent = 'Open API URL';
          a.title = m.profileHref;
          td2.appendChild(a);
        } else {
          td2.textContent = '—';
        }
        tr.appendChild(td1);
        tr.appendChild(td2);
        tb.appendChild(tr);
      });
      table.appendChild(tb);
      audienceMembersBody.appendChild(table);
      setStatus(`Loaded ${members.length} sample member row(s) for “${body.audienceName || id}”.`);
    } catch (e) {
      audienceMembersMeta.textContent = e.message || 'Error';
      audienceMembersBody.innerHTML = '';
      setStatus(e.message || 'Audience preview failed', true);
    }
  }

  function initAudienceTableSort() {
    getAudienceSortHeaders().forEach((th) => {
      th.addEventListener('click', (e) => {
        e.stopPropagation();
        onAudienceSortHeaderActivate(th);
      });
      th.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onAudienceSortHeaderActivate(th);
        }
      });
    });
  }

  function renderAudienceTable() {
    if (!audienceTableBody) return;
    audienceTableBody.innerHTML = '';
    const rows = filteredAudienceRows().slice().sort(compareAudienceRows);
    updateAudienceSortHeaders();
    if (audienceBrowseCount) {
      const total = audienceRows.length;
      const shown = rows.length;
      const q = getAudienceFilter();
      if (total === 0) audienceBrowseCount.textContent = 'No audiences loaded.';
      else if (q && shown !== total) {
        audienceBrowseCount.textContent = `Showing ${shown} of ${total} audience${total === 1 ? '' : 's'}`;
      } else {
        audienceBrowseCount.textContent = `${total} audience${total === 1 ? '' : 's'} in this sandbox`;
      }
    }
    rows.forEach((a) => {
      const tr = document.createElement('tr');

      const tdCb = document.createElement('td');
      tdCb.className = 'schema-aep-td-cb';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.disabled = true;
      cb.title = 'Selection is not available in this local viewer';
      tdCb.appendChild(cb);
      tr.appendChild(tdCb);

      const tdName = document.createElement('td');
      const nameSpan = document.createElement('span');
      nameSpan.className =
        'schema-aep-dataset-link schema-aep-dataset-link--name schema-aep-audience-name schema-aep-audience-name--clickable';
      nameSpan.textContent = a.name || '—';
      nameSpan.title = a.id ? 'Click to load a sample of members (Segmentation preview API)' : '';
      if (a.id) {
        nameSpan.setAttribute('role', 'button');
        nameSpan.tabIndex = 0;
        nameSpan.addEventListener('click', (e) => {
          e.preventDefault();
          loadAudienceMembersPreview(a);
        });
        nameSpan.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            loadAudienceMembersPreview(a);
          }
        });
      }
      tdName.appendChild(nameSpan);
      tr.appendChild(tdName);

      const tdAct = document.createElement('td');
      tdAct.className = 'schema-aep-td-actions';
      const more = document.createElement('span');
      more.className = 'schema-aep-row-more';
      more.textContent = '⋯';
      more.title = 'Use Experience Platform for audience actions';
      tdAct.appendChild(more);
      tr.appendChild(tdAct);

      const tdPc = document.createElement('td');
      tdPc.className = 'schema-aep-td-profile-count';
      tdPc.textContent =
        a.profileCount != null && Number.isFinite(Number(a.profileCount)) ? String(a.profileCount) : '—';
      tr.appendChild(tdPc);

      const tdOrig = document.createElement('td');
      tdOrig.textContent = a.originLabel || '—';
      tr.appendChild(tdOrig);

      const tdCr = document.createElement('td');
      tdCr.textContent = formatAudienceDisplayTs(a.creationMs);
      tr.appendChild(tdCr);

      const tdUp = document.createElement('td');
      tdUp.textContent = formatAudienceDisplayTs(a.updateMs);
      tr.appendChild(tdUp);

      const tdId = document.createElement('td');
      const idCode = document.createElement('code');
      idCode.className = 'schema-aep-audience-id';
      idCode.textContent = a.id || '—';
      idCode.title = a.id ? 'Click to copy' : '';
      if (a.id) {
        idCode.style.cursor = 'pointer';
        idCode.addEventListener('click', () => {
          navigator.clipboard.writeText(a.id).then(
            () => setStatus('Audience ID copied.'),
            () => setStatus('Could not copy ID.', true),
          );
        });
      }
      tdId.appendChild(idCode);
      tr.appendChild(tdId);

      const tdTags = document.createElement('td');
      tdTags.className = 'schema-aep-td-tags';
      tdTags.textContent = a.tagsLabel || '';
      tdTags.title = a.tagsLabel || '';
      tr.appendChild(tdTags);

      const tdBr = document.createElement('td');
      tdBr.className = 'schema-aep-td-breakdown';
      tdBr.appendChild(buildAudienceBreakdownCell(a.evaluationInfo));
      tr.appendChild(tdBr);

      audienceTableBody.appendChild(tr);
    });
  }

  async function loadAudiencesFromApi(forceRefresh) {
    if (!audienceTableBody) return;
    const q = buildQuery(forceRefresh ? { refresh: 'true' } : null);
    audienceTableBody.innerHTML = '';
    if (dataViewerSearch) dataViewerSearch.disabled = true;
    if (audienceBrowseCount) audienceBrowseCount.textContent = 'Loading audiences…';
    try {
      const r = await fetch(`/api/schema-viewer/audiences${q}`);
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || 'Failed to list audiences');
      audienceRows = body.audiences || [];
      renderAudienceTable();
      setStatus(`Audiences: ${body.count ?? audienceRows.length} in sandbox “${body.sandbox || 'default'}”.`);
    } catch (e) {
      audienceRows = [];
      renderAudienceTable();
      if (audienceBrowseCount) audienceBrowseCount.textContent = e.message || 'Error';
      setStatus(e.message || 'Could not load audiences', true);
    } finally {
      if (dataViewerSearch) dataViewerSearch.disabled = false;
    }
  }

  function setAepTab(tab, opts) {
    currentAepTab = tab;
    if (tab !== 'audiences' && audienceMembersPanel) audienceMembersPanel.hidden = true;
    document.querySelectorAll('[data-aep-tab]').forEach((el) => {
      const t = el.getAttribute('data-aep-tab');
      const active = t === tab;
      el.classList.toggle('schema-aep-tab--active', active);
      if (el instanceof HTMLButtonElement) {
        if (active) el.setAttribute('aria-current', 'page');
        else el.removeAttribute('aria-current');
      }
    });

    const onBrowseLike = tab === 'browse';

    if (overviewPanel) overviewPanel.hidden = tab !== 'overview';
    if (browsePanel) browsePanel.hidden = !onBrowseLike;
    if (datasetsPanel) datasetsPanel.hidden = tab !== 'datasets';
    if (audiencesPanel) audiencesPanel.hidden = tab !== 'audiences';

    if (browseCountEl) {
      if (tab === 'browse') browseCountEl.removeAttribute('hidden');
      else browseCountEl.setAttribute('hidden', '');
    }
    if (schemaBrowseTableWrap) schemaBrowseTableWrap.hidden = tab !== 'browse';

    if (dataViewerSearchWrap) {
      dataViewerSearchWrap.hidden = !onBrowseLike && tab !== 'datasets' && tab !== 'audiences';
    }

    if (dataViewerSearch) {
      if (tab === 'browse') dataViewerSearch.value = browseFilterQuery;
      else if (tab === 'datasets') dataViewerSearch.value = datasetsFilterQuery;
      else if (tab === 'audiences') dataViewerSearch.value = audiencesFilterQuery;
    }

    if (tab === 'overview') {
      loadOverviewStats();
    } else if (tab === 'browse') {
      const openId = (opts && opts.openSchemaId && String(opts.openSchemaId).trim()) || '';
      refreshBrowseFromApi().then(() => {
        syncSourceUI();
        if (openId) {
          loadRegistryById(openId);
          return;
        }
        const v = sourceSelect?.value;
        if (v === 'sample') loadOperationalSample();
        else if (isSandboxSchemaValue(v)) loadRegistryById(v);
      });
    } else if (tab === 'datasets') {
      loadDatasetsFromApi();
    } else if (tab === 'audiences') {
      loadAudiencesFromApi();
    }
  }

  function initAepTabs() {
    document.querySelectorAll('[data-aep-tab]').forEach((el) => {
      el.addEventListener('click', () => {
        const t = el.getAttribute('data-aep-tab');
        if (t) setAepTab(t);
      });
    });
    document.querySelectorAll('[data-aep-tab-jump]').forEach((el) => {
      el.addEventListener('click', () => {
        const t = el.getAttribute('data-aep-tab-jump');
        if (t) setAepTab(t);
      });
    });
  }

  /** Load available sandboxes into the selector on page load (matches app.js). */
  async function loadSandboxes() {
    if (!sandboxSelect) return;
    if (window.AepGlobalSandbox) {
      await window.AepGlobalSandbox.loadSandboxesIntoSelect(sandboxSelect);
      window.AepGlobalSandbox.onSandboxSelectChange(sandboxSelect);
      window.AepGlobalSandbox.attachStorageSync(sandboxSelect);
      return;
    }
    sandboxSelect.innerHTML = '<option value="">Loading sandboxes…</option>';
    try {
      const res = await fetch('/api/sandboxes');
      const data = await res.json().catch(() => ({}));
      sandboxSelect.innerHTML = '';
      const sandboxes = data.sandboxes || [];
      const defaultOpt = document.createElement('option');
      defaultOpt.value = '';
      defaultOpt.textContent = 'Default (from env)';
      sandboxSelect.appendChild(defaultOpt);
      if (sandboxes.length === 0) {
        const emptyOpt = document.createElement('option');
        emptyOpt.value = '';
        emptyOpt.textContent = 'No sandboxes available';
        emptyOpt.disabled = true;
        sandboxSelect.appendChild(emptyOpt);
        return;
      }
      sandboxes.forEach((s) => {
        const opt = document.createElement('option');
        opt.value = s.name;
        const label = s.title ? `${s.title} (${s.name})` : s.name;
        opt.textContent = s.type ? `${label} - ${s.type}` : label;
        sandboxSelect.appendChild(opt);
      });
      if (sandboxes.some((s) => s.name === 'kirkham')) sandboxSelect.value = 'kirkham';
    } catch {
      sandboxSelect.innerHTML = '<option value="">Failed to load sandboxes</option>';
    }
  }

  /** Sandbox schema option value: full $id URI or Schema Registry meta:altId (e.g. _tenant.schemas.hash). */
  function isSandboxSchemaValue(v) {
    if (!v || typeof v !== 'string') return false;
    if (v.startsWith('https://') || v.startsWith('http://')) return true;
    if (v.startsWith('_') && v.includes('.schemas.')) return true;
    return false;
  }

  function initSourceSelectStatic() {
    if (!sourceSelect) return;
    sourceSelect.innerHTML = '';
    const rows = [
      ['sample', 'Operational profile (sample instance)'],
      ['paste', 'Paste JSON'],
      ['registry', 'Schema URI (manual)'],
    ];
    rows.forEach(([val, label]) => {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = label;
      sourceSelect.appendChild(opt);
    });
    sourceSelect.value = 'sample';
  }

  function dashCell() {
    const td = document.createElement('td');
    td.textContent = '—';
    return td;
  }

  function formatDatasetCell(s, meta) {
    const m = meta != null ? meta : browseMeta;
    const td = document.createElement('td');
    const showDs = m.datasetCountsFromCatalog && s.datasetCount != null;
    if (!showDs) {
      td.textContent = '—';
      return td;
    }
    td.textContent = s.datasetCount > 0 ? String(s.datasetCount) : '—';
    return td;
  }

  function formatLastModified(ms) {
    if (ms == null || !Number.isFinite(Number(ms))) return '—';
    try {
      return new Date(Number(ms)).toLocaleString();
    } catch {
      return '—';
    }
  }

  function getBrowseFilter() {
    return browseFilterQuery.trim().toLowerCase();
  }

  function filteredBrowseSchemas() {
    const q = getBrowseFilter();
    if (!q) return browseSchemas;
    return browseSchemas.filter((s) => {
      const t = (s.title || '').toLowerCase();
      const id = (s.id || '').toLowerCase();
      const alt = (s.metaAltId || '').toLowerCase();
      return t.includes(q) || id.includes(q) || alt.includes(q);
    });
  }

  function getBrowseSortHeaders() {
    if (!browseSortHeaderEls) {
      const table = document.getElementById('schemaBrowseTable');
      browseSortHeaderEls = table ? Array.from(table.querySelectorAll('thead th[data-sort]')) : [];
    }
    return browseSortHeaderEls;
  }

  function idCompareBrowse(a, b) {
    return String(a.id || '').localeCompare(String(b.id || ''));
  }

  function browseSortValue(s, key) {
    switch (key) {
      case 'name':
        return (s.title || s.id || '').toLowerCase();
      case 'datasets':
        if (browseMeta.datasetCountsFromCatalog && s.datasetCount != null) {
          return Number(s.datasetCount);
        }
        return null;
      case 'identities':
      case 'relationships':
      case 'profile':
        return '';
      case 'class':
        return (s.classLabel || '').toLowerCase();
      case 'type':
        return (s.typeLabel || '').toLowerCase();
      case 'behavior':
        return (s.behavior || '').toLowerCase();
      case 'lastModified':
        return Number.isFinite(Number(s.lastModifiedMs)) ? Number(s.lastModifiedMs) : null;
      default:
        return '';
    }
  }

  function compareBrowseRows(a, b) {
    const va = browseSortValue(a, browseSortKey);
    const vb = browseSortValue(b, browseSortKey);
    const aNull = va == null || (typeof va === 'number' && !Number.isFinite(va));
    const bNull = vb == null || (typeof vb === 'number' && !Number.isFinite(vb));
    if (aNull && bNull) return idCompareBrowse(a, b);
    if (aNull) return 1;
    if (bNull) return -1;

    let c = 0;
    if (typeof va === 'number' && typeof vb === 'number') c = va - vb;
    else c = String(va).localeCompare(String(vb), undefined, { sensitivity: 'base' });
    if (browseSortDir === 'desc') c = -c;
    if (c !== 0) return c;
    return idCompareBrowse(a, b);
  }

  function sortedFilteredBrowseSchemas() {
    const rows = filteredBrowseSchemas();
    const sorted = rows.slice();
    sorted.sort(compareBrowseRows);
    return sorted;
  }

  function updateBrowseSortHeaders() {
    getBrowseSortHeaders().forEach((th) => {
      const key = th.getAttribute('data-sort');
      const ind = th.querySelector('.schema-aep-sort-ind');
      if (key === browseSortKey) {
        th.setAttribute('aria-sort', browseSortDir === 'asc' ? 'ascending' : 'descending');
        if (ind) ind.textContent = browseSortDir === 'asc' ? '▲' : '▼';
      } else {
        th.setAttribute('aria-sort', 'none');
        if (ind) ind.textContent = '';
      }
    });
  }

  function onBrowseSortHeaderActivate(th) {
    const key = th.getAttribute('data-sort');
    if (!key) return;
    if (browseSortKey === key) {
      browseSortDir = browseSortDir === 'asc' ? 'desc' : 'asc';
    } else {
      browseSortKey = key;
      browseSortDir = 'asc';
    }
    renderBrowseTable();
  }

  function initBrowseTableSort() {
    getBrowseSortHeaders().forEach((th) => {
      th.addEventListener('click', (e) => {
        e.stopPropagation();
        onBrowseSortHeaderActivate(th);
      });
      th.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onBrowseSortHeaderActivate(th);
        }
      });
    });
  }

  function renderBrowseTable() {
    if (!tableBody) return;
    tableBody.innerHTML = '';
    const rows = sortedFilteredBrowseSchemas();
    updateBrowseSortHeaders();
    if (browseCountEl) {
      const total = browseSchemas.length;
      const q = getBrowseFilter();
      if (total === 0) browseCountEl.textContent = 'No schemas loaded.';
      else if (q && rows.length !== total) {
        browseCountEl.textContent = `Showing ${rows.length} of ${total} schema${total === 1 ? '' : 's'}`;
      } else {
        browseCountEl.textContent = `${total} schema${total === 1 ? '' : 's'} in this sandbox`;
      }
    }
    rows.forEach((s) => {
      const tr = document.createElement('tr');
      tr.dataset.schemaId = s.id;
      if (selectedBrowseId === s.id) tr.classList.add('schema-aep-row--selected');

      const tdName = document.createElement('td');
      const nameLink = document.createElement('button');
      nameLink.type = 'button';
      nameLink.className = 'schema-aep-name-link';
      nameLink.style.cssText =
        'background:none;border:none;padding:0;font:inherit;cursor:pointer;text-align:left;color:#1473e6;';
      nameLink.textContent = s.title || s.id;
      nameLink.title = s.id;
      nameLink.addEventListener('click', () => selectBrowseRow(s));
      tdName.appendChild(nameLink);
      tr.appendChild(tdName);

      tr.appendChild(formatDatasetCell(s));
      tr.appendChild(dashCell());
      tr.appendChild(dashCell());

      const tdProf = document.createElement('td');
      tdProf.textContent = '—';
      tr.appendChild(tdProf);

      const tdClass = document.createElement('td');
      if (s.metaClass) {
        const cl = document.createElement('a');
        cl.href = s.metaClass;
        cl.target = '_blank';
        cl.rel = 'noopener noreferrer';
        cl.className = 'schema-aep-class-link';
        cl.textContent = s.classLabel || s.metaClass;
        tdClass.appendChild(cl);
      } else {
        tdClass.textContent = s.classLabel || '—';
      }
      tr.appendChild(tdClass);

      const tdType = document.createElement('td');
      tdType.textContent = s.typeLabel || '—';
      tr.appendChild(tdType);

      const tdBeh = document.createElement('td');
      tdBeh.textContent = s.behavior || '—';
      tr.appendChild(tdBeh);

      const tdLm = document.createElement('td');
      tdLm.textContent = formatLastModified(s.lastModifiedMs);
      tr.appendChild(tdLm);

      tr.addEventListener('click', (e) => {
        if (e.target.closest('a.schema-aep-class-link')) return;
        selectBrowseRow(s);
      });

      tableBody.appendChild(tr);
    });
  }

  function hydrateSchemaDescription(schemaId) {
    if (!schemaDetailDescription || !schemaId) return;
    const sandbox = getSandboxQuery();
    const q = new URLSearchParams({ schemaId });
    if (sandbox) q.set('sandbox', sandbox);
    fetch(`/api/schema-viewer/registry?${q}`)
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok || selectedBrowseId !== schemaId) return;
        const desc = body.schema && typeof body.schema.description === 'string' ? body.schema.description.trim() : '';
        schemaDetailDescription.textContent = desc || '—';
        if (body.schema) fullSchemaJsonCache.set(schemaId, body.schema);
      })
      .catch(() => {});
  }

  function selectBrowseRow(s) {
    if (!s || !s.id) return;
    selectedBrowseId = s.id;
    renderBrowseTable();
    if (detailAside) detailAside.hidden = false;
    if (schemaDetailTitle) schemaDetailTitle.textContent = s.title || s.id;
    if (schemaDetailName) schemaDetailName.textContent = s.title || '—';
    if (schemaDetailDescription) schemaDetailDescription.textContent = '—';
    if (schemaDetailClass) schemaDetailClass.textContent = s.classLabel || '—';
    if (schemaDetailType) schemaDetailType.textContent = s.typeLabel || '—';
    if (schemaDetailBehavior) schemaDetailBehavior.textContent = s.behavior || '—';
    if (schemaDetailProfile) schemaDetailProfile.textContent = '—';
    if (schemaDetailId) schemaDetailId.textContent = s.id;
    if (schemaDetailTimestamps) {
      const lm = formatLastModified(s.lastModifiedMs);
      schemaDetailTimestamps.textContent = lm !== '—' ? `Last modified: ${lm}` : '';
    }
    hydrateSchemaDescription(s.id);
    loadRegistryById(s.id);
  }

  function closeBrowseDetail() {
    selectedBrowseId = null;
    if (detailAside) detailAside.hidden = true;
    renderBrowseTable();
  }

  function refreshBrowseFromApi(statusOpts, forceRefresh) {
    const q = buildQuery(forceRefresh ? { refresh: 'true' } : null);
    const sandbox = getSandboxQuery();
    if (dataViewerSearch) dataViewerSearch.disabled = true;
    if (!statusOpts?.skipStatus) {
      setStatus(
        sandbox ? `Loading schemas for sandbox “${sandbox}”…` : 'Loading schemas for default sandbox…'
      );
    }
    return fetch(`/api/schema-viewer/tenant-schemas${q}`)
      .then((r) => r.json().then((body) => ({ ok: r.ok, body, res: r })))
      .then(({ ok, body, res }) => {
        if (!ok) throw new Error(body.error || 'Failed to list schemas');
        browseSchemas = body.schemas || [];
        browseMeta = body;
        fullSchemaJsonCache.clear();
        if (!statusOpts?.skipStatus && body.count != null) {
          let msg = `Sandbox “${body.sandbox || 'default'}”: ${body.count} schema(s).`;
          const stubs = Number(body.catalogLightGetMisses) || 0;
          if (stubs > 0) {
            msg += ` ${stubs} listed with dataset-linked names after Registry light lookup missed.`;
          }
          setStatus(msg);
        }
        closeBrowseDetail();
        renderBrowseTable();
      })
      .catch((e) => {
        browseSchemas = [];
        browseMeta = {};
        renderBrowseTable();
        if (!statusOpts?.skipStatus) {
          setStatus(e.message || 'Could not load schema list', true);
        }
      })
      .finally(() => {
        if (dataViewerSearch) dataViewerSearch.disabled = false;
      });
  }

  function loadRegistryById(schemaUri) {
    const id = (schemaUri || '').trim();
    if (!id) {
      setStatus('Missing schema $id.', true);
      return;
    }
    const sandbox = getSandboxQuery();
    const q = new URLSearchParams({ schemaId: id });
    if (sandbox) q.set('sandbox', sandbox);
    setStatus('Loading schema from Schema Registry…');
    fetch(`/api/schema-viewer/registry?${q}`)
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(({ ok, body }) => {
        if (!ok) throw new Error(body.error || 'Request failed');
        const { rootName, node } = normalizeSchemaInput(body.schema);
        const o = opts();
        const tree = buildFromJsonSchema(node, rootName, 0, o);
        renderTree(tree);
        setStatus(`Registry schema · ${body.schemaId || id}`);
      })
      .catch((e) => setStatus(e.message || 'Failed to load schema', true));
  }

  function loadRegistry() {
    const id = (schemaIdInput?.value || '').trim();
    if (!id) {
      setStatus('Enter a full schema $id URI.', true);
      return;
    }
    loadRegistryById(id);
  }

  function loadPaste() {
    let json;
    try {
      json = JSON.parse(pasteTextarea.value.trim() || '{}');
    } catch (e) {
      setStatus('Invalid JSON in paste area.', true);
      return;
    }
    const o = opts();
    const isSchemaLike = json && typeof json === 'object' && (json.properties || json.allOf || json.items);
    let tree;
    if (isSchemaLike) {
      const { rootName, node } = normalizeSchemaInput(json);
      tree = buildFromJsonSchema(node, rootName, 0, o);
      setStatus('Pasted JSON interpreted as JSON Schema / XED fragment.');
    } else {
      tree = buildFromInstance(json, 'root', 0, o);
      setStatus('Pasted JSON interpreted as instance / shape sample.');
    }
    renderTree(tree);
  }

  function syncSourceUI() {
    const v = sourceSelect?.value || 'sample';
    lastMode = v;
    if (registryRow) registryRow.hidden = v !== 'registry';
    if (pasteRow) pasteRow.hidden = v !== 'paste';
  }

  sourceSelect?.addEventListener('change', () => {
    syncSourceUI();
    const v = sourceSelect.value;
    if (v === 'sample') loadOperationalSample();
    else if (isSandboxSchemaValue(v)) loadRegistryById(v);
  });

  sandboxSelect?.addEventListener('change', () => {
    browseFilterQuery = '';
    datasetsFilterQuery = '';
    audiencesFilterQuery = '';
    if (dataViewerSearch) {
      if (
        currentAepTab === 'browse' ||
        currentAepTab === 'datasets' ||
        currentAepTab === 'audiences'
      ) {
        dataViewerSearch.value = '';
      }
    }
    if (currentAepTab === 'overview') loadOverviewStats();
    else if (currentAepTab === 'datasets') loadDatasetsFromApi();
    else if (currentAepTab === 'audiences') loadAudiencesFromApi();
    else {
      refreshBrowseFromApi().then(() => {
        syncSourceUI();
        const v = sourceSelect?.value;
        if (v === 'sample') loadOperationalSample();
        else if (isSandboxSchemaValue(v)) loadRegistryById(v);
      });
    }
  });

  audienceMembersClose?.addEventListener('click', () => {
    if (audienceMembersPanel) audienceMembersPanel.hidden = true;
  });

  dataViewerSearch?.addEventListener('input', () => {
    if (currentAepTab === 'browse') {
      browseFilterQuery = dataViewerSearch.value;
      renderBrowseTable();
    } else if (currentAepTab === 'datasets') {
      datasetsFilterQuery = dataViewerSearch.value;
      renderDatasetTable();
    } else if (currentAepTab === 'audiences') {
      audiencesFilterQuery = dataViewerSearch.value;
      renderAudienceTable();
    }
  });

  schemaSidebarClose?.addEventListener('click', () => closeBrowseDetail());

  async function copyTextToClipboard(text) {
    await navigator.clipboard.writeText(text);
  }

  schemaCopyIdBtn?.addEventListener('click', async () => {
    const id = schemaDetailId?.textContent?.trim();
    if (!id || id === '—') return;
    try {
      await copyTextToClipboard(id);
      setStatus('Schema ID copied.');
    } catch {
      setStatus('Could not copy (clipboard permission).', true);
    }
  });

  schemaCopyJsonBtn?.addEventListener('click', () => {
    const id = selectedBrowseId || schemaDetailId?.textContent?.trim();
    if (!id || id === '—') {
      setStatus('Select a schema first.', true);
      return;
    }
    setStatus('Fetching schema JSON…');
    const sandbox = getSandboxQuery();
    const q = new URLSearchParams({ schemaId: id });
    if (sandbox) q.set('sandbox', sandbox);
    fetch(`/api/schema-viewer/registry?${q}`)
      .then((r) => r.json().then((body) => ({ ok: r.ok, body })))
      .then(async ({ ok, body }) => {
        if (!ok) throw new Error(body.error || 'Request failed');
        fullSchemaJsonCache.set(id, body.schema);
        await copyTextToClipboard(JSON.stringify(body.schema, null, 2));
        setStatus('JSON structure copied to clipboard.');
      })
      .catch((e) => setStatus(e.message || 'Copy failed', true));
  });

  loadBtn?.addEventListener('click', () => {
    const v = sourceSelect?.value;
    if (v === 'registry') loadRegistry();
    else if (v === 'paste') loadPaste();
    else if (isSandboxSchemaValue(v)) loadRegistryById(v);
    else loadOperationalSample();
  });

  maxDepthInput?.addEventListener('change', () => {
    const v = sourceSelect?.value;
    if (v === 'sample') loadOperationalSample();
    else if (isSandboxSchemaValue(v)) loadRegistryById(v);
  });
  maxChildrenInput?.addEventListener('change', () => {
    const v = sourceSelect?.value;
    if (v === 'sample') loadOperationalSample();
    else if (isSandboxSchemaValue(v)) loadRegistryById(v);
  });

  zoomInBtn?.addEventListener('click', () => {
    if (!zoomBehavior || !svgEl) return;
    d3.select(svgEl).transition().duration(180).call(zoomBehavior.scaleBy, 1.5);
  });
  zoomOutBtn?.addEventListener('click', () => {
    if (!zoomBehavior || !svgEl) return;
    d3.select(svgEl).transition().duration(180).call(zoomBehavior.scaleBy, 1 / 1.5);
  });
  zoomResetBtn?.addEventListener('click', () => {
    if (!zoomBehavior || !svgEl) return;
    d3.select(svgEl).transition().duration(200).call(zoomBehavior.transform, d3.zoomIdentity);
  });

  const refreshBtn = document.getElementById('dataViewerRefreshBtn');
  refreshBtn?.addEventListener('click', () => {
    refreshBtn.disabled = true;
    refreshBtn.textContent = '↻ Refreshing…';
    const tab = currentAepTab || 'overview';
    const jobs = [];
    if (tab === 'overview') jobs.push(loadOverviewStats(true));
    if (tab === 'browse') jobs.push(refreshBrowseFromApi(null, true));
    if (tab === 'datasets') jobs.push(loadDatasetsFromApi(true));
    if (tab === 'audiences') jobs.push(loadAudiencesFromApi(true));
    if (jobs.length === 0) jobs.push(loadOverviewStats(true));
    Promise.allSettled(jobs).finally(() => {
      refreshBtn.disabled = false;
      refreshBtn.textContent = '↻ Refresh';
    });
  });

  (async function init() {
    initBrowseTableSort();
    initDatasetTableSort();
    initAudienceTableSort();
    initSourceSelectStatic();
    initAepTabs();
    await loadSandboxes();
    setAepTab('overview');
    syncSourceUI();
    loadOperationalSample();
  })();
})();
