/* ---------- shared by the counter and order screens: DOM helpers, formatting, and the live link to the server ---------- */
'use strict';
const $ = id => document.getElementById(id);
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const k in attrs) { const v = attrs[k]; if (v == null || v === false) continue; if (k === 'class') el.className = v; else if (k === 'hidden') el.hidden = !!v; else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v); else if (k === 'vars') { for (const n in v) el.style.setProperty(n, v[n]); } else el.setAttribute(k, v === true ? '' : v); }
  for (const kid of kids.flat()) { if (kid == null || kid === false) continue; el.append(kid.nodeType ? kid : document.createTextNode(String(kid))); }
  return el;
}
const money = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' });
const fmtTime = ts => new Date(ts).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' });
const fmtShort = ts => new Date(ts).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' });
const itemName = id => (MENU[IDX[id]] || { name: 'Item' }).name;
const newId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const sleep = ms => new Promise(r => setTimeout(r, ms));
/* menu cards in the dashboard's style: a colour per item and its drawing from art.js */
const TONES = ['pink', 'yellow', 'blue', 'green', 'red', 'cream'];
function menuTile(it, onclick, label) {
  const art = h('span', { class: 'menu-art' }); art.innerHTML = menuArt(it); /* our own static SVG, no user input */
  return h('button', { class: 'menu-item tile menu-' + TONES[IDX[it.id] % TONES.length], type: 'button', 'data-id': it.id, 'aria-label': label, onclick },
    art, h('span', { class: 'tile-name' }, it.name), h('b', { class: 'tile-price' }, money.format(it.price)), h('span', { class: 'tile-qty', hidden: true }));
}
const orderNo = o => (o.no ? '#' + o.no : '#–'); /* orders saved before numbering have none */
function linesText(lines) { return lines.map(l => (l.q > 1 ? l.q + '× ' : '') + itemName(l.id)).join(', '); }
function minsAgo(ts) { const m = Math.floor((Date.now() - ts) / 60000); return m < 1 ? 'just now' : m + ' min ago'; }
function cartTotal(cart) { let t = 0, n = 0; for (const [id, q] of cart) { t += MENU[IDX[id]].price * q; n += q; } return { total: Math.round(t * 100) / 100, n }; }
let toastTimer = 0;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 2800); }
async function getJSON(url, opts) {
  const r = await fetch(url, opts), body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || 'HTTP ' + r.status);
  return body;
}
const sendJSON = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/* Live: today's orders and the member list, kept current by server-sent events.
   Every screen reads from and writes to the same database through the API, so there is no copy to keep in sync. */
const Live = {
  up: false, orders: new Map(), members: [],
  onChange() {}, onNew() {},
  today() { const t = startOfDay(Date.now()); return [...this.orders.values()].filter(o => o.ts >= t).sort((a, b) => a.ts - b.ts); },
  member(id) { return this.members.find(m => m.id === id) || null; },
  put(o, pushed) {
    if (!o || !o.id || o.src === 'sim') return; /* simulated history is for the dashboard, not the counter */
    const isNew = !this.orders.has(o.id); this.orders.set(o.id, o);
    if (isNew && pushed) this.onNew(o);
    this.onChange();
  },
  async pull() {
    const [orders, members] = await Promise.all([getJSON('api/sales?src=live&since=' + startOfDay(Date.now())), getJSON('api/members')]);
    this.orders = new Map(orders.map(o => [o.id, o])); this.members = members; this.onChange();
  },
  connect() {
    const es = new EventSource('api/events');
    const on = (ev, fn) => es.addEventListener(ev, e => { try { fn(JSON.parse(e.data)); } catch (err) { /* ignore a malformed push */ } });
    on('sale', o => this.put(o, true));
    on('update', o => this.put(o, false));
    on('member', m => { if (!this.member(m.id)) { this.members.push(m); this.onChange(); } });
    on('clear', () => { this.pull().catch(() => {}); });
    /* (re)connected: pull everything, which also catches up on anything missed while offline */
    es.onopen = () => { this.pull().then(() => { this.up = true; this.onChange(); }).catch(() => {}); };
    es.onerror = () => { if (this.up) { this.up = false; this.onChange(); } };
  },
  async place(body) { const o = await getJSON('api/sales', sendJSON('POST', body)); this.put(o, false); return o; },
  async update(id, patch) { const o = await getJSON('api/sales/' + encodeURIComponent(id), sendJSON('PATCH', patch)); this.put(o, false); return o; },
  async addMember(name) { const m = await getJSON('api/members', sendJSON('POST', { name })); if (!this.member(m.id)) this.members.push(m); this.onChange(); return m; },
};
function renderChip() {
  const c = $('chip'); if (!c) return;
  c.className = 'chip' + (Live.up ? ' live' : '');
  $('chipText').textContent = Live.up ? 'Connected' : 'Reconnecting…';
  c.title = Live.up ? 'Orders are saved to the shop database and appear on every open screen.' : 'The server is not responding. Orders cannot be placed until it is back.';
}
