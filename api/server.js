#!/usr/bin/env node
"use strict";

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const cookieParser = require("cookie-parser");
const { doubleCsrf } = require("csrf-csrf");
const { z } = require("zod");
const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_DIR = path.join(__dirname, "data");
const TARIFF_ORDER = ["mai2024", "april2025", "april2026"]; // custom sort order
const USERS_FILE = path.join(DATA_DIR, "users.json");
const INVITES_FILE = path.join(DATA_DIR, "invites.json");
const AUDIT_LOG_FILE = path.join(DATA_DIR, "audit.log");
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS) || 1000 * 60 * 60; // default 1h
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "https://entgeltrechner.cbmeyer.xyz").split(",");
const DEFAULT_ADMIN_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD || "Admin123!Test";

let users = Object.create(null); // { username: { salt, hash, isAdmin, mustChangePassword } }
let sessions = Object.create(null); // { token: { username, expires } }
let invites = Object.create(null); // { code: { used: bool, user: string|null } }

function ensureDataDir(){
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch {}
}

function createAdminRecord(password = DEFAULT_ADMIN_PASSWORD){
  const salt = crypto.randomBytes(16).toString("hex");
  return {
    salt,
    hash: hashPassword(password, salt),
    isAdmin: true,
    mustChangePassword: true
  };
}

function ensureDefaultAdmin({ allowPersist = true } = {}){
  const adminPassword = DEFAULT_ADMIN_PASSWORD;
  let admin = users.admin;
  let shouldSave = false;

  const rebuild = () => {
    admin = createAdminRecord(adminPassword);
    shouldSave = true;
  };

  if (!admin || typeof admin !== "object") {
    rebuild();
  } else {
    let updated = { ...admin };

    if (updated.isAdmin !== true) {
      updated.isAdmin = true;
      shouldSave = true;
    }

    const hasSalt = typeof updated.salt === "string" && updated.salt.length > 0;
    const hasHash = typeof updated.hash === "string" && updated.hash.length > 0;

    if (!hasSalt || !hasHash) {
      rebuild();
    } else if (updated.mustChangePassword !== false) {
      try {
        if (!verifyPassword(updated, adminPassword)) {
          rebuild();
        } else {
          admin = updated;
        }
      } catch {
        rebuild();
      }
    } else {
      admin = updated;
    }
  }

  users.admin = admin;
  if (shouldSave && allowPersist) saveUsers();
}

function loadUsers(){
  ensureDataDir();
  let allowPersist = true;
  try {
    const buf = fs.readFileSync(USERS_FILE, "utf8");
    users = JSON.parse(buf);
  } catch (err) {
    if (err && err.code === "ENOENT") {
      allowPersist = false;
    }
    users = { admin: createAdminRecord() };
  }
  ensureDefaultAdmin({ allowPersist });
}

function saveUsers(){
  ensureDataDir();
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), { mode: 0o600 });
}

function loadInvites(){
  try {
    const buf = fs.readFileSync(INVITES_FILE, "utf8");
    invites = JSON.parse(buf);
  } catch {
    invites = {};
    saveInvites();
  }
}

function saveInvites(){
  fs.writeFileSync(INVITES_FILE, JSON.stringify(invites, null, 2), { mode: 0o600 });
}

function auditLog(event, details = {}) {
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    event,
    ...details
  }) + "\n";
  try {
    fs.appendFileSync(AUDIT_LOG_FILE, entry, { mode: 0o600 });
  } catch (err) {
    console.error("[audit] Failed to write log:", err.message);
  }
}

function hashPassword(pw, salt){
  return crypto.scryptSync(pw, salt, 64).toString("hex");
}

function verifyPassword(user, pw){
  const h = hashPassword(pw, user.salt);
  return crypto.timingSafeEqual(Buffer.from(h, "hex"), Buffer.from(user.hash, "hex"));
}

function createToken(){
  return crypto.randomBytes(30).toString("hex");
}

function isStrongPassword(p){
  if (typeof p !== "string" || p.length < 12) return false;

  // Mindestens: 1 Großbuchstabe, 1 Kleinbuchstabe, 1 Zahl, 1 Sonderzeichen
  const hasUpperCase = /[A-Z]/.test(p);
  const hasLowerCase = /[a-z]/.test(p);
  const hasNumber = /[0-9]/.test(p);
  const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(p);

  return hasUpperCase && hasLowerCase && hasNumber && hasSpecial;
}

function createInviteCode(){
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code;
  do {
    code = Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  } while (invites[code]);
  const createdAt = Date.now();
  const expiresAt = createdAt + (7 * 24 * 60 * 60 * 1000); // 7 Tage
  invites[code] = { used: false, user: null, createdAt, expiresAt };
  saveInvites();
  auditLog("invite_created", { code });
  return code;
}

// Rate limiters
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 Minuten
  max: 5, // max 5 Versuche
  message: { error: "Too many login attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === "test"
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 Minuten
  max: 100, // max 100 Requests
  message: { error: "Too many requests. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === "test"
});

app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  crossOriginResourcePolicy: { policy: "same-site" },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true }
}));
app.use(cors({ origin: ALLOWED_ORIGINS, methods: ["GET","POST","PUT","DELETE"], credentials: true }));
app.use(express.json({ limit: "20kb" }));
app.use(cookieParser());
app.use(morgan("combined"));

// CSRF protection setup
const csrfSetup = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET || "default-csrf-secret-change-in-production",
  getSessionIdentifier: (req) => {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.length > 0) {
      return forwarded.split(",")[0].trim();
    }
    return req.ip || "anonymous";
  },
  cookieName: "__Host-csrf",
  cookieOptions: {
    sameSite: "strict",
    path: "/",
    secure: process.env.NODE_ENV !== "test",
    httpOnly: true
  },
  size: 64,
  ignoredMethods: ["GET", "HEAD", "OPTIONS"],
  getTokenFromRequest: (req) => req.headers["x-csrf-token"]
});

const generateCsrfToken = csrfSetup.generateCsrfToken;
// In test mode, disable CSRF protection
const doubleCsrfProtection = process.env.NODE_ENV === "test"
  ? (req, res, next) => next()
  : csrfSetup.doubleCsrfProtection;

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  const sess = sessions[token];
  if (!token || !sess || !users[sess.username] || sess.expires < Date.now()) {
    if (token && sess && sess.expires < Date.now()) delete sessions[token];
    return res.status(401).json({ error: "Unauthorized" });
  }
  req.username = sess.username;
  req.user = users[req.username];
  req.token = token;
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user?.isAdmin) return res.status(403).json({ error: "Forbidden" });
  next();
}

function ensureHttps(req, res, next) {
  if (process.env.NODE_ENV === "test") return next();
  const proto = req.headers["x-forwarded-proto"] || req.protocol;
  if (proto === "https") return next();
  res.status(400).json({ error: "HTTPS required" });
}

/** --- Tabellen laden --- */
let tablesByKey = Object.create(null);
let tablesMeta = Object.create(null); // { key: { mtimeMs, bytes } }

async function loadAllTables() {
    const map = Object.create(null);
    const meta = Object.create(null);

  await fsp.mkdir(DATA_DIR, { recursive: true });
  const files = (await fsp.readdir(DATA_DIR)).filter(f => f.endsWith(".json") && !["users.json","invites.json"].includes(f));

  for (const file of files) {
    const key = path.basename(file, ".json"); // z.B. "current"
    const full = path.join(DATA_DIR, file);
    try {
        const stat = await fsp.stat(full);
        const buf = await fsp.readFile(full, "utf8");
        const json = JSON.parse(buf);

        // einfache Strukturprüfung
        if (json === null || typeof json !== "object" || Array.isArray(json)) {
          throw new Error(`Ungültiges JSON-Format in ${file}`);
        }

        const table = json.table && typeof json.table === "object" ? json.table : json;
        const atMin = json.atMin && typeof json.atMin === "object" ? json.atMin : {};

        map[key] = { table, atMin };
        meta[key] = { mtimeMs: stat.mtimeMs, bytes: stat.size };
    } catch (e) {
      console.error(`[tables] Fehler beim Laden von ${file}:`, e.message);
    }
  }

  if (Object.keys(map).length === 0) {
    console.warn("[tables] WARN: keine Tabellen gefunden. Leeres Set aktiv.");
  }

  tablesByKey = map;
  tablesMeta = meta;
  if (process.env.NODE_ENV !== "test") {
    console.log(`[tables] geladen: ${Object.keys(tablesByKey).join(", ") || "(keine)"}`);
  }
}

// Initial laden & bei Änderungen auto-reloaden
loadAllTables().catch(console.error);
if (process.env.NODE_ENV !== "test") {
  try {
    fs.watch(DATA_DIR, { persistent: true }, (event, filename) => {
      if (!filename || !filename.endsWith(".json")) return;
      // Debounce: kurzen Timeout, falls Editor zweimal schreibt
      clearTimeout(fs.watch._t);
      fs.watch._t = setTimeout(() => loadAllTables().catch(console.error), 150);
    });
  } catch (e) {
    console.warn("[tables] fs.watch nicht verfügbar:", e.message);
  }
}

loadUsers();
loadInvites();

// Automatisches Session-Cleanup alle 10 Minuten
if (process.env.NODE_ENV !== "test") {
  setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    for (const token of Object.keys(sessions)) {
      if (sessions[token].expires < now) {
        delete sessions[token];
        cleaned++;
      }
    }
    if (cleaned > 0) {
      console.log(`[session-cleanup] Removed ${cleaned} expired sessions`);
    }
  }, 10 * 60 * 1000);
}

/** Hilfsfunktionen */
const euro = n => Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;

function getEntry(key) {
  if (tablesByKey[key]) return tablesByKey[key];
  if (tablesByKey["current"]) return tablesByKey["current"];
  return null;
}

function getTable(key) {
  return getEntry(key)?.table || null;
}

function calculate(input) {
  const {
    tariffDate, eg, stufe, irwazHours, leistungsPct,
    urlaubstage, betriebsMonate, tZugBPeriod, eigeneKinder
  } = input;

  const tbl = getTable(tariffDate);
  if (!tbl) throw new Error(`Keine Tabelle für '${tariffDate}' gefunden`);

  const egObj = tbl[eg] || tbl.EG01;
  if (!egObj) throw new Error(`Entgeltgruppe '${eg}' existiert nicht in '${tariffDate}'`);

  const hatSalary = Object.prototype.hasOwnProperty.call(egObj, "salary");
  const _stufe = hatSalary ? undefined : (stufe || Object.keys(egObj).sort()[0]);

  const grund35 = hatSalary ? egObj.salary : egObj[_stufe];
  if (!Number.isFinite(grund35)) throw new Error(`Grundwert fehlt für ${eg}${hatSalary ? "" : " / " + _stufe}`);

  const grund = grund35 * (irwazHours / 35);
  const isAzubi = /^AJ/.test(eg);
  const bonus = isAzubi ? 0 : grund * (leistungsPct / 100);
  const kinderZulage = isAzubi && eigeneKinder ? grund * 0.5 : 0;

  // p13 nach Betriebszugehörigkeit
  let p13 = 0;
  if (betriebsMonate >= 36) p13 = 55;
  else if (betriebsMonate >= 24) p13 = 45;
  else if (betriebsMonate >= 12) p13 = 35;
  else if (betriebsMonate >= 6)  p13 = 25;

  const mon13 = (grund + bonus) * (p13 / 100);
  const tGeld = (grund + bonus) * 0.184;
  const tZugA = (grund + bonus) * 0.275;

  // T-ZUG B Basis: EG05.B aus (tZugBPeriod === "from2026" ? "april2026" : tariffDate)
  const tzugKey = (tZugBPeriod === "from2026") ? "april2026" : tariffDate;
  const baseTbl = getTable(tzugKey);
  if (!baseTbl || !baseTbl.EG05 || !Number.isFinite(baseTbl.EG05?.B)) {
    throw new Error(`T-ZUG B Basis (EG05.B) fehlt in Tabelle '${tzugKey}'`);
  }
  const pTZUGB = (tZugBPeriod === "from2026") ? 26.5 : 18.5;
  const tZugB = isAzubi ? grund * (pTZUGB / 100) : baseTbl.EG05.B * (pTZUGB / 100);

  const utage = urlaubstage; // Anzahl der Urlaubstage
  const utag = utage ? (((grund + bonus) / 65.25) * 1.5) : 0; // Entgelt pro Tag
  const uges = utag * utage; // Urlaubsgeld gesamt

  const gesMonBasis = grund + bonus;
  const gesMon = gesMonBasis + kinderZulage;
  const gesJahr = gesMonBasis * 12 + kinderZulage * 12 + mon13 + tGeld + tZugA + tZugB + uges;

  const breakdown = {
    grund35: euro(grund35),
    irwazHours,
    grund: euro(grund),
    kinderzulage: euro(kinderZulage),
    p13,
    mon13: euro(mon13),
    tGeld: euro(tGeld),
    tZugA: euro(tZugA),
    tZugB: euro(tZugB),
    urlaub: {
      entgeltProTag: euro(utag),
      tage: utage,
      gesamt: euro(uges)
    }
  };

  if (!isAzubi) {
    breakdown.bonus = euro(bonus);
  }

  return {
    breakdown,
    totals: {
      monat: euro(gesMon),
      jahr: euro(gesJahr),
      durchschnittMonat: euro(gesJahr / 12)
    }
  };
}

/** Schemas */
const UsernameSchema = z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/, "Username must be alphanumeric with underscores only");
const PasswordSchema = z.string().min(12).max(128);

const CalcSchema = z.object({
  tariffDate: z.string(),                 // Schlüsselname = Dateiname ohne .json (z. B. "current")
  eg: z.string().regex(/^(EG\d{2}|AJ[1-4])$/),
  stufe: z.string().optional(),           // nur benötigt, wenn EG gestuft ist
  irwazHours: z.number().min(0).max(40),
  leistungsPct: z.number().min(0).max(28),
  urlaubstage: z.number().int().min(0).max(36),
  betriebsMonate: z.number().int().min(0).max(480),
  tZugBPeriod: z.enum(["until2025","from2026"]),
  eigeneKinder: z.boolean().optional().default(false)
});

app.post("/api/register", ensureHttps, loginLimiter, doubleCsrfProtection, (req, res) => {
  const { username, password, code } = req.body || {};

  // Validierung
  const usernameResult = UsernameSchema.safeParse(username);
  const passwordResult = PasswordSchema.safeParse(password);

  if (!usernameResult.success) {
    auditLog("register_failed", { reason: "invalid_username", username });
    return res.status(400).json({ error: "Invalid username format" });
  }
  if (!passwordResult.success) {
    auditLog("register_failed", { reason: "invalid_password_length", username });
    return res.status(400).json({ error: "Password must be 12-128 characters" });
  }
  if (!code) {
    auditLog("register_failed", { reason: "missing_code", username });
    return res.status(400).json({ error: "Missing invite code" });
  }

  if (users[username]) {
    auditLog("register_failed", { reason: "user_exists", username });
    return res.status(400).json({ error: "User exists" });
  }
  if (!isStrongPassword(password)) {
    auditLog("register_failed", { reason: "weak_password", username });
    return res.status(400).json({ error: "Password must contain uppercase, lowercase, number, and special character" });
  }

  const inv = invites[code];
  if (!inv || inv.used) {
    auditLog("register_failed", { reason: "invalid_code", username, code });
    return res.status(400).json({ error: "Invalid or used invite code" });
  }

  // Prüfe Ablaufzeit
  if (inv.expiresAt && Date.now() > inv.expiresAt) {
    auditLog("register_failed", { reason: "expired_code", username, code });
    return res.status(400).json({ error: "Invite code expired" });
  }

  const salt = crypto.randomBytes(16).toString("hex");
  const hash = hashPassword(password, salt);
  users[username] = { salt, hash, isAdmin: false, mustChangePassword: false };
  invites[code] = { ...inv, used: true, user: username, usedAt: Date.now() };
  saveUsers();
  saveInvites();

  auditLog("user_registered", { username, code, ip: req.ip });
  res.json({ ok: true });
});

app.post("/api/login", ensureHttps, loginLimiter, doubleCsrfProtection, (req, res) => {
  const { username, password } = req.body || {};

  // Timing-safe: immer Hash berechnen, auch wenn User nicht existiert
  const user = users[username];
  const dummySalt = "0000000000000000";
  const actualSalt = user ? user.salt : dummySalt;

  // Timing-safe comparison
  const providedHash = hashPassword(password || "", actualSalt);

  if (!user) {
    auditLog("login_failed", { username, reason: "user_not_found", ip: req.ip });
    return res.status(401).json({ error: "Invalid credentials" });
  }

  if (!verifyPassword(user, password)) {
    auditLog("login_failed", { username, reason: "wrong_password", ip: req.ip });
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = createToken();
  sessions[token] = { username, expires: Date.now() + SESSION_TTL_MS };

  auditLog("login_success", { username, ip: req.ip });
  res.json({ token, isAdmin: !!user.isAdmin, mustChangePassword: !!user.mustChangePassword, expires: SESSION_TTL_MS });
});

app.post("/api/change-password", ensureHttps, authMiddleware, doubleCsrfProtection, (req, res) => {
  const { oldPassword, newPassword } = req.body || {};

  if (!oldPassword || !newPassword) {
    return res.status(400).json({ error: "Missing fields" });
  }

  const passwordResult = PasswordSchema.safeParse(newPassword);
  if (!passwordResult.success) {
    return res.status(400).json({ error: "Password must be 12-128 characters" });
  }

  if (!isStrongPassword(newPassword)) {
    auditLog("password_change_failed", { username: req.username, reason: "weak_password", ip: req.ip });
    return res.status(400).json({ error: "Password must contain uppercase, lowercase, number, and special character" });
  }

  const user = req.user;
  if (!verifyPassword(user, oldPassword)) {
    auditLog("password_change_failed", { username: req.username, reason: "wrong_old_password", ip: req.ip });
    return res.status(400).json({ error: "Invalid old password" });
  }

  const salt = crypto.randomBytes(16).toString("hex");
  const hash = hashPassword(newPassword, salt);
  users[req.username] = { ...user, salt, hash, mustChangePassword: false };
  saveUsers();

  // Session-Rotation: Alle Sessions des Benutzers ungültig machen (außer aktueller)
  const currentToken = req.token;
  for (const token of Object.keys(sessions)) {
    if (sessions[token].username === req.username && token !== currentToken) {
      delete sessions[token];
    }
  }

  auditLog("password_changed", { username: req.username, ip: req.ip });
  res.json({ ok: true });
});

app.post("/api/logout", authMiddleware, doubleCsrfProtection, (req, res) => {
  delete sessions[req.token];
  auditLog("logout", { username: req.username, ip: req.ip });
  res.json({ ok: true });
});

app.get("/api/users", apiLimiter, authMiddleware, requireAdmin, (_req, res) => {
  const list = Object.entries(users).map(([username, u]) => ({
    username,
    isAdmin: !!u.isAdmin,
    mustChangePassword: !!u.mustChangePassword
  }));
  res.json({ users: list });
});

app.post("/api/users", ensureHttps, authMiddleware, requireAdmin, doubleCsrfProtection, (req, res) => {
  const { username, password } = req.body || {};

  const usernameResult = UsernameSchema.safeParse(username);
  const passwordResult = PasswordSchema.safeParse(password);

  if (!usernameResult.success) {
    return res.status(400).json({ error: "Invalid username format" });
  }
  if (!passwordResult.success) {
    return res.status(400).json({ error: "Password must be 12-128 characters" });
  }
  if (users[username]) {
    return res.status(400).json({ error: "User exists" });
  }
  if (!isStrongPassword(password)) {
    return res.status(400).json({ error: "Password must contain uppercase, lowercase, number, and special character" });
  }

  const salt = crypto.randomBytes(16).toString("hex");
  const hash = hashPassword(password, salt);
  users[username] = { salt, hash, isAdmin: false, mustChangePassword: false };
  saveUsers();

  auditLog("user_created", { username, createdBy: req.username, ip: req.ip });
  res.json({ ok: true });
});

app.put("/api/users/:username/password", ensureHttps, authMiddleware, requireAdmin, doubleCsrfProtection, (req, res) => {
  const name = req.params.username;
  const { password } = req.body || {};

  if (!users[name]) return res.status(404).json({ error: "User not found" });

  const passwordResult = PasswordSchema.safeParse(password);
  if (!passwordResult.success) {
    return res.status(400).json({ error: "Password must be 12-128 characters" });
  }
  if (!isStrongPassword(password)) {
    return res.status(400).json({ error: "Password must contain uppercase, lowercase, number, and special character" });
  }

  const salt = crypto.randomBytes(16).toString("hex");
  const hash = hashPassword(password, salt);
  users[name] = { ...users[name], salt, hash, mustChangePassword: false };

  // Alle Sessions des Benutzers löschen
  for (const t of Object.keys(sessions)) {
    if (sessions[t].username === name) delete sessions[t];
  }
  saveUsers();

  auditLog("password_reset", { username: name, resetBy: req.username, ip: req.ip });
  res.json({ ok: true });
});

app.delete("/api/users/:username", authMiddleware, requireAdmin, doubleCsrfProtection, (req, res) => {
  const name = req.params.username;
  if (name === "admin") return res.status(400).json({ error: "Cannot delete admin" });
  if (!users[name]) return res.status(404).json({ error: "User not found" });

  delete users[name];
  for (const t of Object.keys(sessions)) {
    if (sessions[t].username === name) delete sessions[t];
  }
  for (const code of Object.keys(invites)) {
    if (invites[code].user === name) invites[code] = { ...invites[code], user: null };
  }
  saveUsers();
  saveInvites();

  auditLog("user_deleted", { username: name, deletedBy: req.username, ip: req.ip });
  res.json({ ok: true });
});

app.get("/api/invites", authMiddleware, requireAdmin, (_req, res) => {
  res.json({ invites });
});

app.post("/api/invites", authMiddleware, requireAdmin, doubleCsrfProtection, (_req, res) => {
  const code = createInviteCode();
  res.json({ code });
});

/** Routen */
app.get("/api/csrf-token", (req, res) => {
  const token = generateCsrfToken(req, res);
  res.json({ token });
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString(), tables: Object.keys(tablesByKey) });
});

app.get("/api/tables", apiLimiter, authMiddleware, (_req, res) => {
  res.set("Cache-Control", "public, max-age=300");
  const keys = Object.keys(tablesByKey).sort((a, b) => {
    const ia = TARIFF_ORDER.indexOf(a);
    const ib = TARIFF_ORDER.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });
  res.json({
    keys,
    meta: tablesMeta
  });
});

app.get("/api/tables/:key", apiLimiter, authMiddleware, (req, res) => {
  const key = req.params.key;
  const entry = getEntry(key);
  if (!entry) return res.status(404).json({ error: `Tabelle '${key}' nicht gefunden` });
  res.set("Cache-Control", "public, max-age=86400, immutable");
  res.json({ key, table: entry.table, atMin: entry.atMin });
});

app.post("/api/calc", apiLimiter, authMiddleware, doubleCsrfProtection, (req, res) => {
  const parsed = CalcSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
  }

  const data = parsed.data;

  // stufe ggf. automatisch bestimmen
  const tbl = getTable(data.tariffDate);
  if (!tbl) return res.status(400).json({ error: `Tabelle '${data.tariffDate}' nicht verfügbar` });

  const egObj = tbl[data.eg];
  if (!egObj) return res.status(400).json({ error: `Entgeltgruppe '${data.eg}' existiert nicht in '${data.tariffDate}'` });

  const hatSalary = Object.prototype.hasOwnProperty.call(egObj, "salary");
  if (!hatSalary && !data.stufe) {
    data.stufe = Object.keys(egObj).sort()[0];
  }

  try {
    const result = calculate(data);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

if (require.main === module) {
  app.listen(PORT, "127.0.0.1", () => {
    console.log(`API listening on http://127.0.0.1:${PORT}`);
  });
}

module.exports = app;
