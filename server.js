const express = require("express");
const session = require("express-session");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "store.json");
const PUBLIC_DIR = path.join(__dirname, "public");

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  name: "eventease.sid",
  secret: process.env.SESSION_SECRET || "eventease-local-demo-change-this-secret",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: false, maxAge: 1000 * 60 * 60 * 8 }
}));

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [salt, expected] = stored.split(":");
  const actual = crypto.scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, "hex");
  return actual.length === expectedBuffer.length && crypto.timingSafeEqual(actual, expectedBuffer);
}
function bookingId() {
  return "EE-" + crypto.randomBytes(5).toString("hex").toUpperCase();
}
function cleanUser(user) {
  return { id: user.id, name: user.name, email: user.email, phone: user.phone || "", interests: user.interests || [], role: user.role || "user", theme: user.theme || "light" };
}
function seedData() {
  const now = new Date();
  const future = (days, hour = 10) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  };
  return {
    users: [],
    events: [
      { id: "evt-hack", title: "CodeSprint Hackathon", category: "Technology", description: "Build a useful idea with a team, learn from mentors, and present your prototype.", date: future(12, 9), venue: "Innovation Lab, Main Block", coordinator: "Student Tech Club", fee: 150, capacity: 80, unlimited: false, lastDate: future(8, 23), audience: false, image: "💻" },
      { id: "evt-sports", title: "Inter-Department Sports Meet", category: "Sports", description: "Bring your team spirit for a day of friendly competition and campus energy.", date: future(18, 8), venue: "College Sports Ground", coordinator: "Sports Committee", fee: 0, capacity: 0, unlimited: true, lastDate: future(15, 23), audience: false, image: "🏆" },
      { id: "evt-dance", title: "Rhythm Night", category: "Cultural", description: "An evening of dance, music, and performances by talented campus artists.", date: future(20, 18), venue: "Open-Air Auditorium", coordinator: "Cultural Committee", fee: 100, capacity: 120, unlimited: false, lastDate: future(19, 12), audience: true, image: "🎶" },
      { id: "evt-workshop", title: "Design Thinking Workshop", category: "Workshop", description: "Explore problem solving, creative thinking, and rapid prototyping in a practical session.", date: future(25, 11), venue: "Seminar Hall 2", coordinator: "Innovation Cell", fee: 50, capacity: 40, unlimited: false, lastDate: future(22, 23), audience: false, image: "✨" },
      { id: "evt-music", title: "Campus Open Mic", category: "Cultural", description: "A relaxed, open-entry showcase for music, poetry, comedy, and creative expression.", date: future(28, 17), venue: "Student Courtyard", coordinator: "Arts Society", fee: 0, capacity: 0, unlimited: true, lastDate: future(27, 23), audience: true, image: "🎤" },
      { id: "evt-coding", title: "Debugging Duel", category: "Technology", description: "Test your logic and speed in a friendly programming challenge for all skill levels.", date: future(32, 10), venue: "Computer Lab 3", coordinator: "Coding Club", fee: 0, capacity: 60, unlimited: false, lastDate: future(29, 23), audience: false, image: "🧩" }
    ],
    bookings: [],
    feedback: []
  };
}
function loadStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    const data = seedData();
    const email = (process.env.ADMIN_EMAIL || "admin@eventease.com").toLowerCase();
    const password = process.env.ADMIN_PASSWORD || "Admin123!";
    data.users.push({ id: crypto.randomUUID(), name: "EventEase Admin", email, phone: "", passwordHash: hashPassword(password), role: "admin", interests: [], theme: "light" });
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    return data;
  }
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    data.users ||= []; data.events ||= []; data.bookings ||= []; data.feedback ||= [];
    return data;
  } catch (err) {
    console.error("Could not read data/store.json:", err.message);
    process.exit(1);
  }
}
let store = loadStore();
function saveStore() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
}
function requireAuth(req, res, next) {
  const user = store.users.find(u => u.id === req.session.userId);
  if (!user) return res.status(401).json({ error: "Please log in to continue." });
  req.user = user;
  next();
}
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") return res.status(403).json({ error: "Admin access required." });
  next();
}
function publicEvent(event) {
  const count = store.bookings.filter(b => b.eventId === event.id && b.status !== "cancelled").length;
  const { id, title, category, description, date, venue, coordinator, fee, capacity, unlimited, lastDate, audience, image } = event;
  return { id, title, category, description, date, venue, coordinator, fee, capacity, unlimited, lastDate, audience, image, registered: count, available: unlimited || !capacity ? null : Math.max(0, capacity - count), full: !unlimited && capacity > 0 && count >= capacity };
}
function validDate(value) { return value && !Number.isNaN(new Date(value).getTime()); }
function parseEvent(body, existing = {}) {
  const title = String(body.title ?? existing.title ?? "").trim();
  if (!title) throw new Error("Event name is required.");
  const date = body.date ?? existing.date;
  const lastDate = body.lastDate ?? existing.lastDate;
  if (!validDate(date) || !validDate(lastDate)) throw new Error("Please provide valid event and registration dates.");
  if (new Date(lastDate) > new Date(date)) throw new Error("The registration deadline must be before the event starts.");
  const fee = Number(body.fee ?? existing.fee ?? 0);
  const capacity = Number(body.capacity ?? existing.capacity ?? 0);
  if (!Number.isFinite(fee) || fee < 0 || !Number.isFinite(capacity) || capacity < 0) throw new Error("Fee and capacity must be zero or greater.");
  return {
    ...existing,
    title, category: String(body.category ?? existing.category ?? "Other").trim(),
    description: String(body.description ?? existing.description ?? "").trim(),
    date: new Date(date).toISOString(), lastDate: new Date(lastDate).toISOString(),
    venue: String(body.venue ?? existing.venue ?? "").trim(),
    coordinator: String(body.coordinator ?? existing.coordinator ?? "").trim(),
    fee, capacity, unlimited: Boolean(body.unlimited ?? existing.unlimited ?? false),
    audience: Boolean(body.audience ?? existing.audience ?? false),
    image: String(body.image ?? existing.image ?? "🎟️").trim() || "🎟️"
  };
}

app.get("/api/health", (req, res) => res.json({ ok: true, app: "EventEase" }));
app.post("/api/auth/register", (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const phone = String(req.body.phone || "").trim();
  const password = String(req.body.password || "");
  if (!name || !email || !password) return res.status(400).json({ error: "Name, email, and password are required." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Enter a valid email address." });
  if (password.length < 8) return res.status(400).json({ error: "Password must be at least 8 characters." });
  if (store.users.some(u => u.email === email)) return res.status(409).json({ error: "An account with this email already exists." });
  const user = { id: crypto.randomUUID(), name, email, phone, passwordHash: hashPassword(password), role: "user", interests: [], theme: "light" };
  store.users.push(user); saveStore(); req.session.userId = user.id;
  res.status(201).json({ user: cleanUser(user) });
});
app.post("/api/auth/login", (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const password = String(req.body.password || "");
  const user = store.users.find(u => u.email === email);
  if (!user || !verifyPassword(password, user.passwordHash)) return res.status(401).json({ error: "Incorrect email or password." });
  req.session.userId = user.id;
  res.json({ user: cleanUser(user) });
});
app.post("/api/auth/logout", (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get("/api/me", (req, res) => {
  const user = store.users.find(u => u.id === req.session.userId);
  res.json({ user: user ? cleanUser(user) : null });
});
app.patch("/api/profile", requireAuth, (req, res) => {
  const name = String(req.body.name ?? req.user.name).trim();
  const phone = String(req.body.phone ?? req.user.phone).trim();
  const interests = Array.isArray(req.body.interests) ? req.body.interests.map(x => String(x).trim()).filter(Boolean).slice(0, 20) : req.user.interests;
  const theme = ["light", "dark"].includes(req.body.theme) ? req.body.theme : req.user.theme;
  if (!name) return res.status(400).json({ error: "Name cannot be empty." });
  req.user.name = name; req.user.phone = phone; req.user.interests = interests; req.user.theme = theme;
  saveStore(); res.json({ user: cleanUser(req.user) });
});
app.get("/api/events", (req, res) => {
  const category = String(req.query.category || "").toLowerCase();
  const search = String(req.query.search || "").toLowerCase();
  let events = store.events.map(publicEvent);
  if (category && category !== "all") events = events.filter(e => e.category.toLowerCase() === category);
  if (search) events = events.filter(e => [e.title, e.description, e.category, e.venue].some(v => String(v).toLowerCase().includes(search)));
  events.sort((a, b) => new Date(a.date) - new Date(b.date));
  res.json({ events });
});
app.get("/api/bookings", requireAuth, (req, res) => {
  const bookings = store.bookings.filter(b => b.userId === req.user.id).map(b => ({ ...b, event: store.events.find(e => e.id === b.eventId) ? publicEvent(store.events.find(e => e.id === b.eventId)) : null }));
  res.json({ bookings: bookings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) });
});
app.post("/api/bookings", requireAuth, (req, res) => {
  const event = store.events.find(e => e.id === String(req.body.eventId || ""));
  if (!event) return res.status(404).json({ error: "Event not found." });
  const now = new Date();
  if (now > new Date(event.lastDate)) return res.status(400).json({ error: "Registration for this event has closed." });
  const count = store.bookings.filter(b => b.eventId === event.id && b.status !== "cancelled").length;
  if (!event.unlimited && event.capacity > 0 && count >= event.capacity) return res.status(409).json({ error: "This event is full. Please try another event or check the waitlist." });
  const duplicate = store.bookings.find(b => b.eventId === event.id && b.userId === req.user.id && b.status !== "cancelled");
  if (duplicate) return res.status(409).json({ error: "You already have a booking for this event." });
  const overlap = store.bookings.find(b => b.userId === req.user.id && b.status !== "cancelled" && store.events.some(e => e.id === b.eventId && new Date(event.date) < new Date(e.date) && new Date(event.date).getTime() + 2 * 60 * 60 * 1000 > new Date(e.date).getTime()));
  const booking = {
    id: crypto.randomUUID(), bookingId: bookingId(), userId: req.user.id, eventId: event.id,
    holderName: req.user.name, holderEmail: req.user.email, holderPhone: req.user.phone || "",
    type: event.audience ? "Audience ticket" : "Participant registration",
    fee: Number(event.fee || 0), paymentStatus: Number(event.fee || 0) === 0 ? "Free" : "Payment due",
    status: "confirmed", attendance: "not marked", createdAt: now.toISOString(),
    conflictWarning: Boolean(overlap)
  };
  store.bookings.push(booking); saveStore();
  res.status(201).json({ booking: { ...booking, event: publicEvent(event) } });
});
app.post("/api/favourites/:eventId", requireAuth, (req, res) => {
  req.user.favourites ||= [];
  const id = String(req.params.eventId);
  if (!store.events.some(e => e.id === id)) return res.status(404).json({ error: "Event not found." });
  if (req.user.favourites.includes(id)) req.user.favourites = req.user.favourites.filter(x => x !== id);
  else req.user.favourites.push(id);
  saveStore(); res.json({ favourites: req.user.favourites });
});
app.get("/api/favourites", requireAuth, (req, res) => res.json({ events: store.events.filter(e => (req.user.favourites || []).includes(e.id)).map(publicEvent) }));
app.post("/api/feedback", requireAuth, (req, res) => {
  const eventId = String(req.body.eventId || "");
  const rating = Number(req.body.rating);
  const comment = String(req.body.comment || "").trim().slice(0, 1000);
  const hasBooking = store.bookings.some(b => b.userId === req.user.id && b.eventId === eventId && b.status === "confirmed");
  if (!hasBooking) return res.status(403).json({ error: "Only registered attendees can submit feedback." });
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ error: "Choose a rating from 1 to 5." });
  store.feedback.push({ id: crypto.randomUUID(), userId: req.user.id, eventId, rating, comment, createdAt: new Date().toISOString() });
  saveStore(); res.status(201).json({ ok: true });
});

app.get("/api/admin/summary", requireAuth, requireAdmin, (req, res) => {
  res.json({
    events: store.events.length, users: store.users.filter(u => u.role === "user").length,
    bookings: store.bookings.length, feedback: store.feedback.length
  });
});
app.post("/api/admin/events", requireAuth, requireAdmin, (req, res) => {
  try {
    const event = parseEvent(req.body);
    event.id = "evt-" + crypto.randomBytes(5).toString("hex");
    store.events.push(event); saveStore(); res.status(201).json({ event: publicEvent(event) });
  } catch (err) { res.status(400).json({ error: err.message }); }
});
app.patch("/api/admin/events/:id", requireAuth, requireAdmin, (req, res) => {
  const index = store.events.findIndex(e => e.id === req.params.id);
  if (index < 0) return res.status(404).json({ error: "Event not found." });
  try {
    store.events[index] = parseEvent(req.body, store.events[index]); saveStore();
    res.json({ event: publicEvent(store.events[index]) });
  } catch (err) { res.status(400).json({ error: err.message }); }
});
app.delete("/api/admin/events/:id", requireAuth, requireAdmin, (req, res) => {
  const eventId = req.params.id;
  if (!store.events.some(e => e.id === eventId)) return res.status(404).json({ error: "Event not found." });
  store.events = store.events.filter(e => e.id !== eventId);
  saveStore(); res.json({ ok: true });
});
app.get("/api/admin/bookings", requireAuth, requireAdmin, (req, res) => {
  res.json({ bookings: store.bookings.map(b => ({ ...b, user: cleanUser(store.users.find(u => u.id === b.userId) || { id: "", name: "Deleted user", email: "" }), event: store.events.find(e => e.id === b.eventId) || null })) });
});
app.patch("/api/admin/bookings/:id/attendance", requireAuth, requireAdmin, (req, res) => {
  const booking = store.bookings.find(b => b.id === req.params.id);
  if (!booking) return res.status(404).json({ error: "Booking not found." });
  booking.attendance = req.body.attendance === "present" ? "present" : "absent";
  saveStore(); res.json({ booking });
});
app.get("/api/admin/export.csv", requireAuth, requireAdmin, (req, res) => {
  const esc = value => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const rows = [["Booking ID","Name","Email","Phone","Event","Event Date","Venue","Type","Fee","Payment Status","Attendance","Booked At"]];
  for (const b of store.bookings) {
    const u = store.users.find(x => x.id === b.userId) || {};
    const e = store.events.find(x => x.id === b.eventId) || {};
    rows.push([b.bookingId,u.name,u.email,u.phone,e.title,e.date,e.venue,b.type,b.fee,b.paymentStatus,b.attendance,b.createdAt]);
  }
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="eventease-registrations.csv"');
  res.send(rows.map(row => row.map(esc).join(",")).join("\r\n"));
});

app.use(express.static(PUBLIC_DIR));
app.get("*", (req, res) => res.sendFile(path.join(PUBLIC_DIR, "index.html")));
app.listen(PORT, () => {
  console.log(`\nEventEase is running at http://localhost:${PORT}`);
  console.log(`Demo admin: ${process.env.ADMIN_EMAIL || "admin@eventease.com"} / ${process.env.ADMIN_PASSWORD || "Admin123!"}\n`);
});
