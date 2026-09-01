import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_DB_PATH = process.env.STEALAWAY_DB || join(HERE, '..', 'stealaway.db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS airports (
  code    TEXT PRIMARY KEY,
  city    TEXT NOT NULL,
  name    TEXT,
  country TEXT,
  vibes   TEXT NOT NULL DEFAULT '[]',   -- JSON array
  nightly REAL,                         -- est. mid-range hotel rate (whole-trip pricing)
  todo    TEXT NOT NULL DEFAULT '[]',   -- JSON array of curated highlights
  is_origin INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS routes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  origin     TEXT NOT NULL REFERENCES airports(code),
  dest       TEXT NOT NULL REFERENCES airports(code),
  base_price REAL NOT NULL,
  UNIQUE(origin, dest)
);

-- One row per observed round-trip fare (route + departure date bucket).
CREATE TABLE IF NOT EXISTS price_obs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  route_id    INTEGER NOT NULL REFERENCES routes(id),
  depart_date TEXT NOT NULL,
  price       REAL NOT NULL,
  is_sale     INTEGER NOT NULL DEFAULT 0,
  observed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_obs_route_time ON price_obs(route_id, observed_at);

CREATE TABLE IF NOT EXISTS deals (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  route_id    INTEGER NOT NULL REFERENCES routes(id),
  type        TEXT NOT NULL CHECK (type IN ('flash','anomaly','quick')),
  price       REAL NOT NULL,
  typical     REAL NOT NULL,
  pct_below   REAL NOT NULL,
  depart_date TEXT NOT NULL,
  return_date TEXT NOT NULL,
  headline    TEXT,
  expires_at  TEXT,
  created_at  TEXT NOT NULL,
  active      INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_deals_active ON deals(active, route_id);

CREATE TABLE IF NOT EXISTS users (
  id         TEXT PRIMARY KEY,
  home       TEXT NOT NULL,
  budget     INTEGER NOT NULL DEFAULT 800,
  vibes      TEXT NOT NULL DEFAULT '[]',
  pro        INTEGER NOT NULL DEFAULT 0,
  pro_since  TEXT,
  created_at TEXT NOT NULL
);

-- Revenue: every outbound booking click, with its estimated commission.
CREATE TABLE IF NOT EXISTS clicks (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        TEXT,
  deal_id        INTEGER,
  route_id       INTEGER NOT NULL,
  price          REAL NOT NULL,
  est_commission REAL NOT NULL,
  target         TEXT NOT NULL,     -- affiliate network the click went to
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_clicks_time ON clicks(created_at);

-- Revenue: Stealaway Pro payments (Stripe in production, 'dev' locally).
CREATE TABLE IF NOT EXISTS payments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'pro_year',
  processor    TEXT NOT NULL,
  external_id  TEXT,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS watches (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL REFERENCES users(id),
  route_id   INTEGER NOT NULL REFERENCES routes(id),
  threshold  REAL,                -- alert when price <= threshold
  last_alert_price REAL,
  created_at TEXT NOT NULL,
  UNIQUE(user_id, route_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL REFERENCES users(id),
  watch_id   INTEGER,
  deal_id    INTEGER,
  kind       TEXT NOT NULL,       -- 'drop' | 'flash' | 'anomaly'
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read);
`;

export function openDb(path = DEFAULT_DB_PATH) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

// Additive migrations for databases created before a column existed.
function migrate(db) {
  const usersCols = db.prepare("SELECT name FROM pragma_table_info('users')").all().map((c) => c.name);
  if (!usersCols.includes('pro')) db.exec("ALTER TABLE users ADD COLUMN pro INTEGER NOT NULL DEFAULT 0");
  if (!usersCols.includes('pro_since')) db.exec('ALTER TABLE users ADD COLUMN pro_since TEXT');
  const airportCols = db.prepare("SELECT name FROM pragma_table_info('airports')").all().map((c) => c.name);
  if (!airportCols.includes('nightly')) db.exec('ALTER TABLE airports ADD COLUMN nightly REAL');
  if (!airportCols.includes('todo')) db.exec("ALTER TABLE airports ADD COLUMN todo TEXT NOT NULL DEFAULT '[]'");
}
