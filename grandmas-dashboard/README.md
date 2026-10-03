# Grandma's Dashboard

Grandma's owner dashboard: what to bake today, supplies to order and local marketing. React + Vite + Tailwind, first designed in Figma Make.

It uses the same database as [Grandma's Till](../grandmas-till/), kept in the shared [`data/`](../data/) folder, so every sale rung up on the till shows up here.

## Run it

You need Node 22.13 or newer and three terminals.

```bash
# terminal 1: the till, which fills the database and takes new orders
cd grandmas-till && node server.js

# terminal 2: the forecasts, remade every day and every Sunday evening
cd demand-pred && node forecast.js --watch

# terminal 3: the dashboard
cd grandmas-dashboard
npm install
npm run dev
```

Then open <http://localhost:3001>.

## Where the data comes from

| Request | Answered by |
|---|---|
| `GET /api/sales`, `/api/members`, `/api/health` | This project's dev server, straight from `../data` |
| `GET /api/forecast/rolling`, `/api/forecast/weekly`, `/api/forecast/day?day=YYYY-MM-DD` | This project's dev server, from `../data/forecast.db`, which [demand-pred](../demand-pred/) writes |
| Everything else under `/api` (new orders, status changes, menu, live events) | The till server on port 3000 (change with `TILL_URL=...`) |

Call these through [`src/api.ts`](src/api.ts), which has the types and a `subscribe()` helper for live updates:

```ts
import { api, subscribe } from "./api";

const sales = await api.sales({ liveOnly: true });
const stop = subscribe({ sale: (s) => console.log("new sale", s.total) });
```

## What still needs wiring

Today, Bake, Week plan, Past days and Order read real forecasts. Without demand-pred running, they show how to start it. Marketing and New order still use placeholder data at the top of `src/App.tsx` (`partners`, `menu`). Replace those with calls to `src/api.ts`. If you need data the API doesn't have yet, add the endpoint to `grandmas-till/server.js`.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Dev server on port 3001 with hot reload |
| `npm run build` | Production build into `dist/` |
| `npm run typecheck` | TypeScript check |
