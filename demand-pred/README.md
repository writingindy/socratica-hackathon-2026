# demand-pred

Once a week this reads every sale from the shared till database (`data/till.db`) and forecasts the next 7 days, item by item. It turns that forecast into a daily bake plan and a one-trip shopping list, and saves all of it to its own database together with a plain-text note for Grandma.

It only reads the till's database and never writes to it. There is no frontend.

## Run it

```bash
cd demand-pred
node forecast.js            # make a weekly plan now (7 days from tomorrow), print the note, save it
node forecast.js --rolling  # make a rolling forecast now (7 days from today)
node forecast.js --backfill 28   # fill past days that have no forecast (see below)
node forecast.js --watch    # stay running: a weekly plan every Sunday at 5 pm, a rolling forecast every day
node forecast.js --note     # print the latest saved note
node forecast.js --pantry flour=2 butter=4.5   # record what is already on the shelf, in packs
```

- Needs Node 22.13 or newer, for built-in SQLite. There is nothing to install.
- The till needs to have run at least once (`cd grandmas-till && node server.js`) so `data/till.db` exists. It needs 14 days of sales to forecast and about 5 weeks before it can score itself.
- Results go to `data/forecast.db`, next to the till's database, so the dashboard can read both from one place. Git ignores it.

| Setting | Default | |
|---|---|---|
| `TILL_DB` | `../data/till.db` | Where the sales are read from |
| `FORECAST_DB` | `../data/forecast.db` | Where plans are written |
| `PLAN_DAY` | `0` | Day of the weekly plan, 0 = Sunday … 6 = Saturday |
| `PLAN_HOUR` | `17` | Hour of the weekly plan, 0–23 |

There are two kinds of run, told apart by `forecast_runs.kind`:

- **weekly** is the shopping plan: the 7 days from the day after it's made, plus the shopping list and the note. It's made once a week.
- **rolling** is the 7 days from today, made fresh each day, so a screen can always show a week that starts today.

**Backfill.** A day before demand-pred was first started has no forecast. `--backfill` works out the rolling forecast each of those days would have had that morning. It uses only the sales from before the day, so it never sees the answer. These runs are saved with `reason = 'backfill'` and `created` set to the start of that day. `--watch` fills the last 28 days by itself when it starts. Days that already have a forecast are left alone.

`--watch` checks every 10 minutes. If the server was off at plan time, it makes the plan as soon as it starts again. A run made by hand after the last plan time counts as that week's plan.

## What it saves

Each run adds rows to three tables. Older runs are kept, so you can compare a forecast with what actually sold.

```sql
forecast_runs    (id, created, reason, week_start, week_end, history_start, history_end, sales_lines, method,
                  fresh_units, drink_units, expected_revenue, supplies_cost,
                  bt_weeks, bt_item_err, bt_naive_err, bt_covered, note)
demand_forecasts (run_id, day, weekday, item_id, item_name, made_ahead, forecast, low, high, make_qty)
supply_orders    (run_id, ingredient_id, name, aisle, unit, need, on_hand_packs, packs, pack_name, pack_size,
                  cost, buy_now, buy_later, buy_later_day)
pantry           (ingredient_id, packs, updated)   -- set with --pantry, read by the next run
```

- `demand_forecasts` has one row per item per day. `low` and `high` give a range that should hold about 8 days in 10. `make_qty` is how many to bake that day. It is empty for drinks, which are made to order.
- `supply_orders` has one row per ingredient. `packs` is how many to buy after taking off what is in the pantry. If an ingredient spoils within the week (fresh strawberries keep 4 days), `buy_now` and `buy_later` split the purchase and `buy_later_day` says when to buy the rest.
- `forecast_runs.note` is the message for Grandma.

### Reading it from a frontend

These views always point at the newest run, so a frontend doesn't have to look up a run id first. From Node, [`data/forecasts.js`](../data/forecasts.js) wraps them; [grandmas-dashboard](../grandmas-dashboard/) uses it.

| View | Gives | Ordered by |
|---|---|---|
| `latest_run` | The newest weekly plan: the week covered, totals, accuracy and Grandma's note | – |
| `latest_demand_forecasts` | That plan's 7 days × every item | day, then made-ahead items first, then name |
| `latest_supply_orders` | That plan's shopping list | aisle, as listed in `catalog.js` |
| `rolling_run` | The newest rolling forecast | – |
| `rolling_forecasts` | Its 7 days, from the day it was made, × every item | day, then made-ahead items first, then name |

```bash
sqlite3 ../data/forecast.db "SELECT note FROM latest_run;"
sqlite3 -column ../data/forecast.db "SELECT name, packs, pack_name, cost FROM latest_supply_orders WHERE packs > 0;"
```

- Open the database read-only. It runs in WAL mode, so a reader can read while a new plan is being written, and it sees each plan only once all of its rows are saved.
- For past weeks, use the tables directly and filter by `run_id`.
- Days are local `YYYY-MM-DD` strings and `created` is milliseconds since the epoch. Money is CAD.
- `PRAGMA user_version` holds the schema version, which is `2` (version 2 added `kind`). Older databases are upgraded in place when demand-pred starts.

## How the forecast works

| Step | Rule |
|---|---|
| History | Units sold per item per day, from every complete day in the till database. Today's partial day is left out |
| Daily forecast | Average of the last 6 same weekdays, with each older week counting 0.8 as much, then nudged by half the change between the last two fortnights |
| Typical miss (σ) | Root mean square error of the last 14 one-day-ahead forecasts, per item |
| Bake amount | Forecast + 0.5σ, rounded up. This is the same rule as the till's bake sheet |
| Drinks | Weekly forecast + 1.28σ√7, enough about 9 weeks in 10 |
| Ingredients | Units to make × the recipe in `catalog.js`, summed over the week |
| Shopping list | Need minus what is in the pantry, rounded up to whole packs |
| Self-check | Replays the method on past weeks. Each week is forecast from the data before it, then compared with what sold and with simply copying the previous week |

On the till's six weeks of simulated sales, the weekly total for an item is off by about 12%. Copying the previous week does about as well, because the simulated sales are mostly random noise around a steady level. The method's value is the day-by-day split, which a weekly copy can't give. The bake amounts covered what sold in about 86% of item-weeks.

## Changing it

| File | What it holds |
|---|---|
| `catalog.js` | Menu items, ingredients, pack sizes, prices, shelf life and recipes. All are sample figures, so edit them to match Grandma's suppliers |
| `model.js` | The forecast, backtest, shopping-list maths and the note. No I/O |
| `forecast.js` | Reads the till, writes the forecast database, runs the weekly schedule and the command line |

When the till adds a menu item, add it to `ITEMS` and `RECIPES` in `catalog.js`. Until then it is still forecast under its id, but it adds nothing to the shopping list.
