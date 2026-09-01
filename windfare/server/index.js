import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

import { openDb } from './db.js';
import { seed } from './seed.js';
import { createProviders } from './provider.js';
import { startPolling } from './poller.js';
import { scoreDeal, routeStats } from './dealengine.js';
import {
  affiliateTarget, recordClick, createCheckout, handleStripeWebhook,
  adminStats, FREE_WATCH_LIMIT, PRO_EARLY_ACCESS_MIN, PRO_PRICE_CENTS
} from './revenue.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = join(HERE, '..', 'web');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json'
};

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function readRaw(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 1e6) reject(new Error('body too large'));
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function readBody(req) {
  const raw = await readRaw(req);
  try { return raw ? JSON.parse(raw) : {}; } catch { throw Object.assign(new Error('invalid JSON'), { status: 400 }); }
}

export async function buildApp({ dbPath, db = openDb(dbPath), providers = createProviders(), autoSeed = true } = {}) {
  if (autoSeed && db.prepare('SELECT COUNT(*) AS n FROM routes').get().n === 0) {
    await seed(db);
  }

  const trendStmt = db.prepare(
    `SELECT price FROM (
       SELECT price, observed_at, id FROM price_obs WHERE route_id = ?
       ORDER BY observed_at DESC, id DESC LIMIT 12
     ) ORDER BY observed_at ASC, id ASC`
  );
  const destStmt = db.prepare('SELECT code, city, country, vibes FROM airports WHERE code = ?');
  const userStmt = db.prepare('SELECT * FROM users WHERE id = ?');

  function cardBase(routeId, origin, destCode) {
    const dest = destStmt.get(destCode);
    return {
      routeId,
      origin,
      dest: { ...dest, vibes: JSON.parse(dest.vibes) },
      trend: trendStmt.all(routeId).map((r) => r.price)
    };
  }

  // Book links route through /go so every outbound click is recorded.
  const goUrl = (c, userId) => {
    const p = new URLSearchParams({
      route: c.routeId, depart: c.departDate, ret: c.returnDate, price: c.price
    });
    if (c.dealId) p.set('deal', c.dealId);
    if (userId) p.set('user', userId);
    return `/go?${p}`;
  };

  function getFeed({ userId, windowDays = 0, vibe = null }) {
    const user = userId ? userStmt.get(userId) : null;
    const home = user?.home ?? 'JFK';
    const budget = user?.budget ?? 800;
    const isPro = user?.pro === 1;
    const userVibes = user ? JSON.parse(user.vibes) : [];
    const now = Date.now();
    const horizon = windowDays > 0 ? new Date(now + windowDays * 86400000).toISOString().slice(0, 10) : null;
    // Pro sees rare fares immediately; free users after the early-access hold.
    const earlyCutoff = new Date(now - PRO_EARLY_ACCESS_MIN * 60000).toISOString();

    const watchedRoutes = new Set(
      user ? db.prepare('SELECT route_id FROM watches WHERE user_id = ?').all(userId).map((w) => w.route_id) : []
    );

    const dealRows = db
      .prepare(
        `SELECT d.*, r.origin, r.dest, a.vibes AS dest_vibes
         FROM deals d JOIN routes r ON r.id = d.route_id JOIN airports a ON a.code = r.dest
         WHERE d.active = 1 AND r.origin = ?`
      )
      .all(home);

    const cards = [];
    const covered = new Set();
    let lockedCount = 0;
    for (const d of dealRows) {
      if (horizon && d.depart_date > horizon) continue;
      if (vibe && !JSON.parse(d.dest_vibes).includes(vibe)) continue;
      if (!isPro && d.type === 'anomaly' && d.created_at > earlyCutoff) {
        lockedCount++;
        continue;
      }
      covered.add(`${d.route_id}:${d.depart_date}`);
      const card = {
        ...cardBase(d.route_id, d.origin, d.dest),
        kind: d.type,
        dealId: d.id,
        price: d.price,
        typical: d.typical,
        pctBelow: d.pct_below,
        departDate: d.depart_date,
        returnDate: d.return_date,
        expiresAt: d.expires_at,
        headline: d.headline,
        watched: watchedRoutes.has(d.route_id),
        score: scoreDeal(d, { budget, vibes: userVibes, now })
      };
      card.bookUrl = goUrl(card, userId);
      cards.push(card);
    }

    // Quick trips: freshest fare per route departing within 14 days, under
    // budget — spontaneity cards even when nothing is "a deal".
    const quickHorizon = new Date(now + 14 * 86400000).toISOString().slice(0, 10);
    const latestFares = db
      .prepare(
        `SELECT o.route_id, o.depart_date, o.price, r.origin, r.dest, a.vibes AS dest_vibes
         FROM price_obs o
         JOIN routes r ON r.id = o.route_id
         JOIN airports a ON a.code = r.dest
         WHERE r.origin = ? AND o.id IN (
           SELECT MAX(id) FROM price_obs WHERE depart_date <= ? GROUP BY route_id, depart_date
         ) AND o.depart_date <= ?
         ORDER BY o.price ASC LIMIT 30`
      )
      .all(home, quickHorizon, quickHorizon);

    for (const f of latestFares) {
      if (f.price > budget) continue;
      if (covered.has(`${f.route_id}:${f.depart_date}`)) continue;
      if (vibe && !JSON.parse(f.dest_vibes).includes(vibe)) continue;
      if (horizon && f.depart_date > horizon) continue;
      const stats = routeStats(db, f.route_id, { now });
      const pctBelow = Math.round((1 - f.price / stats.median) * 100);
      const dest = destStmt.get(f.dest);
      const ret = new Date(new Date(f.depart_date).getTime() + 5 * 86400000).toISOString().slice(0, 10);
      const card = {
        ...cardBase(f.route_id, f.origin, f.dest),
        kind: 'quick',
        dealId: null,
        price: f.price,
        typical: Math.round(stats.median),
        pctBelow,
        departDate: f.depart_date,
        returnDate: ret,
        expiresAt: null,
        headline: `Quick trip: ${dest.city} next week-ish`,
        watched: watchedRoutes.has(f.route_id),
        score: 30 + Math.max(0, pctBelow) * 1.5
      };
      card.bookUrl = goUrl(card, userId);
      cards.push(card);
    }

    cards.sort((a, b) => b.score - a.score);
    // Variety guard: one card per route — the best-scored departure wins, so
    // the feed reads as forty destinations, not one sale four times.
    const seenRoute = new Set();
    const varied = cards.filter((c) => !seenRoute.has(c.routeId) && seenRoute.add(c.routeId));
    return { home, budget, pro: isPro, lockedCount, cards: varied.slice(0, 40) };
  }

  const routesTable = {
    'GET /api/health': () => ({ ok: true, name: 'windfare', providers: providers.map((p) => p.name) }),

    'GET /api/airports': () => ({
      origins: db.prepare('SELECT code, city, name FROM airports WHERE is_origin = 1 ORDER BY city').all(),
      vibes: ['beach', 'city', 'ski', 'nature']
    }),

    'POST /api/users': async (req) => {
      const b = await readBody(req);
      const id = b.id || randomUUID();
      if (!b.home) throw Object.assign(new Error('home airport required'), { status: 400 });
      const vibes = JSON.stringify(Array.isArray(b.vibes) ? b.vibes : []);
      db.prepare(
        `INSERT INTO users (id, home, budget, vibes, created_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET home = excluded.home, budget = excluded.budget, vibes = excluded.vibes`
      ).run(id, b.home, Number(b.budget) || 800, vibes, new Date().toISOString());
      const u = userStmt.get(id);
      return { id, home: u.home, budget: u.budget, vibes: JSON.parse(u.vibes), pro: u.pro === 1 };
    },

    'GET /api/feed': (_req, url) =>
      getFeed({
        userId: url.searchParams.get('user'),
        windowDays: Number(url.searchParams.get('window')) || 0,
        vibe: url.searchParams.get('vibe') || null
      }),

    'GET /api/watches': (_req, url) => {
      const userId = url.searchParams.get('user');
      return db
        .prepare(
          `SELECT w.id, w.route_id AS routeId, w.threshold, r.origin, r.dest, a.city AS destCity
           FROM watches w JOIN routes r ON r.id = w.route_id JOIN airports a ON a.code = r.dest
           WHERE w.user_id = ?`
        )
        .all(userId);
    },

    'POST /api/watches': async (req) => {
      const b = await readBody(req);
      if (!b.user || !b.routeId) throw Object.assign(new Error('user and routeId required'), { status: 400 });
      const user = userStmt.get(b.user);
      if (!user) throw Object.assign(new Error('unknown user'), { status: 404 });
      const count = db.prepare('SELECT COUNT(*) n FROM watches WHERE user_id = ?').get(b.user).n;
      const exists = db.prepare('SELECT 1 FROM watches WHERE user_id = ? AND route_id = ?').get(b.user, b.routeId);
      if (user.pro !== 1 && !exists && count >= FREE_WATCH_LIMIT) {
        throw Object.assign(
          new Error(`Free plan watches ${FREE_WATCH_LIMIT} trips. Windfare Pro watches as many as you like.`),
          { status: 402, code: 'upgrade_required' }
        );
      }
      const stats = routeStats(db, b.routeId);
      const threshold = b.threshold ?? (Number.isFinite(stats.median) ? Math.round(stats.median * 0.9) : null);
      db.prepare(
        `INSERT INTO watches (user_id, route_id, threshold, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, route_id) DO UPDATE SET threshold = excluded.threshold`
      ).run(b.user, b.routeId, threshold, new Date().toISOString());
      return { ok: true, threshold };
    },

    'DELETE /api/watches': async (req, url) => {
      const userId = url.searchParams.get('user');
      const routeId = Number(url.searchParams.get('routeId'));
      db.prepare('DELETE FROM watches WHERE user_id = ? AND route_id = ?').run(userId, routeId);
      return { ok: true };
    },

    'GET /api/notifications': (_req, url) => {
      const userId = url.searchParams.get('user');
      return db
        .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50')
        .all(userId);
    },

    'POST /api/notifications/read': async (req) => {
      const b = await readBody(req);
      db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').run(b.user);
      return { ok: true };
    },

    'POST /api/billing/checkout': async (req) => {
      const b = await readBody(req);
      if (!b.user) throw Object.assign(new Error('user required'), { status: 400 });
      const origin = process.env.WINDFARE_PUBLIC_URL || `http://localhost:${process.env.PORT || 4600}`;
      return { priceCents: PRO_PRICE_CENTS, ...(await createCheckout(db, b.user, origin)) };
    },

    'POST /api/billing/webhook': async (req) => {
      const raw = await readRaw(req);
      return handleStripeWebhook(db, raw, req.headers['stripe-signature']);
    },

    'GET /api/admin/stats': (_req, url) => {
      const key = process.env.WINDFARE_ADMIN_KEY;
      if (key && url.searchParams.get('key') !== key) {
        throw Object.assign(new Error('admin key required (?key=...)'), { status: 401 });
      }
      return adminStats(db);
    }
  };

  async function handle(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const key = `${req.method} ${url.pathname}`;

    try {
      if (routesTable[key]) {
        return json(res, 200, await routesTable[key](req, url));
      }

      // Tracked booking handoff: record the click, then redirect out.
      if (req.method === 'GET' && url.pathname === '/go') {
        const routeId = Number(url.searchParams.get('route'));
        const route = db.prepare('SELECT id, origin, dest FROM routes WHERE id = ?').get(routeId);
        if (!route) return json(res, 404, { error: 'unknown route' });
        const departDate = url.searchParams.get('depart');
        const returnDate = url.searchParams.get('ret') ?? departDate;
        const target = affiliateTarget({ origin: route.origin, dest: route.dest, departDate, returnDate });
        recordClick(db, {
          userId: url.searchParams.get('user'),
          dealId: Number(url.searchParams.get('deal')) || null,
          routeId,
          price: Number(url.searchParams.get('price')) || 0,
          network: target.network,
          commissionable: target.commissionable
        });
        res.writeHead(302, { location: target.url });
        return res.end();
      }

      // Share page: /deal/:id — server-rendered card with OG tags.
      const dealMatch = url.pathname.match(/^\/deal\/(\d+)$/);
      if (req.method === 'GET' && dealMatch) {
        const d = db
          .prepare(
            `SELECT d.*, r.origin, r.dest, a.city AS dest_city, a.country
             FROM deals d JOIN routes r ON r.id = d.route_id JOIN airports a ON a.code = r.dest
             WHERE d.id = ?`
          )
          .get(Number(dealMatch[1]));
        if (!d) return json(res, 404, { error: 'deal not found' });
        const title = `${d.origin} → ${d.dest_city} for $${d.price} (${d.pct_below}% below typical)`;
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        return res.end(sharePage(title, d));
      }

      if (req.method === 'GET' && url.pathname.startsWith('/api/')) {
        return json(res, 404, { error: 'not found' });
      }

      // Static frontend (+ /admin page).
      if (req.method === 'GET') {
        let path = url.pathname === '/' ? '/index.html' : url.pathname === '/admin' ? '/admin.html' : url.pathname;
        const file = normalize(join(WEB_DIR, path));
        if (file.startsWith(WEB_DIR) && existsSync(file)) {
          res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
          return res.end(readFileSync(file));
        }
      }
      json(res, 404, { error: 'not found' });
    } catch (err) {
      json(res, err.status ?? 500, { error: err.message, ...(err.code ? { code: err.code } : {}) });
    }
  }

  const server = createServer(handle);
  return { server, db, providers };
}

function sharePage(title, d) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — Windfare</title>
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="Departs ${esc(d.depart_date)}, back ${esc(d.return_date)}. Typically $${esc(d.typical)}. Caught on Windfare.">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="stylesheet" href="/styles.css"></head>
<body class="share-body"><main class="share-card">
<p class="share-brand">WINDFARE</p>
<h1>${esc(d.origin)} → ${esc(d.dest_city)}</h1>
<p class="share-price">$${esc(d.price)} <span class="share-typical">typically $${esc(d.typical)}</span></p>
<p class="share-dates">${esc(d.depart_date)} → ${esc(d.return_date)} · ${esc(d.pct_below)}% below typical</p>
<a class="share-cta" href="/">Open the feed</a>
</main></body></html>`;
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  const port = Number(process.env.PORT) || 4600;
  const { server, db, providers } = await buildApp({});
  const stop = startPolling(db, providers, {
    intervalMs: Number(process.env.WINDFARE_POLL_MS) || 60000,
    log: (m) => console.log(`[windfare] ${m}`)
  });
  server.listen(port, () =>
    console.log(`[windfare] serving on http://localhost:${port} (providers: ${providers.map((p) => p.name).join(', ')})`)
  );
  process.on('SIGINT', () => { stop(); server.close(); process.exit(0); });
}
