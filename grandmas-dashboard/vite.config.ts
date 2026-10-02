import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { createRequire } from 'node:module'

/* The dashboard shares the database in ../data with Grandma's Till.
   - Reads (GET /api/health, /api/sales, /api/members) come straight from ../data, so they work even when the till is off.
   - Forecasts (GET /api/forecast/rolling, /api/forecast/weekly) come from ../data/forecast.db, which demand-pred writes.
   - Everything else under /api (new orders, status changes, the menu, live events) goes to the till server,
     which checks prices, numbers orders and tells every open screen. Start it with `cd ../grandmas-till && node server.js`. */
const TILL_URL = process.env.TILL_URL || 'http://localhost:3000'

function sharedData(): Plugin {
  return {
    name: 'shared-data',
    apply: 'serve',
    configureServer(server) {
      const require = createRequire(import.meta.url)
      const store = require('../data/db.js').open()
      const forecasts = require('../data/forecasts.js').open()
      const send = (res: import('node:http').ServerResponse, body: unknown) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        res.end(JSON.stringify(body))
      }
      server.middlewares.use((req, res, next) => {
        if (req.method !== 'GET') return next()
        const url = new URL(req.url || '/', 'http://localhost')
        if (url.pathname === '/api/health') return send(res, { ok: true, store: store.kind, file: store.file })
        if (url.pathname === '/api/members') return send(res, store.listMembers())
        if (url.pathname === '/api/forecast/rolling' || url.pathname === '/api/forecast/weekly') {
          const body = url.pathname.endsWith('rolling') ? forecasts.rolling() : forecasts.weekly()
          if (!body) res.statusCode = 404
          return send(res, body ?? { error: 'No forecast yet. Start it with: cd demand-pred && node forecast.js --watch' })
        }
        if (url.pathname === '/api/sales') {
          const src = url.searchParams.get('src')
          return send(res, store.listSales(Number(url.searchParams.get('since')) || 0, src === 'live' || src === 'till'))
        }
        next()
      })
    },
  }
}

// Vite config — https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), sharedData()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: true,
    port: Number(process.env.PORT) || 3001,
    strictPort: true,
    proxy: {
      '/api': { target: TILL_URL, changeOrigin: true },
    },
  },
})
