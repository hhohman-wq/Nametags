// Duffel flight search (https://duffel.com/docs/api). Self-serve, priced per
// confirmed *order* — searches are free within rate limits, so the poller
// asks Duffel for a small batch of routes per tick. Set DUFFEL_API_KEY
// (a test key `duffel_test_...` works and returns realistic offers).

const API = 'https://api.duffel.com';
const TRIP_NIGHTS = 5;
// Two buckets, not four: halves the request volume per route while still
// covering "soon" and "a month out" — the windows deal-hunters care about.
const OFFSETS = [13, 27];
const DAY = 86400000;

const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

export class DuffelProvider {
  name = 'duffel';
  batchSize = 12; // routes per poll tick

  constructor(apiKey) {
    if (!apiKey) throw new Error('DuffelProvider requires DUFFEL_API_KEY');
    this.apiKey = apiKey;
  }

  async #offerRequest(origin, dest, departDate, returnDate) {
    const res = await fetch(`${API}/air/offer_requests?return_offers=true&supplier_timeout=10000`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Duffel-Version': 'v2',
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        data: {
          cabin_class: 'economy',
          passengers: [{ type: 'adult' }],
          max_connections: 1,
          slices: [
            { origin, destination: dest, departure_date: departDate },
            { origin: dest, destination: origin, departure_date: returnDate }
          ]
        }
      })
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`duffel ${res.status}: ${detail.slice(0, 200)}`);
    }
    const { data } = await res.json();
    return data?.offers ?? [];
  }

  async quotes(route) {
    const now = Date.now();
    const out = [];
    for (const days of OFFSETS) {
      const departDate = iso(now + days * DAY);
      const returnDate = iso(now + (days + TRIP_NIGHTS) * DAY);
      const offers = await this.#offerRequest(route.origin, route.dest, departDate, returnDate);
      const priced = offers
        .filter((o) => o.total_currency === 'USD' || !o.total_currency)
        .map((o) => Number(o.total_amount))
        .filter(Number.isFinite);
      if (priced.length === 0) continue;
      out.push({
        departDate,
        returnDate,
        price: Math.round(Math.min(...priced)),
        isSale: false, // Duffel has no sale flag; the deal engine's P10 check finds the outliers
        saleUntil: null
      });
    }
    return out;
  }
}
