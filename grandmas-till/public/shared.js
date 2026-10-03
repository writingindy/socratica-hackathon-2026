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
/* ----- the cart: a list of lines, each one item with its options and note. Lines with the same item, options and note merge. ----- */
let lineUid = 0;
const Cart = {
  key: l => l.id + '|' + l.opts.join(',') + '|' + l.note,
  /* a tap on the menu adds the plain version of the item; options are set on the line afterwards */
  add(cart, id) { const plain = cart.find(l => l.id === id && !l.opts.length && !l.note); if (plain) plain.q = Math.min(plain.q + 1, 50); else cart.push({ uid: ++lineUid, id, q: 1, opts: [], note: '' }); },
  /* the − on a menu card takes one off the most recently added line of that item */
  minus(cart, id) { for (let i = cart.length - 1; i >= 0; i--) if (cart[i].id === id) { Cart.step(cart, cart[i], -1); return; } },
  step(cart, line, n) { line.q = Math.min(line.q + n, 50); if (line.q <= 0) cart.splice(cart.indexOf(line), 1); },
  /* after options or a note change, fold the line into an identical one; returns the line that is left */
  merge(cart, line) { const twin = cart.find(l => l !== line && Cart.key(l) === Cart.key(line)); if (!twin) return line; twin.q = Math.min(twin.q + line.q, 50); cart.splice(cart.indexOf(line), 1); return twin; },
  qty: (cart, id) => cart.reduce((a, l) => a + (l.id === id ? l.q : 0), 0),
  count: cart => cart.reduce((a, l) => a + l.q, 0),
  subtotal: cart => round2(cart.reduce((a, l) => a + linePrice(l.id, l.opts) * l.q, 0)),
  payload: cart => cart.map(l => ({ id: l.id, q: l.q, opts: l.opts, note: l.note })),
};

/* ----- menu cards in the dashboard's style: a colour per item, its drawing from art.js, and a − once it is in the cart ----- */
const TONES = ['pink', 'yellow', 'blue', 'green', 'red', 'cream'];
function menuTile(it, onAdd, onMinus, label) {
  const art = h('span', { class: 'menu-art' }); art.innerHTML = menuArt(it); /* our own static SVG, no user input */
  return h('div', { class: 'menu-cell', 'data-id': it.id },
    h('button', { class: 'menu-item tile menu-' + TONES[IDX[it.id] % TONES.length], type: 'button', 'aria-label': label || 'Add ' + it.name, onclick: onAdd },
      art, h('span', { class: 'tile-name' }, it.name), h('b', { class: 'tile-price' }, money.format(it.price))),
    h('span', { class: 'tile-qty', hidden: true }),
    h('button', { class: 'tile-minus', type: 'button', hidden: true, 'aria-label': 'One fewer ' + it.name, onclick: onMinus }, '−'));
}
function syncTiles(cart) {
  for (const c of document.querySelectorAll('.menu-cell')) { const q = Cart.qty(cart, c.dataset.id), b = c.querySelector('.tile-qty'); b.hidden = c.querySelector('.tile-minus').hidden = !q; b.textContent = q; }
}

/* ----- receipt lines: steppers, and per line an editor for options and a note. ui.open is the uid of the line being edited. ----- */
function optText(l) { return (l.opts || []).map(id => (OPTION[id] || { name: id }).name).concat(l.note ? ['“' + l.note + '”'] : []).join(' · '); }
function cartLines(cart, ui, changed) {
  return h('ul', { class: 'rc-lines' }, cart.map(l => {
    const open = ui.open === l.uid, extra = optText(l), offers = optionGroups(l.id).length;
    const li = h('li', { class: open ? 'open' : null },
      h('span', { class: 'nm' }, itemName(l.id), extra ? h('small', { class: 'rc-opts' }, extra) : null),
      h('span', { class: 'step' }, h('button', { type: 'button', 'aria-label': 'One fewer ' + itemName(l.id), onclick: () => { Cart.step(cart, l, -1); changed(); } }, '−'), h('span', null, l.q), h('button', { type: 'button', 'aria-label': 'One more ' + itemName(l.id), onclick: () => { Cart.step(cart, l, 1); changed(); } }, '+')),
      h('span', { class: 'lt' }, money.format(linePrice(l.id, l.opts) * l.q)),
      h('button', { type: 'button', class: 'rc-edit', 'aria-expanded': String(open), onclick: () => { ui.open = open ? null : l.uid; changed(); } }, open ? 'Done' : offers ? 'Options & note' : 'Add a note'));
    if (open) li.append(lineEditor(cart, l, ui, changed));
    return li;
  }));
}
function lineEditor(cart, l, ui, changed) {
  const box = h('div', { class: 'rc-editor' });
  for (const g of optionGroups(l.id)) {
    const G = OPTION_GROUPS[g];
    box.append(h('div', { class: 'opt-group', role: 'group', 'aria-label': G.label }, h('span', { class: 'opt-label' }, G.label),
      G.choices.map(([id, name, price]) => { const on = l.opts.includes(id);
        return h('button', { type: 'button', class: 'opt', 'aria-pressed': String(on), onclick: () => {
          let next = on ? l.opts.filter(x => x !== id) : l.opts.concat(id);
          if (!on && G.one) next = next.filter(x => x === id || OPTION[x].group !== g); /* one-only groups swap the choice */
          l.opts = cleanOpts(l.id, next); ui.open = Cart.merge(cart, l).uid; changed();
        } }, name, price ? h('small', null, ' +' + money.format(price)) : null); })));
  }
  const note = h('input', { type: 'text', class: 'opt-note', maxlength: '80', value: l.note, 'data-uid': l.uid, placeholder: 'Note, e.g. an allergy or “cut in half”', 'aria-label': 'Note for ' + itemName(l.id) });
  note.addEventListener('input', () => { l.note = note.value.slice(0, 80); });
  note.addEventListener('change', () => { l.note = cleanNote(note.value); ui.open = Cart.merge(cart, l).uid; changed(); });
  box.append(h('label', { class: 'opt-label' }, 'Note'), note);
  return box;
}
/* re-rendering replaces text fields; put the cursor back if someone was typing in one */
function keepFocus(fn) {
  const a = document.activeElement, sel = a && a.tagName === 'INPUT' ? (a.dataset.uid ? '.opt-note[data-uid="' + a.dataset.uid + '"]' : a.id ? '#' + a.id : null) : null, pos = sel ? a.selectionStart : 0;
  fn();
  const n = sel && document.querySelector(sel);
  if (n && n !== a) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) { /* not a text field */ } }
}
/* subtotal, discount and total rows for a receipt */
function totalRows(subtotal, disc) {
  const off = disc && disc.kind ? discountAmount(disc.kind, subtotal, disc.value) : 0;
  return [off ? h('div', { class: 'rc-sub' }, h('span', null, 'Subtotal'), h('span', null, money.format(subtotal))) : null,
    off ? h('div', { class: 'rc-sub rc-disc' }, h('span', null, DISCOUNTS[disc.kind].label), h('span', null, '−' + money.format(off))) : null,
    h('div', { class: 'rc-total' }, h('span', null, 'Total'), h('b', null, money.format(round2(subtotal - off))))];
}
const cartTotal = (cart, disc) => { const sub = Cart.subtotal(cart); return round2(sub - (disc && disc.kind ? discountAmount(disc.kind, sub, disc.value) : 0)); };

const orderNo = o => (o.no ? '#' + o.no : '#–'); /* orders saved before numbering have none */
function linesText(lines) { return lines.map(l => (l.q > 1 ? l.q + '× ' : '') + itemName(l.id) + (optText(l) ? ' (' + optText(l) + ')' : '')).join(', '); }
function discountText(o) { return o.discount ? (DISCOUNTS[o.discountKind] ? DISCOUNTS[o.discountKind].label : 'Discount') + ' −' + money.format(o.discount) : ''; }
function minsAgo(ts) { const m = Math.floor((Date.now() - ts) / 60000); return m < 1 ? 'just now' : m + ' min ago'; }
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
