import test from 'node:test';
import assert from 'node:assert/strict';

import { openDb } from '../server/db.js';
import { seed } from '../server/seed.js';
import { percentile, routeStats, classifyQuote, ingestQuotes, expireDeals } from '../server/dealengine.js';
import { MockFareProvider } from '../server/provider.js';
import { pollOnce, fireWatchAlerts } from '../server/poller.js';

async function freshDb() {
  const db = openDb(':memory:');
  await seed(db, { seedNum: 7, originLimit: 4 });
  return db;
}

test('percentile interpolates correctly', () => {
  assert.equal(percentile([100, 200, 300, 400, 500], 0.5), 300);
  assert.equal(percentile([100, 200], 0.5), 150);
  assert.equal(percentile([100], 0.1), 100);
  assert.ok(Number.isNaN(percentile([], 0.5)));
});

test('seed produces routes, history, and live deals', async () => {
  const db = await freshDb();
  assert.ok(db.prepare('SELECT COUNT(*) AS n FROM routes').get().n > 100);
  assert.ok(db.prepare('SELECT COUNT(*) AS n FROM price_obs').get().n > 10000);
  const stats = routeStats(db, 1);
  assert.ok(stats.count >= 90);
  assert.ok(stats.p10 < stats.median);
});

test('classifyQuote flags anomalies and flash sales, ignores normal fares', () => {
  const stats = { count: 90, median: 500, p10: 400 };
  assert.equal(classifyQuote({ price: 510, isSale: false }, stats), null);
  assert.equal(classifyQuote({ price: 390, isSale: false }, stats).type, 'anomaly');
  const flash = classifyQuote({ price: 300, isSale: true, saleUntil: '2099-01-01T00:00:00Z' }, stats);
  assert.equal(flash.type, 'flash');
  assert.ok(flash.pctBelow >= 15);
  // Not enough history -> never a deal.
  assert.equal(classifyQuote({ price: 100, isSale: true }, { count: 5, median: 500, p10: 400 }), null);
});

test('ingestQuotes records history and creates at most one active deal per departure', async () => {
  const db = await freshDb();
  const route = db.prepare('SELECT id, origin, dest, base_price FROM routes WHERE id = 1').get();
  const stats = routeStats(db, route.id);
  const cheap = Math.round(stats.p10 * 0.8);
  const quote = { departDate: '2026-10-01', returnDate: '2026-10-06', price: cheap, isSale: false };

  const first = ingestQuotes(db, route, [quote]);
  assert.equal(first.length, 1);
  // Same price again: no duplicate deal.
  assert.equal(ingestQuotes(db, route, [quote]).length, 0);
  // Better price: replaces the deal.
  const better = ingestQuotes(db, route, [{ ...quote, price: cheap - 30 }]);
  assert.equal(better.length, 1);
  const active = db
    .prepare("SELECT COUNT(*) AS n FROM deals WHERE route_id = ? AND depart_date = '2026-10-01' AND active = 1")
    .get(route.id);
  assert.equal(active.n, 1);
});

test('expireDeals kills timed-out flash sales', async () => {
  const db = await freshDb();
  const res = db.prepare(
    `INSERT INTO deals (route_id, type, price, typical, pct_below, depart_date, return_date, expires_at, created_at, active)
     VALUES (1, 'flash', 200, 400, 50, '2026-10-01', '2026-10-06', ?, ?, 1)`
  ).run(new Date(Date.now() - 3600000).toISOString(), new Date().toISOString());
  expireDeals(db);
  const row = db.prepare('SELECT active FROM deals WHERE id = ?').get(Number(res.lastInsertRowid));
  assert.equal(row.active, 0);
});

test('watch fires a notification when price crosses threshold, then de-dupes', async () => {
  const db = await freshDb();
  db.prepare("INSERT INTO users (id, home, budget, vibes, created_at) VALUES ('u1', 'JFK', 800, '[]', ?)").run(
    new Date().toISOString()
  );
  db.prepare("INSERT INTO watches (user_id, route_id, threshold, created_at) VALUES ('u1', 1, 10000, ?)").run(
    new Date().toISOString()
  ); // absurdly high threshold: any price qualifies

  assert.equal(fireWatchAlerts(db), 1);
  const n = db.prepare("SELECT * FROM notifications WHERE user_id = 'u1'").get();
  assert.equal(n.kind, 'drop');
  assert.match(n.title, /dropped to \$\d+/);
  // Same price again: suppressed (needs a further 2% improvement).
  assert.equal(fireWatchAlerts(db), 0);
});

test('pollOnce runs all providers end to end and keeps history growing', async () => {
  const db = await freshDb();
  const before = db.prepare('SELECT COUNT(*) AS n FROM price_obs').get().n;
  const providers = [new MockFareProvider({ seed: 99 })];
  const res = await pollOnce(db, providers);
  assert.ok(db.prepare('SELECT COUNT(*) AS n FROM price_obs').get().n > before);
  assert.equal(res.errors, 0);
});

test('a failing provider does not kill the poll pass', async () => {
  const db = await freshDb();
  const broken = {
    name: 'broken',
    batchSize: 5,
    quotes: async () => { throw new Error('boom'); }
  };
  const res = await pollOnce(db, [broken, new MockFareProvider({ seed: 3 })]);
  assert.ok(res.errors > 0);
  assert.ok(res.dealsCreated >= 0); // mock still ran
});

test('rate-limited providers get a rotating batch of routes', async () => {
  const db = await freshDb();
  const asked = [];
  const tiny = {
    name: 'tiny',
    batchSize: 3,
    quotes: async (route) => { asked.push(route.id); return []; }
  };
  await pollOnce(db, [tiny]);
  await pollOnce(db, [tiny]);
  assert.equal(asked.length, 6);
  assert.equal(new Set(asked).size, 6, 'second tick advances to fresh routes');
});
