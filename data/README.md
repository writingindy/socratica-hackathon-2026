# data

The one database every project in this repository shares. [grandmas-till](../grandmas-till/) writes to it, and [grandmas-dashboard](../grandmas-dashboard/) reads from it.

| File | What it is |
|---|---|
| `db.js` | Opens the database and gives you `listSales`, `addSale`, `listMembers` and the rest. No dependencies |
| `till.db` | The SQLite database, created the first time the till starts. Not committed: everyone has their own |
| `till.json` | Used instead of `till.db` on Node older than 22.13 |
| `forecasts.js` | Read-only access to `forecast.db`: `rolling()` for the 7 days from today, `weekly()` for the weekly plan and shopping list, `forDay(day)` for what was forecast for any past day |
| `forecast.db` | Demand forecasts and shopping lists, written by [demand-pred](../demand-pred/). Not committed |

## Use it from a project

```js
const store = require('../data/db.js').open();
store.listSales(0, true);   // every real sale, without the simulated history
store.listMembers();
```

Only the till server adds sales and members, because it checks prices, numbers each order and pushes it to every open screen. Other projects read here directly and send writes to the till's API (`POST /api/sales`, `PATCH /api/sales/:id`, `POST /api/members`).

## Tables

```sql
sales      (id, ts, total, pay, member_id, src, order_no, name, status)
           -- src: sim (simulated history), till, kiosk.  status: new, ready, done.  pay: card, cash, pending
sale_lines (sale_id, item_id, qty, price)   -- one row per item on a sale
members    (id, num, name, joined, sample)
```

Item ids such as `croissant` or `p_matcha` refer to the menu in `grandmas-till/public/core.js`, also served at `GET /api/menu`.

Look inside while things run (needs the `sqlite3` command line tool):

```bash
sqlite3 data/till.db "SELECT item_id, SUM(qty) AS sold FROM sale_lines GROUP BY item_id ORDER BY sold DESC;"
```

Start fresh with `cd grandmas-till && npm run reset`.

Changing a table changes it for every project, so tell the team first.
