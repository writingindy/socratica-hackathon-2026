#!/usr/bin/env node
'use strict';
/* Grandma's weekly plan: reads the till's sales, forecasts the next 7 days, and stores the forecast
   and a shopping list in its own database. No dependencies: needs Node 22.13+ for built-in SQLite.

   node forecast.js                  make a weekly plan now (the 7 days from tomorrow) and print the note
   node forecast.js --rolling        make a rolling forecast now (the 7 days from today)
   node forecast.js --backfill 28    work out the rolling forecast each of the last 28 days would have had, from the sales before it
   node forecast.js --watch          stay running: a weekly plan every Sunday 5 pm by default, and a rolling forecast every day
   node forecast.js --note           print the latest stored note
   node forecast.js --pantry flour=2 butter=4.5   record what is on the shelf, in packs */
const fs = require('fs'), path = require('path');
const model = require('./model.js'), catalog = require('./catalog.js');

const TILL_DB = path.resolve(__dirname, process.env.TILL_DB || '../data/till.db');
const FORECAST_DB = path.resolve(__dirname, process.env.FORECAST_DB || '../data/forecast.db');
const PLAN_DAY = /^[0-6]$/.test(process.env.PLAN_DAY || '') ? Number(process.env.PLAN_DAY) : 0;
const PLAN_HOUR = /^([01]?\d|2[0-3])$/.test(process.env.PLAN_HOUR || '') ? Number(process.env.PLAN_HOUR) : 17;
const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const METHOD = 'same-weekday weighted average (6 weeks, decay 0.8) x two-week trend';

/* quiet the one-line experimental warning older Node 22 prints for node:sqlite */
const warn = process.emitWarning;
process.emitWarning = (w, ...rest) => (String(w).includes('SQLite') ? undefined : warn.call(process, w, ...rest));
const { DatabaseSync } = require('node:sqlite');


/* ---------- read the till (read-only, never written) ---------- */
function readSales() {
  if (!fs.existsSync(TILL_DB)) throw new Error('No till database at ' + TILL_DB + '. Start grandmas-till once (cd grandmas-till && node server.js) or set TILL_DB.');
  const db = new DatabaseSync(TILL_DB, { readOnly: true });
  try {
    return db.prepare('SELECT s.ts AS ts, l.item_id AS item, l.qty AS qty, l.price AS price FROM sale_lines l JOIN sales s ON s.id = l.sale_id ORDER BY s.ts').all()
      .map(r => ({ ts: Number(r.ts), item: r.item, qty: Number(r.qty), price: Number(r.price) }));
  } finally { db.close(); }
}

/* ---------- the forecast database ---------- */
function openStore() {
  fs.mkdirSync(path.dirname(FORECAST_DB), { recursive: true });
  const db = new DatabaseSync(FORECAST_DB);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS forecast_runs (
      id TEXT PRIMARY KEY,
      created INTEGER NOT NULL,          -- ms since epoch
      kind TEXT NOT NULL DEFAULT 'weekly', -- weekly: the shopping plan for the week from tomorrow. rolling: the 7 days from today, remade daily
      reason TEXT NOT NULL,              -- scheduled, manual or first run
      week_start TEXT NOT NULL,          -- first forecast day, YYYY-MM-DD
      week_end TEXT NOT NULL,
      history_start TEXT, history_end TEXT, sales_lines INTEGER NOT NULL,
      method TEXT NOT NULL,
      fresh_units REAL NOT NULL, drink_units REAL NOT NULL,
      expected_revenue REAL NOT NULL, supplies_cost REAL NOT NULL,
      bt_weeks INTEGER, bt_item_err REAL, bt_naive_err REAL, bt_covered REAL,
      note TEXT NOT NULL);               -- the message for Grandma
    CREATE TABLE IF NOT EXISTS demand_forecasts (
      run_id TEXT NOT NULL REFERENCES forecast_runs(id) ON DELETE CASCADE,
      day TEXT NOT NULL, weekday TEXT NOT NULL,
      item_id TEXT NOT NULL, item_name TEXT NOT NULL, made_ahead INTEGER NOT NULL,
      forecast REAL NOT NULL, low REAL NOT NULL, high REAL NOT NULL,
      make_qty INTEGER,                  -- how many to bake that day; NULL for drinks made to order
      PRIMARY KEY (run_id, day, item_id));
    CREATE TABLE IF NOT EXISTS supply_orders (
      run_id TEXT NOT NULL REFERENCES forecast_runs(id) ON DELETE CASCADE,
      ingredient_id TEXT NOT NULL, name TEXT NOT NULL, aisle TEXT NOT NULL, unit TEXT NOT NULL,
      need REAL NOT NULL,                -- in unit, for the whole week
      on_hand_packs REAL NOT NULL,
      packs INTEGER NOT NULL, pack_name TEXT NOT NULL, pack_size REAL NOT NULL,
      cost REAL NOT NULL,
      buy_now INTEGER NOT NULL, buy_later INTEGER NOT NULL, buy_later_day TEXT,
      PRIMARY KEY (run_id, ingredient_id));
    CREATE TABLE IF NOT EXISTS pantry (
      ingredient_id TEXT PRIMARY KEY, packs REAL NOT NULL, updated INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS forecast_runs_created ON forecast_runs(created);`);
  /* databases from schema 1 had no kind: every run then was a weekly plan */
  if (!db.prepare('PRAGMA table_info(forecast_runs)').all().some(c => c.name === 'kind')) db.exec("ALTER TABLE forecast_runs ADD COLUMN kind TEXT NOT NULL DEFAULT 'weekly'");
  db.exec(`
    PRAGMA user_version = 2;
    CREATE INDEX IF NOT EXISTS forecast_runs_kind ON forecast_runs(kind, created);
    /* what a frontend reads: the newest weekly plan and the newest rolling forecast, without looking up run ids */
    DROP VIEW IF EXISTS latest_run; DROP VIEW IF EXISTS latest_demand_forecasts; DROP VIEW IF EXISTS latest_supply_orders;
    DROP VIEW IF EXISTS rolling_run; DROP VIEW IF EXISTS rolling_forecasts;
    CREATE VIEW latest_run AS
      SELECT * FROM forecast_runs WHERE kind = 'weekly' ORDER BY created DESC LIMIT 1;
    CREATE VIEW latest_demand_forecasts AS
      SELECT f.* FROM demand_forecasts f JOIN latest_run r ON r.id = f.run_id ORDER BY f.day, f.made_ahead DESC, f.item_name;
    CREATE VIEW latest_supply_orders AS   -- in shopping-list order: by aisle, as listed in catalog.js
      SELECT s.* FROM supply_orders s JOIN latest_run r ON r.id = s.run_id ORDER BY s.rowid;
    CREATE VIEW rolling_run AS
      SELECT * FROM forecast_runs WHERE kind = 'rolling' ORDER BY created DESC LIMIT 1;
    CREATE VIEW rolling_forecasts AS
      SELECT f.* FROM demand_forecasts f JOIN rolling_run r ON r.id = f.run_id ORDER BY f.day, f.made_ahead DESC, f.item_name;`);
  return db;
}
function tx(db, fn) { db.exec('BEGIN'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } }

/* ---------- one run ---------- */
/* asOf: when the run counts as made. A backfill passes the start of a past day and only the sales before it */
function makePlan(db, kind, reason, asOf = Date.now(), lines = readSales()) {
  const now = asOf;
  const series = model.dailySeries(lines, now);
  if (series.days.length < 14) throw new Error('Only ' + series.days.length + ' days of sales so far. Needs at least 14 to forecast.');
  /* every item in the catalog, plus anything the till sold that the catalog does not know yet */
  const ids = new Set(Object.keys(catalog.ITEMS)); for (const id in series.units) ids.add(id);
  const items = [...ids].map(id => { const m = catalog.ITEMS[id]; return { id, name: m ? m.name : id, price: series.price[id] || 0, fresh: m ? m.madeAhead : true }; });
  const plan = model.forecastWeek(series, items, now, kind === 'rolling' ? 0 : 1);
  const pantry = Object.fromEntries(db.prepare('SELECT ingredient_id, packs FROM pantry').all().map(r => [r.ingredient_id, r.packs]));
  const shop = model.supplies(plan, catalog, pantry), acc = model.backtest(series, items);
  const note = model.planNote(plan, shop, acc), week = plan[0].days.map(d => d.day), id = kind + '-' + model.dayKey(now) + '-' + now.toString(36);
  const r1 = x => model.round(x, 2);

  tx(db, () => {
    db.prepare(`INSERT INTO forecast_runs (id, kind, created, reason, week_start, week_end, history_start, history_end, sales_lines, method,
      fresh_units, drink_units, expected_revenue, supplies_cost, bt_weeks, bt_item_err, bt_naive_err, bt_covered, note)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      id, kind, now, reason, model.dayKey(week[0]), model.dayKey(week[6]), model.dayKey(series.days[0]), model.dayKey(series.days[series.days.length - 1]), lines.length, METHOD,
      r1(plan.filter(r => r.fresh).reduce((a, r) => a + r.total, 0)), r1(plan.filter(r => !r.fresh).reduce((a, r) => a + r.total, 0)), r1(note.rev), r1(note.cost),
      acc ? acc.weeks : null, acc ? r1(acc.itemErr) : null, acc ? r1(acc.naiveErr) : null, acc ? r1(acc.covered) : null, note.text);
    const insF = db.prepare('INSERT INTO demand_forecasts (run_id, day, weekday, item_id, item_name, made_ahead, forecast, low, high, make_qty) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    for (const r of plan) for (const d of r.days) insF.run(id, model.dayKey(d.day), WD[new Date(d.day).getDay()], r.id, r.name, r.fresh ? 1 : 0, r1(d.forecast), r1(d.low), r1(d.high), d.make);
    const insS = db.prepare(`INSERT INTO supply_orders (run_id, ingredient_id, name, aisle, unit, need, on_hand_packs, packs, pack_name, pack_size, cost, buy_now, buy_later, buy_later_day)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const l of shop) insS.run(id, l.id, l.name, l.aisle, l.unit, l.need, l.onHand, l.packs, l.packName, l.pack, l.cost, l.buyNow, l.buyLater, l.laterDay ? model.dayKey(l.laterDay) : null);
  });
  return { id, note: note.text };
}

/* ---------- schedule: the weekly plan once a week, the rolling forecast once a day ---------- */
function lastSlot(now) { const d = new Date(now); d.setHours(PLAN_HOUR, 0, 0, 0); d.setDate(d.getDate() - (d.getDay() - PLAN_DAY + 7) % 7); if (d.getTime() > now) d.setDate(d.getDate() - 7); return d.getTime(); }
function latestRun(db, kind) { return db.prepare('SELECT id, created, note FROM forecast_runs WHERE kind = ? ORDER BY created DESC LIMIT 1').get(kind); }
function runDue(db, kind, since, verbose) {
  const last = latestRun(db, kind);
  if (last && last.created >= since) return;
  try { const r = makePlan(db, kind, last ? 'scheduled' : 'first run'); console.log(`[${new Date().toLocaleString('en-CA')}] Saved ${r.id}` + (verbose ? `\n\n${r.note}\n` : '')); }
  catch (e) { console.error(`[${new Date().toLocaleString('en-CA')}] ${kind} forecast failed: ${e.message}`); }
}
/* past days with no rolling forecast get the one it would have made that morning, from the sales before that day only */
function backfill(db, days) {
  const all = readSales(), today = model.startOfDay(Date.now()), has = db.prepare("SELECT 1 FROM forecast_runs WHERE kind = 'rolling' AND week_start = ?");
  let made = 0;
  for (let k = days; k >= 1; k--) {
    const start = model.startOfDay(model.addDays(today, -k));
    if (has.get(model.dayKey(start))) continue;
    try { makePlan(db, 'rolling', 'backfill', start, all.filter(l => l.ts < start)); made++; }
    catch (e) { /* too little history before that day */ }
  }
  return made;
}
function tick(db) { const now = Date.now(); runDue(db, 'weekly', lastSlot(now), true); runDue(db, 'rolling', model.startOfDay(now), false); }

/* ---------- command line ---------- */
function main() {
  const args = process.argv.slice(2), db = openStore();
  if (args[0] === '--pantry') {
    const up = db.prepare('INSERT OR REPLACE INTO pantry (ingredient_id, packs, updated) VALUES (?, ?, ?)');
    for (const a of args.slice(1)) {
      const [k, v] = a.split('='), n = Number(v);
      if (!catalog.ING[k] || !(n >= 0)) { console.error('Skipped ' + a + ': use <ingredient>=<packs>, ingredients are ' + catalog.INGREDIENTS.map(g => g.id).join(', ')); continue; }
      up.run(k, n, Date.now()); console.log(catalog.ING[k].name + ': ' + n + ' x ' + catalog.ING[k].packName + ' on the shelf');
    }
    return;
  }
  if (args[0] === '--note') { const r = latestRun(db, 'weekly'); console.log(r ? r.note : 'No plan yet. Run: node forecast.js'); return; }
  if (args[0] === '--watch') {
    const next = new Date(lastSlot(Date.now()) + 7 * model.DAY_MS);
    console.log(`Weekly plan: every ${WD[PLAN_DAY]} at ${PLAN_HOUR}:00. Next ${next.toLocaleString('en-CA')}\nRolling 7-day forecast: every day just after midnight\n  Reads:  ${TILL_DB}\n  Writes: ${FORECAST_DB}`);
    const filled = backfill(db, 28); if (filled) console.log(`Filled in ${filled} past days that had no forecast, from the sales before each one.`);
    tick(db); setInterval(() => tick(db), 10 * 60000);
    return;
  }
  if (args[0] === '--backfill') { const n = Math.max(1, Math.min(365, Number(args[1]) || 28)); console.log(`Filled in ${backfill(db, n)} of the last ${n} days. Days that already had a forecast were left alone.`); return; }
  if (args[0] === '--rolling') { const r = makePlan(db, 'rolling', 'manual'); console.log('Saved ' + r.id + ': the 7 days from today, in ' + path.relative(process.cwd(), FORECAST_DB)); return; }
  const r = makePlan(db, 'weekly', 'manual');
  console.log(r.note + '\n\nSaved as ' + r.id + ' in ' + path.relative(process.cwd(), FORECAST_DB));
}
try { main(); } catch (e) { console.error(e.message); process.exitCode = 1; }
