# grandmas-dashboard

Grandma's owner dashboard: React 19 + Vite + Tailwind CSS v4, written in TypeScript. Originally exported from Figma Make.

## Data

- This project has **no database of its own**. It shares the one in `../data` with Grandma's Till. See `../data/README.md` for the tables.
- Talk to it only through `src/api.ts`. Add a function there rather than calling `fetch` from components.
- Reads (`GET /api/health`, `/api/sales`, `/api/members`) are served by this project's Vite dev server straight from `../data/db.js`.
- Forecasts (`GET /api/forecast/rolling`, `/api/forecast/weekly`) are served the same way from `../data/forecasts.js`, which reads `../data/forecast.db`. `demand-pred` writes that file; the dashboard never does. Both return 404 until `cd ../demand-pred && node forecast.js --watch` has run.
- Writes, the menu and live events are proxied to the till server at `http://localhost:3000` (override with `TILL_URL`). Start it with `cd ../grandmas-till && node server.js`.
- New write endpoints go in `grandmas-till/server.js`, so prices and order numbers are checked in one place. Agree it with whoever owns that file first.

## Project structure

- `src/main.tsx` - React entrypoint; mounts `src/App.tsx` into `#root`
- `src/App.tsx` - the dashboard screens (Today, Bake, Week plan, Order, Trends, Marketing, New order). Today, Bake, Week plan and Order use real forecasts; Today also shows live takings and the till's waiting orders. Trends is worked out from the last four weeks of sales and order notes. New order uses the till's menu and places real orders through it. Marketing (`partners`) and the weather on Today are still placeholders
- `src/api.ts` - typed client for the till API, plus `subscribe()` for live updates
- `src/index.css` - all styling; imports Tailwind
- `vite.config.ts` - Vite config: dev port 3001, reads from `../data`, `/api` proxy to the till

## Code quality

- Use double quotes for strings containing apostrophes (`"We're here to help"`), or escape them in single-quoted strings.
- Export components as default exports.
- Run `npm run typecheck` and `npm run build` before pushing.
