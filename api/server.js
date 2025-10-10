#!/usr/bin/env node
"use strict";

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const { z } = require("zod");
const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");
const session = require("express-session");
const FileStore = require("session-file-store")(session);
const csrf = require("csurf");
const cookieParser = require("cookie-parser");

const { UserStore } = require("./services/userStore");
const { InviteStore } = require("./services/inviteStore");
const { verifyPassword } = require("./services/password");

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_DIR = path.join(__dirname, "data");
const TARIFF_ORDER = ["mai2024", "april2025", "april2026"]; // custom sort order
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "https://entgeltrechner.cbmeyer.xyz").split(",");
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "entgelt.sid";
const SESSION_TTL_MS = (() => {
  const val = Number(process.env.SESSION_TTL_MS);
  if (Number.isInteger(val) && val >= 300000 && val <= 86400000) {
    return val;
  }
  return 30 * 60 * 1000; // 30 Minuten
})();
const SESSION_SECRET = process.env.SESSION_SECRET || (process.env.NODE_ENV === "test" ? "test-secret" : null);
if (!SESSION_SECRET && process.env.NODE_ENV !== "test") {
  console.warn("[security] SESSION_SECRET fehlt – bitte in Produktion setzen!");
}
const SESSION_SECRET_INTERNAL = SESSION_SECRET || "development-session-secret-change-me";
const SESSION_SECURE_COOKIE = process.env.SESSION_COOKIE_SECURE
  ? process.env.SESSION_COOKIE_SECURE !== "false"
  : IS_PRODUCTION;

const userStore = new UserStore(path.join(DATA_DIR, "users.json"));
const inviteStore = new InviteStore(path.join(DATA_DIR, "invites.json"));
let securityReadyResolved = false;
const securityReady = Promise.all([userStore.init(), inviteStore.init()])
  .then(() => { securityReadyResolved = true; })
  .catch(err => {
    console.error("[security] Initialisierung fehlgeschlagen:", err);
    process.exit(1);
  });

// Rate limiters
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 Minuten
  max: 100, // max 100 Requests
  message: { error: "Too many requests. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === "test"
});
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Zu viele Anmeldeversuche. Bitte später erneut versuchen." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === "test"
});
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { error: "Zu viele Registrierungsversuche. Bitte später erneut versuchen." },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === "test"
});

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use((req, res, next) => {
  if (securityReadyResolved) {
    return next();
  }
  securityReady.then(() => next()).catch(next);
});

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
app.use(morgan("combined"));
app.use(express.json({ limit: "20kb" }));
app.use(cookieParser());

try {
  fs.mkdirSync(path.join(DATA_DIR, "sessions"), { recursive: true });
} catch (err) {
  console.error("[session] konnte Session-Verzeichnis nicht erstellen:", err);
  process.exit(1);
}

const sessionStore = new FileStore({
  path: path.join(DATA_DIR, "sessions"),
  fileExtension: ".session",
  retries: 1,
  ttl: Math.ceil(SESSION_TTL_MS / 1000),
  logFn: function noop() {}
});

app.use(session({
  name: SESSION_COOKIE_NAME,
  secret: SESSION_SECRET_INTERNAL,
  resave: false,
  saveUninitialized: false,
  unset: "destroy",
  proxy: true,
  rolling: true,
  store: sessionStore,
  cookie: {
    httpOnly: true,
    sameSite: "strict",
    secure: SESSION_SECURE_COOKIE,
    maxAge: SESSION_TTL_MS
  }
}));

const csrfProtection = csrf({
  cookie: false,
  ignoreMethods: ["GET", "HEAD", "OPTIONS"],
  value: (req) => {
    const headerToken = req.get("x-csrf-token") || req.get("csrf-token") || req.get("x-xsrf-token");
    if (headerToken) return headerToken;
    if (req.body && typeof req.body === "object" && req.body._csrf) {
      return req.body._csrf;
    }
    if (req.query && typeof req.query._csrf === "string") {
      return req.query._csrf;
    }
    return null;
  }
});
app.use(csrfProtection);

app.use((req, _res, next) => {
  if (req.session && req.session.user) {
    // Refresh session user reference to mitigate stale clones
    req.session.user = {
      id: req.session.user.id,
      username: req.session.user.username,
      role: req.session.user.role,
      mustChangePassword: Boolean(req.session.user.mustChangePassword)
    };
  }
  next();
});
app.use((req, res, next) => {
  req.user = req.session?.user || null;
  res.locals.currentUser = req.user;
  next();
});

/** --- Tabellen laden --- */
let tablesByKey = Object.create(null);
let tablesMeta = Object.create(null); // { key: { mtimeMs, bytes } }

async function loadAllTables() {
  const map = Object.create(null);
  const meta = Object.create(null);

  await fsp.mkdir(DATA_DIR, { recursive: true });
  const files = (await fsp.readdir(DATA_DIR)).filter(f => f.endsWith(".json"));

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
const LoginSchema = z.object({
  username: z.string().min(3).max(64),
  password: z.string().min(6).max(256)
});
const RegisterSchema = z.object({
  username: z.string().min(3).max(64),
  password: z.string().min(12).max(256),
  inviteCode: z.string().min(6).max(256)
});
const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(6).max(256),
  newPassword: z.string().min(12).max(256)
});
const InviteCreateSchema = z.object({
  role: z.enum(["user", "admin"]).optional(),
  expiresInHours: z.number().int().min(1).max(24 * 14).optional(),
  note: z.string().max(140).optional()
});
const UserUpdateSchema = z.object({
  role: z.enum(["user", "admin"]).optional(),
  locked: z.boolean().optional(),
  mustChangePassword: z.boolean().optional()
});
const ResetPasswordSchema = z.object({
  newPassword: z.string().min(12).max(256)
});
const AdminCreateUserSchema = z.object({
  username: z.string().min(3).max(64),
  password: z.string().min(12).max(256),
  role: z.enum(["user", "admin"]).default("user"),
  mustChangePassword: z.boolean().optional()
});

function setNoStore(res) {
  res.set("Cache-Control", "no-store, max-age=0");
  res.set("Pragma", "no-cache");
}

function ensureAuthenticated(req) {
  if (!req.session || !req.session.user) {
    return null;
  }
  const stored = userStore.getById(req.session.user.id);
  if (!stored || stored.locked) {
    return null;
  }
  const safe = userStore.toPublicUser(stored);
  if (!safe) {
    return null;
  }
  req.session.user = {
    id: safe.id,
    username: safe.username,
    role: safe.role,
    mustChangePassword: safe.mustChangePassword
  };
  req.user = req.session.user;
  return safe;
}

function requireAuth(req, res, next) {
  try {
    const safe = ensureAuthenticated(req);
    if (!safe) {
      return res.status(401).json({ error: "Anmeldung erforderlich." });
    }
    req.safeUser = safe;
    return next();
  } catch (err) {
    return next(err);
  }
}

function requireAdmin(req, res, next) {
  try {
    const safe = ensureAuthenticated(req);
    if (!safe) {
      return res.status(401).json({ error: "Anmeldung erforderlich." });
    }
    if (safe.role !== "admin") {
      return res.status(403).json({ error: "Administrationsrechte erforderlich." });
    }
    req.safeUser = safe;
    return next();
  } catch (err) {
    return next(err);
  }
}

/** Routen */
app.get("/api/health", (_req, res) => {
  setNoStore(res);
  res.json({ ok: true, ts: new Date().toISOString(), tables: Object.keys(tablesByKey) });
});

app.get("/api/auth/csrf", (req, res) => {
  setNoStore(res);
  res.json({ csrfToken: req.csrfToken() });
});

app.get("/api/auth/session", (req, res) => {
  setNoStore(res);
  const safe = ensureAuthenticated(req);
  if (!safe) {
    return res.json({ authenticated: false, user: null });
  }
  res.json({ authenticated: true, user: safe });
});

app.post("/api/auth/login", loginLimiter, (req, res, next) => {
  setNoStore(res);
  let payload;
  try {
    payload = LoginSchema.parse(req.body);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: "Ungültige Eingabe.", details: err.flatten() });
    }
    return next(err);
  }

  userStore.verifyCredentials(payload.username, payload.password)
    .then(result => {
      if (!result.ok) {
        if (result.reason === "locked") {
          return res.status(423).json({ error: "Benutzerkonto ist gesperrt. Bitte Administrator kontaktieren." });
        }
        return res.status(401).json({ error: "Benutzername oder Passwort ist ungültig." });
      }

      req.session.regenerate(err => {
        if (err) return next(err);

      req.session.user = {
        id: result.user.id,
        username: result.user.username,
        role: result.user.role,
        mustChangePassword: result.user.mustChangePassword
      };
      req.session.lastAuthAt = Date.now();
      req.session.save(saveErr => {
        if (saveErr) return next(saveErr);
        res.json({ user: result.user });
      });
      });
    })
    .catch(next);
});

app.post("/api/auth/logout", (req, res, next) => {
  setNoStore(res);
  if (!req.session) {
    return res.status(204).end();
  }
  req.session.destroy(err => {
    if (err) return next(err);
    res.clearCookie(SESSION_COOKIE_NAME, {
      httpOnly: true,
      sameSite: "strict",
      secure: SESSION_SECURE_COOKIE
    });
    res.status(204).end();
  });
});

app.post("/api/auth/register", registerLimiter, async (req, res, next) => {
  setNoStore(res);
  let data;
  try {
    data = RegisterSchema.parse(req.body);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: "Ungültige Eingabe.", details: err.flatten() });
    }
    return next(err);
  }

  try {
    const invite = inviteStore.getInvite(data.inviteCode);
    if (!invite) {
      return res.status(400).json({ error: "Einladungscode ist ungültig." });
    }
    if (invite.usedAt) {
      return res.status(400).json({ error: "Einladungscode wurde bereits verwendet." });
    }
    if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
      return res.status(400).json({ error: "Einladungscode ist abgelaufen." });
    }

    const user = await userStore.createUser({
      username: data.username,
      password: data.password,
      role: invite.role,
      createdBy: invite.createdBy || null,
      mustChangePassword: false
    });
    await inviteStore.consume(invite.code, user.username);

    req.session.regenerate(err => {
      if (err) return next(err);
      req.session.user = {
        id: user.id,
        username: user.username,
        role: user.role,
        mustChangePassword: user.mustChangePassword
      };
      req.session.lastAuthAt = Date.now();
      req.session.save(saveErr => {
        if (saveErr) return next(saveErr);
        res.status(201).json({ user });
      });
    });
  } catch (err) {
    if (err && err.code === "WEAK_PASSWORD") {
      return res.status(400).json({ error: err.message });
    }
    if (err && (err.code === "USERNAME_TAKEN" || err.message === "Benutzername bereits vergeben.")) {
      return res.status(409).json({ error: "Benutzername bereits vergeben." });
    }
    if (err && err.code === "INVALID_INVITE") {
      return res.status(400).json({ error: "Einladungscode ist ungültig." });
    }
    if (err && err.code === "INVITE_EXPIRED") {
      return res.status(400).json({ error: "Einladungscode ist abgelaufen." });
    }
    if (err && err.code === "INVITE_USED") {
      return res.status(400).json({ error: "Einladungscode wurde bereits verwendet." });
    }
    return next(err);
  }
});

app.post("/api/auth/change-password", requireAuth, async (req, res, next) => {
  setNoStore(res);
  let payload;
  try {
    payload = ChangePasswordSchema.parse(req.body);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: "Ungültige Eingabe.", details: err.flatten() });
    }
    return next(err);
  }

  try {
    const user = userStore.getById(req.session.user.id);
    if (!user) {
      await new Promise(resolve => req.session.destroy(() => resolve()));
      return res.status(401).json({ error: "Sitzung ungültig. Bitte erneut anmelden." });
    }
    const match = await verifyPassword(payload.currentPassword, user.passwordHash);
    if (!match) {
      return res.status(400).json({ error: "Aktuelles Passwort ist nicht korrekt." });
    }
    const updated = await userStore.setPassword(user.id, payload.newPassword, { updatedBy: user.id });
    req.session.user.mustChangePassword = updated.mustChangePassword;
    res.json({ user: updated });
  } catch (err) {
    if (err && err.code === "WEAK_PASSWORD") {
      return res.status(400).json({ error: err.message });
    }
    return next(err);
  }
});

app.get("/api/admin/users", requireAdmin, (req, res) => {
  setNoStore(res);
  res.json({ users: userStore.listUsers() });
});

app.post("/api/admin/users", requireAdmin, async (req, res, next) => {
  setNoStore(res);
  let payload;
  try {
    payload = AdminCreateUserSchema.parse(req.body);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: "Ungültige Eingabe.", details: err.flatten() });
    }
    return next(err);
  }

  try {
    const user = await userStore.createUser({
      username: payload.username,
      password: payload.password,
      role: payload.role,
      createdBy: req.session.user.id,
      mustChangePassword: payload.mustChangePassword !== false
    });
    res.status(201).json({ user });
  } catch (err) {
    if (err && err.code === "WEAK_PASSWORD") {
      return res.status(400).json({ error: err.message });
    }
    if (err && (err.code === "USERNAME_TAKEN" || err.message === "Benutzername bereits vergeben.")) {
      return res.status(409).json({ error: err.message });
    }
    return next(err);
  }
});

app.patch("/api/admin/users/:id", requireAdmin, async (req, res, next) => {
  setNoStore(res);
  let payload;
  try {
    payload = UserUpdateSchema.parse(req.body);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: "Ungültige Eingabe.", details: err.flatten() });
    }
    return next(err);
  }

  const target = userStore.getById(req.params.id);
  if (!target) {
    return res.status(404).json({ error: "Benutzer nicht gefunden." });
  }
  if (target.id === req.session.user.id && payload.role === "user") {
    return res.status(400).json({ error: "Eigene Administratorrechte können nicht entfernt werden." });
  }
  if (payload.locked && target.id === req.session.user.id) {
    return res.status(400).json({ error: "Sie können Ihr eigenes Konto nicht sperren." });
  }

  if (payload.role === "user") {
    const admins = userStore.listUsers().filter(u => u.role === "admin");
    if (admins.length <= 1 && target.role === "admin") {
      return res.status(400).json({ error: "Der letzte Administrator kann nicht herabgestuft werden." });
    }
  }
  if (payload.locked === true && target.role === "admin") {
    const admins = userStore.listUsers().filter(u => u.role === "admin" && u.id !== target.id && !u.locked);
    if (admins.length === 0) {
      return res.status(400).json({ error: "Der letzte aktive Administrator kann nicht gesperrt werden." });
    }
  }

  try {
    const updated = await userStore.updateUser(target.id, payload, { updatedBy: req.session.user.id });
    res.json({ user: updated });
  } catch (err) {
    return next(err);
  }
});

app.post("/api/admin/users/:id/reset-password", requireAdmin, async (req, res, next) => {
  setNoStore(res);
  let payload;
  try {
    payload = ResetPasswordSchema.parse(req.body);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: "Ungültige Eingabe.", details: err.flatten() });
    }
    return next(err);
  }

  const target = userStore.getById(req.params.id);
  if (!target) {
    return res.status(404).json({ error: "Benutzer nicht gefunden." });
  }
  try {
    const updated = await userStore.setPassword(target.id, payload.newPassword, {
      mustChangePassword: true,
      updatedBy: req.session.user.id
    });
    res.json({ user: updated });
  } catch (err) {
    if (err && err.code === "WEAK_PASSWORD") {
      return res.status(400).json({ error: err.message });
    }
    return next(err);
  }
});

app.delete("/api/admin/users/:id", requireAdmin, async (req, res, next) => {
  setNoStore(res);
  const target = userStore.getById(req.params.id);
  if (!target) {
    return res.status(404).json({ error: "Benutzer nicht gefunden." });
  }
  if (target.id === req.session.user.id) {
    return res.status(400).json({ error: "Eigenes Konto kann nicht gelöscht werden." });
  }
  if (target.role === "admin") {
    const admins = userStore.listUsers().filter(u => u.role === "admin" && u.id !== target.id);
    if (admins.length === 0) {
      return res.status(400).json({ error: "Der letzte Administrator kann nicht gelöscht werden." });
    }
  }
  try {
    await userStore.removeUser(target.id);
    res.status(204).end();
  } catch (err) {
    return next(err);
  }
});

app.get("/api/admin/invites", requireAdmin, (req, res) => {
  setNoStore(res);
  res.json({ invites: inviteStore.listInvites({ includeExpired: true }) });
});

app.post("/api/admin/invites", requireAdmin, async (req, res, next) => {
  setNoStore(res);
  let payload;
  try {
    payload = InviteCreateSchema.parse(req.body ?? {});
  } catch (err) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: "Ungültige Eingabe.", details: err.flatten() });
    }
    return next(err);
  }

  try {
    const invite = await inviteStore.createInvite({
      role: payload.role || "user",
      createdBy: req.session.user.id,
      expiresInHours: payload.expiresInHours ?? 72,
      note: payload.note || ""
    });
    res.status(201).json({ invite });
  } catch (err) {
    return next(err);
  }
});

app.delete("/api/admin/invites/:code", requireAdmin, async (req, res, next) => {
  setNoStore(res);
  try {
    await inviteStore.deleteInvite(req.params.code);
    res.status(204).end();
  } catch (err) {
    if (err && err.message === "Einladungscode nicht gefunden.") {
      return res.status(404).json({ error: err.message });
    }
    return next(err);
  }
});

app.get("/api/tables", requireAuth, apiLimiter, (_req, res) => {
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

app.get("/api/tables/:key", requireAuth, apiLimiter, (req, res) => {
  const key = req.params.key;
  const entry = getEntry(key);
  if (!entry) return res.status(404).json({ error: `Tabelle '${key}' nicht gefunden` });
  res.set("Cache-Control", "public, max-age=86400, immutable");
  res.json({ key, table: entry.table, atMin: entry.atMin });
});

app.post("/api/calc", requireAuth, apiLimiter, (req, res) => {
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

// Error handling
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({ error: "Ungültiges JSON im Request-Body." });
  }
  if (err && err.code === "EBADCSRFTOKEN") {
    return res.status(403).json({ error: "Ungültiges oder fehlendes CSRF-Token." });
  }
  console.error("[error]", err);
  res.status(500).json({ error: "Interner Serverfehler." });
});

if (require.main === module) {
  app.listen(PORT, "127.0.0.1", () => {
    console.log(`API listening on http://127.0.0.1:${PORT}`);
  });
}

module.exports = app;
