// Fare providers and the provider registry.
//
// Every provider implements: `async quotes(route)` returning
//   [{ departDate, returnDate, price, isSale, saleUntil }]
// plus `name` and `batchSize` (max routes it should be asked about per poll
// tick — real APIs are rate- and cost-limited; the poller round-robins).
//
// Real providers activate themselves from env keys (see .env.example). With
// no keys configured the mock keeps the whole loop running end-to-end.

import { DuffelProvider } from './providers/duffel.js';
import { TravelpayoutsProvider } from './providers/travelpayouts.js';

// Deterministic PRNG so tests can pin behavior.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY = 86400000;
export const DEPART_OFFSETS = [6, 13, 27, 55]; // days out: next week, 2 weeks, a month, two months
export const TRIP_NIGHTS = 5;

export function isoDate(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

// Days until the next Friday (1–7). Guarantees the quote buckets always
// include an actual upcoming weekend — the product's home turf.
export function daysToNextFriday(nowMs) {
  const dow = new Date(nowMs).getUTCDay();
  return ((5 - dow + 7) % 7) || 7;
}

export function quoteOffsets(nowMs) {
  const offsets = new Set([daysToNextFriday(nowMs), ...DEPART_OFFSETS]);
  return [...offsets].sort((a, b) => a - b);
}

export class MockFareProvider {
  name = 'mock';
  batchSize = Infinity;

  constructor({ seed = 42, now = () => Date.now() } = {}) {
    this.rand = mulberry32(seed);
    this.now = now;
    this.state = new Map(); // routeKey -> { drift, sale: {until, depth} | null }
  }

  #routeState(key) {
    let s = this.state.get(key);
    if (!s) {
      s = { drift: 0.85 + this.rand() * 0.4, sale: null };
      this.state.set(key, s);
    }
    return s;
  }

  async quotes(route) {
    const s = this.#routeState(`${route.origin}-${route.dest}`);
    const now = this.now();

    // Random walk on the route's drift multiplier, mean-reverting toward 1.
    s.drift += (1 - s.drift) * 0.05 + (this.rand() - 0.5) * 0.08;
    s.drift = Math.min(1.6, Math.max(0.62, s.drift));

    // Sale lifecycle: ~1.5% chance per poll to start a 2–36h sale, 25–55% off.
    if (s.sale && s.sale.until < now) s.sale = null;
    if (!s.sale && this.rand() < 0.015) {
      s.sale = {
        until: now + (2 + this.rand() * 34) * 3600000,
        depth: 0.45 + this.rand() * 0.3 // price multiplier 0.45–0.75
      };
    }

    return quoteOffsets(now).map((days) => {
      const departMs = now + days * DAY;
      const closeness = days < 10 ? 1.15 : days < 21 ? 1.0 : 0.92;
      let price = route.base_price * s.drift * closeness * (0.94 + this.rand() * 0.12);
      const isSale = Boolean(s.sale);
      if (isSale) price *= s.sale.depth;
      return {
        departDate: isoDate(departMs),
        returnDate: isoDate(departMs + TRIP_NIGHTS * DAY),
        price: Math.round(price),
        isSale,
        saleUntil: isSale ? new Date(s.sale.until).toISOString() : null
      };
    });
  }
}

// Active providers, from env. Real ones stack; the mock joins only when no
// real provider is configured (or when STEALAWAY_USE_MOCK=1 forces it in, so
// a dev box with real keys still gets a lively feed).
export function createProviders(env = process.env) {
  const providers = [];
  if (env.DUFFEL_API_KEY) providers.push(new DuffelProvider(env.DUFFEL_API_KEY));
  if (env.TRAVELPAYOUTS_TOKEN) providers.push(new TravelpayoutsProvider(env.TRAVELPAYOUTS_TOKEN));
  if (providers.length === 0 || env.STEALAWAY_USE_MOCK === '1') {
    providers.push(new MockFareProvider({ seed: Number(env.STEALAWAY_SEED) || 42 }));
  }
  return providers;
}
