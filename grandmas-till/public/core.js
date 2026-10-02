/* ---------- core: menu and sales simulator (no DOM) ---------- */
const DIMS = ['Fruity', 'Creamy', 'Chocolate', 'Nutty', 'Tart', 'Caramel', 'Tea & coffee'];
const P = [0.35, 1, 1.5];
const MENU = [
  { id: 'p_straw', name: 'Strawberry Shortcake Parfait', cat: 'Parfaits', price: 8.5, v: [.9, .8, 0, .1, .3, .1, 0], w: 1.25, dp: P, fresh: 1, layers: ['#d9a066', '#fff1e3', '#e8486a', '#fbd3dc'] },
  { id: 'p_matcha', name: 'Matcha Red Bean Parfait', cat: 'Parfaits', price: 9, v: [0, .6, 0, .2, 0, .1, .9], w: .9, dp: P, fresh: 1, layers: ['#8c3b3b', '#f4efe2', '#7a9a3b', '#cfe0a3'] },
  { id: 'p_choc', name: 'Chocolate Hazelnut Parfait', cat: 'Parfaits', price: 9, v: [0, .5, .9, .7, 0, .2, 0], w: 1, dp: P, fresh: 1, layers: ['#c79a6b', '#4a2a1c', '#e9d6bd', '#7b4a2d'] },
  { id: 'p_mango', name: 'Mango Passionfruit Parfait', cat: 'Parfaits', price: 8.75, v: [.9, .4, 0, 0, .7, 0, 0], w: .95, dp: P, fresh: 1, layers: ['#e8792b', '#fff1cf', '#f5a623', '#f7c948'] },
  { id: 'p_yuzu', name: 'Lemon Yuzu Parfait', cat: 'Parfaits', price: 8.5, v: [.6, .4, 0, 0, .9, 0, 0], w: .7, dp: P, fresh: 1, layers: ['#e9c93a', '#fffbe6', '#f2dc5d', '#f7efb0'] },
  { id: 'p_tira', name: 'Tiramisu Parfait', cat: 'Parfaits', price: 9.25, v: [0, .8, .4, 0, 0, .2, .7], w: .85, dp: P, fresh: 1, layers: ['#8a5a3a', '#f3e6d0', '#5a3a26', '#efe0c4'] },
  { id: 'croissant', name: 'Butter Croissant', cat: 'Bakes', price: 3.75, v: [0, .5, 0, .1, 0, .4, 0], w: 1.5, dp: [2.6, .9, .5], fresh: 1, layers: ['#c98a3d', '#e5b566', '#f1cf8e', '#d9a04c'] },
  { id: 'almond', name: 'Almond Croissant', cat: 'Bakes', price: 4.75, v: [0, .4, 0, .9, 0, .4, 0], w: .8, dp: [2.2, .9, .6], fresh: 1, layers: ['#c98a3d', '#f1e2c4', '#e5b566', '#f7efe0'] },
  { id: 'puff', name: 'Vanilla Cream Puff', cat: 'Bakes', price: 4.25, v: [0, .9, 0, 0, 0, .3, 0], w: 1, dp: [.6, 1, 1.3], fresh: 1, layers: ['#e0b46a', '#fff6dc', '#fffaf0', '#e9c586'] },
  { id: 'flan', name: 'Caramel Flan', cat: 'Bakes', price: 5, v: [0, .7, 0, 0, 0, .9, 0], w: .75, dp: [.5, 1, 1.2], fresh: 1, layers: ['#f3d27a', '#f0c860', '#e9b949', '#8a4a1c'] },
  { id: 'macaron', name: 'Macaron Trio', cat: 'Bakes', price: 7.5, v: [.5, .3, .2, .5, .1, 0, 0], w: .55, dp: [.5, 1, 1.3], fresh: 1, layers: ['#f2a7b8', '#fff4f6', '#b9d99a', '#f6e08a'] },
  { id: 'latte', name: 'Café Latte', cat: 'Drinks', price: 4.5, v: [0, .6, 0, 0, 0, .1, .8], w: 1.3, dp: [2.4, 1, .8], fresh: 0, layers: ['#6b4530', '#b98a63', '#e3c9a8', '#fbf3e6'] },
  { id: 'tea', name: 'Hojicha Tea', cat: 'Drinks', price: 3.5, v: [0, 0, 0, .1, 0, .3, .9], w: .6, dp: [1.2, 1, 1.1], fresh: 0, layers: ['#7a4a26', '#9c6535', '#b9824a', '#d6a56c'] },
  { id: 'soda', name: 'Yuzu Soda', cat: 'Drinks', price: 4, v: [.6, 0, 0, 0, .7, 0, 0], w: .5, dp: [.3, 1.2, 1.2], fresh: 0, layers: ['#f4e27a', '#f9efae', '#fcf7d6', '#ffffff'] },
];
const IDX = Object.fromEntries(MENU.map((m, i) => [m.id, i]));
const OPEN = 8, CLOSE = 18, HIST_DAYS = 42, DAY_MS = 86400000;
const WD_MULT = [1.05, .78, .86, .95, 1, 1.18, 1.38];
const HOURS_WD = [.9, .8, .6, .8, 1.5, 1.3, .9, 1.3, 1.1, .6];
const HOURS_WE = [.5, .7, 1, 1.2, 1.3, 1.3, 1.4, 1.4, 1.1, .6];
const PAIR = { croissant: { latte: 4, tea: 1.6 }, almond: { latte: 3.2 }, puff: { tea: 3, latte: 1.5 }, flan: { latte: 2.2 }, p_matcha: { tea: 2.6 }, p_tira: { latte: 2 }, p_straw: { soda: 2.2, puff: 1.6 }, macaron: { tea: 2.4 }, p_choc: { latte: 1.5 } };
const SAMPLE_NAMES = ['Mei L.', 'Arjun P.', 'Sofia R.', 'Noah B.', 'Amara O.', 'Liam T.', 'Yuki S.', 'Fatima H.', 'Lucas M.', 'Priya N.', 'Ethan K.', 'Chloé D.', 'Omar A.', 'Hana Y.', 'Mateo G.', 'Ivy C.', 'Tariq J.', 'Elena V.', 'Kofi B.', 'Nora W.', 'Diego F.', 'Zara Q.', 'Owen P.', 'Lina E.', 'Kai N.', 'Maya S.', 'Jonas H.', 'Aiko T.', 'Ravi D.', 'Camille L.', 'Tomás R.', 'Sana M.', 'Felix O.', 'Leila K.', 'Hugo B.', 'Naomi I.', 'Idris A.', 'Greta U.', 'Bao T.', 'Esme W.'];

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function startOfDay(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }
function addDays(ts, n) { const d = new Date(ts); d.setDate(d.getDate() + n); return d.getTime(); }
function dayKey(ts) { const d = new Date(ts); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
function pick(rng, w) { let t = 0; for (const x of w) t += x; let r = rng() * t; for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return i; } return w.length - 1; }
function cos(a, b) { let d = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return x && y ? d / Math.sqrt(x * y) : 0; }
function round2(x) { return Math.round(x * 100) / 100; }
function saleTotal(lines) { let t = 0; for (const l of lines) t += l.p * l.q; return round2(t); }

function sampleMembers() {
  const rng = mulberry32(hashStr('members-v1'));
  return SAMPLE_NAMES.map((name, i) => {
    const a = Math.floor(rng() * 7); let b = Math.floor(rng() * 6); if (b >= a) b++;
    const taste = DIMS.map(() => rng() * .18); taste[a] = 1; taste[b] = .65;
    return { id: 'm' + (1001 + i), num: 1001 + i, name, sample: true, taste, rate: .6 + rng() * 2.4 };
  });
}
function trend(id, ago) {
  const t = clamp(ago, 0, 60);
  switch (id) {
    case 'p_matcha': return 1.5 - .0125 * t;
    case 'flan': return 1.3 - .0075 * t;
    case 'tea': return 1.25 - .006 * t;
    case 'p_mango': return .7 + .0085 * t;
    case 'soda': return .75 + .007 * t;
    case 'p_yuzu': return .85 + .004 * t;
    default: return 1;
  }
}
function pairBoost(a, b) { return (PAIR[a] && PAIR[a][b]) || (PAIR[b] && PAIR[b][a]) || 1; }
function makeBasket(rng, hour, ago, member) {
  const part = hour < 11 ? 0 : hour < 14 ? 1 : 2;
  const base = MENU.map(it => it.w * it.dp[part] * trend(it.id, ago) * (member && member.taste ? Math.exp(2.6 * cos(member.taste, it.v)) : 1));
  const r = rng(); const n = r < .55 ? 1 : r < .87 ? 2 : r < .97 ? 3 : 4;
  const chosen = [];
  for (let l = 0; l < n; l++) {
    const w = base.map((b, i) => { if (chosen.includes(i)) return 0; let x = b; for (const c of chosen) x *= pairBoost(MENU[c].id, MENU[i].id); return x; });
    chosen.push(pick(rng, w));
  }
  return chosen.map(i => ({ id: MENU[i].id, q: rng() < .13 ? 2 : 1, p: MENU[i].price }));
}
function simDay(dayStart, ago, members) {
  const key = dayKey(dayStart), rng = mulberry32(hashStr('day:' + key)), d0 = new Date(dayStart), wd = d0.getDay();
  let n = 104 * WD_MULT[wd] * (1 - .0022 * ago) * (.93 + rng() * .14);
  if (rng() < .12) n *= .8;
  n = Math.round(n);
  const visitors = members.filter(m => rng() < Math.min(.9, m.rate / 7 * WD_MULT[wd]));
  const hw = (wd === 0 || wd === 6) ? HOURS_WE : HOURS_WD, out = [];
  for (let k = 0; k < n; k++) {
    const m = k < visitors.length ? visitors[k] : null;
    const hour = OPEN + pick(rng, hw);
    const ts = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate(), hour, Math.floor(rng() * 60), Math.floor(rng() * 60)).getTime();
    const lines = makeBasket(rng, hour, ago, m);
    out.push({ id: 'h' + key + '-' + k, ts, lines, total: saleTotal(lines), pay: rng() < .78 ? 'card' : 'cash', m: m ? m.id : null, src: 'sim' });
  }
  return out.sort((a, b) => a.ts - b.ts);
}
function simulate(now, members) {
  const today = startOfDay(now), out = [];
  for (let ago = HIST_DAYS; ago >= 0; ago--) for (const s of simDay(addDays(today, -ago), ago, members)) if (s.ts <= now) out.push(s);
  return out;
}

/* the server loads this same file, so every screen and the API agree on the menu and prices */
if (typeof module !== 'undefined' && module.exports) module.exports = { DIMS, MENU, IDX, OPEN, CLOSE, HIST_DAYS, DAY_MS, dayKey, startOfDay, saleTotal, sampleMembers, makeBasket, simulate };
