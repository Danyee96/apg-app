"use strict";
const $ = (s, p = document) => p.querySelector(s),
  $$ = (s, p = document) => [...p.querySelectorAll(s)];
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const num = (v) => Number(v || 0).toLocaleString("en-PK");
const cash = (v) => v == null ? "—" :
  "Rs " +
  (Number(v || 0) / 100).toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const amount = (v) => (Number(v || 0) / 100).toFixed(2);
const fmtdate = (v) =>
  v
    ? new Date(v.slice(0, 10) + "T12:00:00").toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";
const fmttime = (v) =>
  new Date(v.replace(" ", "T") + "Z").toLocaleString("en-GB", {
    timeZone: "Asia/Karachi",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const paths = {
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  incoming: "M12 3v12 m-4-4 4 4 4-4 M4 16v5h16v-5",
  booking: "M4 4h11v16H4z M15 8h5v12h-5 M7 8h5 M7 12h5",
  truck:
    "M3 6h11v11H3z M14 10h4l3 4v3h-7 M5 17a2 2 0 1 0 4 0 M16 17a2 2 0 1 0 4 0",
  users:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  wallet: "M3 5h16v15H3z M3 5l13-3v3 M15 10h6v6h-6z M17 13h1",
  report: "M5 3h10l4 4v14H5z M14 3v5h5 M8 17v-3 M12 17v-6 M16 17v-4",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z",
  search: "M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
  plus: "M12 5v14 M5 12h14",
  arrow: "M5 12h14 M14 7l5 5-5 5",
  chevron: "M9 5l7 7-7 7",
  calendar: "M4 5h16v16H4z M4 10h16 M8 3v4 M16 3v4",
  clock: "M12 8v5l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
  box: "m3 7 9-5 9 5v10l-9 5-9-5z M3 7l9 5 9-5 M12 12v10 M7 4l10 5",
  logout: "M9 4H3v16h6 M10 12h11 M16 7l5 5-5 5",
  close: "M6 6l12 12 M6 18 18 6",
  check: "M5 12l4 4L19 6",
  print: "M6 9V3h12v6 M6 17H3V9h18v8h-3 M6 14h12v7H6z",
  download: "M12 3v12 m-4-4 4 4 4-4 M4 16v5h16v-5",
  edit: "m15 4 5 5 M3 21l5-1L21 7l-5-5L3 15z",
  menu: "M3 6h18 M3 12h18 M3 18h18",
  shield: "m12 2 9 4v6c0 5-9 10-9 10S3 17 3 12V6z M8 12l3 3 5-6",
  pin: "M12 22s8-8 8-14a8 8 0 1 0-16 0c0 6 8 14 8 14 M15 8a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  refresh: "M20 7a9 9 0 1 0 1 8 M20 2v5h-5",
  info: "M12 11v6 M12 7h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
};
const icon = (n) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[n] || paths.box}"/></svg>`;
const btn = (label, action, primary = false, ic = "") =>
  `<button type="button" class="btn ${primary ? "primary" : ""}" data-action="${action}">${ic ? icon(ic) : ""}${label}</button>`;
const tag = (text, color = "") =>
  `<span class="tag ${color}">${esc(text)}</span>`;
let session,
  lookups = { accounts: [], stations: [], areas: [] },
  state = {
    view: "navigation",
    page: 0,
    search: "",
    group: "",
    status: "pending",
    from: "",
    to: "",
    date: today(),
  },
  listData,
  currentForm,
  selected = new Map(),
  requestID = 0;
async function api(action, data, params = {}) {
  const { __render, ...queryParams } = params;
  let r = await fetch(
    "api.php?" + new URLSearchParams({ action, ...queryParams }),
    data
      ? {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": session.csrf,
          },
          body: JSON.stringify(data),
        }
      : {},
  );
  let body;
  try {
    body = await r.json();
  } catch {
    throw Error("The server could not complete this request.");
  }
  if (!r.ok) {
    if (r.status === 401 && session?.user) {
      session.user = null;
      auth();
    }
    throw Error(body.error || "Request failed.");
  }
  if (__render !== undefined && __render !== requestID)
    throw Error("Superseded request.");
  APG.remember(body);
  return body;
}
function toast(msg) {
  $("#toast").textContent = msg;
  $("#toast").style.display = "block";
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ($("#toast").style.display = "none"), 4500);
}
async function refreshLookups() {
  lookups = await api("lookups");
  $("#customer-options").innerHTML = lookups.accounts
    .filter((a) => a.customer && a.status === "A")
    .map((a) => `<option value="${esc(a.id + " · " + a.name)}"></option>`)
    .join("");
  $("#account-options").innerHTML = lookups.accounts
    .filter((a) => a.status === "A")
    .map((a) => `<option value="${esc(a.id + " · " + a.name)}"></option>`)
    .join("");
}
function accountID(v) {
  return v.split(" · ")[0].trim();
}
function accountLabel(id) {
  let a = lookups.accounts.find((a) => a.id === id);
  return a ? a.id + " · " + a.name : "";
}
const can = (permission) =>
  !permission ||
  session?.profile?.role === "super_admin" ||
  (session?.permissions || []).includes(permission);
const isOperations = () => session?.profile?.role === "operations";
const goodsCash = (value, kind = "incoming") => cash(value);
const isSuper = () => session?.profile?.role === "super_admin";
const roleLabel = (role) =>
  ({
    super_admin: "Super admin",
    manager: "Manager",
    accountant: "Accountant",
    operations: "Operations",
    viewer: "Viewer",
    custom: "Custom",
  })[role] || role;
const displayName = () => session?.profile?.full_name || session?.user || "";
function avatarMarkup(user, large = false) {
  return `<span class="avatar ${large ? "avatar-large" : ""}">${user?.avatar ? `<img src="${esc(user.avatar)}" alt="${esc(user.full_name || user.username || "Profile")}" width="${large ? 96 : 36}" height="${large ? 96 : 36}">` : esc((user?.full_name || user?.username || "?").slice(0, 2).toUpperCase())}</span>`;
}
function canView(view) {
  const map = {
    overview: "overview.view",
    incoming: "incoming.view",
    booking: "booking.view",
    deliveries: "deliveries.view",
    customers: "customers.view",
    accounts: "vouchers.view",
    ledger: "ledger.view",
    "financial-reports": "ledger.view",
    "financial-detail": "reports.view",
    settings: "settings.view",
    backups: "backups.create",
    archive: "archive.view",
  };
  if (view === "delivery-cash" || view === "pending-cash") return isSuper() || (isOperations() && can('deliveries.create'));
  if (view === "goods-categories") return isSuper();
  if (view === "goods-analytics") return can("incoming.view");
  if (view === "pending-deliveries") return isSuper();
  if (view === "pending-incoming") return isSuper() || (isOperations() && can("incoming.view"));
  if (view === "users") return isSuper();
  if (view === "reports")
    return [
      "incoming.view",
      "booking.view",
      "deliveries.view",
      "customers.view",
      "ledger.view",
    ].some(can);
  if (view === "bilties") return can("incoming.view") || can("booking.view");
  return can(map[view]);
}
function dashboardAllowed(key) {
  const map = {
    receipt: "vouchers.create",
    payment: "vouchers.create",
    journal: "vouchers.create",
    customers116: "customers.view",
    customers117: "customers.view",
    booking: "booking.create",
    "booking-inquiry": "booking.view",
    incoming: "incoming.create",
    delivery: "deliveries.create",
    "delivery-inquiry": "incoming.view",
    ledger: "ledger.view",
    "ledger-detail": "ledger.view",
    "new-account": "accounts.create",
  };
  return key === "inquiry2" ? canView("bilties") : can(map[key]);
}
function actionAllowed(action, el) {
  const map = {
    "dashboard-overview": "overview.view",
    "new-customer": "customers.manage",
    customer: "customers.view",
    "new-incoming": "incoming.create",
    "new-booking": "booking.create",
    "delivery-new": "deliveries.create",
    "record-delivery": "deliveries.create",
    "new-voucher": "vouchers.create",
    "choose-ledger": "ledger.view",
    "customer-ledger": "ledger.view",
    "report-ledger": "ledger.view",
    "new-account": "accounts.create",
    "new-station": "stations.manage",
    station: "stations.manage",
    backup: "backups.create",
    "imported-data": "archive.view",
    "report-pending": "incoming.view",
    "financial-dashboard": "ledger.view",
    "financial-ledger": "ledger.view",
    "new-user": "super",
    "edit-user": "super",
  };
  if (map[action] === "super") return isSuper();
  if (action === "financial-report")
    return can(
      ["ledger", "activity", "cashbook", "bankbook", "chart"].includes(
        el?.dataset.report,
      )
        ? "ledger.view"
        : "reports.view",
    );
  if (action.startsWith("report-") && canView(action.slice(8)) === false)
    return false;
  return can(map[action]);
}
function applyPermissions(root = document) {
  $$("[data-action],[data-view],[data-dashboard]", root).forEach((el) => {
    const allowed = el.dataset.view
      ? canView(el.dataset.view)
      : el.dataset.dashboard
        ? dashboardAllowed(el.dataset.dashboard)
        : actionAllowed(el.dataset.action, el);
    el.hidden = !allowed;
  });
  const search = $("#global-search", root);
  if (search) search.hidden = !canView("bilties");
}
function availableGroups() {
  return dashboardGroups
    .map((g) => ({
      ...g,
      items: g.items.filter(([key]) => dashboardAllowed(key)),
    }))
    .filter((g) => g.items.length);
}
function personalGreeting() {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Karachi",
      hour: "numeric",
      hour12: false,
    }).format(new Date()),
  );
  return hour < 12
    ? "Good morning"
    : hour < 17
      ? "Good afternoon"
      : "Good evening";
}
function navigationHub() {
  const descriptions = {
    dashboard:
      "Your daily picture: goods movement, recent entries and delivery queues.",
    overview:
      "Review arrivals, deliveries and station activity for a chosen date.",
    incoming: "Find incoming goods or record a new arrival.",
    "goods-categories": "Add main goods categories and their subcategories.",
    "goods-analytics": "Compare goods quantities by category and subcategory.",
    "pending-incoming": "Incoming goods awaiting super admin review and approval.",
    "pending-deliveries": "Delivery goods awaiting super admin review and approval.",
    booking: "Manage outgoing shipments and their bilties.",
    deliveries: "Review handovers, receivers and cash collected.",
    "delivery-cash": "Receive delivery cash and track customer balances.",
    "pending-cash": "Cash collections awaiting admin approval.",
    customers: "Find customer accounts and contact details.",
    accounts: "Review vouchers, receipts, payments and journals.",
    reports: "Open goods registers, directories and account views.",
    "financial-reports":
      "Explore account activity, balances and accounting reports.",
    settings: "Manage stations, backups and workspace activity.",
    backups: "Automatic midnight backups, manual snapshots and restore history.",
    users: "Create staff accounts and set individual permissions.",
    profile: "Update your photo, personal details and password.",
    archive: "Browse the preserved original backup tables.",
  };
  const sections = [
    [
      "operations",
      "Your working day",
      "Goods, people and the day ahead.",
      [
        "overview",
        "incoming",
        "pending-incoming",
        "goods-analytics",
        "booking",
        "deliveries",
        "delivery-cash",
        "pending-cash",
        "customers",
      ],
    ],
    [
      "finance",
      "Accounts & reporting",
      "Your accounting tools, together.",
      ["accounts", "reports", "financial-reports"],
    ],
    [
      "workspace",
      "Your workspace",
      "People, preferences and original records.",
      ["users", "settings", "goods-categories", "backups", "profile", "archive"],
    ],
  ]
    .map(([id, title, hint, views]) => ({
      id,
      title,
      hint,
      items: views
        .map((v) => navs.find((n) => n[0] === v))
        .filter((n) => n && canView(n[0])),
    }))
    .filter((section) => section.items.length);
  const tasks = availableGroups().flatMap((g) => g.items);
  const count =
    sections.reduce((n, section) => n + section.items.length, 0) + tasks.length;
  const longDate = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
  return (
    head(
      "Navigation",
      "Every part of your workspace. One place to get started.",
      btn("Find a task", "command", false, "search"),
      "YOUR STARTING POINT",
    ) +
    `<section class="hub-welcome"><div class="hub-person">${avatarMarkup(session.profile, true)}<div><span class="hero-label"><span class="dot"></span> WELCOME TO YOUR WORKSPACE</span><h2>${personalGreeting()},<br><span>${esc(displayName())}.</span></h2><p>Ready when you are. Choose where you’d like to go.</p><div class="hub-person-meta"><span>${icon("shield")}${esc(roleLabel(session.profile.role))}</span><span>${icon("pin")}Azad Pakistan Goods</span></div></div></div><div class="hub-day"><span class="section-kicker">MAKE TODAY A GOOD DAY</span><div class="hub-day-icon">${icon("calendar")}</div><b>${esc(longDate)}</b><span>Pakistan Standard Time</span>${can("overview.view") ? `<button class="btn hero-primary" data-view="overview">Open overview ${icon("arrow")}</button>` : ""}</div></section><div class="hub-tools"><div class="hub-search">${icon("search")}<input id="hub-search" type="search" placeholder="Find a tab or task…" aria-label="Find a workspace tab or task" autocomplete="off"><kbd>/</kbd></div><span id="hub-result-count" role="status">${count} places & tasks</span></div><div id="hub-content">${sections.map((section) => `<section class="hub-section"><div class="section-heading"><div><span class="section-kicker">${section.id.toUpperCase()}</span><h2>${section.title}</h2><p>${section.hint}</p></div><span class="hub-section-count">${section.items.length} tabs</span></div><div class="hub-grid">${section.items.map(([view, ic, title], i) => `<button class="hub-card ${view === "dashboard" ? "hub-card-featured" : ""}" data-view="${view}" data-hub-search="${esc((title + " " + descriptions[view]).toLowerCase())}"><div class="hub-card-top"><span class="tile-icon">${icon(ic)}</span><span class="hub-card-index">${String(i + 1).padStart(2, "0")}</span></div><h3>${esc(title)}</h3><p>${esc(descriptions[view])}</p><span class="hub-card-open">Open ${icon("arrow")}</span></button>`).join("")}</div></section>`).join("")}${tasks.length ? `<section class="hub-section"><div class="section-heading"><div><span class="section-kicker">STRAIGHT TO IT</span><h2>Quick actions</h2><p>Skip the extra steps and get things done.</p></div></div><div class="dashboard-grid">${tasks.map(([key, title, desc, ic, color]) => `<button class="dashboard-tile ${color}" data-dashboard="${key}" data-hub-search="${esc((title + " " + desc).toLowerCase())}"><span class="tile-icon">${icon(ic)}</span><span class="tile-copy"><b>${esc(title)}</b><small>${esc(desc)}</small></span><span class="tile-arrow">${icon("arrow")}</span></button>`).join("")}</div></section>` : ""}</div><div id="hub-no-results" class="empty" hidden>${icon("search")}<h3>No matching tabs or tasks.</h3><p>Try “delivery”, “customer”, “profile” or another task.</p></div><div class="data-note">${icon("shield")}<span>This page shows the tools available to your account. Your super admin manages access.</span></div>`
  );
}
document.addEventListener("input", (e) => {
  if (e.target.id !== "hub-search") return;
  const q = e.target.value.trim().toLowerCase();
  let count = 0;
  $$("#hub-content [data-hub-search]").forEach((card) => {
    card.hidden = !(card.dataset.hubSearch + " " + card.textContent.toLowerCase()).includes(q);
    if (!card.hidden) count++;
  });
  $$(".hub-section").forEach(
    (section) =>
      (section.hidden = !$$("[data-hub-search]", section).some(
        (card) => !card.hidden,
      )),
  );
  $("#hub-no-results").hidden = count > 0;
  $("#hub-result-count").textContent =
    count + " " + (q ? "matches" : "places & tasks");
});
document.addEventListener("keydown", (e) => {
  if (
    e.key === "/" &&
    $("#hub-search") &&
    !$("#modal").open &&
    !e.target.closest('input,textarea,select,[contenteditable="true"]')
  ) {
    e.preventDefault();
    $("#hub-search").focus();
  }
});

function restrictedDashboard() {
  return (
    head(
      `Welcome, ${esc(displayName())}.`,
      "Your workspace, with the tools assigned to you.",
      btn("My profile", "my-profile", false, "users"),
    ) +
    `<section class="access-welcome"><span class="section-kicker">YOUR WORKSPACE</span><h2>Everything you need.<br>Just the access you need.</h2><p>You’re signed in as ${esc(roleLabel(session.profile.role))}. Your super admin manages your access.</p></section><div class="dashboard-grid accessible-views">${navs
      .filter(
        ([v]) => !["dashboard", "profile", "users"].includes(v) && canView(v),
      )
      .map(
        ([v, i, title]) =>
          `<button class="dashboard-tile" data-view="${v}"><span class="tile-icon">${icon(i)}</span><span class="tile-copy"><b>${esc(title)}</b><small>Open your workspace</small></span>${icon("arrow")}</button>`,
      )
      .join("")}</div>${availableGroups()
      .map(
        (g) =>
          `<section class="dashboard-section"><div class="dashboard-section-head"><h2>${g.title}</h2><p>${g.hint}</p></div><div class="dashboard-grid">${g.items.map(([key, title, desc, ic, color]) => `<button class="dashboard-tile ${color}" data-dashboard="${key}"><span class="tile-icon">${icon(ic)}</span><span class="tile-copy"><b>${title}</b><small>${desc}</small></span>${icon("arrow")}</button>`).join("")}</div></section>`,
      )
      .join(
        "",
      )}${!availableGroups().length ? '<div class="note-box">Your account is ready. Ask your super admin to assign the tools you need.</div>' : ""}`
  );
}
const navs = [
  ["navigation", "grid", "Navigation"],
  ["overview", "grid", "Overview"],
  ["incoming", "incoming", "Incoming goods"],
  ["goods-analytics", "report", "Goods analytics"],
  ["goods-categories", "box", "Goods categories"],
  ["pending-incoming", "clock", "Pending incoming goods"],
  ["pending-deliveries", "clock", "Pending delivery goods"],
  ["booking", "booking", "Bookings"],
  ["deliveries", "truck", "Delivery goods"],
  ["delivery-cash", "wallet", "Delivery Cash Receiving"],
  ["pending-cash", "clock", "Pending cash collections"],
  ["customers", "users", "Customers"],
  ["accounts", "wallet", "Accounts & vouchers"],
  ["reports", "report", "Reports"],
  ["financial-reports", "wallet", "Financial Reports"],
  ["settings", "settings", "Workspace settings"],
  ["backups", "download", "Backup / Restore"],
  ["users", "shield", "Users & permissions"],
  ["profile", "users", "My profile"],
  ["archive", "report", "Imported backup"],
];
function initialView() {
  const requested = new URLSearchParams(location.search).get("view");
  return navs.some(([view]) => view === requested) && canView(requested)
    ? requested
    : "navigation";
}
function sidebarNavigation() {
  const link = view => {
    const row=navs.find(([key])=>key===view);
    if(!row||!canView(view))return '';
    return `<button class="nav-link" data-view="${view}">${icon(row[1])}<span>${row[2]}</span>${view==='navigation'?'<small>HOME</small>':''}</button>`;
  };
  const group=(id,label,ic,views)=>{
    const links=views.map(link).join('');if(!links)return '';
    return `<details class="nav-group" id="${id}"><summary class="nav-link nav-group-toggle">${icon(ic)}<span>${label}</span><span class="nav-group-arrow">${icon('chevron')}</span></summary><div class="nav-submenu">${links}</div></details>`;
  };
  return '<div class="nav-label">OPERATIONS</div>'+['navigation','overview'].map(link).join('')+
    group('nav-incoming','Incoming goods','incoming',['incoming','pending-incoming'])+
    group('nav-delivery','Delivery goods','truck',['deliveries','delivery-cash','pending-cash'])+
    ['booking','goods-analytics','goods-categories','customers'].map(link).join('')+
    '<div class="nav-label">FINANCE & WORKSPACE</div>'+['accounts','reports','financial-reports','settings','backups','users','profile','archive'].map(link).join('');
}
function shell() {
  document.title = "APG — Goods & accounts";
  $("#app").innerHTML =
    `<button class="nav-scrim" data-action="close-menu" aria-label="Close navigation" tabindex="-1"></button><aside class="sidebar" id="navigation" aria-label="Main navigation"><a class="brand" href="#" data-view="navigation"><div class="brand-mark">${icon("box")}</div><div><b>APG<span>.</span></b><small>AZAD PAKISTAN GOODS</small></div></a><nav>${sidebarNavigation()}</nav><div class="sidebar-bottom"><button class="sidebar-help" data-action="command">${icon("search")}<span>Find a task</span><kbd>⌘ K</kbd></button><div class="user">${avatarMarkup(session.profile)}<button class="user-identity" data-view="profile"><b>${esc(displayName())}</b><small>${esc(roleLabel(session.profile.role))}</small></button><button class="icon-btn" data-action="logout" aria-label="Sign out" title="Sign out">${icon("logout")}</button></div></div></aside><div class="shell"><header class="topbar"><div class="buttons"><button class="icon-btn mobile-menu" data-action="menu" aria-controls="navigation" aria-expanded="false" aria-label="Open navigation">${icon("menu")}</button><div class="breadcrumbs"><span>Workspace</span>${icon("chevron")}<strong id="crumb">Navigation</strong></div></div><div class="top-actions">${APG.picker()}<form id="global-search" class="search-global">${icon("search")}<input name="q" aria-label="Find a bilty" placeholder="Search a bilty, party or customer…"><button type="submit" aria-label="Search">${icon("arrow")}</button></form><button class="icon-btn command-trigger" data-action="command" title="Find a task (Ctrl or Command K)" aria-label="Find a task">${icon("grid")}</button><div class="date-chip">${icon("calendar")}<span>${fmtdate(today())}</span></div></div></header><main class="main" id="main" tabindex="-1"></main><footer class="app-footer"><span><span class="dot"></span> Azad Pakistan Goods</span><span>Goods in motion. Business in order.</span></footer></div>`;
  applyPermissions();
}
function toggleMenu(open) {
  const wasOpen = document.body.classList.contains("nav-open");
  const mobile = window.matchMedia("(max-width: 740px)").matches;
  document.body.classList.toggle("nav-open", open && mobile);
  const sidebar = $(".sidebar");
  sidebar?.classList.toggle("open", open && mobile);
  if (sidebar) sidebar.inert = mobile && !open;
  $(".mobile-menu")?.setAttribute("aria-expanded", String(open && mobile));
  if (open && mobile) {const active=sidebar?.querySelector(".nav-link.active"),group=active?.closest("details");(group&&!group.open?group.querySelector("summary"):active||sidebar?.querySelector(".nav-link"))?.focus();}
  else if (wasOpen && mobile) $(".mobile-menu")?.focus();
}
window
  .matchMedia("(max-width: 740px)")
  .addEventListener("change", () => toggleMenu(false));
document.addEventListener("keydown", (e) => {
  if (e.key !== "Tab" || !document.body.classList.contains("nav-open")) return;
  const items = $$(".sidebar a,.sidebar button:not(:disabled)");
  const first = items[0],
    last = items.at(-1);
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
});

function head(title, sub, actions = "", eyebrow = "AZAD PAKISTAN GOODS") {
  return `<div class="page-head"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p class="subtitle">${sub}</p></div><div class="buttons">${actions}</div></div>`;
}
function pagination(d) {
  return `<div class="pagination"><span>${d.total ? num(d.page * d.page_size + 1) + "–" + num(Math.min((d.page + 1) * d.page_size, d.total)) : "0"} of ${num(d.total)} records</span><div class="buttons"><button class="btn small" data-action="prev" ${d.page === 0 ? "disabled" : ""}>Previous</button><button class="btn small" data-action="next" ${(d.page + 1) * d.page_size >= d.total ? "disabled" : ""}>Next</button></div></div>`;
}
function searchBar(placeholder, extra = "", dates = false) {
  return `<div class="toolbar"><div class="search">${icon("search")}<input id="list-search" aria-label="Search records" placeholder="${placeholder}" value="${esc(state.search)}"></div><div class="buttons">${extra}${dates ? `<input type="date" class="filter" id="filter-from" aria-label="From date" value="${state.from}"><span class="muted">–</span><input type="date" class="filter" id="filter-to" aria-label="To date" value="${state.to}">` : ""}</div></div>`;
}
function empty(text = "No records found. Try a different search.") {
  return `<div class="empty">${icon("box")}<div>${text}</div></div>`;
}
async function navigate(view, reset = true) {
  if (!canView(view)) {
    toast("Your account does not have access to this screen.");
    return false;
  }
  if (
    currentForm &&
    !confirm(APG.t("Leave this entry? Unsaved changes will be lost."))
  )
    return false;
  currentForm = null;
  closeModal();
  state.view = view;
  if (view !== "bilties") {
    state.inquiry = null;
    state.deliveryMode = false;
  }
  if (reset) {
    state.page = 0;
    state.search = "";
    state.from = "";
    state.to = "";
    selected.clear();
  }
  $$(".nav-link").forEach((n) =>
    n.classList.toggle(
      "active",
      n.dataset.view ===
        (view === "financial-detail" ? "financial-reports" : view),
    ),
  );
  $$('.nav-group').forEach(group=>{const active=Boolean($('.nav-link.active[data-view]',group));group.classList.toggle('active',active);if(active)group.open=true;});
  toggleMenu(false);
  $('#crumb').textContent =
    navs.find((n) => n[0] === view)?.[2] ||
    (view === "financial-detail"
      ? "Financial Reports"
      : view === "ledger"
        ? "Account ledger"
        : view === "archive"
          ? "Imported backup"
          : state.inquiry?.title || "Bilty search");
  await render();
  return true;
}
async function render() {
  let id = ++requestID;
  $("#main").innerHTML =
    '<div class="loading-state" role="status"><span class="loading-orbit"></span><b>Getting your workspace ready</b><span>Bringing your latest records together.</span></div>';
  try {
    let html;
    switch (state.view) {
      case "navigation":
        html = navigationHub();
        break;
      case "dashboard":
        html = await dashboard();
        break;
      case "overview":
        html = await overview();
        break;
      case "customers":
        html = await customers();
        break;
      case "goods-categories":
        html = goodsCategoriesPage();
        break;
      case "goods-analytics":
        html = await goodsAnalyticsPage();
        break;
      case "backups":
        html = await backupsPage();
        break;
      case "pending-deliveries":
        html = await pendingDeliveries();
        break;
      case "pending-incoming":
        html = await pendingIncoming();
        break;
      case "incoming":
      case "booking":
        html = await shipments();
        break;
      case "pending-cash":
        html=await pendingCashCollections();
        break;
      case "delivery-cash":
        html = await deliveryCashPage();
        break;
      case "deliveries":
        html = await deliveries();
        break;
      case "accounts":
        html = await accounts();
        break;
      case "reports":
        html = reports();
        break;
      case "financial-reports":
        html = financialReports();
        break;
      case "bilties":
        html = await bilties();
        break;
      case "ledger":
        html = await ledger();
        break;
      case "users":
        html = await usersPage();
        break;
      case "profile":
        html = await profilePage();
        break;
      case "settings":
        html = await settings();
        break;
      case "financial-detail":
        html = await financialDetail();
        break;
      case "archive":
        html = await importedData();
        break;
      default:
        html = reports();
    }
    if (id === requestID && $("#main")) {
      $("#main").innerHTML = html;
      applyPermissions($("#main"));
    }
  } catch (e) {
    if (id === requestID && $("#main"))
      $("#main").innerHTML =
        `<section class="error-state">${icon("info")}<h1>Let’s try that again.</h1><p>${esc(e.message)}</p>${btn("Reload this view", "refresh", true, "refresh")}</section>`;
  }
}
function params(extra = {}) {
  return {
    page: state.page,
    search: state.search,
    from: state.from,
    to: state.to,
    ...extra,
    __render: requestID,
  };
}
async function overview() {
  let d = await api("dashboard", null, {
    date: state.date,
    __render: requestID,
  });
  return (
    head(
      "A clear view of your day.",
      "Arrivals, deliveries and customers. Everything in one place.",
      `<label class="date-chip">${icon("calendar")}<input type="date" id="working-date" aria-label="Overview date" value="${state.date}"></label>${btn("New incoming", "new-incoming", true, "plus")}`,
    ) +
    `<div class="screen-note">${icon("info")} Showing activity for ${fmtdate(d.date)}. Original backup: ${fmtdate(session.backup_date)}.</div><div class="metrics">${[
      [
        "Incoming shipments",
        d.incoming,
        "incoming",
        "",
        "Arrived on selected date",
      ],
      [
        "Deliveries recorded",
        d.deliveries,
        "truck",
        "green",
        "Handed over on selected date",
      ],
      [
        "Awaiting delivery",
        d.pending,
        "clock",
        "orange",
        "All pending incoming bilties",
      ],
      [
        "Customer accounts",
        d.customers,
        "users",
        "purple",
        "Your registered customer list",
      ],
    ]
      .map(
        ([l, v, i, c, n]) =>
          `<div class="metric"><div class="metric-top">${l}<div class="metric-icon ${c}">${icon(i)}</div></div><strong>${num(v)}</strong><small>${n}</small></div>`,
      )
      .join("")}</div><div class="quick-actions">${[
      [
        "Record an arrival",
        "Add a truck and its bilties",
        "incoming",
        "new-incoming",
      ],
      [
        "Deliver goods",
        "Find pending goods and record receipt",
        "truck",
        "delivery-new",
      ],
      [
        "Add a customer",
        "Save details once. Find them quickly.",
        "users",
        "new-customer",
      ],
    ]
      .map(
        ([a, b, i, action]) =>
          `<button class="quick" data-action="${action}"><span class="quick-icon">${icon(i)}</span><span><b>${a}</b><small>${b}</small></span>${icon("arrow")}</button>`,
      )
      .join(
        "",
      )}</div><div class="grid-main"><div><section class="panel"><div class="panel-head"><div><h2>Latest goods entries</h2><p>Your most recent incoming shipments and bookings</p></div><button class="link" data-view="incoming">View all →</button></div>${shipmentTable(d.recent, false)}</section><div class="footnote">${icon("shield")} Goods handovers and cash collection are separate. Delivery Cash Receiving creates linked accounting vouchers.</div></div><div><section class="panel"><div class="panel-head"><div><h2>Pending by station</h2><p>Incoming bilties awaiting delivery</p></div>${tag(d.pending + " bilties", "orange")}</div><div class="panel-body">${d.stations.map((s, i) => `<div class="station-row"><div class="station-label"><span>${esc(s.name || "Not recorded")}</span><strong>${s.count}</strong></div><div class="bar"><span style="width:${d.pending ? (s.count / d.pending) * 100 : 0}%;opacity:${1 - i * 0.1}"></span></div></div>`).join("") || '<p class="note">No pending incoming goods.</p>'}${btn("Find pending goods", "delivery-new", false, "search")}</div></section><section class="panel" style="margin-top:22px"><div class="panel-head"><h2>Workspace activity</h2>${icon("clock")}</div><div class="panel-body">${d.activity.length ? d.activity.map((a) => `<div class="activity-row">${esc(a.actor)} ${esc(a.action)} ${esc(a.entity)}<small>${esc(a.entity_id)} · ${fmttime(a.created_at)}</small></div>`).join("") : '<p class="note">Your new entries and changes will appear here.</p>'}</div></section></div></div>`
  );
}
function shipmentTable(rows, withKind = true) {
  return rows.length
    ? `<div class="table-scroll"><table><thead><tr><th>Reference</th><th>Date</th><th>Station / truck</th><th class="number">Bilties</th>${withKind ? '<th class="number">Bilty total</th>' : "<th>Type</th>"}<th></th></tr></thead><tbody>${rows.map((r) => `<tr><td><button class="link" data-action="shipment" data-id="${r.id}">${esc(r.reference)}</button>${r.legacy_id ? "<small>Original record</small>" : ""}</td><td>${fmtdate(r.dated)}</td><td><strong>${esc(r.station || "Not recorded")}</strong><small>${esc(r.truck || "No truck recorded")}</small></td><td class="number">${num(r.item_count)}</td><td class="${withKind ? "number" : ""}">${withKind ? cash(r.total) : tag(r.kind === "incoming" ? "Incoming" : "Booking", r.kind === "incoming" ? "green" : "")}</td><td><button class="icon-btn" data-action="shipment" data-id="${r.id}" aria-label="Open shipment ${esc(r.reference)}">${icon("chevron")}</button></td></tr>`).join("")}</tbody></table></div>`
    : empty();
}
async function shipments() {
  let kind = state.view,
    d = await api("shipments", null, params({ kind }));
  listData = d;
  state.page = d.page;
  return (
    head(
      kind === "incoming" ? "Incoming goods" : "Bookings",
      kind === "incoming"
        ? "Record arrivals and keep every bilty easy to find."
        : "Manage outgoing goods, parties and transport details.",
      btn(
        kind === "incoming" ? "New incoming" : "New booking",
        "new-" + kind,
        true,
        "plus",
      ),
    ) +
    `<section class="panel">${searchBar("Search reference, truck, driver or bilty…", "", true)}${shipmentTable(d.rows)}${pagination(d)}</section>`
  );
}
async function customers() {
  let d = await api("customers", null, params({ group: state.group }));
  listData = d;
  state.page = d.page;
  return (
    head(
      state.group ? "Customers · " + esc(state.group) : "Customers",
      "Your customer details, organised and easy to find.",
      btn("Export this page", "export", false, "download") +
        btn("Add customer", "new-customer", true, "plus"),
    ) +
    `<section class="panel">${searchBar("Search name, code, mobile or address…", `<select class="filter" id="customer-group" aria-label="Customer group"><option value="">All customer groups</option>${["115", "116", "117", "118"].map((g) => `<option value="${g}" ${state.group === g ? "selected" : ""}>Group ${g}</option>`).join("")}</select>`)}<div class="table-scroll"><table><thead><tr><th>Customer</th><th>Contact</th><th>Area</th><th>Group</th><th>Status</th><th></th></tr></thead><tbody>${d.rows.map((r) => `<tr><td><div class="person"><span class="avatar">${esc(r.name.slice(0, 2).toUpperCase())}</span><div><button class="link" data-action="customer" data-id="${esc(r.id)}">${esc(r.name)}</button><small>${esc(r.id)}</small></div></div></td><td>${esc(r.mobile || r.phone || "—")}<small>${esc(r.email || r.contact || "")}</small></td><td>${esc(r.area || "—")}</td><td>${tag(r.group_code)}</td><td>${tag(r.status === "A" ? "Active" : "Inactive", r.status === "A" ? "green" : "gray")}</td><td><button class="icon-btn" data-action="customer" data-id="${esc(r.id)}" aria-label="Edit ${esc(r.name)}">${icon("edit")}</button></td></tr>`).join("")}</tbody></table></div>${!d.rows.length ? empty() : ""}${pagination(d)}</section>`
  );
}
async function bilties() {
  let d = await api(
    "bilties",
    null,
    params({
      status: state.status,
      kind: state.deliveryMode ? "incoming" : state.inquiry?.kind || "",
      station_id: state.station_id || "",
    }),
  );
  listData = d;
  state.page = d.page;
  return (
    head(
      state.deliveryMode
        ? "Deliver goods"
        : state.inquiry?.title || "Bilty search",
      state.deliveryMode
        ? "Select pending bilties, then record who received the goods."
        : "Find a bilty by number, customer, receiver or contact.",
      state.deliveryMode
        ? btn(
            "Record delivery" +
              (selected.size ? " (" + selected.size + ")" : ""),
            "record-delivery",
            true,
            "check",
          )
        : btn("Export this page", "export", false, "download"),
    ) +
    `${selected.size ? `<div class="selection-bar"><span>${selected.size} bilty selected across your search results</span><button class="link" data-action="clear-selection">Clear selection</button></div>` : ""}<section class="panel">${searchBar("Search bilty, customer, party or contact…", `<select class="filter" id="bilty-status" aria-label="Bilty status" ${state.deliveryMode ? "disabled" : ""}><option value="">All statuses</option><option value="pending" ${state.status === "pending" ? "selected" : ""}>Awaiting delivery</option><option value="delivered" ${state.status === "delivered" ? "selected" : ""}>Delivered</option></select><select class="filter" id="station-filter" aria-label="Station"><option value="">All stations</option>${lookups.stations.map((s) => `<option value="${s.id}" ${String(state.station_id) === String(s.id) ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select>`, true)}${biltyTable(d.rows, state.deliveryMode)}${pagination(d)}</section>`
  );
}
function biltyTable(rows, selectable = false) {
  return rows.length
    ? `<div class="table-scroll"><table><thead><tr>${selectable ? "<th>Select</th>" : ""}<th>Bilty / date</th><th>Customer / party to</th><th>Station</th><th class="number">Qty</th><th class="number">Bilty total</th><th>Status</th><th></th></tr></thead><tbody>${rows.map((r) => `<tr>${selectable ? `<td><input class="row-check" type="checkbox" aria-label="Select bilty ${esc(r.bilty)}" data-select="${r.id}" ${r.delivery_submission_id ? 'disabled title="Awaiting delivery approval"' : ""} ${selected.has(r.id) ? "checked" : ""}></td>` : ""}<td><button class="link" data-action="bilty" data-id="${r.id}">${esc(r.bilty || "No number")}</button><small>${fmtdate(r.dated)}</small></td><td><strong>${esc(r.customer || r.party_from || "Not recorded")}</strong><small>To ${esc(r.party_to || "—")}</small></td><td>${esc(r.station || "—")}</td><td class="number">${num(r.qty)}</td><td class="number">${cash(r.total)}</td><td>${tag(r.delivery_submission_id ? "Awaiting delivery approval" : r.status === "delivered" ? "Delivered" : "Pending", r.status === "delivered" ? "green" : "orange")}</td><td><button class="icon-btn" data-action="bilty" data-id="${r.id}" aria-label="Open bilty ${esc(r.bilty)}">${icon("chevron")}</button></td></tr>`).join("")}</tbody></table></div>`
    : empty();
}
async function deliveries() {
  let d = await api("deliveries", null, params());
  listData = d;
  state.page = d.page;
  return (
    head(
      "Deliveries",
      "A clear record of every handover and amount collected.",
      btn("Refresh", "refresh", false, "refresh") + btn("Deliver goods", "delivery-new", true, "plus"),
    ) +
    `${isSuper() ? '<p class="note">All users’ saved deliveries are visible here. Updates appear automatically while this screen is idle.</p>' : ""}${state.search || state.from || state.to ? `<div class="note-box warning">Filters are active. Clear them to see all deliveries. ${btn("Clear filters", "clear-delivery-filters")}</div>` : ""}<section class="panel">${searchBar("Search delivery, bilty, party, receiver or mobile…", "", true)}<div class="table-scroll"><table><thead><tr><th>Delivery</th><th>Date</th><th>Receiver</th><th>Bilties</th><th class="number">Cash recorded</th><th>Cash status</th><th></th></tr></thead><tbody>${d.rows.map((r) => `<tr><td><button class="link" data-action="delivery" data-id="${r.id}">${esc(r.reference)}</button>${r.legacy_id ? "<small>Original record</small>" : ""}${isSuper() && r.recorded_by ? `<small>Recorded by: ${esc(r.recorded_by)}</small>` : ""}</td><td>${fmtdate(r.dated)}</td><td><strong>${esc(r.receiver)}</strong><small>${esc(r.mobile || "")}</small></td><td>${num(r.item_count)}</td><td class="number">${cash(r.collected)}</td><td>${tag(r.cash_workflow?cashStatus(r.cash_status):"Recorded previously")}</td><td><button class="icon-btn" data-action="delivery" data-id="${r.id}" aria-label="Open delivery">${icon("chevron")}</button></td></tr>`).join("")}</tbody></table></div>${!d.rows.length ? empty() : ""}${pagination(d)}</section>`
  );
}
async function accounts() {
  let d = await api("vouchers", null, params());
  listData = d;
  state.page = d.page;
  return (
    head(
      "Accounts & vouchers",
      "Record receipts, payments and balanced journal entries.",
      btn("View a ledger", "choose-ledger", false, "report") +
        btn("New voucher", "new-voucher", true, "plus"),
    ) +
    `<div class="note-box warning" style="margin-bottom:20px">Incoming goods and bookings do not post vouchers automatically. Delivery Cash Receiving creates linked customer charges and cash receipts. Use manual vouchers for other accounting transactions.</div><section class="panel"><div class="panel-head"><div><h2>Vouchers posted in the new app</h2><p>Historical transactions are available in the account ledger.</p></div></div>${searchBar("Search voucher or description…", "", true)}<div class="table-scroll"><table><thead><tr><th>Voucher</th><th>Date</th><th>Type</th><th>Description</th><th class="number">Amount</th><th></th></tr></thead><tbody>${d.rows.map((r) => `<tr><td><button class="link" data-action="voucher" data-id="${r.id}">${esc(r.reference)}</button></td><td>${fmtdate(r.dated)}</td><td>${tag({ RV: "Receipt", PV: "Payment", JV: "Journal" }[r.kind])}</td><td>${esc(r.memo)}</td><td class="number">${cash(r.amount)}</td><td><button class="icon-btn" data-action="voucher" data-id="${r.id}" aria-label="View voucher">${icon("chevron")}</button></td></tr>`).join("")}</tbody></table></div>${!d.rows.length ? empty("No new vouchers yet. Your historical ledger is already available.") : ""}${pagination(d)}</section>`
  );
}
function reports() {
  return (
    head(
      "Reports & insights",
      "Choose what you want to see. Filter, review and print.",
      btn("Financial Reports", "financial-dashboard", true, "wallet"),
    ) +
    `<div class="report-grid">${[
      [
        "Incoming goods register",
        "Arrivals by date, truck and station.",
        "incoming",
        "report-incoming",
      ],
      [
        "Booking register",
        "Outgoing bookings and recorded charges.",
        "booking",
        "report-booking",
      ],
      [
        "Delivered goods register",
        "Handovers, receivers and cash recorded.",
        "truck",
        "report-deliveries",
      ],
      [
        "Pending goods",
        "Incoming bilties still awaiting delivery.",
        "clock",
        "report-pending",
      ],
      [
        "Customer directory",
        "Customer groups and contact information.",
        "users",
        "report-customers",
      ],
      [
        "Account ledger",
        "Original transactions and new vouchers by account.",
        "wallet",
        "choose-ledger",
      ],
    ]
      .map(
        ([t, d, i, a]) =>
          `<button class="report-card" data-action="${a}"><div class="metric-icon">${icon(i)}</div><h2>${t} →</h2><p>${d}</p></button>`,
      )
      .join(
        "",
      )}</div><div class="note-box warning" style="margin-top:24px">Historical statements and balances require reconciliation. New delivery collections are recorded through Delivery Cash Receiving.</div>`
  );
}
const financialReportCards = [
  [
    "journal",
    "Journal",
    "Review journal entries and accounting adjustments.",
    "report",
    "transactions",
  ],
  [
    "vouchers",
    "Vouchers",
    "Browse receipts, payments and journal vouchers.",
    "wallet",
    "transactions",
  ],
  [
    "salesman",
    "Vouchers Salesman-Wise",
    "Review vouchers grouped by the recorded salesman.",
    "users",
    "transactions",
  ],
  [
    "ledger",
    "Ledger a/c",
    "Open the full history for a customer or account.",
    "booking",
    "transactions",
  ],
  [
    "daybook",
    "Day Book",
    "Review accounting activity for a selected day.",
    "calendar",
    "transactions",
  ],
  [
    "cashbook",
    "Cash Book",
    "View cash account transactions and balances.",
    "wallet",
    "transactions",
  ],
  [
    "bankbook",
    "Bank Book",
    "View bank account transactions and balances.",
    "wallet",
    "transactions",
  ],
  [
    "activity",
    "Account Activity",
    "Review entries for a selected account and date range.",
    "clock",
    "transactions",
  ],
  [
    "trial",
    "Trial Balance",
    "Review debit and credit balances by account.",
    "report",
    "statements",
  ],
  [
    "profit",
    "Profit and Loss",
    "Review income, costs and expenses for a period.",
    "report",
    "statements",
  ],
  [
    "expenses",
    "Expenses Summary",
    "Review expense accounts and their recorded activity.",
    "report",
    "statements",
  ],
  [
    "balances",
    "Customers Balances",
    "Review customer account balances.",
    "users",
    "customers",
  ],
  [
    "selected-balances",
    "Customers Balances with Selection",
    "Choose customer accounts for a balance report.",
    "users",
    "customers",
  ],
  [
    "cash-bank",
    "Cash and Bank Statement",
    "Review cash and bank accounts together.",
    "wallet",
    "statements",
  ],
  [
    "chart",
    "Chart of Accounts",
    "Browse the account heads used by your business.",
    "booking",
    "statements",
  ],
];
function financialReports() {
  const groups = [
    [
      "transactions",
      "Transactions & books",
      "Find entries, vouchers and account activity.",
    ],
    [
      "customers",
      "Customer reports",
      "Review customer balances and selected accounts.",
    ],
    [
      "statements",
      "Statements & account structure",
      "Find financial summaries and your chart of accounts.",
    ],
  ];
  return (
    head(
      "Financial Reports",
      "All your financial reports, organised in one place.",
      btn("All reports", "all-reports", false, "report"),
    ) +
    `<div class="dashboard-intro"><span class="metric-icon">${icon("wallet")}</span><div><b>Your financial reporting desk</b><p>Choose a report below to open its available view or report details.</p></div><span class="tag">15 reports</span></div>${groups
      .map(
        ([id, title, description]) =>
          `<section class="dashboard-section"><div class="dashboard-section-head"><h2>${title}</h2><p>${description}</p></div><div class="dashboard-grid">${financialReportCards
            .filter((r) => r[4] === id)
            .map(
              ([key, name, desc, ic]) =>
                `<button type="button" class="dashboard-tile" data-action="financial-report" data-report="${key}"><span class="tile-icon">${icon(ic)}</span><span class="tile-copy"><b>${name}</b><small>${desc}</small><em class="report-state">${["ledger", "activity", "cashbook", "bankbook", "chart", "trial", "balances", "daybook", "journal", "vouchers"].includes(key) ? "Available view" : "Awaiting implementation"}</em></span><span class="tile-arrow">${icon("arrow")}</span></button>`,
            )
            .join("")}</div></section>`,
      )
      .join("")}`
  );
}
function openFinancialReport(key) {
  const report = financialReportCards.find((r) => r[0] === key);
  if (!report) return;
  if (["trial", "balances", "daybook", "journal", "vouchers"].includes(key)) {
    state.financialReport = key;
    state.from = key === "daybook" ? today() : session.history_start;
    state.to = today();
    state.search = "";
    state.page = 0;
    navigate("financial-detail", false);
    return;
  }
  if (["ledger", "activity"].includes(key)) {
    chooseLedger("detail");
    return;
  }
  if (key === "cashbook" || key === "bankbook") {
    const group = key === "cashbook" ? "101" : "106";
    const accounts = lookups.accounts.filter((a) => a.group_code === group);
    modal(
      report[1],
      "Choose an account to view its recorded ledger.",
      `<div class="financial-account-list">${accounts.map((a) => `<button type="button" class="quick" data-action="customer-ledger" data-id="${esc(a.id)}"><span class="quick-icon">${icon("wallet")}</span><span><b>${esc(a.name)}</b><small>${esc(a.id)}</small></span>${icon("arrow")}</button>`).join("") || empty("No accounts are recorded in this group.")}</div>`,
    );
    return;
  }
  if (key === "chart") {
    modal(
      "Chart of Accounts",
      "All account heads currently stored in your app database.",
      `<div class="table-scroll"><table><thead><tr><th>Account code</th><th>Account name</th><th>Group</th><th>Status</th></tr></thead><tbody>${lookups.accounts.map((a) => `<tr><td>${esc(a.id)}</td><td>${esc(a.name)}</td><td>${esc(a.group_code)}</td><td>${tag(a.status === "A" ? "Active" : "Inactive", a.status === "A" ? "green" : "gray")}</td></tr>`).join("")}</tbody></table></div>`,
      btn("Print", "print-dialog", false, "print") +
        btn("Close", "close-modal"),
    );
    recordPrintContext = {
      kind: "chart",
      data: { accounts: structuredClone(lookups.accounts) },
    };
    return;
  }
  modal(
    report[1],
    report[2],
    `<div class="note-box">This report’s dedicated layout and calculations are awaiting implementation and comparison with the original system. The underlying historical entries are already stored in your database.</div><p class="note">You can review an individual account using Account Activity, or inspect the original source records through Workspace settings → Browse imported backup.</p>`,
    btn("View account activity", "financial-ledger", true, "report") +
      btn("Close", "close-modal"),
  );
}
async function financialDetail() {
  const key = state.financialReport,
    report = financialReportCards.find((r) => r[0] === key);
  const d = await api(
    "financial_report",
    null,
    params({
      report: key,
      from: state.from || session.history_start,
      to: state.to || today(),
    }),
  );
  listData = d;
  state.page = d.page;
  const balance = ["trial", "balances"].includes(key);
  const stats = balance
    ? [
        ["Period debits", d.stats.debit],
        ["Period credits", d.stats.credit],
        ["Closing debit balances", d.stats.closing_dr],
        ["Closing credit balances", d.stats.closing_cr],
      ]
    : [
        ["Period debits", d.stats.debit],
        ["Period credits", d.stats.credit],
      ];
  return (
    head(
      report[1],
      balance
        ? "Account balances calculated from original ledger entries and new vouchers."
        : "Recorded accounting lines for your selected period.",
      btn("Financial reports", "financial-dashboard") +
        btn("Print this page", "print-page", false, "print") +
        btn("Export this page", "export", false, "download"),
    ) +
    `<div class="note-box warning" style="margin-bottom:22px">Historical balances require reconciliation. Delivery Cash Receiving posts linked customer charges and cash receipts.${balance ? " Original entries without dates or account codes cannot be included in dated account balances." : " Totals count accounting lines, rather than whole vouchers."} ${key === "vouchers" ? "This report includes only vouchers posted in the new app." : ""}</div><div class="metrics ${balance ? "" : "report-metrics"}">${stats.map(([title, value]) => `<div class="metric"><div class="metric-top">${title}</div><strong class="financial-value">${cash(value)}</strong><small>All matching records, across every page</small></div>`).join("")}</div><section class="panel">${searchBar(balance ? "Find account name or code…" : "Find reference, description or account…", "", true)}<div class="table-scroll"><table><thead><tr>${balance ? '<th>Account</th><th>Group</th><th class="number">Opening</th><th class="number">Debit</th><th class="number">Credit</th><th class="number">Closing</th>' : '<th>Date / source</th><th>Reference</th><th>Account</th><th>Description</th><th class="number">Debit</th><th class="number">Credit</th>'}</tr></thead><tbody>${d.rows.map((r) => (balance ? `<tr><td><button class="link" data-action="report-ledger" data-id="${esc(r.id)}">${esc(r.name)}</button><small>${esc(r.id)}</small></td><td>${tag(r.group_code)}</td><td class="number">${cash(Math.abs(r.opening))} ${r.opening >= 0 ? "Dr" : "Cr"}</td><td class="number">${cash(r.debit)}</td><td class="number">${cash(r.credit)}</td><td class="number"><strong>${cash(Math.abs(r.closing))} ${r.closing >= 0 ? "Dr" : "Cr"}</strong></td></tr>` : `<tr><td>${fmtdate(r.dated)}<small>${esc(r.source)}</small></td><td>${esc(r.reference)}<small>${esc(r.kind)}</small></td><td>${r.account_id ? `<button class="link" data-action="report-ledger" data-id="${esc(r.account_id)}">${esc(r.account || r.account_id)}</button>` : "Incomplete account"}<small>${esc(r.account_id || "Original code unavailable")}</small></td><td class="report-memo">${esc(r.memo || "—")}</td><td class="number">${r.debit ? cash(r.debit) : "—"}</td><td class="number">${r.credit ? cash(r.credit) : "—"}</td></tr>`)).join("")}</tbody></table></div>${!d.rows.length ? empty("No accounting records match this period and search.") : ""}${pagination(d)}</section>`
  );
}
async function ledger() {
  let d = await api("ledger", null, {
    __render: requestID,
    account_id: state.account_id,
    from: state.from || session.history_start || "2017-10-28",
    to: state.to || today(),
    page: state.page,
  });
  listData = d;
  state.page = d.page;
  return (
    head(
      state.ledgerMode === "detail"
        ? "Account ledger detail"
        : "Account ledger",
      esc(d.account.name) + " · " + esc(d.account.id),
      btn("Choose account", "choose-ledger") +
        btn("Print", "print-page", false, "print") +
        btn("Export this page", "export", false, "download"),
    ) +
    `<div class="note-box warning" style="margin-bottom:20px">${esc(d.notice)}</div><div class="metrics">${[
      ["Opening balance", d.opening],
      ["Period debits", d.debit],
      ["Period credits", d.credit],
      ["Closing balance", d.closing],
    ]
      .map(
        ([t, v]) =>
          `<div class="metric"><div class="metric-top">${t}</div><strong style="font-size:22px">${cash(Math.abs(v))}</strong><small>${t.includes("balance") ? (v >= 0 ? "Debit" : "Credit") : "Selected date range"}</small></div>`,
      )
      .join(
        "",
      )}</div><section class="panel ${state.ledgerMode === "summary" ? "ledger-summary" : ""}"><div class="toolbar"><span class="note">Recorded account transactions · ${num(d.all_time_count)} total</span><div class="buttons">${btn("Full history", "ledger-all-history")}<input class="filter" type="date" id="filter-from" aria-label="Start date" value="${state.from || session.history_start || "2017-10-28"}"><span>–</span><input class="filter" type="date" id="filter-to" aria-label="End date" value="${state.to || today()}"></div></div><div class="table-scroll"><table><thead><tr><th>Date / source</th><th>Reference</th><th>Description</th><th class="number">Debit</th><th class="number">Credit</th><th class="number">Balance</th></tr></thead><tbody>${d.rows.map((r) => `<tr><td>${fmtdate(r.dated)}<small>${esc(r.source)}</small></td><td>${tag(r.kind)} ${esc(r.reference)}</td><td>${esc(r.memo || "—")}</td><td class="number">${r.debit ? cash(r.debit) : "—"}</td><td class="number">${r.credit ? cash(r.credit) : "—"}</td><td class="number">${cash(Math.abs(r.balance))} ${r.balance >= 0 ? "Dr" : "Cr"}</td></tr>`).join("")}</tbody></table></div>${!d.rows.length ? empty(d.all_time_count ? "No entries in this date range. This account has " + num(d.all_time_count) + " entries from " + fmtdate(d.first_date) + " to " + fmtdate(d.last_date) + ". Use Full history to see them." : "No recorded transactions for this account.") : ""}${pagination(d)}</section>`
  );
}
async function settings() {
  let d = await api("settings");
  return (
    head("Workspace settings", "Your stations, backups and recent changes.") +
    `<div class="form-layout"><section class="panel"><div class="panel-head"><h2>Stations</h2>${btn("Add station", "new-station", false, "plus")}</div><div class="table-scroll"><table><thead><tr><th>Station</th><th>Address</th><th></th></tr></thead><tbody>${lookups.stations.map((s) => `<tr><td><strong>${esc(s.name)}</strong></td><td>${esc(s.address || "—")}</td><td><button class="icon-btn" data-action="station" data-id="${s.id}" aria-label="Edit station">${icon("edit")}</button></td></tr>`).join("")}</tbody></table></div><div class="panel-head"><h2>Recent activity</h2></div><div class="panel-body">${d.audit.map((a) => `<div class="activity-row">${esc(a.actor)} ${esc(a.action)} ${esc(a.entity)} ${esc(a.entity_id)}<small>${fmttime(a.created_at)}</small></div>`).join("") || '<p class="note">No changes recorded yet.</p>'}</div></section><div><section class="panel"><div class="panel-head"><h2>Backup your workspace</h2></div><div class="panel-body"><p class="note">Save a separate copy of your current customer details, new entries and vouchers to the private storage folder.</p>${btn("Create backup", "backup", true, "download")} <button class="btn" data-view="backups">Backup / Restore</button><div style="margin-top:14px">${btn("Browse imported backup", "imported-data", false, "report")}</div><p class="note" style="margin-top:18px">Original data snapshot<br><strong>${fmtdate(session.backup_date)}</strong></p></div></section><div class="note-box warning" style="margin-top:20px">Financial balances still require reconciliation before live accounting use. Access to each workspace is managed by your super admin.</div></div></div>`
  );
}
async function importedData() {
  let summary = await api("imported_tables", null, { __render: requestID });
  if (!state.archiveTable) state.archiveTable = "legacy_VRD";
  let d = await api(
    "imported_rows",
    null,
    params({ table: state.archiveTable }),
  );
  listData = d;
  state.page = d.page;
  return (
    head(
      "Imported backup data",
      "All 21 original tables are stored in your app database. These source records are read-only.",
      btn("Export this page", "export", false, "download"),
    ) +
    `<div class="note-box" style="margin-bottom:20px">Backup: ${esc(summary.source_archive)} · ${num(summary.tables.reduce((s, t) => s + t.count, 0))} source records. The original ledger includes ${num(summary.incomplete_account_rows)} entries with incomplete account codes and ${num(summary.undated_ledger_rows)} entries without dates. They are preserved here.</div><section class="panel">${searchBar("Search original source fields…", `<select class="filter" id="archive-table" aria-label="Imported table">${summary.tables.map((t) => `<option value="${esc(t.name)}" ${state.archiveTable === t.name ? "selected" : ""}>${esc(t.label)} · ${num(t.count)} records</option>`).join("")}</select>`)}<div class="table-scroll"><table><thead><tr><th>Source row</th>${d.columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${d.rows.map((r) => `<tr><td>${r._source_row}</td>${d.columns.map((c) => `<td data-no-translate dir="auto">${esc(r[c] ?? "—")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>${!d.rows.length ? empty() : ""}${pagination(d)}</section>`
  );
}
function field(
  name,
  label,
  value = "",
  type = "text",
  extra = "",
  wide = false,
) {
  return `<div class="field ${wide ? "wide" : ""}"><label for="f-${name}">${label}</label><input id="f-${name}" name="${name}" type="${type}" value="${esc(value)}" ${type === "number" && extra.includes('step="0.01"') ? 'data-money="true"' : ""} ${extra}></div>`;
}
function selectField(name, label, options, value = "", required = false) {
  return `<div class="field"><label for="f-${name}">${label}</label><select id="f-${name}" name="${name}" ${required ? "required" : ""}>${options.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(value) ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></div>`;
}
function stationOptions() {
  return [
    ["", "Choose station"],
    ...lookups.stations
      .filter((s) => s.status === "A")
      .map((s) => [s.id, s.name]),
  ];
}
let modalSnapshot = "";
function modalValues() {
  const f = $("#modal form");
  return f ? JSON.stringify([...new FormData(f)]) : "";
}
function requestCloseModal() {
  if (biltyDraft) {
    closeBilty();
    return;
  }
  if (
    modalValues() !== modalSnapshot &&
    !confirm(APG.t("Discard the unsaved changes in this form?"))
  )
    return;
  closeModal();
}
function modal(title, subtitle, body, footer = "") {
  recordPrintContext = null;
  let d = $("#modal");
  d.classList.remove("bilty-dialog", "command-dialog", "user-dialog");
  d.innerHTML = `<div class="modal-head"><div><h2 id="modal-title">${title}</h2><p>${subtitle}</p></div><div class="buttons"><button class="icon-btn" data-action="close-modal" aria-label="Close">${icon("close")}</button></div></div><div class="modal-body"><div class="receipt-heading">Azad Pakistan Goods</div>${body}</div>${footer ? `<div class="modal-footer">${footer}</div>` : ""}`;
  applyPermissions(d);
  if (!d.open) d.showModal();
  modalSnapshot = modalValues();
}
async function customerForm(id) {
  let r = id
    ? await api("customer", null, { id })
    : { group_code: "116", status: "A" };
  modal(
    id ? "Customer details" : "Add a customer",
    id ? esc(r.id) : "Account code will be assigned when you save.",
    `<form id="customer-form"><input type="hidden" name="id" value="${esc(r.id || "")}"><input type="hidden" name="version" value="${r.version || 1}"><div class="form-grid">${field("name", 'Customer / party name <span class="required">*</span>', r.name, "text", 'required maxlength="100"', true)}${selectField(
      "group_code",
      "Customer group",
      [
        ["115", "115 · Godown"],
        ["116", "116 · Customers"],
        ["117", "117 · Customers"],
        ["118", "118 · Customers"],
      ],
      r.group_code,
    )}${selectField(
      "status",
      "Status",
      [
        ["A", "Active"],
        ["I", "Inactive"],
      ],
      r.status,
    )}${field("mobile", "Mobile", r.mobile, "tel")}${field("phone", "Phone", r.phone, "tel")}${field("area", "Area", r.area)}${field("contact", "Contact person", r.contact)}${field("address", "Address", r.address, "text", "", true)}${field("email", "Email", r.email, "email")}${field("cnic", "CNIC", r.cnic)}<details class="field wide"><summary>Additional contacts & Urdu details</summary><div class="form-grid">${field("mobile2", "Second mobile", r.mobile2, "tel")}${field("phone2", "Second phone", r.phone2, "tel")}${field("urdu_name", "Urdu name", r.urdu_name, "text", 'dir="auto"', true)}${field("urdu_address", "Urdu address", r.urdu_address, "text", 'dir="auto"', true)}</div><small>Older Urdu text may need conversion from the original font.</small></details></div><div class="error" id="form-error" hidden></div><div class="form-actions"><div>${id ? `<button type="button" class="btn" data-action="customer-ledger" data-id="${esc(r.id)}">${icon("report")}View ledger</button>` : ""}</div><div class="buttons">${btn("Cancel", "close-modal")}<button class="btn primary" type="submit">Save customer</button></div></div></form>`,
  );
  if (id) {
    $("#f-group_code").disabled = true;
    $("#customer-form").insertAdjacentHTML(
      "beforeend",
      `<input type="hidden" name="group_code" value="${r.group_code}">`,
    );
    modalSnapshot = modalValues();
  }
  if (!can("customers.manage")) {
    $$("#customer-form input,#customer-form select").forEach(
      (el) => (el.disabled = true),
    );
    $('#customer-form [type="submit"]').hidden = true;
    modalSnapshot = modalValues();
  }
}
let backupMode = "backup", backupKind = "automatic", backupData;
async function backupsPage() {
  if(!isSuper()) backupMode="backup";
  backupData = await api("backup_list");
  const schedule = backupData.schedule, rows = backupData.rows.filter(row=>row.kind === backupKind);
  const tabs = (values, active, action) => `<div class="buttons backup-tabs">${values.map(([value,label])=>`<button class="btn ${active===value ? "primary" : ""}" data-action="${action}" data-value="${value}" aria-pressed="${active===value}">${label}</button>`).join("")}</div>`;
  return head("Backup / Restore", "Private database snapshots, verified before they are offered for restore.") +
    tabs([["backup","Backup"],...(isSuper()?[["restore","Restore"]]:[])],backupMode,"backup-mode") +
    `<div class="note-box" style="margin:18px 0"><strong>Automatic schedule: every day at 12:00 AM Pakistan time</strong><br>${schedule.enabled ? "Scheduler enabled" : "Scheduler setup pending"} · ${esc(schedule.driver)} · Asia/Karachi<br>Last successful check: ${schedule.last_success ? esc(new Date(schedule.last_success).toLocaleString("en-PK",{timeZone:"Asia/Karachi"})) : "Not yet run"}<br>Newest 30 automatic backups are retained. Manual and pre-restore backups are retained separately. GitHub jobs may start after midnight when busy and can pause after 60 days without repository activity. Check the last successful run.${schedule.last_error ? `<p class="error">${esc(schedule.last_error)}</p>` : ""}</div>` +
    tabs([["automatic","Automatic backups"],["manual","Manual backups"]],backupKind,"backup-kind") +
    (backupMode==="backup"&&backupKind==="manual" ? `<div style="margin:18px 0">${btn("Create manual backup","backup",true,"download")}</div>` : "") +
    (backupMode==="restore" ? '<div class="note-box warning" style="margin:18px 0">Restoring replaces the current database with the selected snapshot. A safety backup is created first. All users must sign in again; your current super admin password is retained.</div>' : "") +
    `<section class="panel" style="margin-top:18px"><div class="table-scroll"><table><thead><tr><th>Created · Pakistan time</th><th>Backup</th><th>Size</th><th>Check</th><th></th></tr></thead><tbody>${rows.map(row=>`<tr><td>${esc(row.created_local)}</td><td>${esc(row.id)}<small>${esc(row.reason || row.actor)}</small></td><td>${num((row.size/1048576).toFixed(1))} MB</td><td>${tag("Verified","green")}</td><td>${backupMode==="restore"&&isSuper() ? `<button class="btn" data-action="backup-restore" data-id="${esc(row.id)}">Restore</button>` : ""}</td></tr>`).join("")}</tbody></table></div>${!rows.length?empty("No "+backupKind+" backups yet."):""}</section>`;
}
function restoreBackupForm(id) {
  if(!isSuper()) throw Error("Only the super admin can restore backups.");
  const backup=backupData.rows.find(row=>row.id===id);if(!backup)throw Error("Backup unavailable. Refresh the list.");
  modal("Restore backup",backup.created_local,`<form id="backup-restore-form"><input type="hidden" name="backup_id" value="${esc(id)}"><div class="note-box warning">Current database records will be replaced with this snapshot. A manual safety backup will be created first. All users will be signed out. Your current super admin password stays valid.</div><div class="form-grid" style="margin-top:18px">${field("password","Current super admin password","","password",'required autocomplete="current-password"',true)}${field("confirmation","Type RESTORE to confirm","","text",'required pattern="RESTORE" autocomplete="off"',true)}</div><div class="error" id="form-error" hidden></div><div class="form-actions">${btn("Cancel","close-modal")}<button class="btn primary" type="submit">Restore selected backup</button></div></form>`);
}
async function pendingDeliveries() {
  const data=await api('pending_deliveries',null,{page:state.page});listData=data;
  return head('Pending delivery goods',isSuper()?'Review, correct and approve submitted deliveries.':'Your submitted deliveries appear here until the super admin approves them.',btn('Refresh','refresh',false,'refresh'))+
    `<section class="panel"><div class="table-scroll"><table><thead><tr><th>Submission</th><th>Submitted by</th><th>Date</th><th>Receiver</th><th>Bilties</th><th>Cash recorded</th><th></th></tr></thead><tbody>${data.rows.map(row=>`<tr><td>PENDING-DL-${row.id}<small>${esc(row.submitted_at)}</small></td><td>${esc(row.submitted_name)}</td><td>${fmtdate(row.dated)}</td><td>${esc(row.receiver)}</td><td>${num(row.item_count)}</td><td>${cash(row.cash)}</td><td>${isSuper()?`<button class="btn primary" data-action="review-pending-delivery" data-id="${row.id}">Review & approve</button> <button class="btn" data-action="discard-pending-delivery" data-id="${row.id}">Discard entry</button>`:tag('Awaiting approval','orange')}</td></tr>`).join('')}</tbody></table></div>${data.rows.length?'':empty('No delivery goods awaiting approval.')}${pagination(data)}</section>`;
}
async function reviewPendingDelivery(id) {
  const submission=await api('delivery_submission',null,{id});
  const values={...submission.payload};delete values.items;selected.clear();
  for(const row of submission.items){selected.set(row.id,row);const proposed=submission.payload.items.find(line=>line.id===row.id);for(const key of ['loading','suzuki','discount','bilty_received','service_received'])values[key+'_'+row.id]=proposed[key];}
  recordDelivery(values,{pending_id:submission.id,pending_version:submission.version,reference:'PENDING-DL-'+submission.id});
}
async function pendingIncoming() {
  const data = await api("pending_incoming", null, { page: state.page });
  listData = data;
  return head("Pending incoming goods", isSuper() ? "Review, correct and approve submitted arrivals." : "Your submitted entries appear here until the super admin approves them.") + `<section class="panel"><div class="table-scroll"><table><thead><tr><th>Submission</th><th>Submitted by</th><th>Arrival / station</th><th>Truck</th><th>Bilties</th><th></th></tr></thead><tbody>${data.rows.map(row=>`<tr><td>PENDING-${row.id}<small>${esc(row.submitted_at)}</small></td><td>${esc(row.submitted_name)}</td><td>${fmtdate(row.dated)}<small>${esc(row.station)}</small></td><td>${esc(row.truck)}</td><td>${num(row.item_count)}</td><td>${isSuper() ? `<button class="btn primary" data-action="review-incoming" data-id="${row.id}">Review & approve</button> <button class="btn" data-action="discard-incoming" data-id="${row.id}">Discard entry</button>` : tag("Awaiting approval", "orange")}</td></tr>`).join("")}</tbody></table></div>${!data.rows.length ? empty("No incoming goods awaiting approval.") : ""}${pagination(data)}</section>`;
}
async function reviewIncoming(id) {
  if (!isSuper()) throw Error("Only the super admin can approve incoming goods.");
  const submission = await api("incoming_submission", null, {id});
  const payload = submission.payload;
  currentForm = {pendingId: submission.id, submittedName: submission.submitted_name, kind: "incoming", step: 0, header: {...payload}, items: payload.items.map(row=>({...blankItem(),...row}))};
  delete currentForm.header.items;
  shipmentForm();
}
function detailCells(data) {
  return `<div class="detail-grid">${data.map(([k, v]) => `<div class="detail-cell"><span>${k}</span><b>${esc(v || "—")}</b></div>`).join("")}</div>`;
}
function shipmentBreakdown(items, kind, header, draft = false) {
  const cents = (value) => draft ? Math.round(Number(value || 0) * 100) : Number(value || 0);
  const sum = (key) => items.reduce((n, i) => n + cents(i[key]), 0);
  const booking = kind === "booking";
  const fields = booking
    ? [["rent", "Rent total"], ["loading", "Loading total"], ["bilty_amount", "Bilty charges total"], ["local_charge", "Local charges total"]]
    : [["bilty_amount", "Bilty charges total"], ["godown", "Godown charges total"], ["loading", "Loading total"], ["suzuki", "Suzuki total"]];
  const total = booking ? sum("rent") + sum("loading") + sum("bilty_amount") + sum("local_charge") : sum("bilty_amount") + sum("godown");
  const services = booking ? 0 : sum("loading") + sum("suzuki");
  let metrics = [
    ["Bilties", num(items.length)],
    ["Total quantity", num(items.reduce((n, i) => n + Number(i.qty || 0), 0))],
    ...fields.map(([key, label]) => [label, cash(sum(key))]),
    [booking ? "Bilties total" : "Godown charges + Bilty charges", cash(total)],
    ["All charges total", cash(total + services)],
    ["Advance total", cash(sum("advance"))],
    ["Charges less advance", cash(total + services - sum("advance"))],
    [booking ? "Truck rent / amount" : "Truck delivery / amount", cash(cents(header.truck_amount))],
    ...(!booking ? [["Labour Bonus", cash(cents(header.labour_bonus))], ["Munshi Bonus", cash(cents(header.munshi_bonus))]] : []),
    ...(booking ? [["Commission", cash(cents(header.commission))]] : [["Bilty amounts less truck delivery", cash(sum("bilty_amount") - cents(header.truck_amount))]]),
  ];
  if (isOperations() && !booking) metrics = metrics.filter(([label])=>label!=="Godown charges total");
  return `<section class="shipment-breakdown"><h2>Shipment totals & goods</h2>${detailCells(metrics)}<p class="note">${booking ? "Bilties total includes rent, loading, bilty and local charges." : "Godown charges + Bilty charges combines those two charges. All charges also includes loading and Suzuki. Truck balance uses bilty amounts only, less truck delivery; godown is excluded."} ${booking ? "Truck amount and commission are" : "Truck delivery amount and bonuses are"} shown separately. These figures are charges, not cash collected.</p></section>`;
}
function shipmentDetailTable(items, kind, draft = false) {
  const cents = (value) => draft ? Math.round(Number(value || 0) * 100) : Number(value || 0);
  let fields = kind === "booking" ? [["rent", "Rent"], ["loading", "Loading"], ["bilty_amount", "Bilty charges"], ["local_charge", "Local"]] : [["bilty_amount", "Bilty charges"], ["godown", "Godown"], ["loading", "Loading"], ["suzuki", "Suzuki"]];
  return `<div class="table-scroll"><table class="shipment-detail-table"><thead><tr><th>Bilty / customer</th><th>Qty</th><th>Goods type / description</th>${fields.map(([, label]) => `<th class="number">${label}</th>`).join("")}<th class="number">Bilty total</th><th class="number">Advance</th>${draft ? "" : "<th>Status</th>"}</tr></thead><tbody>${items.map(i => `<tr><td><strong>${esc(i.bilty)}</strong><small>${esc(i.customer || lookups.accounts.find(a => a.id === i.account_id)?.name || i.party_from || "—")}</small>${i.party_to ? `<small>To ${esc(i.party_to)}</small>` : ""}</td><td>${num(i.qty)}</td><td><strong>${esc(goodsTypeLabel(i)||i.detail||"—")}</strong>${i.detail && goodsTypeLabel(i) && i.detail!==goodsTypeLabel(i)?`<small>${esc(i.detail)}</small>`:""}${i.remarks ? `<small>${esc(i.remarks)}</small>` : ""}</td>${fields.map(([key]) => `<td class="number">${cash(cents(i[key]))}</td>`).join("")}<td class="number">${goodsCash(draft ? itemTotal(i) : i.total, kind)}</td><td class="number">${cash(cents(i.advance))}</td>${draft ? "" : `<td>${tag(i.status, i.status === "pending" ? "orange" : "green")}</td>`}</tr>`).join("")}</tbody></table></div>`;
}
async function showShipment(id) {
  let s = await api("shipment", null, { id });
  modal(
    (s.kind === "incoming" ? "Incoming goods" : "Booking") +
      " · " +
      esc(s.reference),
    fmtdate(s.dated) + (s.legacy_id ? " · Original record" : ""),
    detailCells([
      ["Station", s.station],
      ["Truck", s.truck],
      ["Driver", s.driver],
      ["Challan", s.challan],
      ["Driver mobile", s.driver_mobile],
      ["Remarks", s.remarks],
    ]) +
      shipmentBreakdown(s.items, s.kind, s) +
      `<hr class="divider"><h2 style="margin-bottom:18px">Bilties (${s.items.length})</h2>` + shipmentDetailTable(s.items, s.kind) + (s.kind === "incoming" ? goodsAnalyticsSection(s.items) : ""),
    (can(s.kind + ".edit") && !(isOperations() && s.kind === "incoming") ? `<button class="btn primary" data-action="edit-shipment" data-id="${s.id}">${icon("edit")}Edit entry</button>` : "") +
    btn("Print sheet", "print-dialog", false, "print") +
      btn("Close", "close-modal"),
  );
  recordPrintContext = { kind: "shipment", data: structuredClone(s) };
}
function showBilty(id) {
  let i = listData.rows.find((r) => String(r.id) === String(id));
  if (!i) return;
  modal(
    "Bilty " + esc(i.bilty),
    (i.kind === "booking" ? "Booking " : "Arrival ") +
      esc(i.reference) +
      " · " +
      fmtdate(i.dated),
    detailCells([
      ["Customer", i.customer],
      ["Party from", i.party_from],
      ["Party to", i.party_to],
      ["Station", i.station],
      ["Contact", i.contact],
      ["Quantity", String(i.qty ?? "")],
      ["Goods category", goodsCategoryLabel(i)],
      ["Subcategory / custom type", goodsTypeLabel(i)||"—"],
      ["Goods detail", i.detail],
      ["City", i.city],
      ["Status", i.status],
      ["Bilty amount", cash(i.bilty_amount)],
      ["Godown charges", cash(i.godown)],
      ["Loading", cash(i.loading)],
      ["Suzuki kiraya", cash(i.suzuki)],
      ["Rent", cash(i.rent)],
      ["Local charges", cash(i.local_charge)],
      ["Bilty total", goodsCash(i.total,i.kind)],
      ["Advance", cash(i.advance)],
      ["Remarks", i.remarks],
    ]),
    btn("Print bilty", "print-dialog", false, "print") +
      btn("Close", "close-modal"),
  );
  recordPrintContext = { kind: "bilty", data: structuredClone(i) };
}
async function showDelivery(id) {
  let d = await api("delivery", null, { id });
  modal(
    "Delivery · " + esc(d.reference),
    fmtdate(d.dated),
    detailCells([
      ["Receiver", d.receiver],
      ["Mobile", d.mobile],
      ["CNIC", d.cnic],
      ["Remarks", d.remarks],
    ]) +
      `<hr class="divider"><div class="table-scroll"><table><thead><tr><th>Bilty</th><th>Customer / party</th><th class="number">Discount</th><th class="number">Bilty cash</th><th class="number">Service cash</th></tr></thead><tbody>${d.items.map((i) => `<tr><td>${esc(i.bilty)}</td><td>${esc(i.customer || "—")}<small>Party to: ${esc(i.party_to || "—")}</small></td><td class="number">${cash(i.discount)}</td><td class="number">${cash(i.bilty_received)}</td><td class="number">${cash(i.service_received)}</td></tr>`).join("")}</tbody></table></div><div class="summary-total"><span>Total cash recorded</span><b>${cash(d.items.reduce((s, i) => s + i.bilty_received + i.service_received, 0))}</b></div>${d.cash_summary ? `<section class="shipment-breakdown">${deliveryFacts([["Cash status",cashStatus(d.cash_summary.status)],["Amount due",cash(d.cash_summary.due)],["Customer balance",cash(d.cash_summary.outstanding)],["Customer credit",cash(d.cash_summary.credit)]])}</section>` : ""}`,
    (can("deliveries.edit") ? `<button class="btn primary" data-action="edit-delivery" data-id="${d.id}">${icon("edit")}Edit delivery</button>` : "") +
    ((isSuper() || isOperations() && can("deliveries.create")) && d.cash_workflow ? `<button class="btn primary" data-action="receive-delivery-cash" data-id="${d.id}">Delivery Cash Receiving</button>` : "") +
    btn("Print receipt", "print-dialog", false, "print") +
      btn("Close", "close-modal"),
  );
  recordPrintContext = { kind: "delivery", data: structuredClone(d) };
}
function blankItem() {
  return {
    account_id: "",
    bilty: "",
    party_from: "",
    party_to: "",
    city: "",
    contact: "",
    qty: "1",
    detail: "",
    goods_category_id: "",
    goods_subcategory_id: "",
    goods_custom: "",
    goods_type: "",
    bilty_amount: "0",
    godown: "0",
    loading: "0",
    suzuki: "0",
    rent: "0",
    local_charge: "0",
    advance: "0",
    remarks: "",
  };
}
function newShipment(kind) {
  currentForm = {
    kind,
    step: 0,
    header: {
      dated: today(),
      station_id: "",
      truck: "",
      driver: "",
      truck_amount: "0",
      commission: "0",
      labour_bonus: "0",
      munshi_bonus: "0",
    },
    items: [],
  };
  shipmentForm();
}
async function editShipment(id) {
  const s = await api("shipment", null, { id });
  if (!can(s.kind + ".edit") || (isOperations() && s.kind === "incoming")) throw Error("You do not have permission to edit this entry.");
  const header = { ...s };
  delete header.items;
  for (const key of ["truck_amount", "commission", "labour_bonus", "munshi_bonus"]) header[key] = (Number(s[key] || 0) / 100).toFixed(2);
  const items = s.items.map(row => {
    const item = { ...blankItem(), ...row };
    for (const key of ["bilty_amount", "godown", "loading", "suzuki", "rent", "local_charge", "advance"]) item[key] = (Number(row[key] || 0) / 100).toFixed(2);
    return item;
  });
  closeModal();
  currentForm = { id: s.id, version: s.version, kind: s.kind, step: 0, header, items };
  shipmentForm();
}
function itemTotal(i, kind = currentForm.kind) {
  const cents = (v) => Math.round(Number(v || 0) * 100);
  return kind === "incoming"
    ? cents(i.bilty_amount) + cents(i.godown)
    : cents(i.rent) +
        cents(i.loading) +
        cents(i.bilty_amount) +
        cents(i.local_charge);
}
function captureShipment() {
  if (!currentForm || currentForm.step !== 0) return;
  let form = $("#shipment-form");
  if (form)
    Object.assign(currentForm.header, Object.fromEntries(new FormData(form)));
}
function shipmentAmountWarnings() {
  const warnings = currentForm.items.filter(item => Math.round(Number(item.advance || 0) * 100) > itemTotal(item));
  return warnings.length ? `<div class="note-box warning" role="status" style="margin-bottom:18px">${warnings.map(item => `Bilty ${esc(item.bilty)}: advance is greater than its bilty total.`).join("<br>")}<br>You can continue and save these amounts.</div>` : "";
}
function shipmentSidebarTotal(form) {
  return form.kind === "booking"
    ? goodsCash(form.items.reduce((sum, item) => sum + itemTotal(item, form.kind), 0), form.kind)
    : cash(Math.round(Number(form.header.truck_amount || 0) * 100));
}
function shipmentForm() {
  let f = currentForm,
    h = f.header,
    booking = f.kind === "booking";
  $("#main").innerHTML =
    head(
      f.pendingId ? "Approve incoming goods" : f.id ? "Edit " + (booking ? "booking" : "incoming goods") : booking ? "New booking" : "Record incoming goods",
      "A few clear steps. One place for all the details.",
      btn("Cancel", "cancel-shipment"),
    ) +
    `${f.pendingId ? `<div class="note-box warning" style="margin-bottom:20px">Submitted by ${esc(f.submittedName)}. Review and correct all details before approving. This entry is not yet in the main system.</div>` : ""}${isOperations() && !booking ? `<div class="note-box" style="margin-bottom:20px">Review and submit for super admin approval. The arrival will enter the main system after approval.</div>` : ""}${f.id ? `<div class="note-box warning" style="margin-bottom:20px">Editing ${esc(h.reference)}. Changes are recorded in the revision history. Existing bilties stay linked to their deliveries; recorded collections and original imported receipts are unchanged.</div>` : ""}<div class="steps">${["Shipment details", "Add bilties", isOperations() && !booking ? "Review & submit" : "Review & save"].map((s, i) => `${i ? '<span class="step-line"></span>' : ""}<div class="step ${f.step >= i ? "active" : ""}"><span>${f.step > i ? "✓" : i + 1}</span>${s}</div>`).join("")}</div><form id="shipment-form"><div class="form-layout"><section class="panel"><div class="panel-head"><div><h2>${["Where are the goods coming from?", "Add the goods in this shipment", "Everything look right?"][f.step]}</h2><p>${["Enter the date, station and transport details.", "All bilties in one list. Add a bilty, or select a row to edit it.", "Review the details below before saving."][f.step]}</p></div></div><div class="panel-body">${f.step > 0 ? shipmentAmountWarnings() : ""}${
      f.step === 0
        ? `<div class="form-grid">${field("dated", 'Date <span class="required">*</span>', h.dated, "date", "required")}${selectField("station_id", booking ? "Destination station *" : "Origin station *", stationOptions(), h.station_id, true)}${field("truck", 'Truck number <span class="required">*</span>', h.truck, "text", 'required placeholder="e.g. ABC-123" maxlength="30"')}${field("challan", "Challan number", h.challan)}${field("driver", "Driver name", h.driver)}${field("driver_mobile", "Driver mobile", h.driver_mobile, "tel")}${field("driver_cnic", "Driver CNIC", h.driver_cnic)}${field("truck_amount", booking ? "Truck rent / amount (Rs)" : "Truck delivery / amount (Rs)", h.truck_amount, "number", 'min="0" step="0.01"')}${!booking ? field("labour_bonus", "Labour Bonus (Rs)", h.labour_bonus || "0", "number", 'min="0" step="0.01"') + field("munshi_bonus", "Munshi Bonus (Rs)", h.munshi_bonus || "0", "number", 'min="0" step="0.01"') : ""}${booking ? field("commission", "Commission amount (Rs)", h.commission, "number", 'min="0" step="0.01"') : ""}${field("remarks", "Remarks", h.remarks, "text", 'maxlength="500"', true)}</div>`
        : f.step === 1
          ? draftBiltyList()
          : detailCells([
              ["Type", booking ? "Booking" : "Incoming"],
              ["Date", fmtdate(h.dated)],
              [
                "Station",
                lookups.stations.find(
                  (s) => String(s.id) === String(h.station_id),
                )?.name,
              ],
              ["Truck", h.truck],
              ["Driver", h.driver],
              ["Challan", h.challan],
            ]) +
            shipmentBreakdown(f.items, f.kind, h, true) +
            shipmentDetailTable(f.items, f.kind, true) + (!booking ? goodsAnalyticsSection(f.items) : "") +
            `<div class="note-box" style="margin-top:20px">${isOperations() && !booking ? "Submitting sends this entry to Pending incoming goods. It will appear in goods and delivery searches only after super admin approval." : "Saving records the shipment and its bilties. It does not automatically post an accounting voucher."}</div>`
    }<div id="form-error" class="error" hidden></div></div></section><aside><section class="panel sticky"><div class="panel-head"><h2>Shipment summary</h2>${icon("box")}</div><div class="panel-body"><div class="summary-row"><span>Type</span><strong>${booking ? "Booking" : "Incoming"}</strong></div><div class="summary-row"><span>Bilties</span><strong id="sum-bilties">${f.items.length}</strong></div><div class="summary-row"><span>Quantity</span><strong id="sum-qty">${num(f.items.reduce((s, i) => s + Number(i.qty || 0), 0))}</strong></div><div class="summary-row"><span>Advance recorded</span><strong id="sum-advance">${cash(f.items.reduce((s, i) => s + Math.round(Number(i.advance || 0) * 100), 0))}</strong></div><div class="summary-total"><span>${booking ? "Bilty totals" : "Truck delivery / amount"}</span><b id="sum-total">${shipmentSidebarTotal(f)}</b></div><p class="note" style="margin-top:22px">${booking ? "Bilty total = rent + loading + bilty amount + local charges. Truck rent and commission remain separate." : "Truck delivery amount entered in shipment details. Bilty and godown charges are not included."}</p></div></section></aside></div><div class="form-actions">${f.step ? btn("Back", "shipment-back") : btn("Cancel", "cancel-shipment")}<button class="btn primary" type="submit">${f.step === 2 ? (f.pendingId ? "Approve & save incoming goods" : isOperations() && !booking ? "Submit for approval" : "Save " + (booking ? "booking" : "incoming goods")) : "Continue"} ${icon(f.step === 2 ? "check" : "arrow")}</button></div></form>`;
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function draftBiltyList() {
  let items = currentForm.items;
  return `<div class="bilty-list-tools"><div><b>${items.length} ${items.length === 1 ? "bilty" : "bilties"}</b><p>Added to this shipment. Save the shipment after reviewing.</p></div>${btn("Add bilty", "add-bilty", true, "plus")}</div>${items.length ? `<div class="table-scroll draft-bilties"><table><thead><tr><th>#</th><th>Bilty / customer</th><th>Party to</th><th class="number">Qty</th><th class="number">Total</th><th class="number">Advance</th><th>Actions</th></tr></thead><tbody>${items.map((i, n) => `<tr><td>${String(n + 1).padStart(2, "0")}</td><td><button type="button" class="link" data-action="edit-bilty" data-index="${n}">${esc(i.bilty)}</button><small>${esc(lookups.accounts.find((a) => a.id === i.account_id)?.name || i.account_id)}</small></td><td><strong>${esc(i.party_to)}</strong><small>${esc(goodsTypeLabel(i)||i.detail||"")}</small>${i.detail && goodsTypeLabel(i) && i.detail!==goodsTypeLabel(i)?`<small>${esc(i.detail)}</small>`:""}</td><td class="number">${num(i.qty)}</td><td class="number">${goodsCash(itemTotal(i), currentForm.kind)}</td><td class="number">${cash(Math.round(Number(i.advance || 0) * 100))}</td><td><div class="buttons"><button type="button" class="icon-btn" data-action="edit-bilty" data-index="${n}" aria-label="Edit bilty ${esc(i.bilty)}">${icon("edit")}</button><button type="button" class="icon-btn" data-action="remove-bilty" data-index="${n}" aria-label="Remove bilty ${esc(i.bilty)}">${icon("close")}</button></div></td></tr>`).join("")}</tbody><tfoot><tr><td colspan="3">Shipment totals</td><td class="number">${num(items.reduce((n, i) => n + Number(i.qty), 0))}</td><td class="number">${goodsCash(items.reduce((n, i) => n + itemTotal(i), 0), currentForm.kind)}</td><td class="number">${cash(items.reduce((n, i) => n + Math.round(Number(i.advance || 0) * 100), 0))}</td><td></td></tr></tfoot></table></div>` : `<div class="bilty-list-empty"><span class="metric-icon">${icon("box")}</span><h3>No bilties added yet</h3><p>Add your first bilty. Each one will appear as a row in this list.</p>${btn("Add your first bilty", "add-bilty", true, "plus")}</div>`}`;
}
let biltyDraft = null,
  pickerIndex = -1,
  pickerMatches = [];
function openBilty(index = null) {
  if (!currentForm || currentForm.step !== 1) return;
  if (index === null && currentForm.items.length >= 100)
    return toast("A shipment can contain up to 100 bilties.");
  const item = index === null ? blankItem() : { ...currentForm.items[index] };
  biltyDraft = { index, initial: JSON.stringify(item) };
  const customer = lookups.accounts.find((a) => a.id === item.account_id);
  const booking = currentForm.kind === "booking";
  const f = (key, label, type = "text", extra = "", wide = false) =>
    field(key, label, item[key], type, extra, wide);
  modal(
    index === null ? "Add a bilty" : "Edit bilty " + esc(item.bilty),
    "Choose a customer, enter the goods, then save to your shipment list.",
    `<form id="bilty-form"><div class="bilty-dialog-content"><div class="bilty-main-fields"><div class="bilty-section-title"><span>01</span><h3>Customer & goods</h3></div><div class="field customer-picker"><label for="bilty-customer-search">Customer <span class="required">*</span></label><input id="bilty-customer-search" role="combobox" aria-expanded="false" aria-autocomplete="list" aria-controls="bilty-customer-results" autocomplete="off" placeholder="Search by name, account code or phone…" value="${esc(customer?.name || "")}" required><input type="hidden" name="account_id" value="${esc(item.account_id)}"><div id="bilty-customer-results" class="customer-picker-results" role="listbox" aria-label="Customer matches" hidden></div><small id="bilty-customer-hint">${customer ? esc(customer.id) + " · Customer selected" : "Start typing, then choose a customer from the results."}</small></div><div class="form-grid" style="margin-top:20px">${f("bilty", 'Bilty number <span class="required">*</span>', "text", 'required maxlength="40" placeholder="e.g. 10234"')}${f("qty", 'Quantity <span class="required">*</span>', "number", 'required min="1" max="999999" step="1"')}${!booking ? goodsPicker(item) : ""}${f("party_from", "Party from", "text", 'maxlength="100" placeholder="Sender’s name"')}${f("party_to", "Party to", "text", 'maxlength="100" placeholder="Receiver / party name"')}${f("contact", "Contact number", "tel", 'maxlength="40"')}${f("city", "City", "text", 'maxlength="80"')}${f("detail", "Goods description", "text", 'maxlength="250" placeholder="e.g. cartons, bags, spare parts"', true)}</div><details class="bilty-remarks" ${item.remarks ? "open" : ""}><summary>Remarks (optional)</summary><div class="form-grid">${f("remarks", "Remarks", "text", 'maxlength="250"', true)}</div></details></div><aside class="bilty-charge-panel"><div class="bilty-section-title"><span>02</span><h3>Charges & advance</h3></div><div class="bilty-currency">All amounts in Pakistani rupees (Rs)</div><div class="form-grid">${(booking ? ["rent", "loading", "bilty_amount", "local_charge", "advance"] : ["bilty_amount", "godown", "loading", "suzuki", "advance"]).map((k) => f(k, { rent: "Rent", loading: "Loading", bilty_amount: "Bilty amount", local_charge: "Local charges", godown: "Godown charges", advance: "Advance", suzuki: "Suzuki kiraya" }[k] + " (Rs)", "number", 'required min="0" max="9999999999.99" step="0.01"')).join("")}</div><div class="bilty-amount-summary"><div><span>Bilty total</span><strong id="bilty-live-total"></strong></div><div><span>After advance</span><b id="bilty-live-remaining"></b></div></div><p class="note">${booking ? "Total = rent + loading + bilty amount + local charges." : "Total = bilty amount + godown charges. Loading and Suzuki are separate."}</p></aside></div><div class="bilty-popup-footer"><div id="bilty-warning" class="note-box warning" role="status" hidden></div><div class="error" id="form-error" role="alert" hidden></div><div class="bilty-popup-actions"><span class="bilty-draft-note">${icon("info")} Saved to the list until you save the shipment.</span><div class="buttons">${btn("Cancel", "cancel-bilty")}<button class="btn" type="submit" name="bilty_action" value="another">Save & add another ${icon("plus")}</button><button class="btn primary" type="submit" name="bilty_action" value="save">${icon("check")}Save bilty</button></div></div></div></form>`,
  );
  $("#modal").classList.add("bilty-dialog");
  updateGoodsOptions();
  updateBiltyTotals();
}
function readBiltyDraft() {
  const form = $("#bilty-form");
  if (!form) return null;
  const data = Object.fromEntries(new FormData(form));
  const item = blankItem();
  if (biltyDraft?.index !== null && biltyDraft?.index !== undefined) item.id = currentForm.items[biltyDraft.index].id;
  for (const k of Object.keys(item))
    if (k in data) item[k] = String(data[k]).trim();
  if(!form.elements.namedItem("goods_type") && biltyDraft?.index !== null && biltyDraft?.index !== undefined){const previous=currentForm.items[biltyDraft.index];for(const key of ["goods_category_id","goods_subcategory_id","goods_custom","goods_type"])item[key]=previous[key]??"";}
  if(form.elements.namedItem("goods_type")){
    const other=$(".goods-search-picker",form)?.dataset.mode==='other';
    if(other){item.goods_subcategory_id="";item.goods_custom=String(data.goods_custom||"").trim();item.goods_type=item.goods_custom;}
    else {item.goods_custom="";}
    if(!item.detail)item.detail=item.goods_type;
  }
  return item;
}
function updateBiltyTotals() {
  let i = readBiltyDraft();
  if (!i) return;
  let total = itemTotal(i),
    advance = Math.round(Number(i.advance || 0) * 100);
  const warning = $("#bilty-warning");
  warning.hidden = advance <= total;
  warning.textContent = "Advance is greater than the bilty total. You can still save these amounts.";
  $("#bilty-live-total").textContent = goodsCash(total, currentForm.kind);
  $("#bilty-live-remaining").textContent = goodsCash(total - advance, currentForm.kind);
  $("#bilty-live-remaining").classList.toggle(
    "invalid-amount",
    advance > total,
  );
}
function customerSuggestions() {
  const input = $("#bilty-customer-search");
  if (!input) return;
  const q = input.value.trim().toLowerCase();
  const all = lookups.accounts.filter(
    (a) =>
      a.customer &&
      a.status === "A" &&
      (!q ||
        [a.name, a.id, a.mobile, a.phone, a.address, a.area].some((v) =>
          String(v || "")
            .toLowerCase()
            .includes(q),
        )),
  );
  pickerMatches = all.slice(0, 7);
  pickerIndex = -1;
  const list = $("#bilty-customer-results");
  list.innerHTML = `<div class="picker-caption">${q ? "Matching customers" : "Choose a customer"}<span>${all.length > 7 ? "First 7 · type to narrow" : all.length + " found"}</span></div>${pickerMatches.map((a, n) => `<button type="button" role="option" aria-selected="false" id="customer-result-${n}" data-action="select-bilty-customer" data-id="${esc(a.id)}"><span class="avatar">${esc(a.name.slice(0, 2).toUpperCase())}</span><span><b>${esc(a.name)}</b><small>${esc(a.id)}${a.mobile || a.phone ? " · " + esc(a.mobile || a.phone) : ""}</small></span>${icon("chevron")}</button>`).join("") || '<div class="picker-no-results">No customers found. Try a name or account code.</div>'}`;
  list.hidden = false;
  input.setAttribute("aria-expanded", "true");
  input.removeAttribute("aria-activedescendant");
}
function hideCustomerSuggestions() {
  const input = $("#bilty-customer-search"),
    list = $("#bilty-customer-results");
  if (list) list.hidden = true;
  if (input) {
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  }
  pickerIndex = -1;
}
function selectBiltyCustomer(id) {
  const a = lookups.accounts.find(
    (a) => a.id === id && a.customer && a.status === "A",
  );
  if (!a) return;
  $("#bilty-customer-search").value = a.name;
  $('#bilty-form [name="account_id"]').value = a.id;
  $("#bilty-customer-hint").textContent = a.id + " · Customer selected";
  hideCustomerSuggestions();
  $("#bilty-customer-search").focus();
  hideCustomerSuggestions();
}
function closeBilty() {
  if (!biltyDraft) {
    closeModal();
    return;
  }
  const item = readBiltyDraft();
  if (
    item &&
    JSON.stringify(item) !== biltyDraft.initial &&
    !confirm(APG.t("Discard the unsaved changes to this bilty?"))
  )
    return;
  biltyDraft = null;
  closeModal();
}
function saveBilty(mode) {
  let i = readBiltyDraft();
  if (!i || !biltyDraft || !currentForm)
    throw Error("Reopen this bilty and try again.");
  if($(".goods-search-picker")?.dataset.mode==='other'&&!i.goods_custom)throw Error("Enter a custom goods type.");
  const goodsInput=$("#bilty-goods-search");
  if(goodsInput?.value.trim()&&!i.goods_subcategory_id&&$(".goods-search-picker")?.dataset.mode!=='other'){
    const matches=goodsCatalog().subcategories.filter(row=>row.name.toLowerCase()===goodsInput.value.trim().toLowerCase());
    if(matches.length===1){selectGoodsType(matches[0].id);i=readBiltyDraft();}
    else throw Error("Choose a goods type from the results, or select Other to enter a custom type.");
  }
  if (
    !lookups.accounts.some(
      (a) => a.id === i.account_id && a.customer && a.status === "A",
    )
  )
    throw Error("Choose a customer from the search results.");
  if (!i.bilty)
    throw Error("Bilty number is required.");
  if (!/^\d+$/.test(i.qty) || Number(i.qty) < 1 || Number(i.qty) > 999999)
    throw Error("Quantity must be a whole number greater than zero.");
  for (const k of [
    "bilty_amount",
    "godown",
    "loading",
    "suzuki",
    "rent",
    "local_charge",
    "advance",
  ])
    if (!/^\d{1,10}(\.\d{1,2})?$/.test(i[k]))
      throw Error("Enter valid amounts with up to two decimal places.");
  if (
    currentForm.items.some(
      (r, n) => n !== biltyDraft.index && r.bilty === i.bilty,
    )
  )
    throw Error("This bilty number is already in the shipment.");
  if (biltyDraft.index === null) currentForm.items.push(i);
  else currentForm.items[biltyDraft.index] = i;
  biltyDraft = null;
  closeModal();
  shipmentForm();
  toast("Bilty " + i.bilty + " added to the shipment list.");
  if (mode === "another") openBilty();
}
function goodsCatalog() {return lookups.goods_catalog || {categories:[],subcategories:[]};}
function goodsTypeLabel(item) {return item.goods_subcategory_name || goodsCatalog().subcategories.find(row=>String(row.id)===String(item.goods_subcategory_id))?.name || item.goods_custom || item.goods_type || "";}
function goodsCategoryLabel(item) {return item.goods_category_name || goodsCatalog().categories.find(row=>String(row.id)===String(item.goods_category_id))?.name || (goodsTypeLabel(item)?"Other / custom":"Uncategorised");}
let goodsPickerMatches = [], goodsPickerIndex = -1;
function goodsPicker(item) {
 const label=goodsTypeLabel(item),custom=!!(item.goods_custom&&!item.goods_subcategory_id),mode=custom?'other':item.goods_subcategory_id?'known':'empty';
 return `<div class="goods-picker field wide customer-picker goods-search-picker" data-mode="${mode}"><label for="bilty-goods-search">Goods type</label><input id="bilty-goods-search" role="combobox" aria-expanded="false" aria-autocomplete="list" aria-controls="bilty-goods-results" autocomplete="off" maxlength="100" placeholder="Search goods, e.g. Cotton Shoes or Bag Tea…" value="${esc(custom?'Other / custom':label)}"><input type="hidden" name="goods_category_id" value="${esc(item.goods_category_id|| (custom?'other':''))}"><input type="hidden" name="goods_subcategory_id" value="${esc(item.goods_subcategory_id||'')}"><input type="hidden" name="goods_type" value="${esc(label)}"><div id="bilty-goods-results" class="customer-picker-results" role="listbox" aria-label="Goods type matches" hidden></div><div id="goods-custom-field" class="goods-custom-field" ${custom?'':'hidden'}>${field("goods_custom","Custom goods type",item.goods_custom||"","text",`maxlength="100" placeholder="Type the goods type…" ${custom?'required':''}`)}</div><small id="goods-type-hint">${custom?'Enter your custom goods type below.':'Type to search, then choose a goods type. Choose Other for a custom entry.'}</small></div>`;
}
function hideGoodsSuggestions() {
 const input=$("#bilty-goods-search"),list=$("#bilty-goods-results");if(list)list.hidden=true;if(input){input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');}goodsPickerIndex=-1;
}
function updateGoodsOptions() {hideGoodsSuggestions();}
function goodsSuggestions() {
 const input=$("#bilty-goods-search");if(!input)return;
 const picker=input.closest('.goods-search-picker'),q=(picker.dataset.mode==='other'&&input.value==='Other / custom'?'':input.value.trim()).toLowerCase();
 const all=goodsCatalog().subcategories.filter(row=>!q||row.name.toLowerCase().includes(q));
 goodsPickerMatches=[...all.slice(0,7),{id:'other',name:'Other / custom'}];goodsPickerIndex=-1;
 const list=$("#bilty-goods-results");
 list.innerHTML=`<div class="picker-caption">${q?'Matching goods types':'Choose a goods type'}<span>${all.length>7?'First 7 · type to narrow':all.length+' found'}</span></div>`+goodsPickerMatches.map((row,index)=>`<button type="button" role="option" aria-selected="false" id="goods-result-${index}" data-action="select-goods-type" data-id="${row.id}"><span class="avatar">${row.id==='other'?'+':esc(row.name.slice(0,2).toUpperCase())}</span><span><b>${esc(row.name)}</b><small>${row.id==='other'?'Type a custom goods type':'Select goods type'}</small></span>${icon('chevron')}</button>`).join('');
 list.hidden=false;input.setAttribute('aria-expanded','true');
}
function selectGoodsType(id) {
 const form=$("#bilty-form"),input=$("#bilty-goods-search");if(!form||!input)return;
 const custom=String(id)==='other',row=custom?null:goodsCatalog().subcategories.find(row=>String(row.id)===String(id));if(!custom&&!row)return;
 const picker=input.closest('.goods-search-picker'),previous=form.elements.namedItem('goods_type').value||input.dataset.previousType||'',description=form.elements.namedItem('detail'),query=input.value.trim();
 form.elements.namedItem('goods_category_id').value=custom?'other':row.category_id;
 form.elements.namedItem('goods_subcategory_id').value=custom?'':row.id;
 const customInput=form.elements.namedItem('goods_custom');
 if(custom){if(query!=='Other / custom'&&!goodsCatalog().subcategories.some(row=>row.name.toLowerCase()===query.toLowerCase()))customInput.value=query;}
 else customInput.value='';
 customInput.required=custom;$("#goods-custom-field").hidden=!custom;
 const value=custom?customInput.value:row.name;form.elements.namedItem('goods_type').value=value;
 if(previous&&description.value===previous)description.value=value;
 input.value=custom?'Other / custom':row.name;input.dataset.previousType=value;picker.dataset.mode=custom?'other':'known';
 $("#goods-type-hint").textContent=custom?'Enter your custom goods type below.':'Goods type selected.';
 hideGoodsSuggestions();if(custom)customInput.focus();else input.focus();hideGoodsSuggestions();updateBiltyTotals();
}
function goodsAnalyticsSection(rows,title="Goods analytics",includeEmpty=false) {
 const groups=new Map();
 for(const row of rows){const category=row.category || goodsCategoryLabel(row), subtype=row.subcategory || goodsTypeLabel(row) || "Uncategorised", key=(category+"|"+subtype).toLowerCase();const group=groups.get(key)||{category,subtype,quantity:0,bilties:0};group.quantity+=Number(row.quantity??row.qty??0);group.bilties+=Number(row.bilties??1);groups.set(key,group);}
 const totals=new Map(includeEmpty?goodsCatalog().categories.map(row=>[row.name,{quantity:0,bilties:0}]):[]);for(const group of groups.values()){const total=totals.get(group.category)||{quantity:0,bilties:0};total.quantity+=group.quantity;total.bilties+=group.bilties;totals.set(group.category,total);}
 return `<section class="goods-analysis"><div class="section-heading"><div><h2>${esc(title)}</h2><p>Quantity and bilty counts by category</p></div></div><div class="goods-category-metrics">${[...totals].map(([name,total])=>`<div><span>${esc(name)}</span><strong>${num(total.quantity)}</strong><small>Quantity · ${num(total.bilties)} bilties</small></div>`).join("")}</div><div class="table-scroll"><table><thead><tr><th>Main category</th><th>Subcategory / custom type</th><th class="number">Quantity</th><th class="number">Bilties</th></tr></thead><tbody>${[...groups.values()].sort((a,b)=>b.quantity-a.quantity).map(group=>`<tr><td>${esc(group.category)}</td><td>${esc(group.subtype)}</td><td class="number"><strong>${num(group.quantity)}</strong></td><td class="number">${num(group.bilties)}</td></tr>`).join("")}</tbody></table></div>${!groups.size?'<p class="note">Add bilties to see their goods breakdown.</p>':""}<p class="note">Uncategorised entries keep their original descriptions. Exact known descriptions are classified automatically.</p></section>`;
}
function goodsCategoriesPage() {
 const catalog=goodsCatalog();return head("Goods categories","Manage the main categories and searchable subcategories used in incoming goods.")+`<div class="goods-management"><section class="panel"><div class="panel-head"><h2>Add main category</h2></div><form id="goods-category-form" class="panel-body">${field("category_name","Category name","","text",'required maxlength="100"')}<div class="error" data-form-error hidden></div><button type="submit" class="btn primary">Add category</button></form></section><section class="panel"><div class="panel-head"><h2>Add subcategory</h2></div><form id="goods-subcategory-form" class="panel-body">${selectField("category_id","Main category",[["","Choose category"],...catalog.categories.map(row=>[row.id,row.name])],"",true)}${field("subcategory_name","Subcategory name","","text",'required maxlength="100"')}<div class="error" data-form-error hidden></div><button type="submit" class="btn primary">Add subcategory</button></form></section></div><div class="goods-management">${catalog.categories.map(category=>`<section class="panel"><div class="panel-head"><h2>${esc(category.name)}</h2><button class="link" data-action="edit-goods-category" data-id="${category.id}">Edit category</button><span>${catalog.subcategories.filter(row=>row.category_id===category.id).length} subcategories</span></div><div class="panel-body goods-name-list">${catalog.subcategories.filter(row=>row.category_id===category.id).map(row=>`<button class="btn" data-action="edit-goods-subcategory" data-id="${row.id}" title="Edit subcategory">${esc(row.name)} ${icon("edit")}</button>`).join("")||'<p class="note">No subcategories yet.</p>'}</div></section>`).join("")}</div>`;
}
function editGoodsCategory(id,kind) {
 if(!isSuper())throw Error("Only the super admin can edit goods categories.");
 const catalog=goodsCatalog(),row=(kind==='category'?catalog.categories:catalog.subcategories).find(row=>String(row.id)===String(id));if(!row)throw Error("Category unavailable. Refresh and try again.");
 modal(kind==='category'?"Edit category":"Edit subcategory","Existing goods keep their category links.",`<form id="goods-rename-form"><input type="hidden" name="id" value="${row.id}"><input type="hidden" name="kind" value="${kind}"><input type="hidden" name="original_name" value="${esc(row.name)}">${kind==='subcategory'?`<p class="note">Main category: ${esc(catalog.categories.find(category=>category.id===row.category_id)?.name||"—")}</p>`:""}${field("name","Name",row.name,"text",'required maxlength="100"')}<div class="error" id="form-error" hidden></div><div class="form-actions">${btn("Cancel","close-modal")}<button class="btn primary" type="submit">Save changes</button></div></form>`);
}
async function goodsAnalyticsPage() {
 const data=await api("goods_analytics",null,{from:state.from||"",to:state.to||"",status:state.goodsStatus||"pending"});
 return head("Goods analytics","Approved incoming goods only. Pending submissions enter these totals after approval.")+`<section class="panel"><div class="panel-body"><div class="form-grid"><div class="field"><label for="goods-analytics-status">Goods status</label><select id="goods-analytics-status"><option value="pending" ${(state.goodsStatus||'pending')==='pending'?'selected':''}>Awaiting delivery</option><option value="all" ${state.goodsStatus==='all'?'selected':''}>All arrivals</option><option value="delivered" ${state.goodsStatus==='delivered'?'selected':''}>Delivered</option></select></div><div class="field"><label for="filter-from">From date</label><input id="filter-from" type="date" value="${esc(state.from||'')}"></div><div class="field"><label for="filter-to">To date</label><input id="filter-to" type="date" value="${esc(state.to||'')}"></div></div>${detailCells([["Total quantity",num(data.totals.quantity)],["Bilties",num(data.totals.bilties)],["Shipments",num(data.totals.shipments)]])}</div></section>`+goodsAnalyticsSection(data.rows,"Goods analytics",true);
}
function deliveryFacts(rows) {
  return `<dl class="delivery-facts">${rows.map(([label,value,wide])=>`<div${wide?' class="delivery-fact-wide"':''}><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join("")}</dl>`;
}
function deliveryBiltyCard(r) {
  return `<section class="bilty-card delivery-card"><header class="delivery-card-head"><div><h3>Bilty ${esc(r.bilty)}</h3><p>${esc(r.customer || r.party_to || "—")}</p></div><button type="button" class="link" data-action="delivery-remove" data-id="${r.id}">Remove</button></header>
    ${deliveryFacts([["Party to",r.party_to||"—",true],["Station",r.station||"—"],["Arrival date",fmtdate(r.dated)],["Quantity",num(r.qty)],["Goods type / description",[goodsTypeLabel(r),r.detail!==goodsTypeLabel(r)?r.detail:""].filter(Boolean).join(" · ")||"Not recorded",true]])}
    <div class="delivery-charge-breakdown">${deliveryFacts([["Bilty charges",cash(r.bilty_amount)],["Godown charges",cash(r.godown)],["Advance",cash(r.advance)],["Arrival loading + Suzuki",cash(r.loading+r.suzuki)]])}</div>
    <div class="delivery-total-banner"><span>Bilty total</span><strong>${goodsCash(r.total)}</strong></div>
    <div class="delivery-input-section"><h4>Service charges</h4><div class="form-grid">${field("loading_"+r.id,"Loading charge (Rs)",(r.loading/100).toFixed(2),"number",'required min="0" step="0.01"')}${field("suzuki_"+r.id,"Suzuki charge (Rs)",(r.suzuki/100).toFixed(2),"number",'required min="0" step="0.01"')}</div></div>
    ${deliveryEdit?.id && !deliveryEdit.cash_workflow ? `<div class="delivery-input-section"><h4>Cash collection</h4><div class="form-grid">${field("discount_"+r.id,"Discount (Rs)","0","number",'min="0" step="0.01"',true)}${field("bilty_received_"+r.id,"Bilty cash received (Rs)","0","number",'min="0" step="0.01"')}${field("service_received_"+r.id,"Loading / Suzuki received (Rs)","0","number",'min="0" step="0.01"')}</div></div>` : `<div class="delivery-input-section"><h4>Discount</h4>${field("discount_"+r.id,"Discount (Rs)","0","number",'min="0" step="0.01"')}</div>`}
    <div class="delivery-line-totals" data-delivery-totals="${r.id}" aria-live="polite"></div></section>`;
}
let deliveryEdit = null;
async function editDelivery(id) {
  if(!can("deliveries.edit"))throw Error("You do not have permission to edit deliveries.");
  const delivery = await api("delivery",null,{id});
  const values={dated:delivery.dated,receiver:delivery.receiver,mobile:delivery.mobile||"",cnic:delivery.cnic||"",remarks:delivery.remarks||""};
  closeModal();selected.clear();
  for(const item of delivery.items){const row={...item};const original=delivery.print_items?.find(line=>String(line.source_id)===String(row.delivery_source_id));if(original){row.bilty_amount=original.bilty_amount;row.godown=original.godown;row.total=Number(original.bilty_amount)+Number(original.godown);row.loading=original.loading;row.suzuki=original.suzuki;}
    selected.set(row.id,row);for(const key of ["loading","suzuki","discount","bilty_received","service_received"])values[key+"_"+row.id]=(Number(row[key]||0)/100).toFixed(2);}
  recordDelivery(values,{id:delivery.id,version:delivery.version,reference:delivery.reference,cash_workflow:delivery.cash_workflow,cash_started:delivery.cash_started});
}
function recordDelivery(values = {}, edit = null) {
  deliveryEdit = edit;
  let rows = [...selected.values()];
  modal(
    edit?.pending_id ? "Approve delivery goods · " + esc(edit.reference) : edit ? "Edit delivery · " + esc(edit.reference) : "Delivery goods",
    rows.length + " bilty selected · Record the handover details.",
    `<form id="delivery-form">${isOperations() && !edit ? '<div class="note-box">Save the delivery goods now. Any cash you collect will be submitted separately for admin approval.</div>' : ""}<div id="delivery-warning" class="note-box warning" role="status" hidden></div><div class="form-grid">${field("dated", "Delivery date *", today(), "date", "required")}${field("receiver", "Receiver name *", "", "text", "required")}${field("mobile", "Receiver mobile", "", "tel")}${field("cnic", "Receiver CNIC")}${field("remarks", "Remarks", "", "text", "", true)}</div><hr class="divider"><div class="delivery-lookup"><label for="delivery-bilty-number">Add by bilty number</label><div class="buttons"><input id="delivery-bilty-number" placeholder="Enter bilty number…" autocomplete="off" maxlength="40"><button type="button" class="btn" data-action="delivery-fetch">Fetch details</button></div><div id="delivery-matches" role="status" aria-live="polite"></div><p class="note">Fetch a bilty, choose its arrival, and add another. All rows save under one delivery.</p></div><div id="delivery-combined" class="shipment-breakdown"></div>${rows.map(deliveryBiltyCard).join("")}<div class="note-box">${edit?.id && !edit.cash_workflow ? "Confirm loading and Suzuki charges above, including any charges agreed at handover. Enter the cash actually collected; amounts above the charges will show a warning and can still be saved. Any amount not collected remains for account review; this handover does not create a ledger posting." : "Save the goods handover here. Cash is collected separately in Delivery Cash Receiving after approval. Any unpaid amount stays against the bilty’s customer."}</div><div class="error" id="form-error" hidden></div><div class="form-actions">${btn("Cancel", "close-modal")}<button type="submit" class="btn primary">${icon("check")}Save delivery</button></div></form>`,
  );
  const form = $("#delivery-form");
  if(edit){$(".delivery-lookup",form).hidden=true;$$('[data-action="delivery-remove"]',form).forEach(button=>button.remove());$('button[type="submit"]',form).innerHTML=icon("check")+(edit.pending_id ? "Approve & save delivery" : "Save changes");}
  for (const [name, value] of Object.entries(values)) {
    const input = form.elements.namedItem(name);
    if (input) input.value = value;
  }
  if(edit?.cash_started){for(const input of $$('[name="dated"],[name^="loading_"],[name^="suzuki_"],[name^="discount_"]',form))input.readOnly=true;form.insertAdjacentHTML("afterbegin",'<p class="note-box">Cash processing has started. You can correct receiver details and remarks; invoiced amounts and the handover date stay locked.</p>');}
  updateDeliveryWarnings();
  modalSnapshot = modalValues();
}
let deliveryMatches = new Map(), deliveryLookupSequence = 0, deliveryLookupTimer;
function deliveryValues() { return Object.fromEntries(new FormData($("#delivery-form"))); }
async function fetchDeliveryBilty() {
  const input = $("#delivery-bilty-number");
  if (!input) return;
  const number = input.value.trim(), sequence = ++deliveryLookupSequence;
  const box = $("#delivery-matches");
  deliveryMatches.clear();
  if (!number) { box.textContent = ""; return; }
  box.textContent = "Looking up bilty…";
  try {
    const result = await api("bilties", null, { kind: "incoming", status: "pending", bilty_exact: number });
    if (sequence !== deliveryLookupSequence || !document.contains(box) || input.value.trim() !== number) return;
    deliveryMatches = new Map(result.rows.map(row => [row.id, row]));
    box.innerHTML = result.rows.map(row => `<div class="delivery-match"><div><strong>Bilty ${esc(row.bilty)} · ${esc(row.customer || row.party_to || "—")}</strong><small><b>Party to:</b> ${esc(row.party_to || "—")}</small><small>${esc(row.station || "—")} · ${fmtdate(row.dated)} · ${esc(row.reference)} · Qty ${num(row.qty)} · ${cash(row.total)}</small><small>${esc(row.detail || "")}</small></div><button type="button" class="btn" data-action="delivery-add" data-id="${row.id}" ${selected.has(row.id) || row.delivery_submission_id ? "disabled" : ""}>${row.delivery_submission_id ? "Awaiting delivery approval" : selected.has(row.id) ? "Added" : "Add bilty"}</button></div>`).join("") || "No pending incoming bilty matches this number.";
    if(result.total > result.rows.length) box.insertAdjacentHTML("beforeend", '<p class="note">Many arrivals share this number. Use the pending goods list to choose an older arrival.</p>');
  } catch (error) { if (sequence === deliveryLookupSequence && document.contains(box)) box.textContent = error.message; }
}
function updateDeliveryWarnings() {
  const form = $("#delivery-form");
  if (!form) return;
  if(!(deliveryEdit?.id && !deliveryEdit.cash_workflow)){updateHandoverTotals(form);return;}
  const data = Object.fromEntries(new FormData(form));
  const warnings = [];
  for (const r of selected.values()) {
    const amount = (key) => Math.round(Number(data[key + "_" + r.id] || 0) * 100);
    const line = form.querySelector(`[data-delivery-totals="${r.id}"]`);
    if(line) line.innerHTML = `<div><span>Total charges</span><strong>${goodsCash(Number(r.total||0)+amount("loading")+amount("suzuki"))}</strong></div><div><span>Cash recorded</span><strong>${cash(amount("bilty_received")+amount("service_received"))}</strong></div>`;
    if (amount("discount") + amount("bilty_received") > Math.max(0, r.total - r.advance))
      warnings.push("Bilty " + r.bilty + ": cash plus discount is greater than the remaining bilty amount.");
    if (amount("service_received") > amount("loading") + amount("suzuki"))
      warnings.push("Bilty " + r.bilty + ": service cash is greater than loading plus Suzuki charges.");
  }
  const sum = (key) => [...selected.values()].reduce((n, r) => n + Number(r[key] || 0), 0);
  const entered = (key) => [...selected.values()].reduce((n, r) => n + Math.round(Number(data[key + "_" + r.id] || 0) * 100), 0);
  $("#delivery-combined").innerHTML = `<div class="delivery-summary-head"><h3>Delivery totals</h3><span>${num(selected.size)} bilties · Quantity ${num(sum("qty"))}</span></div>` + deliveryFacts([
    ["Bilty charges",cash(sum("bilty_amount"))],["Godown charges",cash(sum("godown"))],
    ["Bilties total",goodsCash(sum("total"))],["Advance",cash(sum("advance"))],
    ["Loading",cash(entered("loading"))],["Suzuki",cash(entered("suzuki"))],["Discount",cash(entered("discount"))],
    ["Total charges",goodsCash(sum("total")+entered("loading")+entered("suzuki"))],
    ["Bilty cash received",cash(entered("bilty_received"))],["Service cash received",cash(entered("service_received"))]
  ]) + `<div class="delivery-total-banner delivery-cash-banner"><span>Total cash received</span><strong>${cash(entered("bilty_received")+entered("service_received"))}</strong></div>`;
  const box = $("#delivery-warning");
  box.hidden = !warnings.length;
  box.textContent = warnings.join(" ") + (warnings.length ? " You can still save these amounts." : "");
}
function voucherForm(kind = "RV") {
  modal(
    { RV: "Receipt voucher", PV: "Payment voucher", JV: "Journal voucher" }[
      kind
    ] || "New voucher",
    "Create a balanced accounting transaction.",
    `<form id="voucher-form"><div class="form-grid">${selectField(
      "kind",
      "Voucher type",
      [
        ["RV", "Receipt · cash / bank received"],
        ["PV", "Payment · cash / bank paid"],
        ["JV", "Journal · account transfer"],
      ],
      kind,
      true,
    )}${field("dated", "Date *", today(), "date", "required")}${field("memo", "Description *", "", "text", 'required maxlength="500"', true)}</div><hr class="divider"><div id="voucher-lines">${voucherLine(0)}${voucherLine(1)}</div><button type="button" class="add-line" data-action="add-voucher-line">${icon("plus")}Add account line</button><div class="summary-total"><span id="voucher-balance">Enter matching debits and credits</span><b id="voucher-total">Rs 0</b></div><div class="note-box" style="margin-top:20px">For receipts, debit cash/bank and credit the customer. For payments, reverse these entries. Posted vouchers are kept in the activity log.</div><div class="error" id="form-error" hidden></div><div class="form-actions">${btn("Cancel", "close-modal")}<button type="submit" class="btn primary">Post voucher</button></div></form>`,
  );
}
function voucherLine(n) {
  return `<div class="bilty-card voucher-line" data-line="${n}" style="padding:14px"><div class="form-grid three">${field("account_" + n, "Account *", "", "text", 'list="account-options" required placeholder="Type account name…"')}${field("debit_" + n, "Debit (Rs)", "0", "number", 'min="0" step="0.01"')}${field("credit_" + n, "Credit (Rs)", "0", "number", 'min="0" step="0.01"')}</div>${n > 1 ? `<button type="button" class="link" data-action="remove-voucher-line" style="margin-top:10px">Remove line</button>` : ""}</div>`;
}
async function showVoucher(id) {
  let v = await api("voucher", null, { id });
  modal(
    esc(v.reference),
    fmtdate(v.dated) +
      " · " +
      { RV: "Receipt", PV: "Payment", JV: "Journal" }[v.kind],
    `<p>${esc(v.memo)}</p><div class="table-scroll"><table><thead><tr><th>Account</th><th class="number">Debit</th><th class="number">Credit</th></tr></thead><tbody>${v.lines.map((l) => `<tr><td>${esc(l.account)}<small>${esc(l.account_id)}</small></td><td class="number">${cash(l.debit)}</td><td class="number">${cash(l.credit)}</td></tr>`).join("")}</tbody></table></div>`,
    btn("Print voucher", "print-dialog", false, "print") +
      btn("Close", "close-modal"),
  );
  recordPrintContext = { kind: "voucher", data: structuredClone(v) };
}
// Thermal printing uses a frozen, escaped record snapshot, never the desktop layout.
let recordPrintContext = null;
let thermalSnapshot = null;
function thermalWidth() {
  try {
    return localStorage.getItem("apg.thermal.width") === "58" ? "58" : "80";
  } catch {
    return "80";
  }
}
function slipText(label, value) {
  if (value === null || value === undefined || value === "") return "";
  return `<div class="slip-row"><span class="slip-label">${esc(label)}</span><strong dir="auto">${esc(value)}</strong></div>`;
}
function slipMoney(label, value, emphasis = false) {
  return `<div class="slip-money-row ${emphasis ? "slip-total" : ""}"><span class="slip-label">${esc(label)}</span><strong class="slip-amount">${esc(cash(value))}</strong></div>`;
}
function slipBalance(label, value, emphasis = false) {
  return `<div class="slip-money-row ${emphasis ? "slip-total" : ""}"><span class="slip-label">${esc(label)}</span><strong class="slip-amount">${esc(cash(Math.abs(value)))} ${Number(value) >= 0 ? "Dr" : "Cr"}</strong></div>`;
}
function slipSection(title, content) {
  return `<section class="slip-section"><h3>${esc(title)}</h3>${content}</section>`;
}
function slipEntry(title, content) {
  return `<section class="slip-entry"><h3>${esc(title)}</h3>${content}</section>`;
}
function slipNote(text) {
  return `<p class="slip-note">${esc(text)}</p>`;
}
function slipPageScope(d) {
  const first = d.rows.length ? d.page * d.page_size + 1 : 0,
    last = Math.min((d.page + 1) * d.page_size, d.total);
  return slipNote(
    `CURRENT PAGE ONLY · ${first}–${last} of ${num(d.total)} records · Page ${d.page + 1}. Totals cover all matching records.`,
  );
}
function slipHeader(title, reference, date) {
  return `<header class="slip-header"><div class="slip-brand">APG<span>.</span></div><h1>AZAD PAKISTAN GOODS</h1><p>D. I. Khan · Goods & accounts</p><h2>${esc(title)}</h2>${date ? `<p>${esc(fmtdate(date))}</p>` : ""}${reference ? `<div class="slip-reference">${esc(reference)}</div>` : ""}</header>`;
}
function slipFooter() {
  const printed = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
  return `<footer class="slip-footer">${slipText("Printed by", displayName())}${slipText("Printed on", printed + " PKT")}<p>Please retain this slip.</p><b>Thank you.</b><span>AZAD PAKISTAN GOODS</span></footer>`;
}
function originalBiltyTotal(i, kind) {
  return kind === "booking"
    ? Number(i.rent || 0) +
        Number(i.loading || 0) +
        Number(i.bilty_amount || 0) +
        Number(i.local_charge || 0)
    : Number(i.bilty_amount || 0) + Number(i.godown || 0);
}
function buildThermalRecord(context) {
  const d = context.data;
  let title = "",
    reference = "",
    date = d.dated || "",
    content = "";
  if (context.kind === "bilty") {
    title = d.kind === "booking" ? "Booking bilty" : "Incoming bilty";
    reference = d.bilty || "Bilty";
    content = slipSection(
      "Goods & party",
      slipText("Shipment", d.reference) +
        slipText("Station", d.station) +
        slipText("Customer", d.customer || d.account_id) +
        slipText("From", d.party_from) +
        slipText("To", d.party_to) +
        slipText("Contact", d.contact) +
        slipText("City", d.city) +
        slipText("Quantity", d.qty) +
        slipText("Goods category", goodsCategoryLabel(d)) + slipText("Subcategory", goodsTypeLabel(d)) + slipText("Goods", d.detail) +
        slipText("Status", d.status),
    );
    const keys =
      d.kind === "booking"
        ? ["rent", "loading", "bilty_amount", "local_charge"]
        : ["bilty_amount", "godown", "loading", "suzuki"];
    const labels = {
      rent: "Rent",
      loading: "Loading",
      bilty_amount: "Bilty amount",
      local_charge: "Local charges",
      godown: "Godown",
      suzuki: "Suzuki kiraya",
    };
    content += slipSection(
      "Recorded charges",
      keys.map((k) => slipMoney(labels[k], d[k])).join("") +
        slipMoney("Bilty total", originalBiltyTotal(d, d.kind), true) +
        slipMoney("Advance", d.advance),
    );
    content +=
      slipText("Remarks", d.remarks) +
      slipNote(
        d.kind === "booking"
          ? "Truck rent and commission are separate from the bilty total."
          : "Bilty total includes bilty amount and godown. Loading and Suzuki charges are separate.",
      );
  } else if (context.kind === "shipment") {
    title = d.kind === "booking" ? "Booking sheet" : "Incoming goods sheet";
    reference = d.reference;
    content = slipSection(
      "Transport",
      slipText("Station", d.station) +
        slipText(
          "Destination address",
          d.kind === "booking" ? d.station_address : "",
        ) +
        slipText("Truck", d.truck) +
        slipText("Challan", d.challan) +
        slipText("Driver", d.driver) +
        slipText("Driver mobile", d.driver_mobile) +
        slipText("Driver CNIC", d.driver_cnic) +
        (d.kind === "incoming"
          ? slipMoney("Truck delivery / amount", d.truck_amount) + slipMoney("Labour Bonus", d.labour_bonus || 0) + slipMoney("Munshi Bonus", d.munshi_bonus || 0)
          : ""),
    );
    content += d.items
      .map((i, n) =>
        slipEntry(
          `${n + 1}. Bilty ${i.bilty || "—"}`,
          slipText("Customer", i.customer || i.account_id || i.party_from) +
            slipText("From", i.party_from) +
            slipText("To", i.party_to) +
            slipText("Quantity", i.qty) +
            slipText("Goods category", goodsCategoryLabel(i)) + slipText("Subcategory", goodsTypeLabel(i)) + slipText("Goods", i.detail) +
            slipText("Contact", i.contact) +
            slipText("City", i.city) +
            slipText("Status", i.status) +
            (d.kind === "booking"
              ? slipMoney("Rent", i.rent) +
                slipMoney("Loading", i.loading) +
                slipMoney("Bilty amount", i.bilty_amount) +
                slipMoney("Local charges", i.local_charge)
              : slipMoney("Bilty amount", i.bilty_amount) +
                slipMoney("Godown", i.godown)) +
            slipMoney("Bilty total", originalBiltyTotal(i, d.kind)) +
            slipMoney("Advance", i.advance),
        ),
      )
      .join("");
    content +=
      slipSection(
        "Shipment summary",
        slipText("Bilties", num(d.items.length)) +
          slipText(
            "Total quantity",
            num(d.items.reduce((s, i) => s + Number(i.qty || 0), 0)),
          ) +
          slipMoney(
            d.kind === "incoming" ? "Godown charges + Bilty charges" : "Bilty totals",
            d.items.reduce((s, i) => s + originalBiltyTotal(i, d.kind), 0),
            true,
          ) +
          slipMoney(
            "Advances",
            d.items.reduce((s, i) => s + Number(i.advance || 0), 0),
          ) +
          (d.kind === "incoming"
            ? slipMoney(
                "Bilty amounts",
                d.items.reduce((s, i) => s + Number(i.bilty_amount || 0), 0),
              ) +
              slipMoney(
                "Truck balance",
                d.items.reduce((s, i) => s + Number(i.bilty_amount || 0), 0) -
                  Number(d.truck_amount || 0),
              ) +
              slipNote("Truck balance = bilty amounts less truck amount.")
            : ""),
      ) +
      slipText("Remarks", d.remarks) +
      slipNote("Goods records do not automatically post accounting vouchers.");
  } else if (context.kind === "delivery") {
    const rows = d.print_items ?? d.items;
    const h = d.print_header || {
      reference: d.reference,
      dated: d.dated,
      receiver: d.receiver,
      mobile: d.mobile,
      cnic: d.cnic,
    };
    const cashSlip = context.variant === "cash";
    title = cashSlip ? "Cash received slip" : d.cash_workflow ? "Delivery handover" : "Delivery receipt";
    reference = h.reference || d.reference;
    date = h.dated;
    const sum = (key) => rows.reduce((n, i) => n + Number(i[key] || 0), 0);
    const totalBilty = rows.reduce(
      (n, i) => n + originalBiltyTotal(i, "incoming"),
      0,
    );
    content = slipSection(
      "Received by",
      slipText("Receiver", h.receiver) +
        slipText(
          "Received date",
          h.received_date ? fmtdate(h.received_date) : "",
        ) +
        slipText("Mobile", h.mobile) +
        slipText("CNIC", h.cnic),
    );
    content += rows
      .map((i, n) => {
        const bilty = originalBiltyTotal(i, "incoming"),
          services = Number(i.loading || 0) + Number(i.suzuki || 0);
        return slipEntry(
          `${n + 1}. Bilty ${i.bilty || "—"}`,
          slipText("Customer", i.customer || i.account_id) +
            slipText("Party to", i.party_to) +
            slipText("Quantity", i.qty) +
            slipMoney("Bilty total", bilty) +
            (cashSlip
              ? slipMoney("Services total", services) +
                slipMoney("Total", bilty + services, true) +
                slipMoney("Discount", i.discount) +
                slipMoney("Bilty cash", i.bilty_received) +
                slipMoney("Services cash", i.service_received)
              : slipMoney("Loading", i.loading) +
                slipMoney("Suzuki kiraya", i.suzuki)),
        );
      })
      .join("");
    content += cashSlip
      ? slipSection(
          "Cash summary",
          slipMoney("Bilty totals", totalBilty) +
            slipMoney("Services totals", sum("loading") + sum("suzuki")) +
            slipMoney(
              "Total charges",
              totalBilty + sum("loading") + sum("suzuki"),
            ) +
            slipMoney("Discounts", sum("discount")) +
            slipMoney("Bilty cash", sum("bilty_received")) +
            slipMoney("Services cash", sum("service_received")) +
            slipMoney(
              "Cash received",
              sum("bilty_received") + sum("service_received"),
              true,
            ),
        )
      : slipSection(
          "Receipt totals",
          slipMoney("Bilty total", totalBilty, true) +
            slipMoney("Loading", sum("loading")) +
            slipMoney("Suzuki kiraya", sum("suzuki")),
        );
    if(d.cash_summary)content+=slipSection('Cash receiving',slipText('Cash status',cashStatus(d.cash_summary.status))+slipMoney('Amount due',d.cash_summary.due)+slipMoney('Cash received',d.cash_summary.received)+slipMoney('Customer balance',d.cash_summary.outstanding,true)+slipMoney('Customer credit',d.cash_summary.credit));
    if (!rows.length)
      content += slipNote(
        "No printable lines are available for this original receipt.",
      );
    content +=
      slipText("Remarks", d.remarks) +
      slipNote(
        "Goods handover only. This slip does not create an accounting voucher.",
      );
  } else if (context.kind === "voucher") {
    title =
      { RV: "Receipt voucher", PV: "Payment voucher", JV: "Journal voucher" }[
        d.kind
      ] || "Accounting voucher";
    reference = d.reference;
    content =
      slipText("Description", d.memo) +
      d.lines
        .map((l, n) =>
          slipEntry(
            `${n + 1}. ${l.account || l.account_id}`,
            slipText("Account code", l.account_id) +
              (l.debit ? slipMoney("Debit", l.debit) : "") +
              (l.credit ? slipMoney("Credit", l.credit) : ""),
          ),
        )
        .join("");
    content += slipSection(
      "Voucher totals",
      slipMoney(
        "Debits",
        d.lines.reduce((s, l) => s + Number(l.debit || 0), 0),
        true,
      ) +
        slipMoney(
          "Credits",
          d.lines.reduce((s, l) => s + Number(l.credit || 0), 0),
          true,
        ),
    );
  } else if (context.kind === "ledger") {
    title = "Account ledger";
    date = "";
    reference = d.account.id;
    content =
      slipText("Account", d.account.name) +
      slipText("From", fmtdate(d.from)) +
      slipText("To", fmtdate(d.to)) +
      slipPageScope(d) +
      slipSection(
        "Period totals · all records",
        slipBalance("Opening", d.opening) +
          slipMoney("Debits", d.debit) +
          slipMoney("Credits", d.credit) +
          slipBalance("Closing", d.closing, true),
      );
    content +=
      d.rows
        .map((r, n) =>
          slipEntry(
            `${d.page * d.page_size + n + 1}. ${r.reference || r.kind || "Entry"}`,
            slipText("Date", fmtdate(r.dated)) +
              slipText("Type", r.kind) +
              slipText("Source", r.source) +
              slipText("Description", r.memo) +
              (r.debit ? slipMoney("Debit", r.debit) : "") +
              (r.credit ? slipMoney("Credit", r.credit) : "") +
              slipBalance("Balance", r.balance),
          ),
        )
        .join("") +
      slipNote(
        "Historical balances require reconciliation. Delivery Cash Receiving posts linked customer charges and cash receipts.",
      );
  } else if (context.kind === "financial") {
    title =
      financialReportCards.find((r) => r[0] === d.report)?.[1] ||
      "Financial report";
    date = "";
    const balances = ["trial", "balances"].includes(d.report);
    content =
      slipText("From", fmtdate(d.from)) +
      slipText("To", fmtdate(d.to)) +
      slipPageScope(d) +
      slipSection(
        "Totals · all matching records",
        slipMoney("Debits", d.stats.debit) +
          slipMoney("Credits", d.stats.credit) +
          (balances
            ? slipMoney("Closing debit", d.stats.closing_dr) +
              slipMoney("Closing credit", d.stats.closing_cr)
            : ""),
      );
    content +=
      d.rows
        .map((r, n) =>
          slipEntry(
            `${d.page * d.page_size + n + 1}. ${balances ? r.name : r.reference || r.kind || "Entry"}`,
            balances
              ? slipText("Account code", r.id) +
                  slipText("Group", r.group_code) +
                  slipBalance("Opening", r.opening) +
                  slipMoney("Debit", r.debit) +
                  slipMoney("Credit", r.credit) +
                  slipBalance("Closing", r.closing)
              : slipText("Date", fmtdate(r.dated)) +
                  slipText("Source", r.source) +
                  slipText("Type", r.kind) +
                  slipText(
                    "Account",
                    r.account || r.account_id || "Incomplete account",
                  ) +
                  slipText("Account code", r.account_id) +
                  slipText("Description", r.memo) +
                  (r.debit ? slipMoney("Debit", r.debit) : "") +
                  (r.credit ? slipMoney("Credit", r.credit) : ""),
          ),
        )
        .join("") +
      slipNote(
        "Historical balances require reconciliation. Entries without dates or account codes cannot form complete dated account balances. New delivery collections create linked vouchers.",
      ) +
      (d.report === "vouchers" ? slipNote("New-app voucher lines only.") : "");
  } else if (context.kind === "chart") {
    title = "Chart of accounts";
    date = "";
    content =
      slipText("Accounts", num(d.accounts.length)) +
      d.accounts
        .map((a, n) =>
          slipEntry(
            `${n + 1}. ${a.name}`,
            slipText("Code", a.id) +
              slipText("Group", a.group_code) +
              slipText("Status", a.status === "A" ? "Active" : "Inactive"),
          ),
        )
        .join("");
  } else {
    title = d.title || "Workspace record";
    date = "";
    content =
      d.content ||
      slipNote(
        "Open a bilty, shipment, delivery, voucher or report to print a slip.",
      );
  }
  return {
    title,
    context: structuredClone(context),
    html: `<article class="thermal-slip">${slipHeader(title, reference, date)}<main class="slip-body">${content}</main>${slipFooter()}</article>`,
  };
}
function visiblePrintContext(source) {
  if (source === "dialog" && recordPrintContext) return recordPrintContext;
  if (source === "page" && state.view === "ledger" && listData?.account)
    return { kind: "ledger", data: structuredClone(listData) };
  if (source === "page" && state.view === "financial-detail" && listData?.stats)
    return { kind: "financial", data: structuredClone(listData) };
  const root = source === "dialog" ? $("#modal") : $("#main");
  if (!session?.user || !root)
    return {
      kind: "generic",
      data: {
        title: "No printable record",
        content: slipNote("Sign in and open a saved record to print a slip."),
      },
    };
  const title = APG.sourceText($("h1,h2", root)) || "Workspace record";
  let content = "";
  $$("table", root)
    .filter((table) => !table.closest("form") && table.getClientRects().length)
    .forEach((table) => {
      const headers = $$("thead th", table).map((th) => APG.sourceText(th).trim());
      content += $$("tbody tr", table)
        .map((row, n) =>
          slipEntry(
            "Record " + (n + 1),
            $$("td", row)
              .map((td, i) => {
                return slipText(
                  headers[i] || "Detail",
                  APG.sourceText(td,"button:not(.link),input,select,textarea,.avatar,img,svg").trim(),
                );
              })
              .join(""),
          ),
        )
        .join("");
    });
  if (
    source === "page" &&
    [
      "incoming",
      "booking",
      "deliveries",
      "customers",
      "accounts",
      "bilties",
      "archive",
      "users",
    ].includes(state.view) &&
    listData?.rows &&
    content
  )
    content = slipPageScope(listData) + content;
  return { kind: "generic", data: { title, content } };
}
function printFormat() {
  try { return localStorage.getItem("apg.print.format") === "a4" ? "a4" : "thermal"; } catch { return "thermal"; }
}
function printOrientation() {
  try {return localStorage.getItem("apg.print.orientation") === "landscape" ? "landscape" : "portrait";} catch {return "portrait";}
}
function buildA4Document(snapshot) {
  const source = document.createElement("div");
  source.innerHTML = snapshot.html;
  const slip = source.querySelector(".thermal-slip");
  if (!slip) return snapshot.html;
  let output = "", entries = [];
  function flushEntries() {
    if (!entries.length) return;
    const rows = entries.map(entry => {
      const values = new Map();
      entry.querySelectorAll(".slip-row,.slip-money-row").forEach(row => {
        values.set(row.querySelector(".slip-label")?.textContent || "Detail", row.querySelector("strong")?.textContent || "—");
      });
      const notes = [...entry.querySelectorAll(".slip-note")].map(n => n.textContent).join(" · ");
      if (notes) values.set("Notes", notes);
      return {title: entry.querySelector("h3")?.textContent || "Entry", values};
    });
    const keys = [...new Set(rows.flatMap(row => [...row.values.keys()]))];
    if (!keys.length) keys.push("Detail");
    // Keep every field readable on portrait A4; continue wide records in linked tables.
    for (let start = 0; start < keys.length; start += 6) {
      const columns = keys.slice(start, start + 6);
      output += `<table class="a4-table"><thead><tr><th>Entry${start ? " (continued)" : ""}</th>${columns.map(key=>`<th>${esc(key)}</th>`).join("")}</tr></thead><tbody>${rows.map(row=>`<tr><th scope="row">${esc(row.title)}</th>${columns.map(key=>`<td dir="auto">${esc(row.values.get(key) || "—")}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    }
    entries = [];
  }
  for (const child of [...slip.children].flatMap(child=>child.classList.contains("slip-body") ? [...child.children] : [child])) {
    if (child.classList.contains("slip-entry")) entries.push(child);
    else { flushEntries(); output += child.outerHTML; }
  }
  flushEntries();
  return `<article class="a4-document">${output}</article>`;
}
function refreshPrintLayout() {
  if (!thermalSnapshot) return;
  const format = $("#print-preview").open ? $("#print-format")?.value || printFormat() : printFormat();
  const orientation = $("#print-preview").open ? $("#print-orientation")?.value || printOrientation() : printOrientation();
  const paperWidth = orientation === "landscape" ? 297 : 210;
  const html = format === "a4" ? buildA4Document(thermalSnapshot) : thermalSnapshot.html;
  const sheet = $("#thermal-preview-sheet");
  const root = $("#thermal-print");
  if (sheet) { sheet.dataset.format = format; sheet.dataset.orientation = orientation; sheet.innerHTML = html;
    sheet.style.zoom = format === "a4" ? String(Math.min(1, Math.max(0.25, (sheet.parentElement.clientWidth - 32) / (paperWidth * 96 / 25.4)))) : "1";
  }
  root.dataset.format = format;
  root.dataset.orientation = orientation;
  root.innerHTML = html;
  if ($("#print-preview").open) {
    $("#thermal-preview-title").textContent = format === "a4" ? "A4 print preview" : "Thermal print preview";
    $("#print-preview .modal-head p").textContent = thermalSnapshot.title + (format === "a4" ? " · Standard A4 document" : " · Narrow slip layout");
    $("#thermal-width").closest(".thermal-toolbar").hidden = format === "a4";
    $("#print-orientation").closest(".thermal-toolbar").hidden = format !== "a4";
    $("#print-preview .thermal-print-help").textContent = format === "a4" ? `Select your normal printer and A4 ${orientation} paper in the browser print dialog. Use 100% scale and turn off browser headers and footers. Long documents continue onto additional pages.` : "Select your thermal printer and matching roll width in the browser print dialog. Use 100% scale, no margins, and turn off browser headers and footers.";
    $("[data-action='thermal-confirm']").innerHTML = icon("print") + (format === "a4" ? "Print A4" : "Print slip");
  }
  APG.localise();
  if (format === "a4") {
    $("#thermal-page-style").textContent = `@page { size: A4 ${orientation}; margin: 10mm; }`;
    return true;
  }
  return false;
}
function fitThermalAmounts(root) {
  if (!root) return;
  $$(".slip-amount", root).forEach((el) => {
    if (!el.clientWidth) return;
    el.style.fontSize = "";
    el.style.whiteSpace = "";
    el.style.overflowWrap = "";
    if (el.scrollWidth > el.clientWidth) {
      const size = parseFloat(getComputedStyle(el).fontSize);
      el.style.fontSize =
        Math.max(9, (size * el.clientWidth) / el.scrollWidth - 0.2) + "px";
    }
    if (el.scrollWidth > el.clientWidth) {
      el.style.whiteSpace = "normal";
      el.style.overflowWrap = "anywhere";
    }
  });
}
function updateThermalPage() {
  const root = $("#thermal-print");
  if (!root || !thermalSnapshot) return;
  if (refreshPrintLayout()) return;
  const width = $("#print-preview").open
    ? $("#thermal-width")?.value || thermalWidth()
    : thermalWidth();
  const paper = width === "58" ? "58" : "80";
  root.dataset.paper = paper;
  const sheet = $("#thermal-preview-sheet");
  if (sheet) sheet.dataset.paper = paper;
  root.innerHTML = thermalSnapshot.html;
  APG.localise();
  root.classList.add("thermal-measuring");
  fitThermalAmounts(root);
  fitThermalAmounts(sheet);
  const height = Math.max(
    70,
    Math.min(500, Math.ceil((root.scrollHeight * 25.4) / 96) + 4),
  );
  root.classList.remove("thermal-measuring");
  $("#thermal-page-style").textContent =
    `@page { size: ${paper}mm ${height}mm; margin: 0; }`;
  try {
    localStorage.setItem("apg.thermal.width", paper);
  } catch {}
  if ($("#thermal-width-note"))
    $("#thermal-width-note").textContent =
      paper === "58"
        ? "58 mm roll · 48 mm print area"
        : "80 mm roll · 72 mm print area";
}
function openThermalPreview(source) {
  const context = visiblePrintContext(source);
  thermalSnapshot = buildThermalRecord(context);
  const dialog = $("#print-preview");
  dialog.innerHTML = `<div class="modal-head"><div><span class="section-kicker">PRINT OPTIONS</span><h2 id="thermal-preview-title">Thermal print preview</h2><p>${esc(thermalSnapshot.title)} · Narrow slip layout</p></div><button class="icon-btn" data-action="thermal-close" aria-label="Close print preview">${icon("close")}</button></div><div class="thermal-toolbar"><label for="print-format">Printer / paper type<select id="print-format"><option value="thermal">Thermal printer · Narrow slip</option><option value="a4">Normal printer · A4</option></select></label></div><div class="thermal-toolbar"><label for="print-orientation">Page orientation<select id="print-orientation"><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label></div><div class="thermal-toolbar"><label for="thermal-width">Paper width<select id="thermal-width"><option value="80">80 mm · Standard roll</option><option value="58">58 mm · Small roll</option></select></label><span id="thermal-width-note"></span></div>${context.kind === "delivery" ? '<div class="thermal-toolbar thermal-values-toolbar"><label for="thermal-values">Report values<select id="thermal-values"><option value="receipt">Receipt slip · charges</option><option value="cash">Cash summary · received</option></select></label></div>' : ""}<p class="thermal-print-help">In the printer dialog, select the same paper width, use 100% scale, no margins, and turn off browser headers and footers. Long records continue onto additional slip pages.</p><div class="thermal-preview-stage"><div id="thermal-preview-sheet">${thermalSnapshot.html}</div></div><div class="modal-footer"><button class="btn" data-action="thermal-close">Back to record</button><button class="btn primary" data-action="thermal-confirm">${icon("print")}Print slip</button></div>`;
  $("#thermal-width").value = thermalWidth();
  $("#print-format").value = printFormat();
  $("#print-orientation").value = printOrientation();
  if (!dialog.open) dialog.showModal();
  updateThermalPage();
}
function closeThermalPreview() {
  const dialog = $("#print-preview");
  if (dialog?.open) dialog.close();
  thermalSnapshot = null;
  if ($("#thermal-print")) $("#thermal-print").innerHTML = "";
  $("#thermal-page-style").textContent = "";
}
$("#print-preview").addEventListener("cancel", (e) => {
  e.preventDefault();
  closeThermalPreview();
});
document.addEventListener("change", (e) => {
  if (e.target.id === "print-orientation") {
    try {localStorage.setItem("apg.print.orientation",e.target.value);} catch {}
    updateThermalPage();
  }
  if (e.target.id === "print-format") {
    try {localStorage.setItem("apg.print.format", e.target.value);} catch {}
    updateThermalPage();
  }
  if (e.target.id === "thermal-values") {
    thermalSnapshot = buildThermalRecord({
      ...thermalSnapshot.context,
      variant: e.target.value,
    });
    $("#thermal-preview-sheet").innerHTML = thermalSnapshot.html;
    $("#print-preview .modal-head p").textContent =
      thermalSnapshot.title + " · Original report values";
    updateThermalPage();
  }
  if (e.target.id === "thermal-width") updateThermalPage();
});
window.addEventListener("beforeprint", () => {
  document.body.classList.remove("print-dialog", "print-page");
  if (!thermalSnapshot) {
    thermalSnapshot = buildThermalRecord(
      visiblePrintContext($("#modal").open ? "dialog" : "page"),
    );
  }
  updateThermalPage();
  APG.localise();
});
window.addEventListener("afterprint", () => {
  if (!$("#print-preview").open) closeThermalPreview();
});

function chooseLedger(mode = "") {
  state.ledgerMode = mode;
  modal(
    mode === "detail"
      ? "Ledger a/c detail"
      : mode === "summary"
        ? "Ledger a/c"
        : "View an account ledger",
    "Find a customer or account and choose your dates.",
    `<form id="ledger-form"><div class="form-grid">${field("account", "Account *", accountLabel(state.account_id), "text", 'required list="account-options" placeholder="Type to find an account…"', true)}${field("from", "From date", state.from || session.history_start || "2017-10-28", "date", "required")}${field("to", "To date", state.to || today(), "date", "required")}</div><div class="error" id="form-error" hidden></div><div class="form-actions">${btn("Cancel", "close-modal")}<button class="btn primary" type="submit">Open ledger ${icon("arrow")}</button></div></form>`,
  );
}
function stationForm(id) {
  let s = lookups.stations.find((s) => String(s.id) === String(id)) || {};
  modal(
    id ? "Edit station" : "Add station",
    "Save station details for your goods entries.",
    `<form id="station-form"><input type="hidden" name="id" value="${s.id || ""}"><div class="form-grid">${field("name", "Station name *", s.name, "text", "required", true)}${field("address", "Address", s.address, "text", "", true)}</div><div class="error" id="form-error" hidden></div><div class="form-actions">${btn("Cancel", "close-modal")}<button type="submit" class="btn primary">Save station</button></div></form>`,
  );
}
function closeModal() {
  if(deliveryEdit && $("#delivery-form")){deliveryEdit=null;selected.clear();}
  recordPrintContext = null;
  const d = $("#modal");
  if (d.open) d.close();
  biltyDraft = null;
  modalSnapshot = "";
  document.body.classList.remove("print-dialog");
}
function exportCSV() {
  let rows = listData?.rows;
  if (!rows?.length) return toast("No records to export on this page.");
  let cols = Object.keys(rows[0]);
  let quote = (v) => {
    let t = String(v ?? "");
    if (/^[=+@\-\t\r]/.test(t)) t = "'" + t;
    return '"' + t.replaceAll('"', '""') + '"';
  };
  let str = [cols, ...rows.map((r) => cols.map((k) => r[k]))]
    .map((r) => r.map(quote).join(","))
    .join("\r\n");
  let url = URL.createObjectURL(
    new Blob(["\ufeff" + str], { type: "text/csv;charset=utf-8" }),
  );
  let a = document.createElement("a");
  a.href = url;
  a.download = "APG-" + state.view + "-page-" + (state.page + 1) + ".csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const dashboardGroups = [
  {
    title: "Vouchers",
    hint: "Record money received, paid or transferred.",
    items: [
      [
        "receipt",
        "Receipt Voucher",
        "Receive cash or bank payments",
        "wallet",
        "blue",
      ],
      [
        "payment",
        "Payment Voucher",
        "Record a payment to an account",
        "wallet",
        "orange",
      ],
      [
        "journal",
        "Journal Voucher",
        "Transfer between account heads",
        "report",
        "purple",
      ],
    ],
  },
  {
    title: "Customers",
    hint: "Open the customer group you work with.",
    items: [
      [
        "customers116",
        "Customers-116",
        "Customer accounts in group 116",
        "users",
        "blue",
      ],
      [
        "customers117",
        "Customers-117",
        "Customer accounts in group 117",
        "users",
        "purple",
      ],
    ],
  },
  {
    title: "Goods & deliveries",
    hint: "Book, receive, deliver and find your goods.",
    items: [
      [
        "booking",
        "Booking",
        "Create an outgoing goods booking",
        "booking",
        "blue",
      ],
      [
        "booking-inquiry",
        "Booking Inquiry",
        "Find bookings and their bilties",
        "search",
        "blue",
      ],
      [
        "incoming",
        "Incoming Goods",
        "Record arriving goods and bilties",
        "incoming",
        "green",
      ],
      [
        "delivery",
        "Delivery",
        "Select goods and record a handover",
        "truck",
        "green",
      ],
      [
        "delivery-inquiry",
        "Delivery Inquiry",
        "Find delivered goods and parties",
        "search",
        "green",
      ],
      [
        "inquiry2",
        "Inquiry-2",
        "Search all bilties with date and station filters",
        "search",
        "orange",
      ],
    ],
  },
  {
    title: "Accounts",
    hint: "Find balances, review entries or create an account.",
    items: [
      [
        "ledger",
        "Ledger a/c",
        "Open an account’s compact ledger",
        "wallet",
        "blue",
      ],
      [
        "ledger-detail",
        "Ledger a/c Detail",
        "Review transaction descriptions and sources",
        "report",
        "purple",
      ],
      [
        "new-account",
        "New Account",
        "Create a customer or other account head",
        "plus",
        "green",
      ],
    ],
  },
];
async function dashboard() {
  if (!can("overview.view")) return restrictedDashboard();
  const d = await api("dashboard", null, {
    date: state.date,
    __render: requestID,
  });
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Karachi",
      hour: "numeric",
      hour12: false,
    }).format(new Date()),
  );
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const max = Math.max(1, ...d.trend.map((r) => r.incoming + r.booking));
  const trendTotal = d.trend.reduce((n, r) => n + r.incoming + r.booking, 0);
  return (
    head(
      `${greeting}, ${esc(displayName())}.`,
      "Here’s what’s moving across your business.",
      `<label class="date-chip">${icon("calendar")}<input type="date" id="working-date" aria-label="Dashboard date" value="${state.date}"></label><button class="btn primary" data-dashboard="incoming">${icon("plus")}New incoming</button>`,
      "YOUR DAILY WORKSPACE",
    ) +
    `<section class="dispatch-hero"><div class="hero-copy"><span class="hero-label"><span class="dot"></span> AZAD PAKISTAN GOODS</span><h2>Every shipment.<br>One clear picture.</h2><p>From the first bilty to the final handover.<br>Your day, organised and ready to move.</p><div class="buttons"><button class="btn hero-primary" data-dashboard="delivery">Deliver goods ${icon("arrow")}</button><button class="btn hero-secondary" data-dashboard="booking">${icon("plus")}Create booking</button></div><div class="hero-foot">${icon("pin")}D. I. Khan <span>•</span> Connected by goods. Built on trust.</div></div><div class="route-art" aria-hidden="true"><div class="route-grid"></div><svg viewBox="0 0 480 260"><path class="route-shadow" d="M65 185H155Q185 185 185 155V105Q185 75 215 75H380"/><path class="route-line" d="M65 185H155Q185 185 185 155V105Q185 75 215 75H380"/><circle cx="65" cy="185" r="9"/><circle cx="380" cy="75" r="9"/></svg><div class="route-stop origin">${icon("box")}<div><b>Goods received</b><small>Every detail, in place</small></div><span class="route-check">✓</span></div><div class="route-stop destination">${icon("truck")}<div><b>Ready for delivery</b><small>The next step is clear</small></div><span class="route-check">✓</span></div><div class="route-bubble">${icon("truck")}</div><span class="route-caption">A BETTER WAY TO KEEP MOVING</span></div></section>
 <div class="metrics home-metrics">${[
   ["Incoming shipments", d.incoming, "incoming", "blue", "On selected date"],
   ["Outgoing bookings", d.bookings, "booking", "purple", "On selected date"],
   ["Deliveries completed", d.deliveries, "check", "green", "On selected date"],
   [
     "Awaiting delivery",
     d.pending,
     "clock",
     "orange",
     "All pending incoming bilties",
   ],
 ]
   .map(
     ([title, value, ic, color, description]) =>
       `<div class="metric"><div class="metric-top"><span>${title}</span><span class="metric-icon ${color}">${icon(ic)}</span></div><strong>${num(value)}</strong><small>${description}</small></div>`,
   )
   .join("")}</div>
 <div class="dashboard-workgrid"><section class="panel movement-panel"><div class="panel-head"><div><span class="section-kicker">THE BIG PICTURE</span><h2>Goods movement</h2><p>Shipments in the 7 days ending ${fmtdate(d.date)}</p></div><div class="chart-legend"><span><i></i>Incoming</span><span><i></i>Booking</span></div></div><div class="chart-summary"><strong>${num(trendTotal)}</strong><span>shipments recorded</span></div><div class="movement-chart" role="img" aria-label="${esc(d.trend.map((r) => fmtdate(r.dated) + ": " + r.incoming + " incoming, " + r.booking + " bookings").join("; "))}">${d.trend.map((r) => `<div class="chart-column"><div class="chart-track"><div class="chart-stack" style="height:${((r.incoming + r.booking) / max) * 100}%" title="${esc(fmtdate(r.dated))}: ${r.incoming} incoming, ${r.booking} bookings"><span class="chart-booking" style="flex:${r.booking}"></span><span class="chart-incoming" style="flex:${r.incoming}"></span></div></div><span>${fmtdate(r.dated).slice(0, 7)}</span></div>`).join("")}</div></section>
 <section class="panel pending-panel"><div class="panel-head"><div><span class="section-kicker">UP NEXT</span><h2>Delivery queue</h2><p>Pending goods by origin station</p></div><span class="count-badge">${num(d.pending)}</span></div><div class="panel-body">${d.stations.length ? d.stations.map((r, i) => `<div class="queue-station"><span class="station-symbol">${icon("pin")}</span><div><div class="station-label"><b>${esc(r.name || "Not recorded")}</b><span>${num(r.count)} bilties</span></div><div class="bar"><span style="width:${(r.count / Math.max(1, d.pending)) * 100}%"></span></div></div></div>`).join("") : '<div class="queue-clear">' + icon("check") + "<b>All caught up.</b><p>No incoming bilties are awaiting delivery.</p></div>"}<button class="btn queue-button" data-dashboard="delivery">Open delivery queue ${icon("arrow")}</button></div></section></div>
 <section class="panel recent-panel"><div class="panel-head"><div><span class="section-kicker">LATEST ACTIVITY</span><h2>Recent goods entries</h2><p>Your latest incoming shipments and bookings across all dates</p></div><button class="btn small" data-view="incoming">View incoming ${icon("arrow")}</button></div>${shipmentTable(d.recent, false)}</section>
 <div class="section-heading"><div><span class="section-kicker">LESS CLICKING. MORE DOING.</span><h2>Your everyday shortcuts</h2></div><button class="link" data-action="command">Find a task ${icon("search")}</button></div>
 ${availableGroups()
   .map(
     (g) =>
       `<section class="dashboard-section"><div class="dashboard-section-head"><h2>${g.title}</h2><p>${g.hint}</p></div><div class="dashboard-grid">${g.items.map(([key, title, desc, ic, color]) => `<button type="button" class="dashboard-tile ${color}" data-dashboard="${key}"><span class="tile-icon">${icon(ic)}</span><span class="tile-copy"><b>${title}</b><small>${desc}</small></span><span class="tile-arrow">${icon("arrow")}</span></button>`).join("")}</div></section>`,
   )
   .join(
     "",
   )}<div class="data-note">${icon("shield")}<span>Original records preserved · Backup ${fmtdate(session.backup_date)}. Goods entries do not automatically post accounting vouchers.</span><span>${num(d.customers)} customers</span></div>`
  );
}

async function openDashboard(key) {
  if (!dashboardAllowed(key))
    return toast("This action is not available for your account.");
  if (
    currentForm &&
    !confirm(APG.t("Leave this entry? Unsaved changes will be lost."))
  )
    return;
  currentForm = null;
  state.inquiry = null;
  state.deliveryMode = false;
  state.ledgerMode = "";
  state.group = "";
  state.status = "";
  state.station_id = "";
  if (["receipt", "payment", "journal"].includes(key)) {
    await navigate("accounts");
    voucherForm({ receipt: "RV", payment: "PV", journal: "JV" }[key]);
    return;
  }
  if (key === "customers116" || key === "customers117") {
    state.group = key.slice(-3);
    await navigate("customers");
    return;
  }
  if (key === "booking" || key === "incoming") {
    await navigate(key);
    newShipment(key);
    return;
  }
  if (key === "delivery") {
    state.deliveryMode = true;
    state.status = "pending";
    await navigate("bilties");
    return;
  }
  const inquiries = {
    "booking-inquiry": {
      title: "Booking inquiry",
      kind: "booking",
      status: "",
    },
    "delivery-inquiry": {
      title: "Delivery inquiry",
      kind: "incoming",
      status: "delivered",
    },
    inquiry2: { title: "Inquiry-2 · All bilties", kind: "", status: "" },
  };
  if (inquiries[key]) {
    state.inquiry = inquiries[key];
    state.status = state.inquiry.status;
    await navigate("bilties");
    return;
  }
  if (key === "ledger" || key === "ledger-detail") {
    chooseLedger(key === "ledger" ? "summary" : "detail");
    return;
  }
  if (key === "new-account") {
    await accountForm();
    return;
  }
  if (key === "exit") await action("logout");
}
async function accountForm() {
  let groups = await api("account_groups");
  modal(
    "New account",
    "Choose an account group. A new code will be assigned automatically.",
    `<form id="account-form"><div class="form-grid">${field("name", "Account name *", "", "text", 'required maxlength="100"', true)}${selectField("group", "Account group *", [["", "Choose account group"], ...groups.map((g) => [g.MLCODE + "-" + g.MCODE, g.MCODE + " · " + g.MTITLE])], "", true)}${field("opening_dr", "Opening debit (Rs)", "0", "number", 'min="0" step="0.01"')}${field("opening_cr", "Opening credit (Rs)", "0", "number", 'min="0" step="0.01"')}${field("mobile", "Mobile", "", "tel")}${field("address", "Address", "", "text", "", true)}</div><p class="note">Enter an opening balance on one side only. Accounts in a customer group also appear in the customer directory.</p><div class="error" id="form-error" hidden></div><div class="form-actions">${btn("Cancel", "close-modal")}<button class="btn primary" type="submit">Create account</button></div></form>`,
  );
}

async function action(name, el) {
  if (!actionAllowed(name, el))
    return toast("This action is not available for your account.");
  switch (name) {
    case "my-profile":
      await navigate("profile");
      break;
    case "new-user":
      await userForm();
      break;
    case "edit-user":
      await userForm(el.dataset.id);
      break;
    case "choose-avatar":
      document.getElementById(el.dataset.input)?.click();
      break;
    case "remove-avatar": {
      const form = el.closest("form");
      form.querySelector('[name="avatar"]').value = "";
      form.querySelector(".photo-preview").innerHTML = avatarMarkup(
        {
          username:
            form.querySelector('[name="full_name"]')?.value || displayName(),
        },
        true,
      );
      break;
    }
    case "reload-app":
      location.reload();
      break;
    case "imported-data":
      await navigate("archive");
      break;
    case "all-reports":
      await navigate("reports");
      break;
    case "financial-ledger":
      closeModal();
      chooseLedger("detail");
      break;
    case "financial-dashboard":
      await navigate("financial-reports");
      break;
    case "financial-report":
      openFinancialReport(el.dataset.report);
      break;
    case "ledger-all-history":
      state.from = session.history_start || "2017-10-28";
      state.to = today();
      state.page = 0;
      await render();
      break;
    case "dashboard-overview":
      await navigate("overview");
      break;
    case "new-account":
      await accountForm();
      break;
    case "menu":
      toggleMenu(!document.body.classList.contains("nav-open"));
      break;
    case "close-menu":
      toggleMenu(false);
      break;
    case "command":
      commandPalette();
      break;
    case "toggle-password": {
      let input = $("#f-password");
      input.type = input.type === "password" ? "text" : "password";
      el.textContent = input.type === "password" ? "Show" : "Hide";
      el.setAttribute("aria-pressed", String(input.type === "text"));
      break;
    }
    case "logout":
      await api("logout", {});
      session = await api("session");
      auth();
      break;
    case "clear-delivery-filters":
      state.search = state.from = state.to = "";
      state.page = 0;
      await render();
      break;
    case "refresh":
      render();
      break;
    case "new-customer":
      await customerForm();
      break;
    case "customer":
      await customerForm(el.dataset.id);
      break;
    case "shipment":
      await showShipment(el.dataset.id);
      break;
    case "discard-incoming": {
      if(!isSuper()) throw Error("Only the super admin can discard pending entries.");
      const id=Number(el.dataset.id);
      if(!confirm(APG.t("Discard PENDING-"+id+"? It will be removed from Pending incoming goods."))) break;
      await api("discard_incoming",{id});
      if(currentForm?.pendingId===id) currentForm=null;
      await navigate("pending-incoming");toast("Pending entry discarded.");break;
    }
    case "review-incoming":
      await reviewIncoming(el.dataset.id);
      break;
    case "edit-shipment":
      await editShipment(el.dataset.id);
      break;
    case "new-incoming":
      newShipment("incoming");
      break;
    case "new-booking":
      newShipment("booking");
      break;
    case "cancel-shipment":
      if (confirm(APG.t("Discard this unsaved shipment?"))) {
        currentForm = null;
        render();
      }
      break;
    case "shipment-back":
      captureShipment();
      currentForm.step--;
      shipmentForm();
      break;
    case "add-bilty":
      openBilty();
      break;
    case "edit-bilty":
      openBilty(Number(el.dataset.index));
      break;
    case "edit-goods-category":
      editGoodsCategory(el.dataset.id,"category");break;
    case "edit-goods-subcategory":
      editGoodsCategory(el.dataset.id,"subcategory");break;
    case "select-goods-type":
      selectGoodsType(el.dataset.id);
      break;
    case "select-bilty-customer":
      selectBiltyCustomer(el.dataset.id);
      break;
    case "cancel-bilty":
      closeBilty();
      break;
    case "remove-bilty":
      if (currentForm.items[Number(el.dataset.index)]?.id) throw Error("Existing bilties cannot be removed. Edit their details instead.");
      if (confirm(APG.t("Remove this bilty from the shipment?"))) {
        currentForm.items.splice(Number(el.dataset.index), 1);
        shipmentForm();
      }
      break;
    case "prev":
      state.page--;
      render();
      break;
    case "next":
      state.page++;
      render();
      break;
    case "delivery-new":
      selected.clear();
      recordDelivery();
      break;
    case "delivery-fetch":
      clearTimeout(deliveryLookupTimer);
      await fetchDeliveryBilty();
      break;
    case "delivery-add": {
      const row = deliveryMatches.get(Number(el.dataset.id));
      if (!row || row.delivery_submission_id || selected.has(row.id)) break;
      if (selected.size >= 1000) throw Error("Save this batch before adding more bilties.");
      const values = deliveryValues();
      selected.set(row.id, row);
      ++deliveryLookupSequence;
      recordDelivery(values);
      $("#delivery-bilty-number").focus();
      break;
    }
    case "delivery-remove": {
      const values = deliveryValues();
      selected.delete(Number(el.dataset.id));
      ++deliveryLookupSequence;
      recordDelivery(values);
      break;
    }
    case "report-pending":
      state.inquiry = null;
      state.deliveryMode = false;
      state.status = "pending";
      state.station_id = "";
      navigate("bilties");
      break;
    case "bilty":
      showBilty(el.dataset.id);
      break;
    case "review-pending-delivery":
      await reviewPendingDelivery(el.dataset.id);
      break;
    case "discard-pending-delivery":
      if(!confirm(APG.t("Discard this pending delivery? The bilties will be available for delivery again.")))break;
      await api('discard_delivery_submission',{id:Number(el.dataset.id)});await render();toast('Pending delivery discarded.');
      break;
    case "cash-pay-full":
    case "cash-pay-none": {
      const line=cashReceivingInvoice.lines.find(row=>row.delivery_item_id===Number(el.dataset.id));if(!line)break;
      const due=name==='cash-pay-full'?Math.max(0,line.balance):0,bilty=Math.min(due,Math.max(0,line.bilty_due-line.bilty_received));
      $('#delivery-cash-form [name="bilty_received_'+line.delivery_item_id+'"]').value=amount(bilty);
      $('#delivery-cash-form [name="service_received_'+line.delivery_item_id+'"]').value=amount(due-bilty);updateCashReceivingTotals();break;
    }
    case "review-pending-cash":
      await reviewPendingCash(el.dataset.id);
      break;
    case "discard-pending-cash":
      if(!confirm(APG.t('Discard this pending cash collection? No customer or cash balances will change.')))break;
      await api('discard_cash_collection',{id:Number(el.dataset.id)});await render();toast('Pending cash collection discarded.');
      break;
    case "receive-delivery-cash":
      await receiveDeliveryCash(el.dataset.id);
      break;
    case "cash-mode":
      cashMode=el.dataset.value;state.page=0;state.search='';await render();
      break;
    case "record-delivery":
      recordDelivery();
      break;
    case "edit-delivery":
      await editDelivery(el.dataset.id);
      break;
    case "delivery":
      await showDelivery(el.dataset.id);
      break;
    case "clear-selection":
      selected.clear();
      render();
      break;
    case "new-voucher":
      voucherForm();
      break;
    case "voucher":
      await showVoucher(el.dataset.id);
      break;
    case "add-voucher-line": {
      let n =
        Math.max(...$$(".voucher-line").map((e) => Number(e.dataset.line))) + 1;
      $("#voucher-lines").insertAdjacentHTML("beforeend", voucherLine(n));
      break;
    }
    case "remove-voucher-line":
      el.closest(".voucher-line").remove();
      updateVoucherSummary();
      break;
    case "choose-ledger":
      chooseLedger();
      break;
    case "report-ledger":
      closeModal();
      state.account_id = el.dataset.id;
      state.ledgerMode = "detail";
      state.page = 0;
      await navigate("ledger", false);
      break;
    case "customer-ledger":
      closeModal();
      state.account_id = el.dataset.id;
      state.from = session.history_start || "2017-10-28";
      state.to = today();
      state.page = 0;
      navigate("ledger", false);
      break;
    case "close-modal":
      requestCloseModal();
      break;
    case "print-dialog":
      openThermalPreview("dialog");
      break;
    case "print-page":
      openThermalPreview("page");
      break;
    case "thermal-close":
      closeThermalPreview();
      break;
    case "thermal-confirm":
      updateThermalPage();
      APG.localise();
      window.print();
      break;
    case "export":
      exportCSV();
      break;
    case "new-station":
      stationForm();
      break;
    case "station":
      stationForm(el.dataset.id);
      break;
    case "backup-mode":
      backupMode = el.dataset.value; await render(); break;
    case "backup-kind":
      backupKind = el.dataset.value; await render(); break;
    case "backup-restore":
      restoreBackupForm(el.dataset.id); break;
    case "backup": {
      el.disabled = true;
      try {
        let r = await api("backup", {});
        toast(r.message);
        if(state.view === "backups") await render();
      } finally {
        el.disabled = false;
      }
      break;
    }
    default:
      if (name.startsWith("report-")) navigate(name.slice(7));
  }
}
function updateVoucherSummary() {
  let dr = 0,
    cr = 0;
  $$(".voucher-line").forEach((el) => {
    let n = el.dataset.line;
    dr += Math.round(Number($(`[name="debit_${n}"]`).value || 0) * 100);
    cr += Math.round(Number($(`[name="credit_${n}"]`).value || 0) * 100);
  });
  $("#voucher-balance").textContent =
    dr === cr && dr > 0
      ? "Balanced ✓"
      : "Difference: " + cash(Math.abs(dr - cr));
  $("#voucher-total").textContent = cash(dr);
}
document.addEventListener("click", (e) => {
  let el = e.target.closest("[data-action],[data-view],[data-dashboard]");
  if (!el) return;
  e.preventDefault();
  if (el.dataset.view === "customers") state.group = "";
  Promise.resolve(
    el.dataset.dashboard
      ? openDashboard(el.dataset.dashboard)
      : el.dataset.view
        ? navigate(el.dataset.view)
        : action(el.dataset.action, el),
  ).catch((err) => toast(err.message));
});
let searchTimer;
document.addEventListener("input", (e) => {
  if (e.target.id === "list-search") {
    clearTimeout(searchTimer);
    state.search = e.target.value;
    state.page = 0;
    let start = e.target.selectionStart;
    searchTimer = setTimeout(async () => {
      await render();
      let input = $("#list-search");
      if (input) {
        input.focus();
        input.setSelectionRange(start, start);
      }
    }, 350);
  }
  if (e.target.id === "bilty-customer-search") {
    $('#bilty-form [name="account_id"]').value = "";
    $("#bilty-customer-hint").textContent =
      "Choose a customer from the results below.";
    customerSuggestions();
  }
  if (e.target.closest("#bilty-form")) updateBiltyTotals();
  if (e.target.closest("#delivery-form")) updateDeliveryWarnings();
  if (e.target.id === "delivery-bilty-number") {
    clearTimeout(deliveryLookupTimer);
    deliveryLookupTimer = setTimeout(fetchDeliveryBilty, 450);
  }
  if (e.target.closest("#shipment-form") && currentForm?.step <= 1) {
    captureShipment();
    $("#sum-qty").textContent = num(
      currentForm.items.reduce((s, i) => s + Number(i.qty || 0), 0),
    );
    $("#sum-advance").textContent = cash(
      currentForm.items.reduce(
        (s, i) => s + Math.round(Number(i.advance || 0) * 100),
        0,
      ),
    );
    $("#sum-total").textContent = shipmentSidebarTotal(currentForm);
  }
  if (e.target.closest("#voucher-lines")) updateVoucherSummary();
});
document.addEventListener("change", (e) => {
  let t = e.target;
  if (t.dataset.select) {
    let id = Number(t.dataset.select);
    if (t.checked)
      selected.set(
        id,
        listData.rows.find((r) => r.id === id),
      );
    else selected.delete(id);
    let b = $('[data-action="record-delivery"]');
    if (b)
      b.innerHTML =
        icon("check") +
        "Record delivery" +
        (selected.size ? " (" + selected.size + ")" : "");
    return;
  }
  const changes = {
    "archive-table": "archiveTable",
    "customer-group": "group",
    "filter-from": "from",
    "filter-to": "to",
    "bilty-status": "status",
    "station-filter": "station_id",
    "working-date": "date",
  };
  if (changes[t.id]) {
    state[changes[t.id]] = t.value;
    state.page = 0;
    render();
  }
});
async function submitForm(form, submitter) {
  if (form.dataset.photoLoading)
    throw Error("Wait for your photo preview to finish loading.");
  let data = Object.fromEntries(new FormData(form));
  switch (form.getAttribute("id")) {
    case "profile-form": {
      await api("save_profile", data);
      session = await api("session");
      shell();
      await navigate("profile");
      toast("Your profile is updated.");
      break;
    }
    case "password-form": {
      if (data.new_password !== data.confirm_password)
        throw Error("The new passwords do not match.");
      await api("change_password", {
        current_password: data.current_password,
        new_password: data.new_password,
      });
      session = await api("session");
      form.reset();
      modalSnapshot = modalValues();
      toast("Password changed. Other sessions have been signed out.");
      break;
    }
    case "user-form": {
      const permissions = $$('[name="permission"]:checked', form).map(
        (el) => el.value,
      );
      delete data.permission;
      await api("save_user", { ...data, permissions });
      closeModal();
      session = await api("session");
      shell();
      await navigate("users");
      toast("User and permissions saved.");
      break;
    }

    case "goods-rename-form":
      await api("update_goods_category",data);closeModal();await refreshLookups();await render();toast("Name updated.");break;
    case "goods-category-form":
      await api("save_goods_category",{name:data.category_name});await refreshLookups();await render();toast("Category added.");break;
    case "goods-subcategory-form":
      await api("save_goods_category",{name:data.subcategory_name,category_id:data.category_id});await refreshLookups();await render();toast("Subcategory added.");break;
    case "backup-restore-form": {
      const result = await api("backup_restore",data);
      closeModal();currentForm=null;selected.clear();session=await api("session");auth();toast(result.message);break;
    }
    case "auth-form":
      await api(session.setup ? "setup" : "login", data);
      session = await api("session");
      await refreshLookups();
      shell();
      await navigate(initialView());
      break;
    case "global-search":
      if (
        currentForm &&
        !confirm(APG.t("Leave this entry? Unsaved changes will be lost."))
      )
        return;
      currentForm = null;
      state.inquiry = null;
      state.deliveryMode = false;
      state.status = "";
      state.station_id = "";
      state.page = 0;
      state.search = data.q;
      await navigate("bilties", false);
      break;
    case "account-form": {
      let r = await api("save_account", data);
      await refreshLookups();
      closeModal();
      toast("Account " + r.id + " created.");
      state.account_id = r.id;
      state.ledgerMode = "detail";
      await navigate("ledger");
      break;
    }
    case "customer-form":
      await api("save_customer", data);
      await refreshLookups();
      closeModal();
      toast("Customer saved.");
      await render();
      break;
    case "bilty-form":
      saveBilty(submitter?.value || "save");
      break;
    case "shipment-form":
      captureShipment();
      if (currentForm.step < 2) {
        if (currentForm.step === 1) {
          if (!currentForm.items.length)
            throw Error("Add at least one bilty before continuing.");
          for (let i of currentForm.items) {
            if (
              !lookups.accounts.some(
                (a) => a.id === i.account_id && a.customer && a.status === "A",
              )
            )
              throw Error(
                "Choose a customer from the suggestions for every bilty.",
              );

          }
        }
        currentForm.step++;
        shipmentForm();
      } else {
        let r = await api("save_shipment", {
          ...currentForm.header,
          id: currentForm.id,
          version: currentForm.version,
          pending_id: currentForm.pendingId,
          kind: currentForm.kind,
          items: currentForm.items,
        });
        let kind = currentForm.kind;
        currentForm = null;
        if(r.pending){await navigate("pending-incoming");toast(r.reference + " submitted for approval.");break;}
        await navigate(kind);
        toast(r.reference + " saved." + (r.warnings?.length ? " Warning: " + r.warnings.join(" ") : ""));
        await showShipment(r.id);
      }
      break;
    case "delivery-form": {
      if (!selected.size) throw Error("Add at least one bilty before saving.");
      let items = [...selected.values()].map((r) => ({
        id: r.id,
        discount: data["discount_" + r.id],
        bilty_received: deliveryEdit?.id && !deliveryEdit.cash_workflow ? data["bilty_received_" + r.id] : "0",
        service_received: deliveryEdit?.id && !deliveryEdit.cash_workflow ? data["service_received_" + r.id] : "0",
        loading: data["loading_" + r.id],
        suzuki: data["suzuki_" + r.id],
      }));
      let r = await api(deliveryEdit?.id ? "update_delivery" : "save_delivery", {
        ...(deliveryEdit || {}),
        dated: data.dated,
        receiver: data.receiver,
        mobile: data.mobile,
        cnic: data.cnic,
        remarks: data.remarks,
        items,
      });
      deliveryEdit=null;
      selected.clear();
      closeModal();
      if(r.pending){await navigate("pending-deliveries");toast(r.reference + " submitted for approval.");break;}
      await navigate("deliveries");
      toast(r.reference + " saved." + (r.warnings?.length ? " Warning: " + r.warnings.join(" ") : ""));
      await showDelivery(r.id);
      break;
    }
    case "delivery-cash-form": {
      const invoice=cashReceivingInvoice,items=invoice.lines.map(line=>({id:line.delivery_item_id,bilty_received:data['bilty_received_'+line.delivery_item_id],service_received:data['service_received_'+line.delivery_item_id]}));
      const total=items.reduce((sum,line)=>sum+Number(line.bilty_received||0)+Number(line.service_received||0),0);
      if(!total&&!confirm(APG.t('No cash entered. Leave the full unpaid amount on the customer account?')))break;
      const result=await api(cashReview?'approve_cash_collection':'receive_delivery_cash',{delivery_id:invoice.header.id,version:invoice.version,request_key:cashReceivingKey,...(cashReview?{pending_id:cashReview.id,pending_version:cashReview.version}:{}),dated:data.dated,cash_account_id:data.cash_account_id,notes:data.notes,items});
      cashReview=null;closeModal();
      if(result.pending){await navigate('pending-cash');toast('Cash collection submitted for admin approval.');break;}
      await navigate('delivery-cash');toast('Delivery cash recorded. Customer balances updated.');await receiveDeliveryCash(invoice.header.id);
      break;
    }
    case "voucher-form": {
      let lines = $$(".voucher-line", form).map((el) => {
        let n = el.dataset.line;
        return {
          account_id: accountID(data["account_" + n]),
          debit: data["debit_" + n],
          credit: data["credit_" + n],
        };
      });
      let r = await api("save_voucher", {
        kind: data.kind,
        dated: data.dated,
        memo: data.memo,
        lines,
      });
      closeModal();
      await navigate("accounts");
      toast(r.reference + " posted.");
      await showVoucher(r.id);
      break;
    }
    case "ledger-form":
      state.account_id = accountID(data.account);
      state.from = data.from;
      state.to = data.to;
      state.page = 0;
      if (!lookups.accounts.some((a) => a.id === state.account_id))
        throw Error("Choose an account from the suggestions.");
      if (data.from > data.to)
        throw Error("Start date must be before end date.");
      closeModal();
      await navigate("ledger", false);
      break;
    case "station-form":
      await api("save_station", data);
      await refreshLookups();
      closeModal();
      toast("Station saved.");
      await render();
      break;
  }
}
document.addEventListener("submit", async (e) => {
  e.preventDefault();
  const form = e.target,
    buttons = $$('[type="submit"]', form);
  if (form.dataset.busy) return;
  form.dataset.busy = "1";
  buttons.forEach((b) => (b.disabled = true));
  let err = $("#form-error, [data-form-error]", form);
  if (err) err.hidden = true;
  try {
    await submitForm(form, e.submitter);
  } catch (error) {
    if (err?.isConnected) {
      err.textContent = error.message;
      err.hidden = false;
      err.scrollIntoView({ block: "nearest" });
    } else toast(error.message);
  } finally {
    delete form.dataset.busy;
    buttons.forEach((b) => (b.disabled = false));
  }
});

document.addEventListener("keydown", (e) => {
  if (
    e.key === "Enter" &&
    e.target.closest("#bilty-form") &&
    e.target.id !== "bilty-customer-search" &&
    e.target.id !== "bilty-goods-search" &&
    e.target.tagName === "INPUT"
  ) {
    e.preventDefault();
    $("#bilty-form").requestSubmit($('#bilty-form [value="save"]'));
  }
});
document.addEventListener("focusin", (e) => {
  if (e.target.id === "bilty-customer-search") customerSuggestions();
});
document.addEventListener("pointerdown", (e) => {
  if (!e.target.closest(".customer-picker")) hideCustomerSuggestions();
});
document.addEventListener("keydown", (e) => {
  if (e.target.id !== "bilty-customer-search") return;
  const list = $("#bilty-customer-results");
  if (e.key === "Escape" && list && !list.hidden) {
    e.preventDefault();
    e.stopPropagation();
    hideCustomerSuggestions();
    return;
  }
  if (["ArrowDown", "ArrowUp"].includes(e.key)) {
    e.preventDefault();
    if (list.hidden) customerSuggestions();
    pickerIndex = Math.max(
      0,
      Math.min(
        pickerMatches.length - 1,
        pickerIndex + (e.key === "ArrowDown" ? 1 : -1),
      ),
    );
    $$('[role="option"]', list).forEach((o, n) => {
      o.setAttribute("aria-selected", String(n === pickerIndex));
      if (n === pickerIndex) {
        e.target.setAttribute("aria-activedescendant", o.id);
        o.scrollIntoView({ block: "nearest" });
      }
    });
  }
  if (e.key === "Enter" && list && !list.hidden) {
    e.preventDefault();
    if (pickerMatches.length)
      selectBiltyCustomer(pickerMatches[Math.max(0, pickerIndex)].id);
  }
});
$("#modal").addEventListener("cancel", (e) => {
  e.preventDefault();
  requestCloseModal();
});

window.addEventListener("afterprint", () =>
  document.body.classList.remove("print-dialog", "print-page"),
);
window.addEventListener("beforeunload", (e) => {
  if (currentForm) {
    e.preventDefault();
    e.returnValue = "";
  }
});
let userDirectory;
function photoFields(user, id) {
  return `<div class="profile-photo-editor"><div class="photo-preview">${avatarMarkup(user, true)}</div><div><b>Profile photo</b><p>JPEG, PNG or WebP. Your photo is cropped to a square.</p><div class="buttons"><button type="button" class="btn small" data-action="choose-avatar" data-input="${id}">${icon("plus")}Choose photo</button><input type="file" class="photo-upload" id="${id}" hidden accept="image/jpeg,image/png,image/webp"><button type="button" class="btn small" data-action="remove-avatar">Remove</button></div></div><input type="hidden" name="avatar" value="${esc(user.avatar || "")}"></div>`;
}
function personalFields(user) {
  return `<div class="form-grid">${field("full_name", "Full name *", user.full_name || user.username || "", "text", 'required maxlength="100"', true)}${field("job_title", "Job title", user.job_title, "text", 'maxlength="80"')}${field("email", "Email", user.email, "email", 'maxlength="120"')}${field("phone", "Phone", user.phone, "tel", 'maxlength="40"')}${field("bio", "About / notes", user.bio, "text", 'maxlength="500"', true)}</div>`;
}
async function profilePage() {
  const user = await api("profile");
  return (
    head("My profile", "The person behind your workspace.") +
    `<div class="profile-layout"><aside class="panel profile-summary">${avatarMarkup(user, true)}<h2>${esc(user.full_name || user.username)}</h2><p>${esc(user.job_title || "APG workspace member")}</p><span class="tag ${user.role === "super_admin" ? "orange" : "green"}">${icon("shield")}${esc(roleLabel(user.role))}</span><div class="profile-facts"><div><span>Username</span><b>${esc(user.username)}</b></div><div><span>Account status</span><b>Active</b></div><div><span>Workspace</span><b>Azad Pakistan Goods</b></div></div><div class="note-box">${user.role === "super_admin" ? "You have full access. Your super admin account cannot be disabled or demoted." : "Your super admin manages your role and permissions. Profile changes do not change your access."}</div></aside><div class="profile-main"><section class="panel"><div class="panel-head"><div><span class="section-kicker">MAKE IT YOURS</span><h2>Personal details</h2><p>Your photo and details appear with your account.</p></div></div><form id="profile-form" class="panel-body">${photoFields(user, "profile-photo")}${personalFields(user)}<div class="error" id="form-error" role="alert" hidden></div><div class="form-actions"><span class="note">Username and access are managed separately.</span><button type="submit" class="btn primary">${icon("check")}Save profile</button></div></form></section><section class="panel password-panel"><div class="panel-head"><div><span class="section-kicker">ACCOUNT SECURITY</span><h2>Change password</h2><p>Other sessions are signed out when you change your password.</p></div></div><form id="password-form" class="panel-body"><div class="form-grid">${field("current_password", "Current password *", "", "password", 'required autocomplete="current-password" maxlength="128"', true)}${field("new_password", "New password *", "", "password", 'required autocomplete="new-password" minlength="10" maxlength="72"')}${field("confirm_password", "Confirm new password *", "", "password", 'required autocomplete="new-password" minlength="10" maxlength="72"')}</div><div class="error" id="password-form-error" data-form-error role="alert" hidden></div><div class="form-actions"><span class="note">Use at least 10 characters.</span><button class="btn" type="submit">${icon("shield")}Update password</button></div></form></section></div></div>`
  );
}
async function usersPage() {
  const d = await api("users", null, params());
  userDirectory = d;
  listData = d;
  state.page = d.page;
  return (
    head(
      "People & permissions",
      "Give every person the right tools for their work.",
      btn("Add user", "new-user", true, "plus"),
      "YOUR TEAM, YOUR CONTROL",
    ) +
    `<section class="team-banner"><span class="team-banner-icon">${icon("shield")}</span><div><h2>A place for everyone.<br>The right access for each person.</h2><p>You control who can view, create and manage records. Your super admin access stays protected.</p></div><span class="tag">SUPER ADMIN WORKSPACE</span></section><div class="metrics team-metrics">${[
      ["Total people", d.counts.total, "users"],
      ["Active accounts", d.counts.active, "check"],
      ["Inactive accounts", d.counts.inactive, "shield"],
    ]
      .map(
        ([title, value, ic]) =>
          `<div class="metric"><div class="metric-top"><span>${title}</span><span class="metric-icon">${icon(ic)}</span></div><strong>${num(value)}</strong><small>${title === "Inactive accounts" ? "Sign-in is disabled" : "Across your workspace"}</small></div>`,
      )
      .join(
        "",
      )}</div><section class="panel">${searchBar("Find a person by name, username or email…")}<div class="table-scroll"><table><thead><tr><th>Person</th><th>Role</th><th>Access</th><th>Status</th><th>Last sign-in</th><th></th></tr></thead><tbody>${d.rows.map((user) => `<tr><td><div class="person">${avatarMarkup(user)}<div><strong>${esc(user.full_name || user.username)}</strong><small>@${esc(user.username)}${user.email ? " · " + esc(user.email) : ""}</small></div></div></td><td>${tag(roleLabel(user.role), user.role === "super_admin" ? "orange" : "")}</td><td><span class="permission-total">${user.role === "super_admin" ? "Full access" : user.permissions.length + " permissions"}</span><small>${esc(user.job_title || "Workspace member")}</small></td><td>${tag(Number(user.active) ? "Active" : "Inactive", Number(user.active) ? "green" : "gray")}</td><td>${user.last_login ? fmttime(user.last_login) : "Not signed in yet"}</td><td>${user.role === "super_admin" ? `<button class="btn small" data-view="profile">My profile ${icon("arrow")}</button>` : `<button class="btn small" data-action="edit-user" data-id="${user.id}">${icon("edit")}Manage access</button>`}</td></tr>`).join("")}</tbody></table></div>${!d.rows.length ? empty("No people match this search.") : ""}${pagination(d)}</section><div class="data-note">${icon("shield")}<span>Permissions are checked on the server for every request. Operations incoming goods require super admin approval; only the incoming shipment’s godown charges total and direct editing are restricted for that role. Deactivated users and reset passwords invalidate existing sessions.</span></div>`
  );
}
function permissionChecklist(selected) {
  const catalog = userDirectory.catalog;
  const groups = [...new Set(Object.values(catalog).map((item) => item[2]))];
  return groups
    .map(
      (group) =>
        `<section class="permission-group"><div class="permission-group-title"><h3>${esc(group)}</h3><span>${Object.values(catalog).filter((item) => item[2] === group).length} controls</span></div><div class="permission-grid">${Object.entries(
          catalog,
        )
          .filter(([, value]) => value[2] === group)
          .map(
            ([key, [label, description]]) =>
              `<label class="permission-choice"><input type="checkbox" name="permission" value="${esc(key)}" ${selected.includes(key) ? "checked" : ""}><span><b>${esc(label)}</b><small>${esc(description)}</small></span></label>`,
          )
          .join("")}</div></section>`,
    )
    .join("");
}
async function userForm(id) {
  if (!userDirectory) userDirectory = await api("users");
  const user = id
    ? await api("user", null, { id })
    : {
        role: "operations",
        active: 1,
        permissions: userDirectory.roles.operations.permissions,
      };
  if (user.role === "super_admin") {
    await navigate("profile");
    return;
  }
  modal(
    id ? "Manage team member" : "Add a team member",
    id
      ? "Update details, account status and individual permissions."
      : "Create a login, then choose exactly what this person can access.",
    `<form id="user-form"><input type="hidden" name="id" value="${user.id || ""}"><input type="hidden" name="version" value="${user.version || 1}"><div class="user-form-section">${photoFields(user, "user-photo")}${personalFields(user)}<hr class="divider"><div class="form-grid">${field("username", "Username *", user.username, "text", `required minlength="3" maxlength="40" autocomplete="off" ${id ? "readonly" : ""}`)}${selectField(
      "active",
      "Account status",
      [
        ["1", "Active · can sign in"],
        ["0", "Inactive · sign-in disabled"],
      ],
      String(user.active),
      true,
    )}${field("password", id ? "Reset password (optional)" : "Initial password *", "", "password", `${id ? "" : "required"} minlength="10" maxlength="72" autocomplete="new-password"`, true)}</div><p class="note user-password-note">${id ? "Leave the password empty to keep it. Setting a new password signs out this user on every device." : "Use at least 10 characters. Share the login securely with this team member."}</p></div><section class="access-editor"><div class="access-editor-head"><div><span class="section-kicker">THE RIGHT TOOLS</span><h2>Role & permissions</h2><p>A role supplies a starting point. The selected permissions below are the actual access granted.</p></div><span class="count-badge" id="permission-count">${user.permissions.length}</span></div><div class="role-picker">${selectField(
      "role",
      "Role preset",
      Object.entries(userDirectory.roles).map(([key, role]) => [
        key,
        role.label,
      ]),
      user.role,
      true,
    )}<div class="note-box">Creating records also grants their required viewing permissions. Unchecking a required view removes the dependent create permission.</div></div><div id="permission-checklist">${permissionChecklist(user.permissions)}</div></section><div class="error" id="form-error" role="alert" hidden></div><div class="form-actions user-form-footer"><span class="note">Only you can manage users and access.</span><div class="buttons">${btn("Cancel", "close-modal")}<button class="btn primary" type="submit">${icon("check")}${id ? "Save changes" : "Create user"}</button></div></div></form>`,
  );
  $("#modal").classList.add("user-dialog");
}
function updatePermissionChoices(changed) {
  const boxes = $$('#user-form [name="permission"]');
  const selected = new Set(
    boxes.filter((box) => box.checked).map((box) => box.value),
  );
  const dependencies = userDirectory.dependencies;
  let again;
  do {
    again = false;
    for (const [key, required] of Object.entries(dependencies)) {
      if (!selected.has(key)) continue;
      for (const permission of required) {
        if (selected.has(permission)) continue;
        if (changed?.checked) {
          selected.add(permission);
        } else {
          selected.delete(key);
        }
        again = true;
      }
    }
  } while (again);
  boxes.forEach((box) => (box.checked = selected.has(box.value)));
  $("#permission-count").textContent = selected.size;
}
document.addEventListener("change", async (e) => {
  const el = e.target;
  if (el.matches('#user-form [name="role"]')) {
    const preset = userDirectory.roles[el.value];
    $$('#user-form [name="permission"]').forEach(
      (box) => (box.checked = preset.permissions.includes(box.value)),
    );
    updatePermissionChoices({ checked: true });
  }
  if (el.matches('#user-form [name="permission"]')) updatePermissionChoices(el);
  if (!el.matches(".photo-upload")) return;
  const file = el.files[0];
  if (!file) return;
  const form = el.closest("form");
  form.dataset.photoLoading = "1";
  try {
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 8 * 1024 * 1024
    )
      throw Error("Choose a JPEG, PNG or WebP image smaller than 8 MB.");
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 256;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, 256, 256);
      const size = Math.min(image.width, image.height);
      ctx.drawImage(
        image,
        (image.width - size) / 2,
        (image.height - size) / 2,
        size,
        size,
        0,
        0,
        256,
        256,
      );
      const avatar = canvas.toDataURL("image/jpeg", 0.85);
      form.querySelector('[name="avatar"]').value = avatar;
      form.querySelector(".photo-preview").innerHTML = avatarMarkup(
        {
          avatar,
          username:
            form.querySelector('[name="full_name"]')?.value || "Profile",
        },
        true,
      );
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch (error) {
    toast(error.message);
  } finally {
    delete form.dataset.photoLoading;
    el.value = "";
  }
});

function auth() {
  closeThermalPreview();
  requestID++;
  closeModal();
  const setup = session.setup;
  toggleMenu(false);
  $("#app").innerHTML =
    `<div class="auth-layout"><div class="auth-art"><div class="brand"><div class="brand-mark">${icon("box")}</div><div><b>APG<span>.</span></b><small>AZAD PAKISTAN GOODS</small></div></div><div class="auth-story"><span class="hero-label"><span class="dot"></span> YOUR BUSINESS, IN GOOD HANDS</span><h1>Goods in motion.<br>Business in order.</h1><p>A clear path from incoming goods to delivery.<br>One workspace for the people who keep it moving.</p><div class="auth-journey"><span>${icon("incoming")}Receive</span><i></i><span>${icon("box")}Organise</span><i></i><span>${icon("truck")}Deliver</span></div></div><footer><span>${icon("pin")} D. I. Khan, Pakistan</span><span>AZAD PAKISTAN GOODS</span></footer></div><div class="auth-side">${APG.picker()}<div class="auth-form"><span class="auth-overline">WELCOME TO YOUR WORKSPACE</span><div class="auth-mark">${icon("box")}</div><h1>${setup ? "A fresh start." : "Welcome back."}</h1><p class="subtitle">${setup ? "Create an administrator login to get started." : "Sign in and pick up where you left off."}</p><form id="auth-form">${field("username", "Username", "", "text", 'required autocomplete="username" maxlength="40" placeholder="Enter your username"')}${field("password", setup ? "Create a password" : "Password", "", "password", `required autocomplete="${setup ? "new-password" : "current-password"}" ${setup ? 'minlength="10"' : ""} maxlength="128" placeholder="Enter your password"`)}<button type="button" class="password-toggle" data-action="toggle-password" aria-pressed="false" aria-controls="f-password">Show</button>${setup ? '<p class="note">Use at least 10 characters.</p>' : ""}<div class="error" id="form-error" role="alert" hidden></div><button type="submit" class="btn primary auth-submit">${setup ? "Create workspace" : "Sign in to workspace"} ${icon("arrow")}</button></form><div class="auth-trust">${icon("shield")}<span>Your goods, customers and accounts.<br>All together. All in one place.</span></div></div><div class="auth-bottom">Azad Pakistan Goods <span>•</span> Goods & accounts</div></div></div>`;
}
function startupError(message) {
  $("#app").innerHTML =
    `<div class="startup-error"><div class="brand-mark">${icon("box")}</div><h1>Your workspace isn’t ready yet.</h1><p>${esc(message)}</p><button type="button" class="btn primary" data-action="reload-app">${icon("refresh")}Try again</button><small>If this continues, ask your administrator to check the database and hosting configuration.</small></div>`;
}
function commandPalette() {
  if (!session?.user) return;
  modal(
    "What would you like to do?",
    "Search tasks, screens and customer ledgers.",
    `<div class="command-search">${icon("search")}<input id="command-search" aria-label="Search tasks and customers" placeholder="Try “delivery”, “receipt” or a customer name…" autocomplete="off"></div><div id="command-results" class="command-results"></div><div class="command-footer"><kbd>↑</kbd><kbd>↓</kbd> to move <kbd>Enter</kbd> to open <kbd>Esc</kbd> to close</div>`,
  );
  $("#modal").classList.add("command-dialog");
  renderCommands("");
  $("#command-search").focus();
}
function renderCommands(value) {
  const q = value.trim().toLowerCase();
  const tasks = availableGroups().flatMap((g) =>
    g.items.map(([key, title, desc, ic]) => ({ key, title, desc, ic })),
  );
  const matches = tasks.filter((t) =>
    (t.title + " " + t.desc + " " + APG.t(t.title) + " " + APG.t(t.desc)).toLowerCase().includes(q),
  );
  const screens = navs
    .filter(([v]) => canView(v))
    .filter(([v, ic, title]) => (title + " " + APG.t(title)).toLowerCase().includes(q));
  const customers =
    q.length >= 2 && can("ledger.view")
      ? lookups.accounts
          .filter(
            (a) =>
              a.customer && (a.name + " " + a.id).toLowerCase().includes(q),
          )
          .slice(0, 5)
      : [];
  $("#command-results").innerHTML =
    (matches.length
      ? '<div class="command-label">QUICK ACTIONS</div>' +
        matches
          .map(
            (t) =>
              `<button class="command-option" data-dashboard="${t.key}">${icon(t.ic)}<span><b>${esc(t.title)}</b><small>${esc(t.desc)}</small></span>${icon("arrow")}</button>`,
          )
          .join("")
      : "") +
      (screens.length
        ? '<div class="command-label">GO TO</div>' +
          screens
            .map(
              ([v, ic, title]) =>
                `<button class="command-option" data-view="${v}">${icon(ic)}<span><b>${esc(title)}</b></span>${icon("arrow")}</button>`,
            )
            .join("")
        : "") +
      (customers.length
        ? '<div class="command-label">CUSTOMER LEDGERS</div>' +
          customers
            .map(
              (a) =>
                `<button class="command-option" data-action="customer-ledger" data-id="${esc(a.id)}">${icon("users")}<span><b>${esc(a.name)}</b><small>${esc(a.id)}</small></span>${icon("arrow")}</button>`,
            )
            .join("")
        : "") || empty("No matches. Try another task or customer name.");
}
document.addEventListener("input", (e) => {
  if (e.target.id === "command-search") renderCommands(e.target.value);
});
document.addEventListener("keydown", (e) => {
  if (
    (e.metaKey || e.ctrlKey) &&
    e.key.toLowerCase() === "k" &&
    session?.user
  ) {
    e.preventDefault();
    if (!$("#modal").open) commandPalette();
    return;
  }
  if (e.key === "Escape") toggleMenu(false);
  if (
    e.target.closest(".command-dialog") &&
    ["ArrowDown", "ArrowUp", "Enter"].includes(e.key)
  ) {
    const options = $$(".command-option");
    if (!options.length) return;
    const current = options.indexOf(document.activeElement);
    if (e.key === "Enter") {
      if (current < 0) {
        e.preventDefault();
        options[0].click();
      }
      return;
    }
    e.preventDefault();
    const next =
      e.key === "ArrowDown"
        ? Math.min(options.length - 1, current + 1)
        : Math.max(0, current - 1);
    options[next].focus();
  }
});

(async () => {
  try {
    session = await api("session");
    if (!session.user) return auth();
    await refreshLookups();
    shell();
    await navigate(initialView());
  } catch (e) {
    startupError(e.message);
  }
})();

document.addEventListener("keydown", (event) => {
  if (event.target.id === "delivery-bilty-number" && event.key === "Enter") {
    event.preventDefault(); clearTimeout(deliveryLookupTimer); fetchDeliveryBilty();
  }
});

// Treat default monetary zeros as placeholders while editing.
function normalizeMoneyInput(input, focused = false) {
  const original = input.value;
  if (focused && /^0+(?:\.0+)?$/.test(original)) input.value = "";
  else if (!focused && original === "" && !input.validity.badInput) input.value = "0";
  else input.value = original.replace(/^0+(?=\d)/, "");
  if (input.value !== original) input.dispatchEvent(new Event("input", { bubbles: true }));
}
document.addEventListener("focusin", (event) => {
  if (event.target.matches('input[data-money="true"]')) normalizeMoneyInput(event.target, true);
});
document.addEventListener("focusout", (event) => {
  if (event.target.matches('input[data-money="true"]')) normalizeMoneyInput(event.target);
});

window.addEventListener("resize", () => { if ($("#print-preview").open) updateThermalPage(); });

document.addEventListener("change",event=>{if(event.target.id==='goods-analytics-status'){state.goodsStatus=event.target.value;render();}});
document.addEventListener("focusin",event=>{if(event.target.id==='bilty-goods-search'){hideCustomerSuggestions();goodsSuggestions();}});
document.addEventListener("pointerdown",event=>{if(!event.target.closest('.goods-search-picker'))hideGoodsSuggestions();});
document.addEventListener("input",event=>{
 if(event.target.id==='bilty-goods-search'){
  const form=event.target.closest('form'),picker=event.target.closest('.goods-search-picker');
  if(form.elements.namedItem('goods_type').value)event.target.dataset.previousType=form.elements.namedItem('goods_type').value;
  for(const name of ['goods_category_id','goods_subcategory_id','goods_type'])form.elements.namedItem(name).value='';
  picker.dataset.mode='empty';$('#goods-type-hint').textContent='Choose a goods type from the results, or select Other.';form.elements.namedItem('goods_custom').required=false;$("#goods-custom-field").hidden=true;goodsSuggestions();
 }
 if(event.target.name==='goods_custom'&&event.target.closest('#bilty-form')){
  const form=event.target.closest('form'),previous=form.elements.namedItem('goods_type').value,description=form.elements.namedItem('detail');
  if(previous&&description.value===previous)description.value=event.target.value;form.elements.namedItem('goods_type').value=event.target.value;
 }
});
document.addEventListener("keydown",event=>{
 if(event.target.id!=='bilty-goods-search')return;
 const list=$("#bilty-goods-results");
 if(event.key==='Escape'){event.preventDefault();hideGoodsSuggestions();return;}
 if(['ArrowDown','ArrowUp'].includes(event.key)){
  event.preventDefault();if(list.hidden)goodsSuggestions();goodsPickerIndex=Math.max(0,Math.min(goodsPickerMatches.length-1,goodsPickerIndex+(event.key==='ArrowDown'?1:-1)));
  $$('[role="option"]',list).forEach((option,index)=>{option.setAttribute('aria-selected',String(index===goodsPickerIndex));if(index===goodsPickerIndex){event.target.setAttribute('aria-activedescendant',option.id);option.scrollIntoView({block:'nearest'});}});
 }
 if(event.key==='Enter'){event.preventDefault();if(!list.hidden&&goodsPickerMatches.length)selectGoodsType(goodsPickerMatches[Math.max(0,goodsPickerIndex)].id);}
});



document.addEventListener("focusout",event=>{
 if(event.target.id==='bilty-goods-search'&&!event.target.closest('.goods-search-picker').contains(event.relatedTarget))hideGoodsSuggestions();
});

window.addEventListener("apg-language-change", () => { if (thermalSnapshot) updateThermalPage(); });

// Refresh shared admin views after changes from another account. Never replace a draft or open record.
let workspaceRevision = null, workspaceRefreshBusy = false;
function workspaceRefreshSafe() {
  return session?.user && isSuper() && !document.hidden && !currentForm && !selected.size &&
    !$('#modal').open && !$('#print-preview').open &&
    !document.activeElement?.closest('input,textarea,select,[contenteditable="true"]');
}
async function refreshSharedWorkspace() {
  if (workspaceRefreshBusy || !workspaceRefreshSafe()) return;
  workspaceRefreshBusy = true;
  const view = state.view, request = requestID;
  try {
    const change = await api('workspace_changes');
    if (!workspaceRefreshSafe() || state.view !== view || requestID !== request) return;
    if (workspaceRevision !== change.revision) {
      await refreshLookups();
      if (!workspaceRefreshSafe() || state.view !== view || requestID !== request) return;
      workspaceRevision = change.revision;
      await render();
    }
  } catch { /* A temporary offline connection is retried on the next check. */ }
  finally { workspaceRefreshBusy = false; }
}
setInterval(refreshSharedWorkspace, 20000);
window.addEventListener('focus', refreshSharedWorkspace);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshSharedWorkspace(); });

function updateHandoverTotals(form) {
 const data=Object.fromEntries(new FormData(form)),money=(key,id)=>Math.round(Number(data[key+'_'+id]||0)*100);let due=0;
 for(const row of selected.values()){
  const total=Number(row.total||0)+money('loading',row.id)+money('suzuki',row.id)-Number(row.advance||0)-money('discount',row.id);due+=total;
  const el=$('[data-delivery-totals="'+row.id+'"]',form);if(el)el.innerHTML=deliveryFacts([['Amount due at cash receiving',cash(total)]]);
 }
 $('#delivery-combined').innerHTML=`<h3>Delivery totals</h3>${deliveryFacts([['Bilties',num(selected.size)],['Quantity',num([...selected.values()].reduce((sum,row)=>sum+Number(row.qty||0),0))]])}<div class="delivery-total-banner"><span>Amount due at cash receiving</span><strong>${cash(due)}</strong></div>`;
 $('#delivery-warning').hidden=true;
}
let cashMode='invoices',cashStatusFilter='',cashReceivingInvoice=null,cashReceivingKey='',cashReview=null;
function cashStatus(status){return {pending_approval:'Pending cash approval',awaiting_cash:'Awaiting cash',customer_due:'Customer balance due',customer_credit:'Customer credit',paid:'Paid'}[status]||status;}
async function deliveryCashPage(){
 if(!isSuper())cashMode='invoices';
 const tabs=`<div class="buttons backup-tabs"><button class="btn ${cashMode==='invoices'?'primary':''}" data-action="cash-mode" data-value="invoices">Delivery invoices</button>${isSuper()?`<button class="btn ${cashMode==='customers'?'primary':''}" data-action="cash-mode" data-value="customers">Customer balances</button>`:''}</div>`;
 if(cashMode==='customers'){
  const data=await api('delivery_customer_balances',null,{search:state.search});listData=data;
  return head('Delivery Cash Receiving','Unpaid delivery amounts by customer and Party to.')+tabs+`<p class="note">Awaiting cash amounts are listed for collection. Customer ledgers update when cash receiving is confirmed.</p><section class="panel" style="margin-top:18px">${searchBar('Search customer or party…')}<div class="table-scroll"><table><thead><tr><th>Customer</th><th>Party to</th><th>Bilties</th><th>Amount due</th><th>Cash received</th><th>Customer balance</th><th>Customer credit</th><th></th></tr></thead><tbody>${data.rows.map(row=>`<tr><td>${esc(row.customer)}<small>${esc(row.account_id)}</small></td><td>${esc(row.party_to||'—')}</td><td>${num(row.bilties)}</td><td>${cash(row.due)}</td><td>${cash(row.received)}</td><td><strong>${cash(Math.max(0,row.balance))}</strong>${row.awaiting_cash?`<small>Awaiting cash: ${cash(row.awaiting_cash)}</small>`:''}</td><td>${cash(Math.max(0,-row.balance))}</td><td><button class="btn" data-action="report-ledger" data-id="${esc(row.account_id)}">View ledger</button></td></tr>`).join('')}</tbody></table></div>${data.rows.length?'':empty('No outstanding delivery balances.')}</section>`;
 }
 const data=await api('delivery_cash_list',null,params({status:cashStatusFilter}));listData=data;state.page=data.page;
 return head('Delivery Cash Receiving',isOperations()?'Enter collected cash and submit it for admin approval.':'Record cash after handover. Part payments leave a traceable balance against each customer.',btn('Refresh','refresh',false,'refresh'))+tabs+`<div class="metrics" style="margin-top:18px">${[['Amount due',data.stats.due],['Cash received',data.stats.received],['Customer balance',data.stats.outstanding],['Customer credit',data.stats.credit]].map(([label,value])=>`<div class="metric"><span>${label}</span><strong>${cash(value)}</strong></div>`).join('')}</div><section class="panel">${searchBar('Search delivery, bilty or customer…',`<select id="cash-status" class="filter" aria-label="Cash status">${[['','All statuses'],['awaiting','Awaiting cash'],['outstanding','Customer balance due'],['paid','Paid / credit']].map(([value,label])=>`<option value="${value}" ${cashStatusFilter===value?'selected':''}>${label}</option>`).join('')}</select>`,true)}<div class="table-scroll"><table><thead><tr><th>Delivery</th><th>Date</th><th>Receiver</th><th>Amount due</th><th>Cash received</th><th>Customer balance</th><th>Status</th><th></th></tr></thead><tbody>${data.rows.map(row=>`<tr><td>${esc(row.reference)}<small>${num(row.bilties)} bilties</small></td><td>${fmtdate(row.dated)}</td><td>${esc(row.receiver)}</td><td>${cash(row.due)}</td><td>${cash(row.received)}</td><td><strong>${cash(row.outstanding)}</strong>${row.credit?`<small>Customer credit: ${cash(row.credit)}</small>`:''}</td><td>${tag(cashStatus(row.pending_cash?'pending_approval':!row.receipts?'awaiting_cash':row.outstanding>0?'customer_due':row.credit>0?'customer_credit':'paid'))}</td><td><button class="btn primary" data-action="receive-delivery-cash" data-id="${row.id}">Receive / view cash</button></td></tr>`).join('')}</tbody></table></div>${data.rows.length?'':empty('No delivery cash invoices yet.')}${pagination(data)}</section><p class="note">Only deliveries created with the new cash flow appear here. Earlier receipts remain unchanged in Deliveries.</p>`;
}
async function receiveDeliveryCash(id,review=null){
 const invoice=await api('delivery_cash_invoice',null,{id});if(invoice.pending_cash&&!review){if(isSuper()||invoice.pending_cash.submitted_name===session.user)return reviewPendingCash(invoice.pending_cash.id);toast('A cash collection is already awaiting approval for this delivery.');return;}cashReview=review;cashReceivingInvoice=invoice;cashReceivingKey=crypto.randomUUID();
 const accounts=invoice.cash_accounts||lookups.accounts.filter(row=>row.status==='A'&&(/^1-(101|106)-/.test(row.id))),defaultAccount=accounts.find(row=>row.id.startsWith('1-101-'))?.id||accounts[0]?.id||'';
 modal((review?'Pending cash collection · ':'Delivery Cash Receiving · ')+esc(invoice.header.reference),esc(invoice.header.receiver),`${review?`<div class="note-box">Submitted by: ${esc(review.submitted_name)}. Pending approval; these amounts are not posted yet.</div>`:isOperations()?'<div class="note-box">Submit the collected cash for admin approval. Customer and cash balances update only after approval.</div>':''}<div class="delivery-total-banner">${deliveryFacts([['Amount due',cash(invoice.due)],['Cash received',cash(invoice.received)],['Customer balance',cash(invoice.outstanding)],['Customer credit',cash(invoice.credit)]])}</div><form id="delivery-cash-form"><div class="form-grid">${field('dated','Received date',today(),'date','required')}${selectField('cash_account_id','Cash / bank account',accounts.map(row=>[row.id,row.name]),defaultAccount)}${field('notes','Notes','','text','maxlength="500"',true)}</div>${invoice.lines.map(line=>`<section class="bilty-card"><h3>Bilty ${esc(line.bilty)}</h3><p><strong>${esc(line.customer)}</strong> · ${esc(line.account_id)}</p><p>Party to: ${esc(line.party_to||'—')}</p>${deliveryFacts([['Bilty amount due',cash(line.bilty_due)],['Service charges',cash(line.service_due)],['Cash received',cash(line.bilty_received+line.service_received)],['Customer balance',cash(Math.max(0,line.balance))],['Customer credit',cash(Math.max(0,-line.balance))]])}<div class="buttons"><button type="button" class="btn" data-action="cash-pay-full" data-id="${line.delivery_item_id}">Paid in full</button><button type="button" class="btn" data-action="cash-pay-none" data-id="${line.delivery_item_id}">No payment</button></div><div class="form-grid">${field('bilty_received_'+line.delivery_item_id,'Bilty cash received (Rs)','0','number','min="0" step="0.01"')}${field('service_received_'+line.delivery_item_id,'Loading / Suzuki received (Rs)','0','number','min="0" step="0.01"')}</div><div data-cash-line-feedback="${line.delivery_item_id}" class="delivery-line-totals" aria-live="polite"></div></section>`).join('')}<div id="cash-collect-summary" class="shipment-breakdown" aria-live="polite"></div><div class="note-box">Any amount not collected stays on the selected bilty customer’s account. You can collect it later here. Amounts above the balance create customer credit.</div><div id="form-error" class="error" hidden></div><div class="form-actions">${btn('Close','close-modal')}<button class="btn primary" type="submit">${review?'Approve cash collection':isOperations()?'Submit cash for approval':'Record cash / leave balance on account'}</button></div></form><hr><h3>Collection history</h3>${invoice.receipts.map(receipt=>`<div class="summary-row"><span>${fmtdate(receipt.dated)} · ${esc(receipt.created_by)}<small>${esc(receipt.cash_account||'Customer account')} · ${esc(receipt.notes)}</small></span><strong>${cash(receipt.amount)}</strong></div>`).join('')||'<p class="note">No cash recorded yet.</p>'}`);
 if(review){const form=$('#delivery-cash-form');for(const [name,value] of Object.entries(review.payload)){if(name==='items')continue;const input=form.elements.namedItem(name);if(input)input.value=value;}for(const line of review.payload.items)for(const key of ['bilty_received','service_received']){const input=form.elements.namedItem(key+'_'+line.id);if(input)input.value=line[key];}if(!isSuper()){$$('input,select,button[data-action="cash-pay-full"],button[data-action="cash-pay-none"],button[type="submit"]',form).forEach(input=>input.disabled=true);$('button[type="submit"]',form).textContent='Awaiting approval';}}
 updateCashReceivingTotals();modalSnapshot=modalValues();
 recordPrintContext={kind:'generic',data:{title:'Delivery cash statement',content:slipText('Delivery',invoice.header.reference)+slipText('Receiver',invoice.header.receiver)+invoice.lines.map(line=>slipEntry('Bilty '+line.bilty,slipText('Customer',line.customer)+slipText('Party to',line.party_to)+slipMoney('Amount due',line.bilty_due+line.service_due)+slipMoney('Cash received',line.bilty_received+line.service_received)+slipMoney('Customer balance',line.balance))).join('')+invoice.receipts.map(receipt=>slipEntry('Collection '+receipt.id,slipText('Date',fmtdate(receipt.dated))+slipText('Cash / bank account',receipt.cash_account)+slipMoney('Cash received',receipt.amount))).join('')}};
 $('#modal').insertAdjacentHTML('beforeend',`<div class="modal-footer">${btn('Print cash statement','print-dialog',false,'print')}</div>`);
}
function updateCashReceivingTotals(){
 const form=$('#delivery-cash-form');if(!form||!cashReceivingInvoice)return;const values=Object.fromEntries([...form.elements].filter(input=>input.name).map(input=>[input.name,input.value]));let received=0,outstanding=0,credit=0;
 for(const row of cashReceivingInvoice.lines){const amount=Math.round(Number(values['bilty_received_'+row.delivery_item_id]||0)*100)+Math.round(Number(values['service_received_'+row.delivery_item_id]||0)*100);received+=amount;outstanding+=Math.max(0,row.balance-amount);credit+=Math.max(0,amount-row.balance);const el=$('[data-cash-line-feedback="'+row.delivery_item_id+'"]',form);if(el)el.innerHTML=deliveryFacts([['After this collection',row.balance-amount<0?'Customer credit':row.balance-amount===0?'Paid in full':amount>0?'Part payment':'Unpaid'],['Remaining customer balance',cash(Math.max(0,row.balance-amount))]]);}
 $('#cash-collect-summary').innerHTML=deliveryFacts([['Cash receiving now',cash(received)],['Remaining customer balance',cash(outstanding)],['Customer credit',cash(credit)]]);
}
document.addEventListener('input',event=>{if(event.target.closest('#delivery-cash-form'))updateCashReceivingTotals();});
document.addEventListener('change',event=>{if(event.target.id==='cash-status'){cashStatusFilter=event.target.value;state.page=0;render();}});

async function pendingCashCollections(){
 const data=await api('pending_cash_collections',null,{page:state.page});listData=data;
 return head('Pending cash collections',isSuper()?'Review operator cash collections before posting customer and cash balances.':'Your cash submissions stay here until admin approval.',btn('Refresh','refresh',false,'refresh'))+`<section class="panel"><div class="table-scroll"><table><thead><tr><th>Submission</th><th>Delivery</th><th>Submitted by</th><th>Date</th><th>Receiver</th><th>Cash submitted</th><th></th></tr></thead><tbody>${data.rows.map(row=>`<tr><td>PENDING-CASH-${row.id}<small>${esc(row.submitted_at)}</small></td><td>${esc(row.reference)}</td><td>${esc(row.submitted_name)}</td><td>${fmtdate(row.dated)}</td><td>${esc(row.receiver)}</td><td><strong>${cash(row.amount)}</strong></td><td><button class="btn primary" data-action="review-pending-cash" data-id="${row.id}">${isSuper()?'Review & approve':'View submission'}</button>${isSuper()?` <button class="btn" data-action="discard-pending-cash" data-id="${row.id}">Discard entry</button>`:''}</td></tr>`).join('')}</tbody></table></div>${data.rows.length?'':empty('No cash collections awaiting approval.')}${pagination(data)}</section>`;
}
async function reviewPendingCash(id){const review=await api('cash_collection_submission',null,{id});await receiveDeliveryCash(review.delivery_id,review);}
