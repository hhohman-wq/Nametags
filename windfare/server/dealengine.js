// Deal detection: compare a quote against the route's own price history.
// typical = median of the trailing 90 days; a deal is a fare under the 10th
// percentile (anomaly) or an active provider sale (flash). This history is
// the product's moat — everything else reads from what this file decides.

export function percentile(sorted, p) {
  if (sorted.length === 0) return NaN;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function routeStats(db, routeId, { days = 90, now = Date.now() } = {}) {
  const since = new Date(now - days * 86400000).toISOString();
  const rows = db
    .prepare('SELECT price FROM price_obs WHERE route_id = ? AND observed_at >= ? ORDER BY price')
    .all(routeId, since);
  const prices = rows.map((r) => r.price);
  return {
    count: prices.length,
    median: percentile(prices, 0.5),
    p10: percentile(prices, 0.1),
    min: prices[0] ?? NaN
  };
}

// Classify one quote. Returns a deal descriptor or null.
export function classifyQuote(quote, stats) {
  if (stats.count < 20 || !Number.isFinite(stats.median)) return null; // not enough history
  const pctBelow = Math.round((1 - quote.price / stats.median) * 100);
  if (quote.isSale && pctBelow >= 15) {
    return { type: 'flash', pctBelow, expiresAt: quote.saleUntil };
  }
  if (quote.price <= stats.p10 && pctBelow >= 10) {
    return { type: 'anomaly', pctBelow, expiresAt: null };
  }
  return null;
}

const HEADLINES = {
  flash: (city, pct) => `${city} flash sale — ${pct}% off typical`,
  anomaly: (city, pct) => `Rare fare to ${city}: ${pct}% below typical`
};

// Record fresh quotes for a route, then upsert deals for any that qualify.
// Returns the deals created this pass.
export function ingestQuotes(db, route, quotes, { now = Date.now() } = {}) {
  const observedAt = new Date(now).toISOString();
  const insertObs = db.prepare(
    'INSERT INTO price_obs (route_id, depart_date, price, is_sale, observed_at) VALUES (?, ?, ?, ?, ?)'
  );
  for (const q of quotes) {
    insertObs.run(route.id, q.departDate, q.price, q.isSale ? 1 : 0, observedAt);
  }

  const stats = routeStats(db, route.id, { now });
  const created = [];
  for (const q of quotes) {
    const hit = classifyQuote(q, stats);
    if (!hit) continue;
    // One active deal per route+departure; replace if the price improved.
    const existing = db
      .prepare('SELECT id, price FROM deals WHERE route_id = ? AND depart_date = ? AND active = 1')
      .get(route.id, q.departDate);
    if (existing) {
      if (q.price >= existing.price) continue;
      db.prepare('UPDATE deals SET active = 0 WHERE id = ?').run(existing.id);
    }
    const dest = db.prepare('SELECT city FROM airports WHERE code = ?').get(route.dest);
    const res = db
      .prepare(
        `INSERT INTO deals (route_id, type, price, typical, pct_below, depart_date, return_date, headline, expires_at, created_at, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
      )
      .run(
        route.id, hit.type, q.price, Math.round(stats.median), hit.pctBelow,
        q.departDate, q.returnDate,
        HEADLINES[hit.type](dest?.city ?? route.dest, hit.pctBelow),
        hit.expiresAt, observedAt
      );
    created.push({ id: Number(res.lastInsertRowid), type: hit.type, price: q.price, pctBelow: hit.pctBelow });
  }
  return created;
}

// Deactivate flash deals whose clock ran out and anomalies older than 48h
// (a "rare fare" that has sat for two days is just the new price).
export function expireDeals(db, { now = Date.now() } = {}) {
  const nowIso = new Date(now).toISOString();
  const staleIso = new Date(now - 48 * 3600000).toISOString();
  db.prepare("UPDATE deals SET active = 0 WHERE active = 1 AND expires_at IS NOT NULL AND expires_at < ?").run(nowIso);
  db.prepare("UPDATE deals SET active = 0 WHERE active = 1 AND type = 'anomaly' AND created_at < ?").run(staleIso);
}

// Feed ranking: deal quality first, urgency and freshness as tiebreakers,
// personalization (vibe match, budget fit) on top.
export function scoreDeal(deal, { budget, vibes = [], now = Date.now() } = {}) {
  let score = deal.pct_below * 2;
  if (deal.type === 'flash' && deal.expires_at) {
    const hoursLeft = (new Date(deal.expires_at).getTime() - now) / 3600000;
    if (hoursLeft > 0 && hoursLeft < 12) score += 25;
    else if (hoursLeft > 0) score += 12;
  }
  const ageHours = (now - new Date(deal.created_at).getTime()) / 3600000;
  score += Math.max(0, 15 - ageHours);
  if (budget && deal.price <= budget) score += 20;
  const dealVibes = JSON.parse(deal.dest_vibes || '[]');
  if (vibes.some((v) => dealVibes.includes(v))) score += 15;
  return score;
}
