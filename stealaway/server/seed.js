// Seeds airports, routes, and 90 days of synthetic fare history, then runs a
// few "today" polls so the feed opens with live deals. Idempotent: wipes and
// rebuilds market data (users/watches/notifications are preserved).

import { openDb, DEFAULT_DB_PATH } from './db.js';
import { ORIGINS, DESTINATIONS, routesForOrigin } from './data/airports.js';
import { MockFareProvider, mulberry32, isoDate } from './provider.js';
import { ingestQuotes, expireDeals } from './dealengine.js';

const DAY = 86400000;

export async function seed(db, { seedNum = 42, historyDays = 90, now = Date.now(), originLimit = 0 } = {}) {
  const rand = mulberry32(seedNum ^ 0x5eed);
  const origins = originLimit > 0 ? ORIGINS.slice(0, originLimit) : ORIGINS;

  db.exec('BEGIN');
  db.exec('DELETE FROM deals; DELETE FROM price_obs; DELETE FROM routes; DELETE FROM airports;');

  const insAirport = db.prepare(
    'INSERT INTO airports (code, city, name, country, vibes, nightly, todo, is_origin) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  for (const o of ORIGINS) insAirport.run(o.code, o.city, o.name, 'USA', '[]', null, '[]', 1);
  for (const d of DESTINATIONS) {
    insAirport.run(d.code, d.city, null, d.country, JSON.stringify(d.vibes), d.nightly ?? null, JSON.stringify(d.todo ?? []), 0);
  }

  const insRoute = db.prepare('INSERT INTO routes (origin, dest, base_price) VALUES (?, ?, ?)');
  const routes = [];
  for (const o of origins) {
    for (const d of routesForOrigin(o.code)) {
      const res = insRoute.run(o.code, d.code, d.basePrice);
      routes.push({ id: Number(res.lastInsertRowid), origin: o.code, dest: d.code, base_price: d.basePrice });
    }
  }

  // Backfill: one observation per route per day. Smooth seasonal wobble +
  // noise, occasional dips, so medians and P10 are meaningful on day one.
  const insObs = db.prepare(
    'INSERT INTO price_obs (route_id, depart_date, price, is_sale, observed_at) VALUES (?, ?, ?, 0, ?)'
  );
  for (const r of routes) {
    const phase = rand() * Math.PI * 2;
    for (let d = historyDays; d >= 1; d--) {
      const t = now - d * DAY;
      const wobble = 1 + 0.13 * Math.sin(phase + (d / historyDays) * Math.PI * 3);
      const noise = 0.9 + rand() * 0.2;
      const dip = rand() < 0.04 ? 0.72 : 1; // historic sales keep P10 honest
      const price = Math.round(r.base_price * wobble * noise * dip);
      insObs.run(r.id, isoDate(t + 14 * DAY), price, new Date(t).toISOString());
    }
  }

  // "Today": several poll passes so sales/anomalies exist at first launch.
  const provider = new MockFareProvider({ seed: seedNum, now: () => now });
  let dealsCreated = 0;
  for (let pass = 0; pass < 6; pass++) {
    for (const r of routes) {
      dealsCreated += ingestQuotes(db, r, await provider.quotes(r), { now }).length;
    }
  }
  expireDeals(db, { now });
  // Backdate seeded deals past the Pro early-access hold so a fresh install
  // opens with a full free feed; deals the live poller finds later still get
  // the Pro-first window.
  db.prepare('UPDATE deals SET created_at = ? WHERE active = 1').run(new Date(now - 2 * 3600000).toISOString());
  db.exec('COMMIT');
  return { routes: routes.length, deals: dealsCreated };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const db = openDb();
  const res = await seed(db);
  console.log(`Seeded ${DEFAULT_DB_PATH}: ${res.routes} routes, ${res.deals} live deals.`);
}
