import { useEffect, useMemo, useState } from "react";
import { api, subscribe, type DayForecast, type MenuItem, type RollingForecast, type Sale, type SupplyLine, type WeeklyPlan } from "./api";

type Page = "today" | "bake" | "plan" | "order" | "flavors" | "marketing" | "counter";

const pages: { id: Page; label: string; icon: string }[] = [
  { id: "today", label: "Today", icon: "home" },
  { id: "bake", label: "Bake", icon: "bake" },
  { id: "plan", label: "Week plan", icon: "calendar" },
  { id: "order", label: "Order", icon: "box" },
  { id: "flavors", label: "Trends", icon: "spark" },
  { id: "marketing", label: "Marketing", icon: "heart" },
];

const partners = [
  { name: "Campus library", walk: "6 minute walk", reason: "Students study for hours.", kind: "books" },
  { name: "Community rec centre", walk: "10 minute walk", reason: "Parents wait during practice.", kind: "ball" },
  { name: "Yoga studio on Main", walk: "4 minute walk", reason: "A sweet treat after class.", kind: "sun" },
];

/* menu card colours, in menu order */
const TONES = ["pink", "yellow", "blue", "green", "red", "cream"];
/* an item counts as rising or fading when its last two weeks differ from the two before by this much */
const TREND_STEP = 0.15;

/* ----- dates: forecasts use local "YYYY-MM-DD" day keys ----- */
const DAY_MS = 86400000;
const dayKeyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parseDay = (key: string) => { const [y, m, d] = key.split("-").map(Number); return new Date(y, m - 1, d); };
const fmtDay = (key: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }) => parseDay(key).toLocaleDateString("en-CA", opts);
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
const money = (x: number) => x.toLocaleString("en-CA", { style: "currency", currency: "CAD" });
const money0 = (x: number) => x.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });
const fmtQty = (x: number, unit: SupplyLine["unit"]) => unit === "each" ? `${Math.round(x)}` : x >= 1000 ? `${(x / 1000).toFixed(x >= 10000 ? 0 : 1)} ${unit === "g" ? "kg" : "L"}` : `${Math.round(x)} ${unit}`;

/* forecast rows grouped by day, made-ahead items only */
type DayGroup = { day: string; items: DayForecast[]; make: number; forecast: number };
function groupByDay(rows: DayForecast[]): DayGroup[] {
  const map = new Map<string, DayGroup>();
  for (const r of rows) {
    if (!r.madeAhead) continue;
    const g = map.get(r.day) ?? { day: r.day, items: [], make: 0, forecast: 0 };
    g.items.push(r); g.make += r.make ?? 0; g.forecast += r.forecast; map.set(r.day, g);
  }
  return [...map.values()].sort((a, b) => a.day.localeCompare(b.day));
}

function Icon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    home: <><path d="M4 10.5 12 4l8 6.5V20h-5v-6H9v6H4Z" /></>,
    bake: <><path d="M5 18h14M7 18v-4c0-3 2-6 5-6s5 3 5 6v4M9 8c0-2 1-3 3-3s3 1 3 3" /></>,
    calendar: <><path d="M5 6h14v14H5ZM5 10h14M9 4v4M15 4v4" /></>,
    box: <><path d="m4 7 8-4 8 4-8 4ZM4 7v10l8 4 8-4V7M12 11v10" /></>,
    spark: <><path d="M12 2c.5 6 2.5 8 8 10-5.5 1.5-7.5 4-8 10-.8-6-2.8-8.5-8-10 5.2-1.5 7.2-4 8-10Z" /></>,
    heart: <><path d="M12 20S4 15.5 4 9.5C4 6 8.5 4 12 8c3.5-4 8-2 8 1.5 0 6-8 10.5-8 10.5Z" /></>,
    cart: <><path d="M3 5h2l2 10h10l2-7H6M9 20h.01M17 20h.01" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    back: <path d="M19 12H5m5-5-5 5 5 5" />,
  };
  return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function Button({
  children,
  onClick,
  variant = "primary",
  disabled = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "text";
  disabled?: boolean;
}) {
  return <button className={`button button-${variant}`} onClick={onClick} disabled={disabled}>{children}</button>;
}

function Status({ children, tone = "yellow" }: { children: React.ReactNode; tone?: string }) {
  return <span className={`status status-${tone}`}><i />{children}</span>;
}

function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return <header className="page-header"><div className="page-title">{title}</div><p>{subtitle}</p></header>;
}

/* shown until demand-pred has written a forecast */
function NoForecast({ what, error }: { what: string; error: string }) {
  return (
    <article className="empty-card">
      <span className="eyebrow">Nothing to show yet</span>
      <div className="row-title">No {what} yet</div>
      <p>{error || "The forecast service hasn't made one yet."} Start it in a terminal and this page fills in by itself:</p>
      <code>cd demand-pred && node forecast.js --watch</code>
    </article>
  );
}

/* how many to make of each item on each day */
function MakeTable({ rows, today }: { rows: DayForecast[]; today?: string }) {
  const days = groupByDay(rows);
  const items = [...new Map(days.flatMap((d) => d.items).map((r) => [r.itemId, r.itemName])).entries()]
    .map(([id, name]) => ({ id, name, week: days.reduce((t, d) => t + (d.items.find((r) => r.itemId === id)?.make ?? 0), 0) }))
    .sort((a, b) => b.week - a.week);
  return (
    <div className="plan-scroll">
      <table className="plan-table">
        <thead>
          <tr>
            <th>Item</th>
            {days.map((d) => <th key={d.day} className={d.day === today ? "is-today" : ""}>{fmtDay(d.day, { weekday: "short" })}<span>{parseDay(d.day).getDate()}</span></th>)}
            <th>Week</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id}>
              <td>{it.name}</td>
              {days.map((d) => { const r = d.items.find((x) => x.itemId === it.id); return <td key={d.day} className={d.day === today ? "is-today" : ""} title={r ? `Forecast ${Math.round(r.forecast)}, likely ${Math.round(r.low)} to ${Math.round(r.high)}` : ""}>{r?.make ?? "–"}</td>; })}
              <td><b>{it.week}</b></td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr><td>All</td>{days.map((d) => <td key={d.day} className={d.day === today ? "is-today" : ""}>{d.make}</td>)}<td>{days.reduce((t, d) => t + d.make, 0)}</td></tr>
        </tfoot>
      </table>
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState<Page>("today");
  const [now, setNow] = useState(Date.now());
  const [rolling, setRolling] = useState<RollingForecast | null>(null);
  const [weekly, setWeekly] = useState<WeeklyPlan | null>(null);
  const [forecastError, setForecastError] = useState({ rolling: "", weekly: "" });
  const [sales, setSales] = useState<Sale[]>([]);
  const [bakes, setBakes] = useState<{ id: string; name: string; amount: number; forecast: number; low: number; high: number }[]>([]);
  const [bakeApproved, setBakeApproved] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [orderSent, setOrderSent] = useState(false);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [featured, setFeatured] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [menuError, setMenuError] = useState("");
  const [selectedPartner, setSelectedPartner] = useState(0);
  const [sentPartners, setSentPartners] = useState<string[]>([]);
  const [outreach, setOutreach] = useState(true);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [pickup, setPickup] = useState("");
  const [payKind, setPayKind] = useState<"card" | "cash">("card");
  const [charging, setCharging] = useState(false);
  const [lastOrder, setLastOrder] = useState<Sale | null>(null);
  const [toast, setToast] = useState("");

  /* forecasts change at most once a day, so check every 10 minutes and whenever the tab comes back */
  useEffect(() => {
    const load = () => {
      setNow(Date.now());
      api.rollingForecast().then((r) => { setRolling(r); setForecastError((e) => ({ ...e, rolling: "" })); }, (e: Error) => setForecastError((x) => ({ ...x, rolling: e.message })));
      api.weeklyPlan().then((w) => { setWeekly(w); setForecastError((e) => ({ ...e, weekly: "" })); }, (e: Error) => setForecastError((x) => ({ ...x, weekly: e.message })));
    };
    load();
    const timer = window.setInterval(load, 10 * 60000);
    window.addEventListener("focus", load);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", load); };
  }, []);

  /* the last four weeks of sales, for "sold today" and the same-weekday history; new sales arrive live from the till */
  useEffect(() => {
    const load = () => api.sales({ since: startOfToday() - 28 * DAY_MS }).then(setSales, () => setSales([]));
    load();
    const add = (s: Sale) => setSales((current) => (current.some((x) => x.id === s.id) ? current : [...current, s]));
    const update = (s: Sale) => setSales((current) => current.map((x) => (x.id === s.id ? s : x)));
    try { return subscribe({ sale: add, update, clear: load }); } catch { return undefined; }
  }, []);

  /* the menu (names, prices, options) comes from the till, so the New order page sells exactly what the till sells */
  useEffect(() => {
    const load = () => api.menu().then((m) => { setMenu(m); setMenuError(""); }, (e: Error) => setMenuError(e.message));
    load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, []);

  const todayKey = dayKeyOf(new Date(now));
  const rollingRows = useMemo(() => (rolling ? rolling.forecasts.filter((r) => r.day >= todayKey) : []), [rolling, todayKey]);
  const rollingDays = useMemo(() => groupByDay(rollingRows), [rollingRows]);
  const todayPlan = rollingDays.find((d) => d.day === todayKey) ?? null;
  const rollingStale = !!rolling && rolling.run.weekStart < todayKey;

  /* today's bake list starts from the forecast; Grandma can still nudge it */
  useEffect(() => {
    if (!todayPlan) { setBakes([]); return; }
    setBakes(todayPlan.items.filter((r) => (r.make ?? 0) > 0).sort((a, b) => (b.make ?? 0) - (a.make ?? 0))
      .map((r) => ({ id: r.itemId, name: r.itemName, amount: r.make ?? 0, forecast: r.forecast, low: r.low, high: r.high })));
    setBakeApproved(false);
  }, [rolling?.run.id, todayKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /* the shopping list starts with everything that needs buying ticked */
  useEffect(() => {
    if (!weekly) return;
    setSelected(Object.fromEntries(weekly.supplies.map((s) => [s.id, s.packs > 0])));
    setOrderSent(false);
  }, [weekly?.run.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const madeAhead = useMemo(() => new Set((rolling?.forecasts ?? []).filter((r) => r.madeAhead).map((r) => r.itemId)), [rolling]);
  const todayStart = parseDay(todayKey).getTime();
  const todaySales = sales.filter((s) => s.ts >= todayStart);
  const soldToday = todaySales.reduce((t, s) => t + s.lines.reduce((n, l) => n + (madeAhead.has(l.id) ? l.q : 0), 0), 0);

  const names = useMemo(() => {
    const out = new Map<string, string>((rolling?.forecasts ?? []).map((r) => [r.itemId, r.itemName]));
    for (const m of menu) out.set(m.id, m.name);
    return out;
  }, [menu, rolling]);
  const nameOf = (id: string) => names.get(id) ?? id;

  /* today's takings, live: simulated sales stand in for the rest of the day's customers */
  const takings = todaySales.filter((s) => s.pay !== "pending").reduce((t, s) => t + s.total, 0);
  const unpaid = todaySales.filter((s) => s.pay === "pending").reduce((t, s) => t + s.total, 0);
  const discounts = todaySales.reduce((t, s) => t + (s.discount || 0), 0);
  const payCount = (p: Sale["pay"]) => todaySales.filter((s) => s.pay === p).length;
  const waiting = todaySales.filter((s) => s.src !== "sim" && s.status !== "done");

  /* what's selling: each item's last 14 full days against the 14 before, plus the notes customers left on their orders */
  const trends = useMemo(() => {
    const recentFrom = todayStart - 14 * DAY_MS, priorFrom = todayStart - 28 * DAY_MS;
    const by = new Map<string, { id: string; recent: number; prior: number; revenue: number; notes: { note: string; ts: number; who: string | null }[] }>();
    const get = (id: string) => { let t = by.get(id); if (!t) { t = { id, recent: 0, prior: 0, revenue: 0, notes: [] }; by.set(id, t); } return t; };
    for (const m of menu) get(m.id);
    for (const s of sales) {
      for (const l of s.lines) {
        const t = get(l.id);
        if (s.ts >= recentFrom && s.ts < todayStart) { t.recent += l.q; t.revenue += l.q * l.p; }
        else if (s.ts >= priorFrom && s.ts < recentFrom) t.prior += l.q;
        if (l.note) t.notes.push({ note: l.note, ts: s.ts, who: s.name });
      }
    }
    return [...by.values()].map((t) => {
      const change = t.prior ? (t.recent - t.prior) / t.prior : t.recent ? 1 : 0;
      const status = change >= TREND_STEP ? "Rising" : change <= -TREND_STEP ? "Fading" : "Steady";
      return { ...t, change, status, notes: t.notes.sort((a, b) => b.ts - a.ts) };
    }).sort((a, b) => b.recent - a.recent);
  }, [sales, menu, todayStart]);

  /* units sold on each of the last four same weekdays, newest first */
  const lastFour = useMemo(() => {
    const out: Record<string, number[]> = {};
    for (let w = 1; w <= 4; w++) {
      const from = todayStart - w * 7 * DAY_MS, to = from + DAY_MS;
      for (const s of sales) if (s.ts >= from && s.ts < to) for (const l of s.lines) { (out[l.id] ??= [0, 0, 0, 0])[w - 1] += l.q; }
    }
    return out;
  }, [sales, todayStart]);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  };

  const navigate = (next: Page) => {
    setPage(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const changeBake = (index: number, direction: number) => {
    setBakes((current) => current.map((item, i) => i === index ? { ...item, amount: Math.max(0, item.amount + direction) } : item));
    setBakeApproved(false);
  };

  const supplies = weekly?.supplies ?? [];
  const toBuy = supplies.filter((s) => s.packs > 0);
  const selectedSupplies = toBuy.filter((s) => selected[s.id]);
  const orderTotal = selectedSupplies.reduce((total, item) => total + item.cost, 0);
  const bakeTotal = bakes.reduce((total, item) => total + item.amount, 0);
  const cartRows = menu.filter((item) => cart[item.id]).map((item) => ({ ...item, quantity: cart[item.id] }));
  const cartTotal = cartRows.reduce((total, item) => total + item.price * item.quantity, 0);
  const selectedPartnerData = partners[selectedPartner];
  const draft = `Hi! We're Grandma's Bakeria, a ${selectedPartnerData.walk.toLowerCase()} from ${selectedPartnerData.name}. Bring your group in this week for a free Fall Parfait tasting. Hope to see you. — Grandma`;
  const weekdayName = parseDay(todayKey).toLocaleDateString("en-CA", { weekday: "long" });

  /* orders go through the till, which prices them, numbers them and puts named ones in its make queue */
  const chargeOrder = async () => {
    if (charging || !cartRows.length) return;
    setCharging(true);
    try {
      const o = await api.addSale({
        id: "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        lines: cartRows.map((r) => ({ id: r.id, q: r.quantity })),
        pay: payKind,
        name: pickup.trim() || undefined,
      });
      setCart({}); setPickup(""); setLastOrder(o);
      showToast(o.status === "new" ? `Order #${o.no} for ${o.name} is in the till's queue.` : `Order #${o.no} saved: ${money(o.total)} by ${o.pay}.`);
    } catch (e) {
      showToast(`Not saved: ${(e as Error).message}. Is the till running?`);
    }
    setCharging(false);
  };

  const renderScreen = () => {
    if (page === "bake") {
      return (
        <>
          <PageHeader title="Bake today" subtitle="From the forecast for today. Use the big + and − buttons to change any amount." />
          {!rolling ? <NoForecast what="forecast" error={forecastError.rolling} /> : (
            <>
              {rollingStale && <p className="stale-note">This forecast was made {fmtDay(rolling.run.weekStart, { weekday: "long", month: "short", day: "numeric" })}. A new one is made every day while the forecast service runs.</p>}
              {bakes.length === 0 ? <NoForecast what="forecast for today" error="" /> : (
                <div className="bake-list">
                  {bakes.map((item, index) => {
                    const past = lastFour[item.id];
                    return (
                      <article className="bake-row" key={item.id}>
                        <div className={`food-mark food-mark-${index % 3}`}><span>{item.name.charAt(0)}</span></div>
                        <div className="bake-info">
                          <div className="row-title">{item.name}</div>
                          <p>Forecast {Math.round(item.forecast)} sold, likely {Math.round(item.low)} to {Math.round(item.high)}. The amount adds a small margin.</p>
                          <div className="chips">{past && <span>Last 4 {weekdayName}s: {past.join(", ")}</span>}</div>
                        </div>
                        <div className="stepper">
                          <button onClick={() => changeBake(index, -1)} aria-label={`Bake fewer ${item.name}`}>−</button>
                          <b>{item.amount}</b>
                          <button onClick={() => changeBake(index, 1)} aria-label={`Bake more ${item.name}`}>+</button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
              <div className="action-footer">
                <div><span>Total to bake</span><b>{bakeTotal}</b></div>
                {bakeApproved ? (
                  <div className="footer-actions">
                    <Button variant="secondary" onClick={() => showToast("Prep sheet is ready to print.")}>Show prep sheet</Button>
                    <Button variant="secondary" onClick={() => setBakeApproved(false)}><Icon name="check" /> Approved. Tap to undo</Button>
                  </div>
                ) : (
                  <Button disabled={!bakes.length} onClick={() => { setBakeApproved(true); showToast("Bake list approved. Prep sheet is ready."); }}>Looks good, approve <Icon name="check" /></Button>
                )}
              </div>
              <section className="plan-section">
                <div className="card-head"><div><span className="eyebrow">Next 7 days</span><div className="row-title">What to make each day, from today</div></div></div>
                <MakeTable rows={rollingRows} today={todayKey} />
                <p className="source-note">Hover a number to see the forecast behind it. Drinks are made to order, so they aren't listed.</p>
              </section>
            </>
          )}
        </>
      );
    }

    if (page === "plan") {
      if (!weekly) return <><PageHeader title="Week plan" subtitle="Made every Sunday evening for the week ahead." /><NoForecast what="weekly plan" error={forecastError.weekly} /></>;
      const r = weekly.run, days = groupByDay(weekly.forecasts), busiest = [...days].sort((a, b) => b.forecast - a.forecast);
      return (
        <>
          <PageHeader title="Week plan" subtitle={`${fmtDay(r.weekStart, { weekday: "long", month: "short", day: "numeric" })} to ${fmtDay(r.weekEnd, { weekday: "long", month: "short", day: "numeric" })} · made ${new Date(r.created).toLocaleString("en-CA", { weekday: "long", hour: "numeric", minute: "2-digit" })}`} />
          <div className="plan-stats">
            <article><span className="eyebrow">Pastries and parfaits sold</span><b>{Math.round(r.freshUnits).toLocaleString("en-CA")}</b><p>forecast. Bake {days.reduce((t, d) => t + d.make, 0).toLocaleString("en-CA")} with the margin</p></article>
            <article><span className="eyebrow">Drinks</span><b>{Math.round(r.drinkUnits).toLocaleString("en-CA")}</b><p>made to order</p></article>
            <article><span className="eyebrow">Expected takings</span><b>{money0(r.expectedRevenue)}</b><p>if the forecast holds</p></article>
            <article className="is-shop"><span className="eyebrow">Shopping, one trip</span><b>{money0(r.suppliesCost)}</b><p>{weekly.supplies.filter((s) => s.packs > 0).length} things to buy</p></article>
          </div>
          {days.length > 0 && <p className="plan-callout">Busiest day <b>{fmtDay(busiest[0].day, { weekday: "long" })}</b>, about {Math.round(busiest[0].forecast)} fresh items. Quietest <b>{fmtDay(busiest[busiest.length - 1].day, { weekday: "long" })}</b>, about {Math.round(busiest[busiest.length - 1].forecast)}.</p>}
          <section className="plan-section">
            <div className="card-head"><div><span className="eyebrow">Bake plan</span><div className="row-title">What to make each day</div></div></div>
            <MakeTable rows={weekly.forecasts} today={todayKey} />
          </section>
          <div className="plan-bottom">
            <section className="plan-section">
              <div className="card-head"><div><span className="eyebrow">The note</span><div className="row-title">Grandma's weekly plan</div></div><Button variant="secondary" onClick={() => { navigator.clipboard?.writeText(r.note).then(() => showToast("Note copied."), () => showToast("Couldn't copy. Select the text instead.")); }}>Copy</Button></div>
              <pre className="plan-note">{r.note}</pre>
            </section>
            <section className="plan-section">
              <div className="card-head"><div><span className="eyebrow">How sure</span><div className="row-title">Checked on past weeks</div></div></div>
              {r.backtest ? (
                <>
                  <p>Replayed on the last {r.backtest.weeks} weeks of sales, each item's weekly total was off by <b>{Math.round(r.backtest.itemErr * 100)}%</b> on average. Simply copying the previous week was off by {Math.round(r.backtest.naiveErr * 100)}%.</p>
                  <p>The daily bake amounts covered what sold <b>{Math.round(r.backtest.covered * 100)}%</b> of the time.</p>
                </>
              ) : <p>Needs about five weeks of sales before it can check itself.</p>}
              <p className="source-note">Based on sales from {fmtDay(r.historyStart)} to {fmtDay(r.historyEnd)}.</p>
            </section>
          </div>
        </>
      );
    }

    if (page === "order") {
      if (!weekly) return <><PageHeader title="Order supplies" subtitle="One shopping trip for the week ahead." /><NoForecast what="shopping list" error={forecastError.weekly} /></>;
      return (
        <>
          <PageHeader title="Order supplies" subtitle={`Enough for ${fmtDay(weekly.run.weekStart)} to ${fmtDay(weekly.run.weekEnd)}. Untick anything you already have.`} />
          <div className="supply-list">
            <div className="table-labels"><span>Supply</span><span>Needed this week</span><span>What to order</span><span>Add</span></div>
            {supplies.map((item) => {
              const have = Math.min(100, item.need ? (item.onHand * item.packSize) / item.need * 100 : 100);
              return (
                <article className="supply-row" key={item.id}>
                  <div className="supply-name"><div className="row-title">{item.name}</div><Status tone={item.packs === 0 ? "green" : item.buyLater ? "yellow" : "red"}>{item.packs === 0 ? "On the shelf" : item.buyLater ? "Buy in two goes" : "Buy"}</Status></div>
                  <div className="stock"><b>{fmtQty(item.need, item.unit)}</b><span><i style={{ width: `${have}%` }} /></span><em>{item.onHand ? `${item.onHand} × ${item.packName} on the shelf` : "Nothing on the shelf"}</em></div>
                  <div className="order-amount">
                    <b>{item.packs ? `${item.packs} × ${item.packName}` : "No order needed"}</b>
                    {item.packs > 0 && <span>{money(item.cost)}</span>}
                    {item.buyLater > 0 && item.buyLaterDay && <span>{item.buyNow} now, {item.buyLater} on {fmtDay(item.buyLaterDay, { weekday: "long" })}. Keeps only a few days.</span>}
                  </div>
                  <button
                    className={`check-box ${selected[item.id] ? "is-checked" : ""}`}
                    aria-label={`${selected[item.id] ? "Remove" : "Add"} ${item.name}`}
                    disabled={item.packs === 0 || orderSent}
                    onClick={() => setSelected((current) => ({ ...current, [item.id]: !current[item.id] }))}
                  >
                    {selected[item.id] && <Icon name="check" />}
                  </button>
                </article>
              );
            })}
          </div>
          <div className="action-footer">
            <div><span>Order total ({selectedSupplies.length} items)</span><b>{money(orderTotal)}</b></div>
            <Button disabled={orderSent || selectedSupplies.length === 0} onClick={() => { setOrderSent(true); showToast("Order sent to your supplier."); }}>
              {orderSent ? <><Icon name="check" /> Order sent to supplier</> : <>Send this order <Icon name="arrow" /></>}
            </Button>
          </div>
        </>
      );
    }

    if (page === "flavors") {
      const item = trends.find((t) => t.id === selectedItem) ?? trends[0];
      const maxRecent = Math.max(1, ...trends.map((t) => t.recent));
      const noteCount = trends.reduce((n, t) => n + t.notes.length, 0);
      if (!item) return <><PageHeader title="What's selling" subtitle="The last two weeks against the two before." /><NoForecast what="sales" error="No sales in the last four weeks." /></>;
      const pct = Math.round(Math.abs(item.change) * 100);
      return (
        <>
          <PageHeader title="What's selling" subtitle="Each item's last two weeks against the two weeks before, from the till's sales." />
          <div className="flavor-layout">
            <div>
              <div className="flavor-list">
                {trends.map((t) => (
                  <button className={`flavor-row ${item.id === t.id ? "is-selected" : ""}`} key={t.id} onClick={() => setSelectedItem(t.id)}>
                    <div><span className="row-title">{nameOf(t.id)}</span><Status tone={t.status === "Rising" ? "green" : t.status === "Fading" ? "red" : "yellow"}>{t.status}</Status></div>
                    <div className="flavor-score"><b>{t.recent}</b><span>sold</span></div>
                    <div className="flavor-bar"><i style={{ width: `${(t.recent / maxRecent) * 100}%` }} /></div>
                  </button>
                ))}
              </div>
              <p className="source-note">From {sales.length.toLocaleString("en-CA")} sales in the last four weeks{noteCount ? `, including ${noteCount} order notes` : ""}. Today isn't counted until it's over.</p>
            </div>
            <article className="flavor-detail">
              <span className="eyebrow">{item.status === "Rising" ? "Picking up" : item.status === "Fading" ? "Slowing down" : "Holding steady"}</span>
              <div className="flavor-name">{nameOf(item.id)}</div>
              <div className="quote-mark">“</div>
              <p>{item.notes[0]
                ? `${item.notes[0].note}${item.notes[0].who ? ` (${item.notes[0].who})` : ""}`
                : `${item.recent} sold in the last two weeks, ${item.prior ? `${item.change >= 0 ? "up" : "down"} ${pct}% on the ${item.prior} the two weeks before` : "and none the two weeks before"}.`}</p>
              {item.notes.length > 1 && <ul className="note-list">{item.notes.slice(1, 4).map((n) => <li key={n.ts + n.note}>“{n.note}”{n.who ? ` · ${n.who}` : ""}</li>)}</ul>}
              <div className="detail-stat"><b>{item.recent}</b><span>sold in 14 days · {money0(item.revenue)}{item.prior ? ` · ${item.change >= 0 ? "+" : "−"}${pct}%` : ""}</span></div>
              <Button disabled={featured === item.id} onClick={() => { setFeatured(item.id); showToast(`${nameOf(item.id)} will be featured on Saturday.`); }}>
                {featured === item.id ? <><Icon name="check" /> Featured on Saturday</> : <>Feature it on Saturday <Icon name="arrow" /></>}
              </Button>
            </article>
          </div>
        </>
      );
    }

    if (page === "marketing") {
      const hasSent = sentPartners.includes(selectedPartnerData.name);
      return (
        <>
          <PageHeader title="Local marketing" subtitle="Friendly places nearby that could send new customers your way." />
          <div className="marketing-layout">
            <div className="partner-side">
              <div className="partner-list">
                {partners.map((partner, index) => (
                  <button className={`partner-card ${selectedPartner === index ? "is-selected" : ""}`} onClick={() => setSelectedPartner(index)} key={partner.name}>
                    <div className={`partner-icon partner-${partner.kind}`}>{partner.name.charAt(0)}</div>
                    <div><span className="row-title">{partner.name}</span><p>{partner.reason}</p><b>{partner.walk}</b></div>
                    {sentPartners.includes(partner.name) ? <Status tone="green">Sent</Status> : <Icon name="arrow" />}
                  </button>
                ))}
              </div>
              <article className="outreach-card">
                <div><span className="row-title">Monthly outreach</span><p>Finds new places and drafts a hello each month.</p></div>
                <button className={`toggle ${outreach ? "is-on" : ""}`} aria-label="Toggle monthly outreach" onClick={() => setOutreach(!outreach)}><i /></button>
              </article>
            </div>
            <article className="draft-card">
              <div className="draft-head"><div><span className="eyebrow">Draft message</span><div className="row-title">To: {selectedPartnerData.name}</div></div><span className="pencil">edit</span></div>
              <textarea key={selectedPartnerData.name} defaultValue={draft} aria-label="Partnership message" />
              <div className="grandma-sign">with love, Grandma</div>
              <Button
                disabled={hasSent}
                onClick={() => { setSentPartners((current) => [...current, selectedPartnerData.name]); showToast(`Message sent to ${selectedPartnerData.name}.`); }}
              >
                {hasSent ? <><Icon name="check" /> Approved and sent</> : <>Approve and send <Icon name="arrow" /></>}
              </Button>
              <p className="safe-note">Nothing is sent until you approve it.</p>
            </article>
          </div>
        </>
      );
    }

    if (page === "counter") {
      return (
        <>
          <PageHeader title="New order" subtitle="Rung up through the till, so it gets a real order number and shows on every till screen." />
          {menuError && !menu.length ? (
            <article className="empty-card">
              <span className="eyebrow">Can't reach the till</span>
              <div className="row-title">The menu comes from Grandma's Till</div>
              <p>{menuError}. Start the till in a terminal and this page fills in by itself:</p>
              <code>cd grandmas-till && node server.js</code>
            </article>
          ) : (
            <div className="counter-layout">
              <div className="menu-grid">
                {menu.map((item, i) => (
                  <button className={`menu-item menu-${TONES[i % TONES.length]}`} key={item.id} onClick={() => setCart((current) => ({ ...current, [item.id]: (current[item.id] || 0) + 1 }))}>
                    <span className="menu-doodle">{item.name.charAt(0)}</span>
                    <span>{item.name}</span>
                    <b>{money(item.price)}</b>
                  </button>
                ))}
              </div>
              <article className="cart-card">
                <div className="cart-head"><div><span className="eyebrow">Current sale</span><div className="cart-title">{lastOrder ? `After #${lastOrder.no}` : "New order"}</div></div><span>{cartRows.reduce((n, item) => n + item.quantity, 0)} items</span></div>
                <div className="cart-lines">
                  {cartRows.length === 0 ? <div className="empty-cart"><Icon name="cart" /><p>Tap an item to<br />start the order.</p></div> : cartRows.map((item) => (
                    <div className="cart-line" key={item.id}>
                      <button onClick={() => setCart((current) => ({ ...current, [item.id]: Math.max(0, current[item.id] - 1) }))} aria-label={`One fewer ${item.name}`}>−</button>
                      <b>{item.quantity}×</b><span>{item.name}</span><strong>{money(item.price * item.quantity)}</strong>
                    </div>
                  ))}
                </div>
                <div className="cart-total"><span>Total</span><b>{money(cartTotal)}</b></div>
                <label className="phone-field"><span>Name for pickup (optional)</span><input value={pickup} onChange={(event) => setPickup(event.target.value)} maxLength={30} placeholder="Leave blank to hand over now" /></label>
                <div className="pay-toggle" role="group" aria-label="Payment">
                  {(["card", "cash"] as const).map((p) => <button key={p} className={payKind === p ? "is-on" : ""} aria-pressed={payKind === p} onClick={() => setPayKind(p)}>{p === "card" ? "Card" : "Cash"}</button>)}
                </div>
                <div className="cart-actions">
                  <Button variant="secondary" onClick={() => setCart({})} disabled={!cartRows.length}>Clear</Button>
                  <Button disabled={!cartRows.length || charging} onClick={chargeOrder}>{pickup.trim() ? "Charge & queue" : "Charge"} {money(cartTotal)}</Button>
                </div>
              </article>
            </div>
          )}
        </>
      );
    }

    const top3 = bakes.slice(0, 3).map((b) => `${b.amount} ${b.name.toLowerCase()}`).join(", ");
    const maxBar = Math.max(1, ...rollingDays.map((d) => d.forecast), soldToday);
    const split = toBuy.find((s) => s.buyLater > 0);
    return (
      <>
        <div className="today-heading">
          <PageHeader title="Hello, Grandma" subtitle={`${parseDay(todayKey).toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" })} · Here's what needs your attention.`} />
          <div className="weather"><span className="rain-lines">///</span><div><b>Rainy, 14°C</b><span>Great study weather</span></div></div>
        </div>
        <div className="today-grid">
          <div className="today-main">
            <article className="hero-card">
              <div className="hero-copy">
                <div className="eyebrow">Today, bake</div>
                <div className="big-number">{todayPlan ? bakeTotal : "–"}</div>
                <div className="hero-name">pastries and parfaits</div>
                <p>{todayPlan ? `Most of all: ${top3}.` : "No forecast for today yet. Start the forecast service: cd demand-pred && node forecast.js --watch"}</p>
                <div className="hero-actions"><Status tone={bakeApproved ? "green" : "yellow"}>{bakeApproved ? "Approved" : "Not approved yet"}</Status><Button onClick={() => navigate("bake")}>See bake list <Icon name="arrow" /></Button></div>
              </div>
              <div className="parfait-art" aria-hidden="true">
                <span className="art-spark">✦</span>
                <div className="glass"><i /><i /><i /><b /></div>
                <span className="art-note">today's<br />magic!</span>
              </div>
            </article>
            <article className="forecast-card">
              <div className="card-head"><div><span className="eyebrow">Next 7 days</span><div className="row-title">Fresh items: forecast and sold</div></div><div className="legend"><span><i />Sold</span><span><i />Forecast</span></div></div>
              {rollingDays.length === 0 ? <p className="source-note">No forecast yet.</p> : (
                <div className="bars">
                  {rollingDays.map((d) => {
                    const isToday = d.day === todayKey;
                    return (
                      <div className={`bar-day ${isToday ? "is-today" : ""}`} key={d.day} title={`${fmtDay(d.day, { weekday: "long", month: "short", day: "numeric" })}: forecast ${Math.round(d.forecast)}${isToday ? `, sold ${soldToday} so far` : ""}`}>
                        <small>{Math.round(d.forecast)}</small>
                        <div className="bar-wrap"><i style={{ height: `${(d.forecast / maxBar) * 100}%` }} />{isToday && <b style={{ height: `${(soldToday / maxBar) * 100}%` }} />}</div>
                        <span>{fmtDay(d.day, { weekday: "narrow" })}</span>{isToday && <em>today</em>}
                      </div>
                    );
                  })}
                </div>
              )}
              {rollingStale && <p className="source-note">Forecast made {fmtDay(rolling!.run.weekStart)}. Is the forecast service running?</p>}
            </article>
          </div>
          <div className="today-side">
            <article className={`alert-card ${orderSent || (weekly && toBuy.length === 0) ? "alert-done" : ""}`}>
              <div className="alert-icon">{orderSent || (weekly && toBuy.length === 0) ? <Icon name="check" /> : "!"}</div>
              <div className="eyebrow">{orderSent ? "All set" : "This week's shopping"}</div>
              <div className="alert-title">{!weekly ? "No shopping list yet." : orderSent ? "Supply order sent." : toBuy.length ? `${toBuy.length} things to buy, about ${money0(weekly.run.suppliesCost)}.` : "Everything is on the shelf."}</div>
              <p>{!weekly ? "It's made every Sunday evening." : orderSent ? "Nothing urgent right now." : split?.buyLaterDay ? `${split.name}: buy ${split.buyNow} now and ${split.buyLater} on ${fmtDay(split.buyLaterDay, { weekday: "long" })}.` : `For ${fmtDay(weekly.run.weekStart)} to ${fmtDay(weekly.run.weekEnd)}.`}</p>
              {weekly && !orderSent && toBuy.length > 0 && <Button variant="secondary" onClick={() => navigate("order")}>Go to Order <Icon name="arrow" /></Button>}
            </article>
            <article className="sold-card">
              <div><span className="eyebrow">Fresh items sold so far</span><b>{soldToday}</b></div>
              <div className="progress"><i style={{ width: `${Math.min(100, bakeTotal ? (soldToday / bakeTotal) * 100 : 0)}%` }} /></div>
              <p>of {bakeTotal} to bake · {todaySales.length} orders today</p>
            </article>
            <article className="sold-card takings-card">
              <div><span className="eyebrow">Takings today</span><b>{money0(takings)}</b></div>
              <p>{payCount("card")} card · {payCount("cash")} cash{unpaid ? ` · ${money(unpaid)} still to pay` : ""}{discounts ? ` · ${money(discounts)} in discounts` : ""}</p>
              {waiting.length > 0 && <p className="queue-note"><b>{waiting.length}</b> {waiting.length === 1 ? "order is" : "orders are"} waiting at the counter</p>}
            </article>
            <button className="quick-link quick-flavor" onClick={() => navigate("plan")}><div><span>Week plan</span><b>{weekly ? `${fmtDay(weekly.run.weekStart)} to ${fmtDay(weekly.run.weekEnd)}` : "Not made yet"}</b></div><Icon name="arrow" /></button>
            <button className="quick-link quick-partner" onClick={() => navigate("flavors")}><div><span>Picking up</span><b>{trends.filter((t) => t.status === "Rising").slice(0, 2).map((t) => nameOf(t.id)).join(", ") || "Nothing rising this fortnight"}</b></div><Icon name="arrow" /></button>
          </div>
        </div>
      </>
    );
  };

  return (
    <main className="app-shell">
      <div className="parfait-stripe"><i /><i /><i /><i /></div>
      <aside className="sidebar">
        <button className="brand" onClick={() => navigate("today")}><span className="brand-mark">G</span><span>Grandma's<br /><i>Bakeria</i></span></button>
        <nav className="nav-list" aria-label="Main navigation">
          {pages.map((item) => (
            <button className={page === item.id ? "is-active" : ""} onClick={() => navigate(item.id)} key={item.id}>
              <span className="nav-icon"><Icon name={item.icon} /></span>{item.label}
              {item.id === "order" && !orderSent && toBuy.length > 0 && <i className="nav-badge">!</i>}
            </button>
          ))}
          <div className="nav-divider"><span>Counter</span></div>
          <button className={page === "counter" ? "is-active" : ""} onClick={() => navigate("counter")}><span className="nav-icon"><Icon name="cart" /></span>New order</button>
        </nav>
        <div className="sidebar-help"><span>Need a hand?</span><button onClick={() => showToast("Help request sent. We'll call you shortly.")}>Call for help</button></div>
        <div className="grandma-profile"><span>GM</span><div><b>Grandma Mae</b><i>Shop owner</i></div><button aria-label="Open settings">•••</button></div>
      </aside>
      <section className="main-panel">
        <div className="mobile-top"><button className="brand" onClick={() => navigate("today")}><span className="brand-mark">G</span><span>Grandma's Bakeria</span></button></div>
        <div className="screen">{renderScreen()}</div>
      </section>
      {toast && <div className="toast"><span><Icon name="check" /></span>{toast}</div>}
    </main>
  );
}
