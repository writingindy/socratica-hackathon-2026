(function () {
'use strict';
/* ---------- order: customers build an order, pay now or at the counter, and watch it go from made to ready ---------- */
const S = { view: 'menu', cart: new Map(), busy: false, mine: null };
const MINE_KEY = 'gt.myOrder';
const loadMine = () => { try { return localStorage.getItem(MINE_KEY); } catch (e) { return null; } };
const saveMine = id => { try { if (id) localStorage.setItem(MINE_KEY, id); else localStorage.removeItem(MINE_KEY); } catch (e) { /* storage unavailable: the order screen just won't survive a reload */ } };

let raf = 0;
function refresh() { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; render(); }); }
function render() {
  renderChip();
  if (S.view === 'menu') renderBag($('bag'), 'Your order is empty. Tap something tasty.');
  else if (S.view === 'checkout') { renderBag($('summary'), 'Your order is empty.'); renderPlace(); }
  else renderDone();
  renderCartBar();
}
function show(view) {
  S.view = view;
  for (const v of ['menu', 'checkout', 'done']) $('view-' + v).hidden = v !== view;
  window.scrollTo(0, 0); render();
  if (view === 'checkout' && !$('custName').value) $('custName').focus();
}

/* ----- menu and bag ----- */
function renderMenu() {
  const root = $('menu');
  for (const cat of ['Parfaits', 'Bakes', 'Drinks']) {
    root.append(h('h2', { class: 'cat' }, cat));
    root.append(h('div', { class: 'tiles' }, MENU.filter(m => m.cat === cat).map(it => h('button', { class: 'tile', type: 'button', 'data-id': it.id, 'aria-label': 'Add ' + it.name + ', ' + money.format(it.price), onclick: () => addToCart(it.id, 1) },
      glass(it, 'big'), h('span', { class: 'tile-txt' }, h('span', { class: 'tile-name' }, it.name), h('span', { class: 'tile-price' }, money.format(it.price))), h('span', { class: 'tile-qty', hidden: true })))));
  }
}
function addToCart(id, n) { const q = (S.cart.get(id) || 0) + n; if (q <= 0) S.cart.delete(id); else S.cart.set(id, Math.min(q, 20)); render(); }
function renderBag(el, emptyText) {
  const lines = [...S.cart], { total } = cartTotal(S.cart);
  el.replaceChildren(h('div', { class: 'rc-head' }, h('b', null, 'Your order')));
  if (!lines.length) el.append(h('p', { class: 'rc-empty' }, emptyText));
  else el.append(h('ul', { class: 'rc-lines' }, lines.map(([id, q]) => h('li', null,
    h('span', { class: 'nm' }, itemName(id)),
    h('span', { class: 'step' }, h('button', { type: 'button', 'aria-label': 'One fewer ' + itemName(id), onclick: () => addToCart(id, -1) }, '−'), h('span', null, q), h('button', { type: 'button', 'aria-label': 'One more ' + itemName(id), onclick: () => addToCart(id, 1) }, '+')),
    h('span', { class: 'lt' }, money.format(MENU[IDX[id]].price * q))))));
  el.append(h('div', { class: 'rc-total' }, h('span', null, 'Total'), h('b', null, money.format(total))));
  $('toCheckout').disabled = !total;
  for (const t of document.querySelectorAll('.tile')) { const q = S.cart.get(t.getAttribute('data-id')) || 0, b = t.querySelector('.tile-qty'); b.hidden = !q; b.textContent = q; }
}
function renderCartBar() {
  const { total, n } = cartTotal(S.cart), show = S.view === 'menu' && n > 0;
  $('cartbar').hidden = !show; $('main').classList.toggle('has-bar', show);
  if (show) $('cartbarText').textContent = n + (n === 1 ? ' item · ' : ' items · ') + money.format(total);
}

/* ----- checkout ----- */
const payChoice = () => document.querySelector('input[name=pay]:checked').value;
function memberFromInput() { const v = $('memberNum').value.trim(); return /^\d{4,6}$/.test(v) ? Live.members.find(m => m.num === Number(v)) || null : null; }
function onMemberInput() {
  const v = $('memberNum').value.trim(), m = memberFromInput(), hint = $('memberHint');
  if (m) { hint.textContent = 'Welcome back, ' + m.name.split(' ')[0] + '!'; if (!$('custName').value.trim()) $('custName').value = m.name.split(' ')[0]; }
  else hint.textContent = v.length >= 4 ? "We couldn't find that number. You can still order without it." : '';
}
function renderPlace() {
  const { total } = cartTotal(S.cart), btn = $('place');
  btn.textContent = !Live.up ? 'Reconnecting…' : total ? (payChoice() === 'card' ? 'Pay ' : 'Place order · ') + money.format(total) : 'Place order';
  btn.disabled = !total || S.busy || !Live.up;
}
async function place(e) {
  e.preventDefault();
  if (!S.cart.size || S.busy || !Live.up) return;
  const name = $('custName').value.trim();
  $('nameErr').hidden = !!name; if (!name) { $('custName').focus(); return; }
  const pay = payChoice(), m = memberFromInput();
  S.busy = true; renderPlace();
  if (pay === 'card') { /* simulated card reader */
    $('payingText').textContent = 'Tap, insert or swipe your card'; $('paying').hidden = false; await sleep(1400);
    $('payingText').textContent = 'Approved'; $('paying').classList.add('ok'); await sleep(600);
  }
  try {
    const o = await Live.place({ id: newId('k'), lines: [...S.cart].map(([id, q]) => ({ id, q })), pay, m: m ? m.id : null, src: 'kiosk', name });
    S.mine = o.id; saveMine(o.id); S.cart.clear();
    $('custName').value = ''; $('memberNum').value = ''; $('memberHint').textContent = '';
    show('done');
  } catch (err) { toast("Your order didn't go through" + (pay === 'card' ? ' and your card was not charged' : '') + '. Please try again.'); }
  $('paying').hidden = true; $('paying').classList.remove('ok');
  S.busy = false; renderPlace();
}

/* ----- order status ----- */
const STEPS = [['new', 'Being made'], ['ready', 'Ready'], ['done', 'Collected']];
let lastStatus = null;
function renderDone() {
  const o = S.mine && Live.orders.get(S.mine), box = $('done');
  if (!o) { box.replaceChildren(h('p', { class: 'sub' }, 'Looking up your order…')); return; }
  if (lastStatus && lastStatus !== o.status && o.status === 'ready') { try { navigator.vibrate && navigator.vibrate([120, 80, 120]); } catch (e) { /* no vibration here */ } }
  lastStatus = o.status;
  const at = STEPS.findIndex(s => s[0] === o.status), owes = o.pay === 'pending';
  const msg = { new: "We're making it now. Keep an eye on this screen.", ready: "It's ready! Come to the counter and say number " + o.no + '.', done: 'Enjoy! See you again soon.' }[o.status];
  box.replaceChildren(
    h('p', { class: 'done-hi' }, 'Thanks, ' + o.name + '!'),
    h('p', { class: 'done-k' }, 'Your order number'),
    h('p', { class: 'done-no num' + (o.status === 'ready' ? ' ready' : '') }, o.no),
    h('ol', { class: 'steps', 'aria-label': 'Order progress' }, STEPS.map(([k, label], i) => h('li', { class: i < at ? 'past' : i === at ? 'now' : null, 'aria-current': i === at ? 'step' : null }, label))),
    h('p', { class: 'done-msg', role: 'status' }, msg),
    h('p', { class: 'done-pay' + (owes ? ' owe' : '') }, owes ? 'Please pay ' + money.format(o.total) + ' at the counter when you collect.' : 'Paid by ' + o.pay + ' · ' + money.format(o.total)),
    h('ul', { class: 'done-lines' }, o.lines.map(l => h('li', null, h('span', { class: 'num' }, l.q + '×'), ' ' + itemName(l.id)))),
    h('button', { type: 'button', class: 'btn' + (o.status === 'done' ? ' primary' : ''), onclick: newOrder }, 'Start a new order'));
}
function newOrder() { S.mine = null; lastStatus = null; saveMine(null); show('menu'); }

/* ----- boot ----- */
Live.onChange = () => {
  /* reopened on the same device: go back to the order still being made */
  if (S.view === 'menu' && !S.mine && !S.cart.size) { const id = loadMine(), o = id && Live.orders.get(id); if (o && o.status !== 'done') { S.mine = id; show('done'); return; } }
  refresh();
};
renderMenu();
$('toCheckout').addEventListener('click', () => show('checkout'));
$('cartbarGo').addEventListener('click', () => show('checkout'));
$('back').addEventListener('click', () => show('menu'));
$('checkoutForm').addEventListener('submit', place);
$('checkoutForm').addEventListener('change', renderPlace);
$('custName').addEventListener('input', () => { if ($('custName').value.trim()) $('nameErr').hidden = true; });
$('memberNum').addEventListener('input', onMemberInput);
render();
Live.connect();

})();
