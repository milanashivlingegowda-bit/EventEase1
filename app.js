const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const state = { user: null, events: [], bookings: [], favourites: [], category: "All", search: "", view: "discover", modalMode: "login", currentTicket: null, adminEvents: [], adminBookings: [] };
const categoryIcons = { Technology: "💻", Sports: "🏆", Cultural: "🎶", Workshop: "✨", Other: "🎟️" };
const views = ["discover", "registrations", "favourites", "profile", "settings", "admin"];
const esc = value => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
const dateFmt = value => value ? new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "Date to be announced";
const timeFmt = value => value ? new Date(value).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) : "";
const dateTime = value => `${dateFmt(value)} · ${timeFmt(value)}`;
const deadlinePassed = event => new Date(event.lastDate) < new Date();
const money = value => Number(value) === 0 ? "Free" : `₹${Number(value).toLocaleString("en-IN")}`;
const userInitial = () => (state.user?.name || "G").trim().charAt(0).toUpperCase();
const isAdmin = () => state.user?.role === "admin";

async function api(url, options = {}) {
  const opts = { credentials: "same-origin", ...options, headers: { ...(options.body && !(options.body instanceof FormData) ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) } };
  if (opts.body && typeof opts.body !== "string" && !(opts.body instanceof FormData)) opts.body = JSON.stringify(opts.body);
  const response = await fetch(url, opts);
  const type = response.headers.get("content-type") || "";
  if (!response.ok) {
    const body = type.includes("application/json") ? await response.json() : { error: "Something went wrong. Please try again." };
    throw new Error(body.error || "Something went wrong.");
  }
  if (type.includes("text/csv")) return response.blob();
  return response.status === 204 ? null : response.json();
}
function toast(message, error = false) {
  const node = document.createElement("div");
  node.className = `toast${error ? " error" : ""}`; node.textContent = message;
  $("#toastRegion").append(node); setTimeout(() => node.remove(), 3500);
}
function showView(name) {
  if (!views.includes(name)) name = "discover";
  if (["registrations", "favourites", "profile", "settings"].includes(name) && !state.user) {
    openAuth("login", `Log in to view ${name === "registrations" ? "your registrations" : name === "favourites" ? "your favourites" : name}.`);
    return;
  }
  if (name === "admin" && !isAdmin()) { toast("Admin access is available to authorized administrators only.", true); return; }
  state.view = name;
  views.forEach(view => $(`#${view}View`)?.classList.toggle("active", view === name));
  $$(".nav-item").forEach(button => button.classList.toggle("active", button.dataset.view === name));
  $("#breadcrumbCurrent").textContent = name === "admin" ? "Admin dashboard" : name.charAt(0).toUpperCase() + name.slice(1);
  $("#sidebar").classList.remove("open");
  if (name === "registrations") renderBookings();
  if (name === "favourites") renderFavourites();
  if (name === "profile") renderProfile();
  if (name === "settings") renderSettings();
  if (name === "admin") renderAdmin();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function setTheme(theme, save = false) {
  document.body.classList.toggle("dark", theme === "dark");
  $("#quickTheme").textContent = theme === "dark" ? "☀" : "☾";
  if (save && state.user) api("/api/profile", { method: "PATCH", body: { theme } }).then(({ user }) => { state.user = user; updateAccount(); }).catch(err => toast(err.message, true));
  else if (!state.user) localStorage.setItem("eventease-theme", theme);
}
function updateAccount() {
  const account = $("#sidebarAccount");
  account.innerHTML = `<div class="avatar">${esc(userInitial())}</div><div class="account-info"><strong>${esc(state.user?.name || "Guest visitor")}</strong><small>${esc(state.user?.email || "Explore as a guest")}</small></div><button class="icon-button" id="accountAction" aria-label="Account">${state.user ? "↗" : "＋"}</button>`;
  $("#accountAction").addEventListener("click", () => state.user ? showView("profile") : openAuth("login"));
  $("#topLogin").classList.toggle("hidden", Boolean(state.user));
  $("#topSignup").classList.toggle("hidden", Boolean(state.user));
  $("#bookingCount").textContent = state.bookings.length;
  let adminButton = $("#adminNav");
  if (isAdmin() && !adminButton) {
    const button = document.createElement("button"); button.id = "adminNav"; button.className = "nav-item"; button.dataset.view = "admin"; button.innerHTML = "<span>▦</span> Admin dashboard";
    $(".side-nav").append(button);
    button.addEventListener("click", () => showView("admin"));
  } else if (!isAdmin() && adminButton) adminButton.remove();
}
async function refreshUserData() {
  const me = await api("/api/me");
  state.user = me.user;
  if (state.user) {
    const result = await api("/api/bookings"); state.bookings = result.bookings;
    const fav = await api("/api/favourites"); state.favourites = fav.events;
    setTheme(state.user.theme || "light");
  } else {
    state.bookings = []; state.favourites = [];
    setTheme(localStorage.getItem("eventease-theme") || "light");
  }
  updateAccount();
}
async function loadEvents() {
  const result = await api(`/api/events?category=${encodeURIComponent(state.category)}&search=${encodeURIComponent(state.search)}`);
  state.events = result.events;
  renderEvents();
  $("#statEvents").textContent = String(state.events.length).padStart(2, "0");
}
function renderEvents() {
  const grid = $("#eventGrid");
  $("#resultCount").textContent = `${state.events.length} ${state.events.length === 1 ? "event" : "events"}`;
  if (!state.events.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">⌕</div><h3>No events found</h3><p>Try a different search or category. Your next moment might be just around the corner.</p><button class="secondary" id="clearFilters">Clear filters</button></div>`;
    $("#clearFilters").addEventListener("click", () => { state.category = "All"; state.search = ""; $("#eventSearch").value = ""; $$(".category-chip").forEach(x => x.classList.toggle("selected", x.dataset.category === "All")); loadEvents(); });
    return;
  }
  grid.innerHTML = state.events.map(event => {
    const expired = deadlinePassed(event), full = event.full;
    const fav = state.favourites.some(x => x.id === event.id);
    const artClass = event.category.toLowerCase();
    const availability = event.unlimited ? "Open registration" : event.capacity ? `${event.available} seats left` : "Open entry";
    const actionText = expired ? "Closed" : full ? "Event full" : event.audience ? "Get tickets" : "Register";
    return `<article class="event-card">
      <div class="event-art ${esc(artClass)}"><span class="event-category">${esc(event.category)}</span><button class="favourite-button ${fav ? "saved" : ""}" data-favourite="${esc(event.id)}" title="${fav ? "Remove favourite" : "Save favourite"}" aria-label="Toggle favourite">${fav ? "♥" : "♡"}</button><div class="event-emoji">${esc(event.image || categoryIcons[event.category] || "🎟️")}</div></div>
      <div class="event-body"><div class="event-date-line">▣ ${esc(dateFmt(event.date))}<span>·</span>${esc(timeFmt(event.date))}</div><h4>${esc(event.title)}</h4><p class="event-desc">${esc(event.description)}</p><div class="event-meta"><span class="meta-pin">⌖</span><span>${esc(event.venue || "Venue to be announced")}</span></div>
      <div class="deadline-box ${expired ? "closed" : ""}"><span>Last registration date</span><strong>${esc(dateFmt(event.lastDate))}</strong></div>
      <div class="event-card-bottom"><div class="event-price">${money(event.fee)}<small>${esc(availability)}</small></div><button class="event-action" data-book="${esc(event.id)}" ${expired || full ? "disabled" : ""}>${actionText} ${expired || full ? "" : "↗"}</button></div></div>
    </article>`;
  }).join("");
}
function openModal(content, wide = false) {
  $("#modalContent").innerHTML = content;
  $("#modalBackdrop").hidden = false;
  $(".modal").classList.toggle("wide", wide);
  document.body.style.overflow = "hidden";
}
function closeModal() { $("#modalBackdrop").hidden = true; document.body.style.overflow = ""; state.currentTicket = null; }
function openAuth(mode = "login", intro = "") {
  state.modalMode = mode;
  const login = mode === "login";
  openModal(`<div class="eyebrow muted">WELCOME TO EVENTEASE</div><h2 id="modalTitle">${login ? "Good to see you." : "Make room for moments."}</h2><p class="modal-intro">${esc(intro || (login ? "Log in to find your bookings and saved events." : "Create your account and start finding your people."))}</p>
    <form id="authForm">${login ? "" : `<div class="field"><label for="authName">Full name</label><input id="authName" name="name" autocomplete="name" required placeholder="Your name"></div>`}
      <div class="field"><label for="authEmail">Email address</label><input id="authEmail" name="email" type="email" autocomplete="email" required placeholder="you@example.com"></div>
      ${login ? "" : `<div class="field"><label for="authPhone">Phone number</label><input id="authPhone" name="phone" type="tel" autocomplete="tel" placeholder="Optional"></div>`}
      <div class="field"><label for="authPassword">Password</label><input id="authPassword" name="password" type="password" minlength="${login ? 1 : 8}" autocomplete="${login ? "current-password" : "new-password"}" required placeholder="${login ? "Enter your password" : "At least 8 characters"}"></div>
      <button class="primary" type="submit">${login ? "Log in" : "Create account"} <span>↗</span></button>
    </form><div class="modal-switch">${login ? "New to EventEase?" : "Already have an account?"} <button id="switchAuth">${login ? "Create an account" : "Log in instead"}</button></div>`);
  $("#authForm").addEventListener("submit", async event => {
    event.preventDefault(); const form = new FormData(event.currentTarget); const body = Object.fromEntries(form.entries());
    const button = $("button[type=submit]", event.currentTarget); button.disabled = true; button.textContent = "Please wait…";
    try {
      const result = await api(login ? "/api/auth/login" : "/api/auth/register", { method: "POST", body });
      state.user = result.user; await refreshUserData(); closeModal(); toast(login ? "Welcome back!" : "Your EventEase account is ready.");
      if (state.view !== "discover") showView(state.view); else await loadEvents();
    } catch (err) { toast(err.message, true); button.disabled = false; button.textContent = login ? "Log in ↗" : "Create account ↗"; }
  });
  $("#switchAuth").addEventListener("click", () => openAuth(login ? "register" : "login"));
}
function openTicket(booking) {
  const event = booking.event || state.events.find(e => e.id === booking.eventId) || {};
  state.currentTicket = booking;
  openModal(`<div id="printableTicket" class="ticket">
    <div class="ticket-head"><div class="ticket-brand"><span class="ticket-brand-mark">e</span> EventEase</div><span class="ticket-type">${booking.type === "Audience ticket" ? "ADMIT ONE" : "EVENT PASS"}</span></div>
    <div class="ticket-main"><div class="ticket-category">${esc(event.category || "Event")}</div><h2>${esc(event.title || "Event ticket")}</h2><p>${esc(event.description || "Your booking confirmation. Keep this ticket handy.")}</p>
      <div class="ticket-info-grid"><div><span>DATE & TIME</span><strong>${esc(dateFmt(event.date))}<br>${esc(timeFmt(event.date))}</strong></div><div><span>VENUE</span><strong>${esc(event.venue || "Venue to be announced")}</strong></div><div><span>NAME</span><strong>${esc(booking.holderName || state.user?.name || "")}</strong></div><div><span>BOOKING TYPE</span><strong>${esc(booking.type)}</strong></div></div></div>
    <div class="ticket-perforation"></div><div class="ticket-foot"><div><span class="ticket-id-label">YOUR UNIQUE BOOKING ID</span><strong class="ticket-id">${esc(booking.bookingId)}</strong></div><span class="ticket-status">${esc(booking.paymentStatus === "Payment due" ? "PAYMENT DUE" : "CONFIRMED")}</span></div>
    </div><div class="ticket-actions"><button class="secondary" id="closeTicket">Close</button><button class="primary" id="printTicket">Print / Save PDF ↗</button></div><p class="ticket-note">Keep your booking ID ready for event check-in.</p>`, true);
  $("#closeTicket").addEventListener("click", closeModal);
  $("#printTicket").addEventListener("click", () => window.print());
}
async function createBooking(eventId) {
  if (!state.user) { openAuth("login", "Log in or create an account to register for this event."); return; }
  try {
    const result = await api("/api/bookings", { method: "POST", body: { eventId } });
    await refreshUserData(); await loadEvents(); toast("You're booked! Your ticket is ready.");
    if (result.booking.conflictWarning) toast("Heads-up: this event may overlap with another booking.", true);
    openTicket(result.booking);
  } catch (err) { toast(err.message, true); }
}
function renderBookings() {
  const root = $("#registrationsContent");
  if (!state.bookings.length) {
    root.innerHTML = `<div class="empty-state"><div class="empty-icon">▤</div><h3>Your next moment is waiting</h3><p>You haven’t booked anything yet. Explore events and your tickets will appear here.</p><button class="primary" id="findEvents">Explore events ↗</button></div>`;
    $("#findEvents").addEventListener("click", () => showView("discover")); return;
  }
  root.innerHTML = `<div class="booking-list">${state.bookings.map(b => {
    const e = b.event || {}; return `<article class="booking-row"><div class="booking-icon">${esc(e.image || "🎟️")}</div><div><h3>${esc(e.title || "Event")}</h3><p>▣ ${esc(dateTime(e.date))}</p><p>⌖ ${esc(e.venue || "Venue to be announced")}</p><span class="booking-id">${esc(b.bookingId)}</span></div><div class="booking-actions"><button class="mini-btn dark" data-ticket="${esc(b.id)}">View ticket ↗</button><span class="status-pill ${b.paymentStatus === "Payment due" ? "due" : ""}">${esc(b.paymentStatus)}</span></div></article>`;
  }).join("")}</div>`;
}
function renderFavourites() {
  const root = $("#favouritesContent");
  if (!state.favourites.length) {
    root.innerHTML = `<div class="empty-state"><div class="empty-icon">♡</div><h3>Keep the good ones close</h3><p>Tap the heart on any event card to save it here for later.</p><button class="primary" id="findFaves">Discover events ↗</button></div>`;
    $("#findFaves").addEventListener("click", () => showView("discover")); return;
  }
  root.innerHTML = `<div class="event-grid">${state.favourites.map(e => miniEventCard(e)).join("")}</div>`;
}
function miniEventCard(e) {
  const expired = deadlinePassed(e);
  return `<article class="event-card"><div class="event-art ${esc(e.category.toLowerCase())}"><span class="event-category">${esc(e.category)}</span><div class="event-emoji">${esc(e.image || "🎟️")}</div></div><div class="event-body"><div class="event-date-line">▣ ${esc(dateFmt(e.date))}</div><h4>${esc(e.title)}</h4><p class="event-desc">${esc(e.description)}</p><div class="deadline-box ${expired ? "closed" : ""}"><span>Last registration date</span><strong>${esc(dateFmt(e.lastDate))}</strong></div><div class="event-card-bottom"><div class="event-price">${money(e.fee)}</div><button class="event-action" data-book="${esc(e.id)}" ${expired || e.full ? "disabled" : ""}>${expired ? "Closed" : e.full ? "Event full" : "Book ↗"}</button></div></div></article>`;
}
function renderProfile() {
  const root = $("#profileContent");
  if (!state.user) return;
  const interests = ["Technology", "Sports", "Cultural", "Workshop"];
  root.innerHTML = `<div class="profile-layout"><div class="panel profile-hero"><div class="profile-big-avatar">${esc(userInitial())}</div><h3>${esc(state.user.name)}</h3><p>${esc(state.user.email)}</p><span class="profile-tag">${isAdmin() ? "Administrator" : "Event Explorer"}</span><p style="margin-top:17px">${state.bookings.length} booking${state.bookings.length === 1 ? "" : "s"} so far</p></div><div class="panel"><h3>Personal details</h3><p class="panel-subtitle">Keep your information up to date.</p><form id="profileForm"><div class="form-grid"><div class="field full"><label for="profileName">Full name</label><input id="profileName" name="name" value="${esc(state.user.name)}" required></div><div class="field full"><label>Email address</label><input value="${esc(state.user.email)}" disabled><small style="color:#91a0b0">Email changes are disabled in this demo.</small></div><div class="field full"><label for="profilePhone">Phone number</label><input id="profilePhone" name="phone" value="${esc(state.user.phone || "")}" placeholder="Add a phone number"></div><div class="field full"><label for="profileInterests">Interests (comma-separated)</label><input id="profileInterests" name="interests" value="${esc((state.user.interests || []).join(", "))}" placeholder="Technology, Sports, Cultural"></div></div><div class="form-actions"><button class="primary" type="submit">Save changes ↗</button></div></form></div></div>`;
  $("#profileForm").addEventListener("submit", async event => {
    event.preventDefault(); const f = new FormData(event.currentTarget);
    try { const result = await api("/api/profile", { method: "PATCH", body: { name: f.get("name"), phone: f.get("phone"), interests: String(f.get("interests") || "").split(",").map(s => s.trim()).filter(Boolean) } }); state.user = result.user; updateAccount(); renderProfile(); toast("Profile updated."); }
    catch (err) { toast(err.message, true); }
  });
}
function renderSettings() {
  $("#settingsContent").innerHTML = `<div class="panel"><h3>Appearance</h3><p class="panel-subtitle">A softer look, or something a little moodier.</p><div class="setting-row"><div class="setting-copy"><strong>Dark mode</strong><small>Switch to a darker theme that's easier on the eyes.</small></div><button class="switch ${document.body.classList.contains("dark") ? "on" : ""}" id="darkSwitch" aria-label="Toggle dark mode" aria-pressed="${document.body.classList.contains("dark")}"></button></div></div>
    <div class="panel"><h3>Your experience</h3><p class="panel-subtitle">Little preferences for your EventEase space.</p><div class="setting-row"><div class="setting-copy"><strong>Event recommendations</strong><small>Suggestions are based on your selected interests when available.</small></div><button class="mini-btn" id="editInterests">Edit interests</button></div><div class="setting-row"><div class="setting-copy"><strong>Account</strong><small>Signed in as ${esc(state.user?.email || "")}</small></div><button class="mini-btn" id="logoutButton">Log out ↗</button></div></div>
    <div class="panel"><h3>About EventEase</h3><p style="color:var(--muted);font-size:11px;line-height:1.8;margin-bottom:0">EventEase keeps your event discovery, bookings, and digital tickets together in one simple place. This student project demo does not process real payments or send real email notifications.</p></div>`;
  $("#darkSwitch").addEventListener("click", () => setTheme(document.body.classList.contains("dark") ? "light" : "dark", true));
  $("#editInterests").addEventListener("click", () => showView("profile"));
  $("#logoutButton").addEventListener("click", logout);
}
async function logout() {
  try { await api("/api/auth/logout", { method: "POST" }); } catch {}
  state.user = null; state.bookings = []; state.favourites = []; updateAccount(); setTheme(localStorage.getItem("eventease-theme") || "light"); toast("You’ve logged out."); showView("discover"); await loadEvents();
}
function dateInputValue(date) {
  const d = new Date(date); if (Number.isNaN(d.getTime())) return "";
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0,16);
}
function renderAdmin() {
  if (!isAdmin()) return;
  $("#adminContent").innerHTML = `<div class="admin-stats" id="adminStats"><div class="admin-stat"><span>Total events</span><strong>—</strong><i>Published events</i></div><div class="admin-stat"><span>Registered users</span><strong>—</strong><i>Member accounts</i></div><div class="admin-stat"><span>Total bookings</span><strong>—</strong><i>All registrations</i></div><div class="admin-stat"><span>Feedback entries</span><strong>—</strong><i>Event responses</i></div></div><div class="panel"><h3>Manage events</h3><p class="panel-subtitle">Create and update the events people can discover.</p><div class="table-wrap" id="adminEventsTable">Loading events…</div></div><div class="panel"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><div><h3>Recent bookings</h3><p class="panel-subtitle" style="margin-bottom:0">Review registrations and manage attendance.</p></div><button class="secondary" id="exportCsv">Export CSV ↓</button></div><div class="table-wrap" id="adminBookingsTable" style="margin-top:15px">Loading registrations…</div></div>`;
  Promise.all([api("/api/admin/summary"), api("/api/events"), api("/api/admin/bookings")]).then(([summary, events, bookings]) => {
    state.adminEvents = events.events; state.adminBookings = bookings.bookings;
    $("#adminStats").innerHTML = `<div class="admin-stat"><span>Total events</span><strong>${summary.events}</strong><i>Published events</i></div><div class="admin-stat"><span>Registered users</span><strong>${summary.users}</strong><i>Member accounts</i></div><div class="admin-stat"><span>Total bookings</span><strong>${summary.bookings}</strong><i>All registrations</i></div><div class="admin-stat"><span>Feedback entries</span><strong>${summary.feedback}</strong><i>Event responses</i></div>`;
    $("#adminEventsTable").innerHTML = `<table class="data-table"><thead><tr><th>EVENT</th><th>DATE</th><th>REGISTRATIONS</th><th>CAPACITY</th><th>ACTIONS</th></tr></thead><tbody>${state.adminEvents.map(e => `<tr><td><strong>${esc(e.title)}</strong><br><span style="color:#91a0b0">${esc(e.category)}</span></td><td>${esc(dateFmt(e.date))}</td><td>${e.registered}</td><td>${e.unlimited ? "Unlimited" : e.capacity || "Open"}</td><td><div class="table-actions"><button data-edit-event="${esc(e.id)}">Edit</button><button data-delete-event="${esc(e.id)}">Delete</button></div></td></tr>`).join("") || `<tr><td colspan="5">No events yet.</td></tr>`}</tbody></table>`;
    $("#adminBookingsTable").innerHTML = `<table class="data-table"><thead><tr><th>BOOKING ID</th><th>PERSON</th><th>EVENT</th><th>PAYMENT</th><th>ATTENDANCE</th></tr></thead><tbody>${state.adminBookings.slice().reverse().map(b => `<tr><td><strong>${esc(b.bookingId)}</strong></td><td>${esc(b.user?.name || b.holderName)}<br><span style="color:#91a0b0">${esc(b.user?.email || b.holderEmail)}</span></td><td>${esc(b.event?.title || "Event removed")}</td><td><span class="status-pill ${b.paymentStatus === "Payment due" ? "due" : ""}">${esc(b.paymentStatus)}</span></td><td><button class="mini-btn" data-attendance="${esc(b.id)}" data-status="${b.attendance === "present" ? "absent" : "present"}">${b.attendance === "present" ? "✓ Present" : "Mark present"}</button></td></tr>`).join("") || `<tr><td colspan="5">No bookings yet.</td></tr>`}</tbody></table>`;
    $("#exportCsv").addEventListener("click", exportCsv);
  }).catch(err => toast(err.message, true));
}
function openEventForm(event = null) {
  const e = event || { title: "", category: "Technology", description: "", date: "", venue: "", coordinator: "", fee: 0, capacity: 50, unlimited: false, lastDate: "", audience: false, image: "🎟️" };
  openModal(`<div class="eyebrow muted">EVENT MANAGEMENT</div><h2>${event ? "Edit event" : "Add an event"}</h2><p class="modal-intro">Give people the details they need to show up.</p>
  <form id="eventForm"><div class="form-grid">
    <div class="field full"><label>Event name</label><input name="title" required value="${esc(e.title)}" placeholder="e.g. Creative Coding Night"></div>
    <div class="field"><label>Category</label><select name="category">${["Technology","Sports","Cultural","Workshop","Other"].map(c => `<option ${e.category === c ? "selected" : ""}>${c}</option>`).join("")}</select></div>
    <div class="field"><label>Event icon / emoji</label><input name="image" value="${esc(e.image)}" maxlength="8"></div>
    <div class="field full"><label>Description</label><textarea name="description" required>${esc(e.description)}</textarea></div>
    <div class="field"><label>Event date and time</label><input type="datetime-local" name="date" required value="${dateInputValue(e.date)}"></div>
    <div class="field"><label>Last registration date</label><input type="datetime-local" name="lastDate" required value="${dateInputValue(e.lastDate)}"></div>
    <div class="field"><label>Venue</label><input name="venue" required value="${esc(e.venue)}"></div>
    <div class="field"><label>Coordinator</label><input name="coordinator" value="${esc(e.coordinator)}"></div>
    <div class="field"><label>Fee (₹)</label><input name="fee" type="number" min="0" value="${Number(e.fee)}" required></div>
    <div class="field"><label>Seat capacity (0 = open)</label><input name="capacity" type="number" min="0" value="${Number(e.capacity)}" required></div>
    <div class="field full"><label><input type="checkbox" name="unlimited" ${e.unlimited ? "checked" : ""} style="width:auto"> Unlimited participant registrations</label><label><input type="checkbox" name="audience" ${e.audience ? "checked" : ""} style="width:auto"> Audience ticket event</label></div>
  </div><div class="form-actions"><button type="button" class="secondary" id="cancelEvent">Cancel</button><button class="primary" type="submit">${event ? "Save changes" : "Create event"} ↗</button></div></form>`, true);
  $("#cancelEvent").addEventListener("click", closeModal);
  $("#eventForm").addEventListener("submit", async ev => {
    ev.preventDefault(); const form = new FormData(ev.currentTarget);
    const body = Object.fromEntries(form.entries());
    body.fee = Number(body.fee); body.capacity = Number(body.capacity); body.unlimited = form.has("unlimited"); body.audience = form.has("audience");
    body.date = new Date(body.date).toISOString(); body.lastDate = new Date(body.lastDate).toISOString();
    try {
      await api(event ? `/api/admin/events/${event.id}` : "/api/admin/events", { method: event ? "PATCH" : "POST", body });
      closeModal(); toast(event ? "Event updated." : "Event created."); await loadEvents(); renderAdmin();
    } catch (err) { toast(err.message, true); }
  });
}
async function exportCsv() {
  try { const blob = await api("/api/admin/export.csv"); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "eventease-registrations.csv"; a.click(); URL.revokeObjectURL(url); }
  catch (err) { toast(err.message, true); }
}
function chatReply(text) {
  const q = text.toLowerCase();
  if (/(ticket|booking id|booking|registration)/.test(q)) return state.user ? `You have ${state.bookings.length} booking(s). Open My Registrations to view a ticket and its unique booking ID.` : "Log in first, then open My Registrations to see your tickets and booking IDs.";
  if (/(deadline|last date|register by|registration date)/.test(q)) return "Each event card shows its last registration date in the pale-blue box. Registration closes after that time.";
  if (/(venue|where|location|place)/.test(q)) return "Open an event card to see its venue, or check the ticket after booking for the venue details.";
  if (/(fee|price|cost|pay|payment)/.test(q)) return "Each event card shows its fee. Free events are marked Free. This demo does not process real payments.";
  if (/(full|seat|capacity|waitlist)/.test(q)) return "Limited-capacity events show the remaining seats. This starter blocks bookings when an event is full; waitlist notifications are not connected yet.";
  if (/(hackathon|sports|dance|music|workshop|technology|cultural)/.test(q)) {
    const found = state.events.filter(e => (e.title + " " + e.category + " " + e.description).toLowerCase().includes(q.split(" ").find(word => ["hackathon","sports","dance","music","workshop","technology","cultural"].includes(word)) || q));
    return found.length ? `You might like: ${found.slice(0,3).map(e => `${e.title} (${dateFmt(e.date)})`).join("; ")}. Browse the event cards for details.` : "Try the category filters on Discover to find events that match your interests.";
  }
  return "I can help with event dates, venues, fees, registration deadlines, tickets, booking IDs, and seat availability. What would you like to know?";
}
function setupChatbot() {
  const launch = document.createElement("button"); launch.className = "chat-launch"; launch.id = "chatLaunch"; launch.setAttribute("aria-label", "Ask EventEase chatbot"); launch.textContent = "✳";
  const panel = document.createElement("section"); panel.className = "chat-panel hidden"; panel.id = "chatPanel"; panel.innerHTML = `<div class="chat-head">✳ EventEase assistant <span style="float:right;color:#6f94b7;font-size:10px">HERE TO HELP</span></div><div class="chat-messages" id="chatMessages"><div class="chat-message">Hi! Ask me about events, venues, deadlines, fees, or tickets.</div></div><form class="chat-input" id="chatForm"><input id="chatText" placeholder="Ask a question..." aria-label="Chat message" required><button>Send</button></form>`;
  document.body.append(launch, panel);
  launch.addEventListener("click", () => panel.classList.toggle("hidden"));
  $("#chatForm").addEventListener("submit", e => { e.preventDefault(); const input = $("#chatText"); const value = input.value.trim(); if (!value) return; const messages = $("#chatMessages"); const user = document.createElement("div"); user.className = "chat-message user"; user.textContent = value; messages.append(user); const answer = document.createElement("div"); answer.className = "chat-message"; answer.textContent = chatReply(value); messages.append(answer); input.value = ""; messages.scrollTop = messages.scrollHeight; });
}
function bindEvents() {
  document.addEventListener("click", async event => {
    const viewButton = event.target.closest("[data-view]");
    if (viewButton) { event.preventDefault(); showView(viewButton.dataset.view); }
    const bookButton = event.target.closest("[data-book]");
    if (bookButton) await createBooking(bookButton.dataset.book);
    const favButton = event.target.closest("[data-favourite]");
    if (favButton) {
      if (!state.user) { openAuth("login", "Log in to save favourite events."); return; }
      try { await api(`/api/favourites/${favButton.dataset.favourite}`, { method: "POST" }); const fav = await api("/api/favourites"); state.favourites = fav.events; await loadEvents(); if (state.view === "favourites") renderFavourites(); toast("Favourites updated."); } catch (err) { toast(err.message, true); }
    }
    const ticketButton = event.target.closest("[data-ticket]");
    if (ticketButton) { const booking = state.bookings.find(b => b.id === ticketButton.dataset.ticket); if (booking) openTicket(booking); }
    const editButton = event.target.closest("[data-edit-event]");
    if (editButton) openEventForm(state.adminEvents.find(e => e.id === editButton.dataset.editEvent));
    const deleteButton = event.target.closest("[data-delete-event]");
    if (deleteButton) {
      const e = state.adminEvents.find(x => x.id === deleteButton.dataset.deleteEvent);
      if (e && confirm(`Delete "${e.title}"? Existing booking records will remain in booking history.`)) {
        try { await api(`/api/admin/events/${e.id}`, { method: "DELETE" }); toast("Event deleted."); await loadEvents(); renderAdmin(); } catch (err) { toast(err.message, true); }
      }
    }
    const attendanceButton = event.target.closest("[data-attendance]");
    if (attendanceButton) {
      try { await api(`/api/admin/bookings/${attendanceButton.dataset.attendance}/attendance`, { method: "PATCH", body: { attendance: attendanceButton.dataset.status } }); toast("Attendance updated."); renderAdmin(); } catch (err) { toast(err.message, true); }
    }
  });
  $("#topLogin").addEventListener("click", () => openAuth("login"));
  $("#topSignup").addEventListener("click", () => openAuth("register"));
  $("#quickTheme").addEventListener("click", () => setTheme(document.body.classList.contains("dark") ? "light" : "dark", Boolean(state.user)));
  $("#mobileMenu").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
  $("#exploreButton").addEventListener("click", () => $("#eventSearch").focus());
  $("#eventSearch").addEventListener("input", event => { state.search = event.target.value; loadEvents().catch(err => toast(err.message, true)); });
  $("#categoryRow").addEventListener("click", event => {
    const button = event.target.closest("[data-category]"); if (!button) return;
    state.category = button.dataset.category; $$(".category-chip").forEach(x => x.classList.toggle("selected", x === button)); loadEvents().catch(err => toast(err.message, true));
  });
  $("#modalClose").addEventListener("click", closeModal);
  $("#modalBackdrop").addEventListener("click", event => { if (event.target === $("#modalBackdrop")) closeModal(); });
  document.addEventListener("keydown", event => { if (event.key === "Escape") closeModal(); });
  $("#addEventButton").addEventListener("click", () => openEventForm());
}
async function init() {
  $("#year").textContent = new Date().getFullYear();
  bindEvents(); setupChatbot();
  try { await refreshUserData(); await loadEvents(); }
  catch (err) { toast("Could not connect to the server. Start it with npm start.", true); $("#eventGrid").innerHTML = `<div class="empty-state" style="grid-column:1/-1"><h3>Server not connected</h3><p>Open a terminal in the project folder and run <strong>npm install</strong>, then <strong>npm start</strong>.</p></div>`; }
}
init();
