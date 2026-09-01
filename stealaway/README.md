# Stealaway

*It's a steal. Steal away.* The last-minute trip feed: whole trips that are a steal — flight, stay estimate, and what to do there — leaving from your airport in the next two weeks. Scroll, watch prices, get alerted when a fare drops. This is the MVP described in [docs/PRD.md](docs/PRD.md); the reasoning behind the scope is in [docs/MARKET_ANALYSIS.md](docs/MARKET_ANALYSIS.md), and the brand lives in [brand/BRAND.md](brand/BRAND.md).

## Run it

Requires Node ≥ 22.13 (uses the built-in `node:sqlite` — no npm dependencies).

```bash
npm start          # serves http://localhost:4600, seeds on first run
npm run dev        # same, with 15s fare polling for a livelier feed
npm test           # deal engine + API test suite
npm run seed       # rebuild market data (preserves users/watches)
```

On first launch the app seeds 20 origin airports, ~90 destinations worldwide, ~1,200 routes, and 90 days of synthetic fare history, then runs a few poll passes so the feed opens with live flash sales and rare-fare anomalies. Add real-fare API keys (below) and real quotes flow through the same pipeline.

## What's in the MVP

- **Last-minute deal feed** — defaults to trips leaving within 14 days, with a "This weekend" filter (the fare provider always quotes an upcoming Friday). Flash sales (with countdowns), rare fares (below the route's 90-day 10th percentile), and quick trips, ranked by deal quality, urgency, freshness, vibe/budget fit — and how soon they leave.
- **Whole-trip cards** — each card shows a trip-total estimate (flight + nights at the destination's typical hotel rate), a tracked "Find a stay" handoff, and three curated things to do at the destination.
- **Onboarding** — home airport, budget, trip vibes (beach / city / ski / nature); stored per-browser, editable from the header chip.
- **Price watching** — watch any card; the default alert threshold is 10% under the route's typical price. Alerts de-dupe (re-fires only on a further 2% improvement) and land in the in-app alerts drawer.
- **Sparklines** — each card charts its last 12 observed fares.
- **Share** — every detected deal has a server-rendered share page at `/deal/:id` with OG tags.
- **Tracked booking handoff** — every Book click routes through `/go`, is recorded with an estimated commission, and redirects to the affiliate target.
- **Revenue, built in** —
  - *Affiliate:* set `TRAVELPAYOUTS_MARKER` and Book clicks go to Aviasales tagged with your marker (flights pay ~1.1–2.2% of ticket value) while "Find a stay" clicks go to Hotellook — same account, better rates (~4% est.). Without it, clicks hand off untagged and are recorded at $0 — the dashboard tells you what to configure.
  - *Stealaway Pro ($49/yr):* free members get 3 watches and see rare fares 60 minutes late; Pro gets unlimited watches and rare fares the moment they land. Stripe Checkout when `STRIPE_SECRET_KEY`/`STRIPE_PRICE_ID` are set (webhook at `/api/billing/webhook`, signature-verified); dev mode grants Pro instantly so the flow is demoable.
  - *Revenue dashboard at `/admin`* — clicks, estimated affiliate revenue, Pro subscribers, ARR, daily click chart, top routes. Protect it with `STEALAWAY_ADMIN_KEY`.
- **Brand kit** — `brand/BRAND.md`: palette (CVD-validated chart colors), Archivo/Plex Mono type system, the gust-mark logo, voice rules.

## Architecture

```
server/
  index.js      HTTP server: JSON API + static frontend + share pages
  db.js         SQLite schema (airports, routes, price_obs, deals, users, watches, notifications)
  provider.js   Fare providers: MockFareProvider (random walk + sale events), DuffelProvider stub
  dealengine.js Price history stats (median/P10), deal classification, feed scoring
  poller.js     The heartbeat: poll fares → record history → detect deals → fire watch alerts
  seed.js       Synthetic 90-day backfill so deal detection works on day one
web/            Zero-framework mobile-first frontend
test/           node:test suite (engine + API)
```

### Fare providers

Providers implement one interface (`async quotes(route)` + `batchSize`); the poller round-robins rate-limited providers through the route matrix and any provider error is logged, never fatal. Active providers stack:

| Provider | Activates with | What it brings |
|---|---|---|
| **Duffel** (`server/providers/duffel.js`) | `DUFFEL_API_KEY` | Live bookable flight offers; searches are free, a test key returns realistic data. Also the Phase-2 native checkout path |
| **Travelpayouts** (`server/providers/travelpayouts.js`) | `TRAVELPAYOUTS_TOKEN` | Cached real fares actually found by Aviasales users — broad, cheap, deal-shaped. Same account supplies the affiliate marker |
| **Mock** | no keys, or `STEALAWAY_USE_MOCK=1` | Realistic price walks + sale events so everything runs with zero keys |

### Environment

See `.env.example` for the full annotated list: server settings, provider keys, the affiliate marker + commission rate, Stripe keys, and the admin key.

## What's deliberately not here yet

Per the PRD's phasing: native checkout via Duffel Orders (search is wired; ordering is not), push notifications (alerts are in-app only), accounts/auth (per-browser profile), hotels, cruises, and the price-freeze fintech layer.
