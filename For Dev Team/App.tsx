import { useMemo, useState } from "react";

type Page = "today" | "bake" | "order" | "flavors" | "marketing" | "counter";

const pages: { id: Page; label: string; icon: string }[] = [
  { id: "today", label: "Today", icon: "home" },
  { id: "bake", label: "Bake", icon: "bake" },
  { id: "order", label: "Order", icon: "box" },
  { id: "flavors", label: "Flavors", icon: "spark" },
  { id: "marketing", label: "Marketing", icon: "heart" },
];

const bakeDefaults = [
  { name: "Fall Parfait", amount: 48, step: 4, note: "Should sell out around 4 PM.", chips: ["Last 4 Fridays: 41, 44, 39, 46", "Midterms +10%"] },
  { name: "Apple cider donut", amount: 24, step: 2, note: "A steady seller all day.", chips: ["Last 4 Fridays: 22, 24, 23, 25"] },
  { name: "Maple scone", amount: 18, step: 2, note: "Sold out early last Friday.", chips: ["Last 4 Fridays: 18, 16, 18, 18"] },
];

const supplyDefaults = [
  { name: "Pumpkin purée", left: "2 cans left", status: "Order now", level: 18, order: "8 cans", cost: 64 },
  { name: "Heavy cream", left: "6 L left", status: "Low", level: 34, order: "4 L", cost: 52.4 },
  { name: "Apples", left: "1 bag left", status: "Low", level: 27, order: "2 bags", cost: 26.2 },
  { name: "Granola", left: "5 kg left", status: "Plenty", level: 78, order: "No order needed", cost: 0 },
];

const flavors = [
  { name: "Maple pecan", status: "Rising", mentions: 58, note: "Warm, familiar, and the top request from students. Pairs well with apple and oat granola." },
  { name: "Pear ginger", status: "Rising", mentions: 31, note: "A fresh, grown-up flavor customers mention most after lunch." },
  { name: "Pumpkin", status: "Steady", mentions: 44, note: "Still popular, but requests have stayed flat over the last two weeks." },
  { name: "Cranberry", status: "Fading", mentions: 9, note: "Fewer requests this month. Better as an accent than the main flavor." },
];

const partners = [
  { name: "Campus library", walk: "6 minute walk", reason: "Students study for hours.", kind: "books" },
  { name: "Community rec centre", walk: "10 minute walk", reason: "Parents wait during practice.", kind: "ball" },
  { name: "Yoga studio on Main", walk: "4 minute walk", reason: "A sweet treat after class.", kind: "sun" },
];

const menu = [
  { name: "Fall Parfait", price: 7.5, tone: "pink" },
  { name: "Cider donut", price: 4, tone: "yellow" },
  { name: "Maple scone", price: 3.75, tone: "blue" },
  { name: "Cookie", price: 3, tone: "green" },
  { name: "Muffin", price: 3.5, tone: "red" },
  { name: "Coffee", price: 3.25, tone: "cream" },
];

function Icon({ name }: { name: string }) {
  const paths: Record<string, React.ReactNode> = {
    home: <><path d="M4 10.5 12 4l8 6.5V20h-5v-6H9v6H4Z" /></>,
    bake: <><path d="M5 18h14M7 18v-4c0-3 2-6 5-6s5 3 5 6v4M9 8c0-2 1-3 3-3s3 1 3 3" /></>,
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

export default function App() {
  const [page, setPage] = useState<Page>("today");
  const [bakes, setBakes] = useState(bakeDefaults);
  const [bakeApproved, setBakeApproved] = useState(false);
  const [supplies, setSupplies] = useState(supplyDefaults.map((item) => ({ ...item, selected: item.cost > 0 })));
  const [orderSent, setOrderSent] = useState(false);
  const [selectedFlavor, setSelectedFlavor] = useState(0);
  const [testFlavor, setTestFlavor] = useState<string | null>(null);
  const [selectedPartner, setSelectedPartner] = useState(0);
  const [sentPartners, setSentPartners] = useState<string[]>([]);
  const [outreach, setOutreach] = useState(true);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [phone, setPhone] = useState("");
  const [sold, setSold] = useState(17);
  const [toast, setToast] = useState("");

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2800);
  };

  const navigate = (next: Page) => {
    setPage(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const changeBake = (index: number, direction: number) => {
    setBakes((current) => current.map((item, i) => i === index
      ? { ...item, amount: Math.max(0, item.amount + item.step * direction) }
      : item));
    setBakeApproved(false);
  };

  const selectedSupplies = supplies.filter((item) => item.selected && item.cost > 0);
  const orderTotal = selectedSupplies.reduce((total, item) => total + item.cost, 0);
  const bakeTotal = bakes.reduce((total, item) => total + item.amount, 0);
  const cartRows = menu.filter((item) => cart[item.name]).map((item) => ({ ...item, quantity: cart[item.name] }));
  const cartTotal = cartRows.reduce((total, item) => total + item.price * item.quantity, 0);
  const selectedPartnerData = partners[selectedPartner];
  const draft = `Hi! We're Grandma's Bakeria, a ${selectedPartnerData.walk.toLowerCase()} from ${selectedPartnerData.name}. Bring your group in this week for a free Fall Parfait tasting. Hope to see you. — Grandma`;

  const chargeOrder = () => {
    setSold((current) => current + (cart["Fall Parfait"] || 0));
    setCart({});
    showToast(phone ? "Order saved. Receipt texted." : "Order saved at the counter.");
    setPhone("");
  };

  const screen = useMemo(() => {
    if (page === "bake") {
      return (
        <>
          <PageHeader title="Bake today" subtitle="Use the big + and − buttons to change any amount." />
          <div className="bake-list">
            {bakes.map((item, index) => (
              <article className="bake-row" key={item.name}>
                <div className={`food-mark food-mark-${index}`}><span>{index === 0 ? "F" : index === 1 ? "D" : "S"}</span></div>
                <div className="bake-info">
                  <div className="row-title">{item.name}</div>
                  <p>{item.note}</p>
                  <div className="chips">{item.chips.map((chip) => <span key={chip}>{chip}</span>)}</div>
                </div>
                <div className="stepper">
                  <button onClick={() => changeBake(index, -1)} aria-label={`Bake fewer ${item.name}`}>−</button>
                  <b>{item.amount}</b>
                  <button onClick={() => changeBake(index, 1)} aria-label={`Bake more ${item.name}`}>+</button>
                </div>
              </article>
            ))}
          </div>
          <div className="action-footer">
            <div><span>Total to bake</span><b>{bakeTotal}</b></div>
            {bakeApproved ? (
              <div className="footer-actions">
                <Button variant="secondary" onClick={() => showToast("Prep sheet is ready to print.")}>Show prep sheet</Button>
                <Button variant="secondary" onClick={() => setBakeApproved(false)}><Icon name="check" /> Approved. Tap to undo</Button>
              </div>
            ) : (
              <Button onClick={() => { setBakeApproved(true); showToast("Bake list approved. Prep sheet is ready."); }}>Looks good, approve <Icon name="check" /></Button>
            )}
          </div>
        </>
      );
    }

    if (page === "order") {
      return (
        <>
          <PageHeader title="Order supplies" subtitle="Enough for the next 3 days. Untick anything you already have." />
          <div className="supply-list">
            <div className="table-labels"><span>Supply</span><span>What is left</span><span>What to order</span><span>Add</span></div>
            {supplies.map((item, index) => (
              <article className="supply-row" key={item.name}>
                <div className="supply-name"><div className="row-title">{item.name}</div><Status tone={item.status === "Order now" ? "red" : item.status === "Plenty" ? "green" : "yellow"}>{orderSent && index === 0 ? "Low" : item.status}</Status></div>
                <div className="stock"><b>{item.left}</b><span><i style={{ width: `${item.level}%` }} /></span></div>
                <div className="order-amount"><b>{item.order}</b>{item.cost > 0 && <span>${item.cost.toFixed(2)}</span>}</div>
                <button
                  className={`check-box ${item.selected ? "is-checked" : ""}`}
                  aria-label={`${item.selected ? "Remove" : "Add"} ${item.name}`}
                  disabled={item.cost === 0 || orderSent}
                  onClick={() => setSupplies((current) => current.map((s, i) => i === index ? { ...s, selected: !s.selected } : s))}
                >
                  {item.selected && <Icon name="check" />}
                </button>
              </article>
            ))}
          </div>
          <div className="action-footer">
            <div><span>Order total ({selectedSupplies.length} items)</span><b>${orderTotal.toFixed(2)}</b></div>
            <Button disabled={orderSent || selectedSupplies.length === 0} onClick={() => { setOrderSent(true); showToast("Order sent to your supplier."); }}>
              {orderSent ? <><Icon name="check" /> Order sent to supplier</> : <>Send this order <Icon name="arrow" /></>}
            </Button>
          </div>
        </>
      );
    }

    if (page === "flavors") {
      const flavor = flavors[selectedFlavor];
      return (
        <>
          <PageHeader title="What's coming" subtitle="What customers are asking for in the last 30 days." />
          <div className="flavor-layout">
            <div>
              <div className="flavor-list">
                {flavors.map((item, index) => (
                  <button className={`flavor-row ${selectedFlavor === index ? "is-selected" : ""}`} key={item.name} onClick={() => setSelectedFlavor(index)}>
                    <div><span className="row-title">{item.name}</span><Status tone={item.status === "Rising" ? "green" : item.status === "Fading" ? "red" : "yellow"}>{item.status}</Status></div>
                    <div className="flavor-score"><b>{item.mentions}</b><span>mentions</span></div>
                    <div className="flavor-bar"><i style={{ width: `${(item.mentions / 58) * 100}%` }} /></div>
                  </button>
                ))}
              </div>
              <p className="source-note">From 214 text replies and QR order notes.</p>
            </div>
            <article className="flavor-detail">
              <span className="eyebrow">Customer favorite</span>
              <div className="flavor-name">{flavor.name}</div>
              <div className="quote-mark">“</div>
              <p>{flavor.note}</p>
              <div className="detail-stat"><b>{flavor.mentions}</b><span>people mentioned it</span></div>
              <Button
                disabled={testFlavor === flavor.name}
                onClick={() => { setTestFlavor(flavor.name); showToast(`${flavor.name} added to Saturday's test batch.`); }}
              >
                {testFlavor === flavor.name ? <><Icon name="check" /> Added to Saturday</> : <>Add to Saturday test batch <Icon name="arrow" /></>}
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
          <PageHeader title="New order" subtitle="Counter order. QR orders arrive in the same place." />
          <div className="counter-layout">
            <div className="menu-grid">
              {menu.map((item) => (
                <button className={`menu-item menu-${item.tone}`} key={item.name} onClick={() => setCart((current) => ({ ...current, [item.name]: (current[item.name] || 0) + 1 }))}>
                  <span className="menu-doodle">{item.name.charAt(0)}</span>
                  <span>{item.name}</span>
                  <b>${item.price.toFixed(2)}</b>
                </button>
              ))}
            </div>
            <article className="cart-card">
              <div className="cart-head"><div><span className="eyebrow">Current sale</span><div className="cart-title">Order #112</div></div><span>{cartRows.reduce((n, item) => n + item.quantity, 0)} items</span></div>
              <div className="cart-lines">
                {cartRows.length === 0 ? <div className="empty-cart"><Icon name="cart" /><p>Tap an item to<br />start the order.</p></div> : cartRows.map((item) => (
                  <div className="cart-line" key={item.name}>
                    <button onClick={() => setCart((current) => ({ ...current, [item.name]: Math.max(0, current[item.name] - 1) }))}>−</button>
                    <b>{item.quantity}×</b><span>{item.name}</span><strong>${(item.price * item.quantity).toFixed(2)}</strong>
                  </div>
                ))}
              </div>
              <div className="cart-total"><span>Total</span><b>${cartTotal.toFixed(2)}</b></div>
              <label className="phone-field"><span>Phone for text receipt (optional)</span><input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="(555) 000-0000" /></label>
              <div className="cart-actions">
                <Button variant="secondary" onClick={() => setCart({})} disabled={!cartRows.length}>Clear</Button>
                <Button disabled={!cartRows.length} onClick={chargeOrder}>Charge ${cartTotal.toFixed(2)}</Button>
              </div>
            </article>
          </div>
        </>
      );
    }

    return (
      <>
        <div className="today-heading">
          <PageHeader title="Hello, Grandma" subtitle="Friday, October 2 · Here's what needs your attention." />
          <div className="weather"><span className="rain-lines">///</span><div><b>Rainy, 14°C</b><span>Great study weather</span></div></div>
        </div>
        <div className="today-grid">
          <div className="today-main">
            <article className="hero-card">
              <div className="hero-copy">
                <div className="eyebrow">Today, bake</div>
                <div className="big-number">{bakes[0].amount}</div>
                <div className="hero-name">Fall Parfaits</div>
                <p>Midterms week and a rainy afternoon. More students will stay in to study.</p>
                <div className="hero-actions"><Status tone={bakeApproved ? "green" : "yellow"}>{bakeApproved ? "Approved" : "Not approved yet"}</Status><Button onClick={() => navigate("bake")}>See bake list <Icon name="arrow" /></Button></div>
              </div>
              <div className="parfait-art" aria-hidden="true">
                <span className="art-spark">✦</span>
                <div className="glass"><i /><i /><i /><b /></div>
                <span className="art-note">today's<br />magic!</span>
              </div>
            </article>
            <article className="forecast-card">
              <div className="card-head"><div><span className="eyebrow">This week</span><div className="row-title">Forecast and sold</div></div><div className="legend"><span><i />Sold</span><span><i />Forecast</span></div></div>
              <div className="bars">
                {[36, 33, 42, 39, 48, 54, 46].map((amount, index) => (
                  <div className={`bar-day ${index === 4 ? "is-today" : ""}`} key={index}>
                    <div className="bar-wrap"><i style={{ height: `${amount * 1.3}px` }} /><b style={{ height: `${Math.min(amount, index < 4 ? amount - 3 : index === 4 ? sold : 0) * 1.3}px` }} /></div>
                    <span>{["M", "T", "W", "T", "F", "S", "S"][index]}</span>{index === 4 && <em>today</em>}
                  </div>
                ))}
              </div>
            </article>
          </div>
          <div className="today-side">
            <article className={`alert-card ${orderSent ? "alert-done" : ""}`}>
              <div className="alert-icon">{orderSent ? <Icon name="check" /> : "!"}</div>
              <div className="eyebrow">{orderSent ? "All set" : "One thing needs you"}</div>
              <div className="alert-title">{orderSent ? "Supply order sent." : "Pumpkin purée: order now."}</div>
              <p>{orderSent ? "Nothing urgent right now." : "2 cans left. You need 9 this weekend."}</p>
              {!orderSent && <Button variant="secondary" onClick={() => navigate("order")}>Go to Order <Icon name="arrow" /></Button>}
            </article>
            <article className="sold-card">
              <div><span className="eyebrow">Parfaits sold so far</span><b>{sold}</b></div>
              <div className="progress"><i style={{ width: `${(sold / bakes[0].amount) * 100}%` }} /></div>
              <p>of {bakes[0].amount} baked · 11 orders today</p>
            </article>
            <button className="quick-link quick-flavor" onClick={() => navigate("flavors")}><div><span>Rising flavor</span><b>Maple pecan</b></div><Icon name="arrow" /></button>
            <button className="quick-link quick-partner" onClick={() => navigate("marketing")}><div><span>New neighbors</span><b>3 places to say hello to</b></div><Icon name="arrow" /></button>
          </div>
        </div>
      </>
    );
  }, [page, bakes, bakeApproved, supplies, orderSent, selectedFlavor, testFlavor, selectedPartner, sentPartners, outreach, cart, phone, sold, orderTotal, bakeTotal, cartTotal, draft, selectedPartnerData, selectedSupplies.length, cartRows]);

  return (
    <main className="app-shell">
      <div className="parfait-stripe"><i /><i /><i /><i /></div>
      <aside className="sidebar">
        <button className="brand" onClick={() => navigate("today")}><span className="brand-mark">G</span><span>Grandma's<br /><i>Bakeria</i></span></button>
        <nav className="nav-list" aria-label="Main navigation">
          {pages.map((item) => (
            <button className={page === item.id ? "is-active" : ""} onClick={() => navigate(item.id)} key={item.id}>
              <span className="nav-icon"><Icon name={item.icon} /></span>{item.label}
              {item.id === "order" && !orderSent && <i className="nav-badge">!</i>}
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
        <div className="screen">{screen}</div>
      </section>
      {toast && <div className="toast"><span><Icon name="check" /></span>{toast}</div>}
    </main>
  );
}
