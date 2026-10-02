#!/usr/bin/env node
'use strict';
/* Grandma's Till: local server. No dependencies: `node server.js`.
   Serves the till from /public, stores every sale in a database under /data,
   and pushes each new sale to every open screen. */
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const core = require('./public/core.js');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname, 'public');
const DATA = path.join(__dirname, 'data');
if (process.argv.includes('--reset')) fs.rmSync(DATA, { recursive: true, force: true });
fs.mkdirSync(DATA, { recursive: true });

/* ---------- storage: SQLite where this Node has it built in (22.13+), a JSON file otherwise ---------- */
function sqliteStore() {
  const warn = process.emitWarning;
  process.emitWarning = (w, ...rest) => (String(w).includes('SQLite') ? undefined : warn.call(process, w, ...rest));
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(path.join(DATA, 'till.db'));
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY, ts INTEGER NOT NULL, total REAL NOT NULL,
      pay TEXT NOT NULL, member_id TEXT, src TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sale_lines (
      sale_id TEXT NOT NULL, item_id TEXT NOT NULL, qty INTEGER NOT NULL, price REAL NOT NULL);
    CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY, num INTEGER NOT NULL, name TEXT NOT NULL,
      joined INTEGER NOT NULL, sample INTEGER NOT NULL DEFAULT 0);
    CREATE INDEX IF NOT EXISTS sales_ts ON sales(ts);
    CREATE INDEX IF NOT EXISTS sale_lines_sale ON sale_lines(sale_id);`);
  const insSale = db.prepare('INSERT OR IGNORE INTO sales (id, ts, total, pay, member_id, src) VALUES (?, ?, ?, ?, ?, ?)');
  const insLine = db.prepare('INSERT INTO sale_lines (sale_id, item_id, qty, price) VALUES (?, ?, ?, ?)');
  const insMember = db.prepare('INSERT OR REPLACE INTO members (id, num, name, joined, sample) VALUES (?, ?, ?, ?, ?)');
  const put = s => { if (!insSale.run(s.id, s.ts, s.total, s.pay, s.m, s.src).changes) return false; for (const l of s.lines) insLine.run(s.id, l.id, l.q, l.p); return true; };
  const tx = fn => { db.exec('BEGIN'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };
  const drop = where => { db.exec(`DELETE FROM sale_lines WHERE sale_id IN (SELECT id FROM sales WHERE ${where})`); return db.prepare(`DELETE FROM sales WHERE ${where}`).run().changes; };
  return {
    kind: 'sqlite', file: 'data/till.db',
    listSales() {
      const out = [], by = new Map();
      for (const r of db.prepare('SELECT id, ts, total, pay, member_id, src FROM sales ORDER BY ts, id').all()) { const s = { id: r.id, ts: r.ts, lines: [], total: r.total, pay: r.pay, m: r.member_id, src: r.src }; by.set(r.id, s); out.push(s); }
      for (const l of db.prepare('SELECT sale_id, item_id, qty, price FROM sale_lines ORDER BY rowid').all()) { const s = by.get(l.sale_id); if (s) s.lines.push({ id: l.item_id, q: l.qty, p: l.price }); }
      return out;
    },
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
  const file = path.join(DATA, 'till.json');
  let d = { sales: [], members: [] };
  try { d = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { /* first run */ }
  let timer = null;
  const save = () => { clearTimeout(timer); timer = setTimeout(() => { fs.writeFileSync(file + '.tmp', JSON.stringify(d)); fs.renameSync(file + '.tmp', file); }, 200); };
  const put = s => { if (d.sales.some(x => x.id === s.id)) return false; d.sales.push(s); return true; };
  return {
    kind: 'json', file: 'data/till.json',
    listSales: () => d.sales.slice().sort((a, b) => a.ts - b.ts),
    addSale: s => { const ok = put(s); save(); return ok; },
    addSales: list => { const n = list.filter(put).length; save(); return n; },
    replaceSim: list => { d.sales = d.sales.filter(s => s.src !== 'sim').concat(list); save(); },
    clearTill: () => { const n = d.sales.length; d.sales = d.sales.filter(s => s.src === 'sim'); save(); return n - d.sales.length; },
    listMembers: () => d.members.slice().sort((a, b) => a.num - b.num),
    addMembers: list => { for (const m of list) { d.members = d.members.filter(x => x.id !== m.id); d.members.push({ id: m.id, num: m.num, name: m.name, joined: m.joined, sample: m.sample ? 1 : 0 }); } save(); },
    nextNum: () => d.members.reduce((a, m) => Math.max(a, m.num), 1000) + 1,
  };
}
let store;
if (process.env.TILL_STORE === 'json') store = jsonStore();
else { try { store = sqliteStore(); } catch (e) { store = jsonStore(); } }

/* ---------- sample history: six weeks of simulated sales, topped up as the day goes on ---------- */
const SAMPLE = core.sampleMembers();
let lastSim = 0;
function seed() {
  const now = Date.now(), sim = core.simulate(now, SAMPLE);
  store.addMembers(SAMPLE.map(m => ({ id: m.id, num: m.num, name: m.name, joined: 0, sample: 1 })));
  store.replaceSim(sim); lastSim = now; return sim.length;
}
function topUp() {
  const now = Date.now(), fresh = core.simulate(now, SAMPLE).filter(s => s.ts > lastSim);
  lastSim = now;
  for (const s of fresh) if (store.addSale(s)) broadcast('sale', s);
}

/* ---------- live push (server-sent events) ---------- */
const clients = new Set();
function broadcast(event, data) { const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`; for (const res of clients) res.write(msg); }

/* ---------- API ---------- */
function bad(message) { const e = new Error(message); e.status = 400; return e; }
function send(res, status, body) { const text = JSON.stringify(body); res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(text); }
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > 65536) { reject(bad('body too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(bad('body must be JSON')); } });
    req.on('error', reject);
  });
}
/* never trust the client for prices or time: the server looks up the menu and stamps the sale */
function cleanSale(b) {
  if (!b || !Array.isArray(b.lines)) throw bad('lines must be a list of {id, q}');
  const lines = [];
  for (const l of b.lines.slice(0, 20)) { const it = core.MENU[core.IDX[l && l.id]], q = Math.floor(Number(l && l.q)); if (it && q >= 1 && q <= 50) lines.push({ id: it.id, q, p: it.price }); }
  if (!lines.length) throw bad('no valid lines');
  const id = typeof b.id === 'string' && /^[A-Za-z0-9_-]{6,40}$/.test(b.id) ? b.id : 's' + crypto.randomBytes(8).toString('hex');
  return { id, ts: Date.now(), lines, total: core.saleTotal(lines), pay: b.pay === 'cash' ? 'cash' : 'card', m: typeof b.m === 'string' && b.m.length <= 40 ? b.m : null, src: b.src === 'rush' ? 'rush' : 'till' };
}
function insights() {
  const now = Date.now(), M = core.analyze(store.listSales(), now, []);
  return {
    generatedAt: now, tomorrow: core.dayKey(M.days[M.D + 1]),
    bakeSheet: core.MENU.filter(i => i.fresh).map(it => { const f = M.fc[it.id]; return { item: it.id, name: it.name, forecast: Math.round(f.pred[1]), bake: Math.ceil(f.pred[1] + .5 * f.sigma), usual: Math.round(f.usual) }; }),
    backtest: M.backtest, today: M.today,
    pairs: M.pairs.slice(0, 5), flavorTrends: M.flavor.map(f => ({ note: f.label, sharePct: +f.share.toFixed(1), shiftPts: +f.shift.toFixed(2) })),
    fallConcepts: M.concepts.map(c => ({ name: c.name, fans: c.fans, of: M.known, ridesRisingFlavors: c.ride > .1 })),
  };
}
async function api(req, res, url) {
  const route = req.method + ' ' + url.pathname;
  if (route === 'GET /api/health') return send(res, 200, { ok: true, store: store.kind, file: store.file });
  if (route === 'GET /api/sales') { const all = store.listSales(); return send(res, 200, url.searchParams.get('src') === 'till' ? all.filter(s => s.src !== 'sim') : all); }
  if (route === 'POST /api/sales') { const sale = cleanSale(await readBody(req)); if (store.addSale(sale)) broadcast('sale', sale); return send(res, 201, sale); }
  if (route === 'DELETE /api/sales') { const removed = store.clearTill(); broadcast('clear', { removed }); return send(res, 200, { removed }); }
  if (route === 'GET /api/members') return send(res, 200, store.listMembers());
  if (route === 'POST /api/members') {
    const b = await readBody(req), name = typeof b.name === 'string' ? b.name.trim().slice(0, 40) : '';
    if (!name) throw bad('name is required');
    const m = { id: typeof b.id === 'string' && /^[A-Za-z0-9_-]{6,40}$/.test(b.id) ? b.id : 'm' + crypto.randomBytes(6).toString('hex'), num: store.nextNum(), name, joined: Date.now(), sample: 0 };
    store.addMembers([m]); broadcast('member', m); return send(res, 201, m);
  }
  if (route === 'GET /api/insights') return send(res, 200, insights());
  if (route === 'GET /api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write('retry: 2000\n\n'); clients.add(res); req.on('close', () => clients.delete(res)); return;
  }
  send(res, 404, { error: 'no such route' });
}

/* ---------- static files ---------- */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8' };
function serveStatic(req, res, url) {
  const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname), file = path.join(PUBLIC, path.normalize(rel));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(buf);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url);
  api(req, res, url).catch(e => send(res, e.status || 500, { error: e.message }));
});
const seeded = seed();
setInterval(topUp, 60000).unref();
setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 25000).unref();
server.listen(PORT, () => {
  console.log(`\nGrandma's Till is running.\n  Store:   ${store.kind} (${store.file}), ${seeded} sample sales seeded`);
  console.log(`  Open:    http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces())) for (const n of list || []) if (n.family === 'IPv4' && !n.internal) console.log(`  Phones:  http://${n.address}:${PORT}  (same Wi-Fi)`);
  console.log('  Stop:    Ctrl+C\n');
});
