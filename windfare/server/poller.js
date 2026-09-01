// The heartbeat: poll fares from every active provider, record history,
// detect deals, and fire watch alerts. Real providers are rate-limited, so
// each gets a round-robin batch of routes per tick (provider.batchSize);
// the mock covers the whole matrix every time.

import { ingestQuotes, expireDeals, routeStats } from './dealengine.js';

const cursors = new WeakMap(); // provider -> next route index

function batchFor(provider, routes) {
  if (!(provider.batchSize < routes.length)) return routes;
  const start = cursors.get(provider) ?? 0;
  const batch = [];
  for (let i = 0; i < provider.batchSize; i++) {
    batch.push(routes[(start + i) % routes.length]);
  }
  cursors.set(provider, (start + provider.batchSize) % routes.length);
  return batch;
}

export async function pollOnce(db, providers, { now = Date.now(), log = () => {} } = {}) {
  const list = Array.isArray(providers) ? providers : [providers];
  const routes = db.prepare('SELECT id, origin, dest, base_price FROM routes').all();
  let dealsCreated = 0;
  let errors = 0;

  for (const provider of list) {
    for (const route of batchFor(provider, routes)) {
      try {
        const quotes = await provider.quotes(route);
        if (quotes.length > 0) {
          dealsCreated += ingestQuotes(db, route, quotes, { now }).length;
        }
      } catch (err) {
        errors++;
        if (errors <= 3) log(`${provider.name} ${route.origin}→${route.dest}: ${err.message}`);
      }
    }
  }
  expireDeals(db, { now });
  const alerts = fireWatchAlerts(db, { now });
  return { dealsCreated, alerts, errors };
}

// A watch alerts when the route's freshest fare crosses the user's threshold,
// and re-alerts only if the price improves another 2% (no notification spam).
export function fireWatchAlerts(db, { now = Date.now() } = {}) {
  const watches = db
    .prepare(
      `SELECT w.*, r.origin, r.dest, a.city AS dest_city
       FROM watches w JOIN routes r ON r.id = w.route_id
       JOIN airports a ON a.code = r.dest`
    )
    .all();
  const nowIso = new Date(now).toISOString();
  let fired = 0;

  for (const w of watches) {
    const latest = db
      .prepare('SELECT price FROM price_obs WHERE route_id = ? ORDER BY observed_at DESC, id DESC LIMIT 1')
      .get(w.route_id);
    if (!latest) continue;

    const threshold = w.threshold ?? routeStats(db, w.route_id, { now }).median * 0.9;
    const improvedEnough = w.last_alert_price == null || latest.price < w.last_alert_price * 0.98;
    if (latest.price > threshold || !improvedEnough) continue;

    const deal = db
      .prepare('SELECT id FROM deals WHERE route_id = ? AND active = 1 ORDER BY price ASC LIMIT 1')
      .get(w.route_id);
    db.prepare(
      `INSERT INTO notifications (user_id, watch_id, deal_id, kind, title, body, created_at)
       VALUES (?, ?, ?, 'drop', ?, ?, ?)`
    ).run(
      w.user_id, w.id, deal?.id ?? null,
      `${w.origin} → ${w.dest_city} dropped to $${latest.price}`,
      `Your watched trip is at $${latest.price}, under your $${Math.round(threshold)} alert price. Fares this low usually last hours, not days.`,
      nowIso
    );
    db.prepare('UPDATE watches SET last_alert_price = ? WHERE id = ?').run(latest.price, w.id);
    fired++;
  }
  return fired;
}

export function startPolling(db, providers, { intervalMs = 60000, log = () => {} } = {}) {
  let running = false;
  const tick = async () => {
    if (running) return; // a slow provider pass must not overlap the next
    running = true;
    try {
      const res = await pollOnce(db, providers, { log });
      log(`poll: +${res.dealsCreated} deals, ${res.alerts} alerts${res.errors ? `, ${res.errors} provider errors` : ''}`);
    } catch (err) {
      log(`poll failed: ${err.message}`);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
