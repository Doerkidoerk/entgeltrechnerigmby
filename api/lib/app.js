"use strict";

const fs = require("fs");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const { z } = require("zod");
const { CalcInputSchema } = require("./schemas");
const { calculate, CalculationError } = require("./calculate");
const { version } = require("../package.json");

const passThrough = (_req, _res, next) => next();

function publicErrorMessage(err, status) {
  if (err.type === "entity.parse.failed") return "Ungültiger JSON-Body";
  if (err.type === "entity.too.large") return "Anfrage zu groß";
  if (status < 500) return err.expose ? err.message : "Ungültige Anfrage";
  return "Interner Serverfehler";
}

/**
 * Erzeugt die Express-App.
 *
 * @param {object} options
 * @param {import("./tables").TableStore} options.store  Quelle der Tariftabellen
 * @param {string|null} [options.frontendDir]  statisches Frontend mit ausliefern (Entwicklung)
 * @param {string[]} [options.allowedOrigins]  CORS-Allowlist
 * @param {boolean|number|string} [options.trustProxy]  Express-Einstellung "trust proxy"
 * @param {{windowMs: number, max: number}|null} [options.rateLimit]  null deaktiviert das Limit
 * @param {boolean} [options.logRequests]  HTTP-Zugriffslog via morgan
 */
function createApp({
  store,
  frontendDir = null,
  allowedOrigins = [],
  trustProxy = false,
  rateLimit: limits = null,
  logRequests = false,
  logger = console
}) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", trustProxy);

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
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
  app.use(cors({ origin: allowedOrigins, methods: ["GET", "POST"] }));
  app.use(express.json({ limit: "20kb" }));
  if (logRequests) app.use(morgan("combined"));

  const apiLimiter = limits
    ? rateLimit({
      windowMs: limits.windowMs,
      limit: limits.max,
      message: { error: "Zu viele Anfragen. Bitte später erneut versuchen." },
      standardHeaders: true,
      legacyHeaders: false
    })
    : passThrough;

  /** --- Routen --- */
  app.get("/api/health", (_req, res) => {
    const ok = store.size > 0;
    res.set("Cache-Control", "no-store");
    res.status(ok ? 200 : 503).json({ ok, version, ts: new Date().toISOString(), tables: store.keys() });
  });

  app.get("/api/tables", apiLimiter, (_req, res) => {
    const entries = store.list();
    res.set("Cache-Control", "public, max-age=300");
    res.json({
      keys: entries.map(e => e.key),
      tables: entries.map(({ key, label, validFrom }) => ({ key, label, validFrom })),
      meta: Object.fromEntries(entries.map(e => [e.key, e.meta]))
    });
  });

  app.get("/api/tables/:key", apiLimiter, (req, res) => {
    const entry = store.get(req.params.key);
    if (!entry) return res.status(404).json({ error: `Tabelle '${req.params.key}' nicht gefunden` });
    // Kurz cachen: Tabellen werden zur Laufzeit neu geladen, wenn sich die Dateien ändern
    res.set("Cache-Control", "public, max-age=300");
    const { key, label, validFrom, azubiHint, table, atMin } = entry;
    res.json({ key, label, validFrom, azubiHint, table, atMin });
  });

  app.post("/api/calc", apiLimiter, (req, res) => {
    const parsed = CalcInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Ungültige Eingabe", details: z.flattenError(parsed.error) });
    }
    try {
      res.json(calculate(parsed.data, key => store.getTable(key)));
    } catch (err) {
      if (!(err instanceof CalculationError)) throw err;
      res.status(err.status).json({ error: err.message });
    }
  });

  if (frontendDir && fs.existsSync(frontendDir)) {
    app.use(express.static(frontendDir));
  }

  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Endpunkt nicht gefunden" });
  });

  // Fehler immer als JSON beantworten, ohne interne Details preiszugeben
  app.use((err, _req, res, next) => {
    if (res.headersSent) return next(err);
    const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 600 ? err.status : 500;
    if (status >= 500) logger.error("[api]", err);
    res.status(status).json({ error: publicErrorMessage(err, status) });
  });

  return app;
}

module.exports = { createApp };
