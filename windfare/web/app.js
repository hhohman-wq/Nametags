/* Windfare feed client. State lives in localStorage under 'windfare.user'. */

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

const state = {
  user: loadUser(),
  windowDays: 0,
  vibe: '',
  airports: null,
  watched: new Set()
};

function loadUser() {
  try { return JSON.parse(localStorage.getItem('windfare.user')) || null; } catch { return null; }
}
function saveUser(u) {
  state.user = u;
  try { localStorage.setItem('windfare.user', JSON.stringify(u)); } catch { /* private mode */ }
}

async function api(path, opts) {
  const res = await fetch(path, opts);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || res.statusText);
    err.code = body.code;
    throw err;
  }
  return res.json();
}

/* ---------- sparkline: 12 recent fares, muted line, accent endpoint ---------- */
function sparkline(trend) {
  const w = 96, h = 34, pad = 4;
  if (!trend || trend.length < 2) return '';
  const pts = trend.slice(-12);
  const min = Math.min(...pts), max = Math.max(...pts);
  const span = max - min || 1;
  const x = (i) => pad + (i / (pts.length - 1)) * (w - pad * 2);
  const y = (v) => h - pad - ((v - min) / span) * (h - pad * 2);
  const d = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const lastX = x(pts.length - 1).toFixed(1), lastY = y(pts[pts.length - 1]).toFixed(1);
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="false" role="img">
    <title>Last ${pts.length} fares, $${min}–$${max}</title>
    <path d="${d}" fill="none" stroke="var(--spark-muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${lastX}" cy="${lastY}" r="3.5" fill="var(--accent)"/>
  </svg>`;
}

/* ---------- feed ---------- */
const KIND_LABEL = { flash: 'FLASH SALE', anomaly: 'RARE FARE', quick: 'QUICK TRIP' };

function fmtDate(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function countdownText(expiresAt) {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return 'ended';
  const hrs = Math.floor(ms / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  return hrs > 0 ? `ends in ${hrs}h ${mins}m` : `ends in ${mins}m`;
}

function renderCard(deal) {
  const node = $('#cardTpl').content.cloneNode(true);
  const card = $('.card', node);
  card.classList.add(`kind-${deal.kind}`);

  const vibe = deal.dest.vibes[0] || 'city';
  const banner = $('.card-banner', node);
  banner.classList.add(`v-${vibe}`);
  $('.kind-pill', node).textContent = KIND_LABEL[deal.kind] ?? deal.kind.toUpperCase();
  $('.banner-codes', node).textContent = `${deal.origin} → ${deal.dest.code}`;
  $('.banner-city', node).textContent = `${deal.dest.city}, ${deal.dest.country}`;

  if (deal.expiresAt) {
    const cd = $('.countdown', node);
    cd.hidden = false;
    cd.textContent = countdownText(deal.expiresAt);
    cd.dataset.expires = deal.expiresAt;
  }

  $('.headline', node).textContent = deal.headline;
  $('.price', node).textContent = `$${deal.price}`;
  $('.typical', node).textContent = `$${deal.typical}`;
  const pct = $('.pct-pill', node);
  if (deal.pctBelow >= 10) { pct.className = 'pct-pill pct-good'; pct.textContent = `−${deal.pctBelow}%`; }
  else if (deal.pctBelow > 0) { pct.className = 'pct-pill pct-flat'; pct.textContent = `−${deal.pctBelow}%`; }
  else pct.remove();

  $('.spark', node).innerHTML = sparkline(deal.trend);
  $('.dates', node).textContent =
    `${fmtDate(deal.departDate)} → ${fmtDate(deal.returnDate)} · round trip`;

  const watchBtn = $('.btn-watch', node);
  const setWatchUi = (on) => {
    watchBtn.classList.toggle('watching', on);
    watchBtn.textContent = on ? 'Watching' : 'Watch';
  };
  setWatchUi(deal.watched || state.watched.has(deal.routeId));
  watchBtn.addEventListener('click', async () => {
    const on = watchBtn.classList.contains('watching');
    try {
      if (on) {
        await api(`/api/watches?user=${state.user.id}&routeId=${deal.routeId}`, { method: 'DELETE' });
        state.watched.delete(deal.routeId);
        setWatchUi(false);
        toast('Watch removed');
      } else {
        const res = await api('/api/watches', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ user: state.user.id, routeId: deal.routeId })
        });
        state.watched.add(deal.routeId);
        setWatchUi(true);
        toast(`Watching — we'll alert you under $${res.threshold}`);
      }
    } catch (e) {
      if (e.code === 'upgrade_required') openProSheet(e.message);
      else toast(e.message);
    }
  });

  $('.btn-share', node).addEventListener('click', async () => {
    const url = deal.dealId ? `${location.origin}/deal/${deal.dealId}` : deal.bookUrl;
    const text = `${deal.origin} → ${deal.dest.city} for $${deal.price} (${deal.pctBelow}% below typical) on Windfare`;
    if (navigator.share) {
      navigator.share({ title: 'Windfare deal', text, url }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(url).catch(() => {});
      toast('Link copied');
    }
  });

  const book = $('.btn-book', node);
  book.textContent = 'Book';
  book.href = deal.bookUrl;
  return node;
}

async function loadFeed() {
  const feedEl = $('#feed');
  const params = new URLSearchParams();
  if (state.user) params.set('user', state.user.id);
  if (state.windowDays) params.set('window', state.windowDays);
  if (state.vibe) params.set('vibe', state.vibe);
  const data = await api(`/api/feed?${params}`);

  $('#profileHome').textContent = `${data.home} · $${data.budget}`;
  $('#proBadge').hidden = !data.pro;
  feedEl.replaceChildren();

  if (!data.pro && data.lockedCount > 0) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'card-locked';
    btn.innerHTML = `<div><span class="lock-kicker">PRO EARLY ACCESS</span><strong></strong> just landed. Pro members see rare fares 60 minutes before everyone else.</div>`;
    $('strong', btn).textContent = data.lockedCount === 1 ? 'A rare fare' : `${data.lockedCount} rare fares`;
    btn.addEventListener('click', () => openProSheet());
    feedEl.append(btn);
  }

  if (data.cards.length === 0) {
    const p = document.createElement('p');
    p.className = 'feed-empty';
    p.textContent = 'No trips match these filters right now. Fares refresh every minute — loosen a filter or check back soon.';
    feedEl.append(p);
    return;
  }
  for (const deal of data.cards) feedEl.append(renderCard(deal));
}

/* countdown ticks */
setInterval(() => {
  for (const el of $$('.countdown[data-expires]')) el.textContent = countdownText(el.dataset.expires);
}, 30000);

/* ---------- filters ---------- */
function wireChipRow(rootSel, dataKey, onPick) {
  $(rootSel).addEventListener('click', (e) => {
    const btn = e.target.closest('.chip');
    if (!btn) return;
    $$('.chip', $(rootSel)).forEach((c) => c.classList.remove('active'));
    btn.classList.add('active');
    onPick(btn.dataset[dataKey]);
  });
}
wireChipRow('#windowChips', 'window', (v) => { state.windowDays = Number(v); loadFeed(); });
wireChipRow('#vibeChips', 'vibe', (v) => { state.vibe = v; loadFeed(); });

/* ---------- notifications ---------- */
async function refreshBadge() {
  if (!state.user) return;
  const notifs = await api(`/api/notifications?user=${state.user.id}`).catch(() => []);
  const unread = notifs.filter((n) => !n.read).length;
  const badge = $('#bellBadge');
  badge.hidden = unread === 0;
  badge.textContent = unread > 9 ? '9+' : String(unread);
}

$('#bellBtn').addEventListener('click', async () => {
  const drawer = $('#notifDrawer');
  const list = $('#notifList');
  const notifs = state.user ? await api(`/api/notifications?user=${state.user.id}`).catch(() => []) : [];
  list.replaceChildren();
  if (notifs.length === 0) {
    const p = document.createElement('p');
    p.className = 'feed-empty';
    p.textContent = 'No alerts yet. Watch a trip and we’ll ping you when its price drops.';
    list.append(p);
  }
  for (const n of notifs) {
    const div = document.createElement('div');
    div.className = `notif${n.read ? '' : ' unread'}`;
    const when = new Date(n.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    div.innerHTML = `<p class="notif-title"></p><p class="notif-body"></p><span class="notif-time">${when}</span>`;
    $('.notif-title', div).textContent = n.title;
    $('.notif-body', div).textContent = n.body;
    list.append(div);
  }
  drawer.hidden = false;
  if (state.user) {
    await api('/api/notifications/read', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user: state.user.id })
    }).catch(() => {});
    refreshBadge();
  }
});
$('#notifClose').addEventListener('click', () => { $('#notifDrawer').hidden = true; });
$('#notifDrawer').addEventListener('click', (e) => { if (e.target.id === 'notifDrawer') e.currentTarget.hidden = true; });

setInterval(refreshBadge, 30000);

/* ---------- onboarding / profile ---------- */
async function openOnboarding() {
  if (!state.airports) state.airports = await api('/api/airports');
  const sel = $('#homeSelect');
  sel.replaceChildren();
  for (const a of state.airports.origins) {
    const opt = document.createElement('option');
    opt.value = a.code;
    opt.textContent = `${a.city} (${a.code})`;
    sel.append(opt);
  }
  if (state.user) {
    sel.value = state.user.home;
    $('#budgetRange').value = state.user.budget;
    $('#budgetOut').textContent = `$${state.user.budget}`;
    $$('#onboardVibes .chip').forEach((c) =>
      c.classList.toggle('active', state.user.vibes.includes(c.dataset.vibe)));
  }
  $('#onboard').hidden = false;
}

$('#budgetRange').addEventListener('input', (e) => {
  $('#budgetOut').textContent = `$${e.target.value}`;
});
$('#onboardVibes').addEventListener('click', (e) => {
  const btn = e.target.closest('.chip');
  if (btn) btn.classList.toggle('active');
});
$('#profileBtn').addEventListener('click', openOnboarding);

$('#onboardForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const vibes = $$('#onboardVibes .chip.active').map((c) => c.dataset.vibe);
  const body = {
    id: state.user?.id,
    home: $('#homeSelect').value,
    budget: Number($('#budgetRange').value),
    vibes
  };
  try {
    const user = await api('/api/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    saveUser(user);
    $('#onboard').hidden = true;
    await loadFeed();
    refreshBadge();
  } catch (err) { toast(err.message); }
});

/* ---------- Windfare Pro ---------- */
function openProSheet(reason) {
  if (reason) toast(reason);
  $('#proSheet').hidden = false;
}
$('#proBadge').addEventListener('click', () => openProSheet());
$('#proClose').addEventListener('click', () => { $('#proSheet').hidden = true; });
$('#proSheet').addEventListener('click', (e) => { if (e.target.id === 'proSheet') e.currentTarget.hidden = true; });

$('#proUpgrade').addEventListener('click', async () => {
  if (!state.user) return openOnboarding();
  const btn = $('#proUpgrade');
  btn.disabled = true;
  try {
    const res = await api('/api/billing/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user: state.user.id })
    });
    if (res.url) {
      location.href = res.url; // Stripe Checkout
    } else {
      $('#proSheet').hidden = true;
      toast('Windfare Pro is active. Rare fares now land instantly.');
      await loadFeed();
    }
  } catch (e) { toast(e.message); } finally { btn.disabled = false; }
});

/* ---------- toast ---------- */
let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

/* ---------- boot ---------- */
(async function boot() {
  if (new URLSearchParams(location.search).get('upgraded') === '1') {
    toast('Windfare Pro is active. Rare fares now land instantly.');
    history.replaceState(null, '', '/');
  }
  if (!state.user) {
    await openOnboarding();
    await loadFeed(); // default JFK feed behind the onboarding sheet
  } else {
    await loadFeed();
    refreshBadge();
  }
  setInterval(loadFeed, 60000); // fares move every poll; keep the feed live
})();
