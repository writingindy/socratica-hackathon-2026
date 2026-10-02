/* ---------- core: menu, simulator, features, models (no DOM) ---------- */
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
const WD_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WD_MULT = [1.05, .78, .86, .95, 1, 1.18, 1.38];
const HOURS_WD = [.9, .8, .6, .8, 1.5, 1.3, .9, 1.3, 1.1, .6];
const HOURS_WE = [.5, .7, 1, 1.2, 1.3, 1.3, 1.4, 1.4, 1.1, .6];
const PAIR = { croissant: { latte: 4, tea: 1.6 }, almond: { latte: 3.2 }, puff: { tea: 3, latte: 1.5 }, flan: { latte: 2.2 }, p_matcha: { tea: 2.6 }, p_tira: { latte: 2 }, p_straw: { soda: 2.2, puff: 1.6 }, macaron: { tea: 2.4 }, p_choc: { latte: 1.5 } };
/* Fall parfait concepts to test against members' tastes (sample ideas, edit freely) */
const CONCEPTS = [
  { name: 'Spiced Pear & Caramel', v: [.6, .5, 0, .1, .1, .8, 0] },
  { name: 'Maple Pecan', v: [0, .5, 0, .9, 0, .8, 0] },
  { name: 'Hojicha Chestnut', v: [0, .5, 0, .7, 0, .2, .8] },
  { name: 'Apple Cider Crumble', v: [.7, .3, 0, .3, .5, .6, 0] },
  { name: 'Dark Chocolate Orange', v: [.5, .4, .9, 0, .4, 0, 0] },
];
const SAMPLE_NAMES = ['Mei L.', 'Arjun P.', 'Sofia R.', 'Noah B.', 'Amara O.', 'Liam T.', 'Yuki S.', 'Fatima H.', 'Lucas M.', 'Priya N.', 'Ethan K.', 'Chloé D.', 'Omar A.', 'Hana Y.', 'Mateo G.', 'Ivy C.', 'Tariq J.', 'Elena V.', 'Kofi B.', 'Nora W.', 'Diego F.', 'Zara Q.', 'Owen P.', 'Lina E.', 'Kai N.', 'Maya S.', 'Jonas H.', 'Aiko T.', 'Ravi D.', 'Camille L.', 'Tomás R.', 'Sana M.', 'Felix O.', 'Leila K.', 'Hugo B.', 'Naomi I.', 'Idris A.', 'Greta U.', 'Bao T.', 'Esme W.'];

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function startOfDay(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }
function addDays(ts, n) { const d = new Date(ts); d.setDate(d.getDate() + n); return d.getTime(); }
function dayKey(ts) { const d = new Date(ts); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
function mean(a, s, e) { let t = 0; for (let i = s; i < e; i++) t += a[i]; return e > s ? t / (e - s) : 0; }
function pick(rng, w) { let t = 0; for (const x of w) t += x; let r = rng() * t; for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return i; } return w.length - 1; }
function cos(a, b) { let d = 0, x = 0, y = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; } return x && y ? d / Math.sqrt(x * y) : 0; }
function norm1(v) { let t = 0; for (const x of v) t += x; t = t || 1; return v.map(x => x / t); }
function centered(v, base) { return norm1(v).map((x, d) => x - base[d]); }
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

/* one-day forecast: recent same-weekday average, nudged by the two-week trend */
function predict(series, startWd, end, target) {
  const wd = (startWd + target) % 7; let num = 0, den = 0, k = 0;
  for (let i = end - 1; i >= 0 && k < 6; i--) if ((startWd + i) % 7 === wd) { const w = Math.pow(.8, k); num += w * series[i]; den += w; k++; }
  let level = den ? num / den : mean(series, 0, end);
  if (end >= 28) { const a = mean(series, end - 14, end), b = mean(series, end - 28, end - 14); if (b > 0) level *= 1 + TREND_GAIN * (clamp(a / b, .75, 1.33) - 1); }
  return Math.max(0, level);
}
let TREND_GAIN = .5;

function analyze(sales, now, members) {
  const D = HIST_DAYS, today = startOfDay(now), nI = MENU.length;
  const days = []; for (let i = 0; i <= D + 7; i++) days.push(addDays(today, i - D));
  const keyIdx = new Map(); for (let i = 0; i <= D; i++) keyIdx.set(dayKey(days[i]), i);
  const startWd = new Date(days[0]).getDay(), todayWd = new Date(today).getDay();
  const units = MENU.map(() => new Array(D + 1).fill(0)), tx = new Array(D + 1).fill(0), rev = new Array(D + 1).fill(0);
  const grid = Array.from({ length: 7 }, () => new Array(CLOSE - OPEN).fill(0)), wdDays = new Array(7).fill(0);
  for (let i = 0; i < D; i++) wdDays[(startWd + i) % 7]++;
  const pc = Array.from({ length: nI }, () => new Array(nI).fill(0)), itemTx = new Array(nI).fill(0); let nTx = 0;
  const mem = new Map(), shopVec = new Array(7).fill(0), shA = new Array(7).fill(0), shB = new Array(7).fill(0);
  const nd = new Date(now), nowTod = nd.getHours() * 3600 + nd.getMinutes() * 60 + nd.getSeconds();
  let usualRev = 0;
  const t = { rev: 0, n: 0, units: 0, memberN: 0, card: { n: 0, total: 0 }, cash: { n: 0, total: 0 }, tillN: 0 };
  const week = MENU.map(() => ({ units: 0, rev: 0 }));
  for (const s of sales) {
    const dt = new Date(s.ts), idx = keyIdx.get(dayKey(s.ts)); if (idx === undefined) continue;
    const wd = dt.getDay(), hr = dt.getHours(), age = (now - s.ts) / DAY_MS;
    tx[idx]++; rev[idx] += s.total; nTx++;
    if (idx < D && hr >= OPEN && hr < CLOSE) grid[wd][hr - OPEN]++;
    if (idx < D && wd === todayWd && hr * 3600 + dt.getMinutes() * 60 + dt.getSeconds() <= nowTod) usualRev += s.total;
    if (idx === D) { t.rev += s.total; t.n++; if (s.m) t.memberN++; const p = s.pay === 'cash' ? t.cash : t.card; p.n++; p.total += s.total; if (s.src !== 'sim') t.tillN++; }
    let ms = null;
    if (s.m) { ms = mem.get(s.m); if (!ms) { ms = { visits: 0, spend: 0, first: s.ts, last: s.ts, qty: {}, vec: new Array(7).fill(0), units: 0, wd: new Array(7).fill(0) }; mem.set(s.m, ms); } ms.visits++; ms.spend += s.total; ms.first = Math.min(ms.first, s.ts); ms.last = Math.max(ms.last, s.ts); ms.wd[wd]++; }
    const decay = Math.pow(.5, Math.max(0, age) / 30), seen = [];
    for (const l of s.lines) {
      const i = IDX[l.id]; if (i === undefined) continue; const v = MENU[i].v;
      units[i][idx] += l.q; if (idx === D) t.units += l.q;
      if (idx >= D - 6) { week[i].units += l.q; week[i].rev += l.q * l.p; }
      let vs = 0; for (let d = 0; d < 7; d++) vs += v[d];
      const sh = idx >= D - 13 ? shA : idx >= D - 27 ? shB : null;
      for (let d = 0; d < 7; d++) { shopVec[d] += l.q * v[d]; if (sh) sh[d] += l.q * v[d] / vs; if (ms) ms.vec[d] += l.q * decay * v[d]; }
      if (ms) { ms.qty[l.id] = (ms.qty[l.id] || 0) + l.q; ms.units += l.q; }
      if (!seen.includes(i)) seen.push(i);
    }
    for (let a = 0; a < seen.length; a++) { itemTx[seen[a]]++; for (let b = a + 1; b < seen.length; b++) { pc[seen[a]][seen[b]]++; pc[seen[b]][seen[a]]++; } }
  }
  for (let w = 0; w < 7; w++) for (let h = 0; h < grid[w].length; h++) grid[w][h] = wdDays[w] ? grid[w][h] / wdDays[w] : 0;
  usualRev = wdDays[todayWd] ? usualRev / wdDays[todayWd] : 0;

  /* pairs */
  const minSup = Math.max(10, Math.round(nTx * .004)), lift = Array.from({ length: nI }, () => new Array(nI).fill(0)), pairs = [];
  for (let a = 0; a < nI; a++) for (let b = a + 1; b < nI; b++) if (pc[a][b] >= minSup) { const L = pc[a][b] * nTx / (itemTx[a] * itemTx[b]); lift[a][b] = lift[b][a] = L; pairs.push({ a: MENU[a].id, b: MENU[b].id, n: pc[a][b], lift: L }); }
  pairs.sort((x, y) => y.lift - x.lift);

  /* forecast + rolling backtest over the last 14 complete days */
  const fc = {}, BT = 14; let eM = 0, eF = 0, eN = 0, act = 0;
  const allSeries = new Array(D).fill(0), allPred = new Array(7).fill(0), allBt = new Array(BT).fill(0), allAct = new Array(BT).fill(0);
  MENU.forEach((it, i) => {
    const s = units[i].slice(0, D), pred = [], res = [];
    for (let k = 0; k < 7; k++) pred.push(predict(s, startWd, D, D + k));
    for (let e = D - BT; e < D; e++) {
      const p = predict(s, startWd, e, e); res.push(s[e] - p);
      if (it.fresh) { eM += Math.abs(s[e] - p); eF += Math.abs(s[e] - mean(s, e - 28, e)); eN += Math.abs(s[e] - s[e - 7]); act += s[e]; allBt[e - (D - BT)] += p; allAct[e - (D - BT)] += s[e]; }
    }
    const sigma = Math.sqrt(res.reduce((a, r) => a + r * r, 0) / res.length);
    fc[it.id] = { series: s, pred, sigma, usual: mean(s, D - 28, D) };
    if (it.fresh) { for (let d = 0; d < D; d++) allSeries[d] += s[d]; for (let k = 0; k < 7; k++) allPred[k] += pred[k]; }
  });
  fc.all = { series: allSeries, pred: allPred, sigma: Math.sqrt(allBt.reduce((a, p, k) => a + (allAct[k] - p) ** 2, 0) / BT), usual: mean(allSeries, D - 28, D) };
  let aM = 0, aF = 0, aA = 0; for (let k = 0; k < BT; k++) { const e = D - BT + k; aM += Math.abs(allAct[k] - allBt[k]); aF += Math.abs(allAct[k] - mean(allSeries, e - 28, e)); aA += allAct[k]; }
  const nFresh = MENU.filter(m => m.fresh).length;
  const backtest = { itemMae: eM / (BT * nFresh), item: act ? eM / act : 0, itemFlat: act ? eF / act : 0, total: aA ? aM / aA : 0, totalFlat: aA ? aF / aA : 0, days: BT };

  /* flavor trend: share of units per note, last 14 days vs the 14 before */
  const sa = shA.reduce((a, b) => a + b, 0) || 1, sb = shB.reduce((a, b) => a + b, 0) || 1;
  const flavor = DIMS.map((label, d) => ({ label, d, share: shA[d] / sa * 100, shift: (shA[d] / sa - shB[d] / sb) * 100 }));

  /* fall concepts: how many members' taste vectors match */
  const base = norm1(shopVec), itemC = MENU.map(it => centered(it.v, base));
  const known = []; for (const [id, ms] of mem) { ms.id = id; ms.share = norm1(ms.vec); ms.c = ms.share.map((x, d) => x - base[d]); if (ms.units >= 5) known.push(ms); }
  const concepts = CONCEPTS.map(c => {
    const cc = centered(c.v, base); let fans = 0; const fanIds = [];
    for (const ms of known) if (cos(ms.c, cc) >= FAN_MIN) { fans++; fanIds.push(ms.id); }
    let vs = 0, ride = 0; for (let d = 0; d < 7; d++) vs += c.v[d]; for (let d = 0; d < 7; d++) ride += flavor[d].shift * c.v[d] / vs;
    return { name: c.name, v: c.v, c: cc, fans, fanIds, share: known.length ? fans / known.length : 0, ride };
  }).sort((a, b) => b.fans - a.fans || b.ride - a.ride);

  const top = MENU.map((it, i) => ({ id: it.id, units: week[i].units, rev: week[i].rev })).sort((a, b) => b.units - a.units);
  return { D, days, startWd, todayWd, units, tx, rev, grid, pairs, lift, minSup, nTx, fc, backtest, flavor, concepts, known: known.length, mem, shopVec, base, itemC, today: t, usualRev, top, now };
}

const FAN_MIN = .45;
/* what a member usually has, and what to offer next */
function recsFor(model, memberId) {
  const ms = model.mem.get(memberId); if (!ms || !ms.units) return { usual: null, tries: [], concept: null, loves: [], learning: true };
  let usual = null, uq = 0; for (const id in ms.qty) if (ms.qty[id] > uq) { uq = ms.qty[id]; usual = id; }
  const why = c => c.map((x, d) => ({ d, s: x > 0 && ms.c[d] > 0 ? x * ms.c[d] : 0 })).sort((a, b) => b.s - a.s).filter(x => x.s > 0).slice(0, 2).map(x => DIMS[x.d]);
  const scored = MENU.map((it, i) => ({ id: it.id, score: cos(ms.c, model.itemC[i]), had: ms.qty[it.id] || 0, why: why(model.itemC[i]) })).sort((a, b) => b.score - a.score);
  let concept = null; for (const c of model.concepts) { const sc = cos(ms.c, c.c); if (sc >= FAN_MIN && (!concept || sc > concept.score)) concept = { name: c.name, score: sc, why: why(c.c) }; }
  const loves = ms.c.map((x, d) => ({ d, x })).filter(o => o.x >= .04).sort((a, b) => b.x - a.x).slice(0, 2).map(o => DIMS[o.d]);
  return { usual, usualQty: uq, tries: scored.filter(x => x.had <= 1 && x.id !== usual && x.score >= .2).slice(0, 2), concept, loves, learning: ms.units < 3 };
}
function pairSuggest(model, cartIds) {
  let best = null;
  for (const a of cartIds) { const i = IDX[a]; if (i === undefined) continue; for (let j = 0; j < MENU.length; j++) { if (cartIds.includes(MENU[j].id)) continue; const L = model.lift[i][j]; if (L >= 1.3 && (!best || L > best.lift)) best = { id: MENU[j].id, with: a, lift: L }; } }
  return best;
}

/* the server loads this same file, so the till and the API always agree on the menu and the maths */
if (typeof module !== 'undefined' && module.exports) module.exports = { DIMS, MENU, IDX, CONCEPTS, OPEN, CLOSE, HIST_DAYS, DAY_MS, dayKey, startOfDay, saleTotal, sampleMembers, makeBasket, simulate, analyze, recsFor, pairSuggest };
