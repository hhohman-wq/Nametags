// Static airport/route catalog for the MVP.
// Origins are the launch metros (cheap-flight-dense US airports per the PRD);
// destinations carry vibe tags that drive feed personalization.

export const ORIGINS = [
  { code: 'JFK', city: 'New York', name: 'John F. Kennedy Intl' },
  { code: 'EWR', city: 'Newark', name: 'Newark Liberty Intl' },
  { code: 'BOS', city: 'Boston', name: 'Boston Logan Intl' },
  { code: 'ORD', city: 'Chicago', name: "Chicago O'Hare Intl" },
  { code: 'DFW', city: 'Dallas', name: 'Dallas/Fort Worth Intl' },
  { code: 'DEN', city: 'Denver', name: 'Denver Intl' },
  { code: 'LAX', city: 'Los Angeles', name: 'Los Angeles Intl' },
  { code: 'SFO', city: 'San Francisco', name: 'San Francisco Intl' },
  { code: 'SEA', city: 'Seattle', name: 'Seattle–Tacoma Intl' },
  { code: 'MIA', city: 'Miami', name: 'Miami Intl' },
  { code: 'ATL', city: 'Atlanta', name: 'Hartsfield–Jackson Atlanta Intl' },
  { code: 'PHX', city: 'Phoenix', name: 'Phoenix Sky Harbor Intl' }
];

// basePrice = typical round-trip economy fare used to synthesize history.
export const DESTINATIONS = [
  { code: 'CUN', city: 'Cancún', country: 'Mexico', vibes: ['beach'], basePrice: 420 },
  { code: 'SJU', city: 'San Juan', country: 'Puerto Rico', vibes: ['beach'], basePrice: 380 },
  { code: 'MBJ', city: 'Montego Bay', country: 'Jamaica', vibes: ['beach'], basePrice: 460 },
  { code: 'HNL', city: 'Honolulu', country: 'USA', vibes: ['beach', 'nature'], basePrice: 620 },
  { code: 'PVR', city: 'Puerto Vallarta', country: 'Mexico', vibes: ['beach'], basePrice: 450 },
  { code: 'NAS', city: 'Nassau', country: 'Bahamas', vibes: ['beach'], basePrice: 430 },
  { code: 'LIS', city: 'Lisbon', country: 'Portugal', vibes: ['city', 'beach'], basePrice: 680 },
  { code: 'BCN', city: 'Barcelona', country: 'Spain', vibes: ['city', 'beach'], basePrice: 720 },
  { code: 'CDG', city: 'Paris', country: 'France', vibes: ['city'], basePrice: 750 },
  { code: 'LHR', city: 'London', country: 'UK', vibes: ['city'], basePrice: 700 },
  { code: 'FCO', city: 'Rome', country: 'Italy', vibes: ['city'], basePrice: 760 },
  { code: 'AMS', city: 'Amsterdam', country: 'Netherlands', vibes: ['city'], basePrice: 690 },
  { code: 'DUB', city: 'Dublin', country: 'Ireland', vibes: ['city'], basePrice: 610 },
  { code: 'MEX', city: 'Mexico City', country: 'Mexico', vibes: ['city'], basePrice: 390 },
  { code: 'YVR', city: 'Vancouver', country: 'Canada', vibes: ['city', 'nature'], basePrice: 340 },
  { code: 'AUS', city: 'Austin', country: 'USA', vibes: ['city'], basePrice: 250 },
  { code: 'NAP', city: 'Naples', country: 'Italy', vibes: ['city', 'beach'], basePrice: 790 },
  { code: 'ATH', city: 'Athens', country: 'Greece', vibes: ['city', 'beach'], basePrice: 800 },
  { code: 'SLC', city: 'Salt Lake City', country: 'USA', vibes: ['ski', 'nature'], basePrice: 320 },
  { code: 'BZN', city: 'Bozeman', country: 'USA', vibes: ['ski', 'nature'], basePrice: 380 },
  { code: 'EGE', city: 'Vail/Eagle', country: 'USA', vibes: ['ski'], basePrice: 470 },
  { code: 'JAC', city: 'Jackson Hole', country: 'USA', vibes: ['ski', 'nature'], basePrice: 490 },
  { code: 'YYC', city: 'Calgary/Banff', country: 'Canada', vibes: ['ski', 'nature'], basePrice: 410 },
  { code: 'ANC', city: 'Anchorage', country: 'USA', vibes: ['nature'], basePrice: 520 },
  { code: 'SJO', city: 'San José', country: 'Costa Rica', vibes: ['nature', 'beach'], basePrice: 480 },
  { code: 'KEF', city: 'Reykjavík', country: 'Iceland', vibes: ['nature'], basePrice: 560 },
  { code: 'LIH', city: 'Kauai', country: 'USA', vibes: ['nature', 'beach'], basePrice: 650 },
  { code: 'TYO', city: 'Tokyo', country: 'Japan', vibes: ['city'], basePrice: 1050 },
  { code: 'BOG', city: 'Bogotá', country: 'Colombia', vibes: ['city', 'nature'], basePrice: 440 },
  { code: 'LAS', city: 'Las Vegas', country: 'USA', vibes: ['city'], basePrice: 230 }
];

export const VIBES = ['beach', 'city', 'ski', 'nature'];

// Each origin connects to a deterministic slice of destinations so the
// dataset stays small but every origin has beach/city/ski/nature coverage.
export function routesForOrigin(originCode) {
  const idx = ORIGINS.findIndex((o) => o.code === originCode);
  return DESTINATIONS.filter((_, i) => (i + idx) % 3 !== 0 || i < 6);
}
