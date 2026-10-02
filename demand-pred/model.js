'use strict';
/* Demand model and supply maths. Pure functions: no files, no database. */
const DAY_MS = 86400000;
const LOOKBACK = 6;      /* same weekdays averaged */
const DECAY = .8;        /* each older week counts 0.8 of the one after it */
const TREND_GAIN = .5;   /* how far the last-fortnight trend moves the level */
const MAKE_MARGIN = .5;  /* fresh items: bake the forecast plus half a typical daily miss */
const WEEK_Z = 1.28;     /* made-to-order items: stock the forecast plus 1.28 typical weekly misses (about 9 weeks in 10) */
const RANGE_Z = 1.28;    /* low/high band stored with each daily forecast, about 80% */

function startOfDay(ts) { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }
function addDays(ts, n) { const d = new Date(ts); d.setDate(d.getDate() + n); return d.getTime(); }
function dayKey(ts) { const d = new Date(ts); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
function sum(a) { let t = 0; for (const x of a) t += x; return t; }
function mean(a, s, e) { s = Math.max(0, s); let t = 0; for (let i = s; i < e; i++) t += a[i]; return e > s ? t / (e - s) : 0; }
function round(x, n = 1) { const p = 10 ** n; return Math.round(x * p) / p; }

/* units sold per item per complete day, from the first sale up to (not including) the day `untilTs` falls on */
function dailySeries(lines, untilTs) {
  const end = startOfDay(untilTs);
  const first = lines.length ? startOfDay(lines[0].ts) : end;
  const days = []; for (let t = first; t < end; t = addDays(t, 1)) days.push(t);
  const idx = new Map(days.map((t, i) => [dayKey(t), i])), units = {}, price = {};
  for (const l of lines) {
    const i = idx.get(dayKey(l.ts)); if (i === undefined) continue;
    (units[l.item] || (units[l.item] = new Array(days.length).fill(0)))[i] += l.qty;
    price[l.item] = l.price; /* latest price wins, lines arrive in time order */
  }
  return { days, units, price };
}

/* one day's forecast from data before index `end`: recent same-weekday average, nudged by the two-week trend */
function predict(s, days, end, targetTs) {
  const wd = new Date(targetTs).getDay(); let num = 0, den = 0, k = 0;
  for (let i = end - 1; i >= 0 && k < LOOKBACK; i--) if (new Date(days[i]).getDay() === wd) { const w = DECAY ** k; num += w * s[i]; den += w; k++; }
  let level = den ? num / den : mean(s, 0, end);
  if (end >= 28) { const a = mean(s, end - 14, end), b = mean(s, end - 28, end - 14); if (b > 0) level *= 1 + TREND_GAIN * (clamp(a / b, .75, 1.33) - 1); }
  return Math.max(0, level);
}
/* typical one-day miss: root mean square error of the last 14 one-day-ahead forecasts */
function dailySigma(s, days) {
  const n = days.length, res = [];
  for (let e = Math.max(7, n - 14); e < n; e++) res.push(s[e] - predict(s, days, e, days[e]));
  return res.length ? Math.sqrt(sum(res.map(r => r * r)) / res.length) : Math.sqrt(mean(s, 0, n));
}
function makeQty(f, sigma) { return Math.ceil(f + MAKE_MARGIN * sigma); }

/* 7 days item by item, starting `from` days after `nowTs`: 1 for the week ahead, 0 for a week that starts today. items: [{id, name, price, fresh}] */
function forecastWeek(series, items, nowTs, from = 1) {
  const { days, units } = series, n = days.length, week = []; for (let k = from; k < from + 7; k++) week.push(startOfDay(addDays(nowTs, k)));
  return items.map(it => {
    const s = units[it.id] || new Array(n).fill(0), sigma = dailySigma(s, days);
    const daily = week.map(t => predict(s, days, n, t)), total = sum(daily);
    const make = it.fresh ? daily.map(f => makeQty(f, sigma)) : null;
    const plan = it.fresh ? sum(make) : Math.ceil(total + WEEK_Z * sigma * Math.sqrt(7));
    return {
      ...it, sigma, total, plan, usual: mean(s, n - 28, n) * 7,
      days: week.map((t, j) => ({ day: t, forecast: daily[j], low: Math.max(0, daily[j] - RANGE_Z * sigma), high: daily[j] + RANGE_Z * sigma, make: make ? make[j] : null })),
    };
  });
}

/* replay the method on past weeks: made on day e from data before e, judged on the 7 days from e+1.
   Compared with simply copying the previous 7 days. Fresh items only. */
function backtest(series, items) {
  const { days, units } = series, n = days.length;
  let err = 0, errNaive = 0, actual = 0, covered = 0, cases = 0, weeks = 0;
  for (let e = Math.max(28, n - 21); e <= n - 8; e++) {
    weeks++;
    for (const it of items) {
      if (!it.fresh) continue;
      const s = units[it.id]; if (!s) continue;
      const sigma = dailySigma(s.slice(0, e), days.slice(0, e));
      let f = 0, mk = 0, a = 0;
      for (let j = 1; j <= 7; j++) { const x = predict(s, days, e, days[e + j]); f += x; mk += makeQty(x, sigma); a += s[e + j]; }
      const naive = mean(s, e - 7, e) * 7;
      err += Math.abs(a - f); errNaive += Math.abs(a - naive); actual += a; cases++; if (mk >= a) covered++;
    }
  }
  return weeks && actual ? { weeks, itemErr: err / actual, naiveErr: errNaive / actual, covered: covered / cases } : null;
}

/* ingredients needed for the plan, then packs to buy after what is on the shelf (pantry counts packs, half packs fine) */
function supplies(plan, catalog, pantry) {
  const needByDay = {};
  for (const r of plan) {
    const rec = catalog.RECIPES[r.id]; if (!rec) continue;
    for (const g in rec) {
      if (!catalog.ING[g]) continue;
      const row = needByDay[g] || (needByDay[g] = new Array(7).fill(0));
      for (let j = 0; j < 7; j++) row[j] += rec[g] * (r.fresh ? r.days[j].make : r.plan / 7);
    }
  }
  const out = [];
  for (const g of catalog.INGREDIENTS) {
    const byDay = needByDay[g.id]; if (!byDay) continue;
    const need = Math.ceil(sum(byDay)), onHand = Math.max(0, Number(pantry[g.id]) || 0), have = onHand * g.pack;
    const packs = Math.max(0, Math.ceil((need - have) / g.pack - 1e-9));
    /* short-lived stock: buy what the first `keeps` days need now, the rest later in the week */
    let buyNow = packs, buyLater = 0, laterDay = null;
    if (g.keeps < 7 && packs > 0) {
      const first = sum(byDay.slice(0, g.keeps));
      buyNow = Math.min(packs, Math.max(0, Math.ceil((first - have) / g.pack - 1e-9)));
      buyLater = packs - buyNow; laterDay = buyLater ? plan[0].days[g.keeps].day : null;
    }
    out.push({ ...g, need, onHand, packs, cost: round(packs * g.price, 2), spare: Math.round(have + packs * g.pack - need), buyNow, buyLater, laterDay });
  }
  return out;
}

function fmtDay(ts, long) { return new Date(ts).toLocaleDateString('en-CA', { weekday: long ? 'long' : 'short', month: 'short', day: 'numeric' }); }
function fmtQty(x, unit) { return unit === 'each' ? String(Math.round(x)) : x >= 1000 ? round(x / 1000, x >= 10000 ? 0 : 1) + (unit === 'g' ? ' kg' : ' L') : Math.round(x) + ' ' + unit; }
const money = x => '$' + Math.round(x).toLocaleString('en-CA');

/* the weekly message to Grandma, plain text so it can be printed, texted or emailed */
function planNote(plan, shop, acc) {
  const week = plan[0].days.map(d => d.day), fresh = plan.filter(r => r.fresh), L = [];
  const freshByDay = week.map((_, j) => sum(fresh.map(r => r.days[j].forecast)));
  const order = week.map((_, j) => j).sort((a, b) => freshByDay[b] - freshByDay[a]);
  const movers = fresh.filter(r => r.usual >= 7).map(r => ({ name: r.name, pct: (r.total - r.usual) / r.usual * 100 })).sort((a, b) => b.pct - a.pct);
  const up = movers.filter(m => m.pct >= 8).slice(0, 2), down = movers.filter(m => m.pct <= -8).reverse().slice(0, 2);
  const cost = sum(shop.map(l => l.cost)), rev = sum(plan.map(r => r.total * (r.price || 0)));

  L.push("Grandma's plan for " + fmtDay(week[0]) + ' to ' + fmtDay(week[6]), '', 'THE WEEK AHEAD');
  L.push('- About ' + Math.round(sum(freshByDay)).toLocaleString('en-CA') + ' pastries and parfaits and ' + Math.round(sum(plan.filter(r => !r.fresh).map(r => r.total))).toLocaleString('en-CA') + ' drinks, taking in around ' + money(rev) + '.');
  L.push('- Busiest day: ' + fmtDay(week[order[0]], true) + ' (about ' + Math.round(freshByDay[order[0]]) + ' fresh items). Quietest: ' + fmtDay(week[order[6]], true) + ' (about ' + Math.round(freshByDay[order[6]]) + ').');
  if (up.length) L.push('- Selling more than usual: ' + up.map(m => m.name + ' (+' + Math.round(m.pct) + '%)').join(', ') + '.');
  if (down.length) L.push('- Selling less than usual: ' + down.map(m => m.name + ' (' + Math.round(m.pct) + '%)').join(', ') + '.');

  L.push('', 'WHAT TO MAKE EACH DAY');
  week.forEach((t, j) => L.push(fmtDay(t) + ': ' + fresh.map(r => [r.name, r.days[j].make]).sort((a, b) => b[1] - a[1]).map(([nm, q]) => q + ' ' + nm).join(', ')));

  L.push('', 'SHOPPING LIST, ONE TRIP (about ' + money(cost) + ')');
  let aisle = '';
  for (const l of shop) {
    if (!l.packs) continue;
    if (l.aisle !== aisle) { aisle = l.aisle; L.push(aisle + ':'); }
    L.push('  [ ] ' + l.name + ': ' + l.packs + ' x ' + l.packName + ' (' + fmtQty(l.need, l.unit) + ' needed)' + (l.buyLater ? '. Keeps ' + l.keeps + ' days: buy ' + l.buyNow + ' now, ' + l.buyLater + ' on ' + fmtDay(l.laterDay, true) : ''));
  }
  const skip = shop.filter(l => !l.packs);
  if (skip.length) L.push('', 'Already enough on the shelf: ' + skip.map(l => l.name).join(', ') + '.');
  if (acc) L.push('', 'How sure: replayed on the last ' + acc.weeks + ' weeks, an item\'s weekly total was off by ' + Math.round(acc.itemErr * 100) + '% on average (just copying the previous week: ' + Math.round(acc.naiveErr * 100) + '%). The daily amounts covered what sold ' + Math.round(acc.covered * 100) + '% of the time.');
  else L.push('', 'How sure: not yet. The plan needs about five weeks of sales before it can check itself.');
  return { text: L.join('\n'), cost, rev };
}

module.exports = { DAY_MS, startOfDay, addDays, dayKey, dailySeries, predict, forecastWeek, backtest, supplies, planNote, round };
