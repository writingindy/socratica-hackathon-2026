(function () {
'use strict';
/* ---------- order: customers build an order, pay now or at the counter, and watch it go from made to ready ---------- */
const S = { view: 'menu', cart: [], ui: { open: null }, busy: false, mine: null };
/* members get 10% off automatically once their number checks out; the server checks the member again */
const disc = () => (S.view === 'checkout' && memberFromInput() ? { kind: 'member' } : null);
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
    root.append(h('div', { class: 'menu-grid' }, MENU.filter(m => m.cat === cat).map(it => menuTile(it, () => { Cart.add(S.cart, it.id); render(); }, () => { Cart.minus(S.cart, it.id); render(); }, 'Add ' + it.name + ', ' + money.format(it.price)))));
  }
}
function renderBag(el, emptyText) {
  keepFocus(() => {
    el.replaceChildren(h('div', { class: 'rc-head' }, h('b', null, 'Your order')));
    if (!S.cart.length) el.append(h('p', { class: 'rc-empty' }, emptyText));
    else el.append(cartLines(S.cart, S.ui, render));
    el.append(...totalRows(Cart.subtotal(S.cart), disc()).filter(Boolean));
  });
  $('toCheckout').disabled = !S.cart.length;
  syncTiles(S.cart);
}
function renderCartBar() {
  const n = Cart.count(S.cart), total = cartTotal(S.cart, disc()), show = S.view === 'menu' && n > 0;
  $('cartbar').hidden = !show; $('main').classList.toggle('has-bar', show);
  if (show) $('cartbarText').textContent = n + (n === 1 ? ' item · ' : ' items · ') + money.format(total);
}

/* ----- checkout ----- */
const payChoice = () => document.querySelector('input[name=pay]:checked').value;
function memberFromInput() { const v = $('memberNum').value.trim(); return /^\d{4,6}$/.test(v) ? Live.members.find(m => m.num === Number(v)) || null : null; }
function onMemberInput() {
  const v = $('memberNum').value.trim(), m = memberFromInput(), hint = $('memberHint');
  if (m) { hint.textContent = 'Welcome back, ' + m.name.split(' ')[0] + '! Your 10% member discount is on.'; if (!$('custName').value.trim()) $('custName').value = m.name.split(' ')[0]; }
  else hint.textContent = v.length >= 4 ? "We couldn't find that number. You can still order without it." : '';
  render();
}
function renderPlace() {
  const total = cartTotal(S.cart, disc()), btn = $('place'), has = S.cart.length > 0;
  btn.textContent = !Live.up ? 'Reconnecting…' : has ? (payChoice() === 'card' ? 'Pay ' : 'Place order · ') + money.format(total) : 'Place order';
  btn.disabled = !has || S.busy || !Live.up;
}
async function place(e) {
  e.preventDefault();
  if (!S.cart.length || S.busy || !Live.up) return;
  const name = $('custName').value.trim();
  $('nameErr').hidden = !!name; if (!name) { $('custName').focus(); return; }
  const pay = payChoice(), m = memberFromInput();
  S.busy = true; renderPlace();
  if (pay === 'card') { /* simulated card reader */
    $('payingText').textContent = 'Tap, insert or swipe your card'; $('paying').hidden = false; await sleep(1400);
    $('payingText').textContent = 'Approved'; $('paying').classList.add('ok'); await sleep(600);
  }
  try {
    const o = await Live.place({ id: newId('k'), lines: Cart.payload(S.cart), pay, m: m ? m.id : null, src: 'kiosk', name, discount: m ? { kind: 'member' } : null });
    S.mine = o.id; saveMine(o.id); S.cart = []; S.ui.open = null;
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
    h('ul', { class: 'done-lines' }, o.lines.map(l => h('li', null, h('span', { class: 'num' }, l.q + '×'), ' ' + itemName(l.id), optText(l) ? h('small', null, ' · ' + optText(l)) : null))),
    o.discount ? h('p', { class: 'done-pay' }, discountText(o)) : null,
    h('button', { type: 'button', class: 'btn' + (o.status === 'done' ? ' primary' : ''), onclick: newOrder }, 'Start a new order'));
}
function newOrder() { S.mine = null; lastStatus = null; saveMine(null); show('menu'); }

/* ----- boot ----- */
Live.onChange = () => {
  /* reopened on the same device: go back to the order still being made */
  if (S.view === 'menu' && !S.mine && !S.cart.length) { const id = loadMine(), o = id && Live.orders.get(id); if (o && o.status !== 'done') { S.mine = id; show('done'); return; } }
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
