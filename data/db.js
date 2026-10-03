'use strict';
/* The shared database for every project in this repository. No dependencies.
   SQLite (data/till.db) where this Node has it built in (22.13+), a JSON file (data/till.json) otherwise.
   The database files live next to this file and are never committed: everyone gets their own local copy.

   Usage, from any project folder:
     const db = require('../data/db.js');
     const store = db.open();            // or db.open({ reset: true }) to start fresh
     store.listSales(since, liveOnly); store.addSale(sale); ...  */
const fs = require('fs'), path = require('path');

const DIR = __dirname;

function sqliteStore() {
  const warn = process.emitWarning;
  process.emitWarning = (w, ...rest) => (String(w).includes('SQLite') ? undefined : warn.call(process, w, ...rest));
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(path.join(DIR, 'till.db'));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 2000;
    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY, ts INTEGER NOT NULL, total REAL NOT NULL,
      pay TEXT NOT NULL, member_id TEXT, src TEXT NOT NULL,
      order_no INTEGER, name TEXT, status TEXT NOT NULL DEFAULT 'done',
      discount REAL NOT NULL DEFAULT 0, discount_kind TEXT);
    CREATE TABLE IF NOT EXISTS sale_lines (
      sale_id TEXT NOT NULL, item_id TEXT NOT NULL, qty INTEGER NOT NULL, price REAL NOT NULL,
      opts TEXT, note TEXT);
    CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY, num INTEGER NOT NULL, name TEXT NOT NULL,
      joined INTEGER NOT NULL, sample INTEGER NOT NULL DEFAULT 0);
    CREATE INDEX IF NOT EXISTS sales_ts ON sales(ts);
    CREATE INDEX IF NOT EXISTS sale_lines_sale ON sale_lines(sale_id);`);
  /* databases made by earlier versions get the newer columns added in place */
  const addCols = (table, list) => { const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name); for (const [c, type] of list) if (!cols.includes(c)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${c} ${type}`); };
  addCols('sales', [['order_no', 'INTEGER'], ['name', 'TEXT'], ['status', "TEXT NOT NULL DEFAULT 'done'"], ['discount', 'REAL NOT NULL DEFAULT 0'], ['discount_kind', 'TEXT']]);
  addCols('sale_lines', [['opts', 'TEXT'], ['note', 'TEXT']]);
  const insSale = db.prepare('INSERT OR IGNORE INTO sales (id, ts, total, pay, member_id, src, order_no, name, status, discount, discount_kind) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const insLine = db.prepare('INSERT INTO sale_lines (sale_id, item_id, qty, price, opts, note) VALUES (?, ?, ?, ?, ?, ?)');
  const insMember = db.prepare('INSERT OR REPLACE INTO members (id, num, name, joined, sample) VALUES (?, ?, ?, ?, ?)');
  const put = s => { if (!insSale.run(s.id, s.ts, s.total, s.pay, s.m, s.src, s.no ?? null, s.name ?? null, s.status || 'done', s.discount || 0, s.discountKind ?? null).changes) return false; for (const l of s.lines) insLine.run(s.id, l.id, l.q, l.p, l.opts && l.opts.length ? l.opts.join(',') : null, l.note || null); return true; };
  /* a line only carries opts and note when it has them, so plain lines stay small */
  const line = l => { const o = { id: l.item_id, q: l.qty, p: l.price }; if (l.opts) o.opts = l.opts.split(','); if (l.note) o.note = l.note; return o; };
  const tx = fn => { db.exec('BEGIN'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };
  const row = r => ({ id: r.id, ts: r.ts, lines: [], total: r.total, pay: r.pay, m: r.member_id, src: r.src, no: r.order_no, name: r.name, status: r.status, discount: r.discount || 0, discountKind: r.discount_kind });
  const drop = where => { db.exec(`DELETE FROM sale_lines WHERE sale_id IN (SELECT id FROM sales WHERE ${where})`); return db.prepare(`DELETE FROM sales WHERE ${where}`).run().changes; };
  return {
    kind: 'sqlite', file: 'data/till.db',
    listSales(since = 0, live = false) {
      const where = 's.ts >= ?' + (live ? " AND s.src <> 'sim'" : ''), out = [], by = new Map();
      for (const r of db.prepare(`SELECT s.* FROM sales s WHERE ${where} ORDER BY s.ts, s.id`).all(since)) { const s = row(r); by.set(r.id, s); out.push(s); }
      for (const l of db.prepare(`SELECT l.sale_id, l.item_id, l.qty, l.price, l.opts, l.note FROM sale_lines l JOIN sales s ON s.id = l.sale_id WHERE ${where} ORDER BY l.rowid`).all(since)) { const s = by.get(l.sale_id); if (s) s.lines.push(line(l)); }
      return out;
    },
    getSale(id) {
      const r = db.prepare('SELECT * FROM sales WHERE id = ?').get(id); if (!r) return null;
      const s = row(r); s.lines = db.prepare('SELECT item_id, qty, price, opts, note FROM sale_lines WHERE sale_id = ? ORDER BY rowid').all(id).map(line);
      return s;
    },
    setState: (id, status, pay) => db.prepare('UPDATE sales SET status = ?, pay = ? WHERE id = ?').run(status, pay, id),
    nextOrderNo: since => (db.prepare('SELECT MAX(order_no) AS n FROM sales WHERE ts >= ?').get(since).n || 0) + 1,
    addSale: s => tx(() => put(s)),
    addSales: list => tx(() => list.filter(put).length),
    replaceSim: list => tx(() => { drop("src = 'sim'"); for (const s of list) put(s); }),
    clearTill: () => tx(() => drop("src <> 'sim'")),
    listMembers: () => db.prepare('SELECT id, num, name, joined, sample FROM members ORDER BY num').all(),
    addMembers: list => tx(() => { for (const m of list) insMember.run(m.id, m.num, m.name, m.joined, m.sample ? 1 : 0); }),
    nextNum: () => (db.prepare('SELECT MAX(num) AS n FROM members').get().n || 1000) + 1,
  };
}

function jsonStore() {
  const file = path.join(DIR, 'till.json');
  let d = { sales: [], members: [] }, seen = 0;
  /* another process (the other project) may have written the file since we last looked: re-read it if so */
  const load = () => { try { const t = fs.statSync(file).mtimeMs; if (t !== seen) { d = JSON.parse(fs.readFileSync(file, 'utf8')); seen = t; } } catch (e) { /* first run */ } };
  load();
  let timer = null;
  const save = () => { clearTimeout(timer); timer = setTimeout(() => { fs.writeFileSync(file + '.tmp', JSON.stringify(d)); fs.renameSync(file + '.tmp', file); seen = fs.statSync(file).mtimeMs; timer = null; }, 200); };
  const put = s => { if (d.sales.some(x => x.id === s.id)) return false; d.sales.push({ no: null, name: null, status: 'done', discount: 0, discountKind: null, ...s }); return true; };
  return {
    kind: 'json', file: 'data/till.json',
    listSales: (since = 0, live = false) => { if (!timer) load(); return d.sales.filter(s => s.ts >= since && !(live && s.src === 'sim')).sort((a, b) => a.ts - b.ts); },
    getSale: id => d.sales.find(s => s.id === id) || null,
    setState: (id, status, pay) => { const s = d.sales.find(x => x.id === id); if (s) { s.status = status; s.pay = pay; save(); } },
    nextOrderNo: since => d.sales.reduce((a, s) => (s.ts >= since ? Math.max(a, s.no || 0) : a), 0) + 1,
    addSale: s => { const ok = put(s); save(); return ok; },
    addSales: list => { const n = list.filter(put).length; save(); return n; },
    replaceSim: list => { d.sales = d.sales.filter(s => s.src !== 'sim').concat(list); save(); },
    clearTill: () => { const n = d.sales.length; d.sales = d.sales.filter(s => s.src === 'sim'); save(); return n - d.sales.length; },
    listMembers: () => { if (!timer) load(); return d.members.slice().sort((a, b) => a.num - b.num); },
    addMembers: list => { for (const m of list) { d.members = d.members.filter(x => x.id !== m.id); d.members.push({ id: m.id, num: m.num, name: m.name, joined: m.joined, sample: m.sample ? 1 : 0 }); } save(); },
    nextNum: () => d.members.reduce((a, m) => Math.max(a, m.num), 1000) + 1,
  };
}

/* Open the shared database. Set TILL_STORE=json to force the JSON file. */
function open({ reset = false } = {}) {
  if (reset) for (const f of ['till.db', 'till.db-wal', 'till.db-shm', 'till.json']) fs.rmSync(path.join(DIR, f), { force: true });
  if (process.env.TILL_STORE === 'json') return jsonStore();
  try { return sqliteStore(); } catch (e) { return jsonStore(); }
}

module.exports = { open, DIR };
