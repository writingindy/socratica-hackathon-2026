# Grandma's Till

A point-of-sale system for a parfait and pastry shop, with two screens on one database:

- **Counter** (`/counter`), for Grandma: ring up sales, work through the order queue, take payment, see today's takings.
- **Order** (`/order`), for customers: browse the menu, order, pay by card or at the counter, and watch for their number.

An order placed on either screen is saved the moment it is placed and appears on every other open screen within a second. The dashboard lives in a separate project and reads the same database.

## Run it

```bash
node server.js
```

Then open <http://localhost:3000> and pick a screen. That is the whole setup: there is nothing to install.

- Needs Node 18 or newer (`node --version`). The pages need the server; they do not work opened as plain files.
- On Node 22.13+ the store is SQLite at `data/till.db`. On older Node the same records go to `data/till.json`. The startup line says which one you got.
- The server prints a `Phones:` address. Open `/order` on a phone on the same Wi-Fi and `/counter` on a laptop.
- `npm run dev` restarts the server whenever `server.js` changes.
- `npm run reset` wipes the database and starts fresh.
- `PORT=4000 node server.js` uses another port.

On start the server seeds six weeks of simulated sales and 40 sample members, so the dashboard has history to work with. The POS screens show only today's real orders.

## Get the code

This project lives in the [socratica-hackathon-2026](https://github.com/writingindy/socratica-hackathon-2026) repository alongside the other hackathon projects. Don't run `git init` in this folder: commit and push from the repository as a whole.

Ask the repository owner to add you under **Settings → Collaborators**, then:

```bash
git clone https://github.com/writingindy/socratica-hackathon-2026.git
cd socratica-hackathon-2026/grandmas-till
node server.js
```

Everyone gets their own local database, because `data/` is ignored by git.

## How an order moves

| Placed from | Name given? | Starts as | Then |
|---|---|---|---|
| Counter | no | `done` | Handed over on the spot |
| Counter | yes | `new` | Goes to the Orders queue |
| Order screen | always | `new` | Goes to the Orders queue |

In the queue Grandma taps **Mark ready** (`new` → `ready`), then **Handed over** (`ready` → `done`). Customers who chose "pay at the counter" have `pay = 'pending'`; the server will not let an order be handed over until Grandma takes cash or card for it. Each order gets a number, starting at 1 every day, which the customer screen shows and updates live.

## What is where

| File | What it does | Change it when |
|---|---|---|
| `server.js` | HTTP server, REST API, database, live push | adding endpoints or changing storage |
| `public/core.js` | Menu, prices and the sales simulator. Loaded by the pages **and** the server | changing the menu or prices |
| `public/shared.js` | DOM helpers and the live link to the server, used by both screens | changing how screens talk to the API |
| `public/counter.html`, `counter.js` | Grandma's screen: Ring up, Orders, Today | changing the counter |
| `public/order.html`, `order.js` | The customer screen: menu, checkout, order status | changing the customer flow |
| `public/index.html` | Start page that links to both screens | |
| `public/style.css` | All styling, light and dark | changing how it looks |
| `data/` | The database. Created on first run, never committed | never by hand |

## API

| Method and path | Does |
|---|---|
| `GET /api/health` | Says the server is up and which store it uses |
| `GET /api/menu` | Menu items and prices |
| `GET /api/sales` | Every order, including simulated history. `?src=live` leaves out simulated history; `?since=<ms timestamp>` only returns orders from then on |
| `POST /api/sales` | Places an order. The server sets the time, prices, order number and status |
| `PATCH /api/sales/:id` | Moves an order along: `{"status":"ready"}`, `{"status":"done"}`, or takes payment with `{"pay":"cash"}` / `{"pay":"card"}` |
| `DELETE /api/sales` | Removes every non-simulated order, keeps simulated history |
| `GET /api/members` | Every member |
| `POST /api/members` | Signs up a member. Body: `{"name":"Rosa"}` |
| `GET /api/events` | Live stream of `sale`, `update`, `member` and `clear` events (server-sent events) |

`POST /api/sales` body:

```json
{"lines":[{"id":"croissant","q":2}], "pay":"card", "src":"kiosk", "name":"Rosa", "m":"m1004"}
```

- `pay`: `card`, `cash`, or `pending` (pay at the counter, which needs a `name`).
- `src`: `kiosk` for the customer screen, otherwise `till`. Kiosk orders need a `name`.
- `name`: optional from the counter. If it's there, the order goes to the queue.
- `m`: optional member id.
- `id`: optional, from the client. Sending the same id twice returns the order already saved instead of making a second one.

Try it without the page:

```bash
curl -X POST localhost:3000/api/sales -H 'Content-Type: application/json' \
  -d '{"lines":[{"id":"latte","q":1}],"pay":"pending","src":"kiosk","name":"Rosa"}'
```

## Database

Three tables. The dashboard reads the same ones.

```sql
sales      (id, ts, total, pay, member_id, src, order_no, name, status)
           -- one row per order
           -- pay: card | cash | pending        src: sim | till | kiosk
           -- status: new | ready | done        order_no restarts at 1 each day
sale_lines (sale_id, item_id, qty, price)       -- one row per item on an order
members    (id, num, name, joined, sample)
```

A database made by the earlier version gets `order_no`, `name` and `status` added in place on start. Older rows count as `done`.

For revenue, leave out `pay = 'pending'`, since that money hasn't been taken yet.

```bash
sqlite3 data/till.db "SELECT order_no, name, status, pay, total FROM sales WHERE src <> 'sim' ORDER BY ts DESC LIMIT 10;"
sqlite3 data/till.db "SELECT src, COUNT(*), ROUND(SUM(total), 2) FROM sales WHERE pay <> 'pending' GROUP BY src;"
```

## Two-minute demo

1. Open **Order** on a phone and **Counter** on a laptop.
2. **Phone:** add a parfait and a latte, check out as "Rosa" with member number `1004`, and choose *At the counter*. The phone shows order #1, "being made".
3. **Laptop:** a toast announces the order, and it appears under **Orders → To make**. Tap *Mark ready*. The phone switches to "Ready" straight away.
4. **Laptop:** tap *Took cash · hand over*. The phone says "Enjoy!", and **Today** shows the cash.
5. **Ring up** a croissant at the counter with no name: it's saved and handed over at once. Add a name instead and it joins the queue.
6. *Simulate 3 customers* on the Orders tab fills the queue for a busier demo.

## Working as a team

Split by file so two people rarely touch the same lines.

| Lane | Owns | Typical work |
|---|---|---|
| Backend | `server.js` | endpoints, storage, deployment |
| Counter | `public/counter.*` | Grandma's screens |
| Customer | `public/order.*` | ordering and status |
| Shared | `public/core.js`, `public/shared.js`, `public/style.css` | menu, API link, look. Tell the others before changing these |
| Pitch | `README.md` | demo script, description |

Rules that keep a short hackathon moving:

- `main` always runs. Before you push, start the server and place one order from each screen.
- Pull before you start anything: `git pull --rebase`.
- Small commits, pushed often. For anything risky use a short branch (`git switch -c till/kiosk-tweak`; branch names start with the project name) and merge it within the hour.
- If you need to change a file in someone else's lane, tell them first. That one habit prevents most merge conflicts.
- One laptop is the demo machine. Stop changing it 20 minutes before the deadline and rehearse on it.

## Putting it online

Any host that runs Node works. Point it at this repository, set its **Root Directory** to `grandmas-till`, and use the start command `node server.js`; the server reads the port from `PORT`. On many free tiers the disk is wiped on restart, so orders would be lost while the sample history reseeds itself.

## Not built yet

- **Logins.** Anyone who can reach `/counter` can use it.
- **Cancelling or refunding** an order.
- **Marking items sold out** so they disappear from the customer screen.
- **Real card payments.** The card reader on the customer screen is simulated.

## What is simulated

The menu, prices, six weeks of sales history and the 40 sample members are sample data. Card payments on the customer screen are a short animation; no card is charged.
