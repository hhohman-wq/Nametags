// Travelpayouts / Aviasales Data API (https://travelpayouts.github.io/slate/).
// Serves *cached* fares actually found by Aviasales users — cheap to call,
// broad coverage, and inherently deal-shaped. Free token from the
// Travelpayouts affiliate dashboard; the same account provides the affiliate
// marker used by the revenue layer, so data source and monetization line up.

const API = 'https://api.travelpayouts.com';

export class TravelpayoutsProvider {
  name = 'travelpayouts';
  batchSize = 40; // cached data, generous limits

  constructor(token) {
    if (!token) throw new Error('TravelpayoutsProvider requires TRAVELPAYOUTS_TOKEN');
    this.token = token;
  }

  async quotes(route) {
    const params = new URLSearchParams({
      currency: 'usd',
      origin: route.origin,
      destination: route.dest,
      one_way: 'false',
      limit: '8',
      page: '1',
      sorting: 'price',
      show_to_affiliates: 'true'
    });
    const res = await fetch(`${API}/v2/prices/latest?${params}`, {
      headers: { 'X-Access-Token': this.token, Accept: 'application/json' }
    });
    if (!res.ok) throw new Error(`travelpayouts ${res.status}`);
    const body = await res.json();
    if (!body.success || !Array.isArray(body.data)) return [];

    const seen = new Set();
    const out = [];
    for (const row of body.data) {
      const departDate = (row.depart_date || '').slice(0, 10);
      const returnDate = (row.return_date || departDate).slice(0, 10);
      const price = Math.round(Number(row.value));
      if (!departDate || !Number.isFinite(price) || price <= 0) continue;
      if (departDate <= new Date().toISOString().slice(0, 10)) continue;
      if (seen.has(departDate)) continue;
      seen.add(departDate);
      out.push({ departDate, returnDate, price, isSale: false, saleUntil: null });
    }
    return out;
  }
}
