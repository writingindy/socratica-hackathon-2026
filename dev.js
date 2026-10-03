#!/usr/bin/env node
'use strict';
/* One command for the whole shop: `npm run dev` from the repository root.
   1. grandmas-till    the till server; creates and seeds the shared database in data/   http://localhost:3000
   2. demand-pred      the forecaster; waits for the database, then keeps forecasts fresh
   3. grandmas-dashboard  Grandma's dashboard (Vite)                                       http://localhost:3001
   The till restarts by itself when its code changes. Ctrl+C stops all three. */
const { spawn, spawnSync } = require('child_process'), path = require('path'), fs = require('fs'), http = require('http');

const ROOT = __dirname, TILL_PORT = Number(process.env.TILL_PORT) || 3000, DASH_PORT = Number(process.env.DASH_PORT) || 3001;
const COLORS = { till: 35, forecast: 33, dashboard: 36, dev: 32 };
const say = (name, line) => process.stdout.write(`\x1b[${COLORS[name]}m${name.padEnd(9)}\x1b[0m │ ${line}\n`);

/* the dashboard is the only app with dependencies: install them the first time */
if (!fs.existsSync(path.join(ROOT, 'grandmas-dashboard', 'node_modules'))) {
  say('dev', 'Installing the dashboard\'s packages (first run only)…');
  const r = spawnSync('npm', ['install'], { cwd: path.join(ROOT, 'grandmas-dashboard'), stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) { say('dev', 'npm install failed in grandmas-dashboard. Fix that, then run npm run dev again.'); process.exit(1); }
}

const children = new Map();
let stopping = false;
function start(name, cwd, cmd, args, env) {
  const child = spawn(cmd, args, { cwd: path.join(ROOT, cwd), env: { ...process.env, ...env }, shell: process.platform === 'win32' });
  children.set(name, child);
  for (const stream of [child.stdout, child.stderr]) {
    let rest = '';
    stream.on('data', d => { const lines = (rest + d).split('\n'); rest = lines.pop(); for (const l of lines) if (l.trim()) say(name, l); });
  }
  child.on('exit', code => { children.delete(name); if (!stopping) { say('dev', `${name} stopped (exit ${code}). Stopping the others.`); stop(code || 1); } });
}
function stop(code = 0) {
  if (stopping) return; stopping = true;
  for (const c of children.values()) c.kill('SIGTERM');
  setTimeout(() => process.exit(code), 1500).unref();
  const check = setInterval(() => { if (!children.size) { clearInterval(check); process.exit(code); } }, 50);
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

/* the forecaster and the dashboard need the database the till creates, so wait until it answers */
function waitForTill(tries = 120) {
  return new Promise((resolve, reject) => {
    const attempt = n => http.get({ host: '127.0.0.1', port: TILL_PORT, path: '/api/health', timeout: 1000 }, res => { res.resume(); res.statusCode === 200 ? resolve() : retry(n); }).on('error', () => retry(n));
    const retry = n => (n <= 0 || stopping ? reject(new Error('the till did not start')) : setTimeout(() => attempt(n - 1), 250));
    attempt(tries);
  });
}

say('dev', 'Starting Grandma\'s Till, then demand-pred and the dashboard. Ctrl+C stops everything.');
start('till', 'grandmas-till', process.execPath, ['--watch', 'server.js'], { PORT: String(TILL_PORT) });
waitForTill().then(() => {
  start('forecast', 'demand-pred', process.execPath, ['forecast.js', '--watch']);
  start('dashboard', 'grandmas-dashboard', 'npx', ['vite', '--port', String(DASH_PORT), '--strictPort'], { TILL_URL: `http://localhost:${TILL_PORT}` });
  setTimeout(() => {
    if (stopping) return;
    say('dev', `Ready.  Counter http://localhost:${TILL_PORT}/counter  ·  Customer http://localhost:${TILL_PORT}/order  ·  Dashboard http://localhost:${DASH_PORT}`);
  }, 2500);
}, e => { say('dev', `${e.message}. Is port ${TILL_PORT} already in use?`); stop(1); });
