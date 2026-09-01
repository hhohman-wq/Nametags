import test from 'node:test';
import assert from 'node:assert/strict';

import { buildApp } from '../server/index.js';
import { MockFareProvider } from '../server/provider.js';
import { seed } from '../server/seed.js';
import { openDb } from '../server/db.js';

async function withServer(fn) {
  const db = openDb(':memory:');
  await seed(db, { seedNum: 7, originLimit: 4 });
  const { server } = await buildApp({ dbPath: undefined, db, providers: [new MockFareProvider({ seed: 7 })] });
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  try {
    await fn(base, db);
  } finally {
    server.close();
  }
}

const get = async (base, path) => {
  const res = await fetch(base + path);
  return { status: res.status, body: await res.json() };
};
const post = async (base, path, body) => {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { status: res.status, body: await res.json() };
};

test('health and airports', () =>
  withServer(async (base) => {
    assert.equal((await get(base, '/api/health')).body.ok, true);
    const airports = (await get(base, '/api/airports')).body;
    assert.ok(airports.origins.length >= 10);
    assert.deepEqual(airports.vibes, ['beach', 'city', 'ski', 'nature']);
  }));

test('user creation validates home airport', () =>
  withServer(async (base) => {
    assert.equal((await post(base, '/api/users', {})).status, 400);
    const { status, body } = await post(base, '/api/users', { home: 'BOS', budget: 650, vibes: ['ski'] });
    assert.equal(status, 200);
    assert.ok(body.id);
    assert.equal(body.home, 'BOS');
  }));

test('feed returns ranked cards scoped to the home airport', () =>
  withServer(async (base) => {
    const user = (await post(base, '/api/users', { home: 'BOS', budget: 900, vibes: ['ski'] })).body;
    const feed = (await get(base, `/api/feed?user=${user.id}`)).body;
    assert.equal(feed.home, 'BOS');
    assert.ok(feed.cards.length > 0, 'seed should leave live cards in the feed');
    for (const c of feed.cards) {
      assert.equal(c.origin, 'BOS');
      assert.ok(['flash', 'anomaly', 'quick'].includes(c.kind));
      assert.ok(c.trend.length >= 2, 'cards carry sparkline data');
      assert.ok(c.bookUrl.startsWith('/go?'), 'booking is a tracked handoff');
    }
    const scores = feed.cards.map((c) => c.score);
    assert.deepEqual(scores, [...scores].sort((a, b) => b - a), 'cards are ranked');
  }));

test('vibe filter narrows the feed', () =>
  withServer(async (base) => {
    const user = (await post(base, '/api/users', { home: 'JFK', budget: 2000 })).body;
    const beach = (await get(base, `/api/feed?user=${user.id}&vibe=beach`)).body;
    for (const c of beach.cards) assert.ok(c.dest.vibes.includes('beach'));
  }));

test('watch lifecycle: create, list, delete', () =>
  withServer(async (base) => {
    const user = (await post(base, '/api/users', { home: 'JFK', budget: 800 })).body;
    const feed = (await get(base, `/api/feed?user=${user.id}`)).body;
    const routeId = feed.cards[0].routeId;

    const created = await post(base, '/api/watches', { user: user.id, routeId });
    assert.equal(created.status, 200);
    assert.ok(created.body.threshold > 0, 'default threshold derives from route median');

    const list = (await get(base, `/api/watches?user=${user.id}`)).body;
    assert.equal(list.length, 1);
    assert.equal(list[0].routeId, routeId);

    const del = await fetch(`${base}/api/watches?user=${user.id}&routeId=${routeId}`, { method: 'DELETE' });
    assert.equal(del.status, 200);
    assert.equal((await get(base, `/api/watches?user=${user.id}`)).body.length, 0);
  }));

test('share page renders a deal', () =>
  withServer(async (base, db) => {
    const deal = db.prepare('SELECT id FROM deals WHERE active = 1 LIMIT 1').get();
    assert.ok(deal, 'seed leaves at least one active deal');
    const res = await fetch(`${base}/deal/${deal.id}`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /WINDFARE/);
    assert.match(html, /og:title/);
  }));

test('static frontend is served', () =>
  withServer(async (base) => {
    const res = await fetch(base + '/');
    assert.equal(res.status, 200);
    assert.match(await res.text(), /<title>Windfare<\/title>/);
    assert.equal((await fetch(base + '/app.js')).status, 200);
    // No path traversal.
    assert.equal((await fetch(base + '/..%2fserver%2fdb.js')).status, 404);
  }));
