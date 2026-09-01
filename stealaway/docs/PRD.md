# Product Requirements Document — Stealaway

**One-liner:** The last-minute trip feed. Whole trips that are a steal — flight, stay, and what to do there — leaving from your airport in the next two weeks.

**Positioning (v2, September 2026):** "Deals" alone is a crowded category (Going, Travelzoo, Hopper). Stealaway's wedge is the under-served segment those incumbents are structurally bad at: **spontaneous, near-term travel**. Going and Travelzoo are email products for trips months out; Hopper assumes you already know your route; search engines need a destination. Stealaway's home question is *"when can you leave?"* — the feed defaults to the next 14 days, leads with "This weekend," ranks closer departures higher, and prices the whole trip, not just the fare. HotelTonight proved last-minute is a segment people switch apps for; nobody owns it for whole trips.

| | |
|---|---|
| Owner | hhohman-wq |
| Status | Draft v1 |
| Date | September 2026 |
| Companion doc | MARKET_ANALYSIS.md |

---

## 1. Problem statement

Booking travel today splits across many tools: metasearch for flights (Google Flights/Kayak), deal newsletters (Going, Travelzoo), prediction apps (Hopper), and social media for inspiration (TikTok/Instagram). There is no single place where a traveler — especially a *flexible* one — can scroll real, priced, bookable trips ("quick trip next week under $500"), set a watch on one, and book at the right moment. Traditional travel agents solve the curation problem but are slow, expensive, and don't scale to spontaneous trips.

## 2. Goals and non-goals

### Goals (v1)
1. A **last-minute deal feed**: scrollable, personalized, defaulting to trips leaving within 14 days — flash sales, rare fares, "this weekend" getaways. Closer departures rank higher.
2. **Flexible discovery**: filter by *constraints, not destinations* — budget, when you can leave ("this weekend"), home airport, vibe (beach/city/ski/nature).
3. **Whole-trip cards**: every card shows flight price, a trip-total estimate (flight + nights at the destination's typical rate), and three curated things to do — the answer to "and then what?" without leaving the feed.
4. **Price watching**: follow any trip; get alerts on drops; buy/wait guidance.
5. **Path to booking**: every card monetizes — tracked affiliate handoff for flights and stays in v1, native flight booking (Duffel) in v2.

### Non-goals (explicitly out of scope for v1–v2)
- Cruises (no viable self-serve API; revisit at v3 via consortia partnership).
- Native hotel/package booking (affiliate links only in v1).
- User-generated content / posting (the feed is system- and curator-generated; UGC is a v3 bet).
- Corporate travel, group booking, loyalty programs.
- Beating Google Flights at general-purpose search. We do not build a search box first; we build a feed.

## 3. Target users

| Persona | Description | Core job-to-be-done |
|---|---|---|
| **The Flexible Opportunist** (primary) | 25–40, remote-work-flexible, 3–6 trips/yr, budget-aware | "I could go somewhere *next week* — show me the whole trip that's worth it from my airport." |
| **The Deal Watcher** | Has a specific trip in mind, months out | "Tell me when this route hits its low, so I don't overpay." |
| **The Inspiration Scroller** | Plans on the couch, converts rarely but shares often | "Entertain me with trips I could take." (growth engine, not revenue) |

## 4. Core product: the Feed

### 4.1 Feed content types (cards)
- **Flash sale** — time-limited fare/hotel sale, with countdown.
- **Mistake fare / anomaly** — fare detected significantly below the route's rolling 90-day median.
- **Quick trip** — departs within 14 days from user's home airport, under user's budget.
- **Watched-price event** — "Your watched trip LAX→CUN dropped 22%."
- **Curated drop** — editor/algorithm-picked themed sets ("Ski weekends under $600").

Every card shows: destination image, total real price (flight, or flight+hotel bundle), dates, origin airport, deal quality score (vs. historical median), and time-sensitivity indicator.

### 4.2 Feed ranking inputs
Home airport(s), budget band, date flexibility, past taps/saves/bookings, deal quality (discount vs. 90-day route median), freshness/expiry. Ranking is deal-quality-first, personalization-second — the feed must feel like *deals*, not ads.

### 4.3 Deal detection pipeline (the moat)
1. Poll fare data across a fixed route matrix (top N routes from supported home airports) on a schedule.
2. Store historical prices per route+date-bucket → rolling median and percentile bands.
3. Flag fares below a percentile threshold (e.g., P10) as deals; classify severity.
4. Ingest airline/OTA sale announcements (newsletters, RSS, sale pages) for flash sales.
5. Human-in-the-loop review queue for "mistake fare" tier before it hits every feed.

## 5. Feature requirements

### P0 — MVP (Phase 1, ~3 months)
- Onboarding: home airport(s), budget band, interests, notification opt-in.
- Deal feed (flash sale, anomaly, quick-trip cards) for **10–20 origin airports**, flights only.
- Trip watch: follow a deal/route; push + email alerts on threshold price drops.
- Booking handoff: affiliate deep links (Skyscanner/Kayak/Expedia affiliate programs, airline direct).
- Share a deal card (link with preview) — the built-in growth loop.
- Basic deal-quality score ("32% below typical").

### P1 — Monetization & depth (Phase 2, months 4–9)
- Native flight checkout via **Duffel** (~$3/order cost; charge a service fee or markup on ancillaries).
- **Deal Watch Pro** subscription (~$5/mo or $49/yr): rare-deal tiers first, more watches, custom thresholds, mistake fares before free users. (Going's validated model.)
- Buy/wait guidance on watched trips from accumulated price history.
- Hotel bundles via affiliate (better margins than flights).
- Expand origin coverage based on waitlist demand.

### P2 — Differentiation bets (Phase 3, months 10+)
- **Price Freeze**-style hold product (fee to lock a fare briefly) — requires airline/fintech partnerships; Hopper's numbers prove this is where the money is.
- Friend graph: see trips friends saved; plan together.
- Cruise/package deals via a consortium partnership (content first, booking later).
- Creator/curator feeds (travel influencers publish bookable deal lists, rev-share).

## 6. Success metrics

| Metric | MVP target (month 3) | Phase 2 target |
|---|---|---|
| Weekly active scrollers | 2,000 | 25,000 |
| Deal saves (watches) per WAU | 0.5 | 1.5 |
| Push CTR on price-drop alerts | 15% | 20% |
| Affiliate click-outs / WAU / wk | 0.3 | — |
| Booking conversion (Phase 2, native) | — | 1% of WAU/mo |
| Paid subscribers | — | 2% of MAU |
| D30 retention | 15% | 25% |

North star: **watched trips that convert to a booking** — proof the "wait for the best price" loop works end to end.

## 7. Technical architecture (proposed)

- **Mobile-first**: React Native (iOS + Android) or a PWA first if solo-building; the feed is the whole UI.
- **Backend**: Node/TypeScript or Python (FastAPI); Postgres for users/watches; time-series store (Timescale) for fare history; Redis for feed caching.
- **Fare data**: Duffel search API + Kiwi Tequila for coverage; scheduled workers polling the route matrix; respect API rate/cost budgets (poll top routes hourly, long-tail daily).
- **Alerts**: push (FCM/APNs) + email (Resend/Postmark); alert fan-out via queue.
- **Booking (Phase 2)**: Duffel Orders API; payments via Stripe; Duffel handles airline settlement.
- **Deal ops**: internal review dashboard for the anomaly queue.

## 8. Business model (sequenced)

1. **Affiliate commissions** (v1) — zero inventory risk, immediate.
2. **Subscription** (Phase 2) — the proven Going model; predictable revenue independent of thin booking margins.
3. **Fintech add-ons** (Phase 3) — price freeze / flexibility products; the Hopper-proven high-margin layer.
4. Booking markup is explicitly **not** the business — flight commissions (1–2%) barely cover Duffel's per-order fee.

## 9. Risks and mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Flight margins ≈ 0 | High | Monetize timing (subscription, freeze), not booking; affiliate-first. |
| Deal pipeline is expensive/hard | High | Start with a small route matrix; cache aggressively; grow with revenue. |
| Google/OTA distribution dominance | High | Don't compete on search; compete on push notifications + shareable feed cards (channels Google doesn't own). |
| API access revoked / pricing changes | Medium | Multi-source (Duffel + Kiwi + affiliate feeds); never single-source. |
| Copycat risk (Hipmunk lesson) | Medium | Moat = accumulated fare history + deal-detection quality + subscriber base, not UI. |
| Cruises promised but not delivered | Low | Scope honestly: cruises are Phase 3, content-only first. |
| Mistake fares get cancelled by airlines | Medium | Label mistake-fare tier clearly; set expectations in-product. |

## 10. Open questions

1. Which 10–20 origin airports first? (Founder's own airport + top US metros with cheap-flight density: NYC, LAX, MIA, DFW, ORD, DEN…)
2. Service fee on native bookings vs. pure affiliate for longer?
3. PWA vs. native apps for MVP? (Push notifications argue for native; speed argues for PWA.)
4. Name/trademark check on "Agent" (extremely generic — hard to defend and hard to search for; consider a distinctive brand).
