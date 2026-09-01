// Revenue layer. Three streams, in the order the PRD sequences them:
//   1. Affiliate booking handoff — every Book click routes through /go, is
//      recorded with an estimated commission, and redirects to the affiliate
//      target (Aviasales/Travelpayouts when TRAVELPAYOUTS_MARKER is set).
//   2. Stealaway Pro ($49/yr) — Stripe Checkout when keys are configured, a
//      dev-mode grant otherwise. Free tier: 3 watches, rare fares on a 60-min
//      delay. Pro: unlimited watches, rare fares the moment they land.
//   3. (Later) price-freeze fintech — the Hopper-proven layer; not built yet.

import { createHmac, timingSafeEqual } from 'node:crypto';

export const PRO_PRICE_CENTS = 4900;
export const FREE_WATCH_LIMIT = 3;
export const PRO_EARLY_ACCESS_MIN = 60; // rare fares reach free users this many minutes late

// Blended affiliate commission estimates (Travelpayouts flights pay ~1.1–2.2%
// of ticket value; hotel programs pay meaningfully more). Estimates only —
// the network's dashboard is the source of truth for payouts.
export const flightRate = (env = process.env) => Number(env.STEALAWAY_COMMISSION_RATE) || 0.016;
export const hotelRate = (env = process.env) => Number(env.STEALAWAY_HOTEL_COMMISSION_RATE) || 0.04;

const ddmm = (iso) => iso.slice(8, 10) + iso.slice(5, 7);

export function affiliateTarget({ origin, dest, departDate, returnDate }, env = process.env) {
  const marker = env.TRAVELPAYOUTS_MARKER;
  if (marker) {
    return {
      network: 'aviasales',
      commissionable: true,
      url: `https://www.aviasales.com/search/${origin}${ddmm(departDate)}${dest}${ddmm(returnDate)}1?marker=${encodeURIComponent(marker)}`
    };
  }
  // No affiliate configured yet: hand off untagged (and record $0 estimate).
  const q = `Flights from ${origin} to ${dest} on ${departDate} through ${returnDate}`;
  return {
    network: 'google-flights',
    commissionable: false,
    url: `https://www.google.com/travel/flights?q=${encodeURIComponent(q)}`
  };
}

// Same-account hotel handoff: Hotellook is Travelpayouts' hotel metasearch,
// so the flight marker monetizes stays too.
export function hotelTarget({ city }, env = process.env) {
  const marker = env.TRAVELPAYOUTS_MARKER;
  if (marker) {
    return {
      network: 'hotellook',
      commissionable: true,
      url: `https://search.hotellook.com/?destination=${encodeURIComponent(city)}&marker=${encodeURIComponent(marker)}`
    };
  }
  return {
    network: 'google-hotels',
    commissionable: false,
    url: `https://www.google.com/travel/hotels/${encodeURIComponent(city)}`
  };
}

export function recordClick(db, { userId, dealId, routeId, price, network, commissionable, rate }, env = process.env) {
  const est = commissionable ? Math.round(price * (rate ?? flightRate(env)) * 100) / 100 : 0;
  db.prepare(
    `INSERT INTO clicks (user_id, deal_id, route_id, price, est_commission, target, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(userId ?? null, dealId ?? null, routeId, price, est, network, new Date().toISOString());
  return est;
}

/* ---------------- Stealaway Pro ---------------- */

export function grantPro(db, userId, processor, externalId = null) {
  const now = new Date().toISOString();
  const res = db.prepare('UPDATE users SET pro = 1, pro_since = COALESCE(pro_since, ?) WHERE id = ?').run(now, userId);
  if (res.changes === 0) throw Object.assign(new Error('unknown user'), { status: 404 });
  db.prepare(
    `INSERT INTO payments (user_id, amount_cents, kind, processor, external_id, created_at)
     VALUES (?, ?, 'pro_year', ?, ?, ?)`
  ).run(userId, PRO_PRICE_CENTS, processor, externalId, now);
}

// Stripe Checkout via the raw HTTP API (no SDK — the app is dependency-free).
// Without STRIPE_SECRET_KEY, dev mode grants Pro immediately so the full flow
// is demoable locally.
export async function createCheckout(db, userId, appOrigin, env = process.env) {
  if (!db.prepare('SELECT id FROM users WHERE id = ?').get(userId)) {
    throw Object.assign(new Error('unknown user'), { status: 404 });
  }
  const sk = env.STRIPE_SECRET_KEY;
  if (!sk) {
    grantPro(db, userId, 'dev');
    return { dev: true, url: null };
  }
  if (!env.STRIPE_PRICE_ID) throw new Error('STRIPE_PRICE_ID not set (create a $49/yr recurring price in Stripe)');
  const params = new URLSearchParams({
    mode: 'subscription',
    client_reference_id: userId,
    success_url: `${appOrigin}/?upgraded=1`,
    cancel_url: `${appOrigin}/`,
    'line_items[0][price]': env.STRIPE_PRICE_ID,
    'line_items[0][quantity]': '1'
  });
  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${sk}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });
  const session = await res.json();
  if (!res.ok) throw new Error(`stripe ${res.status}: ${session?.error?.message ?? 'checkout failed'}`);
  return { dev: false, url: session.url };
}

export function verifyStripeSignature(payload, sigHeader, secret) {
  const parts = Object.fromEntries(
    String(sigHeader ?? '').split(',').map((kv) => kv.split('=').map((s) => s.trim()))
  );
  if (!parts.t || !parts.v1) return false;
  const expected = createHmac('sha256', secret).update(`${parts.t}.${payload}`).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function handleStripeWebhook(db, rawBody, sigHeader, env = process.env) {
  const secret = env.STRIPE_WEBHOOK_SECRET;
  if (secret && !verifyStripeSignature(rawBody, sigHeader, secret)) {
    throw Object.assign(new Error('bad signature'), { status: 400 });
  }
  const event = JSON.parse(rawBody);
  if (event.type === 'checkout.session.completed') {
    const s = event.data?.object ?? {};
    if (s.client_reference_id) grantPro(db, s.client_reference_id, 'stripe', s.id);
  }
  return { received: true };
}

/* ---------------- Admin stats ---------------- */

export function adminStats(db, { now = Date.now() } = {}) {
  const iso = (ms) => new Date(ms).toISOString();
  const d7 = iso(now - 7 * 86400000);
  const d14 = iso(now - 14 * 86400000);

  const clicks7 = db.prepare('SELECT COUNT(*) n, COALESCE(SUM(est_commission),0) rev FROM clicks WHERE created_at >= ?').get(d7);
  const clicksAll = db.prepare('SELECT COUNT(*) n, COALESCE(SUM(est_commission),0) rev FROM clicks').get();
  const proCount = db.prepare('SELECT COUNT(*) n FROM users WHERE pro = 1').get().n;
  const payments = db.prepare('SELECT COALESCE(SUM(amount_cents),0) cents FROM payments').get().cents;

  const daily = db
    .prepare(
      `SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS clicks, ROUND(SUM(est_commission), 2) AS revenue
       FROM clicks WHERE created_at >= ? GROUP BY day ORDER BY day`
    )
    .all(d14);

  const topRoutes = db
    .prepare(
      `SELECT r.origin, a.city AS dest_city, r.dest, COUNT(*) AS clicks, ROUND(SUM(c.est_commission), 2) AS revenue
       FROM clicks c JOIN routes r ON r.id = c.route_id JOIN airports a ON a.code = r.dest
       GROUP BY c.route_id ORDER BY clicks DESC, revenue DESC LIMIT 8`
    )
    .all();

  return {
    affiliate: {
      clicks7d: clicks7.n,
      estRevenue7d: Math.round(clicks7.rev * 100) / 100,
      clicksAll: clicksAll.n,
      estRevenueAll: Math.round(clicksAll.rev * 100) / 100,
      configured: Boolean(process.env.TRAVELPAYOUTS_MARKER)
    },
    pro: {
      subscribers: proCount,
      arrCents: proCount * PRO_PRICE_CENTS,
      collectedCents: payments,
      stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY)
    },
    daily,
    topRoutes
  };
}
