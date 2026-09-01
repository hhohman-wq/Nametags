// The heartbeat: poll fares for every route, record history, detect deals,
// and fire watch alerts. In production this is a scheduled worker with an API
// cost budget; in the MVP it's a setInterval over the mock provider.

import { ingestQuotes, expireDeals, routeStats } from './dealengine.js';

export function pollOnce(db, provider, { now = Date.now() } = {}) {
  const routes = db.prepare('SELECT id, origin, dest, base_price FROM routes').all();
  let created = [];
  for (const r of routes) {
    created = created.concat(
      ingestQuotes(db, r, provider.quotes(r), { now }).map((d) => ({ ...d, routeId: r.id }))
    );
  }
  expireDeals(db, { now });
  const alerts = fireWatchAlerts(db, { now });
  return { dealsCreated: created.length, alerts };
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

export function startPolling(db, provider, { intervalMs = 60000, log = () => {} } = {}) {
  const tick = () => {
    try {
      const res = pollOnce(db, provider);
      log(`poll: +${res.dealsCreated} deals, ${res.alerts} alerts`);
    } catch (err) {
      log(`poll failed: ${err.message}`);
    }
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
