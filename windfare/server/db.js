import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_DB_PATH = process.env.WINDFARE_DB || join(HERE, '..', 'windfare.db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS airports (
  code    TEXT PRIMARY KEY,
  city    TEXT NOT NULL,
  name    TEXT,
  country TEXT,
  vibes   TEXT NOT NULL DEFAULT '[]',   -- JSON array
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
  created_at TEXT NOT NULL
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
  return db;
}
