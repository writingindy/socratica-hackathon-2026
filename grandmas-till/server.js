#!/usr/bin/env node
'use strict';
/* Grandma's Till: local server. No dependencies: `node server.js`.
   Serves the counter and customer order screens from /public, stores every order in the shared
   database in ../data, and pushes each new or updated order to every open screen. */
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const core = require('./public/core.js');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname, 'public');

/* ---------- storage: the shared database in ../data, also read by grandmas-dashboard ---------- */
const store = require('../data/db.js').open({ reset: process.argv.includes('--reset') });

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
/* never trust the client for prices, time or order numbers: the server looks up the menu, stamps the sale and numbers it.
   An order with a name goes to the make queue (status new); a counter sale without one is handed over on the spot (done). */
const STATUSES = ['new', 'ready', 'done'];
function cleanSale(b) {
  if (!b || !Array.isArray(b.lines)) throw bad('lines must be a list of {id, q}');
  const lines = [];
  for (const l of b.lines.slice(0, 20)) { const it = core.MENU[core.IDX[l && l.id]], q = Math.floor(Number(l && l.q)); if (it && q >= 1 && q <= 50) lines.push({ id: it.id, q, p: it.price }); }
  if (!lines.length) throw bad('no valid lines');
  const id = typeof b.id === 'string' && /^[A-Za-z0-9_-]{6,40}$/.test(b.id) ? b.id : 's' + crypto.randomBytes(8).toString('hex');
  const src = b.src === 'kiosk' ? 'kiosk' : 'till', name = typeof b.name === 'string' ? b.name.trim().slice(0, 30) : '';
  if (src === 'kiosk' && !name) throw bad('kiosk orders need a name to call out');
  const pay = b.pay === 'cash' ? 'cash' : b.pay === 'pending' ? 'pending' : 'card';
  if (pay === 'pending' && !name) throw bad('an order paid later needs a name');
  const ts = Date.now();
  return { id, ts, lines, total: core.saleTotal(lines), pay, m: typeof b.m === 'string' && b.m.length <= 40 ? b.m : null, src, no: store.nextOrderNo(core.startOfDay(ts)), name: name || null, status: name ? 'new' : 'done' };
}
/* Grandma moves an order along the queue and takes payment for pay-at-counter orders */
function patchSale(cur, b) {
  const status = b.status === undefined ? cur.status : b.status;
  if (!STATUSES.includes(status)) throw bad('status must be new, ready or done');
  let pay = cur.pay;
  if (b.pay !== undefined) {
    if (cur.pay !== 'pending') throw bad('this order is already paid');
    if (b.pay !== 'card' && b.pay !== 'cash') throw bad('pay must be card or cash');
    pay = b.pay;
  }
  if (status === 'done' && pay === 'pending') throw bad('take payment before handing the order over');
  return { ...cur, status, pay };
}
async function api(req, res, url) {
  const route = req.method + ' ' + url.pathname;
  if (route === 'GET /api/health') return send(res, 200, { ok: true, store: store.kind, file: store.file });
  if (route === 'GET /api/menu') return send(res, 200, core.MENU.map(({ id, name, cat, price, fresh }) => ({ id, name, cat, price, fresh: !!fresh })));
  if (route === 'GET /api/sales') { const src = url.searchParams.get('src'); return send(res, 200, store.listSales(Number(url.searchParams.get('since')) || 0, src === 'live' || src === 'till')); }
  if (route === 'POST /api/sales') {
    const sale = cleanSale(await readBody(req));
    if (store.addSale(sale)) { broadcast('sale', sale); return send(res, 201, sale); }
    return send(res, 200, store.getSale(sale.id)); /* same id sent twice, e.g. a retry: return the order already saved */
  }
  const one = /^\/api\/sales\/([A-Za-z0-9_-]{1,60})$/.exec(url.pathname);
  if (one && req.method === 'PATCH') {
    const cur = store.getSale(one[1]); if (!cur) return send(res, 404, { error: 'no such order' });
    const next = patchSale(cur, await readBody(req));
    store.setState(next.id, next.status, next.pay); broadcast('update', next); return send(res, 200, next);
  }
  if (route === 'DELETE /api/sales') { const removed = store.clearTill(); broadcast('clear', { removed }); return send(res, 200, { removed }); }
  if (route === 'GET /api/members') return send(res, 200, store.listMembers());
  if (route === 'POST /api/members') {
    const b = await readBody(req), name = typeof b.name === 'string' ? b.name.trim().slice(0, 40) : '';
    if (!name) throw bad('name is required');
    const m = { id: typeof b.id === 'string' && /^[A-Za-z0-9_-]{6,40}$/.test(b.id) ? b.id : 'm' + crypto.randomBytes(6).toString('hex'), num: store.nextNum(), name, joined: Date.now(), sample: 0 };
    store.addMembers([m]); broadcast('member', m); return send(res, 201, m);
  }
  if (route === 'GET /api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write('retry: 2000\n\n'); clients.add(res); req.on('close', () => clients.delete(res)); return;
  }
  send(res, 404, { error: 'no such route' });
}

/* ---------- static files ---------- */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8' };
function serveStatic(req, res, url) {
  let rel; try { rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname); } catch (e) { res.writeHead(400); return res.end(); }
  if (!path.extname(rel)) rel += '.html'; /* /counter serves counter.html */
  const file = path.join(PUBLIC, path.normalize(rel));
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
  console.log(`  Counter: http://localhost:${PORT}/counter   (Grandma)`);
  console.log(`  Order:   http://localhost:${PORT}/order     (customers)`);
  for (const list of Object.values(os.networkInterfaces())) for (const n of list || []) if (n.family === 'IPv4' && !n.internal) console.log(`  Phones:  http://${n.address}:${PORT}  (same Wi-Fi)`);
  console.log('  Stop:    Ctrl+C\n');
});
