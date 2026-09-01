// Fare providers. The MVP ships with a mock provider that produces realistic
// price movement (random walk + occasional sale events) so the whole loop —
// polling, history, deal detection, alerts — runs end-to-end with no API keys.
// DuffelProvider is the Phase-2 integration point; same interface.

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

export class MockFareProvider {
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

  // Returns [{departDate, returnDate, price, isSale}] for one route "now".
  quotes(route) {
    const s = this.#routeState(`${route.origin}-${route.dest}`);
    const now = this.now();

    // Random walk on the route's drift multiplier, mean-reverting toward 1.
    s.drift += (1 - s.drift) * 0.05 + (this.rand() - 0.5) * 0.08;
    s.drift = Math.min(1.6, Math.max(0.62, s.drift));

    // Sale lifecycle: ~2.5% chance per poll to start a 2–36h sale, 25–55% off.
    if (s.sale && s.sale.until < now) s.sale = null;
    if (!s.sale && this.rand() < 0.025) {
      s.sale = {
        until: now + (2 + this.rand() * 34) * 3600000,
        depth: 0.45 + this.rand() * 0.3 // price multiplier 0.45–0.75
      };
    }

    return DEPART_OFFSETS.map((days) => {
      const departMs = now + days * DAY;
      // Closer departures price higher; small per-bucket noise.
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

// Phase 2: real fares via Duffel (https://duffel.com). Same interface as the
// mock so the poller and deal engine don't change. Requires DUFFEL_API_KEY.
export class DuffelProvider {
  constructor(apiKey = process.env.DUFFEL_API_KEY) {
    if (!apiKey) throw new Error('DuffelProvider requires DUFFEL_API_KEY');
    this.apiKey = apiKey;
  }

  async quotes(_route) {
    // Sketch: POST /air/offer_requests with slices for each DEPART_OFFSET,
    // map the cheapest offer per bucket to {departDate, returnDate, price}.
    throw new Error('DuffelProvider not implemented in MVP — use MockFareProvider');
  }
}

export function createProvider() {
  if (process.env.DUFFEL_API_KEY) return new DuffelProvider();
  return new MockFareProvider({ seed: Number(process.env.WINDFARE_SEED) || 42 });
}
