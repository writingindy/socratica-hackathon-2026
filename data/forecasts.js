'use strict';
/* Read-only access to data/forecast.db, which demand-pred writes. No dependencies (Node 22.13+).

   const forecasts = require('../data/forecasts.js').open();
   forecasts.rolling();   // the 7 days from today, remade every day
   forecasts.weekly();    // the weekly plan: 7 days from the day after it was made, plus the shopping list
   forecasts.forDay(day); // what was forecast for one day ("YYYY-MM-DD"), from the newest run that covered it
   All return null until demand-pred has made one. */
const fs = require('fs'), path = require('path');

const FILE = path.join(__dirname, 'forecast.db');

function open() {
  let db = null;
  const conn = () => {
    if (db) return db;
    if (!fs.existsSync(FILE)) return null;
    const warn = process.emitWarning;
    process.emitWarning = (w, ...rest) => (String(w).includes('SQLite') ? undefined : warn.call(process, w, ...rest));
    const { DatabaseSync } = require('node:sqlite');
    db = new DatabaseSync(FILE, { readOnly: true });
    return db;
  };
  const run = r => r && {
    id: r.id, kind: r.kind, created: r.created, reason: r.reason,
    weekStart: r.week_start, weekEnd: r.week_end, historyStart: r.history_start, historyEnd: r.history_end, method: r.method,
    freshUnits: r.fresh_units, drinkUnits: r.drink_units, expectedRevenue: r.expected_revenue, suppliesCost: r.supplies_cost,
    backtest: r.bt_weeks ? { weeks: r.bt_weeks, itemErr: r.bt_item_err, naiveErr: r.bt_naive_err, covered: r.bt_covered } : null,
    note: r.note,
  };
  const forecast = f => ({ day: f.day, weekday: f.weekday, itemId: f.item_id, itemName: f.item_name, madeAhead: !!f.made_ahead, forecast: f.forecast, low: f.low, high: f.high, make: f.make_qty });
  const supply = s => ({
    id: s.ingredient_id, name: s.name, aisle: s.aisle, unit: s.unit, need: s.need, onHand: s.on_hand_packs,
    packs: s.packs, packName: s.pack_name, packSize: s.pack_size, cost: s.cost, buyNow: s.buy_now, buyLater: s.buy_later, buyLaterDay: s.buy_later_day,
  });
  /* prepared per call: demand-pred recreates its views each time it starts */
  const read = (runView, forecastView, supplyView) => {
    const d = conn(); if (!d) return null;
    const r = d.prepare(`SELECT * FROM ${runView}`).get(); if (!r) return null;
    const out = { run: run(r), forecasts: d.prepare(`SELECT * FROM ${forecastView}`).all().map(forecast) };
    if (supplyView) out.supplies = d.prepare(`SELECT * FROM ${supplyView}`).all().map(supply);
    return out;
  };
  return {
    file: 'data/forecast.db',
    exists: () => fs.existsSync(FILE),
    rolling: () => read('rolling_run', 'rolling_forecasts'),
    weekly: () => read('latest_run', 'latest_demand_forecasts', 'latest_supply_orders'),
    /* every run is kept, so past days keep their forecast. A rolling run made on or just before the day beats a weekly plan */
    forDay: day => {
      const d = conn(); if (!d) return null;
      const r = d.prepare(`SELECT * FROM forecast_runs WHERE week_start <= ? AND week_end >= ? ORDER BY kind = 'rolling' DESC, created DESC LIMIT 1`).get(day, day);
      if (!r) return null;
      return { run: run(r), forecasts: d.prepare('SELECT * FROM demand_forecasts WHERE run_id = ? AND day = ? ORDER BY made_ahead DESC, item_name').all(r.id, day).map(forecast) };
    },
  };
}

module.exports = { open };
