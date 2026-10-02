(function () {
'use strict';
/* ---------- app: store, rendering, interaction ---------- */
const $ = id => document.getElementById(id);
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const k in attrs) { const v = attrs[k]; if (v == null || v === false) continue; if (k === 'class') el.className = v; else if (k === 'hidden') el.hidden = !!v; else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v); else if (k === 'vars') { for (const n in v) el.style.setProperty(n, v[n]); } else el.setAttribute(k, v === true ? '' : v); }
  for (const kid of kids.flat()) { if (kid == null || kid === false) continue; el.append(kid.nodeType ? kid : document.createTextNode(String(kid))); }
  return el;
}
const SVGNS = 'http://www.w3.org/2000/svg';
function sv(tag, attrs, ...kids) { const el = document.createElementNS(SVGNS, tag); if (attrs) for (const k in attrs) if (attrs[k] != null) el.setAttribute(k, attrs[k]); for (const kid of kids.flat()) if (kid != null) el.append(kid.nodeType ? kid : document.createTextNode(String(kid))); return el; }
const money = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' });
const money0 = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });
const fmtDay = ts => new Date(ts).toLocaleDateString('en-CA', { weekday: 'long', month: 'short', day: 'numeric' });
const fmtShort = ts => new Date(ts).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
const fmtWd = ts => new Date(ts).toLocaleDateString('en-CA', { weekday: 'short' });
const fmtTime = ts => new Date(ts).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });
const itemName = id => (MENU[IDX[id]] || { name: 'Item' }).name;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const newId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
function agoText(ts) { const d = Math.round((startOfDay(Date.now()) - startOfDay(ts)) / DAY_MS); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d + ' days ago'; }
function hourLabel(hr) { return (hr % 12 || 12) + (hr < 12 ? ' am' : ' pm'); }
function glass(it, cls) { const g = h('span', { class: 'glass' + (cls ? ' ' + cls : ''), 'aria-hidden': 'true' }); it.layers.forEach((c, i) => g.style.setProperty('--l' + (i + 1), c)); return g; }

/* ----- store: the Node API and its database when the server is running, this browser otherwise ----- */
const SAMPLE = sampleMembers();
const store = { api: false, kind: '', live: false, shared: [], local: [], sharedMembers: [], localMembers: [] };
function parseSale(id, d, allowSim) {
  if (!d || typeof d !== 'object') return null;
  const ts = Number(d.ts); if (!Number.isFinite(ts) || ts > Date.now() + DAY_MS || ts < Date.now() - 400 * DAY_MS) return null;
  if (!Array.isArray(d.lines) || d.lines.length > 20) return null;
  const lines = [];
  for (const l of d.lines) { if (!l || IDX[l.id] === undefined) continue; const q = Math.floor(Number(l.q)), p = Number(l.p); if (!(q >= 1 && q <= 50) || !(p >= 0 && p <= 500)) continue; lines.push({ id: l.id, q, p }); }
  if (!lines.length) return null;
  return { id: String(id), ts, lines, total: saleTotal(lines), pay: d.pay === 'cash' ? 'cash' : 'card', m: typeof d.m === 'string' && d.m.length <= 40 ? d.m : null, src: d.src === 'rush' ? 'rush' : allowSim && d.src === 'sim' ? 'sim' : 'till' };
}
function parseMember(id, d) {
  if (!d || typeof d !== 'object') return null;
  const name = typeof d.name === 'string' ? d.name.trim().slice(0, 40) : '', num = Math.floor(Number(d.num));
  if (!name || !(num > 0 && num < 1e6)) return null;
  return { id: String(id), num, name, joined: Number(d.joined) || 0, sample: false };
}
function loadLocal() {
  try {
    store.local = JSON.parse(localStorage.getItem('gt.sales') || '[]').map(x => parseSale(x.id, x)).filter(Boolean);
    store.localMembers = JSON.parse(localStorage.getItem('gt.members') || '[]').map(x => parseMember(x.id, x)).filter(Boolean);
  } catch (e) { store.local = []; store.localMembers = []; }
}
function saveLocal() { try { localStorage.setItem('gt.sales', JSON.stringify(store.local.slice(-500))); localStorage.setItem('gt.members', JSON.stringify(store.localMembers)); } catch (e) { /* storage unavailable: keep in memory */ } }
function tillSales() { return store.shared.filter(s => s.src !== 'sim').concat(store.local); }
function allMembers() { const seen = new Set(), out = []; for (const m of SAMPLE.concat(store.sharedMembers, store.localMembers)) if (!seen.has(m.id)) { seen.add(m.id); out.push(m); } return out; }
async function getJSON(url, opts) { const r = await fetch(url, opts); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }
const JSON_POST = body => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
function addShared(s) { if (s && !store.shared.some(x => x.id === s.id)) store.shared.push(s); }
function addSharedMember(m) { if (m && !store.sharedMembers.some(x => x.id === m.id)) store.sharedMembers.push(m); }
async function pull() {
  const [sales, members] = await Promise.all([getJSON('api/sales'), getJSON('api/members')]);
  store.shared = sales.map(x => parseSale(x.id, x, true)).filter(Boolean);
  store.sharedMembers = members.map(x => parseMember(x.id, x)).filter(Boolean);
  refresh();
}
async function connect() {
  try { const hl = await getJSON('api/health'); if (!hl.ok) throw new Error('not ready'); store.kind = hl.store; await pull(); store.api = true; store.live = true; refresh(); }
  catch (e) { renderChip(); return; } /* no server (page opened as a plain file or on a static host): keep working on this device */
  try {
    const es = new EventSource('api/events');
    es.addEventListener('sale', e => { const d = JSON.parse(e.data); addShared(parseSale(d.id, d, true)); refresh(); });
    es.addEventListener('member', e => { const d = JSON.parse(e.data); addSharedMember(parseMember(d.id, d)); refresh(); });
    es.addEventListener('clear', () => { pull().catch(() => {}); });
    es.onopen = () => { if (!store.live) { store.live = true; pull().catch(() => {}); } };
    es.onerror = () => { store.live = false; renderChip(); };
  } catch (e) { /* no live push: the page still works, it just needs a reload to see other screens' sales */ }
}
async function saveSale(sale) {
  if (store.api) {
    try { const saved = await getJSON('api/sales', JSON_POST({ id: sale.id, lines: sale.lines.map(l => ({ id: l.id, q: l.q })), pay: sale.pay, m: sale.m, src: sale.src })); addShared(parseSale(saved.id, saved, true)); refresh(); return 'shared'; }
    catch (e) { /* server unreachable: keep the sale on this device */ }
  }
  store.local.push(sale); saveLocal(); refresh(); return 'local';
}
async function saveMember(m) {
  if (store.api) {
    try { const saved = await getJSON('api/members', JSON_POST({ id: m.id, name: m.name })); addSharedMember(parseMember(saved.id, saved)); refresh(); return; }
    catch (e) { /* server unreachable: keep the member on this device */ }
  }
  store.localMembers.push(m); saveLocal(); refresh();
}
async function clearTill() {
  store.local = []; saveLocal();
  if (store.api) { try { await getJSON('api/sales', { method: 'DELETE' }); await pull(); return; } catch (e) { /* fall through */ } }
  refresh();
}

/* ----- state ----- */
const TABS = ['till', 'members', 'insights', 'flow'];
const S = { tab: 'till', cart: new Map(), pay: 'card', member: null, selMember: SAMPLE[0].id, selItem: 'all', busy: false, rushing: false, confirmClear: false };
let NOW = Date.now(), SIM = [], simAt = 0, simKey = '', MODEL = null, MEMBERS = [], MBY = new Map(), LATEST = [];
const seenFeed = new Set(); let feedPrimed = false;
function recompute() {
  NOW = Date.now();
  /* with the server, history comes from the database; without it, the page simulates the same history itself */
  if (store.api) { SIM = []; simAt = 0; }
  else if (NOW - simAt > 300000 || dayKey(NOW) !== simKey) { SIM = simulate(NOW, SAMPLE); simAt = NOW; simKey = dayKey(NOW); }
  MEMBERS = allMembers(); MBY = new Map(MEMBERS.map(m => [m.id, m]));
  const all = SIM.concat(store.shared, store.local);
  MODEL = analyze(all, NOW, MEMBERS);
  LATEST = all.slice().sort((a, b) => b.ts - a.ts).slice(0, 8);
}
let raf = 0;
function refresh() { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; recompute(); render(); }); }
function render() {
  renderChip();
  if (S.tab === 'till') { renderMemberBox(); renderReceipt(); renderFeed(); }
  else if (S.tab === 'members') renderMembers();
  else if (S.tab === 'insights') renderInsights();
  else renderFlow();
  renderCartBar();
}
function setTab(t, fromHash) {
  if (!TABS.includes(t)) return;
  S.tab = t;
  for (const k of TABS) { $('tab-' + k).hidden = k !== t; $('tabbtn-' + k).setAttribute('aria-selected', String(k === t)); }
  if (!fromHash) { try { history.replaceState(null, '', '#' + t); } catch (e) { /* hash is optional */ } }
  hideTip(); recompute(); render();
}
function renderChip() {
  const c = $('chip'), n = tillSales().length;
  let text = 'Saving on this device', live = false, title = 'No server found. Sales you ring up are kept in this browser.';
  if (store.api && store.live) { text = 'Database · live'; live = true; title = 'Sales are saved to ' + (store.kind === 'sqlite' ? 'SQLite' : 'the JSON store') + ' through the API and pushed to every open screen.'; }
  else if (store.api) { text = 'Database offline'; title = 'The server stopped responding. New sales stay on this device until it is back.'; }
  c.className = 'chip' + (live ? ' live' : ''); c.title = title;
  $('chipText').textContent = text + (n ? ' · ' + n + ' till sale' + (n === 1 ? '' : 's') : '');
}
let toastTimer = 0;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2600); }

/* ----- tooltip ----- */
function showTip(x, y, value, label) {
  const t = $('tip'); t.replaceChildren(h('b', null, value), label ? h('span', null, label) : null); t.hidden = false;
  const w = t.offsetWidth, ht = t.offsetHeight;
  t.style.left = clamp(x + 14, 8, window.innerWidth - w - 8) + 'px';
  t.style.top = (y - ht - 12 < 8 ? y + 18 : y - ht - 12) + 'px';
}
function hideTip() { $('tip').hidden = true; }
function tipOn(el, value, label) { el.addEventListener('pointermove', e => showTip(e.clientX, e.clientY, value, label)); el.addEventListener('pointerleave', hideTip); return el; }

/* ----- till ----- */
function renderMenu() {
  const root = $('menu');
  for (const cat of ['Parfaits', 'Bakes', 'Drinks']) {
    root.append(h('h2', { class: 'cat' }, cat));
    root.append(h('div', { class: 'tiles' }, MENU.filter(m => m.cat === cat).map(it => h('button', { class: 'tile', type: 'button', 'data-id': it.id, onclick: () => addToCart(it.id, 1) },
      glass(it), h('span', { class: 'tile-txt' }, h('span', { class: 'tile-name' }, it.name), h('span', { class: 'tile-price' }, money.format(it.price))), h('span', { class: 'tile-qty', hidden: true })))));
  }
}
function addToCart(id, n) { const q = (S.cart.get(id) || 0) + n; if (q <= 0) S.cart.delete(id); else S.cart.set(id, Math.min(q, 50)); renderReceipt(); renderCartBar(); }
function cartTotal() { let t = 0, n = 0; for (const [id, q] of S.cart) { t += MENU[IDX[id]].price * q; n += q; } return { total: round2(t), n }; }
function renderReceipt() {
  const r = $('receipt'), lines = [...S.cart], { total } = cartTotal();
  r.replaceChildren(h('div', { class: 'rc-head' }, h('b', null, "Grandma's"), h('span', null, fmtShort(Date.now()) + ' · ' + fmtTime(Date.now()))));
  if (!lines.length) r.append(h('p', { class: 'rc-empty' }, 'Tap an item to start an order.'));
  else r.append(h('ul', { class: 'rc-lines' }, lines.map(([id, q]) => h('li', null,
    h('span', { class: 'nm' }, itemName(id)),
    h('span', { class: 'step' }, h('button', { type: 'button', 'aria-label': 'One fewer ' + itemName(id), onclick: () => addToCart(id, -1) }, '−'), h('span', null, q), h('button', { type: 'button', 'aria-label': 'One more ' + itemName(id), onclick: () => addToCart(id, 1) }, '+')),
    h('span', { class: 'lt' }, money.format(MENU[IDX[id]].price * q))))));
  const sug = lines.length ? pairSuggest(MODEL, lines.map(l => l[0])) : null;
  if (sug) r.append(h('div', { class: 'rc-sug' }, h('span', { class: 'k' }, 'Goes well with'), h('span', { class: 'n' }, h('b', null, itemName(sug.id))),
    h('button', { type: 'button', class: 'btn sm', onclick: () => addToCart(sug.id, 1) }, 'Add'),
    h('span', { class: 'y' }, 'Bought with ' + itemName(sug.with) + ' ' + sug.lift.toFixed(1) + '× more often than chance')));
  r.append(h('div', { class: 'rc-total' }, h('span', null, 'Total'), h('b', null, money.format(total))));
  const btn = $('charge'); btn.textContent = total ? 'Charge ' + money.format(total) : 'Charge'; btn.disabled = !total || S.busy;
  for (const t of document.querySelectorAll('.tile')) { const q = S.cart.get(t.getAttribute('data-id')) || 0, b = t.querySelector('.tile-qty'); b.hidden = !q; b.textContent = q; }
}
function renderCartBar() {
  const { total, n } = cartTotal(), show = S.tab === 'till' && n > 0;
  $('cartbar').hidden = !show; $('main').classList.toggle('has-bar', show);
  if (show) { $('cartbarText').textContent = n + (n === 1 ? ' item · ' : ' items · ') + money.format(total); $('cartbarCharge').disabled = S.busy; }
}
function setPay(p) { S.pay = p; $('payCard').setAttribute('aria-pressed', String(p === 'card')); $('payCash').setAttribute('aria-pressed', String(p === 'cash')); }
function renderMemberResults() {
  const raw = $('memberSearch').value.trim(), q = raw.toLowerCase(), box = $('memberResults'); box.replaceChildren();
  if (!q || S.member) return;
  const list = MEMBERS.filter(m => String(m.num).startsWith(q) || m.name.toLowerCase().includes(q)).slice(0, 5);
  for (const m of list) box.append(h('button', { type: 'button', class: 'mres', onclick: () => attachMember(m.id) }, h('span', null, m.name), h('span', { class: 'num' }, '#' + m.num)));
  if (raw.length >= 2 && /[a-z]/i.test(raw) && !list.some(m => m.name.toLowerCase() === q)) box.append(h('button', { type: 'button', class: 'mres add', onclick: () => signUp(raw) }, 'Sign up “' + raw.slice(0, 40) + '” as a new member'));
}
function attachMember(id) { S.member = id; $('memberSearch').value = ''; $('memberResults').replaceChildren(); renderMemberBox(); }
function signUp(name) {
  const m = { id: newId('m'), num: MEMBERS.reduce((a, x) => Math.max(a, x.num), 1000) + 1, name: name.trim().slice(0, 40), joined: Date.now(), sample: false };
  MEMBERS.push(m); MBY.set(m.id, m); saveMember(m); attachMember(m.id); toast(m.name + ' is member #' + m.num);
}
function offerRow(label, name, why, addId) {
  return h('div', { class: 'offer' }, h('span', { class: 'k' }, label), h('span', { class: 'n' }, name), addId ? h('button', { type: 'button', class: 'btn sm', onclick: () => addToCart(addId, 1) }, 'Add') : h('span'), why ? h('span', { class: 'y' }, why) : null);
}
function whyText(why) { return why && why.length ? 'Matches a taste for ' + why.join(' and ').toLowerCase() : ''; }
function renderMemberBox() {
  const card = $('memberCard'), m = S.member && MBY.get(S.member);
  $('memberFind').hidden = !!m; card.hidden = !m; card.replaceChildren();
  if (!m) { if (S.member) S.member = null; return; }
  const ms = MODEL.mem.get(m.id), r = recsFor(MODEL, m.id);
  card.append(h('div', { class: 'mc-top' }, h('strong', null, m.name), h('span', { class: 'num' }, '#' + m.num), h('button', { type: 'button', class: 'x', onclick: () => { S.member = null; renderMemberBox(); } }, 'Remove')));
  card.append(h('p', { class: 'mc-meta' }, ms ? ms.visits + (ms.visits === 1 ? ' visit' : ' visits') + ' · last in ' + agoText(ms.last) + (r.loves.length ? ' · likes ' + r.loves.join(', ').toLowerCase() : '') : 'New member. Their taste profile starts with this sale.'));
  if (r.usual) card.append(offerRow('The usual', itemName(r.usual), 'Ordered ' + r.usualQty + (r.usualQty === 1 ? ' time' : ' times'), r.usual));
  if (r.tries[0]) card.append(offerRow('Might love', itemName(r.tries[0].id), whyText(r.tries[0].why), r.tries[0].id));
  if (r.concept) card.append(offerRow('Fall test', r.concept.name + ' parfait', 'Ask if they would try it. ' + whyText(r.concept.why), null));
}
async function charge() {
  if (!S.cart.size || S.busy) return;
  const lines = [...S.cart].map(([id, q]) => ({ id, q, p: MENU[IDX[id]].price }));
  const sale = { id: newId('s'), ts: Date.now(), lines, total: saleTotal(lines), pay: S.pay, m: S.member, src: 'till' };
  S.cart.clear(); S.member = null; S.busy = true; render();
  const where = await saveSale(sale);
  S.busy = false; render();
  toast('Sale saved · ' + money.format(sale.total) + ' · ' + sale.pay + (where === 'local' ? ' · on this device' : ''));
}
async function rush() {
  if (S.rushing) return; S.rushing = true; const btn = $('rush'); btn.disabled = true;
  for (let k = 0; k < 12; k++) {
    btn.textContent = 'Ringing up ' + (k + 1) + ' of 12…';
    const m = Math.random() < .4 ? MEMBERS[Math.floor(Math.random() * MEMBERS.length)] : null;
    const lines = makeBasket(Math.random, clamp(new Date().getHours(), OPEN, CLOSE - 1), 0, m && m.taste ? m : null);
    await saveSale({ id: newId('r'), ts: Date.now(), lines, total: saleTotal(lines), pay: Math.random() < .78 ? 'card' : 'cash', m: m ? m.id : null, src: 'rush' });
    await sleep(320);
  }
  S.rushing = false; btn.disabled = false; btn.textContent = 'Simulate a rush'; toast('12 sample sales rung up');
}
function onClear() {
  const btn = $('clear'), n = tillSales().length;
  if (!S.confirmClear) { if (!n) { toast('No till sales to clear'); return; } S.confirmClear = true; btn.textContent = 'Really clear ' + n + ' till sale' + (n === 1 ? '' : 's') + '?'; btn.classList.add('primary'); setTimeout(() => { S.confirmClear = false; btn.textContent = 'Clear till sales'; btn.classList.remove('primary'); }, 4000); return; }
  S.confirmClear = false; btn.textContent = 'Clear till sales'; btn.classList.remove('primary'); clearTill(); toast('Till sales cleared. Simulated history stays.');
}
function renderFeed() {
  const ol = $('feed'); ol.replaceChildren();
  for (const s of LATEST) {
    const m = s.m && MBY.get(s.m), isNew = feedPrimed && !seenFeed.has(s.id); seenFeed.add(s.id);
    ol.append(h('li', { class: isNew ? 'new' : null },
      h('span', { class: 'tm num' }, fmtTime(s.ts)),
      h('span', { class: 'what' }, s.lines.map(l => (l.q > 1 ? l.q + '× ' : '') + itemName(l.id)).join(', '), m ? h('span', { class: 'who' }, ' · ' + m.name) : null),
      h('span', { class: 'tag' + (s.src === 'sim' ? '' : ' live') }, s.src === 'sim' ? 'sample' : s.src === 'rush' ? 'rush' : 'till'),
      h('span', { class: 'num' }, money.format(s.total) + ' ' + s.pay)));
  }
  feedPrimed = true;
}

/* ----- members ----- */
function renderMembers() {
  const q = $('memberFilter').value.trim().toLowerCase(), list = $('mlist'); list.replaceChildren();
  const rows = MEMBERS.map(m => ({ m, ms: MODEL.mem.get(m.id), r: recsFor(MODEL, m.id) })).sort((a, b) => (b.ms ? b.ms.last : b.m.joined || 0) - (a.ms ? a.ms.last : a.m.joined || 0));
  $('memberCount').textContent = MEMBERS.length + ' members. Most recent visit first.';
  if (!MBY.has(S.selMember)) S.selMember = rows[0].m.id;
  for (const { m, ms, r } of rows) {
    if (q && !(m.name.toLowerCase().includes(q) || String(m.num).startsWith(q) || r.loves.join(' ').toLowerCase().includes(q))) continue;
    list.append(h('button', { type: 'button', class: 'mrow', 'aria-current': String(m.id === S.selMember), onclick: () => { S.selMember = m.id; renderMembers(); if (window.innerWidth < 900) $('mdetail').scrollIntoView({ block: 'start' }); } },
      h('span', { class: 'nm' }, m.name), h('span', { class: 'num' }, '#' + m.num),
      h('span', { class: 'mt' }, ms ? ms.visits + ' visits · ' + agoText(ms.last) + (r.loves.length ? ' · ' + r.loves.join(', ').toLowerCase() : '') : 'No visits yet')));
  }
  if (!list.children.length) list.append(h('p', { class: 'sub' }, 'No member matches that.'));
  renderMemberDetail();
}
function renderMemberDetail() {
  const box = $('mdetail'), m = MBY.get(S.selMember), ms = MODEL.mem.get(m.id), r = recsFor(MODEL, m.id); box.replaceChildren();
  const head = h('section', { class: 'panel' }, h('div', { class: 'mhead' }, h('h2', null, m.name), h('span', { class: 'num' }, 'Member #' + m.num), m.sample ? h('span', { class: 'tag' }, 'sample member') : h('span', { class: 'tag live' }, 'signed up at the till')));
  if (!ms) { head.append(h('p', { class: 'sub' }, 'No purchases yet. Attach this member to a sale on the Till and their taste profile starts building.')); box.append(head); return; }
  const spanDays = (ms.last - ms.first) / DAY_MS, gap = ms.visits > 1 && spanDays >= 1 ? spanDays / (ms.visits - 1) : 0, since = (NOW - ms.last) / DAY_MS;
  let best = 0; for (let w = 1; w < 7; w++) if (ms.wd[w] > ms.wd[best]) best = w;
  head.append(h('div', { class: 'stats' },
    stat('Visits in 6 weeks', ms.visits), stat('Spent', money0.format(ms.spend)), stat('Average visit', money.format(ms.spend / ms.visits)),
    stat('Comes in', gap ? 'every ' + (gap < 1.5 ? 'day or so' : Math.round(gap) + ' days') : ms.visits > 1 ? 'new this week' : 'once so far'), stat('Favourite day', WD_NAMES[best])));
  if (gap && since > Math.max(7, gap * 2.5)) head.append(h('p', { class: 'alert' }, h('b', null, 'Worth a nudge.'), ' Last in ' + Math.round(since) + ' days ago, usually every ' + Math.round(gap) + '.'));
  box.append(head);

  const taste = h('section', { class: 'panel' }, h('div', { class: 'ph' }, h('h2', null, 'Taste profile'), h('p', { class: 'sub' }, 'Built from ' + ms.units + ' items bought. Recent visits count for more.')),
    h('div', { class: 'legend' }, h('span', null, h('i', { class: 'lg-rect' }), 'This member'), h('span', null, h('i', { class: 'lg-tick' }), 'All customers')));
  const mx = Math.max(...ms.share, ...MODEL.base) || 1, bars = h('div', { class: 'bars' });
  DIMS.forEach((label, d) => { const pct = Math.round(ms.share[d] * 100), b = Math.round(MODEL.base[d] * 100);
    bars.append(tipOn(h('div', { class: 'bar-row' }, h('span', { class: 'nm' }, label), h('div', { class: 'bar-track' }, h('div', { class: 'bar', vars: { '--w': ms.share[d] / mx * 100 + '%' } }), h('div', { class: 'tick', vars: { '--t': 'calc(' + MODEL.base[d] / mx * 100 + '% - 1px)' } })), h('span', { class: 'bar-val' }, pct + '%')), pct + '% ' + label.toLowerCase(), 'All customers: ' + b + '%')); });
  taste.append(bars); box.append(taste);

  const offer = h('section', { class: 'panel' }, h('div', { class: 'ph' }, h('h2', null, 'What to offer'), h('p', { class: 'sub' }, r.learning ? 'Still learning. A couple more visits will sharpen this.' : 'Ranked by how well each item matches what sets this member apart.')));
  if (r.usual) offer.append(offerRowStatic('The usual', itemName(r.usual), 'Ordered ' + r.usualQty + (r.usualQty === 1 ? ' time' : ' times')));
  for (const t of r.tries) offer.append(offerRowStatic('Might love', itemName(t.id), whyText(t.why) + (t.had ? '. Tried once.' : '. Not tried yet.')));
  if (r.concept) offer.append(offerRowStatic('Fall test', r.concept.name + ' parfait', whyText(r.concept.why)));
  if (!r.tries.length && !r.concept) offer.append(h('p', { class: 'sub' }, 'Nothing new stands out. This member already buys what matches their taste.'));
  const first = m.name.split(' ')[0], note = ['Hi ' + first + ',', r.usual ? 'your ' + itemName(r.usual) + ' is waiting.' : 'we would love to see you again.',
    r.concept ? 'We are testing a ' + r.concept.name + ' parfait for fall and it sounds like you. Come be one of the first to try it.' : r.tries[0] ? 'Next time, try the ' + itemName(r.tries[0].id) + '. We think it suits you.' : '', 'See you soon, Grandma'].filter(Boolean).join(' ');
  const noteEl = h('p', { class: 'note', id: 'memberNote' }, note);
  offer.append(h('div', { class: 'offer noterow' }, h('span', { class: 'k' }, 'Note to send'), h('button', { type: 'button', class: 'btn sm', onclick: e => copyText(note, noteEl, e.currentTarget) }, 'Copy')), noteEl);
  box.append(offer);

  const top = Object.keys(ms.qty).map(id => ({ id, q: ms.qty[id] })).sort((a, b) => b.q - a.q).slice(0, 5), tmax = top[0] ? top[0].q : 1;
  box.append(h('section', { class: 'panel' }, h('div', { class: 'ph' }, h('h2', null, 'Most bought')), h('div', { class: 'bars' }, top.map(t => h('div', { class: 'bar-row' }, h('span', { class: 'nm' }, itemName(t.id)), h('div', { class: 'bar-track' }, h('div', { class: 'bar', vars: { '--w': t.q / tmax * 100 + '%' } })), h('span', { class: 'bar-val' }, t.q))))));
}
function stat(l, v) { return h('div', { class: 'stat' }, h('div', { class: 'l' }, l), h('div', { class: 'v' }, v)); }
function offerRowStatic(label, name, why) { return h('div', { class: 'offer' }, h('span', { class: 'k' }, label), h('span', { class: 'n' }, name), h('span'), why ? h('span', { class: 'y' }, why) : null); }
function copyText(text, el, btn) {
  const done = () => { btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = 'Copy'; }, 1500); };
  const select = () => { const r = document.createRange(); r.selectNodeContents(el); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); btn.textContent = 'Selected'; };
  try { navigator.clipboard.writeText(text).then(done, select); } catch (e) { select(); }
}

/* ----- insights ----- */
function pts(x) { const a = Math.abs(x); return a < .05 ? '0.0' : (x > 0 ? '+' : '−') + a.toFixed(1); }
function kpi(l, v, d) { return h('div', { class: 'kpi' }, h('div', { class: 'l' }, l), h('div', { class: 'v' }, v), h('div', { class: 'd' }, d)); }
function renderInsights() {
  const M = MODEL, t = M.today, D = M.D;
  let delta = 'No usual day to compare yet';
  if (M.usualRev > 0) { const p = (t.rev - M.usualRev) / M.usualRev * 100; delta = (p >= 0 ? '▲ ' : '▼ ') + Math.abs(p).toFixed(0) + '% ' + (p >= 0 ? 'above' : 'below') + ' a usual ' + WD_NAMES[M.todayWd] + ' by ' + fmtTime(NOW); }
  $('kpis').replaceChildren(
    kpi('Revenue today', money0.format(t.rev), delta),
    kpi('Sales today', String(t.n), t.tillN ? t.tillN + ' rung up on the Till' : 'None rung up on the Till yet'),
    kpi('Average sale', t.n ? money.format(t.rev / t.n) : '–', t.n ? (t.units / t.n).toFixed(1) + ' items per sale' : 'No sales yet today'),
    kpi('Member sales', t.n ? Math.round(t.memberN / t.n * 100) + '%' : '–', t.memberN + ' of ' + t.n + ' sales today'));

  /* bake sheet for tomorrow */
  const fresh = MENU.filter(i => i.fresh).map(it => { const f = M.fc[it.id]; return { it, f: f.pred[1], bake: Math.ceil(f.pred[1] + .5 * f.sigma), usual: Math.round(f.usual) }; }).sort((a, b) => b.bake - a.bake);
  $('bakeTitle').textContent = 'Bake sheet for ' + fmtDay(M.days[D + 1]);
  const tb = h('tbody'), tot = fresh.reduce((a, r) => ({ f: a.f + r.f, bake: a.bake + r.bake, usual: a.usual + r.usual }), { f: 0, bake: 0, usual: 0 });
  const row = (id, label, it, r) => { const diff = r.bake - r.usual; return h('tr', { class: S.selItem === id ? 'sel' : null },
    h('td', null, h('button', { type: 'button', class: 'pickbtn', 'aria-pressed': String(S.selItem === id), onclick: () => { S.selItem = id; renderInsights(); } }, it ? glass(it, 'sm') : null, label)),
    h('td', { class: 'r fc' }, Math.round(r.f)), h('td', { class: 'r bake' }, r.bake), h('td', { class: 'r' }, diff === 0 ? 'same' : (diff > 0 ? '+' : '−') + Math.abs(diff))); };
  tb.append(row('all', 'All fresh items', null, tot)); for (const r of fresh) tb.append(row(r.it.id, r.it.name, r.it, r));
  $('bake').replaceChildren(h('thead', null, h('tr', null, h('th', null, 'Item'), h('th', { class: 'r fc' }, 'Forecast'), h('th', { class: 'r' }, 'Bake'), h('th', { class: 'r' }, 'vs usual'))), tb);
  $('bakeNote').textContent = 'Bake is the forecast plus a small margin, about half of a typical miss. "Usual" is the plain daily average of the last four weeks.';

  /* demand chart */
  const sel = M.fc[S.selItem] ? S.selItem : 'all', f = M.fc[sel];
  $('demandTitle').textContent = (sel === 'all' ? 'Fresh items' : itemName(sel)) + ' sold per day';
  drawDemand($('demand'), f, sel);
  const bt = M.backtest;
  $('accuracy').textContent = 'Checked against the last ' + bt.days + ' days: the total for fresh items was off by ' + (bt.total * 100).toFixed(0) + '% a day on average. Baking the same amount every day would have been off by ' + (bt.totalFlat * 100).toFixed(0) + '%. A single item typically misses by about ' + bt.itemMae.toFixed(0) + '.';
  const dt = h('tbody'), todayUnits = sel === 'all' ? MENU.reduce((a, it, i) => a + (it.fresh ? M.units[i][D] : 0), 0) : M.units[IDX[sel]][D];
  for (let k = 0; k < 7; k++) dt.append(h('tr', null, h('td', null, (k === 0 ? 'Today, ' : '') + fmtDay(M.days[D + k])), h('td', { class: 'r' }, k === 0 ? todayUnits + ' so far' : '–'), h('td', { class: 'r' }, Math.round(f.pred[k])), h('td', { class: 'r' }, Math.max(0, Math.round(f.pred[k] - 1.28 * f.sigma)) + ' to ' + Math.round(f.pred[k] + 1.28 * f.sigma))));
  for (let i = D - 1; i >= D - 21; i--) dt.append(h('tr', null, h('td', null, fmtDay(M.days[i])), h('td', { class: 'r' }, f.series[i]), h('td', { class: 'r' }, '–'), h('td', { class: 'r' }, '–')));
  $('demandTable').replaceChildren(h('thead', null, h('tr', null, h('th', null, 'Day'), h('th', { class: 'r' }, 'Sold'), h('th', { class: 'r' }, 'Forecast'), h('th', { class: 'r' }, 'Likely range'))), dt);

  /* busy hours */
  const order = [1, 2, 3, 4, 5, 6, 0]; let gmax = 0, bw = 1, bh = 0;
  for (const w of order) M.grid[w].forEach((v, hh) => { if (v > gmax) { gmax = v; bw = w; bh = hh; } });
  const hb = h('tbody');
  for (const w of order) hb.append(h('tr', null, h('th', { scope: 'row' }, WD_NAMES[w].slice(0, 3)), M.grid[w].map((v, hh) => { const p = gmax ? v / gmax : 0; return tipOn(h('td', { class: p > .55 ? 'hi' : null, vars: { '--p': Math.round(p * 100) + '%' } }, Math.round(v)), v.toFixed(1) + ' sales', WD_NAMES[w] + ', ' + hourLabel(OPEN + hh) + ' to ' + hourLabel(OPEN + hh + 1)); })));
  $('heat').replaceChildren(h('thead', null, h('tr', null, h('th'), M.grid[0].map((_, hh) => h('th', { scope: 'col' }, (OPEN + hh) % 12 || 12, h('span', { class: 'ampm' }, OPEN + hh < 12 ? 'am' : 'pm'))))), hb);
  $('heatSub').textContent = 'Average sales in each hour, by weekday. Busiest: ' + WD_NAMES[bw] + ' at ' + hourLabel(OPEN + bh) + ', about ' + Math.round(gmax) + ' sales.';

  /* top sellers */
  const top = M.top.slice(0, 8), tmax = top[0] ? top[0].units || 1 : 1;
  $('top').replaceChildren(...top.map(x => tipOn(h('div', { class: 'bar-row' }, h('span', { class: 'nm' }, itemName(x.id)), h('div', { class: 'bar-track' }, h('div', { class: 'bar', vars: { '--w': x.units / tmax * 100 + '%' } })), h('span', { class: 'bar-val' }, x.units)), x.units + ' sold', itemName(x.id) + ' · ' + money0.format(x.rev) + ' in 7 days')));

  /* pairs */
  const pairs = M.pairs.filter(p => p.lift >= 1.15).slice(0, 5);
  $('pairs').replaceChildren(...(pairs.length ? pairs.map(p => h('li', null, h('span', { class: 'nm' }, itemName(p.a) + ' + ' + itemName(p.b)), h('span', { class: 'x' }, p.lift.toFixed(1) + '×'), h('span', { class: 'y' }, 'Together in ' + p.n + ' sales, ' + p.lift.toFixed(1) + ' times what chance would give'))) : [h('li', null, h('span', { class: 'y' }, 'No strong pairs yet.'))]));

  /* flavor trends */
  const fl = M.flavor.slice().sort((a, b) => b.shift - a.shift), fmax = Math.max(...fl.map(x => Math.abs(x.shift))) || 1;
  $('flavor').replaceChildren(...fl.map(x => tipOn(h('div', { class: 'div-row' }, h('span', { class: 'nm' }, x.label), h('div', { class: 'div-track' }, h('div', { class: 'div-bar ' + (x.shift >= 0 ? 'pos' : 'neg'), vars: { '--w': Math.abs(x.shift) / fmax * 50 + '%' } })), h('span', { class: 'bar-val' }, pts(x.shift) + ' pts')),
    pts(x.shift) + ' points', x.label + ' is now ' + x.share.toFixed(0) + '% of items sold')));

  /* fall parfait concepts */
  $('conceptSub').textContent = 'Five ideas, ranked by how many of the ' + M.known + ' members with a taste profile they match.';
  const cmax = Math.max(1, ...M.concepts.map(c => c.fans));
  $('concepts').replaceChildren(...M.concepts.map((c, i) => { const names = c.fanIds.map(id => MBY.get(id)).filter(Boolean).map(m => m.name);
    return h('li', null, h('div', { class: 'row1' }, h('span', { class: 'nm' }, c.name), i === 0 && c.fans ? h('span', { class: 'tag hot' }, 'Best bet') : null, c.ride > .1 ? h('span', { class: 'tag' }, 'Rides rising flavors') : null, h('span', { class: 'ct' }, c.fans + ' of ' + M.known + ' members')),
      h('div', { class: 'bar-track' }, h('div', { class: 'bar', vars: { '--w': c.fans / cmax * 100 + '%' } })),
      names.length ? h('div', { class: 'who' }, 'Invite first: ' + names.slice(0, 4).join(', ') + (names.length > 4 ? ' and ' + (names.length - 4) + ' more' : '')) : null); }));

  /* closing totals */
  $('closing').replaceChildren(stat('Card · ' + t.card.n + ' sales', money.format(t.card.total)), stat('Cash · ' + t.cash.n + ' sales', money.format(t.cash.total)), stat('All · ' + t.n + ' sales', money.format(t.rev)));
}
function niceMax(v) { const steps = [4, 8, 12, 16, 20, 24, 32, 40, 60, 80, 100, 120, 160, 200, 240, 320, 400, 600, 800, 1000]; for (const s of steps) if (v <= s) return s; return Math.ceil(v / 500) * 500; }
function drawDemand(el, f, sel) {
  const M = MODEL, D = M.D, HIST = 21, n = HIST + 7, W = Math.max(300, Math.round(el.clientWidth || 640)), H = 250, pad = { l: 34, r: 14, t: 26, b: 26 };
  const hist = f.series.slice(D - HIST), band = 1.28 * f.sigma, ymax = niceMax(Math.max(...hist, ...f.pred.map(p => p + band)));
  const x = i => pad.l + (W - pad.l - pad.r) * i / (n - 1), y = v => pad.t + (H - pad.t - pad.b) * (1 - v / ymax);
  const svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, role: 'img', 'aria-label': 'Line chart of units sold per day over the last three weeks with a seven-day forecast. The table below holds the same numbers.' });
  for (let g = 0; g <= 4; g++) { const v = ymax * g / 4; svg.append(sv('line', { x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v), stroke: 'var(--line)', 'stroke-width': 1 }), sv('text', { class: 'ax', x: pad.l - 6, y: y(v) + 4, 'text-anchor': 'end' }, Math.round(v))); }
  const fx = (x(HIST - 1) + x(HIST)) / 2;
  svg.append(sv('rect', { x: fx, y: pad.t, width: W - pad.r - fx, height: H - pad.t - pad.b, fill: 'var(--wash)', opacity: .5 }), sv('text', { class: 'ax', x: fx + 6, y: pad.t - 8 }, 'Forecast'));
  for (let i = 0; i < n; i += 7) svg.append(sv('text', { class: 'ax', x: x(i), y: H - 8, 'text-anchor': i === 0 ? 'start' : 'middle' }, fmtShort(M.days[D - HIST + i])));
  const up = f.pred.map((p, k) => x(HIST + k) + ',' + y(Math.min(ymax, p + band))), dn = f.pred.map((p, k) => x(HIST + k) + ',' + y(Math.max(0, p - band))).reverse();
  svg.append(sv('polygon', { points: up.concat(dn).join(' '), fill: 'var(--series)', opacity: .14 }));
  svg.append(sv('polyline', { points: hist.map((v, i) => x(i) + ',' + y(v)).join(' '), fill: 'none', stroke: 'var(--series)', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  svg.append(sv('polyline', { points: [x(HIST - 1) + ',' + y(hist[HIST - 1])].concat(f.pred.map((p, k) => x(HIST + k) + ',' + y(p))).join(' '), fill: 'none', stroke: 'var(--series)', 'stroke-width': 2, 'stroke-dasharray': '5 4', 'stroke-linejoin': 'round' }));
  svg.append(sv('circle', { cx: x(HIST + 1), cy: y(f.pred[1]), r: 4.5, fill: 'var(--series)', stroke: 'var(--surface)', 'stroke-width': 2 }));
  svg.append(sv('text', { class: 'lbl', x: Math.min(x(HIST + 1), W - pad.r - 44), y: Math.max(12, y(f.pred[1] + band) - 8), 'text-anchor': 'middle' }, 'Tomorrow ' + Math.round(f.pred[1])));
  const cross = sv('line', { y1: pad.t, y2: H - pad.b, stroke: 'var(--ink-2)', 'stroke-width': 1, visibility: 'hidden' }), dot = sv('circle', { r: 4.5, fill: 'var(--series)', stroke: 'var(--surface)', 'stroke-width': 2, visibility: 'hidden' });
  const hit = sv('rect', { x: pad.l, y: pad.t, width: W - pad.l - pad.r, height: H - pad.t - pad.b, fill: 'transparent' });
  hit.addEventListener('pointermove', e => {
    const r = svg.getBoundingClientRect(), px = (e.clientX - r.left) * W / r.width, i = clamp(Math.round((px - pad.l) / (W - pad.l - pad.r) * (n - 1)), 0, n - 1);
    const isF = i >= HIST, v = isF ? f.pred[i - HIST] : hist[i];
    cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible'); dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(v)); dot.setAttribute('visibility', 'visible');
    showTip(e.clientX, e.clientY, (isF ? 'Forecast ' : '') + Math.round(v) + (isF ? '' : ' sold'), fmtDay(M.days[D - HIST + i]) + (isF ? ' · likely ' + Math.max(0, Math.round(v - band)) + ' to ' + Math.round(v + band) : ''));
  });
  hit.addEventListener('pointerleave', () => { cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); hideTip(); });
  svg.append(cross, dot, hit); el.replaceChildren(svg);
}

/* ----- data flow ----- */
function renderFlow() {
  const s = LATEST.find(x => x.src !== 'sim') || LATEST[0];
  $('lastRecord').textContent = s ? JSON.stringify({ ts: s.ts, lines: s.lines, total: s.total, pay: s.pay, m: s.m, src: s.src }, null, 2) : 'No sales yet.';
}

/* ----- boot ----- */
loadLocal(); recompute(); renderMenu();
for (const k of TABS) $('tabbtn-' + k).addEventListener('click', () => setTab(k));
$('memberSearch').addEventListener('input', renderMemberResults);
$('memberFilter').addEventListener('input', renderMembers);
$('payCard').addEventListener('click', () => setPay('card'));
$('payCash').addEventListener('click', () => setPay('cash'));
$('charge').addEventListener('click', charge);
$('cartbarCharge').addEventListener('click', charge);
$('rush').addEventListener('click', rush);
$('clear').addEventListener('click', onClear);
window.addEventListener('hashchange', () => setTab(location.hash.slice(1), true));
window.addEventListener('scroll', hideTip, { passive: true });
let rsz = 0; window.addEventListener('resize', () => { clearTimeout(rsz); rsz = setTimeout(() => { if (S.tab === 'insights') renderInsights(); }, 150); });
const startTab = location.hash.slice(1);
if (TABS.includes(startTab)) setTab(startTab, true); else render();
connect();

})();
