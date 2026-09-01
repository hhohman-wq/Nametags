# Windfare Brand Kit

*Windfall + airfare.* Windfare is the feed that catches fares while they're falling. The brand should feel like the moment a deal lands: fast-moving air, clear skies, money left in your pocket — **swift, weathered, trustworthy**. Never corporate-OTA sterile, never coupon-site shouty.

## 1. Name & voice

- **Name:** Windfare. One word, capital W. Never "WindFare" or "Wind Fare".
- **Tagline:** *Catch fares while they're falling.*
- **Voice:** a sharp friend who watches prices so you don't have to. Concrete numbers over adjectives ("$203 — half the usual price", not "amazing deal!"). Urgency comes from real clocks and real percentiles, never manufactured pressure. No exclamation marks in UI copy; one is allowed in a push notification when a watched price actually drops.
- **Vocabulary:** deals *land*; prices *drop*; users *catch* or *watch* trips. A "rare fare" is below the route's 90-day 10th percentile — the term is earned by data, so never apply it to anything else.

## 2. Logo

`brand/logo.svg` — the **gust mark**: three tapering wind strokes accelerating into a climbing delta (the fare taking off, caught mid-gust). Use the roundel on app icons and avatars; pair with the Archivo wordmark (`WINDFARE`, width-condensed, 0.04em tracking) in headers.

- Clear space: half the roundel's width on all sides.
- Minimum size: 20px (roundel), 90px (lockup).
- Don't rotate, outline, add shadows, or recolor outside the palette below.

## 3. Color

### Core (UI)

| Token | Light | Dark | Role |
|---|---|---|---|
| `--accent` | `#0E6E7E` | `#53B7C8` | Jetstream teal — the brand color. Buttons, wordmark, active states |
| `--accent-strong` | `#0A5561` | `#7ECCD9` | Teal for small colored text (WCAG AA on panel) |
| `--ground` | `#F2F6F7` | `#0E161C` | Page background — "altitude" neutrals, teal-biased, never pure gray |
| `--panel` | `#FFFFFF` | `#17232C` | Cards, sheets |
| `--ink` | `#17242E` | `#E5ECF0` | Primary text |
| `--gold` | `#B35F00` | `#C87F1B` | Windfall gold — Pro tier, countdowns, "money" moments only |

### Deal types & charts (validated categorical palette)

Fixed order, assigned by entity, never cycled. Passes all six dataviz checks (lightness band, chroma floor, CVD ΔE ≥ 8, normal-vision floor, contrast ≥ 3:1) on both surfaces via `validate_palette.js`:

| Slot | Meaning | Light (`#fcfcfb`) | Dark (`#1a1a19`) |
|---|---|---|---|
| 1 | Flash sale / revenue | `#B35F00` | `#C87F1B` |
| 2 | Rare fare | `#8A3D93` | `#B863C6` |
| 3 | Quick trip / positive | `#1E8352` | `#33A163` |
| 4 | Price drop / neutral series | `#0083A8` | `#14A0B8` |

Rules: deal-type pills always carry a text label (never color alone). Sequential data uses the teal ramp, one hue light→dark. Values and labels wear ink tokens, never series colors. One axis per chart, always.

## 4. Typography

| Role | Face | Notes |
|---|---|---|
| Display / wordmark | **Archivo** (variable) | `wdth` 66–84, weight 650–780. Headlines, prices, buttons, pills |
| Body | **system-ui stack** | Native app feel, fast |
| Data | **IBM Plex Mono** | Prices in tables, dates, countdowns, badges — always `tabular-nums` |

Prices are display moments: Archivo, condensed, ≥ 28px in cards. Dates and countdowns are data: Plex Mono, 11–13px.

## 5. Components

- **Cards:** 14px radius, 1px line border, soft 1–3px shadow. Banner gradients are vibe-keyed (beach/city/ski/nature) — the gradient is scenery, text on it is always near-white with a scrim pill behind labels.
- **Pills/chips:** 20px radius, Archivo 84-width semibold; active = filled accent.
- **Countdowns:** Plex Mono on dark scrim, windfall-gold text — urgency owns exactly one color.
- **Pro:** windfall gold, never teal — Pro is the money tier, and gold only ever means money.

## 6. Applying / validating

Tokens live in `web/styles.css` (`:root` + dark media query). Re-run the palette check after any chart-color change:

```bash
node <dataviz-skill>/scripts/validate_palette.js "#B35F00,#8A3D93,#1E8352,#0083A8" --mode light
node <dataviz-skill>/scripts/validate_palette.js "#C87F1B,#B863C6,#33A163,#14A0B8" --mode dark
```
