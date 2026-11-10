(function () {
  'use strict';
  var auth, snapshot = null, scenario = null, stepIndex = 0, timer = null;
  var generation = 0, controller = null, zoom = 1, graphWidth = 1000, graphHeight = 600;
  var autoFit = true;
  var fullArchitecture = false, graphPositions = new Map(), fullGraphWidth = 1000, fullGraphHeight = 600;
  var revealedLiveNodes = new Set(['lab']), revealedRunId = null;
  var traceRun = null, tracePrefs = null, tracePendingId = null, traceBusy = false, traceDenied = false;
  var traceController = null, traceSequence = 0, tracePoll = null, traceClock = null;
  var traceWatching = false, traceWatchStarted = 0, traceMode = false;
  var traceEndpoint = '/api/architecture/my-data-flows/trace';
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var svgNS = 'http://www.w3.org/2000/svg';
  function el(id) { return document.getElementById(id); }
  function text(value) { return value === null || value === undefined || value === '' ? 'Unknown / not recorded' : String(value); }
  function node(tag, value, className) {
    var result = document.createElement(tag);
    if (value !== undefined) result.textContent = text(value);
    if (className) result.className = className;
    return result;
  }
  function svg(tag, attributes) {
    var result = document.createElementNS(svgNS, tag);
    Object.keys(attributes || {}).forEach(function (key) { result.setAttribute(key, attributes[key]); });
    return result;
  }
  function list(parent, values) {
    var ul = node('ul');
    (values || []).forEach(function (value) { ul.appendChild(node('li', value)); });
    parent.appendChild(ul);
  }
  function fields(parent, pairs) {
    var dl = node('dl');
    pairs.forEach(function (pair) { dl.append(node('dt', pair[0]), node('dd', text(pair[1]))); });
    parent.appendChild(dl);
  }
  function timing(value) {
    var labels = { simulation: 'Simulation only', target: 'Timing target', configured: 'Configured schedule', schedule: 'Configured schedule', observed: 'Observed evidence', unknown: 'Unknown timing' };
    return node('span', (labels[value?.kind] || text(value?.kind || 'Unknown timing')) + ': ' + text(value?.label), 'flows-timing');
  }
  function status(message, error) {
    el('flowsStatus').textContent = message;
    el('flowsStatus').dataset.error = String(!!error);
  }
  function stop() {
    if (timer !== null) clearInterval(timer);
    timer = null;
    el('flowsPlay').textContent = 'Play simulation';
  }
  function closeFullscreen() {
    if (el('flowsDialog').open) el('flowsDialog').close();
    el('flowsDiagramHome').appendChild(el('flowsDiagramPanel'));
    el('flowsCloseFullscreen').hidden = true;
    el('flowsFullscreen').hidden = false;
  }
  function clear() {
    stop();
    resetTrace();
    closeFullscreen();
    snapshot = null;
    scenario = null;
    stepIndex = 0;
    zoom = 1;
    autoFit = true;
    fullArchitecture = false;
    revealedLiveNodes = new Set(['lab']); revealedRunId = null;
    el('flowsFocusView').setAttribute('aria-pressed', 'true');
    el('flowsFullView').setAttribute('aria-pressed', 'false');
    el('flowsRevealStatus').textContent = '';
    el('flowsResults').hidden = true;
    ['flowsReferenceTitle', 'flowsSummary', 'flowsAsOf', 'flowsGraph', 'flowsInspect', 'flowsEdges',
      'flowsScenarios', 'flowsScenarioDescription', 'flowsStep', 'flowsTimeline', 'flowsProgress',
      'flowsIndustries', 'flowsLiveStatus', 'flowsLiveResults', 'flowsEvidence', 'flowsNotes', 'flowsMotionNote'].forEach(function (id) { el(id).replaceChildren(); });
    el('flowsGraph').dataset.expanded = 'false';
    el('flowsExpand').setAttribute('aria-expanded', 'false');
    el('flowsExpand').textContent = 'Expand diagram';
    el('flowsZoom').textContent = '100%';
  }
  function allowed(user) { return !!user && !user.isAnonymous && user.email?.toLowerCase() === 'apalmer@adobe.com'; }
  function current(user, epoch) {
    return generation === epoch && auth.currentUser === user && allowed(auth.currentUser);
  }
  function inspect(value) {
    el('flowsInspect').replaceChildren(node('h3', value.label), node('p', value.description), timing(value.timing));
    if (traceMode) {
      var stages = (traceRun?.stages || []).filter(function (stage) { return stage.nodeIds?.includes(value.id); });
      if (!stages.length) el('flowsInspect').appendChild(node('p', 'Not checked by this live trace.'));
      stages.forEach(function (stage) { el('flowsInspect').appendChild(stageDetails(stage)); });
    }
  }
  function applyZoom(value, fitting) {
    var viewport = el('flowsGraph');
    var centerX = (viewport.scrollLeft + viewport.clientWidth / 2) / zoom;
    var centerY = (viewport.scrollTop + viewport.clientHeight / 2) / zoom;
    autoFit = !!fitting;
    zoom = Math.max(.01, Math.min(Math.max(3, viewport.clientWidth / graphWidth * 3), value));
    var graph = el('flowsGraph').querySelector('svg');
    if (graph) { graph.style.width = graphWidth * zoom + 'px'; graph.style.height = graphHeight * zoom + 'px'; }
    el('flowsZoom').textContent = Math.round(zoom * 100) + '%';
    viewport.scrollLeft = fitting ? 0 : centerX * zoom - viewport.clientWidth / 2;
    viewport.scrollTop = fitting ? 0 : centerY * zoom - viewport.clientHeight / 2;
  }
  function fit() {
    if (!snapshot) return;
    applyZoom((el('flowsGraph').clientWidth - 2) / graphWidth, true);
  }
  function renderGraph(reference) {
    var nodes = reference.nodes || [], edges = reference.edges || [], positions = new Map();
    var ranks = new Map(), columns = new Map();
    function rank(id, visiting) {
      if (ranks.has(id)) return ranks.get(id);
      if (visiting.has(id)) return 0;
      var path = new Set(visiting); path.add(id);
      var parents = edges.filter(function (edge) { return edge.to === id && nodes.some(function (n) { return n.id === edge.from; }); });
      var value = parents.reduce(function (maximum, edge) { return Math.max(maximum, rank(edge.from, path) + 1); }, 0);
      ranks.set(id, value);
      return value;
    }
    // Derive left-to-right layers from the protected topology, preserving parallel branches.
    nodes.forEach(function (value) {
      var column = rank(value.id, new Set());
      if (!columns.has(column)) columns.set(column, []);
      columns.get(column).push(value);
    });
    var columnCount = Math.max(1, ...Array.from(columns.keys()).map(function (value) { return value + 1; }));
    var rowCount = Math.max(1, ...Array.from(columns.values()).map(function (values) { return values.length; }));
    graphWidth = (columnCount - 1) * 390 + 320;
    graphHeight = Math.max(280, rowCount * 210 + 80);
    el('flowsGraph').style.setProperty('--flows-aspect-ratio', graphWidth + ' / ' + graphHeight);
    columns.forEach(function (values, column) {
      values.forEach(function (value, index) {
        positions.set(value.id, { x: 40 + column * 390, y: 40 + (graphHeight - 80) * (index + .5) / values.length - 55 });
      });
    });
    graphPositions = positions;
    fullGraphWidth = graphWidth; fullGraphHeight = graphHeight;
    var root = svg('svg', { viewBox: '0 0 ' + graphWidth + ' ' + graphHeight, role: 'group', 'aria-label': 'Protected reference flow diagram' });
    var defs = svg('defs'), marker = svg('marker', { id: 'flowsArrow', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '7', markerHeight: '7', orient: 'auto-start-reverse' });
    marker.appendChild(svg('path', { d: 'M 0 0 L 10 5 L 0 10 z', class: 'flows-arrow' }));
    defs.appendChild(marker);
    root.appendChild(defs);
    edges.forEach(function (edge) {
      var from = positions.get(edge.from), to = positions.get(edge.to);
      if (!from || !to) return;
      var x1 = from.x + 240, y1 = from.y + 55, x2 = to.x, y2 = to.y + 55;
      var bend = x1 + 65;
      var route = x2 - x1 > 200
        ? 'M' + x1 + ',' + y1 + ' L' + (x1 + 35) + ',' + y1 + ' L' + (x1 + 35) + ',20 L' + (x2 - 35) + ',20 L' + (x2 - 35) + ',' + y2 + ' L' + x2 + ',' + y2
        : 'M' + x1 + ',' + y1 + ' C' + bend + ',' + y1 + ' ' + (x2 - 65) + ',' + y2 + ' ' + x2 + ',' + y2;
      var path = svg('path', { d: route, class: 'flows-edge', 'marker-end': 'url(#flowsArrow)' });
      path.dataset.from = edge.from; path.dataset.to = edge.to;
      var title = svg('title'); title.textContent = text(edge.label); path.appendChild(title);
      root.appendChild(path);
      var edgeLabel = svg('text', { x: (x1 + x2) / 2, y: x2 - x1 > 200 ? 14 : (y1 + y2) / 2 - 8, 'text-anchor': 'middle', class: 'flows-edge-label' });
      edgeLabel.dataset.from = edge.from; edgeLabel.dataset.to = edge.to;
      var labelText = text(edge.label);
      edgeLabel.textContent = labelText.length > 38 ? labelText.slice(0, 35) + '…' : labelText;
      var edgeTitle = svg('title'); edgeTitle.textContent = labelText; edgeLabel.appendChild(edgeTitle);
      root.appendChild(edgeLabel);
      var fromNode = nodes.find(function (n) { return n.id === edge.from; });
      var toNode = nodes.find(function (n) { return n.id === edge.to; });
      el('flowsEdges').appendChild(node('li', text(fromNode?.label) + ' → ' + text(toNode?.label) + ': ' + text(edge.label)));
    });
    nodes.forEach(function (value) {
      var p = positions.get(value.id);
      var group = svg('g', { transform: 'translate(' + p.x + ',' + p.y + ')', class: 'flows-node', tabindex: '0', role: 'button', 'aria-label': 'Inspect ' + text(value.label), 'data-node-id': value.id });
      group.appendChild(svg('rect', { width: '240', height: '110', rx: '12' }));
      var label = svg('text', { x: '14', y: '29' });
      var words = text(value.label).split(/\s+/), lines = [''];
      words.forEach(function (word) {
        if ((lines[lines.length - 1] + word).length > 26) lines.push('');
        lines[lines.length - 1] += word + ' ';
      });
      lines.slice(0, 3).forEach(function (line, i) {
        var span = svg('tspan', { x: '14', dy: i ? '22' : '0' }); span.textContent = line.trim(); label.appendChild(span);
      });
      var title = svg('title'); title.textContent = text(value.label);
      group.append(title, label);
      group.addEventListener('click', function () { inspect(value); });
      group.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); inspect(value); }
      });
      root.appendChild(group);
    });
    el('flowsGraph').appendChild(root);
    el('flowsInspect').textContent = 'Select a node to inspect its explanation and timing evidence.';
  }
  function showStep() {
    if (!scenario) return;
    var steps = scenario.steps || [], value = steps[stepIndex];
    el('flowsProgress').textContent = steps.length ? 'Step ' + (stepIndex + 1) + ' of ' + steps.length : 'No steps available';
    el('flowsPrevious').disabled = stepIndex <= 0;
    el('flowsNext').disabled = stepIndex >= steps.length - 1;
    el('flowsPlay').disabled = !steps.length;
    el('flowsStep').replaceChildren();
    if (value) el('flowsStep').append(node('h3', value.title), node('p', value.description), timing(value.timing));
    paintTraceNodes();
    Array.from(el('flowsTimeline').children).forEach(function (li, i) {
      if (i === stepIndex) li.setAttribute('aria-current', 'step');
      else li.removeAttribute('aria-current');
    });
  }
  function selectScenario(value) {
    stop();
    scenario = value;
    stepIndex = 0;
    el('flowsScenarioDescription').textContent = text(value.description);
    el('flowsScenarios').querySelectorAll('button').forEach(function (button) { button.setAttribute('aria-pressed', String(button.dataset.scenarioId === value.id)); });
    el('flowsTimeline').replaceChildren();
    (value.steps || []).forEach(function (step, index) {
      var li = node('li'), button = node('button', step.title);
      button.type = 'button';
      button.setAttribute('aria-label', 'Go to step ' + (index + 1) + ': ' + text(step.title));
      button.addEventListener('click', function () { stop(); stepIndex = index; showStep(); });
      li.appendChild(button); el('flowsTimeline').appendChild(li);
    });
    showStep();
  }
  function traceMessage(message) { el('flowsTraceStatus').textContent = message; }
  function stopWatching() {
    traceWatching = false;
    clearTimeout(tracePoll); tracePoll = null;
    clearInterval(traceClock); traceClock = null;
    traceButtons();
  }
  function resetTrace() {
    traceSequence += 1;
    if (traceController) traceController.abort();
    traceController = null; traceBusy = false; traceDenied = false;
    traceRun = null; tracePrefs = null; tracePendingId = null;
    stopWatching();
    ['flowsTraceIdentity', 'flowsTraceStages', 'flowsTraceLimitations', 'flowsTraceElapsed'].forEach(function (id) { el(id).replaceChildren(); });
    el('flowsTraceIdentity').hidden = true;
    el('flowsTraceConfirm').checked = false;
    el('flowsTraceSettings').hidden = true;
    traceMessage('Checking profile settings…');
  }
  function setTraceMode(liveMode) {
    traceMode = liveMode;
    if (liveMode) stop();
    el('flowsSimulationMode').setAttribute('aria-pressed', String(!liveMode));
    el('flowsTraceMode').setAttribute('aria-pressed', String(liveMode));
    el('flowsTracePanel').hidden = !liveMode;
    el('flowsSimulationPanel').hidden = liveMode;
    el('flowsGraphMode').textContent = liveMode ? 'Live · only verified readbacks mark a node as verified; unmarked nodes are not checked.' : 'Simulation · illustrative highlights only';
    paintTraceNodes();
  }
  function paintTraceNodes() {
    var priority = { verified: 1, not_applicable: 2, waiting: 3, checking: 4, unavailable: 5, failed: 6 };
    var step = scenario?.steps?.[stepIndex];
    el('flowsGraph').querySelectorAll('[data-node-id]').forEach(function (group) {
      group.dataset.active = String(!traceMode && !!step?.nodeIds?.includes(group.dataset.nodeId));
      var stages = traceMode ? (traceRun?.stages || []).filter(function (stage) { return stage.nodeIds?.includes(group.dataset.nodeId); }) : [];
      var state = stages.reduce(function (selected, stage) {
        return (priority[stage.state] || 0) > (priority[selected] || 0) ? stage.state : selected;
      }, '');
      group.dataset.liveState = state;
      var label = snapshot?.reference.nodes.find(function (value) { return value.id === group.dataset.nodeId; })?.label;
      group.setAttribute('aria-label', 'Inspect ' + text(label) + (traceMode ? ' — ' + (state ? state.replaceAll('_', ' ') : 'not checked') : ''));
    });
    revealGraph();
  }
  function revealGraph() {
    if (!snapshot) return;
    var visible = new Set(['lab']), relevant = new Set(['lab']);
    if (traceMode) {
      var runId = traceRun?.id || tracePendingId || null;
      if (runId !== revealedRunId) {
        revealedRunId = runId; revealedLiveNodes = new Set(['lab']);
      }
      (traceRun?.stages || []).forEach(function (stage) {
        (stage.nodeIds || []).forEach(function (id) {
          relevant.add(id);
          if (stage.checkedAt || ['checking', 'verified', 'failed', 'unavailable'].includes(stage.state)) revealedLiveNodes.add(id);
        });
      });
      visible = new Set(revealedLiveNodes);
    } else {
      (scenario?.steps || []).forEach(function (step, index) {
        (step.nodeIds || []).forEach(function (id) {
          relevant.add(id);
          if (index <= stepIndex) visible.add(id);
        });
      });
    }
    var viewport = el('flowsGraph'), root = viewport.querySelector('svg');
    if (!root) return;
    root.querySelectorAll('[data-node-id]').forEach(function (group) {
      var id = group.dataset.nodeId, concealed = !fullArchitecture && !visible.has(id);
      group.classList.toggle('flows-concealed', concealed);
      group.classList.toggle('flows-context', fullArchitecture && !relevant.has(id));
      group.setAttribute('tabindex', concealed ? '-1' : '0');
      group.setAttribute('aria-hidden', String(concealed));
    });
    root.querySelectorAll('[data-from]').forEach(function (edge) {
      edge.classList.toggle('flows-concealed', !fullArchitecture && (!visible.has(edge.dataset.from) || !visible.has(edge.dataset.to)));
      edge.classList.toggle('flows-context', fullArchitecture && (!relevant.has(edge.dataset.from) || !relevant.has(edge.dataset.to)));
    });
    el('flowsRevealStatus').textContent = fullArchitecture
      ? 'Full architecture · unrelated paths are dimmed. Playback position is preserved.'
      : (traceMode ? 'Live flow · systems appear when checks begin; waiting or unavailable is not verified arrival.'
        : 'Flow view · steps reveal the selected path; earlier steps remain visible.');
    var bounds = fullArchitecture ? { x: 0, y: 0, width: fullGraphWidth, height: fullGraphHeight } : null;
    if (!bounds) {
      var boxes = [];
      visible.forEach(function (id) {
        var p = graphPositions.get(id);
        if (p) boxes.push({ x: p.x, y: p.y, width: 240, height: 110 });
      });
      root.querySelectorAll('[data-from]:not(.flows-concealed)').forEach(function (edge) { boxes.push(edge.getBBox()); });
      if (!boxes.length) return;
      var left = Math.min(...boxes.map(function (box) { return box.x; })) - 40;
      var top = Math.min(...boxes.map(function (box) { return box.y; })) - 40;
      bounds = { x: left, y: top,
        width: Math.max(...boxes.map(function (box) { return box.x + box.width; })) - left + 40,
        height: Math.max(...boxes.map(function (box) { return box.y + box.height; })) - top + 40 };
    }
    var previous = root.viewBox.baseVal;
    var scrollX = viewport.scrollLeft, scrollY = viewport.scrollTop;
    var oldX = previous.x, oldY = previous.y;
    if (!autoFit) {
      var right = Math.max(bounds.x + bounds.width, previous.x + previous.width);
      var bottom = Math.max(bounds.y + bounds.height, previous.y + previous.height);
      bounds.x = Math.min(bounds.x, previous.x); bounds.y = Math.min(bounds.y, previous.y);
      bounds.width = right - bounds.x; bounds.height = bottom - bounds.y;
    }
    graphWidth = bounds.width; graphHeight = bounds.height;
    root.setAttribute('viewBox', [bounds.x, bounds.y, bounds.width, bounds.height].join(' '));
    viewport.style.setProperty('--flows-aspect-ratio', graphWidth + ' / ' + graphHeight);
    if (autoFit) fit();
    else {
      root.style.width = graphWidth * zoom + 'px'; root.style.height = graphHeight * zoom + 'px';
      viewport.scrollLeft = scrollX + (oldX - bounds.x) * zoom;
      viewport.scrollTop = scrollY + (oldY - bounds.y) * zoom;
    }
  }
  function safeLink(href) {
    try {
      var url = new URL(href, window.location.href);
      if (url.protocol !== 'https:' && url.origin !== window.location.origin) return null;
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
      return url.href;
    } catch { return null; }
  }
  function stageDetails(stage) {
    var details = node('details');
    details.appendChild(node('summary', 'Evidence and queries'));
    fields(details, [['Last checked', stage.checkedAt], ['Verified at', stage.verifiedAt]]);
    if (stage.evidence && Object.keys(stage.evidence).length) details.appendChild(node('pre', JSON.stringify(stage.evidence, null, 2)));
    if (stage.queries?.length) details.appendChild(node('p', 'Queries are inspection references, not proof of execution. Unexecuted templates and placeholders must be adapted before use; only verified readback evidence establishes arrival.', 'flows-muted'));
    (stage.queries || []).forEach(function (query) {
      var pre = node('pre', query.text), copy = node('button', 'Copy query');
      copy.type = 'button'; copy.setAttribute('aria-label', 'Copy query: ' + text(query.label));
      copy.addEventListener('click', async function () {
        try { await navigator.clipboard.writeText(pre.textContent); copy.textContent = 'Copied'; }
        catch { copy.textContent = 'Copy unavailable — select query text'; }
      });
      details.append(node('h4', query.label), pre, copy);
    });
    (stage.links || []).forEach(function (link) {
      var href = safeLink(link.href);
      if (!href) return;
      var anchor = node('a', link.label); anchor.href = href; anchor.rel = 'noopener noreferrer';
      details.appendChild(node('p')).appendChild(anchor);
    });
    return details;
  }
  function traceButtons() {
    el('flowsTraceCreate').disabled = traceBusy || traceDenied || !tracePrefs?.ready || !!tracePendingId || traceWatching || !el('flowsTraceConfirm').checked;
    el('flowsTraceIndustry').disabled = traceBusy || !!tracePendingId || traceWatching;
    el('flowsTraceConfirm').disabled = traceBusy || !!tracePendingId || traceDenied;
    el('flowsTraceCheck').disabled = traceBusy || traceDenied || (!traceRun && !tracePendingId);
    el('flowsTraceWatch').disabled = traceDenied || (!traceWatching && (traceBusy || !traceRun || !!tracePendingId));
    el('flowsTraceWatch').textContent = traceWatching ? 'Stop watching' : 'Resume watching';
  }
  function updateTraceClock() {
    var created = Date.parse(traceRun?.createdAt);
    el('flowsTraceElapsed').textContent = Number.isFinite(created)
      ? 'Elapsed since creation: ' + Math.floor(Math.max(0, Date.now() - created) / 60000) + 'm ' + Math.floor(Math.max(0, Date.now() - created) / 1000 % 60) + 's'
      : '';
  }
  function renderTrace() {
    var identity = el('flowsTraceIdentity');
    identity.replaceChildren(); identity.hidden = !traceRun;
    if (traceRun) {
      identity.appendChild(node('h3', 'This test profile'));
      identity.appendChild(node('p', traceRun.identity?.email || 'Identity is not recorded yet.'));
      var identifiers = node('details');
      identifiers.appendChild(node('summary', 'Profile and run details'));
      fields(identifiers, [['Industry', traceRun.industry], ['Sandbox', traceRun.sandbox], ['Run', traceRun.id],
        ['Created', traceRun.createdAt], ['Last receipt update', traceRun.updatedAt]]);
      if (traceRun.generation) fields(identifiers, [['Creation state', traceRun.generation.state], ['Creation detail', traceRun.generation.detail]]);
      if (traceRun.identity) fields(identifiers, Object.entries(traceRun.identity).map(function (pair) { return [pair[0], pair[1]]; }));
      identity.appendChild(identifiers);
    }
    el('flowsTraceStages').replaceChildren();
    (traceRun?.stages || []).forEach(function (stage) {
      var item = node('li', undefined, 'flows-card'); item.dataset.state = stage.state;
      item.append(node('h3', text(stage.label) + ' — ' + text(stage.state).replaceAll('_', ' ')), node('p', stage.detail),
        node('p', 'Last checked: ' + text(stage.checkedAt), 'flows-muted'), stageDetails(stage));
      el('flowsTraceStages').appendChild(item);
    });
    el('flowsTraceLimitations').replaceChildren();
    (traceRun?.limitations || []).forEach(function (limitation) { el('flowsTraceLimitations').appendChild(node('li', limitation)); });
    updateTraceClock(); paintTraceNodes(); traceButtons();
  }
  function traceComplete() {
    return traceRun?.stages?.length && traceRun.stages.every(function (stage) { return ['verified', 'not_applicable'].includes(stage.state); });
  }
  function scheduleTrace() {
    clearTimeout(tracePoll); tracePoll = null;
    if (!traceWatching) return;
    if (traceComplete() || traceRun?.state === 'needs_attention') {
      stopWatching();
      traceMessage(traceComplete() ? 'Readbacks verified. Review evidence below.' : 'This run needs attention. Review the evidence; Check now reads the same run.');
      return;
    }
    if (Date.now() - traceWatchStarted >= 30 * 60 * 1000) {
      stopWatching(); traceMessage('Watching paused after 30 minutes. Check now or resume the same run.'); return;
    }
    tracePoll = setTimeout(function () { readTrace(true); }, 30000);
  }
  function startWatching() {
    if (!traceRun || traceBusy || traceDenied) return;
    traceWatching = true; traceWatchStarted = Date.now();
    traceClock = setInterval(function () {
      updateTraceClock();
      if (Date.now() - traceWatchStarted >= 30 * 60 * 1000) scheduleTrace();
    }, 1000);
    traceButtons(); scheduleTrace();
  }
  async function traceRequest(method, requestId, refresh) {
    var user = auth.currentUser, epoch = generation, sequence = ++traceSequence;
    var requestController = traceController = new AbortController();
    var timeout = setTimeout(function () { requestController.abort(); }, 30000);
    traceBusy = true; traceButtons();
    try {
      var token = await user.getIdToken();
      if (!current(user, epoch) || sequence !== traceSequence) return null;
      var suffix = method === 'GET' && requestId ? '?runId=' + encodeURIComponent(requestId) + (refresh ? '&refresh=true' : '') : '';
      var headers = { Authorization: 'Bearer ' + token };
      if (method === 'POST') headers['Content-Type'] = 'application/json';
      var response = await fetch(traceEndpoint + suffix, {
        method, headers, credentials: 'omit', cache: 'no-store', signal: requestController.signal,
        ...(method === 'POST' ? { body: JSON.stringify({ industry: el('flowsTraceIndustry').value, requestId }) } : {}),
      });
      if (!current(user, epoch) || sequence !== traceSequence) return null;
      if (response.status === 401 || response.status === 403) {
        traceDenied = true; stopWatching();
        traceRun = null; tracePendingId = null; tracePrefs = null; renderTrace();
        el('flowsInspect').replaceChildren();
        if (response.status === 401) el('flowsSignIn').hidden = false;
        throw new Error(response.status === 401 ? 'Sign in again to check this run.' : 'Access denied. Live tracing is restricted to the owner.');
      }
      if (!response.ok) throw new Error('Trace request failed (HTTP ' + response.status + ').');
      var data = await response.json();
      if (!current(user, epoch) || sequence !== traceSequence) return null;
      if (data.ok !== true || (data.run && (typeof data.run.id !== 'string' || data.run.sandbox !== 'apalmer' || !Array.isArray(data.run.stages)))
        || (data.run && requestId && data.run.id !== requestId)) throw new Error('Invalid trace receipt. No new creation will be attempted.');
      if (data.prefs) {
        tracePrefs = data.prefs;
        var href = safeLink(data.prefs.settingsHref || 'profile-generation.html');
        el('flowsTraceSettingsLink').href = href || 'profile-generation.html';
        el('flowsTraceSettings').hidden = data.prefs.ready === true;
      }
      if (data.run) {
        if (traceRun?.id === data.run.id && !data.run.identity && traceRun.identity) data.run.identity = traceRun.identity;
        traceRun = data.run; tracePendingId = null;
      }
      renderTrace();
      return data;
    } catch (error) {
      if (!current(user, epoch) || sequence !== traceSequence) return null;
      stopWatching();
      traceMessage(traceDenied ? error.message : method === 'POST'
        ? 'Creation outcome is unknown. No automatic retry. Recovering the same receipt with a read…'
        : (tracePendingId ? 'Creation outcome is still unknown. No automatic retry. Check now recovers the same receipt. ' : 'Watching paused. Check now reads the same run. ') + (error.name === 'AbortError' ? 'The read timed out.' : error.message));
      return null;
    } finally {
      clearTimeout(timeout);
      if (current(user, epoch) && sequence === traceSequence) {
        traceController = null; traceBusy = false; traceButtons();
      }
    }
  }
  async function readTrace(refresh) {
    if (traceBusy || traceDenied || !allowed(auth.currentUser)) return;
    clearTimeout(tracePoll); tracePoll = null;
    var data = await traceRequest('GET', tracePendingId || traceRun?.id, refresh);
    if (!data) return;
    if (tracePendingId) traceMessage('Creation outcome is unknown. No automatic retry. Check now recovers the same receipt.');
    else if (!data.run && traceRun) {
      stopWatching();
      traceMessage('Receipt not found. Displayed evidence is from the last successful read; Check now reads the same run.');
    }
    else if (traceRun) traceMessage('Same run loaded · ' + text(traceRun.state).replaceAll('_', ' ') + '. Last receipt update: ' + text(traceRun.updatedAt));
    else traceMessage(tracePrefs?.ready ? 'Ready. Choose an industry and confirm the one-profile write.' : 'Set up profile generation before creating a test profile.');
    scheduleTrace();
  }
  async function createTrace() {
    if (el('flowsTraceCreate').disabled || !allowed(auth.currentUser)) return;
    stopWatching();
    var epoch = generation, user = auth.currentUser;
    tracePendingId = crypto.randomUUID();
    traceRun = null; el('flowsTraceConfirm').checked = false; renderTrace();
    traceMessage('Creating one test profile…');
    var data = await traceRequest('POST', tracePendingId, false);
    if (!current(user, epoch) || traceDenied) return;
    if (!data || !traceRun) {
      traceMessage('Creation outcome is unknown. No automatic retry. Recovering the same receipt with a read…');
      await readTrace(false);
    }
    if (traceRun && current(user, epoch) && !traceDenied) {
      traceMessage('Creation receipt recorded. Following natural ingestion with read-only checks; arrival is not yet verified.');
      startWatching();
    }
  }
  function renderLive(live) {
    var target = el('flowsLiveResults');
    target.replaceChildren();
    if (!live) {
      el('flowsLiveStatus').textContent = 'Live status has not been requested. Use “Read live AEP status” for an on-demand read; no polling is performed.';
      return;
    }
    el('flowsLiveStatus').textContent = 'Observed snapshot: ' + text(live.fetchedAt) + '. ' + (live.complete ? 'Requested reads complete; this does not prove end-to-end arrival.' : 'Partial results; some status is unavailable.');
    list(target, live.limitations);
    (live.flows || []).forEach(function (flow) {
      var details = node('details', undefined, 'flows-card');
      details.appendChild(node('summary', text(flow.name) + ' — ' + text(flow.state)));
      fields(details, [
        ['Flow ID', flow.id], ['Source tables', (flow.sourceTables || []).join(', ')],
        ['Configured schedule', flow.schedule ? 'Frequency: ' + text(flow.schedule.frequency) + '; interval: ' + text(flow.schedule.interval) + '; backfill: ' + text(flow.schedule.backfill) : 'Unknown / not returned'],
        ['Mappings', (flow.mappings || []).map(function (m) { return text(m.id) + ' (version ' + text(m.version) + ')'; }).join(', ')],
      ]);
      (flow.datasets || []).forEach(function (dataset) {
        var card = node('div', undefined, 'flows-card'); card.appendChild(node('h3', dataset.name));
        fields(card, [['Dataset ID', dataset.id], ['Profile enabled', dataset.profileEnabled === true ? 'Yes' : dataset.profileEnabled === false ? 'No' : 'Unknown'],
          ['Schema ID', dataset.schemaId], ['Operational status', dataset.ocStatus]]);
        details.appendChild(card);
      });
      var run = flow.lastRun;
      var runCard = node('div', undefined, 'flows-card'); runCard.appendChild(node('h3', 'Observed last run'));
      if (run) {
        var started = Date.parse(run.startedAt), completed = Date.parse(run.completedAt);
        var duration = Number.isFinite(started) && Number.isFinite(completed) && completed >= started
          ? ((completed - started) / 1000).toLocaleString(undefined, { maximumFractionDigits: 3 }) + ' seconds (execution only, not end-to-end latency)'
          : 'Unknown / valid start and completion timestamps not both recorded';
        fields(runCard, [['Run ID', run.id], ['State', run.state], ['Started at', run.startedAt], ['Completed at', run.completedAt],
          ['Observed execution duration', duration], ['Read', run.readCount], ['Updated', run.updatedCount], ['Failed', run.failedCount], ['Deleted', run.deletedCount]]);
      }
      else runCard.appendChild(node('p', 'Unknown / no last run returned. This is not evidence that no run occurred.'));
      details.appendChild(runCard); target.appendChild(details);
    });
    (live.streaming || []).forEach(function (stream) {
      var card = node('div', undefined, 'flows-card'); card.appendChild(node('h3', stream.industry));
      fields(card, [['Configured', stream.configured], ['Dataset ID', stream.datasetId], ['Flow ID', stream.flowId],
        ['Profile enabled', stream.profileEnabled === true ? 'Yes' : stream.profileEnabled === false ? 'No' : 'Unknown']]);
      target.appendChild(card);
    });
    var event = node('div', undefined, 'flows-card'); event.appendChild(node('h3', 'Event status'));
    if (live.event) fields(event, [['Configured', live.event.configured], ['Datastream ID', live.event.datastreamId],
      ['Schema ID', live.event.schemaId], ['Dataset', live.event.datasetName]]);
    else event.appendChild(node('p', 'Unknown / event status not returned.'));
    target.appendChild(event);
    target.appendChild(node('p', 'Configured schedules, observed run counters and timing targets are different evidence. A successful run does not establish profile availability or end-to-end latency.', 'flows-muted'));
  }
  function render(data) {
    snapshot = data;
    var reference = data.reference;
    el('flowsReferenceTitle').textContent = text(reference.title);
    el('flowsSummary').textContent = text(reference.summary);
    el('flowsAsOf').textContent = 'Reference as of ' + text(reference.asOf) + ' · Sandbox: ' + text(data.sandbox);
    renderGraph(reference);
    (reference.scenarios || []).forEach(function (value) {
      var button = node('button', value.label); button.type = 'button'; button.dataset.scenarioId = value.id;
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', function () { selectScenario(value); });
      el('flowsScenarios').appendChild(button);
    });
    if (reference.scenarios?.length) selectScenario(reference.scenarios[0]);
    (reference.industries || []).forEach(function (industry) {
      var card = node('article', undefined, 'flows-card');
      card.append(node('h3', industry.label), node('h4', 'Source'), node('p', industry.sourceDescription),
        node('h4', 'XDM'), node('p', industry.xdmDescription), node('h4', 'REL datasets'));
      list(card, industry.relDatasets); el('flowsIndustries').appendChild(card);
    });
    (reference.evidence || []).forEach(function (evidence) {
      var card = node('article', undefined, 'flows-card');
      card.append(node('h3', evidence.title), node('p', evidence.description));
      fields(card, [['Verified at', evidence.verifiedAt], ['Evidence level', evidence.level]]);
      el('flowsEvidence').appendChild(card);
    });
    (reference.notes || []).forEach(function (note) { el('flowsNotes').appendChild(node('li', note)); });
    renderLive(data.live);
    el('flowsMotionNote').textContent = reducedMotion.matches ? 'Reduced motion: autoplay is disabled. Use Previous, Next or the step list.' : 'Playback is paused until you choose Play.';
    el('flowsResults').hidden = false;
    fit();
  }
  async function load(refresh) {
    var epoch = ++generation;
    if (controller) controller.abort();
    clear();
    var user = auth.currentUser;
    var permitted = allowed(user);
    el('flowsControls').hidden = !permitted;
    el('flowsSignIn').hidden = !!user && !user.isAnonymous;
    if (!permitted) {
      status(user && !user.isAnonymous ? 'This page is restricted to the lab owner.' : 'Sign in with the lab owner account to view this page.');
      return;
    }
    var requestController = controller = new AbortController();
    var timeout = setTimeout(function () { requestController.abort(); }, 30000);
    el('flowsReload').disabled = el('flowsLive').disabled = true;
    status(refresh ? 'Reading live status…' : 'Loading protected reference…');
    try {
      var token = await user.getIdToken();
      if (!current(user, epoch)) return;
      var response = await fetch('/api/architecture/my-data-flows?sandbox=apalmer' + (refresh ? '&refresh=true' : ''), {
        method: 'GET', headers: { Authorization: 'Bearer ' + token }, credentials: 'omit', cache: 'no-store', signal: requestController.signal,
      });
      if (!current(user, epoch)) return;
      if (response.status === 401) {
        var unauthorized = new Error('Your sign-in is no longer accepted. Open the lab sign-in, then reload this page.');
        unauthorized.status = 401; throw unauthorized;
      }
      if (response.status === 403) {
        var forbidden = new Error('Access denied. The server restricts this page to the owner.');
        forbidden.status = 403; throw forbidden;
      }
      if (!response.ok) throw new Error('Unable to load data flows (HTTP ' + response.status + '). Retry with Reload reference.');
      var data = await response.json();
      if (!current(user, epoch)) return;
      if (data.ok !== true || data.sandbox !== 'apalmer' || !data.reference || !Array.isArray(data.reference.nodes)
        || !Array.isArray(data.reference.edges) || !Array.isArray(data.reference.scenarios)) throw new Error('The server returned an invalid reference. No details were loaded.');
      render(data);
      status(refresh ? 'Read-only status loaded. Review completeness and limitations below.' : 'Protected reference loaded. Live status is on demand.');
      readTrace(false);
    } catch (error) {
      if (!current(user, epoch)) return;
      clear();
      if (error.status === 401 || error.status === 403) el('flowsControls').hidden = true;
      if (error.status === 401) el('flowsSignIn').hidden = false;
      status(error.name === 'AbortError' ? 'The read timed out. Use Reload reference to retry.' : error.message, true);
    } finally {
      clearTimeout(timeout);
      if (generation === epoch) {
        controller = null;
        el('flowsReload').disabled = el('flowsLive').disabled = false;
      }
    }
  }
  el('flowsReload').addEventListener('click', function () { load(false); });
  el('flowsLive').addEventListener('click', function () { load(true); });
  el('flowsSimulationMode').addEventListener('click', function () { setTraceMode(false); });
  el('flowsTraceMode').addEventListener('click', function () { setTraceMode(true); });
  el('flowsTraceConfirm').addEventListener('change', traceButtons);
  el('flowsTraceCreate').addEventListener('click', createTrace);
  el('flowsTraceCheck').addEventListener('click', function () { readTrace(true); });
  el('flowsTraceWatch').addEventListener('click', function () {
    if (traceWatching) {
      stopWatching();
      traceSequence += 1;
      if (traceController) traceController.abort();
      traceController = null; traceBusy = false;
      traceButtons();
      traceMessage('Watching stopped. Creation and ingestion continue; resume or Check now reads the same run.');
    } else {
      startWatching();
      if (traceWatching) readTrace(true);
    }
  });
  el('flowsPrevious').addEventListener('click', function () { stop(); stepIndex = Math.max(0, stepIndex - 1); showStep(); });
  el('flowsNext').addEventListener('click', function () { stop(); if (scenario) stepIndex = Math.min(scenario.steps.length - 1, stepIndex + 1); showStep(); });
  el('flowsPlay').addEventListener('click', function () {
    if (timer !== null) { stop(); return; }
    if (!scenario?.steps?.length) return;
    if (reducedMotion.matches) { el('flowsMotionNote').textContent = 'Reduced motion: use manual stepping; autoplay is disabled.'; return; }
    if (stepIndex === scenario.steps.length - 1) { stepIndex = 0; showStep(); }
    el('flowsPlay').textContent = 'Pause simulation';
    timer = setInterval(function () {
      if (!snapshot || !scenario || stepIndex >= scenario.steps.length - 1) { stop(); return; }
      stepIndex += 1; showStep();
      if (stepIndex === scenario.steps.length - 1) stop();
    }, 2200);
  });
  reducedMotion.addEventListener('change', function () {
    stop();
    if (snapshot) el('flowsMotionNote').textContent = reducedMotion.matches ? 'Reduced motion: use manual stepping; autoplay is disabled.' : 'Playback is paused until you choose Play.';
  });
  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); });
  el('flowsZoomIn').addEventListener('click', function () { applyZoom(zoom + .2); });
  el('flowsZoomOut').addEventListener('click', function () { applyZoom(zoom - .2); });
  el('flowsFit').addEventListener('click', function () { autoFit = true; revealGraph(); });
  el('flowsFocusView').addEventListener('click', function () {
    fullArchitecture = false; autoFit = true;
    el('flowsFocusView').setAttribute('aria-pressed', 'true'); el('flowsFullView').setAttribute('aria-pressed', 'false');
    revealGraph();
  });
  el('flowsFullView').addEventListener('click', function () {
    fullArchitecture = true; autoFit = true;
    el('flowsFocusView').setAttribute('aria-pressed', 'false'); el('flowsFullView').setAttribute('aria-pressed', 'true');
    revealGraph();
  });
  el('flowsExpand').addEventListener('click', function () {
    var expanded = el('flowsGraph').dataset.expanded !== 'true';
    el('flowsGraph').dataset.expanded = String(expanded);
    el('flowsExpand').setAttribute('aria-expanded', String(expanded));
    el('flowsExpand').textContent = expanded ? 'Collapse diagram' : 'Expand diagram';
    fit();
  });
  el('flowsFullscreen').addEventListener('click', function () {
    el('flowsDialog').appendChild(el('flowsDiagramPanel'));
    el('flowsFullscreen').hidden = true; el('flowsCloseFullscreen').hidden = false;
    el('flowsDialog').showModal(); el('flowsCloseFullscreen').focus(); fit();
  });
  el('flowsCloseFullscreen').addEventListener('click', function () { closeFullscreen(); el('flowsFullscreen').focus(); fit(); });
  el('flowsDialog').addEventListener('cancel', function (event) {
    event.preventDefault(); closeFullscreen(); el('flowsFullscreen').focus(); fit();
  });
  var resizeObserver = new ResizeObserver(function () { if (snapshot && autoFit) fit(); });
  resizeObserver.observe(el('flowsGraph'));
  window.addEventListener('pagehide', function () { generation += 1; if (controller) controller.abort(); clear(); status('Page closed. Reload to check owner access.'); });
  window.addEventListener('pageshow', function (event) { if (event.persisted && auth) load(false); });
  try {
    if (!window.firebase || !firebase.auth) throw new Error('Firebase sign-in could not load. Reload this page or open the lab sign-in.');
    if (!firebase.apps.length) firebase.initializeApp(window.firebaseDatabaseConfig);
    auth = firebase.auth();
    auth.onAuthStateChanged(function () { load(false); }, function () {
      generation += 1; if (controller) controller.abort(); clear();
      el('flowsControls').hidden = true; el('flowsSignIn').hidden = false;
      status('Unable to check your sign-in. Open the lab sign-in and try again.', true);
    });
  } catch (error) {
    clear(); el('flowsControls').hidden = true; el('flowsSignIn').hidden = false; status(error.message, true);
  }
})();
