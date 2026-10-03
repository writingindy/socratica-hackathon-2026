(function () {
'use strict';
/* ---------- counter: Grandma rings up sales, works through the order queue, and checks today's takings ---------- */
const TABS = ['ring', 'orders', 'today'];
const S = { tab: 'ring', cart: [], ui: { open: null }, disc: { kind: null, value: 0 }, pay: 'card', member: null, busy: false, simulating: false, confirmClear: false };
const SAMPLE = sampleMembers();
const WALK_INS = ['Rosa', 'Ben', 'Ada', 'Sam', 'Jun', 'Lea', 'Tom', 'Ines', 'Raj', 'Marta'];
const seen = new Set(); let primed = false;

let raf = 0;
function refresh() { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; render(); }); }
function render() {
  renderChip(); renderBadge();
  if (S.tab === 'ring') { renderMemberBox(); renderReceipt(); }
  else if (S.tab === 'orders') renderQueue();
  else renderToday();
  renderCartBar();
  for (const o of Live.today()) seen.add(o.id);
  primed = Live.up;
}
function setTab(t, fromHash) {
  if (!TABS.includes(t)) return;
  S.tab = t;
  for (const k of TABS) { $('tab-' + k).hidden = k !== t; $('tabbtn-' + k).setAttribute('aria-selected', String(k === t)); }
  if (!fromHash) { try { history.replaceState(null, '', '#' + t); } catch (e) { /* hash is optional */ } }
  render();
}
const waiting = () => Live.today().filter(o => o.status !== 'done');
function renderBadge() { const n = waiting().length, b = $('queueBadge'); b.hidden = !n; b.textContent = n; }

/* ----- ring up ----- */
function renderMenu() {
  const root = $('menu');
  for (const cat of ['Parfaits', 'Bakes', 'Drinks']) {
    root.append(h('h2', { class: 'cat' }, cat));
    root.append(h('div', { class: 'menu-grid' }, MENU.filter(m => m.cat === cat).map(it => menuTile(it, () => { Cart.add(S.cart, it.id); cartChanged(); }, () => { Cart.minus(S.cart, it.id); cartChanged(); }))));
  }
}
function cartChanged() { renderReceipt(); renderCartBar(); }
function chargeLabel(total) { const queued = !!$('pickupName').value.trim(); return S.cart.length ? (queued ? 'Charge & queue ' : 'Charge ') + money.format(total) : 'Charge'; }
function renderReceipt() {
  const r = $('receipt'), sub = Cart.subtotal(S.cart), total = cartTotal(S.cart, S.disc);
  keepFocus(() => {
    r.replaceChildren(h('div', { class: 'rc-head' }, h('b', null, "Grandma's"), h('span', null, fmtShort(Date.now()) + ' · ' + fmtTime(Date.now()))));
    if (!S.cart.length) r.append(h('p', { class: 'rc-empty' }, 'Tap an item to start a sale.'));
    else r.append(cartLines(S.cart, S.ui, cartChanged));
    r.append(...totalRows(sub, S.disc).filter(Boolean));
  });
  const btn = $('charge'); btn.textContent = Live.up ? chargeLabel(total) : 'Reconnecting…'; btn.disabled = !S.cart.length || S.busy || !Live.up;
  $('pickupHint').textContent = $('pickupName').value.trim() ? 'Goes to the Orders queue. Call this name when it is ready.' : 'Add a name to send this order to the make queue.';
  keepFocus(renderDiscount); syncTiles(S.cart);
}
/* discounts: Grandma picks one per sale. Member 10% switches on by itself when a member is attached. */
function setDisc(kind, value) { S.disc = { kind, value: value || 0 }; cartChanged(); }
function renderDiscount() {
  const box = $('discounts'), m = S.member && Live.member(S.member), isAmt = S.disc.kind === 'amount';
  const chip = (kind, label, disabled) => h('button', { type: 'button', class: 'opt', 'aria-pressed': String(S.disc.kind === kind), disabled: disabled || null, onclick: () => setDisc(kind, kind === 'amount' ? S.disc.value : 0) }, label);
  const amt = h('input', { type: 'text', inputmode: 'decimal', class: 'opt-note', id: 'discAmt', placeholder: '$ off, e.g. 2.50', value: isAmt ? (S.disc.draft ?? (S.disc.value ? String(S.disc.value) : '')) : '', 'aria-label': 'Dollar amount off', hidden: !isAmt });
  amt.addEventListener('input', () => { S.disc.draft = amt.value; }); /* survives a re-render while typing */
  amt.addEventListener('change', () => setDisc('amount', Math.max(0, Number(amt.value.replace(/[^0-9.]/g, '')) || 0)));
  box.replaceChildren(h('div', { class: 'opt-group' }, chip(null, 'None'), chip('member', DISCOUNTS.member.label, !m), chip('pct20', DISCOUNTS.pct20.label), chip('comp', DISCOUNTS.comp.label), chip('amount', DISCOUNTS.amount.label)), amt);
  $('discHint').textContent = !m && S.disc.kind !== 'member' ? 'Attach a member to use the member discount.' : S.disc.kind === 'comp' ? 'The whole sale is free. It is still recorded.' : '';
}
function renderCartBar() {
  const n = Cart.count(S.cart), total = cartTotal(S.cart, S.disc), show = S.tab === 'ring' && n > 0;
  $('cartbar').hidden = !show; $('main').classList.toggle('has-bar', show);
  if (show) { $('cartbarText').textContent = n + (n === 1 ? ' item · ' : ' items · ') + money.format(total); $('cartbarCharge').disabled = S.busy || !Live.up; }
}
function setPay(p) { S.pay = p; $('payCard').setAttribute('aria-pressed', String(p === 'card')); $('payCash').setAttribute('aria-pressed', String(p === 'cash')); }
function renderMemberResults() {
  const raw = $('memberSearch').value.trim(), q = raw.toLowerCase(), box = $('memberResults'); box.replaceChildren();
  if (!q || S.member) return;
  const list = Live.members.filter(m => String(m.num).startsWith(q) || m.name.toLowerCase().includes(q)).slice(0, 5);
  for (const m of list) box.append(h('button', { type: 'button', class: 'mres', onclick: () => attachMember(m.id) }, h('span', null, m.name), h('span', { class: 'num' }, '#' + m.num)));
  if (raw.length >= 2 && /[a-z]/i.test(raw) && !list.some(m => m.name.toLowerCase() === q)) box.append(h('button', { type: 'button', class: 'mres add', onclick: () => signUp(raw) }, 'Sign up “' + raw.slice(0, 40) + '” as a new member'));
}
function attachMember(id) { S.member = id; if (!S.disc.kind) S.disc = { kind: 'member', value: 0 }; $('memberSearch').value = ''; $('memberResults').replaceChildren(); renderMemberBox(); cartChanged(); }
function detachMember() { S.member = null; if (S.disc.kind === 'member') S.disc = { kind: null, value: 0 }; renderMemberBox(); cartChanged(); }
async function signUp(name) {
  try { const m = await Live.addMember(name.trim().slice(0, 40)); attachMember(m.id); toast(m.name + ' is member #' + m.num); }
  catch (e) { toast('Could not sign up: ' + e.message); }
}
function renderMemberBox() {
  const card = $('memberCard'), m = S.member && Live.member(S.member);
  $('memberFind').hidden = !!m; card.hidden = !m; card.replaceChildren();
  if (!m) return;
  const visits = Live.today().filter(o => o.m === m.id).length;
  card.append(h('div', { class: 'mc-top' }, h('strong', null, m.name), h('span', { class: 'num' }, '#' + m.num), h('button', { type: 'button', class: 'x', onclick: detachMember }, 'Remove')));
  card.append(h('p', { class: 'mc-meta' }, visits ? 'Already in ' + visits + (visits === 1 ? ' time' : ' times') + ' today' : 'First visit today'));
}
async function charge() {
  if (!S.cart.length || S.busy || !Live.up) return;
  const name = $('pickupName').value.trim();
  S.busy = true; render();
  try {
    const o = await Live.place({ id: newId('s'), lines: Cart.payload(S.cart), pay: S.pay, m: S.member, src: 'till', name, discount: S.disc.kind ? S.disc : null });
    S.cart = []; S.ui.open = null; S.member = null; S.disc = { kind: null, value: 0 }; $('pickupName').value = '';
    toast(o.status === 'new' ? 'Order ' + orderNo(o) + ' for ' + o.name + ' sent to the queue' : 'Sale ' + orderNo(o) + ' saved · ' + money.format(o.total) + ' ' + o.pay);
  } catch (e) { toast('Not saved: ' + e.message); } /* the cart stays, so she can try again */
  S.busy = false; render();
}

/* ----- order queue ----- */
async function act(o, patch, btn) {
  btn.disabled = true;
  try { await Live.update(o.id, patch); if (patch.status === 'done') toast(orderNo(o) + ' handed over to ' + o.name); }
  catch (e) { btn.disabled = false; toast(e.message); }
}
function orderCard(o) {
  const owes = o.pay === 'pending', m = o.m && Live.member(o.m), ready = o.status === 'ready', acts = [];
  const b = (label, patch, primary) => h('button', { type: 'button', class: 'btn' + (primary ? ' primary' : ''), onclick: e => act(o, patch, e.currentTarget) }, label);
  if (!ready) acts.push(b('Mark ready', { status: 'ready' }, true));
  if (owes) acts.push(b(ready ? 'Took cash · hand over' : 'Took cash', ready ? { pay: 'cash', status: 'done' } : { pay: 'cash' }, ready), b(ready ? 'Took card · hand over' : 'Took card', ready ? { pay: 'card', status: 'done' } : { pay: 'card' }, ready));
  else if (ready) acts.push(b('Handed over', { status: 'done' }, true));
  return h('li', { class: 'ocard' + (primed && !seen.has(o.id) ? ' new' : '') + (owes ? ' owes' : '') },
    h('div', { class: 'oc-top' }, h('span', { class: 'oc-no num' }, orderNo(o)), h('span', { class: 'oc-name' }, o.name), h('span', { class: 'tag' + (o.src === 'kiosk' ? ' live' : '') }, o.src === 'kiosk' ? 'Kiosk' : 'Counter')),
    h('ul', { class: 'oc-lines' }, o.lines.map(l => h('li', null, h('b', { class: 'num' }, l.q + '×'), ' ' + itemName(l.id),
      l.opts && l.opts.length ? h('small', { class: 'oc-opts' }, l.opts.map(id => (OPTION[id] || { name: id }).name).join(' · ')) : null,
      l.note ? h('small', { class: 'oc-note' }, '“' + l.note + '”') : null))),
    h('div', { class: 'oc-meta' }, h('span', null, fmtTime(o.ts) + ' · ' + minsAgo(o.ts) + (m ? ' · member #' + m.num : '')), h('span', { class: owes ? 'owe' : null }, (owes ? 'To pay ' : 'Paid ' + o.pay + ' · ') + money.format(o.total) + (o.discount ? ' · ' + discountText(o) : ''))),
    h('div', { class: 'oc-acts' }, acts));
}
function renderQueue() {
  const w = waiting(), cols = { new: w.filter(o => o.status === 'new'), ready: w.filter(o => o.status === 'ready') };
  $('qNew').replaceChildren(...(cols.new.length ? cols.new.map(orderCard) : [h('li', { class: 'empty' }, 'Nothing to make. New orders appear here the moment they are placed.')]));
  $('qReady').replaceChildren(...(cols.ready.length ? cols.ready.map(orderCard) : [h('li', { class: 'empty' }, 'Nothing waiting to be picked up.')]));
  $('nNew').textContent = cols.new.length || ''; $('nReady').textContent = cols.ready.length || '';
}
const SIM_NOTES = ['No nuts please, allergy', "It's a birthday!", 'Extra napkins', 'Cut in half'];
const anyOf = list => list[Math.floor(Math.random() * list.length)];
function simLine(l) {
  const groups = optionGroups(l.id), opts = groups.length && Math.random() < .4 ? [anyOf(OPTION_GROUPS[anyOf(groups)].choices)[0]] : [];
  return { id: l.id, q: l.q, opts, note: Math.random() < .12 ? anyOf(SIM_NOTES) : '' };
}
async function simulate() {
  if (S.simulating || !Live.up) return; S.simulating = true; const btn = $('simulate'); btn.disabled = true;
  try {
    for (let k = 0; k < 3; k++) {
      btn.textContent = 'Customer ' + (k + 1) + ' of 3 ordering…';
      const mem = Math.random() < .4 ? SAMPLE[Math.floor(Math.random() * SAMPLE.length)] : null;
      const lines = makeBasket(Math.random, clamp(new Date().getHours(), OPEN, CLOSE - 1), 0, mem);
      await Live.place({ id: newId('k'), lines: lines.map(simLine), pay: Math.random() < .5 ? 'card' : 'pending', m: mem ? mem.id : null, src: 'kiosk', name: mem ? mem.name.split(' ')[0] : WALK_INS[Math.floor(Math.random() * WALK_INS.length)], discount: mem ? { kind: 'member' } : null });
      await sleep(700);
    }
  } catch (e) { toast('Simulation stopped: ' + e.message); }
  S.simulating = false; btn.disabled = false; btn.textContent = 'Simulate 3 customers';
}

/* ----- today ----- */
function stat(l, v) { return h('div', { class: 'stat' }, h('div', { class: 'l' }, l), h('div', { class: 'v' }, v)); }
const STATUS_TEXT = { new: 'to make', ready: 'ready', done: 'handed over' };
function renderToday() {
  const all = Live.today(), sum = list => list.reduce((a, o) => a + o.total, 0), by = p => all.filter(o => o.pay === p);
  $('todayTitle').textContent = 'Today, ' + fmtShort(Date.now());
  $('totals').replaceChildren(stat('Orders', all.length), stat('Card · ' + by('card').length, money.format(sum(by('card')))), stat('Cash · ' + by('cash').length, money.format(sum(by('cash')))), stat('Still to pay · ' + by('pending').length, money.format(sum(by('pending')))));
  $('feed').replaceChildren(...(all.length ? all.slice().reverse().map(o => h('li', null,
    h('span', { class: 'tm num' }, fmtTime(o.ts)),
    h('span', { class: 'what' }, h('b', { class: 'num' }, orderNo(o)), ' ' + (o.name ? o.name + ' · ' : '') + linesText(o.lines)),
    h('span', { class: 'tags' }, h('span', { class: 'tag' + (o.src === 'kiosk' ? ' live' : '') }, o.src === 'kiosk' ? 'kiosk' : 'counter'), h('span', { class: 'tag' + (o.status === 'done' ? '' : ' hot') }, STATUS_TEXT[o.status] || o.status)),
    h('span', { class: 'num' }, money.format(o.total) + ' ' + (o.pay === 'pending' ? 'unpaid' : o.pay), o.discount ? h('small', { class: 'feed-disc' }, discountText(o)) : null))) : [h('li', { class: 'empty' }, 'No orders yet today.')]));
}
async function onClear() {
  const btn = $('clear'), reset = () => { S.confirmClear = false; btn.textContent = 'Clear test orders'; btn.classList.remove('primary'); };
  if (!S.confirmClear) { S.confirmClear = true; btn.textContent = 'Really clear every test order?'; btn.classList.add('primary'); setTimeout(reset, 4000); return; }
  reset();
  try { const r = await getJSON('api/sales', { method: 'DELETE' }); await Live.pull(); toast(r.removed + ' test orders cleared. Simulated history stays.'); }
  catch (e) { toast('Could not clear: ' + e.message); }
}

/* ----- boot ----- */
Live.onChange = refresh;
Live.onNew = o => { if (o.status === 'new') toast('New order ' + orderNo(o) + ' for ' + o.name + (o.src === 'kiosk' ? ' from the kiosk' : '')); };
renderMenu();
for (const k of TABS) $('tabbtn-' + k).addEventListener('click', () => setTab(k));
$('memberSearch').addEventListener('input', renderMemberResults);
$('pickupName').addEventListener('input', renderReceipt);
$('payCard').addEventListener('click', () => setPay('card'));
$('payCash').addEventListener('click', () => setPay('cash'));
$('charge').addEventListener('click', charge);
$('cartbarCharge').addEventListener('click', charge);
$('simulate').addEventListener('click', simulate);
$('clear').addEventListener('click', onClear);
window.addEventListener('hashchange', () => setTab(location.hash.slice(1), true));
setInterval(refresh, 30000); /* keeps the "min ago" labels current */
const startTab = location.hash.slice(1);
if (TABS.includes(startTab)) setTab(startTab, true); else render();
Live.connect();

})();
