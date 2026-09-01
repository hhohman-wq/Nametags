// Static airport/route catalog. Origins are 20 US launch metros; destinations
// span every region with vibe tags that drive feed personalization. basePrice
// is a realistic typical round-trip economy fare, used by the mock provider
// and the synthetic history backfill — real providers ignore it.

export const ORIGINS = [
  { code: 'JFK', city: 'New York', name: 'John F. Kennedy Intl' },
  { code: 'EWR', city: 'Newark', name: 'Newark Liberty Intl' },
  { code: 'BOS', city: 'Boston', name: 'Boston Logan Intl' },
  { code: 'PHL', city: 'Philadelphia', name: 'Philadelphia Intl' },
  { code: 'IAD', city: 'Washington', name: 'Washington Dulles Intl' },
  { code: 'ATL', city: 'Atlanta', name: 'Hartsfield–Jackson Atlanta Intl' },
  { code: 'MIA', city: 'Miami', name: 'Miami Intl' },
  { code: 'MCO', city: 'Orlando', name: 'Orlando Intl' },
  { code: 'ORD', city: 'Chicago', name: "Chicago O'Hare Intl" },
  { code: 'MSP', city: 'Minneapolis', name: 'Minneapolis–St. Paul Intl' },
  { code: 'DTW', city: 'Detroit', name: 'Detroit Metro' },
  { code: 'DFW', city: 'Dallas', name: 'Dallas/Fort Worth Intl' },
  { code: 'IAH', city: 'Houston', name: 'George Bush Intercontinental' },
  { code: 'DEN', city: 'Denver', name: 'Denver Intl' },
  { code: 'PHX', city: 'Phoenix', name: 'Phoenix Sky Harbor Intl' },
  { code: 'LAX', city: 'Los Angeles', name: 'Los Angeles Intl' },
  { code: 'SFO', city: 'San Francisco', name: 'San Francisco Intl' },
  { code: 'SAN', city: 'San Diego', name: 'San Diego Intl' },
  { code: 'SEA', city: 'Seattle', name: 'Seattle–Tacoma Intl' },
  { code: 'PDX', city: 'Portland', name: 'Portland Intl' }
];

export const DESTINATIONS = [
  // Caribbean & Mexico beaches
  { code: 'CUN', city: 'Cancún', country: 'Mexico', vibes: ['beach'], basePrice: 420 },
  { code: 'SJU', city: 'San Juan', country: 'Puerto Rico', vibes: ['beach'], basePrice: 380 },
  { code: 'MBJ', city: 'Montego Bay', country: 'Jamaica', vibes: ['beach'], basePrice: 460 },
  { code: 'PUJ', city: 'Punta Cana', country: 'Dominican Republic', vibes: ['beach'], basePrice: 440 },
  { code: 'NAS', city: 'Nassau', country: 'Bahamas', vibes: ['beach'], basePrice: 430 },
  { code: 'AUA', city: 'Aruba', country: 'Aruba', vibes: ['beach'], basePrice: 520 },
  { code: 'GCM', city: 'Grand Cayman', country: 'Cayman Islands', vibes: ['beach'], basePrice: 540 },
  { code: 'PVR', city: 'Puerto Vallarta', country: 'Mexico', vibes: ['beach'], basePrice: 450 },
  { code: 'SJD', city: 'Cabo San Lucas', country: 'Mexico', vibes: ['beach'], basePrice: 470 },
  { code: 'CZM', city: 'Cozumel', country: 'Mexico', vibes: ['beach', 'nature'], basePrice: 480 },
  { code: 'BDA', city: 'Bermuda', country: 'Bermuda', vibes: ['beach'], basePrice: 490 },
  { code: 'STT', city: 'St. Thomas', country: 'US Virgin Islands', vibes: ['beach'], basePrice: 510 },
  // Hawaii & Pacific
  { code: 'HNL', city: 'Honolulu', country: 'USA', vibes: ['beach', 'nature'], basePrice: 620 },
  { code: 'OGG', city: 'Maui', country: 'USA', vibes: ['beach', 'nature'], basePrice: 660 },
  { code: 'LIH', city: 'Kauai', country: 'USA', vibes: ['nature', 'beach'], basePrice: 650 },
  { code: 'KOA', city: 'Kona', country: 'USA', vibes: ['beach', 'nature'], basePrice: 670 },
  { code: 'PPT', city: 'Tahiti', country: 'French Polynesia', vibes: ['beach'], basePrice: 1250 },
  { code: 'NAN', city: 'Fiji', country: 'Fiji', vibes: ['beach', 'nature'], basePrice: 1150 },
  // Europe cities
  { code: 'LIS', city: 'Lisbon', country: 'Portugal', vibes: ['city', 'beach'], basePrice: 680 },
  { code: 'BCN', city: 'Barcelona', country: 'Spain', vibes: ['city', 'beach'], basePrice: 720 },
  { code: 'MAD', city: 'Madrid', country: 'Spain', vibes: ['city'], basePrice: 700 },
  { code: 'CDG', city: 'Paris', country: 'France', vibes: ['city'], basePrice: 750 },
  { code: 'LHR', city: 'London', country: 'UK', vibes: ['city'], basePrice: 700 },
  { code: 'FCO', city: 'Rome', country: 'Italy', vibes: ['city'], basePrice: 760 },
  { code: 'MXP', city: 'Milan', country: 'Italy', vibes: ['city'], basePrice: 730 },
  { code: 'NAP', city: 'Naples', country: 'Italy', vibes: ['city', 'beach'], basePrice: 790 },
  { code: 'AMS', city: 'Amsterdam', country: 'Netherlands', vibes: ['city'], basePrice: 690 },
  { code: 'DUB', city: 'Dublin', country: 'Ireland', vibes: ['city'], basePrice: 610 },
  { code: 'EDI', city: 'Edinburgh', country: 'Scotland', vibes: ['city', 'nature'], basePrice: 650 },
  { code: 'BER', city: 'Berlin', country: 'Germany', vibes: ['city'], basePrice: 720 },
  { code: 'MUC', city: 'Munich', country: 'Germany', vibes: ['city', 'ski'], basePrice: 740 },
  { code: 'VIE', city: 'Vienna', country: 'Austria', vibes: ['city'], basePrice: 750 },
  { code: 'PRG', city: 'Prague', country: 'Czechia', vibes: ['city'], basePrice: 730 },
  { code: 'BUD', city: 'Budapest', country: 'Hungary', vibes: ['city'], basePrice: 740 },
  { code: 'ATH', city: 'Athens', country: 'Greece', vibes: ['city', 'beach'], basePrice: 800 },
  { code: 'JTR', city: 'Santorini', country: 'Greece', vibes: ['beach'], basePrice: 890 },
  { code: 'CPH', city: 'Copenhagen', country: 'Denmark', vibes: ['city'], basePrice: 710 },
  { code: 'ARN', city: 'Stockholm', country: 'Sweden', vibes: ['city'], basePrice: 700 },
  { code: 'OSL', city: 'Oslo', country: 'Norway', vibes: ['city', 'nature'], basePrice: 690 },
  { code: 'KEF', city: 'Reykjavík', country: 'Iceland', vibes: ['nature'], basePrice: 560 },
  { code: 'IST', city: 'Istanbul', country: 'Türkiye', vibes: ['city'], basePrice: 820 },
  { code: 'ZRH', city: 'Zurich', country: 'Switzerland', vibes: ['city', 'ski'], basePrice: 780 },
  { code: 'GVA', city: 'Geneva', country: 'Switzerland', vibes: ['ski', 'city'], basePrice: 770 },
  // Latin America
  { code: 'MEX', city: 'Mexico City', country: 'Mexico', vibes: ['city'], basePrice: 390 },
  { code: 'GDL', city: 'Guadalajara', country: 'Mexico', vibes: ['city'], basePrice: 380 },
  { code: 'SJO', city: 'San José', country: 'Costa Rica', vibes: ['nature', 'beach'], basePrice: 480 },
  { code: 'LIR', city: 'Liberia', country: 'Costa Rica', vibes: ['beach', 'nature'], basePrice: 500 },
  { code: 'PTY', city: 'Panama City', country: 'Panama', vibes: ['city', 'beach'], basePrice: 460 },
  { code: 'BOG', city: 'Bogotá', country: 'Colombia', vibes: ['city', 'nature'], basePrice: 440 },
  { code: 'MDE', city: 'Medellín', country: 'Colombia', vibes: ['city', 'nature'], basePrice: 450 },
  { code: 'CTG', city: 'Cartagena', country: 'Colombia', vibes: ['beach', 'city'], basePrice: 470 },
  { code: 'LIM', city: 'Lima', country: 'Peru', vibes: ['city', 'nature'], basePrice: 620 },
  { code: 'CUZ', city: 'Cusco', country: 'Peru', vibes: ['nature'], basePrice: 700 },
  { code: 'UIO', city: 'Quito', country: 'Ecuador', vibes: ['city', 'nature'], basePrice: 560 },
  { code: 'SCL', city: 'Santiago', country: 'Chile', vibes: ['city', 'ski'], basePrice: 780 },
  { code: 'EZE', city: 'Buenos Aires', country: 'Argentina', vibes: ['city'], basePrice: 850 },
  { code: 'GIG', city: 'Rio de Janeiro', country: 'Brazil', vibes: ['beach', 'city'], basePrice: 820 },
  // Asia & Pacific
  { code: 'TYO', city: 'Tokyo', country: 'Japan', vibes: ['city'], basePrice: 1050 },
  { code: 'OSA', city: 'Osaka', country: 'Japan', vibes: ['city'], basePrice: 1080 },
  { code: 'ICN', city: 'Seoul', country: 'South Korea', vibes: ['city'], basePrice: 1020 },
  { code: 'TPE', city: 'Taipei', country: 'Taiwan', vibes: ['city'], basePrice: 980 },
  { code: 'BKK', city: 'Bangkok', country: 'Thailand', vibes: ['city', 'beach'], basePrice: 950 },
  { code: 'HKT', city: 'Phuket', country: 'Thailand', vibes: ['beach'], basePrice: 1020 },
  { code: 'SIN', city: 'Singapore', country: 'Singapore', vibes: ['city'], basePrice: 1000 },
  { code: 'DPS', city: 'Bali', country: 'Indonesia', vibes: ['beach', 'nature'], basePrice: 1050 },
  { code: 'HAN', city: 'Hanoi', country: 'Vietnam', vibes: ['city', 'nature'], basePrice: 980 },
  { code: 'DEL', city: 'Delhi', country: 'India', vibes: ['city'], basePrice: 900 },
  { code: 'DXB', city: 'Dubai', country: 'UAE', vibes: ['city', 'beach'], basePrice: 880 },
  { code: 'SYD', city: 'Sydney', country: 'Australia', vibes: ['city', 'beach'], basePrice: 1200 },
  { code: 'AKL', city: 'Auckland', country: 'New Zealand', vibes: ['nature', 'city'], basePrice: 1150 },
  // Africa & Middle East
  { code: 'CMN', city: 'Marrakesh via Casablanca', country: 'Morocco', vibes: ['city'], basePrice: 780 },
  { code: 'CAI', city: 'Cairo', country: 'Egypt', vibes: ['city'], basePrice: 850 },
  { code: 'CPT', city: 'Cape Town', country: 'South Africa', vibes: ['city', 'nature'], basePrice: 1100 },
  { code: 'NBO', city: 'Nairobi', country: 'Kenya', vibes: ['nature'], basePrice: 1050 },
  { code: 'TLV', city: 'Tel Aviv', country: 'Israel', vibes: ['city', 'beach'], basePrice: 900 },
  // US & Canada getaways
  { code: 'LAS', city: 'Las Vegas', country: 'USA', vibes: ['city'], basePrice: 230 },
  { code: 'AUS', city: 'Austin', country: 'USA', vibes: ['city'], basePrice: 250 },
  { code: 'BNA', city: 'Nashville', country: 'USA', vibes: ['city'], basePrice: 240 },
  { code: 'NOL', city: 'New Orleans', country: 'USA', vibes: ['city'], basePrice: 260 },
  { code: 'SAV', city: 'Savannah', country: 'USA', vibes: ['city'], basePrice: 280 },
  { code: 'YVR', city: 'Vancouver', country: 'Canada', vibes: ['city', 'nature'], basePrice: 340 },
  { code: 'YYZ', city: 'Toronto', country: 'Canada', vibes: ['city'], basePrice: 300 },
  { code: 'YUL', city: 'Montréal', country: 'Canada', vibes: ['city'], basePrice: 290 },
  { code: 'ANC', city: 'Anchorage', country: 'USA', vibes: ['nature'], basePrice: 520 },
  // Ski & mountains
  { code: 'SLC', city: 'Salt Lake City', country: 'USA', vibes: ['ski', 'nature'], basePrice: 320 },
  { code: 'BZN', city: 'Bozeman', country: 'USA', vibes: ['ski', 'nature'], basePrice: 380 },
  { code: 'EGE', city: 'Vail/Eagle', country: 'USA', vibes: ['ski'], basePrice: 470 },
  { code: 'JAC', city: 'Jackson Hole', country: 'USA', vibes: ['ski', 'nature'], basePrice: 490 },
  { code: 'MTJ', city: 'Telluride/Montrose', country: 'USA', vibes: ['ski', 'nature'], basePrice: 460 },
  { code: 'RNO', city: 'Reno/Tahoe', country: 'USA', vibes: ['ski', 'nature'], basePrice: 350 },
  { code: 'YYC', city: 'Calgary/Banff', country: 'Canada', vibes: ['ski', 'nature'], basePrice: 410 },
  { code: 'INN', city: 'Innsbruck', country: 'Austria', vibes: ['ski'], basePrice: 820 }
];

export const VIBES = ['beach', 'city', 'ski', 'nature'];

// Each origin connects to a deterministic slice of destinations so the route
// matrix stays bounded but every origin covers all four vibes.
export function routesForOrigin(originCode) {
  const idx = Math.max(0, ORIGINS.findIndex((o) => o.code === originCode));
  return DESTINATIONS.filter((_, i) => (i + idx) % 3 !== 0 || i % 7 === idx % 7);
}
