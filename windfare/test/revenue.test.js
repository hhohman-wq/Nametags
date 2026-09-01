import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import { buildApp } from '../server/index.js';
import { MockFareProvider } from '../server/provider.js';
import { seed } from '../server/seed.js';
import { openDb } from '../server/db.js';
import { affiliateTarget, verifyStripeSignature, FREE_WATCH_LIMIT } from '../server/revenue.js';

async function withServer(fn) {
  const db = openDb(':memory:');
  await seed(db, { seedNum: 7, originLimit: 4 });
  const { server } = await buildApp({ db, providers: [new MockFareProvider({ seed: 7 })] });
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  try {
    await fn(base, db);
  } finally {
    server.close();
  }
}

const get = async (base, path) => {
  const res = await fetch(base + path, { redirect: 'manual' });
  return res;
};
const post = async (base, path, body) => {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  return { status: res.status, body: await res.json() };
};
const makeUser = async (base, extra = {}) =>
  (await post(base, '/api/users', { home: 'JFK', budget: 900, ...extra })).body;

test('affiliateTarget: untagged without a marker, Aviasales with one', () => {
  const trip = { origin: 'JFK', dest: 'CUN', departDate: '2026-10-10', returnDate: '2026-10-15' };
  const bare = affiliateTarget(trip, {});
  assert.equal(bare.network, 'google-flights');
  assert.equal(bare.commissionable, false);

  const tagged = affiliateTarget(trip, { TRAVELPAYOUTS_MARKER: 'm123' });
  assert.equal(tagged.network, 'aviasales');
  assert.equal(tagged.commissionable, true);
  assert.match(tagged.url, /aviasales\.com\/search\/JFK1010CUN15101\?marker=m123/);
});

test('/go records a click and redirects out', () =>
  withServer(async (base, db) => {
    const user = await makeUser(base);
    const res = await get(base, `/go?route=1&depart=2026-10-10&ret=2026-10-15&price=400&user=${user.id}`);
    assert.equal(res.status, 302);
    assert.ok(res.headers.get('location').includes('google.com/travel/flights'));
    const click = db.prepare('SELECT * FROM clicks').get();
    assert.equal(click.user_id, user.id);
    assert.equal(click.price, 400);
    assert.equal(click.target, 'google-flights');
    assert.equal(click.est_commission, 0); // no marker configured in tests
  }));

test('free tier is capped at FREE_WATCH_LIMIT watches; Pro is not', () =>
  withServer(async (base, db) => {
    const user = await makeUser(base);
    for (let routeId = 1; routeId <= FREE_WATCH_LIMIT; routeId++) {
      assert.equal((await post(base, '/api/watches', { user: user.id, routeId })).status, 200);
    }
    const over = await post(base, '/api/watches', { user: user.id, routeId: FREE_WATCH_LIMIT + 1 });
    assert.equal(over.status, 402);
    assert.equal(over.body.code, 'upgrade_required');

    db.prepare('UPDATE users SET pro = 1 WHERE id = ?').run(user.id);
    assert.equal((await post(base, '/api/watches', { user: user.id, routeId: FREE_WATCH_LIMIT + 1 })).status, 200);
  }));

test('dev-mode checkout grants Pro and logs a payment', () =>
  withServer(async (base, db) => {
    const user = await makeUser(base);
    const res = await post(base, '/api/billing/checkout', { user: user.id });
    assert.equal(res.status, 200);
    assert.equal(res.body.dev, true);
    assert.equal(db.prepare('SELECT pro FROM users WHERE id = ?').get(user.id).pro, 1);
    const pay = db.prepare('SELECT * FROM payments WHERE user_id = ?').get(user.id);
    assert.equal(pay.amount_cents, 4900);
    assert.equal(pay.processor, 'dev');
  }));

test('fresh rare fares are held back from free users, visible to Pro', () =>
  withServer(async (base, db) => {
    const user = await makeUser(base);
    // Plant a rare fare that landed one minute ago on a JFK route.
    const route = db.prepare("SELECT id FROM routes WHERE origin = 'JFK' LIMIT 1").get();
    db.prepare(
      `INSERT INTO deals (route_id, type, price, typical, pct_below, depart_date, return_date, headline, created_at, active)
       VALUES (?, 'anomaly', 199, 420, 53, '2026-10-10', '2026-10-15', 'test rare fare', ?, 1)`
    ).run(route.id, new Date(Date.now() - 60000).toISOString());

    const freeFeed = await (await fetch(`${base}/api/feed?user=${user.id}`)).json();
    assert.ok(freeFeed.lockedCount >= 1, 'free feed reports locked rare fares');
    assert.ok(!freeFeed.cards.some((c) => c.headline === 'test rare fare'));

    db.prepare('UPDATE users SET pro = 1 WHERE id = ?').run(user.id);
    const proFeed = await (await fetch(`${base}/api/feed?user=${user.id}`)).json();
    assert.ok(proFeed.cards.some((c) => c.headline === 'test rare fare'), 'Pro sees it immediately');
  }));

test('stripe webhook signature verification', () => {
  const secret = 'whsec_testsecret';
  const payload = JSON.stringify({ type: 'checkout.session.completed' });
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
  assert.equal(verifyStripeSignature(payload, `t=${t},v1=${v1}`, secret), true);
  assert.equal(verifyStripeSignature(payload, `t=${t},v1=${'0'.repeat(64)}`, secret), false);
  assert.equal(verifyStripeSignature(payload, undefined, secret), false);
});

test('admin stats aggregates clicks and Pro revenue', () =>
  withServer(async (base, db) => {
    const user = await makeUser(base);
    await get(base, `/go?route=1&depart=2026-10-10&ret=2026-10-15&price=400&user=${user.id}`);
    await get(base, `/go?route=2&depart=2026-10-12&ret=2026-10-17&price=250&user=${user.id}`);
    await post(base, '/api/billing/checkout', { user: user.id });

    const stats = await (await fetch(`${base}/api/admin/stats`)).json();
    assert.equal(stats.affiliate.clicksAll, 2);
    assert.equal(stats.pro.subscribers, 1);
    assert.equal(stats.pro.arrCents, 4900);
    assert.equal(stats.pro.collectedCents, 4900);
    assert.ok(stats.daily.length >= 1);
    assert.ok(stats.topRoutes.length >= 1);
  }));
