'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildEventsPayload } = require('../profileEventsService');

const ecid = '12345678901234567890';

async function withFetch(fetchImpl, run) {
  const originalFetch = global.fetch;
  global.fetch = fetchImpl;
  try {
    return await run();
  } finally {
    global.fetch = originalFetch;
  }
}

function response(data, status = 200) {
  return new Response(JSON.stringify(data), { status });
}

function profileOrEvents(handler) {
  return (url) => {
    const params = new URL(url).searchParams;
    if (params.get('schema.name') === '_xdm.context.profile') return response({});
    return handler(params);
  };
}

function loadEvents() {
  return buildEventsPayload(ecid, 'ecid', 'test', 'token', 'client', 'org');
}

test('reports the Profile API error if every event namespace fails', async () => {
  await withFetch(profileOrEvents(() => response({ message: 'Profile unavailable' }, 503)), async () => {
    await assert.rejects(loadEvents(), /Profile unavailable/);
  });
});

test('allows an empty successful fallback namespace after an unsupported namespace', async () => {
  await withFetch(profileOrEvents((params) =>
    params.get('relatedEntityIdNS') === 'ECID'
      ? response({ message: 'Unknown namespace' }, 404)
      : response({ children: [] })), async () => {
    const result = await loadEvents();
    assert.deepEqual(result.events, []);
    assert.equal(result.source, 'experience_events_empty');
  });
});

test('reports an uncertain fallback failure even if another namespace returned no events', async () => {
  await withFetch(profileOrEvents((params) =>
    params.get('relatedEntityIdNS') === 'ECID'
      ? response({ children: [] })
      : response({ message: 'Profile unavailable' }, 503)), async () => {
    await assert.rejects(loadEvents(), /Profile unavailable/);
  });
});

test('returns events from a successful fallback namespace', async () => {
  await withFetch(profileOrEvents((params) =>
    params.get('relatedEntityIdNS') === 'ECID'
      ? response({ message: 'Unknown namespace' }, 404)
      : response({ children: [{ id: 'event-1', entity: { eventType: 'test.event' } }] })), async () => {
    const result = await loadEvents();
    assert.equal(result.source, 'experience_events_paginated');
    assert.equal(result.events[0].entityId, 'event-1');
  });
});

test('does not report malformed successful event responses as empty', async () => {
  await withFetch(profileOrEvents(() => new Response('invalid json')), async () => {
    await assert.rejects(loadEvents(), SyntaxError);
  });
});

test('reports a later page failure instead of returning incomplete events', async () => {
  await withFetch(profileOrEvents((params) => {
    if (params.has('cursor')) return response({ message: 'Page unavailable' }, 503);
    return response({
      children: Array.from({ length: 100 }, (_, i) => ({ id: String(i) })),
      _links: { next: { href: '/access/entities?cursor=next' } },
    });
  }), async () => {
    await assert.rejects(loadEvents(), /page 2 failed: Page unavailable/);
  });
});

test('follows a next link even when the current page is short', async () => {
  await withFetch(profileOrEvents((params) =>
    params.has('cursor')
      ? response({ children: [{ id: 'event-2' }] })
      : response({ children: [{ id: 'event-1' }], _links: { next: { href: '/access/entities?cursor=next' } } })), async () => {
    const result = await loadEvents();
    assert.deepEqual(result.events.map((event) => event.entityId), ['event-1', 'event-2']);
  });
});

test('reports incomplete results when a next link remains at the page limit', async () => {
  let requests = 0;
  await withFetch(profileOrEvents(() => {
    requests += 1;
    return response({
      children: [{ id: `event-${requests}` }],
      _links: { next: { href: '/access/entities?cursor=next' } },
    });
  }), async () => {
    await assert.rejects(loadEvents(), /exceeded the 10-page limit; results are incomplete/);
    assert.equal(requests, 10);
  });
});

test('returns the last allowed page when no next link remains', async () => {
  let requests = 0;
  await withFetch(profileOrEvents(() => {
    requests += 1;
    return response({
      children: [{ id: `event-${requests}` }],
      ...(requests < 10 ? { _links: { next: { href: '/access/entities?cursor=next' } } } : {}),
    });
  }), async () => {
    const result = await loadEvents();
    assert.equal(result.events.length, 10);
    assert.equal(requests, 10);
  });
});
