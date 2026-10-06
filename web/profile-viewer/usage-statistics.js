(function () {
  'use strict';

  var auth;
  var snapshot = null;
  var generation = 0;
  var controller = null;
  var numberFormat = new Intl.NumberFormat();
  var dateFormat = new Intl.DateTimeFormat(undefined, {
    timeZone: 'UTC', year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });

  function element(id) { return document.getElementById(id); }
  function node(tag, text) {
    var result = document.createElement(tag);
    if (text !== undefined) result.textContent = String(text);
    return result;
  }
  function count(value) { return numberFormat.format(value); }
  function timestamp(value) {
    if (!value) return node('span', 'Not recorded');
    var result = node('time', dateFormat.format(new Date(value)) + ' UTC');
    result.dateTime = value;
    return result;
  }
  function status(message, error) {
    element('usageStatus').textContent = message;
    element('usageStatus').dataset.error = error ? 'true' : 'false';
  }
  function clearResults() {
    snapshot = null;
    element('usageResults').hidden = true;
    element('usageUpdated').textContent = '';
    ['usageSummary', 'usagePeople', 'usageTools', 'usageHours', 'usageDaily', 'usageNotices',
      'usagePages', 'usageWebsiteSummary', 'usageWebsiteHours', 'usageWebsiteDaily',
      'usageInvocationSummary', 'usageInvocationTools', 'usageInvocationEndpoints',
      'usageInvocationHours', 'usageInvocationDaily', 'usageEngagementSummary', 'usageEngagementPeople'].forEach(function (id) {
      element(id).replaceChildren();
    });
    element('usageCoverage').textContent = '';
    element('usageTruncated').textContent = '';
    element('usageWebsiteCoverage').textContent = '';
    element('usageWebsiteTruncated').textContent = '';
    element('usageInvocationTruncated').textContent = '';
  }
  function row(values) {
    var result = node('tr');
    values.forEach(function (value) {
      var cell = node('td');
      cell.appendChild(value instanceof Node ? value : node('span', value));
      result.appendChild(cell);
    });
    return result;
  }
  function emptyRow(id, columns, text) {
    var result = node('tr');
    var cell = node('td', text);
    cell.colSpan = columns;
    result.appendChild(cell);
    element(id).appendChild(result);
  }
  function renderPeople() {
    element('usagePeople').replaceChildren();
    if (!snapshot) return;
    var search = element('usageSearch').value.trim().toLowerCase();
    var users = snapshot.users.filter(function (user) {
      return (user.email + ' ' + user.name).toLowerCase().indexOf(search) !== -1;
    });
    element('usagePeopleCaption').textContent = count(users.length) + ' matching users with an email address';
    var fragment = document.createDocumentFragment();
    var activity = new Map((snapshot.website?.users || []).map(function (user) { return [user.uid, user]; }));
    var invocations = new Map((snapshot.invocations?.users || []).map(function (user) { return [user.uid, user]; }));
    users.forEach(function (user) {
      var identity = node('span', user.email);
      if (user.name) identity.appendChild(node('small', user.name));
      if (user.disabled) identity.appendChild(node('small', 'Account disabled'));
      var visits = activity.get(user.uid);
      var calls = invocations.get(user.uid);
      var callsAvailable = snapshot.invocations?.summary.invocations > 0;
      var pageDetails = node('span', visits ? count(visits.pageViews) : 'Not collected');
      if (visits?.pages.length) {
        var details = node('details');
        details.appendChild(node('summary', 'Pages visited'));
        var list = node('ul');
        visits.pages.forEach(function (page) { list.appendChild(node('li', page.route + ': ' + count(page.views))); });
        details.appendChild(list);
        pageDetails.appendChild(details);
      }
      var websiteAvailable = snapshot.website && (snapshot.website.enabled
        || snapshot.website.summary.pageViews + snapshot.website.summary.signIns > 0);
      fragment.appendChild(row([
        identity, timestamp(user.createdAt), timestamp(user.lastSignInAt),
        count(user.activeKeys) + ' / ' + count(user.revokedKeys), timestamp(user.lastKeyUseAt),
        count(user.observedMcpEvents), timestamp(user.lastObservedMcpAt),
        websiteAvailable ? pageDetails : 'Not collected',
        websiteAvailable ? timestamp(visits?.lastPageViewAt) : 'Not collected',
        websiteAvailable ? count(visits?.signIns || 0) : 'Not collected',
        websiteAvailable ? timestamp(visits?.lastSignInEventAt) : 'Not collected',
        callsAvailable ? count(calls?.invocations || 0) : 'Not recorded',
        callsAvailable ? timestamp(calls?.latestAt) : 'Not recorded',
      ]));
    });
    element('usagePeople').appendChild(fragment);
    if (!users.length) emptyRow('usagePeople', 13, search ? 'No users match your search.' : 'No email-linked Firebase users are available.');
  }
  function renderHours(hours, id, caption) {
    var table = element(id);
    table.replaceChildren();
    table.appendChild(node('caption', caption));
    var head = node('thead');
    var header = node('tr');
    var first = node('th', 'Day / hour');
    first.scope = 'col';
    header.appendChild(first);
    for (var hour = 0; hour < 24; hour += 1) {
      var cell = node('th', String(hour).padStart(2, '0'));
      cell.scope = 'col';
      header.appendChild(cell);
    }
    head.appendChild(header);
    table.appendChild(head);
    var body = node('tbody');
    ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(function (day, dayIndex) {
      var result = node('tr');
      var label = node('th', day);
      label.scope = 'row';
      result.appendChild(label);
      hours[dayIndex].forEach(function (events) {
        var cell = node('td', count(events));
        cell.dataset.activity = events > 0 ? 'true' : 'false';
        result.appendChild(cell);
      });
      body.appendChild(result);
    });
    table.appendChild(body);
  }
  function renderWebsite(website) {
    var available = website && (website.enabled || website.summary.pageViews + website.summary.signIns > 0);
    element('usageWebsiteCoverage').textContent = website?.enabled
      ? 'Collection is enabled for ' + count(website.routes.length) + ' core lab routes. These are observed client reports, not complete access logs. Times use server receipt in UTC.'
      : 'New website collection is disabled. Any retained history is shown below; no page visits or login history can be inferred from missing records.';
    [
      ['Observed page visits', website?.summary.pageViews],
      ['Observed successful lab logins', website?.summary.signIns],
      ['Observed website users (current directory)', website?.summary.activeUsers],
    ].forEach(function (metric) {
      var entry = node('div');
      entry.appendChild(node('dt', metric[0]));
      entry.appendChild(node('dd', available ? count(metric[1]) : 'Not collected'));
      element('usageWebsiteSummary').appendChild(entry);
    });
    element('usageWebsiteTruncated').hidden = !website?.truncated;
    element('usageWebsiteTruncated').textContent = 'Website read limit reached: only the latest ' +
      count(website?.limit || 5000) + ' events are included. People, pages and timing totals are incomplete.';
    (website?.pages || []).forEach(function (page) {
      element('usagePages').appendChild(row([
        page.route, count(page.views), count(page.users), count(page.reloads), timestamp(page.lastViewedAt),
      ]));
    });
    if (!website?.pages.length) emptyRow('usagePages', 5,
      available ? 'No page-view records are available in this window; this does not prove no visits.' : 'Page-view collection is disabled; no retained visits in this window.');
    renderHours(website?.hours || Array.from({ length: 7 }, function () { return Array(24).fill(0); }),
      'usageWebsiteHours', 'Observed page visits and lab logins by weekday/hour (UTC)');
    element('usageWebsiteHours').hidden = !available;
    (website?.daily || []).forEach(function (day) {
      element('usageWebsiteDaily').appendChild(row([day.date, count(day.pageViews), count(day.signIns)]));
    });
    if (!website?.daily.length) emptyRow('usageWebsiteDaily', 3, 'No retained website event history is available in this window.');
  }
  function renderInvocations(invocations) {
    var available = invocations?.summary.invocations > 0;
    [
      ['Recorded dispatch outcomes', 'invocations'],
      ['Observed MCP users (current directory)', 'activeUsers'],
      ['Unattributed dispatches', 'unattributed'],
      ['SDK results without isError', 'result'],
      ['SDK tool errors', 'tool_error'],
      ['Rejected before handler execution', 'rejected'],
    ].forEach(function (metric) {
      var entry = node('div');
      entry.appendChild(node('dt', metric[0]));
      entry.appendChild(node('dd', available ? count(invocations.summary[metric[1]]) : 'Not recorded'));
      element('usageInvocationSummary').appendChild(entry);
    });
    element('usageInvocationTruncated').hidden = !invocations?.truncated;
    element('usageInvocationTruncated').textContent = 'Read limit reached: only the latest ' +
      count(invocations?.limit || 5000) + ' dispatch records are included. Totals and attribution are incomplete.';
    (invocations?.tools || []).forEach(function (tool) {
      element('usageInvocationTools').appendChild(row([
        tool.name, count(tool.invocations), count(tool.result), count(tool.tool_error),
        count(tool.rejected), count(tool.protocol_error), count(tool.cancelled),
        tool.averageDurationMs === null ? 'Not recorded' : count(tool.averageDurationMs) + ' ms',
      ]));
    });
    if (!available) emptyRow('usageInvocationTools', 8,
      'No retained dispatch records in this window. Collection defaults off; this does not prove no MCP use.');
    (invocations?.endpoints || []).forEach(function (endpoint) {
      element('usageInvocationEndpoints').appendChild(row([endpoint.name, count(endpoint.invocations)]));
    });
    if (!available) emptyRow('usageInvocationEndpoints', 2, 'Endpoint use has not been recorded in this window.');
    renderHours(invocations?.hours || Array.from({ length: 7 }, function () { return Array(24).fill(0); }),
      'usageInvocationHours', 'Recorded dispatch outcomes by completion weekday/hour (UTC)');
    element('usageInvocationHours').hidden = !available;
    (invocations?.daily || []).forEach(function (day) {
      element('usageInvocationDaily').appendChild(row([day.date, count(day.invocations)]));
    });
    if (!available) emptyRow('usageInvocationDaily', 2, 'No retained dispatch history in this window.');
  }
  function renderEngagement(engagement) {
    var summary = engagement?.summary;
    [['Observed website sessions', summary?.sessions],
      ['Users with observed sessions', summary?.users],
      ['Estimated active minutes', summary?.activeTimeRecorded ? Math.round(summary.activeMs / 6000) / 10 : null],
    ].forEach(function (metric) {
      var entry = node('div');
      entry.appendChild(node('dt', metric[0]));
      entry.appendChild(node('dd', metric[1] === null || metric[1] === undefined
        || !summary?.sessions ? 'Not recorded' : count(metric[1])));
      element('usageEngagementSummary').appendChild(entry);
    });
    var people = new Map(snapshot.users.map(function (user) { return [user.uid, user]; }));
    (engagement?.users || []).forEach(function (user) {
      element('usageEngagementPeople').appendChild(row([
        people.get(user.uid)?.email || 'Unavailable directory user', count(user.sessions),
        user.activeTimeRecorded ? count(Math.round(user.activeMs / 6000) / 10) : 'Not recorded',
      ]));
    });
    if (!engagement?.users.length) emptyRow('usageEngagementPeople', 3, 'No retained website activity in this window; no sessions can be inferred.');
  }
  function render(data) {
    snapshot = data;
    var summary = data.summary;
    [
      ['Registered users (current snapshot)', summary.registeredUsers],
      ['Users whose latest sign-in is in this window', summary.usersWithRecentSignIn],
      ['Users with MCP keys (active or revoked)', summary.keyOwners],
      ['Active keys (current snapshot)', summary.activeKeys],
      ['Revoked keys (current snapshot)', summary.revokedKeys],
      ['Observed MCP users in this window', summary.observedMcpUsers],
      ['Observed MCP audit events', summary.observedMcpEvents],
      ['Unattributed MCP audit events', summary.unattributedEvents],
      ['Accounts without email (excluded from people)', summary.accountsWithoutEmail],
    ].forEach(function (metric) {
      var entry = node('div');
      entry.appendChild(node('dt', metric[0]));
      entry.appendChild(node('dd', count(metric[1])));
      element('usageSummary').appendChild(entry);
    });
    element('usageCoverage').textContent = 'Available Firestore audits from ' +
      dateFormat.format(new Date(data.period.start)) + ' to ' + dateFormat.format(new Date(data.period.end)) +
      ' UTC. Audit coverage is partial; account and key figures are current snapshots.';
    var clipped = [];
    if (data.coverage.usersTruncated) clipped.push('first ' + count(data.coverage.limits.users) + ' accounts');
    if (data.coverage.keysTruncated) clipped.push('first ' + count(data.coverage.limits.keys) + ' keys');
    if (data.coverage.auditTruncated) clipped.push('most recent ' + count(data.coverage.limits.auditEvents) + ' audit events');
    element('usageTruncated').hidden = !clipped.length;
    element('usageTruncated').textContent = 'Read limit reached: showing ' + clipped.join(', ') +
      '. Totals, attribution and time distributions are incomplete.';
    data.coverage.notices.forEach(function (notice) { element('usageNotices').appendChild(node('li', notice)); });
    renderPeople();
    data.tools.forEach(function (tool) {
      element('usageTools').appendChild(row([
        tool.name, count(tool.events), count(tool.errors), count(tool.unknownResults),
        tool.averageDurationMs === null ? 'Not recorded' : count(tool.averageDurationMs) + ' ms',
        count(tool.timedEvents),
      ]));
    });
    if (!data.tools.length) emptyRow('usageTools', 6, 'No MCP audit records are available in this window. This does not prove the MCP was unused.');
    renderHours(data.hours, 'usageHours', 'Audit events by weekday and hour (UTC)');
    renderWebsite(data.website);
    renderInvocations(data.invocations);
    renderEngagement(data.engagement);
    data.daily.forEach(function (day) { element('usageDaily').appendChild(row([day.date, count(day.events)])); });
    if (!data.daily.length) emptyRow('usageDaily', 2, 'No daily audit counts are available in this window.');
    element('usageUpdated').textContent = 'Snapshot: ' + dateFormat.format(new Date(data.generatedAt)) + ' UTC';
    element('usageResults').hidden = false;
  }
  async function load() {
    var requestGeneration = ++generation;
    if (controller) controller.abort();
    clearResults();
    var user = auth.currentUser;
    var allowed = user && !user.isAnonymous && user.email === 'apalmer@adobe.com';
    element('usageControls').hidden = !allowed;
    element('usageSignIn').hidden = !!user && !user.isAnonymous;
    if (!allowed) {
      status(user && !user.isAnonymous ? 'This dashboard is restricted to the lab owner.' : 'Sign in with the lab owner account to view statistics.', false);
      return;
    }
    controller = new AbortController();
    var requestController = controller;
    var timeout = setTimeout(function () { requestController.abort(); }, 25000);
    element('usageRefresh').disabled = true;
    element('usageDays').disabled = true;
    status('Loading usage statistics...', false);
    try {
      var token = await user.getIdToken();
      if (generation !== requestGeneration) return;
      var response = await fetch('/api/lab/usage?days=' + encodeURIComponent(element('usageDays').value) +
        '&excludeOwner=' + String(element('usageExcludeOwner').checked), {
        headers: { Authorization: 'Bearer ' + token }, cache: 'no-store', signal: requestController.signal,
      });
      var data = await response.json();
      if (generation !== requestGeneration || auth.currentUser?.uid !== user.uid) return;
      if (!response.ok || data.ok !== true) throw new Error(data.error || 'Unable to load usage statistics. Retry shortly.');
      render(data);
      status('Statistics loaded. All usage data is owner-only; coverage is partial.', false);
    } catch (error) {
      if (generation !== requestGeneration) return;
      clearResults();
      status(error.name === 'AbortError' ? 'The request timed out. Refresh statistics to retry.' : error.message, true);
    } finally {
      clearTimeout(timeout);
      if (generation === requestGeneration) {
        element('usageRefresh').disabled = false;
        element('usageDays').disabled = false;
      }
    }
  }
  element('usageRefresh').addEventListener('click', load);
  element('usageDays').addEventListener('change', load);
  element('usageExcludeOwner').addEventListener('change', load);
  element('usageSearch').addEventListener('input', renderPeople);
  try {
    if (!window.firebase || !firebase.auth) throw new Error('Firebase sign-in could not load. Reload this page or open the lab sign-in.');
    if (!firebase.apps.length) firebase.initializeApp(window.firebaseDatabaseConfig);
    auth = firebase.auth();
    auth.onAuthStateChanged(load, function () {
      generation += 1;
      if (controller) controller.abort();
      clearResults();
      element('usageControls').hidden = true;
      element('usageSignIn').hidden = false;
      status('Unable to check your sign-in. Open the lab sign-in and try again.', true);
    });
  } catch (error) {
    status(error.message, true);
    element('usageSignIn').hidden = false;
  }
})();
