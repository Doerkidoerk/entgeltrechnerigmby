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

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_DIR = path.join(__dirname, "data");
const TARIFF_ORDER = ["mai2024", "april2025", "april2026"]; // custom sort order
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "https://entgeltrechner.cbmeyer.xyz").split(",");

// Rate limiters
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
app.use(morgan("combined"));

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

/** Routen */
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, ts: new Date().toISOString(), tables: Object.keys(tablesByKey) });
});

app.get("/api/tables", apiLimiter, (_req, res) => {
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

app.get("/api/tables/:key", apiLimiter, (req, res) => {
  const key = req.params.key;
  const entry = getEntry(key);
  if (!entry) return res.status(404).json({ error: `Tabelle '${key}' nicht gefunden` });
  res.set("Cache-Control", "public, max-age=86400, immutable");
  res.json({ key, table: entry.table, atMin: entry.atMin });
});

app.post("/api/calc", apiLimiter, (req, res) => {
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
