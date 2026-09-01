# Windfare

*Windfall + airfare.* A deal feed for flexible travelers: scroll real, priced trips like a social feed, watch prices, and get alerted when a fare drops. This is the MVP described in [docs/PRD.md](docs/PRD.md); the reasoning behind the scope is in [docs/MARKET_ANALYSIS.md](docs/MARKET_ANALYSIS.md).

## Run it

Requires Node ≥ 22.13 (uses the built-in `node:sqlite` — no npm dependencies).

```bash
npm start          # serves http://localhost:4600, seeds on first run
npm run dev        # same, with 15s fare polling for a livelier feed
npm test           # deal engine + API test suite
npm run seed       # rebuild market data (preserves users/watches)
```

On first launch the app seeds 12 origin airports, 30 destinations, ~130 routes, and 90 days of synthetic fare history, then runs a few poll passes so the feed opens with live flash sales and rare-fare anomalies.

## What's in the MVP

- **Deal feed** — flash sales (with countdowns), rare fares (below the route's 90-day 10th percentile), and quick trips (departing within 14 days, under your budget), ranked by deal quality, urgency, freshness, and vibe/budget fit.
- **Onboarding** — home airport, budget, trip vibes (beach / city / ski / nature); stored per-browser, editable from the header chip.
- **Price watching** — watch any card; the default alert threshold is 10% under the route's typical price. Alerts de-dupe (re-fires only on a further 2% improvement) and land in the in-app alerts drawer.
- **Sparklines** — each card charts its last 12 observed fares.
- **Share** — every detected deal has a server-rendered share page at `/deal/:id` with OG tags.
- **Booking handoff** — "Book" deep-links into Google Flights (swap for tagged affiliate links).

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

The mock provider exists so the entire loop runs with no API keys. To go live with real fares, implement `DuffelProvider.quotes()` (`server/provider.js`) and set `DUFFEL_API_KEY` — nothing else changes, because the poller and deal engine only speak the provider interface.

### Environment

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4600` | HTTP port |
| `WINDFARE_DB` | `windfare.db` (app root) | SQLite path (`:memory:` works) |
| `WINDFARE_POLL_MS` | `60000` | Fare polling interval |
| `WINDFARE_SEED` | `42` | Mock provider RNG seed |
| `DUFFEL_API_KEY` | — | Switches to the (stub) Duffel provider |

## What's deliberately not here yet

Per the PRD's phasing: real fare data (Duffel), payments/native checkout, push notifications (alerts are in-app only), accounts/auth (per-browser profile), the paid Deal Watch Pro tier, hotels, and cruises.
